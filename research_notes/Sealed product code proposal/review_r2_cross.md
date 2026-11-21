# Revision 2 cross-part review

Reviewer: Tactical (Rei). Date: 2026-11-20. Scope: `docs/proposals/sealed-product/` (00-integration, part A, part B, part C), revision 2, against `r2_decisions.md` and the code at `app/PokeVendor` (Swift same as `503ff3c`). No ticket ID applies. This is a local proposal review.

## Verdict

**block.** The joints are mostly correct. Three defects stop the build at a phase gate: phase 0 does not compile, `-retailsim` does not compile where the plan builds it, and Part C calls a `RipShipRefund` case that does not exist.

| Severity | Count |
|---|---|
| Blocker | 3 |
| Major | 4 |
| Minor | 20 |

## 1. Cross-part calls

| Symbol | Defined in | Signature | Callers | Mismatch |
|---|---|---|---|---|
| `recordHiddenAct` | C 1.3 L278-287 | `(_ kind: HiddenActKind, weight: Double, note: String, witnesses: Int = 0, contactID: String? = nil, revealDay: Int? = nil, refund: Double = 0, sourceID: UUID? = nil) -> UUID`, `@discardableResult` | A `addHeat` L1951, L1972, `cancelOrder` L1205; B L1446, L1702, L1846, L2364, L2655, L2802; C L794, L811 | None |
| `retireHiddenAct(_:force:)` | C 1.3 L292-305 | `(_ id: UUID, force: Bool = false) -> Bool` | B L1848 (no force), L2350, L2357, L2362, L2396, L2441 (force) | None. C L339 cites stale Part B lines (minor 3). |
| `exposeHiddenAct` | C 1.3 L308 | `(_ id: UUID, inDays: Int = 1)` | None | No caller in any part (minor 17) |
| `startCallout(force:...)` | C 2.3 L647-650 | `(_ type:, truth:, receipts:, heat: Double? = nil, accuser:, text:, force: = false, actID:, actKind:, sourceID:, contactID:, refund:, repPaid:) -> String?` | B `settlePalm` L2679-2682; C L766, L845, L924, L932, L1383 | None. Argument order in B matches. |
| `noteRivalReceipt` | C 7.1 L1337 | `(_ id: UUID, note: String)` | A L1768, L1823; C L630 | None. A L1775 and L2919 carry a stale "check" note (minor 7). |
| `RivalKey` | C 2.1 L405 | `enum RivalKey: Codable, Hashable { rival(UUID), shop(LocalStore) }` | C only | A 0.1 L95 also places it in `M/Rivals.swift` (major 4) |
| `rival(_:)` | A 2.3 L1730 | `(_ id: UUID) -> Rival?` | C L610, L618, L1358 | None |
| `rivalAt(_:)` | A 2.3 L1733 | `(_ store: LocalStore) -> Rival?` | A only | None |
| `rememberRival` | A 2.3 L1740 | `(_ id: UUID, _ kind: RivalMemory.Kind, note: String, byPlayer: Bool, hostility: Double = 0)` | C L673, L1083 | None |
| `changeRivalCredibility` | A 2.3 L1757 | `(_ id: UUID, by delta: Double)` | C L629, L1381 | None |
| `adjustRivalHostility` | A 2.3 L1752; integration 1.3 L125 | `(_ id: UUID, _ delta: Double, note: String = "Callout", kind: RivalMemory.Kind = .playerCalledOut)` | C L1242, L1374, L1382 | None. The two texts are the same. |
| `banFromWhatnot` | B 0.4 L141 (stub), 5.6 L2468 (final) | `(days: Int, reason: String)`, no `save()` | C L1078; B L2460, L2676 | None |
| `refundRipShipOrder` | B 0.4 L149, 5.5 L2327 | `(_ orderID: UUID, reason: RipShipRefund = .notOpened) -> String`; `RipShipRefund { notOpened, resealed, chargeback, seized }` L155 | B L2793, L2807, L1828; C test 9 L1743 | **C L335 and L1743 use `.late`. No such case (blocker 3).** |
| `shipRipShipOrders` | B 5.6 L2430 | `(_ ids: [UUID]) -> String?` | C L1177 | None |
| `returnPalmedCards` | B 5.5 L2385 | `(_ orderID: UUID)` | C L1180 | None |
| `palmRefundDue` | B 5.8 L2694 | `(_ orderID: UUID) -> Double` | C L1135 | None |
| `registerMissingShipment(name:refund:learnIn:)` | A 3.3 L2326 | `(name: String, refund: Double, learnIn: Int)` | B L1296; A L2350 | None |
| `Product.isHot(day:)` | A 1.1 L390 | `(day: Int? = nil) -> Bool`, nonisolated | B via wrapper; integration 4.1 L248 | None |
| `Product.retailMSRP(day:)` | A 1.1 L384 | `(day: Int? = nil) -> Double?` | B L1237, L1668; integration 4.1 L247 | None |
| `GameStore.isHot(_:)` | A 1.1 L397 (wrapper) | `(_ product: Product) -> Bool` | B L1173, L1187, L1265, L1662, L2518 | None |
| `data.flipperPressure` | A 0.2 L108; integration 1.8 L171 | `Double` | B L1210, L1659; C L722 | None |
| `data.scalperHeat` | A 0.2 L111; integration 1.8 L172 | `Double` | C L723 | None |
| `data.rivals` | A 0.2 L113; integration 1.8 L173 | `[Rival]` | B (creator share); C L756, L891, L1002 | None |
| `FakeSource.plug`, `fakeRatePlug` | B 1.5 L262-268 (only declaration) | `case plug`; `0.055` | A L1919 | None. B phase 4 lands before A phase 7. |
| `HiddenActKind` cases | C 1.1 L98-115 | 14 cases | A, B, C, integration 1.2 | Integration 1.1 L54, L83 (major 1, minor 1) |
| `RetailSim.extraColumns` | A 7.2 L2683 | `[(name: String, value: () -> String)]` | B `hotFillRate`, `wholesaleOffers` (exist: B L1206, code `Wholesale.swift` L65); C `data.callouts.open` | B and C files have no step that adds the column (minor 16) |

