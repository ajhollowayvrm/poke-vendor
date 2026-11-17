import SwiftUI

/// "Record today's episode" on a daily series: the player picks sealed product from Inventory, and the rip records for
/// this series (docs/32-short-form-video.md, Record today's episode). The last pack's summary posts the episode.
struct RecordEpisodeSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let format: SeriesFormat
    /// Runs after the sheet closes, with the items to rip.
    let onRecord: ([SealedItem]) -> Void
    /// How many of each stack the player picked.
    @State private var picked: [String: Int] = [:]

    /// One row for each product: the free copies, cheapest join first.
    private struct Stack: Identifiable {
        let id: String
        let name: String
        let image: String?
        let items: [SealedItem]
    }

    private var series: ShortSeries? { store.series(format) }

    /// Sealed items that can be in the rip: no status, not in the PC. For the P&L challenge, only items that are in
    /// it or can join it.
    private var stacks: [Stack] {
        let free = store.data.sealed.filter { $0.status == nil && !$0.setAside }
            .filter { format != .pnl || store.isChallengeItem($0.id) || store.challengeBlock($0.id) == nil || blockedOnlyByCash($0) }
        let groups = Dictionary(grouping: free) { "\($0.productID ?? $0.setSlug)|\($0.name)" }
        return groups.map { key, items in
            Stack(id: key, name: items[0].name, image: SetLibrary.product(items[0].productID)?.image,
                  items: items.sorted { cost($0) < cost($1) })
        }
        .sorted { $0.name < $1.name }
    }

    /// An item that would join if the challenge had more cash. It shows, and the total check stops it.
    private func blockedOnlyByCash(_ item: SealedItem) -> Bool {
        store.challengeBlock(item.id)?.hasPrefix("The challenge cash") == true
    }

    /// What an item takes from the challenge cash. Zero outside the P&L challenge, and for an item already in it.
    private func cost(_ item: SealedItem) -> Double {
        format == .pnl && !store.isChallengeItem(item.id) ? store.joinCost(item.id) : 0
    }

    private var chosen: [SealedItem] {
        stacks.flatMap { Array($0.items.prefix(picked[$0.id] ?? 0)) }
    }

    private var total: Double { chosen.reduce(0) { $0 + cost($1) } }

    private var block: String? {
        guard let series else { return "The series ended." }
        if series.lastEpisodeDay == store.day { return "Today's episode is up." }
        if chosen.isEmpty { return "Pick something to rip." }
        if format == .pnl, total > series.cash + 0.001 { return "The challenge cash is \(money(series.cash)). This rip needs \(money(total))." }
        return nil
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if stacks.isEmpty {
                        Text("You have no sealed product to rip.").foregroundStyle(Theme.muted)
                    }
                    ForEach(stacks) { stack in row(stack) }
                } footer: {
                    Text(format == .pnl
                         ? "Items join the challenge before the rip. An item that you bought during the challenge costs what you paid. An older item joins at today's market. The pulls and the bulk join too."
                         : "The rip is filmed in Normal or Fast mode. When the last pack is done, post the episode from the summary.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .navigationTitle(series?.name ?? format.label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 6) {
                    if format == .pnl, let series {
                        Text("Challenge cash \(money(series.cash)) · this rip \(money(total))")
                            .font(.caption.monospaced())
                            .foregroundStyle(total > series.cash + 0.001 ? Theme.orange : Theme.muted)
                    }
                    if let block, !chosen.isEmpty { Text(block).font(.caption).foregroundStyle(Theme.orange) }
                    Button {
                        let items = chosen
                        dismiss()
                        onRecord(items)
                    } label: {
                        Label("Record & Rip\(chosen.isEmpty ? "" : " · \(chosen.count)")", systemImage: "record.circle")
                            .frame(maxWidth: .infinity)
                    }
                    // White text: the black text of `primaryButton` does not show on red, or on the disabled fill.
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                    .disabled(block != nil)
                }
                .padding(16)
                .background(.bar)
            }
        }
    }

    private func row(_ stack: Stack) -> some View {
        let n = picked[stack.id] ?? 0
        return HStack(spacing: 12) {
            ProductImage(url: stack.image, setName: stack.name)
                .frame(width: 40, height: 52)
            VStack(alignment: .leading, spacing: 2) {
                Text(stack.name).font(.subheadline).lineLimit(2)
                Text("\(stack.items.count) in Inventory\(format == .pnl && n > 0 ? " · \(money(stack.items.prefix(n).reduce(0) { $0 + cost($1) }))" : "")")
                    .font(.caption.monospaced())
                    .foregroundStyle(Theme.muted)
            }
            Spacer()
            Stepper(value: Binding(get: { picked[stack.id] ?? 0 }, set: { picked[stack.id] = $0 }), in: 0...stack.items.count) {
                Text("\(n)").font(.subheadline.monospaced()).foregroundStyle(n > 0 ? Theme.cyan : Theme.muted)
            }
            .fixedSize()
        }
    }
}
