import Foundation

// Rip & Ship (docs/06-social-media.md, Rip & Ship): one viewer buys one whole sealed product on a Whatnot stream. The
// player opens it on camera, and every card goes to that viewer.
//
// The one-buyer rule is in the shape of the code. One order holds one buyer (a String), one item ID, and the contents of
// that item. No type holds a list of buyers, a spot, a team, or a prize that depends on the rip result.

/// Why a Rip & Ship order is refunded.
enum RipShipRefund { case notOpened, resealed, chargeback, seized }

struct RipShipFees: Codable, Hashable {
    let commission: Double
    let processing: Double
    let flat: Double
    let supplies: Double
    var total: Double { commission + processing + flat + supplies }
}

/// A new field must be Optional. This type decodes inside an array.
struct RipShipOrder: Codable, Identifiable, Hashable {
    enum State: String, Codable { case sold, ripped }

    var id = UUID()
    let buyer: String
    /// A repeat buyer from the contacts. Nil: a viewer with no contact.
    let buyerContactID: String?
    /// The one sealed product. A case keeps this ID only until it opens on stream.
    let itemID: UUID
    let itemName: String
    let productID: String?
    let caseUnits: Int?
    let price: Double
    /// What the buyer pays for shipping. Whatnot charges processing on it. The buyer pays the label.
    let shipping: Double
    let fees: RipShipFees
    /// What the player paid for the product.
    let paid: Double
    let soldDay: Int
    let auction: Bool
    var state: State = .sold
    /// One flag each. `refundRipShipOrder` does nothing when `refunded` is true.
    var shipped = false
    var refunded = false
    var ripID: UUID?
    var rippedDay: Int?
    var shippedDay: Int?
    /// Hidden: the product is resealed. Set when the rip starts. The rip shows it on camera.
    var resealed = false
    /// What ships, kept whole so a chargeback can give it back.
    var cards: [OwnedCard] = []
    var bulk: [BulkGroup] = []
    var loose: [SealedItem] = []
    /// Hidden: the hits that the player palmed, the card IDs that stay with the player, and their market value.
    var palmedCardIDs: [UUID] = []
    var palmedValue = 0.0
    var palmCaught = false
    var palmSettled = false
    /// The Part C acts of this order, so a ship or a refund can retire them.
    var lateActID: UUID?
    var palmActID: UUID?
    /// What the sale added to the P&L challenge cash. A refund takes it back.
    var challengeCredit: Double?

    var net: Double { price - fees.total }
    var open: Bool { !shipped && !refunded }
    var contentsValue: Double { cards.reduce(0) { $0 + $1.market } + bulk.reduce(0) { $0 + $1.value } }
}

/// Rip & Ship state: the orders, the Whatnot ban, and the strikes.
struct RipShipState: Codable, Hashable {
    var orders: [RipShipOrder] = []
    /// Whatnot bans the player from streams until this day.
    var bannedUntil: Int?
    var banReason: String?
    /// The days of Whatnot strikes, and the permanent end of Rip & Ship (normal Whatnot streams stay).
    var strikes: [Int] = []
    var ripShipClosed = false
    /// Gross Rip & Ship sales by day, for the 4-week commission tier.
    var grossByDay: [Int: Double] = [:]

    init() {}

    /// A save from an older build can miss newer fields. Each missing field takes its default.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func v<T: Decodable>(_ key: CodingKeys, _ fallback: T) -> T { (try? c.decodeIfPresent(T.self, forKey: key)) ?? fallback }
        orders = v(.orders, [])
        bannedUntil = v(.bannedUntil, nil)
        banReason = v(.banReason, nil)
        strikes = v(.strikes, [])
        ripShipClosed = v(.ripShipClosed, false)
        grossByDay = v(.grossByDay, [:])
    }
}

