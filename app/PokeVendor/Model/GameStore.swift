import Foundation
import Observation

struct GameData: Codable {
    var day = 0
    var hour = Balance.dayStart
    var cash = 0.0
    var ledger: [LedgerEntry] = []
    var activity: [ActivityEntry] = []
    var jobIndex: Int? = 0
    var sickDaysLeft = Balance.sickDaysPerYear
    var sickToday = false
    var gameOver: String?

    var sealed: [SealedItem] = []
    var raw: [OwnedCard] = []
    var slabs: [OwnedCard] = []
    var bulk: [BulkGroup] = []
    /// The amount paid for opened product. The portfolio header counts it once.
    var openedPaid: Double = 0

    /// Store listings the player bought today. They leave the store until the next day.
    var boughtToday: [String] = []
    /// How many of each shelf item the player bought today.
    var shelfBought: [String: Int] = [:]
    var pokemonCenterAttempted = false
    var shops: [String: ShopState] = [:]
    var social = SocialState()
    /// The best centering tool the player owns: 0 is none (Balance.centeringTools).
    var centeringTool = 0
    /// Card shows on the calendar (docs/20-card-shows.md).
    var shows: [CardShow] = []
    var showsPlannedThrough = -1
    /// The vendor kit: the upgrade that lets the player book a table at a card show.
    var vendorKit = false
    /// Weekly shop items the player bought this week: display case singles and buy-ins.
    var weekBought: [String] = []
    /// Relationships and reputation (docs/21-relationships-and-reputation.md).
    var contacts: [Contact] = []
    var reputation = 0
    var wantList: [WantItem] = []
    var saved: [SavedItem] = []
    var scams: [ScamRecord] = []
    /// Meets and league nights the player went to (docs/15-selling.md, Local meets).
    var meetsAttended: [MeetRecord] = []
    /// Garage and estate sales on the calendar (docs/17-calendar-and-events.md, Posted entries).
    var sales: [PostedSale] = []
    var salesPlannedThrough = -1
    /// Hidden sales that a follower tipped, waiting for an answer.
    var saleTips: [UUID] = []
    /// "Store-day" keys of restocks the player camped, and test restocks.
    var campedDays: [String] = []
    var testRestocks: [String] = []
    /// Surprise opportunities (docs/17-calendar-and-events.md, Surprise entries).
    var opportunities: [Opportunity] = []
    /// The upgrades the player owns, by `Upgrade.rawValue` (docs/09-upgrades.md).
    var upgrades: [String] = []
    /// Sales of fakes that the buyer will find out about (docs/14-counterfeit-risk.md).
    var badSales: [BadSale] = []
    /// Buyer problems that arrive some days after an online sale (docs/15-selling.md, Buyer problems).
    var saleProblems: [SaleProblem] = []
    /// The tired factor today: 1 rested, 0.85 tired, 0.7 exhausted (docs/16-time-and-day.md, Late nights).
    var tiredToday = 1.0
    /// Hours past 11 PM last night, waiting for the morning choice.
    var lateHours = 0.0
    /// Scheduled live streams (docs/06-social-media.md, Live streams).
    var streams: [StreamPlan] = []
    /// Cards the player posted about at follower tier 4, by name, and the last day the boost holds.
    var priceBoosts: [String: Int] = [:]
    var lastFreeProductDay = -1000
    /// The rip mode, the stop rule, and other settings (docs/18-ripping.md).
    var settings = Settings()
    /// The day job's board, time off, and skips (docs/16-time-and-day.md).
    var jobState = JobState()
    /// Case splits the player was invited into (docs/12-acquiring-product.md).
    var splits: [CaseSplit] = []
    /// Facebook Marketplace offers and meetups (docs/15-selling.md).
    var fbOffers: [FBOffer] = []
    var meetups: [Meetup] = []
    /// The player's own card store, after they sign a lease (docs/22-own-store.md).
    var cardStore: CardStoreState?
    /// The player's history with the distributor (docs/12-acquiring-product.md).
    var distributor = DistributorAccount()
    /// Supplies in hand and the accessory shelf of the store (docs/23-supplies.md).
    var supplies = SupplyState()
    /// eBay Best Offer settings by item, and the offers that wait (docs/15-selling.md, Best Offer).
    var offerTerms: [UUID: OfferTerms] = [:]
    var bestOffers: [BestOffer] = []
    /// Lots on sale. Their items are not in Inventory (docs/15-selling.md, Lots).
    var lots: [Lot] = []
    /// The payment policy and the payments that the sender will take back (docs/25-payment-methods.md).
    var payments = PaymentState()
    /// Sales tax, income tax, and the seller's permit (docs/26-taxes.md).
    var taxes = TaxState()
    /// Collection insurance (docs/24-theft-and-insurance.md).
    var insurance = InsuranceState()
    /// The credit score, loans, the line of credit, pawn tickets, and collections (docs/27-debt-and-loans.md).
    var debt = DebtState()
}

/// A save from an older build can miss newer fields. Each missing field takes its default, so an update never wipes a run.
extension GameData {
    init(from decoder: Decoder) throws {
        self.init()
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func v<T: Decodable>(_ key: CodingKeys, _ fallback: T) -> T {
            (try? c.decodeIfPresent(T.self, forKey: key)) ?? fallback
        }
        day = v(.day, day)
        hour = v(.hour, hour)
        cash = v(.cash, cash)
        ledger = v(.ledger, ledger)
        activity = v(.activity, activity)
        jobIndex = v(.jobIndex, jobIndex)
        sickDaysLeft = v(.sickDaysLeft, sickDaysLeft)
        sickToday = v(.sickToday, sickToday)
        gameOver = v(.gameOver, gameOver)
        sealed = v(.sealed, sealed)
        raw = v(.raw, raw)
        slabs = v(.slabs, slabs)
        bulk = v(.bulk, bulk)
        openedPaid = v(.openedPaid, openedPaid)
        boughtToday = v(.boughtToday, boughtToday)
        shelfBought = v(.shelfBought, shelfBought)
        pokemonCenterAttempted = v(.pokemonCenterAttempted, pokemonCenterAttempted)
        shops = v(.shops, shops)
        social = v(.social, social)
        centeringTool = v(.centeringTool, centeringTool)
        shows = v(.shows, shows)
        showsPlannedThrough = v(.showsPlannedThrough, showsPlannedThrough)
        vendorKit = v(.vendorKit, vendorKit)
        weekBought = v(.weekBought, weekBought)
        contacts = v(.contacts, contacts)
        reputation = v(.reputation, reputation)
        wantList = v(.wantList, wantList)
        saved = v(.saved, saved)
        scams = v(.scams, scams)
        meetsAttended = v(.meetsAttended, meetsAttended)
        sales = v(.sales, sales)
        salesPlannedThrough = v(.salesPlannedThrough, salesPlannedThrough)
        saleTips = v(.saleTips, saleTips)
        campedDays = v(.campedDays, campedDays)
        testRestocks = v(.testRestocks, testRestocks)
        opportunities = v(.opportunities, opportunities)
        upgrades = v(.upgrades, upgrades)
        badSales = v(.badSales, badSales)
        saleProblems = v(.saleProblems, saleProblems)
        tiredToday = v(.tiredToday, tiredToday)
        lateHours = v(.lateHours, lateHours)
        streams = v(.streams, streams)
        priceBoosts = v(.priceBoosts, priceBoosts)
        lastFreeProductDay = v(.lastFreeProductDay, lastFreeProductDay)
        settings = v(.settings, settings)
        jobState = v(.jobState, jobState)
        splits = v(.splits, splits)
        fbOffers = v(.fbOffers, fbOffers)
        meetups = v(.meetups, meetups)
        cardStore = v(.cardStore, cardStore)
        distributor = v(.distributor, distributor)
        supplies = v(.supplies, supplies)
        offerTerms = v(.offerTerms, offerTerms)
        bestOffers = v(.bestOffers, bestOffers)
        lots = v(.lots, lots)
        payments = v(.payments, payments)
        taxes = v(.taxes, taxes)
        insurance = v(.insurance, insurance)
        debt = v(.debt, debt)
    }
}

