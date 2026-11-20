# Part A code proposal: big-box stores, flippers, and the smaller retail mechanics

Scope: report sections "Big-box stores get full allotments and ration them at 1 to 5 items" (1.1 to 1.8), "Flippers compete for the same shelf and lose money on reprints" (2.1 to 2.6), and the recommended rows of "More mechanics that the notes support" (shows that ban in-print sealed, official card machines, missing distributor shipments, the MSRP step, the stronger post-holiday sell-off).

Source of truth: the code at commit `503ff3c`. I read every file named below. Line numbers are from that commit. `M` = `app/PokeVendor/Model`.

Corrections to `current_game_systems.md` that this plan depends on:

- The game already has platform fees on sealed sales: `Balance.ebayFeeRate = 0.1325` and `Balance.tcgFeeRate = 0.1075` ([M/Balance.swift L77-80](../../app/PokeVendor/Model/Balance.swift)). Proposal 2.5 therefore adds no new fee. It reads the existing fees through `GameStore.saleCosts` ([M/Upgrades.swift L234-239](../../app/PokeVendor/Model/Upgrades.swift)).
- The game has no Target.com storefront. Proposal 2.6 names "two Target.com attempts". This plan adds a small Target.com drop to make that rule possible (section 2.6). See "Questions and decisions" at the end.
- Synthesized `Decodable` in Swift does not use default values. A missing key throws. `GameData.init(from:)` ([M/GameStore.swift L144-235](../../app/PokeVendor/Model/GameStore.swift)) catches the throw and uses the default for the whole field. So a new field inside an old nested struct resets the whole struct. Every new nested struct in this plan gets its own tolerant decoder.

---

## 0. Shared foundation

### 0.1 New source files

Create these files. Then run `xcodegen generate` in `app/`. The project file diff stays small.

| File | Holds |
|---|---|
| `M/Retail.swift` | `RetailState`, `PurchaseLimit`, `LimitRule`, `ChainStrictness`, `BatchBuy`; vendor days, batches, drain, limits, visits, strictness, the club store, the GameStop markup; `Product.retailMSRP(day:)`, `Product.isHot(day:)` |
| `M/RetailOnline.swift` | `DrawingEntry`, `DropOrder`, `AlertTier`, `MissingShipment`; drawings, Target.com drops, Pokemon Center cancellations, restock alerts, missing shipments; `retailOrdersEndDay()`, `alertsEndDay()` |
| `M/Flippers.swift` | Flipper pressure, the flipper dump, scalper heat, the online sale factor, the flip margin, the MSRP step, the winter scale; `flippersEndDay()` |
| `M/Rivals.swift` | `Rival`, `RivalMemory`; seeding, the API for Part C, rival lines, `rivalsEndDay()` |
| `app/PokeVendor/Buy/ChainSitesView.swift` | `ChainSitesView`: the Walmart drawing, chain drawings, the Target.com drop |
| `app/PokeVendor/Hub/FlipperViews.swift` | `FlipperMarketBox`, `RivalsBox`, `RestockAlertsBox` |

Edited files: `GameStore.swift`, `LocalStores.swift`, `Camping.swift`, `Market.swift`, `PriceCycle.swift`, `Seasons.swift`, `Upgrades.swift`, `WholesaleAccount.swift`, `Wholesale.swift`, `Shows.swift`, `App/AppNav.swift`, `Buy/StoreRunViews.swift`, `Buy/BuyViews.swift`, `Hub/OpportunityView.swift`, `Hub/HubView.swift`, `Hub/HubView+Debug.swift`, `Hub/GoalsMarketViews.swift`, `Hub/UpgradesView.swift`, `Inventory/DetailViews.swift`, `Hub/GameTests.swift`.

### 0.2 New fields on `GameData` (contract fields for Parts B and C)

File: `M/GameStore.swift`. Add after `var shorts = ShortsState()` (L140):

```swift
    /// Flipper pressure: how hard flippers compete for in-print sealed, 0.1 to 0.9 (Model/Flippers.swift).
    /// Parts B and C read it.
    var flipperPressure = Balance.pressureStart
    /// The player's hidden scalper heat over all chains and bots (Model/Flippers.swift). Parts B and C read it.
    /// 10 at one chain gets the player refused at that chain. The total has no cap.
    var scalperHeat = 0.0
    /// Named rival flippers and rival creators (Model/Rivals.swift). Part C reads them.
    var rivals: [Rival] = []
    /// Limits, vendor batches, strictness, drawings, online orders, alerts, and the MSRP step (Model/Retail.swift).
    var retail = RetailState()
```

Add to the decoder after `shorts = v(.shorts, shorts)` (L233):

```swift
        flipperPressure = v(.flipperPressure, flipperPressure)
        scalperHeat = v(.scalperHeat, scalperHeat)
        rivals = v(.rivals, rivals)
        retail = v(.retail, retail)
```

Save compatibility: an old save has none of the four keys. `v()` gives the defaults: pressure 0.5, heat 0, no rivals, an empty `RetailState`. `seedRivals()` (section 2.3) fills `rivals` on the first load.

### 0.3 `RetailState` and its tolerant decoder

File: `M/Retail.swift`.

```swift
import Foundation

/// The strictness of one chain (proposal 1.3). Level 0 is the base limit, level 4 stops in-store card sales.
struct ChainStrictness: Codable, Hashable {
    var level = 0
    /// The day the level last changed. A level falls by one after `Balance.strictnessDecayDays`.
    var lastChange = 0
    /// Level 4: the last day of the stop.
    var closedUntil: Int? = nil
}

/// The units the player bought from one vendor batch item. The batch stock carries over to later days.
struct BatchBuy: Codable, Hashable {
    let vendorDay: Int
    var count: Int
}

struct RetailState: Codable, Hashable {
    /// Flipper pressure on each recent day, by day (the last `Balance.pressureLogDays`). The shelf drain reads it.
    var pressureLog: [Int: Double] = [:]
    /// Market events that already moved the pressure, by event ID.
    var seenEvents: [UUID] = []
    /// By `LocalStore.rawValue`.
    var strictness: [String: ChainStrictness] = [:]
    var storeHeat: [String: Double] = [:]
    /// The last day of a ban at each chain (proposal 2.4).
    var bannedUntil: [String: Int] = [:]
    /// Today: visits to each chain, items and hot items in the current visit, and the visit of the first checkout.
    var visits: [String: Int] = [:]
    var visitBought: [String: Int] = [:]
    var visitHotBought: [String: Int] = [:]
    var checkoutVisit: [String: Int] = [:]
    /// Units bought from vendor batches, by `ShelfItem.id`.
    var batchBought: [String: BatchBuy] = [:]
    /// The club store (proposal 1.7): the last day of the membership, and the day of the last hot club buy.
    var clubUntil: Int? = nil
    var clubHotDay = -1
    /// Online (proposals 1.4, 1.5, 2.6).
    var drawings: [DrawingEntry] = []
    var dropOrders: [DropOrder] = []
    var targetAttempts = 0
    var targetAttemptDay = -1
    /// Restock alerts (proposal 1.8).
    var alertTier = AlertTier.none
    var alertStore: LocalStore? = nil
    /// The MSRP step (More mechanics): the day it happens. Nil until the game announces it. At most once per run.
    var msrpStepDay: Int? = nil
    /// The after-holiday sealed dip scale for each winter, by the year of its center (More mechanics).
    var winterScales: [Int: Double] = [:]
    /// Distributor orders that never arrived (More mechanics).
    var missingShipments: [MissingShipment] = []
    /// The follower tier that the creator rivals last reacted to (proposal 2.3).
    var followerTierMark = 0
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
        storeHeat = v(.storeHeat, storeHeat)
        bannedUntil = v(.bannedUntil, bannedUntil)
        visits = v(.visits, visits)
        visitBought = v(.visitBought, visitBought)
        visitHotBought = v(.visitHotBought, visitHotBought)
        checkoutVisit = v(.checkoutVisit, checkoutVisit)
        batchBought = v(.batchBought, batchBought)
        clubUntil = v(.clubUntil, clubUntil)
        clubHotDay = v(.clubHotDay, clubHotDay)
        drawings = v(.drawings, drawings)
        dropOrders = v(.dropOrders, dropOrders)
        targetAttempts = v(.targetAttempts, targetAttempts)
        targetAttemptDay = v(.targetAttemptDay, targetAttemptDay)
        alertTier = v(.alertTier, alertTier)
        alertStore = v(.alertStore, alertStore)
        msrpStepDay = v(.msrpStepDay, msrpStepDay)
        winterScales = v(.winterScales, winterScales)
        missingShipments = v(.missingShipments, missingShipments)
        followerTierMark = v(.followerTierMark, followerTierMark)
    }
}
```

Note: `JSONEncoder` writes an `[Int: Double]` dictionary as a flat array of keys and values. `JSONDecoder` reads it back. The size stays small (8 entries for `pressureLog`, one per year for `winterScales`).

### 0.4 End Day order

File: `M/GameStore.swift`, `endDay()` (L1106-1207). The table shows the new steps in their place. Existing steps keep their order.

| Position | Step | Why here |
|---|---|---|
| L1133-1136 (existing) | `demandEndDay`, `syncMarket`, `printEndDay`, `marketEndDay` | They create today's print news and market news. |
| NEW after L1136 | `lines += flippersEndDay()` | It reads today's new market events, print changes, the regime, and the season. It changes the pressure, adds dump events, rolls strictness incidents, decays heat, rolls the MSRP step, and locks the winter scale. It ends with `syncMarket()`. It must run before any price read of the new day that a dump or a step changes. |
| L1137-1141 (existing) | resets of `boughtToday`, `shelfBought`, `pokemonCenterAttempted`, `weekBought` | |
| NEW after L1141 | `resetRetailDay()` | Clears today's visits and visit counters. Prunes old `batchBought` entries. |
| L1145 (existing) | `advanceSealed()` | |
| NEW after L1145 | `lines += retailOrdersEndDay()` | Resolves drawings, order cancellations, and missing shipments. It runs after `advanceSealed`, so an item that a drawing win adds today keeps its full `.arriving` days. |
| L1167 (existing) | `vendingEndDay()` | |
| NEW after L1167 | `lines += rivalsEndDay()` | Hostility pull and the creator reaction. No money moves. |
| L1196 (existing) | `businessCostsEndDay()` | |
| NEW after L1196 | `if data.gameOver == nil { lines += alertsEndDay() }` | Charges the alert fee on the 1st with the other monthly costs, and writes tomorrow's vendor-day alerts. |

`endedDay` inside the new hooks is `data.day - 1`, because L1131 already moved the day.

### 0.5 The exclusivity rule in every new hook

`GameStore.data` is `@Observable`. A closure passed to a mutating call on `data.x` must never read `data.y`. It crashes with "Fatal access conflict detected", and only when the array is not empty. Every new hook in this plan follows these rules:

1. Read every value that a closure needs into a `let` first: `let today = data.day`, `let p = data.flipperPressure`.
2. For a struct with many changes, copy it out, change the copy, and write it back once: `var retail = data.retail; ...; data.retail = retail`. `demandEndDay()` already does this ([M/Demand.swift L44-49](../../app/PokeVendor/Model/Demand.swift)).
3. Never call a `GameStore` method that reads `data` from inside a `removeAll`, `filter` that is assigned back in the same expression, `firstIndex(where:)` on a mutation path, or `sort(by:)` on `data.x`.
4. Never call `recordHiddenAct` (Part C) or `addHeat` from inside such a closure. Both write `data`.

Each section below names the exact places where the rule matters.

### 0.6 Part C hidden acts that Part A records

Part A calls `store.recordHiddenAct(_ kind: HiddenActKind, weight: Double, note: String)`. Part C defines the enum. Part A needs these cases:

| Case | When Part A calls it | Weight |
|---|---|---|
| `limitBuyout` | A hot buy that uses up the chain limit at a big store or the club | `Balance.heatLimitBuy` (1) |
| `repeatVisit` | The first buy on a second or later visit to the same chain on one day | `Balance.heatRepeatVisit` (2) |
| `checkoutBot` | Each Pokemon Center or Target.com attempt with the checkout bot | `Balance.heatBotUse` (3) |
| `storeBan` | Staff refuse card sales to the player at a chain | `Balance.heatStoreBanWeight` (5) |
| `botOrderCancelled` | Pokemon Center or Target.com cancels a bot order | `Balance.heatBotCancelWeight` (4) |

The weight equals the heat that the act adds, except for `storeBan` and `botOrderCancelled`, which add no heat by themselves.

---

## 1. Big-box stores

### 1.1 Weekly vendor day and a draining batch

**What changes.** A big store no longer rolls 12% stock each day. Each big store and the club store has a hidden, fixed vendor slot per run: one weekday from Tuesday to Friday and one morning hour from 8 to 11. On that day, at that hour, a large batch arrives. The batch drains through the store's open hours. The shelf on later days shows what is left, until the next vendor day.

Weekday math: `data.day % 7` is the weekday, 0 is Monday ([M/GameStore.swift L295](../../app/PokeVendor/Model/GameStore.swift)). Tuesday to Friday is 1 to 4.

