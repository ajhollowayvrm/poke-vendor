// Will THIS save — a real one, pulled from the cloud — load and play without crashing?
//
// verify-savechain.mjs asks whether the migration chain is correct over a synthetic save it
// built itself. That is a different question. A synthetic save has every field, in the shape
// the current code expects, because the script that made it imported the current code. A save
// that has been through eleven months of builds, a slim-save format change, a nav rewrite and
// a cloud round-trip has whatever shape it accumulated, and the only way to find out is to
// take the actual bytes and run them.
//
// So this takes ONE FILE — the player's own save — and puts it through both halves of what
// the app does with it:
//
//   STAGE A (node)     parse → migrate() → merge() → onRehydrateStorage(), through zustand's
//                      real persist middleware, then audit every key against a fresh game and
//                      run the derived money/value helpers over the result.
//   STAGE B (browser)  boot the REAL app with that save seeded into storage, then walk every
//                      tab, every sub-tab and every collapsed panel, watching for a thrown
//                      error, a React console error, or the ErrorBoundary crash screen.
//
// Stage A catches a save that cannot LOAD. Stage B catches a save that loads and then kills a
// screen — which is the failure a player actually reports, and the one a migration test cannot
// see, because nothing in the migration chain ever reads `marketMults[setId]`.
//
// Usage:
//   npx vite-node scripts/verify-cloudsave.mjs <save-file> [--no-browser] [--keep]
//
// <save-file> may be any of the shapes the save legitimately travels in — the raw zustand blob,
// the Lambda's GET response, a `aws dynamodb get-item` dump, or a bare gzip+base64 payload.
// readSave() below works out which.
import { readFileSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { useGame } from '../src/game/store/index.js'
import { initialState } from '../src/game/store/initialState.js'
import { netWorthFull } from '../src/game/store/helpers.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FILE = process.argv[2]
const NO_BROWSER = process.argv.includes('--no-browser')
const PORT = Number(process.env.PORT || 5189) // 5187 sweep, 5188 verify-ui — take a fourth
const URL = `http://localhost:${PORT}/`

if (!FILE) {
  console.error('usage: npx vite-node scripts/verify-cloudsave.mjs <save-file> [--no-browser]')
  process.exit(2)
}

let failures = 0
let warnings = 0
function check(name, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}
function warn(name, detail = '') {
  console.log(`  ⚠ ${name}${detail ? ` — ${detail}` : ''}`)
  warnings++
}

// --- reading the save -------------------------------------------------------------------
// The same bytes wear four different coats depending on where you grabbed them, and telling a
// player "wrong format" when they handed you their save is a useless answer. Unwrap whichever
// one arrived and get to the zustand blob.
function readSave(file) {
  const raw = readFileSync(file, 'utf8').trim()
  let j = null
  try { j = JSON.parse(raw) } catch {}

  // A bare gzip+base64 payload (what the client PUTs as `data` when enc:'gz').
  if (!j) return { blob: ungzipB64(raw), from: 'bare gzip+base64 payload' }

  // Already the zustand blob.
  if (j.state !== undefined && j.version !== undefined) return { blob: raw, from: 'raw zustand blob' }

  // `aws dynamodb get-item` — DynamoDB's typed attribute-value JSON.
  const item = j.Item || j.item
  if (item?.data?.S !== undefined) {
    const enc = item.enc?.S
    return {
      blob: enc === 'gz' ? ungzipB64(item.data.S) : item.data.S,
      from: `DynamoDB item (${item.id?.S || 'no id'})`,
      savedAt: Number(item.savedAt?.N) || null,
      version: item.version?.N != null ? Number(item.version.N) : null,
    }
  }

  // The Lambda's GET response: { data, savedAt, version, enc? }.
  if (typeof j.data === 'string') {
    return {
      blob: j.enc === 'gz' ? ungzipB64(j.data) : j.data,
      from: 'Lambda GET response',
      savedAt: j.savedAt ?? null,
      version: j.version ?? null,
    }
  }
  throw new Error('unrecognized file — expected a zustand blob, a Lambda GET response, a DynamoDB item, or a gzip+base64 payload')
}
function ungzipB64(b64) { return gunzipSync(Buffer.from(b64.replace(/\s+/g, ''), 'base64')).toString('utf8') }

// The cloud path the save actually travels: gzip, then base64, then compared to the backend's
// 350KB ceiling. Measure it the same way rather than reporting raw JSON length, which is 5-10×
// larger and tells the player nothing about whether their game will keep syncing.
const MAX_PUSH_BYTES = 350_000
function wireSize(blob) { return gzipSync(Buffer.from(blob, 'utf8')).toString('base64').length }

// --- stage A ----------------------------------------------------------------------------
console.log(`\n=== CLOUD SAVE CHECK — ${path.relative(ROOT, FILE)} ===\n`)
console.log('1. The file is a save this game can read:')

let src
try { src = readSave(FILE) } catch (e) {
  check('the file is a save', false, e.message)
  process.exit(1)
}
console.log(`  · read as: ${src.from}`)

let parsed = null
try { parsed = JSON.parse(src.blob) } catch (e) {
  check('the blob is valid JSON', false, e.message)
  process.exit(1)
}
check('the blob is valid JSON', true)
// loadFromCloud() refuses anything that isn't {state, version} rather than rehydrating garbage
// over a working game. Apply the same gate here so this script agrees with the app.
check('it has the { state, version } shape the loader requires',
  !!parsed && typeof parsed.state === 'object' && parsed.state !== null,
  'the app would refuse this blob and keep the local game')
if (!parsed?.state) process.exit(1)

const CURRENT_VERSION = useGame.persist.getOptions().version ?? 0
const saveVersion = parsed.version ?? 0
console.log(`  · save version ${saveVersion} → current ${CURRENT_VERSION}`)
check('the save is not NEWER than this build',
  saveVersion <= CURRENT_VERSION,
  `v${saveVersion} was written by a newer build; migrate() only moves forward, so this build would load it unmigrated`)

const bytes = wireSize(src.blob)
check(`it fits the cloud item cap (${(bytes / 1000).toFixed(0)}KB of ${MAX_PUSH_BYTES / 1000}KB on the wire)`,
  bytes <= MAX_PUSH_BYTES,
  'auto-sync stops dead above the cap — the game keeps saving locally, the cloud stops updating')
if (bytes > MAX_PUSH_BYTES * 0.85 && bytes <= MAX_PUSH_BYTES) {
  warn(`the save is at ${Math.round((bytes / MAX_PUSH_BYTES) * 100)}% of the cloud cap`, 'it will stop syncing as the collection grows')
}

console.log('\n2. It survives the migration chain (migrate → merge → onRehydrate):')

// Drive zustand's REAL persist middleware rather than calling migrate() by hand. migrate is
// only the first of three steps, and the other two — merge()'s cross-bucket uid dedupe and
// onRehydrateStorage's counter re-seeding + resolveGrades() — are just as able to throw. This
// is the exact code path a boot takes; the only substitution is where the bytes come from.
const stubStorage = {
  getItem: async () => JSON.parse(src.blob),
  setItem: () => {},
  removeItem: () => {},
}
const realStorage = useGame.persist.getOptions().storage
let hydrated = null
try {
  useGame.persist.setOptions({ storage: stubStorage })
  await useGame.persist.rehydrate()
  hydrated = useGame.getState()
  check('rehydrate() completes without throwing', true)
} catch (e) {
  check('rehydrate() completes without throwing', false, `${e.message}\n      ${(e.stack || '').split('\n').slice(1, 4).join('\n      ')}`)
} finally {
  useGame.persist.setOptions({ storage: realStorage })
}

if (hydrated) {
  // A rehydrate that throws aborts and leaves a FRESH GAME in the store — which is the failure
  // mode the migrate() corrupt-save guard exists to prevent, and it is silent. Prove the state
  // we are holding is the player's, not a new game wearing its place.
  const st = parsed.state
  check('the loaded game is the SAVE, not a fresh game',
    (hydrated.currentDay ?? 1) === (st.currentDay ?? 1) && hydrated.currentDay > 1,
    `day ${hydrated.currentDay} vs ${st.currentDay} in the file — a mismatch means the load silently fell back to a new game`)

  const cardCount = (s) => ['collection', 'binder', 'showInventory', 'shopDisplay'].reduce(
    (n, k) => n + (Array.isArray(s[k]) ? s[k].length : 0), 0)
  // Never format a save's own values as though they were the type they ought to be — that is
  // how a checker crashes on the exact save it was pointed at. Print what is actually there.
  const money = (v) => (Number.isFinite(v) ? `$${v.toFixed(2)}` : `cash=${JSON.stringify(v)}`)
  console.log(`  · ${cardCount(hydrated)} cards across the flat buckets, ${money(hydrated.cash)}, day ${hydrated.currentDay}`)

  console.log('\n3. Every field the game reads is present and the right shape:')
  // The crash class this whole exercise is about is a component reading a field the save does
  // not carry — `marketMults[set.id]` on an undefined map. A fresh game is the authority on
  // what SHOULD be there, so diff against one: any key whose type moved, or that vanished,
  // is a component's TypeError waiting for the player to open the right screen.
  const fresh = initialState()
  const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v)
  const missing = []
  const nulled = []
  for (const [k, want] of Object.entries(fresh)) {
    if (typeof want === 'function' || want === undefined) continue
    const got = hydrated[k]
    if (got === undefined) { missing.push(k); continue }
    // The dangerous shape is a CONTAINER replaced by null: `marketMults: null` survives every
    // guard in the chain — migrate only backfills it for pre-v19 saves, and merge's object
    // spread copies the null straight over the fresh map — and then the first component to
    // write `marketMults[set.id]` throws.
    //
    // But a null here is NOT proof of a bad save, and this must not claim otherwise: quitJob()
    // sets `job: null` on purpose, so a legitimately unemployed player trips the same test as a
    // corrupt map. Stage A cannot tell those apart — nothing in the state says which nulls the
    // game means. So it reports them and stage B, which actually renders the screens, decides.
    if (got === null && want !== null && typeof want === 'object') nulled.push(k)
  }
  check('no state field the game expects is missing', missing.length === 0, missing.join(', '))
  if (nulled.length) {
    warn(`${nulled.length} field${nulled.length === 1 ? ' is' : 's are'} null where a fresh game holds an object: ${nulled.join(', ')}`,
      'some of these are legitimate (quitJob sets job:null) — step 5 renders the screens and settles it')
  } else {
    check('no field the game expects to be an object or array is null', true)
  }

  // Null entries inside a card bucket are what the migrate() corrupt-save guard filters, but
  // only for the buckets on its list. Check every bucket that holds cards, including the ones
  // that guard themselves, and check the wrapped shapes carry the card they promise.
  const flatBuckets = ['collection', 'binder', 'showInventory', 'sealedInventory', 'showSealed',
    'shopDisplay', 'shopSealed', 'bulkBin', 'imports']
  const wrappedBuckets = ['listings', 'consignments', 'pendingGrades']
  const junk = []
  for (const k of flatBuckets) {
    const arr = hydrated[k]?.stock ?? hydrated[k]
    if (!Array.isArray(arr)) continue
    const bad = arr.filter(c => !c || typeof c !== 'object').length
    if (bad) junk.push(`${k}: ${bad} null/garbage entr${bad === 1 ? 'y' : 'ies'}`)
  }
  for (const k of wrappedBuckets) {
    if (!Array.isArray(hydrated[k])) continue
    const bad = hydrated[k].filter(e => !e || typeof e !== 'object' || !e.card).length
    if (bad) junk.push(`${k}: ${bad} entr${bad === 1 ? 'y' : 'ies'} with no card`)
  }
  check('no card bucket holds a null or a card-less entry', junk.length === 0, junk.join('; '))

  // What did the load THROW AWAY? migrate()'s corrupt-save guard drops null entries and merge()'s
  // dedupe drops any card with no uid or a uid already seen — both silently, both by design, and
  // both meaning the player owns fewer cards after this boot than the file says they own. The
  // check above can never see it, because it runs after the discarding is done. Count the file.
  const dropped = []
  for (const k of [...flatBuckets, ...wrappedBuckets]) {
    const before = st[k]?.stock ?? st[k]
    const after = hydrated[k]?.stock ?? hydrated[k]
    if (!Array.isArray(before) || !Array.isArray(after)) continue
    if (after.length < before.length) dropped.push(`${k}: ${before.length - after.length} of ${before.length}`)
  }
  check('the load keeps every card in the file', dropped.length === 0,
    `dropped as corrupt, uid-less or duplicated — ${dropped.join('; ')}`)

  // Cards are identified by uid everywhere — the binder, the dedupe in merge(), accept/decline
  // on an offer. A card with no uid is invisible to all of it.
  const noUid = []
  for (const k of flatBuckets) {
    const arr = hydrated[k]?.stock ?? hydrated[k]
    if (!Array.isArray(arr)) continue
    const n = arr.filter(c => c && !c.uid).length
    if (n) noUid.push(`${k}: ${n}`)
  }
  check('every card carries a uid', noUid.length === 0, noUid.join(', '))

  // A card whose catalog row did not come back from slimsave has no name and no price. It will
  // not throw on its own — it renders as a blank tile and prices as $0, quietly deflating net
  // worth — so it is a warning, not a failure, but the player should know the count.
  const orphans = (hydrated.collection || []).filter(c => c && (!c.name || c.price == null)).length
  if (orphans) warn(`${orphans} card${orphans === 1 ? ' in the collection has' : 's in the collection have'} no catalog row`, 'they render blank and price as $0')

  console.log('\n4. The derived money the whole UI is built on computes:')
  // Net worth is read by the top bar, the books, the career screen and the cloud reconcile. If
  // it throws, every screen throws at once; if it is NaN, every number in the app is NaN.
  try {
    const nw = netWorthFull(hydrated)
    const total = typeof nw === 'number' ? nw : nw?.total
    check('netWorthFull() computes a finite number', Number.isFinite(total), `got ${JSON.stringify(nw)}`)
    if (Number.isFinite(total)) console.log(`  · net worth $${total.toLocaleString('en-US', { maximumFractionDigits: 0 })}`)
  } catch (e) {
    check('netWorthFull() computes a finite number', false, e.message)
  }
  check('cash is a finite number', Number.isFinite(hydrated.cash), `cash is ${hydrated.cash}`)
  check('the day counter is a finite number', Number.isFinite(hydrated.currentDay), `currentDay is ${hydrated.currentDay}`)
}

