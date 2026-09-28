import Foundation

// Counterfeit risk (docs/14-counterfeit-risk.md).

/// How good a fake is. The tier sets how each check catches it.
enum FakeTier: Int, Codable, Comparable, CaseIterable {
    /// An obvious bootleg: the eyeball check almost always catches it.
    case bootleg
    /// A convincing fake: it needs the paid check or the tool.
    case convincing
    /// A professional counterfeit: only full grading is sure.
    case professional

    static func < (a: FakeTier, b: FakeTier) -> Bool { a.rawValue < b.rawValue }

    var label: String {
        switch self {
        case .bootleg: "Obvious bootleg"
        case .convincing: "Convincing fake"
        case .professional: "Professional counterfeit"
        }
    }
}

/// Where an item came from. Each source has its own fake rate (docs/14-counterfeit-risk.md, Where the risk lives).
enum FakeSource: Hashable {
    /// Pokemon Center, Amazon, camping, big stores, and the game shop shelf: no risk.
    case none
    case reseller
    case ebay
    case facebook
    case garageSale
    case estateSale
    /// A stranger at a show or a meet.
    case stranger
    /// A contact the game remembers. A better relationship means less risk.
    case contact(StandingLevel)
    /// The game shop display case and buy-ins.
    case shopCase
    case wholesale

    var rate: Double {
        switch self {
        case .none, .wholesale: 0
        case .reseller: Balance.fakeRateReseller
        case .ebay: Balance.fakeRateEbay
        case .facebook: Balance.fakeRateFacebook
        case .garageSale: Balance.fakeRateGarageSale
        case .estateSale: Balance.fakeRateEstateSale
        case .stranger: Balance.fakeRateStranger
        case .contact(let level): level.rank <= 1 ? Balance.fakeRateFamiliar : Balance.fakeRateRegular
        case .shopCase: Balance.fakeRateShopCase
        }
    }
}

/// A sale of a fake that the buyer found out about. It resolves on `dayFound` (docs/15-selling.md, Bad sales).
struct BadSale: Codable, Identifiable, Hashable {
    var id = UUID()
    let item: String
    let channel: String
    let price: Double
    var contactID: String?
    var shop: LocalStore?
    /// The player knew the item was fake when they sold it.
    let known: Bool
    /// The platform refunds the buyer from the player's cash.
    let refunds: Bool
    let dayFound: Int
}

extension Balance {
    // The chance that one item from a source is a fake, before the age and hype factors.
    static let fakeRateReseller = 0.04
    static let fakeRateEbay = 0.08
    static let fakeRateFacebook = 0.10
    static let fakeRateGarageSale = 0.12
    static let fakeRateEstateSale = 0.08
    static let fakeRateStranger = 0.05
    static let fakeRateFamiliar = 0.02
    static let fakeRateRegular = 0.005
    static let fakeRateShopCase = 0.01
    /// Sealed product is resealed less often than a single is faked.
    static let fakeRateSealedFactor = 0.5
    /// Vintage is faked the most. Older sets a little more than new ones.
    static let fakeAgeVintage = 3.0
    static let fakeAgeOlder = 1.5
    /// A hyped product, at over 2x MSRP, is faked more.
    static let fakeHypeFactor = 1.5
    /// The share of fakes at each tier: bootleg, convincing, professional.
    static let fakeTierWeights = [0.5, 0.35, 0.15]
    /// The chance that a look by eye catches each tier.
    static let eyeballCatch = [0.90, 0.15, 0.0]
    /// Paid authentication of one card: cheaper and faster than grading.
    static let authenticationFee = 8.0
    static let authenticationDays = 3
    /// The authentication tool misses a professional counterfeit this often.
    static let authToolMissChance = 0.10
    /// The chance that the buyer of a fake finds out, by tier, plus a bonus when the player knew.
    static let fakeFoundChance = [0.90, 0.60, 0.25]
    static let knownFakeFoundBonus = 0.30
    /// The buyer finds out 2 to 10 days after the sale.
    static let fakeFoundDays = 2...10
    /// The game shop buylist checks each card first, by tier.
    static let shopDetectChance = [0.95, 0.70, 0.40]
    /// A bad sale goes public with this chance, plus 10% for each reputation tier and each follower tier.
    static let publicScamBase = 0.30
    static let publicScamTierStep = 0.10
    static let publicScamFollowerLoss = 0.05
    static let publicScamAuthenticityCost = 0.10
    static let fakeSoldReputationCost = 40
    static let fakeSoldContactCost = 20
    static let shopFakeStandingCost = 20
    /// A buyer at a show or a meet who catches a fake at the table.
    static let fakeCaughtReputationCost = 10
    static let fakeCaughtContactCost = 10
}

