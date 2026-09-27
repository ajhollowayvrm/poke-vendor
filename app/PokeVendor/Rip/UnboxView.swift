import SwiftUI

/// Opening a sealed product before its packs: the closed product, the opening, then the promos and the packs.
struct UnboxView: View {
    let product: Product
    let packSlugs: [String]
    let onOpen: () -> [CardPrint]
    /// Goes to the packs. The pack at this index of the product's packs rips first.
    let onRip: (Int) -> Void
    let onDone: () -> Void

    private enum Stage { case closed, opening, open }
    private enum Style { case blister, box, tin }

    @State private var stage: Stage = .closed
    /// The lid of a box or a tin, from closed (0) to off (1).
    @State private var lid = 0.0
    /// The base of a box or a tin, from in place (0) to gone (1).
    @State private var base = 0.0
    @State private var glow = 0.0
    @State private var shake = 0.0
    @State private var squash = false
    /// The peeling corner of a blister, in the product's coordinates. Nil keeps it on its corner.
    @State private var peelPoint: CGPoint?
    @State private var peelFade = 1.0
    @State private var ticks = 0
    @State private var sparkle: UUID?
    @State private var promos: [CardPrint] = []
    @State private var shown = 0
    @State private var faceUp: Set<Int> = []
    @State private var chosen: Int?
    @State private var info: PromoInfo?

    private var style: Style {
        switch product.kind {
        case "Blister": .blister
        case "Tin": .tin
        default: .box
        }
    }

    private var total: Int { promos.count + packSlugs.count }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                if stage != .open {
                    closedProduct(size: geo.size)
                        .transition(.opacity)
                } else {
                    contents
                        .transition(.opacity)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .sheet(item: $info) { PromoInfoSheet(info: $0) }
    }

    // MARK: - Closed and opening

    private func closedProduct(size: CGSize) -> some View {
        let w = min(size.width * 0.8, 340)
        let motion = Motion.shared
        return VStack(spacing: 18) {
            Spacer()
            ZStack {
                switch style {
                case .blister: blister(w)
                case .box, .tin: boxOrTin(w)
                }
                if let sparkle {
                    SparkleBurst(tier: .medium)
                        .frame(width: 600, height: 600)
                        .id(sparkle)
                }
            }
            .frame(width: w, height: w)
            .modifier(Shake(amount: shake))
            .scaleEffect(squash ? 0.95 : 1)
            .rotation3DEffect(.degrees(stage == .closed ? motion.roll * 7 : 0), axis: (x: 0, y: 1, z: 0), perspective: 0.6)
            .rotation3DEffect(.degrees(stage == .closed ? -motion.pitch * 5 : 0), axis: (x: 1, y: 0, z: 0), perspective: 0.6)
            Text(product.name)
                .font(.headline)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
                .opacity(stage == .closed ? 1 : 0)
            Text(openHint)
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
                .opacity(stage == .closed ? 1 : 0)
            Spacer()
            Spacer()
        }
        .animation(.easeOut(duration: 0.2), value: stage)
        .contentShape(Rectangle())
        .onTapGesture { open(w) }
        .onAppear {
            #if DEBUG
            // Screenshot aid: `-peel <fraction>` holds a blister part of the way peeled.
            let args = ProcessInfo.processInfo.arguments
            if let i = args.firstIndex(of: "-peel"), i + 1 < args.count, let f = Double(args[i + 1]) {
                peelPoint = CGPoint(x: w - w * f, y: w * f)
            }
            if args.contains("-autoopen") {
                Task {
                    try? await Task.sleep(for: .seconds(2))
                    open(w)
                }
            }
            #endif
        }
    }

    private var openHint: String {
        switch style {
        case .blister: "Pull the corner to peel it open, or tap"
        case .box: "Tap to lift the lid"
        case .tin: "Tap to pop the lid"
        }
    }

    /// A blister: the card peels back from its top corner and shows the pack and the promo in the tray.
    private func blister(_ w: CGFloat) -> some View {
        let preview: [CardPrint?] = product.pickOnePromo ? [nil] : product.promos.map(\.print)
        return ZStack {
            BlisterTray(promos: preview, packSlugs: packSlugs)
                .frame(width: w, height: w)
            photo(w)
                .modifier(PeelEffect(finger: peelPoint ?? CGPoint(x: w, y: 0), page: CGSize(width: w, height: w)))
                .opacity(peelFade)
                .shadow(color: .black.opacity(0.5), radius: 14, y: 10)
        }
        .gesture(peelGesture(w))
    }

