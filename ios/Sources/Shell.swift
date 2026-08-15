//  Shell.swift — the whole iOS app.
//
//  PokéVendor is a Vite/React PWA. This file is the native shell around its built `dist/` tree and
//  nothing more: it hosts a WKWebView, serves the bundle over a custom URL scheme, and does the
//  things a web page cannot do for itself on iOS. There is deliberately no framework here (no
//  Capacitor, no CocoaPods) — the app needs a handful of native capabilities, not a platform.
//
//  Ported from /Users/ajholloway/personal/Sideline/ios/Sources/Shell.swift. The reasoning in that
//  file was hard-won and is preserved here; the differences are marked "POKEVENDOR:".
//
//  What the shell exists to fix, in order of how much it matters:
//
//  1. ORIGIN. The save is IndexedDB (zustand persist) and storage is keyed to origin. Loading with
//     loadFileURL() gives an opaque file:// origin where WebKit's storage behaviour is unreliable,
//     so the page is served over a custom scheme instead (see BundleSchemeHandler). WKWebView
//     treats a registered custom scheme as a real, secure, STABLE origin — saves survive app
//     updates and window.isSecureContext stays true.
//  2. ZOOM. iOS Safari has ignored `user-scalable=no` since iOS 10 as an accessibility policy, so a
//     web page cannot stop double-tap and pinch zoom however it writes its viewport meta. In a
//     WKWebView the scroll view is ours, so it is pinned shut three ways below.
//  3. BOUNCE. Rubber-band overscroll, kept where a native app would have it (see the note).
//  4. HAPTICS. POKEVENDOR: this is not polish, it is a bug fix. src/game/feedback.js drives
//     haptics through navigator.vibrate, which iOS Safari does not implement AT ALL — so the
//     app's haptics setting has never done anything on an iPhone. This bridge is the first time
//     it works.
//  5. FILE SAVE. POKEVENDOR: also a bug fix. src/components/ErrorBoundary.jsx exports a save
//     backup with URL.createObjectURL + a.download, which is INERT in a WKWebView. That is the
//     crash-recovery escape hatch, so it fails silently at the worst possible moment.
//  6. IMAGE CACHE. POKEVENDOR: no Sideline equivalent. A service worker does not run under a
//     custom scheme, which kills the app's CacheFirst rule for remote card art. See makeConfig().

import UIKit
import WebKit
#if DEBUG
import Network
#endif

enum Shell {
    /// Registered with WKWebView as a custom scheme. Changing this string changes the page's origin,
    /// which orphans every save on every device that already has the app. Don't.
    static let scheme = "pokevendor"
    static let pageURL = URL(string: "\(scheme)://local/index.html")!
    /// --bg from styles.css, matching the manifest's theme_color. Used for the window, the view and
    /// the web view so there is no white flash between the launch screen and the first paint.
    static let background = UIColor(red: 0x0c / 255.0, green: 0x0f / 255.0, blue: 0x1a / 255.0, alpha: 1)
}

// MARK: - Serving the bundle

