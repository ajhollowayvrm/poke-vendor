import Foundation
import Observation

// Live streams and Whatnot (docs/06-social-media.md, Live streams; docs/08-ui-direction.md, 5. Live stream;
// docs/15-selling.md, Whatnot; docs/18-ripping.md, Ripping on a live stream).

extension Balance {
    static let whatnotFeeRate = 0.109
    static let whatnotFeeFlat = 0.30
    /// Follower tier 3: every listing sells this much faster (docs/04).
    static let reachSaleBonus = 1.3

    /// A stream is 2 or 3 hours. One real second is one stream minute.
    static let streamHours = [2.0, 3.0]
    static let streamBaseViewers = 8.0
    static let streamViewersPerFollower = 0.02
    /// Followers see a scheduled stream, so more of them come.
    static let scheduledStreamBonus = 1.5
    /// Chat interest falls this much each minute, and each action adds to it.
    static let interestDecay = 0.02
    static let talkInterest = 0.20
    static let giveawayInterest = 0.50
    static let auctionInterest = 0.25
    static let ripHitInterest = [0.0, 0.10, 0.30, 0.60]
    /// Expected tips for each viewer each minute, and the size of one tip.
    static let tipRatePerViewerMinute = 0.004
    static let tipRange = 1.0...5.0
    static let bigHitTips = 3...8
    /// An auction runs 8 stream minutes and starts at half of market.
    static let auctionMinutes = 8.0
    static let auctionStartShare = 0.5
    static let buyNowMinutes = 15.0
    /// A giveaway brings followers: this share of the viewers.
    static let giveawayFollowerShare = 0.05
    static let giveawayAuthenticity = 0.03
    /// At the end, this share of the peak viewers follow, times authenticity.
    static let streamFollowerShare = 0.10
    static let streamBurnout = 0.12
    static let streamRipMinutesPerPack = 3.0
    /// A scheduled stream the player skipped.
    static let missedStreamFollowerLoss = 0.02
    static let missedStreamAuthenticityCost = 0.10
    /// Chat slows down under this interest.
    static let chatWarning = 0.25
}

/// A stream on the calendar, or one that starts now.
struct StreamPlan: Codable, Identifiable, Hashable {
    var id = UUID()
    let day: Int
    let startHour: Double
    let hours: Double
    var itemIDs: [UUID]
    /// The items that the player marked for Rip & Ship. Nil on old saves.
    var ripShipIDs: [UUID]?
}

/// A card or a sealed product the player brought to the stream.
struct StreamItem: Identifiable, Hashable, Codable {
    let id: UUID
    let name: String
    let market: Double
    let image: String?
    let sealed: Bool
    let packs: Int
    var fake: FakeTier?
    var fakeKnown = false
    /// A slab: the card name, its grade, and the subgrades a BGS label prints.
    var cardName: String? = nil
    var grade: SlabGrade? = nil
    var subgrades: [Double]? = nil
    /// A sealed case. It does not go in a normal rip. It can go in a Rip & Ship rip, which opens it first.
    var isCase = false
    /// The player marked it for Rip & Ship: one viewer can buy it whole.
    var ripShip = false
}

struct ChatLine: Identifiable, Hashable, Codable {
    enum Kind: Codable { case chat, tip, bid, buy, system }

    var id = UUID()
    let minute: Int
    let kind: Kind
    let text: String
}

struct StreamAuction: Codable {
    let item: StreamItem
    let startPrice: Double
    let endsAt: Double
    var top: Double
    var topBidder: String?
    var bids: [StreamBid] = []
    /// The most that anyone watching would pay. Hidden.
    let ceiling: Double
    let bidders: Int
    /// A Rip & Ship auction: the winner buys the whole product, and every card ships to the winner.
    var ripShip = false
    var buyerContactID: String?
}

/// One bid in a stream auction.
struct StreamBid: Codable {
    let name: String
    let amount: Double
}

struct StreamBuyNow: Codable {
    let item: StreamItem
    let price: Double
    let expiresAt: Double
    /// A Rip & Ship offer. `ceilingShare` is the most that a viewer pays, as a share of market. Hidden.
    var ripShip = false
    var ceilingShare = 1.0
    var buyerContactID: String?
}

/// One live stream: the clock, the viewers, the chat, and the sales.
@MainActor @Observable
final class StreamSession {
    let hours: Double
    let scheduled: Bool
    private let store: GameStore
    let startHour: Double
    let followersStart: Int