/// What happened overnight, for the morning report.
struct DayReport: Identifiable {
    let id = UUID()
    let day: Int
    var lines: [String]
}

@MainActor @Observable
final class GameStore {
    var data: GameData
    var report: DayReport?
    /// Sales that the receipt screen has not shown yet.
    var receipts: [SaleReceipt] = []
    private let url: URL

    init() {
        url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("game.json")
        if let saved = try? JSONDecoder().decode(GameData.self, from: Data(contentsOf: url)) {
            data = saved
        } else {
            data = GameData()
            startRun()
        }
        scheduleShows()
        scheduleSales()
        seedContacts()
    }

    // MARK: - Calendar and clock

    static let weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    var day: Int { data.day }
    var weekday: Int { data.day % 7 }
    var weekdayName: String { Self.weekdays[weekday] }
    var week: Int { data.day / 7 + 1 }
    var isWorkDay: Bool { weekday < 5 && job != nil }
    var worksToday: Bool { isWorkDay && !data.sickToday && !bookedOffToday && !skippedToday }
    var job: Job? { data.jobIndex.map { Job.ladder[$0] } }
    var daysUntilRent: Int { Balance.rentCycleDays - data.day % Balance.rentCycleDays }

    nonisolated static func clock(_ hour: Double) -> String {
        let h = Int(hour) % 24
        let m = Int(((hour - Double(Int(hour))) * 60).rounded())
        let suffix = h < 12 ? "AM" : "PM"
        let h12 = h % 12 == 0 ? 12 : h % 12
        return m == 0 ? "\(h12) \(suffix)" : String(format: "%d:%02d %@", h12, m, suffix)
    }

    /// The free hours left today, outside the work shift.
    var hoursLeft: Double {
        var left = max(0, Balance.dayEnd - data.hour)
        if worksToday {
            let overlap = max(0, min(Balance.workEnd, Balance.dayEnd) - max(Balance.workStart, data.hour))
            left -= overlap
        }
        return left
    }

    /// The start time for a block of hours today, or nil when it does not fit. The block skips the work shift.
    /// A block can run past 11 PM, up to 2 AM. Those hours come out of sleep (docs/16, Late nights).
    func slot(for hours: Double) -> Double? {
        var start = data.hour
        if worksToday && start < Balance.workEnd && start + hours > Balance.workStart {
            start = max(start, Balance.workEnd)
        }
        return start + hours <= Balance.lateNightLimit ? start : nil
    }

    /// Hours past 11 PM so far today.
    var lateHoursSoFar: Double { max(0, data.hour - Balance.dayEnd) }

    @discardableResult
    func spendHours(_ hours: Double) -> Bool {
        guard let start = slot(for: hours) else { return false }
        data.hour = start + hours
        save()
        return true
    }

    func callInSick() {
        guard isWorkDay, !data.sickToday, data.sickDaysLeft > 0 else { return }
        data.sickToday = true
        data.sickDaysLeft -= 1
        log("You called in sick. \(data.sickDaysLeft) sick days left.")
        save()
    }

    // MARK: - Money

    var cash: Double { data.cash }

    @discardableResult
    func addLedger(_ amount: Double, _ category: LedgerEntry.Category, _ label: String, pending: Bool = false) -> UUID {
        let entry = LedgerEntry(day: data.day, amount: amount, category: category, label: label, pending: pending)
        data.cash += amount
        data.ledger.append(entry)
        return entry.id
    }

    func log(_ text: String, cash: Double? = nil) {
        data.activity.append(ActivityEntry(day: data.day, text: text, cash: cash))
    }

    func canAfford(_ amount: Double) -> Bool { data.cash >= amount - 0.001 }

    /// The next centering tool, if the player does not own the best one yet.
    var nextCenteringTool: (level: Int, name: String, cost: Double, detail: String)? {
        let level = data.centeringTool + 1
        guard Balance.centeringTools.indices.contains(level - 1) else { return nil }
        let tool = Balance.centeringTools[level - 1]
        return (level, tool.name, tool.cost, tool.detail)
    }

    func buyCenteringTool() {
        guard let tool = nextCenteringTool, canAfford(tool.cost) else { return }
        addLedger(-tool.cost, .upgrade, tool.name)
        data.centeringTool = tool.level
        log("Bought the \(tool.name.lowercased()).", cash: -tool.cost)
        save()
    }

    // MARK: - Inventory values

    /// What the item is worth to the player. A known resealed product is worth nothing.
    func market(of item: SealedItem) -> Double {
        item.isKnownFake ? 0 : realMarket(of: item)
    }

    var marketValue: Double {
        data.sealed.reduce(0) { $0 + market(of: $1) }
            + data.raw.reduce(0) { $0 + $1.market }
            + data.slabs.reduce(0) { $0 + $1.market }
            + data.bulk.reduce(0) { $0 + $1.value }
            + lotsMarketValue
    }

    var paid: Double {
        data.sealed.reduce(0) { $0 + $1.paid }
            + data.raw.reduce(0) { $0 + ($1.paid ?? 0) }
            + data.slabs.reduce(0) { $0 + ($1.paid ?? 0) }
            + data.openedPaid
            + lotsPaid
    }

    var net: Double { marketValue - paid }

    /// Collection value counts only kept items (docs/03-currencies.md, Collection value).
    var collectionValue: Double {
        data.sealed.filter(\.keep).reduce(0) { $0 + market(of: $1) }
            + data.raw.filter(\.keep).reduce(0) { $0 + $1.market }
            + data.slabs.filter(\.keep).reduce(0) { $0 + $1.market }
    }

    func isKept(_ id: UUID) -> Bool {
        data.sealed.contains { $0.id == id && $0.keep }
            || data.raw.contains { $0.id == id && $0.keep }
            || data.slabs.contains { $0.id == id && $0.keep }
    }

    func hasStatus(_ id: UUID) -> Bool {
        data.sealed.contains { $0.id == id && $0.status != nil }
            || data.raw.contains { $0.id == id && $0.status != nil }
            || data.slabs.contains { $0.id == id && $0.status != nil }
    }

