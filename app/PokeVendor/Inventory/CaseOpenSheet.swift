import SwiftUI

/// What the sheet opens: a closed case in hand, or units that the caller opened already (Open all cases).
enum CaseOpenSource {
    case closed(UUID)
    case opened(units: [UUID], title: String)
    /// A Rip & Ship case that the stream opened already. Every unit ships to the buyer, so the sheet has one action.
    case forBuyer(units: [UUID], buyer: String)
}

/// A request to show the case sheet.
struct CaseRequest: Identifiable {
    let id = UUID()
    let source: CaseOpenSource
}

/// The case opening flow (docs/12-acquiring-product.md, Cases). It uses no flash: a rising grid and rings near the tiles.
/// The "for a buyer" mode serves a Rip & Ship case: one button rips every unit for the buyer.
struct CaseOpenSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let source: CaseOpenSource
    let onDone: ([UUID]) -> Void

    private enum Step { case carton, units, summary }

    @State private var step = Step.carton
    @State private var cutProgress = 0.0
    @State private var flapsOpen = false
    @State private var revealed = 0
    @State private var unitIDs: [UUID] = []
    /// The look of the case, read before it opens.
    @State private var productID: String?
    @State private var units = 0
    @State private var fresh = false
    @State private var resealHint = false
    @State private var knownFake = false
    @State private var marked = false
    @State private var lastTick = 0
    /// The cut runs once, even when the drag keeps going.
    @State private var cutDone = false

    private var product: Product? { SetLibrary.product(productID) }

    private var title: String {
        switch source {
        case .closed: product.map { CaseMath.name($0, units: units) } ?? "Case"
        case .opened(_, let title): title
        case .forBuyer(_, let buyer): "\(buyer)'s case"
        }
    }

    var body: some View {
        VStack(spacing: 14) {
            Text(title).font(.headline).multilineTextAlignment(.center)
            switch step {
            case .carton: carton
            case .units, .summary: grid
            }
            if step == .summary { summary }
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Theme.background.ignoresSafeArea())
        .overlay(alignment: .top) {
            if resealHint && !marked {
                resealBanner.transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .presentationDetents([.large])
        .interactiveDismissDisabled(step == .units)
        .onAppear(perform: load)
    }

    // MARK: - Steps

    private func load() {
        switch source {
        case .closed(let id):
            guard let item = store.data.sealed.first(where: { $0.id == id }), let n = item.caseUnits else { return }
            productID = item.productID
            units = n
            fresh = item.isCaseFresh
            knownFake = item.isKnownFake
            // The eyeball check reads the case once, before the tape is cut.
            if let tier = item.fake, !item.isKnownFake, Counterfeit.eyeballCatches(tier, id: id) { resealHint = true }
        case .opened(let ids, _), .forBuyer(let ids, _):
            unitIDs = ids
            productID = store.data.sealed.first { $0.id == ids.first }?.productID
            units = ids.count
            fresh = store.data.sealed.first { $0.id == ids.first }?.isCaseFresh ?? false
            step = .units
            rise()
        }
    }

    private func cut() {
        guard case .closed(let id) = source, step == .carton, !cutDone else { return }
        cutDone = true
        cutProgress = 1
        let ids = store.openCase(id)
        guard !ids.isEmpty else {
            dismiss()
            return
        }
        unitIDs = ids
        if reduceMotion {
            revealed = ids.count
            step = .summary
            return
        }
        withAnimation(.easeOut(duration: 0.45)) { flapsOpen = true }
        Task {
            try? await Task.sleep(for: .milliseconds(450))
            step = .units
            rise()
        }
    }

    /// The units rise out one at a time. A large case goes faster.
    private func rise() {
        if reduceMotion {
            revealed = unitIDs.count
            step = .summary
            return
        }
        let gap = unitIDs.count >= 25 ? 30 : 80
        Task {
            for _ in unitIDs {
                try? await Task.sleep(for: .milliseconds(gap))
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { revealed += 1 }
            }
            try? await Task.sleep(for: .milliseconds(400))
            withAnimation { step = .summary }
        }
    }

    // MARK: - Carton

    private var carton: some View {
        VStack(spacing: 14) {
            ZStack(alignment: .top) {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(red: 0.55, green: 0.42, blue: 0.28))
                    .frame(height: 190)
                    .overlay(alignment: .bottomLeading) { label.padding(14) }
                // The two top flaps swing open on their hinges.
                HStack(spacing: 2) {
                    flap(anchor: .leading, angle: -70)
                    flap(anchor: .trailing, angle: 70)
                }
                .frame(height: 40)
                tape
            }
            .frame(height: 190)
            Text("Drag along the tape to cut it.").font(.subheadline).foregroundStyle(Theme.muted)
            Button("Cut") { cut() }
                .buttonStyle(.bordered)
                .tint(Theme.cyan)
        }
    }

    private func flap(anchor: UnitPoint, angle: Double) -> some View {
        RoundedRectangle(cornerRadius: 4)
            .fill(Color(red: 0.50, green: 0.38, blue: 0.25))
            .rotation3DEffect(.degrees(flapsOpen ? angle : 0), axis: (x: 0, y: 1, z: 0), anchor: anchor, perspective: 0.6)
            .shadow(color: .black.opacity(flapsOpen ? 0.5 : 0), radius: 6)
    }

    private var label: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(product?.name ?? "").font(.caption.weight(.bold)).lineLimit(2)
            Text("QTY \(units)").font(.caption2.monospaced())
            Text("PKU-\(PriceCycle.hash(productID ?? "") % 100_000)").font(.caption2.monospaced())
            if resealHint || knownFake { Tag(text: "RESEALED", color: Theme.orange) }
        }
        .foregroundStyle(.black)
        .padding(8)
        .frame(maxWidth: 190, alignment: .leading)
        .background(Color(white: 0.78), in: RoundedRectangle(cornerRadius: 4))
    }

    private var tape: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Rectangle().fill(Color(red: 0.80, green: 0.70, blue: 0.50)).frame(height: 12)
                Rectangle().fill(Theme.cyan).frame(width: geo.size.width * cutProgress, height: 2)
                Image(systemName: "scissors")
                    .foregroundStyle(Theme.cyan)
                    .offset(x: max(0, geo.size.width * cutProgress - 10))
            }
            .frame(height: 40)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { value in
                guard step == .carton else { return }
                cutProgress = min(1, max(cutProgress, value.location.x / max(geo.size.width, 1)))
                let tenth = Int(cutProgress * 10)
                if tenth > lastTick {
                    lastTick = tenth
                    Haptics.tick()
                }
                if cutProgress >= 0.9 { cut() }
            })
        }
        .frame(height: 40)
        .padding(.top, 70)
    }

    // MARK: - Units and summary

    private var grid: some View {
        ScrollView {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) {
                ForEach(Array(unitIDs.prefix(revealed)), id: \.self) { id in
                    // Each tile reads its own unit, so a mixed Open all cases grid shows the right image and tags.
                    let item = store.data.sealed.first { $0.id == id }
                    UnitTile(product: SetLibrary.product(item?.productID), fresh: item?.isCaseFresh ?? false,
                             resealed: item?.isKnownFake ?? false)
                }
            }
        }
    }

    private var summary: some View {
        return VStack(spacing: 10) {
            Text(summaryText).font(.subheadline).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
            if case .forBuyer(let ids, let buyer) = source {
                Button("Rip all \(ids.count) for \(buyer)") { finish() }
                    .primaryButton()
                    .controlSize(.large)
            } else {
                HStack {
                    Button("Done") { finish() }
                        .primaryButton()
                    if let first = unitIDs.first {
                        Button("Rip one now") {
                            finish()
                            let item = store.data.sealed.filter { $0.id == first }
                            Task {
                                try? await Task.sleep(for: .milliseconds(400))
                                nav.startRip(item)
                            }
                        }
                        .buttonStyle(.bordered)
                        if store.cardStore != nil {
                            Button("Put on the shelf") {
                                store.stockStore(Set(unitIDs))
                                finish()
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                }
                .controlSize(.regular)
            }
        }
    }

    private var summaryText: String {
        switch source {
        case .closed: "\(units) × \(product?.name ?? "units") · \(money(product?.market ?? 0)) each · now in Sealed."
        case .opened: "\(unitIDs.count) units · now in Sealed."
        case .forBuyer(_, let buyer): "\(unitIDs.count) units. Every card ships to \(buyer)."
        }
    }

    private func finish() {
        onDone(unitIDs)
        dismiss()
    }

    private var resealBanner: some View {
        VStack(spacing: 8) {
            Banner(text: "The factory tape was cut before. These boxes may be resealed.", color: Theme.orange,
                   icon: "exclamationmark.triangle.fill")
            if step != .carton {
                Button("Mark them as resealed") {
                    for id in unitIDs { store.markFakeKnown(sealedID: id) }
                    withAnimation { marked = true }
                }
                .buttonStyle(.bordered)
                .tint(Theme.orange)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }
}

/// One unit that lands in the grid, with a thin ring that grows and fades. No flash.
private struct UnitTile: View {
    let product: Product?
    let fresh: Bool
    var resealed = false
    @State private var ring = false

    var body: some View {
        VStack(spacing: 4) {
            ProductImage(url: product?.image, setName: product.map { SetLibrary.set($0.homeSlug).name } ?? "")
                .frame(height: 90)
                .overlay {
                    Circle()
                        .stroke(Theme.cyan.opacity(0.6), lineWidth: 2)
                        .scaleEffect(ring ? 1.3 : 0.8)
                        .opacity(ring ? 0 : 1)
                }
            if fresh { Tag(text: "CASE FRESH") }
            if resealed { Tag(text: "RESEALED", color: Theme.orange) }
        }
        .onAppear { withAnimation(.easeOut(duration: 0.6)) { ring = true } }
    }
}

/// The result of the tape and label check on a case. The result depends only on the case, so a second look reads the same.
struct CaseCheckResult: View {
    let fake: FakeTier?
    let key: String

    var body: some View {
        if let tell = Counterfeit.caseCheckLine(fake, key: key) {
            Text(tell).font(.caption).foregroundStyle(Theme.orange)
        } else {
            Text("The tape and label look right. A check is never proof.").font(.caption).foregroundStyle(Theme.muted)
        }
    }
}
