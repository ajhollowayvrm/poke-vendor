# PokéVendor on iPhone

A native iOS shell around the built web app. No Capacitor, no CocoaPods, no `www/` staging
directory. Ported from [Sideline](../../Sideline/ios/README.md), which solved the same problem.

Three files are the whole shell:

| File | What it is |
|---|---|
| `project.yml` | XcodeGen spec — the `.xcodeproj` is **generated**, never committed |
| `Sources/Shell.swift` | The entire app: a WKWebView, a URL-scheme handler, two JS bridges |
| `Resources/Assets.xcassets` | App icon + the launch-screen colour |

Target: **iPhone 17 Pro Max** (440 × 956 pt, DPR 3, 62 pt Dynamic Island, 34 pt home indicator),
portrait, iOS 18+.

---

## Build and run

**Onto a connected iPhone, in one command:**

```sh
npm run ios:device     # build + sign + install + launch
```

Or open it in Xcode and ⌘R:

```sh
npm run ios:build      # vite build, THEN xcodegen generate
open ios/PokeVendor.xcodeproj
```

### Two things that will bite you

**`DEVELOPMENT_TEAM` is not the number in the identity's name.** The signing identity reads
`Apple Development: you@example.com (9Z2HDDXR94)` and that parenthetical is the *identity's* id,
not the team. Passing it gives:

```
error: No Account for Team "9Z2HDDXR94". Add a new account in Accounts settings…
```

…which reads like a missing Xcode account and is actually a wrong argument. The team is the
certificate's **OU** field. `ios:device` reads it for you:

```sh
security find-certificate -c "Apple Development: …" -p | openssl x509 -noout -subject
# subject=UID=…, CN=Apple Development: …, OU=2BY68WLT6R, O=…
#                                        ^^^^^^^^^^^^^ this one
```

**A free profile allows THREE sideloaded apps per device**, across every project you own — not
three per project. The fourth install fails with *"its integrity could not be verified"* and
`MIInstallerErrorDomain error 13`, which sounds like a signing problem and is not one. Delete an
app to make room — and note that removing an app deletes its **container**, and with it any save
not backed up to a cloud account.

**A free signature expires after 7 days.** The app then refuses to launch until you re-run
`npm run ios:device`. Saves survive that, because they belong to the container and the container
survives anything short of deleting the app. A paid account ($99/yr) removes both the 7-day
expiry and the 3-app cap.

**`npm run ios:build`, not `npm run ios:project`.** This is the one way PokéVendor differs from
Sideline day to day. Sideline references its single `index.html` in place, so editing the game and
rebuilding is the whole loop. PokéVendor is a Vite app: the shell bundles `dist/`, so **`npm run
build` must run first**. Xcode will happily archive a stale or missing `dist` without complaining.

**Set your own bundle ID before the first install.** `PRODUCT_BUNDLE_IDENTIFIER` is
`com.ajholloway.pokevendor` in `project.yml`. It identifies the app's **container**, so changing it
after installing strands every save inside the old one.

A **free Apple ID expires the signature after 7 days** — the app then refuses to launch until you
⌘R again. Saves survive that; they belong to the container.

**Web Inspector** is on (`isInspectable = true`): iPhone → Settings → Safari → Advanced → Web
Inspector, then Mac Safari → Develop → *[your iPhone]* → PokéVendor.

---

## Why a shell at all

Four things, and only the first is what people usually expect:

- **Zoom.** iOS Safari has ignored `user-scalable=no` since iOS 10 as an accessibility policy, so
  a web page cannot stop pinch and double-tap zoom however it writes its viewport meta. In a
  WKWebView the scroll view is ours and is pinned shut.
- **Origin.** The save is IndexedDB, and storage is keyed to origin. `loadFileURL()` gives an
  opaque `file://` origin where WebKit's storage behaviour is unreliable. The page is served over
  `pokevendor://` instead — a real, secure, **stable** origin, so saves survive app updates and
  `isSecureContext` stays true. **Verified:** a force-quit and relaunch keeps the save.
