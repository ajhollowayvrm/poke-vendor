# Part A code proposal: big-box stores, flippers, and the smaller retail mechanics

Revision 2. Status: proposal. Nothing here is built.

Scope: report sections "Big-box stores get full allotments and ration them at 1 to 5 items" (1.1 to 1.8), "Flippers compete for the same shelf and lose money on reprints" (2.1 to 2.6), and the assigned rows of "More mechanics that the notes support" (shows that ban in-print sealed, official card machines, missing distributor shipments, the MSRP step, the stronger post-holiday sell-off).

Order of authority: `research_notes/Sealed product code proposal/r2_decisions.md` (D-1 to D-17), then `00-integration.md`, then this file.

Source of truth: the code at commit `a7dd1dd`. Its Swift code is the same as `503ff3c`. Line numbers are from that code. `M` = `app/PokeVendor/Model`. The app builds clean, and `-test` passes with 136 checks in 2.8 s.

## Revision 2 changes

Finding IDs: `A-` is `review_part_a.md`, `C-` is `review_part_c_integration.md`, `S-` is `sim_report.md`, `D-` is `r2_decisions.md`.

| Finding | Fix | Where |
|---|---|---|
| A-B1 | `Market.retail` becomes `nonisolated`, so the nonisolated `Product` helpers compile. | 1.1 "Hot and MSRP helpers" |
| A-B2 | The batch pool uses the print status on the vendor day (`Product.inPrint(on:)`). Batch item IDs use the product ID, not the index. T2 checks stability over a print change. | 1.1, 7 (T2) |
| A-M1, C-M4, S-1, D-1 | Heat and `shelfBuyout` only when the player's buy empties the item and the player bought 2 or more of it in that visit. Heat hints at 60% and 85% of the ban level. | 1.2 `notePurchase`, 2.4 |
| A-M2 | The cancel roll day is at most `deliveryDays - 1`. | 1.5 `addDropOrder`, T4 |
| A-M3, D-13 | A club item with no MSRP uses its club floor price for the hot test. Store exclusives never enter a batch. | 1.1 `Market.batch`, 1.7 |
| A-M4, C-M6, D-10 | Rival lines come from the model at the visit start, once. The view only reads them. No line when the player emptied the item. Receipt chance 0.05. Part C's `noteRivalReceipt` keeps the 30-day gap for each rival. | 1.2 `arrive(at:hour:)`, 2.3 |
| A-M5, D-16 | New `-retailsim <days>` launch argument, designed in full. | 7.2 |
| A-M6, D-11 | A drawing win goes to a 2-day claim list. The player pays on the hub. No charge at End Day. | 1.4 |
| A-M7, D-12 | `registerMissingShipment(name:refund:learnIn:)` and `Balance.missingShipmentRefundDays`. | 3.3 |
| A-m1 | The visitor code is `makeBuyer` (L1143). The insert goes between L1205 and L1206. | 2.3 |
| A-m2 | `bring` is at L818. | 3.1 |
| A-m3 | `CampView` lines L91-93, L106, L111. All three `haul.store.rawValue` uses are listed. | 3.2 |
| A-m4 | `buyWholesale` L85, short block L95-101, refund L99, loop L102-107. | 3.3 |
| A-m5 | `purchase(_:)` L175, `OfferRow` L196. | 1.5, 2.6 |
| A-m6 | GameTests L332. | 1.2 |
| A-m7 | The note on `[Int: Double]` encoding is corrected. | 0.3 |
| A-m8 | `retailMSRP` rounds only after the step. Before it, the raw catalog MSRP is the price. | 1.1 |
| A-m9 | T11: a save round trip of `retail`, `rivals`, and `flipperPressure` with non-default values. | 7 |
| A-m10 | The first seed of rivals on an old save also marks the live events as seen and sets the follower tier mark. | 2.3 `seedRivals` |
| A-m11 | `dueDrawings`, `dueOrders`. | 1.4, 1.5 |
| A-m12 | Integration 4.2 must call `Self.isInStore`. Not in this file. | 10 (contract) |
| A-m13 | No change: Part C's `recordHiddenAct` already has `@discardableResult`. | 0.6 |
| A-m14 | `capDump` never raises a price. | 2.2 |
| A-m15 | `clubPrice(_:day:)`. | 1.7 |
| A-m16 | Pokemon Center price `p.retailMSRP(day: day)`. | 3.4 |
| A-m17 | Alerts: no double charge, `oneChain` needs a big store, `coverWithLine` for the monthly fee. | 1.8 |
| A-m18 | A negative vendor day is allowed, so day 0 has leftovers. | 1.1 |
| A-m19 | At a banned show, visitor sellers and traders bring no in-print sealed. | 3.1 |
| A-m20 | `dumpSetsForCorrection` sorts by count, then slug. | 2.2 |
| A-m21 | The "per payment card" kind is strictness level 2 (one checkout a day). The docs say so. | 1.2, 8 |
| A-m22 | `ChainStrictness.lastIncident` shows the cause under a strict chain. | 1.3, 2.1 UI |
| A-m23 | A `HOT` capsule and a caption on shelf and camp rows. | 1.2 UI |
| A-m24 | Ban banner at camps, a cancel-window row, pending refunds in the Wallet, a club expiry warning, the entered drawing product, the "next drawing opens Monday" text, and a dump that shows on its first day. | 1.2, 1.4, 1.5, 1.7, 2.2, 3.3 |
| A tests (item 8) | T1 uses quantity 6 or more. T3 uses its own `fresh()`. T8 appends the struct directly. New lines for B2, M2, M6, m9, and Target.com attempt gating. | 7 |
| A section 5 | The `isChallengeItem` flag is removed: an item with a status cannot join a challenge (`challengeBlock`, `M/Shorts.swift` L387). | 1.5 |
| C-B1, D-8 | `Rival.credibility` holds named-rival credibility, clamped at Part C's `rivalCredFloor`. `rivalsEndDay` regains it once a week. `RivalKey` is Part C's type. | 2.3 |
| D-17 (C-I3) | A rival's show table on the floor. A fake bought there gives a receipt against that rival when it comes out. | 2.3 "The rival's table on the floor" |
| C-B2, D-9 | The rival types and API are phase 0 stubs with full bodies. `seedRivals()` runs in phase 0. | 2.3, 11 |
| C-M3, D-2 | Hidden-act weights come from Part C's table, not from heat. `shelfBuyout` passes 5 witnesses. | 0.6 |
| C-C2, C-m1 | `Theme.red` does not exist. The rival mood uses `.red`. | 2.3 UI |
| D-13 | Vendor hours [8, 10, 13, 16], weekdays Tuesday to Saturday, drain 0.2 + 0.6 × pressure, ban 21 days, incident 0.05, decay 90 days, receipt 0.05. | 4 |
| S-A11 | The first winter of a run locks at scale 1, so a run that starts inside the dip has a lock. | 3.5 |
| D-17 (A-S1) | The player learns a chain's vendor weekday by seeing a fresh batch. | 1.1, 1.2 UI |
| D-17 (A-S2) | "Wait for the vendor" at a stop. A hostile rival in the aisle takes one hot item first. | 1.2, 2.3 |
| D-17 (A-S3) | Heat hints (same as D-1). | 2.4 |
| D-17 (A-S4) | A player buyout raises that chain's incident chance for a time. | 1.3 |
| Merge artifact | The merge renamed the upgrade case too. The `Upgrade` case is `checkoutBot`. The hidden act is `botCheckout`. | 2.6 |

Declined or deferred:

| Finding | Why |
|---|---|
| A-M1 option "once per chain per day" | D-1 chose the "empties the item" rule. |
| C-M6 item 1 (receipts only from rival wrongdoing) | D-10 keeps a 0.05 receipt on a "rival took the stock" line. This file adds the 30-day gap from C-M6 item 2. C-M6 item 3 (scale by credibility) is Part C's reply code. |
| A-S5, A-S6 | D-17 allows at most 4 improvements. S1 to S4 come first. |
| C-I7, C-I8 | Part C review improvements. Part C decides. The hooks exist (the `rose` value in `rivalsEndDay`, `RivalsBox`). Part C adopted C-I3, and this file builds its buy path. |
| S `storeWholesaleMarketFloor`, `plugMarketFloor`, `hotProductRatio` | D-13 does not adopt them. |

Corrections to `current_game_systems.md` that this plan depends on:

- The game already charges platform fees on sealed sales: `Balance.ebayFeeRate = 0.1325` and `Balance.tcgFeeRate = 0.1075` ([M/Balance.swift L77-80](../../../app/PokeVendor/Model/Balance.swift)). Proposal 2.5 adds no new fee. It reads the fees through `GameStore.saleCosts` ([M/Upgrades.swift L234-239](../../../app/PokeVendor/Model/Upgrades.swift)).
- The game has no Target.com storefront. Proposal 2.6 names "two Target.com attempts". Integration decision D3 keeps a small Target.com drop (section 2.6).
- Synthesized `Decodable` in Swift does not use default values. A missing key throws. `GameData.init(from:)` ([M/GameStore.swift L144-235](../../../app/PokeVendor/Model/GameStore.swift)) catches the throw and uses the default for the whole field. So a new field inside an old nested struct resets the whole struct. `RetailState` and `Rival` get their own tolerant decoders.
- 93.9% of the big-store pool is hot (market at 1.2 × MSRP or more; median 2.57 × MSRP). The limits and the heat rules are built for that fact (sections 1.2 and 2.4).

---

## 0. Shared foundation

### 0.1 New source files

Create these files. Then run `xcodegen generate` in `app/`.

| File | Holds |
|---|---|
| `M/Retail.swift` | `RetailState`, `PurchaseLimit`, `LimitRule`, `ChainStrictness`, `BatchBuy`; vendor slots, batches, the drain, limits, visits, strictness, the club store, the GameStop markup; `Product.retailMSRP(day:)`, `Product.isHot(day:)`, `Product.inPrint(on:)` |
| `M/RetailOnline.swift` | `DrawingEntry`, `DrawingWin`, `DrawingOffer`, `DropOrder`, `AlertTier`, `MissingShipment`; drawings, Target.com drops, order cancellations, alerts, missing shipments; `retailOrdersEndDay()`, `alertsEndDay()` |
| `M/Flippers.swift` | Flipper pressure, the flipper dump, scalper heat, the online sale factor, the flip margin, the MSRP step, the winter scale; `flippersEndDay()` |
| `M/Rivals.swift` | `RivalKey`, `Rival`, `RivalMemory`; seeding, the API for Parts B and C, rival lines, `rivalsEndDay()` |
| `app/PokeVendor/Buy/ChainSitesView.swift` | `ChainSitesView`: the Walmart drawing, chain drawings, the Target.com drop |
| `app/PokeVendor/Hub/FlipperViews.swift` | `FlipperMarketBox`, `RivalsBox`, `RestockAlertsBox`, `HotTag` |
| `app/PokeVendor/Hub/RetailSim.swift` (Debug only) | `RetailSim`, the `-retailsim` tuning run (section 7.2) |

Edited files: `GameStore.swift`, `LocalStores.swift`, `Camping.swift`, `Market.swift`, `PriceCycle.swift`, `PrintRuns.swift`, `Seasons.swift`, `Upgrades.swift`, `WholesaleAccount.swift`, `Wholesale.swift`, `Shows.swift`, `Collections.swift` (one guard), `App/AppNav.swift`, `Buy/StoreRunViews.swift`, `Buy/BuyViews.swift`, `Hub/OpportunityView.swift`, `Hub/HubView.swift`, `Hub/HubView+Debug.swift`, `Hub/GoalsMarketViews.swift`, `Hub/UpgradesView.swift`, `Hub/WalletView.swift`, `Inventory/DetailViews.swift`, `Hub/GameTests.swift`.

### 0.2 New fields on `GameData`

Integration 1.8 adds one block of 8 fields after `var shorts = ShortsState()` (`M/GameStore.swift` L140), with 8 decoder lines after L233. Part A owns these four:

```swift
    /// Flipper pressure: how hard flippers compete for in-print sealed, 0.1 to 0.9 (Model/Flippers.swift).
    var flipperPressure = Balance.pressureStart
    /// The player's hidden scalper heat over all chains and bots (Model/Flippers.swift). No cap.
    /// 10 at one chain gets the player refused at that chain (`retail.storeHeat`).
    var scalperHeat = 0.0
    /// Named rival flippers and rival creators (Model/Rivals.swift).
    var rivals: [Rival] = []
    /// Limits, vendor batches, strictness, drawings, online orders, alerts, and the MSRP step (Model/Retail.swift).
    var retail = RetailState()
```

```swift
        flipperPressure = v(.flipperPressure, flipperPressure)
        scalperHeat = v(.scalperHeat, scalperHeat)
        rivals = v(.rivals, rivals)
        retail = v(.retail, retail)
```

An old save has none of the keys. `v()` gives the defaults. `seedRivals()` fills `rivals` on the first load (section 2.3).

### 0.3 `RetailState` and its tolerant decoder

File: `M/Retail.swift`.

```swift
import Foundation

/// The strictness of one chain (proposal 1.3). Level 0 is the base limit. Level 4 stops in-store card sales.
struct ChainStrictness: Codable, Hashable {
    var level = 0
    /// The day the level last changed. A level falls by one after `Balance.strictnessDecayDays`.
    var lastChange = 0
    /// Level 4: the last day of the stop.
    var closedUntil: Int? = nil
    /// The text of the last incident, for the Market screen.
    var lastIncident: String? = nil
}

/// Units taken from one vendor batch item. The batch stock carries over to later days.
struct BatchBuy: Codable, Hashable {
    let vendorDay: Int
    var count: Int
    /// True when the player's buy took the last unit. No rival line then blames a rival.
    var emptied: Bool? = nil
}

/// A drawing that the player won. The player pays and claims it on the hub, or it lapses (D-11).
struct DrawingWin: Codable, Identifiable, Hashable {
    var id = UUID()
    let chain: LocalStore
    let productID: String
    let price: Double
    /// The last day to claim.
    let claimUntil: Int
}

struct RetailState: Codable, Hashable {
    /// Flipper pressure on each recent day, by day (the last `Balance.pressureLogDays`). The drain reads it.
    var pressureLog: [Int: Double] = [:]
    /// Market events that already moved the pressure.
    var seenEvents: [UUID] = []
    /// By `LocalStore.rawValue`.
    var strictness: [String: ChainStrictness] = [:]
    /// A decaying boost to a chain's incident chance from the player's own buyouts (D-17, A-S4).
    var incidentBoost: [String: Double] = [:]
    var storeHeat: [String: Double] = [:]
    /// The last day of a ban at each chain.
    var bannedUntil: [String: Int] = [:]
    /// The highest heat hint already shown at each chain today: 0, 1 (60%), or 2 (85%).
    var heatHintShown: [String: Int] = [:]
    /// Today: visits to each chain, items and hot items in the current visit, the visit of the first checkout,
    /// and units of each product in the current visit (for the buyout rule).
    var visits: [String: Int] = [:]
    var visitBought: [String: Int] = [:]
    var visitHotBought: [String: Int] = [:]
    var checkoutVisit: [String: Int] = [:]
    var visitProductBought: [String: Int] = [:]
    /// Rival lines for the current visit, by `ShelfItem.id`. The model writes them at the visit start (D-10).
    var visitLines: [String: String] = [:]
    /// Units that the player bought from vendor batches, and units that a rival took on a wait, by `ShelfItem.id`.
    var batchBought: [String: BatchBuy] = [:]
    var rivalTaken: [String: BatchBuy] = [:]
    /// The vendor weekday that the player saw at each chain (D-17, A-S1).
    var seenSlot: [String: Int] = [:]
    /// Sealed items bought at a rival's show table, by item ID (`uuidString`), with the rival's ID (C-I3).
    var rivalBuys: [String: UUID] = [:]
    /// The club store (proposal 1.7): the last day of the membership, and the day of the last hot club buy.
    var clubUntil: Int? = nil
    var clubHotDay = -1
    /// Online (proposals 1.4, 1.5, 2.6).
    var drawings: [DrawingEntry] = []
    var drawingWins: [DrawingWin] = []
    var dropOrders: [DropOrder] = []
    var targetAttempts = 0
    var targetAttemptDay = -1
    /// Restock alerts (proposal 1.8).
    var alertTier = AlertTier.none
    var alertStore: LocalStore? = nil
    /// The first day the alerts work. A start late in a month waits for the 1st.
    var alertStartDay = 0
    /// The MSRP step: the day it happens. Nil until the game announces it. At most once per run.
    var msrpStepDay: Int? = nil
    /// The after-holiday dip scale for each winter, by the year of its center.
    var winterScales: [Int: Double] = [:]
    var missingShipments: [MissingShipment] = []
    /// The follower tier that the creator rivals last reacted to.
    var followerTierMark = 0
    /// Integration 1.2 and 4.1 keep their state here.
    var gougeDay = -1
    var ripHereWeek: [String: Int] = [:]
}

/// A save from an older build can miss newer fields. Each missing field takes its default.
extension RetailState {
    init(from decoder: Decoder) throws {
        self.init()
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func v<T: Decodable>(_ key: CodingKeys, _ fallback: T) -> T {
            (try? c.decodeIfPresent(T.self, forKey: key)) ?? fallback
        }
        pressureLog = v(.pressureLog, pressureLog)
        seenEvents = v(.seenEvents, seenEvents)
        strictness = v(.strictness, strictness)
        incidentBoost = v(.incidentBoost, incidentBoost)
        storeHeat = v(.storeHeat, storeHeat)
        bannedUntil = v(.bannedUntil, bannedUntil)
        heatHintShown = v(.heatHintShown, heatHintShown)
        visits = v(.visits, visits)
        visitBought = v(.visitBought, visitBought)
        visitHotBought = v(.visitHotBought, visitHotBought)
        checkoutVisit = v(.checkoutVisit, checkoutVisit)
        visitProductBought = v(.visitProductBought, visitProductBought)
        visitLines = v(.visitLines, visitLines)
        batchBought = v(.batchBought, batchBought)
        rivalTaken = v(.rivalTaken, rivalTaken)
        seenSlot = v(.seenSlot, seenSlot)
        rivalBuys = v(.rivalBuys, rivalBuys)
        clubUntil = v(.clubUntil, clubUntil)
        clubHotDay = v(.clubHotDay, clubHotDay)
        drawings = v(.drawings, drawings)
        drawingWins = v(.drawingWins, drawingWins)
        dropOrders = v(.dropOrders, dropOrders)
        targetAttempts = v(.targetAttempts, targetAttempts)
        targetAttemptDay = v(.targetAttemptDay, targetAttemptDay)
        alertTier = v(.alertTier, alertTier)
        alertStore = v(.alertStore, alertStore)
        alertStartDay = v(.alertStartDay, alertStartDay)
        msrpStepDay = v(.msrpStepDay, msrpStepDay)
        winterScales = v(.winterScales, winterScales)
        missingShipments = v(.missingShipments, missingShipments)
        followerTierMark = v(.followerTierMark, followerTierMark)
        gougeDay = v(.gougeDay, gougeDay)
        ripHereWeek = v(.ripHereWeek, ripHereWeek)
    }
}
```

Encoding note: Swift's `Codable` writes an `Int`-keyed dictionary as a keyed container, so the JSON is an object with string keys (`"12": 0.5`). Only keys that are not `String` or `Int` use a flat array. Every dictionary in this plan has `String` or `Int` keys. T11 checks the round trip of every field (section 7).

### 0.4 End Day order

File: `M/GameStore.swift`, `endDay()` (L1106-1207). Integration section 2 merges all parts. Part A's steps:

| Integration step | Step | Why here |
|---|---|---|
| 3 (existing, L1135-1136) | `printEndDay`, `marketEndDay` | They create today's print and market news. |
| 4 | `lines += flippersEndDay()` | Reads today's news, print changes, regime, and season. Changes the pressure, adds dump events, rolls incidents, decays heat, rolls the MSRP step, locks the winter scale. Ends with `syncMarket()`, before any price read of the new day. |
| 5 (existing, L1137-1141) | resets of `boughtToday`, `shelfBought`, `pokemonCenterAttempted`, `weekBought` | |
| 6 | `resetRetailDay()` | Clears today's visit state. Prunes old batch entries and the pressure log. |
| 7 (existing, L1142-1145) | `decayStanding`, `advanceSealed` | |
| 8 | `lines += retailOrdersEndDay()` | Drawing results, lapsed claims, cancellations, missing shipments, the club expiry warning. After `advanceSealed`, so a new `.arriving` item keeps its full days. |
| 16 | `lines += rivalsEndDay()` | After Part C's `calloutsEndDay()` (step 15). Hostility pull, weekly credibility regain, creator reaction, and receipts for fakes found from a rival's show table (C-I3). No money moves. |
| 20 | `if data.gameOver == nil { lines += alertsEndDay() }` | The alert fee on the 1st with the other monthly costs, then tomorrow's vendor alerts. |

`endedDay` inside the new hooks is `data.day - 1`, because L1131 already moved the day.

### 0.5 The exclusivity rule in every new hook

`GameStore.data` is `@Observable`. A closure passed to a mutating call on `data.x` must never read `data.y`. It crashes with "Fatal access conflict detected", and only when the array is not empty. Every new function follows these rules:

1. Read every value that a closure needs into a `let` first: `let today = data.day`.
2. For many changes to one struct, copy it out, change the copy, and write it back once: `var retail = data.retail; ...; data.retail = retail`. `demandEndDay()` does this ([M/Demand.swift L44-49](../../../app/PokeVendor/Model/Demand.swift)).
3. Never call a `GameStore` method that reads `data` from inside `removeAll`, `sort(by:)`, or another mutating call on `data.x`.
4. Never call `recordHiddenAct`, `noteRivalReceipt`, `rememberRival`, `addHeat`, or `addLedger` from inside such a closure. Each writes `data`.
5. No view body writes `data`. Model state changes come from button actions and from model functions (D-10).

Each section below names the places where the rule matters.

### 0.6 Hidden acts that Part A records

Part C owns `HiddenActKind` and `recordHiddenAct(_:weight:note:witnesses:contactID:revealDay:refund:sourceID:)`. The function already has `@discardableResult` (Part C section 1.3), so Part A ignores the returned ID with no warning.

The weight is the size of the act, not the heat it adds (D-2). Part A uses Part C's weight table (Part C section 1.4) and the new rows from review C-M3:

| Case | When Part A records it | `weight` | `witnesses` | Heat added |
|---|---|---|---|---|
| `shelfBuyout` | A buy that empties a hot item at a big store or the club, when the player bought 2 or more units of it in that visit (D-1) | `min(2, 1.0 + 0.25 × (units − 2))` | 5 | `heatLimitBuy` (1) |
| `limitEvasion` | The first buy on a second or later visit to one chain on one day | 1.0 | 0 | `heatRepeatVisit` (2) |
| `botCheckout` | Each Pokemon Center or Target.com attempt with the checkout bot | 0.5 | 0 | `heatBotUse` (3) |
| `storeBan` | Staff refuse card sales to the player at a chain | 1.5 | 3 | none |
| `botOrderCancelled` | A store cancels a bot order | 0.5 | 0 | none |

