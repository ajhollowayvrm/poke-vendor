import Foundation

// Rip modes and the stop rule (docs/18-ripping.md, Rip modes; The stop rule).

enum RipMode: String, Codable, CaseIterable, Hashable {
    /// The player turns every card.
    case normal
    /// The tear and the pack trick play. The cards advance by themselves until the stop rule matches.
    case fast
    /// No animation. Straight to the summary, unless the stop rule matches.
    case sift

    var label: String {
        switch self {
        case .normal: "Normal"
        case .fast: "Fast"
        case .sift: "Sift"
        }
    }

    var detail: String {
        switch self {
        case .normal: "Swipe or tap every card."
        case .fast: "The pack opens and the cards advance by themselves. It stops on a card that matches your stop rule."
        case .sift: "No animation. The rip runs to the summary. It stops only on a card that matches your stop rule."
        }
    }
}

/// When Fast and Sift stop: a dollar amount, or rarities picked for each set (docs/18, The stop rule).
struct StopRule: Codable, Hashable {
    /// Stop on a card worth at least this much. Nil turns the part off.
    var dollar: Double? = Balance.defaultStopDollar
    /// The rarity entries to stop on, by set slug. A set with no entries uses the hit definition.
    var rarities: [String: [String]] = [:]

    func entries(for slug: String) -> Set<String> { Set(rarities[slug] ?? []) }
}

/// The player's settings.
struct Settings: Codable, Hashable {
    var ripMode = RipMode.normal
    var stopRule = StopRule()
}

extension Balance {
    static let defaultStopDollar = 20.0
    /// Seconds between cards in Fast, and in Sift.
    static let fastStepSeconds = 0.45
    static let siftStepSeconds = 0.08
}
