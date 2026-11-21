import Foundation

/// Why a Rip & Ship order is refunded.
enum RipShipRefund { case notOpened, resealed, chargeback, seized }

/// Rip & Ship state (proposal 5.1). Phase 0 holds the ban and strike fields. Phase 5 adds the orders.
struct RipShipState: Codable, Hashable {
    /// Whatnot bans the player from streams until this day.
    var bannedUntil: Int?
    var banReason: String?
    /// The days of Whatnot strikes, and the permanent end of Rip & Ship (normal Whatnot streams stay).
    var strikes: [Int] = []
    var ripShipClosed = false
    /// Gross Rip & Ship sales by day, for the 4-week commission tier.
    var grossByDay: [Int: Double] = [:]

    init() {}

    /// A save from an older build can miss newer fields. Each missing field takes its default.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func v<T: Decodable>(_ key: CodingKeys, _ fallback: T) -> T { (try? c.decodeIfPresent(T.self, forKey: key)) ?? fallback }
        bannedUntil = v(.bannedUntil, nil)
        banReason = v(.banReason, nil)
        strikes = v(.strikes, [])
        ripShipClosed = v(.ripShipClosed, false)
        grossByDay = v(.grossByDay, [:])
    }
}

@MainActor
extension GameStore {
    /// Whatnot bans the player from streams. Phase 0 sets the date. Phase 5 adds the line and the strike logic.
    func banFromWhatnot(days: Int, reason: String) {
        let end = data.day + days
        data.ripShip.bannedUntil = max(data.ripShip.bannedUntil ?? -1, end)
        data.ripShip.banReason = reason
    }

    /// The only function that pays a Rip & Ship buyer back. Phase 0 stub: no orders exist yet.
    @discardableResult
    func refundRipShipOrder(_ orderID: UUID, reason: RipShipRefund = .notOpened) -> String { "" }

    /// Part C's "make it right" on a palm sends the palmed cards to the buyer. Phase 0 stub: no orders exist yet.
    func returnPalmedCards(_ orderID: UUID) {}
}
