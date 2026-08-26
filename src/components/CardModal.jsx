import { useState, useEffect, useMemo } from 'react'
import { Modal } from '../ui/Modal'
import { AUCTION_LENGTHS, AUCTION_RESERVES } from '../game/auctions'
import { cardValue, rawValue, psaValueAt, valueHistory, setIdOfCard, setNameOfCard, GRADING, GRADING_VALUE_RATE, GRADERS, gradingFee, gradingShipping, gradingDays, premiumTierFor, graderById, overTierValue, slabLabel, isBlackLabel, graderTier, nextGraderTier, CONDITIONS, fmtMoney, cutEstimate, cardVariant, MASTERSET_VARIANTS, gradePrediction, round2, cardPopulation, CRACK_DAMAGE_CHANCE, cardNumber, rarityLabel } from '../game/engine'
import { popTier } from '../game/population'
import { misprintDef } from '../game/misprints'
import HiResImg from './HiResImg'
import { Collapse, bigScreen } from '../ui/Collapse'
import { useGame } from '../game/store'
import { STORE_SALE_PREMIUM } from '../game/shows'
import { rarityColor, gradeLabel } from './CardTile'
import { AskPicker } from '../ui/AskPicker'
import HoloCard from './HoloCard'
import PriceChart from './PriceChart'
import { Explain } from '../ui/Explain'

// 📊 The population report, on any real catalog card. Without the 🔭 Grading Scope you get
// the shape of the census but not the number — the same deal the Scope already offers on the
// grade prediction, so one upgrade buys the whole grading desk rather than two halves.
function PopulationLine({ card, grade, hasScope }) {
  const pop = cardPopulation(card, grade)
  if (!pop) return null
  const t = popTier(pop.count)
  const pct = Math.round((pop.mult - 1) * 100)
  return (
    <p className="t-sm" style={{ margin: '6px 0 0' }}>
      <span className="pill" style={{ background: t.color + '22', color: t.color, fontWeight: 700 }}>
        {t.icon} PSA {grade} pop: {hasScope ? pop.count.toLocaleString() : t.label}
      </span>
      {hasScope && pct !== 0 && (
        <span className="cap" style={{ marginLeft: 7 }}>
          {pct > 0 ? '+' : ''}{pct}% on the comp — {t.blurb}
        </span>
      )}
      {hasScope && pop.mine > 0 && (
        <span className="cap" style={{ marginLeft: 7 }}>
          ({pop.mine} of them yours)
        </span>
      )}
      {!hasScope && (
        <span className="cap" style={{ marginLeft: 7 }}>
          🔭 Grading Scope prints the real census figure
        </span>
      )}
    </p>
  )
}

// 🖨️ A press fault, called out wherever the card is. Raw it realises part of the premium;
// a grader's label realises the rest, which is what the note explains.
function MisprintLine({ card }) {
  const d = misprintDef(card?.misprint)
  if (!d) return null
  return (
    <div className="misprint-box">
      <div className="misprint-head">{d.icon} {d.name}</div>
      <div className="cap">{d.desc}</div>
      <div className="cap mt-2">
        {card.grade
          ? 'The label authenticates the error, so it is worth full error money.'
          : 'Raw, the market discounts an error nobody has authenticated. Grading it unlocks the rest.'}
      </div>
    </div>
  )
}

