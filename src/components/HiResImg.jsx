import { useEffect, useState } from 'react'
import { cardImg, cardImgLarge } from '../game/engine'

// Progressive card art for the big "study the card" views (card modal, grade reveal,
// encounters): paint the small image — usually already in the SW cache from the grid or
// pack reveal that got you here — instantly, then swap in the hi-res once it has
// downloaded AND decoded. The hi-res PNGs run 0.5–1MB from a cold CDN, so blocking the
// view's art on them is the single largest perceived-latency hit in the app.
export default function HiResImg({ card, ...imgProps }) {
  const small = cardImg(card)
  const large = cardImgLarge(card)
  const [hiResReady, setHiResReady] = useState(false)
  useEffect(() => {
    setHiResReady(false)
    if (!large || large === small) return
    let stale = false
    const img = new Image()
    img.src = large
    const swap = () => { if (!stale) setHiResReady(true) }
    // decode() so the swap paints whole, never in half-rasterized bands (same reason
    // preloadCardImages decodes). A failed decode/load just keeps the small art up.
    if (img.decode) img.decode().then(swap).catch(() => {})
    else img.onload = swap
    return () => { stale = true }
  }, [small, large])
  return <img src={hiResReady ? large : (small || large)} {...imgProps} />
}
