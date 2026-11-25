import Foundation

// Walk-ins at the player's own store counter (docs/22-own-store.md, Counter walk-ins). Besides the buyers, traders, and
// sellers of a show table, the store gets people with a job for the player: a gift shopper, a pack ripper, a return,
// a special order, a hold, a shoplifter, a price check, a trade-up, and a trade-in for credit. A seller can also bring
// a sealed hoard (Model/Collections.swift). Only the store counter has them, so the game before the lease stays the same.

extension Balance {
    /// The share of counter visitors who come with one of the events below.
    static let counterEventShare = 0.3
    /// The share of collection sellers at the store who bring sealed product only.
    static let sealedHoardShare = 0.35
    /// A tip for a gift that fits, as a share of the price.
    static let giftTip = 0.1
    /// The chance that a pack gives a hit worth selling, and a big hit.
    static let packHitChance = 0.28
    static let packChaseChance = 0.05
    /// A return is a scam this often. The rest are honest.
    static let returnScamChance = 0.3
    /// A special order: the price over market, the deposit, and the days to find the card.
    static let specialOrderPremium = 1.15
    static let specialOrderDeposit = 0.2
    static let specialOrderDays = 7
    /// A hold: the deposit, the days the store holds the item, and the chance the customer comes back.
    static let holdDeposit = 0.25
    static let holdDays = 14
    static let holdComeBack = 0.8
    /// A shoplifter steals this often. The tell shows for a thief this often, and for an honest kid this often.
    static let shoplifterGuilty = 0.6
    static let shoplifterTellGuilty = 0.7
    static let shoplifterTellInnocent = 0.3
    static let shoplifterMaxValue = 60.0
    /// A price check: the honest seller's price and the lowball quote, as shares of market.
    static let priceCheckHonestSell = 0.75
    static let priceCheckLowball = 0.35
    /// The trade-in rates the player can offer, and the lowest rate a customer takes.
    static let tradeInRates = [0.6, 0.7, 0.8]
    static let tradeInFloor = 0.55...0.75
}

/// The kind of job a counter visitor brings.
enum CounterEventKind: CaseIterable, Codable {
    case gift, packRip, returnItem, specialOrder, hold, shoplifter, priceCheck, tradeUp, tradeIn
    /// A regular asks to reserve a product every few weeks (Model/PullBoxes.swift).
    case pullRequest

    var weight: Double {
        switch self {
        case .gift: 0.14
        case .packRip: 0.14
        case .returnItem: 0.1
        case .specialOrder: 0.12
        case .hold: 0.1
        case .shoplifter: 0.08
        case .priceCheck: 0.12
        case .tradeUp: 0.1
        case .tradeIn: 0.1
        case .pullRequest: 0.06
        }
    }

    var title: String {
        switch self {
        case .gift: "SHOPPING FOR A GIFT"
        case .packRip: "WANTS TO RIP A PACK"
        case .returnItem: "WANTS TO RETURN A CARD"
        case .specialOrder: "LOOKING FOR A CARD"
        case .hold: "ASKS FOR A HOLD"
        case .shoplifter: "BY THE CASE"
        case .priceCheck: "WANTS A PRICE CHECK"
        case .tradeUp: "WANTS TO TRADE UP"
        case .tradeIn: "TRADE-IN FOR CREDIT"
        case .pullRequest: "WANTS A PULL BOX"
        }
    }
}

/// Who a gift is for. Each likes a different kind of item.
enum GiftFor: CaseIterable, Codable {
    case youngKid, teenPlayer, collector

    var label: String {
        switch self {
        case .youngKid: "my 7-year-old, who loves to open packs"
        case .teenPlayer: "my nephew, who plays in tournaments"
        case .collector: "my husband, who collects slabs and sealed boxes"
        }
    }

    func likes(_ item: ShowItem) -> Bool {
        switch self {
        case .youngKid: item.kind == .sealed && !item.isCase && item.packs <= 10
        case .teenPlayer: item.kind == .card && !item.graded
        case .collector: item.graded || (item.kind == .sealed && item.packs >= 18)
        }
    }
}

