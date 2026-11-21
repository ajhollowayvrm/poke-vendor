# Review: Part C (callouts) and the integration file

Reviewer: Rei (Tactical). Date: 2026-11-20.
Scope: `docs/proposals/sealed-product/part-c-callouts.md`, `docs/proposals/sealed-product/00-integration.md`, and the contract sections of Part A (0, 2.3, 10) and Part B (1, 6, 11).
Code: `app/PokeVendor` at `a7dd1dd`. The Swift code is the same as `503ff3c`. `M/` = `app/PokeVendor/Model/`.
Rates: computed with a script from the plan constants (formula in Part C 3.1).

## Verdict

**block.** The design is sound. Three contract holes stop the build or move money twice. Fix the 3 blockers and the 9 major items before phase 0.

| Severity | Count |
|---|---|
| Blocker | 3 |
| Major | 9 |
| Minor | 18 |

## 1. Citation check

Most citations are correct. I read each one in the code.

**Correct:** `GameData` fields and decoder (`M/GameStore.swift` L140, L145-235, `shorts` at L233). `endDay()` anchors L1125, L1131, L1135-1136, L1142, L1145, L1150, L1153-1167, L1168-1197. `PostType` (`M/Social.swift` L5-17, 8 cases). `contentQuality` (L133-143). It is the only `switch` over `PostType`. The new post sheet lists its types by hand (`Social/SocialViews.swift` L284). `advanceSocial` (`var s = data.social` L227, sponsor roll L248). `DealStory` (`M/Haggling.swift` L65-71). Story constants (L32-49). Random story (L171-176). `dealStories.removeAll` (L205). `ScamRecord` (`M/Relationships.swift` L148-153). `promote` (L345-353). `recordScam` (L370-375, 35%, 3-20 days). Scam reveal (L556-564, `scamReputationCost` = 30). `lowballKid` (`M/ShopEncounters.swift` L138-147, `recordScam` at L145). `recordBadSale` (`M/Counterfeits.swift` L320-327, `guard` at L324). Public post branch (L347-356). `notoriety` (`M/Messages.swift` L60). `LocalStore.isGameShop` (`M/LocalStores.swift` L8). Kid buyer cap (`M/Shows.swift` L1170). `score(...)` (L1819-1823). `ShowSession.weighted` (L1355, `static`). `decline()` (L1894). `testSeat` (L1924). Gambling backlash (`M/Shorts.swift` L318-322). `addLedger(_:_:_:pending:)` (`M/GameStore.swift` L355, `@discardableResult`). `AppRoute` (`App/AppNav.swift` L4-32). Hub messages banner (`Hub/HubView.swift` L152-158). Reputation tile (L231-234). `DealButtons` `.buy` case (`Show/ShowTableStage.swift` L189-195). `GameTests.run()` `timed("market", market)` (L37), `seasonsAndSave` (L607, decode at L621), `days()` (L658). Insurance covers only `inHand` (`M/Losses.swift` L53-67). `isHot` (`M/WholesaleAccount.swift` L37-40).

**Wrong or missing:**

| # | Plan text | Fact | Evidence |
|---|---|---|---|
| C1 | Part C 7.2: "Both existing call sites keep working" (`giveAway`) | There is one call site. | `M/LiveStream.swift` L225 |
| C2 | Part C 10.1: heat bar tint `Theme.red` | `Theme` has no `red`. It has `muted`, `cyan`, `green`, `orange`. Part A 2.3 has the same error. | `Support/Support.swift` L7-14 |
| C3 | Integration 4.2: `s.isOpen`, `isInStore($0.status)` | `CardStoreState` has no `isOpen`. `isInStore` is `static`, so the call needs `Self.isInStore`. | `M/CardStore.swift` L94-126, L324 |
| C4 | Integration 4.1: `StandingLevel(points:) >= .regular` | `StandingLevel` is not `Comparable`. The code compares `.rank`. | `M/LocalStores.swift` L62; `M/Relationships.swift` L546 |
| C5 | Integration 1.3: "`Accuser.rival(String)`" | The enum is `CalloutAccuser`. | Part C 2.1 |
| C6 | Integration header: "Parts B and C: `docs/34-callouts.md` is now `docs/35-callouts.md`" | Part C L1408 still says "docs/34" two times. | `part-c-callouts.md` L1408 |
| C7 | Part B 6.1: `advanceSealed()` at L1144 | It is at L1145. | `M/GameStore.swift` L1145 |
| C8 | Integration section 2, step 2 | The table leaves out `demandEndDay()` (L1133). Step 1 leaves out `jobEndDay` (L1124) and `shortsEndDay` (L1126). No order error results, but the anchors are incomplete. | `M/GameStore.swift` L1124-1134 |

