# PokéVendor — 10-Agent Playtest Findings (2026-06-03)

Ten playtesters each played through a different lens of "vendor life" (ripper,
grader, show-circuit vet, haggler, flipper/economy, home-flipper, growth/upgrades,
new-player UX, exploit-hunter, collector). Below: bugs already FIXED, the
improvement backlog (NOT yet implemented), and the over-claims that were checked
and rejected.

---

## ✅ Bugs fixed in this pass

1. **14 chase cards were mechanically dead** — `ACE SPEC Rare`, `Black White Rare`,
   and `MEGA_ATTACK_RARE` were missing from `RARITY_ORDER`, so they ranked as
   Common: never flagged as hits, never celebrated, rendered with the gray Common
   border, and sorted at the bottom of the Price Guide. Added all three to
   `RARITY_ORDER` (engine.js) and `RARITY_COLOR` (CardTile.jsx).
   *(Making them pullable from sealed packs is a separate improvement — see backlog.)*
2. **Loupe broke the grade curve** — `Math.random() - luck` made PSA 4–7 literally
   impossible with the loupe. Reworked `rollGrade` to shift each cutoff
   proportionally; loupe now bumps PSA 10 (~10%→~13%) without erasing the tail.
3. **Condition cap collapsed all variance** — Damaged cards always graded exactly
   PSA 4, Moderately Played graded PSA 6 ~94% of the time. Capped cards now spread
   realistically *below* the cap (DMG → PSA 1–4, MP → PSA 3–6, LP → PSA 5–8).
4. **`grade.fee` recorded list price**, not the loyalty-discounted fee actually
   paid. Now threaded through `submitGrade` → pending record → `rollGrade`.
5. **Black Bolt Victini #171** was labelled `Rare` at $573.55 (won't celebrate as a
   hit, blue border). Relabelled `Special Illustration Rare`.
6. **Show encounters fired instantly on entry** — `lastEncounterRef` started at 0,
   so the cooldown window was already open on the first tick. Seeded with mount
   time so there's a grace period to look around before the first walk-up.
7. **Notoriety bar clipped high tiers** — Invitational (150) and Worlds (280) both
   pinned at 100% and overlapped. Bar now scales to the highest tier requirement.
8. **CardModal had no visible close + Escape didn't work** — added a ✕ button and
   an Escape-key handler (backdrop-click already closed it).
9. **favicon 404** — added `<link rel="icon" href="./icon.svg">`.
10. **README self-contradiction** — Brick-and-Mortar listed as both $400 and $8,000.
    Corrected to $8,000 (matches code).
11. **Defensive guard** — `submitGrade`/`gradingFee` now no-op on an unknown tier
    key instead of throwing (would have bricked grade resolution on a bad save).

### Data / realism pass (2026-06-03)
12. **Chase rarities are now pullable** — added an `aceSpec` slot (~1 in 5 packs in
    sets with an ACE SPEC subset, e.g. PE) and a `chase` table for
    `MEGA_ATTACK_RARE` (~1 in 111) and `Black White Rare` (~1 in 250). Verified by
    5,000-pack simulation: ACE ~20.8%, MEGA-ATK ~1/167, BW ~1/208. Also added both
    to `topRarityPool` so god packs can use them.
13. **Special-foil multipliers corrected** — Master Ball 6× → **55×** (real ~40–80×),
    Poké Ball 1.6× → **3×** (real ~2.5–4×).
14. **Reverse-holo premium now scales by rarity** (`reverseMult`): Common 1.05×,
    Uncommon 1.10×, Rare 1.40×, Rare Holo 1.50×, fancier 1.30× — replacing the flat
    1.4×.
15. **Packs are now 10 cards** (4 common + 4 uncommon + reverse + rare), up from 9.
16. **PSA 10 multiplier 4× → 5×** for high-demand modern chases.
17. **Card-count labels disambiguated** — Shop now reads "131 numbered / 180 total";
    Price Guide dropdown reads "(180 total)".
18. **`2★` → "ex"** for Double Rare; added short labels for ACE / M-ATK / BW too.
19. **3-Pack Blister `+promo` removed** — real SV 3-packs ship a fixed coin/energy
    card, not a hit-tier promo. Fixed in the classifier and patched in live data.
20. **Prices re-fetched** — ran `fetch-data.mjs`; 508 card prices refreshed from live
    TCGplayer / TCGCSV.

---

## 💡 Improvement backlog (NOT implemented — awaiting your call)

### Grading (grader)
- **Subgrades shown on every grade** — real PSA only subgrades 9/10; this is
  BGS-style. Either gate subgrades to 9/10 or rename to "BGS-style".
- **Economy fee $30** vs real PSA ~$20 (makes early-game grading pointless until
  cards clear ~$50). Consider $18–25 base.
- **Crack-a-slab** mechanic (regrade gamble, small chance to come back lower),
  **bulk submission discount**, and **per-card grading history** on the modal.
- **Warn when grading fee > card value** before the player wastes a fee.

### Shows / floor (show-circuit vet + haggler)
- **Encounter frequency is too high** even after the cooldown fix — consider capping
  at ~3 walk-ups per show and/or a longer base cooldown.
- **Vendor & venue name collisions** — two "Rip City" tables / same venue twice in a
  month. Pick names without replacement per show.
- **Visitor flavor ↔ encounter-kind mismatch** — a "just got fleeced" visitor can
  present a price quiz. Pick the visitor name inside each encounter branch.
- **Offers use payment methods the player can't accept**, failing only at resolution
  ("Sale lost"). Pre-filter to accepted methods, or soften ("OK paying by card").
