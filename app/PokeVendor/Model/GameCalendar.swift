import Foundation

// The calendar (docs/16-time-and-day.md, The calendar). A new run starts on Monday, January 1, 2029. Day 0 is a
// Monday, so `day % 7` is still the weekday (0 is Monday). The date gives the month, the season, the rent day
// (the 1st of each month), and the new year (rent rises, sick days come back).
//
// A save from before the calendar has no start date. Its day 0 is the Monday of its old random start week in 2029,
// so its weekdays and its season stay the same.

/// One date on the calendar.
struct GameDate: Equatable {
    let year: Int
    /// 1 is January.
    let month: Int
    /// 1 is the first day of the month.
    let day: Int
    /// 0 is January 1.
    let dayOfYear: Int
    let daysInYear: Int

    var monthName: String { Balance.monthNames[month - 1] }
    /// For example "January 1".
    var text: String { "\(monthName) \(day)" }
    /// For example "Jan 1".
    var shortText: String { "\(monthName.prefix(3)) \(day)" }
}

enum GameCalendar {
    /// The year of day 0 on a new run. January 1, 2029 is a Monday.
    static let startYear = 2029
    /// The days from January 1 of the start year to day 0 of the run. `GameStore.syncMarket` sets it.
    nonisolated(unsafe) private(set) static var startOffset = 0

    static func sync(startOffset: Int) { self.startOffset = startOffset }

    static func isLeap(_ year: Int) -> Bool { (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 }
    static func daysIn(year: Int) -> Int { isLeap(year) ? 366 : 365 }
    static func daysIn(month: Int, year: Int) -> Int {
        switch month {
        case 2: isLeap(year) ? 29 : 28
        case 4, 6, 9, 11: 30
        default: 31
        }
    }

    /// The date of a game day. Day 0 is the first day of the run.
    static func date(_ day: Int) -> GameDate {
        var n = startOffset + day
        var year = startYear
        while n < 0 {
            year -= 1
            n += daysIn(year: year)
        }
        while n >= daysIn(year: year) {
            n -= daysIn(year: year)
            year += 1
        }
        let dayOfYear = n
        var month = 1
        while n >= daysIn(month: month, year: year) {
            n -= daysIn(month: month, year: year)
            month += 1
        }
        return GameDate(year: year, month: month, day: n + 1, dayOfYear: dayOfYear, daysInYear: daysIn(year: year))
    }

    static func isFirstOfMonth(_ day: Int) -> Bool { date(day).day == 1 }

    static func isNewYear(_ day: Int) -> Bool { date(day).dayOfYear == 0 }

    /// The days from `day` to the next 1st of a month. On a 1st, it is the length of that month.
    static func daysToNextFirst(after day: Int) -> Int {
        let d = date(day)
        return daysIn(month: d.month, year: d.year) - d.day + 1
    }

    /// The length of the month before the month of `day`.
    static func daysInPreviousMonth(_ day: Int) -> Int {
        let d = date(day)
        return d.month == 1 ? 31 : daysIn(month: d.month - 1, year: d.year)
    }

    /// The new years since day 0 of the run. Rent rises on each January 1.
    static func yearsSinceStart(_ day: Int) -> Int { date(day).year - date(0).year }
}

@MainActor
extension GameStore {
    /// The days from January 1, 2029 to day 0 of this run. A save from before the calendar uses its old start week.
    var calendarStartOffset: Int {
        data.calendarStart ?? PriceCycle.startWeek(seed: data.marketSeed) * 7
    }

    var date: GameDate { GameCalendar.date(data.day) }
}
