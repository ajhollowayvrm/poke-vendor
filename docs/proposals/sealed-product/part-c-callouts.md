# Part C: Callouts, the hidden-act log, replies, the record, and the kid gift

Status: revision 2. Scope: proposals 6.1 to 6.9 of `reports/Sealed product and flipper play.md` (section "Callouts carry heat, a hidden truth, and four replies"). Part C also owns the shared hidden-act log that Parts A and B write to.

Code base: commit `503ff3c` (the Swift code at `a7dd1dd` is the same). Every line number in this file was read from the code. `M/` = `app/PokeVendor/Model/`. Where this file and `00-integration.md` disagree, `00-integration.md` and `research_notes/Sealed product code proposal/r2_decisions.md` win.

## Revision 2 changes

Finding IDs come from `review_part_c_integration.md` (B = blocker, M = major, m = minor, C = citation, I = improvement), `sim_report.md` (P = problem, R = rule), and `r2_decisions.md` (D).

| ID | Change | Where |
|---|---|---|
| B1, D-8, C5 | `RivalKey` for named rivals and game shops. `CalloutAccuser.rival(RivalKey)`. Shop credibility in `CalloutState.shopCredibility`. Named rival credibility in Part A `Rival.credibility`. The player cannot call out a game shop. | 2.1, 2.2, 4.1, 6.2, 7.1 |
| B2, D-9 | Phase 0 stubs list, with bodies. | 1.5 |
| B3, D-4, I1, m15 | `retireHiddenAct(_:force:)`. "Make it right" on a late order ships it and pays 10% goodwill (min $5). It never pays the order price. | 1.3, 3.2, 6.2 |
| D-2, M3, M4 | Weight table with one row for every caller in Parts A and B. `shelfBuyout` only when the buy empties the item (D-1). | 1.4 |
| D-5 | A day-7 chargeback re-records the late order at weight 2.0. | 1.4 |
| D-6, R5 | "Make it right" on a palm pays `palmRefundDue(orderID)` (Part B), not the stored refund, and calls `returnPalmedCards(orderID)`. A late order calls `shipRipShipOrders([orderID])`. `makeRightCost(_:)` feeds the sheet, the block check, and the ledger. | 6.2 |
| D-7, M5, m14, R6 | `startCallout(force:)`. A full cap merges the heat into an open callout. An act is never lost. | 2.3 |
| M1 | The sold-fake public post: `contactID: nil`, `repPaid: true`. One reputation cost and one contact cost for one sale. | 3.3, 5.2 |
| M2 | `recordBadSale(sealed:)`. The act is recorded only when the buyer did not find the fake. List of sealed call sites. | 3.3 |
| M6, P4, D-10 | Receipts: at most 1 per rival per 30 days. Player callout gain scales with credibility. D-13 values. | 7.1, 9 |
| M7, D-13 | Counter and deny are exclusive. No counter on a `.smear`. "Make it right" takes back a counter gain. | 6.2 |
| m4, D7 | One rule: an act can come out on the night it is recorded, also when End Day records it. | 3.2 |
| m5, m6 | "Stay silent" does not set `replyDay`. The banner uses `acknowledged`. | 6.2, 10.2 |
| m7 | Kid lowball weight clamped to 0.5...2.0. | 3.3 |
| m8 | Kid lowball discovery is 53%, not 45%. Decision on the cost is written down. | 3.1, 14.2 |
| m9, P10 | Rate note uses 5 rivals and the tuned base 0.008. | 9 |
| m10, m11 | Kid gift needs $5 or more, no known fake, and pulls an online listing. | 7.2 |
| m12 | A "Callouts" row in `ContactsView` for a player with no account. | 10.2 |
| m13 | `postResponse(subject:heat:)`. | 6.3, 7.1 |
| m16 | `settle` runs inside End Day. Part B removes `save()` from `banFromWhatnot`. | 15 |
| m17 | A palm that comes out through the log and peaks at 80 gets `banFromWhatnot(days: Balance.palmBanDays)` (56), the same as a caught palm. A caught palm has `actID == nil`, so `settle` skips it and Part B's ban is the only one. | 5.2 |
| m18 | Explicit `CalloutType` in `ShowSession.weighted`. | 4.2 |
| C1 | `giveAway` has one call site (`M/LiveStream.swift` L225). | 7.2 |
| C2, m1 | No `Theme.red`. The heat bar uses `.red`, as `Social/SocialViews.swift` L26 does. | 10.1 |
| C6 | `docs/35-callouts.md` everywhere. | 13 |
| Save risk (review 6) | Tolerant `init(from:)` for `HiddenAct` and `Callout`. | 2.1, 11 |
| Test gaps (review 10) | `callouts()` runs no full End Day. Two checks move into `days()`. Real kid gift test, double-penalty tests, the late-order money test, the cap test, exclusivity seeds. | 12 |
| D-13 | `rivalCalloutBase` 0.008, `calloutDenyFalseRep` 1, `playerCalloutCooldown` 28, `playerCalloutRep` 1, `playerCalloutFollowerShare` 0.005, `playerCalloutFollowerMin` 10, `calloutCounterFollowerShare` 0.005, `kidGiftStory` 0.15. | 9 |
| D-17: I1 | "Make it right" ships a late order. | 6.2 |
| D-17: I2 | A proof line after a deny of a false callout. | 6.2 |
| D-17: I3 | A receipt from a fake bought at a rival's show table (Part A builds the table buy). | 7.1, 15 |
| D-17: I5 | At a show, the crowd knows about a hot callout. | 7.6 |
| Decision | "Make it right" no longer waives the record. The report 6.7 rule applies as written. | 5.2, 14.2 |
| Decision | The kid lowball keeps the callout costs of report 6.6. | 14.2 |

Declined: improvement I4 (a hard deal with a kid becomes a kids callout). The reason is in 14.3. No finding that touches Part C is declined. M8, M9, m2, m3, C3, C4, C7, and C8 are about the integration file or Part B only, so this file does not change for them.

## 0. Summary of the plan

- Create one new model file, `M/Callouts.swift`. It holds the hidden-act log, the callout object, the four replies, the record, the rival callout rolls, and `calloutsEndDay()`.
- Create one new view file, `Social/CalloutViews.swift`. It holds the callout card, the callouts list, the reply sheet, the rival callout composer, and the record badge.
- Change 21 existing files (14 model files, 6 view files, and `Hub/GameTests.swift`). Six of them only pass `sealed:` to `recordBadSale` (3.3). Each change extends an existing system. No change makes a second copy of a system.
- Run `xcodegen generate` in `app/` after you add the two new files.
- The report does not propose per-audience reputation. Part C does not add it (14.3).

### Facts about the current code that this plan uses

| Fact | Location |
|---|---|
| All saved state is in `GameData`. `init(from:)` decodes each field with a fallback, so a missing key takes its default. | `M/GameStore.swift` L4-141, L144-235 |
| End Day calls each system hook in a fixed order. `data.day += 1` is at L1131. | `M/GameStore.swift` L1106-1207 |
| `addLedger(_ amount: Double, _ category: LedgerEntry.Category, _ label: String, pending: Bool = false) -> UUID`, `@discardableResult`. `.refund` is a category. | `M/GameStore.swift` L355-361; `M/Inventory.swift` L625-626 |
| Deal stories: a queue of `DealStory`, applied in `storiesEndDay()`. The weekly random story is at L171-176. | `M/Haggling.swift` L64-71, L167-207 |
| Story values: bad −4, viral bad −12, −1% followers, −0.1 authenticity, viral chance 0.2. | `M/Haggling.swift` L32-49, L192-200 |
| `PostType` has 8 cases. `contentQuality` is the only `switch` over it. The new post sheet lists its types by hand. | `M/Social.swift` L5-17, L133-143; `Social/SocialViews.swift` L284 |
| Sponsor offers roll in `advanceSocial()`. `var s = data.social` is at L227. | `M/Social.swift` L224-269 |
| `ScamRecord`: 35% found, 3 to 20 days later, −30 reputation, −30 contact points. | `M/Relationships.swift` L147-153, L370-375, L556-564 |
| `promote(...)` is the only place that makes a new contact after the seed roster. | `M/Relationships.swift` L345-353 |
| A sold fake that comes out costs −40 reputation and −20 contact points. A public post then costs 5% followers and 0.1 authenticity. | `M/Counterfeits.swift` L320-363, L107-113 |
| `recordBadSale` has 18 call sites. | grep `recordBadSale(` |
| The kid lowball at a game shop calls `recordScam`. | `M/ShopEncounters.swift` L138-147 |
| The gambling backlash on the Rip until I hit series. | `M/Shorts.swift` L318-322 |
| `giveAway(_:)` removes an item and books what the player paid in `openedPaid`. It has one call site. | `M/LiveStream.swift` L459-471, L225 |
| `settleOnlineListing(_:name:)` pulls an online listing of an item that leaves. | `M/StorePricing.swift` L136 |
| `VisitorType.kid` exists. A kid buyer pays at most $30. `ShowSession.current`, `testSeat`. | `M/Shows.swift` L535-575, L1170, L1369, L1924 |
| `ShowSession.init(venue:store:show:vendors:regulars:)`; `sold` is `private(set)`. | `M/Shows.swift` L804, L764 |
| `makeVisitor()` builds each table visitor. | `M/Shows.swift` L1050-1083 |
| `Theme` has `background`, `surface`, `line`, `text`, `muted`, `cyan`, `green`, `orange`. It has no `red`. | `Support/Support.swift` L6-15 |
| `Banner(text:color:icon:)`, `Tag(text:color:)`, `DetailBox(title:)`. | `Hub/HubView.swift` L511; `Inventory/InventoryView.swift` L752; `Inventory/DetailViews.swift` L3 |
| `notoriety` = reputation tier + follower tier. | `M/Messages.swift` L60 |
| The rival game shops are `LocalStore.castle` and `LocalStore.topDeck`. | `M/LocalStores.swift` L8 |

## 1. The hidden-act log (owned by Part C, called by Parts A and B)

### 1.1 Types

New file `M/Callouts.swift`. Put these types at the top of the file.

```swift
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
```

### 1.2 Storage on `GameData`

Integration 1.8 adds one block of 8 fields after L140 (`var shorts = ShortsState()`). The two Part C fields in it are:

```swift
    var hiddenActs: [HiddenAct] = []               // Part C
    var callouts = CalloutState()                  // Part C
```

Their decoder lines go after L233 (`shorts = v(.shorts, shorts)`), in the same order as the block:

