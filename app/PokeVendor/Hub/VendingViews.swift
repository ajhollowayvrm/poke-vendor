import SwiftUI

/// The vending machines (docs/31-vending-machines.md): buy a machine, place it, visit it, restock it, and add parts.
struct VendingView: View {
    @Environment(GameStore.self) private var store
    @State private var placing: MachineRequest?
    @State private var restocking: MachineRequest?
    @State private var note: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                DetailBox(title: "Vending machines") {
                    Text("A machine sells sealed product at its host, mostly at night. The host takes a share. Visit to collect the cash box, restock, and clear a jam.")
                        .font(.caption).foregroundStyle(Theme.muted)
                    Button("Buy a machine · \(money(Balance.vendMachineCost))") { store.buyMachine() }
                        .primaryButton()
                        .disabled(!store.canBuyMachine)
                    Text("\(store.machines.count) of \(Balance.vendMachinesMax) machines").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
                if let note {
                    Banner(text: note, color: Theme.cyan)
                }
                ForEach(store.machines) { m in
                    MachineBox(machine: m, place: { placing = MachineRequest(id: m.id) },
                               restock: { restocking = MachineRequest(id: m.id) }, note: $note)
                }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Vending")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $placing) { PlaceMachineSheet(machineID: $0.id) }
        .sheet(item: $restocking) { RestockSheet(machineID: $0.id) }
    }
}

struct MachineRequest: Identifiable {
    let id: UUID
}

private struct MachineBox: View {
    @Environment(GameStore.self) private var store
    let machine: VendingMachine
    let place: () -> Void
    let restock: () -> Void
    @Binding var note: String?

    var body: some View {
        DetailBox(title: machine.host.map { "At the \($0.rawValue.lowercased())" } ?? "At home") {
            if let host = machine.host {
                let here = store.atMachine(machine.id)
                HStack(spacing: 0) {
                    StatCell(label: "Stock", value: "\(machine.stock.count)/\(Balance.vendCapacity)")
                    StatCell(label: "Cash box", value: machine.telemetry || here ? money(machine.cashBox) : "?")
                    StatCell(label: "Last visit", value: machine.lastVisit == store.day ? "Today" : "Day \(machine.lastVisit + 1)")
                }
                if machine.telemetry || here {
                    Text("\(machine.salesSinceVisit) sales for \(money(machine.grossSinceVisit)) since the last visit\(machine.jammed ? " · JAMMED" : "")")
                        .font(.caption.monospaced())
                        .foregroundStyle(machine.jammed ? Theme.orange : Theme.muted)
                } else {
                    Text("Without remote stock data, you see the sales and a jam only when you visit.")
                        .font(.caption).foregroundStyle(Theme.muted)
                }
                Text("The host takes \(Int(host.share * 100))% · about \(Int(host.nightShare * 100))% of sales come after dark · lifetime \(money(machine.lifetimeGross))")
                    .font(.caption).foregroundStyle(Theme.muted)
                HStack(spacing: 8) {
                    if here {
                        Button("Restock") { restock() }
                            .primaryButton()
                    } else {
                        Button("Visit · \(formatHours(host.visitHours))") { note = store.visitMachine(machine.id) }
                            .primaryButton()
                            .disabled(store.slot(for: host.visitHours) == nil)
                    }
                    Button("Bring home") { store.pullMachine(machine.id) }
                        .buttonStyle(.bordered)
                        .disabled(store.slot(for: host.visitHours) == nil)
                }
                .controlSize(.large)
            } else {
                Text("The machine is at home. Place it with a host to sell.").font(.caption).foregroundStyle(Theme.muted)
                Button("Place it") { place() }
                    .primaryButton()
                    .controlSize(.large)
            }
            ForEach(VendingAddOn.allCases) { addOn in
                let owned = switch addOn {
                case .cardReader: machine.cardReader
                case .camera: machine.camera
                case .telemetry: machine.telemetry
                }
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(addOn.rawValue).font(.subheadline)
                        Text(addOn.detail).font(.caption).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    if owned {
                        Text("Owned").font(.caption.monospaced()).foregroundStyle(Theme.green)
                    } else {
                        Button(money(addOn.cost)) { store.buyAddOn(addOn, for: machine.id) }
                            .buttonStyle(.bordered)
                            .disabled(store.cash < addOn.cost)
                    }
                }
            }
        }
    }
}

private struct PlaceMachineSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let machineID: UUID

    var body: some View {
        NavigationStack {
            List(VendingHost.allCases) { host in
                let block = store.hostBlock(host)
                Button {
                    if store.placeMachine(machineID, at: host) { dismiss() }
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(host.rawValue).font(.subheadline.weight(.semibold))
                        Text("About \(String(format: "%.1f", host.traffic)) sales a day · the host takes \(Int(host.share * 100))% · a visit takes \(formatHours(host.visitHours))")
                            .font(.caption).foregroundStyle(Theme.muted)
                        if let block { Text(block).font(.caption).foregroundStyle(Theme.orange) }
                    }
                }
                .disabled(block != nil || store.slot(for: host.visitHours) == nil)
            }
            .navigationTitle("Place the machine")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}

/// Restock during a visit: pick sealed items from Inventory, take items out, and set the markup.
private struct RestockSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let machineID: UUID
    @State private var chosen: Set<UUID> = []

    var body: some View {
        NavigationStack {
            if let m = store.machine(machineID) {
                List {
                    Section("In the machine · \(m.stock.count)/\(Balance.vendCapacity)") {
                        Picker("Prices", selection: Binding(get: { currentMarkup(m) }, set: { store.setVendMarkup(machineID, markup: $0) })) {
                            ForEach(Balance.vendMarkups, id: \.self) { Text("\(Int((($0 - 1) * 100).rounded()))% over").tag($0) }
                        }
                        .pickerStyle(.segmented)
                        ForEach(m.stock) { v in
                            HStack {
                                Text(v.item.name).font(.subheadline).lineLimit(2)
                                Spacer()
                                Text(money(v.price)).font(.caption.monospaced())
                                Button("Out") { store.unstockMachine(machineID, item: v.id) }
                                    .buttonStyle(.bordered)
                            }
                        }
                    }
                    Section("From Inventory") {
                        let room = Balance.vendCapacity - m.stock.count
                        ForEach(store.vendableSealed) { item in
                            Button {
                                if chosen.contains(item.id) { chosen.remove(item.id) } else if chosen.count < room { chosen.insert(item.id) }
                            } label: {
                                HStack {
                                    Image(systemName: chosen.contains(item.id) ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(chosen.contains(item.id) ? Theme.cyan : Theme.muted)
                                    Text(item.name).font(.subheadline).lineLimit(2)
                                    Spacer()
                                    Text(money(store.vendPrice(item))).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .navigationTitle("Restock")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Add \(chosen.count)") {
                            store.stockMachine(machineID, items: chosen)
                            chosen = []
                        }
                        .disabled(chosen.isEmpty)
                    }
                }
            } else {
                GoneView()
            }
        }
    }

    /// The markup that the machine's prices are closest to.
    private func currentMarkup(_ m: VendingMachine) -> Double {
        guard let v = m.stock.first else { return Balance.vendMarkup }
        let ratio = v.price / max(store.realMarket(of: v.item), 0.01)
        return Balance.vendMarkups.min { abs($0 - ratio) < abs($1 - ratio) } ?? Balance.vendMarkup
    }
}
