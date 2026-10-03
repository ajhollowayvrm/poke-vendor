import Foundation

// The distributor account of a store, and its weekly allocation (docs/12-acquiring-product.md, docs/22-own-store.md).

/// What the player bought from the distributor. The history grows the allocation.
struct DistributorAccount: Codable, Hashable {
    /// The total spent with the distributor over the whole run.
    var spent = 0.0
    /// The week of `cases`.
    var week = -1
    /// The cases bought this week, by product.
    var cases: [String: Int] = [:]
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
    /// A store account has the better price and the weekly allocation.
    var hasStoreAccount: Bool { storeIsBuilt }

    var wholesaleDiscountNow: Double { hasStoreAccount ? Balance.storeWholesaleDiscount : Balance.wholesaleDiscount }

    /// The allocation replaces the minimum order for a store account.
    var wholesaleMinOrderNow: Double { hasStoreAccount ? 0 : Balance.wholesaleMinOrder }

    var distributorSpent: Double { data.distributor.spent }

    func isHot(_ product: Product) -> Bool {
        guard let msrp = product.msrp, msrp > 0 else { return false }
        return product.market >= msrp * Balance.hotProductRatio
    }

    /// The cases of this product that a store account can buy in a week.
    func wholesaleCap(_ product: Product) -> Int {
        let grown = min(Balance.allocationMax, Balance.allocationBase + Int(data.distributor.spent / Balance.allocationStep))
        return grown + (isHot(product) ? 0 : 1)
    }

    /// The cases the player can still buy this week. Nil when there is no limit.
    func wholesaleLeft(_ offer: WholesaleOffer) -> Int? {
        guard hasStoreAccount else { return nil }
        let account = data.distributor
        let bought = account.week == data.day / 7 ? account.cases[offer.product.id] ?? 0 : 0
        return max(0, wholesaleCap(offer.product) - bought)
    }

    /// Notes an order in the account.
    func recordWholesale(_ offer: WholesaleOffer, cases: Int, total: Double) {
        var account = data.distributor
        if account.week != data.day / 7 {
            account.week = data.day / 7
            account.cases = [:]
        }
        account.cases[offer.product.id, default: 0] += cases
        account.spent += total
        data.distributor = account
    }
}
