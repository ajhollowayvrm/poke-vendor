import SwiftUI

/// The distributor: cases at wholesale, from reputation Respected (docs/12-acquiring-product.md, Distributor / wholesale).
struct WholesaleView: View {
    @Environment(GameStore.self) private var store
    @State private var cases: [String: Int] = [:]
    @State private var message: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                HStack {
                    Text("\(Int(Balance.wholesaleDiscount * 100))% of MSRP · minimum order \(money(Balance.wholesaleMinOrder)) · \(Balance.wholesaleDeliveryDays)-day delivery")
                        .font(.caption).foregroundStyle(Theme.muted)
                    Spacer()
                    Text("Cash \(money(store.cash))").font(.caption.monospaced())
                }
                if let message { Banner(text: message, color: Theme.cyan, icon: "info.circle.fill") }
                if !store.wholesaleOpen {
                    EmptyTab(text: "Wholesale opens at reputation Respected.")
                }
                ForEach(store.wholesaleOffers) { offer in
                    let n = cases[offer.id] ?? 1
                    HStack(alignment: .top, spacing: 12) {
                        ProductImage(url: offer.product.image, setName: offer.product.name).frame(width: 50, height: 64)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(offer.product.name).font(.subheadline.weight(.medium)).lineLimit(2)
                            Text("Case of \(offer.caseSize) · \(money(offer.unitPrice)) each · MSRP \(money(offer.product.msrp ?? 0)) · mkt \(money(offer.product.market))")
                                .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                            Stepper("\(n) case\(n == 1 ? "" : "s") · \(money(offer.casePrice * Double(n)))", value: Binding(get: { n }, set: { cases[offer.id] = $0 }), in: 1...10)
                                .font(.caption)
                            Button("Order") { message = store.buyWholesale(offer, cases: n) ?? "Ordered. It arrives in \(Balance.wholesaleDeliveryDays) days." }
                                .buttonStyle(.borderedProminent)
                                .foregroundStyle(.black)
                                .controlSize(.small)
                                .disabled(!store.canAfford(offer.casePrice * Double(n)))
                        }
                    }
                    .padding(12)
                    .background(Theme.surface)
                    .overlay(Rectangle().stroke(Theme.line))
                }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Distributor")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Case splits: a few trusted people buy a case and divide the boxes (docs/12-acquiring-product.md, Case splits).
struct CaseSplitsView: View {
    @Environment(GameStore.self) private var store
    @State private var boxes: [UUID: Int] = [:]
    @State private var message: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Text(store.reputationTier >= 4 ? "Elite: 2 invites a week, and up to half of a case." : "Respected: 1 invite a week, up to \(Balance.splitMaxBoxesRespected) boxes. A Friend vendor invites you into their own splits.")
                    .font(.caption).foregroundStyle(Theme.muted).frame(maxWidth: .infinity, alignment: .leading)
                if let message { Banner(text: message, color: Theme.cyan, icon: "info.circle.fill") }
                if store.openSplits.isEmpty {
                    EmptyTab(text: store.reputationTier >= 3 ? "No invites right now. They come on Monday." : "Case splits open at reputation Respected.")
                }
                ForEach(store.openSplits) { split in
                    let n = boxes[split.id] ?? 1
                    let limit = store.splitLimit(split) - split.mine
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(split.productName).font(.subheadline.weight(.semibold)).lineLimit(2)
                            Spacer()
                            Text(money(split.pricePerBox) + " a box").font(.subheadline.monospaced())
                        }
                        Text("\(split.organizer)'s split · \(split.boxes) boxes · \(split.taken) taken by others · \(split.mine) yours · mkt \(money(SetLibrary.product(split.productID)?.market ?? 0)) a box")
                            .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        Text(split.closesDay >= store.day ? "Closes day \(split.closesDay + 1) · arrives day \(split.arrivesDay + 1)" : "Closed · arrives day \(split.arrivesDay + 1)")
                            .font(.caption.monospaced()).foregroundStyle(Theme.cyan)
                        if split.closesDay >= store.day, limit > 0 {
                            HStack {
                                Stepper("\(n) box\(n == 1 ? "" : "es") · \(money(split.pricePerBox * Double(n)))", value: Binding(get: { n }, set: { boxes[split.id] = $0 }), in: 1...max(1, limit))
                                    .font(.caption)
                            }
                            HStack {
                                Button("Take \(n)") { message = store.joinSplit(split.id, boxes: n) ?? "You are in. The boxes arrive on day \(split.arrivesDay + 1)." }
                                    .buttonStyle(.borderedProminent)
                                    .foregroundStyle(.black)
                                    .controlSize(.small)
                                    .disabled(!store.canAfford(split.pricePerBox * Double(n)))
                                if split.mine == 0 {
                                    Button("Pass") { store.declineSplit(split.id) }.buttonStyle(.bordered).controlSize(.small)
                                }
                            }
                        }
                    }
                    .padding(12)
                    .background(Theme.surface)
                    .overlay(Rectangle().stroke(Theme.line))
                }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Case splits")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Cards for the game shop's display case, on consignment (docs/15-selling.md, The local game shop).
struct ConsignSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let shop: LocalStore
    @State private var chosen: Set<UUID> = []
    @State private var percent: Double = 110

    var body: some View {
        let cards = (store.data.raw + store.data.slabs).filter { $0.status == nil && !$0.keep && $0.realMarket >= 1 }.sorted { $0.realMarket > $1.realMarket }
        let cut = store.consignCut(at: shop)
        NavigationStack {
            Form {
                Section("Price") {
                    HStack {
                        Slider(value: $percent, in: 100...130, step: 5)
                        Text("\(Int(percent))%").font(.body.monospaced()).frame(width: 56, alignment: .trailing)
                    }
                    Text("\(Int(percent))% of market. The shop takes \(Int(cut * 100))% of the sale. The card sits in the case for \(Balance.consignDays) days. A higher price sells less often. Each sale is +\(Balance.consignStandingPoints) standing.")
                        .font(.caption).foregroundStyle(Theme.muted)
                }
                Section("Cards · \(chosen.count)") {
                    if cards.isEmpty { Text("No free cards.").foregroundStyle(Theme.muted) }
                    ForEach(cards) { card in
                        Button {
                            if chosen.contains(card.id) { chosen.remove(card.id) } else { chosen.insert(card.id) }
                        } label: {
                            HStack {
                                Image(systemName: chosen.contains(card.id) ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(chosen.contains(card.id) ? Theme.cyan : Theme.muted)
                                Text(card.grade.map { "\(card.print.name) \($0.label)" } ?? card.print.name).foregroundStyle(Theme.text).lineLimit(1)
                                Spacer()
                                Text("\(money(card.realMarket * percent / 100)) · you get \(money(card.realMarket * percent / 100 * (1 - cut)))")
                                    .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Consign at \(shop.rawValue)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Consign \(chosen.count)") {
                        store.consign(chosen, at: shop, percent: percent)
                        dismiss()
                    }
                    .disabled(chosen.isEmpty)
                }
            }
        }
    }
}
