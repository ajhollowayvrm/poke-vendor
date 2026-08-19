// Slim save format: stop writing the card catalog into the save file.
//
// A saved card instance is `{ uid, ...catalogRow, condition, _cut, grade, loc, … }` —
// engine.instance() spreads the whole catalog row (name, number, rarity, supertype,
// price, psa comps, art URLs) onto every copy you own. That row is already shipped with
// the app in src/data/sets.json and is reachable from the `id` sitting on the card, so a
// 6,000-card collection was paying ~120 bytes/card to store the game's own data back to
// itself — about 1.3MB of JSON, ~210KB gzipped.
//
// That is not merely wasteful, it is a hard wall. Past roughly 7,500 cards the gzipped
// blob clears cloudSave's 350KB item cap and every push fails with "This save is too
// large to sync to the cloud"; past ~5MB of raw JSON, localStorage itself starts refusing
// writes (loadFromCloud's 'quota' path). Both are the same bug wearing different hats.
//
// So: on the way OUT (persist → localStorage → cloud), drop every field whose value is
// byte-identical to the catalog row for that card's id. On the way IN, lay the catalog row
// back down underneath the saved fields. Same trick, and the same safety rule, as
// scripts/strip-derivable-images.mjs: a field is only dropped when the runtime can
// reproduce it EXACTLY, so anything the game changed on a particular copy — a reverse
// holo's own price, a hand-stamped promo, a mispriced show-floor single — compares
// unequal and is written verbatim. Cards with no catalog row at all (minted promos,
// Pokémon Center stamps, sealed pseudo-cards) are passed through untouched.
//
// The format is self-describing rather than versioned: inflate() is a no-op on a card that
// already carries its catalog fields, so old fat saves load unchanged and a save written
// by either format reads correctly. That also means a save written here and opened by an
// app build from BEFORE this change reads as cards with no names — the PWA updates itself
// on next load, but it is the reason this is worth knowing about.
//
// INVARIANT: src/data/sets.json is append-mostly. A card id that appears in a save must
// keep resolving in the bundled catalog. Dropping a set from the data snapshot orphans
// every saved copy of its cards — they survive intact (uid, condition, grade and the rest
// are all still written), but lose the fields that came from the catalog. The same
// assumption already underpins cardById() lookups for product promos and CANONICAL_PRICE
// healing; this doesn't add a new constraint, it raises the stakes on the existing one.
import { cardById, cardNumber } from '../engine'

// `_cut` is a hidden 0..1 cut-quality score, minted from three Math.random() samples — so
// it serializes as ~19 characters of float noise per card, which after the catalog strip is
// one of the three biggest things left in a card (alongside its uid and id). It feeds
// gradeCard as `clamp((_cut - 0.5) * 0.16, ±0.12)`, a ±0.08 nudge on a subgrade roll:
// rounding to four decimals moves that by at most 8e-6, orders of magnitude below anything
// a grade boundary can see.
const CUT_PRECISION = 1e4

// Byte-identity, matching what JSON.stringify would emit. Scalars settle on the fast path;
// only the handful of object-valued catalog fields (psa comps, foil) ever stringify.
function same(a, b) {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  return JSON.stringify(a) === JSON.stringify(b)
}

// Deflating the same card object twice must produce the same result, and it does — cards
// are replaced wholesale on every change (`{ ...c, loc }`), never mutated in place, so
// object identity is a sound cache key. This matters: persist re-serializes the ENTIRE
// state on every set(), which during a pack rip is several times a second.
const deflated = new WeakMap()

