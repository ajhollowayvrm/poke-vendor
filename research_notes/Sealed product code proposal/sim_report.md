# Sealed product proposal: Monte Carlo test of the tuning numbers

Date: 2026-11-20. Code base: commit `a7dd1dd`. Proposal: `docs/proposals/sealed-product/` (00-integration.md, Parts A, B, and C).

Script: `sim_sealed.py` in this folder. The script reads `app/PokeVendor/Resources/catalog.json` and the set files. It writes nothing in the repo.

## 1. Summary

The simulation ran 2,000 runs of 365 days for each strategy, with the proposal as written. It ran 2,000 more runs with the recommended values. The top problems:

1. **Almost every in-print product is "hot".** The catalog prices in-print sealed at a median 2.5 to 3.7 times MSRP. With `hotProductRatio = 1.2`, 93.9% of the big-store pool is hot on a normal day. At 5 of the 6 chains the hot limit is 1. So one legal buy of one box records `shelfBuyout`. An honest player who camps one restock a month gets 5.3 true greed callouts a year and pays $365 a year to make them right.
2. **Hot allocation is too large for a store owner.** Hot allocation grows to 5 cases of each product each week. Part B's new case sizes (144 packs, 25 bundles) make each case larger. The shop owner gets 12.3 hot cases a week (987 units) at 50% of market. The resale margin is about $604,000 a year (upper bound).
3. **An honest shop owner who uses Rip & Ship loses the account.** Part B counts a Rip & Ship sale as "elsewhere". A shop owner who sends 70% of hot stock to Rip & Ship gets a warning in 100% of runs, and the distributor closes the account in 61% of runs.
4. **Callouts can be farmed for followers.** "Gone" lines at a drained shelf give about 125 rival receipts a year. Player callouts with those receipts, counter-callouts, and kid gifts give +266 reputation and +7,000 followers a year (+140%).
5. **Palming a hit from a cheap product pays.** "Make it right" refunds only the order price. On a $5 pack, the expected money gain is +$54 for each palm. An uncaught palm becomes public in 98.7% of cases anyway.
6. **A player with a day job never buys hot product from a big-store shelf.** Vendor stock arrives Tuesday to Friday, 8:00 to 11:00. A hot item is empty about 2 hours later. The honest collector gets 0.00 shelf units a week. The flipper, who knows the slots, gets 13.9.
7. **The aggressive flipper pays a flat cost.** The flipper makes about $51,900 a year (upper bound) from 18.1 hot units a week. Three callouts stay open 362 days a year. After that, each new act costs nothing more.
8. **Smaller problems:** Pokemon Center exclusives enter Walmart and Target batches. Strictness levels 3 and 4 almost never happen. The honest player sees a false callout every 6.3 weeks, not every 8 to 10 weeks. A deny of a false callout earns +3 reputation, so false callouts are a net gain. Plug fakes are 6% per case, not 4%.

Things that work: flipper pressure moves through all bands and does not stick at a clamp. The flipper dump and the 45% cap behave as written. The Rip & Ship fee math matches Part B's example. The back-door check finds the cheater in about 10 weeks. The plug is a strict loss against the legal routes, as the report intends.

Section 6 lists the recommended values. Section 7 shows their effect.

## 2. Method

The script models the formulas of the proposal as written. Where 00-integration.md section 3 sets a value, the script uses it (`fillBase = 0.05`, D6 repeat-visit heat on a buy only, D7 an act can come out on its first night). Where a part file and the integration disagree, the integration wins (14 hidden-act kinds, `Rival.credibility`, the 30% receipt roll).

Each run has its own market: regimes, news, print changes, seasons, flipper pressure, dumps, strictness, and the MSRP step. All strategies in one run share the market, the vendor slots, and the batches, so the comparison is paired.

Start state for each strategy: reputation 200 (Trusted), 5,000 followers (tier 1), a social account, day 0 = January 1, 2029. Reputation and followers change only through the systems in the proposal. The report shows those changes.

