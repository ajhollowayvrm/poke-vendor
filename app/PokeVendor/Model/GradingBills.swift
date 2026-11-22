import Foundation

// Paying PSA (docs/10-grading.md, Paying PSA). PSA bills an order when the grades come back, not when the player
// sends the cards. When the cash covers the bill, PSA charges the card on file and the slabs come back. When it does
// not, PSA holds the whole order until the player pays. So the player must keep a reserve for the bills to come.

extension GradingCompany {
    /// PSA bills when the grades come back. CGC and BGS take the fee when the cards go in.
    var billsOnReturn: Bool { self == .psa }
}

/// One PSA order: the bill that comes due when its grades come back.
struct GradingBill: Codable, Identifiable, Hashable {
    /// The same ID as the order's cards carry in their status.
    let id: UUID
    let company: GradingCompany
    let tier: String
    let cards: Int
    /// The bill: the fees, and the upcharges that come with the grades.
    var amount: Double
    /// The upcharges in the bill. Nil when there are none, and in a save from before upcharges.
    var upcharge: Double?
    /// The day the grades come back.
    let dueDay: Int
    /// True when the grades are back and PSA holds the order.
    var held = false
}

@MainActor
extension GameStore {
    var gradingBills: [GradingBill] { data.gradingBills }

    /// The PSA bills that are not paid: the orders still at PSA, and the orders that PSA holds.
    var unpaidGradingTotal: Double { data.gradingBills.reduce(0) { $0 + $1.amount } }

    /// PSA's upcharge for a card worth more than its level allows: the fee difference to the cheapest level whose cap
    /// covers the card's value after grading. Nil when the card fits its level.
    func psaUpcharge(tier name: String, value: Double) -> (tier: GradingTier, fee: Double)? {
        guard let tiers = Balance.gradingTiers[.psa], let tier = tiers.first(where: { $0.name == name }), let cap = tier.maxValue,
              value > cap, let up = tiers.first(where: { ($0.maxValue ?? .infinity) >= value && $0.fee > tier.fee }) else { return nil }
        return (up, ((gradingFee(up, .psa) - gradingFee(tier, .psa)) * 100).rounded() / 100)
    }

    /// Adds an upcharge to an order's bill.
    func addUpcharge(_ billID: UUID, _ fee: Double) {
        guard let i = data.gradingBills.firstIndex(where: { $0.id == billID }) else { return }
        data.gradingBills[i].amount += fee
        data.gradingBills[i].upcharge = (data.gradingBills[i].upcharge ?? 0) + fee
    }

    /// The cards of an order that PSA holds.
    func heldCards(_ billID: UUID) -> [OwnedCard] {
        (data.slabs + data.raw).filter {
            if case .heldAtGrader(_, let id) = $0.status { return id == billID }
            return false
        }
    }

    /// Pays a held order. Its cards come back to Inventory. Returns false when the cash does not cover the bill.
    @discardableResult
    func payGradingBill(_ id: UUID) -> Bool {
        guard let i = data.gradingBills.firstIndex(where: { $0.id == id }), data.gradingBills[i].held else { return false }
        let bill = data.gradingBills[i]
        guard canAfford(bill.amount) else { return false }
        addLedger(-bill.amount, .grading, "\(bill.company.rawValue) bill · \(bill.cards) card\(bill.cards == 1 ? "" : "s") (\(bill.tier))")
        data.gradingBills.remove(at: i)
        for k in data.raw.indices where data.raw[k].status == .heldAtGrader(company: bill.company, billID: id) { data.raw[k].status = nil }
        for k in data.slabs.indices where data.slabs[k].status == .heldAtGrader(company: bill.company, billID: id) { data.slabs[k].status = nil }
        log("Paid \(bill.company.rawValue) \(money(bill.amount)). \(bill.cards) card\(bill.cards == 1 ? " is" : "s are") back in Inventory.",
            cash: -bill.amount)
        save()
        return true
    }

    /// End Day, after the cards advance: an order whose cards are all back is held. Then PSA charges the card on file
    /// for each held order, oldest first, while the cash covers it.
    func gradingBillsEndDay() -> [String] {
        var lines: [String] = []
        var atGrader: Set<UUID> = []
        for card in data.raw + data.slabs {
            if case .atGrader(_, _, _, let id) = card.status { atGrader.insert(id) }
        }
        var newlyHeld: Set<UUID> = []
        for i in data.gradingBills.indices where !data.gradingBills[i].held && !atGrader.contains(data.gradingBills[i].id) {
            data.gradingBills[i].held = true
            newlyHeld.insert(data.gradingBills[i].id)
        }
        let held = data.gradingBills.filter(\.held).sorted { $0.dueDay < $1.dueDay }
        for bill in held {
            if payGradingBill(bill.id) {
                lines.append("\(bill.company.rawValue) charged \(money(bill.amount)) for \(bill.cards) card\(bill.cards == 1 ? "" : "s"). The slabs are back.")
            } else if newlyHeld.contains(bill.id) {
                lines.append("\(bill.company.rawValue) graded \(bill.cards) card\(bill.cards == 1 ? "" : "s"). The bill is \(money(bill.amount)), and you have \(money(cash)). \(bill.company.rawValue) holds the order until you pay.")
            }
        }
        return lines
    }
}
