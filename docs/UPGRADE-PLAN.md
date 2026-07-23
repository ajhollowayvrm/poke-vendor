# Existing-System Upgrades — Implementation Plan

> **STATUS (2026-07-23): Phases 1–3 SHIPPED** (17 upgrades, persist v53) — sim green,
> E2E playtest green. Phase 4 (Special Orders Book, Second Location) remains open.

Eighteen new buy-once upgrades that deepen systems the game already has (the batch-1 list;
the new-area unlocks like the shipped ⛩️ Import License are tracked separately). Grouped
into four phases by risk and build size — each phase is one coherent ship: implement, run
`npm run sim`, Playwright-smoke the touched surfaces, commit, push, verify Actions green.

**Ground rules** (from the tuning invariants):
- Grading upgrades sell **speed and convenience, never odds** — blind EV / P10 bands are
  pinned by sim section 2 and calibrated to real PSA data.
- Storage upgrades may raise the **allowance**, never re-widen the `heldUnits` definition
  (sim section 5 pins the exemption list).
- Online-drag reducers (shipping, fees) **halve, never remove** — in-person must keep its edge.
- The buy-in loop is the economic backbone: upgrades may **feed** it (more lots, better
  intake), never bypass its haggle/appraisal risk.
- New upgrades are pure additions to `UPGRADES` (constants.js) — the UpgradeShop grid
  renders them automatically. Keep related upgrades adjacent in the table (it renders in
  insertion order). Only new **state fields** need a persist bump: one bump per phase,
  with a `migrate()` entry in store/index.js, house-style.

---

## Phase 1 — One-line dials (7 upgrades, no new state, no persist bump)

Every one of these is a constant read at an existing call site. Ship as a single commit.

| Upgrade | Cost | Needs | Hook |
|---|---|---|---|
| 📲 Tap to Pay | $250 | storefront | `PAYMENT_METHODS` (constants.js) |
| 📦 Shipping Station | $800 | — | `shippingCost()` (constants.js) |
| 🗄️ Locking Consignment Case | $900 | storefront | `CONSIGN_REQ_CAP` (constants.js) |
| 📻 "We Buy Collections" Ad | $1,200 | storefront | buy-in arrival roll (daytick) |
| 🗑️ Second Quarter Box | $600 | bulkBin flow | `BIN_MAX_PER_DAY` (constants.js) |
| 🎰 High-Capacity Vend Unit | $1,000 | packBin | `MACHINE_MAX_PER_DAY` (constants.js) |
| 🏦 Preferred Account | $2,000 | — | `CREDIT_*` (constants.js) + helpers/daytick |

Details:
- **📲 Tap to Pay** — add `tap: { viaUpgrade: 'payTap', feePct 0.026, feeFlat 0.10 }` to
  `PAYMENT_METHODS`; `acceptedMethods()` picks it up automatically. Buyer side:
  `pickPayMethod(channel, accepted)` in shows.js (~line 577, `PAYMENT_INSIST_RATE`) —
  give in-person channels a tap preference share; online buyers never prefer tap.
  README already advertises the rates — this closes that gap.
- **📦 Shipping Station** — thread an upgrade-aware multiplier through `shippingCost()`
  (constants.js ~244): callers (selling.js, daytick listings) pass `upgrades` or a
  precomputed `shipMult` (0.5 with the upgrade). Halves `SHIP_FLAT` + `SHIP_PCT`;
  leave `SHIP_MAX_SHARE` alone (the small-sale cap already protects bulk).
- **🗄️ Locking Consignment Case** — `CONSIGN_REQ_CAP` 2 → 5 with upgrade (make it a
  function like `storageFreeUnits(s)`), +3pp on the commission roll in the consignment
  intake (daytick / makeConsignRequest consumer).
- **📻 "We Buy Collections" Ad** — multiply the buy-in arrival roll (daytick, where
  `BUYIN_CHANCE` × `buyinDayMult` × policy `chanceMult` compose) by 1.4. Stacks with
  the posted buylist policy by design — an advertised generous shop is the volume build.
