import Foundation
import Observation

struct GameData: Codable {
    var day = 0
    var hour = Balance.dayStart
    var cash = 0.0
    var ledger: [LedgerEntry] = []
    var activity: [ActivityEntry] = []
    var jobIndex: Int? = 0
    var sickDaysLeft = Balance.sickDaysPerYear
    var sickToday = false
    var gameOver: String?

    var sealed: [SealedItem] = []
    var raw: [OwnedCard] = []
    var slabs: [OwnedCard] = []
    var bulk: [BulkGroup] = []
    /// The amount paid for opened product. The portfolio header counts it once.
    var openedPaid: Double = 0

    /// Store listings the player bought today. They leave the store until the next day.
    var boughtToday: [String] = []
    var pokemonCenterAttempted = false
}

/// What happened overnight, for the morning report.
struct DayReport: Identifiable {
    let id = UUID()
    let day: Int
    var lines: [String]
}

@MainActor @Observable
final class GameStore {
    private(set) var data: GameData
    var report: DayReport?
    private let url: URL

    init() {
        url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("game.json")
        if let saved = try? JSONDecoder().decode(GameData.self, from: Data(contentsOf: url)) {
            data = saved
        } else {
            data = GameData()
            startRun()
        }
    }

    // MARK: - Calendar and clock

    static let weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    var day: Int { data.day }
    var weekday: Int { data.day % 7 }
    var weekdayName: String { Self.weekdays[weekday] }
    var week: Int { data.day / 7 + 1 }
    var isWorkDay: Bool { weekday < 5 && job != nil }
    var worksToday: Bool { isWorkDay && !data.sickToday }
    var job: Job? { data.jobIndex.map { Job.ladder[$0] } }
    var daysUntilRent: Int { Balance.rentCycleDays - data.day % Balance.rentCycleDays }

    static func clock(_ hour: Double) -> String {
        let h = Int(hour) % 24
        let m = Int(((hour - Double(Int(hour))) * 60).rounded())
        let suffix = h < 12 ? "AM" : "PM"
        let h12 = h % 12 == 0 ? 12 : h % 12
        return m == 0 ? "\(h12) \(suffix)" : String(format: "%d:%02d %@", h12, m, suffix)
    }

    /// The free hours left today, outside the work shift.
    var hoursLeft: Double {
        var left = max(0, Balance.dayEnd - data.hour)
        if worksToday {
            let overlap = max(0, min(Balance.workEnd, Balance.dayEnd) - max(Balance.workStart, data.hour))
            left -= overlap
        }
        return left
    }

    /// The start time for a block of hours today, or nil when it does not fit. The block skips the work shift.
    func slot(for hours: Double) -> Double? {
        var start = data.hour
        if worksToday && start < Balance.workEnd && start + hours > Balance.workStart {
            start = max(start, Balance.workEnd)
        }
        return start + hours <= Balance.dayEnd ? start : nil
    }

    @discardableResult
    func spendHours(_ hours: Double) -> Bool {
        guard let start = slot(for: hours) else { return false }
        data.hour = start + hours
        save()
        return true
    }

    func callInSick() {
        guard isWorkDay, !data.sickToday, data.sickDaysLeft > 0 else { return }
        data.sickToday = true
        data.sickDaysLeft -= 1
        log("You called in sick. \(data.sickDaysLeft) sick days left.")
        save()
    }

    // MARK: - Money

    var cash: Double { data.cash }

    @discardableResult
    func addLedger(_ amount: Double, _ category: LedgerEntry.Category, _ label: String, pending: Bool = false) -> UUID {
        let entry = LedgerEntry(day: data.day, amount: amount, category: category, label: label, pending: pending)
        data.cash += amount
        data.ledger.append(entry)
        return entry.id
    }

    func log(_ text: String, cash: Double? = nil) {
        data.activity.append(ActivityEntry(day: data.day, text: text, cash: cash))
    }

