# Review: Part B code proposal (cases, distributor, plug, Rip & Ship)

Reviewer: Rei (tactical review). Date: 2026-11-20.
Target: `docs/proposals/sealed-product/part-b-cases-distro-ripship.md`, read with `00-integration.md` (the integration file wins on conflict).
Code base checked: `app/PokeVendor` at `a7dd1dd` (same Swift code as `503ff3c`). `M` = `app/PokeVendor/Model`.
Ticket: none. The dispatch named no ticket, and the branch (`main`) carries no ticket ID.

## Verdict

**block** until the 3 blockers are fixed in the plan. The design is sound. The plan has 3 defects that lose money or break the Rip & Ship rule, and 10 major defects.

| Severity | Count |
|---|---|
| Blocker | 3 |
| Major | 10 |
| Minor | 22 |
| Improvements (step further) | 7 |

---

## 1. Blockers

### B1. The Rip & Ship rip is not wired to the stream. As written, the stream clock runs during the rip, and the order can refund itself mid-rip.

- **Plan:** 5.3 (`offerRipShip`, `soldRipShip`, `end()`), 5.4 (case time), 5.5 (`ripDone` snippet), 5.9 B and D.
- **Evidence:**
  - `offerRipShip` removes the item from `items`. The only rip entry, `StreamSession.ripNow` (`M/LiveStream.swift` L317-326), needs the item in `items`, so it returns nil for a sold item.
  - Nothing in the plan sets `session.ripping`. `StreamView` ticks the clock whenever `session.ripping == nil` (`Stream/StreamView.swift` L33), and `tick()` has the same guard (L167). So the stream keeps running in the background while `RipView` is on screen.
  - `ripDone(hits:)` returns at `guard let item = ripping` (L330). So a Rip & Ship rip uses no stream minutes, gets no hit interest, no tip burst, and no clip followers. The 0.75 min/pack rule (5.4) never runs.
  - The plan never clears `ripShipWaiting` when the rip starts. If the stream reaches its end during the rip, `end()` calls `refundRipShipOrder(.notOpened)` on an order that is half ripped. Then `finishRipShip` stops at `guard order.state == .sold || .ripped`, and the buyer's cards stay with the player.
  - The 5.5 snippet uses `isRipShip` and `order`. Neither exists in `ripDone`.
  - `RipModel.ripID` is `let ripID = UUID()` (`M/RipModel.swift` L35), and `RipView.init` builds the model itself (`Rip/RipView.swift` L11). So `beginRipShipRip(_:ripID:)` cannot get the ripID before the rip, as the plan admits.
- **Fix:**
  1. Add `RipModel.init(items:store:hitsOnly:ripID: UUID = UUID())` and pass it through `RipView.init(..., ripID:shipOrder:)`.
  2. Add one session call that does all the state change in one place:
     ```swift
     /// Starts the rip of the waiting order. The clock stops until ripDone.
     func startRipShipRip() -> (order: RipShipOrder, items: [SealedItem], ripID: UUID)? {
         guard let w = ripShipWaiting, let snapshot = store.data.sealed.first(where: { $0.id == w.itemID }) else { return nil }
         let ripID = UUID()
         let items = store.beginRipShipRip(w.id, ripID: ripID)
         guard !items.isEmpty else { return nil }
         ripShipWaiting = nil
         ripShipActive = w          // new: private(set) var ripShipActive: RipShipOrder?
         ripping = snapshot         // the case or box as it was, so ripDone reads its packs and isCase
         return (w, items, ripID)
     }
     ```
  3. In `ripDone`, use `let perPack = ripShipActive != nil && item.isCase ? Balance.ripShipCaseMinutesPerPack : Balance.streamRipMinutesPerPack`, run the clip line when `ripShipActive != nil`, then set `ripShipActive = nil`.
  4. `RipView` `onClose` for a ship order: call `store.finishRipShip(order.id)` first, then `onHits`. Keep that order.

### B2. A case and a loose unit of the same product stack together. The sell sheet then lists both at one price.

- **Plan:** 1.1, 2.3, 2.5 (Sealed tab rows).
- **Evidence:** `stackKey(_ s: SealedItem)` is `"\(s.productID ?? s.name)|\(s.setSlug)|\(s.pc)|\(s.status?.tag ?? "")"` (`M/GameStore.swift` L488-490). A case keeps the unit's `productID` (plan 2.3, integration 1.6). `SellSheet` builds one line for each stack, with `reference: store.realMarket(of: st.items[0])` and the IDs of every item in the stack (`Inventory/SellGradeSheets.swift` L46-49). A stack of 3 ETBs and 1 ETB case lists the $736 case at the $70 unit price, or the units at the case price. `mates(of:)` (L518-521) and the "×N in Inventory" line also mix them.
- **Fix:** Add the case size to the key: `"\(s.productID ?? s.name)|\(s.caseUnits ?? 0)|\(s.setSlug)|\(s.pc)|\(s.status?.tag ?? "")"`. Add one test: a case and a unit of one product give two different `stackKey` values.

