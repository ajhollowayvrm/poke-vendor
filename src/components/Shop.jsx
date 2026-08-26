import { useMemo, useState } from 'react'
import { SHOP_SETS, FETCHED_AT, setProducts, isHit, fmtMoney,
  DISTRIBUTORS, RAPPORT_LEVELS, distributorById, distributorCatalog, distributorPrice, distributorCasePrice,
  distributorDiscount, distributorUnlocked, rapportLevel, nextRapport, stockState, daysToRestock, caseLot, round2,
  VINTAGE_SETS, JP_SHOP_SETS, vintageProduct, sealedValue, setById, distributorVintageFind,
  hypeSurge, cardValue, ERA_PRODUCTS, eraAnchorSet, productTypeLabel } from '../game/engine'
import { Collapse, useOpen, bigScreen } from '../ui/Collapse'
import { useGame, RANKS } from '../game/store'
import { vintageLeft } from '../game/store/helpers'
import { weekIndexOf, absoluteDay, CREDIT_MONTHLY_RATE, creditMonthlyRate, UPGRADES } from '../game/store/constants'
import { HobbyWire, BreakersAlmanac } from './MarketIntel'
import AuctionHouse from './AuctionHouse'
import LocalMarket from './LocalMarket'
import { shelfProducts, shelfEraProducts, shelfBlurb } from '../game/shelf'
import { toast } from '../ui/dialog'
import { Explain } from '../ui/Explain'

// The Buy tab: distributor accounts, the weekly shelf, the vintage back room, credit,
// reorders, imports, the reprint wave, the auction house and the intel panels. Moved out
// of App.jsx as a plain move — App passes cash and the two buy handlers down unchanged.
export default function Shop({ cash, onBuy, onBuyVintage }) {
  const distributors = useGame(s => s.distributors)
  const notoriety = useGame(s => s.notoriety)
  const rank = useGame(s => s.rank || 0) // 🏅 banked ladder rank — the door for rank-gated accounts
  const clout = useGame(s => s.clout || 0) // 🎫 spendable favors (restock calls live here on the Buy tab)
  const cloutRestock = useGame(s => s.cloutRestock)
  const upgrades = useGame(s => s.upgrades) // ⛩️ Import License gates the Japan Direct account
  const lgsCredit = useGame(s => s.lgsCredit)
  const currentDay = useGame(s => s.currentDay)
  const monthsElapsed = useGame(s => s.monthsElapsed)
  const supplyVendors = useGame(s => s.supplyVendors)
  const supplyChannel = useGame(s => s.supplyChannel || [])
  useGame(s => s.marketMults) // keep strike-through retail honest as the market drifts
  // How many sealed copies of each product you already hold (set + product type), so the
  // buy shelf shows "📦 N" on a line you're already sitting on. Sealed on hand all lives in
  // sealedInventory (personal / storeroom / floor); a piece out at a show or in the pack
  // machine has left that bucket and isn't counted here — this is your buyable-decision stock.
  const sealedInventory = useGame(s => s.sealedInventory)
  const ownedCounts = useMemo(() => {
    const m = new Map()
    for (const it of (sealedInventory || [])) {
      const k = `${it.setId}|${it.product?.type || ''}`
      m.set(k, (m.get(k) || 0) + 1)
    }
    return m
  }, [sealedInventory])
  const [distId, setDistId] = useState(DISTRIBUTORS[0].id)
  const flash = (m) => toast(m, 2600)
  // Distributor credit line: a global account (not per-distributor) that scales with net worth.
  const creditBalance = useGame(s => s.credit?.balance || 0)
  const creditFrozen = useGame(s => !!s.credit?.frozen)
  const creditLimitV = useGame(s => s.creditLimit())
  const creditAvail = useGame(s => s.creditAvailable())
  const creditMin = useGame(s => s.creditMinimum())
  const payCredit = useGame(s => s.payCredit)
  const [payMode, setPayMode] = useState('cash') // how buys on this tab pay: 'cash' | 'split' (cash+credit) | 'credit'
  // Never leave the toggle stuck on a credit mode the line can't back — fall back to cash.
  const creditUsable = !creditFrozen && creditAvail > 0
  const onCredit = payMode === 'credit' && creditUsable  // pure credit
  const split = payMode === 'split' && creditUsable       // 🔀 cash first, credit for the rest
  // Which distributors have vintage on the shelf this week (a weekly find still in stock, or a
  // rapport hold set aside for you) — drives the 🗝️ marker on their picker chip. Selected as a
  // stable string so the Set below only rebuilds when the actual set of vintage-having stores changes.
  const vintageDistKey = useGame(s => DISTRIBUTORS
    .filter(d => vintageLeft(s, d.id) > 0 || s.distributors?.[d.id]?.hold)
    .map(d => d.id).join(','))
  const vintageDists = useMemo(() => new Set(vintageDistKey ? vintageDistKey.split(',') : []), [vintageDistKey])

  const dist = distributorById(distId) || DISTRIBUTORS[0]
  const rec = distributors[distId] || { spend: 0, stock: {} }
  const lvl = rapportLevel(rec.spend)
  // Week index drives Greg's rotating catalog (month-safe; 30 days/month). Shared with the
  // store so the vintage shelf can't read as in-stock here and sold-out at the buy path.
  const weekIndex = weekIndexOf(currentDay, monthsElapsed)
  const unlocked = distributorUnlocked(dist, notoriety, upgrades, rank)
  const catalog = distributorCatalog(dist, SHOP_SETS, weekIndex)
  // Greg flags one set's box as a clearance lot each week — a steep, thin-stock steal.
  const clearanceSetId = dist.clearance && catalog.length ? catalog[weekIndex % catalog.length].id : null
  const showSupply = unlocked && dist.supply && lvl.level >= dist.supplyMinLevel

  return (
    <>
      {/* ORDER ON THIS TAB IS THE POINT, so read before rearranging.
          The shelf used to render TWELFTH: picker, imports, auction house, reprint wave, two
          intel panels, reorder ledger, rapport bar, clout button, supply panel, distributor
          blurb, credit panel — and only then the thing the player opened the tab to do. Roughly
          a thousand pixels of reference material in front of the one primary action.
          Now: pick a vendor → choose how you're paying → BUY. Everything that reports rather
          than acts sits below the shelf, and the panels that used to be open by default are
          collapsed (see AuctionHouse / MarketIntel / CreditPanel).
          The intel panels stay OUTSIDE the unlocked/marketplace branch, exactly as before, so
          they still show on the 📱 marketplace and locked-account views. */}
      <DistributorPicker distributorState={distributors} notoriety={notoriety} upgrades={upgrades} rank={rank} selected={distId} onSelect={setDistId} vintageDists={vintageDists} />

      {/* 🚢 Import orders still crossing the Pacific — visible whichever shelf you're browsing */}
      <ImportsInTransit />

      {!unlocked ? (
        <LockedDistributor dist={dist} notoriety={notoriety} rank={rank} />
      ) : dist.marketplace ? (
        /* 📱 A listings channel, not a shelf: no catalog, no stock, no rapport, no credit
           line. Individuals do not extend you net terms. */
        <LocalMarket />
      ) : (<>
      {/* 💳 Above the shelf on purpose: the pay mode decides what every buy button below
          charges. Its balance detail is collapsed; the mode toggle itself never hides. */}
      <CreditPanel balance={creditBalance} limit={creditLimitV} avail={creditAvail} min={creditMin}
        frozen={creditFrozen} cash={cash} payMode={payMode} setPayMode={setPayMode}
        onPay={(amt) => { const paid = payCredit(amt); if (paid > 0) flash(`Paid ${fmtMoney(paid)} toward your credit line.`) }} />

      {/* 🛒 THE SHELF — the primary action on this tab. Nothing goes above it that is not
          "which vendor" or "how am I paying". */}
      {catalog.length === 0 ? (
        <p className="muted mt-6">{dist.name} has nothing on the shelf right now — check back next week.</p>
      ) : (
        <div className="shop-list">
          {groupByEra(catalog).map((era, i) => (
            <DistributorEraCard key={era.series} era={era} dist={dist} lvl={lvl} stock={rec.stock}
              cash={cash} onBuy={onBuy} clearanceSetId={clearanceSetId} owned={ownedCounts}
              onCredit={onCredit} split={split} creditAvail={creditAvail} weekIndex={weekIndex}
              defaultOpen={i === 0} />
          ))}
        </div>
      )}

      <VintageShelf dist={dist} rec={rec} weekIndex={weekIndex} cash={cash} onBuyVintage={onBuyVintage} onCredit={onCredit} split={split} creditAvail={creditAvail} />

      <RapportBanner dist={dist} rec={rec} lvl={lvl} />
      {/* 🎫 Clout spend: something on this shelf sold out — a favor gets the truck there early. */}
      {rank >= 1 && Object.values(rec.stock || {}).some(v => (v?.q ?? 1) <= 0) && (
        <div style={{ margin: '8px 0' }}>
          <button className="btn alt t-xs" style={{ padding: '4px 10px' }} disabled={clout < 2}
            onClick={() => { const r = cloutRestock(distId); flash(r.error || `📦 ${dist.name} took the call — shelf's full again.`) }}>
            📦 Call in a favor — restock {dist.name} · 2 🎫 (you have {Math.floor(clout)})
          </button>
        </div>
      )}

      {showSupply && (
        <SupplyPanel dist={dist} lvl={lvl} supplyVendors={supplyVendors} supplyChannel={supplyChannel} cash={cash} flash={flash} />
      )}

      {/* One line visible, the rest behind the ?. The blurb plus the pricing provenance ran to
          about forty words and printed on every visit to every vendor, at the same weight as the
          shelf above it. Where the prices come from is worth reading once, not forty times. */}
      <div className="banner mt-6">
        {dist.icon} <b style={{ color: dist.color }}>{dist.name}</b> — {dist.blurb}
        {' '}
        <Explain label={`How ${dist.name} prices its stock`}>
          {dist.japanese
            ? <>Sealed priced off the <b>real JP singles market</b> (data {new Date(FETCHED_AT).toLocaleDateString()}); JP boosters rip 5 cards on their own hit ladder. 🚢 Orders land in ~{dist.leadDays} days.</>
            : <>Live <b>TCGplayer sealed prices</b> (data {new Date(FETCHED_AT).toLocaleDateString()}); each product rips into its real pack count.</>}
        </Explain>
        {dist.id === 'lgs' && (lgsCredit || 0) > 0 && (
          <> {' '}<span className="pill" style={{ background: '#5ec98a22', color: 'var(--green)' }}>💳 {fmtMoney(lgsCredit)} store credit — spent automatically here</span></>
        )}
      </div>

      </>)}

      {/* Below the fold on purpose — these REPORT, they don't act. They stay outside the
          unlocked/marketplace branch above so the 📱 marketplace and locked views keep them. */}
      {/* 🔨 The auction house: the buy side of the hammer, alongside the wholesale shelves */}
      <AuctionHouse />

      {/* 📰 Reprint wave: industry news — shows whichever storefront is selected */}
      <ReprintWaveBanner cash={cash} flash={flash} />

      {/* Buy-tab intel (each self-gates on its upgrade): 📈 demand + movers · 📐 rip EV */}
      <HobbyWire />
      <BreakersAlmanac />

      {/* 🧮 Purchasing Agent's reorder-points ledger (self-gates on the upgrade) */}
      <ReorderPanel />

    </>
  )
}

