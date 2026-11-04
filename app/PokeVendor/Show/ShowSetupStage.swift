import SwiftUI

struct SetupStage: View {
    @Environment(GameStore.self) private var store
    let session: ShowSession

    var body: some View {
        let items = session.loadItems
        let used = session.usage(items)
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
                    if session.venue.packs { crowdBox }
                    if items.isEmpty {
                        Text("You have nothing to sell. Kept items, listed items, and items at a grader stay home.")
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                    }
                    HStack {
                        Text("BRING · \(session.bring.count) of \(items.count)")
                            .font(.system(size: 11, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
                        Spacer()
                        Button("Fill") { session.fillBring() }
                            .font(.caption.weight(.semibold))
                        Button("Clear") { session.clearBring() }
                            .font(.caption.weight(.semibold))
                            .padding(.leading, 8)
                    }
                    if session.venue.packs { loadBox(items, used: used) }
                    let cards = items.filter { $0.kind == .card }
                    if !cards.isEmpty {
                        TitledGroup(title: "Singles and slabs", count: cards.count, list: "show") {
                            ForEach(cards) { item in bringRow(item, used: used) }
                        }
                    }
                    ForEach(SetLibrary.grouped(items.filter { $0.kind == .sealed }, by: { $0.setSlug }), id: \.slug) { group in
                        SetGroup(slug: group.slug, count: group.items.count, list: "show") {
                            ForEach(group.items) { item in bringRow(item, used: used) }
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

    /// Who comes to this venue (docs/29-packing-and-crowds.md).
    private var crowdBox: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("THE CROWD").font(.system(size: 11, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
            Text(session.venue.crowd.summary).font(.subheadline)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The bins, the setup time, and the turnout of the load.
    private func loadBox(_ items: [ShowItem], used: [CarryBin: Int]) -> some View {
        let minutes = Int(session.setupMinutes(items))
        let late = session.setupRunsLate(items)
        return VStack(alignment: .leading, spacing: 4) {
            Text(CarryBin.allCases.map { "\($0.name) \(used[$0, default: 0])/\(store.capacity($0))" }.joined(separator: " · "))
                .font(.caption.monospaced())
            Text("Setup \(minutes) min · open at \(session.openingClock(items)) · turnout \(Int((session.turnout(items) * 100).rounded()))%")
                .font(.caption.monospaced())
                .foregroundStyle(late ? Theme.orange : Theme.muted)
            if late {
                Text("The setup ends after the doors close. Bring less.").font(.caption).foregroundStyle(Theme.orange)
            }
        }
    }

    /// Why an item cannot go in the load.
    private func blockReason(_ item: ShowItem, used: [CarryBin: Int]) -> String {
        let bin = CarryBin.of(item)
        let room = store.capacity(bin)
        if CarryBin.space(item) > room {
            return "Too big: it needs \(CarryBin.space(item)) spaces, and your \(bin.name.lowercased()) holds \(room)."
        }
        return "Your \(bin.name.lowercased()) is full."
    }

    private func bringRow(_ item: ShowItem, used: [CarryBin: Int]) -> some View {
        let on = session.bring.contains(item.id)
        let fits = session.fits(item, usage: used)
        let shown = session.venue.packs ? store.tableShowings(item.id) : 0
        let blocked = fits ? nil : blockReason(item, used: used)
        return Button {
            session.toggleBring(item)
        } label: {
            HStack(spacing: 10) {
                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(on ? Theme.cyan : Theme.muted)
                VStack(alignment: .leading, spacing: 2) {
                    ItemLine(item: item)
                    if shown > 0 {
                        Text("On a table \(shown)× in 3 weeks").font(.caption2).foregroundStyle(Theme.orange)
                    }
                    if session.venue.packs, item.kind == .sealed, CarryBin.space(item) > 1 {
                        Text("\(CarryBin.space(item)) spaces").font(.caption2).foregroundStyle(Theme.muted)
                    }
                    if let blocked {
                        Text(blocked).font(.caption2).foregroundStyle(Theme.muted)
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(money(session.asking(item))).font(.subheadline.monospaced())
                    Text("mkt \(money(item.market))").font(.caption2.monospaced()).foregroundStyle(Theme.muted)
                }
            }
            .opacity(fits ? 1 : 0.5)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!fits)
    }
}
