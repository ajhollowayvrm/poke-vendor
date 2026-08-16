# The Trade Gets Real — Design Plan

> Status: **SHIPPED 2026-08-15** — all 8 systems built in one batch, persist **v65**.
> Pure math in `src/game/population.js`, `misprints.js`, `lots.js`, `tax.js`, `loans.js` and
> `sealedgrading.js`; actions in `src/game/store/books.js` + `auctionhouse.js` (plus the
> grading lifecycle in `collection.js`); per-day work in `daytick.js`; UI in
> `components/AuctionHouse.jsx` + `Books.jsx` and additions to `CardModal`, `SealedModal`,
> `Bench`, `CardTile` and `ShowFloor`.
> Rails pinned by **sim sections 9–14** — `npm run sim` green, and a render smoke test drives
> every new surface end to end.

## The gap

The game had grown a very complete *business* and a very thin *market*. Look at what was
missing and a pattern appears — every one of them is a place where the world was passive:

- **Nobody competed with you.** A mispriced gem in a newbie's bin sat there for as long as you
  liked. You could walk a whole hall, price everything, and come back for the bargains — which
  is a shopping list, not a show floor.
- **You could only sell at auction, never buy.** `auctions.js` was sell-side only, leaving out
  the channel most real dealers actually source from.
- **A slab was one asset.** Grading was a pure odds roll: roll a grade, read the comp, done.
  Real dealers read the population report *first*, because a PSA 10 with 40 in the census and
  one with 9,000 are not the same thing.
- **A grade was final.** No cracking, no regrading, no cross-grading — the whole second half of
  the grading game was absent.
- **Every card was printed correctly.** An entire collecting category (errors) did not exist.
- **Sealed product could not be graded**, despite the game already appreciating vintage sealed.
- **Every dollar was tax free**, which quietly made the whole economy easier than the thing it
  models.
- **There was one form of credit** — a revolving distributor line sized off what you are
  already worth. Good for buying this week's cases, useless for buying a building.

## The through-line

Each of these adds **an adversary, an obligation, or a finer grain of value** — and every one
of them attaches to a system that already existed rather than standing beside it:

| System | Attaches to | What it makes newly decidable |
|---|---|---|
| 🏃 Floor competition | show floor, 🤝 Dealer Network | move now, or keep browsing |
| 🔨 Auction house (buy) | the sell-side auction math, 🔬 Auth Kit | which room is worth entering |
| 📊 Population reports | grading, 🔭 Grading Scope | *which* card is worth slabbing |
| 🔨 Crack & regrade | grading, the three graders | when a grade is worth arguing with |
| 🖨️ Errors & misprints | the pull → grade → sell loop | whether to slab a two-dollar common |
| 📦🔟 Sealed grading | vintage sealed appreciation | hold raw, or hold in a holder |
| 🧾 Quarterly tax | the payment rails, restocking | when to spend, and on which rail |
| 🏦 Bank loans | the $8,000 storefront | grind for it, or commit early |

---

## The systems

### 1. 🏃 Floor competition
Rival dealers work the hall alongside you and take the biggest genuinely under-market card
left in any bin. `pickSnipe()` in `shows.js` selects it; a timer in `ShowFloor.jsx` fires it
and the key lands in the same `activeShow.taken` set a purchase would.

Two rails keep it fair rather than annoying:
- **A grace period** (`SNIPE_GRACE_MS`) — you always get a real look around on arrival.
- **They only take genuine deals.** A fairly priced card is never sniped, so what you lose is
  exactly what you should have been quicker about.

Rate scales by hall (`SNIPE_RATE`), from barely-anyone at a meetup to a Worlds floor full of
people who do this for a living. This is what finally makes 🤝 Dealer Network *urgent* rather
than merely informative.

### 2. 🔨 The auction house (buy side)
A board of live lots on the Buy tab, settled by the day tick. Built on three real rules:
proxy bidding (**you pay one increment over the runner-up**, never your maximum), the room
sets the price (visible watcher count), and **a quiet lot is quiet for a reason**.

That last one is the whole design. Quiet lots carry a much higher chance of an optimistic
condition claim or a resealed wrapper — and 🤝 Dealer Network / 🔬 Authentication Kit are what
let you tell which is which. A 13% buyer's premium plus postage is what stops the channel
being free money.

**This is the one that needed real tuning**, and the sim did the tuning. A first pass ran
description risk at ~45% on quiet lots, which made *every* strategy a net loss — a trap rather
than a market. Section 11 now pins both bars at once: blind bidding returns ~$0.84 per dollar,
a disciplined bidder ~$1.08, and wins a fraction as often.

### 3. 📊 Population reports
A deterministic census per card and grade (`population.js`), with a scarcity multiplier on
graded value.

**THE RAIL:** `popMult` averages **exactly 1.0** across the catalog. It is built from a uniform
hash percentile, so the average card is unaffected and only the spread is new — grading stays
precisely as profitable a business as sim section 2 pins it, and what changes is *which* card
is worth sending. Sim section 9 measures that mean directly.

The player writes to the census too. Every slab that comes back adds one, held in engine module
state (like the living-market multipliers) rather than stamped on each card — a census is a fact
about the *card*, so slabbing another copy re-prices every copy you already own. That is what
makes "grade everything" the wrong answer.

### 4. 🔨 Crack & regrade
Break a card out of its holder and send it again — the play on an under-graded slab bought
cheap. Deferred once in an earlier playtest pass, and the reason it was hard is the reason it
is interesting: a naive version is a free reroll, and the correct strategy becomes cracking
every 9 forever.

