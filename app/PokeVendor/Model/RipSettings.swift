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
    /// The rarity part. Off, and no rarity stops the rip.
    var raritiesOn = true
    /// The rarity entries to stop on, by set slug. A set with no entries uses the hit definition.
    var rarities: [String: [String]] = [:]

    func entries(for slug: String) -> Set<String> { Set(rarities[slug] ?? []) }

    /// Both parts off: Sift goes straight to the summary (docs/18, Rip modes).
    var isEmpty: Bool { dollar == nil && !raritiesOn }
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

/// The rarity ladder of a set: every slot entry, from the most common to the rarest (docs/18, The stop rule).
struct RarityLadder {
    /// The entries in order, most common first.
    let entries: [String]
    /// The entries that each print can come out as, by print index.
    let byPrint: [Int: Set<String>]

    init(set: SetData) {
        var copies: [String: Double] = [:]
        var order: [String] = []
        var byPrint: [Int: Set<String>] = [:]
        for slot in set.slots {
            let total = slot.outcomes.reduce(0) { $0 + $1.odds }
            for outcome in slot.outcomes {
                if copies[outcome.entry] == nil { order.append(outcome.entry) }
                copies[outcome.entry, default: 0] += Double(slot.count) * (total > 0 ? outcome.odds / total : 0)
                for i in outcome.prints { byPrint[i, default: []].insert(outcome.entry) }
            }
        }
        entries = order.sorted { (copies[$0] ?? 0, $1) > (copies[$1] ?? 0, $0) }
        self.byPrint = byPrint
    }

    /// This entry and every rarer one after it.
    func orHigher(_ entry: String) -> [String] {
        guard let i = entries.firstIndex(of: entry) else { return [entry] }
        return Array(entries[i...])
    }
}

@MainActor
extension SetLibrary {
    private static var ladders: [String: RarityLadder] = [:]

    static func ladder(_ slug: String) -> RarityLadder {
        if let l = ladders[slug] { return l }
        let l = RarityLadder(set: set(slug))
        ladders[slug] = l
        return l
    }

    /// The index of a print in its set, for the ladder.
    static func printIndex(_ print: CardPrint, in slug: String) -> Int? {
        set(slug).prints.firstIndex { $0.num == print.num && $0.variant == print.variant }
    }
}

@MainActor
extension GameStore {
    func setRipMode(_ mode: RipMode) {
        data.settings.ripMode = mode
        save()
    }

    func setStopDollar(_ dollar: Double?) {
        data.settings.stopRule.dollar = dollar
        save()
    }

    func setRaritiesOn(_ on: Bool) {
        data.settings.stopRule.raritiesOn = on
        save()
    }

    func setStopEntries(_ entries: [String], for slug: String) {
        if entries.isEmpty { data.settings.stopRule.rarities[slug] = nil } else { data.settings.stopRule.rarities[slug] = entries }
        save()
    }

    /// True when a card stops Fast and Sift: the dollar amount, or a rarity entry picked for its set. With no
    /// entries picked for the set, a hit stops the rip (docs/18, The stop rule).
    func stops(_ card: RipCard, in slug: String) -> Bool {
        guard let print = card.print else { return false }
        let rule = data.settings.stopRule
        if let dollar = rule.dollar, card.market >= dollar { return true }
        guard rule.raritiesOn else { return false }
        let picked = rule.entries(for: slug)
        // No rarities picked for this set: a hit stops the rip.
        if picked.isEmpty { return card.isHit }
        guard let i = SetLibrary.printIndex(print, in: slug) else { return false }
        let entries = SetLibrary.ladder(slug).byPrint[i] ?? []
        return !entries.isDisjoint(with: picked)
    }
}
