import Foundation

// Upgrades (docs/09-upgrades.md). The centering tools and the vendor kit came first and keep their own fields.

enum Upgrade: String, Codable, CaseIterable, Hashable {
    /// Shows the expected value of opening each sealed item (docs/12, The expected-value upgrade).
    case evReadout
    /// A better car: shorter store runs, and a far sale takes less of the day (docs/16, Travel).
    case betterCar
    /// A Discord that posts Pokemon Center drops a day ahead (docs/12).
    case dropDiscord
    /// A restock alert bot: a better chance at a camped restock (docs/12).
    case restockBot
    /// Checks every card for a fake, for free (docs/14).
    case authTool
    /// Reveal tools for the corners, the edges, and the surface (docs/10).
    case cornerLoupe, edgeLight, surfaceLamp
    /// Production value for streams and posts (docs/06).
    case studioLights, cameraKit
    /// Shows the cost and the profit of each item on the sell and consign screens (docs/09, Sales analytics).
    case salesAnalytics
    /// More room in the contact book (docs/21, The contact book).
    case contactBook, bigContactBook
    /// A card reader: card payments at shows and at the store counter, for a fee (docs/23).
    case cardReader
    /// Less theft at a show table and from the car (docs/24-theft-and-insurance.md).
    case lockedCase
    /// Less water damage to raw cards in storage, or none with the fire safe (docs/24).
    case dehumidifier, fireSafe

    var name: String {
        switch self {
        case .evReadout: "Expected value readout"
        case .betterCar: "A better car"
        case .dropDiscord: "Drop alert Discord"
        case .restockBot: "Restock alert bot"
        case .authTool: "Authentication tool"
        case .cornerLoupe: "Corner loupe"
        case .edgeLight: "Edge light"
        case .surfaceLamp: "Raking lamp"
        case .studioLights: "Studio lights"
        case .cameraKit: "Camera kit"
        case .salesAnalytics: "Sales analytics"
        case .contactBook: "Contact book"
        case .bigContactBook: "Big contact book"
        case .cardReader: "Card reader"
        case .lockedCase: "Locked display case"
        case .dehumidifier: "Dehumidifier"
        case .fireSafe: "Fire safe"
        }
    }

    var detail: String {
        switch self {
        case .evReadout: "Every sealed row and detail screen shows the expected value of opening it, from the pull rates and the card prices."
        case .betterCar: "Store run stops take 30 minutes instead of 40. A far garage sale takes 6 hours instead of 8."
        case .dropDiscord: "The morning report tells you the day before a Pokemon Center drop."
        case .restockBot: "Adds 25% to your chance of getting product when you camp a restock."
        case .authTool: "Reads Real or Fake on every card you own, for free. A professional counterfeit still slips past it 1 time in 10."
        case .cornerLoupe: "Shows the corner subgrade on every raw card."
        case .edgeLight: "Shows the edge subgrade on every raw card."
        case .surfaceLamp: "Shows the surface subgrade on every raw card."
        case .studioLights: "Better video. Posts and streams reach 25% more people."
        case .cameraKit: "Much better video. Posts and streams reach 50% more people. Needs the studio lights."
        case .salesAnalytics: "When you list or consign, each item shows what you paid and your profit after fees, before you commit."
        case .contactBook: "Room for \(Balance.contactBookSizes[1]) contacts instead of \(Balance.contactBookSizes[0])."
        case .bigContactBook: "Room for \(Balance.contactBookSizes[2]) contacts."
        case .cardReader: "Take card payments at shows, meets, and your store counter. Buyers with no cash stop walking away. A card sale costs \(Balance.readerFeeRate.formatted(.percent.precision(.fractionLength(1)))) plus \(money(Balance.readerFeeFixed))."
        case .lockedCase: "Cuts the chance of theft at a show table, and from your car, by \(Int((1 - Balance.lockedCaseFactor) * 100))%."
        case .dehumidifier: "Cuts the chance of water damage to raw cards in storage by \(Int((1 - Balance.dehumidifierFactor) * 100))%."
        case .fireSafe: "A sealed safe for your cards. Water damage to raw cards in storage cannot happen."
        }
    }

    var cost: Double { Balance.upgradeCosts[self] ?? 0 }