### B3. A case bought from a show dealer arrives as one unit at the case price.

- **Plan:** 2.6 A ("the two show buy sites ... (`M/Shows.swift` L232 and L310) check `item.caseUnits`").
- **Evidence:** `buySealedAtShow` (L230-243) gets a `Product`, not a `VendorItem`. It cannot read `item.caseUnits`. The real buy path is `ShowSession.buyGoods(_ goods: VendorGoods, ...)` (`M/Shows.swift` L2021-2038). It gets only `VendorGoods`, and `.sealed(product)` has no case count. It also builds the name from `VendorItem(goods:price:market:nil).name`, so the receipt says the unit name. Other paths also drop the case: `tradeWithVendor` (L309-314, it also sets `contents = BoxContents.draw` for one unit), contact holds (`SavedItem.goods`, `M/GameStore.swift` L843-850 and `M/Relationships.swift` L480-483), and Trusted first looks.
- **Fix:** Pass the case count down the call chain: `buyGoods(_:price:from:fake:looksOff:credit:contentsKey:caseUnits: Int? = nil)` → `buySealedAtShow(..., caseUnits:)`, which calls `makeCase` when it is set. Update the view callers to pass `item.caseUnits`. Do not offer a case for a hold, a first look, or a vendor trade (filter `item.caseUnits == nil` at those sites). Do not set `contents` on a case.

---

## 2. Major findings

### M1. The plug is unreachable for most players who unlock it.

- **Plan:** 4.2 (unlock at follower tier 1 or reputation Known), 4.6 ("`PlugSection` shows at the bottom of `WholesaleView`").
- **Evidence:** The Buy screen shows the Distributor row only when `store.wholesaleOpen` (`Buy/BuyViews.swift` L30). `wholesaleOpen` is `reputationTier >= 3 || storeIsBuilt` (`M/Wholesale.swift` L61). A Known player with no store gets the "See the distributor screen" message and has no path to that screen. Report 4.7 says the plug is "for players without an account".
- **Fix:** Show the row when `store.wholesaleOpen || store.plugOpen`. Detail text when only the plug is open: "Gray market · \(name)". In `WholesaleView`, keep the "opens at Respected" empty state, and show `PlugSection` under it.

### M2. Two retail channels count as back-door sales.

- **Plan:** 3.6 (hooks), 10.2, 10.3 ("A machine unit from a hot allocation counts as retail").
- **Evidence:** `addReceipt` gets `shelf: false` by default. The vending sale calls `addReceipt(..., ids: [vend.item.id])` (`M/Vending.swift` L410), so a vended hot unit becomes `.elsewhere`. The player's own counter session sells through `store.sellAtShow` (`M/Shows.swift` L1428 → L200-202), so a counter sale in the player's own store is also `.elsewhere`. Only the clerk path (`sellFromStore`, `M/CardStore.swift` L559, L609-624) is marked as shelf.
- **Fix:** Pass `shelf: true` from the vending sale. In `sellAtShow`, pass `shelf: venue == data.cardStore?.name` (or add a `shelf:` parameter that `startCounter` sessions set). Add one test: a hot unit sold from a machine records `.shelf`.

### M3. The back-door rule almost never fires.

- **Plan:** 3.6 `backDoorCheck`, `backDoorMinUnits = 10`.
- **Evidence:** Each Monday, the check takes only the records whose 21-day window closed, removes them, and gives no verdict when they hold fewer than 10 units. A new hobby account can request 1 hot case of each product a week (`allocationBase` 1, hot +0, `M/WholesaleAccount.swift` L44-47). A booster box case is 6 units, and the fill rate is 9% to 33% (with the integration value `fillBase = 0.05`). One weekly batch reaches 10 units only for an ETB case or for 2 filled cases in the same week. A player who back-doors every booster box case never meets the rule.
- **Fix:** Judge a rolling pool. Keep records 28 days after their window closes, mark each judged record, and compute the share over all records with `deliveredDay + 21 <= today && deliveredDay + 21 > today - 28`. Lower `backDoorMinUnits` to 6 (one booster box case). Clear old records after 49 days.

### M4. A late Rip & Ship order can refund the buyer twice.

