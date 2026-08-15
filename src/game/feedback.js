// Pack-rip feedback: synthesized sound + haptics. No audio assets — everything is
// generated with the Web Audio API so it stays dependency-free and works offline
// (this is a PWA). Sound and haptics are each gated by a user setting; call
// configureFeedback() when those settings change, and primeAudio() from the first
// user gesture (the rip click/drag) so the AudioContext is allowed to start.

import { nativeHaptic } from './native'

let ctx = null
const enabled = { sound: true, haptics: true }

export function configureFeedback({ sound, haptics }) {
  if (typeof sound === 'boolean') enabled.sound = sound
  if (typeof haptics === 'boolean') enabled.haptics = haptics
}

// Lazily create (and resume) the AudioContext. Returns null if audio is off or
// the browser has no Web Audio support. Safe to call every play — mobile browsers
// suspend the context between gestures, so we resume each time.
function ac() {
  if (!enabled.sound || typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!ctx) { try { ctx = new AC() } catch { return null } }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// Warm the context on a user gesture so later plays aren't blocked by autoplay policy.
export function primeAudio() { ac() }

// A single enveloped oscillator note. `slideTo` sweeps the pitch over the note.
function tone(freq, { type = 'sine', dur = 0.12, gain = 0.2, attack = 0.005, when = 0, slideTo = null } = {}) {
  const c = ac(); if (!c) return
  const t0 = c.currentTime + when
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(c.destination)
  osc.start(t0); osc.stop(t0 + dur + 0.02)
}

// A burst of filtered noise — used for the paper tear.
function noise({ dur = 0.4, gain = 0.25, from = 1600, to = 220 } = {}) {
  const c = ac(); if (!c) return
  const t0 = c.currentTime
  const frames = Math.max(1, Math.floor(c.sampleRate * dur))
  const buf = c.createBuffer(1, frames, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
  const src = c.createBufferSource(); src.buffer = buf
  const filt = c.createBiquadFilter(); filt.type = 'bandpass'
  filt.frequency.setValueAtTime(from, t0)
  filt.frequency.exponentialRampToValueAtTime(to, t0 + dur)
  filt.Q.value = 0.8
  const g = c.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(filt).connect(g).connect(c.destination)
  src.start(t0); src.stop(t0 + dur)
}

// Every call below passes a navigator.vibrate pattern, which is the right shape for Android and
// for desktop Chrome — and does NOTHING on an iPhone, because iOS Safari and WKWebView do not
// implement navigator.vibrate at all. So on iOS this setting has never produced a single buzz.
// Inside the native shell the pattern is translated to a UIFeedbackGenerator instead (see
// game/native.js); everywhere else the web path is unchanged.
function vibrate(pattern) {
  if (!enabled.haptics) return
  if (nativeHaptic(pattern)) return
  if (typeof navigator === 'undefined' || !navigator.vibrate) return
  try { navigator.vibrate(pattern) } catch { /* ignore */ }
}

// ---- Public SFX (each also fires its matching haptic) ----

// Pack tearing open — a paper rip whoosh plus a low thump.
export function sfxTear() {
  noise({ dur: 0.45, gain: 0.22, from: 1800, to: 240 })
  tone(140, { type: 'sine', dur: 0.25, gain: 0.18, slideTo: 70 })
  vibrate(24)
}

// A plain card flipping face-up — a soft snap.
export function sfxFlip() {
  tone(880, { type: 'triangle', dur: 0.06, gain: 0.12, slideTo: 560 })
  vibrate(8)
}

// A hit landed. `rank` (>=0) raises the pitch so rarer cards literally sound rarer;
// `top` adds a shimmer for chase-tier pulls.
export function sfxHit(rank = 0, top = false) {
  const base = 392 * Math.pow(2, Math.max(0, rank) / 12) // G4, up a semitone per rarity step
  const notes = top ? [1, 1.25, 1.5, 2] : [1, 1.25, 1.5]
  notes.forEach((m, i) => tone(base * m, { type: 'triangle', dur: top ? 0.5 : 0.28, gain: 0.17, when: i * 0.07 }))
  if (top) {
    for (let i = 0; i < 6; i++) tone(base * 2 * (1 + i * 0.14), { type: 'sine', dur: 0.32, gain: 0.05, when: 0.28 + i * 0.05 })
  }
  vibrate(top ? [0, 40, 40, 60] : [0, 25, 35, 25])
}

// A card that fills someone's want. Deliberately NOT sfxHit: a want-fill isn't rarer, it's spoken
// for — so it's a warm two-note "that's sold" chime rather than a rising rarity arpeggio. A $2
// common somebody asked for used to ring exactly like a chase pull, and a chase that ALSO filled
// a want said nothing extra. `delay` layers it after the hit sting when a card is both; the haptic
// is skipped in that case so the hit's own pattern isn't overwritten mid-buzz.
export function sfxWant(delay = 0) {
  tone(587.33, { type: 'sine', dur: 0.2, gain: 0.13, when: delay })            // D5
  tone(880,    { type: 'sine', dur: 0.34, gain: 0.12, when: delay + 0.11 })    // A5, a fifth up
  tone(1174.66,{ type: 'sine', dur: 0.3, gain: 0.05, when: delay + 0.11 })     // D6 shimmer on top
  if (!delay) vibrate([0, 18, 30, 18])
}

// A soft rising "something's coming" swell, played just before a chase card flips.
export function sfxTension() {
  tone(220, { type: 'sine', dur: 0.7, gain: 0.1, slideTo: 660 })
  vibrate(12)
}

// The god/demigod finale — a bright ascending fanfare.
export function sfxGod() {
  const root = 523.25 // C5
  const chord = [1, 1.26, 1.5, 2]
  ;[0, 0.12, 0.24, 0.38].forEach((when, i) => tone(root * chord[i], { type: 'triangle', dur: 1.2, gain: 0.15, when }))
  for (let i = 0; i < 8; i++) tone(root * Math.pow(2, i / 7), { type: 'sine', dur: 0.5, gain: 0.06, when: 0.5 + i * 0.06 })
  vibrate([0, 60, 40, 60, 40, 120])
}