```swift
        hiddenActs = v(.hiddenActs, hiddenActs)
        callouts = v(.callouts, callouts)
```

### 1.3 The store API that other parts call

Put this in `M/Callouts.swift`, in `@MainActor extension GameStore`.

```swift
    /// Adds a shady act to the hidden log. Returns its ID so that the caller can retire or expose it later.
    /// The three-argument form is the shared contract. The other arguments are optional. Use the weights in 1.4.
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

    /// Removes an act when its source is settled, for example an order that shipped or that Whatnot refunded (D-4).
    /// Without `force`, an exposed act stays. With `force`, an exposed act goes too, and its open callout loses half
    /// its heat, because the harm is fixed. Returns true when the act had already come out.
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

    /// Makes an act come out in `days` days. Part B calls it when its own system finds the act.
    /// No caller in revision 2. Kept for the debug menu.
    func exposeHiddenAct(_ id: UUID, inDays days: Int = 1) {
        guard let i = data.hiddenActs.firstIndex(where: { $0.id == id }), !data.hiddenActs[i].exposed else { return }
        let day = data.day + max(0, days)
        data.hiddenActs[i].revealDay = day
    }
```

Exclusivity: each `firstIndex(where:)` closure reads only the parameter `id`. `exposeHiddenAct` reads `data.day` into the local `day` before it writes. Keep that order.

### 1.4 Weight table for every caller (D-2)

Every caller passes these values. `weight` is the size of the act. It is not the scalper heat that Part A adds. Part A's larger weight constants (`heatBotCancelWeight`, `heatStoreBanWeight`, and the `amount` passed in its `addHeat` helper) go away as weights. Part A passes the values below.

| Kind | Owner and call site | `weight` | `witnesses` | Other arguments |
|---|---|---|---|---|
| `shelfBuyout` | A, `buyShelf`, only when the buy empties the item at that chain and the player bought 2 or more units of it in that visit (D-1) | `1.0 + 0.25 × (units − 2)`, max 2.0 | 5 | `note: "<product> at <chain>"` |
| `limitEvasion` | A, the first buy on a second visit to one chain on one day | 1.0 | 0 | |
| `botCheckout` | A, each bot attempt at the Pokemon Center or Target.com | 0.5 | 0 | |
| `storeBan` | A, a chain bans the player | 1.5 | 3 | |
| `botOrderCancelled` | A, a store cancels a bot order | 0.5 | 0 | |
| `priceGouge` | Integration 1.2, at most one each day | `max(0.5, min(2, price / market − 1))` | 3 | |
| `backDoorAllocation` | B, `backDoorCheck` | `max(0.6, min(1.5, 1.5 × (1 − shelfShare)))` | 0 | |
| `plugPurchase` | B, `orderFromPlug` | `max(0.3, min(2, orderTotal / 2_000))` | 0 | `sourceID: order.id` |
| `plugSeized` | B, `plugEndDay`, a seizure | 1.0 | 0 | `revealDay: data.day + 2`, `sourceID: order.id`. Part B also calls `retireHiddenAct(order.actID)` for the order's `plugPurchase` act, so one seizure gives one callout. |
| `sellResealed` | C, `recordBadSale`, known resealed product, buyer did not find it (3.3) | `max(0.5, min(2, price / 100))` | 0 | `contactID`, `refund: price` |
| `palmedHit` | B, `notePalm`, the camera did not catch it | 1.5 | peak stream viewers | `refund: order.price + card market` (D-6), `sourceID: order.id` |
| `unshippedOrder` | B, `ripShipEndDay`, the first night past the ship deadline | 1.0 | 0 | `contactID: buyerContactID`, `refund: order.price` (the goodwill basis, 6.2), `sourceID: order.id` |
| `unshippedOrder` after the day-7 chargeback (D-5) | B, `refundRipShipOrder(_, reason: .chargeback)` | 2.0 | 0 | Same arguments. Part B first calls `retireHiddenAct(lateActID, force: true)`. It records the weight-2.0 act only when that call returns `false` (the late act had not come out). An exposed late act keeps its open callout. |
| `lowballKid` | C, `lowballKid(_:)` (3.3) | `max(0.5, min(2, market / 50))` | 3 | `contactID: shop`, `refund: fair price gap` |
| `counterfeitSold` | C, `recordBadSale`, known fake card, buyer did not find it (3.3) | `max(0.5, min(2, price / 100))` | 0 | `contactID`, `refund: price` |

Part B's order code calls `retireHiddenAct(act, force: true)` when an order ships or is refunded (D-4). Both `shipRipShipOrders` and `refundRipShipOrder` change their current calls (Part B 5.5 and 5.6) to `force: true`.

### 1.5 Phase 0 stubs (D-9)

Phase 0 builds the parts of this section that other parts call, so that phases 2 to 5 compile and pass `-test`.

| Item | Phase 0 body |
|---|---|
| `HiddenActKind` (all 14 cases and all values, 1.1) | Final |
| `HiddenAct` and its decoder (1.1) | Final |
| The section 2.1 types: `RivalKey`, `CalloutType`, `CalloutAccuser`, `CalloutTarget`, `CalloutReply`, `Callout` and its decoder, `CalloutRecord`, `RivalReceipt`, `CalloutState` | Final |
| `GameData.hiddenActs`, `GameData.callouts` and their decoder lines (1.2) | Final |
| `recordHiddenAct`, `retireHiddenAct(_:force:)`, `exposeHiddenAct` (1.3) | Final. They are short. |
| `startCallout(...)` (2.3) | Append only: build the `Callout`, append it to `data.callouts.open`, return the line. No cap merge, no `rememberRival`. Phase 6 replaces the body. |
| `noteRivalReceipt(_:note:)` (7.1) | Final. It is 5 lines. |
| The `Balance` constants that these use: `calloutMaxOpen`, the six `calloutHeat*` values, `calloutGoodwill*`, `rivalReceiptGapDays`, `rivalCredFloor`, `rivalCredWeekly` | Final |

Everything else in this file is phase 6. In phase 0, nothing calls `calloutsEndDay()`, so stored acts wait in the log. They roll from phase 6 on. That is safe: an old act at most comes out in the first week of phase 6 testing.

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

/// One rival, as the callout system sees it. Built fresh each time; not saved.
struct RivalView {
    let key: RivalKey
    let hostility: Double
    let credibility: Double
    let creator: Bool
    var accuser: CalloutAccuser { .rival(key) }
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
```

The callout stores no accuser name. `GameStore.name(of:)` gives it, because a rival name lives in Part A's `data.rivals`.

### 2.2 Helper reads

```swift
@MainActor
extension GameStore {
    var openCallouts: [Callout] { data.callouts.open.filter { $0.target == .player } }
    var hottestCallout: Double { openCallouts.map(\.heat).max() ?? 0 }
    var activeRecords: [CalloutRecord] { let today = data.day; return data.callouts.records.filter { $0.untilDay >= today } }
    /// Points that a new contact loses for the active records (proposal 6.7).
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
        case .rival(let id): rival(id)?.name ?? "A rival"      // Part A
        case .shop(let shop): shop.rawValue
        }
    }

    /// D-8: named rivals keep credibility on `Rival`; game shops keep it here.
    func credibility(_ key: RivalKey) -> Double {
        switch key {
        case .rival(let id): rival(id)?.credibility ?? 1
        case .shop(let shop): data.callouts.shopCredibility[shop.rawValue] ?? 1
        }
    }

    /// Lowers credibility to the floor at most. A named rival goes through Part A's `changeRivalCredibility`.
    func loseCredibility(_ key: RivalKey, _ amount: Double, receipt: String?) {
        let now = credibility(key)
        let next = max(Balance.rivalCredFloor, now - amount)
        switch key {
        case .rival(let id):
            changeRivalCredibility(id, by: next - now)       // Part A
            if let receipt { noteRivalReceipt(id, note: receipt) }
        case .shop(let shop):
            data.callouts.shopCredibility[shop.rawValue] = next
        }
    }
}
```

`loseCredibility` reads `credibility(key)` into `now` before any write. `changeRivalCredibility` clamps to 0...1. The delta `next − now` keeps the floor in Part C, so Part A needs no floor in its clamp.

### 2.3 Opening a callout

```swift
    /// Opens a callout about the player. Returns the report line.
    /// `force`: the callout opens past the cap (a palm caught on camera, a public fake post, an act with a fixed
    /// reveal day, a baseless player callout). Without `force`, a full cap adds the heat to an open callout (D-7).
    @discardableResult
    func startCallout(_ type: CalloutType, truth: Bool, receipts: Bool, heat: Double? = nil, accuser: CalloutAccuser,
                      text: String, force: Bool = false, actID: UUID? = nil, actKind: HiddenActKind? = nil,
                      sourceID: UUID? = nil, contactID: String? = nil, refund: Double = 0,
                      repPaid: Bool = false) -> String? {
        let today = data.day
        let start = min(100, heat ?? type.startHeat)
        let open = data.callouts.open.filter { $0.target == .player }
        if !force, open.count >= Balance.calloutMaxOpen {
            // The act is not lost: its heat joins the open callout of the same type, or the hottest one.
            guard let pick = open.first(where: { $0.type == type }) ?? open.max(by: { $0.heat < $1.heat }),
                  let k = data.callouts.open.firstIndex(where: { $0.id == pick.id }) else { return nil }
            var c = data.callouts.open[k]
            c.heat = min(100, c.heat + start)
            c.peak = max(c.peak, c.heat)
            c.reason = "More people piled on."
            data.callouts.open[k] = c
            log(text)
            return "Callout: \(text) It joined the talk about you. Heat \(Int(c.heat))."
        }
        let pay = refund > 0 ? refund : goodwill(heat: start)
        let c = Callout(type: type, accuser: accuser, startDay: today, text: text, truth: truth, receipts: receipts,
                        heat: start, peak: start, reason: receipts ? "They posted receipts." : "It is spreading.",
                        actID: actID, actKind: actKind, sourceID: sourceID, contactID: contactID, refund: pay,
                        repPaid: repPaid)
        data.callouts.open.append(c)
        if case .rival(.rival(let id)) = accuser {
            rememberRival(id, .rivalCalledOut, note: text, byPlayer: false)     // Part A, integration 1.3
        }
        log(text)
        return "Callout: \(text) Heat \(Int(start))."
    }

    /// The cost of "make it right" when no act sets a refund.
    func goodwill(heat: Double) -> Double {
        (min(Balance.calloutGoodwillMax, max(Balance.calloutGoodwillMin, heat * Balance.calloutGoodwillPerHeat))).rounded()
    }

    /// The goodwill sum for a late Rip & Ship order: 10% of the order price, at least $5 (D-4).
    func lateGoodwill(_ price: Double) -> Double {
        max(Balance.lateShipGoodwillMin, (price * Balance.lateShipGoodwillShare * 100).rounded() / 100)
    }
