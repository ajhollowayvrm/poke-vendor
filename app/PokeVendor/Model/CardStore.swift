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
}

/// A one-time buy for the store. The store keeps it until the store closes.
enum StoreFixture: String, Codable, CaseIterable, Hashable {
    case extraCase, sealedWall, playTables, cameras, sign, pos, backRoom
    /// The back room holds more cases, and acrylic cases make sealed product on the shelf look cheaper to a customer.
    case backRoomShelving, acrylicCases
    /// A rack of loose packs by the register: room for many packs, and pack buyers (docs/38-loose-packs-and-straight-buys.md).
    case packDisplay

    var name: String {
        switch self {
        case .extraCase: "Second display case"
        case .sealedWall: "Sealed wall"
        case .playTables: "Play tables"
        case .cameras: "Security cameras"
        case .sign: "Lighted sign"
        case .pos: "Point-of-sale system"
        case .backRoom: "Back room"
        case .backRoomShelving: "Back room shelving"
        case .acrylicCases: "Acrylic sealed cases"
        case .packDisplay: "Loose-pack display"
        }
    }

    var detail: String {
        switch self {
        case .extraCase: "Room for \(Balance.extraCaseSlots) more cards and slabs."
        case .sealedWall: "Room for \(Balance.sealedWallSlots) more sealed products."
        case .playTables: "Events: a Friday tournament and a weekend Pokemon League. Entry fees, and more people in the store."
        case .cameras: "Stops shoplifting on the days the clerk is alone."
        case .sign: "\(Int((Balance.signTrafficBonus - 1) * 100))% more customers every day."
        case .pos: "The clerk sells as well as you do: a scanner, prices on screen, and a card terminal."
        case .backRoom: "Holds up to \(Balance.backRoomCases) sealed cases off the shelf. When a product runs low on the shelf, the store opens a case of it and restocks."
        case .backRoomShelving: "The back room holds \(Balance.backRoomShelvingCases) cases instead of \(Balance.backRoomCases)."
        case .acrylicCases: "Sealed items on the shelf sell as if the price were \(Int(((1 - Balance.acrylicPerceivedFactor) * 100).rounded()))% lower. You still get the full price."
        case .packDisplay: "Holds \(Balance.packDisplaySlots) loose packs off the sealed shelf. Many customers grab a few packs on the way out."
        }
    }

    var icon: String {
        switch self {
        case .extraCase: "rectangle.grid.2x2"
        case .sealedWall: "square.stack.3d.up"
        case .playTables: "gamecontroller"
        case .cameras: "video.badge.checkmark"
        case .sign: "lightbulb.max"
        case .pos: "barcode.viewfinder"
        case .backRoom: "shippingbox.fill"
        case .backRoomShelving: "square.grid.3x3.fill"
        case .acrylicCases: "square.stack.3d.down.right"
        case .packDisplay: "rectangle.stack.fill"
        }
    }

    /// A fixture that must come first.
    var requires: StoreFixture? { self == .backRoomShelving ? .backRoom : nil }

    var cost: Double { Balance.fixtureCosts[self] ?? 0 }
}

/// The free sealed room in the store: the pack display, then the sealed shelf (`GameStore.sealedRoom`).
struct SealedRoom {
    var display: Int
    var shelf: Int
    /// The sealed slots in use. Packs on the display do not count.
    var used: Int
    var packsOnDisplay: Int
    var total: Int { display + shelf }

    /// Takes a slot for one unit, and returns false when there is no room. A loose pack takes a display slot first.
    mutating func take(_ item: SealedItem) -> Bool {
        if item.isLoosePack, display > 0 { display -= 1; return true }
        guard shelf > 0 else { return false }
        shelf -= 1
        return true
    }
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
    /// The grand opening, after the build-out. A missing opening task moves it (Model/StoreOpening.swift).
    var openDay: Int
    /// The landlord gives it back when the player closes the store, but not after an eviction.
    let deposit: Double
    /// The old store-wide price. Only an old save has it. It counts for singles and sealed until the player sets a price
    /// (`singlesPrice`, `sealedPrice` in `Model/StorePricing.swift`).
    var priceFactor: Double?
    /// The shelf price of singles, and of slabs with no own price, as a share of market.
    var singlesFactor: Double?
    /// The shelf price of sealed product, as a share of market.
    var sealedFactor: Double?
    var clerk = false
    /// The weekdays the store opens. 0 is Monday.
    var openDays: [Int] = Array(0..<7)
    var fixtures: [StoreFixture] = []
    /// The last day the player worked the counter, and for how many hours.
    var counterDay = -1
    var counterHours = 0.0
    /// The clock hour when the player started the counter that day. Nil: the store opening (an older save).
    var counterFrom: Double?
    /// The posted hours (Model/StoreHours.swift). Nil: 11 AM to 7 PM. A change waits in `pendingHours` until tomorrow.
    var hours: StoreHours?
    var pendingHours: StoreHours?
    /// The shelf price of a loose pack, as a share of market. Nil: the sealed price (Model/StorePricing.swift).
    var packFactor: Double?
    /// Refill the pack display from the back room below this share of it. Nil: off (Model/StorePricing.swift).
    var packRefill: Double?
    /// The pull box discount off the shelf price. Nil: 5% (Model/PullBoxes.swift).
    var pullDiscount: Double?
    var history: [StoreDay] = []
    /// The events (docs/22-own-store.md#events). Optional, so old saves still load.
    var events: StoreEvents?
    /// The buylist, store credit, and the bulk box. Optional, so old saves still load.
    var sourcing: StoreSourcing?
    /// The term of the lease. Nil on a store from an old save.
    var lease: StoreLease?
    /// Consignment, expiring credit, the sealed buylist, and the bigger space (`Model/StoreExtras.swift`). Optional, so old saves still load.
    var extras: StoreExtras?
    /// The business side: awareness, rating, loyalty, reviews (`Model/StoreBusiness.swift`). Nil: the baseline.
    var business: BusinessState?

