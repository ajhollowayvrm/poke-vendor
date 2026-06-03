import { useRef, useState, useCallback } from 'react'
import { rarityRank } from '../game/engine'

// Holo "intensity" by rarity — drives how strong the foil/glare/sparkle reads.
function holoLevel(card) {
  const r = rarityRank(card.rarity)
  if (card.foil?.key === 'masterball') return 3 // Master Ball: full chase shimmer
  if (card._isHit || r >= rarityRank('Special Illustration Rare')) return 3 // full rainbow + sparkle
  if (card.foil?.key === 'pokeball') return 2                                // Poké Ball: strong foil
  if (r >= rarityRank('Double Rare')) return 2                                // strong holo
  if (r >= rarityRank('Rare Holo') || card.reverse) return 1                  // gentle reverse-holo
  return 0
}

// Pointer-tracked 3D tilt + dynamic glare. Wrap any card image.
export default function HoloCard({ card, children, maxTilt = 14, className = '', interactive = true }) {
  const ref = useRef(null)
  const [style, setStyle] = useState({})
  const level = holoLevel(card)

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
      '--mx': `${px * 100}%`,
      '--my': `${py * 100}%`,
      '--glare-o': level ? 0.26 : 0.13,
      transition: 'transform .05s',
    })
  }, [interactive, maxTilt, level])

  const onLeave = useCallback(() => {
    setStyle({ transform: 'perspective(700px) rotateX(0) rotateY(0) scale(1)', transition: 'transform .4s ease' })
  }, [])

  return (
    <div
      ref={ref}
      className={`holocard lvl-${level} ${className}`}
      style={style}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      {children}
      {level > 0 && <div className="holo-foil" />}
      <div className="holo-glare" />
      {level >= 3 && <div className="holo-sparkle" />}
    </div>
  )
}
