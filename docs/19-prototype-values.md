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
| Lost package | 1% of sales |
| TCGplayer lowest listing | 90% to 99% of market, fixed for each card |
| TCGplayer sale chance | 30% each day at or under the lowest listing. The chance halves for about each 2% above it |
| eBay Buy It Now sale chance | 10% each day at market (14% for slabs and sealed). It falls as the price goes above market |
| eBay auction | 5% end with no bid. The others end near 95% of market, with a spread of about ±35% |

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
(corners, edges) or 6 or less (surface). About 9% of cards from a pack
are Lightly Played. No card from a pack is Moderately Played.

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

**A grade with no sales data** is worth a multiple of the raw price,
with a floor. A 10 is 2.5 times raw, with a floor of $15 for PSA, $12
for CGC, and $30 for BGS.

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

Live streams, follower tips, and show promos are not built.