```

An `unshippedOrder` or `palmedHit` act always opens its own callout, past the cap, because Part B settles it through the callout's `sourceID` (D-4, D-5, D-6). This extends the D-7 forced list (revision 3).

The merge branch always returns a line, so a caller treats the act as exposed. `nil` comes back only when the cap is full and no open callout exists, which cannot happen.

## 3. True callouts from hidden acts (6.2)

### 3.1 The discovery formula

For an unexposed act with no `revealDay`, the daily chance is:

```
p = kind.discovery × weight × witnessFactor × (1 + 0.1 × notoriety) × greedFactor
witnessFactor = min(3.0, 1 + log10(1 + witnesses) / 2)
greedFactor   = (0.5 + flipperPressure) × (1 + min(1, scalperHeat / 10))   only for greed acts, else 1
p is capped at 0.5
```

After a night with no discovery, `weight *= (1 − decay)`. The act leaves the log when its weight falls under 0.05, or after 90 days. An act with `revealDay` does not roll and does not decay. It comes out on that day, past the cap.

Example: a kid lowball at weight 1.0 with 3 witnesses at notoriety 2. `p ≈ 0.03 × 1.30 × 1.2 = 0.047` on night 1. The total discovery chance over the life of the act is about 53% (review m8). The old `ScamRecord` path gave 35%. 14.2 gives the cost decision.

Example: a shelf buyout under D-1 (the player emptied the item), weight 1.0, 5 witnesses, pressure 0.5, scalper heat 10. `p ≈ 0.02 × 1.39 × 1.2 × 2.0 = 0.067` on night 1. Total about 55%. With D-1 an honest player who buys 1 hot unit records no act. The sim gives 0.83 true callouts a year for an honest player who also camps (sim section 7).

### 3.2 The daily step

This is the first step inside `calloutsEndDay()` (section 8).

**The first-night rule (review m4, integration D7).** An act can come out on the night it is recorded. An act recorded during the day has `day` = the old day. An act that End Day records before step 15 (for example Part B's `ripShipEndDay`, step 11) has `day` = the new day. Both roll in step 15 that night. No act skips a night.

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
    private func openCallout(from a: HiddenAct) -> String? {
        let rivals = data.rivals                   // Part A
        let accuser: CalloutAccuser
        if let r = rivals.randomElement(), Double.random(in: 0..<1) < Balance.rivalBreaksStory {
            accuser = .rival(.rival(r.id))
        } else {
            accuser = .person(victimName(a))
        }
        let text = a.kind.calloutText.replacingOccurrences(of: "{who}", with: name(of: accuser))
        let type = a.kind.calloutType
        let pay = a.kind == .unshippedOrder ? lateGoodwill(a.refund) : a.refund
        return startCallout(type, truth: true, receipts: Double.random(in: 0..<1) < a.kind.receipts,
                            heat: type.startHeat * min(1.5, max(0.75, a.weight)), accuser: accuser, text: text,
                            force: a.revealDay != nil || a.kind == .unshippedOrder || a.kind == .palmedHit, actID: a.id, actKind: a.kind, sourceID: a.sourceID,
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
```

Exclusivity notes for this step:

- `pressure`, `heat`, `notor`, and `today` are locals. The loop changes only the local `acts`.
- `removeAll` reads only the locals `today`, `keep`, `maxDays`, and `minWeight`.
- `openCallout(from:)` mutates `data.callouts`. It runs in a plain `for` loop, not inside a closure on `data.hiddenActs`.

### 3.3 Existing secrets that move into the log

**The kid lowball.** In `lowballKid(_:)` at `M/ShopEncounters.swift` L138-147, replace `recordScam(...)` (L145) with:

```swift
        recordHiddenAct(.lowballKid, weight: max(0.5, min(2, e.market / 50)), note: "\(print.name) at \(e.shop.rawValue)",
                        witnesses: 3, contactID: shopContactID(e.shop),
                        refund: ShowSession.round(e.market * (Balance.kidFairShare - Balance.kidLowballShare)))
```

The kid lowball becomes a public kids callout. "Make it right" pays the kid the gap to a fair price. One act has one path. `recordScam` stays for adults (`M/Relationships.swift` L370-375): a lie to an adult naive seller is not one of the five public kinds.

**Known fakes and resealed products (review M2).** `recordBadSale` at `M/Counterfeits.swift` L320-327 gets one new parameter, `sealed: Bool = false`, and one rule for both kinds: the act is recorded only when the buyer did not find the fake. A buyer who finds it already costs −40 reputation through `counterfeitsEndDay`, so that sale must not also come out later.

```swift
    func recordBadSale(item: String, channel: String, price: Double, fake: FakeTier, known: Bool, refunds: Bool,
                       contactID: String? = nil, shop: LocalStore? = nil, sealed: Bool = false) {
        var chance = Balance.fakeFoundChance[fake.rawValue]
        if known { chance += Balance.knownFakeFoundBonus }
        guard Double.random(in: 0..<1) < chance else {
            // The buyer did not find it. A third party still can (docs/35-callouts.md).
            if known {
                recordHiddenAct(sealed ? .sellResealed : .counterfeitSold, weight: max(0.5, min(2, price / 100)),
                                note: "\(item) on \(channel)", contactID: contactID, refund: price)
            }
            return
        }
        data.badSales.append(BadSale(item: item, channel: channel, price: price, contactID: contactID, shop: shop, known: known,
                                     refunds: refunds, dayFound: data.day + Int.random(in: Balance.fakeFoundDays)))
    }
```

Pass `sealed: true` at the call sites that sell a `SealedItem`:

| Call site | Argument |
|---|---|
| `M/LiveStream.swift` L455 | `sealed: item.sealed` |
| `M/Opportunities.swift` L308 (sealed collector) | `sealed: true` |
| `M/Vending.swift` L413 | `sealed: true` when `vend.item` is a `SealedItem` (read the machine item type there) |
| `M/CardStore.swift` L623 | Read a local `let wasSealed` in the `else` branch at L617 (the item came from `data.sealed`), then `sealed: wasSealed` |
| `M/Lots.swift` L149 (the sealed loop) | `sealed: true` |
| `M/Shows.swift` L1433 | `sealed: one.kind == .sealed` |
| `M/Shows.swift` L1452, L1800, L2153 | `sealed: item.kind == .sealed` |
| `M/Meetups.swift` L169 | `sealed: m.sealed` |
| `M/GameStore.swift` L1476 (online listing sale) | `sealed:` true when the listed item is a `SealedItem` |

The other 7 call sites sell cards. They keep the default.

**The public post about a sold fake (review M1).** At `M/Counterfeits.swift` L347-356, replace the inline follower and authenticity loss with a callout. Keep the refund, the −40 reputation, and the contact and shop costs at L337-346.

```swift
            #if DEBUG
            let goesPublic = GameStore.forcePublicScam ?? (Double.random(in: 0..<1) < publicChance)
            #else
            let goesPublic = Double.random(in: 0..<1) < publicChance
            #endif
            if goesPublic, let callout = startCallout(.productIntegrity, truth: true, receipts: true,
                                                      heat: sale.known ? 75 : 60, accuser: .person("The buyer"),
                                                      text: "The buyer of your \(sale.item) posted that it was a fake.",
                                                      force: true, contactID: nil, refund: sale.refunds ? 0 : sale.price,
                                                      repPaid: true) {
                line += " They posted about it. Word is getting around."
                lines.append(callout)
            }
```

`contactID: nil` because L338 already took the contact points. `repPaid: true` because L337 already took −40. At fade, `settle` takes no reputation for this callout, but the follower and authenticity loss and the record still apply (5.2). One sale gives one reputation cost, one contact cost, and one public cost. `force: true` because the post is a fact that already happened. `refund: 0` on a platform that already refunded means "make it right" pays a goodwill sum, not the sale price twice. Add `#if DEBUG static var forcePublicScam: Bool?` next to the Counterfeits constants for the test.

## 4. False callouts from named rivals (6.3)

### 4.1 The weekly rival roll

Runs inside `calloutsEndDay()` when `data.day % 7 == 0`. Part A's `rivalsEndDay()` (integration step 16) regains named rival credibility each week. This function regains game shop credibility.

```swift
    private func rivalCalloutsWeekly() -> [String] {
        let today = data.day
        guard today % 7 == 0 else { return [] }
        // Locals first (the exclusivity trap).
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
                  !open.contains(where: { $0.accuser == r.accuser }) else { continue }
            var p = (Balance.rivalCalloutBase + Balance.rivalCalloutHostility * r.hostility) * r.credibility
            if r.creator { p += data.callouts.dramaBait }
            if today - data.callouts.lastRivalCalloutDay < Balance.rivalCalloutGap { p *= Balance.rivalCalloutGapFactor }
            guard Double.random(in: 0..<1) < p, let line = rivalCallout(r) else { continue }
            lines.append(line)
        }
        return lines
    }

    /// Every rival that can post: the Part A rivals, and the two game shops after a lease.
    func rivalPool() -> [RivalView] {
        var out = data.rivals.map { r in                                          // Part A
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
```

The rival roll does not open past the cap. A full cap skips the roll (a false claim has no act to keep).

### 4.2 One rival callout: true or false

A rival callout is false at least 60% of the time. It can be true only when the player has an unexposed act that fits the rival.

```swift
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
            line = startCallout(act.kind.calloutType, truth: true,
                                receipts: Double.random(in: 0..<1) < act.kind.receipts * 0.5,
                                heat: act.kind.calloutType.startHeat * r.credibility, accuser: r.accuser, text: text,
                                actID: act.id, actKind: act.kind, sourceID: act.sourceID, contactID: act.contactID, refund: pay)
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
        return r.creator ? ShowSession.weighted([(CalloutType.fairness, 0.5), (CalloutType.greed, 0.35), (CalloutType.kids, 0.15)]) ?? .greed
                         : ShowSession.weighted([(CalloutType.greed, 0.7), (CalloutType.productIntegrity, 0.3)]) ?? .greed
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
```

`ShowSession.weighted` is `static` at `M/Shows.swift` L1355. The explicit `CalloutType` in each tuple removes the inference through `??` (review m18). `startCallout` records `.rivalCalledOut` in the rival's memory for a named rival.

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
        guard openCallouts.count < Balance.calloutMaxOpen, let r = rivalPool().randomElement() else { return nil }
        return rivalCallout(r)
    }
