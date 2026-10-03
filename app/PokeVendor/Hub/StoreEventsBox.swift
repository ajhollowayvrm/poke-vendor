import SwiftUI

/// The events box on the store screen: turn each event on or off, pick the fee, and see what to expect.
struct StoreEventsBox: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        DetailBox(title: "Events") {
            if let s = store.cardStore {
                if s.has(.playTables) {
                    let plan = s.eventPlan
                    eventRow(.tournament, s, plan)
                    Divider().overlay(Theme.line)
                    eventRow(.league, s, plan)
                    Text("An event runs only when you or the clerk are in the store. Players come back for a few days and buy singles. Good prizes raise attendance. Poor prizes lower it.")
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                } else {
                    Text("Buy the play tables to host a Friday tournament and a weekend Pokemon League.")
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                }
            }
        }
    }

    private func eventRow(_ kind: StoreEventKind, _ s: CardStoreState, _ plan: StoreEvents) -> some View {
        let on = kind == .tournament ? plan.tournamentOn : plan.leagueOn
        let weekday = kind == .tournament ? 4 : plan.leagueWeekday
        let fee = kind == .tournament ? plan.tournamentFee : plan.leagueFee
        let fees = kind == .tournament ? Balance.tournamentFees : Balance.leagueFees
        return VStack(alignment: .leading, spacing: 6) {
            Toggle(isOn: Binding(get: { on }, set: { store.setEvent(kind, on: $0) })) {
                HStack(spacing: 10) {
                    Image(systemName: kind.icon).foregroundStyle(Theme.cyan).frame(width: 24)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(kind.name).font(.subheadline.weight(.medium))
                        Text(kind == .tournament
                             ? "Friday evening. Prizes are loose packs from your store."
                             : "Morning. Kids and families. Each player gets a promo card.")
                            .font(.caption)
                            .foregroundStyle(Theme.muted)
                    }
                }
            }
            .tint(Theme.cyan)
            if on {
                if kind == .league {
                    Picker("Day", selection: Binding(get: { plan.leagueWeekday }, set: { store.setLeagueDay($0) })) {
                        ForEach(Balance.leagueWeekdays, id: \.self) { Text(GameStore.weekdays[$0]).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }
                Picker("Entry fee", selection: Binding(get: { fee }, set: { store.setEventFee(kind, $0) })) {
                    ForEach(fees, id: \.self) { Text($0 == 0 ? "Free" : money($0)).tag($0) }
                }
                .pickerStyle(.segmented)
                let players = Int(store.expectedPlayers(kind, plan: plan, hosted: false).rounded())
                Text("About \(players) players. A higher fee brings fewer players. If you work the counter that day, a few more come.")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                if kind == .tournament {
                    Text("Prize support: \(standing(plan.standing)). Each player needs about \(String(format: "%.1f", Balance.tournamentPrizePerPlayer)) loose packs.")
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                }
                if !s.openDays.contains(weekday) {
                    Text("\(GameStore.weekdays[weekday]) is a closed day, so this event does not run.")
                        .font(.caption)
                        .foregroundStyle(Theme.orange)
                }
            }
        }
    }

    private func standing(_ value: Double) -> String {
        value >= 1.15 ? "strong" : value >= 0.85 ? "fair" : "weak"
    }
}
