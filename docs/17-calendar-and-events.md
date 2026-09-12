# Calendar and Events

When things happen: the weekly calendar, how far ahead the player sees
each event, and how arrival time changes a result. This doc builds on
the clock and game days in [16-time-and-day.md](16-time-and-day.md).

The goal comes from
[01-premise-and-loop.md](01-premise-and-loop.md#multi-day-commitments):
most events are visible in advance, so planning pays off, and rare
surprises arrive with little or no notice.

All days, times, counts, and chances in this doc are starting values
for balancing.

## Four kinds of calendar entries

| Kind | Notice | Examples |
| --- | --- | --- |
| **Recurring** | The same day and time every week | The work shift, the Friday paycheck, league night at the local game shop, fixed weekly meets |
| **Posted** | 2 to 3 days ahead | Garage sales, estate sales, store restock days (the targets for camping) |
| **Scheduled** | Weeks ahead | Card shows, rent due |
| **Surprise** | No notice | Pokemon Center drops, stock found on a store run, the hub's alert-banner opportunities |

## Recurring entries

These happen at the same day and time every week, so the player can
build a routine around them.

| Entry | When | Where | Opens |
| --- | --- | --- | --- |
| Work shift | Monday to Friday, 9 AM – 5 PM | The job | From the start |
| Paycheck | Every Friday | — | From the start |
| Trade night (meet) | Wednesday, 6:30 – 9 PM | A community center | From the start |
| League night | Thursday, 6 – 9 PM | The local game shop | From the start |
| Park swap (meet) | Saturday, 1 – 4 PM | A park pavilion | From the start |
| Trading circle (meet) | Sunday, 2 – 5 PM | A member's home | Reputation tier 1 (see [04-reputation-and-followers-unlocks.md](04-reputation-and-followers-unlocks.md#reputation-tiers)) |

### What league night gives

League night gives two things:

- **Trades** with the shop's regulars. It works as a small meet.
- **Shop standing.** Each league night the player attends adds a small
  amount of standing with that shop (see
  [12-acquiring-product.md](12-acquiring-product.md#the-local-game-shop)).

## Posted entries

These appear on the calendar **2 to 3 days before** they happen. This
is the same as real listings, which go up midweek for the weekend.

| Entry | Days | Window | How many |
| --- | --- | --- | --- |
| Garage sale | Friday to Sunday | 7 AM – 1 PM | 3 to 6 each week |
| Estate sale | Thursday to Saturday, one sale runs all 3 days | 8 AM – 3 PM each day | 0 to 2 each week |
| Store restock day | Usually a weekday | Starts at 8 AM | Each big retail store posts one about every 2 weeks |

Camping targets a posted restock day (see
[12-acquiring-product.md](12-acquiring-product.md#camp-a-store-drop-event-time-cost)).
A restock day usually falls on a weekday morning, so camping usually
needs a day off work.

Two or three days of notice leaves time to book time off for a weekday
event, because time off must be booked in advance (see
[16-time-and-day.md](16-time-and-day.md#sick-days-and-time-off)). A
player who sees an event too late can still use a sick day.

### Arrival time: early gets the best

A garage sale or an estate sale runs for a window of hours. Other
buyers arrive too, and they take the good cards first.

- The player who arrives at the start has the full chance of good
  cards.
- Each hour after the start keeps **75%** of the chance from the hour
  before. For example: 100% at the start, 75% after 1 hour, 56% after
  2 hours, and 32% after 4 hours.

This makes the clock matter. A morning sale competes with sleep after
a late night (see [16-time-and-day.md](16-time-and-day.md#late-nights)),
and a weekday sale competes with the work shift.

### Estate sales: three days

An estate sale runs Thursday to Saturday. Each day, other buyers have
taken more, and the prices drop:

| Day | Good cards left | Prices |
| --- | --- | --- |
| Thursday | The most | Full price |
| Friday | Fewer | 25% off |
| Saturday | The fewest | 50% off |

A weekday job makes this a real choice: book time off for the best
pick on Thursday, or wait for Saturday's low prices and take what is
left.

## Scheduled entries

These appear weeks ahead, because they need real planning.

- **Card shows**: multi-day blocks. Shows get their own design.
- **Rent due**: every 4 weeks, with a warning 3 days before (see
  [16-time-and-day.md](16-time-and-day.md#rent)).

## Surprise entries

These have no notice.

| Entry | How often | Details |
| --- | --- | --- |
| Pokemon Center drop | About 3 every 4 weeks | A random day. The drop stays open for that day (see [12-acquiring-product.md](12-acquiring-product.md#pokemon-center-drops)). |
| Stock on a store run | On arrival only | The player learns what a store has only when they arrive (see [12-acquiring-product.md](12-acquiring-product.md#local-stores-store-run-time-cost)). |
| Surprise opportunity | 1 to 2 every 4 weeks | An alert banner on the home hub, with 0 to 1 day of notice (see [08-ui-direction.md](08-ui-direction.md)). |

## A typical week with the day job

- **Weekday mornings (7 to 9 AM)**: a short window. Free actions, or a
  quick store stop before work.
- **Weekday evenings (5 to 11 PM)**: Wednesday trade night, Thursday
  league night, store runs, live streams, and Facebook Marketplace
  meetups.
- **Weekends**: garage sales, Saturday estate sale discounts, the
  Saturday park swap, the Sunday trading circle, and card shows.
- **Days off work**: Thursday estate sales and camping a weekday
  restock day.
- **Any time**: free actions, such as online buys, listings, quick
  posts, and grading submissions.

## No new set releases

The set list is fixed. No new sets release during a run. Every drop,
restock, and store shelf uses sets that already exist (see
[13-sets.md](13-sets.md)).

Because of this, the game has no prereleases and no preorders. The
local game shop's weekly event is league night, and it offers holds on
hot product, not preorders.
