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
    /// A checkout bot: better online drop odds, more cancellations, and scalper heat (Model/Flippers.swift).
    case checkoutBot
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
    /// A card reader: card payments at shows and at the store counter, for a fee (docs/25-payment-methods.md).
    case cardReader
    /// Less theft at a show table and from the car (docs/24-theft-and-insurance.md).
    case lockedCase
    /// A lit showcase for cards of $1,000 or more. It opens the Showcase section (docs/08-ui-direction.md, The showcase).
    case showcaseCase
    /// More carry space for a table: raw cards, slabs, and sealed (docs/29-packing-and-crowds.md).
    case vendorBinder, slabCase, foldingCart
    /// Less water damage to raw cards in storage, or none with the fire safe (docs/24).
    case dehumidifier, fireSafe
    /// Large things to buy (docs/16-time-and-day.md, Costs that grow).
    case warehouse, ownHome
    /// eBay collection lots: more listings, a check on the seller, and an estimate of the worth (docs/33-collections.md).
    case savedSearch, sellerResearch, lotAppraisal
    /// Selling online: cheaper shipping, a TCGplayer repricer, and the Pro seller fee (docs/09-upgrades.md).
    case shippingKit, repricer, proSeller
    /// Grading: a PSA membership, a grade estimate, and a UV light for fakes.
    case psaMembership, gradeEstimate, uvLight
    /// Shows: a cargo van for more carry space, and a premium booth for more visitors.
    case cargoVan, premiumBooth
    /// Buying: sorting trays for collections, a bulk broker, a supply account, and a price tracker.
    case sortingTrays, bulkBroker, supplyAccount, priceTracker
    /// Short-form video editing, and a better master set binder.
    case editingSoftware, premiumBinder
    /// Sealed product: a hand truck for cases (docs/29), a seal inspection kit (docs/12), a route planner for store runs
    /// (docs/34), and a machine map for card machine restocks (docs/12).
    case handTruck, sealInspectionKit, routePlanner, machineMap
    /// Rip & Ship: a shipping station and an overhead camera (docs/06).
    case shippingStation, overheadCamera
    /// Callouts: purchase records that prove a false claim about a product (docs/35).
    case purchaseRecords
    /// Shows the reprint wave, the out-of-print notice, and the flipper dump of the sealed product the player holds (docs/34).
    case reprintRadar

    var name: String {
        switch self {
        case .evReadout: "Expected value readout"
        case .betterCar: "A better car"
        case .dropDiscord: "Drop alert Discord"
        case .restockBot: "Restock alert bot"
        case .checkoutBot: "Checkout bot"
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
        case .showcaseCase: "Showcase case"
        case .lockedCase: "Locked display case"
        case .vendorBinder: "Vendor binder"
        case .slabCase: "Slab case"
        case .foldingCart: "Folding cart"
        case .dehumidifier: "Dehumidifier"
        case .fireSafe: "Fire safe"
        case .warehouse: "Your own warehouse"
        case .ownHome: "Buy a home"
        case .savedSearch: "Saved eBay searches"
        case .sellerResearch: "Seller research"
        case .lotAppraisal: "Lot appraisal app"
        case .shippingKit: "Shipping scale and label printer"
        case .repricer: "TCGplayer auto-repricer"
        case .proSeller: "TCGplayer Pro seller"
        case .psaMembership: "PSA membership"
        case .gradeEstimate: "Grade estimate service"
        case .uvLight: "UV light"
        case .cargoVan: "Cargo van"
        case .premiumBooth: "Premium booth"
        case .sortingTrays: "Sorting trays"
        case .bulkBroker: "Bulk broker"
        case .supplyAccount: "Supply wholesale account"
        case .priceTracker: "Price tracker app"
        case .editingSoftware: "Editing software"
        case .premiumBinder: "Premium master set binder"
        case .handTruck: "Hand truck"
        case .sealInspectionKit: "Seal inspection kit"
        case .routePlanner: "Route planner app"
        case .machineMap: "Machine map app"
        case .shippingStation: "Shipping station"
        case .overheadCamera: "Overhead camera"
        case .purchaseRecords: "Purchase records app"
        case .reprintRadar: "Reprint radar"
        }
    }

    var detail: String {
        switch self {
        case .evReadout: "Every sealed row and detail screen shows the expected value of opening it, from the pull rates and the card prices."
        case .betterCar: "Store run stops take 30 minutes instead of 40. A far garage sale takes 6 hours instead of 8."
        case .dropDiscord: "The morning report tells you the day before a Pokemon Center drop."
        case .restockBot: "Adds 25% to your chance of getting product when you camp a restock."
        case .checkoutBot: "Doubles your Pokemon Center odds to 60% and gives two Target.com attempts. Stores cancel 35% of bot orders, and each use leaves a trace."
        case .authTool: "Reads Real or Fake on every card you own, for free. A professional counterfeit still slips past it 1 time in 10."
        case .cornerLoupe: "Shows the corner subgrade on every raw card."
        case .edgeLight: "Shows the edge subgrade on every raw card."
        case .surfaceLamp: "Shows the surface subgrade on every raw card."
        case .studioLights: "Better video. Posts and streams reach 25% more people."
        case .cameraKit: "Much better video. Posts and streams reach 50% more people."
        case .salesAnalytics: "When you list or consign, each item shows what you paid and your profit after fees, before you commit."
        case .contactBook: "Room for \(Balance.contactBookSizes[1]) contacts instead of \(Balance.contactBookSizes[0])."
        case .bigContactBook: "Room for \(Balance.contactBookSizes[2]) contacts."
        case .cardReader: "Take card payments at shows, meets, and your store counter. Buyers with no cash stop walking away. A card sale costs \(Balance.readerFeeRate.formatted(.percent.precision(.fractionLength(1)))) plus \(money(Balance.readerFeeFixed))."
        case .showcaseCase: "A lit case for \(Balance.showcaseSlots) cards of \(money(Balance.showcaseMinValue)) or more. Bring it to a table: more people come, whales come more often, and some ask to buy a showcase card at a premium."
        case .lockedCase: "Cuts the chance of theft at a show table, and from your car, by \(Int(((1 - Balance.lockedCaseFactor) * 100).rounded()))%."
        case .vendorBinder: "Carry \(Balance.binderSpace[1]) raw cards to a table instead of \(Balance.binderSpace[0])."
        case .slabCase: "Carry \(Balance.slabBoxSpace[1]) slabs to a table instead of \(Balance.slabBoxSpace[0])."
        case .foldingCart: "Carry \(Balance.toteSpace[1]) spaces of sealed product to a table instead of \(Balance.toteSpace[0]). A booster box takes 7."
        case .dehumidifier: "Cuts the chance of water damage to raw cards in storage by \(Int(((1 - Balance.dehumidifierFactor) * 100).rounded()))%."
        case .fireSafe: "A sealed safe for your cards. Water damage to raw cards in storage cannot happen."
        case .warehouse: "Room for any amount of stock. You never pay for a storage unit again."
        case .ownHome: "Rent stops for good, so a missed rent payment can no longer end the run. Upkeep is \(money(Balance.ownHomeUpkeep)) every 4 weeks."
        case .savedSearch: "eBay shows \(Balance.ebayLotCountSaved) collection lots instead of \(Balance.ebayLotCount), and new lots come every day instead of every \(Balance.ebayLotDays) days."
        case .sellerResearch: "Each eBay lot shows whether the seller also sells singles from their lots. Most sellers who call a searched lot \"unsearched\" do."
        case .lotAppraisal: "Each eBay lot shows a range for its worth to a dealer, from what the listing shows. It cannot tell whether someone searched the lot."
        case .shippingKit: "Shipping costs \(Int(((1 - Balance.shippingKitFactor) * 100).rounded()))% less on every sale that ships."
        case .repricer: "Each day, a TCGplayer listing over the lowest listing drops to it. It never goes under \(Int(Balance.repricerFloor * 100))% of your price."
        case .proSeller: "The TCGplayer fee drops from \(Balance.tcgFeeRate.formatted(.percent.precision(.fractionLength(2)))) to \((Balance.tcgFeeRate - Balance.proSellerFeeCut).formatted(.percent.precision(.fractionLength(2))))."
        case .psaMembership: "Opens PSA Value Bulk ($24.99 a card, 20 cards or more, cards up to $500). PSA fees are \(Int(((1 - Balance.psaMemberFeeFactor) * 100).rounded()))% lower, and PSA returns grades \(Int(((1 - Balance.psaMemberDaysFactor) * 100).rounded()))% sooner."
        case .gradeEstimate: "The grade sheet and grading questions show the likely PSA grade range of each raw card."
        case .uvLight: "Your eye catches a fake \(Int(((Balance.uvLightFactor - 1) * 100).rounded()))% more often when you look at something to buy."
        case .cargoVan: "\(Int(((Balance.cargoVanFactor - 1) * 100).rounded()))% more carry space in the binder, the slab case, and the tote."
        case .premiumBooth: "A better spot at a booked show table: \(Int(((Balance.premiumBoothFactor - 1) * 100).rounded()))% more visitors."
        case .sortingTrays: "Going through a collection at your table takes half the time."
        case .bulkBroker: "Sell bulk at a game shop stop for cash, at \(Int(Balance.bulkCashRate * 100))% of market, not only for store credit."
        case .supplyAccount: "Supplies cost \(Int(((1 - Balance.supplyAccountFactor) * 100).rounded()))% less."
        case .priceTracker: "Market news arrives \(Balance.priceTrackerLead) days before prices start to move."
        case .editingSoftware: "Shorts take \(Int(((1 - Balance.editingFactor) * 100).rounded()))% less editing time."
        case .premiumBinder: "A completed master set pays \(Int(((Balance.premiumBinderFactor - 1) * 100).rounded()))% more reputation and followers."
        case .handTruck: "A sealed case takes 1 space plus 1 for each \(Balance.handTruckPacksPerSpace) packs, not each \(Balance.casePacksPerSpace). A case of 10 Elite Trainer Boxes takes 9 spaces, not 13."
        case .sealInspectionKit: "The tape and label check works on any sealed product, not only cases. It shows the tell of a reseal \(Int(Balance.sealInspectionFactor)) times as often. A professional reseal still shows nothing."
        case .routePlanner: "The store run planner puts stops in an order so each one arrives after the vendor hour that you already know. It shows the arrival time of each stop. Chains with an unknown vendor hour stay in your order, at the end."
        case .machineMap: "An official card machine restock is posted \(Balance.machineMapNotice) days ahead, not \(Balance.machineNotice)."
        case .shippingStation: "Shipping a Rip & Ship order takes \(Int(Balance.ripShipShipMinutes * Balance.shippingStationTimeFactor)) minutes, not \(Int(Balance.ripShipShipMinutes)). Each order costs \(money(Balance.shippingStationSuppliesCut)) less in supplies."
        case .overheadCamera: "Rip & Ship buyers pay up to \(Int(((Balance.overheadCameraPriceFactor - 1) * 100).rounded()))% more. The camera catches \(Int(Balance.palmFoundCameraChance * 100))% of palmed hits, not \(Int(Balance.palmFoundChance * 100))%."
        case .purchaseRecords: "When you deny a false product integrity or forbidden product callout, the heat falls in \(Balance.purchaseRecordsFalseDays) day, not \(Balance.calloutDenyFalseDays). The rival loses \(Balance.purchaseRecordsCredFactor.formatted())× the credibility. It does nothing for a true callout."
        case .reprintRadar: "Shows which sealed products that you hold are in a reprint wave or an out-of-print notice, and the chance of a flipper dump. It shows the lines on the Market screen and on each sealed product. It changes no price."
        }
    }

    var cost: Double { Balance.upgradeCosts[self] ?? 0 }

    var icon: String {
        switch self {
        case .evReadout: "function"
        case .betterCar: "car"
        case .dropDiscord: "bell.badge"
        case .restockBot: "antenna.radiowaves.left.and.right"
        case .checkoutBot: "cpu"
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
        case .showcaseCase: "sparkles.rectangle.stack"
        case .vendorBinder: "book.closed"
        case .slabCase: "square.stack.3d.up"
        case .foldingCart: "cart"
        case .dehumidifier: "humidity"
        case .fireSafe: "lock.shield"
        case .warehouse: "building.2"
        case .ownHome: "house"
        case .savedSearch: "magnifyingglass.circle"
        case .sellerResearch: "person.text.rectangle"
        case .lotAppraisal: "camera.viewfinder"
        case .shippingKit: "scalemass"
        case .repricer: "arrow.down.right.circle"
        case .proSeller: "star.circle"
        case .psaMembership: "person.badge.shield.checkmark"
        case .gradeEstimate: "chart.bar.xaxis"
        case .uvLight: "flashlight.on.fill"
        case .cargoVan: "box.truck"
        case .premiumBooth: "tent"
        case .sortingTrays: "tray.2"
        case .bulkBroker: "dollarsign.arrow.circlepath"
        case .supplyAccount: "shippingbox.circle"
        case .priceTracker: "chart.line.uptrend.xyaxis.circle"
        case .editingSoftware: "film"
        case .premiumBinder: "books.vertical.circle"
        case .handTruck: "cart.badge.plus"
        case .sealInspectionKit: "magnifyingglass.circle.fill"
        case .routePlanner: "map"
        case .machineMap: "mappin.and.ellipse"
        case .shippingStation: "shippingbox"
        case .overheadCamera: "camera.metering.center.weighted"
        case .purchaseRecords: "doc.text.magnifyingglass"
        case .reprintRadar: "dot.radiowaves.left.and.right"
        }
    }

    /// An upgrade that must come first.
    var requires: Upgrade? {
        switch self {
        case .cameraKit: .studioLights
        case .bigContactBook: .contactBook
        case .cargoVan: .betterCar
        case .handTruck: .foldingCart
        case .overheadCamera: .cameraKit
        case .reprintRadar: .priceTracker
        default: nil
        }
    }
}

