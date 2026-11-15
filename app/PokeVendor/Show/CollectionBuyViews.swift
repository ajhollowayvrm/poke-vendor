import SwiftUI

// The collection and grading advice panels at the table, and the eBay collection lots (docs/33-collections.md).

/// What a collection seller brought: the kind, the counts, the market, and the best items.
struct CollectionSummary: View {
    let lot: CollectionLot

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("THEY BROUGHT · \(lot.theme.label.uppercased())").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.muted)
            Text(lot.summary).font(.subheadline)
            Text("worth \(money(lot.dealValue)) to a dealer · bulk at \(Int(Balance.collectionBulkShare * 100))% of its \(money(lot.bulkValue))")
                .font(.caption.monospaced())
                .foregroundStyle(Theme.muted)
            HStack(spacing: 6) {
                ForEach(lot.pieces.prefix(4)) { piece in
                    GoodsThumb(goods: piece.goods).frame(width: 48, height: 67)
                }
            }
        }
    }
}

/// Every good item in the collection, with picks, an offer slider, and the ways to pay. With nothing picked, the
/// offer is for all of it, bulk included. With picks, it is a cherry-pick.
struct CollectionPanel: View {
    @Environment(GameStore.self) private var store
    let session: ShowSession
    let visitor: Visitor
    @State private var picked: Set<UUID> = []
    @State private var percent: Double = 50
    @State private var credit = false
    @State private var trading = false

    var body: some View {
        if let lot = visitor.collection {
            let chosen = picked.intersection(Set(lot.pieces.map(\.id)))
            let target: Set<UUID>? = chosen.isEmpty ? nil : chosen
            let market = session.collectionMarket(visitor, target)
            let ask = session.collectionAsk(visitor, target)
            let counter = target != nil && visitor.stashCounterFor == chosen ? visitor.stashCounter : nil
            let price = ShowSession.round(market * percent / 100)
            VStack(alignment: .leading, spacing: 8) {
                Text("THE COLLECTION · TAP TO CHERRY-PICK").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.muted)
                ForEach(lot.pieces) { piece in row(piece, on: chosen.contains(piece.id)) }
                HStack {
                    Image(systemName: "square.stack.3d.down.right").foregroundStyle(Theme.muted)
                    Text("Bulk · \(lot.bulkCount) cards").font(.caption)
                    Spacer()
                    Text("\(money(lot.bulkValue * Balance.collectionBulkShare)) of \(money(lot.bulkValue))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
                .opacity(target == nil ? 1 : 0.4)
                Divider().overlay(Theme.line)
                HStack(alignment: .firstTextBaseline) {
                    Text(target == nil ? "All of it" : "\(chosen.count) picked").font(.subheadline.weight(.semibold))
                    Spacer()
                    Text("worth \(money(market))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
                HStack(alignment: .firstTextBaseline) {
                    Text("\(Int(percent))% of worth").font(.subheadline.monospaced())
                    Spacer()
                    Text(money(price)).font(.headline.monospaced()).contentTransition(.numericText())
                }
                Slider(value: $percent, in: 20...110, step: 5)
                    .padding(.vertical, -4)
                    .tint(Theme.cyan)
                    .onChange(of: percent) { _, _ in Haptics.tick(0.35) }
                if session.canPayCredit {
                    Toggle("Pay in store credit · \(money(store.storeCreditOffer(cash: price)))", isOn: $credit)
                        .font(.caption)
                        .tint(Theme.cyan)
                }
                HStack(spacing: 8) {
                    Button { withAnimation { session.offerOnCollection(target, price: price, credit: credit) } } label: {
                        Text("Offer \(money(price))").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.line)
                    .disabled(!credit && !store.canAfford(price))
                    Button { withAnimation { session.offerOnCollection(target, price: counter ?? ask, credit: credit) } } label: {
                        Text("Pay \(money(counter ?? ask))").frame(maxWidth: .infinity)
                    }
                    .primaryButton()
                    .tint(Theme.cyan)
                    .disabled(!credit && !store.canAfford(counter ?? ask))
                }
                .controlSize(.large)
                if session.hasTable, !session.table.isEmpty {
                    Button { trading = true } label: {
                        Text("Offer a trade from your table").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(Color(red: 0.7, green: 0.55, blue: 1))
                }
                Text(footnote(lot, chosen: chosen, ask: ask, counter: counter))
                    .font(.caption2)
                    .foregroundStyle(Theme.muted)
            }
            .padding(10)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 10))
            .onAppear {
                // Start one step under the seller's price for all of it.
                let worth = session.collectionMarket(visitor, nil)
                if worth > 0 { percent = min(110, max(20, ((visitor.offer / worth * 100) / 5).rounded(.down) * 5 - 5)) }
            }
            .sheet(isPresented: $trading) {
                CollectionTradeSheet(session: session, visitor: visitor, picked: target)
            }
        }
    }

    private func row(_ piece: CollectionPiece, on: Bool) -> some View {
        Button {
            if on { picked.remove(piece.id) } else { picked.insert(piece.id) }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: on ? "checkmark.circle.fill" : "circle").foregroundStyle(on ? Theme.cyan : Theme.muted)
                GoodsThumb(goods: piece.goods).frame(width: 32, height: 45)
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 4) {
                        Text(piece.name).font(.caption.weight(.semibold)).lineLimit(1)
                        if piece.looksOff { Tag(text: "LOOKS OFF", color: Theme.orange) }
                    }
                    GoodsDetail(goods: piece.goods, tool: store.data.centeringTool)
                }
                Spacer()
                Text(money(piece.market)).font(.caption.monospaced())
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func footnote(_ lot: CollectionLot, chosen: Set<UUID>, ask: Double, counter: Double?) -> String {
        var parts = [chosen.isEmpty ? "Their price for all of it, bulk included: \(money(ask))."
                                    : "Their price for the picks: \(money(ask)). Sellers charge more when you cherry-pick, and the bulk stays with them."]
        if let counter { parts.append("They countered at \(money(counter)).") }
        if visitor.cherryOK == false { parts.append("They will not split it up.") }
        parts.append(visitor.want.line)
        return parts.joined(separator: " ")
    }
}

/// Pick items from the table to trade for the collection. Each counts at 110% of market, a PC item at its PC price.
struct CollectionTradeSheet: View {
    @Environment(\.dismiss) private var dismiss
    let session: ShowSession
    let visitor: Visitor
    let picked: Set<UUID>?
    @State private var give: Set<UUID> = []

