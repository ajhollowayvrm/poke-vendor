import Foundation

// Auction houses for high-end slabs (docs/15-selling.md, Auction houses). The player consigns a slab of $1,000 or more.
// The house checks it, photographs it, and sells it at its next catalog auction. The house pays out two weeks after
// the hammer. A consigned slab cannot come back before its auction.

enum AuctionHouse: String, Codable, CaseIterable, Identifiable {
    case goldin = "Goldin"
    case heritage = "Heritage"
    case fanatics = "Fanatics Collect"

    var id: String { rawValue }

    /// The seller fee before discounts. Big consignments and a good reputation pay less.
    var sellerFee: Double {
        switch self {
        case .goldin: 0.10
        case .heritage: 0.15
        case .fanatics: 0.12
        }
    }

    /// The buyer's premium. Each buyer bids for the total cost, so the premium comes out of the hammer price.
    var buyerPremium: Double {
        switch self {
        case .goldin: 0.15
        case .heritage: 0.20
        case .fanatics: 0.15
        }
    }

    /// How hard the house's buyers push: the mean of the most that the top bidder pays in total, as a share of market.
    var bidderStrength: Double {
        switch self {
        case .goldin: 1.22
        case .heritage: 1.27
        case .fanatics: 1.15
        }
    }

    /// The reputation tier that the house asks for. Fanatics Collect takes Known sellers. The others want Trusted.
    var minReputationTier: Int { self == .fanatics ? 1 : 2 }

    /// The day in each 28-day cycle when the house holds its catalog auction. The houses take turns.
    var catalogOffset: Int {
        switch self {
        case .goldin: 6
        case .heritage: 13
        case .fanatics: 20
        }
    }

    var blurb: String {
        switch self {
        case .goldin: "Big-name buyers. A middle fee."
        case .heritage: "The strongest bidders, and the highest fees."
        case .fanatics: "Lower fees and fewer big bidders. It takes Known sellers."
        }
    }
}

/// A slab at an auction house.
struct AuctionConsignment: Codable, Hashable {
    let house: AuctionHouse
    let consignDay: Int
    let auctionDay: Int
    /// The lowest hammer price that the player accepts. Nil: no reserve.
    let reserve: Double?
    /// The seller fee after discounts, fixed on the consign day.
    let sellerFee: Double
    /// The market price on the consign day, for the status box.
    let estimate: Double
    /// True after the house's authenticity check. Optional, so a consignment from before this field still loads.
    var checked: Bool?
}

/// Money that an auction house owes the player.
struct AuctionPayout: Codable, Hashable, Identifiable {
    var id = UUID()
    let day: Int
    let amount: Double
    let name: String
    let house: AuctionHouse
}

extension Balance {
    static let auctionMinValue = 1_000.0
    /// The days from the consign day to the first catalog that can hold the slab: shipping, the check, and photos.
    static let auctionLeadDays = 14
    static let auctionCycleDays = 28
    /// The days from the consign day to the house's authenticity check.
    static let auctionIntakeDays = 5
    static let auctionPayoutDays = 14
    /// Insured, tracked shipping to the house.
    static let auctionShipping = 30.0
    /// The seller fee falls this much for each reputation tier above the house's tier.
    static let auctionFeePerTier = 0.02
    /// Bigger slabs pay less: −3% from $10,000, −5% from $50,000.
    static let auctionFeeBigValue = 10_000.0
    static let auctionFeeBigCut = 0.03
    static let auctionFeeHugeValue = 50_000.0
    static let auctionFeeHugeCut = 0.05
    /// The reserve choices, as a share of market, and the fee on a reserve that is not met.
    static let auctionReserveShares = [0.8, 0.9, 1.0]
    static let auctionReserveFee = 0.03
    /// The spread of the top bid around its mean: the mean of two rolls of ±this.
    static let auctionBidSpread = 0.30
    /// A fake slab: the house sends it back, the player loses reputation, and the house refuses the player for a time.
    static let auctionFakeReputation = -15
    static let auctionBanDays = 180
    /// A slab that does not sell comes back in this many days.
    static let auctionReturnDays = 5
}

