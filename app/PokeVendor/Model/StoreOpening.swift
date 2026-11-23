import Foundation

// Opening is a project (docs/proposals/store-business.md, part 4). During the build-out, a task list: the business
// license and the fire inspection are required, and a missing one moves the opening day. The player can open softly
// 3 days early at 40% traffic. An investor can pay half of the build-out for a share of the store's profit.

/// The opening tasks of a new store. Nil in `BusinessState` for a store from an older save: it is open.
/// A new field must be optional or have a default, and the decoder must read it with `decodeIfPresent`.
struct OpeningPlan: Codable, Hashable {
    /// The day the license is ready. Nil: not filed.
    var licenseReadyDay: Int?
    /// The day the inspector comes. Nil: not booked.
    var inspectionDay: Int?
    var inspectionPassed = false
    /// The inspection failed, and the fix is not paid yet.
    var inspectionFailed = false
    var posDone = false
    var buzzDone = false
    var softOpen = false
    /// The number of times the opening moved.
    var delays = 0

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        licenseReadyDay = try c.decodeIfPresent(Int.self, forKey: .licenseReadyDay)
        inspectionDay = try c.decodeIfPresent(Int.self, forKey: .inspectionDay)
        inspectionPassed = try c.decodeIfPresent(Bool.self, forKey: .inspectionPassed) ?? false
        inspectionFailed = try c.decodeIfPresent(Bool.self, forKey: .inspectionFailed) ?? false
        posDone = try c.decodeIfPresent(Bool.self, forKey: .posDone) ?? false
        buzzDone = try c.decodeIfPresent(Bool.self, forKey: .buzzDone) ?? false
        softOpen = try c.decodeIfPresent(Bool.self, forKey: .softOpen) ?? false
        delays = try c.decodeIfPresent(Int.self, forKey: .delays) ?? 0
    }
}

extension StoreLocation {
    /// The nearest rival shop, for the business plan.
    var rivalNote: String {
        switch self {
        case .stripMall: "Top Deck Games is 1 mile away."
        case .mainStreet: "Cardboard Castle is 3 blocks away."
        case .mall: "No card shop in the mall. The big-box store sells packs."
        }
    }
}

/// An investor in the store: paid in at the lease, and takes a share of each month's profit until bought out.
struct Investor: Codable, Hashable {
    let invested: Double
    let share: Double
    var paidOut = 0.0
}

extension Balance {
    static let licenseFee = 150.0
    static let licenseDays = 2
    /// The inspector can come from this day of the build-out, and passes this often. A fix costs this much.
    static let inspectionFromDay = 4
    static let inspectionPassChance = 0.75
    static let inspectionFixCost = 300.0
    static let posSetupHours = 1.0
    static let buzzCost = 250.0
    static let buzzAwareness = 15.0
    /// A missing required task moves the opening this many days.
    static let openingDelayDays = 2
    static let softOpenDays = 3
    static let softOpenTraffic = 0.4
    /// The investor pays this share of the build-out and takes this share of each month's profit.
    static let investorBuildoutShare = 0.5
    static let investorProfitShare = 0.15
    /// The buyout is this many times the investment.
    static let investorBuyout = 2.0
}

@MainActor
extension GameStore {
    var openingPlan: OpeningPlan? { business.opening }

    func updateOpening(_ change: (inout OpeningPlan) -> Void) {
        updateBusiness { b in
            var p = b.opening ?? OpeningPlan()
            change(&p)
            b.opening = p
        }
    }

    var licenseReady: Bool { openingPlan.map { p in p.licenseReadyDay.map { data.day >= $0 } ?? false } ?? true }
    var inspectionPassed: Bool { openingPlan?.inspectionPassed ?? true }

    /// A task on the list, for the store screen.
    struct OpeningTask: Identifiable {
        let id: String
        let title: String
        let detail: String
        let done: Bool
        let required: Bool
    }

