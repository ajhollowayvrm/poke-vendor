import Foundation

// The store as a business (docs/proposals/store-business.md, part 1 and 7). Three store numbers (awareness, rating,
// loyalty) multiply the store's traffic. Customer types decide what a customer looks at. Reviews set the rating. Every
// 28 days a month-end review grades the store. All of it starts with the lease. A store from an older save starts at
// the baseline, where every factor is 1.

/// The kinds of customer in the player's store.
enum CustomerType: String, Codable, CaseIterable, Identifiable {
    case kids = "Kids and parents"
    case players = "Players"
    case collectors = "Collectors"
    case investors = "Investors"
    case casual = "Casual buyers"

    var id: String { rawValue }

    /// Kids and casual buyers are the small-budget customers.
    var smallBudget: Bool { self == .kids || self == .casual }

    var icon: String {
        switch self {
        case .kids: "figure.and.child.holdinghands"
        case .players: "gamecontroller"
        case .collectors: "star"
        case .investors: "chart.line.uptrend.xyaxis"
        case .casual: "bag"
        }
    }
}

extension StoreLocation {
    /// The customer mix of the location. Kids and casual buyers add up to the location's small-budget share.
    var customerMix: [CustomerType: Double] {
        switch self {
        case .stripMall: [.kids: 0.15, .casual: 0.15, .players: 0.35, .collectors: 0.25, .investors: 0.10]
        case .mainStreet: [.kids: 0.10, .casual: 0.15, .players: 0.30, .collectors: 0.35, .investors: 0.10]
        case .mall: [.kids: 0.25, .casual: 0.25, .players: 0.20, .collectors: 0.20, .investors: 0.10]
        }
    }
}

/// The store level, from store XP. Each level unlocks more marketing channels and distributor tiers.
enum StoreLevel: Int, Codable, CaseIterable {
    case newStore, localFavorite, destination

    var name: String {
        switch self {
        case .newStore: "New store"
        case .localFavorite: "Local favorite"
        case .destination: "Destination store"
        }
    }

    /// The XP the level needs.
    var xp: Double {
        switch self {
        case .newStore: 0
        case .localFavorite: Balance.levelLocalFavoriteXP
        case .destination: Balance.levelDestinationXP
        }
    }

    static func level(xp: Double) -> StoreLevel { allCases.last { xp >= $0.xp } ?? .newStore }
}

extension MarketingChannel {
    /// The store level a channel needs. Nil: any level.
    var minLevel: StoreLevel? {
        switch self {
        case .school, .loyalty: .localFavorite
        default: nil
        }
    }
}

/// One customer review.
struct StoreReview: Codable, Hashable, Identifiable {
    var id = UUID()
    let day: Int
    let stars: Int
    let text: String
}

/// The month-end review: a grade and short notes.
struct MonthReview: Codable, Hashable, Identifiable {
    var id = UUID()
    let day: Int
    let grade: String
    let revenue: Double
    let costs: Double
    let customers: Int
    let notes: [String]

    var net: Double { revenue - costs }
}

