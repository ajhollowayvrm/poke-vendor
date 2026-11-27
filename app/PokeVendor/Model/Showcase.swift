import Foundation

// The showcase (docs/08-ui-direction.md, The showcase). The showcase case upgrade opens a lit case for the player's
// biggest cards: $1,000 or more each. A showcase card is out of the regular Inventory. The player can bring the
// showcase to a table: more people come, whales come more often, some whales ask to buy a showcase card at the PC
// premium or more, and people post about it (docs/20-card-shows.md, The showcase).

extension Balance {
    static let showcaseCost = 750.0
    static let showcaseSlots = 6
    /// The lowest market of a card that goes into the showcase.
    static let showcaseMinValue = 1_000.0
    /// The minutes to set up the showcase at a table.
    static let showcaseSetupMinutes = 10.0
    /// More visitors: 5% times the square root of the value in thousands, at most 25%.
    static let showcaseDrawPerRoot = 0.05
    static let showcaseDrawCap = 0.25
    /// The chance that a visitor is a whale: 3%, plus 1.5% times the square root of the value in thousands, at most 12%.
    static let showcaseWhaleBase = 0.03
    static let showcaseWhalePerRoot = 0.015
    static let showcaseWhaleCap = 0.12
    /// The share of whales who ask about a showcase card. The rest look at the table.
    static let showcaseAskShare = 0.35
    /// A whale's top price as a share of market: a table item, and a showcase card.
    static let whaleTableTop = 1.0...1.15
    static let showcaseBuyerTop = 1.3...1.6
    /// Each visit with the showcase out: followers (1.5 times the square root of the value, at most 400) and
    /// reputation (+1, or +2 for a showcase of $10,000 or more).
    static let showcaseFollowersPerRoot = 1.5
    static let showcaseFollowersCap = 400
    static let showcaseBigValue = 10_000.0
}

@MainActor
extension GameStore {
    /// The cards in the showcase, dearest first.
    var showcaseCards: [OwnedCard] { (data.slabs + data.raw).filter(\.inShowcase).sorted { $0.market > $1.market } }

    var showcaseValue: Double { showcaseCards.reduce(0) { $0 + $1.market } }

    /// Why the card cannot go into the showcase, or nil when it can.
    func showcaseBlock(_ card: OwnedCard) -> String? {
        if !hasUpgrade(.showcaseCase) { return "Buy the showcase case in Upgrades first." }
        if card.inShowcase { return "The card is in the showcase." }
        if card.status != nil { return "The card has a status." }
        if card.isKnownFake { return "You know the card is a fake." }
        if card.market < Balance.showcaseMinValue { return "The showcase takes cards of \(money(Balance.showcaseMinValue)) or more." }
        if showcaseCards.count >= Balance.showcaseSlots { return "The showcase is full: \(Balance.showcaseSlots) cards." }
        return nil
    }

    /// Puts a card into the showcase. It leaves the PC or its master set.
    func addToShowcase(_ id: UUID) {
        guard let card = card(id), showcaseBlock(card) == nil else { return }
        if let i = data.raw.firstIndex(where: { $0.id == id }) {
            data.raw[i].showcase = true
            data.raw[i].pc = false
            data.raw[i].masterSet = nil
        } else if let i = data.slabs.firstIndex(where: { $0.id == id }) {
            data.slabs[i].showcase = true
            data.slabs[i].pc = false
            data.slabs[i].masterSet = nil
        }
        save()
    }

    /// Takes a card out of the showcase, back to the regular Inventory.
    func removeFromShowcase(_ id: UUID) {
        if let i = data.raw.firstIndex(where: { $0.id == id }) { data.raw[i].showcase = nil }
        if let i = data.slabs.firstIndex(where: { $0.id == id }) { data.slabs[i].showcase = nil }
        save()
    }

    /// The square root of the showcase value in thousands. The showcase effects grow with it.
    private var showcaseRoot: Double { (showcaseValue / 1_000).squareRoot() }

    /// The share of more visitors that the showcase draws.
    var showcaseDraw: Double { min(Balance.showcaseDrawCap, Balance.showcaseDrawPerRoot * showcaseRoot) }

    /// The chance that a visitor at the table is a whale.
    var showcaseWhaleChance: Double {
        min(Balance.showcaseWhaleCap, Balance.showcaseWhaleBase + Balance.showcaseWhalePerRoot * showcaseRoot)
    }

    /// Followers and reputation for a visit with the showcase out. Returns the line for the summary.
    func payShowcaseVisit(at venue: String) -> String {
        let value = showcaseValue
        let rep = value >= Balance.showcaseBigValue ? 2 : 1
        addReputation(rep)
        var line = "People crowded around your showcase at \(venue). Reputation +\(rep)"
        if hasAccount {
            let followers = min(Balance.showcaseFollowersCap, Int(value.squareRoot() * Balance.showcaseFollowersPerRoot))
            data.social.followers += followers
            line += ", followers +\(followers)"
        }
        log(line + ".")
        return line + "."
    }
}

@MainActor
extension ShowSession {
    /// The showcase is at the table: the player brought it to a table with the table rules, and it holds a card.
    var showcaseOut: Bool {
        showcaseBrought && venue.tableRules && store.hasUpgrade(.showcaseCase) && !store.showcaseCards.isEmpty
    }

    /// Pays the showcase's followers and reputation once for each visit.
    func payShowcase() {
        guard !showcasePaid else { return }
        showcasePaid = true
        note = store.payShowcaseVisit(at: venue.name)
    }

    /// A whale: a big buyer with no budget cap. Some ask about a showcase card. The rest want the dearest items on the
    /// table, and pay up to 115% of market (or the PC price, for a PC item).
    /// `showcase`: the showcase is out at this visit. Without it, the whale asks only about the table, and does not mention
    /// a case (a big-spender show sends whales with no showcase, docs/20-card-shows.md).
    func makeWhale(showcase: Bool = true) -> Visitor? {
        let name = Self.names.randomElement() ?? "A collector"
        if showcase, Double.random(in: 0..<1) < Balance.showcaseAskShare || table.isEmpty, let v = makeShowcaseBuyer(name: name) {
            return v
        }
        let dearest = Array(table.sorted { $0.market > $1.market }.prefix(max(1, table.count / 3)))
        guard let item = pick(dearest) else { return nil }
        let ask = asking(item)
        let top = item.dealMarket * Double.random(in: Balance.whaleTableTop)
        if item.pc, top < ask - 0.001 { return nil }
        let offer = item.pc ? ask : Self.round(min(ask, top * Double.random(in: 0.85...0.95)))
        return Visitor(type: .collector, name: name, intent: .buy, item: item, limit: min(top, ask), offer: offer, patience: 2,
                       line: (showcase ? "Nice case. " : "") + "I'm here for the big cards. " + (offer >= ask ? "I'll take the \(item.name) at your price."
                                                                                       : "Would you take \(money(offer)) for the \(item.name)?"))
    }

    /// A whale who asks to buy a showcase card. They open at the PC price, and can go up to 160% of market.
    private func makeShowcaseBuyer(name: String) -> Visitor? {
        guard let card = store.showcaseCards.randomElement(), var item = store.showItems((cards: [card], sealed: [])).first
        else { return nil }
        item.pc = true
        item.showcase = true
        let ask = asking(item)
        let top = max(ask, item.market * Double.random(in: Balance.showcaseBuyerTop))
        return Visitor(type: .collector, name: name, intent: .buy, item: item, limit: top, offer: ask, patience: 2,
                       line: "That's quite a showcase. I know it's not on the table, but I'd pay \(money(ask)) for the \(item.name).")
    }
}