    var openingTasks: [OpeningTask] {
        guard let p = openingPlan, let s = data.cardStore else { return [] }
        let stock = storeStock.cards.count + storeStock.sealed.count
        let license = p.licenseReadyDay.map { data.day >= $0 ? "Ready." : "Ready on day \($0 + 1)." } ?? "File it for \(money(Balance.licenseFee)). It takes \(Balance.licenseDays) days."
        let inspection: String
        if p.inspectionPassed { inspection = "Passed." } else if p.inspectionFailed {
            inspection = "Failed: the exit sign and an extinguisher. Fix it for \(money(Balance.inspectionFixCost)), and the inspector comes back."
        } else if let d = p.inspectionDay { inspection = "The inspector comes on day \(d + 1)." } else {
            inspection = "Book it from day \(s.leaseDay + Balance.inspectionFromDay + 1), when the build-out is far enough along."
        }
        return [
            OpeningTask(id: "license", title: "Business license", detail: license, done: licenseReady && p.licenseReadyDay != nil, required: true),
            OpeningTask(id: "inspection", title: "Fire inspection", detail: inspection, done: p.inspectionPassed, required: true),
            OpeningTask(id: "pos", title: "POS setup", detail: p.posDone ? "Done." : "Set up the register and the card reader: \(Int(Balance.posSetupHours * 60)) minutes.", done: p.posDone, required: false),
            OpeningTask(id: "stock", title: "First stock", detail: "\(stock) item\(stock == 1 ? "" : "s") on the shelves. Empty shelves hurt the grand opening.", done: stock >= 20, required: false),
            OpeningTask(id: "staff", title: "Staff", detail: s.clerk ? "You have staff." : "Hire staff, or the store opens only while you work the counter.", done: s.clerk, required: false),
            OpeningTask(id: "buzz", title: "Pre-opening buzz", detail: p.buzzDone ? "Done: +\(Int(Balance.buzzAwareness)) awareness." : "Posters and a launch post: \(money(Balance.buzzCost)) for +\(Int(Balance.buzzAwareness)) awareness.", done: p.buzzDone, required: false),
        ]
    }

    /// True while the opening tasks show: from the lease to the grand opening.
    var openingInProgress: Bool { data.cardStore.map { data.day < $0.openDay } ?? false && openingPlan != nil }

    func fileLicense() {
        guard let p = openingPlan, p.licenseReadyDay == nil, canAfford(Balance.licenseFee) else { return }
        addLedger(-Balance.licenseFee, .storeSetup, "Business license")
        let ready = data.day + Balance.licenseDays
        updateOpening { $0.licenseReadyDay = ready }
        log("Filed for the business license. It is ready on day \(ready + 1).", cash: -Balance.licenseFee)
        save()
    }

    var inspectionBlock: String? {
        guard let p = openingPlan, let s = data.cardStore else { return "No store." }
        if p.inspectionPassed { return "Passed." }
        if p.inspectionDay != nil, !p.inspectionFailed { return "Booked." }
        if data.day < s.leaseDay + Balance.inspectionFromDay { return "The build-out is not far enough along." }
        if p.inspectionFailed, !canAfford(Balance.inspectionFixCost) { return "The fix costs \(money(Balance.inspectionFixCost))." }
        return nil
    }

    /// Books the inspector for tomorrow. After a failure, it pays the fix first.
    func bookInspection() {
        guard inspectionBlock == nil, let p = openingPlan else { return }
        if p.inspectionFailed {
            addLedger(-Balance.inspectionFixCost, .storeSetup, "Fire code fix")
            log("Paid \(money(Balance.inspectionFixCost)) to fix the exit sign and the extinguishers.", cash: -Balance.inspectionFixCost)
        }
        let day = data.day + 1
        updateOpening { $0.inspectionDay = day; $0.inspectionFailed = false }
        log("Booked the fire inspection for day \(day + 1).")
        save()
    }

    func setupPOS() {
        guard let p = openingPlan, !p.posDone, spendHours(Balance.posSetupHours) else { return }
        updateOpening { $0.posDone = true }
        log("Set up the register and the card reader.")
        save()
    }

