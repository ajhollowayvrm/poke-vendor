import Foundation

// Master sets (docs/08-ui-direction.md, Master sets). The player adds a card to a master set. The card then leaves
// the regular Inventory and fills one slot of its set's binder. A master set holds one copy of every print in the
// set: each number in each variant, with the reverse holos and the ball patterns.

extension Balance {
    /// The reward for a completed master set grows with the square root of the set's value (one copy of each print).
    static let masterSetReputationRange = 3...40
    static let masterSetReputationPerRoot = 0.5
    static let masterSetFollowersPerRoot = 10.0
}

enum MasterSet {
    /// One slot for each number and variant.
    static func key(_ print: CardPrint) -> String { "\(print.num)|\(print.variant)" }

    private static var slotCache: [String: [CardPrint]] = [:]

    /// The prints of a set, one for each slot, in set order.
    static func slots(_ slug: String) -> [CardPrint] {
        if let cached = slotCache[slug] { return cached }
        var seen: Set<String> = []
        let slots = SetLibrary.set(slug).prints
            .filter { seen.insert(key($0)).inserted }
            .sorted { setOrder($0.num) != setOrder($1.num) ? setOrder($0.num) < setOrder($1.num) : $0.variant < $1.variant }
        slotCache[slug] = slots
        return slots
    }

    /// The value of a set: one copy of each print at its market price.
    static func value(_ slug: String) -> Double { slots(slug).reduce(0) { $0 + ($1.market ?? 0) } }
}

/// The progress of one master set.
struct MasterSetProgress: Identifiable {
    let slug: String
    let have: Int
    let total: Int
    /// The market value of the cards in the binder.
    let value: Double
    var id: String { slug }
    var complete: Bool { total > 0 && have >= total }
}

@MainActor
extension GameStore {
    /// The cards in master set binders.
    var masterSetCards: [OwnedCard] { (data.raw + data.slabs).filter(\.inMasterSet) }

    /// The card in this print's slot, if the slot is filled.
    func masterSetCard(slug: String, key: String) -> OwnedCard? {
        masterSetCards.first { $0.setSlug == slug && $0.masterKey == key }
    }

    /// Why the card cannot go into its master set, or nil when it can.
    func masterSetBlock(_ card: OwnedCard) -> String? {
        if card.inMasterSet { return "The card is in its master set." }
        if card.status != nil { return "The card has a status." }
        if card.isKnownFake { return "You know the card is a fake." }
        if masterSetCard(slug: card.setSlug, key: card.masterKey) != nil { return "Your master set already has this print." }
        return nil
    }

    /// Puts each card into the empty slot of its print. A card that leaves the PC for a master set is no longer in
    /// the PC. Returns the number of cards that went in.
    @discardableResult
    func addToMasterSet(_ ids: Set<UUID>) -> Int {
        var added = 0
        var slugs: Set<String> = []
        for id in ids {
            guard let card = card(id), masterSetBlock(card) == nil else { continue }
            if let i = data.raw.firstIndex(where: { $0.id == id }) {
                data.raw[i].masterSet = true
                data.raw[i].pc = false
            } else if let i = data.slabs.firstIndex(where: { $0.id == id }) {
                data.slabs[i].masterSet = true
                data.slabs[i].pc = false
            }
            added += 1
            slugs.insert(card.setSlug)
        }
        for slug in slugs { completeMasterSetIfDone(slug) }
        save()
        return added
    }

    /// Takes a card out of its master set, back to the regular Inventory. A completed set keeps its reward.
    func removeFromMasterSet(_ id: UUID) {
        if let i = data.raw.firstIndex(where: { $0.id == id }) { data.raw[i].masterSet = nil }
        if let i = data.slabs.firstIndex(where: { $0.id == id }) { data.slabs[i].masterSet = nil }
        save()
    }

    func masterSetProgress(_ slug: String) -> MasterSetProgress {
        let cards = masterSetCards.filter { $0.setSlug == slug }
        return MasterSetProgress(slug: slug, have: Set(cards.map(\.masterKey)).count, total: MasterSet.slots(slug).count,
                                 value: cards.reduce(0) { $0 + $1.market })
    }

    /// The sets with a card in the binder, or a completed set. The most complete set comes first.
    var startedMasterSets: [MasterSetProgress] {
        let slugs = Set(masterSetCards.map(\.setSlug)).union(data.completedMasterSets.keys)
        return slugs.map(masterSetProgress).sorted {
            let a = Double($0.have) / Double(max($0.total, 1)), b = Double($1.have) / Double(max($1.total, 1))
            return a != b ? a > b : $0.slug < $1.slug
        }
    }

    func isMasterSetCompleted(_ slug: String) -> Bool { data.completedMasterSets[slug] != nil }

    /// The first completion of a set pays reputation and followers, scaled by the value of the set. A set pays once,
    /// so a card that leaves and comes back does not pay again.
    private func completeMasterSetIfDone(_ slug: String) {
        guard !isMasterSetCompleted(slug), masterSetProgress(slug).complete else { return }
        data.completedMasterSets[slug] = data.day
        let root = MasterSet.value(slug).squareRoot()
        let range = Balance.masterSetReputationRange
        let rep = min(range.upperBound, max(range.lowerBound, Int(root * Balance.masterSetReputationPerRoot)))
        addReputation(rep)
        var reward = "Reputation +\(rep)"
        if hasAccount {
            let followers = Int(root * Balance.masterSetFollowersPerRoot)
            data.social.followers += followers
            reward += ", followers +\(followers)"
        }
        log("You completed the \(SetLibrary.set(slug).name) master set. \(reward).")
        Haptics.hit()
    }
}
