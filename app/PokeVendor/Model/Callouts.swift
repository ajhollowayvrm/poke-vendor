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
    /// Heat lost each night with no reply schedule, the heat that a named rival adds with each answer, the heat under
    /// which a callout ends, and the most days that a callout lasts.
    static let calloutDecay = 0.15
    static let calloutReplyHeat = 20.0
    static let calloutEndHeat = 5.0
    static let calloutMaxDays = 45
    /// Open callouts about the player, except forced ones.
    static let calloutMaxOpen = 3
    /// The deny reply: the heat factor on a true callout, the find-out chances, the reputation lost when it falls apart,
    /// the reputation gained on a false callout, and the days that a denied false callout needs to reach 0.
    static let calloutDenyTrueFactor = 1.5
    static let calloutDenyFindOutReceipts = 0.5
    static let calloutDenyFindOutPlain = 0.2
    static let calloutDenyCaughtRep = 8
    static let calloutDenyFalseRep = 1
    static let calloutDenyFalseDays = 2
    /// With the purchase records app, a denied false product integrity or forbidden product callout falls in this many
    /// days, and the rival loses this multiple of the credibility.
    static let purchaseRecordsFalseDays = 1
    static let purchaseRecordsCredFactor = 1.5
    static let calloutMakeRightDays = 1
    /// The cost of "make it right" when no act sets a refund: dollars for each heat point, lowest, highest.
    static let calloutGoodwillPerHeat = 2.0
    static let calloutGoodwillMin = 25.0
    static let calloutGoodwillMax = 250.0
    /// Goodwill on a late Rip & Ship order: a share of the order price, and the lowest sum.
    static let lateShipGoodwillShare = 0.10
    static let lateShipGoodwillMin = 5.0
    /// The counter-callout: the heat it adds, the followers (a share), the authenticity it costs, the rival credibility
    /// it costs on a true and on a false callout, and the standing it costs with a game shop.
    static let calloutCounterHeat = 30.0
    static let calloutCounterFollowerShare = 0.005
    static let calloutCounterAuthenticity = 0.05
    static let calloutCounterCredTrue = 0.1
    static let calloutCounterCredFalse = 0.3
    static let calloutCounterShopCost = 10
    /// The peak heat of the viral and the bad story costs, and the authenticity lost at a viral fade.
    static let calloutViralPeak = 70.0
    static let calloutBadPeak = 30.0
    static let calloutViralAuthenticity = 0.1
    /// A true callout costs this many points with the harmed contact.
    static let calloutContactCost = 15
    /// A true callout that peaks at this heat leaves a record. The record lasts this many days. Each record lowers the
    /// start points of a new contact by `calloutRecordContactCost`. At most `calloutRecordMax` records count.
    static let calloutRecordPeak = 50.0
    static let calloutRecordDays = 90
    static let calloutRecordContactCost = 5
    static let calloutRecordMax = 3
    /// A true integrity callout, or a log palm, that peaks at this heat bans Whatnot for these days.
    static let calloutBanPeak = 80.0
    static let calloutBanDays = 28...56
    /// Receipts: the daily chance on a true callout, the lowest heat, and the heat that they add.
    static let calloutReceiptsDaily = 0.15
    static let calloutReceiptsMinHeat = 30.0
    static let calloutReceiptsHeat = 10.0
    /// The start heat factor of a false rival callout for a player with no account.
    static let calloutNoAccountHeat = 0.5
    /// No new sponsor offer at this heat or more.
    static let calloutSponsorBlockHeat = 60.0
    /// At a show, at this heat, this share of buyers mention the callout.
    static let calloutCrowdHeat = 50.0
    static let calloutCrowdChance = 0.125
    static let responseBurnout = 0.05
    // The hidden log.
    static let hiddenActNotorietyStep = 0.1
    static let hiddenActDailyCap = 0.5
    static let hiddenActMinWeight = 0.05
    static let hiddenActMaxDays = 90
    static let hiddenActKeepDays = 120
    static let witnessCap = 3.0
    // Rivals.
    static let rivalBreaksStory = 0.33
    static let rivalCalloutBase = 0.008
    static let rivalCalloutHostility = 0.06
    static let rivalCalloutTruth = 0.4
    static let rivalCalloutGap = 14
    static let rivalCalloutGapFactor = 0.25
    /// At most 1 receipt from each rival in this many days.
    static let rivalReceiptGapDays = 30
    /// The lowest rival credibility, and the credibility that a game shop gets back each week.
    static let rivalCredFloor = 0.25
    static let rivalCredWeekly = 0.05
    static let rivalCredDenied = 0.25
    static let rivalReceiptDays = 60
    static let shopRivalHostilityBase = 0.2
    static let shopRivalHostilityRange = 0.5
    static let dramaBaitGambling = 0.15
    static let dramaBaitMax = 0.5
    // The player calls out a rival.
    static let playerCalloutRep = 1
    static let playerCalloutFollowerShare = 0.005
    static let playerCalloutFollowerMin = 10
    static let playerCalloutCred = 0.3
    static let playerCalloutHostility = 0.2
    static let playerCalloutCooldown = 28
    static let playerSmearAuthenticity = 0.05
    static let playerSmearCredGain = 0.1
    // The kid gift and the good stories.
    static let kidGiftMinValue = 5.0
    static let kidGiftMaxValue = 30.0
    static let kidGiftStory = 0.15
    static let goodStoryHeatCut = 10.0
    static let viralGoodStoryHeatCut = 25.0
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
    func retireHiddenAct(_ id: UUID, force: Bool = false,
                         reason: String = "The buyer's problem is settled. The talk is dying down.") -> Bool {
        guard let i = data.hiddenActs.firstIndex(where: { $0.id == id }) else { return false }
        let exposed = data.hiddenActs[i].exposed
        guard !exposed || force else { return true }
        data.hiddenActs.remove(at: i)
        guard exposed, let k = data.callouts.open.firstIndex(where: { $0.actID == id }) else { return exposed }
        var c = data.callouts.open[k]
        c.heat /= 2
        c.sourceSettled = true
        c.reason = reason
        data.callouts.open[k] = c
        return true
    }

    /// Makes an act come out in `days` days. No caller yet. The debug menu can use it.
    func exposeHiddenAct(_ id: UUID, inDays days: Int = 1) {
        guard let i = data.hiddenActs.firstIndex(where: { $0.id == id }), !data.hiddenActs[i].exposed else { return }
        let day = data.day + max(0, days)
        data.hiddenActs[i].revealDay = day
    }

    /// Opens a callout about the player. Returns the report line.
    /// `force`: the callout opens past the cap (a palm caught on camera, a public fake post, an act with a fixed
    /// reveal day, an unshipped order, a baseless player callout). Without `force`, a full cap adds the heat to an
    /// open callout, so an act is never lost.
    @discardableResult
    func startCallout(_ type: CalloutType, truth: Bool, receipts: Bool, heat: Double? = nil, accuser: CalloutAccuser,
                      text: String, force: Bool = false, actID: UUID? = nil, actKind: HiddenActKind? = nil,
                      sourceID: UUID? = nil, contactID: String? = nil, refund: Double = 0,
                      repPaid: Bool = false) -> String? {
        let today = data.day
        let start = min(100, heat ?? type.startHeat)
        let open = data.callouts.open.filter { $0.target == .player }
        if !force, open.count >= Balance.calloutMaxOpen {
            // The heat joins an open true callout that is still going: the same type first, then any. It never joins a
            // false callout or one that the player already resolved (deny, make it right), because the fade would
            // count the act as beaten. With no such callout, an act opens its own callout past the cap, so it never
            // vanishes. A claim with no act has nothing to lose and drops.
            let live = open.filter { $0.truth && $0.fallFrom == nil }
            if let pick = live.first(where: { $0.type == type }) ?? live.max(by: { $0.heat < $1.heat }),
               let k = data.callouts.open.firstIndex(where: { $0.id == pick.id }) {
                var c = data.callouts.open[k]
                c.heat = min(100, c.heat + start)
                c.peak = max(c.peak, c.heat)
                c.reason = "More people piled on."
                data.callouts.open[k] = c
                log(text)
                return "Callout: \(text) It joined the talk about you. Heat \(Int(c.heat))."
            }
            if actID == nil { return nil }
        }
        let pay = refund > 0 ? refund : goodwill(heat: start)
        let c = Callout(type: type, accuser: accuser, startDay: today, text: text, truth: truth, receipts: receipts,
                        heat: start, peak: start, reason: receipts ? "They posted receipts." : "It is spreading.",
                        actID: actID, actKind: actKind, sourceID: sourceID, contactID: contactID, refund: pay,
                        repPaid: repPaid)
        data.callouts.open.append(c)
        if case .rival(.rival(let id)) = accuser {
            rememberRival(id, .rivalCalledOut, note: text, byPlayer: false)
        }
        log(text)
        return "Callout: \(text) Heat \(Int(start))."
    }

    /// The cost of "make it right" when no act sets a refund.
    func goodwill(heat: Double) -> Double {
        (min(Balance.calloutGoodwillMax, max(Balance.calloutGoodwillMin, heat * Balance.calloutGoodwillPerHeat))).rounded()
    }

    /// The goodwill sum for a late Rip & Ship order: 10% of the order price, at least $5.
    func lateGoodwill(_ price: Double) -> Double {
        max(Balance.lateShipGoodwillMin, (price * Balance.lateShipGoodwillShare * 100).rounded() / 100)
    }

    /// At most 1 receipt from each rival each `Balance.rivalReceiptGapDays` days.
    func noteRivalReceipt(_ id: UUID, note: String) {
        let today = data.day
        if let last = data.callouts.receiptDay[id], today - last < Balance.rivalReceiptGapDays { return }
        data.callouts.receiptDay[id] = today
        data.callouts.rivalReceipts.append(RivalReceipt(key: .rival(id), day: today, note: note))
    }
}

