import Foundation

// Auctions (docs/36-auctions.md). Two parts:
// - Live bids on the player's own eBay auctions. The final price is rolled when the player lists, with the same odds
//   as before. Each day shows a current bid that climbs toward it. Most bids come near the end, as on real eBay.
// - Auctions where the player bids to buy. eBay runs lots of 1 to 7 days all the time. The auction houses show a
//   catalog of big slabs before each catalog day. The player sets a top bid, and the venue bids for the player up to
//   it (proxy bidding). Rival bidders hold a hidden top bid, and on eBay they snipe on the last day.

/// Where an auction lot is sold.
enum AuctionVenue: Codable, Hashable {
    case ebay
    case house(AuctionHouse)

    var name: String {
        switch self {
        case .ebay: "eBay"
        case .house(let h): h.rawValue
        }
    }

    /// The buyer's premium on top of the hammer. eBay has none.
    var buyerPremium: Double {
        switch self {
        case .ebay: 0
        case .house(let h): h.buyerPremium
        }
    }

    /// The days from the win to the item in hand.
    var deliveryDays: Int {
        switch self {
        case .ebay: Balance.lotEbayDelivery
        case .house: Balance.lotHouseDelivery
        }
    }
}

/// One lot that the player can bid on.
struct AuctionLot: Codable, Identifiable, Hashable {
    var id = UUID()
    let venue: AuctionVenue
    let goods: VendorGoods
    /// The market value of the item, for reference.
    let market: Double
    let startDay: Int
    /// The day the lot closes. End Day on that day decides it.
    let endDay: Int
    /// The opening bid.
    let opening: Double
    /// Hidden: the most that the rival bidders bid (the hammer, without the premium). Equal to the opening when no
    /// rival bids.
    let rivalMax: Double
    /// Hidden: an eBay lot can be a fake (docs/14-counterfeit-risk.md). A house checks every slab, so its lots are real.
    var fake: FakeTier?
    /// The player's top bid. Nil: the player did not bid.
    var playerMax: Double?
    /// An eBay Buy It Now price. It goes away with the first bid. Nil: no Buy It Now.
    var buyNow: Double?
    /// The player's look by eye caught a fake (docs/14-counterfeit-risk.md).
    var looksOff: Bool?
    /// The player led at the last End Day, so the morning report can say when another bidder passes them.
    var leading: Bool?

    var hasRival: Bool { rivalMax > opening }

    var name: String { VendorItem(goods: goods, price: opening, market: market).name }

    var isSealed: Bool {
        if case .sealed = goods { return true }
        return false
    }
}

/// What the player sees of a lot today.
struct LotView {
    /// The current bid: the price that the leader pays now.
    let bid: Double
    let bids: Int
    /// True when the player is the high bidder now.
    let playerLeads: Bool
    let daysLeft: Int
}

/// What the player sees of one of their own eBay auctions today.
struct OwnAuctionView {
    /// The current high bid. Nil: no bids yet.
    let bid: Double?
    let bids: Int
    let watchers: Int
    let daysLeft: Int
}

extension Balance {
    /// eBay lots open at one time, and their length in days.
    static let lotEbayCount = 10
    static let lotEbayDays = 1...7
    /// The share of eBay lots with no rival bidder: the player can win at the opening bid.
    static let lotNoRivalChance = 0.08
    /// The slabs in one house catalog, and the days before the catalog day that the catalog opens.
    static let lotHouseCount = 5...8
    static let lotHousePreviewDays = 14
    static let lotHouseMinValue = 1_000.0
    static let lotHouseSealedShare = 0.4
    static let lotEbaySealedMax = 2_500.0
    static let lotEbayDelivery = 3
    static let lotHouseDelivery = 7
    /// The share of eBay lots with Buy It Now, and its price as a share of market.
    static let lotBuyNowChance = 0.25
    static let lotBuyNowRange = 1.0...1.15
    /// Reputation lost when the player wins a lot and cannot pay.
    static let lotNonPayReputation = -5
}

@MainActor
extension GameStore {
    // MARK: - Live bids on the player's own eBay auctions