## 2. `HiddenActKind`

Part C 1.1 has 14 cases with all four value tables. Every case has an owner that records it:

| Case | Recorded at | Weight passed | C 1.4 weight | OK |
|---|---|---|---|---|
| `shelfBuyout` | A `notePurchase` L856 | `min(2, 1 + 0.25 × (units − 2))`, witnesses 5 | same | yes |
| `limitEvasion` | A L852 | 1.0 | 1.0 | yes |
| `botCheckout` | A L1142, L2085 | 0.5 | 0.5 | yes |
| `storeBan` | A L1972 | 1.5, witnesses 3 | 1.5, 3 | yes |
| `botOrderCancelled` | A L1205 | 0.5 | 0.5 | yes |
| `priceGouge` | integration 1.2 L95 | `min(2, price / market − 1)` | `max(0.5, min(2, …))` | minor 4 |
| `backDoorAllocation` | B L1446 | `max(0.6, min(1.5, 1.5 × (1 − share)))` | same | yes |
| `plugPurchase` | B L1702 | `max(0.3, min(2, total / 2000))` | same | yes |
| `plugSeized` | B L1846 | 1.0, `revealDay: day + 2` | same | yes (see minor 5) |
| `sellResealed` | C L811 | `max(0.5, min(2, price / 100))` | same | yes |
| `palmedHit` | B L2655 | 1.5, peak viewers | same | yes |
| `unshippedOrder` | B L2802; L2364 after chargeback | 1.0; 2.0 | same | yes |
| `lowballKid` | C L794 | `max(0.5, min(2, market / 50))`, witnesses 3 | same | yes |
| `counterfeitSold` | C L811 | `max(0.5, min(2, price / 100))` | same | yes |

No caller records a case that does not exist.

## 3. Constants

