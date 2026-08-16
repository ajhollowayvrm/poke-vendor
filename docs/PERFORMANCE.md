# Boot performance

> Status: **current as of 2026-08-15.** Re-measure with `npm run profile` rather than trusting
> this file — the number below is a fact about a build, and builds change. The previous version
> of this document was a plan whose conclusion was measured against a 5,153-card catalog and
> then quoted unchanged while the catalog grew to 23,475. That is exactly the failure `npm run
> profile` exists to prevent.

## Where it stands

Production build, 4× CPU throttle (roughly a mid-range phone), median of 7 runs:

| | Before (2026-08-15) | After | |
|---|---|---|---|
| **App interactive** | 202 ms | **177 ms** | −12% |
| First contentful paint | 172 ms | 148 ms | −14% |
| DOMContentLoaded | 127 ms | 110 ms | −13% |
| card-data chunk | 3,313 KB raw / 419 KB gzip | **2,409 / 347** | −27% / −17% |
| Boot app chunk | 848 KB raw / 275 KB gzip | **442 / 155** | −48% / −44% |

Of the 177 ms, `JSON.parse` of the card data is ~16 ms and engine index building ~14 ms —
**together about 17%**. That ratio is the important part of this document, because it says
where the *next* win is not.

## What was done

**1. Stripped three derivable fields from the snapshot** (`npm run strip-data`, and
automatically on every `npm run fetch-data`). Each is removed only when the runtime reproduces
it exactly, and a round-trip check over all 23,475 cards gates the strip.

| Field | Raw | Gzip | Why it was safe |
|---|---|---|---|
| `number` | 288 KB | **48 KB** | The collector number is the tail of the id for 20,454 cards; `engine.cardNumber()` rebuilds it. JP cards print "094/165" against an id ending "094MB", so those keep an explicit value. |
| `supertype` = "Pokémon" | 371 KB | 7 KB | Every reader already defaulted an absent supertype to Pokémon. Trainer/Energy kept. |
| `condition`/`grade`/`reverse`/`foil` | 170 KB | 3 KB | A **data bug**: the JP fetch was writing instance fields onto catalog rows, all 2,996 carrying the identical `null/null/false/null`. Fixed at source in `fetch-japanese.mjs`. |

Note the gzip column. Repeated words compress almost to nothing, so `supertype` is a big raw
win and a rounding error on download; collector numbers are high-entropy digits that compress
badly, which is why one field is 83% of the gzip saving. **Raw size still matters** — it is
parse time and heap — but do not confuse the two, which the previous plan was right to warn about.

**2. Code-split the tab-gated screens** (`src/ui/lazyChunk.jsx`). The boot chunk was parsing
every screen in the game — the 104 KB livestream, the show floor, the booth inbox — before it
could paint the Buy tab. They are now `React.lazy` chunks fetched on first use. An unused
`NotorietyBar` import was on its own pulling the whole calendar into boot.

Each lazy import carries a **stale-chunk guard**: this app is rebuilt often, and a session
holding a reference to an old hashed chunk would throw to the crash screen. The guard renders
"the game updated — reload" instead.

**3. Removed the PWA and the GitHub Pages deploy entirely.** See below.

## The service worker was never running

The app ships inside a native iOS shell that serves `dist/` over a custom URL scheme
(`pokevendor://local`). **A service worker does not run under a custom scheme**, so the whole
PWA layer — worker, precache, update prompt, Workbox card-art rule — did nothing in the only
place the app actually runs. `npm run ios:sim` asserts `sw: false` on every run and always has.

So it is gone: `vite-plugin-pwa`, `src/game/appUpdate.js`, the update pill, the manifest, the
PWA icons, and `.github/workflows/deploy.yml`. Card-art caching is done natively by the
`URLCache` in `Shell.swift`, which was already the real mechanism.

## Where the next win is *not*

Boot is ~177 ms and the card data accounts for ~17% of it. Halving the boot app chunk (which
this pass did) moved the total by about 4 ms. Both facts point the same way:

- **Shrinking the card data further is low-value.** Interning `rarity` into an index array was
  measured and rejected: 326 KB raw but only **5 KB gzipped**, against touching every
  `card.rarity` reader and adding a rehydration pass at init. Bad trade.
- **Lazy-loading the vintage/secondary card pool** (the old plan's risky "Phase 2") is still not
  worth it, and now for a measured reason rather than an assumed one. Its entire upside is a
  slice of a 16 ms parse, against await-gating every synchronous consumer of `VINTAGE_CARDS` —
  save rehydration, `cardInValueRange`, show-floor generation, net worth — where a mistake is a
  *silent* wrong price rather than a visible break.

If boot ever needs to be materially faster, profile first: the remaining time is script compile,
React mount and store hydration, not the card database.

## Re-measuring

```bash
npm run build && npm run profile      # 4× throttle, 7 runs
THROTTLE=6 npm run profile            # a slower phone
npm run strip-data                    # re-strip the snapshot (idempotent)
npm run ios:sim                       # the real WKWebView: layout, tap targets, sw:false
```
