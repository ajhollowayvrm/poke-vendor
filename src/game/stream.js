// Livestream system: you go LIVE and rip sealed product on camera. Viewers tune in
// (scaled by notoriety), react in chat, and tip. Big pulls spike the room. You can
// also run a BOX BREAK — sell spots (random teams) up front, then rip the box live
// and "ship" each pull to its spot-holder. Ending a stream banks tips, a big
// notoriety bump, and a sales-hype window (a recent stream pumps all your listings).
import { isHit, cardValue, rarityRank, fmtMoney } from './engine'

// A pull worth losing your mind over on camera — same bar the show floor uses for a
// hall-wide announcement (SIR+ / any special foil / grail). Drives viewer spikes,
// chat hype, and bigger tips.
const HYPE_RANK = rarityRank('Special Illustration Rare')
export function isStreamHype(card) {
  return !!card.foil || !!card._grail || rarityRank(card.rarity) >= HYPE_RANK
}

// Baseline concurrent viewers for your audience size, by notoriety. A nobody streams
// to a near-empty room; a known name pulls a real crowd. Returns the "settled" viewer
// count the room drifts toward between pulls (live count jitters around it).
// `fatigue` (1 = fresh audience, →0 = burned out from over-streaming) scales the
// crowd down: stream every day and the room thins; space them out and it recovers.
const VIEWER_CEILING = 9000 // soft cap so high notoriety can't balloon to absurd numbers
export function baseViewers(notoriety, fatigue = 1) {
  // ~8 at noto 0 → ~60 at noto 40 → ~600 at noto 200, then a smooth soft cap.
  const raw = 8 + Math.pow(Math.max(0, notoriety), 1.35) * 1.6
  const capped = VIEWER_CEILING * (1 - Math.exp(-raw / VIEWER_CEILING)) // asymptotes to the ceiling
  return Math.max(3, Math.round(capped * fatigue))
}

// Audience fatigue from how recently/often you've streamed. Each stream tires the
// audience; it recovers ~1 "freshness" point per game-day of rest. We track a
// `streamFatigue` counter (bumped per stream, decayed per day) and map it to a
// 0.35..1 multiplier. Stream back-to-back-to-back and your 4th draws a fraction of
// the crowd; let it sit a few days and you're fresh again.
export function fatigueMult(streamFatigue = 0) {
  return Math.max(0.35, 1 - streamFatigue * 0.18) // fresh=1 · 1 recent=.82 · 3 recent=.46
}

// How much a single pull moves the room. A hit pulls people IN (and they tell friends);
// a dead pack lets the count sag a little. Returns a multiplier on current viewers.
export function viewerReaction(card, rnd = Math.random) {
  if (!card) return 1
  if (card._fromGod || card._god) return 1.6 + rnd() * 0.5      // god pack — room explodes
  if (card._fromDemigod || card._demigod) return 1.3 + rnd() * 0.4 // demigod — big surge
  if (isStreamHype(card)) return 1.18 + rnd() * 0.22            // SIR+/foil — surge
  if (isHit(card)) return 1.04 + rnd() * 0.08                   // a normal hit — modest bump
  return 0.97 + rnd() * 0.05                                    // bulk — slight drift down
}

// Tip income from a moment on stream. Viewers tip on hype; bulk packs earn cents.
// Scales with the live viewer count (more eyes = more tippers) and the pull's heat.
// Tuned so tips are a nice supplement — a hot stream rewards you, but tips alone
// shouldn't routinely out-earn the product cost (the pulls + the rep are the point).
export function tipsFor(card, viewers, rnd = Math.random) {
  const heat = card && (card._fromGod || card._god) ? 5
    : card && (card._fromDemigod || card._demigod) ? 4
    : card && isStreamHype(card) ? 1.8
    : card && isHit(card) ? 0.45
    : 0.07
  // ~0.25% of viewers drop a small tip on an average moment; far more on a chase.
  const tippers = viewers * 0.0025 * heat * (0.6 + rnd() * 0.8)
  const perTip = 1 + rnd() * 3 // $1–$4 a pop
  return Math.round(tippers * perTip * 100) / 100
}

// A stream "flops" when almost nobody shows — a real risk for a small/over-streamed
// channel. A flop earns little and can even ding rep (you went live to an empty room).
// Decided up front from the settled viewer count.
export function isFlop(settledViewers) {
  return settledViewers < 12
}

// Notoriety banked when the stream ends — driven by your PEAK viewers and how much
// hype you generated (big pulls on camera make your name). Tuned so a solid stream
// is worth a few points and a god-pack-on-stream is a real fame jump.
export function streamNotoriety(peakViewers, hypeMoments) {
  // A flop (almost no one watched) actually costs you a little face.
  if (isFlop(peakViewers)) return hypeMoments > 0 ? 0 : -1
  const fromCrowd = Math.log10(Math.max(1, peakViewers)) * 1.4 // 0 → ~4 across the curve
  const fromHype = hypeMoments * 1.5
  return Math.round(fromCrowd + fromHype)
}

