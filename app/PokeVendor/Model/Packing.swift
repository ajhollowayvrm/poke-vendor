import Foundation

// Packing and crowds (docs/29-packing-and-crowds.md): carry space, setup time, the crowd at each venue, and stale stock.

/// The people who come to a venue: who they are, what they spend, and how many want to trade.
enum Crowd: Hashable {
    case general, localShow, regionalShow, parkSwap, tradeNight, tradingCircle, leagueNight

    /// The buyer types and how often each one comes, against the others.
    var weights: [(VisitorType, Double)] {
        switch self {
        case .general, .localShow:
            [(.collector, 2), (.flipper, 1), (.kid, 1), (.gradeHunter, 1), (.vintageFan, 1), (.sealedCollector, 1)]
        case .regionalShow:
            [(.collector, 2), (.gradeHunter, 2), (.vintageFan, 2), (.sealedCollector, 2), (.flipper, 1), (.kid, 0.5)]
        case .parkSwap: [(.kid, 3), (.collector, 2), (.player, 1), (.flipper, 1)]
        case .tradeNight: [(.collector, 2), (.flipper, 2), (.player, 1), (.gradeHunter, 1), (.kid, 1)]
        case .tradingCircle: [(.collector, 3), (.vintageFan, 2), (.gradeHunter, 2), (.sealedCollector, 1)]
        case .leagueNight: [(.player, 4), (.kid, 2), (.collector, 1), (.sealedCollector, 1)]
        }
    }

    /// The mean budget of a buyer. Nil: no cap.
    var spendCap: Double? {
        switch self {
        case .general, .regionalShow, .tradingCircle: nil
        case .localShow: 400
        case .parkSwap: 60
        case .tradeNight: 150
        case .leagueNight: 80
        }
    }

    /// The share of visitors who want to trade.
    var tradeShare: Double {
        switch self {
        case .parkSwap: 0.28
        case .tradeNight: 0.30
        case .tradingCircle: 0.20
        case .leagueNight: 0.15
        case .general, .localShow, .regionalShow: 0.18
        }
    }

    /// One line for the setup screen.
    var summary: String {
        switch self {
        case .general: "A mix of buyers."
        case .localShow: "A mix of buyers. Most spend \(money(400)) or less."
        case .regionalShow: "Serious buyers: vintage, slabs, sealed, and cards to grade. Big budgets."
        case .parkSwap: "Families and kids. Small budgets: most spend \(money(60)) or less. Lots of trades."
        case .tradeNight: "Collectors and flippers, and some players. Most spend \(money(150)) or less. The most trades."
        case .tradingCircle: "Serious collectors: vintage, slabs, and cards to grade. Big budgets."
        case .leagueNight: "Players who want newer cards and packs to open, and kids. Most spend \(money(80)) or less."
        }
    }

    /// A few words for a hub row or the calendar.
    var short: String {
        switch self {
        case .general: "a mix of buyers"
        case .localShow: "a mix of buyers"
        case .regionalShow: "big budgets, vintage and slabs"
        case .parkSwap: "families, small budgets"
        case .tradeNight: "traders and flippers"
        case .tradingCircle: "serious collectors"
        case .leagueNight: "players and kids"
        }
    }
}

extension VisitorType {
    /// True when this buyer type wants the item at all, before the budget.
    func wants(_ item: ShowItem) -> Bool {
        switch self {
        case .kid: item.market <= 30
        case .gradeHunter: item.kind == .card && !item.graded && item.market >= 5
        case .vintageFan: item.isVintage
        case .sealedCollector: item.kind == .sealed
        case .player: !item.isVintage && (item.kind == .card ? !item.graded : item.packs <= Balance.playerMaxPacks)
        default: true
        }
    }

    /// Why a buyer of this type found nothing, for the banner.
    var foundNothingLine: String {
        switch self {
        case .kid: "A kid looked over your table and found nothing for \(money(30)) or less."
        case .gradeHunter: "A grading hunter looked for raw cards to grade, and found nothing in their budget."
        case .vintageFan: "A vintage collector looked for old cards, and found nothing in their budget."
        case .sealedCollector: "A sealed collector looked for sealed product, and found nothing in their budget."
        case .player: "A player looked for newer cards and packs to open, and found nothing in their budget."
        default: "A \(label.lowercased()) looked over your table, and found nothing in their budget."
        }
    }
}

/// How much room an item takes, and in which bin.
enum CarryBin: CaseIterable {
    case binder, slabBox, tote

    var name: String {
        switch self {
        case .binder: "Binder"
        case .slabBox: "Slab box"
        case .tote: "Tote"
        }
    }

    static func of(_ item: ShowItem) -> CarryBin { item.kind == .sealed ? .tote : item.graded ? .slabBox : .binder }

    /// The space one item takes in its bin. Sealed product: 1 pack is 1 space, more is 1 plus 1 for each 6 packs.
    static func space(_ item: ShowItem) -> Int {
        guard item.kind == .sealed else { return 1 }
        return item.packs <= 1 ? 1 : 1 + Int((Double(item.packs) / 6).rounded(.up))
    }
}

extension Balance {
    static let binderSpace = [40, 160]
    static let slabBoxSpace = [3, 20]
    static let toteSpace = [8, 30]
    /// Setup: a base, then minutes for each raw card, each slab, and each space of sealed.
    static let setupBaseMinutes = 10.0
    static let setupMinutesPerRaw = 0.2
    static let setupMinutesPerSlab = 0.5
    static let setupMinutesPerSealedSpace = 1.0
    /// Day 2 of a regional show: the table stayed set up overnight.
    static let setupDayTwoShare = 0.5
    /// A player buys sealed product with this many packs or less, to open.
    static let playerMaxPacks = 10
    /// Each buyer's budget is the crowd's spend cap times a value in this range.
    static let budgetRange = 0.5...1.5
    /// Turnout: the mean times (base + appeal / divisor), at most the cap.
    static let turnoutBase = 0.7
    static let turnoutAppealDivisor = 20.0
    static let turnoutCap = 1.3
    /// Stale stock: the days a table record lasts, and a regular's chance to pass for each time on a table.
    static let staleDays = 21
    static let stalePassPerShowing = 0.30
    static let stalePassMax = 0.75
}

@MainActor
extension GameStore {
    /// The room in each bin, from the upgrades.
    func capacity(_ bin: CarryBin) -> Int {
        switch bin {
        case .binder: Balance.binderSpace[hasUpgrade(.vendorBinder) ? 1 : 0]
        case .slabBox: Balance.slabBoxSpace[hasUpgrade(.slabCase) ? 1 : 0]
        case .tote: Balance.toteSpace[hasUpgrade(.foldingCart) ? 1 : 0]
        }
    }

    /// The days before today when the item sat on a table, in the last 21 days.
    func tableShowings(_ id: UUID) -> Int {
        let today = data.day
        return (data.tableDays[id.uuidString] ?? []).filter { $0 < today && $0 >= today - Balance.staleDays }.count
    }

    /// Records today's table: each item gets today's day. Old records drop off.
    func recordTable(_ items: [ShowItem]) {
        let today = data.day
        var days = data.tableDays
        for item in items where !(days[item.id.uuidString] ?? []).contains(today) {
            days[item.id.uuidString, default: []].append(today)
        }
        for (key, list) in days {
            let kept = list.filter { $0 >= today - Balance.staleDays }
            days[key] = kept.isEmpty ? nil : kept
        }
        data.tableDays = days
        data.lastLoadout = items.map(\.id.uuidString)
    }
}
