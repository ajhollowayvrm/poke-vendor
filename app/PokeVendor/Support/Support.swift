import SwiftUI
import UIKit
import CoreMotion
import Observation

enum Theme {
    static let background = Color(red: 0.04, green: 0.06, blue: 0.08)
    static let surface = Color(red: 0.06, green: 0.09, blue: 0.13)
    static let line = Color(red: 0.12, green: 0.17, blue: 0.22)
    static let text = Color(red: 0.90, green: 0.93, blue: 0.95)
    static let muted = Color(red: 0.56, green: 0.63, blue: 0.70)
    static let cyan = Color(red: 0.13, green: 0.83, blue: 0.93)
    static let green = Color(red: 0.20, green: 0.83, blue: 0.60)
    static let orange = Color(red: 0.98, green: 0.57, blue: 0.24)
}

func money(_ value: Double) -> String {
    value.formatted(.currency(code: "USD"))
}

func signedMoney(_ value: Double) -> String {
    (value < 0 ? "−" : "+") + money(abs(value))
}

enum Haptics {
    static func tap(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }

    /// A small, sharp tick while a tear or a peel moves under the finger.
    static func tick(_ intensity: CGFloat = 0.55) {
        UIImpactFeedbackGenerator(style: .rigid).impactOccurred(intensity: intensity)
    }

    static func hit() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
}

/// Loads card images once and keeps them in memory.
/// Every image source shows the 1st Edition scan for the WOTC sets with two print runs (Jungle to Neo Destiny). The
/// Unlimited prints of those sets have "#destamp" on their image URL, and a small patch in Resources/destamp.json covers
/// the stamp (tools/images/destamp.py). The 1st Edition prints keep the stamp.
enum Destamp {
    private struct Patch: Decodable {
        let x, y, w, h, iw, ih: Double
        let jpg: String
    }

    private static let patches: [String: Patch] = {
        guard let url = Bundle.main.url(forResource: "destamp", withExtension: "json"), let data = try? Data(contentsOf: url),
              let patches = try? JSONDecoder().decode([String: Patch].self, from: data) else { return [:] }
        return patches
    }()

    static func hasPatch(_ image: String?) -> Bool {
        guard let image, let url = URL(string: image), let id = url.lastPathComponent.split(separator: "_").first else { return false }
        return patches[String(id)] != nil
    }

    /// A card from a save made before the patches: an Unlimited print with a patch gets "#destamp".
    static func migrate(_ card: inout OwnedCard) {
        guard let image = card.print.image, !image.contains("#"), !card.print.variant.contains("1st Edition"),
              !SetLibrary.isFirstEdition(card.setSlug), hasPatch(image) else { return }
        card.print.image = image + "#destamp"
    }

    /// The image with its patch over the stamp, when the URL asks for one and a patch exists.
    static func apply(_ image: UIImage, url: URL) -> UIImage {
        guard url.fragment == "destamp", let id = url.lastPathComponent.split(separator: "_").first,
              let patch = patches[String(id)], let data = Data(base64Encoded: patch.jpg), let piece = UIImage(data: data),
              patch.iw > 0, patch.ih > 0 else { return image }
        let sx = image.size.width / patch.iw, sy = image.size.height / patch.ih
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = image.scale
        return UIGraphicsImageRenderer(size: image.size, format: format).image { _ in
            image.draw(at: .zero)
            piece.draw(in: CGRect(x: patch.x * sx, y: patch.y * sy, width: patch.w * sx, height: patch.h * sy))
        }
    }
}

final class ImageStore: @unchecked Sendable {
    static let shared = ImageStore()
    private let cache = NSCache<NSURL, UIImage>()

    func cached(_ url: URL) -> UIImage? {
        cache.object(forKey: url as NSURL)
    }

    /// `upright` turns a sideways card scan to portrait. Pass it only for card images, never for product images.
    func load(_ url: URL, upright: Bool = false) async -> UIImage? {
        if let image = cached(url) { return image }
        // The fragment is for the app, not the server. "#destamp" covers a 1st Edition stamp (Destamp below).
        var request = URLComponents(url: url, resolvingAgainstBaseURL: false)
        request?.fragment = nil
        guard let (data, _) = try? await URLSession.shared.data(from: request?.url ?? url),
              let loaded = UIImage(data: data) else { return nil }
        let fixed = Destamp.apply(loaded, url: url)
        let image = upright ? Self.upright(fixed) : fixed
        let prepared = await image.byPreparingForDisplay() ?? image
        cache.setObject(prepared, forKey: url as NSURL)
        return prepared
    }

    /// A sideways card, for example a BREAK card, has a landscape scan. This turns it 90° counterclockwise so it
    /// fills a portrait card frame. The ratio test keeps square product images as they are.
    static func upright(_ image: UIImage) -> UIImage {
        let w = image.size.width, h = image.size.height
        guard h > 0, (1.25...1.55).contains(w / h) else { return image }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = image.scale
        return UIGraphicsImageRenderer(size: CGSize(width: h, height: w), format: format).image { ctx in
            ctx.cgContext.translateBy(x: 0, y: w)
            ctx.cgContext.rotate(by: -.pi / 2)
            image.draw(in: CGRect(x: 0, y: 0, width: w, height: h))
        }
    }

