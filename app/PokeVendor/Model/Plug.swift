import Foundation

// The gray plug (docs/12-acquiring-product.md, The plug). A seller with no invoice. It sells only full cases of hot
// in-print products that exist now, so it is not a preorder.

enum PlugOrderState: String, Codable { case waiting, delivered, vanished, seized }

/// A new field must be Optional. This type decodes inside an array.
struct PlugOrder: Codable, Identifiable, Hashable {
    var id = UUID()
    let productID: String
    let productName: String
    let cases: Int
    let caseUnits: Int
    let unitPrice: Double
    let total: Double
    let orderedDay: Int
    var arrivesDay: Int
    /// Fixed when the order goes in, so the order row can show the risk the player took.
    let vanishChance: Double
    var state: PlugOrderState = .waiting
    /// The units that arrived.
    var shippedUnits: Int?
    var deliveredIDs: [UUID] = []
    var seizeDay: Int?
    /// The `plugPurchase` act of this order, so a seizure can retire it.
    var actID: UUID?
}

/// The gray market plug (proposal 4.7).
struct PlugState: Codable, Hashable {
    var name: String?
    var unlockedDay: Int?
    /// The plug vanished on this day. A new plug can appear `plugReturnDays` later.
    var goneDay: Int?
    var cleanOrders = 0
    var orders: [PlugOrder] = []

    init() {}

    /// A save from an older build can miss newer fields. Each missing field takes its default.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func v<T: Decodable>(_ key: CodingKeys, _ fallback: T) -> T { (try? c.decodeIfPresent(T.self, forKey: key)) ?? fallback }
        name = v(.name, nil)
        unlockedDay = v(.unlockedDay, nil)
        goneDay = v(.goneDay, nil)
        cleanOrders = v(.cleanOrders, 0)
        orders = v(.orders, [])
    }
}

extension Balance {
    /// The plug appears with this chance each day, from day 14, at follower tier 1 or reputation Known.
    static let plugUnlockChance = 0.10
    static let plugMinDay = 14
    static let plugReturnDays = 28
    static let plugNames = ["Vince", "J-Money Sealed", "Kev (wholesale)", "BoxPlug_TX", "Rico"]
    static let plugMsrpShare = 0.85
    static let plugMarketFloor = 0.65
    static let plugOffersPerWeek = 3
    static let plugOffersLowPressure = 1
    static let plugMaxOrder = 20_000.0
    static let plugMaxCases = 5
    static let plugDeliveryDays = 5...10
    /// The plug vanishes: 6%, +1 point for each $1,000 above $2,000, at most 16%. Each clean order takes 1 point off,
    /// down to 3%.
    static let plugVanishBase = 0.06
    static let plugVanishStep = 0.01
    static let plugVanishFree = 2000.0
    static let plugVanishMax = 0.16
    static let plugVanishFloor = 0.03
    static let plugTrustStep = 0.01
    static let plugShortChance = 0.10
    static let plugShortShare = 0.6...0.9
    static let plugSeizeChance = 0.02
    static let plugSeizeDays = 3...14
    /// A hobby account that bought from a plug in the last 4 weeks: the rep learns of it with this chance each week.
    static let plugRepLearnChance = 0.10
    static let plugRepLearnCost = 20
    static let plugRepLearnWindowDays = 28
}

@MainActor
extension GameStore {
    #if DEBUG
    /// Test tools: they replace the rolls of the plug.
    static var forcePlugVanish: Bool?
    static var forcePlugShort: Bool?
    static var forcePlugSeize: Bool?
    #endif

    var plugOpen: Bool { data.plug.unlockedDay != nil && data.plug.goneDay == nil }