// 📰 The reprint-wave preorder banner (Buy tab). Shows the active wave: what's restocking,
// days to drop, your allocation at the locked unit price, and how many locals have paid
// deposits at your counter. The lifecycle itself lives in the day-tick; committing here
// goes through sourcing.preorderWave (prepaid — stock lands in the storeroom on drop day).
function ReprintWaveBanner({ cash, flash }) {
  const wave = useGame(s => s.reprintWave)
  const currentDay = useGame(s => s.currentDay)
  const monthsElapsed = useGame(s => s.monthsElapsed)
  const preorderWave = useGame(s => s.preorderWave)
  const rank = useGame(s => s.rank || 0)
  const clout = useGame(s => s.clout || 0)
  const cloutJumpAllocation = useGame(s => s.cloutJumpAllocation)
  useGame(s => s.marketMults) // the announcement dip moves the strike-through retail
  const [qty, setQty] = useState(1)
  if (!wave || wave.doneDay != null) return null
  const absNow = absoluteDay(currentDay, monthsElapsed)
  if (absNow >= wave.dropDay) return null
  const daysLeft = wave.dropDay - absNow
  const room = Math.max(0, (wave.allocCap || 0) - (wave.preordered || 0))
  const q = Math.max(1, Math.min(qty, Math.max(1, room)))
  const cost = round2(q * wave.unit)
  const waveSet = setById(wave.setId)
  return (
    <div className="banner" style={{ marginTop: 12, borderColor: 'var(--gold, #ffd45e)' }}>
      📰 <b>Reprint wave</b> — <b>{wave.label}</b> restocks in <b>{daysLeft} day{daysLeft > 1 ? 's' : ''}</b>.
      {' '}Allocation via {wave.distName}: <b>{wave.preordered}/{wave.allocCap}</b> committed at <b>{fmtMoney(wave.unit)}</b> each
      {waveSet ? <> (retail ~{fmtMoney((waveSet.products || []).find(p => p.type === wave.productType)?.price || 0)})</> : null}.
      {(wave.custPreorders || 0) > 0 && <> <Explain label="What are local deposits?" trigger={
        <span className="pill" style={{ background: '#ffd45e22', color: 'var(--gold, #ffd45e)' }}>
        🧾 {wave.custPreorders} local deposit{wave.custPreorders > 1 ? 's' : ''} riding on it</span>
      }>
        <b>🧾 Local deposits</b>
        <p>Locals paid deposits at your counter. They pick up on drop day and pay the balance
          at retail + a premium. Short them and it's refunds + a grudge.</p>
      </Explain></>}
      {room > 0 ? (
        <span className="row" style={{ gap: 6, marginTop: 6, alignItems: 'center', display: 'inline-flex', marginLeft: 8 }}>
          <button className="btn alt btn-fixed" style={{ padding: '2px 9px' }} onClick={() => setQty(v => Math.max(1, v - 1))}>−</button>
          <b>{q}</b>
          <button className="btn alt btn-fixed" style={{ padding: '2px 9px' }} onClick={() => setQty(v => Math.min(room, v + 1))}>+</button>
          <button className="btn gold t-xs btn-fixed" style={{ padding: '4px 10px' }} disabled={cash < cost}
            onClick={() => { const r = preorderWave(q); flash(r.error || `📰 Preordered ${r.bought} — lands on drop day.`); if (!r.error) setQty(1) }}>
            Preorder {q} · {fmtMoney(cost)}
          </button>
        </span>
      ) : <b style={{ marginLeft: 8 }}> Allocation fully committed.</b>}
      {/* 🎫 Clout spend: argue your way into a bigger slice of the wave (once per wave). */}
      {!wave.allocBonus && rank >= 2 && (
        <button className="btn alt t-xs" style={{ marginLeft: 8, padding: '4px 10px' }} disabled={clout < 3}
          onClick={() => { const r = cloutJumpAllocation(); flash(r.error || `📰 Queue jumped — your cap is now ${r.allocCap}.`) }}>
          🎫 Jump the queue · 3 🎫
        </button>
      )}
    </div>
  )
}

