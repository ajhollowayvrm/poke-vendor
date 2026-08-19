// npm run ios:device — build, sign and install onto a connected iPhone.
//
// You need this more often than you would think: a FREE Apple developer signature expires after
// 7 days, and the app then refuses to launch until it is re-signed. This is that, in one command.
//
// Two things here were not obvious and cost real time to work out, so they are automated rather
// than written down as instructions to follow by hand:
//
//  1. DEVELOPMENT_TEAM is NOT the number in the signing identity's name. The identity reads
//     "Apple Development: you@example.com (9Z2HDDXR94)" and that parenthetical is the identity's
//     own id — passing it gives `error: No Account for Team "9Z2HDDXR94"`, which reads like a
//     missing Xcode account rather than a wrong argument. The team is the certificate's OU field.
//  2. A free profile allows THREE sideloaded apps per device, total, across every project. The
//     fourth install fails with "its integrity could not be verified" and MIInstallerErrorDomain
//     error 13 — which sounds like a signing problem and is not one. The fix is to delete an app
//     (which deletes its container, and therefore its local saves) or to pay for an account.
import { execFileSync } from 'node:child_process'

const BUNDLE = 'com.ajholloway.pokevendor'
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts })
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' })

/// The team id, read from the signing certificate's OU rather than guessed from its name.
function teamId() {
  const ids = sh('security', ['find-identity', '-v', '-p', 'codesigning'])
  const name = ids.match(/"(Apple Development: [^"]+)"/)?.[1]
  if (!name) throw new Error('no Apple Development identity in the keychain — sign in to Xcode → Settings → Accounts first')
  const pem = sh('security', ['find-certificate', '-c', name, '-p'])
  const subject = sh('openssl', ['x509', '-noout', '-subject'], { input: pem })
  const ou = subject.match(/OU\s*=\s*([A-Z0-9]+)/)?.[1]
  if (!ou) throw new Error(`could not read the team (OU) from the certificate for "${name}"`)
  return { team: ou, identity: name }
}

/// The first connected, paired iPhone.
function device() {
  const out = sh('xcrun', ['devicectl', 'list', 'devices'])
  const line = out.split('\n').find(l => /iPhone/.test(l) && /available/.test(l))
  if (!line) throw new Error('no available iPhone — plug one in, unlock it, and trust this Mac')
  const udid = line.match(/([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})/i)?.[1]
  if (!udid) throw new Error(`could not parse a device id from: ${line.trim()}`)
  return { udid, name: line.split(/\s{2,}/)[0].trim() }
}

const { team, identity } = teamId()
const { udid, name } = device()
console.log(`signing as ${identity}\n   team   ${team}\n   device ${name} (${udid})\n`)

console.log('building the web app (production — no test seam)…')
run('npm', ['run', 'ios:build'])

console.log('\nbuilding + signing for the device…')
run('xcodebuild', ['-project', 'ios/PokeVendor.xcodeproj', '-scheme', 'PokeVendor',
  '-sdk', 'iphoneos', '-destination', 'generic/platform=iOS', '-configuration', 'Release',
  '-derivedDataPath', 'ios/build/dev', '-allowProvisioningUpdates',
  `DEVELOPMENT_TEAM=${team}`, 'CODE_SIGN_STYLE=Automatic', 'build'])

console.log('\ninstalling…')
try {
  run('xcrun', ['devicectl', 'device', 'install', 'app', '--device', udid,
    'ios/build/dev/Build/Products/Release-iphoneos/PokeVendor.app'])
} catch {
  console.error('\n❌ install failed.')
  console.error('   If it mentioned "maximum number of installed apps using a free developer profile":')
  console.error('   a free profile allows THREE sideloaded apps per device across ALL your projects.')
  console.error('   Delete one from the phone to make room — note that removing an app deletes its')
  console.error('   container, and with it any save that is not backed up to a cloud account.')
  process.exit(1)
}

run('xcrun', ['devicectl', 'device', 'process', 'launch', '--device', udid, BUNDLE])
console.log('\n✅ installed and launched.')
console.log('   A free signature expires after 7 days; re-run this when the app stops launching.')
