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

## The rip queue

- The player selects any mix of products in Inventory: loose packs,
  boxes, ETBs, collections, and products from different sets.
- The selected products go into the **rip queue**. The whole queue is
  **one rip**.
- The rip opens the products in the order that the player added them.
- The rip treats the whole queue as one product. The running totals
  and the summary cover the whole queue (see
  [Money on the rip screen](#money-on-the-rip-screen)).

## Rip modes

The player picks one of three modes.

| Mode | Tear and pack trick | Moving through cards | Moving to the next pack | Stops |
| --- | --- | --- | --- | --- |
| **Normal** | Yes, animated | The player swipes or taps | The player taps | Every card |
| **Fast** | Yes, animated | Automatic | Automatic | On the stop rule |
| **Sift** | No | Automatic, fast | Automatic | On the stop rule |

- Fast and Sift use **one fixed speed**. The speed is fast. There is no
  speed setting.
- Fast plays the tear and the pack trick for every pack. Sift skips
  both, so Sift is the quickest way through a large queue.
- Sift with an empty stop rule does not stop. It goes straight to the
  summary. This replaces the old **Open all** button.

### Picking the mode

- **Settings** holds the default mode. Every rip starts in the default
  mode.
- The rip screen shows a mode control. The player can change the mode
  for one rip without a change to Settings.
- The player can change the mode **during a rip**. For example, the
  player rips the first pack of a box in Normal, then changes to Sift
  for the other packs.
- In Fast or Sift, a tap pauses the automatic movement. The player can
  then change the mode, or continue.

### The stop rule

Fast and Sift stop on a card that matches the **stop rule**. The stop
rule has two parts. A card that matches **either** part stops the rip.

1. **A dollar amount.** The rip stops on a card with a market price at
   or above the amount. The player can turn this part off.
2. **Rarities.** The rip stops on a card of a selected rarity.

The rarities come from the set file, so each set has its own rarity
list (see [13-sets.md](13-sets.md#what-goes-in-a-set-file)).

- The list holds every rarity, every variant, and every subset in the
  set, including the special rarities of that set. For example, the
  Black Bolt list holds Double Rare, Illustration Rare, Black White
  Rare, and also the Poké Ball pattern and the Master Ball pattern.
- The list goes in order of pull odds. The most common entry is first,
  and the rarest entry is last. When a set has no odds for an entry,
  the era's rarity system decides its place.
- The player selects single entries, for example only the Poké Ball
  pattern.
- The player can also select **"this rarity or higher"**, for example
  Double Rare or higher. "Higher" means rarer: every entry after that
  entry in the list. In Black Bolt, "Double Rare or higher" does not
  include the Poké Ball pattern, because the Poké Ball pattern is more
  common than Double Rare.
- When the queue holds more than one set, the stop rule menu shows one
  rarity list for each set.
- Settings saves the rarity selection for each set. A set with no saved
  selection uses the hit definition (see
  [What counts as a hit](#what-counts-as-a-hit)).
- Settings saves the dollar amount for all sets.

**The stop rule and a hit are different things.** A hit is a fixed
definition for the summary and for bulk. The stop rule is the player's
choice. A $5 card is a hit, but a $20 stop rule does not stop on it.

**The rip always stops on counterfeit or resealed product,** in every
mode and with every stop rule (see
[14-counterfeit-risk.md](14-counterfeit-risk.md)).

## Missing odds

The game builds each pack from the set's slot map (see
[13-sets.md](13-sets.md#what-goes-in-a-set-file)). Some outcomes have no
odds (`—`), because no source gives them. The game fills them with the
era fallback:

1. Keep every odds value that the set gives. The **remainder** is 100%
   minus those values.
2. The outcomes with no set value share the remainder. These are the
   `—` rows and the slot's `Rest` row.
3. If each of those outcomes has an **era median**, they share the
   remainder in proportion to the medians. The era file lists the
   medians in its **Fallback odds** table.
4. If any of them has no era median, they share the remainder in
   proportion to their matching card counts. Each card then has the
   same chance. An outcome with no era median shows that the slot does
   not follow the era pattern, for example a POP Series 2-card pack. So
   the whole slot uses card counts, not a mix of medians and counts.

The result for each slot always adds up to 100%. An odds value from the
fallback is an estimate. The game does not show it as a sourced value.

`python3 tools/slotmap/odds.py <set>` prints the final odds of a set,
with the source of each value.

## Opening a pack

The rip must feel like opening a real pack. In Normal and Fast:

1. The pack appears. In Normal, the player swipes across the top to
   tear it. In Fast, the tear plays by itself.
2. A tear animation plays, and the cards slide out of the pack.
3. The pack trick plays (see [The pack trick](#the-pack-trick)).
4. The first card shows.
5. In Normal, the player swipes or taps to show the next card. In Fast,
   the cards move by themselves until a card matches the stop rule.
6. After the last card, the pack is done.

In Sift, the rip shows no tear and no pack trick. The cards move past
fast, and the rip stops only on the stop rule.

### The pack trick

The pack trick is the move that collectors do with a real pack. It
moves cards from one end of the stack to the other, so the hits show
last.

- The pack trick is **always animated**. The player sees the cards
  move. The game never skips the animation in Normal or Fast.
- The animation follows the pack order in the set file (see
  [Where the hit sits](#where-the-hit-sits)). Each set's trick moves
  the correct cards for that set.

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

### The pile

The cards that the player already saw go to a **pile**.

- The pile shows the cards as real cards, not as a text list.
- The player swipes back and forward through the pile. Each card shows
  its prices again.
- Swiping forward stops at the newest card that the player saw. The
  player cannot see a card before the rip reveals it.
- The pile holds all cards from the **current pack**, and every **hit
  from the whole rip**. The bulk from earlier packs leaves the pile.
- In Sift, there is no current pack to look at. The pile holds every
  hit from the whole rip.

## Sealed products in the rip

- A product's seal breaks when the rip reaches its first pack. The
  product then loses its sealed premium (see
  [05-pricing-and-market.md](05-pricing-and-market.md#sealed-product--separate-pricing-logic)).
- The player can stop after any pack.
  - The unopened packs of a product with a broken seal go back to
    Inventory as sealed loose packs.
  - A product that the rip did not reach goes back to Inventory still
    sealed. It keeps its sealed premium.
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
- The **pack total** compares the pack's value so far with the pack's
  cost.
- The **rip total** compares the whole queue's value so far with what
  the player paid for the whole queue.
- The cost of one pack is its product's price divided by the product's
  number of packs. The cost of a loose pack is its price.

## The summary

After the last pack, a summary shows:

- The total value, the amount paid, and the net result, for the whole
  rip.
- Every hit, with its market price.
- The bulk count. Bulk goes to Inventory as one bulk group, which the
  player can sell to a local game shop for store credit (see
  [15-selling.md](15-selling.md#the-local-game-shop)).
- A **Post this pull** button. This is a free quick post (see
  [06-social-media.md](06-social-media.md#quick-posts-free-action)).
- A **Go to Inventory** button.

If the player stops early, the summary covers the packs that the rip
opened.

## Open topics

- The real pack order for each set, from set research (see
  [13-sets.md](13-sets.md)).
- A resealed or fake product that the player finds on opening (see
  [14-counterfeit-risk.md](14-counterfeit-risk.md)).
- The condition of pulled cards (see [10-grading.md](10-grading.md)
  and [11-card-archetypes-and-scaling.md](11-card-archetypes-and-scaling.md)).
- Ripping on a live stream (see
  [06-social-media.md](06-social-media.md#live-streams-time-cost-action)).
  The current proposal: a live stream rip allows only Normal and Fast,
  because the viewers want to see the reveal. Decide this with the live
  stream design.