// --- stage B ----------------------------------------------------------------------------
// Everything above proves the save LOADS. It cannot prove a screen survives it: the migration
// chain never reads a set's market multiplier, never renders a card tile, never asks a booth
// for its stock. Only the app does that, so run the app.
if (NO_BROWSER) {
  report()
} else {
  console.log('\n5. Every screen renders against this save (real app, real browser):')
  const { chromium } = await import('playwright')

  const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, env: { ...process.env, VITE_TEST_SEAM: '1' }, stdio: 'ignore', shell: true,
  })
  const stop = () => { try { server.kill('SIGKILL') } catch {} }
  process.on('exit', stop)
  process.on('SIGINT', () => { stop(); process.exit(130) })

  const up = await (async (tries = 90) => {
    for (let i = 0; i < tries; i++) {
      try { if ((await fetch(URL)).ok) return true } catch {}
      await new Promise(r => setTimeout(r, 500))
    }
    return false
  })()
  if (!up) { check('the dev server comes up', false, `nothing answering on ${PORT}`); stop(); report() }

  const browser = await chromium.launch()
  const problems = []   // { where, what }
  const seenProblem = new Set()

  for (const vp of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    // Seed the save the way a real device holds it. The store prefers IndexedDB but adopts an
    // existing localStorage copy on first read (store/index.js getItem), so writing the one key
    // is enough and works whichever store the probe settles on.
    await ctx.addInitScript(`try {
      localStorage.setItem('poke-vendor-save', ${JSON.stringify(src.blob)})
      localStorage.removeItem('poke-vendor-auth')
      for (const k of Object.keys(localStorage)) if (k.startsWith('pv-col')) localStorage.removeItem(k)
    } catch (e) {}`)

    const page = await ctx.newPage()
    let where = `${vp.name}: boot`
    const note = (what) => {
      const key = `${what}`.slice(0, 200)
      if (seenProblem.has(key)) return     // the same broken component on six tabs is one bug
      seenProblem.add(key)
      problems.push({ where, what })
    }
    page.on('pageerror', e => note(`${e.message}`))
    page.on('console', m => {
      if (m.type() !== 'error') return
      const t = m.text()
      // A failed image request is a 404 on a card scan, not a crash. Everything else counts.
      if (/Failed to load resource|net::ERR_|favicon/i.test(t)) return
      note(t)
    })

    await page.goto(URL, { waitUntil: 'load' })
    await page.waitForFunction(() => !document.querySelector('.boot-splash'), null, { timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(600)

    // The single most important assertion in stage B. If the seed did not take, everything
    // below walks a BRAND NEW GAME and reports a confident all-clear about a save it never
    // loaded. Read the app's own live store through the test seam and check it is the save.
    if (vp.name === 'desktop') {
      const live = await page.evaluate(() => {
        if (!window.__PV__) return null
        const s = window.__PV__.store()
        return { day: s.currentDay, cash: s.cash, cards: (s.collection || []).length }
      })
      check('the app actually loaded THIS save (not a fresh game)',
        !!live && live.day === hydrated?.currentDay,
        live ? `app is on day ${live.day}, the save says ${hydrated?.currentDay}` : 'window.__PV__ missing — VITE_TEST_SEAM did not reach the dev server')
      if (live) console.log(`  · app booted on day ${live.day} with ${live.cards} cards and $${Math.round(live.cash)}`)
    }

    const crashed = async () => (await page.locator('.crash-screen').count()) > 0
    if (await crashed()) note(await page.locator('.crash-msg').innerText().catch(() => 'crash screen on boot'))

    // Walk every tab, and inside each tab every sub-tab. Index-based rather than by label: the
    // labels carry live counts and a storefront renames one of them, and a walk that silently
    // matches nothing is the failure this is supposed to catch.
    const tabSel = vp.name === 'phone' ? '.bnav-btn' : '.tabs .tab'
    const tabCount = await page.locator(tabSel).count()
    for (let t = 0; t < tabCount; t++) {
      const label = (await page.locator(tabSel).nth(t).innerText().catch(() => `#${t}`)).replace(/\s+/g, ' ').trim()
      where = `${vp.name}: ${label}`
      await page.locator(tabSel).nth(t).click().catch(() => {})
      await page.waitForTimeout(450)
      if (await crashed()) { note(await page.locator('.crash-msg').innerText().catch(() => 'crash screen')); await page.reload(); await page.waitForTimeout(800); continue }

      const subCount = await page.locator('.subtab').count()
      for (let s = 0; s < subCount; s++) {
        const sub = (await page.locator('.subtab').nth(s).innerText().catch(() => `#${s}`)).replace(/\s+/g, ' ').trim()
        where = `${vp.name}: ${label} › ${sub}`
        await page.locator('.subtab').nth(s).click().catch(() => {})
        await page.waitForTimeout(450)
        if (await crashed()) { note(await page.locator('.crash-msg').innerText().catch(() => 'crash screen')); await page.reload(); await page.waitForTimeout(800); break }

        // A closed Collapse renders NONE of its children, so a component that would throw sits
        // there looking fine until the player taps the header. Open every one.
        const heads = page.locator('.collapse-btn[aria-expanded="false"]')
        const n = Math.min(await heads.count(), 12)
        for (let i = 0; i < n; i++) {
          await page.locator('.collapse-btn[aria-expanded="false"]').first().click().catch(() => {})
          await page.waitForTimeout(220)
          if (await crashed()) { note(await page.locator('.crash-msg').innerText().catch(() => 'crash screen in a panel')); await page.reload(); await page.waitForTimeout(800); break }
        }
      }
    }
    await ctx.close()
  }

  await browser.close()
  stop()

  check('no screen threw an error against this save', problems.length === 0)
  for (const p of problems) console.log(`      ✗ ${p.where}\n        ${p.what.split('\n')[0].slice(0, 220)}`)
  report()
}

function report() {
  console.log('')
  if (warnings) console.log(`${warnings} warning${warnings === 1 ? '' : 's'} (not crashes — read them, then decide).`)
  if (failures) { console.log(`✗ ${failures} check${failures === 1 ? '' : 's'} failed — this save can crash the game.\n`); process.exit(1) }
  console.log('✓ this save loads clean and every screen renders against it.\n')
  process.exit(0)
}
