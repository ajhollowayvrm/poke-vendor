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
    /// A reprint of some products of the set: their catalog IDs. Nil for the whole set. Only those products come back
    /// to stores, and the set stays out of print.
    var products: [String]? = nil
    /// The reprint wave that the change belongs to: the ID of its start. Nil in an old save, which uses the old rule.
    var waveID: UUID? = nil
    /// For the end of a wave: the days that the price takes to come back.
    var ramp: Double? = nil

    /// A change to the whole set's status. A product reprint does not change it.
    var isSetLevel: Bool { products == nil }
}

extension Balance {
    /// The chance each day that the game announces a print change.
    static let printChangeChance = 1.0 / 25
    static let printPendingMax = 2
    /// A set leaves print after this notice, in days.
    static let printNotice = 14...28
    static let printReprintNotice = 7...21
    /// The days of a reprint wave: some products of a set, or the whole set.
    static let printWaveDays = 60...180
    static let printProductWaveDays = 7...120
    /// The share of reprint waves that reprint the whole set. The rest reprint 1 to 3 kinds of product.
    static let printFullSetShare = 0.3
    /// Sealed price moves: out of print, and a reprint (docs/05-pricing-and-market.md, Reprints).
    static let printOutJump = 0.10...0.30
    static let printReprintJump = -0.35 ... -0.15
    /// Other products of a reprinted set fall this share of the reprinted products' fall.
    static let printReprintOtherShare = 0.3...0.5
    /// The set's singles fall up to this much in a reprint wave.
    static let printReprintSinglesMax = 0.10
    /// Half of a reprint's fall comes on the day of the news. The rest comes over these days.
    static let printReprintRampDays = 21.0
    /// After a wave ends, the fall comes back over these days.
    static let printRecoveryDays = 60.0...180.0
    /// An old save's end of a wave.
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

    /// The whole set is in print. A product reprint does not change it.
    static func inPrint(_ slug: String, day: Int? = nil) -> Bool {
        changes(slug, upTo: day ?? today).last(where: \.isSetLevel)?.inPrint ?? defaultInPrint(slug)
    }

    /// A product reprint wave of the set holds this product on the day.
    static func productReprinted(_ productID: String, slug: String, day: Int? = nil) -> Bool {
        let d = day ?? today
        let starts = (printChanges[slug] ?? []).filter { !$0.isSetLevel && !$0.endsWave && $0.day <= d && $0.products?.contains(productID) == true }
        return starts.contains { start in
            !(printChanges[slug] ?? []).contains { $0.endsWave && $0.waveID == start.id && $0.day <= d }
        }
    }

    /// The days out of print of one set, from day 0 to the day. A fast path for the card reads.
    static func outOfPrintDays(_ slug: String, day: Int) -> Double {
        if printChanges[slug] == nil { return defaultInPrint(slug) ? 0 : Double(max(0, day)) }
        return printDays([slug], day: day).outOfPrint
    }

    /// The days in print and out of print from day 0 to the day, for a product with these sets. The product is in print
    /// only while every one of its sets is in print.
    static func printDays(_ slugs: Set<String>, day: Int) -> (inPrint: Double, outOfPrint: Double) {
        // Most sets have no print change: the status from day 0 holds.
        if slugs.allSatisfy({ printChanges[$0] == nil }) {
            let span = Double(max(0, day))
            return slugs.allSatisfy { defaultInPrint($0) } ? (span, 0) : (0, span)
        }
        let turns = Set(slugs.flatMap { changes($0, upTo: day).filter(\.isSetLevel).map(\.day) }).filter { $0 > 0 }.sorted()
        var inDays = 0.0, outDays = 0.0
        var from = 0
        for to in turns + [day] where to > from {
            let span = Double(to - from)
            if slugs.allSatisfy({ inPrint($0, day: from) }) { inDays += span } else { outDays += span }
            from = to
        }
        return (inDays, outDays)
    }

