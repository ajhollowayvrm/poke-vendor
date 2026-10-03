import Foundation

// A buylist for sealed product only (docs/22-own-store.md).

@MainActor
extension GameStore {
    func setSealedBuylist(rate: Double, budget: Double) {
        guard var s = data.cardStore else { return }
        var g = s.growth
        g.sealedRate = rate
        g.sealedBudget = budget
        s.growth = g
        data.cardStore = s
        save()
    }

    /// Walk-in sellers with sealed product, in the clerk hours. The store buys when the offer meets the seller's floor
    /// and the budget allows. The clerk does not check for resealed or fake product.
    func rollSealedBuylist(share: Double) -> [String] {
        guard let s = data.cardStore, s.clerk, s.growth.sealedRate > 0 else { return [] }
        let rate = s.growth.sealedRate
        let mean = expectedCustomers(day: data.day) * share * Balance.sealedBuySellerShare * rate / Balance.sealedBuyBaseRate
        let sellers = max(0, Int((mean + Double.random(in: -1...1)).rounded()))
        let products = SetLibrary.catalog.filter { Balance.showSets.contains($0.homeSlug) && $0.market >= Balance.sealedBuyMinMarket }
        var budget = s.growth.sealedBudget
        var bought = 0
        var spent = 0.0
        var overBudget = false
        for _ in 0..<sellers {
            guard let product = products.randomElement() else { break }
            let cash = ShowSession.round(product.market * rate)
            let floor = product.market * Double.random(in: Balance.sealedBuySellerFloor)
            guard cash >= floor else { continue }
            guard cash <= budget, canAfford(cash) else {
                overBudget = true
                continue
            }
            budget -= cash
            let source = "Walk-in sealed seller, \(s.name)"
            var item = SealedItem(setSlug: product.homeSlug, name: product.name, packs: product.packs, paid: cash,
                                  acquired: .now, source: source, productID: product.id, acquiredDay: data.day)
            item.fake = Counterfeit.roll(source: .stranger, sealed: true, slug: product.homeSlug, market: product.market, msrp: product.msrp)
            data.sealed.append(item)
            addLedger(-cash, .sealed, "\(product.name) · \(source)")
            bought += 1
            spent += cash
        }
        var lines: [String] = []
        if bought > 0 {
            lines.append("The clerk bought \(bought) sealed item\(bought == 1 ? "" : "s") at \(Int((rate * 100).rounded()))% of market for \(money(spent)). They are in Inventory.")
        }
        if overBudget { lines.append("The clerk hit the \(money(s.growth.sealedBudget)) sealed budget and turned sellers away.") }
        return lines
    }
}
