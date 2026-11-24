import SwiftUI

/// The business account on the store screen: the two balances, the money in and out, the bills soon due, and the
/// transfers (Model/BusinessAccount.swift).
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
