// 📊 PSA population reports — how many copies of this card exist at this grade.
//
// Grading here used to be pure odds. You rolled a grade, you read the comp, you were done.
// Real dealers do not work that way. They read the population report first. A PSA 10 with 42
// copies in the census is a different asset from a PSA 10 with 9,000 copies, and the second
// one is what most modern chase cards actually are.
//
// This module produces two numbers:
//   • popCount — the census figure the player reads (the 🔭 Grading Scope shows it).
//   • popMult  — what that scarcity does to the slab's market value.
//
// THE RAIL that keeps the grading balance intact: popMult has a mean of exactly 1.0 across
// the catalog. It is built from a uniform hash percentile, so the AVERAGE card is unaffected
// and only the spread is new. Grading stays exactly as profitable a business as it was; what
// changes is WHICH cards are worth slabbing. Sim section 2 pins the EV ladder, and sim
// section 9 pins this mean directly.
//
// The player writes to the census too. Every slab you send back raises the count, and on a
// thin vintage card your own ten submissions can halve the premium you were grading for.
// That is the real constraint the hobby lives under, and it is the reason this is not just
// a display number.

// --- The census -----------------------------------------------------------------
// A deterministic hash (FNV-1a) over the card id and the grade. The same card always reports
// the same population, with no census table to ship and no state to persist.
function hash32(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  // AVALANCHE — not optional. Plain FNV-1a leaves inputs that differ only in their LAST
  // character sitting in a narrow band, drifting by a constant rather than scattering: a
  // ramp, not a hash. Here the last character is the GRADE, so without this a card's PSA 10
  // and PSA 9 percentiles would be near-neighbours instead of independent draws. Found while
  // debugging the same flaw in game/shelf.js, where it stopped a shelf rotating at all.
  // (murmur3 fmix32.)
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0
  h ^= h >>> 16
  return h >>> 0
}
// Where this card sits against its peer group, 0 (the scarcest) to 1 (the most common).
// Uniform by construction — that uniformity is what makes popMult average 1.0.
export function popPercentile(cardId, grade) {
  return hash32(`${cardId}|pop|${grade}`) / 4294967296
}

// What a card LIKE this one usually has in the census, before its own luck applies.
// Two things drive real submission volume:
//   • Era. Vintage cards were opened and played 25 years ago, so high grades are genuinely
//     scarce. Modern cards go to the grader in sealed-fresh bulk lots of 200.
//   • Money. Nobody pays to slab a bulk common. The cards with big populations are exactly
//     the cards worth slabbing, which is why the chase you just pulled is not rare in a holder.
const POP_BASE_MODERN = { 10: 850, 9: 1900, 8: 900 }
const POP_BASE_VINTAGE = { 10: 32, 9: 165, 8: 260 }
function popExpect(card, grade, vintage) {
  const base = (vintage ? POP_BASE_VINTAGE : POP_BASE_MODERN)[grade] ?? (vintage ? 220 : 700)
  // Value pulls submissions in. A $2 card is barely graded at all; a $600 chase is graded by
  // everyone who pulls one. The curve is deliberately gentle (a log), because a card being
  // ten times dearer does not make it ten times more graded.
  const value = Math.max(0.25, card?.price ?? 1)
  const pull = Math.max(0.12, Math.min(4.5, 0.35 * Math.log10(value + 1) * 2.4))
  return base * pull
}

// The population figure itself. `adds` is what YOUR submissions have put into the census.
export function popCount(card, grade, { vintage = false, adds = 0 } = {}) {
  if (!card?.id || grade == null) return null
  const pct = popPercentile(card.id, grade)
  // Spread each card around its peer expectation. A card can be a quarter of the usual
  // census or nearly two and a half times it.
  const spread = 0.25 + pct * 2.2
  const n = Math.max(1, Math.round(popExpect(card, grade, vintage) * spread))
  return n + Math.max(0, adds)
}

// --- What scarcity does to the price ---------------------------------------------
// Only strong slabs carry a population premium. Nobody pays extra for a low-pop PSA 5 —
// the card is simply a damaged card in a holder, and the census for it is noise.
const POP_SWING = { 10: 0.25, 9: 0.10 }
// How hard your own submissions move the needle. Full weight would let ten slabs of a
// thin card erase the whole premium; this keeps the damage real but survivable.
const SELF_WEIGHT = 0.9

export function popMult(card, grade, { vintage = false, adds = 0 } = {}) {
  const swing = POP_SWING[grade]
  if (!swing || !card?.id) return 1
  const pct = popPercentile(card.id, grade)
  // Your own slabs push this card toward the common end. The shift is proportional to what
  // share of the census YOU put there, so ten submissions are nothing against a pop of 5,000
  // and a great deal against a pop of 20.
  const base = popCount(card, grade, { vintage })
  const mine = Math.max(0, adds)
  const shift = mine > 0 ? (mine / (base + mine)) * SELF_WEIGHT : 0
  const eff = Math.max(0, Math.min(1, pct + shift))
  // Linear in the percentile, centred at 1.0. A uniform percentile therefore averages to
  // exactly 1.0 across the catalog, which is the invariant sim section 9 checks.
  return 1 + swing * (1 - 2 * eff)
}

// --- Reading the report ----------------------------------------------------------
// How a population reads to a dealer. The bands are wide on purpose: the useful judgement is
// "is this thin or is this flooded", not the exact integer.
export const POP_TIERS = [
  { key: 'scarce',  max: 75,    label: 'Scarce',   icon: '💎', color: '#7cf0ff',
    blurb: 'Genuinely few in the census. The holder is doing real work on the price.' },
  { key: 'thin',    max: 400,   label: 'Thin',     icon: '📈', color: '#36d399',
    blurb: 'A modest census. Scarcity still pays here.' },
  { key: 'normal',  max: 2000,  label: 'Normal',   icon: '📊', color: '#9db8ff',
    blurb: 'An ordinary population. The comp is the comp.' },
  { key: 'deep',    max: 6000,  label: 'Deep',     icon: '📉', color: '#ff9f43',
    blurb: 'Widely graded. Plenty of competition when you list it.' },
  { key: 'flooded', max: Infinity, label: 'Flooded', icon: '🌊', color: '#ff5e6c',
    blurb: 'Everybody slabbed this one. The holder adds very little.' },
]
export function popTier(count) {
  return POP_TIERS.find(t => (count || 0) <= t.max) || POP_TIERS[POP_TIERS.length - 1]
}
// A short line for the card modal: "💎 Scarce · 48 in PSA 10 (+12% on the comp)".
export function popLine(card, grade, opts = {}) {
  const n = popCount(card, grade, opts)
  if (n == null) return null
  const t = popTier(n)
  const m = popMult(card, grade, opts)
  const pct = Math.round((m - 1) * 100)
  const swing = pct === 0 ? '' : ` (${pct > 0 ? '+' : ''}${pct}% on the comp)`
  return `${t.icon} ${t.label} · ${n.toLocaleString()} in PSA ${grade}${swing}`
}
