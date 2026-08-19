// The iOS shell bridge.
//
// ios/Sources/Shell.swift injects `window.__POKEVENDOR_NATIVE__ = true` at document start, before
// any of our script runs, and registers two WKScriptMessageHandlers. This module is the only place
// that knows about either, so every native path stays guarded and the same build still runs as a
// PWA, from a dev server, and on GitHub Pages with no shell at all.
//
// Two of the three things here are BUG FIXES rather than enhancements — the web APIs they replace
// are not merely worse in a WKWebView, they do nothing at all:
//
//   • navigator.vibrate is unimplemented in iOS Safari/WKWebView entirely, so the app's haptics
//     setting has never done anything on an iPhone.
//   • a.download is inert in a WKWebView, so ErrorBoundary's "download your save" silently failed
//     in the crash path.

export const isNativeShell = typeof window !== 'undefined' && window.__POKEVENDOR_NATIVE__ === true

function post(name, body) {
  try {
    window.webkit?.messageHandlers?.[name]?.postMessage(body)
    return true
  } catch {
    return false
  }
}

// Map a navigator.vibrate pattern onto a UIFeedbackGenerator kind.
//
// navigator.vibrate takes milliseconds — either a single duration or an on/off array. iOS haptics
// are not durations, they are named styles, so this reads the pattern's INTENT: how long, and how
// many pulses. The thresholds match what feedback.js actually passes (8 and 12 for taps, 24 for the
// tear, 3-6 element arrays for hits and god packs).
function hapticKind(pattern) {
  if (Array.isArray(pattern)) {
    const pulses = pattern.filter((v, i) => i % 2 === 0 || v > 0).length
    // A long multi-pulse burst is the god-pack/jackpot flourish.
    if (pulses >= 5) return 'success'
    const peak = Math.max(...pattern)
    return peak >= 40 ? 'warning' : 'medium'
  }
  const ms = Number(pattern) || 0
  if (ms >= 20) return 'heavy'
  if (ms >= 12) return 'medium'
  return 'light'
}

/// Fire a haptic. Returns true if the native bridge took it, so the caller can fall back.
export function nativeHaptic(pattern) {
  if (!isNativeShell) return false
  return post('haptics', hapticKind(pattern))
}

/// Hand a text file to the iOS share sheet. Returns true if the bridge took it.
export function nativeSaveFile(name, text) {
  if (!isNativeShell) return false
  return post('saveFile', { name: String(name || ''), text: String(text ?? '') })
}
