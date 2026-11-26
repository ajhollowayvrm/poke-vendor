import Foundation

// Store stock at a show or a meet (docs/42-two-inventories.md). The player can pack store items for any visit with a
// load. They leave the shelf when the load leaves the car, and unsold ones go back when the visit ends. A sale pays the
// business account. Moving items between Personal and the Store moves no money.

@MainActor
extension GameStore {
    /// The store stock that can go to a show: on the shelf or in the back room, not on hold, and not listed online.
    var storeLoanable: (cards: [OwnedCard], sealed: [SealedItem]) {
        guard data.cardStore != nil else { return ([], []) }
        let held = heldItemIDs
        return ((data.raw + data.slabs).filter { Self.isInStore($0.status) && $0.onlineListing == nil && !held.contains($0.id) },
                data.sealed.filter { Self.isInStore($0.status) && $0.onlineListing == nil && !held.contains($0.id) })
    }

    /// The packed store items leave the shelf for the visit.
    func lendToVisit(_ ids: Set<UUID>) {
        for i in data.raw.indices where ids.contains(data.raw[i].id) && Self.isInStore(data.raw[i].status) {
            data.raw[i].status = nil
            data.raw[i].fromStore = true
        }
        for i in data.slabs.indices where ids.contains(data.slabs[i].id) && Self.isInStore(data.slabs[i].status) {
            data.slabs[i].status = nil
            data.slabs[i].fromStore = true
        }
        for i in data.sealed.indices where ids.contains(data.sealed[i].id) && Self.isInStore(data.sealed[i].status) {
            data.sealed[i].status = nil
            data.sealed[i].backRoom = nil
            data.sealed[i].fromStore = true
        }
    }

    /// The store items back from a visit go on the shelf again. Returns how many came back.
    @discardableResult
    func returnStoreLoans() -> Int {
        let placed = ItemStatus.inStore(since: data.day)
        var count = 0
        for i in data.raw.indices where data.raw[i].fromStore == true {
            data.raw[i].fromStore = nil
            if data.raw[i].status == nil { data.raw[i].status = placed; count += 1 }
        }
        for i in data.slabs.indices where data.slabs[i].fromStore == true {
            data.slabs[i].fromStore = nil
            if data.slabs[i].status == nil { data.slabs[i].status = placed; count += 1 }
        }
        for i in data.sealed.indices where data.sealed[i].fromStore == true {
            data.sealed[i].fromStore = nil
            if data.sealed[i].status == nil { data.sealed[i].status = placed; count += 1 }
        }
        if count > 0 { log("\(count) item\(count == 1 ? "" : "s") went back to \(data.cardStore?.name ?? "the store").") }
        return count
    }

    /// True for an item on the store side: on the shelf, in the back room, or out at a visit.
    func onStoreSide(_ status: ItemStatus?, fromStore: Bool?) -> Bool { Self.isInStore(status) || fromStore == true }

    /// The move action: personal items go to the store, store items come back to the player.
    func moveBetweenInventories(_ ids: Set<UUID>) {
        let allStore = !ids.isEmpty && ids.allSatisfy { id in
            if let c = card(id) { return Self.isInStore(c.status) }
            return data.sealed.first { $0.id == id }.map { Self.isInStore($0.status) } ?? false
        }
        if allStore { takeBackFromStore(ids) } else { stockStore(ids) }
    }
}

@MainActor
extension ShowSession {
    /// The load leaves the car: the packed store items leave the shelf.
    func departLoad() {
        guard venue.kind != .store else { return }
        let ids = Set(stockItems.filter { $0.fromStore && bring.contains($0.id) }.map(\.id))
        guard !ids.isEmpty else { return }
        store.lendToVisit(ids)
    }
}
