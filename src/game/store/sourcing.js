// Sourcing slice — acquiring sealed product and reacting to inbound deals.
//
// createSourcingSlice(set, get) returns: buying from DISTRIBUTORS (single + bulk, with
// per-distributor rapport & finite restocking stock), the wholesale SUPPLY channel, the
// held SEALED INVENTORY (buy-and-hold, rip, list, quick-flip), and the inbound-DEAL
// counterplay loop (authenticate → buy → chargeback a scam). Ripping the animated pack and
// folding pulls into the collection is the COLLECTION slice; this slice stops at handing a
// held item back to the caller to rip.

import {
  round2, distributorById, distributorUnlocked, rapportLevel, distributorPrice, stockKey, stockState,
  sealedValue, sealedCard, SEALED_FLIP_RATE, setById, breakOptions, searchable, rollSearched,
} from '../engine'
import { absoluteDay, weekIndexOf } from './constants'
import { purchaseLimit, limitKey, limitsTakenToday, recordLimitBuy, LIMIT_MAX } from '../shelf'
import { nextSealedSuffix } from './ids'
import { methodLabel, vintageLeft } from './helpers'

// Where a product came from, for the ledger and toasts. A cross-set product (an Ultra Premium
// Collection) is filed under an ANCHOR set so the sealed row has a setId, but naming that set
// would claim its 18 packs are all from one expansion. Name the era instead.
function originLabel(pokeSet, product) {
  return product?.pool?.series ? `${product.pool.series} era` : pokeSet?.name || ''
}

