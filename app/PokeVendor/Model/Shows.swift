import Foundation
import Observation

// Card shows (docs/20-card-shows.md) and the calendar (docs/17-calendar-and-events.md).

enum ShowSize: String, Codable, Hashable {
    case local, regional

    var days: Int { self == .regional ? 2 : 1 }
    var tableFee: Double { self == .regional ? Balance.regionalTableFee : Balance.localTableFee }
    var entryFee: Double { self == .regional ? 15 : 5 }
    /// The mean number of buyers who come to one table in one day.
    var buyersPerDay: Double { self == .regional ? 40 : 20 }
    /// Booking closes this many days before the first day.
    var bookingCloses: Int { self == .regional ? 7 : 1 }
    var label: String { self == .regional ? "Regional show" : "Local show" }
}

/// One card show on the calendar. A regional show is two days, Saturday and Sunday.
struct CardShow: Codable, Identifiable, Hashable {
    var id = UUID()
    let name: String
    let venue: String
    let size: ShowSize
    let startDay: Int
    var booked = false
    /// The show days that the player went to, as 0 or 1.
    var attended: [Int] = []

    var endDay: Int { startDay + size.days - 1 }
    var lastBookingDay: Int { startDay - size.bookingCloses }

    func covers(_ day: Int) -> Bool { day >= startDay && day <= endDay }
}

/// One line on the calendar.
struct CalendarEntry: Identifiable {
    enum Kind { case work, paycheck, rent, show, delivery, grading, auction }

    let id = UUID()
    let kind: Kind
    let title: String
    var detail: String = ""
    var showID: UUID?

    var icon: String {
        switch kind {
        case .work: "briefcase"
        case .paycheck: "dollarsign.circle"
        case .rent: "house"
        case .show: "tablecells"
        case .delivery: "shippingbox"
        case .grading: "seal"
        case .auction: "hammer"
        }
    }
}

extension GameStore {
    // MARK: - Scheduling

    private static let showNames = ["Riverside Card Show", "Tri-County Collectors Expo", "Northgate Card & Toy Show",
                                    "Lakeshore TCG Market", "Valley Card Show", "Cardboard Summit", "Hometown Hobby Show",
                                    "Metro Trading Card Expo"]
    private static let localVenues = ["VFW Hall", "Community Center gym", "Elks Lodge", "Library meeting room"]
    private static let regionalVenues = ["Convention Center, Hall B", "Expo Center", "Holiday Inn ballroom"]

    /// Keeps the calendar full for the next six weeks. The same day always gives the same show.
    func scheduleShows() {
        let horizon = data.day + Balance.showHorizonDays
        var day = max(data.showsPlannedThrough + 1, data.day)
        while day <= horizon {
            if day % 7 == 5 {
                var rng = SeededRandom(seed: UInt64(day) &* 104_729 &+ 31)
                let week = day / 7
                let size: ShowSize? = week % 4 == 2 ? .regional : (rng.next() < 0.5 ? .local : nil)
                if let size {
                    let name = Self.showNames[Int(rng.next() * CGFloat(Self.showNames.count)) % Self.showNames.count]
                    let venues = size == .regional ? Self.regionalVenues : Self.localVenues
                    let venue = venues[Int(rng.next() * CGFloat(venues.count)) % venues.count]
                    data.shows.append(CardShow(name: name, venue: venue, size: size, startDay: day))
                }
            }
            data.showsPlannedThrough = day
            day += 1
        }
        let oldest = data.day - 14
        data.shows.removeAll { $0.endDay < oldest }
    }

    var upcomingShows: [CardShow] { data.shows.filter { $0.endDay >= data.day }.sorted { $0.startDay < $1.startDay } }

    func show(_ id: UUID) -> CardShow? { data.shows.first { $0.id == id } }

    /// The show on today's date, if there is one.
    var showToday: CardShow? { data.shows.first { $0.covers(data.day) } }

    func canBook(_ show: CardShow) -> Bool {
        !show.booked && data.day <= show.lastBookingDay && canAfford(show.size.tableFee)
    }

    func bookTable(_ id: UUID) {
        guard let i = data.shows.firstIndex(where: { $0.id == id }), canBook(data.shows[i]) else { return }
        let show = data.shows[i]
        data.shows[i].booked = true
        addLedger(-show.size.tableFee, .showFees, "Table · \(show.name)")
        log("Booked a table at \(show.name) for \(money(show.size.tableFee)).", cash: -show.size.tableFee)
        save()
    }

