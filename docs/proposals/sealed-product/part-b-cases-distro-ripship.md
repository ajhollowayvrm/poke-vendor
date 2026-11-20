# Part B: cases, the distributor, the plug, and Rip & Ship (code proposal)

Scope: proposals 3.1 to 3.7, 4.1 to 4.8, and 5.1 to 5.7 of `reports/Sealed product and flipper play.md`, plus the cleanup items that touch these files. AJ approved every proposal, including 4.2 (the 14-day application) and 5.6 (palm the hit).

Code base: commit `503ff3c`. `M` = `app/PokeVendor/Model`. Line numbers are from that commit. Read them as "near this line", because Parts A and C also add lines to some files.

This is a build plan. Each section gives the exact Swift change, the save rule, the End Day hook, the UI, the constants, and the tests. Prose is in STE. Code, identifiers, and tables are exempt.

## 0. Summary

### 0.1 What changes

| Area | Change |
|---|---|
| Case counts (3.1) | `Balance.caseSizes` gets the real counts. A new `Balance.caseSize(for:)` reads the product kind and name. |
| Case item (3.2, 3.3) | `SealedItem` gets `caseUnits`. A sealed case is one item with its own price. A real tcgcsv case price wins. Else the case factor table sets the price. |
| Open a case (3.2, 3.4) | A free action turns a case into N units. The units split the paid amount exactly. Units from a trusted case get a "case fresh" tag. |
| Stranger cases (3.5) | Show sealed dealers, eBay, and Facebook sell a case now and then. One fake roll covers the whole case. A free tape check halves the risk. |
| Space (3.6) | A case packs tighter than loose boxes. A new store fixture, the back room, holds cases off the shelf and restocks the shelf from them. |
| Independent draws (3.7) | Pack draws never read case data. A "loaded case" claim is seller text only. |
| Tiers (4.1) | The no-store route is the "secondary wholesaler". The store route is the "hobby distributor account". Both stay in `DistributorAccount`. |
| Application (4.2) | The hobby account needs a lease, a finished build-out, the seller's permit, and an application. The decision comes 14 days later. |
| Rep (4.3) | A new contact kind, `distributorRep`, with a 0 to 100 relationship. Spend and store events raise it. A "push" costs 5 points. |
| Fill rate (4.4) | Hot cases fill with a chance from flipper pressure (Part A) and the rep relationship. |
| Elite (4.5) | At Elite, one hot case each week skips the fill roll. |
| Back door (4.6) | The game tracks hot cases for 21 days after delivery. A low shelf share brings warnings, a freeze, then a closed account. |
| Plug (4.7, 4.8) | A new gray contact sells hot cases for full prepayment. It can vanish, ship short, ship resealed, or ship stolen stock. No invoice, so no tax cost. |
| Rip & Ship (5.1 to 5.7) | A new stream action. One viewer buys one whole sealed product. The player rips it on stream. Every card, every bulk card, and every unopened pack goes to that viewer. The real Whatnot fees apply. A ship queue has a 2-day deadline. The player can palm a big hit. That act is a scam with real consequences. |

### 0.2 New source files

Run `xcodegen generate` in `app/` after you add these files. The project reads the whole `PokeVendor` folder, so `project.yml` does not change.

| File | Holds |
|---|---|
| `M/Cases.swift` | `CaseListing`, `CaseKind`, `CaseMath`, case constants, `makeCase`, `openCase`, `checkCase`, stranger case offers, `backRoomRestock` |
| `M/Distributor.swift` | `DistributorTier`, `HotAllocationRecord`, application, rep, fill rate, Elite case, back-door check, `distributorEndDay` |
| `M/Plug.swift` | `PlugState`, `PlugOrder`, plug offers, `orderFromPlug`, `plugEndDay` |
| `M/RipShip.swift` | `RipShipState`, `RipShipOrder`, `RipShipFees`, order life cycle, `ripShipEndDay`, `banFromWhatnot`, `refundRipShipOrder` |
| `Inventory/CaseOpenSheet.swift` | The case opening animation and summary |
| `Stream/RipShipViews.swift` | The Rip & Ship pick sheet, the "sold, rip it now" panel, the summary section |
| `Stream/ShipQueueView.swift` | The ship queue screen |
| `Buy/PlugViews.swift` | The gray market section of the distributor screen |
| `tools/export/cases.py` | Writes `Resources/cases.json` from the tcgcsv cache |
| `Resources/cases.json` | Real case prices: unit product ID, case SKU, units, 2026 market price |

### 0.3 Build order inside Part B

1. Section 1 (shared fields) and section 2 (cases). Every later step reads the case item.
2. Section 3 (distributor). It needs the case item and Part A's `flipperPressure`.
3. Section 4 (plug). It needs the case item and the distributor tiers.
4. Section 5 (Rip & Ship). It needs the case item and Part C's API.
5. Run `-test` after each step.

## 1. Shared foundations

These changes touch types that every later section uses. Make them first.

### 1.1 `SealedItem` (`M/Inventory.swift` L561-597)

Add five optional fields after `contents` (L584). Every field is Optional, so the synthesized decoder uses `decodeIfPresent`, and an old save decodes with `nil`.

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

**Save rule.** `GameData.init(from:)` (`M/GameStore.swift` L145) decodes `sealed` with `try?`. One bad `SealedItem` drops the whole array. So every new field must be Optional. Do not add a non-optional field with a default to `SealedItem`.

The report asked for "a buyer name to `SealedItem`" (5.1). This plan keeps the buyer in `RipShipOrder` instead, and the item status points to the order (1.2). One place holds the buyer, so the two cannot disagree.

### 1.2 `ItemStatus` (`M/Inventory.swift` L388-424)

Add one case after `atAuctionHouse` (L403):

```swift
    /// A viewer bought this product on a Rip & Ship stream. The player must open it on that stream (Model/RipShip.swift).
    case soldToViewer(orderID: UUID)
```

Add it to `tag` (L411-423):

```swift
        case .soldToViewer: "SOLD · RIP ON STREAM"
```

The compiler lists every other exhaustive `switch` over `ItemStatus`. Today that is `Inventory/DetailViews.swift` L40-60 (add a row: "Sold to a viewer. Open it on the stream."). `advanceSealed` (`M/GameStore.swift` L1250) has `default: break`, so it needs no change. An old save has no such status, so decoding is safe.

### 1.3 `GameData` (`M/GameStore.swift` L4-141)

Add after `shorts` (L140), next to Part C's `hiddenActs` and `callouts`:

```swift
    /// The gray plug (Model/Plug.swift).
    var plug = PlugState()
    /// Rip & Ship orders and the Whatnot ban (Model/RipShip.swift).
    var ripShip = RipShipState()
```

Add to `init(from:)` after `shorts = v(.shorts, shorts)` (L233):

```swift
        plug = v(.plug, plug)
        ripShip = v(.ripShip, ripShip)
```

An old save has no keys, so both take their defaults.

### 1.4 `LedgerEntry.Category` (`M/Inventory.swift` L625-635)

Add one case:

```swift
        case grayMarket = "Gray market"
```

Do not add it to `Balance.taxableCategories` (`M/Taxes.swift` L47-50). A plug order has no invoice, so the income tax step must not count it as a cost (4.8). Old saves have no such entry.

### 1.5 `FakeSource` (`M/Counterfeits.swift` L26-55)

Add `case plug` and its rate:

```swift
    /// The gray plug (Model/Plug.swift).
    case plug
    ...
        case .plug: Balance.fakeRatePlug
```

`FakeSource` is not `Codable`, so there is no save change.

### 1.6 `ContactKind` (`M/Relationships.swift` L5-41)

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
    /// A supplier line, not a person at a show or a meet. It never goes in the contact book.
    var isSupplier: Bool { self == .distributorRep || self == .plug }
```

Then exclude suppliers from people logic:

| Place | Change |
|---|---|
| `attendingRegulars` (L586-594) | Add `!c.kind.isSupplier` to the filter. Else the rep walks up to the show table. |
| `knownContacts` (L245-248) | Add `!$0.kind.isSupplier`. |
| `canRegister` (L252-254) | Return false for a supplier. |
| `addPoints` (L294-322) | No change. Create supplier contacts with `rewardedLevel = 4`, so a supplier never gives reputation. |
| Decay loop in `relationshipsEndDay` (L563-569) | No change. A quiet rep loses a point a week after 8 weeks, which is correct. `recordWholesale` sets `lastDealDay`. |

`ContactKind` is a `String` raw value enum. An old save has no new raw values, so it decodes.

### 1.7 One choke point for market value

`realMarket(of:)` (`M/Counterfeits.swift` L236-239) is the only place that turns a `SealedItem` into a market price. Inventory value, insurance claims, stream items, shelf items, vending prices, and listings all call it. The case price goes there (2.3), so every system sees the case price with no other change.

## 2. A case is a product with its own price (3.1 to 3.7)

### 2.1 Proposal 3.1: correct the case counts

**File `M/Wholesale.swift` L45.** Replace the line:

```swift
    /// Units in one distributor case, by product kind (research_notes/Sealed product and flipper play/cases.md, section 1).
    /// "Booster pack" is the 144-pack sleeved booster case. `caseSize(for:)` applies the name rules first.
    static let caseSizes: [String: Int] = ["Booster box": 6, "Elite Trainer Box": 10, "Booster bundle": 25, "Booster pack": 144,
                                           "Blister": 24, "Build & Battle": 10, "Collection": 6, "Tin": 6]
```

**File `M/Cases.swift` (new).** Add the name rules and the function:

```swift
extension Balance {
    /// Name rules that come before the kind. The first match wins.
    static let caseSizeByName: [(String, Int)] = [
        ("Pokemon Center Elite Trainer Box", 4), ("Pokémon Center Elite Trainer Box", 4),
        ("Ultra-Premium", 4), ("Ultra Premium", 4), ("Mini Tin", 10), ("Tech Sticker", 12), ("Knock Out", 24),
    ]
    /// The kinds that the distributor and the plug sell by the case. Keep it equal to the old four kinds, so the
    /// seeded weekly offers stay the same for each week.
    static let wholesaleKinds: Set<String> = ["Booster box", "Elite Trainer Box", "Booster bundle", "Booster pack"]

