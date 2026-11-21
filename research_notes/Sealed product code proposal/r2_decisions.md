# Revision 2: cross-part decisions

The First Officer set these decisions after the three reviews and the simulation. They bind all parts. Where a review or the sim proposes something else, this file wins. The final `00-integration.md` will carry them.

Inputs: `review_part_a.md`, `review_part_b.md`, `review_part_c_integration.md`, `sim_report.md` (all in this folder).

## D-1. Buyout heat and the `shelfBuyout` act (fixes A-M1, C "honest limit buys", sim problem 1)

- A hot buy at the limit adds **no** heat by itself.
- A buy adds `heatLimitBuy` (1) and records `shelfBuyout` **only when the player's buy empties the item** at that chain, and the player bought 2 or more units of it in that visit. This matches the report example "took a full display".
- Repeat visits (`limitEvasion`), bot use (`botCheckout`), bans, and cancelled bot orders keep their heat.
- Part A shows heat warnings at 60% and 85% of `storeBanHeat` (reviewer A improvement).

## D-2. Hidden-act weights

Every caller uses Part C's weight guidance table (Part C section 1.4) and its new rows. Part A's own weights that are larger go away. `weight` is the size of the act, not the heat it adds.

## D-3. Hot allocation and back-door accounting (sim problems 2 and 3, B major)

- Hot products stay at **1 case a week** of each product on the hobby account. Only products that are not hot grow to 5.
- The back-door check counts these as retail sales on the shelf: the store shelf, the own counter, vending machines, Rip & Ship sales, and show table sales by the player. It counts only sales to an outside reseller channel (eBay, TCGplayer, Facebook lots, case sales to other people) as off-shelf.
- The check runs on a 28-day window. It needs at least `max(6, 50% of hot units delivered)` units before it judges. A new store with one case is judged too.
- The store screen shows the shelf share number (reviewer B improvement).

## D-4. One refund path for a Rip & Ship order (blocker in reviews B and C)

- `RipShipOrder` gets `refunded: Bool` and `shipped: Bool`. `refundRipShipOrder` is the only function that pays a buyer back. It does nothing when `refunded` is true.
- "Make it right" on an `unshippedOrder` callout: if the order is open and not shipped, it **ships the order now** and pays a goodwill sum of 10% of the order price (minimum $5). If the order was already refunded, "make it right" costs only the goodwill sum. It never pays the order price twice.
- The act retires when the order ships or is refunded, whether or not it is exposed. Part C's `retireHiddenAct` gains `force: Bool = false`. With `force: true` it removes an exposed act too, and it lowers the open callout's heat by half.

## D-5. Not shipping must cost more than palming (B major)

- The Whatnot cancel on day 7 is a **chargeback**. The buyer gets the refund from the player's cash. The player keeps the product or cards, so the player has bought them at the sale price.
- Each cancel gives a Whatnot strike. 2 strikes in 60 days give a 4-week Whatnot ban (`banFromWhatnot`). 3 strikes in 120 days give a permanent ban from Rip & Ship (normal Whatnot streams stay).
- The `unshippedOrder` act weight is 2.0 after the cancel.

## D-6. Palm refund (sim problem 5)

"Make it right" on a palmed hit pays the order price **plus** the market value of the palmed card, and the card leaves the player's inventory to go to the buyer.

## D-7. The open-callout cap (C major)

- A forced callout (a palm caught on camera, a public fake post, a plug seizure) always opens, past the cap.
- When the cap is full, a discovered act adds its start heat to the open callout of the same type. If none matches, it adds to the hottest open callout. It is not lost.

## D-8. Rival keys (C blocker 1)

- `enum RivalKey: Codable, Hashable { case rival(UUID), shop(LocalStore) }`. `Accuser.rival` and `RivalReceipt` and `RivalView` use `RivalKey`.
- `Rival.credibility` (Part A) holds credibility for named rivals. `CalloutState.shopCredibility: [String: Double]` holds it for game shops.
- `credibility(_ key: RivalKey)` and `loseCredibility(_ key: RivalKey, ...)` switch on the key.

## D-9. Phase 0 stubs (C blocker 2)

