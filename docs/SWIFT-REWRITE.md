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

---

## What is actually being rewritten

| | Lines | Fate |
|---|---|---|
| `src/game/**` — engine, day tick, shows, store slices | ~15,700 | **Ported.** Deterministic logic, sim-gated. This is the game. |
| `src/data/sets.json` — 23,475 cards | 2.4 MB | **Recompiled**, not ported. See *The catalog* below. |
| `src/components/**` + `src/ui/**` — 60 screens | ~18,500 | **Deleted and redesigned.** Not translated. |
| `src/styles.css` — 3,071 lines, 35 keyframes | 3,071 | **Deleted.** Replaced by system type, semantic colours, SwiftUI animation. |
| `ios/Sources/Shell.swift` | 688 | **Mined, then deleted.** `ArtSchemeHandler`'s disk cache and trim policy survive as a native image cache. |
| `scripts/sim.mjs` — 14 balance invariants | — | **Ported first, and kept in both languages** during the port. See *Proving the port*. |
| `aws/**` — Cognito + Lambda + DynamoDB | — | **Unchanged.** The backend stores an opaque blob; it does not care what wrote it. |

Roughly 40% of the codebase is worth porting, 55% is worth deleting, and 5% is the test harness
that makes the other 95% safe to touch.

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
That is not a detail — the bundle ID *is* the container, and the container is where the existing
save lives. Changing it strands every save on the device, exactly as `ios/README.md` warns.

Local Swift packages, so the engine can be tested and fuzzed without an app or a simulator:

