# Card Shows

A card show is a big event on the calendar. The player can rent a table
and sell to buyers, and can walk the floor to buy from other vendors.
This doc builds on [17-calendar-and-events.md](17-calendar-and-events.md)
and [16-time-and-day.md](16-time-and-day.md).

All counts, fees, and chances in this doc are starting values for
balancing. They are in `Balance` and in `ShowSize`
(`app/PokeVendor/Model/Shows.swift`).

## Shows on the calendar

The calendar shows card shows up to 6 weeks ahead. Shows are on
Saturdays.

| Size | Days | How often | Table fee | Walk-in entry | Buyers at a table | Booking closes |
| --- | --- | --- | --- | --- | --- | --- |
| Local show | 1 (Saturday) | About half of the Saturdays that have no regional show | $40 | $5 a day | About 20 visitors a day | 1 day before |
| Regional show | 2 (Saturday and Sunday) | About 1 every 4 weeks | $150 for both days | $15 a day | About 40 visitors a day | 7 days before |

- The same day always gives the same show, so the calendar does not
  change when the player looks again.
- **Booking** pays the table fee at once. There is no refund.
- **A missed day** at a booked show gives no refund. The morning report
  says that the table stayed empty.
- A player with no table can **walk in** on the day, pay the entry fee,
  and buy on the floor.

## Show day

The show row on the hub opens the show. The show takes the rest of the
day: when the player heads home, the clock goes to the end of the day.
Each day of a regional show is a separate visit. The doors are open
from 9 AM to 5 PM. A player who arrives late loses the hours before
they came.

### Set up the table

- The player picks the items to bring. Kept items, listed items, items
  that are shipping, and items at a grader stay home.
- The player sets one price for the table: 90% of market, market,
  110%, or 125%. The default is 110%, which leaves room to haggle.
- More value on the table draws more buyers, up to 30% more.

### Visitors at the table

People come to the table one at a time, and the show clock jumps to
each arrival. A person who waits more than 30 minutes leaves, and
counts as missed. About 60% want to buy, about 18% want to trade, and
about 22% want to sell to the player. With an empty table, everyone who
comes wants to sell.

**Buyers**

| Buyer | Wants | Top price |
| --- | --- | --- |
| Collector | Anything | 92% to 108% of market |
| Flipper | Anything | 68% to 82% of market. Less patience. |
| Kid with a parent | Items of $30 or less | 95% to 115% of market, and never more than $30 |
| Grading hunter | Raw cards of $5 or more | 85% to 100% of market, more for a clean, centered card, and much less for an off-center card |
| Vintage collector | Vintage and older cards and sealed | 95% to 112% of market |
| Sealed collector | Sealed product | 90% to 105% of market |

- **Condition changes the price.** Light wear takes 18% off the top
  price, and heavy wear takes 40% off. An off-center card takes more
  off. The buyer says what they see, for example "There's some wear on
  the corners."
- The buyer's top price is hidden. The first offer is 72% to 90% of it.
- **Sell** takes the offer. **Counter** asks for the middle price, and
  **Ask** asks for the table price. A counter at or under the top price
  sells. A counter over it makes the buyer come up part of the way and
  uses one patience point. With no patience left, the buyer walks away.
  **Decline** sends the buyer on.
- Sales pay cash at once, with no fees and no shipping.

**Traders** want one item of $8 or more. They offer one or two of
their own cards, often older ones, and sometimes cash. The offer is 80%
to 102% of the item's market. **Ask for cash too** gets more cash when
the trader has room, once. The cards that come in carry their value as
their cost.

**Sellers** want to sell something to the player: a single (often
vintage or older, and worn), a slab, or sealed product. Most bring
something that the player can pay for. About 1 in 7 brings a big item.

| Seller | First price | Lowest price (hidden) |
| --- | --- | --- |
| Cleaning out a closet | 60% to 85% of market | 42% to 60% |
| Collector | 75% to 95% | 60% to 75% |
| Dealer moving stock | 85% to 100% | 72% to 85% |

**Buy** pays the price. **Offer** 80% or 65% of it: at or over the
lowest price, the seller takes it. Under it, the seller comes down part
of the way or walks away.

### The floor

The floor is the other tables at the show. Each table is a business or
a person, with its own stock and its own prices. Big shows matter
because this is where most vintage turns up.

| Table | Stock | Price, share of market | Says yes to 10% off |
| --- | --- | --- | --- |
| Vintage dealer | Base Set singles, Base Set slabs, and some Base Set or older out-of-print sealed | 100% to 125% | 30% of the time |
| Modern dealer | New singles, some slabs, and new sealed | 95% to 120% | 45% |
| Game shop booth | Mostly new and older sealed, and a few singles | 95% to 112% | 40% |
| Collector clearing out | A mixed collection: vintage and older cards, or new and older cards. Often worn. | 60% to 95% | 70% |
| Mystery packs | Three kinds of repack, and a few singles | 100% to 130% | Never asked |

- **Table count:** a local show has 12 tables, and 2 of them are
  vintage dealers. A regional show has 30 tables, and 8 of them are
  vintage dealers.
- **Stock:** a dealer has 15 to 30 items. Each table has two
  sections: **Singles** (cards and slabs) and **Sealed** (sealed
  product and mystery packs).
- **People stop the player on the floor.** On the first look at a
  table, 1 time in 4, someone stops the player to sell something. It
  plays like a seller at the table.
- **Old cards show their age.** Vintage and older cards from a dealer
  or a collector have more wear and looser centering. A worn card is
  priced from its worn value (80% of market for light wear, 60% for
  heavy wear).
- **Slabs** are PSA or CGC, grade 6 to 10, at the graded price.
- **Time:** looking over a table the first time takes 15 minutes. A
  buy takes 5 minutes, and asking for a deal takes 2. Buyers who come
  to the player's table meanwhile leave after half an hour.
- Each item can be asked about once.

### Mystery packs

A mystery pack is mostly filler and one guaranteed hit. The player
opens it at the table: the filler turns over first, then the hit.

| Pack | Price | Inside |
| --- | --- | --- |
| Modern mystery pack | $10 | 4 filler cards and 1 hit from the new sets |
| Vintage mystery pack | $35 | 4 Base Set filler cards and 1 Base Set rare or better |
| Slab mystery box | $80 | 1 PSA or CGC slab, grade 8 to 10 |

- The hit comes from a pool where cheaper cards are more common, so
  most packs are worth less than the price, and a big card is a rare
  find.
- The hit goes to Raw or Slabs with the price as its cost. The filler
  goes to Bulk.
- **Data limit:** Base Set is the only vintage set that the game has.
  More vintage sets need their research files (see
  [13-sets.md](13-sets.md)).

### The summary

The summary shows the sales, the floor buys, the trades, the buyers
missed, and the buyers who walked away. After day 1 of a regional show,
the player ends the day from the hub and comes back for day 2.

## Not built yet

- The show promo post on social media (see
  [06-social-media.md](06-social-media.md)).
- Better table spots for higher reputation (see
  [04-reputation-and-followers-unlocks.md](04-reputation-and-followers-unlocks.md)).
- On-site grading.
