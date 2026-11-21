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

    /// The share of the visitors who do not sell to the player that want to trade.
    var tradeShare: Double {
        switch self {
        case .parkSwap: 0.35
        case .tradeNight: 0.40
        case .tradingCircle: 0.25
        case .leagueNight: 0.20
        case .general, .localShow, .regionalShow: 0.23
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

    /// The space one item takes in its bin. A loose sealed item takes `max(1, round(sqrt(volume / 8 in³)))`, from its real
    /// volume (docs/29-packing-and-crowds.md, The size of sealed product). A sealed case takes a share of the space of its units.
    static func space(_ item: ShowItem, handTruck: Bool = false) -> Int {
        guard item.kind == .sealed else { return 1 }
        let unit = unitProfile(item)
        guard item.isCase else { return unit.space }
        let share = handTruck ? Balance.handTruckCaseShare : Balance.caseShare
        // A sleeved booster case holds loose packs. It counts as displays of 24 packs, each the size of a booster box.
        let units = unit.isPack ? Double(item.packs) / Double(Balance.packsPerDisplay) : Double(max(1, item.packs / max(1, unit.packs)))
        let each = unit.isPack ? Balance.space(volume: Balance.boosterBoxVolume) : unit.space
        return max(1, Int((units * Double(each) * share - 1e-9).rounded(.up)))
    }

    private struct UnitProfile {
        let space: Int
        let packs: Int
        let isPack: Bool
    }

    /// The space of each product is fixed, so each product ID matches its name once.
    nonisolated(unsafe) private static var profiles: [String: UnitProfile] = [:]

    private static func unitProfile(_ item: ShowItem) -> UnitProfile {
        if let id = item.productID, let known = profiles[id] { return known }
        let product = SetLibrary.product(item.productID)
        let slug = product?.homeSlug ?? item.setSlug
        let kind = product?.kind
        let packs = product?.packs ?? item.packs
        let profile = UnitProfile(space: Balance.sealedSpace(name: product?.name ?? item.name, kind: kind, packs: packs, setSlug: slug),
                                  packs: packs, isPack: kind == "Booster pack")
        if let id = item.productID { profiles[id] = profile }
        return profile
    }
}

extension Balance {
    /// A loose sealed item takes round(sqrt(volume / this)) spaces, at least 1. The volume is in cubic inches.
    static let sealedVolumePerSpace = 8.0
    /// A sealed case takes this share of the space of its units. With the hand truck, it takes the second share.
    static let caseShare = 0.8
    static let handTruckCaseShare = 0.6
    /// A sleeved booster case holds loose packs. This many packs count as one booster box display.
    static let packsPerDisplay = 24
    static let boosterBoxVolume = 72.0

    static func space(volume: Double) -> Int { max(1, Int((volume / sealedVolumePerSpace).squareRoot().rounded())) }

    /// Real volumes (in³) by name, from research_notes/Sealed product sizes.md. Names are lowercase with no accents.
    /// The first match wins. The last rows are estimates that give the fallback spaces of the notes.
    static let sealedVolumeByName: [(keys: [String], volume: Double)] = [
        (["super-premium", "super premium"], 707),
        (["ultra-premium", "ultra premium"], 425),
        (["half booster box"], 40),
        (["enhanced booster box", "booster box"], 72),
        (["elite trainer box plus", "etb plus"], 203),
        (["elite trainer box"], 171),
        (["build & battle stadium"], 117),
        (["build & battle box", "prerelease kit"], 27),
        (["booster bundle"], 28),
        (["mini tin"], 17.6),
        (["stacking tin", "poke ball tin"], 78),
        (["collector chest", "collectors chest", "collector's chest"], 197),
        (["binder collection"], 201),
        (["premium collection", "premium figure collection"], 192),
        (["poster collection"], 135),
        (["checklane", "single pack blister", "pack blister"], 26),
        (["hanger box"], 32),
        (["tech sticker collection"], 32),
        (["challenge box"], 200),
        (["pin collection"], 128),
        (["holiday calendar"], 392),
        (["trainer's toolkit"], 288),
        (["first partner pack", "showcase"], 32),
    ]
    /// Real volumes (in³) by catalog kind, when no name matches.
    static let sealedVolumeByKind: [String: Double] = [
        "Booster pack": 2.4, "Blister": 32, "Booster bundle": 28, "Build & Battle": 27, "Booster box": 72,
        "Elite Trainer Box": 171, "Collection": 175, "Other": 32,
    ]
    /// A blister of one pack, a half booster box (24 packs or less), and the standard tin by era.
    static let singleBlisterVolume = 26.0
    static let smallBoxVolume = 40.0
    static let tinVolumeBeforeXY = 80.0
    static let tinVolumeFromXY = 121.0
    /// The eras before XY. A tin from one of them is smaller. An item with no known era counts as XY or later.
    static let tinSmallEras: Set<String> = ["wizards-of-the-coast", "e-card", "ex", "diamond-pearl-platinum", "heartgold-soulsilver", "black-white"]

    /// The unit products of a club or retail bundle, as they appear in a lowercase name. A tin is the standard tin.
    /// Small extras (a Poke Ball, a Surprise Box, promo cards, pins) are not here, so they add nothing.
    private static let componentRegex = try! NSRegularExpression(
        pattern: #"\b(elite trainer box|trainer box|etb|booster bundle|mini tins?|poke ball tins?|poster collection|binder collection|binder|premium collection|ex box|booster box|tins?)\b"#)
    private static let leadPackRegex = try! NSRegularExpression(pattern: #"\b(\d{1,2})[- ]pack\s+$"#)
    private static let leadNumberRegex = try! NSRegularExpression(pattern: #"\b(\d{1,2})\s+$"#)
    private static let trailCountRegex = try! NSRegularExpression(pattern: #"^\s*(\d{1,2})[- ]pack"#)
    private static let totalCountRegex = try! NSRegularExpression(pattern: #"\b(\d{1,2})[- ]pack:"#)
    /// The count that a plural unit has when the name gives no number.
    static let pluralBundleCount = 2

    private static func firstInt(_ regex: NSRegularExpression, in text: String) -> Int? {
        let ns = text as NSString
        guard let m = regex.firstMatch(in: text, range: NSRange(location: 0, length: ns.length)) else { return nil }
        return Int(ns.substring(with: m.range(at: 1)))
    }

    private static func componentVolume(_ word: String, setSlug: String) -> Double {
        if word.hasPrefix("mini tin") { return 17.6 }
        if word.hasPrefix("poke ball tin") { return 78 }
        if word.hasSuffix("tin") || word.hasSuffix("tins") { return tinVolume(setSlug: setSlug) }
        if word.hasPrefix("booster bundle") { return 28 }
        if word.hasPrefix("booster box") { return 72 }
        if word.hasPrefix("poster") { return 135 }
        if word.hasPrefix("binder") { return 201 }
        if word.hasPrefix("premium") { return 192 }
        if word.hasPrefix("ex box") { return 175 }
        return 171
    }

    private static func tinVolume(setSlug: String) -> Double {
        tinSmallEras.contains(SetLibrary.info(setSlug)?.era ?? "") ? tinVolumeBeforeXY : tinVolumeFromXY
    }

    /// A name that holds several products: a joiner ("+", "and", "&") between two units, or a count next to a unit. The
    /// space is the sum of each unit space times its count. "3 Pack Blister" is booster packs, so it is not here.
    /// Nil: the name is not a bundle, and the single-item rule applies.
    private static func bundleSpace(_ text: String, setSlug: String) -> Int? {
        let ns = text as NSString
        let hits = componentRegex.matches(in: text, range: NSRange(location: 0, length: ns.length))
        guard !hits.isEmpty else { return nil }
        var total = firstInt(totalCountRegex, in: text)
        var words: [String] = []
        var counts: [Int?] = []
        var leads: [Int?] = []
        var joined = false
        for (i, hit) in hits.enumerated() {
            let word = ns.substring(with: hit.range)
            let end = hit.range.location + hit.range.length
            let before = ns.substring(to: hit.range.location)
            let lead = firstInt(leadPackRegex, in: before)
            var count: Int? = nil
            // A bare number counts only mini tins ("4 Mini Tins"), so "Base Set 2 Booster Box" is one box. A count after a
            // mini tin ("Mini Tins 5-Pack") counts the tins. After another tin it counts the whole pack.
            if word.hasPrefix("mini tin") {
                count = firstInt(leadNumberRegex, in: before) ?? firstInt(trailCountRegex, in: ns.substring(from: end))
            }
            words.append(word)
            counts.append(count)
            leads.append(lead)
            if i + 1 < hits.count {
                let between = ns.substring(with: NSRange(location: end, length: hits[i + 1].range.location - end))
                if between.contains(" + ") || between.contains(" and ") || between.contains(" & ") { joined = true }
            }
        }
        // "N-Pack" before one unit multiplies it ("8-Pack Mini Tins"). With several units joined, N is the total of products.
        for i in counts.indices where leads[i] != nil {
            if joined { total = total ?? leads[i] } else if counts[i] == nil { counts[i] = leads[i] }
        }
        guard joined || counts.contains(where: { ($0 ?? 1) > 1 }) else { return nil }
        let named = zip(words, counts).reduce(0) { $0 + ($1.1 ?? ($1.0.hasSuffix("s") ? 0 : 1)) }
        var sum = 0
        for (word, count) in zip(words, counts) {
            let plural = word.hasSuffix("s")
            let units = count ?? (plural ? (total.map { max(1, $0 - named) } ?? pluralBundleCount) : 1)
            sum += space(volume: componentVolume(word, setSlug: setSlug)) * units
        }
        return sum
    }

    /// The space of one sealed product, or of all its units for a "[Set of N]" product.
    static func sealedSpace(name: String, kind: String?, packs: Int, setSlug: String) -> Int {
        let folded = name.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil).lowercased()
        var count = 1
        if let open = folded.range(of: "[set of "),
           let n = Int(folded[open.upperBound...].prefix { $0.isNumber }), n > 1 {
            count = n
        }
        // One loose pack is 1 space, whatever its name says ("Mini Booster Pack" in a bundle name).
        if kind == "Booster pack", max(1, packs / count) == 1 { return count }
        if count == 1, let bundle = bundleSpace(folded, setSlug: setSlug) { return bundle }
        if let named = sealedVolumeByName.first(where: { row in row.keys.contains { folded.contains($0) } }) {
            return space(volume: named.volume) * count
        }
        let unitPacks = max(1, packs / count)
        let volume: Double
        switch kind {
        case "Tin": volume = tinVolume(setSlug: setSlug)
        case "Blister": volume = unitPacks <= 1 ? singleBlisterVolume : sealedVolumeByKind["Blister"] ?? 32
        case "Booster box": volume = unitPacks <= 24 ? smallBoxVolume : sealedVolumeByKind["Booster box"] ?? 72
        default: volume = kind.flatMap { sealedVolumeByKind[$0] } ?? sealedVolumeByKind["Other"] ?? 32
        }
        return space(volume: volume) * count
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
    /// The trade share at the player's own store, of all visitors. It did not change with the crowds.
    static let storeTradeShare = 0.18
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
        let space = switch bin {
        case .binder: Balance.binderSpace[hasUpgrade(.vendorBinder) ? 1 : 0]
        case .slabBox: Balance.slabBoxSpace[hasUpgrade(.slabCase) ? 1 : 0]
        case .tote: Balance.toteSpace[hasUpgrade(.foldingCart) ? 1 : 0]
        }
        // The cargo van carries more of each bin.
        return hasUpgrade(.cargoVan) ? Int((Double(space) * Balance.cargoVanFactor).rounded()) : space
    }

    /// The space one item takes in its bin, with the hand truck.
    func carrySpace(_ item: ShowItem) -> Int {
        CarryBin.space(item, handTruck: hasUpgrade(.handTruck))
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
