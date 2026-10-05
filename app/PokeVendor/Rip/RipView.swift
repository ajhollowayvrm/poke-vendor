import SwiftUI

/// Where things sit on the screen: the pile on top, the stack under it, the condition on the left of the stack,
/// and the cut on the right. The spare height is shared evenly, so no gap opens under the stack.
struct TableLayout {
    static let ratio: CGFloat = 88.0 / 63.0
    let size: CGSize
    let topInset: CGFloat = 104
    /// The price panel and the buttons under the stack.
    let bottomInset: CGFloat = 236
    let side: CGFloat = 12
    let gap: CGFloat = 8
    /// The width of each column at the sides of the stack.
    let infoW: CGFloat = 66
    let pileScale: CGFloat = 0.36
    /// The cards under the top card step up a little (placement), so the stack needs this much room above it.
    let depth: CGFloat = 14

    private var room: CGFloat { size.height - topInset - bottomInset - depth }
    var cardW: CGFloat {
        min(size.width - side * 2 - infoW * 2 - gap * 2, (room - gap * 3) / (Self.ratio * (1 + pileScale)))
    }
    var cardH: CGFloat { cardW * Self.ratio }
    var pileSize: CGSize { CGSize(width: cardW * pileScale, height: cardH * pileScale) }
    private var spare: CGFloat { max(0, room - pileSize.height - cardH) / 3 }
    var pileCenter: CGPoint { CGPoint(x: size.width / 2, y: topInset + spare + pileSize.height / 2) }
    var stackCenter: CGPoint {
        CGPoint(x: size.width / 2, y: topInset + spare * 2 + pileSize.height + depth + cardH / 2)
    }
    /// The condition column on the left of the stack, and the cut column on the right.
    var leftInfo: CGPoint { CGPoint(x: (side + size.width / 2 - cardW / 2 - gap) / 2, y: stackCenter.y) }
    var rightInfo: CGPoint { CGPoint(x: size.width - leftInfo.x, y: stackCenter.y) }
    /// The sealed pack sits in the middle of the free space. Its cards move to the stack when they come out.
    var packCenter: CGPoint { CGPoint(x: size.width / 2, y: topInset + room / 2) }
    /// The pack fits between the top bar and the panel, and keeps its shape.
    var packH: CGFloat { min(cardH * 1.28, room - 8, (size.width - side * 2) / Self.packAspect) }
    var packW: CGFloat { packH * Self.packAspect }
    static let packAspect: CGFloat = 1.12 / (1.28 * ratio)
}

private struct Placement {
    var point: CGPoint
    var scale: CGFloat
    var rotation: Double
    var z: Double
    var faceUp: Bool
}

/// The product was resealed: the rip stops here in every mode (docs/14-counterfeit-risk.md; docs/18, The stop rule).
struct ResealedBanner: View {
    let onDismiss: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.6).ignoresSafeArea()
            VStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 40)).foregroundStyle(Theme.orange)
                Text("RESEALED").font(.system(size: 28, weight: .black, design: .monospaced)).foregroundStyle(Theme.orange)
                Text("Someone opened this product, took the hits, and sealed it again. Only filler is left. Every pack from it is worthless.")
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Theme.text)
                Button(action: onDismiss) { Text("Continue").frame(maxWidth: .infinity) }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.orange)
                    .foregroundStyle(.black)
                    .controlSize(.large)
            }
            .padding(20)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.orange.opacity(0.6)))
            .padding(28)
        }
    }
}

struct RipView: View {
    @State private var model: RipModel
    let onClose: () -> Void

    /// `onHits` gets every hit of the rip when the screen closes. A live stream uses it.
    init(items: [SealedItem], store: GameStore, allowedModes: [RipMode] = RipMode.allCases,
         onHits: (([RipCard]) -> Void)? = nil, onClose: @escaping () -> Void) {
        let model = RipModel(items: items, store: store)
        model.allowedModes = allowedModes
        _model = State(initialValue: model)
        self.onClose = {
            onHits?(model.allHits)
            onClose()
        }
    }

    @State private var tearProgress: Double = 0
    @State private var torn = false
    @State private var tearFromLeft = true
    @State private var tearTicks = 0
    @State private var flecks: [FleckBurst] = []
    /// The light out of the top of the pack, the moment it opens.
    @State private var openFlash = 0.0
    @State private var lastLayout: TableLayout?
    /// The demigod or god pack moment, while it shows.
    @State private var celebration: SpecialPack?
    @State private var cardsRise = false
    @State private var cardsOut = false
    @State private var packGone = false
    /// Hits only: the pack in the row of tears that shows now.
    @State private var tearingIndex: Int?
    @State private var peeking = false
    @State private var showSummary = false
    @State private var pressing = false
    @State private var peekTask: Task<Void, Never>?
    @State private var burst: HitBurst?
    @State private var popID: UUID?
    /// The turn of the whole stack during a flip, in degrees.
    @State private var stackTurn: Double = 0
    @State private var flipping = false
    @State private var skipAfterOpen = false
    /// The resealed product banner, while it shows.
    @State private var resealedShown = false
    /// The runner for Fast and Sift.
    @State private var autoTask: Task<Void, Never>?
    @State private var stopRuleShown = false
    /// The info panel, the pile label, and the glow wait until a card has turned face up.
    @State private var infoCard: RipCard?
    @State private var pileTop: RipCard?
    @State private var settledTopID: UUID?

