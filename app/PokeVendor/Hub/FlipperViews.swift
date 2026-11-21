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
        }
    }
}