All D-13 values are applied once: `vendorHours`, `vendorWeekdays`, `hotDrainBase`, `hotDrainPressure`, `storeBanDays`, `incidentChance`, `strictnessDecayDays`, `rivalReceiptChance` (A L2486-2562); `rivalCalloutBase`, `calloutDenyFalseRep`, `playerCalloutCooldown`, `playerCalloutRep`, `playerCalloutFollowerShare`, `playerCalloutFollowerMin`, `calloutCounterFollowerShare`, `kidGiftStory` (C L1588-1654); `fakeRatePlug` (B L268, the only declaration). The A code blocks read the same values (L488-489, L515).

All D-14 values are applied once (integration L271-278, rider L315). The rate math is correct: 0.0005 × 3 × 364 = 0.55 a year. The claim test `(value × 0.8) − 25` matches `policyCoverage` 0.8 and `policyDeductible` 25 (`M/Losses.swift` L35-36).

The shared constants have one owner each: `rivalCredFloor`, `rivalCredWeekly`, `rivalReceiptGapDays` (C); `palmBanDays`, `ripShipShipMinutes` (B); `wholesaleMissingChance`, `missingShipmentRefundDays`, `rivalReceiptChance` (A); `gougeRatio`, `storeBreakIn*`, `storeRiderRate` (integration). Ownership defects: major 4 and minor 9.

## 4. End Day order

The real `endDay()` (`M/GameStore.swift` L1106-1207) matches the integration citations: `storeDayEnd` L1125, `data.day += 1` L1131, `printEndDay` L1135, resets L1138-1141, `decayStanding` L1142, `advanceSealed` L1145, `streamsEndDay` L1161, `splitsEndDay` L1162, `vendingEndDay` L1167, `lossesEndDay` L1194, `storeGrowthDay` L1195. Integration step 2 omits `demandEndDay()` L1133 and the first `syncMarket()` L1134. That is harmless.

Every hook that a part names is in the merged order: A `flippersEndDay` (4), `resetRetailDay` (6), `retailOrdersEndDay` (8), `rivalsEndDay` (16), `alertsEndDay` (20); B `backRoomRestock` (9), `ripShipEndDay` (11), `distributorEndDay` and `plugEndDay` (13); C `calloutsEndDay` (15); integration `storeBreakInEndDay` (18). Inner calls (`strictnessEndDay`, `heatEndDay`, `msrpEndDay`, `missingShipmentsEndDay`, `rivalTableReceipts`) run inside their owners.

Read-before-write check: no step reads state that a later step writes, except the two lags that the parts state and accept: the sponsor block in `advanceSocial` (L1150) reads callout heat before step 15 (C 7.5), and the weekly rival roll (15) reads hostility before the pull (16). A seized Rip & Ship order (13) that step 11 already charged back hits the `open` guard in `refundRipShipOrder`, so no second payment occurs.

## 5. Phase 0 stubs

See blocker 1 and major 3. The integration list covers every Part C and Part B function that phases 1 to 5 call. It misses types and one function that phase 0 itself needs.

## 6. `GameData` fields

Integration 1.8 (L170-181) matches A 0.2 (4 fields), B 1.4 (2 fields), and C 1.2 (2 fields), in the same order, after L140, with decoder lines after L233. Both anchor lines are correct in the code.

## 7. Decisions

D-1, D-2, D-3, D-4, D-5, D-6, D-8, D-10, D-11, D-12, D-13, D-14, D-15, and D-17 are applied in their owning parts. The parts agree on refunds (one `refunded` flag), palms (price plus card, `palmRefundDue`), chargebacks (full price, player keeps the cards), strikes (2 in 60 days, 3 in 120 days), the back-door window (28 days, `max(6, 50%)`), hot allocation (1 case a week, +1 at Elite), and drawings (2-day claim). Defects: D-7 at the Rip & Ship joint (major 2), D-9 (blocker 1, major 3), D-16 (blocker 2), and a wording gap on D-4 (minor 20).

## 8. Code spot-checks

