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
        let wages = s.clerk ? Balance.clerkWage * Double(s.openDays.count) * 30 / 7 : 0
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
    var body: some View { EmptyView() }
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
