# Callouts

**Status: built.** The code is in `app/PokeVendor/Model/Callouts.swift`, and the screens are in `Social/CalloutViews.swift`. The numbers are starting values for balancing. They are in [19-prototype-values.md](19-prototype-values.md).

A shady act that the player does goes into a hidden log. The player does not see the log. Each night, an act can come out as a public callout: a post that accuses the player. Rivals also post callouts, and most of theirs are false. The player answers with one of four replies.

No callout reads or writes a market price. No callout ends a run. [34-flippers-and-retail-limits.md](34-flippers-and-retail-limits.md) describes the acts of retail and flipping. [06-social-media.md](06-social-media.md) describes the posts and the Rip & Ship rules.

## The hidden log

Each entry is a hidden act. An act has a kind, a weight, witnesses, and a note.

- The weight is the size of the act. A normal act has weight 1.0. The weight is from 0.1 to 3. It is not the scalper heat of the act.
- Witnesses are people who saw the act: a crowd, or a stream audience. More witnesses make discovery more likely.
- Some acts have a harmed contact, a refund amount, and a source (for example a Rip & Ship order). A source lets another system retire the act.
- An act has a daily decay. The weight falls by that share each day.

### The kinds

There are 14 kinds. Each kind becomes one callout type.

| Kind | What the player did | Type | Comes out each day | Weight decay | Proof chance |
| --- | --- | --- | --- | --- | --- |
| `shelfBuyout` | Emptied a hot item, 2 units or more in one visit | Greed | 2.0% | 8% | 60% |
| `limitEvasion` | Made a second visit to a chain to get around the limit | Greed | 1.5% | 6% | 40% |
| `botCheckout` | Used the checkout bot | Greed | 1.0% | 5% | 20% |
| `storeBan` | A chain refused card sales to the player | Greed | 4.0% | 4% | 60% |
| `botOrderCancelled` | A store cancelled a bot order | Greed | 1.5% | 5% | 30% |
| `priceGouge` | Posted hot in-print sealed at 1.25 times market or more | Greed | 2.0% | 7% | 50% |
| `backDoorAllocation` | Sold hot distributor allocation to outside resellers | Greed | 1.0% | 3% | 50% |
| `plugPurchase` | Bought from the gray plug | Forbidden | 0.6% | 4% | 30% |
| `plugSeized` | Police seized plug stock | Forbidden | 5.0% | 3% | 90% |
| `sellResealed` | Knowingly sold a resealed product, and the buyer did not find it | Product integrity | 3.0% | 5% | 70% |
| `counterfeitSold` | Knowingly sold a fake card, and the buyer did not find it | Product integrity | 2.0% | 4% | 70% |
| `palmedHit` | Swapped a viewer's hit off camera, and the camera did not catch it | Fair openings | 4.0% | 4% | 80% |
| `unshippedOrder` | A Rip & Ship order is past its ship deadline | Fair openings | 20% | none | 90% |
| `lowballKid` | Told a kid that a card is not worth much, and bought it cheap | Treatment of kids | 3.0% | 6% | 50% |

- The "comes out" chance is the base chance for weight 1.0 and no witnesses.
- A kind with no decay stays in the log until it comes out, or until its order settles.
- A kid lowball is one path: the act, then a callout.
- A sold fake that the buyer finds does not record an act. It costs reputation at once (see [14-counterfeit-risk.md](14-counterfeit-risk.md)).

### Discovery

Each night, the game rolls each act that has not come out. The first night counts: an act can come out on the night that the player does it.

```
chance = base × weight × witness factor × (1 + 0.1 × notoriety)
```

- The witness factor is `1 + log10(1 + witnesses) / 2`, at most 3.
- Notoriety is the reputation tier plus the follower tier.
- A greed act also multiplies the chance by `(0.5 + flipper pressure) × (1 + min(1, scalper heat / 10))`.
- The chance is at most 50% a day.
- An act with a fixed reveal day comes out on that day, with no roll.
- An act that does not come out loses part of its weight. It leaves the log when its weight is under 0.05, or after 90 days.
- An act that came out stays in the log for 120 days, so its source can retire it.

## The callout

A callout has a type, an accuser, a post, a heat from 0 to 100, and a peak.

| Type | Start heat |
| --- | --- |
| Treatment of kids | 70 |
| Product integrity | 60 |
| Fair openings | 60 |
| Forbidden product | 50 |
| Greed | 40 |
| Baseless drama (the backfire of a baseless callout by the player) | 40 |

