import Foundation

// The moving market (docs/05-pricing-and-market.md, The moving market). The set files keep the real prices. A factor
// for each day moves them when the game reads them, so a graded ladder keeps its order and a save stays small.

/// One piece of market news. It moves the prices for some weeks, then fades.
struct MarketEvent: Codable, Identifiable, Hashable {
    enum Kind: String, Codable {
        /// A card name gets attention, for example after a big streamer pull.
        case hype
        /// A reprint brings a card name down.
        case reprint
        /// A set gets attention. Its sealed product rises.
        case sealedHype
        /// A new product for a character is announced. Its cards rise.
        case characterProduct
        /// The character's products sell out at stores. Sealed product with the character in its name rises.
        case characterSellOut
    }

    /// True when the event moves card prices. The other kinds move sealed prices.
    var movesCards: Bool { kind == .hype || kind == .reprint || kind == .characterProduct }

    var id = UUID()
    let kind: Kind
    /// The text inside a card name, or a set slug for `sealedHype`.
    let subject: String
    let title: String
    let startDay: Int
    let days: Int
    /// The change at the top of the event, for example 0.4 for +40%.
    let peak: Double

    /// A fast move for the first fifth of the event, then a slow fade.
    func factor(day: Int) -> Double {
        let t = Double(day - startDay) / Double(max(days, 1))
        guard t >= 0, t < 1 else { return 1 }
        return 1 + peak * (t < 0.2 ? t / 0.2 : (1 - t) / 0.8)
    }
}

extension Balance {
    static let marketEventChance = 0.06
    static let marketEventsMax = 3
    static let marketHype = 0.25...0.70
    /// Old saves can hold a card-name reprint event. The game makes no new ones: a reprint is for a set (Model/PrintRuns.swift).
    static let marketReprint = -0.35 ... -0.15
    static let marketSealedHype = 0.20...0.50
    static let marketCharacterProduct = 0.10...0.30
    static let marketCharacterSellOut = 0.20...0.50
    static let marketFactorRange = 0.3...6.0
    /// The short wave of the whole market. Booms and corrections make the long moves (`MarketRegime`).
    static let marketFastDays = 97.0
    static let marketFastSize = 0.07
    /// Sealed product follows this share of a boom, and this share of a correction. Out-of-print sealed held in the
    /// 2021 to 2023 correction (docs/05-pricing-and-market.md, The moving market).
    static let sealedBoomReach = 0.6
    static let sealedCorrectionReach = 0.2
    /// Sealed product gains this much each year while in print.
    static let sealedGrowthInPrint = 0.0...0.02
    /// A card of this price or more gains value by era while its set is out of print.
    static let cardGrowthMin = 25.0
    /// The daily steps of a price pull back to the real price with this half-life, in days.
    static let stepHalfLife = 120.0
    /// A walk starts at 0 on this day, so the first day of a run shows the real prices.
    static let stepOrigin = 0
    /// The biggest single step, as a log change.
    static let stepCap = 0.4
}

/// One period of the whole market (docs/05-pricing-and-market.md, Booms and corrections).
struct MarketRegime: Hashable {
    enum Kind: Hashable {
        case flat, boom, correction

        /// The End Day line when the regime starts.
        var news: String {
            switch self {
            case .flat: "The card market has settled. Prices hold steady for now."
            case .boom: "The card market is heating up. New collectors are buying, and prices climb."
            case .correction: "The card market is cooling off. Sellers outnumber buyers, and prices slide."
            }
        }

        var label: String {
            switch self {
            case .flat: "Steady"
            case .boom: "Boom"
            case .correction: "Correction"
            }
        }
    }

    let kind: Kind
    let start: Int
    let days: Int
    /// The total log change over the regime.
    let move: Double

    var end: Int { start + days }
}

/// The price rules by era and by price tier.
extension Balance {
    /// Card growth a year by era, while the set is out of print. Scarlet & Violet and Mega Evolution use the Sun & Moon
    /// rate once they leave print.
    static func cardGrowth(era: String) -> ClosedRange<Double> {
        switch era {
        case "wizards-of-the-coast", "e-card": 0.08...0.15
        case "ex", "diamond-pearl-platinum", "heartgold-soulsilver", "black-white", "xy": 0.04...0.12
        default: 0.02...0.10
        }
    }

