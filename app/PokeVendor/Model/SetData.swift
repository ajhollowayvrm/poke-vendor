import Foundation

// The set file that tools/export/rip_set.py writes.

struct GradedPrices: Codable, Hashable {
    let cgc10: Double?
    let cgc9: Double?
    let psa10: Double?
    let psa9: Double?
    let bgs10: Double?
    let bgs95: Double?

    enum CodingKeys: String, CodingKey {
        case cgc10, cgc9, psa10, psa9, bgs10
        case bgs95 = "bgs9_5"
    }
}

struct CardPrint: Codable, Hashable {
    let num: String
    let name: String
    let rarity: String
    let variant: String
    let market: Double?
    let graded: GradedPrices
    let image: String?
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

struct SetData: Codable {
    let slug: String
    let name: String
    let packCost: Double?
    let packImage: String?
    let slots: [PackSlot]
    let prints: [CardPrint]

    static func load(_ slug: String) -> SetData {
        guard let url = Bundle.main.url(forResource: slug, withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let set = try? JSONDecoder().decode(SetData.self, from: data) else {
            fatalError("The set file \(slug).json is missing or not valid")
        }
        return set
    }
}
