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
  designed; see the Inventory detail screen in
  [08-ui-direction.md](08-ui-direction.md#3-inventory--decisions-recorded-lo-fi-mockup-reviewed)
  for the current UI treatment.)
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

## Cut and wear

**Cut** is the centering of a card, as two numbers on each face: left
to right (LR) and top to bottom (TB). Each number is the share of one
border, for example LR 55/45. Every card has a true cut from the moment
it is made, and the true cut never changes. The centering subgrade
comes from the worse axis of each face. The front allows 55/45 for a
10, and the back allows 65/35 for a 10.

What the player can read of the cut depends on the centering tool (see
[09-upgrades.md](09-upgrades.md#centering-tools)):

| Tool | Front | Back |
| --- | --- | --- |
| None (eyeball) | Words only | "Can't tell by eye" |
| Centering ruler | Numbers, off by up to about 2 points, for example "LR ≈54/46 ±2" | Words only |
| Centering scanner | Exact numbers | Exact numbers |

- **No numbers show until the player owns the centering ruler.** The
  words come from the worse axis: "Looks centered" (53/47 or better),
  "Slightly off center" (to 57/43), "Off center" (to 63/37), and "Way
  off center" (worse). The back words start 10 points later, because
  the back allows more.
- The eye can be wrong: the words use the cut as the player sees it,
  off by up to 3 points on the front and 6 on the back. So a card near
  the line between two words can read as either one.
- The error of a reading is fixed for each card, so the same card
  always gives the same reading.
- The rip screen shows the front cut of the card in hand. The card
  detail screen shows both faces.
- **Inventory, to pick cards for grading:** each raw card row shows its
  wear and its front cut. The grade sheet shows the wear, the front
  cut, and the back cut of each card before the player pays. Raw copies
  of the same card stack only when they look the same, so the player
  can grade the better copy. The Raw tab sorts by **Best condition**:
  wear first, then the front cut, then the back cut, as the player can
  read them. The sort never uses the hidden values.

**Wear** is what anyone can see on a raw card without a tool. The game
shows it in words: "Looks clean" (Near Mint), "Light wear" (Lightly
Played), "Heavy wear" (Moderately Played), "Very heavy wear" (Heavily
Played), or "Damaged". It comes from the corners, edges, and surface.
Almost every card from a pack is Near Mint. About 1 card in 11 is
Lightly Played. Values: see
[19-prototype-values.md](19-prototype-values.md#grading).

## Condition grades

Buyers do not price a raw card by its subgrades. They price it by the
standard TCGplayer condition scale. The game has one scale, the `Wear`
type in code, and the wear above is the condition grade. The grades,
best first:

| Grade | Short | Wear in words | Price |
| --- | --- | --- | --- |
| Near Mint | NM | Looks clean | 100% |
| Lightly Played | LP | Light wear | 80% |
| Moderately Played | MP | Heavy wear | 65% |
| Heavily Played | HP | Very heavy wear | 45% |
| Damaged | DMG | Damaged | 30% |

- **The condition comes from the hidden subgrades.** The corners, edges,
  and surface set it. The centering does not change it. Centering has
  its own reading (see Cut and wear).
- **The price is a share of the Near Mint market value.** Every raw
  card is valued with it: on TCGplayer, eBay, and Facebook Marketplace,
  at the game shop buylist, at show buyers, on vendor tables, and on the
  shelf of the player's own store. A slab has no condition price. Its
  grade sets its price.
- **The label shows in the same places as the wear:** Inventory, the
  sell sheet, the grade sheet, the rip screen, and vendor and show
  tables. It reads as the short grade and the wear in words, for
  example "NM · Looks clean".
- **The player sets the listed condition when they list a raw card
  online.** The sell sheet has one condition choice for each stack. The
  default is the condition the player sees. The listed condition sets
  the reference price, and the buyer judges the price against it. A
  listing at a better condition has a higher price, and it still sells.
- **The overstated condition flag.** A listing is overstated when its
  condition is better than the true condition. The game sets
  `Listing.overstatedCondition` (a `Bool?`) to true when it creates
  the listing. The `Listing` also keeps `listedWear`. A sale of an
  overstated listing records `overstatedCondition = true` on the sale
  receipt (`SaleReceipt` in `Model/Sales.swift`). The game records the
  flag and does nothing more with it. The returns system reads the flag
  to decide a "not as described" return. Facebook Marketplace and the
  store online listing record the flag too. The social posts and
  Whatnot always list the true condition.
- **Old saves** load. A listing with no `listedWear` uses the true
  condition.

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

## Estimated prices

The app can ask for 48 grade keys: PSA 1 to 10, and CGC and BGS 1 to 10
in steps of 0.5. The real sales data holds 15 of them (PSA 6 to 10, CGC
8 to 10, BGS 8 to 10), and only for some cards. So the export tool
`tools/export/fill_graded.py` fills every other price with an estimate:

- It fits the median price ratios to the real prices. It uses era,
  rarity bucket, and raw price tier as the groups. The ratios are in
  [19-prototype-values.md](19-prototype-values.md#graded-prices).
- A missing grade comes from the real grades of the same card. For
  example, a missing PSA 9 comes from the PSA 10 and PSA 8 of the card.
  A missing CGC price comes from the raw price and the real CGC prices.
- A card with no real graded price gets a cautious estimate from its
  raw price. A card with sales is a card that people want, so the
  script uses the lower quartile of the real ratios.
- A real price wins over the math. The script never changes a real
  price. It fills only the grades with no real price.
- An estimate never falls when the grade rises, inside one company. An
  estimate is at least the slab floor and each real price below it, and
  at most each real price above it. When these disagree, the real price
  above wins, so an estimate can be below the slab floor.
- A higher grade is never cheaper, and a grade 10 is always above the
  grade below it (at least 5 percent). The sales data is thin and noisy,
  so real prices can break this rule, for example a real PSA 9 above a
  real PSA 10. Then the real prices with the most sales stay real, and
  the others become estimates.
- A card with no raw price gets an estimate too.

Each print in a set file has the optional list `gradedReal`: the keys
with a real price. Every other key is an estimate. A print also has
`marketEstimated` when the raw price is an estimate. An old file has
neither field, and the app treats every price in it as real. The app
shows "est." next to an estimated price in the card detail screen and
in the grade sheet. Run the script after each export, then run
`tools/export/fill_graded.py --check`.

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
