import Foundation

/// The gray market plug (proposal 4.7). Phase 0 holds the fields without orders. Phase 4 adds the orders.
struct PlugState: Codable, Hashable {
    var name: String?
    var unlockedDay: Int?
    /// The plug vanished on this day. A new plug can appear later.
    var goneDay: Int?
    var cleanOrders = 0

    init() {}

    /// A save from an older build can miss newer fields. Each missing field takes its default.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func v<T: Decodable>(_ key: CodingKeys, _ fallback: T) -> T { (try? c.decodeIfPresent(T.self, forKey: key)) ?? fallback }
        name = v(.name, nil)
        unlockedDay = v(.unlockedDay, nil)
        goneDay = v(.goneDay, nil)
        cleanOrders = v(.cleanOrders, 0)
    }
}
