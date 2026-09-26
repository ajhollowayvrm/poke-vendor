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
