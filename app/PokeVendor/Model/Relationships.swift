import Foundation

// Relationships and reputation (docs/21-relationships-and-reputation.md).

enum ContactKind: String, Codable, CaseIterable {
    case gameShop, vintageDealer, modernDealer, shopBooth, collector, trader, buyer

    var label: String {
        switch self {
        case .gameShop: "Game shop"
        case .vintageDealer: "Vintage dealer"
        case .modernDealer: "Modern dealer"
        case .shopBooth: "Game shop booth"
        case .collector: "Collector"
        case .trader: "Trader"
        case .buyer: "Buyer"
        }
    }

    var icon: String {
        switch self {
        case .gameShop: "storefront"
        case .vintageDealer: "crown"
        case .modernDealer: "sparkles"
        case .shopBooth: "storefront"
        case .collector: "person.fill"
        case .trader: "arrow.triangle.swap"
        case .buyer: "bag"
        }
    }

    var isVendor: Bool { [.vintageDealer, .modernDealer, .shopBooth].contains(self) }

    var vendorKind: VendorKind {
        switch self {
        case .vintageDealer: .vintageDealer
        case .shopBooth: .gameShop
        default: .modernDealer
        }
    }
}

/// What a contact collects or looks for.
enum Interest: Codable, Hashable {
    /// Text inside card names, for example "Charizard".
    case pokemon(String)
    case set(String)
    case sealed
    case vintage

    var label: String {
        switch self {
        case .pokemon(let name): name
        case .set(let slug): SetLibrary.info(slug)?.name ?? slug
        case .sealed: "Sealed"
        case .vintage: "Vintage"
        }
    }

    func matches(_ goods: VendorGoods) -> Bool {
        switch (self, goods) {
        case (.pokemon(let name), .single(let p, _, _)), (.pokemon(let name), .slab(let p, _, _)): p.name.contains(name)
        case (.set(let slug), .single(_, let s, _)), (.set(let slug), .slab(_, let s, _)): s == slug
        case (.set(let slug), .sealed(let product)): product.homeSlug == slug
        case (.sealed, .sealed): true
        case (.vintage, .single(_, let s, _)), (.vintage, .slab(_, let s, _)): Balance.vintageSets.contains(s)
        case (.vintage, .sealed(let product)): Balance.vintageSets.contains(product.homeSlug)
        default: false
        }
    }
}

/// One line of the player's want list.
struct WantItem: Codable, Identifiable, Hashable {
    var id = UUID()
    /// Text inside a card's name, for example "Umbreon". Empty matches any card of the set.
    var cardName: String
    /// A set, or nil for any set.
    var setSlug: String?
    /// True to want sealed product of the set, not cards.
    var sealed = false

    var label: String {
        let set = setSlug.flatMap { SetLibrary.info($0)?.name }
        if sealed { return "Sealed \(set ?? "product")" }
        if cardName.isEmpty { return "Cards from \(set ?? "any set")" }
        return set.map { "\(cardName) · \($0)" } ?? cardName
    }

    func matches(_ goods: VendorGoods) -> Bool {
        switch goods {
        case .single(let p, let s, _), .slab(let p, let s, _):
            guard !sealed else { return false }
            return (setSlug == nil || setSlug == s) && (cardName.isEmpty || p.name.localizedCaseInsensitiveContains(cardName))
        case .sealed(let product):
            return sealed && (setSlug == nil || product.homeSlug == setSlug)
        case .mystery:
            return false
        }
    }
}

/// A person or a business that the game remembers.
struct Contact: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let kind: ContactKind
    /// 0 to 100. A game shop keeps its points in its ShopState.
    var points: Int
    var interests: [Interest]
    /// The last deals, newest first.
    var memory: [String] = []
    var atLocalShows = false
    var atRegionalShows = false
    var lastDealDay = -1
    var deals = 0
    /// The sets of what the player bought from them, newest first. Saved items follow it.
    var history: [String] = []
    /// The highest level that already gave reputation, so each level gives it once.
    var rewardedLevel = 0
    /// For a game shop.
    var shop: LocalStore?
}

