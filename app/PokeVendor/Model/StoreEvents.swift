import Foundation

// Events at the player's own store (docs/22-own-store.md#events). Both events need the play tables.

enum StoreEventKind: String, Codable, CaseIterable, Hashable {
    case league, tournament

    var name: String {
        switch self {
        case .league: "Pokemon League"
        case .tournament: "Friday tournament"
        }
    }

    var icon: String {
        switch self {
        case .league: "figure.2.and.child.holdinghands"
        case .tournament: "trophy"
        }
    }
}

/// What the player set for the events, and what the events built up. Nil in `CardStoreState` until the player opens the events box.
struct StoreEvents: Codable, Hashable {
    var leagueOn = false
    /// 5 is Saturday and 6 is Sunday.
    var leagueWeekday = 5
    var leagueFee = Balance.leagueFees[0]
    var tournamentOn = true
    var tournamentFee = Balance.tournamentDefaultFee
    /// How much players like the tournament prizes. It moves attendance.
    var standing = 1.0
    /// The players at the last event. They keep coming in for a few days.
    var afterglowPlayers = 0
    var afterglowDay = -100
}

extension CardStoreState {
    var eventPlan: StoreEvents { events ?? StoreEvents() }
}

extension Balance {
    static let leagueWeekdays = [5, 6]
    /// Entry fee for the league. The first option is free.
    static let leagueFees = [0.0, 2.0, 5.0]
    static let leaguePlayers = 6...14
    /// Each league player gets one promo card from the distributor.
    static let leaguePromoCost = 0.75
    /// Fewer players come when the fee goes up: 1 − 6% for each dollar.
    static let leagueFeeDrop = 0.06
    static let tournamentFees = [5.0, 10.0, 15.0, 20.0]
    static let tournamentDefaultFee = 10.0
    /// Attendance is 1.5 − 5% for each dollar of the fee.
    static let tournamentFeeDrop = 0.05
    /// Prize packs that the store owes for each player.
    static let tournamentPrizePerPlayer = 0.7
    static let eventAttendanceFloor = 0.3
    /// The tournament standing, from poor prizes to good prizes.
    static let eventStandingRange = 0.5...1.5
    /// The standing moves by this much for each full step between the prize support and the target.
    static let eventStandingStep = 0.25
    static let eventStandingTarget = 0.6
    /// The player at the counter in person: more people come.
    static let eventHostBonus = 1.15
    /// Extra customers for each tournament player, each league player, and on the days after an event.
    static let tournamentWalkInShare = 0.5
    static let leagueWalkInShare = 0.8
    static let afterglowDays = 3
    static let afterglowShare = 0.3
    /// Tournament players buy singles more than packs. A pack is this likely to be picked, compared to a single.
    static let eventPackWeight = 0.4
    /// The league adds small-budget customers.
    static let leagueCasualBoost = 0.25
}

@MainActor
extension GameStore {
    // MARK: - Settings

    func setEvent(_ kind: StoreEventKind, on: Bool) {
        guard var s = data.cardStore else { return }
        var plan = s.eventPlan
        switch kind {
        case .league: plan.leagueOn = on
        case .tournament: plan.tournamentOn = on
        }
        s.events = plan
        data.cardStore = s
        save()
    }

    func setEventFee(_ kind: StoreEventKind, _ fee: Double) {
        guard var s = data.cardStore else { return }
        var plan = s.eventPlan
        switch kind {
        case .league: plan.leagueFee = fee
        case .tournament: plan.tournamentFee = fee
        }
        s.events = plan
        data.cardStore = s
        save()
    }

    func setLeagueDay(_ weekday: Int) {
        guard var s = data.cardStore, Balance.leagueWeekdays.contains(weekday) else { return }
        var plan = s.eventPlan
        plan.leagueWeekday = weekday
        s.events = plan
        data.cardStore = s
        save()
    }

    // MARK: - Attendance

