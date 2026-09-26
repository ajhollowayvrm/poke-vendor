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

/// The status box: where the item is, and the listing with its Remove button.
struct StatusBox: View {
    @Environment(GameStore.self) private var store
    let id: UUID
    let status: ItemStatus?

    var body: some View {
        DetailBox(title: "Status") {
            switch status {
            case nil:
                Text("In hand").font(.subheadline)
            case .onTheWay(let days, let from):
                Text("On the way from \(from.rawValue) · arrives in \(days) day\(days == 1 ? "" : "s")").font(.subheadline)
            case .atGrader(let company, let tier, let days, _):
                Text("At \(company.rawValue) (\(tier)) · back in \(days) day\(days == 1 ? "" : "s")").font(.subheadline)
            case .listed(let listing):
                VStack(alignment: .leading, spacing: 6) {
                    if let end = listing.auctionEndDay {
                        Text("Auction on eBay · ends day \(end + 1) · expected near \(money(listing.price))").font(.subheadline)
                    } else {
                        Text("Listed on \(listing.channel.rawValue) for \(money(listing.price))").font(.subheadline)
                        Text("Day \(store.day - listing.dayListed + 1) of \(Balance.listingDays)\(listing.insured ? " · insured" : "")")
                            .font(.caption.monospaced())
                            .foregroundStyle(Theme.muted)
                    }
                    if listing.auctionEndDay == nil {
                        Button("Remove listing") { store.removeListing(id) }
                            .buttonStyle(.bordered)
                    }
                }
            }
        }
    }
}

struct CardDetailView: View {
    @Environment(GameStore.self) private var store
    let id: UUID
    @State private var sell: SellRequest?
    @State private var grade: GradeRequest?
    @State private var post: NewPostRequest?
    @State private var key: String?

    /// The card, or the next card of its stack after this one leaves.
    private var resolved: OwnedCard? {
        store.card(id) ?? key.flatMap { k in (store.data.raw + store.data.slabs).first { store.stackKey($0) == k } }
    }

