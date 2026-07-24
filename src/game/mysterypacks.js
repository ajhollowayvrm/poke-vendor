// CUSTOM MYSTERY PACKS — the player's own repack product line.
//
// You define pack TIERS (a product line: name, price, an ADVERTISED value band, and which
// sales channels carry it), then BUILD individual packs by sealing exact cards and/or sealed
// product from your own stock inside. Buyers pay the tier price sight-unseen; what they find
// inside moves your PACK REPUTATION — stuff packs fairly (or seed real hits) and packs fly
// off the table; stuff them with junk and word gets around fast.
//
// This module is PURE (no store access): tier defaults, value math, demand odds, and the
// buyer-opens-it outcome classification. State mutations live in store/packs.js.
import { round2, cardValue, sealedValue } from './engine'

// The starter product line — three levels, fully editable/deletable by the player.
// bandLo..bandHi is what you ADVERTISE the contents are worth; the game never enforces it
// at build time (mislabel away), but a pack that opens below its advertised floor is
// false advertising and reputation pays for it.
export function defaultPackTiers() {
  return [
    { id: 'basic',   name: 'Basic Mystery Pack',   icon: '❓', price: 10,  bandLo: 2,   bandHi: 30,
      channels: { show: true, store: true, online: true, stream: true } },
    { id: 'premium', name: 'Premium Mystery Pack', icon: '🎁', price: 50,  bandLo: 20,  bandHi: 500,
      channels: { show: true, store: true, online: true, stream: true } },
    { id: 'royal',   name: 'Royal Mystery Pack',   icon: '👑', price: 200, bandLo: 100, bandHi: 5000,
      channels: { show: true, store: true, online: true, stream: true } },
  ]
}
export const PACK_TIER_CAP = 6     // product lines you can run at once
export const PACK_ICONS = ['❓', '🎁', '👑', '💎', '🎰', '🧧', '🎩', '🔮']
// How many packs one 🪄 Auto-build click may seal. A guard rail, not a rule: sealing a
// thousand packs in one click would be a miserable undo, so we stop and say how many are left.
export const AUTO_BUILD_CAP = 100

// --- What a line is MADE OF -------------------------------------------------
// A tier can restrict itself to a kind of card — "graded slabs only", "PSA 10 only", "raw
// only". This is the line's PROMISE, the same way bandLo..bandHi is its promise about value.
// It drives 🪄 Auto-build and the builder's "add all that fit", and (like the band) the game
// won't stop you hand-sealing something that breaks it — it just warns you first.
//   only:     'any' | 'raw' | 'slab'
//   minGrade: only meaningful for 'slab' — 0 = any slab, 9 = PSA 9+, 10 = PSA 10 only
export const PACK_ONLY_OPTS = [
  { key: 'any',  label: 'Anything' },
  { key: 'raw',  label: 'Raw cards only' },
  { key: 'slab', label: 'Graded slabs only' },
]
export const PACK_GRADE_OPTS = [
  { key: 0,  label: 'Any grade' },
  { key: 8,  label: 'PSA 8+' },
  { key: 9,  label: 'PSA 9+' },
  { key: 10, label: 'PSA 10 only' },
]

// Does this card satisfy the tier's CONTENT rule? (Value/band is a separate question — see
// cardFitsTier.) Split out so the builder can tell "wrong kind of card" from "wrong price".
export function cardMatchesContents(card, tier) {
  const only = tier?.only || 'any'
  const g = card?.grade?.overall ?? null
  if (only === 'raw') return g == null
  if (only === 'slab') return g != null && g >= (tier?.minGrade || 0)
  return true
}

// Is this card a candidate for the tier — right KIND (contents rule) and right PRICE (inside
// the advertised band, inclusive)? This is exactly what Auto-build sweeps up.
export function cardFitsTier(card, tier) {
  if (!tier || !cardMatchesContents(card, tier)) return false
  const v = cardValue(card)
  return v >= (tier.bandLo ?? 0) && v <= (tier.bandHi ?? Infinity)
}

