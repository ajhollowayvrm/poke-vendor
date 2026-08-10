// Reputation rework — pure math for the two-speed rep model (no store access).
//
// ⭐ Reputation (state key `notoriety`, kept for save compat) is the slow, PERMANENT
// standing — every gate and demand formula in the game reads it, and it never decays.
// 🔥 Hype is the fast meter: big moments (god packs, grails, streams, giveaways, events)
// spike it, it halves every HYPE_HALF_LIFE days, and while hot it multiplies same-day
// demand (hard cap ×1.35) and buyer price tolerance (hard cap ×1.05). A capped slice of
// each day's decayed hype "cures" into permanent reputation, so a hot streak leaves a
// small lasting mark without ever outpacing real play.
// 🏅 RANKS are named tiers banked forever once earned: each needs the ⭐ threshold AND
// any 2 of 3 demonstrated deeds (derived live from lifetime stats — nothing stored).
// 🎫 Clout is the spendable favor currency granted by rank-ups and big moments.
//
// Store slices import all of this via ./store/constants re-exports (same pattern as
// fameMult); components may import it directly.

const round1 = x => Math.round(x * 10) / 10
const round2 = x => Math.round(x * 100) / 100

// --- ⭐ reputation gain taper (moved verbatim from economy.js addNotoriety) ----------
// Below SOFT, 1 rep = 1 point; above, gains taper by 1/(1+excess/150) so climbing
// 200→300 takes far more than 0→100. Losses always land in full; floor at 0.
export const NOTO_SOFT_CAP = 150
export function applyNotoGain(cur, amt) {
  let next
  if (amt <= 0) next = cur + amt // dings always land in full
  else if (cur < NOTO_SOFT_CAP) next = cur + amt
  else next = cur + amt * (1 / (1 + (cur - NOTO_SOFT_CAP) / 150))
  return Math.max(0, round2(next))
}

// --- 🔥 hype curves ------------------------------------------------------------------
export const HYPE_MAX = 100
export const HYPE_HALF_LIFE = 2    // days — a spike is mostly gone in ~5 days
export const HYPE_CURE_RATE = 0.15 // share of each day's decayed hype that cures into ⭐
export const HYPE_CURE_DAILY_CAP = 3 // ≤3⭐/day from cure — hype can't outpace real play
// Diminishing intake: pumping an already-hot meter adds less (chaining giveaways can't rail it).
export function hypeGain(cur, n) { return Math.max(0, n) * Math.max(0, 1 - (cur || 0) / 140) }
export function decayHype(h, days) { return (h || 0) * Math.pow(0.5, (days || 1) / HYPE_HALF_LIFE) }
// DEMAND multiplier — the main effect. 0→1.00× · 50→1.18× · 100→1.35× (hard cap).
export function hypeDemandMult(h) { return 1 + Math.min(0.35, Math.max(0, h || 0) / 100 * 0.35) }
// PRICE tolerance — deliberately tiny (exploit-dangerous dial): 100 hype → +5% max.
export function hypePriceMult(h) { return 1 + Math.min(0.05, Math.max(0, h || 0) / 100 * 0.05) }

// --- 📒 rep ledger (attribution) -----------------------------------------------------
// { today: {srcTag: delta}, days: [{d, total, srcs}] } — per-SOURCE daily sums, never
// per-event entries (every set() serializes the whole save; the panel needs sums only).
export const REP_LEDGER_DAYS = 7
export const REP_SOURCES = {
  sales:      { icon: '💵', label: 'Sales & service' },
  generosity: { icon: '🎗️', label: 'Generosity' },
  stream:     { icon: '🔴', label: 'Streaming' },
  shows:      { icon: '🎪', label: 'Shows' },
  events:     { icon: '🎉', label: 'Store events' },
  shop:       { icon: '🏬', label: 'Shop presence' },
  milestones: { icon: '🏅', label: 'Milestones' },
  goals:      { icon: '🎯', label: 'Weekly goals' },
  sets:       { icon: '🃏', label: 'Set completion' },
  packs:      { icon: '🎁', label: 'Mystery packs' },
  hype:       { icon: '🔥', label: 'Hype settling in' },
  dings:      { icon: '💢', label: 'Reputation dings' },
  other:      { icon: '⭐', label: 'Other' },
}
export function repSourceLabel(tag) {
  const src = REP_SOURCES[tag] || REP_SOURCES.other
  return `${src.icon} ${src.label}`
}
// Merge a (post-taper) delta into today's map. Returns a fresh ledger object.
export function ledgerAdd(ledger, tag, delta) {
  if (!delta) return ledger || { today: {}, days: [] }
  const key = REP_SOURCES[tag] ? tag : 'other'
  const today = { ...(ledger?.today || {}) }
  today[key] = round1((today[key] || 0) + delta)
  if (!today[key]) delete today[key] // a +0.02 that rounds away shouldn't leave a 0 row
  return { today, days: ledger?.days || [] }
}
// Close out the day(s) just played: push today's map as one ring entry, reset today.
export function ledgerRoll(ledger, dayClosed) {
  const today = ledger?.today || {}
  const total = round1(Object.values(today).reduce((a, v) => a + v, 0))
  const days = [...(ledger?.days || []), { d: dayClosed, total, srcs: today }].slice(-REP_LEDGER_DAYS)
  return { today: {}, days }
}