    func canAfford(_ amount: Double) -> Bool { data.cash >= amount - 0.001 }

    // MARK: - Inventory values

    func market(of item: SealedItem) -> Double {
        if let product = SetLibrary.product(item.productID, in: item.setSlug) { return product.market }
        return (SetLibrary.set(item.setSlug).packCost ?? 0) * Double(item.packs)
    }

    var marketValue: Double {
        data.sealed.reduce(0) { $0 + market(of: $1) }
            + data.raw.reduce(0) { $0 + $1.market }
            + data.slabs.reduce(0) { $0 + $1.market }
            + data.bulk.reduce(0) { $0 + $1.value }
    }

    var paid: Double {
        data.sealed.reduce(0) { $0 + $1.paid }
            + data.raw.reduce(0) { $0 + ($1.paid ?? 0) }
            + data.slabs.reduce(0) { $0 + ($1.paid ?? 0) }
            + data.openedPaid
    }

    var net: Double { marketValue - paid }

    /// Collection value counts only kept items (docs/03-currencies.md, Collection value).
    var collectionValue: Double {
        data.sealed.filter(\.keep).reduce(0) { $0 + market(of: $1) }
            + data.raw.filter(\.keep).reduce(0) { $0 + $1.market }
            + data.slabs.filter(\.keep).reduce(0) { $0 + $1.market }
    }

    func isKept(_ id: UUID) -> Bool {
        data.sealed.contains { $0.id == id && $0.keep }
            || data.raw.contains { $0.id == id && $0.keep }
            || data.slabs.contains { $0.id == id && $0.keep }
    }

    func hasStatus(_ id: UUID) -> Bool {
        data.sealed.contains { $0.id == id && $0.status != nil }
            || data.raw.contains { $0.id == id && $0.status != nil }
            || data.slabs.contains { $0.id == id && $0.status != nil }
    }

    func card(_ id: UUID) -> OwnedCard? {
        data.raw.first { $0.id == id } ?? data.slabs.first { $0.id == id }
    }

    func setKeep(_ ids: Set<UUID>, _ keep: Bool) {
        for i in data.sealed.indices where ids.contains(data.sealed[i].id) { data.sealed[i].keep = keep }
        for i in data.raw.indices where ids.contains(data.raw[i].id) { data.raw[i].keep = keep }
        for i in data.slabs.indices where ids.contains(data.slabs[i].id) { data.slabs[i].keep = keep }
        save()
    }

    // MARK: - Runs

    func startRun() {
        data = GameData()
        addLedger(Balance.startingCash, .startingCapital, "Starting capital")
        log("Day 1. You have \(money(Balance.startingCash)) and a job as a retail associate.")
        save()
    }

    // MARK: - Test tools

    /// A free loose pack for testing. It counts the market price as paid, and it does not touch cash.
    func addTestPack(slug: String = "prismatic-evolutions") {
        let set = SetLibrary.set(slug)
        let loose = set.products?.first { $0.kind == "Booster pack" && $0.packs == 1 }
        data.sealed.append(SealedItem(setSlug: slug, name: "\(set.name) Booster Pack", packs: 1, paid: set.packCost ?? 0,
                                      acquired: .now, source: "Test pack", productID: loose?.id, acquiredDay: data.day))
        save()
    }

    func addTestCard(_ print: CardPrint, slug: String = "prismatic-evolutions") {
        data.raw.append(OwnedCard(print: print, setSlug: slug, acquired: .now, paid: nil, ripID: nil, acquiredDay: data.day))
        save()
    }

    func addTestCash(_ amount: Double) {
        addLedger(amount, .test, "Test cash")
        save()
    }

    // MARK: - Ripping