    /// The player can go to today's show once a day, while the doors are open.
    var canGoToShowToday: Bool {
        guard let show = showToday else { return false }
        let index = data.day - show.startDay
        return !show.attended.contains(index) && data.hour < Balance.showClose - 1
            && (show.booked || canAfford(show.size.entryFee))
    }

    /// Starts today's show day. It takes the rest of the day. A walk-in pays the entry fee.
    func startShowDay() -> CardShow? {
        guard canGoToShowToday, let show = showToday, let i = data.shows.firstIndex(where: { $0.id == show.id }) else {
            return nil
        }
        data.shows[i].attended.append(data.day - show.startDay)
        if !show.booked {
            addLedger(-show.size.entryFee, .showFees, "Entry · \(show.name)")
        }
        save()
        return data.shows[i]
    }

    /// The show fills the day: the clock goes to the end of the day.
    func finishShowDay(_ show: CardShow, sold: Double, bought: Double, count: Int) {
        data.hour = Balance.dayEnd
        log("Worked \(show.name): \(count) deal\(count == 1 ? "" : "s"), \(money(sold)) in sales, \(money(bought)) spent on the floor.")
        save()
    }

    /// A booked show day that the player did not go to. Called when the day ends.
    func missedShowLine() -> String? {
        guard let show = showToday, show.booked, !show.attended.contains(data.day - show.startDay) else { return nil }
        return "You missed day \(data.day - show.startDay + 1) of \(show.name). The table stayed empty."
    }

    // MARK: - Deals

    /// Items the player can bring to a table: not kept, and not listed, shipping, or at a grader.
    var showStock: (cards: [OwnedCard], sealed: [SealedItem]) {
        ((data.raw + data.slabs).filter { $0.status == nil && !$0.keep }, data.sealed.filter { $0.status == nil && !$0.keep })
    }

    func sellAtShow(_ item: ShowItem, price: Double, show: CardShow) {
        switch item.kind {
        case .card:
            data.raw.removeAll { $0.id == item.id }
            data.slabs.removeAll { $0.id == item.id }
        case .sealed:
            data.sealed.removeAll { $0.id == item.id }
        }
        addLedger(price, .sale, "\(item.name) · \(show.name)")
        log("Sold \(item.name) at \(show.name) for \(money(price)).", cash: price)
        save()
    }

    func buyCardAtShow(_ card: OwnedCard, price: Double, vendor: String, show: CardShow) {
        var card = card
        card.acquiredDay = data.day
        addLedger(-price, .singles, "\(card.print.name)\(card.grade.map { " " + $0.label } ?? "") · \(vendor)")
        if card.grade == nil { data.raw.append(card) } else { data.slabs.append(card) }
        log("Bought \(card.print.name)\(card.grade.map { " (\($0.label))" } ?? "") from \(vendor) at \(show.name) for \(money(price)).",
            cash: -price)
        save()
    }

    @discardableResult
    func buySealedAtShow(_ product: Product, price: Double, vendor: String, show: CardShow) -> SealedItem {
        addLedger(-price, .sealed, "\(product.name) · \(vendor)")
        let item = SealedItem(setSlug: product.homeSlug, name: product.name, packs: product.packs, paid: price,
                              acquired: .now, source: "\(vendor), \(show.name)", productID: product.id, acquiredDay: data.day)
        data.sealed.append(item)
        log("Bought \(product.name) from \(vendor) at \(show.name) for \(money(price)).", cash: -price)
        save()
        return item
    }

    /// A mystery pack: the hit goes to Raw or Slabs with the price as its cost, and the filler goes to bulk.
    func buyMysteryAtShow(_ pack: MysteryPack, hit: OwnedCard, filler: [CardPrint], fillerSlug: String, price: Double,
                          vendor: String, show: CardShow) {
        var hit = hit
        hit.acquiredDay = data.day
        addLedger(-price, .singles, "\(pack.name) · \(vendor)")
        if hit.grade == nil { data.raw.append(hit) } else { data.slabs.append(hit) }
        if !filler.isEmpty {
            data.bulk.append(BulkGroup(ripID: UUID(), setSlug: fillerSlug, date: .now, cards: filler, day: data.day))
        }
        log("Opened a \(pack.name.lowercased()) from \(vendor): \(hit.print.name)\(hit.grade.map { " (\($0.label))" } ?? "") worth \(money(hit.market)).",
            cash: -price)
        save()
    }

