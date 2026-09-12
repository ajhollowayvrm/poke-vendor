# UI Direction

## Status

Two screens designed and approved: the home hub, and its Wallet / cash
ledger destination (see below). Mockups live outside this repo for now, in
Claude Design canvases — this doc records the decisions so they survive
independent of any single mockup file.

## Aesthetic

Modern fintech/dashboard direction, chosen over a retro trading-card look and
a playful mobile-game look. Dark background, monospace numerals, sharp
rectangular cards, cyan/green accent lines. Treats the game like a real
portfolio app — numbers up front, minimal chrome.

## The home hub is the density ceiling

The home hub is the single most information-dense screen in the game, by
design. Every other screen should read as calmer than it by comparison — if
another screen feels as dense as the hub, that is a signal to simplify it.

## The home hub is an info + launch screen, not read-only

Nearly every element on the hub is a tap target into a deeper screen, not
just a display of a number. The hub's job is to summarize the whole game
state and be the fastest way to get anywhere in the app.

### Confirmed tap targets and their destinations

1. **Cash** → Wallet / cash ledger
2. **Followers** → Social media hub
3. **Reputation** → Reputation & meets
4. **Collection** → Inventory / collection
5. **Alert banner** (rare surprise event) → Opportunity detail
6. **Local meet row** → Meet encounter
7. **Garage sale row** → Garage sale encounter
8. **Go Live row** → Live stream setup
9. **Card show row** → Show detail / planner
10. **Camping event row** → Camping event (a store drop to camp, in
    the same list as card shows; see
    [12-acquiring-product.md](12-acquiring-product.md#camp-a-store-drop-event-time-cost))
11. **Recent activity** → Activity log
12. **Free-action icon row** (packs / grade / buy / post) → their own
    individual flows

## Destination screens

### 1. Wallet / cash ledger

The Cash tap target's destination. Answers one question: where did my
money go, and where did it come from.

**Layout, top to bottom:**

1. Current cash balance, large, monospace — the same number shown on
   the home hub. There is no separate wallet-side balance calculation;
   the balance is the running sum of the ledger below, one source of
   truth.
2. **A rolling in/out summary** ("This week": money in, money out, net),
   so a player never has to reconstruct their own cash flow by
   scrolling and adding up the ledger by hand. Directly under it, a
   **"Where it went" breakdown** of money out by category (sealed
   product, upgrades, grading fees, authentication), each as a labeled
   bar sized by its share of total spend. This is what answers "why am
   I losing money" without the player having to work it out — a net
   loss reads very differently next to a breakdown that says it is
   mostly one-time buys (a box, an upgrade) versus one that shows
   steady bleed across categories that recur every week.
3. A ledger, most-recent-first, of every cash-affecting event: signed
   amount, a one-line category label, and the day-tick it happened on.
   Each entry is a tap target into its own detail screen (a sale, a
   grading submission, a sponsor deal), same tap-through philosophy as
   the hub itself.

**Ledger categories:**

- Cash in: a sale (singles or sealed, any channel), a sponsorship
  payout, live-stream tips, a consignment sale.
- Cash out: a sealed-product purchase, a grading fee, an authentication
  fee (see [14-counterfeit-risk.md](14-counterfeit-risk.md)), an
  upgrade purchase (see [09-upgrades.md](09-upgrades.md)).

**Pending entries update in place, they do not duplicate.** A grading
submission posts as an expense immediately (fee paid), tagged
"pending." When the card's result comes back after its real
calendar-day turnaround (see
[10-grading.md](10-grading.md#turnaround)), that same ledger line
updates to show the outcome — it does not spawn a second entry. This is
what "shows up in the recent-activity feed once the card returns" means
in the grading doc.

**Relationship to the home hub's Recent Activity tap target:** the
Wallet ledger is a cash-only filtered view of the same underlying
activity log the hub's "Recent activity" target opens in full. Every
Wallet entry also appears there; the full Activity log additionally
carries non-cash events (a post going up, a stream starting or ending).
No separate data source to keep in sync — one log, two filtered views
of it.

**New player state:** the ledger opens with a single entry, starting
capital, so the balance is never a bare unexplained number.

**The in/out summary's period is switchable**, a Week/Month segmented
toggle right on the card, not a fixed window. Switching it recomputes
the money in/out/net figures and the "Where it went" breakdown for
that period — the same underlying categories as the ledger, no new
category taxonomy needed. This is deliberately useful beyond a single
bad week: a week that dipped from one-time buys can sit inside a month
that is still trending up, and the toggle is what lets a player tell
the difference instead of panicking at a single red number.

### 2. Buy screen — decisions recorded, mockup not started

The "buy" icon in the hub's free-action row opens this screen. The
player buys sealed product online here (see
[12-acquiring-product.md](12-acquiring-product.md#online--five-storefronts-five-tradeoffs)).

**Decided:**

- **Storefronts**: Pokemon Center, Amazon, Hyped Reseller, eBay, and
  Facebook Marketplace. Each storefront has different behavior, so
  each one needs its own layout.
- **Navigation: a store list, then a store screen.** The buy screen
  is a list of storefronts. Each row shows one live status line, for
  example a live Pokemon Center drop. A tap on a row opens that
  store's own screen. The screen does not use tabs, because the
  stores do not share one layout.
- **Locked channels do not show.** Distributor/wholesale and case
  splits appear only after the player unlocks them. The screen shows
  no locked rows.
- **No counterfeit-risk display.** No storefront shows risk (see
  [14-counterfeit-risk.md](14-counterfeit-risk.md#risk-is-hidden-at-purchase)).
- **A purchase goes straight to Inventory.** The screen offers no
  "open now" choice. The rip-or-hold decision happens in Inventory.
- **Camping is not on this screen.** Camping is an event, not a
  storefront.
- **Collector items** (for example, the Mega Charizard X UPC and the
  Prismatic Evolutions SPC) appear in the storefront catalogs, next to
  packs, boxes, and cases.
- **Online | Local toggle.** A segmented toggle at the top of Buy
  switches between the online store list and the local store list.
  Camping, garage sales, meets, and shows stay hub events, not rows on
  this screen.
- **The local list plans a store run.** The player selects stores,
  sees the total trip time, and starts the run. The run goes stop by
  stop: each stop shows the shelf, then the player buys or moves on. A
  summary closes the run. The local game shop row also opens the
  shop's own screen (standing, holds, preorders, the singles display
  case, and events).
- **A Pokemon Center drop** gives one attempt per drop. A miss shows
  as the result of that attempt. The screen shows no upcoming drops,
  because drops come with no notice.
- **eBay shows the seller rating.** A player can use it as a warning.
- **Facebook Marketplace listings show the pickup day.** A pickup
  costs time, and some pickups happen on a later day.

**Open:**

- The lo-fi mockup of the store list and the store screens needs
  review.

## What's next

The buy screen (above) is next. The proposed order after it:
Inventory / collection, where bought product arrives and the
rip-or-hold decision happens, then the pack-opening flow. The
remaining destination screens follow.