    /// This week's plug cases: hot in-print products, full cases only. The same week gives the same offers.
    /// Low flipper pressure means hot product is on shelves, so the gray channel has less.
    var plugOffers: [WholesaleOffer] {
        guard plugOpen else { return [] }
        var r = SeededRandom(seed: UInt64(data.day / 7 + 1) &* 92_821 &+ 4_441)
        let count = data.flipperPressure < 0.3 ? Balance.plugOffersLowPressure : Balance.plugOffersPerWeek
        let pool = SetLibrary.catalog.filter {
            $0.isInPrint && Balance.wholesaleKinds.contains($0.kind) && $0.msrp != nil && !$0.isStoreExclusive
                && CaseMath.units($0) != nil && isHot($0)
        }
        var out: [WholesaleOffer] = []
        for i in 0..<count where !pool.isEmpty {
            let p = pool[r.int(0...(pool.count - 1))]
            guard !out.contains(where: { $0.product.id == p.id }), let size = CaseMath.units(p) else { continue }
            let msrpNow = p.retailMSRP() ?? p.market
            let unit = Market.retail(max(msrpNow * Balance.plugMsrpShare, p.market * Balance.plugMarketFloor))
            out.append(WholesaleOffer(id: "plug\(data.day / 7)-\(i)", product: p, caseSize: size, unitPrice: unit,
                                      caseMarket: CaseMath.market(p, units: size)))
        }
        return out
    }

    func plugVanishChance(total: Double) -> Double {
        let size = Balance.plugVanishStep * max(0, (total - Balance.plugVanishFree) / 1000)
        let trust = Balance.plugTrustStep * Double(data.plug.cleanOrders)
        return max(Balance.plugVanishFloor, min(Balance.plugVanishMax, Balance.plugVanishBase + size) - trust)
    }

    /// Prepays a plug order from the cash balance. No invoice: the ledger uses `.grayMarket`, which income tax ignores.
    func orderFromPlug(_ offer: WholesaleOffer, cases: Int) -> String? {
        let restore = payAsBuyer()
        defer { restore() }
        guard plugOpen, cases > 0, cases <= Balance.plugMaxCases else { return nil }
        let total = offer.casePrice * Double(cases)
        guard total <= Balance.plugMaxOrder else { return "The plug does not take orders over \(money(Balance.plugMaxOrder))." }
        guard canAfford(total) else { return "You need \(money(total)). You have \(money(cash))." }
        let chance = plugVanishChance(total: total)
        let name = data.plug.name ?? "The plug"
        let today = data.day
        let arrives = today + Int.random(in: Balance.plugDeliveryDays)
        addLedger(-total, .grayMarket, "\(cases) case\(cases == 1 ? "" : "s") of \(offer.product.name) · \(name) · prepaid")
        var order = PlugOrder(productID: offer.product.id, productName: offer.product.name, cases: cases, caseUnits: offer.caseSize,
                              unitPrice: offer.unitPrice, total: total, orderedDay: today, arrivesDay: arrives, vanishChance: chance)
        order.actID = recordHiddenAct(.plugPurchase, weight: max(0.3, min(2.0, total / 2000)),
                                      note: "Bought \(cases) case\(cases == 1 ? "" : "s") of \(offer.product.name) from \(name)",
                                      sourceID: order.id)
        data.plug.orders.append(order)
        log("Prepaid \(name) \(money(total)) for \(cases) case\(cases == 1 ? "" : "s") of \(offer.product.name). It should come in \(arrives - today) days.", cash: -total)
        save()
        return nil
    }

    // MARK: - End Day

