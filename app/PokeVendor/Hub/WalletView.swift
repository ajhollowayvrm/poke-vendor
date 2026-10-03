import SwiftUI

/// Where the money went, and where it came from (docs/08-ui-direction.md, Wallet / cash ledger).
struct WalletView: View {
    @Environment(GameStore.self) private var store
    @State private var month = false

    var body: some View {
        let days = month ? 28 : 7
        let period = store.data.ledger.filter { store.day - $0.day < days }
        let moneyIn = period.filter { $0.amount > 0 }.reduce(0) { $0 + $1.amount }
        let moneyOut = period.filter { $0.amount < 0 }.reduce(0) { $0 - $1.amount }
        let spend = Dictionary(grouping: period.filter { $0.amount < 0 }, by: \.category)
            .map { ($0.key, $0.value.reduce(0) { $0 - $1.amount }) }
            .sorted { $0.1 > $1.1 }
        ScrollView {
            VStack(spacing: 14) {
                VStack(spacing: 4) {
                    Text("CASH").font(.system(size: 10, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
                    Text(money(store.cash)).font(.system(size: 34, weight: .semibold, design: .monospaced))
                }
                .padding(.top, 8)
                DetailBox(title: month ? "Last 4 weeks" : "Last 7 days") {
                    Picker("Period", selection: $month) {
                        Text("Week").tag(false)
                        Text("Month").tag(true)
                    }
                    .pickerStyle(.segmented)
                    HStack(spacing: 0) {
                        StatCell(label: "Money in", value: money(moneyIn), color: Theme.green)
                        StatCell(label: "Money out", value: money(moneyOut), color: Theme.orange)
                        StatCell(label: "Net", value: signedMoney(moneyIn - moneyOut),
                                 color: moneyIn >= moneyOut ? Theme.green : Theme.orange)
                    }
                    if !spend.isEmpty {
                        Text("WHERE IT WENT").font(.system(size: 10, weight: .semibold)).kerning(0.8)
                            .foregroundStyle(Theme.muted).padding(.top, 6)
                        ForEach(spend, id: \.0) { category, amount in
                            VStack(alignment: .leading, spacing: 3) {
                                HStack {
                                    Text(category.rawValue).font(.caption)
                                    Spacer()
                                    Text(money(amount)).font(.caption.monospaced())
                                }
                                GeometryReader { geo in
                                    Rectangle().fill(Theme.orange.opacity(0.7))
                                        .frame(width: geo.size.width * amount / max(moneyOut, 0.01))
                                }
                                .frame(height: 6)
                                .background(Theme.line)
                            }
                        }
                    }
                }
                TaxBox()
                debtBox
                insuranceBox
                DetailBox(title: "Ledger") {
                    ForEach(store.data.ledger.reversed()) { entry in
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(entry.label).font(.subheadline).lineLimit(2)
                                HStack(spacing: 6) {
                                    Text("\(entry.category.rawValue) · day \(entry.day + 1)")
                                        .font(.caption.monospaced())
                                        .foregroundStyle(Theme.muted)
                                    if entry.pending { Tag(text: "PENDING", color: Theme.orange) }
                                }
                            }
                            Spacer()
                            Text(signedMoney(entry.amount))
                                .font(.subheadline.monospaced().weight(.semibold))
                                .foregroundStyle(entry.amount >= 0 ? Theme.green : Theme.text)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Wallet")
        .navigationBarTitleDisplayMode(.inline)
    }
}

extension WalletView {
    /// Credit and debt, with the way into the Loans screen (docs/27-debt-and-loans.md).
    private var debtBox: some View {
        let debt = store.data.debt
        return DetailBox(title: "Debt and credit") {
            HStack(spacing: 0) {
                StatCell(label: "Credit score", value: "\(store.creditScore)")
                StatCell(label: "You owe", value: money(store.totalDebt), color: store.totalDebt > 0 ? Theme.orange : Theme.text)
                StatCell(label: "Net worth", value: money(store.netWorth), color: store.netWorth >= 0 ? Theme.green : Theme.orange)
            }
            if !debt.collections.isEmpty {
                Text("A debt is in collections. The collector takes part of each paycheck.").font(.caption).foregroundStyle(Theme.orange)
            }
            Text("\(debt.loans.count) loan\(debt.loans.count == 1 ? "" : "s") · \(debt.line == nil ? "no line of credit" : "line of credit open") · \(debt.pawns.count) pawn ticket\(debt.pawns.count == 1 ? "" : "s")")
                .font(.caption.monospaced()).foregroundStyle(Theme.muted)
            NavigationLink(value: AppRoute.loans) {
                Text("Loans and the pawn shop").frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
    }

    /// Collection insurance (docs/24-theft-and-insurance.md).
    private var insuranceBox: some View {
        let policy = store.data.insurance
        let percent = Int(Balance.policyCoverage * 100)
        return DetailBox(title: "Collection insurance") {
            HStack(spacing: 0) {
                StatCell(label: "Insured value", value: money(store.insuredValue))
                StatCell(label: "Premium", value: money(store.insurancePremium))
                StatCell(label: policy.active ? "Next premium" : "Status",
                         value: policy.active ? "Day \(policy.nextPremiumDay + 1)" : "None",
                         color: policy.active ? Theme.green : Theme.muted)
            }
            Text("Pays \(percent)% of the market value of stolen or damaged items, less a \(money(Balance.policyDeductible)) deductible on each claim. The premium is due every 4 weeks.")
                .font(.caption).foregroundStyle(Theme.muted)
            if policy.active {
                Text("Premiums paid \(money(policy.premiumsPaid)) · Payouts \(money(policy.payouts))")
                    .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                Button("Cancel the policy") { store.cancelInsurance() }
                    .buttonStyle(.bordered)
            } else {
                Button("Sign up · \(money(store.insurancePremium))") { store.signInsurance() }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.cyan)
                    .foregroundStyle(.black)
                    .disabled(!store.canSignInsurance)
            }
        }
    }
}

/// Every event, cash and non-cash (docs/08-ui-direction.md).
struct ActivityView: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let days = Dictionary(grouping: store.data.activity, by: \.day).sorted { $0.key > $1.key }
        List {
            ForEach(days, id: \.key) { day, entries in
                Section("Day \(day + 1) · \(GameStore.weekdays[day % 7])") {
                    ForEach(entries.reversed()) { entry in
                        HStack(alignment: .top) {
                            Text(entry.text).font(.subheadline)
                            Spacer()
                            if let cash = entry.cash {
                                Text(signedMoney(cash)).font(.caption.monospaced())
                                    .foregroundStyle(cash >= 0 ? Theme.green : Theme.muted)
                            }
                        }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Activity")
        .navigationBarTitleDisplayMode(.inline)
    }
}
