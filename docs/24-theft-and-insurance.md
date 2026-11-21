# Theft, Loss, and Collection Insurance

**Status: built.** Theft at a card show, a stolen bag from the car,
water damage at home, a night break-in at the player's own store, and
collection insurance with a store stock rider
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
does not count. A sealed case does not fit in the thief's bag, so the
thief never takes a case. Units from an opened case can go in the bag.

## Break-in at the own store

The game rolls once each night for a store that is open. The store must
hold sealed product. The chance is 0.05%, and it grows with the value
of the sealed product inside: it doubles at $25,000. The most is 0.6%
a night. Security cameras multiply the chance by 0.4.

- The thieves take the 2 to 6 most valuable sealed items. A case in the
  back room is an item, so it counts.
- The player pays $400 for the door repair.
- A consigner who is owed for a stolen card is paid by the player.
- The report says what the thieves took, and what the rider paid.
- Shoplifting at the store is separate. It takes loose packs, a cheap
  sealed item, or a cheap card, on a clerk-only day. A claim for
  shoplifting covers sealed product only.

## Plug stock

Police can seize stock that the player bought from the plug (see
[12-acquiring-product.md](12-acquiring-product.md#the-plug)). A seizure
is not theft. The player has no claim, and no refund.

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

### The store stock rider

A policy holder with a built store can add the store stock rider. It
covers the sealed product in the store, the back room included. A known
fake counts as nothing.

- The rider costs 3% of the sealed value in the store each cycle, on top
  of the premium, with the same minimum. The cost uses the highest value
  of the cycle, so taking the stock out on the premium day does not cut
  the cost.
- Turning the rider on charges the rest of the current cycle at once.
  Turning it off refunds nothing.
- A claim for a store break-in or for shoplifting pays only with the
  rider. The usual share and deductible apply. Shoplifting claims cover
  sealed product only: never a card, a consigned card, or a known fake.

## Saved games

`GameData.insurance` has a default. An old save loads with no policy.