    /// The final price of an eBay auction, or 0 when it ends with no sale. The same odds as `rollSale` had at the end.
    func rollAuctionFinal(market rawMarket: Double, sealed: Bool, name: String, productID: String?) -> Double {
        let demand = channelDemand(.ebayAuction) * itemDemand(name) * PriceCycle.seasonDemand(sealed: sealed)
            * flipperSaleFactor(productID, channel: .ebayAuction)
        let market = rawMarket * itemPriceFactor(name)
        // A season can lift demand above 1. The no-sale chance never falls below its 5% floor.
        if Double.random(in: 0..<1) < 0.05 + max(0, 1 - demand) * 0.6 { return 0 }
        let spread = (Double.random(in: -1...1) + Double.random(in: -1...1)) / 2 * 0.35
        return max(0.99, (market * (0.95 + spread) * 100).rounded() / 100)
    }

    /// The auction listing with its final price rolled. `listing.price` is the expected price, the market.
    func withAuctionFinal(_ listing: Listing, sealed: Bool, name: String, productID: String?) -> Listing {
        guard listing.channel == .ebayAuction, listing.auctionFinal == nil else { return listing }
        var l = listing
        let final = rollAuctionFinal(market: listing.price, sealed: sealed, name: name, productID: productID)
        // The bids never reach a starting bid above what the buyers pay: no sale.
        l.auctionFinal = final >= (listing.auctionStart ?? 0) ? final : 0
        return l
    }

    /// An auction listing of an item with its final price rolled. Other listings stay as they are.
    func auctionListing(_ listing: Listing, id: UUID) -> Listing {
        guard listing.channel == .ebayAuction else { return listing }
        if let card = card(id) { return withAuctionFinal(listing, sealed: false, name: card.print.name, productID: nil) }
        if let item = data.sealed.first(where: { $0.id == id }) {
            return withAuctionFinal(listing, sealed: true, name: item.name, productID: item.productID)
        }
        return listing
    }

    /// The current bid on one of the player's eBay auctions. Bids come in from the first night: most of them early, and
    /// the price climbs to about 70% of the final. At the close it jumps to the final, as with a real snipe.
    func ownAuctionView(_ listing: Listing, id: UUID) -> OwnAuctionView? {
        guard let end = listing.auctionEndDay else { return nil }
        // The auction sells at the End Day of its last day (end − 1). That day shows "ends tonight" and 70% of the final.
        let length = max(1, end - listing.dayListed)
        let elapsed = min(length, max(0, data.day - listing.dayListed))
        let p = min(1, Double(elapsed + 1) / Double(length))
        let left = max(0, end - data.day - 1)
        var seed = SeededRandom(seed: Self.stableSeed(id))
        let watchers = Int(Double(seed.int(2...9)) * (0.3 + p) + log10(max(1, listing.price)) * 3)
        guard let final = listing.auctionFinal else {
            return OwnAuctionView(bid: nil, bids: 0, watchers: watchers, daysLeft: left)
        }
        // No sale: nobody bids.
        guard final > 0 else { return OwnAuctionView(bid: nil, bids: 0, watchers: watchers / 2, daysLeft: left) }
        let totalBids = seed.int(3...8) + Int(log10(max(1, final)) * 3)
        // After the first night there is always a bid.
        let bids = elapsed == 0 ? 0 : max(1, Int((Double(totalBids) * pow(p, 0.6)).rounded()))
        guard bids > 0 else { return OwnAuctionView(bid: nil, bids: 0, watchers: watchers, daysLeft: left) }
        let bid = max(listing.auctionStart ?? 0.99, (final * (0.3 + 0.4 * p) * 100).rounded() / 100)
        return OwnAuctionView(bid: bid, bids: bids, watchers: watchers, daysLeft: left)
    }

    /// The player's running eBay auctions: name and listing. Cards, slabs, sealed, and the online listings of the store.
    func ownAuctions() -> [(id: UUID, name: String, listing: Listing)] {
        var out: [(id: UUID, name: String, listing: Listing)] = []
        for c in data.raw + data.slabs {
            let name = "\(c.print.name)\(c.grade.map { " \($0.label)" } ?? "")"
            if case .listed(let l) = c.status, l.auctionEndDay != nil { out.append((c.id, name, l)) }
            if let l = c.onlineListing, l.auctionEndDay != nil { out.append((c.id, name, l)) }
        }
        for s in data.sealed {
            if case .listed(let l) = s.status, l.auctionEndDay != nil { out.append((s.id, s.name, l)) }
            if let l = s.onlineListing, l.auctionEndDay != nil { out.append((s.id, s.name, l)) }
        }
        return out
    }

