import Foundation

// Callouts and secrets (docs/35-callouts.md). A shady act goes into a hidden log. Each day it can come out as a
// public callout. Rivals also post callouts, and most of theirs are false. The player answers with one of four replies.

/// A shady act that the player did. Other systems add entries through `recordHiddenAct`.
enum HiddenActKind: String, Codable, CaseIterable, Hashable {
    // Part A: retail and flipping.
    case shelfBuyout        // the player's buy emptied a hot item, 2 or more units in one visit (D-1)
    case limitEvasion       // the first buy on a second visit to one chain on one day
    case botCheckout        // used the checkout bot
    case storeBan           // staff at a chain refused card sales to the player
    case botOrderCancelled  // a store cancelled a bot order
    case priceGouge         // sold hot in-print sealed far above market (integration 1.2)
    // Part B: distribution and Rip & Ship.
    case backDoorAllocation // sold hot distributor allocation to outside resellers
    case plugPurchase       // bought from the gray plug
    case plugSeized         // plug stock that police seized as stolen
    case sellResealed       // knowingly sold a resealed product, and the buyer did not find it
    case palmedHit          // swapped a viewer's hit off camera, and the camera did not catch it
    case unshippedOrder     // a Rip & Ship order past its ship deadline
    // Part C and existing systems.
    case lowballKid         // told a kid their card is not worth much
    case counterfeitSold    // knowingly sold a fake card, and the buyer did not find it

    /// The callout type that this act becomes.
    var calloutType: CalloutType {
        switch self {
        case .shelfBuyout, .limitEvasion, .botCheckout, .storeBan, .botOrderCancelled, .priceGouge, .backDoorAllocation: .greed
        case .plugPurchase, .plugSeized: .forbidden
        case .sellResealed, .counterfeitSold: .productIntegrity
        case .palmedHit, .unshippedOrder: .fairness
        case .lowballKid: .kids
        }
    }

    /// The base daily chance that the act comes out, at weight 1.0 and no witnesses.
    var discovery: Double {
        switch self {
        case .shelfBuyout: 0.020
        case .limitEvasion: 0.015
        case .botCheckout: 0.010
        case .storeBan: 0.040
        case .botOrderCancelled: 0.015
        case .priceGouge: 0.020
        case .backDoorAllocation: 0.010
        case .plugPurchase: 0.006
        case .plugSeized: 0.050
        case .sellResealed: 0.030
        case .palmedHit: 0.040
        case .unshippedOrder: 0.200
        case .lowballKid: 0.030
        case .counterfeitSold: 0.020
        }
    }

    /// The share of the weight that the act loses each day. 0 means it waits until it comes out or another system
    /// retires it.
    var decay: Double {
        switch self {
        case .shelfBuyout: 0.08
        case .limitEvasion: 0.06
        case .botCheckout: 0.05
        case .storeBan: 0.04
        case .botOrderCancelled: 0.05
        case .priceGouge: 0.07
        case .backDoorAllocation: 0.03
        case .plugPurchase: 0.04
        case .plugSeized: 0.03
        case .sellResealed: 0.05
        case .palmedHit: 0.04
        case .unshippedOrder: 0.0
        case .lowballKid: 0.06
        case .counterfeitSold: 0.04
        }
    }

    /// The chance that the person who exposes the act has proof (screenshots, a video, a receipt).
    var receipts: Double {
        switch self {
        case .shelfBuyout: 0.6
        case .limitEvasion: 0.4
        case .botCheckout: 0.2
        case .storeBan: 0.6
        case .botOrderCancelled: 0.3
        case .priceGouge: 0.5
        case .backDoorAllocation: 0.5
        case .plugPurchase: 0.3
        case .plugSeized: 0.9
        case .sellResealed: 0.7
        case .palmedHit: 0.8
        case .unshippedOrder: 0.9
        case .lowballKid: 0.5
        case .counterfeitSold: 0.7
        }
    }

