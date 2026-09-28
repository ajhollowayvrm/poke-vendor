import SwiftUI

/// The next six weeks: the work shift, payday, rent, card shows, deliveries, grades, and auctions
/// (docs/17-calendar-and-events.md).
struct CalendarView: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let next = store.upcomingShows.first {
                    Button { nav.path.append(.show(next.id)) } label: { NextShowBox(show: next) }
                        .buttonStyle(.plain)
                }
                let first = store.day - store.weekday
                ForEach(0..<6, id: \.self) { w in
                    let start = first + w * 7
                    VStack(alignment: .leading, spacing: 0) {
                        Text("WEEK \(start / 7 + 1)")
                            .font(.system(size: 11, weight: .semibold))
                            .kerning(0.8)
                            .foregroundStyle(Theme.muted)
                            .padding(.bottom, 6)
                        ForEach(start..<(start + 7), id: \.self) { day in
                            if day >= store.day {
                                DayRow(day: day, today: day == store.day, entries: store.calendarEntries(day: day)) { id in
                                    nav.path.append(.show(id))
                                }
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Calendar")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct DayRow: View {
    let day: Int
    let today: Bool
    let entries: [CalendarEntry]
    let openShow: (UUID) -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text(String(GameStore.weekdays[day % 7].prefix(3))).font(.subheadline.weight(.semibold))
                Text("Day \(day + 1)").font(.caption2.monospaced()).foregroundStyle(Theme.muted)
            }
            .frame(width: 52, alignment: .leading)
            .foregroundStyle(today ? Theme.cyan : Theme.text)
            VStack(alignment: .leading, spacing: 6) {
                if entries.isEmpty {
                    Text(day % 7 >= 5 ? "Free weekend day" : "Free").font(.caption).foregroundStyle(Theme.muted)
                }
                ForEach(entries) { entry in
                    if let id = entry.showID {
                        Button { openShow(id) } label: { EntryLine(entry: entry, highlight: true) }
                            .buttonStyle(.plain)
                    } else {
                        EntryLine(entry: entry, highlight: false)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .background(today ? Theme.cyan.opacity(0.08) : Theme.surface)
        .overlay(Rectangle().stroke(Theme.line))
    }
}

private struct EntryLine: View {
    let entry: CalendarEntry
    let highlight: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: entry.icon)
                .font(.caption)
                .foregroundStyle(highlight ? Theme.cyan : Theme.muted)
                .frame(width: 16)
            VStack(alignment: .leading, spacing: 1) {
                Text(entry.title)
                    .font(.subheadline.weight(highlight ? .semibold : .regular))
                    .foregroundStyle(entry.kind == .work ? Theme.muted : Theme.text)
                if !entry.detail.isEmpty {
                    Text(entry.detail).font(.caption).foregroundStyle(Theme.muted)
                }
            }
            if highlight {
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.muted)
            }
        }
    }
}

/// The next card show, at the top of the calendar and on the hub.
struct NextShowBox: View {
    @Environment(GameStore.self) private var store
    let show: CardShow

    var body: some View {
        let days = show.startDay - store.day
        DetailBox(title: "Next card show") {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(show.name).font(.headline)
                    Text("\(show.size.label) · \(show.venue)").font(.caption).foregroundStyle(Theme.muted)
                    Text(days <= 0 ? "Today" : days == 1 ? "Tomorrow" : "In \(days) days · \(GameStore.weekdays[show.startDay % 7])")
                        .font(.caption.monospaced())
                        .foregroundStyle(Theme.cyan)
                }
                Spacer()
                Text(show.booked ? "BOOKED" : "NO TABLE")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background((show.booked ? Theme.green : Theme.muted).opacity(0.2))
                    .foregroundStyle(show.booked ? Theme.green : Theme.muted)
            }
        }
    }
}

/// One card show: when and where, the fees, booking, and the way in on the day.
struct ShowDetailView: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav
    let id: UUID

    var body: some View {
        if let show = store.show(id) {
            let daysOut = show.startDay - store.day
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(show.name).font(.title2.bold())
                        Text("\(show.size.label) · \(show.venue)").font(.subheadline).foregroundStyle(Theme.muted)
                        Text(dates(show)).font(.subheadline.monospaced()).foregroundStyle(Theme.cyan)
                    }
                    DetailBox(title: "The show") {
                        row("Days", show.size.days == 2 ? "2 (Saturday and Sunday)" : "1 (Saturday)")
                        row("Doors", "\(GameStore.clock(Balance.showOpen)) – \(GameStore.clock(Balance.showClose))")
                        row("Buyers at a table", "About \(Int(show.size.buyersPerDay)) a day")
                        row("Table fee", money(show.size.tableFee) + (show.size.days == 2 ? " for both days" : ""))
                        row("Walk-in entry", money(show.size.entryFee) + " a day")
                        row("Booking closes", show.lastBookingDay < store.day ? "Closed"
                            : "Day \(show.lastBookingDay + 1) (\(show.lastBookingDay - store.day) days left)")
                    }
                    if show.booked {
                        Label("Your table is booked.", systemImage: "checkmark.seal.fill")
                            .foregroundStyle(Theme.green)
                    } else if show.lastBookingDay >= store.day {
                        Button { store.bookTable(show.id) } label: {
                            Text("Book a table · \(money(show.size.tableFee))").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Theme.cyan)
                        .foregroundStyle(.black)
                        .controlSize(.large)
                        .disabled(!store.canBook(show))
                        if !store.canAfford(show.size.tableFee) {
                            Text("You have \(money(store.cash)).").font(.caption).foregroundStyle(Theme.orange)
                        }
                    } else {
                        Text("Tables are sold out. You can still walk in on the day and buy on the floor.")
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                    }
                    if show.covers(store.day) {
                        Button {
                            if let started = store.startShowDay() { nav.showDay = ShowDaySession(show: started) }
                        } label: {
                            Text(show.booked ? "Go to the show" : "Walk in · \(money(show.size.entryFee))")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .disabled(!store.canGoToShowToday)
                        Text("The show takes the rest of the day.").font(.caption).foregroundStyle(Theme.muted)
                    }
                    DetailBox(title: "How a show works") {
                        Text("With a table, you pick what to bring and set your prices. Buyers come up one at a time. Each one offers cash, or sometimes a trade. You accept, counter, or decline. The condition and the cut change what they pay.")
                            .font(.subheadline)
                        Text("You can walk the floor for an hour to buy from other vendors. Buyers who come to your table while you are away leave.")
                            .font(.subheadline)
                        if daysOut > 0 {
                            Text("Items that are kept, listed, shipping, or at a grader stay home.")
                                .font(.caption)
                                .foregroundStyle(Theme.muted)
                        }
                    }
                }
                .padding(16)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Card show")
            .navigationBarTitleDisplayMode(.inline)
        } else {
            GoneView()
        }
    }

    private func dates(_ show: CardShow) -> String {
        let days = show.startDay - store.day
        let when = days <= 0 ? "Today" : days == 1 ? "Tomorrow" : "In \(days) days"
        return show.size.days == 2 ? "\(when) · Days \(show.startDay + 1)–\(show.endDay + 1), Sat and Sun"
                                   : "\(when) · Day \(show.startDay + 1), Saturday"
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).font(.subheadline).foregroundStyle(Theme.muted)
            Spacer()
            Text(value).font(.subheadline.monospaced()).multilineTextAlignment(.trailing)
        }
    }
}
