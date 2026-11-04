# Packing and Crowds

**Status: built.** This doc started as the plan for the change. It
also answers the questions that the change raises. It is now the design
record (`Model/Packing.swift`, with hooks in `Model/Shows.swift`,
`Model/Meets.swift`, `Model/Upgrades.swift`, and `Show/ShowSetupStage.swift`).
The bag for walk-ins came after the first build.

## The problem

Before this change, the choice of what to bring to a table was not a
real choice:

- The setup screen selected every item by default.
- More items always brought more visitors. The boost stopped at 18
  items.
- Every venue used the same mix of buyers. A park swap and a regional
  show got the same people.
- Theft rose with the value on the table, but the player cannot see a
  rare roll when they choose.

So "bring everything" was always the best move. A real choice needs two
parts:

1. **A cost for each item.** The player cannot bring everything.
2. **A reward for the right items.** Each venue wants different things.

This doc adds four rules:

| Rule | Part | Short form |
| --- | --- | --- |
| Carry space | Cost | Three bins: raw cards, slabs, and sealed. Upgrades make them bigger. |
| Setup time | Cost | A big load takes longer to lay out. Buyers who come before the table opens are lost. |
| Crowds | Reward | Each venue has its own buyers and its own budgets. A buyer who finds nothing for them leaves. |
| Stale stock | Reward | A regular remembers your table. The same items each week sell less to regulars. |

## Carry space

The player carries stock in three bins. Each bin has its own limit.

| Bin | Holds | With no upgrade | Upgrade | With the upgrade |
| --- | --- | --- | --- | --- |
| Binder | Raw cards, 1 space each | 40 | Vendor binder, $40 | 160 |
| Slab box | Slabs, 1 space each | 3 | Slab case, $90 | 20 |
| Tote | Sealed product, by size | 8 | Folding cart, $120 | 30 |

**The size of sealed product** comes from its pack count:

| Product | Packs | Space |
| --- | --- | --- |
| A booster pack | 1 | 1 |
| A 3-pack blister | 3 | 2 |
| A booster bundle | 6 | 2 |
| An Elite Trainer Box | 9 | 3 |
| A booster box | 36 | 7 |
| A case of booster boxes | 216 | 37 |

The rule is: 1 pack is 1 space. More packs are 1 space plus 1 for each
6 packs, rounded up.

## Setup time

Laying out the table takes time. The clock moves forward when the
player opens the table.

- Setup takes 10 minutes, plus 1 minute for each 5 raw cards, plus
  half a minute for each slab, plus 1 minute for each space of sealed.
- A full load with no upgrades takes about 28 minutes. A full load with
  all three upgrades takes about 82 minutes.
- Day 2 of a regional show takes half the time when the player set up
  on day 1. The table stayed set up overnight. A player who missed day 1
  takes the full time.
- Visitors arrive between the moment the table opens and the close.
  So a long setup means fewer visitors. A meet lasts 3 hours, so a
  big load at a meet costs much more than a big load at a show.
- The setup screen shows the setup time and the clock time when the
  table opens.

## Crowds

Each venue has a crowd. The crowd sets three things:

1. **Who comes.** The buyer types and how often each one comes.
2. **How much they spend.** Each buyer has a budget. The budget is the
   crowd's spend cap times a random value from 50% to 150%. A buyer
   only wants items that ask no more than the budget.
3. **How many want to trade.** The trade share is a share of the
   visitors who do not come to sell. So a high seller share at a meet
   still leaves room for buyers.

| Venue | Who comes (weight) | Spend cap | Trade share |
| --- | --- | --- | --- |
| Park swap | Kid 3, collector 2, player 1, flipper 1 | $60 | 35% |
| League night | Player 4, kid 2, collector 1, sealed collector 1 | $80 | 20% |
| Trade night | Collector 2, flipper 2, player 1, grading hunter 1, kid 1 | $150 | 40% |
| Trading circle | Collector 3, vintage collector 2, grading hunter 2, sealed collector 1 | No cap | 25% |
| Local show | Collector 2, flipper 1, kid 1, grading hunter 1, vintage collector 1, sealed collector 1 | $400 | 23% |
| Regional show | Collector 2, grading hunter 2, vintage collector 2, sealed collector 2, flipper 1, kid 0.5 | No cap | 23% |
| Your store counter | The same as before this change | No cap | 18% of all visitors |

At reputation tier 0, a show's seller share is 22%, so 23% of the rest
is about 18% of all visitors. That is the trade share from before this
change. A higher tier brings more sellers, so the trade share of all
visitors goes down a little. The store counter keeps the old flat 18%
of all visitors, because its seller share is 32%.