// MARK: - Reads

@MainActor
extension GameStore {
    var openCallouts: [Callout] { data.callouts.open.filter { $0.target == .player } }
    var hottestCallout: Double { openCallouts.map(\.heat).max() ?? 0 }
    var activeRecords: [CalloutRecord] {
        let today = data.day
        return data.callouts.records.filter { $0.untilDay >= today }
    }
    /// Points that a new contact loses for the active records.
    var recordPenalty: Int { min(Balance.calloutRecordMax, activeRecords.count) * Balance.calloutRecordContactCost }

    func callout(_ id: UUID) -> Callout? { data.callouts.open.first { $0.id == id } }

    func name(of accuser: CalloutAccuser) -> String {
        switch accuser {
        case .rival(let key): name(of: key)
        case .person(let name): name
        case .player: data.social.handle ?? "You"
        }
    }

    func name(of key: RivalKey) -> String {
        switch key {
        case .rival(let id): rival(id)?.name ?? "A rival"
        case .shop(let shop): shop.rawValue
        }
    }

    /// Named rivals keep credibility on `Rival`. Game shops keep it in `CalloutState`.
    func credibility(_ key: RivalKey) -> Double {
        switch key {
        case .rival(let id): rival(id)?.credibility ?? 1
        case .shop(let shop): data.callouts.shopCredibility[shop.rawValue] ?? 1
        }
    }

