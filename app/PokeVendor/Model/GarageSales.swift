import Foundation

// Garage sales and estate sales (docs/17-calendar-and-events.md, Posted entries; docs/12-acquiring-product.md).

enum SaleKind: String, Codable, Hashable {
    case garage, estate

    var label: String { self == .garage ? "Garage sale" : "Estate sale" }
    var open: Double { self == .garage ? 7 : 8 }
    var close: Double { self == .garage ? 13 : 15 }
    var vendorKind: VendorKind { self == .garage ? .garageSale : .estateSale }
    var fakeSource: FakeSource { self == .garage ? .garageSale : .estateSale }
}

/// A sale posted on the calendar. An estate sale runs three days.
struct PostedSale: Codable, Identifiable, Hashable {
    var id = UUID()
    let kind: SaleKind
    let address: String
    let startDay: Int
    let days: Int
    /// The day the entry shows on the calendar: 2 or 3 days before the start.
    let postedDay: Int
    /// A far sale takes a whole day.
    let far: Bool
    /// How good the lot is: 0.6 is thin, 1.6 is a find.
    let quality: Double
    /// A hidden sale shows only after a follower tip (docs/17, Hidden garage sales from follower tips).
    var hidden = false
    /// A one-line hint for the tip, for example "Old binders".
    var hint = ""
    /// The days the player went.
    var visited: [Int] = []

    var endDay: Int { startDay + days - 1 }
    var name: String { "\(kind.label) · \(address)" }
    /// The hours with no car upgrade. `GameStore.saleHours` applies the better car.
    var hours: Double { kind == .estate ? Balance.estateHours : (far ? Balance.garageHoursFar : Balance.garageHoursLocal) }
    var hoursText: String { "\(GameStore.clock(kind.open)) – \(GameStore.clock(kind.close))" }

    func covers(_ day: Int) -> Bool { day >= startDay && day <= endDay }
    /// 0 on the first day of an estate sale, 2 on the last.
    func dayIndex(_ day: Int) -> Int { max(0, min(days - 1, day - startDay)) }
}

extension Balance {
    static let garageHoursLocal = 3.0
    static let garageHoursFar = 8.0
    static let estateHours = 4.0
    /// Each hour after the doors open keeps this share of the good cards.
    static let arrivalKeep = 0.75
    /// The chance that a sale has nothing at all, even at the door.
    static let garageBustChance = 0.15
    /// The share of good cards left on each day of an estate sale, and the price for each day.
    static let estateDayFactor = [1.0, 0.6, 0.35]
    static let estatePriceFactor = [1.0, 0.75, 0.5]
    /// The good cards in a lot at the door, before quality and arrival.
    static let lotCards = 6...20
    static let garagePriceRange = 0.25...0.7
    static let estatePriceRange = 0.6...1.0
    static let garageSalesPerWeek = 3...6
    static let estateSalesPerWeek = 0...2
    static let farSaleChance = 0.3
    /// The chance each week of one more garage sale that only a follower tip reveals.
    static let hiddenSaleChance = 0.6
    /// The chance each day that a follower tips the player about a hidden sale that starts soon.
    static let followerTipChance = 0.5
    /// The chance that the seller comes up to the player at a sale.
    static let saleHostApproach = 0.4
}

@MainActor
extension GameStore {
    private static let streets = ["Elm St", "Maple Ave", "Oak Dr", "Birch Ln", "Cedar Ct", "Pine St", "Willow Way", "Ash Rd",
                                  "Hickory Ln", "Spruce St", "Poplar Ave", "Walnut Dr", "Chestnut St", "Sycamore Ct"]
    private static let hints = ["Old binders", "Kid's card boxes", "Shoebox of cards from the 90s", "Whole collection going",
                                "Toys, games, and cards", "Moving sale, everything must go", "A retired collector's stuff"]

    // MARK: - Scheduling

