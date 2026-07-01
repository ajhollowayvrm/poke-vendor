import { useEffect, useRef, useState } from 'react'

// A number that tweens toward its target value (easeOutCubic) and flashes green-ish on
// an increase / red-ish on a decrease. `format` maps the live numeric value to display
// text (e.g. fmtMoney, or n => Math.round(n)). Respects prefers-reduced-motion by
// snapping straight to the target with no tween or flash.
//
//   <AnimatedNumber value={cash} format={fmtMoney} />
export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString(), className = '', duration = 450, flash = true }) {
  const [display, setDisplay] = useState(value)
  const [dir, setDir] = useState(0)        // 1 = went up, -1 = went down, 0 = idle
  const displayRef = useRef(value)          // latest painted value, read at tween start
  const prevRef = useRef(value)             // last target we animated to
  const rafRef = useRef(0)

  useEffect(() => { displayRef.current = display }, [display])

  useEffect(() => {
    const to = value
    const prev = prevRef.current
    if (to === prev) return
    setDir(to > prev ? 1 : -1)
    prevRef.current = to
    const from = displayRef.current
    const reduce = typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || from === to) { setDisplay(to); return }
    let start = 0
    const step = (ts) => {
      if (!start) start = ts
      const t = Math.min(1, (ts - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from + (to - from) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(step)
      else setDisplay(to)
    }
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value, duration])

  // clear the flash class after the keyframe has played
  useEffect(() => {
    if (!dir) return
    const id = setTimeout(() => setDir(0), 650)
    return () => clearTimeout(id)
  }, [dir])

  const flashCls = flash && dir === 1 ? ' num-flash-up' : flash && dir === -1 ? ' num-flash-down' : ''
  return <span className={`num-anim${flashCls}${className ? ' ' + className : ''}`}>{format(display)}</span>
}
