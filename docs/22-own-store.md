# Your Own Store

**Status: built.** The lease, three locations, the build-out, the
shelves, the prices, the clerk, the open days, working the counter,
the fixtures, store rent, eviction, and closing the store
(`Model/CardStore.swift`, `Hub/CardStoreView.swift`). The numbers are
in [19-prototype-values.md](19-prototype-values.md#your-own-store).

The player starts with no storefront (see
[01-premise-and-loop.md](01-premise-and-loop.md#starting-point)). A
store of their own is a late goal. The game shows the goal from day 1,
but the player decides when to sign. The store does not open by itself
at a number.

## Before the lease

The hub's Today card has a row for the store. Before the lease, the
row opens a screen that shows what a landlord wants:

| Requirement | Value | Why |
| --- | --- | --- |
| Reputation | Trusted (tier 2) | People must trust the player before they shop with them. |
| Sales over the whole run | $2,500 | The player must show that they can move product. |
| Cash | The first rent, a deposit of one rent, and the build-out | The landlord and the builder want their money first. |

The player names the store and picks one location.

## Locations

Each location trades rent for foot traffic. Rent is due every 28 days,
the same cycle as the home rent (see
[16-time-and-day.md](16-time-and-day.md#rent)).

| Location | Rent | Build-out | Customers on a weekday | Small-budget customers |
| --- | --- | --- | --- | --- |
| Oak Plaza strip mall | $1,400 | $2,000 | 12 | 30% |
| Main Street storefront | $2,400 | $3,500 | 20 | 25% |
| Northgate Mall | $3,800 | $5,000 | 32 | 50% |

The build-out takes 7 days. The player can stock the shelves during
the build-out. The first 7 open days are the grand opening, with 50%
more customers.

## Stock

The player moves items from Inventory into the store. An item in the
store has the tag "IN YOUR STORE". It cannot be listed, graded, or
brought to a show until the player takes it back. The player can take
an item back at any time, from the store screen or from the item's
Status box.

- The store holds 40 cards and slabs, and 40 sealed items. Fixtures
  add room.
- Kept items, listed items, and known fakes cannot go into the store.
- An unknown fake can go into the store. If it sells, it is a bad sale
  with no platform refund (see
  [14-counterfeit-risk.md](14-counterfeit-risk.md#consequences)).

## Prices

One price applies to every item: 95%, market, 110%, 120%, or 130% of
market. The default is 110%. A customer pays from 92% to 128% of
market. A lower price sells more items. A higher price makes more on
each item.

## Customers

The number of customers on a day starts from the location's traffic.
These change it:

- **Weekday**: Monday to Thursday ×0.8, Friday ×1.1, Saturday ×1.5,
  Sunday ×1.2.
- **Reputation**: +6% for each tier.
- **Followers**: +8% for each follower tier, with a social media
  account.
- **Stock**: empty shelves turn people away. The factor goes from
  ×0.4 with no stock to ×1.2 with 40 or more items.
- **Fixtures and the grand opening**: see below.

A customer looks first at the better items, the same as a buyer at a
show. 35% of customers only look. A small-budget customer looks only
at items of $30 or less, and often buys 2 or 3 of the same loose
pack.

## Staff and hours

The store is open from 11 AM to 7 PM on the days that the player
picks. On an open day, two people can staff it:

- **The clerk**: $120 a day, paid only on open days. The clerk sells at
  the shelf price. The clerk does not haggle, trade, or buy from
  customers.
- **The player**: "Work the counter" is a time-cost action, once a
  day. It uses the show table: buyers haggle, traders offer cards, and
  people bring collections to sell. A store gets more sellers than a
  show table. On a work day, the player can start only after the shift
  ends at 5 PM.

The clerk covers the open hours that the player does not work. With no
clerk, the store is open only while the player works the counter.

## Fixtures

A fixture is a one-time buy for the store. It stays with the building
when the store closes.

| Fixture | Cost | What it does |
| --- | --- | --- |
| Second display case | $500 | Room for 60 more cards and slabs |
| Sealed wall | $400 | Room for 60 more sealed items |
| Play tables | $700 | A Friday tournament: 8 to 16 players, +10% for each reputation tier, $7 for each player after prizes. ×1.3 customers on Friday. Someone must staff the store |
| Security cameras | $350 | Stops shoplifting |
| Lighted sign | $300 | ×1.15 customers every day |

## Shoplifting

On a day when the clerk is alone, there is a 5% chance that someone
steals one card of $40 or less. Security cameras stop it.

## Wholesale

A distributor opens an account for a store. When the build-out is
done, wholesale opens even below reputation Respected (see
[12-acquiring-product.md](12-acquiring-product.md)). Case splits still
need Respected.

## Store rent and eviction

- Store rent is due every 28 days after the lease day. The game warns
  the player 3 days before.
- The home rent comes first. If the player cannot pay the store rent
  after the home rent, the landlord locks the store.
- **Eviction**: the landlord keeps the deposit, and reputation goes
  down by 15. The stock comes home the next day. The run does not end.

## Closing the store

The player can close the store at any time. The landlord gives back
the deposit. The stock comes home the next day. The fixtures stay with
the building. The player can sign a new lease later.

## The store screen

- **Today**: work the counter, and the customers to expect today.
- **Last 7 days**: sales, wages and rent, the net, customers, and items
  sold.
- **Shelves**: the room used, the stock at the shelf price, and the
  stock list.
- **Prices**, **Staff and hours**, **Fixtures**, and **Lease**.

The calendar shows the grand opening, each open day, and each store
rent.

## Open topics

- Balancing. The clerk wage against the sales on a quiet weekday.
- A second store, or a bigger space.
- Prices for each item, not one price for the whole store.
- Store credit, buylists, and consignment at the player's own store.
