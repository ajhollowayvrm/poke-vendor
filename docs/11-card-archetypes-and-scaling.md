# Card Archetypes and Scaling

## Status: fallback mechanism only

The game's primary source for both gem rate (grading odds/population)
and graded-price multipliers is real, current data pulled from
PokemonPriceTracker (PPT) — see
[05-pricing-and-market.md](05-pricing-and-market.md). For any card PPT
covers, the real numbers are used directly. Nothing below is needed
for those cards.

This doc exists for the gap: a card not yet covered by PPT (a
brand-new set, an obscure promo not yet tracked, etc.). Rather than
leaving those cards with no gem rate or price curve at all, they fall
back to the archetype-tag formula below.

## The problem this solves, for uncovered cards

Two real-world facts don't scale if modeled naively:

1. **Gem rates differ by card, and by era.** A modern card might come
   out of the box near-perfect most of the time; a 1999 vintage card
   might rarely grade a 10.
2. **The graded-price multiplier swings wildly by card.** A raw-to-
   PSA-10 jump might be 10x for one card and 100x for another —
   promos are the extreme case: mass-distributed, so the raw floor is
   tiny, but genuinely scarce in top grade, so the multiplier
   explodes. This can't be a single global number, and it can't be a
   per-card lookup either.

## The fallback fix: archetype tags, not per-card data

Every card gets four tags. Most of these are things the game already
needs for other reasons — this isn't new research, it's reusing
metadata:

- **Era**: Vintage (pre-2003) / Modern-classic / Current. Governs
  baseline print QC — vintage cards were cut and centered with looser
  factory tolerances, so they start with worse baseline centering
  variance and a lower baseline gem rate.
- **Finish**: Non-holo / Holo / Reverse holo / Special (full art,
  gold, etc.). Foil finishes scratch and scuff more easily in
  handling, so holo/special finishes carry a gem-rate penalty.
- **Distribution**: Standard pack pull / Promo (event, mail-away,
  prerelease) / Oversized. This is the key tag for the multiplier
  problem — see below.
- **Demand tier**: Bulk / Notable / Chase / Icon. How much collectors
  specifically want a top grade of *this* card, independent of how
  rare it is. This overlaps with the existing "hype events" and
  "nostalgia" pricing factors in
  [05-pricing-and-market.md](05-pricing-and-market.md).

A new card added to the game gets tagged with these four values in
seconds — its grading odds and its price curve fall out of the
formulas below automatically. No per-card lookup, ever.

## Gem rate as a formula

```
gem_rate = base_era_rate × finish_modifier × distribution_modifier
```

Plus a small amount of per-copy random jitter, so two cards sharing
all four tags don't feel mechanically identical. No numbers are fixed
here — tune `base_era_rate` and the modifiers by playtesting, and
sanity-check them against whatever real PPT population data is
available for similar covered cards, rather than freezing a specific
percentage into this doc.

## Price multiplier as a formula, not a stored number

```
price_at_grade(g) = raw_price × [1 + demand_factor × (1 / population_share(g))^k]
```

`population_share(g)` comes straight out of the gem-rate formula
above. `demand_factor` comes from the Demand tier tag. `k` is a small
tunable exponent shared across the whole game, not per card.

This is exactly the mechanism that produces the real-world pattern
you're describing without ever storing "this card is 100x": a promo
has a tiny raw floor (mass given away, so plenty of played copies
exist) and a razor-thin top-grade population (casually handled, mailer
creases, kids' cards) — low raw price and low population share both
push the multiplier up, and if it's also tagged Chase or Icon for
demand, the multiplier compounds further. A boring modern bulk holo
has the opposite shape on every tag, so its multiplier stays small.

## Formula stays internal; outputs can still be shown

Per your call: the formula and its coefficients are never exposed to
the player, and there's no in-game settings screen for it. But
*outputs* of the formula — a population count, a rough gem-rate
percentage — can absolutely appear in-game as flavor, the same way
real PSA/BGS/CGC population reports are public. The distinction is
"you can see the result" vs. "you can see or tune the machine
producing it."

## Open topics

- The exact numeric values for `base_era_rate`, each modifier, and
  `k` — these are balancing work, not research; tune by playtesting
  rather than trying to derive them from real data.
- Whether print-sheet position (a real vintage-card phenomenon) is
  worth adding as a fifth tag later — deferred for now since it needs
  set-specific sheet-layout knowledge the other four tags don't.