| Strategy | Rules |
|---|---|
| Honest collector | Day job. One store run each Saturday at a random hour from 10:00 to 18:00, to 3 random big chains. Buys at most 1 unit of each hot product. Enters every free Walmart drawing. Tries every Pokemon Center drop and Target.com drop with no bot. Makes right every true callout. Denies every false callout. |
| Honest + camp | The honest collector, plus one camp of a posted restock every 28 days (time off). |
| Aggressive flipper | No job. Pays $25 a month for alerts on all chains, so knows every vendor slot. Arrives at each chain at its vendor hour, a separate trip for each chain. Makes a repeat visit 1 hour later at Walmart and Barnes & Noble (per-visit limits). Camps a posted restock when 1 or fewer vendor stops are due that day. Has the restock bot, the checkout bot, and the club. Uses the bot on every Pokemon Center drop and both Target.com attempts. Sells every unit on eBay. Stays silent on true callouts. |
| Shop owner | Store open from day 60. Applies on day 60. Approved on day 74. Secondary terms before approval. Orders every hot offer at the full cap each Monday. Pushes the rep whenever the cooldown allows. Weekly store event. 50% of hot units to the shelf (back room), 50% to Rip & Ship. Two Rip & Ship streams a week. |
| Shop owner, 70% R&S | The shop owner with 30% shelf and 70% Rip & Ship. |
| Cheater | The shop owner, but 0% shelf, 30% Rip & Ship, and 70% on eBay (the back door). Palms every big hit on Rip & Ship. Orders from the plug every 14 days (cases that fit $2,500). Sells hot in-print sealed at 1.6 times market at the own store 5 days a week (one `priceGouge` act each day). Stays silent on true callouts. |
| Farmer | The honest collector, plus: counter-callout then deny on every false rival callout, a player callout with every receipt when the cooldown allows, and a kid gift on each show day (one show day a week). |

How to run it again:

```
python3 -I sim_sealed.py --runs 2000 --json base.json
python3 -I sim_sealed.py --runs 2000 --config tuned --json tuned.json
python3 -I sim_sealed.py --runs 500 --config elite --only shop,cheater --json elite.json
python3 -I sim_sealed.py --runs 300 --config tuned --only shop --set storeWholesaleMarketFloor=0.6
```

Each 2,000-run set takes about 2 minutes on 12 cores. In the tables, `a [b, c]` is the mean with the 10th and 90th percentiles over runs.

## 3. Assumptions

### 3.1 Choices where the proposal is not clear

| # | Point | Assumption |
|---|---|---|
| A1 | The hot test reads `PriceCycle.price(baseMarket, marketFactor(day:))`. | The sim uses one sealed factor for all products: the sealed regime (boom reach 0.6, correction reach 0.2), the season with the winter scale, and the MSRP lift. Per-product walks and events do not enter the hot test. |
| A2 | "A rival already cleared this shelf" line (integration 1.3: 30% receipt chance). | One roll for each hot batch item with 0 left, on each visit, at a chain with a rival flipper. A camp bust with a rival in line also rolls. |
| A3 | Game-shop accusers have no `UUID`, but integration 1.3 deletes `rivalCredibility`. | Game shops keep their own credibility (start 1.0, floor 0.25, +0.05 a week). |
| A4 | Counter-callout and deny on the same callout. | Both are allowed on the same day. `replyBlock` blocks deny only after a deny. A deny on a false callout then ends it at no cost. |
| A5 | When a callout cannot open (3 open), the act stays hidden. | As written: it rolls again the next day. A caught palm with 3 open gets no callout (review C, M5). |
| A6 | The Rip & Ship Buy Now price. | The player asks 100% of market. Each offer draws one ceiling. After 3 failed offers the item moves to the back of the line. |
| A7 | A palm that the camera catches. | Rep −40, 56-day Whatnot ban, and a fairness callout at heat 90 with `refund = order price`. The stream ends. |
| A8 | Plug fake check on a case. | `Counterfeit.rate(.plug, sealed: true)` with the case market and the case MSRP: 0.08 × 0.5 × 1.5 = 6% when market is over 2 times MSRP. |
| A9 | Plug seizure. | The units still in hand. The cheater sells plug units evenly over 14 days. |
| A10 | Wholesale offers. | 8 seeded picks a week from in-print box, ETB, bundle, and pack products (no store exclusives), with Part B case sizes 6, 10, 25, and 144. |
| A11 | The first winter dip of a run. | The run starts on January 1, inside the dip. The lock needs "yesterday the bump was 0", so the first winter never locks. The deeper sell-off can start only in the second winter. |
| A12 | `characterSellOut` news needs a character with sealed product in its name. | Every such event passes the guard. Each hype or sell-out event adds +0.15 pressure once. |

### 3.2 Simulation values that the proposal does not set

