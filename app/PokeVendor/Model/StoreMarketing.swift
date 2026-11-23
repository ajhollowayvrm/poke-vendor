import Foundation

// Marketing for the player's store (docs/proposals/store-business.md, part 2). Each channel costs money while it runs.
// It builds an effect each day it runs, and the effect fades after it stops. The total effect lifts awareness, with
// less for each extra dollar. Each channel also shifts the customer mix toward the types it targets. A weekly report
// shows the customers that each channel brought.

enum MarketingChannel: String, Codable, CaseIterable, Identifiable {
    case flyers = "Flyers"
    case paper = "Local paper ad"
    case social = "Social ads"
    case maps = "Maps listing"
    case school = "School club sponsorship"
    case window = "Window display"
    case pizza = "Pizza place cross-promo"
    case loyalty = "Loyalty program"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .flyers: "doc.text"
        case .paper: "newspaper"
        case .social: "megaphone"
        case .maps: "mappin.and.ellipse"
        case .school: "graduationcap"
        case .window: "rectangle.on.rectangle"
        case .pizza: "fork.knife"
        case .loyalty: "creditcard"
        }
    }

    /// The customer types the channel reaches more.
    var targets: [CustomerType] {
        switch self {
        case .flyers: [.kids, .casual]
        case .paper: [.collectors, .casual]
        case .social: [.players, .collectors]
        case .maps: []
        case .school: [.kids]
        case .window: CustomerType.allCases
        case .pizza: [.players]
        case .loyalty: []
        }
    }

    /// The effect that the channel adds each day it runs, before decay.
    var power: Double {
        switch self {
        case .flyers: 0.25
        case .paper: 0.5
        case .social: 0.3
        case .maps: 0
        case .school: 0.25
        case .window: 0
        case .pizza: 0.3
        case .loyalty: 0
        }
    }

    /// How the cost works, for the row.
    var costText: String {
        switch self {
        case .flyers: "\(money(Balance.mktFlyers)) a week"
        case .paper: "\(money(Balance.mktPaper)) a week"
        case .social: "\(money(Balance.mktSocial[0])), \(money(Balance.mktSocial[1])), or \(money(Balance.mktSocial[2])) a week"
        case .maps: "Free, one time"
        case .school: "\(money(Balance.mktSchool)) every 4 weeks"
        case .window: "\(money(Balance.mktWindow)) each refresh"
        case .pizza: "\(money(Balance.mktPizza)) a week"
        case .loyalty: "\(Int(Balance.mktLoyaltyShare * 100))% of store sales"
        }
    }

    var blurb: String {
        switch self {
        case .flyers: "Flyers on car windows and the community board. Families and casual buyers."
        case .paper: "A small ad in the local paper. Older collectors still read it."
        case .social: "Paid posts near the store. Your followers make each dollar go further."
        case .maps: "A listing on the maps apps. A small lasting boost, and your rating counts more."
        case .school: "Sponsor the school's Pokemon club. Kids come, and their parents come back."
        case .window: "A new window display. Everyone notices it for about 4 weeks."
        case .pizza: "A coupon swap with the pizza place next door. Players come after a slice."
        case .loyalty: "A punch card: the 10th purchase gets a discount. Loyalty grows."
        }
    }

    /// A channel that the player turns on and that runs until turned off.
    var isRunning: Bool { self != .window && self != .maps }
}

/// One running channel.
struct Campaign: Codable, Hashable {
    let channel: MarketingChannel
    let startDay: Int
    /// The day the next payment is due.
    var nextPayDay: Int
    /// Social ads: 0, 1, or 2 for the three budgets.
    var level = 0
}

/// One week of the marketing report.
struct MarketingWeek: Codable, Hashable, Identifiable {
    var id = UUID()
    let day: Int
    let spent: Double
    /// Customers that each channel brought, by the channel's raw value.
    let customers: [String: Double]
}

/// The marketing state, inside `BusinessState`. A new field must have a default and be read with `decodeIfPresent`.
struct MarketingState: Codable, Hashable {
    var campaigns: [Campaign] = []
    /// The effect of each channel now, by raw value. It builds while the channel runs and fades after.
    var effect: [String: Double] = [:]
    var mapsListed = false
    /// The day of the last window refresh. Nil: never.
    var windowDay: Int?
    /// This week's spend and attributed customers.
    var weekSpent = 0.0
    var weekCustomers: [String: Double] = [:]
    var weeks: [MarketingWeek] = []

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        campaigns = try c.decodeIfPresent([Campaign].self, forKey: .campaigns) ?? []
        effect = try c.decodeIfPresent([String: Double].self, forKey: .effect) ?? [:]
        mapsListed = try c.decodeIfPresent(Bool.self, forKey: .mapsListed) ?? false
        windowDay = try c.decodeIfPresent(Int.self, forKey: .windowDay)
        weekSpent = try c.decodeIfPresent(Double.self, forKey: .weekSpent) ?? 0
        weekCustomers = try c.decodeIfPresent([String: Double].self, forKey: .weekCustomers) ?? [:]
        weeks = try c.decodeIfPresent([MarketingWeek].self, forKey: .weeks) ?? []
    }

    func running(_ channel: MarketingChannel) -> Campaign? { campaigns.first { $0.channel == channel } }
}

