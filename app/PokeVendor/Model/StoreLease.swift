import Foundation

// The lease term, the buyout, the monthly overhead, and the rival game shops (docs/22-own-store.md).

/// The term of the player's lease. Nil on a store from an old save: that lease runs month to month.
struct StoreLease: Codable, Hashable {
    /// The term, in periods of 28 days.
    let periods: Int
    /// The day the term ends. A renewal moves it forward by one term.
    var endDay: Int
    /// The rent for each period, after the discount for the term.
    let rent: Double
}

/// What the store pays every 28 days, apart from rent.
struct StoreOverhead {
    let fees: Double
    let insurance: Double
    let utilities: Double
    let software: Double

    var total: Double { fees + insurance + utilities + software }
}

extension Balance {
    /// The terms the player can pick, in periods of 28 days, and the rent for each term as a share of the base rent.
    static let leaseTerms = [6, 12]
    static let leaseRentFactor: [Int: Double] = [6: 1.0, 12: 0.9]
    /// Closing early costs this many rents, or the rest of the term if that is less. The landlord keeps the deposit.
    static let leaseBuyoutRents = 3
    /// In the last days of a term, the player can close with no buyout and get the deposit back.
    static let leaseNoticeDays = 7
    /// Card processing, as a share of the store's sales in the period.
    static let cardFeeRate = 0.03
    static let storeInsurance: [StoreLocation: Double] = [.stripMall: 90, .mainStreet: 130, .mall: 200]
    static let storeUtilities: [StoreLocation: Double] = [.stripMall: 140, .mainStreet: 220, .mall: 380]
    static let storeSoftware: [StoreLocation: Double] = [.stripMall: 60, .mainStreet: 80, .mall: 100]
    /// Each game shop takes this many standing points from the player at a lease.
    static let rivalStandingLoss = 15
}

extension StoreLocation {
    /// Rent for each 28 days under a lease of `term` periods.
    func rent(term: Int) -> Double { (rent * (Balance.leaseRentFactor[term] ?? 1)).rounded() }
    /// The cash to sign the lease: the first rent, the deposit, and the build-out.
    func upfront(term: Int) -> Double { rent(term: term) * 2 + buildout }
    /// Insurance, utilities, and software for each 28 days. Card fees come on top.
    var fixedOverhead: Double { (Balance.storeInsurance[self] ?? 0) + (Balance.storeUtilities[self] ?? 0) + (Balance.storeSoftware[self] ?? 0) }
}

extension CardStoreState {
    /// Rent for each 28 days.
    var rent: Double { ((lease?.rent ?? location.rent) * spaceRentFactor).rounded() }
}

@MainActor
extension GameStore {
    /// The cost to close now. Zero in the last days of a term, and on a month-to-month lease.
    func leaseBuyout(_ s: CardStoreState) -> Double {
        guard let lease = s.lease else { return 0 }
        let left = lease.endDay - data.day
        if left <= Balance.leaseNoticeDays { return 0 }
        let periodsLeft = (left + Balance.rentCycleDays - 1) / Balance.rentCycleDays
        return Double(min(Balance.leaseBuyoutRents, periodsLeft)) * s.rent
    }

    /// The player can close the store: the buyout, if any, must fit in cash.
    var canCloseStore: Bool { data.cardStore.map { canAfford(leaseBuyout($0)) } ?? false }

    /// The overhead for the period that just ended: the fee on its sales, and the fixed costs.
    func storeOverhead(_ s: CardStoreState) -> StoreOverhead {
        let overheadFactor = 1 + Balance.spaceOverheadStep * Double(s.growth.space)
        let sales = s.history.filter { data.day - $0.day <= Balance.rentCycleDays }.reduce(0) { $0 + $1.revenue }
        return StoreOverhead(fees: (sales * Balance.cardFeeRate * 100).rounded() / 100,
                             insurance: (Balance.storeInsurance[s.location] ?? 0) * overheadFactor,
                             utilities: (Balance.storeUtilities[s.location] ?? 0) * overheadFactor,
                             software: Balance.storeSoftware[s.location] ?? 0)
    }

    /// Adds a cost to yesterday's record, for the "Last 7 days" numbers. It makes the record if the store was closed.
    func addStoreCost(_ amount: Double, to s: inout CardStoreState) {
        let yesterday = data.day - 1
        if s.history.last?.day == yesterday {
            s.history[s.history.count - 1].costs += amount
        } else {
            s.history.append(StoreDay(day: yesterday, costs: amount))
        }
    }

    /// The two game shops lose standing with the player at a lease. They stop consigning while the store stands.
    func rivalShopsReact() {
        for shop in LocalStore.allCases where shop.isGameShop {
            var state = self.shop(shop)
            state.points = max(0, state.points - Balance.rivalStandingLoss)
            data.shops[shop.rawValue] = state
        }
    }
}
