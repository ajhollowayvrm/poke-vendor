import Foundation

/// Set files load once and stay in memory.
@MainActor
/// One set that the app has (Resources/set-index.json, tools/export/set_index.py).
struct SetInfo: Codable, Hashable {
    let slug: String
    let name: String
    let era: String
    let series: String
    let prints: Int
    /// The release date, "YYYY-MM-DD".
    let release: String?

    var year: String { release.map { String($0.prefix(4)) } ?? "" }
}

enum SetLibrary {
    private static var cache: [String: SetData] = [:]

    /// Every set in the game, oldest era first.
    static let index: [SetInfo] = {
        guard let url = Bundle.main.url(forResource: "set-index", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let sets = try? JSONDecoder().decode([SetInfo].self, from: data) else {
            fatalError("set-index.json is missing or not valid")
        }
        return sets
    }()

    static func info(_ slug: String) -> SetInfo? { infoBySlug[slug] }
    private static let infoBySlug = Dictionary(index.map { ($0.slug, $0) }, uniquingKeysWith: { a, _ in a })

    /// Newest set first. A set with no release date goes last.
    private static let newestRank: [String: Int] = {
        let sorted = index.sorted { ($0.release ?? "") > ($1.release ?? "") }
        return Dictionary(sorted.enumerated().map { ($1.slug, $0) }, uniquingKeysWith: { a, _ in a })
    }()

    /// Groups items by their set, newest set first. The items keep their order inside each group.
    static func grouped<T>(_ items: [T], by slug: (T) -> String) -> [(slug: String, items: [T])] {
        var order: [String] = []
        var groups: [String: [T]] = [:]
        for item in items {
            let s = slug(item)
            if groups[s] == nil { order.append(s) }
            groups[s, default: []].append(item)
        }
        return order.sorted { (newestRank[$0] ?? .max, $0) < (newestRank[$1] ?? .max, $1) }.map { ($0, groups[$0] ?? []) }
    }

    /// The slugs of the sets from these eras.
    static func slugs(eras: Set<String>) -> [String] {
        index.filter { eras.contains($0.era) }.map(\.slug)
    }

    static func set(_ slug: String) -> SetData {
        if let set = cache[slug] { return set }
        let set = SetData.load(slug)
        cache[slug] = set
        return set
    }

    static let catalog: [Product] = {
        guard let url = Bundle.main.url(forResource: "catalog", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let products = try? JSONDecoder().decode([Product].self, from: data) else {
            fatalError("catalog.json is missing or not valid")
        }
        return products
    }()

    static func product(_ id: String?, in slug: String = "") -> Product? {
        guard let id else { return nil }
        return catalog.first { $0.id == id }
    }

    /// The loose booster pack product of a set, when the catalog has one.
    static func loosePack(_ slug: String) -> Product? {
        catalog.first { $0.kind == "Booster pack" && $0.packs == 1 && $0.homeSlug == slug }
    }
}

/// The cut of a card: how the border frames the art on each face (docs/10-grading.md, Cut).
/// Each value is the share of the left (or top) border, in percent, so 50 is a perfect 50/50.
struct Cut: Codable, Hashable {
    var frontLR: Int
    var frontTB: Int
    var backLR: Int
    var backTB: Int
    /// The fixed error of the player's eyeball reading on each value, from -1 to 1. It does not change, so the
    /// same card always gives the same reading.
    var eye: [Double] = (0..<4).map { _ in .random(in: -1...1) }

    /// The worse side of a value, for example 58 for 42/58.
    static func worse(_ share: Int) -> Int { max(share, 100 - share) }

    /// The centering subgrade of the front, from its worse axis. The steps follow the common grading limits:
    /// 55/45 or better is a 10.
    static func frontGrade(_ worst: Int) -> Double {
        switch worst {
        case ...55: 10
        case ...57: 9.5
        case ...60: 9
        case ...62: 8.5
        case ...65: 8
        case ...70: 7
        case ...75: 6
        default: 5
        }
    }

    /// The back allows more: 65/35 or better is a 10.
    static func backGrade(_ worst: Int) -> Double {
        switch worst {
        case ...65: 10
        case ...70: 9.5
        case ...75: 9
        case ...80: 8.5
        case ...85: 8
        case ...90: 7
        default: 6
        }
    }

    var frontGrade: Double { Self.frontGrade(max(Self.worse(frontLR), Self.worse(frontTB))) }
    var backGrade: Double { Self.backGrade(max(Self.worse(backLR), Self.worse(backTB))) }

    /// A cut from the factory. Left to right is a little less even than top to bottom, and the back is the least even.
    static func random() -> Cut {
        func share(_ spread: Double) -> Int {
            // A normal random value (Box-Muller).
            let z = sqrt(-2 * log(Double.random(in: 0.0001..<1))) * cos(2 * .pi * Double.random(in: 0..<1))
            return max(20, min(80, Int((50 + z * spread).rounded())))
        }
        return Cut(frontLR: share(4.2), frontTB: share(3.2), backLR: share(7), backTB: share(7))
    }

    /// A cut that gives these subgrades, for a card from a save that has no cut.
    static func matching(front: Double, back: Double) -> Cut {
        func worst(_ grade: Double, _ table: (Int) -> Double) -> Int {
            let fits = (50...90).filter { table($0) == grade }
            return fits.randomElement() ?? (50...90).min { abs(table($0) - grade) < abs(table($1) - grade) } ?? 50
        }
        func pair(_ worst: Int) -> (Int, Int) {
            let other = Int.random(in: 50...worst)
            let a = Bool.random() ? worst : 100 - worst
            let b = Bool.random() ? other : 100 - other
            return Bool.random() ? (a, b) : (b, a)
        }
        let f = pair(worst(front, frontGrade))
        let b = pair(worst(back, backGrade))
        return Cut(frontLR: f.0, frontTB: f.1, backLR: b.0, backTB: b.1)
    }
}

/// What the player can read of a cut. Without a tool it is only words. The centering ruler gives numbers for the
/// front, and the centering scanner gives exact numbers for both faces (docs/09-upgrades.md).
struct CutReading {
    /// Words in place of numbers, for example "Off center".
    let words: String?
    /// The numbers for left to right and for top to bottom, for example "≈54/46".
    let lr: String
    let tb: String
    /// How far the numbers can be off, in percent. 0 is exact.
    let spread: Int
    /// For sorting by what the player can see: the worse side as read, so lower is better. 0 is unknown.
    var rank = 0

    static func front(_ cut: Cut, tool: Int) -> CutReading {
        switch tool {
        case 0: words(cut.frontLR, cut.frontTB, cut.eye[0], cut.eye[1], error: 3)
        case 1: numbers(cut.frontLR, cut.frontTB, cut.eye[0], cut.eye[1], spread: 2)
        default: numbers(cut.frontLR, cut.frontTB, 0, 0, spread: 0)
        }
    }

    /// The back cannot be read by eye: every card back looks the same.
    static func back(_ cut: Cut, tool: Int) -> CutReading {
        switch tool {
        case 0: CutReading(words: "Can't tell by eye", lr: "", tb: "", spread: 0, rank: 0)
        case 1: words(cut.backLR, cut.backTB, cut.eye[2], cut.eye[3], error: 6, back: true)
        default: numbers(cut.backLR, cut.backTB, 0, 0, spread: 0)
        }
    }

    /// The words come from the worse axis as the player sees it. A card near the line between two words can
    /// read as either one.
    private static func words(_ lr: Int, _ tb: Int, _ eyeLR: Double, _ eyeTB: Double, error: Double,
                              back: Bool = false) -> CutReading {
        let seen = max(Cut.worse(lr + Int((eyeLR * error).rounded())), Cut.worse(tb + Int((eyeTB * error).rounded())))
        // The back allows more, so its words start later.
        let shift = back ? 10 : 0
        let (text, rank) = switch seen - shift {
        case ...53: ("Looks centered", 53)
        case ...57: ("Slightly off center", 57)
        case ...63: ("Off center", 63)
        default: ("Way off center", 70)
        }
        return CutReading(words: text, lr: "", tb: "", spread: 0, rank: rank)
    }

    private static func numbers(_ lr: Int, _ tb: Int, _ eyeLR: Double, _ eyeTB: Double, spread: Int) -> CutReading {
        func guess(_ share: Int, _ eye: Double) -> Int {
            max(5, min(95, share + Int((eye * Double(spread) * 0.7).rounded())))
        }
        func text(_ g: Int) -> String { (spread == 0 ? "" : "≈") + "\(g)/\(100 - g)" }
        let a = guess(lr, eyeLR)
        let b = guess(tb, eyeTB)
        return CutReading(words: nil, lr: text(a), tb: text(b), spread: spread, rank: max(Cut.worse(a), Cut.worse(b)))
    }
}

/// The wear that anyone can see on a raw card.
enum Wear: String, CaseIterable, Codable {
    case nearMint = "Near Mint", lightlyPlayed = "Lightly Played", moderatelyPlayed = "Moderately Played"
    case heavilyPlayed = "Heavily Played", damaged = "Damaged"

    var short: String {
        switch self {
        case .nearMint: "NM"
        case .lightlyPlayed: "LP"
        case .moderatelyPlayed: "MP"
        case .heavilyPlayed: "HP"
        case .damaged: "DMG"
        }
    }

    /// What the player sees by eye. The game shows these words, not the grade names.
    var looks: String {
        switch self {
        case .nearMint: "Looks clean"
        case .lightlyPlayed: "Light wear"
        case .moderatelyPlayed: "Heavy wear"
        case .heavilyPlayed: "Very heavy wear"
        case .damaged: "Damaged"
        }
    }
}

/// The hidden condition of one card. Each value is a subgrade from 1 to 10 (docs/10-grading.md).
struct Condition: Codable, Hashable {
    var centeringFront: Double
    var centeringBack: Double
    var corners: Double
    var edges: Double
    var surface: Double
    /// The true cut. The centering subgrades come from it.
    var cut: Cut

    var centering: Double { min(centeringFront, centeringBack + 0.5) }
    var subgrades: [Double] { [centering, corners, edges, surface] }

    /// Whitening on a corner or an edge, or a scratch, shows by eye. Almost every card from a pack is Near Mint.
    var wear: Wear {
        let worst = min(corners, edges)
        if worst <= 5 || surface <= 4 { return .damaged }
        if worst <= 6 || surface <= 5 { return .heavilyPlayed }
        if worst <= 7 || surface <= 6 { return .moderatelyPlayed }
        if worst <= 8 || surface <= 7 { return .lightlyPlayed }
        return .nearMint
    }

    init(cut: Cut, corners: Double, edges: Double, surface: Double) {
        self.cut = cut
        centeringFront = cut.frontGrade
        centeringBack = cut.backGrade
        self.corners = corners
        self.edges = edges
        self.surface = surface
    }

    /// A save from an older build has no cut. It gets a cut that gives the same centering subgrades.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        centeringFront = try c.decode(Double.self, forKey: .centeringFront)
        centeringBack = try c.decode(Double.self, forKey: .centeringBack)
        corners = try c.decode(Double.self, forKey: .corners)
        edges = try c.decode(Double.self, forKey: .edges)
        surface = try c.decode(Double.self, forKey: .surface)
        cut = (try? c.decodeIfPresent(Cut.self, forKey: .cut)) ?? Cut.matching(front: centeringFront, back: centeringBack)
    }

    /// A card straight from a pack.
    static func packFresh() -> Condition {
        func pick(_ table: [(Double, ClosedRange<Double>)]) -> Double {
            var roll = Double.random(in: 0..<1)
            for (chance, range) in table {
                if roll < chance { return (Double.random(in: range) * 2).rounded() / 2 }
                roll -= chance
            }
            return 10
        }
        let wear: [(Double, ClosedRange<Double>)] = [(0.72, 10...10), (0.23, 9...9.5), (0.05, 7.5...8.5)]
        let surface: [(Double, ClosedRange<Double>)] = [(0.62, 10...10), (0.27, 9...9.5), (0.11, 7...8.5)]
        return Condition(cut: .random(), corners: pick(wear), edges: pick(wear), surface: pick(surface))
    }

    /// A single bought from a stranger. It is a little worse on average.
    static func secondHand() -> Condition {
        var c = packFresh()
        c.corners = max(5, c.corners - Double(Int.random(in: 0...2)) * 0.5)
        c.edges = max(5, c.edges - Double(Int.random(in: 0...2)) * 0.5)
        return c
    }
}

struct SlabGrade: Codable, Hashable {
    let company: GradingCompany
    let grade: Double
    var blackLabel = false

