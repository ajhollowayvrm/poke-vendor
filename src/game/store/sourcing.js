// Sourcing slice — acquiring sealed product and reacting to inbound deals.
//
// createSourcingSlice(set, get) returns: buying from DISTRIBUTORS (single + bulk, with
// per-distributor rapport & finite restocking stock), the wholesale SUPPLY channel, the
// held SEALED INVENTORY (buy-and-hold, rip, list, quick-flip), and the inbound-DEAL
// counterplay loop (authenticate → buy → chargeback a scam). Ripping the animated pack and
// folding pulls into the collection is the COLLECTION slice; this slice stops at handing a
// held item back to the caller to rip.

import {
  round2, distributorById, rapportLevel, distributorPrice, stockKey, stockState,
  sealedValue, sealedCard, SEALED_FLIP_RATE, setById,
} from '../engine'
import { absoluteDay } from './constants'
import { nextSealedSuffix } from './ids'
import { methodLabel } from './helpers'

export function createSourcingSlice(set, get) {
  return {
    // --- Distributors ------------------------------------------------------------
    // Per-distributor relationship: rapport (lifetime $ spent with them) and their
    // finite, restocking inventory. Returns a normalized record for `distId`.
    distributorRec(distId) {
      return get().distributors[distId] || { spend: 0, stock: {} }
    },
    // Buy a sealed product FROM a specific distributor and hold it. Checks their stock,
    // routes the actual purchase through buySealed (charge + stock the item + log), then
    // bumps your rapport with them and decrements their shelf. Returns the new inventory
    // item, or null if out of stock / unaffordable.
    buyFromDistributor(distId, pokeSet, product, price) {
      const dist = distributorById(distId)
      if (!dist) return null
      const rec = get().distributorRec(distId)
      const level = rapportLevel(rec.spend).level
      const key = stockKey(pokeSet, product)
      if (stockState(dist, rec.stock, pokeSet, product, level).out) return null // sold out
      const item = get().buySealed(pokeSet, product, price) // spends, stocks, logs; null if broke
      if (!item) return null
      const paid = price ?? product._buyPrice ?? product.price ?? 0
      set(s => {
        const cur = s.distributors[distId] || { spend: 0, stock: {} }
        const st = stockState(dist, cur.stock, pokeSet, product, level) // fresh; cap ratchets up with rapport
        return {
          distributors: {
            ...s.distributors,
            [distId]: {
              spend: round2((cur.spend || 0) + paid),
              stock: { ...cur.stock, [key]: { q: Math.max(0, st.q - 1), cap: st.cap } },
            },
          },
        }
      })
      return item
    },
    // Buy UP TO `qty` of a product from a distributor in ONE purchase (no clicking N times).
    // Clamps to what's actually in stock and what you can afford, charges the total once,
    // stocks each unit, decrements their shelf by the amount bought, and bumps rapport once.
    // Returns { items, bought, spent, unit } or null if not even one could be bought.
    buyFromDistributorBulk(distId, pokeSet, product, price, qty) {
      const dist = distributorById(distId)
      if (!dist) return null
      const want = Math.max(1, Math.floor(qty || 1))
      const rec = get().distributorRec(distId)
      const level = rapportLevel(rec.spend).level
      const key = stockKey(pokeSet, product)
      const st = stockState(dist, rec.stock, pokeSet, product, level)
      const unit = round2(price ?? product._buyPrice ?? product.price ?? 0)
      // !out means at least one whole unit is buyable (mirrors the single-buy semantics).
      const inStock = st.out ? 0 : Math.max(1, Math.floor(st.q))
      const affordable = unit > 0 ? Math.floor(get().cash / unit) : want
      const n = Math.min(want, inStock, affordable)
      if (n < 1) return null
      const total = round2(unit * n)
      if (!get().spend(total)) return null
      get().recordSetSpend(pokeSet.id, total)
      const day = absoluteDay(get().currentDay, get().monthsElapsed)
      const items = []
      for (let i = 0; i < n; i++) {
        items.push({
          uid: `s${Date.now().toString(36)}${nextSealedSuffix()}`,
          setId: pokeSet.id, product: { ...product },
          boughtDay: day, boughtPrice: unit, vintage: !!pokeSet.vintage,
        })
      }
      set(s => {
        const cur = s.distributors[distId] || { spend: 0, stock: {} }
        const cst = stockState(dist, cur.stock, pokeSet, product, level) // fresh; cap ratchets w/ rapport
        return {
          sealedInventory: [...items, ...(s.sealedInventory || [])],
          distributors: {
            ...s.distributors,
            [distId]: {
              spend: round2((cur.spend || 0) + total),
              stock: { ...cur.stock, [key]: { q: Math.max(0, cst.q - n), cap: cst.cap } },
            },
          },
        }
      })
      get().log('buy', `Stocked ${n}× ${product.type} (${pokeSet.name}) — $${total.toFixed(2)}`, -total)
      get().bumpGoal('buy', n)
      return { items, bought: n, spent: total, unit }
    },
    // Wholesale a sealed product into the channel: pay your wholesale cost now, and it
    // sells through to other shops over a few days for a markup (passive income). You buy
    // in at Dave & Adam's wholesale price; requires Trusted+ rapport with them.
    supplyVendors(pokeSet, product) {
      const dist = distributorById('dna')
      const rec = get().distributorRec('dna')
      const level = rapportLevel(rec.spend).level
      if (!dist?.supply || level < dist.supplyMinLevel) return false
      const cost = distributorPrice(dist, product.price, level) // you buy in at wholesale
      if (!get().spend(cost)) return false
      get().recordSetSpend(pokeSet.id, cost)
      set(s => { // the buy-in builds rapport with Dave & Adam's too
        const cur = s.distributors.dna || { spend: 0, stock: {} }
        return { distributors: { ...s.distributors, dna: { ...cur, spend: round2((cur.spend || 0) + cost) } } }
      })
      // resell into the channel at a margin over RETAIL (other shops pay near retail),
      // minus a small channel fee. Net is comfortably above your wholesale cost.
      const sellThrough = round2(product.price * (1.04 + Math.random() * 0.06)) // ~104–110% of retail
      const net = round2(sellThrough * 0.95)                                    // 5% channel fee
      const daysLeft = 2 + Math.floor(Math.random() * 4)                        // 2–5 days
      const label = `${product.type} · ${pokeSet.name}`
      set(s => ({ supplyChannel: [...(s.supplyChannel || []), { label, net, daysLeft }] }))
      get().log('supply', `Wholesaled ${label} into the channel — nets $${net.toFixed(2)} in ~${daysLeft}d (cost $${cost.toFixed(2)})`, -cost)
      return { cost, net, daysLeft }
    },

    // --- Sealed inventory --------------------------------------------------------
    // Buy a sealed product and HOLD it (the default — you rip/list/flip later from the
    // Inventory tab). Charges `price` (the actual price the Buy UI showed: retail,
    // wholesale, or vintage market), attributes the spend to the set, and stocks the
    // item. Returns the new item (so the caller can immediately rip it if Auto-rip is on),
    // or null if you couldn't afford it.
    buySealed(pokeSet, product, price) {
      const cost = price ?? product._buyPrice ?? product.price
      if (!get().spend(cost)) return null
      get().recordSetSpend(pokeSet.id, cost)
      const item = {
        uid: `s${Date.now().toString(36)}${nextSealedSuffix()}`,
        setId: pokeSet.id,
        product: { ...product },
        boughtDay: absoluteDay(get().currentDay, get().monthsElapsed),
        boughtPrice: round2(cost),
        vintage: !!pokeSet.vintage,
      }
      set(s => ({ sealedInventory: [item, ...(s.sealedInventory || [])] }))
      get().log('buy', `Stocked ${product.type} (${pokeSet.name})`, -cost)
      get().bumpGoal('buy', 1)
      return item
    },

    // Pull a held product out of inventory to RIP it. Removes it and returns the item
    // ({ setId, product, ... }); the caller resolves the full set via setById and runs
    // the rip (animated or instant) — no re-charge, you already paid when you bought it.
    ripSealed(uid) {
      const item = (get().sealedInventory || []).find(i => i.uid === uid)
      if (!item) return null
      set(s => ({ sealedInventory: s.sealedInventory.filter(i => i.uid !== uid) }))
      return item
    },

    // List a held sealed product on your own site at `askMult`× market. It rides the
    // SAME browsing/offer engine as a card (via sealedCard's card-shaped wrapper).
    listSealed(uid, askMult) {
      const item = (get().sealedInventory || []).find(i => i.uid === uid)
      if (!item) return null
      const card = sealedCard(item)
      const q = get().listingQuote(card, askMult)
      const listing = { card, ask: q.ask, net: q.net, askMult, views: 0, offers: [], age: 0, autoSell: true }
      set(s => ({
        sealedInventory: s.sealedInventory.filter(i => i.uid !== uid),
        listings: [...(s.listings || []), listing],
      }))
      get().log('listing', `Listed ${card.name} at $${q.ask.toFixed(2)} (${Math.round(askMult*100)}% of market)`, 0)
      return q
    },

    // Quick-flip a held sealed product for instant cash at SEALED_FLIP_RATE of its live
    // market value (no waiting, a small spread vs listing it). Returns the net paid.
    quickFlipSealed(uid) {
      const item = (get().sealedInventory || []).find(i => i.uid === uid)
      if (!item) return null
      const net = round2(sealedValue(item) * SEALED_FLIP_RATE)
      set(s => ({ sealedInventory: s.sealedInventory.filter(i => i.uid !== uid) }))
      get().earn(net)
      const nm = setById(item.setId)?.name || ''
      get().log('sell', `Quick-flipped ${nm} ${item.product.type} — $${net.toFixed(2)}`, net)
      get().bumpGoal('sell', 1); get().bumpGoal('profit', net)
      return net
    },

    // --- Inbound sealed deals (authenticate / buy / chargeback) -------------------
    // A stranger's DM offering sealed below market (see makeSealedDeal). The catch is some
    // are fakes; these three actions are the counterplay loop.

    // Pay a fee to authenticate a deal before buying (gated by the Jeweler's Loupe). Returns
    // a READ correlated with the hidden truth but not perfect — a clever fake (esp. vintage)
    // can pass. The result is persisted on the inbox item so re-opening can't re-roll it.
    authenticateDeal(idx) {
      const item = get().boothInbox[idx]
      if (!item?.deal) return { error: 'Nothing to authenticate.' }
      if (item.authResult) return item.authResult           // already read — no re-charge / re-roll
      if (!get().upgrades.authkit) return { error: 'You need an Authentication Kit to authenticate.' }
      const fee = Math.max(10, round2(item.deal.ask * 0.05))
      if (get().cash < fee) return { error: `Authentication runs $${fee.toFixed(2)} — you can't cover it.` }
      get().spend(fee)
      // The read uses the fake's hidden `detectability` (crude fakes ~92%, sophisticated
      // reseals ~45%, vintage harder), so a GENUINE read is never a guarantee. A genuine item
      // clears, save a small false-alarm rate. The displayed confidence is the kit's TYPICAL
      // reliability — not the per-deal truth, so it doesn't leak the sophistication.
      const FALSE_POSITIVE = 0.06
      const detect = item.deal.detectability ?? (item.deal.origin === 'vintage' ? 0.72 : 0.85)
      const looksFake = item.deal.fake ? Math.random() < detect : Math.random() < FALSE_POSITIVE
      const read = { looksFake, confidence: item.deal.origin === 'vintage' ? 72 : 85, fee }
      set(s => ({ boothInbox: s.boothInbox.map((e, i) => i === idx ? { ...e, authResult: read } : e) }))
      get().log('auth', `Authenticated a ${item.deal.what} — $${fee.toFixed(2)}`, -fee)
      return read
    },

    // Commit to buying a deal. Real → it lands in your held sealed inventory (reusing
    // buySealed). Fake → the cash is gone and you get a dud. Returns a structured outcome so
    // the modal can show the result and offer a chargeback. Charge happens exactly once here;
    // the caller clears the inbox item right after so a re-open can't double-buy.
    buyDeal(deal) {
      if (!deal) return { error: true, msg: 'The deal vanished.' }
      const set_ = setById(deal.setId)
      if (!set_) return { error: true, msg: 'The deal vanished before you could pay.' }
      if (get().cash < deal.ask) return { error: true, msg: `You can't cover the $${deal.ask.toFixed(2)} for it.` }
      if (deal.fake) {
        get().spend(deal.ask)
        get().log('scam', `Scammed: paid $${deal.ask.toFixed(2)} for a fake ${deal.product.type} of ${set_.name}`, -deal.ask)
        return { fake: true, reversible: !!deal.reversible, payMethod: deal.payMethod, ask: deal.ask, origin: deal.origin }
      }
      const out = get().buySealed(set_, { ...deal.product, _buyPrice: deal.ask }, deal.ask)
      if (!out) return { error: true, msg: `You can't cover the $${deal.ask.toFixed(2)} for it.` }
      return { fake: false, ask: deal.ask, setName: set_.name, type: deal.product.type }
    },

    // File a payment dispute after a scam paid by a reversible rail (card / PayPal). A coin
    // -flip-ish recovery of most of the money — sketchy sellers force Venmo F&F / cash exactly
    // to deny you this, so the rail you were pushed onto is itself the tell. Returns the result.
    chargebackDeal(deal) {
      if (!deal?.reversible) return { won: false, recovered: 0, noRecourse: true }
      const won = Math.random() < 0.6
      const recovered = won ? round2(deal.ask * 0.8) : 0
      if (won) {
        get().earn(recovered)
        get().log('chargeback', `Chargeback won — recovered $${recovered.toFixed(2)} (${methodLabel(deal.payMethod)})`, recovered)
      } else {
        get().log('chargeback', `Chargeback denied — the $${deal.ask.toFixed(2)} is gone for good`, 0)
      }
      return { won, recovered }
    },
  }
}