extension Balance {
    static let upgradeCosts: [Upgrade: Double] = [
        .evReadout: 120, .betterCar: 900, .dropDiscord: 60, .restockBot: 150, .checkoutBot: 400, .authTool: 350,
        .cornerLoupe: 60, .edgeLight: 90, .surfaceLamp: 140, .studioLights: 250, .cameraKit: 600,
        .salesAnalytics: 150, .contactBook: 200, .bigContactBook: 600, .cardReader: Balance.cardReaderCost,
        .lockedCase: 220, .showcaseCase: Balance.showcaseCost, .vendorBinder: 40, .slabCase: 90, .foldingCart: 120, .dehumidifier: 120, .fireSafe: 400,
        .warehouse: 90_000, .ownHome: 350_000, .savedSearch: 80, .sellerResearch: 150, .lotAppraisal: 250,
        .shippingKit: 180, .repricer: 200, .proSeller: 2_000, .psaMembership: 1_200, .gradeEstimate: 300, .uvLight: 75,
        .cargoVan: 6_500, .premiumBooth: 3_000, .sortingTrays: 90, .bulkBroker: 250, .supplyAccount: 150, .priceTracker: 200,
        .editingSoftware: 150, .premiumBinder: 60,
        .handTruck: 180, .sealInspectionKit: 160, .routePlanner: 120, .machineMap: 60, .shippingStation: 350, .overheadCamera: 450,
        .purchaseRecords: 120, .reprintRadar: 200,
    ]
    /// Contact book room: no upgrade, the contact book, and the big contact book.
    static let contactBookSizes = [4, 8, 15]
    static let restockBotBonus = 0.25
    /// The Pokemon Center success chance with the checkout bot.
    static let pokemonCenterBotSuccess = 0.60
    static let betterCarStopHours = 30.0 / 60.0
    static let betterCarFarSaleHours = 6.0
    /// Content quality with no lights, with lights, and with the camera kit.
    static let productionQuality = [1.0, 1.25, 1.5]
    static let shippingKitFactor = 0.7
    static let repricerFloor = 0.85
    static let proSellerFeeCut = 0.025
    static let psaMemberFeeFactor = 0.8
    static let psaMemberDaysFactor = 0.8
    static let uvLightFactor = 1.3
    static let cargoVanFactor = 1.5
    static let premiumBoothFactor = 1.2
    static let bulkCashRate = 0.35
    static let supplyAccountFactor = 0.8
    static let priceTrackerLead = 2
    static let editingFactor = 0.6
    static let premiumBinderFactor = 1.25
    static let posClerkFactor = 1.0
}

