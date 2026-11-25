# Pull Boxes

**Status: built** (`Model/PullBoxes.swift`, `Hub/PullListBox.swift`, the walk-in in `Model/CounterEvents.swift`). AJ
asked for this on 2026-11-25 (docs/proposals/shop-experience.md, part 9).

A pull box is a regular's standing order: the store keeps one product for them every 2 or 4 weeks. It gives a steady
reason to buy the distributor allocation, and it rewards a store that keeps its regulars happy.

## The ask

- A new counter walk-in, **WANTS A PULL BOX** (weight 0.06 of the walk-in jobs). A contact at Regular or higher, with
  no pull yet, asks for one in-print booster box, ETB, or booster bundle under $300, every 2 or 4 weeks.
- The panel shows the product and the price. **Start the pull** adds them to the list, with opinion +2. **Not now**
  passes.
- The list holds 6 pulls, and 10 for a Destination store.

## Pickup

- At End Day on the pickup day, the store needs one unit of that product: in hand or on the shelf (not in the back
  room), not a case, not a known fake, not in the PC, not listed online, and not on hold. The oldest unit goes first.
- The regular pays the sealed shelf price less the **pull discount**: 0%, 5% (the default), 10%, or 15%, on the store
  screen. The money goes to the business account, with sales tax and a receipt. The deal counts with the contact.
- The next pickup is one cycle later.
- A closed day, a posted closed day, or a lock-up moves the pickup to the next day.

## A miss

- No unit on the day: standing −3, and the regular tries again in 3 days.
- Two misses in a row end the pull, with a 50% chance of a 1-star review.
- When the product goes out of print, the next pickup is the last one, and the regular thanks the player. A miss at
  that point ends the pull.

## The store screen

The Today tab shows **Pull boxes**: each regular, the product, the cycle, the next pickup, the misses, an **End**
button, and the discount.
