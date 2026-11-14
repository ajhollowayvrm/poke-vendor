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

/// A square action button: an icon over a one-line label. The label never wraps. It shrinks to fit the tile.
/// A filled tile is the main action of its grid. A disabled tile dims.
struct ActionTile: View {
    @Environment(\.isEnabled) private var isEnabled
    let title: String
    let icon: String
    var tint: Color = Theme.cyan
    var filled = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon).font(.title3)
                Text(title)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .padding(.horizontal, 4)
            .frame(maxWidth: .infinity, minHeight: 64)
            .foregroundStyle(filled ? .black : tint)
            .background(filled ? tint : Theme.surface)
            .overlay(Rectangle().stroke(filled ? tint : Theme.line))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .opacity(isEnabled ? 1 : 0.35)
    }
}

/// Action tiles in rows of four, all the same size.
struct ActionGrid<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
            content()
        }
    }
}
