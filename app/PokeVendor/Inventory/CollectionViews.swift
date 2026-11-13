import SwiftUI

// The PC and the master sets (docs/08-ui-direction.md, The PC and Master sets). Both hold items that are out of the
// regular Inventory tabs.

/// The PC: sealed product, raw cards, and slabs that the player collects. A PC item can go to a show or a meet, and
/// every deal on it carries the PC premium.
struct PCSection: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav
    let selecting: Bool
    @Binding var selection: Set<UUID>

    var body: some View {
        let sealed = store.data.sealed.filter(\.pc).sorted { store.market(of: $0) > store.market(of: $1) }
        let cards = (store.data.slabs + store.data.raw).filter(\.pc).sorted { $0.market > $1.market }
        VStack(spacing: 0) {
            if sealed.isEmpty && cards.isEmpty {
                EmptyTab(text: "Your PC is empty. Select items in Inventory and tap PC. PC items can go to shows and meets, "
                             + "and every deal on them carries a \(Int((Balance.pcPremium - 1) * 100))% premium.")
            }
            if !cards.isEmpty {
                TitledGroup(title: "Cards", count: cards.count, list: "pc") {
                    ForEach(stacks(cards, key: store.stackKey)) { stack in
                        row(stack.ids, route: .card(stack.id)) { CardRow(card: stack.items[0], count: stack.items.count) }
                    }
                }
            }
            if !sealed.isEmpty {
                TitledGroup(title: "Sealed", count: sealed.count, list: "pc") {
                    ForEach(stacks(sealed, key: store.stackKey)) { stack in
                        row(stack.ids, route: .sealed(stack.id)) {
                            SealedRow(item: stack.items[0], market: store.market(of: stack.items[0]), count: stack.items.count,
                                      paid: stack.items.reduce(0) { $0 + $1.paid })
                        }
                    }
                }
            }
        }
        .background(Theme.surface)
        .framed()
    }

    private func row<Content: View>(_ ids: Set<UUID>, route: AppRoute, @ViewBuilder content: () -> Content) -> some View {
        let chosen = ids.isSubset(of: selection)
        return Button {
            if selecting {
                if chosen { selection.subtract(ids) } else { selection.formUnion(ids) }
            } else {
                nav.path.append(route)
            }
        } label: {
            HStack(spacing: 10) {
                if selecting {
                    Image(systemName: chosen ? "checkmark.circle.fill" : "circle")
                        .font(.title3)
                        .foregroundStyle(chosen ? Theme.cyan : Theme.muted)
                }
                content()
            }
            .padding(12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
    }
}

/// The master sets that the player started, with the progress of each.
struct MasterSetsSection: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav

    var body: some View {
        let sets = store.startedMasterSets
        VStack(spacing: 0) {
            if sets.isEmpty {
                EmptyTab(text: "Start a master set: open a card in Inventory and tap Add to master set. "
                             + "A master set holds one copy of every print in the set, with each variant.")
            }
            ForEach(sets) { progress in
                Button { nav.path.append(.masterSet(progress.slug)) } label: {
                    MasterSetRow(progress: progress, completed: store.isMasterSetCompleted(progress.slug))
                        .padding(12)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
            }
        }
        .background(Theme.surface)
        .framed()
    }
}

struct MasterSetRow: View {
    let progress: MasterSetProgress
    let completed: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(SetLibrary.set(progress.slug).name).font(.subheadline.weight(.medium)).lineLimit(1)
                if completed { Tag(text: progress.complete ? "COMPLETE" : "COMPLETED ONCE", color: Theme.green) }
                Spacer()
                Text(money(progress.value)).font(.subheadline.monospaced().weight(.semibold))
            }
            ProgressView(value: Double(progress.have), total: Double(max(progress.total, 1)))
                .tint(progress.complete ? Theme.green : Theme.cyan)
            Text("\(progress.have) of \(progress.total) prints")
                .font(.caption.monospaced())
                .foregroundStyle(Theme.muted)
        }
    }
}

