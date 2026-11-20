# Part C: Callouts, the hidden-act log, replies, the record, and the kid gift

Scope: proposals 6.1 to 6.9 of `reports/Sealed product and flipper play.md` (section "Callouts carry heat, a hidden truth, and four replies"). Part C also owns the shared hidden-act log that Parts A and B write to.

Code base: commit `503ff3c`. Every line number in this file was read from the code on 2026-11-20. `M/` = `app/PokeVendor/Model/`.

## 0. Summary of the plan

- Create one new model file, `M/Callouts.swift`. It holds the hidden-act log, the callout object, the four replies, the record, the rival callout rolls, and `calloutsEndDay()`.
- Create one new view file, `Social/CalloutViews.swift`. It holds the callout card, the callouts list, the reply sheet, the rival callout composer, and the record badge.
- Change 16 existing files. Each change extends an existing system. No change makes a second copy of a system.
- Run `xcodegen generate` in `app/` after you add the two new files.
- The report does not propose per-audience reputation. The research notes suggest it ([social_callouts.md L219](/Users/ajholloway/personal/PokeVendor/research_notes/Sealed%20product%20and%20flipper%20play/social_callouts.md)), but the approved report keeps one reputation number. Part C does not add it. Section 9 explains how a later change can add it.

### Facts about the current code that this plan uses

| Fact | Location |
|---|---|
| All saved state is in `GameData`. `init(from:)` decodes each field with a fallback, so a missing key takes its default. | `M/GameStore.swift` L4-141, L144-235 |
| End Day calls each system hook in a fixed order. | `M/GameStore.swift` L1106-1207 |
| Deal stories: a queue of `DealStory`, applied in `storiesEndDay()`. The weekly random story makes the "rival vendor" bad story at L171-176. | `M/Haggling.swift` L64-71, L167-207 |
| Story values: bad −4, viral bad −12, −1% followers, −0.1 authenticity, viral chance 0.2. | `M/Haggling.swift` L32-49, L192-200 |
| `PostType` has 8 cases. `contentQuality` switches over all of them. | `M/Social.swift` L5-17, L133-143 |
| Sponsor offers roll in `advanceSocial()` with `sponsorChance`. | `M/Social.swift` L246-256 |
| `ScamRecord` is the existing secret: 35% found, 3 to 20 days later, −30 reputation. | `M/Relationships.swift` L147-153, L370-375, L556-564 |
| `promote(...)` is the only place that makes a new contact after the seed roster. | `M/Relationships.swift` L345-353 |
| A sold fake can come out. A public post then costs 5% followers and 0.1 authenticity. | `M/Counterfeits.swift` L320-363, L107-113 |
| The kid lowball at a game shop calls `recordScam`. | `M/ShopEncounters.swift` L138-147 |
| The gambling backlash on the Rip until I hit series. | `M/Shorts.swift` L318-322 |
| `giveAway(_:)` removes an item and books what the player paid as a cost. | `M/LiveStream.swift` L459-471 |
| `VisitorType.kid` exists. A kid buyer pays at most $30. `score(...)` passes `kid:` to `scoreDeal`. | `M/Shows.swift` L535-575, L1170, L1819-1823 |
| The buyer deal buttons at a table. | `Show/ShowTableStage.swift` L179-195 |
| `notoriety` = reputation tier + follower tier. | `M/Messages.swift` L60 |
| The rival game shops are `LocalStore.castle` and `LocalStore.topDeck`. | `M/LocalStores.swift` L8; `docs/22-own-store.md` L101-118 |
| No rival entity, callout, or reply exists in code. A grep for "rival" in `Model/` finds only the story text. | grep over `app/PokeVendor` |

## 1. The hidden-act log (owned by Part C, called by Parts A and B)

### 1.1 Types

New file `M/Callouts.swift`. Put these types at the top of the file.

```swift
import Foundation

// Callouts and secrets (docs/35-callouts.md). A shady act goes into a hidden log. Each day it can come out as a
// public callout. Rivals also post callouts, and most of theirs are false. The player answers with one of four replies.

/// A shady act that the player did. Other systems add cases through `recordHiddenAct`.
enum HiddenActKind: String, Codable, CaseIterable, Hashable {
    // Part A: retail and flipping.
    case shelfBuyout        // took a whole hot shelf at the limit
    case limitEvasion       // second visit or second card to beat a purchase limit
    case botCheckout        // used the checkout bot
    case priceGouge         // listed or sold hot in-print sealed far above market
    // Part B: distribution and Rip & Ship.
    case backDoorAllocation // sold hot distributor allocation to flippers
    case plugPurchase       // bought from the gray plug
    case plugSeized         // plug stock that police seized as stolen (Part C addition, from proposal 6.2)
    case sellResealed       // sold a resealed product
    case palmedHit          // swapped a viewer's hit off camera
    case unshippedOrder     // a Rip & Ship order past its ship deadline
    // Part C and existing systems.
    case lowballKid         // told a kid their card is not worth much
    case counterfeitSold    // knowingly sold a fake

    /// The callout type that this act becomes.
    var calloutType: CalloutType {
        switch self {
        case .shelfBuyout, .limitEvasion, .botCheckout, .priceGouge, .backDoorAllocation: .greed
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

    /// The share of the weight that the act loses each day. 0 means it waits until another system retires it.
    var decay: Double {
        switch self {
        case .shelfBuyout: 0.08
        case .limitEvasion: 0.06
        case .botCheckout: 0.05
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
    /// 1.0 is a normal act. A larger act or a larger sum is heavier. The weight falls each day by `decay`.
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
    /// What "make it right" pays back. Zero means the goodwill formula.
    var refund = 0.0
    /// The thing the act is about, for example a Rip & Ship order. Other parts use it to retire the act.
    var sourceID: UUID?
}
```

### 1.2 Storage on `GameData`

In `M/GameStore.swift`, after L140 (`var shorts = ShortsState()`), add:

```swift
    /// Shady acts that can come out later, and the callouts about the player (docs/35-callouts.md).
    var hiddenActs: [HiddenAct] = []
    var callouts = CalloutState()
```

In `init(from:)`, after L233 (`shorts = v(.shorts, shorts)`), add:

```swift
        hiddenActs = v(.hiddenActs, hiddenActs)
        callouts = v(.callouts, callouts)
```

### 1.3 The store API that other parts call

Put this in `M/Callouts.swift`, in `@MainActor extension GameStore`.

```swift
    /// Adds a shady act to the hidden log. Returns its ID so that the caller can retire or expose it later.
    /// The three-argument form is the shared contract. The other arguments are optional.
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

    /// Removes an act that can no longer come out, for example a Rip & Ship order that shipped.
    func retireHiddenAct(_ id: UUID) {
        data.hiddenActs.removeAll { $0.id == id && !$0.exposed }
    }

    /// Makes an act come out in `days` days. Part B calls it when its own system finds the act.
    func exposeHiddenAct(_ id: UUID, inDays days: Int = 1) {
        guard let i = data.hiddenActs.firstIndex(where: { $0.id == id }), !data.hiddenActs[i].exposed else { return }
        let day = data.day + max(0, days)
        data.hiddenActs[i].revealDay = day
    }
```

Note on `exposeHiddenAct`: the code reads `data.day` into the local `day` before it writes into `data.hiddenActs[i]`. Keep that order.

### 1.4 Weight guidance for callers

| Act | Suggested weight | Witnesses |
|---|---|---|
| A shelf buyout | 1.0, plus 0.25 for each item over the limit | 5 at a big store |
| A checkout bot use | 0.5 | 0 |
| A back-door sale week | share of hot units sold off the shelf (0.6 to 1.5) | 0 |
| A plug order | order size ÷ $2,000, from 0.3 to 2.0 | 0 |
| A palmed hit that the camera did not catch | 1.5 | the stream peak viewers |
| An unshipped order | 1.0 | 0 |
| A kid lowball | market of the card ÷ $50, from 0.5 to 2.0 | 3 (the owner and the other players) |
| A known fake that the buyer did not find | sale price ÷ $100, from 0.5 to 2.0 | 0 |

## 2. The callout object (6.1)

### 2.1 Types

In `M/Callouts.swift`, after `HiddenAct`:

