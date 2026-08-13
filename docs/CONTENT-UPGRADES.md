# Content & Audience Upgrades — Design Plan

> Status: **SHIPPED 2026-08-12** — all 8 upgrades built in one batch, persist **v63**.
> Pure math in `src/game/content.js`, actions in `src/game/store/socials.js`, per-day work in
> `daytick.js`, UI in `src/components/Socials.jsx` (Stream tab) + the Binder's declare button.
> Rails pinned by **sim section 8 (📱 CONTENT & AUDIENCE)** — `npm run sim` green, and an
> end-to-end run drives every path (post → drain → challenge → payoff → vlog → calendar →
> podcast → sponsor obligation → lapse → show-bin bias).

## The gap

The game has a real audience layer already — `followers` (returning viewers: they raise every
stream's floor *and* give a standing ≤+15% online-order bump), `subs` (a daily drip that bleeds
when the channel goes dark), `streamClip` (a post-stream follower drip), 🔥 hype, and 🎫 clout.

**All of it is gated behind going LIVE**, and going live costs a whole game day. That's one
narrow channel for something real vendors do constantly and cheaply: they film the stuff they
were already doing. A chase pull at the kitchen table, a PSA 10 coming back in the mail, a
collection haul dumped on the counter, a show walkthrough, a master set page finally filled —
that's the content, and none of it costs a day.

So the batch is built on one substrate — **moments you already generate become posts** — plus
the show-floor content format the hobby actually runs on: the **master set challenge**.

## The substrate: 📱 posts

New state (small, ring-buffered like `repLedger`):

```js
posts: [{ kind, label, value, daysLeft, perDay }]   // circulating short-form, drains in daytick
postStreak: 0, lastPostDay: null                     // cadence, mirrors rhythmStreak
```

Feeders (every one is an existing call site that *already* computes the interesting number):
- `collection.js` openPack (~line 49-76) — already has `hits` / `isGod` / `topVal` and already
  bumps hype. A chase pull off-stream posts itself.
- daytick grading returns — a gem-10 coming back is the single most-posted moment in the hobby.
- buy-in acceptance (booth.js `counterBuyin` / shows.js `haggleBuyin`) — the haul video.
- `checkCompletions` — a finished page.

Drain: one block in daytick beside the existing `streamClip` drip, same shape (`perDay` ×
`daysLeft`), so posts and clips read as one system. Hard cap on posts/day so a 36-pack box
can't carpet-bomb the feed.

**Rails** (these are the reason the batch stays honest):
- A post is worth a *fraction* of a stream clip. Streaming stays the big lever; short-form is
  the passive floor that means a quiet week still builds the channel.
- Followers keep their existing ≤+15% order cap — more follower *sources* must not make the
  cap trivial, so per-day gains stay small and the build stays slow.
- Content feeds 🔥 hype through `bumpHype` only (diminishing intake, ×1.35 demand / ×1.05
  price caps hold). No new demand or price multiplier is introduced by this batch.
- Nothing here pays cash directly except 💰 Brand Deals, which is capped and carries an
  obligation.

---

## The upgrades

| # | Upgrade | Cost | Needs | What it does |
|---|---|---|---|---|
| 1 | 📱 Shorts Channel | $700 | smartphone | Moments auto-post; each drips followers ~2 days. Small chance a post *pops* (algorithm lottery, ~10× drip for a day). |
| 2 | 🃏 Master Set Challenge | $1,500 | shortsChannel | Declare a set on camera; the hunt becomes a series. |
| 3 | 🎥 Show Vlog Kit | $1,200 | smartphone | Every show trip cuts a vlog: followers + a listing-traffic afterglow + you get recognized at the next show. |
| 4 | 🔁 Content Calendar | $2,000 | shortsChannel | Bank moments and release one a day; a posting streak earns an algorithm bump (capped, mirrors `rhythmMult`). |
| 5 | 💬 Community Discord | $1,600 | shortsChannel | Audience → customers: faster want/forum refill skewed to what you hold, and followers occasionally convert into walk-in regulars. |
| 6 | 🎙️ Hobby Podcast | $1,800 | — | Slow permanent ⭐ drip (own ledger source) + you hear reprint waves early. |
| 7 | 🤝 Creator Collabs | $2,500 | streaming | Scheduled guest breakers inject another creator's audience — bigger and more reliable than a raid. |
| 8 | 💰 Brand Deals Desk | $4,000 | shortsChannel | Monthly sponsor check scaled by followers/subs (hard-capped) — with an obligation to feature their product. |

Folded in rather than sold separately: the *viral pop* chance lives inside #1 (an upgrade
that sells "sometimes it works" is a worse buy than one that sells a floor), and product
photography folds into #3's listing afterglow.