// The card page. Owned cards get the full action set (everything the bulk-select bar
// offers). `inspect` renders it read-only for a card you DON'T own — a vendor's booth
// single at a show — so you can study the PSA-if-graded values, the cut/centering read,
// and the price history before paying their ask (`ask` shows their price vs market).
// `readOnly` shows the full read — art/slab, market value, PSA-if-graded tiers, cut, price
// history — but hides every action (sell/list/grade/lock/binder). Used to study a card you
// can't act on here, e.g. inspecting a fresh pull mid-rip before it's even in your collection.
export default function CardModal({ card, onClose, inspect = false, ask = null, readOnly = false }) {
  const hasLoupe = useGame(s => !!s.upgrades.loupe)
  const hasScope = useGame(s => !!s.upgrades.gradescope)
  const quickSell = useGame(s => s.quickSell)
  const quickSellRate = useGame(s => s.quickSellRate)
  const crackSlab = useGame(s => s.crackSlab)
  const [crackMsg, setCrackMsg] = useState(null)
  const consign = useGame(s => s.consignCard)
  const listOnSite = useGame(s => s.listOnSite)
  const listingQuote = useGame(s => s.listingQuote)
  const submitGrade = useGame(s => s.submitGrade)
  const listAtAuction = useGame(s => s.listAtAuction)
  const auctionQuote = useGame(s => s.auctionQuote)
  const addToBinder = useGame(s => s.addToBinder)
  const removeFromBinder = useGame(s => s.removeFromBinder)
  const toggleLock = useGame(s => s.toggleLock)
  // Live lock state (the `card` prop is a snapshot — the store is the truth).
  const locked = useGame(s => !!(s.collection || []).find(x => x.uid === card?.uid)?.locked)
  // Is THIS copy slotted in the binder? And if not, is its masterset slot already taken by
  // another copy (so adding it would be a no-op)?
  const inBinder = useGame(s => (s.binder || []).some(c => c.uid === card?.uid))
  const slotTaken = useGame(s => {
    if (!card) return false
    const sid = setIdOfCard(card), variant = cardVariant(card)
    return (s.binder || []).some(b => b.id === card.id && setIdOfCard(b) === sid && cardVariant(b) === variant)
  })
  const cash = useGame(s => s.cash)
  const submitted = useGame(s => s.gradesSubmitted)
  const upgrades = useGame(s => s.upgrades)   // 📦 Shipping Station cuts submission freight
  // Per-set market history drives this card's price-history chart (it re-renders as the
  // market drifts each game-day). The chart needs the set's recent multiplier samples.
  const marketHistory = useGame(s => s.marketHistory)
  const hasStore = useGame(s => !!s.upgrades.storefront)
  // Which grading company this card would go to. PSA is the market's reference holder, so
  // it's the default; the other two trade resale value against fee and turnaround.
  const [company, setCompany] = useState('psa')
  const [listing, setListing] = useState(false) // showing the list-on-site picker?
  const [auctioning, setAuctioning] = useState(false) // showing the auction picker?
  const [aucDays, setAucDays] = useState(5)
  const [aucReserve, setAucReserve] = useState(null)
  const [askPct, setAskPct] = useState(90)
  // With a storefront, default to listing EVERYWHERE (online + your store case) —
  // in-person sales skip the fees + shipping and earn the walk-in premium.
  const [everywhere, setEverywhere] = useState(true)
  const askMult = (parseFloat(askPct) || 0) / 100
  // Grading Scope prediction: Monte-Carlo the real grade roll (honours cut/condition/loupe)
  // to show a likely grade range before you pay. Only computed for raw cards when owned.
  // MUST stay above the `!card` early return — it's a hook, and a hook that only runs on
  // some renders changes the hook count and crashes React (rules of hooks). It already
  // null-guards `card` internally, so it's safe to always call.
  const prediction = useMemo(
    () => (hasScope && card && !card.grade) ? gradePrediction(card, hasLoupe ? 0.08 : 0) : null,
    [hasScope, hasLoupe, card])
  if (!card) return null
  const g = card.grade
  const tier = graderTier(submitted)
  const next = nextGraderTier(submitted)
  const market = cardValue(card)
  const quote = listingQuote(card, askMult)
  // Priced off the LIVE store (reach + hype), so the range moves as your name does.
  const aucQuote = auctionQuote(card, aucDays, aucReserve)
  // This card's value reprojected across the set's recent market window (raw or graded).
  const priceSeries = valueHistory(card, marketHistory?.[setIdOfCard(card)])
  // Grading one card from here IS a submission of one, so it pays the full round-trip freight.
  const ship = gradingShipping([card], upgrades)

  return (
    <Modal onClose={onClose} className="modal-detail" maxWidth={760} label="Card detail">
        <div className="detailflex">
          <HoloCard card={card} maxTilt={18} className="modal-holo"
            extraStyle={{ '--rarity': card.foil ? card.foil.color : card._grail ? '#7cf0ff' : rarityColor(card.rarity) }}>
            {g ? (
              <div className={`cardtile slab grader-${graderById(g.company).key} grade-${g.overall} ${g.overall >= 10 ? 'slab-gem' : ''}`}
                style={{ '--slab-accent': isBlackLabel(g) ? '#1a1a22' : g.overall >= 10 ? '#b8860b' : graderById(g.company).slabColor }}>
                <div className="slab-shine" aria-hidden="true" />
                <div className="slab-label">
                  <div className="slab-brand">{graderById(g.company).name}</div>
                  <div className="slab-grade"><b>{g.overall}</b><span>{gradeLabel(g.overall)}</span></div>
                  <div className="slab-cert">{card.name}</div>
                </div>
                <div className="slab-window"><HiResImg card={card} alt={card.name} decoding="async" fetchpriority="high" /></div>
              </div>
            ) : (
              <HiResImg card={card} alt={card.name} decoding="async" fetchpriority="high" />
            )}
          </HoloCard>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h2>{card.name}</h2>
            <p className="muted" style={{ margin: '2px 0 10px' }}>
              <span style={{ color: rarityColor(card.rarity), fontWeight: 800 }}>{rarityLabel(card.rarity)}</span>
              {card.foil ? ` · ${card.foil.label}` : card.reverse ? ' · Reverse Holo' : ''} · #{cardNumber(card)}{setNameOfCard(card) ? ` · ${setNameOfCard(card)}` : ''}
              {!g && card.condition && CONDITIONS[card.condition] && (
                <> · <span style={{ color: CONDITIONS[card.condition].color, fontWeight: 800 }}>{CONDITIONS[card.condition].label}</span></>
              )}
            </p>

            {g ? (
              <>
                {/* Intentionally light: this mimics a real white PSA grade label, reinforcing
                    the slab look beside the encased card — not theme drift. Leave as-is. */}
                <div className="banner" style={{background:'#fff', color:'#111', borderColor:'#ddd', textAlign:'center'}}>
                  <b style={{fontSize:28}}>{slabLabel(g)}</b>{' '}
                  <span style={{fontWeight:700}}>{gradeLabel(g.overall)}</span>
                </div>
                {/* Real PSA only prints subgrades on 9s and 10s; lower grades get
                    just the overall. Gate the breakdown to match. */}
                {g.overall >= 9 && (
                  <div className="subgrades">
                    {['centering','corners','edges','surface'].map(k => (
                      <div className="sg" key={k}><span>{k[0].toUpperCase()+k.slice(1)}</span><b>{g[k]}</b></div>
                    ))}
                  </div>
                )}
                <p className="t-lg">Graded value: <b className="pos">${cardValue(card).toFixed(2)}</b>
                  <span className="muted"> (raw ${rawValue(card).toFixed(2)})</span></p>
                {/* 📊 The population report. What the census says about this exact card at this
                    exact grade, and what that scarcity is doing to the price. A slab is not one
                    asset — a low-pop 10 and a flooded 10 are different things entirely. */}
                <PopulationLine card={card} grade={g.overall} hasScope={hasScope} />
                {card.gradeHistory?.length > 0 && (
                  <div className="grade-history">
                    <div className="cap" style={{ textTransform:'uppercase', letterSpacing:'.5px', fontWeight:700 }}>Grading history</div>
                    {card.gradeHistory.map((h, i) => (
                      <div key={i} className="cap">
                        • {graderById(h.company).name} {h.overall} · {GRADING[h.tier]?.name || h.tier}{h.fee != null ? ` · $${h.fee.toFixed(2)} fee` : ''}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="t-lg" style={{ marginBottom: 4 }}>Market value: <b className="pos">${rawValue(card).toFixed(2)}</b></p>
                {/* What this card could be worth slabbed, across the grades that actually
                    move on the secondary market — PSA 10/9/8. Condition caps how high it
                    can really grade (a played card can't gem), so grades above the cap are
                    dimmed and flagged as out of reach while still showing the upside. */}
                {(() => {
                  const cap = card.condition && CONDITIONS[card.condition] ? CONDITIONS[card.condition].maxGrade : 10
                  return (
                    <div className="psa-tiers">
                      <div className="psa-tiers-head muted">💎 If it graded…</div>
                      <div className="psa-tier-row">
                        {[10, 9, 8].map(grade => {
                          const reachable = cap >= grade
                          return (
                            <div key={grade} className={`psa-tier${reachable ? '' : ' capped'}`}>
                              <span className="psa-tier-grade">PSA {grade}</span>
                              <b className="psa-tier-val">{fmtMoney(psaValueAt(card, grade))}</b>
                              {!reachable && <span className="psa-tier-note">out of reach</span>}
                            </div>
                          )
                        })}
                      </div>
                      {cap < 10 && (
                        <div className="psa-tier-cap" style={{ color: CONDITIONS[card.condition].color }}>
                          {CONDITIONS[card.condition].label} — this card can grade at most PSA {cap}.
                        </div>
                      )}
                    </div>
                  )
                })()}
                {/* 📊 What the census looks like at the grade this card is chasing. Reading it
                    BEFORE you submit is the point: a flooded PSA 10 is a worse submission than
                    the raw price alone suggests. */}
                <PopulationLine card={card} grade={10} hasScope={hasScope} />
                {(() => {
                  const est = cutEstimate(card, hasLoupe)
                  return (
                    <p className="t-sm" style={{ margin: '6px 0 0' }}>
                      <span className="pill t-xs" style={{ background: est.color + '22', color: est.color, padding: '2px 7px', borderRadius: 6, fontWeight: 700 }}>
                        👁️ Cut: {est.label}
                      </span>
                      {hasLoupe && est.detail && (
                        <span className="cap" style={{ marginLeft: 7 }}>{est.detail}</span>
                      )}
                      {!hasLoupe && (
                        <span className="cap" style={{ marginLeft: 7 }}>Jeweler's Loupe gives a precise read</span>
                      )}
                    </p>
                  )
                })()}
              </>
            )}

            {/* 🖨️ A press fault on this copy — shown for raw and graded alike, because what
                it is worth depends on which of the two it currently is. */}
            <MisprintLine card={card} />

            {/* Price history — this card's value across the recent living-market window.
                Shown for raw and graded cards alike (both ride the set's market). */}
            <PriceChart series={priceSeries} />

            {/* Inspect mode: someone else's card (a booth single at a show). No actions —
                just the read: their ask vs market, and everything above (PSA-if-graded
                values, cut estimate, history) to judge whether it's a gem-10 candidate. */}
            {inspect && (
              <div className="banner mt-6">
                {ask != null ? (
                  <>🏷️ Their ask: <b>{fmtMoney(ask)}</b> · market {fmtMoney(market)}
                    {ask < market * 0.85 ? <b className="pos"> — a real deal</b>
                      : ask > market * 1.2 ? <b style={{ color: '#ff9f43' }}> — over market</b> : ''}
                    <br /></>
                ) : null}
                <span className="cap">
                  In the vendor's case — buy, haggle, or trade for it from their table.
                  {!g && ' The cut read + PSA values above are your gem-hunting tools.'}
                </span>
              </div>
            )}

            {!inspect && !readOnly && inBinder && (
              <div className="sell-options mt-6">
                <div className="banner mt-0">
                  📒 Slotted in your masterset binder as the{' '}
                  <b style={{ color: MASTERSET_VARIANTS[cardVariant(card)]?.color }}>{MASTERSET_VARIANTS[cardVariant(card)]?.label}</b> copy —
                  protected from every bulk action.
                </div>
                <button className="btn alt sellopt" onClick={() => { removeFromBinder(card.uid); onClose() }}>
                  <b>📤 Take out of binder</b>
                  <small>Return it to your collection to sell, list, or grade</small>
                </button>
              </div>
            )}

            {!inspect && !readOnly && !inBinder && ((!listing && !auctioning) ? (
              <div className="sell-options mt-6">
                <button className="btn alt sellopt" disabled={slotTaken}
                  onClick={() => { if (addToBinder(card.uid)) onClose() }}>
                  <b>📒 Add to masterset binder</b>
                  <small>{slotTaken ? 'This variant slot is already filled' : `Slot the ${MASTERSET_VARIANTS[cardVariant(card)]?.label || 'card'} — moves it out of the sellable pool, safe from bulk actions`}</small>
                </button>
                <button className="btn alt sellopt" onClick={() => { quickSell(card.uid); onClose() }}>
                  <b>Quick sell · {fmtMoney(market * quickSellRate)}</b>
                  <small>Instant, but only {Math.round(quickSellRate*100)}% of market (TCGplayer-style)</small>
                </button>
                <button className="btn alt sellopt" onClick={() => setListing(true)}>
                  <b>List for sale ↗{hasStore ? ' 🌐+🏬' : ''}</b>
                  <small>Set your price — sells over time. Online sales pay a 5% fee + shipping{hasStore ? '; list it everywhere and a walk-in can buy it fee-free at a premium instead' : ''}</small>
                </button>
                <button className="btn alt sellopt" onClick={() => setAuctioning(true)}>
                  <b>🔨 Put it up for auction</b>
                  <small>No price, no take-backs — it runs for a few days and whoever turns up sets the number. Your reach is the price: a big room bids past market, an empty one robs you.</small>
                </button>
                <button className="btn alt sellopt" onClick={() => { consign(card.uid); onClose() }}>
                  <b>Consign ↗</b>
                  <small>Hands-off: a service tries to sell it in a few days for ~0.85–0.95× market (18% fee). Usually moves it, but ~1 in 7 come back unsold.</small>
                </button>
                {/* 🔨 CRACK IT OUT. Only for a slab, and only worth doing when you think the
                    grader was harsh. The warning below is the honest one: the grade this card
                    already earned is evidence about the card, so each crack makes the next
                    submission a little less likely to do better. */}
                {g && (
                  <button className="btn alt sellopt" onClick={() => {
                    const r = crackSlab(card.uid)
                    if (r?.error) { setCrackMsg(r.error); return }
                    onClose()
                  }}>
                    <b>🔨 Crack it out of the holder</b>
                    <small>
                      Back to a raw card, free to send again — {fmtMoney(cardValue(card))} of slab becomes {fmtMoney(rawValue({ ...card, grade: null }))} of card.
                      {card.gradeHistory?.length > 1
                        ? ' This card has been graded before, and every opinion makes the next one more predictable — the upside is thin now.'
                        : ' A second opinion can be kinder, but the grade it already earned says something about the card.'}
                      {' '}Roughly {Math.round(CRACK_DAMAGE_CHANCE * 100)}% of cracks nick the card.
                    </small>
                  </button>
                )}
                {crackMsg && <div className="lot-warn">⚠️ {crackMsg}</div>}
                <button className="btn alt sellopt" onClick={() => toggleLock(card.uid)}>
                  <b>{locked ? '🔓 Unlock' : `🔒 ${hasStore ? 'Keep this card' : 'Lock this card'}`}</b>
                  <small>{locked
                    ? `Kept — protected from every bulk sell${hasStore ? ' and off your store floor (walk-ins can\'t buy it)' : ''}. Tap to unlock.`
                    : hasStore
                    ? 'Not for sale: off your store floor and safe from bulk sells. You can still grade, trade, or show it.'
                    : 'A hard "never bulk-sell this" guard for keepers.'}</small>
                </button>
              </div>
            ) : auctioning ? (
              <div className="list-picker mt-6">
                <div className="row" style={{ justifyContent:'space-between', alignItems:'baseline' }}>
                  <b>🔨 Send it to auction</b>
                  <span className="cap">market {fmtMoney(market)}</span>
                </div>
                <div className="row" style={{ marginTop: 8, gap: 6, flexWrap: 'wrap' }}>
                  {AUCTION_LENGTHS.map(l => (
                    <button key={l.days} className={`chip-btn ${aucDays === l.days ? 'active' : ''}`} style={{ flex: '1 1 0' }}
                      onClick={() => setAucDays(l.days)}><b>{l.label}</b><small>{l.blurb}</small></button>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 6, gap: 6, flexWrap: 'wrap' }}>
                  {AUCTION_RESERVES.map(r => (
                    <button key={r.label} className={`chip-btn ${aucReserve === r.mult ? 'active' : ''}`} style={{ flex: '1 1 0' }}
                      onClick={() => setAucReserve(r.mult)}><b>{r.label}</b></button>
                  ))}
                </div>
                <p className="cap" style={{ margin: '6px 2px 0' }}>
                  {AUCTION_RESERVES.find(r => r.mult === aucReserve)?.blurb}
                </p>
                <div className="list-quote mt-4">
                  <div><span className="muted">Expected room</span>
                    <b style={{ color: aucQuote.bidders >= 3 ? 'var(--green)' : aucQuote.bidders >= 2 ? 'var(--gold)' : 'var(--red)' }}>
                      👥 ~{aucQuote.bidders}
                    </b>
                    <small className="muted">{aucQuote.bidders < 2 ? 'thin — your name is the bottleneck' : aucQuote.bidders < 3.5 ? 'a modest crowd' : 'a real bidding war'}</small>
                  </div>
                  <div><span className="muted">Likely nets</span><b className="pos">{fmtMoney(aucQuote.mid)}</b>
                    <small className="muted">{Math.round(aucQuote.midMult * 100)}% of market, after fee + shipping</small></div>
                  <div><span className="muted">Range</span><b>{fmtMoney(aucQuote.lo)} – {fmtMoney(aucQuote.hi)}</b>
                    <small className="muted">a quiet night vs a packed one</small></div>
                </div>
                <p className="cap" style={{ margin: '8px 2px 0' }}>
                  {aucReserve
                    ? `Under ${fmtMoney(aucQuote.reserveAt)} it doesn't sell and the card comes back — you'll have spent the ${aucDays} days for nothing.`
                    : 'No reserve: this WILL sell in ' + aucDays + ' days, at whatever the room decides. There is no pulling it back.'}
                </p>
                <div className="row mt-5">
                  <button className="btn gold" onClick={() => { listAtAuction(card.uid, aucDays, aucReserve); onClose() }}>
                    Start the auction 🔨
                  </button>
                  <button className="btn alt" style={{ maxWidth: 120 }} onClick={() => setAuctioning(false)}>← Back</button>
                </div>
              </div>
            ) : (
              <div className="list-picker mt-6">
                <div className="row" style={{ justifyContent:'space-between', alignItems:'baseline' }}>
                  <b>List for sale</b>
                  <span className="cap">market {fmtMoney(market)}</span>
                </div>
                {hasStore && (
                  <div className="row" style={{ marginTop: 8, gap: 6, alignItems: 'center' }}>
                    <button className={`btn ${everywhere ? 'gold' : 'alt'}`} style={{ fontSize: 'var(--fs-xs)', padding: '6px 10px' }}
                      onClick={() => setEverywhere(true)}>🏬+🌐 Everywhere</button>
                    <button className={`btn ${everywhere ? 'alt' : 'gold'}`} style={{ fontSize: 'var(--fs-xs)', padding: '6px 10px' }}
                      onClick={() => setEverywhere(false)}>🌐 Online only</button>
                    <Explain label="Everywhere vs Online only">
                      Everywhere lists it on your site AND out in your store case — whichever finds a buyer first takes it, and an in-person sale skips the fee + shipping and earns the walk-in premium. Online only is a web listing — walk-ins won't see it.
                    </Explain>
                  </div>
                )}
                <AskPicker pct={askPct} onChange={setAskPct}>
                  <b style={{ marginLeft: 'auto', textAlign:'right' }}>{fmtMoney(quote.ask)}</b>
                </AskPicker>
                <div className="list-quote">
                  <div><span className="muted">Online nets</span><b className="pos">{fmtMoney(quote.net)}</b><small className="muted">after 5% fee + {fmtMoney(quote.ship ?? 0)} shipping</small></div>
                  <div><span className="muted">Shoppers/day</span><b>👀 ~{quote.viewsPerDay}</b><small className="muted">more with rep</small></div>
                  <div><span className="muted">Who'll buy</span>
                    <b style={{ color: quote.buyShare > 0.6 ? 'var(--green)' : quote.buyShare > 0.25 ? 'var(--gold)' : 'var(--red)' }}>
                      {Math.round(quote.buyShare*100)}%
                    </b>
                    <small className="muted">{quote.buyShare <= 0 ? 'too pricey — will sit' : quote.buyShare < 0.3 ? 'only casual buyers' : 'of browsing buyers'}</small>
                  </div>
                </div>
                {hasStore && everywhere && (
                  <p className="cap" style={{ margin: '8px 2px 0' }}>
                    🏬 A walk-in pays ~<b className="pos">{fmtMoney(round2(market * (1 + STORE_SALE_PREMIUM)))}</b> across
                    the counter (+{Math.round(STORE_SALE_PREMIUM*100)}% in-person premium, no fee, no shipping) — in-store beats online on the same card.
                  </p>
                )}
                <div className="row mt-5">
                  <button className="btn gold" disabled={!askMult} onClick={() => { listOnSite(card.uid, askMult, { everywhere: hasStore && everywhere }); onClose() }}>
                    {hasStore && everywhere ? 'List everywhere ↗' : 'List it ↗'}
                  </button>
                  <button className="btn alt" style={{ maxWidth: 120 }} onClick={() => setListing(false)}>← Back</button>
                </div>
              </div>
            ))}

            {/* Grading is a SECOND job for this modal — a whole submission flow (grader choice,
                service tier, fee and postage explainer) stacked under the card's own details
                and its six sell/keep actions. Most opens of this modal are "what is this and
                what do I do with it", not "let me mail it away for six weeks", so it now sits
                behind a disclosure: the card and its actions lead, grading is one tap away. */}
            {!inspect && !readOnly && !inBinder && !g && (
              <Collapse id="gradesubmit" defaultOpen={bigScreen()}
                head={<span style={{ fontWeight: 800 }}>🔬 Submit for grading</span>}
                badge={`🤝 ${tier.name}${tier.discount > 0 ? ` · ${Math.round(tier.discount*100)}% off` : ''}`}
                hint="Mail it to a grader — a high grade can multiply the value, a low one hurts.">
                {/* The decision pair, before anything else: what it fetches raw today vs what
                    the slab would comp at. Fees sit on the tier buttons right below. */}
                <p className="cap t-sm" style={{ margin: '2px 0 6px' }}>
                  Sell raw now: <b>{fmtMoney(rawValue(card))}</b>
                  {prediction && <> · at likely PSA {prediction.likely}: <b className="pos">{fmtMoney(psaValueAt(card, prediction.likely))}</b></>}
                  {' '}· at PSA 10: <b style={{ color: 'var(--gold)' }}>{fmtMoney(psaValueAt(card, 10))}</b>
                </p>
                {hasScope && prediction && (
                  <Explain label="How this prediction is made" trigger={
                    <div className="grade-predict">
                      <span className="gp-icon">🔭</span>
                      <span className="gp-range">Likely <b>PSA {prediction.lo === prediction.hi ? prediction.lo : `${prediction.lo}–${prediction.hi}`}</b></span>
                      <span className="gp-likely">best odds <b>PSA {prediction.likely}</b></span>
                      <span className="gp-gem" style={{ color: prediction.gemChance >= 0.15 ? 'var(--gold)' : 'var(--dim)' }}>
                        💎 10: <b>{Math.round(prediction.gemChance * 100)}%</b>
                      </span>
                      <span className="cap">· 9+: {Math.round(prediction.highChance * 100)}%</span>
                    </div>}>
                    Predicted from this card's cut, condition, and your loupe — a range, not a guarantee.
                  </Explain>
                )}
                {/* WHO grades it, then which service. The company changes the fee, the wait,
                    and what the returned slab sells for — never the odds (see GRADERS). */}
                <div className="grader-pick">
                  {Object.values(GRADERS).map(g => (
                    <button key={g.key} type="button" className={`chip-btn ${company === g.key ? 'active' : ''}`}
                      style={{ flex: '1 1 0', '--rarity': g.color }} onClick={() => setCompany(g.key)}>
                      <b style={{ color: g.color }}>{g.name}</b>
                      <small>{g.slabMult === 1 ? 'benchmark resale' : `${g.slabMult > 1 ? '+' : ''}${Math.round((g.slabMult - 1) * 100)}% resale`}</small>
                    </button>
                  ))}
                </div>
                <p className="cap" style={{ margin: '4px 0 2px' }}>{graderById(company).blurb}</p>
                <div className="row">
                  {Object.entries(GRADING).filter(([, t]) => !t.onSite).map(([key, t]) => {
                    // Freight is charged per submission, and a single card from this modal IS a
                    // submission of one — so it pays the whole round trip. Quote what's charged.
                    const fee = round2(gradingFee(key, submitted, 1, company, rawValue(card)) + ship)
                    const byValue = overTierValue(key, rawValue(card))
                    const discounted = !byValue && fee < t.fee
                    return (
                      <button key={key} className="btn alt" disabled={cash < fee}
                        onClick={() => { submitGrade(card.uid, key, company); onClose() }}>
                        {t.name} · ${fee.toFixed(0)}
                        {discounted && <small style={{ textDecoration:'line-through', opacity:.5, marginLeft:4 }}>${t.fee}</small>}
                        <br/><small className="muted">
                          {byValue ? `${premiumTierFor(rawValue(card)).name} · ~${gradingDays(key, company, rawValue(card))}d`
                            : `~${gradingDays(key, company)}d`}
                        </small>
                        {byValue && <small className="muted">insured to ${t.maxValue.toLocaleString()} · over that, flat fee</small>}
                      </button>
                    )
                  })}
                </div>
                {card.condition && CONDITIONS[card.condition] && CONDITIONS[card.condition].maxGrade < 10 && (
                  <p className="t-xs" style={{ marginTop: 6, color: CONDITIONS[card.condition].color }}>
                    ⚠️ {CONDITIONS[card.condition].label} — this card can grade at most PSA {CONDITIONS[card.condition].maxGrade}.
                  </p>
                )}
                {/* Don't let the player burn a fee on a card worth less than grading it.
                    Compare the cheapest (economy) fee against the raw value. */}
                {round2(gradingFee('economy', submitted, 1, company, rawValue(card)) + ship) >= rawValue(card) && (
                  <p className="t-xs" style={{ marginTop: 6, color: 'var(--red)' }}>
                    ⚠️ Grading costs more than this card is worth (${rawValue(card).toFixed(2)} raw). Even a PSA 10 likely won't clear the fee — not worth grading.
                  </p>
                )}
                <p className="cap mt-4">
                  Prices include <b>{fmtMoney(ship)}</b> insured postage both ways — charged once per
                  submission, so sending a batch from the 🔬 bench spreads it across every card.
                  A high grade can multiply value 2–4×; low grades hurt — it's a gamble.
                  {next
                    ? ` Submitted ${submitted} cards · ${next.min - submitted} more to ${next.name} (${Math.round(next.discount*100)}% off).`
                    : ` You're a ${tier.name} client — top grading loyalty.`}
                </p>
              </Collapse>
            )}
          </div>
        </div>
    </Modal>
  )
}
