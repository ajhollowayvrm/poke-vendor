# Haggling and Deal Reputation

**Status: built.** This doc started as the plan for a change to
haggling, trades, and reputation from deals. It also answers the
questions that the change raises. It is now the design record
(`Model/Haggling.swift`, with hooks in `Model/Shows.swift`,
`Model/Relationships.swift`, `Show/ShowTableStage.swift`, and
`Show/ShowSummaryStage.swift`).

## The problems

1. **A fair counter makes people angry.** A flipper opens at about 49%
   to 74% of market, pays at most 68% to 82%, and has 1 patience point.
   A counter at 80% of market often goes past their limit. The second
   counter makes them walk away, and a contact loses 1 standing point.
2. **The trade slider does not mean what it says.** The slider sets
   the value of the trader's cards, and it starts at 80%. The cash then
   makes up the gap to the full market value of the player's item. So at
   80%, the trader must give the item's value plus 20% of their cards'
   value. A trader takes at most 100% to 110% of the item's value. When
   the cards are worth about the same as the item, the default 80% almost
   always fails.
3. **Deals barely move reputation.** A deal of $20 or more within 10% of
   market gives +1. No deal ever costs reputation, except a scam that
   comes out.
4. **Nothing happens after a deal.** A good deal or a hard deal is
   forgotten at once, except a lie to a naive seller.

## The changes

| # | Change | Short form |
| --- | --- | --- |
| 1 | The fair band | A counter inside the fair band never uses patience and never costs standing. |
| 2 | Trades by valuation | A trader has a hidden lowest valuation for their own cards. The slider is that valuation. |
| 3 | Tells | A reply says how far apart the two sides are. |
| 4 | Deal fairness | Each deal of $20 or more is generous, fair, or hard. Reputation follows, with a daily cap. |
| 5 | Deal stories | A notable deal can come back days later as a post, good or bad. Some go viral. |
| 6 | Offer trade instead of cash | A seller at the table can take an item from the table, valued at 110%. |
| 7 | Final offer | Once for each visitor, the player says "That's my final offer." |
| 8 | Pick the trader's cards | The trader shows their binder. The player picks the cards. |
| 9 | Bundles | Some buyers want two items, and ask for a bundle price. |

## 1. The fair band

Each kind of deal has a fair band, as a share of market:

| The player | Fair band |
| --- | --- |
| Sells to a buyer | The player's price is 100% of market or less |
| Buys from a seller | The player's price is 70% of market or more |
| Trades | The player values the trader's cards at 80% or more |

**A counter inside the fair band:**

- It never uses a patience point.
- It never costs standing with a contact.
- When it is past the other side's limit, they go straight to their
  limit, and they say so: "That's fair, but my best is $45."
- When the player counters again inside the band, and it is still past
  their limit, they leave politely: "I can't do it. No hard feelings."
  This does not count as "walked away". The summary counts it as
  "passed politely".

**A counter outside the fair band** works as before. It uses a patience
point, and the other side moves part of the way. With no patience left,
they walk away, and a contact loses 1 standing point. A trader who walks
away now costs standing too, the same as a buyer or a seller.

A counter under 60% of market to a seller still counts as a lowball, and
a contact still loses 2 standing points.

## 2. Trades by valuation

- A trader has a hidden **lowest valuation** for their own cards: 70% to
  90% of market.
- The player's proposal at a valuation at or above that number succeeds.
  The cash follows from the valuation, as before.
- A proposal under that number fails:
  - Inside the fair band (80% or more), the trader says their number:
    "My cards are worth more to me. I'd do it at 85%." No patience is
    used.
  - Outside the fair band, a patience point is used, as before.
- **The trader's cash has a limit.** A trader carries cash up to 50% of
  the player's item's market. When the cash would go over that, the
  trader says "I don't have that much on me." The player adds a card or
  raises the valuation.
- The trader's first offer does not change. It stays at 80% to 102% of
  the item's market.
- **Standing and reputation help.** A contact's price bonus, and a
  stranger's reputation bonus, lower the trader's lowest valuation and
  raise their cash by the same share.

## 3. Tells

When a counter is past the other side's limit, the reply says how far
apart the two sides are. The gap is the distance between the counter and
the limit, as a share of market:

| Gap | The reply adds |
| --- | --- |
| 5% or less | "That's close." |
| 5% to 15% | "We're not far apart." |
| More than 15% | "That's a long way off." |