    /// The sealed price moves from the print changes of a set, for one product.
    /// - Out of print: the rise ramps up over `printRampDays` from the day it happens.
    /// - A reprint: the fall starts on the day of the news, half at once and the rest over `printReprintRampDays`.
    ///   A reprinted product takes the whole fall. Another product of the set takes a share of it.
    /// - The end of a wave: the fall comes back over the wave's ramp.
    static func printJumps(_ slug: String, product: String, day: Int) -> Double {
        var factor = 1.0
        let all = printChanges[slug] ?? []
        for change in all {
            if let waveID = change.waveID {
                let start = change.endsWave ? all.first { $0.id == waveID } : change
                guard let start else { continue }
                let fall = start.jump * share(start, product: product)
                if change.endsWave {
                    guard day >= change.day else { continue }
                    let back = 1 / (1 + fall) - 1
                    factor *= 1 + back * min(1, Double(day - change.day) / (change.ramp ?? Balance.printRecoveryDays.lowerBound))
                } else {
                    guard day >= change.announcedDay else { continue }
                    factor *= 1 + fall * min(1, 0.5 + 0.5 * Double(day - change.announcedDay) / Balance.printReprintRampDays)
                }
            } else {
                // An out-of-print change, or a wave from an old save.
                guard change.day <= day else { continue }
                factor *= 1 + change.jump * min(1, Double(day - change.day) / Balance.printRampDays)
            }
        }
        return factor
    }

    /// The share of a reprint's fall that a product takes: all of it when reprinted, else a stable share.
    private static func share(_ start: PrintChange, product: String) -> Double {
        if start.products == nil || start.products?.contains(product) == true { return 1 }
        let range = Balance.printReprintOtherShare
        return range.lowerBound + unit(start.id.uuidString + product, salt: 9) * (range.upperBound - range.lowerBound)
    }

    /// A reprint wave of a set brings its singles down a little, from the news to the end of the wave and its ramp.
    static func singlesReprintFactor(_ slug: String, day: Int) -> Double {
        guard let all = printChanges[slug], !all.isEmpty else { return 1 }
        var factor = 1.0
        for start in all where start.waveID == start.id && !start.endsWave && day >= start.announcedDay {
            let fall = -Balance.printReprintSinglesMax * unit(start.id.uuidString, salt: 10)
            factor *= 1 + fall * min(1, 0.5 + 0.5 * Double(day - start.announcedDay) / Balance.printReprintRampDays)
            if let end = all.first(where: { $0.endsWave && $0.waveID == start.id }), day >= end.day {
                factor *= 1 + (1 / (1 + fall) - 1) * min(1, Double(day - end.day) / (end.ramp ?? Balance.printRecoveryDays.lowerBound))
            }
        }
        return factor
    }
}

