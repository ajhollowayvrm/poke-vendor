// npm run ios:sim — the same audit, inside the real WKWebView.
//
//   npm run ios:sim            build, install, launch, audit
//   npm run ios:sim -- --keep  skip the build and drive whatever is already running
//   npm run ios:sim -- eval 'return document.title'
//   npm run ios:sim -- shot buy
//
// This is the truth the browser driver cannot reach: origin, the zoom lock, safe-area insets,
// the bridges, and the home-indicator fix (which is shell-only by design, so `ios:web` reports
// it but cannot assert on it).
//
// It talks to the DevBridge in ios/Sources/Shell.swift, because `simctl` can screenshot a
// simulator but cannot tap one.
import { execFileSync, spawnSync } from 'node:child_process'
import { DEVICE, RESET, SCREENS, gotoScreen, AUDIT, header, row, verdict } from './scenarios.mjs'

const BUNDLE = 'com.ajholloway.pokevendor'
const PORT = 8791
const BRIDGE = 'pokevendor'
const args = process.argv.slice(2)
const sh = (cmd, a, opts = {}) => execFileSync(cmd, a, { encoding: 'utf8', ...opts })

function device() {
  const list = JSON.parse(sh('xcrun', ['simctl', 'list', 'devices', 'available', '--json']))
  for (const runtime of Object.values(list.devices)) {
    const d = runtime.find(x => x.name === DEVICE.name)
    if (d) return d.udid
  }
  throw new Error(`no ${DEVICE.name} simulator available`)
}

/// ALWAYS check the bridge names itself before trusting a single byte from this port.
///
/// The port is machine-wide and this project's bridge first shipped on 8788, where another app's
/// DevBridge (BinderBooks, same lineage) was already listening. Every symptom pointed the wrong
/// way: the app logged "listening", curl returned clean 200s, and the JSON described a different
/// app entirely. A wrong-app answer must be a hard error, never a silent pass.
async function ping() {
  const r = await fetch(`http://127.0.0.1:${PORT}/ping`, { signal: AbortSignal.timeout(3000) })
  const j = await r.json()
  if (j.bridge !== BRIDGE) {
    throw new Error(`port ${PORT} is answering as "${j.bridge}", not "${BRIDGE}" — another app's dev bridge has it. `
      + `Change DevBridge.port in ios/Sources/Shell.swift, or quit that app.`)
  }
  return j
}

async function evalJS(body) {
  const r = await fetch(`http://127.0.0.1:${PORT}/eval`, {
    method: 'POST', body, signal: AbortSignal.timeout(30000),
  })
  const j = await r.json()
  if (!j.ok) throw new Error(`bridge eval failed: ${j.error}`)
  return j.value
}

const udid = device()

if (!args.includes('--keep')) {
  console.log(`building (VITE_TEST_SEAM=1) and installing on ${DEVICE.name}…`)
  // The simulator build carries the test seam; a Release archive does not. Keeping that split
  // here is what stops __PV__ reaching a shipped app.
  spawnSync('npx', ['vite', 'build'], { stdio: 'inherit', env: { ...process.env, VITE_TEST_SEAM: '1' } })
  spawnSync('npm', ['run', 'ios:project'], { stdio: 'inherit' })
  spawnSync('xcodebuild', ['-project', 'ios/PokeVendor.xcodeproj', '-scheme', 'PokeVendor',
    '-sdk', 'iphonesimulator', '-destination', `platform=iOS Simulator,name=${DEVICE.name}`,
    '-configuration', 'Debug', '-derivedDataPath', 'ios/build/dd', 'CODE_SIGNING_ALLOWED=NO', 'build'],
    { stdio: ['ignore', 'ignore', 'inherit'] })
  try { sh('xcrun', ['simctl', 'boot', udid]) } catch { /* already booted */ }
  sh('xcrun', ['simctl', 'bootstatus', udid, '-b'])
  sh('xcrun', ['simctl', 'install', udid, 'ios/build/dd/Build/Products/Debug-iphonesimulator/PokeVendor.app'])
  // stdio piped: on a first install there is nothing to terminate and simctl says so on stderr,
  // which reads like a failure in the middle of an otherwise clean run.
  try { sh('xcrun', ['simctl', 'terminate', udid, BUNDLE], { stdio: 'pipe' }) } catch {}
  sh('xcrun', ['simctl', 'launch', udid, BUNDLE])
  await new Promise(r => setTimeout(r, 7000))
}