    func card(_ id: UUID) -> OwnedCard? {
        data.raw.first { $0.id == id } ?? data.slabs.first { $0.id == id }
    }

    func setKeep(_ ids: Set<UUID>, _ keep: Bool) {
        for i in data.sealed.indices where ids.contains(data.sealed[i].id) { data.sealed[i].keep = keep }
        for i in data.raw.indices where ids.contains(data.raw[i].id) { data.raw[i].keep = keep }
        for i in data.slabs.indices where ids.contains(data.slabs[i].id) { data.slabs[i].keep = keep }
        save()
    }

    /// Moves raw cards into bulk. A pulled card joins the bulk group of its rip. A bought card keeps its
    /// amount paid in the portfolio header.
    /// What a raw card nets on TCGplayer at this price, after the fees and the shipping.
    static func tcgNet(price: Double) -> Double {
        let costs = saleCosts(price: price, channel: .tcgplayer, sealed: false, insured: false)
        return price - costs.fees - costs.shipping
    }

    /// The raw cards that make no money on TCGplayer: free, not kept, and not known fakes.
    var unprofitableRaw: [OwnedCard] {
        data.raw.filter { $0.status == nil && !$0.keep && !$0.isKnownFake && Self.tcgNet(price: $0.market) <= 0 }
    }

    func moveToBulk(_ ids: Set<UUID>) {
        let cards = data.raw.filter { ids.contains($0.id) && $0.status == nil && !$0.keep }
        guard !cards.isEmpty else { return }
        for card in cards {
            data.openedPaid += card.paid ?? 0
            if let rip = card.ripID, let i = data.bulk.firstIndex(where: { $0.ripID == rip && $0.setSlug == card.setSlug }) {
                data.bulk[i].cards.append(card.print)
            } else if let i = data.bulk.firstIndex(where: { $0.moved && $0.day == data.day && $0.setSlug == card.setSlug }) {
                data.bulk[i].cards.append(card.print)
            } else {
                data.bulk.append(BulkGroup(ripID: UUID(), setSlug: card.setSlug, date: .now,
                                           cards: [card.print], day: data.day, moved: true))
            }
        }
        let moved = Set(cards.map(\.id))
        data.raw.removeAll { moved.contains($0.id) }
        log("Moved \(cards.count) card\(cards.count == 1 ? "" : "s") to bulk.")
        save()
    }

    // MARK: - Stacks

    /// Identical items stack into one Inventory row.
    func stackKey(_ s: SealedItem) -> String {
        "\(s.productID ?? s.name)|\(s.setSlug)|\(s.keep)|\(s.status?.tag ?? "")"
    }

    /// Raw copies stack only when they look the same: the same wear and the same cut reading. The player can then
    /// pick the better copy to grade.
    func stackKey(_ c: OwnedCard) -> String {
        let looks = c.grade == nil ? "|\(c.condition.wear.short)|\(cutKey(c.condition.cut))" : ""
        return "\(c.setSlug)|\(c.print.num)|\(c.print.variant)|\(c.grade?.label ?? "")|\(c.keep)|\(c.status?.tag ?? "")|\(c.paid == nil)" + looks
    }

    private func cutKey(_ cut: Cut) -> String {
        let tool = data.centeringTool
        return [CutReading.front(cut, tool: tool), CutReading.back(cut, tool: tool)]
            .map { $0.words ?? "\($0.lr) \($0.tb)" }
            .joined(separator: "|")
    }

    /// Sorts raw cards by what the player can see: the wear, then the front cut, then the back cut. Best first.
    func conditionOrder(_ a: OwnedCard, _ b: OwnedCard) -> Bool {
        func key(_ c: OwnedCard) -> [Int] {
            let tool = data.centeringTool
            return [Wear.allCases.firstIndex(of: c.condition.wear) ?? 0,
                    CutReading.front(c.condition.cut, tool: tool).rank,
                    CutReading.back(c.condition.cut, tool: tool).rank]
        }
        let ka = key(a), kb = key(b)
        return ka == kb ? a.market > b.market : ka.lexicographicallyPrecedes(kb)
    }

    func mates(of s: SealedItem) -> [SealedItem] {
        let key = stackKey(s)
        return data.sealed.filter { stackKey($0) == key }
    }

    func mates(of c: OwnedCard) -> [OwnedCard] {
        let key = stackKey(c)
        return (data.raw + data.slabs).filter { stackKey($0) == key }
    }

    // MARK: - Runs

    func startRun() {
        data = GameData()
        addLedger(Balance.startingCash, .startingCapital, "Starting capital")
        log("Day 1. You have \(money(Balance.startingCash)) and a job as a retail associate.")
        scheduleShows()
        scheduleSales()
        seedContacts()
        save()
    }

    // MARK: - Test tools

    /// A free loose pack for testing. It counts the market price as paid, and it does not touch cash.
    func addTestPack(slug: String = "prismatic-evolutions") {
        let set = SetLibrary.set(slug)
        data.sealed.append(SealedItem(setSlug: slug, name: "\(set.name) Booster Pack", packs: 1, paid: set.packCost ?? 0,
                                      acquired: .now, source: "Test pack", productID: SetLibrary.loosePack(slug)?.id,
                                      acquiredDay: data.day))
        save()
    }

    /// A free sealed product for testing, at its market price. It does not touch cash.
    @discardableResult
    func addTestProduct(_ id: String) -> SealedItem? {
        guard let p = SetLibrary.product(id) else { return nil }
        let item = SealedItem(setSlug: p.homeSlug, name: p.name, packs: p.packs, paid: p.market, acquired: .now,
                              source: "Test product", productID: p.id, acquiredDay: data.day)
        data.sealed.append(item)
        save()
        return item
    }

    func addTestCard(_ print: CardPrint, slug: String = "prismatic-evolutions") {
        data.raw.append(OwnedCard(print: print, setSlug: slug, acquired: .now, paid: nil, ripID: nil, acquiredDay: data.day))
        save()
    }

    /// A card show that starts today, with a table booked and no fee.
    func addTestShow(_ size: ShowSize) {
        let today = data.day
        data.shows.removeAll { $0.covers(today) }
        data.shows.append(CardShow(name: "Test Card Show", venue: "Test Hall", size: size, startDay: today, booked: true))
        save()
    }

    func addTestCash(_ amount: Double) {
        addLedger(amount, .test, "Test cash")
        save()
    }

    // MARK: - Ripping

    /// The set of each pack in a sealed item, in order.
    func packSlugs(of item: SealedItem) -> [String] {
        if item.brokenFrom == nil, let product = SetLibrary.product(item.productID), product.packs == item.packs {
            return product.packSlugs
        }
        return Array(repeating: item.setSlug, count: item.packs)
    }

    /// A loose pack out of an opened product. A resealed product's packs are resealed too (docs/14).
    private func loosePack(_ slug: String, from item: SealedItem) -> SealedItem {
        var pack = SealedItem(setSlug: slug, name: "\(SetLibrary.set(slug).name) Booster Pack", packs: 1,
                              paid: item.paidPerPack, acquired: item.acquired,
                              source: "From an opened \(item.name)", productID: SetLibrary.loosePack(slug)?.id,
                              brokenFrom: item.id, acquiredDay: data.day)
        pack.fake = item.fake
        pack.fakeKnown = item.fakeKnown
        return pack
    }

