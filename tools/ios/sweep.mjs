// npm run sweep — the full mobile sweep.
//
//   npm run sweep                 every surface, shell configuration (the shipping default)
//   npm run sweep -- --only buy   only surfaces whose id contains "buy"
//   NATIVE=0 npm run sweep        the plain-browser compromise, for comparing the bottom nav
//   HEADED=1 npm run sweep        watch it drive
//
// This is the third driver, beside `ios:web` (6 screens, WebKit, numbers only) and `ios:sim` (the
// real WKWebView). It answers a different question from either: what does EVERY screen, modal,
// overlay and gated state look like and measure like on a phone.
//
// It drives Chrome stable through Playwright's device emulation, which is the same CDP path
// (Emulation.setDeviceMetricsOverride + touch emulation) that Chrome DevTools device mode uses —
// a real mobile user agent, DPR 3, coarse pointer and touch events, not a narrow window.
//
// WHAT THIS DRIVER CANNOT ANSWER, by construction:
//   • whether :active press feedback FIRES on a phone. WebKit applies :active on touch only while
//     a touch listener is registered (main.jsx:23); every desktop browser applies it without one.
//     The sweep reports which controls HAVE a :active rule and no more. Only `ios:sim` can confirm.
//   • origin, the zoom lock, and rubber-band scroll. Same reason.
//   • landscape is not swept at all: PokeVendor-Info.plist is portrait-only with
//     UIRequiresFullScreen, and there is not one landscape media query in styles.css. It is a
//     state the shipping app cannot enter.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEVICE, SURFACES, SEEDS, SEED_ORDER, AUDIT, INIT_NATIVE, INIT_INSETS } from './surfaces.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'tools/ios/sweep-out')
// 5183 is ios:web and 5188 is verify-ui. Taking a third port means a sweep can run while either
// of those is still up, which matters when you are re-checking one fix against all three drivers.
const PORT = Number(process.env.PORT || 5187)
const URL = `http://localhost:${PORT}/`
const NATIVE = process.env.NATIVE !== '0'
// Ceiling for the flattened whole-screen shot, in CSS pixels.
const MAX_FULL_PX = 14000
const fullShotFailed = []
// Surfaces measured while the browser had stopped reporting itself as a phone. Any entry here
// invalidates that surface's tap-target numbers, so the run says so rather than publishing them.
const degraded = []
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > -1 ? process.argv[i + 1] : null })()

const picked = ONLY ? SURFACES.filter(s => s.id.includes(ONLY)) : SURFACES
if (!picked.length) { console.error(`no surface id contains "${ONLY}"`); process.exit(1) }

// ---------------------------------------------------------------------------------------------
// dev server
const spawnServer = () => spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT, env: { ...process.env, VITE_TEST_SEAM: '1' }, stdio: 'ignore', shell: true,
})
let server = spawnServer()
// Kill ONLY the server this run started. The obvious version of this also does
// `lsof -ti tcp:PORT | xargs kill -9`, which reaches past your own child and kills whatever else
// holds the port — so a second sweep started while the first is still going has its dev server
// shot out from under it mid-navigation, and dies with a bare ERR_CONNECTION_REFUSED that blames
// the page. Vite already gets --strictPort, so a busy port fails loudly at startup instead.
const stop = () => { try { server.kill('SIGKILL') } catch {} }
process.on('exit', stop)
process.on('SIGINT', () => { stop(); process.exit(130) })