| Citation | Result |
|---|---|
| `M/WholesaleAccount.swift` L38 `isHot(_:)` | Correct |
| `M/Counterfeits.swift` L321 `recordBadSale` | Correct |
| `M/CardStore.swift` L324 `static func isInStore` | Correct |
| `M/Shows.swift` L1355 `static func weighted` | Correct |
| `M/LiveStream.swift` L225 `giveAway` call, L461 definition | Correct |
| `M/StoreEvents.swift` L242 `stealFromStore` | Correct |
| `M/Losses.swift` L40 `InsuranceState: Codable` | Correct |
| `M/Inventory.swift` L575 `SealedItem.acquiredDay` | Correct |
| `M/Relationships.swift` L345 `promote` | Correct |
| `Support/Support.swift` L6-15 `Theme` has no `red` | Correct |
| `M/Shorts.swift` L387 `challengeBlock` | Correct |
| `M/Market.swift` L76 `@MainActor`, L84 `retail` | Correct |
| `M/Wholesale.swift` L45 case sizes, L99 short refund | Correct |
| `M/Haggling.swift` L171-176 random story | Correct |
| `M/Shows.swift` L1170 kid cap 30 | Correct |
| `M/GameStore.swift` L356 `addLedger`, L249 `report`, L287 and L539 `seedContacts` | Correct |
| `M/LiveStream.swift` L158 `whatnotOpen` | Correct |
| `GameStore.slot(for:)` (C L1152) | Exists, `M/GameStore.swift` L324 |
| `addPoints(_ id: String?, _:)` (B L1480 passes `String?`) | Correct, `M/Relationships.swift` L294 |
| B 6.1 L2841: first `syncMarket()` at L1132 | **Wrong.** It is L1134 (minor 11). |
| C L72: 19 `recordBadSale` call sites | **Wrong.** 18 (minor 12). |
| Integration 4.2 L285: `s.isOpen` | **Does not exist** (minor 13) |

---

## Findings

### Blocker 1. Phase 0 does not compile: `RetailState` needs four later types

- **Where:** `00-integration.md` L352 (phase 0 row); `part-a-stores-flippers.md` L2946 (phase 0 row), L196-211 (the fields).
- **Evidence:** Phase 0 builds `RetailState` with all fields. The fields use `DrawingEntry` (defined A L987, phase 3), `DropOrder` (A L1119, phase 3), `AlertTier` (A L1274, phase 3), and `MissingShipment` (A L2302, phase 4). Neither phase 0 list names them. D-9 requires every later phase to compile from its first line.
- **Fix text:** In integration L352, after "The types: `RetailState`," insert "and the types its fields use (`ChainStrictness`, `BatchBuy`, `DrawingWin`, `DrawingEntry`, `DropOrder`, `AlertTier`, `MissingShipment`; type definitions only)". In A L2946, after "`RetailState` (all fields, tolerant decoder)," insert "the field types `DrawingEntry` (1.4), `DropOrder` (1.5), `AlertTier` (1.8), and `MissingShipment` (3.3), with no functions,".

### Blocker 2. `-retailsim` does not compile in phase 0 or phase 2

- **Where:** `00-integration.md` L352 ("The `-retailsim <days>` launch argument (D-16, Part A)"); `part-a-stores-flippers.md` L2948 (phase 2), L2701-2703, L2792-2801.
- **Evidence:** The two files disagree (phase 0 against phase 2). `RetailSim` calls `subscribeAlerts`, `walmartDrawing`, `enterDrawing`, `claimDrawingWin`, `attemptDrop(_:bot:)`, `targetDrop`, `targetAttemptsLeft`, `attemptTargetDrop`, and `Upgrade.checkoutBot`. All are phase 3. It also calls `vendorSlot`, `shelf(at:hour:)`, `limitLeft`, `joinClub`, `strictness` (phase 2). Today `attemptDrop` takes no `bot:` (`M/GameStore.swift` L750), and `limitLeft` does not exist. D-16 requires a run after phase 2.
- **Fix text:** In integration L352, delete "The `-retailsim <days>` launch argument (D-16, Part A)." In integration L354 (phase 2), add "`RetailSim` and `-retailsim` without the online and bot lines (A 7.2)." In integration L355 (phase 3), add "`RetailSim.onlineCommon` and the flipper setup lines for the bot and alerts." In A L2948 replace "`RetailSim` and the `-retailsim` argument." with "`RetailSim` and the `-retailsim` argument, without `onlineCommon` and without the `checkoutBot` and `subscribeAlerts` lines in `run`." In A L2949 add "`onlineCommon` and the flipper setup lines in `RetailSim` (7.2)."