    /// The morning news of the player's eBay auctions: each one with bids, or a summary when there are many.
    func ownAuctionsEndDay() -> [String] {
        let running = ownAuctions().compactMap { a -> (String, OwnAuctionView)? in
            guard let view = ownAuctionView(a.listing, id: a.id), view.bids > 0, let bid = view.bid, bid > 0 else { return nil }
            return (a.name, view)
        }
        guard !running.isEmpty else { return [] }
        func ends(_ d: Int) -> String { d <= 0 ? "ends tonight" : "\(d) day\(d == 1 ? "" : "s") left" }
        if running.count > 3 {
            let bids = running.reduce(0) { $0 + $1.1.bids }
            let top = running.max { ($0.1.bid ?? 0) < ($1.1.bid ?? 0) }!
            return ["Your \(running.count) eBay auctions have \(bids) bids. Top: \(top.0) at \(money(top.1.bid ?? 0))."]
        }
        return running.map { name, v in
            "eBay auction, \(name): \(v.bids) bid\(v.bids == 1 ? "" : "s"), now \(money(v.bid ?? 0)), \(v.watchers) watching, \(ends(v.daysLeft))."
        }
    }

    /// An auction from before the live bids has no final price. It gets one now, so it shows bids too.
    func backfillAuctionFinals() {
        for i in data.raw.indices {
            if case .listed(let l) = data.raw[i].status, l.auctionEndDay != nil, l.auctionFinal == nil {
                data.raw[i].status = .listed(auctionListing(l, id: data.raw[i].id))
            }
        }
        for i in data.slabs.indices {
            if case .listed(let l) = data.slabs[i].status, l.auctionEndDay != nil, l.auctionFinal == nil {
                data.slabs[i].status = .listed(auctionListing(l, id: data.slabs[i].id))
            }
        }
        for i in data.sealed.indices {
            if case .listed(let l) = data.sealed[i].status, l.auctionEndDay != nil, l.auctionFinal == nil {
                data.sealed[i].status = .listed(auctionListing(l, id: data.sealed[i].id))
            }
        }
    }

    /// A seed that stays the same between launches. `hashValue` changes on each launch.
    static func stableSeed(_ id: UUID) -> UInt64 {
        var hash: UInt64 = 1469598103934665603
        for b in id.uuidString.utf8 { hash = (hash ^ UInt64(b)) &* 1099511628211 }
        return hash | 1
    }

    // MARK: - Lots to buy

    var openLots: [AuctionLot] { data.auctionLots.filter { $0.endDay >= data.day } }
    var ebayLots: [AuctionLot] { openLots.filter { $0.venue == .ebay }.sorted { $0.endDay < $1.endDay } }

    /// The house lots, by house, with the catalog day of each.
    func houseLots(_ house: AuctionHouse) -> [AuctionLot] {
        openLots.filter { $0.venue == .house(house) }.sorted { $0.market > $1.market }
    }

    /// The bid step at a price, as on eBay: bigger prices move in bigger steps.
    static func bidIncrement(_ price: Double) -> Double {
        switch price {
        case ..<5: 0.25
        case ..<25: 0.5
        case ..<100: 1
        case ..<250: 2.5
        case ..<1_000: 5
        case ..<5_000: 25
        case ..<25_000: 100
        default: 250
        }
    }

    /// The rivals' bid today. On eBay it climbs slowly and the rest comes as a snipe on the last day. At a house the
    /// floor bids climb toward the catalog day.
    private func rivalShown(_ lot: AuctionLot) -> Double {
        // The rivals bid from the first night. On the day a lot opens, the bid is the opening bid.
        guard lot.hasRival, data.day > lot.startDay else { return lot.opening }
        let length = max(1, lot.endDay - lot.startDay)
        let p = Double(min(length, max(0, data.day - lot.startDay))) / Double(length)
        let share = lot.venue == .ebay ? 0.3 + 0.45 * p * p : 0.5 + 0.35 * p
        return max(lot.opening, ShowSession.round(lot.rivalMax * share))
    }