    private func peelGesture(_ w: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                guard stage == .closed else { return }
                let t = value.translation
                peelPoint = CGPoint(x: w + t.width * 1.15, y: t.height * 1.15)
                let step = Int(hypot(t.width, t.height) / 16)
                if step > ticks {
                    ticks = step
                    Haptics.tick(0.4)
                }
            }
            .onEnded { value in
                guard stage == .closed else { return }
                ticks = 0
                let t = value.translation
                let pulled = hypot(t.width, t.height)
                let fling = hypot(value.predictedEndTranslation.width, value.predictedEndTranslation.height)
                if pulled < 8 {
                    finishPeel(w, toward: CGVector(dx: -1, dy: 1))
                } else if pulled > w * 0.45 || fling > w * 1.1 {
                    finishPeel(w, toward: CGVector(dx: t.width, dy: t.height))
                } else {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) { peelPoint = CGPoint(x: w, y: 0) }
                }
            }
    }

    private func open(_ w: CGFloat) {
        guard stage == .closed else { return }
        if style == .blister {
            finishPeel(w, toward: CGVector(dx: -1, dy: 1))
        } else {
            openLid()
        }
    }

    /// The card peels the rest of the way off, in the direction of the pull.
    private func finishPeel(_ w: CGFloat, toward v: CGVector) {
        guard stage == .closed else { return }
        stage = .opening
        // A pull away from the product still peels it toward the opposite corner.
        let away = v.dx >= 0 && v.dy <= 0
        let dx = away ? -1 : v.dx
        let dy = away ? 1 : v.dy
        let length = max(hypot(dx, dy), 0.001)
        let reach = w * 2.6
        Haptics.tap(.medium)
        withAnimation(.easeIn(duration: 0.5)) { peelPoint = CGPoint(x: w + dx / length * reach, y: dy / length * reach) }
        withAnimation(.easeIn(duration: 0.2).delay(0.32)) { peelFade = 0 }
        Task {
            try? await Task.sleep(for: .milliseconds(420))
            Haptics.tap(.heavy)
            sparkle = UUID()
            try? await Task.sleep(for: .milliseconds(450))
            reveal()
        }
    }

    /// A box or a tin: the lid comes off and a light comes out, then the base drops away.
    private func boxOrTin(_ w: CGFloat) -> some View {
        let tin = style == .tin
        let edge = tin ? 0.24 : 0.32
        return ZStack {
            photo(w)
                .mask(BandMask(from: edge, to: 1))
                .offset(y: base * w * 0.5)
                .opacity(1 - base)
            OpenRays()
                .frame(width: w * 1.7, height: w * 1.7)
                .mask(LinearGradient(stops: [.init(color: .white, location: 0), .init(color: .white, location: 0.5),
                                             .init(color: .clear, location: 0.5)], startPoint: .top, endPoint: .bottom))
                .offset(y: w * (edge - 0.5))
                .opacity(glow)
                .allowsHitTesting(false)
            photo(w)
                .mask(BandMask(from: 0, to: edge))
                .rotation3DEffect(.degrees(lid * (tin ? 25 : 70)), axis: (x: 1, y: 0, z: 0),
                                  anchor: UnitPoint(x: 0.5, y: edge), perspective: 0.5)
                .rotationEffect(.degrees(lid * (tin ? 40 : -8)), anchor: UnitPoint(x: 0.5, y: edge / 2))
                .offset(x: lid * w * (tin ? 0.4 : 0.08), y: -lid * w * (tin ? 1.15 : 0.8))
                .opacity(1 - max(0, lid - 0.55) / 0.45)
        }
        .shadow(color: .black.opacity(0.5), radius: 16, y: 10)
    }

    private func openLid() {
        stage = .opening
        let tin = style == .tin
        Task {
            withAnimation(.easeInOut(duration: 0.12)) { squash = true }
            if tin {
                // The tin rattles before the lid pops.
                withAnimation(.linear(duration: 0.36)) { shake = 1 }
                for _ in 0..<3 {
                    Haptics.tick(0.7)
                    try? await Task.sleep(for: .milliseconds(120))
                }
            } else {
                try? await Task.sleep(for: .milliseconds(160))
            }
            Haptics.tap(.heavy)
            withAnimation(.spring(response: 0.3, dampingFraction: 0.45)) { squash = false }
            withAnimation(tin ? .spring(response: 0.55, dampingFraction: 0.8) : .easeInOut(duration: 0.75)) { lid = 1 }
            withAnimation(.easeOut(duration: 0.35)) { glow = 1 }
            sparkle = UUID()
            try? await Task.sleep(for: .milliseconds(550))
            withAnimation(.easeIn(duration: 0.35)) {
                base = 1
                glow = 0
            }
            try? await Task.sleep(for: .milliseconds(320))
            reveal()
        }
    }

    private func photo(_ w: CGFloat) -> some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            let shift = sin(t * 0.7) * 0.3 + Motion.shared.roll * 0.7
            RemoteCardImage(url: product.image.flatMap(URL.init(string:)), name: product.name)
                .aspectRatio(contentMode: .fit)
                .padding(8)
                .frame(width: w, height: w)
                .background(Color.white)
                .overlay(
                    LinearGradient(stops: [.init(color: .clear, location: 0.38),
                                           .init(color: .white.opacity(0.45), location: 0.5),
                                           .init(color: .clear, location: 0.62)],
                                   startPoint: UnitPoint(x: -0.5 + shift, y: 0), endPoint: UnitPoint(x: 0.5 + shift, y: 1))
                        .blendMode(.screen)
                        .allowsHitTesting(false)
                )
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    /// The contents come out: the promo cards flip over one by one, then the packs drop in.
    private func reveal() {
        promos = onOpen()
        withAnimation(.easeInOut(duration: 0.3)) { stage = .open }
        let flips = style != .blister
        Task {
            try? await Task.sleep(for: .milliseconds(250))
            for i in 0..<total {
                withAnimation(.spring(response: 0.45, dampingFraction: 0.7)) { shown = i + 1 }
                if i < promos.count {
                    if flips {
                        try? await Task.sleep(for: .milliseconds(260))
                        withAnimation(.easeInOut(duration: 0.45)) { _ = faceUp.insert(i) }
                        try? await Task.sleep(for: .milliseconds(230))
                    } else {
                        faceUp.insert(i)
                    }
                    if (promos[i].market ?? 0) >= 5 { Haptics.hit() } else { Haptics.tap() }
                    try? await Task.sleep(for: .milliseconds(260))
                } else {
                    Haptics.tap()
                    try? await Task.sleep(for: .milliseconds(110))
                }
            }
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("-autorip") {
                try? await Task.sleep(for: .seconds(1))
                choose(0)
            }
            #endif
        }
    }

    // MARK: - Contents

    private var contents: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Inside the \(product.name)")
                            .font(.title3.bold())
                        Text(promos.isEmpty ? "Tap a pack to rip it." : "Tap a pack to rip it. Tap a promo to see its details.")
                            .font(.caption)
                            .foregroundStyle(Theme.muted)
                    }
                    if !promos.isEmpty {
                        Text(product.pickOnePromo ? "PROMO CARD · 1 FROM \(product.promos.count)" : "PROMO CARDS · \(promos.count)")
                            .font(.system(size: 11, weight: .semibold))
                            .kerning(0.8)
                            .foregroundStyle(Theme.muted)
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 12) {
                            ForEach(Array(promos.enumerated()), id: \.offset) { i, promo in
                                if i < shown {
                                    Button {
                                        info = PromoInfo(print: promo, setName: setName(of: promo))
                                    } label: {
                                        PromoTile(promo: promo, faceUp: faceUp.contains(i))
                                    }
                                    .buttonStyle(PressScale())
                                    .disabled(!faceUp.contains(i))
                                    .transition(.offset(y: 60).combined(with: .scale(scale: 0.7)).combined(with: .opacity))
                                }
                            }
                        }
                    }
                    Text("PACKS · \(packSlugs.count)")
                        .font(.system(size: 11, weight: .semibold))
                        .kerning(0.8)
                        .foregroundStyle(Theme.muted)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 5), spacing: 10) {
                        ForEach(Array(packSlugs.enumerated()), id: \.offset) { i, slug in
                            if i + promos.count < shown {
                                Button { choose(i) } label: { PackTile(slug: slug) }
                                    .buttonStyle(PressScale())
                                    .scaleEffect(chosen == i ? 1.2 : 1)
                                    .opacity(chosen == nil || chosen == i ? 1 : 0.35)
                                    .zIndex(chosen == i ? 1 : 0)
                                    .transition(.offset(y: 80).combined(with: .opacity))
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            HStack(spacing: 10) {
                Button(action: onDone) {
                    Text("Done for now").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                Button { choose(0) } label: {
                    Text("Rip packs (\(packSlugs.count))").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.cyan)
                .foregroundStyle(.black)
            }
            .controlSize(.large)
            .padding(16)
            .disabled(shown < total || chosen != nil)
        }
    }

    /// The chosen pack lifts, then the rip goes to it.
    private func choose(_ index: Int) {
        guard shown >= total, chosen == nil, packSlugs.indices.contains(index) else { return }
        Haptics.tap(.medium)
        withAnimation(.spring(response: 0.3, dampingFraction: 0.55)) { chosen = index }
        Task {
            try? await Task.sleep(for: .milliseconds(320))
            onRip(index)
        }
    }

    private func setName(of promo: CardPrint) -> String? {
        product.promos.first { $0.num == promo.num && $0.name == promo.name }?.setName
    }
}

// MARK: - Pieces

/// A button that shrinks a little under the finger.
struct PressScale: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.93 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

struct PackTile: View {
    let slug: String

    var body: some View {
        let set = SetLibrary.set(slug)
        VStack(spacing: 4) {
            PackArt(setName: set.name, sheen: 0, slug: slug, series: set.series, label: set.packLabel)
                .aspectRatio(0.6, contentMode: .fit)
                .shadow(color: .black.opacity(0.45), radius: 4, y: 3)
            Text(set.name).font(.system(size: 9)).foregroundStyle(Theme.muted).lineLimit(1)
        }
    }
}

struct PromoTile: View {
    let promo: CardPrint
    var faceUp = true
    @State private var burst = false

    var body: some View {
        let card = RipCard(print: promo, energy: nil)
        VStack(spacing: 4) {
            ZStack {
                FlipCard(angle: faceUp ? 0 : 180, front: CardFace(card: card), back: CardBack())
                    .aspectRatio(63.0 / 88.0, contentMode: .fit)
                    .shadow(color: .black.opacity(0.5), radius: 6, y: 4)
                if burst && card.hitTier >= .medium {
                    SparkleBurst(tier: .medium)
                        .frame(width: 260, height: 260)
                        .allowsHitTesting(false)
                }
            }
            Text(promo.name).font(.caption.weight(.medium)).lineLimit(1)
            Text(money(promo.market ?? 0))
                .font(.caption.monospaced())
                .foregroundStyle((promo.market ?? 0) >= 1 ? Theme.green : Theme.muted)
        }
        .foregroundStyle(Theme.text)
        .opacity(faceUp ? 1 : 0.9)
        .onChange(of: faceUp, initial: true) { _, up in
            guard up else { return }
            burst = true
            Task {
                try? await Task.sleep(for: .seconds(2))
                burst = false
            }
        }
    }
}

/// Under a blister's card: the pack and the promo in the plastic tray.
struct BlisterTray: View {
    /// Nil is a promo that is not known until the blister opens. It shows its back.
    let promos: [CardPrint?]
    let packSlugs: [String]

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let packs = Array(packSlugs.prefix(3).enumerated())
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(RadialGradient(colors: [Color(white: 0.22), Color(white: 0.07)], center: .center,
                                         startRadius: 0, endRadius: w * 0.75))
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(.white.opacity(0.10), lineWidth: 1)
                HStack(spacing: -w * 0.06) {
                    ZStack {
                        ForEach(packs, id: \.offset) { i, slug in
                            let set = SetLibrary.set(slug)
                            PackArt(setName: set.name, sheen: 0, slug: slug, series: set.series, label: set.packLabel)
                                .frame(width: w * 0.36, height: w * 0.6)
                                .rotationEffect(.degrees(Double(i) * 5 - Double(packs.count - 1) * 2.5))
                                .offset(x: CGFloat(i) * w * 0.05)
                                .shadow(color: .black.opacity(0.6), radius: 6, y: 4)
                        }
                    }
                    ForEach(Array(promos.enumerated()), id: \.offset) { i, promo in
                        Group {
                            if let promo {
                                CardFace(card: RipCard(print: promo, energy: nil))
                            } else {
                                CardBack()
                            }
                        }
                        .frame(width: w * 0.33, height: w * 0.33 * 88 / 63)
                        .rotationEffect(.degrees(4 + Double(i) * 4))
                        .shadow(color: .black.opacity(0.6), radius: 6, y: 4)
                    }
                }
            }
        }
    }
}

