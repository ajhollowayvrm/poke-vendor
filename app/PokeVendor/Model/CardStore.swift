import Foundation

// The player's own card store (docs/22-own-store.md).

/// Where the player can lease a store. Each place trades rent for foot traffic.
enum StoreLocation: String, Codable, CaseIterable, Hashable {
    case stripMall, mainStreet, mall

    var name: String {
        switch self {
        case .stripMall: "Oak Plaza strip mall"
        case .mainStreet: "Main Street storefront"
        case .mall: "Northgate Mall"
        }
    }

    var detail: String {
        switch self {
        case .stripMall: "A small unit between a nail salon and a pizza place. The rent is low, and it is quiet. Most people come in on purpose."
        case .mainStreet: "A corner shop downtown with a big window. Collectors walk by on the weekend."
        case .mall: "A unit near the food court. Many people walk past, and most of them are families. The rent is high."
        }
    }

    var icon: String {
        switch self {
        case .stripMall: "building"
        case .mainStreet: "storefront"
        case .mall: "building.2"
        }
    }

    /// Rent for each 28 days. The deposit is one rent.
    var rent: Double { Balance.storeRent[self] ?? 0 }
    var buildout: Double { Balance.storeBuildout[self] ?? 0 }
    /// The mean number of customers on a full weekday.
    var traffic: Double { Balance.storeTraffic[self] ?? 0 }
    /// The share of customers with a small budget: kids, parents, and casual buyers.
    var casualShare: Double { Balance.storeCasualShare[self] ?? 0 }
    /// The cash to sign the lease: the first rent, the deposit, and the build-out.
    var upfront: Double { rent * 2 + buildout }
}

/// A one-time buy for the store. The store keeps it until the store closes.
enum StoreFixture: String, Codable, CaseIterable, Hashable {
    case extraCase, sealedWall, playTables, cameras, sign

    var name: String {
        switch self {
        case .extraCase: "Second display case"
        case .sealedWall: "Sealed wall"
        case .playTables: "Play tables"
        case .cameras: "Security cameras"
        case .sign: "Lighted sign"
        }
    }

    var detail: String {
        switch self {
        case .extraCase: "Room for \(Balance.extraCaseSlots) more cards and slabs."
        case .sealedWall: "Room for \(Balance.sealedWallSlots) more sealed products."
        case .playTables: "A Friday night tournament: entry fees, and more people in the store that day."
        case .cameras: "Stops shoplifting on the days the clerk is alone."
        case .sign: "\(Int((Balance.signTrafficBonus - 1) * 100))% more customers every day."
        }
    }

    var icon: String {
        switch self {
        case .extraCase: "rectangle.grid.2x2"
        case .sealedWall: "square.stack.3d.up"
        case .playTables: "gamecontroller"
        case .cameras: "video.badge.checkmark"
        case .sign: "lightbulb.max"
        }
    }

    var cost: Double { Balance.fixtureCosts[self] ?? 0 }
}

/// One open day at the store, for the numbers on the store screen.
struct StoreDay: Codable, Hashable {
    let day: Int
    var customers = 0
    var sold = 0
    var revenue = 0.0
    /// Wages and rent paid that day.
    var costs = 0.0
}

/// The player's store. Nil in `GameData` until the player signs a lease.
struct CardStoreState: Codable, Hashable {
    var name: String
    let location: StoreLocation
    /// The day the player signed the lease. Rent comes due every 28 days from it.
    let leaseDay: Int
    /// The grand opening, after the build-out.
    let openDay: Int
    /// The landlord gives it back when the player closes the store, but not after an eviction.
    let deposit: Double
    /// The shelf price, as a share of market.
    var priceFactor = Balance.storeDefaultPrice
    var clerk = false
    /// The weekdays the store opens. 0 is Monday.
    var openDays: [Int] = Array(0..<7)
    var fixtures: [StoreFixture] = []
    /// The last day the player worked the counter, and for how many hours.
    var counterDay = -1
    var counterHours = 0.0
    var history: [StoreDay] = []