    func lotView(_ lot: AuctionLot) -> LotView {
        let rival = rivalShown(lot)
        var seed = SeededRandom(seed: Self.stableSeed(lot.id))
        let length = max(1, lot.endDay - lot.startDay)
        let p = Double(min(length, max(0, data.day - lot.startDay))) / Double(length)
        // A rival bid above the opening bid is at least one bid.
        var bids = lot.hasRival && data.day > lot.startDay ? max(rival > lot.opening ? 1 : 0, Int((Double(seed.int(2...9)) * (0.2 + p)).rounded())) : 0
        let daysLeft = lot.endDay - data.day
        guard let mine = lot.playerMax else { return LotView(bid: rival, bids: bids, playerLeads: false, daysLeft: daysLeft) }
        bids += 1
        if mine > rival || !lot.hasRival {
            let bid = lot.hasRival ? min(mine, rival + Self.bidIncrement(rival)) : lot.opening
            return LotView(bid: bid, bids: bids, playerLeads: true, daysLeft: daysLeft)
        }
        return LotView(bid: min(rival, mine + Self.bidIncrement(mine)), bids: bids, playerLeads: false, daysLeft: daysLeft)
    }

    /// The lowest top bid the player can place now.
    func minimumBid(_ lot: AuctionLot) -> Double {
        let view = lotView(lot)
        if view.playerLeads, let mine = lot.playerMax { return mine + Self.bidIncrement(mine) }
        if lot.playerMax == nil, view.bids == 0 { return lot.opening }
        return view.bid + Self.bidIncrement(view.bid)
    }

    /// What the player pays for a lot at a hammer price: the premium and the shipping.
    func lotTotal(_ lot: AuctionLot, hammer: Double) -> Double {
        let shipping = lot.venue == .ebay ? Balance.shippingCost(for: hammer, sealed: lot.isSealed) : Balance.auctionShipping
        return ((hammer * (1 + lot.venue.buyerPremium) + shipping) * 100).rounded() / 100
    }

    /// Why the player cannot place this top bid, or nil.
    func bidBlock(_ lot: AuctionLot, max: Double) -> String? {
        let restore = payAsBuyer()
        defer { restore() }
        if lot.endDay < data.day { return "The auction is over." }
        let least = minimumBid(lot)
        if max < least - 0.004 { return "The lowest bid you can place is \(money(least))." }
        let total = lotTotal(lot, hammer: max)
        let free = cash - committedBids(except: lot.id)
        if total > free {
            let held = cash - free
            return "If you win at \(money(max)), you pay \(money(total)). You have \(money(cash))\(held > 0 ? ", and your other top bids hold \(money(held))" : "")."
        }
        return nil
    }

    /// The cash that the player's other top bids can take: the total at each top bid of each open lot.
    func committedBids(except id: UUID? = nil) -> Double {
        openLots.filter { $0.id != id }.reduce(0) { sum, lot in sum + (lot.playerMax.map { lotTotal(lot, hammer: $0) } ?? 0) }
    }

    /// True while the lot offers Buy It Now: an eBay lot with no bid yet.
    func canBuyNow(_ lot: AuctionLot) -> Bool {
        let restore = payAsBuyer()
        defer { restore() }
        guard let price = lot.buyNow, lot.endDay >= data.day, lot.playerMax == nil else { return false }
        return lotView(lot).bids == 0 && lotTotal(lot, hammer: price) <= cash - committedBids(except: lot.id)
    }

    /// Buys a lot at its Buy It Now price. The lot closes.
    @discardableResult
    func buyNow(_ lotID: UUID) -> Bool {
        let restore = payAsBuyer()
        defer { restore() }
        guard let lot = data.auctionLots.first(where: { $0.id == lotID }), let price = lot.buyNow, canBuyNow(lot) else { return false }
        log(deliver(lot, hammer: price, how: "Bought \(lot.name) on eBay with Buy It Now"), cash: -lotTotal(lot, hammer: price))
        data.auctionLots.removeAll { $0.id == lotID }
        save()
        return true
    }

