// One tab strip, two skins. The desktop top bar and the phone bottom nav used to render
// the same TABS with separately-computed badges — one source of items now feeds both.
// `items`: [{ id, label, icon, badge, bottomOnly }]. `bottomOnly` entries (the "More"
// stand-in for the gear) appear only in the bottom nav; the top bar keeps its own gear.
export default function TabBar({ items, active, onSelect, variant }) {
  if (variant === 'bottom') {
    return (
      <nav className="bottomnav" aria-label="Primary">
        {items.map(t => (
          <button key={t.id} className={`bnav-btn ${active === t.id ? 'active' : ''}`} onClick={() => onSelect(t.id)}>
            <span className="bnav-icon">{t.icon}{t.badge ? <span className="bnav-badge">{t.badge}</span> : null}</span>
            <span className="bnav-label">{t.bottomLabel || t.label}</span>
          </button>
        ))}
      </nav>
    )
  }
  return (
    <div className="tabs">
      {items.filter(t => !t.bottomOnly).map(t => (
        <button key={t.id} className={`tab ${active === t.id ? 'active' : ''}`} onClick={() => onSelect(t.id)}>
          {t.label}{t.badge ? ` (${t.badge})` : ''}
        </button>
      ))}
    </div>
  )
}
