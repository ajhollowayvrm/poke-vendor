import SwiftUI

/// The Supplies storefront: sleeves, top loaders, mailers, and the rest. A store account also orders accessories for
/// the shelf here (docs/23-supplies.md).
struct SuppliesView: View {
    @Environment(GameStore.self) private var store
    @State private var packs: [String: Int] = [:]
    @State private var cases: [String: Int] = [:]
    @State private var message: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                HStack {
                    Text("Packs arrive at once. With none in hand, you pay \(Int(Balance.supplyRushFactor))x for each piece.")
                        .font(.caption).foregroundStyle(Theme.muted)
                    Spacer()
                    Text("Cash \(money(store.cash))").font(.caption.monospaced())
                }
                if let message { Banner(text: message, color: Theme.cyan, icon: "info.circle.fill") }
                DetailBox(title: "What it costs") {
                    Text("A shipped single: \(money(store.shippingSupplyCost(price: 20, slab: false, sealed: false))) in supplies. A shipped single over \(money(Balance.magneticMinPrice)): \(money(store.shippingSupplyCost(price: Balance.magneticMinPrice, slab: false, sealed: false))). A slab or sealed product: \(money(store.shippingSupplyCost(price: 20, slab: true, sealed: false))). A grading submission: \(money(SupplyItem.cardSaver.unitPrice)) a card. A show table: \(money(tableCost)).")
                        .font(.caption).foregroundStyle(Theme.muted)
                    Text("Spent on supplies: \(money(store.data.supplies.spent)) · at a rush price: \(money(store.data.supplies.rushSpent))")
                        .font(.caption.monospaced())
                }
                ForEach(SupplyItem.allCases, id: \.self) { item in
                    let n = packs[item.rawValue] ?? 1
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: item.icon).font(.title3).foregroundStyle(Theme.cyan).frame(width: 36)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.name).font(.subheadline.weight(.medium))
                            Text(item.detail).font(.caption).foregroundStyle(Theme.muted)
                            Text("In hand \(store.supplyCount(item)) · pack of \(item.packSize) · \(money(item.packPrice)) · \(money(item.unitPrice)) each")
                                .font(.caption.monospaced())
                                .foregroundStyle(store.supplyCount(item) == 0 ? Theme.orange : Theme.muted)
                            Stepper("\(n) pack\(n == 1 ? "" : "s") · \(money(item.packPrice * Double(n)))",
                                    value: Binding(get: { n }, set: { packs[item.rawValue] = $0 }), in: 1...20)
                                .font(.caption)
                            Button("Buy") { message = store.buySupply(item, packs: n) ?? "Bought \(n * item.packSize) \(item.name.lowercased())." }
                                .buttonStyle(.borderedProminent)
                                .foregroundStyle(.black)
                                .controlSize(.small)
                                .disabled(!store.canAfford(item.packPrice * Double(n)))
                        }
                    }
                    .padding(12)
                    .background(Theme.surface)
                    .overlay(Rectangle().stroke(Theme.line))
                }
                if store.storeIsBuilt {
                    Text("STORE ACCESSORIES").font(.system(size: 10, weight: .semibold)).kerning(0.8)
                        .foregroundStyle(Theme.muted).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 6)
                    Text("Your store account buys these from the distributor at \(Int((Balance.accessoryCostShare * 100).rounded()))% of the shelf price. They go on the shelf at once. Customers buy a few each open day.")
                        .font(.caption).foregroundStyle(Theme.muted).frame(maxWidth: .infinity, alignment: .leading)
                    ForEach(StoreAccessory.allCases, id: \.self) { item in
                        let n = cases[item.rawValue] ?? 1
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: item.icon).font(.title3).foregroundStyle(Theme.cyan).frame(width: 36)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(item.name).font(.subheadline.weight(.medium))
                                Text("On the shelf \(store.shelfCount(item)) · case of \(item.caseSize) · \(money(item.cost)) each · sells for \(money(item.retail))")
                                    .font(.caption.monospaced())
                                    .foregroundStyle(store.shelfCount(item) == 0 ? Theme.orange : Theme.muted)
                                Stepper("\(n) case\(n == 1 ? "" : "s") · \(money(item.casePrice * Double(n)))",
                                        value: Binding(get: { n }, set: { cases[item.rawValue] = $0 }), in: 1...10)
                                    .font(.caption)
                                Button("Order") {
                                    message = store.buyAccessories(item, cases: n) ?? "Stocked \(n * item.caseSize) \(item.name.lowercased()) on the shelf."
                                }
                                .buttonStyle(.borderedProminent)
                                .foregroundStyle(.black)
                                .controlSize(.small)
                                .disabled(!store.canAfford(item.casePrice * Double(n)))
                            }
                        }
                        .padding(12)
                        .background(Theme.surface)
                        .overlay(Rectangle().stroke(Theme.line))
                    }
                }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Supplies")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var tableCost: Double {
        SupplyItem.pennySleeve.unitPrice * Double(Balance.tablePennySleeves) + SupplyItem.topLoader.unitPrice * Double(Balance.tableTopLoaders)
            + SupplyItem.teamBag.unitPrice * Double(Balance.tableTeamBags)
    }
}
