import Foundation

/// A drawing the player entered. One entry for each drawing (proposal 1.4).
/// A new field must be Optional. This type decodes inside an array or a dictionary, so a missing key drops all of it.
struct DrawingEntry: Codable, Identifiable, Hashable {
    var id = UUID()
    let chain: LocalStore
    let productID: String
    /// The draw happens at the End Day of this day. The result is in the next morning's report.
    let drawDay: Int
    let price: Double
}

/// An online order that the store can still cancel (proposal 1.5).
/// A new field must be Optional. This type decodes inside an array or a dictionary, so a missing key drops all of it.
struct DropOrder: Codable, Identifiable, Hashable {
    var id = UUID()
    let itemID: UUID
    /// "Pokemon Center" or "Target.com".
    let source: String
    let name: String
    let rollDay: Int
    var chance: Double
    let refund: Double
    let bot: Bool
}

/// Monthly restock alerts (proposal 1.8). The $150 restock alert bot upgrade stays as it is.
enum AlertTier: String, Codable, CaseIterable, Hashable {
    case none, oneChain, allChains

    var fee: Double {
        switch self {
        case .none: 0
        case .oneChain: Balance.alertFeeOneChain
        case .allChains: Balance.alertFeeAllChains
        }
    }

    var name: String {
        switch self {
        case .none: "No alerts"
        case .oneChain: "One chain"
        case .allChains: "Every chain"
        }
    }
}

/// A distributor order that never arrived. The refund comes after a claim.
/// A new field must be Optional. This type decodes inside an array or a dictionary, so a missing key drops all of it.
struct MissingShipment: Codable, Identifiable, Hashable {
    var id = UUID()
    let name: String
    /// The day the player learns that the order is lost (its normal delivery day).
    let noticeDay: Int
    let refundDay: Int
    let refund: Double
    var noticed = false
    /// The account that paid for the order. The refund goes back to it (Model/BusinessAccount.swift).
    var account: MoneyAccount?
}

/// A drawing that the player can enter now. Not saved: the seed makes it.
struct DrawingOffer: Identifiable, Hashable {
    let chain: LocalStore
    let product: Product
    let drawDay: Int
    let price: Double
    /// The product is part of the ID, because a level 3 chain drawing can fall on the same chain and day as the weekly drawing.
    var id: String { "\(chain.rawValue)-\(drawDay)-\(product.id)" }
}

extension Balance {
    /// The monthly fee of each alert tier, and the days to the 1st under which a new alert waits for the 1st.
    static let alertFeeOneChain = 8.0
    static let alertFeeAllChains = 25.0
    static let alertProrateDays = 7

    /// The weekly Walmart drawing: the win chance, the weekday of the draw (0 is Monday), the days that a win waits for
    /// the player to pay, and the delivery time of a Walmart win.
    static let drawingWinChance = 0.08
    static let drawingWeekday = 2
    static let drawingClaimDays = 2
    static let drawingDeliveryDays = 4

    /// An online order that the store can still cancel: the normal chance, the chance with the checkout bot, and the
    /// most days to the roll.
    static let dropCancelChance = 0.05
    static let dropCancelBotChance = 0.35
    static let dropCancelWindowMax = 3

    /// The Target.com drop: the chance of a drop on Friday and on other days, the chance that an attempt works, the
    /// attempts a day without and with the checkout bot, and the delivery time.
    static let targetDropFridayChance = 0.5
    static let targetDropOtherChance = 0.08
    static let targetDropSuccess = 0.20
    static let targetAttempts = 1
    static let targetBotAttempts = 2
    static let targetDeliveryDays = 3

    /// The report warns this many days before the club membership ends.
    static let clubWarnDays = 7

    /// The chance that a distributor order never arrives, and the days from the notice to the refund.
    static let wholesaleMissingChance = 0.01
    static let missingShipmentRefundDays = 14
}

@MainActor
extension GameStore {
    // MARK: - Drawings (proposal 1.4)

