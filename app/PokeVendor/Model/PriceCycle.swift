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
    static let marketReprint = -0.35 ... -0.15
    static let marketSealedHype = 0.20...0.50
    static let marketCharacterProduct = 0.10...0.30
    static let marketCharacterSellOut = 0.20...0.50
    static let marketFactorRange = 0.4...3.0
    /// The slow wave and the shorter wave of the whole market.
    static let marketSlowDays = 420.0
    static let marketSlowSize = 0.18
    static let marketFastDays = 97.0
    static let marketFastSize = 0.07
    /// Sealed product gains this much each year after it leaves print, and this much while in print.
    static let sealedGrowthOutOfPrint = 0.05...0.15
    static let sealedGrowthInPrint = 0.0...0.03
    /// A card of $25 or more gains this much each year.
    static let cardGrowth = 0.0...0.08
}

/// The market state of the current run. The game store sets it, and each price read uses it.
enum PriceCycle {
    nonisolated(unsafe) private(set) static var seed: UInt64 = 0
    nonisolated(unsafe) private(set) static var today = 0
    nonisolated(unsafe) private static var events: [MarketEvent] = []
    nonisolated(unsafe) private static var boosts: Set<String> = []
    /// The print changes of each set, oldest first (Model/PrintRuns.swift).
    nonisolated(unsafe) private(set) static var printChanges: [String: [PrintChange]] = [:]

    static func sync(seed: UInt64, day: Int, events: [MarketEvent], boosts: Set<String>, printChanges: [PrintChange] = []) {
        self.seed = seed
        today = day
        self.events = events
        self.boosts = boosts
        self.printChanges = Dictionary(grouping: printChanges.sorted { $0.day < $1.day }, by: \.slug)
    }

    /// A stable number from 0 to 1 for a text. The same run always gives the same number.
    private static func unit(_ text: String, salt: UInt64 = 0) -> Double {
        var h: UInt64 = 14_695_981_039_346_656_037 ^ (seed &+ salt)
        for byte in text.utf8 {
            h ^= UInt64(byte)
            h = h &* 1_099_511_628_211
        }
        h ^= h >> 29
        h = h &* 0xBF58_476D_1CE4_E5B9
        h ^= h >> 32
        return Double(h >> 11) / Double(1 << 53)
    }

    private static func wave(_ day: Int, period: Double, phase: Double) -> Double {
        sin(2 * .pi * (Double(day) / period + phase))
    }

    /// The whole market on a day. 1 is the real price.
    static func index(day: Int? = nil) -> Double {
        let d = day ?? today
        return 1 + Balance.marketSlowSize * wave(d, period: Balance.marketSlowDays, phase: unit("slow"))
            + Balance.marketFastSize * wave(d, period: Balance.marketFastDays, phase: unit("fast"))
    }

    private static func clamp(_ x: Double) -> Double {
        min(Balance.marketFactorRange.upperBound, max(Balance.marketFactorRange.lowerBound, x))
    }

    /// The factor for a card. A bulk card stays flat. A dear card follows the market and its own wave.
    static func cardFactor(name: String, num: String, variant: String, base: Double, day: Int? = nil) -> Double {
        let d = day ?? today
        var factor = 1.0
        if base >= 1 {
            let key = name + num + variant
            let reach = min(1, log10(base) / 2 + 0.1)
            factor += (index(day: d) - 1) * reach
            let size = 0.2 * reach
            factor *= 1 + size * wave(d, period: 60 + unit(key, salt: 1) * 180, phase: unit(key, salt: 2))
            if base >= 25 {
                let growth = Balance.cardGrowth.lowerBound + unit(key, salt: 3) * (Balance.cardGrowth.upperBound - Balance.cardGrowth.lowerBound)
                factor *= pow(1 + growth, Double(d) / 364)
            }
        }
        for event in events where event.movesCards && name.contains(event.subject) {
            factor *= event.factor(day: d)
        }
        if d == today, boosts.contains(name) { factor *= Balance.priceBoostFactor }
        return clamp(factor)
    }

    /// The factor for sealed product. It follows the market, gains value with age (faster out of print), moves with
    /// each print change of its set, moves with the season (Model/Seasons.swift), and moves with set news and
    /// character news.
    static func sealedFactor(id: String, slug: String, slugs: Set<String>, name: String, day: Int? = nil) -> Double {
        let d = day ?? today
        let r = unit(id, salt: 4)
        func growth(_ range: ClosedRange<Double>) -> Double { range.lowerBound + r * (range.upperBound - range.lowerBound) }
        let days = printDays(slugs, day: d)
        var factor = (1 + (index(day: d) - 1) * 0.6)
            * pow(1 + growth(Balance.sealedGrowthInPrint), days.inPrint / 364)
            * pow(1 + growth(Balance.sealedGrowthOutOfPrint), days.outOfPrint / 364)
            * printJumps(slug, day: d)
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
        PriceCycle.cardFactor(name: name, num: num, variant: variant, base: baseMarket ?? 0, day: day)
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
           let event = rollMarketEvent() {
            data.marketEvents.append(event)
            lines.append("Market news: \(event.title)")
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
        let kind: MarketEvent.Kind = [.hype, .hype, .reprint, .sealedHype, .characterProduct, .characterSellOut].randomElement() ?? .hype
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
        if kind == .reprint {
            return MarketEvent(kind: kind, subject: subject, title: "A reprint of \(subject) is coming. \(subject) cards fall for some weeks.",
                               startDay: day, days: Int.random(in: 30...70), peak: Double.random(in: Balance.marketReprint))
        }
        return MarketEvent(kind: kind, subject: subject, title: "A big streamer pulled a \(subject). \(subject) cards rise for some weeks.",
                           startDay: day, days: Int.random(in: 14...35), peak: Double.random(in: Balance.marketHype))
    }
}
