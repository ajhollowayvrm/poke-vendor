import Foundation

// Shelf prices and online listings for the player's own store (docs/22-own-store.md).

extension Balance {
    /// Sealed product sells near MSRP. Hot product goes above it.
    static let storeDefaultSealedPrice = 1.0
    static let storeSealedPrices = [0.9, 1.0, 1.10, 1.20, 1.35, 1.5]
    /// The own price of one slab, as a share of market.
    static let storeSlabPrices = [0.9, 0.95, 1.0, 1.10, 1.20, 1.30, 1.5, 2.0]
    /// Both an online order and a store customer want the same item on the same day.
    static let doubleSaleChance = 0.02
    static let doubleSaleReputation = -2
}

extension CardStoreState {
    /// The shelf price of singles, as a share of market. An old save gives its one price.
    var singlesPrice: Double { singlesFactor ?? priceFactor ?? Balance.storeDefaultPrice }
    /// The shelf price of sealed product, as a share of market. An old save gives its one price.
    var sealedPrice: Double { sealedFactor ?? priceFactor ?? Balance.storeDefaultSealedPrice }

    /// Moves the old store-wide price into the two new prices, so a change to one does not move the other.
    fileprivate mutating func splitOldPrice() {
        singlesFactor = singlesPrice
        sealedFactor = sealedPrice
        priceFactor = nil
    }
}

@MainActor
extension GameStore {
    // MARK: - Prices

    func setSinglesPrice(_ factor: Double) {
        guard var s = data.cardStore else { return }
        s.splitOldPrice()
        s.singlesFactor = factor
        data.cardStore = s
        save()
    }

    func setSealedPrice(_ factor: Double) {
        guard var s = data.cardStore else { return }
        s.splitOldPrice()
        s.sealedFactor = factor
        data.cardStore = s
        save()
    }

    /// Sets the own price of a slab in the store. Nil gives the slab the singles price again.
    func setSlabPrice(_ id: UUID, _ factor: Double?) {
        guard let i = data.slabs.firstIndex(where: { $0.id == id }), Self.isInStore(data.slabs[i].status) else { return }
        data.slabs[i].shelfFactor = factor
        save()
    }

    /// The own price of a slab, as a share of market. Nil when it has none.
    func slabPrice(_ id: UUID) -> Double? {
        data.slabs.first { $0.id == id }?.shelfFactor
    }

    /// The shelf price of a single with this market value. A slab can have its own price: see `storePrice(item:)`.
    func storePrice(_ market: Double) -> Double {
        ShowSession.round(market * (data.cardStore?.singlesPrice ?? Balance.storeDefaultPrice))
    }

    /// The shelf price of an item on the table at the counter, or in the stock list.
    func storePrice(item: ShowItem) -> Double {
        shelfPrice(market: item.market, id: item.id, sealed: item.kind == .sealed)
    }

    /// The shelf price of a card in the store.
    func storePrice(card: OwnedCard) -> Double {
        shelfPrice(market: card.realMarket, id: card.id, sealed: false)
    }

    /// The shelf price of an item that a customer looks at.
    func shelfPrice(_ item: StoreShelfItem) -> Double {
        shelfPrice(market: item.market, id: item.id, sealed: !item.isCard)
    }

    private func shelfPrice(market: Double, id: UUID, sealed: Bool) -> Double {
        guard let s = data.cardStore else { return ShowSession.round(market * Balance.storeDefaultPrice) }
        let factor = sealed ? s.sealedPrice : slabPrice(id) ?? s.singlesPrice
        return ShowSession.round(market * factor)
    }

    // MARK: - Online listings

    /// The online listing of an item in the store.
    func onlineListing(of id: UUID) -> Listing? {
        let stock = storeStock
        return (stock.cards.first { $0.id == id }?.onlineListing) ?? stock.sealed.first { $0.id == id }?.onlineListing
    }

