import Foundation

// Store hours, planned closures, and part-time staff (docs/39-store-shift.md, docs/proposals/shop-experience.md parts
// 3 to 5). The player posts the hours. A change starts tomorrow. Customers come most after school and work. Each staff
// member works some days, all day or one half. The part of the day with no staff is the owner's shift. A sick call
// comes in the morning, so the owner covers it or locks up.

/// The posted hours of the store, as clock hours. 11 to 19 is 11 AM to 7 PM.
struct StoreHours: Codable, Hashable {
    var open: Double
    var close: Double
    var length: Double { close - open }
    /// The middle, on the half hour: where the opening half ends and the closing half starts.
    var mid: Double { open + (length / 2 * 2).rounded(.down) / 2 }
}

/// The part of the day that a staff member works.
enum StaffPart: String, Codable, CaseIterable {
    case full = "All day"
    case opening = "Opening half"
    case closing = "Closing half"
}

/// The days and the half that a staff member works. `days` nil: every open day.
struct StaffSchedule: Codable, Hashable {
    var days: [Int]?
    var part: StaffPart = .full
}

/// A closed day posted ahead. `costly`: past the allowance, it costs as much as a lock-up.
struct PlannedClosure: Codable, Hashable {
    let day: Int
    var costly = false
}

extension Balance {
    static let storeOpenChoices: [Double] = [9, 10, 11, 12, 13, 14, 15]
    static let storeLengthChoices: [Double] = [6, 8, 10, 12]
    static let storeLatestClose = 23.0
    /// Customers by the clock hour: fewer in the morning, the most after school and work.
    static let trafficCurve: [(from: Double, to: Double, weight: Double)] = [(0, 12, 0.6), (12, 15, 1.0), (15, 19, 1.3), (19, 24, 0.8)]
    /// A closed day is posted this many days ahead at the least. Up to `closureAllowance` in `closureWindow` days cost
    /// only `closureLoyalty`.
    static let closureNotice = 3
    static let closureAllowance = 4
    static let closureWindow = 28
    static let closureLoyalty = 1.0
    static let closureAhead = 14
}

@MainActor
extension GameStore {
    // MARK: - Hours

    /// The posted hours today. An older save keeps 11 AM to 7 PM.
    var storeHours: StoreHours { data.cardStore?.hours ?? StoreHours(open: Balance.storeOpen, close: Balance.storeClose) }
    var storeOpenHour: Double { storeHours.open }
    var storeCloseHour: Double { storeHours.close }
    var storeHoursLength: Double { storeHours.length }

    /// The customers in a stretch of the clock, from the traffic curve.
    nonisolated static func traffic(from: Double, to: Double) -> Double {
        Balance.trafficCurve.reduce(0) { sum, band in sum + max(0, min(to, band.to) - max(from, band.from)) * band.weight }
    }

    /// The posted hours against 11 AM to 7 PM: 1 for the old hours, so an older store keeps its traffic.
    var storeHoursTrafficFactor: Double {
        Self.traffic(from: storeOpenHour, to: storeCloseHour) / Self.traffic(from: Balance.storeOpen, to: Balance.storeClose)
    }

    /// The share of the day's customers who come in a stretch of the posted hours.
    func trafficShare(from: Double, to: Double) -> Double {
        let all = Self.traffic(from: storeOpenHour, to: storeCloseHour)
        guard all > 0, to > from else { return 0 }
        return Self.traffic(from: max(from, storeOpenHour), to: min(to, storeCloseHour)) / all
    }

    /// Posts new hours. They start tomorrow, so today's customers still find the old ones.
    func setStoreHours(open: Double, length: Double) {
        guard var s = data.cardStore else { return }
        let close = min(Balance.storeLatestClose, open + length)
        let hours = StoreHours(open: open, close: close)
        s.pendingHours = hours == storeHours ? nil : hours
        data.cardStore = s
        log("New hours for \(s.name) from tomorrow: \(GameStore.clock(open)) – \(GameStore.clock(close)).")
        save()
    }

    /// End Day, after the day moves: tomorrow's hours start.
    func applyPendingHours() {
        guard var s = data.cardStore, let next = s.pendingHours else { return }
        s.hours = next
        s.pendingHours = nil
        data.cardStore = s
    }

    // MARK: - Planned closures

    var plannedClosures: [PlannedClosure] { business.plannedClosures ?? [] }

    func plannedClosure(on day: Int) -> PlannedClosure? { plannedClosures.first { $0.day == day } }

    /// Why the player cannot post a closed day on `day`, or nil.
    func closureBlock(_ day: Int) -> String? {
        guard let s = data.cardStore else { return "You have no store" }
        if day < data.day + Balance.closureNotice { return "Post at least \(Balance.closureNotice) days ahead" }
        if !s.openDays.contains(day % 7) { return "Closed that day already" }
        if plannedClosure(on: day) != nil { return "Posted already" }
        return nil
    }

    /// True when a new closed day around `day` goes past the allowance, so it costs as a lock-up.
    func closureCostly(_ day: Int) -> Bool {
        plannedClosures.filter { abs($0.day - day) < Balance.closureWindow }.count >= Balance.closureAllowance
    }

    func planClosure(_ day: Int) {
        guard closureBlock(day) == nil else { return }
        let costly = closureCostly(day)
        updateBusiness { b in b.plannedClosures = (b.plannedClosures ?? []) + [PlannedClosure(day: day, costly: costly)] }
        log("Posted a closed day at \(data.cardStore?.name ?? "the store"): \(GameCalendar.date(day).text).")
        save()
    }

