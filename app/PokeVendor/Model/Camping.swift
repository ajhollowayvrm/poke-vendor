import Foundation

// Camping a store restock (docs/12-acquiring-product.md, Camp a store drop).

/// A restock day at one big store.
struct Restock: Identifiable, Hashable {
    let store: LocalStore
    let day: Int

    var id: String { "\(store.rawValue)-\(day)" }
}

/// What the player got from a camp: the shelf to buy from, or nothing.
struct CampHaul: Identifiable {
    let id = UUID()
    let store: LocalStore
    let items: [ShelfItem]

    var success: Bool { !items.isEmpty }
}

extension Balance {
    static let campHours = 6.0
    static let campStart = 8.0
    /// The chance to get product at the door. Each hour late keeps 75% of it.
    static let campSuccess = 0.6
    /// A restock day at each big store about every 2 weeks.
    static let restockCycleDays = 14
    /// Posted this many days ahead, at most.
    static let restockNotice = 3
    static let campProducts = 2...4
    static let campQuantity = 2...6
}

@MainActor
extension GameStore {
    /// The restock day of a store in one 14-day cycle: a weekday, the same every time.
    func restockDay(_ store: LocalStore, cycle: Int) -> Int {
        var r = SeededRandom(seed: UInt64(cycle + 1) &* 29_411 &+ UInt64(LocalStore.allCases.firstIndex(of: store) ?? 0) &* 977)
        return cycle * Balance.restockCycleDays + r.int(0...1) * 7 + r.int(0...4)
    }

    /// The restocks posted now: today, and up to 3 days ahead.
    var postedRestocks: [Restock] {
        var out: [Restock] = []
        let cycle = data.day / Balance.restockCycleDays
        for store in LocalStore.allCases where !store.isGameShop {
            for c in [cycle, cycle + 1] {
                let d = restockDay(store, cycle: c)
                if d >= data.day, d - data.day <= Balance.restockNotice { out.append(Restock(store: store, day: d)) }
            }
        }
        return out.sorted { $0.day < $1.day }
    }

    var restocksToday: [Restock] { postedRestocks.filter { $0.day == data.day } }

    func restockEntries(day: Int) -> [CalendarEntry] {
        LocalStore.allCases.filter { !$0.isGameShop }.compactMap { store in
            let d = restockDay(store, cycle: day / Balance.restockCycleDays)
            guard d == day, d - data.day <= Balance.restockNotice else { return nil }
            return CalendarEntry(kind: .restock, title: "\(store.rawValue) restock", detail: "Doors at \(GameStore.clock(Balance.campStart)) · camp for \(formatHours(Balance.campHours))")
        }
    }

    func campedToday(_ store: LocalStore) -> Bool { data.campedDays.contains("\(store.rawValue)-\(data.day)") }

    /// Why the player cannot camp now, or nil.
    func campBlock(_ store: LocalStore) -> String? {
        if campedToday(store) { return "Done for today" }
        guard let start = slot(for: Balance.campHours) else { return "Not enough time today" }
        if start > Balance.campStart + 3 { return worksToday ? "You work today · call in sick or book time off" : "Too late · the line formed at \(GameStore.clock(Balance.campStart))" }
        return nil
    }

    /// Camps the restock. It takes 6 hours. On a bust the store sold out before the player got in.
    func camp(_ store: LocalStore) -> CampHaul? {
        guard campBlock(store) == nil, let start = slot(for: Balance.campHours) else { return nil }
        let arrive = max(start, Balance.campStart)
        data.hour = arrive + Balance.campHours
        data.campedDays.append("\(store.rawValue)-\(data.day)")
        data.campedDays.removeAll { !$0.hasSuffix("-\(data.day)") }
        let late = max(0, arrive - Balance.campStart)
        let chance = Balance.campSuccess * pow(Balance.arrivalKeep, late) + restockBotBonus
        guard Double.random(in: 0..<1) < chance else {
            log("Camped the \(store.rawValue) restock for \(formatHours(Balance.campHours)). It sold out before you got in.")
            save()
            return CampHaul(store: store, items: [])
        }
        var r = SeededRandom(seed: UInt64(data.day + 1) &* 7_727 &+ UInt64(LocalStore.allCases.firstIndex(of: store) ?? 0))
        let kinds = ["Elite Trainer Box", "Booster bundle", "Collection", "Tin", "Booster box", "Blister"]
        let options = SetLibrary.catalog.filter { ($0.inPrint ?? true) && kinds.contains($0.kind) && $0.msrp != nil && !$0.isStoreExclusive }
        var items: [ShelfItem] = []
        for i in 0..<r.int(Balance.campProducts) where !options.isEmpty {
            let p = options[r.int(0...(options.count - 1))]
            if items.contains(where: { $0.product.id == p.id }) { continue }
            items.append(ShelfItem(id: "camp-\(data.day)-\(store.rawValue)-\(i)", product: p, price: p.msrp ?? p.market,
                                   quantity: r.int(Balance.campQuantity)))
        }
        log("Camped the \(store.rawValue) restock for \(formatHours(Balance.campHours)). You got in: \(items.count) product\(items.count == 1 ? "" : "s") at MSRP.")
        save()
        return CampHaul(store: store, items: items)
    }

    /// Test tool: a restock at this store today, with the clock at the doors.
    func testRestockToday(_ store: LocalStore) {
        data.testRestocks.append("\(store.rawValue)-\(data.day)")
        data.campedDays.removeAll { $0 == "\(store.rawValue)-\(data.day)" }
        if data.hour > Balance.campStart { data.hour = Balance.dayStart }
        if worksToday { callInSick() }
        save()
    }

    /// Today's restocks, the test ones included.
    var restocksNow: [Restock] {
        var out = restocksToday
        for key in data.testRestocks where key.hasSuffix("-\(data.day)") {
            if let store = LocalStore.allCases.first(where: { key == "\($0.rawValue)-\(data.day)" }), !out.contains(where: { $0.store == store }) {
                out.append(Restock(store: store, day: data.day))
            }
        }
        return out
    }
}