extension Balance {
    /// Whatnot's commission by gross Rip & Ship sales in the last 28 days. The sources give only 8% under $15,000 and
    /// 6.5% at $500,000. The middle steps are design values.
    static let ripShipCommissionTiers: [(gross: Double, rate: Double)] = [
        (0, 0.08), (15_000, 0.075), (50_000, 0.07), (150_000, 0.0675), (500_000, 0.065),
    ]
    static let ripShipProcessingRate = 0.029
    static let ripShipProcessingFlat = 0.30
    static let ripShipSupplies = 0.50
    /// What the buyer pays for shipping, by the packs of the product. USPS Ground Advantage up to 4 oz is $4.47.
    static func ripShipShipping(packs: Int) -> Double { packs <= 3 ? 4.47 : packs <= 36 ? 9.85 : 15.50 }

    static let ripShipNotOpenedAuthenticity = 0.02
    static let resealedOnStreamAuthenticity = 0.05
    /// The weight of the late-order act after a chargeback.
    static let ripShipChargebackActWeight = 2.0

    static let ripShipDeadlineDays = 2
    static let ripShipCancelDays = 7
    static let ripShipShipMinutes = 10.0
    static let ripShipShipPoints = 2
    /// 2 strikes in 60 days give a 28-day ban. 3 strikes in 120 days end Rip & Ship for good.
    static let whatnotStrikeBanWindow = 60
    static let whatnotStrikeBanDays = 28
    static let whatnotStrikeCloseWindow = 120

    /// A viewer pays at most this share of market at Buy Now: hot product, and other product.
    static let ripShipHotBand = 0.95...1.20
    static let ripShipBand = 0.90...1.05
    /// The Buy Now chance for each viewer each minute, under the ceiling.
    static let ripShipBuyRate = 0.0024
    /// A product over this price needs a big crowd: the chance scales by (viewers / 100), at most 1.
    static let ripShipBigTicket = 500.0
    /// Each rival creator takes 5% of the buyers, down to 80%.
    static let ripShipRivalStep = 0.05
    static let ripShipRivalFloor = 0.80
    static let ripShipRepeatBuyerChance = 0.5
    /// A repeat buyer who did well last time pays up to 5% more. One who did badly pays up to 5% less.
    static let ripShipLuckStep = 0.05
    static let ripShipWaitMinutes = 10.0
    static let ripShipImpatience = 0.03
    /// A whole-case rip takes this many stream minutes for each pack.
    static let ripShipCaseMinutesPerPack = 0.75
    /// A big hit is a clip. It brings this share of the viewers as followers.
    static let ripShipClipFollowerShare = 0.03
    static let ripShipKeepDays = 28

    static let palmFoundChance = 0.5
    static let palmFoundReputation = 40
    static let palmBanDays = 56
    static let palmCalloutHeat = 90.0
}

@MainActor
extension GameStore {
    // MARK: - Fees

    /// The commission rate now. It follows the gross Rip & Ship sales of the last 28 days.
    var ripShipCommissionRate: Double {
        let from = data.day - 27
        let gross = data.ripShip.grossByDay.reduce(0) { $1.key >= from ? $0 + $1.value : $0 }
        return Balance.ripShipCommissionTiers.last { gross >= $0.gross }?.rate ?? 0.08
    }

    /// Net = sale - commission - 2.9% of (sale + buyer shipping) - $0.30 - $0.50 supplies.
    func ripShipFees(price: Double, shipping: Double) -> RipShipFees {
        func cents(_ x: Double) -> Double { (x * 100).rounded() / 100 }
        return RipShipFees(commission: cents(price * ripShipCommissionRate),
                           processing: cents((price + shipping) * Balance.ripShipProcessingRate),
                           flat: Balance.ripShipProcessingFlat, supplies: Balance.ripShipSupplies)
    }

    // MARK: - The sale

    var whatnotBanned: Bool { (data.ripShip.bannedUntil ?? -1) > data.day }

    /// Why this item cannot go up for Rip & Ship, or nil.
    func ripShipBlock(_ itemID: UUID) -> String? {
        if data.ripShip.ripShipClosed { return "Whatnot removed your Rip & Ship access." }
        guard !whatnotBanned else { return "Whatnot banned you until day \((data.ripShip.bannedUntil ?? 0) + 1)." }
        guard let item = data.sealed.first(where: { $0.id == itemID }) else { return "The product is gone." }
        if item.status != nil { return "It is not in hand." }
        if item.pc { return "It is in your PC." }
        if item.isKnownFake { return "It is resealed. Selling it is a scam." }
        if data.ripShip.orders.contains(where: { $0.itemID == itemID && !$0.refunded }) { return "It is already sold." }
        return nil
    }

