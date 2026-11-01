import SwiftUI

/// A trade with one vendor: items from their table for items from the player's stock, with cash to even the deal.
struct VendorTradeSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let session: ShowSession
    let vendorID: UUID
    @State private var give: Set<UUID> = []
    @State private var get: Set<UUID> = []

    private var vendor: Vendor? { session.vendors.first { $0.id == vendorID } }

    var body: some View {
        if let vendor {
            let theirs = vendor.items.filter { if case .mystery = $0.goods { return false }; return true }
            let mine = session.tradeStock
            // Items that left the table or the stock drop out of the picks.
            let giving = give.intersection(mine.map(\.id))
            let getting = get.intersection(theirs.map(\.id))
            let quote = session.tradeQuote(give: giving, get: getting, at: vendor)
            VStack(spacing: 0) {
                Text("Trade with \(vendor.name)").font(.title3.bold()).padding(16)
                ScrollView {
                    VStack(alignment: .leading, spacing: 10) {
                        TitledGroup(title: "From their table", count: theirs.count, list: "trade") {
                            ForEach(theirs) { item in
                                pick(selected: getting.contains(item.id), toggle: { flip(item.id, in: &get) }) {
                                    HStack(alignment: .top, spacing: 10) {
                                        GoodsImage(item: item).frame(width: 44, height: 62)
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(item.name).font(.subheadline.weight(.semibold)).lineLimit(2)
                                            GoodsDetail(goods: item.goods, tool: store.data.centeringTool)
                                            if item.looksOff { LooksOffLine(sealed: item.isSealed) }
                                        }
                                        Spacer(minLength: 0)
                                        VStack(alignment: .trailing, spacing: 2) {
                                            Text(money(item.price)).font(.subheadline.monospaced())
                                            if let market = item.market {
                                                Text("mkt \(money(market))").font(.caption2.monospaced()).foregroundStyle(Theme.muted)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        TitledGroup(title: "From your stock", count: mine.count, list: "trade") {
                            ForEach(mine) { item in
                                pick(selected: giving.contains(item.id), toggle: { flip(item.id, in: &give) }) {
                                    HStack(spacing: 10) {
                                        ItemLine(item: item)
                                        Spacer(minLength: 0)
                                        VStack(alignment: .trailing, spacing: 2) {
                                            Text(money(session.tradeValue(item, at: vendor))).font(.subheadline.monospaced())
                                            Text("mkt \(money(item.market))").font(.caption2.monospaced()).foregroundStyle(Theme.muted)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                }
                footer(vendor, quote: quote, giving: giving, getting: getting)
            }
            .background(Theme.background)
            .onAppear {
                #if DEBUG
                debugPicks()
                #endif
            }
        }
    }

    private func footer(_ vendor: Vendor, quote: VendorTradeQuote, giving: Set<UUID>, getting: Set<UUID>) -> some View {
        VStack(spacing: 8) {
            HStack {
                Text("Their items").foregroundStyle(Theme.muted)
                Spacer()
                Text(money(quote.getValue)).monospaced()
            }
            HStack {
                Text("Your items at \(Int((quote.rate * 100).rounded()))%").foregroundStyle(Theme.muted)
                Spacer()
                Text(money(quote.giveValue)).monospaced()
            }
            HStack {
                Text(quote.cash < 0 ? "They add" : "You add").font(.headline)
                Spacer()
                Text(money(abs(quote.cash))).font(.headline.monospaced())
                    .foregroundStyle(quote.cash < 0 ? Theme.green : Theme.text)
            }
            if let problem = quote.problem {
                Text(problem).font(.caption).foregroundStyle(Theme.orange).frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(spacing: 10) {
                Button(vendor.askedForRate ? "Asked" : "Ask for a better rate") { session.askForBetterRate(at: vendor) }
                    .buttonStyle(.bordered)
                    .disabled(vendor.askedForRate)
                Button { propose(vendor, giving: giving, getting: getting) } label: {
                    Text("Propose").frame(maxWidth: .infinity)
                }
                .primaryButton()
                .tint(Theme.cyan)
                .disabled(quote.problem != nil)
            }
            .controlSize(.large)
            Button("Close") { dismiss() }.font(.subheadline).foregroundStyle(Theme.muted)
        }
        .font(.subheadline)
        .padding(16)
        .background(Theme.surface)
        .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
    }

    #if DEBUG
    /// Screenshot aid: `tradesheet` picks the two best items of the player and the cheapest item of the vendor.
    private func debugPicks() {
        guard ProcessInfo.processInfo.arguments.contains("tradesheet"), let vendor else { return }
        give = Set(session.tradeStock.filter { $0.market >= Balance.tradeMinItem }.prefix(2).map(\.id))
        if let item = vendor.items.filter({ if case .mystery = $0.goods { return false }; return true }).min(by: { $0.price < $1.price }) {
            get = [item.id]
        }
    }
    #endif

    private func propose(_ vendor: Vendor, giving: Set<UUID>, getting: Set<UUID>) {
        let done = withAnimation { session.proposeVendorTrade(give: giving, get: getting, at: vendor) }
        if done { dismiss() }
    }

    private func flip(_ id: UUID, in set: inout Set<UUID>) {
        if set.contains(id) { set.remove(id) } else { set.insert(id) }
    }

    /// One row with a check mark. The row toggles its pick when tapped.
    private func pick<Label: View>(selected: Bool, toggle: @escaping () -> Void, @ViewBuilder label: () -> Label) -> some View {
        Button(action: toggle) {
            HStack(spacing: 10) {
                Image(systemName: selected ? "checkmark.circle.fill" : "circle").foregroundStyle(selected ? Theme.cyan : Theme.muted)
                label()
            }
            .padding(12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