---
## 1. Big-box stores

### 1.1 Weekly vendor day and a draining batch

**What changes.** A big store no longer rolls 12% stock each day. Each big store and the club store has a hidden vendor slot that is fixed for the run: one weekday from Tuesday to Saturday, and one hour from `[8, 10, 13, 16]`. On that day, at that hour, a large batch arrives. The batch drains through the store's open hours. On later days the shelf shows what is left, until the next vendor day. Two of the four hours fall at or after the end of the work day, and Saturday is a day off, so a player with a job can reach some vendor stock (sim problem 6).

Weekday math: `data.day % 7` is the weekday, and 0 is Monday ([M/GameStore.swift L295](../../../app/PokeVendor/Model/GameStore.swift)). Tuesday to Saturday is 1 to 5.

**`LocalStore` changes.** File: `M/LocalStores.swift` L4-14. Append the club case at the end of the enum. `LocalStore.allCases.firstIndex(of:)` then keeps its old values for the existing seeds (`Market.shelf` L98, `restockDay` Camping L39, `camp` Camping L91). No code switches exhaustively over `LocalStore` today.

```swift
enum LocalStore: String, CaseIterable, Codable, Hashable {
    case target = "Target", walmart = "Walmart", bestBuy = "Best Buy", gamestop = "GameStop"
    case barnes = "Barnes & Noble", castle = "Cardboard Castle", topDeck = "Top Deck Games"
    /// The club store (proposal 1.7). Last, so the older seeds keep their salts.
    case club = "Warehouse club"

    var isGameShop: Bool { self == .castle || self == .topDeck }
    var isClub: Bool { self == .club }
    /// A big chain with a posted camp restock: Target, Walmart, Best Buy, GameStop, Barnes & Noble.
    var isBigStore: Bool { !isGameShop && !isClub }
    static let baseHours = 40.0 / 60.0
    var hours: Double { Self.baseHours }
    /// Game shops only. Big stores and the club use vendor days (Model/Retail.swift).
    var stockChance: Double { 0.92 }
}
```

Replace `!store.isGameShop` with `store.isBigStore` in `M/Camping.swift` L47 and L59, so the club gets no posted camp restock.

**`ShelfItem` changes.** File: `M/LocalStores.swift` L17-22. The new fields have defaults, so every existing `ShelfItem(id:product:price:quantity:)` call still compiles (GameTests L332 uses one).

```swift
struct ShelfItem: Identifiable, Hashable {
    let id: String
    let product: Product
    let price: Double
    /// For a batch item: the units on the shelf at the visit hour, before the player's own buys.
    let quantity: Int
    /// The vendor day of a big-store or club batch item. Nil for a game shop, camp, or machine item.
    var batchDay: Int? = nil
    /// Hot on the vendor day: market at `Balance.hotProductRatio` × MSRP or more.
    var hot = false
    /// The units in the batch before any drain.
    var batchQuantity = 0
}
```

**Hot and MSRP helpers.** Every helper below is nonisolated, because `Product` and its extensions are nonisolated (`M/SetData.swift` L46, `M/PriceCycle.swift` L444-448).

First, `M/Market.swift` L84: `enum Market` is `@MainActor` (L76-77). Mark the rounding function `nonisolated`. It reads no state:

```swift
    nonisolated static func retail(_ x: Double) -> Double {
        x >= 5 ? x.rounded(.down) + 0.99 : (x * 100).rounded() / 100
    }
```

Then, file `M/Retail.swift`:

```swift
extension Product {
    /// In print on a given day. The batch uses the vendor day, so a print change later in the week does not change
    /// a batch that is already on the shelf. `isInPrint` (M/PrintRuns.swift L168-170) stays for today's reads.
    func inPrint(on day: Int) -> Bool {
        Set(mix.map(\.slug)).allSatisfy { PriceCycle.inPrint($0, day: day) }
            || PriceCycle.productReprinted(id, slug: homeSlug, day: day)
    }

    /// The market price on a day.
    func marketPrice(day: Int? = nil) -> Double { PriceCycle.price(baseMarket, marketFactor(day: day)) }

    /// The retail price at a big store and the Pokemon Center, and the base of the wholesale price. Before the MSRP
    /// step it is the catalog MSRP, with no rounding. On and after the step day it is the stepped MSRP, rounded.
    func retailMSRP(day: Int? = nil) -> Double? {
        let f = PriceCycle.msrpFactor(day: day)
        return f == 1 ? msrp : msrp.map { Market.retail($0 * f) }
    }

    /// Hot: the market on the day is `Balance.hotProductRatio` × MSRP or more.
    func isHot(day: Int? = nil) -> Bool {
        guard let m = retailMSRP(day: day), m > 0 else { return false }
        return marketPrice(day: day) >= m * Balance.hotProductRatio
    }
}
```

`GameStore.isHot(_:)` ([M/WholesaleAccount.swift L38-41](../../../app/PokeVendor/Model/WholesaleAccount.swift)) becomes `func isHot(_ product: Product) -> Bool { product.isHot() }`. Integration 1.4 makes these the only definitions.

**Batch sizes.** File: `M/Retail.swift`.

```swift
extension LocalStore {
    /// The units in a batch on a vendor day.
    var batchSize: Int {
        switch self {
        case .walmart: 30
        case .target: 24
        case .bestBuy: 12
        case .gamestop: 10
        case .barnes: 6
        case .club: Balance.clubBatchSize
        case .castle, .topDeck: 0
        }
    }

    var batchProducts: ClosedRange<Int> {
        switch self {
        case .walmart: 4...6
        case .target: 3...5
        case .bestBuy, .gamestop, .club: 2...4
        case .barnes: 1...3
        case .castle, .topDeck: 0...0
        }
    }
}
```

**The batch.** File: `M/Retail.swift`.

```swift
@MainActor
extension Market {
    /// The full batch of a big store or the club on its vendor day, before any drain. The same run and day always
    /// give the same batch: the pool uses the print status on the vendor day, and each item ID holds its product ID.
    /// `seed` is the run's market seed, so each run has its own batches. A vendor day before day 0 is allowed, so the
    /// shelf on the first days of a run shows leftovers.
    static func batch(_ store: LocalStore, vendorDay: Int, seed: UInt64) -> [ShelfItem] {
        guard store.batchSize > 0 else { return [] }
        let salt = UInt64(LocalStore.allCases.firstIndex(of: store) ?? 0) + 11
        var r = SeededRandom(seed: (UInt64(bitPattern: Int64(vendorDay + 1)) &* 15_485_863 &+ salt &* 3_571) ^ seed)
        let options = SetLibrary.catalog.filter { p in
            guard p.inPrint(on: vendorDay) else { return false }
            if store.isClub { return p.isClubExclusive }
            // Store exclusives (Pokemon Center and club items) never enter a big-store batch (D-13).
            return !p.isStoreExclusive && Balance.bigStoreKinds.contains(p.kind) && p.msrp != nil && p.packs <= 11
        }
        guard !options.isEmpty else { return [] }
        var picks: [Product] = []
        for _ in 0..<r.int(store.batchProducts) {
            let p = options[r.int(0...(options.count - 1))]
            if !picks.contains(where: { $0.id == p.id }) { picks.append(p) }
        }
        // Each product gets at least `batchMinUnits`. The rest goes by random weights.
        let weights = picks.map { _ in r.double(0.5...1.5) }
        let total = weights.reduce(0, +)
        let spare = max(0, store.batchSize - Balance.batchMinUnits * picks.count)
        return picks.enumerated().map { i, p in
            let qty = Balance.batchMinUnits + Int((Double(spare) * weights[i] / total).rounded())
            // A club item with no MSRP uses its club price for the hot test (D-13).
            let hot = store.isClub && p.msrp == nil
                ? p.marketPrice(day: vendorDay) >= clubPrice(p, day: vendorDay) * Balance.hotProductRatio
                : p.isHot(day: vendorDay)
            let msrp = p.retailMSRP(day: vendorDay) ?? p.marketPrice(day: vendorDay)
            let price: Double = switch store {
            case .club: retail(clubPrice(p, day: vendorDay))
            // Proposal 1.6: GameStop marks up hot product.
            case .gamestop where hot: retail(msrp * r.double(Balance.gameStopHotMarkup))
            default: msrp
            }
            return ShelfItem(id: "v\(vendorDay)-\(store.rawValue)-\(p.id)", product: p, price: price, quantity: qty,
                             batchDay: vendorDay, hot: hot, batchQuantity: qty)
        }
    }
}
```

`Balance.bigStoreKinds` is the existing list at `M/LocalStores.swift` L106 moved into a constant: `["Booster pack", "Blister", "Tin", "Booster bundle", "Elite Trainer Box", "Collection"]`.

**Vendor slot, batch day, and drain.** File: `M/Retail.swift`.

```swift
@MainActor
extension GameStore {
    /// The fixed vendor slot of a store for this run. `PriceCycle.unit` mixes the run's market seed.
    func vendorSlot(_ store: LocalStore) -> (weekday: Int, hour: Double) {
        let d = PriceCycle.unit("vendor-day-" + store.rawValue)
        let h = PriceCycle.unit("vendor-hour-" + store.rawValue)
        let days = Balance.vendorWeekdays        // 1...5, Tuesday to Saturday
        let hours = Balance.vendorHours          // [8, 10, 13, 16]
        return (days.lowerBound + min(days.count - 1, Int(d * Double(days.count))),
                hours[min(hours.count - 1, Int(h * Double(hours.count)))])
    }

    /// The vendor day of the batch on the shelf at this moment: the last vendor day at or before it.
    /// Before the vendor hour on a vendor day, the shelf still holds last week's batch.
    func batchDay(_ store: LocalStore, day: Int, hour: Double) -> Int {
        let slot = vendorSlot(store)
        var d = day - (((day % 7) - slot.weekday) % 7 + 7) % 7
        if d == day && hour < slot.hour { d -= 7 }
        return d
    }

    /// The share of a batch item left after the open hours from the vendor's arrival to the visit. A hot item
    /// drains at `0.2 + 0.6 × pressure` an hour, with the pressure of each day. Other items drain at 0.05 an hour.
    func drainShare(hot: Bool, fromDay: Int, fromHour: Double, toDay: Int, toHour: Double) -> Double {
        guard toDay >= fromDay else { return 1 }
        let history = data.retail.pressureLog
        let now = data.flipperPressure
        var total = 0.0
        for d in fromDay...toDay {
            let open = max(Balance.storeOpen, d == fromDay ? fromHour : Balance.storeOpen)
            let close = min(Balance.storeClose, d == toDay ? toHour : Balance.storeClose)
            guard close > open else { continue }
            let p = history[d] ?? now
            let rate = hot ? Balance.hotDrainBase + Balance.hotDrainPressure * p : Balance.coldDrainRate
            total += rate * (close - open)
        }
        return exp(-total)
    }

    /// The shelf at a stop. A game shop keeps its daily shelf. A big store or the club shows its batch after the
    /// drain. At strictness 3, hot items leave the shelf for a drawing. At strictness 4 the shelf is empty. A ban
    /// does not hide the shelf: the limit is 0 and the view says why.
    func shelf(at store: LocalStore, hour: Double) -> [ShelfItem] {
        if store.isGameShop { return Market.shelf(store, day: data.day, discount: shopDiscount(store)) }
        let level = strictness(store).level
        guard level < 4 else { return [] }
        let today = data.day
        let vDay = batchDay(store, day: today, hour: hour)
        let slot = vendorSlot(store)
        return Market.batch(store, vendorDay: vDay, seed: data.marketSeed).compactMap { item in
            if level >= 3 && item.hot { return nil }
            let share = drainShare(hot: item.hot, fromDay: vDay, fromHour: slot.hour, toDay: today, toHour: hour)
            return ShelfItem(id: item.id, product: item.product, price: item.price,
                             quantity: Int((Double(item.batchQuantity) * share).rounded()),
                             batchDay: vDay, hot: item.hot, batchQuantity: item.batchQuantity)
        }
    }
}
```

The `batchDay` formula uses a double modulo, so a negative day gives a correct weekday.

Exclusivity: `shelf(at:hour:)` and `drainShare` only read `data`. The `compactMap` runs on a local array. Safe.

`Market.shelf` (L97-122) keeps only the game-shop branch. Replace the big-store branch (L106-121) with `return []`. `HubView+Debug.swift` L115 calls it for `.castle` only.

Example at pressure 0.5: the hot drain is 0.5 an hour. After 1 hour 61% is left. After 2.5 hours 29% is left. A 16:00 slot on a weekday has 61% left at 17:00.

**`shelfLeft` and the box copy.** File: `M/GameStore.swift` L782.

```swift
    func shelfLeft(_ item: ShelfItem) -> Int {
        if item.batchDay != nil {
            let mine = data.retail.batchBought[item.id]?.count ?? 0
            let rival = data.retail.rivalTaken[item.id]?.count ?? 0
            return max(0, item.quantity - mine - rival)
        }
        return item.quantity - (data.shelfBought[item.id] ?? 0)
    }

    /// The copy of a shelf item that the player takes next: the front box (BoxContents.shelfKey).
    func shelfCopy(_ item: ShelfItem) -> Int {
        item.batchDay != nil ? data.retail.batchBought[item.id]?.count ?? 0 : data.shelfBought[item.id] ?? 0
    }
```

Use `shelfCopy(item)` in `buyShelf` L788 and in `StoreRunViews.swift` L151, in place of `data.shelfBought[item.id] ?? 0`. A batch box then keeps its front-box contents across days. The product-keyed ID means a new product can never take an old box key.

**Arrival hour of each stop.** The store run spends the whole block at once ([M/GameStore.swift L767-780](../../../app/PokeVendor/Model/GameStore.swift)).

- `App/AppNav.swift` L35-38: add `let startHour: Double` to `StoreRunSession`.
- `M/GameStore.swift` L767: `@discardableResult func startStoreRun(_ stores: [LocalStore]) -> Double?`. It reads `let start = slot(for: hours)` before `spendHours`, returns `start` or nil, and calls `arrive(at: stores[0], hour: start)` (section 1.2) after the time is spent.
- `Buy/StoreRunViews.swift` L51-57: `guard let start = store.startStoreRun(chosen) else { ...; return }`, then `nav.storeRun = StoreRunSession(stops: chosen, startHour: start)`.
- `Hub/HubView+Debug.swift` L118: the same change.
- `Hub/HubView.swift` L70-71: `StoreRunView(stops: session.stops, startHour: session.startHour) { nav.storeRun = nil }`.
- `StoreRunView` gets `let startHour: Double` and `@State private var waited = 0.0`. The arrival of stop `i` is `startHour + Double(i) * store.storeStopHours + waited`.

**Pruning.** `resetRetailDay()` (M/Retail.swift), integration step 6:

```swift
    func resetRetailDay() {
        let today = data.day
        let oldest = today - Balance.pressureLogDays
        var retail = data.retail
        retail.visits = [:]
        retail.visitBought = [:]
        retail.visitHotBought = [:]
        retail.visitProductBought = [:]
        retail.checkoutVisit = [:]
        retail.visitLines = [:]
        retail.heatHintShown = [:]
        retail.batchBought = retail.batchBought.filter { $0.value.vendorDay >= oldest }
        retail.rivalTaken = retail.rivalTaken.filter { $0.value.vendorDay >= oldest }
        retail.pressureLog = retail.pressureLog.filter { $0.key >= oldest }
        data.retail = retail
    }
```

Exclusivity: every filter runs on the local `retail` and reads only `oldest`. Safe.

**Save compatibility.** An old save has no batch entries. The first visit shows the current batch with the drain. No migration.

**Interactions.** Camping keeps its posted restock every 14 days, with its own stock (section 1.2). A reprint wave puts its products into the batches from the first vendor day on or after its shelf day. A set that leaves print leaves the batches from its next vendor day. The batch is about 10 times today's expected big-store stock (30 units a week at Walmart against 0.12 × about 4 units a day). The limits, the drain, and the heat hold the player's share. Tune with `-retailsim` (section 7.2).

### 1.2 Purchase limits at the shelf and at camping

**Types.** File: `M/Retail.swift`.

```swift
/// The base limit of a chain (proposal 1.2). The report's third kind, "per payment card", is strictness level 2:
/// one checkout a day at the chain (`LimitRule.oneCheckout`).
struct PurchaseLimit: Hashable {
    enum Kind: Hashable { case none, perVisit, perSKUPerDay }
    let kind: Kind
    let normal: Int
    let hot: Int
}

/// The limit in force now: the base limit after the strictness level and any ban.
struct LimitRule: Hashable {
    var perSKU: Int?
    var perVisit: Int?
    var hotPerVisit: Int?
    /// Club: hot items a day for the membership.
    var hotPerDay: Int?
    /// Level 2: one checkout a day at the chain (one payment card).
    var oneCheckout = false
    /// Level 3: hot product sells only through a drawing.
    var hotByDrawing = false
    /// Level 4, or a ban: no card sales.
    var closed = false
}

extension LocalStore {
    var baseLimit: PurchaseLimit {
        switch self {
        case .walmart: PurchaseLimit(kind: .perVisit, normal: 5, hot: 5)
        case .target, .gamestop, .bestBuy: PurchaseLimit(kind: .perSKUPerDay, normal: 2, hot: 1)
        case .barnes: PurchaseLimit(kind: .perVisit, normal: 2, hot: 1)
        case .club: PurchaseLimit(kind: .perSKUPerDay, normal: 2, hot: 1)
        case .castle, .topDeck: PurchaseLimit(kind: .none, normal: 0, hot: 0)
        }
    }
}
```

**Limit functions.** File: `M/Retail.swift`.

```swift
@MainActor
extension GameStore {
    func strictness(_ store: LocalStore) -> ChainStrictness { data.retail.strictness[store.rawValue] ?? ChainStrictness() }

    func isBanned(_ store: LocalStore) -> Bool { (data.retail.bannedUntil[store.rawValue] ?? -1) >= data.day }

    var isClubMember: Bool { (data.retail.clubUntil ?? -1) >= data.day }

    /// A product's daily count at a chain. It lives in `shelfBought`, which End Day resets (L1139).
    func skuKey(_ store: LocalStore, _ productID: String) -> String { "sku|\(store.rawValue)|\(productID)" }

    func limitRule(_ store: LocalStore) -> LimitRule {
        let base = store.baseLimit
        var rule = LimitRule()
        switch base.kind {
        case .none: return rule
        case .perVisit: rule.perVisit = base.normal; rule.hotPerVisit = base.hot
        case .perSKUPerDay: rule.perSKU = base.normal
        }
        if store.isClub { rule.hotPerDay = Balance.clubHotPerDay }
        let s = strictness(store)
        if s.level >= 1 { rule.perSKU = 1 }
        if s.level >= 2 { rule.oneCheckout = true }
        if s.level >= 3 { rule.hotByDrawing = true }
        if s.level >= 4 || isBanned(store) { rule.closed = true }
        return rule
    }

    /// The units of this item that the limit still lets the player buy now. A game shop has no limit.
    func limitLeft(_ item: ShelfItem, at store: LocalStore) -> Int {
        guard !store.isGameShop else { return Int.max }
        let rule = limitRule(store)
        if rule.closed || (rule.hotByDrawing && item.hot) { return 0 }
        if store.isClub && !isClubMember { return 0 }
        let key = store.rawValue
        var left = Int.max
        if let cap = rule.perSKU {
            let capNow = item.hot ? min(cap, store.baseLimit.hot) : cap
            left = min(left, capNow - (data.shelfBought[skuKey(store, item.product.id)] ?? 0))
        }
        if let cap = rule.perVisit { left = min(left, cap - (data.retail.visitBought[key] ?? 0)) }
        if item.hot, let cap = rule.hotPerVisit { left = min(left, cap - (data.retail.visitHotBought[key] ?? 0)) }
        if item.hot, rule.hotPerDay != nil, data.retail.clubHotDay == data.day { left = 0 }
        if rule.oneCheckout, let visit = data.retail.checkoutVisit[key], visit != (data.retail.visits[key] ?? 1) { left = 0 }
        return max(0, left)
    }

    /// One line on the limit, for the stop header and the camp screen.
    func limitText(_ store: LocalStore) -> String {
        let rule = limitRule(store)
        if rule.closed { return isBanned(store) ? "Staff will not sell you cards" : "No card sales" }
        var parts: [String] = []
        if let n = rule.perVisit {
            parts.append("\(n) card items a visit")
            if let h = rule.hotPerVisit, h < n { parts.append("\(h) hot item\(h == 1 ? "" : "s") a visit") }
        }
        if let n = rule.perSKU {
            parts.append("\(n) per item a day")
            let h = min(n, store.baseLimit.hot)
            if h < n { parts.append("\(h) on hot items") }
        }
        if rule.hotPerDay != nil { parts.append("1 hot item a day for the membership") }
        if rule.oneCheckout { parts.append("one checkout a day") }
        if rule.hotByDrawing { parts.append("hot items by drawing") }
        return "Limit " + parts.joined(separator: " · ")
    }
}
```

**The visit start.** File: `M/Retail.swift`. A visit starts at a store-run stop or at a camp. `arrive(at:hour:)` counts the visit, notes a seen vendor slot, and writes the rival lines for the visit (D-10). Only button actions and model functions call it. No view body calls it.

```swift
    /// A visit starts. Counts it, notes the vendor weekday when the player sees a fresh batch (A-S1), and writes the
    /// rival lines (D-10).
    func arrive(at store: LocalStore, hour: Double) {
        guard !store.isGameShop else { return }
        let key = store.rawValue
        let today = data.day
        let slot = vendorSlot(store)
        var retail = data.retail
        retail.visits[key, default: 0] += 1
        retail.visitBought[key] = 0
        retail.visitHotBought[key] = 0
        let prefix = key + "|"
        retail.visitProductBought = retail.visitProductBought.filter { !$0.key.hasPrefix(prefix) }
        if today % 7 == slot.weekday, hour >= slot.hour { retail.seenSlot[key] = slot.weekday }
        data.retail = retail
        writeVisitLines(store, hour: hour)
    }

    /// Rival lines for the hot batch items that a rival emptied before this moment: the drain took at least one
    /// unit, nothing is left, and the player did not take the last unit. One receipt roll for each line.
    func writeVisitLines(_ store: LocalStore, hour: Double) {
        let key = store.rawValue
        let marker = "-\(key)-"
        let items = shelf(at: store, hour: hour)        // read before any write
        guard let rival = rivalAt(store) else { return }
        var retail = data.retail
        retail.visitLines = retail.visitLines.filter { !$0.key.contains(marker) }
        var cleared: [String] = []
        for item in items where item.hot && item.batchDay != nil && item.quantity < item.batchQuantity {
            let bought = retail.batchBought[item.id]
            let left = item.quantity - (bought?.count ?? 0) - (retail.rivalTaken[item.id]?.count ?? 0)
            guard left <= 0, bought?.emptied != true else { continue }
            retail.visitLines[item.id] = "Already gone. \(rival.name) got here first with three carts."
            cleared.append(item.product.name)
        }
        data.retail = retail
        guard let first = cleared.first else { return }
        rememberRival(rival.id, .rivalTookShelf, note: "\(rival.name) cleared the \(first) at \(key)", byPlayer: false)
        for name in cleared { noteShelfReceipt(rival.id, note: "\(rival.name) cleared the \(name) at \(key)") }
    }
```