## 2. Blockers

### B1. Game-shop rivals have no ID and no credibility after integration 1.3

- **Plan:** Integration 1.3 changes `RivalView.id` to `UUID`, deletes `CalloutState.rivalCredibility`, and reads credibility from `Rival.credibility`.
- **Evidence:** Part C `rivalPool()` (4.1) adds the two game shops with `id = "shop:\(shop.rawValue)"`. `replyToCallout` (6.2) calls `loseCredibility("shop:\(shop.rawValue)", ...)`. A game shop is a `LocalStore`, not a `Rival`, so it has no `UUID` and no `credibility` field. The code does not compile. If you force it to compile, shop credibility never falls, so the report 6.5 rule ("the rival loses credibility") fails for shops.
- **Fix:** Give `RivalView` a key type, and keep one small dictionary for shops:

```swift
enum RivalKey: Codable, Hashable { case rival(UUID), shop(LocalStore) }
struct RivalView { let key: RivalKey; let accuser: CalloutAccuser; let hostility: Double; let credibility: Double; let creator: Bool }
// CalloutState: keep only the shop part of the old dictionary.
var shopCredibility: [String: Double] = [:]      // by LocalStore.rawValue, with its decoder line
func credibility(_ k: RivalKey) -> Double {
    switch k { case .rival(let id): rival(id)?.credibility ?? 1
               case .shop(let s): data.callouts.shopCredibility[s.rawValue] ?? 1 }
}
```

  Move the weekly shop regain into `rivalCalloutsWeekly` (Part A regains only `Rival`). Also change `playerCalloutDay: [String: Int]` to `[UUID: Int]`, and `calloutRival(_:)`, `playerCalloutBlock(_:)`, `CalloutTarget.rival`, and `RivalReceipt.rivalID` to `UUID`. Integration 1.3 lists only some of these. State that the player cannot call out a game shop, and hide shops in `RivalCalloutBox`.

### B2. Phase 0 stubs do not cover the calls in phases 2, 4, and 5

- **Plan:** Integration section 7, phase 0 stubs `HiddenAct`, `HiddenActKind`, `CalloutState`, `Rival`, and an append-only `recordHiddenAct`.
- **Evidence:**
  - Phase 2 builds Part A 1.2. Part A L614-615 calls `rivalAt(store)` and `rememberRival(...)`. Part A L663 calls `store.soldOutLine(item, at:)`. All three are in Part A 2.3, which is phase 6.
  - Phase 4 builds the plug. Part B L1473 calls `exposeHiddenAct(act, inDays: 2)`.
  - Phase 5 builds Rip & Ship. Part B L1818 and L1859 call `retireHiddenAct`. Part B L2072 calls `startCallout`.
  - Each phase must end with `-test`, so each phase must compile.
- **Fix:** Add these to phase 0: `retireHiddenAct(_:)` (real code, it is 1 line), `exposeHiddenAct(_:inDays:)` (real code, 4 lines), `startCallout(...) -> String?` returning `nil`, and `noteRivalReceipt(_:note:)` as a no-op. Move the Part A 2.3 types and API (`Rival`, `RivalMemory`, `seedRivals`, `rival`, `rivalAt`, `rememberRival`, `changeRivalCredibility`, `soldOutLine`) into phase 2. Leave `rivalsEndDay`, the show rival, and the UI in phase 6.

### B3. A late Rip & Ship order can be refunded two times

- **Plan:** Integration 1.7 says "make it right" calls `refundRipShipOrder(sourceID)` when the order is open, "otherwise it pays the act's `refund`", and "the refund retires the act, so it cannot pay twice". Part B 11.2 item 2 makes the same claim.
- **Evidence:**
  - Part B `ripShipEndDay` records `.unshippedOrder` with `refund: o.price` (Part B L2122). Whatnot refunds the order at 7 days (L2127).
  - The act rolls at 0.24 a day (0.20 × notoriety 2). It rolls on nights 4, 5, and 6. So about 56% of late orders become a callout before the day-7 refund.
  - `retireHiddenAct` removes only unexposed acts: `removeAll { $0.id == id && !$0.exposed }` (Part C 1.3). The open callout keeps `refund = order.price`.
  - After the Whatnot refund, `refundRipShipOrder` returns `""` for a `.refunded` order (Part B L1809). Integration 1.7 then falls back to the act's `refund`. The player pays the buyer a second time.
- **Fix:** Add one Part C function, and call it from `refundRipShipOrder` and from `shipRipShipOrders`:

