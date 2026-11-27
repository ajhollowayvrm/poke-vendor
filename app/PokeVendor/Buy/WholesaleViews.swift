import SwiftUI

/// The distributor: cases at wholesale, from reputation Respected, or for a store with a weekly allocation
/// (docs/12-acquiring-product.md, Distributor / wholesale). A player with only the plug sees the gray market here.
struct WholesaleView: View {
    @Environment(GameStore.self) private var store
    @State private var cases: [String: Int] = [:]
    @State private var message: String?

    private var title: String {
        store.distributorTier != .none ? store.distributorTier.name : store.plugOpen ? "Gray market" : "Distributor"
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if store.wholesaleOpen {
                    HStack {
                        Text(header).font(.caption).foregroundStyle(Theme.muted)
                        Spacer()
                        // A store owner's distributor orders bill the business account (Model/Wholesale.swift).
                        Text(store.hasBusinessAccount ? "Business \(money(store.businessCash))" : "Cash \(money(store.cash))")
                            .font(.caption.monospaced())
                    }
                    if store.hasStoreAccount { repBox } else { hobbyBox }
                    if store.hasStoreAccount { LadderBox() }
                    allocationBox
                    if !store.data.distributor.warnings.isEmpty {
                        Banner(text: "Warnings from your rep: \(store.data.distributor.warnings.count) of 3 in 12 weeks.", color: Theme.orange,
                               icon: "exclamationmark.triangle.fill")
                    }
                }
                if let message { Banner(text: message, color: Theme.cyan, icon: "info.circle.fill") }
                if !store.wholesaleOpen {
                    EmptyTab(text: "Wholesale opens at reputation Respected, or when your own store opens.")
                }
                ForEach(store.wholesaleOffers) { offer in offerRow(offer) }
                if store.plugOpen || store.data.plug.goneDay != nil { PlugSection() }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var header: String {
        let pct = Int((store.wholesaleDiscountNow * 100).rounded())
        return store.hasStoreAccount
            ? "\(pct)% of MSRP · hobby account · \(Balance.wholesaleDeliveryDays)-day delivery"
            : "\(pct)% of MSRP · secondary wholesaler · minimum \(money(Balance.wholesaleMinOrder)) · \(Balance.wholesaleDeliveryDays)-day delivery"
    }

    /// The application, its checklist, and what the player waits for.
    private var hobbyBox: some View {
        let a = store.data.distributor
        return DetailBox(title: "Hobby distributor account") {
            if let until = a.closedUntil, store.day < until {
                Text("Your account is closed until day \(until + 1). You buy from the secondary wholesaler.")
                    .font(.caption).foregroundStyle(Theme.orange)
            } else if let decision = store.distributorDecisionDay {
                Text("Under review. The distributor decides on day \(decision + 1). Until then you buy at secondary terms.")
                    .font(.caption).foregroundStyle(Theme.cyan)
            } else {
                Text("A hobby account buys at \(Int(Balance.storeWholesaleDiscount * 100))% of MSRP with no minimum order, and has a rep and a weekly allocation.")
                    .font(.caption).foregroundStyle(Theme.muted)
                ForEach(store.distributorRequirements) { r in
                    HStack(spacing: 8) {
                        Image(systemName: r.met ? "checkmark.circle.fill" : "circle").foregroundStyle(r.met ? Theme.green : Theme.muted)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(r.label).font(.subheadline)
                            Text(r.detail).font(.caption2).foregroundStyle(Theme.muted)
                        }
                    }
                }
                Button { store.applyToDistributor() } label: {
                    Text("Apply · decision in \(Balance.distributorReviewDays) days").frame(maxWidth: .infinity)
                }
                .primaryButton()
                .disabled(!store.canApplyToDistributor)
            }
        }
    }

    private var allocationBox: some View {
        DetailBox(title: "Your allocation") {
            Text(store.hasStoreAccount
                 ? "Hot product: \(Balance.allocationBase) case of each product a week. The rest: \(Balance.allocationBase + 1) cases, and 1 more for each \(money(Balance.allocationStep)) you spend here, up to \(Balance.allocationMax + 1). There is no minimum order."
                 : "With no hobby account, you can buy \(Balance.wholesaleCasesPerWeek) cases a week and 1 case of each product.")
                .font(.caption).foregroundStyle(Theme.muted)
            Text("Spent with the distributor: \(money(store.distributorSpent))").font(.caption.monospaced())
            if store.hotFrozen, let until = store.data.distributor.hotFrozenUntil {
                Text("No hot product for your account until day \(until + 1).").font(.caption).foregroundStyle(Theme.orange)
            }
        }
    }