    /// A trade: the player's item goes, and the other person's cards plus any cash come in.
    func tradeAtShow(_ item: ShowItem, for cards: [FloorListing], cash: Double, show: CardShow) {
        switch item.kind {
        case .card:
            data.raw.removeAll { $0.id == item.id }
            data.slabs.removeAll { $0.id == item.id }
        case .sealed:
            data.sealed.removeAll { $0.id == item.id }
        }
        // Each card that came in carries its value as its cost, so the portfolio header stays honest.
        for card in cards {
            data.raw.append(OwnedCard(print: card.print, setSlug: card.setSlug, acquired: .now, paid: card.market, ripID: nil,
                                      condition: card.condition, acquiredDay: data.day))
        }
        if cash > 0 { addLedger(cash, .sale, "\(item.name) · trade at \(show.name)") }
        log("Traded \(item.name) for \(cards.map(\.print.name).joined(separator: " and "))\(cash > 0 ? " plus \(money(cash))" : "") at \(show.name).",
            cash: cash > 0 ? cash : nil)
        save()
    }

    // MARK: - Calendar

    /// Everything on one day of the calendar.
    func calendarEntries(day: Int) -> [CalendarEntry] {
        var out: [CalendarEntry] = []
        let weekday = day % 7
        if weekday < 5, let job {
            out.append(CalendarEntry(kind: .work, title: "Work shift", detail: "9 AM – 5 PM · \(job.title)"))
        }
        if weekday == 4, let job {
            out.append(CalendarEntry(kind: .paycheck, title: "Payday", detail: money(job.weeklyPay)))
        }
        if day > 0 && day % Balance.rentCycleDays == 0 {
            out.append(CalendarEntry(kind: .rent, title: "Rent due", detail: money(Balance.rent)))
        }
        for show in data.shows where show.covers(day) {
            let dayText = show.size.days > 1 ? " · day \(day - show.startDay + 1) of \(show.size.days)" : ""
            out.append(CalendarEntry(kind: .show, title: show.name,
                                     detail: "\(show.size.label)\(dayText) · \(show.booked ? "table booked" : "no table")",
                                     showID: show.id))
        }
        let offset = day - data.day
        guard offset > 0 else { return out }
        let arriving = data.sealed.filter { if case .onTheWay(let d, _) = $0.status { return d == offset }; return false }
        let cardsArriving = (data.raw + data.slabs).filter {
            if case .onTheWay(let d, _) = $0.status { return d == offset }
            return false
        }
        if arriving.count + cardsArriving.count > 0 {
            let names = arriving.map(\.name) + cardsArriving.map(\.print.name)
            out.append(CalendarEntry(kind: .delivery, title: "Delivery", detail: names.prefix(2).joined(separator: ", ")
                                     + (names.count > 2 ? " and \(names.count - 2) more" : "")))
        }
        let grading = data.raw.filter {
            if case .atGrader(_, _, let d, _) = $0.status { return d == offset }
            return false
        }
        if !grading.isEmpty {
            out.append(CalendarEntry(kind: .grading, title: "Grades come back",
                                     detail: "\(grading.count) card\(grading.count == 1 ? "" : "s")"))
        }
        let auctions = (data.raw + data.slabs).filter {
            if case .listed(let l) = $0.status { return l.auctionEndDay == day }
            return false
        }.count + data.sealed.filter {
            if case .listed(let l) = $0.status { return l.auctionEndDay == day }
            return false
        }.count
        if auctions > 0 {
            out.append(CalendarEntry(kind: .auction, title: "Auction ends", detail: "\(auctions) listing\(auctions == 1 ? "" : "s")"))
        }
        return out
    }
}

// MARK: - The show day

/// An item on the player's table.
struct ShowItem: Identifiable, Hashable {
    enum Kind: Hashable { case card, sealed }

    let id: UUID
    let kind: Kind
    let name: String
    let detail: String
    let market: Double
    let image: String?
    /// Nil for sealed product and slabs.
    let condition: Condition?
    let graded: Bool
    let setSlug: String

    var isVintage: Bool { Balance.vintageSets.contains(setSlug) || Balance.olderSets.contains(setSlug) }
}

/// A card that a visitor offers in a trade.
struct FloorListing: Identifiable, Hashable {
    let id = UUID()
    let print: CardPrint
    let setSlug: String
    let condition: Condition
    let price: Double

    /// The card's value in its condition.
    var market: Double { (print.market ?? 0) * condition.wear.valueFactor }
}

extension Wear {
    /// What wear takes off a card's value.
    var valueFactor: Double {
        switch self {
        case .nearMint: 1
        case .lightlyPlayed: 0.8
        case .moderatelyPlayed: 0.6
        }
    }
}

/// The people who come up at a show.
enum VisitorType: CaseIterable {
    case collector, flipper, kid, gradeHunter, vintageFan, sealedCollector, trader, closetCleaner, dealer

