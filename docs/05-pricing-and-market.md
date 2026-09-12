# Pricing and Market Model

Goal: as close to real life as possible. Real card names, real sets, real
starting prices — not an invented in-game economy.

## The snapshot approach

Pick a moment in time and pull real prices at that moment — not hand-entered,
but a real bulk data pull (see "Data source" below). That snapshot becomes
day-zero truth. Real prices drift out of date; that's expected and fine —
the plan is to re-pull current data when it matters, not to freeze a set of
numbers into these docs and treat them as permanent.

## Data source

**PokemonPriceTracker (PPT)** is the primary source: a bulk API covering
50,000+ English and Japanese cards, with raw prices, PSA/CGC/BGS/SGC graded
prices, and grading population data, all in one place. This project has PPT
Pro access (20,000 calls/day) — enough to pull the full ~18,000–20,000
unique English-card catalog (per set/variant counting, see
[11-card-archetypes-and-scaling.md](11-card-archetypes-and-scaling.md)) in a
single day, not a multi-week scrape.

This changes the scaling story from earlier drafts of this doc: getting real
per-card data for "as many sets as possible" is a data-pull task, not an
ongoing manual-research burden. The archetype-tag formula in
[11-card-archetypes-and-scaling.md](11-card-archetypes-and-scaling.md) still
matters, but only as a fallback for whatever PPT doesn't cover (a brand-new
set before PPT has data on it, an obscure promo, etc.) — not as the primary
mechanism.

## Scope

- **Prototype phase**: any convenient small pull works — the point is to
  prove the mechanics, not the data breadth. A natural candidate is a full
  vintage set (e.g., Base Set) plus a handful of standout chase cards from
  elsewhere, to test how the model handles very different card types side by
  side.
- **Long-term goal**: pull as much of the PPT catalog as makes sense for the
  game's scope. The remaining open question is refresh cadence (a one-time
  pull vs. periodic re-pulls to keep prices current), not data acquisition —
  that part is solved.

## What drives real card prices (to mirror in simulation)

- **Scarcity**: print run size and pull rate per set. A 1st edition holo
  behaves nothing like a modern rare.
- **Condition and grade**: raw vs. graded, and grade tier — a PSA 10 can be
  many multiples of a PSA 8. See [10-grading.md](10-grading.md) for the full
  grading mechanic (subgrades, companies, variance, economics).
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
dynamics. See [12-acquiring-product.md](12-acquiring-product.md) for how the
player actually gets sealed product in the first place.

- **Sealed premium**: a factory-sealed box or pack often sells for more than
  the expected value of its contents, because collectors pay to preserve the
  seal itself.
- **Age-driven appreciation**: sealed product tends to appreciate as a set
  ages out of print, independent of any single card inside it.
- **Print run and legitimacy risk**: older sealed product carries
  resealing/counterfeit risk in real life — see
  [14-counterfeit-risk.md](14-counterfeit-risk.md) for the full
  mechanic.
- **EV tension**: a player who understands pull rates can calculate whether
  it is better to open a box or sell it sealed. That tension is a deliberate
  in-game decision point.
