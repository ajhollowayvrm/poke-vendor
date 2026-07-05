# Bundle / boot-time optimization plan

The deferred "risky" item from the audit. Goal: cut mobile **boot parse time** (and
some download), which is dominated by the card-data snapshot. This is staged by risk
so we can bank the safe wins and stop before the dangerous one if we choose.

## Measured baseline (2026-07-05)

| Thing | Value |
|---|---|
| `src/data/sets.json` raw | **1.13 MB** |
| Built `card-data` chunk | 1.07 MB raw / **135 KB gzip** |
| Cards total | 5,153 |
| — modern (shop) | 2,002 |
| — vintage + secondary | **3,151 (61%)** |
| `img`/`imgLarge` URL bytes | **~546 KB (47% of the file)** |
| — derivable from card id (pokemontcg.io pattern) | 4,612 |
| — non-derivable (scrydex.com, newest sets) | 541 |

**Key honest caveat:** gzip already compresses the repetitive image-URL prefixes well,
so stripping URLs saves ~470 KB *raw* but only a modest amount *gzipped*. The real,
worth-it win is **JS parse/allocation time on a phone** — the card-data chunk is emitted
as a giant object literal and parsing 1 MB of it blocks first paint. So the wins here are
"time to interactive on iPhone," not "MB downloaded."

The chunk is already isolated via `manualChunks` (good — PWA delta-updates stay small).

---

## Phase 0 — `json: { stringify: true }` (SAFE, do first)

**What:** add `json: { stringify: true }` to `vite.config.js`. Vite then emits the
snapshot as `JSON.parse('…')` instead of a native object literal. `JSON.parse` of a
string is ~1.5–2× faster than the JS engine parsing an equivalent object literal on
mobile, because it skips the generic expression parser.

**Risk:** ~none. It's a build-output format flag; the imported value is identical.

**Effort:** 1 line + a rebuild.

**Verify:** build, confirm the app boots and a pack rips; eyeball the chunk to confirm it's
now `JSON.parse(...)`. Optionally measure boot with the Performance panel throttled to
"Mobile 4×".

**Go/no-go:** ship if the build is clean and the app runs. There's no downside.

---

## Phase 1 — Derive image URLs at runtime (MODERATE)

**What:** the 4,612 pokemontcg.io images follow a fixed pattern:
`https://images.pokemontcg.io/<setId>/<number>.png` and `…_hires.png` for `imgLarge`.
Strip those two fields from the snapshot at fetch time and reconstruct them at runtime.
The 541 scrydex.com URLs are **not** derivable — keep them explicit on the card.

**Steps:**
1. Add `cardImg(card)` / `cardImgLarge(card)` helpers in `engine.js`: if `card.img` is
   present (scrydex or anything non-standard) use it verbatim; else derive from
   `setIdOfCard(card)` + `card.number`. One source of truth.
2. **Find every `.img` / `.imgLarge` read** and route it through the helper. Grep:
   `grep -rn "\.img\b\|\.imgLarge\b" src` — expect CardTile, HoloCard, PackOpening,
   Livestream, SellStrips, CardModal, Binder, PriceGuide, at least. This is the bulk of
   the work and the main risk surface (a missed call site = a broken image).
3. In `scripts/fetch-data.mjs`, drop `img`/`imgLarge` for cards whose URL matches the
   derivable pattern; keep them for scrydex/other. Re-run fetch to shrink the snapshot.
4. Keep the `preloadCardImages` warmer working — it reads the resolved URL, so point it at
   the helper too.

**Risk:** moderate and *fully visible* — a missed reader shows a broken image, caught
instantly by driving the app. No data/economy risk. Card `number` must be reliably present
and match the URL's filename (verify a sample: some sets use zero-padding or suffixes —
**spot-check 10 cards per set** that `derive(card) === originalUrl` before stripping).

**Effort:** half a day; mechanical but broad.

**Verify:**
- A one-off script asserting `derive(card) === card.img` for all 4,612 derivable cards
  *before* stripping (catches number/format mismatches). Gate the strip on 100% match.