```
PokeVendor.xcodeproj            (still XcodeGen — project.yml stays generated)
├── Packages/
│   ├── PVCatalog     — the compiled card catalog + O(1) lookups. No Foundation-heavy decode.
│   ├── PVEngine      — pure game logic. No SwiftUI, no UIKit, no Foundation date/locale.
│   ├── PVState       — GameState, actions, persistence, migrations, cloud sync.
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

### Persistence — Codable, not SwiftData

**Do not use SwiftData.** This is a single-document game with a deep value graph and a fifty-step
migration chain that already works. SwiftData wants a managed object graph, gives back
`@Model` reference semantics that fight the struct design above, and its migration story is
riskier than the one being replaced. Use `Codable` → binary plist → atomic
temp-file-and-rename into Application Support, written from a background actor, with one rolling
backup (today's `poke-vendor-save-prev`, kept).

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

There is no catalog field to strip because there was never one to write. Expect the save to get
several times smaller, and the cloud cap to stop being a design constraint.

**The invariant that survives:** a `CardID` in a save must keep resolving in the bundled catalog.
`sets.json` is append-mostly today and must stay that way. This is the same stake `slimsave.js`
and `cardById()` already raise; the Swift model raises it further, because a missing row now
costs the card its name *and* its art *and* its price rather than just its catalog extras. The
catalog compiler should fail the build if a set is removed rather than renamed.

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
evictable rather than heap. SQLite via GRDB is the acceptable fallback if the compiler turns into
a maintenance burden, at the cost of a query per lookup on a path that runs thousands of times
per pack rip.

`npm run fetch-data` keeps working exactly as it does; the compiler runs after it and is checked
into the build as a pre-build phase.

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
  Grading turnaround and a live stream are textbook Live Activities. *Caveat below.*
- **WidgetKit.** Cash, net worth, pending grades, next show — read from an App Group snapshot
  the app writes on each day advance. Lock Screen and Home Screen.
- **Share cards.** `ImageRenderer` on a SwiftUI card view → `ShareLink`. "Look what I pulled" as
  a real image into Messages, rather than the current share-sheet bridge that exists only to
  rescue a broken `a.download`.
- **Spotlight.** Donate owned cards as `CSSearchableItem`s: searching "Umbreon" from the home
  screen opens the card in the app. Cheap, and very hard to fake on the web.
- **Game Center.** `milestones.js` is already an achievement list in all but name, and net worth
  and masterset completion are leaderboards. Near-free once accounts exist.
- **Files and export.** `LSSupportsOpeningDocumentsInPlace`, `.fileExporter`, and the save is a
  real document the player can back up, mail themselves, and restore.

### Tier 3 — later, or if they earn it

- **App Intents / Shortcuts / Siri.** "Advance the day", "how much cash do I have".
- **iPad and Mac.** `NavigationSplitView`, keyboard shortcuts, pointer hover. The web app is
  iPhone-only by `TARGETED_DEVICE_FAMILY: "1"`; this is the phase that changes it.
- **Background tasks.** `BGProcessingTask` for cloud sync and art prefetch on charge.

### The notification caveat, stated plainly

**Game time is not wall time.** Days advance when the player taps Next Day, so "your grades are
back" cannot be scheduled against a clock. Most of the notification ideas a native rewrite
invites are therefore inapplicable here, and shipping them would mean either lying about time or
changing the game into an idle timer — a design change, not a port. What *is* legitimately
real-time: cloud-sync conflicts, and a Live Activity for the duration of a session (a stream, a
show) that ends when the session does. Everything else should stay out.

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
private storage format. Three paths, and the plan uses all three because losing a career is the
one unrecoverable failure here.

1. **Export from the web app now.** Add one bridge (`exportSaveForNative`) to the *current*
   shell, called on every launch, which writes the current save blob to
   `Application Support/legacy-save.json` in the container. Ship it as a normal update. By the
   time the Swift app exists, every launch of the old app has already left a native-readable copy
   behind. This is the belt.
2. **Headless read at first launch.** The Swift app hosts an off-screen `WKWebView` against the
   same origin and the same bundled `index.html`, reads IndexedDB through the existing test
   seam, hands the blob out, and marks the migration done. This is the braces, and it also covers
   a player who has not launched the app since (1) shipped.
3. **Cloud and file import.** ⚙️ → Account already holds a cloud copy keyed to the Cognito
   account, and the share-sheet backup is a JSON file. Both become explicit "Import save" paths
   in the Swift app.

The importer runs the JS migration chain's *end state* — it targets the current save version and
refuses anything older with a message telling the player to open the old build once. It writes
the Swift format, keeps the legacy blob untouched, and is tested against real saves at several
collection sizes. **Nothing else in Phase 0 is allowed to land until a golden save round-trips
into Swift and back out with an identical state hash.**

Cloud sync keeps the AWS backend as-is. The Lambda stores opaque bytes and enforces a `savedAt`
compare-and-swap; the native client ports `auth.js`'s Cognito JSON-RPC to `URLSession` (it is
plain `fetch` against documented endpoints — no SDK needed there either) and keeps the exact CAS
semantics, including the 409-fork block. Bump the schema version in the pushed envelope so an old
web build refuses a native save rather than half-reading it.

**CloudKit is a one-way door.** It is free, needs no Lambda, and syncs across a player's devices
automatically — and it permanently ties saves to an Apple ID and forecloses ever shipping this
anywhere but Apple platforms. Recommendation: keep AWS through Phase 5, and only consider
CloudKit once the AWS path has proven redundant. Sign in with Apple *on top of* Cognito is the
cheap middle ground.

---

## Phases

Each phase ends with something installable on the phone. The old web app rides along as a
`LegacyWebScreen` behind a Settings toggle from Phase 3 until Phase 6 deletes it.

| # | Phase | Exit criterion |
|---|---|---|
| **0** | **Foundations & proof.** SPM packages, catalog compiler, seeded PRNG in *both* engines, the cross-engine differ, the save exporter shipped in the current app. | Differ green on twenty seeds for pack opens and pricing. A golden save round-trips. |
| **1** | **Engine port.** In dependency order: catalog/pricing → `constants`/`initialState` → `collection`/`selling`/`sourcing` → `booth`/`shows` → `livestream`/`socials` → `books`/`tax`/`loans`/`market` → `daytick`. | All fourteen sim invariants green in Swift. 500-day golden-save diff clean. |
| **2** | **State & persistence.** `GameStore`, Codable save, atomic writes, the legacy importer, Cognito + cloud sync with CAS. | A career imported from the web app plays, saves, force-quits, relaunches and syncs. |
| **3** | **First playable slice.** App skeleton, tab structure, and Buy → Rip → Collection built *natively and properly* — Metal holos, CoreHaptics, gesture-driven tear, `List` inventory, card sheet with detents. | The rip feels better on the phone than the web version. This is the go/no-go for the whole rewrite. |
| **4** | **The rest of the game**, one tab per milestone: Sell/Store → Shows → Socials/Stream → You (career, binders, grader, upgrades) → Misc/Settings/Account. | Feature parity with the web app, screen by screen; legacy screen unused. |
| **5** | **Native surface.** Live Activities, widgets, Spotlight, Game Center, share cards, Files, App Intents. | Each ships behind its own flag and is judged on whether it earns its place. |
| **6** | **Retire the web app.** Delete `src/`, `index.html`, `vite.config.js`, the Vite tooling, `dist` bundling in `project.yml`, `Shell.swift`, `tools/ios/web.mjs`. Accessibility pass, Instruments pass, iPad. | Cold launch under 400 ms, 120 Hz scrolling on every list, accessibility audit clean, `package.json` down to the data-fetch scripts. |

Phases 0–2 are engine and infrastructure work with no visible result, which is the hardest part
of the plan to stick to and the part that determines whether the rest is safe. Phase 3 is the
first honest verdict: if the native rip is not obviously better, the remaining phases should be
reconsidered rather than pushed through.

### What survives into the Swift repo

`scripts/fetch-data.mjs` and its siblings, `aws/`, `src/data/sets.json`, `docs/`, and the
`tools/ios/device.mjs` signing workflow (which solves several real and badly-documented
problems). Node stays in the repo as a data pipeline; it stops being the app.

---

## Risks and one-way doors

| Risk | Mitigation |
|---|---|
| **Silent economy drift in the port** | The differ, and the sim suite ported before any UI. Byte-identical or it is not done. |
| **Bundle ID change strands every save** | Same target, same bundle ID, forever. Written into `project.yml`'s comments already. |
| **Catalog format churn breaks old saves** | Compiler fails the build on a removed set; `CardID` resolution is a tested invariant. |
| **Catalog decode tanks launch** | mmap, never `JSONDecoder`. Measured in Phase 0, not assumed. |
| **The rewrite stalls half-done** | Every phase ships to the device; the legacy web screen means a half-finished Swift app is never a broken app. |
| **CloudKit adopted early** | Deferred past Phase 5 on purpose. |
| **Scope creep into design changes** | Phases 1–4 are a port. New systems wait for Phase 6+. The notification section above is the model: say no to native features that would change the game. |

---

## Open decisions

These change the shape of the plan, and none of them is blocking Phase 0:

1. **Save compatibility with the web app — one-way or two-way?** The plan assumes one-way (native
   reads the legacy save; the old build never reads a native one). Two-way costs a serialiser on
   both sides and is only worth it if the web app is meant to keep running somewhere.
2. **Is the AWS backend staying?** Keeping it preserves any future non-Apple client and costs a
   ported `auth.js`. Moving to CloudKit deletes the Lambda, the table and the Cognito pool — and
   the option.
3. **iPad and Mac: in scope, or explicitly not?** It changes layout decisions from Phase 3
   onward, not from Phase 6, if the answer is yes.
4. **Catalog store: compiled mmap file (recommended) or SQLite/GRDB?** The first is faster and
   has no dependency; the second is less code to own.
5. **Is a Phase 3 verdict acceptable as a real stop point?** If the rewrite is going to happen
   regardless of how the native rip lands, the go/no-go gate should be dropped from the plan
   rather than pretended at.
