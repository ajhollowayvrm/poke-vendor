import Foundation

#if DEBUG
/// The retail tuning run (docs/proposals/sealed-product, Part A 7.2). Plays real End Days with a scripted player and
/// prints one line a week. Later phases add more columns through `extraColumns`.
@MainActor
final class RetailSim {
    private let store: GameStore
    private let flipper: Bool
    private var lastCampWindow = -1
    /// Columns that later phases add: Part B's hot fill rate (phase 4) and Part C's callouts (phase 6).
    var extraColumns: [(name: String, value: () -> String)] = []

    private struct Week {
        var shelfUnits = 0, campUnits = 0, onlineUnits = 0, dumps = 0, incidents = 0, bans = 0
        var fillOneHour: [Double] = [], fillAfterWork: [Double] = [], hotShare: [Double] = []
    }

    init(store: GameStore, flipper: Bool) {
        self.store = store
        self.flipper = flipper
    }

    func run(days: Int) {
        let start = Date()
        store.startRun()
        store.addTestCash(1_000_000)                     // rent never ends the run
        if flipper {
            store.data.jobIndex = nil
            store.data.upgrades.append(Upgrade.restockBot.rawValue)
            store.data.upgrades.append(Upgrade.checkoutBot.rawValue)
            _ = store.joinClub()
            store.subscribeAlerts(.allChains, store: nil)
        }
        print("RETAILSIM day p strict heat(g/max) bans units(shelf/camp/online) fill(1h/17h) hot dumps incidents "
              + extraColumns.map(\.name).joined(separator: " "))
        var week = Week(), total = Week()
        var pressures: [Double] = []
        for _ in 0..<days {
            measureBatches(&week)
            // A ban starts during the day, so it is in the log and not in the morning report. Count the new ones here.
            let banned = store.data.retail.bannedUntil
            if flipper { playFlipper(&week) } else { playHonest(&week) }
            week.bans += store.data.retail.bannedUntil.filter { banned[$0.key] != $0.value }.count
            store.report = nil
            if store.data.lateHours > 0 { store.chooseMorning(sleepIn: false) }
            store.endDay()
            pressures.append(store.data.flipperPressure)
            let lines = store.report?.lines ?? []
            week.dumps += lines.filter { $0.contains("dumping") }.count
            week.incidents += lines.filter { $0.contains("tightens its card limits") }.count
            if store.day % 7 == 0 { printWeek(week); add(week, to: &total); week = Week() }
        }
        let years = Double(days) / 364
        print(String(format: "RETAILSIM END days=%d shelf/wk=%.2f camp/wk=%.2f online/wk=%.2f bans/yr=%.2f incidents/yr=%.1f dumps/yr=%.1f ms=%d",
                     days, Double(total.shelfUnits) / Double(days) * 7, Double(total.campUnits) / Double(days) * 7,
                     Double(total.onlineUnits) / Double(days) * 7, Double(total.bans) / years,
                     Double(total.incidents) / years, Double(total.dumps) / years, Int(Date().timeIntervalSince(start) * 1000)))
        // The pressure bands, and the days at a clamp: the pressure must not stick at one.
        let range = Balance.pressureRange
        func share(_ test: (Double) -> Bool) -> Double { Double(pressures.filter(test).count) / Double(max(1, pressures.count)) * 100 }
        print(String(format: "RETAILSIM PRESSURE mean=%.2f few=%.0f%% busy=%.0f%% swarming=%.0f%% atLow=%.1f%% atHigh=%.1f%%",
                     pressures.reduce(0, +) / Double(max(1, pressures.count)), share { $0 < 0.35 }, share { $0 >= 0.35 && $0 <= 0.65 },
                     share { $0 > 0.65 }, share { $0 <= range.lowerBound + 0.001 }, share { $0 >= range.upperBound - 0.001 }))
        fflush(stdout)
    }

    /// On each chain's vendor day: the share of hot units left 1 hour after the vendor, and at 17:00.
    private func measureBatches(_ w: inout Week) {
        for s in LocalStore.allCases where !s.isGameShop {
            let slot = store.vendorSlot(s)
            guard store.day % 7 == slot.weekday else { continue }
            func share(_ hour: Double) -> Double? {
                let hot = store.shelf(at: s, hour: hour).filter(\.hot)
                let all = hot.reduce(0) { $0 + $1.batchQuantity }
                return all > 0 ? Double(hot.reduce(0) { $0 + $1.quantity }) / Double(all) : nil
            }
            if let a = share(slot.hour + 1) { w.fillOneHour.append(a) }
            if slot.hour < 17, let b = share(17) { w.fillAfterWork.append(b) }
            let batch = Market.batch(s, vendorDay: store.day, seed: store.data.marketSeed)
            if !batch.isEmpty { w.hotShare.append(Double(batch.filter(\.hot).count) / Double(batch.count)) }
        }
    }