    var label: String {
        let number = grade == grade.rounded() ? String(Int(grade)) : String(grade)
        return blackLabel ? "\(company.rawValue) \(number) Black Label" : "\(company.rawValue) \(number)"
    }

    /// The key in the set file's graded prices, for example "bgs9_5".
    var priceKey: String {
        let number = grade == grade.rounded() ? String(Int(grade)) : String(grade).replacingOccurrences(of: ".", with: "_")
        return company.rawValue.lowercased() + number
    }
}

struct Listing: Codable, Hashable {
    enum Channel: String, Codable, CaseIterable {
        case tcgplayer = "TCGplayer", ebay = "eBay", ebayAuction = "eBay auction", social = "Social"
        case whatnot = "Whatnot", facebook = "Facebook Marketplace"

        /// The platform refunds a buyer who got a fake (docs/14, Consequences).
        var refundsFakes: Bool { self == .tcgplayer || self == .ebay || self == .ebayAuction || self == .whatnot }
        /// The item ships. Facebook Marketplace hands over in person.
        var ships: Bool { self != .facebook }
    }

    let channel: Channel
    let price: Double
    let dayListed: Int
    var auctionEndDay: Int?
    var insured: Bool
    /// The condition the player listed a raw card at (docs/10-grading.md, Condition grades). Nil: the true condition.
    var listedWear: Wear?
    /// True when the listed condition is better than the true condition. Nil on old saves and on other listings.
    var overstatedCondition: Bool?
}

enum ItemStatus: Codable, Hashable {
    case onTheWay(daysLeft: Int, store: Storefront)
    case atGrader(company: GradingCompany, tier: String, daysLeft: Int, ledgerID: UUID)
    case listed(Listing)
    /// At the paid authenticator (docs/14-counterfeit-risk.md).
    case atAuthenticator(daysLeft: Int, ledgerID: UUID)
    /// On its way from a wholesaler, a case split, or back from consignment (docs/12, docs/15).
    case arriving(daysLeft: Int, from: String)
    /// In a game shop's display case on consignment (docs/15-selling.md, The local game shop).
    case consigned(Consignment)
    /// On a shelf or in a case at the player's own store (docs/22-own-store.md).
    case inStore(since: Int)

