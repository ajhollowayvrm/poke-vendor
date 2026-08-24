// The surface catalogue + the phone audits a screenshot cannot show you.
//
// Owned by tools/ios/sweep.mjs alone. It is deliberately NOT part of scenarios.mjs: that file is
// the shared contract between `npm run ios:web` and `npm run ios:sim`, and the shell driver runs a
// PRODUCTION bundle with no module graph and no Playwright. This file is browser-only and
// Chrome-only, so it is free to use real pointer gestures and per-surface probes that the shell
// bridge could never execute.
//
// It reuses DEVICE from scenarios.mjs on purpose. The island and home-indicator numbers must agree
// between the three drivers or the same control gets called a bug by one and clean by another.
import { DEVICE } from './scenarios.mjs'

export { DEVICE }

// ---------------------------------------------------------------------------------------------
// What Chromium gets wrong, and what we inject to fix it.
//
// 1. env(safe-area-inset-*) is 0 in every desktop Chromium, emulated phone or not. styles.css:20
//    anticipates this and routes all four insets through --sat/--sab/--sal/--sar precisely so a
//    test can override them. Without this the notch and home-indicator collisions are invisible
//    and the sweep reports a false clean.
// 2. .native-shell is added by main.jsx only when the iOS shell injected __POKEVENDOR_NATIVE__.
//    It gates exactly one rule (styles.css:1802): the bottom nav taking back the home-indicator
//    inset. The browser build deliberately skips that to reclaim 34px. Since the shell IS the
//    shipping target, the sweep defaults to shell behaviour and NATIVE=0 shows the browser
//    compromise for comparison.
export const INIT_NATIVE = `
  window.__POKEVENDOR_NATIVE__ = true
`

export const INIT_INSETS = `
  const css = document.createElement('style')
  css.id = '__sweep-insets'
  css.textContent = ':root{--sat:${DEVICE.islandInset}px;--sab:${DEVICE.homeInset}px;--sal:0px;--sar:0px}'
  const put = () => document.documentElement.appendChild(css)
  if (document.documentElement) put()
  else document.addEventListener('readystatechange', put, { once: true })
`

// ---------------------------------------------------------------------------------------------
// Seeds. Applied by setState against the LIVE store after a clean reload — never written and
// read back. Persist writes are debounced 400ms into IndexedDB (main.jsx:68), so a
// seed-then-reload round trip races the write and reads back the PREVIOUS state, which looks
// exactly like the screen under test being broken. Setting state on the live store and letting
// React re-render skips that whole failure class.

export const SEEDS = {
  // Day one. This is the only way to reach the FirstRun checklist, the locked Stream screen, the
  // locked distributors, the pre-storefront Inventory shape, the inverse-gated Regulars tab, and
  // every empty state in the app.
  fresh: `return 'fresh'`,

  // Every gate open. UPGRADES comes off the test seam rather than a list copied into this file —
  // a copy goes stale the first time somebody adds an upgrade, and it fails SILENTLY by leaving
  // one screen unswept instead of by erroring.
  loaded: `
    const { useGame, UPGRADES } = window.__PV__
    const on = {}
    for (const k of Object.keys(UPGRADES)) on[k] = true
    useGame.setState({ cash: 1000000, notoriety: 400, rank: 5, clout: 99, upgrades: on })
    await new Promise(r => setTimeout(r, 600))
    return Object.keys(on).length + ' upgrades'
  `,

  // Everything `loaded` has, plus actual STOCK. Money and upgrades alone leave seven surfaces
  // unreachable — there is no card modal without a card, nothing to rip, and nothing to sift — so
  // an empty collection quietly costs the sweep its whole inventory-and-overlay wing.
  //
  // The cards and sealed come from the game's OWN actions (openPack, addPulls, buySealed) rather
  // than hand-built objects. A fake card is the kind of seed that passes the sweep and misses the
  // bug: card tiles render grade, price, set name and holo state off fields a stub would not
  // have, and a stub sealed row has no product to price. Importing the engine through the dev
  // server's module graph is safe HERE and nowhere else — this driver never runs inside the shell.
  stocked: `
    const { useGame, UPGRADES } = window.__PV__
    const on = {}
    for (const k of Object.keys(UPGRADES)) on[k] = true
    useGame.setState({ cash: 1000000, notoriety: 400, rank: 5, clout: 99, upgrades: on })
    const eng = await import('/src/game/engine.js')
    const g = useGame.getState()
    const sets = eng.SETS.filter(s => (s.products || []).length).slice(0, 5)
    for (const st of sets) {
      try { g.addPulls(eng.openPack(st), st.name, 1) } catch (e) {}
      for (const product of st.products.slice(0, 3)) {
        try { g.buySealed(st, product, product.price ?? 5) } catch (e) {}
      }
    }
    // "Personal" is not a place field — it means locked:true (StoreStock.jsx:164). Cards arrive
    // locked, sealed does not, so without this every sealed surface renders the "No sealed
    // keepsakes" empty state and the whole sealed wing looks like a broken selector. Lock half of
    // it: the Personal tab gets keepsakes AND the Storeroom keeps sellable backstock, so both
    // screens have something on them.
    useGame.setState(st => ({
      sealedInventory: (st.sealedInventory || []).map((it, i) => i % 2 === 0 ? { ...it, locked: true } : it),
    }))
    await new Promise(r => setTimeout(r, 900))
    const now = useGame.getState()
    const sealed = now.sealedInventory || []
    return (now.collection || []).length + ' cards, ' + sealed.length + ' sealed ('
      + sealed.filter(i => i.locked).length + ' personal)'
  `,
}

