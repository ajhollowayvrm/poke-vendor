import SwiftUI

/// The gray market: the plug sells full hot cases for full prepayment (docs/12-acquiring-product.md, The plug). It shows
/// inside the distributor screen, and it is the only supplier screen for a player with no wholesale yet.
struct PlugSection: View {
    @Environment(GameStore.self) private var store
    @State private var cases: [String: Int] = [:]
    @State private var confirm: WholesaleOffer?
    @State private var message: String?

    var body: some View {
        let plug = store.data.plug
        let name = plug.name ?? "The plug"
        VStack(spacing: 12) {
            DetailBox(title: "Gray market · \(name)") {
                Text("Prepaid. No invoice. Full cases only. The plug can vanish with your money, ship short, ship resealed boxes, or ship stolen stock.")
                    .font(.caption).foregroundStyle(Theme.muted)
                if store.plugOpen {
                    Text("Clean orders: \(plug.cleanOrders). Risk on a \(money(2000)) order: about \(Int((store.plugVanishChance(total: 2000) * 100).rounded()))%.")
                        .font(.caption.monospaced())
                } else {
                    Text("The plug stopped answering. A new plug can message you later.").font(.caption).foregroundStyle(Theme.orange)
                }
                if let message { Banner(text: message, color: Theme.cyan, icon: "info.circle.fill") }
            }
            .overlay(Rectangle().stroke(Theme.orange.opacity(0.5)))
            if store.plugOpen {
                let offers = store.plugOffers
                if offers.isEmpty {
                    EmptyTab(text: "Nothing hot right now.")
                }
                ForEach(offers) { offer in offerRow(offer) }
            }
            if !plug.orders.isEmpty {
                DetailBox(title: "Your plug orders") {
                    ForEach(plug.orders.reversed()) { order in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack {
                                Text("\(order.cases) × \(order.productName)").font(.subheadline).lineLimit(2)
                                Spacer()
                                Text(money(order.total)).font(.subheadline.monospaced())
                            }
                            Text("Risk taken \(Int((order.vanishChance * 100).rounded()))% · \(state(order))")
                                .font(.caption.monospaced())
                                .foregroundStyle(order.state == .vanished || order.state == .seized ? Theme.orange : Theme.muted)
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
        .confirmationDialog("Prepay the plug?", isPresented: Binding(isPresent: $confirm), titleVisibility: .visible, presenting: confirm) { offer in
            let n = min(cases[offer.id] ?? 1, Balance.plugMaxCases)
            Button("Send \(money(offer.casePrice * Double(n))) to \(name)", role: .destructive) {
                message = store.orderFromPlug(offer, cases: n) ?? "Paid. \(name) says it comes in \(Balance.plugDeliveryDays.lowerBound) to \(Balance.plugDeliveryDays.upperBound) days."
            }
        } message: { offer in
            let n = min(cases[offer.id] ?? 1, Balance.plugMaxCases)
            Text("Send \(money(offer.casePrice * Double(n))) to \(name) now? You get nothing back if the plug vanishes.")
        }
    }

    private func offerRow(_ offer: WholesaleOffer) -> some View {
        let n = min(cases[offer.id] ?? 1, Balance.plugMaxCases)
        let total = offer.casePrice * Double(n)
        return HStack(alignment: .top, spacing: 12) {
            ProductImage(url: offer.product.image, setName: offer.product.name).frame(width: 50, height: 64)
            VStack(alignment: .leading, spacing: 4) {
                Text(offer.product.name).font(.subheadline.weight(.medium)).lineLimit(2)
                Text("Case of \(offer.caseSize) · \(money(offer.unitPrice)) each · case mkt \(money(offer.caseMarket))")
                    .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                Stepper("\(n) case\(n == 1 ? "" : "s") · \(money(total))", value: Binding(get: { n }, set: { cases[offer.id] = $0 }), in: 1...Balance.plugMaxCases)
                    .font(.caption)
                Text("Vanish risk on this order: \(Int((store.plugVanishChance(total: total) * 100).rounded()))%")
                    .font(.caption2.monospaced()).foregroundStyle(Theme.orange)
                Button("Prepay") { confirm = offer }
                    .primaryButton()
                    .tint(Theme.orange)
                    .controlSize(.small)
                    .disabled(!store.canAffordBuy(total) || total > Balance.plugMaxOrder)
            }
        }
        .padding(12)
        .background(Theme.surface)
        .framed()
    }

    private func state(_ o: PlugOrder) -> String {
        switch o.state {
        case .waiting: "Due day \(o.arrivesDay + 1)"
        case .delivered: "Delivered: \(o.shippedUnits ?? 0) of \(o.cases * o.caseUnits) units"
        case .vanished: "Vanished: \(money(o.total)) lost"
        case .seized: "Seized by police"
        }
    }
}
