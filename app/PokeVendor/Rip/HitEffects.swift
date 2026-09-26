import SwiftUI

/// One reveal of a hit. The burst, banner, and flash play once for it.
struct HitBurst: Identifiable, Equatable {
    let id = UUID()
    let card: RipCard
}

extension HitTier {
    var colors: [Color] {
        switch self {
        case .none, .small: [Theme.green, Theme.cyan]
        case .medium: [Color(red: 1.0, green: 0.84, blue: 0.30), Color(red: 1.0, green: 0.62, blue: 0.20), .white]
        case .big: [.pink, .yellow, .green, .cyan, .purple, .white]
        }
    }
}

/// A glow behind the top card while a hit shows. Medium and big hits also get turning light rays.
struct HitGlow: View {
    let tier: HitTier
    let cardSize: CGSize
    @State private var on = false

    var body: some View {
        let colors = tier.colors
        ZStack {
            if tier >= .medium {
                TimelineView(.animation) { timeline in
                    let t = timeline.date.timeIntervalSinceReferenceDate
                    AngularGradient(colors: rayColors(colors), center: .center)
                        .rotationEffect(.degrees(t.truncatingRemainder(dividingBy: 360) * 24))
                        .mask(RadialGradient(colors: [.white, .white.opacity(0)], center: .center,
                                             startRadius: cardSize.width * 0.2, endRadius: cardSize.width * 1.25))
                        .frame(width: cardSize.width * 2.8, height: cardSize.width * 2.8)
                        .opacity(tier == .big ? 0.75 : 0.5)
                }
            }
            RoundedRectangle(cornerRadius: 18)
                .fill(LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: cardSize.width * 1.06, height: cardSize.height * 1.04)
                .blur(radius: tier == .small ? 14 : 26)
                .opacity(tier == .small ? 0.55 : 0.95)
        }
        .scaleEffect(on ? 1 : 0.6)
        .opacity(on ? 1 : 0)
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.6)) { on = true }
        }
        .allowsHitTesting(false)
    }

    private func rayColors(_ colors: [Color]) -> [Color] {
        (0..<24).map { $0.isMultiple(of: 2) ? colors[($0 / 2) % colors.count] : .clear }
    }
}

/// Sparkles that fly out from the card and fall away.
struct SparkleBurst: View {
    private struct Particle {
        let angle: Double
        let speed: Double
        let size: Double
        let delay: Double
        let life: Double
        let star: Bool
        let color: Color
    }

    private let start = Date()
    private let particles: [Particle]

    init(tier: HitTier) {
        let count = tier == .big ? 80 : tier == .medium ? 40 : 16
        let reach = tier == .big ? 380.0 : tier == .medium ? 260.0 : 150.0
        let colors = tier.colors
        particles = (0..<count).map { _ in
            Particle(angle: .random(in: 0..<(2 * .pi)),
                     speed: .random(in: reach * 0.4...reach),
                     size: .random(in: 3...(tier == .big ? 10 : 7)),
                     delay: .random(in: 0...0.18),
                     life: .random(in: 0.9...1.6),
                     star: .random(),
                     color: colors.randomElement() ?? .white)
        }
    }

    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSince(start)
            Canvas { context, size in
                let center = CGPoint(x: size.width / 2, y: size.height / 2)
                for p in particles {
                    let progress = min(1, max(0, t - p.delay) / p.life)
                    guard progress > 0, progress < 1 else { continue }
                    let ease = 1 - pow(1 - progress, 3)
                    let point = CGPoint(x: center.x + cos(p.angle) * p.speed * ease,
                                        y: center.y + sin(p.angle) * p.speed * ease + 90 * progress * progress)
                    let r = p.size * (1 - progress * 0.5)
                    context.opacity = 1 - progress
                    let path = p.star ? sparkle(at: point, r: r * 1.6)
                                      : Path(ellipseIn: CGRect(x: point.x - r / 2, y: point.y - r / 2, width: r, height: r))
                    context.fill(path, with: .color(p.color))
                }
            }
        }
        .allowsHitTesting(false)
    }

    private func sparkle(at c: CGPoint, r: Double) -> Path {
        let k = r * 0.22
        var path = Path()
        path.move(to: CGPoint(x: c.x, y: c.y - r))
        path.addLine(to: CGPoint(x: c.x + k, y: c.y - k))
        path.addLine(to: CGPoint(x: c.x + r, y: c.y))
        path.addLine(to: CGPoint(x: c.x + k, y: c.y + k))
        path.addLine(to: CGPoint(x: c.x, y: c.y + r))
        path.addLine(to: CGPoint(x: c.x - k, y: c.y + k))
        path.addLine(to: CGPoint(x: c.x - r, y: c.y))
        path.addLine(to: CGPoint(x: c.x - k, y: c.y - k))
        path.closeSubpath()
        return path
    }
}

/// The rarity and the raw price, for medium and big hits.
struct HitBanner: View {
    let card: RipCard
    @State private var on = false

    var body: some View {
        let big = card.hitTier == .big
        let gradient = LinearGradient(colors: card.hitTier.colors, startPoint: .leading, endPoint: .trailing)
        VStack(spacing: 2) {
            Text(card.hitLabel)
                .font(.system(size: big ? 19 : 15, weight: .black, design: .rounded))
                .kerning(1.5)
                .foregroundStyle(gradient)
            Text(money(card.market))
                .font(.system(size: big ? 18 : 14, weight: .bold, design: .monospaced))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 8)
        .background(.black.opacity(0.75), in: Capsule())
        .overlay(Capsule().stroke(gradient, lineWidth: 1.5))
        .scaleEffect(on ? 1 : 0.3)
        .opacity(on ? 1 : 0)
        .onAppear {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.55)) { on = true }
        }
        .allowsHitTesting(false)
    }
}

/// A short white flash over the screen, for big hits.
struct HitFlash: View {
    @State private var opacity = 0.75

    var body: some View {
        Color.white
            .opacity(opacity)
            .ignoresSafeArea()
            .onAppear {
                withAnimation(.easeOut(duration: 0.6)) { opacity = 0 }
            }
            .allowsHitTesting(false)
    }
}

extension Haptics {
    static func celebrate(_ tier: HitTier) {
        switch tier {
        case .none:
            break
        case .small:
            tap(.medium)
        case .medium:
            hit()
        case .big:
            Task { @MainActor in
                for _ in 0..<3 {
                    tap(.heavy)
                    try? await Task.sleep(for: .milliseconds(90))
                }
                hit()
            }
        }
    }
}
