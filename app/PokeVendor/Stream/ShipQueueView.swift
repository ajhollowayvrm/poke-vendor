import SwiftUI

/// The Rip & Ship ship queue: every ripped order that waits for its label (docs/06-social-media.md, Rip & Ship).
struct ShipQueueView: View {
    @Environment(GameStore.self) private var store
    @State private var message: String?

    var body: some View {
        let orders = store.ordersToShip.sorted { store.shipByDay($0) < store.shipByDay($1) }
        ScrollView {
            VStack(spacing: 12) {
                rules
                if let message { Banner(text: message, color: Theme.orange) }
                if orders.isEmpty {
                    Text("Nothing to ship.").font(.subheadline).foregroundStyle(Theme.muted).padding(.top, 20)
                }
                ForEach(orders) { order in card(order) }
                if orders.count > 1 { shipAll(orders) }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Ship queue")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var rules: some View {
        DetailBox(title: "Rip & Ship") {
            Text("Ship within \(Balance.ripShipDeadlineDays) days. From day \(Balance.ripShipDeadlineDays + 1) the buyer can call you out. On day \(Balance.ripShipCancelDays) Whatnot takes the money back and gives you a strike. 2 strikes in \(Balance.whatnotStrikeBanWindow) days bring a \(Balance.whatnotStrikeBanDays / 7)-week ban. 3 strikes in \(Balance.whatnotStrikeCloseWindow) days end Rip & Ship.")
                .font(.caption).foregroundStyle(Theme.muted)
            Text("Strikes in the last \(Balance.whatnotStrikeCloseWindow) days: \(store.recentStrikes)")
                .font(.caption.monospaced())
                .foregroundStyle(store.recentStrikes > 0 ? Theme.orange : Theme.muted)
            if store.data.ripShip.ripShipClosed {
                Text("Whatnot ended your Rip & Ship access.").font(.caption).foregroundStyle(Theme.orange)
            } else if store.whatnotBanned {
                Text("Whatnot banned you until day \((store.data.ripShip.bannedUntil ?? 0) + 1).").font(.caption).foregroundStyle(Theme.orange)
            }
            Text("\(formatHours(store.hoursLeft)) left today. Each order takes \(Int(Balance.ripShipShipMinutes)) minutes.")
                .font(.caption.monospaced()).foregroundStyle(Theme.muted)
        }
    }

    private func card(_ order: RipShipOrder) -> some View {
        let by = store.shipByDay(order)
        let color = store.day > by ? Color.red : store.day == by ? Theme.orange : Theme.green
        let top = order.cards.sorted { $0.market > $1.market }.prefix(3)
        let bulk = order.bulk.reduce(0) { $0 + $1.cards.count }
        return DetailBox(title: "\(order.buyer) · sold day \(order.soldDay + 1)") {
            HStack {
                Text(order.itemName).font(.subheadline).lineLimit(2)
                Spacer()
                Text(money(order.price)).font(.subheadline.monospaced())
            }
            ForEach(Array(top)) { c in
                HStack {
                    Text(c.print.name).font(.caption).lineLimit(1)
                    Spacer()
                    Text(money(c.market)).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
            }
            if bulk > 0 { Text("and \(bulk) bulk cards").font(.caption).foregroundStyle(Theme.muted) }
            if !order.loose.isEmpty {
                Text("\(order.loose.count) sealed pack\(order.loose.count == 1 ? "" : "s") ship too").font(.caption).foregroundStyle(Theme.muted)
            }
            HStack {
                Text(store.day > by ? "Late · was due day \(by + 1)" : "Ship by day \(by + 1)")
                    .font(.caption.monospaced().weight(.semibold))
                    .foregroundStyle(color)
                Spacer()
                Button("Ship") { message = store.shipRipShipOrders([order.id]) }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            }
        }
    }

    private func shipAll(_ orders: [RipShipOrder]) -> some View {
        Button {
            message = store.shipRipShipOrders(orders.map(\.id))
        } label: {
            Text("Ship all · \(orders.count * Int(Balance.ripShipShipMinutes)) min").frame(maxWidth: .infinity)
        }
        .primaryButton()
        .controlSize(.large)
    }
}