Exclusivity: `shelf(at:hour:)` and `rivalAt` run before the copy of `retail`. The filter closures read only the locals `prefix` and `marker`. `rememberRival` and `noteShelfReceipt` run in plain code after the write. Safe.

Call sites:

- `startStoreRun`: `arrive(at: stores[0], hour: start)` (section 1.1).
- `StoreRunView`, the "Next stop" button (`Buy/StoreRunViews.swift` L175-183): before `index += 1`, call `store.arrive(at: stops[index + 1], hour: arrival(index + 1))` when a next stop exists.
- `camp(_:)`: `self.arrive(at: store, hour: arrive)` after L83. The local constant `arrive` (L79) hides the method name, so `self.` is required. Camp items are not batch items, so the visit writes no shelf lines. The camp writes its own rival line (section 2.3).

**"Wait for the vendor" (D-17, A-S2).** File: `M/Retail.swift`.

```swift
    /// The hours to wait at a stop for the vendor: the stop is on the vendor day, before the vendor hour, within
    /// `vendorWaitMax` hours, and the player knows the slot (seen it, or an alert covers the chain). Nil otherwise.
    func vendorWaitGap(_ store: LocalStore, arrival: Double) -> Double? {
        let slot = vendorSlot(store)
        let gap = slot.hour - arrival
        let known = data.retail.seenSlot[store.rawValue] == slot.weekday || alertedStores.contains(store)
        guard !store.isGameShop, known, data.day % 7 == slot.weekday, gap > 0, gap <= Balance.vendorWaitMax else { return nil }
        return gap
    }

    /// Waits in the store until the vendor comes. A hostile rival in the aisle takes one unit of a hot item first.
    /// Returns the hours waited, or nil.
    func waitForVendor(_ store: LocalStore, arrival: Double) -> Double? {
        guard let gap = vendorWaitGap(store, arrival: arrival), spendHours(gap) else { return nil }
        let today = data.day
        if let rival = rivalAt(store), rival.hostility >= Balance.rivalAisleHostility,
           let item = Market.batch(store, vendorDay: today, seed: data.marketSeed).first(where: \.hot) {
            data.retail.rivalTaken[item.id, default: BatchBuy(vendorDay: today, count: 0)].count += 1
            rememberRival(rival.id, .rivalTookShelf, note: "\(rival.name) grabbed a \(item.product.name) off the vendor's cart",
                          byPlayer: false)
        }
        writeVisitLines(store, hour: vendorSlot(store).hour)
        save()
        return gap
    }
```

Exclusivity: the `default:` value of the dictionary subscript is evaluated during the write access to `data.retail`. It reads only the local `today`. Never write `BatchBuy(vendorDay: data.day, ...)` there.

`spendHours` adds the wait at the end of the run's time block. The later stops of the run arrive later, through `waited` in `StoreRunView`.

**`buyShelf` changes.** File: `M/GameStore.swift` L784-801.

```swift
    @discardableResult
    func buyShelf(_ item: ShelfItem, at store: LocalStore, credit: Bool) -> Bool {
        guard shelfLeft(item) > 0, limitLeft(item, at: store) > 0,
              pay(item.price, at: store, credit: credit, label: "\(item.product.name) · \(store.rawValue)", category: .sealed) else { return false }
        let key = BoxContents.shelfKey(item.id, copy: shelfCopy(item))
        data.shelfBought[item.id, default: 0] += 1
        if !store.isGameShop { notePurchase(item, at: store) }
        ... // the rest stays as L790-800
    }
```

`notePurchase` (M/Retail.swift):

```swift
    /// Counts a big-store or club buy toward the limits, the batch, the heat, and the rivals (D-1).
    func notePurchase(_ item: ShelfItem, at store: LocalStore) {
        let key = store.rawValue
        let today = data.day
        let productKey = key + "|" + item.product.id
        var retail = data.retail
        if let vDay = item.batchDay {
            retail.batchBought[item.id, default: BatchBuy(vendorDay: vDay, count: 0)].count += 1
        }
        retail.visitBought[key, default: 0] += 1
        retail.visitProductBought[productKey, default: 0] += 1
        if item.hot { retail.visitHotBought[key, default: 0] += 1 }
        let visit = retail.visits[key] ?? 1
        if retail.checkoutVisit[key] == nil { retail.checkoutVisit[key] = visit }
        if store.isClub && item.hot { retail.clubHotDay = today }
        let firstBuyThisVisit = retail.visitBought[key] == 1
        let units = retail.visitProductBought[productKey] ?? 1
        data.retail = retail
        data.shelfBought[skuKey(store, item.product.id), default: 0] += 1

        // The player's buy took the last unit: no rival line blames a rival for it.
        let emptied = item.hot && shelfLeft(item) == 0
        if emptied && item.batchDay != nil {
            data.retail.batchBought[item.id]?.emptied = true
            data.retail.visitLines[item.id] = nil
        }
        // Heat and hidden acts (section 2.4). Each call is outside any closure on `data`.
        if visit > 1 && firstBuyThisVisit {
            addHeat(Balance.heatRepeatVisit, at: store, act: .limitEvasion, weight: 1.0,
                    note: "A second trip to \(key) today to buy more cards")
        }
        if emptied && units >= 2 {
            addHeat(Balance.heatLimitBuy, at: store, act: .shelfBuyout, weight: min(2, 1 + 0.25 * Double(units - 2)),
                    witnesses: 5, note: "Took the last \(units) \(item.product.name) at \(key)")
            data.retail.incidentBoost[key, default: 0] += Balance.incidentBoostPerBuyout
        }
        if emptied, item.batchDay == today, let rival = rivalAt(store) {
            rememberRival(rival.id, .playerTookShelf, note: "You took the last \(item.product.name) at \(key)",
                          byPlayer: true, hostility: Balance.rivalTookShelfHostility)
        }
    }
```

A single hot box at a limit-1 chain never records `shelfBuyout` and adds no heat (D-1). Walmart's 5-a-visit limit and a camp haul of 2 or more can empty an item with 2 or more units, which is "taking a full display".

**Camp haul cap.** File: `M/Camping.swift` L76-104.

- After L83: `self.arrive(at: store, hour: arrive)` (see the call sites above).
- L85: `let chance = (Balance.campSuccess * pow(Balance.arrivalKeep, late) + restockBotBonus) * flipperCampFactor` (section 2.1).
- L95-100: skip a hot product at strictness 3, and cap each quantity:

```swift
            let hot = p.isHot()
            if hot && limitRule(store).hotByDrawing { continue }
            let qty = min(r.int(Balance.campQuantity), campCap(store, hot: hot))
            items.append(ShelfItem(id: "camp-\(data.day)-\(store.rawValue)-\(i)", product: p,
                                   price: p.retailMSRP() ?? p.market, quantity: qty, hot: hot))
```

L92-93 build the camp pool. Its filter already has `!$0.isStoreExclusive`.

```swift
    /// The most units of one product that a camp haul holds: the chain limit. A per-visit limit caps each product at
    /// the visit limit, and the buy check holds the visit total.
    func campCap(_ store: LocalStore, hot: Bool) -> Int {
        let rule = limitRule(store)
        var cap = Int.max
        if let n = rule.perSKU { cap = min(cap, hot ? min(n, store.baseLimit.hot) : n) }
        if let n = rule.perVisit { cap = min(cap, n) }
        if hot, let n = rule.hotPerVisit { cap = min(cap, n) }
        return max(1, cap)
    }
```

A camped Target restock now gives 1 (hot) or 2 of each product. Camp items carry `hot`, so `limitLeft` and the heat rule apply. Camp items have no `batchDay`, so `shelfLeft` uses the daily `shelfBought` count.

- `campBlock(_:)` L69-74: add first:

```swift
        if isBanned(store) {
            return "Staff refuse you card sales until \(GameCalendar.date(data.retail.bannedUntil[store.rawValue] ?? data.day).text)"
        }
        if let until = strictness(store).closedUntil, until >= data.day { return "\(store.rawValue) stopped in-store card sales" }
```

**Save compatibility.** The per-SKU counts are new keys in the existing `shelfBought` dictionary, which End Day resets (L1139). The visit state is in `RetailState`.

**UI.**

1. `StoreRunPlanner` (`Buy/StoreRunViews.swift` L14-40). The detail line of a big store (L25) becomes `"Big store · MSRP · \(store.limitText(s))"`. Then add these tags in `Theme.orange` when they apply: `"Strict · level \(n)"`, `"Refused until <date>"`, `"Card sales stopped"`. Add these tags in `Theme.cyan`: `"Vendor day: \(GameStore.weekdays[w]) (you saw it)"` when `seenSlot` has the chain (A-S1), and `"Vendor stock tomorrow ~10 AM"` or `"Vendor stock today ~10 AM"` with an alert (section 1.8). The club row shows `"Members only · \(money(Balance.clubFee)) a year"` with a `Join` button (`.bordered`, `.small`), or `"Member until <date>"`.
2. `StoreRunView.stopView` (L106-187). L107 becomes `let shelf = store.shelf(at: s, hour: arrival(index))`.
   - Under the store name, for a store that is not a game shop: a caption with `store.limitText(s)`, and the heat hint from `store.heatHint(s)` in `Theme.orange` (section 2.4).
   - A `Banner` (orange) for a ban, for level 4, and for a club stop with no membership (with a `Join · $65` button).
   - A `Wait for the vendor · \(formatHours(gap))` button (`.bordered`) when `store.vendorWaitGap(s, arrival: arrival(index))` is not nil. The action adds the result of `waitForVendor` to `waited`.
   - Each row: a `HotTag` (a small capsule "HOT" in `Theme.orange`, `Hub/FlipperViews.swift`) when `item.hot`. The caption (L155) becomes `"\(left) left · limit \(limitLeft) · mkt …"`. The buy button is disabled when `left == 0 || limitLeft == 0`.
   - A batch item with `left == 0` stays in the list with `"Gone"` and the line `store.data.retail.visitLines[item.id] ?? "Sold out."`. When `batchBought[item.id]?.emptied == true`, the line is `"You took the last one."`.
   - A caption under the shelf: `"Hot items: limit 1 at most chains. They sell out within hours, and staff remember who clears them."`
   - After a buy, show `store.retailNotice` in a `Banner` (orange) and clear it. `retailNotice` is a new non-saved `var retailNotice: String?` on `GameStore`, next to `report` (L249).
3. `CampView` (`Hub/OpportunityView.swift` L84-128). Under the intro text (L91-93), a caption with the limit text and the heat hint. The row caption (L106) adds `" · limit \(limitLeft)"` and the `HotTag`. The buy button (L111) also disables at a zero limit. The `retailNotice` banner shows here too, so a ban that starts at a camp is visible.

No view in this section uses an animation.

**Tests.** Section 7: T1, T2, T3.

**Interactions.** The boxes test (GameTests L332-337) buys one unit at `LocalStore.allCases.first` (Target) with a test `ShelfItem` with no batch. One buy passes the limit and records no act. The test needs no change.

### 1.3 Strictness ladder after incidents

**State.** `ChainStrictness` and `incidentBoost` in `RetailState` (section 0.3).

**End Day.** File: `M/Retail.swift`. `flippersEndDay()` (section 2.1) calls it after the pressure update. It is not `private`, because the caller is in another file.

```swift
    /// Proposal 1.3: incidents on yesterday's vendor visits raise a chain's level. Levels fall with time.
    func strictnessEndDay(endedDay: Int, pressure: Double) -> [String] {
        let today = data.day
        var all = data.retail.strictness
        let boosts = data.retail.incidentBoost
        var lines: [String] = []
        for store in LocalStore.allCases where !store.isGameShop {
            var s = all[store.rawValue] ?? ChainStrictness()
            if s.level == 4, let until = s.closedUntil, today > until {
                s.level = 3; s.lastChange = today; s.closedUntil = nil
                lines.append("\(store.rawValue) sells cards in store again, but hot product goes through a drawing.")
            } else if s.level > 0, s.level < 4, today - s.lastChange >= Balance.strictnessDecayDays {
                s.level -= 1; s.lastChange = today
                lines.append("\(store.rawValue) relaxes its card limits to level \(s.level).")
            }
            let boost = boosts[store.rawValue] ?? 0
            if endedDay % 7 == vendorSlot(store).weekday, s.level < 4,
               Double.random(in: 0..<1) < Balance.incidentChance * pressure + boost {
                s.level += 1; s.lastChange = today
                if s.level == 4 { s.closedUntil = today + Balance.closureDays }
                let cause = boost > 0 ? "A video of a buyer who cleared the \(store.rawValue) shelf went viral."
                                      : Self.incidentText(store)
                s.lastIncident = cause
                lines.append("Market news: \(cause) \(store.rawValue) tightens its card limits: \(Self.levelText(s.level)).")
            }
            all[store.rawValue] = s
        }
        data.retail.strictness = all
        return lines
    }
```

`incidentText(_:)` (static) picks one of three texts with `randomElement()`: "A fight broke out at a \(store) restock.", "Police came to a crowd at a \(store) card aisle.", "A \(store) restock line blocked the parking lot." `levelText(_:)`: 1 "one of each item a day", 2 "one checkout a day", 3 "hot product by drawing only", 4 "no card sales for 21 days".

The boost decays by `incidentBoostKeep` (0.9) each day in `heatEndDay` (section 2.4). The player's own buyouts make the chain stricter for everyone (A-S4).

Exclusivity: the loop works on the locals `all` and `boosts`. `vendorSlot` reads `PriceCycle`. Safe.

With the D-13 values, level 1 or more holds about 94 days a year at each chain, and level 3 or more about 5 days (sim section 7).

**UI.** The planner tags (section 1.2). `FlipperMarketBox` lists each chain above level 0 with `levelText` and `lastIncident` in a caption (section 2.1).

**Tests.** No check: no money moves. T10 seeds a strict chain before the 14-day run.

### 1.4 Weekly online drawing and level-3 chain drawings

**Types.** File: `M/RetailOnline.swift`. `DrawingWin` is in section 0.3.

```swift
/// A drawing the player entered. One entry for each drawing (proposal 1.4).
struct DrawingEntry: Codable, Identifiable, Hashable {
    var id = UUID()
    let chain: LocalStore
    let productID: String
    /// The draw happens at the End Day of this day. The result is in the next morning's report.
    let drawDay: Int
    let price: Double
}

/// A drawing that the player can enter now. Not saved: the seed makes it.
struct DrawingOffer: Identifiable, Hashable {
    let chain: LocalStore
    let product: Product
    let drawDay: Int
    let price: Double
    var id: String { "\(chain.rawValue)-\(drawDay)" }
}
```

**Functions.** File: `M/RetailOnline.swift`.

```swift
@MainActor
extension GameStore {
    /// This week's Walmart drawing: entries Monday to Wednesday, the draw at the End Day of Wednesday. The product
    /// comes from the in-print pool on Monday of the week, so it does not change during the week.
    var walmartDrawing: DrawingOffer? {
        let week = data.day / 7
        let monday = week * 7
        let drawDay = monday + Balance.drawingWeekday
        guard data.day <= drawDay else { return nil }
        var r = SeededRandom(seed: (UInt64(week + 1) &* 86_028_121 &+ 77) ^ data.marketSeed)
        let pool = SetLibrary.catalog.filter { Balance.bigStoreKinds.contains($0.kind) && $0.inPrint(on: monday) && $0.msrp != nil
                                               && !$0.isStoreExclusive && $0.isHot(day: monday) }
        guard !pool.isEmpty else { return nil }
        let p = pool[r.int(0...(pool.count - 1))]
        guard let price = p.retailMSRP(day: monday) else { return nil }
        return DrawingOffer(chain: .walmart, product: p, drawDay: drawDay, price: price)
    }

    /// Level 3: each strict chain draws its hot batch items. Entries close at the chain's next vendor day.
    var chainDrawings: [DrawingOffer] {
        let today = data.day
        return LocalStore.allCases.filter { !$0.isGameShop && strictness($0).level == 3 }.compactMap { store in
            let slot = vendorSlot(store)
            let next = today + ((slot.weekday - today % 7) % 7 + 7) % 7
            guard let item = Market.batch(store, vendorDay: next, seed: data.marketSeed).first(where: \.hot) else { return nil }
            return DrawingOffer(chain: store, product: item.product, drawDay: next, price: item.price)
        }
    }

    func entry(for offer: DrawingOffer) -> DrawingEntry? {
        data.retail.drawings.first { $0.chain == offer.chain && $0.drawDay == offer.drawDay }
    }

    /// A free entry. One entry for each drawing.
    func enterDrawing(_ offer: DrawingOffer) {
        guard entry(for: offer) == nil, data.day <= offer.drawDay else { return }
        data.retail.drawings.append(DrawingEntry(chain: offer.chain, productID: offer.product.id, drawDay: offer.drawDay,
                                                 price: offer.price))
        log("Entered the \(offer.chain.rawValue) drawing for \(offer.product.name).")
        save()
    }

    /// The result of one entry. A win goes to the claim list for `drawingClaimDays`. Nothing is charged (D-11).
    /// Separate from the roll, so the test can force a result.
    func resolveDrawing(_ entry: DrawingEntry, won: Bool) -> String {
        guard let p = SetLibrary.product(entry.productID) else { return "" }
        let place = entry.chain == .walmart ? "Walmart's online drawing" : "the \(entry.chain.rawValue) drawing"
        guard won else { return "You did not win \(place) for \(p.name)." }
        let until = data.day + Balance.drawingClaimDays
        data.retail.drawingWins.append(DrawingWin(chain: entry.chain, productID: p.id, price: entry.price, claimUntil: until))
        return "You won \(place) for \(p.name)! Pay \(money(entry.price)) and claim it on the hub by \(GameCalendar.date(until).text)."
    }

    /// Pays for a win and claims it. Returns false when the cash is short or the win lapsed.
    @discardableResult
    func claimDrawingWin(_ id: UUID) -> Bool {
        let today = data.day
        guard let win = data.retail.drawingWins.first(where: { $0.id == id }), win.claimUntil >= today,
              canAfford(win.price), let p = SetLibrary.product(win.productID) else { return false }
        data.retail.drawingWins.removeAll { $0.id == id }
        addLedger(-win.price, .sealed, "\(p.name) · \(win.chain.rawValue) drawing")
        let from = win.chain == .walmart ? "Walmart.com" : "\(win.chain.rawValue) pickup"
        let days = win.chain == .walmart ? Balance.drawingDeliveryDays : 1
        data.sealed.append(SealedItem(setSlug: p.homeSlug, name: p.name, packs: p.packs, paid: win.price, acquired: .now,
                                      source: "Won a \(win.chain.rawValue) drawing", productID: p.id,
                                      status: .arriving(daysLeft: days, from: from), acquiredDay: today))
        log("Claimed your \(win.chain.rawValue) drawing win: \(p.name) for \(money(win.price)).", cash: -win.price)
        save()
        return true
    }
}
```

Exclusivity: the `removeAll` closure reads only the local `id`. The `SealedItem` arguments are evaluated before the append starts, and `acquiredDay` uses the local `today`.

**End Day.** In `retailOrdersEndDay()` (section 1.5 shows the whole function):

```swift
        let ended = today - 1
        let dueDrawings = data.retail.drawings.filter { $0.drawDay <= ended }
        data.retail.drawings = data.retail.drawings.filter { $0.drawDay > ended }
        for entry in dueDrawings {
            lines.append(resolveDrawing(entry, won: Double.random(in: 0..<1) < Balance.drawingWinChance))
        }
        let lapsed = data.retail.drawingWins.filter { $0.claimUntil < today }
        data.retail.drawingWins = data.retail.drawingWins.filter { $0.claimUntil >= today }
        for win in lapsed {
            lines.append("Your \(win.chain.rawValue) drawing win for \(SetLibrary.product(win.productID)?.name ?? "a product") lapsed. Nothing was charged.")
        }
```

The win never charges at End Day, so it can never take the rent money (A-M6).

**UI.**

1. New `ChainSitesView` (`Buy/ChainSitesView.swift`). Reach: Buy > Online > a new row "Big-store sites" (`Buy/BuyViews.swift`, in the `VStack` at L24-37 after the storefront rows), detail `"Walmart drawing · Target.com drop"` with the live state. New route `case chainSites` in `AppRoute` (`App/AppNav.swift` L4-33) and `case .chainSites: ChainSitesView()` in the switch (L85-115).
   - Section "Walmart Collectibles Draw · weekly": product image, name, MSRP, market, `"Entries close Wednesday · results Thursday morning · 1 entry"`, and `Enter free` or a disabled `Entered`. When the player entered, the row shows the entered product (`entry(for:)`), not a fresh read. From Thursday to Sunday the text is `"The next drawing opens Monday."`. With no hot product: `"No drawing this week."`
   - Section "Store drawings": one row for each `chainDrawings` offer. Hidden when empty.
   - Section "Target.com" (section 2.6).
   - Caption: `"A win waits 2 days for you to pay and claim it. If you do not claim it, it lapses at no cost."`
2. `HubView` events list (`Hub/HubView.swift` L185-213): one `Button` with a `ChevronRow` for each `store.data.retail.drawingWins` entry, icon `"ticket"`, title `"Claim your drawing win: \(name)"`, detail `"Pay \(money(price)) · until <date>"`. The action calls `claimDrawingWin`. The button is disabled when the cash is short. Add `store.data.retail.drawingWins.isEmpty` to the empty check at L209.

**Tests.** T5 (section 7).

### 1.5 Pokemon Center cancellation roll

**Type.** File: `M/RetailOnline.swift`.

```swift
/// An online order that the store can still cancel (proposal 1.5).
struct DropOrder: Codable, Identifiable, Hashable {
    var id = UUID()
    let itemID: UUID
    /// "Pokemon Center" or "Target.com".
    let source: String
    let name: String
    let rollDay: Int
    let chance: Double
    let refund: Double
    let bot: Bool
}
```

**`attemptDrop` change.** File: `M/GameStore.swift` L749-759.

```swift
    /// One attempt per Pokemon Center drop. The checkout bot doubles the chance and raises the cancellation risk
    /// (proposals 1.5, 2.6).
    func attemptDrop(_ offer: StoreOffer, bot: Bool = false) -> Bool {
        let useBot = bot && hasUpgrade(.checkoutBot)
        guard !data.pokemonCenterAttempted, canAfford(offer.price + offer.shipping) else { return false }
        data.pokemonCenterAttempted = true
        if useBot {
            addHeat(Balance.heatBotUse, at: nil, act: .botCheckout, weight: 0.5, note: "Used a checkout bot on a Pokemon Center drop")
        }
        let chance = useBot ? Balance.pokemonCenterBotSuccess : Balance.pokemonCenterSuccessChance
        if Double.random(in: 0..<1) < chance, buy(offer), let item = data.sealed.last {
            addDropOrder(item: item, source: "Pokemon Center", bot: useBot, refund: offer.price + offer.shipping,
                         deliveryDays: offer.deliveryDays)
            return true
        }
        log("Missed the Pokemon Center drop for \(offer.title).")
        save()
        return false
    }
```