```swift
/// The source of a true callout was settled elsewhere (refund or late ship). The callout starts to end.
func settleCalloutSource(actID: UUID, shipped: Bool) {
    guard let i = data.callouts.open.firstIndex(where: { $0.actID == actID }) else { return }
    let today = data.day
    var c = data.callouts.open[i]
    c.refund = 0                         // nothing left to pay; "make it right" is now blocked
    c.madeRight = true                   // half cost at fade, no record (6.5 make-right row)
    c.fallFrom = c.heat; c.replyDay = today; c.fallEndDay = today + (shipped ? 2 : 1)
    c.reason = shipped ? "You shipped it late. The buyer posted an update." : "Whatnot refunded the buyer."
    data.callouts.open[i] = c
}
```

  In `replyBlock`, return "The buyer already got their money back." when `c.refund == 0 && c.actID != nil`. Do not use the goodwill fallback for an act with a `sourceID`.

## 3. Major findings

### M1. A sold fake that goes public is punished twice

- **Plan:** Part C 3.3 (row 4) and integration D5. Keep the −40 reputation and the −20 contact points (L337-346). Replace the public post with `startCallout(..., contactID: sale.contactID, ...)`.
- **Evidence:** `counterfeitsEndDay` already applies `fakeSoldReputationCost` (40) and `fakeSoldContactCost` (20) (`M/Counterfeits.swift` L337-338). The new callout starts at heat 75 for a known fake, so it fades at the viral cost: −12 reputation, −1% followers, −0.1 authenticity. `settle` then takes `calloutContactCost` (15) from the same contact and leaves a 90-day record (truth, peak ≥ 50). Today the public post adds only −5% followers and −0.1 authenticity. The plan adds −12 reputation, −15 points, and a record for the same event.
- **Fix:** Pass `contactID: nil` to this `startCallout`, because the contact cost is already paid. Add `var repPaid = false` to `Callout` and set it here. In `settle`, skip the fade reputation when `repPaid` is true. Keep the follower and authenticity loss and the record. That gives one reputation cost and one contact cost for one sale.

### M2. The resealed-sale and fake-sale acts disagree on timing

- **Plan:** Integration 1.1 says that `recordBadSale` has "one branch for both cases".
- **Evidence:** Part B 11.2 records `.sellResealed` "before the find-out roll". Part C 3.3 records `.counterfeitSold` only when the roll fails (the `guard` at `M/Counterfeits.swift` L324). If you follow Part B, a buyer who finds a resealed box costs −40 at once (L337), and the same sale can come out again later as a callout. `recordBadSale` has no `sealed` parameter today, and there are 19 call sites (`grep -rn "recordBadSale("`). The integration file does not say which call sites pass `sealed: true`.
- **Fix:** One rule for both kinds: record the act only in the `else` of the find-out roll.

```swift
let found = Double.random(in: 0..<1) < chance
if !found {
    if known { recordHiddenAct(sealed ? .sellResealed : .counterfeitSold, weight: max(0.5, min(2, price / 100)),
                               note: "\(item) on \(channel)", contactID: contactID, refund: price) }
    return
}
```

  List the sealed call sites: `M/LiveStream.swift` L455, `M/Opportunities.swift` L308, `M/Vending.swift` L413, `M/CardStore.swift` L623, `M/Lots.swift` L149, `M/Shows.swift` L1433/L1452/L1800/L2153 (when `item.kind == .sealed`), and `M/Meetups.swift` L169 (check the item).

### M3. Part A records weights that are up to 6 times the Part C guidance

- **Plan:** Part C 1.4 (weights) and integration 1.1 (owners). Part A 0.6 sets weight = heat added.
- **Evidence:** Part A uses `botCheckout` weight 3 (Part C guidance: 0.5), `limitEvasion` 2, `storeBan` 5 (clamped to 3), and `botOrderCancelled` 4 (clamped to 3). Part A uses the 3-argument call, so `witnesses` is always 0 (Part C guidance for a shelf buyout: 5). Computed total discovery per act (notoriety 2, pressure 0.5, heat ≥ 10):

| Act | Part A weight | Discovery | With Part C weight | Discovery |
|---|---|---|---|---|
| `botCheckout` (each use) | 3 | 76% | 0.5 | 20% |
| `limitEvasion` | 2 | 59% | — | — |
| `storeBan` | 3 (from 5) | 100% | — | — |

  A player who uses the bot on 4 drops opens about 3 greed callouts. That fills the cap of 3, so the cap blocks other callouts.
- **Fix:** Add one table to integration 1.1 that both parts obey: `shelfBuyout` 1.0 with witnesses 5 at a big store, `limitEvasion` 1.0, `botCheckout` 0.5, `storeBan` 1.5, `botOrderCancelled` 0.5 with witnesses 0. Part A passes these numbers. They are not the heat values.