    var body: some View {
        GeometryReader { geo in
            let layout = TableLayout(size: geo.size)
            ZStack {
                TopBar(model: model, onSkip: skipPack, onClose: onClose)
                    .frame(maxHeight: .infinity, alignment: .top)

                if model.phase == .open || model.phase == .done {
                    pileOutline(layout)
                    pileSlot(layout)
                }

                if model.phase == .open || model.phase == .done, !peeking, let card = infoCard, card.print != nil,
                   model.allCards.contains(where: { $0.id == card.id }) {
                    ConditionColumn(card: card)
                        .frame(width: layout.infoW)
                        .position(layout.leftInfo)
                        .zIndex(330)
                    CutColumn(card: card, tool: model.centeringTool)
                        .frame(width: layout.infoW)
                        .position(layout.rightInfo)
                        .zIndex(330)
                }

                if let front = glowCard {
                    HitGlow(tier: front.hitTier, cardSize: CGSize(width: layout.cardW, height: layout.cardH))
                        .id(front.id)
                        .position(layout.stackCenter)
                        .zIndex(30)
                }

                if model.phase != .sealed && model.phase != .unbox {
                    ForEach(model.allCards) { card in
                        let p = placement(for: card, layout: layout)
                        CardView(card: card, faceUp: p.faceUp)
                            .frame(width: layout.cardW, height: layout.cardH)
                            .shadow(color: .black.opacity(0.45), radius: 6, y: 4)
                            .scaleEffect(p.scale)
                            .rotation3DEffect(.degrees(inStack(card) ? stackTurn : 0), axis: (x: 0, y: 1, z: 0), perspective: 0.4)
                            .rotationEffect(.degrees(p.rotation))
                            .position(p.point)
                            .zIndex(p.z)
                            // The Hits only row of tears hides the cards until they rise out of the last pack.
                            .opacity(tearingIndex != nil && !cardsRise && !cardsOut ? 0 : 1)
                            .allowsHitTesting(false)
                    }
                }

                if model.phase == .sealed || model.phase == .opening {
                    let wrapper = wrapperSet
                    PackView(setName: wrapper.name, slug: wrapper.slug, series: wrapper.series,
                             label: wrapper.packLabel, image: wrapper.packImage,
                             tearProgress: tearProgress, torn: torn,
                             fromLeft: tearFromLeft)
                        .id(tearingIndex ?? -1)
                        .frame(width: layout.packW, height: layout.packH)
                        .overlay(alignment: .bottom) { packCount(layout) }
                        .rotationEffect(.degrees(packGone ? 14 : 0))
                        .position(x: layout.packCenter.x,
                                  y: layout.packCenter.y + (packGone ? geo.size.height : 0))
                        .zIndex(300)
                        .transition(.asymmetric(insertion: .offset(y: 140).combined(with: .scale(scale: 0.85)).combined(with: .opacity),
                                                removal: .opacity))
                }

                if openFlash > 0 {
                    // A god pack gives itself away with a rainbow light.
                    RadialGradient(colors: godLight
                                       ? [.white.opacity(0.95), .pink.opacity(0.6), .yellow.opacity(0.5), .cyan.opacity(0.4), .purple.opacity(0.3), .clear]
                                       : [.white.opacity(0.9), Color(red: 1.0, green: 0.9, blue: 0.6).opacity(0.35), .clear],
                                   center: .center, startRadius: 0, endRadius: layout.packW * (godLight ? 1.1 : 0.8))
                        .frame(width: layout.packW * 1.8, height: layout.packW * 1.1)
                        .blendMode(.plusLighter)
                        .opacity(openFlash)
                        .position(x: layout.packCenter.x, y: tearY(layout))
                        .allowsHitTesting(false)
                        .zIndex(302)
                }

                TearFlecks(bursts: flecks)
                    .zIndex(305)

                if model.phase == .sealed {
                    Color.clear
                        .contentShape(Rectangle())
                        .frame(width: layout.packW + 40, height: layout.packH * 0.32)
                        .position(x: layout.packCenter.x,
                                  y: layout.packCenter.y - layout.packH / 2 + layout.packH * 0.14)
                        .gesture(tearGesture(layout))
                        .zIndex(310)
                }

                if model.phase == .open {
                    Color.clear
                        .contentShape(Rectangle())
                        .frame(width: layout.cardW, height: layout.cardH)
                        .position(layout.stackCenter)
                        .gesture(stackGesture)
                        .zIndex(400)
                }

                if model.phase == .unbox, let product = model.unboxing {
                    UnboxView(product: product, packSlugs: model.unboxPackSlugs,
                              onOpen: { model.openProduct() },
                              onRip: { index in
                                  withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) { model.startPacks(at: index) }
                              },
                              onDone: onClose)
                        .padding(.top, 96)
                        .transition(.opacity)
                        .zIndex(340)
                } else {
                    bottomPanel
                        .frame(maxHeight: .infinity, alignment: .bottom)
                        .zIndex(350)
                }

                if let burst {
                    let inPile = model.pile.contains { $0.id == burst.card.id }
                    SparkleBurst(tier: burst.card.hitTier)
                        .frame(width: 800, height: 900)
                        .position(inPile ? layout.pileCenter : layout.stackCenter)
                        .id(burst.id)
                        .zIndex(360)
                    if burst.card.hitTier >= .medium && !inPile {
                        HitBanner(card: burst.card)
                            .position(x: layout.stackCenter.x, y: layout.stackCenter.y + layout.cardH / 2 - 12)
                            .id(burst.id)
                            .transition(.opacity)
                            .zIndex(370)
                    }
                    if burst.card.hitTier == .big {
                        HitShockwave(tier: burst.card.hitTier,
                                     cardSize: inPile ? layout.pileSize : CGSize(width: layout.cardW, height: layout.cardH))
                            .position(inPile ? layout.pileCenter : layout.stackCenter)
                            .id(burst.id)
                            .zIndex(355)
                    }
                }

                if let celebration {
                    SpecialPackCelebration(special: celebration) {
                        withAnimation(.easeOut(duration: 0.4)) { self.celebration = nil }
                    }
                    .transition(.opacity)
                    .zIndex(480)
                }

                if resealedShown {
                    ResealedBanner {
                        withAnimation(.easeOut(duration: 0.3)) { resealedShown = false }
                    }
                    .transition(.opacity)
                    .zIndex(485)
                }

                if peeking {
                    PeekView(cards: model.stack, size: geo.size)
                        .transition(.opacity)
                        .zIndex(500)
                }

                if showSummary {
                    ZStack {
                        Color.black.opacity(0.55).ignoresSafeArea()
                        SummaryView(model: model, onNext: nextPack, onDone: onClose) {
                            withAnimation(.easeInOut(duration: 0.25)) { showSummary = false }
                        }
                    }
                    .transition(.opacity)
                    .zIndex(600)
                }
            }
        }
        .background(
            GeometryReader { geo in
                Color.clear
                    .onAppear { lastLayout = TableLayout(size: geo.size) }
                    .onChange(of: geo.size) { _, size in lastLayout = TableLayout(size: size) }
            }
        )
        .background(
            LinearGradient(colors: [Theme.background, Color(red: 0.07, green: 0.10, blue: 0.14)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        )
        .onAppear {
            Motion.shared.start()
            #if DEBUG
            runDemo()
            #endif
            if model.mode != .normal { runAuto() }
        }
        .onDisappear { autoTask?.cancel() }
        .onChange(of: model.mode) { _, mode in
            model.resume()
            if mode == .normal { autoTask?.cancel() } else { runAuto() }
        }
        .onChange(of: model.paused) { _, paused in
            if !paused, model.mode != .normal { runAuto() }
        }
        .sheet(isPresented: $stopRuleShown) {
            if let slug = model.currentPack?.setSlug, let store = model.store {
                StopRuleSheet(slug: slug).environment(store)
            }
        }
        .onChange(of: model.lastReveal) { _, reveal in
            guard let card = reveal?.card, card.hitTier >= .medium else { return }
            Task {
                try? await Task.sleep(for: .milliseconds(Self.revealDelay))
                celebrate(card)
            }
        }
        .onChange(of: model.specialMoment) { _, moment in
            guard moment != nil, let special = model.special else { return }
            Task {
                try? await Task.sleep(for: .milliseconds(Self.revealDelay + 350))
                withAnimation(.easeIn(duration: 0.25)) { celebration = special }
            }
        }
        .onChange(of: model.shownPack?.index) { old, new in
            // Hits only: a new pack comes to the front of the stack.
            guard let new, old != nil, model.phase == .open, model.mode != .sift, let count = model.shownPack?.count else { return }
            Haptics.tap(.medium)
            model.note = "Pack \(new + 1) of \(count)"
        }
        .onChange(of: model.resealedMoment) { _, moment in
            guard moment != nil else { return }
            Task {
                try? await Task.sleep(for: .milliseconds(Self.revealDelay + 200))
                Haptics.tap(.heavy)
                withAnimation(.easeIn(duration: 0.25)) { resealedShown = true }
            }
        }
        .onChange(of: revealKey) { _, _ in
            Task {
                try? await Task.sleep(for: .milliseconds(Self.revealDelay))
                settleReveal()
            }
        }
        .onChange(of: model.phase) { _, phase in
            Task {
                try? await Task.sleep(for: .milliseconds(Self.revealDelay))
                settleReveal()
            }
            guard phase == .done else { return }
            // In Fast and Sift the next pack comes by itself. The summary shows after the last one.
            if model.mode != .normal, model.hasNextPack, !model.paused { return }
            Task {
                try? await Task.sleep(for: .milliseconds(700))
                // The summary waits for the demigod or god pack moment to end.
                while celebration != nil { try? await Task.sleep(for: .milliseconds(200)) }
                if model.phase == .done {
                    withAnimation(.easeInOut(duration: 0.3)) { showSummary = true }
                }
            }
        }
    }

    // MARK: - Pieces

    /// The rainbow light of a god pack. In the Hits only row of tears, only the god pack's own tear has it.
    private var godLight: Bool {
        if let i = tearingIndex, model.combinedSlugs != nil { return i == model.godIndex }
        return model.special?.isGod == true
    }

    /// The wrapper on the table. In the Hits only row of tears, each pack shows its own set.
    private var wrapperSet: SetData {
        if let i = tearingIndex, let slugs = model.combinedSlugs, slugs.indices.contains(i) { return SetLibrary.set(slugs[i]) }
        return model.cardSet
    }

    /// Hits only: how many packs the tear opens, and which pack of the row is tearing.
    @ViewBuilder private func packCount(_ layout: TableLayout) -> some View {
        let total = model.combinedSlugs?.count ?? (model.willCombine ? model.packsLeft : 0)
        if total > 1 {
            Text(tearingIndex.map { "\($0 + 1) of \(total)" } ?? "× \(total) packs")
                .font(.caption.monospaced().weight(.bold))
                .foregroundStyle(.black)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Theme.orange, in: Capsule())
                .offset(y: 16)
                .opacity(packGone ? 0 : 1)
        }
    }

