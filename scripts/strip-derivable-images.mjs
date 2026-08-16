// Strip card image URLs that the runtime can rebuild (engine.js cardImg/cardImgLarge).
// pokemontcg.io art follows `https://images.pokemontcg.io/<setId>/<number>.png` (+ `_hires`),
// where setId comes from the card id — the EXACT formula the runtime helpers use. A card's
// URLs are removed only when BOTH match that formula byte-for-byte, so stripping can never
// break an image: anything that doesn't derive (scrydex hosts, cel25's cel25c paths,
// suffixed filenames, URL/number mismatches) keeps its explicit URLs and the helpers
// return them verbatim. Used by fetch-data.mjs on every refresh; run directly
// (`node scripts/strip-derivable-images.mjs`) to strip src/data/sets.json in place.

// Mirror of engine.js setIdOfCard — keep in lockstep.
import { pathToFileURL } from 'node:url'

function setIdOfCard(card) {
  const id = card?.id
  if (!id) return null
  const i = id.lastIndexOf('-')
  return i > 0 ? id.slice(0, i) : id
}

export function stripDerivableImages(sets) {
  const stats = { total: 0, stripped: 0, keptExplicit: 0, keptByHost: { } }
  for (const s of sets) {
    for (const c of s.cards || []) {
      stats.total++
      const sid = setIdOfCard(c)
      const derived = sid && c.number ? `https://images.pokemontcg.io/${sid}/${c.number}.png` : null
      const derivedLarge = derived && `https://images.pokemontcg.io/${sid}/${c.number}_hires.png`
      if (derived && c.img === derived && c.imgLarge === derivedLarge) {
        delete c.img
        delete c.imgLarge
        stats.stripped++
      } else {
        stats.keptExplicit++
        const host = (c.img || '(none)').split('/')[2] || '(none)'
        stats.keptByHost[host] = (stats.keptByHost[host] || 0) + 1
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
  const path = 'src/data/sets.json'
  const before = await readFile(path, 'utf8')
  const data = JSON.parse(before)
  const stats = stripDerivableImages(data.sets)
  const after = JSON.stringify(data, null, 0)
  await writeFile(path, after)
  console.log(`Stripped ${stats.stripped}/${stats.total} cards' img+imgLarge (kept ${stats.keptExplicit} explicit).`)
  console.log('Explicit URLs kept, by host:', stats.keptByHost)
  console.log(`${path}: ${(before.length / 1024).toFixed(0)} KB → ${(after.length / 1024).toFixed(0)} KB`)
}