    /// Lowers credibility, down to the floor at most. A named rival goes through `changeRivalCredibility`. A receipt
    /// against a named rival is optional.
    func loseCredibility(_ key: RivalKey, _ amount: Double, receipt: String?) {
        let now = credibility(key)                       // read before any write
        let next = max(Balance.rivalCredFloor, now - amount)
        switch key {
        case .rival(let id):
            changeRivalCredibility(id, by: next - now)
            if let receipt { noteRivalReceipt(id, note: receipt) }
        case .shop(let shop):
            data.callouts.shopCredibility[shop.rawValue] = next
        }
    }

    /// Every rival that can post: the named rivals, and the two game shops after a lease.
    func rivalPool() -> [RivalView] {
        var out = data.rivals.map { r in
            RivalView(key: .rival(r.id), hostility: r.hostility, credibility: r.credibility, creator: r.kind == .creator)
        }
        if data.cardStore != nil {
            for shop in LocalStore.allCases where shop.isGameShop {
                let points = Double(self.shop(shop).points)
                out.append(RivalView(key: .shop(shop),
                                     hostility: Balance.shopRivalHostilityBase + Balance.shopRivalHostilityRange * (1 - points / 100),
                                     credibility: credibility(.shop(shop)), creator: false))
            }
        }
        return out
    }
}

/// One rival, as the callout system sees it. Built fresh each time. Not saved.
struct RivalView {
    let key: RivalKey
    let hostility: Double
    let credibility: Double
    let creator: Bool
    var accuser: CalloutAccuser { .rival(key) }
}

// MARK: - End Day

@MainActor
extension GameStore {
    /// End Day: hidden acts that come out, the weekly rival roll, then heat, replies, and the end of callouts.
    func calloutsEndDay() -> [String] {
        var lines: [String] = []
        storeShelfGouge()              // a high shelf price that stays up is a gouge each night
        lines += exposeHiddenActs()
        lines += rivalCalloutsWeekly()
        lines += advanceCallouts()
        return lines.filter { !$0.isEmpty }
    }

    /// The first night rule: an act can come out on the night it is recorded. Every value is read into a local
    /// first. The loop changes only the local copy of the log (exclusivity rule).
    private func exposeHiddenActs() -> [String] {
        let today = data.day
        let notor = Double(notoriety)
        let pressure = data.flipperPressure
        let heat = data.scalperHeat
        var acts = data.hiddenActs
        var exposed: [HiddenAct] = []
        for i in acts.indices where !acts[i].exposed {
            let a = acts[i]
            let due: Bool
            if let r = a.revealDay {
                due = r <= today
            } else {
                let witness = min(Balance.witnessCap, 1 + log10(1 + Double(a.witnesses)) / 2)
                var p = a.kind.discovery * a.weight * witness * (1 + Balance.hiddenActNotorietyStep * notor)
                if a.kind.calloutType == .greed { p *= (0.5 + pressure) * (1 + min(1, heat / 10)) }
                due = Double.random(in: 0..<1) < min(Balance.hiddenActDailyCap, p)
            }
            if due { exposed.append(a) } else if a.revealDay == nil { acts[i].weight *= 1 - a.decay }
        }
        data.hiddenActs = acts
        var lines: [String] = []
        for a in exposed {
            guard let line = openCallout(from: a) else { continue }
            if let i = data.hiddenActs.firstIndex(where: { $0.id == a.id }) { data.hiddenActs[i].exposed = true }
            lines.append(line)
        }
        let keep = Balance.hiddenActKeepDays, maxDays = Balance.hiddenActMaxDays, minWeight = Balance.hiddenActMinWeight
        data.hiddenActs.removeAll { a in
            a.exposed ? today - a.day > keep
                      : a.revealDay == nil && a.kind.decay > 0 && (a.weight < minWeight || today - a.day > maxDays)
        }
        return lines
    }

