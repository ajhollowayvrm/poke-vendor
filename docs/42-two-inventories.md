# Two Inventories

**Status: built** (`Model/StoreLoans.swift`, `Inventory/InventoryView.swift`, hooks in `Model/Shows.swift`). AJ asked
for this on 2026-11-25:

- "I'd like the inventory of the store and my personal inventory to be different and one of the quick actions should be
  moving stuff between them. I should also be able to take anything from personal or the store to go to a card show."

AJ's choices: a Personal / Store switch in Inventory; a move moves no money; a store item that sells at a show pays the
business account.

## Inventory

- With a store, the Inventory section has a **Personal / Store** switch. The choice is remembered.
- **Personal:** items that are not in the store. The PC, the master sets, and the showcase stay personal.
- **Store:** items on the shelf, in the back room, and store items out at a show or a meet right now. The tabs are
  Sealed, Raw, and Slabs.

## The move action

- The item actions (the detail screen and select mode) show **To store** for personal items and **To personal** for
  store items. It replaces the old **Store** tile.
- A move only changes where the item is. No money moves between the accounts.
- **To store** follows the store's room, the same as before. **To personal** ends an online listing in the store, the
  same as **Take back** on the shelves.

## Store stock at a show

- The packing list at a show, a meet, or league night offers store stock too, with a **STORE** tag. Store stock is never
  in the default load: the player packs it. Store items on hold or listed online stay in the store.
- The packed store items leave the shelf when the load leaves the car (the table opens, or a walk-in goes to the
  floor). The store's clerk cannot sell them that day.
- A store item that sells pays the **business account**, with the sales tax. A personal item pays the player.
- When the visit ends, unsold store items go back to the shelf. If a visit is lost, End Day sends them back.
- A store card cannot go to the grading booth at a show.