/// Serves the built Vite app over `pokevendor://`.
///
/// POKEVENDOR: unlike Sideline — one self-contained index.html — this answers a real tree:
/// index.html, assets/*.js, assets/*.css, the PWA icons and manifest. Sideline's handler was
/// already written directory-capable, which is why this port is small: it resolves any bundled
/// path, refuses anything escaping the bundle, and maps MIME by extension.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {

    /// BARE types, with no `; charset=` parameter on any of them.
    ///
    /// `URLResponse.mimeType` takes the type alone; the encoding belongs in `textEncodingName`.
    /// Passing "text/html; charset=utf-8" here does not fail — WebKit simply does not recognise it
    /// as HTML, falls back to plain text, and renders the whole app as a `<pre>` of its own source.
    /// The app still launches, still shows something, and is completely dead. Sideline shipped
    /// exactly that bug once; a dist tree has MORE mime surface than one file, so the discipline
    /// matters more here, not less.
    private static let mimeTypes: [String: String] = [
        "html": "text/html",
        "js":   "text/javascript",
        "mjs":  "text/javascript",
        "css":  "text/css",
        "json": "application/json",
        "webmanifest": "application/manifest+json",
        "map":  "application/json",
        "svg":  "image/svg+xml",
        "png":  "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "webp": "image/webp", "ico": "image/x-icon", "gif": "image/gif",
        "woff2": "font/woff2", "woff": "font/woff", "ttf": "font/ttf",
    ]

    /// Text types need an encoding, and the page declares UTF-8. Handing it over here rather than
    /// letting WebKit guess keeps the em dashes and the emoji the UI leans on throughout.
    private static let textTypes: Set<String> = ["text/html", "text/javascript", "text/css",
                                                 "application/json", "application/manifest+json",
                                                 "image/svg+xml"]

    /// A task that has been stopped must not be messaged again — doing so throws an ObjC exception
    /// that takes the app with it. Serving is synchronous so this is belt-and-braces.
    private var stopped = Set<ObjectIdentifier>()

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        let id = ObjectIdentifier(task)
        guard let root = Bundle.main.resourceURL?.appendingPathComponent("dist") else {
            return fail(task, id, "no dist in bundle")
        }

        var rel = task.request.url?.path ?? "/"
        if rel.isEmpty || rel == "/" { rel = "/index.html" }
        rel.removeFirst()

        let file = root.appendingPathComponent(rel).standardizedFileURL
        // Refuse anything that escapes the bundle, however it was spelled.
        guard file.path.hasPrefix(root.standardizedFileURL.path),
              let data = try? Data(contentsOf: file) else {
            return fail(task, id, "not found: \(rel)")
        }

        let mime = Self.mimeTypes[file.pathExtension.lowercased()] ?? "application/octet-stream"
        let response = URLResponse(url: task.request.url!, mimeType: mime,
                                   expectedContentLength: data.count,
                                   textEncodingName: Self.textTypes.contains(mime) ? "utf-8" : nil)
        guard !stopped.contains(id) else { return }
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        stopped.insert(ObjectIdentifier(task))
    }

    private func fail(_ task: WKURLSchemeTask, _ id: ObjectIdentifier, _ why: String) {
        guard !stopped.contains(id) else { return }
        NSLog("[Shell] 404 \(why)")
        task.didFailWithError(NSError(domain: "PokeVendor", code: 404,
                                      userInfo: [NSLocalizedDescriptionKey: why]))
    }
}

// MARK: - The one view controller

final class ShellViewController: UIViewController {

    private var webView: WKWebView!
    #if DEBUG
    private var devBridge: DevBridge?
    #endif

    /// POKEVENDOR: replaces the dead service worker for remote card art.
    ///
    /// The web build runs a Workbox CacheFirst rule over images.pokemontcg.io and
    /// images.scrydex.com (1000 entries / 14 days). A service worker does NOT run under a custom
    /// scheme, so inside the shell that rule simply does not exist and every card image would come
    /// off the CDN again on each launch. That lands hardest on HiResImg.jsx, which paints small art
    /// first and swaps in a 0.5–1MB hi-res after decode() — its own comment assumes the small one is
    /// "usually already in the SW cache", which is false here.
    ///
    /// A URLCache is not an equivalent: it obeys the CDN's cache headers rather than an explicit
    /// policy, so the 14-day/1000-entry tuning is gone. What it does buy is that art stops
    /// re-downloading every session, which is the part that actually hurts. 512MB on disk is
    /// deliberately generous; vite.config.js records that ~6000 cached images ran 470–880MB, so
    /// WATCH the app's storage figure in Settings rather than assuming this cap is safe.
    private static func makeURLCache() -> URLCache {
        URLCache(memoryCapacity: 32 * 1024 * 1024,
                 diskCapacity: 512 * 1024 * 1024,
                 directory: FileManager.default
                     .urls(for: .cachesDirectory, in: .userDomainMask).first?
                     .appendingPathComponent("PokeVendorImages"))
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Shell.background

        URLCache.shared = Self.makeURLCache()

        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: Shell.scheme)
        config.websiteDataStore = .default()          // persistent: this is where the save lives
        // The rip animation synthesizes its audio in a Web Audio context started from the tap that
        // opens the pack (see src/game/feedback.js), so inline playback must be allowed and the
        // gesture requirement left in place.
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.add(self, name: "haptics")
        config.userContentController.add(self, name: "saveFile")
        // Tell the page it is running inside the shell, before any of its own script runs, so it can
        // prefer the native bridges over the web fallbacks that don't work here, and skip the
        // service-worker update checks entirely. The gesture block is the web half of (2): WebKit
        // raises `gesturestart` for a pinch, and refusing it here means the zoom lock does not rest
        // solely on the scroll-view delegate below.
        config.userContentController.addUserScript(WKUserScript(
            source: """
                window.__POKEVENDOR_NATIVE__ = true;
                document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });
                """,
            injectionTime: .atDocumentStart, forMainFrameOnly: true))

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = false   // single-page app; swipe-back is wrong
        webView.isOpaque = false
        webView.backgroundColor = Shell.background
        webView.scrollView.backgroundColor = Shell.background

