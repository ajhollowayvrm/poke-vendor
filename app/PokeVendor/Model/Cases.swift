import Foundation

// Sealed cases (docs/12-acquiring-product.md, Cases).

/// A real case price from tools/export/cases.py.
struct CaseListing: Codable, Hashable {
    /// The unit product ID in catalog.json.
    let product: String
    /// The TCGplayer product ID of the case SKU.
    let caseID: String
    let units: Int
    /// The TCGplayer market price of the case on the day of the price refresh.
    let market: Double

    enum CodingKeys: String, CodingKey { case product, caseID = "case", units, market }
}

/// The row of the case factor table.
enum CaseKind: Hashable {
    case boosterBox, eliteTrainerBox, boosterBundle, other

    init(_ p: Product) {
        switch p.kind {
        case "Booster box": self = .boosterBox
        case "Elite Trainer Box": self = .eliteTrainerBox
        case "Booster bundle": self = .boosterBundle
        default: self = .other
        }
    }
}

extension Balance {
    /// Collection name rules that come before the kind. The first match wins.
    static let caseSizeByName: [(String, Int)] = [("Ultra-Premium", 4), ("Ultra Premium", 4), ("Tech Sticker", 12), ("Knock Out", 24)]
    /// The kinds that the distributor sells by the case. Keep it equal to the old four kinds, so the seeded weekly
    /// offers stay the same for each week.
    static let wholesaleKinds: Set<String> = ["Booster box", "Elite Trainer Box", "Booster bundle", "Booster pack"]

    /// Units in one case of the product. Nil: the product has no case. A product that is itself a multi-unit bundle
    /// (an art bundle, a half box, a club bundle, a master carton) has no case: no source gives one.
    /// Keep it equal to `case_size` in tools/export/cases.py.
    static func caseSize(for p: Product) -> Int? {
        // A "[Set of N]" product is several units sold as one product. It has no case.
        if p.isClubExclusive || p.name.contains("Master Carton") || p.name.contains("[Set of") { return nil }
        switch p.kind {
        case "Booster pack":
            // One loose or sleeved pack. "[Set of N]" art bundles, sleeved pack bundles, and Fun Packs have no case.
            return p.packs == 1 && !p.name.contains("Fun Pack") ? 144 : nil
        case "Booster box":
            // A half box is a seller split, not a factory product. An enhanced box uses a real cases.json row only.
            if p.name.contains("Half Booster Box") || p.name.contains("Enhanced Booster Box") { return nil }
            return p.packs == 36 ? 6 : nil
        case "Booster bundle":
            return p.packs == 6 ? 25 : nil
        case "Elite Trainer Box":
            return p.name.contains("Pokemon Center") || p.name.contains("Pokémon Center") ? 4 : 10
        case "Blister":
            return p.packs <= 1 ? 16 : 24          // checklane display 16; 2-pack and 3-pack cases 24
        case "Tin":
            return p.name.contains("Mini Tin") ? 10 : 6
        case "Collection":
            return caseSizeByName.first { p.name.contains($0.0) }?.1 ?? 6
        default:
            return caseSizes[p.kind]               // "Build & Battle" 10; "Other" is nil
        }
    }

    /// The case price as a multiple of the units' price: in print, out of print under 2 years, out of print 2 years or
    /// more (or an older era). From the 2026-11-20 tcgcsv ratios.
    static let caseFactors: [CaseKind: [Double]] = [
        .boosterBox: [0.95, 1.05, 1.15], .eliteTrainerBox: [1.05, 1.15, 1.25],
        .boosterBundle: [0.95, 1.05, 1.10], .other: [1.00, 1.05, 1.10],
    ]
    /// Out of print this many days or more uses the third column.
    static let caseOldDays = 730.0
    /// A trusted case, and a unit from one, sells a little faster. The tag changes no price.
    static let caseFreshSaleBonus = 1.05
    /// Opening a case that loses more premium than this asks the player to confirm.
    static let caseOpenConfirmPremium = 50.0
}

enum CaseMath {
    /// Units in one case: the real case SKU first, then the count table.
    static func units(_ p: Product) -> Int? { SetLibrary.caseListings[p.id]?.units ?? Balance.caseSize(for: p) }

    /// The factor for a case with no real price. The print timer is in Model/PrintRuns.swift.
    static func factor(_ p: Product) -> Double {
        let row = Balance.caseFactors[CaseKind(p)] ?? [1, 1.05, 1.10]
        if p.isInPrint { return row[0] }
        let slugs = Set(p.mix.map(\.slug))
        // A set from an older era was out of print long before day 0.
        guard slugs.allSatisfy({ PriceCycle.defaultInPrint($0) }) else { return row[2] }
        let out = PriceCycle.printDays(slugs, day: PriceCycle.today).outOfPrint
        return out < Balance.caseOldDays ? row[1] : row[2]
    }

