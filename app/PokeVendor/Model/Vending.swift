import Foundation

// Vending machines (docs/31-vending-machines.md). The player buys a machine, places it with a host, and stocks it with
// sealed product. The machine sells while the player does other things, mostly at night. A visit collects the cash
// box, restocks, and clears a jam. The host takes a share. A machine can jam, and someone can break into it.

enum VendingHost: String, Codable, CaseIterable, Identifiable {
    case gasStation = "Gas station"
    case laundromat = "Laundromat"
    case mall = "Mall"
    case ownStore = "Your store"

    var id: String { rawValue }

    /// The mean number of sales on a day, for a machine with stock at fair prices.
    var traffic: Double {
        switch self {
        case .gasStation: 2.6
        case .laundromat: 1.6
        case .mall: 4.0
        case .ownStore: 2.0
        }
    }

    /// The host's share of each sale.
    var share: Double {
        switch self {
        case .gasStation: 0.15
        case .laundromat: 0.10
        case .mall: 0.20
        case .ownStore: 0
        }
    }

    /// The chance of a break-in on a day, before a camera.
    var breakInChance: Double {
        switch self {
        case .gasStation: 0.006
        case .laundromat: 0.008
        case .mall: 0.0015
        case .ownStore: 0.001
        }
    }

    /// The hours of one visit, with travel.
    var visitHours: Double {
        switch self {
        case .gasStation, .laundromat: 1.0
        case .mall: 1.5
        case .ownStore: 0.25
        }
    }

    /// The reputation tier that the host asks for. A mall wants a Known seller.
    var minReputationTier: Int { self == .mall ? 1 : 0 }

    /// The share of the sales after dark, for the report.
    var nightShare: Double {
        switch self {
        case .gasStation: 0.65
        case .laundromat: 0.5
        case .mall: 0.2
        case .ownStore: 0.6
        }
    }
}

/// One sealed item in a machine, with its price.
struct VendItem: Codable, Hashable, Identifiable {
    var id: UUID { item.id }
    let item: SealedItem
    var price: Double
}

struct VendingMachine: Codable, Hashable, Identifiable {
    var id = UUID()
    /// Nil: the machine is at home, with no host.
    var host: VendingHost?
    var placedDay = 0
    var stock: [VendItem] = []
    /// The cash in the machine, after the host's share. A visit collects it.
    var cashBox = 0.0
    var jammed = false
    /// The last day the player visited the machine.
    var lastVisit = 0
    var cardReader = false
    var camera = false
    var telemetry = false
    /// The sales and the gross since the last visit, for the visit summary.
    var salesSinceVisit = 0
    var grossSinceVisit = 0.0
    var lifetimeGross = 0.0
    /// The markup on market for the machine's prices. Nil: the default.
    var markup: Double?
    /// The first day of the current run of empty or jammed days. Nil while the machine sells.
    var idleSince: Int?
    /// Every item that left the machine: sold, stolen, or sent back to Inventory.
    var soldCount = 0
    var stolenCount = 0
    var returnedCount = 0

    var priceMarkup: Double { markup ?? Balance.vendMarkup }
}

/// A part that the player can add to one machine.
enum VendingAddOn: String, CaseIterable, Identifiable {
    case cardReader = "Card reader"
    case camera = "Camera"
    case telemetry = "Remote stock data"

    var id: String { rawValue }

    var cost: Double {
        switch self {
        case .cardReader: 300
        case .camera: 250
        case .telemetry: 150
        }
    }

    var detail: String {
        switch self {
        case .cardReader: "Buyers can tap a card: 30% more sales. Card sales go to your bank at once, less a 3% fee."
        case .camera: "A break-in is 60% less likely."
        case .telemetry: "The End Day report shows each sale, a jam, and an empty machine."
        }
    }
}

extension Balance {
    static let vendMachineCost = 2_850.0
    static let vendMachinesMax = 5
    static let vendCapacity = 40
    static let vendJamChance = 0.015
    static let vendCardReaderBoost = 1.3
    /// The share of sales by card when the machine has a card reader, and the card fee.
    static let vendCardShare = 0.6
    static let vendCardFee = 0.03
    static let vendCameraCut = 0.4
    /// A break-in takes the cash box and this share of the stock, and the repair costs this much.
    static let vendBreakInStock = 0.3...0.6
    static let vendRepair = 150.0...400.0
    /// An outside host ends the contract when the machine is empty or jammed this many days in a row.
    static let vendNeglectDays = 7
    /// The default price of an item: its market times this, at a retail price.
    static let vendMarkup = 1.25
    static let vendMarkups = [1.0, 1.15, 1.25, 1.4]
    /// How fast the sale chance falls with the price over market.
    static let vendPriceSlope = 4.0
}