- **5 booths at a Local Meetup feels empty** (real meetups: 15–30). Scale booth
  counts and differentiate hall layouts by tier (tight room vs convention floor).
- **All shows at notoriety 0 are Local Meetups** — show 1–2 locked higher-tier shows
  on the calendar as aspirational targets.
- **Lowballer/fleecer accepts market in round 1** — archetype doesn't deliver its
  vibe. Add a "pride walk" when the player counters at/near market on round 0.
- **Surface `arch.vibe`** in the booth popup before the player commits to haggling.
- **Haggle dialogue variety** — 4–5 line templates per side instead of one.
- **Show-floor keyboard interact** — add Enter/Space to bump an adjacent booth
  (desktop currently requires a mouse click on the tile).
- **Haggle Offer-button disabled logic** (Haggle.jsx:83) is a convoluted ternary —
  on the sell side it's never disabled. Minor UX tidy.
- **NPC↔player collision** — NPCs can walk through the player avatar.

### Home shop / orders (home-flipper)
- **New-player order drought** — at notoriety 0, online order chance is ~1-in-12
  days; players can go 10–15 days with nothing. Guarantee ≥1 order in the first
  few days.
- **Inbox fill indicator** (e.g. "3/8") and **missed-order estimate** on show cards
  ("~1–2 online orders may arrive while you're away").
- **Show-attendance confirmation** — `attendShow` charges the fee and burns days
  immediately with no confirm. Risky on the portrait/mobile layout (fat-finger).
  Add an "Attend for $X? Passes N days, miss home orders without a Smartphone."
- **Cash shown as a locked method on the online Orders tab** — online buyers never
  pay cash; hide it until a storefront exists.

### Economy (flipper + exploit-hunter)
- The core sell-path arithmetic was independently verified CORRECT (quick-sell 80%,
  list −5%, consign 1.05–1.20× −12%, buylist 55%, condition scaling, processing
  fees). No money exploits reachable through normal play.
- **Sub-$0.30 card-rail sale nets $0** (fee ≥ gross). Not wrong, but consider
  rejecting it or auto-suggesting a fee-free rail.
- **Listing slider `min="0.8"`** contradicts the "market or higher" copy — align the
  copy ("from 80% of market") or raise the min to 1.0.
- **Save integrity** — on load, dedupe any uid appearing in more than one of
  collection/pendingGrades/listings/consignments (only matters if leaderboards land).

### Upgrades (growth)
- **Glass Cases +12% bump** applies to `sellOwned`/`browseSale` but not
  `sellMint`/`counter`. Judgment call — should a buyer paying you always benefit
  from the display case? (Left unchanged pending your call.)
- **Charity Banner** boosts ALL notoriety gains, not just generous acts; **Dealer
  Network** description omits the (useful) OVER-price warning. Tighten copy.
- **No purchase feedback** — buying an upgrade only flips the button to "Owned";
  add a toast.
- **`resolveGrades` 1s interval runs unconditionally** even with no pending grades —
  cheap to guard; reduces idle re-render churn.

### New-player UX
- **No onboarding** — a first-time tooltip/highlight sequence ("Buy → Rip → Sell →
  Next day") and a "?" on notoriety explaining what it drives.
- **Mobile nav affordance** — the tab strip *does* scroll (`overflow-x:auto`) but
  there's no visual cue and the brand/balance siblings crowd it at 390px. Add a
  scroll hint or condense to icons.
- **Tooltips** for `RH` (reverse holo), Booster vs Sleeved Pack, "Orders (1)".

---

## ❌ Reported but NOT bugs (checked against source, rejected)

- **"Tab nav drift / Shows→Orders / active class one off / accidental show
  attendance / ghost $4,980 drain / packsOpened stays 0"** — all artifacts of
  Playwright's `getByRole().click()` resolving stale refs and firing on the wrong
  element during the 1s re-render, plus one agent's own localStorage injection.
  App.jsx drives the active class and the rendered tab from a single `useState`;
  they cannot diverge. `PackOpening.jsx` does call `addPulls` on the single-pack
  path. Several agents diagnosed this themselves.
- **"Haggle step frozen at round 0"** — `step` is a normal `const` recomputed every
  render from the current `their` state; it tracks counters correctly.
- **"Encounter backdrop missing stopPropagation is a bug"** — Encounters are
  intentionally non-dismissible (must pick an option); the missing backdrop handler
  is by design, not a defect.
- **`gradedValue` double-applying condition** — the `!card.grade` guard already
  skips condition mult for graded cards. (The reporting agent retracted it.)

### Data/realism claims checked against a fresh fetch (2026-06-03) and rejected
- **"Prime Catcher ACE SPEC priced $0.47, real ~$25–30"** — wrong. Live TCGplayer
  market for PE #119 really is ~$0.49. The $25–30 card is the gold Hyper-Rare
  printing (#168), which isn't in this 131-numbered snapshot. Data already correct.
- **"PE Hyper Rares are the wrong cards (Temporal Forces)"** — wrong. pokemontcg.io
  itself classes Iron Leaves / Teal Mask Ogerpon / Walking Wake / Terapagos ex as
  PE's Hyper Rares. The gold Eeveelution full-arts the note wanted are PE's SIRs
  (correctly classed — Umbreon ex SIR is $1,565).
- **"PE Surprise Box is fabricated"** — wrong. It's a real TCGCSV SKU (tcgId 593466).
- **"PE Booster Bundle is 6 packs not 10"** — already 6 in both code and data; stale.
