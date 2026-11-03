import SwiftUI

/// The coin for a flip at a show. It spins, lands, and shows who won. Heads: the player wins.
struct CoinFlipView: View {
    let flip: CoinFlip
    let done: () -> Void
    @State private var angle = 0.0
    @State private var landed = false

    /// Eight full turns, plus a half turn when the coin lands on tails.
    private var target: Double { 360 * 8 + (flip.playerWon ? 0 : 180) }

    var body: some View {
        ZStack {
            Color.black.opacity(0.6).ignoresSafeArea()
            VStack(spacing: 20) {
                SpinningCoin(angle: angle)
                    .frame(width: 140, height: 140)
                VStack(spacing: 6) {
                    Text(flip.playerWon ? "HEADS" : "TAILS")
                        .font(.system(size: 28, weight: .heavy, design: .monospaced))
                        .foregroundStyle(flip.playerWon ? Theme.green : Theme.orange)
                    Text(flip.line).font(.subheadline).multilineTextAlignment(.center)
                }
                .opacity(landed ? 1 : 0)
                Button("Continue", action: done)
                    .primaryButton()
                    .tint(Theme.line)
                    .opacity(landed ? 1 : 0)
                    .disabled(!landed)
            }
            .padding(24)
        }
        .task {
            withAnimation(.easeOut(duration: 1.4)) { angle = target }
            try? await Task.sleep(for: .seconds(1.4))
            Haptics.tap(.medium)
            if flip.playerWon { Haptics.hit() }
            withAnimation(.easeOut(duration: 0.25)) { landed = true }
        }
    }
}

/// A coin that turns on its vertical axis. The face toward the player shows H or T.
private struct SpinningCoin: View, Animatable {
    var angle: Double

    var animatableData: Double {
        get { angle }
        set { angle = newValue }
    }

    var body: some View {
        let turn = angle.truncatingRemainder(dividingBy: 360)
        let heads = turn < 90 || turn >= 270
        ZStack {
            Circle().fill(LinearGradient(colors: [Color(red: 1, green: 0.85, blue: 0.4), Color(red: 0.8, green: 0.6, blue: 0.15)],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
            Circle().strokeBorder(Color(red: 0.6, green: 0.45, blue: 0.1), lineWidth: 6)
            Text(heads ? "H" : "T")
                .font(.system(size: 56, weight: .heavy, design: .rounded))
                .foregroundStyle(Color(red: 0.5, green: 0.35, blue: 0.05))
                .scaleEffect(x: heads ? 1 : -1)
        }
        .rotation3DEffect(.degrees(angle), axis: (x: 0, y: 1, z: 0), perspective: 0.4)
    }
}