    /// One buyer buys one whole sealed product. The money comes now. The item waits on the stream.
    @discardableResult
    func createRipShipOrder(itemID: UUID, price: Double, buyer: String, buyerContactID: String?, auction: Bool) -> RipShipOrder? {
        guard ripShipBlock(itemID) == nil, let i = data.sealed.firstIndex(where: { $0.id == itemID }) else { return nil }
        let item = data.sealed[i]
        let today = data.day
        let shipping = Balance.ripShipShipping(packs: item.packs)
        let fees = ripShipFees(price: price, shipping: shipping)
        let order = RipShipOrder(buyer: buyer, buyerContactID: buyerContactID, itemID: itemID, itemName: item.name,
                                 productID: item.productID, caseUnits: item.caseUnits, price: price, shipping: shipping,
                                 fees: fees, paid: item.paid, soldDay: today, auction: auction)
        data.sealed[i].status = .soldToViewer(orderID: order.id)
        data.ripShip.orders.append(order)
        // Read the gross into a local first, then write it.
        let gross = (data.ripShip.grossByDay[today] ?? 0) + price
        data.ripShip.grossByDay[today] = gross
        addLedger(order.net, .sale, "\(item.name) · Whatnot Rip & Ship · sold \(money(price)) to \(buyer)")
        // The default `offShelf: false` makes a hot unit that sells here count as a retail sale (the back-door check).
        // Remember the challenge credit of this sale, so a refund can take it back.
        let challengeBefore = data.shorts.series.first { $0.format == .pnl }?.cash
        addReceipt(name: item.name, venue: "Whatnot Rip & Ship", price: price, net: order.net, paid: item.paid, ids: [itemID])
        if let before = challengeBefore, let after = data.shorts.series.first(where: { $0.format == .pnl })?.cash, after != before,
           let k = data.ripShip.orders.firstIndex(where: { $0.id == order.id }) {
            data.ripShip.orders[k].challengeCredit = after - before
        }
        notePlatformSale(channel: .whatnot, price: price)
        noteDemand(item.name, channel: .whatnot)
        log("\(buyer) bought your \(item.name) for Rip & Ship: \(money(price)). You get \(money(order.net)) after Whatnot fees.", cash: order.net)
        save()
        return order
    }

    // MARK: - The rip

    /// Starts the rip of an order. A case opens into its units first, and the units keep the order status.
    /// Returns the items to rip. Empty when the order is not waiting.
    func beginRipShipRip(_ orderID: UUID, ripID: UUID) -> [SealedItem] {
        guard let k = data.ripShip.orders.firstIndex(where: { $0.id == orderID }),
              data.ripShip.orders[k].state == .sold, data.ripShip.orders[k].open, data.ripShip.orders[k].ripID == nil else { return [] }
        let itemID = data.ripShip.orders[k].itemID
        guard let item = data.sealed.first(where: { $0.id == itemID }) else { return [] }
        let ids = item.isCase ? openCase(itemID, status: .soldToViewer(orderID: orderID), forOrder: orderID, save: false) : [itemID]
        let set = Set(ids)
        let items = data.sealed.filter { set.contains($0.id) }
        // Look the order up again: `openCase` changed `data.sealed`.
        guard !items.isEmpty, let k2 = data.ripShip.orders.firstIndex(where: { $0.id == orderID }) else { return [] }
        data.ripShip.orders[k2].ripID = ripID
        data.ripShip.orders[k2].resealed = items.contains { $0.fake != nil }
        save()
        return items
    }

