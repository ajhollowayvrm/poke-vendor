import Foundation

// The vendor tables on a card show floor (docs/20-card-shows.md, The floor).

enum VendorKind: CaseIterable, Hashable {
    case vintageDealer, modernDealer, gameShop, collector, mysteryPacks

    var label: String {
        switch self {
        case .vintageDealer: "Vintage dealer"
        case .modernDealer: "Modern dealer"
        case .gameShop: "Game shop booth"
        case .collector: "Collector clearing out"
        case .mysteryPacks: "Mystery packs"
        }
    }

    var icon: String {
        switch self {
        case .vintageDealer: "crown"
        case .modernDealer: "sparkles"
        case .gameShop: "storefront"
        case .collector: "person.crop.square"
        case .mysteryPacks: "questionmark.square.dashed"
        }
    }

    /// What the vendor charges, as a share of market.
    var priceRange: ClosedRange<Double> {
        switch self {
        case .vintageDealer: 1.0...1.25
        case .modernDealer: 0.95...1.2
        case .gameShop: 0.95...1.12
        case .collector: 0.6...0.95
        case .mysteryPacks: 1.0...1.3
        }
    }

    /// The chance that the vendor takes 10% off when asked.
    var dealChance: Double {
        switch self {
        case .vintageDealer: 0.3
        case .modernDealer: 0.45
        case .gameShop: 0.4
        case .collector: 0.7
        case .mysteryPacks: 0.2
        }
    }

    var tagline: String {
        switch self {
        case .vintageDealer: "Knows what vintage is worth. Prices high and rarely deals."
        case .modernDealer: "New singles and sealed at about market."
        case .gameShop: "A local shop's booth. Mostly sealed."
        case .collector: "Selling off a collection. Cheap, mixed, and often worn. Likes to deal."
        case .mysteryPacks: "Repacks: mostly filler, one guaranteed hit."
        }
    }

    static let businesses: [VendorKind: [String]] = [
        .vintageDealer: ["Kanto Classics", "Holo Vault", "Pallet Town Vintage", "First Edition Finds", "Slab City", "WOTC Warehouse"],
        .modernDealer: ["Top Deck Collectibles", "Mint Condition Co.", "Chase Card Club", "Tera Trading", "Prism Cards"],
        .gameShop: ["Gym Leader Games", "Dragon's Den Hobby", "The Card Cellar", "Critical Hit Games"],
        .collector: ["Dave's childhood binder", "Rachel, clearing out", "Mike's old collection", "A retired collector",
                     "Two brothers selling their binders", "Grandpa's shoebox"],
        .mysteryPacks: ["Mystery Mike's Repacks", "Lucky Box Repacks", "Hit or Miss Packs"],
    ]
}

/// A mystery pack: filler cards and one guaranteed hit from a pool. The hit is usually worth less than the price.
struct MysteryPack: Hashable {
    enum Tier: Hashable { case modern, vintage, slab }

    let tier: Tier
    let price: Double

    var name: String {
        switch tier {
        case .modern: "Modern mystery pack"
        case .vintage: "Vintage mystery pack"
        case .slab: "Slab mystery box"
        }
    }

    var detail: String {
        switch tier {
        case .modern: "5 cards · 1 guaranteed hit from new sets"
        case .vintage: "5 cards · 1 guaranteed Base Set rare or better"
        case .slab: "1 graded card, PSA or CGC"
        }
    }

    static let catalog: [MysteryPack] = [
        MysteryPack(tier: .modern, price: 10), MysteryPack(tier: .vintage, price: 35), MysteryPack(tier: .slab, price: 80),
    ]
}

enum VendorGoods: Hashable {
    case single(CardPrint, slug: String, condition: Condition)
    case slab(CardPrint, slug: String, grade: SlabGrade)
    case sealed(Product)
    case mystery(MysteryPack)
}

struct VendorItem: Identifiable, Hashable {
    let id = UUID()
    let goods: VendorGoods
    var price: Double
    /// The item's market value, for reference. A mystery pack has none.
    let market: Double?
    var askedForDeal = false

    var name: String {
        switch goods {
        case .single(let p, _, _), .slab(let p, _, _): p.name
        case .sealed(let product): product.name
        case .mystery(let pack): pack.name
        }
    }

    var image: String? {
        switch goods {
        case .single(let p, _, _), .slab(let p, _, _): p.image
        case .sealed(let product): product.image
        case .mystery: nil
        }
    }
}

struct Vendor: Identifiable, Hashable {
    let id = UUID()
    let name: String
    let kind: VendorKind
    var items: [VendorItem]
    var visited = false