/// The light that comes out of a box or a tin when its lid comes off.
struct OpenRays: View {
    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            let colors: [Color] = [.white, Color(red: 1.0, green: 0.86, blue: 0.45), .white, Color(red: 0.6, green: 0.9, blue: 1.0)]
            ZStack {
                AngularGradient(colors: (0..<28).map { $0.isMultiple(of: 2) ? colors[($0 / 2) % colors.count] : .clear },
                                center: .center)
                    .rotationEffect(.degrees(t.truncatingRemainder(dividingBy: 360) * 12))
                    .mask(RadialGradient(colors: [.white, .white.opacity(0)], center: .center, startRadius: 10, endRadius: 280))
                    .opacity(0.6)
                RadialGradient(colors: [.white.opacity(0.9), Color(red: 1.0, green: 0.85, blue: 0.5).opacity(0.4), .clear],
                               center: .center, startRadius: 0, endRadius: 150)
                    .blendMode(.plusLighter)
            }
        }
    }
}

/// A horizontal band of the product, from a fraction of its height to another. The top band is the lid.
struct BandMask: Shape {
    let from: CGFloat
    let to: CGFloat

    func path(in rect: CGRect) -> Path {
        Path(CGRect(x: 0, y: rect.height * from, width: rect.width, height: rect.height * (to - from)))
    }
}

