# Review: Part A code proposal (big-box stores, flippers, rivals, heat, smaller mechanics)

Reviewer: Rei (Tactical). Date: 2026-11-20.
Plan: `docs/proposals/sealed-product/part-a-stores-flippers.md`. Overrides: `00-integration.md`.
Code: commit `a7dd1dd`. The Swift code is the same as `503ff3c` (`git diff 503ff3c a7dd1dd -- app` is empty). `M` = `app/PokeVendor/Model`.
Read-only review. No code changed.

## Summary

| Severity | Count |
|---|---|
| Blocker | 2 |
| Major | 7 |
| Minor | 24 |

The plan is careful. Most citations are correct. No snippet breaks the closure exclusivity rule. The two blockers are a compile error (actor isolation) and a batch that is not stable over days, so a bought unit can come back. The largest design problem is data: 94% of the big-store pool is "hot", so the limits, the drain, and the heat fire on almost every buy. The heat then bans a normal player in one to two weeks.

---

## 1. Blockers

### B1. `Product.retailMSRP` calls a `@MainActor` function from nonisolated code (compile error)

- **Plan:** section 1.1, "Hot and MSRP helpers". `extension Product { func retailMSRP(day:) -> Double? { msrp.map { Market.retail(...) } } }`.
- **Evidence:** `enum Market` is `@MainActor` (`M/Market.swift` L76-77). `Product` and its extensions are nonisolated (`M/SetData.swift` L46, `M/PriceCycle.swift` L444-448). The project builds in Swift 5 mode (`app/project.yml` L8). Every current caller of `Market.retail` is in a `@MainActor` context (`M/Wholesale.swift` L78, `M/Vending.swift` L241, `M/Relationships.swift` L503). A synchronous call from nonisolated code to a main-actor static method is the error "call to main actor-isolated static method 'retail' in a synchronous nonisolated context".
- **Fix:** Mark the rounding function `nonisolated`. It reads no state:
  ```swift
  // M/Market.swift L84
  nonisolated static func retail(_ x: Double) -> Double {
      x >= 5 ? x.rounded(.down) + 0.99 : (x * 100).rounded() / 100
  }
  ```
  `Product.isHot(day:)` and `PriceCycle.msrpFactor` are then nonisolated and compile.

### B2. The vendor batch is not stable over the week. A bought unit can come back.

- **Plan:** section 1.1, `Market.batch(_:vendorDay:seed:)`. The pool is `SetLibrary.catalog.filter { $0.isInPrint && ... }`. Item IDs are `"v\(vendorDay)-\(store.rawValue)-\(i)"`. `batchBought` is keyed by that ID.
- **Evidence:** `Product.isInPrint` reads today only (`M/PrintRuns.swift` L168-170, via `PriceCycle.inPrint($0)` with `day ?? today`, L76-78). The shelf rebuilds the batch on each later day from `vendorDay`, but the pool uses today's print status. A print change (`printChangeChance = 1/25` a day, `M/PrintRuns.swift` L33) inside the 7-day window changes `options`. Then `options[r.int(...)]` picks other products for the same index `i`. Result: the product that the player bought shows again under another index with a full count, and `batchBought[id]` subtracts from the wrong product. `BoxContents.shelfKey(item.id, copy:)` also gives a new product the old box key. This breaks the plan's own rule in T2: "a bought unit must never come back".
- **Fix:**
  1. Add a dated print test and use it in the batch:
     ```swift
     // M/PrintRuns.swift, extension Product
     func isInPrint(day: Int) -> Bool {
         Set(mix.map(\.slug)).allSatisfy { PriceCycle.inPrint($0, day: day) }
             || PriceCycle.productReprinted(id, slug: homeSlug, day: day)
     }
     ```
     In `Market.batch`: `$0.isInPrint(day: vendorDay)`. Do the same in `chainDrawings`.
  2. Key the item by product, not by index: `id: "v\(vendorDay)-\(store.rawValue)-\(p.id)"`. A pool change then cannot move a purchase to another product.
  3. Add one T2 line: read a batch, append a test `PrintChange` that takes one batch set out of print from yesterday, `syncMarket()`, read the batch again. The product IDs must be the same.

---

## 2. Major findings

### M1. 94% of the batch pool is hot. Heat bans a normal player in one to two weeks.