extension Balance {
    static let mktFlyers = 40.0
    static let mktPaper = 120.0
    static let mktSocial = [50.0, 100.0, 200.0]
    static let mktSchool = 150.0
    static let mktWindow = 200.0
    static let mktPizza = 60.0
    static let mktLoyaltyShare = 0.03
    /// Each day the effect keeps this share. A window display fades slower: it lasts about 4 weeks.
    static let mktDecay = 0.85
    static let mktWindowDays = 28
    static let mktWindowEffect = 1.2
    /// The awareness that marketing adds at most, and how fast more effect wears out: 40 × (1 − e^(−effect / 4)).
    static let mktAwarenessMax = 40.0
    static let mktAwarenessScale = 4.0
    /// Awareness moves toward its target this fast while marketing runs.
    static let mktAwarenessPull = 0.05
    /// The maps listing: a lasting +5 awareness, and the rating counts 1.5 times as much.
    static let mktMapsAwareness = 5.0
    static let mktMapsRatingWeight = 1.5
    /// The school club and the loyalty program raise the loyalty target.
    static let mktSchoolLoyalty = 8.0
    static let mktLoyaltyProgram = 15.0
    /// The largest share that the channels add to one customer type.
    static let mktTypeBoostMax = 0.3
}

@MainActor
extension GameStore {
    var marketing: MarketingState { business.marketing ?? MarketingState() }

    func updateMarketing(_ change: (inout MarketingState) -> Void) {
        updateBusiness { b in
            var m = b.marketing ?? MarketingState()
            change(&m)
            b.marketing = m
        }
    }

    /// The weekly cost of a channel now. Social ads use their level.
    func channelCost(_ channel: MarketingChannel, level: Int = 0) -> Double {
        switch channel {
        case .flyers: Balance.mktFlyers
        case .paper: Balance.mktPaper
        case .social: Balance.mktSocial[max(0, min(2, level))]
        case .school: Balance.mktSchool
        case .window: Balance.mktWindow
        case .pizza: Balance.mktPizza
        case .maps, .loyalty: 0
        }
    }

    /// The days between payments of a running channel.
    private func payEvery(_ channel: MarketingChannel) -> Int { channel == .school ? 28 : 7 }

    /// Why the channel cannot start now, or nil.
    func channelBlock(_ channel: MarketingChannel, level: Int = 0) -> String? {
        guard data.cardStore != nil else { return "Open a store first." }
        if channel == .social && !hasAccount { return "Social ads need a social media account." }
        if let need = channel.minLevel, storeLevel.rawValue < need.rawValue { return "Unlocks at store level \(need.name)." }
        if channel == .maps && marketing.mapsListed { return "The store is listed." }
        if channel == .window, let d = marketing.windowDay, data.day - d < 7 { return "You refreshed the window this week." }
        let cost = channelCost(channel, level: level)
        if cost > 0, !canAfford(cost) { return "It costs \(money(cost)). You have \(money(cash))." }
        return nil
    }

    /// Starts a channel, lists the store, or refreshes the window. The first payment is now.
    @discardableResult
    func startChannel(_ channel: MarketingChannel, level: Int = 0) -> Bool {
        guard channelBlock(channel, level: level) == nil, let s = data.cardStore else { return false }
        let cost = channelCost(channel, level: level)
        if cost > 0 { addLedger(-cost, .businessCosts, "Marketing · \(channel.rawValue) · \(s.name)") }
        let today = data.day
        updateMarketing { m in
            m.weekSpent += cost
            switch channel {
            case .maps: m.mapsListed = true
            case .window:
                m.windowDay = today
                m.effect[channel.rawValue] = Balance.mktWindowEffect
            default:
                m.campaigns.removeAll { $0.channel == channel }
                m.campaigns.append(Campaign(channel: channel, startDay: today, nextPayDay: today + payEvery(channel), level: level))
            }
        }
        log(cost > 0 ? "Started \(channel.rawValue.lowercased()) for \(s.name): \(money(cost))." : "Started \(channel.rawValue.lowercased()) for \(s.name).",
            cash: cost > 0 ? -cost : nil)
        save()
        return true
    }

    func stopChannel(_ channel: MarketingChannel) {
        updateMarketing { $0.campaigns.removeAll { $0.channel == channel } }
        log("Stopped \(channel.rawValue.lowercased()).")
        save()
    }

    /// The total marketing effect now.
    var marketingEffect: Double { marketing.effect.values.reduce(0, +) }

