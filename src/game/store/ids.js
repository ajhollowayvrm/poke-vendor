// Shared monotonic id counters for the store slices.
//
// These used to be module-level `let _offerSeq` / `let _sealedSeq` inside the old
// single-file store. Now that the store is split across slice modules that each need a
// slice of this state (economy's day-tick mints offer ids; sourcing mints sealed uids;
// index.js re-seeds the offer counter on rehydrate), the counters live here so every
// module shares ONE source of truth instead of drifting copies.
//
// Date.now()/Math.random() are intentionally avoided for these ids — they must be stable
// and collision-free across a page reload (persisted offers/sealed items keep their ids),
// so we use plain incrementing counters re-seeded past the highest persisted value.

// Offers on listings. `nextOfferId()` returns 1,2,3,… (pre-increment, so the first id is
// 1, matching the old `++_offerSeq`). `seedOfferId(max)` bumps the counter past the
// highest id seen in a rehydrated save so a fresh offer never reuses a persisted id.
let _offerSeq = 0
export function nextOfferId() { return ++_offerSeq }
export function seedOfferId(max) { if (max > _offerSeq) _offerSeq = max }

// Sealed-inventory item uid suffix. Combined with a Date.now() base36 prefix at the call
// site to build a unique uid; this just guarantees uniqueness within a single millisecond.
// Returns a base36 string (post-increment, matching the old `(_sealedSeq++).toString(36)`).
let _sealedSeq = 0
export function nextSealedSuffix() { return (_sealedSeq++).toString(36) }