    var label: String {
        switch self {
        case .collector: "Collector"
        case .flipper: "Flipper"
        case .kid: "Kid with a parent"
        case .gradeHunter: "Grading hunter"
        case .vintageFan: "Vintage collector"
        case .sealedCollector: "Sealed collector"
        case .trader: "Trader"
        case .closetCleaner: "Cleaning out a closet"
        case .dealer: "Dealer moving stock"
        }
    }

    var icon: String {
        switch self {
        case .collector: "person.fill"
        case .flipper: "arrow.left.arrow.right"
        case .kid: "figure.and.child.holdinghands"
        case .gradeHunter: "magnifyingglass"
        case .vintageFan: "crown"
        case .sealedCollector: "shippingbox"
        case .trader: "arrow.triangle.swap"
        case .closetCleaner: "archivebox"
        case .dealer: "briefcase"
        }
    }
}

/// Someone at the show who wants to buy from the player, trade with the player, or sell to the player.
struct Visitor: Identifiable {
    enum Intent { case buy, trade, sell }

    let id = UUID()
    let type: VisitorType
    let name: String
    let intent: Intent
    /// The player's item that they want, to buy or to trade for.
    let item: ShowItem?
    /// Hidden. To buy: the most they pay. To sell: the least they take.
    var limit: Double
    /// To buy: their offer. To sell: their price.
    var offer: Double
    var patience: Int
    var line: String
    var tradeCards: [FloorListing] = []
    var tradeCash: Double = 0
    /// What they sell, and what it is worth.
    var goods: VendorGoods?
    var goodsMarket: Double = 0

    var tradeValue: Double { tradeCards.reduce(0) { $0 + $1.market } + tradeCash }
}

/// One day at a card show: the table, the visitors, and the floor.
@MainActor @Observable
final class ShowSession {
    enum Phase { case setup, table, floor, summary }

    let show: CardShow
    let dayIndex: Int
    let hasTable: Bool
    private let store: GameStore

    var phase: Phase
    /// Minutes since the doors opened at 9 AM.
    private(set) var minute: Double
    let closeMinute = (Balance.showClose - Balance.showOpen) * 60
    var markup = 1.10
    var bring: Set<UUID> = []
    private(set) var table: [ShowItem] = []
    /// The person at the player's table.
    private(set) var visitor: Visitor?
    /// Someone who stops the player on the floor.
    private(set) var approach: Visitor?
    private(set) var vendors: [Vendor] = []
    private(set) var openVendorID: UUID?
    /// The mystery pack that is being opened, while its reveal shows.
    var reveal: MysteryReveal?
    /// Sealed product the player just bought. The player can rip it on the spot.
    var justBought: SealedItem?
    private var arrivals: [Double] = []
    private(set) var missed = 0
    private(set) var sold: [(name: String, price: Double)] = []
    private(set) var bought: [(name: String, price: Double)] = []
    private(set) var trades: [String] = []
    private(set) var walkedAway = 0
    /// True once the table is set up and open.
    private(set) var opened = false
    var note: String?

    init(show: CardShow, store: GameStore) {
        self.show = show
        self.store = store
        dayIndex = store.day - show.startDay
        hasTable = show.booked
        phase = show.booked ? .setup : .floor
        // A player who arrives late loses the hours before they came.
        minute = max(0, (store.data.hour - Balance.showOpen) * 60)
        let stock = store.showStock
        bring = Set(stock.cards.map(\.id) + stock.sealed.map(\.id))
        vendors = VendorFloor.tables(for: show.size)
    }

    var clock: String { GameStore.clock(Balance.showOpen + minute / 60) }
    var isOver: Bool { minute >= closeMinute }
    var soldTotal: Double { sold.reduce(0) { $0 + $1.price } }
    var boughtTotal: Double { bought.reduce(0) { $0 + $1.price } }

    func asking(_ item: ShowItem) -> Double { Self.round(item.market * markup) }

    static func round(_ value: Double) -> Double {
        value >= 20 ? value.rounded() : (value * 4).rounded() / 4
    }

    // MARK: Setup

    var stockItems: [ShowItem] {
        let stock = store.showStock
        let cards = stock.cards.map { card in
            ShowItem(id: card.id, kind: .card, name: card.print.name,
                     detail: card.grade?.label ?? "\(card.print.rarity) · \(card.print.num)", market: card.market,
                     image: card.print.image, condition: card.grade == nil ? card.condition : nil, graded: card.grade != nil,
                     setSlug: card.setSlug)
        }
        let sealed = stock.sealed.map { item in
            ShowItem(id: item.id, kind: .sealed, name: item.name, detail: "Sealed", market: store.market(of: item),
                     image: SetLibrary.product(item.productID)?.image, condition: nil, graded: false, setSlug: item.setSlug)
        }
        return (cards + sealed).sorted { $0.market > $1.market }
    }