### 1. 📱 Shorts Channel — $700, needs `smartphone`
The entry to the whole tree and the only one that changes the daily rhythm on its own. Every
notable moment posts: a chase pull, a gem 10 back from the grader, a fat haul, a completed
page. Each post recruits followers for ~2 days at a rate scaled by the moment's value, capped
per day. Roughly a third of a stream clip's pull, but it costs no day and it fires while you're
doing something else. Small viral-pop roll on each post.
*Hooks:* `posts` state + feeders listed above + one drain block in daytick.

### 2. 🃏 Master Set Challenge — $1,500, needs `shortsChannel`
Declare one set you're chasing, on camera. While a challenge is live:
- **Show vendors surface that set's singles more often** — booth stock biases toward it (the
  same knob shape as the reprint wave's `biasSetId`), so hunting at a show actually works.
- **Every missing card you land is content** — followers + hype per acquisition, so the grind
  pays audience even on the cards that aren't chases.
- **Completing it on camera is the payoff video** — a one-time follower/hype/🎫 bounty on top
  of the normal `completionReward`.
- Progress-scaled: declaring a set you're already 90% through pays a fraction. One challenge at
  a time, and abandoning one is a small ding — you told people you'd finish it.
*Hooks:* `setChallenge: {setId, startDay, startPlaced}`; booth-stock bias in shows.js; the
acquisition check rides the existing set-progress math (`mastersetStats`); bounty in
`checkCompletions`. Pairs directly with the 🖼️ showcase economy — the challenge is how you
*get* a showcase, the showcase is what it pays.

### 3. 🎥 Show Vlog Kit — $1,200, needs `smartphone`
"Come to a card show with me." Every show you attend cuts a vlog: followers scaled by the
show's tier and the best thing you found, a few days of extra listing traffic on the way home,
and a small booth-traffic bump at your next show (people recognize the guy from the videos).
Gives shows a content payoff whether you're vending or just shopping.
*Hooks:* settle in `attendShow` / the away-day path in `advanceDaysWith`.

### 4. 🔁 Content Calendar — $2,000, needs `shortsChannel`
The editing-suite upgrade: moments bank into a queue instead of firing the day they happen, and
release one per day. A hot rip day feeds a dry week, and posting *every* day builds a cadence
streak worth a capped algorithm bump — the same shape as the stream `rhythmMult`, which is
already the game's "consistency beats bingeing" idea.

### 5. 💬 Community Discord — $1,600, needs `shortsChannel`
Turns an audience into a customer base: collector wants and forum WTB posts refill faster and
skew toward stock you actually hold, and a follower occasionally converts into a walk-in
regular. Deliberately distinct from 🛡️ Mod Team (which protects sub churn) — this one points
the audience at the shop.

### 6. 🎙️ Hobby Podcast — $1,800
A weekly episode with the same three guys arguing about grading. Slow *permanent* ⭐ drip (its
own `REP_SOURCES` tag) rather than hype — the podcast is standing, not heat — plus you hear
about reprint waves a couple of days before they're announced, which is real money if you're
holding.

### 7. 🤝 Creator Collabs — $2,500, needs `streaming`
Guest breakers on your stream and you on theirs: scheduled collabs that inject a chunk of
another creator's audience (bigger and more predictable than the existing random raid), with
per-creator rapport so the roster warms up over time.

### 8. 💰 Brand Deals Desk — $4,000, needs `shortsChannel`
The monetization cap-stone: a monthly sponsorship check scaled by followers and subs, hard
capped so it can never out-earn the shop, and carrying an obligation — feature the sponsor's
product line within the window (buy it, rip it on camera) or the deal lapses with a rep ding.
Follower count finally becomes an income line instead of only a traffic multiplier.

---

## What shipped (2026-08-12)

All three phases landed together at the user's call. Implementation notes worth keeping:

- **Progress is measured, not hooked.** The 🃏 challenge recomputes set ownership ONCE a day in
  the tick rather than hooking every path a card can arrive by (booth buy, rip, trade, buy-in,
  want, lot, slab return). One funnel, and it cannot miss a path. Selling into the set
  re-baselines so re-buying pays once.
- **Hot paths fold, they don't write.** `postPatch()` returns a state PATCH so a rip folds its
  post into the single `set()` it already makes — every `set()` re-serializes the whole save.
- **The show-bin bias is theming.** It draws through `cardFromSetsInRange`, which holds the card
  inside the band the bin would have used anyway — the same rail the era-themed buy-in pools
  ride. You find more of what you're chasing; you never find it cheaper.
- **The sponsor's obligation is self-detecting.** It compares `bySet[setId].packsOpened` against
  the count stamped at signing, so "did you actually feature them" needs no new call site.
- **The podcast's intel is a deferred market event.** The wave stamps `softenDay` and the tick
  applies the reprint crash when it arrives — the gap is the window to sell.

Remaining ideas, deliberately not built: an in-fiction feed of other creators' posts, and
letting the challenge target a *variant* masterset rather than the base set.
