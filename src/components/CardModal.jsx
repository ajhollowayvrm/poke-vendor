import { useState, useEffect } from 'react'
import { cardValue, rawValue, GRADING, gradingFee, graderTier, nextGraderTier, CONDITIONS, fmtMoney } from '../game/engine'
import { useGame } from '../game/store'
import { rarityColor, gradeLabel } from './CardTile'
import HoloCard from './HoloCard'

export default function CardModal({ card, onClose }) {
  const quickSell = useGame(s => s.quickSell)
  const quickSellRate = useGame(s => s.quickSellRate)
  const consign = useGame(s => s.consignCard)
  const listOnSite = useGame(s => s.listOnSite)
  const listingQuote = useGame(s => s.listingQuote)
  const submitGrade = useGame(s => s.submitGrade)
  const cash = useGame(s => s.cash)
  const submitted = useGame(s => s.gradesSubmitted)
  const [listing, setListing] = useState(false) // showing the list-on-site picker?
  const [askPct, setAskPct] = useState(110)
  const [tweetIt, setTweetIt] = useState(false)
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

  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
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
                <div className="slab-window"><img src={card.imgLarge || card.img} alt={card.name} /></div>
              </div>
            ) : (
              <img src={card.imgLarge || card.img} alt={card.name} />
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
              <p style={{ fontSize: 15 }}>Market value: <b style={{ color: 'var(--green)' }}>${rawValue(card).toFixed(2)}</b></p>
            )}

            {!listing ? (
              <div className="sell-options" style={{ marginTop: 14 }}>
                <button className="btn alt sellopt" onClick={() => { quickSell(card.uid); onClose() }}>
                  <b>Quick sell · {fmtMoney(market * quickSellRate)}</b>
                  <small>Instant, but only {Math.round(quickSellRate*100)}% of market (TCGplayer-style)</small>
                </button>
                <button className="btn alt sellopt" onClick={() => setListing(true)}>
                  <b>List on your site ↗</b>
                  <small>Set your price — from 80% of market; sells over time (faster with notoriety), 5% fee</small>
                </button>
                <button className="btn alt sellopt" onClick={() => { consign(card.uid); onClose() }}>
                  <b>Consign ↗</b>
                  <small>A service sells it in a few days for a bit above market, minus a 12% fee</small>
                </button>
              </div>
            ) : (
              <div className="list-picker" style={{ marginTop: 14 }}>
                <div className="row" style={{ justifyContent:'space-between', alignItems:'baseline' }}>
                  <b>List on your site</b>
                  <span className="muted" style={{ fontSize: 12 }}>market {fmtMoney(market)}</span>
                </div>
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
                <label className="tweet-toggle" style={{ marginTop: 8 }}>
                  <input type="checkbox" checked={tweetIt} onChange={e => setTweetIt(e.target.checked)} />
                  🐦 Tweet it <span className="muted">— extra Twitter-mutual eyes for ~3 days, +notoriety</span>
                </label>
                <div className="list-quote">
                  <div><span className="muted">You net</span><b style={{ color:'var(--green)' }}>{fmtMoney(quote.net)}</b><small className="muted">after 5% fee</small></div>
                  <div><span className="muted">Shoppers/day</span><b>👀 ~{quote.viewsPerDay}</b><small className="muted">more with rep</small></div>
                  <div><span className="muted">Who'll buy</span>
                    <b style={{ color: quote.buyShare > 0.6 ? 'var(--green)' : quote.buyShare > 0.25 ? 'var(--gold)' : 'var(--red)' }}>
                      {Math.round(quote.buyShare*100)}%
                    </b>
                    <small className="muted">{quote.buyShare <= 0 ? 'too pricey — will sit' : quote.buyShare < 0.3 ? 'only casual buyers' : 'of browsing buyers'}</small>
                  </div>
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn gold" disabled={!askMult} onClick={() => { listOnSite(card.uid, askMult, tweetIt); onClose() }}>List it{tweetIt ? ' + 🐦' : ''} ↗</button>
                  <button className="btn alt" style={{ maxWidth: 120 }} onClick={() => setListing(false)}>← Back</button>
                </div>
              </div>
            )}

            {!g && (
              <>
                <div style={{ display:'flex', alignItems:'center', gap: 8, margin: '18px 0 6px' }}>
                  <span className="muted" style={{ fontSize: 13 }}>Submit for PSA-style grading</span>
                  <span className="pill" style={{ color: tier.color, borderColor: tier.color, border: '1px solid' }}>
                    🤝 {tier.name}{tier.discount > 0 ? ` · ${Math.round(tier.discount*100)}% off` : ''}
                  </span>
                </div>
                <div className="row">
                  {Object.entries(GRADING).map(([key, t]) => {
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