```swift
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

/// Who posted the callout.
enum CalloutAccuser: Codable, Hashable {
    /// A named rival flipper or creator from Part A (`data.rivals`), by ID.
    case rival(String)
    /// A rival game shop. It acts as a rival only after the player signs a lease.
    case gameShop(LocalStore)
    /// A person the act harmed: a kid's parent, a buyer, a viewer.
    case person(String)
    /// The player, on a callout about a rival (proposal 6.8).
    case player
}

/// Who the callout is about.
enum CalloutTarget: Codable, Hashable {
    case player
    case rival(String)
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
    /// The post, for example "Vexa Flips says your sealed stock comes from a sketchy plug."
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
    var reply: CalloutReply?
    var replyDay: Int?
    /// A scheduled fall to zero after "deny" on a false callout or "make it right": the heat on the reply day, and
    /// the day it reaches zero.
    var fallFrom: Double?
    var fallEndDay: Int?
    /// A "deny" on a true callout that the public saw through.
    var caughtLying = false
    var madeRight = false
    /// The hidden act behind a true callout.
    var actID: UUID?
    var contactID: String?
    /// What "make it right" pays. Set when the callout opens.
    var refund: Double
    /// Filled when it ends: the day, the reputation it cost, and one line for the history.
    var endedDay: Int?
    var repApplied = 0
    var outcome: String?
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
    let rivalID: String
    let day: Int
    let note: String
}

struct CalloutState: Codable, Hashable {
    var open: [Callout] = []
    /// The last 20 callouts that ended, newest last.
    var closed: [Callout] = []
    var records: [CalloutRecord] = []
    /// 0.25 to 1.0 for each rival ID. A rival who lost a callout is believed less. Default 1.0.
    var rivalCredibility: [String: Double] = [:]
    var rivalReceipts: [RivalReceipt] = []
    /// Drama that rival creators can use, from the gambling backlash. 0 to 0.5. Halves each week.
    var dramaBait = 0.0
    var lastRivalCalloutDay = -999
    /// The last day the player posted a callout about each rival, by rival ID.
    var playerCalloutDay: [String: Int] = [:]
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
        rivalCredibility = v(.rivalCredibility, [:])
        rivalReceipts = v(.rivalReceipts, [])
        dramaBait = v(.dramaBait, 0)
        lastRivalCalloutDay = v(.lastRivalCalloutDay, -999)
        playerCalloutDay = v(.playerCalloutDay, [:])
        kidGiftDay = v(.kidGiftDay, -1)
    }
}
```

The callout stores no accuser name. `GameStore.name(of:)` gives it, because a rival name lives in Part A's `data.rivals` and can change.

### 2.2 Helper reads

```swift
@MainActor
extension GameStore {
    var openCallouts: [Callout] { data.callouts.open.filter { $0.target == .player } }
    var hottestCallout: Double { openCallouts.map(\.heat).max() ?? 0 }
    var activeRecords: [CalloutRecord] { data.callouts.records.filter { $0.untilDay >= data.day } }
    /// Points that a new contact loses for the active records (proposal 6.7).
    var recordPenalty: Int { min(Balance.calloutRecordMax, activeRecords.count) * Balance.calloutRecordContactCost }

    func name(of accuser: CalloutAccuser) -> String {
        switch accuser {
        case .rival(let id): data.rivals.first { $0.id == id }?.name ?? "A rival"
        case .gameShop(let shop): shop.rawValue
        case .person(let name): name
        case .player: data.social.handle ?? "You"
        }
    }

    func credibility(_ rivalID: String) -> Double { data.callouts.rivalCredibility[rivalID] ?? 1 }
}
```

`activeRecords` and `recordPenalty` read `data.day` inside a `filter` closure. That is safe, because `filter` is not a mutating call. Never move these reads into a `removeAll` on `data.callouts`.

### 2.3 Opening a callout

```swift
    /// Opens a callout about the player. Returns the report line. Part B calls it for a palmed hit caught on camera.
    @discardableResult
    func startCallout(_ type: CalloutType, truth: Bool, receipts: Bool, heat: Double? = nil, accuser: CalloutAccuser,
                      text: String, actID: UUID? = nil, contactID: String? = nil, refund: Double = 0) -> String? {
        let today = data.day
        let open = data.callouts.open.filter { $0.target == .player }
        guard open.count < Balance.calloutMaxOpen else { return nil }
        let start = min(100, heat ?? type.startHeat)
        let pay = refund > 0 ? refund : goodwill(heat: start)
        let c = Callout(type: type, accuser: accuser, startDay: today, text: text, truth: truth, receipts: receipts,
                        heat: start, peak: start, reason: receipts ? "They posted receipts." : "It is spreading.",
                        actID: actID, contactID: contactID, refund: pay)
        data.callouts.open.append(c)
        log(text)
        return "Callout: \(text) Heat \(Int(start))."
    }

    /// The cost of "make it right" when no act sets a refund.
    func goodwill(heat: Double) -> Double {
        (min(Balance.calloutGoodwillMax, max(Balance.calloutGoodwillMin, heat * Balance.calloutGoodwillPerHeat))).rounded()
    }
```

When more than `calloutMaxOpen` callouts would be open, the new one does not open. A true callout from a hidden act then stays unexposed, and it can roll again the next day (see 3.2, the `opened` check).

## 3. True callouts from hidden acts (6.2)

### 3.1 The discovery formula

For an unexposed act with no `revealDay`, the daily chance is:

```
p = kind.discovery × weight × witnessFactor × (1 + 0.1 × notoriety) × greedFactor
witnessFactor = min(3.0, 1 + log10(1 + witnesses) / 2)
greedFactor   = (0.5 + flipperPressure) × (1 + min(1, scalperHeat / 10))   only for greed acts, else 1
p is capped at 0.5
```

After a day with no discovery, `weight *= (1 − decay)`. The act leaves the log when its weight falls under 0.05, or after 90 days. An act with `revealDay` does not roll and does not decay. It comes out on that day.

Example: a kid lowball at weight 1.0 with 3 witnesses at notoriety 2. `p ≈ 0.03 × 1.30 × 1.2 = 0.047` on day 1. The total discovery chance over the life of the act is about 45%. The old `ScamRecord` path gave 35%.

Example: a shelf buyout at weight 1.0, 5 witnesses, pressure 0.5, scalper heat 10. `p ≈ 0.02 × 1.39 × 1.0 × 2.0 = 0.056` on day 1. Total about 45%.

### 3.2 The daily step

This is the first step inside `calloutsEndDay()` (section 8).

```swift
    private func exposeHiddenActs() -> [String] {
        // Read every value into a local first. The loop below writes only the local copy (the exclusivity trap).
        let today = data.day
        let notor = Double(notoriety)
        let pressure = data.flipperPressure        // Part A
        let heat = data.scalperHeat                // Part A
        var acts = data.hiddenActs
        var exposed: [HiddenAct] = []
        for i in acts.indices where !acts[i].exposed {
            let a = acts[i]
            let due: Bool
            if let r = a.revealDay {
                due = r <= today
            } else if a.day == today {
                due = false                         // an act never comes out on the day it happened
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
            guard let line = openCallout(from: a) else { continue }   // no room: the act stays hidden and rolls again
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

    /// The victim posts most callouts. A rival breaks the story 1 time in 3, when rivals exist.
    private func openCallout(from a: HiddenAct) -> String? {
        let rivals = data.rivals                   // Part A
        let accuser: CalloutAccuser
        if let r = rivals.randomElement(), Double.random(in: 0..<1) < Balance.rivalBreaksStory {
            accuser = .rival(r.id)
        } else {
            accuser = .person(victimName(a))
        }
        let who = name(of: accuser)
        let text = a.kind.calloutText.replacingOccurrences(of: "{who}", with: who)
        let start = a.kind.calloutType.startHeat * min(1.5, max(0.75, a.weight))
        return startCallout(a.kind.calloutType, truth: true, receipts: Double.random(in: 0..<1) < a.kind.receipts,
                            heat: start, accuser: accuser, text: text, actID: a.id, contactID: a.contactID,
                            refund: a.refund)
    }

    private func victimName(_ a: HiddenAct) -> String {
        switch a.kind {
        case .lowballKid: "A parent"
        case .palmedHit, .unshippedOrder: "A stream buyer"
        case .sellResealed, .counterfeitSold: "A buyer"
        case .shelfBuyout, .limitEvasion: "A shopper"
        default: "A collector"
        }
    }
```

Exclusivity notes for this step:

- `pressure`, `heat`, `notor`, and `today` are locals. The loop changes only the local `acts`.
- `removeAll` reads only `today`, `keep`, `maxDays`, and `minWeight`, which are locals. Do not write `data.day` or `Balance.x` inside it. `Balance` is a static type, so it is safe, but locals keep the rule simple to check.
- `openCallout(from:)` mutates `data.callouts`. It runs in a plain `for` loop, not inside a closure on `data.hiddenActs`.

### 3.3 Existing secrets that move into the log

| Source | Change | Why |
|---|---|---|
| `lowballKid(_:)` at `M/ShopEncounters.swift` L138-147 | Replace `recordScam(...)` (L145) with `recordHiddenAct(.lowballKid, weight: e.market / 50, note: "\(print.name) at \(e.shop.rawValue)", witnesses: 3, contactID: shopContactID(e.shop), refund: ShowSession.round(e.market * (Balance.kidFairShare - Balance.kidLowballShare)))` | The kid lowball becomes a public kids callout. The refund pays the kid the gap to a fair price. One act now has one path. |
| `recordScam(...)` at `M/Relationships.swift` L370-375 for adults | No change. | A lie to an adult naive seller stays a private find-out. It is not one of the five public kinds. |
| `recordBadSale(...)` at `M/Counterfeits.swift` L320-327 | When `known` is true and the find-out roll fails (the `guard` at L324), call `recordHiddenAct(.counterfeitSold, weight: price / 100, note: "\(item) on \(channel)", contactID: contactID, refund: price)` before the `return`. | A known fake that the buyer did not catch can still come out through a third party. |
| Public post branch at `M/Counterfeits.swift` L347-356 | Replace the inline follower and authenticity loss with `if let line = startCallout(.productIntegrity, truth: true, receipts: true, heat: sale.known ? 75 : 60, accuser: .person("The buyer"), text: "The buyer of your \(sale.item) posted that it was a fake.", contactID: sale.contactID, refund: sale.refunds ? 0 : sale.price) { lines.append(line) }`. Keep the refund, the −40 reputation, and the contact costs at L337-346. | The public post becomes a callout with a reply. An honest seller of an unknown fake can pick "make it right" and end it. The followers loss moves to the fade cost. |