    /// Moves everything that came out of the order's product to the order. Safe to call more than once: it moves only
    /// what still carries the order, and it counts the palm swap once. Returns a line for the stream, or nil.
    @discardableResult
    func finishRipShip(_ orderID: UUID, save saves: Bool = true) -> String? {
        guard let k = data.ripShip.orders.firstIndex(where: { $0.id == orderID }), data.ripShip.orders[k].ripID != nil,
              data.ripShip.orders[k].open else { return nil }
        var order = data.ripShip.orders[k]
        let firstTime = order.state == .sold
        // Read every content into locals. Everything of this order carries its status or its `shipOrder`.
        func ofOrder(_ s: ItemStatus?) -> Bool { if case .soldToViewer(let id) = s { return id == orderID }; return false }
        let cards = data.raw.filter { ofOrder($0.status) }
        let bulk = data.bulk.filter { $0.shipOrder == orderID }
        let loose = data.sealed.filter { ofOrder($0.status) }
        let cardIDs = Set(cards.map(\.id)), bulkIDs = Set(bulk.map(\.id)), looseIDs = Set(loose.map(\.id))
        // The rip always stops on a resealed pack, so a resealed product shows on camera. The junk stays with the player.
        if order.resealed, firstTime {
            // The refund unlocks the junk and the closed packs, and it restores the cost of the opened packs.
            data.ripShip.orders[k].state = .ripped
            data.ripShip.orders[k].rippedDay = data.day
            let line = refundRipShipOrder(orderID, reason: .resealed)
            if saves { save() }
            return line
        }
        // Remove with closures that read only locals.
        data.raw.removeAll { cardIDs.contains($0.id) }
        data.bulk.removeAll { bulkIDs.contains($0.id) }
        data.sealed.removeAll { looseIDs.contains($0.id) }
        order.cards += cards.map { var c = $0; c.status = nil; return c }
        order.bulk += bulk.map { var b = $0; b.shipOrder = nil; return b }
        order.loose += loose.map { var s = $0; s.status = nil; return s }
        if firstTime {
            // A palmed hit becomes a bulk card in the buyer's order: the swap. Count it once.
            let filler = order.palmedCardIDs.count
            let palmed = Set(order.palmedCardIDs)
            let slug = data.raw.first { palmed.contains($0.id) }?.setSlug ?? cards.first?.setSlug ?? bulk.first?.setSlug
            if filler > 0, let slug, let print = SetLibrary.set(slug).prints.first(where: { $0.rarity == "Common" }) {
                order.bulk.append(BulkGroup(ripID: order.ripID ?? UUID(), setSlug: slug, date: .now,
                                            cards: Array(repeating: print, count: filler), day: data.day))
            }
            order.state = .ripped
            order.rippedDay = data.day
        }
        data.ripShip.orders[k] = order
        // The product was booked as sold, so nothing moves in the paid total when its contents ship.
        if saves { save() }
        return nil
    }

    // MARK: - One refund path