// The distributor credit line — a single global account (limit scales with net worth). Shows
// the balance / limit / available, a Cash⇄Credit toggle that routes every buy on this tab, and
// pay-down controls. Carrying a balance accrues monthly interest; the minimum auto-pays from
// cash each month, and missing it freezes the line (surfaced here) until you pay it down.
function CreditPanel({ balance, limit, avail, min, frozen, cash, payMode, setPayMode, onPay }) {
  const canUseCredit = !frozen && avail > 0
  const hasBalance = balance > 0.005
  // 🏦 Preferred Account shows its cheaper carry — the panel must quote the real rate.
  const preferred = useGame(s => !!s.upgrades.preferredAccount)
  const ratePct = +( (preferred ? creditMonthlyRate({ preferredAccount: true }) : CREDIT_MONTHLY_RATE) * 100).toFixed(1)
  // A credit mode the line can't back reads as Cash (matches the Shop's onCredit/split gating).
  const active = canUseCredit ? payMode : 'cash'
  const creditTitle = frozen ? 'Frozen — pay your balance down to buy on credit again'
    : avail <= 0 ? 'No credit available yet — your line grows with your net worth (and frees up as you pay down the balance)'
    : `up to ${fmtMoney(avail)} available`
  // Collapsible: the header always shows the load-bearing numbers — balance owed + open credit —
  // so closed still informs; the stats and pay-down buttons live in the body.
  //
  // Closed by DEFAULT now, on desktop too. This panel sat expanded above the shelf and was one of
  // four reference panels the player scrolled past to reach the thing they came to buy — the
  // sealed shelf rendered TWELFTH on this tab. Reference material collapses; the shelf does not.
  //
  // The key is `pv-col-credit2`, not `pv-col-credit`. useOpen persists the player's choice
  // forever, so changing the default alone would have reached nobody who had ever toggled the old
  // panel — including every existing save. A new key is the only way a changed default lands.
  const [openPanel, togglePanel] = useOpen('pv-col-credit2', false)
  return (
    <div className={`credit-panel ${frozen ? 'frozen' : ''}`}>
      <div className="credit-top" role="button" tabIndex={0} aria-expanded={openPanel}
        style={{ cursor: 'pointer', userSelect: 'none' }} onClick={togglePanel}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePanel() } }}>
        <div className="credit-head">💳 Credit line{frozen && <span className="credit-badge">FROZEN</span>}</div>
        <span className="cap">
          {hasBalance ? <><b className="credit-owe">{fmtMoney(balance)}</b> owed · </> : null}
          <b className="credit-avail">{fmtMoney(avail)}</b> open
        </span>
        {/* Paying off the line is the one action worth reaching from the collapsed header — the
            rest (min payment, stats) stays behind the toggle, but "I'm looking at what I owe,
            let me clear it" shouldn't require opening the panel first. stopPropagation keeps the
            tap from also toggling the collapse underneath it. */}
        {hasBalance && (
          <button className="btn small gold" style={{ marginLeft: 'auto' }} disabled={cash <= 0}
            onClick={e => { e.stopPropagation(); onPay(balance) }}>
            {cash + 0.005 < balance ? `Pay ${fmtMoney(cash)}` : `Pay off ${fmtMoney(balance)}`}
          </button>
        )}
        <span className="muted" style={{ marginLeft: hasBalance ? 0 : 'auto' }}>{openPanel ? '▾' : '▸'}</span>
      </div>
      {/* The pay-with toggle stays OUTSIDE the collapse. It is not reference material: it decides
          what every buy button on the shelf below charges, so hiding it behind a closed panel
          would hide the price the player is about to pay. Only the balance detail collapses. */}
      <div className="credit-toggle mt-4" role="group" aria-label="Pay with">
        <button className={`btn ${active === 'cash' ? 'gold' : 'alt'}`} onClick={() => setPayMode('cash')}>💵 Cash</button>
        <button className={`btn ${active === 'split' ? 'gold' : 'alt'}`} disabled={!canUseCredit}
          onClick={() => setPayMode('split')}>🔀 Cash + Credit</button>
        <button className={`btn ${active === 'credit' ? 'gold' : 'alt'}`} disabled={!canUseCredit}
          onClick={() => setPayMode('credit')}>💳 Credit</button>
      </div>
      <div className="cap t-sm mt-1">
        {!canUseCredit ? creditTitle
          : active === 'cash' ? 'Buys come out of cash on hand.'
          : active === 'split' ? `Cash first, the rest on credit (${creditTitle}).`
          : `Buys charge to your credit line (${creditTitle}).`}
      </div>
      {openPanel && (<>
      <div className="credit-stats">
        <span>Balance <b className={hasBalance ? 'credit-owe' : ''}>{fmtMoney(balance)}</b></span>
        <span>Limit <b>{fmtMoney(limit)}</b></span>
        <span>Available <b className="credit-avail">{fmtMoney(avail)}</b></span>
        {hasBalance && <span>Min/mo <b>{fmtMoney(min)}</b></span>}
      </div>
      {hasBalance ? (
        <div className="credit-pay">
          <div className="muted credit-note">~{ratePct}%/mo interest on the balance · the minimum auto-pays from cash each month{frozen ? ' — pay it down to un-freeze the line' : ''}.</div>
          <div className="credit-pay-btns">
            <button className="btn alt" disabled={cash <= 0} onClick={() => onPay(min)}>Pay min {fmtMoney(min)}</button>
            <button className="btn gold" disabled={cash <= 0} onClick={() => onPay(balance)}>
              {cash + 0.005 < balance ? `Pay ${fmtMoney(cash)} (all cash)` : `Pay off ${fmtMoney(balance)}`}
            </button>
          </div>
        </div>
      ) : (
        <div className="muted credit-note">Buy sealed on credit and pay it off monthly — your line grows with your net worth. Carry a balance and it accrues ~{ratePct}%/mo.</div>
      )}
      </>)}
    </div>
  )
}

