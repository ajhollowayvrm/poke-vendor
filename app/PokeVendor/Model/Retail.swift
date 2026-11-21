import Foundation

/// The strictness of one chain (proposal 1.3). Level 0 is the base limit. Level 4 stops in-store card sales.
/// A new field must be Optional. This type decodes inside an array or a dictionary, so a missing key drops all of it.
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
/// A new field must be Optional. This type decodes inside an array or a dictionary, so a missing key drops all of it.
struct BatchBuy: Codable, Hashable {
    let vendorDay: Int
    var count: Int
    /// True when the player's buy took the last unit. No rival line then blames a rival.
    var emptied: Bool? = nil
}

/// A drawing that the player won. The player pays and claims it on the hub, or it lapses (D-11).
/// A new field must be Optional. This type decodes inside an array or a dictionary, so a missing key drops all of it.
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
    /// The day of the last limit-hit heat at each chain. That heat counts once for each chain each day.
    var limitHeatDay: [String: Int] = [:]
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
        limitHeatDay = v(.limitHeatDay, limitHeatDay)
    }
}

extension Balance {
    /// Flipper pressure at the start of a run. Phase 0 needs it for the `GameData` default.
    /// The flipper system (Model/Flippers.swift) uses it from phase 2.
    static let pressureStart = 0.5

    /// A big store gets its vendor on one weekday from Tuesday to Saturday (0 is Monday), at one of these hours.
    static let vendorWeekdays = 1...5
    static let vendorHours: [Double] = [8, 10, 13, 16]
    /// The open hours of a big store. The drain runs only inside them. (`storeOpen` is the hours of the own store.)
    static let chainOpen = 8.0
    static let chainClose = 22.0
    /// Each product in a batch holds at least this many units.
    static let batchMinUnits = 2
    static let bigStoreKinds = ["Booster pack", "Blister", "Tin", "Booster bundle", "Elite Trainer Box", "Collection"]
    /// The drain of a hot batch item each open hour is `hotDrainBase + hotDrainPressure * pressure`. Other items drain slowly.
    static let hotDrainBase = 0.2
    static let hotDrainPressure = 0.6
    static let coldDrainRate = 0.05
    /// A vendor-day incident: the chance is `incidentChance * pressure`, plus the boost from the player's own buyouts.
    static let incidentChance = 0.05
    static let incidentBoostPerBuyout = 0.03
    static let incidentBoostKeep = 0.9
    static let strictnessDecayDays = 90
    static let closureDays = 21
    /// GameStop sells hot product over MSRP.
    static let gameStopHotMarkup = 1.35...1.6
    /// The club store.
    static let clubFee = 65.0
    static let clubDays = 364
    static let clubBatchSize = 12
    static let clubPricePerPack = 3.75
    static let clubHotPerDay = 1
}

extension Balance {
    /// The MSRP step (Part A 3.4): the rise of the retail price, the share of it that reaches the market price of
    /// in-print sealed, and the days that share takes. Phase 2 adds the chance and the notice time.
    static let msrpStep = 0.125
    static let msrpMarketShare = 0.6
    static let msrpRampDays = 30.0
}

extension Product {
    /// In print on a given day. The batch uses the vendor day, so a print change later in the week does not change
    /// a batch that is already on the shelf. `isInPrint` stays for the reads of today.
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

    /// Hot: the market on the day is `Balance.hotProductRatio` times the MSRP or more.
    func isHot(day: Int? = nil) -> Bool {
        guard let m = retailMSRP(day: day), m > 0 else { return false }
        return marketPrice(day: day) >= m * Balance.hotProductRatio
    }
}

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

@MainActor
extension Market {
    /// The club price on a day: the MSRP, but never under `Balance.clubPricePerPack` for each pack.
    nonisolated static func clubPrice(_ p: Product, day: Int) -> Double {
        max(p.retailMSRP(day: day) ?? 0, Double(p.packs) * Balance.clubPricePerPack)
    }

    /// The products that a big-store batch can hold: the tests that never change, run once. A shelf read then only
    /// tests the print status. Store exclusives (Pokemon Center and club items) never enter a big-store batch.
    private static let bigStorePool = SetLibrary.catalog.filter {
        $0.msrp != nil && $0.packs <= 11 && Balance.bigStoreKinds.contains($0.kind) && !$0.isStoreExclusive
    }
    private static let clubPool = SetLibrary.catalog.filter(\.isClubExclusive)