@MainActor
extension GameStore {
    /// The fees, shipping, and insurance of a sale, with the shipping kit and the Pro seller fee.
    func saleCosts(price: Double, channel: Listing.Channel, sealed: Bool, insured: Bool) -> (fees: Double, shipping: Double, insurance: Double) {
        var costs = Self.saleCosts(price: price, channel: channel, sealed: sealed, insured: insured)
        if hasUpgrade(.shippingKit) { costs.shipping = (costs.shipping * Balance.shippingKitFactor * 100).rounded() / 100 }
        if hasUpgrade(.proSeller), channel == .tcgplayer { costs.fees = max(0, costs.fees - price * Balance.proSellerFeeCut) }
        return costs
    }

    /// A grading tier's fee and days, with the PSA membership.
    func gradingFee(_ tier: GradingTier, _ company: GradingCompany) -> Double {
        company == .psa && hasUpgrade(.psaMembership) ? (tier.fee * Balance.psaMemberFeeFactor * 100).rounded() / 100 : tier.fee
    }

    func gradingDays(_ tier: GradingTier, _ company: GradingCompany) -> Int {
        company == .psa && hasUpgrade(.psaMembership) ? max(1, Int((Double(tier.days) * Balance.psaMemberDaysFactor).rounded(.up))) : tier.days
    }