/// Something a contact set aside for the player.
struct SavedItem: Codable, Identifiable, Hashable {
    var id = UUID()
    let contactID: String
    let goods: VendorGoods
    let price: Double
    let market: Double
    /// The last day to pick it up.
    let untilDay: Int
    /// For a show vendor: the show where it waits. Nil at a game shop.
    let showID: UUID?
    /// A show vendor asks first. The item waits only when the player says yes.
    var accepted: Bool

    var name: String { VendorItem(goods: goods, price: price, market: market).name }
}

/// A lowball that a seller can find out about later.
struct ScamRecord: Codable, Hashable {
    let sellerName: String
    let contactID: String?
    let itemName: String
    let dayFound: Int
}

extension StandingLevel {
    var rank: Int {
        switch self {
        case .stranger: 0
        case .familiar: 1
        case .regular: 2
        case .trusted: 3
        case .friend: 4
        }
    }

    /// A contact asks this much less when selling to the player, and offers this much more when buying.
    var priceBonus: Double { [0, 0.05, 0.10, 0.15, 0.20][rank] }
    var patienceBonus: Int { rank >= 1 ? 1 : 0 }
    /// How many things the contact saves for the player at once.
    var savedCount: Int { [0, 0, 1, 2, 3][rank] }
}

enum ReputationTier {
    static let thresholds = [0, 50, 150, 350, 700]
    static let names = ["Unknown", "Known", "Trusted", "Respected", "Elite"]

    static func tier(_ points: Int) -> Int { thresholds.lastIndex { points >= $0 } ?? 0 }
}

extension GameStore {
    // MARK: - Roster

    /// Builds the roster the first time: the two game shops, 12 recurring show vendors, and 20 regulars.
    func seedContacts() {
        guard data.contacts.isEmpty else { return }
        var out: [Contact] = LocalStore.allCases.filter(\.isGameShop).map { shop in
            Contact(id: "shop:\(shop.rawValue)", name: shop.rawValue, kind: .gameShop, points: 0,
                    interests: [.sealed], shop: shop)
        }
        var used = Set(out.map(\.name))
        func name(_ kind: VendorKind) -> String {
            var n = VendorKind.randomName(kind)
            var tries = 0
            while used.contains(n) && tries < 30 {
                n = VendorKind.randomName(kind)
                tries += 1
            }
            used.insert(n)
            return n
        }
        let vendorPlan: [(ContactKind, Int)] = [(.vintageDealer, 5), (.modernDealer, 5), (.shopBooth, 2)]
        var i = 0
        for (kind, count) in vendorPlan {
            for _ in 0..<count {
                out.append(Contact(id: "vendor:\(i)", name: name(kind.vendorKind), kind: kind, points: 0,
                                   interests: randomInterests(kind), atLocalShows: Double.random(in: 0..<1) < 0.4,
                                   atRegionalShows: true))
                i += 1
            }
        }
        let people = ["Marcus", "Jen", "Tyler", "Priya", "Dev", "Sam", "Alyssa", "Chris", "Nate", "Olivia", "Jordan", "Kai",
                      "Mia", "Ben", "Rosa", "Luis", "Hannah", "Theo", "Gabe", "Wes", "Tina", "Omar", "Lena", "Victor"].shuffled()
        let regularPlan: [ContactKind] = Array(repeating: .collector, count: 9) + Array(repeating: .trader, count: 5)
            + Array(repeating: .buyer, count: 6)
        for (j, kind) in regularPlan.enumerated() {
            out.append(Contact(id: "regular:\(j)", name: people[j % people.count], kind: kind, points: 0,
                               interests: randomInterests(kind), atLocalShows: Double.random(in: 0..<1) < 0.6,
                               atRegionalShows: Double.random(in: 0..<1) < 0.8))
        }
        data.contacts = out
    }