    /// Words for the post. `{who}` is the accuser.
    var calloutText: String {
        switch self {
        case .shelfBuyout: "{who} posted a video of you clearing a whole shelf of hot product."
        case .limitEvasion: "{who} says you went back to the store to get around the purchase limit."
        case .botCheckout: "{who} says you use a checkout bot on drops."
        case .storeBan: "{who} says a store banned you for scalping."
        case .botOrderCancelled: "{who} says the Pokemon Center cancelled a pile of your bot orders."
        case .priceGouge: "{who} posted your prices next to retail and called it gouging."
        case .backDoorAllocation: "{who} says your shop sells its allocation out the back door to flippers."
        case .plugPurchase: "{who} says your sealed stock comes from a sketchy plug."
        case .plugSeized: "{who} says the police took stolen product from you."
        case .sellResealed: "{who} says the box you sold them was resealed."
        case .palmedHit: "{who} posted a clip that shows you swapping a viewer's hit off camera."
        case .unshippedOrder: "{who} says you took their money on stream and never shipped."
        case .lowballKid: "{who} says you lowballed their kid on a card."
        case .counterfeitSold: "{who} says you sold them a fake and knew it."
        }
    }
}

/// One entry in the hidden log. The player does not see the log. The debug menu shows it.
struct HiddenAct: Codable, Identifiable, Hashable {
    var id = UUID()
    let kind: HiddenActKind
    let day: Int
    /// The size of the act: 1.0 is a normal act. It is not the scalper heat that the act adds. Falls each day by `decay`.
    var weight: Double
    let note: String
    /// True after the act came out as a callout.
    var exposed = false
    /// The share of the weight lost each day. Starts at `kind.decay`.
    var decay: Double
    /// People who saw the act: a crowd, a stream audience. More witnesses make discovery more likely.
    var witnesses = 0
    /// The person or shop that the act harmed. A true callout costs relationship points with them.
    var contactID: String?
    /// A fixed day when the act comes out, set by another system. Nil means a daily roll.
    var revealDay: Int?
    /// The money basis for "make it right". See 6.2 for how each kind uses it.
    var refund = 0.0
    /// The thing the act is about, for example a Rip & Ship order. Parts use it to retire the act.
    var sourceID: UUID?
}

/// A later field never drops the whole log. The extension keeps the memberwise init.
extension HiddenAct {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        kind = try c.decode(HiddenActKind.self, forKey: .kind)
        day = try c.decode(Int.self, forKey: .day)
        weight = try c.decodeIfPresent(Double.self, forKey: .weight) ?? 1
        note = try c.decodeIfPresent(String.self, forKey: .note) ?? ""
        exposed = try c.decodeIfPresent(Bool.self, forKey: .exposed) ?? false
        decay = try c.decodeIfPresent(Double.self, forKey: .decay) ?? kind.decay
        witnesses = try c.decodeIfPresent(Int.self, forKey: .witnesses) ?? 0
        contactID = try c.decodeIfPresent(String.self, forKey: .contactID)
        revealDay = try c.decodeIfPresent(Int.self, forKey: .revealDay)
        refund = try c.decodeIfPresent(Double.self, forKey: .refund) ?? 0
        sourceID = try c.decodeIfPresent(UUID.self, forKey: .sourceID)
    }
}

/// The five real kinds of callout, plus the backfire of a baseless callout by the player.
enum CalloutType: String, Codable, CaseIterable, Hashable {
    case kids, productIntegrity, fairness, greed, forbidden, smear

    var label: String {
        switch self {
        case .kids: "Treatment of kids"
        case .productIntegrity: "Product integrity"
        case .fairness: "Fair openings"
        case .greed: "Greed"
        case .forbidden: "Forbidden product"
        case .smear: "Baseless drama"
        }
    }

    var icon: String {
        switch self {
        case .kids: "figure.and.child.holdinghands"
        case .productIntegrity: "shippingbox.and.arrow.backward"
        case .fairness: "video.badge.exclamationmark"
        case .greed: "dollarsign.circle"
        case .forbidden: "exclamationmark.octagon"
        case .smear: "bubble.left.and.exclamationmark.bubble.right"
        }
    }

    /// The starting heat (proposal 6.4).
    var startHeat: Double {
        switch self {
        case .kids: Balance.calloutHeatKids
        case .productIntegrity: Balance.calloutHeatIntegrity
        case .fairness: Balance.calloutHeatFairness
        case .greed: Balance.calloutHeatGreed
        case .forbidden: Balance.calloutHeatForbidden
        case .smear: Balance.calloutHeatSmear
        }
    }
}