**`LocalStore` changes.** File: `M/LocalStores.swift` L4-14. Append the club case at the end of the enum, so `LocalStore.allCases.firstIndex(of:)` keeps its old values for the existing seeds (`Market.shelf` L98, `restockDay` Camping L39).

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

`stockChance` stays for `Market.shelf` (game shops only after this change).

Replace `!store.isGameShop` with `store.isBigStore` in `M/Camping.swift` L47 and L59, so the club gets no posted camp restock.

**`ShelfItem` changes.** File: `M/LocalStores.swift` L17-22. The new fields have defaults, so every existing `ShelfItem(id:product:price:quantity:)` call still compiles (GameTests L333 uses it).

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

**Hot and MSRP helpers.** File: `M/Retail.swift`. `isHot` moves to `Product`, so static code (`Market`) can call it. `GameStore.isHot(_:)` ([M/WholesaleAccount.swift L38-41](../../app/PokeVendor/Model/WholesaleAccount.swift)) becomes a one-line call to it.

```swift
extension Product {
    /// The retail price at a big store, the Pokemon Center, and the base of the wholesale price. It rises once by
    /// `Balance.msrpStep` on the MSRP step day (More mechanics).
    func retailMSRP(day: Int? = nil) -> Double? {
        msrp.map { Market.retail($0 * PriceCycle.msrpFactor(day: day)) }
    }

    /// Hot: the market on the day is `Balance.hotProductRatio` × MSRP or more.
    func isHot(day: Int? = nil) -> Bool {
        guard let m = retailMSRP(day: day), m > 0 else { return false }
        return PriceCycle.price(baseMarket, marketFactor(day: day)) >= m * Balance.hotProductRatio
    }
}
```

`WholesaleAccount.swift` L38-41 becomes `func isHot(_ product: Product) -> Bool { product.isHot() }`.

Note: `Market.retail` rounds $5 and up to `.99`. The step factor is 1 before the step day, so `retailMSRP` then equals `Market.retail(msrp)`. Today a big store sells at the raw `p.msrp` ([M/LocalStores.swift L119](../../app/PokeVendor/Model/LocalStores.swift)). Catalog MSRPs already end in `.99` or are under $5 for packs ($4.49), so the price does not change before the step. If a catalog MSRP does not end in `.99`, `retailMSRP` moves it by under $1. Accept that.

**Vendor slot, batch day, batch, and drain.** File: `M/Retail.swift`.

```swift
extension LocalStore {
    /// The batch on a vendor day: the units in total, and the number of products.
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

@MainActor
extension Market {
    /// The full batch of a big store or the club on its vendor day, before any drain. The same run and day always
    /// give the same batch. `seed` is the run's market seed, so each run has its own batches.
    static func batch(_ store: LocalStore, vendorDay: Int, seed: UInt64) -> [ShelfItem] {
        guard vendorDay >= 0, store.batchSize > 0 else { return [] }
        let salt = UInt64(LocalStore.allCases.firstIndex(of: store) ?? 0) + 11
        var r = SeededRandom(seed: (UInt64(vendorDay + 1) &* 15_485_863 &+ salt &* 3_571) ^ seed)
        let options: [Product]
        if store.isClub {
            options = SetLibrary.catalog.filter { $0.isClubExclusive && $0.isInPrint }
        } else {
            options = SetLibrary.catalog.filter {
                $0.isInPrint && Balance.bigStoreKinds.contains($0.kind) && $0.msrp != nil && !$0.isClubExclusive && $0.packs <= 11
            }
        }
        guard !options.isEmpty else { return [] }
        var picks: [Product] = []
        for _ in 0..<r.int(store.batchProducts) {
            let p = options[r.int(0...(options.count - 1))]
            if !picks.contains(where: { $0.id == p.id }) { picks.append(p) }
        }
        // Split the batch: each product gets at least `batchMinUnits`, the rest goes by random weights.
        let base = Balance.batchMinUnits * picks.count
        let weights = picks.map { _ in r.double(0.5...1.5) }
        let total = weights.reduce(0, +)
        let spare = max(0, store.batchSize - base)
        return picks.enumerated().map { i, p in
            let qty = Balance.batchMinUnits + Int((Double(spare) * weights[i] / total).rounded())
            let hot = p.isHot(day: vendorDay)
            let msrp = p.retailMSRP(day: vendorDay) ?? p.market
            let price: Double = switch store {
            case .club: retail(clubPrice(p))
            // Proposal 1.6: GameStop marks up hot product.
            case .gamestop where hot: retail(msrp * r.double(Balance.gameStopHotMarkup))
            default: msrp
            }
            return ShelfItem(id: "v\(vendorDay)-\(store.rawValue)-\(i)", product: p, price: price, quantity: qty,
                             batchDay: vendorDay, hot: hot, batchQuantity: qty)
        }
    }
}
```

`Balance.bigStoreKinds` is the existing list at L106 moved into a constant: `["Booster pack", "Blister", "Tin", "Booster bundle", "Elite Trainer Box", "Collection"]`.

```swift
@MainActor
extension GameStore {
    /// The fixed vendor slot of a store for this run: a weekday from Tuesday (1) to Friday (4), and an hour.
    /// `PriceCycle.unit` mixes the run's market seed, so each run has its own slots.
    func vendorSlot(_ store: LocalStore) -> (weekday: Int, hour: Double) {
        let d = PriceCycle.unit("vendor-day-" + store.rawValue)
        let h = PriceCycle.unit("vendor-hour-" + store.rawValue)
        let days = Balance.vendorWeekdays        // 1...4
        let hours = Balance.vendorHours          // [8, 9, 10, 11]
        return (days.lowerBound + min(days.count - 1, Int(d * Double(days.count))),
                hours[min(hours.count - 1, Int(h * Double(hours.count)))])
    }

    /// The vendor day of the batch on the shelf at this moment: the last vendor day at or before it.
    /// Before the vendor hour on a vendor day, the shelf still holds last week's batch.
    func batchDay(_ store: LocalStore, day: Int, hour: Double) -> Int {
        let slot = vendorSlot(store)
        var d = day - ((day % 7) - slot.weekday + 7) % 7
        if d == day && hour < slot.hour { d -= 7 }
        return d
    }

    /// The share of a batch item left after the open hours from the vendor's arrival to the visit. A hot item drains
    /// at `0.5 + 1.5 × pressure` an hour, with the pressure of each day. Other items drain at 0.05 an hour.
    func drainShare(hot: Bool, fromDay: Int, fromHour: Double, toDay: Int, toHour: Double) -> Double {
        guard toDay >= fromDay else { return 1 }
        let log = data.retail.pressureLog
        let now = data.flipperPressure
        var total = 0.0
        for d in fromDay...toDay {
            let open = max(Balance.storeOpen, d == fromDay ? fromHour : Balance.storeOpen)
            let close = min(Balance.storeClose, d == toDay ? toHour : Balance.storeClose)
            guard close > open else { continue }
            let p = log[d] ?? now
            let rate = hot ? Balance.hotDrainBase + Balance.hotDrainPressure * p : Balance.coldDrainRate
            total += rate * (close - open)
        }
        return exp(-total)
    }

    /// The shelf at a stop. A game shop keeps its old daily shelf. A big store or the club shows its batch after the
    /// drain. At strictness level 3, hot items leave the shelf for a drawing. At level 4, or during a ban, the shelf
    /// shows nothing that the player can buy (the view says why).
    func shelf(at store: LocalStore, hour: Double) -> [ShelfItem] {
        if store.isGameShop { return Market.shelf(store, day: data.day, discount: shopDiscount(store)) }
        let today = data.day
        let vDay = batchDay(store, day: today, hour: hour)
        let slot = vendorSlot(store)
        let level = strictness(store).level
        guard level < 4 else { return [] }
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

Exclusivity: `shelf(at:hour:)` and `drainShare` only read `data`. The `compactMap` runs on a local array, not on `data`. Safe.

`Market.shelf` (L97-122) keeps only the game-shop branch. Delete the big-store branch at L106-121 and replace it with `return []`. `HubView+Debug.swift` L115 calls it for `.castle` only, so it still works.

**`shelfLeft` and the box copy.** File: `M/GameStore.swift` L782.

```swift
    func shelfLeft(_ item: ShelfItem) -> Int {
        if item.batchDay != nil { return max(0, item.quantity - (data.retail.batchBought[item.id]?.count ?? 0)) }
        return item.quantity - (data.shelfBought[item.id] ?? 0)
    }

    /// The copy of a shelf item that the player takes next: the front box (BoxContents.shelfKey).
    func shelfCopy(_ item: ShelfItem) -> Int {
        item.batchDay != nil ? data.retail.batchBought[item.id]?.count ?? 0 : data.shelfBought[item.id] ?? 0
    }
```

Use `shelfCopy(item)` in `buyShelf` L788 and in `StoreRunViews.swift` L151 in place of `data.shelfBought[item.id] ?? 0`. A batch box then keeps its front-box contents across days.

**Arrival hour of each stop.** The store run spends the whole block at once ([M/GameStore.swift L767-780](../../app/PokeVendor/Model/GameStore.swift)). The stop index gives the arrival:

- `App/AppNav.swift` L35-38: add `let startHour: Double` to `StoreRunSession`.
- `M/GameStore.swift` L767: change `startStoreRun(_:) -> Bool` to `@discardableResult func startStoreRun(_ stores: [LocalStore]) -> Double?`. It returns the start hour (`slot(for: hours)` before `spendHours`), or nil. It also calls `beginVisit(s)` for each stop that is not a game shop (section 1.2).
- `Buy/StoreRunViews.swift` L51-57: `guard let start = store.startStoreRun(chosen) else { ...; return }` then `nav.storeRun = StoreRunSession(stops: chosen, startHour: start)`.
- `Hub/HubView+Debug.swift` L118: same change.
- `Hub/HubView.swift` L70-71: pass `session.startHour` into `StoreRunView(stops:startHour:onClose:)`.
- `StoreRunView` arrival for stop `i`: `startHour + Double(i) * store.storeStopHours`.

**Batch purchase pruning.** `resetRetailDay()` (M/Retail.swift), called after L1141:

```swift
    func resetRetailDay() {
        let oldest = data.day - Balance.pressureLogDays
        var retail = data.retail
        retail.visits = [:]
        retail.visitBought = [:]
        retail.visitHotBought = [:]
        retail.checkoutVisit = [:]
        retail.batchBought = retail.batchBought.filter { $0.value.vendorDay >= oldest }
        retail.pressureLog = retail.pressureLog.filter { $0.key >= oldest }
        data.retail = retail
    }
```

Exclusivity: the filters run on the local copy `retail`, and the closures read only `oldest`. Safe.

**Save compatibility.** An old save has no batch purchases. The first visit shows the current batch with the drain. No migration.

**UI.** See section 1.2, which changes the same two views.

**Interactions.** Camping stays a separate posted event with its own stock (section 1.2). Print runs: `isInPrint` on the vendor day decides the batch pool, so a reprint wave puts its products into the batches from its shelf day. A set that leaves print leaves the batches. The batch is about 10 times today's expected big-store stock (30 units a week at Walmart, against 0.12 × about 4 units a day). The limits in 1.2 and the drain keep the player's share small. Tune the batch sizes with `-marketsim` before release.

### 1.2 Purchase limits at the shelf and at camping

**Types.** File: `M/Retail.swift`.

```swift
/// The base limit of a chain (proposal 1.2).
struct PurchaseLimit: Hashable {
    enum Kind: Hashable { case none, perVisit, perSKUPerDay }
    let kind: Kind
    let normal: Int
    let hot: Int
}

