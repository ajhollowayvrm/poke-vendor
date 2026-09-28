import Foundation
import Observation

// Card shows (docs/20-card-shows.md) and the calendar (docs/17-calendar-and-events.md).

enum ShowSize: String, Codable, Hashable {
    case local, regional

    var days: Int { self == .regional ? 2 : 1 }
    var tableFee: Double { self == .regional ? Balance.regionalTableFee : Balance.localTableFee }
    var entryFee: Double { self == .regional ? 15 : 5 }
    /// The mean number of buyers who come to one table in one day.
    var buyersPerDay: Double { self == .regional ? 28 : 14 }
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

    func buySealedAtShow(_ product: Product, price: Double, vendor: String, show: CardShow) {
        addLedger(-price, .sealed, "\(product.name) · \(vendor)")
        data.sealed.append(SealedItem(setSlug: product.homeSlug, name: product.name, packs: product.packs, paid: price,
                                      acquired: .now, source: "\(vendor), \(show.name)", productID: product.id,
                                      acquiredDay: data.day))
        log("Bought \(product.name) from \(vendor) at \(show.name) for \(money(price)).", cash: -price)
        save()
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

    /// A trade: the player's item goes, and the buyer's card plus any cash comes in.
    func tradeAtShow(_ item: ShowItem, for card: FloorListing, cash: Double, show: CardShow) {
        switch item.kind {
        case .card:
            data.raw.removeAll { $0.id == item.id }
            data.slabs.removeAll { $0.id == item.id }
        case .sealed:
            data.sealed.removeAll { $0.id == item.id }
        }
        // The card that came in carries the trade value as its cost, so the portfolio header stays honest.
        data.raw.append(OwnedCard(print: card.print, setSlug: card.setSlug, acquired: .now, paid: card.market, ripID: nil,
                                  condition: card.condition, acquiredDay: data.day))
        if cash > 0 { addLedger(cash, .sale, "\(item.name) · trade at \(show.name)") }
        log("Traded \(item.name) for \(card.print.name)\(cash > 0 ? " plus \(money(cash))" : "") at \(show.name).",
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
}

/// A card for sale at another vendor's table, or a card a buyer offers in a trade.
struct FloorListing: Identifiable, Hashable {
    let id = UUID()
    let print: CardPrint
    let setSlug: String
    let condition: Condition
    let price: Double
    var askedForDeal = false

    var market: Double { print.market ?? 0 }
}

/// The kinds of buyer who come to a table. Each wants something different and pays differently.
enum BuyerType: CaseIterable {
    case collector, flipper, kid, gradeHunter

    var label: String {
        switch self {
        case .collector: "Collector"
        case .flipper: "Flipper"
        case .kid: "Kid with a parent"
        case .gradeHunter: "Grading hunter"
        }
    }

    var icon: String {
        switch self {
        case .collector: "person.fill"
        case .flipper: "arrow.left.arrow.right"
        case .kid: "figure.and.child.holdinghands"
        case .gradeHunter: "magnifyingglass"
        }
    }
}

struct Buyer: Identifiable {
    let id = UUID()
    let type: BuyerType
    let name: String
    let item: ShowItem
    /// The most this buyer will pay. The player never sees it.
    let top: Double
    var offer: Double
    var patience: Int
    var line: String
    /// Some collectors offer a card, plus cash, in place of cash only.
    var trade: (card: FloorListing, cash: Double)?
}

/// One day at a card show: the table, the buyers, and the floor.
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
    private(set) var buyer: Buyer?
    private(set) var vendors: [Vendor] = []
    private(set) var openVendorID: UUID?
    /// The mystery pack that is being opened, while its reveal shows.
    var reveal: MysteryReveal?
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
                     image: card.print.image, condition: card.grade == nil ? card.condition : nil, graded: card.grade != nil)
        }
        let sealed = stock.sealed.map { item in
            ShowItem(id: item.id, kind: .sealed, name: item.name, detail: "Sealed", market: store.market(of: item),
                     image: SetLibrary.product(item.productID)?.image, condition: nil, graded: false)
        }
        return (cards + sealed).sorted { $0.market > $1.market }
    }

    func openTable() {
        table = stockItems.filter { bring.contains($0.id) && $0.market >= 0.5 }
        // More value on the table draws more buyers, up to a point.
        var mean = show.size.buyersPerDay * (1 - minute / closeMinute)
        mean *= min(1.3, 0.7 + Double(table.count) / 30)
        let count = max(0, Int((mean + Double.random(in: -2...2)).rounded()))
        arrivals = (0..<count).map { _ in Double.random(in: minute..<closeMinute) }.sorted()
        opened = true
        phase = .table
        nextBuyer()
    }

    // MARK: Table

    /// Brings the next buyer. The clock jumps to their arrival. Buyers who waited more than half an hour left.
    func nextBuyer() {
        buyer = nil
        guard phase == .table else { return }
        while let first = arrivals.first, first < minute - 30 {
            arrivals.removeFirst()
            missed += 1
        }
        guard !table.isEmpty, let first = arrivals.first, first < closeMinute else {
            arrivals.removeAll()
            minute = closeMinute
            phase = .summary
            return
        }
        arrivals.removeFirst()
        minute = max(minute, first)
        buyer = makeBuyer()
        if buyer == nil { nextBuyer() }
    }

    private func makeBuyer() -> Buyer? {
        let type = BuyerType.allCases.randomElement() ?? .collector
        let wanted: [ShowItem] = switch type {
        case .kid: table.filter { $0.market <= 30 }
        case .gradeHunter: table.filter { $0.kind == .card && !$0.graded && $0.market >= 5 }
        default: table
        }
        // Buyers look at the better cards first.
        guard let item = pick(wanted.isEmpty ? table : wanted) else { return nil }
        var top: Double
        switch type {
        case .collector: top = item.market * Double.random(in: 0.92...1.08)
        case .flipper: top = item.market * Double.random(in: 0.68...0.82)
        case .kid: top = min(item.market * Double.random(in: 0.95...1.15), 30)
        case .gradeHunter: top = item.market * Double.random(in: 0.85...1.0)
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
        top = max(0.25, top)
        let ask = asking(item)
        let offer = Self.round(min(ask, top * Double.random(in: 0.72...0.9)))
        var buyer = Buyer(type: type, name: Self.names.randomElement() ?? "A buyer", item: item, top: min(top, ask * 1.0),
                          offer: max(0.25, offer), patience: type == .flipper ? 1 : 2,
                          line: line + (offer >= ask ? "I'll take it at your price." : "Would you take \(money(max(0.25, offer)))?"))
        if type == .collector, item.market >= 15, Double.random(in: 0..<1) < 0.25, let card = tradeCard(near: item.market) {
            let cash = max(0, Self.round(top - card.market))
            buyer.trade = (card, cash)
            buyer.line = line + "Want to trade? My \(card.print.name)\(cash > 0 ? " plus \(money(cash))" : "") for it."
        }
        return buyer
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

    func accept() {
        guard var b = buyer else { return }
        if let trade = b.trade {
            store.tradeAtShow(b.item, for: trade.card, cash: trade.cash, show: show)
            trades.append("\(b.item.name) → \(trade.card.print.name)\(trade.cash > 0 ? " + \(money(trade.cash))" : "")")
            b.trade = nil
        } else {
            store.sellAtShow(b.item, price: b.offer, show: show)
            sold.append((b.item.name, b.offer))
        }
        table.removeAll { $0.id == b.item.id }
        finishBuyer(minutes: .random(in: 6...12))
        Haptics.hit()
    }

    /// The player asks for more. The buyer takes it if it is at or under their top price. If not, they come up
    /// part of the way, or they walk away when their patience runs out.
    func counter(_ price: Double) {
        guard var b = buyer else { return }
        b.trade = nil
        if price <= b.top + 0.001 {
            b.offer = price
            b.line = "Deal."
            buyer = b
            accept()
            return
        }
        if b.patience <= 0 {
            b.line = "That's too much for me. Good luck!"
            buyer = b
            walkedAway += 1
            note = "\(b.name) walked away."
            finishBuyer(minutes: .random(in: 4...8))
            return
        }
        b.patience -= 1
        b.offer = Self.round(min(b.top, b.offer + (b.top - b.offer) * Double.random(in: 0.5...0.9)))
        b.line = "Hmm. I can go to \(money(b.offer)). That's about my limit."
        buyer = b
        minute += 3
    }

    func decline() {
        guard let b = buyer else { return }
        note = "\(b.name) moved on."
        finishBuyer(minutes: .random(in: 2...5))
    }

    private func finishBuyer(minutes: Double) {
        minute += minutes
        buyer = nil
        if isOver { phase = .summary } else { nextBuyer() }
    }

    func packUp() {
        buyer = nil
        missed += arrivals.count
        arrivals.removeAll()
        phase = .summary
    }

    // MARK: Floor

    /// Leaves the table for the floor. The clock only moves when the player looks at a table or buys.
    func walkFloor() {
        buyer = nil
        openVendorID = nil
        phase = isOver ? .summary : .floor
    }

    var openVendor: Vendor? { vendors.first { $0.id == openVendorID } }

    /// Looks over one table. The first look takes a quarter hour. Buyers who come to the player's table meanwhile
    /// leave after half an hour.
    func visit(_ vendor: Vendor) {
        guard let i = vendors.firstIndex(where: { $0.id == vendor.id }) else { return }
        if !vendors[i].visited {
            vendors[i].visited = true
            spend(Balance.vendorVisitMinutes)
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
            phase = .summary
        }
    }

    func backToTable() {
        guard hasTable else { return }
        openVendorID = nil
        guard opened else {
            phase = .setup
            return
        }
        phase = .table
        nextBuyer()
    }

    func buy(_ item: VendorItem, from vendor: Vendor) {
        guard let v = vendors.firstIndex(where: { $0.id == vendor.id }),
              let i = vendors[v].items.firstIndex(where: { $0.id == item.id }) else { return }
        guard store.canAfford(item.price) else {
            note = "You do not have enough cash."
            return
        }
        switch item.goods {
        case .single(let print, let slug, let condition):
            store.buyCardAtShow(OwnedCard(print: print, setSlug: slug, acquired: .now, paid: item.price, ripID: nil,
                                          condition: condition), price: item.price, vendor: vendor.name, show: show)
        case .slab(let print, let slug, let grade):
            store.buyCardAtShow(OwnedCard(print: print, setSlug: slug, acquired: .now, paid: item.price, ripID: nil, grade: grade),
                                price: item.price, vendor: vendor.name, show: show)
        case .sealed(let product):
            store.buySealedAtShow(product, price: item.price, vendor: vendor.name, show: show)
        case .mystery(let pack):
            let contents = VendorFloor.open(pack)
            store.buyMysteryAtShow(pack, hit: contents.hit, filler: contents.filler, fillerSlug: contents.fillerSlug,
                                   price: item.price, vendor: vendor.name, show: show)
            reveal = MysteryReveal(pack: pack, price: item.price, filler: contents.filler, hit: contents.hit)
        }
        bought.append((item.name, item.price))
        // Mystery packs do not run out. Everything else leaves the table.
        if case .mystery = item.goods {} else { vendors[v].items.remove(at: i) }
        spend(5)
        Haptics.tap(.medium)
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

    private func tradeCard(near value: Double) -> FloorListing? {
        for _ in 0..<20 {
            guard let (print, slug) = VendorFloor.randomPrint(from: Balance.showSets, minMarket: value * 0.5) else { return nil }
            let m = print.market ?? 0
            if m <= value * 0.95 { return FloorListing(print: print, setSlug: slug, condition: .secondHand(), price: m) }
        }
        return nil
    }

    private static let names = ["Marcus", "Jen", "Tyler", "Priya", "Dev", "Sam", "Alyssa", "Chris", "Nate", "Olivia",
                                "Jordan", "Kai", "Mia", "Ben", "Rosa", "Luis", "Hannah", "Theo"]
}

/// A mystery pack that the player just bought: the filler first, then the hit.
struct MysteryReveal: Identifiable {
    let id = UUID()
    let pack: MysteryPack
    let price: Double
    let filler: [CardPrint]
    let hit: OwnedCard
}