### Blocker 3. `RipShipRefund.late` does not exist

- **Where:** `part-c-callouts.md` L335, L1743. Definition: `part-b-cases-distro-ripship.md` L155.
- **Evidence:** `enum RipShipRefund { case notOpened, resealed, chargeback, seized }`. B L2374: "exactly the four cases". C test 9 calls `refundRipShipOrder(id, reason: .late)`. `Hub/GameTests.swift` then fails to compile, and `-test` cannot run at phase 6.
- **Fix text:** C L335: replace "`refundRipShipOrder(.late)`" with "`refundRipShipOrder(_, reason: .chargeback)`". C L1743: replace "`refundRipShipOrder(id, reason: .late)`" with "`refundRipShipOrder(id, reason: .chargeback)`".

### Major 1. The integration file tells the builder to add two cases that Part C already has

- **Where:** `00-integration.md` L48, L54.
- **Evidence:** L54: "The final list has 14 cases. Part C's file has 12. Add the 2 cases from Part A". Part C L103-104 already has `storeBan` and `botOrderCancelled`, with values equal to integration L65-66. L48: "The other fixes are in section 1. Apply them while you build. They are not yet in the part files." Revision 2 put them in the part files. The integration file wins on conflict, so a builder who obeys it declares the cases twice.
- **Fix text:** L48: replace with "Revision 2 applied the section 1 fixes in the part files. Section 1 is the reference for each contract." L54: replace "The final list has 14 cases. Part C's file has 12. Add the 2 cases from Part A:" with "The final list has 14 cases. Part C 1.1 has all of them. These two came from Part A:".

### Major 2. A merged Rip & Ship act loses its D-5 and D-6 paths

- **Where:** `part-c-callouts.md` L654-665 (merge branch), L768 (`force: a.revealDay != nil`), L743 (marks exposed); `part-b-cases-distro-ripship.md` L2362, L2396.
- **Evidence:** At a full cap, `startCallout` adds the heat to another callout and returns a line. `exposeHiddenActs` then marks the act exposed. No open callout has that `actID` or `sourceID`. Then (a) the day-7 chargeback calls `retireHiddenAct(lateActID, force: true)`, which returns `true` for an exposed act, so B never records the weight-2.0 act that D-5 requires; (b) a log palm has no callout with `actKind == .palmedHit`, so "make it right", `palmRefundDue`, and `returnPalmedCards` cannot run (D-6); (c) the late order's goodwill path cannot run (D-4).
- **Fix text:** C L768: replace "`force: a.revealDay != nil,`" with "`force: a.revealDay != nil || a.kind == .unshippedOrder || a.kind == .palmedHit,`". Add after C L690: "An `unshippedOrder` or `palmedHit` act always opens its own callout, because Part B settles it through the callout's `sourceID` (D-4, D-5, D-6)." This extends the D-7 forced list. AJ must approve that. The other choice: in the merge branch, return `nil` for these two kinds and leave the act unexposed.

### Major 3. Phase 0 stub lists have gaps besides blocker 1

- **Where:** `00-integration.md` L352; `part-a-stores-flippers.md` L1766, L2946; `part-b-cases-distro-ripship.md` L135, L155; `part-c-callouts.md` L354.
- **Evidence:**
  - A phase 0 builds `noteShelfReceipt` (A L2946). The integration list does not name it.
  - B 0.4 defines `enum RipShipRefund` in phase 0 (L155). The stub signature needs it. The integration list does not name it.
  - B L135 says phase 0 adds "the empty `RipShipState` and `PlugState`". The `banFromWhatnot` stub writes `data.ripShip.bannedUntil` and `banReason` (L143-144). An empty struct does not compile.
  - C 1.5 L354 lists the phase 0 constants. It omits `rivalCredFloor`. A phase 0 `changeRivalCredibility` reads it (A L1760). It also omits `lateShipGoodwillShare` and `lateShipGoodwillMin`. `lateGoodwill` is not phase 0, so those two can wait.
