import Foundation

// eBay Best Offer (docs/15-selling.md, eBay). A player can turn on "Accept offers" for an eBay Buy It Now listing.
// Buyers send offers at End Day. The player accepts, declines, or counters.

/// The Best Offer settings of one listing. The shares are fractions of the listing price.
struct OfferTerms: Codable, Hashable {
    /// An offer at or above this share sells at once. Nil: no auto-accept.
    var autoAccept: Double?
    /// An offer below this share is declined at once. Nil: no auto-decline.
    var autoDecline: Double?
}

/// An offer from a buyer on an eBay Buy It Now listing.
struct BestOffer: Codable, Identifiable, Hashable {
    var id = UUID()
    let itemID: UUID
    let itemName: String
    let buyer: String
    let amount: Double
    let listPrice: Double
    let day: Int
    /// Hidden: the most the buyer pays. A counter at or under it sells.
    let ceiling: Double
    /// The player's counter. The buyer answers at the next End Day.
    var counter: Double?
}

extension Balance {
    /// The chance each day that an item with Best Offer on gets an offer, at a price equal to market.
    static let offerChancePerDay = 0.12
    /// The chance falls this fast for each 100% that the price is above market.
    static let offerPriceSlope = 3.0
    /// The most that a buyer pays, as a share of market.
    static let offerCeilingShare = 0.85...1.0
    /// The first offer, as a share of the buyer's most.
    static let offerOpeningShare = 0.80...0.92
    /// An offer waits this many days for an answer.
    static let offerDays = 2
    /// The limits of the auto-accept and auto-decline sliders, as shares of the price.
    static let autoAcceptRange = 0.80...1.0
    static let autoDeclineRange = 0.50...0.90
    static let autoAcceptDefault = 0.95
    static let autoDeclineDefault = 0.70
}

/// What the game needs to know about a listed eBay item.
struct EbayListed {
    let name: String
    let listing: Listing
    let market: Double
    let sealed: Bool
    let paid: Double?
    let fake: FakeTier?
    let known: Bool
}

@MainActor
extension GameStore {
    private static let offerBuyers = ["Jordan", "Sam", "Alyssa", "Chris", "Nate", "Mia", "Ben", "Rosa", "Luis", "Hannah"]

    /// The item, when it is up on eBay Buy It Now. Nil for any other state.
    func ebayListed(_ id: UUID) -> EbayListed? {
        func fixed(_ status: ItemStatus?) -> Listing? {
            if case .listed(let l) = status, l.channel == .ebay { return l }
            return nil
        }
        if let c = card(id), let l = fixed(c.status) {
            let name = c.grade.map { "\(c.print.name) \($0.label)" } ?? c.print.name
            return EbayListed(name: name, listing: l, market: c.realMarket, sealed: false, paid: c.paid, fake: c.fake, known: c.isKnownFake)
        }
        if let s = data.sealed.first(where: { $0.id == id }), let l = fixed(s.status) {
            return EbayListed(name: s.name, listing: l, market: realMarket(of: s), sealed: true, paid: s.paid, fake: s.fake,
                              known: s.isKnownFake)
        }
        return nil
    }

    /// Turns Best Offer on for listings that the player just made.
    func setOfferTerms(_ ids: Set<UUID>, _ terms: OfferTerms) {
        for id in ids { data.offerTerms[id] = terms }
        save()
    }

    func hasBestOffer(_ id: UUID) -> Bool { data.offerTerms[id] != nil && ebayListed(id) != nil }

    /// Offers that wait for the player: the item is still up, and the offer is not too old.
    var pendingBestOffers: [BestOffer] {
        data.bestOffers.filter { $0.counter == nil && $0.day + Balance.offerDays >= data.day && ebayListed($0.itemID) != nil }
    }

    /// Offers where the player made a counter and the buyer has not answered.
    var counteredBestOffers: [BestOffer] {
        data.bestOffers.filter { $0.counter != nil && ebayListed($0.itemID) != nil }
    }

    /// Sells a listed item at a price. Returns the line for the report, or nil if the item is not up on eBay.
    @discardableResult
    func sellListedEbay(_ id: UUID, price: Double) -> String? {
        guard let item = ebayListed(id) else { return nil }
        data.raw.removeAll { $0.id == id }
        data.slabs.removeAll { $0.id == id }
        data.sealed.removeAll { $0.id == id }
        data.offerTerms[id] = nil
        return completeSale(name: item.name, listing: item.listing, price: price, sealed: item.sealed, paid: item.paid,
                            fake: item.fake, known: item.known)
    }