- **🗑️ Second Quarter Box** — `BIN_MAX_PER_DAY` 10 → 20 (upgrade-aware helper). Also
  surface the deeper drain in the BulkBin.jsx panel copy.
- **🎰 High-Capacity Vend Unit** — `MACHINE_MAX_PER_DAY` 8 → 14; and in the daytick
  Bin Keeper block (~line 1400), when owned alongside 🪓 binKeeper, top the machine's
  stock back up overnight from storeroom loose packs (same never-touch rules).
- **🏦 Preferred Account** — `CREDIT_MONTHLY_RATE` 0.04 → 0.025 and `CREDIT_LIMIT_PCT`
  0.50 → 0.65 when owned: read points are `creditLimit()` (helpers.js) and the monthly
  interest/settle block in daytick. UI: CreditPanel (App.jsx) shows the better terms.

Verification: sim (liquidation + storage sections must stay green — none of these touch
them), plus a smoke that a tap-preferring walk-in completes a sale and a shipping-station
listing nets more than before.

---

## Phase 2 — Store services & stream channel (8 upgrades, persist v53)

New state this phase: `weeklyEvent` (Events Coordinator's chosen recurring event, or null).
Single `migrate()` entry seeds it.

- **🪑 Appraisal Desk** ($1,600, needs loupe) — `BUYIN_CAP` 4 → 6; haggle: buy-in offers
  track `haggleRounds` (shows.js ~1333 — walk-away chance grows +0.15/round); the desk
  grants a 3rd round before the walk-away math bites (adjust the round cap where
  `haggleBuyin` in shows.js enforces it, and BoothInbox's haggle UI copy).
- **🥤 Snack Cooler** ($500, needs storefront) — flat $10–25/day counter income scaled by
  `walkinDayMult` (add beside the counter-trade block in daytick), and +10% on
  `browseSale` chance for walk-ins (booth.js `resolveEncounter`'s browse path).
- **🎁 Gift Wrap Counter** ($700, needs storefront) — in the daytick gift-buyer path
  (`makeGiftBuyer`, ~line 639): with the upgrade, the buyer can be served from the
  **storeroom** (not just floor), and the wrap premium rises ~+8pp. Misses still feed
  the demand board. Seasonal by nature (Nov–Dec only) — test by advancing from the
  September start.
- **🎪 Events Coordinator** ($2,200, needs storefront) — new `weeklyEvent` state: pick one
  `STORE_EVENTS` key to recur (UI: a small "make it weekly" toggle on the Shop-floor
  event planner). Daytick: if set, and no event planned, and cooldown clear, auto-plan it
  on its weekday; `EVENT_COOLDOWN_DAYS` 2 → 1 with the upgrade. Auto-planning pays the
  event cost from cash — skip (with a log line) when the till can't cover it.
  Raffle Night can't recur (needs a prize card) — exclude it from the toggle.
- **🎬 Clip Editor** ($1,100, needs streaming) — endStream (livestream.js ~264) currently
  sets `streamClip` only on monster pulls; with the upgrade every stream mints a clip at
  a reduced follower drip (~40%) when no organic clip fired. Organic clips unchanged.
- **🛡️ Mod Team** ($1,500, needs streaming) — daytick subs churn (~1084: `0.97^days` when
  dark > 7 days) → `0.985^days` with the upgrade; raid chance in Livestream.jsx session
  logic × 1.5.
- **✨ Custom Wrap Press** ($800) — `packSaleChance` (mysterypacks.js) +0.06 flat with the
  upgrade (thread `upgrades` from the callers in daytick/Livestream/MysteryPacks), and
  in packs.js (~166) soften negative `repDelta` by 40% — pro presentation buys forgiveness,
  never extra rep on a good pull.
- **🏗️ Storage Unit** ($1,500) — `storageFreeUnits(s)` gains `+ 15` when owned (between
  base 15 and storefront's +25; stacks: store+unit = 55). **Sim section 5 must grow two
  checks**: unit raises the allowance (same hoard → $0), and the `heldUnits` exemption
  list is untouched. Run sim before commit — this is the one economy-adjacent dial here.

Verification: sim (watch section 5), Playwright smoke: plan-a-weekly-event over two weeks
of `nextDay`, a dark-channel week with/without Mod Team, a gift buyer in a seeded December.

---

## Phase 3 — Grading desk (2 upgrades, no new state)

Both sell speed/convenience — the sim's grading-EV ladder (blind < tooled < endgame,
P10 18–30%) must be completely untouched.

- **🚚 Grader Dealer Account** ($2,400, needs gradescope) — the `GRADING` service tiers
  (engine.js) carry per-tier `days`; with the upgrade, effective turnaround = 
  `ceil(days × 0.6)` at submission time (where pendingGrades rows get their ready-day).
  Bench.jsx shows the courier line. No fee or odds change — capital velocity only.
- **🧾 Submission Runner** ($3,000, needs gradescope) — overnight-staff family (runs in
  daytick beside Binder Curator / Want Broker): auto-submits up to 2 raw cards/day at the
  **Economy** tier where the gradescope prediction says clear +EV (predicted-grade value
  minus fee comfortably above raw value, using the same prediction path CardModal/Bench
  render — no new odds knowledge). Never touches 🔒 kept, binder, held, or listed cards;
  logs each submission. Player-facing off-switch: a settings toggle, house-style with the
  other automation upgrades.

Verification: sim grading section byte-identical expectations; a seeded bench E2E: runner
submits only +EV cards and respects locks.

---

## Phase 4 — The big builds (2 upgrades, each its own persist bump + mini-plan)

- **📇 Special Orders Book** ($1,800, needs storefront, v54) — when a walk-in request
  (`makeShopRequest` miss path) can't be filled, offer a third resolution besides
  sell/mis: **take a deposit and order it**. New `specialOrders: []` state
  ({ what, setId/productType or cardId, deposit, due, customer }). Sourcing: if a
  distributor carries it, place the order (lead-time aware — imports work too);
  arrival + pickup pays the balance at retail + premium (reuse the reprint-wave
  deposit/pickup pattern); miss the due date → refund + rep ding + demand-board entry.
  Touches shows.js (request resolution options), daytick (arrival/pickup/expiry),
  BoothInbox UI. The deepest integration of the batch — budget a full session.
- **🏬🏬 Second Location** ($50,000, tier: big, needs storefront + manager-grade economy,
  v55) — a manager-run satellite: its own lease (~$180/day), a hired manager (reuse
  `EMPLOYEES`), and passive walk-in/counter income modeled as a scaled-down (≈40%)
  mirror of the main store's daily counter+walk-in resolution, fed by the same
  notoriety. No separate floor UI in v1 — it sells from a dedicated stock allocation
  you assign (storeroom → "send to second location"), with a daily P&L line in the
  ledger and a Stats row. Fail to cover its overhead for `STORE_GRACE_DAYS` → it closes
  (upgrade stays owned, reopen by re-funding). Design decision to confirm before build:
  v1 passive-mirror vs full second floor/inventory — recommend passive-mirror first.

---

## Sequencing & effort

1. **Phase 1** — one sitting, single commit, biggest bang-for-effort.
2. **Phase 2** — one to two sittings; the Events Coordinator and sim additions are the
   only careful parts.
3. **Phase 3** — half a sitting; discipline item is *not* touching odds.
4. **Phase 4** — each item is its own planned build; Special Orders Book first (it
   compounds with Import License lead times), Second Location as the endgame capstone.

Pricing bands stay consistent with the live catalog: accessories $250–$1,200, real
investments $1,500–$3,000, majors $6,000+, endgame $50,000.
