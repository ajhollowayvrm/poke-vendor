import Foundation

// Crack and resubmit (docs/10-grading.md, Crack and resubmit). The player can crack a slab to get the raw card back,
// or send a slab in its case to a grading company. The same company reviews the grade. Another company crosses the
// card over into its own slab. The fee is paid in both cases.

extension SlabGrade {
    /// The order of grades for a review or a crossover. A Black Label and a Pristine 10 are above a plain 10.
    var rank: Double { grade + (blackLabel || pristine ? 0.25 : 0) }

    /// True when a resubmitted slab takes the new grade. A review never lowers a grade, and it changes the slab
    /// only when the grade goes up. A crossover needs the same grade or better, or the card stays in its old slab.
    func accepts(_ new: SlabGrade) -> Bool {
        new.company == company ? new.rank > rank : new.rank >= rank
    }
}

@MainActor
extension GameStore {
    /// The chance that cracking a slab nicks a corner or an edge of the card.
    static let crackDamageChance = 0.03

    /// True when the slab can be cracked or resubmitted: it is in hand, and not in the PC, a master set, or the showcase.
    func canResubmit(_ card: OwnedCard) -> Bool {
        card.grade != nil && card.status == nil && !card.setAside
    }

    /// Cracks the slabs. Each card goes back to Raw with its true condition. A grader already checked it, so it stays
    /// verified. A crack can nick the card. Returns the number of nicked cards.
    @discardableResult
    func crack(_ ids: Set<UUID>) -> Int {
        let cracked = data.slabs.filter { ids.contains($0.id) && canResubmit($0) }
        guard !cracked.isEmpty else { return 0 }
        var nicked: [String] = []
        for var card in cracked {
            let label = card.grade?.label ?? ""
            card.grade = nil
            if Double.random(in: 0..<1) < Self.crackDamageChance {
                if Bool.random() { card.condition.corners = max(1, card.condition.corners - 0.5) } else {
                    card.condition.edges = max(1, card.condition.edges - 0.5)
                }
                nicked.append("\(card.print.name) (\(label))")
            }
            data.raw.append(card)
        }
        let crackedIDs = Set(cracked.map(\.id))
        data.slabs.removeAll { crackedIDs.contains($0.id) }
        let names = cracked.count == 1 ? "\(cracked[0].print.name) \(cracked[0].grade?.label ?? "")" : "\(cracked.count) slabs"
        log("Cracked \(names). The card\(cracked.count == 1 ? " is" : "s are") in Raw now.")
        if !nicked.isEmpty {
            log("The case broke badly and nicked \(nicked.joined(separator: ", ")).")
        }
        save()
        return nicked.count
    }

    /// Sends slabs in their cases to a grading company. The same company reviews the grade. Another company crosses
    /// the card over. The fee and the turnaround are the same as for a raw card. A slab needs no card saver.
    func resubmit(_ ids: Set<UUID>, to company: GradingCompany, tier: GradingTier) {
        let slabs = data.slabs.filter { ids.contains($0.id) && canResubmit($0) }
        guard !slabs.isEmpty, slabs.count >= tier.minCards, !tier.membersOnly || hasUpgrade(.psaMembership) else { return }
        let fee = gradingFee(tier, company) * Double(slabs.count)
        let days = gradingDays(tier, company)
        let label = "\(slabs.count) slab\(slabs.count == 1 ? "" : "s") to \(company.rawValue) \(tier.name) (resubmit)"
        let orderID: UUID
        if company.billsOnReturn {
            orderID = UUID()
            data.gradingBills.append(GradingBill(id: orderID, company: company, tier: tier.name, cards: slabs.count, amount: fee,
                                                 dueDay: data.day + days))
        } else {
            guard balance(gradingAccount) >= fee - 0.001 else { return }
            orderID = addLedger(-fee, .grading, label, pending: true, account: gradingAccount)
        }
        let sent = Set(slabs.map(\.id))
        for i in data.slabs.indices where sent.contains(data.slabs[i].id) {
            data.slabs[i].status = .atGrader(company: company, tier: tier.name, daysLeft: days, ledgerID: orderID)
        }
        let what = "\(slabs.count) slab\(slabs.count == 1 ? "" : "s") to \(company.rawValue) (\(tier.name), \(days) days)"
        if company.billsOnReturn {
            log("Sent \(what). The bill of \(money(fee)) comes with the grades.")
        } else {
            log("Sent \(what).", cash: -fee)
        }
        save()
    }

    /// True while another card of the order is still at the grader after today.
    func gradingOrderOpen(_ ledgerID: UUID, except id: UUID) -> Bool {
        (data.raw + data.slabs).contains {
            if case .atGrader(_, _, let d, let l) = $0.status, l == ledgerID, $0.id != id { return d > 1 }
            return false
        }
    }

    /// End Day: a resubmitted slab comes back. Returns the line for the morning report, and true when the grade changed.
    func returnResubmitted(_ card: inout OwnedCard, company: GradingCompany, tier: String, ledgerID: UUID) -> (line: String, changed: Bool) {
        if let i = data.ledger.firstIndex(where: { $0.id == ledgerID }) {
            data.ledger[i].pending = gradingOrderOpen(ledgerID, except: card.id)
        }
        let billed = data.gradingBills.contains { $0.id == ledgerID }
        card.status = billed ? .heldAtGrader(company: company, billID: ledgerID) : nil
        guard let old = card.grade else { return ("\(card.print.name) came back from \(company.rawValue).", false) }
        // A grader catches every fake, also in a slab from another company (docs/14, Detection).
        if let fake = card.fake {
            card.fakeKnown = true
            return ("\(company.rawValue) flagged your \(card.print.name) \(old.label) as counterfeit (\(fake.label.lowercased())). The fee is not refunded.", false)
        }
        let new = Self.gradeResult(card.condition, company: company)
        let review = company == old.company
        // The grader looked at the card and did not flag it.
        card.verified = true
        guard old.accepts(new) else {
            let why = review ? "\(company.rawValue) kept the grade" : "\(company.rawValue) gave it a \(new.label), so it did not cross over"
            return ("Your \(card.print.name) \(old.label) came back: \(why).", false)
        }
        let before = card.market
        card.grade = new
        card.verified = true
        var upLine = ""
        if billed, let up = psaUpcharge(tier: tier, value: card.market) {
            addUpcharge(ledgerID, up.fee)
            upLine = " PSA upcharged it to \(up.tier.name): \(money(up.fee)) more on the bill."
        }
        noteGradeReturn(ledgerID: ledgerID, company: company.rawValue, card: card, before: before)
        if let i = data.ledger.firstIndex(where: { $0.id == ledgerID }) {
            data.ledger[i].label += " · \(card.print.name) \(new.label)"
        }
        let verb = review ? "\(company.rawValue) raised it to" : "it crossed over to"
        return ("Your \(card.print.name) \(old.label) came back: \(verb) \(new.label), worth \(money(card.market)).\(upLine)", true)
    }
}