/// Why a customer brings a card back.
enum ReturnReason: CaseIterable, Codable {
    case damaged, wrongCard, remorse, fakeClaim

    var line: String {
        switch self {
        case .damaged: "I bought this here last week. It has a crease I didn't see."
        case .wrongCard: "I bought this here, but I wanted the other version. Can I return it?"
        case .remorse: "My mom says I have to bring this back. I spent my birthday money on it."
        case .fakeClaim: "I bought this here, and my friend says it's fake. I want my money back."
        }
    }
}

/// The job that a counter visitor brings. It lives only for the visit.
struct CounterEvent: Codable {
    let kind: CounterEventKind
    /// A pull request: the product, and the days between pickups.
    var productID: String?
    var cycle = 14
    var giftFor: GiftFor = .youngKid
    var budget = 0.0
    /// The player's item that the event is about: the pack to rip, or the item to hold.
    var item: ShowItem?
    /// A trade-up: the player's items that the customer wants.
    var wants: [ShowItem] = []
    /// A return, a special order, a price check, or a trade-up: their card.
    var print: CardPrint?
    var slug = ""
    var condition: Condition = .packFresh()
    var grade: SlabGrade?
    var market = 0.0
    /// A return: what they say they paid.
    var price = 0.0
    /// Hidden: the return is honest, or the shoplifter is innocent.
    var honest = true
    /// Hidden: a fake card in a return or a trade.
    var fake: FakeTier?
    var looksOff = false
    var reason: ReturnReason = .damaged
    /// A trade-in: their cards, and the lowest rate they take.
    var cards: [FloorListing] = []
    var floorRate = 0.6
    /// The player asked once already (a counter or a cash top-up).
    var asked = false

    var goods: VendorGoods? {
        guard let print else { return nil }
        if let grade { return .slab(print, slug: slug, grade: grade) }
        return .single(print, slug: slug, condition: condition)
    }

    var cardsMarket: Double { cards.reduce(0) { $0 + $1.market } }
}

/// A card that a customer ordered. The store must find it by `dueDay`.
struct SpecialOrder: Codable, Hashable, Identifiable {
    var id = UUID()
    let customer: String
    let contactID: String?
    let print: CardPrint
    let slug: String
    let price: Double
    let deposit: Double
    let dueDay: Int
}

/// An item that the store holds for a customer, who paid a deposit.
struct StoreHold: Codable, Hashable, Identifiable {
    var id = UUID()
    let itemID: UUID
    let name: String
    let customer: String
    let price: Double
    let deposit: Double
    let dueDay: Int
    /// Hidden: the day the customer comes back to pay, or nil when they never come.
    let backDay: Int?
}

// MARK: - Making the visitors

@MainActor
extension ShowSession {
    /// A visitor with a job for the player, at the player's store only. Nil when the roll finds nothing that fits.
    func makeCounterEvent() -> Visitor? {
        guard venue.kind == .store else { return nil }
        let kinds = CounterEventKind.allCases
        var roll = Double.random(in: 0..<kinds.reduce(0) { $0 + $1.weight })
        var kind = kinds[kinds.count - 1]
        for k in kinds {
            if roll < k.weight {
                kind = k
                break
            }
            roll -= k.weight
        }
        return makeCounterEvent(kind)
    }