- **Plan:** 5.3 `refundRipShipOrder`, 5.8 step 3, 11.2 contract 2, integration 1.7.
- **Evidence:** `refundRipShipOrder` retires the act with `retireHiddenAct`. Part C's `retireHiddenAct` removes only acts that are not exposed: `data.hiddenActs.removeAll { $0.id == id && !$0.exposed }` (part C L213-215). Part C's "make it right" pays `c.refund`, which was set when the callout opened (part C L909-910). Path: the `unshippedOrder` act comes out on day 4 → the callout opens with `refund: order.price` → Whatnot cancels on day 7 and takes `order.net` → the player picks "make it right" and pays `order.price` again. The same path exists for a caught palm (`settlePalm` opens a callout with `refund: order.price`) when the order later also cancels.
- **Fix:** In `refundRipShipOrder`, also set the refund of any open callout whose `actID` or `sourceID` points to this order to 0, so "make it right" falls back to the goodwill amount (part C L446). Or make Part C's "make it right" call `refundRipShipOrder` first and pay `c.refund` only when that call returns an empty string. Add a test: expose the act, cancel the order, reply "make it right", and check that cash fell by the goodwill amount only.

### M5. Not shipping is a safer scam than palming.

- **Plan:** 5.3 (`.late` refund returns every card to the player), 5.6, 5.8.
- **Evidence:** A palm keeps one card, with a 50% catch for −40 reputation and an 8-week ban. A player who does not ship keeps every card of the product after day 7. The direct cost is only the fees (`addLedger(-order.net, ...)`, so the player keeps the commission loss only). The only other cost is Part C's discovery roll at 20% a day. Report 5.4 and the Blakes Breaks precedent tie unshipped orders to a platform ban.
- **Fix:** On a `.late` cancel: call `banFromWhatnot(days: 28, reason: "orders that never shipped")` (a second cancel in 56 days: 56 days), `addReputation(-Balance.ripShipLateReputation)` (design value 20), `addPoints(order.buyerContactID, -30)`, and `exposeHiddenAct(act, inDays: 0)` when the act is not yet out. Keep the card return, so the player still holds what the buyer lost.

### M6. The one-buyer lock has holes outside the stream.

- **Plan:** 5.0 ("No other sale path accepts an item with a status"), 2.3 `openCase`.
- **Evidence:**
  - `openCase` accepts `.soldToViewer` from any caller. The plan adds an "Open the case" context menu to every case row (2.5). Opening a sold case before the rip removes `order.itemID` from `data.sealed`. `beginRipShipRip` then finds no case, returns no items, and still writes the ripID. `finishRipShip` moves nothing, and the units keep `.soldToViewer` until the 7-day cancel.
  - `loosePack(_:from:)` (`M/GameStore.swift` L618-627) builds every loose pack with status nil. If the app closes during a Rip & Ship rip, the buyer's loose packs and pulled hits sit in hand with no status until End Day. The player can list them, sell them, or put them up for a second Rip & Ship (`ripShipBlock` checks only `status != nil`).
  - `discardFake` (`M/Counterfeits.swift` L304-317) does not check the status. (`setPC` already refuses an item with a status, L437.)
- **Fix:** Give `openCase` a parameter `forOrder: UUID? = nil`. Accept `.soldToViewer(id)` only when `id == forOrder`. In `loosePack`, copy the source status when it is `.soldToViewer`: `if case .soldToViewer = item.status { pack.status = item.status }`. Then `finishRipShip` finds the loose packs by status, and no other path can touch them. Add an `item.status == nil` guard to `discardFake`.

### M7. Part B still carries values and rules that the integration file overrides.

- **Plan:** 3.5, 4.2, 8.2, 11.2 item 4, 3.5 `buyWholesale`.
- **Evidence and fix:**

| Part B text | Integration rule | Fix |
|---|---|---|
| `fillBase = 0.15`, and the fill table (0.29 to 0.62) | D2: `fillBase = 0.05` | Use 0.05. New table: 0.9/0 → 0.085; 0.9/20 → 0.125; 0.5/50 → 0.325; 0.3/80 → 0.455; 0.1/100 → 0.565. |
| Wholesale unit price, plug price (`plugOffers`), case factor fallback read `msrp` | 1.4: every buy price uses `retailMSRP()` | Change the three reads. |
| 11.2 item 4: "Part B keeps `isHot` as the one definition" | 1.4: `GameStore.isHot` becomes a wrapper of `Product.isHot()` | Delete item 4. |
| `buyWholesale` replacement elides the delivery ("... the short shipment and the case delivery ...") | 1.5: missing-shipment roll after the fill and the charge | Write the full body. Do not add hot records or rep credit for a missing order. |
| `ripShipBlock` | 4.1: Rip & Ship must hide `mustRip` items | Add `if item.mustRip == true { return "Opened at the shop. Rip it yourself." }`. |

### M8. `caseSize(for:)` gives absurd cases for multi-pack "Booster pack" products and half boxes.

