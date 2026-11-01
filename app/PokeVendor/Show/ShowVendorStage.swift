import SwiftUI

struct VendorStage: View {
    @Environment(GameStore.self) private var store
    let session: ShowSession
    let vendor: Vendor
    @State private var tab: Aisle = .singles
    @State private var trading = false

    private enum Aisle: String, CaseIterable { case singles = "Singles", sealed = "Sealed" }

    /// Singles and slabs, or sealed product and mystery packs.
    private func inAisle(_ item: VendorItem, _ aisle: Aisle) -> Bool {
        switch item.goods {
        case .single, .slab: aisle == .singles
        case .sealed, .mystery: aisle == .sealed
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 10) {
                        Image(systemName: vendor.kind.icon).font(.title2).foregroundStyle(Theme.cyan)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(vendor.name).font(.title3.bold())
                            Text(vendor.kind.label).font(.subheadline).foregroundStyle(Theme.muted)
                        }
                    }
                    Text(vendor.kind.tagline).font(.subheadline).foregroundStyle(Theme.muted)
                    if vendor.kind.trades {
                        Button { trading = true } label: {
                            Label("Trade with \(vendor.name)", systemImage: "arrow.left.arrow.right").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .tint(Theme.cyan)
                        .controlSize(.large)
                    }
                    if let id = vendor.contactID {
                        HStack(spacing: 6) {
                            LevelBadge(level: store.level(id))
                            if let memory = store.contact(id)?.memory.first {
                                Text("Last time: \(memory)").font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                            }
                        }
                    }
                    let saved = session.saved(at: vendor)
                    if !saved.isEmpty {
                        TitledGroup(title: "Saved for you", count: saved.count, list: "show") {
                            ForEach(saved) { item in
                                HStack(alignment: .top, spacing: 10) {
                                    GoodsImage(item: VendorItem(goods: item.goods, price: item.price, market: item.market))
                                        .frame(width: 44, height: 62)
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(item.name).font(.subheadline.weight(.semibold))
                                        GoodsDetail(goods: item.goods, tool: store.data.centeringTool)
                                        Text("mkt \(money(item.market))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                                    }
                                    Spacer()
                                    Button(money(item.price)) { withAnimation { session.pickUp(item) } }
                                        .primaryButton()
                                        .tint(Theme.green)
                                        .controlSize(.small)
                                        .disabled(!store.canAfford(item.price))
                                }
                                .padding(12)
                            }
                        }
                        .overlay(Rectangle().stroke(Theme.green.opacity(0.5)))
                    }
                    let firstLook = vendor.items.filter(\.firstLook)
                    if !firstLook.isEmpty {
                        // Reputation Trusted: a first look before the public table (docs/04).
                        TitledGroup(title: "First look · for you, before the table opens", count: firstLook.count, list: "show") {
                            ForEach(firstLook) { item in row(item) }
                        }
                        .overlay(Rectangle().stroke(Theme.cyan.opacity(0.5)))
                    }
                    Picker("Aisle", selection: $tab) {
                        ForEach(Aisle.allCases, id: \.self) { aisle in
                            Text("\(aisle.rawValue) · \(vendor.items.filter { inAisle($0, aisle) && !$0.firstLook }.count)").tag(aisle)
                        }
                    }
                    .pickerStyle(.segmented)
                    let shown = vendor.items.filter { inAisle($0, tab) && !$0.firstLook }
                    if shown.isEmpty {
                        Text(tab == .singles ? "No singles left at this table." : "No sealed product left at this table.")
                            .font(.subheadline).foregroundStyle(Theme.muted)
                    }
                    if tab == .sealed {
                        // Sealed shows by set, newest set first. Mystery packs have no set, so they come first.
                        let mystery = shown.filter { if case .mystery = $0.goods { return true }; return false }
                        if !mystery.isEmpty {
                            TitledGroup(title: "Mystery packs", count: mystery.count, list: "show") {
                                ForEach(mystery) { item in row(item) }
                            }
                        }
                        let sealed = shown.filter { if case .sealed = $0.goods { return true }; return false }
                        ForEach(SetLibrary.grouped(sealed, by: { item in
                            if case .sealed(let p) = item.goods { return p.homeSlug }
                            return ""
                        }), id: \.slug) { group in
                            SetGroup(slug: group.slug, count: group.items.count, list: "show") {
                                ForEach(group.items) { item in row(item) }
                            }
                        }
                    } else {
                        ForEach(shown) { item in row(item) }
                    }
                }
                .padding(16)
            }
            Button { withAnimation(.easeInOut(duration: 0.25)) { session.closeVendor() } } label: {
                Label("Back to the floor", systemImage: "chevron.left").frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .padding(16)
        }
        .sheet(isPresented: $trading) { VendorTradeSheet(session: session, vendorID: vendor.id) }
        .onAppear {
            #if DEBUG
            // Screenshot aid: `tradesheet` opens the trade sheet.
            if ProcessInfo.processInfo.arguments.contains("tradesheet"), vendor.kind.trades { trading = true }
            #endif
        }
    }

    private func row(_ item: VendorItem) -> some View {
        GoodsRow(item: item, tool: store.data.centeringTool, canAfford: store.canAfford(item.price),
                 buy: { withAnimation { session.buy(item, from: vendor) } },
                 ask: { session.askForDeal(item, from: vendor) })
    }
}