- **Fix text:** Integration L352: after "`seedRivals` (runs on load)" add ", `noteShelfReceipt`"; after "`returnPalmedCards`" add ", and `enum RipShipRefund`". B L135: replace "the empty `RipShipState` and `PlugState`" with "`RipShipState` with at least `bannedUntil` and `banReason` and its tolerant decoder, and an empty `PlugState`". C L354: replace "`calloutGoodwill*`, `rivalReceiptGapDays`" with "`calloutGoodwill*`, `rivalReceiptGapDays`, `rivalCredFloor`, `rivalCredWeekly`".

### Major 4. Part A's file table declares `RivalKey` a second time

- **Where:** `part-a-stores-flippers.md` L95.
- **Evidence:** L95: "`M/Rivals.swift` | `RivalKey`, `Rival`, `RivalMemory`; …". Part C 2.1 L405 defines it in `M/Callouts.swift`. Integration L352 and A L1603 say Part C owns it. A builder who creates files from the table declares the type twice.
- **Fix text:** A L95: replace "`RivalKey`, `Rival`, `RivalMemory`;" with "`Rival`, `RivalMemory` (`RivalKey` is Part C's, `M/Callouts.swift`);".

### Minor 1. Wrong owner for `sellResealed`

- **Where:** `00-integration.md` L83.
- **Evidence:** Integration: owner B. B L3163: "`.sellResealed` is Part C's". C L332: owner C.
- **Fix text:** L83: replace "| `sellResealed` | B |" with "| `sellResealed` | C |".

### Minor 2. Stale contract notes and payment prose in Part B

- **Where:** `part-b-cases-distro-ripship.md` L2379, L2382, L3169-3175.
- **Evidence:** L2379: "Part C pays `c.refund`". Part C pays `palmRefundDue` (C L1135). L2382: "Part C paid … already". Part C calls `returnPalmedCards` before `addLedger` (C L1180, L1220). L3171-3175 ask Parts A, C, and the integration file for changes that revision 2 already made.
- **Fix text:** L2379: replace "Part C pays `c.refund`, which Part B set to the order price plus the palmed card's market (5.8)." with "Part C pays `palmRefundDue(order)` (5.8)." L2382: replace "Part C paid the order price and the card's market already." with "Part C reads `palmRefundDue` first and pays after this call." L3169-3175: replace the list with "All of these changes are in revision 2 (Part A 3.3, Part C 5.2 and 6.2, integration 1.5, 1.7, 4.2)."

### Minor 3. Stale Part B line numbers in Part C

- **Where:** `part-c-callouts.md` L339.
- **Evidence:** "(Part B L1818, L1859)". Those lines are now in the plug section. The calls are at B L2441, L2350, L2357, L2362, L2396.
- **Fix text:** replace "(Part B L1818, L1859)" with "(Part B 5.5 and 5.6)".

### Minor 4. Two weight formulas for `priceGouge`

- **Where:** `00-integration.md` L95; `part-c-callouts.md` L328.
- **Evidence:** Integration has `min(2, price / market - 1)`. C has `max(0.5, min(2, …))`. With `gougeRatio` 1.5 they give the same result. D-2 makes the C table the authority.
- **Fix text:** L95: replace "`weight: min(2, price / market - 1)`" with "`weight: max(0.5, min(2, price / market - 1))`".

### Minor 5. One seizure can give several forced callouts

- **Where:** `part-b-cases-distro-ripship.md` L1845-1847; `part-c-callouts.md` L331, L1778.
- **Evidence:** B records one `plugSeized` act for each seized order, each with `revealDay`, so each opens past the cap. C says "one seizure gives one callout".
- **Fix text:** B L1845-1847: replace the loop with one call: "`if let first = orders.first { recordHiddenAct(.plugSeized, weight: min(2, Double(orders.count)), note: \"Police seized plug stock: \\(orders.map(\\.productName).joined(separator: \", \"))\", revealDay: reveal, sourceID: first.id) }`".

