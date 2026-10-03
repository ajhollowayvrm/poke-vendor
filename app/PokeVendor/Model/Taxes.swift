import Foundation

// Sales tax, the estimated income tax, the seller's permit, and the 1099-K note (docs/26-taxes.md).

/// What the player owes the tax office. A save from an older build has none of it, so every field has a default.
struct TaxState: Codable, Hashable {
    /// The player has a seller's permit.
    var permit = false
    /// Sales tax that the player collected and has not paid yet. It is not the player's money.
    var salesTaxOwed = 0.0
    /// Income tax from a quarter that the player has not paid yet, with its penalties.
    var incomeTaxOwed = 0.0
    /// The loss of earlier quarters. It lowers the profit of the next quarter.
    var lossCarry = 0.0
    /// The year of `platformSales`, and the gross sales on TCGplayer, eBay, and Whatnot in that year.
    var platformYear = 0
    var platformSales = 0.0
    /// The 1099-K note is in the Activity log for this year.
    var platformNoted = false
}

/// A reminder that a tax payment is close.
struct TaxWarning: Hashable {
    let text: String
    /// The player has enough cash to pay it.
    let affordable: Bool
}

extension Balance {
    /// Sales tax on a sale at the player's store or show table.
    static let salesTaxRate = 0.07
    /// The player pays the sales tax every 4 weeks, on the day when `day % 28` is this number.
    static let salesTaxCycleDays = 28
    static let salesTaxDueOffset = 14
    /// The player pays estimated income tax every 13 weeks, on the day when `day % 91` is zero.
    static let incomeTaxCycleDays = 91
    /// The share of the quarter's net profit.
    static let incomeTaxRate = 0.20
    static let taxWarningDays = 3
    /// A missed payment adds this share of the amount owed.
    static let taxPenaltyRate = 0.10
    static let sellerPermitFee = 50.0
    /// A year of 52 weeks. TCGplayer, eBay, and Whatnot report gross sales above this amount in one year.
    static let platformReportYearDays = 364
    static let platformReportThreshold = 2000.0
    /// The ledger entries that count for income tax: sales and other income, less the cost of the business.
    static let taxableCategories: Set<LedgerEntry.Category> = [
        .sale, .tips, .sponsorship, .refund, .sealed, .singles, .grading, .showFees, .authentication, .wholesale,
        .storeRent, .storeOverhead, .wages, .storeEvents, .businessInterest,
    ]
}

extension Listing.Channel {
    /// The platform collects and pays the sales tax, and it reports the sales to the tax office.
    var reportsSales: Bool { self == .tcgplayer || self == .ebay || self == .ebayAuction || self == .whatnot }
}

@MainActor
extension GameStore {
    private func cents(_ value: Double) -> Double { (value * 100).rounded() / 100 }

    // MARK: - The seller's permit

    /// A store from an old save has a permit already.
    var hasSellerPermit: Bool { data.taxes.permit || data.cardStore != nil }

    func getSellerPermit() {
        guard !hasSellerPermit, canAfford(Balance.sellerPermitFee) else { return }
        addLedger(-Balance.sellerPermitFee, .tax, "Seller's permit")
        data.taxes.permit = true
        log("Got a seller's permit. A landlord wants one before a lease.", cash: -Balance.sellerPermitFee)
        save()
    }

    // MARK: - Sales tax

    var daysUntilSalesTax: Int {
        let cycle = Balance.salesTaxCycleDays
        return (Balance.salesTaxDueOffset - data.day % cycle + cycle - 1) % cycle + 1
    }

    /// The buyer pays the tax on top of the price. The player keeps it for the tax office. All the tax of one day at
    /// one place goes in one ledger entry.
    func collectSalesTax(on price: Double, at venue: String) {
        let tax = cents(price * Balance.salesTaxRate)
        guard tax > 0 else { return }
        let label = "Sales tax collected · \(venue)"
        let today = data.day
        var found: Int?
        for i in data.ledger.indices.reversed() {
            let entry = data.ledger[i]
            if entry.day != today { break }
            if entry.category == .tax, entry.label == label {
                found = i
                break
            }
        }
        if let found {
            data.ledger[found].amount += tax
            data.cash += tax
        } else {
            addLedger(tax, .tax, label)
        }
        data.taxes.salesTaxOwed += tax
    }

