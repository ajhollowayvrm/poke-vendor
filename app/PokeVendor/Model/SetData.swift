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

struct Product: Codable, Hashable, Identifiable {
    let id: String
    let name: String
    let kind: String
    let packs: Int
    let market: Double
    let msrp: Double?
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
    let products: [Product]?

    static func load(_ slug: String) -> SetData {
        guard let url = Bundle.main.url(forResource: slug, withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let set = try? JSONDecoder().decode(SetData.self, from: data) else {
            fatalError("The set file \(slug).json is missing or not valid")
        }
        return set
    }
}