`buy(_:)` appends exactly one `SealedItem` for a product offer (L730-736), so `data.sealed.last` is the new item.

```swift
    /// The roll day is at most the day before the item arrives. `advanceSealed` clears `.arriving` and `.onTheWay`
    /// at `daysLeft <= 1`, and `retailOrdersEndDay` runs after it (A-M2).
    func addDropOrder(item: SealedItem, source: String, bot: Bool, refund: Double, deliveryDays: Int) {
        let window = 1...max(1, min(Balance.dropCancelWindowMax, deliveryDays - 1))
        let order = DropOrder(itemID: item.id, source: source, name: item.name, rollDay: data.day + Int.random(in: window),
                              chance: bot ? Balance.dropCancelBotChance : Balance.dropCancelChance, refund: refund, bot: bot)
        data.retail.dropOrders.append(order)
    }

    func dropOrder(for itemID: UUID) -> DropOrder? { data.retail.dropOrders.first { $0.itemID == itemID } }
```

**End Day.** `retailOrdersEndDay()` (M/RetailOnline.swift), integration step 8:

```swift
    func retailOrdersEndDay() -> [String] {
        var lines: [String] = []
        let today = data.day
        // Drawings and claims (proposal 1.4): the block in section 1.4.
        ...
        // Cancellations (proposal 1.5).
        let dueOrders = data.retail.dropOrders.filter { $0.rollDay <= today }
        data.retail.dropOrders = data.retail.dropOrders.filter { $0.rollDay > today }
        for order in dueOrders where Double.random(in: 0..<1) < order.chance {
            if let line = cancelOrder(order) { lines.append(line) }
        }
        // Missing distributor shipments (section 3.3).
        lines += missingShipmentsEndDay()
        // The club membership ends in 7 days (proposal 1.7).
        if let until = data.retail.clubUntil, until == today + Balance.clubWarnDays {
            lines.append("Your warehouse club membership ends in \(Balance.clubWarnDays) days. Renew it at the club stop.")
        }
        return lines
    }

    /// Takes the item back and refunds it. Nil when the item already arrived or left the inventory.
    func cancelOrder(_ order: DropOrder) -> String? {
        let id = order.itemID
        guard let item = data.sealed.first(where: { $0.id == id }) else { return nil }
        switch item.status {
        case .onTheWay, .arriving: break
        default: return nil
        }
        data.sealed.removeAll { $0.id == id }
        addLedger(order.refund, .sealed, "Order cancelled · \(order.name) · \(order.source)")
        if order.bot {
            recordHiddenAct(.botOrderCancelled, weight: 0.5, note: "\(order.source) flagged your bot order for \(order.name)")
        }
        return "\(order.source) cancelled your order for \(order.name) and refunded \(money(order.refund)). "
            + (order.bot ? "Its systems flagged the checkout as a bot." : "A wave of cancellations hit many buyers.")
    }
```

Exclusivity: `removeAll { $0.id == id }` reads only the local `id`. Never write `data.sealed.removeAll { $0.id == data.retail.dropOrders[i].itemID }`.

Refund category: `.sealed`, positive. The order cost used `.sealed`, so the refund nets it for income tax. The wholesale short refund uses the same pattern ([M/Wholesale.swift L99](../../../app/PokeVendor/Model/Wholesale.swift)).

A cancelled item cannot be in a P&L challenge: an item with a status cannot join one (`challengeBlock`, `M/Shorts.swift` L387). No challenge check is necessary.

**UI.** The cancellation line is in the morning report. `StoreView.header` for the Pokemon Center (`Buy/BuyViews.swift` L144) adds `" · orders can be cancelled"`. `SealedDetailView` (`Inventory/DetailViews.swift`, in the box list near L481) shows a row `"\(order.source) can still cancel this order until \(GameCalendar.date(order.rollDay).text)."` when `store.dropOrder(for: item.id)` is not nil.

**Tests.** T4 (section 7).

### 1.6 GameStop marks up hot product

`Market.batch` (section 1.1) prices a hot GameStop item at `retail(msrp × r.double(1.35...1.6))`. The price stays fixed for the batch, because the seed and the vendor-day hot flag fix it.

**UI.** The planner detail for GameStop adds `" · hot items over MSRP"`. The shelf row shows the price and the market.

**Tests.** No separate check. T2 reads a batch.

### 1.7 Club store

**Model.** `LocalStore.club` (section 1.1). Vendor-day batches from `isClubExclusive && inPrint(on:)` products, `Balance.clubBatchSize` units. Limit: 2 of an item a day, and 1 hot item a day for the membership (`hotPerDay`, `clubHotDay`). A club item with no MSRP (one in the catalog today: "Costco Scarlet & Violet 151 Zapdos ex & Alakazam ex Bundle", market $317) is hot when its market is 1.2 × its club price or more (D-13).

**Price.** The catalog MSRP of many club bundles is not the club price (for example 26.94 for a Costco 2-pack trainer box bundle). Use a floor by pack count (integration decision D4):

```swift
extension Market {
    /// The club price on a day: the MSRP, but never under `Balance.clubPricePerPack` for each pack.
    nonisolated static func clubPrice(_ p: Product, day: Int) -> Double {
        max(p.retailMSRP(day: day) ?? 0, Double(p.packs) * Balance.clubPricePerPack)
    }
}
```

The batch passes the vendor day, so the price does not change in the middle of a batch on the step day. No catalog value or graded price changes.

**Membership.** File: `M/Retail.swift`.

```swift
    func joinClub() -> Bool {
        guard !isClubMember, canAfford(Balance.clubFee) else { return false }
        let until = data.day + Balance.clubDays
        addLedger(-Balance.clubFee, .businessCosts, "Warehouse club membership")
        data.retail.clubUntil = until
        log("Joined the warehouse club for \(money(Balance.clubFee)). Member until \(GameCalendar.date(until).text).",
            cash: -Balance.clubFee)
        save()
        return true
    }
```

No automatic renewal. The planner row shows `Renew` after the membership ends. A report line comes 7 days before the end (section 1.5).

**Interactions.** The club is not a big store: no posted camp restock, no Target.com, no Walmart drawing. Incidents apply to it. Club products sell far over the club price, so the club batch drains fast and the 1-a-day hot limit matters most here.

**Tests.** T1 covers the membership and the hot-per-day rule.

### 1.8 Restock alert tiers

**Type.** File: `M/RetailOnline.swift`.

```swift
/// Monthly restock alerts (proposal 1.8). The $150 restock alert bot upgrade stays as it is.
enum AlertTier: String, Codable, CaseIterable, Hashable {
    case none, oneChain, allChains

    var fee: Double {
        switch self {
        case .none: 0
        case .oneChain: Balance.alertFeeOneChain
        case .allChains: Balance.alertFeeAllChains
        }
    }

    var name: String {
        switch self {
        case .none: "No alerts"
        case .oneChain: "One chain"
        case .allChains: "Every chain"
        }
    }
}
```

**Functions.** File: `M/RetailOnline.swift`.

```swift
    /// The chains the alerts cover now.
    var alertedStores: [LocalStore] {
        guard data.day >= data.retail.alertStartDay else { return [] }
        switch data.retail.alertTier {
        case .none: return []
        case .oneChain: return data.retail.alertStore.map { [$0] } ?? []
        case .allChains: return LocalStore.allCases.filter(\.isBigStore)
        }
    }

    /// Starts, changes, or stops the alerts. From no alerts: with more than `alertProrateDays` to the 1st, the first
    /// month is charged now and the alerts start now. Otherwise they start on the 1st, and End Day charges them then.
    /// A move to a dearer tier charges the difference now. A move to a cheaper tier or a new chain charges nothing.
    @discardableResult
    func subscribeAlerts(_ tier: AlertTier, store: LocalStore?) -> Bool {
        guard tier != .oneChain || store?.isBigStore == true else { return false }
        let old = data.retail.alertTier
        var retail = data.retail
        if old == .none, tier != .none {
            if daysUntilRent > Balance.alertProrateDays {
                guard canAfford(tier.fee) else { return false }
                addLedger(-tier.fee, .businessCosts, "Restock alerts · \(tier.name)")
                retail.alertStartDay = data.day
            } else {
                retail.alertStartDay = data.day + daysUntilRent
            }
        } else if old != .none, tier.fee > old.fee, data.day >= retail.alertStartDay {
            let gap = tier.fee - old.fee
            guard canAfford(gap) else { return false }
            addLedger(-gap, .businessCosts, "Restock alerts · upgrade to \(tier.name)")
        }
        retail.alertTier = tier
        retail.alertStore = tier == .oneChain ? store : nil
        data.retail = retail
        save()
        return true
    }
```

Exclusivity: `addLedger` writes `data.cash` and `data.ledger` while the local `retail` is a copy. The copy is written back after. No closure is involved. Note: `addLedger` runs before `data.retail = retail`, and it does not touch `data.retail`, so the copy is not stale.

```swift
    /// End Day: the fee on the 1st, then tomorrow's vendor days for the alerted chains.
    func alertsEndDay() -> [String] {
        var lines: [String] = []
        let tier = data.retail.alertTier
        if tier != .none, GameCalendar.isFirstOfMonth(data.day) {
            if coverWithLine(tier.fee, for: "Restock alerts") {
                addLedger(-tier.fee, .businessCosts, "Restock alerts · \(tier.name)")
                lines.append("Restock alerts: \(money(tier.fee)).")
            } else {
                data.retail.alertTier = .none
                data.retail.alertStore = nil
                lines.append("You could not pay \(money(tier.fee)) for restock alerts. The alerts stopped.")
            }
        }
        let tomorrow = (data.day + 1) % 7
        for store in alertedStores where vendorSlot(store).weekday == tomorrow {
            lines.append("Restock alert: \(store.rawValue) gets its vendor stock tomorrow at about \(GameStore.clock(vendorSlot(store).hour)).")
        }
        return lines
    }
```

`coverWithLine` ([M/Debt.swift L539-548](../../../app/PokeVendor/Model/Debt.swift)) is the rule for monthly costs in `businessCostsEndDay` ([M/LateGame.swift L40](../../../app/PokeVendor/Model/LateGame.swift)). A start on the 1st is charged by the same branch that night.

**Calendar.** `restockEntries(day:)` ([M/Camping.swift L58-64](../../../app/PokeVendor/Model/Camping.swift)): append one `CalendarEntry(kind: .restock, title: "\(store) vendor stock", detail: "About \(clock) · from your alert")` for each alerted store whose vendor weekday matches `day`, when `day == data.day` or `day == data.day + 1`. No new `CalendarEntry.Kind`.

**UI.** New `RestockAlertsBox` (`Hub/FlipperViews.swift`) in `UpgradesView`, in the "Buying" `DetailBox` (`Hub/UpgradesView.swift` L46-57) after `upgradeRow(.restockBot)`. It shows a segmented `Picker` with the three tiers, a chain `Picker` for `oneChain` (big stores only), the text `"$8 a month · charged on the 1st with rent"`, the start date when the alerts start on the 1st, and a `Subscribe` or `Stop` button.

**Tests.** No check. The fee uses the existing monthly pattern.

---
## 2. Flippers

### 2.1 Flipper pressure

**Value.** `data.flipperPressure: Double`, 0.1 to 0.9, start 0.5. One market-wide value. Parts B and C read it. The sim shows that it moves through all bands and does not stick at a clamp (sim section 4.1).

**`flippersEndDay()`.** File: `M/Flippers.swift`. Integration step 4.

```swift
import Foundation

@MainActor
extension GameStore {
    /// End Day for the flipper market: dumps, pressure, strictness, heat, the MSRP step, and the winter scale.
    /// Returns the report lines. Ends with `syncMarket()`, because dumps and the step move prices.
    func flippersEndDay() -> [String] {
        let today = data.day
        let ended = today - 1
        let before = data.flipperPressure
        var lines: [String] = []

        // 1. Winter scale (section 3.5), from yesterday's pressure.
        lines += lockWinterScale(day: today, pressure: before)

        // 2. Flipper dump (proposal 2.2). It reads the pressure before today's inputs.
        let reprintsToday = data.printChanges.filter {
            $0.inPrint && !$0.endsWave && $0.day == today && ($0.waveID == nil || $0.waveID == $0.id)
        }
        let correctionStarts = PriceCycle.regimes.contains { $0.kind == .correction && $0.start == today && $0.start > 0 }
        if before >= Balance.dumpPressure {
            for change in reprintsToday { if let line = startDump(slugs: [change.slug], day: today) { lines.append(line) } }
            if correctionStarts, let line = startDump(slugs: dumpSetsForCorrection(), day: today) { lines.append(line) }
        }

        // 3. Pressure inputs (proposal 2.1).
        var p = before
        var seen = data.retail.seenEvents
        for e in data.marketEvents where (e.kind == .sealedHype || e.kind == .characterSellOut) && !seen.contains(e.id) {
            p += Balance.pressureHypeNews
            seen.append(e.id)
        }
        let live = Set(data.marketEvents.map(\.id))
        seen = seen.filter { live.contains($0) }
        switch PriceCycle.regime(day: today)?.kind {
        case .boom: p += Balance.pressureBoomDaily
        case .correction: p += Balance.pressureCorrectionDaily
        default: break
        }
        let seasonNow = PriceCycle.seasonName(day: today), seasonBefore = PriceCycle.seasonName(day: ended)
        if seasonNow != seasonBefore {
            if seasonNow == "Holiday season" { p += Balance.pressureHoliday }
            if seasonNow == "After the holidays" { p += Balance.pressurePostHoliday }
        }
        p += Balance.pressureReprint * Double(reprintsToday.count)
        p += (Balance.pressureStart - p) * Balance.pressurePull
        p = min(Balance.pressureRange.upperBound, max(Balance.pressureRange.lowerBound, p))
        data.flipperPressure = p
        var retail = data.retail
        retail.seenEvents = seen
        retail.pressureLog[today] = p
        data.retail = retail
        if abs(p - before) >= Balance.pressureNewsStep { lines.append(pressureLine(p, rising: p > before)) }

        // 4. Strictness incidents on yesterday's vendor visits (proposal 1.3).
        lines += strictnessEndDay(endedDay: ended, pressure: p)

        // 5. Heat decay, boost decay, and ban ends (proposal 2.4).
        lines += heatEndDay(day: today)

        // 6. The MSRP step (section 3.4).
        lines += msrpEndDay(day: today)

        syncMarket()
        return lines
    }
}
```

Exclusivity: every filter reads only locals (`today`, `live`) or the element. The `for e in data.marketEvents` loop does not mutate `data.marketEvents`. It writes the local `seen`. `startDump` appends to `data.marketEvents` outside any closure. Never write `data.retail.seenEvents.removeAll { !data.marketEvents.contains(...) }`.

`pressureLine(_:rising:)` returns "Flippers are crowding the shelves. Hot product sells out faster." or "Flippers are pulling back. Shelves stay stocked longer." `pressureNewsStep` (0.1) keeps the report quiet on normal days.

**Effect 1: shelf drain.** `drainShare` (section 1.1).

**Effect 2: camp success.** File: `M/Flippers.swift`.

```swift
    /// Camp success × (1.2 − 0.6 × pressure): 1.14 at 0.1, 0.9 at 0.5, 0.66 at 0.9.
    var flipperCampFactor: Double { Balance.campPressureBase - Balance.campPressureSlope * data.flipperPressure }
```

Used in `camp(_:)` (section 1.2) and `campMachine(_:)` (section 3.2).

**Effect 3: online sale chance of hot in-print sealed.** File: `M/Flippers.swift`.

```swift
    /// Flippers list the same hot in-print product online. The sale chance falls by up to 20% at pressure 0.9.
    func flipperSaleFactor(_ productID: String?, channel: Listing.Channel) -> Double {
        guard [.ebay, .ebayAuction, .tcgplayer].contains(channel), let p = SetLibrary.product(productID),
              p.isInPrint, p.isHot() else { return 1 }
        let range = Balance.pressureRange
        return 1 - Balance.flipperSaleCut * max(0, data.flipperPressure - range.lowerBound) / (range.upperBound - range.lowerBound)
    }
```

File: `M/GameStore.swift`.

- L1432: add a parameter: `func rollSale(_ listing: Listing, market rawMarket: Double, sealed: Bool, slab: Bool = false, name: String, productID: String? = nil) -> Double?`.
- L1433: `let demand = channelDemand(listing.channel) * itemDemand(name) * PriceCycle.seasonDemand(sealed: sealed) * flipperSaleFactor(productID, channel: listing.channel)`.
- L1234 (`advanceSealed`): pass `productID: item.productID`.

The card call at L1426 passes no product, so cards keep their chance. The eBay auction no-sale floor at L1440 reads `demand`, so the factor also lowers auction sales.

**Effect 4: deeper reprint drops.** Through the dump (section 2.2).

**UI.** New `FlipperMarketBox` (`Hub/FlipperViews.swift`) in `MarketView` (`Hub/GoalsMarketViews.swift`), after "The card market" `DetailBox` (ends at L45):

- A `StatCell` row: "Flippers" with a word from the value (to 0.35 "Few", to 0.65 "Busy", else "Swarming"), and "Hot shelves" with the hours until 29% of a hot item is left: `log(1 / 0.29) / (0.2 + 0.6 × p)`, as "about 2.5 hours".
- A static capsule bar from 0.1 to 0.9, filled in `Theme.orange`. No animation.
- A caption: "Flippers buy hot in-print product as soon as it lands. More flippers empty shelves faster, cut your camp odds, and compete with your hot sealed listings online. News and booms bring them in. Reprints, corrections, and the end of the holidays drive them out."
- One row for each chain above strictness 0: the level text, and `lastIncident` in a caption.
- The MSRP step notice (section 3.4).
- `RivalsBox` (section 2.3).

**Tests.** T6.

**Interactions.** Booms and corrections come from `PriceCycle.regimes`. Seasons come from `PriceCycle.seasonName`. Reprints come from `data.printChanges`. News comes from `data.marketEvents`. Nothing else reads the pressure except the four effects, so the price model is unchanged for cards and for sealed that is not hot. Part B reads the pressure for its fill rate.

### 2.2 Flipper dump

**`MarketEvent` change.** File: `M/PriceCycle.swift` L7-40.

```swift
    enum Kind: String, Codable {
        case hype, reprint, sealedHype, characterProduct, characterSellOut
        /// Flippers sell hot in-print sealed of a set after a reprint or a correction meets high pressure (Model/Flippers.swift).
        case flipperDump
    }
    ...
    /// A flipper dump: the products it moves (catalog IDs), and the days of the fall before the recovery.
    var products: [String]? = nil
    var fallDays: Int? = nil

    func factor(day: Int) -> Double {
        if kind == .flipperDump, let fall = fallDays {
            let t = day - startDay
            guard t >= 0, t < days else { return 1 }
            // The fall starts on the first day, so the news list shows the dump on the day of its report line.
            if t < fall { return 1 + peak * Double(t + 1) / Double(max(fall, 1)) }
            return 1 + peak * (1 - Double(t - fall) / Double(max(days - fall, 1)))
        }
        let t = Double(day - startDay) / Double(max(days, 1))
        guard t >= 0, t < 1 else { return 1 }
        return 1 + peak * (t < 0.2 ? t / 0.2 : (1 - t) / 0.8)
    }
```

`products` and `fallDays` are Optional `var`s, so the synthesized decoder reads them with `decodeIfPresent`. The memberwise init keeps working with the old 6 arguments. `movesCards` (L22) stays false for the dump. The only switch over `Kind` (L419-423) has `default: break`.

The dump carries its own linear recovery over `dumpRecoveryDays` (120). The walk pull applies only to the daily steps, not to events. The event ends at `fallDays + 120` with a factor of 1, so `marketEndDay` removes it with no jump.

`activeMarketEvents` hides events with a factor of 1 (`M/PriceCycle.swift` L460-463). The dump factor is below 1 from its first day, so the News list shows it that day.

**`marketEndDay` change.** L480: the news cap does not count dumps.

```swift
        if data.marketEvents.filter({ $0.kind != .flipperDump }).count < Balance.marketEventsMax, ...
```

**`sealedFactor` change.** L405-426. Take the dump out of the event loop and cap the reprint and the dump together.

```swift
        let jumps = printJumps(slug, product: id, day: d)
        var dump = 1.0
        for event in events where event.kind == .flipperDump && event.products?.contains(id) == true {
            dump *= event.factor(day: d)
        }
        var factor = sealedIndex(day: d)
            * exp(walk(key, tier: .sealed, day: d))
            * pow(1 + growth(Balance.sealedGrowthInPrint), days.inPrint / 364)
            * pow(1 + growth(Balance.sealedGrowthOutOfPrint(era: era)), days.outOfPrint / 364)
            * capDump(jumps: jumps, dump: dump)
            * seasonSealedPrice(day: d)
            * msrpLift(slugs: slugs, id: id, slug: slug, day: d)
        for event in events { ... }   // unchanged; `.flipperDump` falls into `default: break`
```

```swift
    /// The reprint and the dump together never cut more than `flipperDumpCap` (45%). The cap never raises a price:
    /// when the reprints alone already cut more, the dump adds nothing.
    static func capDump(jumps: Double, dump: Double) -> Double {
        dump < 1 ? min(jumps, max(1 - Balance.flipperDumpCap, jumps * dump)) : jumps
    }
```

**Starting a dump.** File: `M/Flippers.swift`.

```swift
    /// Starts a dump on the hot in-print products of these sets. Returns the report line, or nil.
    func startDump(slugs: [String], day: Int) -> String? {
        let ids = SetLibrary.catalog.filter { slugs.contains($0.homeSlug) && $0.isInPrint && $0.isHot() }.map(\.id)
        guard !ids.isEmpty else { return nil }
        let fall = Int.random(in: Balance.dumpFallDays)
        let names = slugs.map { SetLibrary.info($0)?.name ?? $0 }.joined(separator: " and ")
        var event = MarketEvent(kind: .flipperDump, subject: slugs.first ?? "",
                                title: "Flippers are dumping \(names) stock. Its hot sealed products fall for some weeks.",
                                startDay: day, days: fall + Balance.dumpRecoveryDays, peak: -Double.random(in: Balance.dumpDrop))
        event.products = ids
        event.fallDays = fall
        data.marketEvents.append(event)
        return "Market news: \(event.title)"
    }

    /// A correction hits the sets with the most hot in-print products. A tie sorts by slug, so the pick is stable.
    func dumpSetsForCorrection() -> [String] {
        let hot = SetLibrary.catalog.filter { $0.isInPrint && $0.isHot() }
        let counts = Dictionary(grouping: hot, by: \.homeSlug).mapValues(\.count)
        return counts.sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }
            .prefix(Balance.dumpCorrectionSets).map(\.key)
    }
```