| # | Value |
|---|---|
| S1 | Rip & Ship: 50 viewers, 180-minute streams, 2 rival creators (buyer factor 0.90), commission 8%, 3 minutes a pack. |
| S2 | Big hit chance: 1 in 20 packs. Hit values come from the in-print set files: 446 hits, 10th percentile $6.78, median $29.81, 90th percentile $131.36, mean $58.98. |
| S3 | Fake tiers on a plug case: 50% bootleg, 35% convincing, 15% professional. The buyer finds out at the existing rates 0.90, 0.60, and 0.25. |
| S4 | Sale: eBay at market on the buy day plus 7, fee 13.25% + $0.40, shipping $1.50 or $6.50 (existing values). No demand limit and no sale delay. Profit numbers are upper bounds. |
| S5 | Kid gift: a kid buyer on 70% of show days. The gift card costs $2. |
| S6 | The club pool leaves out club products with no MSRP. Review A found such items, and they make the club stronger. The club numbers here are a low bound. |
| S7 | The distributor rep relationship stays from 0 to 100. |

## 4. Results (proposal as written)

### 4.1 Flipper pressure over a year

| Band | Share of days |
|---|---|
| Few (under 0.35) | 26.0% [0.3%, 54.5%] |
| Busy (0.35 to 0.65) | 53.8% [32.9%, 73.4%] |
| Swarming (over 0.65) | 20.3% [0.0%, 48.2%] |
| At the 0.9 clamp | 0.2% [0.0%, 0.5%] |
| At the 0.1 clamp | 0.3% [0.0%, 0.8%] |
| Mean pressure | 0.48 [0.34, 0.63] |

Inputs a year: 7.2 [4, 10] hype or sell-out news events, 5.0 [2, 8] reprint starts, 1.6 [0, 3] flipper dumps. The MSRP step happens in 56% of runs.

Verdict: pressure does not stick at a clamp. The pull of 0.01 a day works. The spread between runs is wide: in 10% of runs pressure stays under 0.35 most of the year, and in 10% of runs it stays over 0.65 for about half of the year.

### 4.2 Hot units at MSRP, heat, and bans

| Strategy | Hot units a week | From shelves | From camps | Online (drawing, PC, Target.com) | Club |
|---|---|---|---|---|---|
| Honest | 0.57 [0.44, 0.69] | 0.00 [0.00, 0.00] | 0 | 0.59 (0.08, 0.31, 0.20) | 0 |
| Honest + camp | 0.90 [0.71, 1.09] | 0.00 | 0.34 [0.21, 0.48] | 0.60 | 0 |
| Flipper | 18.08 [16.70, 19.58] | 13.87 [12.31, 15.65] | 2.61 [1.94, 3.39] | 1.06 (0.08, 0.63, 0.35) | 0.89 [0.58, 1.00] |
| Shop owner, cheater | 0.08 (drawings only) | 0 | 0 | 0.08 | 0 |

Cancelled bot orders take away 0.34 units a week from the flipper. Non-bot cancellations take 0.02 from the honest player.

| Strategy | Mean global heat | Highest chain heat | Store bans a year | Runs with a ban | First ban (day) |
|---|---|---|---|---|---|
| Honest | 0.00 | 0.00 | 0 | 0% | none |
| Honest + camp | 0.66 [0.36, 0.99] | 3.55 [2.85, 4.14] | 0 | 0% | none |
| Flipper | 56.1 [51.7, 60.6] | 9.46 | 29.6 [21, 38] | 100% | 22.9 [15, 32] |

The flipper earns about $51,900 [43,700, 61,000] a year after $1,015 of fixed costs (bot, restock bot, club, alerts). This is an upper bound (S4). The flipper sale factor cuts the sale chance by only 9% on average (factor 0.91).

Why the honest player gets no shelf stock: a hot batch item has about 6 units. At pressure 0.5 the drain is 1.25 an hour. The item rounds to 0 units 2.0 hours after the vendor arrives. A day job runs 9:00 to 17:00, and the game moves a store run that overlaps work to 17:00. At 17:00 on a vendor day, the share left is 0.0006 for an 11:00 slot. A Saturday visit comes 1 to 4 days after the vendor day, and nothing is left.

### 4.3 Distributor

Hot fill rate for one requested case, over all days of all runs (formula only, no push):

