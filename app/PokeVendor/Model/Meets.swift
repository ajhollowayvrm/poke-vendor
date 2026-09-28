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

    var hoursText: String { "\(GameStore.clock(open)) – \(GameStore.clock(close))" }
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
        if data.hour > kind.close - 1 { return "Over for today" }
        if worksToday, kind.open < Balance.workEnd, kind.close > Balance.workStart { return "You work today" }
        return nil
    }

    func canGoToMeet(_ kind: MeetKind) -> Bool { meetBlock(kind) == nil }

    /// Starts a meet. The clock jumps to the doors, and the meet ends when they close.
    func startMeet(_ kind: MeetKind) -> ShowSession? {
        guard canGoToMeet(kind) else { return nil }
        data.hour = max(data.hour, kind.open)
        seedContacts()
        let league = kind == .leagueNight
        let shop = league ? leagueShop(day: data.day) : nil
        let venue = Venue(kind: league ? .leagueNight : .meet,
                          name: league ? "League night · \(shop?.rawValue ?? "")" : kind.label,
                          detail: "\(kind.place) · \(kind.hoursText)", open: kind.open, close: kind.close,
                          hours: Balance.meetHours, visitorsMean: league ? Balance.leagueVisitors : Balance.meetVisitors,
                          sellerShare: Balance.meetSellerShare, regularShare: Balance.meetRegularShare,
                          hasFloor: false, hasTable: true, fakeSource: .stranger, shop: shop)
        save()
        return ShowSession(venue: venue, store: self, vendors: [], regulars: meetRegulars(kind))
    }

    /// The regulars who come to a meet. The same day always gives the same people.
    func meetRegulars(_ kind: MeetKind) -> [String] {
        var r = SeededRandom(seed: UInt64(data.day + 1) &* 92_821 &+ UInt64(kind.weekday) &* 131)
        return data.contacts.filter { c in
            guard !c.kind.isVendor, c.kind != .gameShop else { return false }
            let roll = r.next()
            return kind == .tradingCircle ? roll < 0.7 : (c.atLocalShows && roll < 0.5)
        }.map(\.id).shuffled()
    }

    func recordMeet(_ venue: Venue) {
        let kind: MeetKind? = venue.kind == .leagueNight ? .leagueNight
            : MeetKind.allCases.first { $0.label == venue.name && $0 != .leagueNight }
        guard let kind else { return }
        data.meetsAttended.append(MeetRecord(kind: kind, day: data.day))
        data.meetsAttended.removeAll { $0.day < data.day - 14 }
    }

    /// Test tool: a meet right now, on any weekday.
    func testStartMeet(_ kind: MeetKind) -> ShowSession? {
        data.meetsAttended.removeAll { $0.kind == kind && $0.day == data.day }
        if data.hour > kind.close - 1 { data.hour = max(Balance.dayStart, kind.open - 0.5) }
        seedContacts()
        let league = kind == .leagueNight
        let shop = league ? leagueShop(day: data.day) : nil
        let venue = Venue(kind: league ? .leagueNight : .meet,
                          name: league ? "League night · \(shop?.rawValue ?? "")" : kind.label,
                          detail: "\(kind.place) · \(kind.hoursText)", open: kind.open, close: kind.close,
                          hours: Balance.meetHours, visitorsMean: league ? Balance.leagueVisitors : Balance.meetVisitors,
                          sellerShare: Balance.meetSellerShare, regularShare: Balance.meetRegularShare,
                          hasFloor: false, hasTable: true, fakeSource: .stranger, shop: shop)
        data.hour = max(data.hour, kind.open)
        save()
        return ShowSession(venue: venue, store: self, vendors: [], regulars: meetRegulars(kind))
    }
}