### M4. An honest limit buy becomes a secret

- **Plan:** Part A 0.6: `shelfBuyout` is "a hot buy that uses up the chain limit". Integration 1.1 confirms it.
- **Evidence:** Part A limits hot items to 1 or 2 for each buyer. So each hot buy at the limit is a normal, honest buy, and each one records a greed act. Discovery is 25% for each act (weight 1, no witnesses, pressure 0.5, heat 0). A player who buys 4 hot items a month at the limit gets about one greed callout a month, and each costs −4 reputation. The report 6.2 lists "scalper heat of 10 or more" as the greed secret, not a limit buy. Part C's own words are "took a whole hot shelf".
- **Fix:** Record `shelfBuyout` only when the buy takes the last unit of a batch. Part A already detects this case at L614 (`shelfLeft(item) == 0`, memory `.playerTookShelf`). A limit buy on a full shelf records nothing.

### M5. The open cap drops forced callouts and their penalties

- **Plan:** Part C 2.3 `startCallout` returns `nil` when 3 callouts are open. Part B `settlePalm` (L2072) and Part C 3.3 (fake public post) depend on it.
- **Evidence:** When the cap is full, a caught palm gets no callout. Part B says the buyer is paid only through "make it right" (L2080), so the buyer is never paid. A public fake post loses its follower cost, because the plan removed the inline loss. The cap exists to stop a flood of rolled callouts, not to waive a penalty.
- **Fix:** Add `force: Bool = false` to `startCallout`. `guard force || open.count < Balance.calloutMaxOpen`. Pass `force: true` from `settlePalm`, from the public fake post, and from a `revealDay` act.

### M6. Player callouts with proof are a reputation and follower farm

- **Plan:** Part C 7.1 and integration 1.3. Part A calls `noteRivalReceipt` with a 30% chance "on each 'a rival already cleared this shelf' line". Each denied false callout also adds a receipt (6.2). The player can call out each rival every 14 days for +3 reputation and +max(50, 1% followers).
- **Evidence:** Shelf receipts come from normal store runs. That is common. With 3 rival flippers, the player can post 3 callouts every 14 days. That is about +230 reputation a year (the tiers are 50/150/350/700, `M/Relationships.swift` L174) and about +1% followers for each post, which compounds. Each callout also adds +0.2 hostility, so rivals post more false callouts. Each false callout gives one more receipt when the player denies it. The integration file does not name a call site for `noteRivalReceipt`. `soldOutLine` is a view helper (Part A L663), so a call there changes state during a view update and runs on each render.
- **Fix:**
  1. Take a receipt only from rival wrongdoing: a denied false callout, or a bot haul seen at a camp bust (Part A L1476-1478, `camp(_:)`). A rival who buys a shelf does nothing wrong, so it gives no receipt.
  2. Allow 1 receipt per rival per 30 days. Keep a `lastReceiptDay` per rival.
  3. Scale the gain by the rival's credibility: `rep = Int((Double(Balance.playerCalloutRep) * credibility(id)).rounded())`. A rival that nobody believes is worth little to expose.

### M7. Counter-callout combinations give free followers

- **Plan:** Part C 6.2 `replyBlock` and `replyToCallout`.
- **Evidence:**
  - (a) Counter, then deny, on a false callout. After the counter, `c.reply == .counter`, so the deny check passes. The deny sets `fallFrom`, and `settle` treats the callout as free. The net result is +2% followers and +3 reputation for −0.05 authenticity.
  - (b) Counter on the backlash to a baseless player callout. That callout is `.smear` with accuser `.rival`, so counter is allowed. The player gets +2% followers for the price of the goodwill payment (about $140) and −6 reputation.
  - (c) Counter, then make it right, on a true callout. `madeRight` removes the follower loss, so the +2% stays.
- **Fix:** In `replyBlock`:

```swift
case .deny:   if c.reply == .counter { return "You already hit back. A denial now looks weak." }
case .counter: if c.type == .smear { return "You started this one. You cannot counter it." }
```

  In the `.makeRight` branch, take back the counter gain when `c.reply == .counter`. Store the gain on the callout as `counterGain`.

### M8. The store break-in happens too often for the loss it causes

- **Plan:** Integration 4.2 constants.
- **Evidence:** The daily chance is `min(0.02, 0.002 × (1 + value / 10_000))`.

| Sealed value in the store | Break-ins a year | With cameras |
|---|---|---|
| $5,000 | 1.1 | 0.4 |
| $20,000 | 2.2 | 0.9 |
| $50,000 | 4.4 | 1.8 |
| $100,000 or more | 7.3 | 2.9 |

  Each break-in takes the 2 to 6 most valuable sealed items. With Part B cases, that is $10,000 to $30,000 at one time. No insurance covers it (`M/Losses.swift` L53-67). The real Tacoma case is a rare event. At these numbers, the break-in makes the Part B back room a loss, and the player has only one fix (cameras).
