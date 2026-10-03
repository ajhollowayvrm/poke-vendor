import Foundation

// A bigger space for the player's store (docs/22-own-store.md).

extension CardStoreState {
    /// The rent for each 28 days is the lease rent times this factor.
    var spaceRentFactor: Double { 1 + Balance.spaceRentStep * Double(growth.space) }
}

@MainActor
extension GameStore {
    var storeSpaceLevel: Int { data.cardStore?.growth.space ?? 0 }

    /// The next step up, or nil at the largest unit.
    var nextSpaceStep: (name: String, cost: Double)? {
        let level = storeSpaceLevel
        guard level < Balance.spaceCosts.count else { return nil }
        return (Balance.spaceNames[level], Balance.spaceCosts[level])
    }

    /// The rent for each 28 days after the next step.
    func rentAfterUpgrade(_ s: CardStoreState) -> Double {
        let base = s.lease?.rent ?? s.location.rent
        return (base * (1 + Balance.spaceRentStep * Double(s.growth.space + 1))).rounded()
    }

    var canUpgradeSpace: Bool {
        guard let step = nextSpaceStep else { return false }
        return storeIsBuilt && canAfford(step.cost)
    }

    /// Moves into a bigger unit. It adds slots at once. The new rent starts at the next rent day.
    func upgradeSpace() {
        guard canUpgradeSpace, let step = nextSpaceStep, var s = data.cardStore else { return }
        addLedger(-step.cost, .storeSetup, "\(step.name) · \(s.name)")
        var g = s.growth
        g.space += 1
        s.growth = g
        data.cardStore = s
        log("Moved \(s.name) into a \(step.name.lowercased()). Room for \(Balance.spaceSlotsPerLevel) more cards and \(Balance.spaceSlotsPerLevel) more sealed items. Rent is now \(money(s.rent)) from the next rent day.",
            cash: -step.cost)
        save()
    }
}
