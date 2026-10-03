import Foundation

// Lots (docs/15-selling.md, Lots). The player lists several items as one lot, at one price, on eBay or Facebook
// Marketplace. A lot is one listing, one shipment, and one ledger entry. Its items leave Inventory together.

/// A lot on sale. It holds the items until the lot sells or ends.
struct Lot: Codable, Identifiable, Hashable {
    var id = UUID()
    var raw: [OwnedCard] = []
    var slabs: [OwnedCard] = []
    var sealed: [SealedItem] = []
    let channel: Listing.Channel
    let price: Double
    let dayListed: Int
    let insured: Bool

    var count: Int { raw.count + slabs.count + sealed.count }
    var hasSealed: Bool { !sealed.isEmpty }
    var name: String { "Lot of \(count) \(hasSealed ? "sealed product" : "cards")" }
    var paid: Double? {
        let all: [Double?] = (raw + slabs).map(\.paid) + sealed.map { Optional($0.paid) }
        guard all.contains(where: { $0 != nil }) else { return nil }
        return all.reduce(0) { $0 + ($1 ?? 0) }
    }
}

extension Balance {
    /// A lot buyer pays this share of the sum of market values. This is the price that sells at the normal speed.
    static let lotBuyerShare = 0.85
    /// The chance each day that a lot sells at the buyer price: the floor, and the extra for cheap items.
    /// The extra is divided by (1 + average item value / lotSpeedScale). Cheap items sell much faster in a lot.
    static let lotChanceFloor = 0.06
    static let lotChanceExtra = 0.22
    static let lotSpeedScale = 20.0
    static let lotChanceCap = 0.5
    /// The chance falls this fast for each 100% that the price is above the buyer price.
    static let lotPriceSlope = 8.0
    static let lotMinItems = 2
    /// The limits of the lot price slider, as shares of the sum of market values.
    static let lotPriceRange = 0.50...1.10
}

@MainActor
extension GameStore {
    /// The sum of market values of the items, as if every one is real: what a buyer who does not know pays.
    static func lotValue(_ lot: Lot) -> Double {
        (lot.raw + lot.slabs).reduce(0) { $0 + $1.realMarket }
    }

    func lotMarket(_ lot: Lot) -> Double {
        Self.lotValue(lot) + lot.sealed.reduce(0) { $0 + realMarket(of: $1) }
    }

    /// The items in the lots count in the portfolio header.
    var lotsMarketValue: Double { data.lots.reduce(0) { $0 + lotMarket($1) } }
    var lotsPaid: Double { data.lots.reduce(0) { $0 + ($1.paid ?? 0) } }

    /// The chance each day that a lot sells at a price. Mid-value and low-value items sell much faster in a lot.
    func lotSaleChance(_ lot: Lot) -> Double {
        let market = lotMarket(lot)
        let average = market / Double(max(lot.count, 1))
        let base = Balance.lotChanceFloor + Balance.lotChanceExtra / (1 + average / Balance.lotSpeedScale)
        let buyer = max(market * Balance.lotBuyerShare, 0.01)
        let chance = base * exp(-(lot.price / buyer - 1) * Balance.lotPriceSlope)
        return min(Balance.lotChanceCap, chance * reachSaleFactor)
    }

    /// Takes the items out of Inventory and lists them as one lot. The items must be free: no status, not kept.
    @discardableResult
    func listLot(_ ids: Set<UUID>, channel: Listing.Channel, price: Double, insured: Bool) -> Bool {
        guard channel == .ebay || channel == .facebook else { return false }
        let raw = data.raw.filter { ids.contains($0.id) }
        let slabs = data.slabs.filter { ids.contains($0.id) }
        let sealed = data.sealed.filter { ids.contains($0.id) }
        let free = (raw + slabs).allSatisfy { $0.status == nil && !$0.keep } && sealed.allSatisfy { $0.status == nil && !$0.keep }
        guard raw.count + slabs.count + sealed.count >= Balance.lotMinItems, free else { return false }
        data.raw.removeAll { ids.contains($0.id) }
        data.slabs.removeAll { ids.contains($0.id) }
        data.sealed.removeAll { ids.contains($0.id) }
        let lot = Lot(raw: raw, slabs: slabs, sealed: sealed, channel: channel, price: price, dayListed: data.day,
                      insured: insured && channel.ships)
        data.lots.append(lot)
        log("Listed \(lot.name.lowercased()) on \(channel.rawValue) for \(money(price)).")
        save()
        return true
    }

    /// The lot ends. Its items go back to Inventory together.
    private func returnLot(_ lot: Lot) {
        data.raw += lot.raw
        data.slabs += lot.slabs
        data.sealed += lot.sealed
    }

    func removeLot(_ id: UUID) {
        guard let lot = data.lots.first(where: { $0.id == id }) else { return }
        data.lots.removeAll { $0.id == id }
        returnLot(lot)
        log("Took down \(lot.name.lowercased()). The items are back in Inventory.")
        save()
    }

    /// Rolls each lot for a sale, and ends the lots that ran for 4 weeks.
    func lotsEndDay() -> [String] {
        var lines: [String] = []
        let today = data.day
        let lots = data.lots
        var kept: [Lot] = []
        for lot in lots {
            if Double.random(in: 0..<1) < lotSaleChance(lot) {
                lines.append(sellLot(lot))
            } else if today - lot.dayListed >= Balance.listingDays {
                returnLot(lot)
                lines.append("Your \(lot.channel.rawValue) listing for \(lot.name.lowercased()) ended with no sale. The items are back in Inventory.")
            } else {
                kept.append(lot)
            }
        }
        data.lots = kept
        return lines
    }

    /// One sale, one shipment, one ledger entry. A fake in the lot can come back later, as in any sale.
    private func sellLot(_ lot: Lot) -> String {
        let listing = Listing(channel: lot.channel, price: lot.price, dayListed: lot.dayListed, insured: lot.insured)
        let line = completeSale(name: lot.name, listing: listing, price: lot.price, sealed: lot.hasSealed, paid: lot.paid)
        let market = max(lotMarket(lot), 0.01)
        for card in lot.raw + lot.slabs {
            guard let fake = card.fake else { continue }
            recordBadSale(item: card.print.name, channel: lot.channel.rawValue, price: lot.price * card.realMarket / market, fake: fake,
                          known: card.isKnownFake, refunds: lot.channel.refundsFakes)
        }
        for item in lot.sealed {
            guard let fake = item.fake else { continue }
            recordBadSale(item: item.name, channel: lot.channel.rawValue, price: lot.price * realMarket(of: item) / market, fake: fake,
                          known: item.isKnownFake, refunds: lot.channel.refundsFakes)
        }
        return line
    }
}
