# Social Media System

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
- **Follower decay**: followers are not a number that only goes up.
  Inactivity, controversy, and algorithm shifts cause real decay — an
  audience needs upkeep, not just a one-time build.

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