/// The limit in force now: the base limit after the strictness level.
struct LimitRule: Hashable {
    /// Units of one product a day.
    var perSKU: Int?
    /// All card items in one visit.
    var perVisit: Int?
    /// Hot items in one visit.
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

**Functions.** File: `M/Retail.swift`.

```swift
@MainActor
extension GameStore {
    func strictness(_ store: LocalStore) -> ChainStrictness { data.retail.strictness[store.rawValue] ?? ChainStrictness() }

    func isBanned(_ store: LocalStore) -> Bool { (data.retail.bannedUntil[store.rawValue] ?? -1) >= data.day }

    var isClubMember: Bool { (data.retail.clubUntil ?? -1) >= data.day }

    /// The key of a product's daily count at a chain. It lives in `shelfBought`, which End Day resets.
    func skuKey(_ store: LocalStore, _ productID: String) -> String { "sku|\(store.rawValue)|\(productID)" }

    func limitRule(_ store: LocalStore) -> LimitRule {
        let base = store.baseLimit
        var rule = LimitRule()
        guard base.kind != .none else { return rule }
        switch base.kind {
        case .perVisit: rule.perVisit = base.normal; rule.hotPerVisit = base.hot
        case .perSKUPerDay: rule.perSKU = base.normal
        case .none: break
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
    func limitText(_ store: LocalStore) -> String { ... }   // for example "Limit 2 per item a day · 1 on hot items"

    /// A visit starts: at the start of a store run (each big stop and the club), and at a camp.
    func beginVisit(_ store: LocalStore) {
        let key = store.rawValue
        var retail = data.retail
        retail.visits[key, default: 0] += 1
        retail.visitBought[key] = 0
        retail.visitHotBought[key] = 0
        data.retail = retail
    }
}
```

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
    /// Counts a big-store or club buy toward the limits, the batch, the heat, and the rivals.
    func notePurchase(_ item: ShelfItem, at store: LocalStore) {
        let key = store.rawValue
        let today = data.day
        var retail = data.retail
        if let vDay = item.batchDay {
            retail.batchBought[item.id, default: BatchBuy(vendorDay: vDay, count: 0)].count += 1
        }
        retail.visitBought[key, default: 0] += 1
        if item.hot { retail.visitHotBought[key, default: 0] += 1 }
        let visit = retail.visits[key] ?? 1
        if retail.checkoutVisit[key] == nil { retail.checkoutVisit[key] = visit }
        if store.isClub && item.hot { retail.clubHotDay = today }
        let firstBuyThisVisit = retail.visitBought[key] == 1
        data.retail = retail
        data.shelfBought[skuKey(store, item.product.id), default: 0] += 1
        // Heat (proposal 2.4). Each call is outside any closure on `data`.
        if visit > 1 && firstBuyThisVisit {
            addHeat(Balance.heatRepeatVisit, at: store, act: .repeatVisit, note: "A second trip to \(key) today to buy more cards")
        }
        if item.hot && limitLeft(item, at: store) == 0 {
            addHeat(Balance.heatLimitBuy, at: store, act: .limitBuyout, note: "Bought the limit of \(item.product.name) at \(key)")
        }
        // Rivals (proposal 2.3): the player took the last hot units on the vendor day.
        if item.hot, item.batchDay == today, shelfLeft(item) == 0, let rival = rivalAt(store) {
            rememberRival(rival.id, .playerTookShelf, note: "You took the last \(item.product.name) at \(key)",
                          byPlayer: true, hostility: Balance.rivalTookShelfHostility)
        }
    }
```

Design choice: the report says "Add 2 for a same-day repeat visit". This plan adds the 2 only when the player buys on the repeat visit. A second trip only to look is not scalping. See "Questions and decisions".

**Camp haul cap.** File: `M/Camping.swift` L76-104.

- In `camp(_:)` after L83: `beginVisit(store)`.
- L85: `let chance = (Balance.campSuccess * pow(Balance.arrivalKeep, late) + restockBotBonus) * flipperCampFactor` (proposal 2.1).
- L95-100: skip a hot product at strictness 3 (`if limitRule(store).hotByDrawing && p.isHot() { continue }`). Cap each quantity:

```swift
            let hot = p.isHot()
            let qty = min(r.int(Balance.campQuantity), campCap(store, hot: hot))
            items.append(ShelfItem(id: "camp-\(data.day)-\(store.rawValue)-\(i)", product: p,
                                   price: p.retailMSRP() ?? p.market, quantity: qty, hot: hot))
```

```swift
    /// The most units of one product a camp haul holds: the chain limit. A per-visit limit caps each product at the
    /// visit limit, and the buy check holds the visit total (Model/Retail.swift).
    func campCap(_ store: LocalStore, hot: Bool) -> Int {
        let rule = limitRule(store)
        var cap = Int.max
        if let n = rule.perSKU { cap = min(cap, hot ? min(n, store.baseLimit.hot) : n) }
        if let n = rule.perVisit { cap = min(cap, n) }
        if hot, let n = rule.hotPerVisit { cap = min(cap, n) }
        return max(1, cap)
    }
```

A camped Target restock now gives 1 (hot) or 2 of each product. Camp items have `hot` set, so `limitLeft` and the heat rule apply to them. Camp items are not batch items (`batchDay` nil), so `shelfLeft` keeps the daily `shelfBought` count.

- `campBlock(_:)` L69-74: add first:

```swift
        if isBanned(store) { return "Staff refuse you card sales until \(GameCalendar.date(data.retail.bannedUntil[store.rawValue] ?? data.day).text)" }
        if let until = strictness(store).closedUntil, until >= data.day { return "\(store.rawValue) stopped in-store card sales" }
```

**Save compatibility.** The per-SKU counts use new keys inside the existing `shelfBought` dictionary. End Day already resets it (L1139). No new saved field for 1.2 beyond `RetailState`.

**UI.**

1. `StoreRunPlanner` (`Buy/StoreRunViews.swift` L14-40). The detail line of a big store (L25) becomes `"Big store · MSRP · \(store.limitText(s))"`, then any of these tags in orange: `"Strict · level \(n)"` when level is 1 or more, `"Refused until <date>"` during a ban, `"Card sales stopped"` at level 4. With an alert subscription for the store, add `"Vendor stock tomorrow ~9 AM"` or `"Vendor stock today ~9 AM"` in cyan (section 1.8). The club row shows `"Members only · \(money(Balance.clubFee)) a year"` and a `Join` button (`.bordered`, `.small`), or `"Member until <date>"`.
2. `StoreRunView.stopView` (L106-187). Change L107 to `let shelf = store.shelf(at: s, hour: arrival)`. Under the store name, for a store that is not a game shop: a caption line with `store.limitText(s)` and the strictness level. Show a `Banner` (orange) for a ban, for level 4, and for a club stop with no membership (with a `Join · $65` button). The row caption (L155) becomes `"\(left) left · limit \(limitLeft) · mkt …"`. The buy button is disabled when `left == 0 || limitLeft == 0`. A batch item with `left == 0` stays in the list with the text `"Gone"` and the rival line from `store.soldOutLine(item, at: s)` (section 2.3). After a buy, show `store.retailNotice` in a `Banner` (orange) and clear it. `retailNotice` is a new non-saved `var retailNotice: String?` on `GameStore`, next to `report` (L249). `addHeat` sets it when a ban starts.
3. `CampView` (`Hub/OpportunityView.swift` L84-128). Under the intro text, add a caption with `store.limitText(haul.store)`. The row text (L105) adds `"· limit \(store.limitLeft(item, at: store))"`. The buy button also disables at a zero limit. The intro text "The shelf is yours before the scalpers" (L94) changes to the rival line when a rival was in line (section 2.3).

No view in this section uses an animation.

**Tests.** Section 7, checks T1 to T3.

**Interactions.** The boxes test (GameTests L332-337) buys one unit at `LocalStore.allCases.first` (Target) with a test `ShelfItem` that has no batch. The per-SKU limit is 2 (1 if hot), so one buy still passes. It adds at most 1 heat. The test needs no change.

### 1.3 Strictness ladder after incidents

**State.** `ChainStrictness` in `RetailState.strictness` (section 0.3).

**End Day.** File: `M/Retail.swift`. `flippersEndDay()` (section 2.1, in `M/Flippers.swift`) calls it after the pressure update, so it must not be `private`:

```swift
    /// Proposal 1.3: incidents on yesterday's vendor visits raise a chain's level. Levels fall with time.
    func strictnessEndDay(endedDay: Int, pressure: Double) -> [String] {
        let today = data.day
        var all = data.retail.strictness
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
            if endedDay % 7 == vendorSlot(store).weekday, s.level < 4,
               Double.random(in: 0..<1) < Balance.incidentChance * pressure {
                s.level += 1; s.lastChange = today
                if s.level == 4 { s.closedUntil = today + Balance.closureDays }
                lines.append("Market news: \(Self.incidentText(store)) \(store.rawValue) tightens its card limits: \(Self.levelText(s.level)).")
            }
            all[store.rawValue] = s
        }
        data.retail.strictness = all
        return lines
    }
```

`incidentText` picks one of three texts with `randomElement()`: "A fight broke out at a \(store) restock.", "A video of one buyer clearing a \(store) shelf went viral.", "Police came to a crowd at a \(store) card aisle." `levelText(n)`: 1 "one of each item a day", 2 "one checkout a day", 3 "hot product by drawing only", 4 "no card sales for 21 days".

Exclusivity: the loop works on the local `all`. `vendorSlot` reads `PriceCycle`, not `data`. Safe.

**UI.** The planner tags (section 1.2). `FlipperMarketBox` on the Market screen lists each chain with a level above 0 and its text (section 2.1).

**Level 3 drawings.** See section 1.4: `chainDrawings` lists a drawing for each chain at level 3.

**Tests.** No check. The rule moves no money directly. The 14-day `days()` run covers the code path for crashes.

### 1.4 Weekly online drawing (Walmart Collectibles Draw) and level-3 chain drawings

**Types.** File: `M/RetailOnline.swift`.

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

/// A drawing the player can enter now. Not saved: the seed makes it.
struct DrawingOffer: Identifiable, Hashable {
    let chain: LocalStore
    let product: Product
    let drawDay: Int
    let price: Double
    var id: String { "\(chain.rawValue)-\(drawDay)" }
    var online: Bool { chain == .walmart }
}
```

**Functions.** File: `M/RetailOnline.swift`.

```swift
@MainActor
extension GameStore {
    /// This week's Walmart drawing: entries Monday to Wednesday, the draw at the End Day of Wednesday.
    var walmartDrawing: DrawingOffer? {
        let week = data.day / 7
        let drawDay = week * 7 + Balance.drawingWeekday
        guard data.day <= drawDay else { return nil }
        var r = SeededRandom(seed: (UInt64(week + 1) &* 86_028_121 &+ 77) ^ data.marketSeed)
        let pool = SetLibrary.catalog.filter { Balance.bigStoreKinds.contains($0.kind) && $0.isInPrint && $0.msrp != nil
                                               && !$0.isStoreExclusive && $0.isHot() }
        guard !pool.isEmpty else { return nil }
        let p = pool[r.int(0...(pool.count - 1))]
        guard let price = p.retailMSRP() else { return nil }
        return DrawingOffer(chain: .walmart, product: p, drawDay: drawDay, price: price)
    }

    /// Level 3: each strict chain draws its hot batch items. Entries close at the chain's next vendor day.
    var chainDrawings: [DrawingOffer] {
        LocalStore.allCases.filter { !$0.isGameShop && strictness($0).level == 3 }.compactMap { store in
            let slot = vendorSlot(store)
            let next = data.day + (slot.weekday - data.day % 7 + 7) % 7
            guard let item = Market.batch(store, vendorDay: next, seed: data.marketSeed).first(where: \.hot) else { return nil }
            return DrawingOffer(chain: store, product: item.product, drawDay: next, price: item.price)
        }
    }

    func entered(_ offer: DrawingOffer) -> Bool {
        data.retail.drawings.contains { $0.chain == offer.chain && $0.drawDay == offer.drawDay }
    }

    /// A free entry. One entry for each drawing.
    func enterDrawing(_ offer: DrawingOffer) {
        guard !entered(offer), data.day <= offer.drawDay else { return }
        data.retail.drawings.append(DrawingEntry(chain: offer.chain, productID: offer.product.id, drawDay: offer.drawDay,
                                                 price: offer.price))
        log("Entered the \(offer.chain.rawValue) drawing for \(offer.product.name).")
        save()
    }

    /// The result of one entry. A win charges the cash at once. With too little cash, the win is lost.
    /// Separate from the roll, so the test can force a result.
    func resolveDrawing(_ entry: DrawingEntry, won: Bool) -> String {
        guard let p = SetLibrary.product(entry.productID) else { return "" }
        let place = entry.chain == .walmart ? "Walmart's online drawing" : "the \(entry.chain.rawValue) drawing"
        guard won else { return "You did not win \(place) for \(p.name)." }
        guard canAfford(entry.price) else {
            return "You won \(place) for \(p.name), but you had less than \(money(entry.price)). The win went to the next name."
        }
        addLedger(-entry.price, .sealed, "\(p.name) · \(entry.chain.rawValue) drawing")
        let from = entry.chain == .walmart ? "Walmart.com" : "\(entry.chain.rawValue) pickup"
        let days = entry.chain == .walmart ? Balance.drawingDeliveryDays : 1
        data.sealed.append(SealedItem(setSlug: p.homeSlug, name: p.name, packs: p.packs, paid: entry.price, acquired: .now,
                                      source: "Won a \(entry.chain.rawValue) drawing", productID: p.id,
                                      status: .arriving(daysLeft: days, from: from), acquiredDay: data.day))
        return "You won \(place)! \(money(entry.price)) for \(p.name). It arrives in \(days) day\(days == 1 ? "" : "s")."
    }
}
```

**End Day.** In `retailOrdersEndDay()` (section 1.5 shows the whole function):

```swift
        let ended = data.day - 1
        let due = data.retail.drawings.filter { $0.drawDay <= ended }
        data.retail.drawings = data.retail.drawings.filter { $0.drawDay > ended }
        for entry in due {
            lines.append(resolveDrawing(entry, won: Double.random(in: 0..<1) < Balance.drawingWinChance))
        }
```

Exclusivity: the filters read only the local `ended`. `resolveDrawing` writes `data.sealed` and the ledger, and it runs in a plain `for` loop over the local `due`. Never write `data.retail.drawings.removeAll { $0.drawDay <= data.day - 1 }`.

**UI.** New `ChainSitesView` (`Buy/ChainSitesView.swift`). Reach: Buy > Online > a new row "Big-store sites" (`Buy/BuyViews.swift`, inside the `VStack` at L24-37, after the storefront rows). Detail text: `"Walmart drawing · Target.com drop"` with the live state. New route `case chainSites` in `AppRoute` (`App/AppNav.swift` L4-33) and `case .chainSites: ChainSitesView()` in the switch (L85-115).

`ChainSitesView` shows three `DetailBox` sections:

1. "Walmart Collectibles Draw · weekly": product image, name, MSRP, market, `"Entries close Wednesday · results Thursday morning · 1 entry"`, and a button `Enter free` or a disabled `Entered`. With no hot product this week: `"No drawing this week."`.
2. "Store drawings": one row for each `chainDrawings` offer, with the same button. Hidden when empty.
3. "Target.com" (section 2.6).

A caption under section 1: `"A win charges the price at once. With too little cash, the win goes to the next name."`

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
        if useBot { addHeat(Balance.heatBotUse, at: nil, act: .checkoutBot, note: "Used a checkout bot on a Pokemon Center drop") }
        let chance = useBot ? Balance.pokemonCenterBotSuccess : Balance.pokemonCenterSuccessChance
        if Double.random(in: 0..<1) < chance, buy(offer), let item = data.sealed.last {
            addDropOrder(item: item, source: "Pokemon Center", bot: useBot, refund: offer.price + offer.shipping)
            return true
        }
        log("Missed the Pokemon Center drop for \(offer.title).")
        save()
        return false
    }
```

`buy(_:)` appends exactly one `SealedItem` for a product offer (L730-736), so `data.sealed.last` is the new item.

```swift
    func addDropOrder(item: SealedItem, source: String, bot: Bool, refund: Double) {
        let order = DropOrder(itemID: item.id, source: source, name: item.name,
                              rollDay: data.day + Int.random(in: Balance.dropCancelWindow),
                              chance: bot ? Balance.dropCancelBotChance : Balance.dropCancelChance, refund: refund, bot: bot)
        data.retail.dropOrders.append(order)
    }
```

**End Day.** `retailOrdersEndDay()` (M/RetailOnline.swift), after `advanceSealed()`:

```swift
    func retailOrdersEndDay() -> [String] {
        var lines: [String] = []
        let today = data.day
        // Drawings (proposal 1.4): see section 1.4.
        ...
        // Cancellations (proposal 1.5).
        let due = data.retail.dropOrders.filter { $0.rollDay <= today }
        data.retail.dropOrders = data.retail.dropOrders.filter { $0.rollDay > today }
        for order in due where Double.random(in: 0..<1) < order.chance {
            if let line = cancelOrder(order) { lines.append(line) }
        }
        // Missing distributor shipments (More mechanics): see section 3.3.
        lines += missingShipmentsEndDay()
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
            recordHiddenAct(.botOrderCancelled, weight: Balance.heatBotCancelWeight,
                            note: "\(order.source) flagged your bot order for \(order.name)")
        }
        return "\(order.source) cancelled your order for \(order.name) and refunded \(money(order.refund)). "
            + (order.bot ? "Its systems flagged the checkout as a bot." : "A wave of cancellations hit many buyers.")
    }
```

Exclusivity: `removeAll { $0.id == id }` reads only the local `id`. Never write `data.sealed.removeAll { $0.id == data.retail.dropOrders[i].itemID }`.

Refund category: `.sealed`, positive. The order cost used `.sealed`, so the refund nets it for income tax. The wholesale short refund uses the same pattern ([M/Wholesale.swift L97](../../app/PokeVendor/Model/Wholesale.swift)).

A cancelled item that is in a P&L challenge: the challenge holds item IDs. The item leaves `data.sealed`. Part of the series code must treat a missing ID as gone. I did not find a sale hook for this case. Flag for the coder: check `isChallengeItem` callers after a cancellation (GameTests `shorts()` covers the challenge, not the cancellation).

**UI.** No new view. The cancellation line is in the morning report. `StoreView` header for the Pokemon Center (`Buy/BuyViews.swift` L143) adds `" · orders can be cancelled"`.

**Tests.** T4 (section 7): a forced cancellation refunds the exact amount and removes the item.

### 1.6 GameStop marks up hot product

Done inside `Market.batch` (section 1.1): `case .gamestop where hot: retail(msrp * r.double(Balance.gameStopHotMarkup))`. The price stays fixed for the batch, because the batch seed and the vendor-day hot flag fix it.

**UI.** The planner detail for GameStop adds `" · hot items over MSRP"`. The shelf row already shows the price and the market.

**Tests.** No check: a price rule on one chain, covered by T2's batch read.

**Docs.** D/12 "Local stores", D/19 "Store run and game shops".

### 1.7 Club store

**Model.** `LocalStore.club` (section 1.1). Vendor-day batches from `isClubExclusive && isInPrint` products, `Balance.clubBatchSize` units. Limit: 2 of an item a day, and 1 hot item a day for the membership (`hotPerDay`, `clubHotDay`).

**Price.** The catalog MSRP of many club bundles is not the club price. Examples from `catalog.json`: "Costco Pokemon Prismatic Evolutions 2-Pack Trainer Box and Booster Bundle" has `msrp` 26.94, and "Costco Prismatic Evolutions 8-Pack Mini Tins" has `msrp` 9.99. Use a floor by pack count:

```swift
extension Market {
    /// The club price: the catalog MSRP, but never under `Balance.clubPricePerPack` for each pack.
    static func clubPrice(_ p: Product) -> Double {
        max(p.retailMSRP() ?? 0, Double(p.packs) * Balance.clubPricePerPack)
    }
}
```

This changes no catalog value and no graded price.

**Membership.** File: `M/Retail.swift`.

```swift
    func joinClub() -> Bool {
        guard !isClubMember, canAfford(Balance.clubFee) else { return false }
        addLedger(-Balance.clubFee, .businessCosts, "Warehouse club membership")
        data.retail.clubUntil = data.day + Balance.clubDays
        log("Joined the warehouse club for \(money(Balance.clubFee)). Member until \(GameCalendar.date(data.day + Balance.clubDays).text).",
            cash: -Balance.clubFee)
        save()
        return true
    }
```

No automatic renewal. The planner row shows `Renew` when the membership has ended.

**Store run.** The club is one more row in `StoreRunPlanner` (it iterates `LocalStore.allCases`, L14). `startStoreRun` treats the club as a non-game-shop stop (`beginVisit`). The shelf comes from `shelf(at:hour:)`.

**Interactions.** The club is not a big store: no posted camp restock (`isBigStore` in Camping L47, L59), and no Target.com or Walmart drawing. Strictness incidents apply to it (the loop covers every non-game-shop store). Club products have very high market prices (for example $259.91 against a $90 club price), so the club batch drains fast and the 1-a-day hot limit matters most here.

**Tests.** T1 covers the club hot-per-day rule in the same check group.

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
        switch data.retail.alertTier {
        case .none: []
        case .oneChain: data.retail.alertStore.map { [$0] } ?? []
        case .allChains: LocalStore.allCases.filter(\.isBigStore)
        }
    }

    /// Starts or changes the alerts. The first month is charged now, in full.
    func subscribeAlerts(_ tier: AlertTier, store: LocalStore?) -> Bool {
        guard tier == .none || canAfford(tier.fee) else { return false }
        if tier != .none { addLedger(-tier.fee, .businessCosts, "Restock alerts · \(tier.name)") }
        data.retail.alertTier = tier
        data.retail.alertStore = tier == .oneChain ? store : nil
        save()
        return true
    }

    /// End Day: the fee on the 1st, then tomorrow's vendor days for the alerted chains.
    func alertsEndDay() -> [String] {
        var lines: [String] = []
        let tier = data.retail.alertTier
        if tier != .none, GameCalendar.isFirstOfMonth(data.day) {
            if canAfford(tier.fee) {
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

**Calendar.** `restockEntries(day:)` ([M/Camping.swift L58-64](../../app/PokeVendor/Model/Camping.swift)): append one `CalendarEntry(kind: .restock, title: "\(store) vendor stock", detail: "About \(clock) · from your alert")` for each alerted store whose vendor weekday matches `day`, when `day == data.day + 1` or `day == data.day`. No new `CalendarEntry.Kind`.

**UI.** New `RestockAlertsBox` (`Hub/FlipperViews.swift`) inside `UpgradesView`, in the "Buying" `DetailBox` (`Hub/UpgradesView.swift` L46-57), after `upgradeRow(.restockBot)`. It shows a segmented `Picker` with the three tiers, a chain `Picker` for `oneChain` (big stores only), the fee text `"$8 a month · charged on the 1st with rent"`, and a `Subscribe` or `Cancel` button. The planner row tag is in section 1.2.

**Tests.** No check. The fee follows the existing monthly charge pattern of `businessCostsEndDay` ([M/LateGame.swift L35-55](../../app/PokeVendor/Model/LateGame.swift)).

---
## 2. Flippers

### 2.1 Flipper pressure

**Value.** `data.flipperPressure: Double`, 0.1 to 0.9, start 0.5 (section 0.2). One market-wide value. Parts B and C read it.

**`flippersEndDay()`.** File: `M/Flippers.swift`. Called after `marketEndDay()` (section 0.4).

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

        // 1. Winter scale (More mechanics). Lock it on the first day of the winter dip, from yesterday's pressure.
        lines += lockWinterScale(day: today, pressure: before)

        // 2. Flipper dump (proposal 2.2). It reads the pressure before today's inputs.
        let reprintsToday = data.printChanges.filter { $0.inPrint && !$0.endsWave && $0.day == today && ($0.waveID == nil || $0.waveID == $0.id) }
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

        // 5. Heat decay and ban ends (proposal 2.4).
        lines += heatEndDay(day: today)

        // 6. The MSRP step (More mechanics).
        lines += msrpEndDay(day: today)

        syncMarket()
        return lines
    }
}
```

Exclusivity: every filter in this function reads only locals (`today`, `live`) or the element. The `for e in data.marketEvents` loop does not mutate `data.marketEvents`. It writes the local `seen`. `startDump` appends to `data.marketEvents` outside any closure. Never write `data.retail.seenEvents.removeAll { !data.marketEvents.contains(...) }`: that reads `data.marketEvents` inside a mutation of `data.retail`.

`pressureLine(_:rising:)`: "Flippers are crowding the shelves. Hot product sells out faster." or "Flippers are pulling back. Shelves stay stocked longer." `Balance.pressureNewsStep` (0.1) keeps the report quiet on normal days. A big jump is usually news, a reprint, or a season.

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
        return 1 - Balance.flipperSaleCut * max(0, data.flipperPressure - Balance.pressureRange.lowerBound)
            / (Balance.pressureRange.upperBound - Balance.pressureRange.lowerBound)
    }
```

File: `M/GameStore.swift`.

- L1432: add a parameter: `func rollSale(_ listing: Listing, market rawMarket: Double, sealed: Bool, slab: Bool = false, name: String, productID: String? = nil) -> Double?`.
- L1433: `let demand = channelDemand(listing.channel) * itemDemand(name) * PriceCycle.seasonDemand(sealed: sealed) * flipperSaleFactor(productID, channel: listing.channel)`.
- L1234 (`advanceSealed`): pass `productID: item.productID`.

The card call at L1426 passes no product, so cards keep their chance. The eBay auction no-sale floor at L1440 reads `demand`, so the factor also lowers auction sales.

**Effect 4: scales the reprint drop.** Through the dump (section 2.2).

**UI.** New `FlipperMarketBox` (`Hub/FlipperViews.swift`). Place it in `MarketView` (`Hub/GoalsMarketViews.swift`) after the "The card market" `DetailBox` (ends at L45). Content:

- A `StatCell` row: "Flippers" with the label from the value (0.1 to 0.35 "Few", to 0.65 "Busy", to 0.9 "Swarming"), and "Hot shelves" with the hours until 29% of a hot product is left: `log(1/0.29) / (0.5 + 1.5 × p)`, as "about 1 hour".
- A static capsule bar, 0.1 to 0.9, filled in `Theme.orange`. No animation.
- A caption: "Flippers buy hot in-print product as soon as it lands. More flippers empty shelves faster, cut your camp odds, and compete with your hot sealed listings online. News and booms bring them in. Reprints, corrections, and the end of the holidays drive them out."
- One row for each chain with strictness above 0 (section 1.3).
- The MSRP step notice when `data.retail.msrpStepDay` is in the future (section 3.4).
- `RivalsBox` (section 2.3).

**Tests.** T6 (pressure stays in range over the 14-day run, and a forced reprint input lowers it).

**Interactions.** Booms and corrections come from `PriceCycle.regimes`. Seasons come from `PriceCycle.seasonName`. Reprints come from `data.printChanges`. News comes from `data.marketEvents`. Nothing in the existing systems reads the pressure except through the four effects above, so the old price model is unchanged for cards and for sealed that is not hot. Part B reads the pressure for its fill rate.

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
            if t < fall { return 1 + peak * Double(t) / Double(max(fall, 1)) }
            return 1 + peak * (1 - Double(t - fall) / Double(max(days - fall, 1)))
        }
        let t = Double(day - startDay) / Double(max(days, 1))
        guard t >= 0, t < 1 else { return 1 }
        return 1 + peak * (t < 0.2 ? t / 0.2 : (1 - t) / 0.8)
    }
```

`products` and `fallDays` are `var` optionals, so the synthesized decoder reads them with `decodeIfPresent`. Old saves load. `movesCards` (L22) stays false for the dump.

The report says "Then the existing 120-day pull brings them back." The walk pull applies only to the daily steps, not to events. The dump therefore carries its own linear recovery over `Balance.dumpRecoveryDays` (120). The event ends at `fallDays + 120`, so `marketEndDay` removes it at a factor of exactly 1. No jump.

