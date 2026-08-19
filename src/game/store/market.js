// Local-marketplace slice — 📱 messaging strangers and driving out to meet them.
//
// The math (who is selling, how they priced it, what you actually get) lives in game/market.js.
// This is the state around it: the message thread, the meet, and the daily churn that makes a
// bargain something you have to move on.

import { round2, fmtMoney, cardInValueRange } from '../engine'
import { absoluteDay } from './constants'
import { nextSealedSuffix } from './ids'
import {
  haggle as haggleMath, trueValue, trueCondition, travelCost, refillBoard, takenChance,
  MEETS_PER_DAY, SELLERS,
} from '../market'

export function createMarketSlice(set, get) {
  return {
    // How many meets you have left today. You have to physically go and get these, and the
    // day only holds so many trips — which is what makes "is it worth the drive" a question.
    meetsLeft() {
      const s = get()
      const day = absoluteDay(s.currentDay, s.monthsElapsed)
      const used = s.market?.meetDay === day ? (s.market?.meetsToday || 0) : 0
      return Math.max(0, MEETS_PER_DAY - used)
    },

    // Message a seller with an offer. They accept, counter once, or stop replying.
    // Haggling is free and costs no meet — only collecting does.
    messageSeller(listingId, offer) {
      const s = get()
      const l = (s.market?.listings || []).find(x => x.id === listingId)
      if (!l) return { error: 'That listing is gone.' }
      if (l.dead) return { error: 'They stopped replying to you.' }
      const r = haggleMath(l, round2(offer))
      set(st => ({
        market: {
          ...st.market,
          listings: st.market.listings.map(x => x.id !== listingId ? x : {
            ...x,
            // An accepted price becomes the agreed price; a counter replaces the ask.
            ...(r.ok ? { agreed: r.price } : {}),
            ...(r.counter ? { ask: r.counter, countered: true } : {}),
            ...(r.dead ? { dead: true } : {}),
            haggled: true,
          }),
        },
      }))
      return { ok: r.ok, line: r.line, price: r.price, counter: r.counter, dead: r.dead }
    },

    // Drive out and collect it. This is where the money moves and where you find out whether
    // the listing was telling the truth.
    collectListing(listingId) {
      const s = get()
      const l = (s.market?.listings || []).find(x => x.id === listingId)
      if (!l) return { error: 'That listing is gone.' }
      if (l.dead) return { error: 'They stopped replying to you.' }
      if (get().meetsLeft() <= 0) return { error: `You have run out of day. ${MEETS_PER_DAY} meets is all a day holds.` }
      const price = round2(l.agreed ?? l.ask)
      const travel = travelCost(l.miles)
      const total = round2(price + travel)
      if (s.cash < total) return { error: `You need ${fmtMoney(total)} — ${fmtMoney(price)} plus ${fmtMoney(travel)} to get there and back.` }

      const day = absoluteDay(s.currentDay, s.monthsElapsed)
      const useMeet = () => set(st => ({
        market: {
          ...st.market,
          meetDay: day,
          meetsToday: (st.market?.meetDay === day ? (st.market?.meetsToday || 0) : 0) + 1,
          listings: st.market.listings.filter(x => x.id !== listingId),
        },
      }))

      // 👻 The no-show. You still burned the trip and the fuel, which is the entire cost of
      // trusting a listing that had every tell on it.
      if (l.bad && l.badKind === 'noshow') {
        if (!get().spend(travel)) return { error: 'You cannot even cover the fuel.' }
        useMeet()
        get().log('market', `👻 Drove out for "${l.title}" and they never turned up. ${fmtMoney(travel)} of fuel for nothing.`, -travel)
        return { ok: true, noshow: true, travel }
      }

      if (!get().spend(total)) return { error: 'You cannot cover that right now.' }

      const worth = trueValue(l)
      let got = null
      if (l.kind === 'sealed') {
        const item = {
          uid: `s${Date.now().toString(36)}${nextSealedSuffix()}`,
          setId: l.item.setId, product: l.item.product,
          boughtDay: day, boughtPrice: total, vintage: !!l.item.vintage, loc: 'storeroom',
          ...(l.badKind === 'resealed' ? { resealed: true } : {}),
        }
        set(st => ({ sealedInventory: [item, ...st.sealedInventory] }))
        got = { sealed: item }
      } else if (l.kind === 'card') {
        const card = l.badKind === 'condition'
          ? { ...l.card, condition: trueCondition(l), _misdescribed: true }
          : l.card
        set(st => ({ collection: [{ ...card, loc: 'storeroom' }, ...st.collection] }))
        got = { card }
      } else {
        // A bulk lot: it lands as cards. Value is spread across the pile, so this mints a
        // representative sample rather than thousands of rows — the save has to survive it.
        const cards = get().mintBulkLot(l, worth)
        got = { lot: cards.length }
      }
      useMeet()

      // 🧾 The books: buying stock is a deductible cost, and spend() already booked it.
      const line = l.bad
        ? `📱 Collected "${l.title}" for ${fmtMoney(price)} — and it is ${l.badKind === 'resealed' ? 'been opened and resealed'
            : l.badKind === 'condition' ? `a ${trueCondition(l)}, not what the photos showed`
            : 'already been picked through'}. Worth about ${fmtMoney(worth)}.`
        : `📱 Collected "${l.title}" for ${fmtMoney(price)}${travel > 0 ? ` (+${fmtMoney(travel)} travel)` : ''} — worth about ${fmtMoney(worth)}.`
      get().log('market', line, -total)
      set(st => ({
        marketStats: {
          bought: (st.marketStats?.bought || 0) + 1,
          spent: round2((st.marketStats?.spent || 0) + total),
          burned: (st.marketStats?.burned || 0) + (l.bad ? 1 : 0),
          steals: (st.marketStats?.steals || 0) + (!l.bad && worth > total * 1.6 ? 1 : 0),
        },
      }))
      return { ok: true, price, travel, total, worth, bad: !!l.bad, badKind: l.badKind, got }
    },

    // A bulk lot arrives as a manageable sample of real cards worth roughly what the lot is
    // worth. Minting 4,000 rows would be honest and would also make the save unopenable.
    mintBulkLot(listing, worth) {
      const n = Math.max(8, Math.min(40, Math.round((listing.lot?.count || 100) / 40)))
      const per = Math.max(0.05, worth / n)
      const cards = []
      for (let i = 0; i < n; i++) {
        // Spread around the average so a lot reads like a pile — mostly chaff with a couple of
        // real cards in it — rather than n identical valuations.
        const c = cardInValueRange(per * 0.2, per * 2.2)
        if (c) cards.push({ ...c, loc: 'storeroom' })
      }
      if (cards.length) set(st => ({ collection: [...cards, ...st.collection] }))
      return cards
    },
  }
}

// --- Per-day churn, called from the day tick -----------------------------------------
// Two things happen overnight: somebody else buys the good listings, and new ones go up.
// The first is what gives this channel its rhythm — a bargain you scrolled past is gone.
export function tickMarket(set, get, absDay, days = 1) {
  const s = get()
  const live = (s.market?.listings || [])
  let taken = 0
  const kept = []
  for (const l of live) {
    let gone = false
    for (let d = 0; d < days; d++) {
      if (Math.random() < takenChance(l)) { gone = true; break }
    }
    if (gone) { taken++; continue }
    kept.push({ ...l, daysListed: (l.daysListed || 0) + days })
  }
  const listings = refillBoard(kept, s.notoriety, absDay)
  set(st => ({
    market: { ...(st.market || {}), listings, day: absDay },
  }))
  return { taken, listed: listings.length }
}
