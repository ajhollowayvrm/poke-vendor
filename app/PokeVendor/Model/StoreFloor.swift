import Foundation

// The floor, rivals, and morning decisions (docs/proposals/store-business.md, parts 6 and 8). The layout has room for
// two of three setups. Items that sit 60 days are dead stock, and a markdown puts them on clearance. Some mornings bring
// a short choice. Rival shops make moves: a price war, an event clash, or a new shop nearby.

enum FloorSetup: String, Codable, CaseIterable, Identifiable {
    case impulseRack = "Impulse rack by the register"
    case slabsFront = "Slabs at the front"
    case playArea = "Play area in view"

    var id: String { rawValue }

    var detail: String {
        switch self {
        case .impulseRack: "Packs by the register. Customers pick packs \(Int(((Balance.impulsePackWeight - 1) * 100).rounded()))% more often."
        case .slabsFront: "The slab case by the door. More collectors come in."
        case .playArea: "The play tables in the window. More players come in. Needs the play tables."
        }
    }
}

enum DecisionKind: String, Codable, CaseIterable {
    case birthdayParty, newsCrew, scalperLine, tradeDispute, leakyRoof

    var title: String {
        switch self {
        case .birthdayParty: "A birthday party"
        case .newsCrew: "A local news crew"
        case .scalperLine: "A line at the door"
        case .tradeDispute: "A trade dispute"
        case .leakyRoof: "A leak in the roof"
        }
    }

    var text: String {
        switch self {
        case .birthdayParty: "A parent wants to book the play tables for a birthday party this weekend. They offer \(money(Balance.partyFee)). It takes \(formatHours(Balance.partyHours)) of your time, or your manager's."
        case .newsCrew: "Channel 4 wants to film a story about the card boom at your store. It takes \(formatHours(Balance.newsHours)) of your time today."
        case .scalperLine: "Resellers lined up before opening. They want every sealed box you have."
        case .tradeDispute: "A parent says your staff gave their kid a bad trade, and wants \(money(Balance.disputeRefund)) back."
        case .leakyRoof: "Water drips over the sealed wall. A roofer can fix it today for \(money(Balance.roofFix))."
        }
    }

    var yes: String {
        switch self {
        case .birthdayParty: "Book it"
        case .newsCrew: "Do the interview"
        case .scalperLine: "Limit 1 each"
        case .tradeDispute: "Refund it"
        case .leakyRoof: "Fix it"
        }
    }

    var no: String {
        switch self {
        case .birthdayParty: "Decline"
        case .newsCrew: "Decline"
        case .scalperLine: "Sell them all"
        case .tradeDispute: "Stand firm"
        case .leakyRoof: "Leave it"
        }
    }
}

struct Decision: Codable, Hashable {
    let kind: DecisionKind
    let day: Int
}

enum RivalMoveKind: String, Codable {
    case priceWar, eventClash, newShop

    var title: String {
        switch self {
        case .priceWar: "Price war"
        case .eventClash: "Event clash"
        case .newShop: "A new shop nearby"
        }
    }
}

struct RivalMove: Codable, Hashable {
    let kind: RivalMoveKind
    let rival: String
    /// The last day of the move. A new shop stays: nil.
    let untilDay: Int?
}

extension Balance {
    static let floorSetupMax = 2
    static let floorChangeCost = 100.0
    static let floorChangeHours = 1.0
    static let impulsePackWeight = 1.5
    static let floorTypeBoost = 0.06
    static let deadStockDays = 60
    static let clearanceFactor = 0.8
    static let decisionChance = 0.25
    static let partyFee = 150.0
    static let partyHours = 1.5
    static let newsHours = 2.0
    static let newsAwareness = 8.0
    static let disputeRefund = 40.0
    static let roofFix = 250.0
    static let roofDamageChance = 0.4
    /// A rival move: the chance at each month-end review, and the effects.
    static let rivalMoveChance = 0.25
    static let rivalMoveDays = 14
    static let priceWarTraffic = 0.88
    static let eventClashPlayers = 0.7
    static let newShopTraffic = 0.95
}

@MainActor
extension GameStore {
    // MARK: - Layout

    var floorSetups: [FloorSetup] { (business.floor ?? []).compactMap(FloorSetup.init(rawValue:)) }

    func floorBlock(_ setup: FloorSetup) -> String? {
        let on = floorSetups
        if on.contains(setup) { return nil }
        if on.count >= Balance.floorSetupMax { return "The floor has room for \(Balance.floorSetupMax). Take one out first." }
        if setup == .playArea, data.cardStore?.has(.playTables) != true { return "Needs the play tables." }
        if !canAfford(Balance.floorChangeCost) { return "It costs \(money(Balance.floorChangeCost))." }
        if slot(for: Balance.floorChangeHours) == nil { return "There is no time left today." }
        return nil
    }

