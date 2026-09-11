# Pricing and Market Model

Goal: as close to real life as possible. Real card names, real sets, real
starting prices — not an invented in-game economy.

## The snapshot approach

Pick a moment in time and a scope, and capture real prices at that moment by
hand (e.g., from TCGPlayer or PriceCharting-style comps), since this is a
private build with no live data feed. That snapshot becomes day-zero truth.

## Scope

- **Prototype phase**: any convenient small set works — the point is to prove
  the mechanics, not the data breadth. A natural candidate is a full vintage
  set (e.g., Base Set) plus a handful of standout chase cards from elsewhere,
  to test how the model handles very different card types side by side.
- **Long-term goal**: as many sets and as many sealed products as possible.
  This is a content/data pipeline problem more than a coding problem — where
  baseline data comes from and how it stays from going stale is an open
  question, deliberately deferred until after the mechanics are proven.

## What drives real card prices (to mirror in simulation)

- **Scarcity**: print run size and pull rate per set. A 1st edition holo
  behaves nothing like a modern rare.
- **Condition and grade**: raw vs. PSA/CGC graded, and grade tier — a PSA 10
  can be many multiples of a PSA 8. Ties directly into the grading mechanic.
- **Nostalgia and set popularity**: vintage sets (Base Set, Jungle, Fossil)
  command a premium mostly from nostalgia, not gameplay.
- **Competitive relevance**: for cards actually played in the TCG, tournament
  results and format shifts move prices (bans, rotations, new archetypes).
- **Hype events**: reprints, anniversary sets, a streamer pulling or
  promoting a card, a new set's chase card driving speculation.
- **Macro cycles**: real card markets have slow boom/bust waves (e.g.,
  2020–2021). The simulation should have its own slow cycles, not just daily
  noise.

## Modeling shape

Each card gets a baseline price (from the snapshot) plus its own volatility
profile driven by the factors above — not one global random walk applied
equally to everything. A common bulk rare and a chase vintage holo should
not jitter the same way.

## Sealed product — separate pricing logic

Sealed product is not just "cards you have not opened yet." It has its own
dynamics:

- **Sealed premium**: a factory-sealed box or pack often sells for more than
  the expected value of its contents, because collectors pay to preserve the
  seal itself.
- **Age-driven appreciation**: sealed product tends to appreciate as a set
  ages out of print, independent of any single card inside it.
- **Print run and legitimacy risk**: older sealed product carries
  resealing/counterfeit risk in real life — a natural fit for a
  counterfeit-risk mechanic (not yet designed, see
  [00-overview.md](00-overview.md)).
- **EV tension**: a player who understands pull rates can calculate whether
  it is better to open a box or sell it sealed. That tension is a deliberate
  in-game decision point.
