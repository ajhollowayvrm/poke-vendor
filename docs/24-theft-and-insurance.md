# Theft, Loss, and Collection Insurance

**Status: built.** Theft at a card show, a stolen bag from the car,
water damage at home, and collection insurance
(`Model/Losses.swift`, with small hooks in `Model/Shows.swift`,
`Model/GameStore.swift`, `Hub/WalletView.swift`, and `Hub/UpgradesView.swift`).
The numbers are in
[19-prototype-values.md](19-prototype-values.md#theft-damage-and-insurance).

The player can lose stock. The events are rare. Each event writes a line
in the Activity log. An upgrade lowers each risk, and a policy pays back
part of the loss.

## Theft at a card show

- The game rolls once, when a show day ends. It applies to a booked
  table only.
- One card or one slab can walk off the table. Sealed product cannot.
- The chance is higher when the table holds a lot of value, and when a
  slab is on it. A thief takes a high-value item more often, and a slab
  counts double.
- The chance is lower when the player stays at the table. Time on the
  floor (looking at tables, the grading booth) raises it.
- The locked display case upgrade cuts the chance.
- The summary screen shows the theft, and the Activity log records it.

## Stolen bag from the car

The game rolls once when the player starts a show day or a store run
with stock in hand. A thief can take a bag of one to four items. The
locked display case cuts the chance. The stock of the player's own store
does not count.

## Damage at home

The game rolls once at End Day. Water or humidity can hit one to three
raw cards in storage. A hit card loses edge and surface grade, so its
wear gets worse and it sells for less. Slabs and sealed product are safe.

- The dehumidifier cuts the chance.
- The fire safe removes the risk.
- The End Day report and the Activity log show the event.

## Collection insurance

The player signs up on the Wallet screen.

- The premium is due at sign-up and every 4 weeks. It is a share of the
  insured value, with a minimum.
- The insured value is the market value of everything in hand: storage
  and listed items. A fake is not insured.
- A claim pays a share of the loss, less a deductible. The share is of
  the market value of the stolen items, or of the value lost to damage.
- The Wallet shows the insured value, the premium, the next due day, and
  the totals paid and received.
- The ledger has an Insurance category for premiums and payouts.
- The premium comes out at End Day, after rent. If the player cannot
  pay it, the policy ends. The player can sign up again.
- The player can cancel at any time. A cancelled policy pays nothing.

## Saved games

`GameData.insurance` has a default. An old save loads with no policy.