- **Haptics actually work for the first time.** `src/game/feedback.js` drives haptics through
  `navigator.vibrate`, which iOS Safari **does not implement at all** — so the app's haptics
  setting has never produced a single buzz on an iPhone. `game/native.js` translates the vibrate
  patterns into `UIFeedbackGenerator` calls.
- **`a.download` is inert** in a WKWebView, which is how `ErrorBoundary.jsx`'s "download your save
  backup" button came to silently do nothing — on the crash screen, where a silent failure costs
  most. It goes through the share sheet now.

---

## What changes inside the shell

The web layer knows about the shell only through `window.__POKEVENDOR_NATIVE__`, injected at
document start. Everything is guarded, so the same build still runs as a PWA and from a dev server.

| | Web | Shell |
|---|---|---|
| Haptics | `navigator.vibrate` (dead on iOS) | `UIFeedbackGenerator` bridge |
| Save-backup export | `a.download` (inert here) | share sheet bridge |
| Update prompt | service worker | **off** — a native app ships new code as a binary |
| Card-image cache | Workbox `CacheFirst` | `URLCache`, 512 MB on disk |

**The service worker does not run under a custom scheme.** Confirmed on device:
`navigator.serviceWorker` is `false`. That is fine for updates but it kills the app's card-art
cache, which is why `Shell.swift` installs a large `URLCache`. That is *not* an equivalent — it
obeys the CDN's headers rather than the worker's explicit 1000-entry / 14-day policy — so **watch
the app's storage figure in Settings**. `vite.config.js` records that ~6000 cached images ran
470–880 MB.

---

## Verified on the simulator

| Check | Result |
|---|---|
| Renders (not a plain-text `<pre>`) | ✅ — the MIME table is right |
| Origin | ✅ `pokevendor://local`, `isSecureContext: true` |
| Storage survives force-quit | ✅ |
| Service worker | ✅ correctly absent |
| Card art over the CDN | ✅ `<img>` loads (116 ms) |
| Sync Lambda | ✅ reachable (401 = auth, not CORS) |
| Cognito | ✅ reachable (400 = validation, not CORS) |
| Share-sheet bridge | ✅ presents a real share sheet |

**`fetch()` to `images.pokemontcg.io` is blocked by CORS** from a custom-scheme origin, and that is
harmless *only because* nothing fetches images — `preloadCardImages` and `HiResImg` both use
`Image()`. If image code ever moves to `fetch`, it will break here and nowhere else.

⚠️ **The simulator cannot render emoji.** Every emoji shows as a `?` box, in this app *and* in
simulator Safari, so it is a missing font in the runtime rather than an app bug. PokéVendor's UI is
emoji-heavy (every tab icon, every product icon), so **emoji rendering can only be checked on a
real device.**

---

## Auto sign-in (personal build only)

The phone can skip the login screen entirely:

```sh
cp .env.example .env.shell.local     # fill in your Cognito email + password
npm run ios:device
```

**Where the password ends up, precisely.** `import.meta.env.*` is inlined by Vite **at build
time** — it is not read at runtime and it is not secret. What keeps it out of the public site is
the build MODE, not the runtime guard:

| Command | Mode | Loads `.env.shell.local`? | Credentials in the bundle? |
|---|---|---|---|
| `npm run build` (→ GitHub Pages) | production | **no** | **no** |
| `npm run ios:build` / `ios:device` | shell | yes | yes |

So the credentials exist in exactly one artefact: the `.ipa` on the phone. Anyone with that build
has the account. That is the accepted trade for a one-player personal app and **not** a pattern to
copy anywhere with more than one user.

`.env*` is gitignored (`.env.example` excepted), and this repo is **public** — verify before every
push if you have touched any of this:

```sh
npm run build && grep -r VITE_AUTO_LOGIN dist/   # must find nothing
```

