// Auction-house slice — 🔨 the BUY side of the hammer.
//
// The board is a list of live lots with a clock on each. You leave a maximum bid and walk
// away; the day tick runs the clock out and either you won or you did not. There is no
// "bid again" button on purpose — a proxy maximum IS the decision, and re-entering a higher
// number after being outbid is exactly the behaviour that loses dealers money.
//
// The math (room size, the winner's price, what a misdescribed lot is really worth) lives in
// game/lots.js. This file is the state around it: placing and clearing a bid, and settling.

import { round2, fmtMoney } from '../engine'
import { absoluteDay } from './constants'
import { nextSealedSuffix } from './ids'
import { refillLots, settleLot, lotTrueValue, lotTotalCost } from '../lots'

export function createAuctionHouseSlice(set, get) {
  return {
    // Leave a proxy maximum on a lot. Bidding again simply replaces it, and bidding 0 clears
    // it — you are never committed until the clock runs out, which is what a real proxy is.
    bidOnLot(lotId, max) {
      const s = get()
      const lot = (s.auctionLots || []).find(l => l.id === lotId)
      if (!lot) return { error: 'That lot has closed.' }
      const day = absoluteDay(s.currentDay, s.monthsElapsed)
      if (day >= lot.endsOn) return { error: 'That lot has closed.' }
      const bid = round2(Math.max(0, max || 0))
      // The house wants to know you can cover it. Checking against cash at BID time rather
      // than only at settlement is the honest version — otherwise a player could leave
      // maximums on every lot on the board and let the tick sort out which ones they can pay.
      if (bid > 0) {
        const committed = (s.auctionLots || [])
          .filter(l => l.id !== lotId && day < l.endsOn)
          .reduce((a, l) => a + lotTotalCost(l.maxBid || 0).total, 0)
        const need = lotTotalCost(bid).total
        if (committed + need > s.cash) {
          return { error: `You have ${fmtMoney(s.cash)} and ${fmtMoney(committed)} of it is already committed to other lots. This bid needs ${fmtMoney(need)} with the premium and postage.` }
        }
      }
      set(st => ({ auctionLots: st.auctionLots.map(l => l.id === lotId ? { ...l, maxBid: bid } : l) }))
      if (bid <= 0) return { ok: true, cleared: true }
      return { ok: true, max: bid, cost: lotTotalCost(bid) }
    },

    // Total cash your open maximums could take if every one of them won.
    lotsCommitted() {
      const s = get()
      const day = absoluteDay(s.currentDay, s.monthsElapsed)
      return round2((s.auctionLots || [])
        .filter(l => day < l.endsOn && (l.maxBid || 0) > 0)
        .reduce((a, l) => a + lotTotalCost(l.maxBid).total, 0))
    },
  }
}

// --- Per-day settlement, called from the day tick -------------------------------------
// Close every lot whose clock has run out, then refill the board. Returns a summary the day
// recap can show.
export function settleAuctionLots(set, get, absDay) {
  const s = get()
  const live = s.auctionLots || []
  const closing = live.filter(l => absDay >= l.endsOn)
  if (!closing.length) {
    // Nothing closed, but the board still refills toward its slot count as your name grows.
    if (absDay !== s.auctionLotsDay) {
      set(st => ({ auctionLots: refillLots(st.auctionLots, st.notoriety, absDay), auctionLotsDay: absDay }))
    }
    return null
  }

  const wonCards = [], wonSealed = []
  let spent = 0, won = 0, lost = 0, burned = 0
  const lines = []

  for (const lot of closing) {
    const result = settleLot(lot)
    if (!result.won) {
      if ((lot.maxBid || 0) > 0) {
        lost++
        lines.push(`🔨 Outbid on ${lot.title} — it went for ${fmtMoney(result.hammer)}.`)
      }
      continue
    }
    // Won it. Pay hammer + the house's cut + postage. If the cash is not there any more (a
    // day's expenses landed first), the house cancels the sale and the account takes a note.
    if (!get().spend(result.total)) {
      lines.push(`🔨 You won ${lot.title} at ${fmtMoney(result.hammer)} and could not cover the ${fmtMoney(result.total)} invoice. The house cancelled the sale.`)
      get().addNotoriety(-1, false, 'dings')
      continue
    }
    won++
    spent = round2(spent + result.total)

    if (lot.kind === 'sealed') {
      const item = {
        uid: `s${Date.now().toString(36)}${nextSealedSuffix()}`,
        setId: lot.item.setId,
        product: lot.item.product,
        boughtDay: absDay,
        boughtPrice: result.total,
        vintage: !!lot.item.vintage,
        loc: 'storeroom',
        ...(lot._resealed ? { resealed: true } : {}),
      }
      wonSealed.push(item)
      if (lot._resealed) {
        burned++
        lines.push(`🔨 ${lot.title} arrived — and the wrapper has been opened and resealed. It is worth a fraction of what you paid.`)
      } else {
        lines.push(`🔨 Won ${lot.title} for ${fmtMoney(result.total)} (${fmtMoney(result.hammer)} + ${fmtMoney(result.premium)} premium + ${fmtMoney(result.ship)} postage).`)
      }
      continue
    }

    // A card. A misdescribed raw lot arrives in the condition it really is, not the one the
    // listing claimed — which is the entire lesson of bidding on a quiet lot.
    const card = lot._misdescribed
      ? { ...lot.card, condition: lot.trueCondition, _misdescribed: true }
      : lot.card
    wonCards.push({ ...card, loc: 'storeroom' })
    if (lot._misdescribed) {
      burned++
      lines.push(`🔨 ${lot.title} arrived described as ${lot.claimedCondition} and it is ${lot.trueCondition}. Paid ${fmtMoney(result.total)} for ${fmtMoney(lotTrueValue(lot))} of card.`)
    } else {
      lines.push(`🔨 Won ${lot.title} for ${fmtMoney(result.total)} (${fmtMoney(result.hammer)} + ${fmtMoney(result.premium)} premium + ${fmtMoney(result.ship)} postage).`)
    }
  }

  set(st => ({
    collection: [...wonCards, ...st.collection],
    sealedInventory: [...wonSealed, ...st.sealedInventory],
    auctionLots: refillLots(st.auctionLots.filter(l => absDay < l.endsOn), st.notoriety, absDay),
    auctionLotsDay: absDay,
    auctionStats: {
      won: (st.auctionStats?.won || 0) + won,
      lost: (st.auctionStats?.lost || 0) + lost,
      spent: round2((st.auctionStats?.spent || 0) + spent),
      burned: (st.auctionStats?.burned || 0) + burned,
    },
  }))
  for (const line of lines) get().log('auction-buy', line, 0)
  return { won, lost, spent, burned, lines }
}