/// A rival that can post callouts: a named rival from Part A, or a rival game shop after a lease (D-8).
enum RivalKey: Codable, Hashable {
    case rival(UUID)
    case shop(LocalStore)
}

/// Who posted the callout.
enum CalloutAccuser: Codable, Hashable {
    case rival(RivalKey)
    /// A person the act harmed: a kid's parent, a buyer, a viewer.
    case person(String)
    /// The player, on a callout about a rival (proposal 6.8).
    case player
}

/// Who the callout is about. The player can call out a named rival, never a game shop.
enum CalloutTarget: Codable, Hashable {
    case player
    case rival(UUID)
}

/// The four replies (proposal 6.5).
enum CalloutReply: String, Codable, CaseIterable, Hashable {
    case silent, deny, makeRight, counter

    var label: String {
        switch self {
        case .silent: "Stay silent"
        case .deny: "Deny"
        case .makeRight: "Make it right"
        case .counter: "Counter-callout"
        }
    }
}

struct Callout: Codable, Identifiable, Hashable {
    var id = UUID()
    let type: CalloutType
    let accuser: CalloutAccuser
    var target: CalloutTarget = .player
    let startDay: Int
    /// The post, for example "Dana Ruiz says your sealed stock comes from a sketchy plug."
    let text: String
    /// Hidden from the player in the UI: the claim is true.
    let truth: Bool
    /// Visible: the accuser has proof. Proof can appear later.
    var receipts: Bool
    /// 0 to 100.
    var heat: Double
    var peak: Double
    /// One line: why the heat moved last (proposal 6.1).
    var reason: String
    /// The last active reply: deny, make it right, or counter. "Stay silent" does not set it.
    var reply: CalloutReply?
    var replyDay: Int?
    /// A scheduled fall to zero after a deny of a false callout or "make it right".
    var fallFrom: Double?
    var fallEndDay: Int?
    var caughtLying = false
    var madeRight = false
    /// The hidden act behind a true callout, its kind, and its source (for example a Rip & Ship order).
    var actID: UUID?
    var actKind: HiddenActKind?
    var sourceID: UUID?
    /// The source was settled elsewhere (shipped or refunded). Set by `retireHiddenAct(_:force: true)`.
    var sourceSettled = false
    var contactID: String?
    /// What "make it right" pays. Set when the callout opens.
    var refund: Double
    /// True when another system already took the reputation for this event (the sold-fake post, review M1).
    var repPaid = false
    /// Followers that a counter-callout gave. "Make it right" takes them back (review M7).
    var counterGain = 0
    /// The player opened the reply sheet and chose a reply, "stay silent" included. The hub banner stops then.
    var acknowledged = false
    /// Filled when it ends: the day, the reputation it cost, and one line for the history.
    var endedDay: Int?
    var repApplied = 0
    var outcome: String?
}

