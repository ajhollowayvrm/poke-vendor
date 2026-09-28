import SwiftUI
import Observation

/// Which groups the player folded, for each list. It is only a convenience, so it lives in UserDefaults.
@MainActor @Observable
final class FoldedGroups {
    static let shared = FoldedGroups()
    private var folded: [String: Set<String>] = [:]

    func isFolded(_ group: String, in list: String) -> Bool { load(list).contains(group) }

    func toggle(_ group: String, in list: String) {
        var groups = load(list)
        if groups.contains(group) { groups.remove(group) } else { groups.insert(group) }
        folded[list] = groups
        UserDefaults.standard.set(Array(groups), forKey: "folded.\(list)")
    }

    private func load(_ list: String) -> Set<String> {
        if let groups = folded[list] { return groups }
        let groups = Set(UserDefaults.standard.stringArray(forKey: "folded.\(list)") ?? [])
        folded[list] = groups
        return groups
    }
}

/// One set's items in a list, under a title that folds and unfolds them.
struct SetGroup<Content: View>: View {
    let slug: String
    var count: Int?
    /// The list this group is in, so each list keeps its own folds.
    let list: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        let info = SetLibrary.info(slug)
        FoldingGroup(key: slug, list: list,
                     title: info?.name ?? SetLibrary.set(slug).name,
                     detail: [info?.series, info?.year].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "),
                     count: count, content: content)
    }
}

/// A titled group in a list that has no set, for example mystery packs.
struct TitledGroup<Content: View>: View {
    let title: String
    var count: Int?
    let list: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        FoldingGroup(key: "title:" + title, list: list, title: title, detail: "", count: count, content: content)
    }
}

private struct FoldingGroup<Content: View>: View {
    let key: String
    let list: String
    let title: String
    let detail: String
    let count: Int?
    @ViewBuilder let content: () -> Content

    var body: some View {
        let folded = FoldedGroups.shared.isFolded(key, in: list)
        VStack(spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.25)) { FoldedGroups.shared.toggle(key, in: list) }
            } label: {
                VStack(spacing: 0) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Image(systemName: "chevron.down")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Theme.cyan)
                            .rotationEffect(.degrees(folded ? -90 : 0))
                        Text(title).font(.subheadline.weight(.semibold))
                        if !detail.isEmpty {
                            Text(detail).font(.caption).foregroundStyle(Theme.muted)
                        }
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
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(title), \(folded ? "folded" : "open")")
            if !folded {
                VStack(spacing: 0) { content() }
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .clipped()
    }
}
