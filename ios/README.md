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

```sh
npm run ios:build      # vite build, THEN xcodegen generate
open ios/PokeVendor.xcodeproj
```

Then ⌘R. Xcode signs with your Apple ID and installs directly.

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
