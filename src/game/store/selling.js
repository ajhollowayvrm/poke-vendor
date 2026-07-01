// Selling slice — moving cards to customers over time (not instant exits).
//
// createSellingSlice(set, get) returns: your own-site LISTINGS (quote, list, reprice,
// relist, offers accept/decline, auto-sell toggle, pull, bulk-list), collector WANTS +
// public FORUM WTB fulfillment, and REGULARS (trust bumps + forming a new regular from a
// good deal). The passage of days that actually sells listings lives in daytick.js
// (tickListings); this slice is the player-facing actions around them.

import { cardValue, dailyViewers, buyerMaxMult, BUYER_SAVVY, round2 } from '../engine'
import { cardMatchesWant, makeRegular } from '../shows'
import { REGULAR_FORM_GATE } from './constants'

export function createSellingSlice(set, get) {
  return {
    // Quote a self-listing at `askMult`× market. Sales are now driven by real
    // browsing customers (see tickListings), so the quote ESTIMATES the experience:
    // expected shoppers/day and the share of the buyer pool whose savvy tolerates
    // this ask (≈ likelihood the next willing buyer bites). Returns
    // { market, ask, fee, net, viewsPerDay, buyShare }.
    listingQuote(card, askMult) {
      const market = cardValue(card)
      const noto = get().notoriety
      const ask = round2(market * askMult)
      const fee = round2(ask * 0.05)          // ~5% marketplace fee
      const net = round2(ask - fee)
      const viewsPerDay = +(dailyViewers(card, askMult, noto, () => 0.5)).toFixed(0)
      // share of the browsing pool whose max-willingness covers this ask (use the
      // savvy weights, with each type's notoriety/desirability-lifted ceiling).
      let buyShare = 0
      for (const [key, b] of Object.entries(BUYER_SAVVY)) {
        const max = buyerMaxMult(key, noto, card, () => 0.5)
        if (askMult <= max) buyShare += b.weight
      }
      return { market, ask, fee, net, viewsPerDay, buyShare: +buyShare.toFixed(2) }
    },

    // List a card on your own site at `askMult`× market. Removes it from the
    // collection and puts it on the market, where browsing customers decide whether
    // to buy (see tickListings). `views`/`offers` accrue as days pass.
    listOnSite(uid, askMult) {
      const card = get().collection.find(c => c.uid === uid)
      if (!card) return false
      const q = get().listingQuote(card, askMult)
      const listing = { card, ask: q.ask, net: q.net, askMult, views: 0, offers: [], age: 0, autoSell: true }
      set(s => ({
        collection: s.collection.filter(c => c.uid !== uid),
        listings: [...(s.listings || []), listing],
      }))
      get().log('listing', `Listed ${card.name} at $${q.ask.toFixed(2)} (${Math.round(askMult*100)}% of market)`, 0)
      return q
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
    // sell/expire outcome). Returns the count.
    listManyOnSite(uids, askMult) {
      const ids = new Set(uids)
      const cards = get().collection.filter(c => ids.has(c.uid))
      if (!cards.length) return 0
      const newListings = cards.map(card => {
        const q = get().listingQuote(card, askMult)
        return { card, ask: q.ask, net: q.net, askMult, views: 0, offers: [], age: 0 }
      })
      set(s => ({
        collection: s.collection.filter(c => !ids.has(c.uid)),
        listings: [...(s.listings || []), ...newListings],
      }))
      get().log('listing', `Listed ${cards.length} cards at ${Math.round(askMult*100)}% of market`, 0)
      return cards.length
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
      const CAP = channel === 'walkin' ? 3 : 6
      const pForm = (seed.generous ? 0.5 : 0.28) + Math.min(0.2, get().notoriety / 500)
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