/// A page curl from the top trailing corner (Effects.metal). The corner follows the finger.
struct PeelEffect: ViewModifier, Animatable {
    /// The peeled corner, in the page's coordinates. The top trailing corner is no peel.
    var finger: CGPoint
    let page: CGSize
    var back = Color(red: 0.72, green: 0.78, blue: 0.86)

    var animatableData: AnimatablePair<CGFloat, CGFloat> {
        get { AnimatablePair(finger.x, finger.y) }
        set { finger = CGPoint(x: newValue.first, y: newValue.second) }
    }

    func body(content: Content) -> some View {
        let corner = CGPoint(x: page.width, y: 0)
        let dx = corner.x - finger.x
        let dy = corner.y - finger.y
        let distance = hypot(dx, dy)
        let radius = page.width * 0.05 + min(distance, page.width) * 0.06
        // The unit vector from the finger to the corner, and the fold line: the flipped corner lands under the finger.
        let n = distance > 1 ? CGVector(dx: dx / distance, dy: dy / distance) : CGVector(dx: 0.7071, dy: -0.7071)
        let foldOffset = (distance - .pi * radius) / 2
        let fold = CGPoint(x: finger.x + n.dx * foldOffset, y: finger.y + n.dy * foldOffset)
        // Room for the curl at the edges of the page.
        let pad = page.width * 0.25
        ZStack {
            content
                .padding(pad)
                .layerEffect(ShaderLibrary.peel(.float4(pad, pad, page.width, page.height),
                                                .float2(pad + corner.x, pad + corner.y),
                                                .float2(pad + finger.x, pad + finger.y),
                                                .float(radius),
                                                .color(back)),
                             maxSampleOffset: CGSize(width: page.width * 0.4, height: page.width * 0.4),
                             isEnabled: distance > 1)
                .padding(-pad)
            if distance > 1 {
                // The flap: the part past the cylinder, mirrored across the line halfway around it.
                let line = CGPoint(x: fold.x + n.dx * .pi * radius / 2, y: fold.y + n.dy * .pi * radius / 2)
                content
                    .overlay(back.opacity(0.9))
                    .overlay(
                        LinearGradient(colors: [.white.opacity(0.35), .clear, .black.opacity(0.12)],
                                       startPoint: UnitPoint(x: line.x / page.width, y: line.y / page.height),
                                       endPoint: UnitPoint(x: corner.x / page.width, y: corner.y / page.height))
                    )
                    .mask(HalfPlane(point: CGPoint(x: fold.x + n.dx * .pi * radius, y: fold.y + n.dy * .pi * radius),
                                    normal: n))
                    .transformEffect(Self.reflection(across: line, normal: n))
                    .shadow(color: .black.opacity(0.35), radius: 5, x: -n.dx * 3, y: -n.dy * 3)
                    .allowsHitTesting(false)
            }
        }
    }