    /// The victim posts most callouts. A rival breaks the story 1 time in 3.
    func openCallout(from a: HiddenAct) -> String? {
        let rivals = data.rivals
        let accuser: CalloutAccuser
        if let r = rivals.randomElement(), Double.random(in: 0..<1) < Balance.rivalBreaksStory {
            accuser = .rival(.rival(r.id))
        } else {
            accuser = .person(victimName(a))
        }
        let text = a.kind.calloutText.replacingOccurrences(of: "{who}", with: name(of: accuser))
        let type = a.kind.calloutType
        let pay = a.kind == .unshippedOrder ? lateGoodwill(a.refund) : a.refund
        // An act with a fixed day, an unshipped order, and a palm open their own callout, so their order can settle it.
        let force = a.revealDay != nil || a.kind == .unshippedOrder || a.kind == .palmedHit
        return startCallout(type, truth: true, receipts: Double.random(in: 0..<1) < a.kind.receipts,
                            heat: type.startHeat * min(1.5, max(0.75, a.weight)), accuser: accuser, text: text,
                            force: force, actID: a.id, actKind: a.kind, sourceID: a.sourceID,
                            contactID: a.contactID, refund: pay)
    }

    private func victimName(_ a: HiddenAct) -> String {
        switch a.kind {
        case .lowballKid: "A parent"
        case .palmedHit, .unshippedOrder: "A stream buyer"
        case .sellResealed, .counterfeitSold: "A buyer"
        case .shelfBuyout, .limitEvasion, .storeBan: "A shopper"
        default: "A collector"
        }
    }

    // MARK: Rival callouts

    /// Runs when `data.day % 7 == 0`. Game shops get credibility back here. Named rivals get it in `rivalsEndDay`.
    private func rivalCalloutsWeekly() -> [String] {
        let today = data.day
        guard today % 7 == 0 else { return [] }
        let regain = Balance.rivalCredWeekly, receiptDays = Balance.rivalReceiptDays
        var state = data.callouts
        state.dramaBait *= 0.5
        state.shopCredibility = state.shopCredibility.mapValues { min(1, $0 + regain) }
        state.rivalReceipts.removeAll { today - $0.day > receiptDays }
        data.callouts = state
        guard reputationTier >= 1 || (hasAccount && followerTier >= 1) else { return [] }   // nobody talks about an unknown
        var lines: [String] = []
        for r in rivalPool() {
            let open = data.callouts.open
            guard open.filter({ $0.target == .player }).count < Balance.calloutMaxOpen,
                  !open.contains(where: { $0.accuser == r.accuser && $0.target == .player }) else { continue }
            var p = (Balance.rivalCalloutBase + Balance.rivalCalloutHostility * r.hostility) * r.credibility
            if r.creator { p += data.callouts.dramaBait }
            if today - data.callouts.lastRivalCalloutDay < Balance.rivalCalloutGap { p *= Balance.rivalCalloutGapFactor }
            guard Double.random(in: 0..<1) < p, let line = rivalCallout(r) else { continue }
            lines.append(line)
        }
        return lines
    }

    /// A rival posts. 4 times in 10 it uses a real hidden act that fits the rival. Otherwise the claim is false.
    @discardableResult
    func rivalCallout(_ r: RivalView) -> String? {
        let fits: Set<CalloutType> = r.creator ? [.fairness, .productIntegrity, .kids, .greed]
                                               : [.greed, .forbidden, .productIntegrity]
        let acts = data.hiddenActs.filter { !$0.exposed && fits.contains($0.kind.calloutType) }   // a read
        let who = name(of: r.key)
        let line: String?
        if let act = acts.randomElement(), Double.random(in: 0..<1) < Balance.rivalCalloutTruth {
            let text = act.kind.calloutText.replacingOccurrences(of: "{who}", with: who)
            let pay = act.kind == .unshippedOrder ? lateGoodwill(act.refund) : act.refund
            let force = act.kind == .unshippedOrder || act.kind == .palmedHit
            line = startCallout(act.kind.calloutType, truth: true,
                                receipts: Double.random(in: 0..<1) < act.kind.receipts * 0.5,
                                heat: act.kind.calloutType.startHeat * r.credibility, accuser: r.accuser, text: text,
                                force: force, actID: act.id, actKind: act.kind, sourceID: act.sourceID,
                                contactID: act.contactID, refund: pay)
            if line != nil, let i = data.hiddenActs.firstIndex(where: { $0.id == act.id }) { data.hiddenActs[i].exposed = true }
        } else {
            let type = falseType(r)
            let scale = r.credibility * (hasAccount ? 1 : Balance.calloutNoAccountHeat)
            line = startCallout(type, truth: false, receipts: false, heat: type.startHeat * scale, accuser: r.accuser,
                                text: falseText(type, who: who))
        }
        if line != nil { data.callouts.lastRivalCalloutDay = data.day }
        return line
    }