**The player** is a new buyer type. A player wants cards to play:

- Raw cards from the newer sets, not vintage and not older sets.
- Sealed product with 10 packs or less, from the newer sets, to open.
- A player pays 95% to 110% of market.

**A buyer who finds nothing leaves.** Before this change, a buyer who
found nothing they wanted turned into a collector who wanted anything.
Now the buyer looks over the table and leaves. A banner says why, for
example "A kid looked over your table and found nothing for $30 or
less." The banner shows only when no other line is on it, so it never
hides a more important line, such as a buyer who caught a fake. The
summary lists each person who passed, under "Passed your table".

**The crowd decides the turnout.** Before this change, more items
always brought more visitors. Now each item has an appeal for the crowd:
the share of the crowd that would want it at its asking price. The
appeal of the whole table brings people:

- Visitors = the venue's mean × (0.7 + table appeal ÷ 20), at most
  130%.
- A table of 12 items that every buyer wants gets the full 130%.
- An item that nobody in the crowd wants adds nothing to the turnout.
  It still takes space and setup time.

**The player sees the crowd.** The crowd shows in three places:

- The setup screen, at the top, in full.
- The meet row on the hub, in short form.
- The show detail on the calendar.

## Stale stock

Regulars remember what was on the player's table.

- The game keeps a record of each item: the days when it was on a table
  at a show or a meet. Records older than 21 days drop off.
- Today does not count. Day 1 of a regional show counts on day 2.
- Only regular buyers remember. Regular traders and sellers do not.
- **A regular looks at fresh items first.** A regular picks an item
  with a weight of 1 ÷ (1 + the times it was on a table).
- **A regular can pass on a stale item.** When a regular picks an item
  that was on a table before, the chance that they pass is 30% for each
  time, at most 75%. A banner says so, for example "Dana looked over
  your table. \"Same stuff as last time.\""
- Strangers do not care. Only regulars remember.
- The setup screen shows the count on each item, for example "On a
  table 2× in 3 weeks".

Regulars are 60% of the visitors at a meet and 35% at a show. So stale stock hurts most at the weekly meets. This
is the purpose: the player rotates stock between meets.

## A bag for walk-ins

A walk-in at a card show has no table, but they can trade with vendors
and use the grading booth. Before this rule, a walk-in traded from the
whole stock in hand. Now a walk-in packs a bag first.

- The show opens on a **Pack your bag** screen, before the floor.
- The bag uses the same three bins as a table, with the same upgrades.
- There is no setup time, no crowd, no price, and no stale record.
  Nothing in the bag is for sale.
- A vendor trade can only use items in the bag. The grading booth can
  only take raw cards in the bag. The game checks both rules in the
  model, not only on the screen.
- **Walk the floor** closes the bag. The player cannot come back for
  more. The bag was packed at the car.
- The bag starts as the last bag that the player packed, less the items
  that are gone. The first bag is empty, because most walk-ins come to
  buy.
- Surprise opportunities and garage and estate sales do not get a bag.
  A garage or estate sale takes cash only, so a bag does nothing there.

## The setup screen

- **The default load.** The screen starts from the last load that the
  player brought, less the items that are gone. On the first table, it
  starts with the dearest items that fit.
- **Fill** adds items from the dearest down, until the bins are full.
  It does not read the crowd. Reading the crowd is the player's job.
- **Clear** empties the load.
- **A full bin** dims each item that does not fit. A tap on a dimmed
  item does nothing. The row says why: the bin is full, or the item is
  too big for the bin.
- **Sealed rows** show their space when it is more than 1.
- **Items under 50 cents** are not in the list. They never go on a
  table, so they must not take space.
- **The load leaves the car once.** At a booked show, the player can
  walk the floor before the table opens. After that first trip, the load
  can only get smaller: Fill is off, and a row that is not in the load
  says "Your load left the car." So the player cannot trade or grade one
  load, then pack a second one.
- **A table with no time left** gets no stale record and no theft roll.
  No buyer saw it.
- **The load always fits.** Only the packing actions change the load.
  When the table opens, the game checks the load against the bins again,
  and keeps the dearest items that fit.
- **The bins** show at the top, for example "Binder 23/40 · Slab box
  2/3 · Tote 5/8".
- **The setup time** shows next to the bins, with the clock time when
  the table opens.

## Questions and answers

These are the questions that the change raises, with the answer for
each.