| Account | Fill rate |
|---|---|
| New (rep 20) | 0.27 [0.18, 0.37] |
| Tenured (rep 100) | 0.43 [0.34, 0.53] |
| Realized by the shop owner (with push, and the secondary weeks) | 0.38 [0.32, 0.44] |

At pressure 0.9 a new account gets 0.125, near the real Prismatic Evolutions low. D2 (`fillBase = 0.05`) works as intended.

Hot volume of the shop owner: 12.31 [10.11, 14.43] hot cases a week, 987 [806, 1,175] units a week. The spend is $1.12 million a year. The eBay value is $1.73 million. The margin is $604,000 [378,000, 874,000] a year (upper bound, S4). The hobby price is `max(58% of MSRP, 50% of market)`. For hot product the 50%-of-market floor always wins, so "58% of MSRP" never applies.

Elite effect: the Elite case adds 1 hot case a week (44 in a year). With the allocation as written, it raises hot cases from 12.3 to 13.6 a week (+10%). With the recommended hot cap (section 6), it raises them from 2.4 to 3.5 a week (+44%). The cheater loses Elite within weeks, because the cheater loses about 630 reputation a year.

Back-door check:

| Strategy | Runs with a warning | Runs with a closure | First warning (day) | First closure (day) | `backDoorAllocation` acts a year |
|---|---|---|---|---|---|
| Shop owner, 50% shelf | 0% | 0% | none | none | 0 |
| Shop owner, 30% shelf, 70% R&S | 100% | 61% | 146 [105, 203] | 230 [147, 336] | 26.5 |
| Cheater, 0% shelf | 100% | 61% | 145 [105, 203] | 230 [147, 329] | 26.2 |

The account opens on day 74. The first warning comes about 10 weeks later. The closure comes about 22 weeks later. A 28-day hot freeze happens in 96% of cheater runs. The honest 70% Rip & Ship shop owner gets the same result as the cheater.

### 4.4 Plug: expected value per $1,000

Order: the full cases that fit $2,500. Sale on eBay at market. Vanish, short ship (refunded), fake cases, and seizure as in Part B.

| Product | Unit price | Order | Vanish | Fake a case | Plug EV, 0 clean orders | Plug EV, 3 clean orders | No risk at plug price | Secondary | Hobby | Retail MSRP |
|---|---|---|---|---|---|---|---|---|---|---|
| ETB, market 3.1 × MSRP | $111.80 | $2,236 | 6.2% | 6.0% | +$133 | +$167 | +$273 | +$335 | +$655 | +$1,588 |
| Booster box, 1.5 × | $157.30 | $1,888 | 6.0% | 4.0% | +$164 | +$202 | +$291 | +$353 | +$678 | +$256 |
| Bundle, 2.6 × | $45.50 | $2,275 | 6.3% | 6.0% | +$56 | +$89 | +$183 | +$240 | +$538 | +$998 |

The cheater in the full simulation spent $60,800 a year with the plug. The profit was $3,500 [−5,300, +11,100], a return of +5% [−10%, +17%]. The plug vanished 0.76 times a year. Police seized stock 0.39 times a year. Buyers found 5.5 fakes a year (rep −40 each). The rep learned of the plug 3.4 times a year (−20 rep points each).

Verdict: the plug is a strict loss against every legal route for each dollar. It is positive only as extra volume after the legal caps. With the allocation as written, a store owner already gets 12 hot cases a week and has no reason to use it.

### 4.5 Rip & Ship

Fee check (8% + 2.9% of price and buyer shipping + $0.30 + $0.50 supplies):

| Price | Product | Buyer shipping | Commission | Processing | Fees | Net | Fees as % | eBay net | TCGplayer net |
|---|---|---|---|---|---|---|---|---|---|
| $5 | 1 pack | $4.47 | $0.40 | $0.27 | $1.47 | $3.53 | 29.4% | $2.44 | $2.66 |
| $50 | ETB, 9 packs | $9.85 | $4.00 | $1.74 | $6.54 | $43.46 | 13.1% | $36.48 | $37.83 |
| $200 | Box, 36 packs | $9.85 | $16.00 | $6.09 | $22.89 | $177.11 | 11.4% | $166.60 | $171.70 |
| $100 | Part B example | $9.85 | $8.00 | $3.19 | $11.99 | $88.01 | 12.0% | $79.85 | $82.45 |

The $100 row matches Part B's example ($88.01). The math is correct. Rip & Ship nets more than eBay and TCGplayer at every price, because the buyer pays the label.