    /// Stream minutes since the start. One real second is one minute.
    private(set) var minute = 0.0
    private(set) var ended = false
    private(set) var viewers: Double
    private(set) var peakViewers = 0
    private(set) var interest = 0.6
    private let target: Double
    private(set) var tips = 0.0
    private(set) var tipCount = 0
    private(set) var followersGained = 0
    private(set) var onCamera: StreamItem?
    private(set) var chat: [ChatLine] = []
    private(set) var items: [StreamItem]
    private(set) var auction: StreamAuction?
    private(set) var buyNow: StreamBuyNow?
    private(set) var sold: [(name: String, price: Double, fees: Double, orderID: UUID?)] = []
    private(set) var giveaways: [(name: String, followers: Int)] = []
    private(set) var pulls: [RipCard] = []
    /// The sealed product on its way to the rip screen.
    var ripping: SealedItem?
    private var lastTalk = -10.0
    private var minutesRipped = 0.0
    /// The order that waits for its rip on this stream. Other sales wait until the rip starts.
    private(set) var ripShipWaiting: RipShipOrder?
    /// The order that the rip screen shows now.
    private(set) var ripShipActive: RipShipOrder?
    private(set) var ripShipOrders: [RipShipOrder] = []
    /// Rip & Ship hits, by order. They are the buyers' cards, so they stay out of `pulls`.
    private(set) var ripShipHits: [UUID: [RipCard]] = [:]
    private var waitingSince = 0.0
    /// Rival creators take a share of the Rip & Ship buyers.
    private let ripShipRivalFactor: Double

    init(store: GameStore, hours: Double, items: [StreamItem], scheduled: Bool) {
        self.store = store
        self.hours = hours
        self.items = items
        self.scheduled = scheduled
        startHour = store.data.hour
        followersStart = store.social.followers
        var luck = exp((Double.random(in: -1...1) + Double.random(in: -1...1)) / 2 * 0.5)
        if Double.random(in: 0..<1) < 0.02 { luck *= Double.random(in: 4...10) }
        // A short with many views sends viewers to the next stream (docs/32-short-form-video.md).
        var boost = 1.0
        if let until = store.data.shorts.streamBoostUntil, store.data.day <= until {
            boost = Balance.streamBoost
            store.data.shorts.streamBoostUntil = nil
        }
        target = boost * (Balance.streamBaseViewers + Balance.streamViewersPerFollower * Double(store.social.followers))
            * store.productionQuality * store.postTiming * luck * (scheduled ? Balance.scheduledStreamBonus : 1)
            * (0.4 + store.social.authenticity)
        let rivalCreators = store.data.rivals.filter { $0.kind == .creator }.count
        ripShipRivalFactor = max(Balance.ripShipRivalFloor, 1 - Balance.ripShipRivalStep * Double(rivalCreators))
        viewers = max(1, target * 0.3)
        peakViewers = Int(viewers)
        store.currentStreamPeakViewers = peakViewers
        system("You're live.")
    }

    /// A stream from the save: the app quit while it was live (docs/40-resume-events.md). A rip on camera is over: its
    /// cards are in Inventory already, or with the Rip & Ship buyer.
    init(snapshot x: StreamSnapshot, store: GameStore) {
        self.store = store
        hours = x.hours
        scheduled = x.scheduled
        startHour = x.startHour
        followersStart = x.followersStart
        minute = x.minute
        ended = x.ended
        viewers = x.viewers
        peakViewers = x.peakViewers
        interest = x.interest
        target = x.target
        tips = x.tips
        tipCount = x.tipCount
        followersGained = x.followersGained
        onCamera = x.onCamera
        chat = x.chat
        items = x.items
        auction = x.auction
        buyNow = x.buyNow
        sold = x.sold.map { ($0.name, $0.price, $0.fees, $0.orderID) }
        giveaways = x.giveaways.map { ($0.name, $0.followers) }
        pulls = x.pulls
        lastTalk = x.lastTalk
        minutesRipped = x.minutesRipped
        ripShipWaiting = x.ripShipWaiting
        ripShipActive = x.ripShipActive
        ripShipOrders = x.ripShipOrders
        ripShipHits = x.ripShipHits
        waitingSince = x.waitingSince
        ripShipRivalFactor = x.ripShipRivalFactor
        if let active = ripShipActive {
            store.finishRipShip(active.id)
            ripShipActive = nil
        }
        system("Sorry, the connection dropped. We're back.")
    }

    func snapshot() -> StreamSnapshot {
        StreamSnapshot(hours: hours, scheduled: scheduled, startHour: startHour, followersStart: followersStart, minute: minute,
                       ended: ended, viewers: viewers, peakViewers: peakViewers, interest: interest, target: target, tips: tips,
                       tipCount: tipCount, followersGained: followersGained, onCamera: onCamera, chat: Array(chat.suffix(30)),
                       items: items, auction: auction, buyNow: buyNow,
                       sold: sold.map { .init(name: $0.name, price: $0.price, fees: $0.fees, orderID: $0.orderID) },
                       giveaways: giveaways.map { .init(name: $0.name, followers: $0.followers) }, pulls: pulls,
                       lastTalk: lastTalk, minutesRipped: minutesRipped, ripShipWaiting: ripShipWaiting,
                       ripShipActive: ripShipActive, ripShipOrders: ripShipOrders, ripShipHits: ripShipHits,
                       waitingSince: waitingSince, ripShipRivalFactor: ripShipRivalFactor)
    }

