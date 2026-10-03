import Foundation

// Consignment at the player's own store (docs/22-own-store.md).

@MainActor
extension GameStore {
    var ownConsigned: [ConsignedCard] { data.cardStore?.growth.consigned ?? [] }

    /// The case slots that consigned cards use.
    var consignedCount: Int { data.cardStore?.growth.consigned.count ?? 0 }

    /// The slots in use in the cases: the player's cards, and the cards of customers.
    var storeCardsUsed: Int { storeStock.cards.count + consignedCount }

    func setConsignment(on: Bool, cut: Double) {
        guard var s = data.cardStore else { return }
        var g = s.growth
        g.consignOn = on
        g.consignCut = cut
        s.growth = g
        data.cardStore = s
        save()
    }

    /// Consigned cards as the customers see them. They sell at the singles price.
    func consignedShelfItems() -> [StoreShelfItem] {
        ownConsigned.map {
            StoreShelfItem(id: $0.id, name: $0.name, market: $0.market, paid: nil, setSlug: $0.setSlug, isCard: true,
                           isPack: false, productKey: "", fake: nil, known: false, consigned: true)
        }
    }

    /// A card sells for `price`. The store keeps its cut, and the owner gets the rest. Returns the cut.
    func sellConsigned(_ item: StoreShelfItem, price: Double, storeName: String) -> Double {
        guard var s = data.cardStore, let card = s.growth.consigned.first(where: { $0.id == item.id }) else { return 0 }
        let cut = ShowSession.round(price * card.cut)
        var g = s.growth
        g.consigned.removeAll { $0.id == card.id }
        g.consignedSold += 1
        g.consignEarned += cut
        s.growth = g
        data.cardStore = s
        addLedger(cut, .sale, "Consignment cut · \(card.name) · \(storeName) · sold \(money(price))")
        addReceipt(name: card.name, venue: "\(storeName) consignment", price: cut, net: cut, paid: nil)
        return cut
    }

    /// A thief takes consigned cards. The player pays the owner the payout. Returns the payout.
    func payConsignedTheft(_ ids: Set<UUID>) -> Double {
        guard var s = data.cardStore else { return 0 }
        let lost = s.growth.consigned.filter { ids.contains($0.id) }
        guard !lost.isEmpty else { return 0 }
        let payout = lost.reduce(0) { $0 + ShowSession.round(storePrice($1.market) * (1 - $1.cut)) }
        var g = s.growth
        g.consigned.removeAll { ids.contains($0.id) }
        s.growth = g
        data.cardStore = s
        addLedger(-payout, .sale, "Consignment payout for a stolen card · \(s.name)")
        return payout
    }

    /// A card or a slab that a customer wants to consign. Nil when the goods are not a card of enough value.
    private func consignedGoods(cut: Double) -> ConsignedCard? {
        for _ in 0..<6 {
            guard let (goods, market) = StoreSeller.goods() else { continue }
            let name: String
            let slug: String
            switch goods {
            case .single(let print, let s, _):
                name = print.name
                slug = s
            case .slab(let print, let s, let grade):
                name = "\(print.name) \(grade.label)"
                slug = s
            default:
                continue
            }
            if market >= Balance.ownConsignMinMarket {
                return ConsignedCard(name: name, setSlug: slug, market: market, cut: cut, dayIn: data.day)
            }
        }
        return nil
    }

    /// The clerk takes cards from customers who want to consign. A lower cut brings more of them. The cards use case slots.
    func rollConsignmentIntake(share: Double) -> [String] {
        guard var s = data.cardStore, s.growth.consignOn else { return [] }
        let cut = s.growth.consignCut
        let appeal = max(0.2, 1 - (cut - Balance.ownConsignBaseCut) * Balance.ownConsignCutSlope)
        let mean = expectedCustomers(day: data.day) * share * Balance.ownConsignSellerShare * appeal
        let sellers = min(Balance.ownConsignMaxPerDay, max(0, Int((mean + Double.random(in: -1...1)).rounded())))
        var room = storeCardSlots - storeCardsUsed
        var taken: [ConsignedCard] = []
        var full = false
        for _ in 0..<sellers {
            guard room > 0 else {
                full = true
                break
            }
            guard let card = consignedGoods(cut: cut) else { continue }
            taken.append(card)
            room -= 1
        }
        var lines: [String] = []
        if !taken.isEmpty {
            var g = s.growth
            g.consigned += taken
            s.growth = g
            data.cardStore = s
            lines.append("Customers left \(taken.count) card\(taken.count == 1 ? "" : "s") on consignment at \(s.name). The store keeps \(Int((cut * 100).rounded()))% when one sells.")
        }
        if full { lines.append("The cases are full, so the clerk turned consigners away.") }
        return lines
    }

    /// Cards that did not sell go back to their owners after the listing time.
    func returnOldConsigned() -> [String] {
        guard var s = data.cardStore else { return [] }
        let today = data.day
        let old = s.growth.consigned.filter { today - $0.dayIn >= Balance.ownConsignDays }
        guard !old.isEmpty else { return [] }
        let ids = Set(old.map(\.id))
        var g = s.growth
        g.consigned.removeAll { ids.contains($0.id) }
        s.growth = g
        data.cardStore = s
        return ["\(old.count) consigned card\(old.count == 1 ? "" : "s") did not sell at \(s.name) in \(Balance.ownConsignDays) days. The owners took them back."]
    }

    /// The line for the close of a store that holds consigned cards.
    func consignmentCloseLine(_ s: CardStoreState) -> String? {
        let n = s.growth.consigned.count
        return n > 0 ? "\(n) consigned card\(n == 1 ? "" : "s") went back to their owners." : nil
    }
}