@MainActor
extension GameStore {
    /// The first catalog day of a house that is at least the lead time after a day.
    func nextAuctionDay(_ house: AuctionHouse, after day: Int) -> Int {
        let earliest = day + Balance.auctionLeadDays
        let cycle = Balance.auctionCycleDays
        let base = earliest - earliest % cycle + house.catalogOffset
        return base >= earliest ? base : base + cycle
    }

    /// The seller fee for a slab at a house, after the reputation and value discounts.
    func auctionSellerFee(_ house: AuctionHouse, value: Double) -> Double {
        var fee = house.sellerFee - Double(max(0, reputationTier - house.minReputationTier)) * Balance.auctionFeePerTier
        if value >= Balance.auctionFeeHugeValue {
            fee -= Balance.auctionFeeHugeCut
        } else if value >= Balance.auctionFeeBigValue {
            fee -= Balance.auctionFeeBigCut
        }
        return max(0, fee)
    }

    /// Why a house does not take the slab now, or nil when it does.
    func auctionBlock(_ house: AuctionHouse, card: OwnedCard) -> String? {
        if card.grade == nil { return "Only slabs go to auction." }
        if card.status != nil { return "The slab has a status." }
        if card.keep { return "The slab is kept." }
        if card.isKnownFake { return "You know the slab is a fake." }
        if card.realMarket < Balance.auctionMinValue { return "The house takes slabs of \(money(Balance.auctionMinValue)) or more." }
        if let until = data.auctionBans[house.rawValue], data.day < until {
            return "\(house.rawValue) refuses your consignments until day \(until + 1)."
        }
        if reputationTier < house.minReputationTier {
            return "\(house.rawValue) works with \(ReputationTier.names[house.minReputationTier]) sellers and up."
        }
        return nil
    }

    /// The mean hammer price of a slab at a house, with today's season, before the bid spread.
    func expectedHammer(_ house: AuctionHouse, market: Double) -> Double {
        market * house.bidderStrength * PriceCycle.seasonDemand(sealed: false) / (1 + house.buyerPremium)
    }

    /// Sends a slab to an auction house. `ignoreGate` is for the soak test only.
    @discardableResult
    func consignToAuction(_ id: UUID, house: AuctionHouse, reserveShare: Double?, ignoreGate: Bool = false) -> Bool {
        guard let i = data.slabs.firstIndex(where: { $0.id == id }) else { return false }
        let card = data.slabs[i]
        if !ignoreGate, auctionBlock(house, card: card) != nil { return false }
        guard card.grade != nil, card.status == nil, data.cash >= Balance.auctionShipping else { return false }
        let market = card.realMarket
        let consignment = AuctionConsignment(house: house, consignDay: data.day, auctionDay: nextAuctionDay(house, after: data.day),
                                             reserve: reserveShare.map { ShowSession.round(market * $0) },
                                             sellerFee: auctionSellerFee(house, value: market), estimate: market)
        data.slabs[i].status = .atAuctionHouse(consignment)
        addLedger(-Balance.auctionShipping, .auctionFees, "Insured shipping to \(house.rawValue) · \(card.print.name)")
        log("Sent \(card.print.name) \(card.grade?.label ?? "") to \(house.rawValue). Its auction is on day \(consignment.auctionDay + 1).")
        save()
        return true
    }

