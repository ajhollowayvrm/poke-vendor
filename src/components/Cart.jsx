import { useState } from 'react'
import { useGame } from '../game/store'
import { fmtMoney, setById, productTypeLabel } from '../game/engine'
import { Modal } from '../ui/Modal'
import { toast } from '../ui/dialog'

// 🛒 The basket.
//
// Buying used to be one tap per unit: every line its own transaction, its own "cash or
// credit?", its own toast. A stocking run — the thing a vendor actually does on the Buy tab —
// came out as fifteen unrelated purchases. The cart collects the lines and charges them
// together, so the two questions that matter get asked once, at the end, about the whole order.
//
// It holds NO buy rules. Checkout calls buyFromDistributorBulk per line (store/sourcing.js),
// which owns the per-customer limits, the finite shelf stock, the rapport price, the credit
// and split payment paths and the import lead time. A line can still short-fill on stock or a
// limit — that is the shelf answering, not a money problem, and the receipt says which lines.
//
// The cart empties on Next Day (see daytick.js). A line carries the price you were quoted, and
// shelves re-price overnight — a basket parked for a month would otherwise let you buy at last
// month's price on a set that has since run.
export default function Cart({ payMode = 'cash' }) {
  const cart = useGame(s => s.cart || [])
  const cash = useGame(s => s.cash)
  const creditAvail = useGame(s => s.creditAvailable())
  const creditFrozen = useGame(s => !!s.credit?.frozen)
  const hasStore = useGame(s => !!s.upgrades.storefront)
  const ripOnBuy = useGame(s => !!s.settings?.ripOnBuy)
  const updateCartQty = useGame(s => s.updateCartQty)
  const removeFromCart = useGame(s => s.removeFromCart)
  const clearCart = useGame(s => s.clearCart)
  const checkoutCart = useGame(s => s.checkoutCart)
  const [open, setOpen] = useState(false)

  const creditUsable = !creditFrozen && creditAvail > 0
  const onCredit = payMode === 'credit' && creditUsable
  const split = payMode === 'split' && creditUsable
  const total = cart.reduce((a, l) => a + l.unitPrice * l.qty, 0)
  const units = cart.reduce((a, l) => a + l.qty, 0)
  const spendable = split ? cash + creditAvail : onCredit ? creditAvail : cash
  const payLabel = onCredit ? 'on credit 💳' : split ? 'cash first, then credit 💳' : 'with cash'

  // 📦 Rip-on-buy buys the moment you tap, because a cart cannot rip. Say so where the cart
  // would otherwise sit looking broken — a setting that silently swallows a feature is worse
  // than one that explains itself.
  if (ripOnBuy) {
    return (
      <div className="banner mt-3">
        🛒 The cart is off while <b>Rip on buy</b> is on — every purchase opens straight away.
        Turn it off in <b>Misc → Settings</b> to build an order instead.
      </div>
    )
  }

  function checkout(dest) {
    const r = checkoutCart({ dest, onCredit, split })
    if (r.error) return toast(r.error)
    setOpen(false)
    const where = !hasStore ? 'your inventory'
      : dest === 'personal' ? 'your 👤 personal collection' : 'the 🏬 storeroom'
    const shortNote = r.short.length
      ? ` ${r.short.length} line${r.short.length === 1 ? '' : 's'} came up short — the shelf or a per-customer limit ran out.`
      : ''
    toast(`🛒 Ordered ${r.bought} item${r.bought === 1 ? '' : 's'} for ${fmtMoney(r.spent)} → ${where}.${shortNote}`, 6000)
  }

  return (
    <>
      <button className={`btn cart-btn ${cart.length ? 'gold' : ''}`} onClick={() => setOpen(true)}
        aria-label={`Cart: ${units} item${units === 1 ? '' : 's'}, ${fmtMoney(total)}`}>
        🛒 Cart{units > 0 ? ` · ${units} item${units === 1 ? '' : 's'} · ${fmtMoney(total)}` : ' — empty'}
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth={520} label="Your cart">
          <h3 className="mt-0">🛒 Your order</h3>
          {cart.length === 0 ? (
            <p className="muted">
              Nothing in the cart yet. Add product from a distributor's shelf — and finish the
              order today: shelves restock and re-price overnight, so the cart empties with the day.
            </p>
          ) : (
            <>
              <div className="cart-lines">
                {cart.map(l => {
                  const set_ = setById(l.setId)
                  const origin = l.product?.pool?.series ? `${l.product.pool.series} era` : (set_?.name || '—')
                  return (
                    <div key={l.id} className="product cart-line">
                      <div className="cart-line-info">
                        <div className="t-sm" style={{ fontWeight: 700 }}>
                          {l.product?.icon || '📦'} {productTypeLabel(l.product)}
                        </div>
                        <div className="cap">{origin} · {fmtMoney(l.unitPrice)} each</div>
                      </div>
                      <div className="qty-ctl" aria-label="quantity">
                        <button type="button" className="qty-step" onClick={() => updateCartQty(l.id, l.qty - 1)} aria-label="fewer">−</button>
                        <input type="number" min="1" value={l.qty} aria-label="quantity"
                          onChange={e => updateCartQty(l.id, Number(e.target.value))} onFocus={e => e.target.select()} />
                        <button type="button" className="qty-step" onClick={() => updateCartQty(l.id, l.qty + 1)} aria-label="more">+</button>
                      </div>
                      <div className="cart-line-total">{fmtMoney(l.unitPrice * l.qty)}</div>
                      <button className="qty-step" onClick={() => removeFromCart(l.id)} aria-label="remove from cart">✕</button>
                    </div>
                  )
                })}
              </div>

              <div className="paystatus mt-4">
                <span className="pill">{units} item{units === 1 ? '' : 's'}</span>
                <span className="pill" style={{ fontWeight: 700 }}>{fmtMoney(total)}</span>
                <span className="pill">Paying {payLabel}</span>
              </div>
              {spendable + 1e-9 < total && (
                <p className="cap" style={{ color: 'var(--red)' }}>
                  That is {fmtMoney(total - spendable)} more than you can cover. Trim the order, or
                  change how you're paying above the shelf.
                </p>
              )}

              {/* Where the whole order goes. Only a storefront has anywhere else to put stock —
                  without one there is one inventory and the question would be theatre. */}
              {hasStore ? (
                <>
                  <p className="cap mt-4">Where is this order going?</p>
                  <div className="row-btns">
                    <button className="btn gold" disabled={spendable + 1e-9 < total} onClick={() => checkout('store')}>
                      🏬 The store — sellable, lands in the storeroom
                    </button>
                    <button className="btn" disabled={spendable + 1e-9 < total} onClick={() => checkout('personal')}>
                      👤 My collection — kept back, not for sale
                    </button>
                  </div>
                </>
              ) : (
                <button className="btn gold mt-4" disabled={spendable + 1e-9 < total} onClick={() => checkout('personal')}>
                  Place the order · {fmtMoney(total)}
                </button>
              )}
              <button className="btn alt mt-3" onClick={() => { clearCart(); setOpen(false) }}>Empty the cart</button>
            </>
          )}
        </Modal>
      )}
    </>
  )
}
