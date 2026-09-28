import Foundation

// The day job: the job board, time off, unexcused skips, quitting, and late nights (docs/16-time-and-day.md).

struct JobState: Codable, Hashable {
    /// Days worked at each job, by its index in the ladder.
    var daysWorked: [Int: Int] = [:]
    /// The last day the player applied to each job.
    var appliedDay: [Int: Int] = [:]
    /// Days of time off in the bank. It accrues and carries over.
    var timeOff = 0.0
    var timeOffBooked: [Int] = []
    /// The days of unexcused skips in the last 4 weeks.
    var unexcused: [Int] = []
    var skippedToday = false
    /// Unpaid days since the last paycheck.
    var unpaidDays = 0
    var hiredDay = 0
}

extension Job {
    /// The chance to be hired on one application (docs/16, Getting a job).
    var hireChance: Double { [0.90, 0.60, 0.45, 0.30][min(3, Job.ladder.firstIndex(of: self) ?? 0)] }
    /// One day of time off for every this many weeks.
    var timeOffWeeks: Int { [5, 4, 3, 2][min(3, Job.ladder.firstIndex(of: self) ?? 0)] }
    var hourly: Double { weeklyPay / 40 }
}

extension Balance {
    /// The next job opens after 8 weeks at the job below it.
    static let jobOpensAfterDays = 56
    /// The chance of being fired on the first, second, and third unexcused skip in 4 weeks.
    static let firedChances = [0.25, 0.50, 1.0]
    static let unexcusedResetDays = 28
    /// Time-cost actions can run this late. 26 is 2 AM. The hours past 11 PM come out of sleep.
    static let lateNightLimit = 26.0
    static let tiredPenalty = 0.15
    static let exhaustedPenalty = 0.30
    static let exhaustedFrom = 3.0
}

@MainActor
extension GameStore {
    var jobState: JobState { data.jobState }

    /// The player is off today with a booked day or an unexcused skip.
    var bookedOffToday: Bool { data.jobState.timeOffBooked.contains(data.day) }
    var skippedToday: Bool { data.jobState.skippedToday }

    /// Why the player is off on a work day, or nil.
    var dayOffReason: String? {
        guard isWorkDay else { return nil }
        if data.sickToday { return "Sick day · paid" }
        if bookedOffToday { return "Time off · paid" }
        if skippedToday { return "Skipped · unpaid" }
        return nil
    }

    // MARK: - The job board

    /// Every job the player's history has opened: the start job always, and each next job after 8 weeks at the
    /// job below it or higher (docs/16, Finding a better job).
    func jobOpen(_ index: Int) -> Bool {
        guard index > 0 else { return true }
        let days = data.jobState.daysWorked.filter { $0.key >= index - 1 }.values.reduce(0, +)
        return days >= Balance.jobOpensAfterDays
    }

    func daysToward(_ index: Int) -> Int {
        data.jobState.daysWorked.filter { $0.key >= index - 1 }.values.reduce(0, +)
    }

    func canApply(_ index: Int) -> Bool {
        jobOpen(index) && data.jobIndex != index && data.jobState.appliedDay[index] != data.day
    }

    /// One dice roll. Applying is a free action, once a day for each job.
    @discardableResult
    func apply(_ index: Int) -> Bool {
        guard canApply(index), Job.ladder.indices.contains(index) else { return false }
        data.jobState.appliedDay[index] = data.day
        let job = Job.ladder[index]
        let hired = Double.random(in: 0..<1) < job.hireChance
        if hired {
            data.jobIndex = index
            data.sickDaysLeft = job.sickDays
            data.jobState.timeOff = 0
            data.jobState.timeOffBooked = []
            data.jobState.unexcused = []
            data.jobState.unpaidDays = 0
            data.jobState.hiredDay = data.day
            log("You got the job: \(job.title), \(money(job.weeklyPay)) a week. You start on the next work day.")
        } else {
            log("\(job.title): they went with someone else. You can apply again tomorrow.")
        }
        save()
        return hired
    }

    /// Quitting is allowed at any time. The sick days and the time off are lost. Rent is still due.
    func quitJob() {
        guard let job else { return }
        data.jobIndex = nil
        data.sickDaysLeft = 0
        data.jobState.timeOff = 0
        data.jobState.timeOffBooked = []
        log("You quit your job as \(job.title.lowercased()). No more paychecks until you find another one.")
        save()
    }

    // MARK: - Days off

    var timeOffDays: Int { Int(data.jobState.timeOff) }

