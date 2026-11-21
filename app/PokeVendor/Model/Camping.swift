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
    /// The big store. Nil for an official card machine.
    let store: LocalStore?
    var machine: OfficialMachine? = nil
    let items: [ShelfItem]
    /// Who stood in line, when a rival did. For the camp screen.
    var rivalLine: String? = nil

    var success: Bool { !items.isEmpty }
    var place: String { store?.rawValue ?? machine?.rawValue.lowercased() ?? "the store" }
}

/// An official Pokemon card machine in a store. It posts a restock like a big store.
enum OfficialMachine: String, CaseIterable, Codable, Hashable {
    case grocery = "Grocery store card machine", pharmacy = "Pharmacy card machine"
}

/// A restock of an official card machine. It is not saved.
struct MachineRestock: Identifiable, Hashable {
    let machine: OfficialMachine
    let day: Int
    let hour: Double

    var id: String { "\(machine.rawValue)-\(day)" }
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
    /// An official card machine restocks about every 10 days. The restock is posted 2 days ahead. The player waits
    /// 2 hours and gets 1 to 3 products at MSRP, at most 2 of each.
    static let machineCycleDays = 10
    static let machineNotice = 2
    /// With the machine map app, a machine restock is posted this many days ahead.
    static let machineMapNotice = 4
    static let machineCampHours = 2.0
    static let machineSuccess = 0.7
    static let machineLimit = 2
    static let machineProducts = 1...3
    static let machineHours = 10...16
    static let machineKinds = ["Booster pack", "Booster bundle", "Elite Trainer Box", "Tin", "Blister"]
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
        for store in LocalStore.allCases where store.isBigStore {
            for c in [cycle, cycle + 1] {
                let d = restockDay(store, cycle: c)
                if d >= data.day, d - data.day <= Balance.restockNotice { out.append(Restock(store: store, day: d)) }
            }
        }
        return out.sorted { $0.day < $1.day }
    }

    var restocksToday: [Restock] { postedRestocks.filter { $0.day == data.day } }

    func restockEntries(day: Int) -> [CalendarEntry] {
        var out = LocalStore.allCases.filter(\.isBigStore).compactMap { store -> CalendarEntry? in
            let d = restockDay(store, cycle: day / Balance.restockCycleDays)
            guard d == day, d - data.day <= Balance.restockNotice else { return nil }
            return CalendarEntry(kind: .restock, title: "\(store.rawValue) restock", detail: "Doors at \(GameStore.clock(Balance.campStart)) · camp for \(formatHours(Balance.campHours))")
        }
        for m in OfficialMachine.allCases {
            let r = machineRestockDay(m, cycle: day / Balance.machineCycleDays)
            guard r.day == day, r.day - data.day <= machineNoticeDays else { continue }
            out.append(CalendarEntry(kind: .restock, title: "\(m.rawValue) restock",
                                     detail: "About \(GameStore.clock(r.hour)) · wait \(formatHours(Balance.machineCampHours)) · limit \(Balance.machineLimit)"))
        }
        // The vendor days that a restock alert covers: today and tomorrow.
        if day == data.day || day == data.day + 1 {
            for store in alertedStores where vendorSlot(store).weekday == day % 7 {
                out.append(CalendarEntry(kind: .restock, title: "\(store.rawValue) vendor stock",
                                         detail: "About \(GameStore.clock(vendorSlot(store).hour)) · from your alert"))
            }
        }
        return out
    }

    func campedToday(_ store: LocalStore) -> Bool { data.campedDays.contains("\(store.rawValue)-\(data.day)") }

    /// Why the player cannot camp now, or nil.
    func campBlock(_ store: LocalStore) -> String? {
        if isBanned(store) {
            return "Staff refuse you card sales until \(GameCalendar.date(data.retail.bannedUntil[store.rawValue] ?? data.day).text)"
        }
        if let until = strictness(store).closedUntil, until >= data.day { return "\(store.rawValue) stopped in-store card sales" }
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
        let suffix = "-\(data.day)"
        data.campedDays.append("\(store.rawValue)\(suffix)")
        data.campedDays.removeAll { !$0.hasSuffix(suffix) }
        // A camp is a visit. It has no batch shelf, so it writes no rival lines.
        self.arrive(at: store, hour: arrive, lines: false)
        let late = max(0, arrive - Balance.campStart)
        let chance = (Balance.campSuccess * pow(Balance.arrivalKeep, late) + restockBotBonus) * flipperCampFactor
        let ok = Double.random(in: 0..<1) < chance
        let met = campRivalLine(store, success: ok)
        guard ok else {
            log("Camped the \(store.rawValue) restock for \(formatHours(Balance.campHours)). It sold out before you got in.\(met.map { " " + $0.line } ?? "")")
            if let met {
                rememberRival(met.rival.id, .rivalTookShelf, note: met.line, byPlayer: false)
                noteShelfReceipt(met.rival.id, note: "\(met.rival.name) cleared the \(store.rawValue) restock")
            }
            save()
            return CampHaul(store: store, items: [], rivalLine: met?.line)
        }
        var r = SeededRandom(seed: UInt64(data.day + 1) &* 7_727 &+ UInt64(LocalStore.allCases.firstIndex(of: store) ?? 0))
        let kinds = ["Elite Trainer Box", "Booster bundle", "Collection", "Tin", "Booster box", "Blister"]
        let options = SetLibrary.catalog.filter { $0.isInPrint && kinds.contains($0.kind) && $0.msrp != nil && !$0.isStoreExclusive }
        var items: [ShelfItem] = []
        for i in 0..<r.int(Balance.campProducts) where !options.isEmpty {
            let p = options[r.int(0...(options.count - 1))]
            if items.contains(where: { $0.product.id == p.id }) { continue }
            let hot = p.isHot()
            if hot && limitRule(store).hotByDrawing { continue }
            let qty = min(r.int(Balance.campQuantity), campCap(store, hot: hot))
            items.append(ShelfItem(id: "camp-\(data.day)-\(store.rawValue)-\(i)", product: p, price: p.retailMSRP() ?? p.market,
                                   quantity: qty, hot: hot))
        }
        log("Camped the \(store.rawValue) restock for \(formatHours(Balance.campHours)). You got in: \(items.count) product\(items.count == 1 ? "" : "s") at MSRP.")
        if let met {
            rememberRival(met.rival.id, .playerBeatInLine, note: met.line, byPlayer: true, hostility: Balance.rivalBeatInLineHostility)
        }
        save()
        return CampHaul(store: store, items: items, rivalLine: met?.line)
    }

    // MARK: - Official card machines

    /// The restock day and hour of a machine in one 10-day cycle: the same every time.
    func machineRestockDay(_ m: OfficialMachine, cycle: Int) -> (day: Int, hour: Double) {
        var r = SeededRandom(seed: UInt64(cycle + 1) &* 52_711 &+ UInt64(OfficialMachine.allCases.firstIndex(of: m) ?? 0) &* 1_433)
        let day = cycle * Balance.machineCycleDays + r.int(0...(Balance.machineCycleDays - 1))
        return (day, Double(r.int(Balance.machineHours)))
    }

    /// The days ahead that a machine restock is posted: more with the machine map app.
    var machineNoticeDays: Int { hasUpgrade(.machineMap) ? Balance.machineMapNotice : Balance.machineNotice }

    /// The machine restocks that are posted now: today, and up to 2 days ahead (4 with the machine map app).
    var postedMachineRestocks: [MachineRestock] {
        let cycle = data.day / Balance.machineCycleDays
        var out: [MachineRestock] = []
        for m in OfficialMachine.allCases {
            for c in [cycle, cycle + 1] {
                let r = machineRestockDay(m, cycle: c)
                if r.day >= data.day, r.day - data.day <= machineNoticeDays {
                    out.append(MachineRestock(machine: m, day: r.day, hour: r.hour))
                }
            }
        }
        return out.sorted { $0.day < $1.day }
    }

    var machineRestocksNow: [MachineRestock] { postedMachineRestocks.filter { $0.day == data.day } }

    /// The hour that the wait starts: the player's time, or an hour before the restock if that is later.
    private func machineArrival(_ r: MachineRestock) -> Double { max(data.hour, r.hour - 1) }

    /// Why the player cannot wait at this machine now, or nil.
    func machineCampBlock(_ r: MachineRestock) -> String? {
        if data.campedDays.contains(r.id) { return "Done for today" }
        let arrive = machineArrival(r)
        // The wait cannot overlap the work shift. A store camp has the same rule.
        if worksToday && arrive < Balance.workEnd && arrive + Balance.machineCampHours > Balance.workStart {
            return "You work today · call in sick or book time off"
        }
        if arrive + Balance.machineCampHours > Balance.lateNightLimit { return "Not enough time today" }
        if arrive > r.hour + 2 { return "Too late · the machine sold out" }
        return nil
    }

    /// Waits at a machine restock for 2 hours. On a success, 1 to 3 products at MSRP, at most 2 of each.
    func campMachine(_ restock: MachineRestock) -> CampHaul? {
        guard machineCampBlock(restock) == nil else { return nil }
        let arrive = machineArrival(restock)
        data.hour = arrive + Balance.machineCampHours
        let id = restock.id
        // A machine key and a store key both end with the day. Read the day into a local before the prune.
        let suffix = "-\(data.day)"
        data.campedDays.append(id)
        data.campedDays.removeAll { !$0.hasSuffix(suffix) }
        let late = max(0, arrive - (restock.hour - 1))
        let chance = Balance.machineSuccess * pow(Balance.arrivalKeep, late) * flipperCampFactor
        guard Double.random(in: 0..<1) < chance else {
            log("Waited \(formatHours(Balance.machineCampHours)) at the \(restock.machine.rawValue.lowercased()). It sold out before your turn.")
            save()
            return CampHaul(store: nil, machine: restock.machine, items: [])
        }
        var r = SeededRandom(seed: UInt64(data.day + 1) &* 6_173 &+ UInt64(OfficialMachine.allCases.firstIndex(of: restock.machine) ?? 0))
        let options = SetLibrary.catalog.filter { $0.isInPrint && Balance.machineKinds.contains($0.kind) && $0.msrp != nil && !$0.isStoreExclusive }
        var items: [ShelfItem] = []
        for i in 0..<r.int(Balance.machineProducts) where !options.isEmpty {
            let p = options[r.int(0...(options.count - 1))]
            if items.contains(where: { $0.product.id == p.id }) { continue }
            items.append(ShelfItem(id: "machine-\(id)-\(i)", product: p, price: p.retailMSRP() ?? p.market,
                                   quantity: min(Balance.machineLimit, r.int(1...4)), hot: p.isHot()))
        }
        log("Waited \(formatHours(Balance.machineCampHours)) at the \(restock.machine.rawValue.lowercased()). You got \(items.count) product\(items.count == 1 ? "" : "s") at MSRP.")
        save()
        return CampHaul(store: nil, machine: restock.machine, items: items)
    }

    /// Buys from a machine haul: cash only, no heat. The machine sets the limit.
    @discardableResult
    func buyMachineItem(_ item: ShelfItem, machine: OfficialMachine) -> Bool {
        guard shelfLeft(item) > 0, canAfford(item.price) else { return false }
        let today = data.day
        addLedger(-item.price, .sealed, "\(item.product.name) · card machine")
        data.shelfBought[item.id, default: 0] += 1
        data.sealed.append(SealedItem(setSlug: item.product.homeSlug, name: item.product.name, packs: item.product.packs,
                                      paid: item.price, acquired: .now, source: "Bought at a card machine",
                                      productID: item.product.id, acquiredDay: today))
        log("Bought \(item.product.name) at the \(machine.rawValue.lowercased()) for \(money(item.price)).", cash: -item.price)
        save()
        return true
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
