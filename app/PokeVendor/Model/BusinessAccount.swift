import Foundation

// The business account (docs/22-own-store.md, The business account). The store has its own bank account, apart from the
// player's own cash. The store's sales, the counter, rent, wages, overhead, marketing, fixtures, staff, events, the
// buylist, and the hobby distributor use it. Everything else uses the player's own account. A bill that the business
// account cannot pay fails: the business has no claim on the player's own cash. The player moves money between the
// two accounts. The account opens with the lease and closes with the store. Before the lease, nothing changes.

enum MoneyAccount: String, Codable {
    case personal, business
}

extension Balance {
    /// The money the player can put in the business account at the lease, on top of the cost to sign.
    static let accountSeeds: [Double] = [0, 1000, 2500, 5000]
    /// The quick amounts on the transfer buttons.
    static let accountTransferSteps: [Double] = [100, 500, 1000, 5000]
    /// A store from an older save gets its account with this many days of wages, on top of the next rent and overhead.
    static let accountLegacyWageDays = 14
}

@MainActor
extension GameStore {
    var hasBusinessAccount: Bool { data.businessCash != nil && data.cardStore != nil }
    var businessCash: Double { data.businessCash ?? 0 }
    var personalCash: Double { data.cash }

    func balance(_ account: MoneyAccount) -> Double {
        account == .business && hasBusinessAccount ? businessCash : data.cash
    }

    /// The account that money uses now: a call that sets it (`asBusiness`), then the counter session, then the
    /// player's own account. With no business account, it is always the player's own account.
    var activeAccount: MoneyAccount { resolve(nil) }

    func resolve(_ account: MoneyAccount?) -> MoneyAccount {
        guard hasBusinessAccount else { return .personal }
        return account ?? accountOverride ?? (counterSession != nil ? .business : .personal)
    }

    /// Runs `body` with the business account as the active account.
    func asBusiness<T>(_ body: () -> T) -> T {
        let before = accountOverride
        accountOverride = .business
        defer { accountOverride = before }
        return body()
    }

    /// The account that buying on the Buy screen pays from: the player's choice there. Without a business account, it is
    /// always the player's own. The distributor always uses the business account (Model/Wholesale.swift).
    var buyAccount: MoneyAccount { hasBusinessAccount ? (data.settings.buyAccount ?? .personal) : .personal }

    func setBuyAccount(_ account: MoneyAccount) {
        data.settings.buyAccount = account
        save()
    }

    /// The account the graders charge, the player's card on file (Finances, Bills). Without a business account, the
    /// player's own.
    var gradingAccount: MoneyAccount { hasBusinessAccount ? (data.settings.gradingAccount ?? .personal) : .personal }

    func setGradingAccount(_ account: MoneyAccount) {
        data.settings.gradingAccount = account
        save()
    }

    /// The buy account's balance and label, for the Buy screens. A screen checks a buy with `canAffordBuy`, because
    /// `canAfford` reads the active account, which is the player's own outside a buy.
    var buyCash: Double { balance(buyAccount) }
    var buyCashLabel: String { "\(buyAccount == .business ? "Business" : "Cash") \(money(buyCash))" }
    func canAffordBuy(_ amount: Double) -> Bool { buyCash >= amount - 0.001 }

    /// The account that pays the distributor: the business account when the player has one (Model/Wholesale.swift).
    var distributorAccount: MoneyAccount { hasBusinessAccount ? .business : .personal }

    /// Makes `account` the active account until the returned function runs.
    func paying(from account: MoneyAccount) -> () -> Void {
        let before = accountOverride
        accountOverride = account
        return { self.accountOverride = before }
    }

    /// Makes the buy account the active account until the returned function runs, so `canAfford`, `cash`, and
    /// `addLedger` use it. Each buy on the Buy screen starts with `let restore = payAsBuyer(); defer { restore() }`.
    func payAsBuyer() -> () -> Void {
        let before = accountOverride
        accountOverride = buyAccount
        return { self.accountOverride = before }
    }

    /// A ledger entry on the business account. Store code uses it for every store cost and sale.
    @discardableResult
    func bizLedger(_ amount: Double, _ category: LedgerEntry.Category, _ label: String, pending: Bool = false) -> UUID {
        addLedger(amount, category, label, pending: pending, account: .business)
    }

