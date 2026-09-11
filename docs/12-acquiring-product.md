# Acquiring Product

How the player gets sealed product (packs, boxes, cases) to sit on or
rip open — the Grinder archetype's core loop (see
[02-playstyles.md](02-playstyles.md)), and the supply side of the
sealed-product pricing model in
[05-pricing-and-market.md](05-pricing-and-market.md).

## Acquisition channels

### Online — three storefronts, three tradeoffs

Online buying is a free action (see
[01-premise-and-loop.md](01-premise-and-loop.md)), but "online" isn't
one option — it's three, each with a different price/availability
tradeoff, mirroring how this actually works in real life:

- **Pokemon Center**: MSRP pricing, but for any hyped release it sells
  out almost immediately. Most attempts to buy a hot set here simply
  fail — not a time-budget cost, just a near-certain miss. A rare
  success gets you the best possible price. An upgrade (a restock-alert
  bot, see [09-upgrades.md](09-upgrades.md)) could meaningfully improve
  these odds later.
- **Amazon**: broad availability, but pricing is inconsistent — ranges
  from roughly MSRP to noticeably marked up, varying by set and moment.
  The reliable middle ground.
- **Hyped Reseller**: always in stock, both current and older
  out-of-print product, but always significantly overpriced. The
  fallback when you need product now, or need something no longer
  sold at retail at all.

### Camp a store drop (physical, time-cost)

A time-cost action (see [01-premise-and-loop.md](01-premise-and-loop.md))
— a real shot at MSRP in person. Carries real variance: sold out
before you arrive, beaten by other buyers, or a clean success. A
genuine bust is possible here, consistent with the game's existing
risk design.

### Distributor / wholesale (reputation-gated)

Unlocked at higher reputation tiers (see
[04-reputation-and-followers-unlocks.md](04-reputation-and-followers-unlocks.md)):
true wholesale pricing and priority case allocation on hot releases,
once the player is established enough to be trusted with it.

### Garage sales, estate finds, meets and shows

The existing Sourcer and Flipper channels
([02-playstyles.md](02-playstyles.md)) occasionally surface old sealed
product instead of singles — no separate mechanic needed, just another
possible find at an existing activity.

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

## The rip-or-hold decision

Once product is owned, the player chooses to open it (gambling on pull
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

## Open topics

- Exact restock-alert-bot upgrade design (how much it improves Pokemon
  Center odds).
- Whether distributor/wholesale access has its own reputation tier
  thresholds distinct from the meet-access tiers already sketched in
  [04-reputation-and-followers-unlocks.md](04-reputation-and-followers-unlocks.md).
- Actual pull-rate data per set, sourced as each set is added.