    func plugEndDay() -> [String] {
        var lines: [String] = []
        let today = data.day
        // 1. A new plug: the first time, or 28 days after the last one vanished. One contact ID, so the list never grows.
        let eligible = followerTier >= 1 || reputationTier >= 1
        let returnOK = data.plug.goneDay.map { today >= $0 + Balance.plugReturnDays } ?? (data.plug.unlockedDay == nil)
        if eligible, today >= Balance.plugMinDay, returnOK, Double.random(in: 0..<1) < Balance.plugUnlockChance {
            let name = Balance.plugNames.randomElement() ?? "Vince"
            var plug = PlugState()
            plug.name = name
            plug.unlockedDay = today
            plug.orders = data.plug.orders                       // the history stays; a vanish closed every waiting order
            data.contacts.removeAll { $0.id == "plug" }
            var c = Contact(id: "plug", name: name, kind: .plug, points: 10, interests: [.sealed])
            c.rewardedLevel = 4
            data.contacts.append(c)
            data.plug = plug
            lines.append("\(name) messaged you: \"I can get you full cases of the hot stuff. No questions, no paperwork. Cash up front.\" Open Buy, then Gray market.")
        }
        // 2. Orders that arrive today. Work on a local copy, then write it back once.
        let plugName = data.plug.name ?? "The plug"
        var orders = data.plug.orders
        var clean = data.plug.cleanOrders
        var vanished = false
        var newItems: [SealedItem] = []
        for k in orders.indices where orders[k].state == .waiting && orders[k].arrivesDay <= today {
            let o = orders[k]
            guard let product = SetLibrary.product(o.productID) else { continue }
            #if DEBUG
            let vanish = GameStore.forcePlugVanish ?? (Double.random(in: 0..<1) < o.vanishChance)
            #else
            let vanish = Double.random(in: 0..<1) < o.vanishChance
            #endif
            if vanish {
                vanished = true
                // The plug takes every prepaid order with it, not only this one.
                let lost = orders.filter { $0.state == .waiting }.reduce(0) { $0 + $1.total }
                for j in orders.indices where orders[j].state == .waiting { orders[j].state = .vanished }
                lines.append("\(plugName) stopped answering. Your \(money(lost)) in prepaid orders is gone, and so is the plug.")
                break
            }
            let ordered = o.cases * o.caseUnits
            #if DEBUG
            let short = GameStore.forcePlugShort ?? (Double.random(in: 0..<1) < Balance.plugShortChance)
            #else
            let short = Double.random(in: 0..<1) < Balance.plugShortChance
            #endif
            let shipped = short ? max(1, Int(Double(ordered) * Double.random(in: Balance.plugShortShare))) : ordered
            if shipped < ordered {
                let refund = o.unitPrice * Double(ordered - shipped)
                addLedger(refund, .grayMarket, "Short shipment refund · \(o.productName)")
                lines.append("The plug came up short: \(shipped) of \(ordered) units. It sent back \(money(refund)).")
            }
            var ids: [UUID] = []
            // One fake roll covers a whole case.
            for _ in 0..<(shipped / o.caseUnits) {
                let fake = Counterfeit.roll(source: .plug, sealed: true, slug: product.homeSlug,
                                            market: CaseMath.market(product, units: o.caseUnits), msrp: (product.msrp ?? 0) * Double(o.caseUnits))
                let item = makeCase(product, units: o.caseUnits, paid: o.unitPrice * Double(o.caseUnits), source: "Plug · \(plugName)",
                                    status: nil, fake: fake, caseFresh: false, grayOrder: o.id)
                ids.append(item.id)
                newItems.append(item)
            }
            for _ in 0..<(shipped % o.caseUnits) {
                var u = SealedItem(setSlug: product.homeSlug, name: product.name, packs: product.packs, paid: o.unitPrice, acquired: .now,
                                   source: "Plug · \(plugName)", productID: product.id, status: nil, acquiredDay: today)
                u.fake = Counterfeit.roll(source: .plug, sealed: true, slug: product.homeSlug, market: product.market, msrp: product.msrp)
                u.grayOrder = o.id
                ids.append(u.id)
                newItems.append(u)
            }
            orders[k].deliveredIDs = ids
            orders[k].shippedUnits = shipped
            orders[k].state = .delivered
            clean += 1
            #if DEBUG
            let seize = GameStore.forcePlugSeize ?? (Double.random(in: 0..<1) < Balance.plugSeizeChance)
            #else
            let seize = Double.random(in: 0..<1) < Balance.plugSeizeChance
            #endif
            if seize { orders[k].seizeDay = today + Int.random(in: Balance.plugSeizeDays) }
            lines.append("\(plugName) dropped off \(o.productName): \(shipped) units. No invoice.")
        }
        // 3. Seizures that happen today.
        var seizedGray: Set<UUID> = []
        for k in orders.indices where orders[k].state == .delivered && orders[k].seizeDay == today {
            orders[k].state = .seized
            seizedGray.insert(orders[k].id)
        }
        // Write back once.
        data.plug.orders = orders
        data.plug.cleanOrders = clean
        if vanished { data.plug.goneDay = today }
        data.sealed += newItems
        if !seizedGray.isEmpty { lines += seizePlugStock(seizedGray, orders: orders.filter { seizedGray.contains($0.id) }) }
        return lines
    }