- Drive the app: rip a pack (modern + a vintage/secondary set for the scrydex path),
  open the collection grid, open a card modal, open the price guide — every image loads.
- Confirm the snapshot shrank and the app still renders offline (SW cache still keyed on
  the two hosts from the group-2 fix).

**Go/no-go:** ship only if the derive-equality script is 100% and every driven surface
shows images. If any set's numbering doesn't derive cleanly, **keep its URLs explicit**
(the helper already falls back to `card.img`) rather than forcing it.

---

## Phase 2 — Lazy-load vintage/secondary cards (RISKY — the real one)

**What:** 3,151 of 5,153 cards (61%) are vintage/secondary and only appear at shows / the
vault. Split them into a dynamically-imported chunk so the common "open shop, rip modern"
boot path never parses them.

**Why it's risky:** `engine.js` statically imports the whole snapshot and derives
`SHOP_SETS` / `VINTAGE_SETS` / `SECONDARY_SETS` / `ALL_CARDS` / `VINTAGE_CARDS`
**synchronously at module load**, and a lot of code assumes every card is available
synchronously *right now*:
- **Save load / price healing** — `merge`/rehydrate heals persisted card prices against
  `CANONICAL_PRICE` and can touch any set, including vintage a save references.
- **`cardInValueRange`** (mystery packs, high-end show stock, buy-ins) pulls from
  `VINTAGE_CARDS` / `COMP_SLABS` synchronously.
- **Show floor generation** builds vintage stock synchronously the moment you enter.
- **Net worth / Stats** value every held card, which may be a vintage card from a save.

If the vintage chunk isn't loaded before any of those run, they'd see an empty pool —
wrong prices, missing stock, or a card valued at the $0.02 floor. That's a **silent
data-correctness** failure, not a visible one, which is exactly the kind we've been
killing, so this phase must be gated hard.

**Only-safe approach:** treat the vintage chunk as a **precondition**, not a lazy nicety.
- Ship modern cards eagerly (the boot-critical set).
- Kick off the vintage chunk import *immediately after first paint* (not on show-entry) so
  it's almost always ready before the player reaches a show.
- **Block the vintage-dependent entry points** (attend a show, open the vault, any path
  that calls `cardInValueRange`) on the chunk being resolved — a tiny "loading…" gate if it
  isn't yet. Never let those run against a partial pool.
- On **save load**, if the persisted collection references a vintage set id, await the
  chunk before completing rehydrate/price-healing. This is the sharp edge — get it wrong
  and a vintage-holding save loads with broken values.
- Keep a single `getAllCards()` that returns modern-only until the chunk resolves, then the
  full set, and make the sync consumers either (a) not run pre-resolve, or (b) tolerate
  modern-only. Audit each `ALL_CARDS`/`VINTAGE_CARDS` consumer explicitly.

**Effort:** 1–2 days, most of it auditing synchronous consumers and adding await-gates.

**Verify (must all pass before ship):**
- Load a **save that holds vintage cards** → values are correct, no $0.02 floors, Stats net
  worth matches pre-change. (Seed the exact save both ways and diff.)
- Attend a show immediately on boot (before the chunk could lazily load) → vintage stock
  and high-end repacks/showcases populate correctly, no empty pools.
- `npm run sim` green (the repack/high-roller EV path uses `cardInValueRange` over vintage).
- Offline: second launch with the chunk cached still works.
- Boot-parse measurement actually improved (the whole point) — Performance panel, throttled.

**Go/no-go:** ship **only** if the vintage-save load and the boot-then-immediately-attend
paths are both provably correct. If the await-gating gets hairy, **stop after Phase 1** —
Phases 0+1 already cut the parse cost meaningfully with near-zero risk, and Phase 2's
download win is small (it's gzip that matters for download, and this is a parse-time play).

---

## Recommendation

Do **Phase 0 now** (free), **Phase 1 next** (real parse win, visible-only risk), and treat
**Phase 2 as optional** — only worth it if boot time on your actual phone still bothers you
after 0+1, because its risk/reward is the worst of the three. Each phase is independently
shippable and independently revertible.
