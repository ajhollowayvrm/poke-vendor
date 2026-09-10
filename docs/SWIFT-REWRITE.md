# Rewriting PokéVendor in Swift

> Status: **plan, not yet started** (2026-09-10). Nothing in this document has shipped. Written
> against `ebee488`. Every line count and file reference in it is a fact about that commit —
> re-measure before quoting it.

The app today is ~40,000 lines of JavaScript rendered by React inside a WKWebView that
[`ios/`](../ios/README.md) wraps. The shell has already fixed the four things a web page cannot do
on an iPhone (zoom, origin, haptics, downloads). This document is about the fifth thing, which no
shell can fix: **it still feels like a web page.** A `<div>` that scrolls is not a `List`. A CSS
transition is not a spring. A modal is not a sheet with detents. And the whole native surface an
iPhone offers — Live Activities, widgets, Spotlight, Metal shaders, Game Center, share
extensions — is unreachable from inside the web view.

The work orders that execute this plan — 43 of them, in dependency order, each with an exit
condition — are in [SWIFT-REWRITE-TASKS.md](SWIFT-REWRITE-TASKS.md). This document is the *why*;
that one is the *what, in what order*.

## Decisions taken

Five questions shaped this plan and all five are settled. They are recorded here because each one
deletes work, and a later reader should know the deletions were deliberate.

| | Decision | What it removes |
|---|---|---|
| **Saves** | **On-device only, migrated one way.** The Swift app reads the legacy save; the web build never reads a native one. | Two-way serialisation, a shared schema, and any obligation to keep the web app loadable after Phase 6. |
| **Backend** | **AWS goes.** No accounts, no cloud save, no price proxy. | `aws/` (Cognito, Lambda, DynamoDB), `auth.js`, `cloudSave.js`, `syncConfig.js`, `Account.jsx`, the sign-in/conflict/quota UI, and the 350 KB save cap that `slimsave.js` exists to stay under. |
| **iPad / Mac** | **Out of scope.** iPhone only, portrait, as today. | `NavigationSplitView`, size-class branching, pointer and keyboard affordances, `TARGETED_DEVICE_FAMILY: "1,2"`. |
| **Catalog** | **A compiled, memory-mapped file.** Reasoning below. | A SQLite dependency and a query on the hottest lookup path in the app. |
| **Scope** | **All six phases.** The native feel is the point; the hybrid stop is not a planned outcome. | The Phase 3 go/no-go. Phase 3 now sets the quality bar for Phase 4 instead of deciding whether Phase 4 happens. |

---

## What is actually being rewritten

| | Lines | Fate |
|---|---|---|
| `src/game/**` — engine, day tick, shows, store slices | 18,226 | **Ported.** Deterministic logic, sim-gated. This is the game. |
| `src/data/sets.json` — 23,475 cards | 2.4 MB | **Recompiled**, not ported. See *The catalog* below. |
| `src/components/**` + `src/ui/**` + `App.jsx` — 64 files | 17,956 | **Deleted and redesigned.** Not translated. |
| `src/styles.css` — 3,071 lines, 35 keyframes | 3,071 | **Deleted.** Replaced by system type, semantic colours, SwiftUI animation. |
| `src/game/auth.js` · `cloudSave.js` · `syncConfig.js` · `Account.jsx` | ~1,030 | **Deleted.** The backend is going. |
| `aws/**` — Cognito + Lambda + DynamoDB | — | **Deleted**, and the stack torn down. |
| `ios/Sources/Shell.swift` | 688 | **Mined, then deleted.** `ArtSchemeHandler`'s disk cache and trim policy survive as a native image cache. |
| `scripts/sim.mjs` — 14 balance invariants | — | **Ported first, and kept in both languages** during the port. See *Proving the port*. |

