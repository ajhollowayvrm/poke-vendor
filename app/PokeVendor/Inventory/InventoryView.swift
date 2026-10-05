import SwiftUI

enum InventoryTab: String, CaseIterable, Hashable {
    case sealed = "Sealed", raw = "Raw", slabs = "Slabs", bulk = "Bulk"
}

enum SortOrder: String, CaseIterable {
    case psa10 = "PSA 10 price", newest = "Newest", value = "Highest value", setOrder = "Set order", condition = "Best condition"
}

/// An item that shows tags in Inventory: a card or a sealed product.
protocol Tagged {
    var id: UUID { get }
    var keep: Bool { get }
    var status: ItemStatus? { get }
    var fake: FakeTier? { get }
    var isKnownFake: Bool { get }
    var isVerified: Bool { get }
}

extension OwnedCard: Tagged {}
extension SealedItem: Tagged {}

/// The Inventory filter: one tag or one status. Each case matches the tag that the row shows.
enum InventoryFilter: String, CaseIterable, Hashable {
    case all = "All", kept = "Kept", free = "No status"
    case onTheWay = "On the way", arriving = "Arriving", atGrader = "At grader", authenticating = "Authenticating"
    case listed = "Listed", consigned = "Consigned", inStore = "In your store"
    case fake = "Fake", looksOff = "Looks off", verified = "Verified"

    func matches(_ item: some Tagged) -> Bool {
        switch self {
        case .all: return true
        case .kept: return item.keep
        case .free: return item.status == nil
        case .fake: return item.isKnownFake
        case .verified: return !item.isKnownFake && item.isVerified
        case .looksOff:
            guard !item.isKnownFake, !item.isVerified, let fake = item.fake else { return false }
            return Counterfeit.eyeballCatches(fake, id: item.id)
        default: break
        }
        switch item.status {
        case .onTheWay: return self == .onTheWay
        case .arriving: return self == .arriving
        case .atGrader: return self == .atGrader
        case .atAuthenticator: return self == .authenticating
        case .listed: return self == .listed
        case .consigned: return self == .consigned
        case .inStore: return self == .inStore
        case nil: return false
        }
    }
}

/// The order of a card inside its set, from its card number.
func setOrder(_ num: String) -> Int {
    Int(num.split(separator: "/").first ?? "") ?? 0
}

