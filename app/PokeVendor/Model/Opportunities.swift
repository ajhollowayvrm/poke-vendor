import Foundation

// Surprise opportunities: the alert banner on the hub (docs/17-calendar-and-events.md, Surprise entries;
// docs/08-ui-direction.md, tap target 5).

enum OpportunityKind: String, Codable, CaseIterable, Hashable {
    /// A collector sells a binder or a box today.
    case collectionForSale
    /// A vendor the player knows is closing out stock at 60%.
    case vendorLiquidating
    /// A table opened up at tomorrow's show. It is free.
    case lastMinuteTable
    /// A private buyer wants one of the player's cards and pays over market.
    case privateBuyer
    /// A tip about an estate sale that starts tomorrow.
    case estateTipOff
    /// Someone's whole vintage collection, for Elite reputation only.
    case vintageCollection

    var label: String {
        switch self {
        case .collectionForSale: "A collection for sale"
        case .vendorLiquidating: "A vendor is closing out"
        case .lastMinuteTable: "A last-minute table"
        case .privateBuyer: "A private buyer"
        case .estateTipOff: "An estate sale tip"
        case .vintageCollection: "A whole vintage collection"
        }
    }

    var icon: String {
        switch self {
        case .collectionForSale: "archivebox"
        case .vendorLiquidating: "tag"
        case .lastMinuteTable: "tablecells"
        case .privateBuyer: "person.crop.circle.badge.checkmark"
        case .estateTipOff: "house.and.flag"
        case .vintageCollection: "crown"
        }
    }

    var minReputationTier: Int { self == .vintageCollection ? 4 : 0 }
}

struct Opportunity: Codable, Identifiable, Hashable {
    var id = UUID()
    let kind: OpportunityKind
    let postedDay: Int
    /// The day it happens. It is gone after this day.
    let day: Int
    let title: String
    let detail: String
    let hours: Double
    /// For a private buyer: what they pay. For a collection: the market value of the lot.
    var price: Double = 0
    var contactID: String?
    var cardID: UUID?
    var showID: UUID?
    var answered = false
}

/// What happened when the player said yes.
enum OpportunityOutcome {
    case encounter(ShowSession)
    case done(String)
    case failed(String)
}

extension Balance {
    /// About 1.5 opportunities every 4 weeks.
    static let opportunityRate = 1.5 / 28
    static let collectionPriceShare = 0.7
    static let collectionQuality = 1.3
    static let liquidationShare = 0.6
    static let privateBuyerShare = 1.2...1.5
    static let privateBuyerMinCard = 40.0
    static let vintageCollectionShare = 0.7
    static let vintageCollectionItems = 15...25
}

@MainActor
extension GameStore {
    /// Opportunities the player can still answer.
    var activeOpportunities: [Opportunity] {
        data.opportunities.filter { !$0.answered && $0.day >= data.day && $0.postedDay <= data.day }
    }

    func opportunity(_ id: UUID) -> Opportunity? { data.opportunities.first { $0.id == id } }

    /// Rolls for a new opportunity at End Day. Notice is 0 or 1 day.
    func opportunitiesEndDay() -> [String] {
        let today = data.day
        data.opportunities.removeAll { $0.day < today - 7 }
        var lines: [String] = []
        for o in data.opportunities where !o.answered && o.day == data.day && o.postedDay < data.day {
            lines.append("Today: \(o.title). Answer it from the hub.")
        }
        guard Double.random(in: 0..<1) < Balance.opportunityRate, let o = makeOpportunity(notice: Int.random(in: 0...1)) else { return lines }
        data.opportunities.append(o)
        lines.append(o.day == data.day ? "\(o.title) came up today. Answer it from the hub." : "\(o.title) came up for tomorrow. Answer it from the hub.")
        return lines
    }

