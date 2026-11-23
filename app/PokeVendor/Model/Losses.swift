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
    /// The store stock rider costs this share of the sealed value in the store every 28 days, on top of the premium,
    /// with the same minimum.
    static let storeRiderRate = 0.03
    /// Own store break-in at night: the base chance, the stored sealed value that doubles it, and the cap.
    static let storeBreakInBase = 0.0005
    static let storeBreakInValueScale = 25_000.0
    static let storeBreakInMax = 0.006
    /// Security cameras multiply the chance by this.
    static let storeBreakInCameraFactor = 0.4
    /// The thieves take at most this many sealed items, cases included. The door repair costs this much.
    static let storeBreakInMaxItems = 6
    static let storeBreakInRepair = 400.0
}

/// The player's collection insurance policy (docs/24-theft-and-insurance.md).
struct InsuranceState: Codable {
    var active = false
    /// The day the next premium is due.
    var nextPremiumDay = 0
    var premiumsPaid = 0.0
    var payouts = 0.0
    /// The rider that covers the sealed stock in the player's own store (integration 4.2).
    var storeRider = false
    /// The highest sealed value in the store since the last premium. The rider costs a share of it, so taking the stock
    /// out before the premium day does not cut the cost.
    var riderPeakValue = 0.0
}

/// A save from an older build has no `storeRider`. It takes the default.
extension InsuranceState {
    init(from decoder: Decoder) throws {
        self.init()
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func v<T: Decodable>(_ key: CodingKeys, _ fallback: T) -> T {
            (try? c.decodeIfPresent(T.self, forKey: key)) ?? fallback
        }
        active = v(.active, active)
        nextPremiumDay = v(.nextPremiumDay, nextPremiumDay)
        premiumsPaid = v(.premiumsPaid, premiumsPaid)
        payouts = v(.payouts, payouts)
        storeRider = v(.storeRider, storeRider)
        riderPeakValue = v(.riderPeakValue, riderPeakValue)
    }
}

@MainActor
extension GameStore {
    // MARK: - Insurance