extension Product {
    /// In print today: every set in the pack mix is in print, or a product reprint wave of its set holds it.
    var isInPrint: Bool {
        Set(mix.map(\.slug)).allSatisfy { PriceCycle.inPrint($0) } || PriceCycle.productReprinted(id, slug: homeSlug)
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

    /// The reprint radar: what the print runs and the flippers do to one sealed product. Read only: it changes no state and no price.
    /// It names a reprint wave now, an announced reprint or out-of-print notice, a dump now, and the chance of a dump.
    func reprintRadar(_ product: Product) -> [String] {
        let day = data.day
        let changes = data.printChanges.filter { $0.slug == product.homeSlug }
        var lines: [String] = []
        // The active wave: the latest start that no end has closed. A wave that names other products only dips this one.
        let ended = Set(changes.filter { $0.endsWave && $0.day <= day }.compactMap(\.waveID))
        let wave = changes.filter { $0.inPrint && !$0.endsWave && $0.day <= day && $0.waveID.map { !ended.contains($0) } == true }
            .max { $0.day < $1.day }
        if let wave {
            lines.append(wave.products?.contains(product.id) ?? true ? "In a reprint wave now. Stores restock it, and its price is down."
                                                                      : "Its set is in a reprint wave. This product dips a little.")
        }
        let upcoming = changes.filter { $0.day > day && !$0.endsWave }.min { $0.day < $1.day }
        if let c = upcoming {
            let days = c.day - day
            let when = "in \(days) day\(days == 1 ? "" : "s")"
            if c.inPrint {
                lines.append(c.products?.contains(product.id) ?? true ? "Reprint \(when)." : "A reprint of other products in its set starts \(when). This product dips a little.")
            } else {
                lines.append("Its set goes out of print \(when).")
            }
        }
        if let dump = data.marketEvents.first(where: { $0.kind == .flipperDump && $0.products?.contains(product.id) == true && $0.factor(day: day) != 1 }) {
            lines.append("Flippers are dumping it now: \(String(format: "%+.0f%%", (dump.factor(day: day) - 1) * 100)) so far.")
        }
        // A dump starts on the first day of a reprint, when the flippers are at or over the dump level.
        if let c = upcoming, c.inPrint, c.waveID == nil || c.waveID == c.id, product.isInPrint, product.isHot() {
            lines.append(data.flipperPressure >= Balance.dumpPressure ? "Flipper dump chance: high. Flippers are crowding the shelves."
                                                                       : "Flipper dump chance: low. Flippers are under the dump level.")
        }
        return lines
    }

    /// The products that the player holds with a radar line, by name.
    var radarEntries: [(product: Product, lines: [String])] {
        var seen: Set<String> = []
        var out: [(product: Product, lines: [String])] = []
        for item in data.sealed {
            guard let id = item.productID, seen.insert(id).inserted, let product = SetLibrary.product(id) else { continue }
            let lines = reprintRadar(product)
            if !lines.isEmpty { out.append((product, lines)) }
        }
        return out.sorted { $0.product.name < $1.product.name }
    }

    func printTitle(_ c: PrintChange) -> String {
        let name = SetLibrary.info(c.slug)?.name ?? c.slug
        let what = c.products.map { Self.reprintedText($0, set: name) }
        if c.endsWave { return "The \(what ?? name) reprint wave ends. \(what == nil ? "It is" : "They are") out of print again." }
        if c.inPrint { return what.map { "\($0) are reprinted. They come back to store shelves." } ?? "\(name) is reprinted. Its sealed product comes back to store shelves." }
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
        // A reprint wave: an out-of-print set from Sun & Moon or later. Most waves bring back 1 to 3 kinds of product.
        let eras: Set<String> = ["sun-moon", "sword-shield", "scarlet-violet", "mega-evolution"]
        let retail = Set(SetLibrary.catalog.filter { $0.msrp != nil }.map(\.homeSlug))
        let candidates = SetLibrary.index.filter { set in
            eras.contains(set.era) && !PriceCycle.inPrint(set.slug) && !busy.contains(set.slug) && retail.contains(set.slug)
        }
        guard let set = candidates.randomElement() else { return nil }
        let start = day + Int.random(in: Balance.printReprintNotice)
        var products: [String]? = nil
        if Double.random(in: 0..<1) >= Balance.printFullSetShare {
            // Retail products of the set, by kind. A wave picks 1 to 3 kinds.
            let sold = SetLibrary.catalog.filter { $0.homeSlug == set.slug && $0.msrp != nil && !$0.isStoreExclusive && $0.kind != "Booster pack" }
            let kinds = Array(Set(sold.map(\.kind))).shuffled().prefix(Int.random(in: 1...3))
            let ids = sold.filter { kinds.contains($0.kind) }.map(\.id)
            if !ids.isEmpty { products = ids }
        }
        let end = start + Int.random(in: products == nil ? Balance.printWaveDays : Balance.printProductWaveDays)
        let wave = PrintChange(slug: set.slug, day: start, announcedDay: day, inPrint: true,
                               jump: Double.random(in: Balance.printReprintJump), products: products)
        var startChange = wave
        startChange.waveID = wave.id
        data.printChanges.append(startChange)
        data.printChanges.append(PrintChange(slug: set.slug, day: end, announcedDay: day, inPrint: false, jump: 0, endsWave: true,
                                             products: products, waveID: wave.id, ramp: Double.random(in: Balance.printRecoveryDays)))
        syncMarket()
        if let products {
            let what = Self.reprintedText(products, set: set.name)
            return "Print news: \(what) get a reprint in \(start - day) days. They come back to stores for some weeks. Their prices fall now, and the rest of the set dips too."
        }
        return "Print news: \(set.name) gets a reprint wave in \(start - day) days. Its sealed product comes back to stores for some weeks, and its prices fall now."
    }

    /// The products of a reprint, by kind, for the news: for example "Evolving Skies Elite Trainer Boxes and tins".
    static func reprintedText(_ ids: [String], set: String) -> String {
        let kinds = Array(Set(ids.compactMap { SetLibrary.product($0)?.kind })).sorted()
        let names = kinds.map { kind -> String in
            switch kind {
            case "Elite Trainer Box": "Elite Trainer Boxes"
            case "Booster box": "booster boxes"
            case "Booster bundle": "booster bundles"
            case "Tin": "tins"
            case "Blister": "blisters"
            case "Collection": "collection boxes"
            case "Build & Battle": "Build & Battle boxes"
            default: "other products"
            }
        }
        let list = names.count <= 1 ? (names.first ?? "products") : names.dropLast().joined(separator: ", ") + " and " + (names.last ?? "")
        return "\(set) \(list)"
    }
}