    private func randomInterests(_ kind: ContactKind) -> [Interest] {
        let pokemon = ["Charizard", "Pikachu", "Eevee", "Umbreon", "Mew", "Gengar", "Lugia", "Rayquaza", "Gardevoir", "Greninja",
                       "Mimikyu", "Sylveon", "Blastoise", "Dragonite", "Snorlax"]
        switch kind {
        case .vintageDealer: return [.vintage, .pokemon(pokemon.randomElement() ?? "Charizard")]
        case .shopBooth: return [.sealed]
        case .modernDealer: return [.set(Balance.modernSets.randomElement() ?? "prismatic-evolutions")]
        default:
            var out: [Interest] = [.pokemon(pokemon.randomElement() ?? "Pikachu")]
            if Bool.random() { out.append(Bool.random() ? .vintage : .sealed) }
            return out
        }
    }

    func contact(_ id: String?) -> Contact? {
        guard let id else { return nil }
        return data.contacts.first { $0.id == id }
    }

    func shopContactID(_ shop: LocalStore) -> String { "shop:\(shop.rawValue)" }

    /// A game shop's price bonus for the player, from their relationship.
    func shopDiscount(_ shop: LocalStore) -> Double { shop.isGameShop ? level(shopContactID(shop)).priceBonus : 0 }

    func points(of contact: Contact) -> Int {
        if let shop = contact.shop { return self.shop(shop).points }
        return contact.points
    }

    func level(_ id: String?) -> StandingLevel {
        guard let c = contact(id) else { return .stranger }
        return StandingLevel(points: points(of: c))
    }

    /// Moves a relationship. A game shop's points live in its ShopState. Reaching Trusted or Friend the first time
    /// raises reputation.
    func addPoints(_ id: String?, _ delta: Int) {
        guard let id, let i = data.contacts.firstIndex(where: { $0.id == id }) else { return }
        if let shop = data.contacts[i].shop {
            var state = self.shop(shop)
            state.points = max(0, min(100, state.points + delta))
            data.shops[shop.rawValue] = state
        } else {
            data.contacts[i].points = max(0, min(100, data.contacts[i].points + delta))
        }
        let level = StandingLevel(points: points(of: data.contacts[i]))
        if level.rank > data.contacts[i].rewardedLevel {
            data.contacts[i].rewardedLevel = level.rank
            let name = data.contacts[i].name
            if level == .trusted {
                addReputation(10)
                log("\(name) trusts you now.")
            } else if level == .friend {
                addReputation(20)
                log("\(name) calls you a friend now.")
            }
        }
    }

    // MARK: - Deals

    /// A finished deal with a contact or a stranger. A fair price (within 10% of market) counts more, and it raises
    /// reputation too.
    func recordDeal(_ id: String?, what: String, price: Double, market: Double, slug: String?) {
        let fair = market > 0 && abs(price - market) / market <= 0.10
        if fair { addReputation(1) }
        guard let id, let i = data.contacts.firstIndex(where: { $0.id == id }) else { return }
        data.contacts[i].deals += 1
        data.contacts[i].lastDealDay = data.day
        data.contacts[i].memory.insert("\(what) for \(money(price)), day \(data.day + 1)", at: 0)
        data.contacts[i].memory = Array(data.contacts[i].memory.prefix(3))
        if let slug {
            data.contacts[i].history.insert(slug, at: 0)
            data.contacts[i].history = Array(data.contacts[i].history.prefix(8))
        }
        addPoints(id, fair ? 3 : 2)
        save()
    }

    func lowballed(_ id: String?) { addPoints(id, -2) }
    func walkedAway(_ id: String?) { addPoints(id, -1) }

    /// A stranger who dealt well with the player gives their number and becomes a contact.
    func promote(name: String, kind: ContactKind, interest: Interest?, points: Int) -> String? {
        guard data.contacts.count < Balance.maxContacts, !data.contacts.contains(where: { $0.name == name }) else { return nil }
        let id = "met:\(UUID().uuidString.prefix(8))"
        data.contacts.append(Contact(id: id, name: name, kind: kind, points: points, interests: interest.map { [$0] } ?? [],
                                     atLocalShows: true, atRegionalShows: true))
        log("\(name) gave you their number.")
        save()
        return id
    }