Counted rather than estimated, at `ebee488`: `src/game/**` is 19,190 lines, of which 964 are the
deleted backend and storage shims, leaving **18,226 to port**; the UI is **17,956** plus 3,071 lines
of CSS to delete. So it is closer to a even split than a 40/55 one, and the ported half is the
half with all the risk in it.

### The honest caveat

A rewrite is not free and this one is not small: the engine alone is `engine.js` (4,028),
`daytick.js` (2,397), `shows.js` (2,249), `booth.js` (1,377) and eight more slices, all of it
tuned by measurement rather than derivation. **The risk is not that Swift is hard. The risk is
that a subtly different port silently re-tunes an economy that fourteen Monte-Carlo invariants
currently hold in place.** Phase 0 exists entirely to remove that risk before a line of UI is
written, and Phase 6 is the only point at which the JavaScript is deleted. If the cross-engine
differ in Phase 0 cannot be made to agree, that is the signal to stop and keep the shell.

The plan is therefore staged so that **the app is installable and playable on the phone at the
end of every phase**, with the old web app embedded as a fallback screen until parity. There is
no big-bang cutover.

---

## Architecture

One Xcode project, one target, **the same bundle ID as today** (`com.ajholloway.pokevendor`).
That is not a detail — the bundle ID *is* the container, and the container is where the save
lives. Changing it strands every save on the device, exactly as `ios/README.md` warns, and with
no cloud copy to restore from that is now unrecoverable rather than merely painful.

Local Swift packages, so the engine can be tested and fuzzed without an app or a simulator:

```
PokeVendor.xcodeproj            (still XcodeGen — project.yml stays generated)
├── Packages/
│   ├── PVCatalog     — the compiled card catalog + O(1) lookups. No decode at launch.
│   ├── PVEngine      — pure game logic. No SwiftUI, no UIKit, no dates, no locale.
│   ├── PVState       — GameState, actions, persistence, the legacy importer.
│   └── PVKit         — shared UI atoms: card views, money formatting, haptics, image cache.
└── App/              — SwiftUI feature modules, one folder per tab.
```

**Deployment target: the current major iOS.** This app installs on one phone via a personal
provisioning profile. There is no back-compat tax to pay and no reason to pay it, so the newest
navigation, animation and Observation APIs are all fair game.

### State

`GameState` is a **struct**, not a class graph. Every existing slice becomes an extension:

```swift
@MainActor @Observable final class GameStore {
    private(set) var state: GameState        // value type — snapshot, diff and undo are free
    private var rng: SeededGenerator          // replaces every bare Math.random()
}

extension GameStore {   // one file per today's slice
    func quickSell(_ uid: CardUID) { ... }    // collection.js
    func nextDay() -> DaySummary { ... }      // economy.js → daytick.swift
}
```

Three things fall out of the value type that the Zustand store cannot have:

- **Undo.** A snapshot is a copy. "Undo that quick-sell" becomes possible.
- **A real day-tick test.** `daytick(state, rng) -> state` is a pure function of two values.
- **No debounced-save machinery.** Today `store/index.js` carries ~200 lines of debouncing,
  quota handling and disposable-key eviction because `persist` re-serialises the entire game on
  every `set()` mid-animation. A struct is diffed and written on a background actor; the whole
  problem class goes away.

### Persistence — Codable, on device, no server

**Do not use SwiftData.** This is a single-document game with a deep value graph and a fifty-step
migration chain that already works. SwiftData wants a managed object graph, gives back `@Model`
reference semantics that fight the struct design above, and its migration story is riskier than
the one being replaced. Use `Codable` → binary plist → atomic temp-file-and-rename into the app's
Documents directory, written from a background actor, with one rolling backup (today's
`poke-vendor-save-prev`, kept).

The [slim-save trick](../src/game/store/slimsave.js) **disappears by construction**. It exists
because `engine.instance()` spreads the whole catalog row onto every owned card, so the save was
storing the app's own data back to itself — 1.3 MB for a 6,000-card collection, and a hard wall
at ~7,500 cards where the cloud's 350 KB item cap is hit. In Swift a card instance is:

