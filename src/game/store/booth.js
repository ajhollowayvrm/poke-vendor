// Booth slice — the show floor, your store shelf, and customer encounters.
//
// createBoothSlice(set, get) returns: buying cards from show VENDORS (+ vendor rapport),
// your SHOW INVENTORY (bring cards to a show, showcase, deal-of-the-show, leave), your
// physical STORE SHELF (stock/pull), payment acceptance checks, and the big
// resolveEncounter reducer that resolves every walk-up/order option (give/sell/counter/
// browse/trade/buy-sealed-deal) plus the trust/regular side-effects and stale-order prune.
//
// The two ownership helpers below let a sale resolve against whichever bucket holds the
// card (collection / listings / show inventory / shop shelf).

import { round2, cardValue, setById } from '../engine'
import { encounterStillValid } from '../shows'
import { acceptedMethods, PAYMENT_METHODS, processingFee } from './constants'
import { methodLabel, feeNote, appendFeeMsg } from './helpers'

// A card you own may be in your collection, out on the market (listed/tweeted), in your
// show inventory (cards you brought to the show), or on your shop shelf. These let an
// encounter sale resolve against whichever bucket holds the card.
function findOwnedAnywhere(s, uid) {
  return s.collection.find(c => c.uid === uid)
    || (s.listings || []).find(l => l.card.uid === uid)?.card
    || (s.showInventory || []).find(c => c.uid === uid)
    || (s.shopDisplay || []).find(c => c.uid === uid)
    || null
}
function removeOwnedAnywhere(set, uid) {
  set(st => ({
    collection: st.collection.filter(c => c.uid !== uid),
    listings: (st.listings || []).filter(l => l.card.uid !== uid),
    showInventory: (st.showInventory || []).filter(c => c.uid !== uid),
    shopDisplay: (st.shopDisplay || []).filter(c => c.uid !== uid),
  }))
}