- **Plan:** 2.1 (`caseSize(for:)`, `wholesaleKinds`), 2.6 B, 4.2.
- **Evidence:** The catalog has kind "Booster pack" for "Booster Pack Art Bundle [Set of 4]" (4 packs), "Sleeved Booster Pack Art Bundle [Set of 4/5]", and "Fun Pack" (sampled from `Resources/catalog.json`). `caseSizes["Booster pack"] = 144` turns an art bundle into a 576-pack case near $8,000 in the weekly distributor offers and the plug offers. Kind "Booster box" includes "Half Booster Box" (18 packs) and "Enhanced Booster Box". No source gives their case counts, and the tcgcsv cache has no case SKU for a half box.
- **Fix:** In `caseSize(for:)`: `if p.kind == "Booster pack" { return p.packs == 1 && !p.name.contains("Fun Pack") ? 144 : nil }`. Return nil for "Half Booster Box". For "Enhanced Booster Box", use only a real `cases.json` row. In `wholesaleOffers` and `plugOffers`, add `CaseMath.units($0) != nil`. The old code already had this problem at 36; the plan makes it 4 times larger.

### M9. `cases.py` misses about one third of the modern cases that the game sells.

- **Plan:** 2.2 steps 2 to 6.
- **Evidence:** I ran the plan's regex and exact-name match against `tools/cardlist/cache/tcgcsv` (399 files) and `catalog.json`. 244 case SKUs match the regex. Coverage for modern products that are not store exclusives: booster box 17 of 29, ETB 20 of 29, bundle 16 of 25. The misses:
  - Variant units: "Paradox Rift Elite Trainer Box [Iron Valiant]", "Scarlet & Violet Elite Trainer Box [Koraidon]", "Mega Evolution Elite Trainer Box [Mega Gardevoir]". The one case SKU holds both arts.
  - Spellings the regex does not take: "Booster Bundle Display Case", "Sleeved Booster Pack Case", "Pokemon Center Elite Trainer Box (Exclusive) Case", "3 Pack Blister Case", "Booster Bundle Case (LGS)".
  - Null prices: "Journey Together Elite Trainer Box Case" and "Paldean Fates Elite Trainer Box Case" have no `marketPrice`.
  - Step 4 gives no unit word for "Sleeved Booster Case". The catalog has both "X Booster Pack" and "X Sleeved Booster Pack".
  - The plan's count "294 case SKUs" does not reproduce (244 by the plan regex; 387 names end in "Case" or "Display").
- **Fix:** Match a unit when `norm(unit) == norm(base + word)` or `norm(unit).startswith(norm(base + word))` and the rest is a bracket variant; write one row for each variant with the same case price. Add the 5 spellings. Strip a trailing "(LGS)" and match the "(LGS)" unit. Map "Sleeved Booster Case" to "Sleeved Booster Pack". Skip a row with no `marketPrice` and print it. The `id` in `catalog.json` is the tcgcsv product ID, and every catalog row has a `group` in `sealed_contents.json` (checked: 0 missing), so the group join works.

### M10. Five planned tests fail or flake as written, and the time note is wrong.

- **Plan:** 9.1, 9.2.
- **Evidence and fix:**

| Test | Problem | Fix |
|---|---|---|
| Fill rate charges only filled cases | A fresh hobby account can buy 1 hot case of a product (`wholesaleCap` = 1 + 0). "Order 2 cases" returns the allocation error. | Order 1, or set `data.distributor.spent = 6000` first. |
| Elite case skips the fill | Runs after the fill test in the same week. The fill test used the allocation (requests count even when unfilled). `wholesaleLeft` is 0. | `fresh()` first, or advance 7 days. |
| Palm caught: rep and ban | `fresh()` starts at reputation 0, and `addReputation` clamps at 0 (`M/Relationships.swift` L362). Reputation cannot fall by 40. | `addReputation(400)` first. |
| Plug delivery | "ledger has one `.grayMarket` entry of `-total`" flakes: 10% of deliveries add a short-shipment refund entry. The seizure roll (2%) can also fire. | Add `forcePlugShort: Bool?` and `forcePlugSeize: Bool?`, set both to false. Add a `testUnlockPlug()` tool (not in the tool table). |
| All contents go to the buyer | `ripAll` stops at 40 steps (`Hub/GameTests.swift` L66). A 36-pack box needs about 72. The rip is not complete. | Use a 9-pack ETB or a 3-pack blister, or add a step limit parameter. |
| Time note | "the existing `boxes()` group already does one" box rip is false. `boxes()` (L309-342) buys boxes and never rips one. | Use small products to keep `-test` near 2 s. |

---

## 3. Minor findings