// 🧮 The Purchasing Agent's reorder-points ledger: one stepper per product TYPE across the
// buyable shop list (incl. the 🎌 import shelf once licensed). The agent tops every set that
// carries the type up to the minimum overnight — see the day tick for the buying rules.
function ReorderPanel() {
  const owned = useGame(s => !!s.upgrades.purchasingAgent)
  const pointsRaw = useGame(s => s.reorderPoints)
  const setReorderPoint = useGame(s => s.setReorderPoint)
  const hasImport = useGame(s => !!s.upgrades.importLicense)
  const types = useMemo(() => {
    const m = new Map() // type -> { icon, sets }
    for (const st of [...SHOP_SETS, ...(hasImport ? JP_SHOP_SETS : [])]) {
      for (const p of setProducts(st)) {
        const cur = m.get(p.type) || { icon: p.icon || '📦', sets: 0 }
        cur.sets++
        m.set(p.type, cur)
      }
    }
    return [...m.entries()].sort((a, b) => b[1].sets - a[1].sets)
  }, [hasImport])
  if (!owned) return null
  const points = pointsRaw || {}
  const nActive = Object.values(points).filter(v => v > 0).length
  return (
    <Collapse id="reorder" className="market-panel mt-5" headClass="market-head" 
      head="🧮 Reorder points" defaultOpen={bigScreen()}
      badge={nActive> 0 ? `${nActive} active` : 'off'}
      hint="— the Purchasing Agent restocks every set to these minimums overnight: cheapest unlocked distributor first at your rapport price, counting stock on hand, at shows, and 🚢 in transit.">
      <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {types.map(([type, info]) => {
          const q = points[type] || 0
          return (
            <span key={type} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: q > 0 ? 1 : 0.65 }}>
              {info.icon} {type} <small className="muted">· {info.sets} set{info.sets > 1 ? 's' : ''}</small>
              <button className="btn alt btn-fixed" style={{ padding: '0 8px' }} disabled={q <= 0}
                onClick={() => setReorderPoint(type, q - 1)} aria-label={`Lower ${type} minimum`}>−</button>
              <b style={{ minWidth: 14, textAlign: 'center' }}>{q}</b>
              <button className="btn alt btn-fixed" style={{ padding: '0 8px' }} disabled={q>= 9}
                onClick={() => setReorderPoint(type, q + 1)} aria-label={`Raise ${type} minimum`}>+</button>
            </span>
          )
        })}
      </div>
    </Collapse>
  )
}

// 🚢 Import orders still on the water: what's coming and when it lands. Rendered on the
// Buy tab whenever anything is in transit, whichever distributor shelf is selected.
function ImportsInTransit() {
  const imports = useGame(s => s.imports)
  const currentDay = useGame(s => s.currentDay)
  const monthsElapsed = useGame(s => s.monthsElapsed)
  if (!imports?.length) return null
  const absNow = absoluteDay(currentDay, monthsElapsed)
  return (
    <div className="banner" style={{ marginTop: 12, borderColor: '#ff5e6c66' }}>
      🚢 <b>On the water</b> — {imports.map((sh, i) => {
        const d = Math.max(0, (sh.arrivesDay ?? 0) - absNow)
        const nm = setById(sh.setId)?.name || 'JP'
        return (
          <span key={sh.id || i}>
            {i > 0 && ' · '}
            {sh.qty}× {sh.type} <span className="muted">({nm})</span> — <b>{d <= 0 ? 'lands today' : `${d} day${d > 1 ? 's' : ''} out`}</b>
          </span>
        )
      })}
    </div>
  )
}

// A distributor that won't open a wholesale account with you yet. Two flavors: the big
// wholesaler wants NOTORIETY (a bar you climb), the import channel wants the ⛩️ Import
// License UPGRADE (a purchase). Shown in place of their shelves so each reads as a goal.

// What a sealed product actually is, in one line. The playtest's complaint was that the Buy
// tab lists a dozen product types and never says how any of them differ — "Booster Pack" and
// "Sleeved Pack" cost different money for what looks like the same thing.

// A new build is downloaded and waiting. Shown rather than applied: yanking the page out
// from under a pack rip to install a copy change is worse than being a build behind. One
// tap flushes the save and reloads onto the new version.
function productBlurb(product) {
  const t = String(product?.type || '')
  const packs = product?.packs || 1
  const base = /sleeved/i.test(t)
    ? 'The same booster pack in a sealed foil sleeve — the wrapper can\'t be felt or weighed through it, so retailers hang them where a loose pack would get searched. Same cards, small premium for the protection.'
    : /booster box/i.test(t) ? `A retail box of ${packs} boosters — the cheapest way to buy packs by the pack, and the standard unit for a real break.`
    : /elite trainer/i.test(t) ? `An ETB: ${packs} packs plus sleeves, dice and a storage box${product?.bonus ? ', and a guaranteed promo card' : ''}. Priced for the accessories as much as the packs.`
    : /blister/i.test(t) ? `A hanging retail blister — ${packs} pack${packs > 1 ? 's' : ''}${product?.bonus ? ' with a guaranteed promo' : ''}.`
    : /tin/i.test(t) ? `A collector's tin — ${packs} packs${product?.bonus ? ' and a promo' : ''} in reusable packaging.`
    : /bundle/i.test(t) ? `A booster bundle — ${packs} packs, no extras, usually the best packs-per-dollar of the small products.`
    : /premium|collection/i.test(t) ? `A premium collection — ${packs} packs built around a chase promo card.`
    : /case/i.test(t) ? `A sealed case${product?.boxes ? ` of ${product.boxes} boxes` : ''} — distributor quantity, at distributor pricing.`
    : /^booster pack$/i.test(t) ? 'A single loose booster — 10 cards. The cheapest way in, and the most -EV per dollar.'
    : `${packs} pack${packs > 1 ? 's' : ''} of sealed product.`
  return base
}

