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

import { round2, cardValue, setById, setIdOfCard, cardInValueRange, sealedValue, sealedCard,
  SHOP_SETS, SECONDARY_SETS, setProducts, marketMult } from '../engine'
import { encounterStillValid, STORE_SALE_PREMIUM, SEALED_SHOP_MARKUP, cardMatchesWant, haggleBuyin } from '../shows'

// A random modern/aftermarket sealed product whose MARKET value lands in [lo, hi] — what a
// repack could plausibly hide. Returns { set, product } or null when nothing fits the band.
function randomSealedInRange(lo, hi) {
  const candidates = []
  for (const set of [...SHOP_SETS, ...SECONDARY_SETS]) {
    for (const p of setProducts(set)) {
      const v = (p.price || 0) * marketMult(set.id)
      if (v >= lo && v <= hi) candidates.push({ set, product: p })
    }
  }
  if (!candidates.length) return null
  return candidates[Math.floor(Math.random() * candidates.length)]
}

// The Deal-of-the-Show loss-leader markdown: the card you flag actually sells cheaper (the
// trade-off for the +25% booth traffic it pulls). See setDealOfShow / ShowFloor boothMult.
const DEAL_OF_SHOW_MARKDOWN = 0.12
import { acceptedMethods, PAYMENT_METHODS, processingFee, omniShelfCards, HOLD_DAYS_STORE, GIVEAWAY_BUZZ_DAYS,
  STORE_CREDIT_BONUS, creditIssueCap, STORE_EVENTS, floorCapacity, floorCount, floorFreeSlots,
  floorItemCap, floorSkuKey, floorSkuCounts, isVintageFloorItem, onFloor } from './constants'
import { methodLabel, feeNote, appendFeeMsg } from './helpers'

