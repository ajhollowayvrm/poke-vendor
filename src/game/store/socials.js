// Socials slice — the player-facing actions of the 📱 content system.
//
// createSocialsSlice(set, get) returns: posting a moment by hand (the funnel every feeder
// uses when it ISN'T already inside a set()), filming a short deliberately, reading the 💬 DM
// inbox, and declaring / abandoning a 🃏 master set challenge. The per-day work — draining the feed, releasing the calendar's bank, paying the
// hunt, rolling collabs / the podcast / the sponsor cycle — lives in daytick.js, and the
// pure math lives in ../content (same split as stream.js ↔ livestream.js).

import { ownedIdSet, setById, setCompletion } from '../engine'
import {
  postPatch, challengeScale, CHALLENGE_ABANDON_DING, POST_KINDS, absoluteDay, SHORTS_PER_DAY,
} from './constants'

export function createSocialsSlice(set, get) {
  return {
    // Post a moment. Callers that are ALREADY inside a set() should fold postPatch() into
    // their own write instead of calling this (a rip must not fire a second whole-save write).
    // Returns the patch that was applied, or null if there was no channel for it.
    addPost(kind, label, value = 0) {
      const patch = postPatch(get(), kind, label, value)
      if (!patch) return null
      set(patch)
      if (patch.posts) {
        const p = patch.posts[0]
        get().log('stream', `${POST_KINDS[kind]?.icon || '📱'} Posted: ${label}${p.viral
          ? ' — and it POPPED. The algorithm picked it up and it is everywhere.'
          : ''} (≈${p.perDay}/day followers for ${p.daysLeft} days)`, 0)
      }
      return patch
    },

    // --- 🎬 Recording a short by hand -----------------------------------------------
    // Posts used to happen only TO you: rip a grail, get a gem 10 back, take in a collection,
    // and the moment posted itself. That is a good feed, but it makes the channel something
    // that happens rather than something you run. recordShort is the other door: you pick a
    // thing you own and film it deliberately.
    //
    // It goes through the SAME funnel (postPatch → makePost → pushPost), so the drip math, the
    // viral roll, the live-post cap and the Content Calendar bank all behave identically. The
    // only difference is who decided, and that decision costs a slot in the day.
    //
    // `subject`: { kind: 'card' | 'sealed' | 'page', uid?, setId?, label, value }
    recordShort(subject) {
      const s = get()
      if (!s.upgrades?.shortsChannel) return { error: 'You need the 📱 Shorts Channel to film and post.' }
      if (!subject) return { error: 'Nothing to film.' }
      const day = absoluteDay(s.currentDay, s.monthsElapsed)
      const shot = s.shortsDay === day ? (s.shortsToday || 0) : 0
      if (shot >= SHORTS_PER_DAY) {
        return { error: `You've filmed ${SHORTS_PER_DAY} today. Filming eats the day like anything else — more tomorrow.` }
      }
      // A hand-filmed short is a 'pull' post when it's a card and a 'haul' when it's product,
      // so it is value-gated by the same POST_MIN_VALUE floor as an automatic one. A $3
      // reverse holo is not a video whether the game filmed it or you did.
      const kind = subject.kind === 'page' ? 'page' : subject.kind === 'sealed' ? 'haul' : 'pull'
      const patch = postPatch(s, kind, subject.label, subject.value || 0)
      if (!patch) {
        return { error: `${subject.label} isn't worth a video — nobody watches a clip of that.` }
      }
      set({ ...patch, shortsDay: day, shortsToday: shot + 1 })
      const p = patch.posts?.[0]
      get().log('stream', `🎬 Filmed and posted: ${subject.label}${p?.viral
        ? ' — and it POPPED.' : ''}${p ? ` (≈${p.perDay}/day followers for ${p.daysLeft} days)` : ' — banked for the Content Calendar.'}`, 0)
      get().addHype(2) // you made something today
      return { ok: true, post: p || null, banked: !patch.posts }
    },
    shortsLeftToday() {
      const day = absoluteDay(get().currentDay, get().monthsElapsed)
      const shot = get().shortsDay === day ? (get().shortsToday || 0) : 0
      return Math.max(0, SHORTS_PER_DAY - shot)
    },

    // --- 💬 DMs ---------------------------------------------------------------------
    // Read one (it stops being unread) and clear one. The generation lives in the day tick,
    // beside the walk-in and online-order rates it deliberately sits apart from: buyer orders
    // are the STORE's inbox, these are the CHANNEL's.
    readDm(id) {
      set(st => ({ dms: (st.dms || []).map(d => (d.id === id ? { ...d, read: true } : d)) }))
    },
    clearDm(id) {
      set(st => ({ dms: (st.dms || []).filter(d => d.id !== id) }))
    },
    clearReadDms() {
      set(st => ({ dms: (st.dms || []).filter(d => !d.read) }))
    },

    // --- 🃏 Master set challenge ---------------------------------------------------------
    // Announce the set you're chasing. Everything the challenge pays scales by how much of it
    // was left when you declared, so this is a real commitment, not a victory lap over a set
    // you've already finished. One at a time.
    declareChallenge(setId) {
      const s = get()
      if (!s.upgrades?.setChallenge) return { error: 'You need the 🃏 Master Set Challenge kit to announce a chase.' }
      if (s.challenge) return { error: `You're already chasing the ${s.challenge.setName} on camera — finish it or drop it first.` }
      const set_ = setById(setId)
      if (!set_) return { error: 'No such set.' }
      // 📒 A chase is a binder you are filling on camera. Without a binder for the set there
      // is no page, so there is nothing to film landing.
      if (!(s.binders || []).some(b => b.setId === setId)) {
        return { error: `Start a ${set_.name} binder first — a chase is a page you're filling.` }
      }
      if ((s.completedSets || []).includes(setId)) return { error: `You've already completed ${set_.name} — there's no chase to film.` }
      const owned = ownedIdSet([...(s.collection || []), ...(s.binder || [])])
      const comp = setCompletion(set_, owned)
      const scale = challengeScale(comp.owned, comp.total)
      const challenge = {
        setId, setName: set_.name, startDay: absoluteDay(s.currentDay, s.monthsElapsed),
        startPlaced: comp.owned, total: comp.total, placed: comp.owned,
        landed: 0, episodes: 0, scale: Math.round(scale * 100) / 100,
      }
      set({ challenge })
      get().addHype(6) // announcing a chase is itself a moment
      get().log('stream', `🃏 Challenge announced: the ${set_.name} MASTER SET — ${comp.owned}/${comp.total} in hand. Dealers will start pulling ${set_.name} out of their bins for you, and every card you land is an episode.${scale < 0.35 ? ' (You\'re a long way in already, so the payoff video pays accordingly.)' : ''}`, 0)
      return { ok: true, challenge }
    },

    // Walk away from a chase you announced. A small ding — you told people you'd finish it —
    // deliberately nowhere near a scandal; it just isn't free.
    abandonChallenge() {
      const c = get().challenge
      if (!c) return { error: 'No challenge running.' }
      set({ challenge: null })
      get().addNotoriety(-CHALLENGE_ABANDON_DING, false, 'dings')
      get().log('stream', `🃏 You quietly dropped the ${c.setName} master set challenge — the people following the series noticed. (−${CHALLENGE_ABANDON_DING}★)`, 0)
      return { ok: true }
    },

    // Live progress readout for the UI (nothing stored — same idea as showcaseSetIds).
    challengeProgress() {
      const s = get()
      if (!s.challenge) return null
      const set_ = setById(s.challenge.setId)
      if (!set_) return null
      const owned = ownedIdSet([...(s.collection || []), ...(s.binder || [])])
      const comp = setCompletion(set_, owned)
      return { ...s.challenge, placed: comp.owned, total: comp.total, remaining: Math.max(0, comp.total - comp.owned) }
    },
  }
}
