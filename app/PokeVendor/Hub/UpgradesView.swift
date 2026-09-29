import SwiftUI

/// Every upgrade in the game (docs/09-upgrades.md).
struct UpgradesView: View {
    @Environment(GameStore.self) private var store

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
                    ForEach([Upgrade.cornerLoupe, .edgeLight, .surfaceLamp], id: \.self) { upgradeRow($0) }
                }
                DetailBox(title: "Selling and shows") {
                    row(name: "Vendor kit", detail: Balance.vendorKitDetail, cost: Balance.vendorKitCost, owned: store.data.vendorKit,
                        icon: "tablecells", canBuy: store.canAfford(Balance.vendorKitCost)) { store.buyVendorKit() }
                    upgradeRow(.evReadout)
                    upgradeRow(.salesAnalytics)
                    upgradeRow(.authTool)
                }
                DetailBox(title: "Contacts") {
                    upgradeRow(.contactBook)
                    upgradeRow(.bigContactBook)
                }
                DetailBox(title: "Buying") {
                    upgradeRow(.betterCar)
                    upgradeRow(.dropDiscord)
                    upgradeRow(.restockBot)
                }
                DetailBox(title: "Social media") {
                    row(name: "Analytics", detail: "The likes and the reach factors of each post, plus burnout and authenticity meters.",
                        cost: Balance.analyticsUpgradeCost, owned: store.social.analytics, icon: "chart.bar",
                        canBuy: store.hasAccount && store.canAfford(Balance.analyticsUpgradeCost)) { store.buyAnalytics() }
                    upgradeRow(.studioLights)
                    upgradeRow(.cameraKit)
                }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Upgrades")
        .navigationBarTitleDisplayMode(.inline)
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
                    .buttonStyle(.borderedProminent)
                    .foregroundStyle(.black)
                    .controlSize(.small)
                    .disabled(!canBuy)
            }
        }
        .padding(.vertical, 6)
    }
}
