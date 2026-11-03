import Foundation

// Direct messages about cards (docs/28-messages-and-encounters.md). More people message the player as their
// notoriety grows: the reputation tier plus the follower tier.

enum MessageKind: String, Codable, Hashable {
    /// They want a card that the player owns, and they offer a price.
    case wantsYourCard
    /// They hunt for a card that the player does not have yet. The player can sell one before the message expires.
    case lookingFor
    /// They want to sell the player a card. It comes in the mail.
    case offersCard
}

struct DirectMessage: Codable, Identifiable, Hashable {
    var id = UUID()
    let kind: MessageKind
    let sender: String
    let day: Int
    /// The last day to answer.
    let expiresDay: Int
    let text: String
    /// What they offer to pay, or what they ask.
    var price: Double
    /// Hidden: the most a buyer pays after one counter.
    var limit: Double
    /// For `wantsYourCard`: the player's card.
    var cardID: UUID?
    /// For `lookingFor` and `offersCard`: the card.
    var print: CardPrint?
    var slug: String?
    var grade: SlabGrade?
    /// For `offersCard`: hidden, the card is a fake.
    var fake: FakeTier?
    var countered = false
    var answered = false
    var read = false
    /// The last line in the thread: their answer to a counter, or the result.
    var reply: String?
}

extension Balance {
    /// Messages a day: a base, plus this much for each step of notoriety.
    static let messageBase = 0.08
    static let messageStep = 0.12
    static let messageWantsShare = 1.0...1.25
    static let messageLookingShare = 1.1...1.3
    static let messageOffersShare = 0.65...0.9
    static let messageMinCard = 15.0
    static let messageKeepDays = 21
    /// Days for a card bought by message to arrive.
    static let messageShipDays = 3
}

@MainActor
extension GameStore {
    /// Reputation tier plus follower tier, 0 to 8. Followers count only with an account.
    var notoriety: Int { reputationTier + (hasAccount ? followerTier : 0) }

    var openMessages: [DirectMessage] {
        data.messages.filter { !$0.answered && $0.expiresDay >= data.day }.sorted { $0.day > $1.day }
    }

    var unreadMessages: Int { openMessages.filter { !$0.read }.count }

    func message(_ id: UUID) -> DirectMessage? { data.messages.first { $0.id == id } }

    /// New messages at End Day. Old ones go away after three weeks.
    func messagesEndDay() -> [String] {
        let today = data.day
        data.messages.removeAll { $0.expiresDay < today - Balance.messageKeepDays }
        let rate = Balance.messageBase + Balance.messageStep * Double(notoriety)
        var count = Int(rate)
        if Double.random(in: 0..<1) < rate - Double(count) { count += 1 }
        var made = 0
        for _ in 0..<count {
            guard let m = makeMessage() else { continue }
            data.messages.append(m)
            made += 1
        }
        guard made > 0 else { return [] }
        return [made == 1 ? "You have a new message about a card." : "You have \(made) new messages about cards."]
    }