Exclusivity: `data.marketEvents.append(event)` gets a built local. No closure.

**UI.** The dump shows in the Market screen news list (L57-67) with its percent and days left. The report line is "Market news: Flippers are dumping Prismatic Evolutions stock. ...".

**Tests.** T7.

**Interactions.** About 29% of reprints start a dump. The dump deepens the low of a reprinted product from about 0.75 to about 0.64 of its price. The cap binds in about 4% of dumps (sim section 4.7). The reprint lowers the pressure by 0.25 on the same day, so a second dump right after is less likely. Real graded prices never move: `sealedFactor` touches only sealed products.

### 2.3 Named rival flippers and rival creators

**Types.** File: `M/Rivals.swift`. These are phase 0 stubs with full bodies (D-9), so phase 2 code can call them. Part C reads them. `RivalKey` (`.rival(UUID)`, `.shop(LocalStore)`, D-8) is defined by Part C in `M/Callouts.swift` (Part C section 2.1) as a phase 0 stub. Part A does not define it again.

```swift
import Foundation

/// One meeting between the player and a rival. A rival keeps the last `Balance.rivalMemoryKept`.
struct RivalMemory: Codable, Hashable {
    enum Kind: String, Codable {
        /// The player bought the last hot units of a batch at the rival's home store.
        case playerTookShelf
        /// The player got in at a camp where the rival stood in line.
        case playerBeatInLine
        /// The rival cleared a hot shelf before the player came, or took a unit off the vendor's cart.
        case rivalTookShelf
        /// The rival took a table near the player at a show and listed the same sealed for less.
        case rivalUndercutAtShow
        /// Part C: the player called the rival out, or the rival called the player out.
        case playerCalledOut
        case rivalCalledOut
        /// Part C: a callout between them ended. `byPlayer` says who won.
        case calloutEnded
        /// Any other meeting that Part B or Part C records.
        case other
    }

    let kind: Kind
    let day: Int
    let note: String
    /// True when the player acted against the rival. Part C reads these as grudges.
    let byPlayer: Bool
}

struct Rival: Codable, Identifiable, Hashable {
    enum Kind: String, Codable { case flipper, creator }

    var id = UUID()
    let name: String
    /// The social handle, for posts (Part C).
    let handle: String
    let kind: Kind
    /// 0 to 1. Grows with grudges. Pulls back to `baseHostility` each day.
    var hostility: Double
    let baseHostility: Double
    /// `rivalCredFloor` to 1. How much the crowd believes this rival. Part C lowers it. It regains each week.
    var credibility = 1.0
    /// The last meetings, oldest first.
    var memory: [RivalMemory] = []
    /// A flipper's usual chains. Empty for a creator.
    var homeStores: [LocalStore] = []
    var lastSeenDay = -1

    /// The meetings where the player acted against the rival.
    var grudges: [RivalMemory] { memory.filter(\.byPlayer) }
}

/// Later builds can add fields. Each missing field takes its default. In an extension, so the memberwise init stays.
extension Rival {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        handle = try c.decodeIfPresent(String.self, forKey: .handle) ?? ""
        kind = try c.decode(Kind.self, forKey: .kind)
        hostility = try c.decodeIfPresent(Double.self, forKey: .hostility) ?? 0.2
        baseHostility = try c.decodeIfPresent(Double.self, forKey: .baseHostility) ?? 0.2
        credibility = try c.decodeIfPresent(Double.self, forKey: .credibility) ?? 1
        memory = try c.decodeIfPresent([RivalMemory].self, forKey: .memory) ?? []
        homeStores = try c.decodeIfPresent([LocalStore].self, forKey: .homeStores) ?? []
        lastSeenDay = try c.decodeIfPresent(Int.self, forKey: .lastSeenDay) ?? -1
    }
}
```

`Rival` is `Hashable`, so T11 can compare the decoded array with `==`. An unknown `RivalMemory.Kind` in a downgraded save throws for the whole `rivals` array, and `v()` then resets it. That is the normal one-way rule.

**Seeding.** File: `M/Rivals.swift`. Phase 0. Call `seedRivals()` in `GameStore.init()` after `seedContacts()` (L287) and in `startRun()` after `seedContacts()` (L539).

```swift
extension Balance {
    static let rivalFlipperNames = ["Tyler Voss", "Dana Ruiz", "Marco Bell", "Kayla Strom", "Devon Pike", "Jess Ortega"]
    static let rivalCreatorNames = [("Phil", "@packratphil"), ("Sam Okafor", "@sealedsam"), ("Rhea Lin", "@rheapulls"),
                                    ("Jonah Wade", "@jonahrips")]
}

@MainActor
extension GameStore {
    /// Three rival flippers and two rival creators, the same for one run. On an old save it also marks today's
    /// news as seen and sets the follower tier mark, so the first End Day after the update does not jump (A-m10).
    func seedRivals() {
        guard data.rivals.isEmpty else { return }
        var r = SeededRandom(seed: data.marketSeed ^ 0x5249_5641_4C53)
        var flippers = Balance.rivalFlipperNames
        var creators = Balance.rivalCreatorNames
        let chains = LocalStore.allCases.filter(\.isBigStore)
        var out: [Rival] = []
        for _ in 0..<Balance.rivalFlippers where !flippers.isEmpty {
            let name = flippers.remove(at: r.int(0...(flippers.count - 1)))
            let base = r.double(Balance.rivalBaseHostility)
            var home = chains
            let a = home.remove(at: r.int(0...(home.count - 1)))
            let b = home.remove(at: r.int(0...(home.count - 1)))
            let handle = "@" + name.lowercased().replacingOccurrences(of: " ", with: "") + "flips"
            out.append(Rival(name: name, handle: handle, kind: .flipper, hostility: base, baseHostility: base, homeStores: [a, b]))
        }
        for _ in 0..<Balance.rivalCreators where !creators.isEmpty {
            let pick = creators.remove(at: r.int(0...(creators.count - 1)))
            let base = r.double(Balance.rivalBaseHostility)
            out.append(Rival(name: pick.0, handle: pick.1, kind: .creator, hostility: base, baseHostility: base))
        }
        let seen = data.marketEvents.map(\.id)
        let tier = hasAccount ? followerTier : 0
        data.rivals = out
        data.retail.seenEvents = seen
        data.retail.followerTierMark = tier
    }
}
```

For a new run, `startRun` sets `data = GameData()` first (L531), so the seen list is empty and the mark is 0, as before. The names are invented. None is a real public person.

**API.** File: `M/Rivals.swift`. Phase 0, full bodies.

`Balance.rivalCredFloor` (0.25), `Balance.rivalCredWeekly` (0.05), and `Balance.rivalReceiptGapDays` (30) are Part C constants (Part C section 15). Part C defines them in phase 0 with its stubs. Part A reads them and does not define them again.

```swift
@MainActor
extension GameStore {
    func rival(_ id: UUID) -> Rival? { data.rivals.first { $0.id == id } }

    /// The rival flipper who works this store. The same store gives the same rival.
    func rivalAt(_ store: LocalStore) -> Rival? {
        let here = data.rivals.filter { $0.kind == .flipper && $0.homeStores.contains(store) }
        guard !here.isEmpty else { return nil }
        return here[Int(PriceCycle.unit("rival-" + store.rawValue) * Double(here.count)) % here.count]
    }

    /// Records a meeting. Keeps the last few. Moves the hostility by `delta`, clamped to 0...1.
    func rememberRival(_ id: UUID, _ kind: RivalMemory.Kind, note: String, byPlayer: Bool, hostility delta: Double = 0) {
        guard let i = data.rivals.firstIndex(where: { $0.id == id }) else { return }
        let today = data.day
        var r = data.rivals[i]
        r.memory.append(RivalMemory(kind: kind, day: today, note: note, byPlayer: byPlayer))
        if r.memory.count > Balance.rivalMemoryKept { r.memory.removeFirst(r.memory.count - Balance.rivalMemoryKept) }
        r.hostility = min(1, max(0, r.hostility + delta))
        r.lastSeenDay = today
        data.rivals[i] = r
    }

    /// Part C: a callout between the player and a rival changes the rival's hostility (integration 1.3).
    func adjustRivalHostility(_ id: UUID, _ delta: Double, note: String = "Callout", kind: RivalMemory.Kind = .playerCalledOut) {
        rememberRival(id, kind, note: note, byPlayer: kind == .playerCalledOut, hostility: delta)
    }

    /// Part C: a failed false callout costs credibility. Clamped to `rivalCredFloor`...1.
    func changeRivalCredibility(_ id: UUID, by delta: Double) {
        guard let i = data.rivals.firstIndex(where: { $0.id == id }) else { return }
        var r = data.rivals[i]
        r.credibility = min(1, max(Balance.rivalCredFloor, r.credibility + delta))
        data.rivals[i] = r
    }

    /// A shelf receipt against a rival (D-10): `rivalReceiptChance` on each "rival took the stock" line. Part C's
    /// `noteRivalReceipt` keeps the 30-day gap for each rival and stores the receipt.
    func noteShelfReceipt(_ id: UUID, note: String) {
        guard Double.random(in: 0..<1) < Balance.rivalReceiptChance else { return }
        noteRivalReceipt(id, note: note)
    }
}
```

Exclusivity: each `firstIndex(where:)` is a read with a closure that reads only the local `id`. The write comes after. Never call these functions, or `noteRivalReceipt`, from inside a closure on `data.rivals`.

Phase 0 needs Part C's `noteRivalReceipt(_ id: UUID, note: String)` as a no-op stub (D-9). The revised Part C file (section 7.1) takes the rival's `UUID`, because a game shop can never give a receipt. If Part C changes the parameter to `RivalKey`, the two call sites in this file become `noteRivalReceipt(.rival(id), note:)`.

**Daily behavior.** File: `M/Rivals.swift`. Integration step 16, after Part C's `calloutsEndDay()`.

```swift
    /// End Day: hostility pulls back to each rival's base. Credibility regains once a week. Creators react when the
    /// player's follower tier rises. No money moves.
    func rivalsEndDay() -> [String] {
        var rivals = data.rivals
        guard !rivals.isEmpty else { return [] }
        let tier = hasAccount ? followerTier : 0
        let rose = tier > data.retail.followerTierMark
        let weekly = data.day % 7 == 0
        var lines: [String] = []
        for i in rivals.indices {
            rivals[i].hostility += (rivals[i].baseHostility - rivals[i].hostility) * Balance.rivalHostilityPull
            if weekly { rivals[i].credibility = min(1, rivals[i].credibility + Balance.rivalCredWeekly) }
            if rose, rivals[i].kind == .creator {
                rivals[i].hostility = min(1, rivals[i].hostility + Balance.rivalCreatorTierRise)
            }
        }
        if rose, let loudest = rivals.filter({ $0.kind == .creator }).max(by: { $0.hostility < $1.hostility }) {
            lines.append("\(loudest.name) (\(loudest.handle)) noticed your channel grow. Creators see you as competition now.")
        }
        data.rivals = rivals
        if rose { data.retail.followerTierMark = tier }
        lines += rivalTableReceipts()
        return lines
    }

    /// C-I3: a sealed item from a rival's show table that the player now knows is fake gives a receipt against that
    /// rival. One scan here covers every way a fake comes out (a check, a rip, a buyer). An entry ends when it pays a
    /// receipt, when the item leaves the inventory, or after `rivalBuyKeepDays`.
    func rivalTableReceipts() -> [String] {
        let buys = data.retail.rivalBuys
        guard !buys.isEmpty else { return [] }
        let byID = Dictionary(data.sealed.map { ($0.id.uuidString, $0) }, uniquingKeysWith: { a, _ in a })
        let today = data.day
        var keep: [String: UUID] = [:]
        var found: [(rival: UUID, name: String)] = []
        for (itemID, rivalID) in buys {
            guard let item = byID[itemID], today - item.acquiredDay <= Balance.rivalBuyKeepDays else { continue }
            if item.isKnownFake { found.append((rivalID, item.name)) } else { keep[itemID] = rivalID }
        }
        data.retail.rivalBuys = keep
        var lines: [String] = []
        for f in found {
            guard let r = rival(f.rival) else { continue }
            noteRivalReceipt(f.rival, note: "\(r.name) sold you a resealed \(f.name)")
            lines.append("You have proof now: \(r.name) sold you a resealed \(f.name). You can call it out.")
        }
        return lines
    }
```

Exclusivity: the loop changes the local `rivals`. `tier`, `rose`, and `weekly` are read before the loop. `rivalTableReceipts` builds `keep` and `found` from locals, writes `rivalBuys` once, then calls `noteRivalReceipt` in a plain loop. Safe.

`SealedItem.acquiredDay` (`M/Inventory.swift` L575, `Int`) is the purchase day.

**Rival lines at the store run.** `writeVisitLines` (section 1.2) writes them at the visit start. The view reads `data.retail.visitLines`. A line shows only when the drain emptied the item and the player did not take the last unit (D-10).

**Rival at a camp.** File: `M/Rivals.swift`.

```swift
    /// The camp line: who was in line. The same store and day give the same answer.
    func campRivalLine(_ store: LocalStore, success: Bool) -> (rival: Rival, line: String)? {
        guard let rival = rivalAt(store), PriceCycle.unit("camp-\(store.rawValue)-\(data.day)") < Balance.rivalCampChance else { return nil }
        return (rival, success ? "\(rival.name) was behind you in line and left with less."
                               : "\(rival.name) and two friends were at the front of the line.")
    }
```

In `camp(_:)` (Camping L86-103), read `let met = campRivalLine(store, success: ok)` once. On a bust with a rival: add the line to the log text, call `rememberRival(met.rival.id, .rivalTookShelf, note:, byPlayer: false)`, then `noteShelfReceipt(met.rival.id, note: "\(met.rival.name) cleared the \(store.rawValue) restock")`. On a success with a rival: `rememberRival(met.rival.id, .playerBeatInLine, note:, byPlayer: true, hostility: Balance.rivalBeatInLineHostility)`. `CampHaul` gets `var rivalLine: String? = nil` for `CampView`.

**Rival at a show.** File: `M/Shows.swift`.

- `CardShow` (L20-38): add `/// A rival flipper took a nearby table (Model/Rivals.swift). Optional, so old saves still load.` `var rivalID: UUID?`.
- `startShowDay()` (L144-155): after L148 and before `save()`:

```swift
        if show.booked, data.shows[i].rivalID == nil, let rival = pickShowRival() {
            data.shows[i].rivalID = rival.id
            rememberRival(rival.id, .rivalUndercutAtShow, note: "\(rival.name) took a table near yours at \(show.name)", byPlayer: false)
        }
```

```swift
    /// A hostile rival flipper may follow the player to a booked show.
    func pickShowRival() -> Rival? {
        let candidates = data.rivals.filter { $0.kind == .flipper && $0.hostility >= Balance.rivalShowMinHostility }
        guard let r = candidates.max(by: { $0.hostility < $1.hostility }),
              Double.random(in: 0..<1) < Balance.rivalShowBase + Balance.rivalShowSlope * r.hostility else { return nil }
        return r
    }
```

`startShowDay` returns `data.shows[i]` after the change, so the session gets the rival.

Exclusivity: `if let rival = pickShowRival()` binds before the write `data.shows[i].rivalID = rival.id`. Safe.

- `ShowSession` (L719 on): add two `let` properties, set in `init(venue:store:show:vendors:regulars:)` (L803-829) after `stock` (L816):

```swift
    /// The rival at a nearby table, and the in-print sealed items that the rival also lists.
    let rival: Rival?
    let rivalItems: Set<UUID>
    ...
        rival = show?.rivalID.flatMap { store.rival($0) }
        rivalItems = rival == nil ? [] : Set(stock.sealed.filter { SetLibrary.product($0.productID)?.isInPrint == true }.map(\.id))
```

- `makeBuyer(regular:)` (L1143): between L1205 (`if type == .vintageFan ...`) and L1206 (`top = max(0.25, top)`):

```swift
        if let rival, !item.pc, rivalItems.contains(item.id) {
            let theirs = Self.round(asking(item) * (1 - Balance.rivalUndercut))
            if top > theirs {
                top = theirs
                line = "\(rival.name) has this two tables down for \(money(theirs)). " + line
            }
        }
```

A buyer then pays at most 95% of the player's ask for an in-print sealed item that the rival also lists. This gives the D/02 risk "other flippers undercutting your prices" a mechanic.

**The rival's table on the floor (C-I3).** The player can buy from the rival. Part of the rival's stock is resealed.

- `Vendor` (`M/Vendors.swift` L241): add `var rivalID: UUID? = nil`. `Vendor` is runtime only, so no save change.
- `convenience init(show:store:)` (`M/Shows.swift` L790-801): when `show.rivalID` names a rival, append one vendor before the session starts:

```swift
        var vendors = VendorFloor.tables(for: show.size, recurring: store.attendingVendors(show))
        if let id = show.rivalID, let rival = store.rival(id) {
            let pool = SetLibrary.catalog.filter { $0.isInPrint && $0.isHot() && !$0.isStoreExclusive && $0.msrp != nil }
            let items = pool.shuffled().prefix(Int.random(in: Balance.rivalTableItems)).map {
                VendorItem(goods: .sealed($0), price: ShowSession.round($0.market * Balance.rivalTablePrice), market: $0.market)
            }
            var table = Vendor(name: "\(rival.name) (rival)", kind: .sealedDealer, items: Array(items))
            table.rivalID = id
            vendors.append(table)
        }
```

  Pass `vendors` to `self.init(...)` in place of the inline call.
- The fake roll loop in `init(venue:...)` (L819-827): for a vendor with `rivalID`, use the plug source (`FakeSource.plug`, Part B phase 4) in place of `store.fakeSource(...)`. The rival table then carries the plug fake rate (`fakeRatePlug` 0.055, D-13).
- The buy (`ShowSession.buy(_:from:)`, `M/Shows.swift` L2002). It calls `buyGoods`, which reaches `buySealedAtShow` (L228-229) for sealed goods, and that appends one `SealedItem`. After the `buyGoods` call, add:

```swift
        if let rivalID = vendor.rivalID, case .sealed = item.goods, let bought = store.data.sealed.last {
            store.data.retail.rivalBuys[bought.id.uuidString] = rivalID
        }
```

  The key and the value are locals, so the write reads no other part of `data`.
- `rivalsEndDay` turns a found fake into a receipt (`rivalTableReceipts`, above).

**UI.**

1. `RivalsBox` (`Hub/FlipperViews.swift`), inside `FlipperMarketBox`: one row for each rival that the player has met (`lastSeenDay >= 0`). Name and handle, kind ("Flipper · Target, GameStop" or "Creator"), a mood word from hostility (under 0.3 "Neutral" in `Theme.muted`, under 0.6 "Wary" in `Theme.orange`, else "Hostile" in `.red`), and the newest memory note in a caption. `Theme` has no `red` (`Support/Support.swift` L7-14). `.red` is the color that `Social/SocialViews.swift` already uses.
2. `StoreRunView`: the "Gone" row text (section 1.2).
3. `CampView`: `haul.rivalLine` in place of "The shelf is yours before the scalpers" (L92).
4. The show: the rival line reaches the player through the buyer's line. The show setup header (`Show/ShowDayView.swift`, setup phase) shows a `Banner` (cyan) "\(rival.name) set up two tables down with sealed product." when `session.rival != nil`.

**Tests.** T10 seeds rival memory before the 14-day run. T11 checks the round trip.

### 2.4 Scalper heat

**Values.** `data.scalperHeat` (global, read by Parts B and C) and `data.retail.storeHeat` (each chain, drives bans).

**`addHeat`.** File: `M/Flippers.swift`.

```swift
    /// Adds heat for a shady retail act, and records the act with its own weight (D-2). `store` nil is a bot act
    /// online: global heat only. `storeBanHeat` at one chain gets the player refused there for `storeBanDays`.
    func addHeat(_ amount: Double, at store: LocalStore?, act: HiddenActKind, weight: Double, witnesses: Int = 0, note: String) {
        data.scalperHeat += amount
        recordHiddenAct(act, weight: weight, note: note, witnesses: witnesses)
        guard let store else { return }
        let key = store.rawValue
        let today = data.day
        let heat = (data.retail.storeHeat[key] ?? 0) + amount
        guard heat >= Balance.storeBanHeat else {
            data.retail.storeHeat[key] = heat
            // Heat hints at 60% and 85% of the ban level (D-1), once a day each.
            let step = heat >= Balance.storeBanHeat * Balance.heatHintHigh ? 2 : heat >= Balance.storeBanHeat * Balance.heatHintLow ? 1 : 0
            if step > (data.retail.heatHintShown[key] ?? 0) {
                data.retail.heatHintShown[key] = step
                retailNotice = heatHint(store)
            }
            return
        }
        let until = today + Balance.storeBanDays
        data.retail.storeHeat[key] = heat * Balance.heatAfterBan
        data.retail.bannedUntil[key] = until
        let text = "\(key) staff know your face now. They refuse to sell you cards until \(GameCalendar.date(until).text)."
        retailNotice = text
        log(text)
        recordHiddenAct(.storeBan, weight: 1.5, note: "Refused card sales at \(key)", witnesses: 3)
    }

    /// The hint at a chain, from its heat. The number stays hidden.
    func heatHint(_ store: LocalStore) -> String? {
        let heat = data.retail.storeHeat[store.rawValue] ?? 0
        if heat >= Balance.storeBanHeat * Balance.heatHintHigh {
            return "The \(store.rawValue) staff watch you at the card aisle. One more push and they stop selling to you."
        }
        if heat >= Balance.storeBanHeat * Balance.heatHintLow {
            return "The \(store.rawValue) cashier looks at your cart, then at you."
        }
        return nil
    }
```

**Decay.** File: `M/Flippers.swift`, inside `flippersEndDay()`:

```swift
    private func heatEndDay(day: Int) -> [String] {
        data.scalperHeat *= Balance.heatKeep
        var retail = data.retail
        retail.storeHeat = retail.storeHeat.mapValues { $0 * Balance.heatKeep }.filter { $0.value >= 0.1 }
        retail.incidentBoost = retail.incidentBoost.mapValues { $0 * Balance.incidentBoostKeep }.filter { $0.value >= 0.001 }
        let ended = retail.bannedUntil.filter { $0.value < day }.map(\.key)
        for key in ended { retail.bannedUntil[key] = nil }
        data.retail = retail
        return ended.sorted().map { "\($0) sells you cards again." }
    }
```

Exclusivity: every closure runs on the local `retail` and reads only `day` or the element. Safe.

**Sources of heat (D-1).** A buy that empties a hot item with 2 or more units of it in the visit: +1. The first buy on a repeat visit: +2. Each checkout bot use: +3. A single hot buy at the limit adds no heat. Bans and cancelled bot orders add no heat, but they record acts.

