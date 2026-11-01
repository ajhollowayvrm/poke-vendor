import SwiftUI

/// The product was resealed: the rip stops here in every mode (docs/14-counterfeit-risk.md; docs/18, The stop rule).
struct ResealedBanner: View {
    let onDismiss: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.6).ignoresSafeArea()
            VStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 40)).foregroundStyle(Theme.orange)
                Text("RESEALED").font(.system(size: 28, weight: .black, design: .monospaced)).foregroundStyle(Theme.orange)
                Text("Someone opened this product, took the hits, and sealed it again. Only filler is left. Every pack from it is worthless.")
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Theme.text)
                Button(action: onDismiss) { Text("Continue").frame(maxWidth: .infinity) }
                    .primaryButton()
                    .tint(Theme.orange)
                    .controlSize(.large)
            }
            .padding(20)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.orange.opacity(0.6)))
            .padding(28)
        }
    }
}