    var totalMinutes: Double { hours * 60 }
    var minutesLeft: Double { max(0, totalMinutes - minute) }
    var isOver: Bool { minute >= totalMinutes }
    var chatSlow: Bool { interest < Balance.chatWarning }
    var whatnotOpen: Bool { store.followerTier >= 1 && !store.whatnotBanned }
    /// Rip & Ship can take a new offer: no order waits, no rip runs, and no other Rip & Ship offer is up.
    var ripShipOpen: Bool {
        whatnotOpen && !store.data.ripShip.ripShipClosed && ripShipWaiting == nil && ripping == nil
            && auction?.ripShip != true && buyNow?.ripShip != true
    }
    var viewerCount: Int { Int(viewers.rounded()) }
    var clock: String { GameStore.clock(startHour + minute / 60) }
    /// The sales that still stand. A Rip & Ship order that Whatnot refunded is not a sale.
    var liveSold: [(name: String, price: Double, fees: Double, orderID: UUID?)] {
        let refunded = Set(store.data.ripShip.orders.filter(\.refunded).map(\.id))
        return sold.filter { $0.orderID.map { !refunded.contains($0) } ?? true }
    }
    var soldTotal: Double { liveSold.reduce(0) { $0 + $1.price } }
    var feesTotal: Double { liveSold.reduce(0) { $0 + $1.fees } }

    // MARK: - The clock

    /// One stream minute. The view calls it once a real second while the stream runs.
    func tick() {
        guard !ended, ripping == nil else { return }
        minute += 1
        // The save holds the stream, so a quit can resume it (docs/40-resume-events.md). Every 5 stream minutes is enough:
        // the app also saves when it goes to the background.
        if Int(minute) % 5 == 0 { store.save() }
        interest = max(0, interest - Balance.interestDecay)
        let noise = Double.random(in: -0.05...0.05) * max(1, viewers)
        viewers = max(0, viewers + (target * (0.5 + interest) - viewers) * 0.10 + noise)
        peakViewers = max(peakViewers, Int(viewers.rounded()))
        store.currentStreamPeakViewers = peakViewers
        if ripShipWaiting != nil, minute - waitingSince > Balance.ripShipWaitMinutes {
            // The buyer waits. Chat gets bored.
            interest = max(0, interest - Balance.ripShipImpatience)
            if Int(minute) % 3 == 0 { add(.chat, "\(Self.names.randomElement() ?? "viewer"): rip it already") }
        }
        rollTips()
        rollChat()
        advanceAuction()
        advanceBuyNow()
        if isOver { end() }
    }

    private func rollTips(burst: Int = 0) {
        let expected = viewers * Balance.tipRatePerViewerMinute * (0.5 + interest)
        var count = Int(expected) + (Double.random(in: 0..<1) < expected - Double(Int(expected)) ? 1 : 0) + burst
        while count > 0 {
            let amount = Double(Int.random(in: Int(Balance.tipRange.lowerBound)...Int(Balance.tipRange.upperBound)))
            tips += amount
            tipCount += 1
            add(.tip, "\(Self.names.randomElement() ?? "someone") tipped \(money(amount))")
            count -= 1
        }
    }

    private func rollChat() {
        let chance = min(0.9, viewers / 20 * (0.3 + interest))
        guard Double.random(in: 0..<1) < chance else { return }
        let pool = onCamera == nil ? Self.idleLines : Self.cardLines.map { $0.replacingOccurrences(of: "{card}", with: onCamera?.name ?? "that") }
        add(.chat, "\(Self.names.randomElement() ?? "viewer"): \(pool.randomElement() ?? "")")
    }

    private func add(_ kind: ChatLine.Kind, _ text: String) {
        chat.append(ChatLine(minute: Int(minute), kind: kind, text: text))
        if chat.count > 40 { chat.removeFirst(chat.count - 40) }
    }

    private func system(_ text: String) { add(.system, text) }

    // MARK: - Actions

    func showCard(_ item: StreamItem) {
        onCamera = item
        interest = min(1, interest + 0.15 * log10(item.market + 1) / 2)
        system("On camera: \(item.name).")
    }

    func talk() {
        interest = min(1, interest + Balance.talkInterest)
        lastTalk = minute
        system("You talk to chat for a bit.")
    }

