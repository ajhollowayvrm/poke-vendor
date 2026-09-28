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
    @State private var confirmEnd = false

    enum PickMode: Identifiable {
        case show, giveaway, rip, auction, buyNow
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
        .sheet(item: $pick) { mode in
            StreamPickSheet(session: session, mode: mode) { item, price in
                switch mode {
                case .show: session.showCard(item)
                case .giveaway: session.giveaway(item)
                case .rip: if let sealed = session.ripNow(item) { rip = RipSession(items: [sealed]) }
                case .auction: session.startAuction(item, startShare: price / max(item.market, 0.01))
                case .buyNow: session.offerBuyNow(item, price: price)
                }
            }
            .presentationDetents([.medium, .large])
        }
        .fullScreenCover(item: $rip) { rip in
            RipView(items: rip.items, store: store, allowedModes: [.normal, .fast],
                    onHits: { hits in session.ripDone(hits: hits) }) { self.rip = nil }
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
                    if let a = session.auction { auctionPanel(a) }
                    if let b = session.buyNow { buyNowPanel(b) }
                    chat
                }
                .padding(16)
            }
            actions
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
                        RemoteCardImage(url: item.image.flatMap(URL.init(string:)), name: item.name)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
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
        .overlay(Rectangle().stroke(Theme.line))
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
        return VStack(spacing: 8) {
            HStack(spacing: 8) {
                action("Show a card", "rectangle.portrait.on.rectangle.portrait", enabled: !session.items.isEmpty) { pick = .show }
                action("Talk to chat", "bubble.left.and.bubble.right", enabled: true) { session.talk() }
                action("Rip", "sparkles", enabled: session.items.contains(where: \.sealed)) { pick = .rip }
            }
            HStack(spacing: 8) {
                action("Give away", "gift", enabled: !session.items.isEmpty) { pick = .giveaway }
                action(whatnot ? "Auction" : "Auction · 1k followers", "hammer", enabled: whatnot && session.auction == nil && !session.items.isEmpty) { pick = .auction }
                action(whatnot ? "Buy Now" : "Buy Now · 1k followers", "tag", enabled: whatnot && session.buyNow == nil && !session.items.isEmpty) { pick = .buyNow }
            }
            if !whatnot {
                Text("Auctions and Buy Now use Whatnot. It opens at 1,000 followers.").font(.caption2).foregroundStyle(Theme.muted)
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
            .overlay(Rectangle().stroke(Theme.line))
        }
        .buttonStyle(.plain)
        .foregroundStyle(enabled ? Theme.cyan : Theme.muted)
        .disabled(!enabled)
    }
}

/// Picks an item for a stream action, and a price for an auction or a Buy Now.
struct StreamPickSheet: View {
    @Environment(\.dismiss) private var dismiss
    let session: StreamSession
    let mode: StreamView.PickMode
    let onPick: (StreamItem, Double) -> Void
    @State private var chosen: StreamItem?
    @State private var percent: Double = 100

    private var items: [StreamItem] {
        mode == .rip ? session.items.filter(\.sealed) : session.items
    }

    private var title: String {
        switch mode {
        case .show: "Show a card"
        case .giveaway: "Give away"
        case .rip: "Rip on stream"
        case .auction: "Auction"
        case .buyNow: "Buy Now"
        }
    }

    private var needsPrice: Bool { mode == .auction || mode == .buyNow }
    private var price: Double { ShowSession.round(max(0.5, (chosen?.market ?? 0) * percent / 100)) }

    var body: some View {
        NavigationStack {
            Form {
                if let item = chosen, needsPrice {
                    Section(mode == .auction ? "Start price" : "Price") {
                        Text(item.name).font(.headline)
                        HStack {
                            Slider(value: $percent, in: 20...150, step: 5)
                            Text(money(price)).font(.body.monospaced()).frame(width: 90, alignment: .trailing)
                        }
                        Text(mode == .auction
                             ? "\(Int(percent))% of market. A low start brings bids. The timer runs \(Int(Balance.auctionMinutes)) minutes. Whatnot takes \(Int(Balance.whatnotFeeRate * 1000) / 10)% + \(money(Balance.whatnotFeeFlat)), and you ship."
                             : "\(Int(percent))% of market. The first viewer who taps Buy gets it. It comes down after \(Int(Balance.buyNowMinutes)) minutes.")
                            .font(.caption).foregroundStyle(Theme.muted)
                        Button(mode == .auction ? "Start the auction" : "Put it up") {
                            onPick(item, price)
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
                                    percent = mode == .auction ? Balance.auctionStartShare * 100 : 100
                                } else {
                                    onPick(item, item.market)
                                    dismiss()
                                }
                            } label: {
                                HStack {
                                    Text(item.name).foregroundStyle(Theme.text).lineLimit(1)
                                    if item.fakeKnown { Tag(text: "FAKE", color: .red) }
                                    Spacer()
                                    Text(money(item.market)).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                                }
                            }
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
                    if !session.sold.isEmpty {
                        DetailBox(title: "Sold on Whatnot · \(session.sold.count)") {
                            ForEach(Array(session.sold.enumerated()), id: \.offset) { _, s in
                                HStack {
                                    Text(s.name).font(.subheadline).lineLimit(1)
                                    Spacer()
                                    Text("\(money(s.price)) · fees \(money(s.fees))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                                }
                            }
                            Text("Total \(money(session.soldTotal)), fees and shipping \(money(session.feesTotal)).").font(.caption.monospaced())
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
                .buttonStyle(.borderedProminent)
                .foregroundStyle(.black)
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
                    if stock.isEmpty { Text("You have nothing free to bring. Kept and listed items stay home.").foregroundStyle(Theme.muted) }
                    ForEach(stock) { item in
                        Button {
                            if chosen.contains(item.id) { chosen.remove(item.id) } else { chosen.insert(item.id) }
                        } label: {
                            HStack {
                                Image(systemName: chosen.contains(item.id) ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(chosen.contains(item.id) ? Theme.cyan : Theme.muted)
                                Text(item.name).foregroundStyle(Theme.text).lineLimit(1)
                                if item.sealed { Tag(text: "SEALED") }
                                Spacer()
                                Text(money(item.market)).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                            }
                        }
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
                            store.scheduleStream(day: day, startHour: startHour, hours: hours, itemIDs: Array(chosen))
                            dismiss()
                        }
                        .disabled(day <= store.day)
                    } else {
                        Button("Go live") {
                            if let session = store.startStream(hours: hours, itemIDs: Array(chosen), scheduled: plan != nil) {
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
