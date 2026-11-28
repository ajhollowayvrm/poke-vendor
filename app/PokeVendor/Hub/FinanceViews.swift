import SwiftUI

// The Finances screen's own boxes (docs/08-ui-direction.md, Finances): what the player is worth, the money coming in,
// and how buyers pay.

/// What the player owns and owes, and the net worth that comes from it.
struct NetWorthBox: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let taxes = store.data.taxes.salesTaxOwed + store.data.taxes.incomeTaxOwed
        DetailBox(title: "Net worth") {
            HStack(alignment: .firstTextBaseline) {
                Text(money(store.netWorth)).font(.system(size: 26, weight: .semibold, design: .monospaced))
                    .foregroundStyle(store.netWorth >= 0 ? Theme.green : Theme.orange)
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Credit \(store.creditScore)").font(.subheadline.monospaced())
                    Text(store.creditRating).font(.caption).foregroundStyle(Theme.muted)
                }
            }
            Text("YOU OWN").font(.system(size: 10, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted).padding(.top, 2)
            line("Your cash", store.personalCash)
            if store.hasBusinessAccount { line("Business account", store.businessCash) }
            line("Inventory at market", store.marketValue - store.collectionValue)
            line("Collection (PC, master sets, showcase)", store.collectionValue)
            line("Owed to you (auction payouts, machine cash)", store.owedToPlayer)
            line("Store credit at game shops", store.shopCreditTotal)
            line("Pawned items", store.pawnedValue)
            Text("YOU OWE").font(.system(size: 10, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted).padding(.top, 2)
            line("Loans, line of credit, pawns, collections", -store.totalDebt)
            line("Taxes owed", -taxes)
            line("Unpaid PSA orders", -store.unpaidGradingTotal)
            line("Distributor bills", -store.payablesTotal)
            line("Store credit your customers hold", -store.storeCreditOwed)
            let held = store.committedBids(account: .personal) + (store.hasBusinessAccount ? store.committedBids(account: .business) : 0)
            if held > 0 {
                Text("Your auction top bids hold \(money(held)). It is not spent until you win.").font(.caption).foregroundStyle(Theme.muted)
            }
        }
    }

    /// A row with a value. A zero row does not show.
    @ViewBuilder private func line(_ label: String, _ value: Double) -> some View {
        if abs(value) >= 0.01 {
            HStack {
                Text(label).font(.caption)
                Spacer()
                Text(value < 0 ? "−" + money(-value) : money(value)).font(.caption.monospaced())
                    .foregroundStyle(value < 0 ? Theme.orange : Theme.text)
            }
        }
    }
}

/// Money that is on its way to the player: payouts, refunds, machine cash, credit, and items out for sale.
struct ComingInBox: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let payouts = store.data.auctionPayouts.sorted { $0.day < $1.day }
        let refunds = store.data.retail.missingShipments
        let machineCash = store.data.machines.reduce(0) { $0 + $1.cashBox }
        let shopCredit = store.data.shops.filter { $0.value.credit >= 0.01 }.sorted { $0.key < $1.key }
        let items = store.data.raw + store.data.slabs
        let listed = items.compactMap { c -> Double? in if case .listed(let l) = c.status { return l.price }; return nil }
            + store.data.sealed.compactMap { s -> Double? in if case .listed(let l) = s.status { return l.price }; return nil }
        let consigned = items.compactMap { c -> Double? in if case .consigned(let x) = c.status { return x.price * (1 - x.cut) }; return nil }
        let atHouse = items.compactMap { c -> Double? in if case .atAuctionHouse(let a) = c.status { return a.estimate }; return nil }
        let empty = payouts.isEmpty && refunds.isEmpty && machineCash < 0.01 && shopCredit.isEmpty && listed.isEmpty && consigned.isEmpty && atHouse.isEmpty
        if !empty {
            DetailBox(title: "Coming in") {
                ForEach(payouts) { p in
                    row(p.name, "\(p.house.rawValue) pays \(GameCalendar.date(p.day).text)", p.amount)
                }
                ForEach(refunds) { s in
                    row(s.name, "refund on \(GameCalendar.date(s.refundDay).text)", s.refund)
                }
                if machineCash >= 0.01 { row("Vending machine cash", "visit a machine to collect it", machineCash) }
                ForEach(shopCredit, id: \.key) { shop, state in
                    row("Store credit at \(shop)", "spend it at the shop", state.credit)
                }
                if !listed.isEmpty { row("\(listed.count) item\(listed.count == 1 ? "" : "s") listed online", "at your prices, before fees", listed.reduce(0, +)) }
                if !consigned.isEmpty { row("\(consigned.count) card\(consigned.count == 1 ? "" : "s") on consignment", "your share if they sell", consigned.reduce(0, +)) }
                if !atHouse.isEmpty { row("\(atHouse.count) slab\(atHouse.count == 1 ? "" : "s") at an auction house", "the house's estimate", atHouse.reduce(0, +)) }
            }
        }
    }

    private func row(_ title: String, _ detail: String, _ amount: Double) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline).lineLimit(2)
                Text(detail).font(.caption.monospaced()).foregroundStyle(Theme.muted)
            }
            Spacer()
            Text(money(amount)).font(.subheadline.monospaced())
        }
    }
}

/// How buyers pay at face-to-face sales, and what the payment fees cost (Model/Payments.swift).
struct PaymentsBox: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let today = store.day
        let fees = store.data.ledger.filter { today - $0.day < 28 && $0.category == .paymentFees }.reduce(0) { $0 - $1.amount }
        DetailBox(title: "Payments") {
            Picker("Accept", selection: Binding(get: { store.paymentPolicy }, set: { store.setPaymentPolicy($0) })) {
                ForEach(PaymentPolicy.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            .pickerStyle(.menu)
            Text(store.paymentPolicy.detail).font(.caption).foregroundStyle(Theme.muted)
            Text("It applies to every face-to-face sale: card shows, meets, your store counter, and Facebook Marketplace meetups. Payment fees in the last 28 days: \(money(max(0, fees))).")
                .font(.caption).foregroundStyle(Theme.muted)
        }
    }
}