    /// Called when the rip tears a pack. The seal is broken, so the cards belong to the player at once.
    /// A product with more packs breaks into loose packs, and the rip takes one of them.
    func commitPack(from sourceID: UUID, setSlug: String, paidPerPack: Double, ripID: UUID, cards: [RipCard]) {
        if let i = data.sealed.firstIndex(where: { $0.id == sourceID }) {
            let item = data.sealed.remove(at: i)
            if item.packs > 1 {
                let set = SetLibrary.set(item.setSlug)
                let loose = set.products?.first { $0.kind == "Booster pack" && $0.packs == 1 }
                for _ in 1..<item.packs {
                    data.sealed.append(SealedItem(setSlug: item.setSlug, name: "\(set.name) Booster Pack", packs: 1,
                                                  paid: item.paidPerPack, acquired: item.acquired,
                                                  source: "From an opened \(item.name)", productID: loose?.id,
                                                  brokenFrom: item.id, acquiredDay: data.day))
                }
            }
        } else if let i = data.sealed.firstIndex(where: { $0.brokenFrom == sourceID }) {
            data.sealed.remove(at: i)
        }
        data.openedPaid += paidPerPack
        var bulk: [CardPrint] = []
        for card in cards {
            guard let print = card.print else { continue }
            if card.isHit {
                data.raw.append(OwnedCard(print: print, setSlug: setSlug, acquired: .now, paid: nil, ripID: ripID,
                                          acquiredDay: data.day))
            } else {
                bulk.append(print)
            }
        }
        if let i = data.bulk.firstIndex(where: { $0.ripID == ripID }) {
            data.bulk[i].cards += bulk
        } else if !bulk.isEmpty {
            data.bulk.append(BulkGroup(ripID: ripID, setSlug: setSlug, date: .now, cards: bulk, day: data.day))
        }
        save()
    }

    // MARK: - Buying

    func buy(_ offer: StoreOffer) -> Bool {
        let total = offer.price + offer.shipping
        guard canAfford(total), !data.boughtToday.contains(offer.id) else { return false }
        if offer.pickup {
            guard spendHours(Balance.facebookPickupHours) else { return false }
        }
        data.boughtToday.append(offer.id)
        let status: ItemStatus? = offer.pickup ? nil : .onTheWay(daysLeft: offer.deliveryDays, store: offer.store)
        switch offer.item {
        case .product(let product, let slug):
            addLedger(-total, .sealed, "\(product.name) · \(offer.store.rawValue)")
            data.sealed.append(SealedItem(setSlug: slug, name: product.name, packs: product.packs, paid: total,
                                          acquired: .now, source: "Bought on \(offer.store.rawValue)",
                                          productID: product.id, status: status, acquiredDay: data.day))
        case .single(let print, let slug):
            addLedger(-total, .singles, "\(print.name) · \(offer.store.rawValue)")
            data.raw.append(OwnedCard(print: print, setSlug: slug, acquired: .now, paid: total, ripID: nil,
                                      condition: .secondHand(), status: status, acquiredDay: data.day))
        }
        log("Bought \(offer.title) on \(offer.store.rawValue) for \(money(total)).", cash: -total)
        save()
        return true
    }

    /// One attempt per Pokemon Center drop (docs/12-acquiring-product.md, Pokemon Center drops).
    func attemptDrop(_ offer: StoreOffer) -> Bool {
        guard !data.pokemonCenterAttempted, canAfford(offer.price + offer.shipping) else { return false }
        data.pokemonCenterAttempted = true
        if Double.random(in: 0..<1) < Balance.pokemonCenterSuccessChance {
            return buy(offer)
        }
        log("Missed the Pokemon Center drop for \(offer.title).")
        save()
        return false
    }

    // MARK: - Selling