**The fix is the honest one: a grade is EVIDENCE about the physical card.** `refineCut()`
revises the card's hidden cut toward what the grade implied, weighted by how many opinions it
has now had — so the estimate **converges**. Crack the same card four times and it stops
moving; it is simply what it is. On top of that a strong slab is worth more than the raw card
inside it (so cracking costs you up front), and ~5% of cracks nick the card. Cross-grading
falls out for free, because the company is chosen on the way back in.

### 5. 🖨️ Errors & misprints
A seven-entry ladder from off-centre to a wrong back, rolled once per pack in the `openPack`
wrapper (so no pack builder can forget it) and landing on a **uniformly chosen** card — which
is both how real errors turn up and what keeps the EV impact tiny.

Two details make it more than a multiplier: an error **sets its own dollar floor** (a miscut
common is worth what error collectors pay, not 3× ten cents), and it is worth **less raw than
authenticated**, which routes the category straight back into the grading loop.

**The rate is load-bearing.** Errors add value to a pack and sim section 1 requires every set
to stay -EV. The first pass at 1-in-550 contributed 1.6% of pack EV — too much of section 1's
headroom — so the rate is 1-in-1,250 and section 10 gates the contribution under 1%.

### 6. 📦🔟 Sealed grading
Send a box to 🟪 WATA or 🟨 CGC. The premium ladder is steep and then scaled hard by how modern
the product is: full for true vintage, half for retired product, **almost nothing in print**.
Grading this month's ETB is a mistake you are allowed to make, and the panel says so before you
pay. Vintage also rarely gems (a 25-year-old wrapper has lived somewhere), which is exactly why
an unsearched 10 is worth what it is.

Rides its own `pendingSealed` queue on the same day stamp as card grading, resolved by the same
`resolveGrades()` call so the two clocks cannot drift apart.

### 7. 🧾 Quarterly tax
Cash basis, because that is what a small dealer really files. Accrual happens in
`economy.spend/earn` — one place money is counted — folded into the `set()` they already make,
so the books cost no extra state write on any hot path.

Two consequences turn a toll into a decision:
- **Restocking before the quarter closes lowers the bill.** Not an exploit; it is what
  cash-basis accounting *is*.
- **The payment rails now cut both ways.** Audit exposure is modelled as a *profile of the
  business* (`cashProfile`) read off the rails you own, not tallied per sale — which is how an
  auditor really works, needs no bookkeeping the player cannot see, and required no call-site
  changes. Refusing to pay 2.9% keeps more of each sale and puts you in the bracket that gets
  looked at.

A quarter netting under $1,000 bills nothing, so the early game never meets the system. It
arrives when the business does.

### 8. 🏦 Bank loans
A fixed-term amortised note, distinct from the revolving distributor line. Three offers gated
by reputation and collateral, at rates that fall sharply as the business proves itself (36% APR
on the starter note down to 13% on the commercial one — a shop with no history does not get
prime money).

**The commitment is the daily instalment, not the interest.** Over 60 days a $5,000 note is
$86/day against a $40 rent — no term that short can accrue much interest, and the design leans
into that rather than pretending otherwise. Miss eight instalments and the note is called in:
the debt stands, reputation takes a real hit, and the distributor line freezes on top. Early
payoff clears only the remaining principal.

---

## Implementation notes worth keeping

- **Pricing hooks are guarded on the catalog.** `cardPopMult` applies only when the card id is
  in `CARD_BY_ID`, so synthetic fixtures — including the one sim section 2 measures grading EV
  with — price exactly as they did before. Section 9 asserts three different synthetic ids all
  value identically, which is a stronger check than a hardcoded number.
- **The census lives in engine module state**, pushed by the store and re-pushed on rehydrate,
  exactly like `setMarketMults`. Stamping counts onto each card would freeze every copy at the
  census it was born into and delete the whole mechanic.
- **`openPack` became a wrapper.** The misprint roll sits there rather than in each builder, so
  a future pack structure cannot silently omit it. God packs are the deliberate exception.
- **Borrowed money does not go through `earn()`.** It is a liability that happens to arrive as
  cash; booking it as revenue would tax the player on their own debt.
- **Rent is `spend(amount, { personal: true })`.** Where you live is not a business cost. It is
  the only exclusion, and the tax payment itself.
- **The auction board is seeded**, in both `initialState` and the v65 migration. An earlier
  version filled it on the first day tick, which meant the panel was invisible on a fresh save
  — and a system nobody can see is a system nobody uses. The render smoke test caught it.
- **The sim's auction gate uses a MEDIAN, not a mean.** Lot values are fat-tailed ($4 commons
  and $800 slabs on one board), so the aggregate value-per-dollar swung between runs and the
  gate was untrustworthy. The median per-lot outcome is stable across runs and is the better
  question anyway: on a typical win, did you do well?

## Also fixed in this pass

- `vite-node` was missing from `devDependencies`, so `npm run verify-slimsave` and
  `npm run audit-pulls` both failed on a clean install. Added.
- A batch of stale numbers in the README: seed capital, quick-sell rate, the consignment
  cut, the bulk exit, grading fees, the PSA-10 multiplier, foil multipliers, booth counts and
  the save backend had all drifted from the code, several of them changed by earlier fixes that
  were never written back.

## Deliberately not built

- **A misprint's own grading label.** Real graders print "MISCUT" on the flip; here the error
  premium simply resolves in full once the card is in any holder. A dedicated label would be
  cosmetic.
- **Buyer chargebacks on your own sales** — the one idea from this batch's shortlist that was
  cut. The inbound scam-deal chargeback in `sourcing.js` still runs one way only.
- **Decrementing the census when a slab is cracked.** A cracked slab really does leave the
  population, but tracking it would need per-copy census identity for a second-order effect.