| # | Plan section | Evidence | Fix |
|---|---|---|---|
| m1 | 1.2 | `InventoryFilter.matches` has an exhaustive `switch item.status` with no default (`Inventory/InventoryView.swift` L61-71). The plan names only `DetailViews.swift`. Compile error. | Add `case .soldToViewer: return self == .soldToViewer` and a filter case "Sold to a viewer". |
| m2 | 5.9 B | `PickMode` is switched exhaustively in `StreamPickSheet.title` (`Stream/StreamView.swift` L258-266) and in the sheet closure (L42-48). Compile error. | Add `.ripShip` to both. Make `items` and `needsPrice` handle it. |
| m3 | 2.3 | `CaseMath` is `@MainActor`. The plan calls it from `StoreOffer.title` / `market` and `VendorItem.name`, which are not isolated. Isolation error. `Product.isInPrint`, `marketFactor()`, `PriceCycle`, and `SetLibrary` are not main-actor types. | Remove `@MainActor` from `CaseMath`. |
| m4 | 4.2, 8.3 | `fakeRatePlug` is declared in the `Plug.swift` code block, and the constants table puts it in `Counterfeits.swift`. Two declarations do not compile. | One declaration, in `M/Counterfeits.swift`. |
| m5 | 1.6 | Suppliers leak into `storeRegulars` (`M/CardStore.swift` L452-458) and `meetRegulars` (`M/Meets.swift` L182-189). Neither checks `atLocalShows`, so the rep and the plug walk into the store counter and the trading circle. The planned `attendingRegulars` change is not needed: a supplier has `atLocalShows` and `atRegionalShows` false. Each new plug appends a contact (`"plug:\(today)"`) that is never removed, and contacts count toward `maxContacts` 60 (`promote` refuses new people at 60). | Add `!c.kind.isSupplier` to the two filters. Reuse one plug contact ID (`"plug"`): delete the old contact before you append the new one. |
| m6 | 2.7 | `backRoomRestock` reads `onShelf` from the snapshot `stock`. Two back-room cases of one low product both open on the same night. `openCase` drops the case's `onlineListing` with no line. | Keep `var restocked: Set<String>` of product IDs and skip a product already opened tonight. Refuse to open a case with an `onlineListing`, or end the listing with a line. |
| m7 | 5.3 | "Safe to call more than once" is false: each call adds `order.palmed.count` to `bulkCount` again. | Add the palmed count only on the `.sold → .ripped` change. |
| m8 | 5.3 | The `.late` refund must rebuild cards and bulk, but the order stores only `[CardPrint]`, `bulkCount`, and `bulkValue`. Card condition is lost, and a `BulkGroup` value comes from its card list, not a number. | Store `var cards: [OwnedCard]` and `var bulk: [BulkGroup]` in the order. Append them back on a refund. |
| m9 | 5.2 | `grossByDay` keeps refunded sales, so refunds raise the commission tier. | Subtract `order.price` from `grossByDay[order.soldDay]` in `refundRipShipOrder`. |
| m10 | 2.6 B | The eBay and Facebook case pool has no era filter and no price cap. It can list a case of 6 WOTC booster boxes or 144 vintage packs. | Pool: `Balance.modernSets + Balance.olderSets`, and `CaseMath.market(p, units:) <= Balance.strangerCaseMax` (design value $15,000). |
| m11 | 2.3 | `ShowSession.ripJustBought` spends `packs × 2` minutes before the rip (`M/Shows.swift` L1884-1892). A booster box case costs 432 minutes, then the rip guard drops it. | Return nil for a case before `spend`, and hide "Rip it now" for a case. |
| m12 | 2.5 | `SealedDetailView` for a case: the Contents box falls to `Array(repeating: item.setSlug, count: item.packs)` (`M/GameStore.swift` L615), so it lists "90 Delta Reign booster packs" and the unit promos once. `looksInside` shows one unit. "Open EV" compares one unit's EV with the case market (`Inventory/DetailViews.swift` L485-487). | For a case: show "10 × \(product.name)", hide `looksInside`, and show `EV × units`. |
| m13 | 4.4 | The seizure removes plug items with any status, also `.soldToViewer` and `.listed`, with no line for the listing or the order. Plug units in a vending machine escape the seizure. | Refund an order whose item is seized (`refundRipShipOrder`). Name the listings that end. Also remove seized units from `data.machines[].stock`. |
| m14 | 5.3 | `RipShipRefund.palmCaught` is never used. The resealed refund line inside `finishRipShip` is discarded, so the player never reads it. | Delete the case. Return the line from `finishRipShip` and show it in the rip summary or the stream chat. |
| m15 | 5.9 E | `StreamSummaryView` lists every pull as the player's pull (`Stream/StreamView.swift` L350-356). Rip & Ship hits show there too. | Keep Rip & Ship hits out of `pulls`, and show them in `RipShipSummaryBox` with "ships to \(buyer)". |
| m16 | 7 (D/17) | The plan says the decision day and the ship deadline show on the calendar, but no code adds them. | Add the two entries to the calendar builder, or drop the doc line. |
| m17 | 10.5 | A show-table thief (`lose([taken.id], event: "Someone took this from your table:")`, `M/Losses.swift`) can take a 28-space case. | Exclude cases there too, as for the car bag. |
| m18 | 3.8 | `distributorEndDay` clears `hotRecords` when the store closes, so a player can close the store to end a pending check. Trades and giveaways remove a hot unit with no outcome, so it leaves the check. | Keep the records through a close. Record `.elsewhere` in `tradeAtShow`, `tradeWithVendor`, and `giveAway` for a tracked ID. |
| m19 | 6.2 | Two rows describe forms that do not crash. `data.distributor.hotRecords += newIDs.map { ... data.day ... }` evaluates the `map` closure before the write access starts. `data.sealed.filter { }.forEach { openCase }` loops over a copy. The safe forms are fine; the stated reason is wrong. | Keep the code. Correct the reason, so a later reader does not learn a false rule. |
| m20 | many | Wrong line citations (all minor; the symbols exist): `advanceSealed` default is L1256, not L1250, and its `rollSale` call is L1234, not L1237; `RipModel.init` is L106, not L118; `forcedSpecial` is L87, not L111; `hitTier` is L105 (L127 is the `HitTier` enum); `stockable` is L335-338, not L201-204 (L201 is `storeRequirements`); `fixtureCosts` is L163; `knownContacts` is L247; `seedContacts()` call is L287; `addReceipt` has 13 call sites, not 14; the `StatusBox` switch is L39-96, not L40-60. The rip summary has no "Keep in PC" or "Add to collection" control to hide (5.9 D). | Correct the citations. |
| m21 | integration 4.2 | `storeBreakInEndDay` calls `isInStore($0.status)` unqualified. It is `static` (`M/CardStore.swift` L324). Compile error. | `Self.isInStore`. |
| m22 | 2.5 | The case label is "a white label card (`Theme.surface`, not bright white)". `Theme.surface` is near black (`Support/Support.swift` L8). | Use an off-white of about 0.78 grey for the small label. A small label is not a flash. |