- **Who posts.** The person that the act harmed posts most callouts. A named rival breaks the story 1 time in 3.
- **True or false.** A callout from an act is true. A rival can also post a false callout. The screen does not say which.
- **Proof.** A callout has proof or it has none. The chance is the proof chance of the kind. Proof can come later (see Heat).
- **Start heat of a true callout.** The type heat times the weight of the act, from 0.75 to 1.5. A rival callout with a true act uses the type heat times the rival credibility.
- **One line of reason.** The screen shows why the heat moved last.
- **Where it shows.** A banner on the hub. The banner stops when the player picks a reply, "stay silent" included. A callout is not a message.
- **The cap.** At most 3 callouts about the player stay open. Some callouts open past the cap (see below).

### The cap and merges

A forced callout opens past the cap: a palm caught on camera, a public post about a sold fake, an act with a fixed reveal day, an unshipped order, and a baseless callout by the player.

When 3 callouts are open, a new act from the log does one of two things:

- It adds its heat to an open callout that is true and still going. It picks the same type first, then the hottest. It never joins a false callout, or a callout that the player already answered with a deny or a make-it-right. The peak rises, so the fade cost and the record follow.
- With no such callout, the act opens its own callout past the cap, so the act never vanishes. A claim with no act, for example a false rival callout, is dropped.

### Heat

- Each night, an open callout loses 15% of its heat. A callout that opened tonight keeps its heat for one night.
- A callout with a scheduled fall (a deny of a false callout, or a make-it-right) falls to 0 on a straight line.
- A named rival answers a deny or a counter-callout the next night. The chance is the rival's hostility. The answer adds 20 heat.
- A true callout with no proof, at heat 30 or more, gets proof with a chance of 15% each night. Proof adds 10 heat.
- A good deal story lowers the heat of every open callout by 10, or by 25 when the story is viral (see [30-haggling-and-deal-reputation.md](30-haggling-and-deal-reputation.md)).
- A callout ends when its heat is under 5, or after 45 days.

### What the end costs

The cost depends on the peak heat. It comes when the callout ends.

| Peak heat | Reputation | Followers and authenticity |
| --- | --- | --- |
| Under 30 | 0 | None |
| 30 to 69 | −4 | None |
| 70 or more (viral) | −12 | −1% of followers and −0.1 authenticity, for a player with an account |

- A callout that the player answered with "make it right" costs half the reputation, rounded up. It costs no followers and no authenticity.
- A false callout that the player beat with a deny, or paid off, costs nothing at the end.
- A sold-fake post already took its reputation, so its callout takes none.
- A true callout also costs 15 points with the contact that the act harmed.
- A true callout that peaked at 50 or more leaves a record (see The record).
- A true product integrity callout that peaked at 80 or more bans Whatnot streams for 4 to 8 weeks. A palm found through the log, at 80 or more, bans for 8 weeks. A palm caught on camera is banned when it is caught.

## The four replies

| Reply | Needs | What it does |
| --- | --- | --- |
| Stay silent | Nothing | The heat falls 15% each night, as it does without a reply. |
| Deny | An account | On a **true** callout, the heat is multiplied by 1.5. The denial falls apart with a chance of 50% with proof, or 20% without. Then reputation falls by 8, and the proof is out. On a **false** callout, the callout ends in 2 days, reputation rises by 1, and the rival loses 0.25 credibility. The rival also gives the player a receipt. |
| Make it right | Cash | The player pays the cost below. The heat falls to 0 in 1 day. Followers from a counter-callout go back. No account needed. |
| Counter-callout | An account, and a rival accuser | The heat rises by 30. The player gains 0.5% of followers and loses 0.05 authenticity. The rival loses 0.1 credibility on a true callout and 0.3 on a false one. The rival gains 0.2 hostility. A game shop accuser costs 10 standing points. |

- A deny and a counter-callout exclude each other, and neither works after the callout starts to fall.
- A counter-callout does not work on a baseless drama callout that the player started.
- A deny, a counter-callout, and a make-it-right with an account each add a "Response" post to the post list. The post gives no followers. It adds 5% burnout.

### What "make it right" costs

| Callout | Cost |
| --- | --- |
| Most acts | The refund of the act: a fair price gap for a kid, the price of a fake or a resealed product, and so on. |
| An act with no refund | $2 for each heat point, at least $25, at most $250. |
| A late Rip & Ship order | The player ships the order (10 minutes), and pays 10% of the order price, at least $5. The order was already paid at the sale. |
| A palmed hit | The order price and the market value of the palmed cards, or only the cards if the buyer already got the price back. The player sends the cards to the buyer. |