- **Fix:** Use `storeBreakInBase = 0.0003`, `storeBreakInMax = 0.003` (about 1 a year at the cap), and camera factor 0.5. Cap the loss at `max(1_500, 0.15 × value)`. Take items in value order until the cap. Also take cards in the store: `storeStock.cards` (`M/CardStore.swift` L329-331). Then `payConsignedTheft` has an effect. Today it gets only sealed IDs, so it always returns 0. Require `data.day >= s.openDay` in place of `isOpen`. Add `#if DEBUG static var forceBreakIn: Bool?` for the test, as Part B does for the palm.

### M9. The opened-at-MSRP item has no single sell guard

- **Plan:** Integration 4.1: "Add one guard in the shared `canSell`-style check, so a new path cannot skip it."
- **Evidence:** No shared sell check exists. A grep finds no `canSell`, `sellable`, or `isFree` on `SealedItem`. Sealed items leave inventory through separate filters: `stockable` (`M/CardStore.swift` L334), the show load (`M/Shows.swift` L192), listings, lots (`M/Lots.swift` L149), vending (`M/Vending.swift`), the sealed collector offer (`M/Opportunities.swift` L308), trades at shows (`M/Shows.swift` L2153), stream items and giveaways (`M/LiveStream.swift` L225, L455), and case splits. If one path is missing, the player flips the MSRP item, and that is the exploit this feature exists to stop.
- **Fix:** Add one property and use it in each of those filters. List each filter in the integration file:

```swift
extension SealedItem { var isTradable: Bool { mustRip != true } }
```

  Add a test check for each path that the test can reach cheaply: store stock, the show load, and the sealed collector offer.

## 4. Minor findings

| # | Plan section | Issue | Fix |
|---|---|---|---|
| m1 | Part C 10.1, Part A 2.3 | `Theme.red` does not exist (C2). | Use `.red`, as `Social/SocialViews.swift` does (`.tint(.red)`), or add `Theme.red`. |
| m2 | Integration 4.2 | `isOpen` and the `static` `isInStore` (C3). | `Self.isInStore`; `data.day >= s.openDay`. |
| m3 | Integration 4.1 | `StandingLevel` comparison (C4). | `StandingLevel(points: p).rank >= StandingLevel.regular.rank`. |
| m4 | Part C 3.2, D7, Part B 6.1, integration step 11 | An act recorded during End Day has `a.day == today` (the day moved at L1131). It does not roll that night, but its weight still decays (`else if a.revealDay == nil { acts[i].weight *= 1 - a.decay }`). Part B and integration step 11 say that the act rolls the same night. | Choose one rule and write it in D7. To keep D7: compare against the day before the move (`a.day > today - 1` means recorded tonight) and skip the decay for that act. |
| m5 | Part C 6.2 | "Stay silent" sets `replyDay = today`. After a counter, a later silent tap makes the rival answer again the next night (`c.replyDay == today - 1`). | Do not set `replyDay` for `.silent`. |
| m6 | Part C 10.2 | The hub banner shows while `reply == nil`. Silent keeps `reply == nil`, so the banner says "Tap to answer" every day until the callout ends. | Show the banner while `replyDay == nil`. |
| m7 | Part C 3.3 | The kid lowball call passes `weight: e.market / 50` with no clamp. The 1.4 table says 0.5 to 2.0. A $10 card gets weight 0.2 and 11% discovery. | `weight: max(0.5, min(2, e.market / 50))`. |
| m8 | Part C 3.1 | The example says 45% total discovery for a kid lowball. The constants give 53%. The new path also costs less reputation than the old one: old 35% × −30 = −10.5 expected; new about 53% × −12 = −6.4 (−3.2 after make it right). | Correct the number. Tell AJ that the kid lowball reputation cost goes down, and ask him to approve it. |
| m9 | Part C 9 (rate note) | The note assumes 3 rivals. Part A seeds 3 flippers and 2 creators (`seedRivals`, Part A L1375-1388). With 5 rivals at hostility 0.3, a false callout comes about every 6.4 weeks. With the 2 game shops after a lease, it is about every 4.6 weeks. One gambling backlash adds 0.075 a week for each creator, which doubles the base rate. | Correct the note. Tune with `-marketsim`. |
| m10 | Part C 7.2 | The kid gift has no lowest value. A table of $0.25 commons gives about +1.1 reputation for each gift, once a day, at almost no cost. | Require `item.market >= Balance.kidGiftMinValue` (5.0). Block `fakeKnown` items. |
| m11 | Part C 7.2 | `giveToKid` calls `giveAway`, which does not call `settleOnlineListing`. `sellAtShow` does (`M/Shows.swift` L201). An item with an online listing leaves an orphan listing. | Call `store.settleOnlineListing(item.id, name: item.name)` in `giveToKid`, or block listed items in `canGiveToKid`. |
| m12 | Part C 10.1, 10.2 | The plan says `CalloutsView` is reached "from the reputation tile". The tile goes to `.contacts` (`Hub/HubView.swift` L232-234). The plan changes only its detail text. `CalloutsSection` is inside the `hasAccount` branch (`Social/SocialViews.swift` L28-29). A player with no account loses the list after the banner ends. | Show a small "Callouts" row in `ContactsView` when callouts are open or a record is active. |
| m13 | Part C 7.1 | `calloutRival` calls `postResponse(..., .counter)`, so the post subject reads "Counter-callout · @handle". | Give `postResponse` a `subject: String` parameter. Pass "Callout · \(rivalName)" from `calloutRival`. |
| m14 | Part C 7.1 | A baseless callout at the cap does not open, but the text says "People turned on you." | Use `force: true` (M5), or change the text when `startCallout` returns nil. |
| m15 | Integration 1.7 | The reply row says "Pay \(money(refund))" (the order price). `refundRipShipOrder` charges `order.net` and gives the buyer's cards to the player (Part B L1813-1830). | Show the real amount. Better: see improvement I1. |
| m16 | Part B 5.3 | `banFromWhatnot` calls `save()`. `settle` calls it during End Day, before the final save. This adds one full encode to the `-test` run and saves a half-finished day. | Remove `save()` from `banFromWhatnot`. Callers outside End Day save on their own. |
| m17 | Part B 5.6, Part C 6.6 | A palm caught live costs −40, an 8-week ban, and a callout. A palm that comes out later through the log costs only the callout, with no ban. Discovery for an uncaught palm is 99% (weight 1.5, 500 viewers, decay 0.04). | Decide one rule. Suggestion: in `settle`, a true `.fairness` callout with an act of kind `.palmedHit` and peak ≥ 80 also calls `banFromWhatnot`. |
| m18 | Part C 4.2 | `ShowSession.weighted([(.fairness, 0.5), ...]) ?? .greed` depends on inference through `??` and a ternary. | Write `ShowSession.weighted([(CalloutType.fairness, 0.5), ...])`. |

