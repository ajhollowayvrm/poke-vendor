import SwiftUI

/// The sealed booster pack. The top strip tears along the tear line under the finger, then flies off.
struct PackView: View {
    let setName: String
    var slug: String?
    var series: String?
    var label: String?
    /// How far the tear has gone across the top, from 0 to 1.
    var tearProgress: Double
    var torn: Bool
    /// True when the tear starts at the left edge.
    var fromLeft = true

    static let tearLine: CGFloat = 0.11

    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            let motion = Motion.shared
            let sheen = sin(t * 0.7) * 0.25 + motion.roll * 0.7
            GeometryReader { geo in
                let size = geo.size
                let cut = CGFloat(torn ? 1 : tearProgress)
                let side: CGFloat = fromLeft ? 1 : -1
                // The torn part of the strip runs from the start edge to the cut.
                let tornFrom = fromLeft ? 0 : 1 - cut
                let tornTo = fromLeft ? cut : 1
                ZStack {
                    art(sheen).mask(TearSplit(top: false, fraction: Self.tearLine))
                    art(sheen)
                        .mask(TearSplit(top: true, fraction: Self.tearLine))
                        .mask(Stripe(from: fromLeft ? cut : 0, to: fromLeft ? 1 : 1 - cut))
                        .opacity(torn ? 0 : 1)
                    art(sheen)
                        .mask(TearSplit(top: true, fraction: Self.tearLine))
                        .mask(Stripe(from: tornFrom, to: tornTo))
                        .shadow(color: .black.opacity(cut > 0 ? 0.35 : 0), radius: 3, y: 2)
                        .rotationEffect(.degrees(torn ? side * 38 : -side * Double(cut) * 16),
                                        anchor: UnitPoint(x: fromLeft ? cut : 1 - cut, y: Self.tearLine))
                        .offset(x: torn ? side * size.width * 0.75 : 0,
                                y: torn ? -size.height * 0.5 : -cut * 4)
                        .opacity(torn ? 0 : 1)
                    // The white torn edge of the foil, where the strip came away.
                    TearEdge(fraction: Self.tearLine, from: tornFrom, to: tornTo)
                        .stroke(.white.opacity(0.85), style: StrokeStyle(lineWidth: 1.4, lineJoin: .round))
                        .opacity(cut > 0 ? 1 : 0)
                        .allowsHitTesting(false)
                    if !torn && tearProgress == 0 {
                        TearHint()
                            .frame(height: size.height * Self.tearLine * 2)
                            .frame(maxHeight: .infinity, alignment: .top)
                    }
                }
            }
            .rotation3DEffect(.degrees(motion.roll * 8 + sin(t * 0.5) * 2), axis: (x: 0, y: 1, z: 0), perspective: 0.6)
            .rotation3DEffect(.degrees(-motion.pitch * 6), axis: (x: 1, y: 0, z: 0), perspective: 0.6)
        }
        .shadow(color: .black.opacity(0.6), radius: 18, y: 12)
    }

    private func art(_ sheen: Double) -> some View {
        PackArt(setName: setName, sheen: sheen, slug: slug, series: series, label: label)
    }
}

/// A vertical band of the view, from a fraction of its width to another.
struct Stripe: Shape {
    var from: CGFloat
    var to: CGFloat

    var animatableData: AnimatablePair<CGFloat, CGFloat> {
        get { AnimatablePair(from, to) }
        set {
            from = newValue.first
            to = newValue.second
        }
    }

    func path(in rect: CGRect) -> Path {
        Path(CGRect(x: rect.width * from, y: -rect.height, width: max(0, rect.width * (to - from)), height: rect.height * 3))
    }
}

/// The jagged tear line between two fractions of the width. It matches the teeth of `TearSplit`.
struct TearEdge: Shape {
    var fraction: CGFloat
    var from: CGFloat
    var to: CGFloat

    var animatableData: AnimatablePair<CGFloat, CGFloat> {
        get { AnimatablePair(from, to) }
        set {
            from = newValue.first
            to = newValue.second
        }
    }

    func path(in rect: CGRect) -> Path {
        let y = rect.height * fraction
        let start = rect.width * from
        let end = rect.width * to
        var path = Path()
        guard end > start else { return path }
        var x: CGFloat = 0
        var index = 0
        var first = true
        while x <= rect.width {
            if x >= start && x <= end {
                let point = CGPoint(x: x, y: y + (index.isMultiple(of: 2) ? -2.5 : 2.5))
                if first { path.move(to: point) } else { path.addLine(to: point) }
                first = false
            }
            x += 7
            index += 1
        }
        return path
    }
}

/// The artwork of the whole pack: foil, facets, title, crimps, and a moving reflection.
struct PackArt: View {
    let setName: String
    var sheen: Double
    var slug: String?
    var series: String?
    var label: String?

