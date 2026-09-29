import SwiftUI

/// The sale receipt: what sold, what the player got, what they paid, and the profit (docs/15-selling.md).
struct SaleReceiptView: View {
    let receipts: [SaleReceipt]
    let onDone: () -> Void

    private var net: Double { receipts.reduce(0) { $0 + $1.net } }
    private var profit: Double { receipts.reduce(0) { $0 + $1.profit } }

    var body: some View {
        ZStack {
            Color.black.opacity(0.65).ignoresSafeArea()
                .onTapGesture(perform: onDone)
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Image(systemName: "checkmark.seal.fill").font(.title2).foregroundStyle(Theme.green)
                    Text(receipts.count == 1 ? "Sold" : "Sold \(receipts.count) items").font(.title2.bold())
                    Spacer()
                }
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(receipts) { row($0) }
                    }
                }
                .frame(maxHeight: 320)
                .fixedSize(horizontal: false, vertical: true)
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("YOU GOT").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        Spacer()
                        Text(money(net)).font(.subheadline.monospaced())
                    }
                    HStack(alignment: .firstTextBaseline) {
                        Text("PROFIT").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        Spacer()
                        Text(signedMoney(profit))
                            .font(.largeTitle.monospaced().weight(.semibold))
                            .foregroundStyle(profit >= 0 ? Theme.green : Theme.orange)
                    }
                }
                Button(action: onDone) {
                    Text("Done").font(.headline).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.cyan)
                .foregroundStyle(.black)
                .controlSize(.large)
            }
            .padding(20)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.line))
            .padding(.horizontal, 16)
        }
    }

    private func row(_ r: SaleReceipt) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline) {
                Text(r.name).font(.subheadline.weight(.semibold)).lineLimit(2)
                Spacer()
                Text(signedMoney(r.profit))
                    .font(.subheadline.monospaced())
                    .foregroundStyle(r.profit >= 0 ? Theme.green : Theme.orange)
            }
            Text(r.venue).font(.caption).foregroundStyle(Theme.muted)
            Text(detail(r)).font(.caption2.monospaced()).foregroundStyle(Theme.muted)
        }
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.line).frame(height: 1) }
    }

    private func detail(_ r: SaleReceipt) -> String {
        let sold = r.net == r.price ? "Sold \(money(r.price))" : "Sold \(money(r.price)) · got \(money(r.net))"
        return sold + " · " + (r.paid.map { "paid \(money($0))" } ?? "pulled from a pack")
    }
}

private struct SaleReceiptsModifier: ViewModifier {
    @Environment(GameStore.self) private var store
    let active: Bool

    func body(content: Content) -> some View {
        content.overlay {
            if active, !store.receipts.isEmpty {
                SaleReceiptView(receipts: store.receipts) {
                    withAnimation(.easeOut(duration: 0.2)) { store.clearReceipts() }
                }
                .transition(.opacity.combined(with: .scale(scale: 0.96)))
                .onAppear { UINotificationFeedbackGenerator().notificationOccurred(.success) }
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: store.receipts.isEmpty)
    }
}

extension View {
    /// Shows the sale receipt after a sale. `active` is false while something else covers this view, for example the
    /// End Day report.
    func saleReceipts(active: Bool = true) -> some View {
        modifier(SaleReceiptsModifier(active: active))
    }
}