```

When no rival exists, the bad branch makes nothing. The old −3 story text goes away. `Balance.storyRandomRep` stays for the good story. The `random` test at L179 still works, because the good random story is appended to `due` and is not in `data.dealStories`.

### 4.4 Rival creators and the gambling backlash

In `postRipEpisode` at `M/Shorts.swift` L319-322, after the authenticity line, add:

```swift
            data.callouts.dramaBait = min(Balance.dramaBaitMax, data.callouts.dramaBait + Balance.dramaBaitGambling)
```

The value adds to the weekly chance of each rival creator (4.1) and halves each week. A long dry series draws a "your rip videos are staged" callout. Pack battles stay out of scope (`docs/32` L299).

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
        data.callouts.open = open                        // write back once, then apply effects
        return ended.map { settle($0) }
    }
```

Only named rivals answer. A game shop or a person does not post a second reply. The 6.5 table sets the player's numbers, so this is enough (review 9, row 6.4).

Exclusivity: `hostility` is a local dictionary. The loop does not read `data`. `open.removeAll` reads the local `endedIDs`. `settle` runs after the write-back.

### 5.2 Settle: the end of a callout

```swift
    /// The end of a callout about the player. Maps the peak heat to the story costs (6.6), then the record (6.7) and
    /// the Whatnot ban (6.6). Runs inside End Day: it must not call `save()`. Returns the report line.
    private func settle(_ c: Callout) -> String {
        let today = data.day
        guard c.target == .player else { return close(c, rep: 0, line: "") }
        // A false callout that the player beat with a deny or paid off costs nothing at the end.
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
            // A palm found later through the log gets the same 8-week ban as a palm caught on camera. A caught palm
            // has no act (`actID == nil`): Part B's settlePalm already banned it, so it is skipped here.
            let palmFromLog = c.actKind == .palmedHit && c.actID != nil
            if c.peak >= Balance.calloutBanPeak, palmFromLog || c.type == .productIntegrity {
                let days = palmFromLog ? Balance.palmBanDays : Int.random(in: Balance.calloutBanDays)   // Part B constant, 56
                banFromWhatnot(days: days, reason: palmFromLog ? "a palmed hit" : "a product integrity callout")   // Part B
                line += " Whatnot banned you from streams for \(days / 7) weeks."
            }
        }
        if case .rival(.rival(let id)) = c.accuser {
            rememberRival(id, .calloutEnded, note: c.text, byPlayer: won)                         // Part A
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
```

Rules this function keeps:

- A false callout left silent still costs reputation at fade. The public does not know the truth. That is why "deny" exists.
- A false callout ended by "deny" or "make it right" costs nothing at fade.
- A true callout ended by "make it right" costs half the reputation, no followers, and no authenticity. **The record still applies** when the peak is 50 or more (decision in 14.2).
- A callout with `repPaid` takes no reputation at fade. Its follower loss and record still apply.
- A palm caught live (Part B `settlePalm`) has `actID == nil`, so Part B's own ban (`palmBanDays`, 56) is the only ban. A palm that comes out through the log (`actID != nil`) and peaks at 80 or more gets the same `banFromWhatnot(days: Balance.palmBanDays, ...)` here (review m17, integration 1.7). A true product integrity callout at 80 or more gets 28 to 56 days. `banFromWhatnot` extends any ban to the later end day.
- Callouts never change a price. No code path in this file reads or writes a graded price, a market price, or `priceBoosts`.

## 6. The response post: four replies (6.5)

### 6.1 The new post type

In `M/Social.swift` L5-17, add a case to `PostType`:

```swift
    /// A reply to a callout (docs/35-callouts.md). It posts from the reply sheet, not from the new post sheet.
    case response = "Response"
```

In `contentQuality` at L133-143, extend the last case: `case .stream, .short, .response: 1.0`. A grep finds no other `switch` over `PostType`. The new post sheet lists its types by hand at `Social/SocialViews.swift` L284, so "Response" does not show there. `PostRow` (L181-214) prints `post.type.rawValue` and needs no change.

### 6.2 The reply function

```swift
    /// A late Rip & Ship order that is still open (D-4 fields on Part B's `RipShipOrder`).
    func ripShipOrderOpen(_ id: UUID) -> Bool {
        guard let o = data.ripShip.orders.first(where: { $0.id == id }) else { return false }
        return !o.shipped && !o.refunded
    }

    /// What "make it right" pays now. A palm asks Part B, so a palmed order that a chargeback already refunded
    /// pays only the cards' market (D-4, D-6). Every other callout pays its stored `refund`.
    func makeRightCost(_ c: Callout) -> Double {
        if c.actKind == .palmedHit, let order = c.sourceID { return palmRefundDue(order) }   // Part B
        return c.refund
    }

    /// What each reply needs. Deny and counter need an account. They cannot both run on one callout (D-13).
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
               slot(for: Balance.ripShipShipMinutes / 60) == nil {
                return "You need 10 minutes today to ship the order."
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
        // Calls into Part B come first, because they can change this callout (`retireHiddenAct(force:)` halves the heat).
        var shippedNow = false
        let cost = makeRightCost(first)                   // read before returnPalmedCards changes the order
        if reply == .makeRight {
            if first.actKind == .unshippedOrder, !first.sourceSettled, let order = first.sourceID, ripShipOrderOpen(order) {
                if let fail = shipRipShipOrders([order]) { return fail }          // Part B: 10 minutes, retires the act
                shippedNow = true
            }
            if first.actKind == .palmedHit, let order = first.sourceID { returnPalmedCards(order) }   // Part B, D-6
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
                c.fallFrom = c.heat
                c.fallEndDay = today + Balance.calloutDenyFalseDays
                c.reason = "You showed it was false."
                addReputation(Balance.calloutDenyFalseRep)
                if case .rival(let key) = c.accuser {
                    loseCredibility(key, Balance.rivalCredDenied, receipt: "\(who) lied about you on day \(today + 1).")
                }
                out = "You showed the claim was false. \(denyProof(c)) Reputation +\(Balance.calloutDenyFalseRep). It ends in \(Balance.calloutDenyFalseDays) days."
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
                case .rival(let rid): adjustRivalHostility(rid, Balance.playerCalloutHostility)       // Part A
                case .shop(let shop): addPoints(shopContactID(shop), -Balance.calloutCounterShopCost)
                }
            }
            out = "You posted a counter-callout. +\(gain) followers. The heat went up on both sides."
        }
        c.peak = max(c.peak, c.heat)
        c.acknowledged = true
        if reply != .silent {
            c.reply = reply
            c.replyDay = today                         // "stay silent" never sets it (review m5)
        }
        data.callouts.open[i] = c
        if reply == .deny || reply == .counter || (reply == .makeRight && hasAccount) {
            postResponse(subject: "\(reply.label) · \(who)", heat: c.heat)
        }
        log(out)
        save()
        return out
    }

    /// A line of proof from the player's own record, shown after a deny of a false callout (review I2).
    private func denyProof(_ c: Callout) -> String {
        let since = data.day - 30
        switch c.type {
        case .greed:
            let n = data.ledger.filter { $0.category == .sale && $0.day >= since }.count
            return "You posted your last \(n) sales. The prices were fair."
        case .fairness:
            let n = data.ripShip.orders.filter(\.shipped).count                  // Part B
            return n > 0 ? "All \(n) of your recent Rip & Ship orders shipped." : "Your rip videos are uncut."
        case .productIntegrity: return "You showed the seals and the receipts for your stock."
        case .kids: return "Parents from your table vouched for you."
        case .forbidden: return "You posted your invoices."
        case .smear: return "Your record speaks for itself."
        }
    }
```

The "make it right" rules for each source:

| Callout source | What "make it right" pays | What else happens |
|---|---|---|
| `unshippedOrder`, order open (not shipped, not refunded) | `lateGoodwill(order price)`: 10%, at least $5 | `shipRipShipOrders([orderID])` (Part B) ships it now. It costs 10 minutes. Part B retires the act with `force: true`, which halves the heat first. |
| `unshippedOrder`, order shipped or refunded already | `lateGoodwill(order price)` only | Nothing. The order price is never paid twice (D-4). |
| `palmedHit` (log path or caught live) | `palmRefundDue(orderID)` (Part B): `order.price + order.palmedValue`, or only `order.palmedValue` when a chargeback already refunded the price. Read before the cards move. The stored `c.refund` is not used. | `returnPalmedCards(orderID)` (Part B) moves every palmed card that the player still holds out of inventory, to the buyer. |
| Public fake post | The sale price when the platform did not refund; else a goodwill sum | No second reputation cost (`repPaid`). |
| `lowballKid` | The gap from the lowball price to the fair price | |
| Any other act | The act's `refund` when it is above 0; else the goodwill sum | |
| A false callout | The goodwill sum ($25 to $250 by heat) | |

D-6 binds the palm refund as written: the buyer gets the order price and the card's market value, and the card leaves the player's inventory. If the player already sold the card, the market value is the only card payment. `makeRightCost(_:)` gives the amount for the reply sheet, `replyBlock`, and the ledger, so the three always agree. This makes a palm a clear loss: in the sim, a made-right palm on a $5 pack goes from +$54 to −$4 (sim section 7).

Exclusivity: `replyToCallout` reads `first`, calls Part B, then copies the callout again into `c` and writes it back once. `addReputation`, `addLedger`, and `data.social` writes happen between, never inside a closure on `data.callouts`. `denyProof` uses `filter` (a read) with locals.

### 6.3 The response post record

```swift
    /// The reply shows in the post list. It does not use the follower gain of a quick post.
    private func postResponse(subject: String, heat: Double) {
        let followers = data.social.followers
        let views = max(1, Int(Double(followers) * 0.2 * max(0.3, heat / 50)))
        let post = SocialPost(day: data.day, type: .response, subject: subject, views: views, followerChange: 0,
                              likes: Int(Double(views) * 0.05), quality: 1, timing: 1, luck: 1)
        data.social.posts.append(post)
        data.social.burnout = min(1, data.social.burnout + Balance.responseBurnout)
        data.social.lastPostDay = data.day
    }
```

### 6.4 The reply table as built