    /// Opens a sealed product before its packs: the seal breaks, every pack goes back as a loose pack, and the
    /// promo cards go to Raw. Returns the promo cards.
    @discardableResult
    func openProduct(_ sourceID: UUID, ripID: UUID) -> [CardPrint] {
        guard let i = data.sealed.firstIndex(where: { $0.id == sourceID }) else { return [] }
        let item = data.sealed.remove(at: i)
        for slug in packSlugs(of: item) {
            data.sealed.append(loosePack(slug, from: item))
        }
        var extras: [CardPrint] = []
        if let product = SetLibrary.product(item.productID) {
            let promos = product.pickOnePromo ? Array(product.promos.shuffled().prefix(1)) : product.promos
            for promo in promos {
                data.raw.append(OwnedCard(print: promo.print, setSlug: item.setSlug, acquired: .now, paid: nil,
                                          ripID: ripID, acquiredDay: data.day))
                extras.append(promo.print)
            }
        }
        log("Opened \(item.name).")
        save()
        return extras
    }

    /// Called when the rip tears a pack. The seal is broken, so the cards belong to the player at once.
    /// When the tear breaks a product's seal, its other packs go back as loose packs, and its promo cards go
    /// to Raw (docs/18-ripping.md, Sealed products in the rip). Returns those promo cards.
    @discardableResult
    func commitPack(from sourceID: UUID, setSlug: String, paidPerPack: Double, ripID: UUID, cards: [RipCard]) -> [CardPrint] {
        var extras: [CardPrint] = []
        if let i = data.sealed.firstIndex(where: { $0.id == sourceID }) {
            let item = data.sealed.remove(at: i)
            var rest = packSlugs(of: item)
            if let first = rest.firstIndex(of: setSlug) { rest.remove(at: first) } else if !rest.isEmpty { rest.removeFirst() }
            for slug in rest {
                data.sealed.append(loosePack(slug, from: item))
            }
            if item.brokenFrom == nil, let product = SetLibrary.product(item.productID) {
                let promos = product.pickOnePromo ? Array(product.promos.shuffled().prefix(1)) : product.promos
                for promo in promos {
                    data.raw.append(OwnedCard(print: promo.print, setSlug: item.setSlug, acquired: .now, paid: nil,
                                              ripID: ripID, acquiredDay: data.day))
                    extras.append(promo.print)
                }
            }
        } else if let i = data.sealed.firstIndex(where: { $0.brokenFrom == sourceID && $0.setSlug == setSlug })
                    ?? data.sealed.firstIndex(where: { $0.brokenFrom == sourceID }) {
            data.sealed.remove(at: i)
        }
        data.openedPaid += paidPerPack
        var bulk: [CardPrint] = []
        for card in cards {
            guard let print = card.print else { continue }
            if card.isHit {
                data.raw.append(OwnedCard(print: print, setSlug: setSlug, acquired: .now, paid: nil, ripID: ripID,
                                          condition: card.condition, acquiredDay: data.day))
            } else {
                bulk.append(print)
            }
        }
        if let i = data.bulk.firstIndex(where: { $0.ripID == ripID && $0.setSlug == setSlug }) {
            data.bulk[i].cards += bulk
        } else if !bulk.isEmpty {
            data.bulk.append(BulkGroup(ripID: ripID, setSlug: setSlug, date: .now, cards: bulk, day: data.day))
        }
        save()
        return extras
    }

    // MARK: - Buying

    func buy(_ offer: StoreOffer) -> Bool {
        let total = offer.price + offer.shipping
        guard canAfford(total), !data.boughtToday.contains(offer.id) else { return false }
        // A pickup set for a later day goes on the calendar (docs/12, Facebook Marketplace).
        if let day = offer.pickupDay, day > data.day { return buyLaterPickup(offer, day: day) }
        if offer.pickup {
            guard spendHours(Balance.facebookPickupHours) else { return false }
        }
        data.boughtToday.append(offer.id)
        let status: ItemStatus? = offer.pickup ? nil : .onTheWay(daysLeft: offer.deliveryDays, store: offer.store)
        switch offer.item {
        case .product(let product, let slug):
            addLedger(-total, .sealed, "\(product.name) · \(offer.store.rawValue)")
            var item = SealedItem(setSlug: slug, name: product.name, packs: product.packs, paid: total,
                                  acquired: .now, source: "Bought on \(offer.store.rawValue)",
                                  productID: product.id, status: status, acquiredDay: data.day)
            item.fake = offer.fake
            data.sealed.append(item)
        case .single(let print, let slug):
            addLedger(-total, .singles, "\(print.name) · \(offer.store.rawValue)")
            var card = OwnedCard(print: print, setSlug: slug, acquired: .now, paid: total, ripID: nil,
                                 condition: .secondHand(), status: status, acquiredDay: data.day)
            card.fake = offer.fake
            data.raw.append(card)
        }
        log("Bought \(offer.title) on \(offer.store.rawValue) for \(money(total)).", cash: -total)
        save()
        return true
    }

    /// One attempt per Pokemon Center drop (docs/12-acquiring-product.md, Pokemon Center drops).
    func attemptDrop(_ offer: StoreOffer) -> Bool {
        guard !data.pokemonCenterAttempted, canAfford(offer.price + offer.shipping) else { return false }
        data.pokemonCenterAttempted = true
        if Double.random(in: 0..<1) < Balance.pokemonCenterSuccessChance {
            return buy(offer)
        }
        log("Missed the Pokemon Center drop for \(offer.title).")
        save()
        return false
    }

    // MARK: - Store run and game shops

    func shop(_ store: LocalStore) -> ShopState { data.shops[store.rawValue] ?? ShopState() }

    func standing(_ store: LocalStore) -> StandingLevel { StandingLevel(points: shop(store).points) }

    /// Starts a store run: the whole trip is one block of time.
    func startStoreRun(_ stores: [LocalStore]) -> Bool {
        let hours = Double(stores.count) * storeStopHours
        guard !stores.isEmpty, spendHours(hours) else { return false }
        for s in stores where s.isGameShop {
            var state = shop(s)
            state.lastVisitDay = data.day
            data.shops[s.rawValue] = state
        }
        log("Store run: \(stores.map(\.rawValue).joined(separator: ", ")) (\(formatHours(hours))).")
        rollCarBreakIn(trip: "the store run")
        save()
        return true
    }

    func shelfLeft(_ item: ShelfItem) -> Int { item.quantity - (data.shelfBought[item.id] ?? 0) }

    @discardableResult
    func buyShelf(_ item: ShelfItem, at store: LocalStore, credit: Bool) -> Bool {
        guard shelfLeft(item) > 0, pay(item.price, at: store, credit: credit, label: "\(item.product.name) · \(store.rawValue)", category: .sealed) else { return false }
        data.shelfBought[item.id, default: 0] += 1
        recordDeal(shopContactID(store), what: "Bought \(item.product.name)", price: item.price, market: item.product.market,
                   slug: item.product.homeSlug)
        data.sealed.append(SealedItem(setSlug: item.product.homeSlug, name: item.product.name, packs: item.product.packs, paid: item.price,
                                      acquired: .now, source: "Bought at \(store.rawValue)", productID: item.product.id,
                                      acquiredDay: data.day))
        log("Bought \(item.product.name) at \(store.rawValue) for \(money(item.price))\(credit ? " in store credit" : "").",
            cash: credit ? nil : -item.price)
        save()
        return true
    }