@MainActor
extension GameStore {
    var machines: [VendingMachine] { data.machines }

    func machine(_ id: UUID) -> VendingMachine? { data.machines.first { $0.id == id } }

    var canBuyMachine: Bool { data.machines.count < Balance.vendMachinesMax && data.cash >= Balance.vendMachineCost }

    func buyMachine() {
        guard canBuyMachine else { return }
        addLedger(-Balance.vendMachineCost, .businessCosts, "Vending machine")
        data.machines.append(VendingMachine(lastVisit: data.day))
        log("Bought a vending machine for \(money(Balance.vendMachineCost)). Place it with a host to start selling.")
        save()
    }

    /// Why a host does not take a machine now, or nil when it does.
    func hostBlock(_ host: VendingHost) -> String? {
        if host == .ownStore && data.cardStore == nil { return "You need your own store." }
        if reputationTier < host.minReputationTier { return "A mall wants a \(ReputationTier.names[host.minReputationTier]) seller." }
        if data.machines.contains(where: { $0.host == host }) && host != .gasStation && host != .laundromat {
            return "\(host.rawValue) has room for one machine."
        }
        return nil
    }

    /// Places a machine at home with a host. It costs the visit's hours.
    @discardableResult
    func placeMachine(_ id: UUID, at host: VendingHost) -> Bool {
        guard let i = data.machines.firstIndex(where: { $0.id == id }), data.machines[i].host == nil,
              hostBlock(host) == nil, spendHours(host.visitHours) else { return false }
        data.machines[i].host = host
        data.machines[i].placedDay = data.day
        data.machines[i].lastVisit = data.day
        log("Placed a vending machine at the \(host.rawValue.lowercased()). The host takes \(Int(host.share * 100))% of each sale.")
        save()
        return true
    }

    /// Brings a machine home: its stock goes back to Inventory, and the visit collects the cash box.
    func pullMachine(_ id: UUID) {
        guard let i = data.machines.firstIndex(where: { $0.id == id }), let host = data.machines[i].host,
              spendHours(host.visitHours) else { return }
        collect(i)
        data.machines[i].returnedCount += data.machines[i].stock.count
        data.sealed += data.machines[i].stock.map(\.item)
        data.machines[i].stock = []
        data.machines[i].host = nil
        data.machines[i].jammed = false
        log("Brought the vending machine home from the \(host.rawValue.lowercased()).")
        save()
    }

    /// A visit: collect the cash box and clear a jam. Restocking happens during the visit, on the machine screen.
    @discardableResult
    func visitMachine(_ id: UUID) -> String? {
        guard let i = data.machines.firstIndex(where: { $0.id == id }), let host = data.machines[i].host,
              spendHours(host.visitHours) else { return nil }
        let m = data.machines[i]
        let collected = m.cashBox
        let sales = m.salesSinceVisit
        let wasJammed = m.jammed
        collect(i)
        data.machines[i].jammed = false
        if !data.machines[i].stock.isEmpty { data.machines[i].idleSince = nil }
        save()
        var text = "\(sales) sale\(sales == 1 ? "" : "s") since your last visit. You collected \(money(collected)) from the cash box."
        if wasJammed { text += " The machine was jammed. You cleared it." }
        return text
    }

    private func collect(_ i: Int) {
        let m = data.machines[i]
        if m.cashBox > 0, let host = m.host {
            addLedger(m.cashBox, .sale, "Vending · \(host.rawValue) · cash box")
        }
        data.machines[i].cashBox = 0
        data.machines[i].salesSinceVisit = 0
        data.machines[i].grossSinceVisit = 0
        data.machines[i].lastVisit = data.day
    }

    /// The sealed items that can go in a machine: in hand, not kept, and not a known fake.
    var vendableSealed: [SealedItem] {
        data.sealed.filter { $0.status == nil && !$0.keep && !$0.isKnownFake }
    }

    /// The machine price of a sealed item at a markup.
    func vendPrice(_ item: SealedItem, markup: Double = Balance.vendMarkup) -> Double {
        Market.retail(realMarket(of: item) * markup)
    }

    private func cents(_ value: Double) -> Double { (value * 100).rounded() / 100 }

    /// True when the player visited the machine today, so the player can restock it and change its prices.
    func atMachine(_ id: UUID) -> Bool {
        guard let m = machine(id), m.host != nil else { return false }
        return m.lastVisit == data.day
    }

