# Vending machines

**Status: built** (`Model/Vending.swift`, `Hub/VendingViews.swift`).

A vending machine sells sealed product at a host while the player does
other work. Most of its sales come at night, when stores are closed. It
fits between the hustle stage and the own store: it is passive income,
but it needs visits to collect the cash box, restock, and clear a jam.

Research (2026): card vending machines are a large trend. One operator
reports about $1,900 to $2,200 a month for each machine, with a margin
near 45%. 65% of its sales came between 6 PM and 6 AM. A machine costs
about $2,850. These figures come from machine sellers, so they are
marketing-grade.

## Buying and placing

- The Hub's "The bigger picture" box has a Vending machines row. It
  opens the Vending screen.
- A machine costs $2,850. The player can own up to 5 machines.
- A new machine is at home. The player places it with a host. The trip
  costs the host's visit hours.
- The player can bring a machine home. That trip costs the visit hours.
  The stock goes back to Inventory, and the trip collects the cash box.

## Hosts

| Host | Sales a day | Host share | Break-in a day | Visit | Sales after dark | Gate |
|---|---|---|---|---|---|---|
| Gas station | 2.6 | 15% | 0.6% | 1 hour | 65% | None |
| Laundromat | 1.6 | 10% | 0.8% | 1 hour | 50% | None |
| Mall | 4.0 | 20% | 0.15% | 1.5 hours | 20% | Known (tier 1). One machine |
| Your store | 2.0 | 0% | 0.1% | 15 minutes | 60% | Your own store. One machine |

- The sales a day is the mean, for a machine with stock at fair
  prices. The seasonal demand for sealed product moves it (see
  [05-pricing-and-market.md](05-pricing-and-market.md#seasons)).
- When the player's store closes, its machine comes home the same day, as
  the shelf stock does. The stock arrives in Inventory the next day, and
  the cash box goes to the bank.

## Stock and prices

- A machine holds up to 40 sealed items. The player stocks it only
  during a visit, from the sealed items in hand that are not kept and not
  known fakes. Stock in a machine is not in Inventory, but it counts in
  the market value.
- The default price is the market × 1.25, at a retail price. During a
  visit the player can set every price to the market × 1, 1.15, 1.25, or
  1.4, and take items out. The machine keeps that markup, and new stock
  gets it too.
- Each sale picks an item by weight. A cheap item and a fair price sell
  more. A buyer at a dear item often walks away.

## Money

- The host takes its share of each sale.
- Without a card reader, every sale goes into the cash box. A visit
  collects the cash box.
- With a card reader, 60% of the sales are by card. Card sales go to the
  bank at once, less a 3% fee.
- The cash in machines counts in net worth.
- A machine sale is an in-person sale. It collects sales tax, it makes a
  sale receipt, and it uses up some buyers of that product. A sealed
  item that is a fake the player does not know about can still be found
  out, as at the player's store.

## Problems

- **Jam**: 1.5% a day. A jammed machine sells nothing until a visit.
- **Break-in**: the host's chance each day. A break-in takes the cash
  box and 30% to 60% of the stock. The repair costs $150 to $400.
  Collection insurance does not cover a machine.
- **Neglect**: when a machine at an outside host is empty or jammed for 7
  days in a row, the host ends the contract. The machine comes home, and
  its stock arrives the next day.

## Parts for each machine

| Part | Cost | Effect |
|---|---|---|
| Card reader | $300 | 30% more sales. Card sales go to the bank, less 3% |
| Camera | $250 | A break-in is 60% less likely |
| Remote stock data | $150 | The End Day report shows each sale, a jam, and an empty machine. The Vending screen shows the cash box and the sales between visits |

Without remote stock data, the player sees the sales, the cash box, and
a jam only during a visit.

## Not in this version

- **Goals**: the plan had a "Passive income" goal ladder. The goals have
  one ladder for each of the four currencies, and the top of any ladder
  is one way to "make it" (see [03-currencies.md](03-currencies.md)). A
  fifth ladder would add a fifth way. Vending income counts toward the
  Cash goals.
- Singles and slabs in a machine. Real machines sell mostly sealed
  product.
