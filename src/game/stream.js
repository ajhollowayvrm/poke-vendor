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
export function baseViewers(notoriety, fatigue = 1, followers = 0) {
  // ~8 at noto 0 → ~60 at noto 40 → ~600 at noto 200, then a smooth soft cap.
  // Followers are your RETURNING audience — a reliable crowd that shows regardless of
  // fame, so building a channel over time lifts every stream's floor (~0.35 viewers each).
  const raw = 8 + Math.pow(Math.max(0, notoriety), 1.35) * 1.6 + Math.max(0, followers) * 0.35
  const capped = VIEWER_CEILING * (1 - Math.exp(-raw / VIEWER_CEILING)) // asymptotes to the ceiling
  return Math.max(3, Math.round(capped * fatigue))
}

// What you're RIPPING changes the crowd size. Vintage sealed is appointment viewing — cracking
// a sealed 1999 pack on camera pulls people in from everywhere (everyone wants to witness the
// Base Charizard hit… or the heartbreak). Older aftermarket sealed draws a smaller bump, and a
// big-ticket box pulls a few more eyes than a $5 pack. Returns a multiplier on the viewer count.
export function streamDrawMult(set, product) {
  let m = set?.vintage ? 1.9 : set?.secondary ? 1.3 : 1.0
  const price = product?.price || 0
  m *= 1 + Math.min(0.35, price / 1200) // a pricey box draws more than a single pack
  return Math.round(m * 100) / 100
}

// New followers a stream earns — your returning audience grows when the room is big and
// you make hype moments on camera. A flop wins none. Giveaways add on top (see Livestream).
export function followersGained(peakViewers, hypeMoments, flopped = false) {
  if (flopped) return 0
  return Math.max(0, Math.round(peakViewers * 0.02 + hypeMoments * 4))
}

