import Foundation

// Staff (docs/proposals/store-business.md, part 5). The store hires from weekly candidates with traits: card knowledge,
// sales, honesty, and reliability, from 1 to 5. Each has a wage and morale. A manager brings more event players and
// watches the staff. The old clerk is one staff member with average traits and the old wage, so an older save keeps
// its numbers. `CardStoreState.clerk` stays the flag that someone staffs the store.

enum StaffRole: String, Codable, CaseIterable {
    case clerk = "Clerk"
    case manager = "Manager"
}

struct Employee: Codable, Hashable, Identifiable {
    var id = UUID()
    let name: String
    let role: StaffRole
    let knowledge: Int
    let sales: Int
    let honesty: Int
    let reliability: Int
    /// The wage for each hour the store is open.
    var wage: Double
    var morale = 60.0
    var hiredDay = 0

    var dailyWage: Double { wage * (Balance.storeClose - Balance.storeOpen) }

    /// The old clerk: average traits and the old wage.
    static let standard = Employee(name: "Sam", role: .clerk, knowledge: 3, sales: 3, honesty: 3, reliability: 3,
                                   wage: Balance.clerkWage / (Balance.storeClose - Balance.storeOpen))
}

extension Balance {
    static let staffMax = 4
    static let staffCandidates = 3
    static let staffNames = ["Alex", "Jordan", "Priya", "Marcus", "Tess", "Diego", "Kim", "Owen", "Rosa", "Theo", "Maya", "Jamal",
                             "Erin", "Luis", "Nina", "Cole"]
    /// The wage of a candidate: from the base, plus a step for each trait point above 12. A manager costs more.
    static let staffWageBase = 13.0
    static let staffWageStep = 0.6
    static let staffWageMax = 22.0
    static let managerWageExtra = 4.0
    /// A raise is this much an hour, and it lifts morale.
    static let raiseStep = 1.0
    static let raiseMorale = 10.0
    /// Each sales point above 3 sells this much more often. Each knowledge point moves reviews.
    static let staffSalesStep = 0.03
    /// The chance each open day that a staff member does not come in: 1% for each reliability point under 5, more with low morale.
    static let staffAbsentStep = 0.01
    /// Staff theft: the chance each open day for each honesty point under 5, and the most taken from the register.
    static let staffTheftStep = 0.003
    static let staffTheftMax = 200.0
    /// Morale under this, and the chance each week to quit.
    static let quitMorale = 25.0
    static let quitChance = 0.15
    static let managerEventPlayers = 1.1
}

@MainActor
extension GameStore {
    /// The staff. A store from an older save with the clerk on has the standard clerk.
    var staff: [Employee] {
        guard let s = data.cardStore else { return [] }
        if let list = s.business?.staff { return list }
        return s.clerk ? [.standard] : []
    }

    var hasManager: Bool { staff.contains { $0.role == .manager } }

    private func setStaff(_ list: [Employee]) {
        updateBusiness { $0.staff = list }
        guard var s = data.cardStore else { return }
        s.clerk = !list.isEmpty
        data.cardStore = s
    }

    /// This week's candidates. The same week always gives the same people.
    var candidates: [Employee] {
        let week = data.day / 7
        if let b = data.cardStore?.business, b.candidatesWeek == week, let list = b.candidates { return list }
        var r = SeededRandom(seed: UInt64(week + 1) &* 69_069 &+ 41)
        func trait() -> Int { [1, 2, 3, 3, 3, 4, 4, 5][r.int(0...7)] }
        return (0..<Balance.staffCandidates).map { i in
            let role: StaffRole = i == 0 && r.double(0...1) < 0.5 ? .manager : .clerk
            let k = max(role == .manager ? 3 : 1, trait())
            let traits = [k, trait(), trait(), trait()]
            var wage = Balance.staffWageBase + Double(traits.reduce(0, +) - 12) * Balance.staffWageStep + (role == .manager ? Balance.managerWageExtra : 0)
            wage = min(Balance.staffWageMax + (role == .manager ? Balance.managerWageExtra : 0), max(Balance.staffWageBase, (wage * 2).rounded() / 2))
            return Employee(name: Balance.staffNames[r.int(0...(Balance.staffNames.count - 1))], role: role, knowledge: traits[0],
                            sales: traits[1], honesty: traits[2], reliability: traits[3], wage: wage)
        }
    }

