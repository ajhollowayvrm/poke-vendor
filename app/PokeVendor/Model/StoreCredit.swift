import Foundation

// Store credit that expires, and the outstanding credit (docs/22-own-store.md).

@MainActor
extension GameStore {
    /// The oldest credit, and the day it expires. Nil when no credit is tracked.
    var nextCreditExpiry: (amount: Double, day: Int)? {
        guard let lot = data.cardStore?.growth.creditLots.first else { return nil }
        return (lot.amount, lot.day + Balance.creditExpiryDays)
    }

    /// The credit that expires in the next `days` days.
    func creditExpiring(within days: Int) -> Double {
        (data.cardStore?.growth.creditLots ?? []).filter { $0.day + Balance.creditExpiryDays - data.day <= days }.reduce(0) { $0 + $1.amount }
    }

    var creditExpiredTotal: Double { data.cardStore?.growth.creditExpired ?? 0 }

    /// End Day: credit that is too old expires. The store does not owe it any more. Credit from an old save gets today as its day.
    func expireStoreCredit() -> [String] {
        guard var s = data.cardStore else { return [] }
        let today = data.day
        var g = s.growth
        var source = s.source
        let tracked = g.creditLots.reduce(0) { $0 + $1.amount }
        if source.creditOwed - tracked > 0.005 {
            g.creditLots.append(CreditLot(day: today, amount: ShowSession.round(source.creditOwed - tracked)))
        }
        let expiry = Balance.creditExpiryDays
        let lapsed = g.creditLots.filter { today - $0.day >= expiry }
        var lines: [String] = []
        if !lapsed.isEmpty {
            let total = lapsed.reduce(0) { $0 + $1.amount }
            g.creditLots.removeAll { today - $0.day >= expiry }
            g.creditExpired += total
            source.creditOwed = max(0, source.creditOwed - total)
            lines.append("\(money(total)) of store credit expired at \(s.name). The store does not owe it any more.")
        }
        let warn = g.creditLots.filter { $0.day + expiry - today == Balance.creditWarnDays }.reduce(0) { $0 + $1.amount }
        if warn > 0 {
            lines.append("\(money(warn)) of store credit at \(s.name) expires in \(Balance.creditWarnDays) days.")
        }
        s.growth = g
        s.source = source
        data.cardStore = s
        return lines
    }

    /// After the clock moves: unsold consigned cards go home, and old credit expires.
    func storeGrowthDay() -> [String] {
        guard data.cardStore != nil else { return [] }
        return returnOldConsigned() + expireStoreCredit()
    }
}
