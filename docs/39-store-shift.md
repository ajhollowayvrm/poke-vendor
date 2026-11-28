# The Owner's Shift

**Status: built** (`Model/StoreShift.swift`, with hooks in `Model/GameStore.swift`, `Model/CardStore.swift`,
`Model/Shows.swift`, `Model/Meets.swift`, `Model/Camping.swift`, and `Hub/HubView.swift`). AJ asked for this on
2026-11-25:

- "When you have your own shop with no employees, working the front desk becomes like your job -- things should be
  greyed out that you cant do and you can't skip a day there."
- "Well actually you can skip a day but you have to choose to lock it up which might make customers upset."

## The shift

- The owner has a shift on a day when the store is open (an open weekday, from the soft opening on) and staff do not
  cover all of it.
- The shift is the part of the posted hours with no staff (see below). On a work day of the day job, it starts at
  5 PM at the earliest, when the job ends.
- The shift ends when the owner works the counter, or locks up.

## What waits for the shift

- **End Day** is greyed out. The bar says "Work the counter at <store> or lock up first."
- A timed action that runs into the shift is greyed out: the time slot (`slot(for:)`) refuses it. An action that ends
  before the shift starts is still allowed.
- A card show, a meet, store camping, and machine camping say "You run the store today · lock up to go".
- The free hours on the hub leave out the shift.
- After the counter, the evening is free.

## Locking up

The hub shows **Lock up today** under the shift row. The confirm dialog shows the cost.

- Loyalty −4.
- A 40% chance of a 1- or 2-star review.
- 2 of today's regulars lose 1 point of standing.
- Each lock-up in the last 28 days makes the next one cost 50% more: loyalty, and the review chance (at most 90%).
- Closing today's weekday in the store schedule while the shift waits is a lock-up. The store screen asks first.
- End Day from any other path with the shift open locks up (the hub does not allow it).

**Leaving the counter early.** See "Late start or early exit" below.

## Store hours, closed days, and part-time staff

Added on 2026-11-25 (docs/proposals/shop-experience.md, parts 3 to 5; `Model/StoreHours.swift`).

- **Posted hours.** The store opens at 9 AM to 3 PM, for 6, 8, 10, or 12 hours, and closes at 11 PM at the latest. A
  change starts tomorrow. An older store keeps 11 AM to 7 PM.
- **Customers by the hour.** Before noon ×0.6, noon to 3 PM ×1.0, 3 to 7 PM ×1.3, after 7 PM ×0.8. The traffic is
  scaled so that 11 AM to 7 PM is the old traffic. A 12-hour day brings more people. 3 to 11 PM brings slightly fewer
  than 11 to 7.
- **Posted closed days.** On the store screen, a closed day is posted 3 or more days ahead, up to 14 days ahead. It has
  no shift and no lock-up. It costs loyalty −1. Past 4 closed days in 4 weeks, each one costs as a lock-up. A posted
  day comes off up to the day before.
- **Staff schedules.** Each staff member works the days on their schedule, all day, the opening half, or the closing
  half. The halves split the posted hours at the middle, on the half hour. Wages pay only those hours. The part of an
  open day with no staff is the owner's shift. The store screen shows the week: "Staff", "You AM", "You PM", or "You".
- **Sick calls come in the morning.** After End Day moves the day, each scheduled staff member can call in sick. The
  report says which part of the day is now the owner's shift. The standard clerk of an older save never calls in.
- **Late start or early exit.** In the owner's shift, each hour that the counter did not cover costs loyalty, at
  4 × the missed hours ÷ the posted length. It counts only an hour or more.

## Quick shift

Added on 2026-11-25 (docs/proposals/shop-experience.md, part 2; `Model/QuickShift.swift`).

- At the store counter, **Quick shift** rings up the routine buyers through the normal sale, with its payment and fake
  checks. A routine buyer pays the price on the item (a straight buy or a pack buyer) and has no job, no collection, and
  no advice question. A kid is not routine, because the gift is a choice.
- It stops at the first person who is not routine, at a regular at Trusted or higher, at a sale that falls through, and
  at closing time. The note says "Rang up 14 sales for $212."
- The button is active only when the person at the counter is routine.

## Values

| Value | Where |
|---|---|
| `lockUpLoyalty` 4, `lockUpReviewChance` 0.4, `lockUpRegulars` 2, `lockUpRegularPoints` 1 | `Model/StoreShift.swift` |
| `lockUpRepeatStep` 0.5, `lockUpWindowDays` 28 | `Model/StoreShift.swift` |

## Notes

- The shift applies to a store from an older save (legacy) too. AJ asked for the rule for every store.
- Some screens give their own reason for a greyed-out action, for example "Not enough time today". The hub shift row
  and the End Day bar say why.

## Package offers

At the player's store, a seller at the counter can take a package: stock
from the counter plus cash, in one offer. **Offer trade + cash** opens
the package sheet.

- Each counter item counts at 110% of its market to the seller, the
  same as a single trade. A closet cleaner wants cash, so an item counts
  80% of that to them.
- The cash comes from the business account. The sheet shows the
  balance, and an offer with more cash than the account holds cannot go.
- The seller takes the package when the items and the cash reach their
  lowest price. Under it, the same haggle rules as a cash counter apply:
  a fair offer gets one "my best is" answer, and each low offer uses
  patience until the seller walks away.
- The seller does not give change. When the items alone are worth more
  than 150% of the seller's item, they turn the package down.
- With no items picked, the offer is a cash counter.
- The item from the seller goes to the player's own inventory, the same
  as a cash buy at the counter.
- Shows and meets keep the single trade ("Offer a trade instead"), so
  the game before the store does not change.

## Register sales

At the counter, 60% of the hour's customers come up as visitors to deal
with. The other 40% grab something small and pay at the register while
the player works:

- A register customer buys a lot of 1 to 5 packs from the pack display,
  or one item at $30 or less, at the shelf price. The usual price check
  applies, and the owner sells with no clerk factor.
- The sales happen as the counter clock moves, and follow the store's
  traffic by the hour.
- They pay the business account and count in the shift's sales. They
  leave no receipt on the screen. The counter shows "Register · N small
  sales · $X".
- An item that sells at the register leaves the counter.
