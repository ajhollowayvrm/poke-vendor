import Foundation

// Theft, loss, and damage for the player, and collection insurance (docs/24-theft-and-insurance.md).

extension Balance {
    /// Show table theft: the chance for one show day, before the factors below.
    static let showTheftChance = 0.05
    static let showTheftMaxChance = 0.30
    /// The chance is 0.5x when the player never leaves the table, and 2.5x when the player is away all day.
    static let showTheftAwayBase = 0.5
    static let showTheftAwayScale = 2.0
    /// A table worth this much (or more) adds 1.0 to the multiplier. A slab on the table adds 0.25.
    static let showTheftValueScale = 2000.0
    static let showTheftSlabBonus = 0.25
    /// A thief picks by value, and a slab counts this many times.
    static let slabTheftWeight = 2.0
    /// Car break-in: the chance for one trip with stock in hand, and the most items in the stolen bag.
    static let carBreakInChance = 0.015
    static let bagMaxItems = 4
    /// Home damage: the chance for each End Day, and the most cards that it hits.
    static let homeDamageChance = 0.008
    static let homeDamageMaxCards = 3
    /// Water damage lowers the edges and the surface of a card by this much (a range, in half grades).
    static let homeDamageDrop = 2.0...4.0
    static let homeDamageFloor = 3.0
    /// The locked case multiplies the show theft chance and the car break-in chance by this.
    static let lockedCaseFactor = 0.4
    /// The dehumidifier multiplies the home damage chance by this. The fire safe removes the risk.
    static let dehumidifierFactor = 0.4
    /// Collection insurance: the premium is a share of the insured value every 4 weeks, with a minimum.
    static let policyCycleDays = 28
    static let policyPremiumRate = 0.015
    static let policyMinPremium = 10.0
    /// A claim pays this share of the loss, less the deductible.
    static let policyCoverage = 0.8
    static let policyDeductible = 25.0
}

/// The player's collection insurance policy (docs/24-theft-and-insurance.md).
struct InsuranceState: Codable {
    var active = false
    /// The day the next premium is due.
    var nextPremiumDay = 0
    var premiumsPaid = 0.0
    var payouts = 0.0
}

@MainActor
extension GameStore {
    // MARK: - Insurance

    /// An item in the player's hands: in storage, or listed for sale. Items at a grader, in transit, or in the store do not count.
    private func inHand(_ status: ItemStatus?) -> Bool {
        guard let status else { return true }
        if case .listed = status { return true }
        return false
    }

    /// What a claim counts for a card. The insurer does not pay for a fake.
    private func claimValue(_ card: OwnedCard) -> Double { card.fake == nil ? card.market : 0 }

    private func claimValue(_ item: SealedItem) -> Double { item.fake == nil ? market(of: item) : 0 }

    /// The market value of everything in hand that the policy covers.
    var insuredValue: Double {
        let cards = (data.raw + data.slabs).filter { inHand($0.status) }.reduce(0) { $0 + claimValue($1) }
        let sealed = data.sealed.filter { inHand($0.status) }.reduce(0) { $0 + claimValue($1) }
        return cards + sealed
    }

    var insurancePremium: Double {
        max(Balance.policyMinPremium, (insuredValue * Balance.policyPremiumRate * 100).rounded() / 100)
    }

    var canSignInsurance: Bool { !data.insurance.active && canAfford(insurancePremium) }

    func signInsurance() {
        guard canSignInsurance else { return }
        let premium = insurancePremium
        addLedger(-premium, .insurance, "Insurance premium")
        data.insurance.active = true
        data.insurance.nextPremiumDay = data.day + Balance.policyCycleDays
        data.insurance.premiumsPaid += premium
        log("Signed a collection insurance policy. First premium: \(money(premium)).", cash: -premium)
        save()
    }

    func cancelInsurance() {
        guard data.insurance.active else { return }
        data.insurance.active = false
        log("Cancelled your collection insurance.")
        save()
    }

    /// Pays a claim. Returns the payout, which is 0 with no policy or when the deductible takes it all.
    private func fileClaim(loss: Double, what: String) -> Double {
        guard data.insurance.active else { return 0 }
        let payout = max(0, ((loss * Balance.policyCoverage - Balance.policyDeductible) * 100).rounded() / 100)
        guard payout > 0 else { return 0 }
        addLedger(payout, .insurance, "Insurance payout · \(what)")
        data.insurance.payouts += payout
        return payout
    }

    private func claimText(_ payout: Double) -> String {
        guard data.insurance.active else { return " You have no insurance." }
        return payout > 0 ? " Insurance paid \(money(payout))." : " The deductible took the whole claim."
    }

    private func nameList(_ names: [String]) -> String {
        names.count <= 3 ? names.joined(separator: ", ") : names.prefix(3).joined(separator: ", ") + " and \(names.count - 3) more"
    }

    // MARK: - Theft

