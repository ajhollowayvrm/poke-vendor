// SKU grouping — shared by every "stock list" UI (trade panels, the store stock view).
// "Same SKU" = same card, same condition, same grade, same finish. Identical copies
// collapse into ONE line with a quantity instead of a wall of duplicate tiles. Unit
// price is folded into the key so every copy on a line is guaranteed interchangeable
// (a line's total is always unit × qty).

export function cardSku(c) {
  return [c.id, c.condition || '', c.grade ? `psa${c.grade.overall}` : 'raw',
    c.foil ? (c.foil.badge || c.foil.label || 'foil') : c.reverse ? 'rv' : ''].join('|')
}

// Short per-line descriptor: grade if slabbed, else raw condition.
export function skuBadge(c) { return c.grade ? `PSA ${c.grade.overall}` : (c.condition || 'raw') }

// Group items into SKU lines: [{ key, first, items, unit, count }], highest value first.
export function groupLines(items, keyOf, unitOf) {
  const map = new Map()
  for (const it of items || []) {
    const unit = unitOf(it)
    const key = `${keyOf(it)}|${unit.toFixed(2)}`
    let g = map.get(key)
    if (!g) map.set(key, g = { key, first: it, items: [], unit, count: 0 })
    g.items.push(it); g.count++
  }
  return [...map.values()].sort((a, b) => b.unit - a.unit)
}

export function groupCardLines(cards, unitOf) { return groupLines(cards, cardSku, unitOf) }

export const sealedSku = (setId, product) => `seal|${setId}|${product?.type || ''}`
