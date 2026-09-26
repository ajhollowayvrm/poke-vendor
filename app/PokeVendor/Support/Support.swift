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

    static func hit() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
}

/// Loads card images once and keeps them in memory.
final class ImageStore: @unchecked Sendable {
    static let shared = ImageStore()
    private let cache = NSCache<NSURL, UIImage>()

    func cached(_ url: URL) -> UIImage? {
        cache.object(forKey: url as NSURL)
    }

    func load(_ url: URL) async -> UIImage? {
        if let image = cached(url) { return image }
        guard let (data, _) = try? await URLSession.shared.data(from: url),
              let image = UIImage(data: data) else { return nil }
        let prepared = await image.byPreparingForDisplay() ?? image
        cache.setObject(prepared, forKey: url as NSURL)
        return prepared
    }

    func prefetch(_ urls: [URL]) {
        for url in urls {
            Task.detached(priority: .userInitiated) { _ = await self.load(url) }
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
