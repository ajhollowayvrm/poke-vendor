// One asking-price control, shared by every sell flow (Collection bulk bar, CardModal,
// SealedInventory) so pricing feels like one system. Preset %-of-market buttons + an
// optional custom input; `pct` is an integer percentage. `children` renders to the right
// (the live price / net / buy-share hint the call site wants to show). Clicks stop
// propagation so it works inside the Collection bulk bar without triggering row selection.
export function AskPicker({ pct, onChange, presets = [80, 90, 100, 110], custom = true, label = 'Ask', children }) {
  return (
    <div className="list-pct-row">
      {label && <span className="cap">{label}</span>}
      {presets.map(p => (
        <button key={p} className={`pctbtn ${Math.round(pct) === p ? 'on' : ''}`}
          onClick={e => { e.stopPropagation(); onChange(p) }}>{p}%</button>
      ))}
      {custom && (
        <input className="pctinput" type="number" min="50" max="300" step="5" value={pct}
          onClick={e => e.stopPropagation()}
          onChange={e => onChange(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))} />
      )}
      {children}
    </div>
  )
}