    /// Gives a card or a product to a viewer. It brings viewers and followers (docs/06, Live streams).
    func giveaway(_ item: StreamItem) {
        guard let i = items.firstIndex(where: { $0.id == item.id }) else { return }
        items.remove(at: i)
        store.giveAway(item.id)
        let gained = Int((viewers * Balance.giveawayFollowerShare).rounded())
        store.data.social.followers += gained
        store.data.social.authenticity = min(1, store.data.social.authenticity + Balance.giveawayAuthenticity)
        followersGained += gained
        viewers *= 1.2
        interest = min(1, interest + Balance.giveawayInterest)
        giveaways.append((item.name, gained))
        if onCamera?.id == item.id { onCamera = nil }
        add(.system, "Giveaway: \(Self.names.randomElement() ?? "a viewer") won the \(item.name). +\(gained) followers.")
    }

    /// A Whatnot auction: the timer runs, and the viewers bid up to what the item is worth to them.
    func startAuction(_ item: StreamItem, startShare: Double) {
        guard whatnotOpen, auction == nil, ripShipWaiting == nil, let i = items.firstIndex(where: { $0.id == item.id }) else { return }
        items.remove(at: i)
        let bidders = max(1, Int(viewers * 0.03))
        let ceiling = item.market * (0.55 + 0.55 * min(1, viewers / 200)) * Double.random(in: 0.85...1.2)
        let start = ShowSession.round(max(0.5, item.market * startShare))
        auction = StreamAuction(item: item, startPrice: start, endsAt: minute + Balance.auctionMinutes, top: start, ceiling: ceiling,
                                bidders: bidders)
        onCamera = item
        interest = min(1, interest + Balance.auctionInterest)
        system("Auction: \(item.name), starting at \(money(start)). \(Int(Balance.auctionMinutes)) minutes.")
    }

    private func advanceAuction() {
        // Other sales wait while a Rip & Ship order waits for its rip.
        guard ripShipWaiting == nil, var a = auction else { return }
        if minute >= a.endsAt {
            auction = nil
            if let bidder = a.topBidder, a.ripShip {
                soldRipShip(a.item, price: a.top, auction: true, contactID: a.buyerContactID, bidder: bidder)
            } else if let bidder = a.topBidder {
                let fees = sell(a.item, price: a.top)
                add(.system, "Sold: \(a.item.name) to \(bidder) for \(money(a.top)). Fees \(money(fees)).")
            } else {
                items.append(a.item)
                add(.system, "No bids on the \(a.item.name). It goes back in the pile.")
            }
            return
        }
        let chance = min(0.9, 0.15 * (0.3 + interest) * Double(a.bidders) * PriceCycle.seasonDemand(sealed: a.item.sealed))
        guard Double.random(in: 0..<1) < chance else { return }
        let next = a.topBidder == nil ? a.top : ShowSession.round(max(a.top + 1, a.top * Double.random(in: 1.03...1.10)))
        guard next <= a.ceiling || a.topBidder == nil else { return }
        let name = Self.names.randomElement() ?? "bidder"
        a.top = min(next, max(a.startPrice, a.ceiling))
        a.topBidder = name
        a.bids.append(StreamBid(name: name, amount: a.top))
        auction = a
        add(.bid, "\(name) bid \(money(a.top))")
    }

    /// A fixed price for the first viewer who taps Buy.
    func offerBuyNow(_ item: StreamItem, price: Double) {
        guard whatnotOpen, buyNow == nil, ripShipWaiting == nil, let i = items.firstIndex(where: { $0.id == item.id }) else { return }
        items.remove(at: i)
        buyNow = StreamBuyNow(item: item, price: price, expiresAt: minute + Balance.buyNowMinutes)
        onCamera = item
        system("Buy Now: \(item.name) for \(money(price)).")
    }

    func cancelBuyNow() {
        guard let b = buyNow else { return }
        items.append(b.item)
        buyNow = nil
    }

    private func advanceBuyNow() {
        guard ripShipWaiting == nil, let b = buyNow else { return }
        if minute >= b.expiresAt {
            items.append(b.item)
            buyNow = nil
            add(.system, "Nobody took the \(b.item.name) at \(money(b.price)).")
            return
        }
        if b.ripShip {
            // A Rip & Ship viewer pays up to a hidden share of market. A big product needs a big crowd.
            let share = b.price / max(b.item.market, 0.01)
            let crowd = b.price > Balance.ripShipBigTicket ? min(1, viewers / 100) : 1
            let rate = share > b.ceilingShare ? 0 : viewers * Balance.ripShipBuyRate * ripShipRivalFactor * crowd
                * PriceCycle.seasonDemand(sealed: true)
            guard Double.random(in: 0..<1) < rate else { return }
            buyNow = nil
            soldRipShip(b.item, price: b.price, auction: false, contactID: b.buyerContactID, bidder: nil)
            return
        }
        let chance = viewers * 0.002 * exp(-(b.price / max(b.item.market, 0.01) - 1) * 6) * PriceCycle.seasonDemand(sealed: b.item.sealed)
        guard Double.random(in: 0..<1) < chance else { return }
        buyNow = nil
        let fees = sell(b.item, price: b.price)
        add(.buy, "\(Self.names.randomElement() ?? "a viewer") bought the \(b.item.name) for \(money(b.price)). Fees \(money(fees)).")
    }