## 5. End Day order (integration section 2)

The anchors match `endDay()` (`M/GameStore.swift` L1106-1207). The exceptions are in C7 and C8. No new step reads state before the step that writes it, with three small exceptions:

- `advanceSocial()` (L1150) reads `hottestCallout` before `calloutsEndDay()` (step 15). A callout that opens tonight blocks sponsor offers one night late. This is acceptable. Write it in Part C 7.5.
- Step 11 (`ripShipEndDay`) records `.unshippedOrder` after the day moved, so it does not roll in step 15 that night (m4). The step 11 note is wrong.
- Step 16 (`rivalsEndDay`) does the weekly credibility regain after step 15 used credibility. That order is correct. Game shops need their own regain (B1).

Step 18 (`storeBreakInEndDay`) after `lossesEndDay` and before `storeGrowthDay`, with the `gameOver` guard, is correct.

## 6. Save compatibility

All new fields are safe for an old save:

- `GameData`: the 8 new fields decode through `v(...)` (`M/GameStore.swift` L148-150).
- `CalloutState`: decoder for each field (Part C 2.1). After B1, add a `shopCredibility` line and remove `rivalCredibility`.
- `RetailState.gougeDay` and `ripHereWeek`: add both to the Part A 0.3 decoder.
- `SealedItem.mustRip: Bool?`: Optional, so it obeys the Part B 1.1 rule.
- `PostType.response` and `LedgerEntry.Category.grayMarket` are new raw values. A new save does not open in an older build. That is the existing one-way rule.

One risk stays: `HiddenAct` and `Callout` use synthesized `Codable`. A field added later with a default is still a required key. One bad element then drops the whole array through `try?`. Part C 11 states this. Give both structs a tolerant `init(from:)` in an extension now, as Part A does for `Rival`. The cost is low.

## 7. Exclusivity check

I checked every closure in Part C and in the integration snippets. **No violation found.**