async function waitForServer(tries = 90) {
  for (let i = 0; i < tries; i++) {
    try { if ((await fetch(URL)).ok) return true } catch {}
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

/// A 65-surface run takes minutes and the dev server can die inside it — OOM under a second
/// browser, a crashed worker, an unrelated process taking the port. When that happened the run
/// died on `page.goto` with a bare ERR_CONNECTION_REFUSED, which reads like the PAGE failed and
/// throws away every surface still to come. Check the server is actually answering before each
/// surface, and put it back if it is not.
let restarts = 0
async function ensureServer() {
  try { if ((await fetch(URL)).ok) return true } catch {}
  restarts++
  console.log(`  ⚠ dev server stopped answering — restarting it (${restarts})`)
  try { server.kill('SIGKILL') } catch {}
  server = spawnServer()
  return waitForServer(120)
}

const wrap = (body) => `(async () => { ${body} })()`
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ---------------------------------------------------------------------------------------------
// step execution. Every step returns true if it did something; a step that finds nothing returns
// false and the surface is recorded as unreached WITH THE STEP THAT FAILED. Silently skipping is
// the one thing this must never do — a missing screenshot reads as "clean" to anyone scanning a
// contact sheet, so an unreachable surface has to be louder than a reachable one, not quieter.

/// Find the first VISIBLE match and tap its centre with the touchscreen. A real tap rather than
/// element.click(), because the app's press layer and the pointer-capture rip gesture both key off
/// touch events, and a synthetic DOM click produces neither.
async function tapSel(page, sel, contains) {
  // Two passes on purpose. RENDERED is not the same as IN THE VIEWPORT: at <=640px the shell locks
  // the body and scrolls .content, so most screens are far taller than 956px and the control you
  // want is usually below the fold. Requiring it to be on screen already made "Reset save" at the
  // bottom of Settings, and every Rip button under a set header, permanently unreachable — the
  // sweep called them missing when they were simply further down. So: find it anywhere, scroll it
  // to the middle, then tap where it actually landed.
  const box = await page.evaluate(async ({ sel, contains }) => {
    const rendered = (e) => {
      const cs = getComputedStyle(e)
      if (cs.visibility === 'hidden' || cs.display === 'none') return false
      const r = e.getBoundingClientRect()
      return r.width > 4 && r.height > 4
    }
    let target = null
    for (const e of document.querySelectorAll(sel)) {
      if (!rendered(e) || e.disabled) continue
      if (contains && !e.textContent.toLowerCase().includes(String(contains).toLowerCase())) continue
      target = e; break
    }
    if (!target) return null
    target.scrollIntoView({ block: 'center', inline: 'center' })
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    const r = target.getBoundingClientRect()
    if (r.bottom <= 0 || r.top >= innerHeight) return null   // genuinely unreachable
    return { x: Math.min(innerWidth - 2, Math.max(2, r.left + r.width / 2)),
             y: Math.min(innerHeight - 2, Math.max(2, r.top + r.height / 2)) }
  }, { sel, contains })
  if (!box) return false
  await page.touchscreen.tap(box.x, box.y)
  await sleep(500)
  return true
}

/// The pointer-capture drag that tears a pack open. PackOpening.jsx:289, AutoRip.jsx:307 and
/// HandReveal.jsx:50 all use setPointerCapture, so this has to be a genuine pointer stream —
/// a click does nothing at all on any of the three.
async function dragSel(page, sel) {
  const box = await page.evaluate((sel) => {
    const e = document.querySelector(sel)
    if (!e) return null
    const r = e.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height }
  }, sel)
  if (!box) return false
  await page.mouse.move(box.x, box.y)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) { await page.mouse.move(box.x, box.y + (box.h * 0.9 * i) / 12); await sleep(25) }
  await page.mouse.up()
  await sleep(800)
  return true
}

async function runStep(page, step) {
  if (step.wait != null) { await sleep(step.wait); return true }
  if (step.key) { await page.keyboard.press(step.key); await sleep(400); return true }
  if (step.bnav) return tapSel(page, '.bnav-btn', step.bnav)
  // Scoped to the FIRST .subtabs container on purpose: Livestream renders its own .subtab rows for
  // the source and order pickers, and an unscoped match grabs one of those instead of the page's.
  if (step.subtab) return tapSel(page, '.subtabs:first-of-type .subtab', step.subtab)
  if (step.tap) return tapSel(page, step.tap)
  if (step.tapText) return tapSel(page, step.tapText[0], step.tapText[1])
  if (step.drag) return dragSel(page, step.drag)
  if (step.focus) {
    const ok = await page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return false; e.focus(); return true }, step.focus)
    await sleep(400); return ok
  }
  if (step.patch) { await page.evaluate(wrap(step.patch)); await sleep(700); return true }
  throw new Error('unknown step: ' + JSON.stringify(step))
}

