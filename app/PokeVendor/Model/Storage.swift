import Foundation

// The storage unit (docs/37-storage.md). The home holds a set amount of stock. A rented unit holds more, and it is safe
// from home losses. The player must drive to the unit to move items in or out: a visit takes an hour, and then the
// player can move items for the rest of that day. Sealed deliveries can go straight to the unit.

/// The sizes of a rented unit.
enum StorageSize: String, Codable, CaseIterable, Identifiable {
    case small = "5×5"
    case medium = "10×10"
    case large = "10×20"

    var id: String { rawValue }

    /// The spaces the unit holds, in the same spaces as the show tote (docs/29-packing-and-crowds.md).
    var capacity: Int {
        switch self {
        case .small: 60
        case .medium: 240
        case .large: 600
        }
    }

    /// The rent, due on the 1st of each month with the home rent.
    var rent: Double {
        switch self {
        case .small: 70
        case .medium: 160
        case .large: 300
        }
    }
}

/// The player's storage unit.
struct StorageState: Codable, Hashable {
    /// The rented size. Nil: no unit.
    var size: StorageSize?
    /// The day of the last visit. On that day the player can move items in and out.
    var visitDay = -1
    /// Sealed deliveries go to the unit when it has room.
    var deliverHere = false

    init() {}

    /// A save from an older build has no storage state.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        size = try c.decodeIfPresent(StorageSize.self, forKey: .size)
        visitDay = try c.decodeIfPresent(Int.self, forKey: .visitDay) ?? -1
        deliverHere = try c.decodeIfPresent(Bool.self, forKey: .deliverHere) ?? false
    }
}

extension Balance {
    /// The spaces of stock that the home holds, and with the own home upgrade. The warehouse has no limit.
    static let homeSpaces = 150
    static let ownHomeSpaces = 400
    /// A slab and a raw card take a share of a space: a slab box holds 10 slabs, and a box of cards holds 100.
    static let slabSpace = 0.1
    static let rawSpace = 0.01
    /// The clutter fee: each space over the home limit costs this much each night.
    static let clutterFeePerSpace = 1.0
    /// A visit to the unit: the drive and the time to load, in hours.
    static let storageVisitHours = 1.0
    /// The unit's break-in chance each night, and the most sealed items that the thieves take.
    static let storageBreakInChance = 0.0015
    static let storageBreakInMaxItems = 3
    /// A home break-in: the sealed value at home where the risk starts, the chance each night at that value, and the cap.
    static let homeBreakInValue = 15_000.0
    static let homeBreakInChance = 0.002
    static let homeBreakInMax = 0.01
    static let homeBreakInMaxItems = 3
}

@MainActor
extension GameStore {
    // MARK: - Space

    var storageSize: StorageSize? { data.storage.size }

    /// The space of one sealed item: its real size, as at a show.
    func space(of item: SealedItem) -> Int {
        CarryBin.space(ShowItem(id: item.id, kind: .sealed, name: item.name, detail: "Sealed", market: 0, image: nil, condition: nil,
                                graded: false, setSlug: item.setSlug, fake: item.fake, fakeKnown: item.isKnownFake, packs: item.packs,
                                productID: item.productID, isCase: item.isCase, pc: item.pc))
    }

    /// True for an item that takes space at home: in hand, listed, or at home in the PC. Items away (in transit, at a
    /// grader, in the store, in the unit) do not.
    private func atHome(_ status: ItemStatus?) -> Bool {
        guard let status else { return true }
        switch status {
        case .listed, .openedAtShop: return true
        default: return false
        }
    }

    /// The spaces of a set of items: sealed by size, slabs and raw cards by share.
    private func spaces(sealed: [SealedItem], slabs: Int, raw: Int) -> Int {
        let s = sealed.reduce(0) { $0 + space(of: $1) }
        return s + Int((Double(slabs) * Balance.slabSpace + Double(raw) * Balance.rawSpace).rounded(.up))
    }

    var homeSpaceUsed: Int {
        spaces(sealed: data.sealed.filter { atHome($0.status) }, slabs: data.slabs.filter { atHome($0.status) }.count,
               raw: data.raw.filter { atHome($0.status) }.count + data.bulk.reduce(0) { $0 + $1.cards.count })
    }

