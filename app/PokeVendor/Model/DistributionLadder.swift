import Foundation

// The distribution ladder (docs/proposals/store-business.md, part 3). The hobby account has tiers: Store account,
// Preferred, and Premier. A quarterly review scores the account. A better tier buys for less, gets more allocation,
// and can buy on net-30 terms. Official event status sends free league promos and lists the store on the event
// locator. None of it touches the secondary wholesaler or the game before the store.

/// A distributor bill on net-30 terms.
struct Payable: Codable, Hashable, Identifiable {
    var id = UUID()
    let amount: Double
    let label: String
    let dueDay: Int
    /// True after the due day passed with no payment.
    var late = false
}

enum LadderTier: Int, CaseIterable {
    case store, preferred, premier

    var name: String {
        switch self {
        case .store: "Store account"
        case .preferred: "Preferred"
        case .premier: "Premier"
        }
    }

    /// The share of MSRP the account pays.
    var discount: Double {
        switch self {
        case .store: Balance.storeWholesaleDiscount
        case .preferred: 0.56
        case .premier: 0.54
        }
    }

    /// Extra cases of each product that is not hot, each week.
    var extraCases: Int { rawValue }

    /// The most that the account can owe on terms.
    var creditLimit: Double {
        switch self {
        case .store: 0
        case .preferred: 10_000
        case .premier: 25_000
        }
    }
}

extension Balance {
    static let ladderReviewDays = 84
    static let ladderPreferredScore = 60.0
    static let ladderPremierScore = 80.0
    /// Under this score the account drops one tier.
    static let ladderDropScore = 40.0
    static let termsDays = 30
    static let premierHotFill = 0.10
    /// Official event status: tournaments and league days with 8 players or more.
    static let eventStoreTournaments = 8
    static let eventStoreLeagues = 4
    static let eventStoreMinPlayers = 8
    static let eventStoreScore = 10.0
    /// The event locator brings more tournament players.
    static let eventStorePlayers = 1.15
}

@MainActor
extension GameStore {
    #if DEBUG
    /// Test tool: replaces the hot fill rate.
    static var forceHotFill: Double?
    #endif

    var ladderTier: LadderTier {
        guard hasStoreAccount else { return .store }
        return LadderTier(rawValue: data.distributor.ladderTier ?? 0) ?? .store
    }

    var payables: [Payable] { data.distributor.payables ?? [] }
    var payablesTotal: Double { payables.reduce(0) { $0 + $1.amount } }
    var onCreditHold: Bool { payables.contains { $0.late } }
    var isEventStore: Bool { data.distributor.eventStore == true && data.cardStore != nil && data.distributor.approvedDay != nil }

    /// True when the next order goes on net-30 terms.
    var buyingOnTerms: Bool { data.distributor.useTerms == true && ladderTier.creditLimit > 0 && !onCreditHold }

    func setUseTerms(_ on: Bool) {
        data.distributor.useTerms = on
        save()
    }

    /// Why an order of this total cannot go on terms now, or nil.
    func termsBlock(_ total: Double) -> String? {
        if onCreditHold { return "Your account is on credit hold. Pay the late bill first." }
        let room = ladderTier.creditLimit - payablesTotal
        if total > room { return "Your credit limit has \(money(max(0, room))) left." }
        return nil
    }

    /// Puts an order on terms: the cash comes back now as credit, and a bill comes due in 30 days. The order's charge
    /// and any refund stay as they are, so the ledger nets out to the order total when the bill is paid.
    func takeOnTerms(_ total: Double, label: String) {
        bizLedger(total, .wholesale, "Net 30 credit · \(label)")
        var list = payables
        list.append(Payable(amount: total, label: label, dueDay: data.day + Balance.termsDays))
        data.distributor.payables = list
    }

    /// Pays a bill now.
    @discardableResult
    func payPayable(_ id: UUID, quiet: Bool = false) -> Bool {
        guard let p = payables.first(where: { $0.id == id }), bizAfford(p.amount) else { return false }
        bizLedger(-p.amount, .wholesale, "Distributor bill · \(p.label)")
        data.distributor.payables = payables.filter { $0.id != id }
        if !p.late { data.distributor.onTime = (data.distributor.onTime ?? 0) + 1 }
        if !quiet {
            log("Paid the distributor \(money(p.amount)) for \(p.label).", cash: -p.amount)
            save()
        }
        return true
    }

    /// Notes an event for the official event status. Called from the store events.
    func noteEventForStatus(_ kind: StoreEventKind, players: Int) {
        guard players >= Balance.eventStoreMinPlayers else { return }
        switch kind {
        case .tournament: data.distributor.bigTournaments = (data.distributor.bigTournaments ?? 0) + 1
        case .league: data.distributor.bigLeagues = (data.distributor.bigLeagues ?? 0) + 1
        }
        data.distributor.quarterEvents = (data.distributor.quarterEvents ?? 0) + 1
    }