// ---------------------------------------------------------------------------------------------
// THE AUDITS. Everything a screenshot cannot tell you, measured per surface.
//
// Each one exists because this app has already shipped that exact fault at least once. Where an
// audit overlaps scenarios.mjs AUDIT the logic is the same on purpose — notably tap targets are
// HIT TESTED rather than read off getBoundingClientRect, because the house pattern for a small
// control is "extend the TARGET, never the PAINT" via an absolutely positioned pseudo-element.
// Measuring the box alone reports the 15pt "?" button as tiny when its real target is 44pt.
export const AUDIT = `
  const D = ${JSON.stringify(DEVICE)}
  const out = { tap: [], island: [], home: [], zoom: [], covered: [], hover: [], clipped: [], divtap: [], overflow: 0, measured: 0, press: 0 }

  const vis = (e) => {
    const cs = getComputedStyle(e)
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false
    const r = e.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight
  }
  const name = (e) => {
    const t = (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().replace(/\\s+/g, ' ')
    return (t.slice(0, 34) || e.tagName) + (e.className ? ' .' + String(e.className).split(' ')[0] : '')
  }

  // :active rules, collected once. A control the stylesheet gives no :active rule gives the finger
  // NOTHING on press, because the tap highlight is suppressed app-wide (styles.css:103). No
  // screenshot can show the absence of a press state.
  const activeRules = [...document.styleSheets]
    .flatMap(s => { try { return [...s.cssRules] } catch { return [] } })
    .filter(r => r.selectorText && /:active/.test(r.selectorText))
  const answersPress = (e) => activeRules.some(r => {
    try { return e.matches(r.selectorText.replace(/:active/g, '')) } catch { return false }
  })

  const CONTROLS = 'button, a, [role=button], input, select, textarea, summary'
  const modalOpen = !!document.querySelector('.modalbg, [role=dialog], [role=alertdialog], .rip-overlay')

  /// Which controls are HELD at the bottom of the screen, rather than merely scrolled to where
  /// they happen to be right now?
  ///
  /// Asking the stylesheet is not enough. The bottom nav is the single most important element
  /// this question is about, and it is NOT position:fixed — at <=640px the shell locks .app to
  /// the viewport and scrolls .content instead (styles.css:1689-1694), which leaves the nav as an
  /// ordinary flex footer that never moves. A position:fixed|sticky test misses it completely.
  ///
  /// So measure it: scroll the container and see what stays put. That catches both mechanisms and
  /// cannot drift when the layout technique changes. If the scroller will not move (a short
  /// screen), the answer is unknowable this way, so fall back to the stylesheet test rather than
  /// declaring every control on the screen pinned.
  const controls = [...document.querySelectorAll(CONTROLS)].filter(vis)
  // Scroll the container the CONTENT is actually in. With a dialog open the page behind it still
  // scrolls, so scrolling .content moves nothing inside the dialog — and every control in the
  // dialog is then misread as pinned, which reports a button scrolled off the bottom of a long
  // modal as a control parked in the home-indicator band.
  const scroller = (modalOpen && document.querySelector('.modal, .rip-overlay'))
    || document.querySelector('.app > .content') || document.scrollingElement
  const pinnedSet = new Set()
  {
    const before = new Map(controls.map(e => [e, e.getBoundingClientRect().top]))
    const y0 = scroller.scrollTop
    scroller.scrollTop = y0 + 160
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    if (Math.abs(scroller.scrollTop - y0) > 4) {
      for (const e of controls) {
        if (Math.abs(e.getBoundingClientRect().top - before.get(e)) < 1) pinnedSet.add(e)
      }
      scroller.scrollTop = y0
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    } else {
      for (const e of controls) {
        for (let p = e; p && p !== document.body; p = p.parentElement) {
          const pos = getComputedStyle(p).position
          if (pos === 'fixed' || pos === 'sticky') { pinnedSet.add(e); break }
        }
      }
    }
  }
  const pinned = (e) => pinnedSet.has(e)

  for (const e of controls) {
    // Everything behind an open dialog is INERT — it cannot be tapped, cannot be zoomed into, and
    // cannot be occluded any further. Measuring it produces findings that are true of the page but
    // false of the screen: the "?" beside the reputation star carries a 44pt pseudo-target
    // (styles.css:2666), and hit-testing it through a modal backdrop reports it as a 15px control
    // on every surface that happens to have a dialog open.
    if (modalOpen && !e.closest('.modalbg, [role=dialog], [role=alertdialog], .rip-overlay')) continue
    const r = e.getBoundingClientRect()
    out.measured++
    if (answersPress(e)) out.press++

    // --- tap target, by hit testing rather than the painted box ---
    const cx = Math.min(innerWidth - 1, Math.max(1, r.left + r.width / 2))
    let top = r.top, bot = r.bottom
    for (let y = r.top; y > r.top - 48; y--) { if (!e.contains(document.elementFromPoint(cx, y))) break; top = y }
    for (let y = r.bottom; y < r.bottom + 48; y++) { if (!e.contains(document.elementFromPoint(cx, y))) break; bot = y }
    // Measure the box with offsetHeight, NOT the client rect.
    //
    // getBoundingClientRect() includes transforms, and this app's whole press layer is transforms
    // — .bnav-btn:active sets transform: scale(.95) (styles.css:1810) and it is not alone. Auditing
    // after a tap therefore measures a control mid-press and reports 44px as 43px, which reads as
    // a one-pixel regression against the PRIMARY NAVIGATION on every screen the sweep touched.
    // That is a false finding of the worst kind: plausible, repeatable, and completely wrong.
    // offsetHeight is the layout box and ignores the animation.
    //
    // The hit area can never be smaller than the box, so floor it there too.
    // A checkbox or radio wrapped in a <label> is not a 20px target: the label carries the click,
    // so the real target is the label's box, which is usually a full row of text. Measuring the
    // input alone reports a control as tiny when a finger cannot miss it.
    const labelled = /^(checkbox|radio)$/.test(e.getAttribute('type') || '') ? e.closest('label') : null
    const boxH = labelled ? labelled.offsetHeight : (e.offsetHeight || r.height)
    const boxW = labelled ? labelled.offsetWidth : (e.offsetWidth || r.width)
    // Also read the extend-the-target pseudo directly. The house pattern for a control that must
    // stay small is a transparent absolutely-positioned ::after larger than the button
    // (.noto-help, .linkbtn, .booth-star). Hit-testing finds it, but only to the nearest whole
    // pixel, so a 44px pseudo on a fractionally-positioned box measures 43 and reports a control
    // that was deliberately fixed as still broken. scripts/verify-ui.mjs reads the pseudo for the
    // same reason; take whichever is larger.
    let pseudoH = 0
    for (const which of ['::before', '::after']) {
      const cs = getComputedStyle(e, which)
      if (cs.content === 'none' || cs.position !== 'absolute') continue
      const ph = parseFloat(cs.height)
      if (isFinite(ph)) pseudoH = Math.max(pseudoH, ph)
    }
    const hitH = Math.max(bot - top, boxH, pseudoH)
    if (hitH < 43.5) out.tap.push({ el: name(e), h: Math.round(hitH), box: Math.round(boxH), w: Math.round(boxW) })

    // --- safe-area bands. Reported SEPARATELY: a control under the Dynamic Island is a layout
    // bug, a control in the home-indicator strip is a fight with the system swipe-up gesture,
    // which is worse and needs a different fix.
    //
    // ONLY pinned elements count. At <=640px the shell locks the body and scrolls .content
    // (styles.css:1689), so on any long screen SOME row is always sitting in the bottom 34pt —
    // that is a scroll position, not a design defect, and counting it buries the real finding
    // under one false positive per screen. A fixed or sticky control sits there permanently and
    // fights the system swipe-up every time. ---
    if (pinned(e)) {
      if (r.top < D.islandInset) out.island.push({ el: name(e), top: Math.round(r.top) })
      if (r.bottom > innerHeight - D.homeInset) out.home.push({ el: name(e), bottom: Math.round(innerHeight - r.bottom) })
    }

    // --- iOS focus zoom. Safari zooms the page when a focused field is under 16px. The guard at
    // styles.css:1900 uses TYPE selectors (specificity 0-0-1), so any class-based rule on the same
    // element beats it regardless of source order, and an inline style always does. ---
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName)) {
      const t = (e.getAttribute('type') || 'text').toLowerCase()
      if (!['checkbox', 'radio', 'range', 'button', 'submit', 'hidden', 'color'].includes(t)) {
        const fs = parseFloat(getComputedStyle(e).fontSize)
        if (fs < 16) out.zoom.push({ el: name(e), fs, inline: !!e.style.fontSize })
      }
    }

    // --- covered by a fixed/sticky element. This is the .bulk-bar and .modal-close fault class
    // from commit 2a53923: the control still paints, still passes every size check, and simply
    // does not receive the tap.
    //
    // Controls BEHIND an open dialog are skipped. A modal covering the page is the entire job of a
    // modal, and counting it turns every dialog surface into twenty findings that say nothing —
    // which buries the one real overlap that might also be on screen. ---
    const cy = Math.min(innerHeight - 1, Math.max(1, r.top + r.height / 2))
    const hitEl = document.elementFromPoint(cx, cy)
    if (hitEl && !e.contains(hitEl) && hitEl !== e) {
      // FIXED blockers only. A sticky blocker is a scroll position, not a defect: .topbar is
      // position:sticky (styles.css:224), so on any long screen something is always under it, and
      // scrolling one notch frees the control. A fixed blocker occludes no matter where you
      // scroll, which is the difference between an annoyance and an untappable button.
      //
      // The repo already settled this distinction: commit 2a53923 fixed .bulk-bar by changing it
      // from fixed to STICKY, precisely because sticky reserves its own space and stops eating the
      // taps underneath it. Flagging sticky here would re-report that fix as the bug it cured.
      let p = hitEl, blocker = null
      while (p && p !== document.body) {
        if (getComputedStyle(p).position === 'fixed') { blocker = p; break }
        p = p.parentElement
      }
      if (blocker && !blocker.contains(e)) out.covered.push({ el: name(e), by: name(blocker) })
    }
  }

  // --- tappable elements that are not controls. A div with cursor:pointer and a click handler
  // takes taps, but it is not focusable, gets no :active rule by class, and is missed by the
  // (pointer: coarse) 44px floor at styles.css:378 — that rule names specific classes plus
  // [role=button], so a bare div escapes all three. .market-head (AuctionHouse.jsx:134) is one.
  // Reported separately from tap targets because the fix is different: give it button semantics
  // rather than more padding.
  for (const e of document.querySelectorAll('*')) {
    if (!vis(e)) continue
    if (e.matches(CONTROLS) || e.closest(CONTROLS)) continue
    if (getComputedStyle(e).cursor !== 'pointer') continue
    if (e.hasAttribute('tabindex') || e.getAttribute('role') === 'button') continue
    // A <label> wrapping its own control is not a div pretending to be a button. It is the
    // correct markup: clicking it activates the control, and the control carries the tab stop.
    if (e.tagName === 'LABEL' && e.querySelector('input, select, textarea')) continue
    // Report the OUTERMOST one only. The cursor property inherits, so one clickable card tile
    // hands back its shine layer, label, brand, grade, cert line, window, image and price as
    // separate findings — ten lines describing a single missing role of button.
    if (e.parentElement && getComputedStyle(e.parentElement).cursor === 'pointer'
        && !e.parentElement.matches(CONTROLS)) continue
    const r = e.getBoundingClientRect()
    out.divtap.push({ el: name(e), h: Math.round(r.height) })
  }

  // --- hover-only content. A title= tooltip cannot be reached by a finger at all. There are 265
  // of them in src/, and exactly one (hover: none) guard in the stylesheet (styles.css:2407),
  // which only adjusts padding. src/ui/Explain.jsx is the tap-friendly pattern that already
  // exists: a "?" that paints 15px and taps 44px. ---
  for (const e of document.querySelectorAll('[title]')) {
    if (!vis(e)) continue
    const t = e.getAttribute('title')
    if (!t) continue
    const visibleText = e.textContent.trim().replace(/\s+/g, ' ')
    // Two cases actually cost a player something. A short tooltip on a control that already says
    // what it does in visible text costs nothing, and flagging those buries the ones that matter.
    const iconOnly = visibleText.replace(/[\p{Extended_Pictographic}\u200d\ufe0f\s]/gu, '').length < 3
    // The Explain / NotorietyHelp "?" trigger is not hover-only content: tapping it opens the
    // popover, and its title merely repeats the aria-label it already exposes. Flagging it says
    // the one control built FOR touch discoverability is the problem.
    if (e.getAttribute('aria-label') === t && e.hasAttribute('aria-expanded')) continue
    if (!iconOnly && t.length < 40) continue
    out.hover.push({ el: name(e), chars: t.length, why: iconOnly ? 'icon-only control' : 'explanatory text' })
  }

  // --- text clipped by its own box. Silent damage: the layout does not break, a word just
  // disappears off the edge. Deliberate truncation is excluded — this app ellipsises set and
  // vendor names on purpose. ---
  for (const e of document.querySelectorAll('*')) {
    if (e.children.length || !e.textContent.trim()) continue
    if (e.closest('.sr-only')) continue        // a 1px clipped box BY DESIGN
    const cs = getComputedStyle(e)
    if (cs.textOverflow === 'ellipsis') continue
    if (cs.overflow === 'visible' && cs.overflowX === 'visible') continue
    if (!e.getClientRects().length) continue
    const over = e.scrollWidth - e.clientWidth
    if (over > 2) out.clipped.push({ el: name(e), over })
  }

  // Is this still a PHONE? Device emulation can degrade mid-run, and when it does the page keeps
  // rendering happily at 440x956 while (pointer: coarse) stops matching — which switches the whole
  // tap-target layer at styles.css:378 from the 44px thumb floor to no floor at all. Every
  // subsequent surface then reports desktop numbers under a phone heading. Carry the media-query
  // state in the result so the driver can refuse to publish a run that stopped being a phone.
  out.emulation = {
    coarse: matchMedia('(pointer: coarse)').matches,
    hoverNone: matchMedia('(hover: none)').matches,
    touch: 'ontouchstart' in window,
    dpr: devicePixelRatio,
  }
  out.vw = innerWidth; out.vh = innerHeight
  out.overflow = Math.max(0, document.documentElement.scrollWidth - innerWidth)
  out.scrollH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
  return out
`