**`marketEndDay` change.** L480: the news cap must not count dumps.

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
    /// The reprint and the dump together never cut more than `Balance.flipperDumpCap` (45%).
    static func capDump(jumps: Double, dump: Double) -> Double {
        dump < 1 ? max(1 - Balance.flipperDumpCap, jumps * dump) : jumps
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
        var event = MarketEvent(kind: .flipperDump, subject: slugs.first ?? "", title: "Flippers are dumping \(names) stock. Its hot sealed products fall for some weeks.",
                                startDay: day, days: fall + Balance.dumpRecoveryDays, peak: -Double.random(in: Balance.dumpDrop))
        event.products = ids
        event.fallDays = fall
        data.marketEvents.append(event)
        return "Market news: \(event.title)"
    }

    /// A correction hits the sets with the most hot in-print products.
    func dumpSetsForCorrection() -> [String] {
        let hot = SetLibrary.catalog.filter { $0.isInPrint && $0.isHot() }
        let counts = Dictionary(grouping: hot, by: \.homeSlug).mapValues(\.count)
        return counts.sorted { $0.value > $1.value }.prefix(Balance.dumpCorrectionSets).map(\.key)
    }
```

`MarketEvent` has `let` fields with a memberwise init. `var event = MarketEvent(...)` then setting the two `var` fields compiles.

Exclusivity: `data.marketEvents.append(event)` gets a fully built local. No closure.

**UI.** The dump shows in the Market screen news list like other events (L57-67), with its percent and days left. The day report line is "Market news: Flippers are dumping Prismatic Evolutions stock. ...".

**Tests.** T7: `capDump(jumps: 0.65, dump: 0.8)` is 0.55, and `capDump(jumps: 1.2, dump: 0.9)` is 1.08 (pure, fast).

**Interactions.** A dump needs a reprint wave that reaches shelves or a correction start, and pressure 0.6 or more on the day before. The reprint itself lowers the pressure by 0.25 on the same day, so a second dump from the next reprint is less likely. Real graded prices never move: `sealedFactor` touches only sealed products.

### 2.3 Named rival flippers and rival creators

**Types.** File: `M/Rivals.swift`. Part C reads these. This is the full contract.

```swift
import Foundation

/// One meeting between the player and a rival. A rival keeps the last `Balance.rivalMemoryKept`.
struct RivalMemory: Codable, Hashable {
    enum Kind: String, Codable {
        /// The player bought the last hot units of a batch at the rival's home store.
        case playerTookShelf
        /// The player got in at a camp where the rival stood in line.
        case playerBeatInLine
        /// The rival cleared a hot shelf before the player came.
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
    /// 0 to 1. How much the crowd believes this rival. Part C lowers it when a false callout fails.
    var credibility = 1.0
    /// The last meetings, oldest first.
    var memory: [RivalMemory] = []
    /// A flipper's usual chains. Empty for a creator.
    var homeStores: [LocalStore] = []
    var lastSeenDay = -1