    /// One random opportunity that fits the player now.
    func makeOpportunity(notice: Int, kind forced: OpportunityKind? = nil) -> Opportunity? {
        var kinds = OpportunityKind.allCases.filter { reputationTier >= $0.minReputationTier }
        let tomorrowShow = data.shows.first { $0.startDay == data.day + 1 && !$0.booked }
        if tomorrowShow == nil || !data.vendorKit { kinds.removeAll { $0 == .lastMinuteTable } }
        let bigCard = (data.raw + data.slabs).filter { $0.status == nil && !$0.keep && $0.market >= Balance.privateBuyerMinCard }.randomElement()
        if bigCard == nil { kinds.removeAll { $0 == .privateBuyer } }
        let vendorContact = data.contacts.filter { $0.kind.isVendor && level($0.id).rank >= StandingLevel.trusted.rank }.randomElement()
        if vendorContact == nil { kinds.removeAll { $0 == .vendorLiquidating } }
        guard let kind = forced ?? kinds.randomElement() else { return nil }
        let day = data.day + notice
        let names = ["Marcus", "Jen", "Tyler", "Priya", "Dev", "Sam", "Alyssa", "Chris", "Nate", "Olivia"]
        let who = names.randomElement() ?? "Someone"
        switch kind {
        case .collectionForSale:
            return Opportunity(kind: kind, postedDay: data.day, day: day, title: "\(who) is selling a binder",
                               detail: "A collector is clearing out a binder and a box. Most of it is older. Prices are about 70% of market, and they will deal. It takes about 2 hours.",
                               hours: 2)
        case .vendorLiquidating:
            guard let c = vendorContact else { return nil }
            return Opportunity(kind: kind, postedDay: data.day, day: day, title: "\(c.name) is closing out stock",
                               detail: "\(c.name) is moving on and sells the table stock at 60% of market, for you only. It takes about 2 hours.",
                               hours: 2, contactID: c.id)
        case .lastMinuteTable:
            guard let show = tomorrowShow else { return nil }
            return Opportunity(kind: kind, postedDay: data.day, day: day, title: "A table opened at \(show.name)",
                               detail: "A vendor dropped out of tomorrow's show. The table is yours, free, if you take it now.",
                               hours: 0, showID: show.id)
        case .privateBuyer:
            guard let card = bigCard else { return nil }
            let price = ShowSession.round(card.market * Double.random(in: Balance.privateBuyerShare))
            return Opportunity(kind: kind, postedDay: data.day, day: day, title: "\(who) wants your \(card.print.name)",
                               detail: "A private buyer offers \(money(price)) for your \(card.print.name)\(card.grade.map { " (\($0.label))" } ?? ""). Market is \(money(card.market)). The meetup takes 1 hour.",
                               hours: 1, price: price, cardID: card.id)
        case .estateTipOff:
            return Opportunity(kind: kind, postedDay: data.day, day: day, title: "A tip about an estate sale",
                               detail: "\(who) heard about an estate sale with a big card collection. It starts tomorrow and is not posted anywhere. Say yes and it goes on your calendar.",
                               hours: 0)
        case .vintageCollection:
            return Opportunity(kind: kind, postedDay: data.day, day: day, title: "A whole vintage collection",
                               detail: "Word of your reputation got around. A family wants one trusted buyer for a whole vintage collection, at about 70% of market. It takes about 2 hours.",
                               hours: 2)
        }
    }

    /// Why the player cannot accept now, or nil.
    func opportunityBlock(_ o: Opportunity) -> String? {
        if o.answered { return "Answered" }
        if o.day > data.day { return "Tomorrow" }
        if o.day < data.day { return "Gone" }
        if o.hours > 0, slot(for: o.hours) == nil { return "Not enough time today" }
        return nil
    }

    func ignoreOpportunity(_ id: UUID) {
        guard let i = data.opportunities.firstIndex(where: { $0.id == id }) else { return }
        data.opportunities[i].answered = true
        log("Passed on: \(data.opportunities[i].title).")
        save()
    }

