# Acquiring Product

**Status: built.** The five storefronts, the Walmart drawing and the Target.com drop, store runs with vendor days and purchase limits, camping a restock day, official card machines, two wholesale tiers, cases, the gray plug, case splits, Facebook pickups set for a later day, garage and estate sales, and the expected value readout. The numbers are in [19-prototype-values.md](19-prototype-values.md). Flippers, limits, and heat are in [34-flippers-and-retail-limits.md](34-flippers-and-retail-limits.md).

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

- **Pokemon Center**: MSRP pricing, but the store sells only in timed
  drops (see "Pokemon Center drops" below). When no drop is live, the
  store has nothing to buy. A successful attempt gets the best
  possible price.
- **Amazon**: broad availability, but pricing is inconsistent. The
  price is at or above market, and sometimes far above market. It
  changes by set and by day. The reliable middle ground.
- **Hyped Reseller**: always in stock, both current and older
  out-of-print product, but always at 2 times market or more. The
  fallback when you need product now, or need something no longer
  sold at retail at all. The reseller does not care if an item is
  fake, because it moves so much product (see
  [14-counterfeit-risk.md](14-counterfeit-risk.md)).
- **eBay**: individual sellers list their own product in a structured
  market. Some listings ship from another country: the same English
  product, 12% cheaper, with 10-day delivery.
- **Facebook Marketplace**: local people sell lots and random items at
  random prices. It is the least structured channel. A listing is for
  pickup or for shipping. A pickup is not a free action: the pickup
  costs time, the same as a garage sale, and the player pays at the
  pickup. Sometimes the seller sets the pickup for a later day, so the
  item arrives only after that meeting. A shipped listing is a free
  action: the player pays at purchase, and the item arrives after its
  delivery time (see "Where bought product goes" below).

eBay and Facebook Marketplace sell singles too, not only sealed product.

eBay and Facebook Marketplace have the best deals of all the channels.
They also have the highest chance of a fake or a resealed product (see
[14-counterfeit-risk.md](14-counterfeit-risk.md)).

#### Pokemon Center drops

Stock for a hyped release comes out as a drop. A drop stays open for
one day. During that day, the player gets one attempt to buy. The
attempt succeeds at a fixed chance. The starting value is 30%, and the
exact value is a balancing task. A miss costs no time and no cash.
When the day ends, the drop closes.

A successful order can still cancel. The store rolls once, 1 to 3 days
after the purchase and always before the item arrives. A normal order
cancels with a chance of 5%. The store then refunds the full price. A
player with the checkout bot (see [09-upgrades.md](09-upgrades.md))
makes the attempt with a chance of 60%. The store cancels 35% of bot
orders, and a cancelled bot order is a hidden act (see
[35-callouts.md](35-callouts.md)).

A drop comes with no notice. The player learns about a drop only when
it goes live, and the Pokemon Center screen shows no upcoming drops.
This mirrors real life, where only people in a drop-alert Discord
group know early.

Two possible upgrades (see [09-upgrades.md](09-upgrades.md)):

