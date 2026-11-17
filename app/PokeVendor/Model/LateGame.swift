import Foundation

// Costs that grow with the business, and large things to buy (docs/16-time-and-day.md, Costs that grow).

extension Balance {
    /// Home rent rises by this share at the end of each year.
    static let rentYearlyRise = 0.05
    /// The item count that needs a storage unit, and the cost every 4 weeks.
    static let storageTiers: [(items: Int, cost: Double)] = [(300, 150), (800, 400), (2_000, 900)]
    /// A bookkeeper takes this share of the sales of the last 4 weeks, above the free amount.
    static let bookkeeperFreeSales = 25_000.0
    static let bookkeeperShare = 0.015
    static let unpaidBusinessReputation = 2
    static let ownHomeUpkeep = 600.0
}

@MainActor
extension GameStore {
    /// Rent today. It rises on each January 1, and it stops when the player owns a home.
    var rentNow: Double {
        guard !hasUpgrade(.ownHome) else { return 0 }
        return (Balance.rent * pow(1 + Balance.rentYearlyRise, Double(GameCalendar.yearsSinceStart(data.day)))).rounded()
    }

    var storedItems: Int {
        data.raw.count + data.slabs.count + data.sealed.count + data.bulk.reduce(0) { $0 + $1.cards.count } / 10
    }

    var storageCost: Double {
        guard !hasUpgrade(.warehouse) else { return 0 }
        return Balance.storageTiers.last { storedItems >= $0.items }?.cost ?? 0
    }

    /// The costs of a big business, on the 1st of each month with the rent. Returns the lines for the report.
    func businessCostsEndDay() -> [String] {
        guard GameCalendar.isFirstOfMonth(data.day) else { return [] }
        var lines: [String] = []
        func charge(_ amount: Double, _ label: String) {
            guard amount >= 0.01 else { return }
            if coverWithLine(amount, for: label) {
                addLedger(-amount, .businessCosts, label)
                lines.append("\(label): \(money(amount)).")
            } else {
                addReputation(-Balance.unpaidBusinessReputation)
                lines.append("You could not pay \(money(amount)) for \(label.lowercased()). Word gets around. Reputation −\(Balance.unpaidBusinessReputation).")
            }
        }
        charge(storageCost, "Storage unit")
        let today = data.day
        let month = 1...GameCalendar.daysInPreviousMonth(today)
        let sales = data.ledger.filter { month.contains(today - $0.day) && $0.category == .sale }.reduce(0) { $0 + $1.amount }
        charge((max(0, sales - Balance.bookkeeperFreeSales) * Balance.bookkeeperShare * 100).rounded() / 100, "Bookkeeper")
        if hasUpgrade(.ownHome) { charge(Balance.ownHomeUpkeep, "Home upkeep") }
        return lines
    }
}