---

## 4. The exclusivity trap

I read every snippet in Part B. **No snippet passes a closure to a mutating call on `data.x` that reads `data.y`.** Each `removeAll` reads only locals (`dueIDs`, `seizedGray`, `ripID`, `keptIDs`, `looseIDs`, `cutoff`). Each `firstIndex(where:)`, `contains(where:)`, and `filter` that reads `data` runs outside a mutation. `noteAllocationSold` runs inside `addReceipt`. I checked all 13 `addReceipt` call sites: none runs inside a closure on `data`, and no code passes `&data.x` as an `inout` argument (`grep "(&data\."` gives nothing). So the new write in `addReceipt` is safe.

Keep two rules for the build:
- `openCase` and `refundRipShipOrder` must never be called from inside a closure on `data.sealed` or `data.ripShip.orders`.
- B1's `startRipShipRip` reads `store.data.sealed.first { }` before it calls `beginRipShipRip`. Keep the read first.

---

## 5. Save compatibility

| Item | Result |
|---|---|
| New `SealedItem` fields (`caseUnits`, `caseFresh`, `caseChecked`, `grayOrder`, integration `mustRip`) | Safe. All Optional, and the plan adds them to `CodingKeys` (L586-589). The array decodes with `try?` (`M/GameStore.swift` L155), so a non-optional field would drop all sealed items. The plan states this rule. |
| `ItemStatus.soldToViewer(orderID:)` | Safe. An old save has no such case. |
| `DistributorAccount` | Safe with the plan's hand-written decoder. Without it, `v(.distributor, ...)` would fall back to a fresh account and lose `spent`. Old saves keep `spent`, `week`, `cases`. |
| `PlugState`, `RipShipState` | Safe (hand-written decoders, defaults). |
| `RipShipOrder`, `PlugOrder`, `HotAllocationRecord` | Safe today. They use synthesized decoders with non-optional defaults (`state`, `unitIDs`, `deliveredIDs`). A later non-optional field drops the whole order list. Add a comment: new fields must be Optional. |
| `StreamPlan.ripShipIDs: [UUID]?` | Safe. |
| `ContactKind` new raw values | Safe for old saves. |
| `Contact` (improvement 1 below) | Any new field must be Optional. `contacts` decodes as one array, and `Contact` has a synthesized decoder. |
| `Meetup.caseUnits` (2.6 B) | Not needed. `caseOffer` never sets `pickupDay`, so `buyLaterPickup` never sees a case. Delete the instruction, or add the field as Optional. |
| Wholesale boxes already arriving | Arrive as units. Correct. |
| Grandfather migration | Correct: `GameStore.init` has `var saved` (L270), and the rule needs `d.day >= store.openDay`. |

---

## 6. Rip & Ship: does every content reach the buyer?

Traced through `RipModel.openProduct` (L147-151), `startOpening` (L391-400), `openAll` (L326-375, Hits only, which the plan forbids), `GameStore.openProduct` (L632-655), and `commitPack` (L660-714):

