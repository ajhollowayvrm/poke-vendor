import SwiftUI

/// A small capsule on a shelf or camp row for hot product.
struct HotTag: View {
    var body: some View {
        Text("HOT")
            .font(.system(size: 9, weight: .bold, design: .monospaced))
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(Theme.orange.opacity(0.2))
            .foregroundStyle(Theme.orange)
            .clipShape(Capsule())
    }
}

/// The flipper market on the Market screen: how many flippers work the shelves, the chains that tightened their limits,
/// and the MSRP step (docs/proposals/sealed-product, Part A 2.1, 1.3, and 3.4).
struct FlipperMarketBox: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let p = store.data.flipperPressure
        let range = Balance.pressureRange
        let word = p < 0.35 ? "Few" : p < 0.65 ? "Busy" : "Swarming"
        let hours = log(1 / 0.29) / (Balance.hotDrainBase + Balance.hotDrainPressure * p)
        let strict = LocalStore.allCases.filter { !$0.isGameShop && store.strictness($0).level > 0 }
        DetailBox(title: "Flippers and stores") {
            HStack(spacing: 0) {
                StatCell(label: "Flippers", value: word, color: p < 0.35 ? Theme.green : p < 0.65 ? Theme.muted : Theme.orange)
                StatCell(label: "Hot shelves", value: "about \(String(format: "%.1f", hours)) hours")
            }
            // A static bar. No animation.
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.line)
                    Capsule().fill(Theme.orange).frame(width: geo.size.width * (p - range.lowerBound) / (range.upperBound - range.lowerBound))
                }
            }
            .frame(height: 6)
            Text("Flippers buy hot in-print product as soon as it lands. More flippers empty shelves faster, cut your camp odds, and compete with your hot sealed listings online. News and booms bring them in. Reprints, corrections, and the end of the holidays drive them out.")
                .font(.caption).foregroundStyle(Theme.muted)
            ForEach(strict, id: \.self) { s in
                let level = store.strictness(s)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(s.rawValue) · level \(level.level) · \(GameStore.levelText(level.level))").font(.subheadline)
                    if let incident = level.lastIncident {
                        Text(incident).font(.caption).foregroundStyle(Theme.muted)
                    }
                }
            }
            if let step = store.data.retail.msrpStepDay {
                let days = step - store.day
                Text(days > 0 ? "MSRP rises 12.5% in \(days) day\(days == 1 ? "" : "s")" : "MSRP rose 12.5% on \(GameCalendar.date(step).text)")
                    .font(.subheadline)
                    .foregroundStyle(days > 0 ? Theme.orange : Theme.muted)
            }
            RivalsBox()
        }
    }
}

/// The rivals that the player has met: name, kind, mood, and the newest meeting (docs/proposals/sealed-product, Part A 2.3).
struct RivalsBox: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let met = store.data.rivals.filter { $0.lastSeenDay >= 0 }
        if !met.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text("Rivals").font(.subheadline.weight(.medium))
                ForEach(met) { r in
                    let mood = r.hostility < 0.3 ? ("Neutral", Theme.muted) : r.hostility < 0.6 ? ("Wary", Theme.orange) : ("Hostile", Color.red)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text(r.name).font(.subheadline)
                            Text(r.handle).font(.caption).foregroundStyle(Theme.muted)
                            Spacer()
                            Text(mood.0).font(.caption.monospaced()).foregroundStyle(mood.1)
                        }
                        Text(r.kind == .creator ? "Creator" : "Flipper · " + r.homeStores.map(\.rawValue).joined(separator: ", "))
                            .font(.caption).foregroundStyle(Theme.muted)
                        if let last = r.memory.last { Text(last.note).font(.caption).foregroundStyle(Theme.muted) }
                    }
                }
            }
        }
    }
}

/// Monthly restock alerts: a tier, a chain for the one-chain tier, and a button to start, change, or stop them
/// (docs/proposals/sealed-product, Part A 1.8). The choices are local state. Only the button writes the game state.
struct RestockAlertsBox: View {
    @Environment(GameStore.self) private var store
    @State private var tier = AlertTier.none
    @State private var chain = LocalStore.walmart
    @State private var message: String?

    var body: some View {
        let current = store.data.retail.alertTier
        let waiting = current != .none && store.day < store.data.retail.alertStartDay
        VStack(alignment: .leading, spacing: 6) {
            Text("Restock alerts").font(.subheadline.weight(.medium))
            Text("The morning report and the calendar name the days that a chain gets its vendor stock.")
                .font(.caption).foregroundStyle(Theme.muted)
            Picker("Tier", selection: $tier) {
                ForEach(AlertTier.allCases, id: \.self) { Text($0.name).tag($0) }
            }
            .pickerStyle(.segmented)
            if tier == .oneChain {
                Picker("Chain", selection: $chain) {
                    ForEach(LocalStore.allCases.filter(\.isBigStore), id: \.self) { Text($0.rawValue).tag($0) }
                }
            }
            Text("\(money(Balance.alertFeeOneChain)) a month for one chain, \(money(Balance.alertFeeAllChains)) for every chain · charged on the 1st with rent. With more than \(Balance.alertProrateDays) days to the 1st, the first fee is charged now. A dearer tier charges the difference now.")
                .font(.caption2).foregroundStyle(Theme.muted)
            if waiting {
                Text("Your alerts start on \(GameCalendar.date(store.data.retail.alertStartDay).text).")
                    .font(.caption).foregroundStyle(Theme.cyan)
            } else if current == .none, tier != .none, store.daysUntilRent <= Balance.alertProrateDays {
                Text("Alerts start on the 1st. The first fee comes then.").font(.caption).foregroundStyle(Theme.cyan)
            }
            if let message { Text(message).font(.caption).foregroundStyle(Theme.orange) }
            HStack {
                Button(tier == .none ? (current == .none ? "Subscribe" : "Stop") : current == .none ? "Subscribe" : "Change") {
                    if store.subscribeAlerts(tier, store: tier == .oneChain ? chain : nil) {
                        message = nil
                    } else {
                        message = "You cannot pay the fee now."
                    }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(tier == current && (tier != .oneChain || store.data.retail.alertStore == chain))
                Spacer()
                Text("Now: \(current.name)\(current == .oneChain ? " · \(store.data.retail.alertStore?.rawValue ?? "")" : "")")
                    .font(.caption.monospaced()).foregroundStyle(Theme.muted)
            }
        }
        .padding(.vertical, 4)
        .onAppear {
            tier = store.data.retail.alertTier
            chain = store.data.retail.alertStore ?? .walmart
        }
    }
}
