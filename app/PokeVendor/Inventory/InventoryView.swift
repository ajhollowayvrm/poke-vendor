import SwiftUI

enum InventoryTab: String, CaseIterable, Hashable {
    case sealed = "Sealed", raw = "Raw", slabs = "Slabs", bulk = "Bulk", grading = "At Grading"

    /// The tab picker label. "At Grading" is too wide for a segment.
    var label: String { self == .grading ? "Grading" : rawValue }
}

/// The three parts of Inventory. The PC and the master sets hold items that are out of the regular tabs
/// (docs/08-ui-direction.md, The PC and Master sets).
enum InventorySection: String, CaseIterable, Hashable {
    case stock = "Inventory", pc = "PC", masterSets = "Master sets", showcase = "Showcase"
}

extension OwnedCard {
    /// A raw card at a grader shows in the At Grading tab, not in Raw.
    var isAtGrader: Bool {
        switch status {
        case .atGrader, .heldAtGrader: true
        default: false
        }
    }
}

/// The two inventories: the player's own items, and the store's stock (docs/42-two-inventories.md).
enum InventoryOwner: String, CaseIterable, Hashable {
    case personal = "Personal", store = "Store"
}

enum SortOrder: String, CaseIterable {
    case psa10 = "PSA 10 price", newest = "Newest", value = "Highest value", setOrder = "Set order", condition = "Best condition"
}

/// An item that shows tags in Inventory: a card or a sealed product.
protocol Tagged {
    var id: UUID { get }
    var pc: Bool { get }
    var status: ItemStatus? { get }
    var fake: FakeTier? { get }
    var isKnownFake: Bool { get }
    var isVerified: Bool { get }
}

extension OwnedCard: Tagged {}
extension SealedItem: Tagged {}

/// The Inventory filter: one tag or one status. Each case matches the tag that the row shows.
enum InventoryFilter: String, CaseIterable, Hashable {
    case all = "All", free = "No status"
    case onTheWay = "On the way", arriving = "Arriving", atGrader = "At grader", authenticating = "Authenticating"
    case listed = "Listed", consigned = "Consigned", inStore = "In your store", atAuction = "At auction"
    case soldToViewer = "Sold to a viewer"
    case openedAtShop = "Opened · rip it"
    case inStorage = "In storage"
    case inPsaBox = "In your PSA box"
    case fake = "Fake", looksOff = "Looks off", verified = "Verified"

