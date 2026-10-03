import Foundation

// Sourcing at the player's own store: the buylist, store credit, and the bulk box (docs/22-own-store.md).

/// The sourcing settings and totals of the store. `CardStoreState` holds it as an Optional, so old saves still load.
struct StoreSourcing: Codable, Hashable {
    /// The cash offer as a share of market. 0 means the buylist is off.
    var buylistRate = 0.0
    /// The most cash the buylist spends in one day.
    var buylistBudget = Balance.buylistBudgets[1]
    /// The clerk offers store credit first, at the bonus rate.
    var offerCredit = false
    /// Store credit that customers hold. The store owes it.
    var creditOwed = 0.0
    /// Bulk cards that the player moved from Inventory. They are for sale at the bulk box price.
    var bulkBox: [BulkGroup] = []

    var bulkCards: Int { bulkBox.reduce(0) { $0 + $1.cards.count } }
}

extension CardStoreState {
    var source: StoreSourcing {
        get { sourcing ?? StoreSourcing() }
        set { sourcing = newValue }
    }
}

extension Balance {
    /// The buylist cash offer, as a share of market. The share at 50% is the base for the number of sellers.
    static let buylistRates = [0.4, 0.5, 0.6]
    static let buylistBaseRate = 0.5
    static let buylistBudgets = [100.0, 250, 500, 1000]
    /// Walk-in sellers for each customer in the clerk hours, at the base rate. A higher rate brings more.
    static let buylistSellerShare = 0.10
    /// What a walk-in seller takes at least, as a share of market.
    static let buylistSellerFloor = 0.40...0.75
    /// Store credit is worth this much more than the cash offer.
    static let creditBonus = 1.3
    /// The share of sellers who take store credit when the clerk offers it, and the credit is enough.
    static let creditTakeChance = 0.6
    /// The most of a day's sales that customers pay with store credit.
    static let creditRedeemShare = 0.25
    /// The price of one card from the bulk box.
    static let bulkBoxPrice = 0.10
    /// The share of small-budget customers who look in the bulk box.
    static let bulkBuyChance = 0.5
    static let bulkHandful = 5...20
}

/// What a walk-in seller brings: a single, a slab, or sealed product. It is the same idea as `ShowSession.sellerGoods`.
@MainActor
enum StoreSeller {
    static func goods() -> (VendorGoods, Double)? {
        let roll = Double.random(in: 0..<1)
        if roll < 0.5, let (p, s) = VendorFloor.randomPrint(from: Double.random(in: 0..<1) < 0.6 ? Balance.vintageSets + Balance.olderSets
                                                             : Balance.modernSets, minMarket: 4) {
            let c = Balance.vintageSets.contains(s) || Balance.olderSets.contains(s) ? Condition.played() : .packFresh()
            return (.single(p, slug: s, condition: c), (p.market ?? 0) * c.wear.valueFactor)
        }
        if roll < 0.7, let (p, s) = VendorFloor.randomPrint(from: Balance.showSets, minMarket: 10) {
            let grade = SlabGrade(company: Bool.random() ? .psa : .cgc, grade: [7.0, 8, 9, 9, 10].randomElement() ?? 9)
            return (.slab(p, slug: s, grade: grade), OwnedCard(print: p, setSlug: s, acquired: .now, paid: nil, ripID: nil, grade: grade).market)
        }
        guard let product = SetLibrary.catalog.filter({ Balance.showSets.contains($0.homeSlug) && $0.market > 0 }).randomElement() else {
            return nil
        }
        return (.sealed(product), product.market)
    }
}

@MainActor
extension GameStore {
    // MARK: - Settings

    func setBuylist(rate: Double, budget: Double, offerCredit: Bool) {
        guard var s = data.cardStore else { return }
        s.source.buylistRate = rate
        s.source.buylistBudget = budget
        s.source.offerCredit = offerCredit
        data.cardStore = s
        save()
    }

    // MARK: - Store credit

    var storeCreditOwed: Double { data.cardStore?.source.creditOwed ?? 0 }

    /// The credit for a cash offer.
    func storeCreditOffer(cash: Double) -> Double { ShowSession.round(cash * Balance.creditBonus) }

