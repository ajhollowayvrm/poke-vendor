import SwiftUI

/// The live stream: the clock, the viewers, the card on camera, chat, and the six actions
/// (docs/08-ui-direction.md, 5. Live stream). One real second is one stream minute.
struct StreamView: View {
    @Environment(GameStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase
    let session: StreamSession
    let onClose: () -> Void
    @State private var pick: PickMode?
    @State private var rip: RipSession?
    /// The product picked for a rip. The cover opens after the pick sheet is gone.
    @State private var pendingRip: SealedItem?
    /// A Rip & Ship case: the case sheet shows first, and the rip starts when it closes.
    @State private var buyerCase: CaseRequest?
    @State private var pendingShip: RipSession?
    @State private var confirmEnd = false

    enum PickMode: Identifiable {
        case show, giveaway, rip, auction, buyNow, ripShip
        var id: Int { hashValue }
    }

    var body: some View {
        Group {
            if session.ended {
                StreamSummaryView(session: session, onDone: onClose)
            } else {
                live
            }
        }
        .background(Theme.background.ignoresSafeArea())
        .task {
            while !session.ended {
                try? await Task.sleep(for: .seconds(1))
                if scenePhase == .active, session.ripping == nil, pick == nil { session.tick() }
            }
        }
        .sheet(item: $pick, onDismiss: {
            if let sealed = pendingRip {
                pendingRip = nil
                rip = RipSession(items: [sealed])
            }
        }) { mode in
            StreamPickSheet(session: session, mode: mode) { item, price, auction in
                switch mode {
                case .show: session.showCard(item)
                case .giveaway: session.giveaway(item)
                case .rip: pendingRip = session.ripNow(item)
                case .auction: session.startAuction(item, startShare: price / max(item.market, 0.01))
                case .buyNow: session.offerBuyNow(item, price: price)
                case .ripShip:
                    if auction {
                        session.auctionRipShip(item, startShare: price / max(item.market, 0.01))
                    } else if price > 0 {
                        session.offerRipShip(item, price: price)
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
        .fullScreenCover(item: $rip) { rip in
            RipView(items: rip.items, store: store, allowedModes: [.normal, .fast], ripID: rip.ripID, shipOrder: rip.shipOrder,
                    onHits: { hits, line in session.ripDone(hits: hits, ripShipLine: line) }) { self.rip = nil }
        }
        .confirmationDialog("End the stream?", isPresented: $confirmEnd, titleVisibility: .visible) {
            Button("End stream", role: .destructive) { session.end() }
        } message: {
            Text("The unused hours go back to your day.")
        }
    }

    private var live: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(spacing: 12) {
                    camera
                    if session.chatSlow {
                        Banner(text: "Chat is slowing down. Talk to chat, or show something.", color: Theme.orange, icon: "bubble.left.and.exclamationmark.bubble.right")
                    }
                    if let order = session.ripShipWaiting { RipShipWaitingPanel(order: order, onRip: ripForBuyer) }
                    if let a = session.auction { auctionPanel(a) }
                    if let b = session.buyNow { buyNowPanel(b) }
                    chat
                }
                .padding(16)
            }
            actions
        }
        .sheet(item: $buyerCase, onDismiss: {
            // The rip starts when the case sheet closes, also when the player swipes it away.
            if let ship = pendingShip {
                pendingShip = nil
                rip = ship
            }
        }) { request in
            CaseOpenSheet(source: request.source, onDone: { _ in })
        }
    }

    /// "Rip for the buyer": the clock stops, and the rip opens. A case opens into its units first.
    private func ripForBuyer() {
        guard let started = session.startRipShipRip() else { return }
        let ripSession = RipSession(items: started.items, ripID: started.ripID, shipOrder: started.order)
        if started.order.caseUnits != nil {
            pendingShip = ripSession
            buyerCase = CaseRequest(source: .forBuyer(units: started.items.map(\.id), buyer: started.order.buyer))
        } else {
            rip = ripSession
        }
    }

    private var header: some View {
        VStack(spacing: 8) {
            HStack {
                HStack(spacing: 6) {
                    Circle().fill(.red).frame(width: 8, height: 8)
                    Text("LIVE").font(.caption.weight(.black)).foregroundStyle(.red)
                    Text(session.clock).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
                Spacer()
                Text("\(Int(session.minutesLeft)) min left").font(.subheadline.monospaced()).foregroundStyle(Theme.cyan)
                Button("End") { confirmEnd = true }
                    .buttonStyle(.bordered)
                    .tint(Theme.orange)
                    .controlSize(.small)
            }
            ProgressView(value: min(1, session.minute / session.totalMinutes)).tint(.red)
            HStack(spacing: 0) {
                StatCell(label: "Viewers", value: "\(session.viewerCount)")
                StatCell(label: "Tips", value: money(session.tips), color: Theme.green)
                StatCell(label: "Followers", value: "\(session.followersGained >= 0 ? "+" : "")\(session.followersGained)")
                StatCell(label: "Sold", value: money(session.soldTotal))
            }
        }
        .padding(16)
        .background(Theme.surface)
    }

    private var camera: some View {
        VStack(spacing: 8) {
            if let item = session.onCamera {
                Group {
                    if item.sealed {
                        ProductImage(url: item.image, setName: item.name)
                    } else {
                        CardOrSlab(image: item.image, name: item.cardName ?? item.name, grade: item.grade, subgrades: item.subgrades,
                                   certID: item.id, cornerRadius: 8)
                    }
                }
                .frame(width: 150, height: 210)
                .shadow(color: .black.opacity(0.5), radius: 10, y: 6)
                Text(item.name).font(.subheadline.weight(.semibold))
                Text("market \(money(item.market))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
            } else {
                Image(systemName: "video").font(.system(size: 40)).foregroundStyle(Theme.muted)
                    .frame(width: 150, height: 210)
                Text("Nothing on camera. Show a card, or rip something.").font(.caption).foregroundStyle(Theme.muted)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .background(Theme.surface)
        .framed()
    }

    private var chat: some View {
        DetailBox(title: "Chat · \(session.viewerCount) watching") {
            if session.chat.isEmpty {
                Text("Quiet so far.").font(.caption).foregroundStyle(Theme.muted)
            }
            ForEach(session.chat.suffix(10)) { line in
                HStack(alignment: .top, spacing: 6) {
                    Image(systemName: icon(line.kind)).font(.caption2).foregroundStyle(color(line.kind)).frame(width: 14).padding(.top, 2)
                    Text(line.text).font(.caption).foregroundStyle(line.kind == .chat ? Theme.text : color(line.kind))
                }
            }
        }
    }

    private func icon(_ kind: ChatLine.Kind) -> String {
        switch kind {
        case .chat: "bubble.left"
        case .tip: "dollarsign.circle.fill"
        case .bid: "hammer.fill"
        case .buy: "cart.fill"
        case .system: "info.circle"
        }
    }

    private func color(_ kind: ChatLine.Kind) -> Color {
        switch kind {
        case .chat: Theme.muted
        case .tip: Theme.green
        case .bid: Theme.orange
        case .buy: Theme.cyan
        case .system: Theme.muted
        }
    }

    private func auctionPanel(_ a: StreamAuction) -> some View {
        DetailBox(title: "Auction · \(a.item.name)") {
            HStack(spacing: 0) {
                StatCell(label: "Top bid", value: money(a.top), color: a.top >= a.item.market ? Theme.green : Theme.text)
                StatCell(label: "Bidder", value: a.topBidder ?? "—")
                StatCell(label: "Bids", value: "\(a.bids.count)")
                StatCell(label: "Ends in", value: "\(Int(max(0, a.endsAt - session.minute))) min", color: Theme.orange)
            }
            Text("Market \(money(a.item.market)) · \(Int(a.top / max(a.item.market, 0.01) * 100))% of it · \(a.bidders) bidder\(a.bidders == 1 ? "" : "s") in chat")
                .font(.caption.monospaced())
                .foregroundStyle(Theme.muted)
            ProgressView(value: min(1, (session.minute - (a.endsAt - Balance.auctionMinutes)) / Balance.auctionMinutes)).tint(Theme.orange)
            ForEach(Array(a.bids.suffix(4).reversed().enumerated()), id: \.offset) { _, bid in
                HStack {
                    Text(bid.name).font(.caption)
                    Spacer()
                    Text(money(bid.amount)).font(.caption.monospaced())
                }
            }
        }
        .overlay(Rectangle().stroke(Theme.orange.opacity(0.6)))
    }

    private func buyNowPanel(_ b: StreamBuyNow) -> some View {
        DetailBox(title: "Buy Now · \(b.item.name)") {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(money(b.price)).font(.title3.monospaced().weight(.semibold))
                    Text("market \(money(b.item.market)) · \(Int(max(0, b.expiresAt - session.minute))) min left").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
                Spacer()
                Button("Take it down") { session.cancelBuyNow() }.buttonStyle(.bordered).controlSize(.small)
            }
        }
        .overlay(Rectangle().stroke(Theme.cyan.opacity(0.6)))
    }

    private var actions: some View {
        let whatnot = session.whatnotOpen
        let free = session.ripShipWaiting == nil
        return VStack(spacing: 8) {
            HStack(spacing: 8) {
                action("Show a card", "rectangle.portrait.on.rectangle.portrait", enabled: !session.items.isEmpty) { pick = .show }
                action("Talk to chat", "bubble.left.and.bubble.right", enabled: true) { session.talk() }
                action("Rip", "sparkles", enabled: session.items.contains { $0.sealed && !$0.isCase }) { pick = .rip }
                action("Give away", "gift", enabled: !session.items.isEmpty) { pick = .giveaway }
            }
            // The three Whatnot actions have their own row. An order that waits for its rip blocks the other sales.
            HStack(spacing: 8) {
                action(whatnot ? "Auction" : "Auction · 1k followers", "hammer", enabled: whatnot && free && session.auction == nil && !session.items.isEmpty) { pick = .auction }
                action(whatnot ? "Buy Now" : "Buy Now · 1k followers", "tag", enabled: whatnot && free && session.buyNow == nil && !session.items.isEmpty) { pick = .buyNow }
                action("Rip & Ship", "shippingbox", enabled: session.ripShipOpen && session.items.contains(where: \.ripShip)) { pick = .ripShip }
            }
            if store.whatnotBanned {
                Text("Whatnot banned you until day \((store.data.ripShip.bannedUntil ?? 0) + 1). Auctions, Buy Now, and Rip & Ship are closed.")
                    .font(.caption2).foregroundStyle(Theme.orange)
            } else if !whatnot {
                Text("Auctions, Buy Now, and Rip & Ship use Whatnot. It opens at 1,000 followers.").font(.caption2).foregroundStyle(Theme.muted)
            } else if store.data.ripShip.ripShipClosed {
                Text("Whatnot ended your Rip & Ship access.").font(.caption2).foregroundStyle(Theme.orange)
            } else if !session.items.contains(where: \.ripShip) {
                Text("Mark a sealed product \"R&S\" in the setup to sell it on Rip & Ship.").font(.caption2).foregroundStyle(Theme.muted)
            }
        }
        .padding(12)
        .background(Theme.surface)
    }

    private func action(_ title: String, _ icon: String, enabled: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            VStack(spacing: 4) {
                Image(systemName: icon).font(.title3)
                Text(title).font(.caption2.weight(.semibold)).multilineTextAlignment(.center).lineLimit(2)
            }
            .frame(maxWidth: .infinity, minHeight: 58)
            .background(Theme.background)
            .framed()
        }
        .buttonStyle(.plain)
        .foregroundStyle(enabled ? Theme.cyan : Theme.muted)
        .disabled(!enabled)
    }
}

/// Picks an item for a stream action, and a price for an auction or a Buy Now.
struct StreamPickSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(GameStore.self) private var store
    let session: StreamSession
    let mode: StreamView.PickMode
    /// The item, the price, and (Rip & Ship only) true for an auction.
    let onPick: (StreamItem, Double, Bool) -> Void
    @State private var chosen: StreamItem?
    @State private var percent: Double = 100
    /// Rip & Ship: Buy Now or auction.
    @State private var ripShipAuction = false

    private var items: [StreamItem] {
        switch mode {
        case .rip: session.items.filter { $0.sealed && !$0.isCase }
        case .ripShip: session.items.filter(\.ripShip)
        default: session.items
        }
    }

    private var title: String {
        switch mode {
        case .show: "Show a card"
        case .giveaway: "Give away"
        case .rip: "Rip on stream"
        case .auction: "Auction"
        case .buyNow: "Buy Now"
        case .ripShip: "Rip & Ship"
        }
    }

    private var needsPrice: Bool { mode == .auction || mode == .buyNow || mode == .ripShip }
    /// Rip & Ship Buy Now runs from 80% to 130% of market. Every other price runs from 20% to 150%.
    private var range: ClosedRange<Double> { mode == .ripShip && !ripShipAuction ? 80...130 : 20...150 }
    /// A whole case needs stream time: 0.75 minutes for each pack.
    private func caseBlock(_ item: StreamItem) -> String? {
        guard mode == .ripShip, item.isCase, session.minutesLeft < Double(item.packs) * Balance.ripShipCaseMinutesPerPack else { return nil }
        return "Not enough stream time to open the whole case."
    }
    private var price: Double { ShowSession.round(max(0.5, (chosen?.market ?? 0) * percent / 100)) }

    var body: some View {
        NavigationStack {
            Form {
                if let item = chosen, needsPrice {
                    Section(mode == .auction || (mode == .ripShip && ripShipAuction) ? "Start price" : "Price") {
                        Text(item.name).font(.headline)
                        if mode == .ripShip {
                            Picker("Sale", selection: $ripShipAuction) {
                                Text("Buy Now").tag(false)
                                Text("Auction").tag(true)
                            }
                            .pickerStyle(.segmented)
                            .onChange(of: ripShipAuction) { _, auction in percent = auction ? Balance.auctionStartShare * 100 : 95 }
                        }
                        HStack {
                            Slider(value: $percent, in: range, step: 5)
                            Text(money(price)).font(.body.monospaced()).frame(width: 90, alignment: .trailing)
                        }
                        if mode == .ripShip {
                            // An auction ends near market, so its fees show at market.
                            RipShipFeeBox(item: item, price: ripShipAuction ? item.market : price)
                            Text("Rip & Ship: one viewer buys the whole product. You open it on stream. Every card ships to that viewer.")
                                .font(.caption).foregroundStyle(Theme.muted)
                            Text("Viewers pay about 95% to 120% of market for hot product, 90% to 105% for the rest.")
                                .font(.caption).foregroundStyle(Theme.muted)
                        } else {
                            Text(mode == .auction
                                 ? "\(Int(percent))% of market. A low start brings bids. The timer runs \(Int(Balance.auctionMinutes)) minutes. Whatnot takes \(Int(Balance.whatnotFeeRate * 1000) / 10)% + \(money(Balance.whatnotFeeFlat)), and you ship."
                                 : "\(Int(percent))% of market. The first viewer who taps Buy gets it. It comes down after \(Int(Balance.buyNowMinutes)) minutes.")
                                .font(.caption).foregroundStyle(Theme.muted)
                        }
                        Button(mode == .auction || ripShipAuction && mode == .ripShip ? "Start the auction" : "Put it up") {
                            onPick(item, price, ripShipAuction)
                            dismiss()
                        }
                    }
                } else {
                    Section(mode == .giveaway ? "The item leaves your Inventory" : "Pick an item") {
                        if items.isEmpty { Text("Nothing fits.").foregroundStyle(Theme.muted) }
                        ForEach(items) { item in
                            Button {
                                if needsPrice {
                                    chosen = item
                                    ripShipAuction = false
                                    percent = mode == .auction ? Balance.auctionStartShare * 100 : mode == .ripShip ? 95 : 100
                                } else {
                                    onPick(item, item.market, false)
                                    dismiss()
                                }
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack {
                                        Text(item.name).foregroundStyle(Theme.text).lineLimit(1)
                                        if item.fakeKnown { Tag(text: "FAKE", color: .red) }
                                        Spacer()
                                        Text(money(item.market)).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                                    }
                                    if let block = caseBlock(item) { Text(block).font(.caption).foregroundStyle(Theme.orange) }
                                }
                            }
                            .disabled(caseBlock(item) != nil)
                        }
                    }
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}

/// The end of the stream: peak viewers, tips, sales with fees, pulls, followers, and giveaways.
struct StreamSummaryView: View {
    @Environment(AppNav.self) private var nav
    let session: StreamSession
    let onDone: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Stream over").font(.title2.bold())
                    Text("\(formatHours(ceil(session.minute / 15) / 4)) live.").font(.subheadline).foregroundStyle(Theme.muted)
                    HStack(spacing: 0) {
                        StatCell(label: "Peak viewers", value: "\(session.peakViewers)")
                        StatCell(label: "Tips", value: money(session.tips), color: Theme.green)
                        StatCell(label: "Followers", value: "\(session.followersGained >= 0 ? "+" : "")\(session.followersGained)",
                                 color: session.followersGained >= 0 ? Theme.green : Theme.orange)
                    }
                    if !session.liveSold.isEmpty {
                        DetailBox(title: "Sold on Whatnot · \(session.liveSold.count)") {
                            ForEach(Array(session.liveSold.enumerated()), id: \.offset) { _, s in
                                HStack {
                                    Text(s.name).font(.subheadline).lineLimit(1)
                                    Spacer()
                                    Text("\(money(s.price)) · fees \(money(s.fees))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                                }
                            }
                            Text("Total \(money(session.soldTotal)), fees and shipping \(money(session.feesTotal)).").font(.caption.monospaced())
                        }
                    }
                    if !session.ripShipOrders.isEmpty {
                        RipShipSummaryBox(session: session) {
                            onDone()
                            nav.path.append(.shipQueue)
                        }
                    }
                    if !session.pulls.isEmpty {
                        DetailBox(title: "Pulls · \(session.pulls.count) hits") {
                            ForEach(session.pulls.sorted { $0.market > $1.market }.prefix(8)) { card in
                                HStack {
                                    Text(card.name).font(.subheadline).lineLimit(1)
                                    Spacer()
                                    Text(money(card.market)).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                                }
                            }
                        }
                    }
                    if !session.giveaways.isEmpty {
                        DetailBox(title: "Giveaways") {
                            ForEach(Array(session.giveaways.enumerated()), id: \.offset) { _, g in
                                HStack {
                                    Text(g.name).font(.subheadline).lineLimit(1)
                                    Spacer()
                                    Text("+\(g.followers) followers").font(.caption.monospaced()).foregroundStyle(Theme.green)
                                }
                            }
                        }
                    }
                    Text("\(session.tipCount) tip\(session.tipCount == 1 ? "" : "s") · the tips are in your Wallet.")
                        .font(.caption).foregroundStyle(Theme.muted)
                }
                .padding(16)
            }
            Button(action: onDone) { Text("Done").frame(maxWidth: .infinity) }
                .primaryButton()
                .controlSize(.large)
                .padding(16)
        }
    }
}

/// Setup: the length, the items, and the start (now, or a later day) (docs/08-ui-direction.md, 5. Live stream).
struct StreamSetupView: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav
    @Environment(\.dismiss) private var dismiss
    /// Today's scheduled plan, when the setup opens for it.
    var plan: StreamPlan?
    @State private var hours = Balance.streamHours[0]
    @State private var chosen: Set<UUID> = []
    /// The chosen items that the player marked for Rip & Ship.
    @State private var ripShip: Set<UUID> = []
    @State private var later = false
    @State private var day = 0
    @State private var startHour = 19.0

    var body: some View {
        let stock = store.streamStock
        NavigationStack {
            Form {
                Section("Length") {
                    Picker("Hours", selection: $hours) {
                        ForEach(Balance.streamHours, id: \.self) { Text(formatHours($0)).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    Text("End early and the unused hours go back to the day. A rip on stream takes about \(Int(Balance.streamRipMinutesPerPack)) minutes a pack.")
                        .font(.caption).foregroundStyle(Theme.muted)
                }
                if plan == nil {
                    Section("When") {
                        Picker("When", selection: $later) {
                            Text("Now").tag(false)
                            Text("A later day").tag(true)
                        }
                        .pickerStyle(.segmented)
                        if later {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    ForEach(1...14, id: \.self) { offset in
                                        let d = store.day + offset
                                        let free = store.freeHours(on: d)
                                        let taken = store.data.streams.contains { $0.day == d }
                                        Button {
                                            day = d
                                            startHour = d % 7 < 5 && store.job != nil ? 19 : 10
                                        } label: {
                                            VStack(spacing: 2) {
                                                Text(String(GameStore.weekdays[d % 7].prefix(3))).font(.caption.weight(.semibold))
                                                Text("D\(d + 1)").font(.caption2.monospaced())
                                                Text(free >= hours ? "\(formatHours(free)) free" : "no").font(.caption2).foregroundStyle(free >= hours ? Theme.green : Theme.orange)
                                            }
                                            .frame(width: 60, height: 56)
                                            .background(day == d ? Theme.cyan.opacity(0.2) : Theme.background)
                                            .overlay(Rectangle().stroke(day == d ? Theme.cyan : Theme.line))
                                        }
                                        .buttonStyle(.plain)
                                        .disabled(free < hours || taken)
                                    }
                                }
                            }
                            if day > store.day {
                                Picker("Start", selection: $startHour) {
                                    ForEach(startOptions(day), id: \.self) { Text(GameStore.clock($0)).tag($0) }
                                }
                                Text("Followers see a scheduled stream, so more come. Miss it, and it costs followers and authenticity.")
                                    .font(.caption).foregroundStyle(Theme.muted)
                            } else {
                                Text("Pick a day. A day with a booked show is blocked.").font(.caption).foregroundStyle(Theme.muted)
                            }
                        } else if let block = store.streamBlock(hours: hours) {
                            Text(block).foregroundStyle(Theme.orange)
                        } else if let start = store.slot(for: hours) {
                            Text("Starts at \(GameStore.clock(start)).").font(.caption).foregroundStyle(Theme.muted)
                        }
                    }
                }
                Section("Bring · \(chosen.count) of \(stock.count)") {
                    if stock.isEmpty { Text("You have nothing free to bring. PC items, master set cards, and listed items stay home.").foregroundStyle(Theme.muted) }
                    ForEach(stock) { item in
                        HStack {
                            Image(systemName: chosen.contains(item.id) ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(chosen.contains(item.id) ? Theme.cyan : Theme.muted)
                            Text(item.name).foregroundStyle(Theme.text).lineLimit(1)
                            if item.sealed { Tag(text: "SEALED") }
                            Spacer()
                            Text(money(item.market)).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                            if chosen.contains(item.id), item.sealed, store.followerTier >= 1, store.ripShipBlock(item.id) == nil {
                                Button {
                                    if ripShip.contains(item.id) { ripShip.remove(item.id) } else { ripShip.insert(item.id) }
                                } label: {
                                    Text("R&S")
                                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 3)
                                        .foregroundStyle(ripShip.contains(item.id) ? Color.black : Theme.cyan)
                                        .background(ripShip.contains(item.id) ? Theme.cyan : Theme.cyan.opacity(0.15))
                                }
                                .buttonStyle(.borderless)
                                .accessibilityLabel("Rip and Ship \(item.name)")
                            }
                        }
                        .contentShape(Rectangle())
                        .onTapGesture {
                            if chosen.contains(item.id) {
                                chosen.remove(item.id)
                                ripShip.remove(item.id)
                            } else {
                                chosen.insert(item.id)
                            }
                        }
                    }
                    if store.data.ripShip.ripShipClosed {
                        Text("Whatnot ended your Rip & Ship access.").font(.caption).foregroundStyle(Theme.orange)
                    } else if store.whatnotBanned {
                        Text("Whatnot banned you until day \((store.data.ripShip.bannedUntil ?? 0) + 1).").font(.caption).foregroundStyle(Theme.orange)
                    } else {
                        Text("Rip & Ship: one viewer buys the whole product. You open it on stream. Every card ships to that viewer. Whatnot takes 8% plus 2.9% and $0.30.")
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                }
            }
            .navigationTitle(plan == nil ? "Go live" : "Your scheduled stream")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if later, plan == nil {
                        Button("Schedule") {
                            store.scheduleStream(day: day, startHour: startHour, hours: hours, itemIDs: Array(chosen),
                                                 ripShipIDs: Array(ripShip.intersection(chosen)))
                            dismiss()
                        }
                        .disabled(day <= store.day)
                    } else {
                        Button("Go live") {
                            if let session = store.startStream(hours: hours, itemIDs: Array(chosen), scheduled: plan != nil,
                                                               ripShipIDs: Array(ripShip.intersection(chosen))) {
                                dismiss()
                                nav.stream = StreamCover(session: session)
                            }
                        }
                        .disabled(store.streamBlock(hours: hours) != nil)
                    }
                }
            }
            .onAppear {
                if let plan {
                    hours = plan.hours
                    chosen = Set(plan.itemIDs).intersection(stock.map(\.id))
                    ripShip = Set(plan.ripShipIDs ?? []).intersection(chosen)
                }
            }
        }
    }

    private func startOptions(_ d: Int) -> [Double] {
        var out: [Double] = []
        var h = Balance.dayStart
        while h + hours <= Balance.dayEnd {
            let inShift = d % 7 < 5 && store.job != nil && h < Balance.workEnd && h + hours > Balance.workStart
            if !inShift { out.append(h) }
            h += 1
        }
        return out
    }
}
