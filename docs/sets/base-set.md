# Base Set (1999)

Set-specific quirks and data for Base Set — one file per set (see
[../13-sets.md](../13-sets.md) for the general approach and index).
Currently just pull rates; anything else set-specific belongs here too
as it comes up (print-run notes, known errors, whatever's unique to
this set).

## Pull rates

The first concrete worked example for the pull-rate model described in
[../12-acquiring-product.md](../12-acquiring-product.md). Wizards of
the Coast never published exact odds for vintage product, so
everything here is community-derived rather than official — each
figure is labeled with its confidence level.

Unlike card prices, this data doesn't need a live source: pack
structure for a set printed in 1999 is fixed historical fact, not
something that drifts day to day. It only needs researching once.

## Pack structure

11 cards per Base Set booster pack. The community is split on the
exact non-rare breakdown:

- **Variant A** (more commonly cited): 1 rare, 3 uncommon, 5 common,
  2 energy.
- **Variant B**: 1 rare, 3 uncommon, 6 common, 1 energy.

Base Set energy cards carry common rarity, so this is partly a
labeling disagreement rather than a real structural conflict. **Use
Variant A as the default** for the simulation.

## Rare slot odds

The rare slot is always filled — every pack has exactly one rare-slot
card, which is either a holo rare or a non-holo rare.

- **Holo**: ~33% (1 in 3 packs). This is the one figure with real
  empirical backing: a community pack-weight-sorting study (Loose
  Packs) recorded 96 holos out of 288 opened packs — exactly 33.3%.
- **Non-holo rare**: ~67% (the remainder).

Base Set has 16 total rares: 4 holo, 12 non-holo. (Community sourcing
on the holo/non-holo split among named rares should be double-checked
against this before implementation — the ratio here describes overall
holo-vs-non-holo odds, not confirmed per-card weighting.)

## Specific card odds (weakest confidence)

Community estimates: a named holo (e.g. Charizard) roughly 1 in 45
packs; a named non-holo rare roughly 1 in 24 packs. These assume even
weighting across all 16 rares, which **no source actually confirms**.
Real print sheets may weight individual cards unevenly (this is the
same open question flagged as a deferred fifth archetype tag —
print-sheet position — in
[../11-card-archetypes-and-scaling.md](../11-card-archetypes-and-scaling.md)).

**Default for the simulation**: treat all 4 holos as equally likely
within the holo slot, and all 12 non-holo rares as equally likely
within theirs, until better data says otherwise.

## Box and case structure

- 36 packs per booster box (396 cards).
- 6 boxes per case.
- Mean ~12 holos per box, but the real recorded range across opened
  boxes is 6 to 18 — collation is **not** a fixed, guaranteed count.

**Implementation implication**: don't hardcode "12 holos per box."
Model each pack's rare slot as an independent draw, and let the
per-box holo count emerge from that — this reproduces the real 6–18
spread naturally, and it's a good fit for the game's existing
variance/bust design (see
[../01-premise-and-loop.md](../01-premise-and-loop.md#variance-and-busts)):
opening a whole box is still a gamble, not a guaranteed haul.

## 1st Edition vs. Unlimited

No source found showing a pull-rate difference. The two only differ
by the "1st Edition" stamp and a much smaller 1st Edition print run —
that affects scarcity/collector value (see
[../05-pricing-and-market.md](../05-pricing-and-market.md)), not the odds of
what comes out of a pack. Model both with identical pack-structure
odds.

## Sources

- [Loose Packs — Pokemon Pack Weight Guide](https://loosepacks.com/blogs/guides/pokemon-pack-weight-guide) (the empirical 288-pack study)
- [Bulbapedia — Booster pack (TCG)](https://bulbapedia.bulbagarden.net/wiki/Booster_pack_(TCG))
- [CardGuide Wiki — Base Set](https://cardguide.fandom.com/wiki/Base_Set_(Pok%C3%A9mon_TCG))
- [Keepitsealdz — Pack Weight Guide](https://keepitsealdz.com/pages/pack-weight-guide)
- [ThePriceDex — Base Set Pull Rates](https://www.thepricedex.com/set/base1/base/pull-rates)
- [Flipside Gaming — Rarity in the Pokemon TCG](https://flipsidegaming.com/blogs/pokemon-blog/a-comprehensive-review-of-rarity-in-the-pokemon-tcg)
- [DA Card World — Base Set Booster Box](https://www.dacardworld.com/gaming/wotc-pokemon-base-set-1-booster-box)
- [PullMarket — Pokemon Original Sets Guide](https://pullmarket.io/learn/pokemon-original-sets-guide)

## Open topics

- Resolve the 5-common-2-energy vs. 6-common-1-energy discrepancy —
  likely doesn't matter much for the simulation either way, but worth
  a firm answer before implementation.
- Whether the 16 rares are actually equally weighted on the real print
  sheet (unconfirmed either way).
