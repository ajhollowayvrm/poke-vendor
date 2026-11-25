# The Owner's Shift

**Status: built** (`Model/StoreShift.swift`, with hooks in `Model/GameStore.swift`, `Model/CardStore.swift`,
`Model/Shows.swift`, `Model/Meets.swift`, `Model/Camping.swift`, and `Hub/HubView.swift`). AJ asked for this on
2026-11-25:

- "When you have your own shop with no employees, working the front desk becomes like your job -- things should be
  greyed out that you cant do and you can't skip a day there."
- "Well actually you can skip a day but you have to choose to lock it up which might make customers upset."

## The shift

- The owner has a shift on a day when the store is open (an open weekday, from the soft opening on) and has **no
  staff**. With staff, nothing changes.
- The shift runs from 11 AM to 7 PM. On a work day of the day job, it starts at 5 PM, when the job ends.
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
- Closing today's weekday in the store schedule while the shift waits is a lock-up.
- End Day from any other path with the shift open locks up (the hub does not allow it).

**Leaving the counter early.** With no staff, an owner who leaves the counter an hour or more before 7 PM leaves the
door locked for the rest of the day. It costs loyalty for that share of the day: 4 × the missed hours ÷ 8.

## Values

| Value | Where |
|---|---|
| `lockUpLoyalty` 4, `lockUpReviewChance` 0.4, `lockUpRegulars` 2, `lockUpRegularPoints` 1 | `Model/StoreShift.swift` |
| `lockUpRepeatStep` 0.5, `lockUpWindowDays` 28 | `Model/StoreShift.swift` |

## Notes

- The shift applies to a store from an older save (legacy) too. AJ asked for the rule for every store.
- Some screens give their own reason for a greyed-out action, for example "Not enough time today". The hub shift row
  and the End Day bar say why.
