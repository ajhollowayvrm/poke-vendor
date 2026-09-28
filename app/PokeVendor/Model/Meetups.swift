import Foundation

// Facebook Marketplace selling, and pickups set for a later day (docs/15-selling.md, Facebook Marketplace;
// docs/12-acquiring-product.md, Facebook Marketplace).

/// A buyer's offer on a Facebook listing. It waits for the player's answer.
struct FBOffer: Codable, Identifiable, Hashable {
    var id = UUID()
    let itemID: UUID
    let itemName: String
    let buyer: String
    let offer: Double
    let listPrice: Double
    let day: Int
    /// The day the buyer can meet. Today, or a later day.
    let meetupDay: Int
    let sealed: Bool
}

/// A meetup on the calendar: a buyer for the player's item, or a pickup the player paid for.
struct Meetup: Codable, Identifiable, Hashable {
    var id = UUID()
    let day: Int
    let isPickup: Bool
    let name: String
    let price: Double
    let who: String
    /// For a sale: the player's item.
    var itemID: UUID?
    var sealed = false
    /// For a pickup: the product that comes home.
    var productID: String?
    var setSlug: String?
    var fake: FakeTier?
    var done = false
}

extension Balance {
    /// The chance each day that a Facebook listing gets an offer.
    static let fbOfferChancePerDay = 0.08
    static let fbOfferShare = 0.65...0.95
    static let fbNoShowChance = 0.20
    static let fbLaterDayChance = 0.5
    static let fbMeetupDays = 1...3
    static let fbOfferDays = 2
}

@MainActor
extension GameStore {
    private static let buyers = ["Jordan", "Sam", "Alyssa", "Chris", "Nate", "Mia", "Ben", "Rosa", "Luis", "Hannah"]

    var pendingFBOffers: [FBOffer] { data.fbOffers.filter { $0.day + Balance.fbOfferDays >= data.day } }
    var meetupsToday: [Meetup] { data.meetups.filter { $0.day == data.day && !$0.done } }

    /// Offers on Facebook listings, and meetups that the player missed (docs/15, Facebook Marketplace).
    func meetupsEndDay() -> [String] {
        var lines: [String] = []
        let today = data.day
        data.fbOffers.removeAll { $0.day + Balance.fbOfferDays < today }
        // A missed meetup: the buyer moves on, and the listing stays up.
        for m in data.meetups where m.day < data.day && !m.done && !m.isPickup {
            lines.append("\(m.who) waited for you with the \(m.name) and left. The listing is still up.")
        }
        data.meetups.removeAll { $0.day < today && !$0.isPickup }
        // A pickup the player did not make comes home the next day anyway: the seller drops it off.
        for i in data.meetups.indices where data.meetups[i].day < data.day && !data.meetups[i].done && data.meetups[i].isPickup {
            data.meetups[i].done = true
            deliverPickup(data.meetups[i])
            lines.append("\(data.meetups[i].who) dropped off the \(data.meetups[i].name) you paid for.")
        }
        data.meetups.removeAll { $0.done }
        // New offers.
        func listed(_ id: UUID, _ status: ItemStatus?) -> Listing? {
            if case .listed(let l) = status, l.channel == .facebook { return l }
            return nil
        }
        var candidates: [(UUID, String, Double, Bool)] = []
        for c in data.raw + data.slabs { if let l = listed(c.id, c.status) { candidates.append((c.id, c.print.name, l.price, false)) } }
        for s in data.sealed { if let l = listed(s.id, s.status) { candidates.append((s.id, s.name, l.price, true)) } }
        for (id, name, price, sealed) in candidates where !data.fbOffers.contains(where: { $0.itemID == id }) {
            guard Double.random(in: 0..<1) < Balance.fbOfferChancePerDay * reachSaleFactor else { continue }
            let later = Double.random(in: 0..<1) < Balance.fbLaterDayChance
            let offer = FBOffer(itemID: id, itemName: name, buyer: Self.buyers.randomElement() ?? "Jordan",
                                offer: ShowSession.round(max(0.5, price * Double.random(in: Balance.fbOfferShare))), listPrice: price,
                                day: data.day, meetupDay: later ? data.day + Int.random(in: Balance.fbMeetupDays) : data.day, sealed: sealed)
            data.fbOffers.append(offer)
            lines.append("\(offer.buyer) offered \(money(offer.offer)) for your \(name) on Facebook Marketplace. Answer from the hub.")
        }
        return lines
    }