    func matches(_ item: some Tagged) -> Bool {
        switch self {
        case .all: return true
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
        case .atGrader, .heldAtGrader: return self == .atGrader
        case .atAuthenticator: return self == .authenticating
        case .listed: return self == .listed
        case .consigned: return self == .consigned
        case .inStore: return self == .inStore
        case .atAuctionHouse: return self == .atAuction
        case .soldToViewer: return self == .soldToViewer
        case .openedAtShop: return self == .openedAtShop
        case .inStorage: return self == .inStorage
        case .inPsaBox: return self == .inPsaBox
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
    @State private var section: InventorySection = .stock
    @AppStorage("inventoryOwner") private var owner: InventoryOwner = .personal
    @State private var tab: InventoryTab
    @State private var sort: SortOrder = .psa10
    @State private var filter: InventoryFilter = .all
    @State private var selecting = false
    @State private var selection: Set<UUID> = []
    @State private var sellIDs: SellRequest?
    @State private var gradeIDs: GradeRequest?
    @State private var lotIDs: SellRequest?
    @State private var confirmBulk = false
    @State private var caseRequest: CaseRequest?
    @State private var confirmOpenAll = false

    init(startTab: InventoryTab = .sealed) {
        _tab = State(initialValue: startTab)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                PortfolioHeader()
                // The home space and the storage unit (Model/Storage.swift).
                let space = store.storageSummary
                Button { nav.path.append(.storage) } label: {
                    ChevronRow(icon: "shippingbox", title: "Storage", detail: space.text, accent: space.over)
                        .padding(12)
                }
                .buttonStyle(.plain)
                .background(Theme.surface)
                .framed()
                Picker("Section", selection: $section) {
                    ForEach(InventorySection.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                switch section {
                case .stock:
                    // Personal or the store's stock (docs/42-two-inventories.md).
                    if store.cardStore != nil {
                        Picker("Owner", selection: $owner) {
                            ForEach(InventoryOwner.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }
                        .pickerStyle(.segmented)
                    }
                    tabPicker
                    controls
                    if (tab == .raw || tab == .grading), !showsStore, !store.psaBox.isEmpty {
                        PsaBoxBanner { gradeIDs = GradeRequest(ids: Set(store.psaBox.map(\.id))) }
                    }
                    if tab == .grading, !store.gradingBills.isEmpty { GradingBillsBox() }
                    rows
                case .pc:
                    PCSection(selecting: selecting, selection: $selection)
                case .masterSets:
                    MasterSetsSection()
                case .showcase:
                    ShowcaseSection()
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(Theme.background.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) {
            if selecting {
                switch section {
                case .stock: actionBar
                case .pc: pcActionBar
                case .masterSets, .showcase: EmptyView()
                }
            }
        }
        .navigationTitle("Inventory")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if section == .stock || section == .pc {
                    Button(selecting ? "Done" : "Select") {
                        selecting.toggle()
                        selection = []
                    }
                }
            }
        }
        .onChange(of: tab) { _, _ in selection = [] }
        .onChange(of: owner) { _, _ in
            selection = []
            if showsStore, ![.sealed, .raw, .slabs].contains(tab) { tab = .sealed }
        }
        #if DEBUG
        // Screenshot aid: `-gradesheet` opens the grade sheet with the 3 most valuable free raw cards.
        .onAppear {
            guard ProcessInfo.processInfo.arguments.contains("-gradesheet"), gradeIDs == nil else { return }
            // `-highcard` adds the Skyridge Charizard first, so the sheet shows an upcharge.
            if ProcessInfo.processInfo.arguments.contains("-highcard"),
               let charizard = SetLibrary.set("skyridge").prints.first(where: { $0.num == "146/144" && $0.variant == "Holo" }) {
                store.addTestCard(charizard, slug: "skyridge")
            }
            let top = rawInHand.filter { $0.status == nil }.sorted { $0.market > $1.market }.prefix(3)
            if !top.isEmpty { gradeIDs = GradeRequest(ids: Set(top.map(\.id))) }
        }
        // Screenshot aid: `-mastersets` opens the Master sets section.
        .onAppear {
            if ProcessInfo.processInfo.arguments.contains("-mastersets") { section = .masterSets }
        }
        // Screenshot aid: `-select` opens select mode with the first free stack of the tab selected.
        .onAppear {
            guard ProcessInfo.processInfo.arguments.contains("-select"), !selecting else { return }
            selecting = true
            let first: [UUID] = switch tab {
            case .sealed: sortedSealed.first { $0.status == nil }.map { store.mates(of: $0).map(\.id) } ?? []
            case .raw: sortedCards(rawInHand).first { $0.status == nil }.map { store.mates(of: $0).map(\.id) } ?? []
            case .slabs: sortedCards(slabsInHand).first { $0.status == nil }.map { store.mates(of: $0).map(\.id) } ?? []
            case .bulk, .grading: []
            }
            selection = Set(first)
        }
        #endif
        .onChange(of: section) { _, _ in finishSelecting() }
        .sheet(item: $sellIDs) { request in
            SellSheet(ids: request.ids, startAll: request.startAll, startChannel: request.channel)
        }
        .sheet(item: $gradeIDs) { request in
            GradeSheet(ids: request.ids)
        }
        .sheet(item: $lotIDs) { request in
            LotSheet(ids: request.ids)
        }
        .sheet(item: $caseRequest) { CaseOpenSheet(source: $0.source, onDone: { _ in }) }
    }

    /// Opens every case with one save, then shows one summary.
    private func openAll(_ ids: [UUID]) {
        var units: [UUID] = []
        for id in ids { units += store.openCase(id, save: false) }
        store.save()
        caseRequest = CaseRequest(source: .opened(units: units, title: "\(ids.count) cases opened"))
    }

    // MARK: - Pieces

    private var tabPicker: some View {
        Picker("Tab", selection: $tab) {
            // The store has no bulk and nothing at a grader.
            ForEach(InventoryTab.allCases.filter { showsStore ? [.sealed, .raw, .slabs].contains($0) : true }, id: \.self) { t in
                Text("\(t.label) \(count(t))").tag(t)
            }
        }
        .pickerStyle(.segmented)
    }

    private var controls: some View {
        HStack {
            if tab != .bulk && tab != .grading { filterMenu }
            Spacer()
            if tab == .sealed, !selecting {
                // The player holds 2 or more closed cases: open them in one step, with one summary.
                let cases = store.data.sealed.filter { $0.isCase && !$0.pc && $0.status == nil && $0.onlineListing == nil }
                let premium = cases.reduce(0) { $0 + store.casePremium($1) }
                if cases.count >= 2 {
                    Button {
                        if premium > Balance.caseOpenConfirmPremium { confirmOpenAll = true } else { openAll(cases.map(\.id)) }
                    } label: {
                        Label("Open all cases", systemImage: "shippingbox").font(.subheadline)
                    }
                    .foregroundStyle(Theme.cyan)
                    .confirmationDialog("Opening loses \(money(premium)) of case premium. You cannot close the cases again.",
                                        isPresented: $confirmOpenAll, titleVisibility: .visible) {
                        Button("Open all cases", role: .destructive) { openAll(cases.map(\.id)) }
                    }
                }
            }
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
                        Text("These cards make no money on TCGplayer after the fees and the shipping.")
                    }
                }
            }
            Menu {
                Picker("Sort", selection: $sort) {
                    // Only raw cards have a condition to sort by.
                    ForEach(SortOrder.allCases.filter { $0 != .condition || tab == .raw || tab == .grading }, id: \.self) { Text($0.rawValue).tag($0) }
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
        case .sealed: sealedInHand
        case .raw: rawInHand
        case .slabs: slabsInHand
        case .bulk, .grading: []
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
                let groups = SetLibrary.grouped(stacks(items, key: store.stackKey), by: { $0.items[0].setSlug })
                FoldAllButton(list: "inventory.sealed", keys: groups.map { FoldKey.set($0.slug) })
                ForEach(groups, id: \.slug) { group in
                    SetGroup(slug: group.slug, count: group.items.reduce(0) { $0 + $1.items.count }, list: "inventory.sealed") {
                        ForEach(group.items) { stack in
                            rowButton(stack.ids, route: .sealed(stack.id)) {
                                SealedRow(item: stack.items[0], market: store.market(of: stack.items[0]), count: stack.items.count,
                                          paid: stack.items.reduce(0) { $0 + $1.paid })
                            }
                            .contextMenu {
                                if stack.items[0].isCase, stack.items[0].status == nil, stack.items[0].onlineListing == nil {
                                    Button("Open the case", systemImage: "shippingbox") {
                                        caseRequest = CaseRequest(source: .closed(stack.items[0].id))
                                    }
                                }
                            }
                        }
                    }
                }
            case .grading:
                let cards = sortedCards(atGrading)
                if cards.isEmpty {
                    EmptyTab(text: "Cards you send to a grader show here until they come back as slabs.")
                }
                ForEach(stacks(cards, key: store.stackKey)) { stack in
                    rowButton(stack.ids, route: .card(stack.id)) { CardRow(card: stack.items[0], count: stack.items.count) }
                }
            case .raw, .slabs:
                let cards = sortedCards(tab == .raw ? rawInHand : slabsInHand)
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
        .framed()
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
        let blocked = chosen.contains { store.hasStatus($0) }
        return VStack(alignment: .leading, spacing: 10) {
            // The Personal raw tab lists on TCGplayer. Every other tab, and the Store side, gets Select all.
            if tab == .raw && !showsStore {
                quickListRow(chosen, blocked: blocked)
            } else if [.sealed, .raw, .slabs].contains(tab) {
                selectAllRow(chosen)
            }
            if !listedInTab.isEmpty { unlistRow(chosen) }
            switch tab {
            case .sealed, .raw, .slabs:
                Text("\(chosen.count) selected")
                    .font(.caption.monospaced())
                    .foregroundStyle(Theme.muted)
                ItemActions(kind: tab == .sealed ? .sealed : tab == .raw ? .raw : .slab, ids: chosen,
                            present: present, done: finishSelecting)
            case .bulk:
                Text("Sell bulk at a game shop stop.").font(.caption).foregroundStyle(Theme.muted)
            case .grading:
                Text("These cards come back as slabs when the grades are done and paid.").font(.caption).foregroundStyle(Theme.muted)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Theme.background)
        .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
    }

    private func present(_ sheet: ItemSheet) {
        switch sheet {
        case .sell(let ids): sellIDs = SellRequest(ids: ids)
        case .lot(let ids): lotIDs = SellRequest(ids: ids)
        case .grade(let ids): gradeIDs = GradeRequest(ids: ids)
        }
    }

    /// The raw cards that a quick listing can take: on the side that shows, not listed or at a grader, and not a known fake.
    private var listableRaw: [OwnedCard] {
        sortedCards(rawInHand).filter { $0.status == nil && $0.fromStore != true && !$0.isKnownFake }
    }

    /// Select every listable raw card, and list the selection on TCGplayer at the lowest listing for its condition.
    private func quickListRow(_ chosen: Set<UUID>, blocked: Bool) -> some View {
        let listable = Set(listableRaw.map(\.id))
        let allChosen = !listable.isEmpty && listable == chosen
        return HStack(spacing: 8) {
            Button {
                selection = allChosen ? [] : listable
            } label: { wideLabel(allChosen ? "Clear" : "Select all \(listable.count)") }
            .buttonStyle(.bordered)
            .disabled(listable.isEmpty)
            // The sell sheet opens on TCGplayer at the lowest listing. The player can set a price for each card.
            Button {
                sellIDs = SellRequest(ids: chosen, channel: .tcgplayer)
                finishSelecting()
            } label: { wideLabel("List \(chosen.count) on TCGplayer") }
            .primaryButton()
            .disabled(chosen.isEmpty || blocked || chosen.contains { id in store.data.raw.contains { $0.id == id && $0.isKnownFake } })
        }
    }

    /// Every item that the tab shows, with the filter. Store stock that is out at a show or a meet stays out: it is not on
    /// the shelf, so it cannot move.
    private var shownInTab: Set<UUID> {
        let ids: [UUID] = switch tab {
        case .sealed: sortedSealed.filter { $0.fromStore != true }.map(\.id)
        case .raw: sortedCards(rawInHand).filter { $0.fromStore != true }.map(\.id)
        case .slabs: sortedCards(slabsInHand).filter { $0.fromStore != true }.map(\.id)
        case .bulk, .grading: []
        }
        return Set(ids)
    }

    /// Select every item that the tab shows, or clear the selection.
    private func selectAllRow(_ chosen: Set<UUID>) -> some View {
        let shown = shownInTab
        let allChosen = !shown.isEmpty && shown == chosen
        return Button {
            selection = allChosen ? [] : shown
        } label: { wideLabel(allChosen ? "Clear" : "Select all \(shown.count)") }
        .buttonStyle(.bordered)
        .disabled(shown.isEmpty)
    }

    /// The items in this tab with a listing that can come down (not a running eBay auction).
    private var listedInTab: Set<UUID> {
        let ids: [UUID] = switch tab {
        case .sealed: sealedInHand.filter { $0.status?.isRemovableListing == true }.map(\.id)
        case .raw: rawInHand.filter { $0.status?.isRemovableListing == true }.map(\.id)
        case .slabs: slabsInHand.filter { $0.status?.isRemovableListing == true }.map(\.id)
        case .bulk, .grading: []
        }
        return Set(ids)
    }

    /// Select every listed item in the tab, and take the selected listings down.
    private func unlistRow(_ chosen: Set<UUID>) -> some View {
        let listed = listedInTab
        let allChosen = listed == chosen
        let removable = chosen.filter { store.canRemoveListing($0) }
        return HStack(spacing: 8) {
            Button {
                selection = allChosen ? [] : listed
            } label: { wideLabel(allChosen ? "Clear" : "Select listed \(listed.count)") }
            .buttonStyle(.bordered)
            Button {
                store.removeListings(removable)
                finishSelecting()
            } label: { wideLabel("Unlist \(removable.count)") }
            .buttonStyle(.bordered)
            .tint(Theme.orange)
            .disabled(removable.isEmpty)
        }
    }

    /// A button label that fills its half of a row and stays on one line.
    private func wideLabel(_ title: String) -> some View {
        Text(title).lineLimit(1).minimumScaleFactor(0.8).frame(maxWidth: .infinity)
    }

    /// The PC action: move the selection back to the regular Inventory.
    private var pcActionBar: some View {
        HStack(spacing: 8) {
            Button("Back to Inventory") {
                store.setPC(selection, false)
                finishSelecting()
            }
            .primaryButton()
            .disabled(selection.isEmpty)
            Spacer()
            Text("\(selection.count)").font(.caption.monospaced()).foregroundStyle(Theme.muted)
        }
        .controlSize(.large)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Theme.surface)
        .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
    }

    private func finishSelecting() {
        selecting = false
        selection = []
    }

    // MARK: - Data

    private func count(_ t: InventoryTab) -> Int {
        switch t {
        case .sealed: sealedInHand.count
        case .raw: rawInHand.count
        case .slabs: slabsInHand.count
        case .bulk: store.data.bulk.filter { $0.shipOrder == nil }.count
        case .grading: atGrading.count
        }
    }

    /// The regular tabs leave out the PC and the master sets.
    /// True when the Store side shows. Without a store, everything is personal.
    private var showsStore: Bool { owner == .store && store.cardStore != nil }

    private var sealedInHand: [SealedItem] {
        let side = showsStore
        return store.data.sealed.filter { !$0.setAside && store.onStoreSide($0.status, fromStore: $0.fromStore) == side }
    }
    /// The raw cards that are not at a grader.
    private var rawInHand: [OwnedCard] {
        let side = showsStore
        return store.data.raw.filter { !$0.isAtGrader && !$0.setAside && store.onStoreSide($0.status, fromStore: $0.fromStore) == side }
    }
    /// A slab that PSA holds shows in the Grading tab until its bill is paid.
    private var slabsInHand: [OwnedCard] {
        let side = showsStore
        return store.data.slabs.filter { !$0.setAside && !$0.isAtGrader && store.onStoreSide($0.status, fromStore: $0.fromStore) == side }
    }

    private var atGrading: [OwnedCard] { (store.data.raw + store.data.slabs).filter(\.isAtGrader) }

    private var sortedSealed: [SealedItem] {
        let items = sealedInHand.filter { filter.matches($0) }
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
        case .condition: return tab == .raw || tab == .grading ? items.sorted(by: store.conditionOrder) : items.sorted { $0.market > $1.market }
        }
    }

    private var sortedBulk: [BulkGroup] {
        switch sort {
        case .value, .psa10: store.data.bulk.filter { $0.shipOrder == nil }.sorted { $0.value > $1.value }
        default: store.data.bulk.filter { $0.shipOrder == nil }.sorted { $0.date > $1.date }
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
    /// The channel the sheet starts on. Nil: TCGplayer when every item is raw, or eBay.
    var channel: Listing.Channel?
}

struct GradeRequest: Identifiable {
    let id = UUID()
    let ids: Set<UUID>
}

/// A sheet that an item action opens. The screen that shows the actions owns the sheet.
enum ItemSheet {
    case sell(Set<UUID>)
    case lot(Set<UUID>)
    case grade(Set<UUID>)
}

/// The actions on Inventory items. Select mode and the detail screens show the same grid, so an item has the same
/// actions in both places. `extra` adds the tiles that only a detail screen has.
struct ItemActions<Extra: View>: View {
    enum Kind { case sealed, raw, slab }

    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav
    let kind: Kind
    /// The items that Rip, Hits only, Grade, Bulk, Master set, Challenge, and PC act on.
    let ids: Set<UUID>
    /// The stack on a detail screen. Sell and Lot act on it. A sealed stack also gets "Rip all" and "Hits all".
    /// Select mode leaves it out, and it is then the same as `ids`.
    let stackIDs: Set<UUID>
    let present: (ItemSheet) -> Void
    /// Runs after each action. Select mode ends the selection here.
    let done: () -> Void
    let extra: Extra
    @State private var confirmCrack = false
    @State private var confirmBreak = false
    @State private var confirmBreakAll = false

    init(kind: Kind, ids: Set<UUID>, stackIDs: Set<UUID>? = nil, present: @escaping (ItemSheet) -> Void,
         done: @escaping () -> Void = {}, @ViewBuilder extra: () -> Extra) {
        self.kind = kind
        self.ids = ids
        self.stackIDs = stackIDs ?? ids
        self.present = present
        self.done = done
        self.extra = extra()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            tiles
            // "To store" places only what fits. Say so when the cases or shelves are short of room.
            if let note = storeRoomNote {
                Text(note).font(.caption).foregroundStyle(Theme.orange)
            }
        }
    }

    /// The selected items that fit in the store, and how many could go in. Nil when "To store" does not show.
    private var storePlan: (fits: Int, wanted: Int)? {
        guard store.cardStore != nil, !ids.isEmpty, !ids.allSatisfy({ isInStore($0) }) else { return nil }
        let plan = store.stockPlan(ids)
        return (plan.cards.count + plan.sealed.count, plan.wanted)
    }

    private var storeRoomNote: String? {
        guard let plan = storePlan, plan.wanted > plan.fits else { return nil }
        if plan.fits == 0 { return "The store has no room. Take items out on the Store side first." }
        return "The store has room for \(plan.fits) of \(plan.wanted). The dearest cards go in first."
    }

    @ViewBuilder private var tiles: some View {
        let all = ids.union(stackIDs)
        let aside = all.contains { isSetAside($0) }
        let free = !ids.isEmpty && !all.contains { store.hasStatus($0) } && !aside
        // A product that a game shop opened can only be ripped. It has a status, so every other action skips it.
        let ripFree = !ids.isEmpty && !all.contains { store.ripBlocked($0) } && !aside
        ActionGrid {
            // A closed case opens first. It has no rip tiles.
            if kind == .sealed && (all.isEmpty || !all.allSatisfy({ id in store.data.sealed.first { $0.id == id }?.isCase == true })) {
                ActionTile(title: "Rip", icon: "scissors", filled: true) { run { nav.startRip(sealed(ids)) } }
                    .disabled(!ripFree)
                // One swipe opens every pack, and the stack holds only the hit slots (docs/18, Hits only).
                ActionTile(title: "Hits only", icon: "sparkles", tint: Theme.orange, filled: true) {
                    run { nav.startRip(sealed(ids), hitsOnly: true) }
                }
                .disabled(!ripFree)
                // Record & Rip films the rip for each running series that can take it (docs/32, Record & Rip).
                let recordable = store.recordableSeries(sealed(ids))
                if !recordable.isEmpty {
                    ActionTile(title: "Record & Rip", icon: "record.circle", tint: .red, filled: true) {
                        run {
                            let items = sealed(ids)
                            store.prepareRecording(items, for: recordable)
                            nav.startRip(items, recording: recordable)
                        }
                    }
                    .disabled(!ripFree)
                }
                if stackIDs.count > ids.count {
                    ActionTile(title: "Rip all \(stackIDs.count)", icon: "scissors", filled: true) {
                        run { nav.startRip(sealed(stackIDs)) }
                    }
                    .disabled(!ripFree)
                    ActionTile(title: "Hits all \(stackIDs.count)", icon: "sparkles", tint: Theme.orange, filled: true) {
                        run { nav.startRip(sealed(stackIDs), hitsOnly: true) }
                    }
                    .disabled(!ripFree)
                }
            }
            if kind == .sealed { breakTile }
            ActionTile(title: "Sell", icon: "dollarsign.circle", filled: kind != .sealed) { run { present(.sell(stackIDs)) } }
                .disabled(!free || stackIDs.isEmpty)
            ActionTile(title: "Lot", icon: "square.stack.3d.up") { run { present(.lot(stackIDs)) } }
                .disabled(!free || stackIDs.count < Balance.lotMinItems)
            if kind == .raw {
                ActionTile(title: "Grade", icon: "checkmark.seal") { run { present(.grade(ids)) } }
                    .disabled(!free)
                ActionTile(title: "Bulk", icon: "archivebox") { run { store.moveToBulk(ids) } }
                    .disabled(!free)
                // The PSA box: cards set aside for the next Value Bulk order (Model/PsaBox.swift).
                if !ids.isEmpty, ids.allSatisfy({ store.card($0)?.status == .inPsaBox }) {
                    ActionTile(title: "Leave box", icon: "tray.and.arrow.up") { run { store.removeFromPsaBox(ids) } }
                } else {
                    ActionTile(title: "PSA box", icon: "tray.and.arrow.down") { run { store.addToPsaBox(ids) } }
                        .disabled(aside || !store.canBox(ids))
                }
            }
            if kind == .slab {
                // Crack and resubmit (docs/10-grading.md). The sheet reviews or crosses over the slabs.
                ActionTile(title: "Resubmit", icon: "arrow.triangle.2.circlepath") { run { present(.grade(ids)) } }
                    .disabled(!free)
                ActionTile(title: "Crack", icon: "hammer.circle") { confirmCrack = true }
                    .disabled(!free)
                    .confirmationDialog(ids.count == 1 ? "Crack this slab?" : "Crack \(ids.count) slabs?", isPresented: $confirmCrack,
                                        titleVisibility: .visible) {
                        Button("Crack", role: .destructive) { run { store.crack(ids) } }
                    } message: {
                        Text("The grade is gone for good. The card goes back to Raw. Rarely, the case breaks badly and nicks the card.")
                    }
            }
            // Move between the two inventories: personal items to the store, store items back (docs/42-two-inventories.md).
            if store.cardStore != nil {
                let inStore = !ids.isEmpty && ids.allSatisfy { isInStore($0) }
                if inStore {
                    ActionTile(title: "To personal", icon: "arrow.uturn.backward") { run { store.moveBetweenInventories(ids) } }
                } else {
                    ActionTile(title: "To store", icon: "storefront") { run { store.moveBetweenInventories(ids) } }
                        .disabled(aside || (storePlan?.fits ?? 0) == 0)
                }
            }
            if kind != .sealed { masterSetTile }
            if store.series(.pnl) != nil {
                ActionTile(title: "Challenge", icon: "flag.checkered") { run { store.addToChallenge(ids) } }
                    .disabled(!ids.contains { store.challengeBlock($0) == nil })
            }
            pcTile
            extra
        }
    }

    /// "Break" opens sealed products into their loose packs, without a rip (docs/38-loose-packs-and-straight-buys.md).
    /// On a detail screen, "Break all" breaks every product in the stack, the same as "Rip all".
    @ViewBuilder private var breakTile: some View {
        breakTile(ids, title: "Break", confirm: $confirmBreak)
        if stackIDs.count > ids.count {
            breakTile(stackIDs, title: "Break all \(stackIDs.count)", confirm: $confirmBreakAll)
        }
    }

    /// The dialog shows what the packs are worth against the products, because a break can gain or lose value.
    @ViewBuilder private func breakTile(_ group: Set<UUID>, title: String, confirm: Binding<Bool>) -> some View {
        let items = sealed(group)
        let breakable = items.filter { store.breakRefusal($0) == nil }
        // A closed case opens first, and a loose pack has nothing to break.
        if !items.isEmpty, !items.allSatisfy({ $0.isLoosePack || $0.isCase }) {
            ActionTile(title: title, icon: "square.split.2x2") { confirm.wrappedValue = true }
                .disabled(breakable.isEmpty)
                .confirmationDialog(store.breakTitle(breakable), isPresented: confirm, titleVisibility: .visible) {
                    Button("Break into packs", role: .destructive) {
                        run {
                            for item in breakable { store.breakIntoPacks(item.id, save: false) }
                            store.save()
                        }
                    }
                } message: {
                    Text(store.breakMessage(breakable, skipped: items.count - breakable.count))
                }
        }
    }

    /// "Master set" puts the cards in their master sets. A card in its master set shows "Leave set".
    @ViewBuilder private var masterSetTile: some View {
        let cards = ids.compactMap { store.card($0) }
        if !cards.isEmpty, cards.allSatisfy(\.inMasterSet) {
            ActionTile(title: "Leave set", icon: "square.grid.3x3") { run { cards.forEach { store.removeFromMasterSet($0.id) } } }
        } else {
            ActionTile(title: "Master set", icon: "square.grid.3x3") { run { store.addToMasterSet(ids) } }
                .disabled(!cards.contains { store.masterSetBlock($0) == nil })
        }
    }

    /// "PC" moves the items into the PC. An item in the PC shows "Leave PC". A card in a master set or the showcase
    /// leaves there first.
    @ViewBuilder private var pcTile: some View {
        if !ids.isEmpty, ids.allSatisfy({ store.isPC($0) }) {
            ActionTile(title: "Leave PC", icon: "arrow.uturn.backward") { run { store.setPC(ids, false) } }
        } else {
            let cards = ids.compactMap { store.card($0) }
            ActionTile(title: "PC", icon: "heart") { run { store.setPC(ids, true) } }
                .disabled(ids.isEmpty || ids.contains { store.hasStatus($0) }
                          || cards.contains { $0.inMasterSet || $0.inShowcase })
        }
    }

    private func run(_ action: () -> Void) {
        action()
        done()
    }

    private func sealed(_ ids: Set<UUID>) -> [SealedItem] {
        store.data.sealed.filter { ids.contains($0.id) }
    }

    private func isInStore(_ id: UUID) -> Bool {
        if let c = store.card(id) { return GameStore.isInStore(c.status) }
        return GameStore.isInStore(store.data.sealed.first { $0.id == id }?.status)
    }

    private func isSetAside(_ id: UUID) -> Bool {
        store.card(id)?.setAside ?? store.data.sealed.first { $0.id == id }?.setAside ?? false
    }
}

extension ItemActions where Extra == EmptyView {
    init(kind: Kind, ids: Set<UUID>, stackIDs: Set<UUID>? = nil, present: @escaping (ItemSheet) -> Void,
         done: @escaping () -> Void = {}) {
        self.init(kind: kind, ids: ids, stackIDs: stackIDs, present: present, done: done) { EmptyView() }
    }
}

/// The PSA bills: the held orders with Pay, and the orders still at PSA with the day their bill comes due
/// (docs/10-grading.md, Paying PSA).
struct GradingBillsBox: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let bills = store.gradingBills.sorted { $0.dueDay < $1.dueDay }
        let total = store.unpaidGradingTotal
        DetailBox(title: "PSA bills") {
            ForEach(bills) { bill in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(bill.cards) card\(bill.cards == 1 ? "" : "s") · \(bill.tier)").font(.subheadline)
                        Text(bill.held ? "Graded · held until you pay"
                             : "Due in \(max(0, bill.dueDay - store.day)) day\(bill.dueDay - store.day == 1 ? "" : "s"), with the grades")
                            .font(.caption)
                            .foregroundStyle(bill.held ? Theme.orange : Theme.muted)
                    }
                    Spacer()
                    if bill.held {
                        Button("Pay \(money(bill.amount))") { store.payGradingBill(bill.id) }
                            .primaryButton()
                            .disabled(store.balance(store.gradingAccount) < bill.amount - 0.001)
                    } else {
                        Text(money(bill.amount)).font(.subheadline.monospaced())
                    }
                }
            }
            Text("Total due \(money(total)). You have \(money(store.cash)).")
                .font(.caption.monospaced())
                .foregroundStyle(store.canAfford(total) ? Theme.muted : Theme.orange)
            Text("PSA bills when the grades come back, and charges your cash when it covers the bill. Keep a reserve, or PSA holds the slabs until you pay.")
                .font(.caption2)
                .foregroundStyle(Theme.muted)
        }
    }
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
                Text("COLLECTION VALUE (PC, MASTER SETS, SHOWCASE)")
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
        .framed()
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
    @Environment(GameStore.self) private var store
    let pc: Bool
    let status: ItemStatus?
    /// The item's hidden fake tier, and what the player knows (docs/14-counterfeit-risk.md).
    var fake: FakeTier?
    var fakeKnown = false
    var verified = false
    var id: UUID?
    /// A sealed case: its unit count, and the trusted-case tag (Model/Cases.swift).
    var caseUnits: Int?
    var caseFresh = false