// A card you own may be in your collection, out on the market (listed/tweeted), in your
// show inventory (cards you brought to the show), or on your shop shelf. These let an
// encounter sale resolve against whichever bucket holds the card.
function findOwnedAnywhere(s, uid) {
  // A featured sealed showpiece a whale is buying lives in sealedInventory — return it
  // card-shaped (name/value) so the shared sellOwned/counter handlers read it like a card.
  const sealed = (s.sealedInventory || []).find(it => it.uid === uid)
  if (sealed) return sealedCard(sealed)
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
    sealedInventory: (st.sealedInventory || []).filter(it => it.uid !== uid),
  }))
}
// Display-case occupancy across BOTH buckets — featured singles + featured sealed share
// the same (few) slots, so featuring is always a curation choice about what goes under glass.
const featuredCount = (s) => (s.collection || []).filter(c => c._featured).length
  + (s.sealedInventory || []).filter(it => it._featured).length

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
    // Buy a MYSTERY PACK off a booth — a repackaged grab-bag. You pay a fixed price and get
    // one random pull whose value lands somewhere in the pack's band (usually a small loss,
    // occasionally a real jackpot). Most pulls are a single; some repacks hide a SEALED
    // product instead (it stocks to your held inventory). Returns { card } or { sealed, set }
    // for the booth's reveal, or null if you couldn't afford it.
    buyMysteryPack(price, band) {
      if (!get().spend(price)) return null
      const [lo, hi] = band || [1, Math.max(2, price * 3)]
      // Odds tuned against `npm run sim` (which Monte-Carlos this exact action with the
      // real card pools): the pack must pay out LESS than it costs on average — a slot
      // machine with a dream, not an ATM. The old 12% jackpot in [hi, 4hi] + sealed in
      // [lo, 1.5hi] measured 138-208% of price across tiers.
      // ~12% of repacks hide a wrapped sealed product whose market value fits the band.
      if (Math.random() < 0.12) {
        const found = randomSealedInRange(lo, hi)
        if (found) {
          const item = get().mintSealedRow(found.set, found.product, price)
          set(s => ({ sealedInventory: [item, ...(s.sealedInventory || [])] }))
          get().log('buy', `❓ Opened a mystery pack for $${round2(price).toFixed(2)} — a sealed ${found.product.type} of ${found.set.name} was inside! (~$${sealedValue(item).toFixed(2)}, stocked to 📦 Inventory)`, -price)
          get().bumpGoal('buy', 1)
          get().checkMilestones()
          return { sealed: item, set: found.set }
        }
      }
      // small jackpot chance: a slice of packs draw from above the band (the "chase")
      const jackpot = Math.random() < 0.07
      const card = jackpot ? cardInValueRange(hi, hi * 2.2) : cardInValueRange(lo * 0.6, hi * 0.75)
      set(s => ({ collection: [card, ...s.collection] }))
      get().log('buy', `❓ Opened a mystery pack for $${round2(price).toFixed(2)} — pulled ${card.name} ($${cardValue(card).toFixed(2)})`, -price)
      get().bumpGoal('buy', 1)
      get().checkCompletions() // a mystery pull can finish a set
      get().checkMilestones()
      return { card }
    },

    // Trade one of YOUR cards (± cash) for a booth's card. `cashDelta` > 0 means you ALSO pay
    // that much; < 0 means the vendor tops you up. Your card is valued at what they'd pay for
    // it (their buy rate), so the cash closes the gap to their ask. Returns { got } or { error }.
    tradeForVendorCard(boothCard, yourUid, cashDelta = 0, opts = {}) {
      const mine = get().collection.find(c => c.uid === yourUid)
      if (!mine) return { error: 'You no longer have that card to trade.' }
      const delta = round2(cashDelta)
      if (delta > 0 && get().cash < delta) return { error: `You can't cover the $${delta.toFixed(2)} on your side.` }
      const got = { ...boothCard, _ask: undefined, _mispriced: undefined, _highlight: undefined }
      set(s => ({ collection: [got, ...s.collection.filter(c => c.uid !== yourUid)] }))
      if (delta > 0) get().spend(delta)
      else if (delta < 0) get().earn(-delta)
      if (opts.vendorId) get().bumpVendorRapport(opts.vendorId, cardValue(mine) + Math.max(0, delta))
      get().addNotoriety(1)
      get().log('trade', `Traded ${mine.name}${delta > 0 ? ` + $${delta.toFixed(2)}` : delta < 0 ? ` (got $${(-delta).toFixed(2)} back)` : ''} for ${got.name}`, -delta)
      get().bumpGoal('buy', 1)
      get().checkCompletions() // the card you traded for may finish a set
      get().checkMilestones()
      return { got }
    },

    // Many-to-many trade with a booth: give any bundle of YOUR cards + held sealed for a
    // bundle of THEIR cards + sealed products, with `cashDelta` closing the value gap
    // (> 0 you also pay; < 0 they top you up). Validates you own everything on your side and
    // can cover a positive delta. Returns { ok, error }.
    //   payload: { giveCardUids, giveSealedUids, getCards, getSealed, cashDelta, vendorId }
    tradeWithVendor({ giveCardUids = [], giveSealedUids = [], getCards = [], getSealed = [], cashDelta = 0, vendorId } = {}) {
      const cardIds = new Set(giveCardUids)
      const sealIds = new Set(giveSealedUids)
      const mine = get().collection.filter(c => cardIds.has(c.uid))
      const mySealed = (get().sealedInventory || []).filter(it => sealIds.has(it.uid))
      if (mine.length !== cardIds.size || mySealed.length !== sealIds.size) {
        return { error: 'Some of the cards/sealed you offered are no longer yours.' }
      }
      if (!getCards.length && !getSealed.length) return { error: 'Pick something to trade for.' }
      if (!mine.length && !mySealed.length && cashDelta <= 0) return { error: 'Offer at least one card, sealed, or cash.' }
      const delta = round2(cashDelta)
      if (delta > 0 && get().cash < delta) return { error: `You can't cover the $${delta.toFixed(2)} on your side.` }
      // Received items land in the right buckets. Sealed lands in held inventory (rip/list/flip later).
      const gotCards = getCards.map(c => ({ ...c, _ask: undefined, _mispriced: undefined, _highlight: undefined }))
      const gotSealed = getSealed.map(entry => get().mintSealedRow(entry.set, entry.product, entry.ask ?? entry.product?.price ?? 0))
      set(s => ({
        collection: [...gotCards, ...s.collection.filter(c => !cardIds.has(c.uid))],
        sealedInventory: [...gotSealed, ...(s.sealedInventory || []).filter(it => !sealIds.has(it.uid))],
      }))
      if (delta > 0) get().spend(delta)
      else if (delta < 0) get().earn(-delta)
      const myValue = mine.reduce((a, c) => a + cardValue(c), 0) + mySealed.reduce((a, it) => a + sealedValue(it), 0)
      if (vendorId) get().bumpVendorRapport(vendorId, myValue + Math.max(0, delta))
      get().addNotoriety(1)
      const giveN = mine.length + mySealed.length
      const getN = gotCards.length + gotSealed.length
      get().log('trade', `Traded ${giveN} item${giveN !== 1 ? 's' : ''} for ${getN}${delta > 0 ? ` + $${delta.toFixed(2)}` : delta < 0 ? ` (got $${(-delta).toFixed(2)} back)` : ''}`, -delta)
      get().bumpGoal('buy', 1)
      get().checkCompletions()
      get().checkMilestones()
      return { ok: true }
    },

    // Build rapport with a recurring show vendor by dealing with them (buying or selling).
    // Rapport = lifetime $ dealt; it earns a standing discount at their table (see vendorRapport).
    bumpVendorRapport(vendorId, amount) {
      if (!vendorId || !(amount > 0)) return
      set(s => ({ vendorSpend: { ...(s.vendorSpend || {}), [vendorId]: round2((s.vendorSpend?.[vendorId] || 0) + amount) } }))
    },

    // --- Show inventory: cards + sealed you bring to a show to sell at your booth -----
    // Move the selected collection cards (and held sealed product) onto your show table.
    // Floor buyers (offers, browse-sales, walk-ups) only ever target these — your at-home
    // collection/inventory isn't for sale at the show. Anything unsold comes home when you
    // leave (endShow()). MERGE into the buckets rather than replace: normally they're empty
    // here (endShow cleared them), and merging guarantees anything stranded by a mid-show
    // reload can never be overwritten and lost.
    bringToShow(cardUids, sealedUids) {
      const cardIds = new Set(cardUids || [])
      const sealIds = new Set(sealedUids || [])
      const bringing = get().collection.filter(c => cardIds.has(c.uid))
      const bringingSealed = (get().sealedInventory || []).filter(it => sealIds.has(it.uid))
      set(s => ({
        collection: s.collection.filter(c => !cardIds.has(c.uid)),
        showInventory: [...(s.showInventory || []), ...bringing],
        sealedInventory: (s.sealedInventory || []).filter(it => !sealIds.has(it.uid)),
        showSealed: [...(s.showSealed || []), ...bringingSealed],
      }))
      const parts = []
      if (bringing.length) parts.push(`${bringing.length} card${bringing.length > 1 ? 's' : ''}`)
      if (bringingSealed.length) parts.push(`${bringingSealed.length} sealed`)
      if (parts.length) get().log('show', `Brought ${parts.join(' + ')} to sell at the show`, 0)
      return bringing.length + bringingSealed.length
    },
    // Set the FLOOR WALLET when entering a show: `budget` is the cash you chose to bring.
    // The rest is stashed in showReserve (still counted in net worth) and folded back into
    // cash on endShow — so at the show `cash` IS your spend limit, and every existing cash
    // check enforces it with no changes to any buy path. Clamped to what you actually hold.
    beginShowWallet(budget) {
      const cash = get().cash
      const brought = Math.max(0, Math.min(round2(budget ?? cash), cash))
      set({ cash: brought, showReserve: round2(cash - brought) })
      return brought
    },
    // Leaving the show: unsold show-inventory cards return to your collection and unsold
    // sealed returns to your held inventory. Strip the transient booth flags (showcase /
    // deal-of-show) — they only matter at the show. Also fold the at-home reserve back into
    // cash (the money you didn't bring), so leaving reunites your wallet with your savings.
    endShow() {
      const reserve = get().showReserve || 0
      if (reserve) set(s => ({ cash: round2(s.cash + reserve), showReserve: 0 }))
      const inv = get().showInventory || []
      const sealed = get().showSealed || []
      if (inv.length || sealed.length) {
        // Unsold stock comes home to the STOREROOM (not straight back onto the floor) — you
        // decide what to put back out. Strip transient booth flags (showcase / deal-of-show).
        const home = inv.map(({ _showcase, _deal, ...c }) => ({ ...c, loc: 'storeroom' }))
        const homeSealed = sealed.map(({ _showcase, _deal, ...it }) => ({ ...it, loc: 'storeroom' }))
        set(s => ({
          collection: [...home, ...s.collection],
          showInventory: [],
          sealedInventory: [...homeSealed, ...(s.sealedInventory || [])],
          showSealed: [],
        }))
        const parts = []
        if (inv.length) parts.push(`${inv.length} card${inv.length > 1 ? 's' : ''}`)
        if (sealed.length) parts.push(`${sealed.length} sealed`)
        get().log('show', `Brought ${parts.join(' + ')} unsold back home from the show`, 0)
      } else {
        set({ showInventory: [], showSealed: [] })
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
      // No notoriety here — announcing a deal draws a crowd (the +25% boothMult), it isn't
      // itself a reputational act. It used to pay +1 per call, so toggling the flag between
      // two cards farmed rep for free.
      if (!clearing) get().log('show', `Announced a Deal of the Show — the markdown is pulling a crowd.`, 0)
    },

    // --- Pre-show leads (appointments) --------------------------------------------
    // Claim every lead for a show as you enter it: removes them from state and returns
    // them so App can stash them on activeShow._leads (the floor works off that copy —
    // the calendar days already advanced past the show at entry, so leaving them in
    // state would just get them expired mid-show by the next tick).
    claimShowLeads(showId) {
      const all = get().showLeads || []
      const mine = all.filter(l => l.showId === showId)
      if (mine.length) set(s => ({ showLeads: (s.showLeads || []).filter(l => l.showId !== showId) }))
      return mine
    },
    // Meet a buyer-lead at the show and sell them a matching card (from your collection
    // or your booth's show inventory) at the appointment premium. Returns { payout } or false.
    fulfillShowLead(lead, uid) {
      if (!lead?.want) return false
      const card = get().collection.find(c => c.uid === uid)
        || (get().showInventory || []).find(c => c.uid === uid)
      if (!card || !cardMatchesWant(card, lead.want)) return false
      const payout = round2(cardValue(card) * lead.premiumMult)
      set(s => ({
        collection: s.collection.filter(c => c.uid !== uid),
        showInventory: (s.showInventory || []).filter(c => c.uid !== uid),
        stats: { ...s.stats, wantsFilled: (s.stats.wantsFilled || 0) + 1 },
      }))
      get().earn(payout)
      get().addNotoriety(lead.notoriety || 3)
      get().log('want', `Met ${lead.who} at the show as arranged — sold ${card.name} at ${Math.round(lead.premiumMult * 100)}% of market`, payout)
      get().bumpGoal('want', 1)
      get().checkMilestones()
      return { payout }
    },

    // --- Store stock (brick & mortar): Shop Floor / Storeroom / Personal ----------
    // Singles (collection) and sealed rows (sealedInventory) each carry a `loc`:
    //   loc==='floor'     — out on the SALES FLOOR. The ONLY stock walk-ins & the counter buy.
    //   loc==='storeroom' — backstock (the buy-in default). Sells nothing until moved out front.
    //   locked (🔒)       — PERSONAL: your keepsakes, not for sale (and safe from bulk sweeps).
    // Per-item flags layer on top of a floor item: _heldFor (behind the counter for a regular),
    // _featured (display-case spotlight — pulls whales; floor-only). Streams, rips, shows, and
    // mystery packs draw from ALL your stock regardless of loc — the floor only gates walk-ins.
    //
    // Move stock between the three inventories. `dest` ∈ 'floor' | 'storeroom' | 'personal'.
    // Floor is capacity-limited (floorCapacity) — a partial move fills what fits and reports
    // how many landed. Moving OFF the floor clears the display-case spotlight (_featured is a
    // floor-only thing). Returns { moved, capped } — capped = how many didn't fit the floor.
    moveStock(kind, uids, dest) {
      const ids = new Set(Array.isArray(uids) ? uids : [uids])
      if (!ids.size) return { moved: 0, capped: 0 }
      const arrKey = kind === 'sealed' ? 'sealedInventory' : 'collection'
      // Floor is limited per-SKU (depth), not by a global slot count. Track the live floor
      // depth of each SKU and let a line out only until it hits the cap; vintage is exempt.
      const st = get()
      const counts = dest === 'floor' ? floorSkuCounts(st) : null
      let moved = 0, capped = 0
      set(s => ({
        [arrKey]: (s[arrKey] || []).map(x => {
          if (!ids.has(x.uid)) return x
          if (dest === 'floor') {
            if (x.loc === 'floor' && !x.locked) return x // already out front
            if (!isVintageFloorItem(kind, x)) {          // vintage bypasses the depth cap
              const k = floorSkuKey(kind, x)
              if ((counts.get(k) || 0) >= floorItemCap(st, kind, x)) { capped++; return x } // this SKU is full up front (loose packs get a deeper bin)
              counts.set(k, (counts.get(k) || 0) + 1)
            }
            moved++
            const { locked, ...rest } = x
            return { ...rest, loc: 'floor' }
          }
          if (dest === 'personal') {
            moved++
            const { _featured, _heldFor, ...rest } = x
            return { ...rest, locked: true, loc: 'storeroom' }
          }
          // storeroom
          if (x.loc !== 'floor' && !x.locked) return x
          moved++
          const { locked, _featured, ...rest } = x
          return { ...rest, loc: 'storeroom' }
        }),
      }))
      return { moved, capped }
    },
    // One-tap "Stock the floor": fill every open floor slot from the storeroom, best product
    // first (featured picks, then highest market value) — the pieces most likely to sell. Kept
    // (Personal) and already-floored stock are left alone. Returns how many items you put out.
    restockFloor() {
      const s = get()
      if (!s.upgrades?.storefront) return 0
      const counts = floorSkuCounts(s)
      // Best product first (featured, then value), filling each SKU up to its depth cap.
      // Vintage always goes out (its own bucket). Unlimited variety, limited depth.
      const cand = []
      const pool = [
        ...(s.collection || []).filter(c => c.loc !== 'floor' && !c.locked && !c._heldFor)
          .map(c => ({ uid: c.uid, kind: 'c', mkind: 'card', it: c, v: cardValue(c), feat: !!c._featured })),
        ...(s.sealedInventory || []).filter(it => it.loc !== 'floor' && !it.locked && !it._heldFor)
          .map(it => ({ uid: it.uid, kind: 's', mkind: 'sealed', it, v: sealedValue(it), feat: false })),
      ].sort((a, b) => (b.feat - a.feat) || (b.v - a.v))
      for (const x of pool) {
        if (isVintageFloorItem(x.mkind, x.it)) { cand.push(x); continue }
        const k = floorSkuKey(x.mkind, x.it)
        if ((counts.get(k) || 0) >= floorItemCap(s, x.mkind, x.it)) continue // deep enough up front (loose packs get a bigger bin)
        counts.set(k, (counts.get(k) || 0) + 1); cand.push(x)
      }
      if (!cand.length) return 0
      const cUids = new Set(cand.filter(x => x.kind === 'c').map(x => x.uid))
      const sUids = new Set(cand.filter(x => x.kind === 's').map(x => x.uid))
      set(st => ({
        collection: (st.collection || []).map(c => cUids.has(c.uid) ? { ...c, loc: 'floor' } : c),
        sealedInventory: (st.sealedInventory || []).map(it => sUids.has(it.uid) ? { ...it, loc: 'floor' } : it),
      }))
      get().log('shop', `🏬 Stocked the floor — put ${cand.length} item${cand.length > 1 ? 's' : ''} out front`, 0)
      return cand.length
    },
    FEATURED_MAX: 4,
    // Feature/unfeature a card in the display case (cap FEATURED_MAX). Featured pieces
    // attract deep-pocketed whales — they show up earlier and more often for them.
    toggleFeatureCard(uid) {
      const card = get().collection.find(c => c.uid === uid)
      if (!card || !get().upgrades.storefront) return false
      const on = !!card._featured
      // 🏛️ The Vault & Showroom doubles the display case (4 → 8 featured slots).
      const cap = get().FEATURED_MAX + (get().upgrades.vault ? 4 : 0)
      if (!on && featuredCount(get()) >= cap) return false
      // The display case IS the floor's spotlight — featuring puts the card out front (loc floor,
      // not kept). The few featured slots (≤8) sit inside the much larger floor, so no cap check.
      set(s => ({ collection: s.collection.map(c => c.uid === uid
        ? (on ? { ...c, _featured: false } : (({ locked, ...rest }) => ({ ...rest, _featured: true, loc: 'floor' }))(c)) : c) }))
      if (!on) get().log('shop', `⭐ Featured ${card.name} in the display case — the kind of piece whales come in for`, 0)
      return true
    },
    // Feature a VINTAGE sealed showpiece in the display case (shares FEATURED_MAX with cards).
    // Only vintage qualifies — a rare out-of-print booster under glass is whale bait; a $7 modern
    // pack isn't. Like a featured single, it draws whales earlier/more often and gets premium
    // offers through the same encounter engine (via its card-shaped wrapper in the shelf pool).
    toggleFeatureSealed(uid) {
      const item = (get().sealedInventory || []).find(it => it.uid === uid)
      if (!item || !get().upgrades.storefront) return false
      if (!item.vintage) return false // showpiece-worthy only
      const on = !!item._featured
      const cap = get().FEATURED_MAX + (get().upgrades.vault ? 4 : 0)
      if (!on && featuredCount(get()) >= cap) return false
      set(s => ({ sealedInventory: s.sealedInventory.map(it => it.uid === uid
        ? (on ? { ...it, _featured: false } : (({ locked, ...rest }) => ({ ...rest, _featured: true, loc: 'floor' }))(it)) : it) }))
      if (!on) get().log('shop', `⭐ Featured a sealed ${item.product.type} (${setById(item.setId)?.name || 'vintage'}) in the display case — a showpiece whales come in for`, 0)
      return true
    },
    // Flip KEEP (not for sale) on a sealed item. Kept sealed stays yours to rip/stream/
    // repack — walk-ins just can't buy it.
    toggleLockSealed(uid) {
      const it = (get().sealedInventory || []).find(x => x.uid === uid)
      if (!it) return false
      set(s => ({ sealedInventory: s.sealedInventory.map(x => x.uid === uid ? { ...x, locked: !x.locked } : x) }))
      return true
    },

    // --- In-store services: holds, giveaways, the consignment case ---------------
    // Put a stock item aside for a REGULAR: it moves into the storeroom's "saved for
    // regulars" section (loc:'storeroom', off the sellable floor). Over the next few days
    // they come in and buy it at a small premium over the walk-in price (trust-scaled odds,
    // resolved in the day-tick); if they never show, the hold lapses and it becomes ordinary
    // backstock.
    holdShelfItem(kind, uid, regularId) {
      const reg = (get().regulars || []).find(r => r.id === regularId && !r.flags?.burned)
      if (!reg) return false
      const held = { regularId: reg.id, name: reg.name, emoji: reg.emoji, daysLeft: HOLD_DAYS_STORE }
      const stamp = x => ({ ...x, _heldFor: held, loc: 'storeroom' })
      if (kind === 'sealed') {
        const it = (get().sealedInventory || []).find(x => x.uid === uid)
        if (!it) return false
        set(s => ({ sealedInventory: s.sealedInventory.map(x => x.uid === uid ? stamp(x) : x) }))
        get().log('shop', `Set the ${it.product.type} aside for ${reg.emoji} ${reg.name} — holding it ~${HOLD_DAYS_STORE} days`, 0)
      } else {
        const c = get().collection.find(x => x.uid === uid)
        if (!c) return false
        set(s => ({ collection: s.collection.map(x => x.uid === uid ? stamp(x) : x) }))
        get().log('shop', `Set ${c.name} aside for ${reg.emoji} ${reg.name} — holding it ~${HOLD_DAYS_STORE} days`, 0)
      }
      return true
    },
    // Drop a hold: the item stays in the storeroom as ordinary backstock (re-stock the floor
    // from there when you want it sellable again).
    releaseHold(kind, uid) {
      const strip = arr => (arr || []).map(x => x.uid === uid ? (({ _heldFor, ...rest }) => rest)(x) : x)
      if (kind === 'sealed') set(s => ({ sealedInventory: strip(s.sealedInventory) }))
      else set(s => ({ collection: strip(s.collection) }))
      get().log('shop', 'Dropped the hold — back in the storeroom', 0)
    },

    // --- 🎰 Pack Machine: real single packs, one flat price, vended at random ---------
    // Set the machine's flat price (what a customer pays for ANY random pack out of it).
    setMachinePrice(price) {
      const p = Math.max(0, round2(Number(price) || 0))
      set(s => ({ packMachine: { ...s.packMachine, price: p } }))
    },
    // Load sealed SINGLE packs into the machine (they leave sealedInventory). Boxes/cases and
    // kept/held items can't go in — the machine dispenses single packs only.
    stockMachine(uids) {
      const ids = new Set(Array.isArray(uids) ? uids : [uids])
      if (!ids.size) return 0
      const moving = (get().sealedInventory || []).filter(it =>
        ids.has(it.uid) && (it.product?.packs || 1) === 1 && !it.locked && !it._heldFor)
      if (!moving.length) return 0
      const movingIds = new Set(moving.map(it => it.uid))
      set(s => ({
        sealedInventory: s.sealedInventory.filter(it => !movingIds.has(it.uid)),
        packMachine: { ...s.packMachine, stock: [...(s.packMachine.stock || []),
          ...moving.map(({ loc, _featured, ...rest }) => rest)] },
      }))
      get().log('shop', `🎰 Loaded ${moving.length} pack${moving.length > 1 ? 's' : ''} into the Pack Machine`, 0)
      return moving.length
    },
    // Pull a pack back out of the machine — it returns to the storeroom.
    unstockMachine(uid) {
      const it = (get().packMachine?.stock || []).find(x => x.uid === uid)
      if (!it) return false
      set(s => ({
        packMachine: { ...s.packMachine, stock: s.packMachine.stock.filter(x => x.uid !== uid) },
        sealedInventory: [...s.sealedInventory, { ...it, loc: 'storeroom' }],
      }))
      return true
    },

    // Run an IN-STORE GIVEAWAY: give a card from your collection away to the locals.
    // Costs the card, but word spreads — a notoriety pop (generous, so the Charity
    // Banner boosts it), a walk-in traffic buzz window, and every regular warms up.
    runGiveaway(uid) {
      const card = get().collection.find(c => c.uid === uid)
      // 🔒 Personal keepsakes and counter holds can't be given away — locked stock is excluded
      // from every other exit path, and the value-sorted picker would otherwise put your best
      // (usually locked) piece right under a misclick.
      if (!card || card.locked || card._heldFor || !get().upgrades.storefront) return false
      const value = cardValue(card)
      // Anti-farm: penny cards give no rep (a $0.10 common giveaway wasn't "generous"),
      // and each successive giveaway THE SAME DAY pays sharply less (halving) — so you
      // can't mash the picker on bulk for free fame. A single meaningful giveaway still
      // lands its full pop. The traffic buzz + regular-trust warmth stay full either way.
      const done = get().giveawaysToday || 0
      const base = value < 5 ? 0 : Math.min(15, Math.round(2 + Math.sqrt(value)))
      const noto = Math.round(base * Math.pow(0.5, done))
      set(s => ({
        collection: s.collection.filter(c => c.uid !== uid),
        giveawayDaysLeft: GIVEAWAY_BUZZ_DAYS,
        giveawaysToday: (s.giveawaysToday || 0) + 1,
        generousActs: s.generousActs + 1,
        regulars: (s.regulars || []).map(r => r.flags?.burned ? r : { ...r, trust: Math.min(100, (r.trust || 0) + 3) }),
      }))
      if (noto > 0) get().addNotoriety(noto, true)
      const repNote = noto > 0 ? ` (+${noto}★)` : done > 0 ? ' (the room’s already seen your generosity today)' : ' (too minor to move your rep)'
      get().log('give', `🎁 In-store giveaway! Gave away ${card.name} ($${value.toFixed(2)}) — Word's out for ${GIVEAWAY_BUZZ_DAYS} days.${repNote}`, 0)
      get().bumpGoal('help', 1)
      get().checkMilestones()
      return { noto }
    },

    // Accept a local's consignment ask: their card goes in your case at THEIR price;
    // when it sells you keep the commission (no capital tied up). Passing just sends
    // them on their way.
    acceptConsignRequest(id) {
      const req = (get().storeConsignRequests || []).find(r => r.id === id)
      if (!req) return
      set(s => ({
        storeConsignRequests: s.storeConsignRequests.filter(r => r.id !== id),
        storeConsignments: [{ id: req.id, who: req.who, card: req.card, ask: req.ask, commissionPct: req.commissionPct, daysLeft: req.days }, ...(s.storeConsignments || [])],
      }))
      get().log('shop', `Took ${req.who}'s ${req.card.name} on consignment — $${req.ask.toFixed(2)} ask, ${Math.round(req.commissionPct * 100)}% is yours when it sells`, 0)
    },
    declineConsignRequest(id) {
      const req = (get().storeConsignRequests || []).find(r => r.id === id)
      if (!req) return
      set(s => ({ storeConsignRequests: s.storeConsignRequests.filter(r => r.id !== id) }))
      get().log('shop', `Passed on ${req.who}'s consignment — they took their ${req.card.name} elsewhere`, 0)
    },

    // --- Collection buy-ins (locals selling YOU their cards) ---------------------
    // Accept a lot for `method`: 'cash' pays their ask now; 'credit' pays nothing now —
    // you issue STORE CREDIT at a bonus (ask × 1.25). Credit deals cost no cash, warm the
    // seller toward becoming a regular, and drain out of future counter takings instead
    // (see the day-tick). Returns { cards, market, paid, method } for the reveal, or { error }.
    acceptBuyin(id, method = 'cash') {
      const offer = (get().buyinOffers || []).find(o => o.id === id)
      if (!offer) return { error: 'They already left.' }
      const free = offer.askCash <= 0 // a leaving-the-hobby giveaway
      let paid
      if (free) {
        paid = 0 // they're just handing it over
      } else if (method === 'credit') {
        paid = round2(offer.askCash * (1 + STORE_CREDIT_BONUS))
        if ((get().storeCredit || 0) + paid > creditIssueCap(get().notoriety)) {
          return { error: 'Too much credit outstanding — locals want cash until some of it gets spent.' }
        }
        set(s => ({ storeCredit: round2((s.storeCredit || 0) + paid) }))
      } else {
        paid = offer.askCash
        if (!get().spend(paid)) return { error: `You can't cover the $${paid.toFixed(2)} in cash.` }
      }
      // Mint any sealed product in the lot into your storeroom backstock (no extra charge — it
      // came with the collection). Cards go straight into your collection as before.
      const sealedRows = (offer.sealed || []).map(s => get().mintSealedRow(setById(s.setId), s.product, 0)).filter(Boolean)
      set(s => ({
        collection: [...offer.cards, ...s.collection],
        sealedInventory: sealedRows.length ? [...sealedRows, ...(s.sealedInventory || [])] : s.sealedInventory,
        buyinOffers: s.buyinOffers.filter(o => o.id !== id),
      }))
      const sealedNote = sealedRows.length ? ` + ${sealedRows.length} sealed` : ''
      const label = free ? 'FREE — they gave it away' : method === 'credit' ? `$${paid.toFixed(2)} store credit` : `$${paid.toFixed(2)} cash`
      get().log('buy', `Bought ${offer.count} cards${sealedNote} off ${offer.who} for ${label} (lot market ~$${offer.market.toFixed(2)})`, (method === 'credit' || free) ? 0 : -paid)
      get().addNotoriety(offer.estate ? 2 : 1) // a shop that takes in whole collections gets talked about
      get().bumpGoal('buy', offer.count)
      // A credit deal — or a grateful giveaway — keeps them in your orbit as a regular.
      if ((method === 'credit' || free) && offer.cards[0]) get().formRegular({ setId: setIdOfCard(offer.cards[0]), channel: 'walkin', generous: true })
      get().checkCompletions() // a bought lot can finish a set
      get().checkMilestones()
      return { cards: offer.cards, sealed: sealedRows, market: offer.market, paid, method, free }
    },
    declineBuyin(id) {
      const offer = (get().buyinOffers || []).find(o => o.id === id)
      if (!offer) return
      set(s => ({ buyinOffers: s.buyinOffers.filter(o => o.id !== id) }))
      get().log('shop', `Passed on ${offer.who}'s collection — they'll try the shop across town`, 0)
    },
    // Counter a buy-in's cash ask (haggle). Up to 2 rounds per seller; every outcome updates
    // the SAME pending offer, so the accept/decline flow is unchanged — a successful haggle
    // just lowers askCash (and with it the derived store-credit figure) before you pay.
    // Resolution lives in haggleBuyin (shows.js) against the lot's pre-rolled hidden floor.
    counterBuyin(id, offerAmount) {
      const o = (get().buyinOffers || []).find(x => x.id === id)
      if (!o) return { error: 'They already left.' }
      if (o.free) return { error: "They're giving it away — just take it." }
      if (o.haggled) return { error: 'You already shook on a number.' }
      if ((o.haggleRounds || 0) >= 2) return { error: "They're done haggling — it's the ask or nothing." }
      const amt = round2(Number(offerAmount) || 0)
      if (!(amt > 0)) return { error: 'Name a real number.' }
      const r = haggleBuyin(o, amt)
      const who = o.who.charAt(0).toUpperCase() + o.who.slice(1)
      if (r.walk) {
        set(s => ({ buyinOffers: s.buyinOffers.filter(x => x.id !== id) }))
        get().log('shop', `Haggled too hard — ${o.who} packed the lot back up for the shop across town.`, 0)
        return { walked: true }
      }
      if (r.accept) {
        set(s => ({ buyinOffers: s.buyinOffers.map(x => x.id === id ? { ...x, askCash: r.price, haggled: true } : x) }))
        get().log('shop', `${who} took your $${r.price.toFixed(2)} for the lot — pay them to close it.`, 0)
        return { accepted: true, price: r.price }
      }
      set(s => ({ buyinOffers: s.buyinOffers.map(x => x.id === id ? { ...x, askCash: r.counter, haggleRounds: (x.haggleRounds || 0) + 1 } : x) }))
      get().log('shop', `${who} countered at $${r.counter.toFixed(2)} — "that's already less than it's worth."`, 0)
      return { counter: r.counter }
    },

    // --- Hosted store events -------------------------------------------------------
    // Plan tonight's event: pay the cost now, it happens on the next day-advance
    // (see the day-tick). A raffle needs a prize card — it leaves your collection
    // into the plan so it can't be sold out from under the raffle.
    planStoreEvent(type, prizeUid = null) {
      const ev = STORE_EVENTS[type]
      const s = get()
      if (!ev || !s.upgrades.storefront) return { error: 'No storefront to host in.' }
      if (s.storeEventPlanned) return { error: 'Tonight is already booked.' }
      if ((s.eventCooldownLeft || 0) > 0) return { error: `The room needs a breather — try again in ${s.eventCooldownLeft} day${s.eventCooldownLeft > 1 ? 's' : ''}.` }
      if (s.notoriety < (ev.minNoto || 0)) return { error: `Nobody would come yet — you need ${ev.minNoto} notoriety.` }
      let prizeCard = null
      if (ev.needsPrize) {
        prizeCard = s.collection.find(c => c.uid === prizeUid)
        if (!prizeCard) return { error: 'Pick a prize card for the raffle.' }
        // Same rail as the giveaway: 🔒 keepsakes and held items can't be raffled off.
        if (prizeCard.locked || prizeCard._heldFor) return { error: 'That one is a 🔒 personal keepsake — unlock it first if you really mean to raffle it.' }
      }
      if (!get().spend(ev.cost)) return { error: `You can't cover the $${ev.cost} to run it.` }
      set(st => ({
        storeEventPlanned: { type, cost: ev.cost, prizeCard },
        collection: prizeCard ? st.collection.filter(c => c.uid !== prizeCard.uid) : st.collection,
      }))
      get().log('shop', `${ev.icon} Flyers up — hosting ${ev.name} tonight${prizeCard ? ` (prize: ${prizeCard.name})` : ''}. It happens when the day turns.`, -ev.cost)
      return { ok: true }
    },
    // Call it off: refund the cost, return the raffle prize.
    cancelStoreEvent() {
      const plan = get().storeEventPlanned
      if (!plan) return
      get().earn(plan.cost)
      set(s => ({
        storeEventPlanned: null,
        collection: plan.prizeCard ? [plan.prizeCard, ...s.collection] : s.collection,
      }))
      get().log('shop', `Called off tonight's ${STORE_EVENTS[plan.type]?.name || 'event'} — refunded $${plan.cost.toFixed(2)}`, plan.cost)
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
            // Glass Cases bump BUYER offers on your displayed cards — not sales YOU make
            // to a vendor's buylist (atVendor). Without that gate the +12% turned a whale
            // booth's 0.90× buy rate into >market, an above-market cash-out for anything.
            const casesBump = get().upgrades.cases && !effect.atVendor
            if (casesBump) price = round2(price * 1.12)
            if (effect.inStore) price = round2(price * (1 + STORE_SALE_PREMIUM)) // in-person shop premium
            const { net, fee } = processingFee(price, effect.payMethod)
            removeOwnedAnywhere(set, effect.uid)
            s.earn(net)
            s.addNotoriety(effect.notoriety)
            s.log('sell', `Sold ${card.name} (${methodLabel(effect.payMethod)})${feeNote(fee)}`, net)
            msg = msg + (casesBump ? ' (display case bumped the price.)' : '')
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
              if (effect.inStore) price = round2(price * (1 + STORE_SALE_PREMIUM)) // in-person shop premium
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
          // Build the buyable pool. At a show your table can hold cards AND sealed product;
          // wrap each entry so we know how to price/remove it when it's the one they grab.
          const owned = pool === 'show'
            ? [...(get().showInventory || []).map(c => ({ item: c, sealed: false })),
               ...(get().showSealed || []).map(it => ({ item: it, sealed: true }))]
            : pool === 'listings' ? (get().listings || []).map(l => ({ item: l.card, sealed: false }))
            : pool === 'shop'
            // The store = your SHOP FLOOR: a browser can only buy what you've put out front
            // (loc 'floor', not 🔒 kept, not held for a regular) — storeroom backstock sells
            // nothing until you move it out (see the three-inventory notes in constants.js).
            // Cards listed EVERYWHERE (online + in-store) are deliberately out too.
            ? [...get().collection.filter(c => onFloor(c)).map(c => ({ item: c, sealed: false })),
               ...omniShelfCards(get().listings).map(c => ({ item: c, sealed: false })),
               ...(get().sealedInventory || []).filter(it => onFloor(it)).map(it => ({ item: it, sealed: true }))]
            : get().collection.map(c => ({ item: c, sealed: false }))
          // Your CUSTOM MYSTERY PACKS sit on the same table/shelf — impulse product a
          // browser can grab at its fixed tier price (channel-gated per tier).
          if (pool === 'show' || pool === 'shop') {
            const chan = pool === 'show' ? 'show' : 'store'
            for (const p of get().packsForChannel(chan)) owned.push({ item: p, pack: true })
          }
          if (Math.random() < (effect.chance ?? 0.3) && owned.length) {
            const blocked = s.paymentBlocked(effect.payMethod)
            if (blocked) { s.log('lost-sale', blocked, 0); msg = msg + ' …but ' + blocked.toLowerCase(); break }
            // they buy a random item from the relevant pool at market
            const pick = owned[Math.floor(Math.random() * owned.length)]
            const item = pick.item
            if (pick.pack) {
              // A mystery pack sells at its FIXED tier price — no case/premium adjustments;
              // sellBuiltPack banks the money, ships the contents, and settles the rep.
              const r = s.sellBuiltPack(item.uid, { channel: pool === 'show' ? 'show' : 'walkin', payMethod: effect.payMethod })
              if (r) {
                msg = `They grabbed a ${r.tier.icon} ${r.tier.name} for $${r.gross.toFixed(2)} — `
                  + (r.outcome.key === 'jackpot' ? 'opened it on the spot and PULLED A BANGER. The table is mobbed! 🎉'
                    : r.outcome.key === 'happy' ? 'opened it right there and walked off grinning.'
                    : r.outcome.key === 'meh' ? 'opened it, shrugged, and moved on. Cash is cash.'
                    : 'opened it and shot you a dirty look. That one was thin. 😬')
              }
              break
            }
            const label = pick.sealed ? `${item.product.type} (${setById(item.setId)?.name || 'sealed'})` : item.name
            let price = pick.sealed ? sealedValue(item) : cardValue(item) // grade-aware for cards; market for sealed
            // Deal of the Show: the card you flagged as a loss-leader actually sells at a
            // markdown (that's the trade-off for the crowd it draws). ~12% off.
            if (item._deal) price = round2(price * (1 - DEAL_OF_SHOW_MARKDOWN))
            if (get().upgrades.cases) price = round2(price * 1.12)
            // In-store retail markup — sealed carries the fatter shop margin (that's the point of
            // stocking modern boosters on the shelf); singles get the plain walk-in premium.
            if (effect.inStore) price = round2(price * (1 + (pick.sealed ? SEALED_SHOP_MARKUP : STORE_SALE_PREMIUM)))
            const { net, fee } = processingFee(price, effect.payMethod)
            if (pick.sealed) set(st => ({
              showSealed: (st.showSealed || []).filter(x => x.uid !== item.uid),
              sealedInventory: (st.sealedInventory || []).filter(x => x.uid !== item.uid), // store stock IS held inventory
              shopSealed: (st.shopSealed || []).filter(x => x.uid !== item.uid),           // legacy shelf (pre-v42 saves)
            }))
            else removeOwnedAnywhere(set, item.uid)
            s.earn(net)
            s.log('sell', `A browser bought your ${label} (${methodLabel(effect.payMethod)})${feeNote(fee)}`, net)
            msg = `They bought your ${label} for $${net.toFixed(2)}${fee > 0 ? ` (after $${fee.toFixed(2)} ${methodLabel(effect.payMethod)} fee)` : ''}!`
            s.bumpGoal('sell', 1); s.bumpGoal('profit', net)
          }
          break
        }
        case 'trade': {
          // Many-to-many swap (± cash): give a bundle of your cards + sealed, receive a bundle
          // of their cards + sealed. cashAdj > 0 pays you, < 0 you pay them. Bail gracefully if
          // you no longer own everything on your side, or can't cover cash you owe.
          // Back-compat: old single-card effects carry `uid` + `theirs` (an object) instead of
          // `give`/`theirs`-array — normalize both shapes here.
          const give = effect.give || [{ kind: 'card', uid: effect.uid }]
          const giveCards = give.filter(g => g.kind !== 'sealed')
          const giveSealed = give.filter(g => g.kind === 'sealed')
          const getCards = effect.theirs ? (Array.isArray(effect.theirs) ? effect.theirs : [effect.theirs]) : []
          const getSealed = effect.theirsSealed || []
          // Your sealed may sit in held inventory OR on your show table (showSealed) — check both.
          const findSealed = (uid) => (get().sealedInventory || []).find(it => it.uid === uid)
            || (get().showSealed || []).find(it => it.uid === uid)
          const ownedCards = giveCards.map(g => findOwnedAnywhere(get(), g.uid)).filter(Boolean)
          const ownedSealed = giveSealed.map(g => findSealed(g.uid)).filter(Boolean)
          if (ownedCards.length !== giveCards.length || ownedSealed.length !== giveSealed.length) {
            msg = 'Some of those are already gone — trade off.'; break
          }
          const adj = effect.cashAdj || 0
          if (adj < 0 && get().cash < -adj) { msg = `You can't cover the $${(-adj).toFixed(2)} on your side. Trade off.`; break }
          giveCards.forEach(g => removeOwnedAnywhere(set, g.uid))
          if (giveSealed.length) {
            const ids = new Set(giveSealed.map(g => g.uid))
            set(st => ({
              sealedInventory: (st.sealedInventory || []).filter(it => !ids.has(it.uid)),
              showSealed: (st.showSealed || []).filter(it => !ids.has(it.uid)),
            }))
          }
          const gotCards = getCards.map(c => ({ ...c, _ask: undefined, _mispriced: undefined, _highlight: undefined }))
          const gotSealed = getSealed.map(e => get().mintSealedRow(e.set || setById(e.setId), e.product, e.ask ?? e.product?.price ?? 0))
          set(st => ({ collection: [...gotCards, ...st.collection], sealedInventory: [...gotSealed, ...(st.sealedInventory || [])] }))
          if (adj > 0) s.earn(adj)
          else if (adj < 0) s.spend(-adj)
          s.addNotoriety(effect.notoriety || 0)
          const giveN = giveCards.length + giveSealed.length, getN = gotCards.length + gotSealed.length
          s.log('trade', `Traded ${giveN} item${giveN !== 1 ? 's' : ''} for ${getN}${adj > 0 ? ` (+$${adj.toFixed(2)})` : adj < 0 ? ` (−$${(-adj).toFixed(2)})` : ''}`, adj)
          get().checkCompletions() // a card/sealed you traded for may finish a set
          break
        }
        case 'fulfillRequest': {
          // A walk-in asked for a specific item and you produced it (off the shelf or from the
          // back). `price` already includes the in-store + request premium. Sell it and remove
          // it from whichever bucket holds it; bail gracefully if it's since gone.
          const blocked = s.paymentBlocked(effect.payMethod)
          if (blocked) { s.addNotoriety(-1); s.log('lost-sale', blocked, 0); return blocked }
          const { net, fee } = processingFee(effect.price, effect.payMethod)
          if (effect.kind === 'sealed') {
            const item = (get().sealedInventory || []).find(it => it.uid === effect.uid)
              || (get().shopSealed || []).find(it => it.uid === effect.uid)
            if (!item) { msg = 'That one just left your stock — the customer moved on.'; break }
            set(st => ({
              sealedInventory: (st.sealedInventory || []).filter(it => it.uid !== effect.uid),
              shopSealed: (st.shopSealed || []).filter(it => it.uid !== effect.uid),
            }))
            s.earn(net); s.addNotoriety(effect.notoriety || 1)
            const label = `${item.product.type} (${setById(item.setId)?.name || 'sealed'})`
            s.log('sell', `Filled a walk-in request — sold ${label} (${methodLabel(effect.payMethod)})${feeNote(fee)}`, net)
            msg = appendFeeMsg(msg, fee, effect.payMethod, net)
          } else {
            const card = findOwnedAnywhere(get(), effect.uid)
            if (!card) { msg = 'That one just left your stock — the customer moved on.'; break }
            removeOwnedAnywhere(set, effect.uid)
            s.earn(net); s.addNotoriety(effect.notoriety || 1)
            s.log('sell', `Filled a walk-in request — sold ${card.name} (${methodLabel(effect.payMethod)})${feeNote(fee)}`, net)
            msg = appendFeeMsg(msg, fee, effect.payMethod, net)
          }
          s.bumpGoal('sell', 1); s.bumpGoal('profit', net)
          break
        }
        case 'requestMiss': {
          // You couldn't produce what the walk-in wanted — a small rep ding (or none) and a
          // demand signal in the log so you know what locals are hunting for.
          s.addNotoriety(effect.notoriety || 0)
          s.log('demand', `Missed demand: a walk-in wanted ${effect.what} and left empty-handed`, 0)
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

    // Clear one inbox order by its stable id (NOT array index — a resolve/prune shifts indices,
    // so an index captured at click time can point at the wrong order by the time this runs).
    clearInboxItem(id) {
      set(s => ({ boothInbox: s.boothInbox.filter(e => e.id !== id) }))
    },
  }
}