    /// The only function that pays a Rip & Ship buyer back. Returns the report line, or "" when it did nothing.
    /// - notOpened, resealed, seized: Whatnot cancels before shipping and returns its fees. The player pays back the net.
    /// - chargeback (day 7): the buyer takes the full price from the player's cash. The player keeps the product or
    ///   the cards, so the player has bought them at the sale price. A Whatnot strike follows.
    @discardableResult
    func refundRipShipOrder(_ orderID: UUID, reason: RipShipRefund = .notOpened) -> String {
        guard let k = data.ripShip.orders.firstIndex(where: { $0.id == orderID }), data.ripShip.orders[k].open else { return "" }
        data.ripShip.orders[k].refunded = true
        let order = data.ripShip.orders[k]
        let debit = reason == .chargeback ? order.price : order.net
        addLedger(-debit, .refund, "Whatnot refund · \(order.itemName) · \(order.buyer)")
        // A refunded sale does not count for the commission tier.
        let gross = max(0, (data.ripShip.grossByDay[order.soldDay] ?? 0) - order.price)
        data.ripShip.grossByDay[order.soldDay] = gross
        // An unopened product comes back to hand. Cards, bulk, and packs that a rip left with the order lose its lock.
        // The sale took the product cost out of the paid total. The cost of the packs that opened goes back into
        // `openedPaid`: the order's cost less the cost of every pack and unit that returns closed.
        var unlockedIDs: Set<UUID> = [order.itemID]
        var closedPaid = order.loose.reduce(0) { $0 + $1.paid }
        for i in data.sealed.indices {
            if case .soldToViewer(let id) = data.sealed[i].status, id == orderID {
                closedPaid += data.sealed[i].paid
                unlockedIDs.insert(data.sealed[i].id)
                data.sealed[i].status = nil
            }
        }
        unlockedIDs.formUnion(order.loose.map(\.id))
        data.openedPaid += max(0, order.paid - closedPaid)
        // A product that returns can sell again. Its hot allocation record must record that new sale, not the old one.
        for i in data.distributor.hotRecords.indices where unlockedIDs.contains(data.distributor.hotRecords[i].itemID) {
            data.distributor.hotRecords[i].outcome = nil
            data.distributor.hotRecords[i].outcomeDay = nil
        }
        takeBackChallengeCredit(orderID)
        for i in data.raw.indices {
            if case .soldToViewer(let id) = data.raw[i].status, id == orderID { data.raw[i].status = nil }
        }
        for i in data.bulk.indices where data.bulk[i].shipOrder == orderID { data.bulk[i].shipOrder = nil }
        // Ripped contents come back to Inventory. Packs that shipped unopened were a cost, so that cost goes back.
        if !order.cards.isEmpty || !order.bulk.isEmpty || !order.loose.isEmpty {
            data.raw += order.cards
            data.bulk += order.bulk
            data.sealed += order.loose
            data.ripShip.orders[k].cards = []
            data.ripShip.orders[k].bulk = []
            data.ripShip.orders[k].loose = []
        }
        switch reason {
        case .notOpened:
            if let act = order.lateActID { retireHiddenAct(act, force: true) }
            data.social.authenticity = max(0, data.social.authenticity - Balance.ripShipNotOpenedAuthenticity)
            return "You did not open \(order.buyer)'s \(order.itemName) on stream. Whatnot refunded them."
        case .resealed:
            data.social.authenticity = max(0, data.social.authenticity - Balance.resealedOnStreamAuthenticity)
            return "The \(order.itemName) was resealed, live on camera. Whatnot refunded \(order.buyer)."
        case .seized:
            if let act = order.lateActID { retireHiddenAct(act, force: true) }
            return "Whatnot refunded \(order.buyer). Police took the product."
        case .chargeback:
            // Retire the late act. When it had not come out, record a heavier act in its place.
            // When it had come out, its open callout goes on.
            var exposed = false
            if let act = order.lateActID { exposed = retireHiddenAct(act, force: true) }
            if !exposed {
                let act = recordHiddenAct(.unshippedOrder, weight: Balance.ripShipChargebackActWeight,
                                          note: "Whatnot took back \(order.buyer)'s money. The order never shipped.",
                                          contactID: order.buyerContactID, refund: order.price, sourceID: order.id)
                if let k2 = data.ripShip.orders.firstIndex(where: { $0.id == orderID }) { data.ripShip.orders[k2].lateActID = act }
            }
            return "Whatnot cancelled \(order.buyer)'s order and took back \(money(order.price)). You keep the cards. " + addWhatnotStrike()
        }
    }

    /// A refund takes back what the sale added to the P&L challenge cash. It takes it back once.
    private func takeBackChallengeCredit(_ orderID: UUID) {
        guard let k = data.ripShip.orders.firstIndex(where: { $0.id == orderID }),
              let credit = data.ripShip.orders[k].challengeCredit, credit != 0,
              let s = data.shorts.series.firstIndex(where: { $0.format == .pnl }) else { return }
        data.ripShip.orders[k].challengeCredit = nil
        data.shorts.series[s].cash -= credit
    }

