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
    /// The player's centering tool, for the cut reading.
    var tool = 0
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
            HStack(spacing: 8) {
                WearText(wear: card.condition.wear)
                CutLine(reading: .front(card.condition.cut, tool: tool))
            }
            .padding(.top, 2)
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

/// Rings of the hit's colors that grow out from the card, for big hits. It takes the place of a screen flash,
/// so the screen never goes bright all at once.
struct HitShockwave: View {
    let tier: HitTier
    let cardSize: CGSize
    @State private var on = false

    var body: some View {
        let colors = tier.colors
        ZStack {
            RadialGradient(colors: [colors[0].opacity(0.45), .clear], center: .center,
                           startRadius: cardSize.width * 0.3, endRadius: cardSize.width * 1.4)
                .frame(width: cardSize.width * 2.8, height: cardSize.width * 2.8)
                .scaleEffect(on ? 1.2 : 0.7)
                .opacity(on ? 0 : 1)
            ForEach(0..<3, id: \.self) { i in
                RoundedRectangle(cornerRadius: cardSize.width * 0.08)
                    .stroke(AngularGradient(colors: colors + [colors[0]], center: .center), lineWidth: 5 - CGFloat(i))
                    .frame(width: cardSize.width, height: cardSize.height)
                    .scaleEffect(on ? 2.4 + CGFloat(i) * 0.5 : 1)
                    .opacity(on ? 0 : 0.85)
                    .blur(radius: on ? 6 : 0)
                    .animation(.easeOut(duration: 0.9).delay(Double(i) * 0.12), value: on)
            }
        }
        .animation(.easeOut(duration: 0.9), value: on)
        .onAppear { on = true }
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

/// A few flecks of foil that come off the tear and fall.
struct FleckBurst: Identifiable {
    let id = UUID()
    let point: CGPoint
    let count: Int
    let colors: [Color]
    /// The side the flecks drift to: -1 left, 1 right.
    var drift: CGFloat = 0
    let start = Date()
    let seed = UInt64.random(in: 1...1_000_000)
}

struct TearFlecks: View {
    let bursts: [FleckBurst]
    static let life = 1.1

    var body: some View {
        TimelineView(.animation) { timeline in
            let now = timeline.date
            Canvas { context, _ in
                for burst in bursts {
                    let t = now.timeIntervalSince(burst.start)
                    guard t >= 0, t < Self.life, !burst.colors.isEmpty else { continue }
                    var random = SeededRandom(seed: burst.seed)
                    for _ in 0..<burst.count {
                        let vx = (random.next() - 0.5) * 170 + burst.drift * 70
                        let vy = -random.next() * 200 - 40
                        let spin = (random.next() - 0.5) * 24
                        let size = 2 + random.next() * 4
                        let color = burst.colors[Int(random.next() * CGFloat(burst.colors.count)) % burst.colors.count]
                        var fleck = context
                        fleck.opacity = 1 - t / Self.life
                        fleck.translateBy(x: burst.point.x + vx * t, y: burst.point.y + vy * t + 560 * t * t)
                        fleck.rotate(by: .radians(spin * t))
                        // The width changes as the fleck turns over.
                        let turn = abs(cos(spin * t * 1.5)) * size + 0.5
                        fleck.fill(Path(CGRect(x: -turn / 2, y: -size / 2, width: turn, height: size)), with: .color(color))
                    }
                }
            }
        }
        .allowsHitTesting(false)
    }
}

/// The moment the player sees that a pack is a demigod pack or a god pack: the screen darkens, light rays turn,
/// the title slams in and shakes, and confetti falls. A god pack is in full rainbow, a demigod pack in gold.
struct SpecialPackCelebration: View {
    let special: SpecialPack
    let onDone: () -> Void

    @State private var start = Date()
    @State private var slam = false
    @State private var confetti: [Confetti] = []

    private struct Confetti {
        let x: CGFloat
        let delay: Double
        let speed: CGFloat
        let sway: CGFloat
        let spin: Double
        let hue: Double
        let size: CGSize
    }

    private var god: Bool { special.isGod }

    private func palette(_ t: Double) -> [Color] {
        if god {
            return (0..<7).map { Color(hue: (Double($0) / 7 + t * 0.3).truncatingRemainder(dividingBy: 1), saturation: 0.75, brightness: 1) }
        }
        let gold = Color(red: 1.0, green: 0.84, blue: 0.30)
        let amber = Color(red: 1.0, green: 0.62, blue: 0.20)
        let pale = Color(red: 1.0, green: 0.95, blue: 0.75)
        let shift = Int(t * 4) % 3
        return Array(([gold, amber, pale, gold, amber, pale] + [gold]).dropFirst(shift)) + [gold]
    }

    var body: some View {
        GeometryReader { geo in
            TimelineView(.animation) { timeline in
                let t = timeline.date.timeIntervalSince(start)
                let fade = min(1, t / 0.3)
                let colors = palette(t)
                // The title shakes for a moment after it lands.
                let hit = max(0, 1 - max(0, t - 0.55) * 3.5)
                let shake = t > 0.55 ? sin(t * 70) * 9 * hit : 0
                ZStack {
                    Color.black.opacity(0.62 * fade)
                    AngularGradient(colors: (0..<32).map { $0.isMultiple(of: 2) ? colors[($0 / 2) % colors.count] : .clear },
                                    center: .center)
                        .rotationEffect(.degrees(t * 26))
                        .mask(RadialGradient(colors: [.white, .white.opacity(0)], center: .center, startRadius: 30, endRadius: 520))
                        .frame(width: 1200, height: 1200)
                        .blendMode(.plusLighter)
                        .opacity(0.55 * fade)
                    RadialGradient(colors: [colors[0].opacity(0.7), .clear], center: .center, startRadius: 0, endRadius: 260)
                        .scaleEffect(1 + sin(t * 5) * 0.08)
                        .blendMode(.plusLighter)
                        .opacity(fade)
                    Canvas { context, size in
                        for piece in confetti {
                            let age = t - piece.delay
                            guard age > 0 else { continue }
                            let y = -30 + piece.speed * age
                            guard y < size.height + 30 else { continue }
                            var c = context
                            c.translateBy(x: piece.x * size.width + sin(age * 3 + piece.spin) * piece.sway, y: y)
                            c.rotate(by: .radians(age * piece.spin))
                            let turn = max(0.15, abs(cos(age * piece.spin * 1.3)))
                            let color = god ? Color(hue: (piece.hue + t * 0.2).truncatingRemainder(dividingBy: 1), saturation: 0.7, brightness: 1)
                                            : colors[Int(piece.hue * 6) % colors.count]
                            c.fill(Path(CGRect(x: -piece.size.width * turn / 2, y: -piece.size.height / 2,
                                               width: piece.size.width * turn, height: piece.size.height)),
                                   with: .color(color))
                        }
                    }
                    VStack(spacing: 10) {
                        Text(special.title)
                            .font(.system(size: god ? 62 : 40, weight: .black, design: .rounded))
                            .kerning(2)
                            .foregroundStyle(LinearGradient(colors: colors, startPoint: .leading, endPoint: .trailing))
                            .shadow(color: .white.opacity(0.9), radius: 2)
                            .shadow(color: colors[0].opacity(0.9), radius: 18)
                            .overlay(
                                LinearGradient(stops: [.init(color: .clear, location: 0.4), .init(color: .white.opacity(0.85), location: 0.5),
                                                       .init(color: .clear, location: 0.6)],
                                               startPoint: UnitPoint(x: -1 + (t * 0.8).truncatingRemainder(dividingBy: 2.5), y: 0),
                                               endPoint: UnitPoint(x: (t * 0.8).truncatingRemainder(dividingBy: 2.5), y: 1))
                                    .blendMode(.plusLighter)
                                    .mask(Text(special.title).font(.system(size: god ? 62 : 40, weight: .black, design: .rounded)).kerning(2))
                            )
                            .multilineTextAlignment(.center)
                            .minimumScaleFactor(0.5)
                            .lineLimit(1)
                        Text(god ? "Every card is a hit" : "Three Special Illustration Rares")
                            .font(.headline)
                            .foregroundStyle(.white)
                            .opacity(slam ? 1 : 0)
                        Text("Tap to keep going")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.7))
                            .opacity(t > 1.6 ? 1 : 0)
                    }
                    .padding(.horizontal, 20)
                    .scaleEffect(slam ? 1 : 3.2)
                    .opacity(slam ? 1 : 0)
                    .offset(x: shake, y: shake * 0.4)
                }
                .frame(width: geo.size.width, height: geo.size.height)
            }
            .onAppear {
                confetti = (0..<(god ? 180 : 120)).map { _ in
                    Confetti(x: .random(in: 0...1), delay: 0.35 + .random(in: 0...1.4), speed: .random(in: 220...460),
                             sway: .random(in: 8...36), spin: .random(in: -9...9), hue: .random(in: 0..<1),
                             size: CGSize(width: .random(in: 6...10), height: .random(in: 9...15)))
                }
            }
        }
        .ignoresSafeArea()
        .contentShape(Rectangle())
        .onTapGesture(perform: onDone)
        .task {
            // A build-up of clicks, then the slam.
            for i in 0..<10 {
                Haptics.tick(0.3 + Double(i) * 0.07)
                try? await Task.sleep(for: .milliseconds(max(20, 60 - i * 5)))
            }
            withAnimation(.spring(response: 0.32, dampingFraction: 0.55)) { slam = true }
            Haptics.tap(.heavy)
            try? await Task.sleep(for: .milliseconds(90))
            Haptics.tap(.heavy)
            try? await Task.sleep(for: .milliseconds(90))
            Haptics.hit()
            if god {
                try? await Task.sleep(for: .milliseconds(400))
                Haptics.celebrate(.big)
            }
            try? await Task.sleep(for: .seconds(god ? 4.5 : 3.5))
            onDone()
        }
    }
}
