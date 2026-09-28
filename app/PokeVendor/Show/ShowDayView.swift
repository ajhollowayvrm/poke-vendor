import SwiftUI

/// One day at a card show: set up the table, deal with buyers, walk the floor, then the summary
/// (docs/20-card-shows.md).
struct ShowDayView: View {
    @Environment(GameStore.self) private var store
    @State private var session: ShowSession
    @State private var rip: RipSession?
    let onClose: () -> Void

    init(show: CardShow, store: GameStore, onClose: @escaping () -> Void) {
        _session = State(initialValue: ShowSession(show: show, store: store))
        self.onClose = onClose
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Group {
                switch session.phase {
                case .setup: SetupStage(session: session)
                case .table: TableStage(session: session)
                case .floor: FloorStage(session: session)
                case .summary: SummaryStage(session: session, onDone: finish)
                }
            }
            .frame(maxHeight: .infinity)
        }
        .background(Theme.background.ignoresSafeArea())
        .overlay(alignment: .bottom) {
            if let note = session.note {
                Text(note)
                    .font(.subheadline)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(.black.opacity(0.8), in: Capsule())
                    .padding(.bottom, 110)
                    .transition(.opacity)
                    .task(id: note) {
                        try? await Task.sleep(for: .seconds(2))
                        withAnimation { session.note = nil }
                    }
            }
        }
        .animation(.easeInOut(duration: 0.25), value: session.phase)
        .sheet(item: Bindable(session).reveal) { MysteryRevealView(reveal: $0) }
        .fullScreenCover(item: $rip) { rip in
            RipView(items: rip.items, store: store) { self.rip = nil }
        }
        .overlay(alignment: .bottom) {
            if let item = session.justBought {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Bought").font(.caption).foregroundStyle(Theme.muted)
                        Text(item.name).font(.subheadline.weight(.semibold)).lineLimit(1)
                    }
                    Spacer()
                    Button("Later") { withAnimation { session.justBought = nil } }
                        .buttonStyle(.bordered)
                    Button("Rip it now") {
                        if let ready = session.ripJustBought() { rip = RipSession(items: [ready]) }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.cyan)
                    .foregroundStyle(.black)
                }
                .controlSize(.small)
                .padding(12)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.cyan.opacity(0.5)))
                .padding(.horizontal, 16)
                .padding(.bottom, 96)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: session.justBought?.id)
        .onAppear {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("open"), session.phase == .setup { session.openTable() }
            let args = ProcessInfo.processInfo.arguments
            if args.contains("floor") { session.walkFloor() }
            for kind in ["seller", "trader", "naive"] where args.contains(kind) { session.debugVisitor(kind) }
            if args.contains("buysealed"), let v = session.vendors.first(where: { $0.kind == .gameShop }),
               let item = v.items.first(where: { if case .sealed(let p) = $0.goods { return p.market < 80 }; return false }) {
                session.walkFloor()
                session.visit(v)
                session.buy(item, from: v)
            }
            if args.contains("approach") {
                session.walkFloor()
                session.debugVisitor("approach")
            }
            // Screenshot aids: `vintage` opens a vintage dealer, and `mystery` buys a vintage mystery pack.
            if args.contains("vintage"), let v = session.vendors.first(where: { $0.kind == .vintageDealer }) {
                session.walkFloor()
                session.visit(v)
            }
            if args.contains("mystery"), let v = session.vendors.first(where: { $0.kind == .mysteryPacks }),
               let item = v.items.first(where: { if case .mystery(let p) = $0.goods { return p.tier == .vintage }; return false }) {
                session.walkFloor()
                session.visit(v)
                session.buy(item, from: v)
            }
            #endif
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(session.show.name).font(.headline)
                    Text("\(session.show.size.label)\(session.show.size.days > 1 ? " · day \(session.dayIndex + 1) of 2" : "") · \(session.hasTable ? "your table" : "walk-in")")
                        .font(.caption.monospaced())
                        .foregroundStyle(Theme.muted)
                }
                Spacer()
                Text(session.clock)
                    .font(.system(size: 20, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Theme.cyan)
            }
            ProgressView(value: min(1, session.minute / session.closeMinute))
                .tint(Theme.cyan)
            HStack(spacing: 0) {
                StatCell(label: "Sold", value: money(session.soldTotal), color: Theme.green)
                StatCell(label: "Bought", value: money(session.boughtTotal))
                StatCell(label: "Cash", value: money(store.cash))
            }
        }
        .padding(16)
        .background(Theme.surface)
    }

    private func finish() {
        store.finishShowDay(session.show, sold: session.soldTotal, bought: session.boughtTotal,
                            count: session.sold.count + session.bought.count + session.trades.count)
        onClose()
    }
}

