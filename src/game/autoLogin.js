// Personal-build auto sign-in.
//
// PokéVendor has one player, so being asked for a password on his own phone is pure friction.
// This signs in silently at boot from credentials baked in at build time.
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// WHERE THE PASSWORD ENDS UP. Read this before changing anything here.
//
// `import.meta.env.*` is INLINED BY VITE AT BUILD TIME. It is not read at runtime and it is not
// secret — whatever is in these two variables ends up as a plain string inside the JavaScript
// bundle of any build that had them set. So the ONLY thing keeping this out of the public web
// build is which env file Vite loads, and that is decided by the BUILD MODE:
//
//   npm run build            mode=production → loads .env / .env.local        → NO credentials
//   vite build --mode shell  mode=shell      → ALSO loads .env.shell[.local]  → credentials
//
// The credentials therefore live in `.env.shell.local`, which Vite loads ONLY in shell mode and
// which .gitignore excludes. `npm run build` — the one that deploys to GitHub Pages, from a
// PUBLIC repo — cannot see them even by accident, because production mode never reads that file.
//
// That leaves exactly one place the password exists: the .ipa on the phone. Anyone who gets that
// build gets the account. That is the accepted trade for a single-user personal app; it is not
// a pattern to copy into anything with more than one user.
//
// The runtime `isNativeShell` guard below is a SECOND belt, not the main one. It stops a
// shell-mode bundle from auto-signing-in if it were ever served over the web — but it cannot
// remove the string from the file, so it is not what makes this safe. The build mode is.
// ────────────────────────────────────────────────────────────────────────────────────────────
import { authConfigured, currentUser, signIn } from './auth'
import { isNativeShell } from './native'

const EMAIL = import.meta.env.VITE_AUTO_LOGIN_EMAIL
const PASSWORD = import.meta.env.VITE_AUTO_LOGIN_PASSWORD

/// True when this build carries credentials AND is running where they are meant to be used.
export function autoLoginConfigured() {
  return !!(EMAIL && PASSWORD && authConfigured() && isNativeShell)
}

/// Sign in if nobody is signed in yet. Safe to call on every boot: an existing session short-
/// circuits, so the normal path is doing nothing at all.
///
/// Deliberately quiet on failure. A wrong password or a dead network must not block the app —
/// the game is fully playable signed out, and the ordinary sign-in screen is still there in
/// Settings. Returns what happened so the caller can log it during development.
export async function autoLoginIfConfigured() {
  if (!autoLoginConfigured()) return { ok: false, reason: 'not configured' }
  if (currentUser()) return { ok: true, reason: 'already signed in' }
  try {
    await signIn(EMAIL, PASSWORD)
    return { ok: true, reason: 'signed in' }
  } catch (e) {
    // Most likely a changed password or no network. Both are recoverable by hand, and neither
    // is worth interrupting the boot for.
    return { ok: false, reason: e?.message || 'sign-in failed' }
  }
}
