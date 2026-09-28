import SwiftUI

/// The title over one set's items in a list: the set name, then its series and year, and a divider.
struct SetHeader: View {
    let slug: String
    var count: Int?

    var body: some View {
        let info = SetLibrary.info(slug)
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(info?.name ?? SetLibrary.set(slug).name)
                    .font(.subheadline.weight(.semibold))
                Text([info?.series, info?.year].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                Spacer()
                if let count {
                    Text("\(count)").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 14)
            .padding(.bottom, 6)
            Rectangle().fill(Theme.cyan.opacity(0.35)).frame(height: 1)
        }
        .background(Theme.background.opacity(0.4))
    }
}

/// A plain title over a group in a list that has no set, for example mystery packs.
struct SectionTitle: View {
    let text: String

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(text).font(.subheadline.weight(.semibold))
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.top, 14)
            .padding(.bottom, 6)
            Rectangle().fill(Theme.cyan.opacity(0.35)).frame(height: 1)
        }
    }
}
