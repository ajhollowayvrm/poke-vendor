import SwiftUI

extension View {
    /// The main button of a screen: a filled button with black text. Add `.tint` for another color.
    func primaryButton() -> some View {
        buttonStyle(.borderedProminent)
            .foregroundStyle(.black)
    }

    /// A square frame in the line color. Cards and boxes use it.
    func framed() -> some View {
        overlay(Rectangle().stroke(Theme.line))
    }
}

extension Binding where Value == Bool {
    /// True while `item` holds a value. Setting it to false clears `item`.
    init<Item>(isPresent item: Binding<Item?>) {
        self.init(get: { item.wrappedValue != nil }, set: { if !$0 { item.wrappedValue = nil } })
    }
}

/// A row with an icon, a title, a detail line, and a chevron. It sits inside a button.
struct ChevronRow: View {
    let icon: String
    let title: String
    let detail: String
    var accent = false

    var body: some View {
        HStack {
            Image(systemName: icon).foregroundStyle(Theme.cyan)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.medium)).foregroundStyle(accent ? Theme.cyan : Theme.text)
                Text(detail).font(.caption).foregroundStyle(Theme.muted)
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
        }
        .contentShape(Rectangle())
    }
}

/// The late-night choice: start tired, or sleep in (docs/16-time-and-day.md, Late nights).
struct LateNightChoice: View {
    @Environment(GameStore.self) private var store
    let lateHours: Double
    let message: String

    var body: some View {
        DetailBox(title: "You were up until \(GameStore.clock(Balance.dayEnd + lateHours))") {
            Text(message).font(.caption).foregroundStyle(Theme.muted)
            HStack(spacing: 8) {
                Button("Start tired") { store.chooseMorning(sleepIn: false) }
                    .buttonStyle(.bordered)
                    .tint(Theme.orange)
                Button("Sleep in until \(GameStore.clock(Balance.dayStart + lateHours))") { store.chooseMorning(sleepIn: true) }
                    .primaryButton()
            }
            .controlSize(.regular)
        }
    }
}
