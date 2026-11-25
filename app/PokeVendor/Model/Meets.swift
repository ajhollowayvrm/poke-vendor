import Foundation

// Local meets and league night (docs/15-selling.md, Local meets; docs/17-calendar-and-events.md, Recurring entries).

/// The fixed weekly meets. Each one is a small encounter with the show haggle and the regulars.
enum MeetKind: String, Codable, CaseIterable, Hashable {
    case tradeNight, parkSwap, tradingCircle, leagueNight

    var label: String {
        switch self {
        case .tradeNight: "Trade night"
        case .parkSwap: "Park swap"
        case .tradingCircle: "Trading circle"
        case .leagueNight: "League night"
        }
    }

    /// Day 0 is Monday.
    var weekday: Int {
        switch self {
        case .tradeNight: 2
        case .parkSwap: 5
        case .tradingCircle: 6
        case .leagueNight: 3
        }
    }

    var open: Double {
        switch self {
        case .tradeNight: 18.5
        case .parkSwap: 13
        case .tradingCircle: 14
        case .leagueNight: 18
        }
    }

    var close: Double {
        switch self {
        case .tradeNight: 21
        case .parkSwap: 16
        case .tradingCircle: 17
        case .leagueNight: 21
        }
    }

    var place: String {
        switch self {
        case .tradeNight: "Community center"
        case .parkSwap: "Park pavilion"
        case .tradingCircle: "A member's home"
        case .leagueNight: "The game shop"
        }
    }

    /// The reputation tier that opens the meet. The trading circle is invite only (docs/04, tier 1).
    var minReputationTier: Int { self == .tradingCircle ? 1 : 0 }

    var icon: String {
        switch self {
        case .tradeNight: "person.2"
        case .parkSwap: "tree"
        case .tradingCircle: "person.3"
        case .leagueNight: "gamecontroller"
        }
    }

    /// The people who come (docs/29-packing-and-crowds.md).
    var crowd: Crowd {
        switch self {
        case .tradeNight: .tradeNight
        case .parkSwap: .parkSwap
        case .tradingCircle: .tradingCircle
        case .leagueNight: .leagueNight
        }
    }

    var hoursText: String { "\(GameStore.clock(open)) – \(GameStore.clock(close))" }

    /// How many binders other people have out, for a player who only browses (docs/17-calendar-and-events.md,
    /// Browse a meet). League night also has the shop's case.
    var browseBinders: ClosedRange<Int> {
        switch self {
        case .tradeNight: 3...5
        case .parkSwap: 2...4
        case .tradingCircle: 3...4
        case .leagueNight: 1...3
        }
    }
}

struct MeetRecord: Codable, Hashable {
    let kind: MeetKind
    let day: Int
}

extension Balance {
    /// The mean number of people who come to the player's spot at a meet in the whole window.
    static let meetVisitors = 10.0
    static let leagueVisitors = 6.0
    /// The hours a meet takes, travel included (docs/16-time-and-day.md).
    static let meetHours = 3.0
    /// Standing with the shop for one league night (docs/17-calendar-and-events.md).
    static let leagueStandingPoints = 3
    /// The share of meet visitors who sell to the player. A meet has more sellers than a show table.
    static let meetSellerShare = 0.30
    /// The chance that a meet visitor is a regular.
    static let meetRegularShare = 0.6
    /// The chance that someone comes up to a player who only browses, each time the player looks through a binder.
    static let meetBrowseApproach = 0.4
}

@MainActor
extension GameStore {
    /// The meets on today's weekday, league night included.
    var meetsToday: [MeetKind] { MeetKind.allCases.filter { $0.weekday == weekday } }

    /// The game shop that runs league night this week. The two shops take turns.
    func leagueShop(day: Int) -> LocalStore {
        let shops = LocalStore.allCases.filter(\.isGameShop)
        return shops[(day / 7) % max(1, shops.count)]
    }

    func attendedMeet(_ kind: MeetKind, day: Int? = nil) -> Bool {
        let d = day ?? data.day
        return data.meetsAttended.contains { $0.kind == kind && $0.day == d }
    }

    func meetUnlocked(_ kind: MeetKind) -> Bool { reputationTier >= kind.minReputationTier }

