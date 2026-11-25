import SwiftUI

/// The home hub: the summary of the whole game and the fastest way to anywhere (docs/08-ui-direction.md).
struct HubView: View {
    @Environment(GameStore.self) var store
    @Environment(AppNav.self) var nav
    @State private var haul: CampHaul?
    @State private var streamSetup: StreamSetupRequest?
    @State private var meetupMessage: String?
    /// The meet the player tapped. A dialog asks: deal at a spot, or only browse.
    @State private var meetChoice: MeetKind?
    @State private var confirmLockUp = false

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
                    marketAndGoals
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
            RipView(items: session.items, store: store, hitsOnly: session.hitsOnly, recording: session.recording) { nav.rip = nil }
        }
        .fullScreenCover(item: $nav.showDay) { session in
            ShowDayView(show: session.show, store: store) { nav.showDay = nil }
                .saleReceipts()
        }
        .onAppear {
            // After a quit during a visit, the app opens the visit again, once (docs/40-resume-events.md).
            guard !nav.launchResumeDone else { return }
            nav.launchResumeDone = true
            if let event = store.activeEvent, nav.encounter == nil, nav.showDay == nil {
                nav.encounter = EncounterSession(session: event)
            }
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
            StoreRunView(stops: session.stops, startHour: session.startHour) { nav.storeRun = nil }
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
        .fullScreenCover(isPresented: Binding(get: { store.madeIt != nil && store.report == nil }, set: { _ in })) {
            if let route = store.madeIt { MadeItView(route: route) }
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
                Text("\(store.weekdayName), \(store.date.text)").font(.title3.bold())
                Text("Day \(store.day + 1) · Week \(store.week)").font(.caption.monospaced()).foregroundStyle(Theme.muted)
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
            LateNightChoice(lateHours: store.data.lateHours,
                            message: "Start tired, or sleep in. Nothing else happens until you choose.")
                .overlay(Rectangle().stroke(Theme.orange.opacity(0.6)))
        }
        if store.daysUntilRent <= Balance.rentWarningDays {
            Banner(text: "Rent of \(money(store.rentNow)) is due in \(store.daysUntilRent) day\(store.daysUntilRent == 1 ? "" : "s"). You have \(money(store.cash)).",
                   color: store.canAfford(store.rentNow) ? Theme.cyan : Theme.orange)
        }
        if let shop = store.cardStore, let days = store.daysUntilStoreRent, days <= Balance.rentWarningDays {
            Button { nav.path.append(.cardStore) } label: {
                Banner(text: "Store rent of \(money(shop.rent)) for \(shop.name) is due in \(days) day\(days == 1 ? "" : "s").",
                       color: store.canAfford(store.rentNow + shop.rent) ? Theme.cyan : Theme.orange, icon: "storefront")
            }
            .buttonStyle(.plain)
        }
        ForEach(store.taxWarnings, id: \.self) { warning in
            Button { nav.path.append(.wallet) } label: {
                Banner(text: warning.text, color: warning.affordable ? Theme.cyan : Theme.orange, icon: "doc.text")
            }
            .buttonStyle(.plain)
        }
        ForEach(store.debtWarnings, id: \.self) { warning in
            Button { nav.path.append(.loans) } label: {
                Banner(text: warning.text, color: warning.affordable ? Theme.cyan : Theme.orange, icon: "creditcard")
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
        // Rip & Ship orders that wait for a label. Orange when one is late.
        let toShip = store.ordersToShip
        if !toShip.isEmpty {
            let late = toShip.contains { store.day > store.shipByDay($0) }
            Button { nav.path.append(.shipQueue) } label: {
                Banner(text: "\(toShip.count) Rip & Ship order\(toShip.count == 1 ? "" : "s") to ship\(late ? ". One is late." : ".")",
                       color: late ? Theme.orange : Theme.cyan, icon: "shippingbox")
            }
            .buttonStyle(.plain)
        }
        // Messages about cards (docs/28-messages-and-encounters.md).
        if store.unreadMessages > 0 {
            Button { nav.path.append(.messages) } label: {
                Banner(text: "\(store.unreadMessages) new message\(store.unreadMessages == 1 ? "" : "s") about cards. Tap to read.",
                       color: Theme.green, icon: "bubble.left.and.text.bubble.right")
            }
            .buttonStyle(.plain)
        }
        // A callout that the player has not answered. One banner at most.
        let unanswered = store.openCallouts.filter { !$0.acknowledged }
        if let c = unanswered.first {
            Button { nav.path.append(.callouts) } label: {
                Banner(text: "\(store.name(of: c.accuser)) called you out. Heat \(Int(c.heat)). Tap to answer.\(unanswered.count > 1 ? " (\(unanswered.count) open)" : "")",
                       color: Theme.orange, icon: "megaphone")
            }
            .buttonStyle(.plain)
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
                ChevronRow(icon: m.isPickup ? "shippingbox" : "figure.wave",
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
                ChevronRow(icon: sale.kind == .garage ? "house" : "house.and.flag", title: sale.name,
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
                ChevronRow(icon: "cart.badge.clock", title: "Camp the \(restock.store.rawValue) restock",
                        detail: block ?? "Doors at \(GameStore.clock(Balance.campStart)) · \(formatHours(Balance.campHours)) · product at MSRP if you get in",
                        accent: block == nil)
            }
            .buttonStyle(.plain)
            .disabled(block != nil)
        }
        ForEach(store.machineRestocksNow) { restock in
            let block = store.machineCampBlock(restock)
            Button {
                if let result = store.campMachine(restock) { haul = result }
            } label: {
                ChevronRow(icon: "square.grid.3x3", title: "Wait at the \(restock.machine.rawValue.lowercased())",
                        detail: block ?? "About \(GameStore.clock(restock.hour)) · \(formatHours(Balance.machineCampHours)) · limit \(Balance.machineLimit) of each",
                        accent: block == nil)
            }
            .buttonStyle(.plain)
            .disabled(block != nil)
        }
        ForEach(store.data.retail.drawingWins) { win in
            let name = SetLibrary.product(win.productID)?.name ?? "a product"
            Button {
                store.claimDrawingWin(win.id)
            } label: {
                ChevronRow(icon: "ticket", title: "Claim your drawing win: \(name)",
                           detail: "Pay \(money(win.price)) · until \(GameCalendar.date(win.claimUntil).text)",
                           accent: store.canAfford(win.price))
            }
            .buttonStyle(.plain)
            .disabled(!store.canAfford(win.price))
        }
        if store.salesToday.isEmpty, store.restocksNow.isEmpty, store.machineRestocksNow.isEmpty, store.meetsToday.isEmpty, store.showToday == nil, store.meetupsToday.isEmpty,
           store.data.retail.drawingWins.isEmpty {
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
            Tile(label: "Cash", value: money(store.personalCash),
                 detail: store.hasBusinessAccount ? "Business \(money(store.businessCash))" : "Wallet") { nav.path.append(.wallet) }
            Tile(label: "Collection", value: money(store.collectionValue),
                 detail: "Inventory \(money(store.marketValue))") { nav.path.append(.inventory(.sealed)) }
            Tile(label: "Followers", value: store.hasAccount ? store.social.followers.formatted() : "Start posting",
                 detail: store.hasAccount ? "Tier \(store.followerTier) · \(store.social.handle ?? "")" : "Social media") { nav.path.append(.social) }
            Tile(label: "Reputation", value: store.reputationName,
                 detail: !store.activeRecords.isEmpty ? "Busted thread · \(max(0, (store.activeRecords.map(\.untilDay).max() ?? store.day) - store.day + 1)) days"
                     : store.pendingOffers.isEmpty ? "\(store.data.contacts.count) contacts" : "\(store.pendingOffers.count) new offer\(store.pendingOffers.count == 1 ? "" : "s")") {
                nav.path.append(.contacts)
            }
        }
    }

    /// The home space and the unit, for the hub row.
    /// The home space and the unit, computed once for the row.
    private var storageSpace: (text: String, over: Bool) {
        let used = store.homeSpaceUsed
        let limit = store.homeSpaceLimit
        let home = limit.map { "home \(used)/\($0)" } ?? "home \(used)"
        let over = limit.map { used > $0 } ?? false
        guard let size = store.storageSize else { return (home, over) }
        return ("\(home) · unit \(store.storageUsed)/\(size.capacity)", over)
    }

    /// Your auctions and bids, for the hub row.
    private var auctionDetail: String {
        let selling = (store.data.raw + store.data.slabs).filter {
            switch $0.status {
            case .listed(let l): l.auctionEndDay != nil
            case .atAuctionHouse: true
            default: false
            }
        }.count + store.data.sealed.filter {
            switch $0.status {
            case .listed(let l): l.auctionEndDay != nil
            case .atAuctionHouse: true
            default: false
            }
        }.count
        let mine = store.openLots.filter { $0.playerMax != nil }
        let outbid = mine.filter { !store.lotView($0).playerLeads }.count
        return "\(selling) selling · \(mine.count) bid\(mine.count == 1 ? "" : "s")\(outbid > 0 ? " · \(outbid) outbid" : "")"
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
                Text("Rent \(money(store.rentNow))").font(.subheadline)
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
            Button { nav.path.append(.auctions) } label: {
                HStack {
                    Image(systemName: "hammer").foregroundStyle(Theme.cyan)
                    Text("Auctions").font(.subheadline)
                    Spacer()
                    Text(auctionDetail).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                    Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Divider().overlay(Theme.line)
            let space = storageSpace
            Button { nav.path.append(.storage) } label: {
                HStack {
                    Image(systemName: "shippingbox").foregroundStyle(space.over ? Theme.orange : Theme.cyan)
                    Text("Storage").font(.subheadline)
                    Spacer()
                    Text(space.text).font(.caption.monospaced())
                        .foregroundStyle(space.over ? Theme.orange : Theme.muted)
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
                            Button("Accept") { store.acceptFBOffer(o.id) }.primaryButton()
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
            // A visit that waits: the player stepped out, or the app quit during it (docs/40-resume-events.md).
            if let event = store.activeEvent {
                Button { nav.encounter = EncounterSession(session: event) } label: {
                    ChevronRow(icon: "arrow.uturn.backward.circle", title: "Back to \(event.venue.name)",
                               detail: "\(event.clock) · the visit waits for you", accent: true)
                }
                .buttonStyle(.plain)
            }
            if let show = store.showToday {
                Button {
                    // The show the player stepped out of opens again (Model/EventResume.swift).
                    if let event = store.activeEvent, event.show?.id == show.id {
                        nav.encounter = EncounterSession(session: event)
                    } else if store.canGoToShowToday, let started = store.startShowDay() {
                        nav.showDay = ShowDaySession(show: started)
                    } else {
                        nav.path.append(.show(show.id))
                    }
                } label: {
                    let waiting = store.activeEvent?.show?.id == show.id
                    ChevronRow(icon: "tablecells", title: "Card show today: \(show.name)",
                            detail: waiting ? "Your show waits · \(store.activeEvent?.clock ?? "")" : store.canGoToShowToday
                                ? (show.booked ? "Your table is booked · takes the rest of the day"
                                               : "Walk in for \(money(show.size.entryFee)) · takes the rest of the day")
                                : store.storeShiftPending ? "You run the store today · lock up to go" : "Done for today",
                            accent: waiting || store.canGoToShowToday)
                }
                .buttonStyle(.plain)
            }
            Button { nav.path.append(.calendar) } label: {
                ChevronRow(icon: "calendar", title: "Calendar",
                        detail: store.upcomingShows.first(where: { $0.startDay > store.day }).map { next in
                            let days = next.startDay - store.day
                            return "Next show: \(next.name) · \(days == 1 ? "tomorrow" : "in \(days) days")\(next.booked ? " · booked" : "")"
                        } ?? "Shows, paydays, rent, and deliveries")
            }
            .buttonStyle(.plain)
            Button { nav.path.append(.buyLocal) } label: {
                ChevronRow(icon: "car", title: "Store run", detail: "40 min per store · big stores and game shops")
            }
            .buttonStyle(.plain)
            Button { nav.path.append(.messages) } label: {
                let open = store.openMessages.count
                ChevronRow(icon: "bubble.left.and.text.bubble.right", title: "Messages",
                           detail: open == 0 ? "People message you about cards as your notoriety grows" : "\(open) open message\(open == 1 ? "" : "s")",
                           accent: open > 0)
            }
            .buttonStyle(.plain)
            if store.hasAccount {
                // Go Live (docs/08-ui-direction.md, tap target 8). Hidden until the player has an account.
                let plan = store.streamToday
                let block = store.streamBlock(hours: plan?.hours ?? Balance.streamHours[0])
                Button { streamSetup = StreamSetupRequest(plan: plan) } label: {
                    ChevronRow(icon: "dot.radiowaves.left.and.right",
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
                    if let waiting = store.waitingCounter { nav.encounter = EncounterSession(session: waiting) }
                    else if let session = store.startCounter() { nav.encounter = EncounterSession(session: session) }
                } label: {
                    ChevronRow(icon: "storefront", title: store.storeShiftPending ? "Your shift at \(shop.name)" : "Work the counter at \(shop.name)",
                            detail: store.waitingCounter.map { "Your counter waits · \($0.clock)" }
                                ?? block ?? "\(GameStore.clock(store.counterStart)) – \(GameStore.clock(Balance.storeClose)) · walk-ins buy, trade, and sell",
                            accent: block == nil)
                }
                .buttonStyle(.plain)
                .disabled(block != nil)
                // With no staff, the counter is the owner's job. The only way out is to lock up (Model/StoreShift.swift).
                if store.storeShiftPending {
                    Button { confirmLockUp = true } label: {
                        Text("Lock up today").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(Theme.orange)
                    .controlSize(.small)
                    .confirmationDialog("Lock up \(shop.name) today?", isPresented: $confirmLockUp, titleVisibility: .visible) {
                        Button("Lock up", role: .destructive) { store.asBusiness { _ = store.lockUp() } }
                    } message: {
                        Text(store.lockUpWarning)
                    }
                }
            }
            ForEach(store.meetsToday, id: \.self) { kind in
                let block = store.meetBlock(kind)
                Button { meetChoice = kind } label: {
                    ChevronRow(icon: kind.icon,
                            title: kind == .leagueNight ? "League night at \(store.leagueShop(day: store.day).rawValue)" : "\(kind.label) tonight",
                            detail: block ?? "\(kind.hoursText) · \(kind.place) · \(kind.crowd.short)",
                            accent: block == nil)
                }
                .buttonStyle(.plain)
                .disabled(block != nil)
            }
            eventRows
        }
        .confirmationDialog(meetChoice.map { $0 == .leagueNight ? "League night" : $0.label } ?? "",
                            isPresented: Binding(get: { meetChoice != nil }, set: { if !$0 { meetChoice = nil } }),
                            titleVisibility: .visible, presenting: meetChoice) { kind in
            Button("Set up a spot and deal") { goToMeet(kind, browse: false) }
            Button("Just browse") { goToMeet(kind, browse: true) }
        } message: { _ in
            Text("Just browse: no spot. Pack a bag, look through other people's binders, and buy or trade. Nothing of yours is for sale.")
        }
    }

    private func goToMeet(_ kind: MeetKind, browse: Bool) {
        meetChoice = nil
        if let session = store.startMeet(kind, browse: browse) { nav.encounter = EncounterSession(session: session) }
    }

    private var marketAndGoals: some View {
        DetailBox(title: "The bigger picture") {
            Button { nav.path.append(.market) } label: {
                let change = Int((store.marketChange * 100).rounded())
                ChevronRow(icon: change >= 0 ? "chart.line.uptrend.xyaxis" : "chart.line.downtrend.xyaxis", title: "Market",
                        detail: store.activeMarketEvents.first?.title ?? "\(change >= 0 ? "Up" : "Down") \(abs(change))% over the last 4 weeks")
            }
            .buttonStyle(.plain)
            Button { nav.path.append(.vending) } label: {
                let placed = store.machines.filter { $0.host != nil }
                ChevronRow(icon: "cabinet", title: "Vending machines",
                        detail: store.machines.isEmpty ? "Sell sealed product at a host, day and night"
                            : "\(placed.count) placed · \(placed.reduce(0) { $0 + $1.stock.count }) items in stock")
            }
            .buttonStyle(.plain)
            Button { nav.path.append(.goals) } label: {
                ChevronRow(icon: "flag.checkered", title: "Goals",
                        detail: store.closestGoal.map { "Next: \($0.title)" } ?? "You reached every goal.")
            }
            .buttonStyle(.plain)
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
        let block = store.endDayBlock
        return VStack(spacing: 4) {
            // The owner's shift at the store comes first (Model/StoreShift.swift).
            if let block { Text(block).font(.caption).foregroundStyle(Theme.orange) }
            Button {
                Haptics.tap(.medium)
                SoundFX.shared.play(.endDay)
                store.endDay()
            } label: {
                Text("End Day \(store.day + 1)")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
            }
            .primaryButton()
            .controlSize(.large)
            .disabled(block != nil)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Theme.background)
    }
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
            .framed()
        }
        .buttonStyle(.plain)
        .disabled(action == nil)
    }
}

struct DayReportView: View {
    @Environment(GameStore.self) var store
    @Environment(\.dismiss) private var dismiss
    let report: DayReport

    var body: some View {
        let late = store.data.lateHours
        VStack(alignment: .leading, spacing: 14) {
            Text("Good morning. Day \(report.day + 1)").font(.title2.bold())
            if late > 0 {
                // The late-night choice (docs/16-time-and-day.md, Late nights).
                LateNightChoice(lateHours: late,
                                message: late >= Balance.exhaustedFrom
                                    ? "Start at 7 AM exhausted: haggling and your eye are \(Int(Balance.exhaustedPenalty * 100))% worse today."
                                    : "Start at 7 AM tired: haggling and your eye are \(Int(Balance.tiredPenalty * 100))% worse today.")
            }
            if !report.slabs.isEmpty { SlabReturnStrip(slabs: report.slabs) }
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
            .primaryButton()
            .controlSize(.large)
            .disabled(late > 0)
        }
        .padding(20)
        .background(Theme.surface.ignoresSafeArea())
        .interactiveDismissDisabled(late > 0)
    }
}

struct GameOverView: View {
    @Environment(GameStore.self) var store

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
            .primaryButton()
            .controlSize(.large)
        }
        .padding(24)
        .background(Theme.background.ignoresSafeArea())
    }
}