    /// Takes the money on Whatnot. Returns the fees.
    private func sell(_ item: StreamItem, price: Double) -> Double {
        let costs = store.saleCosts(price: price, channel: .whatnot, sealed: item.sealed, insured: false)
        store.sellOnStream(item, price: price)
        sold.append((item.name, price, costs.fees + costs.shipping, nil))
        interest = min(1, interest + 0.1)
        if onCamera?.id == item.id { onCamera = nil }
        return costs.fees + costs.shipping
    }

    /// Rips a product on stream. The rip screen opens, and the clock waits for it.
    func ripNow(_ item: StreamItem) -> SealedItem? {
        guard let sealed = store.data.sealed.first(where: { $0.id == item.id }), let i = items.firstIndex(where: { $0.id == item.id }) else {
            return nil
        }
        items.remove(at: i)
        onCamera = item
        ripping = sealed
        system("Ripping \(item.name) on stream.")
        return sealed
    }

    /// The rip is done. A normal rip uses about 3 minutes a pack. A whole-case Rip & Ship rip uses 0.75.
    func ripDone(hits: [RipCard], ripShipLine: String? = nil) {
        guard let item = ripping else { return }
        ripping = nil
        let order = ripShipActive
        ripShipActive = nil
        let perPack = order != nil && item.isCase ? Balance.ripShipCaseMinutesPerPack : Balance.streamRipMinutesPerPack
        let minutes = Double(max(1, item.packs)) * perPack
        minute = min(totalMinutes, minute + minutes)
        minutesRipped += minutes
        if let order { ripShipHits[order.id, default: []] += hits } else { pulls += hits }
        let best = hits.map(\.hitTier).max() ?? .none
        interest = min(1, interest + Balance.ripHitInterest[best.rawValue])
        if best == .big { rollTips(burst: Int.random(in: Balance.bigHitTips)) }
        if let top = hits.max(by: { $0.market < $1.market }) {
            add(.system, "Pulled \(top.name) (\(money(top.market)))\(hits.count > 1 ? " and \(hits.count - 1) more hit\(hits.count == 2 ? "" : "s")" : "").")
        } else {
            add(.system, "Nothing big in that one.")
        }
        if let order {
            // A big hit is a clip for the player, and a card for the buyer.
            if best == .big {
                let gained = Int((viewers * Balance.ripShipClipFollowerShare).rounded())
                store.data.social.followers += gained
                followersGained += gained
                add(.system, "The pull is a clip now. +\(gained) followers. The card ships to \(order.buyer).")
            }
            if let line = ripShipLine, !line.isEmpty { add(.system, line) }
            if let reaction = store.buyerReaction(order.id) { add(.chat, reaction) }
        }
        if isOver { end() }
    }

    // MARK: - Rip & Ship

    /// A repeat buyer from the contacts, half of the time. Read the contacts into a local first.
    private func drawRepeatBuyer() -> Contact? {
        let regulars = store.data.contacts.filter { $0.kind == .buyer || $0.kind == .collector }
        return Double.random(in: 0..<1) < Balance.ripShipRepeatBuyerChance ? regulars.randomElement() : nil
    }

    /// A repeat buyer who did well last time pays a little more. One who did badly pays a little less.
    private func luckShift(_ contact: Contact?) -> Double {
        guard let luck = contact?.ripShipLuck else { return 0 }
        return min(Balance.ripShipLuckStep, max(-Balance.ripShipLuckStep, (luck - 1) * Balance.ripShipLuckStep))
    }

    /// The share of market that a Rip & Ship buyer pays at most: a draw in the band, the repeat buyer's luck, and the overhead camera.
    func ripShipShare(_ item: StreamItem, contact: Contact?) -> Double {
        let share = Double.random(in: isHot(item) ? Balance.ripShipHotBand : Balance.ripShipBand) + luckShift(contact)
        return share * (store.hasUpgrade(.overheadCamera) ? Balance.overheadCameraPriceFactor : 1)
    }

    private func isHot(_ item: StreamItem) -> Bool {
        let productID = store.data.sealed.first { $0.id == item.id }?.productID
        return SetLibrary.product(productID).map { store.isHot($0) } ?? false
    }

