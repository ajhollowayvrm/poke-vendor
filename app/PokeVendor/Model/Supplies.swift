import Foundation

// Supplies and store accessories (docs/23-supplies.md).

/// A supply the player uses to pack and protect cards. Each comes in a pack.
enum SupplyItem: String, Codable, CaseIterable, Hashable {
    case pennySleeve, topLoader, teamBag, cardSaver, mailer, magneticCase

    var name: String {
        switch self {
        case .pennySleeve: "Penny sleeves"
        case .topLoader: "Top loaders"
        case .teamBag: "Team bags"
        case .cardSaver: "Card savers"
        case .mailer: "Bubble mailers"
        case .magneticCase: "Magnetic one-touch cases"
        }
    }

    /// One piece, for a line of text.
    var single: String {
        switch self {
        case .pennySleeve: "penny sleeve"
        case .topLoader: "top loader"
        case .teamBag: "team bag"
        case .cardSaver: "card saver"
        case .mailer: "bubble mailer"
        case .magneticCase: "magnetic case"
        }
    }

    var detail: String {
        switch self {
        case .pennySleeve: "A thin sleeve for every card you ship or put on a table."
        case .topLoader: "A rigid holder for a card you ship or put on a table."
        case .teamBag: "A resealable bag for a stack of sleeved cards on a table."
        case .cardSaver: "The holder that a grading company wants. One for each card you send."
        case .mailer: "A padded envelope for each shipped sale."
        case .magneticCase: "A one-touch case. It replaces the top loader for a card that sells for a high price."
        }
    }

    var icon: String {
        switch self {
        case .pennySleeve: "rectangle.portrait"
        case .topLoader: "rectangle.portrait.fill"
        case .teamBag: "bag"
        case .cardSaver: "checkmark.rectangle.portrait"
        case .mailer: "envelope"
        case .magneticCase: "magnet"
        }
    }

    var packSize: Int { Balance.supplyPackSizes[self] ?? 1 }
    var packPrice: Double { Balance.supplyPackPrices[self] ?? 0 }
    var unitPrice: Double { packPrice / Double(packSize) }
    /// The price of one piece when the player has none and buys it on the spot.
    var rushPrice: Double { unitPrice * Balance.supplyRushFactor }
}

/// Something the player's store sells to customers.
enum StoreAccessory: String, Codable, CaseIterable, Hashable {
    case sleeves, binder, deckBox, playmat

    var name: String {
        switch self {
        case .sleeves: "Deck sleeves"
        case .binder: "Binders"
        case .deckBox: "Deck boxes"
        case .playmat: "Playmats"
        }
    }

    var icon: String {
        switch self {
        case .sleeves: "rectangle.stack"
        case .binder: "book.closed"
        case .deckBox: "shippingbox"
        case .playmat: "rectangle.dashed"
        }
    }

    var retail: Double { Balance.accessoryRetail[self] ?? 0 }
    /// What the distributor charges for one piece.
    var cost: Double { (retail * Balance.accessoryCostShare * 100).rounded() / 100 }
    var caseSize: Int { Balance.accessoryCaseSizes[self] ?? 1 }
    var casePrice: Double { cost * Double(caseSize) }
}

/// What the player holds of each supply, and what is on the accessory shelf of the store.
struct SupplyState: Codable, Hashable {
    /// Pieces in hand, by `SupplyItem.rawValue`.
    var have: [String: Int] = [:]
    /// Pieces on the store shelf, by `StoreAccessory.rawValue`.
    var shelf: [String: Int] = [:]
    /// Everything paid for supplies over the whole run, and the part paid at a rush price.
    var spent = 0.0
    var rushSpent = 0.0
    /// The player ordered accessories at least once. An empty shelf matters only after that.
    var stockedShelf = false
}

extension Balance {
    static let supplyPackSizes: [SupplyItem: Int] = [.pennySleeve: 100, .topLoader: 25, .teamBag: 100, .cardSaver: 50, .mailer: 25,
                                                      .magneticCase: 10]
    static let supplyPackPrices: [SupplyItem: Double] = [.pennySleeve: 3.50, .topLoader: 6.00, .teamBag: 5.00, .cardSaver: 14.00,
                                                          .mailer: 13.00, .magneticCase: 18.00]
    /// With no supply in hand, the player buys a piece at once, at this many times the pack price.
    static let supplyRushFactor = 3.0
    /// A single that sells for this much or more ships in a magnetic case, not a top loader.
    static let magneticMinPrice = 100.0
    /// A booked show table uses these when the player sets up. A table at the player's own store does not.
    static let tablePennySleeves = 30
    static let tableTopLoaders = 15
    static let tableTeamBags = 6