/// The rolls for fakes. The rates come from `Balance`.
enum Counterfeit {
    /// The chance that this item is a fake.
    static func rate(source: FakeSource, sealed: Bool, slug: String?, market: Double, msrp: Double?) -> Double {
        var rate = source.rate
        guard rate > 0 else { return 0 }
        if let slug {
            if Balance.vintageSets.contains(slug) { rate *= Balance.fakeAgeVintage }
            else if Balance.olderSets.contains(slug) { rate *= Balance.fakeAgeOlder }
        }
        if sealed {
            rate *= Balance.fakeRateSealedFactor
            if let msrp, msrp > 0, market / msrp > 2 { rate *= Balance.fakeHypeFactor }
        }
        return min(0.6, rate)
    }

    /// The tier for a roll in 0..<1.
    static func tier(roll: Double) -> FakeTier {
        var r = roll
        for (i, w) in Balance.fakeTierWeights.enumerated() {
            if r < w { return FakeTier(rawValue: i) ?? .bootleg }
            r -= w
        }
        return .professional
    }

    /// A fake, or nil, with the system random generator.
    static func roll(source: FakeSource, sealed: Bool, slug: String?, market: Double, msrp: Double? = nil) -> FakeTier? {
        guard Double.random(in: 0..<1) < rate(source: source, sealed: sealed, slug: slug, market: market, msrp: msrp) else { return nil }
        return tier(roll: Double.random(in: 0..<1))
    }

    /// A fake, or nil, with a seeded generator, so a day's stock stays the same.
    static func roll(source: FakeSource, sealed: Bool, slug: String?, market: Double, msrp: Double? = nil, _ r: inout SeededRandom) -> FakeTier? {
        let first = r.double(0...1)
        let second = r.double(0...1)
        guard first < rate(source: source, sealed: sealed, slug: slug, market: market, msrp: msrp) else { return nil }
        return tier(roll: second)
    }

    /// Whether a look by eye catches the fake. `tired` is the tired factor (1 is rested).
    static func eyeballCatches(_ tier: FakeTier, tired: Double = 1) -> Bool {
        Double.random(in: 0..<1) < Balance.eyeballCatch[tier.rawValue] * tired
    }

    static func eyeballCatches(_ tier: FakeTier, tired: Double = 1, _ r: inout SeededRandom) -> Bool {
        r.double(0...1) < Balance.eyeballCatch[tier.rawValue] * tired
    }

    /// The same item always gives the same reading: a hash of its id decides.
    static func eyeballCatches(_ tier: FakeTier, id: UUID) -> Bool {
        unit(id, salt: 1) < Balance.eyeballCatch[tier.rawValue]
    }

    /// The tool misses a professional counterfeit 1 time in 10, and the same card always reads the same.
    static func toolMisses(_ tier: FakeTier, id: UUID) -> Bool {
        tier == .professional && unit(id, salt: 2) < Balance.authToolMissChance
    }

    /// A stable number in 0..<1 from an id.
    static func unit(_ id: UUID, salt: UInt64) -> Double {
        var hash: UInt64 = 1469598103934665603 &+ salt &* 7919
        for b in id.uuidString.utf8 { hash = (hash ^ UInt64(b)) &* 1099511628211 }
        return Double(hash % 10_000) / 10_000
    }

    /// The tells that the player can see on a fake.
    static func tells(_ tier: FakeTier, sealed: Bool) -> String {
        if sealed {
            switch tier {
            case .bootleg: "The wrap seam is glued, not heat sealed, and the print is blurry."
            case .convincing: "The wrap looks right. The weight feels a little light."
            case .professional: "Nothing to see. It looks factory fresh."
            }
        } else {
            switch tier {
            case .bootleg: "The cardstock is soft, the colors are flat, and the back is the wrong blue."
            case .convincing: "The print is sharp. The holo pattern is a little off."
            case .professional: "Nothing to see. Only a grader can tell."
            }
        }
    }
}

@MainActor
extension GameStore {
    // MARK: - Reading

    /// The player's tired factor for a look by eye (docs/16-time-and-day.md, Late nights).
    var tiredFactor: Double { data.tiredToday }

    /// The fake source for a stranger or a contact.
    func fakeSource(contact id: String?, fallback: FakeSource) -> FakeSource {
        guard let id, contact(id) != nil else { return fallback }
        return .contact(level(id))
    }

