import { useMemo, useState } from 'react'
import { useGame } from '../game/store'
import { fmtMoney, cardValue, sealedValue, setById, round2 } from '../game/engine'
import { packValue, packBestItem, packRepLabel, packSaleChance, cardFitsTier, cardMatchesContents,
  tierContentsLabel, PACK_ICONS, PACK_TIER_CAP, PACK_ONLY_OPTS, PACK_GRADE_OPTS, AUTO_BUILD_CAP } from '../game/mysterypacks'
import CardTile from './CardTile'
import { useModalEscape } from '../ui/dialog'

const CHANNEL_DEFS = [
  { key: 'show',   icon: '🎪', label: 'Shows',  hint: 'sells off your booth table when you vend at a show' },
  { key: 'store',  icon: '🏬', label: 'Store',  hint: 'sells to walk-ins across your counter (needs a storefront)' },
  { key: 'online', icon: '🌐', label: 'Online', hint: 'ships as online orders as days pass (5% fee + shipping)' },
  { key: 'stream', icon: '🔴', label: 'Stream', hint: 'viewers order one live and you rip it on camera' },
]

// The public "odds board" for a published line: aggregate every card + sealed item currently
// sealed across its built stock, so the tier card can show buyers the pool (top pieces first).
function lineBoard(stock) {
  const items = []
  for (const p of (stock || [])) {
    for (const c of (p.cards || [])) items.push({ name: c.name, value: cardValue(c) })
    for (const it of (p.sealed || [])) items.push({ name: it.product?.type || 'sealed', value: sealedValue(it) })
  }
  items.sort((a, b) => b.value - a.value)
  return { count: items.length, top: items.slice(0, 3) }
}