    func has(_ fixture: StoreFixture) -> Bool { fixtures.contains(fixture) }
}

extension Balance {
    static let storeRent: [StoreLocation: Double] = [.stripMall: 1400, .mainStreet: 2400, .mall: 3800]
    static let storeBuildout: [StoreLocation: Double] = [.stripMall: 3500, .mainStreet: 5000, .mall: 7000]
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
    /// With the acrylic cases, a customer judges a sealed price at this share of the shelf price.
    static let acrylicPerceivedFactor = 0.95
    static let storeCasualBudget = 30.0
    /// The share of customers who come to the counter when the player works it: to buy, to trade, or to sell.
    static let counterVisitorShare = 0.6
    /// A store gets more people who want to sell than a show table does.
    static let storeSellerShare = 0.32
    static let storeCardSlots = 40
    static let storeSealedSlots = 40
    static let extraCaseSlots = 60
    static let sealedWallSlots = 60
    static let fixtureCosts: [StoreFixture: Double] = [.extraCase: 500, .sealedWall: 400, .playTables: 700, .cameras: 350, .sign: 300, .pos: 900, .backRoom: 600,
                                                    .backRoomShelving: 400, .acrylicCases: 150, .packDisplay: 1200]
    /// The loose packs that the pack display holds, off the sealed shelf.
    static let packDisplaySlots = 150
    /// The chance that a store customer buys packs at the pack display, by type. A legacy store's customers have no type.
    static func packBuyChance(_ type: CustomerType?) -> Double {
        switch type {
        case .kids?: 0.55
        case .players?: 0.50
        case .collectors?: 0.20
        case .investors?: 0
        case .casual?, nil: 0.35
        }
    }
    /// A pack buyer takes 1 to 5 packs, with these weights.
    static let packLotWeights = [0.40, 0.25, 0.15, 0.10, 0.10]
    static let signTrafficBonus = 1.15
    static let tournamentPlayers = 8...16
    /// The clerk sells a bit worse than the owner: customers buy this often, and never take a second item.
    static let clerkSalesFactor = 0.85
    /// The chance on a clerk-only day, at a location with `shopliftTrafficBase` customers. It scales with traffic.
    static let shopliftChance = 0.05
    static let shopliftTrafficBase = 20.0
    static let shopliftMaxValue = 40.0
    static let shopliftMaxSealed = 30.0
    static let shopliftPackShare = 0.7
    static let shopliftSealedShare = 0.2
    static let shopliftMaxPacks = 3
    static let evictionReputationCost = 15
}

@MainActor
extension GameStore {
    // MARK: - The lease

    var cardStore: CardStoreState? { data.cardStore }

    /// The store is past its build-out and can open.
    /// Soft-opening days count: the store sells (Model/StoreOpening.swift).
    var storeIsBuilt: Bool { data.cardStore != nil && storeSells(on: data.day) }

