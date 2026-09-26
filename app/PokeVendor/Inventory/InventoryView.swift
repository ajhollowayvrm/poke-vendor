import SwiftUI

enum InventoryTab: String, CaseIterable, Hashable {
    case sealed = "Sealed", raw = "Raw", slabs = "Slabs", bulk = "Bulk"
}

enum SortOrder: String, CaseIterable {
    case newest = "Newest", value = "Highest value", setOrder = "Set order"
}

/// The order of a card inside its set, from its card number.
func setOrder(_ num: String) -> Int {
    Int(num.split(separator: "/").first ?? "") ?? 0
}

struct InventoryView: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav
    @State private var tab: InventoryTab
    @State private var sort: SortOrder = .newest
    @State private var keptOnly = false
    @State private var selecting = false
    @State private var selection: Set<UUID> = []
    @State private var sellIDs: SellRequest?
    @State private var gradeIDs: GradeRequest?

    init(startTab: InventoryTab = .sealed) {
        _tab = State(initialValue: startTab)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                PortfolioHeader()
                tabPicker
                controls
                rows
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(Theme.background.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) {
            if selecting { actionBar }
        }
        .navigationTitle("Inventory")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(selecting ? "Done" : "Select") {
                    selecting.toggle()
                    selection = []
                }
            }
        }
        .onChange(of: tab) { _, _ in selection = [] }
        .sheet(item: $sellIDs) { request in
            SellSheet(ids: request.ids)
        }
        .sheet(item: $gradeIDs) { request in
            GradeSheet(ids: request.ids)
        }
    }

    // MARK: - Pieces

    private var tabPicker: some View {
        Picker("Tab", selection: $tab) {
            ForEach(InventoryTab.allCases, id: \.self) { t in
                Text("\(t.rawValue) \(count(t))").tag(t)
            }
        }
        .pickerStyle(.segmented)
    }

    private var controls: some View {
        HStack {
            if tab != .bulk {
                Button {
                    keptOnly.toggle()
                } label: {
                    Label("Kept only", systemImage: keptOnly ? "checkmark.square.fill" : "square")
                        .font(.subheadline)
                }
                .foregroundStyle(keptOnly ? Theme.cyan : Theme.muted)
            }
            Spacer()
            Menu {
                Picker("Sort", selection: $sort) {
                    ForEach(SortOrder.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
            } label: {
                Label(sort.rawValue, systemImage: "arrow.up.arrow.down")
                    .font(.subheadline)
            }
        }
    }

    @ViewBuilder private var rows: some View {
        VStack(spacing: 0) {
            switch tab {
            case .sealed:
                let items = sortedSealed
                if items.isEmpty {
                    EmptyTab(text: keptOnly ? "No kept sealed product." : "No sealed product. Buy some online from the hub.")
                }
                ForEach(items) { item in
                    rowButton(item.id, route: .sealed(item.id)) {
                        SealedRow(item: item, market: store.market(of: item))
                    }
                }
            case .raw, .slabs:
                let cards = sortedCards(tab == .raw ? store.data.raw : store.data.slabs)
                if cards.isEmpty {
                    EmptyTab(text: tab == .slabs ? "Graded cards show here. Select raw cards and tap Grade."
                                                 : "Hits from your rips and bought singles show here.")
                }
                ForEach(cards) { card in
                    rowButton(card.id, route: .card(card.id)) { CardRow(card: card) }
                }
            case .bulk:
                let groups = sortedBulk
                if groups.isEmpty {
                    EmptyTab(text: "Each rip adds one bulk group.")
                }
                ForEach(groups) { group in
                    rowButton(group.id, route: .bulk(group.id)) { BulkRow(group: group) }
                }
            }
        }
        .background(Theme.surface)
        .overlay(Rectangle().stroke(Theme.line))
    }

    private func rowButton<Content: View>(_ id: UUID, route: AppRoute, @ViewBuilder content: () -> Content) -> some View {
        Button {
            if selecting {
                if selection.contains(id) { selection.remove(id) } else { selection.insert(id) }
            } else {
                nav.path.append(route)
            }
        } label: {
            HStack(spacing: 10) {
                if selecting {
                    Image(systemName: selection.contains(id) ? "checkmark.circle.fill" : "circle")
                        .font(.title3)
                        .foregroundStyle(selection.contains(id) ? Theme.cyan : Theme.muted)
                }
                content()
            }
            .padding(12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
    }

    private var actionBar: some View {
        let chosen = selection
        let blocked = chosen.contains { store.isKept($0) || store.hasStatus($0) }
        let allKept = !chosen.isEmpty && chosen.allSatisfy { store.isKept($0) }
        return HStack(spacing: 8) {
            switch tab {
            case .sealed:
                Button("Rip") {
                    nav.startRip(store.data.sealed.filter { chosen.contains($0.id) })
                    finishSelecting()
                }
                .buttonStyle(.borderedProminent)
                .foregroundStyle(.black)
                .disabled(chosen.isEmpty || blocked)
                sellButton(chosen, disabled: blocked)
            case .raw:
                sellButton(chosen, disabled: blocked)
                Button("Grade") {
                    gradeIDs = GradeRequest(ids: chosen)
                    finishSelecting()
                }
                .buttonStyle(.bordered)
                .disabled(chosen.isEmpty || blocked)
            case .slabs:
                sellButton(chosen, disabled: blocked)
            case .bulk:
                Button("Add to store run") {}.buttonStyle(.bordered).disabled(true)
            }
            if tab != .bulk {
                Button(allKept ? "Unkeep" : "Keep") {
                    store.setKeep(chosen, !allKept)
                }
                .buttonStyle(.bordered)
                .disabled(chosen.isEmpty)
            }
            Spacer()
            Text("\(chosen.count)")
                .font(.caption.monospaced())
                .foregroundStyle(Theme.muted)
        }
        .controlSize(.large)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Theme.surface)
        .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
    }

    private func sellButton(_ chosen: Set<UUID>, disabled: Bool) -> some View {
        Button("Sell") {
            sellIDs = SellRequest(ids: chosen)
            finishSelecting()
        }
        .buttonStyle(.bordered)
        .disabled(chosen.isEmpty || disabled)
    }

    private func finishSelecting() {
        selecting = false
        selection = []
    }

    // MARK: - Data

    private func count(_ t: InventoryTab) -> Int {
        switch t {
        case .sealed: store.data.sealed.count
        case .raw: store.data.raw.count
        case .slabs: store.data.slabs.count
        case .bulk: store.data.bulk.count
        }
    }

    private var sortedSealed: [SealedItem] {
        let items = store.data.sealed.filter { !keptOnly || $0.keep }
        switch sort {
        case .newest: return items.sorted { $0.acquired > $1.acquired }
        case .value: return items.sorted { store.market(of: $0) > store.market(of: $1) }
        case .setOrder: return items.sorted { $0.name < $1.name }
        }
    }

    private func sortedCards(_ cards: [OwnedCard]) -> [OwnedCard] {
        let items = cards.filter { !keptOnly || $0.keep }
        switch sort {
        case .newest: return items.sorted { $0.acquired > $1.acquired }
        case .value: return items.sorted { $0.market > $1.market }
        case .setOrder: return items.sorted { setOrder($0.print.num) < setOrder($1.print.num) }
        }
    }

    private var sortedBulk: [BulkGroup] {
        switch sort {
        case .value: store.data.bulk.sorted { $0.value > $1.value }
        default: store.data.bulk.sorted { $0.date > $1.date }
        }
    }
}

struct SellRequest: Identifiable {
    let id = UUID()
    let ids: Set<UUID>
}

struct GradeRequest: Identifiable {
    let id = UUID()
    let ids: Set<UUID>
}

// MARK: - Rows and header

struct PortfolioHeader: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 0) {
                StatCell(label: "Market value", value: money(store.marketValue))
                StatCell(label: "Paid", value: money(store.paid))
                StatCell(label: "Unrealized", value: signedMoney(store.net),
                         color: store.net >= 0 ? Theme.green : Theme.orange)
            }
            HStack {
                Text("COLLECTION VALUE (KEPT)")
                    .font(.system(size: 10, weight: .semibold))
                    .kerning(0.8)
                    .foregroundStyle(Theme.muted)
                Spacer()
                Text(money(store.collectionValue))
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
            }
        }
        .padding(12)
        .background(Theme.surface)
        .overlay(Rectangle().stroke(Theme.line))
    }
}

