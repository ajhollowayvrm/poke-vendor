import SwiftUI

/// One day at a card show: set up the table, deal with buyers, walk the floor, then the summary
/// (docs/20-card-shows.md).
struct ShowDayView: View {
    @Environment(GameStore.self) private var store
    @State private var session: ShowSession
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
        .onAppear {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("open"), session.phase == .setup { session.openTable() }
            if ProcessInfo.processInfo.arguments.contains("floor") { session.walkFloor(charge: false) }
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
                    ForEach(items) { item in
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
                .padding(16)
            }
            HStack(spacing: 10) {
                Button("Walk the floor") { session.walkFloor(charge: false) }
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
}

// MARK: - Table

private struct TableStage: View {
    @Environment(GameStore.self) private var store
    let session: ShowSession

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 14) {
                    if let buyer = session.buyer {
                        BuyerCard(buyer: buyer, asking: session.asking(buyer.item), tool: store.data.centeringTool)
                            .id(buyer.id)
                            .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                                    removal: .move(edge: .leading).combined(with: .opacity)))
                    } else {
                        Text("No one at your table.").font(.subheadline).foregroundStyle(Theme.muted).padding(.top, 40)
                    }
                    Text("\(session.table.count) item\(session.table.count == 1 ? "" : "s") on the table · \(session.missed) buyer\(session.missed == 1 ? "" : "s") missed")
                        .font(.caption.monospaced())
                        .foregroundStyle(Theme.muted)
                }
                .padding(16)
                .animation(.spring(response: 0.4, dampingFraction: 0.85), value: session.buyer?.id)
            }
            if let buyer = session.buyer {
                dealButtons(buyer)
            }
            HStack(spacing: 10) {
                Button("Walk the floor · 1 hr") { withAnimation { session.walkFloor() } }
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

    private func dealButtons(_ buyer: Buyer) -> some View {
        let ask = session.asking(buyer.item)
        let middle = ShowSession.round((buyer.offer + ask) / 2)
        return VStack(spacing: 8) {
            Button { withAnimation { session.accept() } } label: {
                Text(buyer.trade != nil ? "Accept the trade" : "Accept \(money(buyer.offer))").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.green)
            .foregroundStyle(.black)
            HStack(spacing: 8) {
                if buyer.offer < ask {
                    if middle > buyer.offer && middle < ask {
                        Button { withAnimation { session.counter(middle) } } label: {
                            Text("Counter \(money(middle))").frame(maxWidth: .infinity)
                        }
                    }
                    Button { withAnimation { session.counter(ask) } } label: {
                        Text("Ask \(money(ask))").frame(maxWidth: .infinity)
                    }
                }
                Button { withAnimation { session.decline() } } label: { Text("Decline").frame(maxWidth: .infinity) }
            }
            .buttonStyle(.bordered)
        }
        .controlSize(.large)
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
    }
}

