import SwiftUI

/// The payment policy for face-to-face sales (docs/25-payment-methods.md). It sits on the table setup screen.
struct PaymentPolicyPicker: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("PAYMENT").font(.system(size: 11, weight: .semibold)).kerning(0.8).foregroundStyle(Theme.muted)
            Picker("Payment", selection: Binding(get: { store.paymentPolicy }, set: { store.setPaymentPolicy($0) })) {
                ForEach(PaymentPolicy.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            .pickerStyle(.menu)
            Text(store.paymentPolicy.detail).font(.caption).foregroundStyle(Theme.muted)
            if !store.hasCardReader {
                Text("You have no card reader. Buyers who want to pay by card may walk. Buy one in Upgrades.")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
        }
    }
}

/// The same policy in Settings. It also applies to Facebook Marketplace meetups.
struct PaymentPolicySection: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        Section {
            Picker("Accept", selection: Binding(get: { store.paymentPolicy }, set: { store.setPaymentPolicy($0) })) {
                ForEach(PaymentPolicy.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            Text(store.paymentPolicy.detail).font(.caption).foregroundStyle(Theme.muted)
        } header: {
            Text("Payment policy")
        } footer: {
            Text("It applies to every face-to-face sale: card shows, meets, your store counter, and Facebook Marketplace meetups.")
        }
    }
}