    /// Units in one case of the product. Nil: the product has no case (kind "Other").
    static func caseSize(for p: Product) -> Int? {
        if p.kind == "Blister" { return p.packs <= 1 ? 16 : 24 }   // checklane display 16, 2-pack and 3-pack case 24
        if let rule = caseSizeByName.first(where: { p.name.contains($0.0) }) { return rule.1 }
        return caseSizes[p.kind]
    }
}
```

`CaseMath.units(_:)` (2.3) uses a real `cases.json` unit count first, then `caseSize(for:)`.

**Call sites that change:**

| Site | Old | New |
|---|---|---|
| `wholesaleOffers` filter (`M/Wholesale.swift` L68-70) | `Balance.caseSizes[$0.kind] != nil` | `Balance.wholesaleKinds.contains($0.kind)`. The old dictionary had exactly these four keys, so the options list and the seeded picks stay the same. |
| `wholesaleOffers` size (L75) | `Balance.caseSizes[p.kind] ?? 6` | `CaseMath.units(p) ?? 6` |
| `splitsEndDay` (L172) and `testSplitInvite` (L193) | `Balance.caseSizes[p.kind] ?? 6` | No change. Splits use only booster boxes (6) and ETBs (10), and those counts do not change. |

**Effect on play.** A bundle case now costs about twice as much (25 units, not 12). A pack case is 144 packs, not 36. A no-store player still has 2 cases a week, so the bundle case becomes a large order. This is the real count.

### 2.2 Real case prices: `tools/export/cases.py` and `Resources/cases.json`

The catalog has no case SKUs today. `catalog.py` (`tools/export/catalog.py` L436) drops kind "Case or display", and `sealed_contents.json` has no case rows. The tcgcsv cache at `tools/cardlist/cache/tcgcsv/<group>-products.json` and `<group>-prices.json` holds 294 case SKUs (counted on 2026-11-20).

**New script `tools/export/cases.py`.** Steps:

1. Read `app/PokeVendor/Resources/catalog.json` (unit products) and `tools/ppt/cache/sealed_contents.json` (it gives each unit its tcgcsv `group`).
2. For each tcgcsv group, read products and prices. Keep a product whose name matches `^(?P<base>.+?)\s+(?P<sku>Booster Box Case|Elite Trainer Box Case|Pokemon Center Elite Trainer Box Case|Booster Bundle Case|Booster Bundle Display|Sleeved Booster Case|3-Pack Blister Case|Build & Battle Box Display|Mini Tin Display|Mini Tin Display Case|Tin Case|Ultra-Premium Collection Case|Collection Case)$`. Skip names with "Code Card" or "(International Version)".
3. Units come from the SKU: `{"Booster Box Case": 6, "Elite Trainer Box Case": 10, "Pokemon Center Elite Trainer Box Case": 4, "Booster Bundle Case": 25, "Booster Bundle Display": 10, "Sleeved Booster Case": 144, "3-Pack Blister Case": 24, "Build & Battle Box Display": 10, "Mini Tin Display": 10, "Mini Tin Display Case": 40, "Tin Case": 6, "Ultra-Premium Collection Case": 4, "Collection Case": 6}`.
4. Match the case to a unit product of the same group: the unit name equals `base` plus the unit word ("Elite Trainer Box", "Booster Box", and so on), after the same `norm()` that `catalog.py` uses (L325).
5. Keep only a case whose units equal the game's case size for that unit (`caseSize(for:)` rules, copied as a Python table). This drops a 40-tin display case when the game counts 10 tins.
6. Use `marketPrice`. Drop a row when `market / (units × unit market)` is outside 0.6 to 2.0. Print each dropped row. A ratio outside that range is a wrong match, not a real price.
7. Write `Resources/cases.json` as a list: `{"product": "<unit id>", "case": "<case id>", "units": 10, "market": 1218.56}`. Sort by unit id.

Run it after `catalog.py` in the price refresh. AJ's memory entry `project_price_refresh.md` lists the export order. The main thread must tell AJ to add this step there. Part B does not edit that entry.

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

This file is not fatal when it is missing. The game falls back to the factor table.

### 2.3 Proposals 3.2 and 3.3: the case item and its price

**File `M/Cases.swift`.**

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

@MainActor
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

`PriceCycle.today` is `private(set) static var` (`M/PriceCycle.swift` L162). It is readable. `PriceCycle.printDays` and `defaultInPrint` are in `M/PrintRuns.swift` L65 and L97.

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
    @discardableResult
    func openCase(_ id: UUID, status: ItemStatus? = nil, save saves: Bool = true) -> [UUID] {
        guard let i = data.sealed.firstIndex(where: { $0.id == id }), let units = data.sealed[i].caseUnits,
              let product = SetLibrary.product(data.sealed[i].productID) else { return [] }
        // A listed, arriving, or consigned case stays closed. Hand, back room, and a Rip & Ship order can open.
        switch data.sealed[i].status {
        case nil, .inStore, .soldToViewer: break
        default: return []
        }
        let box = data.sealed.remove(at: i)
        let each = (box.paid / Double(units) * 100).rounded(.down) / 100
        var ids: [UUID] = []
        for k in 0..<units {
            let paid = k == units - 1 ? box.paid - each * Double(units - 1) : each
            var unit = SealedItem(setSlug: product.homeSlug, name: product.name, packs: product.packs, paid: paid,
                                  acquired: box.acquired, source: "Case · \(box.source)", productID: product.id,
                                  status: status ?? box.statusForUnits, acquiredDay: box.acquiredDay)
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

`box.statusForUnits` is a small helper on `SealedItem`: `.soldToViewer` stays `.soldToViewer` (the units belong to the same order). `.inStore` becomes nil, because a back-room case opens into hand unless the back room restock passes `.inStore` (2.7). Everything else becomes nil.

**Exclusivity note.** `openCase` builds each unit in a local and appends it. It reads `data.sealed[i]` only before it removes the case. No closure reads `data`. Keep it that way.

**Why `packs` is the whole case.** `paidPerPack`, the stream rip minutes, and the carry space all read `packs`. The whole-case count is the true count for each of them.

**Rip guard.** A case must open before a rip. `packSlugs(of:)` (`M/GameStore.swift` L609) would treat a case as N × packs packs of its home set, with no promos and no assorted packs. Block it:

| Site | Change |
|---|---|
| `AppNav.startRip` (`App/AppNav.swift` L76) | `let items = items.filter { !$0.isCase }` before the guard. |
| `RipModel.init` (`M/RipModel.swift` L118) | Skip a case item in the queue builder: `items.filter { !$0.isCase }.flatMap { ... }`. This is a second guard, so no path can rip a closed case. |
| Inventory "Rip" buttons | Hide "Rip" for a case. Show "Open the case" (2.5). |
| `StreamPickSheet` rip list (`Stream/StreamView.swift` L254-256) | `session.items.filter { $0.sealed && !$0.isCase }`. `StreamItem` gets `var isCase = false`. |
| `vendableSealed` (`M/Vending.swift` L235) | Add `$0.caseUnits == nil`. A machine sells units, not cases. |

### 2.4 Proposal 3.4: "case fresh"

A case from the distributor or a case split carries zero fake risk today ([D/14 L35-38](/Users/ajholloway/personal/PokeVendor/docs/14-counterfeit-risk.md)). Keep that zero for every unit, and tag it.

| Source | `caseFresh` |
|---|---|
| Distributor case (`buyWholesale`) | true on the case. `openCase` copies it to each unit. |
| Short-shipped distributor units (loose) | true. The distributor broke the case. No one searched the boxes. |
| Case split box (`joinSplit`, `M/Wholesale.swift` L136-141) | true. Set `item.caseFresh = true` on each box. |
| Plug case | nil. The plug is not a trusted source. |
| Stranger case (show, eBay, Facebook) | nil. The seller can say "case fresh" in the listing text. The game gives no tag. |

**Sale bonus (design value, `Balance.caseFreshSaleBonus = 1.05`).**

- Online: `rollSale(_:market:sealed:slab:name:)` (`M/GameStore.swift` L1432) gets a new last parameter `bonus: Double = 1`. Multiply `reach` by it. In `advanceSealed` (L1237), pass `bonus: item.isCaseFresh ? Balance.caseFreshSaleBonus : 1`.
- Own store: `StoreShelfItem` (`M/CardStore.swift` L566) gets `var caseFresh = false`. `pickForCustomer` (L595) multiplies the weight by `Balance.caseFreshSaleBonus` when it is true.
- The tag changes no price. No data shows a price premium.

**UI.** Every sealed row and the sealed detail show a small cyan `Tag(text: "CASE FRESH")` when `isCaseFresh`.

### 2.5 The case opening flow (UI)

This flow needs care. It must feel physical, and it must never flash the screen.

**Entry points.**

1. `SealedDetailView` (`Inventory/DetailViews.swift` L417). For a case in hand, show a primary button "Open the case" above "Where it came from" (L93 of the view body). Under it, one line: "You get 10 sealed Elite Trainer Boxes at $35.00 each. The case trades at $735.94. The 10 boxes trade at $714.00. Opening ends the case premium." Show the numbers from `realMarket(of:)` and `product.market × units`. When the case sells below its units (a factor under 1), the line says "Opening adds $X of value".
2. The Sealed tab of `InventoryView`. A case row shows `Tag(text: "CASE ×10")` and the case price. A context menu item "Open the case" opens the same sheet. When the player holds 2 or more cases, the tab toolbar shows "Open all cases". That button opens each case with `save: false`, then calls `save()` once, and shows the summary for all of them.
3. The stream (5.7). A whole-case Rip & Ship opens the case on camera with the same sheet, in "for a buyer" mode.

**New view `Inventory/CaseOpenSheet.swift`: `CaseOpenSheet`.** Inputs: `caseID: UUID`, `forBuyer: String?`, `onDone: ([UUID]) -> Void`. It presents as a sheet with `.presentationDetents([.large])`.

| Step | What the player sees | How it works |
|---|---|---|
| 1. The carton | A brown carton (a `RoundedRectangle` filled `Color(red: 0.55, green: 0.42, blue: 0.28)`), a tan tape stripe across the top, and a white label card (`Theme.surface`, not bright white) with the product name, "QTY 10", and a code like "PKU-10438" (a stable hash of the product ID). A resealed case that the player already flagged shows the orange `Tag(text: "RESEALED")`. | Static layout. |
| 2. Cut the tape | Text: "Drag along the tape to cut it." A thin cyan line follows the finger along the tape. A small box-cutter SF Symbol (`scissors`) rides at the finger. | A `DragGesture` sets `cutProgress` from 0 to 1 along the tape. At 0.9 or more, the cut completes. A tap on "Cut" skips the drag. Reuse the tear tick sound (`SoundFX`) every 10%. |
| 3. Flaps open | The two top flaps rotate open (`rotation3DEffect` around the hinge, 0.45 s, ease out). A soft dark shadow shows inside. | No light, no flash. |
| 4. Units rise | The units rise out one at a time (stagger 0.08 s) into a grid of `ProductImage` tiles (3 columns). Each tile lands with a thin cyan ring that grows and fades (`Circle().stroke(Theme.cyan.opacity(0.6))`, scale 0.8 to 1.3, opacity 1 to 0, 0.6 s). Case-fresh units show the `CASE FRESH` tag. | `withAnimation(.spring(response: 0.4, dampingFraction: 0.8))`. When Reduce Motion is on, skip steps 2 to 4 and show the grid at once. |
| 5. Summary | "10 Elite Trainer Boxes · $35.00 each · now in Sealed." For a store with a back room: "The case was in the back room. The units are in hand." | Buttons: "Done", "Rip one now" (calls `nav.startRip([firstUnit])`), "Put on the shelf" (only with a store; calls `stockStore`). |

**Reseal hint at opening.** When the case is fake and not yet known, run `Counterfeit.eyeballCatches(tier, id: caseID)` (`M/Counterfeits.swift` L170). When it catches, step 3 shows an orange banner in the `ResealedBanner` style (`Rip/ResealedBanner.swift`): "The factory tape was cut before. These boxes may be resealed." with a button "Mark them as resealed" (`markFakeKnown(sealedID:)` for each unit). The banner slides in from the top. It never flashes.

**Rules for the animation.** Never use a full-screen white or bright flash. Use rings and glows near the tiles only. Keep every color at or below `Theme.surface` brightness for large areas.

### 2.6 Proposal 3.5: cases from strangers, with reseal risk

**A. Show sealed dealer (`M/Vendors.swift` L339-340).** `VendorItem` (L190) gets `var caseUnits: Int?`. `VendorItem` is not `Codable`, so no save change. In the `.sealedDealer` branch, after `add(12...18)`:

```swift
        case .sealedDealer:
            add(12...18) { sealed(from: sealedPool(vintage: 0.3, older: 0.35), kind: kind) }
            // One case 20% of the time (docs/12, Cases). A stranger's case can be resealed.
            if Double.random(in: 0..<1) < Balance.dealerCaseChance,
               let p = SetLibrary.catalog.filter({ Balance.wholesaleKinds.contains($0.kind) && Balance.modernSets.contains($0.homeSlug) && !$0.isStoreExclusive }).randomElement(),
               let units = CaseMath.units(p) {
                let market = CaseMath.market(p, units: units)
                var item = VendorItem(goods: .sealed(p), price: Market.retail(market * Double.random(in: kind.priceRange)), market: market)
                item.caseUnits = units
                item.fake = Counterfeit.roll(source: .stranger, sealed: true, slug: p.homeSlug, market: market, msrp: (p.msrp ?? 0) * Double(units))
                items.append(item)
            }
```

The `seen` filter after the switch (L347-350) drops a second item of one product. Make its key `"\(id)-\(item.caseUnits ?? 1)"`, so a case and a unit of one product can both show. `VendorItem.name` returns `CaseMath.name(p, units:)` when `caseUnits` is set.

Buying it: the two show buy sites that build a `SealedItem` (`M/Shows.swift` L232 and L310) check `item.caseUnits`. When it is set, they call `makeCase(product, units:, paid:, source: "Bought at \(show.name)", status: nil, fake: item.fake, caseFresh: false)`.

**B. eBay and Facebook (`M/Market.swift` L76-170).** `StoreOffer` (L4) gets `var caseUnits: Int?`. `title` (L26) returns `CaseMath.name(p, units:)` for a case. `market` (L40) returns `CaseMath.market(p, units:)` for a case.

After the `switch store` in `offers(for:day:)` (before `return out`, L170), add one case listing on about 1 day in 10. Use its own seeded generator, so every other listing of the day stays the same:

```swift
        if store == .ebay || store == .facebook, let offer = caseOffer(for: store, day: day) { out.append(offer) }
```

```swift
    /// A stranger's case on about 1 day in 10 (docs/12, Cases). Its own seed keeps the day's other listings the same.
    private static func caseOffer(for store: Storefront, day: Int) -> StoreOffer? {
        let salt: UInt64 = store == .ebay ? 31 : 37
        var r = SeededRandom(seed: UInt64(day + 1) &* 15_485_863 &+ salt)
        guard r.double(0...1) < Balance.onlineCaseListingChance else { return nil }
        let pool = SetLibrary.catalog.filter { Balance.wholesaleKinds.contains($0.kind) && !$0.isStoreExclusive && CaseMath.units($0) != nil }
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
                               note: r.double(0...1) < Balance.caseRumorChance ? "Seller says: \"case fresh, and this case is loaded\"" : "Seller says: \"case fresh, never searched\"")
        offer.caseUnits = units
        offer.fake = Counterfeit.roll(source: source, sealed: true, slug: p.homeSlug, market: market, msrp: (p.msrp ?? 0) * Double(units), &r)
        return offer
    }
```

The fake roll uses the existing rates: eBay 8% × 0.5 sealed = 4%, Facebook 10% × 0.5 = 5%, and × 1.5 when the case trades over 2 × its MSRP. Pass the case MSRP, so the hype factor compares like with like.

Buying it: `buy(_:)` (`M/GameStore.swift` L719-753), `case .product`. When `offer.caseUnits` is set, append `makeCase(product, units:, paid: total, source: "Bought on \(offer.store.rawValue)", status: status, fake: offer.fake, caseFresh: false)` instead of the unit item. A Facebook pickup case on a later day goes through `buyLaterPickup` (L723). That path builds the item later in `M/Meetups.swift` L181. Carry `caseUnits` in the pickup record the same way.

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

- On a listing: `BuyViews.swift` offer row. For `offer.caseUnits != nil`, show a bordered button "Check the tape and label". It sets a local `@State checked: Set<String>`. When `caseCheckCatches(offer.fake, key: offer.id)`, the row shows the orange tell. Else it shows "The tape and label look right. A check is never proof." The listing is seeded by day, so a second look gives the same result. No save state is needed.
- On an owned case: `SealedDetailView` shows the same button for a case with `caseFresh == nil` and `caseChecked != true`. `checkCase(_ id:)` sets `caseChecked = true` and uses `key: id.uuidString`. A caught tell offers "Mark it as resealed" (`markFakeKnown(sealedID:)`).

Expected effect: a player who skips flagged listings meets about half as many fakes. That is the "halves the chance" rule.

### 2.7 Proposal 3.6: case space and the back room

**Carry space (`M/Packing.swift` L113-116).** `ShowItem` (`M/Shows.swift` L503) gets `var isCase = false`. The `ShowItem` builder for sealed items sets it from `item.isCase`. Then:

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

The report said "an ETB case uses 10, so the cart carries 3 ETB cases". The game already counts a loose ETB as 3 spaces and a booster box as 7, so "1 space per unit" would make a case smaller than one loose box of it. This plan keeps the existing pack rule and gives the case a tighter divisor. An ETB case then takes 13 spaces, and the cart carries 2. See the question at the end of this file.

**Own store shelf.** A case never goes on the customer shelf. The shelf shows only units (3.6).

| Site | Change |
|---|---|
| `storeSealedSlots` count (`M/CardStore.swift` L354) | `stock.sealed.filter { !$0.isCase }.count` |
| Shelf items for customers (L587-590) | `stock.sealed.filter { !$0.isCase }` |
| `stockStore` (L350-370) | Split the picked sealed IDs into units and cases. Units use the shelf room. Cases need the back room fixture and back room room (`Balance.backRoomCases - casesInStore`). |
| `stockable` (L201-204) | No change. A case is stockable when the back room exists. |

**New fixture.** `StoreFixture` (`M/CardStore.swift` L43) gets `case backRoom`:

```swift
        case .backRoom: "Back room"
        ...
        case .backRoom: "Holds up to \(Balance.backRoomCases) sealed cases off the shelf. When a product runs low on the shelf, the store opens a case of it and restocks."
        ...
        case .backRoom: "shippingbox.fill"
```

Add `.backRoom: 600` to `fixtureCosts` (L162). `StoreFixture` is a `String` raw value enum, so old saves decode.

**Back room restock (End Day, after `advanceSealed`).** In `M/Cases.swift`:

```swift
    /// The store opens a back-room case when its product runs low on the shelf (docs/22-own-store.md, Back room).
    func backRoomRestock() -> [String] {
        guard storeIsBuilt, data.cardStore?.has(.backRoom) == true else { return [] }
        // Read everything into locals first. `openCase` mutates `data.sealed`.
        let stock = storeStock.sealed
        var room = storeSealedSlots - stock.filter { !$0.isCase }.count
        let cases = stock.filter(\.isCase).map { (id: $0.id, product: $0.productID, units: $0.caseUnits ?? 0, name: $0.name) }
        var lines: [String] = []
        let today = data.day
        for c in cases where c.units <= room {
            let onShelf = stock.filter { !$0.isCase && $0.productID == c.product }.count
            guard onShelf <= Balance.backRoomRestockAt else { continue }
            let ids = openCase(c.id, status: .inStore(since: today), save: false)
            guard !ids.isEmpty else { continue }
            room -= ids.count
            lines.append("The store opened the \(c.name) from the back room and put \(ids.count) on the shelf.")
        }
        return lines
    }
```

**Exclusivity note.** The loop iterates a local array, and `openCase` runs outside any closure on `data`. Do not write `data.sealed.filter { ... }.forEach { openCase($0.id) }` with a closure that reads `data`.

### 2.8 Proposal 3.7: every pack stays an independent draw

No code reads `caseUnits`, `caseFresh`, or `grayOrder` when it builds a pack. Add a comment at `RipModel.buildCards` (`M/RipModel.swift` L293):

```swift
    // Every pack is an independent draw from its set's pull rates. A case, a case-fresh tag, or a "loaded" rumor never
    // changes the draw (docs/12-acquiring-product.md, Cases; docs/18-ripping.md).
```

The "loaded case" text lives only in a stranger listing note (2.6 B, 10%). It is never true. There is no market news kind for it, so Part A's market code does not change.

### 2.9 Distributor delivery as cases

`buyWholesale` (`M/Wholesale.swift` L85-113) delivers case items now. Section 3.4 gives the full function, with the fill roll. The delivery part:

```swift
        let shippedUnits = short ? max(1, Int(Double(filled * offer.caseSize) * Double.random(in: Balance.wholesaleShortShare))) : filled * offer.caseSize
        let fullCases = shippedUnits / offer.caseSize
        let looseUnits = shippedUnits % offer.caseSize
        let arriving = ItemStatus.arriving(daysLeft: Balance.wholesaleDeliveryDays, from: "the distributor")
        var newIDs: [(UUID, Int)] = []
        for _ in 0..<fullCases {
            let c = makeCase(offer.product, units: offer.caseSize, paid: offer.casePrice, source: "Wholesale", status: arriving, caseFresh: true)
            newIDs.append((c.id, offer.caseSize))
            data.sealed.append(c)
        }
        for _ in 0..<looseUnits {
            var u = SealedItem(setSlug: offer.product.homeSlug, name: offer.product.name, packs: offer.product.packs, paid: offer.unitPrice,
                               acquired: .now, source: "Wholesale", productID: offer.product.id, status: arriving, acquiredDay: data.day)
            u.caseFresh = true
            newIDs.append((u.id, 1))
            data.sealed.append(u)
        }