    var tag: String {
        switch self {
        case .onTheWay(let days, _): "ON THE WAY · \(days)D"
        case .atGrader(let company, _, let days, _): "AT \(company.rawValue) · \(days)D"
        case .listed(let listing): "LISTED · \(listing.channel.rawValue.uppercased())"
        case .atAuthenticator(let days, _): "AUTHENTICATING · \(days)D"
        case .arriving(let days, _): "ARRIVING · \(days)D"
        case .consigned(let c): "CONSIGNED · \(c.shop.rawValue.uppercased())"
        case .inStore: "IN YOUR STORE"
        }
    }
}

/// A card in a game shop's display case, on consignment (docs/15-selling.md).
struct Consignment: Codable, Hashable {
    let shop: LocalStore
    let price: Double
    /// The shop's cut, as a share of the price.
    let cut: Double
    let dayListed: Int
    /// The day the card sells, decided when it is listed. Nil when it does not sell in the window.
    let sellDay: Int?
}

/// A single card that the player owns: raw, or in a slab when it has a grade.
struct OwnedCard: Codable, Identifiable, Hashable {
    var id = UUID()
    let print: CardPrint
    let setSlug: String
    let acquired: Date
    /// Nil for a pulled card. The opened product holds the amount paid (docs/08-ui-direction.md, Inventory).
    let paid: Double?
    let ripID: UUID?
    var keep = false
    var condition = Condition.packFresh()
    var grade: SlabGrade?
    var status: ItemStatus?
    var acquiredDay = 0
    /// Hidden: the card is a fake of this tier (docs/14-counterfeit-risk.md). Optional, so old saves still load.
    var fake: FakeTier?
    /// The player knows it is a fake: a check, the tool, or a grader said so.
    var fakeKnown: Bool?
    /// A check, the tool, or a grader said it is real.
    var verified: Bool?
    /// The online listing of a card in the player's store. Only used while the status is `.inStore` (docs/22).
    var onlineListing: Listing?
    /// The own shelf price of a slab in the store, as a share of market. Nil: the slab uses the singles price.
    var shelfFactor: Double?