- Promos from `openProduct` and `commitPack` go to `data.raw` with the rip's `ripID`. `finishRipShip` moves them. Correct.
- Hits go to `data.raw` with `ripID`. Bulk goes to one `BulkGroup` per `ripID` and set. Both move. Correct.
- Energy cards have no print and are dropped by `commitPack`. The test already counts non-Energy cards. Correct.
- Loose packs carry `brokenFrom` = the unit ID. `finishRipShip` finds them by `brokenFrom`. Correct, but see M6 for the status hole.
- A box that never unboxed stays as the sold item and ships as a sealed unit. Correct.
- The rip screen has no store-mutating control except "Post this pull" (`grep` of `Rip/*.swift` finds no store calls). So the buyer's cards cannot leave during the rip.
- Fee math checks: `ripShipFees(price: 100, shipping: 4.47)` = 8.00 + 3.03 + 0.30 + 0.50 = 11.83. The $100 box example (shipping 9.85) gives net $88.01. Both match Whatnot's 8% + 2.9% of (sale + shipping) + $0.30.

---

## 7. Gaps against the report

| Report | Status |
|---|---|
| 3.1 to 3.5, 3.7 | Covered. 3.5's show path is broken (B3). |
| 3.6 | The carry rule differs from the report (D1). The plan asks AJ. The back room is covered. |
| 4.1 to 4.3 | Covered. |
| 4.4 | Covered, with the wrong `fillBase` (M7). |
| 4.5 | Covered. |
| 4.6 | Covered in code, but inert for small accounts (M3), and two retail channels count against the player (M2). The report says "the share of their units that the own store shelf sells within 21 days". The plan also counts units still on the shelf, in the back room, in a machine, or opened by the player. That is a reasonable reading. State it in D/12. |
| 4.7 | Covered, but unreachable for its target player (M1). |
| 4.8 | Covered. |
| 5.1 to 5.3, 5.5 to 5.7 | Covered, with the wiring defect (B1). |
| 5.4 | Covered through Part C's 20% discovery. The cancel at day 7 needs a direct cost (M5). |

---

## 8. UI review

| Flow | Can the player see each rule and risk? | Gap and fix |
|---|---|---|
| Case opening sheet | Yes. The line before the button shows the case price, the unit total, and the premium that the open removes. No flash: rings near tiles, flaps, a slide-in banner. Reduce Motion skips the animation. | Add a confirmation when the premium lost is more than $50: "Opening loses \(money(premium)) of case premium. Open it?" The open cannot be undone. |
| Rip & Ship flow | Mostly. The fee box is live, the band caption shows, the palm dialog states the scam and the 50% catch. | During the rip, show what the buyer has got so far against the price (improvement 1). Show "Ships to \(buyer)" on the summary. Fix m15. |
| Ship queue | Yes: deadline colors, late orders first, time cost on the button. | Show what a late order costs before it happens: "Day 3: it can come out. Day 7: Whatnot cancels and bans you" (after M5). |
| Plug screen | Yes, when reachable: the vanish risk per order, the risk at $2,000, the prepay dialog. | M1. After each delivery, show "Clean orders: N. Your next $2,000 order: X% risk." |
| Application wait | Yes: the checklist, "Under review. The distributor decides on day N." | Add the calendar entry (m16). |
| Back-door rule | No. The player sees nothing until the rep notices (15%). The hidden act is silent. | Show the shelf share of the current hot pool in the rep box (improvement 2). |
| Inventory | Partly. | B2, m1, m12. |

No planned animation uses a full-screen white or bright flash. The existing pack-open light in `RipView` (L123-134) is a radial glow at the pack, not full screen. A whole-case rip in Fast mode plays it up to 216 times. Consider half opacity when `model.shipOrderID != nil`.

---

## 9. Test gaps (keep `-test` near 2 s)

Add these checks. Each one is cheap (no rip, or a 3-pack rip).

1. `stackKey` of a case and of a unit of one product differ (B2).
2. Old-save decode: encode `{"spent": 9000, "week": 3, "cases": {}}` as JSON, decode `DistributorAccount`, and check `spent == 9000` and `approvedDay == nil`. Same for `PlugState` and `RipShipState` from `{}`.
3. `openCase` on a `.soldToViewer` case with no `forOrder` returns `[]` (M6).
4. A hot unit sold from a vending machine records `.shelf` (M2).
5. Back-door verdict: with a `forceBackDoorNotice` tool, 6 hot units held in hand past 21 days give one warning, and three give the 84-day closure (M3).
6. Double refund: expose an `unshippedOrder` act, cancel the order, "make it right" pays the goodwill amount only (M4).
7. `caseSize(for:)` returns nil for an art bundle and a half booster box (M8).
8. `SetLibrary.caseListings` is empty and the game still prices a case when `cases.json` is missing (simulate with a test hook, or check `CaseMath.market` on a product with no row).
9. Rip & Ship with a 3-pack blister, not a 36-pack box, for the content checks (M10).