    /// Sets the player's top bid on a lot. A top bid can only go up.
    @discardableResult
    func placeBid(_ lotID: UUID, max: Double) -> Bool {
        let restore = payAsBuyer()
        defer { restore() }
        guard let i = data.auctionLots.firstIndex(where: { $0.id == lotID }), bidBlock(data.auctionLots[i], max: max) == nil else { return false }
        data.auctionLots[i].playerMax = (max * 100).rounded() / 100
        let lot = data.auctionLots[i]
        let view = lotView(lot)
        data.auctionLots[i].leading = view.playerLeads
        log(view.playerLeads ? "Bid up to \(money(max)) on \(lot.name) at \(lot.venue.name). You lead at \(money(view.bid))."
                             : "Bid up to \(money(max)) on \(lot.name) at \(lot.venue.name). Another bidder still leads at \(money(view.bid)).")
        save()
        return true
    }

    // MARK: - End Day

    /// Decides the lots that close today, then opens new eBay lots and the house catalogs.
    func auctionLotsEndDay() -> [String] {
        let today = data.day - 1
        var lines: [String] = []
        for lot in data.auctionLots where lot.endDay <= today {
            if let line = closeLot(lot) { lines.append(line) }
        }
        data.auctionLots.removeAll { $0.endDay <= today }
        // Tell the player when another bidder passed them.
        for i in data.auctionLots.indices where data.auctionLots[i].playerMax != nil {
            let lot = data.auctionLots[i]
            let view = lotView(lot)
            if lot.leading == true, !view.playerLeads {
                lines.append("You were outbid on \(lot.name) at \(lot.venue.name). The bid is \(money(view.bid)), and it ends \(view.daysLeft == 0 ? "tonight" : "in \(view.daysLeft) day\(view.daysLeft == 1 ? "" : "s")").")
            }
            data.auctionLots[i].leading = view.playerLeads
        }
        refreshLots()
        return lines
    }

    /// The player wins when their top bid beats the rivals' top bid by a step. The price is one step over the rivals,
    /// or the opening bid when no rival bid.
    private func closeLot(_ lot: AuctionLot) -> String? {
        let restore = payAsBuyer()
        defer { restore() }
        guard let mine = lot.playerMax else { return nil }
        let step = Self.bidIncrement(lot.rivalMax)
        // The higher top bid wins. On a tie, the rival wins: the rival bid first.
        guard !lot.hasRival || mine > lot.rivalMax else {
            return "You were outbid on \(lot.name) at \(lot.venue.name). It sold for \(money(min(lot.rivalMax, mine + Self.bidIncrement(mine))))."
        }
        let hammer = lot.hasRival ? min(mine, lot.rivalMax + step) : lot.opening
        let total = lotTotal(lot, hammer: hammer)
        guard canAfford(total) else {
            addReputation(Balance.lotNonPayReputation)
            return "You won \(lot.name) at \(lot.venue.name) for \(money(hammer)), but you could not pay \(money(total)). The sale is off, and your reputation drops."
        }
        return deliver(lot, hammer: hammer, how: "You won \(lot.name) at \(lot.venue.name)")
    }

    /// Pays for a lot and puts the item on its way. Returns the line for the report.
    private func deliver(_ lot: AuctionLot, hammer: Double, how: String) -> String {
        let total = lotTotal(lot, hammer: hammer)
        // A fake that the player's eye caught is a known fake when it comes.
        let known: Bool? = lot.looksOff == true && lot.fake != nil ? true : nil
        addLedger(-total, lot.isSealed ? .sealed : .singles, "\(lot.name) · \(lot.venue.name) auction")
        let arriving = ItemStatus.arriving(daysLeft: lot.venue.deliveryDays, from: lot.venue.name)
        switch lot.goods {
        case .single(let print, let slug, let condition):
            var card = OwnedCard(print: print, setSlug: slug, acquired: .now, paid: total, ripID: nil, condition: condition,
                                 acquiredDay: data.day)
            card.fake = lot.fake
            card.fakeKnown = known
            card.status = arriving
            data.raw.append(card)
        case .slab(let print, let slug, let grade):
            var card = OwnedCard(print: print, setSlug: slug, acquired: .now, paid: total, ripID: nil, grade: grade,
                                 acquiredDay: data.day)
            card.fake = lot.fake
            card.fakeKnown = known
            card.status = arriving
            data.slabs.append(card)
        case .sealed(let product):
            var item = SealedItem(setSlug: product.homeSlug, name: product.name, packs: product.packs, paid: total,
                                  acquired: .now, source: "\(lot.venue.name) auction", productID: product.id, acquiredDay: data.day)
            item.fake = lot.fake
            item.fakeKnown = known
            item.contents = BoxContents.draw(product, key: lot.id.uuidString)
            item.status = arriving
            data.sealed.append(item)
        case .mystery:
            break
        }
        let premium = lot.venue.buyerPremium > 0 ? ", with the \(Int((lot.venue.buyerPremium * 100).rounded()))% buyer's premium and shipping" : ", with shipping"
        return "\(how) for \(money(hammer)). You paid \(money(total))\(premium). It arrives in \(lot.venue.deliveryDays) days."
    }

