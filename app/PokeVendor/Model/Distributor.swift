import Foundation

// The hobby distributor account: the application, the rep, the fill rate, Elite priority, and the back-door check
// (docs/12-acquiring-product.md, Distributor / wholesale; docs/22-own-store.md).

/// The two legitimate wholesale tiers.
enum DistributorTier {
    /// No wholesale yet.
    case none
    /// The no-store route: reputation Respected, or a store that waits for its account. No application.
    case secondary
    /// The store route: an approved hobby distributor account.
    case hobby

    var name: String {
        switch self {
        case .none: "No wholesale"
        case .secondary: "Secondary wholesaler"
        case .hobby: "Hobby distributor account"
        }
    }
}

/// One hot case or unit from the hobby account, for the back-door check.
/// A new field must be Optional. This type decodes inside an array.
struct HotAllocationRecord: Codable, Hashable {
    enum Outcome: String, Codable { case retail, offShelf }
    let itemID: UUID
    let units: Int
    /// The day the case arrives.
    let deliveredDay: Int
    var outcome: Outcome?
    var outcomeDay: Int?
    /// A warning already used this sale.
    var judged: Bool?
}

extension Balance {
    static let distributorReviewDays = 14

    static let repStartPoints = 20
    static let repNames = ["Dana Ruiz", "Mark Osei", "Leah Brandt", "Tom Achebe", "Rachel Kim"]
    /// +1 point for each $1,000 spent, at most 3 a week. +1 for a week with a store event.
    static let repSpendStep = 1000.0
    static let repPointsPerWeek = 3
    static let repEventPoints = 1
    /// "Push for more allocation": the cost, the fill bonus for one product this week, and the wait between pushes.
    static let pushCost = 5
    static let pushFillBonus = 0.25
    static let pushCooldownDays = 28

    /// Integration D2: 0.05, so a new account at high pressure gets about the real Prismatic Evolutions low.
    static let fillBase = 0.05
    static let fillPressureWeight = 0.35
    static let fillRepWeight = 0.20
    static let fillMax = 0.90

    static let backDoorWindowDays = 28
    static let backDoorShelfShare = 0.40
    static let backDoorNoticeChance = 0.25
    /// The check needs at least this many sold units, and at least half of the hot units delivered in the window.
    static let backDoorMinUnits = 6
    static let backDoorMinShare = 0.5
    static let backDoorRepCost = 15
    static let backDoorWarningWindowDays = 84
    static let hotFreezeDays = 28
    static let accountCloseDays = 84
    /// A record leaves the list this many days after its sale, or after its delivery when it never sold.
    static let hotRecordKeepDays = 56
}

@MainActor
extension GameStore {
    // MARK: - The application

    /// What the hobby account needs, for the checklist on the distributor screen.
    var distributorRequirements: [StoreRequirement] {
        [StoreRequirement(id: "lease", label: "A signed lease", detail: "Your own store.", met: data.cardStore != nil),
         StoreRequirement(id: "build", label: "A finished build-out", detail: "The store is open.", met: storeIsBuilt),
         StoreRequirement(id: "permit", label: "A seller's permit", detail: "A resale certificate for the distributor.", met: hasSellerPermit)]
    }

    var canApplyToDistributor: Bool {
        let closed = data.distributor.closedUntil.map { data.day < $0 } ?? false
        return distributorRequirements.allSatisfy(\.met) && !closed
            && data.distributor.appliedDay == nil && data.distributor.approvedDay == nil
    }

    var distributorDecisionDay: Int? {
        guard let applied = data.distributor.appliedDay, data.distributor.approvedDay == nil else { return nil }
        return applied + Balance.distributorReviewDays
    }

    /// Sends the application. The decision comes in 14 days.
    func applyToDistributor() {
        guard canApplyToDistributor else { return }
        data.distributor.appliedDay = data.day
        log("Applied for a hobby distributor account. The distributor decides on day \(data.day + Balance.distributorReviewDays + 1).")
        save()
    }

    /// A store from a save before the application keeps its account. It needs no review.
    /// It runs once for a save from before the application (`migrated` is false). A new build sets `migrated` at once, so
    /// a restart never approves a store that did not apply.
    static func grandfatherDistributor(_ d: inout GameData) {
        guard !d.distributor.migrated else { return }
        d.distributor.migrated = true
        guard let store = d.cardStore, d.day >= store.openDay, d.distributor.approvedDay == nil, d.distributor.appliedDay == nil else { return }
        d.distributor.appliedDay = store.openDay
        d.distributor.approvedDay = store.openDay
    }

