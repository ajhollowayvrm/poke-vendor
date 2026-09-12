# PokeVendor — Concept Reference

Status: idea exploration. No code exists yet. This folder is the design record.

Private build. Full real Pokemon branding, for now. Not for public release in its
current form — see [07-platform-and-scope.md](07-platform-and-scope.md) for the
IP note.

## What this game is

You start as a solo Pokemon card trader, before any storefront. You build up
through sourcing, flipping, content creation, and arbitrage, using all of them
together. "Making it" is a personal feeling, not a fixed win screen — the game
tracks four separate currencies, and any one of them can be your route there.

## Docs in this folder

- [01-premise-and-loop.md](01-premise-and-loop.md) — starting point, what "making it" means, the day/time-tick structure, free actions vs. time-cost actions vs. multi-day shows, planning vs. surprises, variance and busts.
- [02-playstyles.md](02-playstyles.md) — the four archetypes (Sourcer, Flipper, Creator, Grinder), fully combinable, no path locking.
- [03-currencies.md](03-currencies.md) — cash, followers, reputation, collection value. Independent, connected only through what they unlock.
- [04-reputation-and-followers-unlocks.md](04-reputation-and-followers-unlocks.md) — what each currency actually gates: reputation = exclusivity/quality, followers = scale/speed. Five tiers each, with unlocks assigned per tier.
- [05-pricing-and-market.md](05-pricing-and-market.md) — realistic pricing model, real cards/sets/sealed product, prototype-first then scale up.
- [06-social-media.md](06-social-media.md) — the unified social media system: posts vs. live streams, virality, burnout, backlash, sponsorships, follower decay.
- [07-platform-and-scope.md](07-platform-and-scope.md) — iOS/Swift, private build status, the Pokemon IP consideration.
- [08-ui-direction.md](08-ui-direction.md) — visual direction, the home hub as the density ceiling and info+launch screen, confirmed tap targets, the Wallet / cash ledger destination screen, and the buy screen decisions.
- [09-upgrades.md](09-upgrades.md) — the upgrades system in general; will eventually cover every system in the game.
- [10-grading.md](10-grading.md) — the four subgrades (centering, corners, edges, surface), eyeball vs. paid vs. upgrade reveals, grading companies (PSA/BGS/CGC), grader variance. Fees/turnaround/prices are pulled live, not hardcoded — see the doc's "Data source" section.
- [11-card-archetypes-and-scaling.md](11-card-archetypes-and-scaling.md) — fallback-only mechanism for gem rate and grade-based price multipliers on cards not yet covered by real data, using a small set of per-card tags (era, finish, distribution, demand tier).
- [12-acquiring-product.md](12-acquiring-product.md) — how sealed product is acquired: five online storefronts (Pokemon Center timed drops, Amazon, Hyped Reseller, eBay, and Facebook Marketplace), camping as a time-cost event on the home hub, local store runs (big retail and the local game shop, MSRP but rare stock), reputation-gated wholesale access and case splits, collector items such as UPCs and SPCs, and the rip-or-hold decision from Inventory.
- [13-sets.md](13-sets.md) — index of per-set doc files under `docs/sets/`, one file per set, covering pull rates and any other set-specific quirks.
- [sets/base-set.md](sets/base-set.md) — Base Set (1999): researched real pull-rate structure (pack slots, holo odds, box/case collation, 1st Edition vs. Unlimited), the first set file.
- [14-counterfeit-risk.md](14-counterfeit-risk.md) — fake singles and resealed sealed product: which channels carry the risk, the eyeball/paid/upgrade detection pattern reused from grading, fake quality tiers, and consequences (loss, or a scam accusation if resold unknowingly).
- [15-selling.md](15-selling.md) — the selling channels: TCGPlayer (price ladder), eBay, Facebook Marketplace, Whatnot live auctions, social media, the local game shop (buylist, bulk for store credit, consignment), and local meets. Card shows are out of scope for now.
- [16-time-and-day.md](16-time-and-day.md) — time in hours on a clock: 16 waking hours (7 AM–11 PM), the End Day button, travel included in each action, starting hour values, game days (End Day moves grading and every other wait forward by 1 day), the weekday day job (weekly pay, a four-job ladder, sick days and time off booked in advance, a dice roll to get hired), rent ($1,200 every 4 weeks, with a 3-day warning; miss it and the game is over), and the late-night choice (start tired, or sleep in).
- [17-calendar-and-events.md](17-calendar-and-events.md) — the weekly calendar: recurring entries (work shift, Friday paycheck, league night, fixed weekly meets), posted entries 2–3 days ahead (garage sales, estate sales, store restock days) where early arrival gets the best cards, scheduled entries (card shows, rent), surprise entries (Pokemon Center drops, store run stock, alert-banner events), and the fixed set list with no new releases.

## Open topics (not yet explored)

- Tuning the reputation-point cost/reward of each action, the archetype-formula coefficients, and counterfeit-risk probabilities (see [04-reputation-and-followers-unlocks.md](04-reputation-and-followers-unlocks.md#status), [11-card-archetypes-and-scaling.md](11-card-archetypes-and-scaling.md#open-topics), and [14-counterfeit-risk.md](14-counterfeit-risk.md#open-topics)) — balancing tasks, not research tasks.
- Whether a player can knowingly pass on a counterfeit as a deliberate choice (see [14-counterfeit-risk.md](14-counterfeit-risk.md#open-topics)).
- The rest of the upgrades system beyond the grading-reveal examples.
- Screens for most of the home hub's tap targets (see [08-ui-direction.md](08-ui-direction.md)) — in progress; Wallet / cash ledger done, 10 remaining.
- PokemonPriceTracker data-pull cadence: one-time pull vs. periodic re-pulls.
- Real pull-rate data for sets beyond Base Set, added under `docs/sets/` as each is needed (see [13-sets.md](13-sets.md)); Base Set itself is done (see [sets/base-set.md](sets/base-set.md)).
- Base Set's own two remaining question marks: the common/energy split, and whether the 16 rares are equally weighted (see [sets/base-set.md](sets/base-set.md#open-topics)).
