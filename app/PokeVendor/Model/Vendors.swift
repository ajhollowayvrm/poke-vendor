import Foundation

// The vendor tables on a card show floor (docs/20-card-shows.md, The floor).

enum VendorKind: CaseIterable, Hashable {
    case vintageDealer, modernDealer, gameShop, collector, mysteryPacks
    /// The lot at a garage sale or an estate sale (docs/17-calendar-and-events.md, Posted entries).
    case garageSale, estateSale

    var label: String {
        switch self {
        case .vintageDealer: "Vintage dealer"
        case .modernDealer: "Modern dealer"
        case .gameShop: "Game shop booth"
        case .collector: "Collector clearing out"
        case .mysteryPacks: "Mystery packs"
        case .garageSale: "Garage sale"
        case .estateSale: "Estate sale"
        }
    }

    var icon: String {
        switch self {
        case .vintageDealer: "crown"
        case .modernDealer: "sparkles"
        case .gameShop: "storefront"
        case .collector: "person.crop.square"
        case .mysteryPacks: "questionmark.square.dashed"
        case .garageSale: "house"
        case .estateSale: "house.and.flag"
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
        case .garageSale: Balance.garagePriceRange
        case .estateSale: Balance.estatePriceRange
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
        case .garageSale: 0.6
        case .estateSale: 0.35
        }
    }

    var tagline: String {
        switch self {
        case .vintageDealer: "Knows what vintage is worth. Prices high and rarely deals."
        case .modernDealer: "New singles and sealed at about market."
        case .gameShop: "A local shop's booth. Mostly sealed."
        case .collector: "Selling off a collection. Cheap, mixed, and often worn. Likes to deal."
        case .mysteryPacks: "Repacks: mostly filler, one guaranteed hit."
        case .garageSale: "A box of old cards on a folding table. The seller does not know card values."
        case .estateSale: "A collection priced by the estate company. Fair to the market, and lower each day."
        }
    }

    private static let places = ["Kanto", "Johto", "Pallet", "Cerulean", "Vermilion", "Celadon", "Lavender", "Saffron",
                                 "Viridian", "Goldenrod", "Ecruteak", "Mahogany", "Hoenn", "Sinnoh", "Unova", "Kalos", "Galar", "Paldea"]
    private static let people = ["Dave", "Rachel", "Mike", "Sarah", "Tom", "Jess", "Carlos", "Amy", "Kevin", "Laura", "Greg", "Nina"]