/// The business side of the store. Optional in `CardStoreState`, so an older save starts at the baseline.
/// A new field must have a default, and the decoder must read it with `decodeIfPresent`.
struct BusinessState: Codable, Hashable {
    var awareness = Balance.bizAwarenessBase
    var loyalty = Balance.bizLoyaltyBase
    var reviews: [StoreReview] = []
    var months: [MonthReview] = []
    /// Customer-type boosts from marketing, as a share added to the location's mix.
    var typeBoost: [CustomerType: Double] = [:]
    /// Marketing (`Model/StoreMarketing.swift`). Nil: none yet.
    var marketing: MarketingState?
    /// Store XP for the store level: sales, events, and a good rating.
    var xp = 0.0
    /// The opening tasks (`Model/StoreOpening.swift`). Nil: the store is from an older save, and it is open.
    var opening: OpeningPlan?
    var investor: Investor?
    /// Staff (`Model/StoreStaff.swift`). Nil: an older save, where the clerk flag stands for the standard clerk.
    var staff: [Employee]?
    var candidates: [Employee]?
    var candidatesWeek: Int?
    /// The floor, clearance, today's decision, and rival moves (`Model/StoreFloor.swift`).
    var floor: [String]?
    var clearance: [String]?
    var decision: Decision?
    var rivals: [RivalMove]?

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        awareness = try c.decodeIfPresent(Double.self, forKey: .awareness) ?? Balance.bizAwarenessBase
        loyalty = try c.decodeIfPresent(Double.self, forKey: .loyalty) ?? Balance.bizLoyaltyBase
        reviews = try c.decodeIfPresent([StoreReview].self, forKey: .reviews) ?? []
        months = try c.decodeIfPresent([MonthReview].self, forKey: .months) ?? []
        typeBoost = try c.decodeIfPresent([CustomerType: Double].self, forKey: .typeBoost) ?? [:]
        marketing = try c.decodeIfPresent(MarketingState.self, forKey: .marketing)
        xp = try c.decodeIfPresent(Double.self, forKey: .xp) ?? 0
        opening = try c.decodeIfPresent(OpeningPlan.self, forKey: .opening)
        investor = try c.decodeIfPresent(Investor.self, forKey: .investor)
        staff = try c.decodeIfPresent([Employee].self, forKey: .staff)
        candidates = try c.decodeIfPresent([Employee].self, forKey: .candidates)
        candidatesWeek = try c.decodeIfPresent(Int.self, forKey: .candidatesWeek)
        floor = try c.decodeIfPresent([String].self, forKey: .floor)
        clearance = try c.decodeIfPresent([String].self, forKey: .clearance)
        decision = try c.decodeIfPresent(Decision.self, forKey: .decision)
        rivals = try c.decodeIfPresent([RivalMove].self, forKey: .rivals)
    }

    /// The rating: the last reviews, with a prior of a few 4-star reviews, so one bad review does not sink a new store.
    var rating: Double {
        let recent = reviews.suffix(Balance.bizRatingWindow)
        let prior = Balance.bizRatingPrior
        return (Balance.bizRatingBase * prior + Double(recent.reduce(0) { $0 + $1.stars })) / (prior + Double(recent.count))
    }
}

extension Balance {
    static let bizAwarenessBase = 40.0
    /// A new store starts unknown. The grand opening and the pre-opening buzz raise it.
    static let bizAwarenessNew = 20.0
    static let bizAwarenessGrandOpening = 15.0
    /// Without marketing, awareness falls toward this floor: 1% of the gap each day. Each follower tier lifts the floor.
    static let bizAwarenessFloor = 30.0
    static let bizAwarenessDrift = 0.01
    static let bizAwarenessPerFollowerTier = 2.0
    /// Each event day adds awareness.
    static let bizAwarenessEvent = 0.6
    static let bizLoyaltyBase = 30.0
    static let bizLoyaltyDrift = 0.03
    static let bizRatingBase = 4.0
    static let bizRatingPrior = 5.0
    static let bizRatingWindow = 40
    /// Store XP: 1 for each $100 of store sales, 5 for each event day, and 1 for each day with a rating of 4.3 or more.
    static let levelLocalFavoriteXP = 300.0
    static let levelDestinationXP = 1_500.0
    static let xpPerSales = 100.0
    static let xpPerEvent = 5.0
    /// A collector looks at items of this value or more. An investor pays less over market.
    static let collectorMinValue = 20.0
    static let investorBuyerLimit = 0.90...1.08
    /// About 1 review for each this many customers.
    static let bizCustomersPerReview = 25.0
}

@MainActor
extension GameStore {
    /// The business side of the store. A store with no business state yet is at the baseline.
    var business: BusinessState { data.cardStore?.business ?? BusinessState() }

    func updateBusiness(_ change: (inout BusinessState) -> Void) {
        guard var s = data.cardStore else { return }
        var b = s.business ?? BusinessState()
        change(&b)
        s.business = b
        data.cardStore = s
    }

    var storeRating: Double { business.rating }

    var storeLevel: StoreLevel { StoreLevel.level(xp: business.xp) }

    /// The factor of the store numbers on the traffic. It is 1 at the baseline.
    var businessTrafficFactor: Double {
        guard data.cardStore != nil else { return 1 }
        let b = business
        let awareness = 0.6 + b.awareness / 100
        // The maps listing makes the rating count more (Model/StoreMarketing.swift).
        let weight = (b.marketing?.mapsListed ?? false) ? Balance.mktMapsRatingWeight : 1
        let rating = 1 + 0.12 * weight * (b.rating - Balance.bizRatingBase)
        let loyalty = 1 + (b.loyalty - Balance.bizLoyaltyBase) / 200
        // Rival moves (Model/StoreFloor.swift).
        return max(0.3, awareness * rating * loyalty * rivalTrafficFactor)
    }

    /// Today's customer mix: the location's mix with the marketing boosts, scaled to 1.
    var customerMix: [CustomerType: Double] {
        guard let s = data.cardStore else { return [:] }
        let boost = business.typeBoost
        var mix = s.location.customerMix
        let floor = floorTypeBoost
        for t in CustomerType.allCases { mix[t, default: 0] += (boost[t] ?? 0) + (floor[t] ?? 0) }
        let total = mix.values.reduce(0, +)
        return mix.mapValues { $0 / max(0.001, total) }
    }