        // (2) Zoom, shut three ways: the scale clamp, refusing to nominate a view to zoom, and a
        // delegate that snaps back if anything still manages to move it.
        webView.scrollView.minimumZoomScale = 1
        webView.scrollView.maximumZoomScale = 1
        webView.scrollView.bouncesZoom = false
        webView.scrollView.delegate = self

        // (3) Rubber-band, but only where a native app would have it.
        //
        // Sideline switched bouncing off outright, then put it back. Off is right in SAFARI, where
        // the bounce exposes the browser behind the page; it is wrong here, where this is a real
        // UIScrollView over a background matching the page, so a bounce exposes the app's own
        // colour — and every native list on the platform bounces.
        // `alwaysBounceVertical` stays FALSE, which is the half worth keeping: a screen whose
        // content does not fill the frame should not wobble.
        webView.scrollView.bounces = true
        webView.scrollView.alwaysBounceVertical = false
        // No automatic inset juggling — the page handles the safe area itself through
        // env(safe-area-inset-*) (styles.css defines --sat/--sab/--sal/--sar from them), which only
        // reports correctly if the web view is edge to edge.
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.showsVerticalScrollIndicator = false

        webView.isInspectable = true   // Safari Web Inspector over USB (unconditional at iOS 18)

        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        // Pinned to the view, NOT the safe area layout guide: edge to edge is what makes
        // viewport-fit=cover and the page's own env(safe-area-inset-*) padding work. On an
        // iPhone 17 Pro Max that is a 62pt Dynamic Island inset and a 34pt home indicator.
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        webView.load(URLRequest(url: Shell.pageURL))

        // Debug builds only. See DevBridge for why it exists and why it cannot ship.
        #if DEBUG
        devBridge = DevBridge(webView: webView)
        devBridge?.start()
        #endif
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
}

// MARK: - Zoom refusal

extension ShellViewController: UIScrollViewDelegate {
    func viewForZooming(in scrollView: UIScrollView) -> UIView? { nil }
    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        if scrollView.zoomScale != 1 { scrollView.zoomScale = 1 }
    }
}

// MARK: - Navigation policy

extension ShellViewController: WKNavigationDelegate {
    /// The app never navigates away from itself. Anything that tries is a real outbound link, so it
    /// belongs in Safari rather than replacing the app with a page it can't come back from.
    ///
    /// POKEVENDOR: this only governs NAVIGATION. The app's own https traffic — card art from the
    /// CDNs, Cognito, the sync Lambda — is XHR/fetch and never reaches this method.
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { return decisionHandler(.cancel) }
        if url.scheme == Shell.scheme { return decisionHandler(.allow) }
        if url.scheme == "http" || url.scheme == "https" || url.scheme == "mailto" {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    /// A failed load here is almost always the scheme handler, and the symptom (a blank dark
    /// screen) looks identical to a slow boot. Say so in the log rather than leaving it ambiguous.
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        NSLog("[Shell] navigation failed: \(error.localizedDescription)")
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        NSLog("[Shell] provisional navigation failed: \(error.localizedDescription)")
    }
}

// MARK: - The two bridges

extension ShellViewController: WKScriptMessageHandler {
    func userContentController(_ controller: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        switch message.name {
        case "haptics": fireHaptic(String(describing: message.body))
        case "saveFile": presentSaveSheet(message.body)
        default: break
        }
    }

    /// (4) Haptics. Fire-and-forget — nothing to hand back, so this stays the simple form.
    ///
    /// The kinds mirror what src/game/feedback.js asks for: a light tick per card flip, heavier
    /// impacts on the pack tear, and the notification styles for a hit landing.
    private func fireHaptic(_ kind: String) {
        switch kind {
        case "light":   UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case "medium":  UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        case "heavy":   UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        case "rigid":   UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
        case "soft":    UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        case "select":  UISelectionFeedbackGenerator().selectionChanged()
        case "success": UINotificationFeedbackGenerator().notificationOccurred(.success)
        case "warning": UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case "error":   UINotificationFeedbackGenerator().notificationOccurred(.error)
        default: break
        }
    }