    /// Every sale over the whole run, after fees.
    var lifetimeSales: Double {
        data.archivedSales + data.ledger.reduce(0) { $1.category == .sale && $1.amount > 0 ? $0 + $1.amount : $0 }
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
            StoreRequirement(id: "permit", label: "A seller's permit",
                             detail: hasSellerPermit ? "You have one." : "It costs \(money(Balance.sellerPermitFee)). Get it in the Wallet.",
                             met: hasSellerPermit),
        ]
    }

    var storeRequirementsMet: Bool { storeRequirements.allSatisfy(\.met) }

    /// The player's own cash pays the cost to sign and the seed money for the business account.
    func canSignLease(_ location: StoreLocation, term: Int, investor: Bool = false, seed: Double = 0) -> Bool {
        data.cardStore == nil && storeRequirementsMet
            && canAfford(location.upfront(term: term) - (investor ? investorMoney(location) : 0) + seed)
    }

    /// Signs the lease for `term` periods of 28 days: the first rent, the deposit, and the build-out. The store opens
    /// after the build-out. The two game shops notice. The business account opens with the cost to sign and `seed`
    /// from the player's own cash (Model/BusinessAccount.swift).
    func signLease(_ location: StoreLocation, term: Int, name: String, investor: Bool = false, seed: Double = 0) {
        guard canSignLease(location, term: term, investor: investor, seed: seed) else { return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let title = trimmed.isEmpty ? "Card Corner" : String(trimmed.prefix(30))
        let rent = location.rent(term: term)
        var state = CardStoreState(name: title, location: location, leaseDay: data.day,
                                   openDay: data.day + Balance.storeBuildDays, deposit: rent)
        // A new store starts unknown (Model/StoreBusiness.swift).
        var business = BusinessState()
        business.awareness = Balance.bizAwarenessNew
        // The opening tasks (Model/StoreOpening.swift), and the investor's money.
        business.opening = OpeningPlan()
        let investorPart = investor ? investorMoney(location) : 0
        if investor { business.investor = Investor(invested: investorPart, share: Balance.investorProfitShare) }
        state.business = business
        state.lease = StoreLease(periods: term, endDay: data.day + term * Balance.rentCycleDays, rent: rent)
        data.cardStore = state
        let contribution = location.upfront(term: term) - investorPart + seed
        openBusinessAccount(storeName: title, contribution: contribution)
        if investor { bizLedger(investorPart, .startingCapital, "Investor money · \(title)") }
        bizLedger(-rent, .storeRent, "First rent · \(title)")
        bizLedger(-rent, .storeSetup, "Security deposit · \(title)")
        bizLedger(-location.buildout, .storeSetup, "Build-out · \(title)")
        rivalShopsReact()
        log("Signed a \(term)-period lease at \(location.name). \(title) opens on day \(data.day + Balance.storeBuildDays + 1).",
            cash: -contribution)
        if seed > 0 { log("The business account of \(title) starts with \(money(seed)).") }
        log("Cardboard Castle and Top Deck Games lost \(Balance.rivalStandingLoss) standing with you. They do not consign for the competition.")
        save()
    }

    var daysUntilStoreRent: Int? {
        data.cardStore.map { Balance.rentCycleDays - (data.day - $0.leaseDay) % Balance.rentCycleDays }
    }

    /// Ends the lease. Every item in the store comes home tomorrow. The landlord keeps the deposit after an eviction,
    /// and after an early close, which also costs the buyout.
    @discardableResult
    func closeStore(evicted: Bool = false) -> [String] {
        guard let s = data.cardStore else { return [] }
        let buyout = evicted ? 0 : leaseBuyout(s)
        guard evicted || bizAfford(buyout) else { return ["The business account needs \(money(buyout)) to buy out the lease."] }
        let back = ItemStatus.arriving(daysLeft: 1, from: s.name)
        var count = 0
        for i in data.raw.indices where Self.isInStore(data.raw[i].status) {
            data.raw[i].status = back
            data.raw[i].onlineListing = nil
            count += 1
        }
        for i in data.slabs.indices where Self.isInStore(data.slabs[i].status) {
            data.slabs[i].status = back
            data.slabs[i].onlineListing = nil
            count += 1
        }
        for i in data.sealed.indices where Self.isInStore(data.sealed[i].status) {
            data.sealed[i].status = back
            data.sealed[i].onlineListing = nil
            data.sealed[i].backRoom = nil
            count += 1
        }
        data.bulk += s.source.bulkBox
        var lines: [String] = []
        let stock = count > 0 ? " \(count) item\(count == 1 ? "" : "s") come\(count == 1 ? "s" : "") home tomorrow." : ""
        // Customers get their order and hold deposits back (Model/CounterEvents.swift).
        refundCounterDeposits()
        // The business account pays the buyout or takes the deposit back, then closes (Model/BusinessAccount.swift).
        if evicted {
            addReputation(-Balance.evictionReputationCost)
            lines.append("The business account could not pay the store rent. The landlord locked \(s.name) and kept the \(money(s.deposit)) deposit. Reputation −\(Balance.evictionReputationCost).\(stock)")
        } else if buyout > 0 {
            bizLedger(-buyout, .storeRent, "Lease buyout · \(s.name)")
            lines.append("You closed \(s.name) before the lease ended. The business paid \(money(buyout)) to leave, and the landlord kept the \(money(s.deposit)) deposit.\(stock)")
        } else {
            bizLedger(s.deposit, .refund, "Deposit back · \(s.name)")
            lines.append("You closed \(s.name). The landlord gave back the \(money(s.deposit)) deposit.\(stock)")
        }
        if let line = closeBusinessAccount(storeName: s.name) { lines.append(line) }
        data.cardStore = nil
        if let line = consignmentCloseLine(s) { lines.append(line) }
        if let line = storeMachineHome() { lines.append(line) }
        for line in lines { log(line) }
        save()
        return lines
    }

    // MARK: - Fixtures, prices, staff, and hours

    func canBuyFixture(_ fixture: StoreFixture) -> Bool {
        guard let s = data.cardStore else { return false }
        return !s.has(fixture) && bizAfford(fixture.cost) && (fixture.requires.map(s.has) ?? true)
    }

    func buyFixture(_ fixture: StoreFixture) {
        guard canBuyFixture(fixture), var s = data.cardStore else { return }
        bizLedger(-fixture.cost, .storeSetup, "\(fixture.name) · \(s.name)")
        s.fixtures.append(fixture)
        data.cardStore = s
        log("Bought the \(fixture.name.lowercased()) for \(s.name).", cash: -fixture.cost)
        save()
    }

    /// Turns the staff on with the standard clerk, or lets every staff member go (Model/StoreStaff.swift).
    func setClerk(_ on: Bool) {
        guard var s = data.cardStore, s.clerk != on else { return }
        s.clerk = on
        var b = s.business ?? { var x = BusinessState(); x.legacy = true; return x }()
        b.staff = on ? [.standard] : []
        s.business = b
        data.cardStore = s
        log(on ? "Hired a clerk for \(s.name) at \(money(Employee.standard.wage * storeHoursLength)) a day." : "Let the clerk at \(s.name) go.")
        save()
    }

    func toggleOpenDay(_ weekday: Int) {
        // Closing today while the shift waits is a lock-up, with its cost (Model/StoreShift.swift).
        if weekday == self.weekday, storeShiftPending, data.cardStore?.openDays.contains(weekday) == true { _ = lockUp() }
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

    /// Everything on the store's shelves and in its cases. A case in the back room is not here: no customer sees it.
    var storeStock: (cards: [OwnedCard], sealed: [SealedItem]) {
        ((data.raw + data.slabs).filter { Self.isInStore($0.status) }, data.sealed.filter { Self.isInStore($0.status) && !$0.inBackRoom })
    }

    /// What the player can put in the store: free, not in the PC or a master set, and not a known fake.
    /// A case needs the back room.
    var stockable: (cards: [OwnedCard], sealed: [SealedItem]) {
        let stock = showStock
        let room = hasBackRoom
        return (stock.cards.filter { !$0.isKnownFake && !$0.pc }, stock.sealed.filter { !$0.isKnownFake && !$0.pc && (room || !$0.isCase) })
    }

    var storeCardSlots: Int {
        Balance.storeCardSlots + (data.cardStore?.has(.extraCase) == true ? Balance.extraCaseSlots : 0) + (data.cardStore?.spaceSlots ?? 0)
    }

    var storeSealedSlots: Int {
        Balance.storeSealedSlots + (data.cardStore?.has(.sealedWall) == true ? Balance.sealedWallSlots : 0) + (data.cardStore?.spaceSlots ?? 0)
    }

    /// The loose packs that the pack display holds. Zero without the display.
    var packDisplaySlots: Int { data.cardStore?.has(.packDisplay) == true ? Balance.packDisplaySlots : 0 }

    /// The free room for sealed units, from the sealed items on the shelf (`storeStock.sealed`). Loose packs fill the
    /// pack display first. Only the packs above it use sealed slots (docs/38-loose-packs-and-straight-buys.md).
    func sealedRoom(_ shelf: [SealedItem]) -> SealedRoom {
        let packs = shelf.filter(\.isLoosePack).count
        let display = packDisplaySlots
        let used = shelf.count - packs + max(0, packs - display)
        return SealedRoom(display: max(0, display - packs), shelf: max(0, storeSealedSlots - used), used: used,
                          packsOnDisplay: min(packs, display))
    }

    /// The items of `ids` that fit in the store now: the dearest cards first, up to the room in the cases, on the
    /// shelves, and in the back room. `wanted` is how many of `ids` could go in if the store had the room.
    func stockPlan(_ ids: Set<UUID>) -> (cards: Set<UUID>, sealed: Set<UUID>, wanted: Int) {
        guard data.cardStore != nil, !ids.isEmpty else { return ([], [], 0) }
        let stock = storeStock
        let cardRoom = storeCardSlots - storeCardsUsed
        var room = sealedRoom(stock.sealed)
        let caseRoom = backRoomCapacity - backRoomCases.count
        let pick = stockable
        let cards = pick.cards.filter { ids.contains($0.id) }
        let sealed = pick.sealed.filter { ids.contains($0.id) }
        let cardIDs = Set(cards.sorted { $0.market > $1.market }.map(\.id).prefix(max(0, cardRoom)))
        // Units use the shelf room. Cases use the back room.
        let unitIDs = sealed.filter { !$0.isCase && room.take($0) }.map(\.id)
        let caseIDs = sealed.filter(\.isCase).map(\.id).prefix(max(0, caseRoom))
        return (cardIDs, Set(unitIDs + caseIDs), cards.count + sealed.count)
    }

    /// Puts items in the store, up to the room in the cases and on the shelves. Returns how many went in.
    @discardableResult
    func stockStore(_ ids: Set<UUID>) -> Int {
        let plan = stockPlan(ids)
        let cardIDs = plan.cards, sealedIDs = plan.sealed
        let placed = ItemStatus.inStore(since: data.day)
        for i in data.raw.indices where cardIDs.contains(data.raw[i].id) { data.raw[i].status = placed }
        for i in data.slabs.indices where cardIDs.contains(data.slabs[i].id) { data.slabs[i].status = placed }
        for i in data.sealed.indices where sealedIDs.contains(data.sealed[i].id) {
            data.sealed[i].status = placed
            data.sealed[i].backRoom = nil
        }
        let count = cardIDs.count + sealedIDs.count
        guard count > 0 else { return 0 }
        log("Put \(count) item\(count == 1 ? "" : "s") in \(data.cardStore?.name ?? "the store").")
        save()
        return count
    }

    /// Takes items off the shelves. They are in hand at once.
    func takeBackFromStore(_ ids: Set<UUID>) {
        cancelHolds(ids)
        // An item with an online listing stays listed.
        for i in data.raw.indices where ids.contains(data.raw[i].id) && Self.isInStore(data.raw[i].status) {
            data.raw[i].status = data.raw[i].onlineListing.map(ItemStatus.listed)
            data.raw[i].onlineListing = nil
        }
        for i in data.slabs.indices where ids.contains(data.slabs[i].id) && Self.isInStore(data.slabs[i].status) {
            data.slabs[i].status = data.slabs[i].onlineListing.map(ItemStatus.listed)
            data.slabs[i].onlineListing = nil
        }
        for i in data.sealed.indices where ids.contains(data.sealed[i].id) && Self.isInStore(data.sealed[i].status) {
            data.sealed[i].status = data.sealed[i].onlineListing.map(ItemStatus.listed)
            data.sealed[i].onlineListing = nil
            data.sealed[i].backRoom = nil
        }
        save()
    }

    // MARK: - Customers

    /// The mean number of customers on a day, if the store is open the whole day.
    func expectedCustomers(day: Int) -> Double {
        guard let s = data.cardStore else { return 0 }
        var mean = s.location.traffic * Balance.storeWeekdayTraffic[day % 7]
        // Longer hours and the busy hours bring more people (Model/StoreHours.swift). 1 for 11 AM to 7 PM.
        mean *= storeHoursTrafficFactor
        mean *= 1 + Balance.storeReputationStep * Double(reputationTier)
        if hasAccount { mean *= 1 + Balance.storeFollowerStep * Double(followerTier) }
        if s.has(.sign) { mean *= Balance.signTrafficBonus }
        mean *= PriceCycle.seasonTraffic(day: day)
        // Awareness, rating, and loyalty (Model/StoreBusiness.swift). 1 at the baseline.
        mean *= businessTrafficFactor
        if day >= s.openDay, day < s.openDay + Balance.grandOpeningDays { mean *= Balance.grandOpeningBonus }
        // A soft opening runs at part of the traffic (Model/StoreOpening.swift).
        if isSoftOpenDay(day) { mean *= Balance.softOpenTraffic }
        let event = eventTraffic(day: day)
        mean += event.tournament + event.league + event.glow
        // Empty shelves turn people away. A full store draws a few more.
        let stock = storeStock
        mean *= min(1.2, 0.4 + Double(stock.cards.count + stock.sealed.count + consignedCount) / 50)
        return mean
    }

    var storeOpenToday: Bool {
        guard let s = data.cardStore else { return false }
        return storeSells(on: data.day) && s.openDays.contains(weekday) && plannedClosure(on: data.day) == nil
    }

    /// The hour the player can start at the counter today. A work day pushes it to the end of the shift.
    var counterStart: Double {
        var start = max(data.hour, storeOpenHour)
        if worksToday && start < Balance.workEnd { start = max(start, Balance.workEnd) }
        return start
    }

    /// Why the player cannot work the counter now, or nil when they can.
    var counterBlock: String? {
        guard let s = data.cardStore else { return "You have no store" }
        // The counter that waits opens again from its buttons (Model/EventResume.swift).
        if waitingCounter != nil { return nil }
        if let block = eventBlock { return block }
        if !storeSells(on: data.day) { return "Opens on day \(s.openDay + 1)" }
        if !s.openDays.contains(weekday) { return "Closed today" }
        if s.counterDay == data.day { return "Done for today" }
        if lockedUpToday { return "Locked up today" }
        if counterStart > storeCloseHour - 0.5 {
            return worksToday && data.hour < Balance.workEnd ? "You work until 5 PM, too late to open" : "Closed for today"
        }
        return nil
    }

    /// The player works the counter until closing: walk-in buyers, traders, and people who sell their collections.
    func startCounter() -> ShowSession? {
        guard waitingCounter == nil, counterBlock == nil, var s = data.cardStore else { return nil }
        data.hour = counterStart
        s.counterDay = data.day
        s.counterHours = 0
        s.counterFrom = data.hour
        data.cardStore = s
        seedContacts()
        let venue = Venue(kind: .store, name: s.name,
                          detail: "\(s.location.name) · \(GameStore.clock(storeOpenHour)) – \(GameStore.clock(storeCloseHour))",
                          open: storeOpenHour, close: storeCloseHour, hours: storeHoursLength,
                          visitorsMean: expectedCustomers(day: data.day) * Balance.counterVisitorShare,
                          sellerShare: Balance.storeSellerShare, regularShare: 0.35, hasFloor: false, hasTable: true,
                          fakeSource: .stranger)
        save()
        let session = ShowSession(venue: venue, store: self, vendors: [], regulars: storeRegulars())
        session.markup = s.singlesPrice
        session.openTable()
        // The counter buys and sells for the store, so its money uses the business account (Model/BusinessAccount.swift).
        counterSession = session
        return session
    }

    /// The regulars who come in today. The same day always gives the same people.
    func storeRegulars() -> [String] {
        var r = SeededRandom(seed: UInt64(data.day + 1) &* 48_271 &+ 7)
        return data.contacts.filter { c in
            !c.kind.isVendor && c.kind != .gameShop && !c.kind.isSupplier && r.next() < 0.4
        }.map(\.id).shuffled()
    }

    /// The counter session is over. The clerk covers the rest of the open hours.
    func finishCounter(_ session: ShowSession) {
        defer { counterSession = nil }
        let worked = max(0, (session.minute - session.startMinute) / 60)
        let open = session.venue.open
        data.hour = max(data.hour, min(session.venue.close, open + session.minute / 60))
        guard var s = data.cardStore else { return }
        // In the owner's shift, a late start or an early exit leaves the door locked for that time: a part of a
        // lock-up (Model/StoreShift.swift, Model/StoreHours.swift).
        if let w = ownerWindow {
            let from = open + session.startMinute / 60, to = open + session.minute / 60
            let missed = max(0, min(w.end, from) - w.start) + max(0, w.end - max(w.start, to))
            if missed >= 1 {
                nudgeLoyalty(-Balance.lockUpLoyalty * missed / max(1, storeHoursLength))
                log("\(s.name) stood locked for \(formatHours(missed)) of your shift. Customers who came then found the door locked.")
                s = data.cardStore ?? s
            }
        }
        s.counterHours = worked
        var record = s.history.last?.day == data.day ? s.history.removeLast() : StoreDay(day: data.day)
        record.customers += session.sold.count + session.bought.count + session.trades.count + session.walkedAway
        record.sold += session.sold.count
        record.revenue += session.soldTotal
        s.history.append(record)
        data.cardStore = s
        redeemStoreCredit(sales: session.soldTotal)
        let count = session.sold.count + session.bought.count + session.trades.count
        log("Worked the counter at \(s.name) for \(formatHours(worked)): \(count) deal\(count == 1 ? "" : "s"), \(money(session.soldTotal)) in sales, \(money(session.boughtTotal)) spent.")
    }

    // MARK: - End Day

    /// The day at the store, before the clock moves: the clerk's sales, wages, the events, and shoplifting.
    func storeDayEnd() -> [String] {
        guard var s = data.cardStore else { return [] }
        let today = data.day
        if today < s.openDay, !isSoftOpenDay(today) {
            return today + 1 == s.openDay ? ["The build-out is done. \(s.name) has its grand opening tomorrow."] : []
        }
        guard s.openDays.contains(today % 7) else { return [] }
        // A closed day posted ahead (Model/StoreHours.swift).
        if plannedClosure(on: today) != nil { return closureDayEnd() }
        var lines: [String] = []
        // The staff at work today: their schedules, less the sick calls of the morning (Model/StoreHours.swift). Theft
        // (Model/StoreStaff.swift). The staff can change, so read the store again. The business account pays the
        // staff. With no money for the wages, the staff stays home (Model/BusinessAccount.swift).
        let wageToday = staffWageToday
        let onShift = !staffOnToday.isEmpty
        let unpaid = onShift && !bizAfford(wageToday)
        let crew = onShift && !unpaid ? staffDay(storeName: s.name) : (present: false, lines: [String]())
        lines += crew.lines
        if unpaid { lines.append("The business account of \(s.name) could not pay the staff today, so they stayed home. Move money into it.") }
        let wage = onShift && !unpaid ? wageToday : 0
        s = data.cardStore ?? s
        let staffed = onShift && crew.present
        let worked = s.counterDay == today ? s.counterHours : 0
        // The staff sell in the hours they cover, less the hours the player worked the counter in them.
        let from = s.counterFrom ?? storeOpenHour
        let counterShare = worked > 0 ? trafficShare(from: from, to: from + worked) : 0
        let share = staffed ? max(0, coveredWindows.reduce(0) { sum, w in
            sum + trafficShare(from: w.0, to: w.1) - (worked > 0 ? trafficShare(from: max(w.0, from), to: min(w.1, from + worked)) : 0)
        }) : 0
        var record = s.history.last?.day == today ? s.history.removeLast() : StoreDay(day: today)
        if wage > 0 {
            bizLedger(-wage, .wages, "Clerk · \(s.name)")
            record.costs += wage
        }
        if share > 0 {
            let result = rollStoreSales(share: share, storeName: s.name, casualShare: s.location.casualShare)
            record.customers += result.customers
            record.sold += result.sold
            record.revenue += result.revenue
            s.extras = data.cardStore?.extras
            data.cardStore = s
            let extra = storeSourcingDay(share: share, shelfSales: result.revenue)
            s = data.cardStore ?? s
            record.revenue += extra.revenue
            record.sold += extra.sold
            if result.sold > 0 {
                lines.append("\(s.name) sold \(result.sold) item\(result.sold == 1 ? "" : "s") for \(money(result.revenue)) to \(result.customers) customer\(result.customers == 1 ? "" : "s").")
            } else if result.customers > 0 {
                lines.append("\(result.customers) customer\(result.customers == 1 ? "" : "s") came into \(s.name), but nobody bought.")
            }
            lines += extra.lines
        } else if worked == 0 {
            lines.append("Nobody worked at \(s.name) today, so it stayed closed.")
        }
        let accessories = storeAccessoryDay(coverage: min(1, share + counterShare), storeName: s.name,
                                            casualShare: s.location.casualShare)
        record.revenue += accessories.revenue
        record.sold += accessories.sold
        lines += accessories.lines
        lines += runStoreEvents(&s, record: &record, worked: worked, today: today, staffed: staffed)
        if staffed, share > 0, !s.has(.cameras), Double.random(in: 0..<1) < shopliftChance(for: s.location),
           let stolen = stealFromStore() {
            lines.append("Someone walked out of \(s.name) with \(stolen) of your stock. Security cameras stop this.")
        }
        s.history.append(record)
        s.history.removeAll { $0.day < today - 27 }
        s.extras = data.cardStore?.extras
        s.business = data.cardStore?.business
        s.clerk = data.cardStore?.clerk ?? s.clerk
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
        // Event players are part of the crowd. League kids are small-budget. Tournament players want singles.
        let event = eventTraffic(day: data.day)
        let crowd = max(1, expectedCustomers(day: data.day))
        let kidShare = min(0.6, event.league / crowd)
        let playerShare = min(0.6, (event.tournament + event.glow) / crowd)
        // The pack display: one list of loose packs for the day. A sale takes its packs off the list.
        var packs = packDisplaySlots > 0 ? storeShelf().filter(\.isPack) : []
        for _ in 0..<customers {
            let browses = Double.random(in: 0..<1) < Balance.storeBrowseChance
            // The clerk loses some sales that the owner would close.
            let clerk = (data.cardStore?.has(.pos) == true ? Balance.posClerkFactor : Balance.clerkSalesFactor) * staffSalesFactor
            let roll = Double.random(in: 0..<1)
            let kid = roll < kidShare
            let player = !kid && roll < kidShare + playerShare
            // The other customers come from the location's mix (Model/StoreBusiness.swift).
            let type: CustomerType? = kid ? .kids : player ? .players : rollCustomerType()
            let casual = type?.smallBudget ?? false
            // Many customers, browsers too, grab a few packs from the display on the way out (docs/38).
            if !packs.isEmpty, Double.random(in: 0..<1) < Balance.packBuyChance(type), Double.random(in: 0..<1) < clerk * clerkPaymentFactor {
                let lot = sellPackLot(&packs, casual: casual, storeName: storeName)
                sold += lot.count
                revenue += lot.revenue
            }
            guard !browses else { continue }
            guard Double.random(in: 0..<1) < clerk * clerkPaymentFactor else { continue }
            var items = storeShelf().filter { !casual || shelfPrice($0) <= Balance.storeCasualBudget }
            switch type {
            case .collectors?:
                let better = items.filter { $0.market >= Balance.collectorMinValue }
                if !better.isEmpty { items = better }
            case .investors?:
                items = items.filter { !$0.isCard }
            default: break
            }
            // The impulse rack by the register sells more packs (Model/StoreFloor.swift).
            let packWeight = (type == .players ? Balance.eventPackWeight : 1) * (impulseRack ? Balance.impulsePackWeight : 1)
            guard let item = pickForCustomer(items, packWeight: packWeight) else { continue }
            // Investors know the market and pay less over it.
            // (A legacy store's customers have no type: the old rule.)
            let limit = item.market * Double.random(in: type == .investors ? Balance.investorBuyerLimit : Balance.storeBuyerLimit)
            let price = shelfPrice(item)
            guard perceivedPrice(item, price: price) <= limit else { continue }
            revenue += sellFromStore(item, price: price, storeName: storeName)
            sold += 1
            if item.isPack { packs.removeAll { $0.id == item.id } }
        }
        return (customers, sold, revenue)
    }

    /// A pack buyer at the pack display: 1 to 5 packs of one product, at the shelf price. One price check covers the lot.
    /// A small-budget customer stays in the casual budget. Returns the packs sold and the revenue.
    func sellPackLot(_ packs: inout [StoreShelfItem], casual: Bool, storeName: String) -> (count: Int, revenue: Double) {
        guard let first = pickForCustomer(packs) else { return (0, 0) }
        let price = shelfPrice(first)
        guard perceivedPrice(first, price: price) <= first.market * Double.random(in: Balance.packBuyerLimit) else { return (0, 0) }
        var want = Self.packLotSize()
        if casual { want = min(want, Int(Balance.storeCasualBudget / max(price, 0.01))) }
        let lot = Array(packs.filter { $0.productKey == first.productKey }.prefix(max(0, want)))
        var revenue = 0.0
        for pack in lot { revenue += sellFromStore(pack, price: shelfPrice(pack), storeName: storeName) }
        let sold = Set(lot.map(\.id))
        packs.removeAll { sold.contains($0.id) }
        return (lot.count, revenue)
    }

    /// How many packs a pack buyer takes: most take 1 or 2.
    static func packLotSize() -> Int {
        let roll = Double.random(in: 0..<1)
        var total = 0.0
        for (n, w) in Balance.packLotWeights.enumerated() {
            total += w
            if roll < total { return n + 1 }
        }
        return 1
    }

    /// The price that a customer judges. The acrylic cases make a sealed price look lower. The store still gets the full price.
    func perceivedPrice(_ item: StoreShelfItem, price: Double) -> Double { priceSeen(sealed: !item.isCard, price: price) }

    func priceSeen(sealed: Bool, price: Double) -> Double {
        sealed && data.cardStore?.has(.acrylicCases) == true ? price * Balance.acrylicPerceivedFactor : price
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
        /// A card that a customer left on consignment. The store keeps a cut (`Model/StoreConsignment.swift`).
        var consigned = false
        /// The item is a trusted case, or it came out of one (Model/Cases.swift). Customers pick it a little more.
        var caseFresh = false
    }

    func storeShelf() -> [StoreShelfItem] {
        // A held item waits for its customer (Model/CounterEvents.swift).
        let held = heldItemIDs
        let all = storeStock
        let stock = held.isEmpty ? all : (cards: all.cards.filter { !held.contains($0.id) }, sealed: all.sealed.filter { !held.contains($0.id) })
        let cards = stock.cards.map { c in
            StoreShelfItem(id: c.id, name: c.print.name + (c.grade.map { " " + $0.label } ?? ""), market: c.realMarket, paid: c.paid,
                      setSlug: c.setSlug, isCard: true, isPack: false, productKey: "", fake: c.fake, known: c.isKnownFake)
        }
        let sealed = stock.sealed.map { s in
            StoreShelfItem(id: s.id, name: s.name, market: realMarket(of: s), paid: s.paid, setSlug: s.setSlug, isCard: false,
                      isPack: s.isLoosePack, productKey: s.productID ?? s.name, fake: s.fake, known: s.isKnownFake,
                      caseFresh: s.isCaseFresh)
        }
        return cards + sealed + consignedShelfItems()
    }

    /// People look at the better items first, the same as at a show.
    private func pickForCustomer(_ items: [StoreShelfItem], packWeight: Double = 1) -> StoreShelfItem? {
        let weights = items.map { sqrt(max($0.market, 0.5)) * ($0.isPack ? packWeight : 1) * ($0.caseFresh ? Balance.caseFreshSaleBonus : 1) }
        let total = weights.reduce(0, +)
        guard total > 0 else { return items.first }
        var roll = Double.random(in: 0..<total)
        for (item, w) in zip(items, weights) {
            if roll < w { return item }
            roll -= w
        }
        return items.last
    }

    /// Returns what the store earns: the price, or the cut of a consigned card.
    @discardableResult
    func sellFromStore(_ item: StoreShelfItem, price: Double, storeName: String) -> Double {
        if item.consigned { return sellConsigned(item, price: price, storeName: storeName) }
        let id = item.id
        settleOnlineListing(id, name: item.name)
        if item.isCard {
            data.raw.removeAll { $0.id == id }
            data.slabs.removeAll { $0.id == id }
        } else {
            data.sealed.removeAll { $0.id == id }
        }
        bizLedger(price, .sale, "\(item.name) · \(storeName)")
        collectSalesTax(on: price, at: storeName)
        addReceipt(name: item.name, venue: storeName, price: price, net: price, paid: item.paid, ids: [item.id])
        if let fake = item.fake {
            recordBadSale(item: item.name, channel: storeName, price: price, fake: fake, known: item.known, refunds: false,
                          sealed: !item.isCard)
        }
        return price
    }

    /// Store rent and overhead, after the clock moves. A missed payment closes the store, but the run goes on.
    /// A lease that reaches the end of its term renews on the same terms.
    func storeRentDue() -> [String] {
        guard var s = data.cardStore else { return [] }
        let since = data.day - s.leaseDay
        guard since > 0 else { return [] }
        let rent = s.rent
        if since % Balance.rentCycleDays == 0 {
            let overhead = storeOverhead(s)
            guard bizAfford(rent + overhead.total) else { return closeStore(evicted: true) }
            bizLedger(-rent, .storeRent, "Store rent · \(s.name)")
            bizLedger(-overhead.total, .storeOverhead, "Store overhead · \(s.name)")
            addStoreCost(rent + overhead.total, to: &s)
            var lines = ["Store rent paid: \(money(rent)) for \(s.name).",
                         "Store overhead paid: \(money(overhead.total)). Card fees \(money(overhead.fees)), insurance \(money(overhead.insurance)), utilities \(money(overhead.utilities)), software \(money(overhead.software))."]
            if let lease = s.lease, data.day >= lease.endDay {
                let newEnd = lease.endDay + lease.periods * Balance.rentCycleDays
                s.lease?.endDay = newEnd
                lines.append("The lease of \(s.name) renewed for \(lease.periods) periods. It ends on day \(newEnd + 1).")
            }
            data.cardStore = s
            return lines
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

    #if DEBUG
    // MARK: - Test tools

    /// A store that opens today, with no cost and no requirements. The lease runs for `term` periods.
    func testOpenCardStore(_ location: StoreLocation = .mainStreet, term: Int = 12) {
        let rent = location.rent(term: term)
        var state = CardStoreState(name: "Test Cards", location: location, leaseDay: data.day, openDay: data.day, deposit: rent)
        state.lease = StoreLease(periods: term, endDay: data.day + term * Balance.rentCycleDays, rent: rent)
        data.cardStore = state
        rivalShopsReact()
        save()
    }
    #endif
}