With the D-13 values the sim gives the honest player 0.12 bans a year (one ban in 9% of runs), and the aggressive flipper 26 bans a year of 21 days each (sim section 7). With the D-1 rule an honest player rarely takes 2 units of one hot item, so the honest ban rate is lower than that sim number. Check it with `-retailsim` after phase 2.

**Save compatibility.** Both values default to 0.

**Tests.** T3.

**Interactions.** Part C reads `data.scalperHeat`. Report 6.2 lists "scalper heat of 10 or more" as a secret. It maps to the `storeBan` act. A ban blocks the shelf and the camp at that chain only.

### 2.5 Flip-margin line on the expected value readout

The game already charges platform fees on sealed sales. No new fee.

File: `M/Flippers.swift`.

```swift
    /// What a flip on eBay nets: the market price, less the cost, the eBay fee, and the shipping.
    func flipMargin(market: Double, cost: Double) -> Double {
        let c = saleCosts(price: market, channel: .ebay, sealed: true, insured: false)
        return market - cost - c.fees - c.shipping
    }
```

The instance method `saleCosts` ([M/Upgrades.swift L234-239](../../../app/PokeVendor/Model/Upgrades.swift)) applies the shipping kit.

**UI.** Only with the `evReadout` upgrade:

1. `SealedDetailView` "Prices" box (`Inventory/DetailViews.swift` L481-494): add `StatCell(label: "Flip on eBay", value: money(m), color: m >= 0 ? Theme.green : Theme.orange)` with `m = store.flipMargin(market: store.market(of: item), cost: item.paid)`. Extend the caption at L490: "Flip on eBay: the market price less what you paid, the eBay fee, and the shipping."
2. `StoreRunView` shelf rows (`Buy/StoreRunViews.swift` L155) and `CampView` rows (`Hub/OpportunityView.swift` L106): add `" · flip \(money(store.flipMargin(market: item.product.market, cost: item.price)))"`.

**Tests.** No check: display only.

### 2.6 Checkout bot (dark upgrade) and the Target.com drop

**Upgrade.** File: `M/Upgrades.swift`. The upgrade case is `checkoutBot`. The hidden act is `botCheckout`. The merge renamed both. This file restores the upgrade name, so the two enums do not share a case name by accident.

- Enum (L5-47): add `/// A checkout bot: better online drop odds, more cancellations, and scalper heat (Model/Flippers.swift).` `case checkoutBot`.
- `name`: `"Checkout bot"`. `detail`: `"Doubles your Pokemon Center odds to 60% and gives two Target.com attempts. Stores cancel 35% of bot orders, and each use leaves a trace."` `icon`: `"cpu"`. `requires`: the `default: nil` branch covers it.
- `upgradeCosts` (L198-207): `.checkoutBot: 400`.
- `UpgradesView` "Buying" box (L46-57): `upgradeRow(.checkoutBot)` after `.restockBot`.

The exhaustive switches over `Upgrade` are `name`, `detail`, and `icon`. The compiler finds each one.

**Pokemon Center.** `attemptDrop(_:bot:)` (section 1.5). `StoreView` (`Buy/BuyViews.swift`): the confirmation dialog (L134-139) gets a second button when the player owns the bot: `Button("Try with the bot · \(total)") { purchase(offer, bot: true) }`. `purchase(_:)` (L175) gets `bot: Bool = false` and passes it to `attemptDrop`.

**Target.com drop.** File: `M/RetailOnline.swift`.

```swift
    /// Target.com restocks most on Fridays. One hot in-print product at MSRP, 1 unit.
    func targetDrop(day: Int) -> StoreOffer? {
        var r = SeededRandom(seed: (UInt64(day + 1) &* 32_452_867 &+ 4_049) ^ data.marketSeed)
        let chance = day % 7 == 4 ? Balance.targetDropFridayChance : Balance.targetDropOtherChance
        guard r.double(0...1) < chance else { return nil }
        let pool = SetLibrary.catalog.filter { ["Elite Trainer Box", "Booster bundle", "Collection", "Tin", "Blister"].contains($0.kind)
                                               && $0.inPrint(on: day) && !$0.isStoreExclusive && $0.isHot(day: day) }
        guard !pool.isEmpty else { return nil }
        let p = pool[r.int(0...(pool.count - 1))]
        guard let price = p.retailMSRP(day: day) else { return nil }
        return StoreOffer(id: "tgt-\(day)", store: .amazon, item: .product(p, p.homeSlug), price: price, shipping: 0,
                          deliveryDays: Balance.targetDeliveryDays, note: "Target.com · limit 1")
    }

    var targetAttemptsLeft: Int {
        let used = data.retail.targetAttemptDay == data.day ? data.retail.targetAttempts : 0
        return (hasUpgrade(.checkoutBot) ? Balance.targetBotAttempts : Balance.targetAttempts) - used
    }

    /// One Target.com attempt. Without the bot, one attempt. With the bot owned, two, and the second needs the bot.
    /// Each bot attempt adds heat.
    func attemptTargetDrop(_ offer: StoreOffer, bot: Bool) -> Bool {
        let owns = hasUpgrade(.checkoutBot)
        let useBot = bot && owns
        let today = data.day
        guard targetAttemptsLeft > 0, useBot || targetAttemptsLeft > (owns ? 1 : 0),
              !data.boughtToday.contains(offer.id), canAfford(offer.price), let p = offer.product else { return false }
        var retail = data.retail
        retail.targetAttempts = retail.targetAttemptDay == today ? retail.targetAttempts + 1 : 1
        retail.targetAttemptDay = today
        data.retail = retail
        if useBot { addHeat(Balance.heatBotUse, at: nil, act: .botCheckout, weight: 0.5, note: "Used a checkout bot on Target.com") }
        guard Double.random(in: 0..<1) < Balance.targetDropSuccess else {
            log("Missed the Target.com drop for \(p.name).")
            save()
            return false
        }
        data.boughtToday.append(offer.id)
        addLedger(-offer.price, .sealed, "\(p.name) · Target.com")
        let item = SealedItem(setSlug: p.homeSlug, name: p.name, packs: p.packs, paid: offer.price, acquired: .now,
                              source: "Bought on Target.com", productID: p.id,
                              status: .arriving(daysLeft: Balance.targetDeliveryDays, from: "Target.com"), acquiredDay: today)
        data.sealed.append(item)
        addDropOrder(item: item, source: "Target.com", bot: useBot, refund: offer.price, deliveryDays: Balance.targetDeliveryDays)
        log("Bought \(p.name) on Target.com for \(money(offer.price)).", cash: -offer.price)
        save()
        return true
    }
```

`StoreOffer.store` is a `Storefront`, and Target.com is not one. The offer fills the field with `.amazon`. `OfferRow` reads `offer.store` only for the button title (`== .pokemonCenter`, L236). The purchase goes through `attemptTargetDrop`, not `buy(_:)`, and the status is `.arriving(from: "Target.com")`. A new `Storefront` case would touch the exhaustive switches in `Market.offers` (L102), `BuyView.status` (L72-82), and `StoreView.header` (L142-150), so this plan does not add one.

The order roll window for a 3-day delivery is 1 to 2 days (section 1.5), so every roll can cancel.

**UI.** `ChainSitesView` section "Target.com · most drops on Friday": the offer row (`OfferRow`, `Buy/BuyViews.swift` L196, with `locked: store.targetAttemptsLeft == 0`), the text `"\(n) attempt(s) left today · success 20%"`, and the buttons `Try` and, with the bot, `Try with the bot`. With no drop: `"No Target.com drop today."` A `Banner` shows the result.

**Tests.** T12 (attempt gating). T4 covers the cancellation path.

**Interactions.** A bot order has a 35% cancellation chance. The drop-alert Discord ($60) and the restock alert bot ($150) stay the clean options.

---
## 3. More mechanics that the notes support

The report recommends seven rows. Part A builds five. Integration section 4 builds the other two (the opened-at-MSRP offer and the store break-in). The report advises against three ideas (a fast-food promo week, "Lucky Box" machines, Japan rules). This plan adds none of them.

### 3.1 Shows that ban in-print sealed

**Model.** File: `M/Shows.swift`.

- `CardShow` (L20-38): add `/// The show bans sealed product that is for sale at retail now (docs/20-card-shows.md). Optional, so old saves still load.` `var noInPrintSealed: Bool?`.
- `scheduleShows()` (L83-103). Replace the append at L95 with this. The separate seed keeps the existing names and venues:

```swift
                    var ban = SeededRandom(seed: UInt64(day) &* 7_919 &+ 613)
                    var show = CardShow(name: name, venue: venue, size: size, startDay: day)
                    show.noInPrintSealed = ban.double(0...1) < Balance.noInPrintSealedShare
                    data.shows.append(show)
```

Shows that an old save already planned keep `nil`, which reads as no ban.

- A helper on `GameStore` (M/Retail.swift): `func bannedAtShow(_ item: SealedItem, show: CardShow?) -> Bool { show?.noInPrintSealed == true && SetLibrary.product(item.productID)?.isInPrint == true }`. A case item keeps the `productID` of its unit product (integration 1.6), so a case of an in-print product is banned too.
- `ShowSession.init` (L818): build `bring` from stock that passes the rule:

```swift
        let banned = { (s: SealedItem) in store.bannedAtShow(s, show: show) }
        bring = Set(stock.cards.filter { !$0.pc }.map(\.id) + stock.sealed.filter { !$0.pc && !banned($0) }.map(\.id))
```

- `stockItems` (L881-884):

```swift
    var stockItems: [ShowItem] {
        guard venue.kind != .store else { return store.showItems(store.storeStock) }
        let s = store.showStock
        return store.showItems((s.cards, s.sealed.filter { !store.bannedAtShow($0, show: show) }))
    }
```

Exclusivity: these closures read `store.data` and mutate nothing in `data` (`bring` is a `ShowSession` property). Safe.

- Floor vendors: in `convenience init(show:store:)` (L790-801), after `VendorFloor.tables(...)`, drop vendor items whose goods are `.sealed(p)` with `p.isInPrint` when `show.noInPrintSealed == true`. The sealed dealer then carries only older sealed.
- Visitors who sell (A-m19):
  - `sellerGoods()` (L1322-1338): when `show?.noInPrintSealed == true` and the picked product `isInPrint`, return nil. The seller does not come with that item.
  - `makeCollectionSeller()` (`M/Collections.swift` L603): after the lot is made (the local `lot`), at a banned show remove the in-print sealed pieces: `lot.pieces.removeAll { if case .sealed(let p) = $0.goods { return p.isInPrint }; return false }`. The lot is a local value, so the closure reads no `data`.
  - `makeTrader()` (L1261) trades only cards, so it needs no change.

**UI.** Where a show row shows its size and fee (the calendar and `ShowDetailView`), add a tag `"No in-print sealed"` in `Theme.orange`. The packing screen of a banned show adds a caption: `"This show bans sealed product that stores sell now. Bring singles, slabs, or out-of-print sealed."`

