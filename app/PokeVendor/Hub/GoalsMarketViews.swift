import SwiftUI

private func marketPercent(_ change: Double) -> String {
    let value = Int((abs(change) * 100).rounded())
    return value == 0 ? "flat" : "\(change > 0 ? "+" : "−")\(value)%"
}

/// The moving market: the whole market, the news, and what moved in the player's stock (docs/05-pricing-and-market.md).
struct MarketView: View {
    @Environment(GameStore.self) private var store

    private struct Mover: Identifiable {
        let id: UUID
        let name: String
        let value: Double
        let change: Double
    }

    private var movers: [Mover] {
        (store.data.raw + store.data.slabs)
            .filter { $0.market >= 5 }
            .map { Mover(id: $0.id, name: $0.print.name, value: $0.market, change: $0.print.trend()) }
            .sorted { abs($0.change) * $0.value > abs($1.change) * $1.value }
            .prefix(8).map { $0 }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                DetailBox(title: "The card market") {
                    HStack(spacing: 0) {
                        StatCell(label: "Against real prices", value: marketPercent(PriceCycle.index() - 1))
                        StatCell(label: "Last 4 weeks", value: marketPercent(store.marketChange),
                                 color: store.marketChange >= 0 ? Theme.green : Theme.orange)
                    }
                    Text("Prices move in slow waves. Sealed product gains value with age. A card under $1 stays flat.")
                        .font(.caption).foregroundStyle(Theme.muted)
                }
                DetailBox(title: "News") {
                    if store.activeMarketEvents.isEmpty {
                        Text("No market news now.").font(.subheadline).foregroundStyle(Theme.muted)
                    }
                    ForEach(store.activeMarketEvents) { event in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(event.title).font(.subheadline)
                            Text("\(marketPercent(event.factor(day: store.day) - 1)) now · \(event.startDay + event.days - store.day) days left")
                                .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        }
                    }
                }
                DetailBox(title: "Print news") {
                    let upcoming = store.upcomingPrintChanges
                    let recent = store.recentPrintChanges
                    if upcoming.isEmpty && recent.isEmpty {
                        Text("No print news now.").font(.subheadline).foregroundStyle(Theme.muted)
                    }
                    ForEach(upcoming) { c in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(store.printTitle(c)).font(.subheadline)
                            Text("In \(c.day - store.day) day\(c.day - store.day == 1 ? "" : "s") · sealed \(marketPercent(c.jump)) over a month after")
                                .font(.caption.monospaced()).foregroundStyle(c.inPrint ? Theme.orange : Theme.green)
                        }
                    }
                    ForEach(recent) { c in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(store.printTitle(c)).font(.subheadline)
                            Text("\(store.day - c.day == 0 ? "Today" : "\(store.day - c.day) days ago")\(c.inPrint ? " · on store shelves now" : "")")
                                .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        }
                    }
                    Text("\(store.setsInPrint.count) sets in print. Stores sell only product that is in print. Out of print, sealed gains value faster.")
                        .font(.caption).foregroundStyle(Theme.muted)
                }
                DetailBox(title: "Your biggest movers, last 4 weeks") {
                    if movers.isEmpty {
                        Text("You have no cards of $5 or more.").font(.subheadline).foregroundStyle(Theme.muted)
                    }
                    ForEach(movers) { mover in
                        HStack {
                            Text(mover.name).font(.subheadline).lineLimit(1)
                            Spacer()
                            Text(money(mover.value)).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                            Text(marketPercent(mover.change)).font(.caption.monospaced())
                                .foregroundStyle(mover.change >= 0 ? Theme.green : Theme.orange)
                                .frame(width: 48, alignment: .trailing)
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Market")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Every goal, by route (docs/03-currencies.md, Goals).
struct GoalsView: View {
    @Environment(GameStore.self) private var store

    private func value(_ amount: Double, _ route: GoalRoute) -> String {
        route == .cash || route == .collection ? money(amount) : "\(Int(amount))"
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                ForEach(GoalRoute.allCases, id: \.self) { route in
                    DetailBox(title: route.rawValue) {
                        ForEach(Balance.goals.filter { $0.route == route }) { goal in
                            let done = store.isReached(goal)
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Image(systemName: done ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(done ? Theme.green : Theme.muted)
                                    Text(goal.title).font(.subheadline)
                                    Spacer()
                                    Text(value(goal.target, route)).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                                }
                                if !done, store.nextGoal(route)?.id == goal.id {
                                    ProgressView(value: min(1, max(0, store.goalProgress(route) / goal.target)))
                                        .tint(Theme.cyan)
                                }
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Goals")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The moment the player reaches the top goal of a route. The run goes on.
struct MadeItView: View {
    @Environment(GameStore.self) private var store
    let route: GoalRoute

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Image(systemName: route.icon).font(.system(size: 56)).foregroundStyle(Theme.cyan)
            Text("You made it").font(.largeTitle.bold())
            Text(route.madeItText).multilineTextAlignment(.center).foregroundStyle(Theme.muted)
            DetailBox(title: "Your run") {
                HStack(spacing: 0) {
                    StatCell(label: "Days", value: "\(store.day + 1)")
                    StatCell(label: "Cash", value: money(store.cash))
                    StatCell(label: "Collection", value: money(store.collectionValue))
                }
            }
            Spacer()
            Button { store.madeIt = nil } label: {
                Text("Keep playing").frame(maxWidth: .infinity)
            }
            .primaryButton()
            .controlSize(.large)
        }
        .padding(24)
        .background(Theme.background.ignoresSafeArea())
        .onAppear {
            Haptics.hit()
            SoundFX.shared.play(.goal)
        }
    }
}

/// The slabs that came back from a grader overnight.
struct SlabReturnStrip: View {
    let slabs: [OwnedCard]
    @State private var shown = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("BACK FROM THE GRADER").font(.system(size: 10, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(Array(slabs.enumerated()), id: \.element.id) { index, card in
                        VStack(spacing: 4) {
                            CardOrSlab(image: card.print.image, name: card.print.name, grade: card.grade,
                                       subgrades: card.slabSubgrades, certID: card.id)
                                .frame(width: 96, height: 150)
                            Text(money(card.market)).font(.caption.monospaced().weight(.semibold))
                        }
                        .scaleEffect(shown ? 1 : 0.7)
                        .opacity(shown ? 1 : 0)
                        .animation(.spring(response: 0.4, dampingFraction: 0.65).delay(Double(index) * 0.08), value: shown)
                    }
                }
            }
        }
        .onAppear {
            shown = true
            Haptics.tap(.heavy)
            SoundFX.shared.play(.slab)
        }
    }
}