| Reply | True callout | False callout | Needs |
|---|---|---|---|
| Stay silent | Heat −15% each night. Fade cost by peak. | Same. Fade cost by peak. | Nothing |
| Deny | Heat ×1.5. Find-out roll: 50% with receipts, 20% without. A find-out: −8 reputation, receipts become visible. Fade cost by peak. | Heat falls to 0 in 2 days. +1 reputation now. A proof line. Rival credibility −0.25. A receipt against a named rival (30-day limit). No fade cost. | Account; no counter on this callout |
| Make it right | Pay (6.2 table). Heat falls to 0 in 1 day. Half the fade reputation. No follower loss. Record if peak ≥ 50. A counter gain is taken back. | Pay the goodwill sum. Heat falls to 0 in 1 day. No fade cost. | Cash (and 10 minutes to ship a late order) |
| Counter-callout | Heat +30. +0.5% followers. Authenticity −0.05. Rival credibility −0.1, named rival hostility +0.2, or shop standing −10. | Same, but rival credibility −0.3. | Account, a rival or shop accuser, not `.smear`, no deny on this callout |

The three farming loops that the review and the sim found are closed here: counter then deny (blocked both ways), counter on the backlash to the player's own callout (`.smear` blocks it), and counter then make it right (the gain is taken back).

## 7. Player callouts, the kid gift, the record, and the crowd

### 7.1 The player calls out a rival (6.8)

Receipts come only from rival wrongdoing that the game models. There are three sources, and each named rival gives at most 1 receipt each 30 days (review M6):

| Source | Owner | Chance |
|---|---|---|
| The player denies a false callout from that rival | C, `replyToCallout` | Always (subject to the 30-day limit) |
| A rival took the stock before the player came (the line is computed in the model, once a visit, D-10) | A | `Balance.rivalReceiptChance` 0.05 |
| The player bought a sealed item at the rival's show table and the check finds a fake (review I3) | A builds the buy; it calls `noteRivalReceipt` | When the fake is found |

```swift
    /// Part A and this file call it. At most 1 receipt from each rival each 30 days.
    func noteRivalReceipt(_ id: UUID, note: String) {
        let today = data.day
        if let last = data.callouts.receiptDay[id], today - last < Balance.rivalReceiptGapDays { return }
        data.callouts.receiptDay[id] = today
        data.callouts.rivalReceipts.append(RivalReceipt(key: .rival(id), day: today, note: note))
    }

    /// The player can call out a named rival. Never a game shop.
    func playerCalloutBlock(_ rivalID: UUID) -> String? {
        guard hasAccount else { return "You need a social account to post a callout." }
        if let last = data.callouts.playerCalloutDay[rivalID], data.day - last < Balance.playerCalloutCooldown {
            return "You called them out on day \(last + 1). Wait \(Balance.playerCalloutCooldown) days."
        }
        return nil
    }

    /// With a receipt the callout is true. Without one, the heat lands on the player.
    @discardableResult
    func calloutRival(_ rivalID: UUID) -> String {
        if let block = playerCalloutBlock(rivalID) { return block }
        let today = data.day
        let rivalName = rival(rivalID)?.name ?? "the rival"                                   // Part A
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
            adjustRivalHostility(rivalID, Balance.playerCalloutHostility)                    // Part A
            data.callouts.open.append(Callout(type: .smear, accuser: .player, target: .rival(rivalID), startDay: today,
                                              text: "You called out \(rivalName) with proof: \(receipt.note)", truth: true,
                                              receipts: true, heat: 50, peak: 50, reason: "Your proof is spreading.", refund: 0))
            out = "You called out \(rivalName) with proof. Reputation +\(rep), +\(gain) followers."
        } else {
            data.social.authenticity = max(0, data.social.authenticity - Balance.playerSmearAuthenticity)
            changeRivalCredibility(rivalID, by: Balance.playerSmearCredGain)                 // Part A clamps at 1
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
```

A callout with `target: .rival` decays like any other callout. `settle` returns early for it (no cost). It shows in the list so that the player sees the result. It does not count toward the cap.

The baseless callout opens with `force: true` (review m14), so the text "people turned on you" is always true. It is type `.smear`, truth true, receipts true. "Deny" takes the true branch, so it backfires. "Counter" is blocked. "Make it right" pays the goodwill sum and ends it.

Farm check with D-13 values: 3 flippers and 2 creators, 1 receipt per rival per 30 days at most, a 28-day cooldown, +1 reputation and 0.5% followers (min 10) each, scaled by credibility. The sim tuned run gives the farmer +65 reputation and +1,082 followers a year in all, down from +266 and +7,007 (sim section 7). The 30-day limit and the credibility scale cut it further. Tune with `-retailsim` (D-16).

### 7.2 The kid gift (6.9)

In `M/LiveStream.swift` L459-471, add a place argument to `giveAway` so that the log line fits a table:

```swift
    func giveAway(_ id: UUID, at place: String = "on stream") {
        if let card = card(id) {
            data.openedPaid += card.paid ?? 0
            data.raw.removeAll { $0.id == id }
            data.slabs.removeAll { $0.id == id }
            log("Gave away \(card.print.name) \(place).")
        } else if let item = data.sealed.first(where: { $0.id == id }) {
            data.openedPaid += item.paid
            data.sealed.removeAll { $0.id == id }
            log("Gave away \(item.name) \(place).")
        }
    }
```

The one existing call site (`M/LiveStream.swift` L225, `store.giveAway(item.id)`) keeps the default.

In `M/Shows.swift`, in `ShowSession`, near `decline()` (L1894), add:

```swift
    /// The player gives a kid the item they wanted, for free (docs/35-callouts.md, The kid gift). Once a day.
    var canGiveToKid: Bool {
        guard let v = current, v.type == .kid, v.intent == .buy, let item = v.item, v.extra == nil else { return false }
        return item.market >= Balance.kidGiftMinValue && item.market <= Balance.kidGiftMaxValue && !item.fakeKnown
            && !item.showcase && store.data.callouts.kidGiftDay != store.day
    }

    func giveToKid() {
        guard canGiveToKid, let v = current, let item = v.item else { return }
        store.settleOnlineListing(item.id, name: item.name)       // the same step as sellAtShow (L201)
        store.giveAway(item.id, at: "to a kid at \(venue.name)")
        table.removeAll { $0.id == item.id }
        sold.append(("\(item.name) (gift to a kid)", 0))           // shows in the summary and the vlog
        store.kidGift(name: v.name, venue: venue.name)
        note = "The kid could not believe it. The parent took a photo."
        finish(minutes: .random(in: 3...6))
        Haptics.hit()
    }
```

In `M/Callouts.swift`:

```swift
    /// A kid gift can come back as a good story: 15% a story, and 1 in 5 of those viral (3% in all). It reuses the
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

The story pays the existing values: good +3 reputation and +20 followers, viral +10 and +2% followers. The gift is free in cash. `giveAway` books what the player paid in `openedPaid`, the same rule as a stream giveaway. The $5 minimum and the known-fake block stop a gift of bulk commons or of a fake (review m10). D-13 sets the story chance to 0.15 (the report's 25% made the gift a farm, sim section 4.6). Report 6.9 gives 25% and 5%. This is a D-13 tuning change that AJ approved through the decisions file.

### 7.3 Good stories cool open callouts

In `storiesEndDay()` at `M/Haggling.swift` L177-204, keep a local `var cool = 0.0`. Inside the `story.good` branch, add `cool += story.viral ? Balance.viralGoodStoryHeatCut : Balance.goodStoryHeatCut`. After L205 (`data.dealStories.removeAll`), add `if cool > 0 { coolCallouts(by: cool) }`.

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

The cooling happens after the story loop, on a local copy.

### 7.4 The record on new contacts (6.7)

In `promote(...)` at `M/Relationships.swift` L345-353, change the append:

```swift
        let start = max(0, points - recordPenalty)      // read before the append (the exclusivity trap)
        data.contacts.append(Contact(id: id, name: name, kind: kind, points: start, interests: interest.map { [$0] } ?? [],
                                     atLocalShows: true, atRegionalShows: true))