    /// "Make it right" on a palm. The caller reads `palmRefundDue` first and pays after this call.
    /// Every palmed card that the player still holds leaves Inventory for the buyer. The order closes: it ships now
    /// with the cards, and it counts as refunded, so no later path can pay its price again.
    func returnPalmedCards(_ orderID: UUID) {
        guard let k = data.ripShip.orders.firstIndex(where: { $0.id == orderID }) else { return }
        let order = data.ripShip.orders[k]
        let ids = Set(order.palmedCardIDs)
        let kept = data.raw.filter { ids.contains($0.id) }.map { var c = $0; c.status = nil; return c }
        data.raw.removeAll { ids.contains($0.id) }                       // reads only a local
        let today = data.day
        data.ripShip.orders[k].cards += kept
        data.ripShip.orders[k].palmedCardIDs = []
        if !order.shipped { data.ripShip.orders[k].shipped = true; data.ripShip.orders[k].shippedDay = today }
        if !order.refunded {   // the palm make-right pays the price back, so the gross falls too
            let soldDay = order.soldDay
            let gross = max(0, (data.ripShip.grossByDay[soldDay] ?? 0) - order.price)
            data.ripShip.grossByDay[soldDay] = gross
        }
        data.ripShip.orders[k].refunded = true
        if !order.refunded { takeBackChallengeCredit(orderID) }
        for act in [order.lateActID, order.palmActID].compactMap({ $0 }) { retireHiddenAct(act, force: true) }
        log("You sent \(order.buyer) \(kept.count) palmed card\(kept.count == 1 ? "" : "s").")
    }

    /// What "make it right" on a palm must pay: the order price and the market of the palmed cards, or only the market
    /// of the cards when the buyer already got the price back.
    func palmRefundDue(_ orderID: UUID) -> Double {
        guard let o = data.ripShip.orders.first(where: { $0.id == orderID }) else { return 0 }
        return o.refunded ? o.palmedValue : o.price + o.palmedValue
    }

    // MARK: - Shipping, the deadline, the chargeback, and strikes

    var ordersToShip: [RipShipOrder] { data.ripShip.orders.filter { $0.state == .ripped && $0.open } }

    /// The last day that an order can ship in time.
    func shipByDay(_ order: RipShipOrder) -> Int { (order.rippedDay ?? order.soldDay) + Balance.ripShipDeadlineDays }

    /// The Whatnot strikes of the last 120 days.
    var recentStrikes: Int { data.ripShip.strikes.filter { $0 > data.day - Balance.whatnotStrikeCloseWindow }.count }

    /// Ships orders. A free action that costs 10 minutes for each order. Returns a message when it cannot ship.
    @discardableResult
    func shipRipShipOrders(_ ids: [UUID]) -> String? {
        let set = Set(ids)
        let open = data.ripShip.orders.filter { set.contains($0.id) && $0.state == .ripped && $0.open }
        guard !open.isEmpty else { return nil }
        guard spendHours(Double(open.count) * Balance.ripShipShipMinutes / 60) else { return "Not enough time today." }
        let today = data.day
        for order in open {
            guard let k = data.ripShip.orders.firstIndex(where: { $0.id == order.id }) else { continue }
            data.ripShip.orders[k].shipped = true
            data.ripShip.orders[k].shippedDay = today
            // The act retires when the order ships, even when it is already out.
            if let act = order.lateActID { retireHiddenAct(act, force: true) }
            if let id = order.buyerContactID { addPoints(id, Balance.ripShipShipPoints) }
            if order.price >= Balance.fairDealMinPrice { addReputation(Balance.onlineSaleReputation) }
        }
        log("Shipped \(open.count) Rip & Ship order\(open.count == 1 ? "" : "s").")
        save()
        return nil
    }

    /// A chargeback gives a strike. 2 in 60 days ban Whatnot streams for 4 weeks. 3 in 120 days end Rip & Ship.
    private func addWhatnotStrike() -> String {
        let today = data.day
        let strikes = data.ripShip.strikes.filter { $0 > today - Balance.whatnotStrikeCloseWindow } + [today]
        data.ripShip.strikes = strikes
        if strikes.count >= 3 {
            data.ripShip.ripShipClosed = true
            return "Third Whatnot strike in 120 days. Whatnot ended your Rip & Ship access for good. Normal streams stay."
        }
        if strikes.filter({ $0 > today - Balance.whatnotStrikeBanWindow }).count >= 2 {
            banFromWhatnot(days: Balance.whatnotStrikeBanDays, reason: "two strikes for orders that never shipped")
            return "Second Whatnot strike in 60 days. Whatnot banned you from streams for 4 weeks."
        }
        return "Whatnot gave you a strike. A second strike in 60 days brings a 4-week ban."
    }

