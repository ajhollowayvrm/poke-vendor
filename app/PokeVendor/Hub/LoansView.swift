import SwiftUI

/// Credit, loans, the line of credit, payday loans, and the pawn shop (docs/27-debt-and-loans.md).
struct LoansView: View {
    @Environment(GameStore.self) private var store
    @State private var drawAmount = 100.0
    @State private var paydayAmount = 100.0
    @State private var pawnNote: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                creditBox
                if !store.data.debt.collections.isEmpty { collectionsBox }
                if !store.data.debt.loans.isEmpty { loansBox }
                lineBox
                DetailBox(title: "Personal loan") {
                    if let offer = store.personalLoanOffer {
                        LoanOfferForm(offer: offer, note: "The interest is a personal cost. Income tax does not count it.")
                    } else {
                        blocked(store.personalLoanBlock() ?? "The bank has no offer for you now.")
                    }
                }
                DetailBox(title: "Business loan") {
                    if let offer = store.businessLoanOffer {
                        LoanOfferForm(offer: offer, note: "The interest and the fee are a business cost. They lower your income tax.")
                    } else {
                        blocked(store.businessLoanBlock() ?? "The bank has no offer for you now.")
                    }
                }
                paydayBox
                pawnBox
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Loans")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func blocked(_ text: String) -> some View {
        Text(text).font(.caption).foregroundStyle(Theme.muted)
    }

    // MARK: - Credit

    private var creditBox: some View {
        let score = store.creditScore
        return DetailBox(title: "Credit") {
            HStack(spacing: 0) {
                StatCell(label: "Score", value: "\(score)", color: score >= 670 ? Theme.green : score >= 580 ? Theme.cyan : Theme.orange)
                StatCell(label: "You owe", value: money(store.totalDebt), color: store.totalDebt > 0 ? Theme.orange : Theme.text)
                StatCell(label: "Net worth", value: money(store.netWorth), color: store.netWorth >= 0 ? Theme.green : Theme.orange)
            }
            Text("\(store.creditRating). On-time payments raise the score. A missed payment, an application, and a line of credit near its limit lower it.")
                .font(.caption).foregroundStyle(Theme.muted)
            if store.data.debt.interestPaid > 0 {
                Text("Interest and fees paid: \(money(store.data.debt.interestPaid))")
                    .font(.caption.monospaced()).foregroundStyle(Theme.muted)
            }
        }
    }

    private var collectionsBox: some View {
        DetailBox(title: "Collections") {
            Text("The collector takes \(Int(Balance.garnishShare * 100))% of each paycheck until the debt is paid. You cannot get a new loan or line until then.")
                .font(.caption).foregroundStyle(Theme.orange)
            ForEach(store.data.debt.collections) { debt in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(debt.creditor).font(.subheadline)
                        Text("Since day \(debt.day + 1) · fees \(money(debt.fees))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    Text(money(debt.owed)).font(.subheadline.monospaced().weight(.semibold))
                }
                Button("Pay \(money(min(debt.owed, max(store.cash, 0))))") { store.payCollection(debt.id, amount: debt.owed) }
                    .buttonStyle(.bordered)
                    .tint(Theme.orange)
                    .disabled(store.cash < 0.01)
            }
        }
    }

    // MARK: - Loans

    private var loansBox: some View {
        DetailBox(title: "Your loans") {
            ForEach(store.data.debt.loans) { loan in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(loan.kind.rawValue).font(.subheadline.weight(.medium))
                            Text(loan.lender).font(.caption).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Text(money(loan.payoff)).font(.subheadline.monospaced().weight(.semibold))
                    }
                    Text(detail(loan)).font(.caption.monospaced()).foregroundStyle(loan.missed > 0 ? Theme.orange : Theme.muted)
                    HStack {
                        if loan.kind != .payday {
                            let due = min(loan.payment + loan.pastDue, loan.payoff)
                            Button("Pay \(money(due))") { store.payLoan(loan.id, amount: due) }
                                .buttonStyle(.bordered)
                                .disabled(!store.canAfford(due))
                        }
                        Button("Pay off · \(money(loan.payoff))") { store.payLoan(loan.id, amount: loan.payoff) }
                            .buttonStyle(.bordered)
                            .tint(Theme.green)
                            .disabled(!store.canAfford(loan.payoff))
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }

    private func detail(_ loan: Loan) -> String {
        let due = "Due day \(loan.nextDueDay + 1)"
        if loan.kind == .payday {
            return "\(due) · fee \(money(loan.payment)) · rolled over \(loan.rollovers)×"
        }
        var text = "\(due) · \(money(loan.payment)) · \(percent(loan.apr)) APR · \(loan.paymentsLeft) left"
        if loan.pastDue > 0 { text += " · past due \(money(loan.pastDue))" }
        return text
    }

    // MARK: - The line of credit

    private var lineBox: some View {
        DetailBox(title: "Line of credit") {
            if let line = store.data.debt.line {
                HStack(spacing: 0) {
                    StatCell(label: "Balance", value: money(line.payoff), color: line.payoff > 0 ? Theme.orange : Theme.text)
                    StatCell(label: "Available", value: money(line.available), color: Theme.cyan)
                    StatCell(label: "APR", value: percent(line.apr))
                }
                Text("Limit \(money(line.limit)). The minimum payment is due on day \(line.nextDueDay + 1). Autopay takes it when the cash is enough.\(line.pastDue > 0 ? " Past due \(money(line.pastDue))." : "")")
                    .font(.caption).foregroundStyle(line.missed > 0 ? Theme.orange : Theme.muted)
                if line.available >= 1, !store.inCollections {
                    Stepper("Draw \(money(min(drawAmount, line.available)))", value: $drawAmount, in: 50...max(50, line.available), step: 50)
                        .font(.subheadline)
                    Button("Draw the cash") { store.drawLine(drawAmount) }
                        .buttonStyle(.borderedProminent)
                        .tint(Theme.cyan)
                        .foregroundStyle(.black)
                }
                if line.payoff >= 0.01 {
                    Button("Pay it all · \(money(line.payoff))") { store.payLine(line.payoff) }
                        .buttonStyle(.bordered)
                        .tint(Theme.green)
                        .disabled(!store.canAfford(line.payoff))
                } else {
                    Button("Close the line") { store.closeLine() }
                        .buttonStyle(.bordered)
                }
                Toggle(isOn: Binding(get: { line.overdraft }, set: { store.setOverdraft($0) })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Overdraft protection").font(.subheadline)
                        Text("When the cash is short for rent, the line pays the gap.").font(.caption).foregroundStyle(Theme.muted)
                    }
                }
            } else if let offer = store.lineOffer {
                Text("Borrow up to \(money(offer.limit)) at \(percent(offer.apr)) APR when you need it. Pay the interest and \(Int(Balance.lineMinShare * 100))% of the balance every 4 weeks. The application lowers your score by \(-Balance.scoreInquiry).")
                    .font(.caption).foregroundStyle(Theme.muted)
                Button("Open the line") { store.openLine() }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.cyan)
                    .foregroundStyle(.black)
            } else {
                blocked(store.lineBlock() ?? "The bank has no offer for you now.")
            }
        }
    }

    // MARK: - Payday loans

    private var paydayBox: some View {
        DetailBox(title: "Payday loan") {
            if let reason = store.paydayBlock() {
                blocked(reason)
            } else {
                let amount = min(paydayAmount, store.paydayCap)
                let fee = amount / 100 * Balance.paydayFeePer100
                let apr = fee / amount * Balance.interestYearDays / Double(Balance.paydayTermDays)
                Text("No credit check. Pay \(money(amount + fee)) in \(Balance.paydayTermDays) days. That fee is an APR of \(percent((apr * 100).rounded() / 100)). A loan you cannot pay rolls over with a new fee.")
                    .font(.caption).foregroundStyle(Theme.orange)
                Stepper("Borrow \(money(amount))", value: $paydayAmount, in: 100...max(100, store.paydayCap), step: 100)
                    .font(.subheadline)
                Button("Take it") { store.takePayday(amount) }
                    .buttonStyle(.bordered)
                    .tint(Theme.orange)
                    .disabled(store.paydayCap < 100)
            }
        }
    }

    // MARK: - The pawn shop

    private var pawnBox: some View {
        DetailBox(title: "Pawn shop") {
            Text("The pawn shop lends \(Int(Balance.pawnLoanShare * 100))% of market and holds the item. Pay the loan and a \(Int(Balance.pawnFeeRate * 100))% fee within 4 weeks, or pay the fee for 4 more weeks. After that, the shop keeps the item. Your credit score does not change.")
                .font(.caption).foregroundStyle(Theme.muted)
            ForEach(store.data.debt.pawns) { ticket in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(ticket.name).font(.subheadline).lineLimit(1)
                        Spacer()
                        Text(money(ticket.loan + ticket.fee)).font(.subheadline.monospaced().weight(.semibold))
                    }
                    Text("Market \(money(ticket.market)) · last day \(ticket.dueDay + 1)")
                        .font(.caption.monospaced())
                        .foregroundStyle(ticket.dueDay - store.day < Balance.loanWarningDays ? Theme.orange : Theme.muted)
                    HStack {
                        Button("Get it back") { store.redeemPawn(ticket.id) }
                            .buttonStyle(.bordered)
                            .tint(Theme.green)
                            .disabled(!store.canAfford(ticket.loan + ticket.fee))
                        Button("Pay the fee · \(money(ticket.fee))") { store.extendPawn(ticket.id) }
                            .buttonStyle(.bordered)
                            .disabled(!store.canAfford(ticket.fee))
                    }
                }
                .padding(.vertical, 4)
            }
            if let pawnNote {
                Text(pawnNote).font(.caption).foregroundStyle(Theme.cyan)
            }
            let items = store.pawnable.prefix(12)
            if items.isEmpty {
                blocked("Nothing in storage is worth \(money(Balance.pawnMinMarket)) or more.")
            } else {
                Text("IN STORAGE").font(.system(size: 10, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
                ForEach(Array(items), id: \.id) { item in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name).font(.subheadline).lineLimit(1)
                            Text("Market \(money(item.market))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Button("Pawn · \(money(store.pawnLoan(market: item.market)))") { pawnNote = store.pawn(item.id) }
                            .buttonStyle(.bordered)
                    }
                }
            }
        }
    }
}

