# Loose Packs and Straight Buys

**Status: built** (`Model/GameStore.swift`, `Model/CardStore.swift`, `Model/Shows.swift`, `Model/Relationships.swift`,
`Model/Haggling.swift`). AJ asked for this on 2026-11-25:

- "I need the ability to break down any product into its loose packs."
- "There can be an upgrade for a loose packs display which is probably by far the best selling thing in the store."
- "There should be far more straight buys of just get product and ring it up. I think negotiation starts as your
  opinion of the people visiting goes up and their opinion of you goes up."

Straight buys apply at the store counter and at card shows. AJ chose this on 2026-11-25. It is an exception to the
rule that the game before the lease does not change ([22-own-store.md](22-own-store.md)).

## Break a product into loose packs

- The **Break** tile is in the item actions: the sealed detail screen and Inventory select mode. The store shelf select
  mode has a **Break into packs** button.
- Each pack is a loose pack of its set. The cost splits evenly over the packs. The promo cards go to Raw with no cost.
- A product on the store shelf breaks into packs on the shelf. Packs that do not fit go to the back room. With no back
  room, they come back to the player. A product in the back room breaks into loose back-room units.
- The game refuses a break for: a closed case ("Open the case first"), a loose pack, an item with an online listing, an
  item on hold for a customer, and an item with any other status (listed, consigned, in transit, at auction, sold).
- A P&L challenge product keeps its packs in the challenge. A PC product gives PC packs. Packs from a case-fresh unit
  stay case-fresh, and packs from a verified product stay verified.
- Packs from stolen plug stock keep the gray order, so the police can still seize them (`Model/Plug.swift`). This also
  applies to the loose packs that a rip leaves.
- A one-pack blister with a promo card is not a loose pack. It breaks into its pack and its promo. A loose pack is a
  sealed item with 1 pack, not a case, from a product with no promo (or out of a broken product).
- The confirm dialog shows the sealed market, the loose-pack market, the difference, and the cost per pack.

**A break is a real choice.** The value of the loose packs, divided by the product value, from the catalog on
2026-11-25:

| Product | Median | Middle half |
|---|---|---|
| In-print booster box | 1.26 | 1.05–1.33 |
| Out-of-print booster box | 1.08 | 0.79–1.75 |
| In-print booster bundle | 0.94 | 0.84–1.03 |
| Elite Trainer Box | 0.64 | 0.50–0.83 |

A modern booster box gains about 25%, but the packs sell one or a few at a time. An ETB loses value, because its
sleeves, dice, and box are not packs.

## The loose-pack display

A store fixture: **Loose-pack display**, $1,200 ([22-own-store.md](22-own-store.md#fixtures)).

- It holds **150 loose packs** off the sealed shelf. Loose packs fill the display first. Only packs above 150 use sealed
  slots. A one-pack blister with a promo uses a sealed slot.
- **Clerk hours.** Each customer, a browser too, can stop at the display. The chance by type: kids 55%, players 50%,
  casual buyers 35%, collectors 20%, investors 0%. The clerk factor applies. This roll is in addition to the normal
  one-item purchase.
- A pack buyer takes **1 to 5 packs** of one product (weights 40/25/15/10/10) at the shelf price. One price check covers
  the lot: the same check as other sealed product. A kid or a casual buyer stays in the $30 budget.
- **The counter.** With the display, a buyer at the counter can come for packs: kids 55%, players 50%, flippers, dealers,
  grading hunters, and vintage collectors 0%, others 25%. A pack buyer is always a straight buy. A kid does not come
  for a pack over the $30 budget.
- The **Shelves** box shows "Pack display n / 150". Without the display, nothing changes.
- The stock fill counts only the packs on the display, not its empty slots. A full store that buys the display does not
  get "The shelves are thin."

In the test run, a clerk week with 151 packs and 20 cards sold about 74 packs and 20 other items.

## Pack price and the nightly refill

Added on 2026-11-25 (docs/proposals/shop-experience.md, parts 6 and 7).

- **Pack price.** The store screen sets a price for loose packs: 100% to 150% of market, or "Same as sealed" (the
  default). A box keeps the sealed price.
- **Impulse buyers.** A pack buyer, at the display or at the counter, pays up to 95% to 145% of market (a box buyer:
  92% to 128%). So a pack at a price over market still sells, but more slowly.
- **Refill the pack display.** A setting under the shelf numbers: Off (the default), or below 25%, 50%, or 75%. Each
  night, after the back-room restock, when the display is under the level, the store breaks sealed units from the back
  room into packs until the display is full. It breaks only a product whose packs are worth at least the product, the
  oldest first, so an ETB stays sealed. It never breaks a case. It needs the back room.

## Straight buys

A straight buyer pays the asking price and does not haggle. The screen shows **Ring it up · $X** and **Decline**. It
hides the counter slider, the final offer, and the coin flip.

- **The haggle chance** rises with rapport, from 0 to 100:
  - Store: 20% at rapport 0, 75% at rapport 100.
  - Show, meet, and league night: 45% at rapport 0, 90% at rapport 100.
- **A buyer far under the sticker still haggles.** A straight buyer pays the ask only when it is at most 15% over their
  top at the store, or 10% at a show.
- A flipper always haggles. A PC item keeps its own rule: the buyer opens at the PC price.
- A straight buyer never offers a coin flip. A kid who buys straight can still get the item as a gift.
- A straight buy is never a "hard" deal, because the player did not push. A fair price gives deal reputation as before.

Measured in the test run (strangers, with high reputation): about 65% of store buyers and about 35% of show buyers pay
the sticker. A friend with full rapport pays the sticker about 27% of the time at the store.

## Opinion in both directions

- `Contact.points` (0–100) is the contact's opinion of the player. It sets the standing level.
- `Contact.opinion` (0–100) is the player's opinion of the contact. An old save reads it as 20.
  - A deal of $20 or more: +3 when fair (within 10% of market), +1 when not. A smaller fair deal: +1.
  - The contact walks away: −2.
- **Rapport** is the lower of the two. A stranger has rapport 0.
- The Contacts screen shows both: "They think: Regular · You think: 45".

## Values

| Value | Where |
|---|---|
| `packDisplaySlots` 150, cost $1,200 | `Model/CardStore.swift` |
| `packBuyChance` by type, `packLotWeights` | `Model/CardStore.swift`, `Model/Shows.swift` |
| `haggleChanceStore` 0.20…0.75, `haggleChanceShow` 0.45…0.90 | `Model/Haggling.swift` |
| `stickerToleranceStore` 1.15, `stickerToleranceShow` 1.10 | `Model/Haggling.swift` |
| `opinionStart` 20, `opinionFairDeal` 3, `opinionPlainDeal` 1, `opinionWalkAway` 2 | `Model/Haggling.swift` |

## Not in this change

- A fake bought from a contact does not lower the player's opinion. The game does not record who sold a fake.
