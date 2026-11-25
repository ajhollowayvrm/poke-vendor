import SwiftUI

/// The player's own card store: the lease, the shelves, the prices, the staff, and the fixtures
/// (docs/22-own-store.md).
struct CardStoreView: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav
    @State private var name = ""
    @State private var signing: StoreLocation?
    /// Take an investor at the lease (Model/StoreOpening.swift).
    @State private var withInvestor = false
    @State private var term = Balance.leaseTerms[0]
    @State private var stocking = false
    @State private var closing = false
    @State private var onlineSheet: SellRequest?
    @State private var caseRequest: CaseRequest?

    /// The sections of the store screen. The store has many boxes, so each tab shows a few of them.
    enum StoreTab: String, CaseIterable {
        case today = "Today", shelves = "Shelves", buying = "Buying", staff = "Staff", setup = "Setup"
    }

    @AppStorage("storeTab") private var tab: StoreTab = .today
    /// Select mode on the shelves: the picked items, and the kind of stock that shows.
    @State private var selectingShelf = false
    @State private var shelfPick: Set<UUID> = []
    @State private var shelfKind: ShelfKind = .all
    @State private var confirmShelfBreak = false
    @State private var seed = Balance.accountSeeds[1]

    enum ShelfKind: String, CaseIterable { case all = "All", singles = "Singles", slabs = "Slabs", sealed = "Sealed" }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                AccountsLine()
                if let s = store.cardStore {
                    storeHeader(s)
                    if store.day < s.openDay {
                        Banner(text: "The build-out finishes on day \(s.openDay + 1). You can stock the shelves now.", color: Theme.cyan,
                               icon: "hammer")
                    }
                    rentBanner(s)
                    if store.pendingDecision != nil { DecisionCard() }
                    Picker("Section", selection: $tab) {
                        ForEach(StoreTab.allCases, id: \.self) { t in Text(t.rawValue).tag(t) }
                    }
                    .pickerStyle(.segmented)
                    switch tab {
                    case .today:
                        if store.openingInProgress { OpeningBox() }
                        todayBox(s)
                        OrdersAndHoldsBox()
                        BusinessAccountBox()
                        numbersBox
                        BusinessLink()
                    case .shelves:
                        shelvesBox
                        if store.hasBackRoom { backRoomBox }
                        pricesBox(s)
                        bulkBox(s)
                    case .buying:
                        buylistBox(s)
                        StoreCreditBox()
                        StoreSealedBuylistBox()
                        StoreConsignmentBox()
                    case .staff:
                        staffBox(s)
                        StoreEventsBox()
                    case .setup:
                        fixturesBox
                        StoreSpaceBox()
                        leaseBox(s)
                    }
                } else {
                    pitch
                }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle(store.cardStore?.name ?? "Your own store")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $stocking) { StockShelvesSheet() }
        .sheet(item: $onlineSheet) { SellSheet(ids: $0.ids, startAll: false, alsoOnline: true) }
        .sheet(item: $caseRequest) { CaseOpenSheet(source: $0.source, onDone: { _ in }) }
        .confirmationDialog("Sign the lease?", isPresented: Binding(isPresent: $signing),
                            titleVisibility: .visible, presenting: signing) { location in
            Button("Sign for \(money(location.upfront(term: term) - (withInvestor ? store.investorMoney(location) : 0) + seed))") {
                store.signLease(location, term: term, name: name, investor: withInvestor, seed: seed)
            }
        } message: { location in
            Text(leaseMessage(location))
        }
        .confirmationDialog("Close the store?", isPresented: $closing, titleVisibility: .visible) {
            if let s = store.cardStore {
                let buyout = store.leaseBuyout(s)
                Button(buyout > 0 ? "Close and pay \(money(buyout))" : "Close the store", role: .destructive) { store.closeStore() }
                    .disabled(!store.canCloseStore)
            }
        } message: {
            if let s = store.cardStore, store.leaseBuyout(s) > 0 {
                Text("The lease runs to day \((s.lease?.endDay ?? 0) + 1). The business account pays the buyout, and the landlord keeps the \(money(s.deposit)) deposit. The money left in the business account comes to you. Your stock comes home tomorrow. The fixtures stay with the building.")
            } else {
                Text("The landlord gives back the deposit. The money in the business account comes to you. Your stock comes home tomorrow. The fixtures stay with the building.")
            }
        }
    }

    /// The terms of the lease, for the signing dialog.
    private func leaseMessage(_ location: StoreLocation) -> String {
        let endDay = store.day + term * Balance.rentCycleDays + 1
        let rent = money(location.rent(term: term))
        let overhead = money(location.fixedOverhead)
        let fee = Int(Balance.cardFeeRate * 100)
        var parts = ["\(location.name): \(term) periods of 28 days, to day \(endDay)."]
        parts.append("You pay the first rent, a deposit, and the build-out now, and \(money(seed)) goes into the business account.")
        parts.append("Rent of \(rent) is due every 28 days, with about \(overhead) of overhead and a \(fee)% card fee.")
        parts.append("The lease renews on the same terms unless you close in the last \(Balance.leaseNoticeDays) days of a term.")
        parts.append("If you close sooner, you pay a buyout of up to \(Balance.leaseBuyoutRents) rents, and the landlord keeps the deposit.")
        parts.append("If the business account cannot pay, the landlord locks the store and keeps the deposit.")
        parts.append("Cardboard Castle and Top Deck Games see you as a competitor. Your standing with each goes down by \(Balance.rivalStandingLoss) points, and they do not consign for you while you own a store.")
        return parts.joined(separator: " ")
    }

    // MARK: - Before the lease

    @ViewBuilder private var pitch: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Open your own store").font(.title2.bold())
            Text("A storefront of your own: walk-in customers every day, people who bring their collections to you, and a distributor account. It also brings a second rent.")
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        DetailBox(title: "What a landlord wants") {
            ForEach(store.storeRequirements) { r in
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: r.met ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(r.met ? Theme.green : Theme.muted)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.label).font(.subheadline.weight(.medium))
                        Text(r.detail).font(.caption).foregroundStyle(Theme.muted)
                    }
                }
            }
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "dollarsign.circle").foregroundStyle(Theme.muted)
                Text("The cash to sign: the first rent, a deposit of one rent, and the build-out. After that, every 28 days: rent, and overhead for insurance, utilities, software, and card fees.")
                    .font(.caption).foregroundStyle(Theme.muted)
            }
        }
        DetailBox(title: "The store name") {
            TextField("Card Corner", text: $name)
                .textInputAutocapitalization(.words)
                .padding(8)
                .background(Theme.background)
                .framed()
        }
        DetailBox(title: "The lease term") {
            Picker("Term", selection: $term) {
                ForEach(Balance.leaseTerms, id: \.self) { t in
                    Text("\(t) periods").tag(t)
                }
            }
            .pickerStyle(.segmented)
            Text("A period is 28 days. \(termDiscountText) If you close before the term ends, you pay a buyout of up to \(Balance.leaseBuyoutRents) rents, and the landlord keeps the deposit. The lease renews on the same terms unless you close in the last \(Balance.leaseNoticeDays) days of a term. Then the landlord gives back the deposit.")
                .font(.caption)
                .foregroundStyle(Theme.muted)
        }
        DetailBox(title: "Money to open") {
            Text("THE BUSINESS ACCOUNT").font(.system(size: 10, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
            Picker("Seed", selection: $seed) {
                ForEach(Balance.accountSeeds, id: \.self) { a in Text(money(a)).tag(a) }
            }
            .pickerStyle(.segmented)
            Text("The store gets its own bank account. You pay the cost to sign into it, plus this much to run on. After that, store sales go in, and rent, wages, and other store bills come out. A bill that it cannot pay fails, so start with enough for the second rent.")
                .font(.caption).foregroundStyle(Theme.muted)
            Toggle("Take an investor", isOn: $withInvestor).font(.subheadline)
            Text("An investor pays \(Int(Balance.investorBuildoutShare * 100))% of the build-out now. In return, they take \(Int(Balance.investorProfitShare * 100))% of each profitable month, until you buy them out for \(Int(Balance.investorBuyout)) times the money.")
                .font(.caption).foregroundStyle(Theme.muted)
        }
        ForEach(StoreLocation.allCases, id: \.self) { location in
            DetailBox(title: location.name) {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: location.icon).font(.title3).foregroundStyle(Theme.cyan).frame(width: 28)
                    Text(location.detail).font(.caption).foregroundStyle(Theme.muted)
                }
                HStack(spacing: 0) {
                    StatCell(label: "Rent / 28 d", value: money(location.rent(term: term)))
                    StatCell(label: "Build-out", value: money(location.buildout))
                    StatCell(label: "Weekday", value: "~\(Int(location.traffic)) ppl")
                }
                // The business plan: who shops there, and the nearest rival.
                Text(CustomerType.allCases.map { "\($0.rawValue) \(Int(((location.customerMix[$0] ?? 0) * 100).rounded()))%" }.joined(separator: " · "))
                    .font(.caption2.monospaced()).foregroundStyle(Theme.muted)
                Text(location.rivalNote).font(.caption2).foregroundStyle(Theme.muted)
                if withInvestor {
                    Text("The investor pays \(money(store.investorMoney(location))).").font(.caption2.monospaced()).foregroundStyle(Theme.cyan)
                }
                Button { signing = location } label: {
                    Text("Sign the lease · \(money(location.upfront(term: term) - (withInvestor ? store.investorMoney(location) : 0) + seed))").frame(maxWidth: .infinity)
                }
                .primaryButton()
                .disabled(!store.canSignLease(location, term: term, investor: withInvestor, seed: seed))
            }
        }
    }

    // MARK: - The store

    /// The rent saving of each term, for the term picker.
    private var termDiscountText: String {
        let parts = Balance.leaseTerms.compactMap { t -> String? in
            let cut = Int(((1 - (Balance.leaseRentFactor[t] ?? 1)) * 100).rounded())
            return cut > 0 ? "\(t) periods: rent \(cut)% lower." : nil
        }
        return parts.joined(separator: " ")
    }

    private func storeHeader(_ s: CardStoreState) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(s.name).font(.title2.bold())
                Text(s.location.name).font(.caption.monospaced()).foregroundStyle(Theme.muted)
            }
            Spacer()
            if store.day < s.openDay {
                Tag(text: "BUILDING", color: Theme.orange)
            } else if store.storeOpenToday {
                Tag(text: "OPEN TODAY", color: Theme.green)
            } else {
                Tag(text: "CLOSED TODAY", color: Theme.muted)
            }
        }
    }

    @ViewBuilder private func rentBanner(_ s: CardStoreState) -> some View {
        if let days = store.daysUntilStoreRent, days <= Balance.rentWarningDays {
            let overhead = store.storeOverhead(s).total
            Banner(text: "Store rent of \(money(s.rent)) and about \(money(overhead)) of overhead are due in \(days) day\(days == 1 ? "" : "s"). The business account has \(money(store.businessCash)).",
                   color: store.bizAfford(s.rent + overhead) ? Theme.cyan : Theme.orange)
        }
    }

    private func todayBox(_ s: CardStoreState) -> some View {
        DetailBox(title: "Today") {
            let block = store.counterBlock
            Button {
                if let session = store.startCounter() { nav.encounter = EncounterSession(session: session) }
            } label: {
                ChevronRow(icon: "person.crop.square", title: "Work the counter",
                           detail: block ?? "From \(GameStore.clock(store.counterStart)) to \(GameStore.clock(Balance.storeClose)) · buy, sell, and trade with walk-ins",
                           accent: block == nil)
            }
            .buttonStyle(.plain)
            .disabled(block != nil)
            if store.storeOpenToday {
                Text("About \(Int(store.expectedCustomers(day: store.day).rounded())) customers come in today. \(s.clerk ? "The clerk covers the hours you are not there." : "With no clerk, the store is open only while you work the counter.")")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
        }
    }

    private var numbersBox: some View {
        let week = store.storeTotals(days: 7)
        return DetailBox(title: "Last 7 days") {
            HStack(spacing: 0) {
                StatCell(label: "Sales", value: money(week.revenue), color: Theme.green)
                StatCell(label: "Costs", value: money(week.costs), color: Theme.orange)
                StatCell(label: "Net", value: signedMoney(week.revenue - week.costs),
                         color: week.revenue >= week.costs ? Theme.green : Theme.orange)
            }
            Text("\(week.customers) customer\(week.customers == 1 ? "" : "s") · \(week.sold) item\(week.sold == 1 ? "" : "s") sold. Costs are wages, rent, and overhead. Sales are the price paid, before what you paid for the stock.")
                .font(.caption)
                .foregroundStyle(Theme.muted)
        }
    }

    private var shelvesBox: some View {
        let stock = store.storeStock
        let room = store.sealedRoom(stock.sealed)
        let all = store.showItems(stock)
        let value = all.reduce(0) { $0 + store.storePrice(item: $1) }
        let items = all.filter { item in
            switch shelfKind {
            case .all: true
            case .singles: item.kind == .card && !item.graded
            case .slabs: item.kind == .card && item.graded
            case .sealed: item.kind == .sealed
            }
        }
        return DetailBox(title: "Shelves") {
            HStack(spacing: 0) {
                StatCell(label: "Cards", value: "\(store.storeCardsUsed) / \(store.storeCardSlots)")
                StatCell(label: "Sealed", value: "\(room.used) / \(store.storeSealedSlots)")
                if store.packDisplaySlots > 0 {
                    StatCell(label: "Pack display", value: "\(room.packsOnDisplay) / \(store.packDisplaySlots)")
                }
                StatCell(label: "At your price", value: money(value))
            }
            // The rep watches where hot distributor product goes: customers, or resellers.
            if !store.data.distributor.hotRecords.isEmpty {
                if let share = store.hotShelfShare {
                    Text("Hot product from your distributor sold to customers, last \(Balance.backDoorWindowDays / 7) weeks: \(Int((share * 100).rounded()))%. Your rep wants \(Int(Balance.backDoorShelfShare * 100))% or more.")
                        .font(.caption)
                        .foregroundStyle(share < Balance.backDoorShelfShare ? Theme.orange : Theme.muted)
                } else {
                    Text("No hot product from your distributor has sold yet. Your rep wants \(Int(Balance.backDoorShelfShare * 100))% of it to reach customers.")
                        .font(.caption).foregroundStyle(Theme.muted)
                }
            }
            HStack(spacing: 8) {
                Button { stocking = true } label: { Text("Stock the shelves").frame(maxWidth: .infinity) }
                    .primaryButton()
                    .disabled(store.stockable.cards.isEmpty && store.stockable.sealed.isEmpty)
                Button {
                    selectingShelf.toggle()
                    shelfPick = []
                } label: { Text(selectingShelf ? "Done" : "Select").frame(maxWidth: .infinity) }
                    .buttonStyle(.bordered)
                    .disabled(all.isEmpty)
            }
            if all.isEmpty {
                Text("The shelves are empty. Empty shelves turn customers away.").font(.caption).foregroundStyle(Theme.orange)
            } else {
                Picker("Kind", selection: $shelfKind) {
                    ForEach(ShelfKind.allCases, id: \.self) { k in Text(k.rawValue).tag(k) }
                }
                .pickerStyle(.segmented)
            }
            if selectingShelf { shelfActions(items) }
            let cards = items.filter { $0.kind == .card }
            let groups = SetLibrary.grouped(items.filter { $0.kind == .sealed }, by: { $0.setSlug })
            FoldAllButton(list: "store", keys: (cards.isEmpty ? [] : [FoldKey.title("In the cases")]) + groups.map { FoldKey.set($0.slug) })
            if !cards.isEmpty {
                TitledGroup(title: "In the cases", count: cards.count, list: "store") {
                    ForEach(cards) { stockRow($0) }
                }
            }
            ForEach(groups, id: \.slug) { group in
                SetGroup(slug: group.slug, count: group.items.count, list: "store") {
                    ForEach(group.items) { stockRow($0) }
                }
            }
        }
    }

    /// The actions on the picked shelf items: take back, list online, put on clearance, and the slab price.
    private func shelfActions(_ shown: [ShowItem]) -> some View {
        let picked = shown.filter { shelfPick.contains($0.id) }
        let ids = Set(picked.map(\.id))
        let slabs = picked.filter(\.graded).map(\.id)
        let allPicked = !shown.isEmpty && picked.count == shown.count
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("PICKED · \(picked.count) of \(shown.count)")
                    .font(.system(size: 11, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
                Spacer()
                Button(allPicked ? "None" : "All") {
                    shelfPick = allPicked ? [] : Set(shown.map(\.id))
                }
                .font(.caption.weight(.semibold))
            }
            HStack(spacing: 8) {
                Button {
                    store.takeBackFromStore(ids)
                    shelfPick = []
                } label: { Text("Take back \(ids.count)").lineLimit(1).minimumScaleFactor(0.8).frame(maxWidth: .infinity) }
                .primaryButton()
                .disabled(ids.isEmpty)
                Button {
                    onlineSheet = SellRequest(ids: ids, startAll: false)
                    shelfPick = []
                } label: { Text("List online").lineLimit(1).minimumScaleFactor(0.8).frame(maxWidth: .infinity) }
                .buttonStyle(.bordered)
                .disabled(ids.isEmpty || picked.contains { store.onlineListing(of: $0.id) != nil })
            }
            HStack(spacing: 8) {
                Button {
                    store.markDown(Array(ids))
                    shelfPick = []
                } label: { Text("Clearance \(Int(Balance.clearanceFactor * 100))%").lineLimit(1).minimumScaleFactor(0.8).frame(maxWidth: .infinity) }
                .buttonStyle(.bordered)
                .tint(Theme.orange)
                .disabled(ids.isEmpty)
                Menu {
                    Button("Singles price") { slabs.forEach { store.setSlabPrice($0, nil) } }
                    ForEach(Balance.storeSlabPrices, id: \.self) { p in
                        Button(Self.percent(p)) { slabs.forEach { store.setSlabPrice($0, p) } }
                    }
                } label: {
                    Text("Slab price · \(slabs.count)").lineLimit(1).minimumScaleFactor(0.8).frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(slabs.isEmpty)
            }
            // A sealed product on the shelf breaks into loose packs (docs/38-loose-packs-and-straight-buys.md).
            let products = store.data.sealed.filter { ids.contains($0.id) && !$0.isLoosePack }
            if !products.isEmpty {
                let breakable = products.filter { store.breakRefusal($0) == nil }
                Button { confirmShelfBreak = true } label: {
                    Text("Break \(breakable.count) into packs").lineLimit(1).minimumScaleFactor(0.8).frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(breakable.isEmpty)
                .confirmationDialog(store.breakTitle(breakable), isPresented: $confirmShelfBreak, titleVisibility: .visible) {
                    Button("Break into packs", role: .destructive) {
                        for item in breakable { store.breakIntoPacks(item.id, save: false) }
                        store.save()
                        shelfPick = []
                    }
                } message: {
                    Text(store.breakMessage(breakable, skipped: products.count - breakable.count))
                }
            }
        }
        .padding(10)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 10))
    }

    /// Sealed cases off the shelf. When a product runs low, the store opens a case of it at night and restocks.
    private var backRoomBox: some View {
        let cases = store.backRoomCases
        // Loose units that wait in the back room, counted for each product.
        let loose = Dictionary(grouping: store.backRoomUnits, by: { $0.productID ?? $0.name })
            .compactMap { group -> (name: String, count: Int)? in group.value.first.map { ($0.name, group.value.count) } }
            .sorted { $0.name < $1.name }
        return DetailBox(title: "Back room") {
            Text("\(cases.count) of \(store.backRoomCapacity) cases. When a product has \(Balance.backRoomRestockAt) unit or fewer on the shelf, the store opens a case of it overnight and puts the units out. Customers never see a case.")
                .font(.caption).foregroundStyle(Theme.muted)
            ForEach(loose, id: \.name) { row in
                HStack {
                    Text("\(row.count) × \(row.name)").font(.subheadline).lineLimit(2)
                    Spacer()
                    Text("loose").font(.caption2.monospaced()).foregroundStyle(Theme.muted)
                }
                .padding(.vertical, 2)
            }
            ForEach(cases) { item in
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.name).font(.subheadline).lineLimit(2)
                        Text("case mkt \(money(store.realMarket(of: item)))").font(.caption2.monospaced()).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    if item.onlineListing == nil {
                        Button("Open") { caseRequest = CaseRequest(source: .closed(item.id)) }.buttonStyle(.bordered).controlSize(.small)
                    }
                    Button { store.takeBackFromStore([item.id]) } label: { Image(systemName: "arrow.uturn.backward.circle") }
                        .buttonStyle(.plain)
                        .foregroundStyle(Theme.muted)
                        .accessibilityLabel("Take back \(item.name)")
                }
                .padding(.vertical, 2)
            }
        }
    }

    @ViewBuilder private func stockRow(_ item: ShowItem) -> some View {
        if selectingShelf {
            let on = shelfPick.contains(item.id)
            Button {
                if on { shelfPick.remove(item.id) } else { shelfPick.insert(item.id) }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: on ? "checkmark.circle.fill" : "circle").foregroundStyle(on ? Theme.cyan : Theme.muted)
                    ItemLine(item: item)
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(money(store.storePrice(item: item))).font(.subheadline.monospaced())
                        Text("mkt \(money(item.market))").font(.caption2.monospaced()).foregroundStyle(Theme.muted)
                    }
                }
                .padding(.vertical, 4)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        } else {
            plainStockRow(item)
        }
    }

    private func plainStockRow(_ item: ShowItem) -> some View {
        HStack(spacing: 10) {
            ItemLine(item: item)
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(money(store.storePrice(item: item))).font(.subheadline.monospaced())
                Text("mkt \(money(item.market))").font(.caption2.monospaced()).foregroundStyle(Theme.muted)
                if let listing = store.onlineListing(of: item.id) {
                    Text("also \(listing.channel.rawValue) \(money(listing.price))")
                        .font(.caption2.monospaced())
                        .foregroundStyle(Theme.cyan)
                }
            }
            Menu {
                if item.graded {
                    Menu("Slab price") {
                        Button("Singles price") { store.setSlabPrice(item.id, nil) }
                        ForEach(Balance.storeSlabPrices, id: \.self) { p in
                            Button(Self.percent(p)) { store.setSlabPrice(item.id, p) }
                        }
                    }
                }
                if store.onlineListing(of: item.id) == nil {
                    Button("List online too") { onlineSheet = SellRequest(ids: [item.id], startAll: false) }
                } else {
                    Button("Remove online listing", role: .destructive) { store.removeOnlineListing(item.id) }
                }
            } label: { Image(systemName: "ellipsis.circle") }
                .foregroundStyle(Theme.muted)
                .accessibilityLabel("Options for \(item.name)")
            Button { store.takeBackFromStore([item.id]) } label: { Image(systemName: "arrow.uturn.backward.circle") }
                .buttonStyle(.plain)
                .foregroundStyle(Theme.muted)
                .accessibilityLabel("Take back \(item.name)")
        }
        .padding(.vertical, 4)
    }

    static func percent(_ p: Double) -> String { p == 1 ? "Market" : "\(Int((p * 100).rounded()))%" }

    private func pricesBox(_ s: CardStoreState) -> some View {
        DetailBox(title: "Prices") {
            Text("SINGLES AND SLABS").font(.system(size: 10, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
            Picker("Singles", selection: Binding(get: { s.singlesPrice }, set: { store.setSinglesPrice($0) })) {
                ForEach(Balance.storePrices, id: \.self) { p in Text(Self.percent(p)).tag(p) }
            }
            .pickerStyle(.segmented)
            Text("SEALED").font(.system(size: 10, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted).padding(.top, 4)
            Picker("Sealed", selection: Binding(get: { s.sealedPrice }, set: { store.setSealedPrice($0) })) {
                ForEach(Balance.storeSealedPrices, id: \.self) { p in Text(Self.percent(p)).tag(p) }
            }
            .pickerStyle(.segmented)
            Text("Sealed product sells near MSRP. Put hot product above market. A slab uses the singles price, unless you set its own price with the menu on its row. A customer pays up to about \(Int(Balance.storeBuyerLimit.upperBound * 100))% of market, so a lower price sells more. At the counter, buyers still haggle.")
                .font(.caption)
                .foregroundStyle(Theme.muted)
        }
    }

    private func staffBox(_ s: CardStoreState) -> some View {
        DetailBox(title: "Staff and hours") {
            StaffList()
            Text("OPEN DAYS").font(.system(size: 10, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted).padding(.top, 4)
            HStack(spacing: 6) {
                ForEach(0..<7, id: \.self) { d in
                    let on = s.openDays.contains(d)
                    Button { store.toggleOpenDay(d) } label: {
                        Text(String(GameStore.weekdays[d].prefix(2)))
                            .font(.caption.weight(.semibold))
                            .frame(maxWidth: .infinity, minHeight: 32)
                            .background(on ? Theme.cyan.opacity(0.18) : Theme.background)
                            .foregroundStyle(on ? Theme.cyan : Theme.muted)
                            .overlay(Rectangle().stroke(on ? Theme.cyan.opacity(0.6) : Theme.line))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(GameStore.weekdays[d]) \(on ? "open" : "closed")")
                }
            }
            Text("Saturday brings the most customers, then Sunday and Friday.").font(.caption).foregroundStyle(Theme.muted)
        }
    }

    private func buylistBox(_ s: CardStoreState) -> some View {
        let src = s.source
        return DetailBox(title: "Buylist and store credit") {
            HStack(spacing: 0) {
                StatCell(label: "Credit owed", value: money(src.creditOwed), color: src.creditOwed > 0 ? Theme.orange : Theme.text)
                StatCell(label: "Buylist", value: src.buylistRate > 0 ? "\(Int((src.buylistRate * 100).rounded()))%" : "Off")
                StatCell(label: "Daily budget", value: src.buylistRate > 0 ? money(src.buylistBudget) : "-")
            }
            Picker("Buylist", selection: Binding(get: { src.buylistRate },
                                                 set: { store.setBuylist(rate: $0, budget: src.buylistBudget, offerCredit: src.offerCredit) })) {
                Text("Off").tag(0.0)
                ForEach(Balance.buylistRates, id: \.self) { r in Text("\(Int((r * 100).rounded()))%").tag(r) }
            }
            .pickerStyle(.segmented)
            Picker("Budget", selection: Binding(get: { src.buylistBudget },
                                                set: { store.setBuylist(rate: src.buylistRate, budget: $0, offerCredit: src.offerCredit) })) {
                ForEach(Balance.buylistBudgets, id: \.self) { b in Text(money(b)).tag(b) }
            }
            .pickerStyle(.segmented)
            Toggle(isOn: Binding(get: { src.offerCredit },
                                 set: { store.setBuylist(rate: src.buylistRate, budget: src.buylistBudget, offerCredit: $0) })) {
                Text("The clerk offers store credit at \(Int((Balance.creditBonus * 100).rounded()))% of the cash offer")
                    .font(.subheadline)
            }
            .tint(Theme.cyan)
            Text("On each open day with a clerk, walk-in sellers offer collections. The clerk pays this share of market, up to the daily budget, and does not check for fakes. A higher share brings more sellers. Bought items go to Inventory. Customers pay up to \(Int(Balance.creditRedeemShare * 100))% of a day's sales with credit, so no cash comes in for that part. At the counter, you can pay a seller in store credit.")
                .font(.caption)
                .foregroundStyle(Theme.muted)
        }
    }

    private func bulkBox(_ s: CardStoreState) -> some View {
        let src = s.source
        let groups = store.movableBulk
        return DetailBox(title: "Bulk box") {
            HStack(spacing: 0) {
                StatCell(label: "Cards in the box", value: "\(src.bulkCards)")
                StatCell(label: "Price a card", value: money(Balance.bulkBoxPrice))
                StatCell(label: "Inventory bulk", value: "\(groups.reduce(0) { $0 + $1.cards.count })")
            }
            HStack(spacing: 8) {
                Button { store.moveBulkToBox(Set(groups.map(\.id))) } label: { Text("Move all bulk").frame(maxWidth: .infinity) }
                    .primaryButton()
                    .disabled(groups.isEmpty)
                Button { store.takeBulkBack() } label: { Text("Take the box back").frame(maxWidth: .infinity) }
                    .buttonStyle(.bordered)
                    .disabled(src.bulkBox.isEmpty)
            }
            Text("Small-budget customers buy handfuls of \(Balance.bulkHandful.lowerBound) to \(Balance.bulkHandful.upperBound) cards at \(money(Balance.bulkBoxPrice)) each.")
                .font(.caption)
                .foregroundStyle(Theme.muted)
        }
    }

    private var fixturesBox: some View {
        DetailBox(title: "Fixtures") {
            ForEach(StoreFixture.allCases, id: \.self) { f in
                let owned = store.cardStore?.has(f) == true
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: f.icon).font(.title3).foregroundStyle(owned ? Theme.green : Theme.cyan).frame(width: 28)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(f.name).font(.subheadline.weight(.semibold))
                        Text(f.detail + (f.requires.map { " Needs the \($0.name.lowercased())." } ?? "")).font(.caption).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    if owned {
                        Tag(text: "OWNED", color: Theme.green)
                    } else {
                        Button(money(f.cost)) { store.buyFixture(f) }
                            .primaryButton()
                            .controlSize(.small)
                            .disabled(!store.canBuyFixture(f))
                    }
                }
                .padding(.vertical, 6)
            }
        }
    }

    private func leaseBox(_ s: CardStoreState) -> some View {
        DetailBox(title: "Lease") {
            HStack {
                Text("Rent \(money(s.rent))").font(.subheadline)
                Spacer()
                if let days = store.daysUntilStoreRent {
                    Text("due in \(days) day\(days == 1 ? "" : "s")")
                        .font(.subheadline.monospaced())
                        .foregroundStyle(days <= Balance.rentWarningDays ? Theme.orange : Theme.muted)
                }
            }
            if let lease = s.lease {
                let left = max(0, lease.endDay - store.day)
                Text("Term \(lease.periods) periods · ends on day \(lease.endDay + 1) (\(left) day\(left == 1 ? "" : "s") left)")
                    .font(.caption.monospaced())
                    .foregroundStyle(Theme.cyan)
                Text(store.leaseBuyout(s) > 0 ? "It renews on the same terms at the end. To leave without a buyout, close in the last \(Balance.leaseNoticeDays) days of the term. A close now costs \(money(store.leaseBuyout(s))), and the landlord keeps the deposit." : "The term ends soon. Close now and the landlord gives back the deposit. If you do not, the lease renews on the same terms.")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            } else {
                Text("Month to month. You can close at any time.").font(.caption.monospaced()).foregroundStyle(Theme.cyan)
            }
            let overhead = store.storeOverhead(s)
            Text("Overhead every 28 days: insurance \(money(overhead.insurance)), utilities \(money(overhead.utilities)), software \(money(overhead.software)), and a \(Int(Balance.cardFeeRate * 100))% card fee on sales.")
                .font(.caption)
                .foregroundStyle(Theme.muted)
            Text("Deposit \(money(s.deposit)) · signed on day \(s.leaseDay + 1). If you miss a payment, the landlord locks the store, keeps the deposit, and word gets around. The two game shops do not consign for you while you own a store.")
                .font(.caption)
                .foregroundStyle(Theme.muted)
            Button("Close the store", role: .destructive) { closing = true }
                .buttonStyle(.bordered)
        }
    }
}

/// Picks items from Inventory to put in the store.
struct StockShelvesSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var picked: Set<UUID> = []

    var body: some View {
        let stockable = store.stockable
        let items = store.showItems(stockable)
        let stock = store.storeStock
        let cardRoom = max(0, store.storeCardSlots - store.storeCardsUsed)
        let room = store.sealedRoom(stock.sealed)
        let sealedRoom = room.total
        // The same count as `stockStore`: a loose pack can use a display slot, other sealed items cannot.
        var free = room
        let sealedFits = stockable.sealed.filter { picked.contains($0.id) && !$0.isCase && free.take($0) }.count
        let caseRoom = store.hasBackRoom ? max(0, store.backRoomCapacity - store.backRoomCases.count) : 0
        let pickedCards = items.filter { $0.kind == .card && picked.contains($0.id) }.count
        let pickedSealed = items.filter { $0.kind == .sealed && !$0.isCase && picked.contains($0.id) }.count
        let pickedCases = items.filter { $0.isCase && picked.contains($0.id) }.count
        let fits = min(pickedCards, cardRoom) + sealedFits + min(pickedCases, caseRoom)
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Room for \(cardRoom) card\(cardRoom == 1 ? "" : "s") and \(sealedRoom) sealed item\(sealedRoom == 1 ? "" : "s")\(room.display > 0 ? " (\(room.display) on the pack display, for loose packs only)" : "")\(store.hasBackRoom ? ", and \(caseRoom) case\(caseRoom == 1 ? "" : "s") in the back room" : ""). PC items, master set cards, listed items, and known fakes stay home.")
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                        if pickedCards > cardRoom || pickedSealed > sealedFits || pickedCases > caseRoom {
                            Text("Not everything fits. The dearest cards go in first.").font(.caption).foregroundStyle(Theme.orange)
                        }
                        HStack {
                            Text("PICKED · \(picked.count) of \(items.count)")
                                .font(.system(size: 11, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
                            Spacer()
                            Button(picked.count == items.count ? "None" : "All") {
                                picked = picked.count == items.count ? [] : Set(items.map(\.id))
                            }
                            .font(.caption.weight(.semibold))
                        }
                        let cards = items.filter { $0.kind == .card }
                        let groups = SetLibrary.grouped(items.filter { $0.kind == .sealed }, by: { $0.setSlug })
                        FoldAllButton(list: "stock", keys: (cards.isEmpty ? [] : [FoldKey.title("Singles and slabs")]) + groups.map { FoldKey.set($0.slug) })
                        if !cards.isEmpty {
                            TitledGroup(title: "Singles and slabs", count: cards.count, list: "stock") {
                                ForEach(cards) { pickRow($0) }
                            }
                        }
                        ForEach(groups, id: \.slug) { group in
                            SetGroup(slug: group.slug, count: group.items.count, list: "stock") {
                                ForEach(group.items) { pickRow($0) }
                            }
                        }
                    }
                    .padding(16)
                }
                Button {
                    store.stockStore(picked)
                    dismiss()
                } label: {
                    Text(fits > 0 ? "Put \(fits) in the store" : "Pick items").frame(maxWidth: .infinity)
                }
                .primaryButton()
                .controlSize(.large)
                .disabled(fits == 0)
                .padding(16)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Stock the shelves")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }

    private func pickRow(_ item: ShowItem) -> some View {
        Button {
            if picked.contains(item.id) { picked.remove(item.id) } else { picked.insert(item.id) }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: picked.contains(item.id) ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(picked.contains(item.id) ? Theme.cyan : Theme.muted)
                ItemLine(item: item)
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(money(store.storePrice(item: item))).font(.subheadline.monospaced())
                    Text("mkt \(money(item.market))").font(.caption2.monospaced()).foregroundStyle(Theme.muted)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
