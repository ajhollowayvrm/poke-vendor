import Foundation

// The set file that tools/export/rip_set.py writes.

struct CardPrint: Codable, Hashable {
    let num: String
    let name: String
    let rarity: String
    let variant: String
    let market: Double?
    /// Graded prices by key, for example "psa10" or "bgs9_5". A grade with no sales data is nil.
    let graded: [String: Double?]
    let image: String?
}

extension CardPrint {
    func gradedPrice(_ key: String) -> Double? { graded[key] ?? nil }
}

/// A sealed product from catalog.json (tools/export/catalog.py).
struct Product: Codable, Hashable, Identifiable {
    struct PackMix: Codable, Hashable {
        let slug: String
        let packs: Int
    }

    /// A card in the product that is not in a pack, for example a promo.
    struct Promo: Codable, Hashable {
        let name: String
        let num: String
        let setName: String
        let rarity: String
        let variant: String
        let market: Double?
        let graded: [String: Double?]
        let image: String?

        var print: CardPrint {
            CardPrint(num: num, name: name, rarity: rarity, variant: variant, market: market, graded: graded, image: image)
        }
    }

    let id: String
    let name: String
    let kind: String
    let packs: Int
    let mix: [PackMix]
    let promos: [Promo]
    /// True when the product holds one random promo from the list, for example a Surprise Box.
    let pickOnePromo: Bool
    let market: Double
    let msrp: Double?
    let image: String?
    /// Still sold at retail (a Scarlet & Violet product).
    let inPrint: Bool?

    /// The set of each pack, in order.
    var packSlugs: [String] { mix.flatMap { Array(repeating: $0.slug, count: $0.packs) } }
    var homeSlug: String { mix.first?.slug ?? "prismatic-evolutions" }
    /// A warehouse-club product. Pokemon Center drops and local shelves do not carry it.
    var isClubExclusive: Bool { name.contains("Costco") || name.contains("Sam's Club") }
}

struct SlotOutcome: Codable {
    let name: String
    let entry: String
    let odds: Double
    let prints: [Int]
}

struct PackSlot: Codable {
    let name: String
    let count: Int
    let outcomes: [SlotOutcome]
}

/// A rare pack type that replaces the slot map (tools/export/rip_set.py, SPECIAL_PACKS).
struct SpecialPack: Codable, Equatable {
    /// "demigod" or "god".
    let kind: String
    /// The chance for one pack.
    let odds: Double
    /// A demigod pack: the slots that each get a different card from the pool.
    let slots: [String]?
    let pool: [Int]?
    /// A god pack: every card, front card first.
    let cards: [Int]?

    var isGod: Bool { kind == "god" }
    var title: String { isGod ? "GOD PACK" : "DEMIGOD PACK" }
    /// Only the cards that make the pack special count toward the moment the player sees it.
    func isSpecialHit(_ card: RipCard) -> Bool {
        guard let print = card.print else { return false }
        return isGod || print.rarity == "Special illustration rare"
    }
}

struct SetData: Codable {
    let slug: String
    let name: String
    let packCost: Double?
    let packImage: String?
    let slots: [PackSlot]
    let prints: [CardPrint]
    let era: String?
    /// The series name on the wrapper, for example "Sword & Shield".
    let series: String?
    /// The physical card order, front card first: slot names, and "ENERGY" for the extra Basic Energy.
    let order: [String]?
    /// How many cards the pack trick moves from the back to the front.
    let trick: Int?
    /// Rare pack types that replace the slot map, for example a god pack.
    let specialPacks: [SpecialPack]?

    /// For the wrapper, for example "10 CARDS + 1 ENERGY".
    var packLabel: String {
        guard let order else { return "10 CARDS + 1 ENERGY" }
        let energy = order.filter { $0 == "ENERGY" }.count
        return energy > 0 ? "\(order.count - energy) CARDS + \(energy) ENERGY" : "\(order.count) CARDS"
    }

    static func load(_ slug: String) -> SetData {
        guard let url = Bundle.main.url(forResource: slug, withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let set = try? JSONDecoder().decode(SetData.self, from: data) else {
            fatalError("The set file \(slug).json is missing or not valid")
        }
        return set
    }
}