---

## 10. Step further: improvements inside the approved design

In priority order.

### I1. Make the buyer's rip a show: a live "buyer meter" and repeat buyers who remember.

The core trade of 5.5 is "the viewer takes the card risk". Show that risk as it plays out.

```swift
// RipModel
var shipPrice: Double?                          // set from the order
var shipValueSoFar: Double { ripValue }      // ripValue = doneValue + valueSoFar (M/RipModel.swift L130)
// TopBar chip when shipPrice != nil:
// "FOR JESS · $412 of $380"  (green when above the price, muted when below)
```

On `finishRipShip`, add one chat line by result: above 150% of the price, "\(buyer): LET'S GO"; under 50%, "\(buyer): rip...". A buyer contact who got more than the price gets a higher ceiling next time:

```swift
// Contact: Optional, so old saves decode.
var ripShipLuck: Double?      // last result / price
// soldRipShip: ceilingShare += min(0.05, max(-0.05, ((contact.ripShipLuck ?? 1) - 1) * 0.05))
```

One buyer, one product. Nothing pays by result, because the price is fixed before the rip.

### I2. Show the shelf share, and judge a rolling pool (fixes M3).

```swift
var hotShelfShare: (share: Double, units: Int) {
    let today = data.day
    let pool = data.distributor.hotRecords.filter { $0.deliveredDay + Balance.backDoorWindowDays <= today
                                                    && $0.deliveredDay + Balance.backDoorWindowDays > today - 28 }
    var retail = 0, other = 0
    for r in pool { switch allocationState(r) { case .retail?: retail += r.units; case .other?: other += r.units; case nil: break } }
    let total = retail + other
    return (total == 0 ? 1 : Double(retail) / Double(total), total)
}
```

Rep box line: "Hot product on your shelf, last 4 weeks: 62% (the rep wants 40%)." The player now sees the rule and chooses to break it.

### I3. Whatnot strikes (fixes M5, and makes the ship queue matter).

```swift
// RipShipState: var strikes: [Int] = []   (decoder: strikes = v(.strikes, []))
func addWhatnotStrike(_ reason: String) -> String {
    let today = data.day
    let recent = data.ripShip.strikes.filter { $0 > today - 56 } + [today]
    data.ripShip.strikes = recent
    if recent.count >= 2 { banFromWhatnot(days: 28 * (recent.count - 1), reason: reason) }
    return recent.count >= 2 ? "Second Whatnot strike. You are banned from streams." : "Whatnot gave you a strike."
}
```

Call it from a `.late` cancel and a `.notOpened` refund. Show the strikes in the ship queue header.

### I4. One unbox for a whole case, and a case tracker.

A 25-bundle case shows `UnboxView` 25 times (`unbox` is true for every non-pack product, `M/RipModel.swift` L109). Add `RipModel.unboxOnce: Bool`. When it is true, the first unbox opens every unit of the same product (`store.openProduct` for each `sourceID`), and the tracker shows "Unit 7 of 25 · best so far: \(name) \(money)".

### I5. Fold the tape check into the cut.

In `CaseOpenSheet` step 2, the cut follows the tape. On a stranger case that the player did not check, run `caseCheckCatches(fake, key: id.uuidString)` as the blade crosses the seam, and show the tell on the tape ("old tape under the new tape"). The rule stays the same (one check, same seed). The player learns it by touch.

### I6. A rep heads-up at Trusted standing.

At rep 60 or more, the rep sends a Sunday message with next week's hot offers. This rewards the relationship (4.3) and gives the player a plan for the push (5 points).

```swift
func wholesaleOffers(week: Int) -> [WholesaleOffer]     // move the seed to a parameter; wholesaleOffers = wholesaleOffers(week: data.day / 7)
// distributorEndDay, weekday == 6, repPoints >= 60:
//   lines.append("Your rep: next week I can get you \(names). Push early if you want more.")
```

### I7. A risk receipt on each plug order.

Show on each order row: "Risk you took: 9%. Result: delivered, 2 units short." After a vanish: "Risk you took: 14%. The plug kept \(money)." The trust ladder (clean orders lower the risk) becomes visible, and a large order feels like the gamble it is.

---

Files read for this review: `docs/proposals/sealed-product/part-b-cases-distro-ripship.md`, `docs/proposals/sealed-product/00-integration.md`, `docs/proposals/sealed-product/part-c-callouts.md` (API only), `reports/Sealed product and flipper play.md`, `research_notes/Sealed product and flipper play/cases.md`, and the Swift files cited above. Data checks ran read-only against `tools/cardlist/cache/tcgcsv/`, `tools/ppt/cache/sealed_contents.json`, and `app/PokeVendor/Resources/catalog.json`.
