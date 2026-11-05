import Foundation

// Seasons (docs/05-pricing-and-market.md, Seasons). A run starts on a random week of the year. The week of the year
// moves the demand for sealed product and for singles, and the price of sealed product. Each season is a smooth bump,
// so no factor jumps from one day to the next.

/// One seasonal bump: its center week, its half width in weeks, and its size at the center.
struct SeasonBump {
    let center: Double
    let halfWidth: Double
    let size: Double

    /// The size of the bump on a week of the year. A raised cosine: `size` at the center, 0 at the edges and outside.
    func value(week: Double) -> Double {
        var distance = abs(week - center).truncatingRemainder(dividingBy: Balance.weeksPerYear)
        distance = min(distance, Balance.weeksPerYear - distance)
        guard distance < halfWidth else { return 0 }
        return size * (1 + cos(.pi * distance / halfWidth)) / 2
    }
}

extension Balance {
    static let weeksPerYear = 52.0
    /// Q4 holiday buying: sealed product sells more, from mid October to the end of December (center: late November).
    static let seasonHolidaySealed = SeasonBump(center: 47.5, halfWidth: 5.5, size: 0.15)
    /// In the holiday season singles sell a little less, because buyers spend on sealed gifts.
    static let seasonHolidaySingles = SeasonBump(center: 47.5, halfWidth: 5.5, size: -0.05)
    /// After the holidays, January to mid March: sealed prices are low (center: early February).
    static let seasonWinterSealedPrice = SeasonBump(center: 5, halfWidth: 6, size: -0.10)
    /// The holiday rush lifts sealed prices a little.
    static let seasonHolidaySealedPrice = SeasonBump(center: 48, halfWidth: 5, size: 0.05)
    /// The summer slump: everything sells a little less (center: late July).
    static let seasonSummer = SeasonBump(center: 30, halfWidth: 6, size: -0.05)
    static let monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
                             "October", "November", "December"]
}

extension PriceCycle {
    /// The week of the year (0 to 51) on day 0 of the run. The run's market seed sets it, so an old save gets one too.
    static var startWeek: Int { Int(seasonUnit * Balance.weeksPerYear) % Int(Balance.weeksPerYear) }

    /// A stable number from 0 to 1 for the run.
    private static var seasonUnit: Double {
        var h = seed ^ 0x9E37_79B9_7F4A_7C15
        h ^= h >> 30
        h = h &* 0xBF58_476D_1CE4_E5B9
        h ^= h >> 27
        h = h &* 0x94D0_49BB_1331_11EB
        h ^= h >> 31
        return Double(h >> 11) / Double(1 << 53)
    }

    /// The week of the year on a day, with a fraction: 0 is the first day of January, 51.9 is the end of December.
    static func weekOfYear(day: Int? = nil) -> Double {
        let d = Double(day ?? today)
        return (Double(startWeek) + d / 7).truncatingRemainder(dividingBy: Balance.weeksPerYear)
    }

    /// The month of a day, for example "November".
    static func monthName(day: Int? = nil) -> String {
        let month = min(11, Int(weekOfYear(day: day) * 12 / Balance.weeksPerYear))
        return Balance.monthNames[month]
    }

    /// The factor on the chance that an item sells. 1 is no seasonal change.
    static func seasonDemand(sealed: Bool, day: Int? = nil) -> Double {
        let w = weekOfYear(day: day)
        let holiday = sealed ? Balance.seasonHolidaySealed : Balance.seasonHolidaySingles
        return 1 + holiday.value(week: w) + Balance.seasonSummer.value(week: w)
    }

    /// The factor on the price of sealed product. Singles keep their price. Only their demand moves.
    static func seasonSealedPrice(day: Int? = nil) -> Double {
        let w = weekOfYear(day: day)
        return 1 + Balance.seasonWinterSealedPrice.value(week: w) + Balance.seasonHolidaySealedPrice.value(week: w)
    }

    /// The factor on the customers of the player's store: the mean of the sealed and the singles demand.
    static func seasonTraffic(day: Int? = nil) -> Double {
        (seasonDemand(sealed: true, day: day) + seasonDemand(sealed: false, day: day)) / 2
    }

    /// The season on a day, for the Market screen and the End Day report. Nil when no season moves the market.
    static func seasonName(day: Int? = nil) -> String? {
        let w = weekOfYear(day: day)
        if Balance.seasonHolidaySealed.value(week: w) > 0.02 { return "Holiday season" }
        if Balance.seasonWinterSealedPrice.value(week: w) < -0.02 { return "After the holidays" }
        if Balance.seasonSummer.value(week: w) < -0.01 { return "Summer slump" }
        return nil
    }

    /// One line on what the season does now.
    static func seasonText(day: Int? = nil) -> String {
        switch seasonName(day: day) {
        case "Holiday season": "Holiday buyers want sealed product. Sealed sells more and costs more. Singles sell a little less."
        case "After the holidays": "The holiday rush is over. Sealed prices are low, so this is a good time to buy sealed."
        case "Summer slump": "Summer is slow. Everything sells a little less."
        default: "No season moves the market now."
        }
    }
}

@MainActor
extension GameStore {
    /// A line for the End Day report on the day that a season starts or ends.
    func seasonEndDayLine() -> String? {
        let now = PriceCycle.seasonName(day: data.day)
        let before = PriceCycle.seasonName(day: data.day - 1)
        guard now != before else { return nil }
        if let now { return "\(now) starts. \(PriceCycle.seasonText(day: data.day))" }
        return "\(before ?? "The season") is over."
    }
}