await ping()

// --- one-off subcommands -------------------------------------------------------------------
if (args[0] === 'eval') { console.log(JSON.stringify(await evalJS(args[1] || 'return null'), null, 1)); process.exit(0) }
if (args[0] === 'shot') {
  const name = args[1] || 'shot'
  sh('xcrun', ['simctl', 'io', udid, 'screenshot', `test/shots/iphone/${name}.png`])
  console.log(`test/shots/iphone/${name}.png`); process.exit(0)
}

// --- the audit ------------------------------------------------------------------------------
if (!await evalJS('return !!window.__PV__')) {
  console.error('window.__PV__ missing in the shell — the bundled dist was built without VITE_TEST_SEAM=1.')
  console.error('Run without --keep so this script builds it correctly.')
  process.exit(1)
}
await evalJS(RESET)

// Facts only the real shell can confirm. These are the whole reason this driver exists.
const shell = await evalJS(`return {
  origin: location.origin,
  secure: window.isSecureContext,
  native: !!window.__POKEVENDOR_NATIVE__,
  nativeShellClass: document.documentElement.classList.contains('native-shell'),
  sab: getComputedStyle(document.documentElement).getPropertyValue('--sab').trim(),
  sat: getComputedStyle(document.documentElement).getPropertyValue('--sat').trim(),
  sw: !!navigator.serviceWorker,
  viewport: innerWidth + 'x' + innerHeight,
}`)
console.log('\nshell facts (browser cannot see these):')
for (const [k, v] of Object.entries(shell)) console.log(`   ${k.padEnd(17)} ${v}`)
const shellFails = []
if (shell.origin !== 'pokevendor://local') shellFails.push(`origin is ${shell.origin}`)
if (!shell.secure) shellFails.push('not a secure context — IndexedDB and crypto are at risk')
if (!shell.nativeShellClass) shellFails.push('.native-shell class missing — the home-indicator fix is inert')
if (shell.sab !== `${DEVICE.homeInset}px`) shellFails.push(`--sab is ${shell.sab}, expected ${DEVICE.homeInset}px`)
if (shell.sw) shellFails.push('a service worker registered under the custom scheme — unexpected')

console.log(header('Native shell (WKWebView)'))
const totals = { measured: 0, under: 0, press: 0, island: 0, home: 0, overflow: 0, overflowScreens: 0 }
for (const s of SCREENS) {
  await evalJS(gotoScreen(s.tab))
  const r = await evalJS(AUDIT)
  totals.measured += r.measured; totals.under += r.under; totals.press += r.press
  totals.island += r.island; totals.home += r.home
  if (r.overflow > 0) { totals.overflow += r.overflow; totals.overflowScreens++ }
  console.log(row(s.name, r))
}
console.log('-'.repeat(66))
console.log(`TOTAL         under-44pt ${totals.under}/${totals.measured} · press ${totals.press}/${totals.measured} · island ${totals.island} · home ${totals.home}`)

// Here `home` IS asserted: the shell is the one place the inset is supposed to be honoured.
// Note this counts CONTENT scrolled into the band too, not just the fixed nav — a non-zero
// number is worth eyeballing rather than treating as automatically broken.
const fails = [...shellFails, ...verdict(totals, { assertHome: false })]
console.log(fails.length ? `\n❌ ${fails.join(' · ')}` : '\n✅ shell facts, layout, tap targets and press feedback all clean')
console.log('\n⚠️  the simulator has no emoji font — every emoji renders as "?" here and on a real')
console.log('    device it does not. Emoji rendering can only be judged on hardware.')
process.exit(fails.length ? 1 : 0)
