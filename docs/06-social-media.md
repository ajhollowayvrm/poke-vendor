# Social Media System

**Status: built.** Quick posts, sponsors, the analytics upgrade, live streams (`Model/LiveStream.swift`, `Stream/StreamView.swift`), scheduled streams, giveaways, Whatnot auctions and Buy Now, Rip & Ship, callouts and replies, tips, the show promo post, and production value from the studio lights and the camera kit. Short-form video series are in [32-short-form-video.md](32-short-form-video.md). The numbers are in [19-prototype-values.md](19-prototype-values.md).

One unified social media presence, not split across separate in-game
platforms. It supports two content types, which map onto the existing
free-action / time-cost split from
[01-premise-and-loop.md](01-premise-and-loop.md).

## Social media is optional

The player never has to use social media. The player starts with no
account.

- Until the player creates an account, the hub's Followers slot shows
  "Start posting". A tap on it opens the social media hub, where the
  player creates the account.
- Until then, the game hides all social media UI: the hub's Go Live
  row, the hub's post icon, and the rip summary's "Post this pull"
  button.
- A player with no account has 0 followers, at follower tier 0.
  Follower decay costs that player nothing.
- The follower unlocks outside social media stay (see
  [04-reputation-and-followers-unlocks.md](04-reputation-and-followers-unlocks.md#follower-tiers)).
  A player with no account "makes it" through cash, reputation, or
  collection value (see [03-currencies.md](03-currencies.md)).

## Content types

### Quick posts (free action)

Pull reveals, collection flexes, hot takes, show promos. Fast, low effort,
the most common form of content. No time cost, can be posted alongside any
other action in a day.

A reply to a callout is a "Response" post (see
[35-callouts.md](35-callouts.md)). It gains no followers, and it adds
5% burnout.

### Live streams (time-cost action)

Live pack openings and live Whatnot sales. Higher risk, higher reward:
real-time audience, tips as income, no editing safety net if it flops.
Competes for the day's time budget the same way a garage sale or meet does —
going live is a real scheduling trade-off, not a free add-on.

A stream has no trading segment. Trading stays at local meets.

**Setup.** Before a stream, the player picks:

- The length: 2 or 3 hours (see
  [16-time-and-day.md](16-time-and-day.md#starting-hour-values)).
- The sealed products and the cards for the stream. During the
  stream, the player can use only these items.
- The start: now, or a later day on the calendar.

**A scheduled stream** goes on the calendar, and followers see it
ahead. It brings more viewers. A missed scheduled stream costs
followers and authenticity.

**During the stream**, the player acts at any time. The stream has no
skip. The actions are:

- **Rip a product.** A stream rip allows only the Normal and Fast
  speeds (see
  [18-ripping.md](18-ripping.md#ripping-on-a-live-stream)).
- **Give away a card or a product.** A giveaway brings more viewers,
  gains followers, and raises authenticity.
- **Auction a card.** Viewers bid live.
- **Offer a Buy Now sale.** The player sets a fixed price, and a
  viewer can buy the card at once.
- **Rip & Ship.** A viewer buys one whole sealed product, and the
  player opens it on camera (see [Rip & Ship](#rip--ship)).
- **Show a card.** It raises viewer interest.
- **Talk to chat.** It keeps viewers from leaving.

Auctions and Buy Now sales use Whatnot, which opens at follower tier 1
(see [15-selling.md](15-selling.md#whatnot)).

**The stream ends** when its hours run out, or when the player taps
End. The unused hours go back to the day.

**The summary** shows the peak viewer count, the tips, the auction and
Buy Now results with the Whatnot fees, the pulls from the rips, and
the followers gained or lost.

This gives social media exactly one meaningful internal trade-off: post for
free whenever, or commit real time to a stream for a bigger, riskier payoff.

### Rip & Ship

**The rule.** One viewer buys one whole sealed product, and the player
opens it on camera. Every card goes to that viewer. The cards carry the
order and never become the player's. Rip & Ship is not a group break: no
order has a second buyer, a spot, a team, or a prize that depends on the
result. The game has no livestream group breaks.

- **Setup.** The player marks sealed items for Rip & Ship before the
  stream. A product that is a pack, a box, a case, or any other sealed
  item can go up. A known fake cannot. A product that is in a PC, listed
  elsewhere, or already sold cannot.
- **Buy Now or auction.** The player sets a fixed price, or runs an
  auction. Each viewer has a hidden ceiling, as a share of market: 95% to
  120% for a hot product and 90% to 105% for other product. The first
  viewer under the ceiling buys. A product over $500 needs a big crowd.
  Each rival creator takes 5% of the buyers, down to 80% of them. Half
  of the time, the buyer is a repeat buyer from the contacts, who pays
  up to 5% more after a good rip and up to 5% less after a bad one.
- **The sale.** The money comes at once, in the ledger, as a normal
  sale. The product waits on the stream. While an order waits, no other
  Rip & Ship offer and no other sale runs.
- **The fee.** The buyer pays the shipping label. The player pays:
  - Whatnot commission: 8% of the sale. It falls to 7.5%, 7%, 6.75%, and
    6.5% as the Rip & Ship sales of the last 28 days pass $15,000,
    $50,000, $150,000, and $500,000.
  - Processing: 2.9% of the sale plus the buyer's shipping, and $0.30.
  - Supplies: $0.50.
- **The rip.** The stream clock stops while the player rips. A whole-case
  rip runs at 0.75 minutes for each pack, and it opens the case once. A
  buyer waits about 10 minutes before the chat gets bored. A rip that
  stops early ships the unopened packs.
- **The buyer reaction.** The buyer says "LET'S GO" when the cards are
  worth 1.5 times the price or more, and "rip..." under half of it.
- **Clips.** A big hit is a clip. It brings followers: 3% of the viewers.
- **The ship queue.** After the rip, the order waits in the ship queue.
  Shipping takes 10 minutes for each order. The player must ship within 2
  days. A shipped order gives the repeat buyer 2 contact points.
- **An order that never opened.** If the stream ends before the rip, or the
  app closes, Whatnot refunds the buyer. The player pays back the net, and
  loses 0.02 authenticity. A resealed product stops the rip. Whatnot
  refunds the buyer, and the player loses 0.05 authenticity (see
  [14-counterfeit-risk.md](14-counterfeit-risk.md)).
- **Palm the hit.** After a big hit in a Rip & Ship rip, the player can
  "palm it": swap the hit off camera. The buyer gets a bulk card. This is
  a scam. The camera catches it half of the time. A catch costs 40
  reputation, a Whatnot ban of 8 weeks, and a callout that starts at
  heat 90. A miss is a hidden act that can come out later (see
  [35-callouts.md](35-callouts.md)).

## Virality and reach

Roughly:

```
reach = base_follower_reach × content_quality_multiplier × timing_multiplier × algorithm_luck_roll
```

- **Content quality**: driven by what you actually have to show (a huge pull
  posts better than a bulk-common pull) and an investable production-value
  stat (better lighting, editing, camera gear).
- **Timing**: posting when a set is hot, or riding a real trend, matters —
  identical content posted into a dead moment flops.
- **Algorithm luck**: a rare chance of a true breakout post that spikes far
  outside your normal range, mirroring a small creator suddenly blowing up
  off one lucky pull video.
- **Authenticity/track record**: a hidden modifier. The analytics upgrade
  shows it (see [The analytics upgrade](#the-analytics-upgrade)). Followers burned before
  (bad grading calls, hype that did not pay off) suppress future reach,
  independent of raw follower count.

## Consequences

- **Burnout**: posting constantly without real content behind it degrades
  quality and reach over time. Spam does not work.
- **Backlash**: overhyping a card that flops, or a bad grading call going
  public, costs reach — and can cost reputation too, if it is bad enough to
  spill into the in-person trading world (see
  [03-currencies.md](03-currencies.md)).
- **Scam accusations**: a slow shipment or a bad trade made public can tank
  an account, mirroring real collector-community drama. A player with
  no account still gets public scam accusations: the buyer posts on the
  buyer's own account. The accusation costs reputation. It costs
  followers only if the player has an account.
- **Callouts**: a callout has a type, a heat, and a reply (see
  [35-callouts.md](35-callouts.md)). A player with no account still gets
  callouts, and can stay silent or make it right. Deny and
  counter-callout need an account. A sold fake that the buyer posts about
  is now a callout. The loss is 1% of followers at a viral fade, not 5%.
- **Late Rip & Ship orders**: an order that is past its 2-day ship deadline
  is a hidden act, and it can become a callout. On day 7, Whatnot cancels
  the order and takes back the price. This is a chargeback with a
  strike. 2 strikes in 60 days give a 4-week Whatnot ban. 3 strikes in
  120 days end Rip & Ship for good. Normal streams stay.

## Growth and monetization

- **Sponsor deals**: unlock at follower thresholds. Paid posts for cash, but
  overusing them dilutes authenticity. An offer arrives in the social
  hub inbox. It shows the brand, the pay, the number of paid posts, and
  the days to make them. The player accepts or declines. A missed
  deadline cancels the deal and costs authenticity.
- **Follower tips**: start at follower tier 1. A tip arrives in the
  social hub inbox and reveals a hidden garage sale: the place, the
  day, and a one-line hint. The player adds the sale to the calendar
  (see
  [17-calendar-and-events.md](17-calendar-and-events.md#hidden-garage-sales-from-follower-tips)).
- **A sponsor block**: a player with a callout at heat 60 or more gets no
  new sponsor offers. Offers that the player holds stay.
- **Follower decay**: followers are not a number that only goes up.
  Inactivity, controversy, and algorithm shifts cause real decay — an
  audience needs upkeep, not just a one-time build.

## Limits on growth

Posts stay free, but free posts do not compound without limit. A post about the
same subject within 14 days has low quality. Only the first 3 posts of a day gain
followers. One post gains a small share of the audience, and a viral post gains
4 times as much.

## The analytics upgrade

Without this upgrade, a post shows its views and the followers it
gained or lost. The reach formula, burnout, and authenticity stay
hidden. The player sees only falling reach.

This permanent upgrade (see [09-upgrades.md](09-upgrades.md)) shows:

- The likes and the reach factors of each post: content quality,
  timing, and luck.
- A burnout meter on the social media hub.
- An authenticity meter on the social media hub.

The cost of the upgrade is a balancing value.

See [04-reputation-and-followers-unlocks.md](04-reputation-and-followers-unlocks.md)
for what follower thresholds unlock outside the social system itself.