    private func falseType(_ r: RivalView) -> CalloutType {
        if case .shop = r.key { return Bool.random() ? .greed : .productIntegrity }
        let options: [(CalloutType, Double)] = r.creator ? [(.fairness, 0.5), (.greed, 0.35), (.kids, 0.15)]
                                                         : [(.greed, 0.7), (.productIntegrity, 0.3)]
        return ShowSession.weighted(options) ?? .greed
    }

    private func falseText(_ type: CalloutType, who: String) -> String {
        switch type {
        case .greed: "\(who) is telling people that your prices are inflated and that you scalp."
        case .productIntegrity: "\(who) hints that your sealed product is resealed."
        case .fairness: "\(who) says your rip videos are staged."
        case .kids: "\(who) says you rip off kids at shows."
        case .forbidden: "\(who) says your stock fell off a truck."
        case .smear: "\(who) says you start drama for views."
        }
    }

    /// The bad branch of the weekly random story: a callout from one named rival, or nothing.
    func randomRivalStory() -> String? {
        guard openCallouts.count < Balance.calloutMaxOpen, let r = rivalPool().randomElement() else { return nil }
        return rivalCallout(r)
    }

    // MARK: Heat and the end of a callout

    private func advanceCallouts() -> [String] {
        let today = data.day
        let hostility = Dictionary(data.rivals.map { ($0.id, $0.hostility) }, uniquingKeysWith: { a, _ in a })
        var open = data.callouts.open
        var ended: [Callout] = []
        for i in open.indices {
            var c = open[i]
            if c.startDay == today { continue }          // a new callout keeps its starting heat for one night
            if let from = c.fallFrom, let end = c.fallEndDay, let start = c.replyDay {
                c.heat = today >= end ? 0 : from * Double(end - today) / Double(max(1, end - start))
            } else {
                c.heat *= 1 - Balance.calloutDecay
                c.reason = "It is fading."
            }
            // A named rival answers a deny or a counter the next night.
            if let reply = c.reply, reply == .deny || reply == .counter, c.replyDay == today - 1, c.fallFrom == nil,
               case .rival(.rival(let id)) = c.accuser, Double.random(in: 0..<1) < (hostility[id] ?? 0.5) {
                c.heat = min(100, c.heat + Balance.calloutReplyHeat)
                c.reason = "They answered your reply."
            }
            // Receipts come out during the pile-on.
            if c.truth, !c.receipts, c.heat >= Balance.calloutReceiptsMinHeat, Double.random(in: 0..<1) < Balance.calloutReceiptsDaily {
                c.receipts = true
                c.heat = min(100, c.heat + Balance.calloutReceiptsHeat)
                c.reason = "Someone posted receipts."
            }
            c.peak = max(c.peak, c.heat)
            open[i] = c
            if c.heat < Balance.calloutEndHeat || today - c.startDay > Balance.calloutMaxDays { ended.append(c) }
        }
        let endedIDs = Set(ended.map(\.id))
        open.removeAll { endedIDs.contains($0.id) }
        data.callouts.open = open                        // write back once, then apply the effects
        return ended.map { settle($0) }
    }

    /// The end of a callout. The peak heat sets the story cost, then the record and the Whatnot ban. It runs inside End
    /// Day, so it never calls `save()`.
    private func settle(_ c: Callout) -> String {
        let today = data.day
        guard c.target == .player else { return close(c, rep: 0, line: "") }
        // A false callout that the player beat with a deny, or paid off, costs nothing at the end.
        let won = !c.truth && (c.madeRight || c.reply == .deny)
        var rep = 0
        var line = "The callout from \(name(of: c.accuser)) faded."
        if !won {
            let viral = c.peak >= Balance.calloutViralPeak
            if viral { rep = Balance.storyBadViralRep } else if c.peak >= Balance.calloutBadPeak { rep = Balance.storyBadRep }
            if c.madeRight { rep = (rep + 1) / 2 }
            if c.repPaid { rep = 0 }
            if viral, hasAccount, !c.madeRight {
                let loss = Int(Double(data.social.followers) * Balance.storyBadViralFollowerShare)
                data.social.followers = max(0, data.social.followers - loss)
                data.social.authenticity = max(0, data.social.authenticity - Balance.calloutViralAuthenticity)
                line += " You lost \(loss) followers."
            }
        }
        if rep > 0 { addReputation(-rep); line += " Reputation −\(rep)." }
        if c.truth {
            if let id = c.contactID { addPoints(id, -Balance.calloutContactCost) }
            if c.peak >= Balance.calloutRecordPeak {
                data.callouts.records.append(CalloutRecord(day: today, untilDay: today + Balance.calloutRecordDays,
                                                           type: c.type, text: c.text))
                line += " A busted thread about you stays up for \(Balance.calloutRecordDays) days."
            }
            // A palm found later through the log gets the same ban as a palm caught on camera. A caught palm has no
            // act (`actID == nil`): `settlePalm` already banned it.
            let palmFromLog = c.actKind == .palmedHit && c.actID != nil
            if c.peak >= Balance.calloutBanPeak, palmFromLog || c.type == .productIntegrity {
                let days = palmFromLog ? Balance.palmBanDays : Int.random(in: Balance.calloutBanDays)
                banFromWhatnot(days: days, reason: palmFromLog ? "a palmed hit" : "a product integrity callout")
                line += " Whatnot banned you from streams for \(days / 7) weeks."
            }
        }
        if case .rival(.rival(let id)) = c.accuser {
            rememberRival(id, .calloutEnded, note: c.text, byPlayer: won)
        }
        return close(c, rep: rep, line: line)
    }