    /// The rep, the fill chance, the shelf share, and the push.
    private var repBox: some View {
        let hot = store.wholesaleOffers.filter { store.isHot($0.product) }
        let share = store.hotShelfShare
        return DetailBox(title: "Your rep · \(store.repName)") {
            ProgressView(value: Double(store.repPoints), total: 100).tint(Theme.cyan)
            HStack {
                Text("Relationship \(store.repPoints) of 100").font(.caption.monospaced())
                Spacer()
                if let first = hot.first {
                    Text("Hot fill about \(Int((store.hotFillRate(first.product) * 100).rounded()))%").font(.caption.monospaced())
                        .foregroundStyle(Theme.cyan)
                }
            }
            if let share {
                Text("Hot product sold to customers, last \(Balance.backDoorWindowDays / 7) weeks: \(Int((share * 100).rounded()))%. Your rep wants \(Int(Balance.backDoorShelfShare * 100))% or more.")
                    .font(.caption)
                    .foregroundStyle(share < Balance.backDoorShelfShare ? Theme.orange : Theme.muted)
            } else {
                Text("No hot sales yet. Your rep wants \(Int(Balance.backDoorShelfShare * 100))% of hot product to reach your customers.")
                    .font(.caption).foregroundStyle(Theme.muted)
            }
            Text("Spend and store events raise the relationship. Sales of hot product to resellers lower it.")
                .font(.caption2).foregroundStyle(Theme.muted)
            Menu {
                ForEach(hot) { offer in
                    Button(offer.product.name) { message = store.pushForAllocation(offer.product.id) ?? "You pushed your rep for \(offer.product.name). Its fill is better this week." }
                }
            } label: {
                Text(store.pushWaitUntil.map { "Push for more allocation · wait until day \($0 + 1)" } ?? "Push for more allocation (−\(Balance.pushCost))")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .disabled(hot.isEmpty || store.pushWaitUntil != nil)
        }
    }

    private func offerRow(_ offer: WholesaleOffer) -> some View {
        let left = store.wholesaleLeft(offer)
        let top = left.map { max(1, $0) } ?? 10
        let n = min(cases[offer.id] ?? 1, top)
        let hot = store.isHot(offer.product)
        return HStack(alignment: .top, spacing: 12) {
            // An order ships later, so the player cannot hold the box: only the odds show.
            ProductImage(url: offer.product.image, setName: offer.product.name).frame(width: 50, height: 64)
                .looksInside(offer.product) { nil }
            VStack(alignment: .leading, spacing: 4) {
                Text(offer.product.name).font(.subheadline.weight(.medium)).lineLimit(2)
                Text("Case of \(offer.caseSize) · \(money(offer.unitPrice)) each · case mkt \(money(offer.caseMarket)) · MSRP \(money(offer.product.retailMSRP() ?? 0))")
                    .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                if let left {
                    Text("Allocation this week: \(left) of \(store.wholesaleCap(offer.product)) case\(store.wholesaleCap(offer.product) == 1 ? "" : "s") left\(hot ? " · hot product" : "")")
                        .font(.caption.monospaced()).foregroundStyle(left == 0 ? Theme.orange : Theme.cyan)
                }
                if hot {
                    Text("hot · fill about \(Int((store.hotFillRate(offer.product) * 100).rounded()))% · you pay only for the cases that fill")
                        .font(.caption2.monospaced()).foregroundStyle(Theme.orange)
                    if store.eliteCaseOpen {
                        Text("Elite: 1 hot case this week skips the fill.").font(.caption2.monospaced()).foregroundStyle(Theme.cyan)
                    }
                }
                Stepper("\(n) case\(n == 1 ? "" : "s") · \(money(offer.casePrice * Double(n)))", value: Binding(get: { n }, set: { cases[offer.id] = $0 }), in: 1...top)
                    .font(.caption)
                Button("Order") { message = store.buyWholesale(offer, cases: n) ?? "Ordered. It arrives in \(Balance.wholesaleDeliveryDays) days." }
                    .primaryButton()
                    .controlSize(.small)
                    .disabled(left == 0 || !store.canAfford(offer.casePrice * Double(n)))
            }
        }
        .padding(12)
        .background(Theme.surface)
        .framed()
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
                                    .primaryButton()
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
                    .framed()
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
        let cards = (store.data.raw + store.data.slabs).filter { $0.status == nil && !$0.setAside && $0.realMarket >= 1 }.sorted { $0.realMarket > $1.realMarket }
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
                            VStack(alignment: .leading, spacing: 3) {
                                HStack {
                                    Image(systemName: chosen.contains(card.id) ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(chosen.contains(card.id) ? Theme.cyan : Theme.muted)
                                    Text(card.grade.map { "\(card.print.name) \($0.label)" } ?? card.print.name).foregroundStyle(Theme.text).lineLimit(1)
                                    Spacer()
                                    Text("\(money(card.realMarket * percent / 100)) · you get \(money(card.realMarket * percent / 100 * (1 - cut)))")
                                        .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                                }
                                if store.hasSalesAnalytics {
                                    ProfitLine(net: card.realMarket * percent / 100 * (1 - cut), paid: card.paid)
                                }
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
