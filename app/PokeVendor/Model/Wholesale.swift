import Foundation

// Wholesale and case splits (docs/12-acquiring-product.md, Distributor / wholesale; Case splits).

/// One case a distributor sells this week.
struct WholesaleOffer: Identifiable, Hashable {
    let id: String
    let product: Product
    let caseSize: Int
    let unitPrice: Double
    /// The market price of the whole case today, for the row on the distributor screen.
    let caseMarket: Double

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
    static let wholesaleMinOrder = 250.0
    /// A distributor does not sell far under market. The lowest case price, as a share of market.
    static let wholesaleMarketFloor = 0.62
    static let storeWholesaleMarketFloor = 0.5
    /// A player with no store can buy this many cases in a week, and one case of each product.
    static let wholesaleCasesPerWeek = 2
    /// The chance that an order ships short, and the share of the boxes that ship then. The rest is refunded.
    static let wholesaleShortChance = 0.12
    static let wholesaleShortShare = 0.6...0.9
    static let wholesaleDeliveryDays = 5
    /// Units in one distributor case, by product kind (research_notes/Sealed product and flipper play/cases.md, section 1).
    /// "Booster pack" is the 144-pack sleeved booster case. Read `caseSize(for:)`, not this table: it applies the pack
    /// count and name rules first.
    static let caseSizes: [String: Int] = ["Booster box": 6, "Elite Trainer Box": 10, "Booster bundle": 25, "Booster pack": 144,
                                           "Blister": 24, "Build & Battle": 10, "Collection": 6, "Tin": 6]
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

    /// This week's cases: in-print product at 72% of MSRP, or 58% for a store account, but never far under market.
    /// The same week always gives the same cases.
    var wholesaleOffers: [WholesaleOffer] {
        guard wholesaleOpen else { return [] }
        var r = SeededRandom(seed: UInt64(data.day / 7 + 1) &* 57_559 &+ 909)
        let options = SetLibrary.catalog.filter {
            $0.isInPrint && Balance.wholesaleKinds.contains($0.kind) && CaseMath.units($0) != nil && $0.msrp != nil
                && !$0.isStoreExclusive
        }
        var out: [WholesaleOffer] = []
        for i in 0..<8 where !options.isEmpty {
            let p = options[r.int(0...(options.count - 1))]
            if out.contains(where: { $0.product.id == p.id }) { continue }
            let size = CaseMath.units(p) ?? 6
            let floor = p.market * (hasStoreAccount ? Balance.storeWholesaleMarketFloor : Balance.wholesaleMarketFloor)
            out.append(WholesaleOffer(id: "w\(data.day / 7)-\(i)", product: p, caseSize: size,
                                      unitPrice: Market.retail(max((p.retailMSRP() ?? p.market) * wholesaleDiscountNow, floor)),
                                      caseMarket: CaseMath.market(p, units: size)))
        }
        return out.sorted { $0.casePrice > $1.casePrice }
    }

    #if DEBUG
    /// Test tool: replaces the 1% roll that loses an order.
    static var forceWholesaleMissing: Bool?
    #endif

