import SwiftUI

/// One day at a card show: set up the table, deal with buyers, walk the floor, then the summary
/// (docs/20-card-shows.md).
struct ShowDayView: View {
    @Environment(GameStore.self) private var store
    @State private var session: ShowSession
    @State private var rip: RipSession?
    let onClose: () -> Void

    init(show: CardShow, store: GameStore, onClose: @escaping () -> Void) {
        _session = State(initialValue: ShowSession(show: show, store: store))
        self.onClose = onClose
    }

    /// Any venue: a meet, league night, a sale, or an opportunity.
    init(session: ShowSession, onClose: @escaping () -> Void) {
        _session = State(initialValue: session)
        self.onClose = onClose
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Group {
                switch session.phase {
                case .setup: SetupStage(session: session)
                case .table: TableStage(session: session)
                case .floor: FloorStage(session: session)
                case .summary: SummaryStage(session: session, onDone: finish)
                }
            }
            .frame(maxHeight: .infinity)
        }
        .background(Theme.background.ignoresSafeArea())
        .overlay(alignment: .bottom) {
            if let note = session.note {
                Text(note)
                    .font(.subheadline)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(.black.opacity(0.8), in: Capsule())
                    .padding(.bottom, 110)
                    .transition(.opacity)
                    .task(id: note) {
                        try? await Task.sleep(for: .seconds(2))
                        withAnimation { session.note = nil }
                    }
            }
        }
        .animation(.easeInOut(duration: 0.25), value: session.phase)
        .overlay {
            if let flip = session.coinFlip {
                CoinFlipView(flip: flip) { withAnimation { session.coinFlip = nil } }
                    .id(flip.id)
                    .transition(.opacity)
            }
        }
        .sheet(item: Bindable(session).reveal) { MysteryRevealView(reveal: $0) }
        .fullScreenCover(item: $rip) { rip in
            RipView(items: rip.items, store: store) { self.rip = nil }
        }
        .overlay(alignment: .bottom) {
            if let item = session.justBought {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Bought").font(.caption).foregroundStyle(Theme.muted)
                        Text(item.name).font(.subheadline.weight(.semibold)).lineLimit(1)
                    }
                    Spacer()
                    Button("Later") { withAnimation { session.justBought = nil } }
                        .buttonStyle(.bordered)
                    Button("Rip it now") {
                        if let ready = session.ripJustBought() { rip = RipSession(items: [ready]) }
                    }
                    .primaryButton()
                    .tint(Theme.cyan)
                }
                .controlSize(.small)
                .padding(12)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.cyan.opacity(0.5)))
                .padding(.horizontal, 16)
                .padding(.bottom, 96)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: session.justBought?.id)
        .onAppear {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("open"), session.phase == .setup { session.openTable() }
            let args = ProcessInfo.processInfo.arguments
            if args.contains("floor") { session.walkFloor() }
            for kind in ["seller", "trader", "naive"] where args.contains(kind) { session.debugVisitor(kind) }
            if args.contains("buysealed"), let v = session.vendors.first(where: { $0.kind == .gameShop }),
               let item = v.items.first(where: { if case .sealed(let p) = $0.goods { return p.market < 80 }; return false }) {
                session.walkFloor()
                session.visit(v)
                session.buy(item, from: v)
            }
            if args.contains("approach") {
                session.walkFloor()
                session.debugVisitor("approach")
            }
            // Screenshot aids: `vintage` opens a vintage dealer, and `mystery` buys a vintage mystery pack.
            // Screenshot aid: `modern` opens a modern dealer.
            if args.contains("modern"), let v = session.vendors.first(where: { $0.kind == .modernDealer }) {
                session.walkFloor()
                session.visit(v)
            }
            if args.contains("vintage"), let v = session.vendors.first(where: { $0.kind == .vintageDealer }) {
                session.walkFloor()
                session.visit(v)
            }
            if args.contains("mystery"), let v = session.vendors.first(where: { $0.kind == .mysteryPacks }),
               let item = v.items.first(where: { if case .mystery(let p) = $0.goods { return p.tier == .vintage }; return false }) {
                session.walkFloor()
                session.visit(v)
                session.buy(item, from: v)
            }
            #endif
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(session.venue.name).font(.headline)
                    Text(session.venue.detail)
                        .font(.caption.monospaced())
                        .foregroundStyle(Theme.muted)
                }
                Spacer()
                Text(session.clock)
                    .font(.system(size: 20, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Theme.cyan)
            }
            ProgressView(value: min(1, session.minute / session.closeMinute))
                .tint(Theme.cyan)
            HStack(spacing: 0) {
                StatCell(label: "Sold", value: money(session.soldTotal), color: Theme.green)
                StatCell(label: "Bought", value: money(session.boughtTotal))
                StatCell(label: "Cash", value: money(store.cash))
            }
        }
        .padding(16)
        .background(Theme.surface)
    }

    private func finish() {
        store.finishEncounter(session)
        onClose()
    }
}
