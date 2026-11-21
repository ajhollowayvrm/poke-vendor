# Sealed product code proposal: integration and build order

Status: proposal. Nothing in this folder is built. AJ approved every proposal in `reports/Sealed product and flipper play.md` on 2026-11-20, including 1.2 (the camp haul cap), 4.2 (the 14-day application), and 5.6 (palm the hit).

Code base: commit `503ff3c`. `M` = `app/PokeVendor/Model`. Line numbers are from that commit.

## How to read this folder

| File | Scope |
|---|---|
| `00-integration.md` (this file) | The shared contracts, the merged End Day order, the decisions, the two items that no part owned, and the build order. |
| `part-a-stores-flippers.md` | Proposals 1.1 to 1.8 (big-box stores and limits), 2.1 to 2.6 (flippers, rivals, scalper heat), and the "More mechanics" rows: shows that ban in-print sealed, official card machines, missing shipments, the MSRP step, the winter sell-off. |
| `part-b-cases-distro-ripship.md` | Proposals 3.1 to 3.7 (cases), 4.1 to 4.8 (distributor and plug), 5.1 to 5.7 (Rip & Ship). |
| `part-c-callouts.md` | Proposals 6.1 to 6.9 (the hidden-act log, callouts, replies, the record, the kid gift). |

## Revision 2

Revision 1 went through three code reviews and a Monte Carlo simulation (2,000 runs × 365 days × 4 player strategies). The reviews found 8 blockers, 26 major findings, and 64 minor findings. The simulation found 8 balance problems. Revision 2 fixes all of them. The evidence is in `research_notes/Sealed product code proposal/`: `review_part_a.md`, `review_part_b.md`, `review_part_c_integration.md`, `sim_report.md`, `sim_sealed.py`, and `r2_decisions.md`. Each part file starts with a "Revision 2 changes" table.

The cross-part decisions of revision 2 (`r2_decisions.md`, D-1 to D-17) are now in this file:

| ID | Decision | Section |
|---|---|---|
| D-1 | Buyout heat and `shelfBuyout` only when the player's buy empties the item | 1.1 |
| D-2 | One weight table for hidden acts (Part C 1.4) | 1.1 |
| D-3 | Hot allocation stays at 1 case a week; Rip & Ship, vending, and the counter count as shelf sales | Part B |
| D-4 | One refund path for a Rip & Ship order; "make it right" ships a late order | 1.7 |
| D-5 | A day-7 cancel is a chargeback with Whatnot strikes | 1.7 |
| D-6 | A palm refund pays the order price plus the card's value | Part C |
| D-7 | Forced callouts pass the cap; extra acts add heat, never vanish | Part C |
| D-8 | `RivalKey` for named rivals and game shops | 1.3 |
| D-9 | Phase 0 stubs cover every cross-part call | 7 |
| D-10 | Rival receipts come from the model, at 5% | 1.3 |
| D-11 | A drawing win waits 2 days for the player to claim it | Part A |
| D-12 | Missing shipment names: `learnIn`, `missingShipmentRefundDays` | 1.5 |
| D-13 | 17 simulation values | 3 |
| D-14 | Store break-in values; a store stock rider on the policy | 4.2 |
| D-15 | `ItemStatus.openedAtShop` | 4.1 |
| D-16 | `-retailsim <days>` | 7 |
| D-17 | The top review improvements in each part | parts |

## Revision 3

A cross-part review of revision 2 (`review_r2_cross.md`: 3 blockers, 4 major, 20 minor) and a second simulation run (`sim_report.md` section 9, with a new "honest with a job" player) found the last problems. Revision 3 applies every fix in all four files:

| Change | Where |
|---|---|
| Phase 0 also builds the field types of `RetailState`, `noteShelfReceipt`, `enum RipShipRefund`, and a `RipShipState` with the ban fields. | 7, Part A 11, Part B 0.4 |
| `-retailsim` lands in phase 2 without the online lines. Phase 3 adds them, phase 4 adds `fill`, phase 6 adds `callouts`. | 7, Parts A, B, C |
| `RipShipRefund.late` did not exist. Part C uses `.chargeback`. | Part C |
| `unshippedOrder` and `palmedHit` acts always open their own callout (D-7 extended), so their order can settle. | Part C 2.3 |
| One plug seizure records one `plugSeized` act. | Part B 4.4 |
| A hot buy that reaches the chain limit adds 0.7 heat (`heatLimitHit`) with no hidden act. The second sim run showed that D-1 alone left the flipper almost free of bans (1.7 a year). With this rule: about 13.5 a year for the flipper, 0 for every honest strategy. | Part A 1.2, 2.4 |
| `storeRiderRate` 0.006 → 0.03. At 0.006 the rider paid out about 5 times its cost. | 4.2 |
| `backDoorNoticeChance` 0.15 → 0.25. The cheater's account closes in 76% of runs; honest shop owners get 0 warnings. | Part B 3.6 |
| Citation, stale-note, and wording fixes (review minors 1 to 20). | all |