    func makeCounterEvent(_ kind: CounterEventKind) -> Visitor? {
        let name = Self.names.randomElement() ?? "A customer"
        var e = CounterEvent(kind: kind)
        var type = VisitorType.collector
        var intent = Visitor.Intent.buy
        var line = ""
        switch kind {
        case .gift:
            e.giftFor = GiftFor.allCases.randomElement() ?? .youngKid
            e.budget = [20.0, 30, 40, 60, 80, 120, 150].randomElement() ?? 40
            guard table.contains(where: { asking($0) <= e.budget }) else { return nil }
            type = .kid
            line = "I need a gift for \(e.giftFor.label). I have about \(money(e.budget)). What do you suggest?"
        case .packRip:
            guard let pack = table.filter({ $0.kind == .sealed && $0.packs == 1 && !$0.isCase && !$0.pc }).randomElement() else { return nil }
            e.item = pack
            type = .player
            line = "Can I get a \(pack.name)? I want to open it right here."
        case .returnItem:
            guard let (print, slug) = VendorFloor.randomPrint(from: Balance.modernSets, minMarket: 10, maxMarket: 120) else { return nil }
            e.print = print
            e.slug = slug
            e.reason = ReturnReason.allCases.randomElement() ?? .remorse
            e.honest = Double.random(in: 0..<1) >= Balance.returnScamChance
            // An honest damage claim and every scam bring back a worse card. A scam can be a fake.
            e.condition = e.reason == .damaged || !e.honest ? .played() : .packFresh()
            if !e.honest, e.reason == .fakeClaim || Bool.random() {
                e.fake = Counterfeit.roll(source: .stranger, sealed: false, slug: slug, market: print.market ?? 0) ?? .bootleg
                e.looksOff = e.fake.map { Counterfeit.eyeballCatches($0, tired: store.eyeFactor) } ?? false
            }
            e.market = OwnedCard(print: print, setSlug: slug, acquired: .now, paid: nil, ripID: nil, condition: e.condition).market
            e.price = Self.round((print.market ?? e.market) * Double.random(in: 1.0...1.15))
            type = e.reason == .remorse ? .kid : .collector
            intent = .sell
            line = e.reason.line
        case .specialOrder:
            guard let (print, slug) = VendorFloor.randomPrint(from: Balance.modernSets + Balance.olderSets, minMarket: 15, maxMarket: 250)
            else { return nil }
            e.print = print
            e.slug = slug
            e.market = print.market ?? 0
            e.price = Self.round(e.market * Balance.specialOrderPremium)
            type = .player
            line = "Do you have a \(print.name) from \(SetLibrary.set(slug).name)? I need it for my deck. I'd pay \(money(e.price)) if you can get one in a week."
        case .hold:
            guard let item = table.filter({ asking($0) >= 40 && !$0.pc }).randomElement() else { return nil }
            e.item = item
            e.price = asking(item)
            type = .collector
            line = "I love this \(item.name), but payday is in two weeks. Can you hold it if I put \(money(Self.round(e.price * Balance.holdDeposit))) down now?"
        case .shoplifter:
            guard !table.isEmpty else { return nil }
            e.honest = Double.random(in: 0..<1) >= Balance.shoplifterGuilty
            let tell = Double.random(in: 0..<1) < (e.honest ? Balance.shoplifterTellInnocent : Balance.shoplifterTellGuilty)
            type = .kid
            line = tell ? "(A teenager hangs around the case while you ring someone up. They keep glancing at you.)"
                        : "(A teenager looks over the case while you ring someone up.)"
        case .priceCheck:
            guard let (print, slug) = VendorFloor.randomPrint(from: Balance.olderSets + Balance.modernSets, minMarket: 15, maxMarket: 300)
            else { return nil }
            e.print = print
            e.slug = slug
            e.condition = Balance.olderSets.contains(slug) ? .played() : .packFresh()
            e.market = OwnedCard(print: print, setSlug: slug, acquired: .now, paid: nil, ripID: nil, condition: e.condition).market
            type = .closetCleaner
            intent = .sell
            line = "I found this in a drawer. What's it worth?"
        case .tradeUp:
            guard let (print, slug) = VendorFloor.randomPrint(from: Balance.modernSets + Balance.olderSets, minMarket: 40) else { return nil }
            let grade = SlabGrade(company: .psa, grade: [9.0, 10, 10].randomElement() ?? 9)
            let market = OwnedCard(print: print, setSlug: slug, acquired: .now, paid: nil, ripID: nil, grade: grade).market
            guard market >= 60, market <= 1_500 else { return nil }
            // They pick two or three of the player's items for about the value of their slab.
            var picks: [ShowItem] = []
            var total = 0.0
            for item in table.filter({ !$0.pc && $0.market < market }).shuffled() where picks.count < 3 {
                if total + item.market <= market * 1.1 {
                    picks.append(item)
                    total += item.market
                }
            }
            guard picks.count >= 2, total >= market * 0.75 else { return nil }
            e.print = print
            e.slug = slug
            e.grade = grade
            e.market = market
            e.wants = picks
            e.fake = Counterfeit.roll(source: .stranger, sealed: false, slug: slug, market: market)
            e.looksOff = e.fake.map { Counterfeit.eyeballCatches($0, tired: store.eyeFactor) } ?? false
            type = .trader
            intent = .trade
            line = "I want to trade up. My \(print.name) \(grade.label) for your \(picks.map(\.name).joined(separator: " and "))?"
        case .tradeIn:
            guard let item = table.filter({ asking($0) >= 15 && !$0.pc }).randomElement() else { return nil }
            var cards: [FloorListing] = []
            for _ in 0..<Int.random(in: 3...8) {
                if let card = tradeCard(max: max(5, asking(item) * 0.5)) { cards.append(card) }
            }
            guard cards.count >= 2 else { return nil }
            e.item = item
            e.cards = cards
            e.floorRate = Double.random(in: Balance.tradeInFloor)
            type = .player
            line = "Can I trade these in for store credit, and put it toward your \(item.name)?"
        case .pullRequest:
            // A regular who knows the player, with no pull yet, asks for one (Model/PullBoxes.swift).
            guard let ask = store.pullAsk() else { return nil }
            e.productID = ask.product.id
            e.cycle = ask.cycle
            e.market = ask.product.market
            e.price = store.pullPrice(ask.product)
            type = .collector
            let weeks = ask.cycle / 7
            line = "You know I'm in here every week. Could you put a \(ask.product.name) aside for me every \(weeks == 1 ? "week" : "\(weeks) weeks")? I'll pick it up."
            var v = Visitor(type: type, name: ask.contact.name, intent: .buy, item: nil, limit: 0, offer: 0, patience: 2, line: line)
            v.event = e
            v.contactID = ask.contact.id
            v.goodsMarket = e.market
            return v
        }
        var v = Visitor(type: type, name: name, intent: intent, item: nil, limit: 0, offer: 0, patience: 2, line: line)
        v.event = e
        v.goodsMarket = e.market
        return v
    }
}