    /// Puts a setup on the floor, or takes it off. Adding costs money and an hour. Taking off is free.
    func toggleFloor(_ setup: FloorSetup) {
        var on = floorSetups
        if on.contains(setup) {
            on.removeAll { $0 == setup }
        } else {
            guard floorBlock(setup) == nil, spendHours(Balance.floorChangeHours) else { return }
            addLedger(-Balance.floorChangeCost, .storeSetup, "Floor change · \(setup.rawValue)")
            on.append(setup)
            log("Moved the floor around: \(setup.rawValue.lowercased()).", cash: -Balance.floorChangeCost)
        }
        updateBusiness { $0.floor = on.map(\.rawValue) }
        save()
    }

    var impulseRack: Bool { floorSetups.contains(.impulseRack) }

    /// The customer-type boosts of the layout.
    var floorTypeBoost: [CustomerType: Double] {
        var out: [CustomerType: Double] = [:]
        if floorSetups.contains(.slabsFront) { out[.collectors] = Balance.floorTypeBoost }
        if floorSetups.contains(.playArea) { out[.players] = Balance.floorTypeBoost }
        return out
    }

    // MARK: - Dead stock

    /// Items in the store for 60 days or more.
    var deadStock: [(id: UUID, name: String, market: Double, days: Int)] {
        var out: [(UUID, String, Double, Int)] = []
        for c in data.raw + data.slabs {
            if case .inStore(let since) = c.status, data.day - since >= Balance.deadStockDays {
                out.append((c.id, c.print.name + (c.grade.map { " \($0.label)" } ?? ""), c.market, data.day - since))
            }
        }
        for s in data.sealed {
            if case .inStore(let since) = s.status, data.day - since >= Balance.deadStockDays {
                out.append((s.id, s.name, market(of: s), data.day - since))
            }
        }
        return out.sorted { $0.3 > $1.3 }.map { (id: $0.0, name: $0.1, market: $0.2, days: $0.3) }
    }

    func isOnClearance(_ id: UUID) -> Bool { business.clearance?.contains(id.uuidString) == true }

    /// Puts items on clearance: they sell at 80% of market.
    func markDown(_ ids: [UUID]) {
        let keys = ids.map(\.uuidString)
        updateBusiness { b in b.clearance = Array(Set((b.clearance ?? []) + keys)) }
        log("Put \(ids.count) item\(ids.count == 1 ? "" : "s") on clearance at \(Int(Balance.clearanceFactor * 100))% of market.")
        save()
    }

    // MARK: - Morning decisions

    var pendingDecision: Decision? {
        guard let d = business.decision, d.day == data.day else { return nil }
        return d
    }

    /// Answers today's decision. `yes` is the first choice.
    func answerDecision(_ yes: Bool) {
        guard let d = pendingDecision, let s = data.cardStore else { return }
        var line = ""
        switch d.kind {
        case .birthdayParty:
            if yes {
                if !hasManager, !spendHours(Balance.partyHours) { line = "You had no time for the party, so you declined." } else {
                    addLedger(Balance.partyFee, .storeEvents, "Birthday party · \(s.name)")
                    updateBusiness { $0.loyalty = min(100, $0.loyalty + 2); $0.awareness = min(100, $0.awareness + 1) }
                    line = "Hosted a birthday party for \(money(Balance.partyFee)). The parents will tell their friends."
                }
            } else { line = "Declined the birthday party." }
        case .newsCrew:
            if yes, spendHours(Balance.newsHours) {
                updateBusiness { $0.awareness = min(100, $0.awareness + Balance.newsAwareness) }
                line = "Channel 4 aired the story: +\(Int(Balance.newsAwareness)) awareness."
            } else { line = yes ? "You had no time for the interview." : "Declined the news crew." }
        case .scalperLine:
            if yes {
                addReview(5, "They kept it fair: one per person.")
                updateBusiness { $0.loyalty = min(100, $0.loyalty + 2) }
                line = "You held the line at 1 each. The regulars noticed."
            } else {
                let sold = sellToLine()
                addReview(2, "Scalpers cleaned out the shelves before I got in.")
                line = sold > 0 ? "The line bought \(sold) sealed item\(sold == 1 ? "" : "s"). The regulars were not happy." : "There was nothing for the line to buy."
            }
        case .tradeDispute:
            if yes {
                addLedger(-Balance.disputeRefund, .storeEvents, "Trade refund · \(s.name)")
                addReview(5, "They made a bad trade right, no questions asked.")
                line = "Refunded \(money(Balance.disputeRefund)). The parent left happy."
            } else {
                addReview(1, "The staff ripped off my kid and the owner did nothing.")
                line = "You stood firm. The parent left a 1-star review."
            }
        case .leakyRoof:
            if yes {
                addLedger(-Balance.roofFix, .storeSetup, "Roof repair · \(s.name)")
                line = "The roofer fixed the leak for \(money(Balance.roofFix))."
            } else if Double.random(in: 0..<1) < Balance.roofDamageChance, let hit = storeStock.sealed.randomElement() {
                data.sealed.removeAll { $0.id == hit.id }
                line = "Water ruined the \(hit.name) on the sealed wall."
            } else { line = "You left the leak. Nothing got wet this time." }
        }
        updateBusiness { $0.decision = nil }
        log(line)
        save()
    }

