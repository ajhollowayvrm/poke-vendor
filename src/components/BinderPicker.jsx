import { useEffect, useId, useMemo, useRef, useState } from 'react'

// Which binder am I looking at, and how close is any of them to done?
//
// This replaces a plain <select> of set names, and the reason is a number: a real save reaches
// 137 binders. A native select of 137 names, in binder-purchase order, answers "what do I own"
// and nothing else — the one thing a masterset collector actually wants from that list is WHICH
// ONE IS NEARLY FINISHED, and that was invisible until you opened each page one at a time.
//
// So the list is sorted by completion and every row carries its own progress. The set two cards
// from done sits at the top, where it can pull you toward finishing it.
//
// A filter box rather than a native select's type-ahead: type-ahead only matches a leading
// prefix, so at this length "fable" finds nothing and you scroll 137 rows looking for Shrouded
// Fable. It also autofocuses on open, which is what makes the keyboard path fast — open, type
// three letters, Enter.
//
// `stats` is a Map<setId, mastersetStats> built ONCE by the parent (engine.mastersetStatsForSets)
// and passed in. Computing it per row here would re-walk the binder for every one of the 137.
export default function BinderPicker({ sets, stats, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const listId = useId()

  const pctOf = (id) => stats.get(id)?.pct ?? 0

  // Sorted by completion, the whole point of the control. Ties break on the fuller binder and
  // then on name, so the order is stable rather than dependent on however `sets` arrived.
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return sets
      .filter(s => !needle || s.name.toLowerCase().includes(needle))
      .map(s => ({ set: s, st: stats.get(s.id) }))
      .sort((a, b) => (b.st?.pct ?? 0) - (a.st?.pct ?? 0)
        || (b.st?.placed ?? 0) - (a.st?.placed ?? 0)
        || a.set.name.localeCompare(b.set.name))
  }, [sets, stats, q])

  // Keep the highlight on a row that still exists after the filter narrows.
  useEffect(() => { setActive(a => Math.min(a, Math.max(0, rows.length - 1))) }, [rows.length])

  // Open on the row you are already on, so the list starts where you are rather than at the
  // top — otherwise opening the picker on your 3%-done binder highlights a 99% one and Enter
  // silently switches you to a set you never chose.
  useEffect(() => {
    if (!open) return
    setQ('')
    const i = rows.findIndex(r => r.set.id === value)
    setActive(i >= 0 ? i : 0)
    inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Close on a click anywhere else, and on Escape. Both, not either: a dropdown you can only
  // dismiss by picking something is a trap on a phone, where there is no Escape key.
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
    }
  }, [open])

  // Follow the keyboard highlight with the scroll container, or arrowing past the fold moves a
  // selection you cannot see.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('[data-active="1"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, active, rows.length])

  const pick = (id) => { onChange(id); setOpen(false) }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, rows.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); return }
    if (e.key === 'Home') { e.preventDefault(); setActive(0); return }
    if (e.key === 'End') { e.preventDefault(); setActive(rows.length - 1); return }
    if (e.key === 'Enter') { e.preventDefault(); const r = rows[active]; if (r) pick(r.set.id) }
  }

  const current = sets.find(s => s.id === value) || null
  const curSt = current ? stats.get(current.id) : null

  return (
    <div className="bpick" ref={wrapRef}>
      <button type="button" className="bpick-trigger" aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen(o => !o)}>
        <span className="bpick-trigger-main">
          <span className="bpick-name">{current ? current.name : 'Pick a binder'}</span>
          {curSt && <span className={`bpick-pct ${curSt.complete ? 'done' : ''}`}>
            {curSt.complete ? '✨ 100%' : `${curSt.pct}%`}
          </span>}
        </span>
        {curSt && <ProgressBar pct={curSt.pct} complete={curSt.complete} />}
        <span className="bpick-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="bpick-pop">
          <input ref={inputRef} className="bpick-filter" type="text" value={q} placeholder="Filter binders…"
            role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
            aria-label="Filter binders by name"
            aria-activedescendant={rows[active] ? `${listId}-${rows[active].set.id}` : undefined}
            onChange={e => { setQ(e.target.value); setActive(0) }} onKeyDown={onKeyDown} />
          <div className="bpick-list" id={listId} role="listbox" ref={listRef}
            aria-label="Your binders, most complete first">
            {rows.map((r, i) => (
              <div key={r.set.id} id={`${listId}-${r.set.id}`} role="option"
                aria-selected={r.set.id === value} data-active={i === active ? '1' : '0'}
                className={`bpick-row ${r.set.id === value ? 'on' : ''} ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)} onClick={() => pick(r.set.id)}>
                <span className="bpick-row-top">
                  <span className="bpick-name">{r.set.name}</span>
                  <span className={`bpick-pct ${r.st?.complete ? 'done' : ''}`}>
                    {r.st?.complete ? '✨ 100%' : `${r.st?.pct ?? 0}%`}
                  </span>
                </span>
                <ProgressBar pct={r.st?.pct ?? 0} complete={!!r.st?.complete} />
                <span className="bpick-row-sub cap">
                  {r.st ? `${r.st.placed}/${r.st.total} slots` : 'no data'}
                  {r.st?.placeable > 0 && <b className="pos"> · {r.st.placeable} ready to slot</b>}
                </span>
              </div>
            ))}
            {!rows.length && <div className="bpick-empty cap">No binder matches “{q}”.</div>}
          </div>
        </div>
      )}
    </div>
  )
}

// Deliberately the same shape and fill as .binder-bar on the page below, so the bar in the row
// and the bar on the open binder read as the same measurement rather than two similar widgets.
function ProgressBar({ pct, complete }) {
  return (
    <span className={`bpick-bar ${complete ? 'done' : ''}`} aria-hidden="true">
      <span style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }} />
    </span>
  )
}