Player margin (shop owner, 2,000 runs): $18.52 [12.84, 24.97] over cost for each sale, $4.85 for each pack, $118 [82, 156] for each stream. Against selling the same product sealed on eBay, Rip & Ship gains $4.82 [3.77, 5.96] for each sale and $1.28 for each pack. Against the own shelf at market with no fee, Rip & Ship loses $6.23 for each sale. A store owner makes more from the shelf, if the shelf sells.

Buy Now price: with the hot ceiling band 0.95 to 1.20, an ask of 95% of market sells every time. An ask of 100% sells 80% of the time. An ask of 110% sells 40% of the time. The best ask is 95% of market.

Palm the hit (money only, one palm, 50 viewers, notoriety 3):

| Product the hit came from | Card kept (mean) | Caught on camera | Becomes public in all | Refund if made right | Net money if made right |
|---|---|---|---|---|---|
| Pack, $5 | $58.94 | 50% | 98.7% | $4.93 | **+$54.01** |
| ETB, $60 | $59.15 | 50% | 98.7% | $59.24 | −$0.10 |
| Box, $200 | $59.01 | 50% | 98.7% | $197.37 | −$138.37 |

A silent cheater keeps the card and pays no refund. The other costs are not money: a caught palm costs −40 reputation and a 56-day Whatnot ban. Every public palm opens a fairness callout at heat 90, which costs −12 reputation, −1% followers, and a 90-day record at fade. In the full simulation the cheater palmed 9.9 hits a year, kept $591 of cards, was caught 4.9 times, and spent 277 days a year banned from Whatnot.

### 4.6 Callouts

| Strategy | True a year | False a year | Ended cheaply | Rep lost a year | Rep lost, 99th pct | Followers lost a year (99th pct) | Make-right cash a year | Records |
|---|---|---|---|---|---|---|---|---|
| Honest | 0.00 | 8.27 [5, 11] | 100% | 0 | 0 | 0 | $0 | 0 |
| Honest + camp | 5.34 [2, 9] | 6.97 [4, 10] | 100% | 10.7 [4, 18] | 24 | 0 | $365 [140, 622] | 0 |
| Flipper | 75.3 [74, 77] | 0.24 | 71% | 290 [284, 296] | 304 | 0 | $0 (silent) | 21.5 |
| Shop owner | 0.00 | 11.0 [8, 14] | 100% | 0 | 0 | 0 | $0 | 0 |
| Shop owner, 70% R&S | 10.9 [7, 15] | 7.9 [5, 11] | 100% | 21.7 [14, 30] | 38 | 0 | $749 [460, 1,049] | 0 |
| Cheater | 45.6 [41, 50] | 4.7 [2, 7] | 91% | 632 [432, 884] | 1,164 | 239 [148, 338] (430) | $0 (silent) | 8.4 |
| Farmer | 0.00 | 6.9 [4, 10] | 100% | 0 | 0 | 0 | $0 | 0 |

"Ended cheaply": a false callout that the player can deny for free, or a true callout with a make-right cost of $100 or less.

Net reputation from replies: the honest player gains +24.8 [15, 33] a year, and the shop owner gains +33.1, because each deny of a false callout pays +3.

The honest false-callout check: 8.27 a year is one false callout every 6.3 weeks (10th to 90th percentile: every 4.7 to 10.4 weeks). Part C claims one every 8 to 10 weeks. Part C counted 3 rivals. After the integration there are 5 (3 flippers and 2 creators). The weekly random-story branch adds about 0.8 a year. A store owner also has 2 rival game shops: 11.0 a year, one every 4.7 weeks.

Saturation: the flipper and the cheater have 3 callouts open on 362 and 281 days a year. The flipper records 620 `shelfBuyout` acts but gets only 75 callouts. When 3 are open, a new act costs nothing.

Farming (the farmer strategy):

| Source | Count a year | Reputation | Followers |
|---|---|---|---|
| Player callouts with receipts | 68.5 [54, 80] | +206 | about +5,400 (estimate) |
| Counter-callout then deny | 6.9 [4, 10] | +21 (deny) | about +1,200 (estimate) |
| Kid gifts | 36.4 [32, 41] | +39.7 [22, 60] | +433 [160, 748] |
| All | | +266 [213, 310] | +7,007 [5,013, 8,787] |