    func openTable() {
        table = stockItems.filter { bring.contains($0.id) && $0.market >= 0.5 }
        // More value on the table draws more people, up to a point.
        var mean = show.size.buyersPerDay * (1 - minute / closeMinute)
        mean *= min(1.3, 0.7 + Double(table.count) / 30)
        let count = max(0, Int((mean + Double.random(in: -2...2)).rounded()))
        arrivals = (0..<count).map { _ in Double.random(in: minute..<closeMinute) }.sorted()
        opened = true
        phase = .table
        nextVisitor()
    }

    // MARK: Table

    /// Brings the next person. The clock jumps to their arrival. People who waited more than half an hour left.
    func nextVisitor() {
        visitor = nil
        guard phase == .table else { return }
        while let first = arrivals.first, first < minute - 30 {
            arrivals.removeFirst()
            missed += 1
        }
        guard let first = arrivals.first, first < closeMinute else {
            arrivals.removeAll()
            minute = closeMinute
            phase = .summary
            return
        }
        arrivals.removeFirst()
        minute = max(minute, first)
        visitor = makeVisitor()
        if visitor == nil { nextVisitor() }
    }

    /// Most people want to buy. Some want to trade, and some want to sell to the player.
    private func makeVisitor() -> Visitor? {
        let roll = Double.random(in: 0..<1)
        if table.isEmpty || roll < 0.22 { return makeSeller() }
        if roll < 0.40, let trader = makeTrader() { return trader }
        return makeBuyer()
    }

    private func makeBuyer() -> Visitor? {
        var type = [VisitorType.collector, .collector, .flipper, .kid, .gradeHunter, .vintageFan, .sealedCollector]
            .randomElement() ?? .collector
        var wanted: [ShowItem] = switch type {
        case .kid: table.filter { $0.market <= 30 }
        case .gradeHunter: table.filter { $0.kind == .card && !$0.graded && $0.market >= 5 }
        case .vintageFan: table.filter(\.isVintage)
        case .sealedCollector: table.filter { $0.kind == .sealed }
        default: table
        }
        if wanted.isEmpty {
            type = .collector
            wanted = table
        }
        // People look at the better items first.
        guard let item = pick(wanted) else { return nil }
        var top: Double = switch type {
        case .flipper: item.market * Double.random(in: 0.68...0.82)
        case .kid: min(item.market * Double.random(in: 0.95...1.15), 30)
        case .gradeHunter: item.market * Double.random(in: 0.85...1.0)
        case .vintageFan: item.market * Double.random(in: 0.95...1.12)
        case .sealedCollector: item.market * Double.random(in: 0.9...1.05)
        default: item.market * Double.random(in: 0.92...1.08)
        }
        var line = ""
        if let c = item.condition {
            let wear = c.wear
            let cut = CutReading.front(c.cut, tool: 2).rank
            switch wear {
            case .nearMint: break
            case .lightlyPlayed:
                top *= 0.82
                line = "There's some wear on the corners. "
            case .moderatelyPlayed:
                top *= 0.6
                line = "This one's pretty played. "
            }
            if type == .gradeHunter {
                if wear == .nearMint && cut <= 55 {
                    top *= 1.12
                    line = "Clean, and it looks centered. "
                } else if cut > 60 {
                    top *= 0.7
                    line = "It's off center, so it won't grade well. "
                }
            } else if cut > 63 {
                top *= 0.92
                line += "It's a bit off center. "
            }
        }
        if type == .vintageFan { line = "I've been hunting for one of these. " + line }
        top = max(0.25, top)
        let ask = asking(item)
        let offer = max(0.25, Self.round(min(ask, top * Double.random(in: 0.72...0.9))))
        return Visitor(type: type, name: Self.names.randomElement() ?? "A buyer", intent: .buy, item: item, limit: min(top, ask),
                       offer: offer, patience: type == .flipper ? 1 : 2,
                       line: line + (offer >= ask ? "I'll take it at your price." : "Would you take \(money(offer))?"))
    }

