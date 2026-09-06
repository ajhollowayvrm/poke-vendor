// UI floor checks — `npm run verify-ui` (add KEEP=1 to leave the dev server up, VERBOSE=1 for
// every offending element rather than the first few).
//
// WHY THIS EXISTS RATHER THAN A CHECKLIST: every problem it guards was found by measuring the
// live DOM, and every one of them is invisible in a code review. You cannot see that a tab strip
// overflows by 70px by reading the flexbox, and you cannot see that 165 of 250 text nodes are
// under 12px by reading a stylesheet with 353 font-size declarations in it. A number that nobody
// can re-measure goes stale the first week somebody adds a panel.
//
// Each check maps to one step of the UI cleanup plan. A check is ENABLED here only once its step
// has landed — turning one on before its fix exists just prints noise every run. Flip the flag in
// CHECKS below as each step completes.
//
// The checks deliberately walk all six tabs at three widths. Most of these regressions are
// width-dependent (the tab strip clips only above the phone breakpoint) or tab-dependent (the
// card grid is the only screen with 9px text), so a single-page audit misses them.
import { spawn, execSync } from 'child_process'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright')
const PORT = Number(process.env.PORT || 5188)
const URL = `http://localhost:${PORT}/`
const VERBOSE = !!process.env.VERBOSE

// Which checks are live. See the header: enable one as its plan step lands.
const CHECKS = {
  tabsFit:      true,  // step 4 — top bar must not clip a tab
  focusRing:    true,  // step 1 — first Tab stop must paint an outline
  typeFloor:    true,  // step 2 — no text below --fs-xs
  tapTargets:   true,  // step 3 — min 32px fine pointer / 44px coarse
  headings:     true,  // step 6 — document must have a heading outline
  noHScroll:    true,  // any step — the page must never scroll sideways
  noClipping:   true,  // step 2 — raising the type floor must not clip text out of its box
  noConsoleErr: true,  // any step — React DOM-nesting/prop warnings must not appear
  utilsWin:     true,  // step 8 — a utility class must actually beat the component class
  hoverOnly:    true,  // phase 2 of the overhaul — no long title= without a tap-reachable equivalent
}

// The six tabs by their VISIBLE label — the walk drives the UI the way a player does, so
// these must track src/App.jsx's TAB_LABEL. 'Sell' reads 'Store' once a storefront is bought;
// a fresh save (which is what this walk runs against) has neither, so 'Sell' is correct here.
const TABS = ['You', 'Sell', 'Buy', 'Socials', 'Shows', 'Misc']
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, coarse: false },
  { name: 'tablet',  width: 1024, height: 768, coarse: false },
  { name: 'phone',   width: 390,  height: 844, coarse: true  },
]

// The one documented exemption from the type floor. styles.css records why: the bottom nav
// splits a 390px screen six ways, and ellipsising the PRIMARY navigation is never acceptable,
// so this label stays at 10px on purpose.
const TYPE_FLOOR_EXEMPT = ['.bnav-label', '.bnav-badge']

