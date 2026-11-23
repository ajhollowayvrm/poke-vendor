import SwiftUI

/// The business dashboard of the player's store (docs/proposals/store-business.md, part 7): the store numbers, the
/// last 7 and 28 days, the customer mix, reviews, the cash forecast, and the month-end reviews.
struct BusinessView: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let s = store.cardStore {
                    numbers
                    period(s, days: 7)
                    period(s, days: 28)
                    BusinessSections()
                    mix
                    forecast(s)
                    reviews
                    months
                } else {
                    Text("Open a store to see its business numbers.").foregroundStyle(Theme.muted)
                }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Business")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var numbers: some View {
        let b = store.business
        return DetailBox(title: "Store numbers") {
            meter("Awareness", value: b.awareness, max: 100, text: "\(Int(b.awareness.rounded()))",
                  note: "How many local people know the store. Marketing and events raise it.")
            meter("Rating", value: b.rating - 1, max: 4, text: String(format: "%.1f ★", b.rating),
                  note: "\(b.reviews.count) review\(b.reviews.count == 1 ? "" : "s"). Prices, stock, staff, and events set it.")
            meter("Loyalty", value: b.loyalty, max: 100, text: "\(Int(b.loyalty.rounded()))",
                  note: "Regulars who come back. Events and a good rating raise it. Empty shelves lower it.")
            HStack {
                Text("Traffic from these numbers").font(.caption)
                Spacer()
                Text("×\(String(format: "%.2f", store.businessTrafficFactor))").font(.caption.monospaced())
                    .foregroundStyle(store.businessTrafficFactor >= 1 ? Theme.green : Theme.orange)
            }
        }
    }

    private func meter(_ title: String, value: Double, max: Double, text: String, note: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(title).font(.subheadline)
                Spacer()
                Text(text).font(.subheadline.monospaced().weight(.semibold))
            }
            SpaceBar(used: Int(value * 100), capacity: Int(max * 100))
            Text(note).font(.caption2).foregroundStyle(Theme.muted)
        }
    }

    private func period(_ s: CardStoreState, days: Int) -> some View {
        let window = s.history.filter { $0.day > store.day - 1 - days }
        let customers = window.reduce(0) { $0 + $1.customers }
        let sold = window.reduce(0) { $0 + $1.sold }
        let revenue = window.reduce(0) { $0 + $1.revenue }
        let wages = window.reduce(0) { $0 + $1.costs }
        return DetailBox(title: "Last \(days) days") {
            row("Customers", "\(customers)")
            row("Items sold", "\(sold)")
            row("Conversion", customers > 0 ? "\(Int((Double(sold) / Double(customers) * 100).rounded()))%" : "—")
            row("Average sale", sold > 0 ? money(revenue / Double(sold)) : "—")
            row("Sales", money(revenue))
            row("Wages", money(wages))
        }
    }

    private var mix: some View {
        DetailBox(title: "Customer mix") {
            ForEach(CustomerType.allCases) { t in
                HStack {
                    Image(systemName: t.icon).foregroundStyle(Theme.cyan).frame(width: 22)
                    Text(t.rawValue).font(.caption)
                    Spacer()
                    Text("\(Int(((store.customerMix[t] ?? 0) * 100).rounded()))%").font(.caption.monospaced())
                }
            }
            Text("Kids and casual buyers spend \(money(Balance.storeCasualBudget)) or less. Players want singles. Collectors look at items of \(money(Balance.collectorMinValue)) or more. Investors buy only sealed, close to market.")
                .font(.caption2).foregroundStyle(Theme.muted)
        }
    }

    /// The costs due in the next 30 days.
    private func forecast(_ s: CardStoreState) -> some View {
        let rentDays = store.daysUntilStoreRent ?? 0
        let rent = (s.lease?.rent ?? s.location.rent) + store.storeOverheadEstimate
        let wages = store.staffDailyWage * Double(s.openDays.count) * 30 / 7
        let extra = store.businessForecastCosts
        let total = rent + wages + extra.reduce(0) { $0 + $1.amount }
        return DetailBox(title: "Next 30 days") {
            row("Store rent and overhead (in \(rentDays)d)", money(rent))
            if wages > 0 { row("Wages", money(wages)) }
            ForEach(extra, id: \.label) { row($0.label, money($0.amount)) }
            Divider().overlay(Theme.line)
            row("Total", money(total))
            row("Cash now", money(store.cash))
        }
    }

    private var reviews: some View {
        let recent = store.business.reviews.suffix(5).reversed()
        return DetailBox(title: "Recent reviews") {
            if recent.isEmpty { Text("No reviews yet.").font(.subheadline).foregroundStyle(Theme.muted) }
            ForEach(Array(recent)) { r in
                VStack(alignment: .leading, spacing: 2) {
                    Text(String(repeating: "★", count: r.stars) + String(repeating: "☆", count: 5 - r.stars))
                        .font(.caption).foregroundStyle(r.stars >= 4 ? Theme.green : r.stars <= 2 ? Theme.orange : Theme.muted)
                    Text("\"\(r.text)\" · day \(r.day + 1)").font(.caption)
                }
            }
        }
    }

    private var months: some View {
        let list = store.business.months.reversed()
        return DetailBox(title: "Month-end reviews") {
            if list.isEmpty { Text("The first review comes the day before the store rent.").font(.subheadline).foregroundStyle(Theme.muted) }
            ForEach(Array(list)) { m in
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text("Day \(m.day + 1)").font(.caption.monospaced())
                        Spacer()
                        Text("Grade \(m.grade)").font(.subheadline.weight(.bold))
                            .foregroundStyle(m.grade == "A" || m.grade == "B" ? Theme.green : m.grade == "C" ? Theme.cyan : Theme.orange)
                    }
                    Text("Sales \(money(m.revenue)) · costs \(money(m.costs)) · net \(signedMoney(m.net))").font(.caption.monospaced())
                    ForEach(m.notes, id: \.self) { Text("• \($0)").font(.caption2).foregroundStyle(Theme.muted) }
                }
            }
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).font(.caption)
            Spacer()
            Text(value).font(.caption.monospaced())
        }
    }
}