    /// A trade: one or two of their cards, and sometimes cash, for one of the player's items.
    private func makeTrader() -> Visitor? {
        guard let item = pick(table.filter { $0.market >= 8 }) else { return nil }
        let target = item.market * Double.random(in: 0.8...1.02)
        var cards: [FloorListing] = []
        if let first = tradeCard(max: target * Double.random(in: 0.5...0.95)) { cards.append(first) }
        let left = target - cards.reduce(0) { $0 + $1.market }
        if left > 4, Bool.random(), let second = tradeCard(max: left) { cards.append(second) }
        guard !cards.isEmpty else { return nil }
        let value = cards.reduce(0) { $0 + $1.market }
        let cash = value < target && Bool.random() ? Self.round(target - value) : 0
        let names = cards.map(\.print.name).joined(separator: " and ")
        var v = Visitor(type: .trader, name: Self.names.randomElement() ?? "A trader", intent: .trade, item: item,
                        limit: item.market * Double.random(in: 1.0...1.1), offer: 0, patience: 1,
                        line: "I'm after your \(item.name). My \(names)\(cash > 0 ? " plus \(money(cash))" : "") for it?")
        v.tradeCards = cards
        v.tradeCash = cash
        return v
    }

    /// Someone who wants to sell to the player: often an old collection, with vintage in it.
    private func makeSeller() -> Visitor? {
        let type = [VisitorType.closetCleaner, .closetCleaner, .collector, .dealer].randomElement() ?? .closetCleaner
        // Most sellers bring something the player can pay for. Now and then, someone brings a big item.
        let budget = max(40, store.cash * 1.3)
        let stretch = Double.random(in: 0..<1) < 0.15
        var picked: (VendorGoods, Double)?
        for _ in 0..<10 {
            guard let offer = sellerGoods() else { continue }
            picked = offer
            if stretch || offer.1 <= budget { break }
        }
        guard let (goods, market) = picked else { return nil }
        let (askRange, floorRange): (ClosedRange<Double>, ClosedRange<Double>) = switch type {
        case .closetCleaner: (0.6...0.85, 0.42...0.6)
        case .dealer: (0.85...1.0, 0.72...0.85)
        default: (0.75...0.95, 0.6...0.75)
        }
        let ask = max(1, Self.round(market * Double.random(in: askRange)))
        let bottom = min(ask, market * Double.random(in: floorRange))
        let name = VendorItem(goods: goods, price: ask, market: market).name
        let line: String = switch type {
        case .closetCleaner: "Found this in my closet. Would you give me \(money(ask)) for the \(name)?"
        case .dealer: "I'm moving some stock. \(money(ask)) for this \(name)?"
        default: "Selling off part of my collection. \(money(ask)) for the \(name)?"
        }
        var v = Visitor(type: type, name: Self.names.randomElement() ?? "A seller", intent: .sell, item: nil, limit: bottom,
                        offer: ask, patience: type == .closetCleaner ? 2 : 1, line: line)
        v.goods = goods
        v.goodsMarket = market
        return v
    }

    /// One thing a seller could bring: a single (often old), a slab, or sealed product.
    private func sellerGoods() -> (VendorGoods, Double)? {
        let roll = Double.random(in: 0..<1)
        if roll < 0.5, let (p, s) = VendorFloor.randomPrint(from: Double.random(in: 0..<1) < 0.6 ? Balance.vintageSets + Balance.olderSets
                                                             : Balance.modernSets, minMarket: 4) {
            let c = Balance.vintageSets.contains(s) || Balance.olderSets.contains(s) ? Condition.played() : .packFresh()
            return (.single(p, slug: s, condition: c), (p.market ?? 0) * c.wear.valueFactor)
        }
        if roll < 0.7, let (p, s) = VendorFloor.randomPrint(from: Balance.showSets, minMarket: 10) {
            let grade = SlabGrade(company: Bool.random() ? .psa : .cgc, grade: [7.0, 8, 9, 9, 10].randomElement() ?? 9)
            return (.slab(p, slug: s, grade: grade), OwnedCard(print: p, setSlug: s, acquired: .now, paid: nil, ripID: nil, grade: grade).market)
        }
        guard let product = SetLibrary.catalog.filter({ Balance.showSets.contains($0.homeSlug) && $0.market > 0 }).randomElement() else {
            return nil
        }
        return (.sealed(product), product.market)
    }