    /// Sealed growth a year by era, while out of print.
    static func sealedGrowthOutOfPrint(era: String) -> ClosedRange<Double> {
        switch era {
        case "wizards-of-the-coast", "e-card": 0.10...0.15
        default: 0.15...0.25
        }
    }
}

/// The daily step rule of a price tier (docs/05-pricing-and-market.md, Daily steps).
struct StepTier {
    /// The chance of a step on one day.
    let chance: Double
    /// The median size of a step, as a log change.
    let median: Double
    /// The log spread of the size: the 90th percentile over the median is e^(1.2816 × spread).
    let spread: Double

    init(chance: Double, median: Double, p90: Double) {
        self.chance = chance
        self.median = median
        spread = log(p90 / median) / 1.2816
    }

    /// The chances come from 64 days of TCGplayer prices. The sizes are tamed so that a month moves a price about
    /// 7% (sealed) to 16% (cheap cards), as the monthly PriceCharting series do.
    static let low = StepTier(chance: 0.30, median: 0.03, p90: 0.08)
    static let mid = StepTier(chance: 0.25, median: 0.01, p90: 0.04)
    static let high = StepTier(chance: 0.15, median: 0.01, p90: 0.06)
    static let top = StepTier(chance: 0.10, median: 0.015, p90: 0.06)
    static let sealed = StepTier(chance: 0.20, median: 0.006, p90: 0.03)

    /// The tier of a card by its real price. Nil for a card under $1: it stays flat.
    static func card(_ base: Double) -> StepTier? {
        switch base {
        case ..<1: nil
        case ..<5: .low
        case ..<50: .mid
        case ..<500: .high
        default: .top
        }
    }
}

/// The market state of the current run. The game store sets it, and each price read uses it.
enum PriceCycle {
    nonisolated(unsafe) private(set) static var seed: UInt64 = 0
    nonisolated(unsafe) private(set) static var today = 0
    nonisolated(unsafe) private static var events: [MarketEvent] = []
    nonisolated(unsafe) private static var boosts: Set<String> = []
    /// The print changes of each set, oldest first (Model/PrintRuns.swift).
    nonisolated(unsafe) private(set) static var printChanges: [String: [PrintChange]] = [:]
    /// The booms and corrections of the run, from day 0 on. The seed makes them, so a save keeps none.
    nonisolated(unsafe) private(set) static var regimes: [MarketRegime] = []
    /// The walk value of each key on every 64th day from the origin (`walk`), and the last value read.
    nonisolated(unsafe) private static var checkpoints: [UInt64: [Double]] = [:]
    nonisolated(unsafe) private static var walkCache: [UInt64: (day: Int, value: Double)] = [:]
    static let checkpointDays = 16
    /// Today's values that every card read uses: the regime log and the short wave. `sync` sets them.
    nonisolated(unsafe) private static var todayRegimeLog = 0.0
    nonisolated(unsafe) private static var todayFastWave = 0.0
    /// The log move at the start of each regime, so a read finds a day's move with no loop over all regimes.
    nonisolated(unsafe) private static var regimeBase: [Double] = []

    static func sync(seed: UInt64, day: Int, events: [MarketEvent], boosts: Set<String>, printChanges: [PrintChange] = []) {
        if seed != self.seed || regimes.isEmpty {
            walkCache = [:]
            checkpoints = [:]
            self.seed = seed
            regimes = makeRegimes(seed: seed)
            var total = 0.0
            regimeBase = regimes.map { r in
                defer { total += r.move }
                return total
            }
        }
        self.seed = seed
        today = day
        self.events = events
        self.boosts = boosts
        self.printChanges = Dictionary(grouping: printChanges.sorted { $0.day < $1.day }, by: \.slug)
        todayRegimeLog = regimeLog(day)
        todayFastWave = wave(day, period: Balance.marketFastDays, phase: unit("fast"))
    }

    /// A stable number from 0 to 1 for a text. The same run always gives the same number.
    static func unit(_ text: String, salt: UInt64 = 0) -> Double {
        unit(hash(text), salt: salt)
    }

