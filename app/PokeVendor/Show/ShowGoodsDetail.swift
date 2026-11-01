import SwiftUI

/// The grading booth: pick a raw card, pay, and get the slab now (docs/20-card-shows.md, on-site grading).
struct GradingBoothSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let session: ShowSession

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("PSA, one tier: \(money(Balance.onSiteGradingFee)) a card, back in about 20 minutes of show time. A fake comes back flagged, and the fee is gone.")
                        .font(.caption).foregroundStyle(Theme.muted)
                }
                Section("Your raw cards") {
                    if session.gradableCards.isEmpty { Text("No raw cards to grade.").foregroundStyle(Theme.muted) }
                    ForEach(session.gradableCards) { card in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(card.print.name).font(.subheadline)
                                RawLooks(condition: card.condition)
                            }
                            Spacer()
                            Text("raw \(money(card.market))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                            Button("Grade") { session.gradeOnSite(card.id) }
                                .primaryButton()
                                .controlSize(.small)
                                .disabled(!store.canAfford(Balance.onSiteGradingFee))
                        }
                    }
                }
            }
            .navigationTitle("Grading booth")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

/// The eyeball check caught something (docs/14-counterfeit-risk.md, Detection).
/// For an item on the player's table: what the player paid, the open EV of sealed product, and the PSA 10 price of a
/// raw card. The open EV needs the expected-value upgrade.
struct OwnedItemLines: View {
    @Environment(GameStore.self) private var store
    let item: ShowItem

    var body: some View {
        switch item.kind {
        case .card:
            if let card = store.card(item.id) {
                InfoLine(text: card.paid.map { "Paid \(money($0))" } ?? "Pulled from a pack")
                if card.grade == nil { Psa10Line(print: card.print) }
            }
        case .sealed:
            if let owned = store.data.sealed.first(where: { $0.id == item.id }) {
                InfoLine(text: "Paid \(money(owned.paid))")
                if let product = SetLibrary.product(owned.productID, in: owned.setSlug) {
                    OpenEVLine(product: product, market: item.market)
                }
            }
        }
    }
}

/// For an item that a visitor sells: the PSA 10 price of a raw card, or the open EV of sealed product.
struct GoodsValueLines: View {
    let goods: VendorGoods
    let market: Double

    var body: some View {
        switch goods {
        case .single(let print, _, _): Psa10Line(print: print)
        case .sealed(let product): OpenEVLine(product: product, market: market)
        case .slab, .mystery: EmptyView()
        }
    }
}

private struct InfoLine: View {
    let text: String
    var color = Theme.muted

    var body: some View {
        Text(text).font(.caption.monospaced()).foregroundStyle(color)
    }
}

private struct Psa10Line: View {
    let print: CardPrint

    var body: some View {
        InfoLine(text: "PSA 10 \(print.gradedPrice("psa10").map(money) ?? "—")\(print.isGradedEstimated("psa10") ? " est." : "")")
    }
}

/// The open EV, green when it beats the market price of the sealed product. Hidden without the upgrade.
private struct OpenEVLine: View {
    @Environment(GameStore.self) private var store
    let product: Product
    let market: Double

    var body: some View {
        if store.hasUpgrade(.evReadout) {
            let ev = store.expectedValue(of: product)
            InfoLine(text: "Open EV \(money(ev))", color: ev >= market ? Theme.green : Theme.orange)
        }
    }
}

struct LooksOffLine: View {
    let sealed: Bool

    var body: some View {
        Label(sealed ? "Looks off · the wrap seam is wrong" : "Looks off · soft cardstock, flat colors", systemImage: "eye.trianglebadge.exclamationmark")
            .font(.caption.weight(.semibold))
            .foregroundStyle(Theme.orange)
    }
}

/// The image of something for sale: a card, a slab, sealed product, or a mystery pack.
struct GoodsThumb: View {
    let goods: VendorGoods

    var body: some View {
        GoodsImage(item: VendorItem(goods: goods, price: 0, market: nil))
    }
}

/// One line under the name of something for sale: the set and condition, the grade, or the product kind.
struct GoodsDetail: View {
    let goods: VendorGoods
    let tool: Int

    var body: some View {
        switch goods {
        case .single(let print, let slug, let condition):
            Text("\(SetLibrary.set(slug).name) · \(print.rarity)").font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
            HStack(spacing: 6) {
                WearText(wear: condition.wear)
                Text("·").font(.caption).foregroundStyle(Theme.muted)
                CutLine(reading: .front(condition.cut, tool: tool))
            }
        case .slab(_, let slug, let grade):
            Text("\(SetLibrary.set(slug).name) · \(grade.label)").font(.caption.weight(.semibold)).foregroundStyle(Theme.cyan)
        case .sealed(let product):
            Text("Sealed · \(product.kind)").font(.caption).foregroundStyle(Theme.muted)
        case .mystery(let pack):
            Text(pack.detail).font(.caption).foregroundStyle(Theme.muted)
        }
    }
}
