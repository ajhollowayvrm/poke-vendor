# Swift rewrite — execution plan

> Status: **ready to hand off** (2026-09-10). The *why* is in
> [SWIFT-REWRITE.md](SWIFT-REWRITE.md); this file is the *what, in what order*. Written against
> `ebee488`. Line counts are measured, not estimated.

This is a catalogue of **work orders**. Each one is scoped to roughly a single working session,
names the files it touches, and ends in a condition somebody else can check. They are meant to be
handed to a Claude Code session on a Mac, one at a time, with the handoff prompt at the bottom of
this file.

## Before anything

| Need | Why |
|---|---|
| **macOS + Xcode**, current | Everything from WO-03 on. There is no Swift toolchain in the web/Linux sessions and swift.org is blocked there, so those sessions can only run WO-01, WO-02a and the JS half of WO-05. |
| `xcodegen` (`brew install xcodegen`) | `ios/project.yml` stays the source of truth; the `.xcodeproj` is generated and never committed. |
| Node 22 | The data pipeline and the differ's JS side. |
| An iPhone + the `ios:device` flow | `tools/ios/device.mjs` already solves the signing traps documented in `ios/README.md`. Read that file before the first install, not after. |

## Rules of the port

These apply to every work order in Phases 0–4 and exist because the failure mode is silent.

1. **Port behaviour, not opinion.** A bug found mid-port gets *ported faithfully*, then fixed in a
   separate commit against both engines, with the differ's exception list naming it. Fixing it
   inline makes the differ red and you will not know which half is wrong.
2. **Keep the names.** `notoriety` stays `notoriety` even though the UI calls it Reputation
   (`initialState.js` documents why). A rename mid-port turns a diff into an archaeology exercise.
3. **The differ is truth.** Not the tests, not the reading of the code. If they disagree with the
   differ, the differ is right and the port is wrong.
4. **No new systems until Phase 6.** Feature ideas go in a list at the bottom of this file.
5. **Match the house comment style.** This codebase explains *why*, at length, at the point of the
   decision. The Swift should read like the JavaScript it replaces — see `slimsave.js` or
   `ios/README.md` for the register.

---

## Phase 0 — Foundations & proof

| WO | Title | Needs Mac | Depends on |
|---|---|---|---|
| **01** | Seed the JS engine | no | — |
| **02a** | `exportSaveForNative` — JS half | no | — |
| **02b** | `exportSaveForNative` — shell half | yes | 02a |
| **03** | Repo skeleton: SPM packages + project.yml | yes | — |
| **04** | Catalog compiler + `PVCatalog` | yes | 03 |
| **05** | The cross-engine differ | yes | 01, 04 |

### WO-01 — Seed the JS engine
Replace every bare `Math.random()` in `src/game/**` with an injected generator, and thread a
seeded PRNG (SplitMix64) through the store so a whole session is reproducible from one seed.
Most of the engine already takes `rnd = Math.random` as a parameter — `instance`, `openPack`,
`applyPackMisprint`, `vintageCardInRange`, `driftMult`, `rollBuyerSavvy` — so this finishes an
established pattern rather than inventing one.
*Touches:* all of `src/game/**`, heaviest in `engine.js`, `daytick.js`, `shows.js`, `booth.js`.
*Done when:* `npm run sim` is green and unchanged in its conclusions; two runs from the same seed
produce byte-identical pull streams; `grep -rn 'Math.random' src/game` returns only the default
parameter bindings.

### WO-02a / 02b — Ship the save exporter into the app you play today
On every launch the current app writes its save blob to `Documents/legacy-save.json` in the
container, so a native-readable copy already exists before the Swift app does. 02a is the guarded
`native.js` wrapper and its call site; 02b is the `WKScriptMessageHandler` case in `Shell.swift`.
*Done when:* installing the current build on the phone leaves a readable `legacy-save.json`, and
its content round-trips back into the running game.
*Why this is Phase 0 and not Phase 2:* it only helps if it has been shipping for a while.

### WO-03 — Repo skeleton
Four local SPM packages (`PVCatalog`, `PVEngine`, `PVState`, `PVKit`) and an `App/` target, wired
into `ios/project.yml`. Same bundle ID. `PVEngine` must not link SwiftUI, UIKit, or anything that
reads a locale or a clock — enforce it with a test that fails on the import.
*Done when:* `npm run ios:project && xcodebuild` builds an empty app onto the simulator, and the
package tests run from the command line without Xcode.

### WO-04 — Catalog compiler
`Tools/catalog-compile` turns `src/data/sets.json` into a fixed-stride record file + sorted id
table + string pool, and `PVCatalog` memory-maps it. Precompute the indexes `engine.js` builds
eagerly: `SHOP_SETS`, `VINTAGE_SETS`, `SECONDARY_SETS`, `EXTRA_SETS`, `JP_SHOP_SETS`,
`JP_CARD_SETS`, `MARKETPLACE_CARDS`, `cardsByRarity`, `CARD_BY_ID`, `SET_BY_ID`.
*Done when:* every one of the 23,475 ids resolves to a row byte-identical to the JSON's, the
compiler fails the build if a set present in the previous snapshot has vanished, and launch cost
is a measured `mmap` + header read rather than a decode.