    /// A stable 64-bit hash of texts in a row. It equals the hash of the joined text. The run's seed mixes in later
    /// (`unit`), so a print can keep its key (`CardPrint.priceKey`).
    static func hash(_ parts: String...) -> UInt64 {
        var h: UInt64 = 14_695_981_039_346_656_037
        for part in parts {
            for byte in part.utf8 {
                h ^= UInt64(byte)
                h = h &* 1_099_511_628_211
            }
        }
        return h
    }

    /// A stable number from 0 to 1 for a hash and a salt. The same run always gives the same number.
    static func unit(_ key: UInt64, salt: UInt64) -> Double {
        var h = (key ^ seed) &+ salt &* 0x9E37_79B9_7F4A_7C15
        h ^= h >> 30
        h = h &* 0xBF58_476D_1CE4_E5B9
        h ^= h >> 27
        h = h &* 0x94D0_49BB_1331_11EB
        h ^= h >> 31
        return Double(h >> 11) / Double(1 << 53)
    }

    private static func wave(_ day: Int, period: Double, phase: Double) -> Double {
        sin(2 * .pi * (Double(day) / period + phase))
    }

    // MARK: Booms and corrections

    /// The regimes from day 0 to about 15 years on. A run starts steady.
    static func makeRegimes(seed: UInt64) -> [MarketRegime] {
        var rng = SeededRandom(seed: seed ^ 0xA5A5_5A5A_1234_5678)
        func roll(_ range: ClosedRange<Double>) -> Double { range.lowerBound + Double(rng.next()) * (range.upperBound - range.lowerBound) }
        var out: [MarketRegime] = []
        var kind = MarketRegime.Kind.flat
        var day = 0
        while day < 5_500 {
            let days: Int
            let move: Double
            switch kind {
            case .flat:
                days = Int(roll(120...360))
                move = roll(-0.03...0.03) * Double(days) / 364
            case .boom:
                days = Int(roll(120...300))
                move = log(1 + roll(0.30...0.80))
            case .correction:
                days = Int(roll(180...360))
                move = log(1 - roll(0.15...0.35))
            }
            out.append(MarketRegime(kind: kind, start: day, days: days, move: move))
            day += days
            let r = roll(0...1)
            switch kind {
            case .flat: kind = r < 0.5 ? .boom : r < 0.8 ? .correction : .flat
            case .boom: kind = r < 0.6 ? .correction : .flat
            case .correction: kind = r < 0.7 ? .flat : .boom
            }
        }
        return out
    }

    /// The regime on a day.
    static func regime(day: Int? = nil) -> MarketRegime? {
        let d = max(0, day ?? today)
        return regimes.last { $0.start <= d }
    }

    /// The log move of the regimes up to a day. `up` and `down` scale the rises and the falls.
    private static func regimeLog(_ d: Int, up: Double = 1, down: Double = 1) -> Double {
        guard d > 0 else { return 0 }
        if up == 1, down == 1, let i = regimes.lastIndex(where: { $0.start < d }), regimeBase.count == regimes.count {
            let r = regimes[i]
            let t = min(1, Double(d - r.start) / Double(max(r.days, 1)))
            return regimeBase[i] + r.move * t * t * (3 - 2 * t)
        }
        var total = 0.0
        for r in regimes {
            if r.start >= d { break }
            // An S-curve inside the regime: slow at the start and the end.
            let t = min(1, Double(d - r.start) / Double(max(r.days, 1)))
            let shaped = t * t * (3 - 2 * t)
            total += r.move * shaped * (r.move >= 0 ? up : down)
        }
        return total
    }

    /// The whole market on a day. 1 is the real price.
    static func index(day: Int? = nil) -> Double {
        let d = day ?? today
        return exp(regimeLog(d)) * (1 + Balance.marketFastSize * wave(d, period: Balance.marketFastDays, phase: unit("fast")))
    }

    /// The market for sealed product: it follows more of a boom than of a correction.
    static func sealedIndex(day: Int? = nil) -> Double {
        let d = day ?? today
        return exp(regimeLog(d, up: Balance.sealedBoomReach, down: Balance.sealedCorrectionReach))
            * (1 + Balance.marketFastSize * 0.5 * wave(d, period: Balance.marketFastDays, phase: unit("fast")))
    }

