import SwiftUI

/// The tax due and the tax set aside, with the due days (docs/26-taxes.md). It sits in the Wallet.
struct TaxBox: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let taxes = store.data.taxes
        let estimate = store.incomeTaxEstimate
        DetailBox(title: "Taxes") {
            HStack(spacing: 0) {
                StatCell(label: "Set aside", value: money(taxes.salesTaxOwed), color: Theme.cyan)
                StatCell(label: "Income tax, so far", value: money(estimate), color: Theme.text)
                StatCell(label: "Yours to spend", value: money(store.cash - taxes.salesTaxOwed - taxes.incomeTaxOwed))
            }
            row("Sales tax", money(taxes.salesTaxOwed), due: store.daysUntilSalesTax,
                note: "The buyers paid this at your store and your table. It is not your money.")
            row("Estimated income tax", money(taxes.incomeTaxOwed + estimate), due: store.daysUntilIncomeTax,
                note: "\(Int(Balance.incomeTaxRate * 100))% of the net profit from card sales this quarter. A loss lowers the next quarter.")
            if taxes.salesTaxOwed >= 0.01 {
                Button("Pay the sales tax now · \(money(taxes.salesTaxOwed))") { store.payTaxes(income: false) }
                    .buttonStyle(.bordered)
                    .disabled(!store.canAfford(taxes.salesTaxOwed))
            }
            if taxes.incomeTaxOwed >= 0.01 {
                Text("You owe \(money(taxes.incomeTaxOwed)) of income tax from an earlier quarter. It includes the penalty.")
                    .font(.caption).foregroundStyle(Theme.orange)
                Button("Pay the back tax now · \(money(taxes.incomeTaxOwed))") { store.payTaxes(income: true) }
                    .buttonStyle(.bordered)
                    .tint(Theme.orange)
                    .disabled(!store.canAfford(taxes.incomeTaxOwed))
            }
            Divider().overlay(Theme.line)
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Seller's permit").font(.subheadline)
                    Text(store.hasSellerPermit ? "You have one." : "A landlord wants one before a store lease.")
                        .font(.caption).foregroundStyle(Theme.muted)
                }
                Spacer()
                if store.hasSellerPermit {
                    Tag(text: "HAVE IT", color: Theme.green)
                } else {
                    Button("Get it · \(money(Balance.sellerPermitFee))") { store.getSellerPermit() }
                        .buttonStyle(.bordered)
                        .disabled(!store.canAfford(Balance.sellerPermitFee))
                }
            }
            Text("Online sales this year: \(money(taxes.platformYear == store.day / Balance.platformReportYearDays ? taxes.platformSales : 0)). TCGplayer, eBay, and Whatnot pay the sales tax and report the sales above \(money(Balance.platformReportThreshold)).")
                .font(.caption).foregroundStyle(Theme.muted)
        }
    }

    private func row(_ title: String, _ amount: String, due: Int, note: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(title).font(.subheadline)
                Spacer()
                Text(amount).font(.subheadline.monospaced().weight(.semibold))
            }
            Text("Due in \(due) day\(due == 1 ? "" : "s"), on day \(store.day + due + 1). \(note)")
                .font(.caption).foregroundStyle(due <= Balance.taxWarningDays ? Theme.orange : Theme.muted)
        }
    }
}