/// The amount, the term, and what the loan costs, before the player signs.
private struct LoanOfferForm: View {
    @Environment(GameStore.self) private var store
    let offer: LoanOffer
    let note: String
    @State private var amount = 0.0
    @State private var term = 0

    var body: some View {
        // The form starts at half of the offer, not at the most the bank lends.
        let start = max(100, (offer.maxAmount / 2 / 100).rounded(.down) * 100)
        let amount = min(max(self.amount > 0 ? self.amount : start, 100), offer.maxAmount)
        let term = offer.terms.contains(self.term) ? self.term : offer.terms[offer.terms.count / 2]
        let payment = (amortizedPayment(amount: amount, apr: offer.apr, periods: term) * 100).rounded() / 100
        let fee = (amount * offer.feeRate * 100).rounded() / 100
        let interest = payment * Double(term) - amount
        VStack(alignment: .leading, spacing: 8) {
            Text("\(offer.lender) offers up to \(money(offer.maxAmount)) at \(percent(offer.apr)) APR, with a \(percent(offer.feeRate)) fee. The application lowers your score by \(-Balance.scoreInquiry).")
                .font(.caption).foregroundStyle(Theme.muted)
            Stepper("Borrow \(money(amount))", value: Binding(get: { amount }, set: { self.amount = $0 }),
                    in: 100...offer.maxAmount, step: offer.maxAmount >= 2_000 ? 500 : 100)
                .font(.subheadline)
            Picker("Term", selection: Binding(get: { term }, set: { self.term = $0 })) {
                ForEach(offer.terms, id: \.self) { Text("\($0) payments").tag($0) }
            }
            .pickerStyle(.segmented)
            HStack(spacing: 0) {
                StatCell(label: "Every 4 weeks", value: money(payment))
                StatCell(label: "Interest", value: money(interest), color: Theme.orange)
                StatCell(label: "Fee", value: money(fee), color: Theme.orange)
            }
            Text("You get \(money(amount - fee)) today. \(note)").font(.caption).foregroundStyle(Theme.muted)
            Button("Sign for \(money(amount))") { store.takeLoan(offer, amount: amount, periods: term) }
                .buttonStyle(.borderedProminent)
                .tint(Theme.cyan)
                .foregroundStyle(.black)
        }
    }
}
