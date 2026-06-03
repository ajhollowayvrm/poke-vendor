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

### Shows / floor pass (2026-06-03)
21. **Walk-up frequency capped** — base cooldown 9s → **15s** and a hard **3
    walk-ups per show day** cap (tending your own booth via ★/Enter doesn't count).
    Cap + cooldown reset each show day.
22. **Name collisions eliminated** — vendor names and "City Venue" names are now
    drawn without replacement (seeded Fisher–Yates). Overflow vendors get a unique
    "II/III" suffix. Verified live: 16/16 unique booth names, all-unique venues.
23. **Visitor flavor matched to encounter kind** — "got fleeced/scammed" visitors
    only appear in the fleeced branch; everyone else draws from a neutral pool.
24. **Payment methods pre-filtered to what you accept** — buyers now prefer a method
    you can take, so deals stop dying at resolution with "Sale lost". Verified: a
    Venmo-only player saw 0/2419 non-Venmo in-person offers.
25. **Booth counts scaled up** — Meetup 5→**16**, up through Worlds 32→**72**, so a
    local meetup no longer feels like a ghost town.
26. **Aspirational locked shows on the calendar** — the next 1–2 still-locked tiers
    always appear as 🔒 targets even at notoriety 0. Verified live (Card Shop Event
    @15, Regional @40 shown locked at noto 0).
27. **Lowballer "pride walk"** — low-flex fleecers/sharps no longer fold to a
    near-market offer on round 0; they posture (a dedicated counter + line) and
    only deal from round 1. Verified: fleecer 0 accepts @round0, accepts @round1;
    fair dealer accepts immediately.
28. **Haggle dialogue variety** — 4 line templates per situation (open/accept/walk/
    counter, plus posturing lines for the pride walk), picked at random.
29. **Show-floor keyboard interact** — Enter/Space now bumps an adjacent booth /
    tends your own. Hint updated to "Enter or tap a booth to shop".
30. **Haggle Offer-button disabled logic tidied** — now simply `disabled={!better}`
    for both sides (was a sell-side no-op ternary).
31. **NPC↔player collision** — wandering NPCs no longer step onto the player's tile.
- **Surface `arch.vibe`** — already done: VendorBooth shows "This vendor is {vibe}…"
  above the Haggle button.

### Home shop / orders pass (2026-06-03)
32. **New-player order drought fixed** — track `onlineOrdersEver`; if you've never
    had an online order and you're within the first 5 days (home), guarantee your
    first one. Sim: avg days-to-first-order at noto 0 drops ~12.6 → ≤5 (forced in
    ~67% of fresh playthroughs). Persist v8 backfills the counter for old saves.
33. **Inbox fill indicator** — Orders tab shows `📨 Inbox N/8`, turning amber at
    "nearly full" / "full!" so you know orders will start dropping off.
34. **Missed-order estimate on show cards** — each unlocked show now shows the
    expected online orders over its run and whether they'd be missed (no 📱).
    Green "handled while away" if you have a Smartphone, amber warning if not.
35. **Show-attendance confirmation** — attending now pops a confirm with the fee,
    days passed, and the missed-orders warning before charging/burning days.
    Verified: declining leaves cash + day untouched.
36. **Cash hidden on the online Orders tab** — the "You accept" row no longer lists
    Cash (an in-person-only rail) until you own a storefront.

### Grading pass (2026-06-03)
37. **Subgrades gated to PSA 9/10** — the centering/corners/edges/surface breakdown
    only renders for grades ≥9 (matches real PSA; lower grades get just the
    overall). Verified live: PSA 6 shows no subgrades, PSA 10 shows all four.
38. **Economy fee $30 → $20** — early-game grading isn't pointless until cards clear
    ~$50 anymore.
39. **Bulk submission discount** — new Bulk-submit panel on the Grader tab: select N
    raw cards, get a per-card discount (3+ → 8%, 5+ → 15%, 10+ → 25%), stacking
    multiplicatively with loyalty. New `submitGradesBulk` action. Verified live:
    3 cards billed $18.40/ea = $55.20.
40. **Per-card grading history** — each card now carries a `gradeHistory`; the modal
    shows "PSA X · Tier · $Y fee" lines. (Array is future-proof for crack-a-slab.)
41. **Fee-vs-value warning** — when the cheapest fee ≥ the card's raw value, the modal
    warns "Grading costs more than this card is worth… not worth grading." Verified
    live on a $0.20 common.
- **Crack-a-slab** (regrade gamble) — deferred at AJ's call; not implemented.

### Upgrades pass (2026-06-03)
42. **Glass Cases now covers `counter`** — the +12% display-case bump applies to any
    sale of a card from your case (sellOwned, browseSale, AND counter). Left off
    `sellMint` by design — that's a give-at-cost kindness, not a display sale.
43. **Charity Banner gated to generous acts** — the +50% notoriety boost now only
    fires on genuinely generous acts (give-a-card-free, sell-at-cost to a burned
    buyer) via a `generous` flag on `addNotoriety`, matching its copy. Ordinary
    sales no longer get the boost.
44. **Copy tightened** — Dealer Network now mentions the DEAL/OVER price flags;
    Charity Banner spells out what counts as a generous act.
45. **Purchase feedback toast** — buying an upgrade now flashes "🪧 X unlocked — $Y
    spent." Verified live (Signage, −$150, button → ✓ Owned).
46. **Grade-resolve intervals guarded** — both the app-level 1s resolver and the
    Bench 250ms tick now only run while cards are actually at the grader (gated on
    `pendingGrades.length`), eliminating idle re-render churn.

### Economy pass (2026-06-03)
> Core sell-path arithmetic was already verified correct (quick-sell 80%, list −5%,
> consign 1.05–1.20× −12%, buylist 55%, condition scaling, fees) — no exploits.
47. **List-slider copy aligned** — the "List on your site" subtext now reads "from
    80% of market" (the slider min stays 0.8; selling below market for a faster/
    surer sale is a legit play). Verified live.
48. **Tiny-sale fee-free hint** — when a sale nets ~$0 because a flat card-rail fee
    eats the gross, the result message nudges toward Venmo/Cash. New `netsZero`
    helper; threaded into sellMint/sellOwned/counter. (Verified by unit test:
    $0.20 via card → net $0, via Venmo → net $0.20.) No hard block.
49. **Save-integrity dedupe on load** — a `merge` hook runs every load and dedupes
    any card uid appearing in more than one bucket (collection > pendingGrades >
    listings > consignments, first-seen wins). Persist bumped to v9. Verified: a
    uid seeded into both collection and consignments survived only in collection.

---

## 💡 Improvement backlog (NOT implemented — awaiting your call)

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