    /// Offers a whole product to one buyer at a fixed price. The first viewer under the hidden ceiling buys it.
    func offerRipShip(_ item: StreamItem, price: Double) {
        guard ripShipOpen, buyNow == nil, item.ripShip, let i = items.firstIndex(where: { $0.id == item.id }) else { return }
        items.remove(at: i)
        let contact = drawRepeatBuyer()
        var offer = StreamBuyNow(item: item, price: price, expiresAt: minute + Balance.buyNowMinutes)
        offer.ripShip = true
        offer.ceilingShare = ripShipShare(item, contact: contact)
        offer.buyerContactID = contact?.id
        buyNow = offer
        onCamera = item
        system("Rip & Ship: \(item.name) for \(money(price)). One buyer gets the whole product and every card in it.")
    }

    /// A Rip & Ship auction. The winner buys the whole product. The ceiling is a share of market.
    func auctionRipShip(_ item: StreamItem, startShare: Double) {
        guard ripShipOpen, auction == nil, item.ripShip, let i = items.firstIndex(where: { $0.id == item.id }) else { return }
        items.remove(at: i)
        let contact = drawRepeatBuyer()
        let bidders = max(1, Int(viewers * 0.03))
        let share = ripShipShare(item, contact: contact)
        let start = ShowSession.round(max(0.5, item.market * startShare))
        var a = StreamAuction(item: item, startPrice: start, endsAt: minute + Balance.auctionMinutes, top: start,
                              ceiling: item.market * share, bidders: bidders)
        a.ripShip = true
        a.buyerContactID = contact?.id
        auction = a
        onCamera = item
        interest = min(1, interest + Balance.auctionInterest)
        system("Rip & Ship auction: \(item.name), starting at \(money(start)). The winner gets the whole product and every card in it.")
    }

    /// The sale and the wait. The money comes now. The product waits for its rip on this stream.
    private func soldRipShip(_ item: StreamItem, price: Double, auction isAuction: Bool, contactID: String?, bidder: String?) {
        let contact = contactID.flatMap { id in store.data.contacts.first { $0.id == id } }
        let buyer = contact?.name ?? bidder ?? (Self.names.randomElement() ?? "a viewer")
        guard ripShipWaiting == nil,
              let order = store.createRipShipOrder(itemID: item.id, price: price, buyer: buyer, buyerContactID: contact?.id,
                                                   auction: isAuction) else {
            items.append(item)
            return
        }
        ripShipWaiting = order
        ripShipOrders.append(order)
        waitingSince = minute
        onCamera = item
        sold.append((item.name, price, order.fees.total, order.id))
        interest = min(1, interest + 0.15)
        add(.buy, "\(buyer) bought the \(item.name) for Rip & Ship: \(money(price)). Rip it now. Every card ships to \(buyer).")
    }

    #if DEBUG
    /// Test tool: a viewer buys the item on Rip & Ship now.
    func testRipShipSale(_ item: StreamItem, price: Double) {
        items.removeAll { $0.id == item.id }
        soldRipShip(item, price: price, auction: false, contactID: nil, bidder: "Jess")
    }
    #endif

    private func streamItem(for s: SealedItem) -> StreamItem {
        StreamItem(id: s.id, name: s.name, market: store.realMarket(of: s), image: SetLibrary.product(s.productID, in: s.setSlug)?.image,
                   sealed: true, packs: s.packs, fake: s.fake, fakeKnown: s.isKnownFake, isCase: s.isCase)
    }

    /// Starts the rip of the waiting order. The clock stops until `ripDone`, because `ripping` is set.
    func startRipShipRip() -> (order: RipShipOrder, items: [SealedItem], ripID: UUID)? {
        guard ripping == nil, let w = ripShipWaiting, let snapshot = store.data.sealed.first(where: { $0.id == w.itemID }) else { return nil }
        let ripID = UUID()
        let items = store.beginRipShipRip(w.id, ripID: ripID)
        guard !items.isEmpty else { return nil }
        ripShipWaiting = nil
        ripShipActive = w
        ripping = snapshot          // the box or the case as it was, so `ripDone` reads its packs and `isCase`
        onCamera = streamItem(for: snapshot)
        system("Ripping \(w.buyer)'s \(w.itemName) on stream. Every card ships to \(w.buyer).")
        return (w, items, ripID)
    }

    /// Ends the stream. The unused hours go back to the day (docs/06, Live streams).
    func end() {
        guard !ended else { return }
        ended = true
        // A rip that runs when the stream ends still ships every card to the buyer. Whatnot does not refund it.
        if let active = ripShipActive {
            store.finishRipShip(active.id)
            ripShipActive = nil
            ripping = nil
        }
        // An order that waits for its rip is unopened. Whatnot refunds the buyer.
        if let w = ripShipWaiting {
            add(.system, store.refundRipShipOrder(w.id, reason: .notOpened))
            ripShipWaiting = nil
        }
        if let a = auction {
            items.append(a.item)
            auction = nil
        }
        if let b = buyNow {
            items.append(b.item)
            buyNow = nil
        }
        let gained = Int((Double(peakViewers) * Balance.streamFollowerShare * (0.5 + store.social.authenticity)).rounded())
        followersGained += gained
        store.finishStream(self, followers: gained)
    }