Second-run results for revision 2 that stay true in revision 3: the honest player, the honest player with a job, and the honest shop owner get no store bans, no back-door warnings, and no true callouts from normal play. No scam pays. The farming loops give at most +45 reputation and +534 followers a year.

**Rule: where a part file disagrees with this file, this file wins.** The merge already made these edits in the part files:

- Part A: `limitBuyout` is now `shelfBuyout`, `repeatVisit` is now `limitEvasion`, and the hidden act `checkoutBot` is now `botCheckout`. The `Upgrade` case stays `checkoutBot`.
- Parts B and C: `docs/34-callouts.md` is now `docs/35-callouts.md`, and `D/34` is now `D/35`.
- All parts: relative links point from this folder.

Revision 2 applied the section 1 fixes in the part files. Section 1 is the reference for each contract.

## 1. Contract fixes between the parts

### 1.1 `HiddenActKind`: one list

Part C owns the enum (`M/Callouts.swift`). The final list has 14 cases. Part C 1.1 has all of them. These two came from Part A:

```swift
    case storeBan           // staff at a chain refused card sales to the player (Part A, 2.4)
    case botOrderCancelled  // a store cancelled a bot order (Part A, 1.5 and 2.6)
```

Values for the 2 new cases:

| Case | `calloutType` | `discovery` | `decay` | `receipts` | `calloutText` |
|---|---|---|---|---|---|
| `storeBan` | `.greed` | 0.040 | 0.04 | 0.6 | "{who} says a store banned you for scalping." |
| `botOrderCancelled` | `.greed` | 0.015 | 0.05 | 0.3 | "{who} says the Pokemon Center cancelled a pile of your bot orders." |

The owner of each case:

| Case | Owner | Where it is recorded |
|---|---|---|
| `shelfBuyout` | A | `buyShelf`, when the player's buy empties a hot item and the player bought 2 or more of it in the visit (D-1). A normal buy at the limit is not a secret. |
| `limitEvasion` | A | the first buy on a second visit to one chain on one day |
| `botCheckout` | A | each bot attempt at the Pokemon Center or Target.com |
| `storeBan` | A | a chain bans the player |
| `botOrderCancelled` | A | a store cancels a bot order |
| `priceGouge` | **Integration (1.2)** | a sale of hot in-print sealed far above market |
| `backDoorAllocation` | B | `backDoorCheck` |
| `plugPurchase` | B | `orderFromPlug` |
| `plugSeized` | B | `plugEndDay`, a seizure |
| `sellResealed` | C | `recordBadSale`, with `known && sealed` |
| `palmedHit` | B | `notePalm`, when the camera did not catch it |
| `unshippedOrder` | B | `ripShipEndDay`, once per late order |
| `lowballKid` | C | the existing kid lowball, moved out of `recordScam` |
| `counterfeitSold` | C | `recordBadSale`, with `known && !sealed` |

`recordBadSale` (`M/Counterfeits.swift` L321) has one branch for both cases. One sale records at most one act.

### 1.2 `priceGouge` (no part owned it)

Record a gouge when the player sells hot in-print sealed at a high markup at a venue where the player sets the price.

- **Venues:** the own store (the clerk sale in `rollStoreSales`, `M/CardStore.swift`) and the show table (the sale path in `M/Shows.swift`).
- **Rule:** the item is sealed, `product.isInPrint`, `product.isHot()`, and the sale price is at least `Balance.gougeRatio × realMarket(of: item)`.
- **Call:** `recordHiddenAct(.priceGouge, weight: max(0.5, min(2, price / market - 1)), note: "<name> at <price>", witnesses: 3)`.
- **Limit:** at most one gouge act each day. Keep the day in `RetailState.gougeDay: Int` (default -1). Add the field to the tolerant decoder in Part A section 0.3.
- **Exclusivity:** collect the sold items in a local array inside the sale loop. Record the act after the loop. Do not record it inside a closure on `data`.
- **Constant:** `Balance.gougeRatio = 1.5` in `M/Flippers.swift`.

