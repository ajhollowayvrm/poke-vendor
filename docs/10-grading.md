# Grading

## The four subgrades

Real card grading scores four independent things about a card, then
combines them into one overall number. The game mirrors this exactly,
because it is what makes grading a real skill rather than a dice roll:

- **Centering** — how evenly the border frames the artwork, tracked
  separately for front and back.
- **Corners** — the sharpness of all four corners.
- **Edges** — the condition of all four edges.
- **Surface** — scratches, print lines, indentations, and other
  surface defects.

## Eyeball vs. paid reveal vs. permanent upgrade, for every subgrade

Each subgrade follows the same pattern (first designed for centering,
see below, now generalized to all four):

- **A free eyeball estimate**, of varying reliability depending on the
  subgrade.
- **A paid, precise reading** for a single card, from an online
  grading/inspection service.
- **A permanent upgrade** (see [09-upgrades.md](09-upgrades.md)) that
  reveals that subgrade precisely, for free, on every card, forever.

What differs per subgrade is how much the eyeball estimate can tell
you:

- **Centering**: front is reasonably eyeballable. Back cannot be
  eyeballed at all — the card back's design is uniform across every
  card, so there is no visual cue to judge it by eye. Back centering
  shows as unknown until measured. (This was the first subgrade
  designed; see the collection screen's card-detail modal for the
  current UI treatment.)
- **Corners**: obvious whitening is eyeballable. Fine fraying is not —
  it needs magnification (a loupe).
- **Edges**: visible chips are eyeballable. Micro-whitening along an
  edge is not — it also needs a loupe.
- **Surface**: the hardest to eyeball. Most real surface defects
  (fine scratches, print lines, light indentations) are genuinely
  invisible without a raking light or similar tool.

A player can own some subgrade-revealing upgrades and not others —
e.g., own the centering tool but still be blind on surface condition —
so meaningful risk persists even for an experienced player until every
upgrade is bought.

## How the four combine into one grade

The overall grade is dominated by the *worst* subgrade, not an
average — mirroring real grading, where a single trashed corner caps
an otherwise pristine card. A card that looks perfect on centering,
corners, and edges can still come back capped by one hidden surface
flaw.

## Grading companies

Three real companies, each with a different speed/cost/trust
tradeoff:

- **PSA** — the slowest and most expensive, but carries the highest
  market-trust multiplier: the same physical grade is worth more with
  a PSA slab than any other company's. Publishes only the overall
  number on the label, not the four subgrades.
- **BGS (Beckett Grading Services)** — mid speed and cost. Publishes
  all four subgrades directly on the label, including the possibility
  of an all-10s "Black Label" perfect card. Worth choosing when a
  player wants to prove exceptional condition, not just claim a grade.
- **CGC (Certified Guaranty Company)** — the fastest and cheapest, but
  a lower resale multiplier than PSA for the same numeric grade on the
  same physical card. Good for volume-grading lower-value cards where
  speed matters more than squeezing out maximum resale value.

## Grader variance

Even with all four subgrades known precisely before submission, the
returned grade still carries a small amount of random variance,
representing real human subjectivity at the grading company. PSA is
the most consistent (tightest variance) — part of why it's the
default trusted choice. CGC's speed/cost advantage comes with
slightly looser consistency. BGS sits in between, offset by the
transparency of its published subgrades.

## Data source

No hardcoded fees, turnaround times, multipliers, or prices live in
this doc — any specific number written down today is stale tomorrow.
Instead:

- **Card prices and grading population data** (raw price, price per
  grade, gem-rate/population counts) come from PokemonPriceTracker
  (PPT), pulled live/current rather than frozen into a design doc. See
  [05-pricing-and-market.md](05-pricing-and-market.md) for the data
  source and [11-card-archetypes-and-scaling.md](11-card-archetypes-and-scaling.md)
  for how gaps in PPT's coverage are handled.
- **Grading company fees, declared-value tiers, and turnaround times**
  (PSA / BGS / CGC service pricing) are a different kind of data —
  the grading companies' own current pricing, not card market data —
  and should be pulled from those companies directly whenever the game
  actually needs current figures, rather than baked into this doc.

The game still models three speed tiers per company (Economy /
Standard / Express, collapsed down from each real company's larger
tier list) and declared-value upcharges (a real practice worth
keeping — under-declaring a valuable card to save on fees has a real
downside if it's lost or damaged in transit, a natural fit for the
game's existing risk/variance design, see
[01-premise-and-loop.md](01-premise-and-loop.md#variance-and-busts)).
Only the specific dollar figures and day counts are deliberately left
out of this doc.

## Turnaround

Submission is a free action (see
[01-premise-and-loop.md](01-premise-and-loop.md)) — no day-budget cost
to drop a card in the mail. The result comes back after a turnaround
measured in game days (current turnaround figures per company, pulled
when needed rather than hardcoded here). Each tap on End Day moves
every open grading submission forward by 1 day (see
[16-time-and-day.md](16-time-and-day.md#game-days)). The turnaround
does not use the day's hour budget. It shows up as an event in the recent-activity feed once
the card returns (see the Wallet screen mockup in
[08-ui-direction.md](08-ui-direction.md)).

## Counterfeit interaction

Submitting a card for grading also authenticates it: PSA/BGS/CGC reject
and flag a counterfeit during submission instead of returning a numeric
grade. This makes grading submission a real, if slow and non-free,
backstop against fakes even before a player owns any dedicated
authentication upgrade — see
[14-counterfeit-risk.md](14-counterfeit-risk.md#detection-the-same-reveal-pattern-as-grading)
for the full counterfeit mechanic, including why a grading company's
real/fake call is treated as final.

## Resubmission and appeal

Out of scope for now, not planned soon. A returned grade is final —
there is no in-game path to appeal or resubmit a card for a second
opinion. This keeps the grading result a real, committed-to outcome of
the risk/variance design, rather than something a player can grind
around.