    /// Short tags for the floor list, for example "Vintage · Slabs · Sealed".
    var tags: String {
        var out: [String] = []
        if items.contains(where: { if case .single(_, let s, _) = $0.goods { return Balance.vintageSets.contains(s) }; return false })
            || items.contains(where: { if case .slab(_, let s, _) = $0.goods { return Balance.vintageSets.contains(s) }; return false }) {
            out.append("Vintage")
        }
        if items.contains(where: { if case .single = $0.goods { return true }; return false }) { out.append("Singles") }
        if items.contains(where: { if case .slab = $0.goods { return true }; return false }) { out.append("Slabs") }
        if items.contains(where: { if case .sealed = $0.goods { return true }; return false }) { out.append("Sealed") }
        if items.contains(where: { if case .mystery = $0.goods { return true }; return false }) { out.append("Mystery packs") }
        return out.joined(separator: " · ")
    }
}

/// Builds the vendor tables for one show day.
@MainActor
enum VendorFloor {
    /// Local shows are small. Regional shows are big, and they are where the vintage is.
    static func tables(for size: ShowSize) -> [Vendor] {
        let plan: [(VendorKind, Int)] = size == .regional
            ? [(.vintageDealer, 5), (.modernDealer, 5), (.gameShop, 2), (.collector, 4), (.mysteryPacks, 2)]
            : [(.vintageDealer, 1), (.modernDealer, 2), (.gameShop, 1), (.collector, 3), (.mysteryPacks, 1)]
        var used: Set<String> = []
        var vendors: [Vendor] = []
        for (kind, count) in plan {
            for _ in 0..<count {
                let names = (VendorKind.businesses[kind] ?? []).filter { !used.contains($0) }
                let name = names.randomElement() ?? kind.label
                used.insert(name)
                vendors.append(Vendor(name: name, kind: kind, items: stock(kind)))
            }
        }
        return vendors.shuffled()
    }

    static func stock(_ kind: VendorKind) -> [VendorItem] {
        var items: [VendorItem] = []
        switch kind {
        case .vintageDealer:
            items += (0..<Int.random(in: 4...6)).compactMap { _ in single(from: Balance.vintageSets, minMarket: 8, kind: kind, vintage: true) }
            items += (0..<Int.random(in: 1...3)).compactMap { _ in slab(from: Balance.vintageSets, kind: kind) }
            // Vintage sealed first. Out-of-print modern sealed fills in.
            items += (0..<Int.random(in: 0...2)).compactMap { _ in
                sealed(from: Double.random(in: 0..<1) < 0.6 ? Balance.vintageSets : Balance.olderSets, kind: kind)
            }
        case .modernDealer:
            items += (0..<Int.random(in: 5...7)).compactMap { _ in single(from: Balance.modernSets, minMarket: 3, kind: kind) }
            items += (0..<Int.random(in: 0...1)).compactMap { _ in slab(from: Balance.modernSets, kind: kind) }
            items += (0..<Int.random(in: 1...2)).compactMap { _ in sealed(from: Balance.modernSets, kind: kind) }
        case .gameShop:
            items += (0..<Int.random(in: 4...6)).compactMap { _ in sealed(from: Balance.modernSets + Balance.olderSets, kind: kind) }
            items += (0..<Int.random(in: 1...3)).compactMap { _ in single(from: Balance.modernSets, minMarket: 2, kind: kind) }
        case .collector:
            // A collection can hold anything, and old cards show their age.
            let pool = Bool.random() ? Balance.vintageSets + Balance.olderSets : Balance.modernSets + Balance.olderSets
            items += (0..<Int.random(in: 5...8)).compactMap { _ in single(from: pool, minMarket: 1.5, kind: kind, vintage: true) }
            items += (0..<Int.random(in: 0...1)).compactMap { _ in sealed(from: pool, kind: kind) }
        case .mysteryPacks:
            items += MysteryPack.catalog.map { VendorItem(goods: .mystery($0), price: $0.price, market: nil) }
            items += (0..<Int.random(in: 1...2)).compactMap { _ in single(from: Balance.modernSets, minMarket: 5, kind: kind) }
        }
        return items.sorted { ($0.market ?? $0.price) > ($1.market ?? $1.price) }
    }

    private static func price(_ market: Double, _ kind: VendorKind) -> Double {
        ShowSession.round(max(0.5, market * Double.random(in: kind.priceRange)))
    }

    private static func single(from sets: [String], minMarket: Double, kind: VendorKind, vintage: Bool = false) -> VendorItem? {
        guard let (print, slug) = randomPrint(from: sets, minMarket: minMarket) else { return nil }
        let old = vintage && (Balance.vintageSets.contains(slug) || Balance.olderSets.contains(slug))
        let condition = old ? Condition.played() : (Double.random(in: 0..<1) < 0.25 ? .secondHand() : .packFresh())
        let wear: Double = switch condition.wear {
        case .nearMint: 1
        case .lightlyPlayed: 0.8
        case .moderatelyPlayed: 0.6
        }
        let market = (print.market ?? 0) * wear
        return VendorItem(goods: .single(print, slug: slug, condition: condition), price: price(market, kind), market: market)
    }