```

Each active record lowers the start by 5 points, with at most 3 records (−15). A record lasts 90 days. `seedContacts` starts every contact at 0, so the record has no effect there.

### 7.5 Sponsors pull back during a hot callout

In `advanceSocial()` at `M/Social.swift`, read the heat into a local before `var s = data.social` (L227), then block new offers in the roll at L249:

```swift
        let hot = hottestCallout                         // read first
        ...
        if tier >= 1, s.offers.count < 3, hot < Balance.calloutSponsorBlockHeat, Double.random(in: 0..<1) < sponsorChance {
```

Accepted deals stay. `advanceSocial` (L1150) runs before `calloutsEndDay`, so a callout that opens tonight blocks offers from the next night. That one-night lag is acceptable (review 5).

### 7.6 The crowd knows about a hot callout (review I5)

In `ShowSession`, add `private let heatAtOpen: Double`. In `init(venue:store:show:vendors:regulars:)` (L804), set `heatAtOpen = store.hottestCallout` next to the other `let` values. In `makeVisitor()` (L1050-1083), after `maybeProposeFlip(&visitor)` (L1081), add:

```swift
        if heatAtOpen >= Balance.calloutCrowdHeat, visitor.intent != .sell, Double.random(in: 0..<1) < Balance.calloutCrowdChance {
            visitor.patience = max(0, visitor.patience - 1)
            visitor.line = "Aren't you the one from that thread? " + visitor.line
        }
```

This changes no price. It shows the callout at the table, where the player spends time. The visitor code does not read `store.data` for each visitor.

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

Integration section 2, step 15: in `endDay()`, after L1167 (`lines += vendingEndDay()`), add `lines += calloutsEndDay()`. Part A's `rivalsEndDay()` runs next (step 16).

| Step before it | Reason |
|---|---|
| `storiesEndDay()` (L1154) | Good stories cool heat first. The random rival story can open a callout first. |
| `counterfeitsEndDay()` (L1158) | A public fake post opens its callout first. It skips decay tonight because `startDay == today`. |
| Part B `ripShipEndDay()` (step 11), `plugEndDay()` (step 13) | They record and retire acts before the roll. Their acts roll tonight (3.2). |
| `data.day += 1` (L1131) | All steps use the new day. |

The rent and game-over steps run after it. A callout cost never ends a run, because End Day moves only reputation, followers, and relationship points. "Make it right" moves cash, but only when the player taps it, and `replyBlock` checks `canAfford`. `settle` calls `banFromWhatnot`, which must not call `save()` (contract in 15).

### 8.3 The exclusivity checklist

`GameStore.data` is `@Observable`. A closure passed to a mutating call on `data.x` must never read `data.y`.

| Place | Rule |
|---|---|
| `exposeHiddenActs` loop | Works on the local `acts`. `pressure`, `heat`, `notor`, `today` are locals. |
| `exposeHiddenActs` `removeAll` | Reads only the locals `today`, `keep`, `maxDays`, `minWeight`. |
| `advanceCallouts` | Works on the local `open`. Part A hostility is a local dictionary. `removeAll` reads the local `endedIDs`. `settle` runs after the write-back. |
| `rivalCalloutsWeekly` | Copies `data.callouts` into `state`. `mapValues` reads the local `regain`. `state.rivalReceipts.removeAll` reads the locals `today` and `receiptDays`. It writes `data.callouts = state` before any rival roll. |
| `rivalCallout` | `data.hiddenActs.filter` is a read. The write to `exposed` comes after `startCallout`. |
| `startCallout` merge branch | The `firstIndex(where:)` closure reads only the local `pick`. |
| `retireHiddenAct` | The closures read only the parameter `id`. |
| `replyToCallout` | Calls Part B first, then a local copy `c` and one write at the end. |
| `loseCredibility` | Reads `credibility(key)` into `now` before the write. |
| `calloutRival` | `removeAll` reads only the local `used`. |
| `coolCallouts` | Local copy, one write. |
| `activeRecords` | Reads `data.day` into `today` before the `filter`. |
| `promote` | Reads `recordPenalty` into `start` before `data.contacts.append`. |
| `advanceSocial` | Reads `hottestCallout` into `hot` before the sponsor roll. |
| `ShowSession.makeVisitor` | Reads the stored `heatAtOpen`, not `store.data`. |
| Callers in Parts A and B | Never call `recordHiddenAct`, `retireHiddenAct`, `startCallout`, or `noteRivalReceipt` inside a closure that you pass to a mutating call on `data`. Collect into locals, then call. |

## 9. Constants

All constants go in one `extension Balance` block at the top of `M/Callouts.swift`, the same as every system file (for example `M/Haggling.swift` L6-50). The per-kind values of `HiddenActKind` stay as `switch` properties (1.1), the same as `VisitorType.flipWillingness` (`M/Shows.swift` L555-569). Values marked D-13 come from the sim.

| Constant | Value | Meaning |
|---|---|---|
| `calloutHeatKids` | 70 | Start heat, treatment of kids |
| `calloutHeatIntegrity` | 60 | Start heat, product integrity |
| `calloutHeatFairness` | 60 | Start heat, fair openings |
| `calloutHeatGreed` | 40 | Start heat, greed |
| `calloutHeatForbidden` | 50 | Start heat, forbidden product |
| `calloutHeatSmear` | 40 | Start heat, a baseless player callout |
| `calloutDecay` | 0.15 | Heat lost each night with no reply schedule |
| `calloutReplyHeat` | 20 | Heat from each reply by a named rival |
| `calloutEndHeat` | 5 | Under this heat, the callout ends |
| `calloutMaxDays` | 45 | A callout ends after this many days in all cases |
| `calloutMaxOpen` | 3 | Open callouts about the player, except forced ones |
| `calloutDenyTrueFactor` | 1.5 | Heat factor for a deny of a true callout |
| `calloutDenyFindOutReceipts` | 0.5 | Find-out chance on a deny, with receipts |
| `calloutDenyFindOutPlain` | 0.2 | Find-out chance on a deny, without receipts (design value) |
| `calloutDenyCaughtRep` | 8 | Reputation lost when a deny falls apart |
| `calloutDenyFalseRep` | 1 (D-13, was 3) | Reputation for a deny of a false callout |
| `calloutDenyFalseDays` | 2 | Days for a denied false callout to reach 0 |
| `calloutMakeRightDays` | 1 | Days for a made-right callout to reach 0 |
| `calloutGoodwillPerHeat` | 2.0 | Dollars per heat point when no act sets a refund |
| `calloutGoodwillMin` | 25.0 | Lowest goodwill payment |
| `calloutGoodwillMax` | 250.0 | Highest goodwill payment |
| `lateShipGoodwillShare` | 0.10 | Goodwill on a late order, share of the order price (D-4) |
| `lateShipGoodwillMin` | 5.0 | Lowest goodwill on a late order (D-4) |
| `calloutCounterHeat` | 30 | Heat added by a counter-callout |
| `calloutCounterFollowerShare` | 0.005 (D-13, was 0.02) | Followers gained by a counter-callout |
| `calloutCounterAuthenticity` | 0.05 | Authenticity lost by a counter-callout |
| `calloutCounterCredTrue` | 0.1 | Rival credibility lost, counter on a true callout |
| `calloutCounterCredFalse` | 0.3 | Rival credibility lost, counter on a false callout |
| `calloutCounterShopCost` | 10 | Shop standing lost when the player counters a game shop |
| `calloutViralPeak` | 70 | Peak heat for the viral bad story cost |
| `calloutBadPeak` | 30 | Peak heat for the bad story cost |
| `calloutViralAuthenticity` | 0.1 | Authenticity lost at a viral fade |
| (reused) `storyBadViralRep`, `storyBadRep`, `storyBadViralFollowerShare`, `storyViral`, `storyDelay` | 12, 4, 0.01, 0.2, 1...10 | `M/Haggling.swift` L32-47 |
| `calloutContactCost` | 15 | Points lost with the harmed contact on a true callout |
| `calloutRecordPeak` | 50 | Peak heat of a true callout that leaves a record |
| `calloutRecordDays` | 90 | Days a record lasts |
| `calloutRecordContactCost` | 5 | Start points lost by each new contact for each record |
| `calloutRecordMax` | 3 | Records that count at one time |
| `calloutBanPeak` | 80 | Peak heat of a true integrity callout, or a log palm, that bans Whatnot |
| `calloutBanDays` | 28...56 | Whatnot ban length for a product integrity callout |
| (Part B) `palmBanDays` | 56 | Whatnot ban length for a palm found through the log, the same as a caught palm |
| `calloutReceiptsDaily` | 0.15 | Daily chance that receipts appear on a true callout |
| `calloutReceiptsMinHeat` | 30 | Receipts appear only at this heat or more |
| `calloutReceiptsHeat` | 10 | Heat added when receipts appear |
| `calloutNoAccountHeat` | 0.5 | Start heat factor of a false rival callout for a player with no account |
| `calloutSponsorBlockHeat` | 60 | No new sponsor offers at this heat or more |
| `calloutCrowdHeat` | 50 | Heat at which show visitors mention the callout (I5) |
| `calloutCrowdChance` | 0.125 | Share of buyers and traders who mention it (I5) |
| `responseBurnout` | 0.05 | Burnout from one response post |
| `hiddenActNotorietyStep` | 0.1 | Discovery factor for each notoriety step |
| `hiddenActDailyCap` | 0.5 | Highest daily discovery chance |
| `hiddenActMinWeight` | 0.05 | Under this weight, the act leaves the log |
| `hiddenActMaxDays` | 90 | An unexposed act leaves the log after this many days |
| `hiddenActKeepDays` | 120 | An exposed act stays in the log for history |
| `witnessCap` | 3.0 | Highest witness factor |
| `rivalBreaksStory` | 0.33 | Chance that a rival, not the victim, posts a true callout |
| `rivalCalloutBase` | 0.008 (D-13, was 0.02) | Weekly base chance for each rival |
| `rivalCalloutHostility` | 0.06 | Weekly chance added at hostility 1.0 |
| `rivalCalloutTruth` | 0.4 | Chance a rival uses a real act when one fits |
| `rivalCalloutGap` | 14 | Days after any rival callout with a lower chance |
| `rivalCalloutGapFactor` | 0.25 | The chance factor during the gap |
| `rivalCredFloor` | 0.25 | Lowest rival credibility |
| `rivalCredWeekly` | 0.05 | Credibility a game shop gets back each week (Part A regains named rivals) |
| `rivalCredDenied` | 0.25 | Credibility lost when the player denies a false callout |
| `rivalReceiptDays` | 60 | Days a receipt against a rival lasts |
| `rivalReceiptGapDays` | 30 | At most 1 receipt from each rival in this many days (M6) |
| (Part A) `rivalReceiptChance` | 0.05 (D-13, D-10) | Receipt chance on a "rival took the stock" line |
| `shopRivalHostilityBase` | 0.2 | Hostility of a rival game shop at 100 standing |
| `shopRivalHostilityRange` | 0.5 | Hostility added at 0 standing |
| `dramaBaitGambling` | 0.15 | Drama bait from one gambling backlash |
| `dramaBaitMax` | 0.5 | Highest drama bait |
| `playerCalloutRep` | 1 (D-13, was 3) | Reputation for a player callout with proof, times credibility |
| `playerCalloutFollowerShare` | 0.005 (D-13, was 0.01) | Followers for it, times credibility |
| `playerCalloutFollowerMin` | 10 (D-13, was 50) | Lowest follower base for it |
| `playerCalloutCred` | 0.3 | Rival credibility lost to a player callout with proof |
| `playerCalloutHostility` | 0.2 | Named rival hostility added by a player callout or counter |
| `playerCalloutCooldown` | 28 (D-13, was 14) | Days between player callouts about one rival |
| `playerSmearAuthenticity` | 0.05 | Authenticity lost for a callout with no proof |
| `playerSmearCredGain` | 0.1 | Rival credibility gained when the player has no proof |
| `kidGiftMinValue` | 5.0 | Lowest market value of a kid gift (m10) |
| `kidGiftMaxValue` | 30.0 | Highest market value of a kid gift (the kid buyer cap, `M/Shows.swift` L1170) |
| `kidGiftStory` | 0.15 (D-13, was 0.25) | Chance of a good story from a kid gift |
| `goodStoryHeatCut` | 10 | Heat cut on open callouts from a good story |
| `viralGoodStoryHeatCut` | 25 | Heat cut from a viral good story |

**Rate for an honest player** (review m9, sim section 7). Part A seeds 3 flippers and 2 creators. With `rivalCalloutBase` 0.008 and hostility near 0.3, an honest player meets a false callout about every 8.5 weeks (6.1 a year), and the net reputation from all callouts is about +4.6 a year. A store owner also has the 2 game shops, so false callouts come more often. Each gambling backlash adds 0.075 a week for each creator after one halving. Tune with `-retailsim <days>` (D-16) after phase 6.

## 10. UI

### 10.1 New file `Social/CalloutViews.swift`

| View | What it shows | How the player reaches it |
|---|---|---|
| `CalloutCard(callout:)` | The type icon and label. The accuser name. The post text. A heat bar: `ProgressView(value: heat, total: 100)`, tinted `Theme.green` under 30, `Theme.orange` from 30, `.red` from 70 (`Theme` has no red; `.red` matches `Social/SocialViews.swift` L26). The reason line in `.caption` under the bar. A `Tag` "RECEIPTS" (`Theme.orange`) or "NO PROOF YET" (`Theme.muted`). The reply state ("You denied it · day 12"). A "Reply" button when `fallFrom == nil`. It never shows `truth`. | Inside `CalloutsSection` |
| `CalloutsSection()` | A `DetailBox(title: "Callouts")`: each open callout about the player, then the player's own open callouts about rivals, then the last 3 closed ones with their `outcome`. A `RecordBadge` at the top when a record is active. Empty: "Nobody is talking about you." | In `SocialHubView` and `CalloutsView` |
| `CalloutsView()` | A `ScrollView` with `CalloutsSection()` and, with an account, `RivalCalloutBox()`. Title "Callouts". Works with no account. | `AppRoute.callouts`, from the hub banner and the `ContactsView` row |
| `CalloutReplySheet(calloutID:)` | Four rows, one per `CalloutReply`. Each row has the label, one effect line, and the cost `makeRightCost(c)` from the 6.2 table (for a late order: "Ship it now and pay \(money(refund))"). A blocked row is disabled and shows the `replyBlock` text. A result line after the tap (with the proof line after a deny), and a "Done" button. | `.sheet(item:)` from the "Reply" button |
| `RivalCalloutBox()` | One row per named rival in `data.rivals` (name, kind, "Proof: n"). Game shops do not show. A "Call out" button with `playerCalloutBlock` as the disabled reason. A `confirmationDialog` before it posts. With no proof it says "You have no proof. The heat lands on you." | In `CalloutsView`, with an account |
| `RecordBadge()` | A `Tag` "BUSTED THREAD · 63 DAYS" in `Theme.orange`, with a caption: "New contacts start 5 points lower for each record." | In `CalloutsSection` and `ContactsView` |

Reply row text. It must not reveal the hidden truth.

| Reply | Effect text |
|---|---|
| Stay silent | "Let it fade. It loses 15% of its heat each night." |
| Deny | "Works if the claim is false. If it is true and people find proof, it gets worse." |
| Make it right | "Pay \(money(refund)). It ends tomorrow, and the damage is smaller." (late order: "Ship it now and pay \(money(refund)) for the wait.") |
| Counter-callout | "Hit back. You gain a few followers, but the heat goes up on both sides." |

Animation rules: animate the heat bar with `.animation(.easeOut(duration: 0.4), value: callout.heat)`. Use `withAnimation` on the sheet result line. Do not add a full-screen overlay, a white fill, a bright flash, or an opacity pulse on a light color. `Haptics.tick()` on a reply is enough feedback.

### 10.2 Changes to existing views

| File and place | Change |
|---|---|
| `App/AppNav.swift` L4-32 | Add `case callouts` to `AppRoute`. In `appDestinations()` near L93, add `case .callouts: CalloutsView()`. |
| `Hub/HubView.swift` after L158 (the messages banner) | For the first open callout about the player with `acknowledged == false`: `Banner(text: "\(store.name(of: c.accuser)) called you out. Heat \(Int(c.heat)). Tap to answer.", color: Theme.orange, icon: "megaphone")`, tap → `nav.path.append(.callouts)`. One banner at most. With more unanswered callouts, add " (\(count) open)". |
| `Hub/HubView.swift` L231-234 (reputation tile) | When `store.activeRecords` is not empty, the detail line reads "Busted thread · \(days) days". The tile still goes to `.contacts`. |
| `Hub/ContactsView.swift`, after the "Reputation" `DetailBox` (L32) | When callouts are open or a record is active: `RecordBadge()` and a `NavigationLink(value: AppRoute.callouts)` row "Callouts · \(n) open". This is the path for a player with no account (review m12). |
| `Social/SocialViews.swift` L28-29 | Insert `CalloutsSection()` before `inbox` when `!store.data.callouts.open.isEmpty || !store.activeRecords.isEmpty`. |
| `Show/ShowTableStage.swift` `DealButtons`, `.buy` case L189-195 | After `flipRow`: `if session.canGiveToKid { Button { withAnimation { session.giveToKid() } } label: { Text("Give it to them").frame(maxWidth: .infinity) }.buttonStyle(.bordered).tint(Theme.cyan) }` and a caption "Free. Once a day. Word can get around." |
| `Hub/HubView+Debug.swift` | `#if DEBUG` buttons: "Hidden act: shelf buyout", "Rival callout", "Expose all acts", and a read-only list of `data.hiddenActs` with weights. |

## 11. Save compatibility

- `GameData.hiddenActs` and `GameData.callouts` decode through `v(...)` with defaults. An old save has neither key, so it loads with an empty log and no callouts.
- `CalloutState` has its own `init(from:)` with one `decodeIfPresent` per field. `HiddenAct` and `Callout` have tolerant decoders in extensions (2.1), so a later field with a default never drops the array. An unknown `HiddenActKind` raw value still drops the whole log, so never rename or remove a case.
- `RivalKey`, `CalloutAccuser`, and `CalloutTarget` use synthesized `Codable` for enums with associated values. `LocalStore` is already `Codable` (`BadSale.shop`, `M/Counterfeits.swift` L64). `[UUID: Int]` encodes as a keyed list, which `Codable` reads back.
- `PostType.response` is a new raw value. A save from the new build does not open in an older build. That is the existing one-way rule.
- `ScamRecord` stays. Kid lowballs already in `data.scams` still come out through the old path. Only new kid lowballs use the log.
- `recordBadSale(sealed:)` is a defaulted parameter. No saved type changes.

## 12. Tests in `Hub/GameTests.swift`

The run is 136 checks in 2.8 s today. Part C adds one group with no full End Day, and extends `days()` and `seasonsAndSave()`. Register the group in `run()` after `timed("market", market)` (L37): `timed("callouts", callouts)`.

DEBUG helpers in `M/Callouts.swift`:

```swift
    #if DEBUG
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
    #endif
```

`callouts()` (no End Day; it calls `counterfeitsEndDay()` and `calloutsEndDay()` directly once each):

| # | Check | Rule |
|---|---|---|
| 1 | `fresh()`, a named rival `rid`. `testCallout(.greed, truth: true, heat: 40, accuser: .rival(.rival(rid)), refund: 40)`. Counter it. Check that `replyBlock(_, .deny)` is not nil. Make it right. Check: cash fell by exactly $40, and followers equal the count before the counter. | Money; the counter-then-deny and counter-then-make-right loops (M7) |
| 2 | `testCallout(.smear, ...)` with a rival accuser: `replyBlock(_, .counter)` is not nil. | The backlash loop (M7) |
| 3 | `testCallout(.kids, truth: true, heat: 75)`, make it right, `testSettle`. Check: `repApplied == 6`, `activeRecords.count == 1`. Then `promote(name: "Record Test", kind: .collector, interest: nil, points: 20)` starts at 15. | Half cost; the record decision; 6.7 |
| 4 | Fill the cap to 3 with `testCallout`. A 4th non-forced `testCallout` returns nil and the count stays 3. `startCallout(..., force: true)` makes it 4. | D-7, M5 |
| 5 | `lowballKid(makeShopEncounter(.castle, kind: .kidWithHit)!)`: `data.scams.count` does not change, and one `.lowballKid` act exists. | Double penalty (kid) |
| 6 | `forcePublicScam = true`. Append a `BadSale(item: "Test", channel: "eBay", price: 100, known: true, refunds: true, dayFound: store.day)` and call `counterfeitsEndDay()`. Check: reputation fell by exactly 40, followers did not change, one new callout has `repPaid == true`. `testSettle` it: `repApplied == 0`. Reset `forcePublicScam = nil`. | Double penalty (fake post, M1) |
| 7 | `recordBadSale(item: "Test box", channel: "eBay", price: 80, fake: .convincing, known: true, refunds: true, sealed: true)` 20 times. Every call adds either one `BadSale` or one `.sellResealed` act, never both. | Double penalty (resealed, M2) |
| 8 | Kid gift: `addTestCard` with market from $5 to $30, `showItems`, a league night `ShowSession` as in `opportunities()` (L298-299), `testSeat` a `.kid` buyer `Visitor` for it. `giveToKid()`. Check: the card left `data.raw`, cash did not move, `openedPaid` rose by its `paid ?? 0`, and `canGiveToKid` is false for a second kid. | Items |
| 9 | Late order (needs phase 5): append a ripped `RipShipOrder` the way Part B's "late order" test builds one. Record its act with `revealDay: store.day` and call `calloutsEndDay()`. Then `refundRipShipOrder(id, reason: .chargeback)`. Then make it right. Check: exactly one ledger refund entry for the order (the Whatnot one), and the make-it-right entry equals `lateGoodwill(price)`. | B3, D-4 money |

Extend existing groups:

| Group | Change | Rule |
|---|---|---|
| `seasonsAndSave` near L621 | After the decode check: `check(loaded.hiddenActs == store.data.hiddenActs && loaded.callouts == store.data.callouts, "a save and a load lost callouts")`. Then remove the `hiddenActs` and `callouts` keys with `JSONSerialization`, decode again, and check that both are empty. | Old saves load (saves broke before) |
| `days()` L658-722 | Before the loop: one forced act (`recordHiddenAct(.shelfBuyout, weight: 1, note: "test", revealDay: store.day + 1)`), one `.lowballKid` act (weight 2, witnesses 50), one `.unshippedOrder` act, a false `testCallout(.greed, heat: 40)` denied at once, one `RivalReceipt` with `day: -100`, and one good `DealStory` due tomorrow. After the loop: exactly one callout (open or closed) has the forced act's `actID` and `truth == true`; the denied false callout closed with `repApplied == 0`; no open callout has heat outside 0...100; the old receipt is gone. | First-night rule; deny cost; it reaches every new End Day step and closure, so it catches an exclusivity crash ("Fatal access conflict"), which broke before |

Run `-test` after each build step. Use `-retailsim <days>` (D-16) for rates, not the test.

## 13. Doc updates

| Doc | Change |
|---|---|
| New `docs/35-callouts.md` | The full rules: the hidden log and its 14 kinds, discovery and the first-night rule, the callout object, heat, the four replies and the 6.4 table, the "make it right" table (6.2), rival callouts and credibility, receipts and their limits, player callouts, the record, the kid gift, the crowd line, the sponsor block, and a Values table copied from section 9. |
| `docs/06-social-media.md` L105-117 (Consequences) | A "Callouts" bullet: a callout has a type, heat, and a reply. A player with no account still gets callouts and can stay silent or make it right. Deny and counter need an account. A sold fake that goes public is now a callout (the 5% follower loss becomes 1% at a viral fade). Add the "Response" post type to L28-35. Add the sponsor block to L119-133. |
| `docs/21-relationships-and-reputation.md` L153-182 | "What lowers it": a callout that fades (−4 at peak 30 to 69, −12 at 70 or more), a deny that falls apart (−8). "What raises it": a deny of a false callout (+1), a callout of a rival with proof (+1 at full credibility). A short "The record" paragraph: 90 days, new contacts start 5 points lower for each record, at most 3, and "make it right" does not remove it. Under "Fair dealing" L137-151: a kid lowball is now a hidden act that can become a kids callout. |
| `docs/30-haggling-and-deal-reputation.md` L151-155 and L274-280 | The bad branch of the random story is now a named rival's callout. Remove "Answer a bad story with a post" from "Not in this change" and point to docs/35. The kid gift story: 15% a story, 3% viral, the same values. A good story lowers open callout heat by 10, or 25 when viral. |
| `docs/28-messages-and-encounters.md` L43-55 | The kid lowball at a game shop now goes into the hidden log. A callout shows as a hub banner, not as a message. |
| `docs/32-short-form-video.md` L119-121 and L294-302 | The gambling backlash adds drama bait for rival creators. Pack battles stay out of scope. |
| `docs/04-reputation-and-followers-unlocks.md` L66-77 | Reputation also falls through callouts and rises through a good reply. Followers move with a counter-callout (+0.5%) and a viral fade (−1%). |
| `docs/14-counterfeit-risk.md` (Consequences) | A public post about a sold fake is a product integrity callout. A known fake or resealed product that the buyer did not find can still come out later. |
| `docs/20-card-shows.md` L57-131 | "Give it to them" for a kid buyer: free, once a day, items from $5 to $30, no known fakes. At heat 50 or more, some buyers mention the thread and have 1 less patience. |
| `docs/19-prototype-values.md` | A "Callouts" section with the values of section 9. Update "Counterfeits" (L325-338) for the public post change. |

## 14. Interactions, risks, and decisions

### 14.1 Risks

| Risk | Answer in this plan |
|---|---|
| An honest player never meets a callout. | Rivals post false callouts without any hidden act (4.1, 4.3), about every 8.5 weeks. |
| A callout is unwinnable. | "Make it right" ends any callout in one night. Its cost is the 6.2 table, at most $250 for a false callout. If the player cannot pay, heat 40 to 100 fades in 13 to 19 days. The worst fade cost is −12 reputation, −1% followers, a record, and for integrity or a log palm, a ban. No callout ends a run. |
| A player with no account has no reply. | "Stay silent" and "make it right" need no account. False rival callouts start at half heat. The `ContactsView` row keeps the list in reach. |
| A double penalty for one act. | Kid lowball: one path. Sold fake that goes public: one reputation cost, one contact cost (M1). Resealed sale: an act only when the buyer did not find it (M2). Caught palm: Part B bans and forces a callout with no act. Log palm: one ban at most here. Plug seizure: one act (`plugSeized`), the purchase act retired. |
| A late order paid twice. | "Make it right" pays only the 10% goodwill sum. Part B's `refundRipShipOrder` is the only path that pays the order price, and it does nothing on a refunded order (D-4). |
| Saturation: new acts cost nothing at the cap. | A full cap adds the heat to an open callout (D-7). The peak rises, so the fade cost and the record follow. |
| Farms. | Receipts limited and rare; gains scaled by credibility; counter and deny exclusive; no counter on `.smear`; counter gain taken back; kid gift needs $5 or more and is once a day at 15%. Sim tuned: farmer +65 reputation and +1,082 followers a year, before the 30-day receipt limit. |
| Callouts change prices. | No code in this plan reads or writes a market price, a graded price, `priceBoosts`, or `marketFactor`. |
| Challenge cash. | "Make it right" uses `addLedger` on the one cash balance. |
| Rejected features. | No slab cracking, no Japanese product, no preorders or new sets, no group breaks. |
| Real names. | Rival names come from Part A (fictional). Part C adds only generic accusers and the existing fictional game shops. |
| The `-test` run slows down. | `callouts()` runs no full End Day. The new `days()` seeds reuse its 14 days. |

### 14.2 The two open points (decided)

**The kid lowball cost.** The old path cost an expected −10.5 reputation (35% × −30) and −30 shop points. The new path costs an expected −6.4 reputation (53% × −12), or −3.2 after "make it right". **Decision: keep the report 6.6 costs.** Reasons: (1) report 6.6 sets the fade cost of every callout, and AJ approved it; (2) the new path adds costs that the old path did not have: a 90-day record (every true kids callout starts at 70, so it always leaves one), −1% followers, −0.1 authenticity, and −15 shop points; (3) "make it right" pays the kid the fair price gap, which the old path never did. The lower reputation number is the price of one consistent rule. AJ can raise `calloutContactCost` for kids, or give `.kids` its own fade cost, after a `-retailsim` run.

**No record after "make it right".** Revision 1 waived the record. **Decision: remove the waiver. The record applies as report 6.7 says.** Reasons: (1) the report does not waive it, and AJ approved the report; (2) real "busted" threads stay up after a refund; (3) "make it right" still has value: half the reputation, no follower or authenticity loss, and a heat fall in one night, which keeps most greed callouts (start 40) under the record peak of 50.

### 14.3 Not built, and why

- **Per-audience reputation.** The approved report keeps one reputation number. A later change can add it with no change to the callout object: give `CalloutType` an `audience` property and replace the `addReputation(-rep)` call in `settle`.
- **Improvement I4 (a hard deal with a kid becomes a kids callout).** Declined. A kid buyer pays at most `min(market × 0.95...1.15, 30)` (`M/Shows.swift` L1170), and `Haggle.grade` gives `.hard` on a sale only when `share > 1.15` (`M/Haggling.swift` L94). So a hard sale to a kid cannot happen, and the code would never run. I adopted I5 as the fourth improvement in its place.

## 15. Contracts with Parts A and B

### What Part C reads or calls from Part A

| Item | Shape | Used in |
|---|---|---|
| `data.rivals: [Rival]` | `id: UUID`, `name`, `kind: Rival.Kind` (`.flipper`, `.creator`), `hostility`, `credibility` | 2.2, 4.1, 5.1, 3.2 |
| `data.flipperPressure`, `data.scalperHeat` | Doubles | 3.2 |
| `rival(_:)`, `rememberRival(_:_:note:byPlayer:hostility:)`, `changeRivalCredibility(_:by:)`, `adjustRivalHostility(_:_:note:kind:)` | Integration 1.3 and Part A 2.3. Phase 0 (D-9). | 2.2, 2.3, 5.2, 6.2, 7.1 |
| Weekly credibility regain for named rivals | In `rivalsEndDay()` (step 16) | 4.1 |
| Calls into Part C | `recordHiddenAct` with the 1.4 weights for `shelfBuyout` (D-1 rule), `limitEvasion`, `botCheckout`, `storeBan`, `botOrderCancelled`; `noteRivalReceipt(rival.id, note:)` at `rivalReceiptChance` 0.05 from the model line (D-10), and when the player finds a fake bought at a rival's show table (I3) | 1.4, 7.1 |

### What Part C reads or calls from Part B

| Item | Shape | Used in |
|---|---|---|
| `RipShipOrder.shipped`, `RipShipOrder.refunded` (D-4), `data.ripShip.orders` | Bools | 6.2 |
| `shipRipShipOrders(_ ids: [UUID]) -> String?` (Part B L2430) | `nil` on success. Spends 10 minutes. | 6.2 |
| `palmRefundDue(_ orderID: UUID) -> Double` (Part B L2694) | `order.refunded ? order.palmedValue : order.price + order.palmedValue` | 6.2 |
| `returnPalmedCards(_ orderID: UUID)`, `Balance.palmBanDays` (56) | Part B | 5.2, 6.2 |
| `refundRipShipOrder(_:reason:)` | The only function that pays an order price back. Does nothing when `refunded`. | Tests |
| `banFromWhatnot(days:reason:)` | Extends to the later end day. **Must not call `save()`** (review m16), because `settle` runs inside End Day. | 5.2 |
| `Balance.ripShipShipMinutes` | 10.0 | 6.2 |
| Calls into Part C | `recordHiddenAct` with the 1.4 weights; `retireHiddenAct(act, force: true)` in `shipRipShipOrders` and `refundRipShipOrder`; on a seizure, `recordHiddenAct(.plugSeized, ..., revealDay: data.day + 2)` and `retireHiddenAct(order.actID)` for the purchase act; `startCallout(.fairness, truth: true, receipts: true, heat: 90, accuser: .person(buyer), text:, force: true, actKind: .palmedHit, sourceID: order.id, refund: order.price + card market)` in `settlePalm` | 1.4, 2.3, 6.2 |

### Contract changes that Parts A and B must make in revision 2

**Part A**

1. Pass the 1.4 weights and witnesses. Drop the heat-sized weights.
2. Record `shelfBuyout` only under D-1.
3. Call `noteRivalReceipt` from the model line (D-10) at 0.05. Do not call it from a view.
4. Build the show-table buy from a rival and call `noteRivalReceipt` on a found fake (I3).
5. Put `rival`, `rememberRival`, `changeRivalCredibility`, and `adjustRivalHostility` in phase 0 (D-9).
6. Regain named rival credibility weekly in `rivalsEndDay`. Part C regains only game shops.

**Part B**

1. Add `shipped` and `refunded` to `RipShipOrder` (D-4).
2. Change both `retireHiddenAct` calls to `force: true`.
3. On the day-7 chargeback, re-record the late act at weight 2.0 only when `retireHiddenAct(..., force: true)` returns `false`.
4. Add `func returnPalmedCards(_ orderID: UUID)`. It moves every palmed card that the player still holds out of inventory, to the buyer. Add it as a phase 0 stub (D-9).
5. Set the palm act and the `settlePalm` callout refund to `order.price + card market` (D-6). Pass `force: true`, `actKind: .palmedHit`, and `sourceID` in `settlePalm`.
6. On a plug seizure, record `plugSeized` with `revealDay: data.day + 2` and retire the order's `plugPurchase` act. Do not call `exposeHiddenAct` for it.
7. Remove `save()` from `banFromWhatnot`.

### `-retailsim` column

Phase 6: in `RetailSim.init`, append the `callouts` column (open callouts, true and false this week; Part A 7.2).
