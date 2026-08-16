// Boot profile — `npm run profile` (add THROTTLE=6 for a slower phone, RUNS=n for more samples).
//
// Serves the PRODUCTION build and measures how long it takes to become usable on a throttled
// CPU, then attributes the two costs that boot work has historically been blamed on:
//
//   1. JSON.parse of the card-data chunk
//   2. engine.js index building (ALL_CARDS / VINTAGE_CARDS / CARD_BY_ID / COMP_SLABS)
//
// WHY THIS EXISTS RATHER THAN A README PARAGRAPH: the previous optimisation decision was
// argued from numbers measured against a 5,153-card catalog and then quoted for a year while
// the catalog grew to 23,475. A conclusion with no way to re-run it goes stale silently. Run
// this instead of trusting the last person who ran it.
//
// MEASUREMENT NOTE, learned the hard way: do NOT use waitForSelector to decide when the app is
// interactive. Playwright's selector engine runs its own script in the page (computeBox,
// InjectedScript, isURL) and lands in the profile — it inflated boot-to-interactive from
// ~180 ms to ~300 ms and showed up as the second-largest "cost" in a CPU profile. A
// MutationObserver installed before any app script, read back afterwards, sees the same event
// without touching the critical path.
import { spawn, execSync } from 'child_process'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright')
const PORT = Number(process.env.PORT || 5186)
const URL = `http://localhost:${PORT}/`
const THROTTLE = Number(process.env.THROTTLE || 4)
const RUNS = Number(process.env.RUNS || 7)

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT, shell: true, stdio: 'ignore',
})
const waitForServer = async (tries = 60) => {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(URL); if (r.ok) return true } catch {}
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}
const median = xs => {
  const s = xs.filter(v => typeof v === 'number' && isFinite(v)).sort((a, b) => a - b)
  return s.length ? s[s.length >> 1] : 0
}
const ms = n => `${n.toFixed(0)} ms`

try {
  if (!(await waitForServer())) throw new Error('vite preview did not come up — did you `npm run build`?')
  const browser = await chromium.launch()
  const runs = []

  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext()
    // Installed before any app script: records the moment the tab strip first exists.
    await ctx.addInitScript(() => {
      window.__pv = {}
      const mo = new MutationObserver(() => {
        if (!window.__pv.interactive && document.querySelector('.tabs .tab')) {
          window.__pv.interactive = performance.now()
          mo.disconnect()
        }
      })
      document.addEventListener('DOMContentLoaded',
        () => mo.observe(document.body, { childList: true, subtree: true }))
    })
    const page = await ctx.newPage()
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
    await page.goto(URL, { waitUntil: 'load' })
    await page.waitForTimeout(2500) // settle without polling the DOM

    runs.push(await page.evaluate(async () => {
      const nav = performance.getEntriesByType('navigation')[0]
      const fcp = performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint')
      const res = performance.getEntriesByType('resource')
      const chunk = res.find(r => /card-data/.test(r.name))
      const idx = res.find(r => /assets\/index-.*\.js/.test(r.name))

      let parseMs = null, initMs = null, cards = 0, sets = 0
      if (chunk) {
        const txt = await (await fetch(chunk.name)).text()
        const a = txt.indexOf('JSON.parse(`'), b = txt.lastIndexOf('`)')
        if (a >= 0 && b > a) {
          const raw = txt.slice(a + 'JSON.parse(`'.length, b)
          let t = performance.now()
          const data = JSON.parse(raw)
          parseMs = performance.now() - t
          sets = (data.sets || []).length
          cards = (data.sets || []).reduce((n, s) => n + (s.cards || []).length, 0)
          // The same top-level derivations engine.js does, timed in isolation.
          t = performance.now()
          const SETS = data.sets
          const SHOP = SETS.filter(s => !s.vintage && !s.secondary && !s.extra)
          const VINT = SETS.filter(s => s.vintage)
          const ALL = SHOP.flatMap(s => s.cards)
          const VC = VINT.flatMap(s => s.cards).filter(c => c.price != null)
          const BY_ID = new Map()
          for (const s of SETS) for (const c of (s.cards || [])) BY_ID.set(c.id, c)
          void [...ALL, ...VC].flatMap(c =>
            [10, 9, 8].filter(g => c.psa?.[String(g)] != null).map(g => ({ card: c, grade: g })))
          initMs = performance.now() - t
        }
      }
      return {
        interactive: window.__pv.interactive ?? null,
        fcp: fcp?.startTime ?? null,
        dcl: nav.domContentLoadedEventEnd,
        chunkGz: chunk?.encodedBodySize ?? 0, chunkRaw: chunk?.decodedBodySize ?? 0,
        idxGz: idx?.encodedBodySize ?? 0, idxRaw: idx?.decodedBodySize ?? 0,
        parseMs, initMs, cards, sets,
      }
    }))
    await ctx.close()
  }

  const med = k => median(runs.map(r => r[k]))
  const boot = med('interactive')
  console.log(`\n=== BOOT PROFILE — production build, ${THROTTLE}× CPU throttle, median of ${RUNS} ===\n`)
  console.log(`  snapshot              ${runs[0].cards.toLocaleString()} cards across ${runs[0].sets} sets`)
  console.log(`  card-data chunk       ${(med('chunkGz') / 1024).toFixed(0)} KB gzip / ${(med('chunkRaw') / 1024).toFixed(0)} KB raw`)
  console.log(`  boot app chunk        ${(med('idxGz') / 1024).toFixed(0)} KB gzip / ${(med('idxRaw') / 1024).toFixed(0)} KB raw`)
  console.log('')
  console.log(`  first contentful paint ${ms(med('fcp'))}`)
  console.log(`  DOMContentLoaded       ${ms(med('dcl'))}`)
  console.log(`  APP INTERACTIVE        ${ms(boot)}   ← the number that matters`)
  console.log('')
  console.log(`  JSON.parse card data   ${med('parseMs').toFixed(1)} ms  (${(med('parseMs') / boot * 100).toFixed(1)}% of boot)`)
  console.log(`  engine index building  ${med('initMs').toFixed(1)} ms  (${(med('initMs') / boot * 100).toFixed(1)}% of boot)`)
  console.log(`\n  Together they are ${((med('parseMs') + med('initMs')) / boot * 100).toFixed(0)}% of boot. If that share is still small,`)
  console.log(`  shrinking the card data further is NOT where the next win is.\n`)

  await browser.close()
} catch (e) {
  console.error('PROFILE ERROR:', e.message)
  process.exitCode = 1
} finally {
  try { server.kill('SIGKILL') } catch {}
  try { execSync(`lsof -ti tcp:${PORT} | xargs kill -9`, { stdio: 'ignore' }) } catch {}
}
