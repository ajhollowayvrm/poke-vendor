import SwiftUI

/// The details and the answers for a counter walk-in with a job (Model/CounterEvents.swift).
struct CounterEventPanel: View {
    @Environment(GameStore.self) private var store
    let session: ShowSession
    let visitor: Visitor
    let event: CounterEvent

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            switch event.kind {
            case .gift: gift
            case .packRip: packRip
            case .returnItem: returnItem
            case .specialOrder: specialOrder
            case .hold: hold
            case .shoplifter: shoplifter
            case .priceCheck: priceCheck
            case .tradeUp: tradeUp
            case .tradeIn: tradeIn
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Each kind

    @ViewBuilder private var gift: some View {
        let options = session.table.filter { session.asking($0) <= event.budget }
            .sorted { session.asking($0) > session.asking($1) }
        header("PICK A GIFT UNDER \(money(event.budget))")
        ForEach(options.prefix(12)) { item in
            Button { withAnimation { session.suggestGift(item.id) } } label: {
                HStack {
                    ItemLine(item: item)
                    Spacer()
                    Text(money(session.asking(item))).font(.caption.monospaced())
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        hint("Tap an item to suggest it. A gift that suits the person and uses most of the budget earns a tip and a good review.")
        pass("Nothing fits, sorry")
    }

    @ViewBuilder private var packRip: some View {
        if let pack = event.item {
            ItemLine(item: pack)
            wide("Sell it · \(money(session.asking(pack)))", primary: true) { session.sellPackToRip() }
            hint("They open it at the counter. With a good hit, they may offer to sell it to you.")
            pass("Pass")
        }
    }

    @ViewBuilder private var returnItem: some View {
        if let goods = event.goods {
            cardRow(goods, market: event.market)
            if event.looksOff { LooksOffLine(sealed: false) }
            Text("They say they paid \(money(event.price)).").font(.caption.monospaced()).foregroundStyle(Theme.muted)
            wide("Refund \(money(event.price)) cash", primary: true) { session.answerReturn(.cash) }
                .disabled(!store.canAfford(event.price))
            if session.canPayCredit {
                wide("Give \(money(event.price)) in store credit") { session.answerReturn(.credit) }
            }
            wide("No returns", tint: Theme.orange) { session.answerReturn(.refuse) }
            hint("An honest customer remembers how you treat a return. Some returns are a trick: a worse copy, or a fake.")
        }
    }

    @ViewBuilder private var specialOrder: some View {
        if let print = event.print {
            cardRow(.single(print, slug: event.slug, condition: .packFresh()), market: event.market)
            let deposit = ShowSession.round(event.price * Balance.specialOrderDeposit)
            wide("Take the order · \(money(deposit)) deposit", primary: true) { session.takeSpecialOrder() }
            hint("Find the card in \(Balance.specialOrderDays) days: buy it anywhere, and keep it in Inventory or in the store. At the end of a day, the store sells it to them for \(money(event.price)). If you miss the day, you refund the deposit, and they leave a bad review.")
            pass("I can't get it")
        }
    }

    @ViewBuilder private var hold: some View {
        if let item = event.item {
            ItemLine(item: item)
            let deposit = ShowSession.round(event.price * Balance.holdDeposit)
            wide("Hold it · \(money(deposit)) now", primary: true) { session.holdItem() }
            hint("The item leaves the shelf for up to \(Balance.holdDays) days. If they come back, they pay the rest. If they do not, you keep the deposit, and the item goes back on sale.")
            pass("Full price only")
        }
    }

    @ViewBuilder private var shoplifter: some View {
        header("WHAT DO YOU DO?")
        wide("Keep an eye on them", primary: true) { session.answerShoplifter(.watch) }
        wide("Ask if they need help") { session.answerShoplifter(.help) }
        wide("Call them out", tint: Theme.orange) { session.answerShoplifter(.callOut) }
        wide("Let it go", tint: Theme.muted) { session.answerShoplifter(.ignore) }
        hint("Watching costs 10 minutes. Calling out an honest kid costs you a customer and a review.")
    }

    @ViewBuilder private var priceCheck: some View {
        if let goods = event.goods {
            cardRow(goods, market: event.market)
            wide("Tell the truth · about \(money(event.market))", primary: true) { session.priceCheckHonest() }
            let low = session.priceCheckLowball
            wide("Say it's worth \(money(low)), and offer that", tint: Theme.orange) { session.priceCheckLowballBuy() }
                .disabled(!store.canAfford(low))
            hint("The truth earns reputation, and they may sell it to you at a fair price. A lowball is a lie, and they can find out.")
            pass("No idea, sorry")
        }
    }

    @ViewBuilder private var tradeUp: some View {
        if let goods = event.goods {
            header("THEY GIVE")
            cardRow(goods, market: event.market)
            if event.looksOff { LooksOffLine(sealed: false) }
            header("THEY WANT")
            ForEach(event.wants) { item in
                HStack {
                    ItemLine(item: item)
                    Spacer()
                    Text(money(item.market)).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
            }
            Text("Your items: \(money(event.wants.reduce(0) { $0 + $1.market })) at market. Their slab: \(money(event.market)).")
                .font(.caption.monospaced()).foregroundStyle(Theme.muted)
            wide("Trade", primary: true) { session.answerTradeUp(accept: true) }
            if !event.asked {
                wide("Ask them to add 10% cash") { session.answerTradeUp(accept: true, askCash: true) }
            }
            pass("No thanks")
        }
    }

    @ViewBuilder private var tradeIn: some View {
        if let item = event.item {
            header("THEY WANT")
            ItemLine(item: item)
            Text("Your price \(money(session.asking(item)))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
            header("THEIR CARDS · \(money(event.cardsMarket)) AT MARKET")
            ForEach(event.cards) { card in
                HStack {
                    Text(card.print.name).font(.caption)
                    if card.looksOff { Tag(text: "LOOKS OFF", color: Theme.orange) }
                    Spacer()
                    WearText(wear: card.condition.wear)
                    Text(money(card.market)).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
            }
            HStack(spacing: 8) {
                ForEach(Balance.tradeInRates, id: \.self) { rate in
                    Button { withAnimation { session.answerTradeIn(rate: rate) } } label: {
                        VStack(spacing: 2) {
                            Text("\(Int(rate * 100))%").font(.subheadline.weight(.semibold))
                            Text(money(ShowSession.round(event.cardsMarket * rate))).font(.caption2.monospaced())
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(Theme.cyan)
                }
            }
            hint("The credit goes toward the item. They pay the rest in cash, or keep the extra as store credit. Under their lowest rate, they ask once for more.")
            pass("No trade-ins today")
        }
    }

    // MARK: - Parts

    private func header(_ text: String) -> some View {
        Text(text).font(.system(size: 10, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
    }

    private func hint(_ text: String) -> some View {
        Text(text).font(.caption2).foregroundStyle(Theme.muted)
    }

    private func cardRow(_ goods: VendorGoods, market: Double) -> some View {
        HStack(alignment: .top, spacing: 12) {
            GoodsThumb(goods: goods).frame(width: 56, height: 78)
            VStack(alignment: .leading, spacing: 4) {
                Text(VendorItem(goods: goods, price: 0, market: nil).name).font(.subheadline.weight(.semibold))
                GoodsDetail(goods: goods, tool: store.data.centeringTool)
                Text("market \(money(market))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
            }
        }
    }

    private func wide(_ title: String, primary: Bool = false, tint: Color = Theme.cyan, action: @escaping () -> Void) -> some View {
        Group {
            if primary {
                Button { withAnimation { action() } } label: { Text(title).frame(maxWidth: .infinity) }
                    .primaryButton()
                    .tint(tint)
            } else {
                Button { withAnimation { action() } } label: { Text(title).frame(maxWidth: .infinity) }
                    .buttonStyle(.bordered)
                    .tint(tint)
            }
        }
        .controlSize(.large)
    }

    private func pass(_ title: String) -> some View {
        Button(title) { withAnimation { session.decline() } }
            .font(.subheadline)
            .foregroundStyle(Theme.muted)
            .frame(maxWidth: .infinity)
    }
}

/// The special orders and the holds from the counter, on the store screen (Model/CounterEvents.swift).
struct OrdersAndHoldsBox: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let orders = store.specialOrders.sorted { $0.dueDay < $1.dueDay }
        let holds = store.storeHolds.sorted { $0.dueDay < $1.dueDay }
        if !orders.isEmpty || !holds.isEmpty {
            DetailBox(title: "Orders and holds") {
                ForEach(orders) { o in
                    let found = store.orderMatch(o) != nil
                    HStack(alignment: .top) {
                        Image(systemName: found ? "checkmark.circle.fill" : "magnifyingglass")
                            .foregroundStyle(found ? Theme.green : Theme.orange)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(o.print.name) · \(SetLibrary.set(o.slug).name)").font(.subheadline).lineLimit(2)
                            Text("for \(o.customer) · due day \(o.dueDay + 1) · \(found ? "in hand, sells tonight" : "not found yet")")
                                .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Text(money(o.price)).font(.subheadline.monospaced())
                    }
                }
                ForEach(holds) { h in
                    HStack(alignment: .top) {
                        Image(systemName: "tag").foregroundStyle(Theme.cyan)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(h.name).font(.subheadline).lineLimit(2)
                            Text("held for \(h.customer) · to day \(h.dueDay + 1) · \(money(h.deposit)) paid")
                                .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Text(money(h.price)).font(.subheadline.monospaced())
                    }
                }
                Text("A special order sells at the end of the day when the card is in your Inventory or in the store. A held item stays off sale until its customer comes back or the hold ends. Take it back from the shelf to cancel the hold and refund the deposit.")
                    .font(.caption).foregroundStyle(Theme.muted)
            }
        }
    }
}