// --- Live chat ---------------------------------------------------------------
// Procedural chat handles + lines. We react to the moment (hype / hit / bulk / tips /
// ambient) so the feed feels alive without any real text. Handles are gamer-y.
const CHAT_HANDLES = ['pikafan99','holoHunter','slabKing','ripsORiot','charizard_chad','mintCondition',
  'gemRate10','reverseHolo','firstEditioner','bulkBin_betty','chaseOrBust','psaPilgrim','foilFiend',
  'tcg_tina','vintageVince','no.1_collector','sleeve_steve','breakaholic','wallet_watch','luckyPulls',
  'theQuietLurker','grail_grace','master_baller','pack_rat','top_loader_tom']

// `{name}` is swapped for the actual card pulled when one is available, so chat
// reacts to YOUR pull ("THE {name}?! 🤯") instead of generic noise.
const HYPE_LINES = ['NO WAY 🤯', 'THE {name}?!?!', 'W pull 🔥🔥', '{name} LETS GOOO', 'banger 🐐',
  'I NEED that {name}', 'insane hit', 'chat we eating good', 'GRAIL ALERT', 'not the {name} 😭', 'CASE HIT?!',
  '{name} on stream?? clip it']
const GODPACK_LINES = ['GOD PACK???? 🤯🤯🤯', 'CLIP IT CLIP IT', 'this is HISTORY', 'no shot… NO SHOT',
  'best stream ever', 'I\'m shaking', 'CHAT WE WON']
const DEMIGOD_LINES = ['DEMIGOD PACK!! 👀', 'so many hits!!', 'thats stacked', 'half god pack LETS GO',
  'insane pack', 'W pack']
const HIT_LINES = ['ooo nice', 'decent hit 👍', 'that {name} will sell', 'clean pull', 'not bad not bad',
  'flip the {name} 💰', 'solid', 'gimme that {name}']
const BULK_LINES = ['bulk city', 'rip another', 'F', 'pain', 'next pack pls', 'commons again 😴',
  'one more one more', 'the curse continues', '🦗', 'sigh']
const AMBIENT_LINES = ['hi from the UK 🇬🇧', 'first time catching you live!', 'big fan', 'love the content',
  'how long you streaming?', 'what set is this', 'GL chat', 'lurking 👀', 'notification gang',
  'been here since the start', 'this your shop?', 'follow for follow?', 'wen restock']
const TIP_LINES = h => [`${h} tipped! ty 🙏`, `${h} dropped a tip 💸`, `${h} sub hype 🎉`, `${h} donated, legend`]

function pick(arr, rnd = Math.random) { return arr[Math.floor(rnd() * arr.length)] }

// One chat message reacting to the current moment. `card` (optional) lets hype/hit
// lines name the actual pull. kind: 'hype' | 'god' | 'demigod' | 'hit' | 'bulk' | 'ambient' | 'tip'
export function chatLine(kind, rnd = Math.random, card = null) {
  const handle = pick(CHAT_HANDLES, rnd)
  if (kind === 'tip') return { handle: 'system', text: pick(TIP_LINES(handle), rnd), tip: true }
  const pool = kind === 'god' ? GODPACK_LINES
    : kind === 'demigod' ? DEMIGOD_LINES
    : kind === 'hype' ? HYPE_LINES
    : kind === 'hit' ? HIT_LINES
    : kind === 'bulk' ? BULK_LINES
    : AMBIENT_LINES
  let text = pick(pool, rnd)
  // swap {name} for the real card; if there's no card, fall back to a generic word.
  text = text.replace(/\{name\}/g, card?.name || 'that one')
  return { handle, text }
}

// Classify a pull into a chat reaction kind.
export function reactionKind(card) {
  if (!card) return 'ambient'
  if (card._fromGod || card._god) return 'god'
  if (card._fromDemigod || card._demigod) return 'demigod'
  if (isStreamHype(card)) return 'hype'
  if (isHit(card)) return 'hit'
  return 'bulk'
}

// --- Box breaks --------------------------------------------------------------
// A "break" sells SPOTS on a box before you rip it. Each spot is a random TEAM
// (here, a slice of the box's cards). Buyers pay up front; you keep that cash no
// matter what comes out, then ship each spot-holder the cards that land on them.
//
// We model spots as N equal shares. Each spot costs (box price / spots) × a markup
// the audience will pay (a fair break is priced a bit over cost — people pay for the
// thrill + the shipping). Famous breakers fill more spots.

// Price per spot for a box break. `spots` shares of the box, marked up for the show.
export function spotPrice(boxPrice, spots, notoriety) {
  const perShare = boxPrice / spots
  // markup the room tolerates: ~1.15× base, climbing with fame to ~1.6×.
  const markup = 1.15 + Math.min(0.45, notoriety / 320)
  return Math.round(perShare * markup * 100) / 100
}

// How many of `spots` actually SELL before the break, given notoriety. A nobody fills
// a couple; a known breaker sells out. Returns an integer 0..spots.
export function spotsFilled(spots, notoriety, rnd = Math.random) {
  const fillRate = Math.min(0.98, 0.25 + notoriety / 160) // 25% at noto 0 → ~98% high
  let n = 0
  for (let i = 0; i < spots; i++) if (rnd() < fillRate) n++
  return n
}

export { fmtMoney }