The script records only the total follower gain. The split between player callouts and counters is an estimate from the follower count over the year. The farmer collects 124 receipts a year, mostly from "Gone" lines on drained shelves. The kid gift costs $73 a year in cards. Verdict: yes, both the counter-callout and the kid gift farm net reputation and followers. The player callout with a receipt is the largest farm.

### 4.7 Flipper dump and the 45% cap

Price factor of a reprinted product, by days after the reprint announcement (2,857 reprints with a dump, 7,111 without):

| Day | With a dump | Without a dump |
|---|---|---|
| 0 | 0.875 [0.835, 0.916] | 0.875 [0.834, 0.914] |
| 14 | 0.781 [0.714, 0.850] | 0.791 [0.724, 0.857] |
| 21 | 0.711 [0.631, 0.794] | 0.749 [0.669, 0.829] |
| 35 | 0.653 [0.579, 0.727] | 0.751 [0.670, 0.830] |
| 42 | 0.649 [0.576, 0.722] | 0.753 [0.671, 0.832] |
| 63 | 0.675 [0.596, 0.751] | 0.762 [0.674, 0.842] |
| 98 | 0.738 [0.638, 0.834] | 0.793 [0.687, 0.895] |
| 126 | 0.805 [0.688, 0.925] | 0.832 [0.711, 0.957] |
| 182 | 0.924 [0.812, 1.000] | 0.921 [0.803, 1.000] |
| 238 | 0.979 [0.921, 1.000] | 0.978 [0.915, 1.000] |

29% of reprints start a dump (pressure 0.6 or more the day before). The dump deepens the low from 0.749 to 0.639 on average (10th percentile 0.566). The 45% cap binds in 4.1% of dumped reprints. It is a safety rail, not a common limit. A product at 2.5 times MSRP stays hot through the low (0.64 × 2.5 = 1.6), so the dump does not end its hot status.

### 4.8 Other checks

| Check | Result |
|---|---|
| Share of the big-store pool that is hot | 93.9% [93.1%, 94.9%] |
| Days a year at strictness level 1 or more (each chain) | about 21 [0, 45] |
| Days a year at strictness level 3 or more (each chain) | 0.0 to 0.2 |
| MSRP step in a year | 56% of runs |
| Store exclusives in the batch pool | 28 of 542 products (Pokemon Center ETBs at 2.2 to 21 times MSRP) |

Level 3 (hot product by drawing) and level 4 (21-day stop) almost never occur. The chain drawings and the closure are features that nobody sees.

## 5. Problems found (ranked)

| Rank | Problem | Evidence | Kind |
|---|---|---|---|
| 1 | One legal buy of one hot box is a "shelf buyout". | 93.9% of products are hot. The hot limit is 1 at 5 of 6 chains. Honest + camp: 13.5 `shelfBuyout` acts, 5.3 true greed callouts, $365 make-right a year. Review A found the heat side. | Punishes honest play |
| 2 | Hot allocation makes the store the only strategy that matters. | 12.3 hot cases (987 units) a week at 50% of market. Margin about $604,000 a year. Hot cap grows to 5 cases a product, and Part B's 144-pack and 25-bundle cases multiply the units. | Degenerate strategy |
| 3 | Rip & Ship counts as a back-door sale. | 70% R&S shop owner: warned in 100% of runs, closed in 61%, 10.9 true callouts and $749 a year. | Punishes honest play |
| 4 | Receipts and counter-callouts farm followers. | +266 rep and +7,007 followers (+140%) a year. 124 receipts a year from "Gone" lines. | Exploit |
| 5 | Palming a cheap product's hit pays money. | +$54 a palm on a $5 pack even after "make it right". | Exploit |
| 6 | No shelf stock for a player with a job. | Honest: 0.00 shelf units a week. Flipper: 13.9. Vendor hours 8 to 11 overlap the work day, and the drain empties a hot item in 2 hours. | Feature nobody can use |
| 7 | Callouts saturate for the heavy cheater. | 3 open on 362 days. 620 acts, 75 callouts. A flat −290 rep a year. Bans close only about 10% of chain-days (29.6 bans × 7 days, over 6 chains). | Degenerate strategy |
| 8 | Store exclusives in big-store batches. | 28 Pokemon Center products at MSRP in Walmart and Target batches. | Bug |
| 9 | Strictness levels 3 and 4 never happen. | 0.0 to 0.2 days a year. | Feature nobody sees |
| 10 | False callouts are too frequent and pay reputation. | One every 6.3 weeks, not 8 to 10. Deny pays +3, so the honest player gains +25 rep a year from false claims. | Tuning |
| 11 | Plug fake rate is 6%, not 4%. | The hype factor (×1.5 over 2 times MSRP) applies to almost all hot product. | Tuning |
| 12 | The plug is weak. | +$56 to +$202 per $1,000, against +$240 to +$353 for the secondary wholesaler. The cheater's plug return is +5%. | Near-unused feature (by design) |
| 13 | The first winter never locks. | A run starts inside the dip (A11). | Minor |