    /// One customer's type, from today's mix.
    func rollCustomerType() -> CustomerType {
        var roll = Double.random(in: 0..<1)
        for (type, share) in customerMix.sorted(by: { $0.key.rawValue < $1.key.rawValue }) {
            if roll < share { return type }
            roll -= share
        }
        return .casual
    }

    // MARK: - End Day

    /// The business day, after the store day: reviews, awareness, loyalty, and the month-end review.
    func businessDayEnd() -> [String] {
        guard let s = data.cardStore else { return [] }
        let today = data.day
        var lines: [String] = []
        // The grand opening puts the store on the map.
        if today + 1 == s.openDay { updateBusiness { $0.awareness = min(100, $0.awareness + Balance.bizAwarenessGrandOpening) } }
        guard storeSells(on: today) else { return lines }
        let record = s.history.last { $0.day == today }
        let event = eventTraffic(day: today)
        let eventToday = event.tournament + event.league > 0
        // Reviews.
        if let record, record.customers > 0 {
            let expected = Double(record.customers) / Balance.bizCustomersPerReview
            var count = Int(expected)
            if Double.random(in: 0..<1) < expected - Double(count) { count += 1 }
            for _ in 0..<count {
                let review = makeReview(day: today, eventToday: eventToday)
                updateBusiness { $0.reviews.append(review) }
                if review.stars <= 2 || review.stars == 5 { lines.append("A new \(review.stars)-star review of \(s.name): \"\(review.text)\"") }
            }
            updateBusiness { b in if b.reviews.count > 60 { b.reviews.removeFirst(b.reviews.count - 60) } }
        }
        // Marketing: payments, the effect of each channel, and the weekly report (Model/StoreMarketing.swift).
        lines += marketingDayEnd(customers: record?.customers ?? 0, revenue: record?.revenue ?? 0)
        // Awareness falls toward its floor. Events, followers, and marketing hold it up. Marketing pulls it faster.
        let lift = marketingAwareness
        let floor = Balance.bizAwarenessFloor + (hasAccount ? Double(followerTier) * Balance.bizAwarenessPerFollowerTier : 0) + lift
        let pull = lift > 0.5 ? Balance.mktAwarenessPull : Balance.bizAwarenessDrift
        updateBusiness { b in
            b.awareness += (floor - b.awareness) * pull
            if eventToday { b.awareness += Balance.bizAwarenessEvent }
            b.awareness = min(100, max(0, b.awareness))
        }
        // Loyalty moves toward a target that the rating and the events set. Empty shelves lower it.
        let eventWeek = (0..<7).contains { d in let e = eventTraffic(day: today - d); return e.tournament + e.league > 0 }
        let fill = stockFill
        let extraLoyalty = marketingLoyalty
        updateBusiness { b in
            let target = 20 + (b.rating - 3.5) * 15 + (eventWeek ? 10 : 0) + extraLoyalty
            b.loyalty += (target - b.loyalty) * Balance.bizLoyaltyDrift
            if fill < 0.3 { b.loyalty -= 0.5 }
            b.loyalty = min(100, max(0, b.loyalty))
        }
        // The staff week: morale and quits.
        if (today - s.leaseDay) % 7 == 6 { lines += staffWeekEnd(storeName: s.name, openDays: s.openDays.count) }
        // Store XP and the level.
        let before = storeLevel
        let rating = business.rating
        updateBusiness { b in
            b.xp += (record?.revenue ?? 0) / Balance.xpPerSales + (eventToday ? Balance.xpPerEvent : 0) + (rating >= 4.3 ? 1 : 0)
        }
        if storeLevel != before {
            lines.append("\(s.name) is a \(storeLevel.name) now. New options open in Business.")
        }
        let monthEnd = (today - s.leaseDay) % Balance.rentCycleDays == Balance.rentCycleDays - 1 && today > s.openDay
        if let line = monthReviewIfDue(s, today: today) { lines.append(line) }
        // Tomorrow's decision and rival moves (Model/StoreFloor.swift).
        lines += floorDayEnd(monthEnd: monthEnd)
        return lines
    }

    /// The share of the store's shelf room that holds stock.
    var stockFill: Double {
        let stock = storeStock
        let room = max(1, storeCardSlots + storeSealedSlots)
        return min(1, Double(stock.cards.count + stock.sealed.count + consignedCount) / Double(room))
    }

