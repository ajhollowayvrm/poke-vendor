import SwiftUI

/// Ask to see a trader's binder or a seller's stash, and make an offer on stash items (docs/20-card-shows.md, Stashes).
/// A trader's binder cards go into the trade with the trade slider. A seller's stash items sell for cash, apart from
/// the main deal.
struct StashPanel: View {
    @Environment(GameStore.self) private var store
    let session: ShowSession
    let visitor: Visitor
    @State private var picked: Set<UUID> = []
    @State private var percent: Double = 80

    var body: some View {
        if session.canAskStash(visitor) {
            Button {
                withAnimation { session.askToSeeStash() }
            } label: {
                Label(visitor.intent == .trade ? "Ask to see their binder" : "Ask what else they have",
                      systemImage: "rectangle.stack.badge.person.crop")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .tint(Theme.cyan)
        } else if visitor.intent == .sell, !visitor.stash.isEmpty {
            stash
        }
    }

    private var stash: some View {
        let chosen = picked.intersection(Set(visitor.stash.map(\.id)))
        let ask = session.stashAsk(visitor, chosen)
        let market = session.stashMarket(visitor, chosen)
        let price = ShowSession.round(market * percent / 100)
        let counter = visitor.stashCounterFor == chosen ? visitor.stashCounter : nil
        return VStack(alignment: .leading, spacing: 6) {
            Text("THEIR STASH · TAP TO PICK").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.muted)
            ForEach(visitor.stash) { one in
                let on = chosen.contains(one.id)
                Button {
                    if on { picked.remove(one.id) } else { picked.insert(one.id) }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: on ? "checkmark.circle.fill" : "circle").foregroundStyle(on ? Theme.cyan : Theme.muted)
                        VStack(alignment: .leading, spacing: 1) {
                            HStack(spacing: 4) {
                                Text(one.item.name).font(.caption).lineLimit(1)
                                if one.pc { Tag(text: "PC", color: Theme.green) }
                                if one.item.looksOff { Tag(text: "LOOKS OFF", color: Theme.orange) }
                            }
                            Text("market \(money(one.market))").font(.caption2.monospaced()).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Text(money(one.item.price)).font(.caption.monospaced())
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            if !chosen.isEmpty {
                HStack(alignment: .firstTextBaseline) {
                    Text("\(Int(percent))% of market").font(.subheadline.monospaced())
                    Spacer()
                    Text(money(price)).font(.headline.monospaced()).contentTransition(.numericText())
                }
                Slider(value: $percent, in: 30...130, step: 5)
                    .padding(.vertical, -4)
                    .tint(Theme.cyan)
                    .onChange(of: percent) { _, _ in Haptics.tick(0.35) }
                HStack(spacing: 8) {
                    Button { withAnimation { session.offerOnStash(chosen, price: price) } } label: {
                        Text("Offer \(money(price))").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.line)
                    Button { withAnimation { session.offerOnStash(chosen, price: counter ?? ask) } } label: {
                        Text("Pay \(money(counter ?? ask))").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
                Text("Their price \(money(ask)) for \(chosen.count) item\(chosen.count == 1 ? "" : "s")."
                     + (counter != nil ? " They countered at \(money(counter ?? 0))." : ""))
                    .font(.caption2)
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(10)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 10))
        .onChange(of: visitor.stash.count) { _, _ in picked = picked.intersection(Set(visitor.stash.map(\.id))) }
    }
}