    /// Keeps the next six weeks full of sales. The same week always gives the same sales.
    func scheduleSales() {
        let horizon = data.day + Balance.showHorizonDays
        // Plan whole weeks. A week starts on Monday (day % 7 == 0), and `salesPlannedThrough` is always a Sunday.
        var day = data.salesPlannedThrough < 0 ? data.day - data.day % 7 : data.salesPlannedThrough + 1
        while day <= horizon {
            var r = SeededRandom(seed: UInt64(day / 7 + 1) &* 86_028_121 &+ 41)
            let garage = r.int(Balance.garageSalesPerWeek)
            for i in 0..<garage {
                let start = day + r.int(4...6)
                data.sales.append(PostedSale(kind: .garage, address: "\(r.int(11...998)) \(Self.streets[r.int(0...(Self.streets.count - 1))])",
                                             startDay: start, days: 1, postedDay: start - r.int(2...3),
                                             far: r.double(0...1) < Balance.farSaleChance, quality: r.double(0.6...1.6),
                                             hint: Self.hints[(i + r.int(0...6)) % Self.hints.count]))
            }
            if r.double(0...1) < Balance.hiddenSaleChance {
                let start = day + r.int(4...6)
                data.sales.append(PostedSale(kind: .garage, address: "\(r.int(11...998)) \(Self.streets[r.int(0...(Self.streets.count - 1))])",
                                             startDay: start, days: 1, postedDay: start - 3, far: r.double(0...1) < 0.2,
                                             quality: r.double(1.1...1.8), hidden: true,
                                             hint: Self.hints[r.int(0...(Self.hints.count - 1))]))
            }
            for _ in 0..<r.int(Balance.estateSalesPerWeek) {
                let start = day + 3
                data.sales.append(PostedSale(kind: .estate, address: "\(r.int(11...998)) \(Self.streets[r.int(0...(Self.streets.count - 1))])",
                                             startDay: start, days: 3, postedDay: start - r.int(2...3), far: false,
                                             quality: r.double(0.8...1.5)))
            }
            data.salesPlannedThrough = day + 6
            day += 7
        }
        let oldest = data.day - 14
        data.sales.removeAll { $0.endDay < oldest }
    }

    /// The sales the player can see: posted, and not hidden.
    var visibleSales: [PostedSale] {
        data.sales.filter { !$0.hidden && $0.postedDay <= data.day && $0.endDay >= data.day }.sorted { $0.startDay < $1.startDay }
    }

    var salesToday: [PostedSale] { visibleSales.filter { $0.covers(data.day) } }

    func sale(_ id: UUID) -> PostedSale? { data.sales.first { $0.id == id } }

    // MARK: - Going

    /// Each hour after the doors open, the good cards fall to 75% (docs/17, Arrival time).
    func arrivalFactor(_ sale: PostedSale, at hour: Double) -> Double {
        pow(Balance.arrivalKeep, max(0, hour - sale.kind.open))
    }

    /// The hours a sale takes, with the better car when the player has one.
    func saleHours(_ sale: PostedSale) -> Double {
        sale.far && sale.kind == .garage && hasUpgrade(.betterCar) ? Balance.betterCarFarSaleHours : sale.hours
    }

    /// Why the player cannot go now, or nil.
    func saleBlock(_ sale: PostedSale) -> String? {
        guard sale.covers(data.day) else { return sale.startDay > data.day ? "In \(sale.startDay - data.day) day\(sale.startDay - data.day == 1 ? "" : "s")" : "Over" }
        if sale.visited.contains(data.day) { return "Been there today" }
        guard let start = slot(for: saleHours(sale)) else { return "Not enough time today" }
        if start > sale.kind.close - 1 { return worksToday ? "You work today" : "Over for today" }
        return nil
    }