    /// The event on this weekday, if the player turned it on and owns the play tables.
    func storeEvent(onWeekday weekday: Int, in s: CardStoreState) -> StoreEventKind? {
        guard s.has(.playTables) else { return nil }
        let plan = s.eventPlan
        if plan.tournamentOn, weekday == 4 { return .tournament }
        if plan.leagueOn, weekday == plan.leagueWeekday { return .league }
        return nil
    }

    /// The scale on the base number of players: reputation, standing, the fee, and the player at the counter.
    private func attendanceScale(_ kind: StoreEventKind, _ plan: StoreEvents, hosted: Bool) -> Double {
        let tier = Double(reputationTier)
        var scale: Double
        switch kind {
        case .tournament:
            scale = (1 + 0.1 * tier) * plan.standing
            scale *= max(Balance.eventAttendanceFloor, 1.5 - Balance.tournamentFeeDrop * plan.tournamentFee)
        case .league:
            scale = 1 + 0.05 * tier
            scale *= max(Balance.eventAttendanceFloor, 1 - Balance.leagueFeeDrop * plan.leagueFee)
        }
        return hosted ? scale * Balance.eventHostBonus : scale
    }

    private func playerRange(_ kind: StoreEventKind) -> ClosedRange<Int> {
        kind == .tournament ? Balance.tournamentPlayers : Balance.leaguePlayers
    }

    func expectedPlayers(_ kind: StoreEventKind, plan: StoreEvents, hosted: Bool) -> Double {
        let range = playerRange(kind)
        return Double(range.lowerBound + range.upperBound) / 2 * attendanceScale(kind, plan, hosted: hosted)
    }

    private func rollPlayers(_ kind: StoreEventKind, _ plan: StoreEvents, hosted: Bool) -> Int {
        let range = playerRange(kind)
        let base = Double.random(in: Double(range.lowerBound)...Double(range.upperBound))
        return Int((base * attendanceScale(kind, plan, hosted: hosted)).rounded())
    }

    /// The extra customers that events bring on a day: players in the store, and the regulars from the last event.
    func eventTraffic(day: Int) -> (tournament: Double, league: Double, glow: Double) {
        guard let s = data.cardStore else { return (0, 0, 0) }
        let plan = s.eventPlan
        var out = (tournament: 0.0, league: 0.0, glow: 0.0)
        // An event runs only with someone in the store.
        if s.clerk || s.counterDay == day, let kind = storeEvent(onWeekday: day % 7, in: s) {
            let players = expectedPlayers(kind, plan: plan, hosted: s.counterDay == day)
            switch kind {
            case .tournament: out.tournament = players * Balance.tournamentWalkInShare
            case .league: out.league = players * Balance.leagueWalkInShare
            }
        }
        let since = day - plan.afterglowDay
        if since >= 1, since <= Balance.afterglowDays {
            let left = Double(Balance.afterglowDays - since + 1) / Double(Balance.afterglowDays)
            out.glow = Double(plan.afterglowPlayers) * Balance.afterglowShare * left
        }
        return out
    }

    // MARK: - The event at day end

    /// Runs the event for today, if there is one. The packs for prizes come out of the store's loose packs.
    func runStoreEvents(_ s: inout CardStoreState, record: inout StoreDay, worked: Double, today: Int) -> [String] {
        guard s.clerk || worked > 0, let kind = storeEvent(onWeekday: today % 7, in: s) else { return [] }
        var plan = s.eventPlan
        let hosted = worked > 0
        let players = rollPlayers(kind, plan, hosted: hosted)
        var line: String
        switch kind {
        case .tournament:
            let fees = Double(players) * plan.tournamentFee
            let wanted = max(1, Int((Double(players) * Balance.tournamentPrizePerPlayer).rounded()))
            let given = givePrizePacks(wanted)
            if fees > 0 { addLedger(fees, .storeEvents, "\(kind.name) · \(players) players · \(s.name)") }
            record.revenue += fees
            line = "\(players) players came to the \(kind.name) at \(s.name). You gave \(given) pack\(given == 1 ? "" : "s") as prizes."
            if fees > 0 { line += " Entry fees: \(money(fees))." }
            if given < wanted { line += " The store had too few loose packs. Fewer players will come next time." }
            let support = Double(given) / Double(wanted)
            let moved = plan.standing + (support - Balance.eventStandingTarget) * Balance.eventStandingStep
            plan.standing = min(max(moved, Balance.eventStandingRange.lowerBound), Balance.eventStandingRange.upperBound)
        case .league:
            let fees = Double(players) * plan.leagueFee
            let promo = Double(players) * Balance.leaguePromoCost
            if fees > 0 { addLedger(fees, .storeEvents, "\(kind.name) · \(players) players · \(s.name)") }
            addLedger(-promo, .storeEvents, "League promo cards · \(s.name)")
            record.revenue += fees
            record.costs += promo
            line = "\(players) players came to the \(kind.name) at \(s.name). You gave each one a promo card."
            if fees > 0 { line += " Entry fees: \(money(fees))." }
        }
        plan.afterglowPlayers = players
        plan.afterglowDay = today
        s.events = plan
        return [line]
    }

