# Acquiring Product

How the player gets sealed product (packs, boxes, cases) to sit on or
rip open — the Grinder archetype's core loop (see
[02-playstyles.md](02-playstyles.md)), and the supply side of the
sealed-product pricing model in
[05-pricing-and-market.md](05-pricing-and-market.md).

## Acquisition channels

### Online — five storefronts, five tradeoffs

Online buying is a free action (see
[01-premise-and-loop.md](01-premise-and-loop.md)). "Online" is not one
option. It is five options, and each option has a different price,
availability, and risk tradeoff. This mirrors how online buying works
in real life:

- **Pokemon Center**: MSRP pricing, but stock for a hyped release
  comes only in timed drops (see "Pokemon Center drops" below). A
  successful attempt gets the best possible price.
- **Amazon**: broad availability, but pricing is inconsistent — ranges
  from roughly MSRP to noticeably marked up, varying by set and moment.
  The reliable middle ground.
- **Hyped Reseller**: always in stock, both current and older
  out-of-print product, but always significantly overpriced. The
  fallback when you need product now, or need something no longer
  sold at retail at all. The reseller does not care if an item is
  fake, because it moves so much product (see
  [14-counterfeit-risk.md](14-counterfeit-risk.md)).
- **eBay**: individual sellers list their own product in a structured
  market. It also carries international product that the other stores
  do not sell.
- **Facebook Marketplace**: local people sell lots and random items at
  random prices. It is the least structured channel. A purchase here
  is not a free action: the pickup costs time, the same as a garage
  sale. Sometimes the seller sets the pickup for a later day, so the
  item arrives only after that meeting.

eBay and Facebook Marketplace have the best deals of all the channels.
They also have the highest chance of a fake or a resealed product (see
[14-counterfeit-risk.md](14-counterfeit-risk.md)).

#### Pokemon Center drops

Stock for a hyped release comes out as a drop. A drop stays open for
one day. During that day, the player gets one attempt to buy. The
attempt succeeds at a fixed chance. The starting value is 30%, and the
exact value is a balancing task. A miss costs no time and no cash.
When the day ends, the drop closes.

A drop comes with no notice. The player learns about a drop only when
it goes live, and the Pokemon Center screen shows no upcoming drops.
This mirrors real life, where only people in a drop-alert Discord
group know early.

Two possible upgrades (see [09-upgrades.md](09-upgrades.md)):

- A drop-alert Discord membership gives notice before a drop.
- A restock-alert bot increases the chance of success.

### Camp a store drop (event, time-cost)

Camping is an event, not a storefront. It does not appear on the buy
screen. It works the same way as a garage sale or a local meet: a
time-cost action (see [01-premise-and-loop.md](01-premise-and-loop.md))
that the player chooses for a day. A camping event appears on the home
hub, in the same list as card shows (see
[08-ui-direction.md](08-ui-direction.md)).

