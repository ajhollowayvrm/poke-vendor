import Foundation

// The distributor account of a store, and its weekly allocation (docs/12-acquiring-product.md, docs/22-own-store.md).

/// What the player bought from the distributor. The history grows the allocation.
/// It has its own decoder, so a field that an older save lacks never wipes `spent`.
struct DistributorAccount: Codable, Hashable {
    /// The total spent with the distributor over the whole run.
    var spent = 0.0
    /// The week of `cases`.
    var week = -1
    /// The cases bought this week, by product.
    var cases: [String: Int] = [:]
    // The hobby account (Model/Distributor.swift).
    /// The day the player applied, and the day the distributor approved. Nil: not applied, or not approved yet.
    var appliedDay: Int?
    var approvedDay: Int?
    var repContactID: String?
    /// Spend that has not turned into a rep point yet, and the points that spend gave this week.
    var repSpendCarry = 0.0
    var repPointsWeek = -1
    var repPointsThisWeek = 0
    /// The last week that a store event raised the rep relationship.
    var eventWeekCredited = -1
    /// "Push for more allocation": the product, the week it helps, and the day of the last push.
    var pushProductID: String?
    var pushWeek = -1
    var lastPushDay = -1000
    /// The week the Elite priority case was used, and the product it was used on.
    var eliteCaseWeek = -1
    var eliteProductID: String?
    /// False in a save from before the application. The first load grandfathers a store that has an account, then sets it.
    var migrated = true
    /// Hot cases and units from the hobby account, until they leave the 28-day check.
    var hotRecords: [HotAllocationRecord] = []
    /// The day of the last back-door act in the hidden log, so one stretch of sales records one act.
    var lastBackDoorActDay = -1000
    /// The days of back-door warnings, and the penalties. They stay when the store closes.
    var warnings: [Int] = []
    var hotFrozenUntil: Int?
    var closedUntil: Int?

    init() {}

    /// A save from an older build can miss newer fields. Each missing field takes its default.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func v<T: Decodable>(_ key: CodingKeys, _ fallback: T) -> T { (try? c.decodeIfPresent(T.self, forKey: key)) ?? fallback }
        spent = v(.spent, 0)
        week = v(.week, -1)
        cases = v(.cases, [:])
        appliedDay = v(.appliedDay, nil)
        approvedDay = v(.approvedDay, nil)
        repContactID = v(.repContactID, nil)
        repSpendCarry = v(.repSpendCarry, 0)
        repPointsWeek = v(.repPointsWeek, -1)
        repPointsThisWeek = v(.repPointsThisWeek, 0)
        eventWeekCredited = v(.eventWeekCredited, -1)
        pushProductID = v(.pushProductID, nil)
        pushWeek = v(.pushWeek, -1)
        lastPushDay = v(.lastPushDay, -1000)
        eliteCaseWeek = v(.eliteCaseWeek, -1)
        eliteProductID = v(.eliteProductID, nil)
        migrated = v(.migrated, false)
        hotRecords = v(.hotRecords, [])
        lastBackDoorActDay = v(.lastBackDoorActDay, -1000)
        warnings = v(.warnings, [])
        hotFrozenUntil = v(.hotFrozenUntil, nil)
        closedUntil = v(.closedUntil, nil)
    }
}

extension Balance {
    /// A store account buys at this share of MSRP. A player with no store pays `wholesaleDiscount`.
    static let storeWholesaleDiscount = 0.58
    /// The cases of one product that a store account can buy in a week: the base, and one more for each step spent.
    static let allocationBase = 1
    static let allocationStep = 6000.0
    static let allocationMax = 5
    /// A product that is not hot has one more case. A product is hot when its market is this many times its MSRP.
    static let hotProductRatio = 1.2
}

@MainActor
extension GameStore {
    /// An approved hobby distributor account that is not closed (docs/12-acquiring-product.md, Distributor / wholesale).
    var hasStoreAccount: Bool {
        guard storeIsBuilt, data.distributor.approvedDay != nil else { return false }
        if let until = data.distributor.closedUntil, data.day < until { return false }
        return true
    }

    var distributorTier: DistributorTier { hasStoreAccount ? .hobby : wholesaleOpen ? .secondary : .none }

    var wholesaleDiscountNow: Double { hasStoreAccount ? Balance.storeWholesaleDiscount : Balance.wholesaleDiscount }

    /// The allocation replaces the minimum order for a hobby account.
    var wholesaleMinOrderNow: Double { hasStoreAccount ? 0 : Balance.wholesaleMinOrder }

    var distributorSpent: Double { data.distributor.spent }

    func isHot(_ product: Product) -> Bool {
        product.isHot()
    }

    /// The cases of this product that a hobby account can buy in a week. Hot product stays at the base (D-3): only
    /// Elite adds one case.
    func wholesaleCap(_ product: Product) -> Int {
        guard isHot(product) else {
            return min(Balance.allocationMax, Balance.allocationBase + Int(data.distributor.spent / Balance.allocationStep)) + 1
        }
        if hotFrozen { return 0 }
        return Balance.allocationBase + (eliteCaseOpen || eliteCaseUsed(on: product) ? 1 : 0)
    }

    /// The cases the player can still buy this week. Nil when there is no limit.
    func wholesaleLeft(_ offer: WholesaleOffer) -> Int? {
        let account = data.distributor
        let bought = account.week == data.day / 7 ? account.cases[offer.product.id] ?? 0 : 0
        guard hasStoreAccount else {
            let elite = isHot(offer.product) && (eliteCaseOpen || eliteCaseUsed(on: offer.product)) ? 1 : 0
            let week = account.week == data.day / 7 ? account.cases.values.reduce(0, +) : 0
            return max(0, min(1 + elite - bought, Balance.wholesaleCasesPerWeek + elite - week))
        }
        return max(0, wholesaleCap(offer.product) - bought)
    }

    /// Notes the cases of an order in the account. The spend is added only when the order ships.
    func recordWholesale(_ offer: WholesaleOffer, cases: Int) {
        var account = data.distributor
        if account.week != data.day / 7 {
            account.week = data.day / 7
            account.cases = [:]
        }
        account.cases[offer.product.id, default: 0] += cases
        data.distributor = account
    }
}