```

The refund for a short shipment stays `unitPrice × (ordered units − shipped units)`. `advanceSealed` (L1216-1258) already groups arrival lines by name. The line reads "Arrived from the distributor: Delta Reign Elite Trainer Box · Case of 10 ×2."

**Migration.** Wholesale boxes that are already on their way in an old save arrive as loose units, as before. No conversion runs.

`WholesaleOffer` (L6-13) gets `let caseMarket: Double`. `wholesaleOffers` fills it with `CaseMath.market(p, units: size)`. The row in `WholesaleView` shows "Case of 10 · $35.00 each · case mkt $735.94".

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
    /// Hot cases that the account delivered, until the 21-day check.
    var hotRecords: [HotAllocationRecord] = []
    /// The days of back-door warnings, and the penalties.
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
        warnings = v(.warnings, [])
        hotFrozenUntil = v(.hotFrozenUntil, nil)
        closedUntil = v(.closedUntil, nil)
    }
}

/// One hot case or unit from the hobby account, until its 21-day check (4.6).
struct HotAllocationRecord: Codable, Hashable {
    enum Outcome: String, Codable { case shelf, opened, elsewhere }
    let itemID: UUID
    let units: Int
    /// The day the case arrives. The window starts here.
    let deliveredDay: Int
    var outcome: Outcome?
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

After `seedContacts()` (L286), call `ensureRepContact()` (3.4). It creates the rep for a grandfathered account. A store that is still in its build-out on load applies the normal way.

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
        distributorRequirements.allSatisfy(\.met) && data.distributor.appliedDay == nil && data.distributor.approvedDay == nil
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

The decision runs in `distributorEndDay` (3.8). The rule: on the decision day, approve when the store is built and the permit holds. Else the application lapses with a line. When the store closes (`closeStore`, `M/CardStore.swift` L249), `distributorEndDay` clears `appliedDay` and `approvedDay`.

**Effect.** A new store waits 14 days after its build-out for the 58% price and the allocation. It buys at secondary terms (72%, $250 minimum, 2 cases a week) during the wait. AJ approved this delay.

### 3.4 Proposal 4.3: the distributor rep

**Rep contact, in `M/Distributor.swift`:**

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
        guard let id = a.repContactID else { return }
        let week = data.day / 7
        if a.repPointsWeek != week { a.repPointsWeek = week; a.repPointsThisWeek = 0 }
        a.repSpendCarry += amount
        let steps = Int(a.repSpendCarry / Balance.repSpendStep)
        a.repSpendCarry -= Double(steps) * Balance.repSpendStep
        let earned = max(0, min(steps, Balance.repPointsPerWeek - a.repPointsThisWeek))
        a.repPointsThisWeek += earned
        data.distributor = a          // write the account back before the next call on `data`
        if earned > 0 { addPoints(id, earned) }
    }

    /// "Push for more allocation" (4.3). Costs 5 rep points. One product gets a better fill this week.
    func pushForAllocation(_ productID: String) -> String? {
        var a = data.distributor
        guard hasStoreAccount, let id = a.repContactID else { return "You need a hobby distributor account." }
        guard data.day - a.lastPushDay >= Balance.pushCooldownDays else { return "You pushed recently. Wait until day \(a.lastPushDay + Balance.pushCooldownDays + 1)." }
        a.pushProductID = productID
        a.pushWeek = data.day / 7
        a.lastPushDay = data.day
        data.distributor = a
        addPoints(id, -Balance.pushCost)
        log("You pushed your rep for more allocation. It cost goodwill.")
        save()
        return nil
    }
```

**Pattern note (exclusivity).** Each function copies `data.distributor` into a local, changes the local, and writes it back. Only then does it call `addPoints`, which writes `data.contacts`. No closure reads `data`.

**Event credit (weekly, in `distributorEndDay` on Monday):**

```swift
    private func weeklyRepCredit() -> [String] {
        guard hasStoreAccount, let id = data.distributor.repContactID, let s = data.cardStore, s.has(.playTables) else { return [] }
        let week = data.day / 7
        // An event ran last week when its afterglow day is in the last 7 days (Model/StoreEvents.swift).
        guard let ev = s.events, ev.afterglowDay >= data.day - 7, data.distributor.eventWeekCredited != week else { return [] }
        data.distributor.eventWeekCredited = week
        addPoints(id, Balance.repEventPoints)
        return []
    }
```

`recordWholesale` (`M/WholesaleAccount.swift` L61-70) gains two lines after `data.distributor = account`:

```swift
        creditRepSpend(total)
        if let id = data.distributor.repContactID, let i = data.contacts.firstIndex(where: { $0.id == id }) { data.contacts[i].lastDealDay = data.day }
```

Write the second line as: `let today = data.day` first, then `data.contacts[i].lastDealDay = today`. The right side of an assignment reads before the write, but the local makes the rule obvious.

### 3.5 Proposal 4.4: the fill rate for hot product, and 4.5: Elite priority

**`M/Distributor.swift`:**

```swift
extension Balance {
    static let fillBase = 0.15
    static let fillPressureWeight = 0.35
    static let fillRepWeight = 0.20
    static let fillMax = 0.90
}

    /// The chance that one requested hot case arrives (4.4). The secondary wholesaler has no rep, so its rep term is 0.
    /// Reads Part A's `data.flipperPressure` (0.1 to 0.9).
    func hotFillRate(_ product: Product) -> Double {
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
| 0.9 | 0 | 0.29 |
| 0.9 | 20 (new account) | 0.33 |
| 0.5 | 50 | 0.43 |
| 0.3 | 80 | 0.56 |
| 0.1 | 100 | 0.62 |

The report gave "near 10% to 15% at high pressure and a new account". The formula gives 0.29 to 0.33 there, because `fillBase` alone is 0.15 and pressure tops out at 0.9, not 1.0. To reach the real Prismatic low, change `fillBase` to 0.05. The table in section 6 marks this as a tuning value. This plan keeps the report's formula.

**Elite cap.** `wholesaleCap` (`M/WholesaleAccount.swift` L44-47) and the secondary branch of `wholesaleLeft` (L53-56) add the Elite case for a hot product:

```swift
    func wholesaleCap(_ product: Product) -> Int {
        let grown = min(Balance.allocationMax, Balance.allocationBase + Int(data.distributor.spent / Balance.allocationStep))
        let hot = isHot(product)
        return grown + (hot ? 0 : 1) + (hot && eliteCaseOpen ? 1 : 0)
    }
    ...
        guard hasStoreAccount else {
            let elite = isHot(offer.product) && eliteCaseOpen ? 1 : 0
            let week = account.week == data.day / 7 ? account.cases.values.reduce(0, +) : 0
            return max(0, min(1 + elite - bought, Balance.wholesaleCasesPerWeek + elite - week))
        }
```

When `hotFrozen` is true, `wholesaleLeft` returns 0 for a hot product on the hobby account.

**`buyWholesale` (`M/Wholesale.swift` L83-113), full replacement:**

```swift
    /// Buys cases. The secondary wholesaler has a $250 minimum order. A hobby account has no minimum, but it can buy only
    /// its weekly allocation. Hot product fills only part of the request (4.4). The order arrives in 5 days as cases.
    func buyWholesale(_ offer: WholesaleOffer, cases: Int) -> String? {
        guard cases > 0 else { return nil }
        if let left = wholesaleLeft(offer), cases > left {
            return left == 0 ? "Your allocation of this product is used up this week." : "Your allocation has \(left) more case\(left == 1 ? "" : "s") of this product this week."
        }
        let requested = offer.casePrice * Double(cases)
        guard requested >= wholesaleMinOrderNow else { return "The minimum order is \(money(Balance.wholesaleMinOrder))." }
        guard canAfford(requested) else { return "You need \(money(requested)). You have \(money(cash))." }
        // The fill roll. Read every value into locals first.
        let hot = isHot(offer.product)
        let fill = hotFillRate(offer.product)
        var filled = cases
        var usedElite = false
        if hot {
            filled = 0
            var rolls = cases
            if eliteCaseOpen { filled = 1; rolls -= 1; usedElite = true }
            for _ in 0..<rolls where Double.random(in: 0..<1) < fill { filled += 1 }
        }
        if usedElite { data.distributor.eliteCaseWeek = data.day / 7 }
        // The request uses the allocation, even when it does not fill.
        recordWholesale(offer, cases: cases, total: 0)
        guard filled > 0 else {
            log("The distributor filled 0 of \(cases) case\(cases == 1 ? "" : "s") of \(offer.product.name). Hot product is short. Nothing was charged.")
            save()
            return "Hot product is short. The distributor filled 0 of \(cases). Nothing was charged."
        }
        let total = offer.casePrice * Double(filled)
        addLedger(-total, .wholesale, "\(filled) case\(filled == 1 ? "" : "s") of \(offer.product.name) · Distributor")
        data.distributor.spent += total
        creditRepSpend(total)
        // ... the short shipment and the case delivery of section 2.9 ...
        // Hot cases on the hobby account go into the 21-day check (4.6).
        if hot, hasStoreAccount {
            let delivered = data.day + Balance.wholesaleDeliveryDays
            data.distributor.hotRecords += newIDs.map { HotAllocationRecord(itemID: $0.0, units: $0.1, deliveredDay: delivered) }
        }
        let fillText = filled < cases ? " The distributor filled \(filled) of \(cases)." : ""
        log("Ordered \(filled) case\(filled == 1 ? "" : "s") of \(offer.product.name) from the distributor for \(money(total)).\(fillText) It arrives in \(Balance.wholesaleDeliveryDays) days.", cash: -total)
        save()
        return filled < cases ? "Hot product is short. The distributor filled \(filled) of \(cases) and charged only for those." : nil
    }
```

Split `recordWholesale` so that the spend and the case count can be recorded apart, or pass `total: 0` as above and add `spent` in place. Either way, `spent` must grow only by the filled total.

**Exclusivity note.** `data.distributor.hotRecords += newIDs.map { ... }` is safe. The closure reads `newIDs` and the local `delivered`, not `data`. Do not write `deliveredDay: data.day + 5` inside that closure. That reads `data` inside a closure while `data.distributor` is open for writing, and it crashes with "Fatal access conflict".

A product that is not hot keeps the full request and the existing +1 case.

### 3.6 Proposal 4.6: back-door sales of hot allocation

**Tracking points.** Three hooks set a record's `outcome`. A fourth reads the item's state at the check.

| Hook | File | Change |
|---|---|---|
| Sale from the own shelf | `sellFromStore` (`M/CardStore.swift` L607-624) | Pass `shelf: true` to `addReceipt`. |
| Any sale | `addReceipt` (`M/Sales.swift` L33-37) | New parameter `shelf: Bool = false`. Call `noteAllocationSold(ids, shelf: shelf)`. Every sale path already calls `addReceipt` with the item IDs (14 call sites). |
| The player opens the product | `openProduct` (`M/GameStore.swift` L632) and the first-pack branch of `commitPack` (L668) | Call `noteAllocationOpened(item.id)`. |
| A case opens into units | `openCase` (2.3) | `splitHotRecord(caseID:into:)` replaces the case record with one record per unit. |

```swift
    func noteAllocationSold(_ ids: [UUID], shelf: Bool) {
        guard !data.distributor.hotRecords.isEmpty else { return }
        let set = Set(ids)
        let outcome: HotAllocationRecord.Outcome = shelf ? .shelf : .elsewhere
        for i in data.distributor.hotRecords.indices where set.contains(data.distributor.hotRecords[i].itemID) && data.distributor.hotRecords[i].outcome == nil {
            data.distributor.hotRecords[i].outcome = outcome
        }
    }

    func noteAllocationOpened(_ id: UUID) {
        for i in data.distributor.hotRecords.indices where data.distributor.hotRecords[i].itemID == id && data.distributor.hotRecords[i].outcome == nil {
            data.distributor.hotRecords[i].outcome = .opened
        }
    }

    func splitHotRecord(caseID: UUID, into ids: [UUID]) {
        guard let i = data.distributor.hotRecords.firstIndex(where: { $0.itemID == caseID }) else { return }
        let r = data.distributor.hotRecords.remove(at: i)
        data.distributor.hotRecords += ids.map { HotAllocationRecord(itemID: $0, units: 1, deliveredDay: r.deliveredDay, outcome: r.outcome) }
    }
```

The `for i in indices where ...` loops read `data` in the `where` clause, not in a closure. That is safe. The `ids.map` closure reads only the local `r`.

**State at the check:**

```swift
    private enum AllocationState { case retail, other }

    /// Retail: sold from the shelf, on the shelf or in the back room, in a vending machine, or opened by the player.
    /// Other: sold on any other channel, or still held off the shelf. Nil: the item is gone with no sale (theft, a gift).
    private func allocationState(_ r: HotAllocationRecord) -> AllocationState? {
        switch r.outcome {
        case .shelf?, .opened?: return .retail
        case .elsewhere?: return .other
        case nil: break
        }
        if let item = data.sealed.first(where: { $0.id == r.itemID }) {
            return Self.isInStore(item.status) ? .retail : .other
        }
        if data.machines.contains(where: { $0.stock.contains { $0.item.id == r.itemID } }) { return .retail }
        return nil
    }
```

These closures only read `data`. They run outside any mutating call, so they are safe.

**The weekly check (Monday, in `distributorEndDay`):**

```swift
extension Balance {
    static let backDoorWindowDays = 21
    static let backDoorShelfShare = 0.40
    static let backDoorNoticeChance = 0.15
    /// Fewer hot units than this in one check give no verdict.
    static let backDoorMinUnits = 10
    static let backDoorRepCost = 15
    static let backDoorWarningWindowDays = 84
    static let hotFreezeDays = 28
    static let accountCloseDays = 84
}

    private func backDoorCheck() -> [String] {
        guard hasStoreAccount else { return [] }
        let today = data.day
        let due = data.distributor.hotRecords.filter { $0.deliveredDay + Balance.backDoorWindowDays <= today }
        guard !due.isEmpty else { return [] }
        var retail = 0, other = 0
        for r in due {
            switch allocationState(r) {
            case .retail?: retail += r.units
            case .other?: other += r.units
            case nil: break
            }
        }
        let dueIDs = Set(due.map(\.itemID))
        data.distributor.hotRecords.removeAll { dueIDs.contains($0.itemID) }    // the closure reads only a local
        let total = retail + other
        guard total >= Balance.backDoorMinUnits else { return [] }
        let share = Double(retail) / Double(total)
        guard share < Balance.backDoorShelfShare else { return [] }
        // The act is a secret even when the rep does not notice (Part C).
        recordHiddenAct(.backDoorAllocation, weight: max(0.6, min(1.5, 1.5 * (1 - share))),
                        note: "\(other) of \(total) hot units from the distributor did not reach your shelf.")
        guard Double.random(in: 0..<1) < Balance.backDoorNoticeChance else { return [] }
        return [backDoorWarning()]
    }

    private func backDoorWarning() -> String {
        var a = data.distributor
        let today = data.day
        let cutoff = today - Balance.backDoorWarningWindowDays
        a.warnings = a.warnings.filter { $0 >= cutoff } + [today]
        var line = "Your distributor rep noticed that your hot cases are not reaching your shelf. This is a warning."
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

**Exclusivity notes in this block.**

- `due` is computed with `filter { ... <= today }`, where `today` is a local. Do not write `data.day` inside that closure, even though `filter` is not mutating. The habit keeps the rule simple.
- `removeAll { dueIDs.contains($0.itemID) }` reads only a local.
- `backDoorWarning` builds the whole account in a local and writes it once.

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
            a.appliedDay = nil
            a.approvedDay = nil
            a.hotRecords = []
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
            lines += weeklyRepCredit()
            lines += backDoorCheck()
            lines += plugRepCheck()        // Model/Plug.swift (4.8)
        }
        return lines
    }
