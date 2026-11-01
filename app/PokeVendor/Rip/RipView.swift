import SwiftUI

struct RipView: View {
    @State var model: RipModel
    let onClose: () -> Void

    /// `onHits` gets every hit of the rip when the screen closes. A live stream uses it.
    init(items: [SealedItem], store: GameStore, allowedModes: [RipMode] = RipMode.allCases, hitsOnly: Bool = false,
         onHits: (([RipCard]) -> Void)? = nil, onClose: @escaping () -> Void) {
        let model = RipModel(items: items, store: store, hitsOnly: hitsOnly)
        model.allowedModes = allowedModes
        _model = State(initialValue: model)
        self.onClose = {
            onHits?(model.allHits)
            onClose()
        }
    }

    @State var tearProgress: Double = 0
    @State var torn = false
    @State var tearFromLeft = true
    @State var tearTicks = 0
    @State var flecks: [FleckBurst] = []
    /// The light out of the top of the pack, the moment it opens.
    @State var openFlash = 0.0
    @State var lastLayout: TableLayout?
    /// The demigod or god pack moment, while it shows.
    @State var celebration: SpecialPack?
    @State var cardsRise = false
    @State var cardsOut = false
    @State var packGone = false
    /// Hits only: the pack in the row of tears that shows now.
    @State var tearingIndex: Int?
    @State var peeking = false
    @State var showSummary = false
    @State var pressing = false
    @State var peekTask: Task<Void, Never>?
    @State var burst: HitBurst?
    @State var popID: UUID?
    /// The turn of the whole stack during a flip, in degrees.
    @State var stackTurn: Double = 0
    @State var flipping = false
    @State var skipAfterOpen = false
    /// The resealed product banner, while it shows.
    @State private var resealedShown = false
    /// The runner for Fast and Sift.
    @State var autoTask: Task<Void, Never>?
    @State private var stopRuleShown = false
    /// The info panel, the pile label, and the glow wait until a card has turned face up.
    @State var infoCard: RipCard?
    @State var pileTop: RipCard?
    @State var settledTopID: UUID?

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
                    ForEach(visibleCards) { card in
                        let p = placement(for: card, layout: layout)
                        // Only the cards on top shine. The foil animation is costly, and the cards under them do not show.
                        CardView(card: card, faceUp: p.faceUp,
                                 shine: card.id == model.stack.first?.id || card.id == model.pile.last?.id || model.allCards.count <= 24)
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
                    PeekView(cards: Array(model.stack.prefix(30)), size: geo.size)
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
            // Hits only has no modes, no Flip, and no pack trick (docs/18, Hits only).
            if model.hitsOnly {
                Color.clear.frame(height: 1).overlay(alignment: .top) { noteView.offset(y: 8) }
            } else {
                rippingControls
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    /// The mode control, Flip, and the pack trick.
    private var rippingControls: some View {
        VStack(spacing: 10) {
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
            Button { stopRuleShown = true } label: { Image(systemName: "line.3.horizontal.decrease.circle") }
                .buttonStyle(.bordered)
                .tint(Theme.cyan)
                .accessibilityLabel("Stop rule")
        }
        .overlay(alignment: .top) { noteView }
    }

    /// A short note above the controls, for example why Sift is off.
    @ViewBuilder private var noteView: some View {
        if let note = model.note {
            Text(note).font(.caption).foregroundStyle(Theme.orange).offset(y: -22)
                .task(id: note) {
                    try? await Task.sleep(for: .seconds(2.5))
                    model.note = nil
                }
        }
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
                    if model.mode == .sift {
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

    /// Skips the rest of the pack at any time. Before the tear, it opens the pack first.
    func skipPack() {
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