**Where does the player choose the load: at home, or at the venue?**
At the venue, on the setup screen. That is where the choice happens
now. A separate packing screen at home adds a step to every trip, and
the player gets no new choice from it. The result is that the car
break-in roll at the start of a show still takes from the whole stock
in hand. It does not read the load. This is a known gap.

**Do purchases and trades at the venue use carry space?** No. The bins
limit what goes on the table. What the player buys or gets in a trade
goes home in their hands.

**Can the player bring an item that is bigger than its bin?** No. A
case of booster boxes needs 37 spaces, and the folding cart holds 30.
A case stays home. The player sells a case online or to a dealer.

**What about a walk-in at a show, and the surprise opportunities?**
A walk-in packs a bag (see [A bag for walk-ins](#a-bag-for-walk-ins)).
A surprise opportunity still trades from the whole stock. This is a
known gap.

**What about the player's own store?** The store counter does not
change. The table is the stock on the shelves. There is no carry space,
no setup time, no stale record, and the crowd is the same as before.

**Does the grading booth change?** Yes. A player with a table can only
grade the raw cards that they brought. Before, the booth took any raw
card that the player owned, even one at home.

**What if the player arrives late and the setup runs past the close?**
The table opens with no time left, and the day ends. The setup screen
shows the clock time when the table opens. When that time is at or after
the close, the screen says so.

**Does the price markup touch the crowd?** Yes. The budget check uses
the asking price. A 125% markup at a park swap pushes more items over
the budget. This is intended. It is one more part of reading the crowd.

**Does the kid's $30 limit change?** No. The kid's limit stays at $30,
and the crowd's spend cap applies too. The lower one wins.

**Do the promo post and the good table spot still add visitors?** Yes.
They multiply the turnout after the appeal.

**Does theft change?** No. Theft already rises with the value on the
table. The bins limit the value, so the risk follows the load.

**Do the table supplies change?** No. A table still uses 30 penny
sleeves, 15 top loaders, and 6 team bags. That is the wear on the
supplies, not one piece for each card.

**Does the crowd change the sellers or the floor?** No. Sellers and
floor tables stay as they are. A later change can give each crowd its
own sellers.

**Which venues share the stale record?** All of them, except the
store. The local scene is small, and the same regulars go to the meets
and the local shows. One record is simple, and the player can read it.

**What happens to old saves?** The new fields have defaults. An old
save loads with no stale records and no last load. The first table
starts with the dearest items that fit.

**Does the soak test still work?** Yes, and it now tests the packing
rules. On every other table, the soak clears the load, picks items by
hand, and fills. It checks:

- No bin is over its limit, and an item too big for its bin never goes
  in.
- At a booked show, the soak walks the floor, comes back, and tries to
  add an item. The load must not grow.
- The grading booth turns down a raw card that is not in the load, and
  a vendor turns down a trade item that is not in the load.
- Every item that leaves the stock during a visit was in the load.
- The game keeps the bag, and the passed list matches the counts.

The soak also grades one card at a regional booth. It counts each check,
so a check that never ran shows as 0. It buys the three bin
upgrades on day 30, so it plays both bin sizes. The soak prints one
`SOAK PACK` line, and a `SOAK PACK FAIL` line for each broken rule. Run
`-soak 60` after a change to this system.

## Not in this change

| Idea | Why not now |
| --- | --- |
| Hire a helper | A good upgrade later: it cuts setup time, and the table is not empty while the player walks the floor. It needs the costs in this doc first. |
| Rumors before an event | A message can say what a crowd wants this week. It builds on the crowds in this doc. |
| Handling wear | A raw card can lose condition at a table. It ties into supplies, and it needs its own balance pass. |
| Weather at the park swap | Rain lowers the turnout and puts raw cards at risk. It needs a canopy upgrade. |
| Trade bait | Traders at some venues ask for certain items. |

## Values

| Value | Starting value |
| --- | --- |
| Binder, no upgrade / vendor binder | 40 / 160 raw cards |
| Slab box, no upgrade / slab case | 3 / 20 slabs |
| Tote, no upgrade / folding cart | 8 / 30 spaces |
| Vendor binder, slab case, folding cart | $40, $90, $120 |
| Setup time | 10 minutes + 1 for each 5 raw cards + 0.5 for each slab + 1 for each sealed space |
| Setup time on day 2 of a regional show | 50% |
| Buyer budget | Spend cap × 50% to 150% |
| Turnout | Mean × (0.7 + appeal ÷ 20), at most 1.3 |
| Stale record | 21 days |
| Regular passes on a stale item | 30% for each time on a table, at most 75% |