### Minor 6. Ambiguous rename line

- **Where:** `00-integration.md` L44.
- **Evidence:** "`checkoutBot` is now `botCheckout`". A L63 and L2040 keep the `Upgrade` case as `checkoutBot`. Only the hidden act is `botCheckout`.
- **Fix text:** replace "and `checkoutBot` is now `botCheckout`." with "and the hidden act `checkoutBot` is now `botCheckout`. The `Upgrade` case stays `checkoutBot`."

### Minor 7. Stale "must change" notes in Part A

- **Where:** `part-a-stores-flippers.md` L1775, L2919, L2929-2938.
- **Evidence:** All six rows of "What the integration file must change" are already in the integration file (L133, L147, L248, L286, L348, L353-354). L1775 and L2919 discuss a `RivalKey` parameter for `noteRivalReceipt`, but all three files use `UUID`.
- **Fix text:** Delete L2929-2938. L2919: delete from "**Check:**" to the end of the item. L1775: delete the last two sentences, from "The revised Part C file".

### Minor 8. Stale instructions in integration 1.3 and 1.4

- **Where:** `00-integration.md` L131, L139.
- **Evidence:** L131 says "Part C must call `rememberRival`". C L673 and L1083 already do. L139 says "In Part B, change … (`plugOffers`, Part B L1333)". B L1237 and L1668 already do. L1333 is now in the wholesale section.
- **Fix text:** L131: replace "Part C must call" with "Part C calls" (twice). L139: replace "In Part B, change the wholesale unit price, the plug price (`plugOffers`, Part B L1333), and the case factor fallback." with "Part B uses it for the wholesale unit price and the plug price (Part B 3.5, 4.2)."

### Minor 9. Two files for one constant

- **Where:** `part-b-cases-distro-ripship.md` L2955.
- **Evidence:** B names `M/Wholesale.swift`. The owner, A, puts them in `M/RetailOnline.swift` (A L2316-2319, L2579-2580).
- **Fix text:** replace "`M/Wholesale.swift`, Part A" with "`M/RetailOnline.swift`, Part A".

### Minor 10. Wrong encoding claim

- **Where:** `part-b-cases-distro-ripship.md` L2023.
- **Evidence:** "`[Int: Double]` encodes as a JSON array of pairs." `JSONEncoder` writes an `Int`-keyed dictionary as an object with string keys. A L264 states it correctly (review A-m7).
- **Fix text:** replace with "`[Int: Double]` encodes as a JSON object with string keys. `JSONDecoder` reads it back."

### Minor 11. Wrong line for the first `syncMarket()`

- **Where:** `part-b-cases-distro-ripship.md` L2841.
- **Evidence:** Code L1132 is `data.hour = Balance.dayStart`. `syncMarket()` is L1134.
- **Fix text:** replace "(L1132)" with "(L1134)".

### Minor 12. Wrong call-site count for `recordBadSale`

- **Where:** `part-c-callouts.md` L72, L835.
- **Evidence:** `grep -rn "recordBadSale(" app/PokeVendor` finds 18 calls. C lists 11 sealed sites, so 7 sell cards.
- **Fix text:** L72: "19 call sites" to "18 call sites". L835: "The other 9 call sites" to "The other 7 call sites".

### Minor 13. `isOpen` does not exist

- **Where:** `00-integration.md` L285.
- **Evidence:** `CardStore` has no `isOpen`. A break-in happens at night, so the right check is that the store exists. `storeIsBuilt` is at `M/CardStore.swift` L186.
- **Fix text:** replace "`guard let s = data.cardStore, s.isOpen else { return [] }          // use the real \"store is open\" check`" with "`guard let s = data.cardStore, storeIsBuilt else { return [] }`". Delete "Use the real names for \"store is open\" and" from L306.

### Minor 14. Unused standing constant