    /// What the eyeball check says about an owned card: nil when it looks right.
    func eyeballWarning(_ card: OwnedCard) -> String? {
        guard let tier = card.fake, card.fakeKnown != true, Counterfeit.eyeballCatches(tier, id: card.id) else { return nil }
        return Counterfeit.tells(tier, sealed: false)
    }

    func eyeballWarning(_ item: SealedItem) -> String? {
        guard let tier = item.fake, item.fakeKnown != true, Counterfeit.eyeballCatches(tier, id: item.id) else { return nil }
        return Counterfeit.tells(tier, sealed: true)
    }

    /// The authentication tool's reading: true is real, false is fake, nil when the player has no tool.
    func toolReading(fake: FakeTier?, id: UUID) -> Bool? {
        guard hasUpgrade(.authTool) else { return nil }
        guard let fake else { return true }
        return Counterfeit.toolMisses(fake, id: id)
    }

    /// The market value of a card as if it were real: what a buyer who does not know pays.
    func realMarket(of item: SealedItem) -> Double {
        if let product = SetLibrary.product(item.productID, in: item.setSlug) { return product.market }
        return (SetLibrary.set(item.setSlug).packCost ?? 0) * Double(item.packs)
    }

    // MARK: - Authentication

    /// Sends cards to a paid authenticator: cheaper and faster than grading (docs/14, Detection).
    func authenticate(_ ids: Set<UUID>) {
        let cards = (data.raw + data.slabs).filter { ids.contains($0.id) && $0.status == nil && !$0.isVerified && $0.fakeKnown != true }
        guard !cards.isEmpty else { return }
        let fee = Balance.authenticationFee * Double(cards.count)
        guard canAfford(fee) else { return }
        let ledgerID = addLedger(-fee, .authentication, "\(cards.count) card\(cards.count == 1 ? "" : "s") authenticated", pending: true)
        let set = Set(cards.map(\.id))
        for i in data.raw.indices where set.contains(data.raw[i].id) {
            data.raw[i].status = .atAuthenticator(daysLeft: Balance.authenticationDays, ledgerID: ledgerID)
        }
        for i in data.slabs.indices where set.contains(data.slabs[i].id) {
            data.slabs[i].status = .atAuthenticator(daysLeft: Balance.authenticationDays, ledgerID: ledgerID)
        }
        log("Sent \(cards.count) card\(cards.count == 1 ? "" : "s") for authentication (\(Balance.authenticationDays) days).", cash: -fee)
        save()
    }

    /// One card back from the authenticator. Returns the morning line.
    func authenticationResult(_ card: inout OwnedCard) -> String {
        card.status = nil
        if card.fake != nil {
            card.fakeKnown = true
            return "Authentication: your \(card.print.name) is a fake (\(card.fake?.label.lowercased() ?? "")). It is worth nothing."
        }
        card.verified = true
        return "Authentication: your \(card.print.name) is real."
    }

    /// The player found out for themself: the card is a fake.
    func markFakeKnown(cardID: UUID) {
        for i in data.raw.indices where data.raw[i].id == cardID && data.raw[i].fake != nil { data.raw[i].fakeKnown = true }
        for i in data.slabs.indices where data.slabs[i].id == cardID && data.slabs[i].fake != nil { data.slabs[i].fakeKnown = true }
        save()
    }

    func markFakeKnown(sealedID: UUID) {
        for i in data.sealed.indices where data.sealed[i].id == sealedID && data.sealed[i].fake != nil { data.sealed[i].fakeKnown = true }
        save()
    }

    /// The fake tier of a sealed item in the rip queue, by the item or by the product it came out of.
    func fakeOf(sourceID: UUID) -> FakeTier? {
        data.sealed.first { $0.id == sourceID }?.fake ?? data.sealed.first { $0.brokenFrom == sourceID }?.fake
    }

    /// The tear showed a resealed product. Every pack that came out of it is a known fake now.
    func foundResealed(sourceID: UUID, name: String) {
        var count = 0
        for i in data.sealed.indices where data.sealed[i].id == sourceID || data.sealed[i].brokenFrom == sourceID {
            if data.sealed[i].fake == nil { data.sealed[i].fake = .convincing }
            if data.sealed[i].fakeKnown != true {
                data.sealed[i].fakeKnown = true
                count += 1
            }
        }
        log("The \(name) was resealed. Someone opened it and took the hits.\(count > 0 ? " Its other packs are worthless too." : "")")
        save()
    }

