# Debt and Loans

**Status: built.** The credit score, personal and business loans, the
line of credit with overdraft protection, payday loans, the pawn shop,
collections, and wage garnishment (`Model/Debt.swift`, `Hub/LoansView.swift`,
with small hooks in `Model/GameStore.swift`, `Hub/WalletView.swift`,
`Hub/HubView.swift`, and `Model/Events.swift`). The numbers are in
[19-prototype-values.md](19-prototype-values.md#debt-and-loans).

The player can borrow money to buy stock, to get through a slow month,
or to pay rent. Each kind of debt has a different cost and a different
risk. Debt never ends the run. Only home rent ends the run (see
[16-time-and-day.md](16-time-and-day.md)).

The Wallet has a "Debt and credit" box. It shows the credit score, the
total debt, and the net worth. Its button opens the Loans screen.

## The credit score

The score goes from 300 to 850. A new player has 650, a thin credit
file. The score sets which loans the player can get, the rate, and the
limit.

| Event | Change |
| --- | --- |
| An on-time loan or line payment | +4 |
| A loan paid off | +10 |
| An application for a loan or a line | −5 |
| The first missed payment in a row | −45 |
| A later missed payment in a row | −25 |
| A debt that goes to collections | −100 |

A line of credit near its limit also lowers the score that lenders see.
More than 30% of the limit in use is −15. More than 70% is −35. The
penalty goes away when the player pays the line down.

A payday loan and the pawn shop do not report to the credit bureau.
They do not change the score, except when a payday loan goes to
collections.

## Interest

Interest accrues every day on the balance, at APR ÷ 364. A payment pays
the interest and fees first, then the principal. The ledger shows each
part as its own entry:

- "Loans" holds the principal: the cash that comes in from a loan, and
  the principal that the player pays back. It is not income and not a
  cost.
- "Interest and fees" holds the interest and the fees of personal debt.
- "Business interest" holds the interest and the fees of a business
  loan.

### Income tax

Loan cash is not income, and a principal payment is not a cost. Income
tax does not count them. Business interest is a cost of the business,
so it lowers the net profit for income tax (see
[26-taxes.md](26-taxes.md#estimated-income-tax)). Personal interest does
not.

The origination fee of a business loan counts in full on the day that
the player signs. A real return spreads it over the term of the loan.
The game keeps it simple.

## Personal loan

A bank loan with a fixed payment every 4 weeks.

- The player needs a job. The bank wants proof of income.
- The score must be 580 or more. A better score gets a lower rate and a
  larger limit.
- The payments of all loans must stay under 20% of 4 weeks of pay. This
  is the debt-to-income check. It also sets the largest amount.
- The term is 6, 12, or 24 payments.
- An origination fee of 3% comes out of the loan cash.

## Business loan

A bank loan for the card business. The rate is lower than a personal
loan, and the interest lowers the income tax.

- The player needs the seller's permit (see
  [26-taxes.md](26-taxes.md#the-sellers-permit)).
- The player needs 91 days of history and $1,000 or more of card sales
  in the last 91 days.
- The score must be 620 or more.
- The largest amount is half of one year of sales, at the pace of the
  last 91 days, less the business loans the player has now. The cap is
  $25,000.
- The term is 12, 24, or 36 payments. The origination fee is 2%.

## The line of credit

A line that the player draws from and pays back at any time, up to its
limit.

- The score must be 580 or more. The score sets the limit and the APR.
- A draw adds to the balance and puts the cash in the Wallet.
- Every 4 weeks, autopay takes the minimum payment: the interest plus
  3% of the balance, and not less than $25.
- With no balance, the player can close the line.

### Overdraft protection

When the cash is short for home rent, the line pays the gap. The draw
is a ledger entry, "Overdraft draw · Rent". When the gap is more than
the credit that is available, the line pays nothing, and the run ends
as before. The player can turn the protection off on the Loans screen.

## Payday loan

A small loan with no credit check, for a player with a job.

- The amount is $100 to $500, and not more than half of one week of
  pay.
- The fee is $15 for each $100. The loan and the fee are due in 14
  days. That is an APR of about 390%. The screen says so.
- One payday loan at a time.
- When the cash is short on the due day, the lender takes the fee and
  rolls the loan over for 14 more days, with a new fee. The limit is 4
  rollovers.
- When the player cannot pay the fee, or after 4 rollovers, the payment
  bounces. A $30 fee is added, and the debt goes to collections.

## The pawn shop

The pawn shop lends against an item in storage. It does not check the
credit score.

- The item must be worth $20 or more. Listed, graded, or consigned items
  and items in the store do not count.
- The loan is 40% of market. The item leaves Inventory, and the pawn
  shop holds it.
- The pawnbroker checks the item. A fake or a resealed product gets no
  loan, and the player now knows it is fake.
- The ticket runs for 28 days. The player can pay the loan and a 20% fee
  to get the item back, or pay the fee alone for 28 more days.
- After the last day, the pawn shop keeps the item. The loan is closed,
  and the player owes nothing more.

The kept item pays the loan. That is a sale for the amount of the loan.
The ledger records a sale, "Pawn forfeit", and a loan entry that closes
the loan. The two entries add to zero cash, and income tax counts the
sale.

## A missed payment

Autopay takes each loan and line payment on its due day when the cash
is enough. The game pays debt after home rent, store rent, and taxes.

When the cash is not enough, the game takes nothing. It adds a late fee
of $30, or 5% of the payment when that is more. The score drops. The
missed amount is past due, and it comes due with the next payment. The
player can pay it at any time from the Loans screen. A payment that
clears the past-due amount resets the count of misses.

## Collections

Three missed payments in a row send a loan or a line to collections.

- The lender closes the account. The collector adds a fee of 20% of the
  balance. The unpaid interest and fees stay in the debt.
- The score drops by 100.
- The collector takes 25% of each paycheck until the debt is paid. This
  is wage garnishment. The report and the ledger show each amount.
- The player cannot get a new loan or line while a debt is in
  collections. A payday loan and the pawn shop stay open.
- The player can pay the collector at any time. A payment pays the fees
  first.

The hub shows a banner for each payment that is due in 3 days or less,
and for a debt in collections. The calendar shows each due day.

## Open topics

- Bankruptcy, as a way out of collections.
- A credit card for purchases in the storefronts.
- A limit raise on the line of credit after on-time payments.
- An inventory loan from a distributor, against sealed stock.