// ---------------------------------------------------------------------------------------------
// Step vocabulary, executed by sweep.mjs:
//
//   { bnav: 'Buy' }        tap a bottom-nav button by its label
//   { subtab: '📦 Sealed' }  tap a .subtab whose text contains this (nth container via `group`)
//   { tap: 'css' }         real touchscreen tap on the first VISIBLE match
//   { tapText: ['css','t'] }  tap the first visible match whose text contains t
//   { patch: 'js body' }   evaluate in the page (setState, force a state, etc.)
//   { drag: 'css' }        pointer-capture drag down the element — the rip gesture
//   { key: 'Escape' }      press a key
//   { wait: 800 }          settle
//
// `probe` is the contract that the surface was actually REACHED. A surface whose probe never
// appears is reported as unreached and named in the report — it is never silently skipped, because
// a missing screenshot reads as "clean" to every human who scans a contact sheet.
const T = (id, name, seed, probe, steps, note) => ({ id, name, seed, probe, steps, note })

export const SURFACES = [
  // ---- boot / chrome -------------------------------------------------------------------------
  T('boot-fresh', 'Boot — fresh save', 'fresh', '.topbar', []),
  T('nav-bottom', 'Bottom nav (home-indicator band)', 'loaded', '.bottomnav', []),

  // ---- Buy -----------------------------------------------------------------------------------
  T('buy-sealed-fresh', 'Buy › Sealed (day one, locked distributors)', 'fresh', '.distrib-picker',
    [{ bnav: 'Buy' }, { subtab: '📦 Sealed' }]),
  T('buy-firstrun', 'Buy › FirstRun checklist', 'fresh', '.firstrun-steps',
    [{ bnav: 'Buy' }, { subtab: '📦 Sealed' }]),
  T('buy-sealed-loaded', 'Buy › Sealed (all distributors open)', 'loaded', '.distrib-picker',
    [{ bnav: 'Buy' }, { subtab: '📦 Sealed' }]),
  T('buy-dist-lgs', 'Buy › Local Game Store', 'loaded', '.distrib-picker',
    [{ bnav: 'Buy' }, { subtab: '📦 Sealed' }, { tapText: ['.distrib-picker button', 'Local Game'] }]),
  T('buy-dist-market', 'Buy › Local Marketplace', 'loaded', '.mk-row, .empty',
    [{ bnav: 'Buy' }, { subtab: '📦 Sealed' }, { tapText: ['.distrib-picker button', 'Marketplace'] }]),
  T('buy-dist-tcg', 'Buy › TCGplayer', 'loaded', '.distrib-picker',
    [{ bnav: 'Buy' }, { subtab: '📦 Sealed' }, { tapText: ['.distrib-picker button', 'TCG'] }]),
  T('buy-dist-amazon', 'Buy › Amazon', 'loaded', '.distrib-picker',
    [{ bnav: 'Buy' }, { subtab: '📦 Sealed' }, { tapText: ['.distrib-picker button', 'Amazon'] }]),
  T('buy-dist-dna', 'Buy › Dave & Adam’s (rank 3 gate)', 'loaded', '.distrib-picker',
    [{ bnav: 'Buy' }, { subtab: '📦 Sealed' }, { tapText: ['.distrib-picker button', 'Adam'] }]),
  T('buy-dist-japan', 'Buy › Japan Direct (import licence gate)', 'loaded', '.distrib-picker',
    [{ bnav: 'Buy' }, { subtab: '📦 Sealed' }, { tapText: ['.distrib-picker button', 'Japan'] }]),
  T('buy-dist-locked', 'Buy › Locked distributor', 'fresh', '.distrib-picker',
    [{ bnav: 'Buy' }, { subtab: '📦 Sealed' }, { tapText: ['.distrib-picker button', 'Japan'] }]),
  // The panel header is a clickable DIV (.market-head, AuctionHouse.jsx:134), not a button — which
  // is why a .collapse-btn selector never found it, and is itself reported by the tappable-div audit.
  T('buy-auction', 'Buy › Auction house', 'loaded', '.lot-row, .market-panel',
    [{ bnav: 'Buy' }, { subtab: '📦 Sealed' }, { tapText: ['.market-head', 'Auction'] }]),
  T('buy-market', 'Buy › Marketplace (singles)', 'loaded', '.market-grid, .empty',
    [{ bnav: 'Buy' }, { subtab: '🛍️ Marketplace' }]),
  T('buy-market-search', 'Buy › Marketplace with search focused', 'loaded', '.search',
    [{ bnav: 'Buy' }, { subtab: '🛍️ Marketplace' }, { focus: '.search' }]),
  T('buy-reprint', 'Buy › Reprint-wave banner', 'loaded', '.distrib-picker',
    [{ bnav: 'Buy' }, { subtab: '📦 Sealed' }]),

  // ---- Store (BoothInbox) --------------------------------------------------------------------
  T('store-orders-fresh', 'Store › Orders (no storefront)', 'fresh', '.subtabs',
    [{ bnav: 'Sell' }, { subtab: '📨 Orders' }]),
  T('store-orders', 'Store › Orders', 'loaded', '.subtabs',
    [{ bnav: 'Sell' }, { subtab: '📨 Orders' }]),
  T('store-floor', 'Store › Floor', 'loaded', '.subtabs',
    [{ bnav: 'Sell' }, { subtab: '🛒 Floor' }]),
  T('store-storeroom', 'Store › Storeroom', 'loaded', '.subtabs',
    [{ bnav: 'Sell' }, { subtab: '📦 Storeroom' }]),
  T('store-regulars', 'Store › Regulars', 'loaded', '.subtabs',
    [{ bnav: 'Sell' }, { subtab: '🤝 Regulars' }]),
  T('store-packs', 'Store › Mystery packs', 'loaded', '.subtabs',
    [{ bnav: 'Sell' }, { subtab: '❓ Packs' }]),
  T('store-packbuilder', 'Store › Pack builder', 'loaded', '.modal, .subtabs',
    [{ bnav: 'Sell' }, { subtab: '❓ Packs' }, { tapText: ['button', 'Build'] }]),
  T('store-machine', 'Store › Pack machine', 'loaded', '.subtabs',
    [{ bnav: 'Sell' }, { subtab: '🎰 Machine' }]),
  T('store-forum', 'Store › Forum', 'loaded', '.subtabs',
    [{ bnav: 'Sell' }, { subtab: '📋 Forum' }]),
  T('store-market', 'Store › On the market', 'loaded', '.subtabs',
    [{ bnav: 'Sell' }, { subtab: '🌐 On the market' }]),
  // 🗣️ The store quote walk-up. Seeded rather than waited for: it is a share of walk-in footfall,
  // so waiting on the dice would make the sweep flaky. venue:'store' is the whole point of the
  // surface — it decides the wording and where a credit deal shops from.
  T('store-quote', 'Store › Orders › Quote walk-up', 'stocked', '.modal',
    [{ patch: `
        const { useGame, store } = window.__PV__
        const mod = await import('/src/game/shows.js')
        const q = mod.makeQuoteRequest(90, null, { band: [1, 40], venue: 'store' })
        useGame.setState({ boothInbox: [{ ...q, id: 9001, channel: 'walkin' }] })
      ` },
     { bnav: 'Sell' }, { subtab: '📨 Orders' }, { tapText: ['.product', 'wants a price'] }]),
  T('store-bulkbin', 'Store › Floor › Bulk bin', 'loaded', '.subtabs',
    [{ bnav: 'Sell' }, { subtab: '🛒 Floor' }, { tapText: ['.collapse-btn', 'Bulk'] }]),
  T('store-rivalry', 'Store › Floor › Town rivalry', 'loaded', '.subtabs',
    [{ bnav: 'Sell' }, { subtab: '🛒 Floor' }, { tapText: ['.collapse-btn', 'ival'] }]),

  // ---- Stream ---------------------------------------------------------------------------------
  T('stream-locked', 'Stream › Locked (no streaming upgrade)', 'fresh', '.empty, .pane',
    [{ bnav: 'Stream' }]),
  T('stream-setup', 'Stream › Setup', 'loaded', '.pane',
    [{ bnav: 'Stream' }]),
  T('stream-socials', 'Stream › Socials panel', 'loaded', '.pane',
    [{ bnav: 'Stream' }]),
  T('stream-live', 'Stream › Live stage', 'loaded', '.pane',
    [{ bnav: 'Stream' }, { tapText: ['button', 'Go live'] }, { wait: 1500 }]),
  T('stream-navlock', 'Stream › Nav locked while live', 'loaded', '.bottomnav',
    [{ bnav: 'Stream' }, { tapText: ['button', 'Go live'] }, { wait: 1500 }, { bnav: 'Buy' }]),

  // ---- Shows -----------------------------------------------------------------------------------
  T('shows-fresh', 'Shows › Calendar (rank 0)', 'fresh', '.calgrid, .pane',
    [{ bnav: 'Shows' }]),
  T('shows-loaded', 'Shows › Calendar (all tiers open)', 'loaded', '.calgrid, .pane',
    [{ bnav: 'Shows' }]),
  T('shows-tierlegend', 'Shows › Tier legend (h-scroller)', 'loaded', '.tierlegend',
    [{ bnav: 'Shows' }]),
  // Only rendered for a show within DM_WINDOW = 4 days (Calendar.jsx:109), so this can legitimately
  // find nothing when the generated calendar has no near show. Matching on "going" rather than the
  // full label keeps the typographic apostrophe in "Who's going?" out of the comparison.
  T('shows-dms', 'Shows › Show DMs', 'loaded', '.modal',
    [{ bnav: 'Shows' }, { tapText: ['button', 'going'] }]),
  T('show-prep', 'Show prep (full-screen takeover)', 'loaded', '.prep-choice-group, .pane',
    [{ bnav: 'Shows' }, { tapText: ['button', 'Attend'] }, { wait: 1200 }]),
  T('show-floor', 'Show floor (full-screen takeover)', 'loaded', '.floorwrap',
    [{ bnav: 'Shows' }, { tapText: ['button', 'Attend'] }, { wait: 1200 },
     { tapText: ['button', 'Enter'] }, { wait: 1500 }]),
  T('show-booth', 'Show floor › Vendor booth', 'loaded', '.modal',
    [{ bnav: 'Shows' }, { tapText: ['button', 'Attend'] }, { wait: 1200 },
     { tapText: ['button', 'Enter'] }, { wait: 1500 }, { tap: '.vdir-card, .booth-card, .vdir-row' }]),
  T('show-haul', 'Show floor › Haul panel', 'loaded', '.floorwrap',
    [{ bnav: 'Shows' }, { tapText: ['button', 'Attend'] }, { wait: 1200 },
     { tapText: ['button', 'Enter'] }, { wait: 1500 }, { tapText: ['button', 'Haul'] }]),

  // ---- Stats -----------------------------------------------------------------------------------
  T('stats', 'Stats', 'loaded', '.pane', [{ bnav: 'Stats' }, { subtab: '📊 Stats' }]),
  T('stats-fresh', 'Stats (day one)', 'fresh', '.pane', [{ bnav: 'Stats' }, { subtab: '📊 Stats' }]),
  T('stats-branding', 'Stats › Store branding editor', 'loaded', '.store-branding-field, .pane',
    [{ bnav: 'Stats' }, { subtab: '📊 Stats' }, { tapText: ['.collapse-btn', 'rand'] }]),
  T('stats-books', 'Stats › Books', 'loaded', '.pane', [{ bnav: 'Stats' }, { subtab: '🧾 Books' }]),
  T('stats-books-debt', 'Stats › Books with a loan owing', 'loaded', '.pane',
    [{ patch: `window.__PV__.useGame.setState({ books: { ...(window.__PV__.store().books || {}), owed: 4200 } })` },
     { bnav: 'Stats' }, { subtab: '🧾 Books' }]),

  // ---- Inventory --------------------------------------------------------------------------------
  T('inv-cards-fresh', 'Inventory › All (no storefront)', 'fresh', '.pane',
    [{ bnav: 'Inventory' }, { subtab: '🗂️' }]),
  T('inv-cards', 'Inventory › Personal cards', 'loaded', '.pane',
    [{ bnav: 'Inventory' }, { subtab: '🗂️' }]),
  T('inv-sealed', 'Inventory › Sealed', 'loaded', '.pane',
    [{ bnav: 'Inventory' }, { subtab: '📦 Sealed' }]),
  T('inv-binder', 'Inventory › Binder', 'loaded', '.pane',
    [{ bnav: 'Inventory' }, { subtab: '📒 Binder' }]),
  T('inv-grader', 'Inventory › Grader bench', 'loaded', '.pane',
    [{ bnav: 'Inventory' }, { subtab: '🔬 Grader' }]),
  T('inv-regulars', 'Inventory › Regulars (inverse gate, no storefront)', 'fresh', '.pane',
    [{ bnav: 'Inventory' }, { subtab: '🤝 Regulars' }]),
  T('inv-prices', 'Inventory › Price guide', 'loaded', '.pane',
    [{ bnav: 'Inventory' }, { subtab: '🏷️ Prices' }]),

  // ---- Settings ----------------------------------------------------------------------------------
  T('settings', 'Settings', 'loaded', '.pane', [{ bnav: 'More' }, { subtab: '⚙️ Settings' }]),
  T('settings-account', 'Settings › Account (sign-in form)', 'loaded', 'input',
    [{ bnav: 'More' }, { subtab: '⚙️ Settings' }, { tapText: ['.collapse-btn', 'ccount'] }]),
  T('settings-reset-confirm', 'Settings › Reset confirm dialog', 'loaded', '[role=alertdialog]',
    [{ bnav: 'More' }, { subtab: '⚙️ Settings' }, { tapText: ['button', 'Reset save'] }]),
  T('upgrades', 'Settings › Upgrade shop', 'loaded', '.pane',
    [{ bnav: 'More' }, { subtab: '⬆️ Upgrades' }]),
  T('upgrades-fresh', 'Settings › Upgrade shop (nothing affordable)', 'fresh', '.pane',
    [{ bnav: 'More' }, { subtab: '⬆️ Upgrades' }]),

  // ---- Modals & overlays ---------------------------------------------------------------------------
  // With a storefront owned, Inventory renders StoreStock rather than Collection, so the row is a
  // .stock-line and the thing that opens the detail is .tl-info (StoreStock.jsx:569) — not a card
  // grid cell. The rip and floor buttons are .stock-act and their labels are bare emoji, so they
  // have to be matched on title= rather than on text.
  T('modal-card', 'Card detail modal', 'stocked', '.modal',
    [{ bnav: 'Inventory' }, { subtab: '🗂️' }, { tap: '.tl-info' }]),
  T('modal-sealed', 'Sealed detail modal', 'stocked', '.modal',
    [{ bnav: 'Inventory' }, { subtab: '📦 Sealed' }, { tap: '.tl-info' }]),
  // Toasts earn a surface of their own: .toast-stack is fixed to the bottom of the screen, the
  // same band the home indicator owns, and it paints OVER the rows underneath it. Triggered by a
  // real action rather than forced, so the stack sits exactly where a player would see it.
  T('modal-toast', 'Toast stack', 'stocked', '.toast',
    [{ bnav: 'Inventory' }, { subtab: '📦 Sealed' }, { tap: '.stock-act[title*="sales floor"]' }]),
  T('overlay-rip', 'Pack rip overlay', 'stocked', '.rip-overlay',
    [{ bnav: 'Inventory' }, { subtab: '📦 Sealed' }, { tap: '.stock-act[title*="Rip"]' }, { wait: 3000 }]),
  // Sift is a three-step flow in StoreStock (StoreStock.jsx:461): enter select mode, pick sealed,
  // then the gold Sift-rip button appears with a pack count.
  T('overlay-sift', 'Sift / AutoRip overlay', 'stocked', '.rip-overlay, .modal',
    [{ bnav: 'Inventory' }, { subtab: '📦 Sealed' }, { tapText: ['button', 'Select'] },
     { tap: '.stock-line' }, { tapText: ['button', 'Sift-rip'] }, { wait: 2500 }]),
  T('day-summary', 'Day summary recap', 'loaded', '.modal',
    [{ tapText: ['button', 'Next Day'] }, { wait: 2500 }]),
  T('game-over', 'Game over', 'loaded', '.modal',
    [{ patch: `window.__PV__.useGame.setState({ gameOver: true })` }, { wait: 600 }]),
]

/// Which seeds are actually used, in the order the driver should run them.
export const SEED_ORDER = [...new Set(SURFACES.map(s => s.seed))]
