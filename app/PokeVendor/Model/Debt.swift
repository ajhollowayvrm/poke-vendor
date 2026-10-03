import Foundation

// Credit, loans, the line of credit, payday loans, the pawn shop, and collections (docs/27-debt-and-loans.md).

extension Balance {
    /// The credit score: the range, the start, and the changes.
    static let creditScoreRange = 300...850
    static let startingCreditScore = 650
    static let scoreOnTime = 4
    static let scorePaidOff = 10
    static let scoreFirstMiss = -45
    static let scoreLaterMiss = -25
    static let scoreInquiry = -5
    static let scoreCollections = -100
    /// A line of credit that uses more than this share of its limit lowers the score by the amount.
    static let utilizationPenalties: [(share: Double, points: Int)] = [(0.7, 35), (0.3, 15)]
    /// A loan payment comes due every 4 weeks. A payday loan comes due after 2 weeks.
    static let loanCycleDays = 28
    static let paydayTermDays = 14
    static let loanWarningDays = 3
    /// A year of 52 weeks. Interest accrues every day at APR / 364.
    static let interestYearDays = 364.0
    /// The installment payments of all loans must stay under this share of 4 weeks of pay.
    static let loanPaymentShare = 0.20
    /// Personal loans: the lowest score, then (score, APR, the largest amount) from the best tier down.
    static let personalMinScore = 580
    static let personalTiers: [(score: Int, apr: Double, cap: Double)] = [(740, 0.09, 10_000), (670, 0.14, 5_000), (580, 0.24, 2_000)]
    static let personalTerms = [6, 12, 24]
    static let personalFeeRate = 0.03
    /// Business loans: the seller's permit, a history of sales, and a cap of half a year of sales.
    static let businessMinScore = 620
    static let businessTiers: [(score: Int, apr: Double)] = [(700, 0.10), (620, 0.13)]
    static let businessTerms = [12, 24, 36]
    static let businessFeeRate = 0.02
    static let businessHistoryDays = 91
    static let businessMinSales = 1_000.0
    static let businessSalesShare = 0.5
    static let businessCap = 25_000.0
    /// The line of credit: (score, APR, limit) from the best tier down.
    static let lineMinScore = 580
    static let lineTiers: [(score: Int, apr: Double, limit: Double)] = [(740, 0.18, 5_000), (670, 0.22, 2_000), (580, 0.29, 500)]
    /// The minimum payment of the line: the interest plus this share of the balance, and not less than the floor.
    static let lineMinShare = 0.03
    static let lineMinPayment = 25.0
    /// A missed payment adds this fee, or this share of the payment when it is more.
    static let lateFee = 30.0
    static let lateFeeRate = 0.05
    /// Three missed payments in a row send the debt to collections.
    static let missesToCollections = 3
    /// Payday loans: the fee for each $100 for one term, the largest amount, and the most rollovers.
    static let paydayFeePer100 = 15.0
    static let paydayCap = 500.0
    static let paydayMaxRollovers = 4
    /// A bounced payday payment adds this fee before the debt goes to collections.
    static let paydayBounceFee = 30.0
    /// The pawn shop: the share of market it lends, the fee for each 4 weeks, and the smallest item.
    static let pawnLoanShare = 0.40
    static let pawnFeeRate = 0.20
    static let pawnMinMarket = 20.0
    /// Collections add this share of the debt, and take this share of each paycheck.
    static let collectionsFeeRate = 0.20
    static let garnishShare = 0.25
}

/// A loan with a fixed payment, or a payday loan. Interest accrues every day on the balance.
struct Loan: Codable, Identifiable, Hashable {
    enum Kind: String, Codable { case personal = "Personal loan", business = "Business loan", payday = "Payday loan" }

    var id = UUID()
    let kind: Kind
    let lender: String
    let amount: Double
    let apr: Double
    /// The payment every 4 weeks. For a payday loan, the fee for each term.
    let payment: Double
    let startDay: Int
    var balance: Double
    /// Interest and fees that the player owes and has not paid.
    var accrued = 0.0
    /// The part of an earlier payment that the player missed.
    var pastDue = 0.0
    var nextDueDay: Int
    var paymentsLeft: Int
    /// Missed payments in a row.
    var missed = 0
    var rollovers = 0

    /// What the player pays to close the loan today.
    var payoff: Double { balance + accrued }
    /// The interest of a business loan counts against income tax.
    var category: LedgerEntry.Category { kind == .business ? .businessInterest : .interest }
}

