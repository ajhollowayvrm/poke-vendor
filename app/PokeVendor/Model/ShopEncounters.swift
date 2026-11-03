import Foundation

// Someone comes up to the player at a game shop stop on a store run (docs/28-messages-and-encounters.md).

struct ShopEncounter: Identifiable, Hashable {
    enum Kind: Hashable {
        /// A kid pulled a hit and asks what it is worth.
        case kidWithHit
        /// A player at the shop wants one of the player's cards.
        case buyer
        /// A regular sells a card from their binder.
        case seller
        /// The owner holds a sealed product for a player they know.
        case ownerHold
        /// Another player tells the player about a garage sale tomorrow.
        case tip
    }

    let id = UUID()
    let kind: Kind
    let shop: LocalStore
    let who: String
    let line: String
    /// What they ask, or what they offer.
    let price: Double
    let market: Double
    var cardID: UUID?
    var goods: VendorGoods?
    var fake: FakeTier?
}

extension Balance {
    /// The chance at each game shop stop, plus a step for each point of notoriety, up to the cap.
    static let shopEncounterBase = 0.3
    static let shopEncounterStep = 0.04
    static let shopEncounterCap = 0.6
    static let kidFairShare = 0.85
    static let kidLowballShare = 0.3
    static let ownerHoldShare = 0.85
}

@MainActor
extension GameStore {
    /// Rolls for an encounter at a game shop stop. Nil most of the time.
    func rollShopEncounter(_ shop: LocalStore) -> ShopEncounter? {
        guard shop.isGameShop else { return nil }
        let chance = min(Balance.shopEncounterCap, Balance.shopEncounterBase + Balance.shopEncounterStep * Double(notoriety))
        guard Double.random(in: 0..<1) < chance else { return nil }
        return makeShopEncounter(shop)
    }

    func makeShopEncounter(_ shop: LocalStore, kind forced: ShopEncounter.Kind? = nil) -> ShopEncounter? {
        let names = ["Marcus", "Jen", "Tyler", "Priya", "Dev", "Sam", "Alyssa", "Chris", "Nate", "Olivia", "Ben", "Hannah"]
        let who = names.randomElement() ?? "Someone"
        let mine = (data.raw + data.slabs).filter { $0.status == nil && !$0.keep && !$0.isKnownFake && $0.market >= 10 }
        var kinds: [ShopEncounter.Kind] = [.kidWithHit, .seller, .seller, .tip]
        if !mine.isEmpty { kinds += [.buyer, .buyer] }
        if standing(shop).rank >= StandingLevel.regular.rank { kinds.append(.ownerHold) }
        guard let kind = forced ?? kinds.randomElement() else { return nil }
        switch kind {
        case .kidWithHit:
            guard let (print, slug) = VendorFloor.randomPrint(from: Balance.modernSets, minMarket: 20, maxMarket: 150) else { return nil }
            let market = print.market ?? 0
            return ShopEncounter(kind: kind, shop: shop, who: "A kid", line: "I just pulled this from a pack! Is it worth anything?",
                                 price: market, market: market,
                                 goods: .single(print, slug: slug, condition: .packFresh()))
        case .buyer:
            guard let card = mine.max(by: { $0.market * Double.random(in: 0.5...1.5) < $1.market * Double.random(in: 0.5...1.5) }) else {
                return nil
            }
            let price = ShowSession.round(card.market * Double.random(in: 0.95...1.15))
            let name = card.print.name + (card.grade.map { " " + $0.label } ?? "")
            let known = hasAccount && followerTier >= 1
            let line = known ? "Hey, I follow you! Do you still have the \(name)? I'd give you \(money(price)) cash right now."
                             : "Someone said you deal cards. Got a \(name)? I'd give you \(money(price)) cash."
            return ShopEncounter(kind: kind, shop: shop, who: who, line: line, price: price, market: card.market, cardID: card.id)
        case .seller:
            // About a third of sellers bring old sealed product from a closet.
            if Double.random(in: 0..<1) < 0.35 {
                let pool = VendorFloor.sealedPool(vintage: 0.4, older: 0.6)
                if let product = SetLibrary.catalog.filter({ pool.contains($0.homeSlug) && $0.market > 0 && $0.market <= 400 + 400 * Double(notoriety) })
                    .randomElement() {
                    let price = max(1, ShowSession.round(product.market * Double.random(in: 0.6...0.85)))
                    let fake = Counterfeit.roll(source: .stranger, sealed: true, slug: product.homeSlug, market: product.market)
                    return ShopEncounter(kind: kind, shop: shop, who: who,
                                         line: "Found this still sealed in my closet. \(money(price)) for the \(product.name)?",
                                         price: price, market: product.market, goods: .sealed(product), fake: fake)
                }
            }
            let sets = Bool.random() ? Balance.modernSets : Balance.vintageSets + Balance.olderSets
            guard let (print, slug) = VendorFloor.randomPrint(from: sets, minMarket: 8, maxMarket: 60 + 40 * Double(notoriety)) else {
                return nil
            }
            let condition: Condition = Balance.modernSets.contains(slug) ? .packFresh() : .played()
            let market = (print.market ?? 0) * condition.wear.valueFactor
            let price = max(1, ShowSession.round(market * Double.random(in: 0.6...0.85)))
            let fake = Counterfeit.roll(source: .stranger, sealed: false, slug: slug, market: market)
            return ShopEncounter(kind: kind, shop: shop, who: who, line: "I'm selling a few from my binder. \(money(price)) for this \(print.name)?",
                                 price: price, market: market, goods: .single(print, slug: slug, condition: condition), fake: fake)
        case .ownerHold:
            guard let product = SetLibrary.catalog.filter({ Balance.showSets.contains($0.homeSlug) && $0.market >= 30 }).randomElement() else {
                return nil
            }
            let price = ShowSession.round(product.market * Balance.ownerHoldShare)
            return ShopEncounter(kind: kind, shop: shop, who: "The owner",
                                 line: "I set one \(product.name) aside for you. \(money(price)), before it goes on the shelf.",
                                 price: price, market: product.market, goods: .sealed(product))
        case .tip:
            return ShopEncounter(kind: kind, shop: shop, who: who,
                                 line: "There's a garage sale tomorrow. The guy said he has a box of old cards. It's not posted anywhere.",
                                 price: 0, market: 0)
        }
    }