```swift
struct CardInstance: Codable, Identifiable {
    let uid: UID
    let cardID: CardID          // index into PVCatalog. Name, art, rarity, price live there.
    var condition: Condition
    var grade: Grade?
    var cut: Float              // the hidden 0..1 cut-quality score, 4dp as today
    var location: StockLocation
    // …and nothing the catalog already knows
}
```

There is no catalog field to strip because there was never one to write. With the cloud cap gone
as well, save size stops being a design constraint at all.

**The invariant that survives:** a `CardID` in a save must keep resolving in the bundled catalog.
`sets.json` is append-mostly today and must stay that way. This is the same stake `slimsave.js`
and `cardById()` already raise; the Swift model raises it further, because a missing row now
costs the card its name *and* its art *and* its price rather than just its catalog extras. The
catalog compiler fails the build if a set is removed rather than renamed.

### Where the backup lives, now that there is no cloud

Removing AWS removes the only copy of a save that survives the phone. Three things replace it,
and they are worth more attention than the cloud path ever got, because free provisioning makes
losing the container *routine*: `ios/README.md` already documents that a free profile allows three
sideloaded apps and that deleting one to make room deletes its container with it.

- **iOS device backup.** The Documents directory is included in iCloud and Finder backups by
  default. That is free, automatic, and the reason the save goes in Documents rather than
  Application Support. Do not set `isExcludedFromBackup`.
- **Files visibility.** `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace`, so the save
  is a real document the player can see, copy out, and drop back in from the Files app.
- **An explicit export.** `ShareLink` on the save document, and a matching importer — the same
  pair the crash screen's backup button has always wanted to be, now working properly rather than
  routed around `a.download` being inert.

If device-to-device sync is ever wanted again, iCloud Drive's ubiquity container is the
zero-server way to get it. **It is not in this plan**, and it should not be added casually: it
ties saves to an Apple ID permanently.

### One consequence of dropping the backend, stated plainly

`engine.js` uses the Lambda for two things, not one: cloud saves, and a **cached price proxy**
(`fetchCachedPrices`, `warmPricesOnBoot`). Losing it does not cost live prices — `refreshPrices`
already falls back to `api.pokemontcg.io` directly, with no key and no auth, and that path ports
as-is. What is lost is the proxy's shared cache and its rate-limit headroom, so an in-app refresh
becomes a slower, per-set walk over the public API. Given that `npm run fetch-data` reships the
snapshot on every build anyway, the honest options are to keep the direct refresh as a Settings
action, or to drop runtime refresh entirely and let prices move only when the app updates.
Recommendation: keep it, make it manual, and never call it on boot.

### The catalog

2.4 MB of JSON, 23,475 cards. `docs/PERFORMANCE.md` measures `JSON.parse` at ~16 ms plus ~14 ms
of index building — about 17% of a 177 ms boot. **`JSONDecoder` over the same file will be
considerably worse than JavaScript's parser, not better**, and decoding 23k `Codable` structs at
launch is exactly the kind of thing that turns a native app's launch into a spinner.

So do not decode it at all. A build-time tool (`Tools/catalog-compile`) turns `sets.json` into:

- a flat, fixed-stride record file of card rows, sorted by id, memory-mapped at launch;
- a sorted id table for binary-search lookup (`cardByID` today is a `Map` built at boot);
- a string pool for names and URLs;
- the derived indexes `engine.js` builds eagerly — `SHOP_SETS`, `VINTAGE_SETS`, `JP_CARD_SETS`,
  `MARKETPLACE_CARDS`, `cardsByRarity` — precomputed as id ranges.

Boot cost becomes an `mmap` and a header read: effectively zero, and the pages are shared and
evictable rather than heap.

