import Foundation

// Print runs (docs/05-pricing-and-market.md, Print runs). A set can go out of print, and an older set can come back
// for a reprint wave. Retail sells only product that is in print, and sealed prices move with each change.

/// One change to the print status of a set. The game announces it some days before it happens.
struct PrintChange: Codable, Identifiable, Hashable {
    var id = UUID()
    let slug: String
    /// The day the change happens.
    let day: Int
    let announcedDay: Int
    /// The status from `day` on.
    let inPrint: Bool
    /// The sealed price move that the change brings over `Balance.printRampDays`, for example 0.2 for +20%.
    let jump: Double
    /// True when this change ends a reprint wave. It is planned with the wave, so the game does not announce it.
    var endsWave = false
}

extension Balance {
    /// The chance each day that the game announces a print change.
    static let printChangeChance = 1.0 / 25
    static let printPendingMax = 2
    /// A set leaves print after this notice, in days.
    static let printNotice = 14...28
    static let printReprintNotice = 7...21
    /// The days of a reprint wave.
    static let printWaveDays = 42...90
    /// Sealed price moves: out of print, a reprint, and the end of a wave.
    static let printOutJump = 0.10...0.30
    static let printReprintJump = -0.30 ... -0.15
    static let printWaveEndJump = 0.05...0.15
    /// A price move takes this many days to reach its full size.
    static let printRampDays = 30.0
    /// At least this many sets stay in print.
    static let printMinInPrint = 8
}

/// The print status of every set, for the price reads. The game store syncs it with the market.
extension PriceCycle {
    /// A set is in print by default when it is from a current era (Scarlet & Violet or Mega Evolution).
    static func defaultInPrint(_ slug: String) -> Bool {
        guard let era = SetLibrary.info(slug)?.era else { return false }
        return Balance.modernEras.contains(era)
    }

    /// The changes of one set that happen on or before the day, oldest first.
    static func changes(_ slug: String, upTo day: Int) -> [PrintChange] {
        (printChanges[slug] ?? []).filter { $0.day <= day }
    }

    static func inPrint(_ slug: String, day: Int? = nil) -> Bool {
        changes(slug, upTo: day ?? today).last?.inPrint ?? defaultInPrint(slug)
    }

    /// The days in print and out of print from day 0 to the day, for a product with these sets. The product is in print
    /// only while every one of its sets is in print.
    static func printDays(_ slugs: Set<String>, day: Int) -> (inPrint: Double, outOfPrint: Double) {
        let turns = Set(slugs.flatMap { changes($0, upTo: day).map(\.day) }).filter { $0 > 0 }.sorted()
        var inDays = 0.0, outDays = 0.0
        var from = 0
        for to in turns + [day] where to > from {
            let span = Double(to - from)
            if slugs.allSatisfy({ inPrint($0, day: from) }) { inDays += span } else { outDays += span }
            from = to
        }
        return (inDays, outDays)
    }

    /// The sealed price moves from the print changes of a set. Each one ramps up over `printRampDays`.
    static func printJumps(_ slug: String, day: Int) -> Double {
        changes(slug, upTo: day).reduce(1.0) { factor, change in
            factor * (1 + change.jump * min(1, Double(day - change.day) / Balance.printRampDays))
        }
    }
}

extension Product {
    /// In print today: every set in the pack mix is in print.
    var isInPrint: Bool {
        Set(mix.map(\.slug)).allSatisfy { PriceCycle.inPrint($0) }
    }
}

@MainActor
extension GameStore {
    /// The sets in print today.
    var setsInPrint: [String] {
        SetLibrary.index.map(\.slug).filter { PriceCycle.inPrint($0) }
    }

    /// Announced changes that have not happened yet, and the changes of the last 4 weeks.
    var upcomingPrintChanges: [PrintChange] {
        data.printChanges.filter { $0.day > data.day && !$0.endsWave }.sorted { $0.day < $1.day }
    }

    var recentPrintChanges: [PrintChange] {
        data.printChanges.filter { $0.day <= data.day && $0.day > data.day - 28 }.sorted { $0.day > $1.day }
    }

    func printTitle(_ c: PrintChange) -> String {
        let name = SetLibrary.info(c.slug)?.name ?? c.slug
        if c.endsWave { return "The \(name) reprint wave ends. It is out of print again." }
        if c.inPrint { return "\(name) is reprinted. Its sealed product comes back to store shelves." }
        return "\(name) goes out of print. Stores sell what they have left."
    }

    /// Changes that happen today, and maybe a new announcement. Runs at End Day.
    func printEndDay() -> [String] {
        let day = data.day
        var lines: [String] = []
        for c in data.printChanges where c.day == day {
            lines.append("Print news: " + printTitle(c))
        }
        let pending = data.printChanges.filter { $0.day > day && !$0.endsWave }.count
        if pending < Balance.printPendingMax, Double.random(in: 0..<1) < Balance.printChangeChance, let line = announcePrintChange() {
            lines.append(line)
        }
        return lines
    }

    /// Announces a set that leaves print, or a reprint wave of an older set. Returns the line for the report.
    func announcePrintChange(reprint forced: Bool? = nil) -> String? {
        let day = data.day
        let busy = Set(data.printChanges.filter { $0.day > day }.map(\.slug))
        let reprint = forced ?? (Double.random(in: 0..<1) < 0.4)
        if !reprint {
            // The oldest sets in print leave first.
            let inPrint = setsInPrint.filter { !busy.contains($0) }
            guard inPrint.count > Balance.printMinInPrint else { return nil }
            let oldest = inPrint.sorted { (SetLibrary.info($0)?.release ?? "") < (SetLibrary.info($1)?.release ?? "") }.prefix(3)
            guard let slug = oldest.randomElement() else { return nil }
            let change = PrintChange(slug: slug, day: day + Int.random(in: Balance.printNotice), announcedDay: day, inPrint: false,
                                     jump: Double.random(in: Balance.printOutJump))
            data.printChanges.append(change)
            syncMarket()
            let name = SetLibrary.info(slug)?.name ?? slug
            return "Print news: \(name) goes out of print in \(change.day - day) days. After that, stores stop selling it, and its sealed prices climb."
        }
        // A reprint wave: an out-of-print set from Sun & Moon or later.
        let eras: Set<String> = ["sun-moon", "sword-shield", "scarlet-violet", "mega-evolution"]
        let retail = Set(SetLibrary.catalog.filter { $0.msrp != nil }.map(\.homeSlug))
        let candidates = SetLibrary.index.filter { set in
            eras.contains(set.era) && !PriceCycle.inPrint(set.slug) && !busy.contains(set.slug) && retail.contains(set.slug)
        }
        guard let set = candidates.randomElement() else { return nil }
        let start = day + Int.random(in: Balance.printReprintNotice)
        let end = start + Int.random(in: Balance.printWaveDays)
        data.printChanges.append(PrintChange(slug: set.slug, day: start, announcedDay: day, inPrint: true,
                                             jump: Double.random(in: Balance.printReprintJump)))
        data.printChanges.append(PrintChange(slug: set.slug, day: end, announcedDay: day, inPrint: false,
                                             jump: Double.random(in: Balance.printWaveEndJump), endsWave: true))
        syncMarket()
        return "Print news: \(set.name) gets a reprint wave in \(start - day) days. Its sealed product comes back to stores for some weeks, and its sealed prices fall."
    }
}