/// One master set binder: a slot for each print. A filled slot shows the card. An empty slot shows the print dimmed.
struct MasterSetDetailView: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav
    let slug: String
    @State private var missingOnly = false

    var body: some View {
        let progress = store.masterSetProgress(slug)
        let slots = MasterSet.slots(slug)
        let filled = Dictionary(store.masterSetCards.filter { $0.setSlug == slug }.map { ($0.masterKey, $0) },
                                uniquingKeysWith: { a, _ in a })
        // A free copy in the regular Inventory or the PC that can fill an empty slot.
        let spares = Dictionary((store.data.slabs + store.data.raw)
            .filter { $0.setSlug == slug && !$0.inMasterSet && $0.status == nil && !$0.isKnownFake && filled[$0.masterKey] == nil }
            .map { ($0.masterKey, $0) }, uniquingKeysWith: { a, _ in a })
        ScrollView {
            VStack(spacing: 14) {
                MasterSetRow(progress: progress, completed: store.isMasterSetCompleted(slug))
                    .padding(12)
                    .background(Theme.surface)
                    .framed()
                Toggle("Missing prints only", isOn: $missingOnly).font(.subheadline)
                let shown = missingOnly ? slots.filter { filled[MasterSet.key($0)] == nil } : slots
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 8)], spacing: 10) {
                    ForEach(shown, id: \.self) { print in
                        let card = filled[MasterSet.key(print)]
                        let owned = card == nil ? spares[MasterSet.key(print)] : nil
                        Button {
                            if let card { nav.path.append(.card(card.id)) } else if let owned { nav.path.append(.card(owned.id)) }
                        } label: {
                            VStack(spacing: 3) {
                                RemoteCardImage(url: print.image.flatMap(URL.init(string:)), name: print.name)
                                    .aspectRatio(63.0 / 88.0, contentMode: .fit)
                                    .clipShape(RoundedRectangle(cornerRadius: 5))
                                    .opacity(card == nil ? 0.25 : 1)
                                    .overlay(alignment: .topTrailing) {
                                        if let grade = card?.grade { Tag(text: grade.label) } else if owned != nil { Tag(text: "OWNED", color: Theme.orange) }
                                    }
                                Text(print.num).font(.caption2.monospaced()).foregroundStyle(Theme.muted)
                                Text(print.variant).font(.caption2).foregroundStyle(Theme.muted).lineLimit(1).minimumScaleFactor(0.7)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                Text("An empty slot with OWNED: you have a free copy in Inventory. Open it and tap Add to master set.")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Master set")
        .navigationBarTitleDisplayMode(.inline)
    }

}

/// The showcase: the player's biggest cards, $1,000 or more each, in a lit case (docs/08-ui-direction.md, The showcase).
struct ShowcaseSection: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav

    var body: some View {
        if !store.hasUpgrade(.showcaseCase) {
            VStack(spacing: 10) {
                EmptyTab(text: "The showcase holds your biggest cards: \(money(Balance.showcaseMinValue)) or more each. "
                             + "Bring it to a table for more visitors, more whales, and followers. Buy the showcase case "
                             + "(\(money(Balance.showcaseCost))) in Upgrades.")
                Button("Open Upgrades") { nav.path.append(.upgrades) }
                    .buttonStyle(.bordered)
                    .padding(.bottom, 16)
            }
            .background(Theme.surface)
            .framed()
        } else {
            let cards = store.showcaseCards
            let candidates = (store.data.slabs + store.data.raw)
                .filter { !$0.inShowcase && $0.status == nil && !$0.isKnownFake && $0.market >= Balance.showcaseMinValue }
                .sorted { $0.market > $1.market }
            VStack(spacing: 14) {
                HStack(spacing: 0) {
                    StatCell(label: "Showcase value", value: money(store.showcaseValue))
                    StatCell(label: "Cards", value: "\(cards.count) of \(Balance.showcaseSlots)")
                }
                .padding(12)
                .background(Theme.surface)
                .framed()
                if cards.isEmpty {
                    EmptyTab(text: "The case is empty. Add a card of \(money(Balance.showcaseMinValue)) or more.")
                        .background(Theme.surface)
                        .framed()
                } else {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 16) {
                        ForEach(cards) { card in
                            Button { nav.path.append(.card(card.id)) } label: {
                                VStack(spacing: 6) {
                                    CardOrSlab(image: card.print.image, name: card.print.name, grade: card.grade,
                                               subgrades: card.slabSubgrades, certID: card.id)
                                        .aspectRatio(card.grade == nil ? 63.0 / 88.0 : SlabView.ratio, contentMode: .fit)
                                        .shadow(color: Theme.cyan.opacity(0.35), radius: 10)
                                    Text(card.print.name).font(.subheadline.weight(.medium)).lineLimit(1)
                                    Text(card.grade?.label ?? card.condition.wear.short)
                                        .font(.caption.monospaced()).foregroundStyle(Theme.cyan)
                                    Text(money(card.market)).font(.subheadline.monospaced().weight(.semibold))
                                }
                                .padding(10)
                                .frame(maxWidth: .infinity)
                                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 12))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                if !candidates.isEmpty, cards.count < Balance.showcaseSlots {
                    TitledGroup(title: "Cards that can go in", count: candidates.count, list: "showcase") {
                        ForEach(candidates) { card in
                            HStack(spacing: 10) {
                                CardRow(card: card)
                                Button("Add") { store.addToShowcase(card.id) }
                                    .buttonStyle(.bordered)
                            }
                            .padding(12)
                            .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
                        }
                    }
                    .background(Theme.surface)
                    .framed()
                }
            }
        }
    }
}