function LockedDistributor({ dist, notoriety, rank = 0 }) {
  // 🏅 Rank-gated account (D&A): the door is the BANKED ladder rank — show the checklist
  // shape (⭐ threshold + any-2-deeds), not just a number to grind.
  const targetRank = dist.minRank != null ? RANKS[dist.minRank] : null
  const deedsHave = useGame(s => targetRank ? deedsDone(s, dist.minRank) : 0)
  if (dist.requiresUpgrade) {
    const u = UPGRADES[dist.requiresUpgrade]
    return (
      <div className="distrib-banner" style={{ marginTop: 14, borderColor: dist.color + '66', textAlign: 'center' }}>
        <div style={{ fontSize: 30, marginBottom: 6 }}>{u?.icon || '🔒'}</div>
        <div className="t-lg" style={{ fontWeight: 700, color: dist.color }}>{dist.icon} {dist.name} needs the {u?.name || 'right paperwork'}</div>
        <p className="cap t-sm" style={{ margin: '8px auto 0', maxWidth: 440 }}>
          Importing means customs, freight, and a wholesale account overseas — buy the
          <b> {u?.icon} {u?.name}</b> {u ? <>({fmtMoney(u.cost)}) </> : ''}in <b>⚙️ → Upgrades</b> and this shelf opens for good.
        </p>
      </div>
    )
  }
  const need = dist.minNotoriety || 0
  const pct = Math.min(100, Math.round(((notoriety || 0) / need) * 100))
  return (
    <div className="distrib-banner" style={{ marginTop: 14, borderColor: dist.color + '66', textAlign: 'center' }}>
      <div style={{ fontSize: 30, marginBottom: 6 }}>🔒</div>
      <div className="t-lg" style={{ fontWeight: 700, color: dist.color }}>{dist.icon} {dist.name} isn't taking accounts your size yet</div>
      <p className="cap t-sm" style={{ margin: '8px auto 12px', maxWidth: 440 }}>
        {targetRank
          ? <>A hobby giant this size wants a résumé, not just a number: become a <b>{targetRank.emoji} {targetRank.name}</b> — reach <b>⭐ {targetRank.min}</b> and prove yourself ({DEEDS_NEEDED} of: {targetRank.deeds.map(d => d.label.toLowerCase()).join(' · ')}) — and they'll come to the table.</>
          : <>A hobby giant this size only opens a wholesale account with an established name. Build your
            <b> reputation</b> — run shows, fill wants, move product — and they'll come to the table.</>}
      </p>
      <div className="distrib-bar" style={{ maxWidth: 320, margin: '0 auto' }}>
        <div style={{ width: pct + '%', background: dist.color }} />
      </div>
      <div className="cap mt-3">
        <b style={{ color: dist.color }}>{Math.round(notoriety || 0)}</b> / {need} reputation
        {targetRank && <> · deeds <b style={{ color: dist.color }}>{Math.min(deedsHave, DEEDS_NEEDED)}</b> / {DEEDS_NEEDED}</>}
        {rank >= (dist.minRank ?? 99) && ' · rank met!'}
      </div>
    </div>
  )
}

// Pick which distributor you're buying from. Each chip shows their icon, name, and your
// rapport (filled stars), tinted with their brand colour.
function DistributorPicker({ distributorState, notoriety, upgrades, rank = 0, selected, onSelect, vintageDists }) {
  return (
    <div className="distrib-picker">
      {DISTRIBUTORS.map(d => {
        const rec = distributorState[d.id] || { spend: 0 }
        const level = rapportLevel(rec.spend).level
        const max = RAPPORT_LEVELS.length - 1
        const locked = !distributorUnlocked(d, notoriety, upgrades, rank)
        const needsUpgrade = locked && d.requiresUpgrade
        const rankGate = locked && !needsUpgrade && d.minRank != null ? RANKS[d.minRank] : null
        const hasVintage = !locked && vintageDists?.has(d.id)
        return (
          <button key={d.id} className={`distrib-chip ${selected === d.id ? 'active' : ''} ${locked ? 'locked' : ''}`}
            style={{ '--dc': d.color }} onClick={() => onSelect(d.id)}
>
            {hasVintage && <span className="dc-vintage" aria-label="Vintage in stock this week">🗝️</span>}
            <span className="dc-icon">{d.icon}</span>
            <span className="dc-name">{d.name}</span>
            {needsUpgrade
              ? <span className="dc-rep" aria-label={`Locked — needs the ${UPGRADES[d.requiresUpgrade]?.name} upgrade`}>🔒 {UPGRADES[d.requiresUpgrade]?.icon || '⛩️'}</span>
              : rankGate
              ? <span className="dc-rep" aria-label={`Locked — ${rankGate.name} rank needed`}>🔒 {rankGate.emoji}</span>
              : locked
              ? <span className="dc-rep" aria-label={`Locked — ${d.minNotoriety} reputation needed`}>🔒 {d.minNotoriety}</span>
              : <span className="dc-rep" aria-label={`${level} of ${max} rapport`}>{'★'.repeat(level)}{'☆'.repeat(max - level)}</span>}
          </button>
        )
      })}
    </div>
  )
}

// Your relationship with the selected distributor: current standing, the discount it
// earns, what perks it unlocks, and progress toward the next rung.
function RapportBanner({ dist, rec, lvl }) {
  const next = nextRapport(rec.spend)
  const disc = distributorDiscount(dist, lvl.level)
  const nextDisc = next ? distributorDiscount(dist, next.level) : disc
  const pct = next ? Math.min(100, Math.round(((rec.spend - lvl.min) / (next.min - lvl.min)) * 100)) : 100
  const levelName = (n) => RAPPORT_LEVELS[n]?.name || ''
  const perks = []
  if (dist.cases) perks.push(lvl.level >= dist.casesMinLevel ? '✓ case lots' : `case lots at ${levelName(dist.casesMinLevel)}`)
  if (dist.supply) perks.push(lvl.level >= dist.supplyMinLevel ? '✓ supply the channel' : `supply the channel at ${levelName(dist.supplyMinLevel)}`)
  if (dist.clearance) perks.push('weekly clearance lots')
  return (
    <div className="distrib-banner" style={{ marginTop: 14, borderColor: dist.color + '66' }}>
      <div className="row" style={{ alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span className="pill t-sm" style={{ background: lvl.color + '22', color: lvl.color }}>🤝 {lvl.name}</span>
        <span className="cap">
          {disc > 0 ? <><b className="pos">{Math.round(disc * 100)}% off</b> their prices</> : 'building rapport unlocks discounts'}
          {perks.length ? ' · ' + perks.join(' · ') : ''}
        </span>
        <span className="cap" style={{ marginLeft: 'auto' }}>Spent with them {fmtMoney(rec.spend)}</span>
      </div>
      {next && (
        <>
          <div className="distrib-bar"><div style={{ width: pct + '%', background: dist.color }} /></div>
          <div className="cap mt-2">
            {fmtMoney(next.min - rec.spend)} more spend → <b style={{ color: next.color }}>{next.name}</b>
            {nextDisc > disc ? ` (${Math.round(nextDisc * 100)}% off` : ' ('}
            {dist.cases && next.level >= dist.casesMinLevel && lvl.level < dist.casesMinLevel ? ', case lots' : ''}
            {dist.supply && next.level >= dist.supplyMinLevel && lvl.level < dist.supplyMinLevel ? ', supply' : ''}
            {', bigger allocation)'}
          </div>
        </>
      )}
    </div>
  )
}

// Group a distributor's catalog into ERAS, preserving the catalog's own set order inside each
// one. The shelf reads Era → Set → Product, which is the shape the product line actually has:
// an Elite Trainer Box belongs to a set, but an Ultra Premium Collection belongs to a whole
// era, and until there was an era level there was nowhere to put one.
function groupByEra(sets) {
  const byEra = new Map()
  for (const s of sets) {
    const key = s.series || 'Other'
    if (!byEra.has(key)) byEra.set(key, { series: key, sets: [] })
    byEra.get(key).sets.push(s)
  }
  // Cross-set product hangs off the era, above its sets.
  for (const era of byEra.values()) {
    era.products = ERA_PRODUCTS.filter(p => p.pool?.series === era.series)
  }
  return [...byEra.values()]
}

// One ERA on the shelf. The FIRST era opens by default; the rest stay collapsed, so the shop is
// still a short scannable list however many eras a vendor carries.
//
// This used to collapse every era, and the reasoning ("the shop opens as a short scannable list")
// was sound when the shelf rendered twelfth on the tab — a short list was a mercy after a
// thousand pixels of panels. The shelf is now the top of the page, and a shop whose every shelf
// is shut shows the player no product at all: they arrive at the Buy tab and have to guess that
// the grey bar is where the boxes live. One era open means the tab always answers "what can I
// buy" without a click.
function DistributorEraCard({ era, dist, lvl, stock, cash, onBuy, clearanceSetId, owned, onCredit, split, creditAvail, weekIndex = 0, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const credit = { onCredit, split, creditAvail }
  // 👑 Collector product is shelf-filtered too. A corner shop has one of these in at a time,
  // not the whole era's back catalogue — see game/shelf.js.
  const eraProducts = shelfEraProducts(dist, era.products, era.series, weekIndex)
  const nProducts = era.sets.reduce((a, s) => a + shelfProducts(dist, setProducts(s), s, weekIndex).length, 0) + eraProducts.length
  return (
    <div className={`product era-acc ${open ? 'open' : ''}`}>
      <button className="set-head era-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="set-head-info">
          <span className="set-head-name">{era.series}</span>
          <span className="meta">
            {era.sets.length} set{era.sets.length !== 1 ? 's' : ''} · {nProducts} product{nProducts !== 1 ? 's' : ''}
            {eraProducts.length ? ` · ${eraProducts.length} collector piece${eraProducts.length !== 1 ? 's' : ''}` : ''}
          </span>
        </span>
        <span className="set-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="era-body">
          {/* Era-wide product first — a UPC isn't a Lost Origin product, it's a Sword & Shield one. */}
          {eraProducts.length > 0 && (
            <div className="era-products">
              <div className="era-products-head">👑 Collector product — rips packs from across the {era.series} era</div>
              {eraProducts.map(p => (
                <EraProductRow key={p.tcgId} dist={dist} product={p} lvl={lvl} cash={cash}
                  onBuy={onBuy} owned={owned} {...credit} />
              ))}
            </div>
          )}
          {era.sets.map(set => (
            <DistributorSetCard key={set.id} dist={dist} set={set} lvl={lvl} stock={stock}
              cash={cash} onBuy={onBuy} clearance={set.id === clearanceSetId} owned={owned}
              onCredit={onCredit} split={split} creditAvail={creditAvail} weekIndex={weekIndex} />
          ))}
        </div>
      )}
    </div>
  )
}

// One cross-set product line. Buys through the ordinary product path — it just resolves its
// own anchor set first, since held sealed is keyed by setId.
function EraProductRow({ dist, product, lvl, cash, onBuy, owned, onCredit, split, creditAvail }) {
  const anchor = eraAnchorSet(product)
  // 🚫 Collector product is exactly what a shop rations, so the sign belongs here most of all.
  // Read through the same store check the shelf rows and both buy paths use.
  const lim = useGame(s => (anchor ? s.purchaseLimitFor(dist.id, anchor, product) : { limit: Infinity, left: Infinity }))
  if (!anchor) return null
  const price = distributorPrice(dist, product.price, lvl.level, { product, set: anchor })
  const afford = cash >= price || (onCredit && creditAvail >= price) || (split && cash + creditAvail >= price)
  const spent = lim.left <= 0
  return (
    <div className="prodrow era-prodrow">
      <span className="prod-name">
        {product.icon} {product.name}
        {lim.limit !== Infinity && (
          <span className={`limit-chip ${spent ? 'spent' : ''}`}>
            🚫 {spent ? 'had yours today' : `${lim.limit}/customer`}
          </span>
        )}
        <span className="cap" style={{ display: 'block' }}>
          {product.packs} pack{product.packs !== 1 ? 's' : ''} from across the {product.pool.series} era
          {product.bonus === 'promo' ? ' · 🎁 promo' : ''}
        </span>
      </span>
      <button className="btn" disabled={!afford || spent}
        onClick={() => onBuy(dist.id, anchor, { ...product, _buyPrice: price, _distId: dist.id }, 1, { onCredit, split })}>
        {fmtMoney(price)}
      </button>
    </div>
  )
}

// One set on a distributor's shelf: its products (priced at your rapport), plus a case
// lot (if they sell cases and you've earned it) and a clearance lot (Greg, weekly).
function DistributorSetCard({ dist, set, lvl, stock, cash, onBuy, clearance, owned, onCredit, split, creditAvail, weekIndex = 0 }) {
  // 🛒 What THIS retailer stocks, not the full manufacturer lineup — a small shop carries
  // boxes, packs and one impulse line, not four artwork variants of the same blister. See
  // game/shelf.js; the shelf is deterministic per (set, week), never per render.
  const products = shelfProducts(dist, setProducts(set), set, weekIndex)
  const showCases = dist.cases && lvl.level >= dist.casesMinLevel
  const lot = showCases ? caseLot(set) : null
  const box = [...products].sort((a, b) => b.packs - a.packs)[0]
  const credit = { onCredit, split, creditAvail }
  // Collapsed by default: the shelf opens as a scannable list of set logos; tap a row to expand
  // its products. Summary on the collapsed row = how many lines and the cheapest one, at rapport.
  const [open, setOpen] = useState(false)
  const count = products.length + (lot ? 1 : 0) + (clearance && box ? 1 : 0)
  const cheapest = products.length ? Math.min(...products.map(p => distributorPrice(dist, p.price, lvl.level, { product: p, set }))) : 0
  return (
    <div className={`product set-acc ${open ? 'open' : ''}`}>
      <button className="set-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        {set.logo ? <img className="logo" src={set.logo} alt={set.name} /> : <span className="set-logo-fallback">📦</span>}
        <span className="set-head-info">
          <span className="set-head-name">{set.name}</span>
          <span className="meta">{set.series} · {count} product{count !== 1 ? 's' : ''}{cheapest ? ` · from ${fmtMoney(cheapest)}` : ''}</span>
        </span>
        <span className="set-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="prodlist">
          {products.map(p => (
            /* keyed on tcgId, not type — a set carries several products per type now */
            <StockButton key={p.tcgId || p.type} dist={dist} set={set} product={p} lvl={lvl} stock={stock} cash={cash} onBuy={onBuy} owned={owned} {...credit} />
          ))}
          {lot && (
            <StockButton dist={dist} set={set} lvl={lvl} stock={stock} cash={cash} onBuy={onBuy} {...credit}
              product={{ ...lot.unit, type: lot.type, icon: lot.icon, packs: lot.packs, bonus: lot.bonus, boxes: lot.boxes, _retail: lot.retail, _case: true }} owned={owned} />
          )}
          {clearance && box && (
            <StockButton dist={dist} set={set} lvl={lvl} stock={stock} cash={cash} onBuy={onBuy} {...credit}
              product={{ ...box, type: `Clearance ${box.type}`, icon: '🏷️', _clearanceOf: box.price, _clearance: true }} owned={owned} />
          )}
        </div>
      )}
    </div>
  )
}

