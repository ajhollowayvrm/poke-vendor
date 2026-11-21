import Foundation

/// A drawing the player entered. One entry for each drawing (proposal 1.4).
/// A new field must be Optional. This type decodes inside an array or a dictionary, so a missing key drops all of it.
struct DrawingEntry: Codable, Identifiable, Hashable {
    var id = UUID()
    let chain: LocalStore
    let productID: String
    /// The draw happens at the End Day of this day. The result is in the next morning's report.
    let drawDay: Int
    let price: Double
}

/// An online order that the store can still cancel (proposal 1.5).
/// A new field must be Optional. This type decodes inside an array or a dictionary, so a missing key drops all of it.
struct DropOrder: Codable, Identifiable, Hashable {
    var id = UUID()
    let itemID: UUID
    /// "Pokemon Center" or "Target.com".
    let source: String
    let name: String
    let rollDay: Int
    let chance: Double
    let refund: Double
    let bot: Bool
}

/// Monthly restock alerts (proposal 1.8). The $150 restock alert bot upgrade stays as it is.
enum AlertTier: String, Codable, CaseIterable, Hashable {
    case none, oneChain, allChains

    var fee: Double {
        switch self {
        case .none: 0
        case .oneChain: Balance.alertFeeOneChain
        case .allChains: Balance.alertFeeAllChains
        }
    }

    var name: String {
        switch self {
        case .none: "No alerts"
        case .oneChain: "One chain"
        case .allChains: "Every chain"
        }
    }
}

/// A distributor order that never arrived. The refund comes after a claim.
/// A new field must be Optional. This type decodes inside an array or a dictionary, so a missing key drops all of it.
struct MissingShipment: Codable, Identifiable, Hashable {
    var id = UUID()
    let name: String
    /// The day the player learns that the order is lost (its normal delivery day).
    let noticeDay: Int
    let refundDay: Int
    let refund: Double
    var noticed = false
}

extension Balance {
    /// The monthly fee of each alert tier.
    static let alertFeeOneChain = 8.0
    static let alertFeeAllChains = 25.0
}
