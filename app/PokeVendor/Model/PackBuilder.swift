import Foundation

/// Builds one pack from the slot map, in the set's physical pack order: the front card first
/// (tools/export/rip_set.py, ERA_PACKS). The player moves the back cards with the pack trick.
struct PackBuilder {
    let cardSet: SetData

    func build() -> [RipCard] {
        var bySlot: [String: [RipCard]] = [:]
        for slot in cardSet.slots {
            // A pack does not repeat a card inside one slot.
            var used = Set<Int>()
            for _ in 0..<slot.count {
                let outcome = pick(slot.outcomes)
                var candidates = outcome.prints.filter { !used.contains($0) }
                if candidates.isEmpty { candidates = outcome.prints }
                guard let index = candidates.randomElement() else { continue }
                used.insert(index)
                bySlot[slot.name, default: []].append(RipCard(print: cardSet.prints[index], energy: nil))
            }
        }
        let energy = { RipCard(print: nil, energy: EnergyType.allCases.randomElement()) }
        guard let order = cardSet.order else {
            return cardSet.slots.flatMap { bySlot[$0.name] ?? [] } + [energy()]
        }
        var cards: [RipCard] = []
        for name in order {
            if name == "ENERGY" {
                cards.append(energy())
            } else if let card = bySlot[name]?.first {
                cards.append(card)
                bySlot[name]?.removeFirst()
            }
        }
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
