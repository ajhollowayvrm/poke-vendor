import Foundation

/// Builds one pack from the slot map, in the set's physical pack order: the front card first
/// (tools/export/rip_set.py, ERA_PACKS). The player moves the back cards with the pack trick.
/// A rare special pack, for example a god pack, replaces the slot map (SPECIAL_PACKS).
struct PackBuilder {
    let cardSet: SetData
    /// A special pack kind to build every time, for tests.
    var forced: String?

    struct Pack {
        let cards: [RipCard]
        let special: SpecialPack?
    }

    func build() -> Pack {
        let special = pickSpecial()
        if let special, let ids = special.cards, let order = cardSet.order {
            return Pack(cards: fullPack(ids, order: order), special: special)
        }
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
        // A demigod pack puts a different card from its pool in each of its slots.
        if let special, let slots = special.slots, let pool = special.pool {
            var picks = pool.shuffled()
            for name in slots {
                guard bySlot[name]?.isEmpty == false, let index = picks.popLast() else { continue }
                bySlot[name]?[0] = RipCard(print: cardSet.prints[index], energy: nil)
            }
        }
        guard let order = cardSet.order else {
            return Pack(cards: cardSet.slots.flatMap { bySlot[$0.name] ?? [] } + [energy()], special: special)
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
        return Pack(cards: cards, special: special)
    }

    private func energy() -> RipCard {
        RipCard(print: nil, energy: EnergyType.allCases.randomElement())
    }

    /// One roll for every pack: most packs are not special.
    private func pickSpecial() -> SpecialPack? {
        let specials = cardSet.specialPacks ?? []
        if let forced { return specials.first { $0.kind == forced } }
        var roll = Double.random(in: 0..<1)
        for special in specials {
            if roll < special.odds { return special }
            roll -= special.odds
        }
        return nil
    }

    /// A pack of fixed cards, for example a god pack. The first card and the last card keep their places,
    /// and the cards between them come in a random order.
    private func fullPack(_ ids: [Int], order: [String]) -> [RipCard] {
        var list = ids
        if list.count > 2 {
            list = [list[0]] + list[1..<(list.count - 1)].shuffled() + [list[list.count - 1]]
        }
        var cards: [RipCard] = []
        var next = 0
        for name in order {
            if name == "ENERGY" {
                cards.append(energy())
            } else if next < list.count {
                cards.append(RipCard(print: cardSet.prints[list[next]], energy: nil))
                next += 1
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