    /// New offers, and answers to counters. Runs at End Day, after the normal sales (docs/15-selling.md, Best Offer).
    func offersEndDay() -> [String] {
        var lines: [String] = []
        let today = data.day
        // Read values into locals first. A closure on `data.x` must not read `data.y`.
        let terms = data.offerTerms
        let live = Set(terms.keys.filter { ebayListed($0) != nil })
        data.offerTerms = terms.filter { live.contains($0.key) }
        data.bestOffers.removeAll { !live.contains($0.itemID) }

        // The buyer answers a counter.
        let countered = data.bestOffers.filter { $0.counter != nil }
        for offer in countered {
            guard let counter = offer.counter else { continue }
            if counter <= offer.ceiling + 0.001 {
                lines.append("\(offer.buyer) took your counter of \(money(counter)) for \(offer.itemName).")
                if let line = sellListedEbay(offer.itemID, price: counter) { lines.append(line) }
            } else {
                lines.append("\(offer.buyer) turned down your counter of \(money(counter)) for \(offer.itemName). The listing is still up.")
            }
        }
        data.bestOffers.removeAll { $0.counter != nil }

        // An offer that waited too long goes away.
        let expired = data.bestOffers.filter { $0.day + Balance.offerDays < today }
        for offer in expired { lines.append("The offer of \(money(offer.amount)) from \(offer.buyer) for \(offer.itemName) ran out.") }
        data.bestOffers.removeAll { $0.day + Balance.offerDays < today }

        // New offers.
        var declined = 0
        let open = data.offerTerms.sorted { $0.key.uuidString < $1.key.uuidString }
        for (id, term) in open {
            let waiting = data.bestOffers.contains { $0.itemID == id }
            guard !waiting, let item = ebayListed(id), item.market > 0 else { continue }
            let above = max(0, item.listing.price / item.market - 1)
            let chance = Balance.offerChancePerDay * exp(-above * Balance.offerPriceSlope) * reachSaleFactor
            guard Double.random(in: 0..<1) < chance else { continue }
            let ceiling = min(item.listing.price, item.market * Double.random(in: Balance.offerCeilingShare))
            let amount = min(item.listing.price, ShowSession.round(max(0.5, ceiling * Double.random(in: Balance.offerOpeningShare))))
            let buyer = Self.offerBuyers.randomElement() ?? "Jordan"
            if let accept = term.autoAccept, amount >= item.listing.price * accept - 0.001 {
                lines.append("Auto-accepted \(buyer)'s offer of \(money(amount)) for \(item.name).")
                if let line = sellListedEbay(id, price: amount) { lines.append(line) }
            } else if let decline = term.autoDecline, amount < item.listing.price * decline {
                declined += 1
            } else {
                data.bestOffers.append(BestOffer(itemID: id, itemName: item.name, buyer: buyer, amount: amount,
                                                 listPrice: item.listing.price, day: today, ceiling: ceiling))
                lines.append("\(buyer) offered \(money(amount)) for your \(item.name) on eBay. Answer from the hub.")
            }
        }
        if declined > 0 { lines.append("Auto-declined \(declined) low offer\(declined == 1 ? "" : "s") on eBay.") }
        return lines
    }

    func acceptBestOffer(_ id: UUID) {
        guard let offer = data.bestOffers.first(where: { $0.id == id }) else { return }
        data.bestOffers.removeAll { $0.id == id }
        if let line = sellListedEbay(offer.itemID, price: offer.amount) { log(line) }
        save()
    }

    func declineBestOffer(_ id: UUID) {
        data.bestOffers.removeAll { $0.id == id }
        save()
    }

    /// One counter for each offer. The price must be above the offer and at or under the listing price.
    func counterBestOffer(_ id: UUID, price: Double) {
        guard let i = data.bestOffers.firstIndex(where: { $0.id == id }), data.bestOffers[i].counter == nil else { return }
        let offer = data.bestOffers[i]
        guard price > offer.amount, price <= offer.listPrice + 0.001 else { return }
        data.bestOffers[i].counter = price
        log("Countered \(offer.buyer) at \(money(price)) for \(offer.itemName). The buyer answers at End Day.")
        save()
    }
}