    // MARK: - Reputation

    var reputationTier: Int { ReputationTier.tier(data.reputation) }
    var reputationName: String { ReputationTier.names[reputationTier] }

    func addReputation(_ delta: Int) {
        let before = reputationTier
        data.reputation = max(0, data.reputation + delta)
        let after = reputationTier
        if after != before {
            log(after > before ? "Word gets around. Your reputation is \(ReputationTier.names[after]) now."
                               : "Your reputation dropped to \(ReputationTier.names[after]).")
        }
    }

    /// A lie to a naive seller. About 1 time in 3 the seller finds out some days later.
    func recordScam(seller: String, contactID: String?, item: String) {
        guard Double.random(in: 0..<1) < Balance.scamFoundChance else { return }
        data.scams.append(ScamRecord(sellerName: seller, contactID: contactID, itemName: item,
                                     dayFound: data.day + Int.random(in: 3...20)))
    }

    // MARK: - Want list

    func addWant(_ item: WantItem) {
        guard data.wantList.count < Balance.wantListSize else { return }
        data.wantList.append(item)
        save()
    }

    func removeWant(_ id: UUID) {
        data.wantList.removeAll { $0.id == id }
        save()
    }

    func isWanted(_ goods: VendorGoods) -> Bool { data.wantList.contains { $0.matches(goods) } }

    /// Something a contact could save for the player: a want list item first, then something like what the player
    /// bought from them, then their own interests.
    func findForPlayer(_ c: Contact) -> (VendorGoods, Double)? {
        for want in data.wantList.shuffled() {
            if let found = find(want) { return found }
        }
        let slugs = c.history.isEmpty ? [] : c.history
        if let slug = slugs.randomElement(), let found = find(WantItem(cardName: "", setSlug: slug, sealed: c.kind == .shopBooth || c.kind == .gameShop)) {
            return found
        }
        for interest in c.interests.shuffled() {
            let want: WantItem = switch interest {
            case .pokemon(let name): WantItem(cardName: name, setSlug: nil)
            case .set(let slug): WantItem(cardName: "", setSlug: slug)
            case .sealed: WantItem(cardName: "", setSlug: Balance.modernSets.randomElement(), sealed: true)
            case .vintage: WantItem(cardName: "", setSlug: Balance.vintageSets.randomElement())
            }
            if let found = find(want) { return found }
        }
        return nil
    }

    private func find(_ want: WantItem) -> (VendorGoods, Double)? {
        if want.sealed {
            let products = SetLibrary.catalog.filter { (want.setSlug == nil || $0.homeSlug == want.setSlug) && $0.market > 0 }
            return products.randomElement().map { (.sealed($0), $0.market) }
        }
        let slugs = want.setSlug.map { [$0] } ?? Array(Balance.showSets.shuffled().prefix(25))
        for slug in slugs {
            let prints = SetLibrary.set(slug).prints.filter {
                ($0.market ?? 0) >= 3 && !["Common", "Uncommon"].contains($0.rarity)
                    && (want.cardName.isEmpty || $0.name.localizedCaseInsensitiveContains(want.cardName))
            }
            if let p = prints.randomElement() {
                let old = Balance.vintageSets.contains(slug) || Balance.olderSets.contains(slug)
                let c = old ? Condition.played() : Condition.packFresh()
                return (.single(p, slug: slug, condition: c), (p.market ?? 0) * c.wear.valueFactor)
            }
        }
        return nil
    }

    // MARK: - Saved items

    func savedAtShop(_ shop: LocalStore) -> [SavedItem] {
        let id = shopContactID(shop)
        return data.saved.filter { $0.contactID == id && $0.untilDay >= data.day }
    }