// ---------------------------------------------------------------------------------------------
// main
try {
  if (!(await waitForServer())) throw new Error(`vite never came up on ${PORT}`)
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.HEADED })

  // A FRESH CONTEXT PER SURFACE — measured, not paranoia.
  //
  // Inside a single context, Chrome's device emulation DEGRADES after the third cross-document
  // navigation: the viewport stays 440x956, devicePixelRatio stays 3, ontouchstart stays defined,
  // and (pointer: coarse) / (hover: none) silently flip to false. styles.css:378 hangs the entire
  // 44px thumb floor off (pointer: coarse), so from that moment every screen is measured against
  // DESKTOP rules while the report still says iPhone. That is precisely the failure that "emulate
  // a phone, don't just resize the window" exists to prevent, and nothing about the page looks
  // wrong when it happens. Overriding the media features through CDP does not hold it either.
  // Only a new context does.
  //
  // It costs about a tenth of a second against a page load we were already paying, and it makes
  // storage isolation free: every surface boots from an empty save, so no show, stream or dialog
  // left open by one screen can leak into the next.
  const newSurfacePage = async () => {
    const ctx = await browser.newContext({
      viewport: { width: DEVICE.width, height: DEVICE.height },
      screen: { width: DEVICE.width, height: DEVICE.height },
      deviceScaleFactor: 3,
      isMobile: true,        // chromium-only in Playwright, which is exactly the engine here
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 '
        + '(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    })
    if (NATIVE) await ctx.addInitScript(INIT_NATIVE)
    await ctx.addInitScript(INIT_INSETS)
    // Collapse.jsx:18 reads innerWidth >= 700 ONCE, with no resize listener, and persists the
    // answer under pv-col-*. A stale key changes which panels a screen renders, so every load
    // starts from the same collapse state.
    await ctx.addInitScript(`try { for (const k of Object.keys(localStorage)) if (k.startsWith('pv-col')) localStorage.removeItem(k) } catch {}`)
    // poke-vendor-cloud-auto defaults ON and syncConfig.js carries a live lambda URL. Clearing the
    // auth blob means a seeded save can never be pushed to a real account.
    await ctx.addInitScript(`try { localStorage.removeItem('poke-vendor-auth') } catch {}`)
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message.slice(0, 160)))
    page.on('console', m => {
      if (m.type() !== 'error') return
      const t = m.text()
      if (/favicon|Failed to load resource|net::ERR/.test(t)) return   // card-art 404s are not UI faults
      errors.push(t.slice(0, 160).replace(/\s+/g, ' '))
    })
    return { ctx, page, errors }
  }

  console.log(`\n=== MOBILE SWEEP — ${DEVICE.name} ${DEVICE.width}x${DEVICE.height} @3x, `
    + `Chrome device emulation, ${NATIVE ? 'shell' : 'browser'} configuration ===`)
  console.log(`    ${picked.length} surfaces · island ${DEVICE.islandInset}pt · home ${DEVICE.homeInset}pt\n`)

  const results = []
  for (const seed of SEED_ORDER) {
    const group = picked.filter(s => s.seed === seed)
    if (!group.length) continue
    console.log(`--- seed: ${seed} (${group.length} surfaces) ---`)
    let seedShown = false

    for (const s of group) {
      const { ctx, page, errors } = await newSurfacePage()
      try {
        if (!(await ensureServer())) throw new Error('dev server would not come back up')
        await page.goto(URL, { waitUntil: 'load' })
        // Wait for ANY of the shells, not just .topbar: the show floor and show prep are
        // full-screen takeovers with no top bar (App.jsx:532/548), so waiting only for .topbar
        // turns a screen that renders perfectly well into a 30-second hang.
        await page.waitForSelector('.topbar, .floorwrap, .prep-choice-group, .app', { timeout: 30000 })
        await sleep(1800)
        if (!(await page.evaluate(() => !!window.__PV__))) {
          throw new Error('window.__PV__ missing — the dev server did not get VITE_TEST_SEAM=1')
        }
        const seedReport = await page.evaluate(wrap(SEEDS[seed]))
        await sleep(600)
        if (!seedShown) { console.log(`    seed reports: ${seedReport}`); seedShown = true }

        let failedStep = null
        for (const step of s.steps) {
          const ok = await runStep(page, step).catch(e => { failedStep = `${JSON.stringify(step)} threw ${e.message}`; return false })
          if (!ok && failedStep === null) failedStep = JSON.stringify(step)
          if (failedStep) break
        }
        await sleep(900)

        const reached = await page.evaluate((sel) => {
          for (const one of sel.split(',')) if (document.querySelector(one.trim())) return true
          return false
        }, s.probe)

        const audit = await page.evaluate(wrap(AUDIT))
        await page.screenshot({ path: path.join(OUT, `${s.id}.png`) })

        // A second, deliberately UNTRUE shot. At <=640px the shell locks html/body to the viewport
        // and scrolls .content instead (styles.css:1689), so a fullPage screenshot is identical to
        // the viewport one and everything below the fold is invisible to review. Unlocking the
        // shell for one frame is the only way to see a whole long screen at once. It changes the
        // layout, so it is never audited and is always labelled in the contact sheet.
        await page.evaluate(() => {
          const st = document.createElement('style'); st.id = '__flat'
          st.textContent = 'html,body{height:auto!important;overflow:visible!important}'
            + '.app{height:auto!important;overflow:visible!important}'
            + '.app .content{overflow:visible!important;flex:none!important}'
          document.documentElement.appendChild(st)
        })
        await sleep(400)
        // Cap it. Unlocked, the Marketplace is every single in the game in one column — tens of
        // thousands of CSS pixels, which at DPR 3 is a bitmap large enough that Chrome stops making
        // progress rather than failing, and the whole sweep hangs on one screen. The timeout is the
        // backstop: a screenshot must never be able to stall the run.
        const flatH = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))
        try {
          await page.screenshot({
            path: path.join(OUT, `${s.id}-full.png`), timeout: 20000,
            ...(flatH > MAX_FULL_PX
              ? { clip: { x: 0, y: 0, width: DEVICE.width, height: MAX_FULL_PX } }
              : { fullPage: true }),
          })
        } catch (e) { fullShotFailed.push(`${s.id}: ${e.message.split('\n')[0]}`) }

        if (!audit.emulation.coarse || !audit.emulation.hoverNone) {
          degraded.push(`${s.id} (coarse=${audit.emulation.coarse} hover-none=${audit.emulation.hoverNone})`)
        }
        results.push({ ...s, reached, failedStep, audit, errors: [...new Set(errors)] })

        if (process.env.DEBUG_NAV) console.log(`      ${audit.vw}x${audit.vh} ${JSON.stringify(audit.emulation)}`)
        const bits = []
        if (audit.overflow) bits.push(`overflow ${audit.overflow}px`)
        if (audit.covered.length) bits.push(`${audit.covered.length} covered`)
        if (audit.home.length) bits.push(`${audit.home.length} home-band`)
        if (audit.island.length) bits.push(`${audit.island.length} island`)
        if (audit.zoom.length) bits.push(`${audit.zoom.length} zoom`)
        if (audit.tap.length) bits.push(`${audit.tap.length} under-44`)
        if (audit.divtap.length) bits.push(`${audit.divtap.length} div-tap`)
        if (errors.length) bits.push(`${errors.length} err`)
        console.log(`  ${reached ? '✓' : '✗'} ${s.id.padEnd(24)} ${bits.join(' · ') || 'clean'}`
          + (reached ? '' : `  UNREACHED at ${failedStep || 'probe ' + s.probe}`))
      } finally {
        await ctx.close()
      }
    }
  }

  await browser.close()
  await browser.close()
  writeReport(results)
  if (fullShotFailed.length) {
    console.log(`\n  whole-screen shot failed on ${fullShotFailed.length}: ${fullShotFailed.join('; ')}`)
  }
  if (degraded.length) {
    console.log(`\n  ⚠ DEVICE EMULATION DEGRADED on ${degraded.length} surface(s) — tap-target numbers there are desktop, not phone:`)
    degraded.slice(0, 8).forEach(d => console.log(`      ${d}`))
  }
  if (restarts) console.log(`\n  note: the dev server was restarted ${restarts} time(s) during this run`)
  const unreached = results.filter(r => !r.reached)
  console.log(`\n  ${results.length - unreached.length}/${results.length} surfaces reached`)
  if (unreached.length) console.log(`  UNREACHED: ${unreached.map(r => r.id).join(', ')}`)
  console.log(`\n  report      ${path.join(OUT, 'report.md')}`)
  console.log(`  contact sheet ${path.join(OUT, 'index.html')}\n`)
} catch (e) {
  console.error('SWEEP ERROR:', e.stack || e.message)
  process.exitCode = 1
} finally {
  stop()
}

