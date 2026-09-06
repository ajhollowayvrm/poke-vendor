// 💬 The socials inbox — the messages your CHANNEL brings you.
//
// The store already has an inbox: buyers, walk-ins, sellers with a collection in a carrier
// bag. That one is transactional, and every entry in it is a decision about money. This is
// the other kind of message, and keeping them apart is the whole point: an audience does not
// only send you customers. It sends you a fifteen-year-old asking what a reverse holo is, a
// creator with twice your followers proposing a video, a brand's marketing coordinator, and
// somebody who is furious that you sold a card they wanted.
//
// Nothing here moves money on its own. A DM is a prompt — it points at a system that already
// exists (the collab rapport, the sponsor cycle, your listings) or it is simply weather.
// Volume scales with followers, because that is the only thing that could cause it.

import { round2 } from './engine'

export const DM_CAP = 24            // how many we keep; the oldest READ ones fall off first
export const DM_BASE_CHANCE = 0.10  // per day, before followers
export const DM_MAX_PER_DAY = 3

// Messages per day, as a rate to draw against. An empty channel gets almost nothing; a big
// one gets a handful. Deliberately sub-linear — a hundred thousand followers must not mean a
// hundred thousand messages, and the inbox is capped besides.
export function dmRate(followers = 0) {
  return DM_BASE_CHANCE + Math.min(0.9, Math.sqrt(Math.max(0, followers)) / 40)
}

const HANDLES = ['pack_rat_99', 'HoloHannah', 'binderdad', 'mistyfan2004', 'SlabCitySteve',
  'gradedgremlin', 'the_pull_zone', 'CardboardKaren', 'vintage_vince', 'shiny_hunter_ash',
  'PackKingLive', 'TheBreakRoomTV', 'bulk_bin_billy', 'psa10dreams', 'firstedjeff']
const AVATARS = ['🧢', '🐉', '⚡', '🔥', '💎', '🎴', '👾', '🦊', '🌙', '🍀', '🎯', '🧃']

// Each kind names a REAL system, or admits to being noise. A DM that promised something the
// game cannot deliver would be worse than no DM at all.
export const DM_KINDS = {
  fan: {
    weight: 30, icon: '💬', label: 'A viewer',
    lines: [
      'been watching since the {set} rips. what got you into this?',
      'that pull was insane. do you actually keep any of them or is it all for sale?',
      'my mum threw out my binder in 2004 and i have never recovered. love the channel.',
      'genuine question — is grading worth it for a card under a hundred bucks?',
    ],
  },
  question: {
    weight: 20, icon: '❓', label: 'Asking for advice',
    lines: [
      'is a reverse holo worth more than the normal one? everyone says something different',
      'found a box of my old cards. how do i even tell if any of it is worth anything?',
      'what grader do you actually use? PSA takes forever',
      'my local shop wants 40% of market for a buylist. is that normal or am i being robbed?',
    ],
  },
  buyer: {
    weight: 18, icon: '🛒', label: 'After something of yours',
    lines: [
      'saw the {set} card on your last video — is that up for sale anywhere?',
      'do you ship? been trying to find that one for months',
      'any chance you would part with something from the binder? name a price',
    ],
  },
  collab: {
    weight: 10, icon: '🤝', label: 'Another creator',
    lines: [
      'love the channel. want to do a joint break sometime? i will bring the product',
      'we should do a video together — your rips, my terrible luck',
    ],
  },
  brand: {
    weight: 7, icon: '💰', label: 'Marketing',
    lines: [
      'Hi! Reaching out from a sleeve brand — would you be open to a paid feature?',
      'We run a card-supply store and we are looking for creators to work with this quarter.',
    ],
  },
  lowball: {
    weight: 10, icon: '🪙', label: 'Lowballer',
    lines: [
      '$20 for the whole binder, cash today, i can drive',
      'ill give you 30 for the slab. its really not worth what you think',
      'bro just sell me the lot for 100 you are not going to do better',
    ],
  },
  hate: {
    weight: 5, icon: '😤', label: 'Not a fan',
    lines: [
      'you are the reason prices are like this. hope the bubble pops',
      'imagine gatekeeping cardboard. unsubscribed',
    ],
  },
}
const KIND_LIST = Object.entries(DM_KINDS).map(([key, v]) => ({ key, ...v }))
const WEIGHT_TOTAL = KIND_LIST.reduce((a, k) => a + k.weight, 0)

function pickKind(rnd) {
  let r = rnd() * WEIGHT_TOTAL
  for (const k of KIND_LIST) { r -= k.weight; if (r <= 0) return k }
  return KIND_LIST[0]
}

// `setName` fills the {set} slot so a message can name something you actually ripped — the
// difference between "a viewer" and "somebody who watched your video".
let _seq = 0
export function makeDm(day, { followers = 0, setName = null } = {}, rnd = Math.random) {
  // Collab and brand messages only make sense once there is an audience to talk to. Below the
  // floor they re-roll into an ordinary viewer, rather than being dropped — the message rate
  // is the audience's job, not the kind table's.
  let k = pickKind(rnd)
  if ((k.key === 'collab' || k.key === 'brand') && followers < 40) k = DM_KINDS.fan && { key: 'fan', ...DM_KINDS.fan }
  const line = k.lines[Math.floor(rnd() * k.lines.length)]
  return {
    id: `dm${day}_${_seq++}_${Math.floor(rnd() * 1e6).toString(36)}`,
    from: HANDLES[Math.floor(rnd() * HANDLES.length)],
    avatar: AVATARS[Math.floor(rnd() * AVATARS.length)],
    kind: k.key,
    body: line.replace('{set}', setName || 'that set'),
    day, read: false,
  }
}

// Keep the inbox from growing forever: read messages age out first, then the oldest unread.
// An inbox that only grows is one nobody opens.
export function trimDms(dms) {
  const list = dms || []
  if (list.length <= DM_CAP) return list
  const unread = list.filter(d => !d.read)
  const read = list.filter(d => d.read)
  const keepRead = Math.max(0, DM_CAP - unread.length)
  return [...unread, ...read.slice(0, keepRead)].slice(0, DM_CAP)
}

// How many arrive over `days`, given the audience. Drawn per day so a multi-day show does not
// dump a fortnight of messages at once.
export function drawDms(days, followers, dayOf, ctx, rnd = Math.random) {
  const out = []
  const rate = dmRate(followers)
  for (let i = 0; i < days; i++) {
    let n = 0
    while (n < DM_MAX_PER_DAY && rnd() < rate) n++
    for (let j = 0; j < n; j++) out.push(makeDm(dayOf(i), { followers, ...ctx }, rnd))
  }
  return out
}

export function unreadCount(dms) { return (dms || []).filter(d => !d.read).length }
export { round2 }