    /// The market price of a sealed case today. A real price wins over the factor. The real price moves with the
    /// unit's market factor, so a case follows booms, seasons, and print changes like its units.
    static func market(_ p: Product, units: Int) -> Double {
        if let real = SetLibrary.caseListings[p.id], real.units == units {
            return PriceCycle.price(real.market, p.marketFactor())
        }
        return p.market * Double(units) * factor(p)
    }

    static func name(_ p: Product, units: Int) -> String { "\(p.name) · Case of \(units)" }
}

@MainActor
extension GameStore {
    /// A sealed case item. `packs` is the pack count of the whole case.
    func makeCase(_ p: Product, units: Int, paid: Double, source: String, status: ItemStatus?, fake: FakeTier? = nil,
                  caseFresh: Bool, grayOrder: UUID? = nil) -> SealedItem {
        var item = SealedItem(setSlug: p.homeSlug, name: CaseMath.name(p, units: units), packs: p.packs * units, paid: paid,
                              acquired: .now, source: source, productID: p.id, status: status, acquiredDay: data.day)
        item.caseUnits = units
        item.caseFresh = caseFresh ? true : nil
        item.fake = fake
        item.grayOrder = grayOrder
        return item
    }

    /// Opens a sealed case into its units (docs/12, Cases). A free action. The units stay sealed, and the case premium
    /// goes away. The paid amount splits evenly. The last unit takes the rounding, so the units add up to the case
    /// exactly. A resealed case gives resealed units. Returns the unit IDs.
    /// `forOrder`: only the Rip & Ship rip passes it. A case sold to a viewer opens only for its own order.
    /// `status`: the status of the new units. Nil keeps them in hand.
    @discardableResult
    func openCase(_ id: UUID, status: ItemStatus? = nil, forOrder: UUID? = nil, save saves: Bool = true) -> [UUID] {
        guard let i = data.sealed.firstIndex(where: { $0.id == id }), let units = data.sealed[i].caseUnits,
              let product = SetLibrary.product(data.sealed[i].productID) else { return [] }
        // A case with an online listing stays closed. The player ends the listing first.
        guard data.sealed[i].onlineListing == nil else { return [] }
        switch data.sealed[i].status {
        case nil, .inStore: break
        case .soldToViewer(let order) where order == forOrder: break
        default: return []                       // listed, arriving, consigned, at auction, or sold to another order
        }
        let box = data.sealed.remove(at: i)
        let each = (box.paid / Double(units) * 100).rounded(.down) / 100
        var ids: [UUID] = []
        for k in 0..<units {
            let paid = k == units - 1 ? box.paid - each * Double(units - 1) : each
            var unit = SealedItem(setSlug: product.homeSlug, name: product.name, packs: product.packs, paid: paid,
                                  acquired: box.acquired, source: "Case · \(box.source)", productID: product.id,
                                  status: status, acquiredDay: box.acquiredDay)
            unit.pc = box.pc
            unit.fake = box.fake
            unit.fakeKnown = box.fakeKnown
            unit.verified = box.verified
            unit.caseFresh = box.caseFresh
            unit.grayOrder = box.grayOrder
            ids.append(unit.id)
            data.sealed.append(unit)
        }
        // Phase 4: `splitHotRecord(caseID: box.id, into: ids)` moves the hot allocation record to the units.
        inheritChallenge(from: box.id, ids)            // a P&L challenge case keeps its units in the challenge
        log("Opened the case: \(units) × \(product.name).")
        if saves { save() }
        return ids
    }

    /// The case premium that opening loses: the case price less the price of its units. Negative: opening adds value.
    func casePremium(_ item: SealedItem) -> Double {
        guard let units = item.caseUnits, let product = SetLibrary.product(item.productID) else { return 0 }
        return realMarket(of: item) - product.market * Double(units)
    }

    #if DEBUG
    /// Test tool: a case in hand, at 60% of the price of its units. Returns its ID.
    @discardableResult
    func testCase(_ product: Product, units: Int, fresh: Bool) -> UUID {
        let item = makeCase(product, units: units, paid: (Double(units) * product.market * 0.6 * 100).rounded() / 100,
                            source: "Test", status: nil, caseFresh: fresh)
        data.sealed.append(item)
        return item.id
    }
    #endif
}
