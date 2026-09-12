# Ripping

The screen where the player opens sealed product. This is the "rip"
side of the rip-or-hold decision in
[12-acquiring-product.md](12-acquiring-product.md#the-rip-or-hold-decision).

## Where ripping starts

- The player opens product from Inventory. Every purchase goes to
  Inventory first (see
  [12-acquiring-product.md](12-acquiring-product.md#where-bought-product-goes)).
- Opening product is a free action (see
  [01-premise-and-loop.md](01-premise-and-loop.md#free-actions-no-time-cost-stack-freely)).

## Opening a pack

The rip must feel like opening a real pack.

1. The pack appears. The player swipes across the top to tear it.
2. A tear animation plays, and the cards slide out of the pack.
3. The first card already shows.
4. The player swipes or taps to show the next card.
5. After the last card, the pack is done.

### Where the hit sits

The hit is one of the **last three cards** in the pack, the same as in
a real pack.

Each set has exceptions. The set file records the real pack order for
that set: the order the cards come out, and where the hit sits (see
[13-sets.md](13-sets.md#what-goes-in-a-set-file)). The rip screen
follows the set file, so each set rips the way it does in real life.

### What counts as a hit

A card is a **hit** if its rarity is rare or higher, or its market
price is $1 or more. Every other card is **bulk**. This value is a
starting point for balancing.

## Opening a box, an ETB, or a collection

- Opening a product breaks its seal. The product loses its sealed
  premium (see
  [05-pricing-and-market.md](05-pricing-and-market.md#sealed-product--separate-pricing-logic)),
  and its packs go into the rip flow.
- The player opens the packs one by one, with the same reveal as a
  single pack.
- An **Open all** button opens every remaining pack at once and goes
  straight to the summary.
- The player can stop after any pack. Unopened packs go back to
  Inventory as sealed loose packs.
- Contents that are not packs, for example a promo card, go to
  Inventory and show in the summary.

## Money on the rip screen

Money shows during the rip, not only at the end.

- Each card shows its market price when it appears (see
  [05-pricing-and-market.md](05-pricing-and-market.md#data-source)).
- Each card also shows four graded prices: **PSA 10, PSA 9, CGC 10,
  and CGC 9**. This shows the grading upside at the moment of the pull
  (see [10-grading.md](10-grading.md)). A grade with no sales data
  shows "—".
- The running totals use the raw market price, not the graded prices.
  A card is raw until the player grades it.
- A running total compares the pack's value so far with the pack's
  cost.
- When the player opens a box, a second running total compares the
  whole box's value so far with what the player paid.
- The cost of one pack is the product's price divided by its number of
  packs.

## The summary

After the last pack, or after Open all, a summary shows:

- The total value, the amount paid, and the net result.
- Every hit, with its market price.
- The bulk count. Bulk goes to Inventory as one bulk group, which the
  player can sell to a local game shop for store credit (see
  [15-selling.md](15-selling.md#the-local-game-shop)).
- A **Post this pull** button. This is a free quick post (see
  [06-social-media.md](06-social-media.md#quick-posts-free-action)).
- A **Go to Inventory** button.

## Open topics

- The real pack order for each set, from set research (see
  [13-sets.md](13-sets.md)).
- A resealed or fake product that the player finds on opening (see
  [14-counterfeit-risk.md](14-counterfeit-risk.md)).
- The condition of pulled cards (see [10-grading.md](10-grading.md)
  and [11-card-archetypes-and-scaling.md](11-card-archetypes-and-scaling.md)).
- Ripping on a live stream (see
  [06-social-media.md](06-social-media.md#live-streams-time-cost-action)).
