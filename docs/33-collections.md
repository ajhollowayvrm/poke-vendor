# Collections

**Status: built** (`Model/Collections.swift`, `Show/CollectionBuyViews.swift`). The numbers are first guesses.

Real dealers make their best margins on whole collections. People bring
a binder or a box to a table or a store and ask for cash, store credit,
or a trade. Some people only ask whether a card is worth grading. On
eBay, collection lots sell blind.

## At the table and the store counter

A collection seller is one kind of seller. At a show table or a meet,
22% of sellers bring a collection. At the player's store counter, 35%
do. Another 12% of sellers only ask a grading question (see
[Grading advice](#grading-advice)).

### What a collection holds

| Kind | Sets | Singles | Slabs | Sealed | Bulk | Condition |
| --- | --- | --- | --- | --- | --- | --- |
| Childhood binder | Vintage and older | 6 to 16 | 0 | 0 to 1 | 60 to 250 | Played |
| Modern binder | Modern | 8 to 20 | 0 to 2 | 0 to 2 | 100 to 400 | Mostly clean |
| Shoebox of mixed cards | All eras | 6 to 14 | 0 to 1 | 0 to 3 | 80 to 300 | Either |
| Estate collection | Vintage and older | 10 to 24 | 0 to 3 | 1 to 3 | 150 to 500 | Played |

- A collection centers on 2 to 4 sets.
- A single is worth $1.50 to $40. One single in 7 is a hit of $40 or more.
- Bulk is commons and uncommons under $1.
- Any good item can be a fake. The roll uses the venue's fake source,
  and the player's eye can catch it ("LOOKS OFF").
- Most sellers bring what the player can pay for: when the price is
  over 1.3 times the player's cash, the seller keeps their best cards
  until it fits. One seller in 7 brings it all anyway.

### Worth to a dealer

A dealer counts the good items at market, and the bulk at 25% of its
market. Shops pay for bulk in store credit only, at half of market,
and bulk takes time to sort. The seller's prices, the player's offers,
and the deal fairness all use this "worth".

### The deal

The seller states a price for all of it and what they would like:
cash, store credit (at the store only), or a trade.

| Seller | Price for all of it | Lowest price (hidden) |
| --- | --- | --- |
| Cleaning out a closet | 45% to 70% of worth | 30% to 45% |
| Collector | 60% to 80% | 45% to 60% |
| Dealer moving stock | 70% to 85% | 55% to 70% |

- **The panel** lists every good item, best first, with its condition
  and market, and the bulk count. A slider sets an offer from 20% to
  110% of worth, in 5% steps. It starts one step under the seller's
  price.
- **All of it.** With nothing picked, the offer is for everything, bulk
  included.
- **Cherry-pick.** The player taps items to pick them. The seller's
  prices for picks are 15% of market higher, and the bulk stays with
  them. 40% of sellers refuse to split the collection, and 60% refuse
  when the picks hold more than 70% of the value. A refusal holds for
  the visit.
- **An offer** at or over the lowest price buys. Under it, the seller
  counters part of the way, twice. The third low offer ends the visit.
  An offer under 40% of worth is a lowball, and a contact remembers it.
- **Store credit** (at the store): the toggle pays the credit amount,
  which is more than the cash. A seller who wants credit takes it at
  90% of their lowest price.
- **A trade.** The player picks items from the table. Each counts at
  110% of market, and a PC item at its PC price. A seller who wants a
  trade takes it at 90% of their lowest price. A seller who wants cash
  says "I'd rather have cash" half of the time. The seller checks the
  items for fakes, as any buyer does.
- **Buying.** The good items go to Inventory, and the bulk goes to bulk
  groups, one for each set. The price splits by worth: each item gets
  its share as its cost, and the bulk's share goes into the paid total
  of the portfolio header. One ledger entry records the buy. Going
  through a whole collection takes 15 to 25 minutes, and a cherry-pick
  8 to 14 minutes.
- The deal is scored for fairness, as any buy is (see
  [30-haggling-and-deal-reputation.md](30-haggling-and-deal-reputation.md)).

## Grading advice

Someone shows a card and asks: "Should I send it to PSA, or keep it
raw?" The card is a modern or older card worth $8 to $400 raw. The
player sees what their eye and tools can read, the raw price, the PSA
10 and 9 prices, and the PSA Value fee.

The game knows the answer: the average slab value of 40 PSA grade rolls,
less the fee and the raw price. Above $0, the card is worth grading. A
gap under $5 is a close call, and either answer is right.

| Answer | Result |
| --- | --- |
| Grade it, or Keep it raw: right | Reputation +2. Standing with a contact, or a 40% chance that a stranger gives their number. "That's what I thought." |
| Grade it, or Keep it raw: wrong | Reputation −1. "Huh. Someone else told me the opposite." |
| Keep it raw. I'll buy it | The player buys the card at 70% of its raw price. When the card was worth grading, it was a lie: the person can find out later, the same as a lie about value. |

## eBay collection lots

The eBay storefront has a "Collection lots" section with 4 listings.
New listings come every 3 days. A tap on a listing opens it.

### What a listing shows

| Level | Share | The listing shows | The price |
| --- | --- | --- | --- |
| No photos | 25% | A title and a card count | The card count times the usual worth per card of that kind of lot, at 45% to 85%. It says nothing about the contents. |
| Photos | 40% | 1 to 3 cards | 55% to 100% of what the full lot was worth, or 80% to 115% of an honest searched lot |
| Card list | 20% | Every good card by name, at its Near Mint price | 70% to 95% of the list. The conditions are not stated, so played cards cost too much. |
| Fully documented | 15% | Every good card with its condition and cut | 85% to 105% of its worth. Little risk, and little upside. |

- The card count in the title is rounded down to 50.
- The photos show no flaws: the player looks at each card when the box
  arrives. A fake can be in any lot.
- The photos show the best cards 80% of the time. Otherwise they show
  two random cards, and the best cards are a surprise.
- The game learns the usual worth per card of each kind of lot from the
  lots it makes, before any search.
- **A lot stays under $2,500.** A seller sells a bigger card on its
  own.

### Searched lots

40% of lots were already searched: only a few cheap cards stay with the
bulk. A card list or full documentation shows that. In a listing with
no photos or with photos, half of the searched lots say "unsearched"
anyway.

### The seller

Each listing shows the seller's feedback and sales count. A seller who
lies about a searched lot has 94% to 99.5% positive feedback. An honest
seller has 98.5% to 100%. The ranges overlap, so feedback is a hint, not
proof.

### Ask for more photos

The player can ask each seller once. The seller replies 65% of the
time:

| Listing | Reply |
| --- | --- |
| No photos | 2 photos. A lot with nothing good says "That's all the good stuff. The rest is bulk." |
| Photos | 2 more photos, or 30% of the time a card list |
| Card list | Front and back photos of every card |

### Buying

Buying pays at once. The box arrives in 3 to 5 days. The morning report
shows what was in it: the counts, the worth against the price, the best
card, and how many items look off. Then everything is in Inventory.

### Upgrades

| Upgrade | Cost | What it does |
| --- | --- | --- |
| Saved eBay searches | $80 | 6 lots instead of 4, and new lots every day |
| Seller research | $150 | Each lot shows whether the seller also sells singles from their lots. 80% of the sellers who call a searched lot "unsearched" do, and 10% of honest sellers. |
| Lot appraisal app | $250 | Each lot shows a range for its worth to a dealer, from what the listing shows. Full documentation: the exact worth. A card list: 65% to 100% of the list. Photos: 60% to 130% of the larger of the photos' worth and the usual worth for the count. No photos: 40% to 140% of the usual worth for the count. It cannot tell whether someone searched the lot. |

## Values

| Value | Number |
| --- | --- |
| Collection sellers | 22% of sellers at a table, 35% at the store counter |
| Grading questions | 12% of sellers |
| Bulk worth | 25% of its market |
| Cherry-pick premium | 15% of market |
| Cherry-pick refusal | 40%, or 60% for picks of more than 70% of the value |
| Preferred payment | 90% of the lowest price |
| Lowball | Under 40% of worth |
| Grading advice | Right +2 reputation, wrong −1, close call $5, buy at 70% of raw |
| eBay lots | 4 listings, new every 3 days, $15 shipping, 3 to 5 days, at most $2,500 |
| eBay listing levels | No photos 25%, photos 40%, card list 20%, fully documented 15% |
| eBay searched lots | 40%, and half of those with no photos or with photos say unsearched |
| Ask for more photos | Once per listing, 65% reply |
| eBay upgrades | Saved searches $80, seller research $150, lot appraisal app $250 |

## Open topics

- The shares and price ranges are first guesses. A playtest must check
  that whole collections pay after the bulk is sold, and that
  cherry-picking is the better play only some of the time.
- The store clerk's buylist still buys single items only.
