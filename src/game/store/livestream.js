// Livestream slice — going live to rip on camera + box breaks.
//
// createLivestreamSlice(set, get) returns: collecting up-front break-spot cash, the current
// audience-freshness readout, selling a live spot mid-stream, shipping break cards to
// spot-holders, and endStream (bank tips + notoriety, open the listing afterglow, tire the
// audience, and burn a game-day through the shared day-tick). The viewer/tip/chat math is
// pure and lives in ../stream (game); this slice is the state mutations around it.

import { round2, cardValue, openPack, setById } from '../engine'
import { fatigueMult } from '../stream'
import { advanceDaysWith } from './daytick'
import { STREAM_HYPE_DAYS, INCOME_WINDOW_DAYS, absoluteDay } from './constants'

export function createLivestreamSlice(set, get) {
  return {
    // --- Stream escrow -------------------------------------------------------------
    // A live session used to exist only as component state: going live consumed the
    // product and banked spot cash immediately, but shipping/day-burn/fatigue only
    // settled in endStream — so a reload (or anything that killed the component)
    // mid-stream kept the cash, vaporized the product, and dodged the day cost.
    // The escrow is the store-side record of the session: written at go-live, updated
    // per ripped pack, cleared at settlement. `settleAbandonedStream()` (called at
    // boot, like the show rescue) makes the world whole if the session died.
    // Entries: { invUid, item, packs, packsDone, spotGross }.
    startStreamEscrow(entries) {
      set({ streamEscrow: { entries: entries || [], ts: Date.now() } })
    },
    // Mid-stream consumption (accepted rip orders) joins the same escrow.
    appendStreamEscrow(entry) {
      const esc = get().streamEscrow
      if (!esc || !entry) return
      set({ streamEscrow: { ...esc, entries: [...esc.entries, entry] } })
    },
    escrowPackRipped(invUid) {
      const esc = get().streamEscrow
      if (!esc || !invUid) return
      set({ streamEscrow: { ...esc, entries: esc.entries.map(e =>
        e.invUid === invUid ? { ...e, packsDone: (e.packsDone || 0) + 1 } : e) } })
    },
    // A live spot sold mid-stream adds to the entry's collected cash (refundable on abandon).
    escrowSpotCash(invUid, amount) {
      const esc = get().streamEscrow
      if (!esc || !invUid || !(amount > 0)) return
      set({ streamEscrow: { ...esc, entries: esc.entries.map(e =>
        e.invUid === invUid ? { ...e, spotGross: round2((e.spotGross || 0) + amount) } : e) } })
    },
    // skipRest fast-forwards everything to completion in one shot.
    escrowAllRipped() {
      const esc = get().streamEscrow
      if (!esc) return
      set({ streamEscrow: { ...esc, entries: esc.entries.map(e => ({ ...e, packsDone: e.packs })) } })
    },
    // End-early: clean unstarted entries go home to 📦 inventory (and leave the escrow).
    returnStreamItems(invUids) {
      const esc = get().streamEscrow
      const ids = new Set(invUids || [])
      const back = (esc?.entries || []).filter(e => ids.has(e.invUid) && e.item)
      if (!back.length) return 0
      set(s => ({
        sealedInventory: [...back.map(e => e.item), ...(s.sealedInventory || [])],
        streamEscrow: { ...esc, entries: esc.entries.filter(e => !ids.has(e.invUid)) },
      }))
      get().log('stream', `Returned ${back.length} unopened product${back.length > 1 ? 's' : ''} to 📦 inventory (stream ended early)`, 0)
      return back.length
    },
    clearStreamEscrow() { if (get().streamEscrow) set({ streamEscrow: null }) },
    // Boot-time rescue for a session that died mid-broadcast (reload, crash):
    //  • untouched entries with nothing sold on them → straight back to inventory
    //  • started entries (or pre-paid breaks/orders) → the remaining packs crack
    //    off-camera into your collection (product never evaporates)
    //  • pre-paid spot/order cash → refunded to the buyers (reversing the earn()
    //    bookkeeping); the cards stay yours since nothing shipped
    //  • the broadcast still cost the day + audience fatigue — going live isn't free
    settleAbandonedStream() {
      const esc = get().streamEscrow
      if (!esc) return null
      let returned = 0, ripped = 0, refund = 0
      for (const e of (esc.entries || [])) {
        const done = e.packsDone || 0
        if (done <= 0 && !(e.spotGross > 0)) {
          if (e.item) { set(s => ({ sealedInventory: [e.item, ...(s.sealedInventory || [])] })); returned++ }
          continue
        }
        const st = e.item?.setId ? setById(e.item.setId) : null
        const remaining = Math.max(0, (e.packs || 0) - done)
        if (st && remaining > 0) {
          for (let i = 0; i < remaining; i++) get().addPulls(openPack(st), `🔴 ${st.name} (recovered)`)
          ripped += remaining
        }
        if (e.spotGross > 0) refund = round2(refund + e.spotGross)
      }
      if (refund > 0) {
        const give = Math.min(get().cash, refund) // refund what's there; the rest is written off
        if (give > 0) set(s => ({
          cash: round2(s.cash - give),
          stats: { ...s.stats, earned: round2(s.stats.earned - give) },
          _cardAccrual: round2((s._cardAccrual || 0) - give),
        }))
      }
      set({ streamEscrow: null })
      const bits = []
      if (returned) bits.push(`${returned} unopened product${returned > 1 ? 's' : ''} back to 📦`)
      if (ripped) bits.push(`${ripped} pack${ripped > 1 ? 's' : ''} cracked off-camera into your collection`)
      if (refund) bits.push(`$${refund.toFixed(2)} of spot/order money refunded to buyers`)
      get().log('stream', `⚠️ The stream cut out mid-broadcast — ${bits.join(', ') || 'settled'}. The day was still spent.`, 0)
      advanceDaysWith(set, get, 1, false) // the broadcast consumed the day regardless
      // fatigue after the tick (its rest-recovery would otherwise cancel it — see endStream)
      set(s => ({ streamFatigue: (s.streamFatigue || 0) + 1 }))
      return { returned, ripped, refund }
    },

    // Collect the up-front cash from a box break's sold spots (called when the stream
    // starts a break). Buyers pre-pay regardless of what gets pulled. Returns the gross.
    collectBreakSpots(gross) {
      if (!gross || gross <= 0) return 0
      get().earn(round2(gross))
      set(s => ({ streamStats: { ...s.streamStats, breaks: (s.streamStats?.breaks || 0) + 1 } }))
      get().log('stream', `Sold break spots for $${round2(gross).toFixed(2)} up front`, round2(gross))
      return round2(gross)
    },
    // A viewer places a LIVE RIP ORDER (needs the Live Rip Service upgrade): they pre-pay a
    // premium to have you crack a product you hold on camera, and every card ships to them at
    // settlement. You bank the price NOW and keep it no matter what gets pulled — the markup is
    // your edge. The product itself is consumed from inventory by the caller (ripSealed), and
    // the pull cards are shipped via shipBreakCards when the order's queue entry finishes.
    collectRipOrder(price, buyer, productType) {
      if (!price || price <= 0) return 0
      const gross = round2(price)
      get().earn(gross)
      set(s => ({ streamStats: {
        ...s.streamStats,
        ripOrders: (s.streamStats?.ripOrders || 0) + 1,
        ripRevenue: round2((s.streamStats?.ripRevenue || 0) + gross),
      } }))
      get().log('stream', `🎟️ ${buyer || 'A viewer'} ordered a live rip of a ${productType || 'product'} — +$${gross.toFixed(2)} (ships to them)`, gross)
      return gross
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
      // Anti-farm (mirrors the in-store giveaway): penny cards give no rep, and each
      // successive on-stream giveaway the same day halves the rep pop — mashing the picker
      // on bulk in an empty-room stream no longer prints fame. Follower gain scales with
      // the ROOM and the card, so an empty-room giveaway is naturally tiny anyway.
      const done = get().giveawaysToday || 0
      const gained = 5 + Math.round(Math.max(0, viewers) * 0.04) + Math.min(150, Math.round(val * 0.5))
      const baseNoto = val >= 100 ? 3 : val >= 25 ? 2 : val >= 5 ? 1 : 0
      const notoBump = Math.round(baseNoto * Math.pow(0.5, done))
      set(s => ({ collection: s.collection.filter(c => c.uid !== uid), giveawaysToday: (s.giveawaysToday || 0) + 1 }))
      if (notoBump > 0) get().addNotoriety(notoBump, true)
      get().log('stream', `🎁 Gave away ${card.name} ($${val.toFixed(2)}) on stream — chat erupted (+${gained} followers coming${notoBump > 0 ? `, +${notoBump}★` : ''})`, 0)
      return { card, followers: gained }
    },

    // --- 📣 Announced streams ------------------------------------------------------
    // Promise a broadcast 1–3 days ahead, optionally headlining one card from your
    // collection as the night's giveaway. One promise at a time. The payoff is a bigger
    // room IF you go live on the promised day (promoViewerMult); the cost is commitment —
    // sleep through the night (daytick) or go live without raffling the promised card
    // (endStream) and the stood-up room dents your name.
    announceStream({ daysAhead = 1, card = null } = {}) {
      if (get().streamPromo) return false
      const lead = Math.max(1, Math.min(3, Math.round(daysAhead)))
      const today = absoluteDay(get().currentDay, get().monthsElapsed)
      const val = card ? cardValue(card) : 0
      set({ streamPromo: { day: today + lead, lead, announcedOn: today,
        cardUid: card?.uid || null, cardName: card?.name || null, cardValue: val, delivered: false } })
      get().log('stream', `📣 Announced a live stream ${lead === 1 ? 'for tomorrow' : `in ${lead} days`}${card ? ` — headlining a ${card.name} ($${val.toFixed(2)}) giveaway` : ''}. Show up and the room shows up.`, 0)
      return true
    },
    // Calling it off before the night: the people you hyped shrug and move on (-1★).
    cancelStreamPromo() {
      if (!get().streamPromo) return
      set({ streamPromo: null })
      get().addNotoriety(-1)
      get().log('stream', `📣 Called off the announced stream — the room you hyped up moved on. (-1★)`, 0)
    },
    // The promised card just went to a viewer live on the promised night — keep your word,
    // bank the rep pop now. The follower payoff is returned via the component (batched into
    // endStream with every other session follower gain).
    deliverStreamPromo() {
      const promo = get().streamPromo
      if (!promo || promo.delivered || !promo.cardUid) return
      set({ streamPromo: { ...promo, delivered: true } })
      get().addNotoriety(3, true)
      get().log('stream', `📣 Delivered the promised ${promo.cardName} giveaway live on stream — the room got what it came for. (+3★)`, 0)
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
      get().clearStreamEscrow() // clean settlement — the escrow's job is done
      // 📣 Announced-stream settlement: if tonight WAS the promised night, the promise is
      // spent either way. Delivered → the rep pop already landed at the giveaway moment.
      // Went live but the headline giveaway never happened → bait-and-switch (-2★). A
      // promise with no featured card is fulfilled just by showing up.
      const promo = get().streamPromo
      if (promo && absoluteDay(get().currentDay, get().monthsElapsed) >= promo.day) {
        set({ streamPromo: null })
        if (promo.cardUid && !promo.delivered) {
          get().addNotoriety(-2)
          get().log('stream', `📣 The room came for the promised ${promo.cardName} giveaway… and never got it. (-2★)`, 0)
        }
      }
      if (tips > 0) get().earn(round2(tips))
      if (noto) get().addNotoriety(noto) // may be negative after a flop
      set(s => ({
        streamHypeDaysLeft: noto > 0 ? STREAM_HYPE_DAYS : 0, // a flop earns no afterglow
        followers: Math.max(0, (s.followers || 0) + followers), // returning audience grows
        streamStats: {
          ...s.streamStats, // carry ripOrders/ripRevenue (banked live) through untouched
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
      // Fatigue AFTER the day-tick: the tick's rest-recovery (-1/day) used to erase the
      // +1 applied above it in the same call, so audience fatigue NEVER accumulated and
      // "over-streaming tires your audience" was silently dead.
      set(s => ({ streamFatigue: (s.streamFatigue || 0) + 1 }))
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