    /// The awareness that marketing holds up now, on top of the floor.
    var marketingAwareness: Double {
        Balance.mktAwarenessMax * (1 - exp(-marketingEffect / Balance.mktAwarenessScale))
            + (marketing.mapsListed ? Balance.mktMapsAwareness : 0)
    }

    /// The marketing costs due in the next 30 days, for the forecast.
    var marketingForecast: Double {
        marketing.campaigns.reduce(0) { sum, c in
            let pays = c.channel == .school ? 1.0 : 30.0 / 7
            return sum + channelCost(c.channel, level: c.level) * pays
        }
    }

    // MARK: - End Day

    /// The marketing day: payments, the effect of each channel, awareness, the customer mix, attribution, and the
    /// weekly report. `record` is today's store day.
    func marketingDayEnd(customers: Int, revenue: Double) -> [String] {
        guard let s = data.cardStore else { return [] }
        let today = data.day
        var lines: [String] = []
        // Payments, at the End Day before each new week. A channel that cannot be paid stops.
        for c in marketing.campaigns where today + 1 >= c.nextPayDay {
            let cost = channelCost(c.channel, level: c.level)
            if canAfford(cost) {
                addLedger(-cost, .businessCosts, "Marketing · \(c.channel.rawValue) · \(s.name)")
                updateMarketing { m in
                    m.weekSpent += cost
                    if let i = m.campaigns.firstIndex(where: { $0.channel == c.channel }) { m.campaigns[i].nextPayDay = today + 1 + payEvery(c.channel) }
                }
            } else {
                updateMarketing { $0.campaigns.removeAll { $0.channel == c.channel } }
                lines.append("You could not pay for \(c.channel.rawValue.lowercased()), so it stopped.")
            }
        }
        // The loyalty program takes its share of the day's sales.
        if marketing.running(.loyalty) != nil, revenue > 0 {
            let cut = (revenue * Balance.mktLoyaltyShare * 100).rounded() / 100
            addLedger(-cut, .businessCosts, "Loyalty program · \(s.name)")
            updateMarketing { $0.weekSpent += cut }
        }
        // The effect of each channel.
        let follower = hasAccount ? 1 + 0.1 * Double(followerTier) : 1
        updateMarketing { m in
            for ch in MarketingChannel.allCases where ch.power > 0 || ch == .window {
                var e = (m.effect[ch.rawValue] ?? 0)
                if ch == .window {
                    e = m.windowDay.map { today - $0 < Balance.mktWindowDays ? Balance.mktWindowEffect * (1 - Double(today - $0) / Double(Balance.mktWindowDays)) : 0 } ?? 0
                } else {
                    e *= Balance.mktDecay
                    if let c = m.running(ch) {
                        let budget = ch == .social ? [1.0, 1.8, 3.0][max(0, min(2, c.level))] * follower : 1
                        e += ch.power * budget
                    }
                }
                m.effect[ch.rawValue] = e < 0.01 ? 0 : e
            }
        }
        // Customers that marketing brought: the awareness above the floor, shared by effect.
        let effect = marketing.effect.filter { $0.value > 0 }
        let total = effect.values.reduce(0, +)
        if customers > 0, total > 0 {
            let lift = marketingAwareness / 100
            let brought = Double(customers) * lift / (0.6 + business.awareness / 100)
            updateMarketing { m in
                for (ch, e) in effect { m.weekCustomers[ch, default: 0] += brought * e / total }
            }
        }
        // The customer mix leans toward the targets of the channels.
        updateBusiness { b in
            var boost: [CustomerType: Double] = [:]
            for (raw, e) in (b.marketing ?? MarketingState()).effect {
                guard let ch = MarketingChannel(rawValue: raw), !ch.targets.isEmpty else { continue }
                for t in ch.targets { boost[t, default: 0] += e * 0.05 / Double(ch.targets.count) }
            }
            b.typeBoost = boost.mapValues { min(Balance.mktTypeBoostMax, $0) }
        }
        // The weekly report, on the 7th day of each store week.
        if (today - s.leaseDay) % 7 == 6 {
            let m = marketing
            if m.weekSpent > 0 || !m.weekCustomers.isEmpty {
                let brought = m.weekCustomers.values.reduce(0, +)
                lines.append("Marketing this week: \(money(m.weekSpent)) spent, about \(Int(brought.rounded())) customers from it.")
            }
            updateMarketing { m in
                m.weeks.append(MarketingWeek(day: today, spent: m.weekSpent, customers: m.weekCustomers))
                if m.weeks.count > 12 { m.weeks.removeFirst() }
                m.weekSpent = 0
                m.weekCustomers = [:]
            }
        }
        return lines
    }

    /// The loyalty that marketing adds to the target.
    var marketingLoyalty: Double {
        (marketing.running(.school) != nil ? Balance.mktSchoolLoyalty : 0) + (marketing.running(.loyalty) != nil ? Balance.mktLoyaltyProgram : 0)
    }
}