**Why this over SQLite/GRDB.** SQLite is less code to own, and that is a real argument. It loses
on the access pattern: this catalog is read-only, ships with the binary, and is hit thousands of
times per pack rip through `cardById`, `rawValue` and `cardsByRarity` — a prepared statement and a
row decode per lookup, against a struct read straight out of a mapped page. The dependency also
buys nothing else here; there are no queries, no writes, no schema evolution at runtime. The
tripwire for revisiting: if the compiler grows past ~500 lines, or if the catalog ever needs to be
written to at runtime, take SQLite and the query cost.

`npm run fetch-data` keeps working exactly as it does; the compiler runs after it, as a pre-build
phase.

---

## Proving the port

This is the part of the plan that matters most, and the part it would be most tempting to skip.

**1. Seed both engines.** One PR against the *current* JavaScript, before any Swift is written:
replace every bare `Math.random()` with an injected generator. Most of the engine already takes
`rnd = Math.random` as a parameter (`instance`, `openPack`, `applyPackMisprint`,
`vintageCardInRange`, `driftMult`, `rollBuyerSavvy` — the pattern is established); this finishes
the job and threads a seeded PRNG through the store. Use a PRNG that is trivially reimplementable
in both languages — SplitMix64 or PCG32, twenty lines each, bit-identical output.

**2. Build a cross-engine differ** (`Tools/differ`). Given a seed, drive the JS engine under
`vite-node` and the Swift engine as a CLI over the same script of actions, and diff:

| Compared | Why this one |
|---|---|
| 10,000 pack opens per set | the hit ladder is the game's core distribution |
| `cardValue` / `gradedValue` over the whole catalog | pricing feeds every other system |
| 500 simulated days from a golden save, state hashed each day | catches drift in `daytick.js`, the biggest file after the engine |
| grading submissions across every tier | the `_cut` nudge is a ±0.08 subgrade effect that a rounding difference could erase |

**Exit criterion for Phase 1: byte-identical output on every one of those, for twenty seeds.**
Not "close". Identical. Where a difference is deliberate (a fixed bug), it gets a named exception
in the differ with a comment, and the JS side is fixed too so the list stays short.

**3. Port `sim.mjs` to Swift Testing.** All fourteen sections, running against `PVEngine`
directly — no browser, no dev server, milliseconds instead of a minute. It becomes a test target
that runs on every build rather than a script somebody remembers to run.

**4. `verify-ui.mjs` is replaced by the platform.** Its checks — 44 pt tap targets, a 12 px type
floor, contrast, text clipped out of its box, headings — are all things
`XCUIApplication.performAccessibilityAudit()` checks natively, and most of them stop being
possible at all once controls are real controls and type is Dynamic Type. Keep the *idea* (a
measured floor, not a checklist) and delete the 700 lines of Playwright.

---

## The native surface — what this is all for

Ordered by how much each one changes the feel per unit of work.

### Tier 1 — the reason to do the rewrite

**The rip.** `PackOpening.jsx` (797 lines) + `HoloCard.jsx` + `Burst.jsx` + fifteen keyframes is
the app's signature moment, and it is a CSS approximation of a physical object.

- **Holo foils become Metal.** SwiftUI `.colorEffect`/`.layerEffect` shaders over the card art,
  driven by **CoreMotion device attitude**, so a Special Illustration Rare shifts as you tilt the
  phone. This is the single thing in the app that is impossible on the web and instantly legible
  as native. Per-rarity shader variants map onto the existing `FOIL` table in `engine.js`.
- **CoreHaptics, not canned generators.** Today `native.js` reverse-engineers intent from
  `navigator.vibrate` millisecond patterns and picks one of nine `UIFeedbackGenerator` calls. A
  pack tear is a *continuous* haptic with a sharpness ramp and a transient at the end; a god pack
  is an authored AHAP. Write the patterns, delete the translation layer.