export function createBoothSlice(set, get) {
  return {
    // --- Buy a card from a vendor booth ---
    // At a show you can flip a fresh buy straight onto your table: pass
    // { toShowInventory:true } to list it for sale at the show instead of taking it
    // home to your collection. (Off the floor it always goes to the collection.)
    buyFromVendor(card, price, opts = {}) {
      if (!get().spend(price)) return false
      const bought = { ...card, _ask: undefined, _mispriced: undefined, _highlight: undefined }
      if (opts.toShowInventory) {
        set(s => ({ showInventory: [bought, ...(s.showInventory || [])] }))
        get().log('buy', `Bought ${card.name} from a vendor — listed at your booth`, -price)
      } else {
        set(s => ({ collection: [bought, ...s.collection] }))
        get().log('buy', `Bought ${card.name} from a vendor`, -price)
      }
      if (card._mispriced) get().addNotoriety(1) // you spotted a deal
      get().bumpGoal('buy', 1)
      if (opts.vendorId) get().bumpVendorRapport(opts.vendorId, price) // dealing builds rapport
      if (!opts.toShowInventory) get().checkCompletions() // bought card may finish a set
      return true
    },
    // Build rapport with a recurring show vendor by dealing with them (buying or selling).
    // Rapport = lifetime $ dealt; it earns a standing discount at their table (see vendorRapport).
    bumpVendorRapport(vendorId, amount) {
      if (!vendorId || !(amount > 0)) return
      set(s => ({ vendorSpend: { ...(s.vendorSpend || {}), [vendorId]: round2((s.vendorSpend?.[vendorId] || 0) + amount) } }))
    },

    // --- Show inventory: cards you bring to a show to sell at your booth ----------
    // Move the selected collection cards onto your show table. Floor buyers (offers,
    // browse-sales, walk-ups) only ever target these — your at-home collection isn't
    // for sale at the show. Anything unsold comes home when you leave (endShow()).
    bringToShow(uids) {
      const ids = new Set(uids)
      const bringing = get().collection.filter(c => ids.has(c.uid))
      if (!bringing.length) { set({ showInventory: [] }); return 0 }
      set(s => ({
        collection: s.collection.filter(c => !ids.has(c.uid)),
        showInventory: bringing,
      }))
      get().log('show', `Brought ${bringing.length} card${bringing.length > 1 ? 's' : ''} to sell at the show`, 0)
      return bringing.length
    },
    // Leaving the show: any unsold show-inventory cards return to your collection. Strip
    // the transient booth flags (showcase / deal-of-show) — they only matter at the show.
    endShow() {
      const inv = get().showInventory || []
      if (inv.length) {
        const home = inv.map(({ _showcase, _deal, ...c }) => c)
        set(s => ({ collection: [...home, ...s.collection], showInventory: [] }))
        get().log('show', `Brought ${inv.length} unsold card${inv.length > 1 ? 's' : ''} back home from the show`, 0)
      } else {
        set({ showInventory: [] })
      }
    },
    // --- Active booth: showcase + deal of the show ------------------------------
    // Feature a card in your showcase (up to 3): featured pieces pull more foot traffic and
    // sharper buyers to your table. Toggling off frees a slot.
    SHOWCASE_MAX: 3,
    toggleShowcase(uid) {
      const inv = get().showInventory || []
      const card = inv.find(c => c.uid === uid)
      if (!card) return
      const on = !!card._showcase
      if (!on && inv.filter(c => c._showcase).length >= 3) return // showcase is full
      set(s => ({ showInventory: (s.showInventory || []).map(c => c.uid === uid ? { ...c, _showcase: !on } : c) }))
    },
    // Mark ONE card as the "Deal of the Show" — a loss-leader markdown that draws a crowd
    // (a traffic + notoriety bump). Pass the same uid again (or null) to clear it.
    setDealOfShow(uid) {
      const cur = (get().showInventory || []).find(c => c._deal)
      const clearing = !uid || (cur && cur.uid === uid)
      set(s => ({ showInventory: (s.showInventory || []).map(c => ({ ...c, _deal: !clearing && c.uid === uid })) }))
      if (!clearing) { get().addNotoriety(1); get().log('show', `Announced a Deal of the Show — the markdown is pulling a crowd.`, 0) }
    },

    // --- Store display case (brick & mortar) -------------------------------------
    // The shelf in your physical shop: walk-in customers only ever buy/offer on cards
    // you've PUT OUT here (you choose what's on display), not your private collection.
    // Needs a storefront. Cards stay out until they sell or you pull them back.
    stockShop(uids) {
      if (!get().upgrades.storefront) return 0
      const ids = new Set(uids)
      const putting = get().collection.filter(c => ids.has(c.uid))
      if (!putting.length) return 0
      set(s => ({
        collection: s.collection.filter(c => !ids.has(c.uid)),
        shopDisplay: [...putting, ...(s.shopDisplay || [])],
      }))
      get().log('shop', `Put ${putting.length} card${putting.length > 1 ? 's' : ''} out on the shop shelf`, 0)
      return putting.length
    },
    // Pull one card off the shelf, back into your collection.
    pullFromShop(uid) {
      const card = (get().shopDisplay || []).find(c => c.uid === uid)
      if (!card) return
      set(s => ({
        collection: [card, ...s.collection],
        shopDisplay: (s.shopDisplay || []).filter(c => c.uid !== uid),
      }))
      get().log('shop', `Took ${card.name} off the shelf`, 0)
    },
    // Clear the whole shelf back into your collection.
    pullAllFromShop() {
      const shelf = get().shopDisplay || []
      if (!shelf.length) return 0
      set(s => ({ collection: [...shelf, ...s.collection], shopDisplay: [] }))
      get().log('shop', `Cleared the shelf — ${shelf.length} card${shelf.length > 1 ? 's' : ''} back in your collection`, 0)
      return shelf.length
    },

    // Can we take this buyer's preferred payment method? Returns null if fine,
    // or a "lost sale" message if not (the caller should abort the sale).
    paymentBlocked(payMethod) {
      if (!payMethod) return null
      if (acceptedMethods(get().upgrades).has(payMethod)) return null
      const m = PAYMENT_METHODS[payMethod]
      return `They could only pay by ${m?.name || payMethod}, which you can't accept yet. Sale lost.`
    },

    // --- Resolve an encounter option's effect. Returns a result message. ---
    resolveEncounter(effect) {
      const s = get()
      let msg = effect.msg || ''
      switch (effect.type) {
        case 'giveOwned': {
          const card = findOwnedAnywhere(get(), effect.uid)
          if (!card) { msg = "It's already gone."; break }
          removeOwnedAnywhere(set, effect.uid)
          s.addNotoriety(effect.notoriety, true)
          s.log('give', `Gave away a ${card.name} for free`, 0)
          set(st => ({ generousActs: st.generousActs + 1 }))
          get().bumpGoal('help', 1)
          break
        }
        case 'sellOwned': {
          const blocked = s.paymentBlocked(effect.payMethod)
          if (blocked) { s.addNotoriety(-1); s.log('lost-sale', blocked, 0); return blocked }
          // The card may live in your collection OR be out on the market (listed/tweeted) —
          // an online offer is on a listed card. Pull it from whichever bucket holds it.
          const card = findOwnedAnywhere(get(), effect.uid)
          if (card) {
            let price = effect.price
            if (get().upgrades.cases) price = round2(price * 1.12)
            const { net, fee } = processingFee(price, effect.payMethod)
            removeOwnedAnywhere(set, effect.uid)
            s.earn(net)
            s.addNotoriety(effect.notoriety)
            s.log('sell', `Sold ${card.name} (${methodLabel(effect.payMethod)})${feeNote(fee)}`, net)
            msg = msg + (get().upgrades.cases ? ' (display case bumped the price.)' : '')
            msg = appendFeeMsg(msg, fee, effect.payMethod, net)
            get().bumpGoal('sell', 1); get().bumpGoal('profit', net)
          }
          break
        }
        case 'counter': {
          const blocked = s.paymentBlocked(effect.payMethod)
          if (blocked) { s.addNotoriety(-1); s.log('lost-sale', blocked, 0); return blocked }
          if (Math.random() < (effect.chance ?? 0.5)) {
            const card = findOwnedAnywhere(get(), effect.uid)
            if (card) {
              // A counter is a normal sale of a card from your case — the display-case
              // bump applies here too (was previously missed).
              let price = effect.price
              if (get().upgrades.cases) price = round2(price * 1.12)
              const { net, fee } = processingFee(price, effect.payMethod)
              removeOwnedAnywhere(set, effect.uid)
              s.earn(net); s.addNotoriety(effect.notoriety)
              s.log('sell', `Countered and sold ${card.name} (${methodLabel(effect.payMethod)})${feeNote(fee)}`, net)
              msg = appendFeeMsg(msg, fee, effect.payMethod, net)
            }
          } else { msg = 'They balk at your counter and walk away.' }
          break
        }
        case 'browseSale': {
          s.addNotoriety(effect.notoriety)
          // Which of your cards can this browser actually buy?
          //   show   → only what you brought to your table (show inventory)
          //   listings → only cards you've LISTED for sale online (an online shopper can't
          //              buy out of your private collection — only what's up for sale)
          //   collection → a walk-in to your physical store browses your whole case
          // (Back-compat: an old in-flight encounter may still carry `fromShow`.)
          const pool = effect.pool || (effect.fromShow ? 'show' : 'collection')
          const owned = pool === 'show' ? (get().showInventory || [])
            : pool === 'listings' ? (get().listings || []).map(l => l.card)
            : pool === 'shop' ? (get().shopDisplay || [])
            : get().collection
          if (Math.random() < (effect.chance ?? 0.3) && owned.length) {
            const blocked = s.paymentBlocked(effect.payMethod)
            if (blocked) { s.log('lost-sale', blocked, 0); msg = msg + ' …but ' + blocked.toLowerCase(); break }
            // they buy a random card from the relevant pool at market
            const card = owned[Math.floor(Math.random() * owned.length)]
            let price = cardValue(card) // grade-aware: a slab sells for its graded value, not raw
            if (get().upgrades.cases) price = round2(price * 1.12)
            const { net, fee } = processingFee(price, effect.payMethod)
            removeOwnedAnywhere(set, card.uid)
            s.earn(net)
            s.log('sell', `A browser bought your ${card.name} (${methodLabel(effect.payMethod)})${feeNote(fee)}`, net)
            msg = `They bought your ${card.name} for $${net.toFixed(2)}${fee > 0 ? ` (after $${fee.toFixed(2)} ${methodLabel(effect.payMethod)} fee)` : ''}!`
            s.bumpGoal('sell', 1); s.bumpGoal('profit', net)
          }
          break
        }
        case 'trade': {
          // Card-for-card swap (± cash). You give up `uid`, receive `theirs`; cashAdj
          // > 0 pays you, < 0 you pay them. Bail gracefully if you no longer own yours,
          // or can't cover a cash-you-owe trade.
          const card = findOwnedAnywhere(get(), effect.uid)
          if (!card) { msg = 'That card is already gone — trade off.'; break }
          const adj = effect.cashAdj || 0
          if (adj < 0 && get().cash < -adj) { msg = `You can't cover the $${(-adj).toFixed(2)} on your side. Trade off.`; break }
          removeOwnedAnywhere(set, effect.uid)
          const got = { ...effect.theirs, _ask: undefined, _mispriced: undefined, _highlight: undefined }
          set(st => ({ collection: [got, ...st.collection] }))
          if (adj > 0) s.earn(adj)
          else if (adj < 0) s.spend(-adj)
          s.addNotoriety(effect.notoriety || 0)
          s.log('trade', `Traded ${card.name} for ${effect.theirs.name}${adj > 0 ? ` (+$${adj.toFixed(2)})` : adj < 0 ? ` (−$${(-adj).toFixed(2)})` : ''}`, adj)
          get().checkCompletions() // the card you traded for may finish a set
          break
        }
        case 'buySealedDeal': {
          // You're BUYING sealed off a stranger who messaged you. `fake` was rolled when the
          // deal was generated (correlated with the tells the player saw). Real → it lands in
          // your held sealed inventory; fake → the cash is gone and you get a dud.
          const set_ = setById(effect.setId)
          if (!set_) { msg = 'The deal vanished before you could pay.'; break }
          if (s.cash < effect.ask) { msg = `You can't cover the $${effect.ask.toFixed(2)} for it.`; break }
          if (effect.fake) {
            s.spend(effect.ask)
            s.log('scam', `Scammed: paid $${effect.ask.toFixed(2)} for a fake ${effect.product.type} of ${set_.name}`, -effect.ask)
            s.addNotoriety(effect.notoriety || 0)
            msg = `💸 Scammed. You paid $${effect.ask.toFixed(2)} and got ${effect.origin === 'vintage'
              ? 'a resealed pack stuffed with bulk commons'
              : 'an empty box — it never really shipped'}. Lesson learned.`
          } else {
            const item = s.buySealed(set_, { ...effect.product, _buyPrice: effect.ask }, effect.ask)
            if (!item) { msg = `You can't cover the $${effect.ask.toFixed(2)} for it.`; break }
            msg = `📦 Legit! Stocked a ${effect.product.type} of ${set_.name} for $${effect.ask.toFixed(2)} — a real steal. It's in 📦 Inventory.`
          }
          break
        }
        case 'none':
        default:
          s.addNotoriety(effect.notoriety || 0)
      }
      // Regulars: a returning regular's choice moves their trust (and tallies their spend);
      // a great deal with an anonymous walk-up can turn them INTO a regular.
      if (effect.regularId) {
        const spent = (effect.type === 'sellOwned' || effect.type === 'counter') ? (effect.price || 0) : 0
        get().bumpTrust(effect.regularId, effect.trustDelta || 0, spent)
      } else if (effect.formSeed) {
        get().formRegular(effect.formSeed)
      }
      // A sale may have removed a card that a pending inbox order was about — drop
      // any now-stale orders so you never see an offer for a card you no longer own.
      set(st => {
        const pruned = st.boothInbox.filter(enc => encounterStillValid(enc, st.collection, st.listings, st.shopDisplay))
        return pruned.length === st.boothInbox.length ? {} : { boothInbox: pruned }
      })
      get().checkMilestones() // generosity / sale-driven badges — instant on a walk-up outcome
      return msg
    },

    clearInboxItem(idx) {
      set(s => ({ boothInbox: s.boothInbox.filter((_, i) => i !== idx) }))
    },
  }
}