    /// Takes the offer. The meetup goes on the calendar, today or on the buyer's day.
    func acceptFBOffer(_ id: UUID) {
        guard let i = data.fbOffers.firstIndex(where: { $0.id == id }) else { return }
        let o = data.fbOffers.remove(at: i)
        data.meetups.append(Meetup(day: o.meetupDay, isPickup: false, name: o.itemName, price: o.offer, who: o.buyer, itemID: o.itemID,
                                   sealed: o.sealed))
        log("Agreed to meet \(o.buyer) for the \(o.itemName) at \(money(o.offer))\(o.meetupDay == data.day ? " today" : " on day \(o.meetupDay + 1)").")
        save()
    }

    func declineFBOffer(_ id: UUID) {
        data.fbOffers.removeAll { $0.id == id }
        save()
    }

    /// The meetup: 1 hour. Some buyers do not show up. A pickup brings the product home.
    func doMeetup(_ id: UUID) -> String? {
        guard let i = data.meetups.firstIndex(where: { $0.id == id }), !data.meetups[i].done else { return nil }
        let m = data.meetups[i]
        guard spendHours(Balance.facebookPickupHours) else { return "You have no free hour left today." }
        if m.isPickup {
            data.meetups[i].done = true
            deliverPickup(m)
            data.meetups.remove(at: i)
            log("Picked up the \(m.name) from \(m.who).")
            save()
            return "Picked up. It is in your Inventory now."
        }
        if Double.random(in: 0..<1) < Balance.fbNoShowChance {
            data.meetups.remove(at: i)
            log("\(m.who) did not show up for the \(m.name). The listing is still up.")
            save()
            return "\(m.who) did not show up. The listing is still up."
        }
        guard let itemID = m.itemID else { return nil }
        var fake: FakeTier?
        var known = false
        if let card = card(itemID) {
            fake = card.fake
            known = card.isKnownFake
        } else if let s = data.sealed.first(where: { $0.id == itemID }) {
            fake = s.fake
            known = s.isKnownFake
        } else {
            data.meetups.remove(at: i)
            return "You no longer have the item."
        }
        data.raw.removeAll { $0.id == itemID }
        data.slabs.removeAll { $0.id == itemID }
        data.sealed.removeAll { $0.id == itemID }
        let line = completeSaleNow(name: m.name, channel: .facebook, price: m.price, sealed: m.sealed, insured: false)
        if let fake {
            recordBadSale(item: m.name, channel: "Facebook Marketplace", price: m.price, fake: fake, known: known, refunds: false)
        }
        data.meetups.remove(at: i)
        log(line, cash: m.price)
        save()
        return "Sold to \(m.who) for \(money(m.price)) cash."
    }

    private func deliverPickup(_ m: Meetup) {
        guard let productID = m.productID, let product = SetLibrary.product(productID) else { return }
        var item = SealedItem(setSlug: m.setSlug ?? product.homeSlug, name: product.name, packs: product.packs, paid: m.price,
                              acquired: .now, source: "Bought on Facebook Marketplace", productID: product.id, acquiredDay: data.day)
        item.fake = m.fake
        data.sealed.append(item)
    }

    /// A Facebook pickup set for a later day: pay now, and the pickup goes on the calendar (docs/12).
    func buyLaterPickup(_ offer: StoreOffer, day: Int) -> Bool {
        guard case .product(let product, let slug) = offer.item, canAfford(offer.price), !data.boughtToday.contains(offer.id) else { return false }
        data.boughtToday.append(offer.id)
        addLedger(-offer.price, .sealed, "\(product.name) · \(offer.store.rawValue) · pickup day \(day + 1)")
        data.meetups.append(Meetup(day: day, isPickup: true, name: product.name, price: offer.price, who: Self.buyers.randomElement() ?? "the seller",
                                   productID: product.id, setSlug: slug, fake: offer.fake))
        log("Paid \(money(offer.price)) for \(product.name) on \(offer.store.rawValue). The pickup is on day \(day + 1).", cash: -offer.price)
        save()
        return true
    }

    /// Test tool: an offer on the first Facebook listing, or a listing plus an offer.
    func testFBOffer() {
        if let card = data.raw.first(where: { $0.status == nil && !$0.keep }) {
            list([card.id], channel: .facebook, price: { _ in card.realMarket }, auctionDays: nil, insured: false)
            data.fbOffers.append(FBOffer(itemID: card.id, itemName: card.print.name, buyer: "Jordan",
                                         offer: ShowSession.round(max(0.5, card.realMarket * 0.8)), listPrice: card.realMarket,
                                         day: data.day, meetupDay: data.day, sealed: false))
            save()
        }
    }
}
