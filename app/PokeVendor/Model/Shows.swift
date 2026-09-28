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
    enum Kind { case work, paycheck, rent, show, delivery, grading, auction, meet, league, sale, restock, stream, timeOff, meetup }

    let id = UUID()
    let kind: Kind
    let title: String
    var detail: String = ""
    var showID: UUID?
    /// A garage or estate sale, or another event with its own screen.
    var eventID: UUID?

    var icon: String {
        switch kind {
        case .work: "briefcase"
        case .paycheck: "dollarsign.circle"
        case .rent: "house"
        case .show: "tablecells"
        case .delivery: "shippingbox"
        case .grading: "seal"
        case .auction: "hammer"
        case .meet: "person.2"
        case .league: "gamecontroller"
        case .sale: "house.and.flag"
        case .restock: "cart.badge.clock"
        case .stream: "dot.radiowaves.left.and.right"
        case .timeOff: "sun.max"
        case .meetup: "figure.wave"
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
        data.vendorKit && !show.booked && data.day <= show.lastBookingDay && canAfford(show.size.tableFee)
    }

    func buyVendorKit() {
        guard !data.vendorKit, canAfford(Balance.vendorKitCost) else { return }
        addLedger(-Balance.vendorKitCost, .upgrade, "Vendor kit")
        data.vendorKit = true
        log("Bought a vendor kit. You can book a table at card shows now.", cash: -Balance.vendorKitCost)
        save()
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

    /// `venue` is the name of the place: a show, a meet, or a sale.
    func sellAtShow(_ item: ShowItem, price: Double, at venue: String) {
        switch item.kind {
        case .card:
            data.raw.removeAll { $0.id == item.id }
            data.slabs.removeAll { $0.id == item.id }
        case .sealed:
            data.sealed.removeAll { $0.id == item.id }
        }
        addLedger(price, .sale, "\(item.name) · \(venue)")
        log("Sold \(item.name) at \(venue) for \(money(price)).", cash: price)
        save()
    }

    func buyCardAtShow(_ card: OwnedCard, price: Double, vendor: String, at venue: String) {
        var card = card
        card.acquiredDay = data.day
        addLedger(-price, .singles, "\(card.print.name)\(card.grade.map { " " + $0.label } ?? "") · \(vendor)")
        if card.grade == nil { data.raw.append(card) } else { data.slabs.append(card) }
        log("Bought \(card.print.name)\(card.grade.map { " (\($0.label))" } ?? "") from \(vendor) at \(venue) for \(money(price)).",
            cash: -price)
        save()
    }

    @discardableResult
    func buySealedAtShow(_ product: Product, price: Double, vendor: String, at venue: String, fake: FakeTier? = nil,
                         known: Bool? = nil) -> SealedItem {
        addLedger(-price, .sealed, "\(product.name) · \(vendor)")
        var item = SealedItem(setSlug: product.homeSlug, name: product.name, packs: product.packs, paid: price,
                              acquired: .now, source: "\(vendor), \(venue)", productID: product.id, acquiredDay: data.day)
        item.fake = fake
        item.fakeKnown = known
        data.sealed.append(item)
        log("Bought \(product.name) from \(vendor) at \(venue) for \(money(price)).", cash: -price)
        save()
        return item
    }

    /// A mystery pack: the hit goes to Raw or Slabs with the price as its cost, and the filler goes to bulk.
    func buyMysteryAtShow(_ pack: MysteryPack, hit: OwnedCard, filler: [CardPrint], fillerSlug: String, price: Double,
                          vendor: String, at venue: String) {
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
    func tradeAtShow(_ item: ShowItem, for cards: [FloorListing], cash: Double, at venue: String) {
        switch item.kind {
        case .card:
            data.raw.removeAll { $0.id == item.id }
            data.slabs.removeAll { $0.id == item.id }
        case .sealed:
            data.sealed.removeAll { $0.id == item.id }
        }
        // Each card that came in carries its value as its cost, so the portfolio header stays honest.
        for card in cards {
            var owned = OwnedCard(print: card.print, setSlug: card.setSlug, acquired: .now, paid: card.market, ripID: nil,
                                  condition: card.condition, acquiredDay: data.day)
            owned.fake = card.fake
            if card.looksOff, card.fake != nil { owned.fakeKnown = true }
            data.raw.append(owned)
        }
        if cash > 0 { addLedger(cash, .sale, "\(item.name) · trade at \(venue)") }
        if cash < 0 { addLedger(cash, .singles, "Cash added in a trade at \(venue)") }
        let extra = cash > 0 ? " plus \(money(cash))" : cash < 0 ? ", adding \(money(-cash)) of your own" : ""
        log("Traded \(item.name) for \(cards.map(\.print.name).joined(separator: " and "))\(extra) at \(venue).",
            cash: cash != 0 ? cash : nil)
        save()
    }

    /// The end of any encounter. A show fills the day. A meet ends when the doors close. A sale or an opportunity
    /// takes its hours from the moment the player arrived.
    func finishEncounter(_ session: ShowSession) {
        let venue = session.venue
        let count = session.sold.count + session.bought.count + session.trades.count
        let deals = "\(count) deal\(count == 1 ? "" : "s"), \(money(session.soldTotal)) in sales, \(money(session.boughtTotal)) spent"
        switch venue.kind {
        case .show:
            if let show = session.show {
                finishShowDay(show, sold: session.soldTotal, bought: session.boughtTotal, count: count)
            }
            return
        case .meet:
            data.hour = max(data.hour, venue.close)
            recordMeet(venue)
            log("Went to \(venue.name): \(deals).")
        case .leagueNight:
            data.hour = max(data.hour, venue.close)
            recordMeet(venue)
            if let shop = venue.shop {
                addPoints(shopContactID(shop), Balance.leagueStandingPoints)
                var state = self.shop(shop)
                state.lastVisitDay = data.day
                data.shops[shop.rawValue] = state
            }
            log("League night at \(venue.name): \(deals). Standing +\(Balance.leagueStandingPoints).")
        case .garageSale, .estateSale:
            // Travel is inside the hours, so the visit always takes them all.
            data.hour = min(Balance.dayEnd, max(data.hour, venue.open + session.startMinute / 60 + venue.hours))
            if let id = venue.eventID { recordSaleVisit(id) }
            log("\(venue.name): \(deals).")
        case .opportunity:
            data.hour = min(Balance.dayEnd, max(data.hour, venue.open + session.startMinute / 60 + venue.hours))
            log("\(venue.name): \(deals).")
        }
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
        for kind in MeetKind.allCases where kind.weekday == weekday {
            let place = kind == .leagueNight ? leagueShop(day: day).rawValue : kind.place
            let lock = meetUnlocked(kind) ? "" : " · invite only"
            out.append(CalendarEntry(kind: kind == .leagueNight ? .league : .meet, title: kind.label,
                                     detail: "\(kind.hoursText) · \(place)\(lock)"))
        }
        out += eventEntries(day: day)
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
        let authenticating = (data.raw + data.slabs).filter {
            if case .atAuthenticator(let d, _) = $0.status { return d == offset }
            return false
        }
        if !authenticating.isEmpty {
            out.append(CalendarEntry(kind: .grading, title: "Authentication comes back",
                                     detail: "\(authenticating.count) card\(authenticating.count == 1 ? "" : "s")"))
        }
        let arriving2 = (data.raw + data.slabs).filter {
            if case .arriving(let d, _) = $0.status { return d == offset }
            return false
        }.count + data.sealed.filter {
            if case .arriving(let d, _) = $0.status { return d == offset }
            return false
        }.count
        if arriving2 > 0 {
            out.append(CalendarEntry(kind: .delivery, title: "Arriving", detail: "\(arriving2) item\(arriving2 == 1 ? "" : "s")"))
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
    /// Hidden: the item is a fake. A buyer who catches it walks (docs/14-counterfeit-risk.md).
    var fake: FakeTier?
    var fakeKnown = false

    var isVintage: Bool { Balance.vintageSets.contains(setSlug) || Balance.olderSets.contains(setSlug) }
}

/// A card that a visitor offers in a trade.
struct FloorListing: Identifiable, Hashable {
    let id = UUID()
    let print: CardPrint
    let setSlug: String
    let condition: Condition
    let price: Double
    /// Hidden: the card is a fake (docs/14-counterfeit-risk.md).
    var fake: FakeTier?
    /// The eyeball check caught something.
    var looksOff = false

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
    /// Hidden: what they sell is a fake. `goodsLooksOff` is the player's look by eye.
    var goodsFake: FakeTier?
    var goodsLooksOff = false
    /// A contact that the game remembers. Nil for a stranger.
    var contactID: String?
    /// A seller who does not know what they have: they ask far under market.
    var naive = false

    var tradeValue: Double { tradeCards.reduce(0) { $0 + $1.market } + tradeCash }
}

/// Where an encounter happens: a card show, a meet, league night, a garage or estate sale, or a surprise
/// opportunity. The venue sets the hours, how many people come, and what the player can do there.
struct Venue: Hashable {
    enum Kind: Hashable { case show, meet, leagueNight, garageSale, estateSale, opportunity }

    let kind: Kind
    let name: String
    /// A second line under the name, for example "Local show · your table".
    var detail: String = ""
    /// The clock hours when the doors open and close.
    let open: Double
    let close: Double
    /// The most hours the visit can take from the moment the player arrives.
    let hours: Double
    /// The mean number of people who come to the player's table in a full day.
    let visitorsMean: Double
    /// The share of visitors who want to sell to the player, at reputation tier 0.
    var sellerShare = 0.22
    /// The chance that a visitor is a regular who the game remembers.
    var regularShare = 0.35
    let hasFloor: Bool
    let hasTable: Bool
    /// The chance that someone stops the player on the way to a table.
    var approachChance = 0.25
    /// True when the person who stops the player is the host of a sale: someone clearing out, often naive.
    var hostSells = false
    /// Where a fake could come from at this venue (docs/14-counterfeit-risk.md).
    var fakeSource = FakeSource.none
    var showID: UUID?
    /// The game shop that runs league night.
    var shop: LocalStore?
    /// A sale or an opportunity that the venue belongs to.
    var eventID: UUID?

    var isShow: Bool { kind == .show }
}

/// One day at a card show, or one visit to another venue: the table, the visitors, and the floor.
@MainActor @Observable
final class ShowSession {
    enum Phase { case setup, table, floor, summary }

    let venue: Venue
    /// The card show, when the venue is one.
    let show: CardShow?
    let dayIndex: Int
    var hasTable: Bool { venue.hasTable }
    private let store: GameStore

    var phase: Phase
    /// Minutes since the doors opened.
    private(set) var minute: Double
    /// The minute when the player arrived.
    let startMinute: Double
    let closeMinute: Double
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

    convenience init(show: CardShow, store: GameStore) {
        let venue = Venue(kind: .show, name: show.name,
                          detail: "\(show.size.label)\(show.size.days > 1 ? " · day \(store.day - show.startDay + 1) of 2" : "") · \(show.booked ? "your table" : "walk-in")",
                          open: Balance.showOpen, close: Balance.showClose, hours: Balance.showClose - Balance.showOpen,
                          visitorsMean: show.size.buyersPerDay, hasFloor: true, hasTable: show.booked, showID: show.id)
        store.seedContacts()
        self.init(venue: venue, store: store, show: show,
                  vendors: VendorFloor.tables(for: show.size, recurring: store.attendingVendors(show)),
                  regulars: store.attendingRegulars(show).map(\.id).shuffled())
    }

    /// Any venue. `vendors` are the tables on the floor, and `regulars` are the contacts who can come by.
    init(venue: Venue, store: GameStore, show: CardShow? = nil, vendors: [Vendor], regulars: [String]) {
        self.venue = venue
        self.show = show
        self.store = store
        dayIndex = show.map { store.day - $0.startDay } ?? 0
        phase = venue.hasTable ? .setup : .floor
        // A player who arrives late loses the hours before they came.
        let start = max(0, (store.data.hour - venue.open) * 60)
        minute = start
        startMinute = start
        closeMinute = min((venue.close - venue.open) * 60, start + venue.hours * 60)
        let stock = store.showStock
        bring = Set(stock.cards.map(\.id) + stock.sealed.map(\.id))
        self.vendors = vendors
        self.regulars = regulars
        for i in self.vendors.indices {
            // A recurring vendor prices better for a player they know.
            let bonus = store.level(self.vendors[i].contactID).priceBonus
            // Some of what is for sale is fake. A contact the player knows carries less risk.
            let source = store.fakeSource(contact: self.vendors[i].contactID, fallback: venue.fakeSource)
            for j in self.vendors[i].items.indices {
                if bonus > 0 { self.vendors[i].items[j].price = Self.round(self.vendors[i].items[j].price * (1 - bonus)) }
                self.vendors[i].items[j].rollFake(source: source, tired: store.tiredFactor)
            }
        }
    }

    /// The regulars at this venue who have not come by yet.
    private var regulars: [String] = []

    var clock: String { GameStore.clock(venue.open + minute / 60) }
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
        // The table shows the real price: buyers do not know a fake until they look.
        let cards = stock.cards.map { card in
            ShowItem(id: card.id, kind: .card, name: card.print.name,
                     detail: card.grade?.label ?? "\(card.print.rarity) · \(card.print.num)", market: card.realMarket,
                     image: card.print.image, condition: card.grade == nil ? card.condition : nil, graded: card.grade != nil,
                     setSlug: card.setSlug, fake: card.fake, fakeKnown: card.isKnownFake)
        }
        let sealed = stock.sealed.map { item in
            ShowItem(id: item.id, kind: .sealed, name: item.name, detail: "Sealed", market: store.realMarket(of: item),
                     image: SetLibrary.product(item.productID)?.image, condition: nil, graded: false, setSlug: item.setSlug,
                     fake: item.fake, fakeKnown: item.isKnownFake)
        }
        return (cards + sealed).sorted { $0.market > $1.market }
    }

    func openTable() {
        table = stockItems.filter { bring.contains($0.id) && $0.market >= 0.5 }
        // More value on the table draws more people, up to a point.
        var mean = venue.visitorsMean * (1 - minute / closeMinute)
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

    /// Most people want to buy. Some want to trade, and some want to sell to the player. More sellers come at a
    /// higher reputation, because word gets around that the player pays fair. Some visitors are regulars.
    private func makeVisitor() -> Visitor? {
        let roll = Double.random(in: 0..<1)
        let sellers = venue.sellerShare + 0.03 * Double(store.reputationTier)
        var v: Visitor?
        if table.isEmpty || roll < sellers { v = makeSeller() }
        else if roll < sellers + 0.18, let trader = makeTrader() { v = trader }
        else { v = makeBuyer() }
        guard var visitor = v else { return nil }
        if Double.random(in: 0..<1) < venue.regularShare, let id = regulars.popLast() {
            personalize(&visitor, id)
        } else {
            strangerReputation(&visitor)
        }
        rollGoodsFake(&visitor)
        return visitor
    }

    /// What a seller brings can be a fake. A contact carries less risk than a stranger.
    private func rollGoodsFake(_ v: inout Visitor) {
        guard v.intent == .sell, let goods = v.goods, v.goodsFake == nil else { return }
        let source = store.fakeSource(contact: v.contactID, fallback: venue.fakeSource == .none ? .stranger : venue.fakeSource)
        let (slug, sealed): (String?, Bool) = switch goods {
        case .single(_, let s, _), .slab(_, let s, _): (s, false)
        case .sealed(let p): (p.homeSlug, true)
        case .mystery: (nil, false)
        }
        v.goodsFake = Counterfeit.roll(source: source, sealed: sealed, slug: slug, market: v.goodsMarket)
        if let fake = v.goodsFake { v.goodsLooksOff = Counterfeit.eyeballCatches(fake, tired: store.tiredFactor) }
    }

    /// A regular: their own name, more patience, and better prices for a player they know. A regular at Trusted or
    /// higher sometimes brings a want list card to sell.
    private func personalize(_ v: inout Visitor, _ id: String) {
        guard let c = store.contact(id) else { return }
        let lvl = store.level(id)
        v = Visitor(type: v.type, name: c.name, intent: v.intent, item: v.item, limit: v.limit, offer: v.offer,
                    patience: v.patience + lvl.patienceBonus, line: v.line, tradeCards: v.tradeCards, tradeCash: v.tradeCash,
                    goods: v.goods, goodsMarket: v.goodsMarket, contactID: id, naive: false)
        switch v.intent {
        case .buy, .trade: v.limit *= 1 + lvl.priceBonus
        case .sell:
            v.limit *= 1 - lvl.priceBonus
            v.offer = Self.round(max(v.limit, v.offer * (1 - lvl.priceBonus)))
        }
        if lvl.rank >= StandingLevel.trusted.rank, Double.random(in: 0..<1) < 0.4, let (goods, market) = store.findForPlayer(c),
           store.isWanted(goods) {
            let price = Self.round(market * (1 - lvl.priceBonus))
            v = Visitor(type: .collector, name: c.name, intent: .sell, item: nil, limit: price * 0.95, offer: price,
                        patience: 2, line: "I found the \(VendorItem(goods: goods, price: price, market: market).name) you were after. It's yours for \(money(price)).",
                        goods: goods, goodsMarket: market, contactID: id)
        }
    }

    /// A stranger reads the player's reputation: they pay a little more and ask a little less at a higher tier.
    private func strangerReputation(_ v: inout Visitor) {
        let bonus = 0.02 * Double(store.reputationTier)
        guard bonus > 0 else { return }
        switch v.intent {
        case .buy, .trade: v.limit *= 1 + bonus
        case .sell: v.limit *= 1 - bonus
        }
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
    private func makeSeller(type forced: VisitorType? = nil) -> Visitor? {
        let type = forced ?? [VisitorType.closetCleaner, .closetCleaner, .collector, .dealer].randomElement() ?? .closetCleaner
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
        v.naive = type == .closetCleaner && ask <= market * 0.65
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

    /// A buyer or a trader looks the item over. If it is a fake and they see it, they walk, and word gets around
    /// (docs/14-counterfeit-risk.md, Consequences). Returns true when they caught it.
    private func buyerCatchesFake(_ v: Visitor, _ item: ShowItem) -> Bool {
        guard let fake = item.fake, Counterfeit.eyeballCatches(fake) else { return false }
        var caught = v
        caught.line = "Hold on. This isn't real. I'm not buying a fake."
        caught.patience = 0
        setCurrent(caught)
        store.addReputation(-Balance.fakeCaughtReputationCost)
        store.addPoints(v.contactID, -Balance.fakeCaughtContactCost)
        store.markFakeKnown(cardID: item.id)
        store.markFakeKnown(sealedID: item.id)
        table.removeAll { $0.id == item.id }
        walkedAway += 1
        note = "\(v.name) called your \(item.name) a fake and walked."
        finish(minutes: .random(in: 4...8))
        return true
    }

    func accept() {
        guard let v = current else { return }
        switch v.intent {
        case .buy:
            guard let item = v.item else { return }
            if buyerCatchesFake(v, item) { return }
            store.sellAtShow(item, price: v.offer, at: venue.name)
            sold.append((item.name, v.offer))
            table.removeAll { $0.id == item.id }
            store.recordDeal(v.contactID, what: "Sold them \(item.name)", price: v.offer, market: item.market, slug: item.setSlug)
            if let fake = item.fake {
                store.recordBadSale(item: item.name, channel: venue.name, price: v.offer, fake: fake, known: item.fakeKnown,
                                    refunds: false, contactID: v.contactID)
            }
        case .trade:
            guard let item = v.item else { return }
            if v.tradeCash < 0, !store.canAfford(-v.tradeCash) {
                note = "You do not have \(money(-v.tradeCash))."
                return
            }
            if buyerCatchesFake(v, item) { return }
            store.tradeAtShow(item, for: v.tradeCards, cash: v.tradeCash, at: venue.name)
            if let fake = item.fake {
                store.recordBadSale(item: item.name, channel: venue.name, price: item.market, fake: fake, known: item.fakeKnown,
                                    refunds: false, contactID: v.contactID)
            }
            let extra = v.tradeCash > 0 ? " + \(money(v.tradeCash))" : v.tradeCash < 0 ? ", you added \(money(-v.tradeCash))" : ""
            trades.append("\(item.name) → \(v.tradeCards.map(\.print.name).joined(separator: " + "))\(extra)")
            table.removeAll { $0.id == item.id }
            store.recordDeal(v.contactID, what: "Traded \(item.name)", price: tradeCardsValue(v) + v.tradeCash, market: item.market,
                             slug: item.setSlug)
        case .sell:
            guard let goods = v.goods else { return }
            guard store.canAfford(v.offer) else {
                note = "You do not have enough cash."
                return
            }
            buyGoods(goods, price: v.offer, from: v.name, fake: v.goodsFake, looksOff: v.goodsLooksOff)
            store.recordDeal(v.contactID, what: "Bought \(VendorItem(goods: goods, price: v.offer, market: nil).name)", price: v.offer,
                             market: v.goodsMarket, slug: goodsSlug(goods))
        }
        maybePromote(v, points: 12)
        finish(minutes: .random(in: 6...12))
        Haptics.hit()
    }

    /// A stranger who had a good deal with the player sometimes gives their number.
    private func maybePromote(_ v: Visitor, points: Int, chance: Double = 0.25) {
        guard v.contactID == nil, Double.random(in: 0..<1) < chance else { return }
        let kind: ContactKind = switch v.intent {
        case .buy: .buyer
        case .trade: .trader
        case .sell: .collector
        }
        let interest: Interest? = v.item.map { .set($0.setSlug) } ?? v.goods.flatMap(goodsSlug).map { .set($0) }
        if store.promote(name: v.name, kind: kind, interest: interest, points: points) != nil {
            note = "\(v.name) gave you their number."
        }
    }

    private func goodsSlug(_ goods: VendorGoods) -> String? {
        switch goods {
        case .single(_, let s, _), .slab(_, let s, _): s
        case .sealed(let p): p.homeSlug
        case .mystery: nil
        }
    }

    // MARK: Fair dealing

    /// The fair price for a naive seller's item: 90% of market.
    func fairPrice(_ v: Visitor) -> Double { Self.round(v.goodsMarket * 0.9) }

    /// Tells a naive seller what the item is worth and pays fair. It costs money now. The seller is grateful, gives
    /// their number, and word gets around.
    func payFair() {
        guard var v = current, v.intent == .sell, let goods = v.goods else { return }
        let price = fairPrice(v)
        guard store.canAfford(price) else {
            note = "You do not have \(money(price))."
            return
        }
        buyGoods(goods, price: price, from: v.name, fake: v.goodsFake, looksOff: v.goodsLooksOff)
        store.addReputation(5)
        if let id = v.contactID {
            store.addPoints(id, 4)
        } else {
            v.contactID = store.promote(name: v.name, kind: .collector, interest: goodsSlug(goods).map { .set($0) }, points: 20)
        }
        store.recordDeal(v.contactID, what: "Paid fair for \(VendorItem(goods: goods, price: price, market: nil).name)", price: price,
                         market: v.goodsMarket, slug: goodsSlug(goods))
        note = "\(v.name) couldn't believe it. Word will get around."
        finish(minutes: .random(in: 6...10))
        Haptics.hit()
    }

    /// Tells a naive seller that the item is not worth much, and buys it for half of what they asked. It works now.
    /// About 1 time in 3 the seller finds out later, and the player's reputation takes the hit.
    func lieAboutValue() {
        guard let v = current, v.intent == .sell, let goods = v.goods else { return }
        let price = max(1, Self.round(v.offer * 0.5))
        guard store.canAfford(price) else { return }
        buyGoods(goods, price: price, from: v.name, fake: v.goodsFake, looksOff: v.goodsLooksOff)
        let name = VendorItem(goods: goods, price: price, market: nil).name
        store.recordScam(seller: v.name, contactID: v.contactID, item: name)
        note = "\(v.name) took \(money(price)) and thanked you."
        finish(minutes: .random(in: 4...8))
    }

    /// A counter. To a buyer: the player asks for more. To a seller: the player offers less. Past the hidden limit,
    /// the other side moves part of the way, or walks away when their patience runs out.
    func counter(_ price: Double) {
        guard var v = current else { return }
        // An offer under 60% of market to a seller is a lowball. A contact remembers it.
        if v.intent == .sell, v.goodsMarket > 0, price < v.goodsMarket * 0.6, !v.naive { store.lowballed(v.contactID) }
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
            store.walkedAway(v.contactID)
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

    /// Market value of the cards a trader offers.
    func tradeCardsValue(_ v: Visitor) -> Double { v.tradeCards.reduce(0) { $0 + $1.market } }

    /// The cash that evens a trade when the player values the trader's cards at this share of market.
    /// Positive: the trader adds cash. Negative: the player adds cash.
    func tradeCash(_ v: Visitor, valuing percent: Double) -> Double {
        guard let item = v.item else { return 0 }
        return Self.round(item.market - tradeCardsValue(v) * percent / 100)
    }

    /// The player sets a value on the trader's cards, and the cash follows. The trader takes it when the real
    /// value they give stays within their limit. If not, they add part of the cash, or walk away.
    func proposeTrade(valuing percent: Double) {
        guard var v = current, v.intent == .trade, let item = v.item else { return }
        let cash = tradeCash(v, valuing: percent)
        let cards = tradeCardsValue(v)
        if cards + cash <= v.limit + 0.001 {
            if cash < 0, !store.canAfford(-cash) {
                note = "You do not have \(money(-cash))."
                return
            }
            v.tradeCash = cash
            v.line = "Deal."
            setCurrent(v)
            accept()
            return
        }
        if v.patience <= 0 {
            v.line = "No, my cards are worth more than that. I'll keep them."
            setCurrent(v)
            walkedAway += 1
            note = "\(v.name) walked away."
            finish(minutes: .random(in: 4...8))
            return
        }
        v.patience -= 1
        let most = Self.round(v.limit - cards)
        v.tradeCash = Self.round(max(v.tradeCash, v.tradeCash + (most - v.tradeCash) * Double.random(in: 0.5...0.9)))
        v.line = v.tradeCash > 0 ? "I can add \(money(v.tradeCash)) on top, for your \(item.name). That's my best."
                                 : "My cards straight across for your \(item.name). That's my best."
        setCurrent(v)
        spend(3)
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
            if !isOver, approach == nil, Double.random(in: 0..<1) < venue.approachChance {
                approach = makeSeller(type: venue.hostSells ? .closetCleaner : nil)
            }
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
        buyGoods(item.goods, price: item.price, from: vendor.name, fake: item.fake, looksOff: item.looksOff)
        store.recordDeal(vendor.contactID, what: "Bought \(item.name)", price: item.price, market: item.market ?? item.price,
                         slug: goodsSlug(item.goods))
        // Mystery packs do not run out. Everything else leaves the table.
        if case .mystery = item.goods {} else { vendors[v].items.remove(at: i) }
        spend(5)
        Haptics.tap(.medium)
    }

    /// `fake` is the item's hidden truth, and `looksOff` means the player saw it, so they know what they bought.
    private func buyGoods(_ goods: VendorGoods, price: Double, from seller: String, fake: FakeTier? = nil, looksOff: Bool = false) {
        let name = VendorItem(goods: goods, price: price, market: nil).name
        let known: Bool? = looksOff && fake != nil ? true : nil
        switch goods {
        case .single(let print, let slug, let condition):
            var card = OwnedCard(print: print, setSlug: slug, acquired: .now, paid: price, ripID: nil, condition: condition)
            card.fake = fake
            card.fakeKnown = known
            store.buyCardAtShow(card, price: price, vendor: seller, at: venue.name)
        case .slab(let print, let slug, let grade):
            var card = OwnedCard(print: print, setSlug: slug, acquired: .now, paid: price, ripID: nil, grade: grade)
            card.fake = fake
            card.fakeKnown = known
            store.buyCardAtShow(card, price: price, vendor: seller, at: venue.name)
        case .sealed(let product):
            justBought = store.buySealedAtShow(product, price: price, vendor: seller, at: venue.name, fake: fake, known: known)
        case .mystery(let pack):
            let contents = VendorFloor.open(pack)
            store.buyMysteryAtShow(pack, hit: contents.hit, filler: contents.filler, fillerSlug: contents.fillerSlug,
                                   price: price, vendor: seller, at: venue.name)
            reveal = MysteryReveal(pack: pack, price: price, filler: contents.filler, hit: contents.hit)
        }
        bought.append((name, price))
    }

    /// Items that a recurring vendor saved for the player at this show.
    func saved(at vendor: Vendor) -> [SavedItem] {
        guard let id = vendor.contactID, let show else { return [] }
        return store.savedAtShow(show.id, vendor: id)
    }

    func pickUp(_ item: SavedItem) {
        guard store.pickUp(item) else {
            note = "You do not have enough cash."
            return
        }
        bought.append((item.name, item.price))
        spend(5)
        Haptics.hit()
    }

    /// Asks the vendor for 10% off. How often it works depends on the vendor. Each item can be asked about once.
    func askForDeal(_ item: VendorItem, from vendor: Vendor) {
        guard let v = vendors.firstIndex(where: { $0.id == vendor.id }),
              let i = vendors[v].items.firstIndex(where: { $0.id == item.id }), !vendors[v].items[i].askedForDeal else { return }
        // A vendor who knows the player says yes more often.
        let yes = Double.random(in: 0..<1) < vendor.kind.dealChance + 0.1 * Double(store.level(vendor.contactID).rank)
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
            var card = FloorListing(print: print, setSlug: slug, condition: condition, price: 0)
            // A trader's card can be a fake too.
            card.fake = Counterfeit.roll(source: venue.fakeSource == .none ? .stranger : venue.fakeSource, sealed: false, slug: slug,
                                         market: card.market)
            if let fake = card.fake { card.looksOff = Counterfeit.eyeballCatches(fake, tired: store.tiredFactor) }
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
        case "naive":
            for _ in 0..<60 {
                if let v = makeSeller(), v.naive {
                    visitor = v
                    break
                }
            }
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
