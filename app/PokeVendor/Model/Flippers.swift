import Foundation

// Flipper pressure, the flipper dump, scalper heat, the MSRP step, and the winter scale (docs/proposals/sealed-product,
// Part A sections 2.1, 2.2, 2.4, 3.4, and 3.5).

extension Balance {
    /// Flipper pressure: the range, the news and daily inputs, and the pull back toward the start value.
    static let pressureRange = 0.1...0.9
    static let pressureHypeNews = 0.15
    static let pressureBoomDaily = 0.002
    static let pressureHoliday = 0.10
    static let pressureReprint = -0.25
    static let pressureCorrectionDaily = -0.003
    static let pressurePostHoliday = -0.10
    static let pressurePull = 0.01
    /// The days of pressure history that the shelf drain reads.
    static let pressureLogDays = 8
    /// The report says something only when the pressure moves this much in a day.
    static let pressureNewsStep = 0.1
    /// Camp success is multiplied by `campPressureBase - campPressureSlope * pressure`.
    static let campPressureBase = 1.2
    static let campPressureSlope = 0.6
    /// The cut of the online sale chance of hot in-print sealed at the highest pressure.
    static let flipperSaleCut = 0.20

    /// The flipper dump: the pressure that starts it, the drop, the days of the fall and of the recovery, the cap on
    /// reprint and dump together, and the number of sets that a correction hits.
    static let dumpPressure = 0.6
    static let dumpDrop = 0.10...0.20
    static let dumpFallDays = 14...28
    static let dumpRecoveryDays = 120
    static let flipperDumpCap = 0.45
    static let dumpCorrectionSets = 2

    /// Scalper heat. A buy at the limit adds `heatLimitHit`. A buyout adds `heatLimitBuy`. Heat at one chain that
    /// reaches `storeBanHeat` gets the player refused there for `storeBanDays`.
    static let heatLimitBuy = 1.0
    static let heatLimitHit = 1.5
    static let heatRepeatVisit = 2.0
    static let heatBotUse = 3.0
    static let heatKeep = 0.95
    static let heatHintLow = 0.6
    static let heatHintHigh = 0.85
    static let storeBanHeat = 10.0
    static let storeBanDays = 21
    static let heatAfterBan = 0.5

    /// The MSRP step: the daily chance after the earliest day, and the days of notice.
    static let msrpStepChance = 1.0 / 300
    static let msrpStepEarliestDay = 90
    static let msrpStepNotice = 28

    /// The after-holiday dip is deeper when the pressure is at or above this value on its first day.
    static let winterSellOffPressure = 0.6
    static let winterSellOffScale = 1.5
}

@MainActor
extension GameStore {
    /// End Day for the flipper market: dumps, pressure, strictness, heat, the MSRP step, and the winter scale.
    /// Returns the report lines. Ends with `syncMarket()`, because dumps and the step move prices.
    func flippersEndDay() -> [String] {
        let today = data.day
        let ended = today - 1
        let before = data.flipperPressure
        var lines: [String] = []

        // 1. Winter scale, from yesterday's pressure.
        lines += lockWinterScale(day: today, pressure: before)

        // 2. Flipper dump. It reads the pressure before today's inputs.
        let reprintsToday = data.printChanges.filter {
            $0.inPrint && !$0.endsWave && $0.day == today && ($0.waveID == nil || $0.waveID == $0.id)
        }
        let correctionStarts = PriceCycle.regimes.contains { $0.kind == .correction && $0.start == today && $0.start > 0 }
        if before >= Balance.dumpPressure {
            for change in reprintsToday { if let line = startDump(slugs: [change.slug], day: today) { lines.append(line) } }
            if correctionStarts, let line = startDump(slugs: dumpSetsForCorrection(), day: today) { lines.append(line) }
        }

        // 3. Pressure inputs.
        var p = before
        var seen = data.retail.seenEvents
        for e in data.marketEvents where (e.kind == .sealedHype || e.kind == .characterSellOut) && !seen.contains(e.id) {
            p += Balance.pressureHypeNews
            seen.append(e.id)
        }
        let live = Set(data.marketEvents.map(\.id))
        seen = seen.filter { live.contains($0) }
        switch PriceCycle.regime(day: today)?.kind {
        case .boom: p += Balance.pressureBoomDaily
        case .correction: p += Balance.pressureCorrectionDaily
        default: break
        }
        let seasonNow = PriceCycle.seasonName(day: today), seasonBefore = PriceCycle.seasonName(day: ended)
        if seasonNow != seasonBefore {
            if seasonNow == "Holiday season" { p += Balance.pressureHoliday }
            if seasonNow == "After the holidays" { p += Balance.pressurePostHoliday }
        }
        p += Balance.pressureReprint * Double(reprintsToday.count)
        p += (Balance.pressureStart - p) * Balance.pressurePull
        p = min(Balance.pressureRange.upperBound, max(Balance.pressureRange.lowerBound, p))
        data.flipperPressure = p
        var retail = data.retail
        retail.seenEvents = seen
        retail.pressureLog[today] = p
        data.retail = retail
        if abs(p - before) >= Balance.pressureNewsStep { lines.append(Self.pressureLine(rising: p > before)) }

        // 4. Strictness incidents on yesterday's vendor visits.
        lines += strictnessEndDay(endedDay: ended, pressure: p)

        // 5. Heat decay, boost decay, and ban ends.
        lines += heatEndDay(day: today)

        // 6. The MSRP step.
        lines += msrpEndDay(day: today)

        syncMarket()
        return lines
    }