### 1.3 Rivals: one key type and one credibility value

Part A owns `Rival`. Its `id` is a `UUID`. Game shops can also act as rivals, and they have no `UUID`. So Part C uses a key with two cases (D-8):

```swift
/// A rival that can post callouts: a named rival (Part A) or a rival game shop.
enum RivalKey: Codable, Hashable {
    case rival(UUID)
    case shop(LocalStore)
}
```

| Part C item | Change |
|---|---|
| `Accuser.rival(String)` | `case rival(RivalKey)` |
| `RivalReceipt.rivalID: String`, `RivalView.id: String` | `RivalKey` |
| `CalloutState.rivalCredibility: [String: Double]` | Replace with `shopCredibility: [String: Double]` for game shops only (key `LocalStore.rawValue`). Named rivals use `Rival.credibility` (Part A). |
| `credibility(_:)`, `loseCredibility(_:...)` | Take a `RivalKey` and switch: `.rival(id)` reads or writes through `rival(id)` and `changeRivalCredibility(id, by:)`; `.shop(s)` uses `shopCredibility`. Clamp at `Balance.rivalCredFloor` (0.25). |
| The weekly `+rivalCredWeekly` regain | Part A's `rivalsEndDay()` regains named rivals once a week. Part C's weekly roll regains game shops. |
| `RivalKind` | Use `Rival.Kind` (`.flipper`, `.creator`). |

Part A adds the function that Part C asked for, in `M/Rivals.swift`:

```swift
    /// Part C: a callout between the player and a rival changes the rival's hostility.
    func adjustRivalHostility(_ id: UUID, _ delta: Double, note: String = "Callout",
                              kind: RivalMemory.Kind = .playerCalledOut) {
        rememberRival(id, kind, note: note, byPlayer: kind == .playerCalledOut, hostility: delta)
    }
```

Part C calls `rememberRival(id, .rivalCalledOut, note:, byPlayer: false)` when a rival opens a callout. Part C calls `rememberRival(id, .calloutEnded, note:, byPlayer: <player won>)` when a rival callout settles.

Part A calls Part C's `noteRivalReceipt(_ id: UUID, note: String)` with a 5% chance when a rival cleared a shelf (memory kind `.rivalTookShelf`). The model rolls 0.05 once for each rival line, once a visit in `buyShelf` or the visit start, never in a view (D-10). A rival line shows only when the rival took the stock, never when the player bought the last unit.

### 1.4 The hot test and retail MSRP: one definition

- `Product.retailMSRP(day:)` and `Product.isHot(day:)` in `M/Retail.swift` (Part A) are the only definitions.
- `GameStore.isHot(_:)` (`M/WholesaleAccount.swift` L38) becomes a wrapper: `product.isHot()`. Part B calls the wrapper, so Part B needs no other change.
- Every **price** read for a new unit uses `retailMSRP()`, not `msrp`. Part B uses it for the wholesale unit price and the plug price (Part B 3.5, 4.2). The MSRP step then reaches every buy price.
- The counterfeit roll can keep `msrp`. It uses MSRP only as a reference value.

### 1.5 Missing shipments in Part B's distributor order

Part B rewrites `buyWholesale` to deliver cases. Keep Part A's missing-shipment rule in it:

1. Roll `Balance.wholesaleMissingChance` (0.01) once for each order, after the fill roll and after the charge.
2. On a hit, create no items. Call `registerMissingShipment(name: <order name>, refund: <total charged>, learnIn: Balance.wholesaleDeliveryDays)`. `learnIn` is the day the player learns that the order is lost. The refund comes `Balance.missingShipmentRefundDays` (14) days after that (D-12).
3. The existing 12% short-ship roll still applies to an order that arrives.

### 1.6 The show ban and cases

A case item keeps the `productID` of its unit product. `bannedAtShow` (Part A section 3.1) reads `productID`, so a case of an in-print product is banned at a show with the rule. No change is necessary. Add one Part A test line: a case item of an in-print product is banned.

### 1.7 Whatnot ban and refunds

Part B provides `banFromWhatnot(days:reason:)` and `refundRipShipOrder(_:reason:)`.