    @discardableResult
    func buyCaseSingle(_ single: CaseSingle, at store: LocalStore, credit: Bool) -> Bool {
        guard !data.weekBought.contains(single.id),
              pay(single.price, at: store, credit: credit, label: "\(single.print.name) · \(store.rawValue) case", category: .singles) else { return false }
        data.weekBought.append(single.id)
        recordDeal(shopContactID(store), what: "Bought \(single.print.name)", price: single.price, market: single.print.market ?? 0,
                   slug: single.setSlug)
        var card = OwnedCard(print: single.print, setSlug: single.setSlug, acquired: .now, paid: single.price, ripID: nil,
                             condition: .secondHand(), acquiredDay: data.day)
        card.fake = single.fake
        if single.looksOff, single.fake != nil { card.fakeKnown = true }
        data.raw.append(card)
        log("Bought \(single.print.name) from the \(store.rawValue) display case for \(money(single.price)).",
            cash: credit ? nil : -single.price)
        save()
        return true
    }

    /// Something the shop bought from a local seller. It goes to Raw, Slabs, or Sealed.
    @discardableResult
    func buyBuyIn(_ item: BuyIn, at store: LocalStore, credit: Bool) -> Bool {
        guard !data.weekBought.contains(item.id),
              pay(item.price, at: store, credit: credit, label: "\(item.name) · \(store.rawValue)",
                  category: item.isSealed ? .sealed : .singles) else { return false }
        data.weekBought.append(item.id)
        recordDeal(shopContactID(store), what: "Bought \(item.name)", price: item.price, market: item.market, slug: nil)
        let known: Bool? = item.looksOff && item.fake != nil ? true : nil
        switch item.goods {
        case .single(let print, let slug, let condition):
            var card = OwnedCard(print: print, setSlug: slug, acquired: .now, paid: item.price, ripID: nil,
                                 condition: condition, acquiredDay: data.day)
            card.fake = item.fake
            card.fakeKnown = known
            data.raw.append(card)
        case .slab(let print, let slug, let grade):
            var card = OwnedCard(print: print, setSlug: slug, acquired: .now, paid: item.price, ripID: nil, grade: grade,
                                 acquiredDay: data.day)
            card.fake = item.fake
            card.fakeKnown = known
            data.slabs.append(card)
        case .sealed(let product):
            var sealed = SealedItem(setSlug: product.homeSlug, name: product.name, packs: product.packs, paid: item.price,
                                    acquired: .now, source: "Bought at \(store.rawValue)", productID: product.id,
                                    acquiredDay: data.day)
            sealed.fake = item.fake
            sealed.fakeKnown = known
            data.sealed.append(sealed)
        case .mystery:
            break
        }
        log("Bought \(item.name) at \(store.rawValue) for \(money(item.price))\(credit ? " in store credit" : "").",
            cash: credit ? nil : -item.price)
        save()
        return true
    }

    /// Pays with cash (a ledger entry) or with the shop's store credit (not in the Wallet). Spending earns standing.
    private func pay(_ amount: Double, at store: LocalStore, credit: Bool, label: String, category: LedgerEntry.Category) -> Bool {
        var state = shop(store)
        if credit {
            guard store.isGameShop, state.credit >= amount - 0.001 else { return false }
            state.credit -= amount
        } else {
            guard canAfford(amount) else { return false }
            addLedger(-amount, category, label)
        }
        if store.isGameShop {
            state.spendTowardPoint += amount
            let points = Int(state.spendTowardPoint / 50)
            state.spendTowardPoint -= Double(points) * 50
            state.points = min(100, state.points + points)
        }
        data.shops[store.rawValue] = state
        return true
    }

    /// The buylist offer. The shop does not know a fake yet, so it quotes the real price.
    func buylistPrice(_ card: OwnedCard, at store: LocalStore) -> Double {
        (card.realMarket * standing(store).buylistRate * 100).rounded() / 100
    }

    /// The buylist: instant cash, well below market (docs/15-selling.md, The local game shop). The shop checks each
    /// card first. A fake it catches costs standing, and the shop keeps nothing (docs/14, Consequences).
    /// Returns false when the shop refused the card.
    @discardableResult
    func sellToShop(_ id: UUID, at store: LocalStore) -> Bool {
        guard let card = card(id), card.status == nil, !card.keep else { return false }
        if let fake = card.fake, Double.random(in: 0..<1) < Balance.shopDetectChance[fake.rawValue] {
            var state = shop(store)
            state.points = max(0, state.points - Balance.shopFakeStandingCost)
            data.shops[store.rawValue] = state
            markFakeKnown(cardID: id)
            log("\(store.rawValue) checked your \(card.print.name) and called it a fake. Standing −\(Balance.shopFakeStandingCost).")
            save()
            return false
        }
        let price = (card.realMarket * standing(store).buylistRate * 100).rounded() / 100
        data.raw.removeAll { $0.id == id }
        data.slabs.removeAll { $0.id == id }
        addLedger(price, .sale, "\(card.print.name)\(card.grade.map { " " + $0.label } ?? "") · \(store.rawValue) buylist")
        addReceipt(name: card.print.name + (card.grade.map { " " + $0.label } ?? ""), venue: "\(store.rawValue) buylist",
                   price: price, net: price, paid: card.paid)
        recordDeal(shopContactID(store), what: "Sold them \(card.print.name)", price: price, market: card.realMarket, slug: card.setSlug)
        if let fake = card.fake {
            recordBadSale(item: card.print.name, channel: "\(store.rawValue) buylist", price: price, fake: fake, known: card.isKnownFake,
                          refunds: false, contactID: shopContactID(store), shop: store)
        }
        log("Sold \(card.print.name) to \(store.rawValue) for \(money(price)) cash.", cash: price)
        save()
        return true
    }

    func bulkCredit(_ group: BulkGroup) -> Double {
        (group.value * Balance.bulkCreditRate * 100).rounded() / 100
    }

    /// Bulk sells for store credit only.
    func sellBulk(_ id: UUID, at store: LocalStore) {
        guard let group = data.bulk.first(where: { $0.id == id }) else { return }
        let credit = bulkCredit(group)
        data.bulk.removeAll { $0.id == id }
        var state = shop(store)
        state.credit += credit
        data.shops[store.rawValue] = state
        log("Sold \(group.cards.count) bulk cards to \(store.rawValue) for \(money(credit)) in store credit.")
        save()
    }