    private static func slab(from sets: [String], kind: VendorKind) -> VendorItem? {
        guard let (print, slug) = randomPrint(from: sets, minMarket: 10) else { return nil }
        let company: GradingCompany = Double.random(in: 0..<1) < 0.7 ? .psa : .cgc
        let grade: Double = [6.0, 7, 8, 8, 9, 9, 10].randomElement() ?? 8
        let slabGrade = SlabGrade(company: company, grade: grade)
        let market = OwnedCard(print: print, setSlug: slug, acquired: .now, paid: nil, ripID: nil, grade: slabGrade).market
        return VendorItem(goods: .slab(print, slug: slug, grade: slabGrade), price: price(market, kind), market: market)
    }

    private static func sealed(from sets: [String], kind: VendorKind) -> VendorItem? {
        let products = SetLibrary.catalog.filter { sets.contains($0.homeSlug) && $0.market > 0 }
        guard let product = products.randomElement() else { return nil }
        return VendorItem(goods: .sealed(product), price: price(product.market, kind), market: product.market)
    }

    /// A hit from the sets. Cheaper cards are more common, so a big card is a real find.
    static func randomPrint(from sets: [String], minMarket: Double, maxMarket: Double = .infinity) -> (CardPrint, String)? {
        let slug = sets.randomElement() ?? "prismatic-evolutions"
        let prints = SetLibrary.set(slug).prints.filter {
            let m = $0.market ?? 0
            return m >= minMarket && m <= maxMarket && !["Common", "Uncommon"].contains($0.rarity)
        }
        let weights = prints.map { 1 / pow(max($0.market ?? 1, 1), 0.8) }
        let total = weights.reduce(0, +)
        guard total > 0 else { return prints.randomElement().map { ($0, slug) } }
        var roll = Double.random(in: 0..<total)
        for (p, w) in zip(prints, weights) {
            if roll < w { return (p, slug) }
            roll -= w
        }
        return prints.last.map { ($0, slug) }
    }

    /// What is inside a mystery pack: the filler first, the hit last.
    static func open(_ pack: MysteryPack) -> (filler: [CardPrint], fillerSlug: String, hit: OwnedCard) {
        let fillerSlug: String
        let hit: OwnedCard
        switch pack.tier {
        case .modern:
            fillerSlug = Balance.modernSets.randomElement() ?? "prismatic-evolutions"
            let (p, s) = randomPrint(from: Balance.modernSets, minMarket: 2) ?? (SetLibrary.set(fillerSlug).prints[0], fillerSlug)
            hit = OwnedCard(print: p, setSlug: s, acquired: .now, paid: pack.price, ripID: nil)
        case .vintage:
            fillerSlug = "base-set"
            let (p, s) = randomPrint(from: Balance.vintageSets, minMarket: 3) ?? (SetLibrary.set(fillerSlug).prints[0], fillerSlug)
            hit = OwnedCard(print: p, setSlug: s, acquired: .now, paid: pack.price, ripID: nil, condition: .played())
        case .slab:
            fillerSlug = ""
            let (p, s) = randomPrint(from: Balance.modernSets + Balance.vintageSets, minMarket: 8)
                ?? (SetLibrary.set("prismatic-evolutions").prints[0], "prismatic-evolutions")
            let grade = SlabGrade(company: Double.random(in: 0..<1) < 0.6 ? .psa : .cgc, grade: [8.0, 9, 9, 10].randomElement() ?? 9)
            hit = OwnedCard(print: p, setSlug: s, acquired: .now, paid: pack.price, ripID: nil, grade: grade)
        }
        let filler: [CardPrint] = pack.tier == .slab ? [] : (0..<4).compactMap { _ in
            SetLibrary.set(fillerSlug).prints.filter { ["Common", "Uncommon"].contains($0.rarity) }.randomElement()
        }
        return (filler, fillerSlug, hit)
    }
}

extension Condition {
    /// An old card that has been handled for years: more wear, and the loose centering of old print runs.
    static func played() -> Condition {
        var c = Condition.packFresh()
        let cut = Cut(frontLR: Int.random(in: 36...64), frontTB: Int.random(in: 40...60),
                      backLR: Int.random(in: 30...70), backTB: Int.random(in: 30...70))
        c = Condition(cut: cut, corners: c.corners, edges: c.edges, surface: c.surface)
        c.corners = max(5, c.corners - Double(Int.random(in: 0...4)) * 0.5)
        c.edges = max(5, c.edges - Double(Int.random(in: 0...4)) * 0.5)
        c.surface = max(5, c.surface - Double(Int.random(in: 0...3)) * 0.5)
        return c
    }
}