- `refundRipShipOrder` is the only function that pays a buyer the order price back. `RipShipOrder.refunded` stops a second payment (D-4). Exception: a palm make-right (D-6) pays `palmRefundDue` through Part C. `returnPalmedCards` sets `refunded`, so no later path pays the price again.
- "Make it right" on an `unshippedOrder` callout calls `shipRipShipOrders([orderID])` when the order is still open, and pays a goodwill sum of 10% of the price (minimum $5). When the order was already refunded, it pays only the goodwill sum. It never calls `refundRipShipOrder`.
- "Make it right" on a `palmedHit` callout calls `returnPalmedCards(orderID)` and pays `palmRefundDue(orderID)`: the order price plus the card's market value, or only the card's value when a chargeback already refunded the price (D-6).
- A true `palmedHit` callout that peaks at heat 80 or more also calls `banFromWhatnot(days: 56, ...)`, the same ban as a palm caught on camera.
- A ship or a refund retires the act with `retireHiddenAct(id, force: true)`, exposed or not. A forced retire halves the heat of the open callout.
- The Whatnot cancel on day 7 is a chargeback from the player's cash. The player keeps the product. Each cancel is a Whatnot strike: 2 strikes in 60 days give a 4-week ban, and 3 in 120 days end Rip & Ship for the run (D-5).

### 1.8 `GameData`: one block of new fields

Add one block after `var shorts = ShortsState()` (`M/GameStore.swift` L140):

```swift
    // Sealed product play (docs/proposals/sealed-product).
    var flipperPressure = Balance.pressureStart   // Part A
    var scalperHeat = 0.0                          // Part A
    var rivals: [Rival] = []                       // Part A
    var retail = RetailState()                     // Part A
    var plug = PlugState()                         // Part B
    var ripShip = RipShipState()                   // Part B
    var hiddenActs: [HiddenAct] = []               // Part C
    var callouts = CalloutState()                  // Part C
```

Add the 8 decoder lines after `shorts = v(.shorts, shorts)` (L233) in the same order. Every new nested struct has a tolerant decoder, so an old save loads with the defaults.

## 2. Merged End Day order

`M/GameStore.swift`, `endDay()`. Existing steps keep their order. **New** steps are in bold.

| # | Step | Owner | Note |
|---|---|---|---|
| 1 | `storeDayEnd()` (L1125) | existing | |
| 2 | `data.day += 1` (L1131), `syncMarket()` | existing | Every new step below uses the new day. `endedDay = data.day - 1`. |
| 3 | `printEndDay()`, `marketEndDay()` (L1135-1136) | existing | |
| 4 | **`flippersEndDay()`** | A | Pressure, dump, strictness, heat decay, MSRP step, winter lock. Ends with `syncMarket()`. |
| 5 | resets (L1138-1141) | existing | |
| 6 | **`resetRetailDay()`** | A | |
| 7 | `decayStanding()`, `advanceSealed()` (L1142-1145) | existing | |
| 8 | **`retailOrdersEndDay()`** | A | Drawings, cancellations, missing shipments. |
| 9 | **`backRoomRestock()`** | B | |
| 10 | `advanceCards()` … `streamsEndDay()` (L1146-1161) | existing | |
| 11 | **`ripShipEndDay()`** | B | Records `unshippedOrder` before step 15 rolls. |
| 12 | `splitsEndDay()` (L1162) | existing | |
| 13 | **`distributorEndDay()`**, then **`plugEndDay()`** | B | |
| 14 | `meetupsEndDay()` … `vendingEndDay()` (L1163-1167) | existing | |
| 15 | **`calloutsEndDay()`** | C | Discovery, the weekly rival roll, heat, settle. |
| 16 | **`rivalsEndDay()`** | A | Hostility pull to base, weekly credibility regain, creator reaction. It runs after step 15, so the pull applies to today's callout changes. |
| 17 | `priceBoosts` filter … `lossesEndDay()` (L1168-1194) | existing | |
| 18 | **`storeBreakInEndDay()`** (section 4.2), guarded by `data.gameOver == nil` | Integration | |
| 19 | `storeGrowthDay()`, `businessCostsEndDay()` (L1195-1196) | existing | |
| 20 | **`alertsEndDay()`**, guarded by `data.gameOver == nil` | A | The alert fee on the 1st, tomorrow's vendor alerts. |
| 21 | `goalsEndDay()` | existing | |

