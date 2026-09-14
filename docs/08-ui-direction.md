# UI Direction

## Status

Two screens designed and approved: the home hub, and its Wallet / cash
ledger destination (see below). The buy screen has a reviewed lo-fi
mockup. Inventory has a reviewed lo-fi mockup. The social media hub has
a reviewed lo-fi mockup. The live stream has recorded decisions and no
mockup. Mockups live
outside this repo for now, in
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
2. **Followers** → Social media hub (the slot shows "Start posting"
   until the player creates an account; the Go Live row and the post
   icon stay hidden until then, see
   [06-social-media.md](06-social-media.md#social-media-is-optional))
3. **Reputation** → Reputation & meets
4. **Collection** → Inventory / collection (the target shows
   collection value, which counts only kept items)
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
  payout, live-stream tips, a consignment sale, a paycheck from the
  day job (see [16-time-and-day.md](16-time-and-day.md#the-day-job)).
- Cash out: a sealed-product purchase, a grading fee, an authentication
  fee (see [14-counterfeit-risk.md](14-counterfeit-risk.md)), an
  upgrade purchase (see [09-upgrades.md](09-upgrades.md)), rent (see
  [16-time-and-day.md](16-time-and-day.md#rent)).

**Pending entries update in place, they do not duplicate.** A grading
submission posts as an expense immediately (fee paid), tagged
"pending." When the card's result comes back after its turnaround in
game days (see
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

**Store credit is not in the Wallet.** Store credit at a local game
shop is not cash. The player sees it on that shop's own screen (see
[15-selling.md](15-selling.md#store-credit)).

**The in/out summary's period is switchable**, a Week/Month segmented
toggle right on the card, not a fixed window. Switching it recomputes
the money in/out/net figures and the "Where it went" breakdown for
that period — the same underlying categories as the ledger, no new
category taxonomy needed. This is deliberately useful beyond a single
bad week: a week that dipped from one-time buys can sit inside a month
that is still trending up, and the toggle is what lets a player tell
the difference instead of panicking at a single red number.

### 2. Buy screen — decisions recorded, lo-fi mockup reviewed

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
- **An online purchase ships.** The player pays at purchase. The item
  shows in Inventory as "On the way", with the days left, and arrives
  after its delivery time (see
  [12-acquiring-product.md](12-acquiring-product.md#where-bought-product-goes)).
  Each store screen shows its delivery time. A store run purchase goes
  to Inventory at once. The screen offers no "open now" choice. The
  rip-or-hold decision happens in Inventory.
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
  shop's own screen (standing, holds, the singles display
  case, and events).
- **A Pokemon Center drop** gives one attempt per drop. A miss shows
  as the result of that attempt. The screen shows no upcoming drops,
  because drops come with no notice.
- **eBay shows the seller rating.** A player can use it as a warning.
- **A Facebook Marketplace listing is for pickup or for shipping.** A
  pickup listing shows the pickup day and the trip time. A pickup costs
  time, some pickups happen on a later day, and the player pays at the
  pickup. A shipped listing shows the shipping cost and the delivery
  time. The player pays at purchase, and the item arrives after the
  delivery time.
- **A later-day pickup goes on the calendar.** The item goes to
  Inventory after the pickup.
- **The Pokemon Center sells only in drops.** When no drop is live,
  the store screen has nothing to buy, and its store list row says
  "No drop live".
- **eBay and Facebook Marketplace sell singles too**, not only sealed
  product.
- **The local list shows both game shops.** Each shop row has its own
  "Shop" link.
- **The game shop screen** shows the standing level and points, the
  store credit, holds with the days left to pick them up, the singles
  display case, and league night. It shows no preorders and no
  prereleases (see
  [17-calendar-and-events.md](17-calendar-and-events.md#no-new-set-releases)).
- **The game shop stop on a store run** shows the holds, the shelf, and
  a "Sell to the shop" row. The player pays with cash or with that
  shop's store credit.
- **The store run summary** shows the standing that the run earned at
  each game shop.

**Mockup:** the lo-fi mockup is the "PokeVendor Buy Screen" Claude
Design canvas. The review on 2026-09-13 removed preorders from the game
shop screen and added the screens for no drop, a later-day pickup, and
the game shop stop.

### 3. Inventory — decisions recorded, lo-fi mockup reviewed

The hub's Collection target opens this screen. Bought product arrives
here, and the rip-or-hold decision happens here.

**Decided:**

- **Four tabs: Sealed, Raw, Slabs, and Bulk.** Each tab holds one item
  type and uses one row layout.
  - **Sealed** holds packs, boxes, ETBs, collections, and collector
    items such as UPCs and SPCs. It also holds the loose packs that
    come back from a product with a broken seal (see
    [18-ripping.md](18-ripping.md#sealed-products-in-the-rip)).
  - **Raw** holds ungraded cards: hits from a rip, promo cards from a
    product, and bought singles.
  - **Slabs** holds graded cards.
  - **Bulk** holds the bulk groups. Each rip adds one bulk group (see
    [18-ripping.md](18-ripping.md#the-summary)).
- **A portfolio header** sits above the tabs. It shows the market
  value, the amount paid, and the unrealized gain or loss for all of
  Inventory. It has the same value / paid / net shape as the rip
  summary.
- **An away item stays in its tab with a status tag.** An away item is
  an item that the player owns but does not hold. The tags are:
  - "On the way", with the days left (see
    [12-acquiring-product.md](12-acquiring-product.md#where-bought-product-goes)).
  - "At PSA", "At BGS", or "At CGC", with the days left (see
    [10-grading.md](10-grading.md#turnaround)).
  - "Listed", with the channel, for example "Listed · TCGPlayer".
  - "Consigned", with the shop name (see
    [15-selling.md](15-selling.md#the-local-game-shop)).

  The player cannot rip, sell, or grade an item with a status tag.
- **A Keep flag marks the personal collection.** The player marks an
  item as Keep. A kept item stays in its tab with a Keep tag. A "Kept"
  filter shows only the kept items. Sell flows and the rip queue do not
  offer a kept item. The portfolio header counts kept items, because
  they are still assets.
- **A sealed row shows the sealed market price and the amount paid.**
  It does not show the expected value of opening the product. An
  upgrade adds the expected value to each sealed row (see
  [12-acquiring-product.md](12-acquiring-product.md#the-expected-value-upgrade)).
  Until then, the math is a player
  skill (see
  [05-pricing-and-market.md](05-pricing-and-market.md#sealed-product--separate-pricing-logic)).
- **Select mode works on every tab.** The actions for a selection
  depend on the tab:

  | Tab | Actions |
  | --- | --- |
  | Sealed | Rip, Keep |
  | Raw | Sell, Grade, Keep |
  | Slabs | Sell, Keep |
  | Bulk | Add to store run |

  "Rip" sends the selection to the rip queue (see
  [18-ripping.md](18-ripping.md#the-rip-queue)). "Grade" puts all the
  selected cards in one grading submission. "Add to store run" puts
  the selected bulk groups in the "Sell to the shop" row of the next
  game shop stop. The sale itself happens at that stop.
- **A tap on a row opens a full detail screen**, not a modal. The
  detail screen for a card shows the card image, the raw price, the
  graded prices, the four subgrades, the status, and the actions. The
  graded prices are PSA 10, PSA 9, CGC 10, and CGC 9, the same as on
  the rip screen (see
  [18-ripping.md](18-ripping.md#money-on-the-rip-screen)). The
  subgrades show what the player knows (see
  [10-grading.md](10-grading.md#eyeball-vs-paid-reveal-vs-permanent-upgrade-for-every-subgrade)).
- **A pulled card has no amount paid of its own.** The portfolio
  header counts the price of the opened product once, in the amount
  paid. A pulled card's row shows "pulled" in place of a gain. A
  bought card's row shows its gain.
- **The "Kept only" filter is a checkbox** at the top of the list on
  the Sealed, Raw, and Slabs tabs.
- **Collection value counts only kept items** (see
  [03-currencies.md](03-currencies.md#collection-value)). Stock for
  sale is future cash, not collection. The hub's Collection target
  shows collection value. The portfolio header shows all of
  Inventory.
- **Each tab sorts newest first.** A sort control changes the order
  to highest value or to set order.
- **The detail screen for a sealed item** shows the product image,
  the contents (for example, 9 packs and 1 promo card), the sealed
  market price, the amount paid, and where the item came from. With
  the expected-value upgrade, it also shows the expected value. It has
  Rip and Keep buttons.
- **The detail screen for a bulk group** shows the rip that made the
  group and the day of that rip. Then it shows the cards grouped by
  rarity, with the counts and the total value.
- **The player removes a listing from the item detail screen.** The
  status box of a listed item shows the listing and a "Remove
  listing" button. The item stays in its tab, and the Listed tag goes
  away.

**Open topics:** none.

**Mockup:** the lo-fi mockup is the "PokeVendor Inventory Screen"
Claude Design canvas. It shows the four tabs, select mode on Sealed
and Raw, the expected-value upgrade, the card detail screen, and the
detail screen for a card at a grader. The review on 2026-09-13
approved it. The decisions on collection value, sort order, the sealed
and bulk detail screens, bulk on a store run, and removing a listing
came after the review. The mockup does not show them yet.

### 4. Social media hub — decisions recorded, lo-fi mockup reviewed

The hub's Followers target opens this screen. Social media is
optional (see
[06-social-media.md](06-social-media.md#social-media-is-optional)).

**Decided:**

- **Before the player has an account**, the screen shows only account
  creation. The player types a handle. The account starts with 0
  followers.
- **One scroll with sections**, top to bottom:
  1. The follower count, the follower tier, and the next unlock (see
     [04-reputation-and-followers-unlocks.md](04-reputation-and-followers-unlocks.md#follower-tiers)).
  2. A "New post" button.
  3. An inbox with sponsor offers and follower tips.
  4. Recent posts, with their results.

  The screen is calmer than the home hub.
- **A post shows its views and the followers it gained or lost.** The
  reach formula stays hidden.
- **The analytics upgrade** adds the likes and the reach factors
  (content quality, timing, and luck) to each post. It also adds a
  burnout meter and an authenticity meter to this screen (see
  [06-social-media.md](06-social-media.md#the-analytics-upgrade)).
  Without the upgrade, the player sees only falling reach.
- **A quick post starts in three places:**
  - "New post" on this screen. The player picks a type (pull reveal,
    collection flex, hot take, show promo, or for sale), then an
    item. A hot take needs no item.
  - A "Post" action on the item detail screen in Inventory. The
    player picks the type (collection flex or for sale), then sees a
    confirm screen with a Post button.
  - "Post this pull" on the rip summary. The type and the item are
    known, so it opens the confirm screen at once.
- **A show promo attaches to a card show.** The player picks a card
  show from the calendar, not an Inventory item. What the promo does
  at the show is part of the card show design (see
  [17-calendar-and-events.md](17-calendar-and-events.md#scheduled-entries)).
- **A sponsor offer is an inbox card.** The card shows the brand, the
  pay, the number of paid posts, and the days to make them. The player
  accepts or declines. Accept adds the paid posts as tasks. A missed
  deadline cancels the deal and costs authenticity.
- **A follower tip is an inbox card that reveals a hidden garage
  sale.** The card shows the place, the day, and a one-line hint, for
  example "Old binders". "Add to calendar" puts the sale on the
  calendar (see
  [17-calendar-and-events.md](17-calendar-and-events.md#hidden-garage-sales-from-follower-tips)).
- **A for-sale post shows its result in three places:**
  - The post's row in recent posts shows "Sold $X" after the sale.
  - The card in Inventory has a "Listed · Social" tag until it sells.
  - The sale is an entry in the Wallet ledger.

  The post stays listed for 4 weeks, the same as every listing (see
  [15-selling.md](15-selling.md#listing-time)). If the card does not
  sell, the row shows "No sale" and the tag goes away.

**Open topics:** none. The live stream screens are section 5.

**Mockup:** the lo-fi mockup is the "PokeVendor Social Media Screen"
Claude Design canvas. It shows account creation, the hub, the hub with
the analytics upgrade, and the two New post steps (pick a type, then
pick an item). The review on 2026-09-13 approved it. The decisions on
follower tips, for-sale results, the confirm screen, and show promos
came after the review. The mockup does not show them yet. Its
follower tip card is a placeholder.

### 5. Live stream — decisions recorded

The hub's Go Live row opens the setup screen. The row shows only if
the player has a social media account (see
[06-social-media.md](06-social-media.md#social-media-is-optional)).
The stream rules are in
[06-social-media.md](06-social-media.md#live-streams-time-cost-action).

**Decided:**

- **The setup screen** picks the length (2 or 3 hours), the products
  and cards for the stream, and the start: now, or a later day on the
  calendar.
- **The stream screen is live, and it has no skip.** At any time, the
  player rips a product, gives away an item, auctions a card, offers a
  Buy Now sale, shows a card, or talks to chat.
- **End** stops the stream early. The unused hours go back to the day.
- **The summary** shows the peak viewer count, the tips, the Whatnot
  results and fees, the pulls, and the followers gained or lost.

**Open topics:** none.

**Mockup:** none yet.

## What's next

The buy screen, Inventory, and the social media hub (above) have
reviewed lo-fi mockups. The live stream has recorded decisions and no
mockup. The remaining destination screens follow.
