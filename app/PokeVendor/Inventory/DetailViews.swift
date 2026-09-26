import SwiftUI

struct DetailBox<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .kerning(0.8)
                .foregroundStyle(Theme.muted)
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Theme.surface)
        .overlay(Rectangle().stroke(Theme.line))
    }
}

struct GoneView: View {
    var body: some View {
        Text("This item is no longer in Inventory.")
            .foregroundStyle(Theme.muted)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.background)
    }
}

struct CardDetailView: View {
    @Environment(InventoryStore.self) private var store
    let id: UUID

    var body: some View {
        if let card = store.data.raw.first(where: { $0.id == id }) ?? store.data.slabs.first(where: { $0.id == id }) {
            ScrollView {
                VStack(spacing: 14) {
                    RemoteCardImage(url: card.print.image.flatMap(URL.init(string:)), name: card.print.name)
                        .aspectRatio(63.0 / 88.0, contentMode: .fit)
                        .frame(width: 240)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .shadow(color: .black.opacity(0.5), radius: 10, y: 6)
                    VStack(spacing: 4) {
                        Text(card.print.name).font(.title2.bold())
                        Text("\(card.print.rarity) · \(card.print.variant) · \(card.print.num)")
                            .font(.caption.monospaced())
                            .foregroundStyle(Theme.muted)
                        if card.keep { Tag(text: "KEEP") }
                    }
                    DetailBox(title: "Prices") {
                        HStack(alignment: .firstTextBaseline) {
                            Text("RAW").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.muted)
                            Spacer()
                            Text(money(card.market)).font(.title3.monospaced().weight(.semibold))
                        }
                        let g = card.print.graded
                        HStack(alignment: .top, spacing: 8) {
                            GradeColumn(company: "CGC", rows: [("10", g.cgc10), ("9", g.cgc9)])
                            GradeColumn(company: "PSA", rows: [("10", g.psa10), ("9", g.psa9)])
                            GradeColumn(company: "BGS", rows: [("10", g.bgs10), ("9.5", g.bgs95)])
                        }
                    }
                    DetailBox(title: "Status") {
                        Text("In hand").font(.subheadline)
                    }
                    DetailBox(title: "Where it came from") {
                        if let paid = card.paid {
                            Text("Bought for \(money(paid))").font(.subheadline)
                        } else {
                            Text("Pulled from \(SetLibrary.set(card.setSlug).name) · \(card.acquired.formatted(date: .abbreviated, time: .shortened))")
                                .font(.subheadline)
                        }
                    }
                    HStack(spacing: 10) {
                        Button("Sell") {}.buttonStyle(.bordered).disabled(true)
                        Button("Grade") {}.buttonStyle(.bordered).disabled(true)
                        Button(card.keep ? "Unkeep" : "Keep") { store.setKeep([card.id], !card.keep) }
                            .buttonStyle(.borderedProminent)
                            .foregroundStyle(.black)
                    }
                    .controlSize(.large)
                }
                .padding(16)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle(card.print.name)
            .navigationBarTitleDisplayMode(.inline)
        } else {
            GoneView()
        }
    }
}

struct SealedDetailView: View {
    @Environment(InventoryStore.self) private var store
    let id: UUID
    let onRip: (SealedItem) -> Void

    var body: some View {
        if let item = store.data.sealed.first(where: { $0.id == id }) {
            ScrollView {
                VStack(spacing: 14) {
                    PackArt(setName: SetLibrary.set(item.setSlug).name, sheen: 0)
                        .frame(width: 180, height: 300)
                        .shadow(color: .black.opacity(0.5), radius: 10, y: 6)
                    VStack(spacing: 4) {
                        Text(item.name).font(.title3.bold()).multilineTextAlignment(.center)
                        if item.keep { Tag(text: "KEEP") }
                    }
                    DetailBox(title: "Contents") {
                        Text("\(item.packs) booster pack\(item.packs == 1 ? "" : "s") · 10 cards and 1 Basic Energy each")
                            .font(.subheadline)
                    }
                    DetailBox(title: "Prices") {
                        HStack(spacing: 0) {
                            StatCell(label: "Sealed market", value: money(store.market(of: item)))
                            StatCell(label: "Paid", value: money(item.paid))
                        }
                    }
                    DetailBox(title: "Where it came from") {
                        Text("\(item.source) · \(item.acquired.formatted(date: .abbreviated, time: .shortened))")
                            .font(.subheadline)
                    }
                    HStack(spacing: 10) {
                        Button(item.keep ? "Unkeep" : "Keep") { store.setKeep([item.id], !item.keep) }
                            .buttonStyle(.bordered)
                        Button("Rip") { onRip(item) }
                            .buttonStyle(.borderedProminent)
                            .foregroundStyle(.black)
                            .disabled(item.keep)
                    }
                    .controlSize(.large)
                    if item.keep {
                        Text("Unkeep this item to rip it.").font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                .padding(16)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Sealed")
            .navigationBarTitleDisplayMode(.inline)
        } else {
            GoneView()
        }
    }
}

struct BulkDetailView: View {
    @Environment(InventoryStore.self) private var store
    let id: UUID

    private struct RarityGroup: Identifiable {
        var id: String { name }
        let name: String
        let count: Int
        let value: Double
    }

    var body: some View {
        if let group = store.data.bulk.first(where: { $0.id == id }) {
            let groups = Dictionary(grouping: group.cards) { "\($0.rarity) · \($0.variant)" }
                .map { RarityGroup(name: $0.key, count: $0.value.count, value: $0.value.reduce(0) { $0 + ($1.market ?? 0) }) }
                .sorted { $0.count > $1.count }
            ScrollView {
                VStack(spacing: 14) {
                    DetailBox(title: "The rip") {
                        Text("\(SetLibrary.set(group.setSlug).name) · \(group.date.formatted(date: .abbreviated, time: .shortened))")
                            .font(.subheadline)
                        HStack(spacing: 0) {
                            StatCell(label: "Cards", value: "\(group.cards.count)")
                            StatCell(label: "Total value", value: money(group.value))
                        }
                    }
                    DetailBox(title: "By rarity") {
                        ForEach(groups) { g in
                            HStack {
                                Text(g.name).font(.subheadline)
                                Spacer()
                                Text("×\(g.count)").font(.subheadline.monospaced()).foregroundStyle(Theme.muted)
                                Text(money(g.value)).font(.subheadline.monospaced()).frame(width: 80, alignment: .trailing)
                            }
                        }
                    }
                    Button("Add to store run") {}
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                        .disabled(true)
                }
                .padding(16)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Bulk group")
            .navigationBarTitleDisplayMode(.inline)
        } else {
            GoneView()
        }
    }
}
