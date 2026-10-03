# Taxes

**Status: built.** Sales tax at the player's store and card show table, the seller's permit, estimated income tax every 13 weeks, the 1099-K note, the tax box in the Wallet, and the due days on the calendar (`Model/Taxes.swift`, `Hub/TaxBox.swift`).

The game has two taxes that the player pays. Sales tax is the buyers'
money, and the player holds it for the tax office. Income tax is the
player's own cost, on the profit from card sales. A missed payment adds
a penalty. It never ends the run.

The day job paycheck is the take-home amount, after tax (see
[16-time-and-day.md](16-time-and-day.md#pay)). It is not part of these
taxes.

## Sales tax

The player's own store and the player's card show table collect sales
tax on each sale. The tax is 7% of the price, and the buyer pays it on
top of the price.

- The sales are: a sale at the table of a card show, a deal at the
  counter of the store, a sale from the store shelves, and a sale from
  the bulk box.
- A trade, a buylist purchase, a meet, a garage sale, a consignment
  sale, a Facebook Marketplace sale, and a private buyer add no sales
  tax.
- The tax comes into the cash as a ledger entry, "Sales tax collected".
  All the tax of one day at one place is one entry.
- The tax is not the player's money. The game counts it as **set aside**
  in the Wallet. The game does not stop the player from spending it.

The player pays the sales tax every 4 weeks, on a day that is not a
rent day: day 15, day 43, day 71, and so on. The game takes the whole
amount from the cash and adds a ledger entry, "Sales tax paid". The
player can also pay at any time from the Wallet.

Online platforms (TCGplayer, eBay, and Whatnot) collect and pay the
sales tax themselves. The player has no sales tax on those sales.

### A missed payment

When the cash is not enough on the due day, the game takes nothing. It
adds a penalty of 10% of the amount. The player still owes the whole
amount, and pays it from the Wallet, or on the next due day. A second
miss adds a second penalty.

## The seller's permit

A landlord wants a seller's permit before a store lease. It is a
requirement on the store screen (see
[22-own-store.md](22-own-store.md#before-the-lease)).

- The permit costs $50, one time. The player gets it from the tax box in
  the Wallet.
- A player who already has a store has the permit.
- The permit is not a requirement for the card show table or for
  wholesale.

## Estimated income tax

Every 13 weeks (91 days), the player pays estimated income tax on the
net profit from card sales of the quarter that just ended. The due days
are day 92, day 183, day 274, and so on.

The net profit of a quarter is the sum of these ledger entries:

- Income: sales, live-stream tips, and sponsorships. A refund is
  negative income.
- Cost: sealed product, singles, grading and authentication fees, show
  fees, wholesale, store rent, store overhead, wages, store events, and
  the interest and fees of a business loan.

The paycheck, the home rent, the upgrades, the store build-out and
deposit, and the tax payments are not in the sum. Loan cash, principal
payments, and personal interest are not in the sum (see
[27-debt-and-loans.md](27-debt-and-loans.md#income-tax)). A pawn shop that
keeps an item counts as a sale for the amount of the loan.

The game counts a purchase when the player pays for it, not when the
item sells. A quarter with more buying than selling is a loss. The loss
goes to the next quarter and lowers its profit. A quarter with no
profit has no tax.

The tax is 20% of the net profit. The game takes it from the cash and
adds a ledger entry, "Estimated income tax". A missed payment follows
the same rule as for sales tax: a penalty of 10%, and the player owes
the amount until they pay it. The Wallet shows the amount and a button.

## Warnings

3 days before a due day, the same as the rent warning:

- The morning report has a line for each payment that is close.
- The home hub has a banner. It is cyan when the cash is enough, and
  orange when it is not. The banner opens the Wallet.

The sales tax warning shows only when the player holds sales tax. The
income tax warning shows only when the estimate is more than zero.

## The 1099-K note

TCGplayer, eBay, and Whatnot report the gross sales of a seller to the
tax office when the sales pass a limit. In the game, the limit is $2,000
in a year of 52 weeks. When the online sales of the year pass it, the
Activity log has one note for that year. The note says that the income
tax counts these sales. The sales are already in the net profit, so the
note changes no number.

## The Wallet and the calendar

The tax box in the Wallet shows:

- The tax set aside, the income tax so far this quarter, and the cash
  that the player can spend after the tax.
- The due day of each payment, and the amount.
- A button to pay now, and a button to pay a back tax.
- The seller's permit, with its button.
- The online sales of the year, against the limit.

Every payment is an entry in the ledger, in the category "Taxes". The
calendar shows "Sales tax due" and "Estimated income tax due" on their
days. The calendar uses the rent icon for them.

## Old saves

`GameData.taxes` is new. A save from an older build has none, so it
starts with no tax owed and no loss carried. The sales tax starts with
the next sale.

## Open topics

- Balancing. The values are in
  [19-prototype-values.md](19-prototype-values.md#taxes).
- The game counts inventory as a cost when the player buys it. A player
  who keeps cards (not for sale) lowers the tax. A stricter rule can
  count the cost of an item only when it sells.
- A sales tax on a trade or a consignment sale.