extension Callout {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        type = try c.decode(CalloutType.self, forKey: .type)
        accuser = try c.decode(CalloutAccuser.self, forKey: .accuser)
        target = try c.decodeIfPresent(CalloutTarget.self, forKey: .target) ?? .player
        startDay = try c.decode(Int.self, forKey: .startDay)
        text = try c.decodeIfPresent(String.self, forKey: .text) ?? ""
        truth = try c.decodeIfPresent(Bool.self, forKey: .truth) ?? false
        receipts = try c.decodeIfPresent(Bool.self, forKey: .receipts) ?? false
        heat = try c.decodeIfPresent(Double.self, forKey: .heat) ?? 0
        peak = try c.decodeIfPresent(Double.self, forKey: .peak) ?? heat
        reason = try c.decodeIfPresent(String.self, forKey: .reason) ?? ""
        reply = try c.decodeIfPresent(CalloutReply.self, forKey: .reply)
        replyDay = try c.decodeIfPresent(Int.self, forKey: .replyDay)
        fallFrom = try c.decodeIfPresent(Double.self, forKey: .fallFrom)
        fallEndDay = try c.decodeIfPresent(Int.self, forKey: .fallEndDay)
        caughtLying = try c.decodeIfPresent(Bool.self, forKey: .caughtLying) ?? false
        madeRight = try c.decodeIfPresent(Bool.self, forKey: .madeRight) ?? false
        actID = try c.decodeIfPresent(UUID.self, forKey: .actID)
        actKind = try c.decodeIfPresent(HiddenActKind.self, forKey: .actKind)
        sourceID = try c.decodeIfPresent(UUID.self, forKey: .sourceID)
        sourceSettled = try c.decodeIfPresent(Bool.self, forKey: .sourceSettled) ?? false
        contactID = try c.decodeIfPresent(String.self, forKey: .contactID)
        refund = try c.decodeIfPresent(Double.self, forKey: .refund) ?? 0
        repPaid = try c.decodeIfPresent(Bool.self, forKey: .repPaid) ?? false
        counterGain = try c.decodeIfPresent(Int.self, forKey: .counterGain) ?? 0
        acknowledged = try c.decodeIfPresent(Bool.self, forKey: .acknowledged) ?? false
        endedDay = try c.decodeIfPresent(Int.self, forKey: .endedDay)
        repApplied = try c.decodeIfPresent(Int.self, forKey: .repApplied) ?? 0
        outcome = try c.decodeIfPresent(String.self, forKey: .outcome)
    }
}

/// A serious true callout leaves a record for 90 days (proposal 6.7).
struct CalloutRecord: Codable, Hashable, Identifiable {
    var id = UUID()
    let day: Int
    let untilDay: Int
    let type: CalloutType
    let text: String
}

/// Proof that the player holds against a rival (proposal 6.8).
struct RivalReceipt: Codable, Hashable, Identifiable {
    var id = UUID()
    let key: RivalKey
    let day: Int
    let note: String
}

struct CalloutState: Codable, Hashable {
    var open: [Callout] = []
    /// The last 20 callouts that ended, newest last.
    var closed: [Callout] = []
    var records: [CalloutRecord] = []
    /// Credibility of each rival game shop, by `LocalStore.rawValue`. 0.25 to 1.0. Default 1.0. Named rivals keep
    /// theirs in `Rival.credibility` (Part A).
    var shopCredibility: [String: Double] = [:]
    var rivalReceipts: [RivalReceipt] = []
    /// The last day each named rival gave the player a receipt (1 per rival per 30 days).
    var receiptDay: [UUID: Int] = [:]
    /// Drama that rival creators can use, from the gambling backlash. 0 to 0.5. Halves each week.
    var dramaBait = 0.0
    var lastRivalCalloutDay = -999
    /// The last day the player posted a callout about each named rival.
    var playerCalloutDay: [UUID: Int] = [:]
    /// The last day the player gave a card to a kid.
    var kidGiftDay = -1

    init() {}

    /// Each field decodes on its own, so a later field never wipes the callouts of an older save.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func v<T: Decodable>(_ key: CodingKeys, _ fallback: T) -> T { (try? c.decodeIfPresent(T.self, forKey: key)) ?? fallback }
        open = v(.open, [])
        closed = v(.closed, [])
        records = v(.records, [])
        shopCredibility = v(.shopCredibility, [:])
        rivalReceipts = v(.rivalReceipts, [])
        receiptDay = v(.receiptDay, [:])
        dramaBait = v(.dramaBait, 0)
        lastRivalCalloutDay = v(.lastRivalCalloutDay, -999)
        playerCalloutDay = v(.playerCalloutDay, [:])
        kidGiftDay = v(.kidGiftDay, -1)
    }
}

extension Balance {
    // Start heat of a callout, by type (proposal 6.4).
    static let calloutHeatKids = 70.0
    static let calloutHeatIntegrity = 60.0
    static let calloutHeatFairness = 60.0
    static let calloutHeatGreed = 40.0
    static let calloutHeatForbidden = 50.0
    static let calloutHeatSmear = 40.0
    /// Open callouts about the player, except forced ones.
    static let calloutMaxOpen = 3
    /// The cost of "make it right" when no act sets a refund: dollars for each heat point, lowest, highest.
    static let calloutGoodwillPerHeat = 2.0
    static let calloutGoodwillMin = 25.0
    static let calloutGoodwillMax = 250.0
    /// At most 1 receipt from each rival in this many days.
    static let rivalReceiptGapDays = 30
    /// The lowest rival credibility, and the credibility that a game shop gets back each week.
    static let rivalCredFloor = 0.25
    static let rivalCredWeekly = 0.05
}