Tuning note for AJ: the fake public post cost 5% followers at once. As a callout it costs 1% at fade when the peak is 70 or more. The report maps every callout to the story values (6.6), so this plan follows the report. A known fake starts at heat 75, so its fade always uses the viral values unless the player makes it right.

For a refund of 0 on a platform sale that already refunded: `startCallout` uses the goodwill formula for "make it right". That pays an apology credit. It does not refund the sale twice.

## 4. False callouts from named rivals (6.3)

### 4.1 The weekly rival roll

Runs inside `calloutsEndDay()` when `data.day % 7 == 0`.

```swift
    private func rivalCalloutsWeekly() -> [String] {
        let today = data.day
        guard today % 7 == 0 else { return [] }
        // Locals first (the exclusivity trap).
        var state = data.callouts
        state.dramaBait *= 0.5
        for (id, c) in state.rivalCredibility { state.rivalCredibility[id] = min(1, c + Balance.rivalCredWeekly) }
        let receiptDays = Balance.rivalReceiptDays
        state.rivalReceipts.removeAll { today - $0.day > receiptDays }
        data.callouts = state
        guard reputationTier >= 1 || (hasAccount && followerTier >= 1) else { return [] }   // nobody talks about an unknown
        var lines: [String] = []
        for r in rivalPool() {
            let open = data.callouts.open
            guard open.filter({ $0.target == .player }).count < Balance.calloutMaxOpen,
                  !open.contains(where: { $0.accuser == r.accuser }) else { continue }
            var p = (Balance.rivalCalloutBase + Balance.rivalCalloutHostility * r.hostility) * r.credibility
            if r.creator { p += data.callouts.dramaBait }
            if today - data.callouts.lastRivalCalloutDay < Balance.rivalCalloutGap { p *= Balance.rivalCalloutGapFactor }
            guard Double.random(in: 0..<1) < p, let line = rivalCallout(r) else { continue }
            lines.append(line)
        }
        return lines
    }

    func rivalPool() -> [RivalView] {
        var out = data.rivals.map { r in      // Part A
            RivalView(accuser: .rival(r.id), id: r.id, hostility: r.hostility, credibility: credibility(r.id), creator: r.kind == .creator)
        }
        if data.cardStore != nil {
            for shop in LocalStore.allCases where shop.isGameShop {
                let pts = Double(self.shop(shop).points)
                let id = "shop:\(shop.rawValue)"
                out.append(RivalView(accuser: .gameShop(shop), id: id,
                                     hostility: Balance.shopRivalHostilityBase + Balance.shopRivalHostilityRange * (1 - pts / 100),
                                     credibility: credibility(id), creator: false))
            }
        }
        return out
    }
```

Declare `RivalView` at file scope in `M/Callouts.swift`, next to `CalloutState`:

```swift
/// One rival, as the callout system sees it: a Part A rival, or a rival game shop after a lease.
struct RivalView {
    let accuser: CalloutAccuser
    let id: String
    let hostility: Double
    let credibility: Double
    let creator: Bool
}
```

Make `rivalPool()` internal (not `private`), because `randomRivalStory()` in 4.3 and `RivalCalloutBox` in 10.1 call it.

### 4.2 One rival callout: true or false

A rival callout is false at least 60% of the time. It can be true only when the player has an unexposed act that fits the rival.

```swift
    /// A rival posts. 4 times in 10 it uses a real hidden act that fits the rival. Otherwise the claim is false.
    @discardableResult
    func rivalCallout(_ r: RivalView) -> String? {
        let fits: Set<CalloutType> = r.creator ? [.fairness, .productIntegrity, .kids, .greed]
                                               : [.greed, .forbidden, .productIntegrity]
        let acts = data.hiddenActs.filter { !$0.exposed && fits.contains($0.kind.calloutType) }   // a read, not a mutation
        let who = name(of: r.accuser)
        let line: String?
        if let act = acts.randomElement(), Double.random(in: 0..<1) < Balance.rivalCalloutTruth {
            let text = act.kind.calloutText.replacingOccurrences(of: "{who}", with: who)
            line = startCallout(act.kind.calloutType, truth: true,
                                receipts: Double.random(in: 0..<1) < act.kind.receipts * 0.5,
                                heat: act.kind.calloutType.startHeat * r.credibility, accuser: r.accuser, text: text,
                                actID: act.id, contactID: act.contactID, refund: act.refund)
            if line != nil, let i = data.hiddenActs.firstIndex(where: { $0.id == act.id }) { data.hiddenActs[i].exposed = true }
        } else {
            let type = falseType(r)
            let scale = r.credibility * (hasAccount ? 1 : Balance.calloutNoAccountHeat)
            line = startCallout(type, truth: false, receipts: false, heat: type.startHeat * scale, accuser: r.accuser,
                                text: falseText(type, who: who, shop: r.accuser))
        }
        if line != nil { data.callouts.lastRivalCalloutDay = data.day }
        return line
    }

    private func falseType(_ r: RivalView) -> CalloutType {
        if case .gameShop = r.accuser { return Bool.random() ? .greed : .productIntegrity }
        return r.creator ? ShowSession.weighted([(.fairness, 0.5), (.greed, 0.35), (.kids, 0.15)]) ?? .greed
                         : ShowSession.weighted([(.greed, 0.7), (.productIntegrity, 0.3)]) ?? .greed
    }

    private func falseText(_ type: CalloutType, who: String, shop: CalloutAccuser) -> String {
        switch type {
        case .greed: "\(who) is telling people that your prices are inflated and that you scalp."
        case .productIntegrity: "\(who) hints that your sealed product is resealed."
        case .fairness: "\(who) says your rip videos are staged."
        case .kids: "\(who) says you rip off kids at shows."
        case .forbidden: "\(who) says your stock fell off a truck."
        case .smear: "\(who) says you start drama for views."
        }
    }
```

`ShowSession.weighted` exists at `M/Shows.swift` L1355. It is `static`, so the store can call it.

### 4.3 Extend the existing random story (do not duplicate it)

In `storiesEndDay()` at `M/Haggling.swift` L171-176, the weekly random story keeps its 3% roll. Change only the bad branch:

```swift
        if today % 7 == 0, Double.random(in: 0..<1) < Balance.storyRandomWeekly {
            if reputationTier >= 2 && Bool.random() {
                if let line = randomRivalStory() { lines.append(line) }   // the "rival vendor" story is now a named rival's callout
            } else {
                due.append(DealStory(day: today, good: true, viral: false, text: "A regular vouched for you in a local Discord."))
            }
        }
```

In `M/Callouts.swift`:

```swift
    /// The bad branch of the weekly random story (docs/30): a callout from one named rival, or nothing.
    func randomRivalStory() -> String? {
        guard let r = rivalPool().randomElement() else { return nil }
        return rivalCallout(r)
    }
```

When no rival exists yet (Part A not built, or an empty pool), the bad branch makes nothing. The old −3 story text goes away. `Balance.storyRandomRep` stays for the good story. The `random` test at `M/Haggling.swift` L179 still works, because the good random story is still appended to `due` and is not in `data.dealStories`.

### 4.4 Rival creators and the gambling backlash

In `postRipEpisode` at `M/Shorts.swift` L319-322, after the authenticity line, add:

```swift
            data.callouts.dramaBait = min(Balance.dramaBaitMax, data.callouts.dramaBait + Balance.dramaBaitGambling)
```

The value adds to the weekly chance for each rival creator (4.1). The value halves each week. So a long dry series draws a "your rip videos are staged" callout from a rival creator. Pack battles stay out of scope (`docs/32` L299).

## 5. Heat, decay, and the end of a callout (6.4, 6.6)

### 5.1 The daily heat step

```swift
    private func advanceCallouts() -> [String] {
        let today = data.day
        let hostility = Dictionary(data.rivals.map { ($0.id, $0.hostility) }, uniquingKeysWith: { a, _ in a })  // Part A
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
            // The accuser answers a deny or a counter the next day.
            if let reply = c.reply, reply == .deny || reply == .counter, c.replyDay == today - 1, c.fallFrom == nil,
               case .rival(let id) = c.accuser, Double.random(in: 0..<1) < (hostility[id] ?? 0.5) {
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
        data.callouts.open = open                        // write back once, then apply effects
        var lines: [String] = []
        for c in ended { lines.append(settle(c)) }
        return lines
    }
```

Exclusivity notes:

- `hostility` is a local dictionary from Part A's `data.rivals`. The loop does not read `data` at all.
- `open.removeAll` reads only the local `endedIDs`.
- `settle(_:)` changes reputation, followers, contacts, and the record. It runs after `data.callouts.open` is written, never inside the loop or a closure.

### 5.2 Settle: the end of a callout

```swift
    /// The end of a callout about the player. Maps the peak heat to the story costs (proposal 6.6), then the record
    /// (6.7) and the Whatnot ban (6.6). Returns the report line.
    private func settle(_ callout: Callout) -> String {
        let c = callout
        let today = data.day
        guard c.target == .player else { return close(c, rep: 0, line: nil) }
        // A false callout that the player beat, or paid off, costs nothing at the end.
        let free = !c.truth && (c.madeRight || (c.reply == .deny))
        var rep = 0
        var line = "The callout from \(name(of: c.accuser)) faded."
        if !free {
            if c.peak >= Balance.calloutViralPeak {
                rep = Balance.storyBadViralRep
                if hasAccount, !c.madeRight {
                    let loss = Int(Double(data.social.followers) * Balance.storyBadViralFollowerShare)
                    data.social.followers = max(0, data.social.followers - loss)
                    data.social.authenticity = max(0, data.social.authenticity - Balance.calloutViralAuthenticity)
                    line += " You lost \(loss) followers."
                }
            } else if c.peak >= Balance.calloutBadPeak {
                rep = Balance.storyBadRep
            }
            if c.madeRight { rep = (rep + 1) / 2 }
        }
        if rep > 0 { addReputation(-rep); line += " Reputation −\(rep)." }
        if c.truth {
            if let id = c.contactID { addPoints(id, -Balance.calloutContactCost) }
            if c.peak >= Balance.calloutRecordPeak, !c.madeRight {
                data.callouts.records.append(CalloutRecord(day: today, untilDay: today + Balance.calloutRecordDays,
                                                           type: c.type, text: c.text))
                line += " A busted thread about you stays up for \(Balance.calloutRecordDays) days."
            }
            if c.type == .productIntegrity, c.peak >= Balance.calloutBanPeak {
                let days = Int.random(in: Balance.calloutBanDays)
                banFromWhatnot(days: days, reason: "a product integrity callout")   // Part B
                line += " Whatnot banned you from streams for \(days / 7) weeks."
            }
        }
        return close(c, rep: rep, line: line)
    }

    private func close(_ callout: Callout, rep: Int, line: String?) -> String {
        var c = callout
        c.endedDay = data.day
        c.repApplied = rep
        c.outcome = line
        var closed = data.callouts.closed
        closed.append(c)
        data.callouts.closed = Array(closed.suffix(20))
        if let line { log(line) }
        return line ?? ""
    }
```

Filter empty lines out before you add them to the report.

Rules this function keeps:

- A false callout left silent still costs reputation at fade. The public does not know the truth. This is why "deny" exists.
- A false callout ended by "deny" or "make it right" costs nothing at fade.
- A true callout ended by "make it right" costs half the reputation, no followers, no authenticity, and no record.
- Callouts never change a price. No code path in this file reads or writes a graded price, a market price, or `priceBoosts`.

## 6. The response post: four replies (6.5)

### 6.1 The new post type

In `M/Social.swift` L5-17, add a case to `PostType`:

```swift
    /// A reply to a callout (docs/35-callouts.md). It posts from the reply sheet, not from the new post sheet.
    case response = "Response"
```

In `contentQuality` at L133-143, extend the last case: `case .stream, .short, .response: 1.0`. No other switch over `PostType` exists in the code (grep). The new post sheet lists its types by hand at `Social/SocialViews.swift` L284, so "Response" does not show there.

### 6.2 The reply function

```swift
    /// What each reply needs. Deny and counter need an account. Counter needs a rival or a shop as the accuser.
    func replyBlock(_ c: Callout, _ reply: CalloutReply) -> String? {
        if c.fallFrom != nil { return "This callout is already ending." }
        switch reply {
        case .silent: return nil
        case .deny:
            if !hasAccount { return "You need a social account to post a reply." }
            if c.reply == .deny || c.caughtLying { return "You already denied it." }
            return nil
        case .makeRight:
            return canAfford(c.refund) ? nil : "You need \(money(c.refund))."
        case .counter:
            if !hasAccount { return "You need a social account to post a reply." }
            if case .person = c.accuser { return "You can only counter a rival." }
            if c.reply == .counter { return "You already posted a counter-callout." }
            return nil
        }
    }

    /// The player answers a callout. Returns one line for the sheet.
    @discardableResult
    func replyToCallout(_ id: UUID, _ reply: CalloutReply) -> String {
        guard let i = data.callouts.open.firstIndex(where: { $0.id == id }) else { return "" }
        var c = data.callouts.open[i]
        if let block = replyBlock(c, reply) { return block }
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
                c.fallFrom = c.heat
                c.fallEndDay = today + Balance.calloutDenyFalseDays
                c.reason = "You showed it was false."
                addReputation(Balance.calloutDenyFalseRep)
                if case .rival(let rid) = c.accuser { loseCredibility(rid, Balance.rivalCredDenied, receipt: "\(who) lied about you on day \(today + 1).") }
                if case .gameShop(let shop) = c.accuser { loseCredibility("shop:\(shop.rawValue)", Balance.rivalCredDenied, receipt: nil) }
                out = "You showed the claim was false. Reputation +\(Balance.calloutDenyFalseRep). It ends in \(Balance.calloutDenyFalseDays) days."
            }
        case .makeRight:
            addLedger(-c.refund, .refund, "Made it right · \(c.type.label)")
            c.madeRight = true
            c.fallFrom = c.heat
            c.fallEndDay = today + Balance.calloutMakeRightDays
            c.reason = "You made it right."
            out = "You paid \(money(c.refund)) to make it right. It ends tomorrow."
        case .counter:
            c.heat = min(100, c.heat + Balance.calloutCounterHeat)
            c.reason = "You hit back. Everyone is watching."
            let gain = Int(Double(data.social.followers) * Balance.calloutCounterFollowerShare)
            data.social.followers += gain
            data.social.authenticity = max(0, data.social.authenticity - Balance.calloutCounterAuthenticity)
            let hit = c.truth ? Balance.calloutCounterCredTrue : Balance.calloutCounterCredFalse
            switch c.accuser {
            case .rival(let rid):
                loseCredibility(rid, hit, receipt: nil)
                adjustRivalHostility(rid, Balance.playerCalloutHostility)            // Part A
            case .gameShop(let shop):
                loseCredibility("shop:\(shop.rawValue)", hit, receipt: nil)
                addPoints(shopContactID(shop), -Balance.calloutCounterShopCost)
            default: break
            }
            out = "You posted a counter-callout. +\(gain) followers. The heat went up on both sides."
        }
        c.peak = max(c.peak, c.heat)
        c.reply = reply == .silent ? c.reply : reply
        c.replyDay = today
        data.callouts.open[i] = c
        if reply == .deny || reply == .counter || (reply == .makeRight && hasAccount) { postResponse(c, reply) }
        log(out)
        save()
        return out
    }

    private func loseCredibility(_ rivalID: String, _ amount: Double, receipt: String?) {
        let now = credibility(rivalID)
        data.callouts.rivalCredibility[rivalID] = max(Balance.rivalCredFloor, now - amount)
        if let receipt { data.callouts.rivalReceipts.append(RivalReceipt(rivalID: rivalID, day: data.day, note: receipt)) }
    }
```

Exclusivity notes:

- `replyToCallout` copies the callout into the local `c`, changes it, and writes it back once at the end. `addReputation`, `addLedger`, and `data.social` writes happen between, but never inside a closure on `data.callouts`.
- `loseCredibility` reads `credibility(rivalID)` into `now` before it writes the dictionary entry.

### 6.3 The response post record

```swift
    /// The reply shows in the post list. It does not use the follower gain of a quick post.
    private func postResponse(_ c: Callout, _ reply: CalloutReply) {
        let followers = data.social.followers
        let views = max(1, Int(Double(followers) * 0.2 * max(0.3, c.heat / 50)))
        let subject = "\(reply.label) · \(name(of: c.accuser))"
        let post = SocialPost(day: data.day, type: .response, subject: subject, views: views, followerChange: 0,
                              likes: Int(Double(views) * 0.05), quality: 1, timing: 1, luck: 1)
        data.social.posts.append(post)
        data.social.burnout = min(1, data.social.burnout + Balance.responseBurnout)
        data.social.lastPostDay = data.day
    }
```

`followers` is read into a local before the post is built. The counter-callout follower gain is applied in `replyToCallout`, not here, so the post shows `followerChange: 0`. To show the gain on the post, pass it in. That is optional.

### 6.4 The reply table as built