    /// Lists items that are in the store on a channel too. The items stay in the store.
    func listOnline(_ ids: Set<UUID>, channel: Listing.Channel, price: (UUID) -> Double, auctionDays: Int?, insured: Bool) {
        func listing(_ id: UUID) -> Listing {
            Listing(channel: channel, price: price(id), dayListed: data.day,
                    auctionEndDay: auctionDays.map { data.day + $0 }, insured: insured)
        }
        var count = 0
        for i in data.raw.indices where ids.contains(data.raw[i].id) && Self.isInStore(data.raw[i].status) {
            data.raw[i].onlineListing = listing(data.raw[i].id)
            count += 1
        }
        for i in data.slabs.indices where ids.contains(data.slabs[i].id) && Self.isInStore(data.slabs[i].status) {
            data.slabs[i].onlineListing = listing(data.slabs[i].id)
            count += 1
        }
        for i in data.sealed.indices where ids.contains(data.sealed[i].id) && Self.isInStore(data.sealed[i].status) {
            data.sealed[i].onlineListing = listing(data.sealed[i].id)
            count += 1
        }
        guard count > 0 else { return }
        log("Listed \(count) item\(count == 1 ? "" : "s") from the store on \(channel.rawValue) too.")
        save()
    }

    func removeOnlineListing(_ id: UUID) {
        for i in data.raw.indices where data.raw[i].id == id { data.raw[i].onlineListing = nil }
        for i in data.slabs.indices where data.slabs[i].id == id { data.slabs[i].onlineListing = nil }
        for i in data.sealed.indices where data.sealed[i].id == id { data.sealed[i].onlineListing = nil }
        save()
    }

    /// An item in the store sells in the store. Its online listing goes away. On a day when the online listing
    /// would sell too, there is a small chance that the player does not pull the listing in time. The online
    /// order is cancelled, and reputation goes down.
    func settleOnlineListing(_ id: UUID, name: String) {
        var wouldSell = false
        if let card = (data.raw + data.slabs).first(where: { $0.id == id }), Self.isInStore(card.status),
           let listing = card.onlineListing {
            wouldSell = rollSale(listing, card: card) != nil
        } else if let item = data.sealed.first(where: { $0.id == id }), Self.isInStore(item.status),
                  let listing = item.onlineListing {
            wouldSell = rollSale(listing, market: realMarket(of: item), sealed: true) != nil
        }
        guard wouldSell, Double.random(in: 0..<1) < Balance.doubleSaleChance else { return }
        addReputation(Balance.doubleSaleReputation)
        log("Double sale: you sold \(name) in the store, and it also sold online. You cancelled the online order. Reputation \(Balance.doubleSaleReputation).")
    }

    /// End Day: rolls the online listing of a card in the store like a normal listing. A sale takes the card out of
    /// the store. Returns the report line, and true when the card sold.
    func advanceOnlineListing(_ card: inout OwnedCard) -> (line: String, sold: Bool)? {
        guard Self.isInStore(card.status), let listing = card.onlineListing else { return nil }
        let name = card.print.name + (card.grade.map { " " + $0.label } ?? "")
        if let sale = rollSale(listing, card: card) {
            let line = completeSale(name: name, listing: listing, price: sale, sealed: false, paid: card.paid, fake: card.fake,
                                    known: card.isKnownFake, card: card, slab: card.grade != nil)
            return (line, true)
        }
        if listingExpired(listing) {
            card.onlineListing = nil
            return ("Your \(listing.channel.rawValue) listing for \(name) ended with no sale. It stays in the store.", false)
        }
        return nil
    }

    /// The same for a sealed item in the store.
    func advanceOnlineListing(_ item: inout SealedItem) -> (line: String, sold: Bool)? {
        guard Self.isInStore(item.status), let listing = item.onlineListing else { return nil }
        if let sale = rollSale(listing, market: realMarket(of: item), sealed: true) {
            let line = completeSale(name: item.name, listing: listing, price: sale, sealed: true, paid: item.paid, fake: item.fake,
                                    known: item.isKnownFake, sealedItem: item)
            return (line, true)
        }
        if listingExpired(listing) {
            item.onlineListing = nil
            return ("Your \(listing.channel.rawValue) listing for \(item.name) ended with no sale. It stays in the store.", false)
        }
        return nil
    }
}
