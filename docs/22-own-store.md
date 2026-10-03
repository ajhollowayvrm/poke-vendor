# Your Own Store

**Status: built.** The lease, three locations, the build-out, the
shelves, the prices, the clerk, the open days, working the counter,
the fixtures, the events, store rent, eviction, and closing the store
(`Model/CardStore.swift`, `Model/StoreEvents.swift`,
`Hub/CardStoreView.swift`, `Hub/StoreEventsBox.swift`). The numbers are
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
- **Events**: see [Events](#events).
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
  customers. The clerk sells a bit worse than the player: a customer
  buys 85% as often, and the clerk never sells a second item to the
  same customer.
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
| Play tables | $700 | Two events: a Friday tournament and a weekend Pokemon League (see [Events](#events)). Someone must staff the store |
| Security cameras | $350 | Stops shoplifting |
| Lighted sign | $300 | ×1.15 customers every day |

## Events

Events bring people into the store. Both events need the play tables
and someone in the store: the clerk, or the player at the counter. The
event day must be an open day. The player turns each event on or off,
and picks the entry fee from a short list, in the Events box on the
store screen. The Friday tournament starts on. The league starts off.

| Event | When | Fee options | Players | Prize |
| --- | --- | --- | --- | --- |
| Friday tournament | Friday evening | $5, $10 (default), $15, $20 | 8 to 16 | Loose packs from the store's own stock |
| Pokemon League | Saturday or Sunday morning. The player picks the day | Free (default), $2, $5 | 6 to 14 | One promo card for each player, $0.75 each |

- **Fee**: a higher fee brings fewer players. Tournament attendance is
  150% less 5% for each dollar of the fee. League attendance is 100%
  less 6% for each dollar. Attendance never goes under 30%.
- **Reputation**: +10% players for each reputation tier at the
  tournament, +5% at the league.
- **The player hosts**: if the player works the counter that day, +15%
  players.
- **Tournament prizes**: the store owes 0.7 packs for each player. The
  game takes the cheapest loose packs in the store. If the store has
  fewer packs, the event runs with fewer prizes.
- **Prize standing**: a value from 0.5 to 1.5, from 1.0 at the start. It
  multiplies the tournament players. It goes up when the store gives
  more than 60% of the packs it owes. It goes down when it gives less.
  A full set of prizes adds 0.1. No prizes take off 0.15.
- **More customers**: each tournament player adds 0.5 customers that
  day. Each league player adds 0.8 customers. Most of them are
  small-budget customers.
- **Afterglow**: after an event, the players come back. For 3 days,
  the store gets 30% of the players as extra customers, less each
  day.
- **What they buy**: tournament players and afterglow customers buy
  singles more than packs. A pack is 0.4 times as likely to be picked.
  League kids are small-budget customers and look at cheap items,
  often packs.
- **Morning report**: a line for each event, for example "14 players
  came to the Friday tournament at Card Corner. You gave 10 packs as
  prizes."

## Shoplifting

On a day when the clerk is alone, there is a chance that someone steals
from the store. Security cameras stop it. The chance is 5% at a
location with 20 customers, and it scales with the traffic of the
location: the mall has more theft than the strip mall.

What the thief takes:

- 70%: one to three loose packs from the rack.
- 20%: one cheap sealed item, $30 or less.
- 10%: one cheap card, $40 or less.

If the store has no item of the chosen kind, the thief takes another
kind.

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

The calendar shows the grand opening, each open day, each event, and
each store rent.

## Open topics

- Balancing. The clerk wage against the sales on a quiet weekday.
- A second store, or a bigger space.
- Prices for each item, not one price for the whole store.
- Store credit, buylists, and consignment at the player's own store.