    private func close(_ callout: Callout, rep: Int, line: String) -> String {
        var c = callout
        c.endedDay = data.day
        c.repApplied = rep
        c.outcome = line.isEmpty ? nil : line
        var closed = data.callouts.closed
        closed.append(c)
        data.callouts.closed = Array(closed.suffix(20))
        if !line.isEmpty { log(line) }
        return line
    }
}

// MARK: - Replies

@MainActor
extension GameStore {
    /// A late Rip & Ship order that is still open.
    func ripShipOrderOpen(_ id: UUID) -> Bool {
        guard let o = data.ripShip.orders.first(where: { $0.id == id }) else { return false }
        return !o.shipped && !o.refunded
    }

    /// What "make it right" pays now. A palm asks `palmRefundDue`, so an order that a chargeback already refunded pays
    /// only the cards. Every other callout pays its stored `refund`.
    func makeRightCost(_ c: Callout) -> Double {
        if c.actKind == .palmedHit, let order = c.sourceID { return palmRefundDue(order) }
        return c.refund
    }

    /// What each reply needs. Deny and counter need an account. They cannot both run on one callout.
    func replyBlock(_ c: Callout, _ reply: CalloutReply) -> String? {
        if c.fallFrom != nil { return "This callout is already ending." }
        switch reply {
        case .silent:
            return nil
        case .deny:
            if !hasAccount { return "You need a social account to post a reply." }
            if c.reply == .deny || c.caughtLying { return "You already denied it." }
            if c.reply == .counter { return "You already hit back. A denial now looks weak." }
            return nil
        case .makeRight:
            if c.actKind == .unshippedOrder, !c.sourceSettled, let id = c.sourceID, ripShipOrderOpen(id),
               slot(for: ripShipShipMinutes / 60) == nil {
                return "You need \(Int(ripShipShipMinutes)) minutes today to ship the order."
            }
            let cost = makeRightCost(c)
            return canAfford(cost) ? nil : "You need \(money(cost))."
        case .counter:
            if !hasAccount { return "You need a social account to post a reply." }
            guard case .rival = c.accuser else { return "You can only counter a rival." }
            if c.type == .smear { return "You started this one. You cannot counter it." }
            if c.reply == .counter { return "You already posted a counter-callout." }
            if c.reply == .deny { return "You already denied it. Hitting back now looks petty." }
            return nil
        }
    }