    /// One message that fits the player now.
    func makeMessage(kind forced: MessageKind? = nil) -> DirectMessage? {
        let names = ["Marcus", "Jen", "Tyler", "Priya", "Dev", "Sam", "Alyssa", "Chris", "Nate", "Olivia", "Kai", "Mia",
                     "Rosa", "Luis", "Theo", "Wes", "Omar", "Lena", "Andre", "Ellie"]
        let sender = "@" + (names.randomElement() ?? "collector").lowercased() + String(Int.random(in: 10...99))
        let mine = (data.raw + data.slabs).filter { $0.status == nil && !$0.keep && !$0.isKnownFake && $0.market >= Balance.messageMinCard }
        var kinds: [MessageKind] = [.lookingFor, .offersCard, .offersCard]
        if !mine.isEmpty { kinds += [.wantsYourCard, .wantsYourCard, .wantsYourCard] }
        guard let kind = forced ?? kinds.randomElement() else { return nil }
        // Notoriety brings bigger cards and better prices.
        let lift = 0.02 * Double(notoriety)
        let top = 60 + 80 * Double(notoriety)
        switch kind {
        case .wantsYourCard:
            guard let card = pickWanted(mine) else { return nil }
            let price = ShowSession.round(card.market * (Double.random(in: Balance.messageWantsShare) + lift))
            let name = card.print.name + (card.grade.map { " " + $0.label } ?? "")
            let posted = data.social.posts.contains { $0.subject?.contains(card.print.name) == true }
            let text = posted ? "Saw your post with the \(name). Would you sell it? I can do \(money(price)). You ship it."
                              : "Heard you have a \(name). Is it for sale? \(money(price)), and you ship it."
            return DirectMessage(kind: kind, sender: sender, day: data.day, expiresDay: data.day + Int.random(in: 2...4), text: text,
                                 price: price, limit: price * Double.random(in: 1.0...1.2), cardID: card.id)
        case .lookingFor:
            let sets = Bool.random() ? Balance.modernSets : Balance.vintageSets + Balance.olderSets
            guard let (print, slug) = VendorFloor.randomPrint(from: sets, minMarket: 20, maxMarket: top) else { return nil }
            let market = print.market ?? 0
            let price = ShowSession.round(market * (Double.random(in: Balance.messageLookingShare) + lift))
            let set = SetLibrary.set(slug).name
            let text = "I'm hunting for a \(print.name) from \(set). If you find one, I'll pay \(money(price))."
            return DirectMessage(kind: kind, sender: sender, day: data.day, expiresDay: data.day + Int.random(in: 5...10), text: text,
                                 price: price, limit: price * Double.random(in: 1.0...1.1), print: print, slug: slug)
        case .offersCard:
            let sets = Bool.random() ? Balance.showSets : Balance.vintageSets + Balance.olderSets
            guard let (print, slug) = VendorFloor.randomPrint(from: sets, minMarket: 10, maxMarket: top) else { return nil }
            let grade: SlabGrade? = Double.random(in: 0..<1) < 0.3
                ? SlabGrade(company: Bool.random() ? .psa : .cgc, grade: [8.0, 9, 9, 10].randomElement() ?? 9) : nil
            let market = OwnedCard(print: print, setSlug: slug, acquired: .now, paid: nil, ripID: nil, grade: grade).market
            guard market > 0 else { return nil }
            let price = ShowSession.round(market * Double.random(in: Balance.messageOffersShare))
            let name = print.name + (grade.map { " " + $0.label } ?? "")
            let text = "I'm selling my \(name) from \(SetLibrary.set(slug).name). \(money(price)) shipped. Interested?"
            // A stranger online carries the most risk of a fake (docs/14-counterfeit-risk.md).
            let fake = Counterfeit.roll(source: .stranger, sealed: false, slug: slug, market: market)
            return DirectMessage(kind: kind, sender: sender, day: data.day, expiresDay: data.day + Int.random(in: 1...3), text: text,
                                 price: price, limit: price, print: print, slug: slug, grade: grade, fake: fake)
        }
    }

    /// Buyers ask about the cards the player posted, and about the cards worth the most.
    private func pickWanted(_ cards: [OwnedCard]) -> OwnedCard? {
        let posted = Set(data.social.posts.suffix(10).compactMap(\.subject))
        let weights = cards.map { card in
            sqrt(card.market) * (posted.contains { $0.contains(card.print.name) } ? 4 : 1)
        }
        let total = weights.reduce(0, +)
        guard total > 0 else { return cards.randomElement() }
        var roll = Double.random(in: 0..<total)
        for (card, w) in zip(cards, weights) {
            if roll < w { return card }
            roll -= w
        }
        return cards.last
    }

    /// For `lookingFor`: the player's card that matches, if any. Raw only, not kept, and free.
    func matchingCard(_ m: DirectMessage) -> OwnedCard? {
        guard m.kind == .lookingFor, let print = m.print else { return nil }
        return data.raw.filter {
            $0.print.num == print.num && $0.print.name == print.name && $0.setSlug == m.slug && $0.status == nil && !$0.keep
        }.max { $0.market < $1.market }
    }