/// The sections that later phases add to the dashboard (marketing, distribution, staff, the floor).
struct BusinessSections: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        LevelBox()
        if store.investor != nil { InvestorBox() }
        MarketingBox()
        if store.hasStoreAccount { LadderBox() } else if store.data.cardStore != nil {
            DetailBox(title: "Distribution") {
                Text("Apply for a hobby distributor account on the distributor screen. With an account, the quarterly review can move you up to Preferred and Premier: lower prices, more cases, and net-30 terms.")
                    .font(.caption).foregroundStyle(Theme.muted)
            }
        }
    }
}

/// The store level and the XP to the next level.
struct LevelBox: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let level = store.storeLevel
        let next = StoreLevel(rawValue: level.rawValue + 1)
        DetailBox(title: "Store level") {
            HStack {
                Text(level.name).font(.subheadline.weight(.semibold))
                Spacer()
                Text("\(Int(store.business.xp)) XP").font(.caption.monospaced())
            }
            if let next {
                SpaceBar(used: Int(store.business.xp - level.xp), capacity: Int(next.xp - level.xp))
                Text("\(Int(next.xp - store.business.xp)) XP to \(next.name). XP comes from sales (1 for each \(money(Balance.xpPerSales))), events (\(Int(Balance.xpPerEvent)) each), and days with 4.3 stars or more.")
                    .font(.caption2).foregroundStyle(Theme.muted)
            } else {
                Text("The top level.").font(.caption2).foregroundStyle(Theme.muted)
            }
        }
    }
}

/// The marketing channels: start, stop, the effect, and last week's customers.
struct MarketingBox: View {
    @Environment(GameStore.self) private var store
    @State private var socialLevel = 0

    var body: some View {
        let m = store.marketing
        let lastWeek = m.weeks.last
        DetailBox(title: "Marketing") {
            HStack {
                Text("Awareness from marketing").font(.caption)
                Spacer()
                Text("+\(Int(store.marketingAwareness.rounded()))").font(.caption.monospaced()).foregroundStyle(Theme.cyan)
            }
            Text("Each channel builds while it runs and fades after it stops. More channels at once give less for each dollar.")
                .font(.caption2).foregroundStyle(Theme.muted)
            ForEach(MarketingChannel.allCases) { ch in
                channelRow(ch, m: m, lastWeek: lastWeek)
            }
            if let w = lastWeek {
                Text("Last week: \(money(w.spent)) spent, about \(Int(w.customers.values.reduce(0, +).rounded())) customers from marketing.")
                    .font(.caption.monospaced()).foregroundStyle(Theme.muted)
            }
        }
    }