### WO-05 — The cross-engine differ
`Tools/differ` drives the JS engine under `vite-node` and a `PVEngine` CLI over the same seeded
action script, and diffs the four comparisons in SWIFT-REWRITE.md. Build it now, against an
almost-empty `PVEngine`, so that every Phase 1 order has something to run.
*Done when:* it runs, reports per-comparison, exits nonzero on any difference, and carries a
documented exception list that is currently empty.

---

## Phase 1 — Engine port

**One work order per module group, in dependency order. Every one ends with the differ green for
the surface it covers.** Sizes are the JS line counts being ported.

| WO | Group | Files | Lines |
|---|---|---|---|
| **06** | Pricing core | `population.js`, `misprints.js`, `sealedgrading.js`, + `engine.js` pricing half (`rawValue`, `gradedValue`, `cardValue`, `cardPopulation`, `psaComp`, market mults, drift, events) | ~1,700 |
| **07** | Pack composition | `engine.js` remainder: `openPack`, `pullOdds`, `SET_RATES`, `FOIL`, `instance`, `CONDITIONS`, misprint application, the value-range pickers | ~2,300 |
| **08** | Foundations | `store/constants.js`, `store/initialState.js`, `store/helpers.js`, `store/ids.js`, `milestones.js` | 1,244 |
| **09** | Collection | `store/collection.js`, `store/packs.js` | 1,061 |
| **10** | Selling & sourcing | `store/selling.js`, `store/sourcing.js`, `shelf.js`, `boothstock.js` | 1,031 |
| **11** | Shows & booth | `shows.js`, `store/booth.js` | 3,626 |
| **12** | Content & audience | `stream.js`, `store/livestream.js`, `content.js`, `store/socials.js`, `dms.js`, `rep.js` | 1,333 |
| **13** | Back office | `tax.js`, `loans.js`, `store/books.js`, `market.js`, `store/market.js`, `mysterypacks.js` | 1,296 |
| **14** | The day tick | `store/daytick.js`, `store/economy.js` | 2,816 |
| **15** | Sim suite | `scripts/sim.mjs` → Swift Testing, all 14 sections | — |

**WO-11 and WO-14 are the two that will hurt.** `shows.js` + `booth.js` is 3,626 lines of
encounter generation, floor competition and vendor behaviour; `daytick.js` is the single function
every system hangs off. Budget more than one session each, and split them at a natural seam
(WO-11a shows / WO-11b booth) rather than rushing.

*Exit for the phase:* all fourteen sim sections green in Swift, and a 500-day golden-save run
diffing clean against the JS engine on twenty seeds.

---

## Phase 2 — State, persistence, teardown

| WO | Title | Notes |
|---|---|---|
| **16** | `GameState` + `GameStore` | The struct, the `@Observable` store, actions as extensions mirroring today's slices. Codable → binary plist → atomic write from a background actor, one rolling backup. |
| **17** | The legacy importer | Reads `Documents/legacy-save.json`; falls back to the off-screen `WKWebView` IndexedDB read. Targets the current save version only and says so when refusing. Tested against real saves at several collection sizes. |
| **18** | Backup & export | Documents (not Application Support, so device backup covers it), `UIFileSharingEnabled`, `LSSupportsOpeningDocumentsInPlace`, `ShareLink` export + import. The Settings copy must mention that deleting the app deletes the save. |
| **19** | Backend teardown | Delete `aws/`, `src/game/auth.js`, `cloudSave.js`, `syncConfig.js`, `components/Account.jsx`; strip `SYNC_URL`/`getIdToken` from `engine.js`, keeping the direct `api.pokemontcg.io` refresh as a manual Settings action. Then `sam delete` the stack. |

*Exit:* a career imported from the web app plays, saves, force-quits, relaunches, exports and
re-imports with an identical state hash.

---

## Phase 3 — The vocabulary, built as a slice

**Order matters here.** WO-21 before WO-23 before WO-24: the vocabulary is defined, then proven on
the hardest screen, then applied to an ordinary one to check it survives contact.

