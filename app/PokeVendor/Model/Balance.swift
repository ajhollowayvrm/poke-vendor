import Foundation

/// Values that the design docs leave to balancing. docs/19-prototype-values.md lists them.
enum Balance {
    // Money and time (docs/16-time-and-day.md)
    static let startingCash = 500.0
    static let rent = 1200.0
    static let rentCycleDays = 28
    static let rentWarningDays = 3
    static let dayStart = 7.0
    static let dayEnd = 23.0
    static let workStart = 9.0
    static let workEnd = 17.0
    static let sickDaysPerYear = 5

    // Upgrades (docs/09-upgrades.md). Each centering tool reads the cut more sharply than the one before it.
    static let centeringTools: [(name: String, cost: Double, detail: String)] = [
        ("Centering ruler", 40, "Gives numbers for the front, to about ±2, and words for the back."),
        ("Centering scanner", 200, "Gives exact numbers for the front and the back."),
    ]

    // Card shows (docs/20-card-shows.md)
    static let localTableFee = 40.0
    static let regionalTableFee = 150.0
    /// How far ahead the calendar shows card shows.
    static let showHorizonDays = 42
    static let showOpen = 9.0
    static let showClose = 17.0
    /// The sets at a show: vintage (the Wizards of the Coast era), older out-of-print sets, and new sets.
    static let vintageSets = ["base-set"]
    static let olderSets = ["evolving-skies", "cosmic-eclipse"]
    static let modernSets = ["prismatic-evolutions", "surging-sparks", "stellar-crown", "twilight-masquerade", "paradox-rift"]
    static var showSets: [String] { vintageSets + olderSets + modernSets }
    /// Minutes to look over one vendor table.
    static let vendorVisitMinutes = 15.0

    // Selling (docs/15-selling.md)
    static let listingDays = 28
    static let tcgFeeRate = 0.1075
    static let tcgFeeFlat = 0.30
    static let ebayFeeRate = 0.1325
    static let ebayFeeFlat = 0.40
    static let lossChance = 0.01
    static let insuranceRate = 0.02
    static let auctionLengths = [1, 3, 5, 7, 10]

    /// A plain envelope under $20, a tracked package from $20. Sealed product under $20 (a pack) goes in a
    /// padded envelope, and bigger sealed product goes in a box.
    static func shippingCost(for price: Double, sealed: Bool = false) -> Double {
        if sealed { return price < 20 ? 1.50 : 6.50 }
        return price < 20 ? 1.00 : 4.75
    }

    static func insuranceCost(for price: Double) -> Double {
        max(1, (price * insuranceRate * 100).rounded() / 100)
    }

    // Buying (docs/12-acquiring-product.md)
    static let pokemonCenterDropChance = 0.15
    static let pokemonCenterSuccessChance = 0.30
    static let amazonStockChance = 0.45
    static let amazonSpikeChance = 0.3
    static let deliveryDays: [Storefront: Int] = [
        .pokemonCenter: 5, .amazon: 2, .reseller: 3, .ebay: 4, .facebook: 4,
    ]
    static let facebookPickupHours = 1.0

    // Grading (docs/10-grading.md)
    static let gradingTiers: [GradingCompany: [GradingTier]] = [
        .psa: [GradingTier(name: "Value", fee: 25, days: 45), GradingTier(name: "Regular", fee: 75, days: 15),
               GradingTier(name: "Express", fee: 150, days: 7)],
        .cgc: [GradingTier(name: "Economy", fee: 18, days: 30), GradingTier(name: "Standard", fee: 30, days: 12),
               GradingTier(name: "Express", fee: 65, days: 5)],
        .bgs: [GradingTier(name: "Base", fee: 20, days: 40), GradingTier(name: "Standard", fee: 50, days: 15),
               GradingTier(name: "Express", fee: 100, days: 7)],
    ]
}

struct Job: Hashable {
    let title: String
    let weeklyPay: Double
    let sickDays: Int

    static let ladder = [
        Job(title: "Retail associate", weeklyPay: 640, sickDays: 5),
        Job(title: "Warehouse lead", weeklyPay: 840, sickDays: 6),
        Job(title: "Office coordinator", weeklyPay: 1080, sickDays: 8),
        Job(title: "Project manager", weeklyPay: 1520, sickDays: 10),
    ]
}

enum GradingCompany: String, Codable, CaseIterable, Hashable {
    case psa = "PSA", cgc = "CGC", bgs = "BGS"

    /// How far a returned grade can move from the card's true condition.
    var spread: Double {
        switch self {
        case .psa: 0.25
        case .bgs: 0.35
        case .cgc: 0.45
        }
    }
}

struct GradingTier: Hashable {
    let name: String
    let fee: Double
    let days: Int
}

enum Storefront: String, Codable, CaseIterable, Hashable {
    case pokemonCenter = "Pokemon Center", amazon = "Amazon", reseller = "Hyped Reseller"
    case ebay = "eBay", facebook = "Facebook Marketplace"
}