    func preOpeningBuzz() {
        guard let p = openingPlan, !p.buzzDone, canAfford(Balance.buzzCost) else { return }
        addLedger(-Balance.buzzCost, .businessCosts, "Pre-opening buzz")
        updateOpening { $0.buzzDone = true }
        updateBusiness { $0.awareness = min(100, $0.awareness + Balance.buzzAwareness) }
        log("Put up posters and a launch post: +\(Int(Balance.buzzAwareness)) awareness.", cash: -Balance.buzzCost)
        save()
    }

    func setSoftOpen(_ on: Bool) {
        updateOpening { $0.softOpen = on }
        save()
    }

    /// A soft-opening day: the 3 days before the grand opening, when the player chose it and the required tasks are done.
    func isSoftOpenDay(_ day: Int) -> Bool {
        guard let s = data.cardStore, let p = openingPlan, p.softOpen, day < s.openDay, day >= s.openDay - Balance.softOpenDays else { return false }
        return licenseReady && p.inspectionPassed
    }

    /// The store sells today: open, or a soft-opening day.
    func storeSells(on day: Int) -> Bool {
        guard let s = data.cardStore else { return false }
        return day >= s.openDay || isSoftOpenDay(day)
    }

    // MARK: - End Day

    /// The inspection, then the day before the opening: a missing required task moves the opening. Runs before the store day.
    func openingDayEnd() -> [String] {
        guard var s = data.cardStore, let p = openingPlan, data.day < s.openDay else { return [] }
        let today = data.day
        var lines: [String] = []
        if let d = p.inspectionDay, d <= today, !p.inspectionPassed, !p.inspectionFailed {
            if Double.random(in: 0..<1) < Balance.inspectionPassChance || p.delays > 0 {
                updateOpening { $0.inspectionPassed = true }
                lines.append("The fire inspection passed.")
            } else {
                updateOpening { $0.inspectionFailed = true; $0.inspectionDay = nil }
                lines.append("The fire inspection failed: the exit sign and an extinguisher. Fix it and book the inspector again.")
            }
        }
        if today + 1 == s.openDay {
            var missing: [String] = []
            if !licenseReady || openingPlan?.licenseReadyDay == nil { missing.append("the business license") }
            if !(openingPlan?.inspectionPassed ?? true) { missing.append("the fire inspection") }
            if !missing.isEmpty {
                s = data.cardStore ?? s
                let newDay = s.openDay + Balance.openingDelayDays
                s.openDay = newDay
                data.cardStore = s
                updateOpening { $0.delays += 1 }
                lines.append("\(s.name) cannot open tomorrow without \(missing.joined(separator: " and ")). The grand opening moves to day \(newDay + 1).")
            }
        }
        return lines
    }

    // MARK: - The investor

    var investor: Investor? { business.investor }

    /// The money the investor pays in at the lease for a location.
    func investorMoney(_ location: StoreLocation) -> Double { (location.buildout * Balance.investorBuildoutShare).rounded() }

    var investorBuyoutCost: Double { (investor?.invested ?? 0) * Balance.investorBuyout }

    func buyOutInvestor() {
        guard let inv = investor, canAfford(investorBuyoutCost) else { return }
        addLedger(-investorBuyoutCost, .businessCosts, "Investor buyout")
        updateBusiness { $0.investor = nil }
        log("Bought out the investor for \(money(investorBuyoutCost)). They had \(money(inv.paidOut)) in profit shares.", cash: -investorBuyoutCost)
        save()
    }

    /// The investor's share of a month's profit. Called from the month-end review.
    func payInvestor(net: Double) -> String? {
        guard let inv = investor, net > 0 else { return nil }
        let share = (net * inv.share * 100).rounded() / 100
        guard canAfford(share) else { return nil }
        addLedger(-share, .businessCosts, "Investor profit share")
        updateBusiness { $0.investor?.paidOut += share }
        return "The investor took \(Int(inv.share * 100))% of the month's profit: \(money(share))."
    }
}