    // MARK: - The rep

    var repPoints: Int { data.distributor.repContactID.flatMap { contact($0) }.map { points(of: $0) } ?? 0 }

    var repName: String { data.distributor.repContactID.flatMap { contact($0) }?.name ?? "Your rep" }

    /// Adds the rep when the account is approved. The rep never goes in the contact book and gives no reputation.
    func ensureRepContact() {
        guard data.distributor.approvedDay != nil, data.distributor.repContactID == nil else { return }
        let id = "distro:rep"
        if !data.contacts.contains(where: { $0.id == id }) {
            var rep = Contact(id: id, name: Balance.repNames.randomElement() ?? "Dana Ruiz", kind: .distributorRep,
                              points: Balance.repStartPoints, interests: [.sealed])
            rep.rewardedLevel = 4
            rep.lastDealDay = data.day
            data.contacts.append(rep)
        }
        data.distributor.repContactID = id
    }

    /// Spend raises the rep: 1 point for each $1,000, at most 3 a week. The remainder carries over.
    func creditRepSpend(_ amount: Double) {
        var a = data.distributor
        guard let id = a.repContactID, amount > 0 else { return }
        let week = data.day / 7
        let today = data.day
        if a.repPointsWeek != week { a.repPointsWeek = week; a.repPointsThisWeek = 0 }
        a.repSpendCarry += amount
        let steps = Int(a.repSpendCarry / Balance.repSpendStep)
        a.repSpendCarry -= Double(steps) * Balance.repSpendStep
        let earned = max(0, min(steps, Balance.repPointsPerWeek - a.repPointsThisWeek))
        a.repPointsThisWeek += earned
        data.distributor = a          // write the account back before the next call on `data`
        if let i = data.contacts.firstIndex(where: { $0.id == id }) { data.contacts[i].lastDealDay = today }
        if earned > 0 { addPoints(id, earned) }
    }

    /// The day the next push is possible. Nil when the player can push now.
    var pushWaitUntil: Int? {
        let next = data.distributor.lastPushDay + Balance.pushCooldownDays
        return data.day < next ? next : nil
    }

    /// "Push for more allocation". Costs 5 rep points. One product gets a better fill this week.
    func pushForAllocation(_ productID: String) -> String? {
        var a = data.distributor
        guard hasStoreAccount, let id = a.repContactID else { return "You need a hobby distributor account." }
        guard data.day - a.lastPushDay >= Balance.pushCooldownDays else {
            return "You pushed recently. Wait until day \(a.lastPushDay + Balance.pushCooldownDays + 1)."
        }
        a.pushProductID = productID
        a.pushWeek = data.day / 7
        a.lastPushDay = data.day
        data.distributor = a
        addPoints(id, -Balance.pushCost)
        log("You pushed your rep for more allocation. It cost goodwill.")
        save()
        return nil
    }

    /// A store event last week raises the rep (Monday, in `distributorEndDay`).
    private func weeklyRepCredit() {
        guard hasStoreAccount, let id = data.distributor.repContactID, let s = data.cardStore, s.has(.playTables),
              let ev = s.events else { return }
        let week = data.day / 7
        // An event ran last week when its afterglow day is in the last 7 days.
        guard ev.afterglowDay >= data.day - 7, data.distributor.eventWeekCredited != week else { return }
        data.distributor.eventWeekCredited = week
        addPoints(id, Balance.repEventPoints)
    }

    // MARK: - The fill rate and Elite

    #if DEBUG
    /// Test tools: they replace the random rolls of the distributor.
    static var forceFill: Double?
    static var forceBackDoorNotice: Bool?
    #endif