    // MARK: Daily steps

    /// The step on one day: most days none, sometimes a small move, now and then a big one.
    private static func step(_ key: UInt64, day: Int, tier: StepTier) -> Double {
        let salt = UInt64(bitPattern: Int64(day)) &* 0x2545_F491_4F6C_DD1D
        guard unit(key, salt: salt) < tier.chance else { return 0 }
        // A normal number from two uniforms (Box-Muller), for the size. The sign is a coin.
        let u1 = max(1e-12, unit(key, salt: salt &+ 1))
        let u2 = unit(key, salt: salt &+ 2)
        let z = sqrt(-2 * log(u1)) * cos(2 * .pi * u2)
        let size = min(Balance.stepCap, tier.median * exp(tier.spread * z))
        return unit(key, salt: salt &+ 3) < 0.5 ? -size : size
    }

    /// The sum of the daily steps of a price up to a day, as a log change. Each day keeps most of yesterday's walk
    /// (the half-life pulls it back to the real price). The sum always runs day by day from the origin, so every read
    /// of a day gives the same value. Checkpoints every 16 days keep a read short.
    static func walk(_ key: UInt64, tier: StepTier, day: Int) -> Double {
        if let c = walkCache[key], c.day == day { return c.value }
        let origin = Balance.stepOrigin
        guard day > origin else { return start(key, tier: tier) }
        let keep = pow(0.5, 1 / Balance.stepHalfLife)
        let index = (day - origin) / checkpointDays
        var value: Double
        if let points = checkpoints[key], points.count > index {
            value = points[index]
        } else {
            var points = checkpoints[key] ?? [start(key, tier: tier)]
            while points.count <= index {
                var v = points[points.count - 1]
                let from = origin + checkpointDays * (points.count - 1)
                for d in (from + 1)...(from + checkpointDays) { v = keep * v + step(key, day: d, tier: tier) }
                points.append(v)
            }
            checkpoints[key] = points
            value = points[index]
        }
        let from = origin + checkpointDays * index
        if day > from {
            for d in (from + 1)...day { value = keep * value + step(key, day: d, tier: tier) }
        }
        if day == today { walkCache[key] = (day, value) }
        return value
    }

    /// The walk on its first day: 0, the real price.
    private static func start(_ key: UInt64, tier: StepTier) -> Double { 0 }

    /// A walk summed from the origin with no cache, for the tests.
    static func walkCold(_ key: UInt64, tier: StepTier, day: Int) -> Double {
        let keep = pow(0.5, 1 / Balance.stepHalfLife)
        var value = start(key, tier: tier)
        guard day > Balance.stepOrigin else { return value }
        for d in (Balance.stepOrigin + 1)...day { value = keep * value + step(key, day: d, tier: tier) }
        return value
    }

    /// A card's growth by era: a card of $25 or more gains value each year that its set is out of print.
    static func ageGrowth(_ key: UInt64, slug: String?, base: Double, day: Int) -> Double {
        guard base >= Balance.cardGrowthMin, let slug, let era = SetLibrary.info(slug)?.era else { return 1 }
        let range = Balance.cardGrowth(era: era)
        let growth = range.lowerBound + unit(key, salt: 3) * (range.upperBound - range.lowerBound)
        return pow(1 + growth, outOfPrintDays(slug, day: day) / 364)
    }

    private static func clamp(_ x: Double) -> Double {
        min(Balance.marketFactorRange.upperBound, max(Balance.marketFactorRange.lowerBound, x))
    }

    // MARK: Factors