    /// Why the player cannot go now, or nil when they can.
    func meetBlock(_ kind: MeetKind) -> String? {
        guard kind.weekday == weekday else { return "Not today" }
        guard meetUnlocked(kind) else { return "Invite only · reputation \(ReputationTier.names[kind.minReputationTier])" }
        if attendedMeet(kind) { return "Done for today" }
        if let block = eventBlock { return block }
        if data.hour > kind.close - 1 { return "Over for today" }
        if worksToday, kind.open < Balance.workEnd, kind.close > Balance.workStart { return "You work today" }
        if let block = storeShiftBlock(from: max(data.hour, kind.open), to: kind.close) { return block }
        return nil
    }

    func canGoToMeet(_ kind: MeetKind) -> Bool { meetBlock(kind) == nil }

    /// Starts a meet. The clock jumps to the doors, and the meet ends when they close. With `browse`, the player has
    /// no spot: they pack a bag, look through other people's binders, and meet people who sell (docs/17, Browse a meet).
    func startMeet(_ kind: MeetKind, browse: Bool = false) -> ShowSession? {
        guard canGoToMeet(kind) else { return nil }
        data.hour = max(data.hour, kind.open)
        seedContacts()
        let league = kind == .leagueNight
        let shop = league ? leagueShop(day: data.day) : nil
        var venue = Venue(kind: league ? .leagueNight : .meet,
                          name: league ? "League night · \(shop?.rawValue ?? "")" : kind.label,
                          detail: "\(kind.place) · \(kind.hoursText)\(browse ? " · browsing" : "")", open: kind.open, close: kind.close,
                          hours: Balance.meetHours, visitorsMean: browse ? 0 : league ? Balance.leagueVisitors : Balance.meetVisitors,
                          sellerShare: Balance.meetSellerShare, regularShare: Balance.meetRegularShare,
                          hasFloor: browse, hasTable: !browse, fakeSource: .stranger, shop: shop, crowd: kind.crowd)
        // Only a player who browses walks around, so only they get stopped (docs/17, Browse a meet).
        if browse { venue.approachChance = Balance.meetBrowseApproach }
        save()
        return ShowSession(venue: venue, store: self, vendors: browse ? meetBinders(kind, shop: shop) : [],
                           regulars: browse ? [] : meetRegulars(kind))
    }

    /// The binders out at a meet: people clearing out or trading. At league night, the shop's case comes first.
    private func meetBinders(_ kind: MeetKind, shop: LocalStore?) -> [Vendor] {
        var used: Set<String> = []
        var binders: [Vendor] = []
        for _ in 0..<Int.random(in: kind.browseBinders) {
            var name = VendorKind.randomName(.collector)
            for _ in 0..<20 where used.contains(name) { name = VendorKind.randomName(.collector) }
            // After 20 tries, a repeated name is fine. The binder count stays what the doc says.
            used.insert(name)
            binders.append(Vendor(name: name, kind: .collector, items: VendorFloor.stock(.collector)))
        }
        // The shop's case is the shop itself: its standing sets the prices and the fake risk.
        if let shop {
            binders.insert(Vendor(name: "\(shop.rawValue) case", kind: .gameShop, items: VendorFloor.stock(.gameShop),
                                  contactID: shopContactID(shop)), at: 0)
        }
        return binders
    }

    /// The regulars who come to a meet. The same day always gives the same people.
    func meetRegulars(_ kind: MeetKind) -> [String] {
        var r = SeededRandom(seed: UInt64(data.day + 1) &* 92_821 &+ UInt64(kind.weekday) &* 131)
        return data.contacts.filter { c in
            guard !c.kind.isVendor, c.kind != .gameShop, !c.kind.isSupplier else { return false }
            let roll = r.next()
            return kind == .tradingCircle ? roll < 0.7 : (c.atLocalShows && roll < 0.5)
        }.map(\.id).shuffled()
    }

    func recordMeet(_ venue: Venue) {
        let kind: MeetKind? = venue.kind == .leagueNight ? .leagueNight
            : MeetKind.allCases.first { $0.label == venue.name && $0 != .leagueNight }
        guard let kind else { return }
        let today = data.day
        data.meetsAttended.append(MeetRecord(kind: kind, day: today))
        data.meetsAttended.removeAll { $0.day < today - 14 }
    }
}
