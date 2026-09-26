import Foundation

/// Builds one pack from the slot map, in pack order: the front card first.
struct PackBuilder {
    let cardSet: SetData

    func build() -> [RipCard] {
        var cards: [RipCard] = []
        for slot in cardSet.slots {
            // A pack does not repeat a card inside one slot.
            var used = Set<Int>()
            for _ in 0..<slot.count {
                let outcome = pick(slot.outcomes)
                var candidates = outcome.prints.filter { !used.contains($0) }
                if candidates.isEmpty { candidates = outcome.prints }
                guard let index = candidates.randomElement() else { continue }
                used.insert(index)
                cards.append(RipCard(print: cardSet.prints[index], energy: nil))
            }
        }
        cards.append(RipCard(print: nil, energy: EnergyType.allCases.randomElement()))
        return cards
    }

    private func pick(_ outcomes: [SlotOutcome]) -> SlotOutcome {
        let total = outcomes.reduce(0) { $0 + $1.odds }
        var roll = Double.random(in: 0..<total)
        for outcome in outcomes {
            if roll < outcome.odds { return outcome }
            roll -= outcome.odds
        }
        return outcomes[outcomes.count - 1]
    }
}