/// A revolving line of credit (docs/27-debt-and-loans.md, The line of credit).
struct CreditLine: Codable, Hashable {
    let apr: Double
    let limit: Double
    let openedDay: Int
    var balance = 0.0
    var accrued = 0.0
    var pastDue = 0.0
    var nextDueDay: Int
    var missed = 0
    /// When the cash is short for home rent, the game draws the gap from the line.
    var overdraft = true

    var available: Double { max(0, limit - balance) }
    var payoff: Double { balance + accrued }
}

/// An item that the pawn shop holds. The item is not in Inventory until the player gets it back.
struct PawnTicket: Codable, Identifiable, Hashable {
    var id = UUID()
    var card: OwnedCard?
    var sealed: SealedItem?
    /// The card is a slab, and goes back to the slabs.
    var slab = false
    let name: String
    let market: Double
    let loan: Double
    let fee: Double
    var dueDay: Int
}

/// A debt that a lender sold to a collector. It has no due day. The collector takes a share of each paycheck.
struct CollectionAccount: Codable, Identifiable, Hashable {
    var id = UUID()
    let creditor: String
    let day: Int
    var balance: Double
    /// The collection fee and the old interest. The player pays them first.
    var fees: Double

    var owed: Double { balance + fees }
}

struct DebtState: Codable, Hashable {
    var score = Balance.startingCreditScore
    var loans: [Loan] = []
    var line: CreditLine?
    var pawns: [PawnTicket] = []
    var collections: [CollectionAccount] = []
    var interestPaid = 0.0
}

/// A loan that the bank says yes to, before the player picks the amount and the term.
struct LoanOffer: Hashable {
    let kind: Loan.Kind
    let lender: String
    let apr: Double
    let feeRate: Double
    let maxAmount: Double
    let terms: [Int]
}

/// A reminder that a debt payment is close.
struct DebtWarning: Hashable {
    let text: String
    let affordable: Bool
}

/// The payment every 4 weeks that pays off `amount` in `periods` payments.
func amortizedPayment(amount: Double, apr: Double, periods: Int) -> Double {
    let rate = apr * Double(Balance.loanCycleDays) / Balance.interestYearDays
    guard rate > 0 else { return amount / Double(periods) }
    return amount * rate / (1 - pow(1 + rate, -Double(periods)))
}

/// The largest amount that a payment of `payment` pays off in `periods` payments.
func amortizedAmount(payment: Double, apr: Double, periods: Int) -> Double {
    let rate = apr * Double(Balance.loanCycleDays) / Balance.interestYearDays
    guard rate > 0 else { return payment * Double(periods) }
    return payment * (1 - pow(1 + rate, -Double(periods))) / rate
}

@MainActor
extension GameStore {
    private func cents(_ value: Double) -> Double { (value * 100).rounded() / 100 }

    // MARK: - The credit score

    /// The score that lenders see: the stored score, less the penalty for a line of credit near its limit.
    var creditScore: Int {
        var score = data.debt.score
        if let line = data.debt.line, line.limit > 0 {
            let share = line.balance / line.limit
            score -= Balance.utilizationPenalties.first { share > $0.share }?.points ?? 0
        }
        return min(Balance.creditScoreRange.upperBound, max(Balance.creditScoreRange.lowerBound, score))
    }

    var creditRating: String {
        switch creditScore {
        case 740...: "Very good"
        case 670..<740: "Good"
        case 580..<670: "Fair"
        default: "Poor"
        }
    }

    private func changeScore(_ points: Int) {
        let range = Balance.creditScoreRange
        data.debt.score = min(range.upperBound, max(range.lowerBound, data.debt.score + points))
    }

    // MARK: - Totals

    var inCollections: Bool { !data.debt.collections.isEmpty }

    /// Everything the player owes to a lender, a collector, or the pawn shop.
    var totalDebt: Double {
        let d = data.debt
        return d.loans.reduce(0) { $0 + $1.payoff } + (d.line?.payoff ?? 0)
            + d.pawns.reduce(0) { $0 + $1.loan + $1.fee } + d.collections.reduce(0) { $0 + $1.owed }
    }

    var pawnedValue: Double { data.debt.pawns.reduce(0) { $0 + $1.market } }

    /// Cash and stock, less every debt and the tax that the player owes.
    var netWorth: Double {
        cash + marketValue + pawnedValue - totalDebt - data.taxes.salesTaxOwed - data.taxes.incomeTaxOwed
    }

    /// The installment payments of every open loan, for 4 weeks.
    private var installmentPayments: Double {
        data.debt.loans.filter { $0.kind != .payday }.reduce(0) { $0 + $1.payment }
    }

    // MARK: - Offers