## 6. Recommended value changes

### 6.1 Constants

All values below are in the tuned run (`--config tuned`).

| Constant | File | Old | New | Reason |
|---|---|---|---|---|
| `vendorHours` | `M/Retail.swift` | [8, 9, 10, 11] | [8, 10, 13, 16] | Two of four slots fall after work or late in the day. A player with a job can reach some vendor stock. |
| `vendorWeekdays` | `M/Retail.swift` | 1...4 (Tue to Fri) | 1...5 (Tue to Sat) | Some chains restock on Saturday, the day a working player shops. |
| `hotDrainBase` | `M/Retail.swift` | 0.5 | 0.2 | A hot item lasts about 5 hours, not 2. Late buyers get some stock. |
| `hotDrainPressure` | `M/Retail.swift` | 1.5 | 0.6 | Same reason. Pressure still raises the drain 2.8 times from 0.1 to 0.9, as before. |
| `storeBanDays` | `M/Flippers.swift` | 7 | 21 | A ban must cost a heavy flipper real stock. |
| `incidentChance` | `M/Retail.swift` | 0.02 | 0.05 | Level 3 and 4 then happen on about 5 days a year for each chain. |
| `strictnessDecayDays` | `M/Retail.swift` | 45 | 90 | Same reason. A strict chain stays strict for a season. |
| `rivalCalloutBase` | `M/Callouts.swift` | 0.02 | 0.008 | With 5 rivals: one false callout every 8.5 weeks, as Part C intends. |
| `calloutDenyFalseRep` | `M/Callouts.swift` | 3 | 1 | A false callout must not be a net gain. |
| receipt chance on a "rival cleared this shelf" line (integration 1.3) | `M/Rivals.swift` | 0.30 | 0.05 | Stops 124 free receipts a year. Name it `Balance.rivalReceiptChance`. |
| `playerCalloutCooldown` | `M/Callouts.swift` | 14 | 28 | Halves the player-callout rate. |
| `playerCalloutRep` | `M/Callouts.swift` | 3 | 1 | Cuts the farm. |
| `playerCalloutFollowerShare` | `M/Callouts.swift` | 0.01 | 0.005 | Cuts the farm. |
| `playerCalloutFollowerMin` | `M/Callouts.swift` | 50 | 10 | The minimum was larger than 1% for a small account. |
| `calloutCounterFollowerShare` | `M/Callouts.swift` | 0.02 | 0.005 | Counter then deny is free on a false callout. The gain must be small. |
| `fakeRatePlug` | `M/Counterfeits.swift` | 0.08 | 0.055 | Gives the report's 4% (4.1%) on hot product after the hype factor. |

### 6.2 Small rule changes (one or two lines each)

