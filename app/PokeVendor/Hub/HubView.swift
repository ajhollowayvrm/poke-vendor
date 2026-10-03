import SwiftUI

/// The home hub: the summary of the whole game and the fastest way to anywhere (docs/08-ui-direction.md).
struct HubView: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav
    @State private var haul: CampHaul?
    @State private var streamSetup: StreamSetupRequest?
    @State private var meetupMessage: String?

    /// Opens the stream setup, for a new stream or for today's scheduled one.
    struct StreamSetupRequest: Identifiable {
        let id = UUID()
        var plan: StreamPlan?
    }

    var body: some View {
        @Bindable var nav = nav
        NavigationStack(path: $nav.path) {
            ScrollView {
                VStack(spacing: 12) {
                    dayHeader
                    alerts
                    tiles
                    todayCard
                    freeActions
                    timeActions
                    offersBox
                    BestOfferBox()
                    LotsBox()
                    recentActivity
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .background(Theme.background.ignoresSafeArea())
            .safeAreaInset(edge: .bottom) { endDayBar }
            .navigationTitle("PokeVendor")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { nav.path.append(.settings) } label: { Image(systemName: "gearshape") }
                        .accessibilityLabel("Settings")
                }
            }
            .appDestinations()
        }
        .tint(Theme.cyan)
        .saleReceipts(active: store.report == nil && haul == nil && streamSetup == nil)
        .fullScreenCover(item: $nav.rip) { session in
            RipView(items: session.items, store: store) { nav.rip = nil }
        }
        .fullScreenCover(item: $nav.showDay) { session in
            ShowDayView(show: session.show, store: store) { nav.showDay = nil }
                .saleReceipts()
        }
        .fullScreenCover(item: $nav.encounter) { encounter in
            ShowDayView(session: encounter.session) { nav.encounter = nil }
                .saleReceipts()
        }
        .fullScreenCover(item: $nav.stream) { cover in
            StreamView(session: cover.session) { nav.stream = nil }
        }
        .sheet(item: $streamSetup) { request in
            StreamSetupView(plan: request.plan)
        }
        .fullScreenCover(item: $nav.storeRun) { session in
            StoreRunView(stops: session.stops) { nav.storeRun = nil }
                .saleReceipts()
        }
        .sheet(item: Binding(get: { store.report }, set: { store.report = $0 })) { report in
            DayReportView(report: report)
                .presentationDetents([.medium, .large])
        }
        .sheet(item: $haul) { haul in
            CampView(haul: haul)
                .presentationDetents([.medium, .large])
        }
        .fullScreenCover(isPresented: Binding(get: { store.data.gameOver != nil }, set: { _ in })) {
            GameOverView()
        }
        .onAppear {
            #if DEBUG
            runDemo()
            #endif
        }
    }

    // MARK: - Pieces

    private var dayHeader: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(store.weekdayName) · Week \(store.week)").font(.title3.bold())
                Text("Day \(store.day + 1)").font(.caption.monospaced()).foregroundStyle(Theme.muted)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(GameStore.clock(store.data.hour)).font(.title3.monospaced().weight(.semibold))
                Text("\(formatHours(store.hoursLeft)) free today").font(.caption.monospaced()).foregroundStyle(Theme.muted)
            }
        }
        .padding(.top, 8)
    }

    @ViewBuilder private var alerts: some View {
        // The late-night choice waits here too, in case the morning report is gone (a relaunch).
        if store.data.lateHours > 0, store.report == nil {
            DetailBox(title: "You were up until \(GameStore.clock(Balance.dayEnd + store.data.lateHours))") {
                Text("Start tired, or sleep in. Nothing else happens until you choose.").font(.caption).foregroundStyle(Theme.muted)
                HStack(spacing: 8) {
                    Button("Start tired") { store.chooseMorning(sleepIn: false) }
                        .buttonStyle(.bordered)
                        .tint(Theme.orange)
                    Button("Sleep in until \(GameStore.clock(Balance.dayStart + store.data.lateHours))") { store.chooseMorning(sleepIn: true) }
                        .buttonStyle(.borderedProminent)
                        .foregroundStyle(.black)
                }
                .controlSize(.regular)
            }
            .overlay(Rectangle().stroke(Theme.orange.opacity(0.6)))
        }
        if store.daysUntilRent <= Balance.rentWarningDays {
            Banner(text: "Rent of \(money(Balance.rent)) is due in \(store.daysUntilRent) day\(store.daysUntilRent == 1 ? "" : "s"). You have \(money(store.cash)).",
                   color: store.canAfford(Balance.rent) ? Theme.cyan : Theme.orange)
        }
        if let shop = store.cardStore, let days = store.daysUntilStoreRent, days <= Balance.rentWarningDays {
            Button { nav.path.append(.cardStore) } label: {
                Banner(text: "Store rent of \(money(shop.rent)) for \(shop.name) is due in \(days) day\(days == 1 ? "" : "s").",
                       color: store.canAfford(Balance.rent + shop.rent) ? Theme.cyan : Theme.orange, icon: "storefront")
            }
            .buttonStyle(.plain)
        }
        if store.isPokemonCenterDropLive && !store.data.pokemonCenterAttempted {
            Button { nav.path.append(.store(.pokemonCenter)) } label: {
                Banner(text: "A Pokemon Center drop is live today. You get one attempt.", color: Theme.green)
            }
            .buttonStyle(.plain)
        }
        if store.hasUpgrade(.dropDiscord), store.isPokemonCenterDropLive(day: store.day + 1) {
            Banner(text: "Discord: a Pokemon Center drop is set for tomorrow.", color: Theme.cyan)
        }
        // Surprise opportunities: the alert banner (docs/08-ui-direction.md, tap target 5).
        ForEach(store.activeOpportunities) { o in
            Button { nav.path.append(.opportunity(o.id)) } label: {
                Banner(text: "\(o.title)\(o.day > store.day ? " · tomorrow" : " · today")\(o.hours > 0 ? " · \(formatHours(o.hours))" : ""). Tap to answer.",
                       color: Theme.orange, icon: o.kind.icon)
            }
            .buttonStyle(.plain)
        }
    }

    /// Sales and restocks today (docs/17-calendar-and-events.md, Posted entries; docs/12, Camp a store drop).
    @ViewBuilder private var eventRows: some View {
        ForEach(store.meetupsToday) { m in
            let fits = store.slot(for: Balance.facebookPickupHours) != nil
            Button { meetupMessage = store.doMeetup(m.id) } label: {
                PlanRow(icon: m.isPickup ? "shippingbox" : "figure.wave",
                        title: m.isPickup ? "Pick up \(m.name)" : "Meet \(m.who) for the \(m.name)",
                        detail: fits ? "\(m.isPickup ? "Paid" : money(m.price) + " cash") · 1 hour · Facebook Marketplace" : "No free hour left today",
                        accent: fits)
            }
            .buttonStyle(.plain)
            .disabled(!fits)
        }
        if let meetupMessage {
            Text(meetupMessage).font(.caption).foregroundStyle(Theme.cyan)
        }
        ForEach(store.salesToday) { sale in
            let block = store.saleBlock(sale)
            Button {
                if let session = store.startSale(sale) { nav.encounter = EncounterSession(session: session) }
            } label: {
                PlanRow(icon: sale.kind == .garage ? "house" : "house.and.flag", title: sale.name,
                        detail: block ?? "\(sale.hoursText) · \(formatHours(store.saleHours(sale)))\(sale.far ? " · far" : "") · early gets the best",
                        accent: block == nil)
            }
            .buttonStyle(.plain)
            .disabled(block != nil)
        }
        ForEach(store.restocksNow) { restock in
            let block = store.campBlock(restock.store)
            Button {
                if let result = store.camp(restock.store) { haul = result }
            } label: {
                PlanRow(icon: "cart.badge.clock", title: "Camp the \(restock.store.rawValue) restock",
                        detail: block ?? "Doors at \(GameStore.clock(Balance.campStart)) · \(formatHours(Balance.campHours)) · product at MSRP if you get in",
                        accent: block == nil)
            }
            .buttonStyle(.plain)
            .disabled(block != nil)
        }
        if store.salesToday.isEmpty, store.restocksNow.isEmpty, store.meetsToday.isEmpty, store.showToday == nil, store.meetupsToday.isEmpty {
            Text(nextEventText)
                .font(.caption2)
                .foregroundStyle(Theme.muted)
        }
    }

    private var nextEventText: String {
        if let sale = store.visibleSales.first(where: { $0.startDay > store.day }) {
            let days = sale.startDay - store.day
            return "Nothing today. Next: \(sale.name), \(days == 1 ? "tomorrow" : "in \(days) days")."
        }
        return "Nothing today. The calendar has the week."
    }

    private var tiles: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
            Tile(label: "Cash", value: money(store.cash), detail: "Wallet") { nav.path.append(.wallet) }
            Tile(label: "Collection", value: money(store.collectionValue),
                 detail: "Inventory \(money(store.marketValue))") { nav.path.append(.inventory(.sealed)) }
            Tile(label: "Followers", value: store.hasAccount ? store.social.followers.formatted() : "Start posting",
                 detail: store.hasAccount ? "Tier \(store.followerTier) · \(store.social.handle ?? "")" : "Social media") { nav.path.append(.social) }
            Tile(label: "Reputation", value: store.reputationName,
                 detail: store.pendingOffers.isEmpty ? "\(store.data.contacts.count) contacts" : "\(store.pendingOffers.count) new offer\(store.pendingOffers.count == 1 ? "" : "s")") {
                nav.path.append(.contacts)
            }
        }
    }

    private var todayCard: some View {
        DetailBox(title: "Today") {
            Button { nav.path.append(.job) } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        if let job = store.job {
                            Text(store.isWorkDay ? (store.dayOffReason ?? "Work 9 AM – 5 PM") : "Day off").font(.subheadline.weight(.medium))
                            Text("\(job.title) · payday Friday \(money(job.weeklyPay))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        } else {
                            Text("No job").font(.subheadline.weight(.medium)).foregroundStyle(Theme.orange)
                            Text("The job board is open").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        }
                    }
                    Spacer()
                    if let tired = store.tiredLabel { Tag(text: tired.uppercased(), color: Theme.orange) }
                    Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if store.isWorkDay, store.worksToday, store.data.hour < Balance.workStart {
                HStack(spacing: 8) {
                    Button("Call in sick (\(store.data.sickDaysLeft))") { store.callInSick() }
                        .buttonStyle(.bordered)
                        .disabled(store.data.sickDaysLeft == 0)
                    Button("Skip work") { _ = store.skipWork() }
                        .buttonStyle(.bordered)
                        .tint(Theme.orange)
                }
                .controlSize(.small)
            }
            Divider().overlay(Theme.line)
            HStack {
                Text("Rent \(money(Balance.rent))").font(.subheadline)
                Spacer()
                Text("due in \(store.daysUntilRent) day\(store.daysUntilRent == 1 ? "" : "s")")
                    .font(.subheadline.monospaced())
                    .foregroundStyle(store.daysUntilRent <= Balance.rentWarningDays ? Theme.orange : Theme.muted)
            }
            Divider().overlay(Theme.line)
            Button { nav.path.append(.cardStore) } label: {
                HStack {
                    Image(systemName: "storefront").foregroundStyle(Theme.cyan)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(store.cardStore?.name ?? "Open your own store").font(.subheadline)
                        Text(storeDetail).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Divider().overlay(Theme.line)
            Button { nav.path.append(.upgrades) } label: {
                HStack {
                    Image(systemName: "wrench.and.screwdriver").foregroundStyle(Theme.cyan)
                    Text("Upgrades").font(.subheadline)
                    Spacer()
                    Text("\(ownedUpgrades) owned").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                    Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private var storeDetail: String {
        guard let s = store.cardStore else {
            let ready = store.storeRequirements.filter(\.met).count
            return "\(ready) of \(store.storeRequirements.count) ready · a lease, a clerk, walk-ins"
        }
        if store.day < s.openDay { return "Building · opens day \(s.openDay + 1)" }
        let stock = store.storeStock
        return "\(store.storeOpenToday ? "Open today" : "Closed today")\(s.clerk ? " · clerk" : "") · \(stock.cards.count + stock.sealed.count) items · rent in \(store.daysUntilStoreRent ?? 0) d"
    }

    private var ownedUpgrades: Int {
        store.data.upgrades.count + (store.data.vendorKit ? 1 : 0) + store.data.centeringTool + (store.social.analytics ? 1 : 0)
    }

    /// Facebook Marketplace offers that wait for an answer (docs/15-selling.md, Facebook Marketplace).
    @ViewBuilder private var offersBox: some View {
        let offers = store.pendingFBOffers
        if !offers.isEmpty {
            DetailBox(title: "Offers on Facebook Marketplace") {
                ForEach(offers) { o in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(o.itemName).font(.subheadline.weight(.semibold)).lineLimit(1)
                            Spacer()
                            Text(money(o.offer)).font(.subheadline.monospaced()).foregroundStyle(Theme.green)
                        }
                        Text("\(o.buyer) offers \(Int(o.offer / max(o.listPrice, 0.01) * 100))% of your \(money(o.listPrice)). Meetup \(o.meetupDay == store.day ? "today" : "on day \(o.meetupDay + 1)") · 1 hour · cash.")
                            .font(.caption).foregroundStyle(Theme.muted)
                        HStack {
                            Button("Accept") { store.acceptFBOffer(o.id) }.buttonStyle(.borderedProminent).foregroundStyle(.black)
                            Button("Decline") { store.declineFBOffer(o.id) }.buttonStyle(.bordered)
                        }
                        .controlSize(.small)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }

    private var freeActions: some View {
        HStack(spacing: 8) {
            ActionTile(title: "Inventory", icon: "shippingbox") { nav.path.append(.inventory(.sealed)) }
            ActionTile(title: "Grade", icon: "seal") { nav.path.append(.inventory(.raw)) }
            ActionTile(title: "Buy", icon: "cart") { nav.path.append(.buy) }
            if store.hasAccount {
                ActionTile(title: "Post", icon: "square.and.pencil") { nav.path.append(.social) }
            } else {
                ActionTile(title: "Sell", icon: "tag") { nav.path.append(.inventory(.raw)) }
            }
        }
    }

    private var timeActions: some View {
        DetailBox(title: "Plans for today") {
            if let show = store.showToday {
                Button {
                    if store.canGoToShowToday, let started = store.startShowDay() {
                        nav.showDay = ShowDaySession(show: started)
                    } else {
                        nav.path.append(.show(show.id))
                    }
                } label: {
                    PlanRow(icon: "tablecells", title: "Card show today: \(show.name)",
                            detail: store.canGoToShowToday
                                ? (show.booked ? "Your table is booked · takes the rest of the day"
                                               : "Walk in for \(money(show.size.entryFee)) · takes the rest of the day")
                                : "Done for today", accent: store.canGoToShowToday)
                }
                .buttonStyle(.plain)
            }
            Button { nav.path.append(.calendar) } label: {
                PlanRow(icon: "calendar", title: "Calendar",
                        detail: store.upcomingShows.first(where: { $0.startDay > store.day }).map { next in
                            let days = next.startDay - store.day
                            return "Next show: \(next.name) · \(days == 1 ? "tomorrow" : "in \(days) days")\(next.booked ? " · booked" : "")"
                        } ?? "Shows, paydays, rent, and deliveries")
            }
            .buttonStyle(.plain)
            Button { nav.path.append(.buyLocal) } label: {
                HStack {
                    Image(systemName: "car").foregroundStyle(Theme.cyan)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Store run").font(.subheadline.weight(.medium))
                        Text("40 min per store · big stores and game shops").font(.caption).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if store.hasAccount {
                // Go Live (docs/08-ui-direction.md, tap target 8). Hidden until the player has an account.
                let plan = store.streamToday
                let block = store.streamBlock(hours: plan?.hours ?? Balance.streamHours[0])
                Button { streamSetup = StreamSetupRequest(plan: plan) } label: {
                    PlanRow(icon: "dot.radiowaves.left.and.right",
                            title: plan.map { "Scheduled stream at \(GameStore.clock($0.startHour))" } ?? "Go live",
                            detail: block ?? (plan.map { "\(formatHours($0.hours)) · followers are waiting" } ?? "2 or 3 hours · rip, sell, and talk to chat"),
                            accent: block == nil)
                }
                .buttonStyle(.plain)
                .disabled(block != nil)
            }
            if let shop = store.cardStore, store.storeOpenToday {
                let block = store.counterBlock
                Button {
                    if let session = store.startCounter() { nav.encounter = EncounterSession(session: session) }
                } label: {
                    PlanRow(icon: "storefront", title: "Work the counter at \(shop.name)",
                            detail: block ?? "\(GameStore.clock(store.counterStart)) – \(GameStore.clock(Balance.storeClose)) · walk-ins buy, trade, and sell",
                            accent: block == nil)
                }
                .buttonStyle(.plain)
                .disabled(block != nil)
            }
            ForEach(store.meetsToday, id: \.self) { kind in
                let block = store.meetBlock(kind)
                Button {
                    if let session = store.startMeet(kind) { nav.encounter = EncounterSession(session: session) }
                } label: {
                    PlanRow(icon: kind.icon,
                            title: kind == .leagueNight ? "League night at \(store.leagueShop(day: store.day).rawValue)" : "\(kind.label) tonight",
                            detail: block ?? "\(kind.hoursText) · \(kind.place) · \(formatHours(Balance.meetHours))",
                            accent: block == nil)
                }
                .buttonStyle(.plain)
                .disabled(block != nil)
            }
            eventRows
        }
    }

    private var recentActivity: some View {
        Button { nav.path.append(.activity) } label: {
            DetailBox(title: "Recent activity") {
                ForEach(store.data.activity.suffix(4).reversed()) { entry in
                    HStack(alignment: .top) {
                        Text("D\(entry.day + 1)").font(.caption.monospaced()).foregroundStyle(Theme.muted).frame(width: 34, alignment: .leading)
                        Text(entry.text).font(.caption).multilineTextAlignment(.leading)
                        Spacer(minLength: 0)
                    }
                }
                Text("See all").font(.caption.weight(.semibold)).foregroundStyle(Theme.cyan)
            }
        }
        .buttonStyle(.plain)
    }

    private var endDayBar: some View {
        Button {
            store.endDay()
        } label: {
            Text("End Day \(store.day + 1)")
                .font(.headline)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .foregroundStyle(.black)
        .controlSize(.large)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Theme.background)
    }

    #if DEBUG
    /// Test aid: `-soak <days>` plays that many days by itself and prints what happened. It touches every system,
    /// so a crash shows up in the console.
    private func soak(days: Int) {
        store.startRun()
        store.addTestCash(6000)
        store.testFollowers(1_200)
        store.data.vendorKit = true
        store.addReputation(400)
        store.testMakeRegular()
        for print in SetLibrary.set("prismatic-evolutions").prints.filter({ ($0.market ?? 0) > 10 }).prefix(6) { store.addTestCard(print) }
        for _ in 0..<4 { store.addTestPack() }
        store.addTestFake(.bootleg)
        store.addTestResealed()
        var log: [String] = []
        func play(_ session: ShowSession) {
            if session.phase == .setup { session.openTable() }
            var steps = 0
            // A player with a table walks the floor once, past a few vendors, and comes back.
            var floorVisits = 0
            while session.phase != .summary, steps < 80 {
                steps += 1
                if let v = session.current {
                    switch v.intent {
                    case .buy: session.accept()
                    case .trade: session.proposeTrade(valuing: 90)
                    case .sell:
                        if session.canPayCredit, Bool.random() { session.acceptWithCredit() }
                        else if v.naive { session.payFair() } else { session.counter(v.goodsMarket * 0.6) }
                    }
                } else if session.phase == .table {
                    if session.hasTable, floorVisits == 0, steps > 3 { session.walkFloor() } else { session.nextVisitor() }
                } else if session.phase == .floor {
                    if session.hasTable, floorVisits >= 4 {
                        session.backToTable()
                    } else if let vendor = session.vendors.first(where: { !$0.visited }) {
                        floorVisits += 1
                        session.visit(vendor)
                        if let item = vendor.items.first(where: { $0.price < 60 }) { session.buy(item, from: vendor) }
                        // A trade: the two best brought items for the dearest items that they pay for.
                        if vendor.kind.trades, let now = session.vendors.first(where: { $0.id == vendor.id }) {
                            let give = session.tradeStock.filter { $0.market >= Balance.tradeMinItem }.prefix(2)
                            let worth = give.reduce(0) { $0 + session.tradeValue($1, at: now) }
                            let goods = now.items.filter { if case .mystery = $0.goods { return false }; return true }.sorted { $0.price > $1.price }
                            var want: [VendorItem] = []
                            for item in goods where want.reduce(0, { $0 + $1.price }) + item.price <= worth { want.append(item) }
                            if want.isEmpty, let cheapest = goods.last { want = [cheapest] }
                            session.proposeVendorTrade(give: Set(give.map(\.id)), get: Set(want.map(\.id)), at: now)
                        }
                        session.closeVendor()
                    } else {
                        session.packUp()
                    }
                } else {
                    break
                }
            }
            store.finishEncounter(session)
            log.append("Encounter \(session.venue.name): \(session.sold.count) sold, \(session.bought.count) bought, \(session.trades.count) traded")
        }
        for _ in 0..<days {
            // The store: open on day 3, stock it every few days, work the counter, buy fixtures, and close near the end.
            // A one-period lease: an early close with a buyout, a second lease, and a renewal.
            if store.day == 3 { store.testOpenCardStore(.stripMall, term: 1); store.setClerk(true) }
            if store.day == 15 { store.closeStore() }
            if store.day == 18, store.cardStore == nil { store.testOpenCardStore(.stripMall, term: 1); store.setClerk(true) }
            if store.cardStore != nil {
                if store.day % 3 == 0 {
                    let pick = store.stockable
                    store.stockStore(Set(pick.cards.prefix(6).map(\.id) + pick.sealed.prefix(4).map(\.id)))
                }
                if store.day % 4 == 2, let s = store.startCounter() { play(s) }
                if store.day == 4 { store.setBuylist(rate: 0.5, budget: 250, offerCredit: true) }
                if store.day == 14 { store.setBuylist(rate: 0.6, budget: 100, offerCredit: false) }
                if store.day == 18 { store.setBuylist(rate: 0, budget: 250, offerCredit: false) }
                if store.day % 4 == 1 { store.moveBulkToBox(Set(store.movableBulk.prefix(3).map(\.id))) }
                if store.day == 16 { store.takeBulkBack() }
                // Prices and online listings: set each price, price a slab, list stock online, and remove a listing.
                if store.day % 5 == 1 {
                    store.setSinglesPrice(Balance.storePrices.randomElement() ?? 1)
                    store.setSealedPrice(Balance.storeSealedPrices.randomElement() ?? 1)
                    if let slab = store.storeStock.cards.first(where: { $0.grade != nil }) {
                        store.setSlabPrice(slab.id, Bool.random() ? Balance.storeSlabPrices.randomElement() : nil)
                    }
                }
                if store.day % 2 == 0 {
                    let stock = store.storeStock
                    let free = (stock.cards.filter { $0.onlineListing == nil }.prefix(3).map(\.id)
                        + stock.sealed.filter { $0.onlineListing == nil }.prefix(2).map(\.id))
                    let ids = Set(free)
                    let auction = Bool.random()
                    store.listOnline(ids, channel: auction ? .ebayAuction : .ebay, price: { _ in 5 },
                                     auctionDays: auction ? 3 : nil, insured: false)
                }
                if store.day % 7 == 0, let id = store.storeStock.sealed.first(where: { $0.onlineListing != nil })?.id {
                    store.removeOnlineListing(id)
                }
                if store.day == 10 { store.buyFixture(.playTables) }
                // The events: the tournament is on by default. Turn the league on, then change the fees and the league day.
                if store.day == 11 { store.setEvent(.league, on: true) }
                if store.day == 14 { store.setEventFee(.tournament, 15); store.setEventFee(.league, 2) }
                if store.day == 17 { store.setLeagueDay(6) }
                if store.day == 20 { store.setEvent(.tournament, on: false) }
                if store.day == 22 { store.setEvent(.tournament, on: true) }
                if store.day % 7 == 3, let id = store.storeStock.sealed.first(where: { $0.packs == 1 })?.id { store.takeBackFromStore([id]) }
                if store.day == 12 { store.toggleOpenDay(1) }
                if store.day % 9 == 0, let id = store.storeStock.cards.first?.id { store.takeBackFromStore([id]) }
                if store.day == days - 4 { store.closeStore() }
            }
            store.report = nil
            if store.data.lateHours > 0 { store.chooseMorning(sleepIn: Bool.random()) }
            for o in store.activeOpportunities where o.day == store.day {
                if case .encounter(let s) = store.acceptOpportunity(o.id) { play(s) }
            }
            for kind in store.meetsToday { if let s = store.startMeet(kind) { play(s) } }
            for sale in store.salesToday { if let s = store.startSale(sale) { play(s) } }
            for r in store.restocksNow {
                if store.worksToday { store.callInSick() }
                if let haul = store.camp(r.store) {
                    for item in haul.items { store.buyShelf(item, at: r.store, credit: false) }
                    log.append("Camp \(r.store.rawValue): \(haul.success ? "got in" : "sold out")")
                }
            }
            if let show = store.showToday, store.canGoToShowToday, let started = store.startShowDay() {
                play(ShowSession(show: started, store: store))
                _ = show
            } else if store.day % 5 == 0, let s = store.startStream(hours: 2, itemIDs: store.streamStock.prefix(3).map(\.id), scheduled: false) {
                for _ in 0..<130 { s.tick() }
                if let item = s.items.first { s.startAuction(item, startShare: 0.5) }
                for _ in 0..<20 { s.tick() }
                s.end()
                log.append("Stream: \(s.peakViewers) peak, \(money(s.tips)) tips")
            }
            for m in store.meetupsToday { _ = store.doMeetup(m.id) }
            for o in store.pendingFBOffers { store.acceptFBOffer(o.id) }
            if store.day % 3 == 0, let card = store.data.raw.first(where: { $0.status == nil && !$0.keep }) {
                store.list([card.id], channel: [.tcgplayer, .ebay, .facebook].randomElement() ?? .ebay, price: { _ in card.realMarket }, auctionDays: nil, insured: false)
            }
            if store.day % 4 == 0, let card = store.data.raw.first(where: { $0.status == nil && !$0.keep }) { store.authenticate([card.id]) }
            if store.day % 7 == 1, let card = store.data.raw.first(where: { $0.status == nil && !$0.keep }) { store.consign([card.id], at: .castle, percent: 110) }
            for split in store.openSplits where split.mine == 0 { _ = store.joinSplit(split.id, boxes: 1) }
            if let offer = store.wholesaleOffers.first, store.canAfford(offer.casePrice) { _ = store.buyWholesale(offer, cases: 1) }
            // A store account cannot go over its allocation.
            if store.hasStoreAccount, let offer = store.wholesaleOffers.first {
                if let msg = store.buyWholesale(offer, cases: 99) { log.append("Wholesale 99 cases: \(msg)") }
            }
            if store.data.sealed.contains(where: { $0.status == nil && !$0.keep }) {
                let items = Array(store.data.sealed.filter { $0.status == nil && !$0.keep }.prefix(2))
                let model = RipModel(items: items, store: store)
                model.mode = .sift
                var guardCount = 0
                while model.phase != .done || model.hasNextPack, guardCount < 40 {
                    guardCount += 1
                    if model.phase == .done { model.nextPack() } else { _ = model.sift(); model.resume() }
                }
            }
            if store.data.day % 6 == 0 { store.post(.hotTake, subject: nil, value: 0) }
            if store.day % 9 == 0 { _ = store.apply(min(Job.ladder.count - 1, (store.data.jobIndex ?? 0) + 1)) }
            if store.day % 11 == 0 { store.bookTimeOff(store.day + 2) }
            if store.day % 13 == 5 { _ = store.skipWork() }
            // A late night every 8 days: the hours past 11 PM come out of sleep.
            if store.day % 8 == 3 { store.data.hour = max(store.data.hour, Balance.dayEnd + 2) }
            store.endDay()
        }
        print("SOAK STORE: \(store.cardStore?.name ?? "closed"), \(store.lifetimeSales.rounded()) lifetime sales, credit owed \(money(store.storeCreditOwed)), bulk box \(store.cardStore?.source.bulkCards ?? 0)")
        if let plan = store.cardStore?.eventPlan { print("SOAK EVENTS: standing \(plan.standing), afterglow \(plan.afterglowPlayers) on day \(plan.afterglowDay + 1)") }
        let overheadPaid = store.data.ledger.filter { $0.category == .storeOverhead }.reduce(0) { $0 - $1.amount }
        print("SOAK LEASE: end day \(store.cardStore?.lease.map { $0.endDay + 1 } ?? 0), overhead paid \(money(overheadPaid)), castle \(store.shop(.castle).points), top deck \(store.shop(.topDeck).points), distributor \(money(store.distributorSpent))")
        print("SOAK OK: day \(store.day + 1), cash \(money(store.cash)), rep \(store.data.reputation), followers \(store.social.followers), items \(store.data.raw.count + store.data.slabs.count + store.data.sealed.count)")
        for line in log.suffix(12) { print("SOAK", line) }
        for line in store.data.activity.suffix(30) { print("SOAK D\(line.day + 1)", line.text) }
        // The console is a pipe, so stdout is buffered. Push the report out now.
        fflush(stdout)
    }

    /// Screenshot aid: `-demo` rips a pack at launch.
    private func runDemo() {
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-soak"), i + 1 < args.count, let days = Int(args[i + 1]) {
            soak(days: days)
            return
        }
        // Screenshot aid: `-regular` makes every contact Regular first.
        if args.contains("-regular") { store.testMakeRegular() }
        if let i = args.firstIndex(of: "-route"), i + 1 < args.count {
            switch args[i + 1] {
            case "wallet": nav.path = [.wallet]
            case "buy": nav.path = [.buy]
            case "amazon": nav.path = [.buy, .store(.amazon)]
            case "ebay": nav.path = [.buy, .store(.ebay)]
            case "shop": nav.path = [.shop(.castle)]
            case "local": nav.path = [.buyLocal]
            case "raw": nav.path = [.inventory(.raw)]
            case "card": nav.path = [.inventory(.raw)] + (store.data.raw.first.map { [.card($0.id)] } ?? [])
            case "slabs": nav.path = [.inventory(.slabs)]
            case "activity": nav.path = [.activity]
            case "calendar": nav.path = [.calendar]
            case "contacts": nav.path = [.contacts]
            case "nextshow": nav.path = [.calendar] + (store.upcomingShows.first(where: { $0.startDay > store.day }).map { [.show($0.id)] } ?? [])
            case "sealed": nav.path = [.inventory(.sealed)]
            case "settings": nav.path = [.settings]
            case "job": nav.path = [.job]
            case "upgrades": nav.path = [.upgrades]
            case "cardstore": nav.path = [.cardStore]
            case "wholesale": store.addReputation(400); nav.path = [.buy, .wholesale]
            case "splits": store.addReputation(400); store.testSplitInvite(); nav.path = [.buy, .caseSplits]
            default: break
            }
        }
        // Screenshot aid: `-cardstore` opens a stocked store with a clerk. `-route cardstore` opens its screen.
        if args.contains("-cardstore") {
            store.startRun()
            store.addTestCash(3000)
            store.testOpenCardStore()
            store.setClerk(true)
            for print in SetLibrary.set("prismatic-evolutions").prints.filter({ ($0.market ?? 0) > 5 }).prefix(8) { store.addTestCard(print) }
            for _ in 0..<6 { store.addTestPack() }
            store.addTestProduct("576482")
            let pick = store.stockable
            store.stockStore(Set(pick.cards.map(\.id) + pick.sealed.map(\.id)))
            if args.contains("-week") {
                for _ in 0..<7 { store.endDay() }
                store.report = nil
            }
        }
        if args.contains("-sim") {
            store.startRun()
            store.addTestCash(2000)
            for offer in Market.offers(for: .reseller, day: 0).prefix(2) { _ = store.buy(offer) }
            let hits = SetLibrary.set("prismatic-evolutions").prints.filter { ($0.market ?? 0) > 20 }.shuffled().prefix(5)
            for print in hits { store.addTestCard(print) }
            let ids = store.data.raw.map(\.id)
            store.list(Set(ids.prefix(2)), channel: .tcgplayer, price: { id in GameStore.tcgLowest(for: store.card(id)!.print) }, auctionDays: nil, insured: false)
            store.list(Set(ids.dropFirst(2).prefix(1)), channel: .ebayAuction, price: { id in store.card(id)!.market }, auctionDays: 3, insured: true)
            store.submit(Set(ids.suffix(2)), to: .cgc, tier: Balance.gradingTiers[.cgc]![2])
            for _ in 0..<12 { store.endDay() }
            store.report = nil
        }
        if args.contains("-run") {
            store.startRun()
            for print in SetLibrary.set("prismatic-evolutions").prints.filter({ ($0.market ?? 0) > 10 }).prefix(2) { store.addTestCard(print) }
            // Find a day when the first game shop has stock.
            while Market.shelf(.castle, day: store.day).isEmpty { store.endDay() }
            store.report = nil
            if store.worksToday { store.callInSick() }
            if store.startStoreRun([.castle, .target]) { nav.storeRun = StoreRunSession(stops: [.castle, .target]) }
        }
        if args.contains("-social") {
            store.startRun()
            store.createAccount("ajrips")
            store.data.social.followers = 1_150
            store.buyAnalytics()
            let prints = SetLibrary.set("prismatic-evolutions").prints.filter { ($0.market ?? 0) > 15 }.shuffled()
            for print in prints.prefix(3) { store.addTestCard(print) }
            for day in 0..<10 {
                if let card = store.data.raw.first, day == 0 {
                    store.post(.forSale, subject: card.print.name, value: card.market, saleCardID: card.id, salePrice: card.market)
                }
                if day % 2 == 0, let card = store.data.raw.last {
                    store.post(.pullReveal, subject: card.print.name, value: card.market)
                } else {
                    store.post(.hotTake, subject: nil, value: 0)
                }
                if let offer = store.social.offers.first(where: { !$0.accepted }) { store.acceptOffer(offer.id) }
                if store.activeDeal != nil { store.post(.sponsored, subject: nil, value: 0) }
                store.endDay()
            }
            store.report = nil
            nav.path = [.social]
        }
        if args.contains("-bulk") {
            store.startRun()
            for print in SetLibrary.set("prismatic-evolutions").prints.filter({ ($0.market ?? 0) > 1 }).prefix(3) { store.addTestCard(print) }
            store.moveToBulk(Set(store.data.raw.prefix(2).map(\.id)))
            nav.path = [.inventory(.bulk)]
        }
        if args.contains("-stack") {
            store.startRun()
            for _ in 0..<3 { store.addTestPack() }
            store.addTestProduct("576482")
            if let print = SetLibrary.set("prismatic-evolutions").prints.first(where: { ($0.market ?? 0) > 5 }) {
                store.addTestCard(print)
                store.addTestCard(print)
            }
            nav.path = [.inventory(args.contains("raw") ? .raw : .sealed)]
            if args.contains("-autosell"), let pack = store.data.sealed.first(where: { $0.packs == 1 }) {
                nav.path.append(.sealed(pack.id))
            }
        }
        // Screenshot aid: `-show local` or `-show regional` opens a booked show today. `open` opens the table.
        if let i = args.firstIndex(of: "-show"), i + 1 < args.count {
            store.addTestShow(args[i + 1] == "regional" ? .regional : .local)
            if store.showStock.sealed.count < 3 {
                for id in ["593294", "593294", "593355", "593466", "565638"] { store.addTestProduct(id) }
            }
            if let show = store.startShowDay() { nav.showDay = ShowDaySession(show: show) }
        }
        if let i = args.firstIndex(of: "-rip"), i + 1 < args.count {
            store.startRun()
            if let item = store.addTestProduct(args[i + 1]) { nav.startRip([item]) }
        }
        if args.contains("-coll") {
            store.startRun()
            store.addTestProduct("576482")
            if let item = store.data.sealed.first { nav.path = [.sealed(item.id)] }
        }
        if args.contains("-collrip") {
            store.startRun()
            store.addTestProduct("576482")
            nav.startRip(store.data.sealed)
        }
        if args.contains("-demo") && !args.contains("-collrip") {
            if let i = args.firstIndex(of: "-set"), i + 1 < args.count {
                store.startRun()
                store.addTestPack(slug: args[i + 1])
            }
            if store.data.sealed.filter({ $0.status == nil }).isEmpty { store.addTestPack() }
            nav.startRip(Array(store.data.sealed.filter { $0.status == nil }.prefix(1)))
        }
    }
    #endif
}

func formatHours(_ h: Double) -> String {
    let m = Int((h * 60).rounded())
    return m % 60 == 0 ? "\(m / 60)h" : "\(m / 60)h \(m % 60)m"
}

struct Banner: View {
    let text: String
    let color: Color
    var icon = "exclamationmark.circle.fill"

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
            Text(text).font(.subheadline).multilineTextAlignment(.leading)
            Spacer(minLength: 0)
        }
        .foregroundStyle(color)
        .padding(12)
        .background(color.opacity(0.12))
        .overlay(Rectangle().stroke(color.opacity(0.5)))
    }
}

struct Tile: View {
    let label: String
    let value: String
    let detail: String
    let action: (() -> Void)?

    var body: some View {
        Button { action?() } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(label.uppercased())
                    .font(.system(size: 10, weight: .semibold))
                    .kerning(0.8)
                    .foregroundStyle(Theme.muted)
                Text(value)
                    .font(.system(size: 18, weight: .semibold, design: .monospaced))
                    .foregroundStyle(action == nil ? Theme.muted : Theme.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(detail).font(.caption2).foregroundStyle(Theme.muted).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Theme.surface)
            .overlay(Rectangle().stroke(Theme.line))
        }
        .buttonStyle(.plain)
        .disabled(action == nil)
    }
}

struct ActionTile: View {
    let title: String
    let icon: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon).font(.title3)
                Text(title).font(.caption.weight(.semibold))
            }
            .frame(maxWidth: .infinity, minHeight: 64)
            .background(Theme.surface)
            .overlay(Rectangle().stroke(Theme.line))
        }
        .buttonStyle(.plain)
        .foregroundStyle(Theme.cyan)
    }
}

struct DayReportView: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let report: DayReport

    var body: some View {
        let late = store.data.lateHours
        VStack(alignment: .leading, spacing: 14) {
            Text("Good morning. Day \(report.day + 1)").font(.title2.bold())
            if late > 0 {
                // The late-night choice (docs/16-time-and-day.md, Late nights).
                DetailBox(title: "You were up until \(GameStore.clock(Balance.dayEnd + late))") {
                    Text(late >= Balance.exhaustedFrom
                         ? "Start at 7 AM exhausted: haggling and your eye are \(Int(Balance.exhaustedPenalty * 100))% worse today."
                         : "Start at 7 AM tired: haggling and your eye are \(Int(Balance.tiredPenalty * 100))% worse today.")
                        .font(.caption).foregroundStyle(Theme.muted)
                    HStack(spacing: 8) {
                        Button("Start tired") { store.chooseMorning(sleepIn: false) }
                            .buttonStyle(.bordered)
                            .tint(Theme.orange)
                        Button("Sleep in until \(GameStore.clock(Balance.dayStart + late))") { store.chooseMorning(sleepIn: true) }
                            .buttonStyle(.borderedProminent)
                            .foregroundStyle(.black)
                    }
                    .controlSize(.regular)
                }
            }
            if report.lines.isEmpty {
                Text("Nothing happened overnight.").foregroundStyle(Theme.muted)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(report.lines, id: \.self) { line in
                        HStack(alignment: .top, spacing: 8) {
                            Circle().fill(Theme.cyan).frame(width: 6, height: 6).padding(.top, 7)
                            Text(line).font(.subheadline)
                        }
                    }
                }
            }
            Button { dismiss() } label: {
                Text(late > 0 ? "Choose first" : "Start the day").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .foregroundStyle(.black)
            .controlSize(.large)
            .disabled(late > 0)
        }
        .padding(20)
        .background(Theme.surface.ignoresSafeArea())
        .interactiveDismissDisabled(late > 0)
    }
}

struct GameOverView: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Text("Game over").font(.largeTitle.bold())
            Text(store.data.gameOver ?? "").multilineTextAlignment(.center).foregroundStyle(Theme.muted)
            DetailBox(title: "Your run") {
                HStack(spacing: 0) {
                    StatCell(label: "Days", value: "\(store.day + 1)")
                    StatCell(label: "Inventory", value: money(store.marketValue))
                    StatCell(label: "Collection", value: money(store.collectionValue))
                }
            }
            Spacer()
            Button { store.startRun() } label: {
                Text("Start a new run").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .foregroundStyle(.black)
            .controlSize(.large)
        }
        .padding(24)
        .background(Theme.background.ignoresSafeArea())
    }
}

/// One row in Plans for today.
private struct PlanRow: View {
    let icon: String
    let title: String
    let detail: String
    var accent = false

    var body: some View {
        HStack {
            Image(systemName: icon).foregroundStyle(Theme.cyan)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.medium)).foregroundStyle(accent ? Theme.cyan : Theme.text)
                Text(detail).font(.caption).foregroundStyle(Theme.muted)
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
        }
        .contentShape(Rectangle())
    }
}
