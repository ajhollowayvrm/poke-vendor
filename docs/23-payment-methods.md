# Payment Methods and Fees

**Status: built** (`Model/Payments.swift`, `Hub/PaymentViews.swift`). The values are in [19-prototype-values.md](19-prototype-values.md#payment-methods).

Before this system, every face-to-face sale was cash. Now each sale at a
card show, a meet, league night, a garage or estate sale, the player's
own store counter, and a Facebook Marketplace meetup has a payment
method.

## The methods

| Method | Fee | Risk |
| --- | --- | --- |
| Cash | none | none |
| Card | 2.6% plus $0.15 | none. Needs the card reader |
| Venmo or PayPal, Goods and Services | 2.9% plus $0.30 | A small chance of a fake screenshot, and of a chargeback later |
| Venmo or PayPal, Friends and Family | none | A larger chance of both |

## How a sale works

1. A buyer agrees on a price. The buyer has a preferred method: 55% cash, 30% card, 15% app. Of the app buyers, 45% ask for Friends and Family.
2. If the player's policy accepts the method, and the player has the card reader for a card, the buyer pays that way.
3. If not, the buyer changes the method. A refused Friends and Family buyer pays with Goods and Services 70% of the time, when the policy accepts it. Other buyers pay cash 50% of the time, or 80% for a contact.
4. If the buyer cannot pay, the buyer walks away. The item stays on the table, and the summary counts a buyer who walked.
5. The sale goes through. The fee is a separate ledger entry in the Wallet, category "Payment fees". The sale receipt shows the net after the fee.

The haggle, the visitor types, and the counterfeit check come before
step 1. Trades and the player's own purchases stay as they were.

## The card reader

The card reader is an upgrade (see [09-upgrades.md](09-upgrades.md)). It costs $80.

- At a show, a meet, or a meetup, a card sale takes the card fee.
- At the player's own store, the monthly overhead already has card fees (3% of the store's sales, see [22-own-store.md](22-own-store.md#store-rent-and-eviction)). A card sale at the counter has no second fee. The reader is still needed to take the card.
- The clerk sells 12% more with the reader, because the clerk takes card payments. The clerk never takes an app payment, so the clerk has no scam risk.

## The payment policy

The player sets the policy in two places: on the table setup screen (shows, meets, and the store counter), and in Settings. One policy applies to every face-to-face sale, a Facebook Marketplace meetup included.

| Policy | Accepts |
| --- | --- |
| Cash only | cash |
| Cash and card | cash and card |
| No Friends and Family (default) | cash, card, and Goods and Services |
| Accept everything | every method |

## Scams and reversals

Two things can go wrong with an app payment. A known contact has 25% of the risk of a stranger.

- **A fake screenshot.** The buyer shows a payment screen. The money never arrives, and the buyer leaves with the item. The item leaves the player's stock, and the cost of the item is a loss. There is no sale, no receipt, and no bad sale for a fake item.
- **A reversal (a chargeback).** The sale goes through. Between 3 and 12 days later, the app takes the money back. A Wallet entry in the category "Refund" shows it, and the morning report says it. The fee stays paid. The player does not get the item back.

Goods and Services has less risk than Friends and Family, because the app protects the seller.

### Fit with the counterfeit system

The bad-sale system in [14-counterfeit-risk.md](14-counterfeit-risk.md) stays as it was. One value changes. When a buyer pays by card or with Goods and Services, and the buyer later finds a fake, the processor refunds the buyer from the player's account (`refunds` is true, the same as on Whatnot). With cash and Friends and Family, there is no refund. When a reversal is already coming for the sale, the bad sale does not refund, so the buyer does not get the money twice.

## Reversals in the save

`GameData.payments` holds the policy and the list of reversals. An old save has no such field, so it decodes with the default policy and no reversals.

## Open topics

- A policy for each place (a show against the store).
- A way to check a payment before the buyer leaves, for example a check of the balance in the app.
- Chargebacks on card sales.