    func list(_ ids: Set<UUID>, channel: Listing.Channel, price: (UUID) -> Double, auctionDays: Int?, insured: Bool) {
        func listing(_ id: UUID) -> ItemStatus {
            .listed(Listing(channel: channel, price: price(id), dayListed: data.day,
                            auctionEndDay: auctionDays.map { data.day + $0 }, insured: insured))
        }
        for i in data.raw.indices where ids.contains(data.raw[i].id) { data.raw[i].status = listing(data.raw[i].id) }
        for i in data.slabs.indices where ids.contains(data.slabs[i].id) { data.slabs[i].status = listing(data.slabs[i].id) }
        for i in data.sealed.indices where ids.contains(data.sealed[i].id) { data.sealed[i].status = listing(data.sealed[i].id) }
        log("Listed \(ids.count) item\(ids.count == 1 ? "" : "s") on \(channel.rawValue).")
        save()
    }

    func removeListing(_ id: UUID) {
        for i in data.raw.indices where data.raw[i].id == id { data.raw[i].status = nil }
        for i in data.slabs.indices where data.slabs[i].id == id { data.slabs[i].status = nil }
        for i in data.sealed.indices where data.sealed[i].id == id { data.sealed[i].status = nil }
        save()
    }

    /// The fees and shipping for a sale at a price.
    static func saleCosts(price: Double, channel: Listing.Channel, sealed: Bool, insured: Bool) -> (fees: Double, shipping: Double, insurance: Double) {
        let fees = channel == .tcgplayer ? price * Balance.tcgFeeRate + Balance.tcgFeeFlat
                                         : price * Balance.ebayFeeRate + Balance.ebayFeeFlat
        let shipping = Balance.shippingCost(for: price, sealed: sealed)
        return (fees, shipping, insured ? Balance.insuranceCost(for: price) : 0)
    }

    /// The lowest competing listing on TCGplayer for a card. It sits a little under the market price.
    static func tcgLowest(for print: CardPrint) -> Double {
        let market = print.market ?? 0
        var hash: UInt64 = 1469598103934665603
        for b in (print.num + print.variant).utf8 { hash = (hash ^ UInt64(b)) &* 1099511628211 }
        let cut = 0.90 + Double(hash % 1000) / 1000 * 0.09
        return max(0.05, (market * cut * 100).rounded() / 100)
    }

    // MARK: - Grading

    func submit(_ ids: Set<UUID>, to company: GradingCompany, tier: GradingTier) {
        let cards = data.raw.filter { ids.contains($0.id) && $0.status == nil }
        guard !cards.isEmpty else { return }
        let fee = tier.fee * Double(cards.count)
        let ledgerID = addLedger(-fee, .grading, "\(cards.count) card\(cards.count == 1 ? "" : "s") to \(company.rawValue) \(tier.name)",
                                 pending: true)
        for i in data.raw.indices where ids.contains(data.raw[i].id) && data.raw[i].status == nil {
            data.raw[i].status = .atGrader(company: company, tier: tier.name, daysLeft: tier.days, ledgerID: ledgerID)
        }
        log("Sent \(cards.count) card\(cards.count == 1 ? "" : "s") to \(company.rawValue) (\(tier.name), \(tier.days) days).", cash: -fee)
        save()
    }

    /// The overall grade: the worst subgrade leads, and each company adds its own spread (docs/10-grading.md).
    static func gradeResult(_ c: Condition, company: GradingCompany) -> SlabGrade {
        let subs = c.subgrades
        let worst = subs.min() ?? 10
        let average = subs.reduce(0, +) / Double(subs.count)
        let noise = (Double.random(in: -1...1) + Double.random(in: -1...1)) / 2 * company.spread * 2
        let raw = min(10, worst * 0.7 + average * 0.3 + noise)
        switch company {
        case .psa:
            return SlabGrade(company: .psa, grade: max(1, min(10, raw.rounded(.toNearestOrAwayFromZero))))
        case .cgc:
            return SlabGrade(company: .cgc, grade: max(1, min(10, (raw * 2).rounded() / 2)))
        case .bgs:
            let black = subs.allSatisfy { $0 == 10 }
            let grade = black ? 10 : max(1, min(raw >= 9.75 ? 10 : 9.5, (raw * 2).rounded() / 2))
            return SlabGrade(company: .bgs, grade: grade, blackLabel: black)
        }
    }

