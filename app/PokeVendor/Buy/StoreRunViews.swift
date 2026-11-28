import SwiftUI

/// The local list plans a store run: select stores, see the trip time, start (docs/08-ui-direction.md, Buy screen).
struct StoreRunPlanner: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav
    @State private var chosen: [LocalStore] = []
    @State private var message: String?

    var body: some View {
        let route = store.plannedRoute(chosen)
        let hours = Double(chosen.count) * store.storeStopHours
        VStack(spacing: 12) {
            VStack(spacing: 0) {
                ForEach(LocalStore.allCases, id: \.self) { s in
                    HStack(spacing: 10) {
                        Button {
                            if let i = chosen.firstIndex(of: s) { chosen.remove(at: i) } else { chosen.append(s) }
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: chosen.contains(s) ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(chosen.contains(s) ? Theme.cyan : Theme.muted)
                                    .font(.title3)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(s.rawValue).font(.subheadline.weight(.medium))
                                    Text(detail(s))
                                        .font(.caption.monospaced())
                                        .foregroundStyle(Theme.muted)
                                    ForEach(tags(s), id: \.text) { tag in
                                        Text(tag.text).font(.caption.monospaced()).foregroundStyle(tag.color)
                                    }
                                }
                                Spacer()
                                Text("40m").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if s.isGameShop {
                            Button("Shop") { nav.path.append(.shop(s)) }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                        } else if s.isClub, !store.isClubMember {
                            Button(store.data.retail.clubUntil == nil ? "Join" : "Renew") { store.joinClub() }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                                .disabled(!store.canAfford(Balance.clubFee))
                        }
                    }
                    .padding(12)
                    .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
                }
            }
            .background(Theme.surface)
            .framed()

            if let message { Banner(text: message, color: Theme.orange) }

            let start = store.slot(for: hours)
            if store.hasUpgrade(.routePlanner), !chosen.isEmpty, let start { routeBox(route, start: start) }
            Button {
                guard let start = store.startStoreRun(route) else {
                    message = "You do not have \(formatHours(hours)) free today."
                    return
                }
                nav.storeRun = StoreRunSession(stops: route, startHour: start)
                chosen = []
            } label: {
                Text(chosen.isEmpty ? "Select stores" :
                     start.map { "Start run · \(formatHours(hours)) · \(GameStore.clock($0))–\(GameStore.clock($0 + hours))" }
                     ?? "Not enough time today · \(formatHours(hours))")
                    .frame(maxWidth: .infinity)
            }
            .primaryButton()
            .controlSize(.large)
            .disabled(chosen.isEmpty || start == nil)
        }
    }

    /// The route planner: the order of the stops and the arrival time of each. Read only: it writes no state.
    private func routeBox(_ route: [LocalStore], start: Double) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("ROUTE").font(.system(size: 11, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
            ForEach(Array(route.enumerated()), id: \.element) { i, s in
                let arrive = start + Double(i) * store.storeStopHours
                let slot = store.vendorSlot(s)
                let vendorToday = store.vendorKnown(s) && slot.weekday == store.weekday
                HStack(alignment: .firstTextBaseline) {
                    Text("\(i + 1). \(s.rawValue)").font(.subheadline)
                    Spacer()
                    Text("arrive \(GameStore.clock(arrive))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
                if vendorToday {
                    Text(arrive >= slot.hour ? "Vendor came at about \(GameStore.clock(slot.hour)). You arrive after it."
                                              : "Vendor comes at about \(GameStore.clock(slot.hour)). You arrive before it.")
                        .font(.caption)
                        .foregroundStyle(arrive >= slot.hour ? Theme.cyan : Theme.orange)
                }
            }
            Text("Chains with a vendor today come after your other known chains, by vendor hour, so you arrive late. Unknown chains come last.").font(.caption2).foregroundStyle(Theme.muted)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface)
        .framed()
    }

    /// The detail line of a stop in the planner.
    private func detail(_ s: LocalStore) -> String {
        if s.isGameShop { return "Game shop · near market · \(store.standing(s).rawValue) · credit \(money(store.shop(s).credit))" }
        if s.isClub {
            return store.isClubMember ? "Member until \(GameCalendar.date(store.data.retail.clubUntil ?? store.day).text)"
                                      : "Members only · \(money(Balance.clubFee)) a year"
        }
        return "Big store · MSRP · \(store.limitText(s))" + (s == .gamestop ? " · hot items over MSRP" : "")
    }

    private func tags(_ s: LocalStore) -> [(text: String, color: Color)] {
        guard !s.isGameShop else { return [] }
        var out: [(text: String, color: Color)] = []
        let level = store.strictness(s)
        if level.level > 0 { out.append(("Strict · level \(level.level)", Theme.orange)) }
        if store.isBanned(s) {
            out.append(("Refused until \(GameCalendar.date(store.data.retail.bannedUntil[s.rawValue] ?? store.day).text)", Theme.orange))
        }
        if level.level >= 4 { out.append(("Card sales stopped", Theme.orange)) }
        if let w = store.data.retail.seenSlot[s.rawValue] { out.append(("Vendor day: \(GameStore.weekdays[w]) (you saw it)", Theme.cyan)) }
        if store.alertedStores.contains(s) {
            let slot = store.vendorSlot(s)
            if slot.weekday == store.weekday { out.append(("Vendor stock today ~\(GameStore.clock(slot.hour))", Theme.cyan)) }
            else if slot.weekday == (store.weekday + 1) % 7 { out.append(("Vendor stock tomorrow ~\(GameStore.clock(slot.hour))", Theme.cyan)) }
        }
        return out
    }
}

/// The run goes stop by stop: the shelf, then buy or move on. A summary closes the run.
struct StoreRunView: View {
    @Environment(GameStore.self) private var store
    let stops: [LocalStore]
    /// The hour that the run started. Stop `i` arrives after `i` drives.
    let startHour: Double
    let onClose: () -> Void
    @State private var index = 0
    @State private var useCredit = false
    @State private var startPoints: [LocalStore: Int] = [:]
    /// The hours that the player waited for a vendor in this run. Every later arrival moves by this time.
    @State private var waited = 0.0
    @State private var spent = 0.0
    @State private var bought: [String] = []
    /// Someone who came up to the player at this stop (docs/28-messages-and-encounters.md).
    @State private var encounter: ShopEncounter?
    @State private var encounterResult: String?
    /// The rip of a product that the shop opened for the player (integration 4.1). It opens at once after the buy.
    @State private var rip: RipSession?

    var body: some View {
        NavigationStack {
            Group {
                if index < stops.count {
                    stopView(stops[index])
                } else {
                    summary
                }
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle(index < stops.count ? "Stop \(index + 1) of \(stops.count)" : "Run summary")
            .navigationBarTitleDisplayMode(.inline)
        }
        .tint(Theme.cyan)
        .fullScreenCover(item: $rip) { session in
            RipView(items: session.items, store: store) { rip = nil }
        }
        .onAppear {
            // A run from the save picks up where it stopped (docs/40-resume-events.md).
            if let run = store.data.activeStoreRun, run.stops == stops {
                index = run.index
                waited = run.waited
                spent = run.spent
                bought = run.bought
                for s in stops where s.isGameShop { startPoints[s] = run.startPoints[s.rawValue] ?? store.shop(s).points }
            } else {
                for s in stops where s.isGameShop { startPoints[s] = store.shop(s).points }
            }
            rollEncounter()
        }
        .onChange(of: index) { _, now in
            store.updateStoreRun { $0.index = now }
            rollEncounter()
        }
        .onChange(of: waited) { _, now in store.updateStoreRun { $0.waited = now } }
        .onChange(of: spent) { _, now in store.updateStoreRun { $0.spent = now } }
        .onChange(of: bought) { _, now in store.updateStoreRun { $0.bought = now } }
    }

    private func arrival(_ i: Int) -> Double { startHour + Double(i) * store.storeStopHours + waited }

    private func stopView(_ s: LocalStore) -> some View {
        let shelf = store.shelf(at: s, hour: arrival(index))
        let rule = store.limitRule(s)
        return ScrollView {
            VStack(spacing: 14) {
                HStack {
                    Text(s.rawValue).font(.title2.bold())
                    Spacer()
                    Text("Cash \(money(store.cash))").font(.caption.monospaced())
                }
                if !s.isGameShop {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(store.limitText(s)) · here at \(GameStore.clock(arrival(index)))")
                            .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        if let hint = store.heatHint(s) { Text(hint).font(.caption).foregroundStyle(Theme.orange) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if rule.closed {
                        Banner(text: store.isBanned(s) ? "The \(s.rawValue) staff refuse to sell you cards." : "\(s.rawValue) stopped in-store card sales.",
                               color: Theme.orange)
                    } else if s.isClub && !store.isClubMember {
                        HStack {
                            Banner(text: "The club sells to members only.", color: Theme.orange)
                            Button("Join · \(money(Balance.clubFee))") { store.joinClub() }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                                .disabled(!store.canAfford(Balance.clubFee))
                        }
                    }
                    if let notice = store.retailNotice { Banner(text: notice, color: Theme.orange) }
                    if let gap = store.vendorWaitGap(s, arrival: arrival(index)) {
                        Button("Wait for the vendor · \(formatHours(gap))") {
                            if let hours = store.waitForVendor(s, arrival: arrival(index)) { waited += hours }
                        }
                        .buttonStyle(.bordered)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                if s.isGameShop {
                    HStack {
                        Text("\(store.standing(s).rawValue) · \(store.shop(s).points) pts · credit \(money(store.shop(s).credit))")
                            .font(.caption.monospaced())
                            .foregroundStyle(Theme.muted)
                        Spacer()
                        Toggle("Use credit", isOn: $useCredit).labelsHidden()
                        Text("Credit first").font(.caption)
                    }
                }
                if let encounter, encounter.shop == s {
                    ShopEncounterBox(encounter: encounter, result: $encounterResult) { self.encounter = nil }
                } else if let encounterResult {
                    Banner(text: encounterResult, color: Theme.cyan)
                }
                if s.isGameShop {
                    SavedBox(shop: s, useCredit: useCredit)
                    ConsignBox(shop: s)
                    BuyInBox(shop: s, useCredit: useCredit)
                }
                DetailBox(title: "The shelf") {
                    if shelf.isEmpty {
                        Text(s.isGameShop ? "The shelf is empty. This stop is a bust." : "No card product on the shelf now.")
                            .font(.subheadline).foregroundStyle(Theme.muted)
                    }
                    let groups = SetLibrary.grouped(shelf, by: { $0.product.homeSlug })
                    FoldAllButton(list: "shelf", keys: groups.map { FoldKey.set($0.slug) })
                    ForEach(groups, id: \.slug) { group in
                        SetGroup(slug: group.slug, count: group.items.count, list: "shelf") {
                            ForEach(group.items) { item in
                                let left = store.shelfLeft(item)
                                let allowed = store.limitLeft(item, at: s)
                                HStack(spacing: 10) {
                                    RemoteCardImage(url: item.product.image.flatMap(URL.init(string:)), name: "", upright: false)
                                        .aspectRatio(contentMode: .fit)
                                        .padding(2)
                                        .background(Color.white)
                                        .frame(width: 44, height: 56)
                                        // The front box on the shelf: the copy that the player buys next.
                                        .looksInside(item.product) {
                                            BoxContents.draw(item.product, key: BoxContents.shelfKey(item.id, copy: store.shelfCopy(item)))
                                        }
                                    VStack(alignment: .leading, spacing: 2) {
                                        HStack(spacing: 6) {
                                            Text(item.product.name).font(.subheadline).lineLimit(2)
                                            if item.hot { HotTag() }
                                            if item.ripHere { OpenedTag() }
                                        }
                                        Text(shelfCaption(item, left: left, allowed: allowed, game: s.isGameShop))
                                            .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                                        if item.ripHere {
                                            Text("The shop opened this box and sells it at MSRP. You must rip it here. You cannot sell it or keep it closed.")
                                                .font(.caption).foregroundStyle(Theme.orange)
                                        }
                                        if item.batchDay != nil, left == 0 {
                                            Text(store.data.retail.batchBought[item.id]?.emptied == true ? "You took the last one."
                                                 : store.data.retail.visitLines[item.id] ?? "Sold out.")
                                                .font(.caption).foregroundStyle(Theme.orange)
                                        }
                                    }
                                    Spacer()
                                    Button(left == 0 ? "Gone" : money(item.price)) {
                                        store.retailNotice = nil
                                        if store.buyShelf(item, at: s, credit: useCredit && s.isGameShop) {
                                            spent += item.price
                                            bought.append(item.product.name)
                                            // The buy made the item. Open the rip on it now.
                                            if item.ripHere, let opened = store.data.sealed.last, opened.status == .openedAtShop {
                                                rip = RipSession(items: [opened])
                                            }
                                        }
                                    }
                                    .primaryButton()
                                    .controlSize(.small)
                                    .disabled(left == 0 || allowed == 0)
                                }
                            }
                        }
                    }
                }
                if !s.isGameShop {
                    Text("Hot items: limit 1 at most chains. They sell out within hours, and staff remember who clears them.")
                        .font(.caption).foregroundStyle(Theme.muted)
                }
                if s.isGameShop {
                    SellToShopBox(shop: s)
                }
                Button {
                    store.retailNotice = nil
                    if index + 1 < stops.count { store.arrive(at: stops[index + 1], hour: arrival(index + 1)) }
                    index += 1
                    useCredit = false
                } label: {
                    Text(index + 1 < stops.count ? "Next stop: \(stops[index + 1].rawValue)" : "Finish the run")
                        .frame(maxWidth: .infinity)
                }
                .primaryButton()
                .controlSize(.large)
            }
            .padding(16)
        }
    }

    private func shelfCaption(_ item: ShelfItem, left: Int, allowed: Int, game: Bool) -> String {
        game ? "\(left) left · mkt \(money(item.product.market))"
             : "\(left) left · limit \(allowed) · mkt \(money(item.product.market))" + flipText(item)
    }

    /// The flip margin on eBay, with the expected value readout.
    private func flipText(_ item: ShelfItem) -> String {
        guard store.hasUpgrade(.evReadout) else { return "" }
        return " · flip \(money(store.flipMargin(market: item.product.market, cost: item.price)))"
    }

    private func rollEncounter() {
        encounterResult = nil
        encounter = index < stops.count ? store.rollShopEncounter(stops[index]) : nil
    }

    private var summary: some View {
        ScrollView {
            VStack(spacing: 14) {
                DetailBox(title: "Bought") {
                    if bought.isEmpty { Text("Nothing. Every shelf was a bust, or you passed.").font(.subheadline).foregroundStyle(Theme.muted) }
                    ForEach(Array(bought.enumerated()), id: \.offset) { _, name in Text(name).font(.subheadline) }
                    Text("Spent \(money(spent))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
                let shops = stops.filter(\.isGameShop)
                if !shops.isEmpty {
                    DetailBox(title: "Standing earned") {
                        ForEach(shops, id: \.self) { s in
                            let gained = store.shop(s).points - (startPoints[s] ?? 0)
                            HStack {
                                Text(s.rawValue).font(.subheadline)
                                Spacer()
                                Text("\(gained >= 0 ? "+" : "")\(gained) · \(store.standing(s).rawValue)").font(.subheadline.monospaced())
                            }
                        }
                    }
                }
                Button {
                    store.endStoreRun()
                    onClose()
                } label: {
                    Text("Done").frame(maxWidth: .infinity)
                }
                .primaryButton()
                .controlSize(.large)
            }
            .padding(16)
        }
    }
}

/// The "Sell to the shop" row: singles for cash on the buylist, bulk for store credit.
struct SellToShopBox: View {
    @Environment(GameStore.self) private var store
    let shop: LocalStore

    var body: some View {
        let cards = (store.data.raw + store.data.slabs).filter { $0.status == nil && !$0.setAside }.sorted { $0.market > $1.market }
        DetailBox(title: "Sell to the shop · buylist \(Int(store.standing(shop).buylistRate * 100))% of market") {
            if cards.isEmpty && store.movableBulk.isEmpty {
                Text("You have nothing the shop can buy.").font(.subheadline).foregroundStyle(Theme.muted)
            }
            ForEach(cards) { card in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(card.print.name)\(card.grade.map { " · " + $0.label } ?? "")").font(.subheadline).lineLimit(1)
                        Text("mkt \(money(card.market))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    Button("Sell \(money(store.buylistPrice(card, at: shop)))") { store.sellToShop(card.id, at: shop) }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                }
            }
            ForEach(store.movableBulk) { group in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Bulk · \(group.cards.count) cards").font(.subheadline)
                        Text("mkt \(money(group.value))\(store.hasUpgrade(.bulkBroker) ? "" : " · store credit only")").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    Button("Credit \(money(store.bulkCredit(group)))") { store.sellBulk(group.id, at: shop) }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                    if store.hasUpgrade(.bulkBroker) {
                        // The bulk broker pays cash (docs/09-upgrades.md).
                        Button("Cash \(money(store.bulkCash(group)))") { store.sellBulkForCash(group.id) }
                            .buttonStyle(.bordered)
                            .tint(Theme.green)
                            .controlSize(.small)
                    }
                }
            }
        }
    }
}

/// The game shop's own screen: standing, store credit, the display case (docs/08-ui-direction.md).
struct ShopView: View {
    @Environment(GameStore.self) private var store
    let shop: LocalStore
    @State private var useCredit = false

    var body: some View {
        let state = store.shop(shop)
        let level = store.standing(shop)
        ScrollView {
            VStack(spacing: 14) {
                DetailBox(title: "Standing") {
                    HStack(spacing: 0) {
                        StatCell(label: "Level", value: level.rawValue)
                        StatCell(label: "Points", value: "\(state.points) / 100")
                        StatCell(label: "Store credit", value: money(state.credit))
                    }
                    Text("Buylist pays \(Int(level.buylistRate * 100))% of market. Each $50 spent here is +1 point. Holds and consignment open at Regular (30 points).")
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                }
                SavedBox(shop: shop, useCredit: useCredit)
                BuyInBox(shop: shop, useCredit: useCredit)
                ConsignBox(shop: shop)
                DetailBox(title: "Display case · changes weekly") {
                    Toggle("Use store credit first, cash for the rest", isOn: $useCredit).font(.subheadline)
                    ForEach(Market.displayCase(shop, day: store.day, discount: store.shopDiscount(shop))) { single in
                        let bought = store.data.weekBought.contains(single.id)
                        HStack(spacing: 10) {
                            RemoteCardImage(url: single.print.image.flatMap(URL.init(string:)), name: "")
                                .frame(width: 40, height: 56)
                                .clipShape(RoundedRectangle(cornerRadius: 3))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(single.print.name).font(.subheadline)
                                Text("\(single.print.rarity) · mkt \(money(single.print.market ?? 0))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                                if single.looksOff { LooksOffLine(sealed: false) }
                            }
                            Spacer()
                            Button(bought ? "Bought" : money(single.price)) {
                                store.buyCaseSingle(single, at: shop, credit: useCredit)
                            }
                            .primaryButton()
                            .controlSize(.small)
                            .disabled(bought)
                        }
                    }
                    Text("Buying from the case here needs no store run in this build.").font(.caption2).foregroundStyle(Theme.muted)
                }
                DetailBox(title: "League night") {
                    let mine = store.leagueShop(day: store.day) == shop
                    Text("Thursday, \(MeetKind.leagueNight.hoursText). The shops take turns: \(mine ? "this shop hosts this week." : "the other shop hosts this week.")")
                        .font(.subheadline)
                    Text("A small meet with the shop's regulars. Each night is +\(Balance.leagueStandingPoints) standing. Go from the hub on Thursday.")
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle(shop.rawValue)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// What a game shop bought from local sellers this week (Market.buyIns).
struct BuyInBox: View {
    @Environment(GameStore.self) private var store
    let shop: LocalStore
    let useCredit: Bool

    var body: some View {
        let items = Market.buyIns(shop, day: store.day, discount: store.shopDiscount(shop))
        DetailBox(title: "Just came in · changes weekly") {
            Text("People sell their collections to the shop. Sometimes it is old and good.")
                .font(.caption)
                .foregroundStyle(Theme.muted)
            ForEach(items) { item in
                let bought = store.data.weekBought.contains(item.id)
                HStack(alignment: .top, spacing: 10) {
                    GoodsImage(item: VendorItem(goods: item.goods, price: item.price, market: item.market), contentsKey: item.id)
                        .frame(width: 44, height: 62)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(item.name).font(.subheadline).lineLimit(2)
                        GoodsDetail(goods: item.goods, tool: store.data.centeringTool)
                        HStack(spacing: 6) {
                            Text("mkt \(money(item.market))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                            if item.steal {
                                Text("PRICED TO MOVE")
                                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 2)
                                    .background(Theme.green.opacity(0.2))
                                    .foregroundStyle(Theme.green)
                            }
                        }
                        if item.looksOff { LooksOffLine(sealed: item.isSealed) }
                    }
                    Spacer()
                    Button(bought ? "Bought" : money(item.price)) {
                        store.buyBuyIn(item, at: shop, credit: useCredit)
                    }
                    .primaryButton()
                    .controlSize(.small)
                    .disabled(bought)
                }
            }
        }
    }
}

/// Consignment in the shop's display case, at Regular and up (docs/15-selling.md, The local game shop).
struct ConsignBox: View {
    @Environment(GameStore.self) private var store
    let shop: LocalStore
    @State private var sheet = false

    var body: some View {
        let mine = store.consignedCards.filter { if case .consigned(let c) = $0.status { return c.shop == shop }; return false }
        DetailBox(title: "Consignment") {
            if store.canConsign(at: shop) {
                Text("Your cards in the shop's case, at a better price than the buylist. The shop takes \(Int(store.consignCut(at: shop) * 100))%, and a sale is slow.")
                    .font(.caption).foregroundStyle(Theme.muted)
                ForEach(mine) { card in
                    if case .consigned(let c) = card.status {
                        HStack {
                            Text(card.grade.map { "\(card.print.name) \($0.label)" } ?? card.print.name).font(.subheadline).lineLimit(1)
                            Spacer()
                            Text("\(money(c.price)) · day \(store.day - c.dayListed + 1) of \(Balance.consignDays)").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                            Button("Take back") { store.endConsignment(card.id) }.buttonStyle(.bordered).controlSize(.small)
                        }
                    }
                }
                Button("Consign cards") { sheet = true }
                    .buttonStyle(.bordered)
            } else if store.cardStore != nil {
                Text("We don't consign for the competition. Close your store and the case opens again.").font(.caption).foregroundStyle(Theme.muted)
            } else {
                Text("Consignment opens at Regular standing (30 points).").font(.caption).foregroundStyle(Theme.muted)
            }
        }
        .sheet(isPresented: $sheet) { ConsignSheet(shop: shop) }
    }
}

/// What a game shop set aside for the player, at Regular and up (docs/21-relationships-and-reputation.md).
struct SavedBox: View {
    @Environment(GameStore.self) private var store
    let shop: LocalStore
    let useCredit: Bool

    var body: some View {
        let items = store.savedAtShop(shop)
        if !items.isEmpty {
            DetailBox(title: "Saved for you") {
                ForEach(items) { item in
                    HStack(alignment: .top, spacing: 10) {
                        GoodsImage(item: VendorItem(goods: item.goods, price: item.price, market: item.market))
                            .frame(width: 44, height: 62)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(item.name).font(.subheadline).lineLimit(2)
                            GoodsDetail(goods: item.goods, tool: store.data.centeringTool)
                            Text("mkt \(money(item.market)) · held until day \(item.untilDay + 1)")
                                .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Button(money(item.price)) { store.pickUp(item, credit: useCredit) }
                            .primaryButton()
                            .tint(Theme.green)
                            .controlSize(.small)
                    }
                }
                Text("A hold you do not pick up costs standing.").font(.caption2).foregroundStyle(Theme.muted)
            }
        }
    }
}

/// Someone comes up to the player at a game shop stop. Each choice closes the encounter.
struct ShopEncounterBox: View {
    @Environment(GameStore.self) private var store
    let encounter: ShopEncounter
    @Binding var result: String?
    let close: () -> Void

    var body: some View {
        let e = encounter
        DetailBox(title: "Someone comes up to you") {
            HStack(alignment: .top, spacing: 12) {
                if let url = imageURL {
                    RemoteCardImage(url: url, name: "", upright: !isSealed)
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 50, height: 70)
                        .clipShape(RoundedRectangle(cornerRadius: 3))
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(e.who).font(.subheadline.weight(.semibold))
                    Text("“\(e.line)”").font(.subheadline.italic())
                    if e.market > 0 {
                        Text("Market \(money(e.market))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                    }
                }
            }
            buttons(e)
                .controlSize(.small)
        }
    }

    @ViewBuilder private func buttons(_ e: ShopEncounter) -> some View {
        switch e.kind {
        case .kidWithHit:
            let fair = ShowSession.round(e.market * Balance.kidFairShare)
            let low = max(1, ShowSession.round(e.market * Balance.kidLowballShare))
            VStack(spacing: 6) {
                HStack(spacing: 8) {
                    choice("Tell them the value", tint: Theme.green) { store.tellKidValue(e) }
                    choice("Offer fair · \(money(fair))", tint: Theme.cyan) { store.buyKidFair(e) }
                        .disabled(!store.canAfford(fair))
                }
                choice("Say it's not worth much · \(money(low))", tint: Theme.orange) { store.lowballKid(e) }
                    .disabled(!store.canAfford(low))
            }
        case .buyer:
            HStack(spacing: 8) {
                choice("Sell · \(money(e.price))", tint: Theme.green) { store.sellToShopBuyer(e) }
                choice("No thanks", tint: Theme.muted) { "\(e.who) nodded and went back to their game." }
            }
        case .seller, .ownerHold:
            HStack(spacing: 8) {
                choice("Buy · \(money(e.price))", tint: Theme.cyan) { store.buyFromShopEncounter(e) }
                    .disabled(!store.canAfford(e.price))
                choice("Pass", tint: Theme.muted) { "You passed." }
            }
        case .tip:
            HStack(spacing: 8) {
                choice("Add to calendar", tint: Theme.green) { store.takeShopTip(e) }
                choice("Ignore", tint: Theme.muted) { "You let it go." }
            }
        }
    }

    private func choice(_ title: String, tint: Color, action: @escaping () -> String) -> some View {
        Button {
            result = action()
            close()
        } label: {
            Text(title).frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .tint(tint)
    }

    private var isSealed: Bool {
        if case .sealed = encounter.goods { return true }
        return false
    }

    private var imageURL: URL? {
        switch encounter.goods {
        case .single(let p, _, _), .slab(let p, _, _): return p.image.flatMap(URL.init(string:))
        case .sealed(let product): return product.image.flatMap(URL.init(string:))
        default:
            guard let id = encounter.cardID, let card = store.card(id) else { return nil }
            return card.print.image.flatMap(URL.init(string:))
        }
    }
}
