import SwiftUI

struct SetupStage: View {
    @Environment(GameStore.self) private var store
    let session: ShowSession

    var body: some View {
        let items = session.stockItems
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text(session.venue.isShow ? "Set up your table" : "Lay out your cards").font(.title3.bold())
                    Text("Pick what to bring, and set your prices. Buyers haggle, so a markup leaves room to come down.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("PRICE").font(.system(size: 11, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
                        Picker("Price", selection: Bindable(session).markup) {
                            Text("90%").tag(0.9)
                            Text("Market").tag(1.0)
                            Text("110%").tag(1.10)
                            Text("125%").tag(1.25)
                        }
                        .pickerStyle(.segmented)
                    }
                    PaymentPolicyPicker()
                    if items.isEmpty {
                        Text("You have nothing to sell. Kept items, listed items, and items at a grader stay home.")
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                    }
                    HStack {
                        Text("BRING · \(session.bring.count) of \(items.count)")
                            .font(.system(size: 11, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
                        Spacer()
                        Button(session.bring.count == items.count ? "None" : "All") {
                            session.bring = session.bring.count == items.count ? [] : Set(items.map(\.id))
                        }
                        .font(.caption.weight(.semibold))
                    }
                    let cards = items.filter { $0.kind == .card }
                    if !cards.isEmpty {
                        TitledGroup(title: "Singles and slabs", count: cards.count, list: "show") {
                            ForEach(cards) { item in bringRow(item) }
                        }
                    }
                    ForEach(SetLibrary.grouped(items.filter { $0.kind == .sealed }, by: { $0.setSlug }), id: \.slug) { group in
                        SetGroup(slug: group.slug, count: group.items.count, list: "show") {
                            ForEach(group.items) { item in bringRow(item) }
                        }
                    }
                }
                .padding(16)
            }
            HStack(spacing: 10) {
                if session.venue.hasFloor {
                    Button("Walk the floor") { session.walkFloor() }
                        .buttonStyle(.bordered)
                } else {
                    Button("Leave") { session.packUp() }
                        .buttonStyle(.bordered)
                }
                Button { session.openTable() } label: { Text(session.venue.isShow ? "Open the table" : "Start dealing").frame(maxWidth: .infinity) }
                    .primaryButton()
                    .tint(Theme.cyan)
                    .disabled(session.bring.isEmpty)
            }
            .controlSize(.large)
            .padding(16)
        }
    }

    private func bringRow(_ item: ShowItem) -> some View {
        Button {
            if session.bring.contains(item.id) { session.bring.remove(item.id) } else { session.bring.insert(item.id) }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: session.bring.contains(item.id) ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(session.bring.contains(item.id) ? Theme.cyan : Theme.muted)
                ItemLine(item: item)
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(money(session.asking(item))).font(.subheadline.monospaced())
                    Text("mkt \(money(item.market))").font(.caption2.monospaced()).foregroundStyle(Theme.muted)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
