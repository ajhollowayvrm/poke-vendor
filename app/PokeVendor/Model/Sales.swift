import Foundation

// Sale receipts (docs/15-selling.md, The sale receipt) and the profit numbers of the sales analytics upgrade
// (docs/09-upgrades.md).

/// One finished sale. The receipt screen shows it, then it goes away. The game does not save it.
struct SaleReceipt: Identifiable, Hashable {
    let id = UUID()
    let name: String
    /// Where it sold, for example "TCGplayer" or "Card Kingdom buylist".
    let venue: String
    /// The price the buyer paid.
    let price: Double
    /// What the player got, after fees and shipping.
    let net: Double
    /// What the player paid for the item. Nil for a card pulled from a pack: the pack holds that cost.
    let paid: Double?

    var profit: Double { net - (paid ?? 0) }
}

@MainActor
extension GameStore {
    /// What the player paid for an owned item. Nil for a pulled card, or when the item is gone.
    func paidFor(_ id: UUID) -> Double? {
        if let card = card(id) { return card.paid }
        return data.sealed.first { $0.id == id }?.paid
    }

    func addReceipt(name: String, venue: String, price: Double, net: Double, paid: Double?) {
        receipts.append(SaleReceipt(name: name, venue: venue, price: price, net: net, paid: paid))
    }

    func clearReceipts() { receipts.removeAll() }

    var hasSalesAnalytics: Bool { hasUpgrade(.salesAnalytics) }
}
