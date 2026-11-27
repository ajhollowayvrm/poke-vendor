import Foundation

// The PSA box (docs/10-grading.md, The PSA box). PSA's Value Bulk level needs 20 cards or more in one order. The player
// sets cards aside in the box until it holds enough, then sends the box as one order. A card in the box stays home: it
// has a status, so no sell, list, shelf, or trade path offers it. The hub shows each PSA bill to come, with the most
// that the upcharges could add.

@MainActor
extension GameStore {
    /// PSA's Value Bulk level: the cheapest one, with a minimum order.
    var psaBulkTier: GradingTier? { Balance.gradingTiers[.psa]?.first { $0.minCards > 1 } }

    /// A raw card that can go to a grader: free, or in the PSA box.
    nonisolated static func gradable(_ status: ItemStatus?) -> Bool { status == nil || status == .inPsaBox }

    /// The cards in the PSA box, the dearest first.
    var psaBox: [OwnedCard] { data.raw.filter { $0.status == .inPsaBox }.sorted { $0.market > $1.market } }

    /// True when one or more of these cards can go in the box: raw, free, not in the PC, and not a known fake.
    func canBox(_ ids: Set<UUID>) -> Bool {
        data.raw.contains { ids.contains($0.id) && $0.status == nil && !$0.setAside && !$0.isKnownFake }
    }

    func addToPsaBox(_ ids: Set<UUID>) {
        var count = 0
        for i in data.raw.indices where ids.contains(data.raw[i].id) && data.raw[i].status == nil
            && !data.raw[i].setAside && !data.raw[i].isKnownFake {
            data.raw[i].status = .inPsaBox
            count += 1
        }
        guard count > 0 else { return }
        log("Put \(count) card\(count == 1 ? "" : "s") in your PSA box. It holds \(psaBox.count).")
        save()
    }

    func removeFromPsaBox(_ ids: Set<UUID>) {
        for i in data.raw.indices where ids.contains(data.raw[i].id) && data.raw[i].status == .inPsaBox {
            data.raw[i].status = nil
        }
        save()
    }

    /// Why the box cannot go to PSA as a Value Bulk order now, or nil when it can.
    var psaBoxBlock: String? {
        guard let tier = psaBulkTier else { return "PSA has no bulk level." }
        if tier.membersOnly && !hasUpgrade(.psaMembership) { return "Value Bulk is for PSA members." }
        let left = tier.minCards - psaBox.count
        return left > 0 ? "\(left) more card\(left == 1 ? "" : "s") to reach \(tier.minCards)" : nil
    }

    /// The cards in the box that PSA could upcharge: their PSA 10 price is over the Value Bulk cap.
    var psaBoxUpchargeRisk: [OwnedCard] {
        guard let cap = psaBulkTier?.maxValue else { return [] }
        return psaBox.filter { ($0.print.gradedPrice("psa10") ?? $0.market) > cap }
    }

    // MARK: - Bills to come

    /// The most that the upcharges could add to a PSA bill that is still at PSA: each card graded a 10, against the
    /// level's cap. The bill already holds the upcharges of cards that came back.
    func possibleUpcharge(_ bill: GradingBill) -> Double {
        guard bill.company == .psa, !bill.held else { return 0 }
        return data.raw.reduce(0) { sum, card in
            guard case .atGrader(_, let tier, _, let id) = card.status, id == bill.id else { return sum }
            return sum + (psaUpcharge(tier: tier, value: card.print.gradedPrice("psa10") ?? card.market)?.fee ?? 0)
        }
    }
}