    /// The card that the message sells to the buyer, or nil.
    func cardForMessage(_ m: DirectMessage) -> OwnedCard? {
        switch m.kind {
        case .wantsYourCard:
            guard let id = m.cardID, let c = card(id), c.status == nil, !c.keep else { return nil }
            return c
        case .lookingFor: return matchingCard(m)
        case .offersCard: return nil
        }
    }

    func markRead(_ id: UUID) {
        guard let i = data.messages.firstIndex(where: { $0.id == id }), !data.messages[i].read else { return }
        data.messages[i].read = true
        save()
    }

    /// Says yes. A buyer pays and the player ships. A seller ships to the player.
    @discardableResult
    func acceptMessage(_ id: UUID) -> String {
        guard let i = data.messages.firstIndex(where: { $0.id == id }) else { return "The message is gone." }
        let m = data.messages[i]
        guard !m.answered, m.expiresDay >= data.day else { return "It is too late to answer." }
        switch m.kind {
        case .wantsYourCard, .lookingFor:
            guard let card = cardForMessage(m) else { return "You do not have a card to sell them." }
            data.raw.removeAll { $0.id == card.id }
            data.slabs.removeAll { $0.id == card.id }
            let name = card.print.name + (card.grade.map { " " + $0.label } ?? "")
            let line = completeSaleNow(name: name, channel: .social, price: m.price, sealed: false, insured: false, paid: card.paid,
                                       slab: card.grade != nil)
            if let fake = card.fake {
                recordBadSale(item: name, channel: "a message", price: m.price, fake: fake, known: card.isKnownFake,
                              refunds: Listing.Channel.social.refundsFakes)
            } else if m.price >= Balance.fairDealMinPrice {
                addReputation(Balance.onlineSaleReputation)
            }
            data.messages[i].answered = true
            data.messages[i].reply = "Paid. Thanks!"
            log(line)
            save()
            return line
        case .offersCard:
            guard let print = m.print, let slug = m.slug else { return "The message is gone." }
            guard canAfford(m.price) else { return "You do not have \(money(m.price))." }
            var card = m.grade.map { OwnedCard(print: print, setSlug: slug, acquired: .now, paid: m.price, ripID: nil, grade: $0) }
                ?? OwnedCard(print: print, setSlug: slug, acquired: .now, paid: m.price, ripID: nil,
                             condition: Balance.modernSets.contains(slug) ? .packFresh() : .played())
            card.fake = m.fake
            card.acquiredDay = data.day
            card.status = .arriving(daysLeft: Balance.messageShipDays, from: m.sender)
            if m.grade == nil { data.raw.append(card) } else { data.slabs.append(card) }
            addLedger(-m.price, .singles, "\(print.name)\(m.grade.map { " " + $0.label } ?? "") · \(m.sender)")
            data.messages[i].answered = true
            data.messages[i].reply = "Shipped! It should get there in \(Balance.messageShipDays) days."
            log("Bought \(print.name) from \(m.sender) for \(money(m.price)). It arrives in \(Balance.messageShipDays) days.", cash: -m.price)
            save()
            return "Paid \(money(m.price)). It arrives in \(Balance.messageShipDays) days."
        }
    }

    /// Asks a buyer for more, one time. They pay it when it is within their limit. If not, they hold at their offer.
    func counterMessage(_ id: UUID, price: Double) -> String {
        guard let i = data.messages.firstIndex(where: { $0.id == id }), data.messages[i].kind != .offersCard,
              !data.messages[i].countered else { return "" }
        data.messages[i].countered = true
        if price <= data.messages[i].limit + 0.001 {
            data.messages[i].price = price
            data.messages[i].reply = "Okay, \(money(price)) works."
        } else {
            data.messages[i].reply = "Sorry, \(money(data.messages[i].price)) is my best."
        }
        save()
        return data.messages[i].reply ?? ""
    }

    func declineMessage(_ id: UUID) {
        guard let i = data.messages.firstIndex(where: { $0.id == id }) else { return }
        data.messages[i].answered = true
        data.messages[i].reply = "No worries."
        save()
    }
}
