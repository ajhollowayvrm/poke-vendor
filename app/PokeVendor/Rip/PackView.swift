import SwiftUI

/// The sealed booster pack. The top strip tears off along the tear line.
struct PackView: View {
    let setName: String
    /// How far the finger has moved across the top, from 0 to 1.
    var tearProgress: Double
    var torn: Bool

    static let tearLine: CGFloat = 0.11

    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            let motion = Motion.shared
            let sheen = sin(t * 0.7) * 0.25 + motion.roll * 0.7
            GeometryReader { geo in
                let size = geo.size
                ZStack {
                    PackArt(setName: setName, sheen: sheen)
                        .mask(TearSplit(top: false, fraction: Self.tearLine))
                    PackArt(setName: setName, sheen: sheen)
                        .mask(TearSplit(top: true, fraction: Self.tearLine))
                        .rotationEffect(.degrees(torn ? 32 : tearProgress * 7), anchor: .bottomLeading)
                        .offset(x: torn ? size.width * 0.7 : tearProgress * 6,
                                y: torn ? -size.height * 0.45 : -tearProgress * 5)
                        .opacity(torn ? 0 : 1)
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
}

/// The artwork of the whole pack: foil, facets, title, crimps, and a moving reflection.
struct PackArt: View {
    let setName: String
    var sheen: Double

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            ZStack {
                LinearGradient(colors: [Color(red: 0.20, green: 0.10, blue: 0.42),
                                        Color(red: 0.62, green: 0.20, blue: 0.62),
                                        Color(red: 0.95, green: 0.55, blue: 0.75),
                                        Color(red: 0.18, green: 0.62, blue: 0.78),
                                        Color(red: 0.10, green: 0.14, blue: 0.40)],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
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
                    Text("SCARLET & VIOLET")
                        .font(.system(size: w * 0.04, weight: .semibold))
                        .kerning(1.5)
                        .foregroundStyle(.white.opacity(0.85))
                    Text("10 CARDS + 1 ENERGY")
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