```

Every read of `data` happens before the one write of `data.distributor`. The calls after it do their own reads and writes in sequence.

### 3.9 Distributor UI (`Buy/WholesaleViews.swift` L5-66)

| Part of `WholesaleView` | Change |
|---|---|
| Title | `navigationTitle(store.distributorTier.name)` when the tier is not `.none`. Else "Distributor". |
| Header line (L14) | "72% of MSRP · secondary wholesaler · minimum $250 · 5-day delivery" or "58% of MSRP · hobby account · 5-day delivery". |
| New box "Hobby distributor account" (above "Your allocation") | Before the application: the three `distributorRequirements` rows with a check or a circle, then the button "Apply · decision in 14 days" (`applyToDistributor()`), enabled by `canApplyToDistributor`. During review: "Under review. The distributor decides on day N. Until then you buy at secondary terms." While closed: "Your account is closed until day N." While frozen: "No hot product until day N." |
| New box "Your rep" (hobby account only) | The rep name, a relationship bar (0 to 100, `ProgressView`), and "Hot fill about 43%" from `hotFillRate` of the first hot offer. One line: "Spend and store events raise the relationship. Back-door sales lower it." A menu button "Push for more allocation (−5)" that lists this week's hot offers and calls `pushForAllocation`. It is disabled during the cooldown, with the day shown. |
| Warnings | When `warnings` is not empty: an orange `Banner` "Warnings from your rep: 1 of 3 in 12 weeks." |
| Each offer row (L30-58) | Add "case mkt $X" to the price line. For a hot product: "hot · fill about N%". At Elite with the case open: a cyan line "Elite: 1 hot case this week skips the fill." After an order, the `message` banner shows the fill result. |
| Bottom | `PlugSection()` from `Buy/PlugViews.swift` when the plug is open (4.7). |

`ContactsView` (`Hub/ContactsView.swift`) gets a section "Suppliers" that lists contacts with `kind.isSupplier`. Each row shows the name, the kind, and the relationship. Suppliers never show "Add to book".

## 4. The gray plug charges for risk (4.7, 4.8)

### 4.1 Types (`M/Plug.swift`, new)

```swift
import Foundation

// The gray plug (docs/12-acquiring-product.md, The plug). A tier-2 seller with no invoice. It sells only full cases of
// hot in-print products that exist now, so it is not a preorder.

enum PlugOrderState: String, Codable { case waiting, delivered, vanished, seized }

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
    /// Rolled when the order goes in, so the UI can show the risk the player took.
    let vanishChance: Double
    var state: PlugOrderState = .waiting
    /// The items that arrived. A seizure removes the ones that are still in hand.
    var deliveredIDs: [UUID] = []
    var seizeDay: Int?
    /// The hidden act of this order (Part C), so a seizure can expose it.
    var actID: UUID?
}

struct PlugState: Codable, Hashable {
    var contactID: String?
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
        contactID = v(.contactID, nil)
        name = v(.name, nil)
        unlockedDay = v(.unlockedDay, nil)
        goneDay = v(.goneDay, nil)
        cleanOrders = v(.cleanOrders, 0)
        orders = v(.orders, [])
    }
}
```

The hand-written decoder follows the `GameData` pattern. A later field then cannot wipe the orders of an old save.

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
    static let plugMaxOrder = 20_000.0
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
    /// `Counterfeit.rate` halves a sealed rate, so 0.08 gives the report's 4% for each case.
    static let fakeRatePlug = 0.08
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
    var plugOffers: [WholesaleOffer] {
        guard plugOpen else { return [] }
        var r = SeededRandom(seed: UInt64(data.day / 7 + 1) &* 92_821 &+ 4_441)
        let pool = SetLibrary.catalog.filter {
            $0.isInPrint && Balance.wholesaleKinds.contains($0.kind) && $0.msrp != nil && !$0.isStoreExclusive && isHot($0)
        }
        var out: [WholesaleOffer] = []
        for i in 0..<Balance.plugOffersPerWeek where !pool.isEmpty {
            let p = pool[r.int(0...(pool.count - 1))]
            guard !out.contains(where: { $0.product.id == p.id }), let size = CaseMath.units(p) else { continue }
            let unit = Market.retail(max((p.msrp ?? p.market) * Balance.plugMsrpShare, p.market * Balance.plugMarketFloor))
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

The `isHot` filter uses `market >= 1.2 × MSRP`. The price rule `max(85% of MSRP, 65% of market)` then sits above the hobby price and below market.

**Flipper pressure (Part A).** The plug reads `data.flipperPressure` in one place: when pressure is 0.6 or more, `plugOffersPerWeek` stays 3. When it is under 0.3, the plug has 1 offer. Low pressure means the hot product is on shelves, and the gray channel dries up. Add `let count = data.flipperPressure < 0.3 ? 1 : Balance.plugOffersPerWeek` and loop to `count`.

### 4.3 Ordering (100% prepaid)

```swift
    /// Prepays a plug order from the cash balance. No invoice: the ledger uses `.grayMarket`, which income tax ignores.
    func orderFromPlug(_ offer: WholesaleOffer, cases: Int) -> String? {
        guard plugOpen, cases > 0 else { return nil }
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

`recordHiddenAct` runs before the append, and it is not inside a closure. Its result goes into the local `order`.

### 4.4 `plugEndDay` (End Day)

```swift
    func plugEndDay() -> [String] {
        var lines: [String] = []
        let today = data.day
        // 1. A new plug: the first time, or 28 days after the last one vanished.
        let eligible = followerTier >= 1 || reputationTier >= 1
        let gone = data.plug.goneDay
        if eligible, today >= Balance.plugMinDay, data.plug.unlockedDay == nil || (gone.map { today >= $0 + Balance.plugReturnDays } ?? false),
           Double.random(in: 0..<1) < Balance.plugUnlockChance {
            let name = Balance.plugNames.randomElement() ?? "Vince"
            var plug = PlugState()
            plug.name = name
            plug.unlockedDay = today
            plug.contactID = "plug:\(today)"
            plug.orders = data.plug.orders      // keep the history; a vanish already closed every waiting order
            var c = Contact(id: "plug:\(today)", name: name, kind: .plug, points: 10, interests: [.sealed])
            c.rewardedLevel = 4
            data.contacts.append(c)
            data.plug = plug
            lines.append("\(name) messaged you: \"I can get you full cases of the hot stuff. No questions, no paperwork. Cash up front.\" See the distributor screen.")
        }
        // 2. Orders that arrive today. Work on a local copy, then write it back once.
        var orders = data.plug.orders
        var clean = data.plug.cleanOrders
        var vanished = false
        var newItems: [SealedItem] = []
        var exposeIDs: [UUID] = []
        for k in orders.indices where orders[k].state == .waiting && orders[k].arrivesDay <= today {
            let o = orders[k]
            guard let product = SetLibrary.product(o.productID) else { continue }
            if vanished || Double.random(in: 0..<1) < o.vanishChance {
                vanished = true
                // The plug takes every prepaid order with it, not only this one.
                let lost = orders.filter { $0.state == .waiting }.reduce(0) { $0 + $1.total }
                for j in orders.indices where orders[j].state == .waiting { orders[j].state = .vanished }
                lines.append("\(data.plug.name ?? "The plug") stopped answering. Your \(money(lost)) in prepaid orders is gone, and so is the plug.")
                break
            }
            let ordered = o.cases * o.caseUnits
            let shipped = Double.random(in: 0..<1) < Balance.plugShortChance
                ? max(1, Int(Double(ordered) * Double.random(in: Balance.plugShortShare))) : ordered
            if shipped < ordered {
                let refund = o.unitPrice * Double(ordered - shipped)
                addLedger(refund, .grayMarket, "Short shipment refund · \(o.productName)")
                lines.append("The plug came up short: \(shipped) of \(ordered) units. It sent back \(money(refund)).")
            }
            var ids: [UUID] = []
            for _ in 0..<(shipped / o.caseUnits) {
                let fake = Counterfeit.roll(source: .plug, sealed: true, slug: product.homeSlug,
                                            market: CaseMath.market(product, units: o.caseUnits), msrp: (product.msrp ?? 0) * Double(o.caseUnits))
                let item = makeCase(product, units: o.caseUnits, paid: o.unitPrice * Double(o.caseUnits), source: "Plug · \(data.plug.name ?? "plug")",
                                    status: nil, fake: fake, caseFresh: false, grayOrder: o.id)
                ids.append(item.id)
                newItems.append(item)
            }
            for _ in 0..<(shipped % o.caseUnits) {
                var u = SealedItem(setSlug: product.homeSlug, name: product.name, packs: product.packs, paid: o.unitPrice, acquired: .now,
                                   source: "Plug · \(data.plug.name ?? "plug")", productID: product.id, status: nil, acquiredDay: today)
                u.fake = Counterfeit.roll(source: .plug, sealed: true, slug: product.homeSlug, market: product.market, msrp: product.msrp)
                u.grayOrder = o.id
                ids.append(u.id)
                newItems.append(u)
            }
            orders[k].deliveredIDs = ids
            orders[k].state = .delivered
            clean += 1
            if Double.random(in: 0..<1) < Balance.plugSeizeChance { orders[k].seizeDay = today + Int.random(in: Balance.plugSeizeDays) }
            lines.append("\(data.plug.name ?? "The plug") dropped off \(o.productName): \(shipped) units. No invoice.")
        }
        // 3. Seizures that happen today.
        var seizedGray: Set<UUID> = []
        for k in orders.indices where orders[k].state == .delivered && orders[k].seizeDay == today {
            orders[k].state = .seized
            seizedGray.insert(orders[k].id)
            if let act = orders[k].actID { exposeIDs.append(act) }
        }
        // Write back once. No closure below reads `data`.
        data.plug.orders = orders
        data.plug.cleanOrders = clean
        if vanished { data.plug.goneDay = today }
        data.sealed += newItems
        if !seizedGray.isEmpty {
            let taken = data.sealed.filter { $0.grayOrder.map(seizedGray.contains) == true }
            data.sealed.removeAll { $0.grayOrder.map(seizedGray.contains) == true }      // reads only the local set
            let worth = taken.reduce(0) { $0 + $1.paid }
            lines.append("Police asked about product you bought from the plug. It was stolen. They took \(taken.count) item\(taken.count == 1 ? "" : "s") (paid \(money(worth))). No refund.")
            data.openedPaid += worth
            for o in orders where seizedGray.contains(o.id) {
                recordHiddenAct(.plugSeized, weight: 1.0, note: "Police seized plug stock: \(o.productName)", sourceID: o.id)
            }
        }
        for act in exposeIDs { exposeHiddenAct(act, inDays: 2) }
        return lines
    }
```

**Exclusivity notes.**

- The order loop works on the local `orders` and the local `newItems`. It writes `data.plug.orders` once.
- The string `data.plug.name ?? ...` inside the loop is a read in plain code, not in a closure passed to a mutating call. It is safe. To keep the habit, read `let plugName = data.plug.name ?? "The plug"` once at the top and use it.
- `data.sealed.removeAll { $0.grayOrder.map(seizedGray.contains) == true }` reads only the local `seizedGray`.
- `addLedger` runs inside the loop. It writes `data.ledger` and `data.cash`. The loop iterates a local, so that is safe.

**Seized stock and money.** The seized items leave with no refund. Their paid amount moves to `openedPaid`, so the portfolio cost stays whole, the same as a giveaway (`giveAway`, `M/LiveStream.swift` L461). A unit that the player already sold is not taken. Units from an opened plug case keep `grayOrder`, so a seizure finds them.

### 4.5 Proposal 4.8: consequences

| Consequence | Where | Rule |
|---|---|---|
| A sold fake from the plug | Existing path | The plug fake is a normal `fake` on the item. A sale goes through `recordBadSale`. The buyer finds out at the existing rates: reputation −40 and a scam accusation (`counterfeitsEndDay`, `M/Counterfeits.swift` L331). |
| Seized stock | `plugEndDay` | The message "Police asked about product you bought from the plug." The items leave with no refund. `recordHiddenAct(.plugSeized)` and `exposeHiddenAct` for the order's `plugPurchase` act. Part C makes the public callout. |
| The rep learns | `plugRepCheck()`, Monday | See below. |
| Tax | `LedgerEntry.Category.grayMarket` | Not in `taxableCategories`, so a plug order is never a cost for income tax. |
| No criminal charge | None | Do not add arrests or fines for a plug purchase. |

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

`contains(where:)` reads only. The local `since` holds the day.

### 4.6 Plug UI (`Buy/PlugViews.swift`, new)

`PlugSection` shows at the bottom of `WholesaleView` when `plugOpen`.

| Part | Content |
|---|---|
| Header | `DetailBox(title: "Gray market · \(name)")`, an orange outline. One line: "Prepaid. No invoice. Full cases only. The plug can vanish with your money, ship short, ship resealed boxes, or ship stolen stock." |
| Trust line | "Clean orders: N. Risk on a $2,000 order: about X%." from `plugVanishChance(total: 2000)`. |
| Offers | One row for each `plugOffers` entry, the same layout as a distributor row: image, name, "Case of 10 · $X each · case mkt $Y", a stepper for cases (1 to 5), and the total. Under the stepper: "Vanish risk on this order: N%" (live from `plugVanishChance`). A button "Prepay" with a `confirmationDialog`: "Send \(money) to \(name) now? You get nothing back if the plug vanishes." |
| Open orders | One row per `.waiting` order: product, cases, "due day N". Past orders show the state: "Delivered", "Vanished", "Seized". |
| Empty | "Nothing hot right now." when the offer list is empty. |

The plug never shows when the player has no social account and reputation Unknown. When `goneDay` is set, the section shows "The plug stopped answering." until a new plug appears.

## 5. Rip & Ship sells one whole product to one buyer, and nothing else (5.1 to 5.7)

### 5.0 The rule, and how the code enforces it

**One buyer buys one whole manufacturer-sealed product. The player opens it on stream. Every card, every bulk card, every promo, and every unopened pack goes to that one buyer.** The product can be a pack, a box, or a full case.

The code enforces the rule by its shape, not by a setting:

| Rule | Enforcement |
|---|---|
| One buyer | `RipShipOrder.buyer` is one `String`. No type holds a list of buyers, spots, or teams. |
| One whole product | An order points to exactly one `SealedItem` (`itemID`). A `SealedItem` is always whole. `createRipShipOrder` refuses an item that is not in hand, is in the PC, is a known fake, or already has an order. |
| No split | The item status becomes `.soldToViewer(orderID:)`. No other sale path accepts an item with a status. A case opens into units that keep `.soldToViewer` with the same order ID. |
| All contents to the buyer | `finishRipShip` moves every `OwnedCard` and every `BulkGroup` with the rip's `ripID`, and every loose pack or unit of the order, out of the player's inventory into the order. A test checks it (section 9). |
| Open on stream | The order must be ripped on the same stream. When the stream ends with an unripped order, Whatnot refunds the buyer. |
| No prize that depends on the result | No API pays a viewer by result. No wheel, no pull box, no "rip until you hit" sale. A Rip & Ship rip cannot run with `recording` (Record & Rip) or Hits only. |
| No group break | The existing case-split rule stays: no livestream, no random assignment ([D/12 L218-224](/Users/ajholloway/personal/PokeVendor/docs/12-acquiring-product.md)). |

### 5.1 Types (`M/RipShip.swift`, new)

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

struct RipShipOrder: Codable, Identifiable, Hashable {
    enum State: String, Codable { case sold, ripped, shipped, refunded }

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
    /// The unit IDs when a case opens on stream.
    var unitIDs: [UUID] = []
    /// Hidden: the product is resealed. Set when the rip starts. The rip shows it on camera.
    var resealed = false
    var ripID: UUID?
    var rippedDay: Int?
    /// What ships: every pulled card that is not bulk, and the promos.
    var cards: [CardPrint] = []
    var bulkCount = 0
    var bulkValue = 0.0
    /// Unopened packs or units of the product. They ship sealed.
    var loosePacks: [String] = []
    /// Hidden: the hits that the player palmed. The buyer got a bulk card for each.
    var palmed: [CardPrint] = []
    var palmCaught = false
    var palmSettled = false
    var shippedDay: Int?
    /// The `unshippedOrder` act in Part C's hidden log, so a shipment can retire it.
    var lateActID: UUID?

    var net: Double { price - fees.total }
    var contentsValue: Double { cards.reduce(0) { $0 + ($1.market ?? 0) } + bulkValue }
}

struct RipShipState: Codable, Hashable {
    var orders: [RipShipOrder] = []
    /// Whatnot bans the player from streams until this day.
    var bannedUntil: Int?
    var banReason: String?
    /// Gross Rip & Ship sales by day, for the 4-week commission tier.
    var grossByDay: [Int: Double] = [:]

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func v<T: Decodable>(_ key: CodingKeys, _ fallback: T) -> T { (try? c.decodeIfPresent(T.self, forKey: key)) ?? fallback }
        orders = v(.orders, [])
        bannedUntil = v(.bannedUntil, nil)
        banReason = v(.banReason, nil)
        grossByDay = v(.grossByDay, [:])
    }
}
```

`[Int: Double]` encodes as a JSON array of pairs. That is fine for `JSONEncoder` and `JSONDecoder`.

`StreamPlan` (`M/LiveStream.swift` L48-54) gets one optional field. The synthesized decoder reads it with `decodeIfPresent`:

```swift
    /// The items that the player marked for Rip & Ship. Nil on old saves.
    var ripShipIDs: [UUID]?