@MainActor
extension GameStore {
    /// Adds a shady act to the hidden log. Returns its ID so that the caller can retire or expose it later.
    /// Never call this inside a closure that you pass to a mutating call on `data` (the exclusivity trap).
    @discardableResult
    func recordHiddenAct(_ kind: HiddenActKind, weight: Double, note: String, witnesses: Int = 0,
                         contactID: String? = nil, revealDay: Int? = nil, refund: Double = 0,
                         sourceID: UUID? = nil) -> UUID {
        let act = HiddenAct(kind: kind, day: data.day, weight: max(0.1, min(3, weight)), note: note,
                            decay: kind.decay, witnesses: witnesses, contactID: contactID, revealDay: revealDay,
                            refund: refund, sourceID: sourceID)
        data.hiddenActs.append(act)
        return act.id
    }

    /// Removes an act when its source is settled. Without `force`, an exposed act stays. With `force`, an exposed act
    /// goes too, and its open callout loses half its heat. Returns true when the act had already come out.
    @discardableResult
    func retireHiddenAct(_ id: UUID, force: Bool = false) -> Bool {
        guard let i = data.hiddenActs.firstIndex(where: { $0.id == id }) else { return false }
        let exposed = data.hiddenActs[i].exposed
        guard !exposed || force else { return true }
        data.hiddenActs.remove(at: i)
        guard exposed, let k = data.callouts.open.firstIndex(where: { $0.actID == id }) else { return exposed }
        var c = data.callouts.open[k]
        c.heat /= 2
        c.sourceSettled = true
        c.reason = "The buyer's problem is settled. The talk is dying down."
        data.callouts.open[k] = c
        return true
    }

    /// Makes an act come out in `days` days. No caller yet. The debug menu can use it.
    func exposeHiddenAct(_ id: UUID, inDays days: Int = 1) {
        guard let i = data.hiddenActs.firstIndex(where: { $0.id == id }), !data.hiddenActs[i].exposed else { return }
        let day = data.day + max(0, days)
        data.hiddenActs[i].revealDay = day
    }

    /// Phase 0 stub: appends the callout and returns the report line. Phase 6 adds the cap merge and the rival memory.
    @discardableResult
    func startCallout(_ type: CalloutType, truth: Bool, receipts: Bool, heat: Double? = nil, accuser: CalloutAccuser,
                      text: String, force: Bool = false, actID: UUID? = nil, actKind: HiddenActKind? = nil,
                      sourceID: UUID? = nil, contactID: String? = nil, refund: Double = 0,
                      repPaid: Bool = false) -> String? {
        let today = data.day
        let start = min(100, heat ?? type.startHeat)
        let pay = refund > 0 ? refund : goodwill(heat: start)
        let c = Callout(type: type, accuser: accuser, startDay: today, text: text, truth: truth, receipts: receipts,
                        heat: start, peak: start, reason: receipts ? "They posted receipts." : "It is spreading.",
                        actID: actID, actKind: actKind, sourceID: sourceID, contactID: contactID, refund: pay,
                        repPaid: repPaid)
        data.callouts.open.append(c)
        log(text)
        return "Callout: \(text) Heat \(Int(start))."
    }

    /// The cost of "make it right" when no act sets a refund.
    func goodwill(heat: Double) -> Double {
        (min(Balance.calloutGoodwillMax, max(Balance.calloutGoodwillMin, heat * Balance.calloutGoodwillPerHeat))).rounded()
    }

    /// At most 1 receipt from each rival each `Balance.rivalReceiptGapDays` days.
    func noteRivalReceipt(_ id: UUID, note: String) {
        let today = data.day
        if let last = data.callouts.receiptDay[id], today - last < Balance.rivalReceiptGapDays { return }
        data.callouts.receiptDay[id] = today
        data.callouts.rivalReceipts.append(RivalReceipt(key: .rival(id), day: today, note: note))
    }
}