    /// This week's Walmart drawing: entries Monday to Wednesday, the draw at the End Day of Wednesday. The product
    /// comes from the in-print pool on Monday of the week, so it does not change during the week.
    var walmartDrawing: DrawingOffer? {
        let week = data.day / 7
        let monday = week * 7
        let drawDay = monday + Balance.drawingWeekday
        guard data.day <= drawDay else { return nil }
        var r = SeededRandom(seed: (UInt64(week + 1) &* 86_028_121 &+ 77) ^ data.marketSeed)
        let pool = Market.bigStorePool.filter { $0.inPrint(on: monday) && $0.isHot(day: monday) }
        guard !pool.isEmpty else { return nil }
        let p = pool[r.int(0...(pool.count - 1))]
        guard let price = p.retailMSRP(day: monday) else { return nil }
        return DrawingOffer(chain: .walmart, product: p, drawDay: drawDay, price: price)
    }

    /// Level 3: each strict chain draws its hot batch items. Entries close at the chain's next vendor day.
    var chainDrawings: [DrawingOffer] {
        let today = data.day
        return LocalStore.allCases.filter { !$0.isGameShop && strictness($0).level == 3 }.compactMap { store in
            let slot = vendorSlot(store)
            let next = today + ((slot.weekday - today % 7) % 7 + 7) % 7
            guard let item = Market.batch(store, vendorDay: next, seed: data.marketSeed).first(where: \.hot) else { return nil }
            return DrawingOffer(chain: store, product: item.product, drawDay: next, price: item.price)
        }
    }

    func entry(for offer: DrawingOffer) -> DrawingEntry? {
        data.retail.drawings.first { $0.chain == offer.chain && $0.drawDay == offer.drawDay && $0.productID == offer.product.id }
    }

    /// A free entry. One entry for each drawing.
    func enterDrawing(_ offer: DrawingOffer) {
        guard entry(for: offer) == nil, data.day <= offer.drawDay else { return }
        data.retail.drawings.append(DrawingEntry(chain: offer.chain, productID: offer.product.id, drawDay: offer.drawDay,
                                                 price: offer.price))
        log("Entered the \(offer.chain.rawValue) drawing for \(offer.product.name).")
        save()
    }

    /// The result of one entry. A win goes to the claim list for `drawingClaimDays`. Nothing is charged (D-11).
    /// Separate from the roll, so the test can force a result.
    func resolveDrawing(_ entry: DrawingEntry, won: Bool) -> String {
        guard let p = SetLibrary.product(entry.productID) else { return "" }
        let place = entry.chain == .walmart ? "Walmart's online drawing" : "the \(entry.chain.rawValue) drawing"
        guard won else { return "You did not win \(place) for \(p.name)." }
        let until = data.day + Balance.drawingClaimDays
        data.retail.drawingWins.append(DrawingWin(chain: entry.chain, productID: p.id, price: entry.price, claimUntil: until))
        return "You won \(place) for \(p.name)! Pay \(money(entry.price)) and claim it on the hub by \(GameCalendar.date(until).text)."
    }

    /// Pays for a win and claims it. Returns false when the cash is short or the win lapsed. The win leaves the list
    /// before the charge, so one win never charges twice.
    @discardableResult
    func claimDrawingWin(_ id: UUID) -> Bool {
        let today = data.day
        guard let win = data.retail.drawingWins.first(where: { $0.id == id }), win.claimUntil >= today,
              canAfford(win.price), let p = SetLibrary.product(win.productID) else { return false }
        data.retail.drawingWins.removeAll { $0.id == id }
        addLedger(-win.price, .sealed, "\(p.name) · \(win.chain.rawValue) drawing")
        let from = win.chain == .walmart ? "Walmart.com" : "\(win.chain.rawValue) pickup"
        let days = win.chain == .walmart ? Balance.drawingDeliveryDays : 1
        data.sealed.append(SealedItem(setSlug: p.homeSlug, name: p.name, packs: p.packs, paid: win.price, acquired: .now,
                                      source: "Won a \(win.chain.rawValue) drawing", productID: p.id,
                                      status: .arriving(daysLeft: days, from: from), acquiredDay: today))
        log("Claimed your \(win.chain.rawValue) drawing win: \(p.name) for \(money(win.price)).", cash: -win.price)
        save()
        return true
    }