// The HYPE TRAIN: consecutive hit/hype pulls stack a combo that multiplies tips and keeps
// the room electric. Level 0 = no train running; each level adds 30% to tips, capped so a
// god-pack run rewards big without breaking the tip economy. A bulk pull derails it.
export const HYPE_TRAIN_MAX = 6
export function hypeTrainMult(level) {
  return 1 + Math.min(HYPE_TRAIN_MAX, Math.max(0, level)) * 0.3
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
// `ignoreGod`: the caller applies the god/demigod "room explodes" bump ONCE per pack (on
// the first card), then passes ignoreGod=true for the rest — otherwise every one of the
// 10 top-rarity cards in a god pack compounds a 1.6-2.1× multiply (~110×+ viewers/pack).
// With ignoreGod the remaining cards fall to their real-rarity reaction (a modest surge).
export function viewerReaction(card, rnd = Math.random, ignoreGod = false) {
  if (!card) return 1
  if (!ignoreGod && (card._fromGod || card._god)) return 1.6 + rnd() * 0.5      // god pack — room explodes
  if (!ignoreGod && (card._fromDemigod || card._demigod)) return 1.3 + rnd() * 0.4 // demigod — big surge
  if (isStreamHype(card)) return 1.18 + rnd() * 0.22            // SIR+/foil — surge
  if (isHit(card)) return 1.04 + rnd() * 0.08                   // a normal hit — modest bump
  return 0.97 + rnd() * 0.05                                    // bulk — slight drift down
}

// Tip income from a moment on stream. Viewers tip on hype; bulk packs earn cents.
// Scales with the live viewer count (more eyes = more tippers) and the pull's heat.
// Tuned so tips are a nice supplement — a hot stream rewards you, but tips alone
// shouldn't routinely out-earn the product cost (the pulls + the rep are the point).
export function tipsFor(card, viewers, rnd = Math.random, hypeMult = 1) {
  const heat = card && (card._fromGod || card._god) ? 5
    : card && (card._fromDemigod || card._demigod) ? 4
    : card && isStreamHype(card) ? 1.8
    : card && isHit(card) ? 0.45
    : 0.07
  // ~0.25% of viewers drop a small tip on an average moment; far more on a chase.
  const tippers = viewers * 0.0025 * heat * (0.6 + rnd() * 0.8)
  const perTip = 1 + rnd() * 3 // $1–$4 a pop
  // A running hype train multiplies what viewers throw (see hypeTrainMult).
  return Math.round(tippers * perTip * Math.max(1, hypeMult) * 100) / 100
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

// --- Giveaways & announced streams -------------------------------------------
// 🎁 A live giveaway hypes the ROOM, not just your follower count: the crowd surges to
// watch the raffle. Value-scaled — a penny common barely moves the needle, a real chase
// on the line pulls a spike.
export function giveawayViewerMult(value) {
  return 1.05 + Math.min(0.55, (value || 0) / 350)
}

// Gratitude tips while the raffle runs: the room throws money at a generous streamer.
// Scaled by the live crowd and the prize (capped so a whale giveaway can't print cash).
export function giveawayTips(value, viewers, rnd = Math.random, hypeMult = 1) {
  const tippers = viewers * 0.004 * (1 + Math.min(3, (value || 0) / 100)) * (0.6 + rnd() * 0.8)
  const perTip = 1 + rnd() * 3
  return Math.round(tippers * perTip * Math.max(1, hypeMult) * 100) / 100
}

// 📣 Announced streams: promise a broadcast days ahead (optionally headlining ONE card
// you'll give away on the night) and the room shows up bigger for it. Lead time builds
// anticipation; a prize people actually want adds real draw. Capped so promo hype stays
// a multiplier on your fame, not a replacement for it.
export function promoViewerMult(promo) {
  if (!promo) return 1
  const lead = Math.min(3, Math.max(1, promo.lead || 1))
  const prize = Math.min(0.45, (promo.cardValue || 0) / 400)
  return Math.round(Math.min(1.8, 1 + 0.12 * lead + prize) * 100) / 100
}

// Extra followers for actually DELIVERING the promised giveaway on the night — the room
// came for this exact moment, and keeping your word converts them.
export function promoDeliveryFollowers(promo) {
  return 10 + Math.min(80, Math.round((promo?.cardValue || 0) * 0.4))
}

// 🎯 Chase bounty: declaring "if I pull {card} tonight, chat wins it" before a rip. The
// conditional promise alone draws a crowd — scaled by how badly people want the card,
// capped so the stakes never outdraw your actual fame.
export function bountyDrawMult(value) {
  return 1 + Math.min(0.25, (value || 0) / 800)
}

// 📆 Weekly rhythm: streaming on a steady cadence (~3–10 days apart) builds a loyal crowd
// that shows up bigger every time. The streak is the count of consecutive on-rhythm streams;
// going dark >10 days forfeits it (rhythmStreakNow), bingeing just doesn't grow it (and
// fatigue already bites). Up to +30% at a 6-streak.
export function rhythmMult(streak) {
  return 1 + Math.min(0.30, Math.max(0, streak || 0) * 0.05)
}
// The streak that's actually LIVE right now: a long absence forfeits it even before the
// next endStream writes the reset — the comeback stream must not inherit the old bonus.
export function rhythmStreakNow(streak, lastStreamDay, today) {
  if (lastStreamDay == null) return 0
  return (today - lastStreamDay > 10) ? 0 : Math.max(0, streak || 0)
}

// ❤️ Subscribers won by a live moment. Hype converts watchers into paying members of the
// channel; a god pack or a raid converts hardest. Always at least 1 — somebody in the
// room was on the fence.
export function subsFor(viewers, kind, rnd = Math.random) {
  const base = kind === 'god' ? 4 : kind === 'raid' ? 3 : kind === 'giveaway' ? 2 : 1
  return Math.max(1, Math.round(base + viewers * 0.002 * (0.5 + rnd())))
}

// 🎬 Does tonight's best moment become a CLIP? A god pack always clips; otherwise a big
// enough single pull (≥$60). The clip circulates for a few days after the wrap, recruiting
// followers daily — deliberately NOT gated on a flop: nobody saw it live, but the clip
// blowing up afterward is half the fantasy.
export function clipFor(peakViewers, bestValue, hadGod, bestName, editor = false) {
  if (hadGod) return { daysLeft: 3, perDay: Math.min(40, Math.round(10 + peakViewers * 0.008)), label: 'god pack' }
  if ((bestValue || 0) >= 60) return { daysLeft: 3, perDay: Math.min(30, Math.round(4 + bestValue * 0.05)), label: `${bestName} pull` }
  // 🎬 Clip Editor: no organic viral moment, but the editor still cuts a highlight reel —
  // a modest drip for a couple of days, so no broadcast leaves nothing behind.
  if (editor) return { daysLeft: 2, perDay: Math.min(12, Math.round(2 + peakViewers * 0.004)), label: bestName ? `${bestName} highlights` : 'stream highlights' }
  return null
}

// 💥 Raids: when your room is popping off, another streamer may send their whole audience
// over. Size scales with YOUR standing (a raid finds you through the clips and the name).
const RAIDERS = ['PackKingLive', 'HoloHannah', 'TheBreakRoomTV', 'SlabCitySteve', 'RipsNGiggles',
  'MintyMara', 'ChaseCardCarl', 'VintageVeraTV']
export function rollRaid(notoriety, followers, rnd = Math.random) {
  const size = Math.round((25 + rnd() * 75)
    * (1 + Math.min(3, Math.max(0, followers) / 300))
    * (1 + Math.min(1.5, Math.max(0, notoriety) / 250)))
  return { by: RAIDERS[Math.floor(rnd() * RAIDERS.length)], size }
}

// 🛍️ Mid-stream shelf sale premium: a hyped room shops impulsively — the hotter the train,
// the more a viewer will pay over market for a single off your store floor.
export function streamSaleMult(hypeLevel) {
  return 1.06 + Math.min(HYPE_TRAIN_MAX, Math.max(0, hypeLevel)) * 0.045
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

// A random chat handle — for attributing live orders (rip orders, mystery-pack buys).
export function randomChatHandle(rnd = Math.random) { return pick(CHAT_HANDLES, rnd) }

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

// --- Live rip orders (Pokebank-style) ----------------------------------------
// With the Live Rip Service upgrade, viewers pay a PREMIUM to have you crack a product
// you hold on camera and ship them everything that comes out. You keep the markup no
// matter what hits — the vendor's edge is the markup, not the pull. This is separate
// from a box BREAK (many spots on one box); a rip order is one whole product, one buyer.

// What a viewer will pay to have you rip a whole product live for them. It's the product's
// value plus a markup that climbs with your fame (a known ripper commands more) and with the
// draw of what's being cracked (vintage/older sealed on camera is a bigger ask). Tuned so the
// order is reliably profitable vs the product's cost — the markup is the whole point.
export function ripOrderPrice(product, notoriety, set) {
  const value = product?.price || 0
  // ~1.2× at noto 0 → ~1.6× at high fame, then a small draw bump for hype product.
  const markup = 1.2 + Math.min(0.4, Math.max(0, notoriety) / 320) + (streamDrawMult(set, product) - 1) * 0.15
  return Math.round(value * markup * 100) / 100
}

// Roll a single incoming rip order from your remaining held inventory. Picks a random held
// item and a buyer handle; the caller owns arrival timing/frequency. Returns null if you
// hold nothing to rip. `heldItems` are raw sealedInventory rows ({ uid, setId, product }).
export function rollRipOrder(heldItems, notoriety, setResolver, rnd = Math.random) {
  const pool = heldItems || []
  if (!pool.length) return null
  const it = pool[Math.floor(rnd() * pool.length)]
  const set = setResolver ? setResolver(it.setId) : null
  const buyer = pick(CHAT_HANDLES, rnd)
  return {
    id: `ro-${it.uid}-${Math.floor(rnd() * 1e9)}`,
    buyer, invUid: it.uid, setId: it.setId, product: it.product,
    price: ripOrderPrice(it.product, notoriety, set),
  }
}

export { fmtMoney }