    /// The home's space limit. Nil: no limit (the warehouse).
    var homeSpaceLimit: Int? {
        if hasUpgrade(.warehouse) { return nil }
        return hasUpgrade(.ownHome) ? Balance.ownHomeSpaces : Balance.homeSpaces
    }

    var homeOverflow: Int { homeSpaceLimit.map { max(0, homeSpaceUsed - $0) } ?? 0 }

    var storageUsed: Int {
        spaces(sealed: data.sealed.filter { $0.status == .inStorage }, slabs: data.slabs.filter { $0.status == .inStorage }.count,
               raw: data.raw.filter { $0.status == .inStorage }.count)
    }

    var storageFree: Int { max(0, (storageSize?.capacity ?? 0) - storageUsed) }

    // MARK: - The unit

    /// Rents a unit, or changes its size. A smaller unit must hold what is in it now.
    @discardableResult
    func rentStorage(_ size: StorageSize) -> Bool {
        guard size != storageSize, storageUsed <= size.capacity else { return false }
        let was = storageSize
        // The first month is paid when the unit is rented. A bigger unit pays the difference now. The rest is due on the 1st.
        let due = max(0, size.rent - (was?.rent ?? 0))
        guard canAfford(due) else { return false }
        if due > 0 { addLedger(-due, .businessCosts, "Storage unit · \(size.rawValue)") }
        data.storage.size = size
        log(was == nil ? "Rented a \(size.rawValue) storage unit for \(money(size.rent)) a month. Rent is due on the 1st."
                       : "Moved to a \(size.rawValue) storage unit for \(money(size.rent)) a month.")
        save()
        return true
    }

    /// Ends the rental. The unit must be empty.
    @discardableResult
    func endStorage() -> Bool {
        guard storageSize != nil, storageUsed == 0, !hasItemsInStorage else { return false }
        data.storage.size = nil
        data.storage.deliverHere = false
        log("Ended the storage unit rental.")
        save()
        return true
    }

    var hasItemsInStorage: Bool {
        data.sealed.contains { $0.status == .inStorage } || data.raw.contains { $0.status == .inStorage }
            || data.slabs.contains { $0.status == .inStorage }
    }

    var atStorageToday: Bool { storageSize != nil && data.storage.visitDay == data.day }

    /// Why the player cannot visit now, or nil.
    var visitBlock: String? {
        if storageSize == nil { return "Rent a unit first." }
        if atStorageToday { return nil }
        if slot(for: Balance.storageVisitHours) == nil { return "There is no time left today." }
        return nil
    }

    /// Drives to the unit. For the rest of the day the player can move items in and out.
    @discardableResult
    func visitStorage() -> Bool {
        guard storageSize != nil, !atStorageToday, spendHours(Balance.storageVisitHours) else { return false }
        data.storage.visitDay = data.day
        log("Drove to the storage unit (\(Int(Balance.storageVisitHours * 60)) min).")
        save()
        return true
    }

    func setDeliverToStorage(_ on: Bool) {
        data.storage.deliverHere = on && storageSize != nil
        save()
    }

    /// Moves items from home into the unit. It needs a visit today, and room. Returns the number moved.
    @discardableResult
    func moveToStorage(_ ids: Set<UUID>) -> Int {
        guard atStorageToday else { return 0 }
        var moved = 0
        var free = storageFree
        for i in data.sealed.indices where ids.contains(data.sealed[i].id) && data.sealed[i].status == nil {
            let need = space(of: data.sealed[i])
            guard need <= free else { continue }
            data.sealed[i].status = .inStorage
            free -= need
            moved += 1
        }
        // Cards take a share of a space. Count them against the room once at the end.
        let cards = (data.slabs + data.raw).filter { ids.contains($0.id) && $0.status == nil }
        let cardSpace = Int((Double(cards.filter { $0.grade != nil }.count) * Balance.slabSpace
                             + Double(cards.filter { $0.grade == nil }.count) * Balance.rawSpace).rounded(.up))
        if !cards.isEmpty, cardSpace <= free {
            for i in data.slabs.indices where ids.contains(data.slabs[i].id) && data.slabs[i].status == nil { data.slabs[i].status = .inStorage }
            for i in data.raw.indices where ids.contains(data.raw[i].id) && data.raw[i].status == nil { data.raw[i].status = .inStorage }
            moved += cards.count
        }
        if moved > 0 { log("Moved \(moved) item\(moved == 1 ? "" : "s") into the storage unit.") }
        save()
        return moved
    }