    func has(_ fixture: StoreFixture) -> Bool { fixtures.contains(fixture) }
}

extension Balance {
    static let storeRent: [StoreLocation: Double] = [.stripMall: 1400, .mainStreet: 2400, .mall: 3800]
    static let storeBuildout: [StoreLocation: Double] = [.stripMall: 2000, .mainStreet: 3500, .mall: 5000]
    static let storeTraffic: [StoreLocation: Double] = [.stripMall: 12, .mainStreet: 20, .mall: 32]
    static let storeCasualShare: [StoreLocation: Double] = [.stripMall: 0.3, .mainStreet: 0.25, .mall: 0.5]
    /// To sign a lease: reputation Trusted, and this much in sales over the whole run.
    static let storeReputationTier = 2
    static let storeLifetimeSales = 2500.0
    static let storeBuildDays = 7
    static let storeOpen = 11.0
    static let storeClose = 19.0
    static let storeDefaultPrice = 1.10
    static let storePrices = [0.95, 1.0, 1.10, 1.20, 1.30]
    /// The clerk: $15 an hour for every hour the store is open.
    static let clerkWage = 15.0 * (storeClose - storeOpen)
    /// Customers by weekday, Monday first.
    static let storeWeekdayTraffic = [0.8, 0.8, 0.8, 0.8, 1.1, 1.5, 1.2]
    static let grandOpeningBonus = 1.5
    static let grandOpeningDays = 7
    static let storeReputationStep = 0.06
    static let storeFollowerStep = 0.08
    /// A customer who only looks.
    static let storeBrowseChance = 0.35
    /// What a customer pays at most, as a share of market.
    static let storeBuyerLimit = 0.92...1.28
    static let storeCasualBudget = 30.0
    /// The share of customers who come to the counter when the player works it: to buy, to trade, or to sell.
    static let counterVisitorShare = 0.6
    /// A store gets more people who want to sell than a show table does.
    static let storeSellerShare = 0.32
    static let storeCardSlots = 40
    static let storeSealedSlots = 40
    static let extraCaseSlots = 60
    static let sealedWallSlots = 60
    static let fixtureCosts: [StoreFixture: Double] = [.extraCase: 500, .sealedWall: 400, .playTables: 700, .cameras: 350, .sign: 300]
    static let signTrafficBonus = 1.15
    static let tournamentTrafficBonus = 1.3
    static let tournamentPlayers = 8...16
    /// Entry fee less the prize packs, for each player.
    static let tournamentNetPerPlayer = 7.0
    static let shopliftChance = 0.05
    static let shopliftMaxValue = 40.0
    static let evictionReputationCost = 15
}

@MainActor
extension GameStore {
    // MARK: - The lease

    var cardStore: CardStoreState? { data.cardStore }

    /// The store is past its build-out and can open.
    var storeIsBuilt: Bool { data.cardStore.map { data.day >= $0.openDay } ?? false }

    /// Every sale over the whole run, after fees.
    var lifetimeSales: Double {
        data.ledger.reduce(0) { $1.category == .sale && $1.amount > 0 ? $0 + $1.amount : $0 }
    }

    struct StoreRequirement: Identifiable {
        let id: String
        let label: String
        let detail: String
        let met: Bool
    }

    /// What the player needs before a landlord signs. The cash depends on the place, so it is not here.
    var storeRequirements: [StoreRequirement] {
        [
            StoreRequirement(id: "rep", label: "Reputation \(ReputationTier.names[Balance.storeReputationTier])",
                             detail: "Now \(reputationName). People must trust you before they shop with you.",
                             met: reputationTier >= Balance.storeReputationTier),
            StoreRequirement(id: "sales", label: "\(money(Balance.storeLifetimeSales)) in sales",
                             detail: "\(money(lifetimeSales)) so far. Show that you can move product.",
                             met: lifetimeSales >= Balance.storeLifetimeSales),
        ]
    }

    var storeRequirementsMet: Bool { storeRequirements.allSatisfy(\.met) }

