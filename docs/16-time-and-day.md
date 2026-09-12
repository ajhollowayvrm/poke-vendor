# Time and the Day

How the game measures time: the clock, the day's hours, game days, the
day job, rent, and late nights. This doc gives numbers to the day
structure in [01-premise-and-loop.md](01-premise-and-loop.md#day-structure).

For when events happen during the week, see
[17-calendar-and-events.md](17-calendar-and-events.md).

## The clock

Time is in hours, on a clock.

- A day has **16 waking hours**, from **7 AM to 11 PM**. The other 8
  hours are sleep.
- Every time-cost action takes a block of clock time. Two actions
  cannot use the same hours.
- Free actions take no time. The player can do them at any hour,
  including after 11 PM.

The clock makes the time of day matter. Events can happen at set
times, for example a morning garage sale or an evening league night.
The timing multiplier on social media reach also connects to the clock
(see [06-social-media.md](06-social-media.md#virality-and-reach)).

## Ending a day

The player ends the day with an **End Day** button. The day does not
end by itself when the hours run out. With no hours left, the player
can still do free actions until they tap End Day.

## Game days

The game counts time in game days, not real calendar days. Each tap on
End Day moves the game forward by 1 day.

Every wait that is measured in days moves forward by 1 day on End Day:

- Grading turnaround (see [10-grading.md](10-grading.md#turnaround)).
- Shipping delivery time (see [15-selling.md](15-selling.md#shipping)).
- Holds at the local game shop.
- A Facebook Marketplace pickup or meetup set for a later day.

## Travel

Each action's time includes its travel. There is no separate travel
step. For example, each store on a store run adds its drive and its
visit as one block (see
[12-acquiring-product.md](12-acquiring-product.md#local-stores-store-run-time-cost)).

A future upgrade can reduce travel time, for example a better car (see
[09-upgrades.md](09-upgrades.md)).

## Starting hour values

These values are a starting point for balancing, not final numbers.

| Action | Hours |
| --- | --- |
| Free actions (online buys, listings, quick posts, grading submissions) | 0 |
| Local garage sale | 3 |
| Far garage sale | 8 |
| Camping a store drop | 6 |
| Local meet | 3 |
| Live stream (including Whatnot) | 2–3 |
| Store run | About 40 min per store |
| Facebook Marketplace pickup or meetup | 1 |
| Day job | 8 |
| Card show | All 16, for each day of the show |

## The day job

The player starts with a day job. The job pays cash, and it takes 8
hours of the day. It is what funds the first inventory, before the
trading business can pay for itself.

### Schedule

- The job is a fixed weekday shift: **Monday to Friday, 9 AM to 5 PM**.
- The game therefore has a weekly calendar, with weekdays and
  weekends.
- On a work day, the player has the morning before 9 AM and the
  evening after 5 PM for other actions.

### Pay

The job pays a **weekly paycheck**, every Friday. Each paycheck is a
cash-in entry in the Wallet ledger (see
[08-ui-direction.md](08-ui-direction.md)).

The paycheck is the take-home amount. The game has no tax system.

### The job ladder

The player starts at the first job. Over time, the player can change
to a better job. A better job pays more, gives more sick days, and
accrues time off faster.

| Job | Hourly pay | Weekly paycheck | Sick days | Time off accrues |
| --- | --- | --- | --- | --- |
| Retail associate (start) | $16 | $640 | 5 | 1 day every 5 weeks |
| Warehouse lead | $21 | $840 | 6 | 1 day every 4 weeks |
| Office coordinator | $27 | $1,080 | 8 | 1 day every 3 weeks |
| Project manager | $38 | $1,520 | 10 | 1 day every 2 weeks |

The pay values are set. The other values in this section are a
starting point for balancing.

### Finding a better job

- A **job board** lists open jobs. Applying is a free action.
- A job on the ladder opens to the player after **8 weeks** at the job
  below it. Time at a higher job also counts.
- A player without a job can apply to any job that their past work
  history has opened.

### Getting a job

Getting a job is always a dice roll.

- The player applies to a job, and the game rolls for the result.
- The player can apply to the same job **only once per day**.
- A player can apply to several different jobs on the same day.

| Job | Chance of getting hired |
| --- | --- |
| Retail associate | 90% |
| Warehouse lead | 60% |
| Office coordinator | 45% |
| Project manager | 30% |

### Sick days and time off

The player can skip a work day, for example to camp a store drop.
There are two ways to skip a day with pay:

- **A sick day** works on the same day. The player decides that
  morning.
- **Time off** must be booked in advance. The player cannot use it on
  the same day.

Rules:

- Sick days reset every **52 weeks**.
- Time off accrues slowly (see the job ladder above), and unused time
  off carries over.
- When the player quits or gets fired, unused sick days and time off
  are lost.

### Skipping without a sick day or time off

A skipped day with no sick day and no time off is an **unexcused
skip**.

- The day is unpaid: that day's pay comes out of the weekly paycheck.
- The day has a chance to get the player fired. The chance grows with
  each unexcused skip:

| Unexcused skip | Chance of getting fired |
| --- | --- |
| First | 25% |
| Second | 50% |
| Third | 100% |

The count goes back to zero after 4 weeks with no unexcused skip.

### Quitting

- The player can quit at any time. Quitting trades a safe paycheck for
  full-time trading, and it is a big moment in a run.
- If the business fails, the player can try to get a job again. The
  dice roll means that this can take several days.

## Rent

The player must pay rent. Rent is a fixed cost that does not stop when
the player quits the job or when sales are slow. Rent is a cash-out
entry in the Wallet ledger.

- **Amount**: $1,200.
- **Due**: every 4 weeks. The game has weeks but no months, so a
  4-week cycle keeps the calendar simple.
- **Warning**: the game warns the player 3 days before rent is due.

With the starting job, 4 weeks of pay is $2,560. After rent, $1,360
is left for trading and other costs.

**If the player cannot pay rent, the game is over.** The run ends.

Rent is what gives quitting and unemployment a real risk: with no
paycheck, the business must cover the rent. The local game shop's
buylist is the last-resort way to raise cash before rent is due (see
[15-selling.md](15-selling.md#the-local-game-shop)).

## Late nights

The player can stay up past 11 PM. The hours after 11 PM come out of
sleep.

The next morning, the player chooses one of two options:

- **Start on time, but tired.** The day starts at 7 AM. For that day,
  the player's haggling and eyeball estimates are worse (see
  [10-grading.md](10-grading.md#eyeball-vs-paid-reveal-vs-permanent-upgrade-for-every-subgrade)
  and [14-counterfeit-risk.md](14-counterfeit-risk.md#detection-the-same-reveal-pattern-as-grading)).
- **Sleep in, and be fine.** The day starts later, by the hours of
  sleep that the player lost. There is no penalty other than the lost
  time.

### How tired

A later night makes the tired penalty worse:

| Hours past 11 PM | State | Haggling and eyeball estimates |
| --- | --- | --- |
| 1 to 2 | Tired | 15% worse |
| 3 or more | Exhausted | 30% worse |

These values are a starting point for balancing.