You may not need any of this. `RefreshTokenValidity` is already 3650 days and `getIdToken()`
refreshes silently, so a plain sign-in lasts ten years per device and survives reinstalling over
the top. Auto-login only saves the very first one.

## Testing how it feels

Two loops, sharing one definition (`tools/ios/scenarios.mjs`) so a difference between their
results is a difference in the **engine** and never in the setup.

```sh
npm run ios:web              # Playwright at iPhone metrics — ~30s, no Xcode
npm run ios:sim              # the real shell on a booted simulator — the truth
npm run ios:sim -- --keep    # skip the build, drive what is already running
npm run ios:sim -- eval 'return document.title'
npm run ios:sim -- shot buy
```

Per screen: horizontal overflow, controls under 44pt **measured by hit testing** (the box is what
a control paints; the target is what the finger gets), controls a `:active` rule answers, and
controls inside the 62pt island or the 34pt home-indicator band — reported separately, because
the first is a layout bug and the second is a gesture conflict with the system swipe-up.

**That the two disagree is the point.** Same code, same scenarios:

| | `ios:web` | `ios:sim` |
|---|---|---|
| island band | 6 | **0** |
| home band | 43 | **2** |

The browser has no safe-area insets to report, and the bottom nav deliberately keeps its
space-saving compromise there — only the shell takes the 34pt back. So `ios:web` reports both
numbers and asserts on neither; `ios:sim` is where they mean something.

`ios:sim` also checks what no browser can see: that the origin is `pokevendor://local`, that
`isSecureContext` holds, that `--sat`/`--sab` report 62/34px, and that no service worker
registered.

**The test seam.** Both drivers reach game state through `window.__PV__`, which `main.jsx`
exposes only under `VITE_TEST_SEAM`. It has to exist because the browser driver *could* import
the store through Vite's module graph but the shell cannot — it runs a production bundle — and
importing the store fresh hands back a **second, unhydrated store** that reports every value as
its initial state instead of erroring. Verify it never ships:

```sh
npm run build && grep __PV__ dist/assets/*.js   # must find nothing
```

`__PV__.flush()` is not a convenience: persist writes are debounced 400ms and IndexedDB is
async, so a driver that changes state and reloads immediately reads back the *previous* state —
which looks exactly like the feature under test being broken.

---

## The dev bridge

Debug builds carry a loopback HTTP listener that runs JavaScript inside the live web view, because
`simctl` can screenshot a simulator but cannot tap one.

```sh
curl -s http://127.0.0.1:8791/ping
curl -s -X POST http://127.0.0.1:8791/eval --data 'return document.title'
```

**Always check `/ping` names this bridge.** The port is shared machine-wide and this first shipped
on 8788, where it silently lost every request to another app's bridge — the process logged
"listening", the driver got clean 200s, and the JSON described a different app entirely.
`allowLocalEndpointReuse` (needed to rebind inside TIME_WAIT) is what defeats the busy-port guard,
so identity has to be checked by the caller.

Three things keep the bridge out of the product: `#if DEBUG` (Release archives carry no byte of
it), it binds `127.0.0.1` by name, and it adds **no** JavaScript API, so no app code can come to
depend on it.

---

## Changing things

| Want to | Do |
|---|---|
| Change the app icon | `npm run ios:icon` (renders `public/icon.svg` at 1024, square, no alpha) |
| Run on iPad | `TARGETED_DEVICE_FAMILY: "1,2"` in `project.yml` |
| Allow landscape | Add the landscape orientations to `UISupportedInterfaceOrientations` |
| Add a native capability | A `WKScriptMessageHandler` case in `Shell.swift`, plus a guarded wrapper in `src/game/native.js`. If you need a value back, use `WKScriptMessageHandlerWithReply` — `postMessage` then returns a real JS Promise |

**Don't change `Shell.scheme`.** It is the page's origin, and changing it orphans every save on
every device that already has the app.