// One-line English for a line's content rule ("PSA 10 slabs, $1–$10"). Used on the tier card
// and in the builder header so the promise is always visible while you're filling packs.
export function tierContentsLabel(tier) {
  const only = tier?.only || 'any'
  if (only === 'raw') return 'raw cards only'
  if (only === 'slab') {
    const m = tier?.minGrade || 0
    if (m >= 10) return 'PSA 10 slabs only'
    if (m > 0) return `PSA ${m}+ slabs only`
    return 'graded slabs only'
  }
  return 'any card'
}

// Live market value of everything sealed inside a pack.
export function packValue(pack) {
  const cards = (pack?.cards || []).reduce((a, c) => a + cardValue(c), 0)
  const sealed = (pack?.sealed || []).reduce((a, it) => a + sealedValue(it), 0)
  return round2(cards + sealed)
}

// The single best thing inside (for reveal lines) — a card or a sealed item, by value.
export function packBestItem(pack) {
  let best = null, bestVal = -1
  for (const c of (pack?.cards || [])) { const v = cardValue(c); if (v > bestVal) { best = { name: c.name, value: v }; bestVal = v } }
  for (const it of (pack?.sealed || [])) { const v = sealedValue(it); if (v > bestVal) { best = { name: it.product?.type || 'sealed product', value: v }; bestVal = v } }
  return best
}

// Per-day / per-encounter chance a buyer on `channel` takes ONE pack of this tier.
// Cheap packs are impulse buys; a $500 repack needs a name AND a clean track record.
//   packRep 0..100 (50 = unproven). Buzz = the store's giveaway/event traffic window.
//   opts.published  — the tier's odds board is public (transparency draws gamblers).
//   opts.certified  — 📋 Certified Odds upgrade: a trusted, audited board pulls harder.
//   opts.streak     — 🔥 hype streak (consecutive happy openings): a word-of-mouth tailwind.
//   opts.hasChase   — a seeded banger still sits in this published line's stock (self-advertising).
export function packSaleChance(price, notoriety, packRep, channel, hasBuzz = false, wrapPress = false, opts = {}) {
  const { published = false, certified = false, streak = 0, hasChase = false } = opts
  const priceFactor = 35 / (35 + Math.max(0, price))                    // $10 → .78 · $50 → .41 · $200 → .15
  const fame = 0.35 + Math.min(1.15, Math.max(0, notoriety) / 90)       // 0★ → .35 · 90★ → 1.35
  const rep = 0.25 + (Math.max(0, Math.min(100, packRep)) / 100) * 1.25 // burned → .25 · legendary → 1.5
  const base = channel === 'online' ? 0.55 : 0.4
  const buzz = channel !== 'online' && hasBuzz ? 1.35 : 1
  // ✨ Custom Wrap Press: retail-grade foil + printed wrappers make the pack an easier grab.
  const press = wrapPress ? 0.06 : 0
  // 📋 Published odds board: gamblers who can see the pool bite more often. A CERTIFIED board
  // (the upgrade) is trusted further, and a published line that still has a real chase sealed
  // inside advertises itself hardest of all.
  let pubMult = 1
  if (published) { pubMult = certified ? 1.32 : 1.15; if (hasChase) pubMult *= 1.2 }
  // 🔥 Hype streak: a run of happy openings is word-of-mouth — a temporary demand tailwind
  // that caps out and snaps the moment a buyer gets burned (see packStreak in packs.js).
  const hype = 1 + Math.min(0.3, Math.max(0, streak) * 0.03)
  return Math.max(0.01, Math.min(0.75, base * priceFactor * fame * rep * buzz * pubMult * hype + press))
}