    /// Why the bank says no, or nil when it can say yes.
    func personalLoanBlock() -> String? {
        if inCollections { return "A debt is in collections. Pay it first." }
        guard let job else { return "The bank wants proof of income. Get a job first." }
        if creditScore < Balance.personalMinScore { return "The bank wants a score of \(Balance.personalMinScore) or more." }
        let room = job.weeklyPay * 4 * Balance.loanPaymentShare - installmentPayments
        if room < 25 { return "Your loan payments are already \(Int(Balance.loanPaymentShare * 100))% of your pay." }
        return nil
    }

    var personalLoanOffer: LoanOffer? {
        guard personalLoanBlock() == nil, let job,
              let tier = Balance.personalTiers.first(where: { creditScore >= $0.score }) else { return nil }
        let room = job.weeklyPay * 4 * Balance.loanPaymentShare - installmentPayments
        let longest = Balance.personalTerms.max() ?? 12
        let byPay = amortizedAmount(payment: room, apr: tier.apr, periods: longest)
        let cap = (min(tier.cap, byPay) / 100).rounded(.down) * 100
        guard cap >= 100 else { return nil }
        return LoanOffer(kind: .personal, lender: "First Federal Bank", apr: tier.apr, feeRate: Balance.personalFeeRate,
                         maxAmount: cap, terms: Balance.personalTerms)
    }

    /// The card sales of the last 91 days: the base of a business loan.
    var businessSales: Double {
        let start = data.day - Balance.businessHistoryDays
        return data.ledger.filter { $0.day >= start && $0.category == .sale }.reduce(0) { $0 + $1.amount }
    }

    func businessLoanBlock() -> String? {
        if inCollections { return "A debt is in collections. Pay it first." }
        if !hasSellerPermit { return "The bank wants a seller's permit. Get one in the tax box." }
        if data.day < Balance.businessHistoryDays {
            return "The bank wants \(Balance.businessHistoryDays) days of sales history. You have \(data.day)."
        }
        if businessSales < Balance.businessMinSales {
            return "The bank wants \(money(Balance.businessMinSales)) of card sales in the last \(Balance.businessHistoryDays) days. You have \(money(businessSales))."
        }
        if creditScore < Balance.businessMinScore { return "The bank wants a score of \(Balance.businessMinScore) or more." }
        return nil
    }

    var businessLoanOffer: LoanOffer? {
        guard businessLoanBlock() == nil,
              let tier = Balance.businessTiers.first(where: { creditScore >= $0.score }) else { return nil }
        let owed = data.debt.loans.filter { $0.kind == .business }.reduce(0) { $0 + $1.balance }
        let yearSales = businessSales * Balance.interestYearDays / Double(Balance.businessHistoryDays)
        let cap = (min(Balance.businessCap, yearSales * Balance.businessSalesShare) - owed) / 100
        let amount = cap.rounded(.down) * 100
        guard amount >= 500 else { return nil }
        return LoanOffer(kind: .business, lender: "Community Business Bank", apr: tier.apr, feeRate: Balance.businessFeeRate,
                         maxAmount: amount, terms: Balance.businessTerms)
    }

    func paydayBlock() -> String? {
        guard job != nil else { return "A payday lender wants a paycheck. Get a job first." }
        if data.debt.loans.contains(where: { $0.kind == .payday }) { return "You have a payday loan already." }
        return nil
    }

    var paydayCap: Double {
        guard let job else { return 0 }
        return min(Balance.paydayCap, (job.weeklyPay / 2 / 100).rounded(.down) * 100)
    }

    func lineBlock() -> String? {
        if data.debt.line != nil { return "You have a line of credit." }
        if inCollections { return "A debt is in collections. Pay it first." }
        if creditScore < Balance.lineMinScore { return "The bank wants a score of \(Balance.lineMinScore) or more." }
        return nil
    }

    var lineOffer: (apr: Double, limit: Double)? {
        guard lineBlock() == nil, let tier = Balance.lineTiers.first(where: { creditScore >= $0.score }) else { return nil }
        return (tier.apr, tier.limit)
    }

    // MARK: - Borrowing

