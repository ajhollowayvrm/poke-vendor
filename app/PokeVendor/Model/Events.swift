import Foundation

// The calendar rows for sales, restocks, and opportunities. Shows and meets have their own rows in
// `calendarEntries(day:)`.

@MainActor
extension GameStore {
    func eventEntries(day: Int) -> [CalendarEntry] {
        var out: [CalendarEntry] = []
        for sale in visibleSales where sale.covers(day) {
            let dayText = sale.kind == .estate ? " · day \(sale.dayIndex(day) + 1) of 3 · \(Int(Balance.estatePriceFactor[sale.dayIndex(day)] * 100))% prices" : ""
            out.append(CalendarEntry(kind: .sale, title: sale.name,
                                     detail: "\(sale.hoursText) · \(formatHours(saleHours(sale)))\(sale.far ? " · far" : "")\(dayText)\(sale.visited.contains(day) ? " · been" : "")",
                                     eventID: sale.id))
        }
        out += restockEntries(day: day)
        for o in data.opportunities where o.day == day && !o.answered && o.postedDay <= data.day {
            out.append(CalendarEntry(kind: .meetup, title: o.title, detail: o.hours > 0 ? formatHours(o.hours) : "Answer from the hub"))
        }
        for m in data.meetups where m.day == day && !m.done {
            out.append(CalendarEntry(kind: .meetup, title: m.isPickup ? "Pick up \(m.name)" : "Meet \(m.who) · \(m.name)",
                                     detail: "Facebook Marketplace · 1 hour\(m.isPickup ? "" : " · \(money(m.price)) cash")"))
        }
        if let s = data.cardStore {
            if day == s.openDay {
                out.append(CalendarEntry(kind: .store, title: "Grand opening", detail: s.name))
            }
            let since = day - s.leaseDay
            if since > 0, since % Balance.rentCycleDays == 0 {
                out.append(CalendarEntry(kind: .rent, title: "Store rent due", detail: "\(money(s.location.rent)) · \(s.name)"))
            }
            if day >= s.openDay, s.openDays.contains(day % 7) {
                out.append(CalendarEntry(kind: .store, title: s.name,
                                         detail: "Open \(GameStore.clock(Balance.storeOpen)) – \(GameStore.clock(Balance.storeClose))\(s.clerk ? " · clerk" : "")"))
                out += storeEventEntries(day: day)
            }
        }
        if data.jobState.timeOffBooked.contains(day) {
            out.append(CalendarEntry(kind: .timeOff, title: "Time off", detail: "Booked · paid"))
        }
        return out
    }
}