    /// One End Day step for a slab at an auction house. Returns the report line, and true when the slab sold.
    func advanceAuction(_ card: inout OwnedCard, _ a: AuctionConsignment) -> (line: String?, sold: Bool) {
        let day = data.day
        let name = "\(card.print.name) \(card.grade?.label ?? "")"
        // The house checks every slab when it arrives. A fake goes back, and the house refuses the player for a time.
        if day >= a.consignDay + Balance.auctionIntakeDays, a.checked != true, card.fake != nil {
            card.fakeKnown = true
            card.status = .arriving(daysLeft: Balance.auctionReturnDays, from: a.house.rawValue)
            data.auctionBans[a.house.rawValue] = day + Balance.auctionBanDays
            addReputation(Balance.auctionFakeReputation)
            return ("\(a.house.rawValue) found that your \(name) is a fake. It sends the slab back and refuses your consignments for \(Balance.auctionBanDays) days.", false)
        }
        if day >= a.consignDay + Balance.auctionIntakeDays, a.checked != true {
            var checked = a
            checked.checked = true
            card.status = .atAuctionHouse(checked)
        }
        guard day >= a.auctionDay else { return (nil, false) }
        let market = card.realMarket
        let spread = (Double.random(in: -1...1) + Double.random(in: -1...1)) / 2 * Balance.auctionBidSpread
        let topBid = market * a.house.bidderStrength * (1 + spread) * PriceCycle.seasonDemand(sealed: false)
        let hammer = max(1, (topBid / (1 + a.house.buyerPremium) / 5).rounded() * 5)
        if let reserve = a.reserve, hammer < reserve {
            let fee = (reserve * Balance.auctionReserveFee * 100).rounded() / 100
            addLedger(-fee, .auctionFees, "\(a.house.rawValue) reserve fee · \(name)")
            card.status = .arriving(daysLeft: Balance.auctionReturnDays, from: a.house.rawValue)
            return ("Your \(name) did not meet its reserve of \(money(reserve)) at \(a.house.rawValue). The top bid was \(money(hammer)). It comes back in \(Balance.auctionReturnDays) days. Reserve fee: \(money(fee)).", false)
        }
        let net = (hammer * (1 - a.sellerFee) * 100).rounded() / 100
        data.auctionPayouts.append(AuctionPayout(day: day + Balance.auctionPayoutDays, amount: net, name: name, house: a.house))
        addReceipt(name: name, venue: a.house.rawValue, price: hammer, net: net, paid: card.paid)
        // The sale uses up some buyers of the card. It does not touch the demand of any channel of the player.
        data.demand.items[card.print.name, default: 0] += 1
        addReputation(Balance.onlineSaleReputation)
        return ("Your \(name) sold at \(a.house.rawValue) for \(money(hammer)). After the \(Int((a.sellerFee * 100).rounded()))% seller fee, \(money(net)) comes on day \(day + Balance.auctionPayoutDays + 1).", true)
    }

    /// Pays the auction payouts that are due. Runs at End Day.
    func auctionHouseEndDay() -> [String] {
        let day = data.day
        let due = data.auctionPayouts.filter { $0.day <= day }
        guard !due.isEmpty else { return [] }
        data.auctionPayouts.removeAll { $0.day <= day }
        return due.map { p in
            addLedger(p.amount, .sale, "\(p.name) · \(p.house.rawValue) payout")
            return "\(p.house.rawValue) paid you \(money(p.amount)) for the \(p.name)."
        }
    }

    /// The calendar entries for the auctions and payouts on a day.
    func auctionHouseEntries(day: Int) -> [CalendarEntry] {
        var out: [CalendarEntry] = []
        let auctions = data.slabs.compactMap { card -> (OwnedCard, AuctionConsignment)? in
            if case .atAuctionHouse(let a) = card.status, a.auctionDay == day { return (card, a) }
            return nil
        }
        for house in AuctionHouse.allCases {
            let mine = auctions.filter { $0.1.house == house }
            guard !mine.isEmpty else { continue }
            out.append(CalendarEntry(kind: .auction, title: "\(house.rawValue) auction",
                                     detail: mine.map { $0.0.print.name }.joined(separator: ", ")))
        }
        for p in data.auctionPayouts where p.day == day {
            out.append(CalendarEntry(kind: .sale, title: "\(p.house.rawValue) payout", detail: "\(money(p.amount)) · \(p.name)"))
        }
        return out
    }
}