private struct BuyerCard: View {
    let buyer: Buyer
    let asking: Double
    let tool: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: buyer.type.icon)
                    .font(.title3)
                    .frame(width: 40, height: 40)
                    .background(Theme.cyan.opacity(0.15), in: Circle())
                    .foregroundStyle(Theme.cyan)
                VStack(alignment: .leading, spacing: 1) {
                    Text(buyer.name).font(.headline)
                    Text(buyer.type.label).font(.caption).foregroundStyle(Theme.muted)
                }
                Spacer()
                HStack(spacing: 3) {
                    ForEach(0..<3, id: \.self) { i in
                        Circle().fill(i <= buyer.patience ? Theme.orange : Theme.line).frame(width: 7, height: 7)
                    }
                }
                .accessibilityLabel("Patience")
            }
            HStack(alignment: .top, spacing: 12) {
                ItemImage(item: buyer.item).frame(width: 64, height: 89)
                VStack(alignment: .leading, spacing: 4) {
                    Text(buyer.item.name).font(.subheadline.weight(.semibold))
                    Text(buyer.item.detail).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                    if let c = buyer.item.condition {
                        HStack(spacing: 6) {
                            WearText(wear: c.wear)
                            Text("·").font(.caption).foregroundStyle(Theme.muted)
                            CutLine(reading: .front(c.cut, tool: tool))
                        }
                    }
                    Text("Your price \(money(asking)) · market \(money(buyer.item.market))")
                        .font(.caption.monospaced())
                        .foregroundStyle(Theme.muted)
                }
            }
            Text("“\(buyer.line)”")
                .font(.body.italic())
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.background, in: RoundedRectangle(cornerRadius: 10))
            if let trade = buyer.trade {
                HStack(spacing: 12) {
                    RemoteCardImage(url: trade.card.print.image.flatMap(URL.init(string:)), name: "")
                        .aspectRatio(63.0 / 88.0, contentMode: .fit)
                        .frame(width: 48)
                        .clipShape(RoundedRectangle(cornerRadius: 3))
                    VStack(alignment: .leading, spacing: 3) {
                        Text("THEY OFFER").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.muted)
                        Text(trade.card.print.name).font(.subheadline.weight(.semibold))
                        HStack(spacing: 6) {
                            WearText(wear: trade.card.condition.wear)
                            Text("mkt \(money(trade.card.market))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        }
                        if trade.cash > 0 {
                            Text("plus \(money(trade.cash)) cash").font(.caption.monospaced()).foregroundStyle(Theme.green)
                        }
                    }
                }
            } else {
                HStack(alignment: .firstTextBaseline) {
                    Text("OFFER").font(.system(size: 11, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
                    Spacer()
                    Text(money(buyer.offer)).font(.system(size: 28, weight: .bold, design: .monospaced))
                        .foregroundStyle(buyer.offer >= asking ? Theme.green : Theme.text)
                        .contentTransition(.numericText())
                }
            }
        }
        .padding(16)
        .background(Theme.surface)
        .overlay(Rectangle().stroke(Theme.line))
    }
}

// MARK: - Floor

private struct FloorStage: View {
    @Environment(GameStore.self) private var store
    let session: ShowSession

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("On the floor").font(.title3.bold())
                    Text("Vendor tables. Some price under market, and some over. Asking for a deal works about half the time.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                    ForEach(session.floor) { listing in
                        FloorRow(listing: listing, tool: store.data.centeringTool,
                                 canAfford: store.canAfford(listing.price),
                                 buy: { session.buyOnFloor(listing) },
                                 ask: { session.askForDeal(listing) })
                    }
                    if session.floor.isEmpty {
                        Text("You bought everything in this aisle.").font(.subheadline).foregroundStyle(Theme.muted)
                    }
                }
                .padding(16)
            }
            HStack(spacing: 10) {
                Button("Next aisle · 1 hr") { withAnimation { session.walkFloor() } }
                    .buttonStyle(.bordered)
                    .disabled(session.isOver)
                if session.hasTable {
                    Button { withAnimation { session.backToTable() } } label: {
                        Text(session.opened ? "Back to my table" : "Set up the table")
                            .frame(maxWidth: .infinity)
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

private struct FloorRow: View {
    let listing: FloorListing
    let tool: Int
    let canAfford: Bool
    let buy: () -> Void
    let ask: () -> Void

    var body: some View {
        let deal = listing.price < listing.market
        HStack(alignment: .top, spacing: 12) {
            RemoteCardImage(url: listing.print.image.flatMap(URL.init(string:)), name: "")
                .aspectRatio(63.0 / 88.0, contentMode: .fit)
                .frame(width: 56)
                .clipShape(RoundedRectangle(cornerRadius: 3))
            VStack(alignment: .leading, spacing: 4) {
                Text(listing.print.name).font(.subheadline.weight(.semibold))
                Text("\(SetLibrary.set(listing.setSlug).name) · \(listing.print.rarity)")
                    .font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                HStack(spacing: 6) {
                    WearText(wear: listing.condition.wear)
                    Text("·").font(.caption).foregroundStyle(Theme.muted)
                    CutLine(reading: .front(listing.condition.cut, tool: tool))
                }
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(money(listing.price)).font(.subheadline.monospaced().weight(.semibold))
                        .foregroundStyle(deal ? Theme.green : Theme.text)
                    Text("mkt \(money(listing.market))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
                HStack(spacing: 8) {
                    Button("Buy", action: buy).buttonStyle(.borderedProminent).tint(Theme.cyan).foregroundStyle(.black)
                        .disabled(!canAfford)
                    Button(listing.askedForDeal ? "Asked" : "Ask for a deal", action: ask).buttonStyle(.bordered)
                        .disabled(listing.askedForDeal)
                }
                .controlSize(.small)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(Theme.surface)
        .overlay(Rectangle().stroke(Theme.line))
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