    /// Takes items from the unit home. It needs a visit today. Returns the number taken.
    @discardableResult
    func takeFromStorage(_ ids: Set<UUID>) -> Int {
        guard atStorageToday else { return 0 }
        var taken = 0
        for i in data.sealed.indices where ids.contains(data.sealed[i].id) && data.sealed[i].status == .inStorage {
            data.sealed[i].status = nil
            taken += 1
        }
        for i in data.slabs.indices where ids.contains(data.slabs[i].id) && data.slabs[i].status == .inStorage {
            data.slabs[i].status = nil
            taken += 1
        }
        for i in data.raw.indices where ids.contains(data.raw[i].id) && data.raw[i].status == .inStorage {
            data.raw[i].status = nil
            taken += 1
        }
        if taken > 0 { log("Took \(taken) item\(taken == 1 ? "" : "s") home from the storage unit.") }
        save()
        return taken
    }

    /// A sealed delivery that arrives today: to the unit when the player chose that and it has room, or home.
    /// `free` is the room left tonight. Each delivery that goes in uses it up.
    func deliveryStatus(for item: SealedItem, free: inout Int) -> ItemStatus? {
        let need = space(of: item)
        guard data.storage.deliverHere, storageSize != nil, need <= free else { return nil }
        free -= need
        return .inStorage
    }

    // MARK: - End Day

    /// The clutter fee, a break-in at the unit, and a break-in at home. Returns the lines for the report.
    func storageEndDay() -> [String] {
        var lines: [String] = []
        let over = homeOverflow
        if over > 0 {
            let fee = Double(over) * Balance.clutterFeePerSpace
            addLedger(-fee, .businessCosts, "Clutter fee · \(over) spaces over")
            lines.append("Your home is \(over) space\(over == 1 ? "" : "s") over its limit. Boxes in the hall and the car cost \(money(fee)). Rent a storage unit, or sell some stock.")
        }
        if let line = storageBreakIn() { lines.append(line) }
        if let line = homeBreakIn() { lines.append(line) }
        return lines
    }

    private func storageBreakIn() -> String? {
        let stored = data.sealed.filter { $0.status == .inStorage }
        guard !stored.isEmpty, Double.random(in: 0..<1) < Balance.storageBreakInChance else { return nil }
        let taken = Set(stored.shuffled().prefix(Int.random(in: 1...Balance.storageBreakInMaxItems)).map(\.id))
        return loseItems(taken, event: "Someone cut the lock on your storage unit and took")
    }

    /// The more sealed value at home, the more a break-in is worth to a thief.
    private func homeBreakIn() -> String? {
        let home = data.sealed.filter { $0.status == nil && !$0.pc }
        let value = home.reduce(0) { $0 + realMarket(of: $1) }
        guard value >= Balance.homeBreakInValue else { return nil }
        let chance = min(Balance.homeBreakInMax, Balance.homeBreakInChance * value / Balance.homeBreakInValue)
        guard Double.random(in: 0..<1) < chance else { return nil }
        let taken = Set(home.sorted { realMarket(of: $0) > realMarket(of: $1) }.prefix(8).shuffled()
            .prefix(Int.random(in: 1...Balance.homeBreakInMaxItems)).map(\.id))
        return loseItems(taken, event: "Someone broke into your home and took")
    }
}

@MainActor
extension GameStore {
    /// The home space and the storage unit in one line, for the Storage row. `over`: more items than the home holds.
    var storageSummary: (text: String, over: Bool) {
        let used = homeSpaceUsed
        let home = homeSpaceLimit.map { "home \(used)/\($0)" } ?? "home \(used)"
        let over = homeSpaceLimit.map { used > $0 } ?? false
        guard let size = storageSize else { return (home, over) }
        return ("\(home) · unit \(storageUsed)/\(size.capacity)", over)
    }
}