    var body: some View {
        HStack(spacing: 4) {
            if let caseUnits { Tag(text: "CASE ×\(caseUnits)", color: Theme.orange) }
            if caseFresh { Tag(text: "CASE FRESH") }
            if pc { Tag(text: "PC", color: Theme.green) }
            if let id, store.isChallengeItem(id) { Tag(text: "CHALLENGE", color: Theme.cyan) }
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
                Tags(pc: item.pc, status: item.status, fake: item.fake, fakeKnown: item.isKnownFake, verified: item.isVerified, id: item.id,
                     caseUnits: item.caseUnits, caseFresh: item.isCaseFresh)
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
                Tags(pc: card.pc, status: card.status, fake: card.fake, fakeKnown: card.isKnownFake, verified: card.isVerified, id: card.id)
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

/// The PSA box: the cards set aside for the next Value Bulk order, and the button that sends them (Model/PsaBox.swift).
struct PsaBoxBanner: View {
    @Environment(GameStore.self) private var store
    let send: () -> Void

    var body: some View {
        let box = store.psaBox
        let tier = store.psaBulkTier
        let need = tier?.minCards ?? 20
        let risk = store.psaBoxUpchargeRisk.count
        DetailBox(title: "PSA box · \(box.count) of \(need)") {
            ProgressView(value: Double(min(box.count, need)), total: Double(need)).tint(Theme.cyan)
            if let tier {
                Text("Value Bulk: \(money(store.gradingFee(tier, .psa) * Double(box.count))) for \(box.count) card\(box.count == 1 ? "" : "s"), billed when the grades come back. Cards in the box stay home.")
                    .font(.caption).foregroundStyle(Theme.muted)
            }
            if risk > 0, let cap = tier?.maxValue {
                Text("\(risk) card\(risk == 1 ? "" : "s") could grade over \(money(cap)). PSA upcharges a card worth more than the level allows.")
                    .font(.caption).foregroundStyle(Theme.orange)
            }
            Button(action: send) {
                Text(store.psaBoxBlock ?? "Send the box to PSA").frame(maxWidth: .infinity)
            }
            .primaryButton()
            .disabled(store.psaBoxBlock != nil)
        }
    }
}