    /// Buys cases. The secondary wholesaler has a minimum order (`Balance.wholesaleMinOrder`). A hobby account has no
    /// minimum, but it can buy only its weekly allocation. Hot product fills only part of the request. The order
    /// arrives in 5 days as sealed cases. 1 order in 100 goes missing, and the distributor refunds it later.
    func buyWholesale(_ offer: WholesaleOffer, cases: Int) -> String? {
        guard cases > 0 else { return nil }
        if let left = wholesaleLeft(offer), cases > left {
            return left == 0 ? "Your allocation of this product is used up this week."
                             : "Your allocation has \(left) more case\(left == 1 ? "" : "s") of this product this week."
        }
        let requested = offer.casePrice * Double(cases)
        guard requested >= wholesaleMinOrderNow else { return "The minimum order is \(money(Balance.wholesaleMinOrder))." }
        // A Preferred or Premier account can buy on net-30 terms (Model/DistributionLadder.swift).
        let onTerms = buyingOnTerms && termsBlock(requested) == nil
        guard onTerms || canAfford(requested) else { return "You need \(money(requested)). You have \(money(cash))." }
        // 1. The fill roll. Read every value into locals first.
        let hot = isHot(offer.product)
        let fill = hotFillRate(offer.product)
        let week = data.day / 7
        let today = data.day
        var filled = cases
        var usedElite = false
        if hot {
            filled = 0
            var rolls = cases
            if eliteCaseOpen { filled = 1; rolls -= 1; usedElite = true }
            for _ in 0..<rolls where Double.random(in: 0..<1) < fill { filled += 1 }
        }
        if usedElite {
            data.distributor.eliteCaseWeek = week
            data.distributor.eliteProductID = offer.product.id
        }
        // The request uses the allocation, even when it does not fill.
        recordWholesale(offer, cases: cases)
        guard filled > 0 else {
            log("The distributor filled 0 of \(cases) case\(cases == 1 ? "" : "s") of \(offer.product.name). Hot product is short. Nothing was charged.")
            save()
            return "Hot product is short. The distributor filled 0 of \(cases). Nothing was charged."
        }
        // 2. The charge, for the filled cases only.
        let total = offer.casePrice * Double(filled)
        let orderName = "\(filled) case\(filled == 1 ? "" : "s") of \(offer.product.name)"
        addLedger(-total, .wholesale, "\(orderName) · Distributor")
        if onTerms { takeOnTerms(total, label: orderName) }
        // 3. The missing-shipment roll. No items, no hot records, no rep credit, no spend.
        #if DEBUG
        let missing = GameStore.forceWholesaleMissing ?? (Double.random(in: 0..<1) < Balance.wholesaleMissingChance)
        #else
        let missing = Double.random(in: 0..<1) < Balance.wholesaleMissingChance
        #endif
        if missing {
            registerMissingShipment(name: orderName, refund: total, learnIn: Balance.wholesaleDeliveryDays)
            log("Ordered \(orderName) from the distributor for \(money(total)). It should arrive in \(Balance.wholesaleDeliveryDays) days.", cash: -total)
            save()
            return nil
        }
        data.distributor.spent += total
        creditRepSpend(total)
        // 4. The short-ship roll and the delivery as cases.
        let ordered = filled * offer.caseSize
        let shipped = Double.random(in: 0..<1) < Balance.wholesaleShortChance
            ? max(1, Int(Double(ordered) * Double.random(in: Balance.wholesaleShortShare))) : ordered
        if shipped < ordered {
            let refund = offer.unitPrice * Double(ordered - shipped)
            addLedger(refund, .wholesale, "Short shipment refund · \(offer.product.name)")
            log("The distributor is short on \(offer.product.name). It ships \(shipped) of \(ordered) and refunds \(money(refund)).", cash: refund)
        }
        let arriving = ItemStatus.arriving(daysLeft: Balance.wholesaleDeliveryDays, from: "the distributor")
        var newItems: [SealedItem] = []
        for _ in 0..<(shipped / offer.caseSize) {
            newItems.append(makeCase(offer.product, units: offer.caseSize, paid: offer.casePrice, source: "Wholesale",
                                     status: arriving, caseFresh: true))
        }
        // The distributor broke the last case, and no one searched the boxes (Model/Cases.swift).
        for _ in 0..<(shipped % offer.caseSize) {
            var u = SealedItem(setSlug: offer.product.homeSlug, name: offer.product.name, packs: offer.product.packs,
                               paid: offer.unitPrice, acquired: .now, source: "Wholesale", productID: offer.product.id,
                               status: arriving, acquiredDay: today)
            u.caseFresh = true
            newItems.append(u)
        }
        data.sealed += newItems
        // 5. Hot cases on the hobby account go into the back-door check.
        if hot, hasStoreAccount {
            let delivered = today + Balance.wholesaleDeliveryDays
            data.distributor.hotRecords += newItems.map { HotAllocationRecord(itemID: $0.id, units: $0.caseUnits ?? 1, deliveredDay: delivered) }
        }
        let fillText = filled < cases ? " The distributor filled \(filled) of \(cases)." : ""
        log("Ordered \(orderName) from the distributor for \(money(total)).\(fillText) It arrives in \(Balance.wholesaleDeliveryDays) days.", cash: -total)
        save()
        return filled < cases ? "Hot product is short. The distributor filled \(filled) of \(cases) and charged only for those." : nil
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
            var item = SealedItem(setSlug: product.homeSlug, name: product.name, packs: product.packs, paid: split.pricePerBox,
                                  acquired: .now, source: "Case split with \(split.organizer)", productID: product.id,
                                  status: .arriving(daysLeft: max(1, split.arrivesDay - data.day), from: "the case split"),
                                  acquiredDay: data.day)
            // The boxes come from one factory case that no one searched.
            item.caseFresh = true
            data.sealed.append(item)
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
        let options = SetLibrary.catalog.filter {
            ($0.kind == "Elite Trainer Box" || ($0.kind == "Booster box" && $0.packs == 36)) && $0.market > 0
        }
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

    #if DEBUG
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
    #endif
}
