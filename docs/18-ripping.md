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

The rip must feel like opening a real pack.

### The manual rip (Normal)

Normal is a manual rip. The player holds the cards like a real pack:

1. The sealed pack shows, with a moving reflection.
2. The player taps the top of the pack, or swipes across the top, to
   tear it open. A swipe can start at either edge. The strip tears
   under the finger: the torn part lifts, the torn foil edge shows
   white, flecks of foil fall, and the phone clicks as the tear moves.
   When the tear gets to the far edge, the strip flies off and a light
   comes out of the top of the pack.
3. The cards come out as a stack, and the empty pack falls away.
4. **Pack trick** moves one card around the stack. Face up, it takes
   the back card to the front. Face down, it takes the top card to the
   bottom. Both are the same move on the physical pack. This is how the
   player does the pack trick by hand. The button works once for each
   pack, and then it turns off until the next pack. After the trick,
   a face-down stack turns face up by itself, and Flip stays off for
   the rest of the pack.
5. A tap on the front card slides it off the top onto the **pile**,
   above the stack.
6. A tap on the pile puts the top card of the pile back on the front
   of the stack.
7. A long press on the stack shows a **peek**: only the very top
   border of every card left in the stack. The peek shows no names.
   A rainbow or holo border tells the player that a hit is coming, the
   same as looking at the top edges of a real Prismatic Evolutions
   pack. The peek closes when the player lifts the finger.

**Skip pack.** A Skip pack button works at any time. It puts every
card left in the pack on the pile, face up, and goes to the summary.
Before the tear, it opens the pack first. Skipped cards play no hit
effects, and the summary shows their hits.

**Face down or face up.** A **Flip** button on the rip screen turns
the whole stack over. The stack turns as one piece, and its order
reverses while it is edge-on, so no card jumps. The game keeps the
choice for the next rip.

**No early reveal.** The info panel, the pile label, the glow, and the
hit effects wait until a card turns past edge-on. The player never sees
a card's name or price before its face shows.

- The stack starts in the physical pack order. Face up, the front card
  shows and the last card of the pack (the Energy) is at the back.