    /// Moves sealed items from Inventory into a machine during a visit. Returns the number moved.
    @discardableResult
    func stockMachine(_ id: UUID, items ids: Set<UUID>) -> Int {
        guard atMachine(id), let i = data.machines.firstIndex(where: { $0.id == id }) else { return 0 }
        let room = Balance.vendCapacity - data.machines[i].stock.count
        let picked = vendableSealed.filter { ids.contains($0.id) }.prefix(max(0, room))
        guard !picked.isEmpty else { return 0 }
        let moved = Set(picked.map(\.id))
        let markup = data.machines[i].priceMarkup
        data.machines[i].stock += picked.map { VendItem(item: $0, price: vendPrice($0, markup: markup)) }
        data.machines[i].idleSince = nil
        data.sealed.removeAll { moved.contains($0.id) }
        save()
        return picked.count
    }

    /// Takes an item out of a machine during a visit, back to Inventory.
    func unstockMachine(_ id: UUID, item: UUID) {
        guard atMachine(id), let i = data.machines.firstIndex(where: { $0.id == id }),
              let j = data.machines[i].stock.firstIndex(where: { $0.id == item }) else { return }
        data.sealed.append(data.machines[i].stock.remove(at: j).item)
        data.machines[i].returnedCount += 1
        save()
    }

    /// Sets every price in a machine to its market times a markup, during a visit.
    func setVendMarkup(_ id: UUID, markup: Double) {
        guard atMachine(id), let i = data.machines.firstIndex(where: { $0.id == id }) else { return }
        var stock = data.machines[i].stock
        for j in stock.indices { stock[j].price = Market.retail(realMarket(of: stock[j].item) * markup) }
        data.machines[i].stock = stock
        data.machines[i].markup = markup
        save()
    }

    func buyAddOn(_ addOn: VendingAddOn, for id: UUID) {
        guard let i = data.machines.firstIndex(where: { $0.id == id }), data.cash >= addOn.cost else { return }
        switch addOn {
        case .cardReader: guard !data.machines[i].cardReader else { return }; data.machines[i].cardReader = true
        case .camera: guard !data.machines[i].camera else { return }; data.machines[i].camera = true
        case .telemetry: guard !data.machines[i].telemetry else { return }; data.machines[i].telemetry = true
        }
        addLedger(-addOn.cost, .businessCosts, "Vending machine · \(addOn.rawValue)")
        save()
    }

    /// The chance that one vend picks an item, before the weights are normalized: cheap items and fair prices sell.
    private func vendWeight(_ v: VendItem) -> Double {
        let market = max(realMarket(of: v.item), 0.5)
        return exp(-(v.price / market - 1) * Balance.vendPriceSlope) / (1 + market / 50)
    }

    /// Brings a machine home from its host: its stock arrives in Inventory tomorrow, and its cash box goes to the bank.
    /// `machine` is a copy, so the write to `data` does not overlap it.
    private func sendHome(_ machine: inout VendingMachine, host: VendingHost) {
        var items = machine.stock.map(\.item)
        for k in items.indices { items[k].status = .arriving(daysLeft: 1, from: "the \(host.rawValue.lowercased())") }
        data.sealed += items
        machine.returnedCount += items.count
        if machine.cashBox > 0 { addLedger(machine.cashBox, .sale, "Vending · \(host.rawValue) · cash box") }
        machine.stock = []
        machine.cashBox = 0
        machine.host = nil
        machine.jammed = false
        machine.idleSince = nil
    }

    /// Brings the machine in the player's store home. The store closes today.
    func storeMachineHome() -> String? {
        guard let i = data.machines.firstIndex(where: { $0.host == .ownStore }) else { return nil }
        var machine = data.machines[i]
        let count = machine.stock.count
        sendHome(&machine, host: .ownStore)
        data.machines[i] = machine
        return "Your store's vending machine comes home\(count > 0 ? ", and its \(count) item\(count == 1 ? "" : "s") arrive tomorrow" : "")."
    }