    // MARK: - Cancellations (proposal 1.5)

    /// The roll day is at most the day before the item arrives. `advanceSealed` clears `.arriving` and `.onTheWay`
    /// at `daysLeft <= 1`, and `retailOrdersEndDay` runs after it (A-M2).
    func addDropOrder(item: SealedItem, source: String, bot: Bool, refund: Double, deliveryDays: Int) {
        let window = 1...max(1, min(Balance.dropCancelWindowMax, deliveryDays - 1))
        let order = DropOrder(itemID: item.id, source: source, name: item.name, rollDay: data.day + Int.random(in: window),
                              chance: bot ? Balance.dropCancelBotChance : Balance.dropCancelChance, refund: refund, bot: bot)
        data.retail.dropOrders.append(order)
    }

    func dropOrder(for itemID: UUID) -> DropOrder? { data.retail.dropOrders.first { $0.itemID == itemID } }

    /// Takes the item back and refunds it. Nil when the item already arrived or left the inventory. The item leaves
    /// before the refund, and the order is gone from the list already, so one order never refunds twice.
    func cancelOrder(_ order: DropOrder) -> String? {
        let id = order.itemID
        guard let item = data.sealed.first(where: { $0.id == id }) else { return nil }
        switch item.status {
        case .onTheWay, .arriving: break
        default: return nil
        }
        data.sealed.removeAll { $0.id == id }
        addLedger(order.refund, .sealed, "Order cancelled · \(order.name) · \(order.source)")
        if order.bot {
            recordHiddenAct(.botOrderCancelled, weight: 0.5, note: "\(order.source) flagged your bot order for \(order.name)")
        }
        return "\(order.source) cancelled your order for \(order.name) and refunded \(money(order.refund)). "
            + (order.bot ? "Its systems flagged the checkout as a bot." : "A wave of cancellations hit many buyers.")
    }

    // MARK: - End Day

    /// Integration step 8: drawing results, lapsed claims, cancellations, and the club warning. Runs after
    /// `advanceSealed`, so a new `.arriving` item keeps its full days.
    func retailOrdersEndDay() -> [String] {
        var lines: [String] = []
        let today = data.day
        let ended = today - 1
        // Drawings and claims (proposal 1.4). The win never charges here, so it never takes the rent money.
        var retail = data.retail
        let dueDrawings = retail.drawings.filter { $0.drawDay <= ended }
        retail.drawings = retail.drawings.filter { $0.drawDay > ended }
        let lapsed = retail.drawingWins.filter { $0.claimUntil < today }
        retail.drawingWins = retail.drawingWins.filter { $0.claimUntil >= today }
        let dueOrders = retail.dropOrders.filter { $0.rollDay <= today }
        retail.dropOrders = retail.dropOrders.filter { $0.rollDay > today }
        data.retail = retail
        for entry in dueDrawings {
            lines.append(resolveDrawing(entry, won: Double.random(in: 0..<1) < Balance.drawingWinChance))
        }
        for win in lapsed {
            lines.append("Your \(win.chain.rawValue) drawing win for \(SetLibrary.product(win.productID)?.name ?? "a product") lapsed. Nothing was charged.")
        }
        // Cancellations (proposal 1.5).
        for order in dueOrders where Double.random(in: 0..<1) < order.chance {
            if let line = cancelOrder(order) { lines.append(line) }
        }
        // Missing distributor shipments.
        lines += missingShipmentsEndDay()
        // The club membership ends in 7 days (proposal 1.7).
        if let until = data.retail.clubUntil, until == today + Balance.clubWarnDays {
            lines.append("Your warehouse club membership ends in \(Balance.clubWarnDays) days. Renew it at the club stop.")
        }
        return lines
    }

    // MARK: - Missing distributor shipments