    var icon: String {
        switch self {
        case .evReadout: "function"
        case .betterCar: "car"
        case .dropDiscord: "bell.badge"
        case .restockBot: "antenna.radiowaves.left.and.right"
        case .authTool: "checkmark.shield"
        case .cornerLoupe: "magnifyingglass"
        case .edgeLight: "light.max"
        case .surfaceLamp: "lamp.desk"
        case .studioLights: "lightbulb"
        case .cameraKit: "video"
        case .salesAnalytics: "chart.line.uptrend.xyaxis"
        case .contactBook: "person.crop.rectangle.stack"
        case .bigContactBook: "books.vertical"
        case .cardReader: "creditcard"
        case .lockedCase: "lock.rectangle"
        case .dehumidifier: "humidity"
        case .fireSafe: "lock.shield"
        }
    }

    /// An upgrade that must come first.
    var requires: Upgrade? {
        switch self {
        case .cameraKit: .studioLights
        case .bigContactBook: .contactBook
        default: nil
        }
    }
}

extension Balance {
    static let upgradeCosts: [Upgrade: Double] = [
        .evReadout: 120, .betterCar: 900, .dropDiscord: 60, .restockBot: 150, .authTool: 350,
        .cornerLoupe: 60, .edgeLight: 90, .surfaceLamp: 140, .studioLights: 250, .cameraKit: 600,
        .salesAnalytics: 150, .contactBook: 200, .bigContactBook: 600, .cardReader: Balance.cardReaderCost,
        .lockedCase: 220, .dehumidifier: 120, .fireSafe: 400,
    ]
    /// Contact book room: no upgrade, the contact book, and the big contact book.
    static let contactBookSizes = [4, 8, 15]
    static let restockBotBonus = 0.25
    static let betterCarStopHours = 30.0 / 60.0
    static let betterCarFarSaleHours = 6.0
    /// Content quality with no lights, with lights, and with the camera kit.
    static let productionQuality = [1.0, 1.25, 1.5]
}

@MainActor
extension GameStore {
    func hasUpgrade(_ upgrade: Upgrade) -> Bool { data.upgrades.contains(upgrade.rawValue) }

    func canBuyUpgrade(_ upgrade: Upgrade) -> Bool {
        !hasUpgrade(upgrade) && canAfford(upgrade.cost) && (upgrade.requires.map(hasUpgrade) ?? true)
    }

    func buyUpgrade(_ upgrade: Upgrade) {
        guard canBuyUpgrade(upgrade) else { return }
        addLedger(-upgrade.cost, .upgrade, upgrade.name)
        data.upgrades.append(upgrade.rawValue)
        log("Bought the \(upgrade.name.lowercased()).", cash: -upgrade.cost)
        save()
    }

    /// The expected value of opening a product: the pull rates times the card prices, plus the promos
    /// (docs/12-acquiring-product.md, The expected-value upgrade).
    func expectedValue(of product: Product) -> Double {
        var total = 0.0
        for slug in product.packSlugs { total += Self.expectedValue(ofPack: SetLibrary.set(slug)) }
        let promos = product.promos.map { $0.market ?? 0 }
        if product.pickOnePromo, !promos.isEmpty {
            total += promos.reduce(0, +) / Double(promos.count)
        } else {
            total += promos.reduce(0, +)
        }
        return total
    }

    static func expectedValue(ofPack set: SetData) -> Double {
        var normal = 0.0
        for slot in set.slots {
            let odds = slot.outcomes.reduce(0) { $0 + $1.odds }
            guard odds > 0 else { continue }
            for outcome in slot.outcomes where !outcome.prints.isEmpty {
                let mean = outcome.prints.reduce(0) { $0 + (set.prints[$1].market ?? 0) } / Double(outcome.prints.count)
                normal += Double(slot.count) * outcome.odds / odds * mean
            }
        }
        // A special pack replaces the slot map at its own odds.
        var specialOdds = 0.0
        var special = 0.0
        for pack in set.specialPacks ?? [] {
            specialOdds += pack.odds
            if let cards = pack.cards {
                special += pack.odds * cards.reduce(0) { $0 + (set.prints[$1].market ?? 0) }
            } else if let pool = pack.pool, let slots = pack.slots, !pool.isEmpty {
                let mean = pool.reduce(0) { $0 + (set.prints[$1].market ?? 0) } / Double(pool.count)
                special += pack.odds * (normal + Double(slots.count) * mean)
            }
        }
        return normal * (1 - min(1, specialOdds)) + special
    }

    var restockBotBonus: Double { hasUpgrade(.restockBot) ? Balance.restockBotBonus : 0 }
    var storeStopHours: Double { hasUpgrade(.betterCar) ? Balance.betterCarStopHours : LocalStore.baseHours }
    /// Content quality from the gear: 1.0, 1.25, or 1.5.
    var productionQuality: Double {
        Balance.productionQuality[hasUpgrade(.cameraKit) ? 2 : hasUpgrade(.studioLights) ? 1 : 0]
    }
}