    func hire(_ candidate: Employee) {
        guard data.cardStore != nil, staff.count < Balance.staffMax else { return }
        var e = candidate
        e.id = UUID()
        e.hiredDay = data.day
        let week = data.day / 7
        let rest = candidates.filter { $0.name != candidate.name || $0.role != candidate.role }
        updateBusiness { $0.candidates = rest; $0.candidatesWeek = week }
        setStaff(staff + [e])
        log("Hired \(e.name) as \(e.role.rawValue.lowercased()) at \(money(e.wage)) an hour.")
        save()
    }

    func fire(_ id: UUID) {
        guard let e = staff.first(where: { $0.id == id }) else { return }
        setStaff(staff.filter { $0.id != id })
        log("Let \(e.name) go.")
        save()
    }

    func giveRaise(_ id: UUID) {
        setStaff(staff.map { e in
            guard e.id == id else { return e }
            var x = e
            x.wage += Balance.raiseStep
            x.morale = min(100, x.morale + Balance.raiseMorale)
            return x
        })
        save()
    }

    /// The sales factor of the best salesperson on duty. 1 for the standard clerk.
    var staffSalesFactor: Double {
        let best = staff.map(\.sales).max() ?? 3
        return 1 + Double(best - 3) * Balance.staffSalesStep
    }

    /// The average card knowledge of the staff, or nil with no staff.
    var staffKnowledge: Double? {
        let list = staff
        return list.isEmpty ? nil : Double(list.reduce(0) { $0 + $1.knowledge }) / Double(list.count)
    }

    var staffDailyWage: Double { staff.reduce(0) { $0 + $1.dailyWage } }

    // MARK: - The day

    /// Who comes in today. Returns false when nobody does, and the lines for the report.
    func staffDay(storeName: String) -> (present: Bool, lines: [String]) {
        let list = staff
        guard !list.isEmpty else { return (false, []) }
        // The standard clerk of an older save has no sick days and no theft: the old numbers.
        guard data.cardStore?.business?.staff != nil else { return (true, []) }
        var lines: [String] = []
        var absent: [String] = []
        for e in list {
            let chance = Double(5 - e.reliability) * Balance.staffAbsentStep + (e.morale < 40 ? 0.04 : 0)
            if Double.random(in: 0..<1) < chance { absent.append(e.name) }
        }
        if !absent.isEmpty { lines.append("\(absent.joined(separator: " and ")) called in sick at \(storeName).") }
        let present = absent.count < list.count
        // Theft: a dishonest employee takes cash from the register. A manager halves the chance. Cameras catch it.
        if present, let thief = list.filter({ !absent.contains($0.name) }).randomElement() {
            var chance = Double(5 - thief.honesty) * Balance.staffTheftStep + (thief.morale < 30 ? 0.01 : 0)
            if hasManager, thief.role != .manager { chance /= 2 }
            if Double.random(in: 0..<1) < chance {
                let taken = (Double.random(in: 20...Balance.staffTheftMax)).rounded()
                if data.cardStore?.has(.cameras) == true {
                    setStaff(staff.filter { $0.id != thief.id })
                    lines.append("The cameras caught \(thief.name) taking \(money(taken)) from the register. You let them go, and got the money back.")
                } else {
                    addLedger(-taken, .wages, "Register short · \(storeName)")
                    lines.append("The register at \(storeName) came up \(money(taken)) short. Someone on the staff took it.")
                }
            }
        }
        return (present, lines)
    }

    /// Each week: morale moves toward a target that the wage and the hours set, and unhappy staff can quit.
    func staffWeekEnd(storeName: String, openDays: Int) -> [String] {
        var lines: [String] = []
        var list = staff
        guard !list.isEmpty else { return [] }
        let manager = hasManager
        for i in list.indices {
            let fair = Balance.staffWageBase + Double(list[i].knowledge + list[i].sales + list[i].honesty + list[i].reliability - 12) * Balance.staffWageStep
            var target = 60 + (list[i].wage - fair) * 6
            if openDays >= 7 { target -= 10 }
            if manager, list[i].role != .manager { target += 5 }
            list[i].morale += (min(100, max(0, target)) - list[i].morale) * 0.25
        }
        let quitters = list.filter { $0.morale < Balance.quitMorale && Double.random(in: 0..<1) < Balance.quitChance }
        for q in quitters { lines.append("\(q.name) quit \(storeName). Morale was low.") }
        list.removeAll { e in quitters.contains { $0.id == e.id } }
        setStaff(list)
        return lines
    }
}
