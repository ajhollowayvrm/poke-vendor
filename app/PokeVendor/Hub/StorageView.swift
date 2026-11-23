import SwiftUI

/// The storage unit (docs/37-storage.md): the home's space, the rental, and on a visit day, moving items in and out.
struct StorageView: View {
    @Environment(GameStore.self) private var store
    @State private var confirmEnd = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                homeBox
                unitBox
                if store.storageSize != nil { visitBox }
                if store.storageSize != nil {
                    itemsBox(title: "In the unit", items: unitItems, move: "Take home") { store.takeFromStorage($0) }
                }
                if store.atStorageToday {
                    itemsBox(title: "At home", items: homeItems, move: "Move in") { store.moveToStorage($0) }
                }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Storage")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Boxes

    private var homeBox: some View {
        DetailBox(title: "Home") {
            let used = store.homeSpaceUsed
            HStack {
                Text(store.homeSpaceLimit.map { "\(used) of \($0) spaces" } ?? "\(used) spaces · no limit").font(.subheadline.monospaced())
                Spacer()
                if store.homeOverflow > 0 { Tag(text: "\(store.homeOverflow) OVER", color: Theme.orange) }
            }
            if let limit = store.homeSpaceLimit { SpaceBar(used: used, capacity: limit) }
            if store.homeOverflow > 0 {
                Text("Each night you pay \(money(Double(store.homeOverflow) * Balance.clutterFeePerSpace)) for the boxes in the hall and the car: \(money(Balance.clutterFeePerSpace)) a space over the limit.")
                    .font(.caption).foregroundStyle(Theme.orange)
            }
            Text("Sealed product takes its real size. A slab takes \(Balance.slabSpace.formatted()) space, and a raw card \(Balance.rawSpace.formatted()). A big stock of sealed product at home draws thieves.")
                .font(.caption).foregroundStyle(Theme.muted)
        }
    }

    private var unitBox: some View {
        DetailBox(title: "Storage unit") {
            if let size = store.storageSize {
                HStack {
                    Text("\(size.rawValue) · \(money(size.rent)) a month").font(.subheadline)
                    Spacer()
                    Text("\(store.storageUsed) of \(size.capacity)").font(.subheadline.monospaced())
                }
                SpaceBar(used: store.storageUsed, capacity: size.capacity)
                Toggle("Send sealed deliveries here", isOn: Binding(get: { store.data.storage.deliverHere },
                                                                    set: { store.setDeliverToStorage($0) }))
                    .font(.subheadline)
                Text("A delivery goes to the unit when it has room. You still need a visit to take it home.")
                    .font(.caption).foregroundStyle(Theme.muted)
            } else {
                Text("Rent a unit for stock you hold a long time: cases, big boxes, and slabs. It is safe from home theft and water. To move items in or out, you drive there.")
                    .font(.subheadline).foregroundStyle(Theme.muted)
            }
            ForEach(StorageSize.allCases) { size in
                if size != store.storageSize {
                    Button {
                        store.rentStorage(size)
                    } label: {
                        HStack {
                            Text("\(store.storageSize == nil ? "Rent" : "Change to") \(size.rawValue)")
                            Spacer()
                            Text("\(size.capacity) spaces · \(money(size.rent))/mo").font(.caption.monospaced())
                        }
                    }
                    .buttonStyle(.bordered)
                    .disabled(store.storageUsed > size.capacity)
                }
            }
            if store.storageSize != nil {
                Button("End the rental", role: .destructive) { confirmEnd = true }
                    .buttonStyle(.bordered)
                    .disabled(store.hasItemsInStorage)
                if store.hasItemsInStorage {
                    Text("Empty the unit first.").font(.caption).foregroundStyle(Theme.muted)
                }
            }
        }
        .confirmationDialog("End the rental?", isPresented: $confirmEnd, titleVisibility: .visible) {
            Button("End it", role: .destructive) { store.endStorage() }
        }
    }

    private var visitBox: some View {
        DetailBox(title: "Visit") {
            if store.atStorageToday {
                Label("You are at the unit today. Move items in and out until the day ends.", systemImage: "checkmark.circle.fill")
                    .font(.subheadline).foregroundStyle(Theme.green)
            } else {
                Button {
                    store.visitStorage()
                } label: {
                    Text("Drive to the unit (\(Int(Balance.storageVisitHours * 60)) min)").frame(maxWidth: .infinity)
                }
                .primaryButton()
                .disabled(store.visitBlock != nil)
                Text(store.visitBlock ?? "Now \(GameStore.clock(store.data.hour)). A visit lets you move items in and out for the rest of the day.")
                    .font(.caption).foregroundStyle(Theme.muted)
            }
        }
    }

    // MARK: - Items

    /// One row of a list: a stack of the same items.
    private struct Row: Identifiable {
        let id: UUID
        let ids: [UUID]
        let name: String
        let detail: String
        let value: Double
    }

    private func rows(sealed: [SealedItem], cards: [OwnedCard]) -> [Row] {
        var out: [Row] = []
        for st in stacks(sealed, key: store.stackKey) {
            let item = st.items[0]
            out.append(Row(id: st.id, ids: st.items.map(\.id), name: item.name,
                           detail: "\(store.space(of: item)) space\(store.space(of: item) == 1 ? "" : "s") each",
                           value: store.realMarket(of: item)))
        }
        for st in stacks(cards, key: store.stackKey) {
            let card = st.items[0]
            out.append(Row(id: st.id, ids: st.items.map(\.id), name: card.print.name + (card.grade.map { " \($0.label)" } ?? ""),
                           detail: card.grade == nil ? "Raw" : "Slab", value: card.market))
        }
        return out.sorted { $0.value * Double($0.ids.count) > $1.value * Double($1.ids.count) }
    }

    private var unitItems: [Row] {
        rows(sealed: store.data.sealed.filter { $0.status == .inStorage },
             cards: (store.data.slabs + store.data.raw).filter { $0.status == .inStorage })
    }

    /// The items at home that can go to the unit: no status, and not set aside.
    private var homeItems: [Row] {
        rows(sealed: store.data.sealed.filter { $0.status == nil && !$0.setAside },
             cards: (store.data.slabs + store.data.raw).filter { $0.status == nil && !$0.setAside })
    }

    private func itemsBox(title: String, items: [Row], move: String, action: @escaping (Set<UUID>) -> Int) -> some View {
        DetailBox(title: "\(title) · \(items.reduce(0) { $0 + $1.ids.count })") {
            if items.isEmpty {
                Text("Nothing here.").font(.subheadline).foregroundStyle(Theme.muted)
            }
            if store.atStorageToday, items.count > 1 {
                Button("\(move) all") { _ = action(Set(items.flatMap(\.ids))) }
                    .buttonStyle(.bordered)
                    .font(.caption)
            }
            ForEach(items) { row in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.ids.count > 1 ? "\(row.name) ×\(row.ids.count)" : row.name).font(.subheadline).lineLimit(1)
                        Text("\(row.detail) · \(money(row.value))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    if store.atStorageToday {
                        Button(move) { _ = action(Set(row.ids)) }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                    }
                }
            }
        }
    }
}

/// A bar of used space against the capacity.
struct SpaceBar: View {
    let used: Int
    let capacity: Int

    var body: some View {
        GeometryReader { geo in
            let share = capacity > 0 ? min(1, Double(used) / Double(capacity)) : 0
            ZStack(alignment: .leading) {
                Rectangle().fill(Theme.line)
                Rectangle().fill(used > capacity ? Theme.orange : Theme.cyan).frame(width: geo.size.width * share)
            }
        }
        .frame(height: 6)
    }
}