## 4. Deal fairness

At the end of each deal of $20 or more at a table, the game scores the
deal from the other person's side.

| The player | Generous (+2) | Fair (+1) | Hard (0, and a bad story can follow) |
| --- | --- | --- | --- |
| Sells | To a kid, at 90% of market or less | 80% to 110% of market | Over 115% of market, and the player pushed the price up |
| Buys | 100% of market or more | 70% to 100% of market | Under 55% of market, and the player pushed the price down |
| Trades | Values the cards at 100% or more | 80% to 100% | Never. A trader does not accept a valuation under their lowest one, which is 70% or more |
| Pays store credit | Credit at 100% of market or more | Credit at 70% to 100% | Credit under 55% |

- **"Pushed"** means that the final price is worse for the other side
  than their own first number. A seller who asks 50% of market and gets
  it was not pushed. That deal is not hard.
- **The daily cap** is 6 reputation points from deals. More fair deals
  that day still give standing with contacts, but no reputation.
- **Not scored:** coin flip deals, a naive seller paid fair (it keeps its
  +5), a lie to a naive seller (it keeps the scam rule), and buys at the
  sticker price on the floor.
- This replaces the old "+1 for a fair deal" in `recordDeal` for table
  deals only. Floor vendors, game shops, and saved items keep the old
  +1. The standing points for contacts do not change.

## 5. Deal stories

A notable deal can come back days later as a story.

- **The chance:** a generous deal 8%, a hard deal 12%, and a coin flip
  that the player loses 4%. A generous deal makes a story only when it
  gave reputation, so the daily cap holds for good stories too. A coin
  flip makes a story only when the deal closes: a buyer who walks out on
  the payment, or pays with a scam, makes no story. Each step of notoriety adds 2%. A deal of
  $200 or more doubles the chance.
- **The delay:** 1 to 10 days. The story shows in the morning report.
- **The effect:**

| Story | Reputation | Followers (with an account) |
| --- | --- | --- |
| Good | +3 | +20 |
| Good, viral (1 in 5) | +10 | +2% of followers, at least 100 |
| Bad | −4 | None |
| Bad, viral (1 in 5) | −12 | −1% of followers. Authenticity −0.1 |

- **Examples:** "Jen posted about the deal you gave her son. It got 40k
  views." "Marcus posted that you lowballed him at Riverside Card Show."
