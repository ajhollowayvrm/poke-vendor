import Foundation

// Consignment at the game shop (docs/15-selling.md, The local game shop).

extension Balance {
    /// The shop's cut by standing: Regular, Trusted, Friend.
    static let consignCutRegular = 0.20
    static let consignCutTrusted = 0.12
    static let consignDays = 28
    static let consignStandingPoints = 2
    /// The chance that a card at market sells inside the window. A higher price sells less often.
    static let consignSaleBase = 0.6
    /// The display case prices over market.
    static let consignPriceRange = 1.0...1.3
}

@MainActor
extension GameStore {
    func canConsign(at shop: LocalStore) -> Bool { standing(shop).rank >= StandingLevel.regular.rank }

    func consignCut(at shop: LocalStore) -> Double {
        standing(shop).rank >= StandingLevel.trusted.rank ? Balance.consignCutTrusted : Balance.consignCutRegular
    }

    /// Puts cards in the shop's display case at a share of market. The sale day is decided now, so the shop's
    /// weekly rhythm stays the same for the player.
    func consign(_ ids: Set<UUID>, at shop: LocalStore, percent: Double) {
        guard canConsign(at: shop) else { return }
        let cut = consignCut(at: shop)
        var count = 0
        func place(_ card: inout OwnedCard) {
            guard ids.contains(card.id), card.status == nil, !card.keep else { return }
            let price = max(0.5, (card.realMarket * percent / 100 * 100).rounded() / 100)
            let chance = Balance.consignSaleBase * exp(-(percent / 100 - 1) * 4)
            let sellDay: Int? = Double.random(in: 0..<1) < chance ? data.day + Int.random(in: 2...Balance.consignDays) : nil
            card.status = .consigned(Consignment(shop: shop, price: price, cut: cut, dayListed: data.day, sellDay: sellDay))
            count += 1
        }
        for i in data.raw.indices { place(&data.raw[i]) }
        for i in data.slabs.indices { place(&data.slabs[i]) }
        guard count > 0 else { return }
        log("Put \(count) card\(count == 1 ? "" : "s") on consignment at \(shop.rawValue). The shop takes \(Int(cut * 100))%.")
        save()
    }

    /// One consigned card at End Day: it sells, it comes back after the window, or it waits. Returns a line, or nil.
    func advanceConsignment(_ card: inout OwnedCard, _ c: Consignment) -> String? {
        let name = card.grade.map { "\(card.print.name) \($0.label)" } ?? card.print.name
        if c.sellDay == data.day {
            let net = (c.price * (1 - c.cut) * 100).rounded() / 100
            addLedger(net, .sale, "\(name) · consignment at \(c.shop.rawValue) · sold \(money(c.price))")
            addPoints(shopContactID(c.shop), Balance.consignStandingPoints)
            if let fake = card.fake {
                recordBadSale(item: name, channel: "\(c.shop.rawValue) consignment", price: c.price, fake: fake, known: card.isKnownFake,
                              refunds: false, contactID: shopContactID(c.shop), shop: c.shop)
            }
            card.status = nil
            return "\(c.shop.rawValue) sold your \(name) on consignment for \(money(c.price)). You got \(money(net)) after the shop's \(Int(c.cut * 100))%."
        }
        if data.day - c.dayListed >= Balance.consignDays {
            card.status = .arriving(daysLeft: 1, from: "\(c.shop.rawValue) consignment")
            return "Your \(name) did not sell on consignment at \(c.shop.rawValue). It comes back tomorrow."
        }
        return nil
    }

    /// Takes a card back from the display case. It comes home at once.
    func endConsignment(_ id: UUID) {
        for i in data.raw.indices where data.raw[i].id == id { if case .consigned = data.raw[i].status { data.raw[i].status = nil } }
        for i in data.slabs.indices where data.slabs[i].id == id { if case .consigned = data.slabs[i].status { data.slabs[i].status = nil } }
        save()
    }

    var consignedCards: [OwnedCard] {
        (data.raw + data.slabs).filter { if case .consigned = $0.status { return true }; return false }
    }
}