- Face down: the player sees the card backs. A face-down stack is the
  pack turned over, so its order is reversed: the Energy is on top.
  The pack trick is blind. A tap flips the top card as
  it goes to the pile. A medium or big hit (see
  [Hit effects](#hit-effects)) flips in place first, and the next tap
  sends it to the pile.
- Face up: the player sees the front card before piling it. The pack
  trick shows the back card as it comes to the front.

The pile always shows its cards face up.

### Hit effects

A medium or big hit plays an effect when the player first sees it.
Other hits, for example a holo Rare, play no effect.

| Level | Cards | Effect |
| --- | --- | --- |
| Medium | Double Rare, Ultra Rare, ACE SPEC Rare, Poké Ball pattern, or $5 or more | A gold glow with turning light rays, sparkles, a banner with the rarity and the raw price, and a success haptic |
| Big | Special Illustration Rare, Hyper Rare, Master Ball pattern, or $25 or more | A rainbow glow and rays, more sparkles, the banner, a white screen flash, and a strong haptic sequence |

The glow stays while the hit is the top card.

### Fast and Sift

In Fast:

1. The pack appears, and the tear plays by itself.
2. A tear animation plays, and the cards slide out of the pack.
3. The pack trick plays (see [The pack trick](#the-pack-trick)).
4. The first card shows.
5. The cards move by themselves until a card matches the stop rule.
6. After the last card, the pack is done.

In Sift, the rip shows no tear and no pack trick. The cards move past
fast, and the rip stops only on the stop rule.

### The pack trick

The pack trick is the move that collectors do with a real pack. It
moves cards from one end of the stack to the other, so the hits show
last.

- In Normal, the player does the pack trick by hand with the Pack trick button
  (see [The manual rip (Normal)](#the-manual-rip-normal)).
- In Fast, the pack trick is **always animated**. The player sees the
  cards move. The game never skips the animation.
- The animation follows the pack order in the set file (see
  [Where the hit sits](#where-the-hit-sits)). Each set's trick moves
  the correct cards for that set.

### Pack tricks by era

Each era has its own physical pack order and its own pack trick. The
Pack trick button moves the era's number of cards, one by one, from the
back to the front (or from the top to the bottom when face down).

| Era | Physical order, front card first | Pack trick | Source |
| --- | --- | --- | --- |
| Scarlet & Violet | 4 commons, 3 uncommons, reverse holo 1, reverse holo 2, rare slot, Basic Energy | 1 card | [sets/eras/scarlet-violet.md](sets/eras/scarlet-violet.md#conflicts-in-the-template) |
| Sword & Shield, Sun & Moon | 5 commons, reverse holo, rare slot, Basic Energy, 3 uncommons | 4 cards | [sets/eras/sun-moon.md](sets/eras/sun-moon.md#pack-order) |
| Wizards of the Coast | 5 commons, 2 Energy, rare slot, 3 uncommons | 3 cards | [sets/eras/wizards-of-the-coast.md](sets/eras/wizards-of-the-coast.md#pack-order) (low confidence) |

After the trick, the rare slot is the last card in every era. In
Sword & Shield, most cards have a yellow border, so the peek gives
less away than in Prismatic Evolutions.

### Where the hit sits

The stack starts in the physical pack order, with the Basic Energy
last. After the player moves the Energy to the front with the pack
trick, the last three cards of a Prismatic Evolutions pack are reverse
holo slot 1, reverse holo slot 2, and the rare slot (see
[sets/prismatic-evolutions.md](sets/prismatic-evolutions.md#pack-order)).

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
- The pile sits above the stack. Its top card shows its name and its
  market price next to it.
- A tap on the pile puts the top card back on the front of the stack.
- The peek is the only way to see a card before the rip reveals it.
- The pile holds all cards from the **current pack**, and every **hit
  from the whole rip**. The bulk from earlier packs leaves the pile.
- In Sift, there is no current pack to look at. The pile holds every
  hit from the whole rip.

## Sealed products in the rip

### Opening a product

A sealed product that is not a loose pack opens in its own step before
its first pack:

1. The product shows closed, with a moving reflection. It tilts a
   little with the phone.
2. The player opens it. The opening depends on the product:
   - A blister: the player pulls its top corner, or taps it. The card
     peels back from the corner, curls, and shows its back. Under the
     card, the pack and the promo lie in the tray. A short pull springs
     back. A long pull or a fling peels the card off.
   - A box, ETB, collection, or bundle: a tap lifts the lid. The lid
     tilts back, a light comes out of the box, and the base drops away.
   - A tin: a tap rattles the tin, then the lid pops off.
3. The contents show: first the promo cards, one by one with their
   prices, then one small wrapper for each pack, in its set's colors.
   The promo cards from a box or a tin come out face down and flip
   over.
4. A tap on a promo card shows its details: the card, which tilts
   under the finger, its set, rarity, and number, its raw price, and
   its graded prices.
5. A tap on a pack wrapper goes to that pack first. **Rip packs** goes
   to the first pack. **Done for now** closes the rip, and the packs
   stay in Inventory as loose packs.

Opening the product breaks its seal. Its promo cards go to Raw, and its
packs become loose packs at that moment.

A product that holds one promo from a wave, for example a checklane
blister, holds the promo that its name shows in brackets.

- A product's seal breaks when the rip reaches its first pack. The
  product then loses its sealed premium (see
  [05-pricing-and-market.md](05-pricing-and-market.md#sealed-product--separate-pricing-logic)).
- The player can stop after any pack.
  - The unopened packs of a product with a broken seal go back to
    Inventory as sealed loose packs.
  - A product that the rip did not reach goes back to Inventory still
    sealed. It keeps its sealed premium.
- Contents that are not packs, for example a promo card, go to
  Inventory when the rip breaks the product's seal. They show in the
  summary under "Also in the box". A product that holds one random
  promo from a list, for example the Prismatic Evolutions Surprise Box,
  gives one promo from that list.
- A product can mix packs from several sets, for example the Ogerpon ex
  Premium Collection. Each pack rips with its own set's slot map and
  odds, and each set has its own wrapper colors. The unopened packs of
  a broken product go back to Inventory as loose packs of their own
  sets.

## Money on the rip screen

Money shows during the rip, not only at the end.

- Each card shows its market price when it appears (see
  [05-pricing-and-market.md](05-pricing-and-market.md#data-source)).
- Each card shows its **raw** price first, then its graded prices for
  three companies: **CGC 10 and 9, PSA 10 and 9, and BGS 10 and 9.5**.
  This shows the grading upside at the moment of the pull (see
  [10-grading.md](10-grading.md)). A grade with no sales data shows
  "—".
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
  The button shows only if the player has a social media account (see
  [06-social-media.md](06-social-media.md#social-media-is-optional)).
- A **Go to Inventory** button.

If the player stops early, the summary covers the packs that the rip
opened.

## Ripping on a live stream

A rip on a live stream allows only the Normal and Fast speeds, because
the viewers want to see the reveal (see
[06-social-media.md](06-social-media.md#live-streams-time-cost-action)).

## Open topics

- The real pack order for each set, from set research (see
  [13-sets.md](13-sets.md)).
- A resealed or fake product that the player finds on opening (see
  [14-counterfeit-risk.md](14-counterfeit-risk.md)).
- The condition of pulled cards (see [10-grading.md](10-grading.md)
  and [11-card-archetypes-and-scaling.md](11-card-archetypes-and-scaling.md)).
