// Screen scenarios + the feel audit — the ONE source of truth for both dev loops.
//
//   tools/ios/web.mjs    runs these in Playwright at iPhone metrics (~30s, no Xcode)
//   tools/ios/shell.mjs  posts the SAME strings to the DevBridge in ios/Sources/Shell.swift,
//                        which runs them inside the real WKWebView on a booted simulator
//
// One definition, two engines, so a difference between the two sets of results is a difference
// in the ENGINE and never in the setup. That distinction has already paid for itself once: the
// simulator renders every emoji as a "?" box, and running the same page through browser WebKit
// is what proved that was a missing font in the runtime rather than a bug in the app.
//
// Every scenario is a FUNCTION BODY, not an expression. Both drivers wrap it in an async
// function, so `return` works in both and `await` works in both. Keep it that way.
//
// The bodies reach game state through `window.__PV__`, which main.jsx exposes only when
// VITE_TEST_SEAM is set. They must NOT import modules: that works through Vite's dev server and
// fails inside the shell, which runs a production bundle with no module graph — and worse, an
// `import('/src/game/store')` there hands back a SECOND, unhydrated store that reports every
// value as its initial state instead of erroring.

/// The device this project targets. Playwright's own `iPhone 17 Pro Max` descriptor reports a
/// 763pt viewport because it subtracts Safari's chrome; the native shell is edge-to-edge and
/// gets the full 956, so measuring at the descriptor's height silently tests a shorter screen
/// than the app ever has.
export const DEVICE = {
  name: 'iPhone 17 Pro Max',
  width: 440,
  height: 956,
  islandInset: 62,   // Dynamic Island
  homeInset: 34,     // home indicator / system swipe-up strip
}

/// Put the app in a known state: a fresh save, generous cash so no screen is gated on money.
export const RESET = `
  const g = window.__PV__.store()
  localStorage.clear()
  window.__PV__.useGame.setState({ cash: 250000, notoriety: 320 })
  await window.__PV__.flush()
  return 'reset'
`

/// Screens worth measuring. `tab` clicks the bottom-nav button whose label matches.
export const SCREENS = [
  { name: 'buy', tab: 'Buy' },
  { name: 'store', tab: 'Store' },
  { name: 'stream', tab: 'Stream' },
  { name: 'shows', tab: 'Shows' },
  { name: 'stats', tab: 'Stats' },
  { name: 'inventory', tab: 'Invento' },
]

/// Click a bottom-nav tab and let React settle.
export const gotoScreen = (label) => `
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith(${JSON.stringify(label)})
    || new RegExp(${JSON.stringify(label)}, 'i').test(x.textContent))
  if (b) b.click()
  await new Promise(r => setTimeout(r, 700))
  return b ? b.textContent.trim().slice(0, 20) : null
`

/// THE AUDIT. Everything a screenshot cannot tell you.
///
/// Four measurements, each of which has caught something real in this app:
///   • overflow      — anything but 0 means the page scrolls sideways.
///   • under44       — Apple's minimum target, by HIT TESTING rather than the bounding box. The
///                     box is what a control PAINTS; the target is what the finger GETS, and a
///                     pseudo-element may legitimately extend one past the other (that is how
///                     the 15pt "?" button became a 44pt target without changing its look).
///   • press         — controls a `:active` rule answers. The tap highlight is suppressed
///                     app-wide, so a control without one gives the finger NOTHING, and no
///                     screenshot can show its absence.
///   • island/home   — controls inside the 62pt Dynamic Island or the 34pt home-indicator band.
///                     Reported SEPARATELY on purpose: the first is a layout bug, the second is
///                     a gesture conflict with the system swipe-up, which is worse and needs a
///                     different fix.
///
/// Controls scrolled off-screen are skipped rather than counted — a scroll position is not a
/// design defect, and counting them makes the home-indicator number meaningless.
export const AUDIT = `
  const D = ${JSON.stringify(DEVICE)}
  const rules = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules] } catch { return [] } })
    .filter(r => r.selectorText && /:active/.test(r.selectorText))
  const answersPress = (e) => rules.some(r => {
    try { return e.matches(r.selectorText.replace(/:active/g, '')) } catch { return false }
  })
  let measured = 0, under = 0, press = 0, island = 0, home = 0
  const smalls = []
  for (const e of document.querySelectorAll('button, a, [role=button], input, select, summary')) {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e)
    if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue
    if (r.bottom <= 0 || r.top >= innerHeight) continue
    measured++
    const cx = r.left + r.width / 2
    let top = r.top, bot = r.bottom
    for (let y = r.top; y > r.top - 48; y--) { if (!e.contains(document.elementFromPoint(cx, y))) break; top = y }
    for (let y = r.bottom; y < r.bottom + 48; y++) { if (!e.contains(document.elementFromPoint(cx, y))) break; bot = y }
    const hit = Math.round(bot - top)
    if (hit < 44) { under++; if (smalls.length < 8) smalls.push(hit + 'pt ' + String(e.className || e.tagName).slice(0, 34)) }
    if (r.top < D.islandInset) island++
    if (r.bottom > innerHeight - D.homeInset) home++
    if (answersPress(e)) press++
  }
  return {
    overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    measured, under, press, island, home, smalls,
    viewport: innerWidth + 'x' + innerHeight,
  }
`

/// Shared reporting so both drivers print the same table and agree on what passes.
export function header(engine) {
  return `\n${engine} — ${DEVICE.name} ${DEVICE.width}x${DEVICE.height}, island ${DEVICE.islandInset}pt, home ${DEVICE.homeInset}pt\n\n`
    + 'screen        overflow  under-44pt   press        island  home\n'
    + '-'.repeat(66)
}

export function row(name, r) {
  return `${name.padEnd(13)} ${(r.overflow + 'px').padEnd(9)} ${(r.under + '/' + r.measured).padEnd(12)} `
    + `${(r.press + '/' + r.measured).padEnd(12)} ${String(r.island).padEnd(7)} ${r.home}`
}

/// Exit non-zero on a real regression so this can gate a build if you ever want it to.
/// `home` is NOT a failure in the browser: the bottom nav deliberately keeps its compromise
/// there and only the shell takes the inset back, so only the shell driver asserts on it.
export function verdict(totals, { assertHome }) {
  const fails = []
  if (totals.overflow > 0) fails.push(`horizontal overflow on ${totals.overflowScreens} screen(s)`)
  if (totals.under > 0) fails.push(`${totals.under} control(s) under 44pt`)
  if (totals.press < totals.measured) fails.push(`${totals.measured - totals.press} control(s) with no press feedback`)
  if (assertHome && totals.home > 0) fails.push(`${totals.home} control(s) in the home-indicator band`)
  return fails
}