    private func channelRow(_ ch: MarketingChannel, m: MarketingState, lastWeek: MarketingWeek?) -> some View {
        let running = m.running(ch)
        let effect = m.effect[ch.rawValue] ?? 0
        let block = store.channelBlock(ch, level: socialLevel)
        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Image(systemName: ch.icon).foregroundStyle(running != nil || effect > 0 ? Theme.green : Theme.cyan).frame(width: 22)
                Text(ch.rawValue).font(.subheadline)
                Spacer()
                Text(ch.costText).font(.caption2.monospaced()).foregroundStyle(Theme.muted)
            }
            Text(ch.blurb + (ch.targets.isEmpty || ch.targets.count == CustomerType.allCases.count ? "" : " Brings: \(ch.targets.map(\.rawValue).joined(separator: ", ").lowercased()).")
                ).font(.caption2).foregroundStyle(Theme.muted)
            HStack {
                if ch == .social, running == nil {
                    Picker("Budget", selection: $socialLevel) {
                        ForEach(0..<3, id: \.self) { Text(money(Balance.mktSocial[$0])).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .frame(maxWidth: 200)
                }
                if let c = running {
                    Text("Running since day \(c.startDay + 1)").font(.caption2.monospaced()).foregroundStyle(Theme.green)
                    Spacer()
                    Button("Stop") { store.stopChannel(ch) }.buttonStyle(.bordered).controlSize(.small)
                } else if ch == .maps, m.mapsListed {
                    Text("Listed").font(.caption2.monospaced()).foregroundStyle(Theme.green)
                } else {
                    Spacer()
                    Button(ch == .window ? "Refresh" : ch == .maps ? "List" : "Start") { store.startChannel(ch, level: socialLevel) }
                        .buttonStyle(.bordered).controlSize(.small)
                        .disabled(block != nil)
                }
            }
            if running == nil, let block, !(ch == .maps && m.mapsListed) {
                Text(block).font(.caption2).foregroundStyle(Theme.orange)
            }
            if let n = lastWeek?.customers[ch.rawValue], n >= 0.5 {
                Text("Last week: about \(Int(n.rounded())) customers").font(.caption2.monospaced()).foregroundStyle(Theme.cyan)
            }
        }
        .padding(.vertical, 4)
    }
}