struct InventoryView: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav
    @State private var tab: InventoryTab
    @State private var sort: SortOrder = .psa10
    @State private var filter: InventoryFilter = .all
    @State private var selecting = false
    @State private var selection: Set<UUID> = []
    @State private var sellIDs: SellRequest?
    @State private var gradeIDs: GradeRequest?
    @State private var lotIDs: SellRequest?
    @State private var confirmBulk = false

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
            SellSheet(ids: request.ids, startAll: request.startAll)
        }
        .sheet(item: $gradeIDs) { request in
            GradeSheet(ids: request.ids)
        }
        .sheet(item: $lotIDs) { request in
            LotSheet(ids: request.ids)
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
            if tab != .bulk { filterMenu }
            Spacer()
            if tab == .raw, !selecting {
                // Cards that make no money on TCGplayer after the fees and the shipping.
                let losers = store.unprofitableRaw
                if !losers.isEmpty {
                    Button { confirmBulk = true } label: {
                        Label("Send \(losers.count) to bulk", systemImage: "tray.and.arrow.down").font(.subheadline)
                    }
                    .foregroundStyle(Theme.cyan)
                    .confirmationDialog("Move \(losers.count) card\(losers.count == 1 ? "" : "s") to bulk?", isPresented: $confirmBulk,
                                        titleVisibility: .visible) {
                        Button("Move to bulk") { store.moveToBulk(Set(store.unprofitableRaw.map(\.id))) }
                    } message: {
                        Text("These cards make no money on TCGplayer after the fees and the shipping. Kept cards stay.")
                    }
                }
            }
            Menu {
                Picker("Sort", selection: $sort) {
                    // Only raw cards have a condition to sort by.
                    ForEach(SortOrder.allCases.filter { $0 != .condition || tab == .raw }, id: \.self) { Text($0.rawValue).tag($0) }
                }
            } label: {
                Label(sort.rawValue, systemImage: "arrow.up.arrow.down")
                    .font(.subheadline)
            }
        }
    }

    /// The filters that match an item in this tab. All and the current filter always show.
    private var filterMenu: some View {
        let items: [any Tagged] = switch tab {
        case .sealed: store.data.sealed
        case .raw: store.data.raw
        case .slabs: store.data.slabs
        case .bulk: []
        }
        return Menu {
            Picker("Filter", selection: $filter) {
                ForEach(InventoryFilter.allCases, id: \.self) { f in
                    let n = items.filter { f.matches($0) }.count
                    if f == .all || f == filter || n > 0 { Text("\(f.rawValue) \(n)").tag(f) }
                }
            }
        } label: {
            Label(filter == .all ? "Filter" : filter.rawValue,
                  systemImage: filter == .all ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
                .font(.subheadline)
        }
        .foregroundStyle(filter == .all ? Theme.muted : Theme.cyan)
    }

    @ViewBuilder private var rows: some View {
        VStack(spacing: 0) {
            switch tab {
            case .sealed:
                let items = sortedSealed
                if items.isEmpty {
                    EmptyTab(text: filter != .all ? "No sealed product matches the filter." : "No sealed product. Buy some online from the hub.")
                }
                // Sealed product shows by set, newest set first. The sort order holds inside each set.
                ForEach(SetLibrary.grouped(stacks(items, key: store.stackKey), by: { $0.items[0].setSlug }), id: \.slug) { group in
                    SetGroup(slug: group.slug, count: group.items.reduce(0) { $0 + $1.items.count }, list: "inventory.sealed") {
                        ForEach(group.items) { stack in
                            rowButton(stack.ids, route: .sealed(stack.id)) {
                                SealedRow(item: stack.items[0], market: store.market(of: stack.items[0]), count: stack.items.count,
                                          paid: stack.items.reduce(0) { $0 + $1.paid })
                            }
                        }
                    }
                }
            case .raw, .slabs:
                let cards = sortedCards(tab == .raw ? store.data.raw : store.data.slabs)
                if cards.isEmpty {
                    EmptyTab(text: filter != .all ? "No cards match the filter."
                                 : tab == .slabs ? "Graded cards show here. Select raw cards and tap Grade."
                                                 : "Hits from your rips and bought singles show here.")
                }
                ForEach(stacks(cards, key: store.stackKey)) { stack in
                    rowButton(stack.ids, route: .card(stack.id)) { CardRow(card: stack.items[0], count: stack.items.count) }
                }
            case .bulk:
                let groups = sortedBulk
                if groups.isEmpty {
                    EmptyTab(text: "Each rip adds one bulk group.")
                }
                ForEach(groups) { group in
                    rowButton([group.id], route: .bulk(group.id)) { BulkRow(group: group) }
                }
            }
        }
        .background(Theme.surface)
        .overlay(Rectangle().stroke(Theme.line))
    }

    /// A tap in select mode selects the whole stack.
    private func rowButton<Content: View>(_ ids: Set<UUID>, route: AppRoute, @ViewBuilder content: () -> Content) -> some View {
        let chosen = ids.isSubset(of: selection)
        return Button {
            if selecting {
                if chosen { selection.subtract(ids) } else { selection.formUnion(ids) }
            } else {
                nav.path.append(route)
            }
        } label: {
            HStack(spacing: 10) {
                if selecting {
                    Image(systemName: chosen ? "checkmark.circle.fill" : "circle")
                        .font(.title3)
                        .foregroundStyle(chosen ? Theme.cyan : Theme.muted)
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
        return VStack(spacing: 8) {
            if tab == .raw { quickListRow(chosen, blocked: blocked) }
            actionRow(chosen, blocked: blocked, allKept: allKept)
        }
        .controlSize(.large)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Theme.surface)
        .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
    }

    /// The raw cards that a quick listing can take: not kept, not listed or at a grader, and not a known fake.
    private var listableRaw: [OwnedCard] {
        sortedCards(store.data.raw).filter { !$0.keep && $0.status == nil && !$0.isKnownFake }
    }

    /// Select every listable raw card, and list the selection on TCGplayer at the lowest listing for its condition.
    private func quickListRow(_ chosen: Set<UUID>, blocked: Bool) -> some View {
        let listable = Set(listableRaw.map(\.id))
        let allChosen = !listable.isEmpty && listable == chosen
        return HStack(spacing: 8) {
            Button(allChosen ? "Clear" : "Select all \(listable.count)") {
                selection = allChosen ? [] : listable
            }
            .buttonStyle(.bordered)
            .disabled(listable.isEmpty)
            Button("List \(chosen.count) on TCGplayer") {
                let cards = store.data.raw.filter { chosen.contains($0.id) }
                let prices = Dictionary(uniqueKeysWithValues: cards.map { ($0.id, GameStore.tcgLowest(for: $0.print, wear: $0.condition.wear)) })
                let wears = Dictionary(uniqueKeysWithValues: cards.map { ($0.id, $0.condition.wear) })
                store.list(chosen, channel: .tcgplayer, price: { prices[$0] ?? 0.05 }, auctionDays: nil, insured: false,
                           wear: { wears[$0] })
                finishSelecting()
            }
            .buttonStyle(.borderedProminent)
            .foregroundStyle(.black)
            .frame(maxWidth: .infinity)
            .disabled(chosen.isEmpty || blocked || chosen.contains { id in store.data.raw.contains { $0.id == id && $0.isKnownFake } })
        }
    }

    private func actionRow(_ chosen: Set<UUID>, blocked: Bool, allKept: Bool) -> some View {
        HStack(spacing: 8) {
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
                lotButton(chosen, disabled: blocked)
            case .raw:
                sellButton(chosen, disabled: blocked)
                lotButton(chosen, disabled: blocked)
                Button("Grade") {
                    gradeIDs = GradeRequest(ids: chosen)
                    finishSelecting()
                }
                .buttonStyle(.bordered)
                .disabled(chosen.isEmpty || blocked)
                Button("Bulk") {
                    store.moveToBulk(chosen)
                    finishSelecting()
                }
                .buttonStyle(.bordered)
                .disabled(chosen.isEmpty || blocked)
            case .slabs:
                sellButton(chosen, disabled: blocked)
                lotButton(chosen, disabled: blocked)
            case .bulk:
                Text("Sell bulk at a game shop stop.").font(.caption).foregroundStyle(Theme.muted)
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
    }

    private func sellButton(_ chosen: Set<UUID>, disabled: Bool) -> some View {
        Button("Sell") {
            sellIDs = SellRequest(ids: chosen)
            finishSelecting()
        }
        .buttonStyle(.bordered)
        .disabled(chosen.isEmpty || disabled)
    }

    private func lotButton(_ chosen: Set<UUID>, disabled: Bool) -> some View {
        Button("Lot") {
            lotIDs = SellRequest(ids: chosen)
            finishSelecting()
        }
        .buttonStyle(.bordered)
        .disabled(chosen.count < Balance.lotMinItems || disabled)
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
        let items = store.data.sealed.filter { filter.matches($0) }
        switch sort {
        case .newest, .condition: return items.sorted { $0.acquired > $1.acquired }
        // Sealed product has no PSA 10 price, so it sorts by value.
        case .value, .psa10: return items.sorted { store.market(of: $0) > store.market(of: $1) }
        case .setOrder: return items.sorted { $0.name < $1.name }
        }
    }

    private func sortedCards(_ cards: [OwnedCard]) -> [OwnedCard] {
        let items = cards.filter { filter.matches($0) }
        switch sort {
        case .newest: return items.sorted { $0.acquired > $1.acquired }
        case .value: return items.sorted { $0.market > $1.market }
        // A card with no PSA 10 price goes last. Value breaks a tie.
        case .psa10: return items.sorted {
            let a = $0.print.gradedPrice("psa10") ?? -1, b = $1.print.gradedPrice("psa10") ?? -1
            return a != b ? a > b : $0.market > $1.market
        }
        case .setOrder: return items.sorted { setOrder($0.print.num) < setOrder($1.print.num) }
        // A slab's condition is its grade, so slabs sort by value.
        case .condition: return tab == .raw ? items.sorted(by: store.conditionOrder) : items.sorted { $0.market > $1.market }
        }
    }

    private var sortedBulk: [BulkGroup] {
        switch sort {
        case .value, .psa10: store.data.bulk.sorted { $0.value > $1.value }
        default: store.data.bulk.sorted { $0.date > $1.date }
        }
    }
}

struct ItemStack<T: Identifiable>: Identifiable where T.ID == UUID {
    let items: [T]
    var id: UUID { items[0].id }
    var ids: Set<UUID> { Set(items.map(\.id)) }
}

/// Groups identical items, in the order of their first appearance.
func stacks<T: Identifiable>(_ items: [T], key: (T) -> String) -> [ItemStack<T>] where T.ID == UUID {
    var order: [String] = []
    var groups: [String: [T]] = [:]
    for item in items {
        let k = key(item)
        if groups[k] == nil { order.append(k) }
        groups[k, default: []].append(item)
    }
    return order.map { ItemStack(items: groups[$0]!) }
}

struct CountBadge: View {
    let count: Int

    var body: some View {
        if count > 1 {
            Text("×\(count)")
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Theme.cyan)
                .foregroundStyle(.black)
        }
    }
}

struct SellRequest: Identifiable {
    let id = UUID()
    let ids: Set<UUID>
    var startAll = true
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
    /// The item's hidden fake tier, and what the player knows (docs/14-counterfeit-risk.md).
    var fake: FakeTier?
    var fakeKnown = false
    var verified = false
    var id: UUID?

    var body: some View {
        HStack(spacing: 4) {
            if keep { Tag(text: "KEEP") }
            if let status { Tag(text: status.tag, color: Theme.orange) }
            if fakeKnown {
                Tag(text: "FAKE", color: .red)
            } else if verified {
                Tag(text: "VERIFIED", color: Theme.green)
            } else if let fake, let id, Counterfeit.eyeballCatches(fake, id: id) {
                Tag(text: "LOOKS OFF", color: Theme.orange)
            }
        }
    }
}

struct SealedRow: View {
    let item: SealedItem
    let market: Double
    var count = 1
    var paid: Double?

    var body: some View {
        HStack(spacing: 12) {
            ProductImage(url: SetLibrary.product(item.productID, in: item.setSlug)?.image, setName: SetLibrary.set(item.setSlug).name)
                .frame(width: 48, height: 60)
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .top, spacing: 6) {
                    Text(item.name).font(.subheadline.weight(.medium)).lineLimit(2)
                    CountBadge(count: count)
                }
                Text(count > 1 ? "\(money(market)) each" : "\(item.packs) pack\(item.packs == 1 ? "" : "s")")
                    .font(.caption.monospaced())
                    .foregroundStyle(Theme.muted)
                Tags(keep: item.keep, status: item.status, fake: item.fake, fakeKnown: item.isKnownFake, verified: item.isVerified, id: item.id)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text(money(market * Double(count))).font(.subheadline.monospaced().weight(.semibold))
                Text("paid \(money(paid ?? item.paid))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
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
            RemoteCardImage(url: u, name: "", upright: false)
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
    var count = 1

    var body: some View {
        HStack(spacing: 12) {
            CardOrSlab(image: card.print.image, name: card.print.name, grade: card.grade, subgrades: card.slabSubgrades, certID: card.id)
                .frame(width: 43, height: 60)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(card.print.name).font(.subheadline.weight(.medium)).lineLimit(1)
                    CountBadge(count: count)
                }
                Text(card.grade?.label ?? "\(card.print.rarity) · \(card.print.variant)")
                    .font(.caption.monospaced())
                    .foregroundStyle(card.grade == nil ? Theme.muted : Theme.cyan)
                    .lineLimit(1)
                if card.grade == nil {
                    RawLooks(condition: card.condition)
                    GradedValueLine(print: card.print)
                }
                Tags(keep: card.keep, status: card.status, fake: card.fake, fakeKnown: card.isKnownFake, verified: card.isVerified, id: card.id)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text(money(card.market * Double(count))).font(.subheadline.monospaced().weight(.semibold))
                if count > 1 {
                    Text("\(money(card.market)) each").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                } else if let paid = card.paid {
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

/// The PSA 9 and PSA 10 prices of a raw card: what it can be worth after grading.
struct GradedValueLine: View {
    let print: CardPrint

    private func value(_ key: String) -> String {
        "\(print.gradedPrice(key).map(money) ?? "—")\(print.isGradedEstimated(key) ? " est." : "")"
    }

    var body: some View {
        HStack(spacing: 4) {
            Text("PSA 9 \(value("psa9")) ·").foregroundStyle(Theme.muted)
            Text("10 \(value("psa10"))").foregroundStyle(Theme.cyan)
        }
        .font(.caption.monospaced())
        .lineLimit(1)
        .minimumScaleFactor(0.8)
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
                Text("\(group.cards.count) card\(group.cards.count == 1 ? "" : "s") · \(group.moved ? "moved" : "rip") on day \(group.day + 1)")
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

/// The condition and the front cut of a raw card, as the player can read them, on one line.
struct RawLooks: View {
    @Environment(GameStore.self) private var store
    let condition: Condition

    var body: some View {
        HStack(spacing: 6) {
            WearText(wear: condition.wear)
            Text("·").font(.caption).foregroundStyle(Theme.muted)
            CutLine(reading: .front(condition.cut, tool: store.data.centeringTool))
        }
        .lineLimit(1)
    }
}