    /// The parts of the score now, for the review and the screen. Each part has its most.
    var ladderScoreParts: [(label: String, points: Double, max: Double)] {
        let a = data.distributor
        let spent = a.spent - (a.quarterSpentStart ?? 0)
        let share = hotShelfShare
        return [
            ("Spend this quarter (\(money(spent)))", min(30, spent / 1000 * 3), 30),
            ("Events with \(Balance.eventStoreMinPlayers)+ players (\(a.quarterEvents ?? 0))", min(20, Double(a.quarterEvents ?? 0) * 2), 20),
            ("Hot product on the shelf (\(share.map { "\(Int(($0 * 100).rounded()))%" } ?? "none sold"))", share.map { $0 * 20 } ?? 15, 20),
            ("Bills paid on time (\(a.lateThisQuarter ?? 0) late)", max(0, 20 - Double(a.lateThisQuarter ?? 0) * 10), 20),
            ("Store rating (\(String(format: "%.1f", storeRating))★)", min(10, max(0, (storeRating - 3) * 5)), 10),
        ] + (isEventStore ? [("Official event store", Balance.eventStoreScore, Balance.eventStoreScore)] : [])
    }

    var ladderScoreNow: Double { min(100, ladderScoreParts.reduce(0) { $0 + $1.points }) }

    var nextLadderReview: Int? {
        guard hasStoreAccount, let approved = data.distributor.approvedDay else { return nil }
        let last = data.distributor.lastReviewDay ?? approved
        return last + Balance.ladderReviewDays
    }

    // MARK: - End Day

    /// Bills that come due, official event status, and the quarterly review.
    func ladderEndDay() -> [String] {
        var lines: [String] = []
        let today = data.day
        // Bills: paid when due if the cash covers them. A bill that cannot be paid is late, and the account goes on hold.
        for p in payables where p.dueDay <= today {
            if bizAfford(p.amount) {
                payPayable(p.id, quiet: true)
                lines.append("Paid the distributor bill of \(money(p.amount)) for \(p.label).")
            } else if !p.late {
                data.distributor.payables = payables.map { $0.id == p.id ? Payable(id: $0.id, amount: $0.amount, label: $0.label, dueDay: $0.dueDay, late: true) : $0 }
                data.distributor.lateThisQuarter = (data.distributor.lateThisQuarter ?? 0) + 1
                lines.append("You could not pay the distributor bill of \(money(p.amount)). Your account is on credit hold until you pay it.")
            }
        }
        // Official event status.
        if data.cardStore != nil, data.distributor.eventStore != true,
           (data.distributor.bigTournaments ?? 0) >= Balance.eventStoreTournaments, (data.distributor.bigLeagues ?? 0) >= Balance.eventStoreLeagues {
            data.distributor.eventStore = true
            lines.append("Your store is an official event store now. The distributor sends the league promos free, and the event locator lists your tournaments.")
        }
        // An account from an older save starts its first quarter now, so the review does not count the whole run.
        if hasStoreAccount, data.distributor.quarterSpentStart == nil {
            data.distributor.quarterSpentStart = data.distributor.spent
            data.distributor.lastReviewDay = today
        }
        // The quarterly review.
        if let due = nextLadderReview, today >= due {
            let score = ladderScoreNow
            let before = ladderTier
            // Premier needs 80 and the Destination level. Preferred needs 60. From 40 to 59 an account keeps at most
            // Preferred. Under 40 it drops one tier.
            var tier = before.rawValue
            if score >= Balance.ladderPremierScore, storeLevel == .destination {
                tier = 2
            } else if score >= Balance.ladderPreferredScore {
                tier = 1
            } else if score >= Balance.ladderDropScore {
                tier = min(tier, 1)
            } else {
                tier = max(0, tier - 1)
            }
            data.distributor.ladderTier = tier
            data.distributor.score = score
            data.distributor.lastReviewDay = today
            data.distributor.quarterSpentStart = data.distributor.spent
            data.distributor.quarterEvents = 0
            data.distributor.lateThisQuarter = 0
            let now = LadderTier(rawValue: tier) ?? .store
            let move = now.rawValue > before.rawValue ? "You move up to \(now.name)." : now.rawValue < before.rawValue ? "You drop to \(now.name)." : "You stay at \(now.name)."
            lines.append("The distributor's quarterly review scored your account \(Int(score.rounded())) of 100. \(move)")
        }
        return lines
    }
}
