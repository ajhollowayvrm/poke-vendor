# Grading and Centering

## Centering: eyeball vs. precise

Every raw (ungraded) card has a centering value the player cares about,
because it drives real grading outcomes (see
[05-pricing-and-market.md](05-pricing-and-market.md) on condition/grade
driving price). Centering is tracked separately for front and back.

- **Front centering can be eyeballed.** Without paying anything, the
  player gets a rough estimate of front centering just by looking at
  the card (e.g. "~58/42, estimated").
- **Back centering cannot be eyeballed.** The card back's design is
  uniform across every card in the game, the same way it is in real
  Pokemon TCG products, so there is no visual cue to judge back
  centering by eye. Back centering shows as unknown until measured.
- **Paying for a precise reading** (a one-off online grading/centering
  service, priced per card) reveals exact front AND back centering for
  that single card.
- **A permanent upgrade removes the fee entirely.** Once purchased
  (see [09-upgrades.md](09-upgrades.md)), it reveals precise front and
  back centering on every card, free, forever — no more per-card
  payment or eyeballing.

## Why this matters for play

This creates a real decision point tied into the game's existing
variance/risk design (see
[01-premise-and-loop.md](01-premise-and-loop.md#variance-and-busts)):
a raw card's eyeballed front centering might look great, but its
back — the half that real grading weighs heavily and the player
cannot see — might tank the final grade. Paying for a precise reading
before a big buy, a big sale, or a grading submission is a genuine
risk-management choice, not busywork. The permanent upgrade removes
that risk entirely, which is part of what makes it worth buying.

## UI implication

The collection screen's card-detail modal shows centering as two
separate fields, front and back:

- **Eyeballed only**: front shows an estimate (e.g. "~58/42, est."),
  back shows "Unknown," and a "Get precise reading" action with its
  price appears.
- **Precise (paid, or upgrade owned)**: both front and back show exact
  numbers, no CTA.

## Open topics

- Grading mechanics beyond centering (turnaround time, overall grade
  variance, cost of full submission).
- How the paid precise-reading price scales, if at all, with card
  value.