    /// Goes to a sale. The visit starts at the doors or now, whichever is later.
    func startSale(_ sale: PostedSale) -> ShowSession? {
        guard saleBlock(sale) == nil, let start = slot(for: saleHours(sale)) else { return nil }
        data.hour = max(start, sale.kind.open)
        let arrival = arrivalFactor(sale, at: data.hour)
        let dayIndex = sale.dayIndex(data.day)
        let dayFactor = sale.kind == .estate ? Balance.estateDayFactor[dayIndex] : 1
        let priceFactor = sale.kind == .estate ? Balance.estatePriceFactor[dayIndex] : 1
        var count = Int((Double(Int.random(in: Balance.lotCards)) * sale.quality * arrival * dayFactor).rounded())
        if Double.random(in: 0..<1) < Balance.garageBustChance { count = 0 }
        let items = count > 0 ? VendorFloor.lot(kind: sale.kind.vendorKind, count: count, priceFactor: priceFactor) : []
        var vendor = Vendor(name: sale.kind == .garage ? "The folding table" : "The card room", kind: sale.kind.vendorKind, items: items)
        vendor.visited = items.isEmpty
        let dayText = sale.kind == .estate ? " · day \(dayIndex + 1) of 3 · \(Int(priceFactor * 100))% prices" : ""
        let venue = Venue(kind: sale.kind == .garage ? .garageSale : .estateSale, name: sale.name,
                          detail: "\(sale.hoursText)\(dayText)\(sale.far ? " · far" : "")", open: sale.kind.open, close: sale.kind.close,
                          hours: saleHours(sale), visitorsMean: 0, hasFloor: true, hasTable: false,
                          approachChance: Balance.saleHostApproach, hostSells: true, fakeSource: sale.kind.fakeSource, eventID: sale.id)
        let session = ShowSession(venue: venue, store: self, vendors: [vendor], regulars: [])
        if items.isEmpty { session.note = "Someone cleaned it out before you got here." }
        save()
        return session
    }

    func recordSaleVisit(_ id: UUID) {
        guard let i = data.sales.firstIndex(where: { $0.id == id }) else { return }
        data.sales[i].visited.append(data.day)
    }

    // MARK: - Follower tips

    /// Hidden sales that a follower tipped the player about, and that wait for an answer.
    var saleTips: [PostedSale] { data.saleTips.compactMap(sale).filter { $0.startDay >= data.day } }

    /// A follower tip at End Day: a hidden sale that starts in the next 1 to 3 days (follower tier 1 and up).
    func followerTipsEndDay() -> [String] {
        guard hasAccount, followerTier >= 1 else { return [] }
        let soon = data.sales.filter { $0.hidden && $0.startDay - data.day >= 1 && $0.startDay - data.day <= 3 && !data.saleTips.contains($0.id) }
        guard let sale = soon.randomElement(), Double.random(in: 0..<1) < Balance.followerTipChance else { return [] }
        data.saleTips.append(sale.id)
        return ["A follower tipped you about a garage sale on \(sale.address), \(GameStore.weekdays[sale.startDay % 7]): “\(sale.hint).” Add it from the social hub."]
    }

    func answerTip(_ id: UUID, add: Bool) {
        data.saleTips.removeAll { $0 == id }
        if add, let i = data.sales.firstIndex(where: { $0.id == id }) {
            data.sales[i].hidden = false
            log("Added the tipped sale on \(data.sales[i].address) to the calendar.")
        }
        save()
    }

    // MARK: - Test tools

    /// A sale that starts today, at the door, with a good lot.
    @discardableResult
    func addTestSale(_ kind: SaleKind) -> PostedSale {
        let sale = PostedSale(kind: kind, address: "1 Test St", startDay: data.day, days: kind == .estate ? 3 : 1,
                              postedDay: data.day, far: false, quality: 1.4, hint: "Old binders")
        data.sales.append(sale)
        if data.hour > kind.close - 1 { data.hour = kind.open }
        save()
        return sale
    }

    func addTestTip() {
        let sale = PostedSale(kind: .garage, address: "2 Tip Ln", startDay: data.day + 2, days: 1, postedDay: data.day, far: false,
                              quality: 1.6, hidden: true, hint: "Shoebox of cards from the 90s")
        data.sales.append(sale)
        data.saleTips.append(sale.id)
        save()
    }
}
