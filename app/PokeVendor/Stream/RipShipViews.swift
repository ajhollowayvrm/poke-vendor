import SwiftUI

/// The panel above chat while a Rip & Ship order waits for its rip. The outline pulses softly. It never flashes.
struct RipShipWaitingPanel: View {
    let order: RipShipOrder
    let onRip: () -> Void
    @State private var pulse = false

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                ProductImage(url: SetLibrary.product(order.productID)?.image, setName: order.itemName)
                    .frame(width: 64, height: 64)
                VStack(alignment: .leading, spacing: 3) {
                    Text("SOLD to \(order.buyer) · \(money(order.price))").font(.headline).lineLimit(1).minimumScaleFactor(0.8)
                    Text(order.itemName).font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                    Text("Rip it now. Every card ships to \(order.buyer).").font(.caption)
                }
                Spacer(minLength: 0)
            }
            Button(action: onRip) { Text("Rip for \(order.buyer)").frame(maxWidth: .infinity) }
                .primaryButton()
                .controlSize(.large)
        }
        .padding(12)
        .background(Theme.surface)
        .overlay(Rectangle().stroke(Theme.cyan.opacity(pulse ? 0.8 : 0.4), lineWidth: 2))
        .onAppear {
            withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) { pulse = true }
        }
    }
}

/// The fee box of the pick sheet: what Whatnot takes, and what the player gets.
struct RipShipFeeBox: View {
    @Environment(GameStore.self) private var store
    let item: StreamItem
    let price: Double

    var body: some View {
        let shipping = Balance.ripShipShipping(packs: item.packs)
        let fees = store.ripShipFees(price: price, shipping: shipping)
        let net = price - fees.total
        let paid = store.data.sealed.first { $0.id == item.id }?.paid ?? 0
        let rate = Int((store.ripShipCommissionRate * 1000).rounded()) 
        VStack(alignment: .leading, spacing: 3) {
            Text("Price \(money(price)) · commission \(money(fees.commission)) (\(Double(rate) / 10)%) · processing \(money(fees.processing)) · \(money(fees.flat)) · supplies \(money(fees.supplies))")
            Text("You get \(money(net)) · paid \(money(paid)) · profit \(signedMoney(net - paid))")
                .foregroundStyle(net - paid >= 0 ? Theme.green : Theme.orange)
        }
        .font(.caption.monospaced())
        .foregroundStyle(Theme.muted)
    }
}

/// The stream summary: each Rip & Ship order, its top card, and the ship date.
struct RipShipSummaryBox: View {
    @Environment(GameStore.self) private var store
    let session: StreamSession
    let onQueue: () -> Void

    var body: some View {
        DetailBox(title: "Rip & Ship · \(session.ripShipOrders.count)") {
            ForEach(session.ripShipOrders) { snap in
                let order = store.data.ripShip.orders.first { $0.id == snap.id } ?? snap
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text("\(order.buyer) · \(order.itemName)").font(.subheadline).lineLimit(1)
                        Spacer()
                        Text(money(order.price)).font(.subheadline.monospaced())
                    }
                    Text("You get \(money(order.net)) after Whatnot fees.").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                    if let top = session.ripShipHits[order.id]?.max(by: { $0.market < $1.market }) {
                        Text("Top card: \(top.name) \(money(top.market)) · ships to \(order.buyer)").font(.caption).lineLimit(2)
                    }
                    status(order)
                }
            }
            if !store.ordersToShip.isEmpty {
                Button("Go to the ship queue", action: onQueue).buttonStyle(.bordered)
            }
        }
    }

    @ViewBuilder private func status(_ order: RipShipOrder) -> some View {
        if order.refunded {
            Text("Refunded.").font(.caption.monospaced()).foregroundStyle(Theme.orange)
        } else if order.shipped {
            Text("Shipped.").font(.caption.monospaced()).foregroundStyle(Theme.green)
        } else if order.state == .ripped {
            Text("Ship by day \(store.shipByDay(order) + 1)").font(.caption.monospaced()).foregroundStyle(Theme.cyan)
        } else {
            Text("Not ripped yet.").font(.caption.monospaced()).foregroundStyle(Theme.muted)
        }
    }
}
