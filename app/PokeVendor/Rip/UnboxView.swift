import SwiftUI

/// Opening a sealed product before its packs: the closed product, the opening, then the promos and the packs.
struct UnboxView: View {
    let product: Product
    let packSlugs: [String]
    let onOpen: () -> [CardPrint]
    let onRip: () -> Void
    let onDone: () -> Void

    private enum Stage { case closed, opening, open }
    private enum Style { case blister, box, tin }

    @State private var stage: Stage = .closed
    @State private var progress = 0.0
    @State private var promos: [CardPrint] = []
    @State private var shown = 0

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
                } else {
                    contents
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }

    // MARK: - Closed and opening

    private func closedProduct(size: CGSize) -> some View {
        let w = min(size.width * 0.8, 340)
        return VStack(spacing: 18) {
            Spacer()
            ZStack {
                switch style {
                case .blister:
                    photo(w).mask(HalfMask(left: true)).modifier(Peel(progress: progress, left: true, width: w))
                    photo(w).mask(HalfMask(left: false)).modifier(Peel(progress: progress, left: false, width: w))
                case .box:
                    photo(w).mask(BandMask(from: 0.32, to: 1)).offset(y: progress * w * 1.2).opacity(1 - progress)
                    photo(w).mask(BandMask(from: 0, to: 0.32))
                        .rotationEffect(.degrees(-10 * progress), anchor: .bottomLeading)
                        .offset(x: progress * w * 0.2, y: -progress * w * 1.1)
                        .opacity(1 - progress)
                case .tin:
                    photo(w)
                        .scaleEffect(1 + progress * 0.25)
                        .rotationEffect(.degrees(progress * 25))
                        .offset(y: -progress * w * 1.2)
                        .opacity(1 - progress)
                }
            }
            .frame(width: w, height: w)
            Text(product.name)
                .font(.headline)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
                .opacity(1 - progress)
            Text(openHint)
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
                .opacity(stage == .closed ? 1 : 0)
            Spacer()
            Spacer()
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: open)
        .onAppear {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("-autoopen") {
                Task {
                    try? await Task.sleep(for: .seconds(2))
                    open()
                }
            }
            #endif
        }
    }

    private var openHint: String {
        switch style {
        case .blister: "Tap to peel the blister open"
        case .box: "Tap to lift the lid"
        case .tin: "Tap to pop the lid"
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
                .shadow(color: .black.opacity(0.5), radius: 16, y: 10)
        }
    }

    private func open() {
        guard stage == .closed else { return }
        stage = .opening
        Haptics.tap(.heavy)
        promos = onOpen()
        withAnimation(.easeIn(duration: 0.55)) { progress = 1 }
        Task {
            try? await Task.sleep(for: .milliseconds(560))
            stage = .open
            for i in 0..<total {
                try? await Task.sleep(for: .milliseconds(i < promos.count ? 380 : 120))
                withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) { shown = i + 1 }
                if i < promos.count, (promos[i].market ?? 0) >= 5 { Haptics.hit() } else { Haptics.tap() }
            }
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("-autorip") {
                try? await Task.sleep(for: .seconds(1))
                onRip()
            }
            #endif
        }
    }

    // MARK: - Contents

    private var contents: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Inside the \(product.name)")
                        .font(.title3.bold())
                    if !promos.isEmpty {
                        Text(product.pickOnePromo ? "PROMO CARD · 1 FROM \(product.promos.count)" : "PROMO CARDS · \(promos.count)")
                            .font(.system(size: 11, weight: .semibold))
                            .kerning(0.8)
                            .foregroundStyle(Theme.muted)
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 12) {
                            ForEach(Array(promos.enumerated()), id: \.offset) { i, promo in
                                if i < shown {
                                    PromoTile(promo: promo)
                                        .transition(.scale(scale: 0.5).combined(with: .opacity))
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
                                let set = SetLibrary.set(slug)
                                VStack(spacing: 4) {
                                    PackArt(setName: set.name, sheen: 0, slug: slug, series: set.series, label: set.packLabel)
                                        .aspectRatio(0.6, contentMode: .fit)
                                    Text(set.name).font(.system(size: 9)).foregroundStyle(Theme.muted).lineLimit(1)
                                }
                                .transition(.move(edge: .bottom).combined(with: .opacity))
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
                Button(action: onRip) {
                    Text("Rip packs (\(packSlugs.count))").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.cyan)
                .foregroundStyle(.black)
            }
            .controlSize(.large)
            .padding(16)
            .disabled(shown < total)
        }
    }
}

struct PromoTile: View {
    let promo: CardPrint
    @State private var burst = true

    var body: some View {
        let card = RipCard(print: promo, energy: nil)
        VStack(spacing: 4) {
            ZStack {
                CardFace(card: card)
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
        .task {
            try? await Task.sleep(for: .seconds(2))
            burst = false
        }
    }
}

/// The left or right half of the product, for a blister that peels apart.
struct HalfMask: Shape {
    let left: Bool

    func path(in rect: CGRect) -> Path {
        Path(CGRect(x: left ? 0 : rect.midX, y: 0, width: rect.width / 2, height: rect.height))
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

/// One half of a blister peels away to its side.
struct Peel: ViewModifier {
    let progress: Double
    let left: Bool
    let width: CGFloat

    func body(content: Content) -> some View {
        content
            .rotationEffect(.degrees((left ? -1 : 1) * 30 * progress), anchor: left ? .bottomLeading : .bottomTrailing)
            .offset(x: (left ? -1 : 1) * progress * width * 0.8, y: progress * width * 0.3)
            .opacity(1 - progress)
    }
}