    /// Whatnot bans the player from streams. A second ban extends to the later end day. Part C calls this too.
    /// No `save()`: End Day calls it, and End Day saves once at the end. A caller outside End Day saves.
    func banFromWhatnot(days: Int, reason: String) {
        let end = data.day + days
        let current = data.ripShip.bannedUntil ?? -1
        data.ripShip.bannedUntil = max(current, end)
        data.ripShip.banReason = reason
        log("Whatnot banned you from streams until day \(max(current, end) + 1) for \(reason).")
    }

    // MARK: - The buyer

    /// The buyer's reaction to the rip, and their luck for next time (a repeat buyer only).
    func buyerReaction(_ orderID: UUID) -> String? {
        guard let order = data.ripShip.orders.first(where: { $0.id == orderID }), order.price > 0 else { return nil }
        let luck = order.contentsValue / order.price
        if let id = order.buyerContactID, let i = data.contacts.firstIndex(where: { $0.id == id }) { data.contacts[i].ripShipLuck = luck }
        if luck >= 1.5 { return "\(order.buyer): LET'S GO" }
        if luck < 0.5 { return "\(order.buyer): rip..." }
        return nil
    }

    // MARK: - Palm the hit

    #if DEBUG
    /// Tests only: forces the palm roll.
    static var forcePalmCaught: Bool?
    #endif

    /// The player swapped a big hit off camera. The card stays with the player, and the buyer gets a bulk card in its
    /// place. The camera catches it half of the time. A catch settles at End Day. A miss is a secret that can come out later.
    func notePalm(orderID: UUID, ripID: UUID, print: CardPrint, value: Double) {
        guard let k = data.ripShip.orders.firstIndex(where: { $0.id == orderID }) else { return }
        #if DEBUG
        let caught = GameStore.forcePalmCaught ?? (Double.random(in: 0..<1) < Balance.palmFoundChance)
        #else
        let caught = Double.random(in: 0..<1) < Balance.palmFoundChance
        #endif
        // The hit is in Raw with the order status. Take it off the order: it stays with the player.
        let palmed = Set(data.ripShip.orders[k].palmedCardIDs)
        guard let c = data.raw.firstIndex(where: {
            if case .soldToViewer(let id) = $0.status, id == orderID, $0.ripID == ripID, !palmed.contains($0.id),
               $0.print.num == print.num, $0.print.variant == print.variant, $0.print.name == print.name { return true }
            return false
        }) else { return }
        data.raw[c].status = nil
        let cardID = data.raw[c].id
        data.ripShip.orders[k].palmedCardIDs.append(cardID)
        data.ripShip.orders[k].palmedValue += value
        if caught { data.ripShip.orders[k].palmCaught = true }
        let order = data.ripShip.orders[k]
        if caught {
            // The camera caught a palm: the forced callout replaces any secret act of this order. One order never has both.
            if let act = order.palmActID {
                retireHiddenAct(act, force: true)
                if let k2 = data.ripShip.orders.firstIndex(where: { $0.id == orderID }) { data.ripShip.orders[k2].palmActID = nil }
            }
        } else if !order.palmCaught {
            // A secret that can come out later. "Make it right" pays the price plus the cards. A second palm in the same
            // order grows the refund of the same act.
            let refund = order.price + order.palmedValue
            if let act = order.palmActID, let i = data.hiddenActs.firstIndex(where: { $0.id == act }) {
                data.hiddenActs[i].refund = refund
            } else {
                let act = recordHiddenAct(.palmedHit, weight: 1.5, note: "Palmed \(print.name) from \(order.buyer)'s \(order.itemName)",
                                          witnesses: currentStreamPeakViewers, contactID: order.buyerContactID,
                                          refund: refund, sourceID: order.id)
                if let k2 = data.ripShip.orders.firstIndex(where: { $0.id == orderID }) { data.ripShip.orders[k2].palmActID = act }
            }
        }
        save()
    }

