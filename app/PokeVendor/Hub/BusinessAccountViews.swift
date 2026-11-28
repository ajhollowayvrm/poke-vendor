import SwiftUI

/// The business account in the Wallet: the two balances, the money in and out, the bills soon due, and the transfers
/// (Model/BusinessAccount.swift).
struct BusinessAccountBox: View {
    @Environment(GameStore.self) private var store
    @State private var amount = 500.0

    var body: some View {
        let flow = store.businessFlow(days: 28)
        let bills = store.businessBillsDue(within: 14)
        let short = bills > store.businessCash + 0.001
        DetailBox(title: "Business account") {
            HStack(spacing: 0) {
                StatCell(label: "Business", value: money(store.businessCash), color: short ? Theme.orange : Theme.cyan)
                StatCell(label: "Your own", value: money(store.personalCash))
                StatCell(label: "Bills in 14 d", value: money(bills), color: short ? Theme.orange : Theme.text)
            }
            if short {
                Text("The business account cannot pay the bills that come due in the next 14 days. A bill that it cannot pay fails: the landlord locks the store, and the staff stays home. Move money in.")
                    .font(.caption)
                    .foregroundStyle(Theme.orange)
            }
            HStack(spacing: 0) {
                StatCell(label: "In · 28 d", value: money(flow.moneyIn), color: Theme.green)
                StatCell(label: "Out · 28 d", value: money(flow.moneyOut), color: Theme.orange)
                StatCell(label: "Net · 28 d", value: signedMoney(flow.moneyIn - flow.moneyOut),
                         color: flow.moneyIn >= flow.moneyOut ? Theme.green : Theme.orange)
            }
            Text("Last 28 days: you put in \(money(flow.putIn)), and you took \(money(flow.drawn)).")
                .font(.caption.monospaced())
                .foregroundStyle(Theme.muted)
            Text("AMOUNT").font(.system(size: 10, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted).padding(.top, 4)
            Picker("Amount", selection: $amount) {
                ForEach(Balance.accountTransferSteps, id: \.self) { a in Text(money(a)).tag(a) }
            }
            .pickerStyle(.segmented)
            HStack(spacing: 8) {
                Button { store.moveToBusiness(amount) } label: {
                    Text("Move in \(money(min(amount, store.personalCash)))").lineLimit(1).minimumScaleFactor(0.8).frame(maxWidth: .infinity)
                }
                .primaryButton()
                .disabled(store.personalCash < 0.01)
                Button { store.payYourself(amount) } label: {
                    Text("Pay yourself \(money(min(amount, store.businessCash)))").lineLimit(1).minimumScaleFactor(0.8).frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(store.businessCash < 0.01)
            }
            Text("Store sales, the counter, the buylist, and the distributor use the business account. So do rent, wages, overhead, marketing, fixtures, and events. Shows, eBay, rips, and everything else use your own cash. If a move is more than an account has, all of it moves.")
                .font(.caption)
                .foregroundStyle(Theme.muted)
        }
    }
}

/// The two balances in one line, for the top of the store screen.
struct AccountsLine: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        HStack(spacing: 10) {
            Spacer()
            if store.hasBusinessAccount {
                Text("Business \(money(store.businessCash))").foregroundStyle(Theme.cyan)
                Text("You \(money(store.personalCash))")
            } else {
                Text("Cash \(money(store.cash))")
            }
        }
        .font(.caption.monospaced())
    }
}

/// The two balances on the store screen. The Wallet holds the transfers and the bills.
struct WalletLinkRow: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let short = store.businessBillsDue(within: 14) > store.businessCash + 0.001
        NavigationLink(value: AppRoute.wallet) {
            ChevronRow(icon: "dollarsign.circle", title: "Finances",
                       detail: "Business \(money(store.businessCash)) · yours \(money(store.personalCash))" + (short ? " · bills due soon" : ""),
                       accent: short)
                .padding(12)
        }
        .buttonStyle(.plain)
        .background(Theme.surface)
        .framed()
    }
}

/// Every bill to come, and the ones that wait for the player, with the account that pays each. The player picks the
/// account for a bill they pay now (Model/Bills.swift).
struct BillsBox: View {
    @Environment(GameStore.self) private var store
    @State private var payFrom: MoneyAccount = .personal
    @State private var note: String?

    var body: some View {
        let bills = store.walletBills
        DetailBox(title: "Bills") {
            if bills.isEmpty {
                Text("Nothing is due.").font(.subheadline).foregroundStyle(Theme.muted)
            }
            if store.hasBusinessAccount, bills.contains(where: { $0.payment != nil }) {
                Picker("Pay from", selection: $payFrom) {
                    Text("Pay from yours · \(money(store.personalCash))").tag(MoneyAccount.personal)
                    Text("Business · \(money(store.businessCash))").tag(MoneyAccount.business)
                }
                .pickerStyle(.segmented)
            }
            ForEach(bills) { bill in
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(bill.title).font(.subheadline).foregroundStyle(bill.urgent ? Theme.orange : Theme.text)
                            Text(bill.detail).font(.caption).foregroundStyle(Theme.muted).lineLimit(2)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(money(bill.amount)).font(.subheadline.monospaced().weight(.semibold))
                            Text(due(bill)).font(.caption.monospaced()).foregroundStyle(bill.urgent ? Theme.orange : Theme.muted)
                        }
                    }
                    if let payment = bill.payment {
                        let from = store.hasBusinessAccount ? payFrom : .personal
                        Button("Pay \(money(bill.amount)) now\(store.hasBusinessAccount ? (from == .business ? " from the business" : " from yours") : "")") {
                            note = store.payWalletBill(payment, from: from) ? nil : "That account cannot cover \(money(bill.amount))."
                        }
                        .buttonStyle(.bordered)
                        .tint(bill.urgent ? Theme.orange : Theme.cyan)
                        .controlSize(.small)
                        .disabled(store.balance(from) < bill.amount - 0.001)
                    } else if store.hasBusinessAccount {
                        Text(bill.account == .business ? "The business account pays it on its day." : "Your own account pays it on its day.")
                            .font(.caption2).foregroundStyle(Theme.muted)
                    }
                }
                .padding(.vertical, 2)
            }
            if let note { Text(note).font(.caption).foregroundStyle(Theme.orange) }
            if store.hasBusinessAccount {
                Divider().overlay(Theme.line)
                // The card on file for PSA, CGC, and BGS (GameStore.gradingAccount).
                Text("GRADERS CHARGE").font(.system(size: 10, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
                Picker("Graders charge", selection: Binding(get: { store.gradingAccount }, set: { store.setGradingAccount($0) })) {
                    Text("Yours").tag(MoneyAccount.personal)
                    Text("Business").tag(MoneyAccount.business)
                }
                .pickerStyle(.segmented)
                Text("PSA's bills when the grades come back, and the fees of CGC and BGS when the cards go in.")
                    .font(.caption).foregroundStyle(Theme.muted)
            }
        }
    }

    private func due(_ bill: WalletBill) -> String {
        guard let days = bill.dueIn else { return "due now" }
        return days == 0 ? "today" : days == 1 ? "tomorrow" : "in \(days) days"
    }
}