- **Random stories** that no deal caused: a 3% chance each week. A good
  one gives +3 ("A regular vouched for you in a local Discord"). From
  reputation tier 2, a bad one can come too: −3 ("A rival vendor says
  your prices are inflated"). A random story is never viral.
- The game keeps the stories in a queue, the same way that it keeps a
  scam that comes out later.

## 6. Offer trade instead of cash

A seller at the table can take one item from the player's table instead
of cash.

- The **Offer trade** button opens a list of the table items.
- The seller values the player's item at 110% of market.
- The seller takes the item when that value is at or above their lowest
  price, and at most 150% of what they sell is worth. A trade that is
  larger than that is too big for them.
- A closet cleaner wants cash. They say no half of the time.
- No cash changes hands.
- The seller looks the player's item over first. A fake that they catch
  ends the deal, as with a buyer. A fake that they miss can come out
  later, as with any trade. An online listing of the item ends, as with
  a sale.
- Each seller hears a trade offer once.
- The deal fairness compares the market of the player's item with the
  market of what the seller sells.

## 7. Final offer

The **Final offer** button sends the slider price as a final offer. The
player can use it once for each visitor, with a buyer or a seller.

- At or past the other side's limit, it is a deal, as with a counter.
- Inside the fair band, and within 10% of market of their limit:
  - A collector, a kid's parent, a player, or a sealed collector meets
    it 60% of the time.
  - A flipper or a dealer meets it 30% of the time.
  - Otherwise, they leave politely.
- Inside the fair band but more than 10% away, they leave politely too.
  A move inside the fair band never costs standing.
- Outside the fair band, they walk away. A contact loses 1 standing
  point.

## 8. Pick the trader's cards

- A trader brings 3 to 5 cards. Their first offer uses 1 or 2 of them,
  as before.
- The trade panel shows all of the cards. The player taps a card to add
  it or take it out. At least one card stays in.
- The cash and the valuation follow the cards that are in.
- The trader's lowest valuation is the same for every card.
- The trader's own valuation of their offer stays fixed while the player
  taps cards. When the cash would go over what they carry, they say so,
  and they add their most.

## 9. Bundles

- A buyer who wants two items in their budget asks for both 20% of the
  time.
- The first offer is for the two items together. The asking price is
  the sum of both asking prices.
- The slider, the final offer, and the deal fairness work on the total.
- A sale of a bundle sells both items. Each item gets its own receipt.
- The buyer checks each item for a fake. A fake that they catch ends the
  whole deal.

## The screens

- The visitor card shows the tell in the reply line.
- The deal buttons get **Final offer** (buyers and sellers) and **Offer
  trade** (sellers at a table).
- The trade panel shows the trader's binder with tap targets.
- The summary shows "passed politely" and the reputation from deals
  today, for example "Reputation +5 from deals (cap 6)".
- The morning report shows the stories.

## Questions and answers

**Where do these rules apply?** At every table: card shows, meets,
league night, and the store counter. They also apply to people who stop
the player on the floor, and to the host at a garage or estate sale.

**Do floor vendors change?** No. "Ask for 10% off" and vendor trades stay
as they are.

**Do direct messages and Facebook offers change?** No. They have their
own rules. A later change can score them too.

**Can the player buy reputation with generous deals?** Only up to the cap
of 6 points a day. A generous buy also costs real money. That trade-off
is intended: a player can spend cash to build a name.

**Does the fair band make haggling too easy?** No. The fair band only
removes the anger. It does not move the other side's limit. A flipper
still pays at most 68% to 82% of market. The player learns the limit
sooner and leaves on good terms.

**Does a naive seller change?** No. Paying fair still gives +5
reputation. Taking their price is still not a scam, and it is not hard,
because the player did not push the price. A lie still follows the scam
rule.

**Does the tired factor still apply?** Yes. A tired player's counters
move the other side less, outside the fair band. Inside the band, the
other side goes straight to their limit.

**Does the store's credit bonus change?** No. A seller who takes credit
gets 130% of the cash offer, as before. The deal fairness scores the
credit amount.

**How do stories and scams fit together?** A scam that comes out keeps
its own rule (−30). A scam does not also make a story.

**What happens to old saves?** The new fields have defaults: no stories
in the queue, and no reputation from deals today.

**How does the soak test it?** The soak plays counters inside and
outside the band, final offers, trades at several valuations, a trade
instead of cash, and bundles. It checks:

- No visitor walks away after a counter inside the fair band.
- A counter inside the band never uses patience.
- The reputation from deals in one day never goes over 6.
- A bundle sells both items, or neither.
- A trade instead of cash moves exactly one table item.
- Each story in the queue comes out on its day, and the queue empties.

It prints one `SOAK DEALS` line, and a `SOAK DEALS FAIL` line for each
broken rule. The line counts each kind of move, so a move that never
happened shows as 0. The soak tells an angry walk-away apart from a
buyer who leaves because they have no cash.

## Not in this change

| Idea | Why not now |
| --- | --- |
| Score direct messages and Facebook offers | They have their own systems. |
| Answer a bad story with a post | It needs a new post type in the social system. |
| Bundles of three or more items | Two is enough to test the idea. |

## Values

| Value | Starting value |
| --- | --- |
| Fair band: sell / buy / trade | ≤ 100% / ≥ 70% / ≥ 80% |
| Trader's lowest valuation | 70% to 90% |
| Trader's cash | Up to 50% of the item's market |
| Tells | ≤ 5% close, ≤ 15% not far, more is a long way |
| Deal fairness minimum | $20 |
| Reputation from deals | Generous +2, fair +1, hard 0. Cap 6 a day |
| Story chance | Generous 8%, hard 12%, lost flip 4%, +2% for each notoriety step, ×2 at $200 or more |
| Story delay | 1 to 10 days |
| Story effects | Good +3 / +20 followers. Viral good +10 / +2% (100 or more). Bad −4. Viral bad −12 / −1%, authenticity −0.1. 1 in 5 is viral |
| Random story | 3% a week. Good +3. Bad −3, from tier 2 |
| Offer trade | 110% value, at most 150% of the goods. A closet cleaner says no 50% of the time |
| Final offer | Within 10% of market of the limit. Meets it 60% (30% for a flipper or a dealer) |
| Trader binder | 3 to 5 cards |
| Bundle | 20% of buyers who can want two items |
