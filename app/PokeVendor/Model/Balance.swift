import Foundation

/// Values that the design docs leave to balancing. docs/19-prototype-values.md lists them.
enum Balance {
    // Money and time (docs/16-time-and-day.md)
    static let startingCash = 500.0
    /// Home rent, due on the 1st of each month (Model/GameCalendar.swift).
    static let rent = 1200.0
    /// The period of a store lease, and of some debt rules. Home rent does not use it.
    static let rentCycleDays = 28
    static let rentWarningDays = 3
    static let dayStart = 7.0
    static let dayEnd = 23.0
    static let workStart = 9.0
    static let workEnd = 17.0
    static let sickDaysPerYear = 5

    // The save file (docs/07-platform-and-scope.md, The save file)
    static let saveDelay = 2.0

    // Bulk (docs/14-counterfeit-risk.md)
    static let bulkFakeFindChance = 0.5
    static let bulkFakeReputation = 3

    // Deals (docs/21-relationships-and-reputation.md)
    static let fairDealMinPrice = 20.0
    static let ledgerKeepDays = 182
    static let activityKeepDays = 91
    static let postsKept = 60

    // Upgrades (docs/09-upgrades.md). Each centering tool reads the cut more sharply than the one before it.
    static let centeringTools: [(name: String, cost: Double, detail: String)] = [
        ("Centering ruler", 40, "Gives numbers for the front, to about ±2, and words for the back."),
        ("Centering scanner", 200, "Gives exact numbers for the front and the back."),
    ]

    // Card shows (docs/20-card-shows.md)
    /// The upgrade that lets the player sell at a show. Without it, the player can only walk in and buy.
    static let vendorKitCost = 200.0
    static let vendorKitDetail = "A table cover, display cases, and card stands. You need it to book a table at a card show."
    static let localTableFee = 40.0
    static let regionalTableFee = 150.0
    /// How far ahead the calendar shows card shows.
    static let showHorizonDays = 42
    static let showOpen = 9.0
    static let showClose = 17.0
    /// The sets at a show, by era: vintage (Wizards of the Coast and e-Card), older out-of-print sets (EX to Sword &
    /// Shield), and new sets (Scarlet & Violet and Mega Evolution).
    static let vintageEras: Set<String> = ["wizards-of-the-coast", "e-card"]
    static let olderEras: Set<String> = ["ex", "diamond-pearl-platinum", "heartgold-soulsilver", "black-white", "xy", "sun-moon",
                                         "sword-shield"]
    static let modernEras: Set<String> = ["scarlet-violet", "mega-evolution"]
    /// The share of WOTC cards found in the wild (vendors, sellers, collections) that are 1st Edition. The 1st
    /// Edition print run was far smaller than the Unlimited run.
    static let firstEditionShare = 0.15
    static let vintageSets = SetLibrary.slugs(eras: vintageEras)
    static let olderSets = SetLibrary.slugs(eras: olderEras)
    static let modernSets = SetLibrary.slugs(eras: modernEras)
    static var showSets: [String] { vintageSets + olderSets + modernSets }
    /// Minutes to look over one vendor table.
    static let vendorVisitMinutes = 15.0
    /// A better table spot, at reputation Trusted and up, brings more people (docs/04).
    static let goodSpotBonus = 1.15
    /// First look: a recurring vendor shows the player this many items before the public table (docs/04).
    static let firstLookItems = 2
    /// On-site grading at a regional show: one tier, back the same day (docs/20-card-shows.md).
    static let onSiteGradingFee = 40.0
    /// Vendor trades: a vendor pays out this share of the cash difference when the player's side is worth more.
    static let vendorTradeCashFactor = 0.85
    /// A vendor does not take a player item with a market under this value.
    static let tradeMinItem = 5.0
    /// "Ask for a better rate" adds this to the trade rate when the vendor says yes.
    static let tradeRateAskBonus = 0.05

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
    /// The most products that one online store lists in a day.
    static let storeListingCap = 40
    static let amazonSpikeChance = 0.3
    static let deliveryDays: [Storefront: Int] = [
        .pokemonCenter: 5, .amazon: 2, .reseller: 3, .ebay: 4, .facebook: 4,
    ]
    static let facebookPickupHours = 1.0
    /// Half of the Facebook pickups are set for a later day (docs/12, Facebook Marketplace).
    static let fbLaterPickupChance = 0.5

    // Grading (docs/10-grading.md)
    static let gradingTiers: [GradingCompany: [GradingTier]] = [
        // PSA's levels and value caps in November 2026. The days are game days, about a third of PSA's business days.
        // PSA paused its other Value levels in June 2026. Value Bulk is for members, 20 cards or more.
        .psa: [GradingTier(name: "Value Bulk", fee: 24.99, days: 45, maxValue: 500, minCards: 20, membersOnly: true),
               GradingTier(name: "Regular", fee: 79.99, days: 21, maxValue: 1_500),
               GradingTier(name: "Express", fee: 199, days: 10, maxValue: 2_500),
               GradingTier(name: "Super Express", fee: 349, days: 5, maxValue: 5_000),
               GradingTier(name: "Walk-Through", fee: 599, days: 3, maxValue: 10_000),
               GradingTier(name: "Premium 1", fee: 999, days: 2, maxValue: 25_000),
               GradingTier(name: "Premium 2", fee: 1_999, days: 2, maxValue: 50_000),
               GradingTier(name: "Premium 3", fee: 2_999, days: 2, maxValue: 100_000),
               GradingTier(name: "Premium 5", fee: 4_999, days: 2, maxValue: 250_000),
               GradingTier(name: "Premium 10", fee: 9_999, days: 2)],
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
    /// The spread and the bias are fitted to real grade populations (docs/10-grading.md, Measured grade rates).
    var spread: Double {
        switch self {
        case .psa: 0.62
        case .bgs: 0.29
        case .cgc: 0.43
        }
    }

    /// How kind the company is. CGC gives a 10 most easily, and BGS is the strictest.
    var bias: Double {
        switch self {
        case .psa: 0.04
        case .bgs: -0.05
        case .cgc: 0.18
        }
    }
}

struct GradingTier: Hashable {
    let name: String
    let fee: Double
    let days: Int
    /// The most a graded card can be worth at this level. PSA upcharges a card worth more. Nil: no cap.
    var maxValue: Double? = nil
    /// The fewest cards in one order at this level.
    var minCards = 1
    /// Only a PSA member can use this level.
    var membersOnly = false

    /// The PSA level that a person with no membership uses for one card. Grading advice prices with it.
    static var psaStandard: GradingTier { Balance.gradingTiers[.psa]?.first { $0.name == "Regular" } ?? GradingTier(name: "Regular", fee: 79.99, days: 21) }
}

enum Storefront: String, Codable, CaseIterable, Hashable {
    case pokemonCenter = "Pokemon Center", amazon = "Amazon", reseller = "Hyped Reseller"
    case ebay = "eBay", facebook = "Facebook Marketplace"
}