    /// A posted day can come off up to the day before.
    func cancelClosure(_ day: Int) {
        guard day > data.day else { return }
        updateBusiness { b in b.plannedClosures = b.plannedClosures?.filter { $0.day != day } }
        save()
    }

    var closedAsPostedToday: Bool { plannedClosure(on: data.day) != nil }

    /// End Day on a posted closed day: a small cost, or a lock-up's cost past the allowance.
    func closureDayEnd() -> [String] {
        guard let s = data.cardStore, let c = plannedClosure(on: data.day) else { return [] }
        let today = data.day
        updateBusiness { b in b.plannedClosures = b.plannedClosures?.filter { $0.day >= today - Balance.closureWindow } }
        if c.costly {
            nudgeLoyalty(-Balance.lockUpLoyalty * lockUpFactor)
            return ["\(s.name) was closed as posted. Too many closed days this month: customers are giving up on the store."]
        }
        nudgeLoyalty(-Balance.closureLoyalty)
        return ["\(s.name) was closed as posted. A few people missed you."]
    }

    // MARK: - Coverage

    /// True when this staff member works on that weekday.
    func works(_ e: Employee, weekday: Int) -> Bool { e.schedule?.days?.contains(weekday) ?? true }

    /// The staff who called in sick today.
    var absentToday: Set<UUID> {
        let b = business
        return b.absentDay == data.day ? Set(b.absentToday ?? []) : []
    }

    /// The staff at work today: scheduled for today, and not sick.
    var staffOnToday: [Employee] {
        let away = absentToday
        let day = weekday
        return staff.filter { works($0, weekday: day) && !away.contains($0.id) }
    }

    /// The halves of today that staff cover.
    var coveredToday: (opening: Bool, closing: Bool) { covered(staffOnToday) }

    /// The halves of a weekday that the schedules cover, with nobody sick: for the week grid.
    func covered(weekday: Int) -> (opening: Bool, closing: Bool) {
        covered(staff.filter { works($0, weekday: weekday) })
    }

    private func covered(_ list: [Employee]) -> (opening: Bool, closing: Bool) {
        var opening = false, closing = false
        for e in list {
            switch e.schedule?.part ?? .full {
            case .full: opening = true; closing = true
            case .opening: opening = true
            case .closing: closing = true
            }
        }
        return (opening, closing)
    }

    /// The part of today with no staff: the owner's shift, before the day job moves it. Nil: staff cover all day.
    var ownerWindow: (start: Double, end: Double)? {
        let h = storeHours
        let c = coveredToday
        switch (c.opening, c.closing) {
        case (true, true): return nil
        case (true, false): return (h.mid, h.close)
        case (false, true): return (h.open, h.mid)
        case (false, false): return (h.open, h.close)
        }
    }

    /// The stretches of today that staff cover.
    var coveredWindows: [(Double, Double)] {
        let h = storeHours
        let c = coveredToday
        switch (c.opening, c.closing) {
        case (true, true): return [(h.open, h.close)]
        case (true, false): return [(h.open, h.mid)]
        case (false, true): return [(h.mid, h.close)]
        case (false, false): return []
        }
    }

    /// The hours that a staff member is paid for today.
    func paidHours(_ e: Employee) -> Double {
        let h = storeHours
        switch e.schedule?.part ?? .full {
        case .full: return h.length
        case .opening: return h.mid - h.open
        case .closing: return h.close - h.mid
        }
    }

    /// Today's wages: the staff at work, for their hours.
    var staffWageToday: Double { staffOnToday.reduce(0) { $0 + $1.wage * paidHours($1) } }

    /// A full day of wages for one staff member at the posted hours, for the staff screen.
    func dailyWage(_ e: Employee) -> Double { e.wage * paidHours(e) }

    func setSchedule(_ id: UUID, _ schedule: StaffSchedule?) {
        // The standard clerk of an older save becomes a staff list here, so it can take a schedule.
        var list = data.cardStore?.business?.staff ?? staff
        guard let i = list.firstIndex(where: { $0.id == id }) else { return }
        list[i].schedule = schedule
        updateBusiness { $0.staff = list }
        save()
    }

    // MARK: - Sick calls

    /// The morning, after the day moves: each scheduled staff member can call in sick. Their part of the day becomes the
    /// owner's. The standard clerk of an older save never calls in.
    func staffMorning() -> [String] {
        guard let s = data.cardStore, storeOpenToday, business.staff != nil else { return [] }
        let day = weekday
        let sick = staff.filter { e in
            guard works(e, weekday: day) else { return false }
            let chance = Double(5 - e.reliability) * Balance.staffAbsentStep + (e.morale < 40 ? 0.04 : 0)
            return Double.random(in: 0..<1) < chance
        }
        let today = data.day
        updateBusiness { b in b.absentToday = sick.map(\.id); b.absentDay = today }
        guard !sick.isEmpty else { return [] }
        let names = sick.map(\.name).joined(separator: " and ")
        if let w = ownerWindow {
            return ["\(names) called in sick at \(s.name). \(GameStore.clock(w.start)) – \(GameStore.clock(w.end)) is yours today: work the counter or lock up."]
        }
        return ["\(names) called in sick at \(s.name). The rest of the staff covers the day."]
    }
}