// MARK: - The answers

@MainActor
extension ShowSession {
    /// A gift: the player suggests an item. It sells at the shelf price. A good fit earns a tip and a good review.
    func suggestGift(_ itemID: UUID) {
        guard let v = current, let e = v.event, e.kind == .gift, let item = table.first(where: { $0.id == itemID }) else { return }
        let price = asking(item)
        guard price <= e.budget + 0.001 else { return }
        let fits = e.giftFor.likes(item)
        let usesBudget = price >= e.budget * 0.6
        if !fits, Bool.random() {
            note = "\(v.name) shook their head. \"I don't think that's their thing.\" They left."
            store.counterReview(3, "They did not know what to get for my kid.")
            finish(minutes: .random(in: 5...8))
            return
        }
        sellTableItem(item, price: price)
        var line = "\(v.name) bought the \(item.name) for \(money(price))."
        if fits && usesBudget {
            let tip = Self.round(price * Balance.giftTip)
            store.addLedger(tip, .sale, "Tip for gift help · \(venue.name)")
            store.counterReview(5, "They helped me find the perfect gift.")
            store.nudgeLoyalty(2)
            line += " They loved it and left a \(money(tip)) tip."
        } else if fits {
            store.counterReview(4, "Good help with a gift.")
            line += " \"Perfect, thanks.\""
        } else {
            store.counterReview(3, "Not sure the gift was right.")
        }
        note = line
        maybePromote(v, points: 8)
        finish(minutes: .random(in: 6...10))
        Haptics.hit()
    }