    /// About half of a card's flip. A face shows only after it turns past edge-on.
    static let revealDelay = 260

    /// Changes whenever a card might turn face up.
    private var revealKey: String {
        "\(model.focusCard?.id.uuidString ?? "")|\(model.pile.last?.id.uuidString ?? "")|\(model.stack.first?.id.uuidString ?? "")|\(model.faceUp)|\(model.showcaseID?.uuidString ?? "")"
    }

    private func settleReveal() {
        // No card shows before the pack is open, also when the Hits only tear builds the stack early.
        let open = model.phase == .open || model.phase == .done
        infoCard = open ? model.focusCard : nil
        pileTop = model.pile.last
        settledTopID = open ? model.stack.first.flatMap { model.isShownFaceUp($0) ? $0.id : nil } : nil
    }

    private func inStack(_ card: RipCard) -> Bool {
        model.stack.contains { $0.id == card.id }
    }

    /// The top card, when it shows face up and is a medium or big hit.
    private var glowCard: RipCard? {
        guard model.phase == .open || model.phase == .done, model.tuckingID == nil, !flipping,
              let front = model.stack.first, front.id == settledTopID, model.isShownFaceUp(front),
              front.hitTier >= .medium else { return nil }
        return front
    }

    /// The dashed place for the pile. It sits under the pile cards.
    private func pileOutline(_ layout: TableLayout) -> some View {
        RoundedRectangle(cornerRadius: 6)
            .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
            .foregroundStyle(Theme.line)
            .frame(width: layout.pileSize.width, height: layout.pileSize.height)
            .overlay {
                if model.pile.isEmpty {
                    Text("Pile").font(.caption).foregroundStyle(Theme.muted)
                }
            }
            .position(layout.pileCenter)
            .zIndex(1)
    }