    /// No visit for 4 weeks costs 2 points for each week after that.
    private func decayStanding() -> [String] {
        var lines: [String] = []
        for store in LocalStore.allCases where store.isGameShop {
            var state = shop(store)
            let away = data.day - state.lastVisitDay
            if state.points > 0, away > 28, (away - 28) % 7 == 0 {
                state.points = max(0, state.points - 2)
                data.shops[store.rawValue] = state
                lines.append("\(store.rawValue) has not seen you in \(away / 7) weeks. Standing −2.")
            }
        }
        return lines
    }

    // MARK: - Selling

    func list(_ ids: Set<UUID>, channel: Listing.Channel, price: (UUID) -> Double, auctionDays: Int?, insured: Bool,
              wear: (UUID) -> Wear? = { _ in nil }) {
        let day = data.day
        let trueWear = Dictionary(data.raw.map { ($0.id, $0.condition.wear) }, uniquingKeysWith: { a, _ in a })
        func listing(_ id: UUID) -> ItemStatus {
            let listed = wear(id)
            let overstated = listed.map { w in trueWear[id].map { w.rank < $0.rank } ?? false }
            return .listed(Listing(channel: channel, price: price(id), dayListed: day,
                            auctionEndDay: auctionDays.map { day + $0 }, insured: insured, listedWear: listed,
                            overstatedCondition: overstated))
        }
        for i in data.raw.indices where ids.contains(data.raw[i].id) { data.raw[i].status = listing(data.raw[i].id) }
        for i in data.slabs.indices where ids.contains(data.slabs[i].id) { data.slabs[i].status = listing(data.slabs[i].id) }
        for i in data.sealed.indices where ids.contains(data.sealed[i].id) { data.sealed[i].status = listing(data.sealed[i].id) }
        log("Listed \(ids.count) item\(ids.count == 1 ? "" : "s") on \(channel.rawValue).")
        save()
    }

    func removeListing(_ id: UUID) {
        for i in data.raw.indices where data.raw[i].id == id { data.raw[i].status = nil }
        for i in data.slabs.indices where data.slabs[i].id == id { data.slabs[i].status = nil }
        for i in data.sealed.indices where data.sealed[i].id == id { data.sealed[i].status = nil }
        save()
    }

    /// The fees and shipping for a sale at a price.
    static func saleCosts(price: Double, channel: Listing.Channel, sealed: Bool, insured: Bool) -> (fees: Double, shipping: Double, insurance: Double) {
        let fees = switch channel {
        case .tcgplayer: price * Balance.tcgFeeRate + Balance.tcgFeeFlat
        case .ebay, .ebayAuction: price * Balance.ebayFeeRate + Balance.ebayFeeFlat
        case .whatnot: price * Balance.whatnotFeeRate + Balance.whatnotFeeFlat
        case .social, .facebook: 0.0
        }
        // Facebook Marketplace hands over in person: no shipping, no insurance.
        guard channel.ships else { return (fees, 0, 0) }
        let shipping = Balance.shippingCost(for: price, sealed: sealed)
        return (fees, shipping, insured ? Balance.insuranceCost(for: price) : 0)
    }

    /// The lowest competing listing on TCGplayer for a card. It sits a little under the market price.
    static func tcgLowest(for print: CardPrint) -> Double {
        let market = print.market ?? 0
        var hash: UInt64 = 1469598103934665603
        for b in (print.num + print.variant).utf8 { hash = (hash ^ UInt64(b)) &* 1099511628211 }
        let cut = 0.90 + Double(hash % 1000) / 1000 * 0.09
        return max(0.05, (market * cut * 100).rounded() / 100)
    }

    // MARK: - Grading

    func submit(_ ids: Set<UUID>, to company: GradingCompany, tier: GradingTier) {
        let cards = data.raw.filter { ids.contains($0.id) && $0.status == nil }
        guard !cards.isEmpty else { return }
        let fee = tier.fee * Double(cards.count)
        let ledgerID = addLedger(-fee, .grading, "\(cards.count) card\(cards.count == 1 ? "" : "s") to \(company.rawValue) \(tier.name)",
                                 pending: true)
        for i in data.raw.indices where ids.contains(data.raw[i].id) && data.raw[i].status == nil {
            data.raw[i].status = .atGrader(company: company, tier: tier.name, daysLeft: tier.days, ledgerID: ledgerID)
        }
        log("Sent \(cards.count) card\(cards.count == 1 ? "" : "s") to \(company.rawValue) (\(tier.name), \(tier.days) days).", cash: -fee)
        useGradingSupplies(cards: cards.count)
        save()
    }

    /// The overall grade: the worst subgrade leads, and each company adds its own spread (docs/10-grading.md).
    static func gradeResult(_ c: Condition, company: GradingCompany) -> SlabGrade {
        let subs = c.subgrades
        let worst = subs.min() ?? 10
        let average = subs.reduce(0, +) / Double(subs.count)
        let noise = (Double.random(in: -1...1) + Double.random(in: -1...1)) / 2 * company.spread * 2
        let raw = min(10.5, worst * 0.7 + average * 0.3 + company.bias + noise)
        func halves(_ x: Double, cap: Double) -> Double { max(1, min(cap, (min(x, cap) * 2).rounded() / 2)) }
        switch company {
        case .psa:
            return SlabGrade(company: .psa, grade: max(1, min(10, raw.rounded(.toNearestOrAwayFromZero))))
        case .cgc:
            // CGC gives a 10 across a wide band. A Pristine 10 is the top of it.
            if raw >= 9.4 { return SlabGrade(company: .cgc, grade: 10, pristine: raw >= 10.12) }
            return SlabGrade(company: .cgc, grade: halves(raw, cap: 9.5))
        case .bgs:
            // A Black Label needs four perfect subgrades, and BGS rarely gives a perfect 10 subgrade.
            let black = subs.allSatisfy { $0 == 10 } && Double.random(in: 0..<1) < 0.043
            if black || raw >= 10.02 { return SlabGrade(company: .bgs, grade: 10, blackLabel: black) }
            return SlabGrade(company: .bgs, grade: raw >= 9.4 ? 9.5 : halves(raw, cap: 9))
        }
    }

    // MARK: - End Day

