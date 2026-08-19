// 🖨️ Errors and misprints — the cards the printer got wrong.
//
// Every sealed pack in this game produced a correctly printed card. Real ones do not. A
// press runs off-register, a sheet gets cut on the wrong line, a holo layer is missed, and
// what falls out of the pack is worth money for a reason that has nothing to do with the
// rarity symbol on it. That is a whole collecting category, and the game had none of it.
//
// Three things make this more than a value multiplier bolted onto a pull:
//
//   1. A MISPRINT SETS ITS OWN FLOOR. A miscut common is not worth 8× of ten cents. Error
//      collectors buy the error, so the card carries a dollar floor of its own. That is why
//      pulling one out of a bulk slot is a real event instead of a rounding error.
//   2. IT IS WORTH LESS RAW THAN IT IS SLABBED. Nobody pays full error money for a photo of
//      a card someone says is miscut — they pay it for a graded holder that says so on the
//      label. Raw realises a fraction; grading authenticates the error and unlocks the rest.
//   3. IT IS RARE ENOUGH TO STAY RARE. See MISPRINT_RATE. The rip-EV invariant (sim section
//      1) must not move, so the whole category is worth a fraction of a percent of pack EV.

// The catalogue. `mult` multiplies the card's own market value; `floor` is the dollar figure
// error collectors pay regardless of what the card underneath is worth. Weights are relative,
// and they follow the real hierarchy: registration and cutting faults are the common ones,
// a missing holo layer is a serious find, and a wrong-back is the card people write about.
export const MISPRINTS = [
  { key: 'offcenter', weight: 34, mult: 1.6,  floor: 4,    icon: '🎯', name: 'Badly off-centre',
    desc: 'The print sits well off register — borders fat on one side, shaved on the other.' },
  { key: 'miscut',    weight: 24, mult: 3.2,  floor: 18,   icon: '✂️', name: 'Miscut',
    desc: 'Cut on the wrong line: a strip of the neighbouring card is printed down the edge.' },
  { key: 'crimp',     weight: 16, mult: 3.8,  floor: 25,   icon: '🗜️', name: 'Crimped',
    desc: 'The pack-sealing crimp ran straight through the card. Factory damage, and collectible.' },
  { key: 'ink',       weight: 12, mult: 5.5,  floor: 45,   icon: '🎨', name: 'Ink error',
    desc: 'A colour ran dry or doubled up — text ghosted, art streaked, one plate misfired.' },
  { key: 'holobleed', weight: 8,  mult: 9,    floor: 120,  icon: '✨', name: 'Missing holo layer',
    desc: 'The foil layer never went down. A holo card printed flat, and a serious find.' },
  { key: 'inverted',  weight: 4,  mult: 16,   floor: 300,  icon: '🔄', name: 'Inverted back',
    desc: 'The back is printed upside down against the front. The press was loaded wrong.' },
  { key: 'wrongback', weight: 2,  mult: 34,   floor: 900,  icon: '🃏', name: 'Wrong back',
    desc: 'A Pokémon front on the wrong back entirely. The kind of card that gets written about.' },
]
export const MISPRINT_BY_KEY = Object.fromEntries(MISPRINTS.map(m => [m.key, m]))
const MISPRINT_WEIGHT_TOTAL = MISPRINTS.reduce((a, m) => a + m.weight, 0)

// How often a pack contains one. Roughly 1 in 1,250 packs holds any error at all, and the
// serious ones are a fraction of that — a wrong-back lands about once in 125,000 packs, which
// is the right order of magnitude for a card people remember pulling.
//
// THIS NUMBER IS LOAD-BEARING FOR BALANCE, and it is the reason the rate is not higher.
// Errors add value to a pack, and sim section 1 requires every modern set to stay -EV to rip.
// The fat tail below (a $900 floor on a wrong-back) is what actually drives the contribution,
// not the common faults — so the rate, not the ladder, is the dial. Sim section 10 measures
// the contribution through real packs and gates it under 1% of pack EV.
export const MISPRINT_RATE = 0.0008

// Raw misprints sell at a fraction of their authenticated value. The market discounts a
// claim it cannot verify, so this is the share a raw error actually realises.
export const MISPRINT_RAW_SHARE = 0.45

// Roll for an error. Returns null on almost every call.
export function rollMisprint(rnd = Math.random) {
  if (rnd() >= MISPRINT_RATE) return null
  let r = rnd() * MISPRINT_WEIGHT_TOTAL
  for (const m of MISPRINTS) {
    r -= m.weight
    if (r <= 0) return { kind: m.key, foundAt: null }
  }
  return { kind: MISPRINTS[0].key, foundAt: null }
}

// Which card in the pack got misprinted. A press fault does not know what rarity it is
// printing, and a pack is mostly commons, so the error lands on a uniformly chosen card.
// This is also what keeps the EV impact tiny: the roll usually decorates a ten-cent common.
export function pickMisprintIndex(count, rnd = Math.random) {
  return Math.floor(rnd() * Math.max(1, count))
}

// What the error does to the card's value. `graded` is true once a grader has authenticated
// it — the label is what the error market actually pays for.
export function misprintValue(baseValue, misprint, graded = false) {
  const def = MISPRINT_BY_KEY[misprint?.kind]
  if (!def) return baseValue
  const full = Math.max(baseValue * def.mult, def.floor)
  if (graded) return full
  // Raw: the error premium is discounted, but the card can never be worth LESS than it would
  // have been without the fault — a miscut chase is still the chase.
  return Math.max(baseValue, baseValue + (full - baseValue) * MISPRINT_RAW_SHARE)
}

// Display helpers.
export function misprintDef(misprint) { return MISPRINT_BY_KEY[misprint?.kind] || null }
export function misprintLabel(misprint) {
  const d = misprintDef(misprint)
  return d ? `${d.icon} ${d.name}` : ''
}