    private func pileSlot(_ layout: TableLayout) -> some View {
        ZStack {
            if let top = pileTop, model.pile.contains(where: { $0.id == top.id }) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("\(model.pile.count) of \(model.allCards.count)")
                        .font(.caption2.monospaced())
                        .foregroundStyle(Theme.muted)
                    Text(top.name)
                        .font(.caption.weight(.semibold))
                        .lineLimit(2)
                    Text(money(top.market))
                        .font(.caption.monospaced())
                        .foregroundStyle(top.isHit ? Theme.green : Theme.text)
                    Text("Tap to put back")
                        .font(.caption2)
                        .foregroundStyle(Theme.muted)
                }
                .frame(width: 110, alignment: .leading)
                .position(x: layout.pileCenter.x + layout.pileSize.width / 2 + 16 + 55, y: layout.pileCenter.y)
            }

            Color.clear
                .contentShape(Rectangle())
                .frame(width: layout.pileSize.width * 1.3, height: layout.pileSize.height * 1.2)
                .position(layout.pileCenter)
                .onTapGesture(perform: returnFromPile)
        }
        .zIndex(320)
    }

    private var bottomPanel: some View {
        VStack(spacing: 10) {
            if model.phase == .sealed, model.mode == .normal {
                Text(model.willCombine && model.packsLeft > 1
                     ? "Hits only. One swipe opens all \(model.packsLeft) packs."
                     : "Tap or swipe across the top of the pack to open it.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, minHeight: 82)
            } else {
                CardInfo(card: infoCard.flatMap { card in model.allCards.contains { $0.id == card.id } ? card : nil })
            }
            modeControl
            HStack(spacing: 10) {
                Button { flipStack() } label: {
                    VStack(spacing: 1) {
                        Label("Flip", systemImage: "arrow.triangle.2.circlepath")
                            .font(.subheadline.weight(.semibold))
                        Text(model.faceUp ? "face up" : "face down")
                            .font(.caption2.monospaced())
                            .foregroundStyle(Theme.muted)
                    }
                    .frame(width: 120)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .disabled(flipping || model.tuckingID != nil || model.trickDone)
                Button(action: moveToBack) {
                    VStack(spacing: 1) {
                        Label("Pack trick", systemImage: "arrow.uturn.down")
                            .font(.subheadline.weight(.semibold))
                        Text(model.trickDone ? "done" : !model.trickNeeded ? "rare is last"
                             : "\(model.trickCount) · \(model.faceUp ? "back → front" : "top → bottom")")
                            .font(.caption2.monospaced())
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.cyan)
                .foregroundStyle(model.trickDone || !model.trickNeeded ? Theme.muted : .black)
                .controlSize(.large)
                .disabled(model.phase != .open || model.trickCount == 0 || model.trickDone)
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    /// The rip mode for this rip, and the stop rule (docs/18-ripping.md, Rip modes). Sift shows on a stream,
    /// but it is off there.
    private var modeControl: some View {
        HStack(spacing: 8) {
            Picker("Mode", selection: Bindable(model).mode) {
                ForEach(RipMode.allCases, id: \.self) { mode in
                    Text(mode.label).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .disabled(false)
            .overlay {
                if !model.allowedModes.contains(.sift) {
                    // Sift is off on a stream. The overlay takes the taps on its third of the control.
                    GeometryReader { geo in
                        Color.clear
                            .contentShape(Rectangle())
                            .frame(width: geo.size.width / 3)
                            .position(x: geo.size.width * 5 / 6, y: geo.size.height / 2)
                            .onTapGesture { model.note = "Sift is off on a live stream. Viewers want to see the cards." }
                    }
                }
            }
            if model.mode != .normal {
                Button(model.paused ? "Continue" : "Pause") {
                    if model.paused { model.resume() } else { model.paused = true; autoTask?.cancel() }
                }
                .buttonStyle(.bordered)
                .tint(Theme.cyan)
            }
            Button(action: toggleHitsOnly) {
                Image(systemName: model.hitsOnly && model.allowsHitsOnly ? "sparkles.rectangle.stack.fill" : "sparkles.rectangle.stack")
            }
            .buttonStyle(.bordered)
            .tint(model.hitsOnly && model.allowsHitsOnly ? Theme.orange : Theme.cyan)
            .accessibilityLabel("Hits only")
            Button { stopRuleShown = true } label: { Image(systemName: "line.3.horizontal.decrease.circle") }
                .buttonStyle(.bordered)
                .tint(Theme.cyan)
                .accessibilityLabel("Stop rule")
        }
        .overlay(alignment: .top) {
            if let note = model.note {
                Text(note).font(.caption).foregroundStyle(Theme.orange).offset(y: -22)
                    .task(id: note) {
                        try? await Task.sleep(for: .seconds(2.5))
                        model.note = nil
                    }
            }
        }
    }

    /// Hits only: the stack holds only the hit slots of each pack (docs/18-ripping.md, Hits only).
    private func toggleHitsOnly() {
        guard model.allowsHitsOnly else {
            model.note = "Hits only is off on a live stream. Viewers want to see the cards."
            return
        }
        Haptics.tap()
        model.hitsOnly.toggle()
        let later = model.phase == .sealed ? "" : model.hasNextPack ? " From the next pack." : " From the next rip."
        model.note = model.hitsOnly ? "Hits only: one swipe opens every pack.\(later)" : "Hits only off: every card.\(later)"
    }

    /// Fast and Sift: the pack opens by itself, the cards advance, and the rip stops on the stop rule
    /// (docs/18-ripping.md, Fast and Sift). A resealed pack always stops.
    private func runAuto() {
        autoTask?.cancel()
        autoTask = Task { @MainActor in
            while !Task.isCancelled, model.mode != .normal, !model.paused {
                switch model.phase {
                case .unbox:
                    model.openProduct()
                    try? await Task.sleep(for: .milliseconds(400))
                    withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) { model.startPacks() }
                    try? await Task.sleep(for: .milliseconds(500))
                case .sealed:
                    if model.mode == .sift, model.willCombine {
                        // Hits only in Sift: no tears, but a god pack still plays its moment first.
                        model.startOpening()
                        await playGodPack()
                        model.finishOpening()
                    } else if model.mode == .sift {
                        let stopped = model.sift()
                        try? await Task.sleep(for: .seconds(Balance.siftStepSeconds * Double(model.allCards.count)))
                        if stopped != nil { return }
                    } else {
                        tear()
                        while model.phase == .opening, !Task.isCancelled { try? await Task.sleep(for: .milliseconds(100)) }
                        try? await Task.sleep(for: .milliseconds(300))
                    }
                case .opening:
                    try? await Task.sleep(for: .milliseconds(100))
                case .open:
                    if model.mode == .sift {
                        if model.sift() != nil { return }
                        continue
                    }
                    // The pack trick always plays in Fast (docs/18).
                    if !model.trickDone, model.trickCount > 0 {
                        moveToBack()
                        while (model.tuckingID != nil || !model.faceUp || flipping), !Task.isCancelled {
                            try? await Task.sleep(for: .milliseconds(120))
                        }
                        try? await Task.sleep(for: .milliseconds(300))
                        continue
                    }
                    if !model.faceUp { flipStack(force: true) }
                    while flipping, !Task.isCancelled { try? await Task.sleep(for: .milliseconds(80)) }
                    guard let front = model.stack.first else { continue }
                    if front.print != nil, model.shouldStop(front) {
                        model.stop(on: front)
                        Haptics.tap(.medium)
                        return
                    }
                    withAnimation(.spring(response: 0.45, dampingFraction: 0.84)) { model.sendFrontToPile() }
                    try? await Task.sleep(for: .seconds(Balance.fastStepSeconds))
                case .done:
                    guard model.hasNextPack else { return }
                    try? await Task.sleep(for: .milliseconds(model.mode == .sift ? 250 : 900))
                    while celebration != nil, !Task.isCancelled { try? await Task.sleep(for: .milliseconds(200)) }
                    while resealedShown, !Task.isCancelled { try? await Task.sleep(for: .milliseconds(200)) }
                    withAnimation(.easeInOut(duration: 0.25)) { showSummary = false }
                    nextPack()
                    try? await Task.sleep(for: .milliseconds(300))
                }
            }
        }
    }

    /// Turns the whole stack over. The order reverses while the stack is edge-on, so no card jumps.
    /// After the pack trick, the stack stays face up for the rest of the pack.
    private func flipStack(force: Bool = false) {
        guard !flipping, model.tuckingID == nil, force || !model.trickDone else { return }
        guard model.phase == .open || model.phase == .done else {
            model.setFaceUp(!model.faceUp)
            return
        }
        flipping = true
        Haptics.tap()
        withAnimation(.easeIn(duration: 0.16)) { stackTurn = 90 }
        Task {
            try? await Task.sleep(for: .milliseconds(160))
            var still = Transaction()
            still.disablesAnimations = true
            withTransaction(still) { model.setFaceUp(!model.faceUp) }
            withAnimation(.easeOut(duration: 0.2)) { stackTurn = 0 }
            try? await Task.sleep(for: .milliseconds(200))
            flipping = false
        }
    }

    private func placement(for card: RipCard, layout: TableLayout) -> Placement {
        if let j = model.pile.firstIndex(where: { $0.id == card.id }) {
            return Placement(point: layout.pileCenter, scale: layout.pileScale, rotation: card.tilt,
                             z: 100 + Double(j), faceUp: true)
        }
        let i = model.stack.firstIndex(where: { $0.id == card.id }) ?? 0
        let center = layout.stackCenter
        if model.phase == .opening && !cardsOut {
            let y = cardsRise ? center.y - layout.packH * 0.42 : center.y + 20
            return Placement(point: CGPoint(x: layout.packCenter.x, y: y), scale: 1, rotation: 0,
                             z: 50 - Double(i), faceUp: model.faceUp)
        }
        if card.id == model.tuckingID {
            // From the back, the card slides out behind the stack. From the top, it slides out over it.
            return Placement(point: CGPoint(x: center.x - layout.cardW * 0.8, y: center.y + 16), scale: 0.96,
                             rotation: -9, z: model.tuckFromBack ? -10 : 200, faceUp: model.faceUp)
        }
        let depth = CGFloat(min(i, 10))
        return Placement(point: CGPoint(x: center.x + depth * 0.5, y: center.y - depth * 1.3),
                         scale: card.id == popID ? 1.08 : 1,
                         rotation: 0, z: 50 - Double(i), faceUp: model.isShownFaceUp(card))
    }

    // MARK: - Gestures

    private func tearGesture(_ layout: TableLayout) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                guard model.phase == .sealed else { return }
                if tearProgress == 0, abs(value.translation.width) > 2 {
                    tearFromLeft = value.translation.width > 0
                }
                tearProgress = min(1, abs(value.translation.width) / (layout.packW * 0.8))
                // The foil clicks and sheds flecks as the tear moves.
                let step = Int(tearProgress * 14)
                if step > tearTicks {
                    tearTicks = step
                    Haptics.tick(0.3 + 0.5 * tearProgress)
                    addFlecks(layout, count: 5)
                }
            }
            .onEnded { value in
                let moved = abs(value.translation.width)
                if moved < 8 || tearProgress > 0.45 || abs(value.predictedEndTranslation.width) > layout.packW * 0.8 {
                    tear()
                } else {
                    tearTicks = 0
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { tearProgress = 0 }
                }
            }
    }

    /// A tap sends the front card to the pile. A hold shows the peek until the finger lifts.
    private var stackGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                if !pressing {
                    pressing = true
                    peekTask = Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(350))
                        guard !Task.isCancelled else { return }
                        Haptics.tap(.medium)
                        withAnimation(.easeOut(duration: 0.2)) { peeking = true }
                    }
                }
                if !peeking && hypot(value.translation.width, value.translation.height) > 14 {
                    peekTask?.cancel()
                }
            }
            .onEnded { value in
                peekTask?.cancel()
                pressing = false
                let distance = hypot(value.translation.width, value.translation.height)
                if peeking {
                    withAnimation(.easeIn(duration: 0.18)) { peeking = false }
                } else if model.mode != .normal, !model.paused {
                    // A tap pauses Fast and Sift (docs/18, Picking the mode).
                    autoTask?.cancel()
                    model.paused = true
                    Haptics.tap()
                } else if distance < 14 || value.translation.height < -50 {
                    sendFront()
                }
            }
    }

    // MARK: - Actions

    /// The height of the tear line on the screen.
    private func tearY(_ layout: TableLayout) -> CGFloat {
        layout.packCenter.y - layout.packH / 2 + layout.packH * PackView.tearLine
    }

    private func addFlecks(_ layout: TableLayout, count: Int, across: Bool = false) {
        let left = layout.packCenter.x - layout.packW / 2
        let x = across ? layout.packCenter.x
            : left + layout.packW * (tearFromLeft ? tearProgress : 1 - tearProgress)
        let colors = godLight
            ? [.pink, .yellow, .green, .cyan, .purple, .white]
            : PackArt.colors(model.cardSet.slug) + [.white, Color(white: 0.85)]
        let now = Date()
        flecks.removeAll { now.timeIntervalSince($0.start) > TearFlecks.life }
        flecks.append(FleckBurst(point: CGPoint(x: x, y: tearY(layout)), count: count, colors: colors,
                                 drift: across ? 0 : (tearFromLeft ? 1 : -1)))
    }

    private func tear() {
        guard model.phase == .sealed else { return }
        if model.willCombine {
            tearAll()
            return
        }
        Haptics.tap(.medium)
        model.startOpening()
        // The tear runs to the far edge, then the strip flies off and light comes out of the pack.
        withAnimation(.easeOut(duration: 0.12)) { tearProgress = 1 }
        Task {
            try? await Task.sleep(for: .milliseconds(110))
            Haptics.tap(.heavy)
            if let layout = lastLayout { addFlecks(layout, count: 26, across: true) }
            withAnimation(.easeOut(duration: 0.45)) { torn = true }
            withAnimation(.easeOut(duration: 0.12)) { openFlash = 1 }
            withAnimation(.easeIn(duration: 0.6).delay(0.15)) { openFlash = 0.001 }
            try? await Task.sleep(for: .milliseconds(300))
            withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) { cardsRise = true }
            try? await Task.sleep(for: .milliseconds(500))
            withAnimation(.easeIn(duration: 0.45)) { packGone = true }
            withAnimation(.spring(response: 0.55, dampingFraction: 0.8)) {
                cardsRise = false
                cardsOut = true
            }
            try? await Task.sleep(for: .milliseconds(450))
            model.finishOpening()
            if skipAfterOpen {
                skipAfterOpen = false
                skipPack()
            }
        }
    }

    /// Hits only: one swipe tears every pack in a row, then all the hit slots come out as one stack.
    private func tearAll() {
        Haptics.tap(.medium)
        tearingIndex = 0
        model.startOpening()
        let total = model.combinedSlugs?.count ?? 1
        // A long queue tears faster, so a booster box does not take half a minute.
        let step = max(0.16, min(0.5, 3.0 / Double(total)))
        Task {
            for i in 0..<total {
                if i > 0 {
                    var still = Transaction()
                    still.disablesAnimations = true
                    withTransaction(still) {
                        torn = false
                        tearProgress = 0
                        packGone = false
                    }
                    withAnimation(.spring(response: 0.25, dampingFraction: 0.85)) { tearingIndex = i }
                    try? await Task.sleep(for: .seconds(step * 0.3))
                }
                withAnimation(.easeOut(duration: step * 0.25)) { tearProgress = 1 }
                try? await Task.sleep(for: .seconds(step * 0.25))
                Haptics.tap(i == total - 1 ? .heavy : .medium)
                if let layout = lastLayout { addFlecks(layout, count: i == total - 1 ? 26 : 10, across: true) }
                withAnimation(.easeOut(duration: step * 0.6)) { torn = true }
                withAnimation(.easeOut(duration: 0.1)) { openFlash = 1 }
                withAnimation(.easeIn(duration: step).delay(0.1)) { openFlash = 0.001 }
                try? await Task.sleep(for: .seconds(step * 0.45))
                if i < total - 1 {
                    withAnimation(.easeIn(duration: step * 0.4)) { packGone = true }
                    try? await Task.sleep(for: .seconds(step * 0.3))
                }
                if i == model.godIndex { await playGodPack() }
            }
            withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) { cardsRise = true }
            try? await Task.sleep(for: .milliseconds(500))
            withAnimation(.easeIn(duration: 0.45)) { packGone = true }
            withAnimation(.spring(response: 0.55, dampingFraction: 0.8)) {
                cardsRise = false
                cardsOut = true
            }
            try? await Task.sleep(for: .milliseconds(450))
            tearingIndex = nil
            model.finishOpening()
            if skipAfterOpen {
                skipAfterOpen = false
                skipPack()
            }
        }
    }

    /// Hits only: a god pack plays its own moment before the stack, and waits for it to end.
    private func playGodPack() async {
        guard let special = model.special, special.isGod else { return }
        try? await Task.sleep(for: .milliseconds(250))
        withAnimation(.easeIn(duration: 0.25)) { celebration = special }
        while celebration != nil { try? await Task.sleep(for: .milliseconds(150)) }
        try? await Task.sleep(for: .milliseconds(250))
    }

    private func sendFront() {
        guard model.phase == .open, model.tuckingID == nil, let card = model.stack.first else { return }
        // A face-down medium or big hit flips in place first, so the player sees it at full size.
        if !model.faceUp, card.hitTier >= .medium, model.showcaseID != card.id {
            withAnimation(.spring(response: 0.55, dampingFraction: 0.7)) { model.showcaseFront() }
            return
        }
        Haptics.tap()
        withAnimation(.spring(response: 0.45, dampingFraction: 0.84)) { model.sendFrontToPile() }
    }

    private func celebrate(_ card: RipCard) {
        let next = HitBurst(card: card)
        burst = next
        Haptics.celebrate(card.hitTier)
        if card.hitTier >= .medium, model.stack.first?.id == card.id {
            withAnimation(.spring(response: 0.25, dampingFraction: 0.5)) { popID = card.id }
            Task {
                try? await Task.sleep(for: .milliseconds(260))
                withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) { popID = nil }
            }
        }
        Task {
            try? await Task.sleep(for: .seconds(card.hitTier == .big ? 3.0 : 2.2))
            if burst?.id == next.id {
                withAnimation(.easeOut(duration: 0.4)) { burst = nil }
            }
        }
    }

    /// The set's pack trick: it moves its number of cards one by one, then the stack turns face up.
    private func moveToBack() {
        let moves = model.trickCount
        guard model.beginTrick() else { return }
        Task {
            for _ in 0..<moves {
                Haptics.tap()
                withAnimation(.easeOut(duration: 0.14)) { model.startTuck() }
                try? await Task.sleep(for: .milliseconds(150))
                withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { model.finishTuck() }
                try? await Task.sleep(for: .milliseconds(260))
            }
            if !model.faceUp {
                try? await Task.sleep(for: .milliseconds(380))
                flipStack(force: true)
            }
        }
    }

    /// Skips the rest of the pack at any time. Before the tear, it opens the pack first.
    private func skipPack() {
        switch model.phase {
        case .sealed:
            skipAfterOpen = true
            tear()
        case .open:
            peekTask?.cancel()
            peeking = false
            Haptics.tap(.medium)
            withAnimation(.spring(response: 0.5, dampingFraction: 0.85)) { model.skipRest() }
        default:
            break
        }
    }

    private func returnFromPile() {
        guard !model.pile.isEmpty else { return }
        Haptics.tap()
        withAnimation(.easeInOut(duration: 0.2)) { showSummary = false }
        withAnimation(.spring(response: 0.45, dampingFraction: 0.84)) { model.returnFromPile() }
    }

    #if DEBUG
    /// Screenshot aid: `-demo <cards to pile> [peek]` opens the pack and plays it by itself.
    private func runDemo() {
        if ProcessInfo.processInfo.arguments.contains("-autorip") {
            Task {
                while model.phase != .sealed { try? await Task.sleep(for: .milliseconds(200)) }
                try? await Task.sleep(for: .seconds(1))
                skipPack()
            }
        }
        let args = ProcessInfo.processInfo.arguments
        // Screenshot aid: `-tear <fraction>` holds the pack part of the way torn.
        if let i = args.firstIndex(of: "-tear"), i + 1 < args.count, let f = Double(args[i + 1]) {
            tearProgress = f
        }
        guard let i = args.firstIndex(of: "-demo"), i + 1 < args.count, let taps = Int(args[i + 1]) else { return }
        Task {
            try? await Task.sleep(for: .seconds(1.5))
            tear()
            try? await Task.sleep(for: .seconds(2.5))
            for _ in 0..<taps {
                sendFront()
                try? await Task.sleep(for: .milliseconds(600))
            }
            if args.contains("flip") { flipStack() }
            if args.contains("trick") {
                try? await Task.sleep(for: .milliseconds(700))
                moveToBack()
            }
            if args.contains("skip") {
                try? await Task.sleep(for: .milliseconds(1200))
                skipPack()
            }
            if args.contains("peek") { withAnimation { peeking = true } }
            if args.contains("close") {
                try? await Task.sleep(for: .seconds(1))
                onClose()
            }
        }
    }
    #endif

    private func nextPack() {
        peekTask?.cancel()
        peeking = false
        burst = nil
        celebration = nil
        withAnimation(.easeInOut(duration: 0.25)) { showSummary = false }
        torn = false
        tearFromLeft = true
        tearTicks = 0
        flecks = []
        openFlash = 0
        skipAfterOpen = false
        cardsRise = false
        cardsOut = false
        packGone = false
        tearProgress = 0
        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) { model.nextPack() }
    }
}