- **Springs and interruptible gestures.** The tear becomes a real drag with rubber-banding and
  velocity, cards fan with `.scrollTransition`, the card→detail push uses the zoom navigation
  transition, and every one of them is interruptible mid-flight. CSS animations are not.
- **`.sensoryFeedback`** for the thousand mundane taps that currently route through the bridge.

**Lists that behave like lists.** Every inventory screen — `StoreStock.jsx` (793),
`Collection.jsx`, `SealedInventory.jsx`, `BoothInbox.jsx` (841) — becomes a `List` with:
swipe actions (quick-sell, list, lock, send to grade), `.contextMenu` with a card preview,
edit-mode multi-select for the bulk operations that today need bespoke selection UI,
`.searchable` with scopes and tokens replacing the hand-rolled filter bars, section index titles
for sets, and drag-and-drop of cards into binders. Several hundred lines of `.jsx` per screen
become a `ForEach` and a modifier stack.

**Type, colour and motion from the system.** The six-step type scale in `styles.css` with its
documented 12 px floor and its one documented exemption exists because the app had to invent
what iOS ships. `Font.body` scales to accessibility sizes for free, and text stops clipping
because `List` rows grow. The app is `UIUserInterfaceStyle: Dark` today — **light mode is part of
feeling native**, and semantic colours in an asset catalog give it for the cost of one pass.
Honour Reduce Motion on the rip (a static reveal, not a broken one).

### Tier 2 — high value, small surface

- **Live Activities + Dynamic Island.** The state already carries `readyOnDay` for
  `pendingGrades` and `pendingSealed`, a `streamEscrow` that means ON AIR, and an `activeShow`.
  A live stream and a show are textbook Live Activities. *Caveat below.*
- **WidgetKit.** Cash, net worth, pending grades, next show — read from an App Group snapshot
  the app writes on each day advance. Lock Screen and Home Screen.
- **Share cards.** `ImageRenderer` on a SwiftUI card view → `ShareLink`. "Look what I pulled" as
  a real image into Messages, rather than the current share-sheet bridge that exists only to
  rescue a broken `a.download`.
- **Spotlight.** Donate owned cards as `CSSearchableItem`s: searching "Umbreon" from the home
  screen opens the card in the app. Cheap, and very hard to fake on the web.
- **Game Center.** `milestones.js` is already an achievement list in all but name, and net worth
  and masterset completion are leaderboards. It is also the *only* remaining piece of
  off-device state in the plan, and it costs no server — worth having precisely because the
  backend is gone.
- **Files and export.** Covered under backup above, and load-bearing now rather than a nicety.

### Tier 3 — later, or if they earn it

- **App Intents / Shortcuts / Siri.** "Advance the day", "how much cash do I have".
- **Background tasks.** `BGProcessingTask` for art prefetch on charge.

iPad and Mac are **out of scope by decision**, not deferred. `TARGETED_DEVICE_FAMILY` stays `"1"`,
portrait stays locked, and every layout may assume one width class. That assumption is worth real
time across sixty screens; revisiting it later means revisiting all of them.

### The notification caveat, stated plainly

**Game time is not wall time.** Days advance when the player taps Next Day, so "your grades are
back" cannot be scheduled against a clock. Most of the notification ideas a native rewrite
invites are therefore inapplicable here, and shipping them would mean either lying about time or
changing the game into an idle timer — a design change, not a port. What *is* legitimately
real-time is a Live Activity for the duration of a session (a stream, a show) that ends when the
session does. Everything else should stay out. With the cloud gone there is no sync-conflict
notification either, which was the one wall-clock event the app used to have.

### Image loading