    func endDay() {
        guard data.gameOver == nil else { return }
        var lines: [String] = []
        let endedWeekday = weekday

        if endedWeekday == 4, let job {
            let unpaid = Double(data.jobState.unpaidDays) * job.weeklyPay / 5
            let pay = max(0, job.weeklyPay - unpaid)
            addLedger(pay, .paycheck, "Paycheck · \(job.title)\(unpaid > 0 ? " · \(data.jobState.unpaidDays) unpaid day\(data.jobState.unpaidDays == 1 ? "" : "s")" : "")")
            lines.append("Payday: \(money(pay)) from your job\(unpaid > 0 ? ", less \(money(unpaid)) for the days you skipped" : "").")
            if let line = garnishWages(pay) { lines.append(line) }
            data.jobState.unpaidDays = 0
        }

        if let line = missedShowLine() {
            lines.append(line)
            addReputation(-5)
        }
        lines += jobEndDay(endedDay: data.day)
        lines += storeDayEnd()

        // A late night: the hours past 11 PM wait for the morning choice (docs/16, Late nights).
        data.lateHours = lateHoursSoFar
        data.tiredToday = 1
        data.day += 1
        data.hour = Balance.dayStart
        data.sickToday = false
        data.boughtToday = []
        data.shelfBought = [:]
        data.pokemonCenterAttempted = false
        if data.day % 7 == 0 { data.weekBought = [] }
        lines += decayStanding()
        if data.day % 364 == 0 { data.sickDaysLeft = job?.sickDays ?? Balance.sickDaysPerYear }

        lines += advanceSealed()
        lines += advanceCards()
        lines += advanceSocial()
        scheduleShows()
        scheduleSales()
        lines += relationshipsEndDay()
        lines += followerTipsEndDay()
        lines += opportunitiesEndDay()
        lines += counterfeitsEndDay()
        lines += saleProblemsEndDay()
        lines += paymentsEndDay()
        lines += streamsEndDay()
        lines += splitsEndDay()
        lines += meetupsEndDay()
        lines += offersEndDay()
        lines += lotsEndDay()
        data.priceBoosts = data.priceBoosts.filter { $0.value >= data.day }
        if data.lateHours > 0 {
            lines.append("You were up until \(GameStore.clock(Balance.dayEnd + data.lateHours)). Start tired, or sleep in.")
        }

        if data.day % Balance.rentCycleDays == 0 {
            if coverWithLine(Balance.rent, for: "Rent") {
                addLedger(-Balance.rent, .rent, "Rent")
                lines.append("Rent paid: \(money(Balance.rent)).")
            } else {
                data.gameOver = "Rent was due on day \(data.day + 1), and you had \(money(data.cash)). You could not pay it."
                lines.append("You could not pay rent. The run is over.")
            }
        } else if daysUntilRent == Balance.rentWarningDays {
            lines.append("Rent of \(money(Balance.rent)) is due in \(Balance.rentWarningDays) days.")
        }
        if data.gameOver == nil { lines += storeRentDue() }
        lines += taxesEndDay()
        // Debt payments come after rent and taxes. A missed debt payment adds a fee, and the run goes on.
        if data.gameOver == nil { lines += debtEndDay() }
        if data.gameOver == nil { lines += lossesEndDay() }
        if data.gameOver == nil { lines += storeGrowthDay() }

        if isPokemonCenterDropLive {
            lines.append("A Pokemon Center drop is live today.")
        }
        for line in lines { log(line) }
        report = DayReport(day: data.day, lines: lines)
        save()
    }

    var isPokemonCenterDropLive: Bool { isPokemonCenterDropLive(day: data.day) }

    func isPokemonCenterDropLive(day: Int) -> Bool {
        var rng = SeededRandom(seed: UInt64(day) &* 7919 &+ 17)
        return Double(rng.next()) < Balance.pokemonCenterDropChance
    }

    private func advanceSealed() -> [String] {
        var lines: [String] = []
        var keepItems: [SealedItem] = []
        // A case is many boxes. One line for each product, not one for each box.
        var arrived: [(key: String, count: Int)] = []
        func note(_ key: String) {
            if let i = arrived.firstIndex(where: { $0.key == key }) { arrived[i].count += 1 } else { arrived.append((key, 1)) }
        }
        for var item in data.sealed {
            switch item.status {
            case .onTheWay(let days, let store):
                if days <= 1 {
                    item.status = nil
                    note("Delivered from \(store.rawValue): \(item.name)")
                } else {
                    item.status = .onTheWay(daysLeft: days - 1, store: store)
                }
            case .listed(let listing):
                if let sale = rollSale(listing, market: realMarket(of: item), sealed: true) {
                    lines.append(completeSale(name: item.name, listing: listing, price: sale, sealed: true, paid: item.paid,
                                              fake: item.fake, known: item.isKnownFake, sealedItem: item))
                    continue
                } else if listingExpired(listing) {
                    item.status = nil
                    lines.append("Your \(listing.channel.rawValue) listing for \(item.name) ended with no sale.")
                }
            case .inStore:
                if let result = advanceOnlineListing(&item) {
                    lines.append(result.line)
                    if result.sold { continue }
                }
            case .arriving(let days, let from):
                if days <= 1 {
                    item.status = nil
                    note("Arrived from \(from): \(item.name)")
                } else {
                    item.status = .arriving(daysLeft: days - 1, from: from)
                }
            default:
                break
            }
            keepItems.append(item)
        }
        data.sealed = keepItems
        lines += arrived.map { $0.count > 1 ? "\($0.key) ×\($0.count)." : "\($0.key)." }
        return lines
    }

    private func advanceCards() -> [String] {
        var lines: [String] = []
        var raw: [OwnedCard] = []
        var slabs = data.slabs.filter { $0.status == nil }
        for var card in data.raw {
            switch card.status {
            case .onTheWay(let days, let store):
                if days <= 1 {
                    card.status = nil
                    lines.append("Delivered from \(store.rawValue): \(card.print.name).")
                } else {
                    card.status = .onTheWay(daysLeft: days - 1, store: store)
                }
            case .atGrader(let company, let tier, let days, let ledgerID):
                if days <= 1 {
                    if let i = data.ledger.firstIndex(where: { $0.id == ledgerID }) {
                        data.ledger[i].pending = data.raw.contains {
                            if case .atGrader(_, _, let d, let l) = $0.status, l == ledgerID, $0.id != card.id { return d > 1 }
                            return false
                        }
                    }
                    // A grader catches every fake. The fee stays paid (docs/14, Detection).
                    if let fake = card.fake {
                        card.status = nil
                        card.fakeKnown = true
                        lines.append("\(company.rawValue) flagged your \(card.print.name) as counterfeit (\(fake.label.lowercased())). No grade, and the fee is not refunded.")
                        raw.append(card)
                        continue
                    }
                    let grade = Self.gradeResult(card.condition, company: company)
                    card.status = nil
                    card.grade = grade
                    card.verified = true
                    slabs.append(card)
                    lines.append("\(card.print.name) came back from \(company.rawValue): \(grade.label), worth \(money(card.market)).")
                    if let i = data.ledger.firstIndex(where: { $0.id == ledgerID }) {
                        data.ledger[i].label += " · \(card.print.name) \(grade.label)"
                    }
                    continue
                }
                card.status = .atGrader(company: company, tier: tier, daysLeft: days - 1, ledgerID: ledgerID)
            case .atAuthenticator(let days, let ledgerID):
                if days <= 1 {
                    if let i = data.ledger.firstIndex(where: { $0.id == ledgerID }) { data.ledger[i].pending = false }
                    lines.append(authenticationResult(&card))
                } else {
                    card.status = .atAuthenticator(daysLeft: days - 1, ledgerID: ledgerID)
                }
            case .arriving(let days, let from):
                if days <= 1 {
                    card.status = nil
                    lines.append("Back from \(from): \(card.print.name).")
                } else {
                    card.status = .arriving(daysLeft: days - 1, from: from)
                }
            case .consigned(let c):
                if let line = advanceConsignment(&card, c) {
                    lines.append(line)
                    if card.status == nil, c.sellDay == data.day { continue }
                }
            case .inStore:
                if let result = advanceOnlineListing(&card) {
                    lines.append(result.line)
                    if result.sold { continue }
                }
            case .listed(let listing):
                if let sale = rollSale(listing, card: card) {
                    lines.append(completeSale(name: card.print.name, listing: listing, price: sale, sealed: false, paid: card.paid,
                                              fake: card.fake, known: card.isKnownFake, card: card,
                                              overstated: card.overstates(listing)))
                    if listing.channel == .social { markPostSale(cardID: card.id, result: .sold(sale)) }
                    continue
                } else if listingExpired(listing) {
                    card.status = nil
                    if listing.channel == .social { markPostSale(cardID: card.id, result: .noSale) }
                    lines.append("Your \(listing.channel.rawValue) listing for \(card.print.name) ended with no sale.")
                }
            default:
                break
            }
            raw.append(card)
        }
        for var card in data.slabs where card.status != nil {
            switch card.status {
            case .inStore:
                if let result = advanceOnlineListing(&card) {
                    lines.append(result.line)
                    if result.sold { continue }
                }
            case .listed(let listing):
                if let sale = rollSale(listing, card: card) {
                    lines.append(completeSale(name: "\(card.print.name) \(card.grade?.label ?? "")", listing: listing,
                                              price: sale, sealed: false, paid: card.paid, fake: card.fake, known: card.isKnownFake,
                                              card: card, slab: true))
                    if listing.channel == .social { markPostSale(cardID: card.id, result: .sold(sale)) }
                    continue
                } else if listingExpired(listing) {
                    card.status = nil
                    if listing.channel == .social { markPostSale(cardID: card.id, result: .noSale) }
                    lines.append("Your \(listing.channel.rawValue) listing for \(card.print.name) ended with no sale.")
                }
            case .atAuthenticator(let days, let ledgerID):
                if days <= 1 {
                    if let i = data.ledger.firstIndex(where: { $0.id == ledgerID }) { data.ledger[i].pending = false }
                    lines.append(authenticationResult(&card))
                } else {
                    card.status = .atAuthenticator(daysLeft: days - 1, ledgerID: ledgerID)
                }
            case .arriving(let days, let from):
                if days <= 1 {
                    card.status = nil
                    lines.append("Back from \(from): \(card.print.name).")
                } else {
                    card.status = .arriving(daysLeft: days - 1, from: from)
                }
            case .consigned(let c):
                if let line = advanceConsignment(&card, c) {
                    lines.append(line)
                    if card.status == nil, c.sellDay == data.day { continue }
                }
            default:
                break
            }
            slabs.append(card)
        }
        data.raw = raw
        data.slabs = slabs
        return lines
    }