// A single buyable product line with live stock. Prices at your rapport, draws the stock
// bar, and disables itself when sold out (with a restock ETA) or you can't afford it.
// A quantity stepper lets you buy several at once (type "10" → ten ETBs in one purchase),
// capped to what's in stock and what you can afford.
function StockButton({ dist, set, product, lvl, stock, cash, onBuy, owned, onCredit = false, split = false, creditAvail = 0 }) {
  const ownedN = owned?.get(`${set.id}|${productTypeLabel(product)}`) || 0 // sealed copies of this exact line you already hold
  let price
  if (product._case) price = distributorCasePrice(dist, { retail: product._retail }, lvl.level)
  else if (product._clearance) price = round2(distributorPrice(dist, product._clearanceOf, lvl.level, { product, set }) * 0.65)
  else price = distributorPrice(dist, product.price, lvl.level, { product, set })

  const { q: stockQty, cap, out } = stockState(dist, stock, set, product, lvl.level)
  const days = out ? daysToRestock(dist, stockQty, cap) : 0
  // How many you can buy right now: at least 1 if in stock, capped by stock and your spendable
  // funds — cash, your open credit line (pure credit), or cash + credit together (split).
  const spendable = onCredit ? creditAvail : split ? round2(cash + creditAvail) : cash
  const useCredit = onCredit || split // a credit mode is in play (badge/label/opts)
  const affordable = price > 0 ? Math.floor(spendable / price) : 999
  // 🚫 "1 per customer" on the collector product, relaxed for a regular. Read here so the
  // stepper cannot even be pushed past it — a limit you discover at the till is a worse
  // experience than a limit printed on the shelf, which is why real shops print it.
  const rapportLvl = lvl?.level || 0
  const lim = useGame(s => s.purchaseLimitFor(dist.id, set, product))
  const perCustomer = lim.limit
  const limitLeft = lim.left
  const maxBuy = out ? 0 : Math.max(0, Math.min(Math.max(1, Math.floor(stockQty)), affordable, limitLeft))

  const [buyQty, setBuyQty] = useState(1)
  const qN = Math.min(Math.max(1, Math.floor(buyQty) || 1), Math.max(1, maxBuy))
  const clampSet = (v) => setBuyQty(Math.min(Math.max(1, Math.floor(v) || 1), Math.max(1, maxBuy)))
  const canBuy = !out && maxBuy >= 1

  const retail = product._clearance ? product._clearanceOf : product._case ? product._retail : product.price
  const showStrike = price < (retail || 0) - 0.005
  const total = round2(price * qN)
  // 🔥 Fresh-drop hype: the struck-through number above is the market price; this explains
  // why the ask sits over it. (There's no MSRP shelf — a shop owner buys drops scalped.)
  const surge = hypeSurge(set)
  // …but never claim a MARKUP on a row that is already showing a DISCOUNT. A clearance box
  // struck through $373.91, asked $247.42, and still wore a "🔥 +45%" badge — two opposite
  // claims about one price, with the tooltip citing the struck-through figure as "the market"
  // it was 45% above. The surge note only means anything when the ask sits ABOVE that figure,
  // which is exactly when showStrike is false (clearance and case lots both sit below it).
  const priceNote = surge > 1.02 && !showStrike
    ? `🔥 Fresh-drop markup: +${Math.round((surge - 1) * 100)}% over the ${fmtMoney(retail)} market. It's worth market the moment you own it — patience is the discount.`
    : null

  // 📋 Standing order (upgrade): subscribe ONE regular product line to a weekly auto-ship.
  const hasSO = useGame(s => !!s.upgrades.standingOrder)
  const so = useGame(s => s.standingOrder)
  const setSO = useGame(s => s.setStandingOrder)
  const soHere = !!(so && so.distId === dist.id && so.setId === set.id && so.type === product.type)
  const soEligible = hasSO && !product._case && !product._clearance

  return (
    <div className="prodrow">
      <div className="qty-ctl" aria-label="quantity">
        <button type="button" className="qty-step" disabled={!canBuy || qN <= 1} onClick={() => clampSet(qN - 1)} aria-label="fewer">−</button>
        <input type="number" min="1" max={Math.max(1, maxBuy)} value={qN} disabled={!canBuy}
          onChange={e => clampSet(Number(e.target.value))} onFocus={e => e.target.select()} aria-label="quantity" />
        <button type="button" className="qty-step" disabled={!canBuy || qN >= maxBuy} onClick={() => clampSet(qN + 1)} aria-label="more">+</button>
      </div>
      {soEligible && (
        <button type="button" className={`qty-step so-btn ${soHere ? 'active' : ''}`}
          aria-label={soHere ? 'Cancel the standing order' : 'Set a weekly standing order'}
          onClick={() => {
            if (soHere) { setSO(null); toast('📋 Standing order cancelled.') }
            else {
              setSO({ distId: dist.id, setId: set.id, type: product.type, qty: qN })
              toast(`📋 Standing order — ${qN}× ${productTypeLabel(product)} weekly at your rapport price (one product at a time).`, 4500)
            }
          }}>📋</button>
      )}
      <button className={`prodbtn ${product._case ? 'caselot' : ''} ${product._clearance ? 'clearance' : ''} ${out ? 'out' : ''} ${useCredit && canBuy ? 'on-credit' : ''}`}
        disabled={!canBuy}
        onClick={() => onBuy(dist.id, set, { ...product, _buyPrice: price, _distId: dist.id }, qN, { onCredit, split })}
>
        <span className="prodname">{useCredit ? '💳 ' : ''}{product.icon} {productTypeLabel(product)}</span>
        {ownedN > 0 && <span className="prodowned" aria-label={`${ownedN} already in your inventory`}>📦 {ownedN}</span>}
        <span className="prodmeta">{product.packs} pk{product.bonus ? ' +🎁' : ''}{product._case && product.boxes ? ` · ${product.boxes} boxes` : ''}
          {perCustomer !== Infinity && (
            <span className={`limit-chip ${limitLeft <= 0 ? 'spent' : ''}`}
>
              🚫 {limitLeft <= 0 ? 'had yours today' : `${perCustomer}/customer`}
            </span>
          )}
        </span>
        <span className="prodprice">
          {surge > 1.02 && <span className="pricetag surge">🔥 +{Math.round((surge - 1) * 100)}%</span>}
          {showStrike && <s className="retail">{fmtMoney(retail)}</s>}{qN > 1 ? `${fmtMoney(total)} · ×${qN}` : fmtMoney(price)}
        </span>
        <StockBar qty={stockQty} cap={cap} out={out} days={days} color={dist.color} />
      </button>
    </div>
  )
}

