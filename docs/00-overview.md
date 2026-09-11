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
- [04-reputation-and-followers-unlocks.md](04-reputation-and-followers-unlocks.md) — what each currency actually gates: reputation = exclusivity/quality, followers = scale/speed.
- [05-pricing-and-market.md](05-pricing-and-market.md) — realistic pricing model, real cards/sets/sealed product, prototype-first then scale up.
- [06-social-media.md](06-social-media.md) — the unified social media system: posts vs. live streams, virality, burnout, backlash, sponsorships, follower decay.
- [07-platform-and-scope.md](07-platform-and-scope.md) — iOS/Swift, private build status, the Pokemon IP consideration.
- [08-ui-direction.md](08-ui-direction.md) — visual direction, the home hub as the density ceiling and info+launch screen, confirmed tap targets.
- [09-upgrades.md](09-upgrades.md) — the upgrades system in general; will eventually cover every system in the game.
- [10-grading.md](10-grading.md) — the four subgrades (centering, corners, edges, surface), eyeball vs. paid vs. upgrade reveals, grading companies (PSA/BGS/CGC), grader variance. Fees/turnaround/prices are pulled live, not hardcoded — see the doc's "Data source" section.
- [11-card-archetypes-and-scaling.md](11-card-archetypes-and-scaling.md) — fallback-only mechanism for gem rate and grade-based price multipliers on cards not yet covered by real data, using a small set of per-card tags (era, finish, distribution, demand tier).
- [12-acquiring-product.md](12-acquiring-product.md) — how sealed product is acquired: three online storefronts with different price/availability tradeoffs, camping physical drops, reputation-gated wholesale access and case splits, and the rip-or-hold decision.

## Open topics (not yet explored)

- Exact reputation/follower tiering (how many levels, what gates each one).
- Tuning the archetype-formula coefficients (see [11-card-archetypes-and-scaling.md](11-card-archetypes-and-scaling.md#open-topics)) — a balancing task, not a research task.
- Counterfeit risk mechanics.
- Whether a disappointing grade can be appealed or resubmitted (see [10-grading.md](10-grading.md#open-topics)).
- Grading's interaction with counterfeit risk.
- The rest of the upgrades system beyond the grading-reveal examples.
- Screens for most of the home hub's tap targets (see [08-ui-direction.md](08-ui-direction.md)) — in progress.
- PokemonPriceTracker data-pull cadence: one-time pull vs. periodic re-pulls.
- Real pull-rate data per set, sourced as each set is added (see [12-acquiring-product.md](12-acquiring-product.md#open-topics)).