    /// The day's sales, jams, break-ins, and neglect for each machine. Runs at End Day.
    func vendingEndDay() -> [String] {
        var lines: [String] = []
        var machines = data.machines
        let today = data.day
        let season = PriceCycle.seasonDemand(sealed: true)
        for i in machines.indices {
            guard let host = machines[i].host else { continue }
            let place = "the \(host.rawValue.lowercased())"
            // A machine in the player's store goes home when the store closes (closeStore does it; this is the backstop).
            if host == .ownStore && data.cardStore == nil {
                sendHome(&machines[i], host: host)
                lines.append("Your store closed, so its vending machine came home. Its stock arrives tomorrow.")
                continue
            }
            // Neglect: an outside host ends the contract when the machine is empty or jammed for days in a row.
            if machines[i].stock.isEmpty || machines[i].jammed {
                machines[i].idleSince = machines[i].idleSince ?? today
            } else {
                machines[i].idleSince = nil
            }
            if host != .ownStore, let since = machines[i].idleSince, today - since >= Balance.vendNeglectDays {
                let why = machines[i].jammed ? "jammed" : "empty"
                sendHome(&machines[i], host: host)
                lines.append("The \(host.rawValue.lowercased()) ended your vending contract: the machine sat \(why) for \(Balance.vendNeglectDays) days. The machine came home, and its stock arrives tomorrow.")
                continue
            }
            // A break-in takes the cash box and some stock, and needs a repair.
            let breakIn = host.breakInChance * (machines[i].camera ? Balance.vendCameraCut : 1)
            if Double.random(in: 0..<1) < breakIn {
                let lostCash = machines[i].cashBox
                let share = Double.random(in: Balance.vendBreakInStock)
                let lostCount = min(machines[i].stock.count, Int((Double(machines[i].stock.count) * share).rounded()))
                machines[i].stock.shuffle()
                machines[i].stock.removeFirst(lostCount)
                machines[i].stolenCount += lostCount
                machines[i].cashBox = 0
                let repair = Double.random(in: Balance.vendRepair).rounded()
                addLedger(-repair, .businessCosts, "Vending machine repair · \(host.rawValue)")
                lines.append("Someone broke into your vending machine at \(place). They took \(money(lostCash)) and \(lostCount) item\(lostCount == 1 ? "" : "s"). The repair cost \(money(repair)).")
            }
            if machines[i].jammed { continue }
            if Double.random(in: 0..<1) < Balance.vendJamChance {
                machines[i].jammed = true
                if machines[i].telemetry { lines.append("Your vending machine at \(place) jammed. A visit clears it.") }
                continue
            }
            // Sales: a Poisson count of vends, each picks an item by weight.
            let mean = host.traffic * season * (machines[i].cardReader ? Balance.vendCardReaderBoost : 1)
            var count = 0
            let limit = exp(-mean)
            var product = Double.random(in: 0..<1)
            while product > limit && count < 30 { count += 1; product *= Double.random(in: 0..<1) }
            let venue = "Vending · \(host.rawValue)"
            var gross = 0.0, toBank = 0.0, sold = 0
            for _ in 0..<count {
                let weights = machines[i].stock.map(vendWeight)
                let total = weights.reduce(0, +)
                guard total > 0 else { break }
                var roll = Double.random(in: 0..<total)
                var pick = weights.count - 1
                for (k, w) in weights.enumerated() {
                    if roll < w { pick = k; break }
                    roll -= w
                }
                // A buyer at a dear item often walks away.
                let vend = machines[i].stock[pick]
                let fair = min(1, weights[pick] * (1 + max(realMarket(of: vend.item), 0.5) / 50))
                guard Double.random(in: 0..<1) < fair else { continue }
                machines[i].stock.remove(at: pick)
                machines[i].soldCount += 1
                let net = cents(vend.price * (1 - host.share))
                gross += vend.price
                sold += 1
                if machines[i].cardReader && Double.random(in: 0..<1) < Balance.vendCardShare {
                    toBank += cents(net * (1 - Balance.vendCardFee))
                } else {
                    machines[i].cashBox += net
                }
                // A machine sale is an in-person sale: sales tax, a receipt, the item's demand, and a fake's risk.
                collectSalesTax(on: vend.price, at: venue)
                addReceipt(name: vend.item.name, venue: venue, price: vend.price, net: net, paid: vend.item.paid)
                data.demand.items[vend.item.name, default: 0] += 1
                if let fake = vend.item.fake {
                    recordBadSale(item: vend.item.name, channel: venue, price: vend.price, fake: fake,
                                  known: vend.item.fakeKnown == true, refunds: false)
                }
            }
            if sold > 0 {
                machines[i].salesSinceVisit += sold
                machines[i].grossSinceVisit += gross
                machines[i].lifetimeGross += gross
                if toBank > 0 { addLedger(cents(toBank), .sale, "\(venue) · card sales") }
                if machines[i].telemetry {
                    lines.append("Your vending machine at \(place) sold \(sold) item\(sold == 1 ? "" : "s") for \(money(gross)).")
                }
            }
            if machines[i].telemetry && machines[i].stock.isEmpty && sold > 0 {
                lines.append("Your vending machine at \(place) is empty.")
            }
        }
        data.machines = machines
        return lines
    }
}