    func listingExpired(_ listing: Listing) -> Bool {
        listing.auctionEndDay == nil && data.day - listing.dayListed >= Balance.listingDays
    }

    func rollSale(_ listing: Listing, card: OwnedCard) -> Double? {
        if listing.channel == .tcgplayer {
            let lowest = card.grade == nil ? Self.tcgLowest(for: card.print, wear: card.listedWear(in: listing)) : Self.tcgLowest(for: card.print)
            let chance = listing.price <= lowest ? 0.30 : 0.30 * exp(-(listing.price / lowest - 1) * 35)
            return Double.random(in: 0..<1) < chance * reachSaleFactor ? listing.price : nil
        }
        // The buyer prices the card by the condition in the listing.
        let market = card.grade == nil ? card.market(as: card.listedWear(in: listing)) : card.realMarket
        return rollSale(listing, market: market, sealed: false, slab: card.grade != nil)
    }

    /// Follower tier 3: reach speeds up every sale (docs/04-reputation-and-followers-unlocks.md).
    var reachSaleFactor: Double { hasAccount && followerTier >= 3 ? Balance.reachSaleBonus : 1 }

    func rollSale(_ listing: Listing, market: Double, sealed: Bool, slab: Bool = false) -> Double? {
        let reach = reachSaleFactor
        switch listing.channel {
        case .ebayAuction:
            guard let end = listing.auctionEndDay, data.day >= end else { return nil }
            if Double.random(in: 0..<1) < 0.05 { return nil }
            let spread = (Double.random(in: -1...1) + Double.random(in: -1...1)) / 2 * 0.35
            return max(0.99, (market * (0.95 + spread) * 100).rounded() / 100)
        case .ebay:
            let base = slab || sealed ? 0.14 : 0.10
            let chance = base * exp(-(listing.price / max(market, 0.01) - 1) * 8)
            return Double.random(in: 0..<1) < min(0.6, chance * reach) ? listing.price : nil
        case .tcgplayer:
            let chance = 0.30 * exp(-(listing.price / max(market * 0.95, 0.01) - 1) * 35)
            return Double.random(in: 0..<1) < chance * reach ? listing.price : nil
        case .social:
            return Double.random(in: 0..<1) < socialSaleChance(price: listing.price, market: market) ? listing.price : nil
        case .whatnot:
            // Whatnot sells on a stream, not from a standing listing.
            return nil
        case .facebook:
            // A Facebook listing gives an offer, not a sale. `meetupsEndDay` handles it.
            return nil
        }
    }

    /// Finishes a sale from a listing. A fake may come back to bite later (docs/14, Consequences).
    func completeSale(name: String, listing: Listing, price: Double, sealed: Bool, paid: Double?, fake: FakeTier? = nil,
                              known: Bool = false, card: OwnedCard? = nil, sealedItem: SealedItem? = nil,
                              slab: Bool = false, overstated: Bool = false) -> String {
        let line = completeSaleNow(name: name, channel: listing.channel, price: price, sealed: sealed, insured: listing.insured,
                                   paid: paid, slab: slab, overstated: overstated)
        if let fake {
            recordBadSale(item: name, channel: listing.channel.rawValue, price: price, fake: fake, known: known,
                          refunds: listing.channel.refundsFakes)
        }
        scheduleSaleProblems(name: name, channel: listing.channel, price: price, insured: listing.insured,
                             overstated: overstated || listing.overstatedCondition == true, card: card, sealed: sealedItem)
        return line
    }

    /// Takes the money for a sale on a channel, less its fees and shipping. Returns the line for the report.
    /// `paid` is what the player paid for the item, for the receipt. Nil for a pulled card.
    func completeSaleNow(name: String, channel: Listing.Channel, price: Double, sealed: Bool, insured: Bool, paid: Double?,
                         slab: Bool = false, overstated: Bool = false) -> String {
        let costs = Self.saleCosts(price: price, channel: channel, sealed: sealed, insured: insured)
        let net = price - costs.fees - costs.shipping - costs.insurance
        addLedger(net, .sale, "\(name) · \(channel.rawValue) · sold \(money(price))")
        addReceipt(name: name, venue: channel.rawValue, price: price, net: net, paid: paid, overstated: overstated)
        if channel.ships { useShippingSupplies(name: name, price: price, slab: slab, sealed: sealed) }
        notePlatformSale(channel: channel, price: price)
        let after = channel.ships ? "after fees and shipping" : "in cash"
        return "Sold \(name) on \(channel.rawValue) for \(money(price)). You got \(money(net)) \(after)."
    }

    // MARK: - Saving

    func save() {
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? JSONEncoder().encode(data).write(to: url, options: .atomic)
    }
}
