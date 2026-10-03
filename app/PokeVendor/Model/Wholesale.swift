import Foundation

// Wholesale and case splits (docs/12-acquiring-product.md, Distributor / wholesale; Case splits).

/// One case a distributor sells this week.
struct WholesaleOffer: Identifiable, Hashable {
    let id: String
    let product: Product
    let caseSize: Int
    let unitPrice: Double

    var casePrice: Double { unitPrice * Double(caseSize) }
}

/// A few trusted people buy a case together and divide the boxes.
struct CaseSplit: Codable, Identifiable, Hashable {
    var id = UUID()
    let productID: String
    let productName: String
    let boxes: Int
    let pricePerBox: Double
    let organizer: String
    let invitedDay: Int
    let closesDay: Int
    let arrivesDay: Int
    /// Boxes the others took.
    var taken: Int
    var mine = 0

    var open: Int { max(0, boxes - taken - mine) }
}

extension Balance {
    static let wholesaleDiscount = 0.72
    static let wholesaleMinOrder = 500.0
    static let wholesaleDeliveryDays = 5
    static let caseSizes: [String: Int] = ["Booster box": 6, "Elite Trainer Box": 10, "Booster bundle": 12, "Booster pack": 36]
    /// A split prices each box at this share of market.
    static let splitPriceShare = 0.85
    static let splitInvitesPerWeek = [0, 0, 0, 1, 2]
    /// The most boxes the player may take at reputation Respected. Elite may take half the case.
    static let splitMaxBoxesRespected = 2
    static let splitClosesDays = 3
    static let splitDeliveryDays = 4
    static let friendSplitChance = 0.25
    static let friendSplitShare = 0.8
}

@MainActor
extension GameStore {
    /// Wholesale opens at reputation Respected (docs/04), or with a store of the player's own: a distributor opens
    /// an account for a store (docs/22-own-store.md).
    var wholesaleOpen: Bool { reputationTier >= 3 || storeIsBuilt }

    /// This week's cases: in-print product at 72% of MSRP. The same week always gives the same cases.
    var wholesaleOffers: [WholesaleOffer] {
        guard wholesaleOpen else { return [] }
        var r = SeededRandom(seed: UInt64(data.day / 7 + 1) &* 57_559 &+ 909)
        let options = SetLibrary.catalog.filter {
            ($0.inPrint ?? true) && Balance.caseSizes[$0.kind] != nil && $0.msrp != nil && !$0.isStoreExclusive
        }
        var out: [WholesaleOffer] = []
        for i in 0..<8 where !options.isEmpty {
            let p = options[r.int(0...(options.count - 1))]
            if out.contains(where: { $0.product.id == p.id }) { continue }
            let size = Balance.caseSizes[p.kind] ?? 6
            out.append(WholesaleOffer(id: "w\(data.day / 7)-\(i)", product: p, caseSize: size,
                                      unitPrice: Market.retail((p.msrp ?? p.market) * Balance.wholesaleDiscount)))
        }
        return out.sorted { $0.casePrice > $1.casePrice }
    }

    /// Buys cases. The minimum order is $500, and the boxes arrive in 5 days.
    func buyWholesale(_ offer: WholesaleOffer, cases: Int) -> String? {
        let total = offer.casePrice * Double(cases)
        guard cases > 0 else { return nil }
        guard total >= Balance.wholesaleMinOrder else { return "The minimum order is \(money(Balance.wholesaleMinOrder))." }
        guard canAfford(total) else { return "You need \(money(total)). You have \(money(cash))." }
        addLedger(-total, .wholesale, "\(cases) case\(cases == 1 ? "" : "s") of \(offer.product.name) · Distributor")
        for _ in 0..<(offer.caseSize * cases) {
            data.sealed.append(SealedItem(setSlug: offer.product.homeSlug, name: offer.product.name, packs: offer.product.packs,
                                          paid: offer.unitPrice, acquired: .now, source: "Wholesale", productID: offer.product.id,
                                          status: .arriving(daysLeft: Balance.wholesaleDeliveryDays, from: "the distributor"),
                                          acquiredDay: data.day))
        }
        log("Ordered \(cases) case\(cases == 1 ? "" : "s") of \(offer.product.name) from the distributor for \(money(total)). It arrives in \(Balance.wholesaleDeliveryDays) days.",
            cash: -total)
        save()
        return nil
    }

    // MARK: - Case splits

    var openSplits: [CaseSplit] { data.splits.filter { $0.closesDay >= data.day || $0.mine > 0 }.sorted { $0.closesDay < $1.closesDay } }