// Thin per-product stock gauge: fill proportional to qty/cap, red + ETA when sold out.
function StockBar({ qty, cap, out, days, color }) {
  const pct = Math.max(0, Math.min(100, Math.round((qty / cap) * 100)))
  return (
    <span className="stockbar">
      <span className="stockbar-track"><span className="stockbar-fill" style={{ width: pct + '%', background: out ? 'var(--red)' : color }} /></span>
      <span className="stockbar-label" style={out ? { color: 'var(--red)' } : null}>
        {out ? `OUT · restocks ~${days}d` : `${Math.floor(qty)} / ${cap} in stock`}
      </span>
    </span>
  )
}

// Vintage sealed no longer lives at a dedicated Vault — it turns up RANDOMLY on each vendor's
// shelf some weeks (check them regularly), and high-rapport vendors RESERVE a piece for you.
// This panel shows the selected distributor's current vintage: a reserved HOLD (a rapport
// perk that persists until you grab it) and/or a rotating weekly FIND. Re-prices as the market
// drifts (the parent Shop already subscribes to marketMults).
function VintageShelf({ dist, rec, weekIndex, cash, onBuyVintage, onCredit = false, split = false, creditAvail = 0 }) {
  if (!VINTAGE_SETS.length) return null
  const hold = rec?.hold || null
  const hasScout = useGame(s => !!s.upgrades.vintageScout) // 🕵️ scout turns up finds more often
  const find = useMemo(() => distributorVintageFind(dist, weekIndex, hasScout ? 1.5 : 1), [dist, weekIndex, hasScout])
  // The find is FINITE — a pack or two the vendor turned up, not a case they can reorder.
  // Once you've taken them the shelf is bare until next week rotates in a new find.
  const left = useGame(s => vintageLeft(s, dist.id, find?.setId))
  const cleanedOut = !!find && left < 1
  // 🎌 The import channel deals new JP product only — no vintage shelf, not even the "check
  // back" tease. (After the hooks: `dist` swaps per selected chip, and an early return above
  // them would change the hook count between renders.)
  if (dist.japanese) return null
  if (!hold && !find) {
    return (
      <div className="market-panel vintage-vault" style={{ marginTop: 18, opacity: 0.8 }}>
        {/* The empty state says the one thing that matters — nothing here this week — and puts
            the "how the back room works" copy behind the ?. */}
        <div className="market-head">🗝️ Back room <span className="muted">— nothing old on {dist.name}'s shelf this week.</span>
          {' '}
          <Explain label="How the back room works">
            Vintage and out-of-print sealed turn up here at random (check back), and always at
            shows. Build rapport and they'll hold pieces for you.
          </Explain>
        </div>
      </div>
    )
  }
  // `held` = the rapport hold (a separate one-off piece set aside for you, always exactly 1).
  // `n` = how many of the weekly find remain; a bare shelf renders the card greyed and dead.
  const Card = ({ f, held, n }) => {
    const p = sealedValue({ product: f.product, setId: f.setId })
    const up = p >= (f.product.price || 0)
    const out = !held && n < 1
    // Vintage sealed can be bought on credit too — gate affordability on the open credit
    // line (pure credit), cash + credit (split), or cash (matches the modern StockButton path).
    const spendable = onCredit ? creditAvail : split ? round2(cash + creditAvail) : cash
    const broke = spendable < f.price
    const useCredit = (onCredit || split) && !out && !broke
    return (
      <div className={`product ${held ? 'vintage-held' : ''}`} style={out ? { opacity: 0.55 } : undefined} key={(held ? 'h' : 'f') + f.setId}>
        {f.logo && <img className="logo" src={f.logo} alt={f.setName} />}
        <h3>{f.setName}</h3>
        <div className="meta">
          {held ? '🗝️ Reserved for you' : f.aftermarket ? '🕰️ Out-of-print find' : '🗝️ Vintage find'} · sealed {productTypeLabel(f.product)}
          {!held && (out
            ? <> · <b className="neg">cleaned out</b></>
            : <> · <b>{n} left</b></>)}
        </div>
        <div className="prodlist">
          <button className={`prodbtn ${useCredit ? 'on-credit' : ''}`} disabled={out || broke}
            onClick={() => onBuyVintage(dist.id, f, { fromHold: held, onCredit, split })}
>
            <span className="prodname">{useCredit ? '💳 ' : ''}{f.product.icon || '📦'} {productTypeLabel(f.product)}</span>
            <span className="prodmeta" style={{ color: up ? 'var(--green)' : 'var(--red)' }}>{up ? '▲' : '▼'} mkt {fmtMoney(p)} {held ? '· held' : ''}</span>
            <span className="prodprice">{out ? '—' : fmtMoney(f.price)}</span>
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="market-panel vintage-vault mt-6">
      <div className="market-head">🗝️ Vintage on {dist.name}'s shelf <span className="muted">— old sealed, buy &amp; hold (vintage appreciates) or rip it. It's out of print: what they turn up is all there is, and it rotates weekly. Rapport gets pieces reserved for you.</span></div>
      <div className="grid shop-grid mt-5">
        {hold && <Card f={hold} held n={1} />}
        {find && <Card f={find} n={left} />}
      </div>
      {cleanedOut && (
        <p className="cap mt-4">
          You've cleared {dist.name} out of {find.setName}. Vintage is out of print — check back next week for a fresh find, or hunt the show floor.
        </p>
      )}
    </div>
  )
}

// Supply Vendors: wholesale sealed product into the channel for passive income. Unlocked
// once you hit Trusted+ rapport with Pro Hobby (you buy in at their wholesale price).
function SupplyPanel({ dist, lvl, supplyVendors, supplyChannel, cash, flash }) {
  const [setId, setSetId] = useState(SHOP_SETS[0].id)
  const set = SHOP_SETS.find(s => s.id === setId) || SHOP_SETS[0]
  const products = setProducts(set)
  const [type, setType] = useState(() => products.find(p => p.packs >= 10)?.type || products[0].type)
  const product = products.find(p => p.type === type) || products[0]
  const cost = distributorPrice(dist, product.price, lvl.level, { product, set })
  const pending = supplyChannel.reduce((a, w) => a + w.net, 0)

  function place() {
    if (cash < cost) return flash('Not enough cash to buy in.')
    const r = supplyVendors(set, product)
    if (r) flash(`Wholesaled ${productTypeLabel(product)} of ${set.name} — nets ${fmtMoney(r.net)} in ~${r.daysLeft}d.`)
  }
  return (
    <div className="market-panel mt-6">
      <div className="market-head">📦 Supply other vendors <span className="muted">— buy in at {dist.name}'s wholesale, sell through the channel for passive income over a few days</span></div>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
        <select value={setId} onChange={e => { const id = e.target.value; setSetId(id); const ps = setProducts(SHOP_SETS.find(s=>s.id===id)); setType(ps.find(p=>p.packs>=10)?.type || ps[0].type) }}>
          {groupByEra(SHOP_SETS).map(era => (
            <optgroup key={era.series} label={era.series}>
              {era.sets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </optgroup>
          ))}
        </select>
        {/* This picks a product TYPE, and a set now carries several products per type (eight
            Prismatic mini tins). List each type once — the cheapest of that type is what
            `product` above resolves to, matching how the wholesale price is quoted. */}
        <select value={type} onChange={e => setType(e.target.value)}>
          {[...new Map(products.map(p => [p.type, p])).values()]
            .map(p => <option key={p.type} value={p.type}>{p.icon} {p.type}</option>)}
        </select>
        <span className="cap">buy-in {fmtMoney(cost)}</span>
        <button className="btn gold btn-fixed" style={{ maxWidth: 200, marginLeft:'auto' }} disabled={cash < cost} onClick={place}>
          Wholesale it → channel
        </button>
      </div>
      {supplyChannel.length > 0 && (
        <div className="consign-strip mt-5">
          <b>📦 In the channel ({supplyChannel.length})</b>
          {supplyChannel.map((w, i) => (
            <span key={i} className="pill">{w.label} · {fmtMoney(w.net)} · {w.daysLeft}d</span>
          ))}
          <span className="cap">— {fmtMoney(pending)} incoming</span>
        </div>
      )}
    </div>
  )
}