- A drop-alert Discord membership gives notice before a drop.
- A restock-alert bot adds 25% to the chance of a camp (see "Camp a
  store drop" below).

#### Big-store sites

Two big stores also sell online. Both sell hot in-print product at MSRP.

- **The Walmart Collectibles Draw.** One drawing each week. The player
  enters for free from Monday to Wednesday. The draw is at the End Day
  of Wednesday. Each entry wins with a chance of 8%. A win waits 2 days
  for the player to press "Pay and claim" on the hub. The game charges
  nothing before that. A win that the player does not claim lapses. The
  product arrives in 4 days.
- **The Target.com drop.** A drop is likely on Friday (a chance of 50%)
  and rare on other days (8%). It is one hot product, limit 1. An
  attempt works with a chance of 20%. The player gets 1 attempt a day,
  or 2 with the checkout bot. The product arrives in 3 days.

A Target.com order can cancel, with the same roll as a Pokemon Center
order. A chain at strictness level 3 also runs a drawing for its hot
items (see [34-flippers-and-retail-limits.md](34-flippers-and-retail-limits.md#drawings)).

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
or other flippers get the stock first. Flipper pressure sets this risk
(see [05-pricing-and-market.md](05-pricing-and-market.md#flipper-pressure)).
A bust costs the day and returns no product, consistent with the game's
existing risk design.

- **The chain cap.** A camp haul holds at most the purchase limit of the
  chain for each product. A camp is a visit, so a store run to the same
  chain later that day is a repeat visit.
- **The pressure factor.** Flipper pressure scales the chance of success
  by `1.2 - 0.6 × pressure`. A high pressure makes a camp harder (see
  [05-pricing-and-market.md](05-pricing-and-market.md#flipper-pressure)).
- **Rival lines.** A rival flipper of the store stands in line with a
  chance of 50%. The camp screen says who was there.
- **A ban.** A chain that refuses the player blocks the camp.

#### Official card machines

A grocery store and a pharmacy each have an official Pokemon card
machine. A machine restocks about every 10 days. The calendar posts the
restock 2 days ahead, with the hour. The player waits 2 hours at the
machine. The wait cannot overlap a work shift. A wait works with a
chance of 70%, and flipper pressure scales it like a camp. A success
gives 1 to 3 products at MSRP, at most 2 of each. The player pays cash.
A machine adds no scalper heat.

### Local stores (store run, time-cost)

Big retail stores sell sealed product at MSRP. GameStop sells hot
product at 1.35 to 1.6 times MSRP. The local game shop
prices sealed product near market, but it does not charge scalper
prices. The player learns what a store has only on arrival, unless the
player has a restock alert.

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

The full rules for big stores are in
[34-flippers-and-retail-limits.md](34-flippers-and-retail-limits.md). In short:

- **Vendor days.** Each big store gets a batch of stock on one weekday
  from Tuesday to Saturday, at 8, 10, 13, or 16. The slot is hidden. The
  player learns a vendor day by seeing a fresh batch. A player who knows
  the slot can wait up to 2 hours for the vendor.
- **Batches.** A batch has a fixed number of units, and 1 to 6
  products. A hot item drains while the store is open. A rival flipper
  can empty a shelf first. In that case, the visit shows a rival line.
  Flipper pressure sets how fast the shelf drains.
- **Limits.** Each chain limits the units for each visit or each item
  each day, and the limit is lower for hot items. Incidents at a chain
  raise its strictness level from 0 to 4. Level 2 is one checkout a day,
  which is the report's "per payment card" limit.
- **Heat and bans.** A buyout, a repeat visit, and a bot use add
  scalper heat. The cashier gives hints. Heat 10 at one chain bans the
  player there for 21 days.
- **The club.** The warehouse club needs a membership ($65 for 364
  days). A member buys 2 of each item a day and 1 hot item a day.

#### The local game shop

The local game shop is a local store with more features:

- Better stock odds than the big stores, but in small quantities.
- Regulars get holds on hot product. The player earns this through
  standing with the shop owner. At Regular, the owner holds a sealed
  product for the player (see
  [28-messages-and-encounters.md](28-messages-and-encounters.md)). There
  are no preorders, because no new sets release during a run (see
  [17-calendar-and-events.md](17-calendar-and-events.md#no-new-set-releases)).
- At Regular, a shop opens one hot in-print product and sells it at
  MSRP, once a week. The player must rip the product. The item shows as
  "Opened · rip it", so the player cannot sell it.

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
| Trusted | 60–89 | 70% of market | Yes, and first pick on hot product | Yes; the shop keeps 12% |
| Friend | 90–100 | 75% of market | Yes, and private offers | Yes; the shop keeps 12% |

A shop's standing is also its relationship with the player, with the
price bonus and saved items of each level (see
[21-relationships-and-reputation.md](21-relationships-and-reputation.md#relationship-levels)).

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
- **A full shelf.** A game shop has stock on about 92% of days: 5 to 9
  products. About 80% are in-print product of any kind (packs,
  blisters, tins, bundles, Elite Trainer Boxes, collections, Build &
  Battle Boxes, and booster boxes), priced at 92% to 105% of market.
  About 20% are older out-of-print sealed, priced at 100% to 120% of
  market. It carries no store exclusives.
- **Just came in**, a box that changes each week: 1 to 4 things that
  local sellers sold to the shop. It leans vintage: about 45% are
  vintage singles (worn, with loose centering), 20% older singles, 20%
  vintage or older slabs, and 15% vintage or older sealed. The shop
  knows values and prices at 100% to 120% of market, but about 1 time
  in 7 it prices something to move, at 70% to 85%. It is on the shop
  screen and on a store run stop.
- A display case of singles that changes each week: mostly new sets,
  with some older and vintage cards. So the shop is also a place to buy
  singles.
- A weekly item that the player buys stays bought for the rest of the
  week.
- Events: a weekly league night (see
  [17-calendar-and-events.md](17-calendar-and-events.md#recurring-entries)).
- It buys cards too: a buylist for instant cash, bulk for store credit
  only, and consignment (see
  [15-selling.md](15-selling.md#the-local-game-shop)).

### Distributor / wholesale (two tiers)

A distributor sells sealed product by the case. There are two tiers. Orders
arrive in 5 days as sealed cases (see "Cases" below). 1 order in 100 goes
missing. The player learns that the order is lost on its delivery day, and
the distributor refunds it 14 days later. A short shipment refunds the
missing units.

**Secondary wholesaler.** The player opens it at reputation tier 3,
Respected (see
[04-reputation-and-followers-unlocks.md](04-reputation-and-followers-unlocks.md#reputation-tiers)),
or from the day that a store build-out is done while the hobby account
waits. The price is 72% of the retail MSRP, and never under 62% of market.
The minimum order is $250. The player can buy 1 case of each product and
2 cases a week. There is no application and no rep.

**Hobby distributor account.** The account needs a signed lease, a finished
build-out, a seller's permit (see [26-taxes.md](26-taxes.md#the-sellers-permit)),
and an application. The decision comes 14 days after the application (the
calendar shows the day). An application that finds the store closed on the
decision day lapses. A save from before the application keeps its account
for a store that is already open. The price is 58% of the retail MSRP, and
never under 50% of market. There is no minimum order. The allocation sets the weekly
limit for each product:

- **Hot product** (market 1.2 times MSRP or more): 1 case of each product
  a week. A request for a hot case fills only in part. Each requested case
  arrives with a chance of `0.05 + 0.35 × (1 − flipper pressure) + 0.20 × rep`,
  at most 90%. The rep term is the rep's points divided by 100. The
  distributor charges only for the filled cases. The request still uses the
  allocation.
- **Other product:** 1 case a week, and 1 more for each $6,000 that the
  player spent with the distributor, at most 5. Then 1 more case. The most
  is 6 cases of one product a week.
- **Elite** (reputation tier 4): one hot case each week skips the fill roll.
  The game keeps this case for one product. The Elite case adds 1 to the
  allocation of that product, so the normal case of that product still rolls.

**The rep.** An approved account has a rep, a supplier contact (see
[21-relationships-and-reputation.md](21-relationships-and-reputation.md)).
The rep starts at 20 points. The rep gains 1 point for each $1,000 spent,
at most 3 a week, and 1 point for a week with a store event. "Push for
more allocation" costs 5 points. It adds 25% to the fill rate of one
product for a week, and the player can push once in 28 days.

**The back-door rule.** The distributor wants hot product to reach
customers. Each week, the distributor checks the hot units of the last 28
days.

- A sale to resellers (eBay, TCGplayer, Facebook, a dealer trade, or a whole
  case) counts against the store. A sale at the shelf, the counter, a
  vending machine, a Rip & Ship stream, or the show table counts for it. A
  rip counts for it.
- The check needs at least 6 sold units, and at least half of the delivered
  units. It acts when the share that reached customers is under 40%.
- The act is a hidden act (`backDoorAllocation`). The rep notices with a
  chance of 25%, and the player gets a warning (−15 rep points). The sales of
  that warning do not count again.
- The second warning in 12 weeks freezes hot product for 4 weeks. The third
  closes the account for 12 weeks. The player then buys from the secondary
  wholesaler.
- A rep who learns that the player buys from the plug costs 20 points
  (a chance of 10% each week, for 4 weeks after a plug order).

A player at Respected with no store keeps the secondary terms. A store
account shows its shelf share on the store screen (see
[22-own-store.md](22-own-store.md#wholesale)).

### Cases

A case is one sealed item with its own price. It is a bundle of units that
the player can sell whole, open, or hold.

| Product | Units in a case |
| --- | --- |
| Booster box | 6 |
| Elite Trainer Box | 10 (Pokemon Center ETB: 4) |
| Booster bundle (6 packs) | 25 |
| Booster pack (1 pack) | 144 |
| Blister | 24 (1-pack blister: 16) |
| Build & Battle Box | 10 |
| Collection | 6 (Ultra-Premium: 4, Tech Sticker: 12, Knock Out: 24) |
| Tin | 6 (mini tin: 10) |

These products have no case: art bundles and every "Set of N" product, Fun
Packs, half boxes, enhanced boxes (unless a real case row exists), bundles
that do not hold 6 packs, club bundles, and master cartons. A case that the
price refresh does not list takes its size from the table.

- **The price.** A real case price when the price refresh has one
  (`cases.py` keeps a real row when its price is 0.4 to 2.5 times the price
  of its units). Otherwise: units × the unit market × a factor. The factor
  depends on the product and its print status:

| Product | In print | Out of print under 2 years | Out of print 2 years or more |
| --- | --- | --- | --- |
| Booster box | 0.95 | 1.05 | 1.15 |
| Elite Trainer Box | 1.05 | 1.15 | 1.25 |
| Booster bundle | 0.95 | 1.05 | 1.10 |
| Other | 1.00 | 1.05 | 1.10 |

- **Opening is free.** A case opens into its units. The units stay sealed.
  The case premium goes away. The units split the paid amount, and the last
  unit takes the rounding. A case that loses more than $50 of premium asks
  for confirmation. A case that is listed, on the way, consigned, or at
  auction stays closed.
- **Case fresh.** A case from a trusted source, and its units, carry the
  "case fresh" tag. A unit with the tag sells 5% more often. The tag moves
  no price. A distributor case is case fresh.
- **Strangers.** A sealed dealer at a show has a case with a chance of 20%.
  An eBay or Facebook day lists a case with a chance of 10%. The ask is 85%
  to 105% of the case price on eBay, and 70% to 95% on Facebook. A stranger
  sells no case over $15,000. One fake roll covers the whole case. The tape
  and label check shows the tell of a fake case half of the time. A
  professional reseal shows nothing. A listing can say that the case is
  "loaded". This is only the seller's words, and it is never true.
- **Packs.** Each pack of an opened case is an independent draw.

### The plug

A plug is a gray seller of full cases. The plug appears each day with a
chance of 10%, from day 14, at follower tier 1 or reputation Known. A
plug messages the player, and the Buy screen shows a "Gray market" entry.
The plug sells only full cases of hot in-print products that exist now, so
it is not a preorder.

| Term | Value |
| --- | --- |
| Offers each week | 3 (1 when flipper pressure is under 0.3) |
| Price | 85% of the retail MSRP, never under 65% of market |
| Largest order | 5 cases and $20,000 |
| Payment | Prepaid in cash, with no invoice |
| Delivery | 5 to 10 days |
| Fake rate | 5.5% base, about 4% for a hot case. One roll covers the case. |

- **The plug vanishes.** When an order arrives, the plug can vanish with
  all prepaid orders. The chance is 6%, plus 1 point for each $1,000 over
  $2,000, at most 16%. Each clean order takes 1 point off, down to 3%. A new
  plug can appear 28 days later.
- **A short order.** An order ships short with a chance of 10%. The plug
  sends back the missing share.
- **Seizure.** A delivered order is seized with a chance of 2%. The police
  take the stock 3 to 14 days later, wherever it is. There is no refund and
  no insurance claim. A Rip & Ship order of seized stock is refunded.
- **Hidden acts.** A plug order is the act `plugPurchase`. A seizure is the
  act `plugSeized`, and it replaces the purchase act.
- **Tax.** A plug order is not an invoice, so income tax never counts it as a
  cost (see [26-taxes.md](26-taxes.md)).

### Garage sales, estate finds, meets and shows

The existing Sourcer and Flipper channels
([02-playstyles.md](02-playstyles.md)) occasionally surface old sealed
product instead of singles — no separate mechanic needed, just another
possible find at an existing activity. This is also the main source of
counterfeit/reseal risk on sealed product — see
[14-counterfeit-risk.md](14-counterfeit-risk.md).

### Collections

People bring whole collections to the player's table and store, and
eBay sells collection lots blind. See
[33-collections.md](33-collections.md).

### Case splits (reputation-gated)

A few trusted people pool money to buy a full case together, then
divide the actual boxes among themselves afterward — informal, no
livestream, no organizer margin, no random assignment. (Deliberately
excluding the livestreamed "group break" format some real hobbyists
run — not a fit for this game.) A box from a split carries the "case
fresh" tag.

Rip & Ship (see [06-social-media.md](06-social-media.md#rip--ship)) is not a
group break. One buyer buys one whole product, and every card goes to
that buyer. No spot, team, or prize depends on the result.

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

### Look inside a box

**Status: built** (`Model/BoxContents.swift`, `Inventory/LookInsideSheet.swift`).

The player can tap a box to pick it up and tilt it. A box is any
product with 2 packs or more that is not a loose pack.

- **The front 2 packs show.** A blister shows all of its packs.
- **The other packs are hidden.** What the player knows about them
  depends on the box:
  - A box that lists its packs, for example an Elite Trainer Box,
    holds exactly those packs.
  - A box that says only "assorted packs", for example most
    collections and tins, holds the packs that it names. Each other
    pack comes from one of the newest 4 sets of the box's era that
    were out when the box came out. The view gives the odds.
- **One era only.** A Sun & Moon box never holds a Scarlet & Violet
  pack.
- **Each copy is different.** Two copies of the same assorted box can
  hold different packs. A copy keeps its packs from the moment the
  player first sees it.
- **Where the tap works:** Inventory, the shelf at a local store, the
  shop's weekly buy-ins, vendor tables at shows, meets, and sales, and
  a visitor who sells a box. The packs that the player sees are the
  packs that they buy.
- **Online and wholesale:** the player cannot hold the box, so the view
  shows only what the box says.

The catalog picks the era and the pool (`guess_mix` in
`tools/export/catalog.py`).

## Where bought product goes

Every purchase goes to Inventory. The buy flow never offers an "open
now" choice.

- **A store run purchase** goes to Inventory at once.
- **A Facebook Marketplace pickup** goes to Inventory after the pickup.
- **An online purchase ships.** The player pays at purchase. The item
  shows in Inventory as "On the way", with the days left. It arrives
  after its delivery time in game days (see
  [16-time-and-day.md](16-time-and-day.md#game-days)).

| Storefront | Delivery time |
| --- | --- |
| Pokemon Center | 5 days |
| Target.com drop | 3 days |
| Walmart drawing win | 4 days |
| Amazon | 2 days |
| Hyped Reseller | 3 days |
| eBay | 4 days, or 10 days from another country |
| Facebook Marketplace, shipped listing | 4 days |

All delivery times are starting values for balancing.

## The rip-or-hold decision

The screen where the player opens product is in
[18-ripping.md](18-ripping.md).

Once product is in Inventory, the player chooses to open it (gambling on pull
rates) or hold it sealed (letting it appreciate). This tension is
already designed in
[05-pricing-and-market.md](05-pricing-and-market.md#sealed-product--separate-pricing-logic)
as the "EV tension" — nothing new needed here, just noting where the
product being discussed in this doc feeds into that decision.

### The expected-value upgrade

This permanent upgrade (see [09-upgrades.md](09-upgrades.md)) shows
the expected value of opening each sealed item. The value shows on the
sealed rows and on the sealed detail screen in Inventory (see
[08-ui-direction.md](08-ui-direction.md#3-inventory--decisions-recorded-lo-fi-mockup-reviewed)).
Without the upgrade, the player calculates the expected value from the
pull rates. The cost of the upgrade is a balancing value.

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

- The exact Pokemon Center drop success chance (30% is the starting
  value).
- Whether a package that the player buys can get lost in transit, the
  same as a package that the player sells (see
  [15-selling.md](15-selling.md#shipping)).
- The time each local store adds to a store run (a balancing task).
- How the local game shop's events connect to meets and reputation.- Actual pull-rate data per set, sourced as each set is added.