    /// The meetings where the player acted against the rival.
    var grudges: [RivalMemory] { memory.filter(\.byPlayer) }
}

/// Later builds can add fields. Each missing field takes its default.
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

Putting `init(from:)` in an extension keeps the memberwise init.

**Seeding.** File: `M/Rivals.swift`. Call `seedRivals()` in `GameStore.init()` after `seedContacts()` (L287) and in `startRun()` after `seedContacts()` (L539).

```swift
extension Balance {
    static let rivalFlipperNames = ["Tyler Voss", "Dana Ruiz", "Marco Bell", "Kayla Strom", "Devon Pike", "Jess Ortega"]
    static let rivalCreatorNames = [("Phil", "@packratphil"), ("Sam Okafor", "@sealedsam"), ("Rhea Lin", "@rheapulls"),
                                    ("Jonah Wade", "@jonahrips")]
}

@MainActor
extension GameStore {
    /// Three rival flippers and two rival creators, the same for one run.
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
        data.rivals = out
    }
}
```

The names are invented. None is a real public person.

**API for Part A, B, and C.** File: `M/Rivals.swift`.

```swift
    func rival(_ id: UUID) -> Rival? { data.rivals.first { $0.id == id } }

    /// The rival flipper who works this store. The same store gives the same rival.
    func rivalAt(_ store: LocalStore) -> Rival? {
        let here = data.rivals.filter { $0.kind == .flipper && $0.homeStores.contains(store) }
        guard !here.isEmpty else { return nil }
        return here[Int(PriceCycle.unit("rival-" + store.rawValue) * Double(here.count)) % here.count]
    }

    /// Records a meeting. Keeps the last few. Moves the hostility by `hostility` (clamped to 0...1).
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

    /// Part C: a failed false callout costs the rival credibility.
    func changeRivalCredibility(_ id: UUID, by delta: Double) {
        guard let i = data.rivals.firstIndex(where: { $0.id == id }) else { return }
        var r = data.rivals[i]
        r.credibility = min(1, max(0, r.credibility + delta))
        data.rivals[i] = r
    }
```

Exclusivity: `firstIndex(where: { $0.id == id })` is a read on `data.rivals` with a closure that reads only the local `id`. The write `data.rivals[i] = r` comes after it. Safe. Never call `rememberRival` from inside a closure on `data.rivals`.

**Daily behavior.** File: `M/Rivals.swift`. Called after `vendingEndDay()` (section 0.4).

```swift
    /// End Day: hostility pulls back to each rival's base. Creators see the player as competition when the
    /// player's follower tier rises. No money moves. Part C posts callouts from these rivals.
    func rivalsEndDay() -> [String] {
        var rivals = data.rivals
        guard !rivals.isEmpty else { return [] }
        let tier = hasAccount ? followerTier : 0
        let rose = tier > data.retail.followerTierMark
        var lines: [String] = []
        for i in rivals.indices {
            rivals[i].hostility += (rivals[i].baseHostility - rivals[i].hostility) * Balance.rivalHostilityPull
            if rose, rivals[i].kind == .creator {
                rivals[i].hostility = min(1, rivals[i].hostility + Balance.rivalCreatorTierRise)
            }
        }
        if rose, let loudest = rivals.filter({ $0.kind == .creator }).max(by: { $0.hostility < $1.hostility }) {
            lines.append("\(loudest.name) (\(loudest.handle)) noticed your channel grow. Creators see you as competition now.")
        }
        data.rivals = rivals
        if rose { data.retail.followerTierMark = tier }
        return lines
    }
```

Exclusivity: the loop changes the local `rivals`. `tier` and `rose` are read before the loop. Safe.

**Rival lines at the store run and the camp.** File: `M/Rivals.swift`.

```swift
    /// The line under an empty hot batch item.
    func soldOutLine(_ item: ShelfItem, at store: LocalStore) -> String {
        guard item.hot, let rival = rivalAt(store) else { return "Sold out." }
        return "Already gone. \(rival.name) got here first with three carts."
    }

    /// The camp line: who was in line.
    func campRivalLine(_ store: LocalStore, success: Bool) -> String? {
        guard let rival = rivalAt(store), PriceCycle.unit("camp-\(store.rawValue)-\(data.day)") < Balance.rivalCampChance else { return nil }
        return success ? "\(rival.name) was behind you in line and left with less."
                       : "\(rival.name) and two friends were at the front of the line."
    }
```

In `camp(_:)` (Camping L86-103): on a bust, append `campRivalLine(store, success: false)` to the log line. On a success with a rival line, call `rememberRival(rival.id, .playerBeatInLine, note: "You beat \(rival.name) at the \(store) restock", byPlayer: true, hostility: Balance.rivalBeatInLineHostility)`. `CampHaul` gets `var rivalLine: String? = nil` for `CampView`.

On a bust with a rival, also record `rememberRival(..., .rivalTookShelf, ..., byPlayer: false)`. This gives Part C the full history of meetings.

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

Exclusivity: `pickShowRival()` runs before the write `data.shows[i].rivalID = rival.id`, because the `if let` binds it first. Safe.

- `ShowSession` (L719 on): add two `let` properties set in `init(venue:store:show:vendors:regulars:)` (L803-829):

```swift
    /// The rival at a nearby table, and the in-print sealed items that the rival also lists.
    let rival: Rival?
    let rivalItems: Set<UUID>
    ...
        rival = show?.rivalID.flatMap { store.rival($0) }
        rivalItems = rival == nil ? [] : Set(stock.sealed.filter { SetLibrary.product($0.productID)?.isInPrint == true }.map(\.id))
```

- `makeVisitor()`: after L1204 (`if type == .vintageFan ...`) and before L1205 (`top = max(0.25, top)`):

```swift
        if let rival, !item.pc, rivalItems.contains(item.id) {
            let theirs = Self.round(asking(item) * (1 - Balance.rivalUndercut))
            if top > theirs {
                top = theirs
                line = "\(rival.name) has this two tables down for \(money(theirs)). " + line
            }
        }
```

The buyer then never pays more than 95% of the player's ask for an in-print sealed item that the rival also lists. This gives the D/02 risk "other flippers undercutting your prices" a mechanic.

**UI.**

1. `RivalsBox` (`Hub/FlipperViews.swift`), inside `FlipperMarketBox`: one row for each rival. Name and handle, kind ("Flipper · Target, GameStop" or "Creator"), a mood word from hostility (under 0.3 "Neutral", under 0.6 "Wary", else "Hostile") in `Theme.muted`, `Theme.orange`, or `Theme.red`, and the newest memory note in a caption. Hidden until the player has met a rival (`lastSeenDay >= 0`), so the box does not list strangers.
2. `StoreRunView`: the "Gone" row text (section 1.2).
3. `CampView`: the rival line in place of "The shelf is yours before the scalpers".
4. The show: the rival line reaches the player through the visitor's line text. The show setup screen shows a `Banner` (cyan) "\(rival.name) set up two tables down with sealed product." when `session.rival != nil`. The file is `Show/ShowDayView.swift`; place it in the setup phase header.

**Tests.** No separate check. T10 seeds rival memory before the 14-day run, so `rivalsEndDay` loops over a non-empty array.

### 2.4 Scalper heat

**Values.** `data.scalperHeat` (global, read by Parts B and C) and `data.retail.storeHeat` (per chain, drives bans).

**`addHeat`.** File: `M/Flippers.swift`.

```swift
    /// Adds heat for a shady retail act. `store` nil is a bot act online: global heat only.
    /// 10 heat at one chain gets the player refused there for 7 days.
    func addHeat(_ amount: Double, at store: LocalStore?, act: HiddenActKind, note: String) {
        data.scalperHeat += amount
        recordHiddenAct(act, weight: amount, note: note)
        guard let store else { return }
        let key = store.rawValue
        let heat = (data.retail.storeHeat[key] ?? 0) + amount
        guard heat >= Balance.storeBanHeat else {
            data.retail.storeHeat[key] = heat
            return
        }
        let until = data.day + Balance.storeBanDays
        data.retail.storeHeat[key] = heat * Balance.heatAfterBan
        data.retail.bannedUntil[key] = until
        let text = "\(store.rawValue) staff know your face now. They refuse to sell you cards until \(GameCalendar.date(until).text)."
        retailNotice = text
        log(text)
        recordHiddenAct(.storeBan, weight: Balance.heatStoreBanWeight, note: "Refused card sales at \(store.rawValue)")
    }
```

**Decay.** File: `M/Flippers.swift`, inside `flippersEndDay()`:

```swift
    private func heatEndDay(day: Int) -> [String] {
        data.scalperHeat *= Balance.heatKeep
        var retail = data.retail
        retail.storeHeat = retail.storeHeat.mapValues { $0 * Balance.heatKeep }.filter { $0.value >= 0.1 }
        let ended = retail.bannedUntil.filter { $0.value < day }.map(\.key)
        for key in ended { retail.bannedUntil[key] = nil }
        data.retail = retail
        return ended.sorted().map { "\($0) sells you cards again." }
    }
```

Exclusivity: all closures run on the local `retail` and read only `day` or the element. Safe.

**Sources of heat.** A hot buy at the full limit: +1 (section 1.2). The first buy on a repeat visit: +2 (section 1.2). A checkout bot use: +3 (sections 1.5 and 2.6). The heat is hidden. No view shows the number. The player sees only the ban and Part C's callouts.

**Save compatibility.** Both values default to 0.

**Tests.** T3: with 9.5 heat at Target, one hot buy at the limit bans the player, and the next `buyShelf` at Target fails.

**Interactions.** Part C reads `data.scalperHeat` for the "greed" secret at 10 or more. A ban blocks the store run shelf and the camp at that chain only.

### 2.5 Flip-margin line on the expected value readout

The game already charges platform fees on sealed sales (corrections at the top). No new fee.

File: `M/Flippers.swift`.

```swift
    /// What a flip on eBay nets: the market price, less the cost, the eBay fee, and the shipping.
    func flipMargin(market: Double, cost: Double) -> Double {
        let c = saleCosts(price: market, channel: .ebay, sealed: true, insured: false)
        return market - cost - c.fees - c.shipping
    }
```

`saleCosts` (the instance method, [M/Upgrades.swift L234-239](../../app/PokeVendor/Model/Upgrades.swift)) applies the shipping kit.

**UI.** Only with the `evReadout` upgrade:

1. `SealedDetailView` "Prices" box (`Inventory/DetailViews.swift` L481-494): add `StatCell(label: "Flip on eBay", value: money(m), color: m >= 0 ? Theme.green : Theme.orange)` with `m = store.flipMargin(market: store.market(of: item), cost: item.paid)`. Extend the caption at L490: "Flip on eBay: the market price less what you paid, the eBay fee, and the shipping."
2. `StoreRunView` shelf rows (`Buy/StoreRunViews.swift` L155) and `CampView` rows (`Hub/OpportunityView.swift` L105): add `" · flip \(money(store.flipMargin(market: item.product.market, cost: item.price)))"`.

**Tests.** No check: display only.

### 2.6 Checkout bot (dark upgrade) and the Target.com drop

**Upgrade.** File: `M/Upgrades.swift`.

- Enum (L5-47): add `/// A checkout bot: better online drop odds, more cancellations, and scalper heat (Model/Flippers.swift).` `case checkoutBot`.
- `name`: `"Checkout bot"`. `detail`: `"Doubles your Pokemon Center odds to 60% and gives two Target.com attempts. Stores cancel 35% of bot orders, and each use leaves a trace."` `icon`: `"cpu"`. `requires`: nil.
- `upgradeCosts` (L198-207): `.checkoutBot: 400`.
- `UpgradesView` "Buying" box (L46-57): `upgradeRow(.checkoutBot)` after `.restockBot`. The row needs no special color. The detail text states the risk.

Exhaustive switches over `Upgrade` exist in `name`, `detail`, and `icon`. The compiler finds each one.

**Pokemon Center.** `attemptDrop(_:bot:)` (section 1.5). `StoreView` (`Buy/BuyViews.swift`): the confirmation dialog (L133-138) gets a second button when the player owns the bot: `Button("Try with the bot · \(total)") { purchase(offer, bot: true) }`. `purchase(_:)` (L170-190) gets `bot: Bool = false` and passes it to `attemptDrop`.

**Target.com drop.** File: `M/RetailOnline.swift`.

```swift
    /// Target.com restocks most on Fridays, overnight. One hot in-print product at MSRP, 1 unit.
    func targetDrop(day: Int) -> StoreOffer? {
        var r = SeededRandom(seed: (UInt64(day + 1) &* 32_452_867 &+ 4_049) ^ data.marketSeed)
        let chance = day % 7 == 4 ? Balance.targetDropFridayChance : Balance.targetDropOtherChance
        guard r.double(0...1) < chance else { return nil }
        let pool = SetLibrary.catalog.filter { ["Elite Trainer Box", "Booster bundle", "Collection", "Tin", "Blister"].contains($0.kind)
                                               && $0.isInPrint && !$0.isStoreExclusive && $0.isHot() }
        guard !pool.isEmpty else { return nil }
        let p = pool[r.int(0...(pool.count - 1))]
        guard let price = p.retailMSRP() else { return nil }
        return StoreOffer(id: "tgt-\(day)", store: .amazon, item: .product(p, p.homeSlug), price: price, shipping: 0,
                          deliveryDays: Balance.targetDeliveryDays, note: "Target.com · limit 1")
    }

    var targetAttemptsLeft: Int {
        let used = data.retail.targetAttemptDay == data.day ? data.retail.targetAttempts : 0
        return (hasUpgrade(.checkoutBot) ? Balance.targetBotAttempts : Balance.targetAttempts) - used
    }

    /// One Target.com attempt. With the bot, the second attempt is open and each attempt adds heat.
    func attemptTargetDrop(_ offer: StoreOffer, bot: Bool) -> Bool {
        let useBot = bot && hasUpgrade(.checkoutBot)
        guard targetAttemptsLeft > 0, useBot || targetAttemptsLeft > (hasUpgrade(.checkoutBot) ? 1 : 0),
              !data.boughtToday.contains(offer.id), canAfford(offer.price), let p = offer.product else { return false }
        var retail = data.retail
        retail.targetAttempts = retail.targetAttemptDay == data.day ? retail.targetAttempts + 1 : 1
        retail.targetAttemptDay = data.day
        data.retail = retail
        if useBot { addHeat(Balance.heatBotUse, at: nil, act: .checkoutBot, note: "Used a checkout bot on Target.com") }
        guard Double.random(in: 0..<1) < Balance.targetDropSuccess else {
            log("Missed the Target.com drop for \(p.name).")
            save()
            return false
        }
        data.boughtToday.append(offer.id)
        addLedger(-offer.price, .sealed, "\(p.name) · Target.com")
        let item = SealedItem(setSlug: p.homeSlug, name: p.name, packs: p.packs, paid: offer.price, acquired: .now,
                              source: "Bought on Target.com", productID: p.id,
                              status: .arriving(daysLeft: Balance.targetDeliveryDays, from: "Target.com"), acquiredDay: data.day)
        data.sealed.append(item)
        addDropOrder(item: item, source: "Target.com", bot: useBot, refund: offer.price)
        log("Bought \(p.name) on Target.com for \(money(offer.price)).", cash: -offer.price)
        save()
        return true
    }
```

The rule: without the bot, the player has 1 attempt. With the bot owned, the player has 2 attempts, and the second needs the bot. `StoreOffer.store` is a `Storefront`, and Target.com is not one. The offer uses `.amazon` only to fill the field. No code path reads `store` for this offer: the purchase goes through `attemptTargetDrop`, not `buy(_:)`, and the status is `.arriving(from: "Target.com")`. This avoids a new `Storefront` case, which would touch the exhaustive switches in `Market.offers` (L102), `BuyView.status` (L72-82), and `StoreView.header` (L141-149).

**UI.** `ChainSitesView` section 3 "Target.com · most drops on Friday nights": the offer row (reuse `OfferRow` from `Buy/BuyViews.swift` L193-245 with `bought:` and `locked: targetAttemptsLeft == 0`), the text `"\(targetAttemptsLeft) attempt\(s) left today · success \(Int(Balance.targetDropSuccess * 100))%"`, and buttons `Try` and, with the bot, `Try with the bot`. With no drop: `"No Target.com drop today."`. A `Banner` shows the result.

**Tests.** T4 also covers a forced Target.com order cancellation through the same `cancelOrder` path, so no separate check.

**Interactions.** Bot use writes heat and the `checkoutBot` hidden act on every attempt. A bot order has a 35% cancellation chance. The drop-alert Discord ($60) and the restock alert bot ($150) stay the clean options.

---
## 3. More mechanics that the notes support

The report recommends seven rows. This part covers the five that the dispatch assigns. The other two rows (the opened-at-MSRP offer at a game shop, and a store break-in scaled by stored value) are recommended too, but they are not in Part A's list. Part B touches the break-in through case value. See "Questions and decisions". The report advises against three ideas (fast-food promo week, "Lucky Box" machines, Japan rules). This plan adds none of them.

### 3.1 Shows that ban in-print sealed

**Model.** File: `M/Shows.swift`.

- `CardShow` (L20-38): add `/// The show bans sealed product that is for sale at retail now (docs/20-card-shows.md). Optional, so old saves still load.` `var noInPrintSealed: Bool?`.
- `scheduleShows()` (L83-103), after the `venue` line (L94), with a separate seed so the existing names and venues do not change:

```swift
                    var ban = SeededRandom(seed: UInt64(day) &* 7_919 &+ 613)
                    var show = CardShow(name: name, venue: venue, size: size, startDay: day)
                    show.noInPrintSealed = ban.double(0...1) < Balance.noInPrintSealedShare
                    data.shows.append(show)
```

Shows that an old save already planned keep `nil`, which reads as no ban.

- A helper on `GameStore`: `func bannedAtShow(_ item: SealedItem, show: CardShow?) -> Bool { show?.noInPrintSealed == true && SetLibrary.product(item.productID)?.isInPrint == true }`.
- `ShowSession.init` (L816-817): build `bring` from stock that passes the rule, so the default load holds no banned item:

```swift
        let banned = { (s: SealedItem) in store.bannedAtShow(s, show: show) }
        bring = Set(stock.cards.filter { !$0.pc }.map(\.id) + stock.sealed.filter { !$0.pc && !banned($0) }.map(\.id))
```

- `stockItems` (L881-884): filter out the banned sealed items for a show venue:

```swift
    var stockItems: [ShowItem] {
        guard venue.kind != .store else { return store.showItems(store.storeStock) }
        let s = store.showStock
        return store.showItems((s.cards, s.sealed.filter { !store.bannedAtShow($0, show: show) }))
    }
```

Exclusivity: these closures read `store.data` but mutate nothing (`bring` is a `ShowSession` property, not `data`). Safe.

- Floor vendors at a banned show sell no in-print sealed. In `convenience init(show:store:)` (L790-801), after `VendorFloor.tables(...)`, drop vendor items whose goods are `.sealed(p)` with `p.isInPrint` when `show.noInPrintSealed == true`. The sealed dealer then carries only older sealed.

**UI.** Where a show row shows its size and fee (the calendar and `ShowDetailView`), add a tag `"No in-print sealed"` in `Theme.orange`. The packing screen of a banned show adds a caption: `"This show bans sealed product that stores sell now. Bring singles, slabs, or out-of-print sealed."`.

**Tests.** No check. The rule moves no money. T10's 14-day run starts a booked test show (`addTestShow`), and that show has `noInPrintSealed == nil`, so the existing `play()` load checks still hold.

### 3.2 Official card vending machines as a stock source

These are TPCi machines in stores, not the player's own machines (`M/Vending.swift`). File: `M/Camping.swift`.

```swift
/// An official Pokemon card machine in a store (More mechanics). It posts a restock like a big store.
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

    /// Posted machine restocks: today, and up to 2 days ahead.
    var postedMachineRestocks: [MachineRestock] { ... }   // same shape as postedRestocks (L44-54)

    var machineRestocksNow: [MachineRestock] { postedMachineRestocks.filter { $0.day == data.day } }

    func machineCampBlock(_ r: MachineRestock) -> String? {
        if data.campedDays.contains(r.id) { return "Done for today" }
        guard let start = slot(for: Balance.machineCampHours) else { return "Not enough time today" }
        if start > r.hour + 2 { return worksToday ? "You work today · call in sick or book time off" : "Too late · the machine sold out" }
        return nil
    }

    /// Camps a machine restock for 2 hours. On a success, 1 to 3 products at MSRP, at most 2 of each.
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
    func buyMachineItem(_ item: ShelfItem, machine: OfficialMachine) -> Bool { ... }
    // Same body as `buyShelf` L784-801 without `pay(at:)`, `recordDeal`, and `notePurchase`:
    // guard shelfLeft(item) > 0, canAfford(item.price); addLedger(-item.price, .sealed, "\(name) · card machine");
    // data.shelfBought[item.id] += 1; append SealedItem(source: "Bought at a card machine"); log; save.
}
```

Exclusivity: `campMachine` prunes old `campedDays` keys with the local `suffix`, as `camp(_:)` does (L81-83). A machine key ends with `-<day>`, so each prune also removes old keys of the other kind. Never write `data.campedDays.removeAll { !$0.hasSuffix("-\(data.day)") }`: that reads `data.day` inside a mutation of `data.campedDays`.

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

`camp(_:)` still passes `store:`. `CampView` uses `haul.place` in its texts (L94-95) and branches the buy (L117): `if let m = haul.machine { store.buyMachineItem(item, machine: m) } else if let s = haul.store { store.buyShelf(item, at: s, credit: false) }`.

**Calendar and hub.** `restockEntries(day:)` (Camping L58-64): append machine entries with kind `.restock`, title "\(machine) restock", detail "About \(clock) · wait for 2 hours · limit 2". `HubView` (L197-208): a second `ForEach(store.machineRestocksNow)` with a `ChevronRow` (icon `"square.grid.3x3"`), title "Wait at the \(machine)", detail from `machineCampBlock` or "About \(clock) · 2 hours · limit 2 of each". Line L209 adds `store.machineRestocksNow.isEmpty` to the empty check.

**Tests.** No separate check. T1 covers the shelf limit code that the machine items share.

### 3.3 Missing distributor shipment

The distributor belongs to Part B. Part A owns this one rule. Part B must keep the hook if it rewrites `buyWholesale` (see the contract section).

**Type.** File: `M/RetailOnline.swift`.

```swift
/// A distributor order that never arrived. The refund comes after a claim (More mechanics).
struct MissingShipment: Codable, Identifiable, Hashable {
    var id = UUID()
    let name: String
    /// The day the order was due: the report says it is missing.
    let noticeDay: Int
    let refundDay: Int
    let refund: Double
    var noticed = false
}
```

**Hook.** File: `M/Wholesale.swift`, `buyWholesale` (L84-113). After the short-shipment block (L93-99) and before the loop that appends the units (L100):

```swift
        if Double.random(in: 0..<1) < Balance.wholesaleMissingChance {
            registerMissingShipment(name: "\(cases) case\(cases == 1 ? "" : "s") of \(offer.product.name)",
                                    refund: offer.unitPrice * Double(boxes), dueIn: Balance.wholesaleDeliveryDays)
        } else {
            for _ in 0..<boxes { ... }   // the existing loop L100-105
        }
```

```swift
    /// The order is lost on the way. The player learns on its due day, and the refund comes 14 days later.
    /// Part B calls this from its own order code if it replaces `buyWholesale`.
    func registerMissingShipment(name: String, refund: Double, dueIn: Int) {
        let due = data.day + dueIn
        data.retail.missingShipments.append(MissingShipment(name: name, noticeDay: due,
                                                            refundDay: due + Balance.wholesaleMissingRefundDays, refund: refund))
    }

    func missingShipmentsEndDay() -> [String] {
        let today = data.day
        var lines: [String] = []
        var all = data.retail.missingShipments
        for i in all.indices where !all[i].noticed && all[i].noticeDay <= today {
            all[i].noticed = true
            lines.append("Your \(all[i].name) did not arrive. The distributor's truck never reached you. It opened a claim, and the refund comes in \(Balance.wholesaleMissingRefundDays) days.")
        }
        for s in all where s.refundDay <= today {
            addLedger(s.refund, .wholesale, "Missing shipment refund · \(s.name)")
            lines.append("The distributor refunded \(money(s.refund)) for the missing \(s.name).")
        }
        data.retail.missingShipments = all.filter { $0.refundDay > today }
        return lines
    }
```

Exclusivity: the loops and the filter run on the local `all` and read only `today`. `addLedger` runs in a plain `for` loop over the local. Safe.

Refund category `.wholesale`, positive, as the short-shipment refund (L97). The order cost already counted as a cost, so the refund nets it for income tax.

**UI.** No new view. The lines are in the morning report.

**Tests.** T8 (section 7).

### 3.4 MSRP step

**Model.** `data.retail.msrpStepDay` (section 0.3). File: `M/PriceCycle.swift`.

- Add to `PriceCycle` (near L161-177): `nonisolated(unsafe) private(set) static var msrpStepDay: Int? = nil` and `nonisolated(unsafe) private(set) static var winterScales: [Int: Double] = [:]`.
- `sync(...)` (L179-198): add parameters `msrpStepDay: Int? = nil, winterScales: [Int: Double] = [:]` and store them. The defaults keep every other caller compiling.
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

`sealedFactor` multiplies by `msrpLift` (section 2.2 shows the line).

**Uses of MSRP as a price.** Replace `p.msrp` with `p.retailMSRP()` where it is a price:

| File and line | Now | After |
|---|---|---|
| `M/LocalStores.swift` L119 | big-store price | removed with the old big-store branch; `Market.batch` uses `retailMSRP(day: vendorDay)` |
| `M/Camping.swift` L98 | camp price | `p.retailMSRP() ?? p.market` |
| `M/Market.swift` L121-122 | Pokemon Center price | `let msrp = p.retailMSRP()` |
| `M/Wholesale.swift` L78 | wholesale unit price base | `(p.retailMSRP() ?? p.market) * wholesaleDiscountNow` (Part B owns this file; contract) |
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
        let step = day + Balance.msrpStepNotice
        data.retail.msrpStepDay = step
        return ["Market news: The Pokemon Company raises the price of in-print sealed product by 12.5% in \(Balance.msrpStepNotice) days. Stock you buy before then costs less."]
    }