    /// A pack rip: the player sells the pack. They open it at the counter. A good hit makes them a seller.
    func sellPackToRip() {
        guard let v = current, let e = v.event, e.kind == .packRip, let pack = e.item, table.contains(where: { $0.id == pack.id }) else { return }
        let price = asking(pack)
        sellTableItem(pack, price: price)
        store.nudgeLoyalty(0.5)
        let roll = Double.random(in: 0..<1)
        let range: ClosedRange<Double>? = roll < Balance.packChaseChance ? 60...Double.greatestFiniteMagnitude
            : roll < Balance.packHitChance ? 8...60 : nil
        guard let range, let (print, slug) = VendorFloor.randomPrint(from: [pack.setSlug], minMarket: range.lowerBound, maxMarket: range.upperBound)
        else {
            note = "\(v.name) ripped the \(pack.name): nothing big. \"Next time!\""
            finish(minutes: .random(in: 4...6))
            return
        }
        let market = print.market ?? 0
        let ask = Self.round(market * Double.random(in: 0.8...1.0))
        var seller = Visitor(type: .player, name: v.name, intent: .sell, item: nil, limit: Self.round(market * Double.random(in: 0.6...0.75)),
                             offer: ask, patience: 2,
                             line: "No way! A \(print.name)! \(market >= 60 ? "That's the chase! " : "")Do you want to buy it? \(money(ask)).",
                             goods: .single(print, slug: slug, condition: .packFresh()), goodsMarket: market, contactID: v.contactID)
        seller.firstOffer = ask
        setCurrent(seller)
        spend(4)
        Haptics.hit()
    }

    /// A return: refund in cash, refund in store credit, or refuse. The card comes back to Inventory on a refund.
    func answerReturn(_ answer: ReturnAnswer) {
        guard let v = current, let e = v.event, e.kind == .returnItem, let goods = e.goods else { return }
        switch answer {
        case .cash, .credit:
            if answer == .cash, !store.canAfford(e.price) {
                note = "You do not have \(money(e.price))."
                return
            }
            buyGoods(goods, price: e.price, from: v.name, fake: e.fake, looksOff: e.looksOff, credit: answer == .credit ? e.price : nil)
            if e.honest {
                store.counterReview(5, answer == .cash ? "No-hassle return. Great shop." : "They gave me store credit for a return.")
                store.nudgeLoyalty(answer == .cash ? 3 : 2)
                note = "\(v.name) thanked you. The card is back in Inventory."
            } else {
                note = "\(v.name) left fast. Look at that card again: it may not be the one you sold."
            }
        case .refuse:
            if e.honest {
                store.counterReview([1, 2].randomElement() ?? 2, "They would not take back a card they sold me.")
                store.nudgeLoyalty(-3)
                note = "\(v.name) left angry."
            } else {
                store.addReputation(1)
                note = "\(v.name) left without an argument. You were right to say no."
            }
        }
        finish(minutes: .random(in: 4...8))
    }

    enum ReturnAnswer { case cash, credit, refuse }

    /// A special order: the customer pays a deposit, and the store must find the card in a week.
    func takeSpecialOrder() {
        guard let v = current, let e = v.event, e.kind == .specialOrder, let print = e.print else { return }
        let deposit = Self.round(e.price * Balance.specialOrderDeposit)
        let order = SpecialOrder(customer: v.name, contactID: v.contactID, print: print, slug: e.slug, price: e.price, deposit: deposit,
                                 dueDay: store.day + Balance.specialOrderDays)
        store.addLedger(deposit, .sale, "Special order deposit · \(print.name)")
        store.updateBusiness { $0.orders = ($0.orders ?? []) + [order] }
        note = "\(v.name) paid a \(money(deposit)) deposit. Find a \(print.name) (\(SetLibrary.set(e.slug).name)) by day \(order.dueDay + 1). It sells for \(money(e.price))."
        maybePromote(v, points: 10, chance: 0.5)
        finish(minutes: .random(in: 3...5))
    }

    /// A hold: the customer pays a deposit, and the item leaves the table until they come back.
    func holdItem() {
        guard let v = current, let e = v.event, e.kind == .hold, let item = e.item, table.contains(where: { $0.id == item.id }) else { return }
        let deposit = Self.round(e.price * Balance.holdDeposit)
        let today = store.day
        let back: Int? = Double.random(in: 0..<1) < Balance.holdComeBack ? today + Int.random(in: 3...Balance.holdDays) : nil
        let hold = StoreHold(itemID: item.id, name: item.name, customer: v.name, price: e.price, deposit: deposit,
                             dueDay: today + Balance.holdDays, backDay: back)
        store.addLedger(deposit, .sale, "Hold deposit · \(item.name)")
        store.updateBusiness { $0.holds = ($0.holds ?? []) + [hold] }
        removeFromTable([item.id])
        store.nudgeLoyalty(1)
        note = "\(v.name) paid \(money(deposit)) down. You hold the \(item.name) until day \(hold.dueDay + 1)."
        finish(minutes: .random(in: 3...5))
    }