Phase 0 defines, with working bodies where trivial and no-op bodies elsewhere:
- Part C: `HiddenActKind` (14 cases with all values), `HiddenAct`, `recordHiddenAct`, `retireHiddenAct(_:force:)`, `exposeHiddenAct`, `startCallout` (appends to `data.callouts.open`, no settle logic), `noteRivalReceipt`.
- Part A: `Rival`, `RivalMemory`, `rival(_:)`, `rivalAt(_:)`, `rememberRival`, `changeRivalCredibility`, `adjustRivalHostility`. `seedRivals()` runs in phase 0, so rivals exist from phase 2.
- Part B: `banFromWhatnot` (sets the date), `refundRipShipOrder` (stub until phase 5).

## D-10. Rival receipts come from the model, not a view (A-M4)

- `buyShelf` and the visit start compute the rival line in the model, once a visit, and store it in the visit state. The view only reads it.
- A rival line shows only when a rival took the stock (the drain share above the player's buys), never when the player bought the last unit.
- The receipt chance is `0.05` on each such line (sim).

## D-11. Drawing wins and rent (A-M6)

A drawing win does not charge at End Day. It goes to a claim list for 2 days. The player taps "Pay and claim" on the hub. An unclaimed win lapses with no cost. This also fixes the rent risk.

## D-12. Missing shipments (A-M7)

Part A defines the constants. `registerMissingShipment(name:refund:learnIn:)`: `learnIn` is the days until the player learns that the order is lost (the normal delivery days). The refund comes `Balance.missingShipmentRefundDays` (14) after that. Integration 1.5 uses these names.

## D-13. Simulation values (all adopted)

| Constant | Old | New |
|---|---|---|
| `vendorHours` | [8, 9, 10, 11] | [8, 10, 13, 16] |
| `vendorWeekdays` | 1...4 | 1...5 |
| `hotDrainBase` | 0.5 | 0.2 |
| `hotDrainPressure` | 1.5 | 0.6 |
| `storeBanDays` | 7 | 21 |
| `incidentChance` | 0.02 | 0.05 |
| `strictnessDecayDays` | 45 | 90 |
| `rivalCalloutBase` | 0.02 | 0.008 |
| `calloutDenyFalseRep` | 3 | 1 |
| rival receipt chance | 0.30 | 0.05 |
| `playerCalloutCooldown` | 14 | 28 |
| `playerCalloutRep` | 3 | 1 |
| `playerCalloutFollowerShare` | 0.01 | 0.005 |
| `playerCalloutFollowerMin` | 50 | 10 |
| `calloutCounterFollowerShare` | 0.02 | 0.005 |
| `fakeRatePlug` | 0.08 | 0.055 |
| `kidGiftStory` | 0.25 | 0.15 |

Also: store exclusives (Pokemon Center items and other `isStoreExclusive`) never enter a big-store batch. A club item with no MSRP uses its club floor price as the MSRP for the hot test. Counter and deny cannot both run on one callout.

Not adopted (flag only): `storeWholesaleMarketFloor` 0.6, `plugMarketFloor` 0.55, `hotProductRatio` change.

## D-14. Store break-in values (C major)

`storeBreakInBase` 0.0005, `storeBreakInValueScale` 25,000, `storeBreakInMax` 0.006, cameras ×0.4. At $50k of stock and no cameras this is about 0.55 a year.

Step further: the collection policy gets an optional **store stock rider**: +0.6% of store sealed value each 28 days. With the rider, a store break-in and shoplifting pay a claim at the normal coverage and deductible.

## D-15. The opened-at-MSRP item (C major)

The item uses a new `ItemStatus.openedAtShop` in place of a `mustRip` flag. Every existing "available to sell" filter already skips items with a status, so no sell path can reach it. The rip flow accepts it. Use `standing.points >= 30` for the Regular check (`StandingLevel` is not `Comparable`).

## D-16. A test tool that runs End Day (A-M5)

Add a `-retailsim <days>` launch argument (reviewer A sketch). It plays End Day with all new hooks and prints pressure, batch fill, heat, bans, fill rates, callouts, and strictness each week. Use it to tune after phases 2, 4, and 6. `-marketsim` stays as it is.

## D-17. Step-further features adopted from the reviews

Adopt the reviewers' improvements that fit the approved design, in their priority order, at most the top 4 of each review. Each part lists what it adopted in a "Revision 2 changes" section at the top.
