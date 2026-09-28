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
    var worksToday: Bool { isWorkDay && !data.sickToday }
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
    func slot(for hours: Double) -> Double? {
        var start = data.hour
        if worksToday && start < Balance.workEnd && start + hours > Balance.workStart {
            start = max(start, Balance.workEnd)
        }
        return start + hours <= Balance.dayEnd ? start : nil
    }

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

    func market(of item: SealedItem) -> Double {
        if let product = SetLibrary.product(item.productID, in: item.setSlug) { return product.market }
        return (SetLibrary.set(item.setSlug).packCost ?? 0) * Double(item.packs)
    }

    var marketValue: Double {
        data.sealed.reduce(0) { $0 + market(of: $1) }
            + data.raw.reduce(0) { $0 + $1.market }
            + data.slabs.reduce(0) { $0 + $1.market }
            + data.bulk.reduce(0) { $0 + $1.value }
    }

    var paid: Double {
        data.sealed.reduce(0) { $0 + $1.paid }
            + data.raw.reduce(0) { $0 + ($1.paid ?? 0) }
            + data.slabs.reduce(0) { $0 + ($1.paid ?? 0) }
            + data.openedPaid
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

    /// Opens a sealed product before its packs: the seal breaks, every pack goes back as a loose pack, and the
    /// promo cards go to Raw. Returns the promo cards.
    @discardableResult
    func openProduct(_ sourceID: UUID, ripID: UUID) -> [CardPrint] {
        guard let i = data.sealed.firstIndex(where: { $0.id == sourceID }) else { return [] }
        let item = data.sealed.remove(at: i)
        for slug in packSlugs(of: item) {
            data.sealed.append(SealedItem(setSlug: slug, name: "\(SetLibrary.set(slug).name) Booster Pack", packs: 1,
                                          paid: item.paidPerPack, acquired: item.acquired,
                                          source: "From an opened \(item.name)", productID: SetLibrary.loosePack(slug)?.id,
                                          brokenFrom: item.id, acquiredDay: data.day))
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
                data.sealed.append(SealedItem(setSlug: slug, name: "\(SetLibrary.set(slug).name) Booster Pack", packs: 1,
                                              paid: item.paidPerPack, acquired: item.acquired,
                                              source: "From an opened \(item.name)", productID: SetLibrary.loosePack(slug)?.id,
                                              brokenFrom: item.id, acquiredDay: data.day))
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
        if offer.pickup {
            guard spendHours(Balance.facebookPickupHours) else { return false }
        }
        data.boughtToday.append(offer.id)
        let status: ItemStatus? = offer.pickup ? nil : .onTheWay(daysLeft: offer.deliveryDays, store: offer.store)
        switch offer.item {
        case .product(let product, let slug):
            addLedger(-total, .sealed, "\(product.name) · \(offer.store.rawValue)")
            data.sealed.append(SealedItem(setSlug: slug, name: product.name, packs: product.packs, paid: total,
                                          acquired: .now, source: "Bought on \(offer.store.rawValue)",
                                          productID: product.id, status: status, acquiredDay: data.day))
        case .single(let print, let slug):
            addLedger(-total, .singles, "\(print.name) · \(offer.store.rawValue)")
            data.raw.append(OwnedCard(print: print, setSlug: slug, acquired: .now, paid: total, ripID: nil,
                                      condition: .secondHand(), status: status, acquiredDay: data.day))
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
        data.raw.append(OwnedCard(print: single.print, setSlug: single.setSlug, acquired: .now, paid: single.price, ripID: nil,
                                  condition: .secondHand(), acquiredDay: data.day))
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
        switch item.goods {
        case .single(let print, let slug, let condition):
            data.raw.append(OwnedCard(print: print, setSlug: slug, acquired: .now, paid: item.price, ripID: nil,
                                      condition: condition, acquiredDay: data.day))
        case .slab(let print, let slug, let grade):
            data.slabs.append(OwnedCard(print: print, setSlug: slug, acquired: .now, paid: item.price, ripID: nil, grade: grade,
                                        acquiredDay: data.day))
        case .sealed(let product):
            data.sealed.append(SealedItem(setSlug: product.homeSlug, name: product.name, packs: product.packs, paid: item.price,
                                          acquired: .now, source: "Bought at \(store.rawValue)", productID: product.id,
                                          acquiredDay: data.day))
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

    func buylistPrice(_ card: OwnedCard, at store: LocalStore) -> Double {
        (card.market * standing(store).buylistRate * 100).rounded() / 100
    }

    /// The buylist: instant cash, well below market (docs/15-selling.md, The local game shop).
    func sellToShop(_ id: UUID, at store: LocalStore) {
        guard let card = card(id), card.status == nil, !card.keep else { return }
        let price = buylistPrice(card, at: store)
        data.raw.removeAll { $0.id == id }
        data.slabs.removeAll { $0.id == id }
        addLedger(price, .sale, "\(card.print.name)\(card.grade.map { " " + $0.label } ?? "") · \(store.rawValue) buylist")
        recordDeal(shopContactID(store), what: "Sold them \(card.print.name)", price: price, market: card.market, slug: card.setSlug)
        log("Sold \(card.print.name) to \(store.rawValue) for \(money(price)) cash.", cash: price)
        save()
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

    func list(_ ids: Set<UUID>, channel: Listing.Channel, price: (UUID) -> Double, auctionDays: Int?, insured: Bool) {
        func listing(_ id: UUID) -> ItemStatus {
            .listed(Listing(channel: channel, price: price(id), dayListed: data.day,
                            auctionEndDay: auctionDays.map { data.day + $0 }, insured: insured))
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
        case .social: 0.0
        }
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
        save()
    }

    /// The overall grade: the worst subgrade leads, and each company adds its own spread (docs/10-grading.md).
    static func gradeResult(_ c: Condition, company: GradingCompany) -> SlabGrade {
        let subs = c.subgrades
        let worst = subs.min() ?? 10
        let average = subs.reduce(0, +) / Double(subs.count)
        let noise = (Double.random(in: -1...1) + Double.random(in: -1...1)) / 2 * company.spread * 2
        let raw = min(10, worst * 0.7 + average * 0.3 + noise)
        switch company {
        case .psa:
            return SlabGrade(company: .psa, grade: max(1, min(10, raw.rounded(.toNearestOrAwayFromZero))))
        case .cgc:
            return SlabGrade(company: .cgc, grade: max(1, min(10, (raw * 2).rounded() / 2)))
        case .bgs:
            let black = subs.allSatisfy { $0 == 10 }
            let grade = black ? 10 : max(1, min(raw >= 9.75 ? 10 : 9.5, (raw * 2).rounded() / 2))
            return SlabGrade(company: .bgs, grade: grade, blackLabel: black)
        }
    }

    // MARK: - End Day

    func endDay() {
        guard data.gameOver == nil else { return }
        var lines: [String] = []
        let endedWeekday = weekday

        if endedWeekday == 4, let job {
            addLedger(job.weeklyPay, .paycheck, "Paycheck · \(job.title)")
            lines.append("Payday: \(money(job.weeklyPay)) from your job.")
        }

        if let line = missedShowLine() {
            lines.append(line)
            addReputation(-5)
        }

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

        if data.day % Balance.rentCycleDays == 0 {
            if canAfford(Balance.rent) {
                addLedger(-Balance.rent, .rent, "Rent")
                lines.append("Rent paid: \(money(Balance.rent)).")
            } else {
                data.gameOver = "Rent was due on day \(data.day + 1), and you had \(money(data.cash)). You could not pay it."
                lines.append("You could not pay rent. The run is over.")
            }
        } else if daysUntilRent == Balance.rentWarningDays {
            lines.append("Rent of \(money(Balance.rent)) is due in \(Balance.rentWarningDays) days.")
        }

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
        for var item in data.sealed {
            switch item.status {
            case .onTheWay(let days, let store):
                if days <= 1 {
                    item.status = nil
                    lines.append("Delivered from \(store.rawValue): \(item.name).")
                } else {
                    item.status = .onTheWay(daysLeft: days - 1, store: store)
                }
            case .listed(let listing):
                if let sale = rollSale(listing, market: market(of: item), sealed: true) {
                    lines.append(completeSale(name: item.name, listing: listing, price: sale, sealed: true))
                    continue
                } else if listingExpired(listing) {
                    item.status = nil
                    lines.append("Your \(listing.channel.rawValue) listing for \(item.name) ended with no sale.")
                }
            default:
                break
            }
            keepItems.append(item)
        }
        data.sealed = keepItems
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
                    let grade = Self.gradeResult(card.condition, company: company)
                    card.status = nil
                    card.grade = grade
                    slabs.append(card)
                    lines.append("\(card.print.name) came back from \(company.rawValue): \(grade.label), worth \(money(card.market)).")
                    if let i = data.ledger.firstIndex(where: { $0.id == ledgerID }) {
                        data.ledger[i].pending = data.raw.contains {
                            if case .atGrader(_, _, let d, let l) = $0.status, l == ledgerID, $0.id != card.id { return d > 1 }
                            return false
                        }
                        data.ledger[i].label += " · \(card.print.name) \(grade.label)"
                    }
                    continue
                }
                card.status = .atGrader(company: company, tier: tier, daysLeft: days - 1, ledgerID: ledgerID)
            case .listed(let listing):
                if let sale = rollSale(listing, card: card) {
                    lines.append(completeSale(name: card.print.name, listing: listing, price: sale, sealed: false))
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
            if case .listed(let listing) = card.status {
                if let sale = rollSale(listing, card: card) {
                    lines.append(completeSale(name: "\(card.print.name) \(card.grade?.label ?? "")", listing: listing,
                                              price: sale, sealed: false))
                    if listing.channel == .social { markPostSale(cardID: card.id, result: .sold(sale)) }
                    continue
                } else if listingExpired(listing) {
                    card.status = nil
                    if listing.channel == .social { markPostSale(cardID: card.id, result: .noSale) }
                    lines.append("Your \(listing.channel.rawValue) listing for \(card.print.name) ended with no sale.")
                }
            }
            slabs.append(card)
        }
        data.raw = raw
        data.slabs = slabs
        return lines
    }

    private func listingExpired(_ listing: Listing) -> Bool {
        listing.auctionEndDay == nil && data.day - listing.dayListed >= Balance.listingDays
    }

    private func rollSale(_ listing: Listing, card: OwnedCard) -> Double? {
        if listing.channel == .tcgplayer {
            let lowest = Self.tcgLowest(for: card.print)
            let chance = listing.price <= lowest ? 0.30 : 0.30 * exp(-(listing.price / lowest - 1) * 35)
            return Double.random(in: 0..<1) < chance ? listing.price : nil
        }
        return rollSale(listing, market: card.market, sealed: false, slab: card.grade != nil)
    }

    private func rollSale(_ listing: Listing, market: Double, sealed: Bool, slab: Bool = false) -> Double? {
        switch listing.channel {
        case .ebayAuction:
            guard let end = listing.auctionEndDay, data.day >= end else { return nil }
            if Double.random(in: 0..<1) < 0.05 { return nil }
            let spread = (Double.random(in: -1...1) + Double.random(in: -1...1)) / 2 * 0.35
            return max(0.99, (market * (0.95 + spread) * 100).rounded() / 100)
        case .ebay:
            let base = slab || sealed ? 0.14 : 0.10
            let chance = base * exp(-(listing.price / max(market, 0.01) - 1) * 8)
            return Double.random(in: 0..<1) < min(0.6, chance) ? listing.price : nil
        case .tcgplayer:
            let chance = 0.30 * exp(-(listing.price / max(market * 0.95, 0.01) - 1) * 35)
            return Double.random(in: 0..<1) < chance ? listing.price : nil
        case .social:
            return Double.random(in: 0..<1) < socialSaleChance(price: listing.price, market: market) ? listing.price : nil
        }
    }

    private func completeSale(name: String, listing: Listing, price: Double, sealed: Bool) -> String {
        let costs = Self.saleCosts(price: price, channel: listing.channel, sealed: sealed, insured: listing.insured)
        let net = price - costs.fees - costs.shipping - costs.insurance
        addLedger(net, .sale, "\(name) · \(listing.channel.rawValue) · sold \(money(price))")
        var line = "Sold \(name) on \(listing.channel.rawValue) for \(money(price)). You got \(money(net)) after fees and shipping."
        if Double.random(in: 0..<1) < Balance.lossChance {
            if listing.insured {
                line += " The package got lost, and the insurance paid you back."
            } else {
                addLedger(-price, .refund, "Lost package · \(name)")
                line += " The package got lost with no insurance, so the buyer got a refund of \(money(price))."
            }
        }
        return line
    }

    // MARK: - Saving

    func save() {
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? JSONEncoder().encode(data).write(to: url, options: .atomic)
    }
}