struct Tag: View {
    let text: String
    var color: Color = Theme.cyan

    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .bold, design: .monospaced))
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
    }
}

struct Tags: View {
    let keep: Bool
    let status: ItemStatus?

    var body: some View {
        HStack(spacing: 4) {
            if keep { Tag(text: "KEEP") }
            if let status { Tag(text: status.tag, color: Theme.orange) }
        }
    }
}

struct SealedRow: View {
    let item: SealedItem
    let market: Double

    var body: some View {
        HStack(spacing: 12) {
            ProductImage(url: SetLibrary.product(item.productID, in: item.setSlug)?.image, setName: SetLibrary.set(item.setSlug).name)
                .frame(width: 48, height: 60)
            VStack(alignment: .leading, spacing: 3) {
                Text(item.name).font(.subheadline.weight(.medium)).lineLimit(2)
                Text("\(item.packs) pack\(item.packs == 1 ? "" : "s")")
                    .font(.caption.monospaced())
                    .foregroundStyle(Theme.muted)
                Tags(keep: item.keep, status: item.status)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text(money(market)).font(.subheadline.monospaced().weight(.semibold))
                Text("paid \(money(item.paid))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
            }
        }
    }
}

/// A product photo on a white tile, or the drawn pack when there is no photo.
struct ProductImage: View {
    let url: String?
    let setName: String