    // MARK: - End Day

    func endDay() {
        guard data.gameOver == nil else { return }
        var lines: [String] = []
        let endedWeekday = weekday

        if endedWeekday == 4, let job {
            addLedger(job.weeklyPay, .paycheck, "Paycheck · \(job.title)")
            lines.append("Payday: \(money(job.weeklyPay)) from your job.")
        }

        data.day += 1
        data.hour = Balance.dayStart
        data.sickToday = false
        data.boughtToday = []
        data.pokemonCenterAttempted = false
        if data.day % 364 == 0 { data.sickDaysLeft = job?.sickDays ?? Balance.sickDaysPerYear }

        lines += advanceSealed()
        lines += advanceCards()

        if data.day % Balance.rentCycleDays == 0 {
            if canAfford(Balance.rent) {
                addLedger(-Balance.rent, .rent, "Rent")
                lines.append("Rent paid: \(money(Balance.rent)).")
            } else {
                data.gameOver = "Rent was due on day \(data.day + 1), and you had \(money(data.cash)). You could not pay it."
                lines.append("You could not pay rent. The run is over.")
            }
        } else if daysUntilRent == Balance.rentWarningDays {
            lines.append("Rent of \(money(Balance.rent)) is due in \(Balance.rentWarningDays) days.")
        }

        if isPokemonCenterDropLive {
            lines.append("A Pokemon Center drop is live today.")
        }
        for line in lines { log(line) }
        report = DayReport(day: data.day, lines: lines)
        save()
    }

    var isPokemonCenterDropLive: Bool {
        var rng = SeededRandom(seed: UInt64(data.day) &* 7919 &+ 17)
        return Double(rng.next()) < Balance.pokemonCenterDropChance
    }

    private func advanceSealed() -> [String] {
        var lines: [String] = []
        var keepItems: [SealedItem] = []
        for var item in data.sealed {
            switch item.status {
            case .onTheWay(let days, let store):
                if days <= 1 {
                    item.status = nil
                    lines.append("Delivered from \(store.rawValue): \(item.name).")
                } else {
                    item.status = .onTheWay(daysLeft: days - 1, store: store)
                }
            case .listed(let listing):
                if let sale = rollSale(listing, market: market(of: item), sealed: true) {
                    lines.append(completeSale(name: item.name, listing: listing, price: sale, sealed: true))
                    continue
                } else if listingExpired(listing) {
                    item.status = nil
                    lines.append("Your \(listing.channel.rawValue) listing for \(item.name) ended with no sale.")
                }
            default:
                break
            }
            keepItems.append(item)
        }
        data.sealed = keepItems
        return lines
    }

