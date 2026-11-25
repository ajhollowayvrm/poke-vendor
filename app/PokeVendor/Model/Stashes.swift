import Foundation

// Stashes (docs/20-card-shows.md, Stashes). A trader shows the cards they offer, and a seller shows one item. The
// player can ask to see more: a trader's binder, or a seller's stash. Familiarity decides whether they show it, how
// much they show, and whether their PC comes out. Every PC item carries the PC premium.

extension Balance {
    /// The chance that a person shows their binder or stash, by standing level. A closet cleaner wants it gone.
    static let stashShowChance: [StandingLevel: Double] = [.stranger: 0.5, .familiar: 0.65, .regular: 0.8, .trusted: 0.95, .friend: 1]
    static let stashCleanerBonus = 0.3
    /// How many items they show, by standing level.
    static let stashSize: [StandingLevel: ClosedRange<Int>] = [.stranger: 2...3, .familiar: 3...4, .regular: 4...6,
                                                               .trusted: 5...8, .friend: 7...10]
    /// How many PC items they show. Only Trusted and Friend see a person's PC.
    static let stashPCSize: [StandingLevel: ClosedRange<Int>] = [.trusted: 1...2, .friend: 2...3]
    /// The minutes it takes to look through a binder or a stash.
    static let stashMinutes = 3.0
    /// A PC item in a stash: the asking price over the PC price.
    static let stashPCAsk = 1.05...1.2
}

/// One item in a seller's stash: the item, the lowest price they take (hidden), and whether it is in their PC.
struct StashItem: Identifiable, Codable {
    var item: VendorItem
    let floor: Double
    let pc: Bool
    var id: UUID { item.id }
    var market: Double { item.market ?? item.price }
    /// What the item counts for in a deal: market, with the PC premium for a PC item.
    var dealMarket: Double { pc ? market * Balance.pcPremium : market }
}

@MainActor
extension ShowSession {
    /// A trader can show their binder. A seller, at the table or on the floor, can show their stash.
    func canAskStash(_ v: Visitor) -> Bool {
        !v.stashAsked && v.collection == nil && v.advice == nil && (v.intent == .trade || v.intent == .sell)
    }

    /// Asks to see the binder or the stash. It works once for each person.
    func askToSeeStash() {
        guard var v = current, canAskStash(v) else { return }
        v.stashAsked = true
        spend(Balance.stashMinutes)
        let level = store.level(v.contactID)
        let chance = (Balance.stashShowChance[level] ?? 0.5) + (v.type == .closetCleaner ? Balance.stashCleanerBonus : 0)
        guard Double.random(in: 0..<1) < chance else {
            v.line = v.intent == .trade ? "The rest of my binder stays closed today." : "Not today. This is all I brought out."
            setCurrent(v)
            return
        }
        let count = Int.random(in: Balance.stashSize[level] ?? 2...3)
        let pcCount = Balance.stashPCSize[level].map { Int.random(in: $0) } ?? 0
        if v.intent == .trade {
            showBinder(&v, count: count, pcCount: pcCount)
        } else {
            showStash(&v, count: count, pcCount: pcCount, level: level)
        }
        setCurrent(v)
    }

    /// The trader's binder: the hidden cards, more cards to fill the count, and PC cards for a player they trust.
    private func showBinder(_ v: inout Visitor, count: Int, pcCount: Int) {
        let target = v.item?.dealMarket ?? 20
        var shown = Array(v.binderHidden.prefix(count))
        v.binderHidden = []
        var tries = 0
        while shown.count < count, tries < count * 3 {
            tries += 1
            if let more = tradeCard(max: target * Double.random(in: 0.2...0.9)) { shown.append(more) }
        }
        var pcShown = 0
        for _ in 0..<pcCount {
            if var card = tradeCard(max: target * Double.random(in: 0.4...1.0)) {
                card.pc = true
                shown.append(card)
                pcShown += 1
            }
        }
        v.binder += shown
        v.line = pcShown > 0 ? "Here's my binder. The cards in the back are my PC. Those cost a bit more."
                             : shown.isEmpty ? "That's all I have." : "Sure, here's my binder. Pick what you like."
    }

    /// The seller's stash: more items at their kind of prices, and PC items for a player they trust.
    private func showStash(_ v: inout Visitor, count: Int, pcCount: Int, level: StandingLevel) {
        let (askRange, floorRange) = Self.sellerRanges(v.type)
        let source = store.fakeSource(contact: v.contactID, fallback: venue.fakeSource == .none ? .stranger : venue.fakeSource)
        var items: [StashItem] = []
        for i in 0..<(count + pcCount) {
            guard let (goods, market) = sellerGoods() else { continue }
            let pc = i >= count
            let ask: Double
            let floor: Double
            if pc {
                floor = market * Balance.pcPremium
                ask = floor * Double.random(in: Balance.stashPCAsk)
            } else {
                ask = market * Double.random(in: askRange) * (1 - level.priceBonus)
                floor = min(ask, market * Double.random(in: floorRange) * (1 - level.priceBonus))
            }
            var item = VendorItem(goods: goods, price: max(1, Self.round(ask)), market: market)
            item.rollFake(source: source, tired: store.eyeFactor)
            items.append(StashItem(item: item, floor: floor, pc: pc))
        }
        v.stash = items
        v.line = items.contains(where: \.pc) ? "Here's what else I have. The sleeved ones are my PC, so they cost more."
                                            : items.isEmpty ? "That's all I have." : "Here's what else I brought."
    }