- Part C: `exposeHiddenActs` (local `acts`, `removeAll` reads only locals), `retireHiddenAct`, `exposeHiddenAct`, `rivalCalloutsWeekly` (local `state`), `rivalCallout` (`filter` is a read; the write comes after `startCallout`), `advanceCallouts` (local `open`, `endedIDs`), `replyToCallout`, `loseCredibility`, `calloutRival` (the `removeAll` reads the local `receipt`), `coolCallouts`, `kidGift`, `promote` (reads `recordPenalty` first), `advanceSocial` (reads `hot` first), and `testSettle`.
- Integration: `storeBreakInEndDay` (`data.sealed.removeAll` reads only the local `ids`; `sorted` and `reduce` run on the local `inStore`), and the `priceGouge` rule (collect first, record after the loop).

One risk is not a closure trap but is close to it: the `noteRivalReceipt` call site (M6). It must not run from a view helper.

## 8. Game design numbers

| Question | Answer |
|---|---|
| Does an honest player meet callouts? | Yes. False rival callouts come about every 6.4 weeks with 5 rivals (m9). This requires Part A rivals and reputation tier 1 or follower tier 1. |
| Is any callout unwinnable? | No. "Make it right" ends any callout in 1 night. It costs a refund or $25 to $250. If the player cannot pay, the callout fades in 13 to 19 days (heat 40 to 100, −15% a day). The worst cost is −12 reputation, −1% followers, a record, and, for product integrity, a ban. No callout ends a run. |
| Death spiral? | No. A record caps at −15 start points. Callouts cap at 3. No callout raises rival hostility. |
| Farms? | Yes. Player callouts (M6), counter combinations (M7), and the kid gift with no lowest value (m10). Deny on a false callout is +3 at about 1 every 6 weeks. That is acceptable. |
| Double penalties removed? | The kid lowball: yes. The sold-fake post: no (M1). The palmed hit: yes for a caught palm (no act is recorded). But M5 can drop the callout, and m17 makes a later palm cheaper. The resealed sale: no (M2). |
| Late order | About 56% of late orders become a callout before the day-7 refund. Then B3 applies. |

## 9. Gaps against the report

| Report | Status |
|---|---|
| 6.1 | Built. The callout list shows in the social hub only with an account (m12). |
| 6.2 | The five secrets exist. "Scalper heat of 10 or more" maps to `storeBan` (Part A). Witnesses are lost for the Part A acts (M3). |
| 6.3 | Built. "A rival who lost a deal or a shelf posts more often" depends on Part A hostility deltas, which exist (Part A L1476). |
| 6.4 | "Each reply from either side adds 20" is built only for a rival's answer. Game shops and persons never answer. Acceptable, because the 6.5 table sets the player's numbers. Write it in docs/35. |
| 6.5 | Built, with the M7 holes. |
| 6.6 | Built. |
| 6.7 | Built. The plan adds "no record after make it right". The report does not say this. Get AJ's approval. |
| 6.8 | The report example "a fake bought from that rival" has no code path. See improvement I3. |
| 6.9 | Built at shows and meets (`ShowSession`). See m10 and m11. |

UI: the callout card, the reply sheet, and the record badge are specified. The plan forbids a full-screen flash, a white fill, and a light opacity pulse. That is correct. Add a "Give it to them" line to the show summary (`sold` list), so the gift shows in the day recap and the vlog.

## 10. Test gaps (`Hub/GameTests.swift`)

The run must stay near 2 s. The plan adds `callouts()` with 4 End Days (section 12 says 3; section 14 says 4).

1. **Reuse End Days.** Move checks 2 and 5 into `days()`. Seed the two test callouts and the forced act before the 14-day loop, and check after it. That saves 4 End Days.
2. **The kid gift test is only a comment.** It moves items. Make it real: build a meet session, `testSeat` a kid buyer `Visitor` for a $10 card, call `giveToKid()`, then check that the card left `data.raw`, cash did not move, `openedPaid` rose by the price paid, and `canGiveToKid` is false for a second kid.
3. **Double-penalty regressions.** Add 2 checks. (a) `lowballKid` adds 0 `data.scams` and 1 `.lowballKid` act. (b) A forced public fake post opens 1 callout, does not apply the 5% follower loss, and applies the −40 reputation once (M1).
4. **B3 money check.** Make a late order, force its act out, let Whatnot refund it, then tap "make it right". The ledger has exactly 1 refund entry for the order.
5. **M5 cap check.** With 3 open callouts, `startCallout(..., force: true)` still opens.
6. **Exclusivity seeds in `days()`.** Also seed 1 `RivalReceipt` older than 60 days (it reaches `state.rivalReceipts.removeAll`) and 1 good `DealStory` due tomorrow with 1 open callout (it reaches `coolCallouts`).
7. `testCallout` returns `data.callouts.open.last?.id` even when the cap blocks the new callout. Return `nil` when `startCallout` returns `nil`.