`ArtSchemeHandler` is the best thing in `Shell.swift` and it survives, minus the scheme. A
native `ImageCache` actor over `URLSession` keeps the same on-disk layout and the same trim
policy, and gains two things WKWebView cannot give: **ImageIO downsampling to the display size**
(a card thumbnail is not a 745×1040 decode, which is most of the app's memory today) and real
prefetch priorities driven by scroll position. `pvimg://`, `viaShell()` and the set-logo URL
rewriting in `engine.js` all delete.

---

## Migrating the save — Phase 0, and non-negotiable

The existing save is in the WKWebView's IndexedDB under the `pokevendor://local` origin, inside
the app container. A Swift app in the same container cannot read it directly: it is WebKit's
private storage format. **Migration is one-way and runs once.** Two paths, because there is no
cloud copy to fall back on any more and losing a career is now unrecoverable.

1. **Export from the web app now.** Add one bridge (`exportSaveForNative`) to the *current*
   shell, called on every launch, which writes the current save blob to
   `Documents/legacy-save.json` in the container. Ship it as a normal update. By the time the
   Swift app exists, every launch of the old app has already left a native-readable copy behind.
   This is the belt, and it is the reason this bridge is Phase 0 work and not Phase 2 work.
2. **Headless read at first launch.** The Swift app hosts an off-screen `WKWebView` against the
   same origin and the same bundled `index.html`, reads IndexedDB through the existing test seam,
   hands the blob out, and marks the migration done. This is the braces, and it covers a player
   who has not launched the app since (1) shipped.

A third path exists for free once the export/import pair in *Where the backup lives* is built: a
JSON backup taken from the old app's share sheet can be imported by hand.

The importer targets the current save version and refuses anything older with a message telling
the player to open the old build once — it does not reimplement the fifty-step migration chain.
It writes the Swift format, keeps the legacy blob untouched, and is tested against real saves at
several collection sizes. **Nothing else in Phase 0 lands until a golden save round-trips into
Swift and back out with an identical state hash.**

---

## Phases

Each phase ends with something installable on the phone. The old web app rides along as a
`LegacyWebScreen` behind a Settings toggle from Phase 3 until Phase 6 deletes it.

| # | Phase | Exit criterion |
|---|---|---|
| **0** | **Foundations & proof.** SPM packages, catalog compiler, seeded PRNG in *both* engines, the cross-engine differ, the save exporter shipped in the current app. | Differ green on twenty seeds for pack opens and pricing. A golden save round-trips. |
| **1** | **Engine port.** In dependency order: catalog/pricing → `constants`/`initialState` → `collection`/`selling`/`sourcing` → `booth`/`shows` → `livestream`/`socials` → `books`/`tax`/`loans`/`market` → `daytick`. | All fourteen sim invariants green in Swift. 500-day golden-save diff clean. |
| **2** | **State & persistence.** `GameStore`, Codable save, atomic writes, the legacy importer, Files/backup/export. | A career imported from the web app plays, saves, force-quits, relaunches, exports and re-imports. |
| **3** | **First playable slice.** App skeleton, tab structure, and Buy → Rip → Collection built *natively and properly* — Metal holos, CoreHaptics, gesture-driven tear, `List` inventory, card sheet with detents. | The native vocabulary exists and is written down, and the rip is the best thing in the app. Everything in Phase 4 is measured against it — see below. |
| **4** | **The rest of the game**, one tab per milestone: Sell/Store → Shows → Socials/Stream → You (career, binders, grader, upgrades) → Misc/Settings. | Feature parity with the web app, screen by screen; legacy screen unused. |
| **5** | **Native surface.** Live Activities, widgets, Spotlight, Game Center, share cards, App Intents. | Each ships behind its own flag and is judged on whether it earns its place. |
| **6** | **Retire the web app and the backend.** Delete `src/`, `index.html`, `vite.config.js`, the Vite tooling, `dist` bundling in `project.yml`, `Shell.swift`, `tools/ios/web.mjs`, and `aws/` — then tear the CloudFormation stack down. Accessibility pass, Instruments pass. | Cold launch under 400 ms, 120 Hz scrolling on every list, accessibility audit clean, `package.json` down to the data-fetch scripts. |

Phases 0–2 are engine and infrastructure work with no visible result, which is the hardest part
of the plan to stick to and the part that determines whether the rest is safe.

### Phase 3 sets the bar

There is no go/no-go here. **All six phases are happening, because the native feel is the point of
the exercise**, so this section is about what Phase 3 is *for* rather than what it decides.

Phase 3 builds one vertical slice — Buy → Rip → Collection — and its real output is not those
three screens. It is the **vocabulary the other fifty-nine are written in**, defined once, by
building something real rather than by writing a style guide against nothing. Five things come out
of it, and each one is a decision that Phase 4 then applies rather than re-litigates sixty times:

| Decided in Phase 3 | So that Phase 4 never argues about |
|---|---|
| **Type and colour.** The semantic colour set, in both appearances, and which Dynamic Type styles carry which roles. | What a card row's secondary text is. Whether this screen is dark-only. |
| **Motion.** The spring constants, which transitions are shared-element, what Reduce Motion does. | Whether this sheet slides or fades. |
| **The haptic language.** Which events are transients, which are continuous, what a "good thing happened" feels like versus a "big thing happened". | Whether a sale buzzes. |
| **The card component.** One `CardView` with its size variants, its holo shader hookup, its context menu, its accessibility label. | How a card is drawn — anywhere, ever. |
| **List idioms.** Which actions are swipes, which are context menus, which are edit-mode multi-select. | Where quick-sell lives on each of six inventory screens. |

Get this right and Phase 4 is application work: fast, parallelisable, and consistent by
construction. Get it wrong — or skip it and start on Sell — and Phase 4 becomes sixty screens each
inventing their own answer, which is precisely how `styles.css` grew a type ladder with 32 distinct
font sizes in it. **That failure has already happened once in this codebase**, and the cause was
not carelessness; it was that nobody defined the vocabulary before the screens needed one.

So the discipline for Phase 3 is: build the rip to a standard you would be happy to see on every
screen, then write down what you did. `docs/` gets a short design-vocabulary note out of this
phase, and it is a deliverable of the phase, not a nice-to-have after it.

**The one gate that remains is Phase 1's**, and it is a correctness gate rather than a taste one:
if the cross-engine differ cannot be made to agree, the port is wrong and no amount of native
polish fixes that.

### What survives into the Swift repo

`scripts/fetch-data.mjs` and its siblings, `src/data/sets.json`, `docs/`, and the
`tools/ios/device.mjs` signing workflow (which solves several real and badly-documented
problems). Node stays in the repo as a data pipeline; it stops being the app.

---

## Risks and one-way doors

| Risk | Mitigation |
|---|---|
| **Silent economy drift in the port** | The differ, and the sim suite ported before any UI. Byte-identical or it is not done. |
| **Bundle ID change strands every save** | Same target, same bundle ID, forever. With no cloud copy this is now unrecoverable, not merely painful. |
| **No off-device backup once AWS is gone** | Documents (so device backup covers it), Files visibility, and an export/import pair — all in Phase 2, not Phase 5. |
| **Deleting the app to free a sideload slot** | Free provisioning caps at three apps and deleting one deletes its container. Export before making room; this belongs in the Settings copy, not just in a doc. |
| **Catalog format churn breaks old saves** | Compiler fails the build on a removed set; `CardID` resolution is a tested invariant. |
| **Catalog decode tanks launch** | mmap, never `JSONDecoder`. Measured in Phase 0, not assumed. |
| **The rewrite stalls half-done** | Every phase ships to the device, and the legacy web screen means a half-finished Swift app is still a playable one. That is a safety net for an interruption, not a destination — the plan is to run all six phases. |
| **iCloud Drive adopted "just for sync"** | Explicitly out of plan. It ties saves to an Apple ID permanently. |
| **Scope creep into design changes** | Phases 1–4 are a port. New systems wait for Phase 6+. The notification section is the model: say no to native features that would change the game. |