    /// The mirror image across a line, given a point on the line and its unit normal.
    static func reflection(across point: CGPoint, normal n: CGVector) -> CGAffineTransform {
        let k = 2 * (point.x * n.dx + point.y * n.dy)
        return CGAffineTransform(a: 1 - 2 * n.dx * n.dx, b: -2 * n.dx * n.dy,
                                 c: -2 * n.dx * n.dy, d: 1 - 2 * n.dy * n.dy,
                                 tx: k * n.dx, ty: k * n.dy)
    }
}

/// The side of a line that its normal points to.
struct HalfPlane: Shape {
    let point: CGPoint
    let normal: CGVector

    func path(in rect: CGRect) -> Path {
        let big = (rect.width + rect.height) * 4
        let along = CGVector(dx: -normal.dy, dy: normal.dx)
        var path = Path()
        path.move(to: CGPoint(x: point.x + along.dx * big, y: point.y + along.dy * big))
        path.addLine(to: CGPoint(x: point.x - along.dx * big, y: point.y - along.dy * big))
        path.addLine(to: CGPoint(x: point.x - along.dx * big + normal.dx * big, y: point.y - along.dy * big + normal.dy * big))
        path.addLine(to: CGPoint(x: point.x + along.dx * big + normal.dx * big, y: point.y + along.dy * big + normal.dy * big))
        path.closeSubpath()
        return path
    }
}