    func takeLoan(_ offer: LoanOffer, amount: Double, periods: Int) {
        let amount = cents(min(amount, offer.maxAmount))
        guard amount > 0, offer.terms.contains(periods) else { return }
        changeScore(Balance.scoreInquiry)
        let payment = cents(amortizedPayment(amount: amount, apr: offer.apr, periods: periods))
        let fee = cents(amount * offer.feeRate)
        let loan = Loan(kind: offer.kind, lender: offer.lender, amount: amount, apr: offer.apr, payment: payment,
                        startDay: data.day, balance: amount, nextDueDay: data.day + Balance.loanCycleDays, paymentsLeft: periods)
        addLedger(amount, .loan, "\(offer.kind.rawValue) · \(offer.lender)")
        if fee > 0 {
            addLedger(-fee, loan.category, "Origination fee · \(offer.lender)")
            data.debt.interestPaid += fee
        }
        data.debt.loans.append(loan)
        log("Took a \(offer.kind.rawValue.lowercased()) of \(money(amount)) at \(percent(offer.apr)) APR. \(periods) payments of \(money(payment)), every 4 weeks.",
            cash: amount - fee)
        save()
    }

    func takePayday(_ amount: Double) {
        guard paydayBlock() == nil, amount > 0, amount <= paydayCap else { return }
        let fee = cents(amount / 100 * Balance.paydayFeePer100)
        let loan = Loan(kind: .payday, lender: "QuickCash Advance", amount: amount, apr: 0, payment: fee,
                        startDay: data.day, balance: amount, accrued: fee, nextDueDay: data.day + Balance.paydayTermDays, paymentsLeft: 1)
        addLedger(amount, .loan, "Payday loan · QuickCash Advance")
        data.debt.loans.append(loan)
        log("Took a payday loan of \(money(amount)). \(money(amount + fee)) is due in \(Balance.paydayTermDays) days.", cash: amount)
        save()
    }

    func openLine() {
        guard let offer = lineOffer else { return }
        changeScore(Balance.scoreInquiry)
        data.debt.line = CreditLine(apr: offer.apr, limit: offer.limit, openedDay: data.day,
                                    nextDueDay: data.day + Balance.loanCycleDays)
        log("Opened a line of credit: \(money(offer.limit)) at \(percent(offer.apr)) APR.")
        save()
    }

    func drawLine(_ amount: Double) {
        guard var line = data.debt.line, !inCollections else { return }
        let amount = cents(min(amount, line.available))
        guard amount > 0 else { return }
        line.balance += amount
        data.debt.line = line
        addLedger(amount, .loan, "Line of credit draw")
        log("Drew \(money(amount)) from the line of credit.", cash: amount)
        save()
    }

    func setOverdraft(_ on: Bool) {
        data.debt.line?.overdraft = on
        save()
    }

    /// Closes a line with no balance.
    func closeLine() {
        guard let line = data.debt.line, line.payoff < 0.01 else { return }
        data.debt.line = nil
        log("Closed the line of credit.")
        save()
    }

    // MARK: - Paying

    /// Splits a payment into interest and principal, and books each part. Interest and fees go first.
    private func book(_ amount: Double, accrued: inout Double, balance: inout Double,
                      category: LedgerEntry.Category, label: String) {
        let interest = cents(min(accrued, amount))
        let principal = cents(min(balance, amount - interest))
        if interest > 0 { addLedger(-interest, category, "\(label) · interest") }
        if principal > 0 { addLedger(-principal, .loan, "\(label) · principal") }
        accrued = max(0, accrued - interest)
        balance = max(0, balance - principal)
        data.debt.interestPaid += interest
    }

    /// The player pays part or all of a loan now. A payment clears the past-due amount first.
    func payLoan(_ id: UUID, amount: Double) {
        guard let i = data.debt.loans.firstIndex(where: { $0.id == id }) else { return }
        var loan = data.debt.loans[i]
        let amount = cents(min(amount, loan.payoff, data.cash))
        guard amount > 0 else { return }
        book(amount, accrued: &loan.accrued, balance: &loan.balance, category: loan.category, label: loan.kind.rawValue)
        loan.pastDue = max(0, loan.pastDue - amount)
        if loan.pastDue < 0.01 { loan.missed = 0 }
        log("Paid \(money(amount)) on the \(loan.kind.rawValue.lowercased()).", cash: -amount)
        closeOrKeep(loan, at: i)
        save()
    }

    func payLine(_ amount: Double) {
        guard var line = data.debt.line else { return }
        let amount = cents(min(amount, line.payoff, data.cash))
        guard amount > 0 else { return }
        book(amount, accrued: &line.accrued, balance: &line.balance, category: .interest, label: "Line of credit")
        line.pastDue = max(0, line.pastDue - amount)
        if line.pastDue < 0.01 { line.missed = 0 }
        data.debt.line = line
        log("Paid \(money(amount)) on the line of credit.", cash: -amount)
        save()
    }

