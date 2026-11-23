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
| Sick days | 5 each year, back on January 1 | [16-time-and-day.md](16-time-and-day.md#the-job-ladder) |
| Rent | $1,200 on the 1st of each month, +5% on each January 1, with a warning 3 days before | [16-time-and-day.md](16-time-and-day.md#rent) |

## Buying

| Value | Prototype value |
| --- | --- |
| Amazon | Each product is in stock on 45% of days. The price is 100% to 125% of market, or 140% to 190% of market on 30% of days |
| Hyped Reseller | Every product, every day, at 200% to 260% of market |
| Pokemon Center | A drop is live on 15% of days. The attempt succeeds at 30%, or 60% with the checkout bot (from [12-acquiring-product.md](12-acquiring-product.md#pokemon-center-drops)) |
| Order cancellation | An order from the Pokemon Center or Target.com cancels at 5%, or 35% when the player used the checkout bot. The roll comes 1 to 3 days after the purchase, and never later than the day before arrival. The refund is the full price |
| Walmart drawing | Draw at the End Day of Wednesday. A win chance of 8%. A win waits 2 days for "Pay and claim". Delivery 4 days. A strict chain's drawing pickup takes 1 day |
| Target.com drop | A drop chance of 50% on Friday and 8% on other days. An attempt succeeds at 20%. 1 attempt a day, or 2 with the checkout bot. Delivery 3 days |
| Restock alerts | $8 a month for one chain, $25 for every chain. A new alert with more than 7 days to the 1st starts now. Otherwise it starts on the 1st |
| eBay | 8 listings each day: 4 sealed at 80% to 105% of market, 4 singles worth $3 or more at 75% to 105% of market. 20% ship from another country, with 10-day delivery and a price 12% lower |
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
| Stock chance | A game shop has stock on 92% of days. A big store and the club get a batch on their vendor day (see below) |
| Shelf | A big store shows its vendor batch. A game shop shows 5 to 9 products. 80% are in print at 92% to 105% of market, and 20% are older sealed at 100% to 120%. Loose packs come 3 to 12 at a time, other products 1 to 3 (older product 1) |
| Bulk | The shop pays 50% of the bulk's market value, in store credit only |
| Display case | 6 singles worth $5 or more, at 110% of market. The case changes each week |
| Buylist and standing | From [12-acquiring-product.md](12-acquiring-product.md#standing-levels) |

In this build, the display case on a shop's own screen needs no store
run. Holds, consignment, and league night are built. At standing
Regular, the owner holds a sealed product at 85% of market (see
[28-messages-and-encounters.md](28-messages-and-encounters.md)).

### Big stores: vendor days, limits, and heat

| Value | Prototype value |
| --- | --- |
| Vendor slot | One weekday from Tuesday to Saturday, and one hour of 8, 10, 13, or 16, for each store and run |
| Open hours | 8 AM to 10 PM. The drain runs only inside them |
| Batch units | Walmart 30, Target 24, Best Buy 12, GameStop 10, Barnes & Noble 6, club 12. Each product has at least 2 units |
| Batch products | Walmart 4 to 6, Target 3 to 5, Best Buy, GameStop, and the club 2 to 4, Barnes & Noble 1 to 3 |
| Hot product | Market of 1.2 times the retail price or more |
| Drain | A hot item loses `0.2 + 0.6 × pressure` of its stock each open hour. Other items lose 0.05 |
| Vendor wait | At most 2 hours, with a known slot. A rival of hostility 0.5 or more takes 1 hot unit |
| Rival receipt | 5% on each "rival took the stock" line |
| Pressure log | The last 8 days of pressure, for the drain |
| Base limit | Walmart 5 a visit. Target, Best Buy, GameStop: 2 of each item a day, 1 for a hot item. Barnes & Noble 2 a visit, 1 for a hot item. Club: 2 of each item a day, 1 hot item a day |
| Strictness | Level 1 one of each item a day. Level 2 one checkout a day. Level 3 hot product by drawing. Level 4 no card sales for 21 days, then level 3 |
| Incident | On a vendor day: 5% × pressure, plus 0.03 for each buyout of the player. The boost keeps 90% a day. A level falls after 90 days |
| Heat | A hot buy at the limit 1.5 (once for each chain a day). A buyout 1.0. A repeat visit 2.0. A bot use 3.0 (global). Heat keeps 95% a day |
| Heat hints | At 60% and 85% of the ban heat |
| Ban | Heat 10 at one chain. 21 days. The heat falls to half |
| GameStop markup | 1.35 to 1.6 × MSRP on hot product |
| Club | $65 for 364 days, a warning 7 days before it ends. The price is the MSRP, never under $3.75 a pack |
| Card machine | Every 10 days, posted 2 days ahead (4 with the machine map app), at 10 AM to 4 PM. A 2-hour wait. A success chance of 70%. 1 to 3 products, at most 2 of each. Products: packs, bundles, ETBs, tins, blisters |
| Show ban | 1 show in 6 bans in-print sealed |
| Opened-at-MSRP offer | At standing Regular, once a week for each game shop. The product is hot, in print, at MSRP |
| Rivals | 3 flippers and 2 creators. Base hostility 0.15 to 0.35, pulling back 2% a day. +0.08 for a buyout at the rival's chain, +0.05 for a camp win, +0.10 for a creator when the follower tier rises. The rival keeps 3 meetings |
| Rival at a camp | 50% at a store of the rival |
| Rival at a show | A flipper of hostility 0.35 or more. Chance 25% + 30% × hostility. A table of 3 to 5 hot sealed products at 95% of market. Buyers pay at most 5% under the player's ask on the same product |
| Rival's table purchase | Stays on the watch list for 120 days |
| Gouge | A post of hot in-print sealed at 1.25 × market or more. A price within $0.50 of the line counts. Once a day |

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
| Lot: sale chance | Each day: (6% + 22% / (1 + average item value / $20)) × e^(−8 × (price / buyer price − 1)) × 1 / (1 + (items − 2) / 8) × channel demand. Cap 50% |
| Lot on Facebook | Buyer price 70% of the sum. The buyer pays 85% to 100% of the listed price. 20% of buyers do not come |
| Lot: size | At least 2 items, all in one Inventory tab. A lot ends after 28 days |

## Grading

| Company | Service | Fee | Days |
| --- | --- | --- | --- |
| PSA | Value Bulk (members, 20+ cards, up to $500) | $24.99 | 45 |
| PSA | Regular (up to $1,500) | $79.99 | 21 |
| PSA | Express (up to $2,500) | $199 | 10 |
| PSA | Super Express (up to $5,000) | $349 | 5 |
| PSA | Walk-Through (up to $10,000) | $599 | 3 |
| PSA | Premium 1, 2, 3, 5 (up to $25,000, $50,000, $100,000, $250,000) | $999, $1,999, $2,999, $4,999 | 2 |
| PSA | Premium 10 (no cap) | $9,999 | 2 |
| CGC | Economy | $18 | 30 |
| CGC | Standard | $30 | 12 |
| CGC | Express | $65 | 5 |
| BGS | Base | $20 | 40 |
| BGS | Standard | $50 | 15 |
| BGS | Express | $100 | 7 |

**Card condition.** A pulled card gets four hidden subgrades. The
overall grade is 70% the worst subgrade and 30% the average, plus the
company's bias and a random spread. The values are fitted to real
population counts (see
[10-grading.md](10-grading.md#measured-grade-rates)).

| Company | Bias | Spread | Cutoffs |
| --- | --- | --- | --- |
| PSA | +0.04 | ±0.62 | Rounds to a whole grade |
| CGC | +0.18 | ±0.43 | 10 from 9.4, Pristine 10 from 10.12, half grades below |
| BGS | −0.05 | ±0.29 | 10 from 10.02, 9.5 from 9.4, half grades below |

A BGS card with four 10 subgrades is a Black Label 4.3% of the time.

| Subgrade, pack-fresh | 10 | 9.5 | 9 | 8.5 | 7.5 to 8 |
| --- | --- | --- | --- | --- | --- |
| Corners, edges | 36.1% | 42.6% | 15.7% | 4.0% | 1.6% |
| Surface | 38.6% | 34.5% | 13.7% | 11.7% | 1.5% |

A single bought second hand loses 0 to 1 point on its corners and its
edges. An old card has a front cut from 36/64 to 64/36 (LR) and 38/62 to
62/38 (TB). 40% of old cards keep their pack-fresh subgrades. The rest
lose 0 to 6 points on corners and edges and 0 to 1.5 points on the
surface, down to 1.5.

**Wear.** A card is Lightly Played when a corner or an edge is 8 or
less, or the surface is 7 or less. It is Moderately Played at 7 or less
(corners, edges) or 6 or less (surface). It is Heavily Played at 6 or
less (corners, edges) or 5 or less (surface). It is Damaged at 5 or
less (corners, edges) or 4 or less (surface). About 3% of cards from a
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
factory spread is a normal curve around 50/50: 3.6 points for front LR,
5.3 for front TB, and 7 for each back value. About 61% of fronts get a
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
- **A Black Label** is worth 8 times the BGS 10 price, and at least 2
  times the PSA 10 price.
- **A CGC Pristine 10** is worth 2.3 times the CGC 10 price, at most the
  PSA 10 price, and at least 5% above the CGC 10 price.
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
| Whatnot fees | 10.9% + $0.30, and the player ships. Rip & Ship has its own fees (see Rip & Ship above) |
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
| Camping | 6 hours from 8 AM. 60% at the door, ×0.75 each hour late, +25% with the restock bot, × `1.2 − 0.6 × pressure`. 2 to 4 products, 2 to 6 each, at most the chain limit of each, at MSRP. A restock every 14 days per store, posted 3 days ahead |
| Opportunities | 1.5 every 28 days, 0 or 1 day of notice. A collection at 70% of market, a closeout at 60%, a private buyer at 120–150%, a free table, an estate tip, a vintage collection at Elite |

## Counterfeits

| Value | Prototype value |
| --- | --- |
| Fake rates | Reseller 4%, eBay 8%, Facebook 10%, garage sale 12%, estate sale 8%, stranger 5%, Familiar contact 2%, Regular and up 0.5%, shop case 1%, plug 5.5%. Sealed ×0.5. Vintage ×3, older ×1.5. Hyped sealed ×1.5. A case has one roll |
| Tiers | Bootleg 50%, convincing 35%, professional 15% |
| A look by eye | Catches 90% / 15% / 0% by tier, × the tired factor |
| Paid check | $8, 3 days |
| Authentication tool | $350. Misses a professional counterfeit 10% of the time |
| Buyer finds out | 90% / 60% / 25% by tier, +30% when the player knew, 2 to 10 days later |
| Cost | Reputation −40, the contact −20, the shop −20 standing. TCGplayer, eBay, and Whatnot refund the buyer. Public 30% + 10% per reputation tier and follower tier: a product integrity callout that starts at heat 60 (75 when the player knew) and opens past the cap |
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
| Wholesale (secondary wholesaler) | 72% of the retail MSRP or 62% of market, the higher price. $250 minimum, 5-day delivery. 1 case of each product and 2 cases a week. 12% of orders ship 60% to 90% of the units and refund the rest. 1% of orders go missing, and the refund comes 14 days after the notice |
| Wholesale, store account | 58% of the retail MSRP or 50% of market, the higher price. No minimum. A weekly allocation of each product: 1 case, +1 for each $6,000 spent with the distributor, up to 5. +1 case for a product that is not hot (market under 1.2 × MSRP). A hot product stays at 1 case. Elite adds 1 hot case |
| Case splits | 85% of market a box (80% from a Friend vendor). Respected: 1 invite a week, 2 boxes. Elite: 2 a week, half the case. Closes in 3 days, arrives 4 days later |
| Consignment | From Regular. The shop takes 20%, 12% at Trusted. 28 days. A card at market sells 60% of the time. +2 standing a sale |
| Facebook selling | An offer 8% of days at 65–95% of the price. Half meet today, half in 1 to 3 days. 20% do not show. 1 hour, cash, no fees |

### Cases

| Value | Prototype value |
| --- | --- |
| Units in a case | Booster box 6, ETB 10, booster bundle 25, booster pack 144, blister 24, Build & Battle Box 10, collection 6, tin 6 |
| By name | Ultra-Premium 4, Tech Sticker 12, Knock Out 24, Pokemon Center ETB 4, mini tin 10, 1-pack blister 16 |
| No case | Art bundles and every "Set of N" product, Fun Packs, half boxes, enhanced boxes (a real case row only), bundles that do not hold 6 packs, club items, master cartons |
| Case price | A real case price when the price refresh has one. A row stays when its price is 0.4 to 2.5 times the price of its units. Otherwise units × unit market × the factor below |
| Case factor: booster box | 0.95 in print, 1.05 out of print under 2 years, 1.15 out of print 2 years or more |
| Case factor: ETB | 1.05, 1.15, 1.25 |
| Case factor: booster bundle | 0.95, 1.05, 1.10 |
| Case factor: other | 1.00, 1.05, 1.10 |
| Out of print "old" | 730 days or more, or an older era |
| Case fresh | A sale chance of 1.05 × |
| Open confirmation | A premium loss over $50 |
| Stranger case | A dealer at a show 20%. An eBay or Facebook day 10%. Ask 85% to 105% (eBay) or 70% to 95% (Facebook) of the case price. No case over $15,000 |
| Tape check | Shows the tell of a fake case 50% of the time. 10% of stranger listings say "loaded" |
| Tape check with the seal inspection kit | 100% for each fake except a professional reseal. The kit also works on any sealed product |
| Back room | $600. 12 cases (24 with the back room shelving, $400). A product restocks at 1 unit or fewer on the shelf |

### Distributor

| Value | Prototype value |
| --- | --- |
| Application | 14 days |
| Rep | Starts at 20 points. +1 for each $1,000 spent, at most 3 a week. +1 for a week with a store event. Names: Dana Ruiz, Mark Osei, Leah Brandt, Tom Achebe, Rachel Kim |
| Push for allocation | −5 rep points. +25% fill for one product for a week. Once in 28 days |
| Fill rate of a hot case | `0.05 + 0.35 × (1 − pressure) + 0.20 × rep ÷ 100`, at most 90% |
| Back-door check | Each week. A 28-day window. At least 6 sold units and half of the delivered units. Acts when under 40% reached customers. Notice 25%. −15 rep points |
| Back-door penalties | 2 warnings in 84 days: hot product frozen 28 days. 3 warnings: closed 84 days |
| Hot record | Kept 56 days |
| Plug found by the rep | 10% a week for 28 days after a plug order. −20 rep points |

### Plug

| Value | Prototype value |
| --- | --- |
| Appears | 10% a day, from day 14, at follower tier 1 or reputation Known. A new plug 28 days after a vanish |
| Names | Vince, J-Money Sealed, Kev (wholesale), BoxPlug_TX, Rico |
| Offers | 3 a week, 1 when pressure is under 0.3 |
| Price | 85% of the retail MSRP, never under 65% of market |
| Order | At most 5 cases and $20,000. Delivery 5 to 10 days |
| Vanish | 6% + 1 point for each $1,000 over $2,000, at most 16%. −1 point for each clean order, down to 3% |
| Short order | 10%. 60% to 90% of the units ship |
| Seizure | 2% of delivered orders, 3 to 14 days later |

### Rip & Ship

| Value | Prototype value |
| --- | --- |
| Commission | 8% under $15,000 of Rip & Ship sales in 28 days. 7.5% from $15,000, 7% from $50,000, 6.75% from $150,000, 6.5% from $500,000 |
| Other fees | Processing 2.9% of (sale + buyer shipping) + $0.30. Supplies $0.50 ($0.25 with the shipping station). The buyer pays shipping: $4.47 up to 3 packs, $9.85 up to 36 packs, $15.50 above |
| Buy Now ceiling | 95% to 120% of market for a hot product, 90% to 105% for other product. × 1.05 with the overhead camera |
| Buy chance | A viewer buys with 0.0024 a minute. A product over $500 scales by viewers ÷ 100 |
| Rival creators | Each takes 5% of the buyers, down to 80% left |
| Repeat buyer | 50% of buyers. ±5% by the last result |
| The wait | 10 minutes. Impatience 3% |
| Case rip | 0.75 minutes a pack |
| Clip | 3% of the viewers become followers |
| Ship | Within 2 days. 10 minutes an order (5 with the shipping station). +2 contact points. Chargeback on day 7 |
| Strikes | 2 in 60 days: a 28-day ban. 3 in 120 days: Rip & Ship ends |
| Not opened, resealed | Authenticity −0.02, −0.05 |
| Palm the hit | Caught 50%. Reputation −40. Ban 56 days. Callout heat 90. Late order act weight 2.0 after a chargeback |
| Kept | An order stays in the save 28 days after it ends |

## Upgrades

| Upgrade | Cost |
| --- | --- |
| Expected value readout | $120 |
| A better car (30-minute stops, far sales 6 hours) | $900 |
| Drop alert Discord | $60 |
| Restock alert bot | $150 |
| Checkout bot | $400 |
| Authentication tool | $350 |
| Corner loupe, edge light, raking lamp | $60, $90, $140 |
| Studio lights, camera kit | $250, $600 |
| Card reader | $80 |
| Vendor binder, slab case, folding cart | $40, $90, $120 |
| Hand truck (needs the folding cart) | $180. A case: 60% of the space of its units, not 80% |
| Seal inspection kit | $160. The tape check works on any sealed product, 2 × the catch |
| Route planner app | $120 |
| Machine map app | $60. A machine restock posts 4 days ahead |
| Shipping station | $350. Shipping 5 minutes an order, supplies −$0.25 |
| Overhead camera (needs the camera kit) | $450. Buyer ceiling × 1.05. A palm is caught 75% of the time, not 50% |
| Purchase records app | $120. A denied false integrity or forbidden callout: 1 day, rival credibility loss × 1.5 |
| Reprint radar (needs the price tracker app) | $200. Read only |

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
| Fixtures | Second display case $500, sealed wall $400, play tables $700 (both events), security cameras $350, lighted sign $300 (×1.15 customers), back room $600 (12 cases), back room shelving $400 (24 cases), acrylic sealed cases $150 (sealed price judged at 95%) |
| Back room restock | At 1 unit or fewer on the shelf. A case opens when the free shelf room is at least the smaller of the case size and a quarter of the sealed slots |
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
| Counted for income tax | Sales, tips, sponsorships, refunds, less sealed product, singles, grading, authentication, show fees, wholesale, store rent, overhead, wages, store events, business interest, and business costs |

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
| Store stock rider | 3% of the sealed value in the store each 28 days, at the highest value of the cycle, with the $10 minimum. Turning it on charges the rest of the cycle |
| Store break-in | 0.05% a night × (1 + sealed value ÷ $25,000), at most 0.6%. ×0.4 with cameras. 2 to 6 of the most valuable sealed items. Door repair $400 |

| Credit expiry | 56 days after the store gives it. Warning 7 days before. The oldest credit is used first |
| Sealed buylist | Off, or 60%, 70%, 80% of market in cash. Daily budget $100, $250 (default), $500, or $1,000. Walk-in sellers: 6% of the clerk-hour customers at 70%, scaled by rate ÷ 70%. A seller wants 55% to 85% of market at least. Product of $15 or more |
| Consignment in the own store | Store cut 15%, 20% (default), or 25%. Up to 3 cards a day, 8% of the clerk-hour customers at 20%. Each point of cut over 20% takes 4 points of the sellers away. Card of $8 or more. Unsold cards go back after 28 days |
| Bigger space | Bigger unit $2,500, large unit $4,500. Each step: +40 card slots, +40 sealed slots, +25% of the lease rent, +25% insurance and utilities |

## Packing and crowds

| Item | Value |
| --- | --- |
| Binder | 40 raw cards. Vendor binder ($40): 160 |
| Slab box | 3 slabs. Slab case ($90): 20 |
| Tote | 8 spaces. Folding cart ($120): 30. Sealed: round(sqrt(real volume ÷ 8 in³)), at least 1. A booster pack is 1, a booster box 3, an Elite Trainer Box 5, an Ultra-Premium Collection 7. A sealed case: 80% of the space of its units, rounded up |
| Setup time | 10 minutes + 0.2 for each raw card + 0.5 for each slab + 1 for each sealed space. Day 2 of a regional show: 50%, after a day 1 setup |
| Spend cap | Park swap $60, league night $80, trade night $150, local show $400, no cap at the trading circle, the regional show, and the store. Budget: cap × 50% to 150% |
| Trade share | A share of the visitors who do not sell: park swap 35%, trade night 40%, trading circle 25%, league night 20%, others 23%. The store counter: a flat 18% of all visitors |
| Turnout | Mean × (0.7 + appeal ÷ 20), at most 1.3. Not at the store |
| Stale stock | Records for 21 days. A regular passes at 30% for each time on a table, at most 75% |

See [29-packing-and-crowds.md](29-packing-and-crowds.md).

## Haggling and deal reputation

| Item | Value |
| --- | --- |
| Fair band | Sell at 100% of market or less, buy at 70% or more, value trade cards at 80% or more |
| Trader | Lowest valuation 70% to 90%. Cash up to 50% of the item's market, × 1.0 to 1.3 |
| Deal fairness | $20 or more. Generous +2, fair +1, hard 0. At most 6 a day |
| Stories | Generous 8%, hard 12%, lost flip 4%, +2% each notoriety step, ×2 at $200. 1 to 10 days later. 1 in 5 viral. Good +3 (viral +10), bad −4 (viral −12). Random 3% a week, ±3 |
| Final offer | Within 10% of market of the limit: met 60%, or 30% by a flipper or a dealer |
| Trade instead of cash | 110% of market, at most 150% of the goods. A closet cleaner says no half of the time |
| Trader binder, bundles | 3 to 5 cards. 20% of buyers (not kids) ask for a bundle |
| PC premium | A PC item changes hands at 130% of market. A collector's top price for a PC item × 1.0 to 1.45 |
| Stash ask | Once a person, 3 minutes. Shown: stranger 50%, familiar 65%, regular 80%, trusted 95%, friend 100%. Closet cleaner +30 points |
| Stash size | Stranger 2–3, familiar 3–4, regular 4–6, trusted 5–8 (+1–2 PC), friend 7–10 (+2–3 PC) |
| Stash offer | Slider 30% to 130% of market. Two counters, then the stash closes |
| Showcase | Upgrade $750. 6 cards of $1,000 or more. Setup +10 minutes |
| Showcase at a table | Visitors +5% × √(value in thousands), at most 25%. Whales 3% + 1.5% × the root, at most 12%. 35% of whales ask about a showcase card: open at 130%, top 130% to 160%. Other whales: dearest third of the table, top 100% to 115% |
| Showcase visit reward | Reputation +1 (+2 at $10,000 or more). Followers 1.5 × √value, at most 400 |
| Short-form video | See [32-short-form-video.md](32-short-form-video.md#values). Edit 20 min (long 45). Burnout 0.05. Reach (200 + followers × 0.25) × factors, viral 4%. View pay from 10,000 followers: $0.06 / $0.60 per 1,000 views, every 7 days |
| Master set reward | Once a set. Reputation: half the square root of the set value, 3 to 40. Followers: 10 × the root |

See [30-haggling-and-deal-reputation.md](30-haggling-and-deal-reputation.md).

## Debt and loans

| Item | Value |
| --- | --- |
| Credit score | 300 to 850. Start 650. On time +4, paid off +10, application −5, first miss −45, later miss −25, collections −100 |
| Line use penalty | Over 30% of the limit −15, over 70% −35 |
| Interest | Accrues every day at APR ÷ 364. Payments every 28 days |
| Personal loan | Score 580+. 740+: 9% APR, up to $10,000. 670+: 14%, up to $5,000. 580+: 24%, up to $2,000. 6, 12, or 24 payments. 3% fee. A job is required |
| Debt-to-income | All loan payments under 20% of 4 weeks of pay |
| Business loan | Score 620+. 700+: 10% APR, 620+: 13%. 12, 24, or 36 payments. 2% fee. Seller's permit, 91 days of history, $1,000 of sales in 91 days. Up to half of one year of sales, cap $25,000 |
| Line of credit | Score 580+. 740+: $5,000 at 18%. 670+: $2,000 at 22%. 580+: $500 at 29%. Minimum payment: interest + 3% of the balance, at least $25 |
| Payday loan | $100 to $500, at most half of one week of pay. $15 fee for each $100, due in 14 days. Up to 4 rollovers. $30 bounce fee |
| Pawn shop | 40% of market. Items of $20 or more. 20% fee for each 28 days. The shop keeps the item after the last day |
| Late fee | $30, or 5% of the payment when that is more |
| Collections | After 3 missed payments in a row. 20% collection fee. 25% of each paycheck. +2% of the balance every 28 days. With no job: 25% of cash each week |

## Auction houses

| Value | Number |
|---|---|
| Least market | $1,000 |
| Seller fee | Goldin 10%, Heritage 15%, Fanatics Collect 12%. −2% for each reputation tier above the house's tier, −3% from $10,000, −5% from $50,000 |
| Buyer's premium | Goldin 15%, Heritage 20%, Fanatics Collect 15% |
| Bidder strength | Goldin 1.22, Heritage 1.27, Fanatics Collect 1.15 times market, ±30% |
| Reputation gate | Fanatics Collect tier 1, Goldin and Heritage tier 2 |
| Timeline | Check after 5 days. The auction at least 14 days after the consign day, on day 7, 14, or 21 of each 28. Payout 14 days after |
| Costs | $30 insured shipping. 3% of the reserve when the reserve is not met |
| Fake slab | −15 reputation, refused for 180 days |

## Vending machines

| Value | Number |
|---|---|
| Machine | $2,850. At most 5 |
| Capacity | 40 sealed items |
| Hosts | Gas station 2.6 sales a day, 15% share. Laundromat 1.6, 10%. Mall 4.0, 20%, Known tier. Your store 2.0, 0% |
| Default price | Market × 1.25. Choices: × 1, 1.15, 1.25, 1.4 |
| Jam | 1.5% a day |
| Break-in | Gas station 0.6%, laundromat 0.8%, mall 0.15%, your store 0.1% a day. Takes the cash box and 30% to 60% of the stock. Repair $150 to $400 |
| Neglect | An outside host ends the contract after 7 days empty or jammed |
| Parts | Card reader $300 (+30% sales, 60% by card, 3% fee). Camera $250 (break-ins −60%). Remote stock data $150 |

## The moving market

| Value | Number |
|---|---|
| Periods | Steady 120 to 360 days, −3% to +3% a year. Boom 120 to 300 days, +30% to +80%. Correction 180 to 360 days, −15% to −35%. A run starts steady |
| What follows | After steady: boom 50%, correction 30%, steady 20%. After a boom: correction 60%, steady 40%. After a correction: steady 70%, boom 30% |
| Short wave | ±7% over 97 days |
| Card under $1 | Flat, except for news |
| Card of $1 or more | Follows the market more as it gets dearer: 30% of the move at $1, up to 120% at $1,000. Its own wave is 60 to 240 days, up to ±12% |
| Daily steps | A chance each day of 30% ($1 to $5), 25% ($5 to $50), 15% ($50 to $500), 10% (over $500), and 20% (sealed). Pull back to the real price with a half-life of 120 days |
| Card of $25 or more | Gains value a year while its set is out of print: WOTC and e-Card +8% to +15%, EX to XY +4% to +12%, Sun & Moon and later +2% to +10% |
| Sealed product | Follows 60% of a boom and 20% of a correction. In print +0% to +2% a year. Out of print by era: WOTC and e-Card +10% to +15%, EX and later +15% to +25% |
| Factor limits | 0.3 to 6 times the real price |
| Market news | 6% each day, at most 3 at once. Hype +25% to +70%. Sealed hype +20% to +50%, 21 to 45 days. Character product +10% to +30%. Character sell-out +20% to +50% |
| Print change | About once in 25 days. 14 to 28 days of notice. At most 2 announced. At least 8 sets stay in print |
| Flipper dump | From pressure 0.6. A fall of 10% to 20% over 14 to 28 days, then 120 days of recovery. A reprint and a dump together never cut more than 45%. A correction hits 2 sets |
| MSRP step | +12.5% of the retail price. A chance of 1 in 300 a day after day 90. 28 days of notice. 60% of the step reaches the market price, over 30 days |
| Flipper pressure | Start 0.5, range 0.1 to 0.9. Sealed hype or sell-out +0.15. Boom +0.002 a day. Correction −0.003 a day. Holiday season +0.10. After-holiday season −0.10. Reprint −0.25. A pull of 1% of the gap a day. A report line at a move of 0.1 |
| Online sale chance | Hot in-print sealed on eBay and TCGplayer: −20% at pressure 0.9, scaled from 0.1 |

## Seasons

| Value | Number |
|---|---|
| Start date | Monday, January 1, 2029. An old save keeps its random start week |
| Holiday season | Center week 47.5 (late November), ±5.5 weeks. Sealed sale chance +15%, singles sale chance −5% at the center |
| Holiday sealed price | Center week 48, ±5 weeks. +5% at the center |
| After the holidays | Center week 5 (early February), ±6 weeks. Sealed price −10% at the center |
| Summer slump | Center week 30 (late July), ±6 weeks. Every sale chance −5% at the center |
| Deeper winter dip | At pressure 0.6 or more on the first day of the dip: ×1.5 (−15% at the center). Set once for the whole dip |
| Store customers | The mean of the sealed and the singles sale chance factors |
| Shape | A raised cosine: the full size at the center, 0 at the edges |

## The demand limit

| Value | Number |
|---|---|
| Channel | Sale chance × 1 / (1 + recent sales / room). Room is 4, +2 for each follower tier. Recent sales keep 60% each day |
| One item | Sale chance × 1 / (1 + 0.3 × recent sales). Price −5% for each recent sale, down to 60%. Recent sales keep 93% each day |
| Auction | A no-sale chance of 5%, plus 60% of the demand lost |

## Limits on follower growth

| Value | Number |
|---|---|
| Same subject in 14 days | Quality × 0.35 |
| Posts that gain followers | The first 3 of a day |
| Gain of one post | At most 25 or 1.5% of followers, the higher number. A viral post: 4 times that |

## Callouts

| Value | Number |
|---|---|
| Start heat | Kids 70, product integrity 60, fair openings 60, forbidden 50, greed 40, baseless drama 40 |
| Start heat of a true callout | The type heat × the act weight, from 0.75 to 1.5 |
| Daily fade | −15% of the heat. A new callout keeps its heat for one night |
| End | Heat under 5, or 45 days |
| Open cap | 3 callouts about the player. Forced callouts open past it |
| Hidden act weight | 0.1 to 3 |
| Discovery | Base chance × weight × witness factor × (1 + 0.1 × notoriety). Witness factor `1 + log10(1 + witnesses) / 2`, at most 3. A greed act × `(0.5 + pressure) × (1 + min(1, heat ÷ 10))`. At most 50% a day |
| Act life | Out of the log when the weight is under 0.05 or after 90 days. An act that came out stays 120 days |
| Rival breaks the story | 1 in 3 |
| Deny, true callout | Heat × 1.5. The denial falls apart at 50% with proof and 20% without: reputation −8 |
| Deny, false callout | Ends in 2 days. Reputation +1. The rival loses 0.25 credibility |
| Make it right | Ends in 1 day. Cost: the refund of the act, or $2 for each heat point ($25 to $250). A late Rip & Ship order: 10% of the price, at least $5 |
| Counter-callout | Heat +30. Followers +0.5%. Authenticity −0.05. Rival credibility −0.1 (true) or −0.3 (false). Rival hostility +0.2. A game shop: −10 standing |
| Rival answer | The chance of the rival's hostility, the next night. Heat +20 |
| Receipts | A true callout with no proof at heat 30 or more: 15% a night. Heat +10 |
| End cost | Peak 30 to 69: reputation −4. Peak 70 or more: reputation −12, followers −1%, authenticity −0.1. Half the reputation after "make it right" |
| Contact cost | −15 points with the harmed contact |
| Record | Peak 50 or more, on a true callout. 90 days. −5 points for a new contact, at most 3 records |
| Whatnot ban | Peak 80 or more, on a product integrity callout or a palm from the log. 28 to 56 days (56 for a palm) |
| No account | A false rival callout starts at half the heat |
| Sponsor block | No new offer at heat 60 or more |
| Crowd line | At heat 50 or more, 12.5% of buyers who do not sell. 1 less patience |
| Response post | Burnout +5%. No followers |
| Weekly rival roll | `(0.008 + 0.06 × hostility) × credibility`. × 0.25 when a rival posted in the last 14 days. 4 in 10 use a real act |
| Rival credibility | 0.25 to 1. +0.05 a week |
| Game shop rival | Hostility `0.2 + 0.5 × (1 − standing ÷ 100)`. Only with a store lease |
| Drama bait | +0.15 for a gambling backlash, at most 0.5. Halves each week |
| Player callout | +1 reputation and followers +0.5% (at least 10), both × credibility. Rival credibility −0.3. Once in 28 days. Without proof: authenticity −0.05, rival credibility +0.1 |
| Receipt limit | 1 for each rival in 30 days. A receipt stays 60 days |
| Kid gift | $5 to $30. Once a day. A story chance of 15%, 1 in 5 viral |
| Good story | Open callout heat −10, or −25 when viral |

## Goals and costs that grow

| Value | Number |
|---|---|
| Cash goals | $5,000, $25,000, $100,000, $500,000 |
| Follower goals | 1,000, 10,000, 100,000, 1,000,000 |
| Reputation goals | The Known, Trusted, Respected, and Elite tiers |
| Collection goals | $1,000, $10,000, $50,000, $250,000 |
| Storage unit | On the 1st of each month. 300 items $150, 800 items $400, 2,000 items $900. 10 bulk cards count as 1 item |
| Bookkeeper | On the 1st of each month. 1.5% of the sales above $25,000 in the month before |
| Your own warehouse | $90,000. No home space limit (docs/37) |
| Buy a home | $350,000. No rent, $600 upkeep every 28 days |
| Unpaid business cost | Reputation −2 |

## The save file

| Value | Number |
|---|---|
| Write delay | 2 seconds after a change, and at once when the app leaves the screen |
| Ledger | The last 182 days |
| Activity | The last 91 days |
| Posts | The last 60 |
