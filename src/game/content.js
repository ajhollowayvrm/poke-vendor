// Content & audience system — the half of building a name that isn't going live.
//
// The channel already had followers, subs, clips and hype, but every one of them was gated
// behind a BROADCAST, and a broadcast costs a whole game-day. That's not how vendors actually
// build an audience: they film what they were already doing. The chase that came out of a
// kitchen-table rip, the gem 10 that turned up in the mail, the collection dumped on the
// counter, the walkthrough of a show hall, the master set page that finally filled. None of
// that costs a day — it costs a phone.
//
// So: MOMENTS YOU ALREADY GENERATE BECOME POSTS. A post is a small, short-lived follower drip
// (see `posts` in the day tick — same shape and same drain as the 🎬 stream clip it's modelled
// on). Everything here is pure math with no store access, like stream.js and rep.js; the
// slices import it through ./store/constants.
//
// The rails this system is built to respect:
//  • A post is worth a FRACTION of a stream clip. Streaming stays the big lever — short-form
//    is the floor that means a quiet week still builds the channel.
//  • Followers keep their existing ≤+15% online-order cap (see daytick's followerBump). More
//    follower SOURCES must not make that cap trivial to max, so per-post gains stay small.
//  • Nothing here introduces a new demand or price multiplier. Content feeds 🔥 hype through
//    bumpHype only, so the ×1.35 demand / ×1.05 price caps in rep.js still bound everything.
//  • The one cash faucet is 💰 sponsorship, and it's hard-capped and carries an obligation.

const round1 = x => Math.round(x * 10) / 10
const round2 = x => Math.round(x * 100) / 100
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))

// --- 📱 Posts ----------------------------------------------------------------------------
// A post circulates for a couple of days, recruiting `perDay` followers, then falls off the
// feed. Deliberately shorter-lived than a clip (3 days) and worth less per day.
export const POST_DAYS = 2
// How many posts can be circulating at once. A 36-pack booster box would otherwise carpet-bomb
// the feed with a dozen posts in one sitting; the cap means a big rip produces a few HIGHLIGHTS,
// not a wall. A new post over the cap displaces the weakest one currently running.
export const MAX_LIVE_POSTS = 4
// 🔁 The Content Calendar's bank: moments wait here for their slot instead of firing at once.
export const POST_QUEUE_CAP = 8
// How many shorts you can film YOURSELF in a day. Filming is a real use of the day, and an
// uncapped "post for followers" button would make every other way of growing an audience
// pointless. Four matches MAX_LIVE_POSTS — you can fill the feed, and no more.
export const SHORTS_PER_DAY = 4

export const POST_KINDS = {
  pull: { icon: '🔥', label: 'chase pull' },
  gem:  { icon: '💎', label: 'gem 10 reveal' },
  haul: { icon: '📦', label: 'collection haul' },
  page: { icon: '🖼️', label: 'completed page' },
  hunt: { icon: '🃏', label: 'set-hunt episode' },
  vlog: { icon: '🎥', label: 'show vlog' },
}
export function postIcon(kind) { return POST_KINDS[kind]?.icon || '📱' }

// Not every moment is worth filming. A $3 reverse holo is not a video; the floor is what keeps
// the feed made of actual highlights (and keeps the per-day cap meaningful).
export const POST_MIN_VALUE = { pull: 40, gem: 25, haul: 150, page: 0, hunt: 0, vlog: 0 }
export function worthPosting(kind, value) { return (value || 0) >= (POST_MIN_VALUE[kind] ?? 0) }

// Followers per day for one post. Value-scaled with a hard ceiling per kind — a grail pull
// posts better than a $50 hit, but a $30,000 slab doesn't post 600× better. The ceilings are
// what keep short-form a floor rather than a replacement for the broadcast.
//   $60 pull → 2.2/day (~4 followers total) · $500 pull → 10/day (~20) · gem 10 → up to 12/day
export function postDrip(kind, value = 0) {
  const v = Math.max(0, value || 0)
  switch (kind) {
    case 'gem':  return round1(clamp(2 + v * 0.02, 1, 12))
    case 'page': return round1(clamp(3 + v * 0.004, 3, 15)) // a master set is the flagship post
    case 'haul': return round1(clamp(1 + v * 0.008, 1, 8))
    case 'vlog': return round1(clamp(2 + v * 0.01, 2, 14))
    case 'hunt': return round1(clamp(1 + v * 0.02, 1, 8))
    default:     return round1(clamp(1 + v * 0.02, 1, 10))
  }
}

// The algorithm lottery. Most posts do their small honest numbers; occasionally one catches and
// does absurd numbers for a couple of days. This is the whole reason short-form is exciting
// rather than a spreadsheet, and it's why the viral roll lives INSIDE the Shorts Channel
// upgrade instead of being sold separately — an upgrade that sells "sometimes it works" is a
// worse buy than one that sells a floor and throws the lottery in.
export const VIRAL_CHANCE = 0.05
export const VIRAL_MULT = 6
export function rollViral(rnd = Math.random) { return rnd() < VIRAL_CHANCE }

