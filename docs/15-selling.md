# Selling

How the player turns inventory into cash. This is the sell side of the
loop, opposite of [12-acquiring-product.md](12-acquiring-product.md).

## Scope

- **In scope**: the selling channels below, shipping, and bad sales.
- **Out of scope**: card shows. Shows get their own design later.
- **Out of scope**: opening a real storefront (see
  [01-premise-and-loop.md](01-premise-and-loop.md)).

## Channels at a glance

Each channel has a different tradeoff. No channel is the best for
every card.

| Channel | Best for | How the price is set | Speed | Cost | Day budget |
| --- | --- | --- | --- | --- | --- |
| TCGPlayer | Raw singles | A price ladder: the lowest listing sells first | Fast at the lowest price, almost never above it | Platform fees, shipping | Free action |
| eBay | Graded slabs, sealed, high-value singles | Auction, or a fixed Buy It Now price | Medium | The highest fees, shipping | Free action |
| Facebook Marketplace | Sealed, lots, local buyers | An asking price; buyers make low offers | Varies | No fees | The meetup costs time |
| Whatnot | Slabs, sealed, big hits | Live auction bids | Sells during the stream | Platform fees, shipping | Time-cost (live stream) |
| Social media | Anything your followers want | A fixed price that you set | Depends on followers | No fees, shipping | Free action |
| Local game shop | Fast cash, bulk, or a consigned single | The shop's offer, or a consignment price | Instant (buylist) or slow (consignment) | A low price, or the shop's cut | A stop on a store run |
| Local meets | Raw singles, trades | Face-to-face haggling | During the meet | No fees | Time-cost |

