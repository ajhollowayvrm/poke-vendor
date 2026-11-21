import Foundation

/// One meeting between the player and a rival. A rival keeps the last `Balance.rivalMemoryKept`.
struct RivalMemory: Codable, Hashable {
    enum Kind: String, Codable {
        /// The player bought the last hot units of a batch at the rival's home store.
        case playerTookShelf
        /// The player got in at a camp where the rival stood in line.
        case playerBeatInLine
        /// The rival cleared a hot shelf before the player came, or took a unit off the vendor's cart.
        case rivalTookShelf
        /// The rival took a table near the player at a show and listed the same sealed for less.
        case rivalUndercutAtShow
        /// Part C: the player called the rival out, or the rival called the player out.
        case playerCalledOut
        case rivalCalledOut
        /// Part C: a callout between them ended. `byPlayer` says who won.
        case calloutEnded
        /// Any other meeting that Part B or Part C records.
        case other
    }

    let kind: Kind
    let day: Int
    let note: String
    /// True when the player acted against the rival. Part C reads these as grudges.
    let byPlayer: Bool
}

struct Rival: Codable, Identifiable, Hashable {
    enum Kind: String, Codable { case flipper, creator }

    var id = UUID()
    let name: String
    /// The social handle, for posts (Part C).
    let handle: String
    let kind: Kind
    /// 0 to 1. Grows with grudges. Pulls back to `baseHostility` each day.
    var hostility: Double
    let baseHostility: Double
    /// `rivalCredFloor` to 1. How much the crowd believes this rival. Part C lowers it. It regains each week.
    var credibility = 1.0
    /// The last meetings, oldest first.
    var memory: [RivalMemory] = []
    /// A flipper's usual chains. Empty for a creator.
    var homeStores: [LocalStore] = []
    var lastSeenDay = -1

    /// The meetings where the player acted against the rival.
    var grudges: [RivalMemory] { memory.filter(\.byPlayer) }
}

/// Later builds can add fields. Each missing field takes its default. In an extension, so the memberwise init stays.
extension Rival {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        handle = try c.decodeIfPresent(String.self, forKey: .handle) ?? ""
        kind = try c.decode(Kind.self, forKey: .kind)
        hostility = try c.decodeIfPresent(Double.self, forKey: .hostility) ?? 0.2
        baseHostility = try c.decodeIfPresent(Double.self, forKey: .baseHostility) ?? 0.2
        credibility = try c.decodeIfPresent(Double.self, forKey: .credibility) ?? 1
        memory = try c.decodeIfPresent([RivalMemory].self, forKey: .memory) ?? []
        homeStores = try c.decodeIfPresent([LocalStore].self, forKey: .homeStores) ?? []
        lastSeenDay = try c.decodeIfPresent(Int.self, forKey: .lastSeenDay) ?? -1
    }
}

extension Balance {
    /// Invented names. None is a real public person.
    static let rivalFlipperNames = ["Tyler Voss", "Dana Ruiz", "Marco Bell", "Kayla Strom", "Devon Pike", "Jess Ortega"]
    static let rivalCreatorNames = [("Phil", "@packratphil"), ("Sam Okafor", "@sealedsam"), ("Rhea Lin", "@rheapulls"),
                                    ("Jonah Wade", "@jonahrips")]
    static let rivalFlippers = 3
    static let rivalCreators = 2
    /// The meetings that a rival keeps.
    static let rivalMemoryKept = 3
    static let rivalBaseHostility = 0.15...0.35
    /// The chance of a receipt on each "rival took the stock" line.
    static let rivalReceiptChance = 0.05
    /// The hostility that a rival gains when the player takes the last units of a batch at the rival's store.
    static let rivalTookShelfHostility = 0.08
}

