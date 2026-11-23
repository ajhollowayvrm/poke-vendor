# Proposal: the store as a business sim

**Status: approved by AJ on 2026-11-23** ("I like all this"). Built in phases (see Build order).

## The rule for the whole proposal

- **Nothing changes before the store.** Every new system is part of the player's own store. It starts when the player
  signs a lease, and it goes away when the store closes. The game before the lease stays as it is: the secondary
  wholesaler, case splits, shows, and all the other channels.
- **An existing store keeps its numbers.** A store from an older save starts each new factor at its baseline, so its
  traffic and sales do not drop on the update.
- Rejected features stay out: preorders, new set releases, Japanese product, and group breaks.

## 1. Store numbers (the foundation)

Three numbers, on the store screen and the business dashboard:

| Number | Range | Baseline | What moves it |
|---|---|---|---|
| Awareness | 0 to 100 | 40 | Marketing, events, the grand opening, followers. It falls slowly toward 30 without them. |
| Rating | 1.0 to 5.0 stars | 4.0 | Reviews from customers: prices, stock, staff, events. |
| Loyalty | 0 to 100 | 30 | Events, the loyalty program, a good rating. Empty shelves lower it. |

- The traffic of the store × (0.6 + awareness ÷ 100) × (1 + 0.12 × (rating − 4)) × (1 + (loyalty − 30) ÷ 200). At the
  baseline each factor is 1.
- **Customer types**: kids with parents, players, collectors, investors, and casual buyers. Each location has a mix. Kids
  and casual buyers are the small-budget customers. Players want singles. Collectors look at items of $20 or more.
  Investors buy only sealed product, and they are price-sensitive.
- **Reviews**: about 1 review for each 25 customers. The stars come from the shelf prices, the stock on the shelves,
  the staff, and the events of the week.

## 2. Marketing

Channels with a weekly cost. A channel raises awareness each day it runs, more for its target customer types. More
channels at once give less for each dollar. The effect fades after the channel stops.

| Channel | Cost | Targets |
|---|---|---|
| Flyers | $40 a week | Kids, casual |
| Local paper ad | $120 a week | Collectors, casual |
| Social ads | $50, $100, or $200 a week | Players, collectors. Followers make it stronger. |
| Maps listing | Free, one time | A small lasting boost. The rating counts more. |
| School club sponsorship | $150 a month | Kids. It raises loyalty. |
| Window display | $200 each refresh | Everyone. It fades over 4 weeks. |
| Cross-promo with the pizza place | $60 a week | Players |
| Loyalty program | 3% of store sales | Loyalty |

A weekly marketing report shows the customers that each channel brought.

## 3. The distribution ladder

The hobby account gets tiers. The secondary wholesaler and the application stay as they are.

| Tier | Price | Extra allocation | Terms | Needs |
|---|---|---|---|---|
| Store account | 58% of MSRP | — | Pay now | The application (as now) |
| Preferred | 56% | +1 case of each product | Net 30 | Score 60 |
| Premier | 54% | +2 cases, a better hot fill | Net 30 | Score 80, store level Destination |

- **The score** (0 to 100), reviewed every quarter (84 days): sales of the last quarter, events run, the shelf share of
  hot product, and on-time payments.
- **Net 30**: an order on terms is paid 30 days later. A late payment lowers the score and puts the account on credit
  hold until the bill is paid.
- **Approved event store**: after 8 tournaments and 4 league days with 8 players or more. The distributor sends event
  kits (free prize packs each month) and the score gets +10.

## 4. Opening is a project

During the 7-day build-out, a task list:

| Task | Cost | Days | Needed to open |
|---|---|---|---|
| Business license | $150 | 2 | Yes |
| Fire inspection | $0 | 1, after the build-out is 4 days in | Yes. It can fail once: fix it for $300 |
| POS setup | $0 (the POS fixture is extra) | 1 | No |
| Hire staff | — | — | No |
| First stock | — | — | No, but empty shelves hurt the grand opening |
| Pre-opening buzz | $250 | — | No. +15 awareness |

- A missing required task moves the opening day.
- **Soft opening**: the player can open 3 days early at 40% traffic. It finds problems before the grand opening and
  gives the first reviews.
- **An investor**: at the lease, an investor can pay a share of the opening cost for 15% of the store's monthly
  profit. The player can buy the investor out for 2 times the money.
- **The business plan**: the lease screen shows each location's customer mix, its nearest rival, and its traffic.

## 5. Staff

- Candidates each week, with traits from 1 to 5: card knowledge, sales, honesty, and reliability. Wages from $13 to $22
  an hour.
- Roles: clerk and manager. A manager runs events with no player, and restocks the shelves from the back room each day.
- **Morale** 0 to 100: low wages and long weeks lower it. Low morale gives sick days, quits, and staff theft (low
  honesty).
- The old clerk becomes one staff member with average traits.

## 6. The floor

- **Layout**: an impulse rack by the register (more pack sales), slabs at the front (more collectors), the play area in
  view (more players).
- **Dead stock**: items in the store for 60 days or more show as dead stock, with a markdown button.
- **Morning decisions**: a short choice on some days. A birthday party booking, a local news crew, a scalper line at the
  door, a trade dispute, and others.

## 7. The business dashboard

A Business screen from the store screen: the daily profit and loss, customers, conversion, average sale, margin, the
store numbers, the customer mix, recent reviews, and a 30-day cash forecast. Every 28 days, a month-end review gives a
grade from A to F and short notes.

## 8. Rivals and store levels

- **Rival moves**: a price war (2 weeks), an event clash (the rival's tournament on your night), or a new shop that
  opens nearby.
- **Store levels** from store XP (sales, rating, events): New store, Local favorite, Destination store. Each level
  unlocks more marketing channels and distributor tiers.
- A second location is not in this proposal. The code has one store.

## Build order

A: store numbers, customer types, reviews, the dashboard, and the month-end review. B: marketing. C: the distribution
ladder. D: the opening project. E: staff. F: the floor, rivals, and store levels. Each phase is one commit after
`-test` passes.