    /// Each set gets its own wrapper colors.
    static func colors(_ slug: String?) -> [Color] {
        switch slug {
        case "surging-sparks":
            [Color(red: 0.35, green: 0.18, blue: 0.05), Color(red: 0.95, green: 0.62, blue: 0.10),
             Color(red: 1.0, green: 0.86, blue: 0.30), Color(red: 0.90, green: 0.40, blue: 0.10), Color(red: 0.25, green: 0.10, blue: 0.05)]
        case "stellar-crown":
            [Color(red: 0.05, green: 0.20, blue: 0.30), Color(red: 0.10, green: 0.60, blue: 0.62),
             Color(red: 0.80, green: 0.90, blue: 0.95), Color(red: 0.55, green: 0.40, blue: 0.85), Color(red: 0.05, green: 0.12, blue: 0.25)]
        case "twilight-masquerade":
            [Color(red: 0.08, green: 0.22, blue: 0.12), Color(red: 0.25, green: 0.60, blue: 0.35),
             Color(red: 0.60, green: 0.35, blue: 0.70), Color(red: 0.20, green: 0.45, blue: 0.40), Color(red: 0.10, green: 0.08, blue: 0.20)]
        case "evolving-skies":
            [Color(red: 0.03, green: 0.15, blue: 0.30), Color(red: 0.10, green: 0.45, blue: 0.70),
             Color(red: 0.35, green: 0.80, blue: 0.75), Color(red: 0.10, green: 0.55, blue: 0.35), Color(red: 0.03, green: 0.10, blue: 0.20)]
        case "cosmic-eclipse":
            [Color(red: 0.15, green: 0.05, blue: 0.25), Color(red: 0.70, green: 0.25, blue: 0.60),
             Color(red: 0.95, green: 0.75, blue: 0.35), Color(red: 0.35, green: 0.20, blue: 0.70), Color(red: 0.08, green: 0.05, blue: 0.15)]
        case "base-set":
            [Color(red: 0.10, green: 0.15, blue: 0.45), Color(red: 0.90, green: 0.40, blue: 0.10),
             Color(red: 1.0, green: 0.80, blue: 0.20), Color(red: 0.80, green: 0.15, blue: 0.10), Color(red: 0.10, green: 0.10, blue: 0.35)]
        case "paradox-rift":
            [Color(red: 0.12, green: 0.05, blue: 0.25), Color(red: 0.45, green: 0.20, blue: 0.70),
             Color(red: 0.20, green: 0.55, blue: 0.85), Color(red: 0.70, green: 0.25, blue: 0.55), Color(red: 0.06, green: 0.05, blue: 0.18)]
        case "prismatic-evolutions", nil:
            [Color(red: 0.20, green: 0.10, blue: 0.42), Color(red: 0.62, green: 0.20, blue: 0.62),
             Color(red: 0.95, green: 0.55, blue: 0.75), Color(red: 0.18, green: 0.62, blue: 0.78), Color(red: 0.10, green: 0.14, blue: 0.40)]
        case let slug?:
            generated(slug)
        }
    }

    /// A stable palette for a set with no hand-picked colors: a dark edge, two bright hues from the slug, and a
    /// pale highlight.
    private static func generated(_ slug: String) -> [Color] {
        var hash: UInt64 = 5381
        for byte in slug.utf8 { hash = hash &* 33 &+ UInt64(byte) }
        let hue = Double(hash % 360) / 360
        let second = (hue + 0.12 + Double((hash >> 9) % 20) / 100).truncatingRemainder(dividingBy: 1)
        return [Color(hue: hue, saturation: 0.8, brightness: 0.28), Color(hue: hue, saturation: 0.75, brightness: 0.75),
                Color(hue: second, saturation: 0.35, brightness: 0.98), Color(hue: second, saturation: 0.7, brightness: 0.8),
                Color(hue: hue, saturation: 0.8, brightness: 0.22)]
    }

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            ZStack {
                LinearGradient(colors: Self.colors(slug), startPoint: .topLeading, endPoint: .bottomTrailing)
                PrismFacets()
                    .blendMode(.softLight)
                PrismStar()
                    .frame(width: w * 0.9, height: w * 0.9)
                    .offset(y: h * 0.06)
                    .blendMode(.plusLighter)
                VStack(spacing: h * 0.008) {
                    Text("Pokémon")
                        .font(.system(size: w * 0.16, weight: .heavy, design: .rounded))
                        .foregroundStyle(Color(red: 1.0, green: 0.82, blue: 0.10))
                        .shadow(color: Color(red: 0.10, green: 0.25, blue: 0.62), radius: 0, x: 2, y: 2)
                    Text("TRADING CARD GAME")
                        .font(.system(size: w * 0.045, weight: .bold))
                        .kerning(1.5)
                        .foregroundStyle(.white.opacity(0.9))
                    Spacer()
                    Text(setName.uppercased())
                        .font(.system(size: w * 0.105, weight: .black, design: .rounded))
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.white)
                        .shadow(color: .purple.opacity(0.9), radius: 6)
                    Text((series ?? "Scarlet & Violet").uppercased())
                        .font(.system(size: w * 0.04, weight: .semibold))
                        .kerning(1.5)
                        .foregroundStyle(.white.opacity(0.85))
                    Text(label ?? "10 CARDS + 1 ENERGY")
                        .font(.system(size: w * 0.035, weight: .medium, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.7))
                        .padding(.top, h * 0.01)
                }
                .padding(.top, h * 0.13)
                .padding(.bottom, h * 0.09)
                .padding(.horizontal, w * 0.06)
                VStack {
                    Crimp().frame(height: h * 0.06)
                    Spacer()
                    Crimp().frame(height: h * 0.05)
                }
                LinearGradient(colors: [.black.opacity(0.4), .clear, .clear, .black.opacity(0.4)],
                               startPoint: .leading, endPoint: .trailing)
                LinearGradient(stops: [.init(color: .clear, location: 0.36),
                                       .init(color: .white.opacity(0.55), location: 0.5),
                                       .init(color: .clear, location: 0.64)],
                               startPoint: UnitPoint(x: -0.5 + sheen, y: 0),
                               endPoint: UnitPoint(x: 0.5 + sheen, y: 1))
                    .blendMode(.screen)
            }
            .clipShape(PackOutline())
        }
    }
}