    /// Throws a known fake away. It is worth nothing, and selling it is a scam.
    func discardFake(_ id: UUID) {
        if let card = card(id), card.isKnownFake {
            data.openedPaid += card.paid ?? 0
            data.raw.removeAll { $0.id == id }
            data.slabs.removeAll { $0.id == id }
            log("Threw away the fake \(card.print.name).")
        } else if let item = data.sealed.first(where: { $0.id == id }), item.isKnownFake {
            data.openedPaid += item.paid
            data.sealed.removeAll { $0.id == id }
            log("Threw away the resealed \(item.name).")
        }
        save()
    }

    // MARK: - Selling a fake

    /// A sale of a fake. Rolls whether the buyer finds out. `refunds` is true on a platform that refunds the buyer.
    func recordBadSale(item: String, channel: String, price: Double, fake: FakeTier, known: Bool, refunds: Bool,
                       contactID: String? = nil, shop: LocalStore? = nil) {
        var chance = Balance.fakeFoundChance[fake.rawValue]
        if known { chance += Balance.knownFakeFoundBonus }
        guard Double.random(in: 0..<1) < chance else { return }
        data.badSales.append(BadSale(item: item, channel: channel, price: price, contactID: contactID, shop: shop, known: known,
                                     refunds: refunds, dayFound: data.day + Int.random(in: Balance.fakeFoundDays)))
    }

    /// Bad sales that came out today (docs/14, Consequences; docs/15, Bad sales and scam accusations).
    func counterfeitsEndDay() -> [String] {
        var lines: [String] = []
        for sale in data.badSales where sale.dayFound == data.day {
            var line = "The buyer of your \(sale.item) on \(sale.channel) found out it was a fake."
            if sale.refunds {
                addLedger(-sale.price, .refund, "Refund · fake \(sale.item)")
                line += " \(sale.channel) refunded them \(money(sale.price)) from your account."
            }
            addReputation(-Balance.fakeSoldReputationCost)
            if let id = sale.contactID { addPoints(id, -Balance.fakeSoldContactCost) }
            if let shop = sale.shop {
                var state = self.shop(shop)
                state.points = max(0, state.points - Balance.shopFakeStandingCost)
                data.shops[shop.rawValue] = state
            }
            let publicChance = Balance.publicScamBase + Balance.publicScamTierStep * Double(reputationTier + followerTier)
            if Double.random(in: 0..<1) < publicChance {
                line += " They posted about it. Word is getting around."
                if hasAccount {
                    let lost = Int(Double(data.social.followers) * Balance.publicScamFollowerLoss)
                    data.social.followers = max(0, data.social.followers - lost)
                    data.social.authenticity = max(0, data.social.authenticity - Balance.publicScamAuthenticityCost)
                    if lost > 0 { line += " You lost \(lost) followers." }
                }
            }
            lines.append(line)
        }
        let today = data.day
        data.badSales.removeAll { $0.dayFound <= today }
        return lines
    }

    // MARK: - Test tools

    /// A fake card of this tier in Raw, worth a lot if it were real.
    func addTestFake(_ tier: FakeTier) {
        let vintage = Balance.vintageSets.first ?? "base-set"
        let pool = SetLibrary.set(vintage).prints.filter { ($0.market ?? 0) >= 30 }
        guard let print = pool.randomElement() ?? SetLibrary.set("prismatic-evolutions").prints.first(where: { ($0.market ?? 0) >= 30 }) else { return }
        var card = OwnedCard(print: print, setSlug: pool.isEmpty ? "prismatic-evolutions" : vintage, acquired: .now, paid: 10, ripID: nil,
                             condition: .played(), acquiredDay: data.day)
        card.fake = tier
        data.raw.append(card)
        save()
    }

    /// A resealed Elite Trainer Box in Sealed.
    func addTestResealed() {
        guard let product = SetLibrary.catalog.first(where: { $0.kind == "Elite Trainer Box" && $0.homeSlug == "prismatic-evolutions" })
                ?? SetLibrary.catalog.first(where: { $0.kind == "Elite Trainer Box" }) else { return }
        var item = SealedItem(setSlug: product.homeSlug, name: product.name, packs: product.packs, paid: product.market * 0.6,
                              acquired: .now, source: "Test · resealed", productID: product.id, acquiredDay: data.day)
        item.fake = .convincing
        data.sealed.append(item)
        save()
    }

    /// Every card at the authenticator comes back tomorrow.
    func testAuthenticationTomorrow() {
        for i in data.raw.indices {
            if case .atAuthenticator(_, let l) = data.raw[i].status { data.raw[i].status = .atAuthenticator(daysLeft: 1, ledgerID: l) }
        }
        save()
    }
}