    /// Gives the cheapest loose packs in the store as prizes. Returns how many it gave.
    private func givePrizePacks(_ wanted: Int) -> Int {
        let packs = storeStock.sealed.filter { $0.packs == 1 }.sorted { realMarket(of: $0) < realMarket(of: $1) }
        let ids = Set(packs.prefix(wanted).map(\.id))
        data.sealed.removeAll { ids.contains($0.id) }
        return ids.count
    }

    // MARK: - Calendar

    func storeEventEntries(day: Int) -> [CalendarEntry] {
        guard let s = data.cardStore, day >= s.openDay, s.openDays.contains(day % 7),
              let kind = storeEvent(onWeekday: day % 7, in: s) else { return [] }
        let plan = s.eventPlan
        let fee = kind == .tournament ? plan.tournamentFee : plan.leagueFee
        let when = kind == .tournament ? "Evening" : "Morning"
        return [CalendarEntry(kind: .store, title: "\(kind.name) · \(s.name)",
                              detail: "\(when) · \(fee > 0 ? "\(money(fee)) entry" : "Free entry")")]
    }

    // MARK: - Shoplifting

    /// Takes one thing off the shelves: usually loose packs, sometimes a cheap sealed item, rarely a cheap card.
    /// Returns what the thief took, or nil if nothing fits.
    func stealFromStore() -> String? {
        let shelf = storeShelf()
        let packs = shelf.filter { !$0.isCard && $0.isPack }
        let sealed = shelf.filter { !$0.isCard && !$0.isPack && $0.market <= Balance.shopliftMaxSealed }
        let cards = shelf.filter { $0.isCard && $0.market <= Balance.shopliftMaxValue }
        let roll = Double.random(in: 0..<1)
        let order = roll < Balance.shopliftPackShare ? [packs, sealed, cards]
            : roll < Balance.shopliftPackShare + Balance.shopliftSealedShare ? [sealed, packs, cards] : [cards, packs, sealed]
        guard let pool = order.first(where: { !$0.isEmpty }) else { return nil }
        // A thief takes a few packs from the rack, but only one of anything else.
        let take = pool.first?.isPack == true ? Int.random(in: 1...Balance.shopliftMaxPacks) : 1
        let items = Array(pool.shuffled().prefix(take))
        let ids = Set(items.map(\.id))
        data.raw.removeAll { ids.contains($0.id) }
        data.slabs.removeAll { ids.contains($0.id) }
        data.sealed.removeAll { ids.contains($0.id) }
        let value = items.reduce(0) { $0 + $1.market }
        let name = items.count == 1 ? items[0].name : "\(items.count) \(items[0].name)"
        let owed = payConsignedTheft(ids)
        return "\(name) (\(money(value))" + (owed > 0 ? ", and you paid \(money(owed)) to the owner of a consigned card)" : ")")
    }

    func shopliftChance(for location: StoreLocation) -> Double {
        Balance.shopliftChance * location.traffic / Balance.shopliftTrafficBase
    }
}