// MARK: - Setup

private struct SetupStage: View {
    @Environment(GameStore.self) private var store
    let session: ShowSession

    var body: some View {
        let items = session.stockItems
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Set up your table").font(.title3.bold())
                    Text("Pick what to bring, and set your prices. Buyers haggle, so a markup leaves room to come down.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("PRICE").font(.system(size: 11, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
                        Picker("Price", selection: Bindable(session).markup) {
                            Text("90%").tag(0.9)
                            Text("Market").tag(1.0)
                            Text("110%").tag(1.10)
                            Text("125%").tag(1.25)
                        }
                        .pickerStyle(.segmented)
                    }
                    if items.isEmpty {
                        Text("You have nothing to sell. Kept items, listed items, and items at a grader stay home.")
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                    }
                    HStack {
                        Text("BRING · \(session.bring.count) of \(items.count)")
                            .font(.system(size: 11, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
                        Spacer()
                        Button(session.bring.count == items.count ? "None" : "All") {
                            session.bring = session.bring.count == items.count ? [] : Set(items.map(\.id))
                        }
                        .font(.caption.weight(.semibold))
                    }
                    let cards = items.filter { $0.kind == .card }
                    if !cards.isEmpty {
                        TitledGroup(title: "Singles and slabs", count: cards.count, list: "show") {
                            ForEach(cards) { item in bringRow(item) }
                        }
                    }
                    ForEach(SetLibrary.grouped(items.filter { $0.kind == .sealed }, by: { $0.setSlug }), id: \.slug) { group in
                        SetGroup(slug: group.slug, count: group.items.count, list: "show") {
                            ForEach(group.items) { item in bringRow(item) }
                        }
                    }
                }
                .padding(16)
            }
            HStack(spacing: 10) {
                Button("Walk the floor") { session.walkFloor() }
                    .buttonStyle(.bordered)
                Button { session.openTable() } label: { Text("Open the table").frame(maxWidth: .infinity) }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.cyan)
                    .foregroundStyle(.black)
                    .disabled(session.bring.isEmpty)
            }
            .controlSize(.large)
            .padding(16)
        }
    }

    private func bringRow(_ item: ShowItem) -> some View {
        Button {
            if session.bring.contains(item.id) { session.bring.remove(item.id) } else { session.bring.insert(item.id) }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: session.bring.contains(item.id) ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(session.bring.contains(item.id) ? Theme.cyan : Theme.muted)
                ItemLine(item: item)
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(money(session.asking(item))).font(.subheadline.monospaced())
                    Text("mkt \(money(item.market))").font(.caption2.monospaced()).foregroundStyle(Theme.muted)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Table

private struct TableStage: View {
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
                    Text("\(session.table.count) item\(session.table.count == 1 ? "" : "s") on the table · \(session.missed) visitor\(session.missed == 1 ? "" : "s") missed")
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
                Button("Walk the floor") { withAnimation { session.walkFloor() } }
                    .buttonStyle(.bordered)
                Button("Pack up") { withAnimation { session.packUp() } }
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
private struct CounterSlider: View {
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
private struct TradeSlider: View {
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
private struct DealButtons: View {
    @Environment(GameStore.self) private var store
    let session: ShowSession
    let visitor: Visitor

    var body: some View {
        VStack(spacing: 8) {
            switch visitor.intent {
            case .buy:
                let market = visitor.item?.market ?? visitor.offer
                primary("Sell for \(money(visitor.offer))", color: Theme.green) { session.accept() }
                CounterSlider(market: market, offer: visitor.offer, range: 50...150, startAbove: true,
                              verb: "Counter", passTitle: "Decline", pass: { session.decline() }) { session.counter($0) }
                    .id(visitor.id)
            case .trade:
                primary("Accept the trade", color: Theme.green) { session.accept() }
                TradeSlider(session: session, visitor: visitor).id(visitor.id)
            case .sell:
                primary("Buy for \(money(visitor.offer))", color: Theme.cyan) { session.accept() }
                    .disabled(!store.canAfford(visitor.offer))
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

    private func primary(_ title: String, color: Color, action: @escaping () -> Void) -> some View {
        Button { withAnimation { action() } } label: { Text(title).frame(maxWidth: .infinity) }
            .buttonStyle(.borderedProminent)
            .tint(color)
            .foregroundStyle(.black)
    }

    private func secondary(_ title: String, action: @escaping () -> Void) -> some View {
        Button { withAnimation { action() } } label: { Text(title).frame(maxWidth: .infinity) }
            .buttonStyle(.bordered)
    }
}

private struct VisitorCard: View {
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
        .overlay(Rectangle().stroke(Theme.line))
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

/// The image of something for sale: a card, a slab, sealed product, or a mystery pack.
private struct GoodsThumb: View {
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

// MARK: - Floor

private struct FloorStage: View {
    let session: ShowSession

    @Environment(GameStore.self) private var store

    var body: some View {
        ZStack {
            if let vendor = session.openVendor {
                VendorStage(session: session, vendor: vendor)
                    .transition(.move(edge: .trailing))
            } else {
                FloorList(session: session)
                    .transition(.move(edge: .leading))
            }
            // Someone stops the player on the way to a table.
            if let approach = session.approach {
                Color.black.opacity(0.6).ignoresSafeArea()
                VStack(spacing: 0) {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Someone stops you").font(.headline).padding(.top, 8)
                            VisitorCard(visitor: approach, asking: nil, tool: store.data.centeringTool)
                        }
                        .padding(16)
                    }
                    DealButtons(session: session, visitor: approach)
                }
                .background(Theme.background)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: session.approach?.id)
    }
}

private struct FloorList: View {
    @Environment(GameStore.self) private var store
    let session: ShowSession

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    Text("The floor · \(session.vendors.count) tables").font(.title3.bold())
                    Text("Each table is a dealer, a shop, or a person. Looking over a table takes about \(Int(Balance.vendorVisitMinutes)) minutes\(session.hasTable ? ", and buyers who come to your table meanwhile leave" : "").")
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                    ForEach(session.vendors) { vendor in
                        Button { withAnimation(.easeInOut(duration: 0.25)) { session.visit(vendor) } } label: {
                            HStack(spacing: 12) {
                                Image(systemName: vendor.kind.icon)
                                    .frame(width: 36, height: 36)
                                    .background((vendor.kind == .vintageDealer ? Color(red: 1, green: 0.8, blue: 0.3) : Theme.cyan).opacity(0.15),
                                                in: RoundedRectangle(cornerRadius: 8))
                                    .foregroundStyle(vendor.kind == .vintageDealer ? Color(red: 1, green: 0.8, blue: 0.3) : Theme.cyan)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(vendor.name).font(.subheadline.weight(.semibold))
                                    Text(vendor.kind.label).font(.caption).foregroundStyle(Theme.muted)
                                    Text(vendor.tags).font(.caption2.monospaced()).foregroundStyle(Theme.muted).lineLimit(1)
                                }
                                Spacer()
                                if let id = vendor.contactID {
                                    LevelBadge(level: store.level(id))
                                }
                                if vendor.visited {
                                    Text("SEEN").font(.system(size: 9, weight: .bold, design: .monospaced)).foregroundStyle(Theme.muted)
                                }
                                Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.muted)
                            }
                            .padding(12)
                            .background(Theme.surface)
                            .overlay(Rectangle().stroke(Theme.line))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(16)
            }
            HStack(spacing: 10) {
                if session.hasTable {
                    Button { withAnimation { session.backToTable() } } label: {
                        Text(session.opened ? "Back to my table" : "Set up the table").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.cyan)
                    .foregroundStyle(.black)
                } else {
                    Button { withAnimation { session.packUp() } } label: { Text("Leave the show").frame(maxWidth: .infinity) }
                        .buttonStyle(.borderedProminent)
                        .tint(Theme.cyan)
                        .foregroundStyle(.black)
                }
            }
            .controlSize(.large)
            .padding(16)
        }
    }
}

private struct VendorStage: View {
    @Environment(GameStore.self) private var store
    let session: ShowSession
    let vendor: Vendor
    @State private var tab: Aisle = .singles

    private enum Aisle: String, CaseIterable { case singles = "Singles", sealed = "Sealed" }

    /// Singles and slabs, or sealed product and mystery packs.
    private func inAisle(_ item: VendorItem, _ aisle: Aisle) -> Bool {
        switch item.goods {
        case .single, .slab: aisle == .singles
        case .sealed, .mystery: aisle == .sealed
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 10) {
                        Image(systemName: vendor.kind.icon).font(.title2).foregroundStyle(Theme.cyan)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(vendor.name).font(.title3.bold())
                            Text(vendor.kind.label).font(.subheadline).foregroundStyle(Theme.muted)
                        }
                    }
                    Text(vendor.kind.tagline).font(.subheadline).foregroundStyle(Theme.muted)
                    if let id = vendor.contactID {
                        HStack(spacing: 6) {
                            LevelBadge(level: store.level(id))
                            if let memory = store.contact(id)?.memory.first {
                                Text("Last time: \(memory)").font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                            }
                        }
                    }
                    let saved = session.saved(at: vendor)
                    if !saved.isEmpty {
                        TitledGroup(title: "Saved for you", count: saved.count, list: "show") {
                            ForEach(saved) { item in
                                HStack(alignment: .top, spacing: 10) {
                                    GoodsImage(item: VendorItem(goods: item.goods, price: item.price, market: item.market))
                                        .frame(width: 44, height: 62)
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(item.name).font(.subheadline.weight(.semibold))
                                        GoodsDetail(goods: item.goods, tool: store.data.centeringTool)
                                        Text("mkt \(money(item.market))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                                    }
                                    Spacer()
                                    Button(money(item.price)) { withAnimation { session.pickUp(item) } }
                                        .buttonStyle(.borderedProminent)
                                        .tint(Theme.green)
                                        .foregroundStyle(.black)
                                        .controlSize(.small)
                                        .disabled(!store.canAfford(item.price))
                                }
                                .padding(12)
                            }
                        }
                        .overlay(Rectangle().stroke(Theme.green.opacity(0.5)))
                    }
                    Picker("Aisle", selection: $tab) {
                        ForEach(Aisle.allCases, id: \.self) { aisle in
                            Text("\(aisle.rawValue) · \(vendor.items.filter { inAisle($0, aisle) }.count)").tag(aisle)
                        }
                    }
                    .pickerStyle(.segmented)
                    let shown = vendor.items.filter { inAisle($0, tab) }
                    if shown.isEmpty {
                        Text(tab == .singles ? "No singles left at this table." : "No sealed product left at this table.")
                            .font(.subheadline).foregroundStyle(Theme.muted)
                    }
                    if tab == .sealed {
                        // Sealed shows by set, newest set first. Mystery packs have no set, so they come first.
                        let mystery = shown.filter { if case .mystery = $0.goods { return true }; return false }
                        if !mystery.isEmpty {
                            TitledGroup(title: "Mystery packs", count: mystery.count, list: "show") {
                                ForEach(mystery) { item in row(item) }
                            }
                        }
                        let sealed = shown.filter { if case .sealed = $0.goods { return true }; return false }
                        ForEach(SetLibrary.grouped(sealed, by: { item in
                            if case .sealed(let p) = item.goods { return p.homeSlug }
                            return ""
                        }), id: \.slug) { group in
                            SetGroup(slug: group.slug, count: group.items.count, list: "show") {
                                ForEach(group.items) { item in row(item) }
                            }
                        }
                    } else {
                        ForEach(shown) { item in row(item) }
                    }
                }
                .padding(16)
            }
            Button { withAnimation(.easeInOut(duration: 0.25)) { session.closeVendor() } } label: {
                Label("Back to the floor", systemImage: "chevron.left").frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .padding(16)
        }
    }

    private func row(_ item: VendorItem) -> some View {
        GoodsRow(item: item, tool: store.data.centeringTool, canAfford: store.canAfford(item.price),
                 buy: { withAnimation { session.buy(item, from: vendor) } },
                 ask: { session.askForDeal(item, from: vendor) })
    }
}

private struct GoodsRow: View {
    let item: VendorItem
    let tool: Int
    let canAfford: Bool
    let buy: () -> Void
    let ask: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            GoodsImage(item: item).frame(width: 56, height: 78)
            VStack(alignment: .leading, spacing: 4) {
                Text(item.name).font(.subheadline.weight(.semibold)).lineLimit(2)
                switch item.goods {
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
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(money(item.price)).font(.subheadline.monospaced().weight(.semibold))
                        .foregroundStyle((item.market ?? .infinity) > item.price ? Theme.green : Theme.text)
                    if let market = item.market {
                        Text("mkt \(money(market))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                    }
                }
                HStack(spacing: 8) {
                    Button(isMystery ? "Buy and open" : "Buy", action: buy)
                        .buttonStyle(.borderedProminent).tint(Theme.cyan).foregroundStyle(.black)
                        .disabled(!canAfford)
                    if !isMystery {
                        Button(item.askedForDeal ? "Asked" : "Ask for a deal", action: ask).buttonStyle(.bordered)
                            .disabled(item.askedForDeal)
                    }
                }
                .controlSize(.small)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(Theme.surface)
        .overlay(Rectangle().stroke(Theme.line))
    }

    private var isMystery: Bool {
        if case .mystery = item.goods { return true }
        return false
    }
}

struct GoodsImage: View {
    let item: VendorItem

    var body: some View {
        switch item.goods {
        case .sealed:
            ProductImage(url: item.image, setName: item.name).clipShape(RoundedRectangle(cornerRadius: 3))
        case .mystery(let pack):
            MysteryPackArt(pack: pack)
        case .slab:
            RemoteCardImage(url: item.image.flatMap(URL.init(string:)), name: "")
                .padding(4)
                .padding(.top, 10)
                .background(Color(white: 0.85), in: RoundedRectangle(cornerRadius: 4))
                .overlay(alignment: .top) {
                    Rectangle().fill(Color.red.opacity(0.85)).frame(height: 10)
                }
                .clipShape(RoundedRectangle(cornerRadius: 4))
        case .single:
            RemoteCardImage(url: item.image.flatMap(URL.init(string:)), name: "").clipShape(RoundedRectangle(cornerRadius: 3))
        }
    }
}

/// A plain repack: a sealed foil bag with a question mark.
struct MysteryPackArt: View {
    let pack: MysteryPack

    var body: some View {
        let colors: [Color] = switch pack.tier {
        case .modern: [.purple, .blue]
        case .vintage: [Color(red: 0.9, green: 0.6, blue: 0.1), Color(red: 0.6, green: 0.2, blue: 0.1)]
        case .slab: [Color(white: 0.6), Color(white: 0.3)]
        }
        ZStack {
            RoundedRectangle(cornerRadius: 4).fill(LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing))
            Image(systemName: "questionmark").font(.system(size: 26, weight: .black)).foregroundStyle(.white.opacity(0.9))
        }
    }
}

/// Opening a mystery pack: the filler cards turn over one by one, then the hit.
struct MysteryRevealView: View {
    @Environment(\.dismiss) private var dismiss
    let reveal: MysteryReveal
    @State private var shown = 0
    @State private var burst = false

    private var total: Int { reveal.filler.count + 1 }

    var body: some View {
        VStack(spacing: 16) {
            Text(reveal.pack.name).font(.title3.bold()).padding(.top, 36)
            Text("You paid \(money(reveal.price)).").font(.subheadline).foregroundStyle(Theme.muted)
            if !reveal.filler.isEmpty {
                HStack(spacing: 8) {
                    ForEach(Array(reveal.filler.enumerated()), id: \.offset) { i, print in
                        FlipCard(angle: i < shown ? 0 : 180, front: CardFace(card: RipCard(print: print, energy: nil)), back: CardBack())
                            .aspectRatio(63.0 / 88.0, contentMode: .fit)
                            .frame(width: 64, height: 89)
                    }
                }
                .frame(height: 89)
                .padding(.horizontal, 16)
            }
            FlipCard(angle: shown >= total ? 0 : 180, front: CardFace(card: RipCard(print: reveal.hit.print, energy: nil)), back: CardBack())
                .frame(width: 180, height: 251)
                .shadow(color: .black.opacity(0.5), radius: 12, y: 8)
                // An overlay, so the burst does not take up room in the layout.
                .overlay {
                    if burst {
                        SparkleBurst(tier: reveal.hit.market >= reveal.price ? .big : .small).frame(width: 500, height: 500)
                    }
                }
            if shown >= total {
                VStack(spacing: 4) {
                    Text(reveal.hit.print.name).font(.headline)
                    if let grade = reveal.hit.grade {
                        Text(grade.label).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.cyan)
                    } else {
                        RawLooks(condition: reveal.hit.condition)
                    }
                    Text("Worth \(money(reveal.hit.market))").font(.title3.monospaced().weight(.semibold))
                        .foregroundStyle(reveal.hit.market >= reveal.price ? Theme.green : Theme.orange)
                    Text(reveal.hit.market >= reveal.price ? "A win." : "Most mystery packs lose money.")
                        .font(.caption).foregroundStyle(Theme.muted)
                }
                .transition(.opacity)
            }
            Spacer()
            Button { dismiss() } label: { Text(shown >= total ? "Done" : "Skip").frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent)
                .tint(Theme.cyan)
                .foregroundStyle(.black)
                .controlSize(.large)
                .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .interactiveDismissDisabled(shown < total)
        .task {
            for i in 0..<total {
                try? await Task.sleep(for: .milliseconds(i == total - 1 ? 900 : 380))
                withAnimation(.easeInOut(duration: 0.45)) { shown = i + 1 }
                Haptics.tap(i == total - 1 ? .heavy : .light)
            }
            try? await Task.sleep(for: .milliseconds(250))
            burst = true
            if reveal.hit.market >= reveal.price { Haptics.hit() }
        }
    }
}

// MARK: - Summary

private struct SummaryStage: View {
    let session: ShowSession
    let onDone: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text(session.show.size.days > 1 && session.dayIndex == 0 ? "Day 1 is done" : "The show is over")
                        .font(.title2.bold())
                    if session.show.size.days > 1 && session.dayIndex == 0 {
                        Text("Come back tomorrow for day 2. End the day from the hub.").font(.subheadline).foregroundStyle(Theme.muted)
                    }
                    HStack(spacing: 0) {
                        StatCell(label: "Sold", value: money(session.soldTotal), color: Theme.green)
                        StatCell(label: "Bought", value: money(session.boughtTotal))
                        StatCell(label: "Net cash", value: signedMoney(session.soldTotal - session.boughtTotal),
                                 color: session.soldTotal >= session.boughtTotal ? Theme.green : Theme.orange)
                    }
                    list("SOLD", session.sold.map { ($0.name, money($0.price)) })
                    list("BOUGHT ON THE FLOOR", session.bought.map { ($0.name, money($0.price)) })
                    list("TRADES", session.trades.map { ($0, "") })
                    if session.hasTable {
                        Text("\(session.missed) buyer\(session.missed == 1 ? "" : "s") missed · \(session.walkedAway) walked away")
                            .font(.caption.monospaced())
                            .foregroundStyle(Theme.muted)
                    }
                }
                .padding(16)
            }
            Button(action: onDone) { Text("Head home").frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent)
                .tint(Theme.cyan)
                .foregroundStyle(.black)
                .controlSize(.large)
                .padding(16)
        }
    }

    @ViewBuilder
    private func list(_ title: String, _ rows: [(String, String)]) -> some View {
        if !rows.isEmpty {
            Text("\(title) · \(rows.count)").font(.system(size: 11, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack {
                    Text(row.0).font(.subheadline)
                    Spacer()
                    Text(row.1).font(.subheadline.monospaced())
                }
                .padding(.vertical, 6)
                .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
            }
        }
    }
}

// MARK: - Pieces

private struct ItemLine: View {
    @Environment(GameStore.self) private var store
    let item: ShowItem

    var body: some View {
        HStack(spacing: 10) {
            ItemImage(item: item).frame(width: 34, height: 47)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name).font(.subheadline).lineLimit(1)
                if let c = item.condition {
                    RawLooks(condition: c)
                } else {
                    Text(item.detail).font(.caption.monospaced()).foregroundStyle(Theme.muted).lineLimit(1)
                }
            }
        }
    }
}

private struct ItemImage: View {
    let item: ShowItem

    var body: some View {
        Group {
            if item.kind == .sealed {
                ProductImage(url: item.image, setName: item.name)
            } else {
                RemoteCardImage(url: item.image.flatMap(URL.init(string:)), name: "")
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 3))
    }
}
