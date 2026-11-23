# Storage

**Status: built** (`Model/Storage.swift`, `Hub/StorageView.swift`). AJ asked for this on 2026-11-22. It replaced the
storage fee by item count (the old `Balance.storageTiers`).

The hub row **Storage** shows the home space and the unit.

## Home space

- The home holds **150 spaces** of stock. The Own Home upgrade holds **400**. The Warehouse upgrade has no limit.
- Sealed product takes its real size, the same space as in the show tote
  (see [29-packing-and-crowds.md](29-packing-and-crowds.md)). A slab takes 0.1 space and a raw card 0.01. Bulk counts
  as raw cards.
- Items away from home take no home space: in transit, at a grader, in the player's store, at an auction house, or in
  the unit. A listed item is still at home.
- **The clutter fee**: each night, each space over the limit costs **$1** (business costs).
- **A home break-in**: when the sealed value at home (not in the PC) is **$15,000** or more, a thief can break in. The
  chance each night is 0.2% at $15,000, and it rises with the value, up to 1%. The thief takes 1 to 3 of the 8 most
  valuable sealed items. The collection insurance pays the claim.

## The unit

| Size | Spaces | Rent a month |
|---|---|---|
| 5×5 | 60 | $70 |
| 10×10 | 240 | $160 |
| 10×20 | 600 | $300 |

- The first month is paid when the player rents the unit. A bigger unit pays the difference at once. After that, the
  rent is due on the 1st of each month, with the home rent. Unpaid rent costs reputation, as the other business
  costs do.
- The player can change the size at any time, if the items fit. The rental can end only when the unit is empty.
- **A visit** takes **1 hour** of the day: the drive and the loading. For the rest of that day, the player can move items
  in and out. Without a visit, nothing moves.
- Items in the unit have the status **In storage**. They cannot be sold, listed, ripped, or taken to a show until they
  come home. The Inventory filter "In storage" shows them.
- Only items with no status can go in. Items in the PC, a master set, or the showcase stay home.
- **Safe from home losses**: water damage and the home break-in never touch the unit. The collection insurance covers
  the unit.
- **A break-in at the unit**: 0.15% each night. The thief takes 1 to 3 sealed items.
- **Deliveries**: with "Send sealed deliveries here" on, a sealed delivery goes to the unit when it has room. The
  morning report says so. The player still needs a visit to take it home.
