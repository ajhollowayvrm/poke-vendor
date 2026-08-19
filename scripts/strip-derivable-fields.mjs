// Strip card fields the runtime can rebuild or already defaults — the sibling of
// strip-derivable-images.mjs, and the same safety rule: a field is removed ONLY when the
// runtime reproduces it exactly, so stripping can never change what the game sees.
//
// Three fields, worth ~830 KB raw and ~58 KB gzipped off the shipped snapshot:
//
//   1. `number` — for most cards the collector number IS the tail of the id
//      ("sv8pt5-25" → "25"), and engine.cardNumber() rebuilds it. The exceptions are kept:
//      Japanese cards print theirs as "094/165" while their id ends in a variant suffix
//      ("jp-SV2a-094MB"), so the two genuinely differ and the explicit value stays.
//      This is the ONLY one of the three that meaningfully shrinks the GZIPPED payload —
//      collector numbers are high-entropy digits that compress badly, where the repeated
//      words below compress almost to nothing. It is 48 KB of the 58 KB gzip win.
//
//   2. `supertype` when it is "Pokémon" — every reader in the game already treats an absent
//      supertype as Pokémon (`(c.supertype || 'Pokémon') === 'Pokémon'`), so dropping the
//      majority value is byte-identical at runtime. "Trainer" and "Energy" are kept.
//
//   3. `condition` / `grade` / `reverse` / `foil` — these are INSTANCE fields describing a
//      copy somebody owns, and they have no business in a catalog row. The Japanese fetch
//      path was writing them onto all 2,996 JP cards as `null`/`null`/`false`/`null`: 170 KB
//      encoding "nothing at all". engine.instance() fills them in for a real copy anyway,
//      and every one of the 2,996 carried the identical empty combination, so removing them
//      cannot change a value. Fixed at the source too (fetch-japanese.mjs).
//
// Run directly (`node scripts/strip-derivable-fields.mjs`) to strip src/data/sets.json in
// place. Gated: it verifies the derivation round-trips before deleting anything.

// Mirror of engine.cardNumber — keep in lockstep.
import { pathToFileURL } from 'node:url'

export function deriveNumber(card) {
  const id = card?.id
  if (typeof id !== 'string') return ''
  const i = id.lastIndexOf('-')
  return i > 0 ? id.slice(i + 1) : ''
}

// Instance fields that must never appear on a catalog row.
const INSTANCE_FIELDS = ['condition', 'grade', 'reverse', 'foil']

export function stripDerivableFields(sets) {
  const stats = {
    total: 0,
    numberStripped: 0, numberKept: 0,
    supertypeStripped: 0, supertypeKept: 0,
    instanceStripped: 0,
    refused: [],   // instance fields that carried a REAL value — never removed, always reported
  }
  for (const s of sets) {
    for (const c of s.cards || []) {
      stats.total++

      // 1. number — only when the id rebuilds it exactly.
      if (c.number != null) {
        if (String(c.number) === deriveNumber(c)) { delete c.number; stats.numberStripped++ }
        else stats.numberKept++
      }

      // 2. supertype — only the majority value every reader defaults to.
      if (c.supertype === 'Pokémon') { delete c.supertype; stats.supertypeStripped++ }
      else if (c.supertype != null) stats.supertypeKept++

      // 3. instance fields — only when empty. A non-empty one would mean the catalog is
      // carrying real per-copy state, which is a bug worth seeing rather than deleting.
      for (const k of INSTANCE_FIELDS) {
        if (!(k in c)) continue
        const v = c[k]
        if (v === null || v === undefined || v === false) { delete c[k]; stats.instanceStripped++ }
        else stats.refused.push({ id: c.id, field: k, value: v })
      }
    }
  }
  return stats
}

// Run directly: transform the committed snapshot in place and report.
// Direct-run guard. Uses pathToFileURL rather than hand-building a file:// URL — the
// hand-built version collapsed a relative argv[1] to `file:///scripts/…` and never matched
// on macOS or Linux, so running this file directly silently did nothing.
const runDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (runDirect) {
  const { readFile, writeFile } = await import('node:fs/promises')
  const zlib = await import('node:zlib')
  const path = 'src/data/sets.json'
  const before = await readFile(path, 'utf8')
  const data = JSON.parse(before)
  const gzBefore = zlib.gzipSync(Buffer.from(before), { level: 9 }).length

  const stats = stripDerivableFields(data.sets)
  const after = JSON.stringify(data, null, 0)
  const gzAfter = zlib.gzipSync(Buffer.from(after), { level: 9 }).length

  console.log(`number:     stripped ${stats.numberStripped}/${stats.total}, kept ${stats.numberKept} explicit (JP "094/165" style)`)
  console.log(`supertype:  stripped ${stats.supertypeStripped} Pokémon, kept ${stats.supertypeKept} (Trainer/Energy)`)
  console.log(`instance:   removed ${stats.instanceStripped} empty condition/grade/reverse/foil fields`)
  if (stats.refused.length) {
    console.log(`\n⚠️  REFUSED to strip ${stats.refused.length} instance field(s) carrying a real value:`)
    for (const r of stats.refused.slice(0, 10)) console.log(`   ${r.id}.${r.field} = ${JSON.stringify(r.value)}`)
  }
  await writeFile(path, after)
  console.log(`\n${path}: ${(before.length / 1024).toFixed(0)} KB → ${(after.length / 1024).toFixed(0)} KB raw`)
  console.log(`            ${(gzBefore / 1024).toFixed(0)} KB → ${(gzAfter / 1024).toFixed(0)} KB gzipped ` +
    `(−${((1 - gzAfter / gzBefore) * 100).toFixed(1)}%)`)
}