    /// The consequences of a palm that the camera caught. A caught palm records no hidden act: one act gives one callout.
    private func settlePalm(_ orderID: UUID) -> [String] {
        guard let k = data.ripShip.orders.firstIndex(where: { $0.id == orderID }) else { return [] }
        data.ripShip.orders[k].palmSettled = true
        let order = data.ripShip.orders[k]
        addReputation(-Balance.palmFoundReputation)
        banFromWhatnot(days: Balance.palmBanDays, reason: "swapping a viewer's hit")
        var lines = ["Viewers clipped you palming a hit from \(order.buyer)'s \(order.itemName). Reputation −\(Balance.palmFoundReputation). Whatnot banned you for 8 weeks."]
        // A forced callout opens past the cap.
        if let line = startCallout(.fairness, truth: true, receipts: true, heat: Balance.palmCalloutHeat, accuser: .person(order.buyer),
                                   text: "\(order.buyer) posted a clip that shows you swapping their hit off camera.",
                                   force: true, actKind: .palmedHit, sourceID: order.id,
                                   contactID: order.buyerContactID, refund: order.price + order.palmedValue) {
            lines.append(line)
        }
        return lines
    }

    // MARK: - End Day

    /// End Day: finish or refund a stream order that never settled, settle a caught palm, check ship deadlines, and prune.
    func ripShipEndDay() -> [String] {
        var lines: [String] = []
        let today = data.day
        // Work from a copy. Each step looks its order up again.
        let snapshot = data.ripShip.orders
        // 1. An order that never finished on its stream (the app closed): finish a started rip, refund an unstarted one.
        for o in snapshot where o.state == .sold && o.open && o.soldDay < today {
            if o.ripID != nil {
                if let line = finishRipShip(o.id, save: false) { lines.append(line) }
            } else {
                lines.append(refundRipShipOrder(o.id, reason: .notOpened))
            }
        }
        // 2. A palm that the camera caught.
        for o in snapshot where o.palmCaught && !o.palmSettled { lines += settlePalm(o.id) }
        // 3. Ship deadlines. Part C rolls the discovery of `unshippedOrder`. Part B records it once.
        for o in data.ripShip.orders where o.state == .ripped && o.open {
            let waited = today - (o.rippedDay ?? o.soldDay)
            if waited > Balance.ripShipDeadlineDays, o.lateActID == nil {
                let act = recordHiddenAct(.unshippedOrder, weight: 1.0, note: "\(o.buyer)'s \(o.itemName) is past its ship date",
                                          contactID: o.buyerContactID, refund: o.price, sourceID: o.id)
                if let k = data.ripShip.orders.firstIndex(where: { $0.id == o.id }) { data.ripShip.orders[k].lateActID = act }
                lines.append("\(o.buyer)'s Rip & Ship order is late. Ship it today.")
            }
            if waited >= Balance.ripShipCancelDays { lines.append(refundRipShipOrder(o.id, reason: .chargeback)) }
        }
        // 4. The ban ends.
        if let until = data.ripShip.bannedUntil, until == today { lines.append("Your Whatnot ban is over.") }
        // 5. Prune. Read the cutoffs into locals: a closure on `data.ripShip` must not read `data`.
        let cutoff = today - Balance.ripShipKeepDays
        // An order stays while an act of it is still in the log: Part C needs the order to settle that act.
        let liveActs = Set(data.hiddenActs.map(\.id))
        data.ripShip.orders.removeAll {
            !$0.open && $0.soldDay < cutoff && !($0.lateActID.map(liveActs.contains) ?? false) && !($0.palmActID.map(liveActs.contains) ?? false)
        }
        let since = today - 27
        let kept = data.ripShip.grossByDay.filter { $0.key >= since }
        data.ripShip.grossByDay = kept
        return lines.filter { !$0.isEmpty }
    }

    /// The calendar entry for the ship deadline of open orders.
    func ripShipCalendarEntries(day: Int) -> [CalendarEntry] {
        let due = ordersToShip.filter { shipByDay($0) == day }.count
        guard due > 0 else { return [] }
        return [CalendarEntry(kind: .delivery, title: "Ship Rip & Ship orders", detail: "\(due) due")]
    }
}