    /// The order is lost on the way. `learnIn` is the days until the player learns it: the normal delivery days.
    /// The refund comes `missingShipmentRefundDays` after that.
    func registerMissingShipment(name: String, refund: Double, learnIn: Int, account: MoneyAccount? = nil) {
        let notice = data.day + learnIn
        data.retail.missingShipments.append(MissingShipment(name: name, noticeDay: notice,
                                                            refundDay: notice + Balance.missingShipmentRefundDays, refund: refund,
                                                            account: account == .business ? .business : nil))
    }

    /// Tells the player about a lost order, and pays each refund once. A refund counts as a wholesale credit, so it
    /// nets the order cost for income tax.
    func missingShipmentsEndDay() -> [String] {
        let today = data.day
        var lines: [String] = []
        var all = data.retail.missingShipments
        for i in all.indices where !all[i].noticed && all[i].noticeDay <= today {
            all[i].noticed = true
            lines.append("Your \(all[i].name) did not arrive. The distributor's truck never reached you. It opened a claim, and the refund comes in \(Balance.missingShipmentRefundDays) days.")
        }
        let paid = all.filter { $0.refundDay <= today }
        data.retail.missingShipments = all.filter { $0.refundDay > today }
        for s in paid {
            addLedger(s.refund, .wholesale, "Missing shipment refund · \(s.name)", account: s.account ?? .personal)
            lines.append("The distributor refunded \(money(s.refund)) for the missing \(s.name).")
        }
        return lines
    }

    // MARK: - Target.com and the checkout bot (proposal 2.6)

    /// Target.com restocks most on Fridays. One hot in-print product at MSRP, 1 unit.
    func targetDrop(day: Int) -> StoreOffer? {
        var r = SeededRandom(seed: (UInt64(day + 1) &* 32_452_867 &+ 4_049) ^ data.marketSeed)
        let chance = day % 7 == 4 ? Balance.targetDropFridayChance : Balance.targetDropOtherChance
        guard r.double(0...1) < chance else { return nil }
        let kinds = ["Elite Trainer Box", "Booster bundle", "Collection", "Tin", "Blister"]
        let pool = Market.bigStorePool.filter { kinds.contains($0.kind) && $0.inPrint(on: day) && $0.isHot(day: day) }
        guard !pool.isEmpty else { return nil }
        let p = pool[r.int(0...(pool.count - 1))]
        guard let price = p.retailMSRP(day: day) else { return nil }
        return StoreOffer(id: "tgt-\(day)", store: .amazon, item: .product(p, p.homeSlug), price: price, shipping: 0,
                          deliveryDays: Balance.targetDeliveryDays, note: "Target.com · limit 1")
    }

    var targetAttemptsLeft: Int {
        let used = data.retail.targetAttemptDay == data.day ? data.retail.targetAttempts : 0
        return (hasUpgrade(.checkoutBot) ? Balance.targetBotAttempts : Balance.targetAttempts) - used
    }

    /// One Target.com attempt. Without the bot, one attempt. With the bot owned, two, and the second needs the bot.
    /// Each bot attempt adds heat.
    func attemptTargetDrop(_ offer: StoreOffer, bot: Bool) -> Bool {
        let owns = hasUpgrade(.checkoutBot)
        let useBot = bot && owns
        let today = data.day
        guard targetAttemptsLeft > 0, useBot || targetAttemptsLeft > (owns ? 1 : 0),
              !data.boughtToday.contains(offer.id), canAfford(offer.price), let p = offer.product else { return false }
        var retail = data.retail
        retail.targetAttempts = retail.targetAttemptDay == today ? retail.targetAttempts + 1 : 1
        retail.targetAttemptDay = today
        data.retail = retail
        if useBot { addHeat(Balance.heatBotUse, at: nil, act: .botCheckout, weight: 0.5, note: "Used a checkout bot on Target.com") }
        guard Double.random(in: 0..<1) < Balance.targetDropSuccess else {
            log("Missed the Target.com drop for \(p.name).")
            save()
            return false
        }
        data.boughtToday.append(offer.id)
        addLedger(-offer.price, .sealed, "\(p.name) · Target.com")
        let item = SealedItem(setSlug: p.homeSlug, name: p.name, packs: p.packs, paid: offer.price, acquired: .now,
                              source: "Bought on Target.com", productID: p.id,
                              status: .arriving(daysLeft: Balance.targetDeliveryDays, from: "Target.com"), acquiredDay: today)
        data.sealed.append(item)
        addDropOrder(item: item, source: "Target.com", bot: useBot, refund: offer.price, deliveryDays: Balance.targetDeliveryDays)
        log("Bought \(p.name) on Target.com for \(money(offer.price)).", cash: -offer.price)
        save()
        return true
    }