| WO | Title | What it settles |
|---|---|---|
| **20** | App skeleton | Six tabs, `NavigationStack` per tab with typed paths, the `LegacyWebScreen` fallback behind a Settings toggle. |
| **21** | Design vocabulary + `CardView` | Semantic colours in both appearances, Dynamic Type role mapping, spring constants, transition rules, the haptic language, and one `CardView` with size variants, context menu and accessibility label. |
| **22** | Image cache | `ImageCache` actor over `URLSession`, keeping `ArtSchemeHandler`'s on-disk layout and trim policy, plus ImageIO downsampling and scroll-driven prefetch. |
| **23** | The rip | Metal holo shaders driven by CoreMotion attitude, per-rarity variants mapped to `FOIL`; authored CoreHaptics patterns; gesture-driven interruptible tear; the reveal. Replaces `PackOpening.jsx` (797), `HoloCard.jsx`, `Burst.jsx`, `HandReveal.jsx`, `AutoRip.jsx` (603). |
| **24** | Collection + card sheet | `List` with swipe actions, `.searchable` scopes, section index, edit-mode multi-select, card detail as a sheet with detents. |
| **25** | Buy | `Shop.jsx` (796), `LocalMarket.jsx`, `Cart.jsx`, `MarketIntel.jsx`, `SealedDealModal.jsx`. |
| **26** | Write it down | `docs/SWIFT-DESIGN-VOCABULARY.md`. A deliverable of this phase, not a follow-up. |

---

## Phase 4 — The rest of the game

Grouped by tab, sized by the JSX being replaced. **Not translated screen-for-screen** — the line
counts say how much behaviour is in there, not how much Swift to write.

| WO | Milestone | Components | JSX lines |
|---|---|---|---|
| **27** | Store — stock & counter | `StoreStock` 793, `StoreOverview` 177, `BulkBin` 169, `PackMachine` 120, `SetPriceList` 74, `SellStrips` 145, `QuoteCounter` 271, `CreditPanel` 113 | 1,862 |
| **28** | Store — inbox & people | `BoothInbox` 841, `StoreMessages` 314, `Encounter` 102, `Haggle` 156, `WantFulfill` 48, `Regulars` 92, `TownRivalry` 149 | 1,702 |
| **29** | Store — books & packs | `Books` 288, `StoreFinancials` 87, `MysteryPacks` 487 | 862 |
| **30** | Shows | `ShowFloor` 1038, `VendorBooth` 1062, `ShowPrep` 275, `Calendar` 185, `ShowDMs` 129 | 2,689 |
| **31** | Socials & stream | `Livestream` 1673, `Socials` 111, `Pulse` 95, `Feed` 161, `DMs` 76 | 2,116 |
| **32** | You | `Binder` 416, `BinderPicker` 149, `Bench` 277, `Career` 323, `UpgradeShop` 101, `SealedInventory` 225, `SealedModal` 329, `GradeReveal` 99 | 1,919 |
| **33** | Misc & chrome | `Settings` 397, `DaySummary` 216, `FirstRun` 106, `PriceChart` 60, `ErrorBoundary` 57 | 836 |

**WO-30 and WO-31 are the big ones** — `ShowFloor` + `VendorBooth` is 2,100 lines of the game's
second mode, and `Livestream` is the largest single component in the app. Split each in two.

*Exit:* the `LegacyWebScreen` toggle is never needed.

---

## Phase 5 — Native surface

One work order each, each judged on whether it earns its place: **34** Live Activities (stream +
show only — see the notification caveat), **35** WidgetKit + App Group snapshot, **36** share cards
via `ImageRenderer`, **37** Spotlight donation, **38** Game Center mapped onto `milestones.js`,
**39** App Intents.

## Phase 6 — Retire and polish

**40** Delete `src/`, `index.html`, `vite.config.js`, the Vite deps, the `dist` folder reference in
`project.yml`, `Shell.swift`, `tools/ios/web.mjs`, `tools/ios/sweep.mjs`, `scripts/verify-*.mjs`,
`scripts/sim.mjs`. **41** Accessibility audit pass (`performAccessibilityAudit` in an XCUITest over
every screen). **42** Instruments pass against the budget: cold launch under 400 ms, 120 Hz on
every list, and a memory figure that beats the WKWebView's. **43** Update `README.md` and
`ios/README.md` to describe an app rather than a shell.

---

## What can run in parallel

Most of this is a chain, but three seams open up:

- **WO-01/02a** (JavaScript) and **WO-03/04** (Swift skeleton) have nothing to say to each other.
- Inside Phase 1, **06 → 07** and **08** are independent until 09 needs both.
- Phase 4's seven milestones are independent of each other once Phase 3 lands the vocabulary.
  This is the only place in the plan where more agents genuinely means more speed.

## Handoff prompt

```
Read docs/SWIFT-REWRITE.md for the reasoning and docs/SWIFT-REWRITE-TASKS.md for the
work orders. Execute WO-NN only. Follow the five "Rules of the port" in the tasks doc —
in particular, port behaviour faithfully rather than fixing bugs inline, and treat the
cross-engine differ as truth over your own reading of the code.

Stop when the work order's "done when" condition is met, and report which of its
criteria you verified and how. If a criterion cannot be met, stop and say why rather
than adjusting the criterion.
```

## Parking lot

Ideas that surfaced during planning and are deliberately **not** in the plan. Revisit after Phase 6:
undo (the value-type state makes it nearly free), iCloud Drive sync, iPad, a second save slot,
replay/share of a rip from its seed — which WO-01 makes possible almost by accident, and which is
the most interesting thing on this list.