function deflateCard(card, base) {
  // Nothing to strip against — a minted promo, a Pokémon Center stamp, a sealed
  // pseudo-card. Pass it through BY REFERENCE so the walk doesn't rebuild its containers.
  if (!base) return card
  const hit = deflated.get(card)
  if (hit) return hit
  const out = { uid: card.uid, id: card.id }
  for (const k of Object.keys(card)) {
    if (k === 'uid' || k === 'id') continue
    const v = card[k]
    if (v === undefined || typeof v === 'function') continue
    if (k in base && same(base[k], v)) continue
    // `number` is now DERIVED from the id for most cards, so the catalog row no longer
    // carries it and the `k in base` test above stops matching. Without this, every card
    // saved before the strip would start writing its collector number back out — the exact
    // save bloat this module exists to prevent. Drop it whenever it matches what
    // engine.cardNumber() rebuilds; a JP card whose number genuinely differs still writes.
    if (k === 'number' && !(k in base) && String(v) === cardNumber({ id: card.id })) continue
    out[k] = k === '_cut' && typeof v === 'number' ? Math.round(v * CUT_PRECISION) / CUT_PRECISION : v
  }
  deflated.set(card, out)
  return out
}

// A card instance always carries at least one of these (engine.instance() sets all three),
// and no container in the save does. Used to tell a card whose catalog row has gone missing
// apart from any other uid+id object the walk might meet in the future.
const CARD_MARKERS = ['condition', 'grade', '_cut']

function inflateCard(card, base) {
  // No catalog row. Usually that's by design (see deflateCard) and there's nothing to do —
  // but it's also what an orphaned card looks like if its set ever left the bundled data
  // (see the INVARIANT above). A slimmed orphan would draw as a blank row, so label it with
  // its id; rawValue's price ladder (CANONICAL_PRICE → estimateByRarity) covers the rest.
  if (!base) {
    const orphan = card.name === undefined && CARD_MARKERS.some(k => k in card)
    return orphan ? { ...card, name: card.id } : card
  }
  // Already carries everything the catalog would supply (a fat save, or one already
  // inflated this load) — hand back the SAME object so the walk skips rebuilding its
  // containers. Values aren't compared: where both have a key, the instance wins anyway.
  for (const k of Object.keys(base)) if (!(k in card)) return { ...base, ...card }
  return card
}

// Depth guard. The deepest real nesting is state → builtPacks → cards → grade (4);
// anything past this is a structure we don't understand and shouldn't be rewriting.
const MAX_DEPTH = 24

// Walk the persisted state and apply `fn` to every card instance in it, wherever it lives.
// Deliberately generic rather than a list of buckets: cards sit in the collection, the
// binder, show/shop inventories, the bulk bin, the pack machine, built mystery packs,
// in-transit imports, and wrapped inside pendingGrades / listings / consignments / booth
// encounters / buy-in offers — and the next feature will add another. A walk cannot miss
// one; a list eventually does.
//
// A card instance is anything identifying a specific copy (`uid`) of a card (`id`); `fn`
// receives its catalog row, or null when there is none. Unchanged subtrees are returned by
// reference, so a state whose cards are all cached rebuilds nothing at all.
function walk(node, fn, depth) {
  if (node === null || typeof node !== 'object' || depth > MAX_DEPTH) return node
  if (Array.isArray(node)) {
    let changed = false
    const out = new Array(node.length)
    for (let i = 0; i < node.length; i++) {
      out[i] = walk(node[i], fn, depth + 1)
      if (out[i] !== node[i]) changed = true
    }
    return changed ? out : node
  }
  if (node.uid && typeof node.id === 'string') return fn(node, cardById(node.id))
  let changed = false
  const out = {}
  for (const k of Object.keys(node)) {
    const v = node[k]
    // Zustand persists a state object that still carries every action; JSON.stringify drops
    // them, and we must not try to walk into one.
    out[k] = typeof v === 'function' ? v : walk(v, fn, depth + 1)
    if (out[k] !== v) changed = true
  }
  return changed ? out : node
}

// persist's partialize: what actually gets written to localStorage — and pushed to the
// cloud, which uploads that exact blob.
export function deflateState(state) { return walk(state, deflateCard, 0) }

// The inverse, run on load before anything reads the state. Idempotent: safe on a fat save,
// and safe to call twice (store/index.js calls it from both migrate and merge, because
// migrations added from here on must see whole cards).
export function inflateState(state) { return walk(state, inflateCard, 0) }