export function makePost(kind, label, value = 0, viral = false) {
  return {
    kind, label, value: round2(value || 0), viral,
    perDay: round1(postDrip(kind, value) * (viral ? VIRAL_MULT : 1)),
    daysLeft: POST_DAYS + (viral ? 1 : 0), // a hit runs a day longer
  }
}

// Fold a new post into the running feed, respecting MAX_LIVE_POSTS: if the feed is full, the
// newcomer only gets in by beating the weakest post already running (and takes its slot).
export function pushPost(posts, post) {
  const feed = [...(posts || [])]
  if (feed.length < MAX_LIVE_POSTS) return [post, ...feed]
  let worstIdx = 0
  for (let i = 1; i < feed.length; i++) if ((feed[i].perDay || 0) < (feed[worstIdx].perDay || 0)) worstIdx = i
  if ((post.perDay || 0) <= (feed[worstIdx].perDay || 0)) return feed // nothing here it can beat
  feed.splice(worstIdx, 1)
  return [post, ...feed]
}

// Fold a moment into whichever pipe the player owns and return the STATE PATCH — straight into
// the live feed, or into the 🔁 Content Calendar's bank to go out on schedule. Returns null when
// there's no channel for it or the moment isn't worth filming.
//
// It returns a patch rather than doing the write itself because the hottest caller is a pack
// rip: every set() re-serializes the entire save (see the save-write cost note in
// collection.checkCompletions), so a rip must fold this into the ONE write it already makes.
export function postPatch(state, kind, label, value, rnd = Math.random) {
  const gate = kind === 'vlog' ? state?.upgrades?.showVlog : state?.upgrades?.shortsChannel
  if (!gate) return null
  if (!worthPosting(kind, value)) return null
  if (state.upgrades?.contentCalendar) {
    let q = [...(state.postQueue || []), { kind, label, value: round2(value || 0) }]
    // Bank overflow keeps the BEST moments waiting, not the oldest — a week of good material
    // shouldn't be crowded out by the $40 hit that happened to land first.
    if (q.length > POST_QUEUE_CAP) {
      q = q.sort((a, b) => postDrip(b.kind, b.value) - postDrip(a.kind, a.value)).slice(0, POST_QUEUE_CAP)
    }
    return { postQueue: q }
  }
  return { posts: pushPost(state.posts, makePost(kind, label, value, rollViral(rnd))) }
}

// 🔁 Posting consistently beats posting in bursts — the same "cadence over bingeing" idea the
// stream's rhythmMult already encodes, and the reason the Content Calendar exists. Capped low:
// it multiplies an already-small drip.
export function cadenceMult(streak) { return 1 + Math.min(0.25, Math.max(0, streak || 0) * 0.03) }

// --- 🃏 Master set challenge -------------------------------------------------------------
// Declare a set you're chasing, on camera. The hunt becomes the series: the show floor starts
// surfacing that set's singles, every card you land is an episode, and finishing it is the
// payoff video everyone came for.

// What share of a show booth's singles bin skews toward the set you're publicly chasing.
// This is THEMING, not an economy change: the biased draw goes through cardFromSetsInRange,
// which keeps the card inside the same value band the bin would have used anyway (the same
// rail the era-themed buy-in pools ride). You find more of what you're chasing; you don't find
// it cheaper.
export const CHALLENGE_BIAS = 0.22

// How far in you were when you declared. Declaring a set you're already 90% through is not a
// challenge and doesn't pay like one — every reward below scales by (1 − startPct).
export function challengeScale(startPlaced, total) {
  if (!(total > 0)) return 0
  return clamp(1 - startPlaced / total, 0, 1)
}

// Landing a card you're publicly chasing is content in itself — that's the format. Small per
// card (the grind pays audience, not a jackpot), value-tilted so a chase lands harder.
export function huntFollowers(cardVal = 0, scale = 1) {
  return Math.max(1, Math.round((1 + clamp((cardVal || 0) * 0.05, 0, 8)) * clamp(scale, 0.15, 1)))
}
// Every Nth card landed cuts an episode rather than posting on every single card — a feed of
// 300 "found another common" posts is noise, and the post cap would eat them anyway.
export const HUNT_EPISODE_EVERY = 5

// The completion video. One-time, scaled by how much of the set you actually chased on camera
// and by how big a set it is. Capped so a monster set can't mint an audience outright.
export function challengeBounty(total, setValue, scale) {
  const sc = clamp(scale, 0, 1)
  return {
    followers: Math.round(clamp((50 + (total || 0) * 0.6 + Math.sqrt(Math.max(0, setValue)) * 1.5) * sc, 0, 400)),
    hype: Math.round(clamp(20 * sc, 0, 20)),
    clout: sc >= 0.5 ? 2 : 1,
    noto: Math.round(clamp(10 * sc, 0, 10)),
  }
}
// Walking away from a challenge you announced. Small — it's an embarrassment, not a scandal
// (the user's rep design explicitly has no scandal events) — but it isn't free either.
export const CHALLENGE_ABANDON_DING = 2

