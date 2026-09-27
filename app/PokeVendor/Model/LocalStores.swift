import Foundation

/// The local stores for a store run (docs/12-acquiring-product.md, Local stores).
enum LocalStore: String, CaseIterable, Codable, Hashable {
    case target = "Target", walmart = "Walmart", bestBuy = "Best Buy", gamestop = "GameStop"
    case barnes = "Barnes & Noble", castle = "Cardboard Castle", topDeck = "Top Deck Games"

    var isGameShop: Bool { self == .castle || self == .topDeck }
    /// Each stop adds its drive and its visit (docs/16-time-and-day.md).
    var hours: Double { 40.0 / 60.0 }
    var stockChance: Double { isGameShop ? 0.45 : 0.12 }
}

/// One thing on a store shelf, at MSRP.
struct ShelfItem: Identifiable, Hashable {
    let id: String
    let product: Product
    let price: Double
    let quantity: Int
}

/// A single in a game shop's display case.
struct CaseSingle: Identifiable, Hashable {
    let id: String
    let print: CardPrint
    let price: Double
}

struct ShopState: Codable, Hashable {
    var points = 0
    var credit = 0.0
    var lastVisitDay = 0
    /// Money spent toward the next standing point (+1 for each $50).
    var spendTowardPoint = 0.0
}

enum StandingLevel: String {
    case stranger = "Stranger", familiar = "Familiar", regular = "Regular", trusted = "Trusted"

    init(points: Int) {
        switch points {
        case 60...: self = .trusted
        case 30...: self = .regular
        case 10...: self = .familiar
        default: self = .stranger
        }
    }

    /// The buylist price as a share of market (docs/12-acquiring-product.md, Standing levels).
    var buylistRate: Double {
        switch self {
        case .stranger: 0.50
        case .familiar: 0.55
        case .regular: 0.60
        case .trusted: 0.70
        }
    }
}

extension Balance {
    /// Store credit for bulk, as a share of its market value. The shop pays bulk in credit only.
    static let bulkCreditRate = 0.5
    /// The display case marks singles up over market.
    static let displayCaseMarkup = 1.1
}

@MainActor
extension Market {
    static func shelf(_ store: LocalStore, day: Int) -> [ShelfItem] {
        let salt = UInt64(LocalStore.allCases.firstIndex(of: store) ?? 0) + 11
        var r = SeededRandom(seed: UInt64(day + 1) &* 15_485_863 &+ salt &* 3_571)
        guard r.double(0...1) < store.stockChance else { return [] }
        let kinds = store.isGameShop ? ["Booster pack", "Booster bundle", "Elite Trainer Box"]
                                     : ["Booster pack", "Blister", "Tin", "Booster bundle", "Elite Trainer Box", "Collection"]
        let options = SetLibrary.catalog.filter {
            ($0.inPrint ?? true) &&
            kinds.contains($0.kind) && $0.msrp != nil && !$0.isClubExclusive && $0.packs <= 11
        }
        guard !options.isEmpty else { return [] }
        let count = r.int(1...(store.isGameShop ? 3 : 2))
        var out: [ShelfItem] = []
        for i in 0..<count {
            let p = options[r.int(0...(options.count - 1))]
            if out.contains(where: { $0.product.id == p.id }) { continue }
            let qty = p.packs == 1 ? r.int(2...8) : r.int(1...2)
            // Big stores sell at MSRP. A game shop prices near market, but it does not scalp.
            let price = store.isGameShop ? retail(p.market * r.double(0.9...1.05)) : (p.msrp ?? p.market)
            out.append(ShelfItem(id: "\(day)-\(store.rawValue)-\(i)", product: p, price: price, quantity: qty))
        }
        return out
    }

    static func displayCase(_ store: LocalStore, day: Int) -> [CaseSingle] {
        guard store.isGameShop else { return [] }
        // The case changes once a week.
        var r = SeededRandom(seed: UInt64(day / 7 + 1) &* 32_452_843 &+ (store == .castle ? 1 : 2))
        let singles = SetLibrary.set(slug).prints.filter { ($0.market ?? 0) >= 5 }
        guard !singles.isEmpty else { return [] }
        return (0..<6).map { i in
            let c = singles[r.int(0...(singles.count - 1))]
            return CaseSingle(id: "\(day / 7)-\(store.rawValue)-case-\(i)", print: c,
                              price: retail((c.market ?? 0) * Balance.displayCaseMarkup))
        }
    }
}
