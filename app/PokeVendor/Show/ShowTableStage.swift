import SwiftUI

struct TableStage: View {
    @Environment(GameStore.self) private var store
    let session: ShowSession

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 14) {
                    if let visitor = session.visitor {
                        VisitorCard(visitor: visitor, asking: visitor.item.map(session.asking), tool: store.data.centeringTool)
                            .id(visitor.id)
                            .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                                    removal: .move(edge: .leading).combined(with: .opacity)))
                    } else {
                        Text("No one at your table.").font(.subheadline).foregroundStyle(Theme.muted).padding(.top, 40)
                    }
                    Text("\(session.table.count) item\(session.table.count == 1 ? "" : "s") out · \(session.missed) visitor\(session.missed == 1 ? "" : "s") missed")
                        .font(.caption.monospaced())
                        .foregroundStyle(Theme.muted)
                }
                .padding(16)
                .animation(.spring(response: 0.4, dampingFraction: 0.85), value: session.visitor?.id)
            }
            if let visitor = session.visitor {
                DealButtons(session: session, visitor: visitor)
            }
            HStack(spacing: 10) {
                if session.venue.hasFloor {
                    Button("Walk the floor") { withAnimation { session.walkFloor() } }
                        .buttonStyle(.bordered)
                }
                Button(session.venue.isShow ? "Pack up" : "Leave") { withAnimation { session.packUp() } }
                    .buttonStyle(.bordered)
                    .tint(Theme.orange)
            }
            .controlSize(.regular)
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
        }
    }
}

/// A counter as a share of market. It snaps to 5% steps and clicks at each one.
struct CounterSlider: View {
    let market: Double
    let offer: Double
    let range: ClosedRange<Double>
    /// True to start above the offer (a buyer), false to start below it (a seller).
    let startAbove: Bool
    let verb: String
    let passTitle: String
    let pass: () -> Void
    let send: (Double) -> Void
    @State private var percent: Double = 100

    private var price: Double { ShowSession.round(market * percent / 100) }

    var body: some View {
        VStack(spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(Int(percent))% of market").font(.subheadline.monospaced())
                Spacer()
                Text(money(price)).font(.headline.monospaced()).contentTransition(.numericText())
            }
            Slider(value: $percent, in: range, step: 5)
                .padding(.vertical, -4)
                .tint(Theme.cyan)
                .onChange(of: percent) { _, _ in Haptics.tick(0.35) }
            HStack(spacing: 8) {
                Button { withAnimation { send(price) } } label: {
                    Text("\(verb) \(money(price))").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.line)
                Button { withAnimation { pass() } } label: { Text(passTitle).frame(maxWidth: .infinity) }
                    .buttonStyle(.bordered)
            }
        }
        .padding(10)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 10))
        .onAppear {
            // Start one step past the offer, in the player's favor.
            let offerPercent = market > 0 ? offer / market * 100 : 100
            let step = (offerPercent / 5).rounded(startAbove ? .up : .down) * 5 + (startAbove ? 10 : -10)
            percent = min(range.upperBound, max(range.lowerBound, step))
        }
    }
}

/// A trade counter: the player sets what the trader's cards are worth to them, and the cash follows.
struct TradeSlider: View {
    let session: ShowSession
    let visitor: Visitor
    @State private var percent: Double = 80

    var body: some View {
        let cards = session.tradeCardsValue(visitor)
        let cash = session.tradeCash(visitor, valuing: percent)
        VStack(spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("Their cards at \(Int(percent))%").font(.subheadline.monospaced())
                Spacer()
                Text(money(ShowSession.round(cards * percent / 100))).font(.headline.monospaced()).contentTransition(.numericText())
            }
            Slider(value: $percent, in: 50...120, step: 5)
                .padding(.vertical, -4)
                .tint(Color(red: 0.7, green: 0.55, blue: 1))
                .onChange(of: percent) { _, _ in Haptics.tick(0.35) }
            HStack {
                Text(cash > 0 ? "They add \(money(cash))" : cash < 0 ? "You add \(money(-cash))" : "Straight across")
                    .font(.caption.monospaced())
                    .foregroundStyle(cash >= 0 ? Theme.green : Theme.orange)
                Spacer()
                Text("for your \(money(visitor.item?.market ?? 0)) item").font(.caption.monospaced()).foregroundStyle(Theme.muted)
            }
            HStack(spacing: 8) {
                Button { withAnimation { session.proposeTrade(valuing: percent) } } label: {
                    Text("Propose").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.line)
                Button { withAnimation { session.decline() } } label: { Text("Decline").frame(maxWidth: .infinity) }
                    .buttonStyle(.bordered)
            }
        }
        .padding(10)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 10))
    }
}