// --- 🎥 Show vlog ------------------------------------------------------------------------
// "Come to a card show with me." Scales with the hall (a Worlds walkthrough outdraws a church-
// hall meetup) and with the best thing you came home with.
export function vlogFollowers(tierIdx = 0, bestValue = 0, rnd = Math.random) {
  const base = 8 + Math.max(0, tierIdx) * 6 + clamp((bestValue || 0) * 0.05, 0, 60)
  return Math.max(3, Math.round(base * (0.8 + rnd() * 0.4)))
}
// Days of listing traffic the vlog buys you on the way home — the same afterglow window a
// stream opens (streamHypeDaysLeft), deliberately shorter.
export const VLOG_AFTERGLOW_DAYS = 2
// People recognize you at the next hall. Same altitude as 🪧 signage, and it stacks with it.
export const VLOG_BOOTH_MULT = 1.12

// --- 💬 Community ------------------------------------------------------------------------
// A Discord turns an audience into a customer base. All three effects point the audience at
// the SHOP rather than at the channel (that's what separates it from 🛡️ Mod Team).
export const DISCORD_WANT_BONUS = 0.15   // added to the per-day chance a collector want posts
export const DISCORD_WANT_CAP_BONUS = 1  // one more want can be live at a time
export const DISCORD_HOLD_SKEW = 0.55    // share of community wants that name a set you HOLD
// Chance per day that a member becomes an actual customer. Scales with the size of the room,
// capped hard — the regular roster is deliberately small and personal (see formRegular).
export function discordRegularChance(followers = 0, days = 1) {
  return clamp((0.01 + Math.min(0.05, (followers || 0) / 4000)) * days, 0, 0.12)
}

// --- 🤝 Creator collabs ------------------------------------------------------------------
// Guest appearances: you go on THEIR stream, so it costs no day of yours. Bigger and more
// reliable than the random raid, and each creator you've worked with before brings more.
export const COLLAB_CREATORS = ['PackKingLive', 'HoloHannah', 'TheBreakRoomTV', 'SlabCitySteve',
  'RipsNGiggles', 'MintyMara', 'ChaseCardCarl', 'VintageVeraTV']
export const COLLAB_CHANCE = 0.12        // per day, with the upgrade
export const COLLAB_MIN_FOLLOWERS = 40   // nobody collabs with an empty channel
export function collabGain(notoriety = 0, followers = 0, rapport = 0, rnd = Math.random) {
  const reach = (30 + Math.max(0, notoriety) * 0.3 + Math.min(120, (followers || 0) * 0.05))
    * (1 + Math.min(0.6, (rapport || 0) * 0.2))   // a repeat guest gets the better slot
  return {
    followers: Math.max(5, Math.round(reach * (0.7 + rnd() * 0.6))),
    subs: Math.max(0, Math.round(reach * 0.02 * rnd())),
    hype: 6,
  }
}

// --- 🎙️ Podcast -------------------------------------------------------------------------
// The slow one. A weekly episode doesn't spike anything — it just means people in the hobby
// know who you are, forever. So it pays ⭐ (permanent standing) rather than 🔥 hype, which is
// the opposite of everything else in this file.
export const PODCAST_PERIOD = 7
export const PODCAST_REP = 2
export function podcastFollowers(notoriety = 0, rnd = Math.random) {
  return Math.max(2, Math.round((4 + Math.max(0, notoriety) * 0.05) * (0.7 + rnd() * 0.6)))
}
// You hear a reprint is coming before it hits the price boards: the market softening that
// normally lands WITH the announcement is held back this many days, which is your window to
// sell into the old price. Real intel, and the only way to actually profit from a wave you're
// holding stock for.
export const PODCAST_WAVE_LEAD_DAYS = 2

// --- 💰 Brand deals ----------------------------------------------------------------------
// The audience finally becomes an income line. Hard-capped: at the ceiling this is a useful
// supplement beside a $120/day store lease, never a replacement for selling cards.
export const SPONSOR_BRANDS = [
  { name: 'Toploader Co.', icon: '🧴' }, { name: 'SleeveWorks', icon: '🎴' },
  { name: 'GradeGuard', icon: '🛡️' }, { name: 'BinderBarn', icon: '📒' },
  { name: 'CaseBreak Coffee', icon: '☕' }, { name: 'PullRate Energy', icon: '⚡' },
]
export const SPONSOR_MONTHLY_CAP = 750
export const SPONSOR_MIN_FOLLOWERS = 250  // nobody sponsors a channel nobody watches
export const SPONSOR_PERIOD = 30          // the check clears monthly
export const SPONSOR_WINDOW_DAYS = 12     // days to honour the feature before the deal lapses
export const SPONSOR_FEATURE_PACKS = 3    // packs of their set you must actually rip on camera
export const SPONSOR_LAPSE_DING = 3
export function sponsorMonthly(followers = 0, subs = 0) {
  return round2(clamp(40 + (followers || 0) * 0.25 + (subs || 0) * 1.5, 40, SPONSOR_MONTHLY_CAP))
}

export { round1, round2 }
