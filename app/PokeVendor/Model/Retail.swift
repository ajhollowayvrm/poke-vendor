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

extension Balance {
    /// Flipper pressure at the start of a run. Phase 0 needs it for the `GameData` default.
    /// The flipper system (Model/Flippers.swift) uses it from phase 2.
    static let pressureStart = 0.5
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