@MainActor
extension GameStore {
    /// Three rival flippers and two rival creators, the same for one run. On an old save it also marks today's
    /// news as seen and sets the follower tier mark, so the first End Day after the update does not jump.
    func seedRivals() {
        guard data.rivals.isEmpty else { return }
        var r = SeededRandom(seed: data.marketSeed ^ 0x5249_5641_4C53)
        func pick(_ count: Int) -> Int { r.int(0...(count - 1)) }
        func base() -> Double { r.double(Balance.rivalBaseHostility) }
        var flippers = Balance.rivalFlipperNames
        var creators = Balance.rivalCreatorNames
        let chains = LocalStore.allCases.filter(\.isBigStore)
        var out: [Rival] = []
        for _ in 0..<Balance.rivalFlippers where !flippers.isEmpty {
            let name = flippers.remove(at: pick(flippers.count))
            let hostility = base()
            var home = chains
            let a = home.remove(at: pick(home.count))
            let b = home.remove(at: pick(home.count))
            let handle = "@" + name.lowercased().replacingOccurrences(of: " ", with: "") + "flips"
            out.append(Rival(name: name, handle: handle, kind: .flipper, hostility: hostility, baseHostility: hostility,
                             homeStores: [a, b]))
        }
        for _ in 0..<Balance.rivalCreators where !creators.isEmpty {
            let chosen = creators.remove(at: pick(creators.count))
            let hostility = base()
            out.append(Rival(name: chosen.0, handle: chosen.1, kind: .creator, hostility: hostility, baseHostility: hostility))
        }
        let seen = data.marketEvents.map(\.id)
        let tier = hasAccount ? followerTier : 0
        data.rivals = out
        data.retail.seenEvents = seen
        data.retail.followerTierMark = tier
    }
}

@MainActor
extension GameStore {
    func rival(_ id: UUID) -> Rival? { data.rivals.first { $0.id == id } }

    /// The rival flipper who works this store. The same store gives the same rival.
    func rivalAt(_ store: LocalStore) -> Rival? {
        let here = data.rivals.filter { $0.kind == .flipper && $0.homeStores.contains(store) }
        guard !here.isEmpty else { return nil }
        return here[Int(PriceCycle.unit("rival-" + store.rawValue) * Double(here.count)) % here.count]
    }

    /// Records a meeting. Keeps the last few. Moves the hostility by `delta`, clamped to 0...1.
    func rememberRival(_ id: UUID, _ kind: RivalMemory.Kind, note: String, byPlayer: Bool, hostility delta: Double = 0) {
        guard let i = data.rivals.firstIndex(where: { $0.id == id }) else { return }
        let today = data.day
        var r = data.rivals[i]
        r.memory.append(RivalMemory(kind: kind, day: today, note: note, byPlayer: byPlayer))
        if r.memory.count > Balance.rivalMemoryKept { r.memory.removeFirst(r.memory.count - Balance.rivalMemoryKept) }
        r.hostility = min(1, max(0, r.hostility + delta))
        r.lastSeenDay = today
        data.rivals[i] = r
    }

    /// Part C: a callout between the player and a rival changes the rival's hostility (integration 1.3).
    func adjustRivalHostility(_ id: UUID, _ delta: Double, note: String = "Callout", kind: RivalMemory.Kind = .playerCalledOut) {
        rememberRival(id, kind, note: note, byPlayer: kind == .playerCalledOut, hostility: delta)
    }

    /// Part C: a failed false callout costs credibility. Clamped to `rivalCredFloor`...1.
    func changeRivalCredibility(_ id: UUID, by delta: Double) {
        guard let i = data.rivals.firstIndex(where: { $0.id == id }) else { return }
        var r = data.rivals[i]
        r.credibility = min(1, max(Balance.rivalCredFloor, r.credibility + delta))
        data.rivals[i] = r
    }

    /// A shelf receipt against a rival (D-10): `rivalReceiptChance` on each "rival took the stock" line. Part C's
    /// `noteRivalReceipt` keeps the 30-day gap for each rival and stores the receipt.
    func noteShelfReceipt(_ id: UUID, note: String) {
        guard Double.random(in: 0..<1) < Balance.rivalReceiptChance else { return }
        noteRivalReceipt(id, note: note)
    }
}
