import Foundation

/// The local stores for a store run (docs/12-acquiring-product.md, Local stores).
enum LocalStore: String, CaseIterable, Codable, Hashable {
    case target = "Target", walmart = "Walmart", bestBuy = "Best Buy", gamestop = "GameStop"
    case barnes = "Barnes & Noble", castle = "Cardboard Castle", topDeck = "Top Deck Games"

    var isGameShop: Bool { self == .castle || self == .topDeck }
    /// Each stop adds its drive and its visit (docs/16-time-and-day.md).
    var hours: Double { 40.0 / 60.0 }
    var stockChance: Double { isGameShop ? 0.92 : 0.12 }
}

/// One thing on a store shelf, at MSRP.
struct ShelfItem: Identifiable, Hashable {
    let id: String
    let product: Product
    let price: Double
    let quantity: Int
}

/// Something a game shop bought from a local seller: often vintage or older, and sometimes a real find.
struct BuyIn: Identifiable, Hashable {
    let id: String
    let goods: VendorGoods
    let price: Double
    let market: Double
    /// The shop priced it under market to move it.
    let steal: Bool

    var name: String { VendorItem(goods: goods, price: price, market: market).name }
    var isSealed: Bool {
        if case .sealed = goods { return true }
        return false
    }
}

/// A single in a game shop's display case.
struct CaseSingle: Identifiable, Hashable {
    let id: String
    let print: CardPrint
    let setSlug: String
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
        if store.isGameShop { return gameShopShelf(store, day: day, &r) }
        let kinds = ["Booster pack", "Blister", "Tin", "Booster bundle", "Elite Trainer Box", "Collection"]
        let options = SetLibrary.catalog.filter {
            ($0.inPrint ?? true) &&
            kinds.contains($0.kind) && $0.msrp != nil && !$0.isClubExclusive && $0.packs <= 11
        }
        guard !options.isEmpty else { return [] }
        let count = r.int(1...2)
        var out: [ShelfItem] = []
        for i in 0..<count {
            let p = options[r.int(0...(options.count - 1))]
            if out.contains(where: { $0.product.id == p.id }) { continue }
            let qty = p.packs == 1 ? r.int(2...8) : r.int(1...2)
            // Big stores sell at MSRP.
            out.append(ShelfItem(id: "\(day)-\(store.rawValue)-\(i)", product: p, price: p.msrp ?? p.market, quantity: qty))
        }
        return out
    }

    /// A game shop's shelf: mostly new product of every kind, collections and tins too, and some older sealed.
    /// It prices near market and does not scalp. Older sealed costs a little more.
    private static func gameShopShelf(_ store: LocalStore, day: Int, _ r: inout SeededRandom) -> [ShelfItem] {
        let kinds = ["Booster pack", "Blister", "Tin", "Booster bundle", "Elite Trainer Box", "Collection", "Build & Battle",
                     "Booster box"]
        let modern = SetLibrary.catalog.filter { ($0.inPrint ?? true) && kinds.contains($0.kind) && !$0.isStoreExclusive }
        let older = SetLibrary.catalog.filter { !($0.inPrint ?? true) && kinds.contains($0.kind) && !$0.isStoreExclusive && $0.market < 600 }
        guard !modern.isEmpty else { return [] }
        var out: [ShelfItem] = []
        for i in 0..<r.int(5...9) {
            let old = !older.isEmpty && r.double(0...1) < 0.2
            let pool = old ? older : modern
            let p = pool[r.int(0...(pool.count - 1))]
            if out.contains(where: { $0.product.id == p.id }) { continue }
            let qty = p.packs == 1 ? r.int(3...12) : (old ? 1 : r.int(1...3))
            let price = retail(p.market * (old ? r.double(1.0...1.2) : r.double(0.92...1.05)))
            out.append(ShelfItem(id: "\(day)-\(store.rawValue)-\(i)", product: p, price: price, quantity: qty))
        }
        return out
    }

    /// What a game shop bought from local sellers this week. It changes once a week, leans vintage, and now and
    /// then holds a real find. The shop knows values: it prices at or over market, but about 1 time in 7 it prices
    /// something to move.
    static func buyIns(_ store: LocalStore, day: Int) -> [BuyIn] {
        guard store.isGameShop else { return [] }
        let week = day / 7
        var r = SeededRandom(seed: UInt64(week + 1) &* 49_979_687 &+ (store == .castle ? 3 : 5))
        let vintage = Balance.vintageSets
        let older = Balance.olderSets
        var out: [BuyIn] = []
        for i in 0..<r.int(1...4) {
            let roll = r.double(0...1)
            var goods: VendorGoods?
            var market = 0.0
            if roll < 0.45, let (p, s) = seededPrint(from: vintage, minMarket: 5, &r) {
                let c = seededCondition(old: true, &r)
                goods = .single(p, slug: s, condition: c)
                market = (p.market ?? 0) * c.wear.valueFactor
            } else if roll < 0.65, let (p, s) = seededPrint(from: older, minMarket: 8, &r) {
                let c = seededCondition(old: false, &r)
                goods = .single(p, slug: s, condition: c)
                market = (p.market ?? 0) * c.wear.valueFactor
            } else if roll < 0.85, let (p, s) = seededPrint(from: vintage + older, minMarket: 15, &r) {
                let grades: [Double] = [6, 7, 8, 8, 9, 9, 10]
                let grade = SlabGrade(company: r.double(0...1) < 0.7 ? .psa : .cgc, grade: grades[r.int(0...(grades.count - 1))])
                goods = .slab(p, slug: s, grade: grade)
                market = OwnedCard(print: p, setSlug: s, acquired: .now, paid: nil, ripID: nil, grade: grade).market
            } else {
                let sealed = SetLibrary.catalog.filter { (vintage + older).contains($0.homeSlug) && $0.market > 0 }
                if !sealed.isEmpty {
                    let p = sealed[r.int(0...(sealed.count - 1))]
                    goods = .sealed(p)
                    market = p.market
                }
            }
            guard let goods, market > 0 else { continue }
            let steal = r.double(0...1) < 0.15
            let price = retail(market * (steal ? r.double(0.7...0.85) : r.double(1.0...1.2)))
            out.append(BuyIn(id: "w\(week)-\(store.rawValue)-in-\(i)", goods: goods, price: price, market: market, steal: steal))
        }
        return out
    }

    /// A card from the sets, the same every time for the same seed. Cheaper cards come up more, but good ones do too.
    private static func seededPrint(from sets: [String], minMarket: Double, _ r: inout SeededRandom) -> (CardPrint, String)? {
        guard !sets.isEmpty else { return nil }
        let slug = sets[r.int(0...(sets.count - 1))]
        let prints = SetLibrary.set(slug).prints.filter { ($0.market ?? 0) >= minMarket && !["Common", "Uncommon"].contains($0.rarity) }
        guard !prints.isEmpty else { return nil }
        let weights = prints.map { 1 / pow(max($0.market ?? 1, 1), 0.6) }
        var roll = r.double(0...1) * weights.reduce(0, +)
        for (p, w) in zip(prints, weights) {
            if roll < w { return (p, slug) }
            roll -= w
        }
        return (prints[prints.count - 1], slug)
    }

    /// A condition that stays the same all week. An old card has more wear and looser centering.
    private static func seededCondition(old: Bool, _ r: inout SeededRandom) -> Condition {
        func share(_ spread: Int) -> Int { 50 + r.int(-spread...spread) }
        let cut = Cut(frontLR: share(old ? 12 : 5), frontTB: share(old ? 9 : 4), backLR: share(15), backTB: share(15),
                      eye: (0..<4).map { _ in r.double(-1...1) })
        let wear: [Double] = old ? [10, 9.5, 9, 8.5, 8, 7.5, 7] : [10, 10, 9.5, 9]
        return Condition(cut: cut, corners: wear[r.int(0...(wear.count - 1))], edges: wear[r.int(0...(wear.count - 1))],
                         surface: wear[r.int(0...(wear.count - 1))])
    }

    static func displayCase(_ store: LocalStore, day: Int) -> [CaseSingle] {
        guard store.isGameShop else { return [] }
        // The case changes once a week.
        var r = SeededRandom(seed: UInt64(day / 7 + 1) &* 32_452_843 &+ (store == .castle ? 1 : 2))
        // Mostly new sets, with some older and vintage cards.
        return (0..<6).compactMap { i in
            let pool = r.double(0...1) < 0.7 ? Balance.modernSets : Balance.olderSets + Balance.vintageSets
            guard !pool.isEmpty else { return nil }
            let slug = pool[r.int(0...(pool.count - 1))]
            let singles = SetLibrary.set(slug).prints.filter { ($0.market ?? 0) >= 5 }
            guard !singles.isEmpty else { return nil }
            let c = singles[r.int(0...(singles.count - 1))]
            return CaseSingle(id: "\(day / 7)-\(store.rawValue)-case-\(i)", print: c, setSlug: slug,
                              price: retail((c.market ?? 0) * Balance.displayCaseMarkup))
        }
    }
}
