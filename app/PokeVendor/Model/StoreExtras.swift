import Foundation

// The state for consignment, expiring credit, the sealed buylist, and the bigger space (docs/22-own-store.md).

/// A card that a customer left in the player's case. It is not the player's stock. The store keeps `cut` of the price.
struct ConsignedCard: Codable, Hashable, Identifiable {
    var id = UUID()
    let name: String
    let setSlug: String
    /// The market value when the customer brought the card.
    let market: Double
    /// The share of the sale price that the store keeps.
    let cut: Double
    let dayIn: Int
}

/// Store credit that the store gave on one day. It expires.
struct CreditLot: Codable, Hashable {
    let day: Int
    var amount: Double
}

/// Everything new for the own-store open topics. `CardStoreState` holds it as an Optional, so old saves still load.
struct StoreExtras: Codable, Hashable {
    /// The size of the unit. 0 is the unit that the lease gave.
    var space = 0
    var consignOn = false
    var consignCut = Balance.ownConsignCuts[1]
    var consigned: [ConsignedCard] = []
    var consignedSold = 0
    var consignEarned = 0.0
    /// The credit that is still owed, by the day the store gave it. The oldest lot is first.
    var creditLots: [CreditLot] = []
    var creditExpired = 0.0
    /// The cash offer for sealed product from walk-in sellers, as a share of market. 0 means off.
    var sealedRate = 0.0
    var sealedBudget = Balance.sealedBuyBudgets[1]
}

extension CardStoreState {
    var growth: StoreExtras {
        get { extras ?? StoreExtras() }
        set { extras = newValue }
    }

    /// Extra room from a bigger unit, for cards and for sealed items.
    var spaceSlots: Int { growth.space * Balance.spaceSlotsPerLevel }

    /// Notes credit that the store gives today.
    mutating func noteCredit(_ amount: Double, day: Int) {
        var g = growth
        g.creditLots.append(CreditLot(day: day, amount: amount))
        growth = g
    }

    /// Notes credit that customers use. The oldest credit goes first.
    mutating func useCredit(_ amount: Double) {
        var g = growth
        var left = amount
        for i in g.creditLots.indices where left > 0 {
            let n = min(left, g.creditLots[i].amount)
            g.creditLots[i].amount -= n
            left -= n
        }
        g.creditLots.removeAll { $0.amount < 0.005 }
        growth = g
    }
}

extension Balance {
    // Consignment at the own store.
    /// The share of the sale price that the store keeps. The owner picks one.
    static let ownConsignCuts = [0.15, 0.20, 0.25]
    static let ownConsignBaseCut = 0.20
    /// Customers who bring a card, for each customer in the clerk hours, at the base cut.
    static let ownConsignSellerShare = 0.08
    /// Each point of cut over the base takes this share of the sellers away. A lower cut brings more.
    static let ownConsignCutSlope = 4.0
    static let ownConsignMaxPerDay = 3
    /// Unsold cards go back to the owner after this many days.
    static let ownConsignDays = 28
    /// Customers do not consign cards under this market value.
    static let ownConsignMinMarket = 8.0

    // Store credit that expires.
    static let creditExpiryDays = 56
    static let creditWarnDays = 7

    // The buylist for sealed product only.
    static let sealedBuyRates = [0.6, 0.7, 0.8]
    static let sealedBuyBaseRate = 0.7
    static let sealedBuyBudgets = [100.0, 250, 500, 1000]
    static let sealedBuySellerShare = 0.06
    static let sealedBuySellerFloor = 0.55...0.85
    static let sealedBuyMinMarket = 15.0

    // A bigger space.
    /// The price of each step up. The first step is a bigger unit, and the second is a large unit.
    static let spaceCosts = [2500.0, 4500]
    static let spaceNames = ["Bigger unit", "Large unit"]
    /// Each step adds this many card slots and this many sealed slots.
    static let spaceSlotsPerLevel = 40
    /// Each step adds this share of the base rent, and of the insurance and the utilities.
    static let spaceRentStep = 0.25
    static let spaceOverheadStep = 0.25
}