    func savedAtShow(_ showID: UUID, vendor contactID: String) -> [SavedItem] {
        data.saved.filter { $0.showID == showID && $0.contactID == contactID && $0.accepted }
    }

    /// Offers from show vendors that wait for the player's answer.
    var pendingOffers: [SavedItem] { data.saved.filter { $0.showID != nil && !$0.accepted } }

    func answerOffer(_ id: UUID, hold: Bool) {
        guard let i = data.saved.firstIndex(where: { $0.id == id }) else { return }
        if hold { data.saved[i].accepted = true } else { data.saved.remove(at: i) }
        save()
    }

    /// Buys a saved item: at a game shop with cash or credit, or at a show with cash.
    @discardableResult
    func pickUp(_ item: SavedItem, credit: Bool = false) -> Bool {
        guard let c = contact(item.contactID), data.saved.contains(where: { $0.id == item.id }) else { return false }
        if let shop = c.shop {
            var state = self.shop(shop)
            if credit {
                guard state.credit >= item.price - 0.001 else { return false }
                state.credit -= item.price
                data.shops[shop.rawValue] = state
            } else {
                guard canAfford(item.price) else { return false }
                addLedger(-item.price, item.goodsIsSealed ? .sealed : .singles, "\(item.name) · saved at \(c.name)")
            }
        } else {
            guard canAfford(item.price) else { return false }
            addLedger(-item.price, item.goodsIsSealed ? .sealed : .singles, "\(item.name) · saved by \(c.name)")
        }
        data.saved.removeAll { $0.id == item.id }
        switch item.goods {
        case .single(let p, let slug, let condition):
            data.raw.append(OwnedCard(print: p, setSlug: slug, acquired: .now, paid: item.price, ripID: nil, condition: condition,
                                      acquiredDay: data.day))
        case .slab(let p, let slug, let grade):
            data.slabs.append(OwnedCard(print: p, setSlug: slug, acquired: .now, paid: item.price, ripID: nil, grade: grade,
                                        acquiredDay: data.day))
        case .sealed(let product):
            data.sealed.append(SealedItem(setSlug: product.homeSlug, name: product.name, packs: product.packs, paid: item.price,
                                          acquired: .now, source: "Saved for you by \(c.name)", productID: product.id,
                                          acquiredDay: data.day))
        case .mystery:
            break
        }
        log("Picked up the \(item.name) that \(c.name) saved for you, for \(money(item.price)).", cash: credit ? nil : -item.price)
        addPoints(c.id, 3)
        recordDeal(c.id, what: "Picked up \(item.name)", price: item.price, market: item.market, slug: item.goodsSlug)
        return true
    }

    /// Test tool: every contact goes to Regular (40 points), and the game shops save something now.
    func testMakeRegular() {
        seedContacts()
        for c in data.contacts where points(of: c) < 40 { addPoints(c.id, 40 - points(of: c)) }
        for shop in LocalStore.allCases where shop.isGameShop {
            let id = shopContactID(shop)
            if let c = contact(id), data.saved.filter({ $0.contactID == id }).isEmpty, let (goods, market) = findForPlayer(c) {
                data.saved.append(SavedItem(contactID: id, goods: goods, price: Market.retail(market * 0.9), market: market,
                                            untilDay: data.day + 3, showID: nil, accepted: true))
            }
        }
        save()
    }

    // MARK: - Each day

