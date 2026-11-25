import SwiftUI

/// The pull list: each regular's product, the next pickup, and the discount (Model/PullBoxes.swift).
struct PullListBox: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        DetailBox(title: "Pull boxes · \(store.pulls.count) of \(store.pullLimit)") {
            if store.pulls.isEmpty {
                Text("No pulls yet. A regular can ask for one at the counter.").font(.caption).foregroundStyle(Theme.muted)
            }
            ForEach(store.pulls) { p in
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(store.contact(p.contactID)?.name ?? "A regular") · \(p.name)").font(.subheadline).lineLimit(2)
                        Text("Every \(p.cycle / 7) weeks · next \(GameCalendar.date(p.nextDay).text)\(p.misses > 0 ? " · missed \(p.misses)" : "")")
                            .font(.caption.monospaced())
                            .foregroundStyle(p.misses > 0 ? Theme.orange : Theme.muted)
                    }
                    Spacer()
                    Button("End", role: .destructive) { store.endPull(p.id) }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                }
            }
            HStack {
                Text("Pull discount").font(.caption)
                Spacer()
                Picker("Pull discount", selection: Binding(get: { store.pullDiscount }, set: { store.setPullDiscount($0) })) {
                    ForEach(Balance.pullDiscounts, id: \.self) { d in Text("\(Int((d * 100).rounded()))%").tag(d) }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 220)
            }
            Text("On the pickup day, the store sells them one at the sealed shelf price less the discount. Keep one in Inventory or on the shelf.")
                .font(.caption2).foregroundStyle(Theme.muted)
        }
    }
}