    /// (5) File save. `URL.createObjectURL` + `a.download` is INERT in a WKWebView, which is how
    /// ErrorBoundary.jsx's "download your save backup" button comes to silently do nothing — in the
    /// crash path, where a silent failure costs the most. The page hands over {name, text} and gets
    /// the system share sheet, which can write to Files, Mail, AirDrop, anywhere.
    private func presentSaveSheet(_ body: Any) {
        guard let dict = body as? [String: Any],
              let name = dict["name"] as? String,
              let text = dict["text"] as? String else { return }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(name.isEmpty ? "poke-vendor-save.json" : name)
        guard (try? text.write(to: url, atomically: true, encoding: .utf8)) != nil else { return }

        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        // Required on iPad, harmless on iPhone.
        sheet.popoverPresentationController?.sourceView = view
        sheet.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY,
                                                                 width: 0, height: 0)
        present(sheet, animated: true)
    }
}

// MARK: - Dev bridge (debug builds only)

#if DEBUG
/// A loopback HTTP listener that runs JavaScript inside the live web view.
///
/// It exists for one reason. `simctl` can screenshot a booted simulator, but it cannot tap one. So
/// without a bridge there is no way to drive the shell from a script, and every change to how the
/// app FEELS has to be checked by hand on a device.
///
/// Three properties keep it out of the product:
///  1. `#if DEBUG` fences the whole section. Release archives carry no byte of it.
///  2. It binds 127.0.0.1 by name. Unreachable from another machine, and macOS raises no
///     "accept incoming connections" prompt.
///  3. It adds no JavaScript API and no user script. The page cannot detect it, so no app code can
///     come to depend on it — the same rule the two real bridges follow.
final class DevBridge {

    /// Fixed, so a driver script needs no discovery step.
    ///
    /// ⚠️ PICK A PORT NO OTHER SHELL ON THIS MACHINE USES, AND HAVE THE DRIVER CHECK `/ping`.
    /// This first shipped on 8788 and silently lost every request to another app's bridge
    /// (BinderBooks, same lineage, same port). The failure is nasty because it does not look like
    /// a failure: this process logs "listening", the driver gets clean 200s, and the JSON it gets
    /// back describes a completely different app.
    ///
    /// Sideline's comment says a busy port turns the bridge OFF rather than picking another one,
    /// "because a silent second port is worse than no bridge" — which is right, but
    /// `allowLocalEndpointReuse = true` below defeats it: reuse is exactly what lets a second
    /// listener bind a port that is already taken, so the `try?` never fails and that guard never
    /// fires. Reuse still has to stay, or a rebuild-and-relaunch inside TIME_WAIT cannot rebind.
    /// So the real defence is on the other end: `/ping` names the bridge, and the driver MUST
    /// refuse to talk to a bridge that answers with someone else's name.
    static let port: UInt16 = 8791
    static let name = "pokevendor"

    private var listener: NWListener?
    private weak var webView: WKWebView?

    init(webView: WKWebView) { self.webView = webView }

    func start() {
        guard let port = NWEndpoint.Port(rawValue: Self.port) else { return }
        let params = NWParameters.tcp
        params.allowLocalEndpointReuse = true
        params.requiredLocalEndpoint = NWEndpoint.hostPort(host: "127.0.0.1", port: port)
        guard let listener = try? NWListener(using: params) else {
            NSLog("[DevBridge] port \(Self.port) is busy — bridge is off")
            return
        }
        listener.newConnectionHandler = { [weak self] conn in
            conn.start(queue: .main)
            self?.receive(conn, buffer: Data())
        }
        listener.start(queue: .main)
        self.listener = listener
        NSLog("[DevBridge] listening on http://127.0.0.1:\(Self.port)")
    }

    // MARK: Reading a request