// ---------------------------------------------------------------------------------------------
// reporting
function writeReport(results) {
  // Severity order is by what it costs a player, not by how many there are. A control that cannot
  // be tapped at all outranks a hundred small ones that can.
  const FINDINGS = [
    ['CRITICAL', 'covered', r => r.audit.covered, f => `${f.el} — covered by ${f.by}`],
    ['CRITICAL', 'page errors', r => r.errors.map(e => ({ el: e })), f => f.el],
    ['HIGH', 'home-indicator band', r => r.audit.home, f => `${f.el} — ${f.bottom}px from the bottom edge`],
    ['HIGH', 'horizontal overflow', r => (r.audit.overflow ? [{ el: `page overflows by ${r.audit.overflow}px` }] : []), f => f.el],
    ['HIGH', 'iOS focus zoom', r => r.audit.zoom, f => `${f.el} — ${f.fs}px${f.inline ? ' (inline style)' : ''}`],
    ['MEDIUM', 'Dynamic Island band', r => r.audit.island, f => `${f.el} — top ${f.top}px`],
    ['MEDIUM', 'tap target under 44pt', r => r.audit.tap, f => `${f.el} — ${f.w}x${f.h} (box ${f.box}px)`],
    ['MEDIUM', 'clipped text', r => r.audit.clipped, f => `${f.el} — clipped by ${f.over}px`],
    ['MEDIUM', 'tappable element is not a control', r => r.audit.divtap, f => `${f.el} — ${f.h}px tall, no button semantics`],
    ['LOW', 'hover-only title=', r => r.audit.hover, f => `${f.el} — ${f.why}, ${f.chars} chars unreachable by touch`],
  ]

  let md = `# Mobile sweep — ${DEVICE.name} ${DEVICE.width}x${DEVICE.height} @3x\n\n`
  md += `Chrome device emulation, ${NATIVE ? 'shell' : 'plain browser'} configuration. `
  md += `Safe-area insets injected (island ${DEVICE.islandInset}pt, home ${DEVICE.homeInset}pt) `
  md += `because Chromium reports env(safe-area-inset-*) as 0.\n\n`
  const un = results.filter(r => !r.reached)
  md += `${results.length - un.length} of ${results.length} surfaces reached.\n\n`
  if (un.length) {
    md += `## Unreached surfaces\n\nThese have a screenshot, but it is NOT the screen named. Treat every one as uncovered.\n\n`
    for (const r of un) md += `- \`${r.id}\` — ${r.name}. Failed at ${r.failedStep || 'probe `' + r.probe + '`'}\n`
    md += `\n`
  }

  md += `## Findings\n\n`
  for (const [sev, kind, get, fmt] of FINDINGS) {
    // One row per distinct finding, carrying the SET of surfaces it appears on. Counting each
    // occurrence instead would report "on 5 surfaces: buy-sealed, buy-sealed, buy-sealed" for a
    // single screen that simply renders the same chip five times.
    const byLine = new Map()
    for (const r of results) {
      if (!r.reached) continue
      for (const f of get(r) || []) {
        const line = fmt(f)
        if (!byLine.has(line)) byLine.set(line, new Set())
        byLine.get(line).add(r.id)
      }
    }
    const rows = [...byLine].map(([line, on]) => ({ line, on: [...on] }))
    if (!rows.length) continue
    md += `### ${sev} — ${kind} (${rows.length})\n\n`
    for (const row of rows.sort((a, b) => b.on.length - a.on.length)) {
      md += `- ${row.line}  \n  _on ${row.on.length} surface(s): ${row.on.slice(0, 6).join(', ')}${row.on.length > 6 ? ` +${row.on.length - 6}` : ''}_\n`
    }
    md += `\n`
  }

  md += `## Per surface\n\n| surface | reached | overflow | covered | home | island | zoom | <44pt | press | errors |\n`
  md += `|---|---|---|---|---|---|---|---|---|---|\n`
  for (const r of results) {
    const a = r.audit
    md += `| \`${r.id}\` | ${r.reached ? '✓' : '**✗**'} | ${a.overflow || '·'} | ${a.covered.length || '·'} | `
      + `${a.home.length || '·'} | ${a.island.length || '·'} | ${a.zoom.length || '·'} | ${a.tap.length || '·'} | `
      + `${a.press}/${a.measured} | ${r.errors.length || '·'} |\n`
  }

  if (degraded.length) {
    md += `\n## ⚠ Device emulation degraded\n\nThese surfaces were measured while the browser had stopped reporting \`(pointer: coarse)\` / \`(hover: none)\`. Their tap-target numbers are desktop rules, not phone rules, and must not be trusted:\n\n`
    for (const d of degraded) md += `- ${d}\n`
    md += `\n`
  }
  md += `\n## What this run could not answer\n\n`
  md += `- Whether \`:active\` press feedback FIRES. WebKit needs the touch listener at \`main.jsx:23\`; Chrome does not. The press column counts controls that HAVE a \`:active\` rule. Only \`npm run ios:sim\` can confirm the rest.\n`
  md += `- Origin, the zoom lock, and rubber-band scroll — all WKWebView behaviour.\n`
  md += `- Landscape. \`ios/PokeVendor-Info.plist\` is portrait-only with \`UIRequiresFullScreen\`, and \`styles.css\` has no landscape media query.\n`
  writeFileSync(path.join(OUT, 'report.md'), md)

  // The contact sheet. The whole point of the sweep is that a number nobody looks at is not the
  // same as a screen somebody looked at, so the run has to end in something scannable.
  const card = (r) => `
    <figure class="${r.reached ? '' : 'bad'}">
      <img src="${r.id}.png" loading="lazy" width="${DEVICE.width}" height="${DEVICE.height}">
      <figcaption>
        <b>${r.reached ? '' : '✗ UNREACHED — '}${r.name}</b>
        <code>${r.id}</code> · seed ${r.seed}
        <span>${[r.audit.overflow ? `overflow ${r.audit.overflow}px` : '', r.audit.covered.length ? `${r.audit.covered.length} covered` : '',
          r.audit.home.length ? `${r.audit.home.length} home-band` : '', r.audit.zoom.length ? `${r.audit.zoom.length} zoom` : '',
          r.audit.tap.length ? `${r.audit.tap.length} under-44` : '', r.errors.length ? `${r.errors.length} errors` : ''].filter(Boolean).join(' · ') || 'clean'}</span>
        <a href="${r.id}-full.png">whole screen (flattened, not device truth)</a>
      </figcaption>
    </figure>`
  const html = `<!doctype html><meta charset="utf-8"><title>Mobile sweep — ${DEVICE.name}</title>
<style>
  body{background:#0c0f1a;color:#e8ecf6;font:14px/1.5 system-ui,sans-serif;margin:0;padding:24px}
  h1{font-size:20px;margin:0 0 4px} .sub{color:#8b95ad;margin:0 0 24px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:20px}
  figure{margin:0;background:#12172a;border:1px solid #2a3145;border-radius:10px;overflow:hidden}
  figure.bad{border-color:#ff5c5c;box-shadow:0 0 0 1px #ff5c5c55}
  img{width:100%;height:auto;display:block;background:#000}
  figcaption{padding:10px 12px;font-size:12px;display:grid;gap:3px}
  code{color:#8b95ad} span{color:#ffb84d} a{color:#5aa9ff;font-size:11px}
</style>
<h1>Mobile sweep — ${DEVICE.name} ${DEVICE.width}&times;${DEVICE.height} @3x</h1>
<p class="sub">Chrome device emulation, ${NATIVE ? 'shell' : 'plain browser'} configuration &middot;
${results.filter(r => r.reached).length}/${results.length} surfaces reached &middot;
a red border means the screenshot is NOT the screen it is named after.</p>
<div class="grid">${results.map(card).join('')}</div>`
  writeFileSync(path.join(OUT, 'index.html'), html)
}