    var isKnownFake: Bool { fake != nil && fakeKnown == true }
    var isVerified: Bool { verified == true }

    var rawMarket: Double { print.market ?? 0 }

    /// What the card is worth to the player. A known fake is worth nothing.
    var market: Double { isKnownFake ? 0 : realMarket }

    /// What a real copy sells for: the price a buyer who does not know pays.
    var realMarket: Double {
        guard let grade else { return market(as: condition.wear) }
        if let price = print.graded[grade.priceKey] ?? nil { return grade.blackLabel ? price * 2 : price }
        return Self.fallbackGradedPrice(raw: rawMarket, grade: grade)
    }

    /// For a grade with no sales data: a multiple of the raw price, with a floor.
    static func fallbackGradedPrice(raw: Double, grade: SlabGrade) -> Double {
        let (multiple, floor): (Double, Double) = switch grade.grade {
        case 10...: (2.5, grade.company == .bgs ? 30 : grade.company == .psa ? 15 : 12)
        case 9.5...: (1.6, 10)
        case 9...: (1.3, 7)
        case 8...: (0.95, 5)
        case 7...: (0.75, 4)
        default: (0.5, 3)
        }
        return max(raw * multiple, floor) * (grade.blackLabel ? 2 : 1)
    }
}

struct SealedItem: Codable, Identifiable, Hashable {
    var id = UUID()
    let setSlug: String
    let name: String
    let packs: Int
    let paid: Double
    let acquired: Date
    let source: String
    var keep = false
    var productID: String?
    var status: ItemStatus?
    /// The product that this loose pack came out of, after the rip broke its seal.
    var brokenFrom: UUID?
    var acquiredDay = 0
    /// Hidden: the product is resealed (docs/14-counterfeit-risk.md). Optional, so old saves still load.
    var fake: FakeTier?
    var fakeKnown: Bool?
    var verified: Bool?
    /// The online listing of an item in the player's store. Only used while the status is `.inStore` (docs/22).
    var onlineListing: Listing?