Specific fee values are not in this doc. Platform fees change, so the
game pulls current values when it needs them. Grading fees follow the
same rule (see [10-grading.md](10-grading.md#data-source)).

## TCGPlayer

The main channel for raw singles.

TCGPlayer is a fight for the lowest price. For each card, many sellers
list copies, and the buyer takes the lowest listing. A listing above
the lowest price almost never sells. The result is a real selling
price that is often well below the card's market value.

The game models this as a listing ladder for each card:

- Competing sellers fill the ladder with listings.
- The lowest listing has the highest chance of a sale.
- The chance of a sale falls steeply with each step above the lowest
  listing.

The player's choice is simple and hard: undercut the ladder and sell
fast for less, or list higher and wait, possibly forever.

## eBay

The strongest channel for graded slabs. It also sells sealed product
and high-value singles, and it reaches international buyers.

- **Auction**: the bids set the price. An auction can end high, or it
  can end well below value. This is real variance.
- **Buy It Now**: a fixed price that the player sets. It is slower,
  but the price is known.
- eBay takes the highest fees of all the online channels.

## Facebook Marketplace

Local buyers, cash in hand, and no fees.

- Buyers offer low prices.
- Some buyers do not come to the meetup.
- The meetup costs time, the same as a Facebook Marketplace pickup on
  the buy side (see
  [12-acquiring-product.md](12-acquiring-product.md#online--five-storefronts-five-tradeoffs)).
  Sometimes the buyer sets the meetup for a later day.
- There is no shipping.

## Whatnot

Live auctions during a live stream. A Whatnot sale is part of the live
stream time-cost action in
[06-social-media.md](06-social-media.md#live-streams-time-cost-action).

- Whatnot opens at **follower tier 1 (1,000 followers)** (see
  [04-reputation-and-followers-unlocks.md](04-reputation-and-followers-unlocks.md#follower-tiers)).
- The player puts cards up for auction on the stream, and viewers bid.
- More followers bring more viewers, more bidders, and higher prices.
- A small audience means low bids. An auction can end below value.
- Whatnot takes platform fees.

## Social media

The player posts a card for sale to their followers, at a fixed price.

- Posting is a free action, the same as a quick post (see
  [06-social-media.md](06-social-media.md#quick-posts-free-action)).
- The chance of a sale depends on followers and reach. With a small
  audience, nothing sells.
- There are no platform fees, but the player pays for shipping.

## The local game shop

The local game shop buys cards in three ways. A visit to the shop is a
stop on a store run (see
[12-acquiring-product.md](12-acquiring-product.md#local-stores-store-run-time-cost)).

- **Buylist**: the shop buys singles for instant cash, at a price well
  below market. This is the player's last-resort way to get cash. It
  prevents a stuck game, where the player has no cash and only unsold
  listings.
- **Bulk**: the shop buys bulk commons and uncommons for store credit
  only, never for cash. Opened packs always produce bulk, and this
  gives it a use.
- **Consignment**: the shop sells the player's card from its display
  case. The price is better than the buylist, but the player waits for
  a buyer, and the shop keeps a cut. Consignment opens at **Regular**
  standing with the shop.

Standing with the shop also changes the prices. A higher standing
gives a better buylist price and a smaller consignment cut. Standing
is per shop. The standing levels, their prices, and how standing
changes are in
[12-acquiring-product.md](12-acquiring-product.md#standing-levels).

### Store credit

Store credit is a balance with one shop. The player can spend it only
at that shop: on sealed product, holds, and singles from the display
case. Store credit is not cash, and it is not a fifth currency (see
[03-currencies.md](03-currencies.md)).

The Wallet screen does not show store credit. The player sees the
balance on that shop's own screen.

## Local meets

One-to-one sales and trades with other traders. This is the Flipper's
main channel (see [02-playstyles.md](02-playstyles.md#the-flipper-meets-and-shows)).

- The price comes from face-to-face haggling.
- A meet is a time-cost action (see
  [01-premise-and-loop.md](01-premise-and-loop.md)).
- The weekly meets and their times are in
  [17-calendar-and-events.md](17-calendar-and-events.md#recurring-entries).
- Reputation gates the better meets: invite-only trading circles open
  at reputation tier 1 (see
  [04-reputation-and-followers-unlocks.md](04-reputation-and-followers-unlocks.md#reputation-tiers)).
- The meet encounter itself, and trading, get their own design later.

## Shipping

Every sale on TCGPlayer, eBay, Whatnot, and social media ships to the
buyer. Shipping has three parts, and the game models all of them:

- **Cost**: the player pays for shipping on every sale.
- **Delivery time**: the buyer receives the item some game days after
  the sale (see [16-time-and-day.md](16-time-and-day.md#game-days)).
- **Chance of loss**: a package can get lost in transit.

The exact cost, delivery time, and loss chance are balancing values.
The risk has the same shape as the declared-value risk on a grading
submission (see [10-grading.md](10-grading.md#data-source)).

### Shipping insurance and lost packages

The player can buy **shipping insurance** for a sale.

- **Insured package lost**: the insurance pays the player back the
  card's value.
- **Uninsured package lost**: the card is gone, and the buyer gets
  their money back. Nothing else happens. A lost package is not a bad
  sale, and it does not cause a scam accusation.

## Bad sales and scam accusations

**A fake sold without knowing.** The result depends on the channel:

- **TCGPlayer and eBay**: the platform refunds the buyer. The player
  loses the sale.
- **Facebook Marketplace, Whatnot, social media, local meets, and the
  local game shop**: no platform refund protects the sale. The buyer
  deals with the player directly. At the local game shop, a fake also
  costs standing with that shop.

**Any bad sale can go public.** On every channel, a bad sale can
become a public scam accusation (see
[06-social-media.md](06-social-media.md#consequences) and
[14-counterfeit-risk.md](14-counterfeit-risk.md#consequences)). A
platform refund does not prevent this. A bad sale includes a fake, a
late shipment, and a card in worse condition than the listing said.

The chance that a bad sale goes public is a set number that rises with
the player's **notoriety**. A player whom few people know can make a
mistake quietly. A well-known player cannot.

## Open topics

- How notoriety is measured.
- The meet encounter and trading. A separate design.
- Card shows. A separate design.