**Exclusivity rule for every new step.** `GameStore.data` is `@Observable`. A closure passed to a mutating call on `data.x` must never read `data.y`. Read values into locals first. Each part lists its own risky lines: Part A section 0.5, Part B section 6.2, Part C section 8.3. Never call `recordHiddenAct`, `startCallout`, `noteRivalReceipt`, `rememberRival`, or `addLedger` inside such a closure.

## 3. Decisions

AJ approved the report as a whole. The parts found these smaller choices. The plan uses the value in the "Plan" column. AJ can change any of them before the build.

| # | Choice | Plan | Other choice |
|---|---|---|---|
| D1 | Case carry space (Part B section 12) | 1 space plus 1 for each 8 packs. An ETB case is 13 spaces, so 2 fit on a cart. | 1 space per unit, as the report wrote. Then a case is smaller than its own loose boxes. |
| D2 | Hot fill rate base (Part B 3.5) | `fillBase = 0.05`. A new account at high pressure gets about 15%, as in the real Prismatic Evolutions shortage. | 0.15, which gives about 30%. |
| D3 | Target.com (Part A 2.6) | Add a small Target.com drop on a new "Big-store sites" screen. | Drop Target.com. The bot then helps only at the Pokemon Center. |
| D4 | Club price floor (Part A 1.7) | $3.75 per pack. No catalog value changes. | Use the catalog MSRP as it is. |
| D5 | Sold-fake public post (Part C) | It opens a product integrity callout. The flat 5% follower loss goes away. A fade costs 1%. | Keep the flat 5% loss as well. |
| D6 | Repeat-visit heat (Part A) | Only a buy on a second visit adds heat. A visit to look adds nothing. | Any second visit adds heat. |
| D7 | First night of a hidden act (Part C 8.2) | An act can come out on the night it happens. | One quiet night first. |
| D8 | Per-audience reputation | Not built. One reputation number stays. | A later change can add it with no change to the callout object. |
| D9 | Buyout heat (review A, M1) | Heat and `shelfBuyout` only when the player's buy empties the item (D-1). | At most once per chain per day. |
| D10 | Simulation values (D-13) | All 17 recommended values are adopted. | — |
| D11 | Shop owner hot margin | `storeWholesaleMarketFloor` stays 0.5. Both sim runs show about $120k a year of hot margin, but the sim has no demand limit. Check it with `-retailsim` after phase 4. **AJ's call.** | 0.6 cuts it to about $77k. |
| D13 | Order-linked callouts at a full cap (cross review, major 2) | `unshippedOrder` and `palmedHit` always open their own callout. | Keep them unexposed until a slot opens. |
| D12 | Plug return | `plugMarketFloor` stays 0.65. The plug stays a strict loss for a player with legal access, and the only route for a player without it. | 0.55 makes it close to the secondary wholesaler. |

**Memory note for AJ.** After phase 2, the price refresh needs one more step: run `tools/export/cases.py` after `catalog.py`. The memory entry `project_price_refresh.md` belongs to AJ, so AJ must approve the change.

## 4. The two report items that no part owned

### 4.1 Opened-at-MSRP offer at a game shop (phase 7)