// --- 🏅 rank ladder ------------------------------------------------------------------
// Thresholds deliberately equal the historical gate values (show tiers 15/40/80/150/280)
// so no save gains or loses access it wouldn't have had. Deeds: any DEEDS_NEEDED of the 3,
// so no single playstyle (e.g. never streaming) can strand a rank.
export const DEEDS_NEEDED = 2
const deed = (label, value, goal) => ({ label, value, goal })
export const RANKS = [
  { emoji: '🍳', name: 'Kitchen Table Dealer', min: 0, clout: 0, perk: null, deeds: [] },
  {
    emoji: '🏷️', name: 'Weekend Flipper', min: 15, clout: 2,
    perk: '📥 A busier counter — one more pending request fits in your inbox',
    deeds: [
      deed('Open 25 packs', s => s.stats?.packsOpened || 0, 25),
      deed('Attend a card show', s => s.showsAttended || 0, 1),
      deed('Earn $500 lifetime', s => s.stats?.earned || 0, 500),
    ],
  },
  {
    emoji: '📣', name: 'Known Local', min: 40, clout: 3,
    perk: '📦 Word gets around — one more walk-in collection buy-in fits in the queue',
    deeds: [
      deed('Fill 5 collector wants', s => s.stats?.wantsFilled || 0, 5),
      deed('Grade 5 cards', s => s.gradesSubmitted || 0, 5),
      deed('Complete 5 weekly goals', s => s.stats?.goalsCompleted || 0, 5),
    ],
  },
  {
    emoji: '🎪', name: 'Regional Name', min: 80, clout: 4,
    perk: '🏪 Dave & Adam’s opens a wholesale account for you',
    deeds: [
      deed('Attend 10 shows', s => s.showsAttended || 0, 10),
      deed('5 acts of generosity', s => s.generousActs || 0, 5),
      deed('Host 3 store events', s => s.stats?.eventsHosted || 0, 3),
    ],
  },
  {
    emoji: '🏛️', name: 'Hobby Fixture', min: 150, clout: 5,
    perk: '📦 The name on the door — 5 extra storage units free of fees',
    deeds: [
      deed('Complete a full set', s => (s.completedSets || []).length, 1),
      deed('Run 5 streams', s => s.streamStats?.streams || 0, 5),
      deed('Attend 20 shows', s => s.showsAttended || 0, 20),
    ],
  },
  {
    emoji: '👑', name: 'Hobby Legend', min: 280, clout: 6,
    perk: '🎯 Sponsors chip in — weekly goal payouts ×1.15',
    deeds: [
      deed('Complete 5 full sets', s => (s.completedSets || []).length, 5),
      deed('Hit 500 peak viewers', s => s.streamStats?.peakViewers || 0, 500),
      deed('Attend 30 shows', s => s.showsAttended || 0, 30),
    ],
  },
]

// Highest rank index the ⭐ number alone clears (used to GRANDFATHER migrated saves:
// deeds are waived for standing already earned — banked ranks are never taken back).
export function rankForNotoriety(noto) {
  let r = 0
  for (let i = 0; i < RANKS.length; i++) if ((noto || 0) >= RANKS[i].min) r = i
  return r
}
// How many of a rank's deeds this save has done (derived live, nothing stored).
export function deedsDone(state, rankIdx) {
  const rank = RANKS[rankIdx]
  if (!rank) return 0
  return rank.deeds.filter(d => d.value(state) >= d.goal).length
}
// Can this save hold `rankIdx`? Threshold AND any DEEDS_NEEDED deeds (rank 0 is free).
export function rankEligible(state, rankIdx) {
  const rank = RANKS[rankIdx]
  if (!rank) return false
  if (rankIdx === 0) return true
  if ((state.notoriety || 0) < rank.min) return false
  return deedsDone(state, rankIdx) >= Math.min(DEEDS_NEEDED, rank.deeds.length)
}
export function rankOf(state) { return RANKS[Math.min(state.rank || 0, RANKS.length - 1)] }