    /// The first price and the lowest price of a seller, as shares of market.
    static func sellerRanges(_ type: VisitorType) -> (ClosedRange<Double>, ClosedRange<Double>) {
        switch type {
        case .closetCleaner: (0.6...0.85, 0.42...0.6)
        case .dealer: (0.85...1.0, 0.72...0.85)
        default: (0.75...0.95, 0.6...0.75)
        }
    }

    /// The seller's asking price for these stash items.
    func stashAsk(_ v: Visitor, _ ids: Set<UUID>) -> Double {
        v.stash.filter { ids.contains($0.id) }.reduce(0) { $0 + $1.item.price }
    }

    /// The market of these stash items, with the PC premium on PC items.
    func stashMarket(_ v: Visitor, _ ids: Set<UUID>) -> Double {
        v.stash.filter { ids.contains($0.id) }.reduce(0) { $0 + $1.dealMarket }
    }

    /// An offer on stash items. At or over the seller's lowest total, they sell. Under it, they counter, and after
    /// the second refusal they close the stash. The main deal stays open.
    /// `credit`: at the player's store, the seller takes store credit for the price (`creditOffer(cash:)`). The
    /// seller judges the cash price.
    func offerOnStash(_ ids: Set<UUID>, price: Double, credit: Bool = false) {
        guard var v = current, v.intent == .sell else { return }
        let items = v.stash.filter { ids.contains($0.id) }
        guard !items.isEmpty else { return }
        let credit = credit && canPayCredit
        guard credit || store.canAfford(price) else {
            note = "You do not have \(money(price))."
            return
        }
        let floor = items.reduce(0) { $0 + $1.floor }
        let ask = stashAsk(v, ids)
        let market = stashMarket(v, ids)
        if price >= floor - 0.001 {
            buyStash(&v, items, price: price, market: market, pushed: price < ask - 0.001, credit: credit)
            return
        }
        if market > 0, price < market * 0.6, !v.naive { store.lowballed(v.contactID) }
        if v.stashPatience <= 0 {
            v.stash = []
            v.stashCounter = nil
            v.line = "No. I'll hold on to the rest."
            setCurrent(v)
            spend(2)
            return
        }
        v.stashPatience -= 1
        let counter = Self.round(max(floor, floor + (ask - floor) * Double.random(in: 0.2...0.5)))
        v.stashCounter = counter
        v.stashCounterFor = ids
        v.line = "\(Haggle.tell(market > 0 ? abs(price - floor) / market : 1)) For \(items.count == 1 ? "that" : "those"), I'd do \(money(counter))."
        setCurrent(v)
        spend(2)
    }

    /// Takes the seller's counter on the stash.
    func takeStashCounter(credit: Bool = false) {
        guard let v = current, let counter = v.stashCounter else { return }
        offerOnStash(v.stashCounterFor, price: counter, credit: credit)
    }

    private func buyStash(_ v: inout Visitor, _ items: [StashItem], price: Double, market: Double, pushed: Bool,
                          credit: Bool = false) {
        // Each item gets its own receipt: the price splits by the asking prices.
        let asks = items.map(\.item.price)
        let total = max(asks.reduce(0, +), 0.01)
        var left = price
        for (i, one) in items.enumerated() {
            let part = i == items.count - 1 ? left : Self.round(price * asks[i] / total)
            left -= part
            buyGoods(one.item.goods, price: part, from: v.name, fake: one.item.fake, looksOff: one.item.looksOff,
                     credit: credit ? creditOffer(cash: part) : nil)
        }
        let names = items.map(\.item.name).joined(separator: ", ")
        store.recordDeal(v.contactID, what: "Bought \(names) from their stash\(credit ? " for store credit" : "")", price: price,
                         market: market, slug: items.first?.item.slug, scored: true)
        score(credit ? .credit : .buy, price: credit ? creditOffer(cash: price) : price, market: market, pushed: pushed, v)
        let bought = Set(items.map(\.id))
        stashBuys += 1
        v.stash.removeAll { bought.contains($0.id) }
        v.stashCounter = nil
        v.stashCounterFor = []
        v.line = "Deal. Anything else?"
        setCurrent(v)
        spend(5)
        Haptics.hit()
    }
}
