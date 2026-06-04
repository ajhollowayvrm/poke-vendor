# 🃏 PokéVendor — Rip · Grade · Sell

A single-player vendor simulation: buy sealed Pokémon product, rip packs with an
animated reveal, price your hits at real market value, send the gems off for
PSA-style grading, and sell for profit. Built for personal, non-commercial play.

## Data
Real sets, cards, rarities, images, **TCGplayer/Cardmarket prices**, and **real PSA
graded sale comps** (eBay medians, used for graded card values) come from
**[pokemon-api.com](https://www.pokemon-api.com)** via RapidAPI. The Japanese-only
**Abyss Eye** set has no English release on any API, so it's built from the free
[TCGCSV](https://tcgcsv.com) Japanese export (category 85); TCGCSV is also a per-field
price fallback. A snapshot ships in `src/data/sets.json` (modern + vintage sets).

The build needs a RapidAPI key for pokemon-api.com. Provide it either way:
```bash
# option A: env var
POKEMON_API_KEY=your-key npm run fetch-data
# option B: drop it in a gitignored file (no env needed), then just run the build
echo -n 'your-key' > scripts/.pokemon-api-key
npm run fetch-data
```
`scripts/.pokemon-api-key` is gitignored — never committed. Rotate the key on RapidAPI
if it's ever exposed. (Live in-browser price refresh still uses pokemontcg.io.)

## Run it
```bash
npm install      # first time only
npm run dev      # opens http://localhost:5179
```

## How to play
1. **Shop** — each set sells its **real sealed product lineup** at **live TCGplayer market prices** (via the free [TCGCSV](https://tcgcsv.com) bulk export, baked into the snapshot): Booster Pack, Sleeved Pack, 2-/3-Pack Blister, Mini Tin, Booster Bundle, Elite Trainer Box, Premium / Super-Premium Collection, Surprise Box, Booster Box — whatever that set actually has. Each rips into its true pack count; ETBs/tins/blisters/premiums add a guaranteed promo (🎁). A single booster pack opens the animated rip. Multi-pack products rip instantly into your collection by default — or, with **Settings → Open multi-pack product one pack at a time** turned on, you crack each pack individually with the full reveal (and a **⏩ Skip rest** button to fast-forward whenever you've had enough). You start with $2,000 of seed capital. Ripping sealed is realistically **-EV** — the chase is the point.
2. **Rip** — click the pack to tear it open; cards reveal one by one with a **three-panel layout**: a **Now revealing** callout on the left names every card as it lands (art, rarity, value), the cards fill the centre, and a running **Hits** list on the right tallies every hit/foil of the whole rip. Cards have a subtle pointer-tracked 3D tilt on hover; **rarity is shown by the card's border colour** (common → gray, up through gold/pink for the chases) so the artwork is never covered. Tune the experience in **Settings → Rip speed** (Slow / Normal / Fast / Turbo) and **Auto-open next pack** (in one-at-a-time mode, auto-rips the next pack a few seconds after each finishes).
   - **Special foils** (Prismatic Evolutions & Black Bolt): a card in the reverse slot can come as a **⦿ Poké Ball Foil** (~1 in 3, 1.6× value) or, in Prismatic, a chase **◉ Master Ball Foil** (~1 in 19, **6× value**) — each with its own badge and border colour, called out in the side panels as it reveals.
   - **GOD PACKS** 🎉: ~1 in 2,500 Prismatic/Black Bolt packs is a god pack where **every one of the 10 cards is a top-rarity hit** — longer suspense shake, a rainbow "GOD PACK!!" banner, a glowing reveal row, and a sustained confetti finale.
3. **Collection** — split into **Raw** and **Graded** tabs; clean borderless art. Every card is valued at live market price. Click a card to move it three ways:
   - **Quick sell** — instant cash, but only **80% of market** (TCGplayer-style convenience tax). Bulk commons can be quick-sold or buylisted from the toolbar.
   - **List on your site** — pick an asking price with the quick **% buttons (80/90/100/110)** or a custom number. Real **customers browse** your listings as days pass: each buyer has a savvy level (casual → average → sharp → deal shark) that sets how far over market they'll pay. A fair price finds a willing buyer fast; an overpriced card just keeps drawing lookers and **never sells**. Your notoriety and the card's desirability widen how high you can push. Browsers who think it's a bit high may leave a lower **offer** you can accept or decline. Tick **🐦 Tweet it** to post the listing — a ~3-day hype window pulls extra Twitter-mutual eyes (and a notoriety bump). Manage it all on the **Sell** tab — views, offers, **reprice or pull** — minus a ~5% marketplace fee. Sales pay out as the days tick by. **Offers only come on cards you've listed/tweeted** — until you open a brick-and-mortar store, when in-person walk-ins can also make offers on anything in your case.
   - **Consign** — a service sells it in a few days for a bit **above** market, minus a 12% fee.
4. **Grade** — from a card's detail view, submit it to the grader (Economy/Standard/Express). Subgrades for centering/corners/edges/surface roll into a PSA 1–10. A 10 can 4× the value; low grades hurt. It's a gamble.
5. **Grader** — watch submissions resolve on a timer (grading "days" pass in ~1.2s each). Grading starts **expensive** ($30 / $60 / $130), but builds a **relationship**: total cards submitted climb a loyalty ladder (New → Bronze 5 → Silver 15 → Gold 40 → Platinum 100) that cuts fees 10% → 20% → 30% → 45% across all service tiers. The Grader tab shows your tier, progress to the next, and current discounted fees.
6. **Stats** — net worth, cash, collection value, realized P/L, notoriety, packs opened, cards/hits pulled, **best pull & best foil ever**, **god packs hit**, cards graded, shows attended, wants filled, goals completed, cards owned — plus the full transaction ledger.

### Card shows (the big mode)
7. **Shows** — a 30-day calendar of card shows across tiers (Local Meetup → Card Shop Event → Regional → National Expo → **Invitational** → **World Championship**). Higher tiers unlock with **notoriety**; bigger shows have higher-value stock (the elite tiers reach **$50k** and up to **$1M** "grail" cards) and more foot traffic. Pay an entry fee to attend (up to $2,500 for Worlds).
   - **Opportunity cost (time):** attending a show consumes its **days** — 1 day for a Meetup/Shop, 2 for Regional/National, 3 for an Invitational, **4 for Worlds**. The calendar jumps past the show, and any other shows that fell in that window are **missed**. Blow 4 days at a too-rich Worlds and whiff, and you've skipped every cheaper show those days — choose deliberately. The month auto-rolls a fresh calendar when day 30 passes.
8. **Walk the floor** — a 2D top-down convention hall **sized to the show**: a Meetup is a cozy 5-booth room; a World Championship is a 32-booth hall that fills the page (scroll to roam). Other shoppers (NPCs) wander the aisles — a handful at small shows, ~60 at Worlds. Move with **arrow keys / WASD**; bump a vendor booth to browse it. Booths are color-coded by archetype (fair / sharp / lowballer / high-roller / newbie).
9. **Vendor stock** — each booth carries a deep bin of 14–31 real cards, with its 1–3 priciest pieces called out in a **⭐ Showcase case** above the bulk bin. Newbies sometimes *misprice a gem*; the Dealer Network upgrade flags DEAL/OVER.
   - **Live rippers** 📦: ~30% of the crowd are cracking sealed product right on the floor (📦 over their head, a 💥 when they pop a pack). When one hits something big — a Special Illustration Rare or better, a Poké Ball / Master Ball foil, or a **god pack** — they **announce it to the whole hall**: a banner shows who pulled what (with the card), and everyone turns to look (~6% of rips). And if that lucky ripper **bought their sealed from your booth**, the hype rubs off — your notoriety bumps (+2, or +5 for a god pack), and the banner turns green to say so. The more famous you are, the bigger your share of the floor's rippers are running your product (≈10% at zero rep → ~55% once well-known).
10. **Encounters** — visitors walk up to your booth: lowball/fair **offers** on your cards, **questions** about card values (answer right to gain notoriety), browsers, and people who got **fleeced next door** — give them a card free to *make their day* (big notoriety). A cooldown spaces walk-ups so even the 600%-traffic Worlds floor doesn't spam you. Procedurally built from templates + real cards.
11. **Orders** — you start as a **solo online flipper working from home**: orders arrive **per game-day** from marketplaces and DMs (Reddit, eBay, Discord, etc.), scaled by notoriety. Hit **⏭️ Next day** on the Orders tab to pass a day and bring customers in (attending a show passes several days at once). No one shows up in person yet — open a store for that. Each order is the same encounter engine (offers, questions, price checks, helping someone who got scammed in a trade); the inbox is capped, so ignored orders eventually drop.
    - **Away at a show = home shop opportunity cost.** The days you spend at a show pass at home too. Without remote-management upgrades, the home orders generated during those days are **missed**: the **📱 Smartphone** keeps *online* orders coming while you're away, and the **🧑‍💼 Shop Assistant** (needs a store) handles *walk-ins*. The ledger tells you exactly what you missed.

### Going physical & payments
12. **Payment methods** — you start accepting **only Venmo**. Every buyer prefers a method; if you can't accept it, the sale falls through (small notoriety ding). Each rail is its own upgrade. **Cash** comes with the store. Online buyers use Venmo/PayPal/cards; in-person can also use cash and tap. **Processing fees:** card rails skim a cut of each sale (PayPal/Cards ~2.9%+$0.30, Tap ~2.6%+$0.10); Cash and Venmo are free. The result message and ledger show the net after fees — so an all-cash/Venmo flip keeps more than the same sale on plastic.
13. **Brick-and-Mortar Store** — the major mid-game upgrade ($8,000). Opens a physical shop: **in-person walk-in customers** start arriving (on top of your online orders), and you can accept **Cash**. Card *shows* stay open from the start regardless — the store is specifically about home/local foot traffic.
14. **Upgrades** — permanent buy-once gear, priced to scale with the real economy (cheap accessories in the low hundreds → the **Brick-and-Mortar Store at $8,000** as the major store-owner commitment): the three **payment rails**, **📱 Smartphone** + **🧑‍💼 Shop Assistant** (keep earning while at a show), Visitor Ticker (alerts at shows), Glass Cases (higher offers), Jeweler's Loupe (better grade odds), Signage (more traffic), Dealer Network (see vendor deals), Charity Banner (+50% notoriety from generosity). You'll need to grind sales before the big ones are in reach.
15. **Prices** — a reference price guide: pick any set and browse every card with its market value; search by name, sort by number / value / rarity. Shows the set's total value and chase card. Multi-day shows also re-roll their vendor floor each day — different booths and stock day to day.

### The dealer's craft
16. **Card condition** — every raw card has a condition: **NM / LP / MP / DMG**. Condition both **scales the card's value** (NM 100% → LP 72% → MP 45% → DMG 20%) and **caps the grade** it can earn (a Damaged card can never grade above PSA 4, MP ≤ 6, LP ≤ 8). Cards pulled from a sealed pack are **always Near Mint** — any flaws only surface as lower subgrades when you grade them; only cards bought off a show floor or bargain bin run rougher. A condition chip shows on any non-NM raw card, and the grader warns you before you waste a fee on a card that can't 10.
17. **Haggling** — at a show booth (and in your own sell flow) you don't have to take the sticker price. Open **Haggle** to make counter-offers across up to **3 rounds**: nudge your offer up or down and the other side either accepts, counters, or **walks away** — and how far they'll bend depends on the booth's **archetype** (a fair dealer meets you halfway; a sharp or a fleecer barely budges; a newbie folds easily). Push too hard and you lose the deal.
18. **Buylist & consignment** — two ways to move cards beyond a straight sale. **Buylist**: dump all your raw bulk to a shop's buylist instantly at ~55% of market — fast cash, no waiting. **Consign**: hand a card to a shop to sell *for* you; it sells over the next few game-days at a slight markup, and you collect the **net after their ~12% cut** when it moves (paid out on Next Day / when you return from a show).
19. **Want-list collectors** — recurring collectors post **wants** (a specific card, or any card from a set/rarity). Fill one from your collection and they pay an **above-market premium** plus a notoriety bump. Wants expire after a few days and refresh as you play; the richer your reputation, the more (and pricier) wants you attract.
20. **Daily goals** — each game-day rolls a fresh set of **2–3 goals** (rip N packs, sell N cards, grade a card, fill a want, attend a show, make someone's day, turn a profit…). Completing one pays out **cash + notoriety**, scaled by your reputation. They live on the Orders tab and rotate every day.

**Notoriety** drives everything: how many orders/walk-ins you get, which shows you can attend, vendor deals, want-list volume, daily-goal payouts, and how buyers treat you.

Progress auto-saves to your browser (localStorage). Reset from the Settings tab.

## Pull rates
The hit-slot rarity ladder (`scripts/fetch-data.mjs` → `HIT_SLOT`) approximates
modern Scarlet & Violet / Mega Evolution English booster pull rates:
Rare → Double Rare (ex) → Ultra Rare → Illustration Rare → Special Illustration
Rare → Hyper Rare (gold) → Mega Hyper Rare (chase). Tweak the weights there.

## Stack
Vite + React + Zustand. No backend, no tracking, all local.