    private func addReview(_ stars: Int, _ text: String) {
        let review = StoreReview(day: data.day, stars: stars, text: text)
        updateBusiness { $0.reviews.append(review) }
    }

    /// The line buys up to 3 sealed items at the shelf price.
    private func sellToLine() -> Int {
        let items = storeShelf().filter { !$0.isCard }.prefix(3)
        guard let s = data.cardStore else { return 0 }
        for item in items { _ = sellFromStore(item, price: shelfPrice(item), storeName: s.name) }
        return items.count
    }

    // MARK: - Rivals

    var rivalMoves: [RivalMove] { (business.rivals ?? []).filter { $0.untilDay.map { data.day <= $0 } ?? true } }

    /// The traffic factor of the rivals. A price war hurts less when the singles are at market or under.
    var rivalTrafficFactor: Double {
        guard let s = data.cardStore else { return 1 }
        var f = 1.0
        for m in rivalMoves {
            switch m.kind {
            case .priceWar: if s.singlesPrice > 1.0 { f *= Balance.priceWarTraffic }
            case .newShop: f *= Balance.newShopTraffic
            case .eventClash: break
            }
        }
        return f
    }

    var eventClash: Bool { rivalMoves.contains { $0.kind == .eventClash } }

    // MARK: - End Day

    /// A new decision for tomorrow, rival moves at the month-end review, and old clearance keys.
    func floorDayEnd(monthEnd: Bool) -> [String] {
        guard let s = data.cardStore, storeSells(on: data.day) else { return [] }
        var lines: [String] = []
        let tomorrow = data.day + 1
        if s.openDays.contains(tomorrow % 7), Double.random(in: 0..<1) < Balance.decisionChance {
            var kinds = DecisionKind.allCases
            if !s.has(.playTables) { kinds.removeAll { $0 == .birthdayParty } }
            if let kind = kinds.randomElement() {
                updateBusiness { $0.decision = Decision(kind: kind, day: tomorrow) }
                lines.append("Tomorrow at \(s.name): \(kind.title.lowercased()). Decide on the store screen.")
            }
        }
        if monthEnd, Double.random(in: 0..<1) < Balance.rivalMoveChance {
            let rival = s.location == .mainStreet ? "Cardboard Castle" : "Top Deck Games"
            var kinds: [RivalMoveKind] = [.priceWar, .eventClash]
            if !(business.rivals ?? []).contains(where: { $0.kind == .newShop }) { kinds.append(.newShop) }
            if let kind = kinds.randomElement() {
                let move = RivalMove(kind: kind, rival: kind == .newShop ? "Pallet Town Cards" : rival,
                                     untilDay: kind == .newShop ? nil : data.day + Balance.rivalMoveDays)
                updateBusiness { $0.rivals = ($0.rivals ?? []).filter { $0.untilDay.map { d in d >= tomorrow } ?? true } + [move] }
                switch kind {
                case .priceWar: lines.append("\(move.rival) cut its singles prices for 2 weeks. At market or under, you keep your customers.")
                case .eventClash: lines.append("\(move.rival) moved its tournament to your night for 2 weeks. Fewer players come to yours.")
                case .newShop: lines.append("A new card shop, \(move.rival), opened nearby. You lose a few customers for good. Marketing and events win them back.")
                }
            }
        }
        // Clearance keys of items that left the store.
        let inStore = Set((storeStock.cards.map(\.id) + storeStock.sealed.map(\.id)).map(\.uuidString))
        if let keys = business.clearance, keys.contains(where: { !inStore.contains($0) }) {
            updateBusiness { $0.clearance = keys.filter { inStore.contains($0) } }
        }
        return lines
    }
}