/// The row on the store screen that opens the business dashboard, with the three store numbers.
struct BusinessLink: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav

    var body: some View {
        let b = store.business
        Button { nav.path.append(.business) } label: {
            HStack(spacing: 12) {
                Image(systemName: "chart.bar.xaxis").foregroundStyle(Theme.cyan)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Business").font(.subheadline.weight(.semibold))
                    Text("Awareness \(Int(b.awareness.rounded())) · \(String(format: "%.1f", b.rating))★ · loyalty \(Int(b.loyalty.rounded()))")
                        .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
            }
            .padding(12)
            .background(Theme.surface)
            .framed()
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// The distribution ladder: the tier, the score, the next review, net-30 terms, the bills, and event status.
struct LadderBox: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let tier = store.ladderTier
        DetailBox(title: "Distribution ladder") {
            HStack {
                Text(tier.name).font(.subheadline.weight(.semibold))
                Spacer()
                Text("\(Int((tier.discount * 100).rounded()))% of MSRP").font(.caption.monospaced())
            }
            ForEach(LadderTier.allCases, id: \.rawValue) { t in
                HStack {
                    Image(systemName: t.rawValue <= tier.rawValue ? "checkmark.circle.fill" : "circle").foregroundStyle(t.rawValue <= tier.rawValue ? Theme.green : Theme.muted)
                    Text(t.name).font(.caption)
                    Spacer()
                    Text(t == .store ? "\(Int(t.discount * 100))%" : "\(Int(t.discount * 100))% · +\(t.extraCases) case\(t.extraCases == 1 ? "" : "s") · net 30\(t == .premier ? " · better hot fill" : "")")
                        .font(.caption2.monospaced()).foregroundStyle(Theme.muted)
                }
            }
            Text("Preferred needs a score of \(Int(Balance.ladderPreferredScore)). Premier needs \(Int(Balance.ladderPremierScore)) and the Destination store level. Under \(Int(Balance.ladderDropScore)), you drop a tier.")
                .font(.caption2).foregroundStyle(Theme.muted)
            Divider().overlay(Theme.line)
            HStack {
                Text("Score now").font(.caption)
                Spacer()
                Text("\(Int(store.ladderScoreNow.rounded())) of 100").font(.caption.monospaced().weight(.semibold))
            }
            ForEach(store.ladderScoreParts, id: \.label) { p in
                HStack {
                    Text(p.label).font(.caption2)
                    Spacer()
                    Text("\(Int(p.points.rounded()))/\(Int(p.max))").font(.caption2.monospaced()).foregroundStyle(Theme.muted)
                }
            }
            if let review = store.nextLadderReview {
                Text("The next quarterly review is on day \(review + 1).").font(.caption2).foregroundStyle(Theme.muted)
            }
            if tier.creditLimit > 0 {
                Divider().overlay(Theme.line)
                Toggle("Buy on net-30 terms", isOn: Binding(get: { store.data.distributor.useTerms == true }, set: { store.setUseTerms($0) }))
                    .font(.subheadline)
                Text("Pay 30 days after the order. Credit limit \(money(tier.creditLimit)), \(money(store.payablesTotal)) owed. A late bill puts the account on credit hold and costs score.")
                    .font(.caption2).foregroundStyle(Theme.muted)
            }
            ForEach(store.payables) { p in
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(p.label).font(.caption).lineLimit(1)
                        Text(p.late ? "LATE · was due day \(p.dueDay + 1)" : "Due day \(p.dueDay + 1)").font(.caption2.monospaced())
                            .foregroundStyle(p.late ? Theme.orange : Theme.muted)
                    }
                    Spacer()
                    Button("Pay \(money(p.amount))") { store.payPayable(p.id) }
                        .buttonStyle(.bordered).controlSize(.small)
                        .disabled(!store.canAfford(p.amount))
                }
            }
            Divider().overlay(Theme.line)
            let a = store.data.distributor
            if store.isEventStore {
                Label("Official event store: free league promos, and more tournament players.", systemImage: "rosette")
                    .font(.caption).foregroundStyle(Theme.green)
            } else {
                Text("Official event store: \(a.bigTournaments ?? 0)/\(Balance.eventStoreTournaments) tournaments and \(a.bigLeagues ?? 0)/\(Balance.eventStoreLeagues) league days with \(Balance.eventStoreMinPlayers)+ players.")
                    .font(.caption2).foregroundStyle(Theme.muted)
            }
        }
    }
}

/// The opening tasks during the build-out (Model/StoreOpening.swift).
struct OpeningBox: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        DetailBox(title: "Opening tasks") {
            ForEach(store.openingTasks) { t in
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: t.done ? "checkmark.circle.fill" : t.required ? "exclamationmark.circle" : "circle")
                        .foregroundStyle(t.done ? Theme.green : t.required ? Theme.orange : Theme.muted)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(t.title + (t.required ? " · needed to open" : "")).font(.subheadline.weight(.medium))
                        Text(t.detail).font(.caption).foregroundStyle(Theme.muted)
                    }
                    Spacer(minLength: 0)
                    action(t.id)
                }
            }
            Divider().overlay(Theme.line)
            Toggle("Soft opening", isOn: Binding(get: { store.openingPlan?.softOpen ?? false }, set: { store.setSoftOpen($0) }))
                .font(.subheadline)
            Text("Open \(Balance.softOpenDays) days before the grand opening at \(Int(Balance.softOpenTraffic * 100))% of the traffic. You get the first sales and reviews before the big day. It needs the license and the inspection.")
                .font(.caption2).foregroundStyle(Theme.muted)
        }
    }

    @ViewBuilder private func action(_ id: String) -> some View {
        let p = store.openingPlan
        switch id {
        case "license" where p?.licenseReadyDay == nil:
            Button("File") { store.fileLicense() }.buttonStyle(.bordered).controlSize(.small)
                .disabled(!store.canAfford(Balance.licenseFee))
        case "inspection" where !(p?.inspectionPassed ?? true):
            Button(p?.inspectionFailed == true ? "Fix & book" : "Book") { store.bookInspection() }.buttonStyle(.bordered).controlSize(.small)
                .disabled(store.inspectionBlock != nil)
        case "pos" where !(p?.posDone ?? true):
            Button("Set up") { store.setupPOS() }.buttonStyle(.bordered).controlSize(.small)
        case "buzz" where !(p?.buzzDone ?? true):
            Button("Buy") { store.preOpeningBuzz() }.buttonStyle(.bordered).controlSize(.small)
                .disabled(!store.canAfford(Balance.buzzCost))
        default:
            EmptyView()
        }
    }
}

