// npm run ios:web — the fast feel audit.
//
// Runs the shared scenarios in Playwright at iPhone 17 Pro Max metrics. ~30 seconds, no Xcode,
// no simulator. Answers layout, tap-target size and press coverage. It does NOT answer origin,
// zoom lock, bounce, safe-area insets or the bridges — those need the real WKWebView, which is
// what `npm run ios:sim` is for.
//
// Boots its own dev server with VITE_TEST_SEAM=1, because the scenarios reach game state through
// window.__PV__ and a normal build does not expose it.
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { DEVICE, RESET, SCREENS, gotoScreen, AUDIT, header, row, verdict } from './scenarios.mjs'

const PORT = 5183
const wrap = (body) => `(async () => { ${body} })()`

// WebKit is the engine the phone actually runs, so prefer it — but it is a separate Playwright
// download and its absence should degrade rather than fail. Chromium at the same metrics still
// catches every layout and tap-target problem; say which one ran so a surprising result can be
// attributed correctly.
async function pickEngine() {
  try { const b = await webkit.launch(); await b.close(); return { engine: webkit, label: 'Playwright WebKit' } }
  catch { return { engine: chromium, label: 'Playwright Chromium (webkit not installed — run `npx playwright install webkit`)' } }
}

const server = spawn('npx', ['vite', '--port', String(PORT)], {
  env: { ...process.env, VITE_TEST_SEAM: '1' }, stdio: 'ignore', detached: false,
})
const stop = () => { try { server.kill() } catch {} }
process.on('exit', stop); process.on('SIGINT', () => { stop(); process.exit(130) })

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://localhost:${PORT}/`); if (r.ok) return true } catch {}
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

if (!await waitForServer()) { console.error('dev server never came up'); stop(); process.exit(1) }

const { engine, label } = await pickEngine()
const browser = await engine.launch()
const page = await (await browser.newContext({
  viewport: { width: DEVICE.width, height: DEVICE.height },
  deviceScaleFactor: 3, isMobile: true, hasTouch: true,
})).newPage()

const errors = []
page.on('pageerror', e => errors.push(e.message.slice(0, 120)))

await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(3000)

if (!await page.evaluate(() => !!window.__PV__)) {
  console.error('window.__PV__ missing — the dev server did not get VITE_TEST_SEAM=1')
  await browser.close(); stop(); process.exit(1)
}
await page.evaluate(wrap(RESET))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(3000)

console.log(header(label))
const totals = { measured: 0, under: 0, press: 0, island: 0, home: 0, overflow: 0, overflowScreens: 0 }
const smalls = new Set()

for (const s of SCREENS) {
  await page.evaluate(wrap(gotoScreen(s.tab)))
  const r = await page.evaluate(wrap(AUDIT))
  totals.measured += r.measured; totals.under += r.under; totals.press += r.press
  totals.island += r.island; totals.home += r.home
  if (r.overflow > 0) { totals.overflow += r.overflow; totals.overflowScreens++ }
  r.smalls.forEach(x => smalls.add(x))
  console.log(row(s.name, r))
}

console.log('-'.repeat(66))
console.log(`TOTAL         under-44pt ${totals.under}/${totals.measured} · press ${totals.press}/${totals.measured} · island ${totals.island} · home ${totals.home}`)
if (smalls.size) { console.log('\nunder 44pt:'); [...smalls].forEach(x => console.log('   ' + x)) }
if (errors.length) { console.log('\npage errors:'); errors.slice(0, 5).forEach(e => console.log('   ' + e)) }

// The browser build deliberately keeps the bottom nav's home-indicator compromise — only the
// shell takes the inset back — so `home` is reported here but never failed on.
const fails = verdict(totals, { assertHome: false })
console.log(fails.length ? `\n❌ ${fails.join(' · ')}` : '\n✅ layout, tap targets and press feedback all clean')
await browser.close(); stop()
process.exit(fails.length ? 1 : 0)