    /// Holds that ran out, new saved items, show vendor offers, scams that came out, and quiet relationships.
    func relationshipsEndDay() -> [String] {
        seedContacts()
        var lines: [String] = []
        // Holds that ran out. A show hold runs out when its show ends.
        for item in data.saved {
            let expired: Bool
            if let showID = item.showID {
                expired = (show(showID)?.endDay ?? -1) < data.day
            } else {
                expired = item.untilDay < data.day
            }
            guard expired else { continue }
            data.saved.removeAll { $0.id == item.id }
            if item.accepted, let c = contact(item.contactID) {
                addPoints(c.id, -5)
                lines.append("You did not pick up the \(item.name) that \(c.name) saved for you. \(c.name) is not happy.")
            }
        }
        // Game shops save things for regulars.
        for shop in LocalStore.allCases where shop.isGameShop {
            let id = shopContactID(shop)
            guard let c = contact(id) else { continue }
            let lvl = level(id)
            let now = data.saved.filter { $0.contactID == id }.count
            guard now < lvl.savedCount, Double.random(in: 0..<1) < 0.25, let (goods, market) = findForPlayer(c) else { continue }
            let item = SavedItem(contactID: id, goods: goods, price: Market.retail(market * (1 - lvl.priceBonus)), market: market,
                                 untilDay: data.day + 3, showID: nil, accepted: true)
            data.saved.append(item)
            lines.append("\(c.name) saved a \(item.name) for you. Pick it up by day \(item.untilDay + 1).")
        }
        // Show vendors at Regular and up offer to bring something, 3 days before a show.
        for show in data.shows where show.startDay - data.day == 3 {
            for c in attendingVendors(show) where level(c.id).rank >= StandingLevel.regular.rank {
                let lvl = level(c.id)
                guard data.saved.filter({ $0.contactID == c.id && $0.showID == show.id }).count < lvl.savedCount,
                      let (goods, market) = findForPlayer(c) else { continue }
                let item = SavedItem(contactID: c.id, goods: goods, price: Market.retail(market * (1 - lvl.priceBonus)),
                                     market: market, untilDay: show.endDay, showID: show.id, accepted: false)
                data.saved.append(item)
                lines.append("\(c.name) can bring a \(item.name) to \(show.name) for you. Answer in Contacts.")
            }
        }
        // A lie that came out.
        for scam in data.scams where scam.dayFound == data.day {
            addReputation(-Balance.scamReputationCost)
            addPoints(scam.contactID, -30)
            lines.append("\(scam.sellerName) found out what the \(scam.itemName) was worth. Word is getting around.")
            if hasAccount { data.social.authenticity = max(0, data.social.authenticity - 0.1) }
        }
        data.scams.removeAll { $0.dayFound <= data.day }
        // A relationship with no deal for 8 weeks fades a little each week.
        for i in data.contacts.indices where data.contacts[i].shop == nil && data.contacts[i].points > 0 {
            let quiet = data.day - data.contacts[i].lastDealDay
            if data.contacts[i].lastDealDay >= 0, quiet > 56, quiet % 7 == 0 {
                data.contacts[i].points -= 1
            }
        }
        return lines
    }

    /// The recurring vendors at a show. A regional show has all of its regulars. A local show has some of them.
    func attendingVendors(_ show: CardShow) -> [Contact] {
        var r = SeededRandom(seed: UInt64(show.startDay + 1) &* 7_919 &+ 97)
        return data.contacts.filter { c in
            guard c.kind.isVendor else { return false }
            let roll = r.next()
            return show.size == .regional ? c.atRegionalShows : (c.atLocalShows && roll < 0.7)
        }
    }

    /// The regulars at a show, who come to the player's table and stop the player on the floor.
    func attendingRegulars(_ show: CardShow) -> [Contact] {
        var r = SeededRandom(seed: UInt64(show.startDay + 1) &* 104_729 &+ 13)
        return data.contacts.filter { c in
            guard !c.kind.isVendor, c.kind != .gameShop else { return false }
            let roll = r.next()
            return show.size == .regional ? (c.atRegionalShows && roll < 0.8) : (c.atLocalShows && roll < 0.5)
        }
    }
}

extension SavedItem {
    var goodsIsSealed: Bool {
        if case .sealed = goods { return true }
        return false
    }

    var goodsSlug: String? {
        switch goods {
        case .single(_, let s, _), .slab(_, let s, _): s
        case .sealed(let p): p.homeSlug
        case .mystery: nil
        }
    }
}

extension Balance {
    static let maxContacts = 60
    static let wantListSize = 10
    static let scamFoundChance = 0.35
    static let scamReputationCost = 30
}