| Reply | True callout | False callout | Needs |
|---|---|---|---|
| Stay silent | Heat −15% each day. Fade cost by peak. | Same. Fade cost by peak. | Nothing |
| Deny | Heat ×1.5. Find-out roll: 50% with receipts, 20% without. A find-out: −8 reputation, receipts become visible. Fade cost by peak. | Heat falls to 0 in 2 days. +3 reputation now. Rival credibility −0.25. The player gets a receipt against that rival. No fade cost. | Account |
| Make it right | Pay the refund. Heat falls to 0 in 1 day. Fade cost halved. No follower loss. No record. | Pay the refund. Heat falls to 0 in 1 day. No fade cost. | Cash |
| Counter-callout | Heat +30. +2% followers. Authenticity −0.05. Rival credibility −0.1, hostility +0.2. | Same, but rival credibility −0.3. | Account, and a rival or shop accuser |

## 7. Player callouts, the kid gift, and the record

### 7.1 The player calls out a rival (6.8)

```swift
    /// The player posts a callout about a rival. With a receipt it is true. Without one, the heat lands on the player.
    func playerCalloutBlock(_ rivalID: String) -> String? {
        guard hasAccount else { return "You need a social account to post a callout." }
        if let last = data.callouts.playerCalloutDay[rivalID], data.day - last < Balance.playerCalloutCooldown {
            return "You called them out on day \(last + 1). Wait \(Balance.playerCalloutCooldown) days."
        }
        return nil
    }

    @discardableResult
    func calloutRival(_ rivalID: String) -> String {
        if let block = playerCalloutBlock(rivalID) { return block }
        let today = data.day
        let rivalName = data.rivals.first { $0.id == rivalID }?.name ?? "the rival"
        data.callouts.playerCalloutDay[rivalID] = today
        let receipt = data.callouts.rivalReceipts.first { $0.rivalID == rivalID }
        let out: String
        if let receipt {
            data.callouts.rivalReceipts.removeAll { $0.id == receipt.id }
            addReputation(Balance.playerCalloutRep)
            let gain = max(Balance.playerCalloutFollowerMin, Int(Double(data.social.followers) * Balance.playerCalloutFollowerShare))
            data.social.followers += gain
            loseCredibility(rivalID, Balance.playerCalloutCred, receipt: nil)
            adjustRivalHostility(rivalID, Balance.playerCalloutHostility)            // Part A
            let c = Callout(type: .smear, accuser: .player, target: .rival(rivalID), startDay: today,
                            text: "You called out \(rivalName) with proof: \(receipt.note)", truth: true, receipts: true,
                            heat: 50, peak: 50, reason: "Your proof is spreading.", refund: 0)
            data.callouts.open.append(c)
            out = "You called out \(rivalName) with proof. Reputation +\(Balance.playerCalloutRep), +\(gain) followers."
        } else {
            data.social.authenticity = max(0, data.social.authenticity - Balance.playerSmearAuthenticity)
            let now = credibility(rivalID)
            data.callouts.rivalCredibility[rivalID] = min(1, now + 0.1)
            _ = startCallout(.smear, truth: true, receipts: true, accuser: .rival(rivalID),
                             text: "\(rivalName) asked for your proof. You had none.")
            out = "You had no proof. People turned on you."
        }
        postResponse(Callout(type: .smear, accuser: .player, startDay: today, text: out, truth: true, receipts: false,
                             heat: 40, peak: 40, reason: "", refund: 0), .counter)
        log(out)
        save()
        return out
    }

    /// Part A calls this when a rival does something the player can prove, for example a bot haul seen on a store run.
    func noteRivalReceipt(_ rivalID: String, note: String) {
        let today = data.day
        data.callouts.rivalReceipts.append(RivalReceipt(rivalID: rivalID, day: today, note: note))
    }
```

A callout with `target: .rival` decays like any other callout in `advanceCallouts`. `settle` returns early for it (no cost). It shows in the list so that the player sees the result.

The baseless callout uses type `.smear`, truth true, receipts true. "Deny" on it takes the true branch, so it backfires. "Make it right" pays the goodwill amount and ends it. That keeps the callout winnable.

### 7.2 The kid gift (6.9)

In `M/LiveStream.swift` L459-471, add a place argument to `giveAway` so that the log line fits a table:

```swift
    func giveAway(_ id: UUID, at place: String = "on stream") {
        ...
            log("Gave away \(card.print.name) \(place).")
        ...
            log("Gave away \(item.name) \(place).")
    }
```

Both existing call sites keep working with the default.

In `M/Shows.swift`, in `ShowSession`, near `decline()` (L1894), add:

```swift
    /// The player gives a kid the card they wanted, for free (docs/35-callouts.md, The kid gift). Once a day.
    var canGiveToKid: Bool {
        guard let v = current, v.type == .kid, v.intent == .buy, let item = v.item, v.extra == nil else { return false }
        return item.market <= Balance.kidGiftMaxValue && !item.showcase && store.data.callouts.kidGiftDay != store.day
    }

    func giveToKid() {
        guard canGiveToKid, let v = current, let item = v.item else { return }
        store.giveAway(item.id, at: "to a kid at \(venue.name)")
        table.removeAll { $0.id == item.id }
        store.kidGift(name: v.name, venue: venue.name)
        note = "The kid could not believe it. The parent took a photo."
        finish(minutes: .random(in: 3...6))
        Haptics.hit()
    }
```

In `M/Callouts.swift`:

```swift
    /// A kid gift can come back as a good story: 25% a story, and 1 in 5 of those viral (5% in all). It reuses the
    /// deal story queue and its values.
    func kidGift(name: String, venue: String) {
        let today = data.day
        data.callouts.kidGiftDay = today
        guard Double.random(in: 0..<1) < Balance.kidGiftStory else { return }
        data.dealStories.append(DealStory(day: today + Int.random(in: Balance.storyDelay), good: true,
                                          viral: Double.random(in: 0..<1) < Balance.storyViral,
                                          text: "A parent posted the card you gave their kid at \(venue)."))
    }
```

The story pays the existing values: good +3 reputation and +20 followers, viral +10 and +2% followers. These match proposal 6.9. The gift is free in cash. `giveAway` books what the player paid as a cost through `openedPaid`, which is the same rule as a stream giveaway.

### 7.3 Good stories cool open callouts

In `storiesEndDay()` at `M/Haggling.swift` L177-204, keep a local `var cool = 0.0`. Inside the `story.good` branch, add `cool += story.viral ? Balance.viralGoodStoryHeatCut : Balance.goodStoryHeatCut`. After L205 (`data.dealStories.removeAll`), add:

```swift
        if cool > 0 { coolCallouts(by: cool) }
```

In `M/Callouts.swift`:

```swift
    /// Good word lowers the heat of every open callout about the player.
    func coolCallouts(by amount: Double) {
        var open = data.callouts.open
        for i in open.indices where open[i].target == .player && open[i].fallFrom == nil {
            open[i].heat = max(0, open[i].heat - amount)
            open[i].reason = "Good word about you is going around."
        }
        data.callouts.open = open
    }
```

The cooling happens after the story loop, on a local copy. It does not happen inside the `removeAll` closure.

### 7.4 The record on new contacts (6.7)

In `promote(...)` at `M/Relationships.swift` L345-353, change the append:

```swift
        let start = max(0, points - recordPenalty)      // read before the append (the exclusivity trap)
        data.contacts.append(Contact(id: id, name: name, kind: kind, points: start, interests: interest.map { [$0] } ?? [],
                                     atLocalShows: true, atRegionalShows: true))
```

Each active record lowers the start by 5 points, with at most 3 records (−15). A record lasts 90 days. `seedContacts` starts every contact at 0, so the record has no effect there.

### 7.5 Sponsors pull back during a hot callout

In `advanceSocial()` at `M/Social.swift` L246-249, read the heat into a local before `var s = data.social` (L227), then block new offers:

```swift
        let hot = hottestCallout                         // read first
        ...
        if tier >= 1, s.offers.count < 3, hot < Balance.calloutSponsorBlockHeat, Double.random(in: 0..<1) < sponsorChance {
```

Accepted deals stay. This is a small, visible link to docs/06 sponsors. Mark it a design value.

## 8. End Day hook and order

### 8.1 The hook

```swift
    /// End Day: hidden acts that come out, the weekly rival roll, then heat, replies, and the end of callouts.
    func calloutsEndDay() -> [String] {
        var lines: [String] = []
        lines += exposeHiddenActs()
        lines += rivalCalloutsWeekly()
        lines += advanceCallouts()
        return lines.filter { !$0.isEmpty }
    }
```

### 8.2 Where it runs

In `M/GameStore.swift` `endDay()`, add one line after L1167 (`lines += vendingEndDay()`):

```swift
        lines += calloutsEndDay()
```

Why this place:

| Step before it | Reason |
|---|---|
| `storiesEndDay()` (L1154) | Good stories cool heat first. The random rival story can open a callout first. |
| `counterfeitsEndDay()` (L1158) | A public fake post opens its callout first. That callout skips decay tonight because `startDay == today`. |
| `streamsEndDay()` (L1161) and Part B's Rip & Ship step | Part B records `unshippedOrder` acts and retires shipped ones before the roll. Part B must put its ship step before L1167. |
| `data.day += 1` (L1131) | All steps use the new day. A hidden act recorded during the day has `day` = the old day, so `a.day == today` is false and it can roll on its first night. If AJ wants one quiet night, compare `a.day >= today - 1`. |