    /// Pays the sales tax. Returns a line for the report, or nil when nothing is owed. When the player cannot pay,
    /// the penalty goes on the amount and the player pays it later.
    private func remitSalesTax() -> String? {
        let owed = data.taxes.salesTaxOwed
        guard owed >= 0.01 else { return nil }
        if canAfford(owed) {
            addLedger(-owed, .tax, "Sales tax paid")
            data.taxes.salesTaxOwed = 0
            return "Sales tax paid: \(money(owed))."
        }
        let penalty = cents(owed * Balance.taxPenaltyRate)
        data.taxes.salesTaxOwed = owed + penalty
        return "You could not pay the sales tax of \(money(owed)). A penalty of \(money(penalty)) is added. Pay it in the Wallet."
    }

    // MARK: - Income tax

    var daysUntilIncomeTax: Int { Balance.incomeTaxCycleDays - data.day % Balance.incomeTaxCycleDays }

    /// The net profit of the days from `start` up to, but not including, `end`.
    func taxableProfit(from start: Int, to end: Int) -> Double {
        var profit = 0.0
        for entry in data.ledger where entry.day >= start && entry.day < end && Balance.taxableCategories.contains(entry.category) {
            profit += entry.amount
        }
        return profit
    }

    /// The tax on a profit, after the loss of earlier quarters. Also the loss that goes to the next quarter.
    private func incomeTax(profit: Double) -> (tax: Double, carry: Double) {
        let taxable = profit - data.taxes.lossCarry
        return taxable > 0 ? (cents(taxable * Balance.incomeTaxRate), 0) : (0, -taxable)
    }

    /// The tax for the quarter that is running now, if it ended today.
    var incomeTaxEstimate: Double {
        let start = data.day / Balance.incomeTaxCycleDays * Balance.incomeTaxCycleDays
        return incomeTax(profit: taxableProfit(from: start, to: data.day + 1)).tax
    }

    /// Adds the tax of the quarter that just ended to what the player owes, then pays it. A missed payment adds a
    /// penalty, and the player owes the amount until they pay it.
    private func settleIncomeTax() -> [String] {
        let end = data.day
        let result = incomeTax(profit: taxableProfit(from: end - Balance.incomeTaxCycleDays, to: end))
        data.taxes.lossCarry = result.carry
        data.taxes.incomeTaxOwed += result.tax
        let owed = data.taxes.incomeTaxOwed
        guard owed >= 0.01 else { return ["No income tax was due for this quarter."] }
        if canAfford(owed) {
            addLedger(-owed, .tax, "Estimated income tax")
            data.taxes.incomeTaxOwed = 0
            return ["Estimated income tax paid: \(money(owed))."]
        }
        let penalty = cents(owed * Balance.taxPenaltyRate)
        data.taxes.incomeTaxOwed = owed + penalty
        return ["You could not pay the income tax of \(money(owed)). A penalty of \(money(penalty)) is added. Pay it in the Wallet."]
    }

    /// The player pays what they owe now: the sales tax, or the income tax that came due and is unpaid.
    func payTaxes(income: Bool) {
        let owed = income ? data.taxes.incomeTaxOwed : data.taxes.salesTaxOwed
        guard owed >= 0.01, canAfford(owed) else { return }
        addLedger(-owed, .tax, income ? "Income tax paid" : "Sales tax paid")
        if income { data.taxes.incomeTaxOwed = 0 } else { data.taxes.salesTaxOwed = 0 }
        log("Paid \(money(owed)) of \(income ? "income" : "sales") tax.", cash: -owed)
        save()
    }

    // MARK: - Warnings and the day