    /// The shoplifter: watch them, offer help, call them out, or let it go.
    func answerShoplifter(_ answer: ShoplifterAnswer) {
        guard let v = current, let e = v.event, e.kind == .shoplifter else { return }
        switch answer {
        case .watch:
            note = e.honest ? "You watched them. They looked, then left." : "You kept your eyes on them. They gave up and left."
            finish(minutes: 10)
        case .help:
            if e.honest, let small = table.filter({ asking($0) <= 25 }).randomElement(), Bool.random() {
                sellTableItem(small, price: asking(small))
                note = "\(v.name) bought the \(small.name). \"Thanks for asking!\""
                store.nudgeLoyalty(1)
            } else {
                note = e.honest ? "\(v.name) said they were just looking." : "\(v.name) mumbled something and left."
            }
            finish(minutes: .random(in: 4...6))
        case .callOut:
            if e.honest {
                store.counterReview(1, "They accused my son of stealing. Never again.")
                store.nudgeLoyalty(-4)
                note = "\(v.name) had nothing. Their parent was not happy."
            } else {
                store.addReputation(1)
                store.counterReview(5, "The owner caught a shoplifter. I feel safe here.")
                note = "You caught \(v.name) with a card in their sleeve. They put it back and ran."
            }
            finish(minutes: .random(in: 4...6))
        case .ignore:
            if !e.honest, let taken = table.filter({ $0.market <= Balance.shoplifterMaxValue && !$0.pc }).randomElement() {
                store.loseToScam(taken.id, name: taken.name, venue: venue.name)
                removeFromTable([taken.id])
                note = "Later, you saw that the \(taken.name) was gone."
            } else {
                note = "\(v.name) left."
            }
            finish(minutes: 2)
        }
    }

    enum ShoplifterAnswer { case watch, help, callOut, ignore }

    /// The honest price check. Sometimes they then offer to sell it at a fair price.
    func priceCheckHonest() {
        guard let v = current, let e = v.event, e.kind == .priceCheck, let goods = e.goods else { return }
        store.addReputation(1)
        store.nudgeLoyalty(1)
        guard Bool.random() else {
            note = "\(v.name) smiled. \"Thanks! I'll keep it.\""
            finish(minutes: .random(in: 3...5))
            return
        }
        let ask = Self.round(e.market * Balance.priceCheckHonestSell)
        var seller = Visitor(type: .closetCleaner, name: v.name, intent: .sell, item: nil, limit: Self.round(ask * 0.9), offer: ask, patience: 2,
                             line: "Thanks for being honest. Do you want it? \(money(ask)) and it's yours.",
                             goods: goods, goodsMarket: e.market, contactID: v.contactID)
        seller.firstOffer = ask
        setCurrent(seller)
        spend(3)
    }

    var priceCheckLowball: Double {
        guard let e = current?.event else { return 0 }
        return max(1, Self.round(e.market * Balance.priceCheckLowball))
    }

    /// The lowball: say it is worth little, and buy it at that price. It is a lie, and they can find out.
    func priceCheckLowballBuy() {
        guard let v = current, let e = v.event, e.kind == .priceCheck, let goods = e.goods, let print = e.print else { return }
        let price = priceCheckLowball
        guard store.canAfford(price) else {
            note = "You do not have \(money(price))."
            return
        }
        buyGoods(goods, price: price, from: v.name)
        store.recordScam(seller: v.name, contactID: v.contactID, item: print.name)
        note = "\(v.name) took \(money(price)) for the \(print.name)."
        finish(minutes: .random(in: 4...6))
        Haptics.hit()
    }