    /// Fills eBay up to its lot count, and opens each house catalog in its preview window. Safe to call any time.
    func refreshLots() {
        let open = data.auctionLots.filter { $0.venue == .ebay && $0.endDay >= data.day }.count
        for _ in 0..<max(0, Balance.lotEbayCount - open) {
            if let lot = makeEbayLot() { data.auctionLots.append(lot) }
        }
        for house in AuctionHouse.allCases {
            let day = nextCatalogDay(house)
            guard day - data.day <= Balance.lotHousePreviewDays,
                  !data.auctionLots.contains(where: { $0.venue == .house(house) && $0.endDay == day }) else { continue }
            let count = Int.random(in: Balance.lotHouseCount)
            for _ in 0..<count {
                if let lot = makeHouseLot(house, day: day) { data.auctionLots.append(lot) }
            }
        }
    }

    /// The calendar entries for a day: the player's bids that close, and the house auctions with a catalog.
    func lotEntries(day: Int) -> [CalendarEntry] {
        var out: [CalendarEntry] = []
        let mine = openLots.filter { $0.playerMax != nil && $0.endDay == day }
        if !mine.isEmpty {
            out.append(CalendarEntry(kind: .auction, title: "Your bids close",
                                     detail: mine.prefix(2).map(\.name).joined(separator: ", ") + (mine.count > 2 ? " and \(mine.count - 2) more" : "")))
        }
        for house in AuctionHouse.allCases where openLots.contains(where: { $0.venue == .house(house) && $0.endDay == day }) {
            out.append(CalendarEntry(kind: .auction, title: "\(house.rawValue) catalog auction", detail: "Bid in Auctions"))
        }
        return out
    }

    /// The house's next catalog day, today or later.
    func nextCatalogDay(_ house: AuctionHouse) -> Int {
        let cycle = Balance.auctionCycleDays
        let base = data.day - data.day % cycle + house.catalogOffset
        return base >= data.day ? base : base + cycle
    }

    private func randomPrint(minMarket: Double, maxMarket: Double) -> (CardPrint, String)? {
        let sets = Balance.showSets
        for _ in 0..<12 {
            guard let slug = sets.randomElement() else { return nil }
            let prints = SetLibrary.set(slug).prints.filter {
                let m = $0.market ?? 0
                return m >= minMarket && m <= maxMarket && !["Common", "Uncommon"].contains($0.rarity)
            }
            if let p = prints.randomElement() { return (p, slug) }
        }
        return nil
    }

    private func makeEbayLot() -> AuctionLot? {
        let roll = Double.random(in: 0..<1)
        var goods: VendorGoods?
        var market = 0.0
        var slug: String?
        // About a third of eBay lots are sealed product: packs, boxes, and old sealed up to a few thousand dollars.
        if roll < 0.33, let (p, s) = randomPrint(minMarket: 8, maxMarket: 400) {
            let condition = Condition.secondHand()
            goods = .single(p, slug: s, condition: condition)
            market = (p.market ?? 0) * condition.wear.valueFactor
            slug = s
        } else if roll < 0.65, let (p, s) = randomPrint(minMarket: 4, maxMarket: 600) {
            let grades: [Double] = [7, 8, 8, 9, 9, 9, 10, 10]
            let company: GradingCompany = Double.random(in: 0..<1) < 0.65 ? .psa : (Bool.random() ? .cgc : .bgs)
            let grade = SlabGrade(company: company, grade: grades.randomElement() ?? 9)
            goods = .slab(p, slug: s, grade: grade)
            market = OwnedCard(print: p, setSlug: s, acquired: .now, paid: nil, ripID: nil, grade: grade).market
            slug = s
        } else {
            let sealed = SetLibrary.catalog.filter { $0.market >= 20 && $0.market <= Balance.lotEbaySealedMax }
            if let p = sealed.randomElement() {
                goods = .sealed(p)
                market = p.market
                slug = p.homeSlug
            }
        }
        guard let goods, market >= 5 else { return nil }
        let opening = max(0.99, ShowSession.round(market * Double.random(in: 0.3...0.6)))
        let noRival = Double.random(in: 0..<1) < Balance.lotNoRivalChance
        let spread = (Double.random(in: -1...1) + Double.random(in: -1...1)) / 2 * 0.35
        let rival = noRival ? opening : max(opening * 1.05, market * (0.95 + spread) * PriceCycle.seasonDemand(sealed: goods.isSealedGoods))
        let sealed = goods.isSealedGoods
        var lot = AuctionLot(venue: .ebay, goods: goods, market: market, startDay: data.day, endDay: data.day + Int.random(in: Balance.lotEbayDays),
                             opening: opening, rivalMax: ShowSession.round(rival),
                             fake: Counterfeit.roll(source: .ebay, sealed: sealed, slug: slug, market: market))
        if Double.random(in: 0..<1) < Balance.lotBuyNowChance {
            lot.buyNow = ShowSession.round(market * Double.random(in: Balance.lotBuyNowRange))
        }
        if let fake = lot.fake, Counterfeit.eyeballCatches(fake) { lot.looksOff = true }
        return lot
    }