Camping targets a store restock day. The calendar posts the restock
day 2 to 3 days ahead (see
[17-calendar-and-events.md](17-calendar-and-events.md#posted-entries)).

On a success, the player spends cash and gets product at MSRP. Camping
carries real variance: the store sells out before the player arrives,
or other buyers get the stock first. A bust costs the day and returns
no product, consistent with the game's existing risk design.

### Local stores (store run, time-cost)

Big retail stores and the local game shop sell sealed product at MSRP.
Stock is rare: most visits find an empty shelf. The player learns what
a store has only on arrival. There is no advance information.

The local stores are Target, Walmart, Best Buy, GameStop, Barnes &
Noble, and a local game shop.

A store run is a time-cost action (see
[01-premise-and-loop.md](01-premise-and-loop.md)). The player picks one
or more stores for one trip, and each store adds time to the trip. The
run goes stop by stop. At each stop, the player sees the shelf, then
buys or goes to the next stop. A stop with an empty shelf is a bust
that costs the time for that stop.

A store run is different from camping. Camping targets a restock day
that the calendar posts 2 to 3 days ahead (see
[17-calendar-and-events.md](17-calendar-and-events.md#posted-entries)).
A store run is a check with no notice.

#### The local game shop

The local game shop is a local store with more features:

- Better stock odds than the big stores, but in small quantities.
- Regulars get holds on hot product. The player earns this through
  standing with the shop owner. There are no preorders, because no new
  sets release during a run (see
  [17-calendar-and-events.md](17-calendar-and-events.md#no-new-set-releases)).

Standing is per store. Each game shop keeps its own standing with the
player, and it is separate from the global reputation track (see
[04-reputation-and-followers-unlocks.md](04-reputation-and-followers-unlocks.md)).
A player can be a regular at one shop and unknown at another. Big
retail stores and the Pokemon Center have no standing at all.

There are two game shops near the player. Both shops use the same
rules, and each one keeps its own standing.

##### Standing levels

Standing is a points total with each shop, from 0 to 100. The points
set the level. Every player starts at 0 with each shop.

| Level | Points | Buylist price | Holds | Consignment |
| --- | --- | --- | --- | --- |
| Stranger | 0–9 | 50% of market | No | No |
| Familiar | 10–29 | 55% of market | No | No |
| Regular | 30–59 | 60% of market | Yes | Yes; the shop keeps 20% |
| Trusted | 60–100 | 70% of market | Yes, and first pick on hot product | Yes; the shop keeps 12% |

##### How standing changes

| Event | Points |
| --- | --- |
| Attend league night (see [17-calendar-and-events.md](17-calendar-and-events.md#what-league-night-gives)) | +3 |
| Spend $50 at the shop, in cash or store credit | +1 for each $50 |
| A consigned card sells | +2 |
| A hold that the player does not pick up within 3 days | −5 |
| The shop finds a fake that the player sold it | −20 |
| No visit to the shop for 4 weeks | −2 for each week after that |

Standing never goes below 0 or above 100. All values in this section
are starting values for balancing.

The local game shop also has:
- A display case of singles, so the shop is also a place to buy
  singles.
- Events: a weekly league night (see
  [17-calendar-and-events.md](17-calendar-and-events.md#recurring-entries)).
- It buys cards too: a buylist for instant cash, bulk for store credit
  only, and consignment (see
  [15-selling.md](15-selling.md#the-local-game-shop)).

### Distributor / wholesale (reputation-gated)

Unlocked at reputation tier 3, Respected (see
[04-reputation-and-followers-unlocks.md](04-reputation-and-followers-unlocks.md#reputation-tiers)):
true wholesale pricing, once the player is established enough to be
trusted with it. Priority case allocation on hot releases is a step up,
unlocked at tier 4, Elite.

### Garage sales, estate finds, meets and shows

The existing Sourcer and Flipper channels
([02-playstyles.md](02-playstyles.md)) occasionally surface old sealed
product instead of singles — no separate mechanic needed, just another
possible find at an existing activity. This is also the main source of
counterfeit/reseal risk on sealed product — see
[14-counterfeit-risk.md](14-counterfeit-risk.md).

### Case splits (reputation-gated)

A few trusted people pool money to buy a full case together, then
divide the actual boxes among themselves afterward — informal, no
livestream, no organizer margin, no random assignment. (Deliberately
excluding the livestreamed "group break" format some real hobbyists
run — not a fit for this game.)

Reputation gates access: how many case splits a player can be part of
at once, and whether they're invited into ones involving rarer/pricier
cases, works the same way reputation already gates invite-only meets
and private consignment (see
[04-reputation-and-followers-unlocks.md](04-reputation-and-followers-unlocks.md)).
This is capital-pooling, not scale/reach, so it's gated by trust
(reputation), not audience size (followers).

## Product types

Sealed product is not only packs, boxes, and cases. The catalog also
includes premium collector items, for example the Mega Charizard X
Ultra-Premium Collection (UPC) and the Prismatic Evolutions
Super-Premium Collection (SPC). Collectors buy these items for the
sealed item itself. They sell through the same storefronts as other
sealed product, and the player finds them on the buy screen (see
[08-ui-direction.md](08-ui-direction.md)).

## Where bought product goes

Every purchase goes straight to Inventory. This is true for every
channel. The buy flow never offers an "open now" choice.

## The rip-or-hold decision

The screen where the player opens product is in
[18-ripping.md](18-ripping.md).

Once product is in Inventory, the player chooses to open it (gambling on pull
rates) or hold it sealed (letting it appreciate). This tension is
already designed in
[05-pricing-and-market.md](05-pricing-and-market.md#sealed-product--separate-pricing-logic)
as the "EV tension" — nothing new needed here, just noting where the
product being discussed in this doc feeds into that decision.

## Pull rates

Opening product needs a real probability model per set (rare slot
odds, hit rates for chase cards). Unlike per-card grading/population
data (thousands of cards), this is per-*set* — on the order of 150-180
sets, not thousands — so real data is the plan, not a formula
fallback.

This is a data-acquisition task scoped the same way as the card-price
pipeline in [05-pricing-and-market.md](05-pricing-and-market.md): pull
real pull-rate data per set as that set is actually added to the game,
rather than researching all ~150-180 sets up front. Likely sources to
check when that work starts: official print/pull-rate disclosures
where they exist, and community "pack weight sorting" analyses that
empirically verify real odds per set.

Unlike card prices, this data doesn't need a live feed — pack
structure for an already-printed set is fixed historical fact, so it's
researched once and written down, not re-pulled. See
[13-sets.md](13-sets.md) for the per-set doc index, and
[sets/base-set.md](sets/base-set.md) for the first worked example
(Base Set), including the modeling implication that box contents
should emerge from independent per-pack draws rather than a guaranteed
fixed collation.

## Open topics

- Exact restock-alert-bot upgrade design (how much it improves Pokemon
  Center odds).
- The exact Pokemon Center drop success chance (30% is the starting
  value).
- Whether eBay and Facebook Marketplace also sell singles, or only
  sealed product.
- The time each local store adds to a store run, and the stock odds
  per store (balancing tasks).
- How the local game shop's events connect to meets and reputation.- Actual pull-rate data per set, sourced as each set is added.