    var body: some View {
        let items = session.table.filter { give.contains($0.id) }
        let value = session.tradeValue(items)
        let ask = session.collectionAsk(visitor, picked)
        NavigationStack {
            List {
                Section {
                    ForEach(session.table) { item in
                        Button {
                            if give.contains(item.id) { give.remove(item.id) } else { give.insert(item.id) }
                        } label: {
                            HStack {
                                Image(systemName: give.contains(item.id) ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(give.contains(item.id) ? Theme.cyan : Theme.muted)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.name).font(.subheadline)
                                    Text(item.detail).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                                }
                                Spacer()
                                Text(money(item.pc ? item.dealMarket : item.market * Balance.tradeInstead)).font(.caption.monospaced())
                            }
                        }
                        .buttonStyle(.plain)
                    }
                } footer: {
                    Text("Your items count at 110% of market to them. Their price for \(picked == nil ? "all of it" : "the picks") is \(money(ask)) in cash.")
                }
            }
            .navigationTitle("Trade \(money(value))")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Propose") {
                        session.tradeForCollection(give, picked: picked)
                        dismiss()
                    }
                    .disabled(give.isEmpty)
                }
            }
        }
    }
}

/// The card someone asks about: what the player can read by eye, the raw price, and the graded prices.
struct AdviceCardView: View {
    let ask: AdviceAsk
    let raw: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("SHOULD THEY GRADE IT?").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.muted)
            HStack(alignment: .top, spacing: 12) {
                RemoteCardImage(url: ask.print.image.flatMap(URL.init(string:)), name: ask.print.name)
                    .aspectRatio(63.0 / 88.0, contentMode: .fit)
                    .frame(width: 64)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                VStack(alignment: .leading, spacing: 4) {
                    Text(ask.print.name).font(.subheadline.weight(.semibold))
                    Text("\(SetLibrary.set(ask.slug).name) · \(ask.print.rarity)").font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                    RawLooks(condition: ask.condition)
                    Text("raw \(money(raw)) · PSA 10 \(ask.print.gradedPrice("psa10").map(money) ?? "—") · PSA 9 \(ask.print.gradedPrice("psa9").map(money) ?? "—")")
                        .font(.caption.monospaced())
                        .foregroundStyle(Theme.muted)
                    if let tier = Balance.gradingTiers[.psa]?.first {
                        Text("PSA \(tier.name): \(money(tier.fee)), \(tier.days) days").font(.caption2).foregroundStyle(Theme.muted)
                    }
                }
            }
        }
    }
}