## 11. Improvements (inside the approved design), in priority order

### I1. "Make it right" on a late order ships it (Part B + C)

The real fix for an unshipped order is to ship it. Today "make it right" refunds the buyer and gives the player the buyer's cards. Change the reply for an act of kind `.unshippedOrder` with an open order:

```swift
case .makeRight where act?.kind == .unshippedOrder:
    if let o = act?.sourceID, shipRipShipOrders([o]) == nil {       // costs 10 minutes, Part B 5.3
        addLedger(-Balance.lateShipCredit, .refund, "Late ship credit · \(c.type.label)")   // $10 apology
        settleCalloutSource(actID: c.actID!, shipped: true)          // B3
    }
```

This adds a choice: ship and apologize (cheap, but it uses time), or refund (fast). It also fixes m15.

### I2. A proof line on a false callout

The player always knows if a callout is true. So "deny a false callout" is an easy tap. Make the deny show the evidence that the game already holds. This changes no number in 6.5.

```swift
func denyProof(_ c: Callout) -> String {
    switch c.type {
    case .greed:            "Your last \(n) sealed sales were at or under market."   // from data.ledger, last 30 days
    case .fairness:         "All \(shipped) Rip & Ship orders shipped on time."       // from data.ripShip.orders
    case .productIntegrity: "No buyer ever returned a box to you."
    case .kids:             "Parents at \(venue) vouched for you."
    default:                "Your record speaks for itself."
    }
}
```

Show it in the reply sheet only on the deny row, and only after the tap. A false callout becomes a small story about the player's own clean record.

### I3. A receipt from a fake bought at the rival's table (report 6.8 example)

Part A puts a rival flipper at a nearby table (`CardShow.rivalID`). Let the player buy one sealed item from that table during setup. Give it the plug fake rate (Part B `fakeRatePlug`). When the player checks it and finds a fake, call `noteRivalReceipt(rival.id, note: "Sold you a resealed \(name) at \(show)")`. This is the only receipt that comes from rival wrongdoing that the player can see, and it fixes M6 in a way that plays well.

### I4. A hard deal with a kid becomes a kids callout, not a deal story

Today a hard sell to a kid buyer at a show makes an ordinary bad deal story ("posted that you overcharged them"). In `scoreDeal`, when `kid && grade == .hard`, record `.lowballKid` with witnesses = the crowd size, in place of `maybeStory(good: false, ...)`. One act, one path. The kids type (heat 70) then covers the show table too, as the report's real case shows.

### I5. The crowd knows about a hot callout

While `hottestCallout >= 50`, 1 buyer in 8 at a show opens with a line ("Aren't you the one from that thread?") and has 1 less patience. This changes no price. It makes the callout visible at the table, where the player spends time. In `makeVisitor`, after the line is set:

```swift
if heatAtOpen >= Balance.calloutCrowdHeat, Double.random(in: 0..<1) < 0.125 {
    v.patience = max(1, v.patience - 1)
    v.line = "Aren't you the one from that thread? " + v.line
}
```

Read `heatAtOpen` once in `ShowSession.init`, so the visitor code does not read `store.data` each time.

### I6. Creators react to the player's growth with drama

Part A `rivalsEndDay` already notices a follower tier rise (`rose`). Add `data.callouts.dramaBait = min(Balance.dramaBaitMax, data.callouts.dramaBait + 0.1)` there. Growth then draws the creator rivals. The player must choose between growth and attention.

### I7. The parent from a kid gift can become a contact

On a viral kid gift story, call `promote(name: "\(kidName)'s parent", kind: .collector, interest: nil, points: 15)`. The record penalty (6.7) then applies to this new contact too. The gift and the record use the same system, and the gift has a lasting result.

### I8. A rival page

Add a rival detail sheet from `RivalsBox` (Part A UI). Show the credibility bar, the last 3 memories, the receipts held, and the callouts between the player and that rival (from `closed`). The data is already saved. No new model code is necessary.

## 12. Constraints check

The plans add no slab cracking, no Japanese product, no preorders or new sets, and no group breaks. No callout writes a price. Every cost uses `addLedger`. The improvements above obey the same rules. The new names in this review ("A parent", "\(kidName)'s parent") are generic.

## Files

- `/Users/ajholloway/personal/PokeVendor/docs/proposals/sealed-product/part-c-callouts.md`
- `/Users/ajholloway/personal/PokeVendor/docs/proposals/sealed-product/00-integration.md`
- `/Users/ajholloway/personal/PokeVendor/docs/proposals/sealed-product/part-a-stores-flippers.md`
- `/Users/ajholloway/personal/PokeVendor/docs/proposals/sealed-product/part-b-cases-distro-ripship.md`
