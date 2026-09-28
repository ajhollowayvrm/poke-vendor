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
| Local show | 1 (Saturday) | About half of the Saturdays that have no regional show | $40 | $5 a day | About 14 a day | 1 day before |
| Regional show | 2 (Saturday and Sunday) | About 1 every 4 weeks | $150 for both days | $15 a day | About 28 a day | 7 days before |

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

### Buyers

Buyers come to the table one at a time, and the show clock jumps to
each arrival. A buyer who waits more than 30 minutes leaves, and counts
as missed.

| Buyer | Wants | Top price |
| --- | --- | --- |
| Collector | Anything | 92% to 108% of market |
| Flipper | Anything | 68% to 82% of market. Less patience. |
| Kid with a parent | Items of $30 or less | 95% to 115% of market, and never more than $30 |
| Grading hunter | Raw cards of $5 or more | 85% to 100% of market, more for a clean, centered card, and much less for an off-center card |

- **Condition changes the price.** Light wear takes 18% off the top
  price, and heavy wear takes 40% off. An off-center card takes more
  off. The buyer says what they see, for example "There's some wear on
  the corners."
- The buyer's top price is hidden. The first offer is 72% to 90% of it.
- **Accept** sells at the offer. **Counter** asks for the middle price,
  and **Ask** asks for the table price. A counter at or under the top
  price sells. A counter over it makes the buyer come up part of the
  way and uses one patience point. With no patience left, the buyer
  walks away. **Decline** sends the buyer on.
- **Trades:** a quarter of the collectors who look at an item of $15
  or more offer a trade: one of their cards, plus cash to make up the
  value. The card comes in at its market price as its cost.
- Sales pay cash at once, with no fees and no shipping.

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

- **Table count:** a local show has 8 tables, and 1 of them is a
  vintage dealer. A regional show has 18 tables, and 5 of them are
  vintage dealers.
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