    /// The player answers a callout. Returns one line for the sheet.
    @discardableResult
    func replyToCallout(_ id: UUID, _ reply: CalloutReply) -> String {
        guard let first = callout(id) else { return "" }
        if let block = replyBlock(first, reply) { return block }
        // Calls into Rip & Ship come first, because they can change this callout (`retireHiddenAct(force:)` halves the heat).
        var shippedNow = false
        let cost = makeRightCost(first)                   // read before `returnPalmedCards` changes the order
        if reply == .makeRight {
            if first.actKind == .unshippedOrder, !first.sourceSettled, let order = first.sourceID, ripShipOrderOpen(order) {
                if let fail = shipRipShipOrders([order]) { return fail }
                shippedNow = true
            }
            if first.actKind == .palmedHit, let order = first.sourceID { returnPalmedCards(order) }
        }
        guard let i = data.callouts.open.firstIndex(where: { $0.id == id }) else { return "" }
        var c = data.callouts.open[i]
        let today = data.day
        let who = name(of: c.accuser)
        var out: String
        switch reply {
        case .silent:
            c.reason = "You stayed silent. It fades on its own."
            out = "You said nothing. The heat falls \(Int(Balance.calloutDecay * 100))% each day."
        case .deny:
            if c.truth {
                c.heat = min(100, c.heat * Balance.calloutDenyTrueFactor)
                c.reason = "You denied it. People are digging."
                let findOut = c.receipts ? Balance.calloutDenyFindOutReceipts : Balance.calloutDenyFindOutPlain
                if Double.random(in: 0..<1) < findOut {
                    c.caughtLying = true
                    c.receipts = true
                    c.reason = "Your denial fell apart. The receipts are out."
                    addReputation(-Balance.calloutDenyCaughtRep)
                    out = "People found proof against your denial. Reputation −\(Balance.calloutDenyCaughtRep)."
                } else {
                    out = "You denied it. The heat went up."
                }
            } else {
                // The purchase records prove a false claim about a product: a faster fall and a bigger loss for the rival.
                let records = hasUpgrade(.purchaseRecords) && (c.type == .productIntegrity || c.type == .forbidden)
                let fallDays = records ? Balance.purchaseRecordsFalseDays : Balance.calloutDenyFalseDays
                c.fallFrom = c.heat
                c.fallEndDay = today + fallDays
                c.reason = "You showed it was false."
                addReputation(Balance.calloutDenyFalseRep)
                if case .rival(let key) = c.accuser {
                    loseCredibility(key, Balance.rivalCredDenied * (records ? Balance.purchaseRecordsCredFactor : 1),
                                    receipt: "\(who) lied about you on day \(today + 1).")
                }
                out = "You showed the claim was false. \(denyProof(c)) Reputation +\(Balance.calloutDenyFalseRep). It ends in \(fallDays) day\(fallDays == 1 ? "" : "s")."
            }
        case .makeRight:
            if c.counterGain > 0 {
                data.social.followers = max(0, data.social.followers - c.counterGain)
                c.counterGain = 0
            }
            addLedger(-cost, .refund, "Made it right · \(c.type.label)")
            c.madeRight = true
            c.fallFrom = c.heat
            c.fallEndDay = today + Balance.calloutMakeRightDays
            c.reason = "You made it right."
            if shippedNow {
                out = "You shipped the order and paid \(money(cost)) for the wait. It ends tomorrow."
            } else if c.actKind == .palmedHit {
                out = "You paid \(money(cost)) and sent the card to the buyer. It ends tomorrow."
            } else {
                out = "You paid \(money(cost)) to make it right. It ends tomorrow."
            }
        case .counter:
            c.heat = min(100, c.heat + Balance.calloutCounterHeat)
            c.reason = "You hit back. Everyone is watching."
            let gain = Int(Double(data.social.followers) * Balance.calloutCounterFollowerShare)
            data.social.followers += gain
            c.counterGain = gain
            data.social.authenticity = max(0, data.social.authenticity - Balance.calloutCounterAuthenticity)
            if case .rival(let key) = c.accuser {
                loseCredibility(key, c.truth ? Balance.calloutCounterCredTrue : Balance.calloutCounterCredFalse, receipt: nil)
                switch key {
                case .rival(let rid): adjustRivalHostility(rid, Balance.playerCalloutHostility)
                case .shop(let shop): addPoints(shopContactID(shop), -Balance.calloutCounterShopCost)
                }
            }
            out = "You posted a counter-callout. +\(gain) followers. The heat went up on both sides."
        }
        // A reply can change this callout through a call above, so read it again before the one write.
        guard let k = data.callouts.open.firstIndex(where: { $0.id == id }) else { return out }
        c.peak = max(c.peak, c.heat)
        c.acknowledged = true
        if reply != .silent {
            c.reply = reply
            c.replyDay = today                         // "stay silent" never sets it
        }
        data.callouts.open[k] = c
        if reply == .deny || reply == .counter || (reply == .makeRight && hasAccount) {
            postResponse(subject: "\(reply.label) · \(who)", heat: c.heat)
        }
        log(out)
        save()
        return out
    }

    /// A line of proof from the player's own record, shown after a deny of a false callout.
    private func denyProof(_ c: Callout) -> String {
        let since = data.day - 30
        switch c.type {
        case .greed:
            let n = data.ledger.filter { $0.category == .sale && $0.day >= since }.count
            return "You posted your last \(n) sales. The prices were fair."
        case .fairness:
            let n = data.ripShip.orders.filter(\.shipped).count
            return n > 0 ? "All \(n) of your recent Rip & Ship orders shipped." : "Your rip videos are uncut."
        case .productIntegrity: return "You showed the seals and the receipts for your stock."
        case .kids: return "Parents from your table vouched for you."
        case .forbidden: return "You posted your invoices."
        case .smear: return "Your record speaks for itself."
        }
    }

    /// The reply shows in the post list. It has no follower gain.
    private func postResponse(subject: String, heat: Double) {
        let followers = data.social.followers
        let views = max(1, Int(Double(followers) * 0.2 * max(0.3, heat / 50)))
        let post = SocialPost(day: data.day, type: .response, subject: subject, views: views, followerChange: 0,
                              likes: Int(Double(views) * 0.05), quality: 1, timing: 1, luck: 1)
        data.social.posts.append(post)
        data.social.burnout = min(1, data.social.burnout + Balance.responseBurnout)
        data.social.lastPostDay = data.day
    }
}