    // MARK: - Restock alerts (proposal 1.8)

    /// The chains the alerts cover now.
    var alertedStores: [LocalStore] {
        guard data.day >= data.retail.alertStartDay else { return [] }
        switch data.retail.alertTier {
        case .none: return []
        case .oneChain: return data.retail.alertStore.map { [$0] } ?? []
        case .allChains: return LocalStore.allCases.filter(\.isBigStore)
        }
    }

    /// Starts, changes, or stops the alerts. From no alerts: with more than `alertProrateDays` to the 1st, the first
    /// month is charged now and the alerts start now. Otherwise they start on the 1st, and End Day charges them then.
    /// A move to a dearer tier charges the difference now. A move to a cheaper tier or a new chain charges nothing.
    /// Each charge counts only the part above `alertPaid`, the fee paid this month.
    @discardableResult
    func subscribeAlerts(_ tier: AlertTier, store: LocalStore?) -> Bool {
        guard tier != .oneChain || store?.isBigStore == true else { return false }
        let old = data.retail.alertTier
        var retail = data.retail
        // The fee that the player already paid this month counts. A stop and a new start in one month charge nothing twice.
        let owed = max(0, tier.fee - retail.alertPaid)
        if old == .none, tier != .none {
            if daysUntilRent > Balance.alertProrateDays {
                guard canAfford(owed) else { return false }
                if owed > 0 { addLedger(-owed, .businessCosts, "Restock alerts · \(tier.name)") }
                retail.alertPaid = max(retail.alertPaid, tier.fee)
                retail.alertStartDay = data.day
            } else {
                retail.alertStartDay = data.day + daysUntilRent
            }
        } else if old != .none, tier.fee > old.fee, data.day >= retail.alertStartDay {
            guard canAfford(owed) else { return false }
            if owed > 0 { addLedger(-owed, .businessCosts, "Restock alerts · upgrade to \(tier.name)") }
            retail.alertPaid = max(retail.alertPaid, tier.fee)
        }
        retail.alertTier = tier
        retail.alertStore = tier == .oneChain ? store : nil
        data.retail = retail
        save()
        return true
    }

    /// Integration step 20: the fee on the 1st with the other monthly costs, then tomorrow's vendor days for the
    /// alerted chains. The fee skips a day that already has an alert charge.
    func alertsEndDay() -> [String] {
        var lines: [String] = []
        let tier = data.retail.alertTier
        let today = data.day
        if GameCalendar.isFirstOfMonth(today), tier == .none { data.retail.alertPaid = 0 }
        if tier != .none, GameCalendar.isFirstOfMonth(today),
           !data.ledger.contains(where: { $0.day == today && $0.label.hasPrefix("Restock alerts") }) {
            if coverWithLine(tier.fee, for: "Restock alerts") {
                addLedger(-tier.fee, .businessCosts, "Restock alerts · \(tier.name)")
                data.retail.alertPaid = tier.fee
                lines.append("Restock alerts: \(money(tier.fee)).")
            } else {
                data.retail.alertPaid = 0
                data.retail.alertTier = .none
                data.retail.alertStore = nil
                lines.append("You could not pay \(money(tier.fee)) for restock alerts. The alerts stopped.")
            }
        }
        let tomorrow = (today + 1) % 7
        for store in alertedStores where vendorSlot(store).weekday == tomorrow {
            lines.append("Restock alert: \(store.rawValue) gets its vendor stock tomorrow at about \(GameStore.clock(vendorSlot(store).hour)).")
        }
        return lines
    }
}