    func canBookTimeOff(_ day: Int) -> Bool {
        job != nil && timeOffDays >= 1 && day > data.day && day % 7 < 5 && !data.jobState.timeOffBooked.contains(day)
    }

    /// Time off must be booked in advance (docs/16, Sick days and time off).
    func bookTimeOff(_ day: Int) {
        guard canBookTimeOff(day) else { return }
        data.jobState.timeOff -= 1
        data.jobState.timeOffBooked.append(day)
        log("Booked time off for day \(day + 1), \(GameStore.weekdays[day % 7]).")
        save()
    }

    func cancelTimeOff(_ day: Int) {
        guard day > data.day, data.jobState.timeOffBooked.contains(day) else { return }
        data.jobState.timeOffBooked.removeAll { $0 == day }
        data.jobState.timeOff += 1
        save()
    }

    /// Skips work with no sick day and no time off. The day is unpaid, and the player may be fired
    /// (docs/16, Skipping without a sick day or time off).
    func skipWork() -> String? {
        guard isWorkDay, worksToday, data.hour < Balance.workStart, let job else { return nil }
        data.jobState.skippedToday = true
        data.jobState.unpaidDays += 1
        let today = data.day
        data.jobState.unexcused.append(today)
        data.jobState.unexcused.removeAll { $0 < today - Balance.unexcusedResetDays }
        let count = data.jobState.unexcused.count
        let chance = Balance.firedChances[min(count, Balance.firedChances.count) - 1]
        var line = "You skipped work. The day is unpaid."
        if Double.random(in: 0..<1) < chance {
            data.jobIndex = nil
            data.sickDaysLeft = 0
            data.jobState.timeOff = 0
            data.jobState.timeOffBooked = []
            line = "You skipped work again, and \(job.title.lowercased()) is over: they let you go."
        } else if count < Balance.firedChances.count {
            line += " Skip \(count == 1 ? "twice" : "once") more in 4 weeks and you are fired."
        }
        log(line)
        save()
        return line
    }

    /// Runs at End Day, before the day moves. Records the day worked, accrues time off, and clears the day.
    func jobEndDay(endedDay: Int) -> [String] {
        var lines: [String] = []
        if let index = data.jobIndex, endedDay % 7 < 5, !data.sickToday, !data.jobState.skippedToday,
           !data.jobState.timeOffBooked.contains(endedDay) {
            data.jobState.daysWorked[index, default: 0] += 1
            // The next job opens the day the 8 weeks are up.
            if index + 1 < Job.ladder.count, daysToward(index + 1) == Balance.jobOpensAfterDays {
                lines.append("\(Job.ladder[index + 1].title) is open on the job board now.")
            }
        }
        if let job, endedDay > data.jobState.hiredDay, (endedDay - data.jobState.hiredDay) % (job.timeOffWeeks * 7) == 0 {
            data.jobState.timeOff += 1
            lines.append("You earned a day of time off. You have \(timeOffDays).")
        }
        data.jobState.skippedToday = false
        data.jobState.timeOffBooked.removeAll { $0 < endedDay }
        data.jobState.unexcused.removeAll { $0 < endedDay - Balance.unexcusedResetDays }
        return lines
    }

    // MARK: - Late nights

    /// 1 rested, 0.85 tired, 0.70 exhausted (docs/16, Late nights).
    static func tiredFactor(lateHours: Double) -> Double {
        if lateHours >= Balance.exhaustedFrom { return 1 - Balance.exhaustedPenalty }
        if lateHours >= 1 { return 1 - Balance.tiredPenalty }
        return 1
    }

    var tiredLabel: String? {
        if data.tiredToday <= 1 - Balance.exhaustedPenalty { return "Exhausted" }
        if data.tiredToday < 1 { return "Tired" }
        return nil
    }

    /// The morning after a late night: start at 7 AM tired, or sleep in and start later.
    func chooseMorning(sleepIn: Bool) {
        let late = data.lateHours
        guard late > 0 else { return }
        if sleepIn {
            data.hour = min(Balance.dayEnd, Balance.dayStart + late)
            data.tiredToday = 1
            log("You slept in until \(GameStore.clock(data.hour)).")
        } else {
            data.tiredToday = Self.tiredFactor(lateHours: late)
            log("You got up at 7 AM after a late night. You are \(tiredLabel?.lowercased() ?? "tired") today.")
        }
        data.lateHours = 0
        save()
    }

    /// Test tool: 8 weeks at the current job, so the next one opens.
    func testWeeksAtJob() {
        guard let index = data.jobIndex else { return }
        data.jobState.daysWorked[index, default: 0] += Balance.jobOpensAfterDays
        save()
    }
}
