import SwiftUI

/// The player's own card store: the lease, the shelves, the prices, the staff, and the fixtures
/// (docs/22-own-store.md).
struct CardStoreView: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav
    @State private var name = ""
    @State private var signing: StoreLocation?
    @State private var stocking = false
    @State private var closing = false
    @State private var onlineSheet: SellRequest?

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                Text("Cash \(money(store.cash))").font(.caption.monospaced()).frame(maxWidth: .infinity, alignment: .trailing)
                if let s = store.cardStore {
                    storeHeader(s)
                    if store.day < s.openDay {
                        Banner(text: "The build-out finishes on day \(s.openDay + 1). You can stock the shelves now.", color: Theme.cyan,
                               icon: "hammer")
                    }
                    rentBanner(s)
                    todayBox(s)
                    numbersBox
                    shelvesBox
                    pricesBox(s)
                    staffBox(s)
                    StoreEventsBox()
                    buylistBox(s)
                    bulkBox(s)
                    fixturesBox
                    leaseBox(s)
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
        .confirmationDialog("Sign the lease?", isPresented: Binding(get: { signing != nil }, set: { if !$0 { signing = nil } }),
                            titleVisibility: .visible, presenting: signing) { location in
            Button("Sign for \(money(location.upfront))") { store.signLease(location, name: name) }
        } message: { location in
            Text("\(location.name): the first rent, a deposit, and the build-out. Rent of \(money(location.rent)) is due every 28 days after that. If you cannot pay it, the landlord locks the store and keeps the deposit.")
        }
        .confirmationDialog("Close the store?", isPresented: $closing, titleVisibility: .visible) {
            Button("Close the store", role: .destructive) { store.closeStore() }
        } message: {
            Text("The landlord gives back the deposit. Your stock comes home tomorrow. The fixtures stay with the building.")
        }
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
                Text("The cash to sign: the first rent, a deposit of one rent, and the build-out.")
                    .font(.caption).foregroundStyle(Theme.muted)
            }
        }
        DetailBox(title: "The store name") {
            TextField("Card Corner", text: $name)
                .textInputAutocapitalization(.words)
                .padding(8)
                .background(Theme.background)
                .overlay(Rectangle().stroke(Theme.line))
        }
        ForEach(StoreLocation.allCases, id: \.self) { location in
            DetailBox(title: location.name) {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: location.icon).font(.title3).foregroundStyle(Theme.cyan).frame(width: 28)
                    Text(location.detail).font(.caption).foregroundStyle(Theme.muted)
                }
                HStack(spacing: 0) {
                    StatCell(label: "Rent / 28 d", value: money(location.rent))
                    StatCell(label: "Build-out", value: money(location.buildout))
                    StatCell(label: "Weekday", value: "~\(Int(location.traffic)) ppl")
                }
                Button { signing = location } label: {
                    Text("Sign the lease · \(money(location.upfront))").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .foregroundStyle(.black)
                .disabled(!store.canSignLease(location))
            }
        }
    }

    // MARK: - The store

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
            Banner(text: "Store rent of \(money(s.location.rent)) is due in \(days) day\(days == 1 ? "" : "s"). You have \(money(store.cash)).",
                   color: store.canAfford(s.location.rent) ? Theme.cyan : Theme.orange)
        }
    }

    private func todayBox(_ s: CardStoreState) -> some View {
        DetailBox(title: "Today") {
            let block = store.counterBlock
            Button {
                if let session = store.startCounter() { nav.encounter = EncounterSession(session: session) }
            } label: {
                HStack {
                    Image(systemName: "person.crop.square").foregroundStyle(Theme.cyan)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Work the counter").font(.subheadline.weight(.medium))
                            .foregroundStyle(block == nil ? Theme.cyan : Theme.text)
                        Text(block ?? "From \(GameStore.clock(store.counterStart)) to \(GameStore.clock(Balance.storeClose)) · buy, sell, and trade with walk-ins")
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
                }
                .contentShape(Rectangle())
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
                StatCell(label: "Wages, rent", value: money(week.costs), color: Theme.orange)
                StatCell(label: "Net", value: signedMoney(week.revenue - week.costs),
                         color: week.revenue >= week.costs ? Theme.green : Theme.orange)
            }
            Text("\(week.customers) customer\(week.customers == 1 ? "" : "s") · \(week.sold) item\(week.sold == 1 ? "" : "s") sold. Sales are the price paid, before what you paid for the stock.")
                .font(.caption)
                .foregroundStyle(Theme.muted)
        }
    }

    private var shelvesBox: some View {
        let stock = store.storeStock
        let items = store.showItems(stock)
        let value = items.reduce(0) { $0 + store.storePrice(item: $1) }
        return DetailBox(title: "Shelves") {
            HStack(spacing: 0) {
                StatCell(label: "Cards", value: "\(stock.cards.count) / \(store.storeCardSlots)")
                StatCell(label: "Sealed", value: "\(stock.sealed.count) / \(store.storeSealedSlots)")
                StatCell(label: "At your price", value: money(value))
            }
            Button { stocking = true } label: { Text("Stock the shelves").frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent)
                .foregroundStyle(.black)
                .disabled(store.stockable.cards.isEmpty && store.stockable.sealed.isEmpty)
            if items.isEmpty {
                Text("The shelves are empty. Empty shelves turn customers away.").font(.caption).foregroundStyle(Theme.orange)
            }
            let cards = items.filter { $0.kind == .card }
            if !cards.isEmpty {
                TitledGroup(title: "In the cases", count: cards.count, list: "store") {
                    ForEach(cards) { stockRow($0) }
                }
            }
            ForEach(SetLibrary.grouped(items.filter { $0.kind == .sealed }, by: { $0.setSlug }), id: \.slug) { group in
                SetGroup(slug: group.slug, count: group.items.count, list: "store") {
                    ForEach(group.items) { stockRow($0) }
                }
            }
        }
    }

    private func stockRow(_ item: ShowItem) -> some View {
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
            Toggle(isOn: Binding(get: { s.clerk }, set: { store.setClerk($0) })) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Clerk · \(money(Balance.clerkWage)) a day").font(.subheadline.weight(.medium))
                    Text("Keeps the store open \(GameStore.clock(Balance.storeOpen)) – \(GameStore.clock(Balance.storeClose)) on each open day. Paid only on open days. A clerk sells at your price, a bit less often than you do. The clerk does not haggle, trade, or sell a second item. The clerk buys only through the buylist.")
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                }
            }
            .tint(Theme.cyan)
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
                    .buttonStyle(.borderedProminent)
                    .foregroundStyle(.black)
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
                        Text(f.detail).font(.caption).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    if owned {
                        Tag(text: "OWNED", color: Theme.green)
                    } else {
                        Button(money(f.cost)) { store.buyFixture(f) }
                            .buttonStyle(.borderedProminent)
                            .foregroundStyle(.black)
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
                Text("Rent \(money(s.location.rent))").font(.subheadline)
                Spacer()
                if let days = store.daysUntilStoreRent {
                    Text("due in \(days) day\(days == 1 ? "" : "s")")
                        .font(.subheadline.monospaced())
                        .foregroundStyle(days <= Balance.rentWarningDays ? Theme.orange : Theme.muted)
                }
            }
            Text("Deposit \(money(s.deposit)) · signed on day \(s.leaseDay + 1). If you miss a rent, the landlord locks the store, keeps the deposit, and word gets around.")
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
        let items = store.showItems(store.stockable)
        let stock = store.storeStock
        let cardRoom = max(0, store.storeCardSlots - stock.cards.count)
        let sealedRoom = max(0, store.storeSealedSlots - stock.sealed.count)
        let pickedCards = items.filter { $0.kind == .card && picked.contains($0.id) }.count
        let pickedSealed = items.filter { $0.kind == .sealed && picked.contains($0.id) }.count
        let fits = min(pickedCards, cardRoom) + min(pickedSealed, sealedRoom)
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Room for \(cardRoom) card\(cardRoom == 1 ? "" : "s") and \(sealedRoom) sealed item\(sealedRoom == 1 ? "" : "s"). Kept items, listed items, and known fakes stay home.")
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                        if pickedCards > cardRoom || pickedSealed > sealedRoom {
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
                        if !cards.isEmpty {
                            TitledGroup(title: "Singles and slabs", count: cards.count, list: "stock") {
                                ForEach(cards) { pickRow($0) }
                            }
                        }
                        ForEach(SetLibrary.grouped(items.filter { $0.kind == .sealed }, by: { $0.setSlug }), id: \.slug) { group in
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
                .buttonStyle(.borderedProminent)
                .foregroundStyle(.black)
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