/// The investor: the money in, the shares paid, and the buyout.
struct InvestorBox: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        if let inv = store.investor {
            DetailBox(title: "Investor") {
                Text("Invested \(money(inv.invested)). Takes \(Int(inv.share * 100))% of each profitable month. Paid so far: \(money(inv.paidOut)).")
                    .font(.caption)
                Button("Buy them out · \(money(store.investorBuyoutCost))") { store.buyOutInvestor() }
                    .buttonStyle(.bordered)
                    .disabled(!store.canAfford(store.investorBuyoutCost))
            }
        }
    }
}

/// The staff and this week's candidates (Model/StoreStaff.swift).
struct StaffList: View {
    @Environment(GameStore.self) private var store
    @State private var showCandidates = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Staff keep the store open \(GameStore.clock(Balance.storeOpen)) – \(GameStore.clock(Balance.storeClose)) on each open day, and are paid on open days. Staff sell at your price. They do not haggle, trade, or sell a second item, and they buy only through the buylist.")
                .font(.caption).foregroundStyle(Theme.muted)
            if store.staff.isEmpty {
                Text("No staff. The store opens only while you work the counter.").font(.subheadline).foregroundStyle(Theme.orange)
            }
            ForEach(store.staff) { e in employeeRow(e, hired: true) }
            Button(showCandidates ? "Hide candidates" : "Candidates this week (\(store.candidates.count))") { showCandidates.toggle() }
                .buttonStyle(.bordered).font(.caption)
            if showCandidates {
                ForEach(store.candidates) { e in employeeRow(e, hired: false) }
                Text("New candidates come each Monday. A manager brings \(Int(((Balance.managerEventPlayers - 1) * 100).rounded()))% more event players and watches the others. Up to \(Balance.staffMax) staff.")
                    .font(.caption2).foregroundStyle(Theme.muted)
            }
        }
    }

    private func dots(_ label: String, _ n: Int) -> some View {
        HStack(spacing: 2) {
            Text(label).font(.caption2).foregroundStyle(Theme.muted).frame(width: 64, alignment: .leading)
            ForEach(1...5, id: \.self) { i in
                Circle().fill(i <= n ? Theme.cyan : Theme.line).frame(width: 6, height: 6)
            }
        }
    }

    private func employeeRow(_ e: Employee, hired: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("\(e.name) · \(e.role.rawValue)").font(.subheadline.weight(.medium))
                Spacer()
                Text("\(money(e.wage))/h · \(money(e.dailyWage))/day").font(.caption.monospaced())
            }
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    dots("Knowledge", e.knowledge)
                    dots("Sales", e.sales)
                }
                VStack(alignment: .leading, spacing: 2) {
                    dots("Honesty", e.honesty)
                    dots("Reliable", e.reliability)
                }
            }
            if hired {
                HStack {
                    Text("Morale \(Int(e.morale.rounded()))").font(.caption2.monospaced())
                        .foregroundStyle(e.morale < Balance.quitMorale + 10 ? Theme.orange : Theme.muted)
                    Spacer()
                    Button("Raise +\(money(Balance.raiseStep))/h") { store.giveRaise(e.id) }.buttonStyle(.bordered).controlSize(.small)
                    Button("Let go", role: .destructive) { store.fire(e.id) }.buttonStyle(.bordered).controlSize(.small)
                }
            } else {
                Button("Hire") { store.hire(e) }.buttonStyle(.bordered).controlSize(.small)
                    .disabled(store.staff.count >= Balance.staffMax)
            }
        }
        .padding(8)
        .background(Theme.background)
        .framed()
    }
}