    /// A review from today's experience: prices, stock, staff, and events, with a random mood.
    private func makeReview(day: Int, eventToday: Bool) -> StoreReview {
        guard let s = data.cardStore else { return StoreReview(day: day, stars: 4, text: "") }
        var score = 4.0
        var reasons: [(Double, String)] = []
        let price = s.singlesPrice
        if price <= 1.0 { score += 0.4; reasons.append((0.4, "Fair prices on singles.")) }
        if price >= 1.2 { score -= 0.6; reasons.append((-0.6, "The singles cost way over market.")) }
        let fill = stockFill
        if fill < 0.3 { score -= 1.0; reasons.append((-1.0, "The shelves were almost empty.")) }
        if fill > 0.8 { score += 0.3; reasons.append((0.3, "A great selection.")) }
        if eventToday { score += 0.3; reasons.append((0.3, "The tournament was a lot of fun.")) }
        if s.clerk && s.counterDay != day && !s.has(.pos) { score -= 0.2; reasons.append((-0.2, "Checkout was slow.")) }
        // Staff who know their cards help (Model/StoreStaff.swift).
        if s.counterDay != day, let k = staffKnowledge {
            if k >= 4 { score += 0.3; reasons.append((0.3, "The staff really know their cards.")) }
            if k <= 2 { score -= 0.3; reasons.append((-0.3, "The staff could not answer my questions.")) }
        }
        score += (Double.random(in: -1...1) + Double.random(in: -1...1)) / 2 * 1.2
        let stars = max(1, min(5, Int(score.rounded())))
        let text = (stars >= 4 ? reasons.filter { $0.0 > 0 } : reasons.filter { $0.0 < 0 }).randomElement()?.1
            ?? (stars >= 4 ? "Nice shop. I will come back." : stars == 3 ? "It was fine." : "Not worth the trip.")
        return StoreReview(day: day, stars: stars, text: text)
    }

    /// Every 28 days, on the day before the store rent: a grade and notes for the last 28 days.
    private func monthReviewIfDue(_ s: CardStoreState, today: Int) -> String? {
        guard (today - s.leaseDay) % Balance.rentCycleDays == Balance.rentCycleDays - 1, today > s.openDay else { return nil }
        let days = s.history.filter { $0.day > today - Balance.rentCycleDays }
        let revenue = days.reduce(0) { $0 + $1.revenue }
        let wages = days.reduce(0) { $0 + $1.costs }
        let costs = wages + (s.lease?.rent ?? s.location.rent) + storeOverheadEstimate
        let customers = days.reduce(0) { $0 + $1.customers }
        let b = business
        var points = 0
        var notes: [String] = []
        let net = revenue - costs
        if net > 0 { points += 2; notes.append("The store made \(money(net)) after rent and wages.") } else {
            notes.append("The store lost \(money(-net)) after rent and wages.")
        }
        if net > costs * 0.5 { points += 1 }
        if b.rating >= 4.3 { points += 1; notes.append("Customers love the store: \(String(format: "%.1f", b.rating)) stars.") }
        if b.rating < 3.5 { points -= 1; notes.append("The rating is low: \(String(format: "%.1f", b.rating)) stars. Check prices, stock, and staff.") }
        if b.awareness < 30 { notes.append("Few people know the store. Marketing can help.") }
        if stockFill < 0.4 { points -= 1; notes.append("The shelves are thin. Empty shelves turn people away.") }
        if b.loyalty >= 50 { points += 1; notes.append("Regulars keep coming back.") }
        let grade = ["F", "D", "C", "B", "A", "A"][max(0, min(5, points + 1))]
        let review = MonthReview(day: today, grade: grade, revenue: revenue, costs: costs, customers: customers, notes: notes)
        updateBusiness { b in
            b.months.append(review)
            if b.months.count > 24 { b.months.removeFirst() }
        }
        let investorLine = payInvestor(net: net).map { " " + $0 } ?? ""
        return "Month-end review for \(s.name): grade \(grade). Sales \(money(revenue)), costs \(money(costs)), \(customers) customers.\(investorLine)"
    }

    /// The other business costs due in the next 30 days. Later phases add marketing, bills, and staff.
    var businessForecastCosts: [(label: String, amount: Double)] {
        var out: [(label: String, amount: Double)] = []
        if marketingForecast > 0 { out.append(("Marketing", marketingForecast)) }
        return out
    }

    /// The overhead of 28 days, without the card fees.
    var storeOverheadEstimate: Double {
        guard let s = data.cardStore else { return 0 }
        let o = storeOverhead(s)
        return o.insurance + o.utilities + o.software
    }
}