    /// The full batch of a big store or the club on its vendor day, before any drain. The same run and day always
    /// give the same batch: the pool uses the print status on the vendor day, and each item ID holds its product ID.
    /// `seed` is the run's market seed, so each run has its own batches. A vendor day before day 0 is allowed, so the
    /// shelf on the first days of a run shows leftovers.
    static func batch(_ store: LocalStore, vendorDay: Int, seed: UInt64) -> [ShelfItem] {
        guard store.batchSize > 0 else { return [] }
        let salt = UInt64(LocalStore.allCases.firstIndex(of: store) ?? 0) + 11
        var r = SeededRandom(seed: (UInt64(bitPattern: Int64(vendorDay + 1)) &* 15_485_863 &+ salt &* 3_571) ^ seed)
        let options = (store.isClub ? clubPool : bigStorePool).filter { $0.inPrint(on: vendorDay) }
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
            // A club item with no MSRP uses its club price for the hot test.
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

@MainActor
extension GameStore {
    /// The fixed vendor slot of a store for this run. `PriceCycle.unit` mixes the run's market seed.
    func vendorSlot(_ store: LocalStore) -> (weekday: Int, hour: Double) {
        let d = PriceCycle.unit("vendor-day-" + store.rawValue)
        let h = PriceCycle.unit("vendor-hour-" + store.rawValue)
        let days = Balance.vendorWeekdays
        let hours = Balance.vendorHours
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
    /// drains at `0.2 + 0.6 * pressure` an hour, with the pressure of each day. Other items drain at 0.05 an hour.
    func drainShare(hot: Bool, fromDay: Int, fromHour: Double, toDay: Int, toHour: Double) -> Double {
        guard toDay >= fromDay else { return 1 }
        let history = data.retail.pressureLog
        let now = data.flipperPressure
        var total = 0.0
        for d in fromDay...toDay {
            let open = max(Balance.chainOpen, d == fromDay ? fromHour : Balance.chainOpen)
            let close = min(Balance.chainClose, d == toDay ? toHour : Balance.chainClose)
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

    /// The end of the day: today's visit state clears. Old batch entries and the pressure log are pruned.
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

    /// Today's pressure goes into the log when it has no entry, so the drain of a new run or an old save reads a real value.
    func seedPressureLog() {
        if data.retail.pressureLog[data.day] == nil { data.retail.pressureLog[data.day] = data.flipperPressure }
    }

    // MARK: - Limits

    func strictness(_ store: LocalStore) -> ChainStrictness { data.retail.strictness[store.rawValue] ?? ChainStrictness() }

    func isBanned(_ store: LocalStore) -> Bool { (data.retail.bannedUntil[store.rawValue] ?? -1) >= data.day }

    var isClubMember: Bool { (data.retail.clubUntil ?? -1) >= data.day }

    /// A product's daily count at a chain. It lives in `shelfBought`, which End Day resets.
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

    // MARK: - Visits

    /// A visit starts. Counts it, notes the vendor weekday when the player sees a fresh batch (A-S1), and writes the
    /// rival lines (D-10). A camp passes `lines: false`: its haul has no batch items to show.
    func arrive(at store: LocalStore, hour: Double, lines: Bool = true) {
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
        if lines { writeVisitLines(store, hour: hour) }
    }

    /// Rival lines for the hot batch items that a rival emptied before this moment: the drain took at least one
    /// unit, nothing is left, and the player did not take the last unit. One receipt roll for each line.
    func writeVisitLines(_ store: LocalStore, hour: Double) {
        let key = store.rawValue
        let marker = "-\(key)-"
        let items = shelf(at: store, hour: hour)
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
        } else if item.hot && limitLeft(item, at: store) == 0 && data.retail.limitHeatDay[key] != today {
            // A hot buy that reaches the chain limit adds a little heat, but it is not a secret (revision 3).
            // It counts once for each chain each day.
            data.retail.limitHeatDay[key] = today
            addHeat(Balance.heatLimitHit, at: store, act: nil)
        }
        if emptied, item.batchDay == today, let rival = rivalAt(store) {
            rememberRival(rival.id, .playerTookShelf, note: "You took the last \(item.product.name) at \(key)",
                          byPlayer: true, hostility: Balance.rivalTookShelfHostility)
        }
    }

    // MARK: - Strictness

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

    static func incidentText(_ store: LocalStore) -> String {
        [
            "A fight broke out at a \(store.rawValue) restock.",
            "Police came to a crowd at a \(store.rawValue) card aisle.",
            "A \(store.rawValue) restock line blocked the parking lot.",
        ].randomElement() ?? "A \(store.rawValue) restock got out of hand."
    }

    static func levelText(_ level: Int) -> String {
        switch level {
        case 1: "one of each item a day"
        case 2: "one checkout a day"
        case 3: "hot product by drawing only"
        default: "no card sales for \(Balance.closureDays) days"
        }
    }

    // MARK: - The club

    @discardableResult
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
}