    /// The factor for a card. A card under $1 stays flat. A dearer card follows the market, takes daily steps, has
    /// its own slow wave, and gains value by era while its set is out of print. A reprint of its set brings it down a
    /// little.
    static func cardFactor(name: String, num: String, variant: String, base: Double, slug: String? = nil, key known: UInt64? = nil,
                           day: Int? = nil) -> Double {
        let d = day ?? today
        var factor = 1.0
        if let tier = StepTier.card(base) {
            let key = known ?? hash(name, num, variant, slug ?? "")
            let reach = min(1.2, max(0.3, log10(base) / 2 + 0.1))
            let isToday = d == today
            factor *= exp((isToday ? todayRegimeLog : regimeLog(d)) * reach)
            factor *= 1 + Balance.marketFastSize * reach * (isToday ? todayFastWave : wave(d, period: Balance.marketFastDays, phase: unit("fast")))
            factor *= 1 + 0.1 * reach * wave(d, period: 60 + unit(key, salt: 1) * 180, phase: unit(key, salt: 2))
            factor *= exp(walk(key, tier: tier, day: d))
            factor *= ageGrowth(key, slug: slug, base: base, day: d)
            if let slug, printChanges[slug] != nil { factor *= singlesReprintFactor(slug, day: d) }
        }
        for event in events where event.movesCards && name.contains(event.subject) {
            factor *= event.factor(day: d)
        }
        if d == today, boosts.contains(name) { factor *= Balance.priceBoostFactor }
        return clamp(factor)
    }

    /// The factor for sealed product. It follows the sealed market, takes daily steps, gains value with age by era
    /// (much faster out of print), moves with the print changes and reprints of its set, moves with the season
    /// (Model/Seasons.swift), and moves with set news and character news.
    static func sealedFactor(id: String, slug: String, slugs: Set<String>, name: String, day: Int? = nil) -> Double {
        let d = day ?? today
        let key = hash("sealed", id)
        let r = unit(key, salt: 4)
        func growth(_ range: ClosedRange<Double>) -> Double { range.lowerBound + r * (range.upperBound - range.lowerBound) }
        let days = printDays(slugs, day: d)
        let era = SetLibrary.info(slug)?.era ?? ""
        var factor = sealedIndex(day: d)
            * exp(walk(key, tier: .sealed, day: d))
            * pow(1 + growth(Balance.sealedGrowthInPrint), days.inPrint / 364)
            * pow(1 + growth(Balance.sealedGrowthOutOfPrint(era: era)), days.outOfPrint / 364)
            * printJumps(slug, product: id, day: d)
            * seasonSealedPrice(day: d)
        for event in events {
            switch event.kind {
            case .sealedHype where event.subject == slug: factor *= event.factor(day: d)
            case .characterSellOut where name.contains(event.subject): factor *= event.factor(day: d)
            default: break
            }
        }
        return clamp(factor)
    }

    static func price(_ base: Double, _ factor: Double) -> Double {
        max(base > 0 ? 0.01 : 0, (base * factor * 100).rounded() / 100)
    }
}

extension CardPrint {
    func marketFactor(day: Int? = nil) -> Double {
        PriceCycle.cardFactor(name: name, num: num, variant: variant, base: baseMarket ?? 0, slug: setSlug, key: priceKey, day: day)
    }

    /// The change in this card's price over the last days. 0.1 is +10%.
    func trend(days: Int = 28) -> Double {
        marketFactor() / marketFactor(day: PriceCycle.today - days) - 1
    }
}

extension Product {
    func marketFactor(day: Int? = nil) -> Double {
        PriceCycle.sealedFactor(id: id, slug: homeSlug, slugs: Set(mix.map(\.slug)), name: name, day: day)
    }
}

@MainActor
extension GameStore {
    /// Sends today's market state to the prices. Call it after a change to the day, the events, or the boosts.
    func syncMarket() {
        let day = data.day
        let boosts = Set(data.priceBoosts.filter { $0.value >= day }.keys)
        PriceCycle.sync(seed: data.marketSeed, day: day, events: data.marketEvents, boosts: boosts, printChanges: data.printChanges)
        GameCalendar.sync(startOffset: calendarStartOffset)
    }

    var activeMarketEvents: [MarketEvent] {
        let day = data.day
        return data.marketEvents.filter { $0.factor(day: day) != 1 }
    }

    /// The change in the whole market over the last 4 weeks.
    var marketChange: Double { PriceCycle.index() / PriceCycle.index(day: data.day - 28) - 1 }