    static let accessoryRetail: [StoreAccessory: Double] = [.sleeves: 9, .binder: 24, .deckBox: 12, .playmat: 25]
    static let accessoryCaseSizes: [StoreAccessory: Int] = [.sleeves: 24, .binder: 6, .deckBox: 12, .playmat: 6]
    /// The distributor charges this share of the shelf price.
    static let accessoryCostShare = 0.55
    /// How often each accessory sells, against the others.
    static let accessoryWeights: [StoreAccessory: Double] = [.sleeves: 0.45, .deckBox: 0.25, .binder: 0.15, .playmat: 0.15]
    /// The share of customers who buy an accessory. A casual customer buys one more often.
    static let accessoryBuyBase = 0.10
    static let accessoryBuyCasual = 0.15
}

@MainActor
extension GameStore {
    func supplyCount(_ item: SupplyItem) -> Int { data.supplies.have[item.rawValue] ?? 0 }
    func shelfCount(_ item: StoreAccessory) -> Int { data.supplies.shelf[item.rawValue] ?? 0 }

    /// One line for the Buy screen: how many shipped sales the stock covers.
    var suppliesSummary: String {
        let shipped = min(supplyCount(.mailer), supplyCount(.pennySleeve), supplyCount(.topLoader))
        return "\(supplyCount(.mailer)) mailers · \(supplyCount(.topLoader)) top loaders · \(shipped) shipped sales covered"
    }

    // MARK: - Buying

    /// Buys packs from the online Supplies storefront. The packs arrive at once.
    func buySupply(_ item: SupplyItem, packs: Int) -> String? {
        guard packs > 0 else { return nil }
        let total = item.packPrice * Double(packs)
        guard canAfford(total) else { return "You need \(money(total)). You have \(money(cash))." }
        let pieces = item.packSize * packs
        addLedger(-total, .supplies, "\(pieces) \(item.name.lowercased()) · Supplies")
        var s = data.supplies
        s.have[item.rawValue, default: 0] += pieces
        s.spent += total
        data.supplies = s
        log("Bought \(pieces) \(item.name.lowercased()) for \(money(total)).", cash: -total)
        save()
        return nil
    }

    /// A store account buys accessories by the case. They go on the shelf at once.
    func buyAccessories(_ item: StoreAccessory, cases: Int) -> String? {
        guard cases > 0 else { return nil }
        guard storeIsBuilt, let name = data.cardStore?.name else { return "You need an open store to stock accessories." }
        let total = item.casePrice * Double(cases)
        guard canAfford(total) else { return "You need \(money(total)). You have \(money(cash))." }
        let pieces = item.caseSize * cases
        addLedger(-total, .wholesale, "\(pieces) \(item.name.lowercased()) · Distributor")
        var s = data.supplies
        s.shelf[item.rawValue, default: 0] += pieces
        s.stockedShelf = true
        data.supplies = s
        log("Stocked \(pieces) \(item.name.lowercased()) on the shelf of \(name) for \(money(total)).", cash: -total)
        save()
        return nil
    }

    // MARK: - Using

    /// Takes supplies from the stock. A piece the player does not have costs the rush price, paid now. The player
    /// pays what the cash allows, and the action goes on. Returns the rush cost paid.
    @discardableResult
    func useSupplies(_ needs: [(SupplyItem, Int)], for reason: String) -> Double {
        var s = data.supplies
        var rush = 0.0
        var missing: [String] = []
        for (item, count) in needs where count > 0 {
            let held = s.have[item.rawValue] ?? 0
            let taken = min(held, count)
            s.have[item.rawValue] = held - taken
            let short = count - taken
            if short > 0 {
                rush += item.rushPrice * Double(short)
                missing.append("\(short) \(item.single)\(short == 1 ? "" : "s")")
            }
        }
        guard rush > 0 else {
            data.supplies = s
            return 0
        }
        let due = (rush * 100).rounded() / 100
        let paid = max(0, min(due, (data.cash * 100).rounded(.down) / 100))
        s.spent += paid
        s.rushSpent += paid
        data.supplies = s
        if paid > 0 { addLedger(-paid, .supplies, "Rush supplies · \(reason)") }
        let list = missing.joined(separator: ", ")
        if paid >= due {
            log("You had no supplies for \(reason). You bought \(list) at a rush price.", cash: -paid)
        } else {
            log("You had no supplies for \(reason), and not enough cash for \(list). You made do and paid \(money(paid)).", cash: -paid)
        }
        return paid
    }

