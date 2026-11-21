# Part B: cases, the distributor, the plug, and Rip & Ship (code proposal, revision 2)

Scope: proposals 3.1 to 3.7, 4.1 to 4.8, and 5.1 to 5.7 of `reports/Sealed product and flipper play.md`, plus the cleanup items that touch these files. AJ approved every proposal, including 4.2 (the 14-day application) and 5.6 (palm the hit).

Code base: commit `503ff3c` (the Swift code at `a7dd1dd` is the same). `M` = `app/PokeVendor/Model`. Line numbers are from that commit. Read them as "near this line", because Parts A and C also add lines to some files. Today the app builds clean, and `-test` passes 136 checks in 2.8 s.

This is a build plan. Each section gives the exact Swift change, the save rule, the End Day hook, the UI, the constants, and the tests. Prose is in STE. Code, identifiers, and tables are exempt.

`00-integration.md` wins where it disagrees with this file. `research_notes/Sealed product code proposal/r2_decisions.md` (D-1 to D-17) binds this revision.

## Revision 2 changes

Sources: `review_part_b.md` (B = blocker, M = major, m = minor, I = improvement), `review_part_c_integration.md` (C-), `sim_report.md` (S-), `r2_decisions.md` (D-), and `00-integration.md` (Int-).

| ID | Finding | Fixed in |
|---|---|---|
| B1 | The Rip & Ship rip did not connect to the stream | 5.4 (`startRipShipRip`, `ripping`, `ripDone`), 5.10 B and D; `RipModel` and `RipView` take a `ripID` |
| B2 | A case and a unit of one product shared a stack | 1.3 (`stackKey` includes `caseUnits`); test 9.1 |
| B3 | A show-dealer case arrived as one unit | 2.6 A (`buyGoods` and `buySealedAtShow` take `caseUnits`; holds, first looks, and trades exclude cases) |
| M1 | The plug had no screen for a player below Respected | 4.6 (Buy screen row when `wholesaleOpen \|\| plugOpen`) |
| M2 | Vending and the own counter counted as back-door sales | 3.6 (D-3 channel rule: only outside reseller channels are off-shelf) |
| M3 | The back-door check almost never fired | 3.6 (28-day rolling window, `max(6, 50% of delivered)` threshold) |
| M4 | A late order could refund twice | 5.5 (one refund path, `refunded` flag, D-4); 11.2 |
| M5 | Not shipping was safer than palming | 5.6 (D-5 chargeback and Whatnot strikes) |
| M6 | Holes in the one-buyer lock outside the stream | 1.7 (status on loose packs, hits, and bulk), 2.3 (`openCase(forOrder:)`), `discardFake` guard |
| M7 | Values that the integration file overrides | 3.5 (`fillBase` 0.05 and new table), `retailMSRP` in every buy price, full `buyWholesale` with the missing-shipment roll, `isHot` contract item removed, `openedAtShop` items blocked |
| M8 | Absurd cases for art bundles and half boxes | 2.1 (`caseSize(for:)` rules); offers filter `CaseMath.units != nil` |
| M9 | `cases.py` coverage | 2.2 (variants, all case spellings, `midPrice` fallback, measured coverage) |
| M10 | Five tests failed or flaked | 9 (each test rewritten; new force tools) |
| m1 | `InventoryFilter.matches` switch | 1.2 |
| m2 | `PickMode` switches | 5.10 B |
| m3 | `@MainActor` on `CaseMath` | 2.3 |
| m4 | `fakeRatePlug` declared twice | 1.5 (one declaration, in `M/Counterfeits.swift`) |
| m5 | Suppliers in store and meet regulars; one contact for each new plug | 1.6, 4.4 |
| m6 | Back room opened two cases of one product; dropped listings | 2.7 |
| m7 | `finishRipShip` was not idempotent | 5.4 |
| m8 | A refund could not rebuild cards and bulk | 5.1 (`RipShipOrder` stores `OwnedCard` and `BulkGroup`) |
| m9 | Refunds raised the commission tier | 5.5 |
| m10 | Stranger case pool had no era filter or price cap | 2.6 B |
| m11 | `ripJustBought` spent time on a case | 2.3 |
| m12 | Case detail view showed one unit's contents and EV | 2.5 |
| m13 | Seizure hit orders, listings, and machines badly | 4.4 |
| m14 | `palmCaught` case unused; resealed line lost | 5.5 (`RipShipRefund` cases), 5.4 (`finishRipShip` returns its line) |
| m15 | Rip & Ship hits showed as the player's pulls | 5.4, 5.10 E |
| m16 | Calendar entries had no code | 3.9, 5.10 F |
| m17 | Show-table thief could take a case | **Declined.** `rollShowTheft` takes only `kind == .card` items (`M/Losses.swift` L142). A case cannot be taken there. 10.5 states it. |
| m18 | Store close cleared the back-door records; trades left the check | 3.6, 3.8 |
| m19 | Two exclusivity rows gave a wrong reason | 6.2 |
| m20 | Wrong line citations | Corrected in place throughout |
| m21 | `isInStore` unqualified in the integration break-in code | Not in this file. Flagged for the integration owner in 11.2. |
| m22 | Case label color | 2.5 |
| I1 | Buyer meter and repeat buyers who remember | Adopted (D-17): 5.7 |
| I2 | Shelf share shown, rolling pool | Adopted (D-3, D-17): 3.6, 3.9 |
| I3 | Whatnot strikes | Adopted (D-5, D-17): 5.6 |
| I4 | One unbox for a whole case, and a tracker | Adopted (D-17): 5.9 |
| I5, I6, I7 | Tape check in the cut, rep heads-up, plug risk receipt | Not adopted. D-17 allows the top 4 of each review. I7's numbers already show on the order row (4.6). |
| C-B3 | Double refund of a late order | 5.5 (D-4) |
| C-M2 | Resealed and fake acts recorded at different times | 11.2 (record only when the buyer does not find out) |
| C-M5 | The cap dropped a forced palm callout | 5.8 (`force: true`, D-7) |
| C-m4 | Night of the first roll | 6.1 (Part C's D7 rule decides) |
| C-m16 | `banFromWhatnot` saved in the middle of End Day | 5.6 |
| C-m17 | A palm found later had no ban | 11.2 (contract for Part C) |
| S-2, S-R3 | Hot allocation too large | 3.5 (hot stays at 1 case a week, D-3) |
| S-3, S-R4 | Rip & Ship counted as a back-door sale | 3.6 (D-3) |
| S-5, S-R5 | A palm on a cheap product paid | 5.8 (D-6) |
| S-11 | Plug fake rate 6%, not 4% | 1.5 (`fakeRatePlug` 0.055, D-13) |
| D-9 | Phase 0 stubs, including `returnPalmedCards` | 0.4 |
| Part C rev 2, item 1 | `shipped` and `refunded` on `RipShipOrder` | 5.1 |
| Part C rev 2, items 2 and 3 | `retireHiddenAct(force: true)`; the weight-2.0 act only when the retire returns false | 5.5, 5.6 |
| Part C rev 2, item 4 | `returnPalmedCards(_:)` in place of a Part B make-right payment | 0.4, 5.5 |
| Part C rev 2, item 5 | Palm refund = price + card market; `settlePalm` passes `force`, `actKind`, `sourceID` | 5.8 |
| Part C rev 2, item 6 | Seizure: `plugSeized` with `revealDay`, the purchase act retired, no `exposeHiddenAct` | 4.4 |
| Part C rev 2, item 7 | No `save()` in `banFromWhatnot` | 5.6 |
| Part C rev 2, item 8 | `sellResealed` only when the buyer did not find the fake; Part B adds no `recordBadSale` caller | 11.2 |
| D-12 | Missing shipment names | 3.5 |
| D-14 | Store stock rider | 2.7, 10.5 |
| Int-1.4 | `retailMSRP` for buy prices | 3.5, 4.2 |
| Int-1.5 | Missing-shipment roll in `buyWholesale` | 3.5 |

Count: 3 blockers, 10 majors, and 21 minors fixed. 1 minor declined (m17). 4 improvements adopted, 3 not adopted under D-17's cap.

## 0. Summary

### 0.1 What changes

| Area | Change |
|---|---|
| Case counts (3.1) | `Balance.caseSizes` gets the real counts. `Balance.caseSize(for:)` reads the kind, the pack count, and the name. Art bundles, half boxes, club items, and master cartons have no case. |
| Case item (3.2, 3.3) | `SealedItem` gets `caseUnits`. A sealed case is one item with its own price. A real tcgcsv case price wins. Else the case factor table sets the price. |
| Open a case (3.2, 3.4) | A free action turns a case into N units. The units split the paid amount exactly. Units from a trusted case get a "case fresh" tag. |
| Stranger cases (3.5) | Show sealed dealers, eBay, and Facebook sell a case now and then. One fake roll covers the whole case. A free tape check halves the risk. |
| Space (3.6) | A case packs tighter than loose boxes (integration D1). A new store fixture, the back room, holds cases off the shelf and restocks the shelf from them. |
| Independent draws (3.7) | Pack draws never read case data. A "loaded case" claim is seller text only. |
| Tiers (4.1) | The no-store route is the "secondary wholesaler". The store route is the "hobby distributor account". Both stay in `DistributorAccount`. |
| Application (4.2) | The hobby account needs a lease, a finished build-out, the seller's permit, and an application. The decision comes 14 days later. |
| Rep (4.3) | A new contact kind, `distributorRep`, with a 0 to 100 relationship. Spend and store events raise it. A "push" costs 5 points. |
| Fill rate (4.4) | Hot cases fill with a chance from flipper pressure (Part A) and the rep relationship. `fillBase` is 0.05. Hot product stays at 1 case a week (D-3). |
| Elite (4.5) | At Elite, one hot case each week skips the fill roll. |
| Back door (4.6) | Only sales to outside reseller channels count as off-shelf (D-3). A 28-day rolling check brings warnings, a freeze, then a closed account. The rep box and the store screen show the shelf share. |
| Plug (4.7, 4.8) | A gray contact sells hot cases for full prepayment. It can vanish, ship short, ship resealed, or ship stolen stock. No invoice, so no tax cost. The Buy screen shows it to any player who unlocks it. |
| Rip & Ship (5.1 to 5.7) | A stream action. One viewer buys one whole sealed product. The player rips it on stream, and the stream clock stops during the rip. Every card, every bulk card, and every unopened pack goes to that viewer. The real Whatnot fees apply. A ship queue has a 2-day deadline. A day-7 cancel is a chargeback with Whatnot strikes. The player can palm a big hit. That act is a scam with real consequences. |

### 0.2 New source files

Run `xcodegen generate` in `app/` after you add these files. The project reads the whole `PokeVendor` folder (`project.yml` `sources: - path: PokeVendor`), so `project.yml` does not change.

| File | Holds |
|---|---|
| `M/Cases.swift` | `CaseListing`, `CaseKind`, `CaseMath`, case constants, `makeCase`, `openCase`, `checkCase`, stranger case offers, `backRoomRestock` |
| `M/Distributor.swift` | `DistributorTier`, `HotAllocationRecord`, application, rep, fill rate, Elite case, back-door check, `distributorEndDay` |
| `M/Plug.swift` | `PlugState`, `PlugOrder`, plug offers, `orderFromPlug`, `plugEndDay` |
| `M/RipShip.swift` | `RipShipState`, `RipShipOrder`, `RipShipFees`, order life cycle, strikes, `ripShipEndDay`, `banFromWhatnot`, `refundRipShipOrder`, `returnPalmedCards` |
| `Inventory/CaseOpenSheet.swift` | The case opening animation and summary |
| `Stream/RipShipViews.swift` | The Rip & Ship pick sheet, the "sold, rip it now" panel, the summary section |
| `Stream/ShipQueueView.swift` | The ship queue screen |
| `Buy/PlugViews.swift` | The gray market section |
| `tools/export/cases.py` | Writes `Resources/cases.json` from the tcgcsv cache |
| `Resources/cases.json` | Real case prices: unit product ID, case SKU, units, market price |

### 0.3 Build order inside Part B

Integration section 7 sets the phases. Part B's share:

| Phase | Part B work |
|---|---|
| 0 | The stubs in 0.4. |
| 1 | Sections 1 and 2.1 to 2.5, 2.8; `cases.py` and `cases.json`. |
| 4 | Sections 2.6, 2.7, 2.9, 3, and 4. |
| 5 | Section 5. |

Run `-test` after each phase.

### 0.4 Phase 0 stubs (D-9)

Other parts call three Part B functions before phase 5. Phase 0 adds them to `M/RipShip.swift` with these bodies, together with the empty `RipShipState` and `PlugState` (sections 4.1 and 5.1 give their final fields):

```swift
@MainActor
extension GameStore {
    /// Whatnot bans the player from streams. Phase 0 sets the date. Phase 5 adds the line and the strike logic.
    func banFromWhatnot(days: Int, reason: String) {
        let end = data.day + days
        data.ripShip.bannedUntil = max(data.ripShip.bannedUntil ?? -1, end)
        data.ripShip.banReason = reason
    }

    /// The only function that pays a Rip & Ship buyer back. Phase 0 stub: no orders exist yet.
    @discardableResult
    func refundRipShipOrder(_ orderID: UUID, reason: RipShipRefund = .notOpened) -> String { "" }

    /// Part C's "make it right" on a palm sends the palmed cards to the buyer. Phase 0 stub: no orders exist yet.
    func returnPalmedCards(_ orderID: UUID) {}
}

enum RipShipRefund { case notOpened, resealed, chargeback, seized }
```

Phase 5 replaces the stub body with 5.5.

## 1. Shared foundations

These changes touch types that every later section uses. Make them first.

### 1.1 `SealedItem` (`M/Inventory.swift` L561-597)

Add four optional fields after `contents` (L584). Every field is Optional, so the synthesized decoder uses `decodeIfPresent`, and an old save decodes with `nil`.

```swift
    /// A sealed case of this many units of `productID` (docs/12-acquiring-product.md, Cases). Nil: one unit.
    /// `packs` holds the packs of the whole case, and `name` says "Case of N".
    var caseUnits: Int?
    /// The unit came out of a trusted sealed case, or it is a trusted case: no one searched it. Nil: no tag.
    var caseFresh: Bool?
    /// The player checked the tape and the label of this case. The check runs once.
    var caseChecked: Bool?
    /// The plug order that this item came from (Model/Plug.swift). Units from an opened plug case keep it.
    var grayOrder: UUID?

    var isCase: Bool { caseUnits != nil }
    var isCaseFresh: Bool { caseFresh == true }
```

Add the keys to `CodingKeys` (L586-589):

```swift
        case fake, fakeKnown, verified, onlineListing, contents, caseUnits, caseFresh, caseChecked, grayOrder
```

**Save rule.** `GameData.init(from:)` (`M/GameStore.swift` L155) decodes `sealed` with `try?`. One bad `SealedItem` drops the whole array. So every new field must be Optional. Do not add a non-optional field with a default to `SealedItem`. The same rule holds for `BulkGroup` (1.7), `Contact` (5.7), `RipShipOrder`, `PlugOrder`, and `HotAllocationRecord`: each of them decodes inside an array with a synthesized decoder. Put this comment on each of those types: `// A new field must be Optional. This type decodes inside an array.`

The buyer of a Rip & Ship order lives in `RipShipOrder`, and the item status points to the order (1.2). One place holds the buyer, so the two cannot disagree. Integration D-15 adds `ItemStatus.openedAtShop` in place of a `mustRip` flag. Part B needs no field for it, because every Part B sell and pick path already skips an item with a status.

### 1.2 `ItemStatus` (`M/Inventory.swift` L388-424)

Add one case after `atAuctionHouse` (L403):

```swift
    /// A viewer bought this product on a Rip & Ship stream. The player must open it on that stream (Model/RipShip.swift).
    /// Loose packs and pulled cards of the product keep this status until they move to the order.
    case soldToViewer(orderID: UUID)
```

Add it to `tag` (L411-423):

```swift
        case .soldToViewer: "SOLD · SHIPS TO A VIEWER"
```

Two other exhaustive switches must change, or the build fails:

| Switch | Change |
|---|---|
| `InventoryFilter.matches` (`Inventory/InventoryView.swift` L61-71) | Add `case .soldToViewer: return self == .soldToViewer`. Add `case soldToViewer = "Sold to a viewer"` to `InventoryFilter` (L44-48). |
| `StatusBox` in `Inventory/DetailViews.swift` (L39-96) | Add a row: "Sold to a viewer on Rip & Ship. It ships to them." |

The compiler lists any other exhaustive switch. `advanceSealed` (`M/GameStore.swift` L1254) has `default: break`, so it needs no change. An old save has no such status, so decoding is safe.

### 1.3 `stackKey` (`M/GameStore.swift` L487-489)

A case keeps the `productID` of its unit. Today a case and a loose unit of one product stack together, and the sell sheet (`Inventory/SellGradeSheets.swift` L46-49) prices the whole stack from its first item. Add the case size to the key:

```swift
    func stackKey(_ s: SealedItem) -> String {
        "\(s.productID ?? s.name)|\(s.caseUnits ?? 0)|\(s.setSlug)|\(s.pc)|\(s.status?.tag ?? "")"
    }
```

`mates(of:)` (L518-521) and the "×N in Inventory" line use the same key, so they separate too.

### 1.4 `GameData` (`M/GameStore.swift` L4-141)

Integration 1.8 adds one block of new fields after `shorts` (L140). Part B's two lines in it:

```swift
    var plug = PlugState()                         // Part B
    var ripShip = RipShipState()                   // Part B
```

And in `init(from:)` after `shorts = v(.shorts, shorts)` (L233), in the integration order:

```swift
        plug = v(.plug, plug)
        ripShip = v(.ripShip, ripShip)
```

An old save has no keys, so both take their defaults. `PlugState` and `RipShipState` have hand-written tolerant decoders (4.1, 5.1).

### 1.5 `LedgerEntry.Category` and `FakeSource`

**`LedgerEntry.Category` (`M/Inventory.swift` L625-635).** Add one case:

```swift
        case grayMarket = "Gray market"
```

Do not add it to `Balance.taxableCategories` (`M/Taxes.swift` L47-50). A plug order has no invoice, so the income tax step must not count it as a cost (4.8). Old saves have no such entry.

**`FakeSource` (`M/Counterfeits.swift` L26-55).** Add `case plug`, and add its rate in the same file, next to the other fake rates (L73-82). This is the only declaration of `fakeRatePlug`:

```swift
    /// The gray plug (Model/Plug.swift).
    case plug
    ...
        case .plug: Balance.fakeRatePlug
    ...
    /// The plug. `Counterfeit.rate` halves a sealed rate and multiplies hot product (over 2 × MSRP) by 1.5, so 0.055
    /// gives about 4.1% for each hot case (report 4.7; sim_report.md 6.1, D-13).
    static let fakeRatePlug = 0.055
```

`FakeSource` is not `Codable`, so there is no save change.

### 1.6 `ContactKind` and the supplier filters (`M/Relationships.swift` L5-41)

Add two cases. They are business lines, not people at shows.

```swift
    case gameShop, vintageDealer, modernDealer, shopBooth, collector, trader, buyer, distributorRep, plug
    ...
        case .distributorRep: "Distributor rep"
        case .plug: "Plug"
    ...
        case .distributorRep: "building.2.crop.circle"
        case .plug: "eye.slash"
    ...
    /// A supplier line, not a person at a show, a meet, or the counter. It never goes in the contact book.
    var isSupplier: Bool { self == .distributorRep || self == .plug }
```

Then keep suppliers out of people logic:

| Place | Change |
|---|---|
| `storeRegulars` (`M/CardStore.swift` L453-458) | `!c.kind.isVendor && c.kind != .gameShop && !c.kind.isSupplier && r.next() < 0.4`. Suppliers are at the end of `contacts`, so the short-circuit does not change the seeded rolls of the other contacts. |
| `meetRegulars` (`M/Meets.swift` L183-190) | Add `!c.kind.isSupplier` to the first `guard`. |
| `knownContacts` (L247-249) | Add `!$0.kind.isSupplier`. |
| `canRegister` (L252-254) | Return false for a supplier. |
| `attendingRegulars` (L586-594) | No change. A supplier has `atLocalShows` and `atRegionalShows` false, so it never attends a show. |
| `addPoints` (L294-322) | No change. Create supplier contacts with `rewardedLevel = 4`, so a supplier never gives reputation. |
| Decay loop in `relationshipsEndDay` (L563-569) | No change. A quiet rep loses a point a week after 8 weeks, which is correct. Orders set `lastDealDay`. |

Each supplier uses one fixed contact ID: `"distro:rep"` and `"plug"`. A new plug replaces the old plug contact (4.4), so the contact list never grows past two suppliers. That keeps `Balance.maxContacts` (60) for people.

`ContactKind` is a `String` raw value enum. An old save has no new raw values, so it decodes.

### 1.7 The one-buyer lock on every content (fixes M6)

A Rip & Ship product and everything that comes out of it carry `.soldToViewer(orderID:)` until `finishRipShip` moves it to the order. No sell, list, shelf, vend, lot, trade, grade, or Rip & Ship path accepts an item with a status, so the buyer's cards are locked even if the app closes during the rip.

| Site | Change |
|---|---|
| `loosePack(_:from:)` (`M/GameStore.swift` L619-627) | After `pack.fakeKnown = item.fakeKnown`: `if case .soldToViewer = item.status { pack.status = item.status }`. |
| `openProduct` (L632-655) and `commitPack` (L660-714) | Read `let order = orderID(of: item)` from the source item before it is removed (`if case .soldToViewer(let id) = item.status`). For a loose pack source, read it from the loose pack. Set `status = .soldToViewer(orderID:)` on each promo and hit `OwnedCard`. Set `shipOrder` on the new `BulkGroup` (below). Only when `order != nil`. |
| `BulkGroup` (`M/Inventory.swift` L600-622) | Add `var shipOrder: UUID?` (Optional, so old saves decode). In `commitPack`, a rip for an order makes its own group: the lookup at L703 adds `&& $0.shipOrder == order`. |
| Bulk sell paths | `sellBulkForCash` (L926-934) and `sellBulk` (L937-950) return early when `group.shipOrder != nil`. The card club (`M/Opportunities.swift` L282-292) counts and removes only `$0.shipOrder == nil` groups: `data.bulk.removeAll { $0.shipOrder == nil }`. `M/StoreBuying.swift` L122 picks only groups with `shipOrder == nil`. The bulk list in Inventory hides groups with `shipOrder`. |
| `moveToBulk` (L464) | No change. A card with a status is already skipped. |
| `discardFake` (`M/Counterfeits.swift` L304-317) | Add `status == nil` to both branches. |
| `setPC` | No change. It already refuses an item with a status (L437). |

### 1.8 One choke point for market value

`realMarket(of:)` (`M/Counterfeits.swift` L236-239) is the only place that turns a `SealedItem` into a market price. Inventory value, insurance claims, stream items, shelf items, vending prices, and listings all call it. The case price goes there (2.3), so every system sees the case price with no other change.

## 2. A case is a product with its own price (3.1 to 3.7)

### 2.1 Proposal 3.1: correct the case counts

**File `M/Wholesale.swift` L45.** Replace the line:

```swift
    /// Units in one distributor case, by product kind (research_notes/Sealed product and flipper play/cases.md, section 1).
    /// "Booster pack" is the 144-pack sleeved booster case. Read `caseSize(for:)`, not this table: it applies the pack
    /// count and name rules first.
    static let caseSizes: [String: Int] = ["Booster box": 6, "Elite Trainer Box": 10, "Booster bundle": 25, "Booster pack": 144,
                                           "Blister": 24, "Build & Battle": 10, "Collection": 6, "Tin": 6]
```

**File `M/Cases.swift` (new).**

```swift
extension Balance {
    /// Collection name rules that come before the kind. The first match wins.
    static let caseSizeByName: [(String, Int)] = [("Ultra-Premium", 4), ("Ultra Premium", 4), ("Tech Sticker", 12), ("Knock Out", 24)]
    /// The kinds that the distributor and the plug sell by the case. Keep it equal to the old four kinds, so the
    /// seeded weekly offers stay the same for each week.
    static let wholesaleKinds: Set<String> = ["Booster box", "Elite Trainer Box", "Booster bundle", "Booster pack"]

    /// Units in one case of the product. Nil: the product has no case. A product that is itself a multi-unit bundle
    /// (an art bundle, a half box, a club bundle, a master carton) has no case: no source gives one.
    static func caseSize(for p: Product) -> Int? {
        if p.isClubExclusive || p.name.contains("Master Carton") { return nil }
        switch p.kind {
        case "Booster pack":
            // One loose or sleeved pack. "[Set of N]" art bundles, sleeved pack bundles, and Fun Packs have no case.
            return p.packs == 1 && !p.name.contains("Fun Pack") ? 144 : nil
        case "Booster box":
            // A half box is a seller split, not a factory product. An enhanced box uses a real cases.json row only.
            if p.name.contains("Half Booster Box") || p.name.contains("Enhanced Booster Box") { return nil }
            return p.packs == 36 ? 6 : nil
        case "Booster bundle":
            return p.packs == 6 ? 25 : nil
        case "Elite Trainer Box":
            return p.name.contains("Pokemon Center") || p.name.contains("Pokémon Center") ? 4 : 10
        case "Blister":
            return p.packs <= 1 ? 16 : 24          // checklane display 16; 2-pack and 3-pack cases 24
        case "Tin":
            return p.name.contains("Mini Tin") ? 10 : 6
        case "Collection":
            return caseSizeByName.first { p.name.contains($0.0) }?.1 ?? 6
        default:
            return caseSizes[p.kind]               // "Build & Battle" 10; "Other" is nil
        }
    }
}
```

The catalog check behind these rules (`Resources/catalog.json`): kind "Booster pack" holds 92 art bundles of 4 packs, 7 of 5, 8 sleeved bundles of 8 or 10, Fun Packs, and one "Stellar Crown Sleeved Booster Master Carton" of 144 packs, which is itself a case. Kind "Booster box" holds 13 half boxes of 18 packs and 2 enhanced boxes. Kind "Booster bundle" holds club bundles with other pack counts. Each of these now returns nil.

`CaseMath.units(_:)` (2.3) reads a real `cases.json` row first, then `caseSize(for:)`. A real row also gives the enhanced box its case.

**Call sites that change:**

| Site | Old | New |
|---|---|---|
| `wholesaleOffers` filter (`M/Wholesale.swift` L68-70) | `Balance.caseSizes[$0.kind] != nil` | `Balance.wholesaleKinds.contains($0.kind) && CaseMath.units($0) != nil`. The kind test keeps the old four kinds. The units test removes the art bundles and half boxes, which change the seeded picks only where the old code offered a 36-unit "case" of an art bundle. |
| `wholesaleOffers` size (L75) | `Balance.caseSizes[p.kind] ?? 6` | `CaseMath.units(p) ?? 6` (never nil after the filter) |
| `splitsEndDay` (L172) and `testSplitInvite` (L193) | `Balance.caseSizes[p.kind] ?? 6` | No change. Splits use only booster boxes (6) and ETBs (10). Add `p.packs == 36 \|\| p.kind == "Elite Trainer Box"` to the split options filter (L167), so a half box never becomes a split. |

**Effect on play.** A bundle case now costs about twice as much (25 units, not 12). A pack case is 144 packs, not 36. A no-store player still has 2 cases a week, so the bundle case becomes a large order. This is the real count.

### 2.2 Real case prices: `tools/export/cases.py` and `Resources/cases.json`

The catalog has no case SKUs today. `catalog.py` (`tools/export/catalog.py` L436) drops kind "Case or display", and `sealed_contents.json` has no case rows. The tcgcsv cache (`tools/cardlist/cache/tcgcsv/<group>-products.json` and `<group>-prices.json`, 399 files) lists the case SKUs as their own products. Every catalog `id` is a tcgcsv product ID, and every catalog row has a `group` in `tools/ppt/cache/sealed_contents.json`.

**New script `tools/export/cases.py`.** Steps:

1. Read `app/PokeVendor/Resources/catalog.json` (units) and `tools/ppt/cache/sealed_contents.json` (the `group` of each unit).
2. Read every group's prices. A price is `marketPrice`, or `midPrice` when `marketPrice` is null. Print each row that uses `midPrice`. (Journey Together, Paradox Rift, and Paldean Fates ETB cases have no `marketPrice` today.)
3. Normalize names with the same `norm()` as `catalog.py` (L325): lower case, "pokémon" to "pokemon", "&" to "and", remove "(International Version)", and keep `[` and `]`. Skip a case name with "Code Card" or "International".
4. Match a case SKU with this table. The first row whose pattern ends the name wins. `base` is the text before the pattern.

| Pattern (end of the case name) | Unit name to look for | Units |
|---|---|---|
| `Pokemon Center Elite Trainer Box (Exclusive) Case`, `… Box Case (Exclusive)`, `… Box Case` | base + " Pokemon Center Elite Trainer Box" | 4 |
| `Elite Trainer Box Case` | base + " Elite Trainer Box" | 10 |
| `Enhanced Booster Case`, `Enhanced Booster Box Case` | base + " Enhanced Booster Box" | 6 |
| `Booster Box Case` | base + " Booster Box" | 6 |
| `Booster Bundle Case`, `Booster Bundle Display Case`, either with ` (LGS)` | base + " Booster Bundle" | 25 |
| `Sleeved Booster Case`, `Sleeved Booster Pack Case` | base + " Sleeved Booster Pack", else base + " Booster Pack" | 144 |
| `3-Pack Blister Case`, `3 Pack Blister Case` | base + " 3 Pack Blister" | 24 |
| `Build & Battle Box Display`, `Build & Battle Display` | base + " Build & Battle Box" | 10 |
| `Mini Tin Display` | base + " Mini Tin" | 10 |
| `Ultra-Premium Collection Case` | base + " Ultra-Premium Collection" | 4 |
| `Tin Case` | base + " Tin" | 6 |
| `Collection Case`, `Collection Box Case` | base + " Collection" | 6 |

5. A unit of the same group matches when `norm(unit)` equals the wanted name, or starts with it and the rest is one bracket variant (`[Iron Valiant]`, `[Koraidon]`, `[Mega Gardevoir]`). One case SKU then writes one row for each art variant, at the same case price. For ` (LGS)`, match the unit with "(LGS)" when it exists, else the plain unit. Strip a unit's trailing "(Retail)".
6. Keep a row only when its units equal the game's case size for that unit (a Python copy of `caseSize(for:)`, at the top of the script with a comment that it must match `M/Cases.swift`). This drops "Booster Bundle Display" (10) and "Mini Tin Display Case" (40), because the game counts 25 and 10.
7. Drop a row when `case price / (units × unit market)` is outside 0.4 to 2.5. Print each drop. Real loose packs sell above the case rate (Delta Reign sleeved packs: 0.57), so the floor must be under 0.6. A ratio outside the range is a wrong match.
8. Write `Resources/cases.json` as a list: `{"product": "<unit id>", "case": "<case id>", "units": 10, "market": 1218.56}`. Sort by unit id. Print the coverage lines below.

**Measured coverage.** A prototype of these rules ran read-only against the current cache on 2026-11-20:

| Pool | Products with a real case price |
|---|---|
| In-print booster boxes | 18 of 18 (100%) |
| In-print ETBs (not Pokemon Center) | 27 of 29 (93%) |
| In-print booster packs (single packs) | 30 of 41 (73%) |
| In-print booster bundles | 15 of 25 (60%) |
| All four wholesale kinds, in print | 90 of 113 (80%) |
| Every in-print product with a case size | 210 of 526 (40%) |
| Every catalog product with a case size | 356 of 1,614 (22%) |

The rows written: about 356. Rows with no price at all: 36. Ratio drops: 28. The bundles and packs that miss have no 25-bundle case or no sleeved case SKU on TCGplayer (the special sets: 151, Prismatic Evolutions, Paldean Fates, Shrouded Fable). The factor table prices them. That is expected: the distributor and the plug offer the four wholesale kinds, and 80% of those use a real price.

Run the script after `catalog.py` in the price refresh. AJ's memory entry `project_price_refresh.md` lists the export order. The main thread must ask AJ to add this step there.

**Loader, in `M/Inventory.swift` near `catalog` (L80-87):**

```swift
    /// Real case prices (tools/export/cases.py). Missing file: no real case prices, and the factor table sets them.
    static let caseListings: [String: CaseListing] = {
        guard let url = Bundle.main.url(forResource: "cases", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let list = try? JSONDecoder().decode([CaseListing].self, from: data) else { return [:] }
        return Dictionary(list.map { ($0.product, $0) }, uniquingKeysWith: { a, _ in a })
    }()
```

The file is not fatal when it is missing. The game falls back to the factor table.

### 2.3 Proposals 3.2 and 3.3: the case item and its price

**File `M/Cases.swift`.** `CaseMath` is not `@MainActor`. `StoreOffer.title`, `StoreOffer.market`, and `VendorItem.name` call it, and those are not isolated. Everything it reads (`Product`, `PriceCycle`, `SetLibrary`) is not main-actor isolated.

```swift
import Foundation

// Sealed cases (docs/12-acquiring-product.md, Cases).

/// A real case price from tools/export/cases.py.
struct CaseListing: Codable, Hashable {
    /// The unit product ID in catalog.json.
    let product: String
    /// The TCGplayer product ID of the case SKU.
    let caseID: String
    let units: Int
    /// The TCGplayer market price of the case on the day of the price refresh.
    let market: Double

    enum CodingKeys: String, CodingKey { case product, caseID = "case", units, market }
}

/// The row of the case factor table.
enum CaseKind: Hashable {
    case boosterBox, eliteTrainerBox, boosterBundle, other

    init(_ p: Product) {
        switch p.kind {
        case "Booster box": self = .boosterBox
        case "Elite Trainer Box": self = .eliteTrainerBox
        case "Booster bundle": self = .boosterBundle
        default: self = .other
        }
    }
}

extension Balance {
    /// The case price as a multiple of the units' price: in print, out of print under 2 years, out of print 2 years or
    /// more (or an older era). From the 2026-11-20 tcgcsv ratios (cases.md, section 3).
    static let caseFactors: [CaseKind: [Double]] = [
        .boosterBox: [0.95, 1.05, 1.15], .eliteTrainerBox: [1.05, 1.15, 1.25],
        .boosterBundle: [0.95, 1.05, 1.10], .other: [1.00, 1.05, 1.10],
    ]
    /// Out of print this many days or more uses the third column.
    static let caseOldDays = 730.0
}

enum CaseMath {
    /// Units in one case: the real case SKU first, then the count table.
    static func units(_ p: Product) -> Int? { SetLibrary.caseListings[p.id]?.units ?? Balance.caseSize(for: p) }

    /// The factor for a case with no real price (3.3). The print timer is in Model/PrintRuns.swift.
    static func factor(_ p: Product) -> Double {
        let row = Balance.caseFactors[CaseKind(p)] ?? [1, 1.05, 1.10]
        if p.isInPrint { return row[0] }
        let slugs = Set(p.mix.map(\.slug))
        // A set from an older era was out of print long before day 0.
        guard slugs.allSatisfy({ PriceCycle.defaultInPrint($0) }) else { return row[2] }
        let out = PriceCycle.printDays(slugs, day: PriceCycle.today).outOfPrint
        return out < Balance.caseOldDays ? row[1] : row[2]
    }

    /// The market price of a sealed case today. A real price wins over the factor. The real price moves with the
    /// unit's market factor, so a case follows booms, seasons, and print changes like its units.
    static func market(_ p: Product, units: Int) -> Double {
        if let real = SetLibrary.caseListings[p.id], real.units == units {
            return PriceCycle.price(real.market, p.marketFactor())
        }
        return p.market * Double(units) * factor(p)
    }

    static func name(_ p: Product, units: Int) -> String { "\(p.name) · Case of \(units)" }
}
```

The case price reads the unit's market, never `msrp`, so integration 1.4 (`retailMSRP` for buy prices) needs no change here. `PriceCycle.today` is `private(set) static var` (`M/PriceCycle.swift` L162), so it is readable. `PriceCycle.printDays` and `defaultInPrint` are in `M/PrintRuns.swift` L65 and L97.

**`realMarket(of:)` (`M/Counterfeits.swift` L236).** Add the case branch first:

```swift
    func realMarket(of item: SealedItem) -> Double {
        if let units = item.caseUnits, let product = SetLibrary.product(item.productID) {
            return CaseMath.market(product, units: units)
        }
        if let product = SetLibrary.product(item.productID, in: item.setSlug) { return product.market }
        ...
    }
```

**Create a case, in `M/Cases.swift`, `@MainActor extension GameStore`:**

```swift
    /// A sealed case item. `packs` is the pack count of the whole case.
    func makeCase(_ p: Product, units: Int, paid: Double, source: String, status: ItemStatus?, fake: FakeTier? = nil,
                  caseFresh: Bool, grayOrder: UUID? = nil) -> SealedItem {
        var item = SealedItem(setSlug: p.homeSlug, name: CaseMath.name(p, units: units), packs: p.packs * units, paid: paid,
                              acquired: .now, source: source, productID: p.id, status: status, acquiredDay: data.day)
        item.caseUnits = units
        item.caseFresh = caseFresh ? true : nil
        item.fake = fake
        item.grayOrder = grayOrder
        return item
    }
```

**Open a case (free action):**

```swift
    /// Opens a sealed case into its units (docs/12, Cases). A free action. The units stay sealed, and the case premium
    /// goes away. The paid amount splits evenly. The last unit takes the rounding, so the units add up to the case
    /// exactly. A resealed case gives resealed units. Returns the unit IDs.
    /// `forOrder`: only `beginRipShipRip` passes it. A case sold to a viewer opens only for its own order.
    /// `status`: the status of the new units. Nil keeps them in hand.
    @discardableResult
    func openCase(_ id: UUID, status: ItemStatus? = nil, forOrder: UUID? = nil, save saves: Bool = true) -> [UUID] {
        guard let i = data.sealed.firstIndex(where: { $0.id == id }), let units = data.sealed[i].caseUnits,
              let product = SetLibrary.product(data.sealed[i].productID) else { return [] }
        // A case with an online listing stays closed. The player ends the listing first.
        guard data.sealed[i].onlineListing == nil else { return [] }
        switch data.sealed[i].status {
        case nil, .inStore: break
        case .soldToViewer(let order) where order == forOrder: break
        default: return []                       // listed, arriving, consigned, at auction, or sold to another order
        }
        let box = data.sealed.remove(at: i)
        let each = (box.paid / Double(units) * 100).rounded(.down) / 100
        var ids: [UUID] = []
        for k in 0..<units {
            let paid = k == units - 1 ? box.paid - each * Double(units - 1) : each
            var unit = SealedItem(setSlug: product.homeSlug, name: product.name, packs: product.packs, paid: paid,
                                  acquired: box.acquired, source: "Case · \(box.source)", productID: product.id,
                                  status: status, acquiredDay: box.acquiredDay)
            unit.pc = box.pc
            unit.fake = box.fake
            unit.fakeKnown = box.fakeKnown
            unit.verified = box.verified
            unit.caseFresh = box.caseFresh
            unit.grayOrder = box.grayOrder
            ids.append(unit.id)
            data.sealed.append(unit)
        }
        splitHotRecord(caseID: box.id, into: ids)      // Model/Distributor.swift (4.6)
        inheritChallenge(from: box.id, ids)            // a P&L challenge case keeps its units in the challenge
        log("Opened the case: \(units) × \(product.name).")
        if saves { save() }
        return ids
    }
```

**Exclusivity note.** `openCase` builds each unit in a local and appends it. It reads `data.sealed[i]` only before it removes the case. No closure reads `data`. Never call `openCase` from inside a closure on `data.sealed` or `data.ripShip.orders`.

**Why `packs` is the whole case.** `paidPerPack`, the stream rip minutes, and the carry space all read `packs`. The whole-case count is the true count for each of them.

**Rip guards.** A case must open before a rip. `packSlugs(of:)` (`M/GameStore.swift` L609) would treat a case as N × packs packs of its home set, with no promos and no assorted packs. Block it at every entry:

| Site | Change |
|---|---|
| `AppNav.startRip` (`App/AppNav.swift` L76) | `let items = items.filter { !$0.isCase }` before the guard. |
| `RipModel.init` (`M/RipModel.swift` L106) | Build the queue from `items.filter { !$0.isCase }`. A second guard, so no path can rip a closed case. |
| `ShowSession.ripJustBought` (`M/Shows.swift` L1884-1892) | Return nil for a case before `spend`, so a booster box case does not cost 432 minutes. The view hides "Rip it now" for a case. |
| Inventory "Rip" buttons | Hide "Rip" for a case. Show "Open the case" (2.5). |
| `StreamPickSheet` rip list (`Stream/StreamView.swift` L254-256) | `session.items.filter { $0.sealed && !$0.isCase }`. `StreamItem` gets `var isCase = false`. |
| `vendableSealed` (`M/Vending.swift` L235) | Add `$0.caseUnits == nil`. A machine sells units, not cases. |

### 2.4 Proposal 3.4: "case fresh"

A case from the distributor or a case split carries zero fake risk today ([D/14 L35-38](../../14-counterfeit-risk.md)). Keep that zero for every unit, and tag it.

| Source | `caseFresh` |
|---|---|
| Distributor case (`buyWholesale`) | true on the case. `openCase` copies it to each unit. |
| Short-shipped distributor units (loose) | true. The distributor broke the case. No one searched the boxes. |
| Case split box (`joinSplit`, `M/Wholesale.swift` L136-141) | true. Set `item.caseFresh = true` on each box. |
| Plug case | nil. The plug is not a trusted source. |
| Stranger case (show, eBay, Facebook) | nil. The seller can say "case fresh" in the listing text. The game gives no tag. |

**Sale bonus (design value, `Balance.caseFreshSaleBonus = 1.05`).**

- Online: `rollSale(_:market:sealed:slab:name:)` (`M/GameStore.swift` L1432) gets a new last parameter `bonus: Double = 1`. Multiply `reach` by it. In `advanceSealed` (L1234), pass `bonus: item.isCaseFresh ? Balance.caseFreshSaleBonus : 1`.
- Own store: `StoreShelfItem` (`M/CardStore.swift` L566) gets `var caseFresh = false`, set in the sealed map (L587-590). `pickForCustomer` (L595) multiplies the weight by `Balance.caseFreshSaleBonus` when it is true.
- The tag changes no price. No data shows a price premium.

**UI.** Every sealed row and the sealed detail show a small cyan `Tag(text: "CASE FRESH")` when `isCaseFresh`.

### 2.5 The case opening flow (UI)

This flow needs care. It must feel physical, and it must never flash the screen.

**Entry points.**

1. `SealedDetailView` (`Inventory/DetailViews.swift` L417). For a case in hand or in the back room, show a primary button "Open the case". Under it, one line: "You get 10 sealed Elite Trainer Boxes at $35.00 each. The case trades at $735.94. The 10 boxes trade at $714.00. Opening ends the case premium." The numbers come from `realMarket(of:)` and `product.market × units`. When the case trades below its units (a factor under 1), the line says "Opening adds $X of value". When the premium lost is more than `Balance.caseOpenConfirmPremium` ($50), the button opens a `confirmationDialog`: "Opening loses \(money(premium)) of case premium. You cannot close the case again." A case with an online listing shows "End the listing to open the case." in place of the button.
2. The Sealed tab of `InventoryView`. A case row shows `Tag(text: "CASE ×10")` and the case price. A context menu item "Open the case" opens the same sheet. When the player holds 2 or more cases, the tab toolbar shows "Open all cases". That button opens each case with `save: false`, then calls `save()` once, and shows the summary for all of them.
3. The stream (5.10 B). A whole-case Rip & Ship opens the case on camera with the same sheet, in "for a buyer" mode.

**The case detail view (fixes m12).** For a case, `SealedDetailView` changes three parts:

| Part | Today (for a case) | Change |
|---|---|---|
| Contents box (L455) | `packSlugs` falls to N × packs of the home set, so it lists "90 Delta Reign booster packs" | Show "10 × \(product.name)" and the unit's own contents line under it. |
| `looksInside` (L438) | Shows one unit | Pass nil for a case. |
| "Open EV" (L485-487) | One unit's EV against the case market | `store.expectedValue(of: product) * Double(units)` against the case market. |

**New view `Inventory/CaseOpenSheet.swift`: `CaseOpenSheet`.** Inputs: `caseID: UUID`, `forBuyer: String?`, `onDone: ([UUID]) -> Void`. It presents as a sheet with `.presentationDetents([.large])`. In buyer mode the view does not call `openCase` itself. The caller opened the case already (5.4), and the sheet only plays the animation over the unit IDs it gets.

| Step | What the player sees | How it works |
|---|---|---|
| 1. The carton | A brown carton (a `RoundedRectangle` filled `Color(red: 0.55, green: 0.42, blue: 0.28)`), a tan tape stripe across the top, and a small label card in off-white (`Color(white: 0.78)`) with the product name, "QTY 10", and a code like "PKU-10438" (a stable hash of the product ID). The label is small, so it is not a flash. A case that the player flagged as resealed shows the orange `Tag(text: "RESEALED")`. | Static layout. |
| 2. Cut the tape | Text: "Drag along the tape to cut it." A thin cyan line follows the finger along the tape. A small box-cutter SF Symbol (`scissors`) rides at the finger. | A `DragGesture` sets `cutProgress` from 0 to 1 along the tape. At 0.9 or more, the cut completes. A tap on "Cut" skips the drag. Reuse the tear tick sound (`SoundFX`) every 10%. |
| 3. Flaps open | The two top flaps rotate open (`rotation3DEffect` around the hinge, 0.45 s, ease out). A soft dark shadow shows inside. | No light, no flash. |
| 4. Units rise | The units rise out one at a time (stagger 0.08 s) into a grid of `ProductImage` tiles (3 columns). Each tile lands with a thin cyan ring that grows and fades (`Circle().stroke(Theme.cyan.opacity(0.6))`, scale 0.8 to 1.3, opacity 1 to 0, 0.6 s). Case-fresh units show the `CASE FRESH` tag. | `withAnimation(.spring(response: 0.4, dampingFraction: 0.8))`. When Reduce Motion is on, skip steps 2 to 4 and show the grid at once. For 25 units or more, the grid scrolls, and the stagger falls to 0.03 s. |
| 5. Summary | "10 Elite Trainer Boxes · $35.00 each · now in Sealed." | Buttons: "Done", "Rip one now" (calls `nav.startRip([firstUnit])`), "Put on the shelf" (only with a store; calls `stockStore`). In buyer mode: one button "Rip all \(n) for \(buyer)". |

**Reseal hint at opening.** When the case is fake and not yet known, run `Counterfeit.eyeballCatches(tier, id: caseID)` (`M/Counterfeits.swift` L170). When it catches, step 3 shows an orange banner in the `ResealedBanner` style (`Rip/ResealedBanner.swift`): "The factory tape was cut before. These boxes may be resealed." with a button "Mark them as resealed" (`markFakeKnown(sealedID:)` for each unit). The banner slides in from the top. It never flashes.

**Rules for the animation.** Never use a full-screen white or bright flash. Use rings and glows near the tiles only. Keep every large area at or below `Theme.surface` brightness.

### 2.6 Proposal 3.5: cases from strangers, with reseal risk

**A. Show sealed dealer (fixes B3).**

*Stock.* `VendorItem` (`M/Vendors.swift` L190) gets `var caseUnits: Int?`. `VendorItem` is not `Codable`, so there is no save change. In `stock(_:)`, the `.sealedDealer` branch (L339-340):

```swift
        case .sealedDealer:
            add(12...18) { sealed(from: sealedPool(vintage: 0.3, older: 0.35), kind: kind) }
            // One case 20% of the time (docs/12, Cases). The show start rolls its fake (`rollFake`), like every item.
            if Double.random(in: 0..<1) < Balance.dealerCaseChance,
               let p = SetLibrary.catalog.filter({ Balance.wholesaleKinds.contains($0.kind) && Balance.modernSets.contains($0.homeSlug)
                                                   && !$0.isStoreExclusive && CaseMath.units($0) != nil }).randomElement(),
               let units = CaseMath.units(p) {
                let market = CaseMath.market(p, units: units)
                var item = VendorItem(goods: .sealed(p), price: price(market, kind), market: market)
                item.caseUnits = units
                items.append(item)
            }
```

`price(_:_:)` is the existing helper (L357). The fake roll needs no new code. The show start calls `rollFake(source:tired:)` on every vendor item (`M/Shows.swift` L828). `rollFake` (`M/Vendors.swift` L218) uses `market ?? price`, which is the case market, so the whole case gets one roll at the vendor's source rate.

The `seen` filter after the switch (L347-350) drops a second item of one product. Change its key to `"\(p.id)-\(item.caseUnits ?? 1)"`, so a case and a unit of one product can both show.

`VendorItem.name` (L224-230): `case .sealed(let product): caseUnits.map { CaseMath.name(product, units: $0) } ?? product.name`.

*Buy path.* The real path is `ShowSession.buy(_:from:)` (`M/Shows.swift` L2001-2017) → `buyGoods(_:price:from:fake:looksOff:credit:contentsKey:)` (L2021) → `store.buySealedAtShow` (L230). `buyGoods` gets only `VendorGoods`, and `.sealed(product)` has no case count. Pass the count down:

```swift
    // M/Shows.swift L2021
    func buyGoods(_ goods: VendorGoods, price: Double, from seller: String, fake: FakeTier? = nil, looksOff: Bool = false,
                  credit: Double? = nil, contentsKey: String? = nil, caseUnits: Int? = nil) {
        let name = caseUnits.flatMap { units in if case .sealed(let p) = goods { return CaseMath.name(p, units: units) } else { return nil } }
            ?? VendorItem(goods: goods, price: price, market: nil).name
        ...
        case .sealed(let product):
            justBought = store.buySealedAtShow(product, price: price, vendor: seller, at: venue.name, fake: fake, known: known,
                                               credit: credit, contentsKey: caseUnits == nil ? contentsKey : nil, caseUnits: caseUnits)
```

```swift
    // M/Shows.swift L230, new last parameter `caseUnits: Int? = nil`
        if let units = caseUnits {
            var item = makeCase(product, units: units, paid: price, source: "\(vendor), \(venue)", status: nil, fake: fake, caseFresh: false)
            item.fakeKnown = known
            if let credit { addStoreCredit(credit) } else { addLedger(-price, .sealed, "\(item.name) · \(vendor)") }
            data.sealed.append(item)
            log("Bought \(item.name) from \(vendor) at \(venue) for \(credit.map { "\(money($0)) in store credit" } ?? money(price)).",
                cash: credit == nil ? -price : nil)
            save()
            return item
        }
```

A case never gets `contents`. Each unit draws its own `BoxContents` from its own ID after the case opens.

`ShowSession.buy` (L2009) passes `caseUnits: item.caseUnits`. The other `buyGoods` callers (L1469, L1490, L1629, L1650, `M/Stashes.swift` L179, `M/Collections.swift` L842) buy a visitor's goods, never a dealer case, so they keep the default nil.

*Paths that must not take a case.*

| Path | Change |
|---|---|
| Trusted first look (`M/Shows.swift` L831-835) | Skip an item with `caseUnits != nil` when it marks `firstLook`. |
| Vendor trade (`tradeWithVendor`, L287-330) | The trade sheet lists only `get` items with `caseUnits == nil`. |
| Contact holds (`SavedItem.goods`, `findForPlayer`) | `findForPlayer` builds goods from the catalog, never from a dealer case. No change. |
| Stash buys (`M/Stashes.swift`) | Stash items are a visitor's goods. No change. |

**B. eBay and Facebook (`M/Market.swift` L76-170).** `StoreOffer` (L4) gets `var caseUnits: Int?`. `title` (L26) returns `CaseMath.name(p, units:)` for a case. `market` (L40) returns `CaseMath.market(p, units:)` for a case.

After the `switch store` in `offers(for:day:)` (before `return out`, L170), add one case listing on about 1 day in 10. It uses its own seeded generator, so every other listing of the day stays the same:

```swift
        if store == .ebay || store == .facebook, let offer = caseOffer(for: store, day: day) { out.append(offer) }
```

```swift
    /// A stranger's case on about 1 day in 10 (docs/12, Cases). Its own seed keeps the day's other listings the same.
    private static func caseOffer(for store: Storefront, day: Int) -> StoreOffer? {
        let salt: UInt64 = store == .ebay ? 31 : 37
        var r = SeededRandom(seed: UInt64(day + 1) &* 15_485_863 &+ salt)
        guard r.double(0...1) < Balance.onlineCaseListingChance else { return nil }
        // Modern and older eras only, and a price cap: no case of WOTC boxes, no five-figure case.
        let eras = Set(Balance.modernSets + Balance.olderSets)
        let pool = SetLibrary.catalog.filter { p in
            guard Balance.wholesaleKinds.contains(p.kind), !p.isStoreExclusive, eras.contains(p.homeSlug),
                  let units = CaseMath.units(p) else { return false }
            return CaseMath.market(p, units: units) <= Balance.strangerCaseMax
        }
        guard !pool.isEmpty else { return nil }
        let p = pool[r.int(0...(pool.count - 1))]
        guard let units = CaseMath.units(p) else { return nil }
        let market = CaseMath.market(p, units: units)
        let share = store == .ebay ? r.double(Balance.ebayCaseShare) : r.double(Balance.facebookCaseShare)
        let pickup = store == .facebook && r.double(0...1) < 0.5
        let source: FakeSource = store == .ebay ? .ebay : .facebook
        var offer = StoreOffer(id: "\(day)-\(store.rawValue)-case", store: store, item: .product(p, p.homeSlug),
                               price: retail(market * share), shipping: pickup ? 0 : 24.99,
                               deliveryDays: pickup ? 0 : (Balance.deliveryDays[store] ?? 4), pickup: pickup,
                               sellerRating: store == .ebay ? (r.double(96...100) * 10).rounded() / 10 : nil,
                               sellerSales: store == .ebay ? r.int(5...2000) : nil,
                               note: r.double(0...1) < Balance.caseRumorChance ? "Seller says: \"case fresh, and this case is loaded\""
                                                                               : "Seller says: \"case fresh, never searched\"")
        offer.caseUnits = units
        offer.fake = Counterfeit.roll(source: source, sealed: true, slug: p.homeSlug, market: market,
                                      msrp: (p.msrp ?? 0) * Double(units), &r)
        return offer
    }
```

The pool takes a wholesale kind, not a store exclusive, from a modern or older set, with a case size, at a case market of `Balance.strangerCaseMax` ($15,000) or less. The fake roll uses the existing rates: eBay 8% × 0.5 sealed = 4%, Facebook 10% × 0.5 = 5%, and × 1.5 when the case trades over 2 × its MSRP. The roll gets the case MSRP, so the hype factor compares like with like. MSRP is a reference value here, so integration 1.4 allows `msrp`.

A Facebook case is a same-day pickup or a shipment. `caseOffer` never sets `pickupDay`, so `buyLaterPickup` never sees a case, and `Meetup` needs no new field.

Buying it: `buy(_:)` (`M/GameStore.swift` L719-753), `case .product`. When `offer.caseUnits` is set, append `makeCase(product, units:, paid: total, source: "Bought on \(offer.store.rawValue)", status: status, fake: offer.fake, caseFresh: false)` in place of the unit item. The ledger label uses `offer.title`.

**C. "Check the tape and label" (free action).** It halves the chance of a fake. It never removes it.

```swift
extension Counterfeit {
    /// The tape and label check on a case. A fake shows its tell half of the time. The same case always reads the same.
    static func caseCheckCatches(_ tier: FakeTier?, key: String) -> Bool {
        guard tier != nil else { return false }
        var hash: UInt64 = 1469598103934665603
        for b in key.utf8 { hash = (hash ^ UInt64(b)) &* 1099511628211 }
        return Double(hash % 10_000) / 10_000 < Balance.caseCheckCatch
    }

    static func caseTells(_ tier: FakeTier) -> String {
        switch tier {
        case .bootleg: "The label is a photocopy, and the tape is clear store tape."
        case .convincing: "There is old tape under the new tape at one seam."
        case .professional: "The tape and label look right. Nothing to see."
        }
    }
}
```

A professional reseal shows nothing even when the check "catches", because its tell says nothing. That keeps the risk real.

- On a listing: the offer row in `Buy/BuyViews.swift`. For `offer.caseUnits != nil`, show a bordered button "Check the tape and label". It sets a local `@State checked: Set<String>`. When `caseCheckCatches(offer.fake, key: offer.id)`, the row shows the orange tell. Else it shows "The tape and label look right. A check is never proof." The listing is seeded by day, so a second look gives the same result. No save state is needed.
- At a show: the dealer row shows the same button for a case. Its key is the `VendorItem` ID.
- On an owned case: `SealedDetailView` shows the same button for a case with `caseFresh == nil` and `caseChecked != true`. `checkCase(_ id:)` sets `caseChecked = true` and uses `key: id.uuidString`. A caught tell offers "Mark it as resealed" (`markFakeKnown(sealedID:)`).

Expected effect: a player who skips flagged listings meets about half as many fakes. That is the "halves the chance" rule.

### 2.7 Proposal 3.6: case space and the back room

**Carry space (`M/Packing.swift` L113-116).** Integration D1 sets the rule: 1 space plus 1 for each 8 packs. `ShowItem` (`M/Shows.swift` L503) gets `var isCase = false`. The `ShowItem` builder for sealed items sets it from `item.isCase`. Then:

```swift
    /// The space one item takes in its bin. Sealed product: 1 pack is 1 space, more is 1 plus 1 for each 6 packs.
    /// A sealed case packs tighter: 1 plus 1 for each 8 packs (docs/29-packing-and-crowds.md, Cases).
    static func space(_ item: ShowItem) -> Int {
        guard item.kind == .sealed else { return 1 }
        if item.isCase { return 1 + Int((Double(item.packs) / Double(Balance.casePacksPerSpace)).rounded(.up)) }
        return item.packs <= 1 ? 1 : 1 + Int((Double(item.packs) / 6).rounded(.up))
    }
```

| Case | Packs | Space | Fits the 30-space folding cart |
|---|---|---|---|
| Booster box case (6) | 216 | 28 | 1 |
| ETB case (10 × 9) | 90 | 13 | 2 |
| Bundle case (25 × 6) | 150 | 20 | 1 |
| Sleeved booster case | 144 | 19 | 1 |
| 3-pack blister case (24) | 72 | 10 | 3 |

The report said "an ETB case uses 10". The game already counts a loose ETB as 3 spaces and a booster box as 7. One space per unit would make a case smaller than its own loose boxes. Integration D1 keeps this rule. AJ can change it before the build.

**Own store shelf.** A case never goes on the customer shelf. The shelf shows only units (3.6).

| Site | Change |
|---|---|
| `stockStore` room (`M/CardStore.swift` L354) | `let sealedRoom = storeSealedSlots - stock.sealed.filter { !$0.isCase }.count` |
| Shelf items for customers (L587-590) | `stock.sealed.filter { !$0.isCase }` |
| `stockStore` pick (L358) | Split the picked sealed IDs into units and cases. Units use the shelf room. Cases need the back room fixture and back-room room (`Balance.backRoomCases - casesInStore`). |
| `stockable` (L335-338) | No change. A case is stockable when the back room exists. |

**New fixture.** `StoreFixture` (`M/CardStore.swift` L43) gets `case backRoom`:

```swift
        case .backRoom: "Back room"
        ...
        case .backRoom: "Holds up to \(Balance.backRoomCases) sealed cases off the shelf. When a product runs low on the shelf, the store opens a case of it and restocks."
        ...
        case .backRoom: "shippingbox.fill"
```

Add `.backRoom: 600` to `fixtureCosts` (L163). `StoreFixture` is a `String` raw value enum, so old saves decode.

**Back room restock (End Day, integration step 9).** In `M/Cases.swift`:

```swift
    /// The store opens a back-room case when its product runs low on the shelf (docs/22-own-store.md, Back room).
    /// At most one case of each product each night.
    func backRoomRestock() -> [String] {
        guard storeIsBuilt, data.cardStore?.has(.backRoom) == true else { return [] }
        // Read everything into locals first. `openCase` mutates `data.sealed`.
        let stock = storeStock.sealed
        var room = storeSealedSlots - stock.filter { !$0.isCase }.count
        let cases = stock.filter { $0.isCase && $0.onlineListing == nil }
            .map { (id: $0.id, product: $0.productID, units: $0.caseUnits ?? 0, name: $0.name) }
        var restocked: Set<String> = []
        var lines: [String] = []
        let today = data.day
        for c in cases where c.units <= room {
            guard let product = c.product, !restocked.contains(product) else { continue }
            let onShelf = stock.filter { !$0.isCase && $0.productID == product }.count
            guard onShelf <= Balance.backRoomRestockAt else { continue }
            let ids = openCase(c.id, status: .inStore(since: today), save: false)
            guard !ids.isEmpty else { continue }
            restocked.insert(product)
            room -= ids.count
            lines.append("The store opened the \(c.name) from the back room and put \(ids.count) on the shelf.")
        }
        return lines
    }
```

A back-room case with an online listing stays closed, so no listing ends without a line. The loop iterates a local array, and `openCase` runs outside any closure on `data`.

**Store stock rider (D-14).** Integration 4.2 adds a night break-in and an optional store stock rider on the collection policy (+0.6% of store sealed value each 28 days). Back-room cases are store stock: they raise the stored value, so they raise the break-in chance and the rider premium, and a claim under the rider covers them at the normal coverage and deductible. Part B needs no code for this. `realMarket(of:)` already prices a case for the value sum.

### 2.8 Proposal 3.7: every pack stays an independent draw

No code reads `caseUnits`, `caseFresh`, or `grayOrder` when it builds a pack. Add a comment at `RipModel.buildCards` (`M/RipModel.swift` L293):

```swift
    // Every pack is an independent draw from its set's pull rates. A case, a case-fresh tag, or a "loaded" rumor never
    // changes the draw (docs/12-acquiring-product.md, Cases; docs/18-ripping.md).
```

The "loaded case" text lives only in a stranger listing note (2.6 B, 10%). It is never true. There is no market news kind for it, so Part A's market code does not change.

### 2.9 Distributor delivery as cases

`buyWholesale` (3.5) delivers case items. Units that are already on their way in an old save arrive as loose units, as before. No conversion runs.

`WholesaleOffer` (`M/Wholesale.swift` L6-13) gets `let caseMarket: Double`. `wholesaleOffers` fills it with `CaseMath.market(p, units: size)`. The row in `WholesaleView` shows "Case of 10 · $35.00 each · case mkt $735.94". `advanceSealed` (L1216-1258) already groups arrival lines by name, so the line reads "Arrived from the distributor: Delta Reign Elite Trainer Box · Case of 10 ×2."

## 3. The distributor rewards a storefront and tenure (4.1 to 4.6)

### 3.1 Proposal 4.1: name the two tiers

Keep one model, `DistributorAccount`. Add a computed tier in `M/Distributor.swift`:

```swift
/// The two legitimate wholesale tiers (docs/12-acquiring-product.md, Distributor / wholesale).
enum DistributorTier {
    /// No wholesale yet.
    case none
    /// The no-store route: reputation Respected, or a store that waits for its account. Tier-2 terms, no application.
    case secondary
    /// The store route: an approved hobby distributor account.
    case hobby

    var name: String {
        switch self {
        case .none: "No wholesale"
        case .secondary: "Secondary wholesaler"
        case .hobby: "Hobby distributor account"
        }
    }
}
```

**`M/WholesaleAccount.swift` L29.** `hasStoreAccount` changes meaning. It is now "an approved hobby account that is open":

```swift
    /// An approved hobby distributor account that is not closed (docs/12, Distributor / wholesale).
    var hasStoreAccount: Bool {
        guard storeIsBuilt, data.distributor.approvedDay != nil else { return false }
        if let until = data.distributor.closedUntil, data.day < until { return false }
        return true
    }

    var distributorTier: DistributorTier { hasStoreAccount ? .hobby : wholesaleOpen ? .secondary : .none }
```

`wholesaleOpen` (`M/Wholesale.swift` L61) stays `reputationTier >= 3 || storeIsBuilt`. A store that waits for its review buys at secondary terms. Every existing reader of `hasStoreAccount` (price, minimum order, allocation cap, market floor) now follows the approval. That is the intent.

### 3.2 `DistributorAccount` fields and save compatibility

**`M/WholesaleAccount.swift` L6-13.** Replace the struct. It needs a hand-written decoder. The synthesized decoder throws on a missing non-optional key, and then `GameData` falls back to a fresh account, which loses `spent`.

```swift
struct DistributorAccount: Codable, Hashable {
    var spent = 0.0
    var week = -1
    var cases: [String: Int] = [:]
    // The hobby account (Model/Distributor.swift).
    /// The day the player applied, and the day the distributor approved. Nil: not applied, or not approved yet.
    var appliedDay: Int?
    var approvedDay: Int?
    var repContactID: String?
    /// Spend that has not turned into a rep point yet, and the points that spend gave this week.
    var repSpendCarry = 0.0
    var repPointsWeek = -1
    var repPointsThisWeek = 0
    /// The last week that a store event raised the rep relationship.
    var eventWeekCredited = -1
    /// "Push for more allocation": the product, the week it helps, and the day of the last push.
    var pushProductID: String?
    var pushWeek = -1
    var lastPushDay = -1000
    /// The week the Elite priority case was used.
    var eliteCaseWeek = -1
    /// Hot cases and units from the hobby account, until they leave the 28-day check (4.6).
    var hotRecords: [HotAllocationRecord] = []
    /// The day of the last back-door act in the hidden log, so one stretch of sales records one act.
    var lastBackDoorActDay = -1000
    /// The days of back-door warnings, and the penalties. They stay when the store closes.
    var warnings: [Int] = []
    var hotFrozenUntil: Int?
    var closedUntil: Int?

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func v<T: Decodable>(_ key: CodingKeys, _ fallback: T) -> T { (try? c.decodeIfPresent(T.self, forKey: key)) ?? fallback }
        spent = v(.spent, 0)
        week = v(.week, -1)
        cases = v(.cases, [:])
        appliedDay = v(.appliedDay, nil)
        approvedDay = v(.approvedDay, nil)
        repContactID = v(.repContactID, nil)
        repSpendCarry = v(.repSpendCarry, 0)
        repPointsWeek = v(.repPointsWeek, -1)
        repPointsThisWeek = v(.repPointsThisWeek, 0)
        eventWeekCredited = v(.eventWeekCredited, -1)
        pushProductID = v(.pushProductID, nil)
        pushWeek = v(.pushWeek, -1)
        lastPushDay = v(.lastPushDay, -1000)
        eliteCaseWeek = v(.eliteCaseWeek, -1)
        hotRecords = v(.hotRecords, [])
        lastBackDoorActDay = v(.lastBackDoorActDay, -1000)
        warnings = v(.warnings, [])
        hotFrozenUntil = v(.hotFrozenUntil, nil)
        closedUntil = v(.closedUntil, nil)
    }
}

/// One hot case or unit from the hobby account, for the back-door check (4.6).
/// A new field must be Optional. This type decodes inside an array.
struct HotAllocationRecord: Codable, Hashable {
    enum Outcome: String, Codable { case retail, offShelf }
    let itemID: UUID
    let units: Int
    /// The day the case arrives.
    let deliveredDay: Int
    var outcome: Outcome?
    var outcomeDay: Int?
    /// A warning already used this sale.
    var judged: Bool?
}
```

**Migration of a store that already has an account.** In `GameStore.init()` (`M/GameStore.swift` L269-287), after the decode and before `data = saved`, call `Self.grandfatherDistributor(&saved)`:

```swift
    /// A store from a save before the application (4.2) keeps its account. It needs no review.
    private static func grandfatherDistributor(_ d: inout GameData) {
        guard let store = d.cardStore, d.day >= store.openDay, d.distributor.approvedDay == nil, d.distributor.appliedDay == nil else { return }
        d.distributor.appliedDay = store.openDay
        d.distributor.approvedDay = store.openDay
    }
```

After `seedContacts()` (L287), call `ensureRepContact()` (3.4). It creates the rep for a grandfathered account. A store that is still in its build-out on load applies the normal way.

### 3.3 Proposal 4.2: the application

**`M/Distributor.swift`:**

```swift
extension Balance {
    static let distributorReviewDays = 14
}

@MainActor
extension GameStore {
    /// What the hobby account needs, for the checklist on the distributor screen.
    var distributorRequirements: [StoreRequirement] {
        [StoreRequirement(id: "lease", label: "A signed lease", detail: "Your own store.", met: data.cardStore != nil),
         StoreRequirement(id: "build", label: "A finished build-out", detail: "The store is open.", met: storeIsBuilt),
         StoreRequirement(id: "permit", label: "A seller's permit", detail: "A resale certificate for the distributor.", met: hasSellerPermit)]
    }

    var canApplyToDistributor: Bool {
        let closed = data.distributor.closedUntil.map { data.day < $0 } ?? false
        return distributorRequirements.allSatisfy(\.met) && !closed
            && data.distributor.appliedDay == nil && data.distributor.approvedDay == nil
    }

    var distributorDecisionDay: Int? {
        guard let applied = data.distributor.appliedDay, data.distributor.approvedDay == nil else { return nil }
        return applied + Balance.distributorReviewDays
    }

    /// Sends the application. The decision comes in 14 days.
    func applyToDistributor() {
        guard canApplyToDistributor else { return }
        data.distributor.appliedDay = data.day
        log("Applied for a hobby distributor account. The distributor decides on day \(data.day + Balance.distributorReviewDays + 1).")
        save()
    }
}
```

`StoreRequirement` already exists (`M/CardStore.swift` L193-198). `hasSellerPermit` is `data.taxes.permit || data.cardStore != nil` (`M/Taxes.swift` L65). A lease already requires the permit, so in practice the checklist waits for the build-out. The permit row shows the rule, as D/26 will now state it.

The decision runs in `distributorEndDay` (3.8). On the decision day, the distributor approves when the store is built and the permit holds. Else the application lapses with a line. When the store closes (`closeStore`, `M/CardStore.swift` L249), `distributorEndDay` clears `appliedDay` and `approvedDay`. It keeps `hotRecords`, `warnings`, `hotFrozenUntil`, and `closedUntil`, so a close does not end a pending check or a penalty.

**Effect.** A new store waits 14 days after its build-out for the 58% price and the allocation. It buys at secondary terms (72%, $250 minimum, 2 cases a week) during the wait. AJ approved this delay.

### 3.4 Proposal 4.3: the distributor rep

```swift
extension Balance {
    static let repStartPoints = 20
    static let repNames = ["Dana Ruiz", "Mark Osei", "Leah Brandt", "Tom Achebe", "Rachel Kim"]
    /// +1 point for each $1,000 spent, at most 3 a week. +1 for a week with a store event.
    static let repSpendStep = 1000.0
    static let repPointsPerWeek = 3
    static let repEventPoints = 1
    /// "Push for more allocation": the cost, the fill bonus for one product this week, and the wait between pushes.
    static let pushCost = 5
    static let pushFillBonus = 0.25
    static let pushCooldownDays = 28
}

    var repPoints: Int { data.distributor.repContactID.flatMap { contact($0) }.map { points(of: $0) } ?? 0 }

    /// Adds the rep when the account is approved. The rep never goes in the contact book and gives no reputation.
    func ensureRepContact() {
        guard data.distributor.approvedDay != nil, data.distributor.repContactID == nil else { return }
        let id = "distro:rep"
        if !data.contacts.contains(where: { $0.id == id }) {
            var rep = Contact(id: id, name: Balance.repNames.randomElement() ?? "Dana Ruiz", kind: .distributorRep,
                              points: Balance.repStartPoints, interests: [.sealed])
            rep.rewardedLevel = 4
            rep.lastDealDay = data.day
            data.contacts.append(rep)
        }
        data.distributor.repContactID = id
    }

    /// Spend raises the rep: 1 point for each $1,000, at most 3 a week. The remainder carries over.
    func creditRepSpend(_ amount: Double) {
        var a = data.distributor
        guard let id = a.repContactID, amount > 0 else { return }
        let week = data.day / 7
        let today = data.day
        if a.repPointsWeek != week { a.repPointsWeek = week; a.repPointsThisWeek = 0 }
        a.repSpendCarry += amount
        let steps = Int(a.repSpendCarry / Balance.repSpendStep)
        a.repSpendCarry -= Double(steps) * Balance.repSpendStep
        let earned = max(0, min(steps, Balance.repPointsPerWeek - a.repPointsThisWeek))
        a.repPointsThisWeek += earned
        data.distributor = a          // write the account back before the next call on `data`
        if let i = data.contacts.firstIndex(where: { $0.id == id }) { data.contacts[i].lastDealDay = today }
        if earned > 0 { addPoints(id, earned) }
    }

    /// "Push for more allocation" (4.3). Costs 5 rep points. One product gets a better fill this week.
    func pushForAllocation(_ productID: String) -> String? {
        var a = data.distributor
        guard hasStoreAccount, let id = a.repContactID else { return "You need a hobby distributor account." }
        guard data.day - a.lastPushDay >= Balance.pushCooldownDays else {
            return "You pushed recently. Wait until day \(a.lastPushDay + Balance.pushCooldownDays + 1)."
        }
        a.pushProductID = productID
        a.pushWeek = data.day / 7
        a.lastPushDay = data.day
        data.distributor = a
        addPoints(id, -Balance.pushCost)
        log("You pushed your rep for more allocation. It cost goodwill.")
        save()
        return nil
    }

    /// A store event last week raises the rep (Monday, in `distributorEndDay`).
    private func weeklyRepCredit() {
        guard hasStoreAccount, let id = data.distributor.repContactID, let s = data.cardStore, s.has(.playTables),
              let ev = s.events else { return }
        let week = data.day / 7
        // An event ran last week when its afterglow day is in the last 7 days (Model/StoreEvents.swift L33-35).
        guard ev.afterglowDay >= data.day - 7, data.distributor.eventWeekCredited != week else { return }
        data.distributor.eventWeekCredited = week
        addPoints(id, Balance.repEventPoints)
    }
```

**Pattern note.** Each function copies `data.distributor` into a local, changes the local, and writes it back. Only then does it call `addPoints`, which writes `data.contacts`. No closure reads `data`.

`recordWholesale` (`M/WholesaleAccount.swift` L61-70) keeps its job: it counts the cases of the week. It no longer adds `spent`. `buyWholesale` adds the charged total and calls `creditRepSpend` (3.5), so a request that does not fill adds no spend.

### 3.5 Proposals 4.4 and 4.5: the fill rate and Elite priority

**Hot allocation stays at 1 case a week (D-3, sim R3).** A hot product never grows past `allocationBase`. Only a product that is not hot grows to `allocationMax`. `wholesaleCap` (`M/WholesaleAccount.swift` L44-47):

```swift
    func wholesaleCap(_ product: Product) -> Int {
        guard isHot(product) else {
            return min(Balance.allocationMax, Balance.allocationBase + Int(data.distributor.spent / Balance.allocationStep)) + 1
        }
        if hotFrozen { return 0 }
        return Balance.allocationBase + (eliteCaseOpen ? 1 : 0)
    }
```

The simulation measured the effect: a shop owner gets 2.4 hot cases a week, not 12.3, and the hot margin falls from about $604,000 to about $119,000 a year (`sim_report.md` section 7). `isHot(_:)` is the integration 1.4 wrapper of `Product.isHot()` (Part A).

The secondary branch of `wholesaleLeft` (L53-56) adds the Elite case for a hot product:

```swift
        guard hasStoreAccount else {
            let elite = isHot(offer.product) && eliteCaseOpen ? 1 : 0
            let week = account.week == data.day / 7 ? account.cases.values.reduce(0, +) : 0
            return max(0, min(1 + elite - bought, Balance.wholesaleCasesPerWeek + elite - week))
        }
```

**The fill rate (`M/Distributor.swift`):**

```swift
extension Balance {
    /// Integration D2: 0.05, so a new account at high pressure gets about the real Prismatic Evolutions low.
    static let fillBase = 0.05
    static let fillPressureWeight = 0.35
    static let fillRepWeight = 0.20
    static let fillMax = 0.90
}

    /// The chance that one requested hot case arrives (4.4). The secondary wholesaler has no rep, so its rep term is 0.
    /// Reads Part A's `data.flipperPressure` (0.1 to 0.9).
    func hotFillRate(_ product: Product) -> Double {
        #if DEBUG
        if let forced = GameStore.forceFill { return forced }
        #endif
        let pressure = data.flipperPressure
        let rep = hasStoreAccount ? Double(repPoints) / 100 : 0
        var fill = Balance.fillBase + Balance.fillPressureWeight * (1 - pressure) + Balance.fillRepWeight * rep
        let a = data.distributor
        if hasStoreAccount, a.pushProductID == product.id, a.pushWeek == data.day / 7 { fill += Balance.pushFillBonus }
        return min(Balance.fillMax, max(0, fill))
    }

    /// Elite gets one hot case each week that skips the fill roll (4.5).
    var eliteCaseOpen: Bool { reputationTier >= 4 && data.distributor.eliteCaseWeek != data.day / 7 }

    var hotFrozen: Bool { data.distributor.hotFrozenUntil.map { data.day < $0 } ?? false }
```

| Pressure | Rep | Fill |
|---|---|---|
| 0.9 | 0 (secondary) | 0.085 |
| 0.9 | 20 (new account) | 0.125 |
| 0.5 | 50 | 0.325 |
| 0.3 | 80 | 0.455 |
| 0.1 | 100 | 0.565 |

These match the real range: 10% to 15% in the Prismatic Evolutions shortage, and 30% to 50% in normal 2026 conditions. The simulation gives 0.27 for a new account and 0.43 for a tenured one over a whole run.

**`wholesaleOffers` (`M/Wholesale.swift` L65-81).** The unit price reads `retailMSRP()` (integration 1.4), so the MSRP step reaches the buy price:

```swift
            let msrpNow = p.retailMSRP() ?? p.market
            out.append(WholesaleOffer(id: "w\(data.day / 7)-\(i)", product: p, caseSize: size,
                                      unitPrice: Market.retail(max(msrpNow * wholesaleDiscountNow, floor)),
                                      caseMarket: CaseMath.market(p, units: size)))
```

The filter keeps `$0.msrp != nil`, so `retailMSRP()` is never nil there.

**`buyWholesale` (`M/Wholesale.swift` L83-113), full replacement:**

```swift
extension Balance {
    /// Part A owns `wholesaleMissingChance` (0.01) and `missingShipmentRefundDays` (14). D-12.
}

    /// Buys cases. The secondary wholesaler has a $250 minimum order (`Balance.wholesaleMinOrder`). A hobby account has
    /// no minimum, but it can buy only its weekly allocation. Hot product fills only part of the request (4.4). The order
    /// arrives in 5 days as sealed cases. 1 order in 100 goes missing, and the distributor refunds it later.
    func buyWholesale(_ offer: WholesaleOffer, cases: Int) -> String? {
        guard cases > 0 else { return nil }
        if let left = wholesaleLeft(offer), cases > left {
            return left == 0 ? "Your allocation of this product is used up this week."
                             : "Your allocation has \(left) more case\(left == 1 ? "" : "s") of this product this week."
        }
        let requested = offer.casePrice * Double(cases)
        guard requested >= wholesaleMinOrderNow else { return "The minimum order is \(money(Balance.wholesaleMinOrder))." }
        guard canAfford(requested) else { return "You need \(money(requested)). You have \(money(cash))." }
        // 1. The fill roll. Read every value into locals first.
        let hot = isHot(offer.product)
        let fill = hotFillRate(offer.product)
        let week = data.day / 7
        let today = data.day
        var filled = cases
        var usedElite = false
        if hot {
            filled = 0
            var rolls = cases
            if eliteCaseOpen { filled = 1; rolls -= 1; usedElite = true }
            for _ in 0..<rolls where Double.random(in: 0..<1) < fill { filled += 1 }
        }
        if usedElite { data.distributor.eliteCaseWeek = week }
        // The request uses the allocation, even when it does not fill.
        recordWholesale(offer, cases: cases)
        guard filled > 0 else {
            log("The distributor filled 0 of \(cases) case\(cases == 1 ? "" : "s") of \(offer.product.name). Hot product is short. Nothing was charged.")
            save()
            return "Hot product is short. The distributor filled 0 of \(cases). Nothing was charged."
        }
        // 2. The charge, for the filled cases only.
        let total = offer.casePrice * Double(filled)
        let orderName = "\(filled) case\(filled == 1 ? "" : "s") of \(offer.product.name)"
        addLedger(-total, .wholesale, "\(orderName) · Distributor")
        // 3. The missing-shipment roll (integration 1.5, D-12). No items, no hot records, no rep credit, no spend.
        #if DEBUG
        let missing = GameStore.forceWholesaleMissing ?? (Double.random(in: 0..<1) < Balance.wholesaleMissingChance)
        #else
        let missing = Double.random(in: 0..<1) < Balance.wholesaleMissingChance
        #endif
        if missing {
            registerMissingShipment(name: orderName, refund: total, learnIn: Balance.wholesaleDeliveryDays)
            log("Ordered \(orderName) from the distributor for \(money(total)). It should arrive in \(Balance.wholesaleDeliveryDays) days.", cash: -total)
            save()
            return nil
        }
        data.distributor.spent += total
        creditRepSpend(total)
        // 4. The short-ship roll (the existing 12%) and the delivery as cases.
        let ordered = filled * offer.caseSize
        let shipped = Double.random(in: 0..<1) < Balance.wholesaleShortChance
            ? max(1, Int(Double(ordered) * Double.random(in: Balance.wholesaleShortShare))) : ordered
        if shipped < ordered {
            let refund = offer.unitPrice * Double(ordered - shipped)
            addLedger(refund, .wholesale, "Short shipment refund · \(offer.product.name)")
            log("The distributor is short on \(offer.product.name). It ships \(shipped) of \(ordered) and refunds \(money(refund)).", cash: refund)
        }
        let arriving = ItemStatus.arriving(daysLeft: Balance.wholesaleDeliveryDays, from: "the distributor")
        var newItems: [SealedItem] = []
        for _ in 0..<(shipped / offer.caseSize) {
            newItems.append(makeCase(offer.product, units: offer.caseSize, paid: offer.casePrice, source: "Wholesale",
                                     status: arriving, caseFresh: true))
        }
        for _ in 0..<(shipped % offer.caseSize) {
            var u = SealedItem(setSlug: offer.product.homeSlug, name: offer.product.name, packs: offer.product.packs,
                               paid: offer.unitPrice, acquired: .now, source: "Wholesale", productID: offer.product.id,
                               status: arriving, acquiredDay: today)
            u.caseFresh = true
            newItems.append(u)
        }
        data.sealed += newItems
        // 5. Hot cases on the hobby account go into the back-door check (4.6).
        if hot, hasStoreAccount {
            let delivered = today + Balance.wholesaleDeliveryDays
            data.distributor.hotRecords += newItems.map { HotAllocationRecord(itemID: $0.id, units: $0.caseUnits ?? 1, deliveredDay: delivered) }
        }
        let fillText = filled < cases ? " The distributor filled \(filled) of \(cases)." : ""
        log("Ordered \(orderName) from the distributor for \(money(total)).\(fillText) It arrives in \(Balance.wholesaleDeliveryDays) days.", cash: -total)
        save()
        return filled < cases ? "Hot product is short. The distributor filled \(filled) of \(cases) and charged only for those." : nil
    }
```

`recordWholesale(_:cases:)` drops its `total` parameter, and its `account.spent += total` line moves into `buyWholesale` as above. `registerMissingShipment(name:refund:learnIn:)` is Part A's function (D-12). `learnIn` is the normal delivery time. Part A pays the refund `missingShipmentRefundDays` (14) after that.

A product that is not hot keeps the full request and the existing +1 case.

### 3.6 Proposal 4.6: back-door sales of hot allocation (D-3)

**What counts.** D-3 sets the rule. A hot unit counts as **retail** when it sells on the own shelf (clerk or counter), from a vending machine, on Rip & Ship, on a normal Whatnot stream, or at a show table by the player. It also counts as retail when the player opens it. It counts as **off-shelf** only when it sells to an outside reseller channel: eBay, an eBay auction, TCGplayer, a Facebook sale or lot, a trade to a dealer, or a sale of a whole case. An unsold unit counts as neither.

**Hooks.**

| Hook | File | Change |
|---|---|---|
| Every sale | `addReceipt` (`M/Sales.swift` L33-37) | New parameter `offShelf: Bool = false`. Call `noteAllocationSold(ids, offShelf: offShelf)`. All 13 call sites already pass the item IDs. |
| Online sales | `completeSaleNow` (`M/GameStore.swift` L1489-1501) | Pass `offShelf: [.ebay, .ebayAuction, .tcgplayer, .facebook].contains(channel)`. Lots sell through this path, so a lot is off-shelf. A Facebook meetup sale (`M/Meetups.swift` L166) uses `.facebook`, so it is off-shelf. |
| Auction house, game shop consignment | `M/AuctionHouse.swift` L206, `M/Consignment.swift` L55 | Pass `offShelf: true`. Both are other sellers. |
| The own shelf, the counter, vending, Rip & Ship, shows, the sealed collector opportunity | `M/CardStore.swift` L621, `M/Shows.swift` L202, `M/Vending.swift` L410, 5.4 `createRipShipOrder`, `M/Opportunities.swift` L305 | No change: the default `false` is retail. |
| A trade to a dealer | `tradeWithVendor` (`M/Shows.swift` L287) | `noteAllocationSold(give.map(\.id), offShelf: true)`. A trade at the table (`tradeAtShow`, L260) is a sale to a person, so it is retail: `noteAllocationSold([item.id], offShelf: false)`. |
| The player opens the product | `openProduct` (L632) and the first-pack branch of `commitPack` (L668) | `noteAllocationOpened(item.id)`. |
| A case opens into units | `openCase` (2.3) | `splitHotRecord(caseID:into:)`. |
| A giveaway, a theft, a seizure | none | No outcome. The unit leaves the check. |

```swift
    func noteAllocationSold(_ ids: [UUID], offShelf: Bool) {
        guard !data.distributor.hotRecords.isEmpty else { return }
        let set = Set(ids)
        let today = data.day
        for i in data.distributor.hotRecords.indices where set.contains(data.distributor.hotRecords[i].itemID)
                                                        && data.distributor.hotRecords[i].outcome == nil {
            // A whole case sold to someone is a reseller sale on any channel.
            let off = offShelf || data.distributor.hotRecords[i].units > 1
            data.distributor.hotRecords[i].outcome = off ? .offShelf : .retail
            data.distributor.hotRecords[i].outcomeDay = today
        }
    }

    func noteAllocationOpened(_ id: UUID) {
        let today = data.day
        for i in data.distributor.hotRecords.indices where data.distributor.hotRecords[i].itemID == id
                                                        && data.distributor.hotRecords[i].outcome == nil {
            data.distributor.hotRecords[i].outcome = .retail
            data.distributor.hotRecords[i].outcomeDay = today
        }
    }

    func splitHotRecord(caseID: UUID, into ids: [UUID]) {
        guard let i = data.distributor.hotRecords.firstIndex(where: { $0.itemID == caseID }) else { return }
        let r = data.distributor.hotRecords.remove(at: i)
        data.distributor.hotRecords += ids.map { HotAllocationRecord(itemID: $0, units: 1, deliveredDay: r.deliveredDay) }
    }
```

The `for i in indices where ...` loops read `data` in the `where` clause, not in a closure passed to a mutating call. The `ids.map` closure reads only the local `r`. `noteAllocationSold` runs inside `addReceipt`. None of the 13 call sites runs inside a closure on `data`, and no code passes `&data.x` as an `inout` argument, so the write is safe.

**The shelf share (D-3, I2).** One computed value feeds the check and the UI:

```swift
extension Balance {
    static let backDoorWindowDays = 28
    static let backDoorShelfShare = 0.40
    static let backDoorNoticeChance = 0.15
    /// The check needs at least this many sold units, and at least half of the hot units delivered in the window.
    static let backDoorMinUnits = 6
    static let backDoorMinShare = 0.5
    static let backDoorRepCost = 15
    static let backDoorWarningWindowDays = 84
    static let hotFreezeDays = 28
    static let accountCloseDays = 84
    /// A record leaves the list this many days after its sale, or after its delivery when it never sold.
    static let hotRecordKeepDays = 56
}

    /// The hot units sold in the last 28 days that no warning used yet: retail, off-shelf, and the units delivered.
    var hotSalesWindow: (retail: Int, offShelf: Int, delivered: Int) {
        let from = data.day - Balance.backDoorWindowDays
        var retail = 0, off = 0, delivered = 0
        for r in data.distributor.hotRecords {
            if r.deliveredDay > from { delivered += r.units }
            guard let day = r.outcomeDay, day > from, r.judged != true else { continue }
            if r.outcome == .retail { retail += r.units } else if r.outcome == .offShelf { off += r.units }
        }
        return (retail, off, delivered)
    }

    /// The share that the store screen and the rep box show. Nil when no hot unit sold in the window.
    var hotShelfShare: Double? {
        let w = hotSalesWindow
        let sold = w.retail + w.offShelf
        return sold == 0 ? nil : Double(w.retail) / Double(sold)
    }
```

**The weekly check (Monday, in `distributorEndDay`).** It runs while any record exists, also after a store close, so a close does not end a pending check.

```swift
    private func backDoorCheck() -> [String] {
        let today = data.day
        let keep = today - Balance.hotRecordKeepDays
        data.distributor.hotRecords.removeAll { ($0.outcomeDay ?? $0.deliveredDay) <= keep }     // reads only a local
        guard !data.distributor.hotRecords.isEmpty else { return [] }
        let w = hotSalesWindow
        let sold = w.retail + w.offShelf
        let need = max(Balance.backDoorMinUnits, Int((Double(w.delivered) * Balance.backDoorMinShare).rounded(.up)))
        guard sold >= need else { return [] }
        let share = Double(w.retail) / Double(sold)
        guard share < Balance.backDoorShelfShare else { return [] }
        // The act is a secret even when the rep does not notice (Part C). One act for one stretch of sales.
        if today - data.distributor.lastBackDoorActDay >= Balance.backDoorWindowDays {
            data.distributor.lastBackDoorActDay = today
            recordHiddenAct(.backDoorAllocation, weight: max(0.6, min(1.5, 1.5 * (1 - share))),
                            note: "\(w.offShelf) of \(sold) hot units from the distributor went to resellers.")
        }
        #if DEBUG
        let notice = GameStore.forceBackDoorNotice ?? (Double.random(in: 0..<1) < Balance.backDoorNoticeChance)
        #else
        let notice = Double.random(in: 0..<1) < Balance.backDoorNoticeChance
        #endif
        guard notice else { return [] }
        // The sales that brought this warning do not count again.
        let from = today - Balance.backDoorWindowDays
        for i in data.distributor.hotRecords.indices where (data.distributor.hotRecords[i].outcomeDay ?? -1) > from {
            data.distributor.hotRecords[i].judged = true
        }
        return [backDoorWarning()]
    }

    private func backDoorWarning() -> String {
        var a = data.distributor
        let today = data.day
        let cutoff = today - Balance.backDoorWarningWindowDays
        a.warnings = a.warnings.filter { $0 >= cutoff } + [today]
        var line = "Your distributor rep noticed that your hot cases go to resellers, not to your shelf. This is a warning."
        if a.warnings.count >= 3 {
            a.closedUntil = today + Balance.accountCloseDays
            a.warnings = []
            a.hotFrozenUntil = nil
            line = "Your distributor closed your account for 12 weeks. Your hot cases kept going out the back door. You buy from the secondary wholesaler until day \(today + Balance.accountCloseDays + 1)."
        } else if a.warnings.count == 2 {
            a.hotFrozenUntil = today + Balance.hotFreezeDays
            line = "Second warning from your distributor rep. No hot product for your account for 4 weeks."
        }
        let rep = a.repContactID
        data.distributor = a
        addPoints(rep, -Balance.backDoorRepCost)
        return line
    }
```

**Effect.** A new store with one booster box case is judged once it sells 6 units. A store that sells 70% of its hot stock on Rip & Ship and 30% on its shelf is never warned: both are retail (sim R4). The simulation measured the old rule: that store lost its account in 61% of runs. A store that sends 70% to eBay is judged the first Monday after 6 sold units.

### 3.7 Elite gap and the D/04 conflict

Proposal 4.5 closes the gap between D/04, D/12, and the code. Section 7 updates both docs. D/04 L30-31 also says a Respected player with no store keeps the 72% price "with no limit". The code limits that player to 1 case of each product and 2 cases a week. Section 7 corrects D/04 to the code.

### 3.8 `distributorEndDay` (End Day)

```swift
    /// The application decision, closures that end, and on Monday the rep credit, the back-door check, and the plug rumor.
    func distributorEndDay() -> [String] {
        var lines: [String] = []
        let today = data.day
        let built = storeIsBuilt
        let permit = hasSellerPermit
        let storeGone = data.cardStore == nil
        var a = data.distributor
        var approvedNow = false
        if storeGone, a.appliedDay != nil || a.approvedDay != nil {
            // The account closes with the store. The records, warnings, and penalties stay.
            a.appliedDay = nil
            a.approvedDay = nil
        }
        if let applied = a.appliedDay, a.approvedDay == nil, today >= applied + Balance.distributorReviewDays {
            if built && permit {
                a.approvedDay = today
                approvedNow = true
                lines.append("The distributor approved your hobby account. You buy at \(Int(Balance.storeWholesaleDiscount * 100))% of MSRP now, with a weekly allocation.")
            } else {
                a.appliedDay = nil
                lines.append("Your distributor application lapsed. Your store was not open on the decision day.")
            }
        }
        if let until = a.closedUntil, today >= until {
            a.closedUntil = nil
            lines.append("Your distributor opened your account again.")
        }
        if let until = a.hotFrozenUntil, today >= until { a.hotFrozenUntil = nil }
        data.distributor = a
        if approvedNow { ensureRepContact() }
        if weekday == 0 {
            weeklyRepCredit()
            lines += backDoorCheck()
            lines += plugRepCheck()        // Model/Plug.swift (4.5)
        }
        return lines
    }
```

Every read of `data` happens before the one write of `data.distributor`. The calls after it do their own reads and writes in sequence.

### 3.9 Distributor UI

**`WholesaleView` (`Buy/WholesaleViews.swift` L5-66).**

| Part | Change |
|---|---|
| Title | `navigationTitle(store.distributorTier.name)` when the tier is not `.none`. Else "Distributor". |
| Header line (L14) | "72% of MSRP · secondary wholesaler · minimum $250 · 5-day delivery" or "58% of MSRP · hobby account · 5-day delivery". |
| New box "Hobby distributor account" (above "Your allocation") | Before the application: the three `distributorRequirements` rows with a check or a circle, then the button "Apply · decision in 14 days" (`applyToDistributor()`), enabled by `canApplyToDistributor`. During review: "Under review. The distributor decides on day N. Until then you buy at secondary terms." While closed: "Your account is closed until day N." While frozen: "No hot product until day N." |
| "Your allocation" text (L21) | "Hot product: 1 case of each product a week. The rest: 2 cases, and 1 more for each $6,000 you spend here, up to 6." |
| New box "Your rep" (hobby account only) | The rep name, a relationship bar (0 to 100, `ProgressView`), and "Hot fill about 33%" from `hotFillRate` of the first hot offer. The shelf share line: "Hot product sold to customers, last 4 weeks: 62%. Your rep wants 40% or more." (from `hotShelfShare`; "No hot sales yet" when nil; orange under 40%). One line: "Spend and store events raise the relationship. Sales to resellers lower it." A menu button "Push for more allocation (−5)" that lists this week's hot offers and calls `pushForAllocation`. It is disabled during the cooldown, with the day shown. |
| Warnings | When `warnings` is not empty: an orange `Banner` "Warnings from your rep: 1 of 3 in 12 weeks." |
| Each offer row (L30-58) | Add "case mkt $X" to the price line. For a hot product: "hot · fill about N%". At Elite with the case open: a cyan line "Elite: 1 hot case this week skips the fill." After an order, the `message` banner shows the fill result. |
| Empty state (L26-28) | Keep "Wholesale opens at reputation Respected, or when your own store opens." When `plugOpen`, show `PlugSection()` under it (4.6). |
| Bottom | `PlugSection()` when `plugOpen` and wholesale is open. |

**Store screen (`Hub/CardStoreView.swift`).** In the store's summary, add the same shelf share line when the hobby account has hot records (D-3).

**`ContactsView` (`Hub/ContactsView.swift`).** A section "Suppliers" lists contacts with `kind.isSupplier`: the name, the kind, and the relationship. Suppliers never show "Add to book".

**Calendar (fixes m16).** `calendarEntries(day:)` (`M/Shows.swift` L379) adds `CalendarEntry(kind: .store, title: "Distributor decision", detail: "Your hobby account application")` when `day == distributorDecisionDay`. The `Kind` enum does not change.

## 4. The gray plug charges for risk (4.7, 4.8)

### 4.1 Types (`M/Plug.swift`, new)

```swift
import Foundation

// The gray plug (docs/12-acquiring-product.md, The plug). A tier-2 seller with no invoice. It sells only full cases of
// hot in-print products that exist now, so it is not a preorder.

enum PlugOrderState: String, Codable { case waiting, delivered, vanished, seized }

/// A new field must be Optional. This type decodes inside an array.
struct PlugOrder: Codable, Identifiable, Hashable {
    var id = UUID()
    let productID: String
    let productName: String
    let cases: Int
    let caseUnits: Int
    let unitPrice: Double
    let total: Double
    let orderedDay: Int
    let arrivesDay: Int
    /// Fixed when the order goes in, so the order row can show the risk the player took.
    let vanishChance: Double
    var state: PlugOrderState = .waiting
    /// The units that arrived, and the units that the plug came up short.
    var shippedUnits: Int?
    var deliveredIDs: [UUID] = []
    var seizeDay: Int?
    /// The `plugPurchase` act of this order (Part C), so a seizure can expose it.
    var actID: UUID?
}

struct PlugState: Codable, Hashable {
    var name: String?
    var unlockedDay: Int?
    /// The plug vanished on this day. A new plug can appear `plugReturnDays` later.
    var goneDay: Int?
    var cleanOrders = 0
    var orders: [PlugOrder] = []

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func v<T: Decodable>(_ key: CodingKeys, _ fallback: T) -> T { (try? c.decodeIfPresent(T.self, forKey: key)) ?? fallback }
        name = v(.name, nil)
        unlockedDay = v(.unlockedDay, nil)
        goneDay = v(.goneDay, nil)
        cleanOrders = v(.cleanOrders, 0)
        orders = v(.orders, [])
    }
}
```

The plug contact always uses the ID `"plug"` (1.6). The hand-written decoder follows the `GameData` pattern, so a later field cannot wipe the orders of an old save.

### 4.2 Constants and offers

```swift
extension Balance {
    /// The plug appears with this chance each day, from day 14, at follower tier 1 or reputation Known.
    static let plugUnlockChance = 0.10
    static let plugMinDay = 14
    static let plugReturnDays = 28
    static let plugNames = ["Vince", "J-Money Sealed", "Kev (wholesale)", "BoxPlug_TX", "Rico"]
    static let plugMsrpShare = 0.85
    static let plugMarketFloor = 0.65
    static let plugOffersPerWeek = 3
    static let plugOffersLowPressure = 1
    static let plugMaxOrder = 20_000.0
    static let plugMaxCases = 5
    static let plugDeliveryDays = 5...10
    /// The plug vanishes: 6%, +1 point for each $1,000 above $2,000, at most 16%. Each clean order takes 1 point off,
    /// down to 3%.
    static let plugVanishBase = 0.06
    static let plugVanishStep = 0.01
    static let plugVanishFree = 2000.0
    static let plugVanishMax = 0.16
    static let plugVanishFloor = 0.03
    static let plugTrustStep = 0.01
    static let plugShortChance = 0.10
    static let plugShortShare = 0.6...0.9
    static let plugSeizeChance = 0.02
    static let plugSeizeDays = 3...14
    /// A hobby account that bought from a plug in the last 4 weeks: the rep learns of it with this chance each week.
    static let plugRepLearnChance = 0.10
    static let plugRepLearnCost = 20
    static let plugRepLearnWindowDays = 28
}

@MainActor
extension GameStore {
    var plugOpen: Bool { data.plug.unlockedDay != nil && data.plug.goneDay == nil }

    /// This week's plug cases: hot in-print products, full cases only. The same week gives the same offers.
    /// Low flipper pressure (Part A) means hot product is on shelves, so the gray channel has less.
    var plugOffers: [WholesaleOffer] {
        guard plugOpen else { return [] }
        var r = SeededRandom(seed: UInt64(data.day / 7 + 1) &* 92_821 &+ 4_441)
        let count = data.flipperPressure < 0.3 ? Balance.plugOffersLowPressure : Balance.plugOffersPerWeek
        let pool = SetLibrary.catalog.filter {
            $0.isInPrint && Balance.wholesaleKinds.contains($0.kind) && $0.msrp != nil && !$0.isStoreExclusive
                && CaseMath.units($0) != nil && isHot($0)
        }
        var out: [WholesaleOffer] = []
        for i in 0..<count where !pool.isEmpty {
            let p = pool[r.int(0...(pool.count - 1))]
            guard !out.contains(where: { $0.product.id == p.id }), let size = CaseMath.units(p) else { continue }
            let msrpNow = p.retailMSRP() ?? p.market            // integration 1.4: buy prices read retail MSRP
            let unit = Market.retail(max(msrpNow * Balance.plugMsrpShare, p.market * Balance.plugMarketFloor))
            out.append(WholesaleOffer(id: "plug\(data.day / 7)-\(i)", product: p, caseSize: size, unitPrice: unit,
                                      caseMarket: CaseMath.market(p, units: size)))
        }
        return out
    }

    func plugVanishChance(total: Double) -> Double {
        let size = Balance.plugVanishStep * max(0, (total - Balance.plugVanishFree) / 1000)
        let trust = Balance.plugTrustStep * Double(data.plug.cleanOrders)
        return max(Balance.plugVanishFloor, min(Balance.plugVanishMax, Balance.plugVanishBase + size) - trust)
    }
}
```

The `isHot` filter uses Part A's hot test (integration 1.4). The price rule `max(85% of retail MSRP, 65% of market)` sits above the hobby price and below market. The simulation found the plug a strict loss against every legal route for each dollar, and a gain only as extra volume after the legal caps (`sim_report.md` 4.4). That is the report's intent. `plugMarketFloor` stays 0.65 (D-13 did not adopt 0.55).

### 4.3 Ordering (100% prepaid)

```swift
    /// Prepays a plug order from the cash balance. No invoice: the ledger uses `.grayMarket`, which income tax ignores.
    func orderFromPlug(_ offer: WholesaleOffer, cases: Int) -> String? {
        guard plugOpen, cases > 0, cases <= Balance.plugMaxCases else { return nil }
        let total = offer.casePrice * Double(cases)
        guard total <= Balance.plugMaxOrder else { return "The plug does not take orders over \(money(Balance.plugMaxOrder))." }
        guard canAfford(total) else { return "You need \(money(total)). You have \(money(cash))." }
        let chance = plugVanishChance(total: total)
        let name = data.plug.name ?? "The plug"
        let today = data.day
        let arrives = today + Int.random(in: Balance.plugDeliveryDays)
        addLedger(-total, .grayMarket, "\(cases) case\(cases == 1 ? "" : "s") of \(offer.product.name) · \(name) · prepaid")
        var order = PlugOrder(productID: offer.product.id, productName: offer.product.name, cases: cases, caseUnits: offer.caseSize,
                              unitPrice: offer.unitPrice, total: total, orderedDay: today, arrivesDay: arrives, vanishChance: chance)
        order.actID = recordHiddenAct(.plugPurchase, weight: max(0.3, min(2.0, total / 2000)),
                                      note: "Bought \(cases) case\(cases == 1 ? "" : "s") of \(offer.product.name) from \(name)",
                                      sourceID: order.id)
        data.plug.orders.append(order)
        log("Prepaid \(name) \(money(total)) for \(cases) case\(cases == 1 ? "" : "s") of \(offer.product.name). It should come in \(arrives - today) days.", cash: -total)
        save()
        return nil
    }
```

`recordHiddenAct` runs before the append, and not inside a closure. Its result goes into the local `order`. The weight follows Part C's table (section 1.4): order size ÷ $2,000, from 0.3 to 2.0.

### 4.4 `plugEndDay` (End Day)

```swift
    func plugEndDay() -> [String] {
        var lines: [String] = []
        let today = data.day
        // 1. A new plug: the first time, or 28 days after the last one vanished. One contact ID, so the list never grows.
        let eligible = followerTier >= 1 || reputationTier >= 1
        let returnOK = data.plug.goneDay.map { today >= $0 + Balance.plugReturnDays } ?? (data.plug.unlockedDay == nil)
        if eligible, today >= Balance.plugMinDay, returnOK, Double.random(in: 0..<1) < Balance.plugUnlockChance {
            let name = Balance.plugNames.randomElement() ?? "Vince"
            var plug = PlugState()
            plug.name = name
            plug.unlockedDay = today
            plug.orders = data.plug.orders                       // the history stays; a vanish closed every waiting order
            data.contacts.removeAll { $0.id == "plug" }
            var c = Contact(id: "plug", name: name, kind: .plug, points: 10, interests: [.sealed])
            c.rewardedLevel = 4
            data.contacts.append(c)
            data.plug = plug
            lines.append("\(name) messaged you: \"I can get you full cases of the hot stuff. No questions, no paperwork. Cash up front.\" Open Buy, then Gray market.")
        }
        // 2. Orders that arrive today. Work on a local copy, then write it back once.
        let plugName = data.plug.name ?? "The plug"
        var orders = data.plug.orders
        var clean = data.plug.cleanOrders
        var vanished = false
        var newItems: [SealedItem] = []
        for k in orders.indices where orders[k].state == .waiting && orders[k].arrivesDay <= today {
            let o = orders[k]
            guard let product = SetLibrary.product(o.productID) else { continue }
            #if DEBUG
            let vanish = GameStore.forcePlugVanish ?? (Double.random(in: 0..<1) < o.vanishChance)
            #else
            let vanish = Double.random(in: 0..<1) < o.vanishChance
            #endif
            if vanish {
                vanished = true
                // The plug takes every prepaid order with it, not only this one.
                let lost = orders.filter { $0.state == .waiting }.reduce(0) { $0 + $1.total }
                for j in orders.indices where orders[j].state == .waiting { orders[j].state = .vanished }
                lines.append("\(plugName) stopped answering. Your \(money(lost)) in prepaid orders is gone, and so is the plug.")
                break
            }
            let ordered = o.cases * o.caseUnits
            #if DEBUG
            let short = GameStore.forcePlugShort ?? (Double.random(in: 0..<1) < Balance.plugShortChance)
            #else
            let short = Double.random(in: 0..<1) < Balance.plugShortChance
            #endif
            let shipped = short ? max(1, Int(Double(ordered) * Double.random(in: Balance.plugShortShare))) : ordered
            if shipped < ordered {
                let refund = o.unitPrice * Double(ordered - shipped)
                addLedger(refund, .grayMarket, "Short shipment refund · \(o.productName)")
                lines.append("The plug came up short: \(shipped) of \(ordered) units. It sent back \(money(refund)).")
            }
            var ids: [UUID] = []
            for _ in 0..<(shipped / o.caseUnits) {
                let fake = Counterfeit.roll(source: .plug, sealed: true, slug: product.homeSlug,
                                            market: CaseMath.market(product, units: o.caseUnits), msrp: (product.msrp ?? 0) * Double(o.caseUnits))
                let item = makeCase(product, units: o.caseUnits, paid: o.unitPrice * Double(o.caseUnits), source: "Plug · \(plugName)",
                                    status: nil, fake: fake, caseFresh: false, grayOrder: o.id)
                ids.append(item.id)
                newItems.append(item)
            }
            for _ in 0..<(shipped % o.caseUnits) {
                var u = SealedItem(setSlug: product.homeSlug, name: product.name, packs: product.packs, paid: o.unitPrice, acquired: .now,
                                   source: "Plug · \(plugName)", productID: product.id, status: nil, acquiredDay: today)
                u.fake = Counterfeit.roll(source: .plug, sealed: true, slug: product.homeSlug, market: product.market, msrp: product.msrp)
                u.grayOrder = o.id
                ids.append(u.id)
                newItems.append(u)
            }
            orders[k].deliveredIDs = ids
            orders[k].shippedUnits = shipped
            orders[k].state = .delivered
            clean += 1
            #if DEBUG
            let seize = GameStore.forcePlugSeize ?? (Double.random(in: 0..<1) < Balance.plugSeizeChance)
            #else
            let seize = Double.random(in: 0..<1) < Balance.plugSeizeChance
            #endif
            if seize { orders[k].seizeDay = today + Int.random(in: Balance.plugSeizeDays) }
            lines.append("\(plugName) dropped off \(o.productName): \(shipped) units. No invoice.")
        }
        // 3. Seizures that happen today.
        var seizedGray: Set<UUID> = []
        for k in orders.indices where orders[k].state == .delivered && orders[k].seizeDay == today {
            orders[k].state = .seized
            seizedGray.insert(orders[k].id)
        }
        // Write back once.
        data.plug.orders = orders
        data.plug.cleanOrders = clean
        if vanished { data.plug.goneDay = today }
        data.sealed += newItems
        if !seizedGray.isEmpty { lines += seizePlugStock(seizedGray, orders: orders.filter { seizedGray.contains($0.id) }) }
        return lines
    }

    /// Police take plug stock that turned out to be stolen. The items leave with no refund, wherever they are.
    private func seizePlugStock(_ gray: Set<UUID>, orders: [PlugOrder]) -> [String] {
        var lines: [String] = []
        // Read everything into locals first.
        let taken = data.sealed.filter { $0.grayOrder.map(gray.contains) == true }
        let listed = taken.filter { if case .listed = $0.status { return true }; return $0.onlineListing != nil }
        let orderIDs: [UUID] = taken.compactMap { if case .soldToViewer(let id) = $0.status { return id }; return nil }
        var machineLoss: [(machine: Int, ids: Set<UUID>)] = []
        let purchaseActs = orders.compactMap(\.actID)
        for (i, m) in data.machines.enumerated() {
            let ids = Set(m.stock.filter { $0.item.grayOrder.map(gray.contains) == true }.map(\.item.id))
            if !ids.isEmpty { machineLoss.append((i, ids)) }
        }
        // A Rip & Ship order of seized stock: Whatnot refunds the buyer.
        for id in Set(orderIDs) { lines.append(refundRipShipOrder(id, reason: .seized)) }
        let takenIDs = Set(taken.map(\.id))
        data.sealed.removeAll { takenIDs.contains($0.id) }                 // reads only a local
        var machineCount = 0
        var machineWorth = 0.0
        for loss in machineLoss {
            machineCount += loss.ids.count
            machineWorth += data.machines[loss.machine].stock.filter { loss.ids.contains($0.item.id) }.reduce(0) { $0 + $1.item.paid }
            data.machines[loss.machine].stock.removeAll { loss.ids.contains($0.item.id) }   // reads only a local
        }
        let worth = taken.reduce(0) { $0 + $1.paid } + machineWorth
        data.openedPaid += worth
        let count = taken.count + machineCount
        lines.append("Police asked about product you bought from the plug. It was stolen. They took \(count) item\(count == 1 ? "" : "s") (paid \(money(worth))). No refund.")
        if !listed.isEmpty { lines.append("Your listing\(listed.count == 1 ? "" : "s") for \(listed.map(\.name).joined(separator: ", ")) ended.") }
        // One seizure gives one callout: the seizure act comes out on a fixed day, and the purchase act leaves the log.
        let reveal = data.day + 2
        for o in orders {
            recordHiddenAct(.plugSeized, weight: 1.0, note: "Police seized plug stock: \(o.productName)", revealDay: reveal, sourceID: o.id)
        }
        for act in purchaseActs { retireHiddenAct(act) }
        return lines
    }
```

**Exclusivity notes.**

- The order loop works on the local `orders` and the local `newItems`. It writes `data.plug.orders` once. `plugName` is read once at the top.
- `seizePlugStock` collects `taken`, `listed`, `orderIDs`, and `machineLoss` before any write. Each `removeAll` closure reads only a local set.
- `refundRipShipOrder` and `addLedger` run in plain loops, not inside a closure on `data`.

**Seized stock and money.** The seized items leave with no refund. Their paid amount moves to `openedPaid`, so the portfolio cost stays whole, the same as a giveaway (`giveAway`, `M/LiveStream.swift` L461). Units from an opened plug case keep `grayOrder`, so a seizure finds them on the shelf, in a machine, in a listing, or in a Rip & Ship order. A unit that the player already sold is not taken. The `plugSeized` act has `revealDay` two days on, so Part C opens it as a forced callout (D-7). `retireHiddenAct` (without `force`) removes the order's `plugPurchase` act when it is still hidden, so one seizure gives one callout. An exposed purchase act keeps its own callout. Part B does not call `exposeHiddenAct` for a seizure.

### 4.5 Proposal 4.8: consequences

| Consequence | Where | Rule |
|---|---|---|
| A sold fake from the plug | Existing path | The plug fake is a normal `fake` on the item. A sale goes through `recordBadSale`. The buyer finds out at the existing rates: reputation −40 and a scam accusation (`counterfeitsEndDay`, `M/Counterfeits.swift` L331). |
| Seized stock | `seizePlugStock` | The message "Police asked about product you bought from the plug." The items leave with no refund. `recordHiddenAct(.plugSeized, revealDay: data.day + 2)`, and `retireHiddenAct` for the order's `plugPurchase` act. |
| The rep learns | `plugRepCheck()`, Monday | See below. |
| Tax | `LedgerEntry.Category.grayMarket` | Not in `taxableCategories`. A plug order is never a cost for income tax, and a plug refund is never income. |
| No criminal charge | none | Do not add arrests or fines for a plug purchase. |

```swift
    /// A hobby account that bought from a plug in the last 4 weeks: each week the rep can learn of it (4.8).
    func plugRepCheck() -> [String] {
        guard hasStoreAccount, let rep = data.distributor.repContactID else { return [] }
        let since = data.day - Balance.plugRepLearnWindowDays
        guard data.plug.orders.contains(where: { $0.orderedDay >= since }) else { return [] }
        guard Double.random(in: 0..<1) < Balance.plugRepLearnChance else { return [] }
        addPoints(rep, -Balance.plugRepLearnCost)
        return ["Your distributor rep heard that you buy from a plug. The rep is not happy."]
    }
```

### 4.6 Plug UI and access (fixes M1)

The report says the plug is "for players without an account". So the Buy screen must show it to a Known player with no store.

**`Buy/BuyViews.swift` L30.** The channel block changes:

```swift
                        if store.wholesaleOpen || store.plugOpen {
                            channelRow(title: store.wholesaleOpen ? "Distributor" : "Gray market",
                                       detail: store.wholesaleOpen
                                           ? "Cases at \(Int((store.wholesaleDiscountNow * 100).rounded()))% of MSRP · \(store.wholesaleOffers.count) this week"
                                           : "\(store.data.plug.name ?? "The plug") · cash up front") {
                                nav.path.append(.wholesale)
                            }
                        }
                        if store.wholesaleOpen {
                            channelRow(title: "Case splits", ...)          // unchanged
                        }
```

**`PlugSection` (`Buy/PlugViews.swift`, new).** It shows inside `WholesaleView`: under the "opens at Respected" empty state when only the plug is open, and at the bottom when wholesale is open too.

| Part | Content |
|---|---|
| Header | `DetailBox(title: "Gray market · \(name)")`, an orange outline. One line: "Prepaid. No invoice. Full cases only. The plug can vanish with your money, ship short, ship resealed boxes, or ship stolen stock." |
| Trust line | "Clean orders: N. Risk on a $2,000 order: about X%." from `plugVanishChance(total: 2000)`. |
| Offers | One row for each `plugOffers` entry, the same layout as a distributor row: image, name, "Case of 10 · $X each · case mkt $Y", a stepper for cases (1 to `plugMaxCases`), and the total. Under the stepper: "Vanish risk on this order: N%" (live from `plugVanishChance`). A button "Prepay" with a `confirmationDialog`: "Send \(money) to \(name) now? You get nothing back if the plug vanishes." |
| Orders | One row per order: product, cases, the risk taken (`vanishChance`), and the state: "Due day N", "Delivered: N of M units", "Vanished: \(money) lost", or "Seized by police". |
| Empty | "Nothing hot right now." when the offer list is empty. |

When `goneDay` is set, the section shows "The plug stopped answering." until a new plug appears.

## 5. Rip & Ship sells one whole product to one buyer, and nothing else (5.1 to 5.7)

### 5.0 The rule, and how the code enforces it

**One buyer buys one whole manufacturer-sealed product. The player opens it on stream. Every card, every bulk card, every promo, and every unopened pack goes to that one buyer.** The product can be a pack, a box, or a full case.

The code enforces the rule by its shape, not by a setting:

| Rule | Enforcement |
|---|---|
| One buyer | `RipShipOrder.buyer` is one `String`. No type holds a list of buyers, spots, or teams. |
| One whole product | An order points to exactly one `SealedItem` (`itemID`). A `SealedItem` is always whole. `ripShipBlock` refuses an item that has a status, is in the PC, is a known fake, or already has an order. |
| No split | The item status becomes `.soldToViewer(orderID:)`. No other sale path accepts an item with a status. A case opens only for its own order (`openCase(forOrder:)`), and its units keep the status. |
| All contents to the buyer | Every loose pack, promo, and hit of the product carries the order status, and its bulk carries `shipOrder` (1.7). `finishRipShip` moves all of them into the order. A test checks it (9.2). |
| Open on stream | The order must be ripped on the same stream. When the stream ends with an unripped order, Whatnot refunds the buyer. |
| No prize that depends on the result | No API pays a viewer by result. No wheel, no pull box, no "rip until you hit" sale. A Rip & Ship rip cannot run with `recording` (Record & Rip) or Hits only. The price is fixed before the rip. |
| No group break | The case-split rule stays: no livestream, no random assignment ([D/12 L218-224](../../12-acquiring-product.md)). |

### 5.1 Types (`M/RipShip.swift`)

```swift
import Foundation

// Rip & Ship (docs/06-social-media.md, Rip & Ship): one viewer buys one whole sealed product on a Whatnot stream. The
// player opens it on camera, and every card goes to that viewer.

struct RipShipFees: Codable, Hashable {
    let commission: Double
    let processing: Double
    let flat: Double
    let supplies: Double
    var total: Double { commission + processing + flat + supplies }
}

/// A new field must be Optional. This type decodes inside an array.
struct RipShipOrder: Codable, Identifiable, Hashable {
    enum State: String, Codable { case sold, ripped }

    var id = UUID()
    let buyer: String
    /// A repeat buyer from the contacts. Nil: a viewer with no contact.
    let buyerContactID: String?
    /// The one sealed product. A case keeps this ID only until it opens on stream.
    let itemID: UUID
    let itemName: String
    let productID: String?
    let caseUnits: Int?
    let price: Double
    /// What the buyer pays for shipping. Whatnot charges processing on it. The buyer pays the label.
    let shipping: Double
    let fees: RipShipFees
    /// What the player paid for the product.
    let paid: Double
    let soldDay: Int
    let auction: Bool
    var state: State = .sold
    /// D-4: one flag each. `refundRipShipOrder` does nothing when `refunded` is true.
    var shipped = false
    var refunded = false
    var ripID: UUID?
    var rippedDay: Int?
    var shippedDay: Int?
    /// Hidden: the product is resealed. Set when the rip starts. The rip shows it on camera.
    var resealed = false
    /// What ships, kept whole so a chargeback can give it back (m8).
    var cards: [OwnedCard] = []
    var bulk: [BulkGroup] = []
    var loose: [SealedItem] = []
    /// Hidden: the hits that the player palmed, the card IDs that stay with the player, and their market value.
    var palmedCardIDs: [UUID] = []
    var palmedValue = 0.0
    var palmCaught = false
    var palmSettled = false
    /// The Part C acts of this order, so a ship or a refund can retire them.
    var lateActID: UUID?
    var palmActID: UUID?

    var net: Double { price - fees.total }
    var open: Bool { !shipped && !refunded }
    var contentsValue: Double { cards.reduce(0) { $0 + $1.market } + bulk.reduce(0) { $0 + $1.value } }
}

struct RipShipState: Codable, Hashable {
    var orders: [RipShipOrder] = []
    /// Whatnot bans the player from streams until this day.
    var bannedUntil: Int?
    var banReason: String?
    /// D-5: the days of Whatnot strikes, and the permanent end of Rip & Ship (normal Whatnot streams stay).
    var strikes: [Int] = []
    var ripShipClosed = false
    /// Gross Rip & Ship sales by day, for the 4-week commission tier.
    var grossByDay: [Int: Double] = [:]

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func v<T: Decodable>(_ key: CodingKeys, _ fallback: T) -> T { (try? c.decodeIfPresent(T.self, forKey: key)) ?? fallback }
        orders = v(.orders, [])
        bannedUntil = v(.bannedUntil, nil)
        banReason = v(.banReason, nil)
        strikes = v(.strikes, [])
        ripShipClosed = v(.ripShipClosed, false)
        grossByDay = v(.grossByDay, [:])
    }
}
```

`[Int: Double]` encodes as a JSON array of pairs. `JSONEncoder` and `JSONDecoder` read it back.

**`StreamPlan`** (`M/LiveStream.swift` L48-54) gets one optional field. The synthesized decoder reads it with `decodeIfPresent`:

```swift
    /// The items that the player marked for Rip & Ship. Nil on old saves.
    var ripShipIDs: [UUID]?
```

**`StreamItem`** (L57-70) gets `var ripShip = false` and `var isCase = false`. `StreamItem` is not saved. `streamStock` (L375-386) sets `isCase: s.isCase`.

**`Contact`** (`M/Relationships.swift` L101) gets `var ripShipLuck: Double?` for 5.7. It is Optional, because `contacts` decodes as one array.

### 5.2 Proposal 5.2: the real fees

```swift
extension Balance {
    /// Whatnot's commission by gross Rip & Ship sales in the last 28 days. The sources give only 8% under $15,000 and
    /// 6.5% at $500,000. The middle steps are design values.
    static let ripShipCommissionTiers: [(gross: Double, rate: Double)] = [
        (0, 0.08), (15_000, 0.075), (50_000, 0.07), (150_000, 0.0675), (500_000, 0.065),
    ]
    static let ripShipProcessingRate = 0.029
    static let ripShipProcessingFlat = 0.30
    static let ripShipSupplies = 0.50
    /// What the buyer pays for shipping, by the packs of the product. USPS Ground Advantage up to 4 oz is $4.47.
    static func ripShipShipping(packs: Int) -> Double { packs <= 3 ? 4.47 : packs <= 36 ? 9.85 : 15.50 }
}

@MainActor
extension GameStore {
    var ripShipCommissionRate: Double {
        let from = data.day - 27
        let gross = data.ripShip.grossByDay.reduce(0) { $1.key >= from ? $0 + $1.value : $0 }
        return Balance.ripShipCommissionTiers.last { gross >= $0.gross }?.rate ?? 0.08
    }

    /// Net = sale − commission − 2.9% of (sale + buyer shipping) − $0.30 − $0.50 supplies (proposal 5.2).
    func ripShipFees(price: Double, shipping: Double) -> RipShipFees {
        func cents(_ x: Double) -> Double { (x * 100).rounded() / 100 }
        return RipShipFees(commission: cents(price * ripShipCommissionRate),
                           processing: cents((price + shipping) * Balance.ripShipProcessingRate),
                           flat: Balance.ripShipProcessingFlat, supplies: Balance.ripShipSupplies)
    }
}
```

Example: a $100 sale of a box (shipping $9.85) at 8%: commission $8.00, processing $3.19, flat $0.30, supplies $0.50. Net $88.01. The simulation got the same number (`sim_report.md` 4.5). The receipt shows profit as net minus `paid`.

Rip & Ship does not call `saleCosts` or `useShippingSupplies`. The $0.50 covers the supplies, and the buyer pays the label. A normal Whatnot auction or Buy Now keeps `Balance.whatnotFeeRate` (10.9%) and the seller's shipping. Section 7 notes the two fee models in D/15.

### 5.3 Proposal 5.1: the sale

```swift
    var whatnotBanned: Bool { (data.ripShip.bannedUntil ?? -1) > data.day }

    /// Why this item cannot go up for Rip & Ship, or nil.
    func ripShipBlock(_ itemID: UUID) -> String? {
        if data.ripShip.ripShipClosed { return "Whatnot removed your Rip & Ship access." }
        guard !whatnotBanned else { return "Whatnot banned you until day \((data.ripShip.bannedUntil ?? 0) + 1)." }
        guard let item = data.sealed.first(where: { $0.id == itemID }) else { return "The product is gone." }
        if item.status != nil { return "It is not in hand." }     // also an opened-at-shop item (`.openedAtShop`, D-15)
        if item.pc { return "It is in your PC." }
        if item.isKnownFake { return "It is resealed. Selling it is a scam." }
        if data.ripShip.orders.contains(where: { $0.itemID == itemID && !$0.refunded }) { return "It is already sold." }
        return nil
    }

    /// One buyer buys one whole sealed product (docs/06, Rip & Ship). The money comes now. The item waits on the stream.
    @discardableResult
    func createRipShipOrder(itemID: UUID, price: Double, buyer: String, buyerContactID: String?, auction: Bool) -> RipShipOrder? {
        guard ripShipBlock(itemID) == nil, let i = data.sealed.firstIndex(where: { $0.id == itemID }) else { return nil }
        let item = data.sealed[i]
        let today = data.day
        let shipping = Balance.ripShipShipping(packs: item.packs)
        let fees = ripShipFees(price: price, shipping: shipping)
        let order = RipShipOrder(buyer: buyer, buyerContactID: buyerContactID, itemID: itemID, itemName: item.name,
                                 productID: item.productID, caseUnits: item.caseUnits, price: price, shipping: shipping,
                                 fees: fees, paid: item.paid, soldDay: today, auction: auction)
        data.sealed[i].status = .soldToViewer(orderID: order.id)
        data.ripShip.orders.append(order)
        let gross = (data.ripShip.grossByDay[today] ?? 0) + price
        data.ripShip.grossByDay[today] = gross
        addLedger(order.net, .sale, "\(item.name) · Whatnot Rip & Ship · sold \(money(price)) to \(buyer)")
        addReceipt(name: item.name, venue: "Whatnot Rip & Ship", price: price, net: order.net, paid: item.paid, ids: [itemID])
        notePlatformSale(channel: .whatnot, price: price)
        noteDemand(item.name, channel: .whatnot)
        log("\(buyer) bought your \(item.name) for Rip & Ship: \(money(price)). You get \(money(order.net)) after Whatnot fees.", cash: order.net)
        save()
        return order
    }
```

The gross line reads the dictionary into a local first, then writes it. `addReceipt` keeps the default `offShelf: false`, so a hot unit sold on Rip & Ship counts as retail (D-3). It also credits a P&L challenge when the item is in one.

### 5.4 The rip, connected to the stream (fixes B1, m7, m14, m15)

**`RipModel` (`M/RipModel.swift`).** The rip ID must exist before the first pack commits, so the caller gives it:

```swift
    let ripID: UUID                                                    // was `let ripID = UUID()` (L35)

    init(items: [SealedItem], store: GameStore?, hitsOnly: Bool = false, ripID: UUID = UUID()) {   // L106
        self.ripID = ripID
        ...
    }

    /// A Rip & Ship rip: every card goes to this order (Model/RipShip.swift). Nil: the player's own rip.
    var shipOrderID: UUID?
    var shipBuyer: String?
    /// The order price, for the buyer meter (5.7).
    var shipPrice: Double?
```

**`RipView` (`Rip/RipView.swift` L9-19).** New parameters `ripID: UUID = UUID()` and `shipOrder: RipShipOrder? = nil`. The `onHits` callback gets the line that `finishRipShip` returns:

```swift
    init(items: [SealedItem], store: GameStore, allowedModes: [RipMode] = RipMode.allCases, hitsOnly: Bool = false,
         recording: [SeriesFormat] = [], ripID: UUID = UUID(), shipOrder: RipShipOrder? = nil,
         onHits: (([RipCard], String?) -> Void)? = nil, onClose: @escaping () -> Void) {
        let model = RipModel(items: items, store: store, hitsOnly: shipOrder == nil && hitsOnly, ripID: ripID)
        if let shipOrder {
            model.shipOrderID = shipOrder.id
            model.shipBuyer = shipOrder.buyer
            model.shipPrice = shipOrder.price
            model.unboxOnce = shipOrder.caseUnits != nil              // 5.9
        }
        model.recording = shipOrder == nil ? recording : []
        model.allowedModes = shipOrder != nil ? [.normal, .fast] : recording.isEmpty ? allowedModes : allowedModes.filter { $0 != .sift }
        _model = State(initialValue: model)
        self.onClose = {
            // Move the buyer's cards first, then tell the stream.
            let line = shipOrder.map { store.finishRipShip($0.id) } ?? nil
            onHits?(model.allHits, line)
            onClose()
        }
    }
```

`RipSession` (`App/AppNav.swift` L45-52) gets `var ripID = UUID()` and `var shipOrder: RipShipOrder?`. The one other `onHits` caller is `StreamView` (L55); the show day screen passes no `onHits`.

**`StreamSession` (`M/LiveStream.swift`).** New state, and one call that makes every state change in one place:

```swift
    /// The order that waits for its rip on this stream. Other sales wait until it is open.
    private(set) var ripShipWaiting: RipShipOrder?
    /// The order that the rip screen shows now.
    private(set) var ripShipActive: RipShipOrder?
    private(set) var ripShipOrders: [RipShipOrder] = []
    /// Rip & Ship hits, by order. They are the buyers' cards, so they stay out of `pulls`.
    private(set) var ripShipHits: [UUID: [RipCard]] = [:]
    private var waitingSince = 0.0
    var ripShipOpen: Bool { whatnotOpen && !store.data.ripShip.ripShipClosed && ripShipWaiting == nil && ripping == nil }

    /// Starts the rip of the waiting order. The clock stops until `ripDone`, because `ripping` is set.
    func startRipShipRip() -> (order: RipShipOrder, items: [SealedItem], ripID: UUID)? {
        guard let w = ripShipWaiting, let snapshot = store.data.sealed.first(where: { $0.id == w.itemID }) else { return nil }
        let ripID = UUID()
        let items = store.beginRipShipRip(w.id, ripID: ripID)
        guard !items.isEmpty else { return nil }
        ripShipWaiting = nil
        ripShipActive = w
        ripping = snapshot          // the box or the case as it was, so `ripDone` reads its packs and `isCase`
        onCamera = streamItem(for: snapshot)
        system("Ripping \(w.buyer)'s \(w.itemName) on stream. Every card ships to \(w.buyer).")
        return (w, items, ripID)
    }
```

`tick()` (L167) already returns while `ripping != nil`, and `StreamView` ticks only when `session.ripping == nil` (`Stream/StreamView.swift` L33). So the stream clock stops during the whole Rip & Ship rip, and `end()` cannot run from the clock.

**`ripDone` (L329-345).** Replace the body:

```swift
    /// The rip is done. A normal rip uses about 3 minutes a pack. A whole-case Rip & Ship rip uses 0.75.
    func ripDone(hits: [RipCard], ripShipLine: String? = nil) {
        guard let item = ripping else { return }
        ripping = nil
        let order = ripShipActive
        ripShipActive = nil
        let perPack = order != nil && item.isCase ? Balance.ripShipCaseMinutesPerPack : Balance.streamRipMinutesPerPack
        let minutes = Double(max(1, item.packs)) * perPack
        minute = min(totalMinutes, minute + minutes)
        minutesRipped += minutes
        if let order { ripShipHits[order.id, default: []] += hits } else { pulls += hits }
        let best = hits.map(\.hitTier).max() ?? .none
        interest = min(1, interest + Balance.ripHitInterest[best.rawValue])
        if best == .big { rollTips(burst: Int.random(in: Balance.bigHitTips)) }
        if let top = hits.max(by: { $0.market < $1.market }) {
            add(.system, "Pulled \(top.name) (\(money(top.market)))\(hits.count > 1 ? " and \(hits.count - 1) more hit\(hits.count == 2 ? "" : "s")" : "").")
        } else {
            add(.system, "Nothing big in that one.")
        }
        if let order {
            // 5.5: a big hit is a clip for the player, and a card for the buyer.
            if best == .big {
                let gained = Int((viewers * Balance.ripShipClipFollowerShare).rounded())
                store.data.social.followers += gained
                followersGained += gained
                add(.system, "The pull is a clip now. +\(gained) followers. The card ships to \(order.buyer).")
            }
            if let line = ripShipLine, !line.isEmpty { add(.system, line) }
            if let reaction = store.buyerReaction(order.id) { add(.chat, reaction) }      // 5.7
        }
        if isOver { end() }
    }
```

**`GameStore.beginRipShipRip`:**

```swift
    /// Starts the rip of an order. A case opens into its units first, and the units keep the order status.
    /// Returns the items to rip. Empty when the order is not waiting.
    func beginRipShipRip(_ orderID: UUID, ripID: UUID) -> [SealedItem] {
        guard let k = data.ripShip.orders.firstIndex(where: { $0.id == orderID }),
              data.ripShip.orders[k].state == .sold, data.ripShip.orders[k].open else { return [] }
        let itemID = data.ripShip.orders[k].itemID
        guard let item = data.sealed.first(where: { $0.id == itemID }) else { return [] }
        let ids = item.isCase ? openCase(itemID, status: .soldToViewer(orderID: orderID), forOrder: orderID, save: false) : [itemID]
        let set = Set(ids)
        let items = data.sealed.filter { set.contains($0.id) }
        guard let k2 = data.ripShip.orders.firstIndex(where: { $0.id == orderID }) else { return [] }
        data.ripShip.orders[k2].ripID = ripID
        data.ripShip.orders[k2].resealed = items.contains { $0.fake != nil }
        save()
        return items
    }
```

The function reads the order index again after `openCase`. Today `openCase` does not touch `data.ripShip`, but the second lookup keeps the code safe if it does later.

**`GameStore.finishRipShip`: move every content to the order.**

```swift
    /// Moves everything that came out of the order's product to the order (proposal 5.1). Safe to call more than once:
    /// it moves only what still carries the order, and it counts the palm swap once. Returns a line for the stream, or nil.
    @discardableResult
    func finishRipShip(_ orderID: UUID, save saves: Bool = true) -> String? {
        guard let k = data.ripShip.orders.firstIndex(where: { $0.id == orderID }), data.ripShip.orders[k].ripID != nil,
              data.ripShip.orders[k].open else { return nil }
        var order = data.ripShip.orders[k]
        let firstTime = order.state == .sold
        // Read every content into locals. Everything of this order carries its status or its `shipOrder`.
        func ofOrder(_ s: ItemStatus?) -> Bool { if case .soldToViewer(let id) = s { return id == orderID }; return false }
        let cards = data.raw.filter { ofOrder($0.status) }
        let bulk = data.bulk.filter { $0.shipOrder == orderID }
        let loose = data.sealed.filter { ofOrder($0.status) }
        let cardIDs = Set(cards.map(\.id)), bulkIDs = Set(bulk.map(\.id)), looseIDs = Set(loose.map(\.id))
        // The rip always stops on a resealed pack (docs/18), so a resealed product shows on camera. The junk stays.
        if order.resealed, firstTime {
            for i in data.raw.indices where cardIDs.contains(data.raw[i].id) { data.raw[i].status = nil }
            for i in data.bulk.indices where bulkIDs.contains(data.bulk[i].id) { data.bulk[i].shipOrder = nil }
            for i in data.sealed.indices where looseIDs.contains(data.sealed[i].id) { data.sealed[i].status = nil }
            data.ripShip.orders[k].state = .ripped
            data.ripShip.orders[k].rippedDay = data.day
            return refundRipShipOrder(orderID, reason: .resealed)
        }
        // Remove with closures that read only locals.
        data.raw.removeAll { cardIDs.contains($0.id) }
        data.bulk.removeAll { bulkIDs.contains($0.id) }
        data.sealed.removeAll { looseIDs.contains($0.id) }
        order.cards += cards.map { var c = $0; c.status = nil; return c }
        order.bulk += bulk.map { var b = $0; b.shipOrder = nil; return b }
        order.loose += loose.map { var s = $0; s.status = nil; return s }
        if firstTime {
            // A palmed hit becomes a bulk card in the buyer's order: the swap. Count it once.
            let filler = order.palmedCardIDs.count
            if filler > 0, let slug = cards.first?.setSlug ?? bulk.first?.setSlug,
               let print = SetLibrary.set(slug).prints.first(where: { $0.rarity == "Common" }) {
                order.bulk.append(BulkGroup(ripID: order.ripID ?? UUID(), setSlug: slug, date: .now,
                                            cards: Array(repeating: print, count: filler), day: data.day))
            }
            order.state = .ripped
            order.rippedDay = data.day
        }
        data.ripShip.orders[k] = order
        // The cost of unopened packs and units that ship is a cost now. The ripped packs went to `openedPaid` already.
        data.openedPaid += loose.reduce(0) { $0 + $1.paid }
        if saves { save() }
        return nil
    }
```

**Exclusivity notes in this block.** The three `filter` reads run before any write. Each `removeAll` closure reads only a local ID set. The `for i in indices where` loops read in the `where` clause, not in a closure. The order is built in a local and written back once. Never write `data.raw.removeAll { $0.ripID == data.ripShip.orders[k].ripID }`: that closure reads `data` while `data.raw` is open for writing, and it crashes with "Fatal access conflict".

**Why `openedPaid`.** `commitPack` adds each opened pack's cost to `openedPaid` (L692). A loose pack or unit that ships never opens, so its cost moves to `openedPaid` here. The portfolio `paid` total then stays whole.

### 5.5 One refund path, and "make it right" (D-4, D-6; fixes M4, m9, m14, C-B3)

`refundRipShipOrder` is the only function that pays a Rip & Ship buyer back. It does nothing when the order is refunded or shipped.

```swift
extension Balance {
    static let ripShipNotOpenedAuthenticity = 0.02
    static let resealedOnStreamAuthenticity = 0.05
    /// D-5: the act weight after a chargeback.
    static let ripShipChargebackActWeight = 2.0
}

    /// The only function that pays a Rip & Ship buyer back (D-4). Returns the report line, or "" when it did nothing.
    /// - notOpened, resealed, seized: Whatnot cancels before shipping and returns its fees. The player pays back the net.
    /// - chargeback (day 7, D-5): the buyer takes the full price from the player's cash. The player keeps the product
    ///   or the cards, so the player has bought them at the sale price. A Whatnot strike follows.
    @discardableResult
    func refundRipShipOrder(_ orderID: UUID, reason: RipShipRefund = .notOpened) -> String {
        guard let k = data.ripShip.orders.firstIndex(where: { $0.id == orderID }), data.ripShip.orders[k].open else { return "" }
        data.ripShip.orders[k].refunded = true
        let order = data.ripShip.orders[k]
        let debit = reason == .chargeback ? order.price : order.net
        addLedger(-debit, .refund, "Whatnot refund · \(order.itemName) · \(order.buyer)")
        // Refunded sales do not count for the commission tier (m9).
        let gross = max(0, (data.ripShip.grossByDay[order.soldDay] ?? 0) - order.price)
        data.ripShip.grossByDay[order.soldDay] = gross
        // An unopened product comes back to hand. Ripped contents come back to Inventory.
        for i in data.sealed.indices {
            if case .soldToViewer(let id) = data.sealed[i].status, id == orderID { data.sealed[i].status = nil }
        }
        if !order.cards.isEmpty || !order.bulk.isEmpty || !order.loose.isEmpty {
            data.raw += order.cards
            data.bulk += order.bulk
            data.sealed += order.loose
            data.ripShip.orders[k].cards = []
            data.ripShip.orders[k].bulk = []
            data.ripShip.orders[k].loose = []
        }
        switch reason {
        case .notOpened:
            if let act = order.lateActID { retireHiddenAct(act, force: true) }
            data.social.authenticity = max(0, data.social.authenticity - Balance.ripShipNotOpenedAuthenticity)
            return "You did not open \(order.buyer)'s \(order.itemName) on stream. Whatnot refunded them."
        case .resealed:
            data.social.authenticity = max(0, data.social.authenticity - Balance.resealedOnStreamAuthenticity)
            return "The \(order.itemName) was resealed, live on camera. Whatnot refunded \(order.buyer)."
        case .seized:
            if let act = order.lateActID { retireHiddenAct(act, force: true) }
            return "Whatnot refunded \(order.buyer). Police took the product."
        case .chargeback:
            // D-5 and Part C 1.4: retire the late act. When it had not come out, record a heavier act in its place.
            // When it had come out, its open callout goes on.
            let exposed = order.lateActID.map { retireHiddenAct($0, force: true) } ?? false
            if !exposed {
                let act = recordHiddenAct(.unshippedOrder, weight: Balance.ripShipChargebackActWeight,
                                          note: "Whatnot took back \(order.buyer)'s money. The order never shipped.",
                                          contactID: order.buyerContactID, refund: order.price, sourceID: order.id)
                data.ripShip.orders[k].lateActID = act
            }
            return "Whatnot cancelled \(order.buyer)'s order and took back \(money(order.price)). You keep the cards. " + addWhatnotStrike()
        }
    }
```

`RipShipRefund` has exactly the four cases above (0.4). `retireHiddenAct` returns `true` when the act had already come out (Part C 1.3). `k` stays valid after `retireHiddenAct` and `recordHiddenAct`, because they write only `data.hiddenActs` and `data.callouts`.

**"Make it right" for an order (D-4, D-6).** Part C owns the reply and pays its money (Part C 6.2). Part B gives it two calls and no money path of its own:

- A late order that is still open: Part C calls `shipRipShipOrders([order])`. It ships the order now, costs 10 minutes, and retires the act with `force: true`. Part C pays `lateGoodwill(order.price)`: 10% of the price, at least $5.
- A palm: Part C pays `c.refund`, which Part B set to the order price plus the palmed card's market (5.8). Then Part C calls `returnPalmedCards(order)`:

```swift
    /// Part C "make it right" on a palm (D-6). Part C paid the order price and the card's market already.
    /// Every palmed card that the player still holds leaves inventory for the buyer. The order closes: it ships now
    /// with the cards, and it counts as refunded, so no later path can pay its price again.
    func returnPalmedCards(_ orderID: UUID) {
        guard let k = data.ripShip.orders.firstIndex(where: { $0.id == orderID }) else { return }
        let order = data.ripShip.orders[k]
        let ids = Set(order.palmedCardIDs)
        let kept = data.raw.filter { ids.contains($0.id) }.map { var c = $0; c.status = nil; return c }
        data.raw.removeAll { ids.contains($0.id) }                       // reads only a local
        let today = data.day
        data.ripShip.orders[k].cards += kept
        data.ripShip.orders[k].palmedCardIDs = []
        if !order.shipped { data.ripShip.orders[k].shipped = true; data.ripShip.orders[k].shippedDay = today }
        data.ripShip.orders[k].refunded = true
        for act in [order.lateActID, order.palmActID].compactMap({ $0 }) { retireHiddenAct(act, force: true) }
        log("You sent \(order.buyer) \(kept.count) palmed card\(kept.count == 1 ? "" : "s").")
    }
```

A card that the player already sold is not in `data.raw`, so only its market value reaches the buyer, through Part C's payment.

| Path | Money out of the player's cash |
|---|---|
| Not opened on stream | the net, once (`refundRipShipOrder`) |
| Resealed on camera | the net, once (`refundRipShipOrder`) |
| Late, then "make it right" while open | Part C's goodwill sum; the order ships |
| Late, chargeback on day 7, then "make it right" | the full price (chargeback), then only Part C's goodwill sum |
| Palm, then "make it right" | the price plus the card's market (Part C); the cards leave; the order closes |

The `refunded` flag and the one function make a second payment of the order price impossible.

### 5.6 Shipping, the deadline, the chargeback, and strikes (D-5, I3; fixes M5, C-m16)

```swift
extension Balance {
    static let ripShipDeadlineDays = 2
    static let ripShipCancelDays = 7
    static let ripShipShipMinutes = 10.0
    static let ripShipShipPoints = 2
    /// D-5: 2 strikes in 60 days give a 28-day ban. 3 strikes in 120 days end Rip & Ship for good.
    static let whatnotStrikeBanWindow = 60
    static let whatnotStrikeBanDays = 28
    static let whatnotStrikeCloseWindow = 120
}

    var ordersToShip: [RipShipOrder] { data.ripShip.orders.filter { $0.state == .ripped && $0.open } }

    /// Ships orders. A free action that costs 10 minutes for each order (proposal 5.4).
    func shipRipShipOrders(_ ids: [UUID]) -> String? {
        let set = Set(ids)
        let open = data.ripShip.orders.filter { set.contains($0.id) && $0.state == .ripped && $0.open }
        guard !open.isEmpty else { return nil }
        guard spendHours(Double(open.count) * Balance.ripShipShipMinutes / 60) else { return "Not enough time today." }
        let today = data.day
        for order in open {
            guard let k = data.ripShip.orders.firstIndex(where: { $0.id == order.id }) else { continue }
            data.ripShip.orders[k].shipped = true
            data.ripShip.orders[k].shippedDay = today
            // D-4: the act retires when the order ships, even when it is already out.
            if let act = order.lateActID { retireHiddenAct(act, force: true) }
            if let id = order.buyerContactID { addPoints(id, Balance.ripShipShipPoints) }
            if order.price >= Balance.fairDealMinPrice { addReputation(Balance.onlineSaleReputation) }
        }
        log("Shipped \(open.count) Rip & Ship order\(open.count == 1 ? "" : "s").")
        save()
        return nil
    }

    /// D-5: a chargeback gives a strike. 2 in 60 days ban Whatnot streams for 4 weeks. 3 in 120 days end Rip & Ship.
    private func addWhatnotStrike() -> String {
        let today = data.day
        let strikes = data.ripShip.strikes.filter { $0 > today - Balance.whatnotStrikeCloseWindow } + [today]
        data.ripShip.strikes = strikes
        if strikes.count >= 3 {
            data.ripShip.ripShipClosed = true
            return "Third Whatnot strike in 120 days. Whatnot ended your Rip & Ship access for good. Normal streams stay."
        }
        if strikes.filter({ $0 > today - Balance.whatnotStrikeBanWindow }).count >= 2 {
            banFromWhatnot(days: Balance.whatnotStrikeBanDays, reason: "two strikes for orders that never shipped")
            return "Second Whatnot strike in 60 days. Whatnot banned you from streams for 4 weeks."
        }
        return "Whatnot gave you a strike. A second strike in 60 days brings a 4-week ban."
    }

    /// Whatnot bans the player from streams. A second ban extends to the later end day. Part C calls this too.
    /// No `save()`: End Day calls it, and End Day saves once at the end (C-m16). A caller outside End Day saves.
    func banFromWhatnot(days: Int, reason: String) {
        let end = data.day + days
        let current = data.ripShip.bannedUntil ?? -1
        data.ripShip.bannedUntil = max(current, end)
        data.ripShip.banReason = reason
        log("Whatnot banned you from streams until day \(max(current, end) + 1) for \(reason).")
    }
```

**Why not shipping now costs more than palming.** A chargeback takes the full price, not the net, so the player pays the fees and buys the cards at the sale price. That is never a profit unless the cards beat the price, and the player gets a strike. Two strikes ban Whatnot for 4 weeks. Three end Rip & Ship. The `unshippedOrder` act stays at weight 2.0 and can still come out as a callout. A palm costs at most the price plus the card, plus the palm consequences in 5.8.

**The ban closes Whatnot.** `StreamSession.whatnotOpen` (`M/LiveStream.swift` L158) becomes `store.followerTier >= 1 && !store.whatnotBanned`. A banned player can still stream, talk, rip their own product, and give away. Auctions, Buy Now, and Rip & Ship close. `ripShipClosed` closes only Rip & Ship.

### 5.7 Proposal 5.3: the buyer price band, rivals, and the buyer meter (I1)

```swift
extension Balance {
    /// A viewer pays at most this share of market at Buy Now: hot product, and other product.
    static let ripShipHotBand = 0.95...1.20
    static let ripShipBand = 0.90...1.05
    /// The Buy Now chance for each viewer each minute, under the ceiling.
    static let ripShipBuyRate = 0.0024
    /// A product over this price needs a big crowd: the chance scales by (viewers ÷ 100), at most 1.
    static let ripShipBigTicket = 500.0
    /// Each rival creator (Part A) takes 5% of the buyers, down to 80%.
    static let ripShipRivalStep = 0.05
    static let ripShipRivalFloor = 0.80
    static let ripShipRepeatBuyerChance = 0.5
    /// A repeat buyer who did well last time pays up to 5% more; one who did badly, up to 5% less.
    static let ripShipLuckStep = 0.05
    static let ripShipWaitMinutes = 10.0
    static let ripShipImpatience = 0.03
}
```

`StreamBuyNow` (L93-97) gets `var ripShip = false` and `var ceilingShare = 1.0`. `StreamAuction` (L81-91) gets `var ripShip = false`.

`StreamSession.init` reads Part A's rivals once into a local (outside any closure on `data`):

```swift
        let rivalCreators = store.data.rivals.filter { $0.kind == .creator }.count
        ripShipRivalFactor = max(Balance.ripShipRivalFloor, 1 - Balance.ripShipRivalStep * Double(rivalCreators))
```

**Offer (Buy Now):**

```swift
    func offerRipShip(_ item: StreamItem, price: Double) {
        guard ripShipOpen, buyNow == nil, item.ripShip, let i = items.firstIndex(where: { $0.id == item.id }) else { return }
        items.remove(at: i)
        let hot = SetLibrary.product(store.data.sealed.first { $0.id == item.id }?.productID).map(store.isHot) ?? false
        var offer = StreamBuyNow(item: item, price: price, expiresAt: minute + Balance.buyNowMinutes)
        offer.ripShip = true
        offer.ceilingShare = Double.random(in: hot ? Balance.ripShipHotBand : Balance.ripShipBand)
        buyNow = offer
        onCamera = item
        system("Rip & Ship: \(item.name) for \(money(price)). One buyer gets the whole product and every card in it.")
    }
```

In `advanceBuyNow` (L291-304), branch for `b.ripShip`:

```swift
        if b.ripShip {
            let share = b.price / max(b.item.market, 0.01)
            let crowd = b.price > Balance.ripShipBigTicket ? min(1, viewers / 100) : 1
            let chance = share > b.ceilingShare ? 0 : viewers * Balance.ripShipBuyRate * ripShipRivalFactor * crowd
                * PriceCycle.seasonDemand(sealed: true)
            guard Double.random(in: 0..<1) < chance else { return }
            buyNow = nil
            soldRipShip(b.item, price: b.price, auction: false)
            return
        }
```

`cancelBuyNow` and the expiry branch put a Rip & Ship item back in `items` as today.

**Auction.** `auctionRipShip(_:startShare:)` mirrors `startAuction` (L238) with `ripShip = true`. Its ceiling is `item.market × Double.random(in: band)`. At the end, `advanceAuction` (L251) calls `soldRipShip(a.item, price: a.top, auction: true)` instead of `sell`.

**The sale and the wait:**

```swift
    private func soldRipShip(_ item: StreamItem, price: Double, auction: Bool) {
        // A repeat buyer half of the time. Read the contacts into a local first.
        let regulars = store.data.contacts.filter { $0.kind == .buyer || $0.kind == .collector }
        let contact = Double.random(in: 0..<1) < Balance.ripShipRepeatBuyerChance ? regulars.randomElement() : nil
        let buyer = contact?.name ?? (Self.names.randomElement() ?? "a viewer")
        guard let order = store.createRipShipOrder(itemID: item.id, price: price, buyer: buyer, buyerContactID: contact?.id,
                                                   auction: auction) else {
            items.append(item)
            return
        }
        ripShipWaiting = order
        ripShipOrders.append(order)
        waitingSince = minute
        onCamera = item
        sold.append((item.name, price, order.fees.total))
        interest = min(1, interest + 0.15)
        add(.buy, "\(buyer) bought the \(item.name) for Rip & Ship: \(money(price)). Rip it now. Every card ships to \(buyer).")
    }
```

A repeat buyer's luck moves the ceiling of the next offer to them: in `offerRipShip` and `auctionRipShip`, when the buyer is drawn first, `ceilingShare += min(Balance.ripShipLuckStep, max(-Balance.ripShipLuckStep, ((contact.ripShipLuck ?? 1) - 1) * Balance.ripShipLuckStep))`. To keep the draw simple, draw the repeat buyer when the offer goes up, store it in `StreamBuyNow.buyerContactID`, and use it in `soldRipShip`.

In `tick()` (L167-179): while `ripShipWaiting != nil` and `minute - waitingSince > Balance.ripShipWaitMinutes`, `interest` falls an extra `Balance.ripShipImpatience` each minute, and chat lines say "rip it already". The clock keeps running.

In `end()` (L348-362), before the follower math:

```swift
        if let w = ripShipWaiting {
            add(.system, store.refundRipShipOrder(w.id, reason: .notOpened))
            ripShipWaiting = nil
        }
```

**The buyer meter (I1).** In a Rip & Ship rip, `TopBar` (`Rip/Panels.swift` L24) shows a chip: "FOR JESS · $412 of $380". It reads `model.ripValue` (L130) against `model.shipPrice`. It is green above the price and muted below it. After the rip, `buyerReaction(_:)` gives one chat line and saves the buyer's luck:

```swift
    /// The buyer's reaction to the rip, and their luck for next time (a repeat buyer only).
    func buyerReaction(_ orderID: UUID) -> String? {
        guard let order = data.ripShip.orders.first(where: { $0.id == orderID }), order.price > 0 else { return nil }
        let luck = order.contentsValue / order.price
        if let id = order.buyerContactID, let i = data.contacts.firstIndex(where: { $0.id == id }) { data.contacts[i].ripShipLuck = luck }
        if luck >= 1.5 { return "\(order.buyer): LET'S GO" }
        if luck < 0.5 { return "\(order.buyer): rip..." }
        return nil
    }
```

Nothing pays by result. The price is fixed before the rip, and the luck moves only how much one repeat buyer will pay next time.

### 5.8 Proposal 5.6: palm the hit (D-6, D-7; fixes S-5, C-M5)

AJ approved this choice. It is a scam with consequences.

**`RipModel`:**

```swift
    /// Hits that the player palmed in this rip.
    private(set) var palmedIDs: Set<UUID> = []

    /// The player can palm a big hit once for each card, only in a Rip & Ship rip.
    func canPalm(_ card: RipCard) -> Bool { shipOrderID != nil && card.hitTier == .big && !palmedIDs.contains(card.id) }

    /// Swaps a big hit off camera (docs/18-ripping.md, Rip & Ship). The card stays with the player. The buyer gets a
    /// bulk card in its place. A scam: the camera catches it half of the time.
    func palm(_ card: RipCard) {
        guard canPalm(card), let orderID = shipOrderID, let print = card.print else { return }
        palmedIDs.insert(card.id)
        store?.notePalm(orderID: orderID, ripID: ripID, print: print, value: card.market)
    }
```

`hitTier` is on `RipCard` (`M/RipCard.swift` L105). The stream's hit list stays the same. The stream only sees the clip.

**`GameStore.notePalm`:**

```swift
extension Balance {
    static let palmFoundChance = 0.5
    static let palmFoundReputation = 40
    static let palmBanDays = 56
    static let palmCalloutHeat = 90.0
}

    func notePalm(orderID: UUID, ripID: UUID, print: CardPrint, value: Double) {
        guard let k = data.ripShip.orders.firstIndex(where: { $0.id == orderID }) else { return }
        #if DEBUG
        let caught = GameStore.forcePalmCaught ?? (Double.random(in: 0..<1) < Balance.palmFoundChance)
        #else
        let caught = Double.random(in: 0..<1) < Balance.palmFoundChance
        #endif
        // The hit is in Raw with the order status (1.7). Take it off the order: it stays with the player.
        let palmed = Set(data.ripShip.orders[k].palmedCardIDs)
        guard let c = data.raw.firstIndex(where: {
            if case .soldToViewer(let id) = $0.status, id == orderID, $0.ripID == ripID, !palmed.contains($0.id),
               $0.print.num == print.num, $0.print.variant == print.variant, $0.print.name == print.name { return true }
            return false
        }) else { return }
        data.raw[c].status = nil
        let cardID = data.raw[c].id
        data.ripShip.orders[k].palmedCardIDs.append(cardID)
        data.ripShip.orders[k].palmedValue += value
        if caught { data.ripShip.orders[k].palmCaught = true }
        let order = data.ripShip.orders[k]
        if !caught {
            // A secret that can come out later (Part C). "Make it right" pays the price plus the card (D-6).
            let act = recordHiddenAct(.palmedHit, weight: 1.5, note: "Palmed \(print.name) from \(order.buyer)'s \(order.itemName)",
                                      witnesses: currentStreamPeakViewers, contactID: order.buyerContactID,
                                      refund: order.price + order.palmedValue, sourceID: order.id)
            if let k2 = data.ripShip.orders.firstIndex(where: { $0.id == orderID }) { data.ripShip.orders[k2].palmActID = act }
        }
        save()
    }
```

The `firstIndex(where:)` closure reads the local `palmed` set and `$0`. It is a read, not a mutating call. The weight 1.5 and the witness count follow Part C's table (section 1.4). `currentStreamPeakViewers` is a `var` on `GameStore` that `StreamSession.tick()` sets. `forcePalmCaught` is a `#if DEBUG static var forcePalmCaught: Bool?` for the tests, like `RipModel.forcedSpecial` (L88).

A second palm in the same order adds to `palmedValue`, so the act's `refund` of the second palm covers both cards.

**Consequences when the camera caught it (End Day, `ripShipEndDay`):**

```swift
    private func settlePalm(_ orderID: UUID) -> [String] {
        guard let k = data.ripShip.orders.firstIndex(where: { $0.id == orderID }) else { return [] }
        data.ripShip.orders[k].palmSettled = true
        let order = data.ripShip.orders[k]
        addReputation(-Balance.palmFoundReputation)
        banFromWhatnot(days: Balance.palmBanDays, reason: "swapping a viewer's hit")
        var lines = ["Viewers clipped you palming a hit from \(order.buyer)'s \(order.itemName). Reputation −\(Balance.palmFoundReputation). Whatnot banned you for 8 weeks."]
        // D-7: a forced callout opens past the cap.
        if let line = startCallout(.fairness, truth: true, receipts: true, heat: Balance.palmCalloutHeat, accuser: .person(order.buyer),
                                   text: "\(order.buyer) posted a clip that shows you swapping their hit off camera.",
                                   force: true, actKind: .palmedHit, sourceID: order.id,
                                   contactID: order.buyerContactID, refund: order.price + order.palmedValue) {
            lines.append(line)
        }
        return lines
    }
```

The refund that Part C pays on a palm comes from one function, so a palmed order that a chargeback already refunded never pays its price twice (D-4):

```swift
    /// What "make it right" on a palm must pay: the order price and the palmed cards' market (D-6), or only the cards'
    /// market when the buyer already got the price back.
    func palmRefundDue(_ orderID: UUID) -> Double {
        guard let o = data.ripShip.orders.first(where: { $0.id == orderID }) else { return 0 }
        return o.refunded ? o.palmedValue : o.price + o.palmedValue
    }
```

A caught palm records no `palmedHit` act, so one act gives one callout. The callout's `refund` is the order price plus the card's market (D-6). Part C's "make it right" pays that sum and calls `returnPalmedCards(order.id)` (5.5), which sends the card to the buyer. The simulation measured the old refund: a palm from a $5 pack gained $54 after "make it right". With the card value in the refund, it loses about $4 (`sim_report.md` section 7).

**Palm UI (`Rip/Panels.swift` and `Rip/RipView+Reveal.swift`).**

- In a Rip & Ship rip, the card panel shows "Ships to \(buyer)" under the price of every card.
- For a card where `model.canPalm(card)` is true, the panel shows one small muted text button "Palm it" (`.font(.caption)`, `Theme.muted`, no fill). It is never the primary button.
- The tap opens a `confirmationDialog`: title "Palm the \(card.name)?", message "This is a scam. The card stays with you, and \(buyer) gets a bulk card in its place. The camera catches about half of all palms. If it does, Whatnot bans you and the clip spreads." Buttons: "Palm it" (destructive) and "Leave it".
- After the palm: the card slides down out of the frame (offset y +400, 0.35 s), and a bulk card from the pile takes its place. No flash, no glow. A small line in the top bar says "1 card palmed". The stream chat gets no line on the spot. The catch shows in the morning report.
- The pack-open light in `RipView` (L123-134) is a radial glow at the pack, not full screen. A whole-case rip in Fast mode plays it up to 216 times, so it uses half opacity when `model.shipOrderID != nil`.

### 5.9 Proposal 5.7: a whole case for one buyer (I4)

A case is a `SealedItem` with `caseUnits`. It goes up for Rip & Ship like any other item, at its case price (`realMarket(of:)`). After the sale:

1. "Rip for \(buyer)" calls `session.startRipShipRip()`. It calls `beginRipShipRip`, which opens the case into units with status `.soldToViewer(orderID:)`, and it sets `ripping`, so the clock stops.
2. `CaseOpenSheet` (2.5) plays in buyer mode over the unit IDs. Its title is "\(buyer)'s case", and its button says "Rip all \(n) for \(buyer)".
3. `RipView` opens with every unit in one queue, one `ripID`, and `shipOrder`.
4. `finishRipShip` moves every card, all bulk, and every unit that the player did not open.

**One unbox for the whole case (I4).** `RipModel` gets `var unboxOnce = false`. Today a 25-bundle case shows `UnboxView` 25 times, because `unbox` is true for every product with more than one pack (L109). When `unboxOnce` is true, `openProduct()` (L147) opens every unit of the same product in the queue at once:

```swift
    @discardableResult
    func openProduct() -> [CardPrint] {
        guard let pack = currentPack else { return [] }
        let targets = unboxOnce
            ? Array(Set(queue.filter { $0.productID == pack.productID && !unboxed.contains($0.sourceID) }.map(\.sourceID)))
            : [pack.sourceID]
        var extras: [CardPrint] = []
        for id in targets {
            unboxed.insert(id)
            extras += store?.openProduct(id, ripID: ripID) ?? []
        }
        packExtras = extras
        return extras
    }
```

`TopBar` shows a tracker in this mode: "Unit 7 of 25 · best so far: \(name) \(money)". The unit number comes from the index of the current `sourceID` among the distinct source IDs of the queue.

The one-buyer rule holds: one order, one buyer, one case. The game never sells a unit of a case to a second viewer.

### 5.10 Rip & Ship UI

**A. Stream setup (`Stream/StreamView.swift`, `StreamSetupView` L386-517).**

- In "Bring", each sealed row that is chosen shows a second chip "R&S" at the right. A tap toggles it in a new `@State ripShip: Set<UUID>`. The chip shows only when `store.followerTier >= 1` and `store.ripShipBlock(item.id) == nil`.
- Under the section, one caption: "Rip & Ship: one viewer buys the whole product. You open it on stream. Every card ships to that viewer. Whatnot takes 8% plus 2.9% and $0.30."
- `scheduleStream` and `startStream` get `ripShipIDs: [UUID]`. `StreamPlan.ripShipIDs` holds them. `startStream` sets `ripShip = true` on those `StreamItem`s. A banned player sees the chips hidden and the line "Whatnot banned you until day N." A player whose Rip & Ship is closed sees "Whatnot ended your Rip & Ship access."

**B. The live stream (`StreamView`; fixes m2).**

- `PickMode` (L16-19) gets `case ripShip`. Add it to both exhaustive switches: the sheet closure (L42-48: `case .ripShip: if price > 0 { session.offerRipShip(item, price: price) }`, with the auction choice in the sheet) and `StreamPickSheet.title` (L258-266: `case .ripShip: "Rip & Ship"`). `items` (L254-256) returns `session.items.filter(\.ripShip)` for `.ripShip`, and `needsPrice` (L268) is true for it.
- An action "Rip & Ship" (`shippingbox`), enabled when `session.ripShipOpen && session.items.contains(where: \.ripShip)`. Put the three Whatnot actions (Auction, Buy Now, Rip & Ship) in their own row, so the buttons keep their size.
- While `session.ripShipWaiting` is set, `RipShipWaitingPanel` (`Stream/RipShipViews.swift`) shows above chat: the product image, "SOLD to \(buyer) · \(money(price))", "Rip it now. Every card ships to \(buyer).", and one primary button "Rip for \(buyer)". The panel has a cyan outline that pulses softly (opacity 0.4 to 0.8, 1.2 s). The other sale actions are disabled until the rip starts.
- "Rip for \(buyer)" calls `session.startRipShipRip()`. For a case, it presents `CaseOpenSheet` in buyer mode first. Then it sets `rip = RipSession(items: result.items, ripID: result.ripID, shipOrder: result.order)`. The cover (L53-56) passes `ripID: rip.ripID, shipOrder: rip.shipOrder`, and `onHits: { hits, line in session.ripDone(hits: hits, ripShipLine: line) }`.

**C. The pick sheet (`StreamPickSheet` L246-319, mode `.ripShip`).**

- The list shows only items with `ripShip == true`. A case shows "Not enough stream time to open the whole case." and is disabled when `session.minutesLeft < Double(item.packs) * Balance.ripShipCaseMinutesPerPack`.
- After the pick: a segmented control "Buy Now · Auction". Buy Now uses a slider from 80% to 130% of market (start 95%, the best ask in the simulation). Auction uses the existing start slider (start 50%).
- A fee box under the slider, live: "Price $X · commission $A (8%) · processing $B · $0.30 · supplies $0.50 · you get $N · paid $P · profit $Q". Use `store.ripShipFees(price:shipping:)`.
- One caption: "Viewers pay about 95% to 120% of market for hot product, 90% to 105% for the rest."

**D. `RipView` in a Rip & Ship rip.** The top bar shows the buyer meter chip (5.7) and, for a case, the unit tracker (5.9). The card panel shows "Ships to \(buyer)" and the palm button (5.8). The summary keeps "Post this pull" (the clip). The rip screen has no "keep" or "PC" control, so nothing else changes.

**E. Stream summary (`StreamSummaryView` L322-383; fixes m15).** The "Pulls" box lists only `session.pulls`, which no longer holds Rip & Ship hits. A new section `RipShipSummaryBox` lists each order: the buyer, the product, the price, the net, the top card from `session.ripShipHits[order.id]` with "ships to \(buyer)", and "Ship by day N". A button "Go to the ship queue".

**F. The ship queue (`Stream/ShipQueueView.swift`, new `ShipQueueView`).**

- Route: add `case shipQueue` to `AppRoute` (`App/AppNav.swift` L4-30) and to `appDestinations`.
- Entry: the stream summary button, a row in `SocialHubView`, and a Hub badge "N orders to ship" in `HubView` when `ordersToShip` is not empty (orange when one is late).
- Header: the strikes in the last 120 days, and the rule: "Ship within 2 days. From day 3 the buyer can call you out. On day 7 Whatnot takes the money back and gives you a strike. 2 strikes in 60 days: a 4-week ban."
- Content: one card per order: buyer, product, the date sold, the top 3 cards by value with prices, "and N bulk cards", any sealed packs that ship, and "Ship by day N" (green, orange on the last day, red when late). A footer button "Ship all · \(n × 10) min" (`shipRipShipOrders`). Each card also has "Ship". The view shows the time left in the day. Late orders sort first.
- Calendar (fixes m16): `calendarEntries(day:)` adds `CalendarEntry(kind: .delivery, title: "Ship Rip & Ship orders", detail: "\(n) due")` on the deadline day of each open ripped order.

### 5.11 `ripShipEndDay` (End Day)

```swift
extension Balance {
    static let ripShipKeepDays = 28
}

    func ripShipEndDay() -> [String] {
        var lines: [String] = []
        let today = data.day
        // Work from a copy. Each step looks its order up again.
        let snapshot = data.ripShip.orders
        // 1. An order that never finished on its stream (the app closed): finish a started rip, refund an unstarted one.
        for o in snapshot where o.state == .sold && o.open && o.soldDay < today {
            if o.ripID != nil {
                if let line = finishRipShip(o.id, save: false) { lines.append(line) }
            } else {
                lines.append(refundRipShipOrder(o.id, reason: .notOpened))
            }
        }
        // 2. A palm that the camera caught.
        for o in snapshot where o.palmCaught && !o.palmSettled { lines += settlePalm(o.id) }
        // 3. Ship deadlines. Part C rolls the discovery of `unshippedOrder` (20% a day, decay 0). Part B records it once.
        for o in data.ripShip.orders where o.state == .ripped && o.open {
            let waited = today - (o.rippedDay ?? o.soldDay)
            if waited > Balance.ripShipDeadlineDays, o.lateActID == nil {
                let act = recordHiddenAct(.unshippedOrder, weight: 1.0, note: "\(o.buyer)'s \(o.itemName) is past its ship date",
                                          contactID: o.buyerContactID, refund: o.price, sourceID: o.id)
                if let k = data.ripShip.orders.firstIndex(where: { $0.id == o.id }) { data.ripShip.orders[k].lateActID = act }
                lines.append("\(o.buyer)'s Rip & Ship order is late. Ship it today.")
            }
            if waited >= Balance.ripShipCancelDays { lines.append(refundRipShipOrder(o.id, reason: .chargeback)) }
        }
        // 4. The ban ends.
        if let until = data.ripShip.bannedUntil, until == today { lines.append("Your Whatnot ban is over.") }
        // 5. Prune. Read the cutoffs into locals: a closure on `data.ripShip` must not read `data`.
        let cutoff = today - Balance.ripShipKeepDays
        data.ripShip.orders.removeAll { !$0.open && $0.soldDay < cutoff }
        let since = today - 27
        let kept = data.ripShip.grossByDay.filter { $0.key >= since }
        data.ripShip.grossByDay = kept
        return lines.filter { !$0.isEmpty }
    }
```

**Exclusivity notes.**

- `removeAll { !$0.open && $0.soldDay < cutoff }` reads only the local `cutoff`. The tempting `$0.soldDay < data.day - 28` crashes.
- The gross filter runs on a copy into the local `kept`, then writes.
- Step 3 iterates `data.ripShip.orders` by value (a copy) and writes by index lookup. `refundRipShipOrder` changes only flags and contents of the order, so the copy stays valid for the loop.

**Night of the first roll (C-m4).** This step runs after the day moves (integration step 11), so an act recorded here has `day == today`. Part C's rule D7 decides whether it can come out the same night. Part B does not depend on either answer.

## 6. End Day hooks and the exclusivity trap

### 6.1 Part B's steps in the merged End Day order

Integration section 2 sets the order. Part B's steps:

| Integration step | Call | Why there |
|---|---|---|
| 9 | `backRoomRestock()`, after `advanceSealed()` (`M/GameStore.swift` L1145) | Cases that arrived today can restock the shelf for the next store day. `storeDayEnd()` (L1125) runs before the day moves, so the restock is ready for the next morning. |
| 11 | `ripShipEndDay()`, after `streamsEndDay()` (L1161) | Before Part C's `calloutsEndDay()` (step 15), so the night's `unshippedOrder` acts are in the log. Whether a new act can roll the same night is Part C's rule D7 (C-m4). |
| 13 | `distributorEndDay()`, then `plugEndDay()`, after `splitsEndDay()` (L1162) | After `advanceSealed`, so the check sees today's deliveries. Before rent and taxes. Plug items arrive with status nil, so `advanceSealed` does not touch them. |

The second `syncMarket()` (L1170) runs after these steps. Case prices read `PriceCycle.today`, so a price read in a step uses the market of the new day after the first `syncMarket()` (L1132).

### 6.2 Where the exclusivity rule matters

`GameStore.data` is `@Observable`. A closure that runs **during** a mutating call on `data.x` must never read `data.y`. It crashes with "Fatal access conflict". The closures of `removeAll(where:)`, `sort(by:)`, `firstIndex` used inside a subscript write, and any mutating method run during the write. A closure that runs **before** the write starts is safe: the right side of an assignment, the right side of `+=` (Swift evaluates it before the inout access begins), and a `filter`, `map`, or `forEach` over a copy. Even so, every Part B snippet reads into locals first, so the reader never has to check which case applies.

| Function | The line that would crash | The form in this plan |
|---|---|---|
| `backDoorCheck` | `data.distributor.hotRecords.removeAll { ($0.outcomeDay ?? $0.deliveredDay) <= data.day - 56 }` | The local `keep`. |
| `backDoorWarning` | `data.distributor.warnings.removeAll { $0 < data.day - 84 }` in place | Copy the account to a local `a`, filter with the local `cutoff`, write back once. |
| `plugEndDay`, `seizePlugStock` | `data.sealed.removeAll { $0.grayOrder == data.plug.orders[k].id }` | The local sets `seizedGray` and `takenIDs`. |
| `seizePlugStock` | `data.machines[i].stock.removeAll { $0.item.grayOrder == data.plug... }` | The local `loss.ids`. |
| `finishRipShip` | `data.raw.removeAll { $0.ripID == data.ripShip.orders[k].ripID }` | The local sets `cardIDs`, `bulkIDs`, `looseIDs`. |
| `returnPalmedCards` | `data.raw.removeAll { data.ripShip.orders[k].palmedCardIDs.contains($0.id) }` | The local set `ids`. |
| `ripShipEndDay` | `data.ripShip.orders.removeAll { $0.soldDay < data.day - 28 }` | The local `cutoff`. |
| `createRipShipOrder` | `data.ripShip.grossByDay[data.day, default: 0] += price` (the key reads `data` during the modify access) | The local `today`, and a read before the write. |

These forms are safe but keep the local-first habit:

| Function | Line | Why it is safe |
|---|---|---|
| `buyWholesale` | `data.distributor.hotRecords += newItems.map { ... delivered ... }` | The `map` runs before the `+=` access. The plan still uses the local `delivered`. |
| `backRoomRestock` | the loop over the local `cases` that calls `openCase` | The loop iterates a copy, and `openCase` runs outside any closure on `data`. |
| `creditRepSpend`, `pushForAllocation`, `distributorEndDay` | write the account, then call `addPoints` | Two statements, not one closure. |
| `notePalm` | `data.raw.firstIndex(where: { ... palmed ... })` | A read. The closure reads only the local `palmed` set. |

Two rules for the build: never call `openCase`, `refundRipShipOrder`, `recordHiddenAct`, `retireHiddenAct`, `startCallout`, or `addLedger` inside a closure on `data`. And in `startRipShipRip`, read `store.data.sealed.first { }` before `beginRipShipRip`.

Run `-test` after each phase. The 14-day `days()` run reaches every new step (9.3), so a crash shows there.

## 7. Doc updates

| Doc | Section | Change |
|---|---|---|
| `docs/12-acquiring-product.md` | "Distributor / wholesale" (L185-201) | Rewrite as two tiers. **Secondary wholesaler**: reputation Respected, or a store that waits for its account. 72% of retail MSRP or 62% of market, $250 minimum, 1 case of each product and 2 cases a week. **Hobby distributor account**: a lease, a finished build-out, the seller's permit, and an application; the decision comes 14 days later. 58% of retail MSRP or 50% of market, no minimum. Hot product: 1 case of each product a week. Other product: grows with spend to 6. Add: hot product fills only part of a request (the formula and the table from 3.5). Elite gets one hot case a week that skips the fill roll. The rep relationship. The back-door rule (D-3): only sales to resellers (eBay, TCGplayer, Facebook, dealer trades, whole cases) count against the store; the shelf, the counter, vending, Rip & Ship, and the show table count for it; a 28-day window; at least 6 sold units and half of the delivered units; 40%; a 15% notice; warnings, a 4-week freeze, and a 12-week closure. Orders arrive as sealed cases. 1 order in 100 goes missing and is refunded later (Part A). |
| `docs/12-acquiring-product.md` | New "Cases" after "Case splits" | The case counts table (3.1), and the products with no case (art bundles, half boxes, club bundles, master cartons). A case is one item with its own price: a real case price when the price refresh has one (80% of the four wholesale kinds in print), else units × unit market × the factor table (3.3). Opening is a free action. Units split the paid amount, and the case premium goes away. "Case fresh" from trusted cases, +5% sale chance, no price change. Stranger cases at shows, eBay, and Facebook, with one fake roll for the whole case and the tape check. Packs stay independent draws. A "loaded case" claim is only a seller's words. |
| `docs/12-acquiring-product.md` | New "The plug" | The terms table from 4.7 with the code names and the 5.5% base fake rate, the 4.8 consequences, the unlock rule, the Buy screen entry, and the tax rule. |
| `docs/12-acquiring-product.md` | "Case splits" (L218-232) | Split boxes carry the "case fresh" tag. Rip & Ship (D/06) is not a group break: one buyer buys one whole product. |
| `docs/12-acquiring-product.md` | Online storefronts, eBay (L34-36) | Cleanup item (integration section 8): "Some listings ship from another country: the same English product, 12% cheaper, 10-day delivery." |
| `docs/04-reputation-and-followers-unlocks.md` | Tier table (L18-24) and the paragraph after it (L26-31) | Tier 3: "Secondary wholesaler access". Tier 4 Elite: "Priority case allocation: one hot case a week that skips the distributor's fill roll." The store paragraph: the store opens the secondary wholesaler from the build-out day, and the hobby account after a 14-day application. Replace "keeps the 72% price with no limit" with "keeps the 72% price, a $250 minimum, 1 case of each product, and 2 cases a week". |
| `docs/19-prototype-values.md` | "Wholesale, splits, consignment, and Facebook selling" (L356-364) | Every constant from section 8 under four sub-tables: Cases, Distributor, Plug, Rip & Ship. The real case sizes. |
| `docs/19-prototype-values.md` | "Live streams" (L299-313) | The Rip & Ship fee line, the Buy Now band, the strikes. |
| `docs/19-prototype-values.md` | "Your own store" (L380-412) | The back room fixture ($600, 12 cases). |
| `docs/22-own-store.md` | "Wholesale" (around L404-424) | The application and the 14-day wait at secondary terms. The rep, the fill rate, the 1-case hot allocation, and the back-door rule with its reason: the distributor wants hot product to reach customers. The shelf share line on the store screen. |
| `docs/22-own-store.md` | "Stock" (L118-133) and "Fixtures" (L215-228) | A case never goes on the customer shelf. The back room holds cases and restocks the shelf when a product runs low. The fixture row. Back-room cases count for the store break-in and the store stock rider (integration 4.2). |
| `docs/06-social-media.md` | "Live streams" (L36-82) | "Rip & Ship" as a stream action: the rule from 5.0, marking items in the setup, Buy Now and auction, the fee formula, the price band, the stream clock that stops during the rip, the ship queue and its 2-day deadline, the clip rule (5.5), the buyer meter, and the whole-case option. Replace "No stream action rips a product that a viewer bought" (L45-51) with the new rule. In "Consequences" (L105-117): a late order is a hidden act (D/35); a day-7 cancel is a chargeback with a strike; 2 strikes in 60 days give a 4-week ban; 3 in 120 days end Rip & Ship. Palming a hit is a scam (5.8) with its costs. |
| `docs/18-ripping.md` | "Ripping on a live stream" (L490-494) | "Rip & Ship": the cards belong to the buyer, so they carry the order and never become the player's. A rip that stops early ships the unopened packs. A whole-case rip runs at 0.75 minutes a pack and unboxes once. "Palm it" shows only on a big hit in a Rip & Ship rip: the scam, the 50% catch, and the costs. One line in "Sealed products in the rip" (L390): a case opens into units before any rip. |
| `docs/14-counterfeit-risk.md` | "Where the risk lives" (L17-38) | Wholesale and split cases, and their units, stay at zero. Stranger cases: one roll for the whole case at the source rate. Plug: 5.5% base, about 4% after the sealed and hype factors. The tape check. The plug's stolen stock. |
| `docs/15-selling.md` | "Whatnot" | Two fee models: a normal Whatnot sale (10.9% + $0.30, the player pays shipping) and Rip & Ship (8% stepping to 6.5%, 2.9% of sale plus buyer shipping, $0.30, $0.50 supplies; the buyer pays the label). The case-fresh sale bonus. |
| `docs/21-relationships-and-reputation.md` | Contact kinds (L28-54) | The distributor rep and the plug as supplier contacts. They never go in the contact book, never come to the store counter or a meet, and never give reputation. |
| `docs/26-taxes.md` | Seller's permit (L47-56) | Replace "not a requirement for the card show table or for wholesale" with "not a requirement for the card show table or the secondary wholesaler. A hobby distributor account requires it." Plug orders have no invoice, so income tax never counts them as a cost. |
| `docs/29-packing-and-crowds.md` | Carry space | A sealed case takes 1 space plus 1 for each 8 packs. The table from 2.7. |
| `docs/24-theft-and-insurance.md` | Car break-in | A sealed case does not fit in the thief's bag (10.5). Plug stock that police seize is not theft and has no claim. |
| `docs/31-vending-machines.md` | Stock | A machine holds units, never a sealed case. |
| `docs/08-ui-direction.md` | Inventory and Live stream | The case row and its own stack, the case opening sheet, the Rip & Ship panel, the buyer meter, and the ship queue. |
| `docs/17-calendar-and-events.md` | Scheduled entries | The distributor decision day and the Rip & Ship ship deadline show on the calendar. |

## 8. Constants

Each constant lives in `extension Balance` in the file named, the same way the code stores constants today. "Design" means no source gives the number.

### 8.1 Cases

| Constant | Value | File | Basis |
|---|---|---|---|
| `caseSizes` | box 6, ETB 10, bundle 25, pack 144, blister 24, B&B 10, collection 6, tin 6 | `M/Wholesale.swift` | PHD solicitations (cases.md) |
| `caseSizeByName` | UPC 4, Tech Sticker 12, Knock Out 24 | `M/Cases.swift` | PHD |
| (in `caseSize(for:)`) | PC ETB 4, mini tin 10, 1-pack blister 16; nil for art bundles, Fun Packs, half and enhanced boxes, bundles not of 6 packs, club items, master cartons | `M/Cases.swift` | PHD; one seller for PC ETB; catalog check |
| `wholesaleKinds` | box, ETB, bundle, pack | `M/Cases.swift` | Keeps the seeded weekly offers |
| `caseFactors` | box 0.95/1.05/1.15, ETB 1.05/1.15/1.25, bundle 0.95/1.05/1.10, other 1.00/1.05/1.10 | `M/Cases.swift` | tcgcsv ratios |
| `caseOldDays` | 730 | `M/Cases.swift` | Report 3.3 |
| `caseFreshSaleBonus` | 1.05 | `M/Cases.swift` | Design |
| `caseOpenConfirmPremium` | 50 | `M/Cases.swift` | Design (UI review) |
| `dealerCaseChance` | 0.20 | `M/Cases.swift` | Design (report 3.5) |
| `onlineCaseListingChance` | 0.10 | `M/Cases.swift` | Design (report 3.5) |
| `ebayCaseShare` | 0.85...1.05 | `M/Cases.swift` | Design, near the eBay unit band |
| `facebookCaseShare` | 0.70...0.95 | `M/Cases.swift` | Design, near the Facebook unit band |
| `strangerCaseMax` | 15000 | `M/Cases.swift` | Design (m10) |
| `caseCheckCatch` | 0.5 | `M/Cases.swift` | Report 3.5 ("halves") |
| `caseRumorChance` | 0.10 | `M/Cases.swift` | Design (flavor) |
| `casePacksPerSpace` | 8 | `M/Packing.swift` | Integration D1 |
| `backRoomCases` | 12 | `M/CardStore.swift` | Design |
| `fixtureCosts[.backRoom]` | 600 | `M/CardStore.swift` | Design |
| `backRoomRestockAt` | 1 | `M/Cases.swift` | Design |
| Price fallback in `cases.py` | `marketPrice`, else `midPrice` | `tools/export/cases.py` | Data check |
| Ratio filter in `cases.py` | 0.4...2.5 | `tools/export/cases.py` | Data check (real sleeved packs at 0.57) |

### 8.2 Distributor

| Constant | Value | File | Basis |
|---|---|---|---|
| `distributorReviewDays` | 14 | `M/Distributor.swift` | Report 4.2, approved |
| `repStartPoints` | 20 | `M/Distributor.swift` | Design |
| `repSpendStep` | 1000 | `M/Distributor.swift` | Report 4.3 |
| `repPointsPerWeek` | 3 | `M/Distributor.swift` | Report 4.3 |
| `repEventPoints` | 1 | `M/Distributor.swift` | Report 4.3 |
| `pushCost` | 5 | `M/Distributor.swift` | Report 4.3 |
| `pushFillBonus` | 0.25 | `M/Distributor.swift` | Design |
| `pushCooldownDays` | 28 | `M/Distributor.swift` | Design |
| `fillBase` | 0.05 | `M/Distributor.swift` | Integration D2 |
| `fillPressureWeight` | 0.35 | `M/Distributor.swift` | Report 4.4 |
| `fillRepWeight` | 0.20 | `M/Distributor.swift` | Report 4.4 |
| `fillMax` | 0.90 | `M/Distributor.swift` | Report 4.4 |
| Hot cases a week, each product | `allocationBase` (1), +1 at Elite | `M/WholesaleAccount.swift` (`wholesaleCap`) | D-3, report 4.5 |
| `backDoorWindowDays` | 28 | `M/Distributor.swift` | D-3 |
| `backDoorShelfShare` | 0.40 | `M/Distributor.swift` | Report 4.6 |
| `backDoorNoticeChance` | 0.15 | `M/Distributor.swift` | Report 4.6 |
| `backDoorMinUnits` | 6 | `M/Distributor.swift` | D-3 |
| `backDoorMinShare` | 0.5 | `M/Distributor.swift` | D-3 |
| `backDoorRepCost` | 15 | `M/Distributor.swift` | Report 4.6 |
| `backDoorWarningWindowDays` | 84 | `M/Distributor.swift` | Report 4.6 (12 weeks) |
| `hotFreezeDays` | 28 | `M/Distributor.swift` | Report 4.6 |
| `accountCloseDays` | 84 | `M/Distributor.swift` | Report 4.6 |
| `hotRecordKeepDays` | 56 | `M/Distributor.swift` | Design |
| Part A: `wholesaleMissingChance`, `missingShipmentRefundDays` | 0.01, 14 | `M/Wholesale.swift`, Part A | D-12 |
| Existing: `storeWholesaleDiscount` 0.58, `allocationBase` 1, `allocationStep` 6000, `allocationMax` 5, `hotProductRatio` 1.2, `wholesaleDiscount` 0.72, `wholesaleMinOrder` 250, `wholesaleCasesPerWeek` 2, `wholesaleShortChance` 0.12, `storeWholesaleMarketFloor` 0.5 | unchanged | `M/WholesaleAccount.swift`, `M/Wholesale.swift` | Existing. D-13 did not adopt the 0.6 floor. |

### 8.3 Plug

| Constant | Value | File | Basis |
|---|---|---|---|
| `plugUnlockChance` | 0.10 a day | `M/Plug.swift` | Design |
| `plugMinDay` | 14 | `M/Plug.swift` | Design |
| `plugReturnDays` | 28 | `M/Plug.swift` | Design |
| `plugMsrpShare` / `plugMarketFloor` | 0.85 of retail MSRP / 0.65 | `M/Plug.swift` | Report 4.7. D-13 did not adopt 0.55. |
| `plugOffersPerWeek` / `plugOffersLowPressure` | 3 / 1 (pressure under 0.3) | `M/Plug.swift` | Design |
| `plugMaxOrder` / `plugMaxCases` | 20000 / 5 | `M/Plug.swift` | Design |
| `plugDeliveryDays` | 5...10 | `M/Plug.swift` | Report 4.7 |
| `plugVanishBase` / `Step` / `Free` / `Max` | 0.06 / 0.01 per $1,000 / $2,000 / 0.16 | `M/Plug.swift` | Report 4.7 |
| `plugVanishFloor` / `plugTrustStep` | 0.03 / 0.01 | `M/Plug.swift` | Report 4.7 |
| `plugShortChance` / `plugShortShare` | 0.10 / 0.6...0.9 | `M/Plug.swift` | Report 4.7; share is design |
| `fakeRatePlug` | 0.055 (about 4.1% for a hot case) | `M/Counterfeits.swift` (the only declaration) | D-13, sim 6.1 |
| `plugSeizeChance` / `plugSeizeDays` | 0.02 / 3...14 | `M/Plug.swift` | Report 4.7; days are design |
| `plugRepLearnChance` / `Cost` / `WindowDays` | 0.10 / 20 / 28 | `M/Plug.swift` | Report 4.8; window is design |

### 8.4 Rip & Ship

| Constant | Value | File | Basis |
|---|---|---|---|
| `ripShipCommissionTiers` | 0: 8%, 15k: 7.5%, 50k: 7%, 150k: 6.75%, 500k: 6.5% | `M/RipShip.swift` | Whatnot ends; middle is design |
| `ripShipProcessingRate` | 0.029 | `M/RipShip.swift` | Whatnot |
| `ripShipProcessingFlat` | 0.30 | `M/RipShip.swift` | Whatnot |
| `ripShipSupplies` | 0.50 | `M/RipShip.swift` | Underpriced guide |
| `ripShipShipping(packs:)` | ≤3 packs 4.47, ≤36 9.85, more 15.50 | `M/RipShip.swift` | USPS $4.47; the rest design |
| `ripShipHotBand` / `ripShipBand` | 0.95...1.20 / 0.90...1.05 | `M/RipShip.swift` | Report 5.3 (design) |
| `ripShipBuyRate` | 0.0024 | `M/RipShip.swift` | Design (1.2 × the Buy Now rate) |
| `ripShipBigTicket` | 500 | `M/RipShip.swift` | Design |
| `ripShipRivalStep` / `Floor` | 0.05 / 0.80 | `M/RipShip.swift` | Design |
| `ripShipRepeatBuyerChance` | 0.5 | `M/RipShip.swift` | Design |
| `ripShipLuckStep` | 0.05 | `M/RipShip.swift` | Design (I1) |
| `ripShipWaitMinutes` / `ripShipImpatience` | 10 / 0.03 interest a minute | `M/RipShip.swift` | Design |
| `ripShipCaseMinutesPerPack` | 0.75 | `M/RipShip.swift` | Design |
| `ripShipClipFollowerShare` | 0.03 | `M/RipShip.swift` | Design |
| `ripShipDeadlineDays` | 2 | `M/RipShip.swift` | Whatnot rule, report 5.4 |
| `ripShipCancelDays` | 7 | `M/RipShip.swift` | Design |
| `ripShipChargebackActWeight` | 2.0 | `M/RipShip.swift` | D-5 |
| `whatnotStrikeBanWindow` / `whatnotStrikeBanDays` | 60 / 28 | `M/RipShip.swift` | D-5 |
| `whatnotStrikeCloseWindow` | 120 (3 strikes end Rip & Ship) | `M/RipShip.swift` | D-5 |
| `ripShipShipMinutes` | 10 | `M/RipShip.swift` | Report 5.4 (Part C reads it) |
| `ripShipShipPoints` | 2 | `M/RipShip.swift` | Design |
| `ripShipKeepDays` | 28 | `M/RipShip.swift` | Design |
| `ripShipNotOpenedAuthenticity` | 0.02 | `M/RipShip.swift` | Design |
| `resealedOnStreamAuthenticity` | 0.05 | `M/RipShip.swift` | Design |
| `palmFoundChance` | 0.5 | `M/RipShip.swift` | Report 5.6 |
| `palmFoundReputation` | 40 | `M/RipShip.swift` | Report 5.6 |
| `palmBanDays` | 56 | `M/RipShip.swift` | Report 5.6 (8 weeks) |
| `palmCalloutHeat` | 90 | `M/RipShip.swift` | Report 5.6 |
| Part C: `unshippedOrder` discovery and decay; `lateShipGoodwillShare` 0.10, `lateShipGoodwillMin` 5 | 0.20 a day, decay 0 | `M/Callouts.swift` (Part C) | D-4; Part C owns the roll and the goodwill sum |

## 9. Tests (`app/PokeVendor/Hub/GameTests.swift`)

Add a check only for a rule that moves money or items, or a rule that broke before. Add two groups before `timed("days", days)` (L37): `timed("cases", casesAndDistro)` and `timed("ripship", ripShip)`. Extend `days()` for the crash check. Each group calls `fresh()` (L53), which gives $20,000 and 1,200 followers. Today `-test` runs 136 checks in 2.8 s. The new checks rip only 3-pack blisters and use force tools in place of End Day loops, so the run should stay near 3 s.

**DEBUG test tools.**

| Tool | File | Does |
|---|---|---|
| `testCase(_ product: Product, units: Int, fresh: Bool) -> UUID` | `M/Cases.swift` | Appends a case in hand at `units × product.market × 0.6` paid. |
| `testApproveDistributor()` | `M/Distributor.swift` | Sets `appliedDay` and `approvedDay` to today and calls `ensureRepContact()`. |
| `testBackDoorCheck() -> [String]` | `M/Distributor.swift` | Calls the private `backDoorCheck()`. |
| `testUnlockPlug()` | `M/Plug.swift` | Sets the plug name and `unlockedDay` and adds the `"plug"` contact. |
| `GameStore.forceFill: Double?` | `M/Distributor.swift` | Replaces `hotFillRate`. |
| `GameStore.forceBackDoorNotice: Bool?` | `M/Distributor.swift` | Replaces the notice roll. |
| `GameStore.forceWholesaleMissing: Bool?` | `M/Wholesale.swift` | Replaces the 1% missing roll in `buyWholesale`. |
| `GameStore.forcePlugVanish`, `forcePlugShort`, `forcePlugSeize: Bool?` | `M/Plug.swift` | Replace the three plug rolls. |
| `GameStore.forcePalmCaught: Bool?` | `M/RipShip.swift` | Replaces the palm roll. |
| `ripAll(_:steps:prepare:)` | `Hub/GameTests.swift` L62 | Gets a `steps` limit (default 40) and a `prepare: ((RipModel) -> Void)?` that runs before the loop, so a test can build the model with a given `ripID`. |

Each test sets every force tool it uses back to nil at its end.

### 9.1 `casesAndDistro()`

| Check | How |
|---|---|
| Case counts (3.1, M8) | `Balance.caseSize(for:)` on the first catalog product that fits each rule: an ETB 10, a 6-pack bundle 25, a single pack 144, a 36-pack box 6, a 3-pack blister 24, a "Mini Tin" 10, an "Ultra-Premium" collection 4. Nil for an "Art Bundle", a "Half Booster Box", a "Fun Pack", and the "Master Carton". |
| Case and unit stack apart (B2) | `stackKey` of a test case and of a unit of the same product differ. |
| Old saves decode | Decode `DistributorAccount` from `{"spent": 9000, "week": 3, "cases": {}}`: `spent == 9000`, `approvedDay == nil`. Decode `PlugState` and `RipShipState` from `{}` with no throw. |
| Open conserves units and paid (3.2) | `testCase(etb, units: 10, fresh: true)`. `openCase`. The case is gone. Exactly 10 new items with `productID == etb.id` and `caseUnits == nil`. Their `paid` sum equals the case paid within $0.005. Each is case fresh with `fake == nil`. The sum of their `realMarket(of:)` is `10 × etb.market` within $0.01. |
| A resealed case gives resealed units | `testCase`, set `fake = .convincing`, open. Every unit has `fake == .convincing`. |
| A sold case opens only for its order (M6) | `testCase`, set its status to `.soldToViewer(orderID: UUID())`. `openCase(id)` returns `[]`. |
| Case price rule (3.3) | For a product with no `caseListings` row: `CaseMath.market(p, units:) == p.market × units × CaseMath.factor(p)` within $0.01. When `caseListings` is not empty, a product with a row prices at `PriceCycle.price(row.market, p.marketFactor())`. |
| Wholesale delivers whole cases (2.9) | `addReputation(400)`. `forceWholesaleMissing = false`. Pick an offer that is not hot. `buyWholesale(offer, cases: 1)`. The new items with source "Wholesale" add up to `offer.caseSize` units (counting `caseUnits ?? 1`), less the short-shipped units. Cash fell by `offer.casePrice` less the short-ship refund. |
| Missing shipment | `forceWholesaleMissing = true`, order 1 case. No new item. Cash fell by the case price. `data.retail.missingShipments` (Part A) has one entry with `refund == casePrice`. |
| Hot cap stays at 1 (D-3) | `testOpenCardStore(.stripMall, term: 1)`, `testApproveDistributor()`, `data.distributor.spent = 30_000`. `wholesaleCap(hot) == 1`. `wholesaleCap(notHot) == 6`. |
| Fill charges only filled cases (4.4, M10) | `forceFill = 0`. Order 1 hot case. Cash did not change, no item arrived, and `wholesaleLeft` is 0. Clear `data.distributor.cases`. `forceFill = 1`. Order 1 hot case. Cash fell by exactly the case price. |
| Elite case skips the fill (4.5, M10) | Clear `data.distributor.cases` and `eliteCaseWeek`. `addReputation(700)`. `forceFill = 0`. Order 1 hot case: it is charged and arrives. Clear `cases` again and order 1 more: it fills 0. |
| Retail and off-shelf sales (D-3, M2) | Add two hot records for two test units. `addReceipt(..., ids: [a])` (the vending and counter default) marks `.retail`. `completeSaleNow(..., channel: .ebay, ids: [b])` marks `.offShelf`. |
| Back-door verdict (M3) | `forceBackDoorNotice = true`. Add 6 hot records with `outcome = .offShelf` and `outcomeDay = day`. `testBackDoorCheck()` gives one warning. Repeat with 6 new records: `hotFrozenUntil` is set. Repeat again: `closedUntil` is set. Each run records at most one `backDoorAllocation` act in 28 days. |
| Plug tax rule (4.8) | `check(!Balance.taxableCategories.contains(.grayMarket), ...)`. |
| Plug delivery (M10) | `testUnlockPlug()`. `forcePlugVanish = false`, `forcePlugShort = false`, `forcePlugSeize = false`. Order 1 case of the first `plugOffers` entry (check that the list is not empty). Set its `arrivesDay` to tomorrow. One `endDay()`. One case with `grayOrder == order.id` is in hand. The ledger has exactly one `.grayMarket` entry for the order, of `-total`. |
| Plug seizure, one act | Set the delivered order's `seizeDay` to tomorrow. One `endDay()`. No item with that `grayOrder` is left. `data.hiddenActs` holds one `plugSeized` act with `revealDay != nil`, and the order's `plugPurchase` act is gone. |
| Plug vanish | `forcePlugVanish = true`. Order again, set `arrivesDay` to tomorrow, one `endDay()`. Nothing arrives, the money stays gone, and `plugOpen == false`. |

### 9.2 `ripShip()`

All content checks use a 3-pack blister, so the rip ends in a few steps.

| Check | How |
|---|---|
| Fee math (5.2) | `let f = store.ripShipFees(price: 100, shipping: 4.47)`. `abs(f.total - 11.83) < 0.005`: 8.00 + 3.03 + 0.30 + 0.50. |
| One whole product to one buyer | Add a test blister. `createRipShipOrder(itemID:price: 20, buyer: "Jess", ...)`. Cash rose by exactly `order.net`. The item status is `.soldToViewer`. A second `createRipShipOrder` on the item returns nil. |
| All contents go to the buyer (5.1) | `let rid = UUID()`. `ripAll(store.beginRipShipRip(order.id, ripID: rid), prepare: { $0.shipOrderID = order.id })` with a model built with `ripID: rid`. Count the non-Energy cards that the model saw. `finishRipShip`. No `OwnedCard` and no sealed item carries the order status. No `BulkGroup` has `shipOrder == order.id`. No card with `ripID == rid` is in `data.raw`. `order.state == .ripped`. `order.cards.count` plus the bulk card count equals the count of seen cards. |
| An early stop ships the rest | Same, but rip 1 pack, then `finishRipShip`. `order.loose.count == 2`, and no loose pack of the order is in `data.sealed`. |
| A whole case for one buyer (5.7) | `testCase(bundle, units: 25)`. Order it. `beginRipShipRip` returns 25 units, all with the order status. `finishRipShip` with no rip. `order.loose.count == 25`, and none is in `data.sealed`. |
| Palm keeps one card (5.8) | `forcePalmCaught = false`. Rip a blister for an order with `ripAll`, but stop before `finishRipShip`. Take any raw card with the order status and call `notePalm(orderID:ripID:print:value:)` with it. `finishRipShip`. Exactly that card is in `data.raw` with status nil. `order.palmedCardIDs.count == 1`. One `palmedHit` act exists with `refund == order.price + value`. |
| `returnPalmedCards` | Call it on that order. The card is gone from `data.raw` and is in `order.cards`. `order.shipped` and `order.refunded` are true. The act is gone. |
| Palm caught (M10) | `addReputation(400)` first. `forcePalmCaught = true`. Palm, `finishRipShip`, `endDay()`. Reputation fell by at least 40. `whatnotBanned` is true. One open callout exists with `actKind == .palmedHit`. |
| Not opened on stream | Order an item, do not rip, `endDay()`. Cash is back to the start. The item status is nil. `order.refunded` is true. |
| Shipping | After a rip, `shipRipShipOrders([order.id])`. `order.shipped` is true, and the hour moved by 10 minutes. |
| One refund only (M4, C-B3) | Rip an order, set `rippedDay` 7 days back, `endDay()`. Cash fell by `order.price` (the chargeback). The cards are back in Inventory. `refundRipShipOrder(order.id)` returns "" and cash does not change. The ledger has one refund entry for the order. `data.ripShip.strikes.count == 1`. |
| Strikes ban (D-5) | A second chargeback in the same run: `whatnotBanned` is true. |

### 9.3 `days()` (L658-722)

Before the loop: `testApproveDistributor()`, one plug order with all plug force tools false and `arrivesDay` 3 days on, one Rip & Ship order for a blister that is ripped and not shipped, and one case in the back room (add the fixture, then `stockStore`). The 14 days then reach `backRoomRestock`, `ripShipEndDay` (the late act and the day-7 chargeback), `distributorEndDay` (two Mondays, the back-door check), and `plugEndDay` (the arrival). After the loop: no order is still `.sold`, the late order is refunded, and the back-room product's units plus case units did not grow. This catches an exclusivity crash ("Fatal access conflict"), which broke before.

## 10. Interactions with existing systems, and risks

### 10.1 Case splits

Splits stay as they are: booster boxes and ETBs only, 85% of market a box, no livestream, no random assignment. Split boxes get the "case fresh" tag. A split never makes a case item, because the player owns only part of the case. The split options exclude half boxes.

### 10.2 The own store

- The hobby account waits 14 days after the build-out. During the wait the store buys at secondary terms. AJ approved it.
- Hot product stays at 1 case of each product a week. The store is a strong route, not the only route (sim: 2.4 hot cases a week, not 12.3).
- A case never goes on the customer shelf. With the back room, cases restock the shelf by themselves. Without it, the player opens cases by hand.
- The back-door check counts the shelf, the counter, vending, Rip & Ship, normal Whatnot streams, and the show table as retail (D-3). An honest store that uses Rip & Ship is never warned. A close does not end a pending check or a penalty.
- The store sealed buylist never offers a case. Walk-in sellers bring one product.

### 10.3 Vending machines

A machine takes units only (`vendableSealed` excludes cases). A machine sale of a hot unit counts as retail. A plug seizure takes plug units from machines too.

### 10.4 Counterfeits

- Distributor and split cases, and their units, stay at zero fake risk.
- A stranger case rolls once for the whole case. A fake case gives fake units, so one bad case means 6 to 25 resealed boxes. The tape check is the counter.
- The plug rolls once per case at about 4.1% for hot product.
- A resealed product on a Rip & Ship stream shows on camera. Whatnot refunds the buyer, and the player loses authenticity. The player cannot put a known fake up for Rip & Ship.
- A known resealed product that sells: Part C's `recordBadSale` branch records `sellResealed` only when the buyer does not find it (11.2).

### 10.5 Theft and insurance

- A car break-in takes a bag of items from `showStock` (`M/Losses.swift` L163-172). Add `&& !$0.isCase` to the sealed filter at L166: a case does not fit in a bag.
- The show-table thief (`rollShowTheft`, L140-160) takes only cards (`kind == .card`, L142). It cannot take a case. No change (review m17 declined).
- Insurance claims read `realMarket(of:)`, so a case claims at its case price.
- Back-room cases are store stock. They count for the night break-in and the store stock rider (integration 4.2, D-14).
- Plug seizure is not theft. It has no claim.

### 10.6 Taxes and fees

- Rip & Ship income is a Whatnot sale. It counts for the platform's sales tax and for the 1099-K note (`notePlatformSale`). A refund lowers the commission tier.
- Plug orders and plug refunds are `.grayMarket` and never count for income tax.
- The case-fresh bonus changes sale chance, not price.

### 10.7 P&L challenge (D/32)

`openCase` calls `inheritChallenge`, so units of a challenge case stay in the challenge. A Rip & Ship sale of a challenge item credits the challenge through `addReceipt(ids:)`. The ripped contents then go to the order, so the challenge does not count them twice.

### 10.8 Demand limit

`createRipShipOrder` calls `noteDemand(item.name, channel: .whatnot)`, so many Rip & Ship sales of one product lower its next Whatnot sale chance.

### 10.9 Risks

| Risk | Mitigation |
|---|---|
| A wrong real case price | `cases.py` drops ratios outside 0.4 to 2.5 and prints them, and it prints every `midPrice` row. |
| An old save loses its sealed items because one new field fails to decode | Every new `SealedItem`, `BulkGroup`, and `Contact` field is Optional. `DistributorAccount`, `PlugState`, and `RipShipState` have tolerant decoders. Array element types carry the Optional-field comment. |
| An old store owner loses the account | `grandfatherDistributor` approves a store that is already built on load. |
| The app closes during a Rip & Ship rip | Every content carries the order status or `shipOrder`, so no other path can sell it. `ripShipEndDay` runs `finishRipShip` for any started order. The function is safe to run twice. |
| A whole-case rip takes too long | 0.75 minutes a pack, one unbox for the case, and Fast mode. The sheet disables a case when the stream has too little time. |
| Rip & Ship drifts toward a group break | Section 5.0. No API sells part of a product or pays by result. Review any later change against it. |
| The plug becomes the best source | It costs more than the hobby account and carries the vanish, fake, and seizure risks and a hidden act on every order. The simulation found it a strict loss for each dollar. |
| An order price paid twice | One refund function, the `refunded` flag, and `returnPalmedCards` closing the order. A test checks the ledger. |

## 11. Cleanup items and contracts

### 11.1 Cleanup items in Part B files

| Item | Location | Fix |
|---|---|---|
| `caseSizes` has "Booster bundle": 12 and "Booster pack": 36 | `M/Wholesale.swift` L45 | Section 2.1: 25 and the 144-pack sleeved booster case, plus the other real counts. |
| The `buyWholesale` comment says "The minimum order is $500" | `M/Wholesale.swift` L83 | The new doc comment in 3.5 names `Balance.wholesaleMinOrder` ($250). |
| D/04 and D/12 promise Elite "priority case allocation", and the code has none | `M/WholesaleAccount.swift`, D/04, D/12 | Section 3.5 builds it. Section 7 updates both docs. |
| D/04 says a Respected player with no store has "no limit" | D/04 L30-31 | Section 7 corrects it to 1 case of each product and 2 cases a week. |
| D/12 eBay "international product" | D/12 L34-36 | Section 7, with the integration wording. |

### 11.2 Contracts with Parts A and C, and with the integration file

**HiddenActKind cases that Part B records.** Part C defines all of them. Part B needs no new case. The weights follow Part C's table (section 1.4).

| Case | Where Part B records it | Weight | Other arguments |
|---|---|---|---|
| `.backDoorAllocation` | `backDoorCheck`, at most once in 28 days | `max(0.6, min(1.5, 1.5 × (1 − share)))` | none |
| `.plugPurchase` | `orderFromPlug` | `max(0.3, min(2, total / 2000))` | `sourceID: order.id`; retired (no force) on a seizure |
| `.plugSeized` | `seizePlugStock` | 1.0 | `revealDay: data.day + 2`, `sourceID: order.id` |
| `.palmedHit` | `notePalm`, when the camera did not catch it | 1.5 | `witnesses:` peak viewers, `contactID:`, `refund: order.price + card market`, `sourceID: order.id` |
| `.unshippedOrder` | `ripShipEndDay`, once, when an order passes 2 days | 1.0 | `contactID:`, `refund: order.price`, `sourceID: order.id` |
| `.unshippedOrder` after the chargeback | `refundRipShipOrder(.chargeback)`, only when `retireHiddenAct(lateActID, force: true)` returns false | 2.0 | the same |

`.sellResealed` is Part C's: `recordBadSale(..., sealed:)` records it only when the buyer does not find the fake (C-M2). Part B adds no `recordBadSale` call. A Rip & Ship sale cannot carry a known fake (`ripShipBlock`), and a resealed product on stream refunds the buyer at once.

**Part C API that Part B uses, as Part C revision 2 wrote it:** `recordHiddenAct(_:weight:note:witnesses:contactID:revealDay:refund:sourceID:) -> UUID`; `retireHiddenAct(_:force:) -> Bool`, with `force: true` in `shipRipShipOrders`, `refundRipShipOrder`, and `returnPalmedCards`; and `startCallout(.fairness, truth: true, receipts: true, heat: 90, accuser: .person(buyer), text:, force: true, actKind: .palmedHit, sourceID: order.id, contactID:, refund: order.price + card market)` in `settlePalm`. Part B no longer calls `exposeHiddenAct`.

**Part B API that Part C uses:** `RipShipOrder.shipped` and `.refunded`; `shipRipShipOrders(_:) -> String?` (10 minutes, retires the act); `returnPalmedCards(_:)`; `refundRipShipOrder(_:reason:)`; `banFromWhatnot(days:reason:)` with no `save()`; `Balance.ripShipShipMinutes`. All of them are phase 0 stubs or final code by phase 5.

**Contract changes that others must make.**

1. **Part C: the palm refund after a chargeback.** D-4 says the order price is never paid twice. If a palmed order is also cancelled on day 7, the buyer already got the price back. Part C's "make it right" on a palm must then pay only the card's market. Part B adds `func palmRefundDue(_ orderID: UUID) -> Double` (`order.refunded ? order.palmedValue : order.price + order.palmedValue`). Part C should pay that, not the fixed `c.refund`.
2. **Part C: a palm that comes out later (C-m17).** A caught palm bans Whatnot for 8 weeks. A palm found later through the log has no ban. Part C's `settle` should call `banFromWhatnot(days: Balance.palmBanDays, reason:)` when a true `.fairness` callout with `actKind == .palmedHit` peaks at 80 or more.
3. **Part A: the missing-shipment names (D-12).** Part A's file still says `registerMissingShipment(name:refund:dueIn:)` and `missingRefundDays`. D-12 sets `registerMissingShipment(name:refund:learnIn:)` and `missingShipmentRefundDays`. Part B uses the D-12 names.
4. **Part A: fields and functions that Part B reads.** `data.flipperPressure` (fill rate, plug offer count), `data.rivals` with `kind == .creator` (Rip & Ship buyer share), `Product.retailMSRP()` and `Product.isHot()` (integration 1.4). Part B reads them and never writes them.
5. **Integration file.** Section 1.5 still says `dueIn: Balance.missingRefundDays`; it should match D-12. Section 1.7 says "make it right" calls `refundRipShipOrder`; Part C revision 2 and D-4 replace that with `shipRipShipOrders` and `returnPalmedCards`. Section 4.2 calls `isInStore` unqualified; it is `static`, so it must be `Self.isInStore` (review m21).

## 12. Decisions

The open question of revision 1 (case carry space) is closed: integration D1 keeps 1 space plus 1 for each 8 packs. AJ can still change it before the build. Part B has no other open question.