    /// Honest: a store run to two chains after work on weekdays and three on Saturday, one unit of each hot item.
    /// Camps the first posted restock in each 28-day window, calling in sick when it falls on a work day, and then
    /// runs the stores the same day. It also plays the online lines: the drawing, the Pokemon Center, and Target.com.
    private func playHonest(_ w: inout Week) {
        if store.day / 28 != lastCampWindow, let restock = store.restocksNow.first {
            lastCampWindow = store.day / 28
            if store.worksToday { store.callInSick() }
            if store.campBlock(restock.store) == nil, let haul = store.camp(restock.store) {
                for item in haul.items { while store.buyShelf(item, at: restock.store, credit: false) { w.campUnits += 1 } }
            }
        }
        let chains = LocalStore.allCases.filter(\.isBigStore)
        let count = store.weekday == 5 ? 3 : store.weekday < 5 ? 2 : 0
        let stops = (0..<count).map { chains[(store.day + $0) % chains.count] }
        // After work on a weekday, mid-morning on Saturday.
        store.data.hour = max(store.data.hour, store.weekday == 5 ? 10 : 17)
        if !stops.isEmpty { w.shelfUnits += runStops(stops, perItem: 1) }
        onlineCommon(&w, bot: false)
    }

    /// Flipper: each vendor stop at its vendor hour, every unit the limit allows, a repeat visit 1 hour later at
    /// Walmart and Barnes & Noble, every posted camp, and the bot on every online drop.
    private func playFlipper(_ w: inout Week) {
        let due = LocalStore.allCases.filter { !$0.isGameShop && store.vendorSlot($0).weekday == store.weekday }
            .sorted { store.vendorSlot($0).hour < store.vendorSlot($1).hour }
        for s in due {
            store.data.hour = max(store.data.hour, store.vendorSlot(s).hour)
            w.shelfUnits += runStops([s], perItem: 99)
            if s == .walmart || s == .barnes {
                store.data.hour += 1
                w.shelfUnits += runStops([s], perItem: 99)
            }
        }
        onlineCommon(&w, bot: true)
        w.campUnits += campAll()
    }

    /// The online lines of both players: enters the Walmart drawing and the level 3 chain drawings, claims every win,
    /// tries each Pokemon Center drop, and tries each Target.com drop. The flipper uses the checkout bot.
    private func onlineCommon(_ w: inout Week, bot: Bool) {
        if let offer = store.walmartDrawing { store.enterDrawing(offer) }
        for offer in store.chainDrawings { store.enterDrawing(offer) }
        for win in store.data.retail.drawingWins where store.claimDrawingWin(win.id) { w.onlineUnits += 1 }
        if store.isPokemonCenterDropLive, let o = Market.offers(for: .pokemonCenter, day: store.day).first,
           store.attemptDrop(o, bot: bot) { w.onlineUnits += 1 }
        if let o = store.targetDrop(day: store.day) {
            for _ in 0..<Balance.targetBotAttempts where store.targetAttemptsLeft > 0 && !store.data.boughtToday.contains(o.id) {
                if store.attemptTargetDrop(o, bot: bot) { w.onlineUnits += 1 } else if !bot { break }
            }
        }
    }

    /// One store run through the real API. Returns the units bought.
    private func runStops(_ stops: [LocalStore], perItem: Int) -> Int {
        guard let start = store.startStoreRun(stops) else { return 0 }
        var bought = 0
        for (k, s) in stops.enumerated() {
            let arrival = start + Double(k) * store.storeStopHours
            if k > 0 { store.arrive(at: s, hour: arrival) }
            for item in store.shelf(at: s, hour: arrival) where item.hot || !flipper {
                var n = 0
                while n < perItem, store.limitLeft(item, at: s) > 0, store.shelfLeft(item) > 0,
                      store.buyShelf(item, at: s, credit: false) { n += 1 }
                bought += n
            }
        }
        return bought
    }

    private func campAll() -> Int {
        var n = 0
        for r in store.restocksNow where store.campBlock(r.store) == nil {
            guard let haul = store.camp(r.store) else { continue }
            for item in haul.items { while store.buyShelf(item, at: r.store, credit: false) { n += 1 } }
        }
        return n
    }

    private func printWeek(_ w: Week) {
        func mean(_ a: [Double]) -> String { a.isEmpty ? "-" : String(format: "%.2f", a.reduce(0, +) / Double(a.count)) }
        let strict = LocalStore.allCases.filter { !$0.isGameShop }.map { "\(store.strictness($0).level)" }.joined()
        let maxHeat = store.data.retail.storeHeat.values.max() ?? 0
        print(String(format: "RETAILSIM %d %.2f %@ %.1f/%.1f %d %d/%d/%d %@/%@ %@ %d %d ",
                     store.day, store.data.flipperPressure, strict, store.data.scalperHeat, maxHeat, w.bans,
                     w.shelfUnits, w.campUnits, w.onlineUnits, mean(w.fillOneHour), mean(w.fillAfterWork), mean(w.hotShare),
                     w.dumps, w.incidents) + extraColumns.map { $0.value() }.joined(separator: " "))
    }

    private func add(_ w: Week, to t: inout Week) {
        t.shelfUnits += w.shelfUnits; t.campUnits += w.campUnits; t.onlineUnits += w.onlineUnits
        t.dumps += w.dumps; t.incidents += w.incidents; t.bans += w.bans
    }
}
#endif
