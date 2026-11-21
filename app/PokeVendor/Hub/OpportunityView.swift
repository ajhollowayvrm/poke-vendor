import SwiftUI

/// One surprise opportunity: what it is, and Accept or Ignore (docs/08-ui-direction.md, Opportunity detail).
struct OpportunityView: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav
    @Environment(\.dismiss) private var dismiss
    let id: UUID
    @State private var result: String?

    var body: some View {
        if let o = store.opportunity(id) {
            let block = store.opportunityBlock(o)
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 12) {
                        Image(systemName: o.kind.icon)
                            .font(.title2)
                            .frame(width: 44, height: 44)
                            .background(Theme.orange.opacity(0.15), in: Circle())
                            .foregroundStyle(Theme.orange)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(o.title).font(.title3.bold())
                            Text(o.kind.label).font(.caption).foregroundStyle(Theme.muted)
                        }
                    }
                    DetailBox(title: "The offer") {
                        Text(o.detail).font(.subheadline)
                        HStack {
                            Text(o.day == store.day ? "Today only" : "Tomorrow only").font(.caption.monospaced()).foregroundStyle(Theme.cyan)
                            if o.hours > 0 {
                                Text("· \(formatHours(o.hours))").font(.caption.monospaced()).foregroundStyle(Theme.muted)
                            }
                        }
                    }
                    if let result {
                        Banner(text: result, color: Theme.green, icon: "checkmark.circle.fill")
                    } else if o.answered {
                        Text("Answered.").font(.subheadline).foregroundStyle(Theme.muted)
                    } else {
                        Button {
                            switch store.acceptOpportunity(o.id) {
                            case .encounter(let session):
                                nav.path.removeAll()
                                nav.encounter = EncounterSession(session: session)
                            case .done(let text):
                                result = text
                            case .failed(let text):
                                result = text
                            }
                        } label: {
                            Text(block ?? "Accept").frame(maxWidth: .infinity)
                        }
                        .primaryButton()
                        .tint(Theme.orange)
                        .controlSize(.large)
                        .disabled(block != nil)
                        Button {
                            store.ignoreOpportunity(o.id)
                            dismiss()
                        } label: {
                            Text("Ignore").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                    }
                    Text("Surprise opportunities come 1 or 2 times a month, with a day of notice at most. They do not wait.")
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                }
                .padding(16)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Opportunity")
            .navigationBarTitleDisplayMode(.inline)
        } else {
            GoneView()
        }
    }
}

/// The result of a camped restock: the products at MSRP, or a sellout (docs/12-acquiring-product.md, Camp a store drop).
struct CampView: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let haul: CampHaul

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(haul.success ? "You got in" : "Sold out").font(.title2.bold())
            Text(haul.success
                 ? "\(formatHours(haul.machine == nil ? Balance.campHours : Balance.machineCampHours)) in line at \(haul.place). \(haul.rivalLine ?? (haul.machine == nil ? "The shelf is yours before the scalpers." : "The machine is full.")) Everything is at MSRP."
                 : "\(formatHours(haul.machine == nil ? Balance.campHours : Balance.machineCampHours)) in line at \(haul.place), and the stock was gone before you reached the shelf. \(haul.rivalLine ?? "")")
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
            if haul.success, let chain = haul.store {
                Text(store.limitText(chain)).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                if let hint = store.heatHint(chain) { Text(hint).font(.caption).foregroundStyle(Theme.orange) }
            } else if haul.success {
                Text("Limit \(Balance.machineLimit) of each product. The machine does not track you.").font(.caption.monospaced()).foregroundStyle(Theme.muted)
            }
            if let notice = store.retailNotice { Banner(text: notice, color: Theme.orange) }
            ScrollView {
                VStack(spacing: 10) {
                    ForEach(haul.items) { item in
                        let left = store.shelfLeft(item)
                        let allowed = haul.store.map { store.limitLeft(item, at: $0) } ?? Balance.machineLimit
                        HStack(spacing: 12) {
                            ProductImage(url: item.product.image, setName: item.product.name)
                                .frame(width: 48, height: 66)
                                .clipShape(RoundedRectangle(cornerRadius: 3))
                            VStack(alignment: .leading, spacing: 3) {
                                HStack(spacing: 6) {
                                    Text(item.product.name).font(.subheadline.weight(.semibold)).lineLimit(2)
                                    if item.hot { HotTag() }
                                }
                                Text("MSRP \(money(item.price)) · mkt \(money(item.product.market)) · \(left) left · limit \(allowed)"
                                     + (store.hasUpgrade(.evReadout) ? " · flip \(money(store.flipMargin(market: item.product.market, cost: item.price)))" : ""))
                                    .font(.caption.monospaced())
                                    .foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            Button(left > 0 ? money(item.price) : "Gone") {
                                store.retailNotice = nil
                                if let machine = haul.machine {
                                    store.buyMachineItem(item, machine: machine)
                                } else if let chain = haul.store {
                                    store.buyShelf(item, at: chain, credit: false)
                                }
                            }
                            .primaryButton()
                            .controlSize(.small)
                            .disabled(left == 0 || allowed == 0 || !store.canAfford(item.price))
                        }
                        .padding(10)
                        .background(Theme.surface)
                        .framed()
                    }
                }
            }
            Button { dismiss() } label: { Text("Done").frame(maxWidth: .infinity) }
                .primaryButton()
                .controlSize(.large)
        }
        .padding(20)
        .background(Theme.surface.ignoresSafeArea())
        .onDisappear { store.retailNotice = nil }
    }
}
