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
Saturdays and Sundays. Some weekends have two shows: a local show on
Saturday and another one on Sunday. Two shows never fall on one day.

1 show in 6 bans in-print sealed product. The calendar marks it "no
in-print sealed". At that show, floor vendors bring no in-print sealed
product, sellers bring none, and the player cannot bring any to the
table. Older sealed product is allowed. A case of an in-print product is
banned too.

| Size | Days | How often | Table fee | Walk-in entry | Buyers at a table | Booking closes |
| --- | --- | --- | --- | --- | --- | --- |
| Local show | 1 (Saturday or Sunday) | About half of the Saturdays and 40% of the Sundays that have no regional show | About $40 | $5 a day | About 20 visitors a day | 1 day before |
| Regional show | 2 (Saturday and Sunday) | About 1 every 4 weeks | About $150 for both days | $15 a day | About 40 visitors a day | 7 days before |

### Small shows

A small show is an evening pop-up (AJ, 2026-11-27: "a small show might
happen anytime"). It can come on any day that has no other show: 22% of
weekdays and 15% of weekend days.

| | Small show |
| --- | --- |
| Doors | 5 PM – 9 PM, after the day job |
| Table fee | About $20 |
| Walk-in entry | $2 |
| Buyers at a table | About 10 |
| Booking | Open until the day itself |
| Floor | About 6 tables |
| Big spenders | Mostly 1 or 2 stars |

It plays like a local show, and like any show it can ban in-print
sealed product.

### Show info

Each show posts the organizer's numbers when it goes on the calendar.
The show's screen shows them under "What to expect". Each number
changes the show day.

| Number | Range | What it changes |
| --- | --- | --- |
| Big spenders | 1 to 5 stars | A local buyer's budget: ×0.6, ×0.8, ×1, ×1.4, ×1.9. From 3 stars, some visitors are whales who want the dearest cards on the table: 1%, 3%, 6% of visitors. |
| Expected crowd | ×0.7 to ×1.4 | The buyers who come to the table each day. |
| Booths | 6 and up (local about 10 to 16, regional about 26 to 40) | The vendor tables on the floor. Each kind scales from the usual plan, with at least one of each. |
| Table fee | | The base fee × (0.7 + 0.1 × stars + 0.3 × (crowd − 1)), to the nearest $5. A better show costs more. |

- A regional show has 3 to 5 stars. A local show has 1 to 5, and most
  have 2 or 3.
- The booths confirm as the show comes closer: about half six weeks
  out, and all of them in the last week. The player's vendor contacts
  who come are always confirmed, and the screen names them.
- The numbers are the organizer's estimate. The crowd on the day is
  random around the expected crowd.
- A show that an older build planned gets its numbers when the save
  loads, or at the next End Day.

- The same day always gives the same show, so the calendar does not
  change when the player looks again.
- **The vendor kit** is an upgrade that the player must own to book a
  table: a table cover, display cases, card stands, and a card reader,
  for $200 (see [09-upgrades.md](09-upgrades.md#vendor-kit)). Without
  it, the player can only walk in and buy. The show's detail screen
  sells it.
- **Booking** pays the table fee at once. There is no refund.
- **A missed day** at a booked show gives no refund. The morning report
  says that the table stayed empty.
- A player with no table can **walk in** on the day, pay the entry fee,
  and buy on the floor. A walk-in packs a bag first: the items to trade
  to vendors and to grade at the booth (see
  [29-packing-and-crowds.md](29-packing-and-crowds.md#a-bag-for-walk-ins)).

## Show day

The show row on the hub opens the show. The show takes the rest of the
day: when the player heads home, the clock goes to the end of the day.
Each day of a regional show is a separate visit. The doors are open
from 9 AM to 5 PM. A player who arrives late loses the hours before
they came.

### Set up the table

- The player picks the items to bring. Master set cards, listed items,
  items that are shipping, and items at a grader stay home. PC items
  come only when the player packs them by hand (see [PC items](#pc-items)).
- The player sets one price for the table: 90% of market, market,
  110%, or 125%. The default is 110%, which leaves room to haggle.
- Three bins limit the load, and a big load takes longer to set up.
  Each show has a crowd, and the items that the crowd wants draw more
  buyers, up to 30% more. Regulars pass on stale stock. See
  [29-packing-and-crowds.md](29-packing-and-crowds.md).

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
| Player | Raw cards and small sealed from the newer sets | 95% to 110% of market. Mostly at meets (see [29-packing-and-crowds.md](29-packing-and-crowds.md#crowds)) |
| Vintage collector | Vintage and older cards and sealed | 95% to 112% of market |
| Sealed collector | Sealed product | 90% to 105% of market |

- **Condition changes the price.** The market value of a raw card
  already holds its condition price (see
  [10-grading.md](10-grading.md#condition-grades)), so the buyer's top
  price follows it. An off-center card takes more off. The buyer says
  what they see, for example "There's some wear on the corners."
- **A rival at a nearby table.** A rival flipper can take a table near the
  player's table (see [34-flippers-and-retail-limits.md](34-flippers-and-retail-limits.md#rivals)).
  A buyer pays at most 95% of the player's ask for in-print sealed that
  the rival also lists. The buyer says where the rival's table is.
- **Give it to them.** For a kid buyer, the player can give the item for
  free, once a day. The item must be worth $5 to $30. It must not be a
  known fake. A gift can become a good story (see
  [35-callouts.md](35-callouts.md#the-kid-gift)).
- **A callout in the crowd.** When the hottest open callout is at heat 50
  or more, 1 buyer in 8 who does not sell mentions the thread. That buyer
  has 1 less patience (see [35-callouts.md](35-callouts.md#the-record)).
- The buyer's top price is hidden. The first offer is 72% to 90% of it.
- A counter inside the fair band never uses patience. A reply tells how
  far apart the two sides are. The player can make one final offer.
  Some buyers want two items as a bundle. See
  [30-haggling-and-deal-reputation.md](30-haggling-and-deal-reputation.md).
- **Sell** takes the offer. **Counter** uses a slider that snaps to
  5% steps of market, from 50% to 150%, and clicks at each step. It
  starts one step past the buyer's offer. A counter at or under the top
  price sells. A counter over it makes the buyer come up part of the way and
  uses one patience point. With no patience left, the buyer walks away.
  **Decline** sends the buyer on.
- Sales pay cash at once, with no fees and no shipping.

**Traders** want one item of $8 or more. They offer one or two of
their own cards, often older ones, and sometimes cash. The offer is 80%
to 102% of the item's market. **Accept** takes the trader's offer.
The trader shows only the cards in the offer. **Ask to see their
binder** shows more (see [Stashes](#stashes)). The player taps a binder
card to add it to the trade or take it out.

To counter, the player sets what the trader's cards are worth to them,
with a slider from 50% to 120% of market in 5% steps. It starts at 80%.
The cash that evens the trade against the item's market follows: the
trader adds cash, or, when the player values the cards above the item,
the player adds cash. **Propose** sends it. The trader takes it when the
real value they give (the cards at market plus their cash) stays within
their hidden limit, 100% to 110% of the item's market. If not, they add
part of the cash, or walk away when their patience runs out.

The cards that come in carry their value as their cost.

**Sellers** want to sell something to the player: a single (often
vintage or older, and worn), a slab, or sealed product. Most bring
something that the player can pay for. About 1 in 7 brings a big item.

| Seller | First price | Lowest price (hidden) |
| --- | --- | --- |
| Cleaning out a closet | 60% to 85% of market | 42% to 60% |
| Collector | 75% to 95% | 60% to 75% |
| Dealer moving stock | 85% to 100% | 72% to 85% |

Some sellers bring a whole collection instead of one item, and some
only ask whether to grade a card. See
[33-collections.md](33-collections.md).

**Buy** pays the price. **Offer** uses the same slider, from 30% to
110% of market, and starts one step under the seller's price. At or
over the lowest price, the seller takes it. Under it, the seller comes down part
of the way or walks away.

### The floor

The floor is the other tables at the show. Each table is a business or
a person, with its own stock and its own prices. Big shows matter
because this is where most vintage turns up.

| Table | Stock | Price, share of market | Says yes to 10% off |
| --- | --- | --- | --- |
| Vintage dealer | Vintage singles and slabs, and 4 to 7 sealed items (65% vintage, 35% older) | 100% to 125% | 30% of the time |
| Modern dealer | New singles, some slabs, and 4 to 8 sealed items (75% new, 25% older) | 95% to 120% | 45% |
| Game shop booth | Mostly new and older sealed, 0 to 2 vintage packs, and a few singles | 95% to 112% | 40% |
| Collector clearing out | A mixed collection: vintage and older cards, or new and older cards. Often worn. 2 to 4 sealed items. | 60% to 95% | 70% |
| Mystery packs | Three kinds of repack, and a few singles | 100% to 130% | Never asked |
| Sealed dealer | Sealed only: 12 to 18 items (30% vintage, 35% older, 35% new) | 100% to 120% | 35% |

- **Table count:** a local show has 13 tables: 2 vintage dealers and
  1 sealed dealer. A regional show has 33 tables: 8 vintage dealers and
  3 sealed dealers.
- **The rival's table.** A rival flipper who follows the player adds a
  table of 3 to 5 hot in-print sealed products at 95% of market. Some of
  the stock is resealed, at the plug fake rate. A resealed product that
  the player buys here, and later finds, gives a receipt against that
  rival (see [35-callouts.md](35-callouts.md#receipts)).
- **Sellers at the table** bring sealed product 40% of the time. Of
  that, 35% is vintage and 30% is older.
- **Stock:** a dealer has 15 to 30 items. Each table has two
  sections: **Singles** (cards and slabs) and **Sealed** (sealed
  product and mystery packs).
- **People stop the player on the floor.** On the first look at a
  table, 1 time in 4, someone stops the player to sell something. It
  plays like a seller at the table.
- **Old cards show their age.** Vintage and older cards from a dealer
  or a collector have more wear and looser centering. A worn card is
  priced from its condition price (80% of market for Lightly Played,
  65% for Moderately Played, and so on).
- **Slabs** are PSA or CGC, grade 6 to 10, at the graded price.
- **Time:** looking over a table the first time takes 15 minutes. A
  buy takes 5 minutes, and asking for a deal takes 2. Buyers who come
  to the player's table meanwhile leave after half an hour.
- Each item can be asked about once.

### Trading with vendors

The player can trade with any vendor at a card show or a surprise
opportunity, except mystery packs. Garage sales and estate sales take
cash only. Each vendor with goods to trade has a **Trade with** button.

The player picks items from the vendor's table (not mystery packs) and
items from their own stock. The player can offer slabs, raw cards, and
sealed product that they brought. A deal needs at least one item on each
side. The vendor does not take a player item with a market under $5.
A dealer does not pay a PC premium, so a PC item does not trade to a
vendor.

- The vendor values their own items at the sticker price.
- The vendor values the player's items at market times the trade rate.
  The rate is 75% (85% for vintage and older sets) at a vintage dealer,
  80% at a modern dealer, 75% (85% for sealed) at a game shop booth,
  and 85% at a collector. A recurring vendor adds the same bonus that
  they give on prices.
- The difference is cash. When the vendor's side is worth more, the
  player pays the difference. When the player's side is worth more, the
  vendor pays 85% of the difference, up to a cap: $1,500 for a vintage
  dealer, $1,000 for a modern dealer, $400 for a game shop booth, and
  $250 for a collector. Above the cap, the player must take more from
  the table.
- **Ask for a better rate** adds 5 points to the rate. It works as often
  as asking for a deal, and the player can ask once for each vendor.
- The vendor looks over the player's items. A fake that the vendor sees
  stops the trade. The player loses reputation and standing with the
  vendor, and the item becomes a known fake.
- A fake that the vendor does not see can come out later, as with a
  visitor trade. Then the player loses reputation and standing with the
  vendor.
- A trade takes 10 minutes.

The items that come in carry the sticker price as their cost. The wallet
ledger shows only the cash.

### PC items

The player's PC items can go to a show or a meet (see
[08-ui-direction.md](08-ui-direction.md#the-pc)). Every deal on a PC
item carries the PC premium, and so does every deal on another person's
PC item.

- **The PC price** is 130% of market. It is fixed. The table markup does
  not change it.
- **Buyers.** A collector, a vintage collector, a sealed collector, or a
  player can pay the premium. Their top price for a PC item is their
  normal top price times 1.0 to 1.45. A flipper, a kid, or a grading
  hunter does not pay a premium. A buyer whose top price is under the
  PC price passes: "Someone asked about the item in your PC." The pass
  counts as a passed visitor. A buyer who stays opens at the PC price.
  A PC item is never part of a bundle.
- **No sale under the PC price.** A counter or a final offer under the
  PC price does not go out.
- **Traders.** A trader who wants a PC item builds the offer on the PC
  price. The cash and the valuation follow the PC price.
- **Sellers.** A seller at the table counts a PC item at its PC price
  for a trade instead of cash.
- **Vendors** do not take PC items in a trade.
- **Another person's PC.** A trader's PC card counts at 130% of its
  market in a trade. A seller's PC item has a lowest price of 130% of
  market, and asks 105% to 120% of that.
- A PC item that the player gets in a trade or buys keeps the price as
  its cost. It goes to the regular Inventory, not to the PC.

### The showcase

With the showcase case upgrade and at least one card in the showcase,
the setup screen has "Bring the showcase" (see
[08-ui-direction.md](08-ui-direction.md#the-showcase)). It is on by
default. It works at a table with the table rules: a show or a meet. It
does not use the bins.

- **Setup** takes 10 more minutes.
- **More people.** Visitors go up by 5% times the square root of the
  showcase value in thousands, at most 25%. A $10,000 showcase draws
  about 16% more people.
- **More whales.** A visitor is a whale 3% of the time, plus 1.5% times
  the same root, at most 12%. A whale has no budget cap.
  - 65% of whales want one of the dearest third of the table items.
    Their top price is 100% to 115% of market (of the PC price for a PC
    item).
  - 35% ask about a showcase card. The card is not on the table, but
    they open at the PC price (130% of market), and their top price is
    130% to 160% of market. The player cannot sell under the PC price.
    A sale removes the card from the showcase.
- **Followers and reputation.** Each visit with the showcase out pays
  once when the table opens: reputation +1 (+2 for a showcase of $10,000
  or more), and followers of 1.5 times the square root of the showcase
  value, at most 400, with a social account.
- The showcase stays in the player's hands, so a table theft does not
  take a showcase card.

### Stashes

A trader shows the cards in the offer, and a seller shows one item. The
player can ask to see more: a trader's binder, or a seller's stash. This
works at the table, on the floor, and at meets.

- **The ask** is once for each person, and it takes 3 minutes.
- **Familiarity** decides the result:

  | Standing | Shows it | Items | PC items |
  | --- | --- | --- | --- |
  | Stranger | 50% | 2 to 3 | 0 |
  | Familiar | 65% | 3 to 4 | 0 |
  | Regular | 80% | 4 to 6 | 0 |
  | Trusted | 95% | 5 to 8 | 1 to 2 |
  | Friend | Always | 7 to 10 | 2 to 3 |

  A closet cleaner is 30 points more likely to show it.
- **A trader's binder.** The new cards go into the binder list of the
  trade panel. The player taps a card to add it to the trade.
- **A seller's stash.** Each item has an asking price and a hidden
  lowest price, from the same ranges as the seller's main item. A
  contact's price bonus takes a share off both. A stash item can be a
  fake, as with any seller.
- **An offer on the stash.** The player picks items and sets a price
  with a slider, from 30% to 130% of market, in 5% steps. A PC item
  counts at its PC price. "Pay" pays
  the asking price, or the seller's counter. At or over the total of
  the lowest prices, the seller sells. Under it, the seller counters
  between the lowest and the asking total. After two counters, a third
  low offer closes the stash. An offer under 60% of market is a
  lowball, and a contact remembers it.
- A stash deal is separate from the main deal. The seller stays at the
  table, and the main deal stays open. A stash buy is scored for deal
  fairness, as any buy is.

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

### Rip it on the spot

After the player buys sealed product at the show, from a table or from
a seller, a banner offers **Rip it now**. It opens the rip screen over
the show. Each pack takes about 2 minutes of show time. **Later** keeps
it sealed in Inventory.

### The summary

The summary shows the sales, the floor buys, the trades, the buyers
missed, and the buyers who walked away. After day 1 of a regional show,
the player ends the day from the hub and comes back for day 2.

### Coin flips

At a show or a meet, a buy deal or a sell deal can end with a coin
flip. The flip has one full price. The buyer wins: they pay half. The
seller wins: they pay the full price. Heads means the player wins.

- **The full price.** When the player sells, it is the player's asking
  price. When the player buys, it is the seller's price.
- **A visitor offers a flip.** Some visitors ask to flip for it. They
  ask only when the average price (75% of the full price) works for
  them. The button is **Flip for it**.
- **The player offers a flip.** The **Offer a flip** button asks one
  time for each visitor. A visitor says yes when the average price
  works for them and they like to gamble. A flipper or a dealer often
  says yes. A kid's parent almost never does.
- **Before the flip,** a buyer looks the item over. A fake that they
  catch ends the deal with no flip.
- **No flips** at the player's own store, and no flips on trades.

## Also built

- **The show promo post** (see [06-social-media.md](06-social-media.md)):
  a quick post that picks a show. 25% more people come to the table
  there.
- **A better table spot** from reputation Trusted: 15% more people at
  the table (see
  [04-reputation-and-followers-unlocks.md](04-reputation-and-followers-unlocks.md)).
- **Packing and crowds** (see [29-packing-and-crowds.md](29-packing-and-crowds.md)):
  carry space, setup time, the crowd at each show and meet, and stale
  stock. With a table, the grading booth only takes raw cards that the
  player brought.
- **A first look** from reputation Trusted: a recurring vendor shows
  the player their 2 best items before the table opens, at 5% off.
- **The grading booth** at a regional show: PSA, $40 a card, the slab
  in hand after about 20 minutes of show time. A fake comes back
  flagged, and the fee is gone.
- **The Venue.** The show session is the encounter for meets, league
  night, garage and estate sales, and surprise opportunities too. A
  venue sets the hours, the visitor count, the seller share, and whether
  there is a table and a floor (`Model/Shows.swift`, `Venue`).