    /// The payments that come due in the next few days.
    var taxWarnings: [TaxWarning] {
        var out: [TaxWarning] = []
        let sales = data.taxes.salesTaxOwed
        if sales >= 0.01, daysUntilSalesTax <= Balance.taxWarningDays {
            out.append(TaxWarning(text: "Sales tax of \(money(sales)) is due in \(daysUntilSalesTax) day\(daysUntilSalesTax == 1 ? "" : "s"). You have \(money(cash)).",
                                  affordable: canAfford(sales)))
        }
        let income = data.taxes.incomeTaxOwed + incomeTaxEstimate
        if income >= 0.01, daysUntilIncomeTax <= Balance.taxWarningDays {
            out.append(TaxWarning(text: "Estimated income tax of about \(money(income)) is due in \(daysUntilIncomeTax) day\(daysUntilIncomeTax == 1 ? "" : "s"). You have \(money(cash)).",
                                  affordable: canAfford(income)))
        }
        return out
    }

    /// Tax payments and warnings, after the clock moves. A missed payment adds a penalty. The run goes on.
    func taxesEndDay() -> [String] {
        var lines: [String] = []
        if data.day % Balance.salesTaxCycleDays == Balance.salesTaxDueOffset {
            if let line = remitSalesTax() { lines.append(line) }
        } else if daysUntilSalesTax == Balance.taxWarningDays, data.taxes.salesTaxOwed >= 0.01 {
            lines.append("Sales tax of \(money(data.taxes.salesTaxOwed)) is due in \(Balance.taxWarningDays) days.")
        }
        if data.day > 0, data.day % Balance.incomeTaxCycleDays == 0 {
            lines += settleIncomeTax()
        } else if daysUntilIncomeTax == Balance.taxWarningDays {
            let estimate = data.taxes.incomeTaxOwed + incomeTaxEstimate
            if estimate >= 0.01 {
                lines.append("Estimated income tax of about \(money(estimate)) is due in \(Balance.taxWarningDays) days.")
            }
        }
        return lines
    }

    // MARK: - The 1099-K note

    /// An online platform pays the sales tax itself. When its sales for the year pass the limit, the platform
    /// reports them, and the Activity log says so.
    func notePlatformSale(channel: Listing.Channel, price: Double) {
        guard channel.reportsSales else { return }
        var taxes = data.taxes
        let year = data.day / Balance.platformReportYearDays
        if taxes.platformYear != year {
            taxes.platformYear = year
            taxes.platformSales = 0
            taxes.platformNoted = false
        }
        taxes.platformSales += price
        let report = !taxes.platformNoted && taxes.platformSales >= Balance.platformReportThreshold
        if report { taxes.platformNoted = true }
        data.taxes = taxes
        if report {
            log("Your online sales passed \(money(Balance.platformReportThreshold)) this year. TCGplayer, eBay, and Whatnot send a 1099-K to the tax office. Your income tax counts these sales.")
        }
    }

    // MARK: - The calendar

    func taxEntries(day: Int) -> [CalendarEntry] {
        var out: [CalendarEntry] = []
        let salesDue = day == data.day || day == data.day + daysUntilSalesTax
        if day % Balance.salesTaxCycleDays == Balance.salesTaxDueOffset,
           data.taxes.salesTaxOwed >= 0.01 || data.cardStore != nil || data.vendorKit {
            out.append(CalendarEntry(kind: .rent, title: "Sales tax due",
                                     detail: salesDue ? "\(money(data.taxes.salesTaxOwed)) set aside" : "Every 4 weeks"))
        }
        if day > 0, day % Balance.incomeTaxCycleDays == 0 {
            let incomeDue = day == data.day || day == data.day + daysUntilIncomeTax
            out.append(CalendarEntry(kind: .rent, title: "Estimated income tax due",
                                     detail: incomeDue ? "About \(money(data.taxes.incomeTaxOwed + incomeTaxEstimate))" : "Every 13 weeks"))
        }
        return out
    }
}
