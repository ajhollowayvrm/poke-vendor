import Foundation
import Observation

/// Set files load once and stay in memory.
@MainActor
enum SetLibrary {
    private static var cache: [String: SetData] = [:]

    static func set(_ slug: String) -> SetData {
        if let set = cache[slug] { return set }
        let set = SetData.load(slug)
        cache[slug] = set
        return set
    }
}

/// An ungraded card that the player owns.
struct OwnedCard: Codable, Identifiable, Hashable {
    var id = UUID()
    let print: CardPrint
    let setSlug: String
    let acquired: Date
    /// Nil for a pulled card. The opened product holds the amount paid (docs/08-ui-direction.md, Inventory).
    let paid: Double?
    let ripID: UUID?
    var keep = false

    var market: Double { print.market ?? 0 }
}

struct SealedItem: Codable, Identifiable, Hashable {
    var id = UUID()
    let setSlug: String
    let name: String
    let packs: Int
    let paid: Double
    let acquired: Date
    let source: String
    var keep = false

    var paidPerPack: Double { paid / Double(max(packs, 1)) }
}

/// The bulk of one rip: every card that is not a hit.
struct BulkGroup: Codable, Identifiable, Hashable {
    var id = UUID()
    let ripID: UUID
    let setSlug: String
    let date: Date
    var cards: [CardPrint]

    var value: Double { cards.reduce(0) { $0 + ($1.market ?? 0) } }
}

struct InventoryData: Codable {
    var sealed: [SealedItem] = []
    var raw: [OwnedCard] = []
    var slabs: [OwnedCard] = []
    var bulk: [BulkGroup] = []
    /// The amount paid for opened product. The portfolio header counts it once.
    var openedPaid: Double = 0
}

@MainActor @Observable
final class InventoryStore {
    private(set) var data: InventoryData
    private let url: URL

    init() {
        url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("inventory.json")
        data = (try? JSONDecoder().decode(InventoryData.self, from: Data(contentsOf: url))) ?? InventoryData()
    }

    // MARK: - Values

    func market(of item: SealedItem) -> Double {
        (SetLibrary.set(item.setSlug).packCost ?? 0) * Double(item.packs)
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

    // MARK: - Changes

    /// A stand-in for the buy screen: one booster pack at the market price.
    func addTestPacks(_ count: Int, slug: String = "prismatic-evolutions") {
        let set = SetLibrary.set(slug)
        for _ in 0..<count {
            data.sealed.append(SealedItem(setSlug: slug, name: "\(set.name) Booster Pack", packs: 1,
                                          paid: set.packCost ?? 0, acquired: .now, source: "Test pack"))
        }
        save()
    }

    func reset() {
        data = InventoryData()
        save()
    }

    func isKept(_ id: UUID) -> Bool {
        data.sealed.contains { $0.id == id && $0.keep }
            || data.raw.contains { $0.id == id && $0.keep }
            || data.slabs.contains { $0.id == id && $0.keep }
    }

    func setKeep(_ ids: Set<UUID>, _ keep: Bool) {
        for i in data.sealed.indices where ids.contains(data.sealed[i].id) { data.sealed[i].keep = keep }
        for i in data.raw.indices where ids.contains(data.raw[i].id) { data.raw[i].keep = keep }
        for i in data.slabs.indices where ids.contains(data.slabs[i].id) { data.slabs[i].keep = keep }
        save()
    }

    /// Called when the rip tears a pack. The seal is broken, so the cards belong to the player at once.
    func commitPack(_ item: SealedItem, ripID: UUID, cards: [RipCard]) {
        data.sealed.removeAll { $0.id == item.id }
        data.openedPaid += item.paid
        let now = Date.now
        var bulk: [CardPrint] = []
        for card in cards {
            guard let print = card.print else { continue }
            if card.isHit {
                data.raw.append(OwnedCard(print: print, setSlug: item.setSlug, acquired: now, paid: nil, ripID: ripID))
            } else {
                bulk.append(print)
            }
        }
        if let i = data.bulk.firstIndex(where: { $0.ripID == ripID }) {
            data.bulk[i].cards += bulk
        } else if !bulk.isEmpty {
            data.bulk.append(BulkGroup(ripID: ripID, setSlug: item.setSlug, date: now, cards: bulk))
        }
        save()
    }

    private func save() {
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? JSONEncoder().encode(data).write(to: url, options: .atomic)
    }
}
