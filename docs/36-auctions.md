# Auctions

**Status: built** (`Model/AuctionBuying.swift`, `Hub/AuctionsView.swift`). AJ asked for this on 2026-11-22.

The hub row **Auctions** opens one screen with three tabs.

## Selling

- **Your eBay auctions**, with live bids. Each row shows the current bid, the number of bids, the watchers, and the
  days left. A tap opens the item. The item's status box shows the same line.
- **At the auction houses**: each consigned slab, its house, its auction day, the estimate, and the reserve.
- **The gate of each house**: a lock until the player has the reputation that the house asks for (see
  [15-selling.md](15-selling.md#auction-houses)).
- **Payouts on the way** and **Your bids** (the lots the player bid on).

### Live bids

- The game rolls the final price of an eBay auction when the player lists it (`Listing.auctionFinal`). The odds are the
  same as before: a 5% or more chance of no sale, and a price of the market × (0.95 ± 0.35).
- Each day the current bid is the final × (0.2 + 0.5 × p²), where p is the share of the auction that has gone by. On
  the last day the bid jumps to the final, as with a real snipe.
- An auction with no sale shows no bids.
- An auction from an older build has no final price. End Day rolls it on the last day, as before.

## Buying on eBay

- About 10 lots are open at a time. Each lot runs 1 to 7 days. A lot is a raw single (40%), a slab (40%), or sealed
  product (20%).
- The opening bid is 30% to 60% of the market. The rivals have a hidden top bid: the market × (0.95 ± 0.35) × the season
  factor. 8% of lots have no rival, so the player wins at the opening bid.
- **Proxy bidding**: the player sets a top bid. The current bid is one step over the other bidder, up to the top bid.
  A top bid can only go up. The steps follow eBay: $0.25 under $5, up to $250 at $25,000 and more.
- **Snipes**: the rivals' bid climbs slowly, and the rest comes on the last day. A player who leads early can lose at
  the end.
- **The win**: the player wins when the top bid is a step or more above the rivals' top bid. The price is one step
  over the rivals. The player pays the price and shipping. The item arrives in 3 days.
- **Fakes**: an eBay lot can be a fake, at the eBay rate (see [14-counterfeit-risk.md](14-counterfeit-risk.md)).
- **No cash at the close**: the sale is off, and the player loses 5 reputation. A bid needs the cash for the total at
  the top bid when the player places it.

## Buying at the auction houses

- Each house shows a catalog of 5 to 8 slabs worth $1,000 or more. The catalog opens 14 days before the house's
  catalog day (Goldin the 7th, Heritage the 14th, Fanatics Collect the 21st day of each 28 days).
- Buying needs no reputation. Consigning still does.
- The opening bid is half the market. The rivals' top total is the market × the house's bidder strength × (1 ± 0.3)
  × the season factor. Their top hammer is that total ÷ (1 + the buyer's premium).
- The player pays the hammer, the buyer's premium, and $30 insured shipping. The slab arrives in 7 days.
- A house checks every slab, so a house lot is never a fake.