    /// The chance that one requested hot case arrives. The secondary wholesaler has no rep, so its rep term is 0.
    /// Reads `data.flipperPressure` (0.1 to 0.9).
    func hotFillRate(_ product: Product) -> Double {
        #if DEBUG
        if let forced = GameStore.forceFill { return forced }
        #endif
        let pressure = data.flipperPressure
        let rep = hasStoreAccount ? Double(repPoints) / 100 : 0
        var fill = Balance.fillBase + Balance.fillPressureWeight * (1 - pressure) + Balance.fillRepWeight * rep
        let a = data.distributor
        if hasStoreAccount, a.pushProductID == product.id, a.pushWeek == data.day / 7 { fill += Balance.pushFillBonus }
        #if DEBUG
        if let forced = GameStore.forceHotFill { return forced }
        #endif
        // Premier gets a better fill on hot product (Model/DistributionLadder.swift).
        if hasStoreAccount, ladderTier == .premier { fill += Balance.premierHotFill }
        return min(Balance.fillMax, max(0, fill))
    }

    /// Elite gets one hot case each week that skips the fill roll.
    var eliteCaseOpen: Bool { reputationTier >= 4 && data.distributor.eliteCaseWeek != data.day / 7 }

    /// The Elite case of this week went to this product. The +1 stays for the product, so the normal case still rolls.
    func eliteCaseUsed(on product: Product) -> Bool {
        data.distributor.eliteCaseWeek == data.day / 7 && data.distributor.eliteProductID == product.id
    }

    var hotFrozen: Bool { data.distributor.hotFrozenUntil.map { data.day < $0 } ?? false }

    // MARK: - The back-door check

    /// Marks hot units that sold. A sale to an outside reseller channel is off-shelf. A whole case sold is too.
    func noteAllocationSold(_ ids: [UUID], offShelf: Bool) {
        guard !data.distributor.hotRecords.isEmpty else { return }
        let set = Set(ids)
        let today = data.day
        for i in data.distributor.hotRecords.indices where set.contains(data.distributor.hotRecords[i].itemID)
                                                        && data.distributor.hotRecords[i].outcome == nil {
            let off = offShelf || data.distributor.hotRecords[i].units > 1
            data.distributor.hotRecords[i].outcome = off ? .offShelf : .retail
            data.distributor.hotRecords[i].outcomeDay = today
        }
    }

    /// The player opens a hot unit. That counts as retail.
    func noteAllocationOpened(_ id: UUID) {
        guard !data.distributor.hotRecords.isEmpty else { return }
        let today = data.day
        for i in data.distributor.hotRecords.indices where data.distributor.hotRecords[i].itemID == id
                                                        && data.distributor.hotRecords[i].outcome == nil {
            data.distributor.hotRecords[i].outcome = .retail
            data.distributor.hotRecords[i].outcomeDay = today
        }
    }

    /// A hot case opens into units. The record moves to the units.
    func splitHotRecord(caseID: UUID, into ids: [UUID]) {
        guard let i = data.distributor.hotRecords.firstIndex(where: { $0.itemID == caseID }) else { return }
        let r = data.distributor.hotRecords.remove(at: i)
        data.distributor.hotRecords += ids.map { HotAllocationRecord(itemID: $0, units: 1, deliveredDay: r.deliveredDay) }
    }

    /// The hot units sold in the last 28 days that no warning used yet: retail, off-shelf, and the units delivered.
    var hotSalesWindow: (retail: Int, offShelf: Int, delivered: Int) {
        let from = data.day - Balance.backDoorWindowDays
        var retail = 0, off = 0, delivered = 0
        for r in data.distributor.hotRecords {
            // A unit that a warning already judged counts for neither side, so a second check needs new sales.
            if r.deliveredDay > from, r.judged != true { delivered += r.units }
            guard let day = r.outcomeDay, day > from, r.judged != true else { continue }
            if r.outcome == .retail { retail += r.units } else if r.outcome == .offShelf { off += r.units }
        }
        return (retail, off, delivered)
    }

    /// The share that the store screen and the rep box show. Nil when no hot unit sold in the window.
    var hotShelfShare: Double? {
        let w = hotSalesWindow
        let sold = w.retail + w.offShelf
        return sold == 0 ? nil : Double(w.retail) / Double(sold)
    }

