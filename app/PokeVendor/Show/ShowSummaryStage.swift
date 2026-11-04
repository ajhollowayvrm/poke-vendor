import SwiftUI

struct SummaryStage: View {
    let session: ShowSession
    let onDone: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    let twoDay = (session.show?.size.days ?? 1) > 1 && session.dayIndex == 0
                    Text(twoDay ? "Day 1 is done" : session.venue.isShow ? "The show is over"
                         : session.venue.kind == .store ? "Closing time at \(session.venue.name)" : "\(session.venue.name) is over")
                        .font(.title2.bold())
                    if twoDay {
                        Text("Come back tomorrow for day 2. End the day from the hub.").font(.subheadline).foregroundStyle(Theme.muted)
                    }
                    HStack(spacing: 0) {
                        StatCell(label: "Sold", value: money(session.soldTotal), color: Theme.green)
                        StatCell(label: "Bought", value: money(session.boughtTotal))
                        StatCell(label: "Net cash", value: signedMoney(session.soldTotal - session.boughtTotal),
                                 color: session.soldTotal >= session.boughtTotal ? Theme.green : Theme.orange)
                    }
                    if let theft = session.theftLine {
                        Text(theft).font(.subheadline).foregroundStyle(Theme.orange)
                    }
                    list("SOLD", session.sold.map { ($0.name, money($0.price)) })
                    list(session.venue.isShow ? "BOUGHT ON THE FLOOR" : "BOUGHT", session.bought.map { ($0.name, money($0.price)) })
                    list("TRADES", session.trades.map { ($0, "") })
                    if session.hasTable {
                        Text("\(session.missed) buyer\(session.missed == 1 ? "" : "s") missed · \(session.walkedAway) walked away")
                            .font(.caption.monospaced())
                            .foregroundStyle(Theme.muted)
                    }
                    if session.foundNothing + session.stalePassed > 0 {
                        Text("\(session.foundNothing) found nothing for them · \(session.stalePassed) regular\(session.stalePassed == 1 ? "" : "s") saw nothing new")
                            .font(.caption.monospaced())
                            .foregroundStyle(Theme.muted)
                    }
                    list("PASSED YOUR TABLE", session.passedBy.map { ($0, "") })
                }
                .padding(16)
            }
            Button(action: onDone) { Text("Head home").frame(maxWidth: .infinity) }
                .primaryButton()
                .tint(Theme.cyan)
                .controlSize(.large)
                .padding(16)
        }
    }

    @ViewBuilder
    private func list(_ title: String, _ rows: [(String, String)]) -> some View {
        if !rows.isEmpty {
            Text("\(title) · \(rows.count)").font(.system(size: 11, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack {
                    Text(row.0).font(.subheadline)
                    Spacer()
                    Text(row.1).font(.subheadline.monospaced())
                }
                .padding(.vertical, 6)
                .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
            }
        }
    }
}