    /// Police take plug stock that turned out to be stolen. The items leave with no refund, wherever they are.
    private func seizePlugStock(_ gray: Set<UUID>, orders: [PlugOrder]) -> [String] {
        var lines: [String] = []
        // Read everything into locals first.
        let taken = data.sealed.filter { $0.grayOrder.map(gray.contains) == true }
        let listed = taken.filter { if case .listed = $0.status { return true }; return $0.onlineListing != nil }
        let orderIDs: [UUID] = taken.compactMap { if case .soldToViewer(let id) = $0.status { return id }; return nil }
        var machineLoss: [(machine: Int, ids: Set<UUID>)] = []
        let purchaseActs = orders.compactMap(\.actID)
        for (i, m) in data.machines.enumerated() {
            let ids = Set(m.stock.filter { $0.item.grayOrder.map(gray.contains) == true }.map(\.item.id))
            if !ids.isEmpty { machineLoss.append((i, ids)) }
        }
        // A Rip & Ship order of seized stock: Whatnot refunds the buyer.
        for id in Set(orderIDs) { lines.append(refundRipShipOrder(id, reason: .seized)) }
        lines.removeAll { $0.isEmpty }
        let takenIDs = Set(taken.map(\.id))
        data.sealed.removeAll { takenIDs.contains($0.id) }                 // reads only a local
        var machineCount = 0
        var machineWorth = 0.0
        for loss in machineLoss {
            let ids = loss.ids
            let worth = data.machines[loss.machine].stock.filter { ids.contains($0.item.id) }.reduce(0) { $0 + $1.item.paid }
            machineCount += ids.count
            machineWorth += worth
            data.machines[loss.machine].stock.removeAll { ids.contains($0.item.id) }   // reads only a local
        }
        let worth = taken.reduce(0) { $0 + $1.paid } + machineWorth
        data.openedPaid += worth
        let count = taken.count + machineCount
        lines.append("Police asked about product you bought from the plug. It was stolen. They took \(count) item\(count == 1 ? "" : "s") (paid \(money(worth))). No refund.")
        if !listed.isEmpty { lines.append("Your listing\(listed.count == 1 ? "" : "s") for \(listed.map(\.name).joined(separator: ", ")) ended.") }
        // One seizure gives one callout: the seizure act comes out on a fixed day, and the purchase act leaves the log.
        let reveal = data.day + 2
        if let first = orders.first {
            recordHiddenAct(.plugSeized, weight: 1.0,
                            note: "Police seized plug stock: \(orders.map(\.productName).joined(separator: ", "))",
                            revealDay: reveal, sourceID: first.id)
        }
        for act in purchaseActs {
            retireHiddenAct(act, force: true, reason: "The police seizure is now the story. The plug talk is dying down.")
        }
        return lines
    }

    /// A hobby account that bought from a plug in the last 4 weeks: each week the rep can learn of it.
    func plugRepCheck() -> [String] {
        guard hasStoreAccount, let rep = data.distributor.repContactID else { return [] }
        let since = data.day - Balance.plugRepLearnWindowDays
        guard data.plug.orders.contains(where: { $0.orderedDay >= since }) else { return [] }
        guard Double.random(in: 0..<1) < Balance.plugRepLearnChance else { return [] }
        addPoints(rep, -Balance.plugRepLearnCost)
        return ["Your distributor rep heard that you buy from a plug. The rep is not happy."]
    }

    #if DEBUG
    /// Test tool: the plug has messaged the player.
    func testUnlockPlug() {
        data.plug.name = "Test plug"
        data.plug.unlockedDay = data.day
        data.plug.goneDay = nil
        data.contacts.removeAll { $0.id == "plug" }
        var c = Contact(id: "plug", name: "Test plug", kind: .plug, points: 10, interests: [.sealed])
        c.rewardedLevel = 4
        data.contacts.append(c)
    }
    #endif
}