    var body: some View {
        if let card = resolved {
            let count = store.mates(of: card).count
            ScrollView {
                VStack(spacing: 14) {
                    RemoteCardImage(url: card.print.image.flatMap(URL.init(string:)), name: card.print.name)
                        .aspectRatio(63.0 / 88.0, contentMode: .fit)
                        .frame(width: 220)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .shadow(color: .black.opacity(0.5), radius: 10, y: 6)
                    VStack(spacing: 4) {
                        Text(card.print.name).font(.title2.bold())
                        Text("\(card.print.rarity) · \(card.print.variant) · \(card.print.num)")
                            .font(.caption.monospaced())
                            .foregroundStyle(Theme.muted)
                        if let g = card.grade {
                            Text(g.label).font(.headline).foregroundStyle(Theme.cyan)
                        }
                        if count > 1 {
                            Text("×\(count) in Inventory").font(.caption.monospaced()).foregroundStyle(Theme.cyan)
                        }
                        Tags(keep: card.keep, status: card.status)
                    }
                    DetailBox(title: "Prices") {
                        HStack(alignment: .firstTextBaseline) {
                            Text(card.grade == nil ? "RAW" : "THIS SLAB")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(Theme.muted)
                            Spacer()
                            Text(money(card.market)).font(.title3.monospaced().weight(.semibold))
                        }
                        if card.grade != nil {
                            HStack {
                                Text("RAW").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.muted)
                                Spacer()
                                Text(money(card.rawMarket)).font(.subheadline.monospaced())
                            }
                        }
                        GradedPricesGrid(print: card.print)
                    }
                    ConditionBox(card: card)
                    StatusBox(id: card.id, status: card.status)
                    DetailBox(title: "Where it came from") {
                        if let paid = card.paid {
                            Text("Bought for \(money(paid)) on day \(card.acquiredDay + 1)").font(.subheadline)
                        } else {
                            Text("Pulled from \(SetLibrary.set(card.setSlug).name) on day \(card.acquiredDay + 1)")
                                .font(.subheadline)
                        }
                    }
                    let free = card.status == nil
                    HStack(spacing: 10) {
                        Button("Sell") {
                            let free = store.mates(of: card).filter { $0.status == nil && !$0.keep }.map(\.id)
                            sell = SellRequest(ids: Set(free.isEmpty ? [card.id] : free), startAll: false)
                        }
                            .buttonStyle(.bordered)
                            .disabled(!free || card.keep)
                        if card.grade == nil {
                            Button("Grade") { grade = GradeRequest(ids: [card.id]) }
                                .buttonStyle(.bordered)
                                .disabled(!free || card.keep)
                        }
                        Button(card.keep ? "Unkeep" : "Keep") { store.setKeep([card.id], !card.keep) }
                            .buttonStyle(.borderedProminent)
                            .foregroundStyle(.black)
                    }
                    .controlSize(.large)
                    if card.grade == nil {
                        Button("Move to bulk") { store.moveToBulk([card.id]) }
                            .buttonStyle(.bordered)
                            .disabled(!free || card.keep)
                    }
                    if store.hasAccount {
                        HStack(spacing: 10) {
                            Button("Post: collection flex") { post = request(.collectionFlex, card) }
                            Button("Post: for sale") { post = request(.forSale, card) }
                                .disabled(!free || card.keep)
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .padding(16)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle(card.print.name)
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { if key == nil { key = store.stackKey(card) } }
            .sheet(item: $sell) { SellSheet(ids: $0.ids, startAll: $0.startAll) }
            .sheet(item: $grade) { GradeSheet(ids: $0.ids) }
            .sheet(item: $post) { NewPostSheet(request: $0) }
        } else {
            GoneView()
        }
    }
}

extension CardDetailView {
    func request(_ type: PostType, _ card: OwnedCard) -> NewPostRequest {
        NewPostRequest(type: type, subject: PostSubject(id: card.id, name: card.grade.map { "\(card.print.name) \($0.label)" } ?? card.print.name,
                                                        value: card.market, isCard: true, pulled: card.paid == nil,
                                                        free: card.status == nil && !card.keep, image: card.print.image))
    }
}

/// What the player can tell about the condition. A raw card shows eyeball estimates; a BGS slab shows its subgrades.
struct ConditionBox: View {
    let card: OwnedCard

    var body: some View {
        DetailBox(title: card.grade == nil ? "Condition (eyeball)" : "Grade") {
            if let g = card.grade {
                if g.company == .bgs {
                    let c = card.condition
                    row("Centering", String(format: "%.1f", c.centering))
                    row("Corners", String(format: "%.1f", c.corners))
                    row("Edges", String(format: "%.1f", c.edges))
                    row("Surface", String(format: "%.1f", c.surface))
                } else {
                    Text("\(g.company.rawValue) prints only the overall grade.").font(.subheadline).foregroundStyle(Theme.muted)
                }
            } else {
                let c = card.condition
                row("Centering, front", "about \(String(format: "%.1f", max(1, c.centeringFront - 0.5)))–\(String(format: "%.1f", min(10, c.centeringFront + 0.5)))")
                row("Centering, back", "Unknown")
                row("Corners", c.corners <= 8.5 ? "Visible whitening" : "Look sharp · fine wear needs a loupe")
                row("Edges", c.edges <= 8.5 ? "Visible chips" : "Look clean · micro-whitening needs a loupe")
                row("Surface", c.surface <= 7.5 ? "A visible scratch" : "Unknown without a raking light")
            }
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).font(.subheadline).foregroundStyle(Theme.muted)
            Spacer()
            Text(value).font(.subheadline.monospaced()).multilineTextAlignment(.trailing)
        }
    }
}

struct SealedDetailView: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav
    let id: UUID
    @State private var sell: SellRequest?
    @State private var key: String?

    /// The item, or the next item of its stack after this one leaves.
    private var resolved: SealedItem? {
        store.data.sealed.first { $0.id == id } ?? key.flatMap { k in store.data.sealed.first { store.stackKey($0) == k } }
    }

    var body: some View {
        if let item = resolved {
            let mates = store.mates(of: item)
            let product = SetLibrary.product(item.productID, in: item.setSlug)
            ScrollView {
                VStack(spacing: 14) {
                    ProductImage(url: product?.image, setName: SetLibrary.set(item.setSlug).name)
                        .frame(width: 220, height: 220)
                        .shadow(color: .black.opacity(0.5), radius: 10, y: 6)
                    VStack(spacing: 4) {
                        Text(item.name).font(.title3.bold()).multilineTextAlignment(.center)
                        if mates.count > 1 {
                            Text("×\(mates.count) in Inventory").font(.caption.monospaced()).foregroundStyle(Theme.cyan)
                        }
                        Tags(keep: item.keep, status: item.status)
                    }
                    DetailBox(title: "Contents") {
                        let slugs = store.packSlugs(of: item)
                        let counts = Dictionary(grouping: slugs, by: { $0 }).map { ($0.key, $0.value.count) }
                            .sorted { $0.1 > $1.1 }
                        ForEach(counts, id: \.0) { slug, n in
                            Text("\(n) \(SetLibrary.set(slug).name) booster pack\(n == 1 ? "" : "s")").font(.subheadline)
                        }
                        if item.brokenFrom == nil, let product, !product.promos.isEmpty {
                            Text(product.pickOnePromo ? "1 random promo card from:" : "Promo cards:")
                                .font(.caption)
                                .foregroundStyle(Theme.muted)
                                .padding(.top, 4)
                            ForEach(product.promos, id: \.self) { promo in
                                HStack {
                                    Text("\(promo.name) · \(promo.num)").font(.subheadline)
                                    Spacer()
                                    Text(money(promo.market ?? 0)).font(.subheadline.monospaced()).foregroundStyle(Theme.muted)
                                }
                            }
                        }
                    }
                    DetailBox(title: "Prices") {
                        HStack(spacing: 0) {
                            StatCell(label: "Sealed market", value: money(store.market(of: item)))
                            StatCell(label: "Paid", value: money(item.paid))
                        }
                    }
                    StatusBox(id: item.id, status: item.status)
                    DetailBox(title: "Where it came from") {
                        Text("\(item.source) · day \(item.acquiredDay + 1)").font(.subheadline)
                    }
                    let free = item.status == nil && !item.keep
                    HStack(spacing: 10) {
                        Button(item.keep ? "Unkeep" : "Keep") { store.setKeep([item.id], !item.keep) }
                            .buttonStyle(.bordered)
                        Button("Sell") { sell = SellRequest(ids: Set(mates.map(\.id)), startAll: false) }
                            .buttonStyle(.bordered)
                            .disabled(!free)
                        Button("Rip") { nav.startRip([item]) }
                            .buttonStyle(.borderedProminent)
                            .foregroundStyle(.black)
                            .disabled(!free)
                        if mates.count > 1 {
                            Button("Rip all \(mates.count)") { nav.startRip(mates) }
                                .buttonStyle(.borderedProminent)
                                .foregroundStyle(.black)
                                .disabled(!free)
                        }
                    }
                    .controlSize(.large)
                    if item.keep {
                        Text("Unkeep this item to rip or sell it.").font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                .padding(16)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Sealed")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                if key == nil { key = store.stackKey(item) }
                #if DEBUG
                if ProcessInfo.processInfo.arguments.contains("-autosell") {
                    sell = SellRequest(ids: Set(mates.map(\.id)), startAll: false)
                }
                #endif
            }
            .sheet(item: $sell) { SellSheet(ids: $0.ids, startAll: $0.startAll) }
        } else {
            GoneView()
        }
    }
}

struct BulkDetailView: View {
    @Environment(GameStore.self) private var store
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
                    DetailBox(title: group.moved ? "Moved from Raw" : "The rip") {
                        Text("\(SetLibrary.set(group.setSlug).name) · day \(group.day + 1)")
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
                    Text("Sell bulk for store credit at a game shop stop on a store run.")
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
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