    private func pick(_ items: [ShowItem]) -> ShowItem? {
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

    // MARK: Deals

    /// The person the player is dealing with: at the table, or on the floor.
    var current: Visitor? { phase == .table ? visitor : approach }

    private func setCurrent(_ v: Visitor?) {
        if phase == .table { visitor = v } else { approach = v }
    }

    func accept() {
        guard let v = current else { return }
        switch v.intent {
        case .buy:
            guard let item = v.item else { return }
            store.sellAtShow(item, price: v.offer, show: show)
            sold.append((item.name, v.offer))
            table.removeAll { $0.id == item.id }
        case .trade:
            guard let item = v.item else { return }
            store.tradeAtShow(item, for: v.tradeCards, cash: v.tradeCash, show: show)
            trades.append("\(item.name) → \(v.tradeCards.map(\.print.name).joined(separator: " + "))\(v.tradeCash > 0 ? " + \(money(v.tradeCash))" : "")")
            table.removeAll { $0.id == item.id }
        case .sell:
            guard let goods = v.goods else { return }
            guard store.canAfford(v.offer) else {
                note = "You do not have enough cash."
                return
            }
            buyGoods(goods, price: v.offer, from: v.name)
        }
        finish(minutes: .random(in: 6...12))
        Haptics.hit()
    }

    /// A counter. To a buyer: the player asks for more. To a seller: the player offers less. Past the hidden limit,
    /// the other side moves part of the way, or walks away when their patience runs out.
    func counter(_ price: Double) {
        guard var v = current else { return }
        let fits = v.intent == .sell ? price >= v.limit - 0.001 : price <= v.limit + 0.001
        if fits {
            v.offer = price
            v.line = "Deal."
            setCurrent(v)
            accept()
            return
        }
        if v.patience <= 0 {
            v.line = v.intent == .sell ? "No, that's too low. I'll find someone else." : "That's too much for me. Good luck!"
            setCurrent(v)
            walkedAway += 1
            note = "\(v.name) walked away."
            finish(minutes: .random(in: 4...8))
            return
        }
        v.patience -= 1
        let moved = v.offer + (v.limit - v.offer) * Double.random(in: 0.5...0.9)
        v.offer = Self.round(v.intent == .sell ? max(v.limit, moved) : min(v.limit, moved))
        v.line = v.intent == .sell ? "I could do \(money(v.offer)). That's as low as I go." : "Hmm. I can go to \(money(v.offer)). That's about my limit."
        setCurrent(v)
        spend(3)
    }

    /// In a trade: asks for cash on top. It works when their limit leaves room for it.
    func askForCash() {
        guard var v = current, v.intent == .trade, let item = v.item else { return }
        let room = v.limit - v.tradeValue
        if v.patience > 0, room > 1 {
            let extra = Self.round(room * Double.random(in: 0.5...1))
            v.tradeCash += extra
            v.patience -= 1
            v.line = "Fine. I'll add \(money(extra)). That's my best."
        } else {
            v.patience = 0
            v.line = "That's already a fair trade for your \(item.name)."
        }
        setCurrent(v)
        spend(2)
    }

    /// Rips the sealed product that the player just bought, on the spot. Each pack takes about 2 minutes.
    func ripJustBought() -> SealedItem? {
        guard let item = justBought, store.data.sealed.contains(where: { $0.id == item.id }) else {
            justBought = nil
            return nil
        }
        justBought = nil
        spend(Double(max(1, item.packs)) * 2)
        return item
    }

    func decline() {
        guard let v = current else { return }
        note = "\(v.name) moved on."
        finish(minutes: .random(in: 2...5))
    }

    private func finish(minutes: Double) {
        if phase == .table {
            minute += minutes
            visitor = nil
            if isOver { phase = .summary } else { nextVisitor() }
        } else {
            approach = nil
            spend(minutes)
        }
    }

    func packUp() {
        visitor = nil
        approach = nil
        missed += arrivals.count
        arrivals.removeAll()
        phase = .summary
    }

    // MARK: Floor

    /// Leaves the table for the floor. The clock only moves when the player looks at a table, deals, or buys.
    func walkFloor() {
        visitor = nil
        openVendorID = nil
        phase = isOver ? .summary : .floor
    }

    var openVendor: Vendor? { vendors.first { $0.id == openVendorID } }

    /// Looks over one table. The first look takes a quarter hour. Sometimes someone stops the player on the way
    /// with something to sell.
    func visit(_ vendor: Vendor) {
        guard let i = vendors.firstIndex(where: { $0.id == vendor.id }) else { return }
        if !vendors[i].visited {
            vendors[i].visited = true
            spend(Balance.vendorVisitMinutes)
            if !isOver, approach == nil, Double.random(in: 0..<1) < 0.25 { approach = makeSeller() }
        }
        openVendorID = vendor.id
    }

    func closeVendor() { openVendorID = nil }

    private func spend(_ minutes: Double) {
        minute = min(closeMinute, minute + minutes)
        let gone = arrivals.filter { $0 < minute - 30 }.count
        missed += gone
        arrivals.removeAll { $0 < minute - 30 }
        if isOver {
            openVendorID = nil
            approach = nil
            phase = .summary
        }
    }

    func backToTable() {
        guard hasTable else { return }
        openVendorID = nil
        approach = nil
        guard opened else {
            phase = .setup
            return
        }
        phase = .table
        nextVisitor()
    }

    func buy(_ item: VendorItem, from vendor: Vendor) {
        guard let v = vendors.firstIndex(where: { $0.id == vendor.id }),
              let i = vendors[v].items.firstIndex(where: { $0.id == item.id }) else { return }
        guard store.canAfford(item.price) else {
            note = "You do not have enough cash."
            return
        }
        buyGoods(item.goods, price: item.price, from: vendor.name)
        // Mystery packs do not run out. Everything else leaves the table.
        if case .mystery = item.goods {} else { vendors[v].items.remove(at: i) }
        spend(5)
        Haptics.tap(.medium)
    }

    private func buyGoods(_ goods: VendorGoods, price: Double, from seller: String) {
        let name = VendorItem(goods: goods, price: price, market: nil).name
        switch goods {
        case .single(let print, let slug, let condition):
            store.buyCardAtShow(OwnedCard(print: print, setSlug: slug, acquired: .now, paid: price, ripID: nil,
                                          condition: condition), price: price, vendor: seller, show: show)
        case .slab(let print, let slug, let grade):
            store.buyCardAtShow(OwnedCard(print: print, setSlug: slug, acquired: .now, paid: price, ripID: nil, grade: grade),
                                price: price, vendor: seller, show: show)
        case .sealed(let product):
            justBought = store.buySealedAtShow(product, price: price, vendor: seller, show: show)
        case .mystery(let pack):
            let contents = VendorFloor.open(pack)
            store.buyMysteryAtShow(pack, hit: contents.hit, filler: contents.filler, fillerSlug: contents.fillerSlug,
                                   price: price, vendor: seller, show: show)
            reveal = MysteryReveal(pack: pack, price: price, filler: contents.filler, hit: contents.hit)
        }
        bought.append((name, price))
    }

    /// Asks the vendor for 10% off. How often it works depends on the vendor. Each item can be asked about once.
    func askForDeal(_ item: VendorItem, from vendor: Vendor) {
        guard let v = vendors.firstIndex(where: { $0.id == vendor.id }),
              let i = vendors[v].items.firstIndex(where: { $0.id == item.id }), !vendors[v].items[i].askedForDeal else { return }
        let yes = Double.random(in: 0..<1) < vendor.kind.dealChance
        vendors[v].items[i].askedForDeal = true
        if yes { vendors[v].items[i].price = Self.round(item.price * 0.9) }
        note = yes ? "\(vendor.name) took 10% off." : "\(vendor.name) said the price is firm."
        spend(2)
    }

    /// A card for a trade, worth no more than the value given. Traders often bring older cards.
    private func tradeCard(max value: Double) -> FloorListing? {
        for _ in 0..<25 {
            let sets = Double.random(in: 0..<1) < 0.4 ? Balance.vintageSets + Balance.olderSets : Balance.modernSets
            guard let (print, slug) = VendorFloor.randomPrint(from: sets, minMarket: max(2, value * 0.3), maxMarket: value) else { continue }
            let condition = sets.contains("base-set") ? Condition.played() : Condition.packFresh()
            let card = FloorListing(print: print, setSlug: slug, condition: condition, price: 0)
            if card.market <= value, card.market >= 1 { return card }
        }
        return nil
    }

    #if DEBUG
    /// Screenshot aid: puts a seller or a trader at the table, or stops the player on the floor.
    func debugVisitor(_ kind: String) {
        switch kind {
        case "seller": visitor = makeSeller()
        case "trader": visitor = makeTrader() ?? visitor
        default: approach = makeSeller()
        }
    }
    #endif

    private static let names = ["Marcus", "Jen", "Tyler", "Priya", "Dev", "Sam", "Alyssa", "Chris", "Nate", "Olivia",
                                "Jordan", "Kai", "Mia", "Ben", "Rosa", "Luis", "Hannah", "Theo", "Gabe", "Wes", "Tina",
                                "Omar", "Lena", "Victor", "Ruth", "Andre", "Ellie", "Frank"]
}

/// A mystery pack that the player just bought: the filler first, then the hit.
struct MysteryReveal: Identifiable {
    let id = UUID()
    let pack: MysteryPack
    let price: Double
    let filler: [CardPrint]
    let hit: OwnedCard
}