    func canSignLease(_ location: StoreLocation) -> Bool {
        data.cardStore == nil && storeRequirementsMet && canAfford(location.upfront)
    }

    /// Signs the lease: the first rent, the deposit, and the build-out. The store opens after the build-out.
    func signLease(_ location: StoreLocation, name: String) {
        guard canSignLease(location) else { return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let title = trimmed.isEmpty ? "Card Corner" : String(trimmed.prefix(30))
        addLedger(-location.rent, .storeRent, "First rent · \(title)")
        addLedger(-location.rent, .storeSetup, "Security deposit · \(title)")
        addLedger(-location.buildout, .storeSetup, "Build-out · \(title)")
        data.cardStore = CardStoreState(name: title, location: location, leaseDay: data.day,
                                        openDay: data.day + Balance.storeBuildDays, deposit: location.rent)
        log("Signed a lease at \(location.name). \(title) opens on day \(data.day + Balance.storeBuildDays + 1).",
            cash: -location.upfront)
        save()
    }

    var daysUntilStoreRent: Int? {
        data.cardStore.map { Balance.rentCycleDays - (data.day - $0.leaseDay) % Balance.rentCycleDays }
    }

    /// Ends the lease. Every item in the store comes home tomorrow. The landlord keeps the deposit after an eviction.
    @discardableResult
    func closeStore(evicted: Bool = false) -> [String] {
        guard let s = data.cardStore else { return [] }
        let back = ItemStatus.arriving(daysLeft: 1, from: s.name)
        var count = 0
        for i in data.raw.indices where Self.isInStore(data.raw[i].status) {
            data.raw[i].status = back
            count += 1
        }
        for i in data.slabs.indices where Self.isInStore(data.slabs[i].status) {
            data.slabs[i].status = back
            count += 1
        }
        for i in data.sealed.indices where Self.isInStore(data.sealed[i].status) {
            data.sealed[i].status = back
            count += 1
        }
        data.cardStore = nil
        var lines: [String] = []
        let stock = count > 0 ? " \(count) item\(count == 1 ? "" : "s") come\(count == 1 ? "s" : "") home tomorrow." : ""
        if evicted {
            addReputation(-Balance.evictionReputationCost)
            lines.append("You could not pay the store rent. The landlord locked \(s.name) and kept the \(money(s.deposit)) deposit. Reputation −\(Balance.evictionReputationCost).\(stock)")
        } else {
            addLedger(s.deposit, .refund, "Deposit back · \(s.name)")
            lines.append("You closed \(s.name). The landlord gave back the \(money(s.deposit)) deposit.\(stock)")
        }
        for line in lines { log(line) }
        save()
        return lines
    }

    // MARK: - Fixtures, prices, staff, and hours

    func canBuyFixture(_ fixture: StoreFixture) -> Bool {
        guard let s = data.cardStore else { return false }
        return !s.has(fixture) && canAfford(fixture.cost)
    }

    func buyFixture(_ fixture: StoreFixture) {
        guard canBuyFixture(fixture), var s = data.cardStore else { return }
        addLedger(-fixture.cost, .storeSetup, "\(fixture.name) · \(s.name)")
        s.fixtures.append(fixture)
        data.cardStore = s
        log("Bought the \(fixture.name.lowercased()) for \(s.name).", cash: -fixture.cost)
        save()
    }

    func setStorePrice(_ factor: Double) {
        guard var s = data.cardStore else { return }
        s.priceFactor = factor
        data.cardStore = s
        save()
    }

    func setClerk(_ on: Bool) {
        guard var s = data.cardStore, s.clerk != on else { return }
        s.clerk = on
        data.cardStore = s
        log(on ? "Hired a clerk for \(s.name) at \(money(Balance.clerkWage)) a day." : "Let the clerk at \(s.name) go.")
        save()
    }

    func toggleOpenDay(_ weekday: Int) {
        guard var s = data.cardStore else { return }
        if s.openDays.contains(weekday) { s.openDays.removeAll { $0 == weekday } } else { s.openDays = (s.openDays + [weekday]).sorted() }
        data.cardStore = s
        save()
    }

    // MARK: - Stock

    static func isInStore(_ status: ItemStatus?) -> Bool {
        if case .inStore = status { return true }
        return false
    }

    /// Everything on the store's shelves and in its cases.
    var storeStock: (cards: [OwnedCard], sealed: [SealedItem]) {
        ((data.raw + data.slabs).filter { Self.isInStore($0.status) }, data.sealed.filter { Self.isInStore($0.status) })
    }

    /// What the player can put in the store: free, not kept, and not a known fake.
    var stockable: (cards: [OwnedCard], sealed: [SealedItem]) {
        let stock = showStock
        return (stock.cards.filter { !$0.isKnownFake }, stock.sealed.filter { !$0.isKnownFake })
    }

    var storeCardSlots: Int {
        Balance.storeCardSlots + (data.cardStore?.has(.extraCase) == true ? Balance.extraCaseSlots : 0)
    }

    var storeSealedSlots: Int {
        Balance.storeSealedSlots + (data.cardStore?.has(.sealedWall) == true ? Balance.sealedWallSlots : 0)
    }

    /// The shelf price of an item with this market value.
    func storePrice(_ market: Double) -> Double {
        ShowSession.round(market * (data.cardStore?.priceFactor ?? Balance.storeDefaultPrice))
    }

    /// Puts items in the store, up to the room in the cases and on the shelves. Returns how many went in.
    @discardableResult
    func stockStore(_ ids: Set<UUID>) -> Int {
        guard data.cardStore != nil else { return 0 }
        let stock = storeStock
        let cardRoom = storeCardSlots - stock.cards.count
        let sealedRoom = storeSealedSlots - stock.sealed.count
        let pick = stockable
        let cardIDs = Set(pick.cards.filter { ids.contains($0.id) }.sorted { $0.market > $1.market }.map(\.id)
            .prefix(max(0, cardRoom)))
        let sealedIDs = Set(pick.sealed.filter { ids.contains($0.id) }.map(\.id).prefix(max(0, sealedRoom)))
        let placed = ItemStatus.inStore(since: data.day)
        for i in data.raw.indices where cardIDs.contains(data.raw[i].id) { data.raw[i].status = placed }
        for i in data.slabs.indices where cardIDs.contains(data.slabs[i].id) { data.slabs[i].status = placed }
        for i in data.sealed.indices where sealedIDs.contains(data.sealed[i].id) { data.sealed[i].status = placed }
        let count = cardIDs.count + sealedIDs.count
        guard count > 0 else { return 0 }
        log("Put \(count) item\(count == 1 ? "" : "s") in \(data.cardStore?.name ?? "the store").")
        save()
        return count
    }

    /// Takes items off the shelves. They are in hand at once.
    func takeBackFromStore(_ ids: Set<UUID>) {
        for i in data.raw.indices where ids.contains(data.raw[i].id) && Self.isInStore(data.raw[i].status) { data.raw[i].status = nil }
        for i in data.slabs.indices where ids.contains(data.slabs[i].id) && Self.isInStore(data.slabs[i].status) { data.slabs[i].status = nil }
        for i in data.sealed.indices where ids.contains(data.sealed[i].id) && Self.isInStore(data.sealed[i].status) { data.sealed[i].status = nil }
        save()
    }

    // MARK: - Customers

    /// The mean number of customers on a day, if the store is open the whole day.
    func expectedCustomers(day: Int) -> Double {
        guard let s = data.cardStore else { return 0 }
        var mean = s.location.traffic * Balance.storeWeekdayTraffic[day % 7]
        mean *= 1 + Balance.storeReputationStep * Double(reputationTier)
        if hasAccount { mean *= 1 + Balance.storeFollowerStep * Double(followerTier) }
        if s.has(.sign) { mean *= Balance.signTrafficBonus }
        if s.has(.playTables), day % 7 == 4 { mean *= Balance.tournamentTrafficBonus }
        if day >= s.openDay, day < s.openDay + Balance.grandOpeningDays { mean *= Balance.grandOpeningBonus }
        // Empty shelves turn people away. A full store draws a few more.
        let stock = storeStock
        mean *= min(1.2, 0.4 + Double(stock.cards.count + stock.sealed.count) / 50)
        return mean
    }

    var storeOpenToday: Bool {
        guard let s = data.cardStore else { return false }
        return data.day >= s.openDay && s.openDays.contains(weekday)
    }

    /// The hour the player can start at the counter today. A work day pushes it to the end of the shift.
    var counterStart: Double {
        var start = max(data.hour, Balance.storeOpen)
        if worksToday && start < Balance.workEnd { start = max(start, Balance.workEnd) }
        return start
    }

    /// Why the player cannot work the counter now, or nil when they can.
    var counterBlock: String? {
        guard let s = data.cardStore else { return "You have no store" }
        if data.day < s.openDay { return "Opens on day \(s.openDay + 1)" }
        if !s.openDays.contains(weekday) { return "Closed today" }
        if s.counterDay == data.day { return "Done for today" }
        if counterStart > Balance.storeClose - 0.5 {
            return worksToday && data.hour < Balance.workEnd ? "You work until 5 PM, too late to open" : "Closed for today"
        }
        return nil
    }

    /// The player works the counter until closing: walk-in buyers, traders, and people who sell their collections.
    func startCounter() -> ShowSession? {
        guard counterBlock == nil, var s = data.cardStore else { return nil }
        data.hour = counterStart
        s.counterDay = data.day
        s.counterHours = 0
        data.cardStore = s
        seedContacts()
        let venue = Venue(kind: .store, name: s.name,
                          detail: "\(s.location.name) · \(GameStore.clock(Balance.storeOpen)) – \(GameStore.clock(Balance.storeClose))",
                          open: Balance.storeOpen, close: Balance.storeClose, hours: Balance.storeClose - Balance.storeOpen,
                          visitorsMean: expectedCustomers(day: data.day) * Balance.counterVisitorShare,
                          sellerShare: Balance.storeSellerShare, regularShare: 0.35, hasFloor: false, hasTable: true,
                          fakeSource: .stranger)
        save()
        let session = ShowSession(venue: venue, store: self, vendors: [], regulars: storeRegulars())
        session.markup = s.priceFactor
        session.openTable()
        return session
    }

    /// The regulars who come in today. The same day always gives the same people.
    private func storeRegulars() -> [String] {
        var r = SeededRandom(seed: UInt64(data.day + 1) &* 48_271 &+ 7)
        return data.contacts.filter { c in
            !c.kind.isVendor && c.kind != .gameShop && r.next() < 0.4
        }.map(\.id).shuffled()
    }

    /// The counter session is over. The clerk covers the rest of the open hours.
    func finishCounter(_ session: ShowSession) {
        let worked = max(0, (session.minute - session.startMinute) / 60)
        data.hour = max(data.hour, min(Balance.storeClose, Balance.storeOpen + session.minute / 60))
        guard var s = data.cardStore else { return }
        s.counterHours = worked
        var record = s.history.last?.day == data.day ? s.history.removeLast() : StoreDay(day: data.day)
        record.customers += session.sold.count + session.bought.count + session.trades.count + session.walkedAway
        record.sold += session.sold.count
        record.revenue += session.soldTotal
        s.history.append(record)
        data.cardStore = s
        let count = session.sold.count + session.bought.count + session.trades.count
        log("Worked the counter at \(s.name) for \(formatHours(worked)): \(count) deal\(count == 1 ? "" : "s"), \(money(session.soldTotal)) in sales, \(money(session.boughtTotal)) spent.")
    }

    // MARK: - End Day

    /// The day at the store, before the clock moves: the clerk's sales, wages, the tournament, and shoplifting.
    func storeDayEnd() -> [String] {
        guard var s = data.cardStore else { return [] }
        let today = data.day
        if today < s.openDay {
            return today + 1 == s.openDay ? ["The build-out is done. \(s.name) has its grand opening tomorrow."] : []
        }
        guard s.openDays.contains(today % 7) else { return [] }
        var lines: [String] = []
        let worked = s.counterDay == today ? s.counterHours : 0
        let hours = Balance.storeClose - Balance.storeOpen
        let share = s.clerk ? max(0, 1 - worked / hours) : 0
        var record = s.history.last?.day == today ? s.history.removeLast() : StoreDay(day: today)
        if s.clerk {
            addLedger(-Balance.clerkWage, .wages, "Clerk · \(s.name)")
            record.costs += Balance.clerkWage
        }
        if share > 0 {
            let result = rollStoreSales(share: share, storeName: s.name, casualShare: s.location.casualShare)
            record.customers += result.customers
            record.sold += result.sold
            record.revenue += result.revenue
            if result.sold > 0 {
                lines.append("\(s.name) sold \(result.sold) item\(result.sold == 1 ? "" : "s") for \(money(result.revenue)) to \(result.customers) customer\(result.customers == 1 ? "" : "s").")
            } else if result.customers > 0 {
                lines.append("\(result.customers) customer\(result.customers == 1 ? "" : "s") came into \(s.name), but nobody bought.")
            }
        } else if worked == 0 {
            lines.append("Nobody worked at \(s.name) today, so it stayed closed.")
        }
        // The Friday tournament needs someone in the store.
        if s.has(.playTables), today % 7 == 4, s.clerk || worked > 0 {
            let players = Int(Double(Int.random(in: Balance.tournamentPlayers)) * (1 + 0.1 * Double(reputationTier)))
            let net = Double(players) * Balance.tournamentNetPerPlayer
            addLedger(net, .storeEvents, "Friday tournament · \(players) players · \(s.name)")
            record.revenue += net
            lines.append("\(players) players came to the Friday tournament at \(s.name). You made \(money(net)) after prizes.")
        }
        if s.clerk, share > 0, !s.has(.cameras), Double.random(in: 0..<1) < Balance.shopliftChance,
           let card = storeStock.cards.filter({ $0.realMarket <= Balance.shopliftMaxValue }).randomElement() {
            let id = card.id
            data.raw.removeAll { $0.id == id }
            data.slabs.removeAll { $0.id == id }
            lines.append("Someone walked out of \(s.name) with your \(card.print.name) (\(money(card.realMarket))). Security cameras stop this.")
        }
        s.history.append(record)
        s.history.removeAll { $0.day < today - 27 }
        data.cardStore = s
        return lines
    }

    /// The clerk's customers. Each one looks at the stock and buys when the shelf price is under what they pay.
    private func rollStoreSales(share: Double, storeName: String, casualShare: Double)
        -> (customers: Int, sold: Int, revenue: Double) {
        let mean = expectedCustomers(day: data.day) * share
        let customers = max(0, Int((mean + Double.random(in: -2...2)).rounded()))
        var sold = 0
        var revenue = 0.0
        for _ in 0..<customers {
            guard Double.random(in: 0..<1) >= Balance.storeBrowseChance else { continue }
            let casual = Double.random(in: 0..<1) < casualShare
            let items = storeShelf().filter { !casual || storePrice($0.market) <= Balance.storeCasualBudget }
            guard let item = pickForCustomer(items) else { continue }
            let limit = item.market * Double.random(in: Balance.storeBuyerLimit)
            let price = storePrice(item.market)
            guard price <= limit else { continue }
            sellFromStore(item, price: price, storeName: storeName)
            sold += 1
            revenue += price
            // A casual buyer at the pack rack often takes a few.
            if casual, item.isPack {
                for _ in 0..<Int.random(in: 0...2) {
                    guard let more = storeShelf().first(where: { $0.isPack && $0.productKey == item.productKey }) else { break }
                    sellFromStore(more, price: price, storeName: storeName)
                    sold += 1
                    revenue += price
                }
            }
        }
        return (customers, sold, revenue)
    }

    /// One item in the store, as the customers see it.
    struct StoreShelfItem {
        let id: UUID
        let name: String
        let market: Double
        let paid: Double?
        let setSlug: String
        let isCard: Bool
        let isPack: Bool
        let productKey: String
        let fake: FakeTier?
        let known: Bool
    }

    func storeShelf() -> [StoreShelfItem] {
        let stock = storeStock
        let cards = stock.cards.map { c in
            StoreShelfItem(id: c.id, name: c.print.name + (c.grade.map { " " + $0.label } ?? ""), market: c.realMarket, paid: c.paid,
                      setSlug: c.setSlug, isCard: true, isPack: false, productKey: "", fake: c.fake, known: c.isKnownFake)
        }
        let sealed = stock.sealed.map { s in
            StoreShelfItem(id: s.id, name: s.name, market: realMarket(of: s), paid: s.paid, setSlug: s.setSlug, isCard: false,
                      isPack: s.packs == 1, productKey: s.productID ?? s.name, fake: s.fake, known: s.isKnownFake)
        }
        return cards + sealed
    }

    /// People look at the better items first, the same as at a show.
    private func pickForCustomer(_ items: [StoreShelfItem]) -> StoreShelfItem? {
        let weights = items.map { sqrt(max($0.market, 0.5)) }
        let total = weights.reduce(0, +)
        guard total > 0 else { return items.first }
        var roll = Double.random(in: 0..<total)
        for (item, w) in zip(items, weights) {
            if roll < w { return item }
            roll -= w
        }
        return items.last
    }

    private func sellFromStore(_ item: StoreShelfItem, price: Double, storeName: String) {
        let id = item.id
        if item.isCard {
            data.raw.removeAll { $0.id == id }
            data.slabs.removeAll { $0.id == id }
        } else {
            data.sealed.removeAll { $0.id == id }
        }
        addLedger(price, .sale, "\(item.name) · \(storeName)")
        addReceipt(name: item.name, venue: storeName, price: price, net: price, paid: item.paid)
        if let fake = item.fake {
            recordBadSale(item: item.name, channel: storeName, price: price, fake: fake, known: item.known, refunds: false)
        }
    }

    /// Store rent, after the clock moves. A missed rent closes the store, but the run goes on.
    func storeRentDue() -> [String] {
        guard let s = data.cardStore else { return [] }
        let since = data.day - s.leaseDay
        guard since > 0 else { return [] }
        let rent = s.location.rent
        if since % Balance.rentCycleDays == 0 {
            guard canAfford(rent) else { return closeStore(evicted: true) }
            addLedger(-rent, .storeRent, "Store rent · \(s.name)")
            if var now = data.cardStore {
                if now.history.last?.day == data.day - 1 { now.history[now.history.count - 1].costs += rent }
                data.cardStore = now
            }
            return ["Store rent paid: \(money(rent)) for \(s.name)."]
        }
        if Balance.rentCycleDays - since % Balance.rentCycleDays == Balance.rentWarningDays {
            return ["Store rent of \(money(rent)) for \(s.name) is due in \(Balance.rentWarningDays) days."]
        }
        return []
    }

    // MARK: - Numbers for the store screen

    /// Revenue, costs, and customers over the last `days` days.
    func storeTotals(days: Int) -> (revenue: Double, costs: Double, customers: Int, sold: Int) {
        let recent = (data.cardStore?.history ?? []).filter { data.day - $0.day < days }
        return (recent.reduce(0) { $0 + $1.revenue }, recent.reduce(0) { $0 + $1.costs },
                recent.reduce(0) { $0 + $1.customers }, recent.reduce(0) { $0 + $1.sold })
    }

    // MARK: - Test tools

    /// A store that opens today, with no cost and no requirements.
    func testOpenCardStore(_ location: StoreLocation = .mainStreet) {
        data.cardStore = CardStoreState(name: "Test Cards", location: location, leaseDay: data.day, openDay: data.day,
                                        deposit: location.rent)
        save()
    }
}
