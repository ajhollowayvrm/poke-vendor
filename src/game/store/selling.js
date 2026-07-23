// Selling slice — moving cards to customers over time (not instant exits).
//
// createSellingSlice(set, get) returns: your own-site LISTINGS (quote, list, reprice,
// relist, offers accept/decline, auto-sell toggle, pull, bulk-list), collector WANTS +
// public FORUM WTB fulfillment, and REGULARS (trust bumps + forming a new regular from a
// good deal). The passage of days that actually sells listings lives in daytick.js
// (tickListings); this slice is the player-facing actions around them.

import { cardValue, dailyViewers, buyerMaxMult, BUYER_SAVVY, round2, bulkSellableUids, fameMult, fameBeyond } from '../engine'
import { cardMatchesWant, makeRegular } from '../shows'
import { REGULAR_FORM_GATE, ONLINE_FEE_PCT, shippingCost } from './constants'

export function createSellingSlice(set, get) {
  return {
    // Quote a self-listing at `askMult`× market. Sales are now driven by real
    // browsing customers (see tickListings), so the quote ESTIMATES the experience:
    // expected shoppers/day and the share of the buyer pool whose savvy tolerates
    // this ask (≈ likelihood the next willing buyer bites). Returns
    // { market, ask, fee, ship, net, viewsPerDay, buyShare }.
    listingQuote(card, askMult) {
      const market = cardValue(card)
      const noto = get().notoriety
      const ask = round2(market * askMult)
      const fee = round2(ask * ONLINE_FEE_PCT) // ~5% marketplace fee
      const ship = shippingCost(ask, get().upgrades) // shipping & packing — online only (📦 station halves it)
      const net = round2(ask - fee - ship)
      const viewsPerDay = +(dailyViewers(card, askMult, noto, () => 0.5)).toFixed(0)
      // share of the browsing pool whose max-willingness covers this ask (use the
      // savvy weights, with each type's notoriety/desirability-lifted ceiling).
      let buyShare = 0
      for (const [key, b] of Object.entries(BUYER_SAVVY)) {
        const max = buyerMaxMult(key, noto, card, () => 0.5)
        if (askMult <= max) buyShare += b.weight
      }
      return { market, ask, fee, ship, net, viewsPerDay, buyShare: +buyShare.toFixed(2) }
    },

    // List a card on your own site at `askMult`× market. Removes it from the
    // collection and puts it on the market, where browsing customers decide whether
    // to buy (see tickListings). `views`/`offers` accrue as days pass.
    // opts.everywhere (needs a storefront): the SAME card also goes out in your store
    // case — walk-ins can buy it in person (no fees, +premium) and whichever channel
    // finds a buyer first takes it off both.
    listOnSite(uid, askMult, opts = {}) {
      const card = get().collection.find(c => c.uid === uid)
      if (!card) return false
      const q = get().listingQuote(card, askMult)
      const everywhere = !!(opts.everywhere && get().upgrades.storefront)
      const listing = { card, ask: q.ask, net: q.net, askMult, views: 0, offers: [], age: 0, autoSell: true, everywhere }
      set(s => ({
        collection: s.collection.filter(c => c.uid !== uid),
        listings: [...(s.listings || []), listing],
      }))
      get().log('listing', `Listed ${card.name} at $${q.ask.toFixed(2)} (${Math.round(askMult*100)}% of market)${everywhere ? ' — online + in your store case' : ''}`, 0)
      return q
    },

    // Flip a live listing between online-only and everywhere (online + store case).
    // Going everywhere needs a storefront; sealed-wrapped listings stay online-only.
    setListingEverywhere(idx, val) {
      const l = get().listings[idx]
      if (!l) return
      const on = !!val && !!get().upgrades.storefront && !l.card?._sealed
      if (on === !!l.everywhere) return
      set(s => ({ listings: s.listings.map((x, i) => i === idx ? { ...x, everywhere: on } : x) }))
      get().log('listing', on
        ? `${l.card.name} is now also out in your store case — sells online or in person, whichever comes first`
        : `${l.card.name} pulled from the store case — online listing only`, 0)
    },

    // Relist a listing (e.g. one that went stale) — back on the market fresh, same ask.
    relistListing(idx) {
      const l = get().listings[idx]
      if (!l) return
      const q = get().listingQuote(l.card, l.askMult)
      set(s => ({ listings: s.listings.map((x, i) => i === idx
        ? { ...x, expired: false, stale: false, views: 0, offers: [], age: 0, ask: q.ask, net: q.net } : x) }))
      get().log('listing', `Relisted ${l.card.name} at $${q.ask.toFixed(2)}`, 0)
    },

    // Reprice a live listing to a new ask multiple (resets browsing interest).
    repriceListing(idx, askMult) {
      const l = get().listings[idx]
      if (!l) return
      const q = get().listingQuote(l.card, askMult)
      set(s => ({ listings: s.listings.map((x, i) => i === idx
        ? { ...x, askMult, ask: q.ask, net: q.net, expired: false, stale: false, views: 0, offers: [], age: 0 } : x) }))
      get().log('listing', `Repriced ${l.card.name} to $${q.ask.toFixed(2)} (${Math.round(askMult*100)}% of market)`, 0)
    },

    // Accept a standing offer on a listing → sells now (net of the marketplace fee).
    acceptOffer(idx, offerId) {
      const l = get().listings[idx]
      const offer = l?.offers?.find(o => o.id === offerId)
      if (!l || !offer) return
      set(s => ({ listings: s.listings.filter((_, i) => i !== idx) }))
      get().earn(offer.net)
      get().bumpGoal('sell', 1); get().bumpGoal('profit', offer.net)
      get().log('sell', `Accepted a ${offer.savvyLabel}'s offer on ${l.card.name} — $${offer.net.toFixed(2)}`, offer.net)
    },

    // Decline a standing offer (drops it; the listing stays up).
    declineOffer(idx, offerId) {
      set(s => ({ listings: s.listings.map((x, i) => i === idx
        ? { ...x, offers: (x.offers || []).filter(o => o.id !== offerId) } : x) }))
    },

    // Toggle auto-sell on a per-listing basis (only meaningful when autoSell upgrade is owned).
    setListingAutoSell(idx, val) {
      set(s => ({ listings: s.listings.map((x, i) => i === idx ? { ...x, autoSell: !!val } : x) }))
    },

    // Pull a listing back into your collection (to reprice differently, or stop selling).
    pullListing(idx) {
      const l = get().listings[idx]
      if (!l) return
      // A sealed listing goes back to the sealed INVENTORY, not the card collection.
      if (l.card?._sealed && l.card.sealedRef) {
        const item = l.card.sealedRef
        set(s => ({
          sealedInventory: [item, ...(s.sealedInventory || [])],
          listings: s.listings.filter((_, i) => i !== idx),
        }))
        get().log('listing', `Pulled ${l.card.name} off the market`, 0)
        return
      }
      set(s => ({
        collection: [l.card, ...s.collection],
        listings: s.listings.filter((_, i) => i !== idx),
      }))
      get().log('listing', `Pulled ${l.card.name} off the market`, 0)
    },

    // List every selected card on your site at the same askMult (each rolls its own
    // sell/expire outcome). Returns the count. opts.everywhere as in listOnSite.
    listManyOnSite(uids, askMult, opts = {}) {
      const { sell, kept } = bulkSellableUids(get().collection, uids, { keepOne: get().settings?.keepOne })
      const sellSet = new Set(sell)
      const cards = get().collection.filter(c => sellSet.has(c.uid))
      if (!cards.length) return { sold: 0, kept: kept.length }
      const everywhere = !!(opts.everywhere && get().upgrades.storefront)
      const newListings = cards.map(card => {
        const q = get().listingQuote(card, askMult)
        return { card, ask: q.ask, net: q.net, askMult, views: 0, offers: [], age: 0, everywhere }
      })
      set(s => ({
        collection: s.collection.filter(c => !sellSet.has(c.uid)),
        listings: [...(s.listings || []), ...newListings],
      }))
      const keptNote = kept.length ? ` (kept ${kept.length} protected)` : ''
      get().log('listing', `Listed ${cards.length} cards at ${Math.round(askMult*100)}% of market${everywhere ? ' — online + store case' : ''}${keptNote}`, 0)
      return { sold: cards.length, kept: kept.length }
    },

    // --- Want-lists (collectors who sought YOU out) ------------------------------
    // Which of your cards satisfy this want?
    cardsForWant(want) { return get().collection.filter(c => cardMatchesWant(c, want)) },
    // Fulfill a want with a specific owned card → premium payout + notoriety + stat.
    fulfillWant(wantId, uid) {
      const want = get().wantList.find(w => w.id === wantId)
      const card = get().collection.find(c => c.uid === uid)
      if (!want || !card || !cardMatchesWant(card, want)) return false
      const payout = round2(cardValue(card) * want.premiumMult)
      set(s => ({
        collection: s.collection.filter(c => c.uid !== uid),
        wantList: s.wantList.filter(w => w.id !== wantId),
        stats: { ...s.stats, wantsFilled: (s.stats.wantsFilled || 0) + 1 },
      }))
      get().earn(payout)
      get().addNotoriety(want.notoriety)
      get().log('want', `Filled ${want.who}'s want with ${card.name} (+${Math.round(want.premiumMult*100)}% premium)`, payout)
      get().bumpGoal('want', 1)
      get().checkMilestones() // wants-filled badges
      return { payout }
    },

    // --- Forum (public WTB board) ------------------------------------------------
    // Which of your owned cards satisfy a forum post? (same matcher as wants)
    cardsForForumPost(post) { return get().collection.filter(c => cardMatchesWant(c, post)) },
    // Fill a forum WTB post with one of your cards → above-market payout + a little notoriety
    // (filling public orders builds your name — it's how you EARN your way past the inbound
    // gate). Counts toward the same 'want' weekly goal/stat as a direct collector want.
    fulfillForumPost(postId, uid) {
      const post = (get().forumPosts || []).find(p => p.id === postId)
      const card = get().collection.find(c => c.uid === uid)
      if (!post || !card || !cardMatchesWant(card, post)) return false
      const payout = round2(cardValue(card) * post.premiumMult)
      set(s => ({
        collection: s.collection.filter(c => c.uid !== uid),
        forumPosts: (s.forumPosts || []).filter(p => p.id !== postId),
        stats: { ...s.stats, wantsFilled: (s.stats.wantsFilled || 0) + 1 },
      }))
      get().earn(payout)
      get().addNotoriety(post.notoriety)
      get().log('forum', `Filled a forum WTB (${post.who}) with ${card.name} — +${Math.round((post.premiumMult-1)*100)}% over market`, payout)
      get().bumpGoal('want', 1)
      get().checkMilestones() // wants-filled badges (forum fills count too)
      return { payout }
    },

    // --- Regulars (persistent customers) -----------------------------------------
    // Move a regular's trust after an interaction. delta>0 for fair/generous dealing,
    // <0 for a gouge or a snub; `spent` adds to their lifetime tally. Trust hitting 0 on
    // a negative move BURNS them — they stop coming around. Each touch also counts a visit.
    bumpTrust(id, delta = 0, spent = 0) {
      let burnedNow = null
      set(s => ({
        regulars: (s.regulars || []).map(r => {
          if (r.id !== id) return r
          const trust = Math.max(0, Math.min(100, (r.trust || 0) + delta))
          const flags = { ...r.flags }
          if (trust <= 0 && delta < 0 && !flags.burned) { flags.burned = true; burnedNow = r }
          return { ...r, trust, visits: (r.visits || 0) + 1, lastSeenDay: s.currentDay,
            spentTotal: round2((r.spentTotal || 0) + (spent || 0)), flags }
        }),
      }))
      if (burnedNow) get().log('regular', `${burnedNow.emoji} ${burnedNow.name} felt burned and won't be back.`, 0)
    },

    // A great deal with an anonymous walk-up can turn them INTO a regular. Rolled on the
    // `formSeed` a good deal's effect leaves behind. Gated on notoriety + a per-channel roster
    // cap (kept small so the roster stays personal); a generous first meeting bonds harder.
    formRegular(seed) {
      if (!seed || !seed.setId) return
      if (get().notoriety < REGULAR_FORM_GATE) return
      const channel = seed.channel === 'walkin' ? 'walkin' : 'online'
      const roster = get().regulars || []
      const sameChan = roster.filter(r => r.channel === channel && !r.flags?.burned)
      const noto = get().notoriety
      // A famous shop keeps a bigger book of regulars, and more of the people you treat well
      // stick around. Both used to be flat/capped (3 & 6 regulars; the fame lift maxed at noto
      // 100), so building a name did nothing for your customer base past the early game.
      //   roster:  walk-in 3 → 6 · online 6 → 12, by ~noto 400
      const fame = fameMult(noto)
      const CAP = Math.round((channel === 'walkin' ? 3 : 6) * Math.min(2, 0.75 + 0.25 * fame))
      const pForm = Math.min(0.9,
        (seed.generous ? 0.5 : 0.28) + Math.min(0.2, noto / 500) + fameBeyond(noto, 100) * 0.04)
      if (Math.random() > pForm) return
      let kept = roster
      if (sameChan.length >= CAP) {
        // displace the coldest, most-dormant regular on that channel
        const victim = sameChan.slice().sort((a, b) => (a.trust - b.trust) || (a.lastSeenDay - b.lastSeenDay))[0]
        kept = roster.filter(r => r.id !== victim.id)
      }
      const reg = makeRegular({ ...seed, day: get().currentDay }, kept.map(r => r.name))
      set({ regulars: [reg, ...kept] })
      get().log('regular', `${reg.emoji} ${reg.name} liked doing business — now a ${channel === 'walkin' ? 'store regular' : 'regular online buyer'} (${reg.focus.label}).`, 0)
    },
  }
}