// Your repack product line: define pack TIERS (name, price, the value band you ADVERTISE,
// and which channels carry them), then seal exact cards/sealed product inside each pack.
// Buyers pay sight-unseen; what they find moves your pack reputation — and your name.
export default function MysteryPacks() {
  const packTiers = useGame(s => s.packTiers)
  const builtPacks = useGame(s => s.builtPacks)
  const packRep = useGame(s => s.packRep ?? 50)
  const packStreak = useGame(s => s.packStreak || 0) // 🔥 word-of-mouth demand tailwind
  const packStats = useGame(s => s.packStats)
  const notoriety = useGame(s => s.notoriety)
  const collection = useGame(s => s.collection)
  const sealedInventory = useGame(s => s.sealedInventory)
  const hasStore = useGame(s => !!s.upgrades.storefront)
  const wrapPress = useGame(s => !!s.upgrades.wrapPress) // ✨ shown odds must match the real roll
  const certified = useGame(s => !!s.upgrades.certOdds)  // 📋 audited boards pull harder
  const unbuildPack = useGame(s => s.unbuildPack)

  const [editing, setEditing] = useState(null)  // tier being edited, or 'new'
  const [building, setBuilding] = useState(null) // tier a pack is being built for
  const [toast, setToast] = useState(null)
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 3000) }
  useModalEscape(() => { if (building) setBuilding(null); else if (editing) setEditing(null) })
  const autoBuildPacks = useGame(s => s.autoBuildPacks)

  const rep = packRepLabel(packRep)
  const stockByTier = useMemo(() => {
    const m = {}
    for (const p of (builtPacks || [])) (m[p.tierId] = m[p.tierId] || []).push(p)
    return m
  }, [builtPacks])
  // How many loose cards each line could sweep up right now — drives the 🪄 Auto-build count,
  // so you can see there's work to do without opening anything.
  const eligibleByTier = useMemo(() => {
    const m = {}
    for (const t of (packTiers || [])) m[t.id] = collection.filter(c => cardFitsTier(c, t)).length
    return m
  }, [packTiers, collection])

  function autoBuild(tier) {
    const r = autoBuildPacks(tier.id)
    if (!r || !r.built) return flash(`Nothing in your loose cards fits ${tier.icon} ${tier.name} (${tierContentsLabel(tier)}, ${fmtMoney(tier.bandLo)}–${fmtMoney(tier.bandHi)}).`)
    flash(`${tier.icon} Sealed ${r.built} ${tier.name}${r.built === 1 ? '' : 's'} — one card each, ${fmtMoney(r.value)} of stock inside.`
      + (r.skipped ? ` ${r.skipped} more still fit — run it again.` : ''))
  }

  return (
    <>
      <div className="banner mt-6">
        ❓ <b>Your mystery packs.</b> Seal cards & sealed product from your own stock into repacks and sell them
        sight-unseen at YOUR price, on the channels YOU pick. What buyers find inside moves your
        <b> pack reputation</b> — fair packs (and the occasional seeded banger) sell faster and build your name;
        junk at a premium torches both.
        <span className="pill" style={{ marginLeft: 8, background: `${rep.color}22`, color: rep.color }}
          title={`Pack reputation ${Math.round(packRep)}/100 — moved by what buyers find vs what they paid. Drives how fast packs sell.`}>
          {rep.icon} {rep.label} · {Math.round(packRep)}/100
        </span>
        {packStreak > 0 && (
          <span className="pill" style={{ marginLeft: 8, background: '#ff6b0022', color: '#ff9f43' }}
            title={`Word-of-mouth streak: a run of ${packStreak} happy openings is pulling extra buyers (about +${Math.round(Math.min(0.3, packStreak * 0.03) * 100)}% demand). One burned buyer snaps it back to zero.`}>
            🔥 Packs trending · {packStreak}
          </span>
        )}
        {packStats?.sold ? <span className="muted"> · {packStats.sold} sold · {fmtMoney(packStats.revenue || 0)} lifetime{packStats.burned ? ` · ${packStats.burned} burned buyer${packStats.burned > 1 ? 's' : ''}` : ''}</span> : null}
      </div>

      {/* Product lines */}
      <div className="wants">
        <div className="wants-head">🏷️ Your pack lines <span className="muted">— price, advertised value band & channels are all yours to set</span>
          {(packTiers || []).length < PACK_TIER_CAP && (
            <button className="btn alt btn-fixed" style={{ maxWidth: 150, marginLeft: 'auto', padding: '4px 10px' }}
              onClick={() => setEditing('new')}>＋ New pack line</button>
          )}
        </div>
        <div className="grid stagger-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', marginTop: 4 }}>
          {(packTiers || []).map(tier => {
            const stock = stockByTier[tier.id] || []
            const eligible = eligibleByTier[tier.id] || 0
            const chans = CHANNEL_DEFS.filter(c => tier.channels?.[c.key])
            const board = lineBoard(stock)
            const hasChase = !!tier.published && stock.some(p => tier.price && packValue(p) >= tier.price * 2)
            const packOpts = { published: !!tier.published, certified, streak: packStreak, hasChase }
            // A rough "how fast would this move" read for the best enabled channel today.
            const bestChance = Math.max(0, ...chans.filter(c => c.key === 'online' || c.key === 'store')
              .map(c => packSaleChance(tier.price, notoriety, packRep, c.key === 'online' ? 'online' : 'store', false, wrapPress, packOpts)))
            return (
              <div key={tier.id} className="product">
                <h3 className="t-lg" style={{ margin: 0 }}>
                  {tier.icon} {tier.name}
                  {tier.published && <span className="pill t-xs" style={{ marginLeft: 6, background: '#3e63dd22', color: '#8aa6ff' }}
                    title={certified ? 'Odds board is public & certified — buyers trust it and bite more' : 'Odds board is public — draws gamblers; honest thin packs sting less'}>
                    📋 {certified ? 'Certified' : 'Published'}</span>}
                </h3>
                <div className="meta" style={{ flex: 1 }}>
                  Sells at <b className="pos">{fmtMoney(tier.price)}</b> · advertised
                  {' '}<b>{fmtMoney(tier.bandLo)}–{fmtMoney(tier.bandHi)}</b> inside
                  <br />
                  <span className="cap">Takes: {tierContentsLabel(tier)}</span>
                  <br />
                  {/* Name the channels. This was four bare emoji crammed together with no gaps
                      and their meaning only in `title` — which does not exist on a touch
                      device, i.e. on the platform this ships to. */}
                  {chans.length
                    ? <>On: {chans.map((c, i) => <span key={c.key} title={c.hint}>{i ? ' · ' : ''}{c.icon} {c.label}</span>)}
                        {chans.some(c => c.key === 'store') && !hasStore && <span className="muted"> (store needs a storefront)</span>}</>
                    : <span className="neg">No channels enabled — it can't sell</span>}
                  {bestChance > 0 && stock.length > 0 && <><br /><span className="cap">≈{Math.round(bestChance * 100)}%/day it moves at your current rep & fame{tier.published ? ' (published)' : ''}</span></>}
                  {/* 📋 The public odds board — what buyers see across this line's sealed stock. */}
                  {tier.published && board.count > 0 && (
                    <><br /><span className="cap" title="The pool buyers can see — the notable cards currently sealed across this line's packs">
                      📋 Board: {board.count} card{board.count === 1 ? '' : 's'} across {stock.length} pack{stock.length === 1 ? '' : 's'}
                      {board.top.length ? <> · top: {board.top.map(t => `${t.name} (${fmtMoney(t.value)})`).join(', ')}</> : null}
                    </span></>
                  )}
                </div>
                {/* 🪄 Auto-build: seal every loose card that fits this line into its own pack,
                    in one click. The count IS the pitch — "18 fit" tells you the work is there. */}
                <button className="btn gold t-xs" style={{ padding: '6px 8px', marginBottom: 5 }}
                  disabled={!eligible}
                  title={eligible
                    ? `Seal ${Math.min(eligible, AUTO_BUILD_CAP)} pack${eligible === 1 ? '' : 's'} — one card each, every loose ${tierContentsLabel(tier)} worth ${fmtMoney(tier.bandLo)}–${fmtMoney(tier.bandHi)}`
                    : `No loose cards fit this line right now (${tierContentsLabel(tier)}, ${fmtMoney(tier.bandLo)}–${fmtMoney(tier.bandHi)})`}
                  onClick={() => autoBuild(tier)}>
                  🪄 Auto-build{eligible ? ` ${eligible} pack${eligible === 1 ? '' : 's'}` : ' — nothing fits'}
                </button>
                <div className="row" style={{ gap: 5 }}>
                  <button className="btn alt t-xs" style={{ padding: '6px 8px' }}
                    disabled={!collection.length && !(sealedInventory || []).length}
                    onClick={() => setBuilding(tier)}>🛠️ Build one</button>
                  <span className="pill" style={{ alignSelf: 'center' }} title="Sealed and ready to sell">{stock.length} in stock</span>
                  <button className="btn alt t-xs btn-fixed" style={{ maxWidth: 60, padding: '6px 8px' }}
                    onClick={() => setEditing(tier)}>Edit</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Built stock */}
      <div className="wants">
        <div className="wants-head">📦 Sealed & ready <span className="muted">— {(builtPacks || []).length} pack{(builtPacks || []).length === 1 ? '' : 's'} waiting for buyers (you know what's inside; they don't)</span></div>
        {(builtPacks || []).length === 0 ? (
          <div className="empty mt-2">No packs built yet. Hit <b>🛠️ Build one</b> on a line above and pick exactly what goes in. 🎁</div>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', marginTop: 4 }}>
            {(builtPacks || []).map(p => {
              const tier = (packTiers || []).find(t => t.id === p.tierId)
              const v = packValue(p)
              const best = packBestItem(p)
              const ratio = tier?.price ? v / tier.price : 1
              const read = ratio >= 2 ? { t: 'seeded banger 🎉', c: 'var(--gold)' }
                : ratio >= 0.85 ? { t: 'fair pack 🙂', c: 'var(--green)' }
                : ratio >= 0.45 ? { t: 'thin — buyers will shrug 😐', c: '#ff9f43' }
                : { t: 'a ripoff — rep will pay ☠️', c: 'var(--red)' }
              const belowBand = tier && v < tier.bandLo
              return (
                <div key={p.uid} className="product">
                  <h3 className="t-md" style={{ margin: 0 }}>{tier?.icon || '❓'} {tier?.name || 'Mystery Pack'}</h3>
                  <div className="meta" style={{ flex: 1 }}>
                    {(p.cards || []).length} card{(p.cards || []).length === 1 ? '' : 's'}{(p.sealed || []).length ? ` + ${(p.sealed || []).length} sealed` : ''} inside
                    {' '}· worth <b>{fmtMoney(v)}</b> vs {fmtMoney(tier?.price || 0)} price
                    <br /><span style={{ color: read.c }}>{read.t}</span>
                    {belowBand && <span className="neg"> · under the advertised floor!</span>}
                    {best && <><br /><span className="cap">best inside: {best.name} ({fmtMoney(best.value)})</span></>}
                  </div>
                  <button className="btn alt t-xs" style={{ padding: '5px 8px' }}
                    onClick={() => { unbuildPack(p.uid); flash('Tore it open — contents are back in your stock.') }}>↩ Unbuild</button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
      {editing && <TierEditor tier={editing === 'new' ? null : editing}
        stockCount={editing === 'new' ? 0 : (stockByTier[editing.id] || []).length}
        onClose={() => setEditing(null)} flash={flash} />}
      {building && <PackBuilder tier={building} onClose={() => setBuilding(null)} flash={flash} />}
    </>
  )
}

// --- Tier editor ---------------------------------------------------------------
// Create or edit a product line: name, icon, price, the ADVERTISED value band, channels.
function TierEditor({ tier, stockCount, onClose, flash }) {
  const addPackTier = useGame(s => s.addPackTier)
  const updatePackTier = useGame(s => s.updatePackTier)
  const deletePackTier = useGame(s => s.deletePackTier)
  const [name, setName] = useState(tier?.name || 'Mystery Pack')
  const [icon, setIcon] = useState(tier?.icon || '❓')
  const [price, setPrice] = useState(tier?.price ?? 25)
  const [bandLo, setBandLo] = useState(tier?.bandLo ?? 5)
  const [bandHi, setBandHi] = useState(tier?.bandHi ?? 75)
  const [only, setOnly] = useState(tier?.only || 'any')
  const [minGrade, setMinGrade] = useState(tier?.minGrade ?? 0)
  const [published, setPublished] = useState(!!tier?.published)
  const [channels, setChannels] = useState({ show: true, store: true, online: true, stream: true, ...(tier?.channels || {}) })
  const certified = useGame(s => !!s.upgrades.certOdds)
  const collection = useGame(s => s.collection)
  // Live preview: with these settings, how many loose cards would 🪄 Auto-build sweep up?
  // Shown while you're still typing the band, so you can dial it in before you commit.
  const wouldFit = useMemo(() => {
    const draft = { bandLo: +bandLo || 0, bandHi: +bandHi || 0, only, minGrade: +minGrade || 0 }
    return collection.filter(c => cardFitsTier(c, draft)).length
  }, [collection, bandLo, bandHi, only, minGrade])

  function save() {
    const payload = { name, icon, price: +price, bandLo: +bandLo, bandHi: +bandHi, channels, only, minGrade: +minGrade, published }
    if (tier) { updatePackTier(tier.id, payload); flash(`${icon} ${name} updated.`) }
    else {
      const t = addPackTier(payload)
      flash(t ? `${t.icon} ${t.name} is a new pack line.` : 'Could not add that line.')
    }
    onClose()
  }

  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
        <h2 className="t-xl" style={{ marginBottom: 2 }}>{tier ? 'Edit pack line' : 'New pack line'}</h2>
        <p className="cap t-sm mt-0">
          The band is what you <b>advertise</b> is inside — the game won't stop you mislabeling,
          but a pack that opens under its advertised floor is false advertising, and buyers talk.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label className="cap">Name
            <input value={name} maxLength={40} onChange={e => setName(e.target.value)} style={{ width: '100%', marginTop: 3 }} />
          </label>
          <div>
            <span className="cap">Icon</span>
            <div className="row" style={{ gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
              {PACK_ICONS.map(ic => (
                <button key={ic} className={`pctbtn ${icon === ic ? 'on' : ''}`} style={{ fontSize: 16 }} onClick={() => setIcon(ic)}>{ic}</button>
              ))}
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <label className="cap" style={{ flex: 1 }}>Price $
              <input type="number" min="1" max="2000" value={price} onChange={e => setPrice(e.target.value)} style={{ width: '100%', marginTop: 3 }} />
            </label>
            <label className="cap" style={{ flex: 1 }}>Advertised low $
              <input type="number" min="0.25" value={bandLo} onChange={e => setBandLo(e.target.value)} style={{ width: '100%', marginTop: 3 }} />
            </label>
            <label className="cap" style={{ flex: 1 }}>Advertised high $
              <input type="number" min="1" value={bandHi} onChange={e => setBandHi(e.target.value)} style={{ width: '100%', marginTop: 3 }} />
            </label>
          </div>
          {/* What the line is MADE of. Together with the band above, this is what 🪄 Auto-build
              sweeps up — "PSA 10 slabs, $1–$10" is a product definition, not just a filter. */}
          <div className="row" style={{ gap: 8 }}>
            <label className="cap" style={{ flex: 1 }}>Contents
              <select value={only} onChange={e => setOnly(e.target.value)} style={{ width: '100%', marginTop: 3 }}>
                {PACK_ONLY_OPTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </label>
            {only === 'slab' && (
              <label className="cap" style={{ flex: 1 }}>Minimum grade
                <select value={minGrade} onChange={e => setMinGrade(+e.target.value)} style={{ width: '100%', marginTop: 3 }}>
                  {PACK_GRADE_OPTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="banner t-xs" style={{ margin: 0 }}>
            🪄 With these settings, <b>{wouldFit}</b> loose card{wouldFit === 1 ? '' : 's'} in your collection
            {wouldFit === 1 ? ' fits' : ' fit'} this line ({tierContentsLabel({ only, minGrade: +minGrade })},
            {' '}{fmtMoney(+bandLo || 0)}–{fmtMoney(+bandHi || 0)}) — Auto-build would seal
            {' '}<b>{Math.min(wouldFit, AUTO_BUILD_CAP)}</b> pack{Math.min(wouldFit, AUTO_BUILD_CAP) === 1 ? '' : 's'}, one card each.
          </div>
          <div>
            <span className="cap">Sells at</span>
            <div className="row" style={{ gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
              {CHANNEL_DEFS.map(c => (
                <label key={c.key} className="tweet-toggle t-sm"  title={c.hint}>
                  <input type="checkbox" checked={!!channels[c.key]}
                    onChange={e => setChannels(ch => ({ ...ch, [c.key]: e.target.checked }))} />
                  {c.icon} {c.label}
                </label>
              ))}
            </div>
          </div>
          {/* 📋 Publish the odds board — the headline transparency choice. */}
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <label className="tweet-toggle t-sm" style={{ fontWeight: 700 }}
              title="Post the pull odds for this line publicly">
              <input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} />
              📋 Publish the odds board{certified && published ? ' — certified ✔' : ''}
            </label>
            <p className="cap" style={{ margin: '4px 0 0' }}>
              Post the pull odds for buyers to see. Gamblers <b>bite more often</b>, and an honest thin
              pack <b>barely dings your rep</b> — they knew the odds going in. But it's a public promise:
              a pack that opens <b>under your advertised floor</b> ({fmtMoney(+bandLo || 0)}) burns
              <b> hotter</b> than an unposted one.
              {certified
                ? <> Your <b>📋 Certified Odds</b> audit makes a posted board pull harder still.</>
                : <> A <b>📋 Certified Odds</b> audit (Upgrades) would make it pull even harder.</>}
            </p>
          </div>
        </div>
        <div className="row" style={{ marginTop: 14, gap: 8 }}>
          <button className="btn gold" onClick={save}>{tier ? 'Save changes' : 'Create line'}</button>
          {tier && (
            <button className="btn alt btn-fixed" style={{ maxWidth: 110 }} disabled={stockCount> 0}
              title={stockCount > 0 ? 'Unbuild its packs first' : 'Retire this product line'}
              onClick={() => { deletePackTier(tier.id); flash(`${tier.icon} ${tier.name} retired.`); onClose() }}>
              🗑️ Delete
            </button>
          )}
          <button className="btn alt btn-fixed" style={{ maxWidth: 100 }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// --- Pack builder ----------------------------------------------------------------
// Pick EXACTLY what gets sealed inside one pack of `tier` — cards from your collection,
// sealed product from your inventory — with a live value read against the advertised band.
function PackBuilder({ tier, onClose, flash }) {
  const collection = useGame(s => s.collection)
  const sealedInventory = useGame(s => s.sealedInventory)
  const buildPack = useGame(s => s.buildPack)
  const [cardIds, setCardIds] = useState(() => new Set())
  const [sealIds, setSealIds] = useState(() => new Set())
  const [pane, setPane] = useState('cards') // cards | sealed

  const pickedCards = collection.filter(c => cardIds.has(c.uid))
  const pickedSealed = (sealedInventory || []).filter(it => sealIds.has(it.uid))
  const total = round2(pickedCards.reduce((a, c) => a + cardValue(c), 0)
    + pickedSealed.reduce((a, it) => a + sealedValue(it), 0))
  const n = pickedCards.length + pickedSealed.length
  const ratio = tier.price ? total / tier.price : 1
  const read = total === 0 ? null
    : total < tier.bandLo ? { t: `under the advertised floor (${fmtMoney(tier.bandLo)}) — false advertising ☠️`, c: 'var(--red)' }
    : ratio >= 2 ? { t: 'a seeded banger — whoever opens this will scream 🎉', c: 'var(--gold)' }
    : ratio >= 0.85 ? { t: 'a fair pack — buyers get their money\'s worth 🙂', c: 'var(--green)' }
    : ratio >= 0.45 ? { t: 'a thin pack — the usual mystery-pack shrug 😐', c: '#ff9f43' }
    : { t: 'a ripoff at this price — your rep will pay 😡', c: 'var(--red)' }

  const toggle = (setFn) => (uid) => setFn(prev => {
    const next = new Set(prev)
    next.has(uid) ? next.delete(uid) : next.add(uid)
    return next
  })

  // Every loose card that fits the line (right kind, right price). "Add all that fit" stuffs
  // them ALL into THIS one pack — the opposite of 🪄 Auto-build, which gives each its own pack.
  const fitting = useMemo(() => collection.filter(c => cardFitsTier(c, tier)), [collection, tier])
  // Cards you've hand-picked that break the line's own contents promise. Not blocked — the
  // game never stops you mislabeling (same as the band) — but you should know you did it.
  const offRule = pickedCards.filter(c => !cardMatchesContents(c, tier))

  function seal() {
    const pack = buildPack(tier.id, [...cardIds], [...sealIds])
    flash(pack ? `${tier.icon} Sealed a ${tier.name} — ${fmtMoney(total)} of stuff inside, sells at ${fmtMoney(tier.price)}.` : 'Pick something to seal in first.')
    onClose()
  }

  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 760 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
        <h2 className="t-xl" style={{ marginBottom: 2 }}>🛠️ Build a {tier.icon} {tier.name}</h2>
        <p className="cap t-sm mt-0">
          Sells at <b>{fmtMoney(tier.price)}</b>, advertising <b>{fmtMoney(tier.bandLo)}–{fmtMoney(tier.bandHi)}</b> inside
          {' '}· takes <b>{tierContentsLabel(tier)}</b>.
          Tap items to seal them in — the buyer gets <b>everything</b> in the pack.
        </p>
        <div className="toolbar" style={{ marginTop: 0, position: 'sticky', top: 0, zIndex: 2 }}>
          <span className="pill" style={{ background: 'color-mix(in srgb, var(--accent2) 13%, transparent)', color: 'var(--accent-light)' }}>
            {n} item{n === 1 ? '' : 's'} · <b>{fmtMoney(total)}</b> inside
          </span>
          {read && <span className="pill" style={{ background: `${read.c === 'var(--gold)' ? '#ffcb05' : ''}22`, color: read.c }}>{read.t}</span>}
          {/* Bulk-select every card that fits — into THIS pack. (For one-card-per-pack, use
              🪄 Auto-build on the line itself.) */}
          <button className="btn alt t-xs btn-fixed" style={{ maxWidth: 190, padding: '4px 10px', marginLeft: 'auto' }}
            disabled={!fitting.length}
            title={fitting.length
              ? `Seal all ${fitting.length} loose ${tierContentsLabel(tier)} worth ${fmtMoney(tier.bandLo)}–${fmtMoney(tier.bandHi)} into this ONE pack`
              : 'No loose cards fit this line right now'}
            onClick={() => setCardIds(new Set(fitting.map(c => c.uid)))}>
            ＋ Add all {fitting.length} that fit
          </button>
          {n > 0 && (
            <button className="btn alt t-xs btn-fixed" style={{ maxWidth: 80, padding: '4px 10px' }}
              onClick={() => { setCardIds(new Set()); setSealIds(new Set()) }}>Clear</button>
          )}
        </div>
        {offRule.length > 0 && (
          <div className="banner t-xs" style={{ marginTop: 8, color: 'var(--red)' }}>
            ⚠️ {offRule.length} card{offRule.length === 1 ? '' : 's'} in here {offRule.length === 1 ? "doesn't" : "don't"} match
            {' '}this line's promise of <b>{tierContentsLabel(tier)}</b>. You can still seal it — but that's what the line advertises.
          </div>
        )}
        <div className="subtabs mt-4">
          <button className={`subtab ${pane === 'cards' ? 'active' : ''}`} onClick={() => setPane('cards')}>🗂️ Cards ({collection.length})</button>
          <button className={`subtab ${pane === 'sealed' ? 'active' : ''}`} onClick={() => setPane('sealed')}>📦 Sealed ({(sealedInventory || []).length})</button>
        </div>
        <div style={{ maxHeight: '46vh', overflowY: 'auto', marginTop: 6 }}>
          {pane === 'cards' ? (
            collection.length === 0 ? <div className="empty">No loose cards — everything's put away or sold.</div> : (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))' }}>
                {[...collection].sort((a, b) => cardValue(b) - cardValue(a)).map(c => {
                  const on = cardIds.has(c.uid)
                  return (
                    <div key={c.uid} className="vendoritem" style={on ? { boxShadow: '0 0 0 2px var(--gold)', borderRadius: 10 } : undefined}
                      onClick={() => toggle(setCardIds)(c.uid)} role="button" tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(setCardIds)(c.uid) } }}>
                      <CardTile card={c} interactive={false} />
                      <span className="pill t-xs" style={{ alignSelf: 'center', background: on ? '#ffcb0522' : undefined, color: on ? 'var(--gold)' : undefined }}>
                        {on ? '✓ sealed in' : fmtMoney(cardValue(c))}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          ) : (
            (sealedInventory || []).length === 0 ? <div className="empty">No held sealed product — buy some on the Buy tab.</div> : (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))' }}>
                {[...(sealedInventory || [])].sort((a, b) => sealedValue(b) - sealedValue(a)).map(it => {
                  const set = setById(it.setId)
                  const on = sealIds.has(it.uid)
                  return (
                    <div key={it.uid} className="vendoritem" style={on ? { boxShadow: '0 0 0 2px var(--gold)', borderRadius: 10 } : undefined}
                      onClick={() => toggle(setSealIds)(it.uid)} role="button" tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(setSealIds)(it.uid) } }}>
                      <div className="shelf-sealed">
                        {set?.logo ? <img src={set.logo} alt={set?.name || ''} decoding="async" /> : <span className="shelf-sealed-icon">{it.product.icon || '📦'}</span>}
                        <div className="shelf-sealed-label">{it.product.icon || '📦'} {it.product.type}</div>
                      </div>
                      <span className="pill t-xs" style={{ alignSelf: 'center', background: on ? '#ffcb0522' : undefined, color: on ? 'var(--gold)' : undefined }}>
                        {on ? '✓ sealed in' : fmtMoney(sealedValue(it))}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>
        <div className="row" style={{ marginTop: 14, gap: 8 }}>
          <button className="btn gold" disabled={n === 0} onClick={seal}>🎁 Seal it — {n || 'no'} item{n === 1 ? '' : 's'}, {fmtMoney(total)} inside</button>
          <button className="btn alt btn-fixed" style={{ maxWidth: 100 }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
