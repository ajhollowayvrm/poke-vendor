import { useRef, useState, useCallback } from 'react'

// Card wrapper: a gentle pointer-tracked 3D tilt on hover. No holographic
// overlay — the art is left fully visible; rarity is conveyed by the colored
// border on the card tile itself (see rarityColor + .cardtile border).
export default function HoloCard({ card, children, maxTilt = 14, className = '', interactive = true, extraStyle, onClick }) {
  const ref = useRef(null)
  const [style, setStyle] = useState({})

  const onMove = useCallback((e) => {
    if (!interactive || !ref.current) return
    const el = ref.current
    const rect = el.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width   // 0..1
    const py = (e.clientY - rect.top) / rect.height
    const rx = (0.5 - py) * maxTilt * 2
    const ry = (px - 0.5) * maxTilt * 2
    setStyle({
      transform: `perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.06)`,
      transition: 'transform .05s',
    })
  }, [interactive, maxTilt])

  const onLeave = useCallback(() => {
    setStyle({ transform: 'perspective(700px) rotateX(0) rotateY(0) scale(1)', transition: 'transform .4s ease' })
  }, [])

  return (
    <div
      ref={ref}
      className={`holocard ${className}`}
      style={{ ...extraStyle, ...style }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