    /// A booster pack photo (the set file's `packImage`): the white margin is cropped, and the white background at the
    /// crimped edges turns transparent, so the pack sits on the dark screen. It has its own cache key.
    func loadPack(_ url: URL) async -> UIImage? {
        guard let key = Self.packKey(url) else { return nil }
        if let image = cached(key) { return image }
        guard let (data, _) = try? await URLSession.shared.data(from: url), let loaded = UIImage(data: data),
              let cut = Self.cutOut(loaded) else { return nil }
        let prepared = await cut.byPreparingForDisplay() ?? cut
        cache.setObject(prepared, forKey: key as NSURL)
        return prepared
    }

    func cachedPack(_ url: URL) -> UIImage? { Self.packKey(url).flatMap(cached) }

    private static func packKey(_ url: URL) -> URL? {
        var parts = URLComponents(url: url, resolvingAgainstBaseURL: false)
        parts?.fragment = "pack"
        return parts?.url
    }

    /// Crops to the rows and columns where most pixels are not white, then clears the white pixels that touch the edge,
    /// only in a thin band along the edge. The band keeps white art inside the pack whole.
    static func cutOut(_ image: UIImage) -> UIImage? {
        guard let cg = image.cgImage else { return nil }
        let w = cg.width, h = cg.height
        var px = [UInt8](repeating: 0, count: w * h * 4)
        guard let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        func white(_ i: Int) -> Bool {
            let r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2]
            let lo = min(r, g, b), hi = max(r, g, b)
            return lo >= 243 && hi - lo < 14
        }
        var colFull = [Int](repeating: 0, count: w), rowFull = [Int](repeating: 0, count: h)
        for y in 0..<h {
            for x in 0..<w where !white(y * w + x) {
                colFull[x] += 1
                rowFull[y] += 1
            }
        }
        guard let x0 = colFull.firstIndex(where: { Double($0) > 0.3 * Double(h) }),
              let x1 = colFull.lastIndex(where: { Double($0) > 0.3 * Double(h) }),
              let y0 = rowFull.firstIndex(where: { Double($0) > 0.3 * Double(w) }),
              let y1 = rowFull.lastIndex(where: { Double($0) > 0.3 * Double(w) }) else { return nil }
        // The flood fill clears white pixels from the crop edge inward, no deeper than the band.
        let band = max(4, Int(0.03 * Double(min(x1 - x0, y1 - y0))))
        var seen = [Bool](repeating: false, count: w * h)
        var stack: [(Int, Int)] = []
        for x in x0...x1 { stack += [(x, y0), (x, y1)] }
        for y in y0...y1 { stack += [(x0, y), (x1, y)] }
        while let (x, y) = stack.popLast() {
            let i = y * w + x
            guard !seen[i] else { continue }
            seen[i] = true
            guard min(x - x0, y - y0, x1 - x, y1 - y) <= band, white(i) else { continue }
            px[i * 4] = 0; px[i * 4 + 1] = 0; px[i * 4 + 2] = 0; px[i * 4 + 3] = 0
            if x > x0 { stack.append((x - 1, y)) }
            if x < x1 { stack.append((x + 1, y)) }
            if y > y0 { stack.append((x, y - 1)) }
            if y < y1 { stack.append((x, y + 1)) }
        }
        guard let full = ctx.makeImage(),
              let cropped = full.cropping(to: CGRect(x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1)) else { return nil }
        return UIImage(cgImage: cropped, scale: image.scale, orientation: .up)
    }

    func prefetch(_ urls: [URL], upright: Bool = false) {
        for url in urls {
            Task.detached(priority: .userInitiated) { _ = await self.load(url, upright: upright) }
        }
    }
}

/// The tilt of the phone, from -1 to 1 on each axis. It moves the reflections.
@MainActor @Observable
final class Motion {
    static let shared = Motion()
    var roll: Double = 0
    var pitch: Double = 0
    private let manager = CMMotionManager()
    private var baseline: (roll: Double, pitch: Double)?

    private init() {}

    func start() {
        guard manager.isDeviceMotionAvailable, !manager.isDeviceMotionActive else { return }
        manager.deviceMotionUpdateInterval = 1.0 / 60
        manager.startDeviceMotionUpdates(to: .main) { [weak self] data, _ in
            guard let attitude = data?.attitude else { return }
            MainActor.assumeIsolated {
                guard let self else { return }
                let base = self.baseline ?? (attitude.roll, attitude.pitch)
                self.baseline = base
                self.roll = max(-1, min(1, (attitude.roll - base.roll) / 0.5))
                self.pitch = max(-1, min(1, (attitude.pitch - base.pitch) / 0.5))
            }
        }
    }
}

/// A repeatable random sequence, so the pack art looks the same every time.
struct SeededRandom {
    private var state: UInt64

    init(seed: UInt64) { state = seed }

    mutating func next() -> CGFloat {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return CGFloat((state >> 33) % 10_000) / 10_000
    }
}