/// The answers to a grading question. "Keep it raw. I'll buy it." works now, but it is a lie when the card was worth
/// grading, and the person can find out.
struct AdviceButtons: View {
    @Environment(GameStore.self) private var store
    let session: ShowSession
    let visitor: Visitor

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                Button { withAnimation { session.advise(grade: true) } } label: {
                    Text("Grade it").frame(maxWidth: .infinity)
                }
                .primaryButton()
                .tint(Theme.cyan)
                Button { withAnimation { session.advise(grade: false) } } label: {
                    Text("Keep it raw").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(Theme.cyan)
            }
            let price = session.adviceBuyPrice(visitor)
            Button { withAnimation { session.adviseAndBuy() } } label: {
                Text("Keep it raw. I'll buy it for \(money(price))").frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .tint(Theme.orange)
            .disabled(!store.canAfford(price))
            Button("I'm not sure") { withAnimation { session.decline() } }
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
        }
        .controlSize(.large)
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
    }
}

/// The eBay collection lots: blind boxes with a few photos, and the lots on their way.
struct EbayLotsSection: View {
    @Environment(GameStore.self) private var store
    @State private var confirm: EbayLot?
    @State private var message: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("COLLECTION LOTS").font(.system(size: 10, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
            if let message { Banner(text: message, color: Theme.cyan) }
            ForEach(store.data.ebayLots) { listing in row(listing) }
            ForEach(store.data.lotOrders) { order in
                let days = max(0, order.arrivalDay - store.day)
                Text("On the way: \(order.listing.title) · arrives in \(days) day\(days == 1 ? "" : "s")")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
            Text("You see only the photos. The rest shows when the box arrives. Some lots were already searched for the good cards, and some sellers say \"unsearched\" anyway. New lots come every \(Balance.ebayLotDays) days.")
                .font(.caption2)
                .foregroundStyle(Theme.muted)
        }
        .padding(12)
        .background(Theme.surface)
        .framed()
        .onAppear { store.refreshEbayLots() }
        .confirmationDialog(confirm?.title ?? "", isPresented: Binding(isPresent: $confirm), titleVisibility: .visible,
                            presenting: confirm) { listing in
            Button("Buy · \(money(listing.total))") {
                if let problem = store.buyEbayLot(listing.id) { message = problem } else { message = "Bought. The box is on its way." }
            }
        } message: { listing in
            Text("\(money(listing.price)) and \(money(Balance.ebayLotShipping)) shipping. It arrives in \(Balance.ebayLotShipDays.lowerBound) to \(Balance.ebayLotShipDays.upperBound) days. You cannot return it.")
        }
    }

    private func row(_ listing: EbayLot) -> some View {
        Button { confirm = listing } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .top) {
                    Text("\(listing.title) · \(listing.listedCards)+ cards").font(.subheadline.weight(.semibold)).multilineTextAlignment(.leading)
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(money(listing.price)).font(.subheadline.monospaced().weight(.semibold))
                        Text("+\(money(Balance.ebayLotShipping)) ship").font(.caption2.monospaced()).foregroundStyle(Theme.muted)
                    }
                }
                Tag(text: listing.claimsUnsearched ? "SAYS UNSEARCHED" : "SEARCHED", color: listing.claimsUnsearched ? Theme.green : Theme.muted)
                HStack(spacing: 8) {
                    ForEach(listing.shownPieces) { piece in
                        VStack(spacing: 2) {
                            GoodsThumb(goods: piece.goods).frame(width: 48, height: 67)
                            Text(money(piece.market)).font(.caption2.monospaced()).foregroundStyle(Theme.muted)
                        }
                    }
                    Spacer()
                }
                Text("In the photos: \(listing.shownPieces.map(\.name).joined(separator: ", "))")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                    .lineLimit(2)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.vertical, 6)
        .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
    }
}