    /// What one shipped sale uses. A slab or a sealed product needs only a mailer.
    func shippingSupplies(price: Double, slab: Bool, sealed: Bool) -> [(SupplyItem, Int)] {
        if slab || sealed { return [(.mailer, 1)] }
        return [(.mailer, 1), (.pennySleeve, 1), (price >= Balance.magneticMinPrice ? .magneticCase : .topLoader, 1)]
    }

    /// The supplies of one shipped sale, at pack prices.
    func shippingSupplyCost(price: Double, slab: Bool, sealed: Bool) -> Double {
        shippingSupplies(price: price, slab: slab, sealed: sealed).reduce(0) { $0 + $1.0.unitPrice * Double($1.1) }
    }

    func useShippingSupplies(name: String, price: Double, slab: Bool, sealed: Bool) {
        useSupplies(shippingSupplies(price: price, slab: slab, sealed: sealed), for: "shipping \(name)")
    }

    /// A grading submission uses one card saver for each card.
    func useGradingSupplies(cards: Int) {
        useSupplies([(.cardSaver, cards)], for: "a grading submission")
    }

    /// A booked show table uses sleeves, top loaders, and team bags.
    func useTableSupplies() {
        useSupplies([(.pennySleeve, Balance.tablePennySleeves), (.topLoader, Balance.tableTopLoaders),
                     (.teamBag, Balance.tableTeamBags)], for: "your show table")
    }

    // MARK: - The store shelf

    /// An open day at the store: customers buy accessories off the shelf. The clerk, or the player at the counter,
    /// covers the day. Returns the sales, for the store's day record, and the report lines.
    func storeAccessoryDay(coverage: Double, storeName: String, casualShare: Double)
        -> (sold: Int, revenue: Double, lines: [String]) {
        guard coverage > 0 else { return (0, 0, []) }
        let mean = expectedCustomers(day: data.day) * coverage * (Balance.accessoryBuyBase + Balance.accessoryBuyCasual * casualShare)
        let wanted = max(0, Int((mean + Double.random(in: -1...1)).rounded()))
        var s = data.supplies
        var sold: [StoreAccessory: Int] = [:]
        var revenue = 0.0
        var empty = false
        for _ in 0..<wanted {
            let options = StoreAccessory.allCases.filter { (s.shelf[$0.rawValue] ?? 0) > 0 }
            guard !options.isEmpty else {
                empty = true
                break
            }
            let weights = options.map { Balance.accessoryWeights[$0] ?? 0.1 }
            var roll = Double.random(in: 0..<weights.reduce(0, +))
            var pick = options[options.count - 1]
            for (item, w) in zip(options, weights) {
                if roll < w {
                    pick = item
                    break
                }
                roll -= w
            }
            s.shelf[pick.rawValue, default: 0] -= 1
            sold[pick, default: 0] += 1
            revenue += pick.retail
        }
        data.supplies = s
        var lines: [String] = []
        let count = sold.values.reduce(0, +)
        if count > 0 {
            let parts = StoreAccessory.allCases.compactMap { item in sold[item].map { "\($0) \(item.name.lowercased())" } }
            addLedger(revenue, .sale, "Accessories · \(storeName) · \(parts.joined(separator: ", "))")
            lines.append("\(storeName) sold \(count) accessor\(count == 1 ? "y" : "ies") for \(money(revenue)): \(parts.joined(separator: ", ")).")
        }
        if empty, s.stockedShelf {
            lines.append("Customers asked for accessories at \(storeName), and the shelf was empty.")
        }
        return (count, revenue, lines)
    }
}