    /// The weekly check. It runs while any record exists, also after a store close.
    private func backDoorCheck() -> [String] {
        let today = data.day
        let keep = today - Balance.hotRecordKeepDays
        data.distributor.hotRecords.removeAll { ($0.outcomeDay ?? $0.deliveredDay) <= keep }     // reads only a local
        guard !data.distributor.hotRecords.isEmpty else { return [] }
        let w = hotSalesWindow
        let sold = w.retail + w.offShelf
        let need = max(Balance.backDoorMinUnits, Int((Double(w.delivered) * Balance.backDoorMinShare).rounded(.up)))
        guard sold >= need else { return [] }
        let share = Double(w.retail) / Double(sold)
        guard share < Balance.backDoorShelfShare else { return [] }
        // The act is a secret even when the rep does not notice. One act for one stretch of sales.
        if today - data.distributor.lastBackDoorActDay >= Balance.backDoorWindowDays {
            data.distributor.lastBackDoorActDay = today
            recordHiddenAct(.backDoorAllocation, weight: max(0.6, min(1.5, 1.5 * (1 - share))),
                            note: "\(w.offShelf) of \(sold) hot units from the distributor went to resellers.")
        }
        #if DEBUG
        let notice = GameStore.forceBackDoorNotice ?? (Double.random(in: 0..<1) < Balance.backDoorNoticeChance)
        #else
        let notice = Double.random(in: 0..<1) < Balance.backDoorNoticeChance
        #endif
        guard notice else { return [] }
        // The sales that brought this warning do not count again.
        let from = today - Balance.backDoorWindowDays
        for i in data.distributor.hotRecords.indices where (data.distributor.hotRecords[i].outcomeDay ?? -1) > from {
            data.distributor.hotRecords[i].judged = true
        }
        return [backDoorWarning()]
    }

    private func backDoorWarning() -> String {
        var a = data.distributor
        let today = data.day
        let cutoff = today - Balance.backDoorWarningWindowDays
        a.warnings = a.warnings.filter { $0 >= cutoff } + [today]
        var line = "Your distributor rep noticed that your hot cases go to resellers, not to your shelf. This is a warning."
        if a.warnings.count >= 3 {
            a.closedUntil = today + Balance.accountCloseDays
            a.warnings = []
            a.hotFrozenUntil = nil
            line = "Your distributor closed your account for 12 weeks. Your hot cases kept going out the back door. You buy from the secondary wholesaler until day \(today + Balance.accountCloseDays + 1)."
        } else if a.warnings.count == 2 {
            a.hotFrozenUntil = today + Balance.hotFreezeDays
            line = "Second warning from your distributor rep. No hot product for your account for 4 weeks."
        }
        let rep = a.repContactID
        data.distributor = a
        addPoints(rep, -Balance.backDoorRepCost)
        return line
    }

    // MARK: - End Day

    /// The application decision, closures that end, and on Monday the rep credit, the back-door check, and the plug rumor.
    func distributorEndDay() -> [String] {
        var lines: [String] = []
        let today = data.day
        let built = storeIsBuilt
        let permit = hasSellerPermit
        let storeGone = data.cardStore == nil
        var a = data.distributor
        var approvedNow = false
        if storeGone, a.appliedDay != nil || a.approvedDay != nil {
            // The account closes with the store. The records, warnings, and penalties stay.
            a.appliedDay = nil
            a.approvedDay = nil
        }
        if let applied = a.appliedDay, a.approvedDay == nil, today >= applied + Balance.distributorReviewDays {
            if built && permit {
                a.approvedDay = today
                approvedNow = true
                lines.append("The distributor approved your hobby account. You buy at \(Int(Balance.storeWholesaleDiscount * 100))% of MSRP now, with a weekly allocation.")
            } else {
                a.appliedDay = nil
                lines.append("Your distributor application lapsed. Your store was not open on the decision day.")
            }
        }
        if let until = a.closedUntil, today >= until {
            a.closedUntil = nil
            lines.append("Your distributor opened your account again.")
        }
        if let until = a.hotFrozenUntil, today >= until { a.hotFrozenUntil = nil }
        data.distributor = a
        if approvedNow { ensureRepContact() }
        if weekday == 0 {
            weeklyRepCredit()
            lines += backDoorCheck()
            lines += plugRepCheck()
        }
        return lines
    }

    #if DEBUG
    /// Test tool: an approved hobby account, with its rep.
    func testApproveDistributor() {
        data.distributor.appliedDay = data.day
        data.distributor.approvedDay = data.day
        ensureRepContact()
    }

    /// Test tool: runs the weekly back-door check now.
    func testBackDoorCheck() -> [String] { backDoorCheck() }
    #endif
}