    func payCollection(_ id: UUID, amount: Double) {
        guard let i = data.debt.collections.firstIndex(where: { $0.id == id }) else { return }
        var debt = data.debt.collections[i]
        let amount = cents(min(amount, debt.owed, data.cash))
        guard amount > 0 else { return }
        book(amount, accrued: &debt.fees, balance: &debt.balance, category: .interest, label: "Collections · \(debt.creditor)")
        log("Paid \(money(amount)) to the collector for \(debt.creditor).", cash: -amount)
        if debt.owed < 0.01 {
            data.debt.collections.remove(at: i)
            log("The collection account for \(debt.creditor) is paid. It stays on your credit report.")
        } else {
            data.debt.collections[i] = debt
        }
        save()
    }

    /// Writes the loan back, or removes it when it is paid off.
    private func closeOrKeep(_ loan: Loan, at i: Int) {
        if loan.payoff < 0.01 {
            data.debt.loans.remove(at: i)
            if loan.kind != .payday { changeScore(Balance.scorePaidOff) }
            log("The \(loan.kind.rawValue.lowercased()) from \(loan.lender) is paid off.")
        } else {
            data.debt.loans[i] = loan
        }
    }

    // MARK: - The pawn shop

    /// Items in hand that the pawn shop looks at: in storage, not a known fake, and worth enough.
    var pawnable: [(id: UUID, name: String, market: Double)] {
        let cards = (data.raw + data.slabs).filter { $0.status == nil && !$0.isKnownFake && $0.market >= Balance.pawnMinMarket }
            .map { (id: $0.id, name: cardName($0), market: $0.market) }
        let sealed = data.sealed.filter { $0.status == nil && !$0.isKnownFake && market(of: $0) >= Balance.pawnMinMarket }
            .map { (id: $0.id, name: $0.name, market: market(of: $0)) }
        return (cards + sealed).sorted { $0.market > $1.market }
    }

    private func cardName(_ card: OwnedCard) -> String {
        card.grade.map { "\(card.print.name) · \($0.label)" } ?? card.print.name
    }

    func pawnLoan(market: Double) -> Double { cents(market * Balance.pawnLoanShare) }

    /// Pawns an item. The pawnbroker checks it and turns down a fake. Returns a line for the screen.
    @discardableResult
    func pawn(_ id: UUID) -> String {
        var ticket: PawnTicket
        if let i = data.raw.firstIndex(where: { $0.id == id }) ?? data.slabs.firstIndex(where: { $0.id == id }) {
            let slab = data.slabs.contains { $0.id == id }
            let card = slab ? data.slabs[i] : data.raw[i]
            guard card.status == nil else { return "" }
            if card.fake != nil {
                if slab { data.slabs[i].fakeKnown = true } else { data.raw[i].fakeKnown = true }
                log("The pawnbroker checked \(card.print.name) and says it is fake. It is worth nothing.")
                save()
                return "The pawnbroker says it is fake."
            }
            let loan = pawnLoan(market: card.market)
            ticket = PawnTicket(card: card, slab: slab, name: cardName(card), market: card.market, loan: loan,
                                fee: cents(loan * Balance.pawnFeeRate), dueDay: data.day + Balance.loanCycleDays)
            if slab { data.slabs.remove(at: i) } else { data.raw.remove(at: i) }
        } else if let i = data.sealed.firstIndex(where: { $0.id == id }) {
            let item = data.sealed[i]
            guard item.status == nil else { return "" }
            if item.fake != nil {
                data.sealed[i].fakeKnown = true
                log("The pawnbroker checked the \(item.name) and says it is resealed. It is worth nothing.")
                save()
                return "The pawnbroker says it is resealed."
            }
            let value = market(of: item)
            let loan = pawnLoan(market: value)
            ticket = PawnTicket(sealed: item, name: item.name, market: value, loan: loan,
                                fee: cents(loan * Balance.pawnFeeRate), dueDay: data.day + Balance.loanCycleDays)
            data.sealed.remove(at: i)
        } else {
            return ""
        }
        addLedger(ticket.loan, .loan, "Pawn loan · \(ticket.name)")
        data.debt.pawns.append(ticket)
        log("Pawned \(ticket.name) for \(money(ticket.loan)). Pay \(money(ticket.loan + ticket.fee)) by day \(ticket.dueDay + 1) to get it back.",
            cash: ticket.loan)
        save()
        return "Pawned for \(money(ticket.loan))."
    }