The rent and game-over steps run after it. A callout cost never ends a run, because it moves only reputation, followers, and relationship points. "Make it right" moves cash, but only when the player taps it, and `replyBlock` checks `canAfford`.

### 8.3 The exclusivity checklist

`GameStore.data` is `@Observable`. A closure passed to a mutating call on `data.x` must never read `data.y`. Each place where this plan touches that rule:

| Place | Rule |
|---|---|
| `exposeHiddenActs` loop | Works on the local `acts`. `pressure`, `heat`, `notor`, `today` are locals. |
| `exposeHiddenActs` `removeAll` | Reads only locals `today`, `keep`, `maxDays`, `minWeight`. |
| `advanceCallouts` | Works on the local `open`. Part A hostility is a local dictionary. `removeAll` reads the local `endedIDs`. `settle` runs after the write-back. |
| `rivalCalloutsWeekly` | Copies `data.callouts` into `state`. `state.rivalReceipts.removeAll` reads the local `receiptDays` and `today`. It writes `data.callouts = state` before any rival roll. |
| `rivalCallout` | `data.hiddenActs.filter` is a read. The write to `data.hiddenActs[i].exposed` happens after `startCallout`, not in a closure. |
| `replyToCallout` | Local copy `c`, one write at the end. |
| `loseCredibility`, `calloutRival` | Read `credibility(id)` into `now` before the dictionary write. |
| `coolCallouts` | Local copy, one write. |
| `promote` | `recordPenalty` reads `data.callouts` and `data.day`. Read it into `start` before `data.contacts.append`. |
| `advanceSocial` | Read `hottestCallout` into `hot` before the sponsor roll. |
| `retireHiddenAct` | `removeAll` reads only `id`, a parameter. |
| Callers in Parts A and B | Never call `recordHiddenAct`, `startCallout`, or `noteRivalReceipt` inside a closure that you pass to `data.sealed.removeAll`, `data.rivals.indices.forEach`, or any other mutating call on `data`. Collect the facts into locals, then call. |

## 9. Constants

All constants go in one `extension Balance` block at the top of `M/Callouts.swift`, the same as every other system file (for example `M/Haggling.swift` L6-50). The per-kind values of `HiddenActKind` (discovery, decay, receipts) stay as `switch` properties on the enum, the same as `VisitorType.flipWillingness` at `M/Shows.swift` L555-569.

| Constant | Value | Meaning |
|---|---|---|
| `calloutHeatKids` | 70 | Start heat, treatment of kids |
| `calloutHeatIntegrity` | 60 | Start heat, product integrity |
| `calloutHeatFairness` | 60 | Start heat, fair openings |
| `calloutHeatGreed` | 40 | Start heat, greed |
| `calloutHeatForbidden` | 50 | Start heat, forbidden product |
| `calloutHeatSmear` | 40 | Start heat, a baseless player callout (Part C addition) |
| `calloutDecay` | 0.15 | Heat lost each day with no reply schedule |
| `calloutReplyHeat` | 20 | Heat from each reply by the accuser |
| `calloutEndHeat` | 5 | Under this heat, the callout ends |
| `calloutMaxDays` | 45 | A callout ends after this many days in all cases |
| `calloutMaxOpen` | 3 | Open callouts about the player at one time |
| `calloutDenyTrueFactor` | 1.5 | Heat factor for a deny of a true callout |
| `calloutDenyFindOutReceipts` | 0.5 | Find-out chance on a deny, with receipts |
| `calloutDenyFindOutPlain` | 0.2 | Find-out chance on a deny, without receipts (design value) |
| `calloutDenyCaughtRep` | 8 | Reputation lost when a deny falls apart |
| `calloutDenyFalseRep` | 3 | Reputation gained for a deny of a false callout |
| `calloutDenyFalseDays` | 2 | Days for a denied false callout to reach 0 |
| `calloutMakeRightDays` | 1 | Days for a made-right callout to reach 0 |
| `calloutGoodwillPerHeat` | 2.0 | Dollars per heat point when no act sets a refund |
| `calloutGoodwillMin` | 25.0 | Lowest goodwill payment |
| `calloutGoodwillMax` | 250.0 | Highest goodwill payment |
| `calloutCounterHeat` | 30 | Heat added by a counter-callout |
| `calloutCounterFollowerShare` | 0.02 | Followers gained by a counter-callout |
| `calloutCounterAuthenticity` | 0.05 | Authenticity lost by a counter-callout |
| `calloutCounterCredTrue` | 0.1 | Rival credibility lost, counter on a true callout |
| `calloutCounterCredFalse` | 0.3 | Rival credibility lost, counter on a false callout |
| `calloutCounterShopCost` | 10 | Shop standing lost when the player counters a game shop |
| `calloutViralPeak` | 70 | Peak heat for the viral bad story cost |
| `calloutBadPeak` | 30 | Peak heat for the bad story cost |
| `calloutViralAuthenticity` | 0.1 | Authenticity lost at a viral fade |
| (reused) `storyBadViralRep`, `storyBadRep`, `storyBadViralFollowerShare` | 12, 4, 0.01 | From `M/Haggling.swift` L42-47 |
| `calloutContactCost` | 15 | Points lost with the harmed contact on a true callout |
| `calloutRecordPeak` | 50 | Peak heat of a true callout that leaves a record |
| `calloutRecordDays` | 90 | Days a record lasts |
| `calloutRecordContactCost` | 5 | Start points lost by each new contact for each record |
| `calloutRecordMax` | 3 | Records that count at one time |
| `calloutBanPeak` | 80 | Peak heat of a true integrity callout that bans Whatnot |
| `calloutBanDays` | 28...56 | Whatnot ban length |
| `calloutReceiptsDaily` | 0.15 | Daily chance that receipts appear on a true callout |
| `calloutReceiptsMinHeat` | 30 | Receipts appear only at this heat or more |
| `calloutReceiptsHeat` | 10 | Heat added when receipts appear |
| `calloutNoAccountHeat` | 0.5 | Start heat factor of a false rival callout for a player with no account |
| `calloutSponsorBlockHeat` | 60 | No new sponsor offers at this heat or more |
| `responseBurnout` | 0.05 | Burnout from one response post |
| `hiddenActNotorietyStep` | 0.1 | Discovery factor for each notoriety step |
| `hiddenActDailyCap` | 0.5 | Highest daily discovery chance |
| `hiddenActMinWeight` | 0.05 | Under this weight, the act leaves the log |
| `hiddenActMaxDays` | 90 | An unexposed act leaves the log after this many days |
| `hiddenActKeepDays` | 120 | An exposed act stays in the log for history |
| `witnessCap` | 3.0 | Highest witness factor |
| `rivalBreaksStory` | 0.33 | Chance that a rival, not the victim, posts a true callout |
| `rivalCalloutBase` | 0.02 | Weekly base chance for each rival |
| `rivalCalloutHostility` | 0.06 | Weekly chance added at hostility 1.0 |
| `rivalCalloutTruth` | 0.4 | Chance a rival uses a real act when one fits |
| `rivalCalloutGap` | 14 | Days after any rival callout with a lower chance |
| `rivalCalloutGapFactor` | 0.25 | The chance factor during the gap |
| `rivalCredFloor` | 0.25 | Lowest rival credibility |
| `rivalCredWeekly` | 0.05 | Credibility a rival gets back each week |
| `rivalCredDenied` | 0.25 | Credibility lost when the player denies a false callout |
| `rivalReceiptDays` | 60 | Days a receipt against a rival lasts |
| `shopRivalHostilityBase` | 0.2 | Hostility of a rival game shop at 100 standing |
| `shopRivalHostilityRange` | 0.5 | Hostility added at 0 standing |
| `dramaBaitGambling` | 0.15 | Drama bait from one gambling backlash |
| `dramaBaitMax` | 0.5 | Highest drama bait |
| `playerCalloutRep` | 3 | Reputation for a player callout with proof |
| `playerCalloutFollowerShare` | 0.01 | Followers for a player callout with proof |
| `playerCalloutFollowerMin` | 50 | Lowest follower gain for it |
| `playerCalloutCred` | 0.3 | Rival credibility lost to a player callout with proof |
| `playerCalloutHostility` | 0.2 | Rival hostility added by a player callout or counter |
| `playerCalloutCooldown` | 14 | Days between player callouts about one rival |
| `playerSmearAuthenticity` | 0.05 | Authenticity lost for a callout with no proof |
| `kidGiftMaxValue` | 30.0 | Highest market value of a kid gift (matches the kid buyer cap at `M/Shows.swift` L1170) |
| `kidGiftStory` | 0.25 | Chance of a good story from a kid gift |
| `goodStoryHeatCut` | 10 | Heat cut on open callouts from a good story |
| `viralGoodStoryHeatCut` | 25 | Heat cut from a viral good story |

Expected rate for an honest player at mid game (3 rivals at hostility 0.3, credibility 1.0): each rival rolls about 3.8% each week. With the 14-day gap, that is one false callout about every 8 to 10 weeks, plus the random story branch (about 1 in 65 weeks at tier 2). A player who angers rivals (hostility 0.8) sees one about every 4 weeks.