```

At most once per run: the function never sets the day again after the first announcement. `flippersEndDay` calls `syncMarket()` at its end, so the prices see the new day at once.

**UI.** `FlipperMarketBox` shows "MSRP rises 12.5% in N days" while the step is ahead, and "MSRP rose 12.5% on <date>" after it.

**Tests.** T9 (section 7).

**Interactions.** After the step, the hot ratio uses the higher MSRP, while the market rises only 7.5% (0.6 of the step). Fewer products count as hot. That lowers the drain, the heat, and the flipper sale factor a little. Real graded prices never change: the step touches only sealed retail prices and sealed market factors.

### 3.5 Stronger post-holiday sell-off

**Model.** `data.retail.winterScales` (section 0.3), synced into `PriceCycle.winterScales` (section 3.4).

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

**Lock.** File: `M/Flippers.swift`, first step of `flippersEndDay()`:

```swift
    /// On the first day of the winter dip, lock its size from the pressure: ×1.5 (−15%) at 0.6 or more.
    private func lockWinterScale(day: Int, pressure: Double) -> [String] {
        let bump = Balance.seasonWinterSealedPrice
        let w = PriceCycle.weekOfYear(day: day)
        guard bump.value(week: w) != 0, bump.value(week: PriceCycle.weekOfYear(day: day - 1)) == 0 else { return [] }
        let key = PriceCycle.winterKey(day: day, week: w)
        guard data.retail.winterScales[key] == nil else { return [] }
        let deep = pressure >= Balance.winterSellOffPressure
        data.retail.winterScales[key] = deep ? Balance.winterSellOffScale : 1
        return deep ? ["Market news: Flippers sit on too much holiday stock. The after-holiday sealed dip is deeper this year."] : []
    }
```

The lock happens on the day the bump first becomes non-zero. On every earlier day the bump is 0, so the scale has no effect before the lock. No price jumps. A save from before this change has no scale, so it reads 1, the old rule.

**Tests.** No separate check. T10's 14-day run covers the code path. The existing seasons test (`seasonsAndSave`, GameTests L612) already checks that the season factors stay in range over a year.

---

## 4. Tuning constants

Every constant lives in an `extension Balance` in the file named, as the code does today (for example `M/Camping.swift` L22-33). All values are starting values. The report marks most of them as design values.

| Constant | Value | File | Proposal |
|---|---|---|---|
| `vendorWeekdays` | `1...4` (Tue to Fri) | Retail.swift | 1.1 |
| `vendorHours` | `[8.0, 9.0, 10.0, 11.0]` | Retail.swift | 1.1 |
| `storeOpen`, `storeClose` | 8.0, 22.0 | Retail.swift | 1.1 |
| `batchSize` (per store) | Walmart 30, Target 24, Best Buy 12, GameStop 10, Barnes & Noble 6 | Retail.swift (`LocalStore.batchSize`) | 1.1 |
| `batchProducts` (per store) | Walmart 4...6, Target 3...5, Best Buy 2...4, GameStop 2...4, B&N 1...3, club 2...4 | Retail.swift | 1.1 |
| `batchMinUnits` | 2 | Retail.swift | 1.1 |
| `bigStoreKinds` | Booster pack, Blister, Tin, Booster bundle, Elite Trainer Box, Collection | Retail.swift | 1.1 |
| `hotDrainBase` | 0.5 per hour | Retail.swift | 1.1 |
| `hotDrainPressure` | 1.5 per hour × pressure | Retail.swift | 1.1 |
| `coldDrainRate` | 0.05 per hour | Retail.swift | 1.1 |
| `baseLimit` (per store) | Walmart 5 per visit; Target, GameStop, Best Buy 2 per item a day (1 hot); B&N 2 per visit (1 hot); club 2 per item a day (1 hot) | Retail.swift (`LocalStore.baseLimit`) | 1.2 |
| `incidentChance` | 0.02 × pressure per vendor day | Retail.swift | 1.3 |
| `strictnessDecayDays` | 45 | Retail.swift | 1.3 |
| `closureDays` | 21 | Retail.swift | 1.3 |
| `drawingWinChance` | 0.08 | RetailOnline.swift | 1.4 |
| `drawingWeekday` | 2 (Wednesday) | RetailOnline.swift | 1.4 |
| `drawingDeliveryDays` | 4 | RetailOnline.swift | 1.4 |
| `dropCancelChance` | 0.05 | RetailOnline.swift | 1.5 |
| `dropCancelBotChance` | 0.35 | RetailOnline.swift | 1.5, 2.6 |
| `dropCancelWindow` | `1...3` days | RetailOnline.swift | 1.5 |
| `gameStopHotMarkup` | `1.35...1.6` | Retail.swift | 1.6 |
| `clubFee` | 65 a year | Retail.swift | 1.7 |
| `clubDays` | 364 | Retail.swift | 1.7 |
| `clubBatchSize` | 12 | Retail.swift | 1.7 |
| `clubPricePerPack` | 3.75 | Retail.swift | 1.7 |
| `clubHotPerDay` | 1 | Retail.swift | 1.7 |
| `alertFeeOneChain` | 8 a month | RetailOnline.swift | 1.8 |
| `alertFeeAllChains` | 25 a month | RetailOnline.swift | 1.8 |
| `pressureStart` | 0.5 | Flippers.swift | 2.1 |
| `pressureRange` | `0.1...0.9` | Flippers.swift | 2.1 |
| `pressureHypeNews` | +0.15 once | Flippers.swift | 2.1 |
| `pressureBoomDaily` | +0.002 | Flippers.swift | 2.1 |
| `pressureHoliday` | +0.10 once | Flippers.swift | 2.1 |
| `pressureReprint` | −0.25 once | Flippers.swift | 2.1 |
| `pressureCorrectionDaily` | −0.003 | Flippers.swift | 2.1 |
| `pressurePostHoliday` | −0.10 once | Flippers.swift | 2.1 |
| `pressurePull` | 0.01 a day toward 0.5 (design value, not in the report; it stops a drift to a bound) | Flippers.swift | 2.1 |
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
| `rivalShowMinHostility` | 0.35 | Rivals.swift | 2.3 |
| `rivalShowBase`, `rivalShowSlope` | 0.25, 0.3 | Rivals.swift | 2.3 |
| `rivalUndercut` | 0.05 | Rivals.swift | 2.3 |
| `heatLimitBuy` | 1 | Flippers.swift | 2.4 |
| `heatRepeatVisit` | 2 | Flippers.swift | 2.4 |
| `heatBotUse` | 3 | Flippers.swift | 2.4, 2.6 |
| `heatKeep` | 0.95 a day | Flippers.swift | 2.4 |
| `storeBanHeat` | 10 | Flippers.swift | 2.4 |
| `storeBanDays` | 7 | Flippers.swift | 2.4 |
| `heatAfterBan` | 0.5 | Flippers.swift | 2.4 |
| `heatStoreBanWeight` | 5 | Flippers.swift | 2.4 (Part C weight) |
| `heatBotCancelWeight` | 4 | Flippers.swift | 1.5 (Part C weight) |
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
| `wholesaleMissingChance` | 0.01 | Wholesale.swift (next to L41-43) | 3.3 |
| `wholesaleMissingRefundDays` | 14 | Wholesale.swift | 3.3 |
| `msrpStep` | 0.125 | Flippers.swift | 3.4 |
| `msrpStepChance` | 1.0 / 300 a day | Flippers.swift | 3.4 |
| `msrpStepEarliestDay` | 90 | Flippers.swift | 3.4 |
| `msrpStepNotice` | 28 days | Flippers.swift | 3.4 |
| `msrpMarketShare` | 0.6 | Flippers.swift | 3.4 |
| `msrpRampDays` | 30.0 | Flippers.swift | 3.4 |
| `winterSellOffPressure` | 0.6 | Flippers.swift | 3.5 |
| `winterSellOffScale` | 1.5 (−10% becomes −15%) | Flippers.swift | 3.5 |

Unchanged constants that this plan reads: `campSuccess` 0.6, `campQuantity` 2...6, `restockBotBonus` 0.25, `pokemonCenterSuccessChance` 0.30, `hotProductRatio` 1.2, `arrivalKeep` 0.75, `ebayFeeRate` 0.1325.

---

## 5. Save compatibility summary

| New data | Old save | How |
|---|---|---|
| `flipperPressure`, `scalperHeat`, `rivals`, `retail` on `GameData` | missing keys | `v()` in `GameData.init(from:)` gives the defaults (section 0.2). `seedRivals()` fills the rivals on load. |
| Fields inside `RetailState` | missing keys in a later build | `RetailState.init(from:)` (section 0.3) |
| Fields inside `Rival` | missing keys in a later build | `Rival.init(from:)` (section 2.3) |
| `MarketEvent.products`, `fallDays`; `Kind.flipperDump` | missing keys | optional `var`, synthesized `decodeIfPresent`. An old build that reads a new save fails on the unknown kind, which is the normal one-way rule. |
| `CardShow.rivalID`, `noInPrintSealed` | missing keys | optional `var`, as `promoted` and `goodSpot` (L30-32) |
| `LocalStore.club` | not present | no saved value uses it until the player visits the club |
| `ShelfItem`, `CampHaul`, `DrawingOffer`, `MachineRestock` | not saved | runtime only |
| `shelfBought` SKU keys | not present | new keys in the existing dictionary; End Day resets it |

No migration code is necessary.

---

## 6. End Day order summary

See section 0.4. In short: `printEndDay` → `marketEndDay` → **`flippersEndDay`** (winter lock, dump, pressure, strictness, heat, MSRP step, `syncMarket`) → resets → **`resetRetailDay`** → `decayStanding` → `advanceSealed` → **`retailOrdersEndDay`** (drawings, cancellations, missing shipments) → ... → `vendingEndDay` → **`rivalsEndDay`** → ... → `businessCostsEndDay` → **`alertsEndDay`** (fee on the 1st, tomorrow's vendor alerts).

---

## 7. Tests for `Hub/GameTests.swift`

Add one group `timed("retail", retail)` in `run()` (L17-46), before `timed("days", days)`. Each check below moves money or items, or guards an exclusivity path. The group plays no End Day except T4, T5, and T8, which play one each. The added time is well under 100 ms.

```swift
    // MARK: - Big stores, limits, heat, and online orders (research_notes/Sealed product code proposal/part_a)

    private func retail() {
        fresh()
        guard let hot = SetLibrary.catalog.first(where: { $0.isInPrint && $0.msrp != nil && $0.isHot() && Balance.bigStoreKinds.contains($0.kind) }),
              let cold = SetLibrary.catalog.first(where: { $0.isInPrint && $0.msrp != nil && !$0.isHot() && Balance.bigStoreKinds.contains($0.kind) })
        else { return check(false, "the retail test has no hot or cold product") }
        ...
    }