// The buyer opens it. Classify what they found vs what they paid (and vs what the tier
// ADVERTISED). Mystery packs are usually a small loss for the buyer — that's the deal and
// nobody's mad at ~60–80 cents on the dollar. Real anger starts when the pack is worth a
// fraction of the price, or opens BELOW the advertised floor (false advertising).
//   opts.published — the odds board is public. Buyers who saw the pool are MORE OK with a thin
//     pack (they knew the gamble), so ordinary letdowns barely ding you — but a pack that opens
//     UNDER the published floor is a public broken promise and burns HOTTER, not softer.
//   opts.certified — 📋 Certified Odds: cushions honest letdowns a little further still.
//   Returns { key, repDelta, notoDelta, line } — line is a log fragment for the sale entry.
export function packOutcome(value, price, bandLo, buyer = 'The buyer', opts = {}) {
  const { published = false, certified = false } = opts
  const ratio = price > 0 ? value / price : 1
  const belowBand = value < (bandLo || 0) - 1e-9
  if (ratio >= 2) {
    // They hit a banger — the dream that sells every future pack. A published board turns the
    // moment into a talker (people trust it was a fair draw), so it spreads a touch further.
    const noto = Math.min(7, 2 + Math.floor(value / 150) + (published ? 1 : 0))
    return { key: 'jackpot', repDelta: +8 + (published ? 1 : 0), notoDelta: noto,
      line: published
        ? `${buyer} pulled a BANGER off your posted board — word is spreading fast`
        : `${buyer} pulled a BANGER — word is spreading` }
  }
  if (ratio >= 0.85) {
    return { key: 'happy', repDelta: +3 + (published ? 1 : 0), notoDelta: Math.random() < 0.4 ? 1 : 0,
      line: `${buyer} got their money's worth — happy customer` }
  }
  if (ratio >= 0.45 && !belowBand) {
    // A thin-but-fair pack. If you PUBLISHED the odds, the buyer knew the gamble going in — no
    // rep ding at all. Undisclosed, it's the usual small shrug.
    return { key: 'meh', repDelta: published ? 0 : -1, notoDelta: 0,
      line: published ? `${buyer} shrugged — but they knew the odds going in` : `${buyer} shrugged — that's mystery packs for you` }
  }
  if (belowBand) {
    // Below the advertised FLOOR — false advertising. On a PUBLISHED board that's a public
    // broken promise: you posted a minimum and missed it, and the receipts travel. Harsher.
    const noto = -Math.min(8, 1 + Math.floor(price / 80) + (published ? 3 : 1))
    return { key: 'ripoff', belowBand: true, repDelta: published ? -16 : -12, notoDelta: noto,
      line: published
        ? `${buyer} opened UNDER your posted floor — the receipts are going around`
        : `${buyer} got LESS than the pack even advertised — they're telling everyone` }
  }
  // A plain thin ripoff (over the floor, still a bad deal). Publishing the odds cushions the
  // anger — they rolled the dice knowing the pool; a certified board cushions a little more.
  const soften = published ? (certified ? 0.4 : 0.55) : 1
  const noto = -Math.min(6, Math.max(1, Math.round((1 + Math.floor(price / 80)) * soften)))
  return { key: 'ripoff', belowBand: false, repDelta: Math.round(-8 * soften), notoDelta: noto,
    line: published
      ? `${buyer} felt light — but the odds were posted, so it's on them`
      : `${buyer} felt ripped off — that stings your name` }
}

// Reputation tier readout for the UI meter.
export function packRepLabel(rep) {
  if (rep >= 85) return { label: 'Legendary repacks', icon: '🌟', color: '#ffd700' }
  if (rep >= 65) return { label: 'Trusted packs', icon: '✅', color: '#5ec98a' }
  if (rep >= 40) return { label: 'Unproven', icon: '❓', color: '#8c97b8' }
  if (rep >= 20) return { label: 'Sketchy rep', icon: '⚠️', color: '#ff9f43' }
  return { label: 'Known scam packs', icon: '☠️', color: '#ff6b6b' }
}

// Buyer flavor for pack sale log lines, by channel.
const PACK_BUYERS = {
  online: ['an eBay gambler', 'a Discord repack fiend', 'a TikTok shopper', 'a late-night scroller', 'a repack reviewer'],
  walkin: ['a kid with allowance money', 'a local regular', 'a lunch-break browser', 'a curious walk-in'],
  show:   ['a show-floor gambler', 'a kid dragging their parent over', 'a rival vendor (curious)', 'a passer-by'],
  stream: ['a hyped viewer', 'a chat lurker', 'a follower'],
}
export function packBuyerName(channel, rnd = Math.random) {
  const pool = PACK_BUYERS[channel] || PACK_BUYERS.online
  return pool[Math.floor(rnd() * pool.length)]
}