    /// The trade-up: the player's items go, and their slab comes in. `askCash`: ask them to add 10% in cash first.
    func answerTradeUp(accept: Bool, askCash: Bool = false) {
        guard var v = current, var e = v.event, e.kind == .tradeUp, let goods = e.goods else { return }
        guard accept else {
            decline()
            return
        }
        var cash = 0.0
        if askCash {
            guard !e.asked else { return }
            e.asked = true
            v.event = e
            if Bool.random() {
                cash = Self.round(e.wants.reduce(0) { $0 + $1.market } * 0.1)
            } else {
                v.line = "No, that's already a fair trade. Take it or leave it."
                setCurrent(v)
                spend(2)
                return
            }
        }
        let got = VendorItem(goods: goods, price: e.market, market: e.market, fake: e.fake, looksOff: e.looksOff)
        let ids = Set(e.wants.map(\.id))
        for item in e.wants { store.settleOnlineListing(item.id, name: item.name) }
        store.tradeWithVendor(give: e.wants, get: [got], cash: -cash, vendor: v.name, at: venue.name)
        removeFromTable(ids)
        recordTrade("\(e.wants.map(\.name).joined(separator: " + ")) → \(got.name)\(cash > 0 ? " + \(money(cash))" : "")")
        store.recordDeal(v.contactID, what: "Traded up for \(got.name)", price: e.market, market: e.market, slug: e.slug, scored: true)
        note = "You traded for the \(got.name)\(cash > 0 ? ", and they added \(money(cash))" : "")."
        maybePromote(v, points: 10)
        finish(minutes: .random(in: 6...10))
        Haptics.hit()
    }

    /// A trade-in at `rate` of market, as store credit toward the item. They pay the rest in cash, or keep the extra as
    /// credit. Under their lowest rate, they say no once, then leave.
    func answerTradeIn(rate: Double) {
        guard var v = current, var e = v.event, e.kind == .tradeIn, let item = e.item,
              table.contains(where: { $0.id == item.id }) else { return }
        guard rate >= e.floorRate - 0.001 else {
            if e.asked {
                note = "\(v.name) kept their cards and left."
                finish(minutes: .random(in: 3...5))
            } else {
                e.asked = true
                v.event = e
                v.line = "That's too low. My cards are worth more than that."
                setCurrent(v)
                spend(2)
            }
            return
        }
        let credit = Self.round(e.cardsMarket * rate)
        let price = asking(item)
        let get = e.cards.map { card in
            VendorItem(goods: .single(card.print, slug: card.setSlug, condition: card.condition), price: Self.round(card.market * rate),
                       market: card.market, fake: card.fake, looksOff: card.looksOff)
        }
        // Positive: the customer pays the rest in cash. Negative: the extra stays with them as credit.
        let rest = Self.round(price - credit)
        store.settleOnlineListing(item.id, name: item.name)
        store.tradeWithVendor(give: [item], get: get, cash: rest > 0 ? -rest : 0, vendor: v.name, at: venue.name)
        if rest < 0 { store.addStoreCredit(-rest) }
        removeFromTable([item.id])
        recordTrade("\(item.name) → \(e.cards.count) cards at \(Int(rate * 100))%")
        store.recordDeal(v.contactID, what: "Took a trade-in for \(item.name)", price: price, market: item.market, slug: item.setSlug, scored: true)
        store.nudgeLoyalty(rate >= 0.7 ? 2 : 1)
        note = rest > 0 ? "\(v.name) traded in \(e.cards.count) cards for \(money(credit)) and paid \(money(rest)) for the \(item.name)."
            : "\(v.name) traded in \(e.cards.count) cards for the \(item.name), with \(money(-rest)) left as credit."
        maybePromote(v, points: 10)
        finish(minutes: .random(in: 6...10))
        Haptics.hit()
    }
}

// MARK: - The store side: reviews, loyalty, orders, and holds

@MainActor
extension GameStore {
    /// A review from a counter visit.
    func counterReview(_ stars: Int, _ text: String) {
        let day = data.day
        updateBusiness { $0.reviews.append(StoreReview(day: day, stars: max(1, min(5, stars)), text: text)) }
    }

    func nudgeLoyalty(_ delta: Double) {
        updateBusiness { $0.loyalty = min(100, max(0, $0.loyalty + delta)) }
    }