/// The sealed edge at the top and bottom of the pack: fine pressed ridges.
struct Crimp: View {
    var body: some View {
        Canvas { context, size in
            var x: CGFloat = 0
            var light = true
            while x < size.width {
                let rect = CGRect(x: x, y: 0, width: 1.5, height: size.height)
                context.fill(Path(rect), with: .color(light ? .white.opacity(0.22) : .black.opacity(0.22)))
                x += 1.5
                light.toggle()
            }
        }
    }
}

struct PrismFacets: View {
    var body: some View {
        Canvas { context, size in
            var random = SeededRandom(seed: 7)
            for _ in 0..<28 {
                let a = CGPoint(x: random.next() * size.width, y: random.next() * size.height)
                let b = CGPoint(x: a.x + (random.next() - 0.5) * size.width * 0.8, y: a.y + (random.next() - 0.5) * size.height * 0.4)
                let c = CGPoint(x: a.x + (random.next() - 0.5) * size.width * 0.8, y: a.y + (random.next() - 0.5) * size.height * 0.4)
                var path = Path()
                path.move(to: a)
                path.addLine(to: b)
                path.addLine(to: c)
                path.closeSubpath()
                context.fill(path, with: .color(.white.opacity(0.05 + random.next() * 0.16)))
            }
        }
    }
}

struct PrismStar: View {
    var body: some View {
        ZStack {
            ForEach(0..<6, id: \.self) { i in
                Capsule()
                    .fill(LinearGradient(colors: [.clear, .pink, .yellow, .cyan, .clear], startPoint: .top, endPoint: .bottom))
                    .frame(width: 18, height: 220)
                    .rotationEffect(.degrees(Double(i) * 30))
                    .opacity(0.2)
            }
            Circle()
                .fill(RadialGradient(colors: [.white.opacity(0.35), .white.opacity(0)], center: .center, startRadius: 0, endRadius: 70))
                .frame(width: 140, height: 140)
        }
    }
}

struct TearHint: View {
    @State private var pulse = false

    var body: some View {
        VStack(spacing: 4) {
            Label("Swipe to open", systemImage: "arrow.right")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(.black.opacity(0.45), in: Capsule())
                .offset(x: pulse ? 14 : -14)
            Rectangle()
                .stroke(style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
                .frame(height: 1)
                .foregroundStyle(.white.opacity(0.8))
        }
        .padding(.horizontal, 10)
        .offset(y: -10)
        .opacity(pulse ? 1 : 0.55)
        .onAppear {
            withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) { pulse = true }
        }
        .allowsHitTesting(false)
    }
}

/// The pack outline, with small teeth along the top and bottom seals.
struct PackOutline: Shape {
    func path(in rect: CGRect) -> Path {
        let tooth: CGFloat = 6
        let depth: CGFloat = 3
        var path = Path()
        path.move(to: CGPoint(x: 0, y: depth))
        var x: CGFloat = 0
        var up = true
        while x < rect.width {
            x = min(rect.width, x + tooth / 2)
            path.addLine(to: CGPoint(x: x, y: up ? 0 : depth))
            up.toggle()
        }
        path.addLine(to: CGPoint(x: rect.width, y: rect.height - depth))
        up = true
        while x > 0 {
            x = max(0, x - tooth / 2)
            path.addLine(to: CGPoint(x: x, y: up ? rect.height : rect.height - depth))
            up.toggle()
        }
        path.closeSubpath()
        return path
    }
}

/// One side of the jagged tear line.
struct TearSplit: Shape {
    var top: Bool
    var fraction: CGFloat

    func path(in rect: CGRect) -> Path {
        let y = rect.height * fraction
        var points: [CGPoint] = []
        var x: CGFloat = 0
        var index = 0
        while x <= rect.width {
            points.append(CGPoint(x: x, y: y + (index.isMultiple(of: 2) ? -2.5 : 2.5)))
            x += 7
            index += 1
        }
        points.append(CGPoint(x: rect.width, y: y))
        var path = Path()
        let edge: CGFloat = top ? 0 : rect.height
        path.move(to: CGPoint(x: 0, y: edge))
        path.addLine(to: CGPoint(x: rect.width, y: edge))
        for point in points.reversed() { path.addLine(to: point) }
        path.closeSubpath()
        return path
    }
}