    /// A seller takes credit. The store owes it from now on.
    func addStoreCredit(_ amount: Double) {
        guard var s = data.cardStore else { return }
        s.source.creditOwed += amount
        data.cardStore = s
    }

    /// Customers pay part of the sales with credit. No cash comes in for that part. Returns the credit used.
    @discardableResult
    func redeemStoreCredit(sales: Double) -> Double {
        guard var s = data.cardStore, s.source.creditOwed >= 0.01, sales > 0 else { return 0 }
        let used = min(s.source.creditOwed, (sales * Balance.creditRedeemShare * 100).rounded() / 100)
        guard used >= 0.01 else { return 0 }
        s.source.creditOwed -= used
        data.cardStore = s
        addLedger(-used, .sale, "Paid with store credit · \(s.name)")
        log("Customers paid \(money(used)) of the sales at \(s.name) with store credit.")
        return used
    }

    // MARK: - Bulk box

    /// Bulk groups in Inventory that the player can move to the box.
    var movableBulk: [BulkGroup] { data.bulk }

    func moveBulkToBox(_ ids: Set<UUID>) {
        guard var s = data.cardStore else { return }
        let groups = data.bulk.filter { ids.contains($0.id) }
        guard !groups.isEmpty else { return }
        data.bulk.removeAll { ids.contains($0.id) }
        s.source.bulkBox += groups
        data.cardStore = s
        let count = groups.reduce(0) { $0 + $1.cards.count }
        log("Moved \(count) bulk card\(count == 1 ? "" : "s") to the bulk box at \(s.name).")
        save()
    }

    /// Takes every group in the box back to Inventory.
    func takeBulkBack() {
        guard var s = data.cardStore, !s.source.bulkBox.isEmpty else { return }
        data.bulk += s.source.bulkBox
        s.source.bulkBox = []
        data.cardStore = s
        save()
    }

    /// Removes cards from the box, oldest group first. Returns how many left.
    private func takeFromBulkBox(_ count: Int) -> Int {
        guard var s = data.cardStore else { return 0 }
        var left = count
        var taken = 0
        for i in s.source.bulkBox.indices where left > 0 {
            let n = min(left, s.source.bulkBox[i].cards.count)
            s.source.bulkBox[i].cards.removeLast(n)
            left -= n
            taken += n
        }
        s.source.bulkBox.removeAll { $0.cards.isEmpty }
        data.cardStore = s
        return taken
    }

    /// Small-budget customers buy handfuls from the bulk box at a fixed price for each card.
    private func rollBulkSales(share: Double) -> (sold: Int, revenue: Double) {
        guard let s = data.cardStore, s.source.bulkCards > 0 else { return (0, 0) }
        let mean = expectedCustomers(day: data.day) * share * s.location.casualShare
        let shoppers = max(0, Int((mean + Double.random(in: -1...1)).rounded()))
        var sold = 0
        var cards = 0
        for _ in 0..<shoppers where Double.random(in: 0..<1) < Balance.bulkBuyChance {
            let taken = takeFromBulkBox(Int.random(in: Balance.bulkHandful))
            guard taken > 0 else { break }
            sold += 1
            cards += taken
        }
        let revenue = Double(cards) * Balance.bulkBoxPrice
        if cards > 0 { addLedger(revenue, .sale, "Bulk box · \(cards) cards · \(s.name)") }
        return (sold, revenue)
    }

    // MARK: - The clerk's buylist