    /// An item in the player's hands: in storage, or listed for sale. Items at a grader, in transit, or in the store do not count.
    private func inHand(_ status: ItemStatus?) -> Bool {
        guard let status else { return true }
        switch status {
        // The policy covers the storage unit too.
        case .listed, .openedAtShop, .inStorage: return true
        default: return false
        }
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

    /// The sealed value in the player's own store that the rider covers. The back room counts. A known fake counts as nothing.
    var storeStockValue: Double {
        data.sealed.filter { Self.isInStore($0.status) }.reduce(0) { $0 + claimValue($1) }
    }

    /// What the store stock rider costs for one 28-day cycle, at the highest stock value of the cycle.
    var storeRiderCost: Double {
        max(Balance.policyMinPremium, (max(storeStockValue, data.insurance.riderPeakValue) * Balance.storeRiderRate * 100).rounded() / 100)
    }

    /// The rider is on and it counts in the premium. It needs a built store.
    private var riderCounts: Bool { data.insurance.storeRider && storeIsBuilt }

    var insurancePremium: Double {
        max(Balance.policyMinPremium, (insuredValue * Balance.policyPremiumRate * 100).rounded() / 100)
            + (riderCounts ? storeRiderCost : 0)
    }

    /// The cost of the rider if the player turns it on now: the share of this cycle that is left.
    var storeRiderStartCost: Double {
        let left = max(1, min(Balance.policyCycleDays, data.insurance.nextPremiumDay - data.day))
        return (storeRiderCost * Double(left) / Double(Balance.policyCycleDays) * 100).rounded() / 100
    }

    var canToggleStoreRider: Bool {
        guard data.insurance.active, storeIsBuilt else { return false }
        return data.insurance.storeRider || canAfford(storeRiderStartCost)
    }

    /// Turns the rider on or off. Turning it on pays the rest of this cycle at once, so a player cannot buy cover only
    /// for the days between two premiums. Turning it off refunds nothing.
    func setStoreRider(_ on: Bool) {
        guard on != data.insurance.storeRider, on ? canToggleStoreRider : data.insurance.active else { return }
        if on {
            let cost = storeRiderStartCost
            addLedger(-cost, .insurance, "Store stock rider")
            data.insurance.premiumsPaid += cost
            log("Added the store stock rider to your policy. It cost \(money(cost)) for the rest of this cycle.", cash: -cost)
        } else {
            log("Dropped the store stock rider.")
        }
        data.insurance.storeRider = on
        data.insurance.riderPeakValue = on ? storeStockValue : 0
        save()
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
        data.insurance.storeRider = false
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

    /// Pays a claim for sealed stock or cards lost from the player's own store. It needs the rider.
    func fileStoreClaim(loss: Double, what: String) -> Double {
        guard data.insurance.storeRider, storeIsBuilt else { return 0 }
        return fileClaim(loss: loss, what: what)
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

    /// Takes items for a theft at the storage unit or at home (Model/Storage.swift).
    func loseItems(_ ids: Set<UUID>, event: String) -> String { lose(ids, event: event) }

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
        // The PC stays home unless the player packs it for a show. A sealed case does not fit in the thief's bag.
        let stock = showStock
        let ids = stock.cards.filter { !$0.pc }.map(\.id) + stock.sealed.filter { !$0.pc && !$0.isCase }.map(\.id)
        guard !ids.isEmpty else { return }
        let chance = Balance.carBreakInChance * (hasUpgrade(.lockedCase) ? Balance.lockedCaseFactor : 1)
        guard Double.random(in: 0..<1) < chance else { return }
        let bag = Set(ids.shuffled().prefix(Int.random(in: 1...Balance.bagMaxItems)))
        _ = lose(bag, event: "A thief broke into your car on the way to \(trip) and took your bag:")
    }

    // MARK: - Store break-in

    #if DEBUG
    /// Test tool: replaces the chance of the night break-in.
    static var forceBreakIn: Double?
    #endif

    /// End Day: a night break-in at the own store. The chance grows with the sealed value inside. The thieves take the
    /// most valuable items, cases included. The player pays the door repair, and a consigner owed for a stolen card.
    func storeBreakInEndDay() -> [String] {
        guard let s = data.cardStore, storeIsBuilt else { return [] }
        let inStore = data.sealed.filter { Self.isInStore($0.status) }
        guard !inStore.isEmpty else { return [] }
        let value = inStore.reduce(0) { $0 + realMarket(of: $1) }
        var chance = min(Balance.storeBreakInMax, Balance.storeBreakInBase * (1 + value / Balance.storeBreakInValueScale))
        if s.has(.cameras) { chance *= Balance.storeBreakInCameraFactor }
        #if DEBUG
        if let forced = Self.forceBreakIn { chance = forced }
        #endif
        guard Double.random(in: 0..<1) < chance else { return [] }
        // Read into locals first: the removal and the payments below write `data`.
        let taken = inStore.sorted { realMarket(of: $0) > realMarket(of: $1) }
            .prefix(Int.random(in: 2...Balance.storeBreakInMaxItems))
        let ids = Set(taken.map(\.id))
        let lost = taken.reduce(0) { $0 + realMarket(of: $1) }
        let claimable = taken.reduce(0) { $0 + claimValue($1) }
        let names = taken.map(\.name)
        let storeName = s.name
        data.sealed.removeAll { ids.contains($0.id) }
        let owed = payConsignedTheft(ids)
        addLedger(-Balance.storeBreakInRepair, .businessCosts, "Store door repair")
        let paid = fileStoreClaim(loss: claimable, what: nameList(names))
        var line = "Someone broke into \(storeName) last night and took \(taken.count) sealed item\(taken.count == 1 ? "" : "s") (\(money(lost))). "
            + "The door repair cost \(money(Balance.storeBreakInRepair))."
        if owed > 0 { line += " You paid \(money(owed)) to a consigner." }
        if data.insurance.storeRider {
            line += paid > 0 ? " The store rider paid \(money(paid))." : " The deductible took the whole claim."
        } else {
            line += " You have no store stock rider."
        }
        return [line]
    }

    // MARK: - End Day

    /// Home damage, then the premium. The premium comes after rent, so it never causes a missed rent.
    func lossesEndDay() -> [String] {
        var lines: [String] = []
        // The rider charges the highest stock value of the cycle.
        if riderCounts { data.insurance.riderPeakValue = max(data.insurance.riderPeakValue, storeStockValue) }
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
            data.insurance.storeRider = false
            return "You could not pay the insurance premium of \(money(premium)). The policy ended."
        }
        addLedger(-premium, .insurance, "Insurance premium")
        data.insurance.premiumsPaid += premium
        data.insurance.nextPremiumDay = data.day + Balance.policyCycleDays
        data.insurance.riderPeakValue = storeStockValue
        return "Insurance premium paid: \(money(premium))."
    }
}