- **Plan:** sections 1.2 (`notePurchase`), 2.4, and 9 "Economy" ("five chains build heat at about 1 a week each").
- **Evidence:** I counted `Resources/catalog.json` with the batch filter (in print, `bigStoreKinds`, MSRP set, not club, `packs <= 11`): 542 products, and 512 have `market >= 1.2 × msrp`. The median ratio is 2.57. `hotProductRatio = 1.2` (`M/WholesaleAccount.swift` L23). At Target, GameStop, Best Buy, Barnes & Noble, and the club the hot limit is 1. So each hot buy "uses up the chain limit", and `notePurchase` adds `heatLimitBuy` (+1) for each product. A Target batch has 3 to 5 products. Two visits a week give up to 10 heat a week. With `heatKeep = 0.95` (about 30% decay a week), the chain heat passes `storeBanHeat = 10` in about two weeks of play that obeys every limit.
- **Effect:** the ban punishes normal play, not scalping. The heat also feeds Part C's "greed" secret at 10.
- **Fix (pick one, keep the report's +1):**
  - Add the `shelfBuyout` heat at most once per chain per day: keep `buyoutHeatDay: [String: Int]` in `RetailState` (with its decoder line) and skip the heat when `buyoutHeatDay[key] == data.day`.
  - Or add it only when the buy empties the item (`shelfLeft(item) == 0` after the buy). That matches the report's anchor, "one buyer who took a full display".
  - Rewrite the section 9 estimate from the counted share. Add a `-retailsim` check (see M5).

### M2. A Target.com order cannot be cancelled on day 3. The real bot cancellation rate falls from 35% to about 23%.

- **Plan:** section 1.5 `addDropOrder` (`rollDay = data.day + Int.random(in: 1...3)`), section 2.6 (`.arriving(daysLeft: Balance.targetDeliveryDays = 3)`), and End Day order (`retailOrdersEndDay` after `advanceSealed`).
- **Evidence:** `advanceSealed` (`M/GameStore.swift` L1247-1253) clears `.arriving` when `days <= 1`. For a buy on day D: End Day D gives 2, End Day D+1 gives 1, End Day D+2 clears the status on day D+3. `retailOrdersEndDay` then runs on day D+3 and `cancelOrder` returns nil (`case .onTheWay, .arriving` fails). One roll day in three never cancels. The Pokemon Center has 5-day delivery (`Buy/BuyViews.swift` header, `Balance.deliveryDays`), so it is safe. T4 uses `.onTheWay(daysLeft: 5)` and does not find this.
- **Fix:** `rollDay: data.day + Int.random(in: 1...max(1, min(3, deliveryDays - 1)))`. Pass `deliveryDays` into `addDropOrder`. Add a T4 line with `.arriving(daysLeft: 3)` and `rollDay = day + 2`.

### M3. One club product has no MSRP. It is never hot, so the player buys 2 a day at $30 for a $317 market.

- **Plan:** section 1.1 `Market.batch` club branch (`isClubExclusive && isInPrint`, no `msrp != nil`), section 1.7 `clubPrice`.
- **Evidence:** `catalog.json`: "Costco Scarlet & Violet 151 Zapdos ex & Alakazam ex Bundle", `msrp: null`, `packs: 8`, `market: 317.0`, `inPrint: true`. `clubPrice` gives `max(0, 8 × 3.75) = 30`. `Product.isHot` returns false when `retailMSRP` is nil. So the item is cold: limit 2 a day, no `hotPerDay`, drain 0.05 an hour (it stays all week), and no heat. That is about $570 of margin each day for a $65 membership.
- **Fix:** add `$0.msrp != nil` to the club pool. Or test hot for a club item against its price: `hot = p.market >= Market.clubPrice(p) * Balance.hotProductRatio`.

### M4. The "rival cleared this shelf" line changes state during a view render, and it blames a rival for the player's own buy.

- **Plan:** section 2.3 `soldOutLine`, used by `StoreRunView` (section 1.2 UI item 2). Integration 1.3: "Part A calls Part C's `noteRivalReceipt` ... with a 30% chance on each 'a rival already cleared this shelf' line".
- **Evidence:** the line comes from the view body. A `noteRivalReceipt` call there writes `GameStore.data` (`@Observable`) during a render, with a new random roll on every render. That gives repeated receipts and a render loop risk. Also, `soldOutLine` returns the rival text for any hot item with `left == 0`, including an item that the player emptied.
- **Fix:**
  - Record the meeting in the model, once. Keep `rivalShelfSeen: [String]` (item IDs, pruned with `batchBought`) in `RetailState`. In `startStoreRun`, for each non-game-shop stop, read the shelf at its arrival hour. For each hot item with `quantity == 0` that is not in the list, roll the 30% once, then call `rememberRival(.rivalTookShelf)` and `noteRivalReceipt`.
  - In `soldOutLine`, return "You took the last one." when `data.retail.batchBought[item.id] != nil`.

### M5. `-marketsim` cannot tune the new values

- **Plan:** section 1.1 ("Tune the batch sizes with `-marketsim`"), section 9, integration section 7 ("After phase 2 and phase 6, also run `-marketsim`").
- **Evidence:** `-marketsim` (`Hub/HubView+Debug.swift` L189-206) sets `store.data.day` and calls `syncMarket()` every 30 days. It never calls `endDay()` or any End Day hook. So pressure, dumps, the MSRP step, the winter lock, strictness, and the batches never run in it.
- **Fix:** add a `-retailsim` branch next to it:
  ```swift
  if args.contains("-retailsim") {
      store.startRun()
      var dumps = 0, steps = 0, hotLeft = 0.0
      for _ in 0..<1_095 {
          store.data.day += 1; store.syncMarket()
          dumps += store.flippersEndDay().filter { $0.contains("dumping") }.count
          store.resetRetailDay()
          if store.data.retail.msrpStepDay == store.day { steps += 1 }
          let w = store.shelf(at: .walmart, hour: store.vendorSlot(.walmart).hour + 1)
          hotLeft += Double(w.filter(\.hot).reduce(0) { $0 + $1.quantity })
          if store.day % 30 == 0 { print("RETAILSIM \(store.day) p=\(store.data.flipperPressure) dumps=\(dumps) steps=\(steps) hot@+1h=\(hotLeft / 30)"); hotLeft = 0 }
      }
      fflush(stdout)
  }
  ```

### M6. A drawing win can end the run on the 1st of the month

- **Plan:** section 1.4 `resolveDrawing`, called from `retailOrdersEndDay` (integration step 8).
- **Evidence:** `retailOrdersEndDay` runs before rent in `endDay()`. Rent is at `M/GameStore.swift` L1175-1185. If the player cannot pay rent and `coverWithLine` fails, `data.gameOver` is set (L1183). `resolveDrawing` takes the price only with `canAfford(entry.price)`. A free entry with an 8% win can take the rent money that night and end the run.
- **Fix:** keep rent safe in the check:
  ```swift
  let reserve = GameCalendar.isFirstOfMonth(data.day) ? rentNow : 0
  guard canAfford(entry.price + reserve) else { return "...The win went to the next name." }
  ```
  Add a T5 line: on a 1st, with cash = rent + price − 1, a win takes nothing.

### M7. Integration 1.5 names a constant that does not exist, with the wrong meaning

- **Plan:** integration 1.5 step 2: `registerMissingShipment(name:, refund:, dueIn: Balance.missingRefundDays)`. Part A section 3.3 defines `wholesaleMissingRefundDays` (14), and `dueIn` is the delay before the player learns of the loss.
- **Evidence:** Part A `registerMissingShipment` sets `noticeDay = day + dueIn` and `refundDay = noticeDay + wholesaleMissingRefundDays`. Part A passes `Balance.wholesaleDeliveryDays` (`M/Wholesale.swift` L44). The integration file wins on conflict, so a coder who follows it gets a compile error. If the coder maps it to `wholesaleMissingRefundDays`, the notice comes at day 14 and the refund at day 28.
- **Fix:** change integration 1.5 to `dueIn: <Part B delivery days for the order>`. Leave the refund delay inside `registerMissingShipment`.

---

## 3. Minor findings

### Wrong or loose citations and facts (item 1)

| # | Plan text | Real code | Fix |
|---|---|---|---|
| m1 | 3.1 / 2.3: `makeVisitor()` "after L1204, before L1205" | The code with `top`, `line`, `type`, `item` is `makeBuyer` (`M/Shows.swift` L1143). The `vintageFan` line is L1205, `top = max(0.25, top)` is L1206. | Name `makeBuyer`, L1205-1206. |
| m2 | 3.1: `ShowSession.init` "(L816-817)" for `bring` | `stock` is L816, `bring` is L818. | L818. |
| m3 | 1.2 UI / 2.3: `CampView` intro "L94", row "L105", buy "L117", texts "L94-95" | Intro texts L91-93, row text L106, buy button L111 (`Hub/OpportunityView.swift`). | Update. Note: `haul.store.rawValue` at L92, L93, L111 all break when `CampHaul.store` becomes Optional. List all three. |
| m4 | 3.3: short block "L93-99", loop "L100-105", short refund "L97" | `buyWholesale` starts L85. Short block L95-101, refund L99, loop L102-107. | Update. |
| m5 | 2.6: `purchase(_:)` "L170-190", `OfferRow` "L193-245" | `purchase` L175-193, `OfferRow` L196 on (`Buy/BuyViews.swift`). | Update. |
| m6 | 1.2 Interactions: "GameTests L333 uses it" | The `ShelfItem(...)` call is L332. | L332. |
| m7 | 0.3 note: "`JSONEncoder` writes an `[Int: Double]` dictionary as a flat array of keys and values" | Swift encodes `Int`-keyed dictionaries as a keyed container. JSON gets an object with string keys (`"12": 0.5`). Only non-`String`/`Int` keys use the flat array. | Correct the note. The code works. |
| m8 | 1.1 note: "Catalog MSRPs already end in `.99` or are under $5 ... the price does not change before the step" | 282 of 1,771 products with an MSRP do not end in `.99` (for example booster boxes at 161.64, bundles at 26.94). `retailMSRP` moves them before any step, and the wholesale base moves with them. | Round only after the step: `let f = PriceCycle.msrpFactor(day:); return f == 1 ? msrp : msrp.map { Market.retail($0 * f) }`. |

All other cited lines that I checked are correct: `GameStore.swift` L140, L144-235, L233, L249, L287, L295, L539, L749-759, L767-801, L1106-1207, L1131-1145, L1234, L1426-1440; `LocalStores.swift` L4-22, L97-122; `Camping.swift` L14-20, L39-104; `Market.swift` L102, L119-123; `PriceCycle.swift` L7-40, L161-198, L405-426, L453-458, L476-505; `Seasons.swift` L71-74; `Upgrades.swift` L5-47, L198-207, L234-239; `WholesaleAccount.swift` L38-41; `Wholesale.swift` L45, L78; `Shows.swift` L20-38, L83-103, L144-155, L719, L790-829, L881-884; `AppNav.swift` L4-38, L85-115; `HubView.swift` L70-71, L197-209; `UpgradesView.swift` L46-57; `DetailViews.swift` L481-494; `LateGame.swift` L35-55; `Demand.swift` L44-49; `Haggling.swift` L170-175; `Balance.swift` L77-80.

### Save compatibility (item 2)

- **m9. The save test does not see a broken nested decoder.** `RetailState.init(from:)` lists each field by hand. Integration adds `gougeDay` (1.2) and `ripHereWeek` (4.1) to it. A missed line loads the default with no error, because `v()` uses `try?` (`M/GameStore.swift` L148-150). `seasonsAndSave` (`Hub/GameTests.swift` L620-626) compares only `raw`, `sealed`, and `shorts`. **Fix:** before the encode, set non-default values in `retail` (one entry in each dictionary and array, `msrpStepDay`, `alertTier`) and seed rivals with memory. Then check `loaded.retail == store.data.retail && loaded.rivals == store.data.rivals && loaded.flipperPressure == store.data.flipperPressure`. `RetailState` and `Rival` are `Hashable`, so `==` exists.
- **m10. First End Day after the update moves pressure and creators at once.** An old save loads `seenEvents = []` and `followerTierMark = 0`. The first `flippersEndDay` adds +0.15 for each live `sealedHype` or `characterSellOut` event (up to 3, so up to +0.45, which can pass `dumpPressure = 0.6`). The first `rivalsEndDay` posts "noticed your channel grow" for a player who already has followers. **Fix:** in `seedRivals()` (it runs once on load), also set `data.retail.seenEvents = data.marketEvents.map(\.id)` and `data.retail.followerTierMark = hasAccount ? followerTier : 0` when `data.rivals` was empty.
- Checked and correct: the four `GameData` fields decode through `v()`. `MarketEvent.products/fallDays`, `CardShow.rivalID/noInPrintSealed` are Optional `var`s, so synthesized decoding uses `decodeIfPresent`. `Rival.init(from:)` in an extension keeps the memberwise init. All dictionary keys are `String` or `Int`. No enum-keyed dictionary exists in the plan. Note: one unknown `RivalMemory.Kind` (a downgrade) throws for the whole `rivals` array, and `v()` then resets it. Acceptable, same rule as the rest of the save.

### Exclusivity (item 3)

No snippet in Part A breaks the closure rule. I checked every mutating call with a closure: `resetRetailDay`, `notePurchase`, `strictnessEndDay`, `retailOrdersEndDay`, `cancelOrder` (`removeAll { $0.id == id }` with a local), `flippersEndDay` (filters on locals, `for e in data.marketEvents` does not mutate), `startDump`, `rememberRival`/`changeRivalCredibility` (`firstIndex` is a read, then a write), `rivalsEndDay`, `heatEndDay`, `campMachine` (`removeAll` with local `suffix`), `missingShipmentsEndDay`, `lockWinterScale`, `startShowDay` insert (`pickShowRival()` binds before the write), and integration 1.2 and 4.2. `data.sealed.append(SealedItem(..., acquiredDay: data.day))` is safe: arguments are evaluated before the inout access starts, and `buyWholesale` already does the same (`M/Wholesale.swift` L102-106). The only state-write problem is the view render in M4, which is a SwiftUI problem, not a closure conflict.

### Compile problems (item 4)

- **m11. Duplicate `let due` in `retailOrdersEndDay`.** Section 1.4's block declares `let due = data.retail.drawings.filter ...`. Section 1.5's body of the same function declares `let due = data.retail.dropOrders.filter ...`. Swift rejects the redeclaration. **Fix:** `dueDrawings` and `dueOrders`.
- **m12. `isInStore` is static.** Integration 4.2 calls `isInStore($0.status)` from an instance method. The real function is `static func isInStore` (`M/CardStore.swift` L324). **Fix:** `Self.isInStore($0.status)`.
- **m13. Part C's `recordHiddenAct` returns a value.** Part C's test uses `let actID = store.recordHiddenAct(...)` (part C L1381). Part A ignores the result in `addHeat` and `cancelOrder`. **Fix:** mark it `@discardableResult` in Part C, or the build fills with warnings.
- Checked: no existing code switches exhaustively over `LocalStore` or `MarketEvent.Kind` (`grep` finds only `default:` and `where` cases at `M/PriceCycle.swift` L419-423). The new `Upgrade` case hits only `name`, `detail`, and `icon`. The memberwise inits for `ShelfItem`, `CampHaul`, `MissingShipment`, `DropOrder`, and `ChainStrictness` accept the calls in the plan.

### Logic (item 5)

- **m14. `capDump` can raise a price.** `dump < 1 ? max(1 - cap, jumps * dump) : jumps`. If two reprint waves already put `jumps` at 0.42, a dump of 0.9 returns 0.55. The price jumps up when the dump starts and down when it ends. **Fix:** `dump < 1 ? min(jumps, max(1 - Balance.flipperDumpCap, jumps * dump)) : jumps`. T7 still passes.
- **m15. The club batch uses today's MSRP.** `Market.batch` prices non-club items at `retailMSRP(day: vendorDay)`, but `clubPrice` calls `retailMSRP()` (today). On the MSRP step day the club shelf price changes in the middle of a batch. **Fix:** `clubPrice(_ p: Product, day: Int)`.
- **m16. The Pokemon Center offer ignores its day.** Section 3.4 table: `let msrp = p.retailMSRP()` inside `Market.offers(for:day:)`. **Fix:** `p.retailMSRP(day: day)`.
- **m17. Alerts can charge twice in two days, and `oneChain` accepts nil.** `subscribeAlerts` charges a full month at once, then `alertsEndDay` charges again on the 1st. A change of tier or of chain charges again. `subscribeAlerts(.oneChain, store: nil)` takes the fee and covers nothing. **Fix:** charge the first month only when `daysUntilRent > 7`, else start on the 1st. Guard `tier != .oneChain || store?.isBigStore == true`. Use `coverWithLine` as `businessCostsEndDay` does (`M/LateGame.swift` L40), for one rule for monthly costs.
- **m18. Big-store shelves are empty for the first days of a run.** `Market.batch` returns `[]` for `vendorDay < 0`. On day 0 (Monday) every big store has `batchDay < 0`. **Fix:** allow a negative vendor day (the seed accepts it: use `UInt64(bitPattern: Int64(vendorDay + 1))`). Cold leftovers then show on day 0.
- **m19. Banned shows still bring in-print sealed in from visitors.** Section 3.1 filters the player's stock and floor vendors. `makeSeller`, `makeCollectionSeller`, and `makeTrader` can still offer in-print sealed (`M/Shows.swift` L1063-1070). **Fix:** at a banned show, skip a `.sealed(p)` good with `p.isInPrint` in those three makers.
- **m20. `dumpSetsForCorrection` order is not stable on a tie.** `Dictionary(grouping:).sorted { $0.value > $1.value }` leaves ties in hash order, which changes per launch. **Fix:** sort by `(count, slug)`.

### Gaps against the report (item 6)

- **m21. Report 1.2 lists three limit kinds, including "per payment card".** `PurchaseLimit.Kind` has `none, perVisit, perSKUPerDay`. The payment-card rule exists only as strictness level 2 (`oneCheckout`). Accept it, but state it in the D/34 doc and in the decisions table, so the next reader does not look for a missing kind.
- **m22. Report 1.3 asks for a new market news kind, "restock incident".** The plan writes a report line only. The line leaves after the morning report. The player then sees only a level tag on the planner row, with no cause. **Fix:** keep the last incident text in `ChainStrictness.lastIncident: String?` (decodes as Optional) and show it under the strict chain in `FlipperMarketBox`.
- All other proposals (1.1-1.8, 2.1-2.6) and the five "More mechanics" rows assigned to Part A are present. Integration section 4 covers the other two rows.

### UI gaps (item 7)

- **m23. The player cannot see which shelf items are hot.** The row shows `limit N` and the price, but not why one item has limit 1 and drains in an hour. **Fix:** a small `HOT` capsule in `Theme.orange` on the shelf row and the camp row when `item.hot`, and a caption under the shelf: "Hot items: limit 1, they sell out within hours, and staff remember who buys them."
- **m24. State that the player cannot see.**
  - A ban that starts at a camp: `retailNotice` shows only in `StoreRunView`. `CampView` must show the same `Banner`.
  - A drop order that can still be cancelled: `SealedDetailView` shows nothing. Add a row "Pokemon Center can cancel this order until <date>" when a `DropOrder` holds the item ID.
  - A missing shipment refund: nothing shows the money that comes in 14 days. Add a Wallet row "Pending refunds" that lists each `MissingShipment` with its `refundDay`.
  - The club membership ends with no warning. Add a report line 7 days before `clubUntil`.
  - The Walmart drawing: `walmartDrawing` rebuilds its pool each day with today's `isHot()`. After entry, the screen can show a different product from the entered one. Show the entered `DrawingEntry` product when `entered(offer)`. From Thursday to Sunday show "The next drawing opens Monday", not "No drawing this week."
  - A dump on its first day: `activeMarketEvents` hides events with `factor == 1` (`M/PriceCycle.swift` L460-463), and a dump's factor at `t = 0` is 1. The report line says "dumping", but the News list is empty that day. Start the fall at `t + 1`.

### Tests (item 8)

- T1: the Walmart cold test item needs `quantity >= 6`, or `shelfLeft` stops it before the limit does.
- T3 runs in the same `fresh()` run as T1. T1 already used Target's hot limit for `hot` today, so T3's "hot buy at the limit" fails at `limitLeft` before it adds heat. Use a second hot product or call `fresh()`.
- T8 says "with `refundDay` set to the next day", but `registerMissingShipment` always sets `refundDay = noticeDay + 14`. Append a `MissingShipment(name:noticeDay:refundDay:refund:)` directly.
- Add the m9 save round-trip check, the B2 stability line, the M2 `.arriving(3)` line, and the M6 rent line. Each is one `check`. Each runs no extra End Day except M2 (one). The run stays near 2 s.
- No test covers `attemptTargetDrop` attempt gating. It moves money. Add one line: without the bot, the second attempt returns false and the cash does not change.

---

## 4. Steps further (priority order)

Each item stays inside the approved design and touches no rejected feature.

### S1. Learn the vendor slot by watching (makes arrival time a skill)

The design hides the vendor slot. Today only the $8/$25 alert shows it. Let the player learn it: a visit on the vendor day after the vendor hour shows a fresh batch. Record it, and show it on the planner row.

```swift
// RetailState: var seenSlot: [String: Int] = [:]   // weekday seen, by chain (add the decoder line)
// In startStoreRun, for each big stop:
let slot = vendorSlot(s)
if data.day % 7 == slot.weekday, arrival >= slot.hour { retail.seenSlot[s.rawValue] = slot.weekday }
// Planner detail: "Vendor day: \(GameStore.weekdays[w]) (you saw it)" when seenSlot has the chain.
```

The alert stays useful: it gives the hour and covers chains that the player has not watched.

### S2. "Wait for the vendor" at a stop

On the vendor day, when the stop arrival is before the vendor hour and within 2 hours of it, offer a button that spends the gap and reads the shelf at the vendor hour. A rival at the store (`rivalAt`) with `hostility >= 0.5` is in the aisle and takes one hot product first (`rememberRival(.rivalTookShelf)`). The player can then beat the rival by coming earlier next week. This gives the rival memory a mechanical payoff.

```swift
// StoreRunSession: var offset = 0.0  (hours added by waits; later arrivals add it)
func waitForVendor(_ store: LocalStore, arrival: Double) -> Double? {
    let slot = vendorSlot(store)
    guard data.day % 7 == slot.weekday, arrival < slot.hour, slot.hour - arrival <= 2,
          spendHours(slot.hour - arrival) else { return nil }
    return slot.hour - arrival
}
```

### S3. Heat hints, not a hidden wall

Keep the number hidden. Give a line when a chain's heat passes 60% of the ban level: "The Target cashier looks at your cart and then at you." Show it in the stop header. A player can then choose to cool off. This removes the "ban out of nowhere" feeling that M1 makes worse.

```swift
func heatHint(_ store: LocalStore) -> String? {
    (data.retail.storeHeat[store.rawValue] ?? 0) >= Balance.storeBanHeat * 0.6
        ? "The \(store.rawValue) staff seem to remember you." : nil
}
```

### S4. The player's own buyouts raise the incident chance at that chain

The report's real anchor is a viral clip of one buyer who cleared a display. Tie the ladder to the player: a `shelfBuyout` that empties an item adds a decaying boost to that chain's incident roll.

```swift
// RetailState: var incidentBoost: [String: Double] = [:]  (decoder line; decay ×0.9 a day in heatEndDay)
// notePurchase, when the buy empties a hot batch item: retail.incidentBoost[key, default: 0] += 0.03
// strictnessEndDay: Double.random(in: 0..<1) < Balance.incidentChance * pressure + (all boost for store)
// Line: "A video of a buyer who cleared the \(store) shelf went viral." when the boost was above 0.
```

### S5. Rivals change their home-store drain (deterministic)

A flipper rival should make a home store harder. Use the rival's `baseHostility`, which never changes, so the drain stays stable over days and no stock comes back.

```swift
// drainShare, hot branch:
let boost = rivalAt(store).map { 1 + Balance.rivalDrainBoost * $0.baseHostility } ?? 1   // rivalDrainBoost = 0.4
let rate = (Balance.hotDrainBase + Balance.hotDrainPressure * p) * boost
```

Do not use the live `hostility`. It moves each day, so the share for a past hour would change and a sold-out item could refill.

### S6. Show the flipper effect where the player lists

`flipperSaleFactor` cuts sales of hot in-print sealed by up to 20%, but the list sheet does not say so. Add one caption on the eBay and TCGplayer list sheets when the factor is under 1: "Flippers list this too. Sales are about \(Int((1 - f) * 100))% slower now." The player then learns to list into a dump later, or to hold for out-of-print growth.

---

## 5. Items the plan resolves that need no action

- Section 1.5 asks the coder to check `isChallengeItem` after a cancellation. No action: an item with a status cannot join the P&L challenge (`challengeBlock`, `M/Shorts.swift` L397: "The item has a status."). An `.onTheWay` or `.arriving` item is never a challenge item.
- Section 2.6 fills `StoreOffer.store` with `.amazon`. Safe: `OfferRow` reads `offer.store` only for the button title (`== .pokemonCenter`).
- Appending `.club` last keeps every `LocalStore.allCases.firstIndex` seed (`M/Camping.swift` L39, L91; `M/LocalStores.swift` L98).