    /// The player pays the loan and the fee, and the item comes back to Inventory.
    func redeemPawn(_ id: UUID) {
        guard let i = data.debt.pawns.firstIndex(where: { $0.id == id }) else { return }
        let ticket = data.debt.pawns[i]
        guard canAfford(ticket.loan + ticket.fee) else { return }
        addLedger(-ticket.loan, .loan, "Pawn redeemed · \(ticket.name)")
        addLedger(-ticket.fee, .interest, "Pawn fee · \(ticket.name)")
        data.debt.interestPaid += ticket.fee
        data.debt.pawns.remove(at: i)
        if let card = ticket.card {
            if ticket.slab { data.slabs.append(card) } else { data.raw.append(card) }
        }
        if let item = ticket.sealed { data.sealed.append(item) }
        log("Got \(ticket.name) back from the pawn shop.", cash: -(ticket.loan + ticket.fee))
        save()
    }

    /// The player pays the fee, and the pawn shop holds the item for 4 more weeks.
    func extendPawn(_ id: UUID) {
        guard let i = data.debt.pawns.firstIndex(where: { $0.id == id }) else { return }
        let ticket = data.debt.pawns[i]
        guard canAfford(ticket.fee) else { return }
        addLedger(-ticket.fee, .interest, "Pawn fee · \(ticket.name)")
        data.debt.interestPaid += ticket.fee
        data.debt.pawns[i].dueDay += Balance.loanCycleDays
        log("Paid the pawn fee for \(ticket.name). It is due on day \(ticket.dueDay + Balance.loanCycleDays + 1).", cash: -ticket.fee)
        save()
    }

    // MARK: - Overdraft and garnishment

    /// Draws the gap from the line of credit when the cash is short for `amount`. Returns true when the cash is
    /// now enough.
    func coverWithLine(_ amount: Double, for what: String) -> Bool {
        if canAfford(amount) { return true }
        guard let line = data.debt.line, line.overdraft, !inCollections else { return false }
        let gap = cents(amount - data.cash + 0.005)
        guard gap <= line.available else { return false }
        data.debt.line?.balance += gap
        addLedger(gap, .loan, "Overdraft draw · \(what)")
        log("The line of credit covered \(money(gap)) of the \(what.lowercased()).", cash: gap)
        return true
    }

    /// The collector takes a share of the paycheck. Returns a line for the report.
    func garnishWages(_ pay: Double) -> String? {
        guard pay > 0, let i = data.debt.collections.indices.first else { return nil }
        var debt = data.debt.collections[i]
        let take = cents(min(pay * Balance.garnishShare, debt.owed))
        guard take > 0 else { return nil }
        book(take, accrued: &debt.fees, balance: &debt.balance, category: .interest, label: "Wage garnishment · \(debt.creditor)")
        if debt.owed < 0.01 {
            data.debt.collections.remove(at: i)
            return "The collector took \(money(take)) from your paycheck. The debt to \(debt.creditor) is paid."
        }
        data.debt.collections[i] = debt
        return "The collector took \(money(take)) from your paycheck for \(debt.creditor). You still owe \(money(debt.owed))."
    }

    // MARK: - The day

    /// Moves a debt to collections, with the collection fee.
    private func sendToCollections(creditor: String, balance: Double, accrued: Double) -> String {
        let fees = cents(accrued + balance * Balance.collectionsFeeRate)
        data.debt.collections.append(CollectionAccount(creditor: creditor, day: data.day, balance: cents(balance), fees: fees))
        changeScore(Balance.scoreCollections)
        return "\(creditor) sent your debt of \(money(balance + fees)) to collections. The collector takes \(Int(Balance.garnishShare * 100))% of each paycheck until it is paid."
    }

    private func lateFee(on payment: Double) -> Double { cents(max(Balance.lateFee, payment * Balance.lateFeeRate)) }

    private func missScore(_ missed: Int) {
        changeScore(missed == 1 ? Balance.scoreFirstMiss : Balance.scoreLaterMiss)
    }