    /// A business name for a dealer or a shop, or a person for a collector.
    static func randomName(_ kind: VendorKind) -> String {
        let place = places.randomElement() ?? "Kanto"
        let person = people.randomElement() ?? "Dave"
        switch kind {
        case .vintageDealer:
            return Bool.random() ? (businesses[kind]?.randomElement() ?? "Holo Vault")
                : "\(place) \(["Classics", "Vintage", "Retro Cards", "Holo Vault", "Card Archive"].randomElement() ?? "Classics")"
        case .modernDealer:
            return Bool.random() ? (businesses[kind]?.randomElement() ?? "Top Deck")
                : "\(place) \(["Collectibles", "Card Co.", "Trading", "TCG", "Singles"].randomElement() ?? "Cards")"
        case .gameShop:
            return Bool.random() ? (businesses[kind]?.randomElement() ?? "Critical Hit Games")
                : "\(place) \(["Games", "Hobby", "Game Room", "Comics & Cards"].randomElement() ?? "Games")"
        case .collector:
            return ["\(person)'s childhood binder", "\(person), clearing out", "\(person)'s old collection",
                    "\(person)'s shoebox of cards", "\(person) and family, selling binders"].randomElement() ?? person
        case .mysteryPacks:
            return businesses[kind]?.randomElement() ?? "Repacks"
        case .garageSale:
            return "\(person)'s garage sale"
        case .estateSale:
            return "The \(person) estate"
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
struct MysteryPack: Codable, Hashable {
    enum Tier: Codable, Hashable { case modern, vintage, slab }

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

enum VendorGoods: Codable, Hashable {
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
    /// A recurring vendor that the game remembers (docs/21-relationships-and-reputation.md).
    var contactID: String?

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
    /// Recurring vendors take some of the tables. The rest are strangers.
    static func tables(for size: ShowSize, recurring: [Contact]) -> [Vendor] {
        var vendors = recurring.map { Vendor(name: $0.name, kind: $0.kind.vendorKind, items: stock($0.kind.vendorKind), contactID: $0.id) }
        var fill = tables(for: size)
        // Drop one stranger of the same kind for each recurring vendor, so the table count stays the same.
        for v in vendors {
            if let i = fill.firstIndex(where: { $0.kind == v.kind && $0.contactID == nil }) { fill.remove(at: i) }
        }
        let names = Set(vendors.map(\.name))
        vendors += fill.filter { !names.contains($0.name) }
        return vendors.shuffled()
    }

    static func tables(for size: ShowSize) -> [Vendor] {
        let plan: [(VendorKind, Int)] = size == .regional
            ? [(.vintageDealer, 8), (.modernDealer, 8), (.gameShop, 4), (.collector, 7), (.mysteryPacks, 3)]
            : [(.vintageDealer, 2), (.modernDealer, 3), (.gameShop, 2), (.collector, 4), (.mysteryPacks, 1)]
        var used: Set<String> = []
        var vendors: [Vendor] = []
        for (kind, count) in plan {
            for _ in 0..<count {
                var name = VendorKind.randomName(kind)
                var tries = 0
                while used.contains(name) && tries < 20 {
                    name = VendorKind.randomName(kind)
                    tries += 1
                }
                used.insert(name)
                vendors.append(Vendor(name: name, kind: kind, items: stock(kind)))
            }
        }
        return vendors.shuffled()
    }

    static func stock(_ kind: VendorKind) -> [VendorItem] {
        var items: [VendorItem] = []
        func add(_ count: ClosedRange<Int>, _ make: () -> VendorItem?) {
            items += (0..<Int.random(in: count)).compactMap { _ in make() }
        }
        switch kind {
        case .vintageDealer:
            add(10...16) { single(from: Balance.vintageSets, minMarket: 5, kind: kind, vintage: true) }
            add(3...6) { single(from: Balance.olderSets, minMarket: 8, kind: kind, vintage: true) }
            add(3...6) { slab(from: Balance.vintageSets, kind: kind) }
            // Vintage sealed first. Out-of-print modern sealed fills in.
            add(2...4) { sealed(from: Double.random(in: 0..<1) < 0.5 ? Balance.vintageSets : Balance.olderSets, kind: kind) }
        case .modernDealer:
            add(12...20) { single(from: Balance.modernSets, minMarket: 3, kind: kind) }
            add(1...3) { slab(from: Balance.modernSets + Balance.olderSets, kind: kind) }
            add(3...6) { sealed(from: Balance.modernSets, kind: kind) }
        case .gameShop:
            add(8...14) { sealed(from: Balance.modernSets + Balance.olderSets, kind: kind) }
            add(4...8) { single(from: Balance.modernSets, minMarket: 2, kind: kind) }
        case .collector:
            // A collection can hold anything, and old cards show their age.
            let pool = Bool.random() ? Balance.vintageSets + Balance.olderSets : Balance.modernSets + Balance.olderSets
            add(10...18) { single(from: pool, minMarket: 1.5, kind: kind, vintage: true) }
            add(0...2) { slab(from: pool, kind: kind) }
            add(1...3) { sealed(from: pool, kind: kind) }
        case .mysteryPacks:
            items += MysteryPack.catalog.map { VendorItem(goods: .mystery($0), price: $0.price, market: nil) }
            add(3...6) { single(from: Balance.modernSets + Balance.vintageSets, minMarket: 5, kind: kind) }
        case .garageSale, .estateSale:
            // `lot(kind:count:priceFactor:)` builds a sale. This is the plain fallback.
            return lot(kind: kind, count: 10, priceFactor: 1)
        }
        // The same product can show up twice. A table shows each product once.
        var seen: Set<String> = []
        items = items.filter { item in
            guard case .sealed(let p) = item.goods else { return true }
            return seen.insert(p.id).inserted
        }
        return items.sorted { ($0.market ?? $0.price) > ($1.market ?? $1.price) }
    }

    private static func price(_ market: Double, _ kind: VendorKind) -> Double {
        ShowSession.round(max(0.5, market * Double.random(in: kind.priceRange)))
    }

    /// The lot at a garage sale or an estate sale: mostly old singles, some worn, and now and then old sealed
    /// product. `count` is how many good cards are left when the player arrives. `priceFactor` is the estate
    /// sale's markdown for the day.
    static func lot(kind: VendorKind, count: Int, priceFactor: Double) -> [VendorItem] {
        var items: [VendorItem] = []
        let old = Balance.vintageSets + Balance.olderSets
        for _ in 0..<count {
            let pool = Double.random(in: 0..<1) < 0.7 ? old : Balance.modernSets
            if var item = single(from: pool, minMarket: kind == .estateSale ? 2 : 1, kind: kind, vintage: true) {
                item.price = ShowSession.round(max(0.5, item.price * priceFactor))
                items.append(item)
            }
        }
        let sealedCount = kind == .estateSale ? Int.random(in: 0...3) : Int.random(in: 0...2)
        for _ in 0..<sealedCount where Double.random(in: 0..<1) < 0.6 {
            if var item = sealed(from: old, kind: kind) {
                item.price = ShowSession.round(max(1, item.price * priceFactor))
                items.append(item)
            }
        }
        var seen: Set<String> = []
        items = items.filter { item in
            guard case .sealed(let p) = item.goods else { return true }
            return seen.insert(p.id).inserted
        }
        return items.sorted { ($0.market ?? $0.price) > ($1.market ?? $1.price) }
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