- **Where:** `00-integration.md` L248, L256.
- **Evidence:** L256 declares `ripHereStanding = StandingLevel.regular`. L248 checks `points >= 30`. The code already compares levels with `StandingLevel.rank` (`M/Consignment.swift` L18, `M/Relationships.swift` L156).
- **Fix text:** L248: replace "`points >= 30` (Regular; `StandingLevel` is not `Comparable`)" with "`standing(store).rank >= Balance.ripHereStanding.rank` (the pattern at `M/Consignment.swift` L18)".

### Minor 15. Receipt roll count per visit

- **Where:** `00-integration.md` L133; `part-a-stores-flippers.md` L761, L797.
- **Evidence:** Integration: "rolls it once a visit". D-10 and A roll once for each line. `waitForVendor` calls `writeVisitLines` again in the same visit, so each cleared line rolls twice. Part C's 30-day gap limits the effect.
- **Fix text:** Integration L133: replace "The model rolls it once a visit" with "The model rolls 0.05 once for each rival line, once a visit". A L797: before `writeVisitLines`, add "Pass `receipts: false`", and give `writeVisitLines` a parameter `receipts: Bool = true` that skips the `noteShelfReceipt` loop.

### Minor 16. No owner step for the `-retailsim` columns

- **Where:** `part-a-stores-flippers.md` L2833, L2950-2951.
- **Evidence:** A assigns the `fill` column to Part B (phase 4) and the `callouts` column to Part C (phase 6). Neither B nor C mentions `RetailSim`.
- **Fix text:** Add to B 3.9: "Phase 4: in `RetailSim.init`, append the `fill` column (Part A 7.2)." Add to C 12: "Phase 6: in `RetailSim.init`, append the `callouts` column (Part A 7.2)."

### Minor 17. `exposeHiddenAct` has no caller

- **Where:** `part-c-callouts.md` L307-312, L351; `00-integration.md` L352.
- **Evidence:** B L3165: "Part B no longer calls `exposeHiddenAct`". No other part calls it.
- **Fix text:** Keep the function. In C L307, add to the comment: "No caller in revision 2. Kept for the debug menu."

### Minor 18. Wrong section for the final `banFromWhatnot`

- **Where:** `part-b-cases-distro-ripship.md` L158.
- **Evidence:** "Phase 5 replaces the stub body with 5.5." `banFromWhatnot` is final in 5.6 (L2468).
- **Fix text:** replace with "Phase 5 replaces the stub bodies with 5.5 (`refundRipShipOrder`, `returnPalmedCards`) and 5.6 (`banFromWhatnot`)."

### Minor 19. The random rival story ignores the cap rule

- **Where:** `part-c-callouts.md` L976-980; the rule at L906.
- **Evidence:** L906: "A full cap skips the roll (a false claim has no act to keep)." `randomRivalStory` calls `rivalCallout` with no cap check, so a false claim merges its heat at a full cap.
- **Fix text:** L978: replace "`guard let r = rivalPool().randomElement() else { return nil }`" with "`guard openCallouts.count < Balance.calloutMaxOpen, let r = rivalPool().randomElement() else { return nil }`".

### Minor 20. The "only refund path" wording omits the palm

- **Where:** `00-integration.md` L158; `r2_decisions.md` D-4.
- **Evidence:** "`refundRipShipOrder` is the only function that pays a buyer the order price back." A palm make-right pays the order price through Part C's `addLedger` (C L1220), as D-6 requires. The `refunded` flag still stops a second payment. That refund also does not lower `grossByDay`, which B m9 requires for other refunds (B L2334).
- **Fix text:** L158: append "Exception: a palm make-right (D-6) pays `palmRefundDue` through Part C. `returnPalmedCards` sets `refunded`, so no later path pays the price again." In B `returnPalmedCards` after L2395 add: "`if !order.refunded { data.ripShip.grossByDay[order.soldDay] = max(0, (data.ripShip.grossByDay[order.soldDay] ?? 0) - order.price) }`".

---

## Question for AJ

Major 2 adds `unshippedOrder` and `palmedHit` acts to the D-7 forced list. The other choice keeps them unexposed at a full cap. Each choice changes D-7 as written. One of them must be chosen.
