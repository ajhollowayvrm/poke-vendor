# Supplies and Accessories

**Status: built.** The Supplies storefront, the supply stock, use of
supplies by shipped sales, grading submissions, and show tables, the
rush price, and the accessory shelf of the player's own store
(`Model/Supplies.swift`, `Buy/SuppliesViews.swift`). The numbers are
starting values. They are in
[19-prototype-values.md](19-prototype-values.md#supplies-and-accessories).

## The supplies

The player packs and protects cards with six supplies. Each comes in a
pack. The prices are close to real shop prices.

| Supply | Pack | Price | One piece |
| --- | --- | --- | --- |
| Penny sleeves | 100 | $3.50 | $0.035 |
| Top loaders | 25 | $6.00 | $0.24 |
| Team bags | 100 | $5.00 | $0.05 |
| Card savers | 50 | $14.00 | $0.28 |
| Bubble mailers | 25 | $13.00 | $0.52 |
| Magnetic one-touch cases | 10 | $18.00 | $1.80 |

## Buying

The Buy screen has a Supplies storefront in the online list. The player
buys packs there. A purchase is a free action, and the packs arrive at
once. Each purchase is a Wallet entry in the category "Supplies".

The Supplies screen shows the stock in hand, the price of a pack, the
price of one piece, and what the actions cost in supplies. It also shows
the total spent, and the part of it that the player paid at a rush price.

## Use

| Action | Uses |
| --- | --- |
| A shipped sale of a single | 1 bubble mailer, 1 penny sleeve, and 1 top loader |
| A shipped sale of a single at $100 or more | 1 bubble mailer, 1 penny sleeve, and 1 magnetic case (no top loader) |
| A shipped sale of a slab or sealed product | 1 bubble mailer |
| A grading submission | 1 card saver for each card |
| A booked show table, at the set-up | 30 penny sleeves, 15 top loaders, and 6 team bags |

A sale in person (Facebook Marketplace) ships nothing, so it uses
nothing. A sale at the counter of the player's own store, and the table
at the store, use nothing.

## No supplies: the rush price

The player is never blocked. When a supply is not in hand, the player
buys the missing pieces on the spot at 3 times the piece price:

- The cost is a Wallet entry in the category "Supplies", with the reason
  in the label.
- The Activity log has a line that names the missing pieces.
- When the player has less cash than the cost, the player pays the cash
  that they have, and the action goes on.

A rush purchase never adds to the stock.

## The accessory shelf of the store

The player's own store sells accessories: deck sleeves, binders, deck
boxes, and playmats (see [22-own-store.md](22-own-store.md#accessories)).
Accessories are not cards, so they have their own shelf. The shelf holds
no limit of stock.

- A store account orders accessories by the case on the Supplies screen.
  The distributor charges 55% of the shelf price. The cases arrive at
  once, and the pieces go on the shelf.
- The order is a Wallet entry in the category "Wholesale".
- On each open day, the store sells accessories when the clerk covers the
  day, or when the player works the counter. The cover is the share of the
  open hours.
- Customers buy an accessory at 10%, plus 15% times the small-budget
  share of the location. A sale pays the shelf price. The sales of one day
  are one Wallet entry in the category "Sale".
- The sale counts in the revenue and the sales of the day on the store
  screen.
- When the shelf is empty, customers who ask for an accessory leave. The
  report has a line for it, after the player ordered accessories once.

## Open topics

- Delivery time. Supplies and accessories arrive at once. A delay of one
  or two days is possible.
- Used supplies do not change the price a buyer pays or the condition of a
  card. A sleeve or a top loader has no effect on grading.
- Team bags and magnetic cases have one use each. More uses are possible.
