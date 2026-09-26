import Foundation

/// Set files load once and stay in memory.
@MainActor
enum SetLibrary {
    private static var cache: [String: SetData] = [:]

    static func set(_ slug: String) -> SetData {
        if let set = cache[slug] { return set }
        let set = SetData.load(slug)
        cache[slug] = set
        return set
    }

    static func product(_ id: String?, in slug: String) -> Product? {
        guard let id else { return nil }
        return set(slug).products?.first { $0.id == id }
    }
}

/// The hidden condition of one card. Each value is a subgrade from 1 to 10 (docs/10-grading.md).
struct Condition: Codable, Hashable {
    var centeringFront: Double
    var centeringBack: Double
    var corners: Double
    var edges: Double
    var surface: Double

    var centering: Double { min(centeringFront, centeringBack + 0.5) }
    var subgrades: [Double] { [centering, corners, edges, surface] }

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
        let centering: [(Double, ClosedRange<Double>)] = [(0.55, 9.5...10), (0.33, 8.5...9), (0.12, 7...8)]
        let wear: [(Double, ClosedRange<Double>)] = [(0.72, 10...10), (0.23, 9...9.5), (0.05, 7.5...8.5)]
        let surface: [(Double, ClosedRange<Double>)] = [(0.62, 10...10), (0.27, 9...9.5), (0.11, 7...8.5)]
        return Condition(centeringFront: pick(centering), centeringBack: pick(centering),
                         corners: pick(wear), edges: pick(wear), surface: pick(surface))
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
        case tcgplayer = "TCGplayer", ebay = "eBay", ebayAuction = "eBay auction"
    }

    let channel: Channel
    let price: Double
    let dayListed: Int
    var auctionEndDay: Int?
    var insured: Bool
}

enum ItemStatus: Codable, Hashable {
    case onTheWay(daysLeft: Int, store: Storefront)
    case atGrader(company: GradingCompany, tier: String, daysLeft: Int, ledgerID: UUID)
    case listed(Listing)

    var tag: String {
        switch self {
        case .onTheWay(let days, _): "ON THE WAY · \(days)D"
        case .atGrader(let company, _, let days, _): "AT \(company.rawValue) · \(days)D"
        case .listed(let listing): "LISTED · \(listing.channel.rawValue.uppercased())"
        }
    }
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

    var rawMarket: Double { print.market ?? 0 }

    var market: Double {
        guard let grade else { return rawMarket }
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

    var value: Double { cards.reduce(0) { $0 + ($1.market ?? 0) } }
}

struct LedgerEntry: Codable, Identifiable, Hashable {
    enum Category: String, Codable, CaseIterable {
        case startingCapital = "Starting capital", paycheck = "Paycheck", sale = "Sale", refund = "Refund"
        case sealed = "Sealed product", singles = "Singles", grading = "Grading fees", rent = "Rent"
        case test = "Test"

        var isSpending: Bool { [.sealed, .singles, .grading, .rent, .refund].contains(self) }
    }

    var id = UUID()
    let day: Int
    let amount: Double
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