    /// One loan on its due day. Autopay takes the payment when the cash is enough.
    private func settle(_ loan: inout Loan) -> (line: String, collections: Bool) {
        if loan.kind == .payday {
            let due = loan.payoff
            if canAfford(due) {
                book(due, accrued: &loan.accrued, balance: &loan.balance, category: .interest, label: "Payday loan")
                return ("Payday loan paid: \(money(due)).", false)
            }
            if loan.rollovers < Balance.paydayMaxRollovers, canAfford(loan.accrued) {
                let fee = loan.accrued
                book(fee, accrued: &loan.accrued, balance: &loan.balance, category: .interest, label: "Payday loan rollover")
                loan.rollovers += 1
                loan.accrued = loan.payment
                loan.nextDueDay += Balance.paydayTermDays
                return ("You could not pay the payday loan. The lender took the \(money(fee)) fee and rolled it over. \(money(loan.payoff)) is due in \(Balance.paydayTermDays) days.", false)
            }
            loan.accrued += Balance.paydayBounceFee
            return ("The payday loan payment bounced.", true)
        }
        let due = cents(min(loan.payment + loan.pastDue, loan.payoff))
        if canAfford(due) {
            book(due, accrued: &loan.accrued, balance: &loan.balance, category: loan.category, label: loan.kind.rawValue)
            loan.pastDue = 0
            loan.missed = 0
            loan.paymentsLeft = max(0, loan.paymentsLeft - 1)
            loan.nextDueDay += Balance.loanCycleDays
            changeScore(Balance.scoreOnTime)
            // The last payment clears what the rounding left.
            if loan.paymentsLeft == 0, loan.payoff > 0, canAfford(loan.payoff) {
                book(loan.payoff, accrued: &loan.accrued, balance: &loan.balance, category: loan.category, label: loan.kind.rawValue)
            }
            return ("\(loan.kind.rawValue) payment: \(money(due)).", false)
        }
        let fee = lateFee(on: loan.payment)
        loan.accrued += fee
        loan.pastDue = due
        loan.missed += 1
        loan.nextDueDay += Balance.loanCycleDays
        missScore(loan.missed)
        if loan.missed >= Balance.missesToCollections { return ("You missed a third \(loan.kind.rawValue.lowercased()) payment.", true) }
        return ("You missed a \(loan.kind.rawValue.lowercased()) payment of \(money(due)). A late fee of \(money(fee)) is added, and your credit score dropped.", false)
    }

    private func settleLine(_ line: inout CreditLine) -> (line: String?, collections: Bool) {
        guard line.payoff >= 0.01 else {
            line.nextDueDay += Balance.loanCycleDays
            return (nil, false)
        }
        let minimum = min(line.payoff, max(Balance.lineMinPayment, line.accrued + line.balance * Balance.lineMinShare))
        let due = cents(min(line.payoff, minimum + line.pastDue))
        line.nextDueDay += Balance.loanCycleDays
        if canAfford(due) {
            book(due, accrued: &line.accrued, balance: &line.balance, category: .interest, label: "Line of credit")
            line.pastDue = 0
            line.missed = 0
            changeScore(Balance.scoreOnTime)
            return ("Line of credit minimum payment: \(money(due)).", false)
        }
        let fee = lateFee(on: minimum)
        line.accrued += fee
        line.pastDue = due
        line.missed += 1
        missScore(line.missed)
        if line.missed >= Balance.missesToCollections { return ("You missed a third line of credit payment.", true) }
        return ("You missed the line of credit payment of \(money(due)). A late fee of \(money(fee)) is added, and your credit score dropped.", false)
    }

    /// Interest, due payments, pawn deadlines, and warnings, after the clock moves. Debt never ends the run.
    func debtEndDay() -> [String] {
        var lines: [String] = []
        let today = data.day
        var debt = data.debt
        // Interest accrues for the day that just ended. The payday fee is fixed for the term.
        for i in debt.loans.indices where debt.loans[i].kind != .payday {
            debt.loans[i].accrued += debt.loans[i].balance * debt.loans[i].apr / Balance.interestYearDays
        }
        if var line = debt.line {
            line.accrued += line.balance * line.apr / Balance.interestYearDays
            debt.line = line
        }
        // The loans pay one at a time, so each payment sees the cash that the one before it left.
        var kept: [Loan] = []
        var sent: [(String, Double, Double)] = []
        for var loan in debt.loans {
            if loan.nextDueDay == today {
                let result = settle(&loan)
                lines.append(result.line)
                if result.collections {
                    sent.append((loan.lender, loan.balance, loan.accrued))
                    continue
                }
                if loan.payoff < 0.01 {
                    if loan.kind != .payday { changeScore(Balance.scorePaidOff) }
                    lines.append("The \(loan.kind.rawValue.lowercased()) from \(loan.lender) is paid off.")
                    continue
                }
            } else if loan.nextDueDay - today == Balance.loanWarningDays {
                let due = loan.kind == .payday ? loan.payoff : min(loan.payment + loan.pastDue, loan.payoff)
                lines.append("A \(loan.kind.rawValue.lowercased()) payment of \(money(due)) is due in \(Balance.loanWarningDays) days.")
            }
            kept.append(loan)
        }
        debt.loans = kept
        data.debt.loans = kept
        data.debt.line = debt.line
        if var line = debt.line, line.nextDueDay == today {
            let result = settleLine(&line)
            if let text = result.line { lines.append(text) }
            if result.collections {
                data.debt.line = nil
                sent.append(("The line of credit bank", line.balance, line.accrued))
            } else {
                data.debt.line = line
            }
        }
        for (creditor, balance, accrued) in sent {
            lines.append(sendToCollections(creditor: creditor, balance: balance, accrued: accrued))
        }
        // The pawn shop keeps an item on the day after its due day.
        let pawns = data.debt.pawns
        var keptPawns: [PawnTicket] = []
        for ticket in pawns {
            if today > ticket.dueDay {
                // The item pays the loan. That is a sale for the amount of the loan, and income tax counts it.
                addLedger(ticket.loan, .sale, "Pawn forfeit · \(ticket.name)")
                addLedger(-ticket.loan, .loan, "Pawn loan settled · \(ticket.name)")
                lines.append("The pawn shop kept \(ticket.name). The \(money(ticket.loan)) loan is closed.")
            } else {
                if ticket.dueDay - today == Balance.loanWarningDays - 1 {
                    lines.append("The pawn ticket for \(ticket.name) ends in \(Balance.loanWarningDays) days. Pay \(money(ticket.loan + ticket.fee)) or the \(money(ticket.fee)) fee.")
                }
                keptPawns.append(ticket)
            }
        }
        data.debt.pawns = keptPawns
        return lines
    }