    /// The business account can pay this amount.
    func bizAfford(_ amount: Double) -> Bool { balance(.business) >= amount - 0.001 }

    // MARK: - Transfers

    /// Moves money from the player's own account into the business account.
    func moveToBusiness(_ amount: Double) {
        let amount = floorCents(min(amount, data.cash))
        guard hasBusinessAccount, amount >= 0.01, let s = data.cardStore else { return }
        addLedger(-amount, .transfer, "Into the business account · \(s.name)", account: .personal)
        addLedger(amount, .transfer, "From your own account", account: .business)
        log("Moved \(money(amount)) into the business account of \(s.name).")
        save()
    }

    /// Pays the player from the business account (an owner's draw).
    func payYourself(_ amount: Double) {
        let amount = floorCents(min(amount, businessCash))
        guard hasBusinessAccount, amount >= 0.01, let s = data.cardStore else { return }
        addLedger(-amount, .transfer, "Owner's draw", account: .business)
        addLedger(amount, .transfer, "Owner's draw · \(s.name)", account: .personal)
        log("Paid yourself \(money(amount)) from the business account of \(s.name).")
        save()
    }

    /// Money in and out of the business account over the last `days` days, transfers apart.
    func businessFlow(days: Int) -> (moneyIn: Double, moneyOut: Double, putIn: Double, drawn: Double) {
        let today = data.day
        var result = (moneyIn: 0.0, moneyOut: 0.0, putIn: 0.0, drawn: 0.0)
        for e in data.ledger where e.account == .business && today - e.day < days {
            if e.category == .transfer {
                if e.amount > 0 { result.putIn += e.amount } else { result.drawn -= e.amount }
            } else if e.amount > 0 {
                result.moneyIn += e.amount
            } else {
                result.moneyOut -= e.amount
            }
        }
        return result
    }

    /// The bills that the business account pays in the next `days` days: rent with overhead, distributor bills, and the
    /// staff's wages.
    func businessBillsDue(within days: Int) -> Double {
        guard let s = data.cardStore else { return 0 }
        var total = 0.0
        if let left = daysUntilStoreRent, left <= days { total += s.rent + storeOverhead(s).total }
        total += payables.filter { $0.dueDay - data.day <= days }.reduce(0) { $0 + $1.amount }
        // The staff are paid each open day, at today's schedule and hours.
        total += staffDailyWage * Double(days) * Double(s.openDays.count) / 7
        return total
    }

    // MARK: - Open and close

    /// Opens the account at the lease. The player pays the cost to sign and the seed money into it from their own
    /// account. The investor's money goes in too. The business then pays the first rent, the deposit, and the build-out.
    func openBusinessAccount(storeName: String, contribution: Double) {
        data.businessCash = 0
        addLedger(-contribution, .transfer, "Into the business account · \(storeName)", account: .personal)
        addLedger(contribution, .transfer, "From your own account", account: .business)
    }

    /// A store from before the business account: the account opens with the next rent, the overhead, and two weeks of
    /// wages from the player's own cash, or all of it when that is less.
    func openLegacyBusinessAccount() {
        guard let s = data.cardStore, data.businessCash == nil else { return }
        data.businessCash = 0
        let need = s.rent + storeOverhead(s).total + Double(Balance.accountLegacyWageDays) * staffDailyWage
        let amount = floorCents(max(0, min(need, data.cash)))
        if amount >= 0.01 {
            addLedger(-amount, .transfer, "Into the business account · \(s.name)", account: .personal)
            addLedger(amount, .transfer, "From your own account", account: .business)
        }
        log("\(s.name) has its own business account now. Store sales go into it, and store bills come out of it. You moved \(money(amount)) into it to start. A bill that it cannot pay fails, so keep money in it.")
    }

    /// Closes the account with the store. What is left goes to the player's own account. Returns a line, or nil.
    func closeBusinessAccount(storeName: String) -> String? {
        guard let left = data.businessCash else { return nil }
        var line: String?
        if left >= 0.01 {
            addLedger(-left, .transfer, "Account closed", account: .business)
            addLedger(left, .transfer, "Business account closed · \(storeName)", account: .personal)
            line = "The business account of \(storeName) closed. The \(money(left)) in it went to your own account."
        }
        data.businessCash = nil
        return line
    }

    private func floorCents(_ x: Double) -> Double { (x * 100).rounded(.down) / 100 }
}