    /// Walk-in sellers in the clerk hours. The store buys when the offer meets the seller's floor and the budget allows.
    /// The clerk does not look for fakes.
    private func rollBuylist(share: Double) -> [String] {
        guard let s = data.cardStore, s.clerk, s.source.buylistRate > 0 else { return [] }
        let src = s.source
        let mean = expectedCustomers(day: data.day) * share * Balance.buylistSellerShare * src.buylistRate / Balance.buylistBaseRate
        let sellers = max(0, Int((mean + Double.random(in: -1...1)).rounded()))
        var budget = src.buylistBudget
        var cashBought = 0
        var cashSpent = 0.0
        var creditBought = 0
        var creditGiven = 0.0
        var overBudget = false
        for _ in 0..<sellers {
            guard let (goods, market) = StoreSeller.goods(), market > 0 else { continue }
            let cash = ShowSession.round(market * src.buylistRate)
            let floor = market * Double.random(in: Balance.buylistSellerFloor)
            let credit = storeCreditOffer(cash: cash)
            let takesCredit = src.offerCredit && Double.random(in: 0..<1) < Balance.creditTakeChance && credit >= floor
            guard takesCredit || cash >= floor else { continue }
            guard cash <= budget, takesCredit || canAfford(cash) else {
                overBudget = true
                continue
            }
            budget -= cash
            buyFromWalkIn(goods, price: cash, credit: takesCredit ? credit : nil, storeName: s.name)
            if takesCredit {
                creditBought += 1
                creditGiven += credit
            } else {
                cashBought += 1
                cashSpent += cash
            }
        }
        var lines: [String] = []
        let count = cashBought + creditBought
        if count > 0 {
            var line = "The clerk bought \(count) item\(count == 1 ? "" : "s") at \(Int((src.buylistRate * 100).rounded()))% of market for \(money(cashSpent)) in cash"
            if creditBought > 0 { line += " and \(money(creditGiven)) in store credit" }
            lines.append(line + ". They are in Inventory.")
        }
        if overBudget { lines.append("The clerk hit the \(money(src.buylistBudget)) daily budget and turned sellers away.") }
        if !lines.isEmpty { for line in lines { log(line) } }
        return lines
    }

    /// The item goes to Inventory in hand. `price` is the cash offer, and it is the cost for profit. The clerk
    /// does not catch fakes, so the item can be one.
    private func buyFromWalkIn(_ goods: VendorGoods, price: Double, credit: Double?, storeName: String) {
        let source = "Walk-in seller, \(storeName)"
        switch goods {
        case .single(let print, let slug, let condition):
            var card = OwnedCard(print: print, setSlug: slug, acquired: .now, paid: price, ripID: nil, condition: condition)
            card.fake = Counterfeit.roll(source: .stranger, sealed: false, slug: slug, market: print.market ?? 0)
            card.acquiredDay = data.day
            data.raw.append(card)
            if credit == nil { addLedger(-price, .singles, "\(print.name) · \(source)") }
        case .slab(let print, let slug, let grade):
            var card = OwnedCard(print: print, setSlug: slug, acquired: .now, paid: price, ripID: nil, grade: grade)
            card.fake = Counterfeit.roll(source: .stranger, sealed: false, slug: slug, market: card.market)
            card.acquiredDay = data.day
            data.slabs.append(card)
            if credit == nil { addLedger(-price, .singles, "\(print.name) \(grade.label) · \(source)") }
        case .sealed(let product):
            var item = SealedItem(setSlug: product.homeSlug, name: product.name, packs: product.packs, paid: price,
                                  acquired: .now, source: source, productID: product.id, acquiredDay: data.day)
            item.fake = Counterfeit.roll(source: .stranger, sealed: true, slug: product.homeSlug, market: product.market, msrp: product.msrp)
            data.sealed.append(item)
            if credit == nil { addLedger(-price, .sealed, "\(product.name) · \(source)") }
        case .mystery:
            return
        }
        if let credit { addStoreCredit(credit) }
    }

    // MARK: - End Day

    /// The sourcing part of an open day: the bulk box, store credit used in sales, and the clerk's buylist.
    /// The caller saves its copy of the store first, and reads it again after this call.
    func storeSourcingDay(share: Double, shelfSales: Double) -> (lines: [String], revenue: Double, sold: Int) {
        var lines: [String] = []
        let bulk = rollBulkSales(share: share)
        if bulk.sold > 0 {
            lines.append("Customers bought bulk cards for \(money(bulk.revenue)) from the bulk box.")
        }
        redeemStoreCredit(sales: shelfSales + bulk.revenue)
        lines += rollBuylist(share: share)
        return (lines, bulk.revenue, bulk.sold)
    }
}
