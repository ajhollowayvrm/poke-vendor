import SwiftUI

/// Settings: the default rip mode and the stop rule (docs/18-ripping.md, Picking the mode; The stop rule).
struct SettingsView: View {
    @Environment(GameStore.self) private var store
    @State private var slug: String?
    @State private var search = ""

    var body: some View {
        let rule = store.data.settings.stopRule
        Form {
            PaymentPolicySection()
            Section {
                Picker("Rip mode", selection: Binding(get: { store.data.settings.ripMode }, set: { store.setRipMode($0) })) {
                    ForEach(RipMode.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                Text(store.data.settings.ripMode.detail).font(.caption).foregroundStyle(Theme.muted)
            } header: {
                Text("Default rip mode")
            } footer: {
                Text("The rip screen has the same control. A change there is for that rip only.")
            }
            Section {
                Toggle("Stop on a dollar amount", isOn: Binding(get: { rule.dollar != nil },
                                                                set: { store.setStopDollar($0 ? Balance.defaultStopDollar : nil) }))
                if let dollar = rule.dollar {
                    HStack {
                        Slider(value: Binding(get: { dollar }, set: { store.setStopDollar($0) }), in: 1...200, step: 1)
                        Text(money(dollar)).font(.body.monospaced()).frame(width: 70, alignment: .trailing)
                    }
                }
            } header: {
                Text("Stop rule · dollar amount")
            } footer: {
                Text("Fast and Sift stop on a card worth this much or more. It applies to every set.")
            }
            Section {
                Toggle("Stop on rarities", isOn: Binding(get: { rule.raritiesOn }, set: { store.setRaritiesOn($0) }))
                if rule.raritiesOn {
                    ForEach(ownedSets, id: \.slug) { info in
                        setRow(info)
                    }
                }
            } header: {
                Text("Stop rule · rarities · your sets")
            } footer: {
                Text(rule.isEmpty ? "Both parts are off. Sift runs straight to the summary, and Fast never stops."
                     : "Pick the rarities that stop the rip, for each set. With no rarities picked, a hit stops it: rare or higher, or $1 or more. A rip always stops on a resealed pack.")
            }
            if rule.raritiesOn {
                Section("All sets") {
                    TextField("Search sets", text: $search)
                    ForEach(allSets, id: \.slug) { info in
                        setRow(info)
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: Binding(get: { slug.map { SlugBox(slug: $0) } }, set: { slug = $0?.slug })) { box in
            StopRuleSheet(slug: box.slug)
        }
    }

    private struct SlugBox: Identifiable {
        let slug: String
        var id: String { slug }
    }

    private var ownedSets: [SetInfo] {
        let slugs = Set(store.data.sealed.flatMap { store.packSlugs(of: $0) })
        return SetLibrary.index.filter { slugs.contains($0.slug) }.sorted { ($0.release ?? "") > ($1.release ?? "") }
    }

    private var allSets: [SetInfo] {
        let sorted = SetLibrary.index.sorted { ($0.release ?? "") > ($1.release ?? "") }
        guard !search.isEmpty else { return Array(sorted.prefix(20)) }
        return sorted.filter { $0.name.localizedCaseInsensitiveContains(search) }
    }

    private func setRow(_ info: SetInfo) -> some View {
        let picked = store.data.settings.stopRule.entries(for: info.slug)
        return Button { slug = info.slug } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(info.name).foregroundStyle(Theme.text)
                    Text(picked.isEmpty ? "Hits stop the rip" : "\(picked.count) rarit\(picked.count == 1 ? "y" : "ies") picked")
                        .font(.caption).foregroundStyle(picked.isEmpty ? Theme.muted : Theme.cyan)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.muted)
            }
        }
    }
}

/// The rarity ladder of one set, most common first. Tap an entry to pick it, or "or higher" to pick it and
/// every rarer one (docs/18-ripping.md, The stop rule).
struct StopRuleSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let slug: String

    var body: some View {
        let ladder = SetLibrary.ladder(slug)
        let picked = store.data.settings.stopRule.entries(for: slug)
        NavigationStack {
            List {
                Section {
                    Text(picked.isEmpty ? "No rarities picked. A hit stops the rip: rare or higher, or $1 or more."
                                        : "The rip stops on \(picked.count) of \(ladder.entries.count) entries.")
                        .font(.caption).foregroundStyle(Theme.muted)
                    if !picked.isEmpty {
                        Button("Clear") { store.setStopEntries([], for: slug) }
                    }
                }
                Section("Most common first") {
                    ForEach(ladder.entries, id: \.self) { entry in
                        HStack {
                            Button {
                                var set = picked
                                if set.contains(entry) { set.remove(entry) } else { set.insert(entry) }
                                store.setStopEntries(ladder.entries.filter { set.contains($0) }, for: slug)
                            } label: {
                                HStack {
                                    Image(systemName: picked.contains(entry) ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(picked.contains(entry) ? Theme.cyan : Theme.muted)
                                    Text(entry).foregroundStyle(Theme.text)
                                }
                            }
                            .buttonStyle(.plain)
                            Spacer()
                            Button("or higher") {
                                let set = picked.union(ladder.orHigher(entry))
                                store.setStopEntries(ladder.entries.filter { set.contains($0) }, for: slug)
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                            .font(.caption)
                        }
                    }
                }
            }
            .navigationTitle(SetLibrary.info(slug)?.name ?? slug)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