## 10. UI

### 10.1 New file `Social/CalloutViews.swift`

| View | What it shows | How the player reaches it |
|---|---|---|
| `CalloutCard(callout:)` | The type icon and label. The accuser name. The post text. A heat bar (`ProgressView(value: heat, total: 100)`), tinted `Theme.green` under 30, `Theme.orange` from 30, `Theme.red` from 70. The reason line in `.caption` under the bar. A `Tag` "RECEIPTS" (orange) or "NO PROOF YET" (muted). The reply state ("You denied it · day 12"). A "Reply" button when `fallFrom == nil`. It never shows `truth`. | Inside `CalloutsSection` and `CalloutsView` |
| `CalloutsSection()` | A `DetailBox(title: "Callouts")` with each open callout about the player, then the player's own open callouts about rivals, then the last 3 closed ones with their `outcome` line. A `RecordBadge` at the top when a record is active. Empty: "Nobody is talking about you." | In `SocialHubView`, and as the body of `CalloutsView` |
| `CalloutsView()` | A `ScrollView` with `CalloutsSection()` and `RivalCalloutBox()`. Title "Callouts". Works with no account. | New route `AppRoute.callouts` from the hub banner and the reputation tile |
| `CalloutReplySheet(calloutID:)` | Four rows, one per `CalloutReply`. Each row has the label, one line of effect text, and the cost. The row is disabled with the `replyBlock` text when blocked. A result line after the tap, and a "Done" button. | `.sheet(item:)` from the "Reply" button |
| `RivalCalloutBox()` | One row per rival in `rivalPool()` (name, kind, a "Proof: n" count). A "Call out" button with `playerCalloutBlock` as the disabled reason. A `confirmationDialog` before it posts: with no proof, it says "You have no proof. The heat lands on you." | In `CalloutsView`, only with an account |
| `RecordBadge()` | A `Tag` "BUSTED THREAD · 63 DAYS" in orange, with a caption: "New contacts start 5 points lower for each record." | In `CalloutsSection` and `ContactsView` header |

Reply row text. It must not reveal the hidden truth.

| Reply | Effect text |
|---|---|
| Stay silent | "Let it fade. It loses 15% of its heat each day." |
| Deny | "Works if the claim is false. If it is true and people find proof, it gets worse." |
| Make it right | "Pay \(money(refund)). It ends tomorrow, and the damage is smaller." |
| Counter-callout | "Hit back. You gain followers, but the heat goes up on both sides." |

Animation rules: animate the heat bar with `.animation(.easeOut(duration: 0.4), value: callout.heat)`. Use `withAnimation` on the sheet result line. Do not add any full-screen overlay, white fill, bright flash, or `opacity` pulse on a light color. `Haptics.tick()` on a reply is enough feedback.

### 10.2 Changes to existing views

| File and place | Change |
|---|---|
| `App/AppNav.swift` L4-32 | Add `case callouts` to `AppRoute`. In `appDestinations()` near L93, add `case .callouts: CalloutsView()`. |
| `Hub/HubView.swift` after L158 (the messages banner) | For each open callout about the player with `reply == nil`: `Banner(text: "\(store.name(of: c.accuser)) called you out. Heat \(Int(c.heat)). Tap to answer.", color: Theme.orange, icon: "megaphone")`, tap goes to `.callouts`. Show at most one banner; when more are open, add " (\(count) open)". |
| `Hub/HubView.swift` L231-234 (reputation tile) | When `store.activeRecords` is not empty, the detail line reads "Busted thread · \(days) days". |
| `Social/SocialViews.swift` L28-29 | Insert `CalloutsSection()` before `inbox` when `!store.data.callouts.open.isEmpty || !store.activeRecords.isEmpty`. |
| `Social/SocialViews.swift` `PostRow` L181-214 | No code change. A response post shows its type "Response" and its subject. |
| `Show/ShowTableStage.swift` `DealButtons`, `.buy` case L189-195 | After `flipRow`, add: `if session.canGiveToKid { Button { withAnimation { session.giveToKid() } } label: { Text("Give it to them").frame(maxWidth: .infinity) }.buttonStyle(.bordered).tint(Theme.cyan) }` and a caption "Free. Once a day. Word can get around." |
| `Hub/ContactsView.swift` header | Add `RecordBadge()` when a record is active. |
| `Hub/HubView+Debug.swift` | Add debug buttons: "Hidden act: shelf buyout", "Rival callout", "Expose all acts", and a read-only list of `data.hiddenActs` with weights. Use `#if DEBUG`. |

## 11. Save compatibility

- `GameData.hiddenActs` and `GameData.callouts` decode through `v(...)` with defaults. An old save has neither key, so it loads with an empty log and no callouts.
- `CalloutState` has its own `init(from:)` with `decodeIfPresent` per field (2.1). A later field never wipes the state. `HiddenAct` and `Callout` use synthesized `Codable`. If a later change adds a field to them, give the field a default and add a custom `init(from:)` at that time, or the whole array falls back to empty.
- `CalloutAccuser` and `CalloutTarget` use synthesized `Codable` for enums with associated values. `LocalStore` is already `Codable` (`BadSale.shop` at `M/Counterfeits.swift` L64).
- `PostType.response` is a new raw value. Old saves have no such value, so they decode. A save made by the new build does not open in an older build. That is the same as every earlier `PostType` addition.
- `ScamRecord` stays. Kid lowballs already in `data.scams` from an old save still come out through the old path. Only new kid lowballs use the log.
- The removed `recordScam` call in `lowballKid` changes no saved type.

## 12. Tests in `Hub/GameTests.swift`

Add one group `callouts()` and register it in `run()` after `timed("market", market)` (L37): `timed("callouts", callouts)`. Extend two existing groups. Each check below covers a rule that moves money, followers, reputation, or items, or a save rule that broke before. The group runs 3 End Days, so it adds about the cost of 3 days to the run.

Add these DEBUG helpers in `M/Callouts.swift`:

```swift
    #if DEBUG
    /// Test tool: opens a callout with fixed values and returns its ID.
    @discardableResult
    func testCallout(_ type: CalloutType, truth: Bool, receipts: Bool, heat: Double, refund: Double = 40) -> UUID? {
        _ = startCallout(type, truth: truth, receipts: receipts, heat: heat, accuser: .person("Test"), text: "Test callout.",
                         refund: refund)
        return data.callouts.open.last?.id
    }

    /// Test tool: ends one callout now, with its current heat as the peak.
    func testSettle(_ id: UUID) {
        guard let c = data.callouts.open.first(where: { $0.id == id }) else { return }
        data.callouts.open.removeAll { $0.id == id }
        _ = settle(c)
    }
    #endif
```

`callouts()` checks:

```swift
    private func callouts() {
        fresh()
        // 1. Make it right moves exactly the refund, ends in one night, and halves the fade cost (6.5, 6.6).
        guard let a = store.testCallout(.kids, truth: true, receipts: true, heat: 75, refund: 40) else { return check(false, "no test callout") }
        let cash = store.cash
        store.replyToCallout(a, .makeRight)
        check(abs(cash - store.cash - 40) < 0.01, "make it right took \(money(cash - store.cash)), not $40")
        // 2. Deny on a false callout gives +3 now and costs nothing at the end (6.5).
        guard let b = store.testCallout(.greed, truth: false, receipts: false, heat: 40) else { return check(false, "no test callout") }
        let rep = store.data.reputation
        store.replyToCallout(b, .deny)
        check(store.data.reputation - rep == Balance.calloutDenyFalseRep, "a deny of a false callout gave \(store.data.reputation - rep)")
        for _ in 0..<3 { store.report = nil; store.endDay() }
        let closed = store.data.callouts.closed
        check(closed.first { $0.id == a }?.repApplied == (Balance.storyBadViralRep + 1) / 2, "a made-right true callout did not cost half")
        check(closed.first { $0.id == b }?.repApplied == 0, "a denied false callout cost reputation at the end")
        check(store.data.callouts.records.isEmpty, "a made-right callout left a record")
        // 3. A true callout at peak 50 or more leaves a record, and a new contact starts 5 points lower (6.7).
        if let c = store.testCallout(.productIntegrity, truth: true, receipts: true, heat: 55) {
            store.testSettle(c)
            check(store.activeRecords.count == 1, "a serious true callout left no record")
            let id = store.promote(name: "Record Test", kind: .collector, interest: nil, points: 20)
            check(store.contact(id)?.points == 15, "a new contact started at \(store.contact(id)?.points ?? -1) with a record, not 15")
        }
        // 4. The kid gift removes the item, takes no cash, and works once a day (6.9).
        //    Build a league night session and seat a kid buyer with `session.testSeat` (L1924).
        // 5. A forced reveal opens exactly one true callout tied to its act (6.2).
        let actID = store.recordHiddenAct(.shelfBuyout, weight: 1, note: "test", revealDay: store.day + 1)
        store.report = nil
        store.endDay()
        let tied = (store.data.callouts.open + store.data.callouts.closed).filter { $0.actID == actID }
        check(tied.count == 1 && tied[0].truth, "a forced hidden act opened \(tied.count) callouts")
        check(store.data.hiddenActs.first { $0.id == actID }?.exposed == true, "an exposed act is not marked exposed")
    }
```

