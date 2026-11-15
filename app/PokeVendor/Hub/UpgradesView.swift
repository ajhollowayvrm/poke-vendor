import SwiftUI

/// Every upgrade in the game (docs/09-upgrades.md).
struct UpgradesView: View {
    @Environment(GameStore.self) private var store
    @Environment(AppNav.self) private var nav

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                Text("Cash \(money(store.cash))").font(.caption.monospaced()).frame(maxWidth: .infinity, alignment: .trailing)
                DetailBox(title: "Grading") {
                    if let next = store.nextCenteringTool {
                        row(name: next.name, detail: next.detail, cost: next.cost, owned: false, icon: "ruler",
                            canBuy: store.canAfford(next.cost)) { store.buyCenteringTool() }
                    } else {
                        row(name: Balance.centeringTools.last?.name ?? "Centering scanner", detail: "Exact numbers for both faces.",
                            cost: 0, owned: true, icon: "ruler", canBuy: false) {}
                    }
                    ForEach([Upgrade.cornerLoupe, .edgeLight, .surfaceLamp, .gradeEstimate, .psaMembership], id: \.self) { upgradeRow($0) }
                }
                DetailBox(title: "Selling and shows") {
                    row(name: "Vendor kit", detail: Balance.vendorKitDetail, cost: Balance.vendorKitCost, owned: store.data.vendorKit,
                        icon: "tablecells", canBuy: store.canAfford(Balance.vendorKitCost)) { store.buyVendorKit() }
                    upgradeRow(.evReadout)
                    upgradeRow(.salesAnalytics)
                    upgradeRow(.cardReader)
                    upgradeRow(.authTool)
                    upgradeRow(.uvLight)
                    upgradeRow(.vendorBinder)
                    upgradeRow(.slabCase)
                    upgradeRow(.foldingCart)
                    upgradeRow(.cargoVan)
                    upgradeRow(.premiumBooth)
                    upgradeRow(.showcaseCase)
                }
                DetailBox(title: "Selling online") {
                    upgradeRow(.shippingKit)
                    upgradeRow(.repricer)
                    upgradeRow(.proSeller)
                }
                DetailBox(title: "Contacts") {
                    upgradeRow(.contactBook)
                    upgradeRow(.bigContactBook)
                }
                DetailBox(title: "Buying") {
                    upgradeRow(.betterCar)
                    upgradeRow(.dropDiscord)
                    upgradeRow(.restockBot)
                    upgradeRow(.savedSearch)
                    upgradeRow(.sellerResearch)
                    upgradeRow(.lotAppraisal)
                    upgradeRow(.sortingTrays)
                    upgradeRow(.bulkBroker)
                    upgradeRow(.supplyAccount)
                    upgradeRow(.priceTracker)
                }
                DetailBox(title: "Collecting") {
                    upgradeRow(.premiumBinder)
                }
                DetailBox(title: "Storage and security") {
                    upgradeRow(.lockedCase)
                    upgradeRow(.dehumidifier)
                    upgradeRow(.fireSafe)
                }
                DetailBox(title: "Large purchases") {
                    upgradeRow(.warehouse)
                    upgradeRow(.ownHome)
                }
                DetailBox(title: "Social media") {
                    row(name: "Analytics", detail: "The likes and the reach factors of each post, plus burnout and authenticity meters.",
                        cost: Balance.analyticsUpgradeCost, owned: store.social.analytics, icon: "chart.bar",
                        canBuy: store.hasAccount && store.canAfford(Balance.analyticsUpgradeCost)) { store.buyAnalytics() }
                    upgradeRow(.studioLights)
                    upgradeRow(.cameraKit)
                    upgradeRow(.editingSoftware)
                }
                // Upgrades that live on their own screens (docs/09-upgrades.md).
                DetailBox(title: "On other screens") {
                    elsewhere("Store fixtures and a bigger space", detail: "Display cases, a sealed wall, play tables, cameras, a sign, a point-of-sale system, and bigger units.",
                              icon: "storefront", enabled: store.cardStore != nil) { nav.path.append(.cardStore) }
                    elsewhere("Vending machine parts", detail: "A card reader, a camera, and remote stock data, for each machine.",
                              icon: "cabinet", enabled: !store.machines.isEmpty) { nav.path.append(.vending) }
                    elsewhere("Collection insurance", detail: "Payouts for theft and damage, for a premium every 4 weeks.",
                              icon: "umbrella", enabled: true) { nav.path.append(.wallet) }
                }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Upgrades")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func elsewhere(_ name: String, detail: String, icon: String, enabled: Bool, open: @escaping () -> Void) -> some View {
        Button(action: open) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: icon).font(.title3).foregroundStyle(Theme.cyan).frame(width: 28)
                VStack(alignment: .leading, spacing: 3) {
                    Text(name).font(.subheadline.weight(.semibold))
                    Text(enabled ? detail : detail + " Not open yet.").font(.caption).foregroundStyle(Theme.muted)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }

    private func upgradeRow(_ u: Upgrade) -> some View {
        row(name: u.name, detail: u.detail + (u.requires.map { " Needs the \($0.name.lowercased())." } ?? ""), cost: u.cost,
            owned: store.hasUpgrade(u), icon: u.icon, canBuy: store.canBuyUpgrade(u)) { store.buyUpgrade(u) }
    }

    private func row(name: String, detail: String, cost: Double, owned: Bool, icon: String, canBuy: Bool, buy: @escaping () -> Void) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon).font(.title3).foregroundStyle(owned ? Theme.green : Theme.cyan).frame(width: 28)
            VStack(alignment: .leading, spacing: 3) {
                Text(name).font(.subheadline.weight(.semibold))
                Text(detail).font(.caption).foregroundStyle(Theme.muted)
            }
            Spacer()
            if owned {
                Tag(text: "OWNED", color: Theme.green)
            } else {
                Button(money(cost), action: buy)
                    .primaryButton()
                    .controlSize(.small)
                    .disabled(!canBuy)
            }
        }
        .padding(.vertical, 6)
    }
}