    private static let names = ["pikafan22", "holo_hunter", "Jess", "cardboardking", "Nate", "mintyfresh", "Priya", "slabcity",
                                "Theo", "eevee_lover", "Marcus", "psa10dreams", "Rosa", "packrat", "Dev", "shinycharm"]
    private static let idleLines = ["show us something", "any vintage?", "W stream", "first time here", "what set is that",
                                    "rip something!", "hello from the UK", "lets see the binder", "any Charizards?", "GG"]
    private static let cardLines = ["{card} is clean", "how much for {card}", "{card}!!", "that centering tho", "W pull",
                                    "I need {card}", "grade it", "is {card} for sale?", "fire", "auction it"]
}

@MainActor
extension GameStore {
    /// Items the player can bring to a stream: not in the PC or a master set, not listed, and not away.
    var streamStock: [StreamItem] {
        let cards = (data.raw + data.slabs).filter { $0.status == nil && !$0.setAside }.map { c in
            StreamItem(id: c.id, name: c.grade.map { "\(c.print.name) \($0.label)" } ?? c.print.name, market: c.realMarket,
                       image: c.print.image, sealed: false, packs: 0, fake: c.fake, fakeKnown: c.isKnownFake,
                       cardName: c.print.name, grade: c.grade, subgrades: c.slabSubgrades)
        }
        let sealed = data.sealed.filter { $0.status == nil && !$0.setAside }.map { s in
            StreamItem(id: s.id, name: s.name, market: realMarket(of: s), image: SetLibrary.product(s.productID, in: s.setSlug)?.image,
                       sealed: true, packs: s.packs, fake: s.fake, fakeKnown: s.isKnownFake, isCase: s.isCase)
        }
        return (cards + sealed).sorted { $0.market > $1.market }
    }

    var streamToday: StreamPlan? { data.streams.first { $0.day == data.day } }

    /// Why the player cannot go live now, or nil.
    func streamBlock(hours: Double) -> String? {
        guard hasAccount else { return "You need an account" }
        guard slot(for: hours) != nil else { return "Not enough time today" }
        return nil
    }

    /// Goes live now, or starts today's scheduled stream.
    func startStream(hours: Double, itemIDs: [UUID], scheduled: Bool, ripShipIDs: [UUID] = []) -> StreamSession? {
        guard streamBlock(hours: hours) == nil, let start = slot(for: hours) else { return nil }
        data.hour = start
        let today = data.day
        if scheduled { data.streams.removeAll { $0.day == today } }
        let ids = Set(itemIDs)
        // An item that cannot go on Rip & Ship loses its mark.
        let marked = Set(ripShipIDs.filter { ids.contains($0) && followerTier >= 1 && ripShipBlock($0) == nil })
        let items = streamStock.filter { ids.contains($0.id) }.map { item -> StreamItem in
            var item = item
            item.ripShip = marked.contains(item.id)
            return item
        }
        log("Went live for \(formatHours(hours)).")
        let session = StreamSession(store: self, hours: hours, items: items, scheduled: scheduled)
        activeStream = session
        save()
        return session
    }

    /// Puts a stream on the calendar. Followers see it, so more of them come.
    func scheduleStream(day: Int, startHour: Double, hours: Double, itemIDs: [UUID], ripShipIDs: [UUID] = []) {
        guard hasAccount, day > data.day, !data.streams.contains(where: { $0.day == day }) else { return }
        data.streams.append(StreamPlan(day: day, startHour: startHour, hours: hours, itemIDs: itemIDs, ripShipIDs: ripShipIDs))
        log("Scheduled a \(formatHours(hours)) stream for day \(day + 1) at \(GameStore.clock(startHour)).")
        save()
    }

    /// The free hours on a day ahead, for the day strip in the stream setup.
    func freeHours(on day: Int) -> Double {
        var hours = Balance.dayEnd - Balance.dayStart
        if day % 7 < 5, job != nil { hours -= Balance.workEnd - Balance.workStart }
        if data.shows.contains(where: { $0.covers(day) && ($0.booked || day == data.day) }) { hours = 0 }
        return hours
    }