/// A quick rattle from side to side, about the bottom edge.
struct Shake: GeometryEffect {
    var amount: Double

    var animatableData: Double {
        get { amount }
        set { amount = newValue }
    }

    func effectValue(size: CGSize) -> ProjectionTransform {
        let angle = sin(amount * .pi * 6) * 0.05 * (1 - amount * 0.4)
        let transform = CGAffineTransform(translationX: size.width / 2, y: size.height)
            .rotated(by: angle)
            .translatedBy(x: -size.width / 2, y: -size.height)
        return ProjectionTransform(transform)
    }
}

// MARK: - Promo details

struct PromoInfo: Identifiable {
    let id = UUID()
    let print: CardPrint
    let setName: String?
}

/// The details of a promo card from a product. The card tilts under the finger.
struct PromoInfoSheet: View {
    let info: PromoInfo
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let print = info.print
        ScrollView {
            VStack(spacing: 14) {
                TiltCard(card: RipCard(print: print, energy: nil))
                    .frame(width: 240)
                    .padding(.top, 28)
                VStack(spacing: 4) {
                    Text(print.name).font(.title2.bold()).multilineTextAlignment(.center)
                    if let setName = info.setName {
                        Text(setName).font(.subheadline).foregroundStyle(Theme.muted)
                    }
                    Text("\(print.rarity) · \(print.variant) · \(print.num)")
                        .font(.caption.monospaced())
                        .foregroundStyle(Theme.muted)
                }
                DetailBox(title: "Prices") {
                    HStack(alignment: .firstTextBaseline) {
                        Text("RAW")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(Theme.muted)
                        Spacer()
                        Text(money(print.market ?? 0)).font(.title3.monospaced().weight(.semibold))
                    }
                    GradedPricesGrid(print: print)
                }
                Text("This promo is now in Inventory, under Raw.")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                Button("Close") { dismiss() }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .presentationDragIndicator(.visible)
    }
}

/// A card that tilts under the finger and with the phone. A glare follows the tilt.
struct TiltCard: View {
    let card: RipCard
    @State private var drag: CGSize = .zero

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let motion = Motion.shared
            let tx = max(-1, min(1, drag.width / (w * 0.6))) + motion.roll * 0.4
            let ty = max(-1, min(1, drag.height / (h * 0.6))) + motion.pitch * 0.4
            CardFace(card: card)
                .overlay(
                    RadialGradient(colors: [.white.opacity(0.5), .clear],
                                   center: UnitPoint(x: 0.5 - tx * 0.6, y: 0.5 - ty * 0.6),
                                   startRadius: 0, endRadius: w * 0.9)
                        .blendMode(.overlay)
                        .clipShape(RoundedRectangle(cornerRadius: w * 0.05))
                        .allowsHitTesting(false)
                )
                .rotation3DEffect(.degrees(tx * 16), axis: (x: 0, y: 1, z: 0), perspective: 0.5)
                .rotation3DEffect(.degrees(-ty * 16), axis: (x: 1, y: 0, z: 0), perspective: 0.5)
                .shadow(color: .black.opacity(0.55), radius: 16, x: -tx * 10, y: 12 - ty * 6)
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { drag = $0.translation }
                        .onEnded { _ in
                            withAnimation(.spring(response: 0.5, dampingFraction: 0.5)) { drag = .zero }
                        }
                )
        }
        .aspectRatio(63.0 / 88.0, contentMode: .fit)
    }
}
