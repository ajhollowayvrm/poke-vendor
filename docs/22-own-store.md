# Your Own Store

**Status: built.** The lease, three locations, the build-out, the
shelves, the prices, the clerk, the open days, working the counter,
the fixtures, the events, the buylist, store credit, the bulk box, split
prices, online listings, the lease term and the buyout, store rent,
overhead, eviction, closing the store, and the reaction of the game shops
(`Model/CardStore.swift`, `Model/StoreEvents.swift`, `Model/StoreBuying.swift`,
`Model/StorePricing.swift`, `Model/StoreLease.swift`, `Hub/CardStoreView.swift`).
The numbers are
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

The player names the store, picks one location, and picks the lease
term.

## Locations

Each location trades rent for foot traffic. Rent is due every 28 days,
the same cycle as the home rent (see
[16-time-and-day.md](16-time-and-day.md#rent)).

| Location | Rent | Build-out | Customers on a weekday | Small-budget customers |
| --- | --- | --- | --- | --- |
| Oak Plaza strip mall | $1,400 | $3,500 | 12 | 30% |
| Main Street storefront | $2,400 | $5,000 | 20 | 25% |
| Northgate Mall | $3,800 | $7,000 | 32 | 50% |

The rent in the table is for the short term (see
[The lease term](#the-lease-term)).

The build-out takes 7 days. The player can stock the shelves during
the build-out. The first 7 open days are the grand opening, with 50%
more customers.

## The lease term

The player picks a term when they sign. A term is a number of rent
periods of 28 days.

| Term | Length | Rent |
| --- | --- | --- |
| 6 periods | 168 days | The rent in the Locations table |
| 12 periods | 336 days | 10% lower |

The deposit is one rent of the term the player picked. The Lease box
and the sign dialog show the term and the end day.

- **Closing before the term ends**: the player pays a buyout of 3
  rents, or the rent for the rest of the term if that is less. The
  landlord keeps the deposit. The player needs the cash for the
  buyout.
- **Notice window**: in the last 7 days of a term, the player can
  close with no buyout. The landlord gives back the deposit.
- **Renewal**: on the end day, the lease renews for the same term, at
  the same rent. The player must close in the notice window to leave.
- **Old saves**: a store from an older save has no term. Its lease
  runs month to month. The player can close at any time, and the
  landlord gives back the deposit.

## Overhead

Every 28 days, with the store rent, the store pays overhead. The
ledger category is "Store overhead".

| Cost | Strip mall | Main Street | Mall |
| --- | --- | --- | --- |
| Insurance | $90 | $130 | $200 |
| Utilities | $140 | $220 | $380 |
| POS software | $60 | $80 | $100 |
| Card fees | 3% of the store's sales in the period | the same | the same |

The overhead and the rent count in the costs of the "Last 7 days" box
on the day before the payment. If the player cannot pay the rent and
the overhead, the landlord locks the store (see
[Store rent and eviction](#store-rent-and-eviction)).

## Rival game shops

Cardboard Castle and Top Deck Games see a new store as a competitor.
When the player signs a lease:

- Each shop takes 15 standing points from the player. Standing does
  not go below 0.
- The shops stop consigning for the player while the store stands,
  from the day of the lease, with the build-out. The shop screen says
  "We don't consign for the competition."
- Cards that are already on consignment stay there. They sell or come
  back as before.

When the store closes, consignment opens again at the standing that
the player has. The standing does not come back. The sign dialog tells
the player all of this.

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

The store has two shelf prices, and a slab can have its own price.

| Price | Choices (share of market) | Default |
| --- | --- | --- |
| Singles and slabs | 95%, market, 110%, 120%, 130% | 110% |
| Sealed | 90%, market, 110%, 120%, 135%, 150% | Market |
| One slab | 90%, 95%, market, 110%, 120%, 130%, 150%, 200% | The singles price |

Sealed product sells near MSRP. Hot product goes above market. A slab
with no own price uses the singles price. The player sets the own price
of a slab from the menu on its row on the store screen, or from its
Status box. The clerk and the counter both use the price of each item.

A customer pays from 92% to 128% of market. A lower price sells more
items. A higher price makes more on each item.

An old save has one store-wide price. It becomes the singles price and
the sealed price, until the player sets a price.

## Online listings

Most shops sell the same stock in the case and online. An item in the
store can also have a listing on TCGplayer (raw singles) or eBay. The
item stays in the store while it is listed. The player lists it with
"List online too", from the menu on its row or from its Status box. The
sell sheet is the same as for any listing (see
[15-selling.md](15-selling.md)). Facebook Marketplace is not available.

- **Sells online**: the listing rolls at End Day like a normal listing.
  If it sells, the item leaves the store.
- **Sells in the store**: the listing goes away with the item.
- **Both on one day**: when the online listing would sell on the same
  day as a store sale, there is a 2% chance of a double sale. The
  player cancels the online order, and reputation goes down by 2. In the
  other 98%, the player pulls the listing in time.
- **Listing ends with no sale**: the item stays in the store.
- **Take it back**: the item leaves the store and stays listed.
- **Close or eviction**: the online listings end.

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

## Buylist

A real shop makes its best margin when it buys collections for less
than market. The store has a buylist. The player sets two values on
the store screen:

- The cash offer: off, or 40%, 50%, or 60% of market.
- The daily cash budget: $100, $250, $500, or $1,000.

The buylist runs on each open day, in the hours that the clerk covers.
Walk-in sellers come in. Each seller brings one item: a single, a slab,
or sealed product. The item has a hidden floor of 40% to 75% of market.
The clerk buys when the offer meets the floor and the budget has room.
A higher offer brings more sellers and more sales to the store.

- The items go to Inventory in hand, not onto the shelves. The player
  decides what to stock.
- `paid` is the cash offer.
- The clerk does not check for fakes. The roll uses the stranger
  source, the same as a stranger at the counter. The player can still
  look by eye when they work the counter.
- The morning report says what the clerk bought and what it cost.
- When the daily budget is gone, the clerk turns sellers away. The
  report says so.

## Store credit

A seller can take store credit in place of cash. Credit is worth 130%
of the cash offer.

- At the counter, the player sees a "Pay in store credit" button next
  to "Buy" on each seller. No cash leaves the till. The item cost is
  still the cash offer.
- On clerk days, the player can set the clerk to offer credit. 60% of
  sellers whose floor the credit meets take it. The credit does not
  use cash, but it counts against the daily budget at the cash offer.
- The store owes the credit. The store screen shows the amount.
- On each open day, customers pay up to 25% of the day's sales with
  credit. No cash comes in for that part. A negative Sale line in the
  ledger shows it. This holds for the clerk's sales and for the sales
  at the counter.
- Credit that customers hold is lost when the store closes.

## Bulk box

The player can move bulk groups from Inventory to the bulk box. The
store sells every card in the box at $0.10. Small-budget customers
look in the box. Half of them buy a handful of 5 to 20 cards. The
store screen shows the count of cards in the box. The player can take
the groups that are still in the box back to Inventory. When the store
closes, the box comes home with the other stock.

## Wholesale

A distributor opens an account for a store. When the build-out is
done, wholesale opens even below reputation Respected (see
[12-acquiring-product.md](12-acquiring-product.md)).
Case splits still need Respected.

A store account buys sealed product at 58% of MSRP. A player with no
store pays 72%. The distributor allocates hot product to a store
account:

- Each week, the account can buy a limited number of cases of each
  product. The limit is 1 case, plus 1 case for each $6,000 that the
  player spent with the distributor over the whole run, up to 5. A
  product that is not hot has 1 more case.
- A product is hot when its market price is 1.2 times its MSRP or
  more.
- A store account has no minimum order. The allocation replaces it.
- The wholesale screen shows the allocation for each product, the
  cases left this week, and the total spent.

The order history is in the save data. It counts from the first order,
also before the store.

## Store rent and eviction

- Store rent and overhead are due every 28 days after the lease day.
  The game warns the player 3 days before.
- The home rent comes first. If the player cannot pay the store rent
  and the overhead after the home rent, the landlord locks the store.
- **Eviction**: the landlord keeps the deposit, and reputation goes
  down by 15. The stock comes home the next day. The run does not end.

## Closing the store

The player can close the store at any time. Before the term ends, the
player pays the buyout and the landlord keeps the deposit. In the
notice window at the end of the term, there is no buyout and the
landlord gives back the deposit (see
[The lease term](#the-lease-term)). The stock comes home the next day.
The fixtures stay with the building. Consignment at the game shops
opens again. The player can sign a new lease later.

## The store screen

- **Today**: work the counter, and the customers to expect today.
- **Last 7 days**: sales, costs (wages, rent, and overhead), the net,
  customers, and items sold.
- **Shelves**: the room used, the stock at the shelf price, and the
  stock list. Each row has a menu: the slab price, and the online
  listing.
- **Buylist and store credit**: the buylist settings and the credit the store owes.
- **Bulk box**: the cards in the box and the buttons to move bulk.
- **Prices**, **Staff and hours**, **Fixtures**, and **Lease**. The
  Lease box shows the term, the end day, the buyout, and the overhead.

The calendar shows the grand opening, each open day, each event, and
each store rent.

## Open topics

- Balancing. The clerk wage against the sales on a quiet weekday.
- A second store, or a bigger space.
- Consignment at the player's own store.
- Credit that expires. A buylist for sealed product only.