    private func makeHouseLot(_ house: AuctionHouse, day: Int) -> AuctionLot? {
        // About 40% of a catalog is high-end sealed product: vintage booster boxes, ETBs, and collections.
        if Double.random(in: 0..<1) < Balance.lotHouseSealedShare,
           let p = SetLibrary.catalog.filter({ $0.market >= Balance.lotHouseMinValue }).randomElement() {
            let spread = (Double.random(in: -1...1) + Double.random(in: -1...1)) / 2 * Balance.auctionBidSpread
            let rivalTotal = p.market * house.bidderStrength * (1 + spread) * PriceCycle.seasonDemand(sealed: true)
            let opening = ShowSession.round(p.market * 0.5)
            return AuctionLot(venue: .house(house), goods: .sealed(p), market: p.market, startDay: data.day, endDay: day,
                              opening: opening, rivalMax: max(opening * 1.05, ShowSession.round(rivalTotal / (1 + house.buyerPremium))))
        }
        for _ in 0..<20 {
            guard let (p, s) = randomPrint(minMarket: 40, maxMarket: .infinity) else { return nil }
            let grade = SlabGrade(company: Double.random(in: 0..<1) < 0.75 ? .psa : .bgs, grade: [8, 9, 9, 10, 10].randomElement() ?? 9)
            let market = OwnedCard(print: p, setSlug: s, acquired: .now, paid: nil, ripID: nil, grade: grade).market
            guard market >= Balance.lotHouseMinValue else { continue }
            let spread = (Double.random(in: -1...1) + Double.random(in: -1...1)) / 2 * Balance.auctionBidSpread
            let rivalTotal = market * house.bidderStrength * (1 + spread) * PriceCycle.seasonDemand(sealed: false)
            let opening = ShowSession.round(market * 0.5)
            return AuctionLot(venue: .house(house), goods: .slab(p, slug: s, grade: grade), market: market, startDay: data.day, endDay: day,
                              opening: opening, rivalMax: max(opening * 1.05, ShowSession.round(rivalTotal / (1 + house.buyerPremium))))
        }
        return nil
    }
}

extension VendorGoods {
    var isSealedGoods: Bool {
        if case .sealed = self { return true }
        return false
    }
}

@MainActor
extension GameStore {
    /// The player's auctions in one line, for the Auctions row: items up for auction, open bids, and bids outbid.
    var auctionSummary: String {
        func atAuction(_ status: ItemStatus?) -> Bool {
            switch status {
            case .listed(let l): l.auctionEndDay != nil
            case .atAuctionHouse: true
            default: false
            }
        }
        let selling = (data.raw + data.slabs).filter { atAuction($0.status) }.count + data.sealed.filter { atAuction($0.status) }.count
        let mine = openLots.filter { $0.playerMax != nil }
        let outbid = mine.filter { !lotView($0).playerLeads }.count
        return "\(selling) selling · \(mine.count) bid\(mine.count == 1 ? "" : "s")\(outbid > 0 ? " · \(outbid) outbid" : "")"
    }
}