`testSettle(_:)` is a DEBUG wrapper in `M/Callouts.swift` that removes one callout from `open` and calls `settle`. Check 4 is described in a comment: use `ShowSession` for `.leagueNight` from `startMeet`, put a test card under $30 on the table, call `testSeat` with a kid buyer `Visitor`, call `giveToKid()`, then check that the card left `data.raw`, that cash did not move, and that `canGiveToKid` is false for a second kid.

Extend existing groups:

| Group | Change | Rule |
|---|---|---|
| `seasonsAndSave` near L620 | After the existing decode check, add `check(loaded.hiddenActs == store.data.hiddenActs && loaded.callouts == store.data.callouts, "a save and a load lost callouts")`. Then strip the `hiddenActs` and `callouts` keys from the JSON with `JSONSerialization`, decode again, and check both are empty. | An old save must load. Saves broke before. |
| `days()` L658-722 | Before the loop, call `store.recordHiddenAct(.lowballKid, weight: 2, note: "test", witnesses: 50)` and `store.recordHiddenAct(.unshippedOrder, weight: 1, note: "test")`. After the loop, check `store.data.callouts.open.count <= Balance.calloutMaxOpen` and that no open callout has `heat < 0 || heat > 100`. | The 14-day run reaches every new End Day step with live acts. It catches an exclusivity crash ("Fatal access conflict"), which broke before. |

Do not add a soak loop. Run `-test` (about 2 seconds) after each step of the build.

## 13. Doc updates

| Doc | Change |
|---|---|
| New `docs/35-callouts.md` | The full rules: the hidden log and its kinds, discovery, the callout object, heat, the four replies and their table, rival callouts and credibility, player callouts and receipts, the record, the kid gift, the sponsor block, and a Values table copied from section 9. The number 34 is free today. If Part A or B also takes 34, the merge step renumbers. |
| `docs/06-social-media.md` L105-117 (Consequences) | Add a "Callouts" bullet: a callout has a type, heat, and a reply. A player with no account still gets callouts and can stay silent or make it right. Deny and counter need an account. Add the "Response" post type to the content types at L28-35. Add the sponsor block to Growth at L119-133. |
| `docs/21-relationships-and-reputation.md` L153-182 | Under "What lowers it", add: a callout that fades (−4 at peak 30 to 69, −12 at 70 or more), a deny that falls apart (−8). Under "What raises it", add: a deny of a false callout (+3), a callout of a rival with proof (+3). Add a short "The record" paragraph: 90 days, new contacts start 5 points lower for each record, at most 3. Under "Fair dealing" L137-151, say that a kid lowball is now a hidden act that can become a kids callout. |
| `docs/30-haggling-and-deal-reputation.md` L151-155 and L274-280 | Change the random story: the bad branch is now a named rival's callout (docs/34). Remove "Answer a bad story with a post" from "Not in this change" and point to docs/34. Add the kid gift story: 25% a story, 5% viral, the same values. Add: a good story lowers the heat of open callouts by 10, or 25 when viral. |
| `docs/28-messages-and-encounters.md` L43-55 | The kid lowball at a game shop now goes into the hidden log, not the scam queue. Add one line: a callout shows as a hub banner, not as a message. |
| `docs/32-short-form-video.md` L119-121 and L294-302 | The gambling backlash also adds drama bait that rival creators use for a "your rips are staged" callout. Pack battles stay out of scope. Rival creators exist only as callout posters. |
| `docs/04-reputation-and-followers-unlocks.md` L66-77 | "How each track moves": reputation also falls through callouts and rises through a good reply. Followers move with a counter-callout (+2%) and a viral fade (−1%). |
| `docs/14-counterfeit-risk.md` (Consequences) | A public post about a sold fake is now a product integrity callout with a reply, not a flat 5% follower loss. |
| `docs/20-card-shows.md` L57-131 (Visitors at the table) | Add "Give it to them" for a kid buyer: free, once a day, items of $30 or less. |
| `docs/19-prototype-values.md` | Add a "Callouts" section with the values of section 9. Update the "Counterfeits" section at L325-338 for the public post change. |

## 14. Interactions and risks

| Risk | Answer in this plan |
|---|---|
| An honest player never meets a callout. | Rivals post false callouts without any hidden act (4.1, 4.3). The rate is about one in 8 to 10 weeks at mid game, and higher with hostile rivals. |
| A callout is unwinnable. | Every callout has a reply that ends it: "make it right" always ends it in one night. Its cost is the act's refund or a goodwill sum from $25 to $250. A false callout also ends with "deny". The worst fade cost is −12 reputation and −1% followers. No callout ends a run. |
| A player with no account has no reply. | "Stay silent" and "make it right" need no account. False rival callouts start at half heat for a player with no account. |
| The player reads the truth from the receipts tag. | Some true callouts start without receipts. Receipts can appear later. A false callout never has receipts, but the player already knows their own acts, so the tag leaks nothing the player does not know. |
| A double penalty for one act. | The kid lowball leaves `recordScam` and enters the log. The fake public post becomes the callout and drops its inline loss. A palmed hit caught on camera: Part B bans and calls `startCallout` at heat 90. The 6.6 ban applies only to product integrity, so a fairness callout from a palmed hit does not ban twice. |
| Part B's 20% daily unshipped roll and this log roll twice. | Part B records `unshippedOrder` with discovery 0.20 and decay 0, and does not run its own roll. Part B calls `retireHiddenAct` when the order ships. |
| Spam of the kid gift for stories. | Once a day, $30 or less, and the item is gone. The expected value is about +1 reputation per gift. |
| A rival callout flood. | At most 3 open about the player. At most one open from each rival. A 14-day gap after any rival callout. Credibility falls each time the player beats a rival. |
| Callouts change prices. | No code in this plan reads or writes a market price, a graded price, `priceBoosts`, or `marketFactor`. |
| Challenge cash. | "Make it right" uses `addLedger` on the one cash balance. A P&L challenge item is never a callout cost. |
| Rejected features. | No slab cracking, no Japanese product, no preorders or new sets, no group breaks. The kid gift is a single card from the table. |
| Real names. | Rival names come from Part A, which must use fictional names. Part C adds only generic accusers ("A parent", "A stream buyer") and the existing fictional game shops. |
| The `-test` run slows down. | One new group with 4 End Days and two small extensions. |

### Why per-audience reputation is not in this part

The approved report keeps one reputation number. The research suggests separate scores for kids and parents, collectors, flippers, and vendors. A later change can add it with no change to the callout object: give `CalloutType` an `audience` property and replace the `addReputation(-rep)` call in `settle` with a per-audience call. Do not build it now.

## 15. Contracts with Parts A and B

### What Part C reads or calls from Part A

| Item | Expected shape | Used in |
|---|---|---|
| `data.rivals: [Rival]` | `id: String`, `name: String`, `kind: RivalKind` with `.flipper` and `.creator`, `hostility: Double` 0 to 1 | `name(of:)`, `rivalPool()`, `advanceCallouts()`, `openCallout(from:)` |
| `data.flipperPressure: Double` | 0.1 to 0.9 | Greed discovery factor |
| `data.scalperHeat: Double` | 0 and up; 10 is a store ban | Greed discovery factor |
| `func adjustRivalHostility(_ id: String, _ delta: Double)` | **Requested.** Clamps to 0...1 and updates Part A's rival memory. | Counter-callout and player callout |
| Calls from Part A into Part C | `recordHiddenAct(.shelfBuyout / .limitEvasion / .botCheckout / .priceGouge, ...)`; `noteRivalReceipt(rivalID, note:)` when the player sees a rival clear a shelf or use a bot (suggest a 30% chance on each "already gone" line) | Hidden log; 6.8 receipts |

### What Part C reads or calls from Part B

| Item | Expected shape | Used in |
|---|---|---|
| `func banFromWhatnot(days: Int, reason: String)` | **Requested.** Extends any existing ban to the later end day. | `settle` (6.6) |
| Calls from Part B into Part C | `recordHiddenAct(.backDoorAllocation / .plugPurchase / .plugSeized / .sellResealed / .palmedHit / .unshippedOrder, ...)`; `retireHiddenAct(id)` when an order ships; `exposeHiddenAct(id, inDays:)` when Part B's own system finds an act; `startCallout(.fairness, truth: true, receipts: true, heat: 90, accuser: .person(buyer), text:, refund: salePrice)` for a palmed hit caught on camera | Hidden log and callouts |
| `sourceID` on `unshippedOrder` | **Requested.** Pass the order ID, so that a later change can let "make it right" refund the order through Part B (`refundRipShipOrder(_:)`). Until then, "make it right" pays the act's `refund` amount. | 6.5 |
| End Day order | **Requested.** Part B's ship-deadline step must run before L1167 (`vendingEndDay()`), so that its acts roll the same night. | Section 8 |

