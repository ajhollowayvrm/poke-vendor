import Foundation

// Counterfeit risk (docs/14-counterfeit-risk.md).

/// How good a fake is. The tier sets how each check catches it.
enum FakeTier: Int, Codable, Comparable, CaseIterable {
    /// An obvious bootleg: the eyeball check almost always catches it.
    case bootleg
    /// A convincing fake: it needs the paid check or the tool.
    case convincing
    /// A professional counterfeit: only full grading is sure.
    case professional

    static func < (a: FakeTier, b: FakeTier) -> Bool { a.rawValue < b.rawValue }

    var label: String {
        switch self {
        case .bootleg: "Obvious bootleg"
        case .convincing: "Convincing fake"
        case .professional: "Professional counterfeit"
        }
    }
}

/// Where an item came from. Each source has its own fake rate (docs/14-counterfeit-risk.md, Where the risk lives).
enum FakeSource: Hashable {
    /// Pokemon Center, Amazon, camping, big stores, and the game shop shelf: no risk.
    case none
    case reseller
    case ebay
    case facebook
    case garageSale
    case estateSale
    /// A stranger at a show or a meet.
    case stranger
    /// A contact the game remembers. A better relationship means less risk.
    case contact(StandingLevel)
    /// The game shop display case and buy-ins.
    case shopCase
    case wholesale
}
