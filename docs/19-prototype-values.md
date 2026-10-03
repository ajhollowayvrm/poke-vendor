# Prototype Values

The iOS app needs numbers that the design docs leave to balancing. This
doc lists each value that the app uses today. All values are starting
values. Change a value here and in `app/PokeVendor/Model/Balance.swift`
at the same time.

## Money and time

| Value | Prototype value | Design doc |
| --- | --- | --- |
| Starting cash | $500 | [08-ui-direction.md](08-ui-direction.md#1-wallet--cash-ledger) says the ledger opens with starting capital, but gives no amount |
| Day | 7 AM to 11 PM | [16-time-and-day.md](16-time-and-day.md#the-clock) |
| Work shift | Monday to Friday, 9 AM to 5 PM | [16-time-and-day.md](16-time-and-day.md#schedule) |
| Paycheck | $640, paid when the player ends a Friday | [16-time-and-day.md](16-time-and-day.md#pay) |
| Sick days | 5 each 52 weeks | [16-time-and-day.md](16-time-and-day.md#the-job-ladder) |
| Rent | $1,200 every 28 days, with a warning 3 days before | [16-time-and-day.md](16-time-and-day.md#rent) |

## Buying

| Value | Prototype value |
| --- | --- |
| Amazon | Each product is in stock on 45% of days. The price is 100% to 125% of market, or 140% to 190% of market on 30% of days |
| Hyped Reseller | Every product, every day, at 200% to 260% of market |
| Pokemon Center | A drop is live on 15% of days. The attempt succeeds at 30% (from [12-acquiring-product.md](12-acquiring-product.md#pokemon-center-drops)) |
| eBay | 8 listings each day: 4 sealed at 80% to 105% of market, 4 singles worth $3 or more at 75% to 105% of market. 20% ship from another country, with 10-day delivery and a lower price |
| Facebook Marketplace | 5 sealed listings each day at 55% to 95% of market. Half are pickups that cost 1 hour today, and half ship |
| Delivery time | From [12-acquiring-product.md](12-acquiring-product.md#where-bought-product-goes) |

**Estimated MSRP** for Pokemon Center drops. No design doc gives these
values. Check them against real prices:

| Kind | MSRP |
| --- | --- |
| Booster pack | $4.49 |
| 2-pack blister, mini tin | $9.99 |
| Booster bundle | $26.94 |
| Elite Trainer Box | $54.99 |
| Collection | $24.99 |
| Binder Collection | $29.99 |
| Premium Figure Collection | $59.99 |
| Super-Premium Collection | $119.99 |
| Premium Collection | $39.99 |
| Surprise Box | $24.99 |
| Booster box | $161.64 |

Warehouse-club products (Costco, Sam's Club) are not in Pokemon Center
drops or on local shelves.

**In print.** Only Scarlet & Violet product counts as in print. Amazon,
Pokemon Center drops, and local shelves sell only in-print product. The
Hyped Reseller, eBay, and Facebook Marketplace also sell older sets.

**Print runs.** A Base Set pack rips from the Unlimited print run only.
1st Edition and Shadowless product is not in the catalog.

**Loose pack price.** The cheapest plain booster pack of the set, not
a sleeved pack, a 1st Edition pack, a blister, or a bundle.

## Store run and game shops

| Value | Prototype value |
| --- | --- |
| Local stores | Target, Walmart, Best Buy, GameStop, Barnes & Noble, and two game shops: Cardboard Castle and Top Deck Games |
| Time for each stop | 40 minutes (from [12-acquiring-product.md](12-acquiring-product.md#local-stores-store-run-time-cost)) |
| Stock chance | 12% for a big store, 45% for a game shop, new each day |
| Shelf | 1 to 2 products at a big store, at the estimated MSRP. 1 to 3 products at a game shop, at 90% to 105% of market. Loose packs come 2 to 8 at a time, other products 1 to 2 |
| Bulk | The shop pays 50% of the bulk's market value, in store credit only |
| Display case | 6 singles worth $5 or more, at 110% of market. The case changes each week |
| Buylist and standing | From [12-acquiring-product.md](12-acquiring-product.md#standing-levels) |

In this build, the display case on a shop's own screen needs no store
run. Holds, consignment, and league night are not built.

## Selling

| Value | Prototype value |
| --- | --- |
| TCGplayer fee | 10.75% + $0.30 |
| eBay fee | 13.25% + $0.40 |
| Shipping cost | $1.00 for a single under $20, $4.75 for a single from $20, $1.50 for sealed product under $20 (a pack), $6.50 for other sealed product |
| Shipping insurance | 2% of the price, $1 minimum |
| Lost package | 1% of shipped sales. It surfaces 7 to 14 days after the sale |
| Item-not-received claim | 1.5% of shipped sales that did not get a lost package. It comes 5 to 12 days after the sale. A tracked package (price $20 or more) or an insured package wins. A plain envelope loses. A lost claim costs reputation -2 |
| Return, not as described | 2% of shipped sales. 40% when the sale has the overstated-condition flag. It comes 6 to 14 days after the sale. The player refunds the price, and on eBay also pays the return shipping. The fees do not come back. The item goes back to Inventory. With the flag, reputation -2 |
| Scam return | 1.5% of shipped sales. It comes 8 to 16 days after the sale. The platform sides with the player: eBay 30%, TCGplayer 60% for a tracked or insured order and 20% for a plain one, Whatnot 30%, social media 0%. A lost claim: refund, a worse card from the same set comes back (worth at most 15% of the price), reputation -2 |
| TCGplayer lowest listing | 90% to 99% of market, fixed for each card |
| TCGplayer sale chance | 30% each day at or under the lowest listing. The chance halves for about each 2% above it |
| eBay Buy It Now sale chance | 10% each day at market (14% for slabs and sealed). It falls as the price goes above market |
| eBay auction | 5% end with no bid. The others end near 95% of market, with a spread of about ±35% |
| Best Offer: offer chance | 12% each day at a price equal to market, for each listing with Best Offer on. The chance falls by a factor of e for each 33% above market. Follower tier 3 reach raises it |
| Best Offer: the offer | The buyer's most is 85% to 100% of market (never above the price). The first offer is 80% to 92% of that most |
| Best Offer: answers | An offer waits 2 days. One counter for each offer. The buyer says yes when the counter is at or under his most, and no above it. He answers at End Day |
| Best Offer: auto rules | Auto-accept slider 80% to 100% of the price (default 95%). Auto-decline slider 50% to 90% (default 70%) |
| Lot: buyer price | 85% of the sum of market values. The player's price slider runs from 50% to 110% of the sum |
| Lot: sale chance | Each day: (6% + 22% / (1 + average item value / $20)) × e^(−8 × (price / buyer price − 1)). Cap 50%. A $2 item gives 26%, a $20 item 17%, a $100 item 10% |
| Lot: size | At least 2 items, all in one Inventory tab. A lot ends after 28 days |

## Grading

| Company | Service | Fee | Days |
| --- | --- | --- | --- |
| PSA | Value | $25 | 45 |
| PSA | Regular | $75 | 15 |
| PSA | Express | $150 | 7 |
| CGC | Economy | $18 | 30 |
| CGC | Standard | $30 | 12 |
| CGC | Express | $65 | 5 |
| BGS | Base | $20 | 40 |
| BGS | Standard | $50 | 15 |
| BGS | Express | $100 | 7 |

**Card condition.** A pulled card gets four hidden subgrades. The
overall grade is 70% the worst subgrade and 30% the average, plus a
random spread: ±0.25 for PSA, ±0.35 for BGS, ±0.45 for CGC. PSA rounds
to a whole grade. CGC and BGS round to a half grade. A BGS card with
four 10s is a Black Label.

**Wear.** A card is Lightly Played when a corner or an edge is 8 or
less, or the surface is 7 or less. It is Moderately Played at 7 or less
(corners, edges) or 6 or less (surface). It is Heavily Played at 6 or
less (corners, edges) or 5 or less (surface). It is Damaged at 5 or
less (corners, edges) or 4 or less (surface). About 9% of cards from a
pack are Lightly Played. No card from a pack is Moderately Played or
worse.

**Condition price.** A raw card sells for a share of its Near Mint
market value (`Balance.conditionFactor`). See
[10-grading.md](10-grading.md#condition-grades).

| Condition | Share of Near Mint |
| --- | --- |
| Near Mint | 100% |
| Lightly Played | 80% |
| Moderately Played | 65% |
| Heavily Played | 45% |
| Damaged | 30% |

**Cut.** Each value is the share of the left (or top) border. The
factory spread is a normal curve around 50/50: 4.2 points for front LR,
3.2 for front TB, and 7 for each back value. About 74% of fronts get a
centering subgrade of 10.

| Front, worse side | Subgrade | Back, worse side | Subgrade |
| --- | --- | --- | --- |
| 55 or better | 10 | 65 or better | 10 |
| 57 | 9.5 | 70 | 9.5 |
| 60 | 9 | 75 | 9 |
| 62 | 8.5 | 80 | 8.5 |
| 65 | 8 | 85 | 8 |
| 70 | 7 | 90 | 7 |
| 75 | 6 | worse | 6 |
| worse | 5 | | |

| Centering tool | Cost | Front reading | Back reading |
| --- | --- | --- | --- |
| None (eyeball) | — | Words (eye error ±3) | Unknown |
| Centering ruler | $40 | Numbers ±2 | Words (eye error ±6) |
| Centering scanner | $200 | Exact | Exact |

### Graded prices

Every print has a price for each of 48 grade keys: PSA 1 to 10, and CGC
and BGS 1 to 10 in steps of 0.5. About 59,600 of the 1.66 million prices
(3.6 percent) are real sales. The script `tools/export/fill_graded.py`
fills the rest (see [10-grading.md](10-grading.md#estimated-prices)).
The numbers below are the median ratios that the script fitted to the
real prices. The app shows "est." next to an estimated price.

Median price of a grade as a multiple of the raw price, by raw price
tier. The tier uses the raw price of the card.

| Key | Under $1 | $1 to $5 | $5 to $25 | $25 to $100 | $100 and up |
| --- | ---: | ---: | ---: | ---: | ---: |
| PSA 6 | 21.55 | 4.71 | 1.32 | 0.72 | 0.71 |
| PSA 7 | 21.77 | 5.39 | 1.60 | 0.91 | 0.94 |
| PSA 8 | 21.19 | 6.25 | 1.98 | 1.04 | 1.20 |
| PSA 9 | 28.46 | 9.01 | 2.97 | 1.65 | 2.14 |
| PSA 10 | 121.33 | 33.61 | 14.29 | 8.81 | 10.98 |
| CGC 8 | 13.01 | 4.17 | 1.27 | 0.86 | 0.86 |
| CGC 8.5 | 13.86 | 4.16 | 1.53 | 0.98 | 0.94 |
| CGC 9 | 14.72 | 4.71 | 1.70 | 1.06 | 1.14 |
| CGC 9.5 | 23.69 | 6.27 | 2.24 | 1.35 | 1.25 |
| CGC 10 | 34.72 | 12.18 | 4.13 | 2.33 | 2.52 |
| BGS 8 | — | 3.38 | 1.47 | 1.22 | 1.16 |
| BGS 8.5 | 13.65 | 4.54 | 1.38 | 1.29 | 1.14 |
| BGS 9 | 22.14 | 6.17 | 1.91 | 1.62 | 1.77 |
| BGS 9.5 | 46.27 | 9.21 | 3.25 | 2.21 | 2.74 |
| BGS 10 | — | 25.51 | 14.11 | 7.17 | 3.87 |

Median price of a key as a multiple of the PSA price of the same card
and grade, by era. Vintage is the Wizards of the Coast and e-Card sets.
Classic is the EX to XY sets. Current is Sun & Moon and later.

| Pair | All | Vintage | Classic | Current |
| --- | ---: | ---: | ---: | ---: |
| CGC 10 / PSA 10 | 0.30 | 0.24 | 0.19 | 0.40 |
| CGC 9 / PSA 9 | 0.51 | 0.52 | 0.42 | 0.63 |
| CGC 8 / PSA 8 | 0.58 | 0.58 | 0.53 | 0.75 |
| BGS 10 / PSA 10 | 1.72 | — | 0.81 | 1.73 |
| BGS 9 / PSA 9 | 0.72 | 0.71 | 0.57 | 0.82 |
| BGS 8 / PSA 8 | 0.70 | 0.58 | 0.65 | 0.89 |

Median step from one grade to the next, over all prints:

| Step | Ratio |
| --- | ---: |
| PSA 10 / PSA 9 | 5.29 |
| PSA 9 / PSA 8 | 1.65 |
| PSA 8 / PSA 7 | 1.39 |
| PSA 7 / PSA 6 | 1.34 |
| CGC 10 / CGC 9.5 | 1.94 |
| CGC 9.5 / CGC 9 | 1.34 |
| BGS 10 / BGS 9.5 | 3.59 |
| BGS 9.5 / BGS 9 | 1.84 |

Median PSA 10 price as a multiple of the raw price, by era and rarity
bucket:

| Era | Bulk | Rare | Holo | Ultra | Chase |
| --- | ---: | ---: | ---: | ---: | ---: |
| Vintage | 31.5 | 16.7 | 24.0 | — | — |
| Classic | 23.9 | 36.3 | 72.9 | 31.5 | 24.0 |
| Current | 29.8 | 44.1 | 67.8 | 15.2 | 8.0 |

The script fits one ratio for each group of era, rarity bucket, and raw
price tier. A group with fewer than 30 prints uses the next wider group.
The tables show the pooled medians.

Other values:

- **A print with no real graded price** uses the lower quartile of the
  fitted raw ratio for its PSA keys. Its CGC and BGS keys use the median
  ratio to its PSA keys.
- **PSA 1 to 5** have no real data. Each grade below PSA 6 is worth the
  next grade up times a step: 0.87, 0.90, 0.83, 0.71, and 0.72 for the
  five raw price tiers. The step is the fitted PSA 6 / PSA 7 ratio, held
  between 0.6 and 0.9.
- **CGC and BGS below 8** follow the PSA ladder, times the CGC 8 / PSA 8
  or BGS 8 / PSA 8 ratio of the same card.
- **A missing raw price** (40 prints) comes from the median raw price of
  the same rarity bucket in the same set.
- **A Black Label** is worth 2 times the BGS 10 price.
- **The fallback in the app** (`fallbackGradedPrice`) is for a grade that
  a set file does not hold. It uses the PSA row of the first table by
  raw price tier, the CGC and BGS ratios to PSA at grades 8, 9, and 10,
  and a floor of $1.

## Social media

| Value | Prototype value |
| --- | --- |
| Reach | (40 + 0.35 × followers) × content quality × timing × luck, reduced by burnout and raised by authenticity |
| Content quality | From the value of the item in the post. A hot take is random, from 0.4 to 1.5 |
| Timing | A market trend from 0.6 to 1.5, new each day |
| Luck | Usually 0.6 to 1.6. A 2% chance of a breakout, 8 to 20 times the normal reach |
| Followers from a post | About 2% of the views, times (quality − 0.7). A low-quality post loses followers |
| Burnout | +0.12 for each post, +0.2 for a low-quality post, −0.1 each day |
| Authenticity | Starts at 0.7. −0.04 for each paid post, +0.02 for a pull reveal worth $50 or more, −0.15 for a missed sponsor deadline |
| Follower decay | 0.3% each day, 1% each day after 3 days with no post, and an extra 2% on 5% of days (an algorithm shift) |
| Sponsor offers | From tier 1: a 12% chance each day. The pay is 1.5% of followers for each paid post, $25 minimum, for 1 to 3 posts in 5 to 10 days. An offer goes away after 5 days |
| For-sale post | No fees, and the player pays shipping. The daily sale chance grows with followers up to 5,000 and falls as the price goes above market |
| Analytics upgrade | $150 |
| Vendor kit (needed to book a show table) | $200 |

| Production value | Studio lights ×1.25, camera kit ×1.5, on reach and on stream viewers |
| Show promo post | ×1.25 visitors at that show's table |
| Follower tier 2 | +3% on deals with strangers, and a free product from a sponsor every 28 days |
| Follower tier 3 | Sponsor deals pay 2×, and every listing sells 1.3× as often |
| Follower tier 4 | A pull reveal or a flex about a card raises its price ×1.15 for 7 days |

## Live streams

| Value | Prototype value |
| --- | --- |
| Length | 2 or 3 hours. One real second is one stream minute. A rip adds 3 minutes a pack |
| Viewers | Target (8 + 0.02 × followers) × production value × timing × luck × 1.5 when scheduled. The count moves 10% of the way to the target each minute |
| Interest | Starts at 0.6, −0.02 a minute. Talk +0.2, show a card +0.15 × log10(value + 1) / 2, giveaway +0.5, auction +0.25, rip hit +0.1/+0.3/+0.6 by tier. Chat slows under 0.25 |
| Tips | Viewers × 0.004 × (0.5 + interest) tips a minute, $1 to $5 each. A big hit adds 3 to 8 tips |
| Auction | 8 minutes, starts at 50% of market. Bidders are 3% of the viewers, each with a ceiling of market × (0.55 + 0.55 × viewers / 200) × 0.85 to 1.2 |
| Buy Now | 15 minutes. The chance a minute is viewers × 0.002, falling as the price goes above market |
| Whatnot fees | 10.9% + $0.30, and the player ships |
| Giveaway | Followers +5% of the viewers, authenticity +0.03, viewers ×1.2 |
| End | Followers +10% of the peak viewers × (0.5 + authenticity). Burnout +0.12 |
| Missed scheduled stream | Followers −2%, authenticity −0.10 |

## Meets, sales, camping, and opportunities

| Value | Prototype value |
| --- | --- |
| Meets | Trade night Wed 6:30–9 PM, park swap Sat 1–4 PM, trading circle Sun 2–5 PM (reputation Known), league night Thu 6–9 PM (+3 standing). 10 visitors, 6 at league night. 30% sellers, 60% regulars |
| Garage sales | 3 to 6 a week, Fri–Sun 7 AM–1 PM, posted 2 to 3 days ahead. 3 hours, 8 when far (30%). 6 to 20 good cards × quality 0.6–1.6, ×0.75 each hour after the doors. 15% bust. Prices 25–70% of market. The host comes up 40% of the time |
| Estate sales | 0 to 2 a week, Thu–Sat 8 AM–3 PM, 4 hours. Cards ×1.0/0.6/0.35 and prices ×1.0/0.75/0.5 by day. Prices 60–100% of market |
| Hidden sales | 60% of weeks add one. A follower tip (tier 1) reveals it 50% of the days it is 1 to 3 days out |
| Camping | 6 hours from 8 AM. 60% at the door, ×0.75 each hour late, +25% with the restock bot. 2 to 4 products, 2 to 6 each, at MSRP. A restock every 14 days per store, posted 3 days ahead |
| Opportunities | 1.5 every 28 days, 0 or 1 day of notice. A collection at 70% of market, a closeout at 60%, a private buyer at 120–150%, a free table, an estate tip, a vintage collection at Elite |

## Counterfeits

| Value | Prototype value |
| --- | --- |
| Fake rates | Reseller 4%, eBay 8%, Facebook 10%, garage sale 12%, estate sale 8%, stranger 5%, Familiar contact 2%, Regular and up 0.5%, shop case 1%. Sealed ×0.5. Vintage ×3, older ×1.5. Hyped sealed ×1.5 |
| Tiers | Bootleg 50%, convincing 35%, professional 15% |
| A look by eye | Catches 90% / 15% / 0% by tier, × the tired factor |
| Paid check | $8, 3 days |
| Authentication tool | $350. Misses a professional counterfeit 10% of the time |
| Buyer finds out | 90% / 60% / 25% by tier, +30% when the player knew, 2 to 10 days later |
| Cost | Reputation −40, the contact −20, the shop −20 standing. TCGplayer, eBay, and Whatnot refund the buyer. Public 30% + 10% per reputation tier and follower tier: followers −5%, authenticity −0.10 |
| At the table | A buyer who catches a fake walks: reputation −10, the contact −10 |
| Shop buylist | Catches 95% / 70% / 40% by tier |

## Rip modes

| Value | Prototype value |
| --- | --- |
| Stop rule | Two parts, each with its own switch: $20 by default, and the rarities picked for each set. With none picked, a hit stops the rip. Both parts off: Sift runs straight to the summary |
| Speed | Fast 0.45 seconds a card. Sift 0.08 |

## The job and late nights

| Value | Prototype value |
| --- | --- |
| Hire chance | 90% / 60% / 45% / 30% |
| Time off | 1 day every 5 / 4 / 3 / 2 weeks |
| Next job | Opens after 56 days at the job below or higher |
| Unexcused skip | Unpaid (a fifth of the week). Fired 25% / 50% / 100%. The count resets after 28 days |
| Late nights | Actions can run to 2 AM. Tired (1 to 2 hours) 15% worse, exhausted (3 or more) 30% worse, on haggling and the eye |

## Wholesale, splits, consignment, and Facebook selling

| Value | Prototype value |
| --- | --- |
| Wholesale | 72% of MSRP, $500 minimum, 5-day delivery. Cases of 6 boxes, 10 ETBs, 12 bundles, 36 packs |
| Wholesale, store account | 58% of MSRP, no minimum. A weekly allocation of each product: 1 case, +1 for each $6,000 spent with the distributor, up to 5. +1 case for a product that is not hot (market under 1.2 × MSRP) |
| Case splits | 85% of market a box (80% from a Friend vendor). Respected: 1 invite a week, 2 boxes. Elite: 2 a week, half the case. Closes in 3 days, arrives 4 days later |
| Consignment | From Regular. The shop takes 20%, 12% at Trusted. 28 days. A card at market sells 60% of the time. +2 standing a sale |
| Facebook selling | An offer 8% of days at 65–95% of the price. Half meet today, half in 1 to 3 days. 20% do not show. 1 hour, cash, no fees |

## Upgrades

| Upgrade | Cost |
| --- | --- |
| Expected value readout | $120 |
| A better car (30-minute stops, far sales 6 hours) | $900 |
| Drop alert Discord | $60 |
| Restock alert bot | $150 |
| Authentication tool | $350 |
| Corner loupe, edge light, raking lamp | $60, $90, $140 |
| Studio lights, camera kit | $250, $600 |
| Card reader | $80 |

## Your own store

| Value | Prototype value |
| --- | --- |
| To sign | Reputation Trusted, $2,500 in sales over the run, and the first rent, a deposit of one rent, and the build-out |
| Locations | Strip mall: rent $1,400, build-out $3,500, 12 customers. Main Street: $2,400, $5,000, 20. Mall: $3,800, $7,000, 32 |
| Lease term | 6 periods of 28 days at the listed rent, or 12 periods at 10% less. The deposit is one rent of the term |
| Buyout | Closing early: 3 rents, or the rest of the term if less. The landlord keeps the deposit. The last 7 days of a term: no buyout, deposit back. The lease renews on the same terms |
| Overhead, every 28 days | Insurance $90 / $130 / $200, utilities $140 / $220 / $380, POS software $60 / $80 / $100, card fees 3% of the period's store sales |
| Rival game shops | Each loses 15 standing with the player at a lease. No consignment while the store stands |
| Small-budget customers | 30% / 25% / 50%. They look only at items of $30 or less |
| Build-out and grand opening | 7 days, then ×1.5 customers for 7 days |
| Hours | 11 AM to 7 PM on the open days |
| Customers | Weekday traffic × Mon–Thu 0.8, Fri 1.1, Sat 1.5, Sun 1.2. +6% a reputation tier, +8% a follower tier. Stock ×0.4 empty to ×1.2 at 40 items |
| Buyers | 35% only look. A buyer pays 92% to 128% of market |
| Shelf price, singles | 95%, 100%, 110% (default), 120%, or 130% of market |
| Shelf price, sealed | 90%, 100% (default), 110%, 120%, 135%, or 150% of market |
| Shelf price, one slab | 90%, 95%, 100%, 110%, 120%, 130%, 150%, or 200% of market. Default: the singles price |
| Online listing of store stock | Double sale: 2% on a day when both would sell. Reputation −2 |
| Room | 40 cards and 40 sealed. +60 with each fixture |
| Clerk | $120 a day open. A customer buys 85% as often as with the player, and the clerk sells no second item |
| At the counter | 60% of the day's customers come to the counter. 32% of them sell |
| Fixtures | Second display case $500, sealed wall $400, play tables $700 (both events), security cameras $350, lighted sign $300 (×1.15 customers) |
| Friday tournament | 8 to 16 players, +10% a reputation tier. Fee $5, $10 (default), $15, or $20: attendance 150% less 5% a dollar. Prizes: 0.7 loose packs a player. +0.5 customers a player |
| Pokemon League | Saturday or Sunday morning. 6 to 14 players, +5% a reputation tier. Fee free (default), $2, or $5: attendance 100% less 6% a dollar. A promo card a player at $0.75. +0.8 customers a player, small-budget |
| Event standing | 0.5 to 1.5, starts at 1.0. Moves by (prize support − 0.6) × 0.25 after each tournament. Multiplies tournament players |
| Event extras | Player at the counter: +15% players. Afterglow: 3 days, 30% of the players as extra customers, less each day. Tournament players pick a pack 0.4 times as often as a single. Attendance floor 30% |
| Shoplifting | 5% of clerk-only days at 20 customers, scaled by the location traffic. 70% one to three loose packs, 20% a sealed item of $30 or less, 10% a card of $40 or less |
| Buylist | Off, or 40%, 50%, 60% of market in cash. Daily budget $100, $250 (default), $500, or $1,000. Walk-in sellers: 10% of the clerk-hour customers at 50%, scaled by rate ÷ 50%. A seller wants 40% to 75% of market at least |
| Store credit | 130% of the cash offer. 60% of sellers take it when the clerk offers it. Customers pay up to 25% of a day's sales with it |
| Bulk box | $0.10 a card. 50% of small-budget customers buy a handful of 5 to 20 cards |
| Eviction | Reputation −15, and the landlord keeps the deposit |

## Supplies and accessories

The values are in `app/PokeVendor/Model/Supplies.swift`.

| Value | Prototype value |
| --- | --- |
| Packs and prices | Penny sleeves 100 for $3.50. Top loaders 25 for $6. Team bags 100 for $5. Card savers 50 for $14. Bubble mailers 25 for $13. Magnetic one-touch cases 10 for $18 |
| Rush price | 3 times the piece price, paid at the action. The player pays what the cash allows |
| Shipped single | 1 mailer, 1 penny sleeve, 1 top loader. At $100 or more: a magnetic case in place of the top loader |
| Shipped slab or sealed product | 1 mailer |
| Grading submission | 1 card saver for each card |
| Show table | 30 penny sleeves, 15 top loaders, 6 team bags, at the set-up of a booked table. Not at the store counter |
| Accessory shelf price | Deck sleeves $9, binder $24, deck box $12, playmat $25 |
| Accessory case | Deck sleeves 24, binders 6, deck boxes 12, playmats 6. The distributor charges 55% of the shelf price |
| Accessory sales | 10% of the customers, plus 15% times the small-budget share of the location. Mix: sleeves 45%, deck boxes 25%, binders 15%, playmats 15% |

## Payment methods

See [25-payment-methods.md](25-payment-methods.md). The code is in `Model/Payments.swift`.

| Value | Prototype value |
| --- | --- |
| Card reader | $80 upgrade |
| Buyer's preferred method | 55% cash, 30% card, 15% app. 45% of app buyers ask for Friends and Family |
| Card fee | 2.6% plus $0.15. No per-sale fee at the player's store: the overhead has card fees |
| Goods and Services fee | 2.9% plus $0.30 |
| Friends and Family fee | none |
| Method not accepted | A Friends and Family buyer pays Goods and Services 70% of the time, if accepted. Otherwise cash 50% of the time (80% for a contact). Otherwise the buyer walks |
| Fake screenshot | Goods and Services 2%, Friends and Family 8%. The money never arrives |
| Reversal | Goods and Services 3%, Friends and Family 5%. It comes 3 to 12 days after the sale |
| Contact risk | 25% of the stranger risk |
| Clerk sales with a reader | ×1.12 |
| Default policy | No Friends and Family |

## Taxes

| Value | Prototype value |
| --- | --- |
| Sales tax | 7% of the price, on top of the price. At the player's store and show table only |
| Sales tax payment | Every 28 days, on day 15, 43, 71, and so on |
| Income tax | 20% of the net profit of a quarter. A loss goes to the next quarter |
| Income tax payment | Every 91 days (13 weeks), on day 92, 183, 274, and so on |
| Warning | 3 days before a due day |
| Missed payment | A penalty of 10% of the amount. The player still owes the amount. No game over |
| Seller's permit | $50, one time. A requirement for a store lease. A store from an old save has one |
| 1099-K note | $2,000 of gross sales on TCGplayer, eBay, and Whatnot in a year of 364 days |
| Counted for income tax | Sales, tips, sponsorships, refunds, less sealed product, singles, grading, authentication, show fees, wholesale, store rent, overhead, wages, and store events |

## Theft, damage, and insurance

| Item | Value |
| --- | --- |
| Show table theft | 5% a booked show day. ×0.5 when the player never leaves the table, up to ×2.5 when away all day. +1.0 at $2,000 of table value (scaled below that). +0.25 with a slab on the table. Maximum 30% |
| Thief choice | By value. A slab counts ×2. Cards and slabs only |
| Car break-in | 1.5% a show day or store run with stock in hand. The bag holds 1 to 4 items |
| Home damage | 0.8% each End Day. Hits 1 to 3 raw cards. Edges and surface lose 2 to 4 grades, twice. The floor is 3 |
| Locked display case | $220. ×0.4 on show theft and car break-in |
| Dehumidifier | $120. ×0.4 on home damage |
| Fire safe | $400. No home damage |
| Insurance premium | 1.5% of the insured value every 28 days. Minimum $10 |
| Insurance claim | 80% of the loss, less a $25 deductible |

| Credit expiry | 56 days after the store gives it. Warning 7 days before. The oldest credit is used first |
| Sealed buylist | Off, or 60%, 70%, 80% of market in cash. Daily budget $100, $250 (default), $500, or $1,000. Walk-in sellers: 6% of the clerk-hour customers at 70%, scaled by rate ÷ 70%. A seller wants 55% to 85% of market at least. Product of $15 or more |
| Consignment in the own store | Store cut 15%, 20% (default), or 25%. Up to 3 cards a day, 8% of the clerk-hour customers at 20%. Each point of cut over 20% takes 4 points of the sellers away. Card of $8 or more. Unsold cards go back after 28 days |
| Bigger space | Bigger unit $2,500, large unit $4,500. Each step: +40 card slots, +40 sealed slots, +25% of the lease rent, +25% insurance and utilities |