    /// The kid's card: the player tells them what it is worth. Nothing changes hands. The shop sees it.
    func tellKidValue(_ e: ShopEncounter) -> String {
        addReputation(2)
        addPoints(shopContactID(e.shop), 3)
        log("Told a kid at \(e.shop.rawValue) what their card is worth.")
        save()
        return "The kid lit up. The owner saw it too."
    }

    /// Buys the kid's card at a fair price.
    func buyKidFair(_ e: ShopEncounter) -> String {
        let price = ShowSession.round(e.market * Balance.kidFairShare)
        guard canAfford(price), let goods = e.goods, case .single(let print, let slug, let condition) = goods else {
            return "You do not have \(money(price))."
        }
        buyCardAtShow(OwnedCard(print: print, setSlug: slug, acquired: .now, paid: price, ripID: nil, condition: condition),
                      price: price, vendor: "a kid", at: e.shop.rawValue)
        addReputation(3)
        addPoints(shopContactID(e.shop), 2)
        return "Bought it for \(money(price)). The kid's parent thanked you."
    }

    /// Tells the kid it is not worth much, and buys it cheap. The kid can find out later.
    func lowballKid(_ e: ShopEncounter) -> String {
        let price = max(1, ShowSession.round(e.market * Balance.kidLowballShare))
        guard canAfford(price), let goods = e.goods, case .single(let print, let slug, let condition) = goods else {
            return "You do not have \(money(price))."
        }
        buyCardAtShow(OwnedCard(print: print, setSlug: slug, acquired: .now, paid: price, ripID: nil, condition: condition),
                      price: price, vendor: "a kid", at: e.shop.rawValue)
        recordScam(seller: "A kid at \(e.shop.rawValue)", contactID: shopContactID(e.shop), item: print.name)
        return "The kid took \(money(price))."
    }

    /// Sells the player's card for cash, in person.
    func sellToShopBuyer(_ e: ShopEncounter) -> String {
        guard let id = e.cardID, let card = card(id), card.status == nil, !card.keep else { return "You no longer have the card." }
        data.raw.removeAll { $0.id == id }
        data.slabs.removeAll { $0.id == id }
        let name = card.print.name + (card.grade.map { " " + $0.label } ?? "")
        addLedger(e.price, .sale, "\(name) · \(e.who) at \(e.shop.rawValue)")
        addReceipt(name: name, venue: e.shop.rawValue, price: e.price, net: e.price, paid: card.paid)
        recordDeal(nil, what: "Sold \(name)", price: e.price, market: e.market, slug: card.setSlug)
        if let fake = card.fake {
            recordBadSale(item: name, channel: e.shop.rawValue, price: e.price, fake: fake, known: card.isKnownFake, refunds: false)
        }
        log("Sold \(name) to \(e.who) at \(e.shop.rawValue) for \(money(e.price)).", cash: e.price)
        save()
        return "Sold for \(money(e.price)) cash."
    }

    /// Buys what a regular or the owner offers.
    func buyFromShopEncounter(_ e: ShopEncounter) -> String {
        guard canAfford(e.price), let goods = e.goods else { return "You do not have \(money(e.price))." }
        switch goods {
        case .single(let print, let slug, let condition):
            var card = OwnedCard(print: print, setSlug: slug, acquired: .now, paid: e.price, ripID: nil, condition: condition)
            card.fake = e.fake
            buyCardAtShow(card, price: e.price, vendor: e.who, at: e.shop.rawValue)
            recordDeal(nil, what: "Bought \(print.name)", price: e.price, market: e.market, slug: slug)
        case .sealed(let product):
            buySealedAtShow(product, price: e.price, vendor: e.who, at: e.shop.rawValue, fake: e.fake)
            if e.kind == .ownerHold { addPoints(shopContactID(e.shop), 2) }
        default:
            return ""
        }
        return "Bought for \(money(e.price))."
    }

    /// Puts the tipped garage sale on the calendar for tomorrow.
    func takeShopTip(_ e: ShopEncounter) -> String {
        let sale = PostedSale(kind: .garage, address: "\(Int.random(in: 11...998)) Maple Ct", startDay: data.day + 1, days: 1,
                              postedDay: data.day, far: false, quality: 1.4)
        data.sales.append(sale)
        log("\(e.who) at \(e.shop.rawValue) told you about a garage sale on \(sale.address) tomorrow.")
        save()
        return "The garage sale on \(sale.address) is on your calendar for tomorrow."
    }
}