    static func pressureLine(rising: Bool) -> String {
        rising ? "Flippers are crowding the shelves. Hot product sells out faster."
               : "Flippers are pulling back. Shelves stay stocked longer."
    }

    /// Camp success is multiplied by this: 1.14 at pressure 0.1, 0.9 at 0.5, 0.66 at 0.9.
    var flipperCampFactor: Double { Balance.campPressureBase - Balance.campPressureSlope * data.flipperPressure }

    /// Flippers list the same hot in-print product online. The sale chance falls by up to 20% at pressure 0.9.
    func flipperSaleFactor(_ productID: String?, channel: Listing.Channel) -> Double {
        guard [.ebay, .ebayAuction, .tcgplayer].contains(channel), let p = SetLibrary.product(productID),
              p.isInPrint, p.isHot() else { return 1 }
        let range = Balance.pressureRange
        return 1 - Balance.flipperSaleCut * max(0, data.flipperPressure - range.lowerBound) / (range.upperBound - range.lowerBound)
    }

    // MARK: - Dump

    /// Starts a dump on the hot in-print products of these sets. Returns the report line, or nil.
    func startDump(slugs: [String], day: Int) -> String? {
        let ids = SetLibrary.catalog.filter { slugs.contains($0.homeSlug) && $0.isInPrint && $0.isHot() }.map(\.id)
        guard !ids.isEmpty else { return nil }
        let fall = Int.random(in: Balance.dumpFallDays)
        let names = slugs.map { SetLibrary.info($0)?.name ?? $0 }.joined(separator: " and ")
        var event = MarketEvent(kind: .flipperDump, subject: slugs.first ?? "",
                                title: "Flippers are dumping \(names) stock. Its hot sealed products fall for some weeks.",
                                startDay: day, days: fall + Balance.dumpRecoveryDays, peak: -Double.random(in: Balance.dumpDrop))
        event.products = ids
        event.fallDays = fall
        data.marketEvents.append(event)
        return "Market news: \(event.title)"
    }