    /// The stream is over: tips, followers, burnout, and the clock.
    func finishStream(_ s: StreamSession, followers: Int) {
        activeStream = nil
        data.activeStream = nil
        if s.tips > 0 { addLedger(s.tips, .tips, "Live-stream tips") }
        data.social.followers = max(0, data.social.followers + followers)
        data.social.burnout = min(1, data.social.burnout + Balance.streamBurnout)
        data.social.lastPostDay = data.day
        // A stream can run past 11 PM. Those hours come out of sleep (docs/16, Late nights).
        let used = ceil(s.minute / 15) / 4
        data.hour = min(Balance.lateNightLimit, s.startHour + used)
        let post = SocialPost(day: data.day, type: .stream, subject: "\(formatHours(s.hours)) · \(s.peakViewers) peak viewers",
                              views: s.peakViewers, followerChange: s.followersGained, likes: s.tipCount, quality: 1, timing: postTiming, luck: 1)
        data.social.posts.append(post)
        log("Stream over: \(s.peakViewers) peak viewers, \(money(s.tips)) in tips, \(s.liveSold.count) sale\(s.liveSold.count == 1 ? "" : "s"), \(s.followersGained >= 0 ? "+" : "")\(s.followersGained) followers.",
            cash: s.tips > 0 ? s.tips : nil)
        save()
    }

    /// A Whatnot sale from a stream. The item leaves at once.
    func sellOnStream(_ item: StreamItem, price: Double) {
        let line = completeSaleNow(name: item.name, channel: .whatnot, price: price, sealed: item.sealed, insured: false,
                                   paid: paidFor(item.id), slab: data.slabs.contains { $0.id == item.id }, ids: [item.id])
        let soldCard = card(item.id)
        let soldSealed = data.sealed.first { $0.id == item.id }
        data.raw.removeAll { $0.id == item.id }
        data.slabs.removeAll { $0.id == item.id }
        data.sealed.removeAll { $0.id == item.id }
        scheduleSaleProblems(name: item.name, channel: .whatnot, price: price, insured: false, overstated: false,
                             card: soldCard, sealed: soldSealed)
        if let fake = item.fake {
            recordBadSale(item: item.name, channel: "Whatnot", price: price, fake: fake, known: item.fakeKnown, refunds: true,
                          sealed: soldSealed != nil)
        }
        log(line, cash: price)
    }

    /// A giveaway on stream. What the player paid becomes a cost.
    func giveAway(_ id: UUID, at place: String = "on stream") {
        if let card = card(id) {
            data.openedPaid += card.paid ?? 0
            data.raw.removeAll { $0.id == id }
            data.slabs.removeAll { $0.id == id }
            log("Gave away \(card.print.name) \(place).")
        } else if let item = data.sealed.first(where: { $0.id == id }) {
            data.openedPaid += item.paid
            data.sealed.removeAll { $0.id == id }
            log("Gave away \(item.name) \(place).")
        }
    }

    /// A scheduled stream the player did not start costs followers and authenticity (docs/06).
    func streamsEndDay() -> [String] {
        var lines: [String] = []
        for plan in data.streams where plan.day < data.day {
            let lost = Int(Double(data.social.followers) * Balance.missedStreamFollowerLoss)
            data.social.followers = max(0, data.social.followers - lost)
            data.social.authenticity = max(0, data.social.authenticity - Balance.missedStreamAuthenticityCost)
            lines.append("You missed your scheduled stream. \(lost) followers left, and it cost you authenticity.")
        }
        let today = data.day
        data.streams.removeAll { $0.day < today }
        if let plan = streamToday {
            lines.append("Your stream is scheduled for \(GameStore.clock(plan.startHour)) today.")
        }
        return lines
    }

    #if DEBUG
    /// Test tool: 1,000 followers and an account.
    func testFollowers(_ count: Int) {
        if !hasAccount { createAccount("ajrips") }
        data.social.followers += count
        save()
    }
    #endif
}

/// A saved live stream (docs/40-resume-events.md).
struct StreamSnapshot: Codable {
    struct Sale: Codable {
        var name: String
        var price: Double
        var fees: Double
        var orderID: UUID?
    }
    struct Giveaway: Codable {
        var name: String
        var followers: Int
    }
    var hours: Double
    var scheduled: Bool
    var startHour: Double
    var followersStart: Int
    var minute: Double
    var ended: Bool
    var viewers: Double
    var peakViewers: Int
    var interest: Double
    var target: Double
    var tips: Double
    var tipCount: Int
    var followersGained: Int
    var onCamera: StreamItem?
    var chat: [ChatLine]
    var items: [StreamItem]
    var auction: StreamAuction?
    var buyNow: StreamBuyNow?
    var sold: [Sale]
    var giveaways: [Giveaway]
    var pulls: [RipCard]
    var lastTalk: Double
    var minutesRipped: Double
    var ripShipWaiting: RipShipOrder?
    var ripShipActive: RipShipOrder?
    var ripShipOrders: [RipShipOrder]
    var ripShipHits: [UUID: [RipCard]]
    var waitingSince: Double
    var ripShipRivalFactor: Double
}