    var specialOrders: [SpecialOrder] { business.orders ?? [] }
    var storeHolds: [StoreHold] { business.holds ?? [] }
    var heldItemIDs: Set<UUID> { Set(storeHolds.map(\.itemID)) }

    /// A raw card or a slab in hand that fills the order: the same card, free, and not in the PC or a set.
    func orderMatch(_ o: SpecialOrder) -> OwnedCard? {
        let fits: (OwnedCard) -> Bool = {
            $0.print.name == o.print.name && $0.print.num == o.print.num && $0.setSlug == o.slug
                && ($0.status == nil || Self.isInStore($0.status)) && !$0.pc && !$0.inMasterSet && !$0.inShowcase && !$0.isKnownFake
        }
        return data.raw.first(where: fits) ?? data.slabs.first(where: fits)
    }

    /// End Day, in the business account: filled orders sell, late orders refund their deposit, a customer comes back
    /// for a held item, and an old hold ends.
    func counterEventsEndDay() -> [String] {
        guard let s = data.cardStore else { return [] }
        let today = data.day
        var lines: [String] = pullsEndDay()
        var keep: [SpecialOrder] = []
        for o in specialOrders {
            if let card = orderMatch(o) {
                let item = showItems(([card], [])).first
                if let item { sellAtShow(item, price: o.price - o.deposit, at: s.name) }
                counterReview(5, "They found the card I ordered.")
                nudgeLoyalty(3)
                lines.append("\(o.customer) picked up the \(o.print.name) they ordered and paid \(money(o.price - o.deposit)), on top of the \(money(o.deposit)) deposit.")
            } else if today >= o.dueDay {
                bizLedger(-o.deposit, .sale, "Special order refund · \(o.print.name)")
                counterReview(2, "They promised a card and never got it.")
                nudgeLoyalty(-4)
                lines.append("You did not find the \(o.print.name) for \(o.customer). You refunded the \(money(o.deposit)) deposit.")
            } else {
                keep.append(o)
            }
        }
        var holds: [StoreHold] = []
        for h in storeHolds {
            let item = showItems(storeStock).first { $0.id == h.itemID } ?? showItems(showStock).first { $0.id == h.itemID }
            if item == nil {
                // The item is gone (sold another way, or stolen). The deposit goes back.
                bizLedger(-h.deposit, .sale, "Hold refund · \(h.name)")
                lines.append("The \(h.name) that you held for \(h.customer) is gone. You refunded the \(money(h.deposit)) deposit.")
            } else if let back = h.backDay, back <= today, let item {
                sellAtShow(item, price: h.price - h.deposit, at: s.name)
                nudgeLoyalty(2)
                lines.append("\(h.customer) came back for the \(h.name) and paid the rest, \(money(h.price - h.deposit)).")
            } else if today >= h.dueDay {
                lines.append("\(h.customer) never came back for the \(h.name). You keep the \(money(h.deposit)) deposit, and the item is for sale again.")
            } else {
                holds.append(h)
            }
        }
        updateBusiness {
            $0.orders = keep.isEmpty ? nil : keep
            $0.holds = holds.isEmpty ? nil : holds
        }
        return lines
    }

    /// Takes a hold off an item, and gives the deposit back. For an item that comes off the shelf.
    func cancelHolds(_ ids: Set<UUID>) {
        let hit = storeHolds.filter { ids.contains($0.itemID) }
        guard !hit.isEmpty else { return }
        for h in hit {
            bizLedger(-h.deposit, .sale, "Hold refund · \(h.name)")
            log("You took the \(h.name) off hold and gave \(h.customer) back the \(money(h.deposit)) deposit.")
        }
        updateBusiness { $0.holds = $0.holds?.filter { !ids.contains($0.itemID) } }
    }

    /// The store closes: every deposit goes back.
    func refundCounterDeposits() {
        let total = specialOrders.reduce(0) { $0 + $1.deposit } + storeHolds.reduce(0) { $0 + $1.deposit }
        guard total >= 0.01 else { return }
        bizLedger(-total, .sale, "Deposits refunded at the close")
        updateBusiness {
            $0.orders = nil
            $0.holds = nil
        }
    }
}