    /// The text inside a card name that an event moves: the name with no card-type word.
    private static func species(_ name: String) -> String {
        let drop: Set<String> = ["ex", "EX", "GX", "V", "VMAX", "VSTAR", "Mega", "M", "Dark", "Light", "Radiant", "Shining", "Team", "Rocket's", "δ", "LV.X", "BREAK", "Prime", "Star", "Lillie's", "N's", "Iono's"]
        let words = name.split(separator: " ").map(String.init).filter { !drop.contains($0) }
        return words.first ?? name
    }

    /// Ends old news and may bring new news. Runs at End Day, and returns the lines for the report.
    func marketEndDay() -> [String] {
        let day = data.day
        data.marketEvents.removeAll { day - $0.startDay >= $0.days }
        var lines: [String] = []
        if data.marketEvents.count < Balance.marketEventsMax, Double.random(in: 0..<1) < Balance.marketEventChance,
           var event = rollMarketEvent() {
            // The price tracker sees the chatter first: the news comes days before the prices move.
            if hasUpgrade(.priceTracker) {
                event = MarketEvent(kind: event.kind, subject: event.subject, title: event.title, startDay: event.startDay + Balance.priceTrackerLead,
                                    days: event.days, peak: event.peak)
                lines.append("Price tracker: \(event.title) Prices start to move in \(Balance.priceTrackerLead) days.")
            } else {
                lines.append("Market news: \(event.title)")
            }
            data.marketEvents.append(event)
        }
        // A boom or a correction starts. The price tracker sees it 7 days early.
        let lead = hasUpgrade(.priceTracker) ? Balance.priceTrackerLead : 0
        if let r = PriceCycle.regimes.first(where: { $0.start == day + 1 + lead && $0.start > 0 }) {
            lines.append(lead > 0 ? "Price tracker: \(r.kind.news) It starts in \(lead + 1) days." : "Market news: \(r.kind.news)")
        }
        if day % 28 == 0 {
            syncMarket()
            let change = marketChange
            lines.append("The card market is \(change >= 0 ? "up" : "down") \(Int((abs(change) * 100).rounded()))% over the last 4 weeks.")
        }
        syncMarket()
        if let season = seasonEndDayLine() { lines.append(season) }
        return lines
    }

    private func rollMarketEvent() -> MarketEvent? {
        let day = data.day
        // A reprint is for a set or its products, so it comes from the print runs (Model/PrintRuns.swift), not from here.
        let kind: MarketEvent.Kind = [.hype, .hype, .sealedHype, .characterProduct, .characterSellOut].randomElement() ?? .hype
        let slugs = Balance.modernSets + Balance.olderSets
        guard let slug = slugs.randomElement() else { return nil }
        if kind == .sealedHype {
            let name = SetLibrary.info(slug)?.name ?? slug
            return MarketEvent(kind: kind, subject: slug, title: "Collectors are chasing sealed \(name). Its sealed prices rise for some weeks.",
                               startDay: day, days: Int.random(in: 21...45), peak: Double.random(in: Balance.marketSealedHype))
        }
        guard let print = SetLibrary.set(slug).prints.filter({ ($0.baseMarket ?? 0) >= 10 }).randomElement() else { return nil }
        let subject = Self.species(print.name)
        guard !data.marketEvents.contains(where: { $0.subject == subject }) else { return nil }
        if kind == .characterProduct {
            return MarketEvent(kind: kind, subject: subject, title: "A new \(subject) collection is announced. \(subject) cards rise for some weeks.",
                               startDay: day, days: Int.random(in: 21...42), peak: Double.random(in: Balance.marketCharacterProduct))
        }
        if kind == .characterSellOut {
            // Only a character with sealed product in its name can sell out.
            guard SetLibrary.catalog.contains(where: { $0.name.contains(subject) }) else { return nil }
            return MarketEvent(kind: kind, subject: subject,
                               title: "Stores sold out of \(subject) products. Sealed product with \(subject) in its name rises for some weeks.",
                               startDay: day, days: Int.random(in: 28...56), peak: Double.random(in: Balance.marketCharacterSellOut))
        }
        return MarketEvent(kind: kind, subject: subject, title: "A big streamer pulled a \(subject). \(subject) cards rise for some weeks.",
                           startDay: day, days: Int.random(in: 14...35), peak: Double.random(in: Balance.marketHype))
    }
}
