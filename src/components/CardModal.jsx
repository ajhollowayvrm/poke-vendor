import { useState, useEffect, useMemo } from 'react'
import { cardValue, rawValue, psaValueAt, valueHistory, setIdOfCard, GRADING, gradingFee, graderTier, nextGraderTier, CONDITIONS, fmtMoney, cutEstimate, cardVariant, MASTERSET_VARIANTS, gradePrediction, round2 } from '../game/engine'
import { useGame } from '../game/store'
import { STORE_SALE_PREMIUM } from '../game/shows'
import { rarityColor, gradeLabel } from './CardTile'
import HoloCard from './HoloCard'
import PriceChart from './PriceChart'

// The card page. Owned cards get the full action set (everything the bulk-select bar
// offers). `inspect` renders it read-only for a card you DON'T own — a vendor's booth
// single at a show — so you can study the PSA-if-graded values, the cut/centering read,
// and the price history before paying their ask (`ask` shows their price vs market).
export default function CardModal({ card, onClose, inspect = false, ask = null }) {
  const hasLoupe = useGame(s => !!s.upgrades.loupe)
  const hasScope = useGame(s => !!s.upgrades.gradescope)
  const quickSell = useGame(s => s.quickSell)
  const quickSellRate = useGame(s => s.quickSellRate)
  const consign = useGame(s => s.consignCard)
  const listOnSite = useGame(s => s.listOnSite)
  const listingQuote = useGame(s => s.listingQuote)
  const submitGrade = useGame(s => s.submitGrade)
  const addToBinder = useGame(s => s.addToBinder)
  const removeFromBinder = useGame(s => s.removeFromBinder)
  const stockShop = useGame(s => s.stockShop)
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
  // Per-set market history drives this card's price-history chart (it re-renders as the
  // market drifts each game-day). The chart needs the set's recent multiplier samples.
  const marketHistory = useGame(s => s.marketHistory)
  const hasStore = useGame(s => !!s.upgrades.storefront)
  const [listing, setListing] = useState(false) // showing the list-on-site picker?
  const [askPct, setAskPct] = useState(90)
  // With a storefront, default to listing EVERYWHERE (online + your store case) —
  // in-person sales skip the fees + shipping and earn the walk-in premium.
  const [everywhere, setEverywhere] = useState(true)
  const askMult = (parseFloat(askPct) || 0) / 100
  // close on Escape — clicking the backdrop already closes; this adds keyboard parity
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  if (!card) return null
  const g = card.grade
  const tier = graderTier(submitted)
  const next = nextGraderTier(submitted)
  const market = cardValue(card)
  const quote = listingQuote(card, askMult)
  // This card's value reprojected across the set's recent market window (raw or graded).
  const priceSeries = valueHistory(card, marketHistory?.[setIdOfCard(card)])
  // Grading Scope prediction: Monte-Carlo the real grade roll (honours cut/condition/loupe)
  // to show a likely grade range before you pay. Only computed for raw cards when owned.
  const prediction = useMemo(
    () => (hasScope && card && !card.grade) ? gradePrediction(card, hasLoupe ? 0.08 : 0) : null,
    [hasScope, hasLoupe, card])

  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal modal-detail" onClick={e => e.stopPropagation()}>
        <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
        <div className="detailflex">
          <HoloCard card={card} maxTilt={18} className="modal-holo"
            extraStyle={{ '--rarity': card.foil ? card.foil.color : card._grail ? '#7cf0ff' : rarityColor(card.rarity) }}>
            {g ? (
              <div className={`cardtile slab grade-${g.overall} ${g.overall >= 10 ? 'slab-gem' : ''}`}>
                <div className="slab-shine" aria-hidden="true" />
                <div className="slab-label">
                  <div className="slab-brand">PSA</div>
                  <div className="slab-grade"><b>{g.overall}</b><span>{gradeLabel(g.overall)}</span></div>
                  <div className="slab-cert">{card.name}</div>
                </div>
                <div className="slab-window"><img src={card.imgLarge || card.img} alt={card.name} decoding="async" fetchpriority="high" /></div>
              </div>
            ) : (
              <img src={card.imgLarge || card.img} alt={card.name} decoding="async" fetchpriority="high" />
            )}
          </HoloCard>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h2>{card.name}</h2>
            <p className="muted" style={{ margin: '2px 0 10px' }}>
              <span style={{ color: rarityColor(card.rarity), fontWeight: 800 }}>{card.rarity}</span>
              {card.foil ? ` · ${card.foil.label}` : card.reverse ? ' · Reverse Holo' : ''} · #{card.number}
              {!g && card.condition && CONDITIONS[card.condition] && (
                <> · <span style={{ color: CONDITIONS[card.condition].color, fontWeight: 800 }}>{CONDITIONS[card.condition].label}</span></>
              )}
            </p>

            {g ? (
              <>
                {/* Intentionally light: this mimics a real white PSA grade label, reinforcing
                    the slab look beside the encased card — not theme drift. Leave as-is. */}
                <div className="banner" style={{background:'#fff', color:'#111', borderColor:'#ddd', textAlign:'center'}}>
                  <b style={{fontSize:28}}>PSA {g.overall}</b>{' '}
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
                <p style={{fontSize:15}}>Graded value: <b style={{color:'var(--green)'}}>${cardValue(card).toFixed(2)}</b>
                  <span className="muted"> (raw ${rawValue(card).toFixed(2)})</span></p>
                {card.gradeHistory?.length > 0 && (
                  <div className="grade-history">
                    <div className="muted" style={{ fontSize: 11, textTransform:'uppercase', letterSpacing:'.5px', fontWeight:700 }}>Grading history</div>
                    {card.gradeHistory.map((h, i) => (
                      <div key={i} className="muted" style={{ fontSize: 12 }}>
                        • PSA {h.overall} · {GRADING[h.tier]?.name || h.tier}{h.fee != null ? ` · $${h.fee.toFixed(2)} fee` : ''}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <p style={{ fontSize: 15, marginBottom: 4 }}>Market value: <b style={{ color: 'var(--green)' }}>${rawValue(card).toFixed(2)}</b></p>
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
                {(() => {
                  const est = cutEstimate(card, hasLoupe)
                  return (
                    <p style={{ fontSize: 13, margin: '6px 0 0' }}>
                      <span className="pill" style={{ background: est.color + '22', color: est.color, fontSize: 12, padding: '2px 7px', borderRadius: 6, fontWeight: 700 }}>
                        👁️ Cut: {est.label}
                      </span>
                      {hasLoupe && est.detail && (
                        <span className="muted" style={{ fontSize: 12, marginLeft: 7 }}>{est.detail}</span>
                      )}
                      {!hasLoupe && (
                        <span className="muted" style={{ fontSize: 11, marginLeft: 7 }}>Jeweler's Loupe gives a precise read</span>
                      )}
                    </p>
                  )
                })()}
              </>
            )}

            {/* Price history — this card's value across the recent living-market window.
                Shown for raw and graded cards alike (both ride the set's market). */}
            <PriceChart series={priceSeries} />

            {/* Inspect mode: someone else's card (a booth single at a show). No actions —
                just the read: their ask vs market, and everything above (PSA-if-graded
                values, cut estimate, history) to judge whether it's a gem-10 candidate. */}
            {inspect && (
              <div className="banner" style={{ marginTop: 14 }}>
                {ask != null ? (
                  <>🏷️ Their ask: <b>{fmtMoney(ask)}</b> · market {fmtMoney(market)}
                    {ask < market * 0.85 ? <b style={{ color: 'var(--green)' }}> — a real deal</b>
                      : ask > market * 1.2 ? <b style={{ color: '#ff9f43' }}> — over market</b> : ''}
                    <br /></>
                ) : null}
                <span className="muted" style={{ fontSize: 12.5 }}>
                  In the vendor's case — buy, haggle, or trade for it from their table.
                  {!g && ' The cut read + PSA values above are your gem-hunting tools.'}
                </span>
              </div>
            )}

            {!inspect && inBinder && (
              <div className="sell-options" style={{ marginTop: 14 }}>
                <div className="banner" style={{ marginTop: 0 }}>
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

            {!inspect && !inBinder && (!listing ? (
              <div className="sell-options" style={{ marginTop: 14 }}>
                <button className="btn alt sellopt" disabled={slotTaken}
                  title={slotTaken ? 'Your binder already has this variant slotted' : undefined}
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
                <button className="btn alt sellopt" onClick={() => { consign(card.uid); onClose() }}>
                  <b>Consign ↗</b>
                  <small>Hands-off: a service sells it in a few days for a guaranteed ~0.85–0.95× market (18% fee). Reliable, but listing can reach/beat market.</small>
                </button>
                {hasStore && (
                  <button className="btn alt sellopt" onClick={() => { const { sold } = stockShop([card.uid]); if (sold) onClose() }}>
                    <b>🏬 Put on the store shelf</b>
                    <small>Walk-ins buy it in person — +12% premium, no fees. Pull it back anytime from the Shop floor.</small>
                  </button>
                )}
                <button className="btn alt sellopt" onClick={() => toggleLock(card.uid)}>
                  <b>{locked ? '🔓 Unlock' : '🔒 Lock this card'}</b>
                  <small>{locked ? 'Locked — protected from every bulk sell. Tap to unlock.' : 'A hard "never bulk-sell this" guard for keepers.'}</small>
                </button>
              </div>
            ) : (
              <div className="list-picker" style={{ marginTop: 14 }}>
                <div className="row" style={{ justifyContent:'space-between', alignItems:'baseline' }}>
                  <b>List for sale</b>
                  <span className="muted" style={{ fontSize: 12 }}>market {fmtMoney(market)}</span>
                </div>
                {hasStore && (
                  <div className="row" style={{ marginTop: 8, gap: 6 }}>
                    <button className={`btn ${everywhere ? 'gold' : 'alt'}`} style={{ fontSize: 12, padding: '6px 10px' }}
                      title="One card, two channels: it's up on your site AND out in your store case. Whichever finds a buyer first takes it — and an in-person sale skips the fee + shipping and earns the walk-in premium."
                      onClick={() => setEverywhere(true)}>🏬+🌐 Everywhere</button>
                    <button className={`btn ${everywhere ? 'alt' : 'gold'}`} style={{ fontSize: 12, padding: '6px 10px' }}
                      title="Web listing only — walk-ins won't see it."
                      onClick={() => setEverywhere(false)}>🌐 Online only</button>
                  </div>
                )}
                <div className="list-pct-row" style={{ marginTop: 8 }}>
                  <span className="muted" style={{ fontSize: 12 }}>Ask</span>
                  {[80, 90, 100, 110].map(p => (
                    <button key={p} className={`pctbtn ${Math.round(askMult*100) === p ? 'on' : ''}`}
                      onClick={() => setAskPct(p)}>{p}%</button>
                  ))}
                  <input className="pctinput" type="number" min="50" max="300" step="5" value={askPct}
                    onChange={e => setAskPct(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))} />
                  <b style={{ marginLeft: 'auto', textAlign:'right' }}>{fmtMoney(quote.ask)}</b>
                </div>
                <div className="list-quote">
                  <div><span className="muted">Online nets</span><b style={{ color:'var(--green)' }}>{fmtMoney(quote.net)}</b><small className="muted">after 5% fee + {fmtMoney(quote.ship ?? 0)} shipping</small></div>
                  <div><span className="muted">Shoppers/day</span><b>👀 ~{quote.viewsPerDay}</b><small className="muted">more with rep</small></div>
                  <div><span className="muted">Who'll buy</span>
                    <b style={{ color: quote.buyShare > 0.6 ? 'var(--green)' : quote.buyShare > 0.25 ? 'var(--gold)' : 'var(--red)' }}>
                      {Math.round(quote.buyShare*100)}%
                    </b>
                    <small className="muted">{quote.buyShare <= 0 ? 'too pricey — will sit' : quote.buyShare < 0.3 ? 'only casual buyers' : 'of browsing buyers'}</small>
                  </div>
                </div>
                {hasStore && everywhere && (
                  <p className="muted" style={{ fontSize: 11.5, margin: '8px 2px 0' }}>
                    🏬 A walk-in pays ~<b style={{ color:'var(--green)' }}>{fmtMoney(round2(market * (1 + STORE_SALE_PREMIUM)))}</b> across
                    the counter (+{Math.round(STORE_SALE_PREMIUM*100)}% in-person premium, no fee, no shipping) — in-store beats online on the same card.
                  </p>
                )}
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn gold" disabled={!askMult} onClick={() => { listOnSite(card.uid, askMult, { everywhere: hasStore && everywhere }); onClose() }}>
                    {hasStore && everywhere ? 'List everywhere ↗' : 'List it ↗'}
                  </button>
                  <button className="btn alt" style={{ maxWidth: 120 }} onClick={() => setListing(false)}>← Back</button>
                </div>
              </div>
            ))}

            {!inspect && !inBinder && !g && (
              <>
                <div style={{ display:'flex', alignItems:'center', gap: 8, margin: '18px 0 6px' }}>
                  <span className="muted" style={{ fontSize: 13 }}>Submit for PSA-style grading</span>
                  <span className="pill" style={{ color: tier.color, borderColor: tier.color, border: '1px solid' }}>
                    🤝 {tier.name}{tier.discount > 0 ? ` · ${Math.round(tier.discount*100)}% off` : ''}
                  </span>
                </div>
                {hasScope && prediction && (
                  <div className="grade-predict" title="Predicted from this card's cut, condition, and your loupe — a range, not a guarantee.">
                    <span className="gp-icon">🔭</span>
                    <span className="gp-range">Likely <b>PSA {prediction.lo === prediction.hi ? prediction.lo : `${prediction.lo}–${prediction.hi}`}</b></span>
                    <span className="gp-likely">best odds <b>PSA {prediction.likely}</b></span>
                    <span className="gp-gem" style={{ color: prediction.gemChance >= 0.15 ? 'var(--gold)' : 'var(--dim)' }}>
                      💎 10: <b>{Math.round(prediction.gemChance * 100)}%</b>
                    </span>
                    <span className="muted" style={{ fontSize: 11 }}>· 9+: {Math.round(prediction.highChance * 100)}%</span>
                  </div>
                )}
                <div className="row">
                  {Object.entries(GRADING).filter(([, t]) => !t.onSite).map(([key, t]) => {
                    const fee = gradingFee(key, submitted)
                    const discounted = fee < t.fee
                    return (
                      <button key={key} className="btn alt" disabled={cash < fee}
                        onClick={() => { submitGrade(card.uid, key); onClose() }}>
                        {t.name} · ${fee.toFixed(0)}
                        {discounted && <small style={{ textDecoration:'line-through', opacity:.5, marginLeft:4 }}>${t.fee}</small>}
                        <br/><small className="muted">~{t.days}d</small>
                      </button>
                    )
                  })}
                </div>
                {card.condition && CONDITIONS[card.condition] && CONDITIONS[card.condition].maxGrade < 10 && (
                  <p style={{ fontSize: 11.5, marginTop: 6, color: CONDITIONS[card.condition].color }}>
                    ⚠️ {CONDITIONS[card.condition].label} — this card can grade at most PSA {CONDITIONS[card.condition].maxGrade}.
                  </p>
                )}
                {/* Don't let the player burn a fee on a card worth less than grading it.
                    Compare the cheapest (economy) fee against the raw value. */}
                {gradingFee('economy', submitted) >= rawValue(card) && (
                  <p style={{ fontSize: 11.5, marginTop: 6, color: 'var(--red)' }}>
                    ⚠️ Grading costs more than this card is worth (${rawValue(card).toFixed(2)} raw). Even a PSA 10 likely won't clear the fee — not worth grading.
                  </p>
                )}
                <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                  A high grade can multiply value 2–4×; low grades hurt — it's a gamble.
                  {next
                    ? ` Submitted ${submitted} cards · ${next.min - submitted} more to ${next.name} (${Math.round(next.discount*100)}% off).`
                    : ` You're a ${tier.name} client — top grading loyalty.`}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