| Rule | Where | Change | Reason |
|---|---|---|---|
| R1 | `notePurchase` (Part A 1.2) | Keep the +1 heat on every hot buy at the limit. Record the `shelfBuyout` act only when the limit was 2 or more hot units (the player took 2 or more of the product, or used up Walmart's 5). | One box is not "clearing a whole shelf". Heat still bans the frequent buyer. In a 150-run test, a constant-only fix (`shelfBuyout.discovery` 0.020 → 0.006, with the tuned shelf access and `heatKeep` 0.97) still gave the honest player 4.7 true callouts a year. |
| R2 | `Market.batch` (Part A 1.1) | Add `!$0.isStoreExclusive` to the pool filter. | Removes Pokemon Center exclusives from Walmart and Target. |
| R3 | `wholesaleCap` (Part B 3.5) | Hot product stays at `allocationBase` (1 case a week). Only other product grows to `allocationMax`. | Cuts hot cases from 12.3 to 2.4 a week. |
| R4 | `addReceipt` call in `createRipShipOrder` (Part B 5.3) | Pass `shelf: true` (or mark the record `.opened`). | A Rip & Ship rip opens the product in the store's name. It is not a back-door sale. |
| R5 | `notePalm` and `settlePalm` (Part B 5.6) | Set the act and callout `refund` to the order price plus the palmed card's market. | "Make it right" must return the card's value. |
| R6 | `startCallout` (Part C 2.3), not simulated | When 3 callouts are open, add the new act's start heat to the open callout of the same type, or use review C's `force` flag for palms, fakes, and `revealDay` acts. | Removes the free marginal act after saturation. |

### 6.3 Options for AJ (not in the tuned run)

| Constant | Old | New | Effect |
|---|---|---|---|
| `storeWholesaleMarketFloor` (hot product) | 0.5 | 0.6 | With R3, the shop owner's hot margin falls from $120,500 to $76,800 a year (300 runs). |
| `plugMarketFloor` | 0.65 | 0.55 | Plug EV rises to +$245 to +$396 per $1,000, close to the secondary wholesaler. Use it if the plug must be a real choice for a player with no store. |
| `kidGiftStory` | 0.25 | 0.15 | The kid gift farm falls by 40% (the gain is linear in this value). A minimum gift value would also stop $2 gifts. |

### 6.4 Not changed

- `hotProductRatio` stays 1.2. A higher value (2.5 gives 54% hot) would move half the products to the cold drain, and cold products at 1.2 to 2.5 times MSRP would then stay on the shelf for any flipper. The root cause is the data: in-print catalog products trade far above MSRP. R1 handles the honest side.
- Pressure constants stay. Pressure moves through all bands and does not stick.
- Dump constants and the 45% cap stay.
- Rip & Ship fees stay. They match Whatnot.

## 7. Effect of the recommended values

| Metric | As written | Tuned |
|---|---|---|
| Honest: shelf hot units a week | 0.00 | 0.75 [0.00, 1.92] |
| Honest: all hot units a week | 0.57 [0.44, 0.69] | 1.32 [0.52, 2.47] |
| Honest: false callouts a year | 8.27 (every 6.3 weeks) | 6.11 (every 8.5 weeks) |
| Honest: net rep from callouts | +24.8 | +4.6 |
| Honest: store bans a year | 0 | 0.12 (9% of runs have one ban) |
| Honest + camp: true callouts a year | 5.34 | 0.83 |
| Honest + camp: make-right cash a year | $365 | $66 |
| Flipper: hot units a week | 18.08 | 14.69 [13.10, 16.05] |
| Flipper: profit a year | $51,900 | $32,700 [26,800, 38,900] |
| Flipper: bans a year (days each) | 29.6 (7) | 26.2 (21) |
| Shop owner: hot cases a week | 12.31 | 2.42 [1.86, 2.95] |
| Shop owner: hot margin a year | $604,000 | $119,000 [63,000, 195,000] |
| Shop owner, 70% R&S: account closed | 61% | 0% |
| Cheater: account closed | 61% | 46% |
| Cheater: rep lost a year | 632 | 561 |
| Farmer: net rep / followers a year | +266 / +7,007 | +65 / +1,082 |
| Palm on a $5 pack, made right | +$54 | −$4 |
| Plug fake chance for each hot case | 6.0% | 4.1% |
| Strictness level 3+ days a year (each chain) | 0.0 to 0.2 | about 5 |
| Strictness level 1+ days a year (each chain) | about 21 | about 94 |

Side effects to know:

- With real shelf access, the honest player collects some heat at per-item chains. 9% of runs see one ban in a year. To remove it, raise `storeBanHeat` from 10 to 12 for the honest case, or accept it.
- Strictness level 1 now holds about a quarter of the year at each chain. Level 1 caps each product at 1 a day, which affects the flipper more than the honest player.
- The flipper still earns about $32,700 a year. Most of that comes from the catalog prices (problem 1), not from the proposal's rules.

## 8. Limits of this model

- No demand limit (`Demand.swift`) and no sale delay. Every profit and margin number is an upper bound.
- The hot test uses one sealed factor for all products (A1).
- Reputation and followers move only through the proposal's systems. Other game income of reputation is not in the numbers.
- The strategies are fixed rules, not an optimizer. A real player can mix them.
- The unshipped-order scam (review B, M5) and the store break-in are not modeled.
- The club numbers are a low bound (S6).