    /// The player's eye for fakes: tired days make it worse, and the UV light makes it better.
    var eyeFactor: Double { tiredFactor * (hasUpgrade(.uvLight) ? Balance.uvLightFactor : 1) }

    /// The editing time of a short, in hours, with the editing software.
    func editHours(long: Bool) -> Double {
        (long ? Balance.longEditHours : Balance.shortEditHours) * (hasUpgrade(.editingSoftware) ? Balance.editingFactor : 1)
    }

    /// The likely PSA grades of a raw card: the 15th and the 85th percentile of 60 grade rolls.
    static func likelyGrades(_ condition: Condition, company: GradingCompany = .psa) -> (low: Double, high: Double) {
        let rolls = (0..<60).map { _ in gradeResult(condition, company: company).grade }.sorted()
        return (rolls[9], rolls[50])
    }

    /// The TCGplayer repricer: a listing over the lowest listing drops to it, but not under its floor. Returns true when
    /// the price changed.
    func reprice(_ listing: inout Listing, lowest: Double) -> Bool {
        guard hasUpgrade(.repricer), listing.channel == .tcgplayer, listing.price > lowest + 0.004 else { return false }
        let start = listing.startPrice ?? listing.price
        let floor = (start * Balance.repricerFloor * 100).rounded() / 100
        let next = max(lowest, floor)
        guard next < listing.price - 0.004 else { return false }
        listing.startPrice = start
        listing.price = next
        return true
    }
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