    var isKnownFake: Bool { fake != nil && fakeKnown == true }
    var isVerified: Bool { verified == true }

    var paidPerPack: Double { paid / Double(max(packs, 1)) }
}

/// The bulk of one rip: every card that is not a hit.
struct BulkGroup: Codable, Identifiable, Hashable {
    var id = UUID()
    let ripID: UUID
    let setSlug: String
    let date: Date
    var cards: [CardPrint]
    var day = 0
    /// True for a group of cards that the player moved from Raw, not from a rip.
    var moved = false

    var value: Double { cards.reduce(0) { $0 + ($1.market ?? 0) } }
}

struct LedgerEntry: Codable, Identifiable, Hashable {
    enum Category: String, Codable, CaseIterable {
        case startingCapital = "Starting capital", paycheck = "Paycheck", sale = "Sale", refund = "Refund"
        case sealed = "Sealed product", singles = "Singles", grading = "Grading fees", rent = "Rent"
        case tax = "Taxes"
        case sponsorship = "Sponsorship", upgrade = "Upgrades", showFees = "Show fees", test = "Test"
        case authentication = "Authentication fees", tips = "Live-stream tips", wholesale = "Wholesale"
        case storeRent = "Store rent", storeSetup = "Store setup", wages = "Wages", storeEvents = "Store events"
        case storeOverhead = "Store overhead", supplies = "Supplies", paymentFees = "Payment fees", insurance = "Insurance"
    }

    var id = UUID()
    let day: Int
    var amount: Double
    let category: Category
    var label: String
    var pending = false
}

struct ActivityEntry: Codable, Identifiable, Hashable {
    var id = UUID()
    let day: Int
    let text: String
    var cash: Double?
}