    private func advanceCards() -> [String] {
        var lines: [String] = []
        var raw: [OwnedCard] = []
        var slabs = data.slabs.filter { $0.status == nil }
        for var card in data.raw {
            switch card.status {
            case .onTheWay(let days, let store):
                if days <= 1 {
                    card.status = nil
                    lines.append("Delivered from \(store.rawValue): \(card.print.name).")
                } else {
                    card.status = .onTheWay(daysLeft: days - 1, store: store)
                }
            case .atGrader(let company, let tier, let days, let ledgerID):
                if days <= 1 {
                    let grade = Self.gradeResult(card.condition, company: company)
                    card.status = nil
                    card.grade = grade
                    slabs.append(card)
                    lines.append("\(card.print.name) came back from \(company.rawValue): \(grade.label), worth \(money(card.market)).")
                    if let i = data.ledger.firstIndex(where: { $0.id == ledgerID }) {
                        data.ledger[i].pending = data.raw.contains {
                            if case .atGrader(_, _, let d, let l) = $0.status, l == ledgerID, $0.id != card.id { return d > 1 }
                            return false
                        }
                        data.ledger[i].label += " · \(card.print.name) \(grade.label)"
                    }
                    continue
                }
                card.status = .atGrader(company: company, tier: tier, daysLeft: days - 1, ledgerID: ledgerID)
            case .listed(let listing):
                if let sale = rollSale(listing, card: card) {
                    lines.append(completeSale(name: card.print.name, listing: listing, price: sale, sealed: false))
                    continue
                } else if listingExpired(listing) {
                    card.status = nil
                    lines.append("Your \(listing.channel.rawValue) listing for \(card.print.name) ended with no sale.")
                }
            default:
                break
            }
            raw.append(card)
        }
        for var card in data.slabs where card.status != nil {
            if case .listed(let listing) = card.status {
                if let sale = rollSale(listing, card: card) {
                    lines.append(completeSale(name: "\(card.print.name) \(card.grade?.label ?? "")", listing: listing,
                                              price: sale, sealed: false))
                    continue
                } else if listingExpired(listing) {
                    card.status = nil
                    lines.append("Your \(listing.channel.rawValue) listing for \(card.print.name) ended with no sale.")
                }
            }
            slabs.append(card)
        }
        data.raw = raw
        data.slabs = slabs
        return lines
    }

    private func listingExpired(_ listing: Listing) -> Bool {
        listing.auctionEndDay == nil && data.day - listing.dayListed >= Balance.listingDays
    }

    private func rollSale(_ listing: Listing, card: OwnedCard) -> Double? {
        if listing.channel == .tcgplayer {
            let lowest = Self.tcgLowest(for: card.print)
            let chance = listing.price <= lowest ? 0.30 : 0.30 * exp(-(listing.price / lowest - 1) * 35)
            return Double.random(in: 0..<1) < chance ? listing.price : nil
        }
        return rollSale(listing, market: card.market, sealed: false, slab: card.grade != nil)
    }

    private func rollSale(_ listing: Listing, market: Double, sealed: Bool, slab: Bool = false) -> Double? {
        switch listing.channel {
        case .ebayAuction:
            guard let end = listing.auctionEndDay, data.day >= end else { return nil }
            if Double.random(in: 0..<1) < 0.05 { return nil }
            let spread = (Double.random(in: -1...1) + Double.random(in: -1...1)) / 2 * 0.35
            return max(0.99, (market * (0.95 + spread) * 100).rounded() / 100)
        case .ebay:
            let base = slab || sealed ? 0.14 : 0.10
            let chance = base * exp(-(listing.price / max(market, 0.01) - 1) * 8)
            return Double.random(in: 0..<1) < min(0.6, chance) ? listing.price : nil
        case .tcgplayer:
            let chance = 0.30 * exp(-(listing.price / max(market * 0.95, 0.01) - 1) * 35)
            return Double.random(in: 0..<1) < chance ? listing.price : nil
        }
    }

    private func completeSale(name: String, listing: Listing, price: Double, sealed: Bool) -> String {
        let costs = Self.saleCosts(price: price, channel: listing.channel, sealed: sealed, insured: listing.insured)
        let net = price - costs.fees - costs.shipping - costs.insurance
        addLedger(net, .sale, "\(name) · \(listing.channel.rawValue) · sold \(money(price))")
        var line = "Sold \(name) on \(listing.channel.rawValue) for \(money(price)). You got \(money(net)) after fees and shipping."
        if Double.random(in: 0..<1) < Balance.lossChance {
            if listing.insured {
                line += " The package got lost, and the insurance paid you back."
            } else {
                addLedger(-price, .refund, "Lost package · \(name)")
                line += " The package got lost with no insurance, so the buyer got a refund of \(money(price))."
            }
        }
        return line
    }

    // MARK: - Saving

    func save() {
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? JSONEncoder().encode(data).write(to: url, options: .atomic)
    }
}
