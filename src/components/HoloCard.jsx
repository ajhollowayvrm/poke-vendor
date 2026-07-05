import { useRef, useCallback } from 'react'

// Card wrapper: a gentle pointer-tracked 3D tilt on hover. No holographic
// overlay — the art is left fully visible; rarity is conveyed by the colored
// border on the card tile itself (see rarityColor + .cardtile border).
//
// The tilt writes the transform straight to the element (no setState): a state
// update per mousemove re-rendered the whole tile subtree at pointer speed —
// pure waste for a cosmetic transform the DOM can carry itself.
export default function HoloCard({ card, children, maxTilt = 14, className = '', interactive = true, extraStyle, onClick }) {
  const ref = useRef(null)

  const onMove = useCallback((e) => {
    if (!interactive || !ref.current) return
    const el = ref.current
    const rect = el.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width   // 0..1
    const py = (e.clientY - rect.top) / rect.height
    const rx = (0.5 - py) * maxTilt * 2
    const ry = (px - 0.5) * maxTilt * 2
    el.style.transform = `perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.06)`
    el.style.transition = 'transform .05s'
  }, [interactive, maxTilt])

  const onLeave = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.transform = 'perspective(700px) rotateX(0) rotateY(0) scale(1)'
    el.style.transition = 'transform .4s ease'
  }, [])

  return (
    <div
      ref={ref}
      className={`holocard ${className}`}
      style={extraStyle}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
