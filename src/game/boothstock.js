// A show vendor's SEALED STOCK: what they brought, and what's left of it.
//
// A booth's sealed table is a list of lines, one per SKU, each carrying a `qty` — a dealer
// brings four of one box and one of a vintage pack, not an endless supply. Three operations
// keep that honest, and they live here rather than inside VendorBooth for two reasons:
//
//   • They are the same three the SAVE depends on. A show survives being closed and reopened
//     by replaying `activeShow.taken` against a rebuilt floor (see boothItemKey in shows.js),
//     and a half-bought stack has to come back at its remaining depth — not full, not gone.
//   • Sealed depth was unenforceable in practice while it was component-internal. The rows a
//     player clicks are COPIES (the sealed tab groups lines by set and spreads each one to
//     stamp `_idx`), and the decrement matched on object identity — which a copy never
//     satisfies. So the line never went down and the same box could be bought off the table
//     an unlimited number of times. Matching on a stable key is the fix; being able to test
//     it without mounting a booth is what stops it coming back.
//
// A line's units are remembered individually as `${_tk}#u<n>` so that buying 2 of 4 restores
// as 2 of 4. `_tk` (booth + slot, stamped by ShowFloor) is the line's identity everywhere.

// Two references to the SAME line? Compare the stable key, never object identity — the caller
// is usually holding a rendered copy. `_idx` shifts as lines are removed and is not an
// identity, so a line with no `_tk` falls back to reference equality rather than guessing.
export function sameLine(a, b) {
  return (a?._tk && b?._tk) ? a._tk === b._tk : a === b
}

// The per-unit key for unit `n` (1-based) of a line.
export const unitKey = (tk, n) => `${tk}#u${n}`

// How many units of `line` are already gone, according to the show's `taken` set.
export function unitsTaken(line, taken) {
  if (!taken || !line?._tk) return 0
  let n = 0
  for (let u = 1; u <= (line.qty || 1); u++) if (taken.has(unitKey(line._tk, u))) n++
  return n
}

// Lay out the table: the vendor's lines minus everything already bought off them this
// show-day. Each surviving line carries its REMAINING depth as `qty`, plus the two marks
// consume() needs to keep numbering units where the last visit left off:
//   _qty0   — depth at the moment the table was laid out
//   _taken0 — units already gone before it was
// `taken` holding a line's bare `_tk` retires the whole line (a mystery pack is one-and-done).
export function seedSealedLines(products, taken) {
  return (products || []).map(line => {
    const total = line.qty || 1
    const gone = unitsTaken(line, taken)
    if (taken?.has(line._tk) || gone >= total) return null
    return { ...line, qty: total - gone, _qty0: total - gone, _taken0: gone }
  }).filter(Boolean)
}

// Take `n` units off a line. Returns the new list and the per-unit keys to record in the
// show's `taken` set — never more than the vendor actually has left, and nothing at all for
// a line that is already gone (a stale click on a row that has since sold out).
//   { lines, keys, took }
export function consumeLine(lines, entry, n = 1) {
  const cur = (lines || []).find(e => sameLine(e, entry))
  if (!cur) return { lines, keys: [], took: 0 }
  const took = Math.max(0, Math.min(n, cur.qty || 1))
  if (!took) return { lines, keys: [], took: 0 }
  const start = (cur._taken0 || 0) + ((cur._qty0 ?? cur.qty) - cur.qty)
  const keys = cur._tk
    ? Array.from({ length: took }, (_, i) => unitKey(cur._tk, start + i + 1))
    : []
  const next = lines
    .map(e => !sameLine(e, cur) ? e : (e.qty > took ? { ...e, qty: e.qty - took } : null))
    .filter(Boolean)
  return { lines: next, keys, took }
}