    /// Takes the opportunity. Some open an encounter, and some finish at once.
    func acceptOpportunity(_ id: UUID) -> OpportunityOutcome {
        guard let i = data.opportunities.firstIndex(where: { $0.id == id }) else { return .failed("It is gone.") }
        let o = data.opportunities[i]
        if let block = opportunityBlock(o) { return .failed(block) }
        data.opportunities[i].answered = true
        switch o.kind {
        case .collectionForSale, .vintageCollection:
            guard let start = slot(for: o.hours) else { return .failed("Not enough time today.") }
            data.hour = start
            let vintage = o.kind == .vintageCollection
            let count = vintage ? Int.random(in: Balance.vintageCollectionItems) : Int((Double(Int.random(in: Balance.lotCards)) * Balance.collectionQuality).rounded())
            var items = VendorFloor.lot(kind: .garageSale, count: count, priceFactor: 1)
            let share = vintage ? Balance.vintageCollectionShare : Balance.collectionPriceShare
            for j in items.indices {
                let market = items[j].market ?? items[j].price
                items[j].price = ShowSession.round(max(0.5, market * share))
            }
            if vintage {
                items = items.filter { item in
                    if case .single(_, let s, _) = item.goods { return Balance.vintageSets.contains(s) || Balance.olderSets.contains(s) }
                    return true
                }
            }
            let vendor = Vendor(name: vintage ? "The family's collection" : "The binder and the box", kind: .collector, items: items)
            let venue = Venue(kind: .opportunity, name: o.title, detail: "\(Int(share * 100))% of market · \(formatHours(o.hours))",
                              open: data.hour, close: data.hour + o.hours, hours: o.hours, visitorsMean: 0, hasFloor: true,
                              hasTable: false, approachChance: 0, fakeSource: .stranger, eventID: o.id)
            log("Went to see \(o.title.lowercased()).")
            save()
            return .encounter(ShowSession(venue: venue, store: self, vendors: [vendor], regulars: []))
        case .vendorLiquidating:
            guard let start = slot(for: o.hours) else { return .failed("Not enough time today.") }
            guard let c = contact(o.contactID) else { return .failed("They are gone.") }
            data.hour = start
            var vendor = Vendor(name: c.name, kind: c.kind.vendorKind, items: VendorFloor.stock(c.kind.vendorKind), contactID: c.id)
            for j in vendor.items.indices {
                let market = vendor.items[j].market ?? vendor.items[j].price
                vendor.items[j].price = ShowSession.round(max(0.5, market * Balance.liquidationShare))
            }
            let venue = Venue(kind: .opportunity, name: o.title, detail: "\(Int(Balance.liquidationShare * 100))% of market · \(formatHours(o.hours))",
                              open: data.hour, close: data.hour + o.hours, hours: o.hours, visitorsMean: 0, hasFloor: true,
                              hasTable: false, approachChance: 0, fakeSource: .contact(level(c.id)), eventID: o.id)
            log("Went to see \(c.name)'s closeout.")
            save()
            return .encounter(ShowSession(venue: venue, store: self, vendors: [vendor], regulars: []))
        case .lastMinuteTable:
            guard let showID = o.showID, let j = data.shows.firstIndex(where: { $0.id == showID }), !data.shows[j].booked else {
                return .failed("The table is gone.")
            }
            data.shows[j].booked = true
            log("Took the free table at \(data.shows[j].name).")
            save()
            return .done("Your table at \(data.shows[j].name) is booked. No fee.")
        case .privateBuyer:
            guard let cardID = o.cardID, let card = card(cardID), card.status == nil, !card.keep else {
                return .failed("You no longer have the card.")
            }
            guard spendHours(o.hours) else { return .failed("Not enough time today.") }
            data.raw.removeAll { $0.id == cardID }
            data.slabs.removeAll { $0.id == cardID }
            addLedger(o.price, .sale, "\(card.print.name) · private buyer")
            addReceipt(name: card.print.name, venue: "A private buyer", price: o.price, net: o.price, paid: card.paid)
            addReputation(2)
            if let fake = card.fake {
                recordBadSale(item: card.print.name, channel: "a private buyer", price: o.price, fake: fake, known: card.isKnownFake,
                              refunds: false)
            }
            log("Sold \(card.print.name) to a private buyer for \(money(o.price)).", cash: o.price)
            save()
            return .done("Sold for \(money(o.price)). Cash in hand.")
        case .estateTipOff:
            let sale = PostedSale(kind: .estate, address: "\(Int.random(in: 11...998)) Orchard Ln", startDay: data.day + 1, days: 3,
                                  postedDay: data.day, far: false, quality: 1.5)
            data.sales.append(sale)
            log("An estate sale tip went on the calendar: \(sale.address), starting tomorrow.")
            save()
            return .done("The estate sale on \(sale.address) is on your calendar. It starts tomorrow at \(GameStore.clock(sale.kind.open)).")
        }
    }

    /// Test tool: this kind of opportunity, today.
    func addTestOpportunity(_ kind: OpportunityKind) {
        if kind == .lastMinuteTable {
            data.vendorKit = true
            if !data.shows.contains(where: { $0.startDay == data.day + 1 }) {
                data.shows.append(CardShow(name: "Test Show Tomorrow", venue: "Test Hall", size: .local, startDay: data.day + 1))
            }
        }
        if kind == .privateBuyer, !(data.raw + data.slabs).contains(where: { $0.market >= Balance.privateBuyerMinCard }) {
            if let print = SetLibrary.set("prismatic-evolutions").prints.first(where: { ($0.market ?? 0) >= 60 }) { addTestCard(print) }
        }
        if kind == .vendorLiquidating, !data.contacts.contains(where: { $0.kind.isVendor && level($0.id).rank >= StandingLevel.trusted.rank }) {
            seedContacts()
            if let c = data.contacts.first(where: { $0.kind.isVendor }) { addPoints(c.id, 70) }
        }
        let saved = data.reputation
        if kind == .vintageCollection, reputationTier < 4 { data.reputation = 700 }
        if let o = makeOpportunity(notice: 0, kind: kind) { data.opportunities.append(o) }
        data.reputation = saved
        save()
    }
}