    /// Takes the items out of the collection, files the claim, and writes the Activity line. Returns the line.
    private func lose(_ ids: Set<UUID>, event: String) -> String {
        var names: [String] = []
        var value = 0.0
        for card in data.raw + data.slabs where ids.contains(card.id) {
            names.append(card.print.name + (card.grade.map { " " + $0.label } ?? ""))
            value += claimValue(card)
        }
        for item in data.sealed where ids.contains(item.id) {
            names.append(item.name)
            value += claimValue(item)
        }
        data.raw.removeAll { ids.contains($0.id) }
        data.slabs.removeAll { ids.contains($0.id) }
        data.sealed.removeAll { ids.contains($0.id) }
        let payout = fileClaim(loss: value, what: nameList(names))
        let line = "\(event) \(nameList(names)) (\(money(value))).\(claimText(payout))"
        log(line, cash: payout > 0 ? payout : nil)
        save()
        return line
    }

    /// One roll at the end of a booked show day: a card or a slab walks off the table. `table` is what is still on it.
    /// `awayShare` is the share of the day that the player spent away from the table (0 to 1).
    func rollShowTheft(table: [ShowItem], awayShare: Double) -> String? {
        let owned = Set((data.raw + data.slabs).map(\.id))
        let cards = table.filter { $0.kind == .card && owned.contains($0.id) }
        guard !cards.isEmpty else { return nil }
        let value = cards.reduce(0) { $0 + $1.market }
        var chance = Balance.showTheftChance * (Balance.showTheftAwayBase + Balance.showTheftAwayScale * min(1, awayShare))
        chance *= 1 + min(1, value / Balance.showTheftValueScale) + (cards.contains { $0.graded } ? Balance.showTheftSlabBonus : 0)
        if hasUpgrade(.lockedCase) { chance *= Balance.lockedCaseFactor }
        guard Double.random(in: 0..<1) < min(chance, Balance.showTheftMaxChance) else { return nil }
        let weights = cards.map { max($0.market, 0.5) * ($0.graded ? Balance.slabTheftWeight : 1) }
        var roll = Double.random(in: 0..<weights.reduce(0, +))
        var taken = cards[cards.count - 1]
        for (card, weight) in zip(cards, weights) {
            if roll < weight {
                taken = card
                break
            }
            roll -= weight
        }
        return lose([taken.id], event: "Someone took this from your table:")
    }

    /// One roll when the player travels with stock in hand: a thief takes a bag from the car.
    func rollCarBreakIn(trip: String) {
        let stock = showStock
        let ids = stock.cards.map(\.id) + stock.sealed.map(\.id)
        guard !ids.isEmpty else { return }
        let chance = Balance.carBreakInChance * (hasUpgrade(.lockedCase) ? Balance.lockedCaseFactor : 1)
        guard Double.random(in: 0..<1) < chance else { return }
        let bag = Set(ids.shuffled().prefix(Int.random(in: 1...Balance.bagMaxItems)))
        _ = lose(bag, event: "A thief broke into your car on the way to \(trip) and took your bag:")
    }

    // MARK: - End Day

    /// Home damage, then the premium. The premium comes after rent, so it never causes a missed rent.
    func lossesEndDay() -> [String] {
        var lines: [String] = []
        if let line = homeDamage() { lines.append(line) }
        if let line = premiumDue() { lines.append(line) }
        return lines
    }

    /// Water or humidity hits a few raw cards in storage. They lose condition, and with it value.
    private func homeDamage() -> String? {
        guard !hasUpgrade(.fireSafe) else { return nil }
        let chance = Balance.homeDamageChance * (hasUpgrade(.dehumidifier) ? Balance.dehumidifierFactor : 1)
        guard Double.random(in: 0..<1) < chance else { return nil }
        let pool = data.raw.indices.filter {
            let card = data.raw[$0]
            return card.status == nil && card.fake == nil && card.rawMarket >= 1 && card.condition.wear != .moderatelyPlayed
        }
        let hit = pool.shuffled().prefix(Int.random(in: 1...Balance.homeDamageMaxCards))
        guard !hit.isEmpty else { return nil }
        var names: [String] = []
        var lost = 0.0
        for i in hit {
            let before = data.raw[i].condition.wear.valueFactor
            for _ in 0..<2 {
                let drop = (Double.random(in: Balance.homeDamageDrop) * 2).rounded() / 2
                if Bool.random() {
                    data.raw[i].condition.edges = max(Balance.homeDamageFloor, data.raw[i].condition.edges - drop)
                } else {
                    data.raw[i].condition.surface = max(Balance.homeDamageFloor, data.raw[i].condition.surface - drop)
                }
            }
            lost += data.raw[i].rawMarket * (before - data.raw[i].condition.wear.valueFactor)
            names.append(data.raw[i].print.name)
        }
        let payout = fileClaim(loss: lost, what: nameList(names))
        return "Water got into your storage and damaged \(nameList(names)). The cards lost \(money(lost)) of value.\(claimText(payout))"
    }

    /// Charges the premium when it is due. A player who cannot pay loses the policy.
    private func premiumDue() -> String? {
        guard data.insurance.active, data.day >= data.insurance.nextPremiumDay else { return nil }
        let premium = insurancePremium
        guard canAfford(premium) else {
            data.insurance.active = false
            return "You could not pay the insurance premium of \(money(premium)). The policy ended."
        }
        addLedger(-premium, .insurance, "Insurance premium")
        data.insurance.premiumsPaid += premium
        data.insurance.nextPremiumDay = data.day + Balance.policyCycleDays
        return "Insurance premium paid: \(money(premium))."
    }
}