## Rival callouts

Each week, on the day that is a multiple of 7, every rival can post. The player needs reputation Known or follower tier 1 first. Nobody talks about an unknown player.

- The rivals are the 3 flipper rivals and the 2 creator rivals of [34-flippers-and-retail-limits.md](34-flippers-and-retail-limits.md#rivals). After the player signs a store lease, the 2 game shops also post.
- The chance is `(0.008 + 0.06 × hostility) × credibility`. A creator adds the drama bait. The chance is cut to 25% when any rival posted in the last 14 days.
- A game shop has hostility `0.2 + 0.5 × (1 − standing / 100)`.
- A rival with no open callout about the player is the only one that can post.
- 4 posts in 10 use a real act that fits the rival and has not come out. A flipper uses greed, forbidden, and integrity acts. A creator uses fairness, integrity, kids, and greed acts. A true rival callout has half the proof chance of the act.
- The other posts are false. The type is random: a flipper posts greed (70%) or integrity (30%). A creator posts fairness (50%), greed (35%), or kids (15%).
- A false callout starts at the type heat times the rival credibility. A player with no account has half that heat.
- The weekly random deal story has a bad branch. It is a callout from one named rival, or nothing.

### Credibility

- Credibility is from 0.25 to 1.0. It scales the start heat of what the rival posts, and the chance of a post.
- A deny that proves a false callout costs the rival 0.25. A counter-callout costs 0.1 or 0.3. A player callout with proof costs 0.3.
- A rival regains 0.05 each week.

### Drama bait

A long series of rip shorts with no hit can start a gambling backlash. The backlash adds 0.15 drama bait, to a maximum of 0.5. Drama bait raises the chance of a post by a rival creator. It halves each week. Pack battles stay out of scope (see [32-short-form-video.md](32-short-form-video.md)).

## Receipts

A receipt is proof that the player holds against a named rival.

- A rival line at a store (the rival cleared the shelf) gives a receipt with a chance of 5%.
- A sealed product that the player bought at a rival's show table, and later found to be fake, gives a receipt.
- A deny that proves a false callout gives a receipt.
- Each rival gives at most 1 receipt in 30 days. A receipt stays for 60 days.
- A receipt is not an act. It is an item in a list on the Contacts screen.

## Player callouts

The player can call out a named rival. The player cannot call out a game shop.

- The player needs an account. The player can call out each rival once in 28 days.
- **With a receipt.** The callout is true. The receipt is used. The player gains reputation (+1) and followers (0.5%, at least 10). Both scale by the rival's credibility. The rival loses 0.3 credibility and gains 0.2 hostility.
- **Without a receipt.** The callout is baseless. The player loses 0.05 authenticity. The rival gains 0.1 credibility and 0.2 hostility. A forced "baseless drama" callout opens against the player at heat 40.
- The call adds a "Response" post to the list.

## The record

A true callout that peaked at 50 or more leaves a record for 90 days.

- Each active record lowers the starting points of every new contact by 5. At most 3 records count.
- "Make it right" does not remove the record.
- At a show, a buyer can mention the thread when the hottest open callout is at heat 50 or more. 1 buyer in 8 who does not sell has 1 less patience and says "Aren't you the one from that thread?"

## The kid gift

At a show, the player can give a kid the item that the kid wanted. The gift is free.

- The kid must want to buy. The item must be worth $5 to $30. It must not be a known fake, and not a showcase item.
- The player can give one gift a day.
- Each gift has a 15% chance to become a good story. 1 story in 5 is viral. The story follows the rules of [30-haggling-and-deal-reputation.md](30-haggling-and-deal-reputation.md): reputation and followers, and a drop in the heat of open callouts.

## Sponsors

A player with a callout at heat 60 or more gets no new sponsor offers. Offers that the player already holds stay.

## Gouge

A gouge is the act `priceGouge`. The player commits it by posting hot in-print sealed product at 1.25 times market or more. The post must be at the own store or at a show table. The game counts the posting, not the sale. At most 1 gouge records each day. [34-flippers-and-retail-limits.md](34-flippers-and-retail-limits.md#price-gouging) has the rules.

## Balance tool

The debug menu has a demo setup: a Known player with a social account, acts that come out, a false callout, and a record. `-test` checks the callout rules.