    /// A body arrives in as many TCP chunks as the sender likes, so `Content-Length` is the only
    /// reliable end marker. Keep reading until the buffer holds the headers AND the whole body.
    private func receive(_ conn: NWConnection, buffer: Data) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 1 << 22) { [weak self] chunk, _, done, error in
            guard let self else { return conn.cancel() }
            guard error == nil else { return conn.cancel() }

            var buf = buffer
            if let chunk { buf.append(chunk) }

            guard let (head, body) = Self.split(buf), body.count >= Self.contentLength(head) else {
                if done { conn.cancel() } else { self.receive(conn, buffer: buf) }
                return
            }
            self.handle(conn, head: head, body: Data(body.prefix(Self.contentLength(head))))
        }
    }

    /// Splits a raw request at the blank line. Returns the header block and the body that follows.
    private static func split(_ buf: Data) -> (String, Data)? {
        guard let r = buf.range(of: Data("\r\n\r\n".utf8)) else { return nil }
        return (String(decoding: buf[..<r.lowerBound], as: UTF8.self), buf[r.upperBound...])
    }

    /// Sideline had to use `components(separatedBy:)` here, because Swift counts CR LF as ONE
    /// Character (it is one extended grapheme cluster) so splitting on the Character "\n" matches
    /// nothing in a CRLF request — which read as "no Content-Length", truncated every body to zero
    /// bytes, and made every call return null with no error anywhere. The stdlib split that takes a
    /// multi-character separator fixes it properly but needs iOS 16; this app targets 18, so we use
    /// it directly.
    private static func headerLines(_ head: String) -> [String] {
        head.split(separator: "\r\n", omittingEmptySubsequences: false)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
    }

    private static func contentLength(_ head: String) -> Int {
        for line in headerLines(head) {
            let parts = line.split(separator: ":", maxSplits: 1)
            guard parts.count == 2, parts[0].lowercased() == "content-length" else { continue }
            return Int(parts[1].trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
        }
        return 0
    }

    // MARK: Answering it

    private func handle(_ conn: NWConnection, head: String, body: Data) {
        let path = Self.headerLines(head).first?
            .split(separator: " ").dropFirst().first.map(String.init) ?? "/"

        // The driver checks this name before it trusts anything else on this port. See the note on
        // `port` — another app's bridge answering here is a real, observed failure mode.
        if path.hasPrefix("/ping") {
            return reply(conn, "{\"ok\":true,\"bridge\":\"\(Self.name)\",\"port\":\(Self.port)}")
        }
        // Hands back what the parser actually made of the request. The one tool that tells you
        // whether a null answer came from the JavaScript or from this file.
        if path.hasPrefix("/echo") {
            return reply(conn, "{\"ok\":true,\"bytes\":\(body.count),"
                + "\"length\":\(Self.contentLength(head)),"
                + "\"head\":\(Self.jsonString(head)),"
                + "\"body\":\(Self.jsonString(String(decoding: body, as: UTF8.self)))}")
        }
        guard path.hasPrefix("/eval") else {
            return reply(conn, #"{"ok":false,"error":"unknown path"}"#, status: "404 Not Found")
        }
        eval(String(decoding: body, as: UTF8.self)) { [weak self] json in
            self?.reply(conn, json)
        }
    }

    /// `callAsyncJavaScript` rather than `evaluateJavaScript`, so the caller can `await` — setting
    /// store state and then waiting for React to re-render both matter. The wrapper returns ONE
    /// JSON string, so every value comes back on a single path and Swift maps no types at all.
    private func eval(_ js: String, done: @escaping (String) -> Void) {
        guard let webView else { return done(#"{"ok":false,"error":"no web view"}"#) }
        let wrapped = """
        try {
          const value = await (async () => { \(js)
          })();
          return JSON.stringify({ ok: true, value: value === undefined ? null : value });
        } catch (e) {
          return JSON.stringify({ ok: false, error: String((e && e.message) || e) });
        }
        """
        webView.callAsyncJavaScript(wrapped, arguments: [:], in: nil, in: .page) { result in
            switch result {
            case .success(let value):
                // The wrapper always resolves to a JSON string. Anything else is a bug HERE, so say
                // so rather than reporting a successful null and sending the caller hunting in JS.
                done(value as? String
                     ?? "{\"ok\":false,\"error\":\(Self.jsonString("bridge returned \(type(of: value)): \(value)"))}")
            case .failure(let error):
                done("{\"ok\":false,\"error\":\(Self.jsonString(error.localizedDescription))}")
            }
        }
    }

    private func reply(_ conn: NWConnection, _ json: String, status: String = "200 OK") {
        let body = Data(json.utf8)
        let head = "HTTP/1.1 \(status)\r\n"
            + "Content-Type: application/json\r\n"
            + "Content-Length: \(body.count)\r\n"
            + "Connection: close\r\n\r\n"
        var out = Data(head.utf8)
        out.append(body)
        conn.send(content: out, completion: .contentProcessed { _ in conn.cancel() })
    }

    /// Quotes and escapes a string the way JSON needs. Only an error message goes through here.
    private static func jsonString(_ s: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: [s]) else { return "\"\"" }
        return String(String(decoding: data, as: UTF8.self).dropFirst().dropLast())
    }
}
#endif

// MARK: - Entry point

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.backgroundColor = Shell.background
        window.rootViewController = ShellViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}
