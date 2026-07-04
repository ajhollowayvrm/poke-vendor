// Livestream slice — going live to rip on camera + box breaks.
//
// createLivestreamSlice(set, get) returns: collecting up-front break-spot cash, the current
// audience-freshness readout, selling a live spot mid-stream, shipping break cards to
// spot-holders, and endStream (bank tips + notoriety, open the listing afterglow, tire the
// audience, and burn a game-day through the shared day-tick). The viewer/tip/chat math is
// pure and lives in ../stream (game); this slice is the state mutations around it.

import { round2, cardValue } from '../engine'
import { fatigueMult } from '../stream'
import { advanceDaysWith } from './daytick'
import { STREAM_HYPE_DAYS, INCOME_WINDOW_DAYS } from './constants'

export function createLivestreamSlice(set, get) {
  return {
    // Collect the up-front cash from a box break's sold spots (called when the stream
    // starts a break). Buyers pre-pay regardless of what gets pulled. Returns the gross.
    collectBreakSpots(gross) {
      if (!gross || gross <= 0) return 0
      get().earn(round2(gross))
      set(s => ({ streamStats: { ...s.streamStats, breaks: (s.streamStats?.breaks || 0) + 1 } }))
      get().log('stream', `Sold break spots for $${round2(gross).toFixed(2)} up front`, round2(gross))
      return round2(gross)
    },
    // Current audience freshness multiplier (1 = fresh, lower = streamed recently).
    // The UI uses it to preview expected viewers before going live.
    streamFreshness() { return fatigueMult(get().streamFatigue || 0) },

    // A viewer buys a still-open break spot mid-stream (hype sells the last spots).
    // Collect the spot price now; the UI marks that spot filled so its future pulls ship.
    sellLiveSpot(price) {
      if (!price || price <= 0) return
      get().earn(round2(price))
      get().log('stream', `A viewer grabbed an open break spot — +$${round2(price).toFixed(2)}`, round2(price))
    },

    // Raffle a card you own to the audience on stream. It leaves your collection (someone won
    // it) and earns notoriety now — a bigger, pricier giveaway lands a bigger pop. The follower
    // gain it suggests is RETURNED, not applied — the live stage batches every session follower
    // gain into endStream so the count moves once, cleanly. A generous chase-card giveaway also
    // bumps notoriety more. Returns { card, followers } for the UI, or null if gone.
    giveawayCard(uid, viewers = 0) {
      const card = get().collection.find(c => c.uid === uid)
      if (!card) return null
      const val = cardValue(card)
      // base crowd pop (scales with who's watching) + a value bonus (a grail giveaway blows up)
      const gained = 5 + Math.round(Math.max(0, viewers) * 0.04) + Math.min(150, Math.round(val * 0.5))
      const notoBump = val >= 100 ? 3 : val >= 25 ? 2 : 1
      set(s => ({ collection: s.collection.filter(c => c.uid !== uid) }))
      get().addNotoriety(notoBump)
      get().log('stream', `🎁 Gave away ${card.name} ($${val.toFixed(2)}) on stream — chat erupted (+${gained} followers coming, +${notoBump}★)`, 0)
      return { card, followers: gained }
    },

    // End-of-break settlement: cards that landed on FILLED spots ship to those buyers,
    // so they leave your collection. Cards on UNFILLED spots are yours to keep (you
    // "bought into" your own break for those teams). `shipUids` = the filled-spot cards.
    shipBreakCards(shipUids) {
      const ids = new Set(shipUids || [])
      if (!ids.size) return 0
      set(s => ({ collection: s.collection.filter(c => !ids.has(c.uid)) }))
      get().log('stream', `Shipped ${ids.size} card${ids.size>1?'s':''} to break spot-holders`, 0)
      return ids.size
    },

    // End a stream: bank tips (card income) + notoriety (can be slightly NEGATIVE on a
    // flop), open the listing-traffic "afterglow", tire the audience (+1 fatigue), and
    // burn a game-day — prepping & broadcasting takes the day, so the world advances
    // (orders/rent/etc.) just like any other day. A stream is now a real time cost,
    // not a free action, and over-streaming thins your crowd until you rest.
    endStream({ tips = 0, noto = 0, peakViewers = 0, followers = 0 } = {}) {
      if (tips > 0) get().earn(round2(tips))
      if (noto) get().addNotoriety(noto) // may be negative after a flop
      set(s => ({
        streamHypeDaysLeft: noto > 0 ? STREAM_HYPE_DAYS : 0, // a flop earns no afterglow
        streamFatigue: (s.streamFatigue || 0) + 1,
        followers: Math.max(0, (s.followers || 0) + followers), // returning audience grows
        streamStats: {
          streams: (s.streamStats?.streams || 0) + 1,
          tips: round2((s.streamStats?.tips || 0) + tips),
          peakViewers: Math.max(s.streamStats?.peakViewers || 0, Math.round(peakViewers)),
          breaks: s.streamStats?.breaks || 0,
        },
      }))
      const afterglow = noto > 0 ? ` Your shop is buzzing for ${STREAM_HYPE_DAYS} days.` : ''
      const follow = followers > 0 ? ` +${followers} followers.` : ''
      get().log('stream', `Wrapped a livestream — ${Math.round(peakViewers)} peak viewers, $${round2(tips).toFixed(2)} in tips (${noto >= 0 ? '+' : ''}${noto}★).${follow}${afterglow}`, round2(tips))
      // streaming consumes the day — advance the world one game-day (home, not away).
      advanceDaysWith(set, get, 1, false)
      // Flush this day's card income (including the tips just banked) into the rolling
      // window, exactly like nextDay — otherwise the tips get lumped into the NEXT day's
      // slot and skew the per-day card-income readout.
      const cardIncome = round2(get()._cardAccrual || 0)
      const ring = [...(get().cardIncomeLog || []), cardIncome]
      set(() => ({ cardIncomeLog: ring.slice(-INCOME_WINDOW_DAYS), _cardAccrual: 0 }))
      get().checkMilestones() // stream-count / peak-viewer badges
    },
  }
}
