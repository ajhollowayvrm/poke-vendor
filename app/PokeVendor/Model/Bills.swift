import Foundation

// The bills in the Wallet (docs/08-ui-direction.md, Wallet / cash ledger). Every payment that comes due, with the
// account that pays it on its own. A bill the player can pay now has an action, and the player picks the account.

/// A payment the player can make from the Wallet.
enum WalletPayment: Hashable {
    case salesTax, incomeTax
    case grading(UUID)
    case distributor(UUID)
}

/// One bill to come, or one that waits for the player.
struct WalletBill: Identifiable {
    let id: String
    let title: String
    let detail: String
    let amount: Double
    /// Days until it comes due. Nil: it waits for the player now.
    let dueIn: Int?
    /// The account that pays it on its own.
    let account: MoneyAccount
    /// Nil: the game pays it on its day.
    let payment: WalletPayment?
    /// Late, held, or past due.
    var urgent = false
}

@MainActor
extension GameStore {
    /// Every bill, the soonest first.
    var walletBills: [WalletBill] {
        var out: [WalletBill] = []
        let today = data.day
        if rentNow > 0 {
            out.append(WalletBill(id: "rent", title: "Rent", detail: "Your home · paid on the 1st", amount: rentNow,
                                  dueIn: daysUntilRent, account: .personal, payment: nil))
        }
        if let s = data.cardStore, let left = daysUntilStoreRent {
            out.append(WalletBill(id: "storeRent", title: "Store rent and overhead", detail: s.name, amount: s.rent + storeOverhead(s).total,
                                  dueIn: left, account: .business, payment: nil))
            let wage = staffDailyWage
            if wage > 0 {
                out.append(WalletBill(id: "wages", title: "Staff wages", detail: "Each open day, at End Day", amount: wage,
                                      dueIn: 0, account: .business, payment: nil))
            }
        }
        let taxes = data.taxes
        if taxes.salesTaxOwed >= 0.01 {
            out.append(WalletBill(id: "salesTax", title: "Sales tax", detail: "The buyers paid it. It is not your money.",
                                  amount: taxes.salesTaxOwed, dueIn: daysUntilSalesTax,
                                  account: (taxes.businessSalesTaxOwed ?? 0) >= 0.01 ? .business : .personal, payment: .salesTax))
        }
        if taxes.incomeTaxOwed >= 0.01 {
            out.append(WalletBill(id: "incomeTax", title: "Back income tax", detail: "From an earlier quarter, with the penalty",
                                  amount: taxes.incomeTaxOwed, dueIn: nil, account: .personal, payment: .incomeTax, urgent: true))
        }
        let estimate = incomeTaxEstimate
        if estimate >= 0.01 {
            out.append(WalletBill(id: "incomeEstimate", title: "Income tax, this quarter so far", detail: "\(Int(Balance.incomeTaxRate * 100))% of the profit",
                                  amount: estimate, dueIn: daysUntilIncomeTax, account: .personal, payment: nil))
        }
        for bill in data.gradingBills {
            let extra = possibleUpcharge(bill)
            out.append(WalletBill(id: "grading-\(bill.id)", title: "\(bill.company.rawValue) bill · \(bill.cards) card\(bill.cards == 1 ? "" : "s")",
                                  detail: bill.held ? "\(bill.company.rawValue) holds the order until you pay" : "\(bill.tier)" + (extra > 0 ? " · up to \(money(bill.amount + extra)) with upcharges" : ""),
                                  amount: bill.amount, dueIn: bill.held ? nil : max(0, bill.dueDay - today), account: gradingAccount,
                                  payment: bill.held ? .grading(bill.id) : nil, urgent: bill.held))
        }
        for p in payables {
            out.append(WalletBill(id: "payable-\(p.id)", title: "Distributor bill", detail: p.label, amount: p.amount,
                                  dueIn: max(0, p.dueDay - today), account: .business, payment: .distributor(p.id), urgent: p.late))
        }
        for loan in data.debt.loans {
            let due = loan.kind == .payday ? loan.payoff : min(loan.payment + loan.pastDue, loan.payoff)
            out.append(WalletBill(id: "loan-\(loan.id)", title: "\(loan.kind.rawValue) payment", detail: loan.lender, amount: due,
                                  dueIn: max(0, loan.nextDueDay - today), account: .personal, payment: nil, urgent: loan.pastDue > 0))
        }
        if data.insurance.active {
            out.append(WalletBill(id: "insurance", title: "Insurance premium", detail: "Collection insurance", amount: insurancePremium,
                                  dueIn: max(0, data.insurance.nextPremiumDay - today), account: .personal, payment: nil))
        }
        return out.sorted { ($0.dueIn ?? -1) < ($1.dueIn ?? -1) }
    }

    /// Pays a bill now from the chosen account. Returns false when that account cannot cover it.
    @discardableResult
    func payWalletBill(_ payment: WalletPayment, from account: MoneyAccount) -> Bool {
        switch payment {
        case .salesTax:
            let owed = data.taxes.salesTaxOwed
            guard balance(resolve(account)) >= owed - 0.001 else { return false }
            payTaxes(income: false, from: account)
            return data.taxes.salesTaxOwed < 0.01
        case .incomeTax:
            let owed = data.taxes.incomeTaxOwed
            guard balance(resolve(account)) >= owed - 0.001 else { return false }
            payTaxes(income: true, from: account)
            return data.taxes.incomeTaxOwed < 0.01
        case .grading(let id): return payGradingBill(id, from: account)
        case .distributor(let id): return payPayable(id, from: account)
        }
    }
}