    /// The most boxes the player may take from one split.
    func splitLimit(_ split: CaseSplit) -> Int {
        let byTier = reputationTier >= 4 ? split.boxes / 2 : Balance.splitMaxBoxesRespected
        return min(byTier, split.open + split.mine)
    }

    /// Joins a split: pay now, and the boxes arrive after the case does.
    func joinSplit(_ id: UUID, boxes: Int) -> String? {
        guard let i = data.splits.firstIndex(where: { $0.id == id }) else { return "The split is gone." }
        let split = data.splits[i]
        guard split.closesDay >= data.day else { return "The split closed." }
        guard boxes > 0, boxes <= splitLimit(split) - split.mine else { return "You can take up to \(splitLimit(split)) boxes." }
        let total = split.pricePerBox * Double(boxes)
        guard canAfford(total) else { return "You need \(money(total)). You have \(money(cash))." }
        guard let product = SetLibrary.product(split.productID) else { return "The product is gone." }
        addLedger(-total, .wholesale, "\(boxes) box\(boxes == 1 ? "" : "es") · case split with \(split.organizer)")
        data.splits[i].mine += boxes
        for _ in 0..<boxes {
            data.sealed.append(SealedItem(setSlug: product.homeSlug, name: product.name, packs: product.packs, paid: split.pricePerBox,
                                          acquired: .now, source: "Case split with \(split.organizer)", productID: product.id,
                                          status: .arriving(daysLeft: max(1, split.arrivesDay - data.day), from: "the case split"),
                                          acquiredDay: data.day))
        }
        log("Took \(boxes) box\(boxes == 1 ? "" : "es") in \(split.organizer)'s case split for \(money(total)). It arrives on day \(split.arrivesDay + 1).",
            cash: -total)
        save()
        return nil
    }

    func declineSplit(_ id: UUID) {
        data.splits.removeAll { $0.id == id && $0.mine == 0 }
        save()
    }

    /// New invites on Monday, by reputation tier, and a Friend vendor's offer now and then (docs/04, docs/21).
    func splitsEndDay() -> [String] {
        let today = data.day
        data.splits.removeAll { $0.arrivesDay < today - 1 || ($0.closesDay < today && $0.mine == 0) }
        var lines: [String] = []
        var invites = weekday == 0 ? Balance.splitInvitesPerWeek[reputationTier] : 0
        var friendOffer: Contact?
        if weekday == 0, reputationTier >= 3,
           let friend = data.contacts.filter({ $0.kind.isVendor && level($0.id) == .friend }).randomElement(),
           Double.random(in: 0..<1) < Balance.friendSplitChance {
            friendOffer = friend
            invites += 1
        }
        guard invites > 0 else { return lines }
        let options = SetLibrary.catalog.filter { ["Booster box", "Elite Trainer Box"].contains($0.kind) && $0.market > 0 }
        let organizers = data.contacts.filter { $0.kind.isVendor && level($0.id).rank >= StandingLevel.regular.rank }.map(\.name)
            + ["Marcus", "Priya", "Dev", "Olivia"]
        for i in 0..<invites {
            guard let p = options.randomElement() else { continue }
            let boxes = Balance.caseSizes[p.kind] ?? 6
            let friend = i == invites - 1 ? friendOffer : nil
            let share = friend == nil ? Balance.splitPriceShare : Balance.friendSplitShare
            let split = CaseSplit(productID: p.id, productName: p.name, boxes: boxes,
                                  pricePerBox: Market.retail(p.market * share),
                                  organizer: friend?.name ?? organizers.randomElement() ?? "Marcus",
                                  invitedDay: data.day, closesDay: data.day + Balance.splitClosesDays,
                                  arrivesDay: data.day + Balance.splitClosesDays + Balance.splitDeliveryDays,
                                  taken: Int.random(in: 1...max(1, boxes - 3)))
            data.splits.append(split)
            lines.append("\(split.organizer) invited you into a case split: \(p.name), \(money(split.pricePerBox)) a box. It closes on day \(split.closesDay + 1).")
        }
        return lines
    }

    /// Test tool: one invite now.
    func testSplitInvite() {
        let saved = data.reputation
        if reputationTier < 3 { data.reputation = 350 }
        guard let p = SetLibrary.catalog.filter({ $0.kind == "Booster box" && $0.market > 0 }).randomElement() else { return }
        data.splits.append(CaseSplit(productID: p.id, productName: p.name, boxes: 6, pricePerBox: Market.retail(p.market * Balance.splitPriceShare),
                                     organizer: "Marcus", invitedDay: data.day, closesDay: data.day + 3, arrivesDay: data.day + 7, taken: 2))
        data.reputation = saved
        save()
    }
}