    // MARK: - Warnings and the calendar

    var debtWarnings: [DebtWarning] {
        var out: [DebtWarning] = []
        let today = data.day
        for loan in data.debt.loans {
            let days = loan.nextDueDay - today
            guard days <= Balance.loanWarningDays else { continue }
            let due = loan.kind == .payday ? loan.payoff : min(loan.payment + loan.pastDue, loan.payoff)
            out.append(DebtWarning(text: "\(loan.kind.rawValue) payment of \(money(due)) is due in \(days) day\(days == 1 ? "" : "s").",
                                   affordable: canAfford(due)))
        }
        if let line = data.debt.line, line.payoff >= 0.01 {
            let days = line.nextDueDay - today
            if days <= Balance.loanWarningDays {
                let minimum = min(line.payoff, max(Balance.lineMinPayment, line.accrued + line.balance * Balance.lineMinShare)) + line.pastDue
                out.append(DebtWarning(text: "Line of credit payment of \(money(minimum)) is due in \(days) day\(days == 1 ? "" : "s").",
                                       affordable: canAfford(minimum)))
            }
        }
        for ticket in data.debt.pawns {
            let days = ticket.dueDay - today + 1
            if days <= Balance.loanWarningDays {
                out.append(DebtWarning(text: "The pawn shop keeps \(ticket.name) in \(days) day\(days == 1 ? "" : "s"). Pay \(money(ticket.loan + ticket.fee)) to get it back.",
                                       affordable: canAfford(ticket.loan + ticket.fee)))
            }
        }
        if let first = data.debt.collections.first {
            out.append(DebtWarning(text: "\(money(data.debt.collections.reduce(0) { $0 + $1.owed })) is in collections. The collector takes \(Int(Balance.garnishShare * 100))% of each paycheck. Debt from \(first.creditor).",
                                   affordable: false))
        }
        return out
    }

    func debtEntries(day: Int) -> [CalendarEntry] {
        var out: [CalendarEntry] = []
        func repeats(_ due: Int, every cycle: Int) -> Bool { day >= due && (day - due) % cycle == 0 }
        for loan in data.debt.loans {
            if loan.kind == .payday {
                if day == loan.nextDueDay {
                    out.append(CalendarEntry(kind: .rent, title: "Payday loan due", detail: money(loan.payoff)))
                }
            } else if repeats(loan.nextDueDay, every: Balance.loanCycleDays),
                      (day - loan.nextDueDay) / Balance.loanCycleDays < max(loan.paymentsLeft, 1) {
                out.append(CalendarEntry(kind: .rent, title: "\(loan.kind.rawValue) payment", detail: money(loan.payment)))
            }
        }
        if let line = data.debt.line, line.payoff >= 0.01, repeats(line.nextDueDay, every: Balance.loanCycleDays) {
            out.append(CalendarEntry(kind: .rent, title: "Line of credit payment", detail: "Minimum payment"))
        }
        for ticket in data.debt.pawns where day == ticket.dueDay {
            out.append(CalendarEntry(kind: .rent, title: "Pawn ticket ends", detail: ticket.name))
        }
        return out
    }

    // MARK: - Test tools

    func testSetCreditScore(_ score: Int) {
        data.debt.score = score
        save()
    }
}

func percent(_ rate: Double) -> String {
    let value = (rate * 1000).rounded() / 10
    return value == value.rounded() ? "\(Int(value))%" : String(format: "%.1f%%", value)
}