```

`StreamItem` (L57-70) gets `var ripShip = false` and `var isCase = false`. `StreamItem` is not saved.

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

Example: a $100 sale of a box (shipping $9.85) at 8%: commission $8.00, processing $3.19, flat $0.30, supplies $0.50. Net $88.01. The receipt shows profit as net minus `paid`.

Rip & Ship does not call `saleCosts` or `useShippingSupplies`. The $0.50 covers the supplies, and the buyer pays the label. A normal Whatnot auction or Buy Now keeps `Balance.whatnotFeeRate` (10.9%) and the seller's shipping. Section 7 notes the two fee models in D/15.

### 5.3 Proposal 5.1: the order life cycle

**Create an order (the sale).**

```swift
    var whatnotBanned: Bool { (data.ripShip.bannedUntil ?? -1) > data.day }

    /// Why this item cannot go up for Rip & Ship, or nil.
    func ripShipBlock(_ itemID: UUID) -> String? {
        guard !whatnotBanned else { return "Whatnot banned you until day \((data.ripShip.bannedUntil ?? 0) + 1)." }
        guard let item = data.sealed.first(where: { $0.id == itemID }) else { return "The product is gone." }
        if item.status != nil { return "It is not in hand." }
        if item.pc { return "It is in your PC." }
        if item.isKnownFake { return "It is resealed. Selling it is a scam." }
        if data.ripShip.orders.contains(where: { $0.itemID == itemID && $0.state != .refunded }) { return "It is already sold." }
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

**Exclusivity note.** The gross line reads the dictionary into a local first, then writes it. Do not write `data.ripShip.grossByDay[data.day, default: 0] += price`. The subscript key reads `data` during a mutating access on `data.ripShip`, and that is the trap.

`addReceipt(ids: [itemID])` credits a P&L challenge when the item is in one. `noteAllocationSold` (3.6) marks a hot allocation unit as sold "elsewhere". That is correct: Rip & Ship is not the store shelf.

**Begin the rip.** The rip must know the order before its first pack commits.

```swift
    /// Starts the rip of an order. A case opens into its units first, and the units keep the order status.
    /// Returns the items to rip.
    func beginRipShipRip(_ orderID: UUID, ripID: UUID) -> [SealedItem] {
        guard let k = data.ripShip.orders.firstIndex(where: { $0.id == orderID }), data.ripShip.orders[k].state == .sold else { return [] }
        let itemID = data.ripShip.orders[k].itemID
        var ids = [itemID]
        if data.sealed.first(where: { $0.id == itemID })?.isCase == true {
            ids = openCase(itemID, status: .soldToViewer(orderID: orderID), save: false)
        }
        let set = Set(ids)
        let items = data.sealed.filter { set.contains($0.id) }
        data.ripShip.orders[k].unitIDs = ids
        data.ripShip.orders[k].ripID = ripID
        data.ripShip.orders[k].resealed = items.contains { $0.fake != nil }
        save()
        return items
    }
```

Read `k` again after `openCase` if a later change makes `openCase` touch `data.ripShip`. Today it does not.

**Finish the rip: move every content to the order.**

```swift
    /// Moves everything that came out of the order's product to the order (proposal 5.1). Safe to call more than once.
    func finishRipShip(_ orderID: UUID, save saves: Bool = true) {
        guard let k = data.ripShip.orders.firstIndex(where: { $0.id == orderID }), let ripID = data.ripShip.orders[k].ripID else { return }
        var order = data.ripShip.orders[k]
        guard order.state == .sold || order.state == .ripped else { return }
        let units = Set(order.unitIDs + [order.itemID])
        // A resealed product showed on camera. Whatnot refunds the buyer, and the junk stays with the player.
        // The rip always stops on a resealed pack (docs/18), so a resealed product shows on camera.
        if order.resealed, order.state == .sold { refundRipShipOrder(orderID, reason: .resealed); return }
        // The player keeps one card for each palmed print. Everything else goes.
        var keep = order.palmed
        var keptIDs: Set<UUID> = []
        var moved: [CardPrint] = []
        for card in data.raw where card.ripID == ripID {
            if let j = keep.firstIndex(where: { $0.name == card.print.name && $0.num == card.print.num && $0.variant == card.print.variant }) {
                keep.remove(at: j)
                keptIDs.insert(card.id)
            } else {
                moved.append(card.print)
            }
        }
        let bulk = data.bulk.filter { $0.ripID == ripID }
        let loose = data.sealed.filter { units.contains($0.id) || $0.brokenFrom.map(units.contains) == true }
        let looseIDs = Set(loose.map(\.id))
        // Remove with closures that read only locals.
        data.raw.removeAll { $0.ripID == ripID && !keptIDs.contains($0.id) }
        data.bulk.removeAll { $0.ripID == ripID }
        data.sealed.removeAll { looseIDs.contains($0.id) }
        // A palmed hit becomes a bulk card in the buyer's order: the swap.
        order.cards += moved
        order.bulkCount += bulk.reduce(0) { $0 + $1.cards.count } + order.palmed.count
        order.bulkValue += bulk.reduce(0) { $0 + $1.value }
        order.loosePacks += loose.map(\.name)
        order.state = .ripped
        order.rippedDay = order.rippedDay ?? data.day
        data.ripShip.orders[k] = order
        // The paid amount of unopened packs that ship is a cost now.
        data.openedPaid += loose.reduce(0) { $0 + $1.paid }
        if saves { save() }
    }
```

The reseal check reads `order.resealed`, which `beginRipShipRip` sets from the hidden `fake` of the units. Do not check `fakeKnown` on the items at the end: after the last pack, `commitPack` has removed every item of the product, so nothing is left to check. `RipModel.finishOpening` still calls `foundResealed` (`M/Counterfeits.swift` L290), so the player sees the banner on camera.

**Exclusivity notes in `finishRipShip`.**

- `for card in data.raw where card.ripID == ripID` iterates a copy and only reads.
- Each `removeAll` closure reads only the locals `ripID`, `keptIDs`, and `looseIDs`. Never write `data.raw.removeAll { $0.ripID == data.ripShip.orders[k].ripID }`. That reads `data` while `data.raw` is open for writing, and the game crashes with "Fatal access conflict".
- The order is built in the local `order` and written back once.

**Why `openedPaid`.** `commitPack` already adds each opened pack's cost to `openedPaid` (L692). A loose pack that ships never opens, so its cost moves to `openedPaid` here. The portfolio `paid` total then stays whole.

**Refund (also the API that Part C asked for).**

```swift
    enum RipShipRefund { case notOpened, resealed, late, palmCaught }

    /// Whatnot reverses the sale: the player pays back the net. Returns the report line. Part C's "make it right" can call
    /// it with the order ID that `unshippedOrder` carries in `sourceID`.
    @discardableResult
    func refundRipShipOrder(_ orderID: UUID, reason: RipShipRefund = .late) -> String {
        guard let k = data.ripShip.orders.firstIndex(where: { $0.id == orderID }), data.ripShip.orders[k].state != .refunded,
              data.ripShip.orders[k].state != .shipped else { return "" }
        let order = data.ripShip.orders[k]
        data.ripShip.orders[k].state = .refunded
        addLedger(-order.net, .refund, "Whatnot refund · \(order.itemName) · \(order.buyer)")
        // An unopened product comes back to hand.
        for i in data.sealed.indices {
            if case .soldToViewer(let id) = data.sealed[i].status, id == orderID { data.sealed[i].status = nil }
        }
        if let act = order.lateActID { retireHiddenAct(act) }
        switch reason {
        case .notOpened:
            data.social.authenticity = max(0, data.social.authenticity - Balance.ripShipNotOpenedAuthenticity)
            return "You did not open \(order.buyer)'s \(order.itemName) on stream. Whatnot refunded them \(money(order.price))."
        case .resealed:
            data.social.authenticity = max(0, data.social.authenticity - Balance.resealedOnStreamAuthenticity)
            return "The \(order.itemName) was resealed, live on camera. Whatnot refunded \(order.buyer)."
        case .late:
            return "Whatnot cancelled \(order.buyer)'s order. You never shipped it. They got \(money(order.price)) back from your account."
        case .palmCaught:
            return "Whatnot refunded \(order.buyer)."
        }
    }
```

A refund after the rip (`.late`) leaves the order's contents with the player. The function puts them back in Inventory: every `cards` print becomes an `OwnedCard` (`paid: nil`, `ripID: order.ripID`, `acquiredDay: data.day`), and the bulk becomes one `BulkGroup` of filler at `bulkValue`. Build these from the local `order`, then append. The player now owns cards that a buyer paid for and lost. That is the cost of a late order.

**Ship (5.4).**

```swift
extension Balance {
    static let ripShipDeadlineDays = 2
    static let ripShipCancelDays = 7
    static let ripShipShipMinutes = 10.0
    static let ripShipShipPoints = 2
}

    var ordersToShip: [RipShipOrder] { data.ripShip.orders.filter { $0.state == .ripped } }

    /// Ships orders. A free action that costs 10 minutes for each order (proposal 5.4).
    func shipRipShipOrders(_ ids: [UUID]) -> String? {
        let set = Set(ids)
        let open = data.ripShip.orders.filter { set.contains($0.id) && $0.state == .ripped }
        guard !open.isEmpty else { return nil }
        guard spendHours(Double(open.count) * Balance.ripShipShipMinutes / 60) else { return "Not enough time today." }
        let today = data.day
        for order in open {
            guard let k = data.ripShip.orders.firstIndex(where: { $0.id == order.id }) else { continue }
            data.ripShip.orders[k].state = .shipped
            data.ripShip.orders[k].shippedDay = today
            if let act = order.lateActID { retireHiddenAct(act) }
            if let id = order.buyerContactID { addPoints(id, Balance.ripShipShipPoints) }
            if order.price >= Balance.fairDealMinPrice { addReputation(Balance.onlineSaleReputation) }
        }
        log("Shipped \(open.count) Rip & Ship order\(open.count == 1 ? "" : "s").")
        save()
        return nil
    }
```

**The Whatnot ban (for 5.6 and for Part C's 6.6).**

```swift
    /// Whatnot bans the player from streams. A second ban extends to the later end day. Part C calls this.
    func banFromWhatnot(days: Int, reason: String) {
        let end = data.day + days
        let current = data.ripShip.bannedUntil ?? -1
        data.ripShip.bannedUntil = max(current, end)
        data.ripShip.banReason = reason
        log("Whatnot banned you from streams until day \(max(current, end) + 1) for \(reason).")
        save()
    }
```

**The ban closes Whatnot.** `StreamSession.whatnotOpen` (`M/LiveStream.swift` L158) becomes `store.followerTier >= 1 && !store.whatnotBanned`. A banned player can still stream, talk, rip their own product, and give away. Auctions, Buy Now, and Rip & Ship close.

### 5.4 Proposal 5.3: the buyer price band, and Part A's rival creators

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
}
```

`StreamBuyNow` (L93-97) gets `var ripShip = false` and `var ceilingShare = 1.0`. `StreamAuction` (L81-91) gets `var ripShip = false`.

`StreamSession` gets, in `init`, one local read of Part A's rivals (outside any closure on `data`):

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
        let band = hot ? Balance.ripShipHotBand : Balance.ripShipBand
        var offer = StreamBuyNow(item: item, price: price, expiresAt: minute + Balance.buyNowMinutes)
        offer.ripShip = true
        offer.ceilingShare = Double.random(in: band)
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

**Auction.** `auctionRipShip(_:startShare:)` mirrors `startAuction` (L238) with `ripShip = true`. Its ceiling is `item.market × Double.random(in: band)` (the band above, not the 0.55 to 1.1 formula). At the end, `advanceAuction` (L251) calls `soldRipShip(a.item, price: a.top, auction: true)` instead of `sell`.

**The sale and the wait:**

```swift
    /// The order that waits for its rip on this stream. Other sales wait until it is open.
    private(set) var ripShipWaiting: RipShipOrder?
    private(set) var ripShipOrders: [RipShipOrder] = []
    private var waitingSince = 0.0
    var ripShipOpen: Bool { whatnotOpen && ripShipWaiting == nil && ripping == nil }

    private func soldRipShip(_ item: StreamItem, price: Double, auction: Bool) {
        // A repeat buyer half of the time. Read the contacts into a local first.
        let regulars = store.data.contacts.filter { $0.kind == .buyer || $0.kind == .collector }
        let contact = Double.random(in: 0..<1) < Balance.ripShipRepeatBuyerChance ? regulars.randomElement() : nil
        let buyer = contact?.name ?? (Self.names.randomElement() ?? "a viewer")
        guard let order = store.createRipShipOrder(itemID: item.id, price: price, buyer: buyer, buyerContactID: contact?.id, auction: auction) else {
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

In `tick()` (L167-179): while `ripShipWaiting != nil` and `minute - waitingSince > Balance.ripShipWaitMinutes`, `interest` falls an extra `Balance.ripShipImpatience` each minute, and chat lines say "rip it already". The clock keeps running.

In `end()` (L348-362), before the follower math:

```swift
        if let w = ripShipWaiting {
            let line = store.refundRipShipOrder(w.id, reason: .notOpened)
            add(.system, line)
            ripShipWaiting = nil
        }
```

**Time for a whole case (5.7).** A case rip uses `Balance.ripShipCaseMinutesPerPack` (0.75) instead of 3 minutes a pack. `ripDone` (L329) reads `item.isCase` on the `ripping` item. `StreamPickSheet` disables a case for Rip & Ship when `session.minutesLeft < Double(item.packs) * 0.75` with the reason "Not enough stream time to open the whole case." A booster box case needs 162 minutes, so it fits a 3-hour stream only near the start.

### 5.5 Proposal 5.5: a big hit is a clip, not a card

`ripDone(hits:)` (L329-345) stays. A Rip & Ship rip gets the same interest bump and the same tip burst on a big hit. Add one line for a Rip & Ship rip with a big hit:

```swift
        if isRipShip, best == .big {
            let gained = Int((viewers * Balance.ripShipClipFollowerShare).rounded())
            store.data.social.followers += gained
            followersGained += gained
            add(.system, "The pull is a clip now. +\(gained) followers. The card ships to \(order.buyer).")
        }
```

The card itself goes to the buyer through `finishRipShip`. The `RipView` summary's "Post this pull" button stays, so the player can post the pull reveal (existing reach). The player gets the fee, the followers, and the clip. The viewer takes the card risk.

### 5.6 Proposal 5.6: palm the hit

AJ approved this choice. It is a scam with consequences.

**`RipModel` (`M/RipModel.swift`).** Add:

```swift
    /// A Rip & Ship rip: every card goes to this order (Model/RipShip.swift). Nil: the player's own rip.
    var shipOrderID: UUID?
    var shipBuyer: String?
    /// Hits that the player palmed in this rip.
    private(set) var palmedIDs: Set<UUID> = []

    /// The player can palm a big hit once for each card, only in a Rip & Ship rip.
    func canPalm(_ card: RipCard) -> Bool { shipOrderID != nil && card.hitTier == .big && !palmedIDs.contains(card.id) }

    /// Swaps a big hit off camera (docs/18-ripping.md, Rip & Ship). The card stays with the player. The buyer gets a
    /// bulk card in its place. A scam: the camera catches it half of the time.
    func palm(_ card: RipCard) {
        guard canPalm(card), let orderID = shipOrderID else { return }
        palmedIDs.insert(card.id)
        store?.notePalm(orderID: orderID, print: card.print, value: card.market)
    }
```

`hitTier` is on `RipCard` (`M/RipCard.swift` L127). The list of hits for the stream (`allHits`) stays the same. The stream only sees the clip.

**`GameStore.notePalm` (`M/RipShip.swift`):**

```swift
extension Balance {
    static let palmFoundChance = 0.5
    static let palmFoundReputation = 40
    static let palmBanDays = 56
    static let palmCalloutHeat = 90.0
}

    func notePalm(orderID: UUID, print: CardPrint?, value: Double) {
        guard let print, let k = data.ripShip.orders.firstIndex(where: { $0.id == orderID }) else { return }
        #if DEBUG
        let caught = GameStore.forcePalmCaught ?? (Double.random(in: 0..<1) < Balance.palmFoundChance)
        #else
        let caught = Double.random(in: 0..<1) < Balance.palmFoundChance
        #endif
        data.ripShip.orders[k].palmed.append(print)
        if caught { data.ripShip.orders[k].palmCaught = true }
        let order = data.ripShip.orders[k]
        if !caught {
            // A secret that can come out later (Part C).
            recordHiddenAct(.palmedHit, weight: 1.5, note: "Palmed \(print.name) from \(order.buyer)'s \(order.itemName)",
                            witnesses: currentStreamPeakViewers, refund: order.price, sourceID: order.id)
        }
        save()
    }
```

`currentStreamPeakViewers` is a small `var` on `GameStore` that `StreamSession` sets on each tick (or pass the viewer count into `palm` from the view). `forcePalmCaught` is a `#if DEBUG static var forcePalmCaught: Bool?` for the tests, like `RipModel.forcedSpecial` (L111).

**Consequences when the camera caught it (End Day, `ripShipEndDay`):**

```swift
    private func settlePalm(_ orderID: UUID) -> [String] {
        guard let k = data.ripShip.orders.firstIndex(where: { $0.id == orderID }) else { return [] }
        data.ripShip.orders[k].palmSettled = true
        let order = data.ripShip.orders[k]
        let card = order.palmed.first?.name ?? "a hit"
        addReputation(-Balance.palmFoundReputation)
        banFromWhatnot(days: Balance.palmBanDays, reason: "swapping a viewer's hit")
        var lines = ["Viewers clipped you palming the \(card) from \(order.buyer)'s \(order.itemName). Reputation −\(Balance.palmFoundReputation). Whatnot banned you for 8 weeks."]
        if let line = startCallout(.fairness, truth: true, receipts: true, heat: Balance.palmCalloutHeat, accuser: .person(order.buyer),
                                   text: "\(order.buyer) posted a clip that shows you swapping their hit off camera.", refund: order.price) {
            lines.append(line)
        }
        return lines
    }
```

This matches Part C's rule (its section 9): Part B bans and calls `startCallout` at heat 90. A caught palm does not also record a `palmedHit` act, so one act gives one callout. The refund to the buyer is Part C's "make it right" (`refund: order.price`). Part B does not refund on its own, so the buyer is not paid twice.

**Palm UI (`Rip/Panels.swift` and `Rip/RipView+Reveal.swift`).**

- In a Rip & Ship rip, the info panel (`Panels.swift`, the card panel) shows "Ships to \(buyer)" under the price of every card.
- For a card where `model.canPalm(card)` is true, the panel shows one small muted text button "Palm it" (`.font(.caption)`, `Theme.muted`, no fill). It is never the primary button.
- The tap opens a `confirmationDialog`: title "Palm the \(card.name)?", message "This is a scam. The card stays with you, and \(buyer) gets a bulk card in its place. The camera catches about half of all palms. If it does, Whatnot bans you and the clip spreads." Buttons: "Palm it" (destructive) and "Leave it".
- After the palm: the card slides down out of the frame (offset y +400, 0.35 s) and a bulk card from the pile takes its place. No flash, no glow. A small line in the top bar says "1 card palmed". The stream chat gets no line on the spot. The catch shows in the morning report.

### 5.7 Proposal 5.7: a whole case for one buyer

A case is a `SealedItem` with `caseUnits`. It goes up for Rip & Ship like any other item, at its case price (`realMarket(of:)`). After the sale:

1. The "Rip for \(buyer)" button calls `beginRipShipRip`. It opens the case into units with status `.soldToViewer(orderID:)`.
2. The `CaseOpenSheet` (2.5) shows in "for a buyer" mode first: the title says "\(buyer)'s case", and the summary button says "Rip all \(n) for \(buyer)".
3. The `RipView` opens with every unit in one queue. The whole case is one rip with one `ripID`.
4. `finishRipShip` moves every card, all bulk, and every unit that the player did not open.

The one-buyer rule holds: one order, one buyer, one case. The buyer cannot split it on the game side, and the game never sells a unit of a case to a second viewer.

### 5.8 `ripShipEndDay` (End Day)

```swift
extension Balance {
    static let ripShipKeepDays = 28
}

    func ripShipEndDay() -> [String] {
        var lines: [String] = []
        let today = data.day
        // Work from a copy of the IDs. Each step looks its order up again.
        let snapshot = data.ripShip.orders
        // 1. An order that never finished on its stream (the app closed): finish a started rip, refund an unstarted one.
        for o in snapshot where o.state == .sold && o.soldDay < today {
            if o.ripID != nil { finishRipShip(o.id, save: false) } else { lines.append(refundRipShipOrder(o.id, reason: .notOpened)) }
        }
        // 2. A palm that the camera caught.
        for o in snapshot where o.palmCaught && !o.palmSettled { lines += settlePalm(o.id) }
        // 3. Ship deadlines. Part C rolls the discovery (unshippedOrder, 20% a day). Part B records the act once.
        for o in data.ripShip.orders where o.state == .ripped {
            let waited = today - (o.rippedDay ?? o.soldDay)
            if waited > Balance.ripShipDeadlineDays, o.lateActID == nil {
                let act = recordHiddenAct(.unshippedOrder, weight: 1.0, note: "\(o.buyer)'s \(o.itemName) is past its ship date",
                                          contactID: o.buyerContactID, refund: o.price, sourceID: o.id)
                if let k = data.ripShip.orders.firstIndex(where: { $0.id == o.id }) { data.ripShip.orders[k].lateActID = act }
                lines.append("\(o.buyer)'s Rip & Ship order is late. Ship it today.")
            }
            if waited >= Balance.ripShipCancelDays { lines.append(refundRipShipOrder(o.id, reason: .late)) }
        }
        // 4. The ban ends.
        if let until = data.ripShip.bannedUntil, until == today {
            lines.append("Your Whatnot ban is over.")
        }
        // 5. Prune. Read the cutoffs into locals: a closure on `data.ripShip` must not read `data`.
        let cutoff = today - Balance.ripShipKeepDays
        data.ripShip.orders.removeAll { ($0.state == .shipped || $0.state == .refunded) && $0.soldDay < cutoff }
        let since = today - 27
        let kept = data.ripShip.grossByDay.filter { $0.key >= since }
        data.ripShip.grossByDay = kept
        return lines
    }
```

**Exclusivity notes.**

- `removeAll { ... $0.soldDay < cutoff }` reads only the local `cutoff`. The tempting `$0.soldDay < data.day - 28` crashes.
- The gross filter runs into a local `kept`, then writes. Do not write `data.ripShip.grossByDay = data.ripShip.grossByDay.filter { $0.key >= data.day - 27 }`, because the closure reads `data`.
- Step 3 iterates `data.ripShip.orders` by value (a copy) and writes by index lookup. `refundRipShipOrder` changes only the state of the order, so the copy stays valid for the loop.

**Part C's request.** Part C asked that this step run before `vendingEndDay()` (`M/GameStore.swift` L1167), so its `unshippedOrder` acts roll the same night. Section 6 places it right after `streamsEndDay()` (L1161).

### 5.9 Rip & Ship UI

**A. Stream setup (`Stream/StreamView.swift`, `StreamSetupView` L386-517).**

- In "Bring", each sealed row that is chosen shows a second chip "R&S" at the right. A tap toggles it in a new `@State ripShip: Set<UUID>`. The chip shows only when `store.followerTier >= 1`, the player is not banned, and `store.ripShipBlock(item.id) == nil`.
- Under the section, one caption: "Rip & Ship: one viewer buys the whole product. You open it on stream. Every card ships to that viewer. Whatnot takes 8% plus 2.9% and $0.30."
- `scheduleStream` and `startStream` get `ripShipIDs: [UUID]`. `StreamPlan.ripShipIDs` holds them. `startStream` sets `ripShip = true` on those `StreamItem`s. A banned player gets the chips hidden and the line "Whatnot banned you until day N."

**B. The live stream (`StreamView`).**

- `PickMode` gets `case ripShip`.
- A seventh action in the second row: `action("Rip & Ship", "shippingbox", enabled: session.ripShipOpen && session.items.contains(where: \.ripShip)) { pick = .ripShip }`. Put the three Whatnot actions in their own row, so the buttons keep their size.
- While `session.ripShipWaiting` is set, a panel shows above chat (new view `RipShipWaitingPanel` in `Stream/RipShipViews.swift`): the product image, "SOLD to \(buyer) · \(money(price))", "Rip it now. Every card ships to \(buyer).", and one primary button "Rip for \(buyer)". The panel has a cyan outline that pulses softly (opacity 0.4 to 0.8, 1.2 s). The other sale actions are disabled until the rip starts.
- "Rip for \(buyer)" calls `store.beginRipShipRip(order.id, ripID:)`. Create the `RipModel` first so its `ripID` exists, or let `RipSession` carry a pre-made `ripID`. For a case, show `CaseOpenSheet` in buyer mode first. Then present `RipView` with `shipOrder: order`.

**C. The pick sheet (`StreamPickSheet` L246-319, mode `.ripShip`).**

- The list shows only items with `ripShip == true`, with the reason when one is blocked.
- After the pick: a segmented control "Buy Now · Auction". Buy Now uses a slider from 80% to 130% of market (start 100%). Auction uses the existing start slider (start 50%).
- A fee box under the slider, live: "Price $X · commission $A (8%) · processing $B · $0.30 · supplies $0.50 · you get $N · paid $P · profit $Q". Use `store.ripShipFees(price:shipping:)`.
- One caption: "Viewers pay about 95% to 120% of market for hot product, 90% to 105% for the rest."

**D. `RipView` (`Rip/RipView.swift` L9-19).** The init gets `shipOrder: RipShipOrder? = nil`. When it is set:

- `model.shipOrderID = shipOrder.id`, `model.shipBuyer = shipOrder.buyer`, allowed modes `[.normal, .fast]`, `hitsOnly = false`, `recording = []`.
- The top bar (`TopBar`) shows a cyan chip "FOR \(buyer.uppercased())".
- The summary hides every "Keep in PC" or "Add to collection" control. "Post this pull" stays.
- `onClose` calls `store.finishRipShip(order.id)` before `onHits`. A Rip & Ship rip that closes early still sends every unopened pack to the buyer.

**E. Stream summary (`StreamSummaryView` L322-383).** A new section "Rip & Ship · N orders" (`RipShipSummaryBox`): one row per order with the buyer, the product, the price, the net, the top card that ships, and "Ship by day N". A button "Go to the ship queue".

**F. The ship queue (`Stream/ShipQueueView.swift`, new `ShipQueueView`).**

- Route: add `case shipQueue` to `AppRoute` (`App/AppNav.swift` L4-30) and to `appDestinations`.
- Entry: the stream summary button, a row in `SocialHubView`, and a Hub badge "N orders to ship" in `HubView` when `ordersToShip` is not empty (orange when one is late).
- Content: one card per order: buyer, product, the date sold, the top 3 cards by value with prices, "and N bulk cards", any sealed packs that ship, and "Ship by day N" (green, orange on the last day, red when late). A footer button "Ship all · \(n × 10) min" (`shipRipShipOrders`). Each card also has "Ship". The view shows the time left in the day.
- Late orders sort first.

## 6. End Day hooks and the exclusivity trap

### 6.1 Order in `GameStore.endDay()` (`M/GameStore.swift` L1106-1210)

| Step | Insert after | New call | Why there |
|---|---|---|---|
| 1 | `lines += advanceSealed()` (L1144) | `lines += backRoomRestock()` | Cases that arrived today can restock the shelf for the next store day. `storeDayEnd()` (L1125) runs before the day moves, so the restock is ready for the next morning. |
| 2 | `lines += streamsEndDay()` (L1161) | `lines += ripShipEndDay()` | After streams, and before `vendingEndDay()` (L1167), as Part C asked. Part C's discovery roll for `unshippedOrder` then sees the act the same night. |
| 3 | `lines += splitsEndDay()` (L1162) | `lines += distributorEndDay()` | After `advanceSealed`, so the 21-day check sees today's deliveries. Before rent and taxes. |
| 4 | after step 3 | `lines += plugEndDay()` | After the distributor, so a plug order that arrives today is not in `advanceSealed`. Plug items arrive with status nil. |

Part C's `calloutsEndDay` runs later (Part C section 8). Part B's acts recorded tonight roll there tonight.

The second `syncMarket()` (L1170) runs after all four steps. Case prices read `PriceCycle.today`, so a price read in a step uses the market of the new day after the first `syncMarket()` (L1132). That is correct.

### 6.2 Every place where the exclusivity rule matters

`GameStore.data` is `@Observable`. A closure passed to a mutating call on `data.x` must never read `data.y`. It crashes with "Fatal access conflict". Read values into locals first.

| Function | The risky line | The safe form |
|---|---|---|
| `buyWholesale` | `data.distributor.hotRecords += newIDs.map { HotAllocationRecord(..., deliveredDay: data.day + 5) }` | `let delivered = data.day + Balance.wholesaleDeliveryDays` first, and the closure reads `delivered`. |
| `backDoorCheck` | `data.distributor.hotRecords.removeAll { $0.deliveredDay + 21 <= data.day }` | `let today = data.day`, or remove by a local ID set (as written). |
| `backDoorWarning` | `a.warnings.filter { $0 >= data.day - 84 }` on `data.distributor.warnings` in place | Copy the account to a local `a`, filter with the local `cutoff`, write back once. |
| `creditRepSpend`, `pushForAllocation`, `distributorEndDay` | Writing `data.distributor.x` and calling `addPoints` in one expression | Copy to a local, change it, write it back, then call `addPoints`. |
| `recordWholesale` | `data.contacts[i].lastDealDay = data.day` | `let today = data.day` first. The right side reads first, so the original is safe, but the local makes the rule plain. |
| `plugEndDay` | `data.sealed.removeAll { $0.grayOrder == data.plug.orders[k].id }` | Build the local `seizedGray` set, and the closure reads only it. |
| `plugEndDay` | Appending items inside a loop over `data.plug.orders` | Loop over a local copy, collect `newItems`, write `data.plug.orders` and `data.sealed` once at the end. |
| `createRipShipOrder` | `data.ripShip.grossByDay[data.day, default: 0] += price` | Read the old value into a local with the local `today`, then assign. |
| `finishRipShip` | `data.raw.removeAll { $0.ripID == data.ripShip.orders[k].ripID }` | Read `ripID` into a local first (as written). Same for `keptIDs` and `looseIDs`. |
| `ripShipEndDay` | `data.ripShip.orders.removeAll { $0.soldDay < data.day - 28 }` | `let cutoff = today - Balance.ripShipKeepDays`. |
| `ripShipEndDay` | `data.ripShip.grossByDay = data.ripShip.grossByDay.filter { $0.key >= data.day - 27 }` | Filter into a local with the local `since`, then assign. |
| `backRoomRestock` | `data.sealed.filter { ... }.forEach { openCase($0.id) }` | Collect the case list into a local array first, then loop and call `openCase`. |
| `openCase` | None, as written | Keep the units as locals and append them. Do not read `data` in a closure. |
| `StreamSession.init` | `store.data.rivals.filter { ... data ... }` | Read the count into a local. The filter closure reads only `$0.kind`. |
| `notePalm` | `recordHiddenAct(..., note: "\(data.ripShip.orders[k].buyer)")` | Read the order into the local `order` first (as written). An argument is not a closure, but the local keeps the habit. |

Run `-test` after each section. The 14-day `days()` run reaches every new step (section 9), so a crash shows there.

## 7. Doc updates

| Doc | Section | Change |
|---|---|---|
| `docs/12-acquiring-product.md` | "Distributor / wholesale" (L185-201) | Rewrite as two tiers. **Secondary wholesaler**: reputation Respected, or a store that waits for its account. 72% of MSRP or 62% of market, $250 minimum, 1 case of each product and 2 cases a week. **Hobby distributor account**: a lease, a finished build-out, the seller's permit, and an application; the decision comes 14 days later. 58% of MSRP or 50% of market, no minimum, the weekly allocation. Add: hot product fills only part of a request (the formula and the table from 3.5). Elite gets one hot case a week that skips the fill roll. The rep relationship. The back-door rule (21 days, 40%, 15% notice, warnings, a 4-week freeze, a 12-week closure). Every order arrives as sealed cases. |
| `docs/12-acquiring-product.md` | New "Cases" after "Case splits" | The case counts table (3.1). A case is one item with its own price: a real case price when the price refresh has one, else units × unit market × the factor table (3.3). Opening is a free action. Units split the paid amount, and the case premium goes away. "Case fresh" from trusted cases, +5% sale chance, no price change. Stranger cases at shows, eBay, and Facebook, with one fake roll for the whole case and the tape check. Packs stay independent draws. A "loaded case" claim is only a seller's words. |
| `docs/12-acquiring-product.md` | New "The plug" | The table from 4.7 with the code names, the 4.8 consequences, the unlock rule, and the tax rule. |
| `docs/12-acquiring-product.md` | "Case splits" (L218-232) | Add: split boxes carry the "case fresh" tag. Add one sentence: Rip & Ship (D/06) is not a group break. One buyer buys one whole product. |
| `docs/12-acquiring-product.md` | Online storefronts, eBay (L34-36) | Cleanup item: reword "carries international product that the other stores do not sell" to "some listings ship from another country: the same English product, 12% cheaper, 10-day delivery". Make this edit only if Part A does not already edit the line. |
| `docs/04-reputation-and-followers-unlocks.md` | Tier table (L18-24) and the paragraph after it (L26-31) | Tier 3: "Secondary wholesaler access". Tier 4 Elite: "Priority case allocation: one hot case a week that skips the distributor's fill roll." The store paragraph: the store opens the secondary wholesaler from the build-out day, and the hobby account after a 14-day application. Replace "keeps the 72% price with no limit" with "keeps the 72% price, a $250 minimum, 1 case of each product, and 2 cases a week". |
| `docs/19-prototype-values.md` | "Wholesale, splits, consignment, and Facebook selling" (L356-364) | Add every constant from section 8 under four sub-tables: Cases, Distributor, Plug, Rip & Ship. Change the case sizes line to the real counts. |
| `docs/19-prototype-values.md` | "Live streams" (L299-313) | Add the Rip & Ship fee line and the Buy Now band. |
| `docs/19-prototype-values.md` | "Your own store" (L380-412) | Add the back room fixture ($600, 12 cases). |
| `docs/22-own-store.md` | "Wholesale" (around L404-424) | The account needs the application and 14 days. During the wait, the store buys at secondary terms. Add the rep, the fill rate, and the back-door rule with its reason: the distributor wants hot product on the shelf. |
| `docs/22-own-store.md` | "Stock" (L118-133) and "Fixtures" (L215-228) | A case never goes on the customer shelf. The back room holds cases and restocks the shelf when a product runs low. Add the fixture row. |
| `docs/06-social-media.md` | "Live streams" (L36-82) | Add "Rip & Ship" as the seventh stream action: the rule from 5.0, marking items in the setup, Buy Now and auction, the fee formula, the price band, the ship queue and its 2-day deadline, the clip rule (5.5), and the whole-case option. Replace "No stream action rips a product that a viewer bought" (L45-51) with the new rule. In "Consequences" (L105-117): a late order is a hidden act (D/35), Whatnot cancels at 7 days, and palming a hit is a scam (5.6) with its costs. The Whatnot ban. |
| `docs/18-ripping.md` | "Ripping on a live stream" (L490-494) | Add "Rip & Ship": the cards belong to the buyer, so they never enter Inventory. A rip that stops early ships the unopened packs. A whole-case rip runs at 0.75 minutes a pack. "Palm it" shows only on a big hit in a Rip & Ship rip. Explain the scam, the 50% catch, and the costs. Add one line to "Sealed products in the rip" (L390): a case opens into units before any rip. |
| `docs/14-counterfeit-risk.md` | "Where the risk lives" (L17-38) | Wholesale and split cases stay at zero, and so do their units. Stranger cases: one roll for the whole case at the source rate. Plug: 8% base, which the sealed factor halves to 4%. The tape check. The plug's stolen stock. |
| `docs/15-selling.md` | "Whatnot" | Two fee models: a normal Whatnot sale (10.9% + $0.30, the player pays shipping) and Rip & Ship (8% stepping to 6.5%, 2.9% of sale plus buyer shipping, $0.30, $0.50 supplies; the buyer pays the label). The case-fresh sale bonus. |
| `docs/21-relationships-and-reputation.md` | Contact kinds (L28-54) | Add the distributor rep and the plug as supplier contacts. They never go in the contact book and never give reputation. |
| `docs/26-taxes.md` | Seller's permit (L47-56) | Replace "not a requirement for the card show table or for wholesale" with "not a requirement for the card show table or the secondary wholesaler. A hobby distributor account requires it." Add: plug orders have no invoice, so income tax never counts them as a cost. |
| `docs/29-packing-and-crowds.md` | Carry space | A sealed case takes 1 space plus 1 for each 8 packs. The table from 2.7. |
| `docs/24-theft-and-insurance.md` | Car break-in | A sealed case does not fit in the thief's bag (10.4). Plug stock that police seize is not theft and has no insurance claim. |
| `docs/31-vending-machines.md` | Stock | A machine holds units, never a sealed case. |
| `docs/08-ui-direction.md` | Inventory and Live stream | The case row, the case opening sheet, the Rip & Ship panel, and the ship queue. |
| `docs/17-calendar-and-events.md` | Scheduled entries | The distributor decision day and the ship deadline show on the calendar. |

## 8. Constants

Each constant lives in `extension Balance` in the file named, the same way the code stores constants today. "Design" means no source gives the number.

### 8.1 Cases

| Constant | Start value | File | Basis |
|---|---|---|---|
| `caseSizes` | box 6, ETB 10, bundle 25, pack 144, blister 24, B&B 10, collection 6, tin 6 | `M/Wholesale.swift` | PHD solicitations (cases.md) |
| `caseSizeByName` | PC ETB 4, UPC 4, mini tin 10, Tech Sticker 12, Knock Out 24 | `M/Cases.swift` | PHD, one seller for PC ETB |
| (in `caseSize(for:)`) | 1-pack blister 16 | `M/Cases.swift` | PHD checklane display |
| `wholesaleKinds` | box, ETB, bundle, pack | `M/Cases.swift` | Keeps the seeded weekly offers |
| `caseFactors` | box 0.95/1.05/1.15, ETB 1.05/1.15/1.25, bundle 0.95/1.05/1.10, other 1.00/1.05/1.10 | `M/Cases.swift` | tcgcsv ratios |
| `caseOldDays` | 730 | `M/Cases.swift` | Report 3.3 |
| `caseFreshSaleBonus` | 1.05 | `M/Cases.swift` | Design |
| `dealerCaseChance` | 0.20 | `M/Cases.swift` | Design (report 3.5) |
| `onlineCaseListingChance` | 0.10 | `M/Cases.swift` | Design (report 3.5) |
| `ebayCaseShare` | 0.85...1.05 | `M/Cases.swift` | Design, near the eBay unit band |
| `facebookCaseShare` | 0.70...0.95 | `M/Cases.swift` | Design, near the Facebook unit band |
| `caseCheckCatch` | 0.5 | `M/Cases.swift` | Report 3.5 ("halves") |
| `caseRumorChance` | 0.10 | `M/Cases.swift` | Design (flavor) |
| `casePacksPerSpace` | 8 | `M/Packing.swift` | Design |
| `backRoomCases` | 12 | `M/CardStore.swift` | Design |
| `fixtureCosts[.backRoom]` | 600 | `M/CardStore.swift` | Design |
| `backRoomRestockAt` | 1 | `M/Cases.swift` | Design |
| Ratio filter in `cases.py` | 0.6...2.0 | `tools/export/cases.py` | Data check |

### 8.2 Distributor

| Constant | Start value | File | Basis |
|---|---|---|---|
| `distributorReviewDays` | 14 | `M/Distributor.swift` | Report 4.2, approved |
| `repStartPoints` | 20 | `M/Distributor.swift` | Design |
| `repSpendStep` | 1000 | `M/Distributor.swift` | Report 4.3 |
| `repPointsPerWeek` | 3 | `M/Distributor.swift` | Report 4.3 |
| `repEventPoints` | 1 | `M/Distributor.swift` | Report 4.3 |
| `pushCost` | 5 | `M/Distributor.swift` | Report 4.3 |
| `pushFillBonus` | 0.25 | `M/Distributor.swift` | Design |
| `pushCooldownDays` | 28 | `M/Distributor.swift` | Design |
| `fillBase` | 0.15 (tune to 0.05 for the real Prismatic low) | `M/Distributor.swift` | Report 4.4 |
| `fillPressureWeight` | 0.35 | `M/Distributor.swift` | Report 4.4 |
| `fillRepWeight` | 0.20 | `M/Distributor.swift` | Report 4.4 |
| `fillMax` | 0.90 | `M/Distributor.swift` | Report 4.4 |
| Elite hot cases a week | 1 (in `eliteCaseOpen`) | `M/Distributor.swift` | Report 4.5 |
| `backDoorWindowDays` | 21 | `M/Distributor.swift` | Report 4.6 |
| `backDoorShelfShare` | 0.40 | `M/Distributor.swift` | Report 4.6 |
| `backDoorNoticeChance` | 0.15 | `M/Distributor.swift` | Report 4.6 |
| `backDoorMinUnits` | 10 | `M/Distributor.swift` | Design |
| `backDoorRepCost` | 15 | `M/Distributor.swift` | Report 4.6 |
| `backDoorWarningWindowDays` | 84 | `M/Distributor.swift` | Report 4.6 (12 weeks) |
| `hotFreezeDays` | 28 | `M/Distributor.swift` | Report 4.6 |
| `accountCloseDays` | 84 | `M/Distributor.swift` | Report 4.6 |
| Existing: `storeWholesaleDiscount` 0.58, `allocationBase` 1, `allocationStep` 6000, `allocationMax` 5, `hotProductRatio` 1.2, `wholesaleDiscount` 0.72, `wholesaleMinOrder` 250, `wholesaleCasesPerWeek` 2, `wholesaleShortChance` 0.12 | unchanged | `M/WholesaleAccount.swift`, `M/Wholesale.swift` | Existing |

### 8.3 Plug

| Constant | Start value | File | Basis |
|---|---|---|---|
| `plugUnlockChance` | 0.10 a day | `M/Plug.swift` | Design |
| `plugMinDay` | 14 | `M/Plug.swift` | Design |
| `plugReturnDays` | 28 | `M/Plug.swift` | Design |
| `plugMsrpShare` / `plugMarketFloor` | 0.85 / 0.65 | `M/Plug.swift` | Report 4.7 |
| `plugOffersPerWeek` | 3 (1 when pressure < 0.3) | `M/Plug.swift` | Design |
| `plugMaxOrder` | 20000 | `M/Plug.swift` | Design |
| `plugDeliveryDays` | 5...10 | `M/Plug.swift` | Report 4.7 |
| `plugVanishBase` / `Step` / `Free` / `Max` | 0.06 / 0.01 per $1,000 / $2,000 / 0.16 | `M/Plug.swift` | Report 4.7 |
| `plugVanishFloor` / `plugTrustStep` | 0.03 / 0.01 | `M/Plug.swift` | Report 4.7 |
| `plugShortChance` / `plugShortShare` | 0.10 / 0.6...0.9 | `M/Plug.swift` | Report 4.7; share is design |
| `fakeRatePlug` | 0.08 (4% after the sealed factor) | `M/Counterfeits.swift` | Report 4.7 |
| `plugSeizeChance` / `plugSeizeDays` | 0.02 / 3...14 | `M/Plug.swift` | Report 4.7; days are design |
| `plugRepLearnChance` / `Cost` / `WindowDays` | 0.10 / 20 / 28 | `M/Plug.swift` | Report 4.8; window is design |

### 8.4 Rip & Ship

| Constant | Start value | File | Basis |
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
| `ripShipWaitMinutes` / `ripShipImpatience` | 10 / 0.03 interest a minute | `M/RipShip.swift` | Design |
| `ripShipCaseMinutesPerPack` | 0.75 | `M/RipShip.swift` | Design |
| `ripShipClipFollowerShare` | 0.03 | `M/RipShip.swift` | Design |
| `ripShipDeadlineDays` | 2 | `M/RipShip.swift` | Whatnot rule, report 5.4 |
| `ripShipCancelDays` | 7 | `M/RipShip.swift` | Design |
| `ripShipShipMinutes` | 10 | `M/RipShip.swift` | Report 5.4 |
| `ripShipShipPoints` | 2 | `M/RipShip.swift` | Design |
| `ripShipKeepDays` | 28 | `M/RipShip.swift` | Design |
| `ripShipNotOpenedAuthenticity` | 0.02 | `M/RipShip.swift` | Design |
| `resealedOnStreamAuthenticity` | 0.05 | `M/RipShip.swift` | Design |
| `palmFoundChance` | 0.5 | `M/RipShip.swift` | Report 5.6 |
| `palmFoundReputation` | 40 | `M/RipShip.swift` | Report 5.6 |
| `palmBanDays` | 56 | `M/RipShip.swift` | Report 5.6 (8 weeks) |
| `palmCalloutHeat` | 90 | `M/RipShip.swift` | Report 5.6 |
| Part C: `unshippedOrder` discovery | 0.20 a day, decay 0 | `M/Callouts.swift` (Part C) | Report 5.4; Part C owns the roll |

## 9. Tests (`app/PokeVendor/Hub/GameTests.swift`)

Add a check only for a rule that moves money or items, or a rule that broke before. Add one new group, `timed("cases", casesAndDistro)`, and one new group, `timed("ripship", ripShip)`, before `timed("days", days)` (L37). Extend `days()` for the crash check. Each group calls `fresh()` (L53), which gives $20,000 and 1,200 followers.

Add these DEBUG test tools:

| Tool | File | Does |
|---|---|---|
| `testCase(_ product: Product, units: Int, fresh: Bool) -> UUID` | `M/Cases.swift` | Appends a case in hand at `units × product.market × 0.6` paid. |
| `testApproveDistributor()` | `M/Distributor.swift` | Sets `appliedDay` and `approvedDay` to today and calls `ensureRepContact()`. |
| `GameStore.forcePalmCaught: Bool?` | `M/RipShip.swift` | Forces the palm roll. |
| `GameStore.forceFill: Double?` | `M/Distributor.swift` | Replaces `hotFillRate` in `buyWholesale`. |
| `GameStore.forcePlugVanish: Bool?` | `M/Plug.swift` | Forces the vanish roll. |

### 9.1 `casesAndDistro()`

| Check | How |
|---|---|
| Case counts (3.1, the bug) | For the first catalog product of each kind, `Balance.caseSize(for:)`: ETB 10, booster bundle 25, booster pack 144, booster box 6. A 3-pack blister 24. A name with "Mini Tin" 10. A name with "Ultra-Premium" 4. `check(size == expected, "case size of \(kind) is \(size), not \(expected)")`. |
| Open conserves units and paid (3.2) | `testCase(etb, units: 10, fresh: true)`. Note the paid amount and `realMarket(of:)`. `openCase`. Check: the case is gone; exactly 10 new items with `productID == etb.id` and `caseUnits == nil`; their `paid` sum equals the case paid within $0.005; each unit `isCaseFresh` and `fake == nil`; the sum of `realMarket(of:)` of the units equals `10 × etb.market` within $0.01. |
| A resealed case gives resealed units | `testCase`, set `fake = .convincing`, open. Every unit has `fake == .convincing`. |
| Case price rule (3.3) | For a product with no `caseListings` entry: `CaseMath.market(p, units:) == p.market × units × CaseMath.factor(p)` within $0.01. For a product with an entry: equals `PriceCycle.price(real.market, p.marketFactor())`. |
| Wholesale delivers whole cases | `addReputation(400)` (Respected). Pick a non-hot offer. `buyWholesale(offer, cases: 1)`. Note cash before and after. Run `endDay()` 5 times. Check: cash fell by `offer.casePrice` (or less with a short-ship refund, and then the loose units make up the difference); the items from the order add up to `offer.caseSize` units, counting `caseUnits ?? 1`. |
| Fill rate charges only filled cases (4.4) | `testOpenCardStore` (existing), `testApproveDistributor()`, `forceFill = 0`, a hot offer (raise a product's price with the existing test tools, or pick one where `isHot`). Order 2 cases. Check: cash did not change, no item arrived, and `wholesaleLeft` fell by 2. Then `forceFill = 1`: cash falls by exactly 2 × case price. |
| Elite case skips the fill (4.5) | `addReputation(700)`, `forceFill = 0`, order 1 hot case. Check: 1 case is charged and arrives. A second hot order this week fills 0. |
| Plug tax rule (4.8) | `check(!Balance.taxableCategories.contains(.grayMarket), "plug orders count for income tax")`. |
| Plug delivery and vanish | Unlock the plug in test code. `forcePlugVanish = false`, order 1 case, advance to `arrivesDay`. Check: one case with `grayOrder == order.id` in hand; ledger has one `.grayMarket` entry of `-total`. Then `forcePlugVanish = true`, order again, advance: nothing arrives, the money stays gone, and `plugOpen == false`. |

### 9.2 `ripShip()`

| Check | How |
|---|---|
| Fee math (5.2) | `let f = store.ripShipFees(price: 100, shipping: 4.47)`. `check(abs(f.total - 11.83) < 0.005, ...)`: 8.00 + 3.03 + 0.30 + 0.50. |
| One whole product to one buyer | Add a test booster box (`addTestProduct` style). `createRipShipOrder(itemID:price: 150, buyer: "Jess", ...)`. Check: cash rose by exactly `order.net`; the item status is `.soldToViewer`; a second `createRipShipOrder` on the same item returns nil. |
| All contents go to the buyer (5.1) | Build `RipModel(items: beginRipShipRip(order.id, ripID: model.ripID))`. The model must exist first: make a `ripAll` variant that takes a `prepare: (RipModel) -> [SealedItem]`. Rip all in Sift. Call `finishRipShip`. Check: no `OwnedCard` in `data.raw` with that `ripID`; no `BulkGroup` with that `ripID`; no sealed item with `brokenFrom` equal to the box or its ID; `order.state == .ripped`; `order.cards.count + order.bulkCount` equals the count of non-Energy cards that the model saw (`model.allCards` over all packs, by summing as the loop runs). |
| An early stop ships the rest | Same, but stop after 1 pack and call `finishRipShip`. Check: `order.loosePacks.count == 35` and no loose pack is left in `data.sealed`. |
| A whole case for one buyer (5.7) | `testCase(bundle, units: 25)`. Order it. `beginRipShipRip` returns 25 units, all `.soldToViewer` with the order ID. Rip 1 unit, `finishRipShip`. Check: the 24 other units are in `order.loosePacks` and not in `data.sealed`. |
| Palm keeps exactly one card | `forcePalmCaught = false`. Rip a box for an order. Palm the best hit with `model.palm`. `finishRipShip`. Check: exactly one `OwnedCard` with that `ripID` stays in `data.raw`, its print equals the palmed print, and `order.palmed.count == 1`. |
| Palm caught: rep and ban | `forcePalmCaught = true`. Palm, `finishRipShip`, `endDay()`. Check: reputation fell by at least 40; `whatnotBanned == true`. |
| Not opened on stream: refund | Order an item, do not rip, `endDay()`. Check: cash is back to the start; the item status is nil; `order.state == .refunded`. |
| Shipping clears the order | After a rip, `shipRipShipOrders([order.id])`. Check: `state == .shipped` and the hour moved by 10 minutes. |

### 9.3 `days()` (L658-722)

Before the loop: `testApproveDistributor()`, one plug order with `forcePlugVanish = false`, one Rip & Ship order for a pack that is ripped and not shipped, and one case in the back room (`stockStore` with the fixture added). The 14 days then reach `backRoomRestock`, `ripShipEndDay` (the late act, the 7-day cancel), `distributorEndDay` (two Mondays, the back-door check), and `plugEndDay` (the arrival). After the loop, check that no order is still `.sold` and that the case count plus the unit count of the back-room product did not grow. This catches an exclusivity crash, which broke before.

Keep the run near 2 seconds. A booster box rip in Sift is about 36 packs, and the existing `boxes()` group already does one.

## 10. Interactions with existing systems, and risks

### 10.1 Case splits

Splits stay as they are: booster boxes and ETBs only, 85% of market a box, no livestream, no random assignment. Split boxes get the "case fresh" tag. A split never makes a case item, because the player owns only part of the case. The corrected `caseSizes` keep 6 and 10, so split math does not change.

### 10.2 The own store

- The hobby account waits 14 days after the build-out. During the wait the store buys at secondary terms. That slows the first month of a store. AJ approved it.
- A case never goes on the customer shelf. With the back room, cases restock the shelf by themselves. Without it, the player opens cases by hand and stocks the units.
- The back-door check counts shelf sales, units on the shelf or in the back room, vending machine stock, and units the player opened as retail. A store that lists its hot allocation online or holds it at home gets warnings. That is the intent.
- The store sealed buylist never offers a case. Walk-in sellers bring one product.

### 10.3 Vending machines

A machine takes units only (`vendableSealed` excludes cases). A machine unit from a hot allocation counts as retail for the back-door check.

### 10.4 Counterfeits

- Distributor and split cases, and their units, stay at zero fake risk.
- A stranger case rolls once for the whole case. A fake case gives fake units, so one bad case means 6 to 25 resealed boxes. That is a large loss. The tape check is the counter.
- The plug's 4% roll is per case.
- A resealed product on a Rip & Ship stream shows on camera. Whatnot refunds the buyer, and the player loses authenticity. The player cannot put a known fake up for Rip & Ship.
- Selling a known resealed product: see the contract note in 11.2 (`.sellResealed`).

### 10.5 Theft and insurance

- A car break-in takes a bag of items from `showStock` (`M/Losses.swift` L163-172). A $1,000 case in that bag would be a large loss from a 1.5% roll. Add `&& !$0.isCase` to the filter at L166: a case does not fit in a bag. A case at a show table can still be lost to the existing show events.
- Insurance claims read `realMarket(of:)`, so a case claims at its case price.
- Plug seizure is not theft. It has no claim.

### 10.6 Taxes and fees

- Rip & Ship income is a Whatnot sale. It counts for sales tax collection by the platform and for the 1099-K note (`notePlatformSale`).
- Plug orders are `.grayMarket` and never a cost for income tax. The plug refund for a short shipment is also `.grayMarket`, so it does not count as income.
- The case-fresh bonus changes sale chance, not price, so no fee changes.

### 10.7 P&L challenge (D/32)

`openCase` calls `inheritChallenge`, so units of a challenge case stay in the challenge. A Rip & Ship sale of a challenge item credits the challenge through `addReceipt(ids:)`. The ripped contents then leave Inventory, so the challenge does not count them twice.

### 10.8 Demand limit

`createRipShipOrder` calls `noteDemand(item.name, channel: .whatnot)`, so many Rip & Ship sales of one product lower its next Whatnot sale chance, as for any sale.

### 10.9 Risks

| Risk | Mitigation |
|---|---|
| A case price far from its units, from a bad real price | `cases.py` drops ratios outside 0.6 to 2.0 and prints them. |
| An old save loses its sealed items because one new field fails to decode | Every new `SealedItem` field is Optional. `DistributorAccount`, `PlugState`, and `RipShipState` have hand-written decoders. |
| An old store owner loses the account | `grandfatherDistributor` approves a store that is already built on load. |
| The app closes during a Rip & Ship rip, and the buyer's cards stay in Inventory | `ripShipEndDay` runs `finishRipShip` for any order with a `ripID` that is still `.sold`. The function is safe to run twice. |
| The ripped cards show in Inventory during the rip | They are in `data.raw` only while the rip screen is open. The rip screen hides "Keep in PC". `finishRipShip` runs on close. |
| A whole-case rip takes too long for the player | The case rip runs at 0.75 minutes a pack, and Fast mode is allowed. The sheet disables a case when the stream has too little time. |
| Rip & Ship drifts toward a group break | Section 5.0. No API sells a part of a product or pays by result. Review any later change against it. |
| The plug becomes the best source | It costs more than the hobby account, carries a 3% to 16% vanish risk, a 4% fake risk, a 2% seizure risk, and a hidden act on every order. |
| A no-store Elite player gets 3 hot cases a week from the secondary wholesaler | The Elite case adds 1 to the 2-case weekly limit for one hot product only. |

## 11. Cleanup items and contracts

### 11.1 Cleanup items in Part B files

| Item | Location | Fix |
|---|---|---|
| `caseSizes` has "Booster bundle": 12 and "Booster pack": 36 | `M/Wholesale.swift` L45 | Section 2.1: 25 and the 144-pack sleeved booster case, plus the other real counts. |
| The `buyWholesale` comment says "The minimum order is $500" | `M/Wholesale.swift` L83 | The new doc comment in 3.5 says "$250 minimum" and reads the constant. |
| D/04 and D/12 promise Elite "priority case allocation", and the code has none | `M/WholesaleAccount.swift`, D/04, D/12 | Section 3.5 builds it. Section 7 updates both docs. |
| D/04 says a Respected player with no store has "no limit" | D/04 L30-31 | Section 7 corrects it to 1 case of each product and 2 cases a week. |
| D/12 eBay "international product" | D/12 L34-36 | Section 7 rewords it, unless Part A edits that line. |

### 11.2 Contracts with Parts A and C

**HiddenActKind cases that Part B calls.** Part C already defines all six. Part B needs no new case.

| Case | Where Part B calls it | Weight | Other arguments |
|---|---|---|---|
| `.backDoorAllocation` | `backDoorCheck`, a week with shelf share under 40% | `1.5 × off-shelf share`, from 0.6 to 1.5 | none |
| `.plugPurchase` | `orderFromPlug` | order total ÷ $2,000, from 0.3 to 2.0 | `sourceID: order.id`; Part B exposes it in 2 days on a seizure |
| `.plugSeized` | `plugEndDay`, a seizure | 1.0 | `sourceID: order.id` |
| `.sellResealed` | `recordBadSale` when the item is sealed and `known` is true | sale price ÷ $100, from 0.5 to 2.0 | record it before the find-out roll, because the act is hidden even when the buyer never checks |
| `.palmedHit` | `notePalm`, when the camera did not catch it | 1.5 | `witnesses:` peak viewers, `refund: order.price`, `sourceID: order.id` |
| `.unshippedOrder` | `ripShipEndDay`, once, when an order passes 2 days | 1.0 | `contactID:` the buyer contact, `refund: order.price`, `sourceID: order.id`; retired on ship or refund |

**Part C API that Part B uses, exactly as Part C wrote it:** `recordHiddenAct(_:weight:note:witnesses:contactID:revealDay:refund:sourceID:) -> UUID`, `retireHiddenAct(_:)`, `exposeHiddenAct(_:inDays:)`, and `startCallout(.fairness, truth: true, receipts: true, heat: 90, accuser: .person(buyer), text:, refund: price)` for a palm caught on camera.

**Part B API that Part C asked for, now provided:**

- `func banFromWhatnot(days: Int, reason: String)`: extends any existing ban to the later end day.
- `func refundRipShipOrder(_ orderID: UUID, reason: RipShipRefund = .late) -> String`: Part C's "make it right" can call it with the `sourceID` of an `unshippedOrder` act. The order then refunds once, through Whatnot.
- `ripShipEndDay()` runs before `vendingEndDay()`.

**Contract changes that Part B needs.**

1. **Part C: one branch in `recordBadSale`.** Part B adds a parameter `sealed: Bool = false` to `recordBadSale` (`M/Counterfeits.swift` L321) and records `.sellResealed` there for a known sealed fake. If Part C also records `.counterfeitSold` in `recordBadSale`, make it one branch: `known && sealed` gives `.sellResealed`, `known && !sealed` gives `.counterfeitSold`. One sale must not record two acts.
2. **Part C: the late-order discovery roll.** Part C's table says `unshippedOrder` has discovery 0.20 and decay 0, and Part B runs no own roll. Part B follows that. Part B adds one direct rule that is not a callout: Whatnot cancels an order at 7 days and refunds the buyer. Part C must not also refund on that order. `refundRipShipOrder` retires the act, so no "make it right" can pay a second time.
3. **Part A: fields that Part B reads.** `data.flipperPressure: Double` (fill rate, plug offer count) and `data.rivals` with `kind == .creator` (Rip & Ship buyer share). Part C's file already uses `r.kind == .creator`, so the case name matches. Part B reads both into locals and never writes them.
4. **Part A: no change to `isHot`.** Part B keeps `isHot` (`M/WholesaleAccount.swift` L38) as the one definition of hot. If Part A adds its own hot rule, it should call this function.

## 12. Question for AJ

**Case carry space (3.6).** The report says "an ETB case uses 10 spaces, so the folding cart carries 3 ETB cases". The game already counts a loose ETB as 3 spaces and a booster box as 7. One space per unit would make a case smaller than one of its own boxes. This plan uses 1 space plus 1 for each 8 packs: an ETB case is 13 spaces (2 per cart), and a booster box case is 28 (1 per cart). Do you want this rule, or exactly 1 space per unit as the report wrote?