// MARK: - Player callouts, the kid gift, good stories

@MainActor
extension GameStore {
    /// Why the player cannot call out this rival now, or nil. The player never calls out a game shop.
    func playerCalloutBlock(_ rivalID: UUID) -> String? {
        guard hasAccount else { return "You need a social account to post a callout." }
        if let last = data.callouts.playerCalloutDay[rivalID], data.day - last < Balance.playerCalloutCooldown {
            return "You called them out on day \(last + 1). Wait \(Balance.playerCalloutCooldown) days."
        }
        return nil
    }

    /// The proof that the player holds against a rival.
    func receipts(against rivalID: UUID) -> [RivalReceipt] {
        let key = RivalKey.rival(rivalID)
        return data.callouts.rivalReceipts.filter { $0.key == key }
    }

    /// With a receipt the callout is true. Without one, the heat lands on the player.
    @discardableResult
    func calloutRival(_ rivalID: UUID) -> String {
        if let block = playerCalloutBlock(rivalID) { return block }
        let today = data.day
        let rivalName = rival(rivalID)?.name ?? "the rival"
        let cred = credibility(.rival(rivalID))
        data.callouts.playerCalloutDay[rivalID] = today
        let key = RivalKey.rival(rivalID)
        let receipt = data.callouts.rivalReceipts.first { $0.key == key }
        let out: String
        if let receipt {
            let used = receipt.id
            data.callouts.rivalReceipts.removeAll { $0.id == used }
            // A rival that nobody believes is worth little to expose.
            let rep = Int((Double(Balance.playerCalloutRep) * cred).rounded())
            let base = max(Balance.playerCalloutFollowerMin, Int(Double(data.social.followers) * Balance.playerCalloutFollowerShare))
            let gain = Int((Double(base) * cred).rounded())
            addReputation(rep)
            data.social.followers += gain
            loseCredibility(key, Balance.playerCalloutCred, receipt: nil)
            adjustRivalHostility(rivalID, Balance.playerCalloutHostility)
            data.callouts.open.append(Callout(type: .smear, accuser: .player, target: .rival(rivalID), startDay: today,
                                              text: "You called out \(rivalName) with proof: \(receipt.note)", truth: true,
                                              receipts: true, heat: 50, peak: 50, reason: "Your proof is spreading.", refund: 0))
            out = "You called out \(rivalName) with proof. Reputation +\(rep), +\(gain) followers."
        } else {
            data.social.authenticity = max(0, data.social.authenticity - Balance.playerSmearAuthenticity)
            changeRivalCredibility(rivalID, by: Balance.playerSmearCredGain)
            adjustRivalHostility(rivalID, Balance.playerCalloutHostility)
            startCallout(.smear, truth: true, receipts: true, accuser: .rival(key),
                         text: "\(rivalName) asked for your proof. You had none.", force: true)
            out = "You had no proof. \(rivalName) asked for it, and people turned on you."
        }
        postResponse(subject: "Callout · \(rivalName)", heat: receipt == nil ? Balance.calloutHeatSmear : 50)
        log(out)
        save()
        return out
    }

    /// A kid gift can come back as a good story: 15% a story, and 1 in 5 of those viral. It reuses the deal story queue.
    func kidGift(name: String, venue: String) {
        let today = data.day
        data.callouts.kidGiftDay = today
        guard Double.random(in: 0..<1) < Balance.kidGiftStory else { return }
        data.dealStories.append(DealStory(day: today + Int.random(in: Balance.storyDelay), good: true,
                                          viral: Double.random(in: 0..<1) < Balance.storyViral,
                                          text: "A parent posted the card you gave their kid at \(venue)."))
    }

    /// Good word lowers the heat of every open callout about the player. It works on a local copy.
    func coolCallouts(by amount: Double) {
        var open = data.callouts.open
        for i in open.indices where open[i].target == .player && open[i].fallFrom == nil {
            open[i].heat = max(0, open[i].heat - amount)
            open[i].reason = "Good word about you is going around."
        }
        data.callouts.open = open
    }
}

#if DEBUG
@MainActor
extension GameStore {
    /// Test tool: opens a callout with fixed values. Nil when it merged into another one.
    @discardableResult
    func testCallout(_ type: CalloutType, truth: Bool, receipts: Bool, heat: Double, accuser: CalloutAccuser = .person("Test"),
                     refund: Double = 40) -> UUID? {
        let before = data.callouts.open.count
        startCallout(type, truth: truth, receipts: receipts, heat: heat, accuser: accuser, text: "Test callout.", refund: refund)
        return data.callouts.open.count > before ? data.callouts.open.last?.id : nil
    }

    /// Test tool: ends one callout now, with its current peak.
    func testSettle(_ id: UUID) {
        guard let c = callout(id) else { return }
        data.callouts.open.removeAll { $0.id == id }
        _ = settle(c)
    }
}
#endif