let failures = 0
const seen = new Set()
function check(name, ok, detail = '') {
  // One line per distinct failure, not one per tab × viewport — the same missing focus rule
  // would otherwise print 18 times and bury everything else. A PASS dedups on the name alone:
  // the detail is built before we know the outcome, so keying on it made every green line
  // unique and printed the same ✓ once per tab.
  const key = ok ? name : `${name}|${detail}`
  if (seen.has(key)) return
  seen.add(key)
  console.log(`  ${ok ? '✓' : '✗'} ${name}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT, shell: true, stdio: 'ignore',
})
const waitForServer = async (tries = 60) => {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(URL); if (r.ok) return true } catch {}
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

// ---------- the in-page audits ----------
// A title= tooltip does not exist on a phone. Anything longer than a label (40 chars) is
// prose the player can never read — it belongs inline, in an Explain popover, or nowhere.
function auditHoverOnly() {
  const bad = []
  for (const e of document.querySelectorAll('[title]')) {
    const t = e.getAttribute('title') || ''
    if (t.length <= 40) continue
    const r = e.getBoundingClientRect()
    if (!r.width || !r.height) continue
    bad.push({ cls: e.className?.baseVal ?? String(e.className || e.tagName), len: t.length, txt: t.slice(0, 40) })
  }
  return bad
}

// These run inside the browser. Each returns a plain array of offenders so the Node side can
// format them; none of them assert, so one failing check never hides the others.

function auditTypeFloor(exempt) {
  const floor = parseFloat(getComputedStyle(document.documentElement)
    .getPropertyValue('--fs-xs')) || 12
  const bad = []
  for (const el of document.querySelectorAll('*')) {
    if (el.children.length || !el.textContent.trim()) continue
    if (exempt.some(sel => el.matches(sel))) continue
    if (!el.getClientRects().length) continue          // not painted — ignore
    const fs = parseFloat(getComputedStyle(el).fontSize)
    if (fs < floor) bad.push({ fs, cls: el.className || el.tagName, txt: el.textContent.trim().slice(0, 30) })
  }
  return { floor, bad }
}

function auditTapTargets(min) {
  const bad = []
  for (const el of document.querySelectorAll('button, [role="button"], a, select')) {
    const r = el.getBoundingClientRect()
    if (!r.height || !r.width) continue                // hidden — ignore
    if (el.disabled) continue
    // The house pattern for a small control is "extend the TARGET, never the PAINT": an absolutely
    // positioned, transparent pseudo-element larger than the button. .noto-help does exactly this
    // — 15px painted, 44px tappable — so measuring only getBoundingClientRect() reports a control
    // as tiny when its real hit area is fine. Take the largest of the box and its two pseudos.
    let w = r.width, h = r.height
    for (const pseudo of ['::before', '::after']) {
      const cs = getComputedStyle(el, pseudo)
      if (cs.content === 'none' || cs.position !== 'absolute') continue
      const pw = parseFloat(cs.width), ph = parseFloat(cs.height)
      if (isFinite(pw)) w = Math.max(w, pw)
      if (isFinite(ph)) h = Math.max(h, ph)
    }
    if (h < min || w < min) {
      bad.push({ w: Math.round(w), h: Math.round(h), txt: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 24) })
    }
  }
  return bad
}

// Text wider than the box that holds it. This is the specific damage a type-scale increase does,
// and it is silent: the layout does not break, a word just disappears off the edge. Deliberate
// truncation is excluded — an element that asked for text-overflow:ellipsis is doing this on
// purpose, and this app truncates set names and vendor names by design in several places.
function auditClipping() {
  const bad = []
  for (const el of document.querySelectorAll('*')) {
    if (el.children.length || !el.textContent.trim()) continue
    // .sr-only is a 1px box with overflow:hidden BY DESIGN — it names a screen for assistive tech
    // without painting. It is clipped in the literal sense and that is the entire point, so it is
    // the one thing this check must not flag.
    if (el.closest('.sr-only')) continue
    const cs = getComputedStyle(el)
    if (cs.textOverflow === 'ellipsis') continue        // intentional
    if (cs.overflow === 'visible' && cs.overflowX === 'visible') continue // spills, does not clip
    if (!el.getClientRects().length) continue
    const over = el.scrollWidth - el.clientWidth
    if (over > 2) bad.push({ over, cls: el.className || el.tagName, txt: el.textContent.trim().slice(0, 30) })
  }
  return bad
}

// Does a utility class actually take effect where it is used?
//
// This is the specific way a class-extraction refactor fails silently. `.mt-5` and `.banner` have
// the SAME specificity (0-1-0), so the one written later in the stylesheet wins — and the utility
// block sits near the top of styles.css while most component classes are hundreds of lines below
// it. Move `marginTop: 12` off an element and onto `.mt-5`, and if that element also carries a
// component class setting margin-top, the inline value that used to win is simply gone. Nothing
// errors. The gap just changes.
//
// So: for every element wearing a utility, compare the computed value against what the utility
// asks for. A mismatch means the utility lost and the element silently changed.
function auditUtils(steps) {
  const bad = []
  for (const [cls, want] of Object.entries(steps.mt)) {
    for (const el of document.querySelectorAll('.' + cls)) {
      if (!el.getClientRects().length) continue
      const actual = parseFloat(getComputedStyle(el).marginTop)
      if (Math.abs(actual - want) > 0.5) {
        bad.push({ cls, want, actual, other: [...el.classList].filter(c => c !== cls).join(' ') || '(none)' })
      }
    }
  }
  // .cap must land on the caption step unless a .t-* deliberately overrides it on the same element.
  for (const el of document.querySelectorAll('.cap')) {
    if (!el.getClientRects().length) continue
    if (/\bt-(xs|sm|md|lg|xl|2xl)\b/.test(el.className)) continue
    const fs = parseFloat(getComputedStyle(el).fontSize)
    if (Math.abs(fs - steps.cap) > 0.5) {
      bad.push({ cls: 'cap', want: steps.cap, actual: fs, other: el.className })
    }
  }
  return bad
}

function auditTabsFit() {
  const strip = document.querySelector('.topbar .tabs')
  if (!strip) return null                              // phone: replaced by the bottom nav
  if (getComputedStyle(strip).display === 'none') return null
  return { scrollW: strip.scrollWidth, clientW: strip.clientWidth }
}

// ---------- driver ----------
try {
  if (!(await waitForServer())) throw new Error('vite did not come up on port ' + PORT)
  const browser = await chromium.launch()

  console.log(`\n=== UI FLOOR CHECKS — ${TABS.length} tabs × ${VIEWPORTS.length} viewports ===\n`)

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.coarse,
      // Drives the (pointer: coarse) branch of the tap-target rules, so the phone run checks the
      // 44px floor and the desktop runs check 32px — exactly as the stylesheet splits them.
      isMobile: vp.coarse,
    })
    const page = await ctx.newPage()
    // React's DOM-nesting and invalid-prop warnings only ever reach the console, so a structural
    // mistake is invisible to every other check here. `<h3>` nested inside `<h3>` shipped exactly
    // this way once: the page rendered, looked correct, and told nobody.
    const consoleErrors = []
    page.on('console', msg => {
      if (msg.type() !== 'error' && msg.type() !== 'warning') return
      const t = msg.text()
      if (/validateDOMNesting|Warning:|React does not recognize|Each child in a list/.test(t)) {
        consoleErrors.push(t.slice(0, 160).replace(/\s+/g, ' '))
      }
    })
    await page.goto(URL, { waitUntil: 'load' })
    await page.waitForSelector('.topbar', { timeout: 15000 })
    await page.waitForTimeout(1200) // let the lazy tab chunk paint

    for (const label of TABS) {
      // The tab lives in the top bar on desktop and the bottom nav on the phone; both are
      // buttons carrying the same label, so one selector covers both.
      const tab = page.getByRole('button', { name: label, exact: false }).first()
      if (await tab.count()) {
        await tab.click({ timeout: 5000 }).catch(() => {})
        await page.waitForTimeout(700)
      }
      const where = `${vp.name}/${label}`

      if (CHECKS.tabsFit) {
        const fit = await page.evaluate(auditTabsFit)
        if (fit) {
          check('top bar shows every tab', fit.scrollW <= fit.clientW,
            `${where}: tab strip needs ${fit.scrollW}px, has ${fit.clientW}px`)
        }
      }

      if (CHECKS.noHScroll) {
        const over = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth)
        check('page does not scroll sideways', over <= 1, `${where}: overflows by ${over}px`)
      }

      if (CHECKS.typeFloor) {
        const { floor, bad } = await page.evaluate(auditTypeFloor, TYPE_FLOOR_EXEMPT)
        check(`no text below ${floor}px`, bad.length === 0,
          `${where}: ${bad.length} node(s), smallest ${Math.min(...bad.map(b => b.fs))}px` +
          (bad.length ? ` e.g. "${bad[0].txt}"` : ''))
        if (VERBOSE && bad.length) bad.forEach(b => console.log(`        ${b.fs}px  ${b.cls}  "${b.txt}"`))
      }

      if (CHECKS.tapTargets) {
        const min = vp.coarse ? 44 : 32
        const bad = await page.evaluate(auditTapTargets, min)
        check(`controls reach ${min}px (${vp.coarse ? 'touch' : 'mouse'})`, bad.length === 0,
          `${where}: ${bad.length} control(s) too small` +
          (bad.length ? ` e.g. "${bad[0].txt}" ${bad[0].w}×${bad[0].h}` : ''))
        if (VERBOSE && bad.length) bad.forEach(b => console.log(`        ${b.w}×${b.h}  "${b.txt}"`))
      }

      if (CHECKS.noClipping) {
        const bad = await page.evaluate(auditClipping)
        check('text is not clipped by its box', bad.length === 0,
          `${where}: ${bad.length} clipped` + (bad.length ? ` e.g. "${bad[0].txt}" by ${bad[0].over}px` : ''))
        if (VERBOSE && bad.length) bad.forEach(b => console.log(`        +${b.over}px  ${b.cls}  "${b.txt}"`))
      }

      if (CHECKS.hoverOnly) {
        const bad = await page.evaluate(auditHoverOnly)
        check('no hover-only title= prose', bad.length === 0,
          `${where}: ${bad.length} title(s) over 40 chars` + (bad.length ? ` e.g. "${bad[0].txt}…" (${bad[0].len})` : ''))
        if (VERBOSE && bad.length) bad.forEach(b => console.log(`        ${b.len}ch  ${b.cls}  "${b.txt}"`))
      }

      if (CHECKS.utilsWin) {
        const STEPS = { cap: 12, mt: { 'mt-0': 0, 'mt-1': 2, 'mt-2': 4, 'mt-3': 6, 'mt-4': 8, 'mt-5': 12, 'mt-6': 16, 'mt-7': 24 } }
        const bad = await page.evaluate(auditUtils, STEPS)
        check('utility classes are not overridden', bad.length === 0,
          `${where}: ${bad.length} lost` +
          (bad.length ? ` e.g. .${bad[0].cls} wants ${bad[0].want} got ${bad[0].actual} (on "${bad[0].other}")` : ''))
        if (VERBOSE && bad.length) bad.forEach(b => console.log(`        .${b.cls} ${b.want}→${b.actual}  on "${b.other}"`))
      }

      if (CHECKS.headings) {
        // Counting headings is not enough. `button` is children-presentational in ARIA, so a
        // heading INSIDE a clickable row is not exposed as a heading at all — the markup gains an
        // h3 and assistive tech gains nothing. That is exactly how the first version of the
        // Collapse change shipped, and it passed a count-only check. Assert the structure too.
        const h = await page.evaluate(() => {
          const all = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
          return {
            n: all.length,
            swallowed: all.filter(x => x.closest('button,[role="button"]'))
              .map(x => x.textContent.trim().slice(0, 30)),
          }
        })
        check('document has a heading outline', h.n > 0, `${where}: 0 headings`)
        check('no heading is buried inside a button', h.swallowed.length === 0,
          `${where}: ${h.swallowed.length} swallowed e.g. "${h.swallowed[0] || ''}"`)
      }
    }

    // Focus ring: Tab off the address bar into the page, then read what the browser painted.
    // Done once per viewport rather than per tab — the rule is global, not per screen.
    //
    // BLUR FIRST. The tab walk above ends with a click, so focus is sitting on whatever it
    // clicked last — and when that is the final control in the document (the last button in
    // the bottom nav, on a phone) the next Tab leaves the page entirely and this reported a
    // missing focus ring that was never missing. The check means "Tab INTO the page", so it
    // has to start from outside it.
    if (CHECKS.focusRing) {
      await page.evaluate(() => document.activeElement?.blur?.())
      await page.keyboard.press('Tab')
      const ring = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return { none: true }
        const cs = getComputedStyle(el)
        return {
          tag: el.tagName, cls: String(el.className).slice(0, 30),
          width: cs.outlineWidth, style: cs.outlineStyle, color: cs.outlineColor,
        }
      })
      const ok = !ring.none && ring.style !== 'none' && parseFloat(ring.width) > 0
      check('first Tab stop shows a focus ring', ok,
        ring.none ? `${vp.name}: Tab did not reach a control`
                  : `${vp.name}: <${ring.tag} class="${ring.cls}"> outline ${ring.style} ${ring.width}`)
    }

    if (CHECKS.noConsoleErr) {
      const uniq = [...new Set(consoleErrors)]
      check('no React warnings in the console', uniq.length === 0,
        `${vp.name}: ${uniq.length} — ${uniq[0] || ''}`)
      if (VERBOSE) uniq.forEach(e => console.log(`        ${e}`))
    }

    await ctx.close()
  }

  await browser.close()

  const enabled = Object.entries(CHECKS).filter(([, v]) => v).map(([k]) => k)
  console.log(`\n  ${enabled.length} of ${Object.keys(CHECKS).length} check groups enabled: ${enabled.join(', ')}`)
  console.log(failures ? `\n  ${failures} FAILURE(S)\n` : '\n  All enabled checks passed.\n')
  process.exitCode = failures ? 1 : 0
} catch (e) {
  console.error('VERIFY-UI ERROR:', e.message)
  process.exitCode = 1
} finally {
  if (!process.env.KEEP) {
    try { server.kill('SIGKILL') } catch {}
    try { execSync(`lsof -ti tcp:${PORT} | xargs kill -9`, { stdio: 'ignore' }) } catch {}
  }
}