```

| ID | Check | Why it is in the run |
|---|---|---|
| T1 | Target: one hot test item (`ShelfItem(..., quantity: 5, hot: true)`). The first `buyShelf` passes, the second fails. Walmart: after `beginVisit(.walmart)`, five buys of a cold item pass and the sixth fails. After a second `beginVisit(.walmart)`, a buy passes again, and `data.scalperHeat` rose by `heatRepeatVisit`. Club: with no membership a buy fails. After `joinClub()`, the first hot buy passes and a second hot item fails the same day. | Limits move items and money. |
| T2 | Batch carry-over: take a real batch item with `store.shelf(at: .walmart, hour: …)` on its vendor day. Buy one. The same item read one day later at the same hour has `shelfLeft` at most its drained quantity minus 1. A later hour on the same day never shows more units than an earlier hour. | Items: a bought unit must never come back. |
| T3 | Ban: set `data.retail.storeHeat["Target"] = 9.5`. A hot buy at the limit sets `bannedUntil["Target"]`. The next `buyShelf` at Target fails. `campBlock(.target)` is not nil. | Money and items stop at a banned chain. |
| T4 | Cancellation: append a test `SealedItem` with status `.onTheWay(daysLeft: 5, store: .pokemonCenter)`, and add `DropOrder(chance: 1, refund: 50, rollDay: day + 1)`. After one `endDay()`, the item is gone, and the ledger has exactly one entry with the label prefix "Order cancelled" and the amount 50. (Do not compare the cash: other End Day lines, such as a Friday paycheck, also move it.) | Money moves. |
| T5 | Drawing: `resolveDrawing(entry, won: true)` with enough cash takes exactly the price and adds one sealed item with `.arriving`. With cash below the price, it takes nothing and adds nothing. | Money and items move. |
| T6 | Pressure: after the 14-day `days()` run, `data.flipperPressure` is inside `pressureRange`, and `data.retail.pressureLog` has no key older than `pressureLogDays`. | Guards the clamp and the pruning. |
| T7 | `PriceCycle.capDump(jumps: 0.65, dump: 0.8)` equals 0.55, and `capDump(jumps: 1.2, dump: 0.9)` equals 1.08. | Guards the 45% cap on sealed prices. |
| T8 | Missing shipment: `registerMissingShipment(name: "test", refund: 120, dueIn: 0)` with `refundDay` set to the next day. After one `endDay()`, the ledger has exactly one "Missing shipment refund" entry of 120, and `missingShipments` is empty. | Money moves once. |
| T9 | MSRP step: set `data.retail.msrpStepDay = data.day` and `syncMarket()`. `hot.retailMSRP()` equals `Market.retail(msrp × 1.125)`. A Walmart batch item read today costs its `retailMSRP(day: vendorDay)`. Reset the step afterward. | Retail prices move money. |
| T10 | Exclusivity: in `days()` (L658-722), before the 14-day loop, seed non-empty state: one `DrawingEntry` with `drawDay` = day + 2, one `DropOrder` with `rollDay` = day + 3, one `MissingShipment` due in 4 days, one memory on each rival, `storeHeat["Walmart"] = 3`, `bannedUntil["GameStop"] = day + 2`, and `strictness["Target"] = ChainStrictness(level: 1, lastChange: day - 44)`. The loop then runs every new closure on a non-empty array. Also call `store.startStoreRun([.walmart])` on day 1 and buy one batch item if the shelf has one. | The exclusivity crash shows only with non-empty arrays (memory: project_exclusivity_and_soak). |

T10 adds no `check` call by itself. A crash fails the run.

The run must stay near 2 s. The added work is about 30 shelf reads, 3 End Days, and some state setup.

---

## 8. Doc updates

| Doc | Change |
|---|---|
| `docs/12-acquiring-product.md` | "Pokemon Center drops" (L52): the cancellation roll (5%, 35% with the bot), the bot attempt (60%). New subsection after it: "Big-store sites": the Walmart Collectibles Draw (weekly, 8%, a win charges at once) and the Target.com drop (Friday-heavy, 20%, 1 attempt or 2 with the bot). "Camp a store drop" (L70): the chain cap on each product, the pressure factor, the rival lines, and the official card machines (2 hours, limit 2). "Local stores" (L88): vendor days, batch sizes, the drain formula, the limit table, the strictness ladder, the ban, the GameStop markup, the club store. Fix L83-86: "other buyers get the stock first" is now modeled. "Open topics" (L343): remove "the stock odds per store" and "Exact restock-alert-bot design". |
| `docs/05-pricing-and-market.md` | "Market news" (L169): the flipper dump, the MSRP step. A new subsection "Flipper pressure" after "Market news": the inputs and the four effects. "Print runs" (L182): a reprint wave lowers the pressure and can start a dump; the 45% cap. "Seasons" (L225): the deeper winter dip at pressure 0.6 or more. |
| `docs/09-upgrades.md` | "Buying" (L79): the checkout bot. "Restock alerts" (monthly tiers, not an upgrade) as a note in "On other screens" (L138). "Selling and shows" (L50): the EV readout adds the eBay flip line. |
| `docs/17-calendar-and-events.md` | "Posted entries" (L76): machine restocks; alert vendor days. "Surprise entries" (L160): the Target.com drop and drawing results. "A typical week" (L180): vendor days Tuesday to Friday. |
| `docs/20-card-shows.md` | "Shows on the calendar" (L12): 1 show in 6 bans in-print sealed. "Visitors at the table" (L57): a rival flipper at a nearby table holds buyers to 95% of the ask on in-print sealed. |
| `docs/19-prototype-values.md` | "Buying" (L19), "Store run and game shops" (L60), "Meets, sales, camping, and opportunities" (L314), "Wholesale, splits ..." (L356), "Upgrades" (L366), "The moving market" (L560), "Seasons" (L572): the values from section 4. Also fix the stale lines that `current_game_systems.md` found (L66-67 game shop odds; L563-570 moving market). |
| `docs/02-playstyles.md` | Flipper archetype risk (L17-45): "other flippers undercutting your prices" now points to rivals at shows and the online sale factor. |
| `docs/26-taxes.md` | The club fee and the alert fee are business costs. Refunds of cancelled orders and missing shipments net the cost. |
| New `docs/34-flippers-and-retail-limits.md` | One page: vendor days, limits, strictness, heat, rivals, pressure, dump. The number 34 may collide with a new doc from Part B or Part C. The three parts must agree on the numbers before the build. |
| `docs/00-overview.md` | Add the new doc to the index. |

Write all doc text in STE, as the existing docs are.

---

## 9. Interactions and risks

**Camping.** Camping keeps its posted restock every 14 days, separate from the hidden weekly vendor day. A camp is a visit, so a store run to the same chain later that day is a repeat visit. The camp haul obeys the chain cap, the level-3 drawing rule, and the ban. Risk: the player sees two stock systems at one chain. The planner text says "vendor stock" and the hub says "restock". Keep the words apart.

**Store run.** The run block is spent at the start. The arrival hour of each stop comes from the session start hour. Risk: the first stop of a 7 AM run is before every vendor hour, so it always shows last week's leftovers. That is intended: arrival time matters.

**PriceCycle and booms.** A boom raises the pressure by 0.002 a day (about +0.4 over a 200-day boom, held back by the pull). A correction start can start a dump. Risk: a long boom keeps the pressure near 0.8, so camping drops to about 0.72 of today's odds. Watch this in `-marketsim`.

**Reprints.** A reprint that reaches shelves lowers the pressure by 0.25 and can start a dump. Reprinted products enter the vendor batches. The 45% cap holds the reprint and the dump together.

**Calendar.** Alert vendor days and machine restocks use the existing `.restock` entry kind. No new kind.

**Demand.** `flipperSaleFactor` multiplies the existing channel, item, and season demand for hot in-print sealed on eBay and TCGplayer. Own-store sales, show sales, Facebook offers, and lots do not use it.

**Relationships.** Rivals are not contacts. They do not use contact book room.

**Reputation.** Part A changes no reputation directly. A ban, bot use, and heat reach reputation only through Part C's callouts.

**Challenge cash.** Every new cost and income goes through `addLedger`, the one cash balance. No second wallet. No buy toggle.

**Taxes.** Club and alert fees are `.businessCosts`. Refunds are positive entries in the cost's own category, so the net cost is right.

**Performance.** `shelf(at:hour:)` filters the catalog once per call, as `Market.shelf` does today. `drainShare` loops over at most 8 days. `msrpLift` returns at once before the step. Risk: `Product.isHot(day:)` reads a past-day market factor for each batch product. The walk checkpoints keep that cheap.

**Economy.** The batches put far more MSRP stock on big-store shelves than today. The limits (1 or 2 of each hot item) and the drain hold the player's share. Risk: a player who runs every chain every vendor day gets about 8 hot units a week at MSRP. With heat at 1 per limit buy and 0.95 decay, five chains build heat at about 1 a week each, so a ban comes only with repeat visits or a bot. Tune `storeBanHeat` with play.

**Rejected features.** No slab cracking, no Japanese product, no preorders, no new set releases (every drawing, drop, batch, and machine sells existing in-print catalog products), no group breaks. Real graded prices never change.

**No flashes.** No new view uses a full-screen white or bright flash. Results show as `Banner` views in the existing theme colors.

---

## 10. Contracts and questions

### What Part A provides to Parts B and C

| Item | Type | Notes |
|---|---|---|
| `data.flipperPressure` | `Double`, 0.1 to 0.9 | Start 0.5. Changes once a day in `flippersEndDay`. |
| `data.scalperHeat` | `Double`, 0 up | Global. Decays 5% a day. 10 at one chain bans the player there (per-chain heat is `data.retail.storeHeat`). |
| `data.rivals` | `[Rival]` | `id`, `name`, `handle`, `kind` (`.flipper`, `.creator`), `hostility` 0 to 1, `baseHostility`, `credibility` 0 to 1, `memory: [RivalMemory]` (last 3, `byPlayer` marks the player's acts against the rival), `grudges`, `homeStores`, `lastSeenDay`. |
| `rival(_:)`, `rivalAt(_:)`, `rememberRival(_:_:note:byPlayer:hostility:)`, `changeRivalCredibility(_:by:)` | functions | Part C must change rivals only through these, so the memory cap and the clamps hold. |
| `Product.isHot(day:)`, `Product.retailMSRP(day:)` | functions | Use these in place of `msrp` for prices and the hot test. |
| `registerMissingShipment(name:refund:dueIn:)` | function | For Part B's order code. |

### What Part A needs from Part C

1. `HiddenActKind` cases: `limitBuyout`, `repeatVisit`, `checkoutBot`, `storeBan`, `botOrderCancelled` (section 0.6).
2. `recordHiddenAct` must not read `data` inside a closure that mutates `data`, and it must be safe to call from `buyShelf`, `attemptDrop`, and End Day hooks.
3. Part C extends the existing weekly "rival vendor" story (Haggling.swift L170-175) into callouts. It should pick the rival from `data.rivals` and record the meeting with `rememberRival(..., .rivalCalledOut, byPlayer: false)`.

### What Part A needs from Part B

1. Keep the missing-shipment hook. If Part B replaces `buyWholesale` (Wholesale.swift L84-113) or delivers cases as items, it must roll `Balance.wholesaleMissingChance` once per order and call `registerMissingShipment` in place of the delivery.
2. Use `product.retailMSRP()` for the wholesale unit price (Wholesale.swift L78) and `product.isHot()` for the hot test, so the MSRP step reaches wholesale.
3. A case item of an in-print product counts as in-print sealed for the show ban (section 3.1). `bannedAtShow` reads `productID`. If a case uses a different product ID, Part B must make `bannedAtShow` treat it as its unit product.

### Questions and decisions for AJ

These are not blockers. The plan uses the choice shown.

1. **Target.com.** Proposal 2.6 says the bot "allows two Target.com attempts", but the game has no Target.com. The plan adds a small Target.com drop (Friday-heavy, 20% success, 1 attempt, 2 with the bot) inside the new "Big-store sites" screen. The other choice is to drop the Target.com part and keep only the Pokemon Center effect of the bot.
2. **Repeat-visit heat.** The plan adds the +2 only when the player buys on a second visit to a chain that day, not for a visit to look.
3. **Club price.** Many club bundles have a catalog MSRP far under their real club price. The plan uses a floor of $3.75 for each pack. No catalog value changes.
4. **Two recommended rows outside Part A's list.** The opened-at-MSRP offer at a game shop and the store break-in scaled by stored value are recommended in the report but not assigned to Part A. Assign them to a part, or defer them.
5. **Doc number.** `docs/34-...` may collide with a new doc from Part B or Part C.