/// Accept, counter, or decline, for a buyer, a trader, or a seller.
struct DealButtons: View {
    @Environment(GameStore.self) private var store
    let session: ShowSession
    let visitor: Visitor

    var body: some View {
        VStack(spacing: 8) {
            switch visitor.intent {
            case .buy:
                let market = visitor.item?.market ?? visitor.offer
                primary("Sell for \(money(visitor.offer))", color: Theme.green) { session.accept() }
                flipRow
                CounterSlider(market: market, offer: visitor.offer, range: 50...150, startAbove: true,
                              verb: "Counter", passTitle: "Decline", pass: { session.decline() }) { session.counter($0) }
                    .id(visitor.id)
            case .trade:
                primary("Accept the trade", color: Theme.green) { session.accept() }
                TradeSlider(session: session, visitor: visitor).id(visitor.id)
            case .sell:
                primary("Buy for \(money(visitor.offer))", color: Theme.cyan) { session.accept() }
                    .disabled(!store.canAfford(visitor.offer))
                flipRow
                if session.canPayCredit {
                    Button { withAnimation { session.acceptWithCredit() } } label: {
                        Text("Pay in store credit · \(money(session.creditOffer(visitor)))").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(Theme.cyan)
                }
                if visitor.naive {
                    // They do not know what they have. The player chooses how to deal with that.
                    HStack(spacing: 8) {
                        Button { withAnimation { session.payFair() } } label: {
                            Text("Pay fair · \(money(session.fairPrice(visitor)))").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .tint(Theme.green)
                        .disabled(!store.canAfford(session.fairPrice(visitor)))
                        Button { withAnimation { session.lieAboutValue() } } label: {
                            Text("Say it's not worth much").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .tint(Theme.orange)
                    }
                }
                CounterSlider(market: visitor.goodsMarket, offer: visitor.offer, range: 30...110, startAbove: false,
                              verb: "Offer", passTitle: "Pass", pass: { session.decline() }) { session.counter($0) }
                    .id(visitor.id)
            }
        }
        .controlSize(.large)
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
    }

    /// A coin flip for the deal: the visitor's offer to flip, or the player's offer (docs/20-card-shows.md, Coin flips).
    @ViewBuilder private var flipRow: some View {
        if session.canFlip, let full = session.flipFull(visitor) {
            let half = session.flipHalf(full)
            let selling = visitor.intent == .buy
            let short = !selling && !store.canAfford(full)
            VStack(spacing: 4) {
                Button { withAnimation { visitor.flipPrice != nil ? session.takeFlip() : session.offerFlip() } } label: {
                    Label(visitor.flipPrice != nil ? "Flip for it" : "Offer a flip", systemImage: "circle.circle")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(Theme.orange)
                .disabled(visitor.flipAsked || short)
                Text(selling ? "You win: they pay \(money(full)). They win: they pay \(money(half))."
                             : "You win: you pay \(money(half)). They win: you pay \(money(full)).")
                    .font(.caption.monospaced())
                    .foregroundStyle(Theme.muted)
            }
        }
    }

    private func primary(_ title: String, color: Color, action: @escaping () -> Void) -> some View {
        Button { withAnimation { action() } } label: { Text(title).frame(maxWidth: .infinity) }
            .primaryButton()
            .tint(color)
    }

    private func secondary(_ title: String, action: @escaping () -> Void) -> some View {
        Button { withAnimation { action() } } label: { Text(title).frame(maxWidth: .infinity) }
            .buttonStyle(.bordered)
    }
}

struct VisitorCard: View {
    @Environment(GameStore.self) private var store
    let visitor: Visitor
    let asking: Double?
    let tool: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: visitor.type.icon)
                    .font(.title3)
                    .frame(width: 40, height: 40)
                    .background(accent.opacity(0.15), in: Circle())
                    .foregroundStyle(accent)
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 6) {
                        Text(visitor.name).font(.headline)
                        if let c = store.contact(visitor.contactID) {
                            LevelBadge(level: store.level(c.id))
                        }
                    }
                    Text(visitor.type.label).font(.caption).foregroundStyle(Theme.muted)
                    if let memory = store.contact(visitor.contactID)?.memory.first {
                        Text("Last time: \(memory)").font(.caption2).foregroundStyle(Theme.muted).lineLimit(1)
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    Text(intentLabel)
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(accent.opacity(0.18))
                        .foregroundStyle(accent)
                    HStack(spacing: 3) {
                        ForEach(0..<3, id: \.self) { i in
                            Circle().fill(i <= visitor.patience ? Theme.orange : Theme.line).frame(width: 6, height: 6)
                        }
                    }
                    .accessibilityLabel("Patience")
                }
            }
            if let item = visitor.item {
                if visitor.intent == .trade { Text("THEY WANT").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.muted) }
                HStack(alignment: .top, spacing: 12) {
                    ItemImage(item: item).frame(width: 64, height: 89)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.name).font(.subheadline.weight(.semibold))
                        Text(item.detail).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        if let c = item.condition {
                            HStack(spacing: 6) {
                                WearText(wear: c.wear)
                                Text("·").font(.caption).foregroundStyle(Theme.muted)
                                CutLine(reading: .front(c.cut, tool: tool))
                            }
                        }
                        Text("\(asking.map { "Your price \(money($0)) · " } ?? "")market \(money(item.market))")
                            .font(.caption.monospaced())
                            .foregroundStyle(Theme.muted)
                        OwnedItemLines(item: item)
                    }
                }
            }
            if let goods = visitor.goods {
                Text("THEY'RE SELLING").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.muted)
                HStack(alignment: .top, spacing: 12) {
                    GoodsThumb(goods: goods).frame(width: 64, height: 89)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(VendorItem(goods: goods, price: 0, market: nil).name).font(.subheadline.weight(.semibold))
                        GoodsDetail(goods: goods, tool: tool)
                        Text("market \(money(visitor.goodsMarket))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        GoodsValueLines(goods: goods, market: visitor.goodsMarket)
                        if visitor.goodsLooksOff {
                            LooksOffLine(sealed: { if case .sealed = goods { return true }; return false }())
                        }
                    }
                }
            }
            Text("“\(visitor.line)”")
                .font(.body.italic())
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.background, in: RoundedRectangle(cornerRadius: 10))
            switch visitor.intent {
            case .trade:
                Text("THEY OFFER").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.muted)
                ForEach(visitor.tradeCards) { card in
                    HStack(spacing: 12) {
                        RemoteCardImage(url: card.print.image.flatMap(URL.init(string:)), name: "")
                            .frame(width: 44, height: 61)
                            .clipShape(RoundedRectangle(cornerRadius: 3))
                        VStack(alignment: .leading, spacing: 3) {
                            Text(card.print.name).font(.subheadline.weight(.semibold))
                            Text(SetLibrary.set(card.setSlug).name).font(.caption).foregroundStyle(Theme.muted)
                            HStack(spacing: 6) {
                                WearText(wear: card.condition.wear)
                                Text("worth \(money(card.market))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                            }
                        }
                    }
                }
                HStack {
                    Text(visitor.tradeCash > 0 ? "Plus \(money(visitor.tradeCash)) cash" : "No cash").font(.subheadline.monospaced())
                        .foregroundStyle(visitor.tradeCash > 0 ? Theme.green : Theme.muted)
                    Spacer()
                    Text("Total \(money(visitor.tradeValue))").font(.subheadline.monospaced().weight(.semibold))
                        .contentTransition(.numericText())
                }
            default:
                HStack(alignment: .firstTextBaseline) {
                    Text(visitor.intent == .sell ? "THEIR PRICE" : "OFFER")
                        .font(.system(size: 11, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
                    Spacer()
                    Text(money(visitor.offer)).font(.system(size: 28, weight: .bold, design: .monospaced))
                        .foregroundStyle(good ? Theme.green : Theme.text)
                        .contentTransition(.numericText())
                }
            }
        }
        .padding(16)
        .background(Theme.surface)
        .framed()
    }

    private var good: Bool {
        switch visitor.intent {
        case .buy: visitor.offer >= (asking ?? .infinity)
        case .sell: visitor.offer < visitor.goodsMarket
        case .trade: false
        }
    }

    private var intentLabel: String {
        switch visitor.intent {
        case .buy: "WANTS TO BUY"
        case .trade: "WANTS TO TRADE"
        case .sell: "WANTS TO SELL"
        }
    }

    private var accent: Color {
        switch visitor.intent {
        case .buy: Theme.green
        case .trade: Color(red: 0.7, green: 0.55, blue: 1)
        case .sell: Theme.cyan
        }
    }
}