    var body: some View {
        if let url, let u = URL(string: url) {
            RemoteCardImage(url: u, name: "")
                .aspectRatio(contentMode: .fit)
                .padding(2)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 3))
        } else {
            PackArt(setName: setName, sheen: 0)
        }
    }
}

struct CardRow: View {
    let card: OwnedCard

    var body: some View {
        HStack(spacing: 12) {
            RemoteCardImage(url: card.print.image.flatMap(URL.init(string:)), name: "")
                .frame(width: 43, height: 60)
                .clipShape(RoundedRectangle(cornerRadius: 3))
            VStack(alignment: .leading, spacing: 3) {
                Text(card.print.name).font(.subheadline.weight(.medium)).lineLimit(1)
                Text(card.grade?.label ?? "\(card.print.rarity) · \(card.print.variant)")
                    .font(.caption.monospaced())
                    .foregroundStyle(card.grade == nil ? Theme.muted : Theme.cyan)
                    .lineLimit(1)
                Tags(keep: card.keep, status: card.status)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text(money(card.market)).font(.subheadline.monospaced().weight(.semibold))
                if let paid = card.paid {
                    let gain = card.market - paid
                    Text(signedMoney(gain)).font(.caption.monospaced())
                        .foregroundStyle(gain >= 0 ? Theme.green : Theme.orange)
                } else {
                    Text("pulled").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
            }
        }
    }
}

struct BulkRow: View {
    let group: BulkGroup

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "square.stack.3d.up.fill")
                .font(.title2)
                .foregroundStyle(Theme.muted)
                .frame(width: 43, height: 60)
            VStack(alignment: .leading, spacing: 3) {
                Text("Bulk · \(SetLibrary.set(group.setSlug).name)").font(.subheadline.weight(.medium))
                Text("\(group.cards.count) cards · rip on day \(group.day + 1)")
                    .font(.caption.monospaced())
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
            Spacer()
            Text(money(group.value)).font(.subheadline.monospaced().weight(.semibold))
        }
    }
}

struct EmptyTab: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(Theme.muted)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 36)
            .padding(.horizontal, 16)
    }
}