export function createSourcingSlice(set, get) {
  return {
    // --- Distributors ------------------------------------------------------------
    // Per-distributor relationship: rapport (lifetime $ spent with them) and their
    // finite, restocking inventory. Returns a normalized record for `distId`.
    distributorRec(distId) {
      return get().distributors[distId] || { spend: 0, stock: {} }
    },
    // --- Local Game Store credit -------------------------------------------------
    // Credit you hold at the LGS (earned turning in bulk at 5¢/card) pays for LGS purchases
    // automatically, like a gift card. Rather than thread a second payment rail through
    // buySealed/spend, we top the till up FROM credit right before the charge (moving up to
    // `cost` of credit into cash), let the normal charge run, and hand back the amount drawn so
    // the caller can refund it if the buy falls through. Net worth is conserved (credit was
    // already counted as an asset), and the cost BASIS stays the full sticker price — the credit
    // is a separate asset you spent, and the full spend still builds LGS rapport. Non-LGS: no-op.
    _drawLgsCredit(distId, cost) {
      if (distId !== 'lgs') return 0
      const c = round2(Math.min(get().lgsCredit || 0, cost || 0))
      if (c > 0) set(s => ({ cash: round2(s.cash + c), lgsCredit: round2((s.lgsCredit || 0) - c) }))
      return c
    },
    _refundLgsCredit(amount) {
      if (amount > 0) set(s => ({ cash: round2(s.cash - amount), lgsCredit: round2((s.lgsCredit || 0) + amount) }))
    },

    // 🧮 Purchasing Agent (upgrade): set the reorder point for one product TYPE (0 clears it).
    // The nightly restock itself runs in the day tick — every shop set gets topped up to the
    // minimum from the cheapest unlocked distributor with stock.
    setReorderPoint(type, qty) {
      const q = Math.max(0, Math.min(9, Math.floor(Number(qty) || 0)))
      set(s => {
        const points = { ...(s.reorderPoints || {}) }
        if (q > 0) points[type] = q
        else delete points[type]
        return { reorderPoints: points }
      })
      if (q > 0) get().log('buy', `🧮 Reorder point set — keep at least ${q}× ${type} of every set in stock`, 0)
      else get().log('buy', `🧮 Reorder point cleared for ${type}`, 0)
    },

    // 📋 Standing order (upgrade): one product on weekly auto-ship. Pass null to cancel.
    // The delivery itself runs in the day tick (buyFromDistributorBulk at rapport price).
    setStandingOrder(order) {
      set({ standingOrder: order || null })
      if (order) get().log('buy', `📋 Standing order set — ${order.qty}× ${order.type} ships weekly while stocked`, 0)
      else get().log('buy', '📋 Standing order cancelled', 0)
    },
    // 📰 Reprint-wave preorder: commit to `qty` units of the announced wave at the locked
    // unit price, PREPAID — the stock lands in your storeroom on drop day (resolved in the
    // day tick). Clamped to your allocation; the spend builds rapport with the shipping
    // distributor like any wholesale order. Returns { ok, bought, cost } or { error }.
    preorderWave(qty) {
      const w = get().reprintWave
      const absNow = absoluteDay(get().currentDay, get().monthsElapsed)
      if (!w || w.doneDay != null || absNow >= w.dropDay) return { error: 'No wave open for preorders right now.' }
      const n = Math.max(1, Math.floor(Number(qty) || 0))
      const room = Math.max(0, (w.allocCap || 0) - (w.preordered || 0))
      if (room < 1) return { error: 'Your allocation is fully committed.' }
      const take = Math.min(n, room)
      const cost = round2(take * w.unit)
      if (!get().spend(cost)) return { error: `You can't cover the $${cost.toFixed(2)} prepay.` }
      set(s => {
        const cur = s.distributors[w.distId] || { spend: 0, stock: {} }
        return {
          reprintWave: { ...s.reprintWave, preordered: (s.reprintWave.preordered || 0) + take, prepaid: round2((s.reprintWave.prepaid || 0) + cost) },
          distributors: { ...s.distributors, [w.distId]: { ...cur, spend: round2((cur.spend || 0) + cost) } },
        }
      })
      get().log('buy', `📰 Preordered ${take}× ${w.label} for the reprint wave (−$${cost.toFixed(2)} prepaid — lands on drop day)`, -cost)
      get().bumpGoal('buy', take)
      return { ok: true, bought: take, cost }
    },

    // 🎫 📦 Call in a favor (2 clout, rank 1+): your rep makes one call and the truck
    // comes early — the distributor's whole shelf refills to cap. Mechanically: their
    // consumed-stock map clears (an absent key reads as fully stocked, see stockState).
    cloutRestock(distId) {
      const dist = distributorById(distId)
      if (!dist) return { error: 'No such distributor.' }
      if ((get().rank || 0) < 1) return { error: 'Favors need a name — reach 🏷️ Weekend Flipper (rank 1) first.' }
      if (!distributorUnlocked(dist, get().notoriety, get().upgrades, get().rank || 0)) return { error: 'No account there yet.' }
      const rec = get().distributors[distId]
      if (!Object.keys(rec?.stock || {}).length) return { error: 'Their shelf is already fully stocked.' }
      if (!get().spendClout(2)) return { error: 'Not enough clout — this favor costs 2 🎫.' }
      set(s => ({ distributors: { ...s.distributors, [distId]: { ...(s.distributors[distId] || { spend: 0 }), stock: {} } } }))
      get().log('buy', `📦 Called in a favor at ${dist.name} — a truck hit their dock this morning; everything's back in stock. (−2 🎫)`, 0)
      return { ok: true }
    },
    // 🎫 📰 Jump the allocation (3 clout, rank 2+): while a reprint wave's preorder window
    // is open, your rep argues you into a bigger slice — allocCap ×1.5, once per wave.
    cloutJumpAllocation() {
      const w = get().reprintWave
      const absNow = absoluteDay(get().currentDay, get().monthsElapsed)
      if (!w || w.doneDay != null || absNow >= w.dropDay) return { error: 'No wave open for preorders right now.' }
      if (w.allocBonus) return { error: 'You already jumped this queue — once per wave.' }
      if ((get().rank || 0) < 2) return { error: 'Allocation games need a name — reach 📣 Known Local (rank 2) first.' }
      if (!get().spendClout(3)) return { error: 'Not enough clout — this favor costs 3 🎫.' }
      const bumped = Math.ceil((w.allocCap || 0) * 1.5)
      set(s => ({ reprintWave: { ...s.reprintWave, allocBonus: true, allocCap: bumped } }))
      get().log('buy', `📰 Jumped the allocation queue — your slice of the ${w.label} wave is now ${bumped} units. (−3 🎫)`, 0)
      return { ok: true, allocCap: bumped }
    },

    // Buy a sealed product FROM a specific distributor and hold it. Checks their stock,
    // routes the actual purchase through buySealed (charge + stock the item + log), then
    // bumps your rapport with them and decrements their shelf. Returns the new inventory
    // 🚫 THE one place the per-customer limit is computed. Both buy paths and both buy-screen
    // components read it here, because the last version of this lived only in the bulk path —
    // so a qty-of-1 buy (which is every collector-product buy, and most others) skipped it
    // entirely. A rule with two implementations has one implementation and one bug.
    purchaseLimitFor(distId, pokeSet, product) {
      const dist = distributorById(distId)
      if (!dist) return { limit: Infinity, taken: 0, left: Infinity }
      const level = rapportLevel(get().distributorRec(distId).spend).level
      const limit = purchaseLimit(dist, product, level)
      if (limit === Infinity) return { limit: Infinity, taken: 0, left: Infinity, name: dist.name }
      const day = absoluteDay(get().currentDay, get().monthsElapsed)
      const taken = limitsTakenToday(get().buyLimits, day, limitKey(distId, pokeSet, product))
      return { limit, taken, left: Math.max(0, limit - taken), name: dist.name, level }
    },
    // Record `n` bought against today's allowance. No-op for unlimited lines.
    _recordLimit(distId, pokeSet, product, n) {
      const dist = distributorById(distId)
      if (!dist) return
      const level = rapportLevel(get().distributorRec(distId).spend).level
      if (purchaseLimit(dist, product, level) === Infinity) return
      const day = absoluteDay(get().currentDay, get().monthsElapsed)
      const key = limitKey(distId, pokeSet, product)
      set(st => ({ buyLimits: recordLimitBuy(st.buyLimits, day, key, n) }))
    },

    // item, or null if out of stock / unaffordable.
    buyFromDistributor(distId, pokeSet, product, price, opts = {}) {
      const dist = distributorById(distId)
      if (!dist) return null
      if (!distributorUnlocked(dist, get().notoriety, get().upgrades, get().rank || 0)) return null // account not open yet
      // 🚢 An import channel (leadDays) never hands stock over the counter — the single-buy
      // rides the bulk path, which knows how to put an order on the water.
      if (dist.leadDays) {
        const r = get().buyFromDistributorBulk(distId, pokeSet, product, price, 1, opts)
        return r?.items?.[0] ? { ...r.items[0], _inTransit: true } : null
      }
      const rec = get().distributorRec(distId)
      const level = rapportLevel(rec.spend).level
      const key = stockKey(pokeSet, product)
      if (stockState(dist, rec.stock, pokeSet, product, level).out) return null // sold out
      // 🚫 "1 per customer" applies here too — this is the path a qty-of-1 buy takes, which
      // is every collector-product buy on the shelf.
      if (get().purchaseLimitFor(distId, pokeSet, product).left <= 0) return null
      const paid = price ?? product._buyPrice ?? product.price ?? 0
      // On credit (pure or split), the line carries it — don't also draw down held LGS store
      // credit (it stays simple: LGS credit only tops up a straight cash buy).
      const drawn = (opts.onCredit || opts.split) ? 0 : get()._drawLgsCredit(distId, paid) // gift-card the till from LGS credit first
      const item = get().buySealed(pokeSet, product, price, opts) // spends/credits, stocks, logs; null if broke
      if (!item) { get()._refundLgsCredit(drawn); return null }
      if (drawn > 0) get().log('buy', `💳 Applied ${round2(drawn).toFixed(2)} LGS store credit`, 0)
      get()._recordLimit(distId, pokeSet, product, 1)
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
    buyFromDistributorBulk(distId, pokeSet, product, price, qty, opts = {}) {
      const dist = distributorById(distId)
      if (!dist) return null
      if (!distributorUnlocked(dist, get().notoriety, get().upgrades, get().rank || 0)) return null // account not open yet
      const want = Math.max(1, Math.floor(qty || 1))
      const rec = get().distributorRec(distId)
      const level = rapportLevel(rec.spend).level
      const key = stockKey(pokeSet, product)
      const st = stockState(dist, rec.stock, pokeSet, product, level)
      const unit = round2(price ?? product._buyPrice ?? product.price ?? 0)
      // !out means at least one whole unit is buyable (mirrors the single-buy semantics).
      const inStock = st.out ? 0 : Math.max(1, Math.floor(st.q))
      // 🚫 "1 per customer". The sign on the collector product at a small shop, relaxed for a
      // regular (see game/shelf.js). Clamped here rather than in the UI because every buyer
      // goes through this function — the buy screen, the 🧮 Purchasing Agent, the 📋 standing
      // order, a 📇 special order. A limit only the buy button respects is not a limit.
      const limitLeft = get().purchaseLimitFor(distId, pokeSet, product).left
      // Affordability by pay mode: split = cash + open credit; pure credit = the line only;
      // cash = cash (+ LGS store credit topping the till, at the LGS only). LGS credit stays
      // out of the credit/split mixes to keep the split math a clean cash-then-credit draw.
      const lgs = (!opts.onCredit && !opts.split && distId === 'lgs') ? (get().lgsCredit || 0) : 0
      const spendable = opts.split ? round2(get().cash + get().creditAvailable())
        : opts.onCredit ? get().creditAvailable() : (get().cash + lgs)
      const affordable = unit > 0 ? Math.floor(spendable / unit) : want
      // NULL on any refusal, including the limit. Every caller of this treats a truthy return
      // as a completed purchase and reads `.bought` off it — an earlier version returned a
      // descriptive object here and gave the Purchasing Agent a NaN and the standing order an
      // "undefined× Elite Trainer Box". The buy screen explains the limit BEFORE you tap
      // (purchaseLimitFor), which is where that explanation belongs anyway.
      const n = Math.min(want, inStock, affordable, limitLeft)
      if (n < 1) return null
      const total = round2(unit * n)
      const drawn = (opts.onCredit || opts.split) ? 0 : get()._drawLgsCredit(distId, total) // gift-card the till from LGS credit first
      let split = null
      if (opts.split) { split = get().paySplit(total); if (!split) { get()._refundLgsCredit(drawn); return null } }
      else if (opts.onCredit ? !get().chargeCredit(total) : !get().spend(total)) { get()._refundLgsCredit(drawn); return null }
      if (drawn > 0) get().log('buy', `💳 Applied ${round2(drawn).toFixed(2)} LGS store credit`, 0)
      get().recordSetSpend(pokeSet.id, total)
      get()._recordLimit(distId, pokeSet, product, n)
      const day = absoluteDay(get().currentDay, get().monthsElapsed)
      // Shared by the player's Buy-tab bulk purchase AND the automated Standing Order /
      // Purchasing Agent nightly restockers — those two NEVER pass opts.locked, so they keep
      // landing straight in the storeroom unlocked exactly as before. Only a caller that
      // explicitly opts in (the player's manual buy) locks into Personal.
      const locksIn = !!opts.locked && !!get().upgrades?.storefront
      const items = []
      for (let i = 0; i < n; i++) {
        items.push({
          uid: `s${Date.now().toString(36)}${nextSealedSuffix()}`,
          setId: pokeSet.id, product: { ...product },
          boughtDay: day, boughtPrice: unit, vintage: !!pokeSet.vintage,
          ...(locksIn ? { locked: true, loc: 'storeroom' } : {}),
        })
      }
      // 🚢 Lead-time channel: the order is PAID and their shelf is decremented now, but the
      // stock is in transit first — it rides `imports` until the day tick lands it in the
      // storeroom `leadDays` from now. Net worth counts in-transit rows (they're paid-for
      // assets), and merge() registers their uids like any sealed bucket. Used by Japan
      // Direct (across the Pacific) AND Amazon (always in stock, never in your hands today).
      const inTransit = (dist.leadDays || 0) > 0
      const shipment = inTransit ? {
        id: `imp${Date.now().toString(36)}${nextSealedSuffix()}`,
        distId, setId: pokeSet.id, type: product.type, icon: product.icon || '📦',
        qty: n, unit, arrivesDay: day + dist.leadDays, orderedDay: day, rows: items,
      } : null
      set(s => {
        const cur = s.distributors[distId] || { spend: 0, stock: {} }
        const cst = stockState(dist, cur.stock, pokeSet, product, level) // fresh; cap ratchets w/ rapport
        return {
          ...(inTransit
            ? { imports: [...(s.imports || []), shipment] }
            : { sealedInventory: [...items, ...(s.sealedInventory || [])] }),
          distributors: {
            ...s.distributors,
            [distId]: {
              spend: round2((cur.spend || 0) + total),
              stock: { ...cur.stock, [key]: { q: Math.max(0, cst.q - n), cap: cst.cap } },
            },
          },
        }
      })
      const note = opts.onCredit ? ' on credit 💳'
        : (split && split.creditPart > 0 ? ` ($${split.cashPart.toFixed(2)} cash + $${split.creditPart.toFixed(2)} credit 💳)` : '')
      const cashOut = opts.onCredit ? 0 : split ? -split.cashPart : -total
      const placed = dist.japanese ? '🚢 Import order placed' : '📦 Order placed'
      const where = originLabel(pokeSet, product)
      if (inTransit) get().log('buy', `${placed} — ${n}× ${product.type} (${where}) — $${total.toFixed(2)}${note} · lands in ~${dist.leadDays} days`, cashOut)
      else get().log('buy', `Stocked ${n}× ${product.type} (${where}) — $${total.toFixed(2)}${note}`, cashOut)
      get().bumpGoal('buy', n)
      return { items, bought: n, spent: total, unit, inTransit, cashPart: split ? split.cashPart : (opts.onCredit ? 0 : total), creditPart: split ? split.creditPart : (opts.onCredit ? total : 0) }
    },
    // Buy a VINTAGE find (or a reserved hold) from a distributor. Charges `price`, stocks the
    // sealed item to hold, builds rapport with that distributor (it's real business), and — if
    // this was their reserved hold — clears the hold. Returns the stocked item or null.
    //
    // The weekly find is FINITE (vintageLeft): a vendor turns up a pack or two of out-of-print
    // product, not a case they can reorder. Taking the last one clears their shelf until next
    // week's find rotates in — so this refuses once the shelf is bare, and every buy records
    // what you took. A reserved hold is exempt: it's a separate one-off piece set aside for
    // you, and it's consumed by clearing `hold` below.
    buyDistributorVintage(distId, setId, product, price, opts = {}) {
      const pokeSet = setById(setId)
      if (!pokeSet) return null
      if (!distributorUnlocked(distributorById(distId), get().notoriety, get().upgrades, get().rank || 0)) return null // account not open yet
      const week = weekIndexOf(get().currentDay, get().monthsElapsed)
      if (!opts.fromHold && vintageLeft(get(), distId, setId) < 1) return null // shelf is bare
      // Tag the copy with the vendor it came from, so "Rip another" can check THEIR shelf for
      // one more instead of conjuring a fresh pack out of nowhere.
      const item = get().buySealed(pokeSet, { ...product, _buyPrice: price, _distId: distId, vintage: true }, price, { onCredit: opts.onCredit, split: opts.split })
      if (!item) return null
      set(s => {
        const cur = s.distributors[distId] || { spend: 0, stock: {} }
        const next = { ...cur, spend: round2((cur.spend || 0) + price) }
        if (opts.fromHold) next.hold = null // they handed over the piece they were holding
        else {
          // {week, taken} self-expires when the week rolls over — no restock tick needed.
          const prior = cur.vintage?.week === week ? (cur.vintage.taken || 0) : 0
          next.vintage = { week, taken: prior + 1 }
        }
        return { distributors: { ...s.distributors, [distId]: next } }
      })
      return item
    },

    // Wholesale a sealed product into the channel: pay your wholesale cost now, and it
    // sells through to other shops over a few days for a markup (passive income). You buy
    // in at Dave & Adam's wholesale price; requires Trusted+ rapport with them.
    supplyVendors(pokeSet, product) {
      const dist = distributorById('dna')
      if (!distributorUnlocked(dist, get().notoriety, get().upgrades, get().rank || 0)) return false // account not open yet
      const rec = get().distributorRec('dna')
      const level = rapportLevel(rec.spend).level
      if (!dist?.supply || level < dist.supplyMinLevel) return false
      const cost = distributorPrice(dist, product.price, level, { product, set: pokeSet }) // you buy in at wholesale
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
      const label = `${product.type} · ${originLabel(pokeSet, product)}`
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
    // `opts.onCredit` charges the distributor credit line instead of cash (fails if the line
    // is frozen or the buy is over your available credit). The cash-delta logged is 0 on
    // credit — no cash left your pocket, you took on debt instead.
    buySealed(pokeSet, product, price, opts = {}) {
      const cost = price ?? product._buyPrice ?? product.price
      // Three ways to pay: split (cash first, credit for the rest), pure credit, or cash.
      let split = null
      if (opts.split) { split = get().paySplit(cost); if (!split) return null }
      else if (opts.onCredit ? !get().chargeCredit(cost) : !get().spend(cost)) return null
      get().recordSetSpend(pokeSet.id, cost)
      // A shop's loose out-of-print stock is the safest place to buy it, but not risk-free —
      // they bought that box off somebody too. See SEARCH_RISK / mintSealedRow.
      const searched = searchable(pokeSet, product) && rollSearched(opts.source || 'shop')
      // Every caller of buySealed is a manual, in-the-moment player purchase — it lands in
      // Personal (locked), same as a ripped pack already does, until the player explicitly
      // moves it to the storeroom. `opts.locked = false` opts a future non-manual caller out.
      const locksIn = !!get().upgrades?.storefront && opts.locked !== false
      const item = {
        uid: `s${Date.now().toString(36)}${nextSealedSuffix()}`,
        setId: pokeSet.id,
        product: { ...product, ...(searched ? { _searched: true } : {}) },
        boughtDay: absoluteDay(get().currentDay, get().monthsElapsed),
        boughtPrice: round2(cost),
        vintage: !!pokeSet.vintage,
        ...(locksIn ? { locked: true, loc: 'storeroom' } : {}),
      }
      set(s => ({ sealedInventory: [item, ...(s.sealedInventory || [])] }))
      // Only real cash out of pocket moves the ledger: pure-credit is 0, a split logs just the
      // cash leg (the credit leg is debt), plain cash logs the full cost.
      const note = opts.onCredit ? ' — on credit 💳'
        : (split && split.creditPart > 0 ? ` — $${split.cashPart.toFixed(2)} cash + $${split.creditPart.toFixed(2)} credit 💳` : '')
      const cashOut = opts.onCredit ? 0 : split ? -split.cashPart : -cost
      get().log('buy', `Stocked ${product.type} (${originLabel(pokeSet, product)})${note}`, cashOut)
      get().bumpGoal('buy', 1)
      return item
    },

    // Mint a sealed-inventory row WITHOUT charging — for trades or grants where the item is
    // acquired by other means. Same uid/shape as buySealed; the CALLER adds it to inventory.
    // `boughtPrice` is the cost basis to record (e.g. the value given up in a trade).
    // `source` is WHERE this came from, and it only matters for one thing: whether a loose
    // out-of-print pack might already have been searched (see SEARCH_RISK). Rolled ONCE, here,
    // and stamped on the item's own product copy — so it's a fact about the pack you bought,
    // fixed from the moment you own it, not a coin flip re-rolled when you finally rip it.
    // Anything minted without a source (breaking your own box, preorders, special orders) is
    // clean by construction.
    mintSealedRow(pokeSet, product, boughtPrice = 0, source = null) {
      const searched = source && searchable(pokeSet, product) && rollSearched(source)
      return {
        uid: `s${Date.now().toString(36)}${nextSealedSuffix()}`,
        setId: pokeSet.id,
        product: { ...product, _ask: undefined, _mispriced: undefined, _highlight: undefined,
          ...(searched ? { _searched: true } : {}) },
        boughtDay: absoluteDay(get().currentDay, get().monthsElapsed),
        boughtPrice: round2(boughtPrice),
        vintage: !!pokeSet.vintage,
      }
    },

    // BREAK a held sealed unit down into its parts: a case into its boxes, a box / ETB / bundle
    // into loose packs. The classic vendor move — buy a case, sell 216 singles.
    //
    // The cost BASIS is split evenly across the children, so your P&L stays honest: break a
    // $3,000 case into 6 boxes and each box carries $500 of cost, not $0 (which would have made
    // every box read as pure profit) and not $3,000 (which would have made each look like a
    // disaster). `locked` carries over — breaking up a unit you'd set aside shouldn't quietly
    // put all its parts on the shop floor.
    //
    // Refuses an item promised to a regular: they're waiting on THAT product, not a pile of its
    // parts. Returns { count, type, value } or { error }.
    breakSealed(uid, targetType) {
      const item = (get().sealedInventory || []).find(i => i.uid === uid)
      if (!item) return { error: 'That product is gone.' }
      if (item._heldFor) return { error: `That one's promised to ${item._heldFor.name} — you can't break it up.` }
      const opt = breakOptions(item).find(o => o.product.type === targetType)
      if (!opt) return { error: "That can't be broken down any further." }
      const day = absoluteDay(get().currentDay, get().monthsElapsed)
      // Split the cost basis so it's EXACTLY conserved. Naively rounding each share invents (or
      // destroys) money: $3,000 / 216 rounds to $13.89 a pack, which adds back up to $3,000.24.
      // Round each share down and hand the leftover cents to the first unit.
      const total = round2(item.boughtPrice || 0)
      const share = Math.floor((total / opt.count) * 100) / 100
      const remainder = round2(total - share * opt.count)
      const rows = Array.from({ length: opt.count }, (_, i) => ({
        uid: `s${Date.now().toString(36)}${nextSealedSuffix()}`,
        setId: item.setId,
        // The canonical sub-product, deliberately clean: no _case/_retail/_buyPrice/_distId from
        // the parent. A pack that came out of a case was never bought from a distributor as a
        // pack, so it must not look re-buyable ("Rip another") — see App's ripAvailability.
        product: { ...opt.product },
        boughtDay: item.boughtDay ?? day,
        boughtPrice: i === 0 ? round2(share + remainder) : share,
        vintage: item.vintage,
        ...(item.locked ? { locked: true } : {}),
      }))
      set(s => ({ sealedInventory: [...rows, ...(s.sealedInventory || []).filter(i => i.uid !== uid)] }))
      const nm = setById(item.setId)?.name || ''
      get().log('sealed', `🔨 Broke a ${nm} ${item.product.type} into ${opt.count}× ${opt.product.type} (worth $${opt.total.toFixed(2)})`, 0)
      return { count: opt.count, type: opt.product.type, value: opt.total }
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

    // List MANY held sealed products at once (a quantity of a stack, or your whole inventory)
    // on your own site at `askMult`× market. Each unit becomes its own listing. Returns the
    // number actually listed.
    listSealedMany(uids, askMult) {
      let n = 0
      for (const uid of (uids || [])) if (get().listSealed(uid, askMult)) n++
      return n
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
    authenticateDeal(id) {
      const item = get().boothInbox.find(e => e.id === id)
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
      set(s => ({ boothInbox: s.boothInbox.map(e => e.id === id ? { ...e, authResult: read } : e) }))
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

    // --- Scalper offers (see makeScalperOffer) -------------------------------------
    // Real product, no fake risk at all — the only question is whether the marked-up ask
    // is worth it, or worth talking down.

    // Counter their inflated ask. Their hidden floor (_floorCash) sits between fair market
    // value and their opening ask — they'll give back some of the markup under pressure,
    // but never sell below what it's actually worth.
    haggleScalperOffer(deal, yourOffer) {
      if (!deal) return { error: true, msg: 'The offer vanished.' }
      const ask = deal.ask
      if (yourOffer >= ask) return { accept: true, price: ask }
      const floor = deal._floorCash ?? deal.reference
      if (yourOffer >= floor) return { accept: true, price: round2(yourOffer) }
      const shortfall = (floor - yourOffer) / Math.max(1, floor)
      const walkChance = Math.min(0.85, 0.15 + shortfall * 1.3)
      if (Math.random() < walkChance) return { walk: true }
      const counter = Math.max(floor, round2(ask - (ask - yourOffer) * 0.5))
      return { counter }
    },
    // Buy at the ask, or at whatever price haggling landed on. Reuses buySealed, so it
    // picks up the manual-purchase Personal-lock default like any other player buy.
    buyScalperOffer(deal, price) {
      if (!deal) return { error: true, msg: 'The offer vanished.' }
      const set_ = setById(deal.setId)
      if (!set_) return { error: true, msg: 'The offer vanished before you could pay.' }
      const pay = round2(price ?? deal.ask)
      if (get().cash < pay) return { error: true, msg: `You can't cover the $${pay.toFixed(2)} for it.` }
      const out = get().buySealed(set_, { ...deal.product, _buyPrice: pay }, pay)
      if (!out) return { error: true, msg: `You can't cover the $${pay.toFixed(2)} for it.` }
      return { ok: true, price: pay, setName: set_.name, type: deal.product.type }
    },
  }
}
