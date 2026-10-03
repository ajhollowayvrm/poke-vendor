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

    /// Any venue: a meet, league night, a sale, or an opportunity.
    init(session: ShowSession, onClose: @escaping () -> Void) {
        _session = State(initialValue: session)
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
            // Screenshot aid: `modern` opens a modern dealer.
            if args.contains("modern"), let v = session.vendors.first(where: { $0.kind == .modernDealer }) {
                session.walkFloor()
                session.visit(v)
            }
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
                    Text(session.venue.name).font(.headline)
                    Text(session.venue.detail)
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
        store.finishEncounter(session)
        onClose()
    }
}

// MARK: - Setup

struct SetupStage: View {
    @Environment(GameStore.self) private var store
    let session: ShowSession

    var body: some View {
        let items = session.stockItems
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text(session.venue.isShow ? "Set up your table" : "Lay out your cards").font(.title3.bold())
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
                    PaymentPolicyPicker()
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
                if session.venue.hasFloor {
                    Button("Walk the floor") { session.walkFloor() }
                        .buttonStyle(.bordered)
                } else {
                    Button("Leave") { session.packUp() }
                        .buttonStyle(.bordered)
                }
                Button { session.openTable() } label: { Text(session.venue.isShow ? "Open the table" : "Start dealing").frame(maxWidth: .infinity) }
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
                CounterSlider(market: market, offer: visitor.offer, range: 50...150, startAbove: true,
                              verb: "Counter", passTitle: "Decline", pass: { session.decline() }) { session.counter($0) }
                    .id(visitor.id)
            case .trade:
                primary("Accept the trade", color: Theme.green) { session.accept() }
                TradeSlider(session: session, visitor: visitor).id(visitor.id)
            case .sell:
                primary("Buy for \(money(visitor.offer))", color: Theme.cyan) { session.accept() }
                    .disabled(!store.canAfford(visitor.offer))
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
                                .buttonStyle(.borderedProminent)
                                .foregroundStyle(.black)
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
struct LooksOffLine: View {
    let sealed: Bool

    var body: some View {
        Label(sealed ? "Looks off · the wrap seam is wrong" : "Looks off · soft cardstock, flat colors", systemImage: "eye.trianglebadge.exclamationmark")
            .font(.caption.weight(.semibold))
            .foregroundStyle(Theme.orange)
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

struct FloorStage: View {
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
    @State private var booth = false

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    if session.hasGradingBooth {
                        // On-site grading at a regional show (docs/20-card-shows.md).
                        Button { booth = true } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "seal").frame(width: 36, height: 36)
                                    .background(Theme.green.opacity(0.15), in: RoundedRectangle(cornerRadius: 8)).foregroundStyle(Theme.green)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("PSA grading booth").font(.subheadline.weight(.semibold))
                                    Text("\(money(Balance.onSiteGradingFee)) a card · the slab in hand the same day · about 20 minutes").font(.caption).foregroundStyle(Theme.muted)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.muted)
                            }
                            .padding(12)
                            .background(Theme.surface)
                            .overlay(Rectangle().stroke(Theme.green.opacity(0.5)))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .sheet(isPresented: $booth) { GradingBoothSheet(session: session) }
                    }
                    Text(session.venue.isShow ? "The floor · \(session.vendors.count) tables" : session.venue.name).font(.title3.bold())
                    Text(session.venue.isShow
                         ? "Each table is a dealer, a shop, or a person. Looking over a table takes about \(Int(Balance.vendorVisitMinutes)) minutes\(session.hasTable ? ", and buyers who come to your table meanwhile leave" : "")."
                         : "Look over what is out. A look takes about \(Int(Balance.vendorVisitMinutes)) minutes. The seller may come up to you.")
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
                    Button { withAnimation { session.packUp() } } label: {
                        Text(session.venue.isShow ? "Leave the show" : "Leave").frame(maxWidth: .infinity)
                    }
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

struct VendorStage: View {
    @Environment(GameStore.self) private var store
    let session: ShowSession
    let vendor: Vendor
    @State private var tab: Aisle = .singles
    @State private var trading = false

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
                    if vendor.kind.trades {
                        Button { trading = true } label: {
                            Label("Trade with \(vendor.name)", systemImage: "arrow.left.arrow.right").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .tint(Theme.cyan)
                        .controlSize(.large)
                    }
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
                    let firstLook = vendor.items.filter(\.firstLook)
                    if !firstLook.isEmpty {
                        // Reputation Trusted: a first look before the public table (docs/04).
                        TitledGroup(title: "First look · for you, before the table opens", count: firstLook.count, list: "show") {
                            ForEach(firstLook) { item in row(item) }
                        }
                        .overlay(Rectangle().stroke(Theme.cyan.opacity(0.5)))
                    }
                    Picker("Aisle", selection: $tab) {
                        ForEach(Aisle.allCases, id: \.self) { aisle in
                            Text("\(aisle.rawValue) · \(vendor.items.filter { inAisle($0, aisle) && !$0.firstLook }.count)").tag(aisle)
                        }
                    }
                    .pickerStyle(.segmented)
                    let shown = vendor.items.filter { inAisle($0, tab) && !$0.firstLook }
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
        .sheet(isPresented: $trading) { VendorTradeSheet(session: session, vendorID: vendor.id) }
        .onAppear {
            #if DEBUG
            // Screenshot aid: `tradesheet` opens the trade sheet.
            if ProcessInfo.processInfo.arguments.contains("tradesheet"), vendor.kind.trades { trading = true }
            #endif
        }
    }

    private func row(_ item: VendorItem) -> some View {
        GoodsRow(item: item, tool: store.data.centeringTool, canAfford: store.canAfford(item.price),
                 buy: { withAnimation { session.buy(item, from: vendor) } },
                 ask: { session.askForDeal(item, from: vendor) })
    }
}

/// A trade with one vendor: items from their table for items from the player's stock, with cash to even the deal.
private struct VendorTradeSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let session: ShowSession
    let vendorID: UUID
    @State private var give: Set<UUID> = []
    @State private var get: Set<UUID> = []

    private var vendor: Vendor? { session.vendors.first { $0.id == vendorID } }

    var body: some View {
        if let vendor {
            let theirs = vendor.items.filter { if case .mystery = $0.goods { return false }; return true }
            let mine = session.tradeStock
            // Items that left the table or the stock drop out of the picks.
            let giving = give.intersection(mine.map(\.id))
            let getting = get.intersection(theirs.map(\.id))
            let quote = session.tradeQuote(give: giving, get: getting, at: vendor)
            VStack(spacing: 0) {
                Text("Trade with \(vendor.name)").font(.title3.bold()).padding(16)
                ScrollView {
                    VStack(alignment: .leading, spacing: 10) {
                        TitledGroup(title: "From their table", count: theirs.count, list: "trade") {
                            ForEach(theirs) { item in
                                pick(selected: getting.contains(item.id), toggle: { flip(item.id, in: &get) }) {
                                    HStack(alignment: .top, spacing: 10) {
                                        GoodsImage(item: item).frame(width: 44, height: 62)
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(item.name).font(.subheadline.weight(.semibold)).lineLimit(2)
                                            GoodsDetail(goods: item.goods, tool: store.data.centeringTool)
                                            if item.looksOff { LooksOffLine(sealed: item.isSealed) }
                                        }
                                        Spacer(minLength: 0)
                                        VStack(alignment: .trailing, spacing: 2) {
                                            Text(money(item.price)).font(.subheadline.monospaced())
                                            if let market = item.market {
                                                Text("mkt \(money(market))").font(.caption2.monospaced()).foregroundStyle(Theme.muted)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        TitledGroup(title: "From your stock", count: mine.count, list: "trade") {
                            ForEach(mine) { item in
                                pick(selected: giving.contains(item.id), toggle: { flip(item.id, in: &give) }) {
                                    HStack(spacing: 10) {
                                        ItemLine(item: item)
                                        Spacer(minLength: 0)
                                        VStack(alignment: .trailing, spacing: 2) {
                                            Text(money(session.tradeValue(item, at: vendor))).font(.subheadline.monospaced())
                                            Text("mkt \(money(item.market))").font(.caption2.monospaced()).foregroundStyle(Theme.muted)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                }
                footer(vendor, quote: quote, giving: giving, getting: getting)
            }
            .background(Theme.background)
            .onAppear {
                #if DEBUG
                debugPicks()
                #endif
            }
        }
    }

    private func footer(_ vendor: Vendor, quote: VendorTradeQuote, giving: Set<UUID>, getting: Set<UUID>) -> some View {
        VStack(spacing: 8) {
            HStack {
                Text("Their items").foregroundStyle(Theme.muted)
                Spacer()
                Text(money(quote.getValue)).monospaced()
            }
            HStack {
                Text("Your items at \(Int((quote.rate * 100).rounded()))%").foregroundStyle(Theme.muted)
                Spacer()
                Text(money(quote.giveValue)).monospaced()
            }
            HStack {
                Text(quote.cash < 0 ? "They add" : "You add").font(.headline)
                Spacer()
                Text(money(abs(quote.cash))).font(.headline.monospaced())
                    .foregroundStyle(quote.cash < 0 ? Theme.green : Theme.text)
            }
            if let problem = quote.problem {
                Text(problem).font(.caption).foregroundStyle(Theme.orange).frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(spacing: 10) {
                Button(vendor.askedForRate ? "Asked" : "Ask for a better rate") { session.askForBetterRate(at: vendor) }
                    .buttonStyle(.bordered)
                    .disabled(vendor.askedForRate)
                Button { propose(vendor, giving: giving, getting: getting) } label: {
                    Text("Propose").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.cyan)
                .foregroundStyle(.black)
                .disabled(quote.problem != nil)
            }
            .controlSize(.large)
            Button("Close") { dismiss() }.font(.subheadline).foregroundStyle(Theme.muted)
        }
        .font(.subheadline)
        .padding(16)
        .background(Theme.surface)
        .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
    }

    #if DEBUG
    /// Screenshot aid: `tradesheet` picks the two best items of the player and the cheapest item of the vendor.
    private func debugPicks() {
        guard ProcessInfo.processInfo.arguments.contains("tradesheet"), let vendor else { return }
        give = Set(session.tradeStock.filter { $0.market >= Balance.tradeMinItem }.prefix(2).map(\.id))
        if let item = vendor.items.filter({ if case .mystery = $0.goods { return false }; return true }).min(by: { $0.price < $1.price }) {
            get = [item.id]
        }
    }
    #endif

    private func propose(_ vendor: Vendor, giving: Set<UUID>, getting: Set<UUID>) {
        let done = withAnimation { session.proposeVendorTrade(give: giving, get: getting, at: vendor) }
        if done { dismiss() }
    }

    private func flip(_ id: UUID, in set: inout Set<UUID>) {
        if set.contains(id) { set.remove(id) } else { set.insert(id) }
    }

    /// One row with a check mark. The row toggles its pick when tapped.
    private func pick<Label: View>(selected: Bool, toggle: @escaping () -> Void, @ViewBuilder label: () -> Label) -> some View {
        Button(action: toggle) {
            HStack(spacing: 10) {
                Image(systemName: selected ? "checkmark.circle.fill" : "circle").foregroundStyle(selected ? Theme.cyan : Theme.muted)
                label()
            }
            .padding(12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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
                if item.looksOff { LooksOffLine(sealed: item.isSealed) }
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
                    let twoDay = (session.show?.size.days ?? 1) > 1 && session.dayIndex == 0
                    Text(twoDay ? "Day 1 is done" : session.venue.isShow ? "The show is over"
                         : session.venue.kind == .store ? "Closing time at \(session.venue.name)" : "\(session.venue.name) is over")
                        .font(.title2.bold())
                    if twoDay {
                        Text("Come back tomorrow for day 2. End the day from the hub.").font(.subheadline).foregroundStyle(Theme.muted)
                    }
                    HStack(spacing: 0) {
                        StatCell(label: "Sold", value: money(session.soldTotal), color: Theme.green)
                        StatCell(label: "Bought", value: money(session.boughtTotal))
                        StatCell(label: "Net cash", value: signedMoney(session.soldTotal - session.boughtTotal),
                                 color: session.soldTotal >= session.boughtTotal ? Theme.green : Theme.orange)
                    }
                    if let theft = session.theftLine {
                        Text(theft).font(.subheadline).foregroundStyle(Theme.orange)
                    }
                    list("SOLD", session.sold.map { ($0.name, money($0.price)) })
                    list(session.venue.isShow ? "BOUGHT ON THE FLOOR" : "BOUGHT", session.bought.map { ($0.name, money($0.price)) })
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

struct ItemLine: View {
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

struct ItemImage: View {
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