**Tests.** T13 (phase 7, after Part B's case item exists): a case item of an in-print product is banned at a show with the rule. T10's booked test show has `noInPrintSealed == nil`, so the existing `play()` load checks still hold.

### 3.2 Official card vending machines as a stock source

These are TPCi machines in stores, not the player's own machines (`M/Vending.swift`). File: `M/Camping.swift`.

```swift
/// An official Pokemon card machine in a store. It posts a restock like a big store.
enum OfficialMachine: String, CaseIterable, Codable, Hashable {
    case grocery = "Grocery store card machine", pharmacy = "Pharmacy card machine"
}

struct MachineRestock: Identifiable, Hashable {
    let machine: OfficialMachine
    let day: Int
    let hour: Double
    var id: String { "\(machine.rawValue)-\(day)" }
}

extension Balance {
    static let machineCycleDays = 10
    static let machineNotice = 2
    static let machineCampHours = 2.0
    static let machineSuccess = 0.7
    static let machineLimit = 2
    static let machineProducts = 1...3
    static let machineHours = 10...16
    static let machineKinds = ["Booster pack", "Booster bundle", "Elite Trainer Box", "Tin", "Blister"]
}

@MainActor
extension GameStore {
    func machineRestockDay(_ m: OfficialMachine, cycle: Int) -> (day: Int, hour: Double) {
        var r = SeededRandom(seed: UInt64(cycle + 1) &* 52_711 &+ UInt64(OfficialMachine.allCases.firstIndex(of: m) ?? 0) &* 1_433)
        return (cycle * Balance.machineCycleDays + r.int(0...(Balance.machineCycleDays - 1)), Double(r.int(Balance.machineHours)))
    }

    /// Posted machine restocks: today, and up to 2 days ahead. Same shape as `postedRestocks` (L44-54).
    var postedMachineRestocks: [MachineRestock] {
        let cycle = data.day / Balance.machineCycleDays
        var out: [MachineRestock] = []
        for m in OfficialMachine.allCases {
            for c in [cycle, cycle + 1] {
                let r = machineRestockDay(m, cycle: c)
                if r.day >= data.day, r.day - data.day <= Balance.machineNotice { out.append(MachineRestock(machine: m, day: r.day, hour: r.hour)) }
            }
        }
        return out.sorted { $0.day < $1.day }
    }

    var machineRestocksNow: [MachineRestock] { postedMachineRestocks.filter { $0.day == data.day } }

    func machineCampBlock(_ r: MachineRestock) -> String? {
        if data.campedDays.contains(r.id) { return "Done for today" }
        guard let start = slot(for: Balance.machineCampHours) else { return "Not enough time today" }
        if start > r.hour + 2 { return worksToday ? "You work today · call in sick or book time off" : "Too late · the machine sold out" }
        return nil
    }

    /// Waits at a machine restock for 2 hours. On a success, 1 to 3 products at MSRP, at most 2 of each.
    func campMachine(_ restock: MachineRestock) -> CampHaul? {
        guard machineCampBlock(restock) == nil, let start = slot(for: Balance.machineCampHours) else { return nil }
        let arrive = max(start, restock.hour - 1)
        data.hour = arrive + Balance.machineCampHours
        let id = restock.id
        let suffix = "-\(data.day)"
        data.campedDays.append(id)
        data.campedDays.removeAll { !$0.hasSuffix(suffix) }
        let late = max(0, arrive - (restock.hour - 1))
        let chance = Balance.machineSuccess * pow(Balance.arrivalKeep, late) * flipperCampFactor
        guard Double.random(in: 0..<1) < chance else {
            log("Waited \(formatHours(Balance.machineCampHours)) at the \(restock.machine.rawValue.lowercased()). It sold out before your turn.")
            save()
            return CampHaul(store: nil, machine: restock.machine, items: [])
        }
        var r = SeededRandom(seed: UInt64(data.day + 1) &* 6_173 &+ UInt64(OfficialMachine.allCases.firstIndex(of: restock.machine) ?? 0))
        let options = SetLibrary.catalog.filter { $0.isInPrint && Balance.machineKinds.contains($0.kind) && $0.msrp != nil && !$0.isStoreExclusive }
        var items: [ShelfItem] = []
        for i in 0..<r.int(Balance.machineProducts) where !options.isEmpty {
            let p = options[r.int(0...(options.count - 1))]
            if items.contains(where: { $0.product.id == p.id }) { continue }
            items.append(ShelfItem(id: "machine-\(id)-\(i)", product: p, price: p.retailMSRP() ?? p.market,
                                   quantity: min(Balance.machineLimit, r.int(1...4)), hot: p.isHot()))
        }
        log("Waited \(formatHours(Balance.machineCampHours)) at the \(restock.machine.rawValue.lowercased()). You got \(items.count) product\(items.count == 1 ? "" : "s") at MSRP.")
        save()
        return CampHaul(store: nil, machine: restock.machine, items: items)
    }

    /// Buys from a machine haul: cash only, no heat (the machine sets the limit).
    @discardableResult
    func buyMachineItem(_ item: ShelfItem, machine: OfficialMachine) -> Bool {
        guard shelfLeft(item) > 0, canAfford(item.price) else { return false }
        let today = data.day
        addLedger(-item.price, .sealed, "\(item.product.name) · card machine")
        data.shelfBought[item.id, default: 0] += 1
        data.sealed.append(SealedItem(setSlug: item.product.homeSlug, name: item.product.name, packs: item.product.packs,
                                      paid: item.price, acquired: .now, source: "Bought at a card machine",
                                      productID: item.product.id, acquiredDay: today))
        log("Bought \(item.product.name) at the \(machine.rawValue.lowercased()) for \(money(item.price)).", cash: -item.price)
        save()
        return true
    }
}
```

Exclusivity: `campMachine` prunes old `campedDays` keys with the local `suffix`, as `camp(_:)` does (L81-83). A machine key ends with `-<day>`, so each prune also removes old keys of the other kind. Never write `data.campedDays.removeAll { !$0.hasSuffix("-\(data.day)") }`.

**`CampHaul` change.** `M/Camping.swift` L14-20:

```swift
struct CampHaul: Identifiable {
    let id = UUID()
    /// The big store. Nil for an official card machine.
    let store: LocalStore?
    var machine: OfficialMachine? = nil
    let items: [ShelfItem]
    /// Who was in line (Model/Rivals.swift).
    var rivalLine: String? = nil

    var success: Bool { !items.isEmpty }
    var place: String { store?.rawValue ?? machine?.rawValue.lowercased() ?? "the store" }
}
```

`camp(_:)` still passes `store:`. `CampView` (`Hub/OpportunityView.swift`) has three uses of `haul.store.rawValue` that break when `store` is Optional: L92 and L93 (the intro texts) use `haul.place`. L111 (the buy) becomes `if let m = haul.machine { store.buyMachineItem(item, machine: m) } else if let s = haul.store { store.buyShelf(item, at: s, credit: false) }`. The limit caption and the heat hint show only when `haul.store != nil`.

**Calendar and hub.** `restockEntries(day:)` (Camping L58-64): append machine entries with kind `.restock`, title "\(machine) restock", detail "About \(clock) · wait 2 hours · limit 2". `HubView` (L197-208): a second `ForEach(store.machineRestocksNow)` with a `ChevronRow` (icon `"square.grid.3x3"`), title "Wait at the \(machine)", detail from `machineCampBlock` or "About \(clock) · 2 hours · limit 2 of each". L209 adds `store.machineRestocksNow.isEmpty` to the empty check.

**Tests.** No separate check. T1 covers the shared shelf limit code.

### 3.3 Missing distributor shipment

The distributor belongs to Part B. Part A owns this one rule. Part B calls the hook from its order code (integration 1.5).

**Type.** File: `M/RetailOnline.swift`.

```swift
/// A distributor order that never arrived. The refund comes after a claim.
struct MissingShipment: Codable, Identifiable, Hashable {
    var id = UUID()
    let name: String
    /// The day the player learns that the order is lost (its normal delivery day).
    let noticeDay: Int
    let refundDay: Int
    let refund: Double
    var noticed = false
}
```

**Hook.** File: `M/RetailOnline.swift` (D-12).

```swift
extension Balance {
    static let wholesaleMissingChance = 0.01
    /// Days from the notice to the refund.
    static let missingShipmentRefundDays = 14
}

@MainActor
extension GameStore {
    /// The order is lost on the way. `learnIn` is the days until the player learns it: the normal delivery days.
    /// The refund comes `missingShipmentRefundDays` after that.
    func registerMissingShipment(name: String, refund: Double, learnIn: Int) {
        let notice = data.day + learnIn
        data.retail.missingShipments.append(MissingShipment(name: name, noticeDay: notice,
                                                            refundDay: notice + Balance.missingShipmentRefundDays, refund: refund))
    }

    func missingShipmentsEndDay() -> [String] {
        let today = data.day
        var lines: [String] = []
        var all = data.retail.missingShipments
        for i in all.indices where !all[i].noticed && all[i].noticeDay <= today {
            all[i].noticed = true
            lines.append("Your \(all[i].name) did not arrive. The distributor's truck never reached you. It opened a claim, and the refund comes in \(Balance.missingShipmentRefundDays) days.")
        }
        let paid = all.filter { $0.refundDay <= today }
        data.retail.missingShipments = all.filter { $0.refundDay > today }
        for s in paid {
            addLedger(s.refund, .wholesale, "Missing shipment refund · \(s.name)")
            lines.append("The distributor refunded \(money(s.refund)) for the missing \(s.name).")
        }
        return lines
    }
}
```

Exclusivity: the loops and filters run on the local `all` and read only `today`. The list is written back before `addLedger` runs, and `addLedger` runs in a plain loop over the local `paid`. Safe.

Refund category: `.wholesale`, positive, as the short-shipment refund (`M/Wholesale.swift` L99). The order cost counted as a cost, so the refund nets it for income tax.

**Call site until Part B replaces it.** `buyWholesale` (`M/Wholesale.swift` L85). After the short-shipment block (L95-101) and in place of the loop that appends the units (L102-107):

```swift
        if Double.random(in: 0..<1) < Balance.wholesaleMissingChance {
            registerMissingShipment(name: "\(cases) case\(cases == 1 ? "" : "s") of \(offer.product.name)",
                                    refund: offer.unitPrice * Double(boxes), learnIn: Balance.wholesaleDeliveryDays)
        } else {
            for _ in 0..<boxes { ... }   // the existing loop L102-107
        }
```

Part B's phase 4 order code uses the same call with its own delivery days.

**UI.** The lines are in the morning report. `WalletView` (`Hub/WalletView.swift`) gets a `DetailBox(title: "Pending refunds")` after the ledger box (L58), shown only when `missingShipments` is not empty. Each row: the name, the amount, and `"refund on <date>"`.

**Tests.** T8.

### 3.4 MSRP step

**Model.** `data.retail.msrpStepDay` (section 0.3). File: `M/PriceCycle.swift`.

- Add to `PriceCycle` (near L161-177): `nonisolated(unsafe) private(set) static var msrpStepDay: Int? = nil` and `nonisolated(unsafe) private(set) static var winterScales: [Int: Double] = [:]`.
- `sync(...)` (L179-198): add the parameters `msrpStepDay: Int? = nil, winterScales: [Int: Double] = [:]` and store them. The defaults keep every other caller compiling.
- `syncMarket()` (L453-458): pass `msrpStepDay: data.retail.msrpStepDay, winterScales: data.retail.winterScales`.

```swift
extension PriceCycle {
    /// 1 before the MSRP step, then 1 + `Balance.msrpStep`.
    static func msrpFactor(day: Int? = nil) -> Double {
        guard let step = msrpStepDay, (day ?? today) >= step else { return 1 }
        return 1 + Balance.msrpStep
    }

    /// A product in print on the step day gains part of the step in its market price, over `msrpRampDays`.
    /// The lift stays after the product leaves print, so the price does not jump down then.
    static func msrpLift(slugs: Set<String>, id: String, slug: String, day: Int) -> Double {
        guard let step = msrpStepDay, day >= step else { return 1 }
        let inPrint = slugs.allSatisfy { inPrint($0, day: step) } || productReprinted(id, slug: slug, day: step)
        guard inPrint else { return 1 }
        return 1 + Balance.msrpStep * Balance.msrpMarketShare * min(1, Double(day - step) / Balance.msrpRampDays)
    }
}
```

`sealedFactor` multiplies by `msrpLift` (section 2.2).

**Uses of MSRP as a price.** Replace `p.msrp` with `p.retailMSRP(...)` where it is a price:

| File and line | Now | After |
|---|---|---|
| `M/LocalStores.swift` L119 | big-store price | removed with the old big-store branch. `Market.batch` uses `retailMSRP(day: vendorDay)`. |
| `M/Camping.swift` L98 | camp price | `p.retailMSRP() ?? p.market` |
| `M/Market.swift` L121-122 | Pokemon Center price | `if let p = ..., let msrp = p.retailMSRP(day: day)`. `offers(for:day:)` has the day. |
| `M/Wholesale.swift` L78 | wholesale unit base | `(p.retailMSRP() ?? p.market) * wholesaleDiscountNow` (Part B owns the file) |
| `Buy/WholesaleViews.swift` L41 | display | `offer.product.retailMSRP() ?? 0` |
| `M/WholesaleAccount.swift` L38-41 | hot ratio | `product.isHot()` |

Leave `msrp != nil` checks (presence only) and the `Counterfeit.roll(msrp:)` arguments as they are.

**End Day.** File: `M/Flippers.swift`, inside `flippersEndDay()`:

```swift
    private func msrpEndDay(day: Int) -> [String] {
        if let step = data.retail.msrpStepDay {
            return step == day ? ["Market news: The 12.5% MSRP rise is in effect. Stores charge more for in-print sealed from today."] : []
        }
        guard day >= Balance.msrpStepEarliestDay, Double.random(in: 0..<1) < Balance.msrpStepChance else { return [] }
        data.retail.msrpStepDay = day + Balance.msrpStepNotice
        return ["Market news: The Pokemon Company raises the price of in-print sealed product by 12.5% in \(Balance.msrpStepNotice) days. Stock you buy before then costs less."]
    }
```

At most once per run: the function never sets the day again. `flippersEndDay` ends with `syncMarket()`.

**UI.** `FlipperMarketBox` shows "MSRP rises 12.5% in N days" while the step is ahead, and "MSRP rose 12.5% on <date>" after it.

**Tests.** T9.

**Interactions.** After the step, the hot ratio uses the higher MSRP while the market rises only 7.5%. A few products stop being hot. The step happens in about 56% of one-year runs (sim section 4.8). Real graded prices never change.

### 3.5 Stronger post-holiday sell-off

**Model.** `data.retail.winterScales`, synced into `PriceCycle.winterScales` (section 3.4).

File: `M/Seasons.swift`, `seasonSealedPrice(day:)` (L71-74):

```swift
    static func seasonSealedPrice(day: Int? = nil) -> Double {
        let d = day ?? today
        let w = weekOfYear(day: d)
        let winter = Balance.seasonWinterSealedPrice.value(week: w) * (winterScales[winterKey(day: d, week: w)] ?? 1)
        return 1 + winter + Balance.seasonHolidaySealedPrice.value(week: w)
    }

    /// The year of the winter dip's center. The dip starts in late December, so a late week counts for the next year.
    static func winterKey(day: Int, week: Double) -> Int {
        GameCalendar.date(day).year + (week > Balance.weeksPerYear / 2 ? 1 : 0)
    }
```

**Lock.** File: `M/Flippers.swift`, the first step of `flippersEndDay()`:

```swift
    /// Locks the size of the winter dip. On its first day: ×1.5 (−15%) at pressure 0.6 or more, else ×1. On any later
    /// day of a dip with no lock (a run that starts inside the dip, or an old save): ×1, the old rule, so no price
    /// jumps (S-A11).
    private func lockWinterScale(day: Int, pressure: Double) -> [String] {
        let bump = Balance.seasonWinterSealedPrice
        let w = PriceCycle.weekOfYear(day: day)
        guard bump.value(week: w) != 0 else { return [] }
        let key = PriceCycle.winterKey(day: day, week: w)
        guard data.retail.winterScales[key] == nil else { return [] }
        let firstDay = bump.value(week: PriceCycle.weekOfYear(day: day - 1)) == 0
        let deep = firstDay && pressure >= Balance.winterSellOffPressure
        data.retail.winterScales[key] = deep ? Balance.winterSellOffScale : 1
        return deep ? ["Market news: Flippers sit on too much holiday stock. The after-holiday sealed dip is deeper this year."] : []
    }
```

A scale other than 1 is set only on the first day of the dip, when the bump was 0 on the day before. No price jumps. A run starts on January 1, inside the dip. Its first End Day locks that winter at 1, so the sim's "first winter never locks" gap closes with no change to the old rule.

**Tests.** No separate check. T10's 14-day run starts on January 1, so it locks the first winter. The existing seasons test (`seasonsAndSave`, GameTests L612) checks that the season factors stay in range.

---

## 4. Tuning constants

Every constant lives in an `extension Balance` in the named file, as the code does today (for example `M/Camping.swift` L22-33). D-13 values are marked.

| Constant | Value | File | Proposal |
|---|---|---|---|
| `vendorWeekdays` | `1...5` (Tuesday to Saturday) (D-13) | Retail.swift | 1.1 |
| `vendorHours` | `[8.0, 10.0, 13.0, 16.0]` (D-13) | Retail.swift | 1.1 |
| `storeOpen`, `storeClose` | 8.0, 22.0 | Retail.swift | 1.1 |
| `batchSize` (per store) | Walmart 30, Target 24, Best Buy 12, GameStop 10, Barnes & Noble 6 | Retail.swift (`LocalStore.batchSize`) | 1.1 |
| `batchProducts` (per store) | Walmart 4...6, Target 3...5, Best Buy, GameStop, club 2...4, B&N 1...3 | Retail.swift | 1.1 |
| `batchMinUnits` | 2 | Retail.swift | 1.1 |
| `bigStoreKinds` | Booster pack, Blister, Tin, Booster bundle, Elite Trainer Box, Collection | Retail.swift | 1.1 |
| `hotDrainBase` | 0.2 per hour (D-13) | Retail.swift | 1.1 |
| `hotDrainPressure` | 0.6 per hour × pressure (D-13) | Retail.swift | 1.1 |
| `coldDrainRate` | 0.05 per hour | Retail.swift | 1.1 |
| `vendorWaitMax` | 2.0 hours | Retail.swift | 1.2 (A-S2) |
| `baseLimit` (per store) | Walmart 5 a visit; Target, GameStop, Best Buy 2 per item a day (1 hot); B&N 2 a visit (1 hot); club 2 per item a day (1 hot) | Retail.swift (`LocalStore.baseLimit`) | 1.2 |
| `incidentChance` | 0.05 × pressure per vendor day (D-13) | Retail.swift | 1.3 |
| `incidentBoostPerBuyout` | +0.03 | Retail.swift | 1.3 (A-S4) |
| `incidentBoostKeep` | 0.9 a day | Retail.swift | 1.3 (A-S4) |
| `strictnessDecayDays` | 90 (D-13) | Retail.swift | 1.3 |
| `closureDays` | 21 | Retail.swift | 1.3 |
| `drawingWinChance` | 0.08 | RetailOnline.swift | 1.4 |
| `drawingWeekday` | 2 (Wednesday) | RetailOnline.swift | 1.4 |
| `drawingClaimDays` | 2 (D-11) | RetailOnline.swift | 1.4 |
| `drawingDeliveryDays` | 4 | RetailOnline.swift | 1.4 |
| `dropCancelChance` | 0.05 | RetailOnline.swift | 1.5 |
| `dropCancelBotChance` | 0.35 | RetailOnline.swift | 1.5, 2.6 |
| `dropCancelWindowMax` | 3 days (and at most delivery days − 1) | RetailOnline.swift | 1.5 |
| `gameStopHotMarkup` | `1.35...1.6` | Retail.swift | 1.6 |
| `clubFee` | 65 a year | Retail.swift | 1.7 |
| `clubDays` | 364 | Retail.swift | 1.7 |
| `clubWarnDays` | 7 | Retail.swift | 1.7 |
| `clubBatchSize` | 12 | Retail.swift | 1.7 |
| `clubPricePerPack` | 3.75 | Retail.swift | 1.7 |
| `clubHotPerDay` | 1 | Retail.swift | 1.7 |
| `alertFeeOneChain` | 8 a month | RetailOnline.swift | 1.8 |
| `alertFeeAllChains` | 25 a month | RetailOnline.swift | 1.8 |
| `alertProrateDays` | 7 | RetailOnline.swift | 1.8 |
| `pressureStart` | 0.5 | Flippers.swift | 2.1 |
| `pressureRange` | `0.1...0.9` | Flippers.swift | 2.1 |
| `pressureHypeNews` | +0.15 once | Flippers.swift | 2.1 |
| `pressureBoomDaily` | +0.002 | Flippers.swift | 2.1 |
| `pressureHoliday` | +0.10 once | Flippers.swift | 2.1 |
| `pressureReprint` | −0.25 once | Flippers.swift | 2.1 |
| `pressureCorrectionDaily` | −0.003 | Flippers.swift | 2.1 |
| `pressurePostHoliday` | −0.10 once | Flippers.swift | 2.1 |
| `pressurePull` | 0.01 a day toward 0.5 (design value; it stops a drift to a bound) | Flippers.swift | 2.1 |
| `pressureLogDays` | 8 | Flippers.swift | 1.1, 2.1 |
| `pressureNewsStep` | 0.1 | Flippers.swift | 2.1 |
| `campPressureBase`, `campPressureSlope` | 1.2, 0.6 | Flippers.swift | 2.1 |
| `flipperSaleCut` | 0.20 at pressure 0.9 | Flippers.swift | 2.1 |
| `dumpPressure` | 0.6 | Flippers.swift | 2.2 |
| `dumpDrop` | `0.10...0.20` | Flippers.swift | 2.2 |
| `dumpFallDays` | `14...28` | Flippers.swift | 2.2 |
| `dumpRecoveryDays` | 120 | Flippers.swift | 2.2 |
| `flipperDumpCap` | 0.45 | Flippers.swift | 2.2 |
| `dumpCorrectionSets` | 2 | Flippers.swift | 2.2 |
| `rivalFlippers`, `rivalCreators` | 3, 2 | Rivals.swift | 2.3 |
| `rivalMemoryKept` | 3 | Rivals.swift | 2.3 |
| `rivalBaseHostility` | `0.15...0.35` | Rivals.swift | 2.3 |
| `rivalHostilityPull` | 0.02 a day | Rivals.swift | 2.3 |
| `rivalTookShelfHostility` | +0.08 | Rivals.swift | 2.3 |
| `rivalBeatInLineHostility` | +0.05 | Rivals.swift | 2.3 |
| `rivalCreatorTierRise` | +0.10 | Rivals.swift | 2.3 |
| `rivalCampChance` | 0.5 | Rivals.swift | 2.3 |
| `rivalAisleHostility` | 0.5 | Rivals.swift | 1.2 (A-S2) |
| `rivalShowMinHostility` | 0.35 | Rivals.swift | 2.3 |
| `rivalShowBase`, `rivalShowSlope` | 0.25, 0.3 | Rivals.swift | 2.3 |
| `rivalUndercut` | 0.05 | Rivals.swift | 2.3 |
| `rivalReceiptChance` | 0.05 (D-13, D-10) | Rivals.swift | 2.3 |
| `rivalTableItems` | `3...5` | Rivals.swift | 2.3 (C-I3) |
| `rivalTablePrice` | 0.95 × market | Rivals.swift | 2.3 (C-I3) |
| `rivalBuyKeepDays` | 120 | Rivals.swift | 2.3 (C-I3) |
| `rivalReceiptGapDays`, `rivalCredFloor`, `rivalCredWeekly` | 30, 0.25, 0.05 | **Part C** `M/Callouts.swift` (read here) | 2.3 |
| `heatLimitBuy` | 1 (only on a `shelfBuyout`, D-1) | Flippers.swift | 2.4 |
| `heatRepeatVisit` | 2 | Flippers.swift | 2.4 |
| `heatBotUse` | 3 | Flippers.swift | 2.4, 2.6 |
| `heatKeep` | 0.95 a day | Flippers.swift | 2.4 |
| `heatHintLow`, `heatHintHigh` | 0.6, 0.85 of `storeBanHeat` (D-1) | Flippers.swift | 2.4 |
| `storeBanHeat` | 10 | Flippers.swift | 2.4 |
| `storeBanDays` | 21 (D-13) | Flippers.swift | 2.4 |
| `heatAfterBan` | 0.5 | Flippers.swift | 2.4 |
| `upgradeCosts[.checkoutBot]` | 400 | Upgrades.swift L198-207 | 2.6 |
| `pokemonCenterBotSuccess` | 0.60 | Upgrades.swift | 2.6 |
| `targetDropFridayChance` | 0.5 | RetailOnline.swift | 2.6 |
| `targetDropOtherChance` | 0.08 | RetailOnline.swift | 2.6 |
| `targetDropSuccess` | 0.20 | RetailOnline.swift | 2.6 |
| `targetAttempts`, `targetBotAttempts` | 1, 2 | RetailOnline.swift | 2.6 |
| `targetDeliveryDays` | 3 | RetailOnline.swift | 2.6 |
| `noInPrintSealedShare` | 1.0 / 6 | Shows.swift | 3.1 |
| `machineCycleDays` | 10 | Camping.swift | 3.2 |
| `machineNotice` | 2 | Camping.swift | 3.2 |
| `machineCampHours` | 2.0 | Camping.swift | 3.2 |
| `machineSuccess` | 0.7 | Camping.swift | 3.2 |
| `machineLimit` | 2 | Camping.swift | 3.2 |
| `machineProducts` | `1...3` | Camping.swift | 3.2 |
| `machineHours` | `10...16` | Camping.swift | 3.2 |
| `wholesaleMissingChance` | 0.01 | RetailOnline.swift | 3.3 |
| `missingShipmentRefundDays` | 14 (D-12) | RetailOnline.swift | 3.3 |
| `msrpStep` | 0.125 | Flippers.swift | 3.4 |
| `msrpStepChance` | 1.0 / 300 a day | Flippers.swift | 3.4 |
| `msrpStepEarliestDay` | 90 | Flippers.swift | 3.4 |
| `msrpStepNotice` | 28 days | Flippers.swift | 3.4 |
| `msrpMarketShare` | 0.6 | Flippers.swift | 3.4 |
| `msrpRampDays` | 30.0 | Flippers.swift | 3.4 |
| `winterSellOffPressure` | 0.6 | Flippers.swift | 3.5 |
| `winterSellOffScale` | 1.5 (−10% becomes −15%) | Flippers.swift | 3.5 |

Hidden-act weights are not constants of this file. They come from Part C's table (section 0.6).

Unchanged constants that this plan reads: `campSuccess` 0.6, `campQuantity` 2...6, `restockBotBonus` 0.25, `pokemonCenterSuccessChance` 0.30, `hotProductRatio` 1.2 (D-13 keeps it), `arrivalKeep` 0.75, `ebayFeeRate` 0.1325, `wholesaleDeliveryDays` 5.

---

## 5. Save compatibility summary

| New data | Old save | How |
|---|---|---|
| `flipperPressure`, `scalperHeat`, `rivals`, `retail` on `GameData` | missing keys | `v()` in `GameData.init(from:)` gives the defaults. `seedRivals()` fills the rivals on load and marks today's news as seen. |
| Fields inside `RetailState` | missing keys in a later build | `RetailState.init(from:)` (section 0.3). T11 checks the round trip of every field. |
| Fields inside `Rival` | missing keys in a later build | `Rival.init(from:)` (section 2.3) |
| `ChainStrictness.lastIncident`, `BatchBuy.emptied` | missing keys | Optional `var`s, read with `decodeIfPresent` |
| `MarketEvent.products`, `fallDays`; `Kind.flipperDump` | missing keys | Optional `var`s. An old build that reads a new save fails on the unknown kind, which is the normal one-way rule. |
| `CardShow.rivalID`, `noInPrintSealed` | missing keys | Optional `var`s, as `promoted` and `goodSpot` (L30-32) |
| `LocalStore.club` | not present | No saved value uses it until the player visits the club. |
| `ShelfItem`, `CampHaul`, `DrawingOffer`, `MachineRestock` | not saved | runtime only |
| `shelfBought` SKU keys | not present | New keys in the existing dictionary. End Day resets it. |

No migration code is necessary.

---

## 6. End Day order summary

See section 0.4 and integration section 2. In short: `printEndDay` → `marketEndDay` → **`flippersEndDay`** (winter lock, dump, pressure, strictness, heat, MSRP step, `syncMarket`) → resets → **`resetRetailDay`** → `decayStanding` → `advanceSealed` → **`retailOrdersEndDay`** (drawings, claims, cancellations, missing shipments, club warning) → ... → `calloutsEndDay` (Part C) → **`rivalsEndDay`** → ... → `businessCostsEndDay` → **`alertsEndDay`**.

---
## 7. Tests and tuning tools

### 7.1 Checks for `Hub/GameTests.swift`

Add one group `timed("retail", retail)` in `run()` (L17-46), before `timed("days", days)`. Each check moves money or items, or guards a rule that broke before. Only T4, T5, and T8 play one End Day each. The group adds well under 100 ms to the 2.8 s run.

```swift
    // MARK: - Big stores, limits, heat, and online orders (docs/proposals/sealed-product/part-a-stores-flippers.md)

    private func retail() {
        fresh()
        let pool = SetLibrary.catalog.filter { $0.isInPrint && $0.msrp != nil && !$0.isStoreExclusive && Balance.bigStoreKinds.contains($0.kind) }
        let hot = pool.filter { $0.isHot() }
        guard hot.count >= 2, let cold = pool.first(where: { !$0.isHot() }) else { return check(false, "the retail test has no hot or cold product") }
        ...
    }
```

| ID | Check | Why |
|---|---|---|
| T1 | Target: a hot test item `ShelfItem(id: "t1", product: hot[0], price: 1, quantity: 6, hot: true)`. The first `buyShelf` passes. The second fails. Walmart: after `arrive(at: .walmart, hour: 12)`, five buys of a cold item with `quantity: 8` pass and the sixth fails. After a second `arrive(at: .walmart, hour: 13)`, a buy passes, and `data.scalperHeat` rose by exactly `heatRepeatVisit`. Club: with no membership, a buy fails. After `joinClub()`, the cash fell by exactly `clubFee`, the first hot buy passes, and a second hot item fails the same day. | Limits move items and money. |
| T2 | Batch stability: read `Market.batch(.walmart, vendorDay: d, seed:)` for the next vendor day `d`. Append a `PrintChange` that takes the set of one batch product out of print from `d + 1`, `syncMarket()`, then read the same batch again. The product IDs are the same (A-B2). Then on day `d` buy one unit of a batch item at the vendor hour. The same item read on day `d + 1` has `shelfLeft` at most its drained quantity minus 1. A later hour on day `d` never shows more units than an earlier hour. | Items: a bought unit must never come back. |
| T3 | Ban (its own `fresh()`). First, D-1: set `storeHeat["Target"] = 9.5` and buy one hot Target test item. The heat stays 9.5 and no act is recorded. Then: set `storeHeat["Walmart"] = 9.5`, call `arrive(at: .walmart, hour: 12)`, and buy a hot test item with `quantity: 2` two times. The second buy empties it with 2 units in the visit, so it adds 1 heat and starts a ban. The next `buyShelf` at Walmart fails, and `campBlock(.walmart)` is not nil. | Money and items stop at a banned chain. A single hot buy stays free. |
| T4 | Cancellation: append a test `SealedItem` with status `.arriving(daysLeft: 3, from: "Target.com")`, and `DropOrder(chance: 1, refund: 50, rollDay: day + 2)`. Also call `addDropOrder(..., deliveryDays: 3)` 20 times on a scratch item and check that every `rollDay` is at most `day + 2` (A-M2). Play End Days until the roll day. The item is gone, and the ledger has exactly one entry with the label prefix "Order cancelled" and the amount 50. Do not compare the cash: other End Day lines move it. | Money moves. |
| T5 | Drawing: `resolveDrawing(entry, won: true)` takes no cash and adds one `DrawingWin`. `claimDrawingWin` with cash below the price returns false and takes nothing. With enough cash it takes exactly the price and adds one `.arriving` item. A second win, not claimed, is gone after `drawingClaimDays + 1` End Days, and no ledger entry has its product name (D-11). | Money and items move. Rent is safe. |
| T6 | Pressure: after the 14-day `days()` run, `data.flipperPressure` is inside `pressureRange`, and `pressureLog` has no key older than `pressureLogDays`. | Guards the clamp and the pruning. |
| T7 | `PriceCycle.capDump(jumps: 0.65, dump: 0.8)` is 0.55. `capDump(jumps: 1.2, dump: 0.9)` is 1.08. `capDump(jumps: 0.42, dump: 0.9)` is 0.42 (A-m14). | Guards the 45% cap. |
| T8 | Missing shipment: append `MissingShipment(name: "test", noticeDay: day, refundDay: day + 1, refund: 120)` directly. After one End Day, the ledger has exactly one "Missing shipment refund" entry of 120, and `missingShipments` is empty. Also: `registerMissingShipment(name:refund: 10, learnIn: 5)` sets `noticeDay = day + 5` and `refundDay = day + 19`. | Money moves once. |
| T9 | MSRP step: with no step, `hot[0].retailMSRP()` equals its raw `msrp` (A-m8). Set `data.retail.msrpStepDay = data.day` and `syncMarket()`. `retailMSRP()` equals `Market.retail(msrp × 1.125)`. Reset the step and `syncMarket()` after. | Retail prices move money. |
| T10 | Exclusivity: in `days()` (L658-722), before the 14-day loop, seed non-empty state: one `DrawingEntry` with `drawDay = day + 2`, one `DrawingWin` with `claimUntil = day + 1`, one `DropOrder` with `rollDay = day + 3`, one `MissingShipment` due in 4 days, one memory on each rival, one `rivalBuys` entry for a test sealed item with a known fake, `storeHeat["Walmart"] = 3`, `incidentBoost["Target"] = 0.02`, `bannedUntil["GameStop"] = day + 2`, and `strictness["Target"] = ChainStrictness(level: 1, lastChange: day - 89)`. On day 1, call `startStoreRun([.walmart])` and buy one batch item if the shelf has one. After the loop, check that the rival-table receipt fired once (Part C's receipt list has one more entry). | The exclusivity crash shows only with non-empty arrays (memory: project_exclusivity_and_soak). |
| T11 | Save round trip (A-m9): set non-default values in every `RetailState` field (one entry in each dictionary and array, `msrpStepDay`, `alertTier`, `alertStartDay`, `gougeDay`), add rival memory, and set `flipperPressure = 0.73`. Encode `store.data` with `JSONEncoder`, decode with `JSONDecoder`. Check `loaded.retail == store.data.retail`, `loaded.rivals == store.data.rivals`, and `loaded.flipperPressure == store.data.flipperPressure`. Put it in `seasonsAndSave` (L607), next to the existing round trip at L620-626. | A missed decoder line loads a default with no error. |
| T12 | Target.com gating: with no bot, the first `attemptTargetDrop` can run, and the second returns false with no cash change. With the bot owned, a second attempt without the bot returns false, and with the bot it can run. | Money moves. |
| T13 | Phase 7, after Part B's case item exists: a case item of an in-print product is banned at a show with `noInPrintSealed == true` (`bannedAtShow`), integration 1.6. | Items. |

### 7.2 The `-retailsim <days>` launch argument (D-16)

`-marketsim` sets the day and syncs the market. It never runs End Day, so none of the new hooks run in it (A-M5). `-retailsim` plays real End Days with every hook and a scripted player. Use it after phases 2, 4, and 6. `-marketsim` stays as it is.

**Launch.** `xcrun simctl launch --console-pty booted com.ajholloway.pokevendor -retailsim 365 flipper`. The second word picks the player: `honest` (the default) or `flipper`. It replaces the save, as `-test` does.

**Hook.** `Hub/HubView+Debug.swift`, in `runDemo()`, after the `-test` block (L9-12):

```swift
        // Balance aid: `-retailsim <days> [honest|flipper]` plays End Day with every hook and prints the retail state
        // each week (Hub/RetailSim.swift). It replaces the save.
        if let i = args.firstIndex(of: "-retailsim") {
            let days = i + 1 < args.count ? Int(args[i + 1]) ?? 365 : 365
            RetailSim(store: store, flipper: args.contains("flipper")).run(days: days)
            return
        }
```

**New file** `app/PokeVendor/Hub/RetailSim.swift` (Debug only). Run `xcodegen generate` after you add it.

```swift
import Foundation

#if DEBUG
/// The retail tuning run (D-16). Plays real End Days with a scripted player and prints one line a week.
@MainActor
final class RetailSim {
    private let store: GameStore
    private let flipper: Bool
    /// Columns that later phases add: Part B's hot fill rate (phase 4) and Part C's callouts (phase 6).
    var extraColumns: [(name: String, value: () -> String)] = []

    private struct Week {
        var shelfUnits = 0, campUnits = 0, onlineUnits = 0, dumps = 0, incidents = 0, bans = 0
        var fillOneHour: [Double] = [], fillAfterWork: [Double] = [], hotShare: [Double] = []
    }

    init(store: GameStore, flipper: Bool) {
        self.store = store
        self.flipper = flipper
    }

    func run(days: Int) {
        let start = Date()
        store.startRun()
        store.addTestCash(1_000_000)                     // rent never ends the run
        if flipper {
            store.data.jobIndex = nil
            for u in [Upgrade.restockBot, .checkoutBot] { store.data.upgrades.append(u.rawValue) }
            _ = store.joinClub()
            store.subscribeAlerts(.allChains, store: nil)
        }
        print("RETAILSIM day p strict heat(g/max) bans units(shelf/camp/online) fill(1h/17h) hot dumps incidents "
              + extraColumns.map(\.name).joined(separator: " "))
        var week = Week(), total = Week()
        for _ in 0..<days {
            measureBatches(&week)
            if flipper { playFlipper(&week) } else { playHonest(&week) }
            store.report = nil
            if store.data.lateHours > 0 { store.chooseMorning(sleepIn: false) }
            store.endDay()
            let lines = store.report?.lines ?? []
            week.dumps += lines.filter { $0.contains("dumping") }.count
            week.incidents += lines.filter { $0.contains("tightens its card limits") }.count
            week.bans += lines.filter { $0.contains("refuse to sell you cards") }.count
            if store.day % 7 == 0 { printWeek(week); add(week, to: &total); week = Week() }
        }
        let years = Double(days) / 364
        print(String(format: "RETAILSIM END days=%d shelf/wk=%.2f camp/wk=%.2f online/wk=%.2f bans/yr=%.2f incidents/yr=%.1f dumps/yr=%.1f ms=%d",
                     days, Double(total.shelfUnits) / Double(days) * 7, Double(total.campUnits) / Double(days) * 7,
                     Double(total.onlineUnits) / Double(days) * 7, Double(total.bans) / years,
                     Double(total.incidents) / years, Double(total.dumps) / years, Int(Date().timeIntervalSince(start) * 1000)))
        fflush(stdout)
    }

    /// On each chain's vendor day: the share of hot units left 1 hour after the vendor, and at 17:00.
    private func measureBatches(_ w: inout Week) {
        for s in LocalStore.allCases where !s.isGameShop {
            let slot = store.vendorSlot(s)
            guard store.day % 7 == slot.weekday else { continue }
            func share(_ hour: Double) -> Double? {
                let hot = store.shelf(at: s, hour: hour).filter(\.hot)
                let all = hot.reduce(0) { $0 + $1.batchQuantity }
                return all > 0 ? Double(hot.reduce(0) { $0 + $1.quantity }) / Double(all) : nil
            }
            if let a = share(slot.hour + 1) { w.fillOneHour.append(a) }
            if slot.hour < 17, let b = share(17) { w.fillAfterWork.append(b) }
            let batch = Market.batch(s, vendorDay: store.day, seed: store.data.marketSeed)
            if !batch.isEmpty { w.hotShare.append(Double(batch.filter(\.hot).count) / Double(batch.count)) }
        }
    }

    /// Honest: a store run to two chains after work on weekdays and three on Saturday, one unit of each hot item.
    /// Enters the Walmart drawing, claims wins, tries each Pokemon Center drop without a bot, camps 1 restock in 4.
    private func playHonest(_ w: inout Week) {
        let chains = LocalStore.allCases.filter(\.isBigStore)
        let count = store.weekday == 5 ? 3 : store.weekday < 5 ? 2 : 0
        let stops = (0..<count).map { chains[(store.day + $0) % chains.count] }
        // After work on a weekday, mid-morning on Saturday.
        store.data.hour = max(store.data.hour, store.weekday == 5 ? 10 : 17)
        if !stops.isEmpty { w.shelfUnits += runStops(stops, perItem: 1) }
        onlineCommon(&w, bot: false)
        if store.weekday == 5, store.day % 28 < 7 { w.campUnits += campAll() }
    }

    /// Flipper: each vendor stop at its vendor hour, every unit the limit allows, a repeat visit 1 hour later at
    /// Walmart and Barnes & Noble, the bot on every online drop, and every posted camp.
    private func playFlipper(_ w: inout Week) {
        let due = LocalStore.allCases.filter { !$0.isGameShop && store.vendorSlot($0).weekday == store.weekday }
            .sorted { store.vendorSlot($0).hour < store.vendorSlot($1).hour }
        for s in due {
            store.data.hour = max(store.data.hour, store.vendorSlot(s).hour)
            w.shelfUnits += runStops([s], perItem: 99)
            if s == .walmart || s == .barnes {
                store.data.hour += 1
                w.shelfUnits += runStops([s], perItem: 99)
            }
        }
        onlineCommon(&w, bot: true)
        w.campUnits += campAll()
    }

    /// One store run through the real API. Returns the units bought.
    private func runStops(_ stops: [LocalStore], perItem: Int) -> Int {
        guard let start = store.startStoreRun(stops) else { return 0 }
        var bought = 0
        for (k, s) in stops.enumerated() {
            let arrival = start + Double(k) * store.storeStopHours
            if k > 0 { store.arrive(at: s, hour: arrival) }
            for item in store.shelf(at: s, hour: arrival) where item.hot || !flipper {
                var n = 0
                while n < perItem, store.limitLeft(item, at: s) > 0, store.shelfLeft(item) > 0,
                      store.buyShelf(item, at: s, credit: false) { n += 1 }
                bought += n
            }
        }
        return bought
    }

    private func onlineCommon(_ w: inout Week, bot: Bool) {
        if let offer = store.walmartDrawing { store.enterDrawing(offer) }
        for win in store.data.retail.drawingWins where store.claimDrawingWin(win.id) { w.onlineUnits += 1 }
        if store.isPokemonCenterDropLive, let o = Market.offers(for: .pokemonCenter, day: store.day).first,
           store.attemptDrop(o, bot: bot) { w.onlineUnits += 1 }
        if let o = store.targetDrop(day: store.day) {
            while store.targetAttemptsLeft > 0, !store.data.boughtToday.contains(o.id) {
                if store.attemptTargetDrop(o, bot: bot) { w.onlineUnits += 1 } else if !bot { break }
            }
        }
    }

    private func campAll() -> Int {
        var n = 0
        for r in store.restocksNow where store.campBlock(r.store) == nil {
            guard let haul = store.camp(r.store) else { continue }
            for item in haul.items { while store.buyShelf(item, at: r.store, credit: false) { n += 1 } }
        }
        return n
    }

    private func printWeek(_ w: Week) {
        func mean(_ a: [Double]) -> String { a.isEmpty ? "-" : String(format: "%.2f", a.reduce(0, +) / Double(a.count)) }
        let strict = LocalStore.allCases.filter { !$0.isGameShop }.map { "\(store.strictness($0).level)" }.joined()
        let maxHeat = store.data.retail.storeHeat.values.max() ?? 0
        print(String(format: "RETAILSIM %d %.2f %@ %.1f/%.1f %d %d/%d/%d %@/%@ %@ %d %d ",
                     store.day, store.data.flipperPressure, strict, store.data.scalperHeat, maxHeat, w.bans,
                     w.shelfUnits, w.campUnits, w.onlineUnits, mean(w.fillOneHour), mean(w.fillAfterWork), mean(w.hotShare),
                     w.dumps, w.incidents) + extraColumns.map { $0.value() }.joined(separator: " "))
    }

    private func add(_ w: Week, to t: inout Week) {
        t.shelfUnits += w.shelfUnits; t.campUnits += w.campUnits; t.onlineUnits += w.onlineUnits
        t.dumps += w.dumps; t.incidents += w.incidents; t.bans += w.bans
    }
}
#endif
```

The `while ... buyShelf` loop in `campAll` ends because `buyShelf` returns false at the limit or an empty haul item. `startStoreRun` calls `arrive` for the first stop, and the loop calls it for the later stops, as the "Next stop" button does. The run uses only the public API, so it tests the real code paths. A 365-day run plays 365 full End Days. Expect a few seconds. It is a tuning tool, not part of `-test`.

**Columns that later phases add.** Phase 4 (Part B) appends `("fill", { mean of store.hotFillRate(p) over the hot products of store.wholesaleOffers })`. Phase 6 (Part C) appends `("callouts", { "\(store.data.callouts.open.count)" })`. Each phase adds its line in `RetailSim.init`.

**Targets.** Compare one 365-day run of each player with the sim's tuned results (sim section 7). A large gap means a value or a rule differs from the plan.

| Metric | Honest | Flipper |
|---|---|---|
| Shelf hot units a week | about 0.75 (0 to 1.9) | about 14.7 with camps and online |
| Store bans a year | 0.12 or fewer | about 26 (21 days each) |
| Strictness level 1+ days a year, each chain | about 94 | same market |
| Strictness level 3+ days a year, each chain | about 5 | same market |
| Hot share of the batch pool | about 0.94 | same |

---

## 8. Doc updates

| Doc | Change |
|---|---|
| `docs/12-acquiring-product.md` | "Pokemon Center drops" (L52): the cancellation roll (5%, 35% with the bot), the bot attempt (60%). A new subsection after it, "Big-store sites": the Walmart Collectibles Draw (weekly, 8%, a win waits 2 days for the player to pay and claim it) and the Target.com drop (mostly Friday, 20%, 1 attempt or 2 with the bot). "Camp a store drop" (L70): the chain cap, the pressure factor, the rival lines, the official card machines (2 hours, limit 2). "Local stores" (L88): vendor days (Tuesday to Saturday at 8, 10, 13, or 16), learning the vendor day by seeing a fresh batch, waiting for the vendor, batch sizes, the drain formula, the limit table, the strictness ladder (state that the report's "per payment card" limit is level 2, one checkout a day), heat hints and the ban, the GameStop markup, the club store. Fix L83-86: "other buyers get the stock first" is now modeled. "Open topics" (L343): remove "the stock odds per store" and "Exact restock-alert-bot design". |
| `docs/05-pricing-and-market.md` | "Market news" (L169): the flipper dump, the MSRP step. A new subsection "Flipper pressure" after it: the inputs and the four effects. "Print runs" (L182): a reprint wave lowers the pressure and can start a dump; the 45% cap. "Seasons" (L225): the deeper winter dip at pressure 0.6 or more, set on the first day of the dip. |
| `docs/09-upgrades.md` | "Buying" (L79): the checkout bot. "On other screens" (L138): restock alerts (monthly, not an upgrade). "Selling and shows" (L50): the EV readout adds the eBay flip line. |
| `docs/17-calendar-and-events.md` | "Posted entries" (L76): machine restocks; alert vendor days. "Surprise entries" (L160): the Target.com drop and drawing results. "A typical week" (L180): vendor days Tuesday to Saturday, two slots after work. |
| `docs/20-card-shows.md` | "Shows on the calendar" (L12): 1 show in 6 bans in-print sealed, and sellers bring none there. "Visitors at the table" (L57): a rival at a nearby table holds buyers to 95% of the ask on in-print sealed. "The floor" (L132): the rival's own table, with resealed stock at the plug rate. |
| `docs/19-prototype-values.md` | "Buying" (L19), "Store run and game shops" (L60), "Meets, sales, camping, and opportunities" (L314), "Wholesale, splits ..." (L356), "Upgrades" (L366), "The moving market" (L560), "Seasons" (L572): the values from section 4. |
| `docs/02-playstyles.md` | Flipper archetype risk (L17-45): "other flippers undercutting your prices" points to rivals at shows and the online sale factor. |
| `docs/24-theft-and-insurance.md` | No change from Part A. |
| `docs/26-taxes.md` | The club fee and the alert fee are business costs. Refunds of cancelled orders and missing shipments net the cost. |
| `docs/34-flippers-and-retail-limits.md` (new, integration section 5) | One page: vendor days, limits (with the payment-card note), strictness, heat and its hints, bans, rivals, pressure, dump, drawings, and the `-retailsim` tool. |
| `docs/00-overview.md` | Add doc 34 to the index. |

Write all doc text in STE.

---

## 9. Interactions and risks

**The hot share.** 93.9% of the batch pool is hot (sim section 4.8), because the catalog prices in-print sealed at a median 2.5 to 3.7 times MSRP. D-13 keeps `hotProductRatio` at 1.2. So nearly every shelf item has limit 1 at most chains and drains fast. D-1 makes that safe for honest play: a single hot buy adds no heat and records no act.

**Camping.** Camping keeps its posted restock every 14 days, separate from the hidden weekly vendor day. A camp is a visit, so a store run to the same chain later that day is a repeat visit. The camp haul obeys the chain cap, the level-3 drawing rule, and the ban. The planner says "vendor stock" and the hub says "restock". Keep the words apart.

**Store run.** The run block is spent at the start. Each stop's arrival comes from the start hour, plus any wait. `arrive(at:hour:)` runs once for each stop, from the run start or the "Next stop" button.

**PriceCycle and booms.** A boom raises the pressure by 0.002 a day, held back by the pull. A correction start can start a dump. A long boom keeps the pressure near 0.8, so camping drops to about 0.72 of today's odds.

**Reprints.** A reprint that reaches shelves lowers the pressure by 0.25 and can start a dump. Reprinted products enter the batches from their next vendor day. The 45% cap holds the reprint and the dump together.

**Calendar.** Alert vendor days and machine restocks use the existing `.restock` entry kind.

**Demand.** `flipperSaleFactor` multiplies the existing demand for hot in-print sealed on eBay and TCGplayer only. On average it cuts the sale chance by about 9% (sim section 4.2).

**Relationships and reputation.** Rivals are not contacts and use no contact book room. Part A changes no reputation directly. Bans, bot use, and heat reach reputation only through Part C's callouts.

**Challenge cash.** Every new cost and income goes through `addLedger`, the one cash balance. No second wallet and no buy toggle.

**Taxes.** Club and alert fees are `.businessCosts`. Refunds are positive entries in the cost's own category.

**Performance.** `shelf(at:hour:)` filters the catalog once a call, as `Market.shelf` does today, with `inPrint(on:)` in place of `isInPrint`. `drainShare` loops over at most 8 days. `msrpLift` returns at once before the step.

**Economy.** With the D-13 values the sim gives: the honest player about 1.3 hot units a week from all sources, the aggressive flipper about 14.7 hot units a week and about $32,700 a year (an upper bound with no demand limit), and the flipper about 26 bans a year. Most of the flipper's income comes from the catalog prices, not from these rules. Check the numbers with `-retailsim` after phase 2.

**Rejected features.** No slab cracking, no Japanese product, no preorders, no new set releases (every drawing, drop, batch, machine, and rival table sells existing in-print catalog products), no group breaks. Real graded prices never change.

**No flashes.** No new view uses a full-screen white or bright flash. Results show as `Banner` views in the existing theme colors.

---

## 10. Contracts

### What Part A provides

| Item | Type | Notes |
|---|---|---|
| `data.flipperPressure` | `Double`, 0.1 to 0.9 | Start 0.5. Changes once a day in `flippersEndDay`. |
| `data.scalperHeat` | `Double`, 0 up | Global. Decays 5% a day. Per-chain heat is `data.retail.storeHeat`. 10 at one chain bans the player there for 21 days. |
| `data.rivals` | `[Rival]` | `id`, `name`, `handle`, `kind` (`.flipper`, `.creator`), `hostility` 0 to 1, `baseHostility`, `credibility` (`rivalCredFloor` to 1), `memory` (last 3, `byPlayer`), `grudges`, `homeStores`, `lastSeenDay`. |
| `rival(_:)`, `rivalAt(_:)`, `rememberRival(_:_:note:byPlayer:hostility:)`, `adjustRivalHostility(_:_:note:kind:)`, `changeRivalCredibility(_:by:)`, `seedRivals()` | phase 0, full bodies (D-9) | Part C changes rivals only through these. `rivalsEndDay` regains named-rival credibility once a week. |
| `Product.isHot(day:)`, `Product.retailMSRP(day:)`, `Product.inPrint(on:)`, `Product.marketPrice(day:)` | nonisolated | The only hot test and retail price (integration 1.4). |
| `Market.retail(_:)` | now `nonisolated` | Callable from any context. |
| `registerMissingShipment(name:refund:learnIn:)`, `Balance.wholesaleMissingChance`, `Balance.missingShipmentRefundDays` | function and constants (D-12) | For Part B's order code. |
| `RetailState.gougeDay`, `RetailState.ripHereWeek` | fields with decoder lines | For integration 1.2 and 4.1. |

### What Part C must provide (phase 0 stubs, D-9)

1. `HiddenActKind` with the 14 cases, including `shelfBuyout`, `limitEvasion`, `botCheckout`, `storeBan`, `botOrderCancelled`.
2. `recordHiddenAct(_:weight:note:witnesses:...)` with `@discardableResult`. Part A passes the section 0.6 weights and witnesses.
3. `RivalKey` (D-8), and the constants `rivalCredFloor`, `rivalCredWeekly`, `rivalReceiptGapDays`. Part A reads them and does not define them.
4. `noteRivalReceipt(_ id: UUID, note: String)`, which keeps the 30-day gap. **Check:** the coordinator's note names `noteRivalReceipt(_ key: RivalKey, note:)`, but the revised Part C file (section 7.1) takes a `UUID`. Part A follows the Part C file. If Part C moves to `RivalKey`, the two Part A call sites (`noteShelfReceipt`, `rivalTableReceipts`) pass `.rival(id)`.
5. Part C regains only game-shop credibility. Part A regains named rivals.

### What Part B must provide

1. In its phase 4 order code: roll `Balance.wholesaleMissingChance` once for each order after the charge, and on a hit call `registerMissingShipment(name:refund:learnIn:)` with the order's delivery days in place of the delivery.
2. Use `product.retailMSRP()` for the wholesale unit price, the plug price, and the case factor fallback, and `product.isHot()` for the hot test.
3. `FakeSource.plug` and `fakeRatePlug` (0.055, D-13) by phase 4. The rival's show table uses them.
4. A case item keeps the `productID` of its unit product (integration 1.6), so `bannedAtShow` works.

### What the integration file must change

| Integration item | Change |
|---|---|
| 1.3, last line: "30% chance" | 0.05 (`rivalReceiptChance`, D-10, D-13), from the model at the visit start. |
| 1.5, step 2: `dueIn: Balance.missingRefundDays` | `learnIn: <delivery days of the order>` (D-12). The refund delay is `missingShipmentRefundDays` inside the function. |
| 4.1: `StandingLevel(points:) >= .regular` | `standing.points >= 30` (D-15). `StandingLevel` is not `Comparable`. |
| 4.2: `isInStore($0.status)` | `Self.isInStore($0.status)`. It is `static` (`M/CardStore.swift` L324). |
| 7, phases 2 and 6: "run `-marketsim`" | Run `-retailsim` (section 7.2), also after phase 4 (D-16). |
| 7, phase 7: "the MSRP step; the winter scale" | Phase 1 (the read side) and phase 2 (the End Day side). `flippersEndDay` calls both. |

---

## 11. Build phases for Part A

| Phase | Part A work |
|---|---|
| 0 | `RetailState` (all fields, tolerant decoder), the four `GameData` fields, `Rival`, `RivalMemory`, `rival`, `rivalAt`, `rememberRival`, `adjustRivalHostility`, `changeRivalCredibility`, `seedRivals()` (called in `init` and `startRun`), and `noteShelfReceipt`. Needs Part C's stubs for `RivalKey`, the credibility constants, and `noteRivalReceipt`. |
| 1 | `Market.retail` nonisolated; `Product.inPrint(on:)`, `marketPrice(day:)`, `retailMSRP(day:)`, `isHot(day:)`; the `GameStore.isHot` wrapper; `PriceCycle.msrpStepDay`, `winterScales`, their `sync` parameters, `msrpFactor`, and `msrpLift` (inert until a step is set). `retailMSRP` needs `msrpFactor`. |
| 2 | Vendor slots, batches, drain, `shelf(at:hour:)` (1.1); limits, `arrive`, rival lines, `notePurchase`, camp cap (1.2); pressure (2.1); dump (2.2); heat, hints, bans (2.4); strictness (1.3); GameStop markup (1.6); club (1.7); the MSRP step announcement (3.4) and the winter scale (3.5), because `flippersEndDay` calls both; `RetailSim` and the `-retailsim` argument. Run `-test`, then `-retailsim 365` for each player. |
| 3 | Drawings and claims (1.4); cancellations (1.5); checkout bot and Target.com (2.6); alerts (1.8); "Wait for the vendor" (1.2), because `vendorWaitGap` reads `alertedStores`; flip-margin line (2.5). |
| 4 | Missing shipments (3.3), with Part B's order code. Part B adds the `fill` column to `RetailSim`. Run `-retailsim`. |
| 6 | `rivalsEndDay`, the camp and show rivals, the rival table (C-I3), `RivalsBox`. Part C adds the `callouts` column. Run `-retailsim`. |
| 7 | Show ban (3.1), official machines (3.2). T13. |
| 8 | Doc updates (section 8). |