Real basis: a retailer removed the wrap and cut the pack corners, so it could sell at MSRP to people who rip ([Dexerto](https://dexerto.com/pokemon/pokemon-retailer-takes-drastic-measures-to-combat-prismatic-evolutions-scalpers-3029143)).

**Rule.** At standing Regular or higher, a game shop offers one hot in-print product at MSRP each week. The player must rip it. The player cannot sell it, list it, shelve it, vend it, split it, or sell it on Rip & Ship.

**Code.**

| File | Change |
|---|---|
| `M/LocalStores.swift`, `ShelfItem` | Add `var ripHere = false`. `ShelfItem` is runtime only, so there is no save change. |
| `M/LocalStores.swift`, `Market.shelf(_:day:discount:)` (L97) | Add a parameter `ripHere: Product? = nil`. When it is set and the shop has stock today, append one `ShelfItem` for it at `product.retailMSRP()`, quantity 1, `ripHere: true`. |
| `M/LocalStores.swift`, the caller of `Market.shelf` | Pick the product with a seeded random choice from `SetLibrary.catalog` where `isInPrint`, `isHot()`, `!isStoreExclusive`, and the kind is in `Balance.bigStoreKinds`. Pass it only when the shop standing has `standing(store).rank >= Balance.ripHereStanding.rank` (the pattern at `M/Consignment.swift` L18) and `data.retail.ripHereWeek[store.rawValue] != data.day / 7`. |
| `M/Retail.swift`, `RetailState` | Add `var ripHereWeek: [String: Int] = [:]` and its decoder line. |
| `M/Inventory.swift`, `ItemStatus` | Add `case openedAtShop`. Its `tag` is "OPENED · RIP IT". Add it to every exhaustive `switch` over `ItemStatus` (the compiler lists them). An old save has no such status. (D-15) |
| The game shop buy path | On a buy of a `ripHere` item: create the `SealedItem` with `status = .openedAtShop`, and set `ripHereWeek[store] = data.day / 7`. The view then opens the rip flow at once. |
| Sell, list, shelf, vend, split, and Rip & Ship paths | No change. They offer only items with no status, so they skip the item. The review counted 9 such paths. A status covers all of them, and any new path that follows the same rule. |
| The rip flow (`Rip/`, `RipModel.swift`) | Accept an item with status `.openedAtShop`, the same as an item with no status. |
| `Inventory/DetailViews.swift` | A row: "Opened at the shop. Rip it to see what is inside." |

**Constants** (`M/Retail.swift`): `ripHereStanding = StandingLevel.regular`, `ripHerePerWeek = 1`.

**Test.** Buy a `ripHere` item. The new item has status `.openedAtShop`. It is not in the list that the sell sheet offers. A second `ripHere` item does not show at that shop the same week.

### 4.2 Store break-in scaled by stored value (phase 7)

Real basis: thieves drove a pickup through a Tacoma card shop's doors and took about $50,000 of product ([Attack of the Fanboy](https://attackofthefanboy.com/news/thieves-rammed-a-pickup-through-a-tacoma-card-shops-doors-filled-the-truck-bed-with-pokemon-and-magic-cards-and-were-gone-in-minutes/)).

Today the own store has only daytime shoplifting (`stealFromStore`, `M/StoreEvents.swift` L242). This adds a night break-in. Cases in the back room make the stored value large, so the risk grows with Part B's cases.

**Code.** `M/Losses.swift`:

```swift
extension Balance {
    /// Own store break-in at night: the base chance, the stored sealed value that doubles it, and the cap.
    static let storeBreakInBase = 0.0005
    static let storeBreakInValueScale = 25_000.0
    static let storeBreakInMax = 0.006
    /// Security cameras multiply the chance by this.
    static let storeBreakInCameraFactor = 0.4
    /// The thieves take at most this many sealed items, cases included, and the door repair costs this much.
    static let storeBreakInMaxItems = 6
    static let storeBreakInRepair = 400.0
}

@MainActor
extension GameStore {
    /// End Day: a night break-in at the own store. The chance grows with the sealed value inside.
    func storeBreakInEndDay() -> [String] {
        guard let s = data.cardStore, storeIsBuilt else { return [] }
        let inStore = data.sealed.filter { Self.isInStore($0.status) }          // shelf and back room, cases included
        guard !inStore.isEmpty else { return [] }
        let value = inStore.reduce(0) { $0 + realMarket(of: $1) }
        var chance = min(Balance.storeBreakInMax, Balance.storeBreakInBase * (1 + value / Balance.storeBreakInValueScale))
        if s.has(.cameras) { chance *= Balance.storeBreakInCameraFactor }
        guard Double.random(in: 0..<1) < chance else { return [] }
        // The thieves pick by value. Collect the IDs into a local set first (exclusivity rule).
        let taken = inStore.sorted { realMarket(of: $0) > realMarket(of: $1) }
            .prefix(Int.random(in: 2...Balance.storeBreakInMaxItems))
        let ids = Set(taken.map(\.id))
        let lost = taken.reduce(0) { $0 + realMarket(of: $1) }
        data.sealed.removeAll { ids.contains($0.id) }
        let owed = payConsignedTheft(ids)
        addLedger(-Balance.storeBreakInRepair, .businessCosts, "Store door repair")
        return ["Someone broke into \(s.name) last night and took \(taken.count) sealed items (\(money(lost))). " +
                "The door repair cost \(money(Balance.storeBreakInRepair))." + (owed > 0 ? " You paid \(money(owed)) to a consigner." : "")]
    }
}
```

Use the real name for "item is in the store" from `M/CardStore.swift` and `storeShelf()`. The sort picks the most valuable items, with no random weight, because a break-in crew takes what is worth most.

**Rate.** With $50,000 of sealed stock and no cameras, the nightly chance is 0.0005 × 3 = 0.0015, about 0.55 break-ins a year. With cameras it is about 0.22 a year. Revision 1 gave 4.4 a year, which the review found too high.

**Insurance: the store stock rider (D-14).** Today the collection policy covers only items in the player's hands (`inHand`, `M/Losses.swift`). Revision 2 adds an optional rider:

| Item | Change |
|---|---|
| `InsuranceState` (`M/Losses.swift` L40) | Add `var storeRider = false`. Synthesized `Decodable` throws on a missing key, so give `InsuranceState` a tolerant decoder in the same style as `RetailState`. |
| `Balance` | `storeRiderRate = 0.03`: the rider costs 3% of the store's sealed value every 28 days, on top of the premium, with the same minimum. |
| The premium step | Add the rider cost to the premium on the same cycle. |
| `storeBreakInEndDay`, `stealFromStore` | With the rider, pay a claim on the lost market value at `policyCoverage`, less `policyDeductible`, through the existing claim code. The line names the payout. |
| The insurance view | A toggle "Cover store stock" with its cost. It shows only when the player has a store. |

**Test.** Set the chance to 1 through a test override. Put one sealed item in the store. After one call, the item is gone, and the ledger has one "Store door repair" entry of 400. Repeat with the rider on: the ledger also has one claim payout of `(value × 0.8) − 25`.

**Doc.** `docs/24-theft-and-insurance.md`: a new "Store break-in" section with the values above. `docs/22-own-store.md`: cameras also cut the break-in chance.

## 5. New docs and doc numbers

| Number | Doc | Owner |
|---|---|---|
| 34 | `docs/34-flippers-and-retail-limits.md` | Part A |
| 35 | `docs/35-callouts.md` | Part C |

Part B makes no new doc. It edits `docs/12`, `04`, `06`, `14`, `15`, `17`, `18`, `19`, `21`, `22`, `24`, `26`, `29`, `31`, and `08`. Add both new docs to `docs/00-overview.md`. Write all doc text in STE.

## 6. New source files

Run `xcodegen generate` in `app/` after you add them.

| File | Part |
|---|---|
| `M/Retail.swift`, `M/RetailOnline.swift`, `M/Flippers.swift`, `M/Rivals.swift` | A |
| `Buy/ChainSitesView.swift`, `Hub/FlipperViews.swift` | A |
| `M/Cases.swift`, `M/Distributor.swift`, `M/Plug.swift`, `M/RipShip.swift` | B |
| `Inventory/CaseOpenSheet.swift`, `Stream/RipShipViews.swift`, `Stream/ShipQueueView.swift`, `Buy/PlugViews.swift` | B |
| `tools/export/cases.py`, `Resources/cases.json` | B |
| `M/Callouts.swift`, `Social/CalloutViews.swift` | C |

## 7. Build order

Each phase ends with `-test`. Build Debug, install it on the booted simulator, then run `xcrun simctl launch --console-pty booted com.ajholloway.pokevendor -test`. Wait for `TEST OK`. The baseline on 2026-11-20 at `a7dd1dd` is `TEST OK: 136 checks in 2789 ms`. After phases 2, 4, and 6, also run `-retailsim 365` and compare its weekly numbers with `research_notes/Sealed product code proposal/sim_report.md` (the tuned column). `-marketsim` runs no End Day hooks, so it cannot tune these systems.

| Phase | Build | From | Why here |
|---|---|---|---|
| 0 | The `GameData` block (1.8). The types: `RetailState` and the types its fields use (`ChainStrictness`, `BatchBuy`, `DrawingWin`, `DrawingEntry`, `DropOrder`, `AlertTier`, `MissingShipment`; type definitions only), `Rival`, `RivalMemory`, `RivalKey`, `PlugState`, `RipShipState`, `HiddenAct`, `HiddenActKind` (all 14 cases with their values), `CalloutState`. Every cross-part function, with a working body where it is short and a no-op body elsewhere (D-9): Part C `recordHiddenAct`, `retireHiddenAct(_:force:)`, `exposeHiddenAct`, `startCallout` (appends only), `noteRivalReceipt`; Part A `rival`, `rivalAt`, `rememberRival`, `changeRivalCredibility`, `adjustRivalHostility`, `seedRivals` (runs on load), `noteShelfReceipt`; Part B `banFromWhatnot`, `refundRipShipOrder`, `returnPalmedCards`, and `enum RipShipRefund`; Part C also owns `RivalKey` and the rival credibility constants. `xcodegen generate`. | All | Every later phase compiles from its first line. |
| 1 | Case counts (3.1); the case item, price, open action, case fresh (3.2 to 3.4); `cases.py` and `cases.json`; the one hot test, `retailMSRP`, and the MSRP step logic (1.4, A 3.4) | B, A 0.3 | Every later system reads cases or the hot test. |
| 2 | Vendor days and batches (1.1); limits and the camp cap (1.2); pressure (2.1); dump (2.2); heat and bans (2.4); strictness (1.3); GameStop markup (1.6); club (1.7); the winter scale (A 3.5); `RetailSim` and `-retailsim` without the online and bot lines (A 7.2) | A | Pressure drives the shelf drain. Run `-retailsim 365`. |
| 3 | Drawings (1.4); cancellations (1.5); bot and Target.com (2.6); alerts (1.8); flip-margin line (2.5); "Wait for the vendor" and learned vendor days (A, D-17); `RetailSim.onlineCommon` and the flipper setup lines for the bot and alerts | A | Uses pressure and heat. |
| 4 | Distributor tiers, application, rep, fill rate, Elite, back door (4.1 to 4.6); missing shipments (1.5 of this file); plug (4.7, 4.8); stranger cases (3.5); back room (3.6) | B, A 3.3 | Needs the case item and pressure. Run `-retailsim 365`. |
| 5 | Rip & Ship (5.1 to 5.7), with `banFromWhatnot` and `refundRipShipOrder` | B | Needs the case item. Records hidden acts. |
| 6 | Rivals (2.3); the full callout system (6.1 to 6.9); `priceGouge` (1.2 of this file); the rival and credibility fixes (1.3 of this file) | A, C | Reads the hidden acts from phases 2 to 5. Run `-retailsim 365`. |
| 7 | Shows that ban in-print sealed; official card machines; the rival show table (A section 3); the opened-at-MSRP offer and the store break-in (section 4 of this file) | A, integration | Independent. |
| 8 | Doc updates from all parts, the two new docs, and the cleanup items (section 8) | All | The docs describe the built code. |

## 8. Cleanup items

These come from `research_notes/Sealed product and flipper play/current_game_systems.md`. Do them in phase 8. Phase 1 already fixes the code items.

| Item | Fix |
|---|---|
| `Wholesale.swift` L45: bundle case 12, pack case 36 | Phase 1: 25, and a 144-pack sleeved booster case. |
| `Wholesale.swift` L83 comment: "$500 minimum" | Phase 4: the comment reads the $250 constant. |
| D/19 L66-67: game shop stock 45% and 1 to 3 products | Use the code values: 92% and 5 to 9. |
| D/19 L563-570: stale moving-market table | Copy the D/05 values. |
| D/19 L72: "Holds are not built" | Check the code, then correct D/19 or D/21. |
| D/04 L30-31: "no limit" for the no-store distributor | 1 case of each product, 2 cases a week (Part B section 7). |
| D/13 L63-65: 1,836 sealed products | 1,853. |
| D/21 L3 and L18-20: "designed but not built" | Remove the stale sentence. |
| D/12 L34-36: eBay "international product" | "Some listings ship from another country: the same English product, 12% cheaper, 10-day delivery." |
| D/12 L83-86: "other buyers get the stock first" | Phase 2 makes it true. Point the text to the pressure rule. |
| D/04 and D/12: Elite "priority case allocation" | Phase 4 builds it (4.5). |

## 9. Guardrails for the whole build

- Do not add slab cracking or resubmission, Japanese product, preorders, new set releases during a run, or livestream group breaks. Rip & Ship is one buyer, one whole sealed product, and every card goes to that buyer.
- Game logic never changes a real graded price. Only Part A's flipper dump and MSRP step change prices, and they act only on sealed products through market events. Parts B and C read prices and never write them.
- Challenge cash stays one book number. Every cost and refund goes through `addLedger`. Plug orders use the `.grayMarket` category, which income tax ignores.
- No animation uses a full-screen white or bright flash. Use rings, glows, or confetti near the card.
- Rival and creator names are fictional.
- Commit straight to `main` after each phase that passes `-test`.