    /// A correction hits the sets with the most hot in-print products. A tie sorts by slug, so the pick is stable.
    func dumpSetsForCorrection() -> [String] {
        let hot = SetLibrary.catalog.filter { $0.isInPrint && $0.isHot() }
        let counts = Dictionary(grouping: hot, by: \.homeSlug).mapValues(\.count)
        return counts.sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }
            .prefix(Balance.dumpCorrectionSets).map(\.key)
    }

    // MARK: - Heat

    /// Adds heat for a shady retail act, and records the act with its own weight (D-2). `store` nil is a bot act
    /// online: global heat only. `storeBanHeat` at one chain gets the player refused there for `storeBanDays`.
    func addHeat(_ amount: Double, at store: LocalStore?, act: HiddenActKind?, weight: Double = 0, witnesses: Int = 0, note: String = "") {
        data.scalperHeat += amount
        // A hot buy at the limit adds heat with no act (revision 3). Every other source records its act.
        if let act { recordHiddenAct(act, weight: weight, note: note, witnesses: witnesses) }
        guard let store else { return }
        let key = store.rawValue
        let today = data.day
        let heat = (data.retail.storeHeat[key] ?? 0) + amount
        guard heat >= Balance.storeBanHeat else {
            data.retail.storeHeat[key] = heat
            // Heat hints at 60% and 85% of the ban level, once a day each.
            let step = heat >= Balance.storeBanHeat * Balance.heatHintHigh ? 2 : heat >= Balance.storeBanHeat * Balance.heatHintLow ? 1 : 0
            if step > (data.retail.heatHintShown[key] ?? 0) {
                data.retail.heatHintShown[key] = step
                retailNotice = heatHint(store)
            }
            return
        }
        let until = today + Balance.storeBanDays
        data.retail.storeHeat[key] = heat * Balance.heatAfterBan
        data.retail.bannedUntil[key] = until
        let text = "\(key) staff know your face now. They refuse to sell you cards until \(GameCalendar.date(until).text)."
        retailNotice = text
        log(text)
        recordHiddenAct(.storeBan, weight: 1.5, note: "Refused card sales at \(key)", witnesses: 3)
    }

    /// What a flip on eBay nets: the market price, less the cost, the eBay fee, and the shipping.
    func flipMargin(market: Double, cost: Double) -> Double {
        let c = saleCosts(price: market, channel: .ebay, sealed: true, insured: false)
        return market - cost - c.fees - c.shipping
    }

    /// The hint at a chain, from its heat. The number stays hidden.
    func heatHint(_ store: LocalStore) -> String? {
        let heat = data.retail.storeHeat[store.rawValue] ?? 0
        if heat >= Balance.storeBanHeat * Balance.heatHintHigh {
            return "The \(store.rawValue) staff watch you at the card aisle. One more push and they stop selling to you."
        }
        if heat >= Balance.storeBanHeat * Balance.heatHintLow {
            return "The \(store.rawValue) cashier looks at your cart, then at you."
        }
        return nil
    }

    private func heatEndDay(day: Int) -> [String] {
        data.scalperHeat *= Balance.heatKeep
        var retail = data.retail
        retail.storeHeat = retail.storeHeat.mapValues { $0 * Balance.heatKeep }.filter { $0.value >= 0.1 }
        retail.incidentBoost = retail.incidentBoost.mapValues { $0 * Balance.incidentBoostKeep }.filter { $0.value >= 0.001 }
        let ended = retail.bannedUntil.filter { $0.value < day }.map(\.key)
        for key in ended { retail.bannedUntil[key] = nil }
        data.retail = retail
        return ended.sorted().map { "\($0) sells you cards again." }
    }

    // MARK: - MSRP step and winter scale

    private func msrpEndDay(day: Int) -> [String] {
        if let step = data.retail.msrpStepDay {
            return step == day ? ["Market news: The 12.5% MSRP rise is in effect. Stores charge more for in-print sealed from today."] : []
        }
        guard day >= Balance.msrpStepEarliestDay, Double.random(in: 0..<1) < Balance.msrpStepChance else { return [] }
        data.retail.msrpStepDay = day + Balance.msrpStepNotice
        return ["Market news: The Pokemon Company raises the price of in-print sealed product by 12.5% in \(Balance.msrpStepNotice) days. Stock you buy before then costs less."]
    }

    /// Locks the size of the winter dip. On its first day: x1.5 (-15%) at pressure 0.6 or more, else x1. On any later
    /// day of a dip with no lock (a run that starts inside the dip, or an old save): x1, the old rule, so no price
    /// jumps.
    private func lockWinterScale(day: Int, pressure: Double) -> [String] {
        let bump = Balance.seasonWinterSealedPrice
        let w = PriceCycle.weekOfYear(day: day)
        guard bump.value(week: w) != 0 else { return [] }
        let key = PriceCycle.winterKey(day: day, week: w)
        guard data.retail.winterScales[key] == nil else { return [] }
        let firstDay = bump.value(week: PriceCycle.weekOfYear(day: day - 1)) == 0
        let deep = firstDay && pressure >= Balance.winterSellOffPressure
        data.retail.winterScales[key] = deep ? Balance.winterSellOffScale : 1
        return deep ? ["Market news: Flippers sit on too much holiday stock. The after-holiday sealed dip is deeper this year."] : []
    }
}
