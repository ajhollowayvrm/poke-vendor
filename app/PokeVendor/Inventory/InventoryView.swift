import SwiftUI

enum InventoryTab: String, CaseIterable {
    case sealed = "Sealed", raw = "Raw", slabs = "Slabs", bulk = "Bulk"
}

enum SortOrder: String, CaseIterable {
    case newest = "Newest", value = "Highest value", setOrder = "Set order"
}

enum InventoryRoute: Hashable {
    case card(UUID), sealed(UUID), bulk(UUID)
}

struct RipSession: Identifiable {
    let id = UUID()
    let packs: [SealedItem]
}

/// The order of a card inside its set, from its card number.
func setOrder(_ num: String) -> Int {
    Int(num.split(separator: "/").first ?? "") ?? 0
}

struct InventoryView: View {
    @Environment(InventoryStore.self) private var store
    @State private var tab: InventoryTab = .sealed
    @State private var sort: SortOrder = .newest
    @State private var keptOnly = false
    @State private var selecting = false
    @State private var selection: Set<UUID> = []
    @State private var rip: RipSession?
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
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
            .toolbarBackground(Theme.background, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { testMenu }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(selecting ? "Done" : "Select") {
                        selecting.toggle()
                        selection = []
                    }
                    .tint(Theme.cyan)
                }
            }
            .navigationDestination(for: InventoryRoute.self) { route in
                switch route {
                case .card(let id): CardDetailView(id: id)
                case .sealed(let id): SealedDetailView(id: id) { item in startRip([item]) }
                case .bulk(let id): BulkDetailView(id: id)
                }
            }
        }
        .tint(Theme.cyan)
        .onChange(of: tab) { _, _ in selection = [] }
        .fullScreenCover(item: $rip) { session in
            RipView(packs: session.packs, store: store) { rip = nil }
        }
        .onAppear {
            #if DEBUG
            let args = ProcessInfo.processInfo.arguments
            if let i = args.firstIndex(of: "-tab"), i + 1 < args.count, let t = InventoryTab(rawValue: args[i + 1]) {
                tab = t
            }
            if args.contains("-demo") {
                if store.data.sealed.count < 3 { store.addTestPacks(3) }
                startRip(Array(store.data.sealed.prefix(1)))
            }
            #endif
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
                    EmptyTab(text: keptOnly ? "No kept sealed product." : "No sealed product. Add a test pack to rip.",
                             action: keptOnly ? nil : ("Add a test pack", { store.addTestPacks(1) }))
                }
                ForEach(items) { item in
                    rowButton(item.id, route: .sealed(item.id)) {
                        SealedRow(item: item, market: store.market(of: item))
                    }
                }
            case .raw, .slabs:
                let cards = sortedCards(tab == .raw ? store.data.raw : store.data.slabs)
                if cards.isEmpty {
                    EmptyTab(text: tab == .slabs ? "Graded cards show here. Grading is not built yet."
                                                 : "Hits from your rips show here.", action: nil)
                }
                ForEach(cards) { card in
                    rowButton(card.id, route: .card(card.id)) { CardRow(card: card) }
                }
            case .bulk:
                let groups = sortedBulk
                if groups.isEmpty {
                    EmptyTab(text: "Each rip adds one bulk group.", action: nil)
                }
                ForEach(groups) { group in
                    rowButton(group.id, route: .bulk(group.id)) { BulkRow(group: group) }
                }
            }
        }
        .background(Theme.surface)
        .overlay(Rectangle().stroke(Theme.line))
    }

    private func rowButton<Content: View>(_ id: UUID, route: InventoryRoute,
                                          @ViewBuilder content: () -> Content) -> some View {
        Button {
            if selecting {
                if selection.contains(id) { selection.remove(id) } else { selection.insert(id) }
            } else {
                path.append(route)
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
        let anyKept = chosen.contains { store.isKept($0) }
        let allKept = !chosen.isEmpty && chosen.allSatisfy { store.isKept($0) }
        return HStack(spacing: 10) {
            switch tab {
            case .sealed:
                Button("Rip \(chosen.count)") {
                    startRip(store.data.sealed.filter { chosen.contains($0.id) })
                }
                .buttonStyle(.borderedProminent)
                .foregroundStyle(.black)
                .disabled(chosen.isEmpty || anyKept)
            case .raw:
                Button("Sell") {}.buttonStyle(.bordered).disabled(true)
                Button("Grade") {}.buttonStyle(.bordered).disabled(true)
            case .slabs:
                Button("Sell") {}.buttonStyle(.bordered).disabled(true)
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
            Text("\(chosen.count) selected")
                .font(.caption.monospaced())
                .foregroundStyle(Theme.muted)
        }
        .controlSize(.large)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Theme.surface)
        .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
    }

    private var testMenu: some View {
        Menu {
            Button("Add 1 Prismatic pack") { store.addTestPacks(1) }
            Button("Add 5 Prismatic packs") { store.addTestPacks(5) }
            Button("Reset Inventory", role: .destructive) { store.reset() }
        } label: {
            Label("Test", systemImage: "hammer")
        }
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
        case .setOrder: return items.sorted { $0.setSlug < $1.setSlug }
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

    private func startRip(_ packs: [SealedItem]) {
        guard !packs.isEmpty else { return }
        selecting = false
        selection = []
        if !path.isEmpty { path.removeLast(path.count) }
        rip = RipSession(packs: packs)
    }
}

// MARK: - Rows and header

struct PortfolioHeader: View {
    @Environment(InventoryStore.self) private var store

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

    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .bold, design: .monospaced))
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(Theme.cyan.opacity(0.15))
            .foregroundStyle(Theme.cyan)
    }
}

struct SealedRow: View {
    let item: SealedItem
    let market: Double

    var body: some View {
        HStack(spacing: 12) {
            PackArt(setName: SetLibrary.set(item.setSlug).name, sheen: 0)
                .frame(width: 36, height: 60)
            VStack(alignment: .leading, spacing: 3) {
                Text(item.name).font(.subheadline.weight(.medium)).lineLimit(2)
                HStack(spacing: 6) {
                    Text("\(item.packs) pack\(item.packs == 1 ? "" : "s")")
                        .font(.caption.monospaced())
                        .foregroundStyle(Theme.muted)
                    if item.keep { Tag(text: "KEEP") }
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text(money(market)).font(.subheadline.monospaced().weight(.semibold))
                Text("paid \(money(item.paid))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
            }
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
                Text("\(card.print.rarity) · \(card.print.variant)")
                    .font(.caption.monospaced())
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
                if card.keep { Tag(text: "KEEP") }
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
                Text("\(group.cards.count) cards · rip on \(group.date.formatted(date: .abbreviated, time: .shortened))")
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
    let action: (String, () -> Void)?

    var body: some View {
        VStack(spacing: 12) {
            Text(text)
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
            if let action {
                Button(action.0, action: action.1)
                    .buttonStyle(.borderedProminent)
                    .foregroundStyle(.black)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 36)
    }
}
