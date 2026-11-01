import SwiftUI

extension RipView {
    func tearGesture(_ layout: TableLayout) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                guard model.phase == .sealed else { return }
                if tearProgress == 0, abs(value.translation.width) > 2 {
                    tearFromLeft = value.translation.width > 0
                }
                tearProgress = min(1, abs(value.translation.width) / (layout.packW * 0.8))
                // The foil clicks and sheds flecks as the tear moves.
                let step = Int(tearProgress * 14)
                if step > tearTicks {
                    tearTicks = step
                    Haptics.tick(0.3 + 0.5 * tearProgress)
                    addFlecks(layout, count: 5)
                }
            }
            .onEnded { value in
                let moved = abs(value.translation.width)
                if moved < 8 || tearProgress > 0.45 || abs(value.predictedEndTranslation.width) > layout.packW * 0.8 {
                    tear()
                } else {
                    tearTicks = 0
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { tearProgress = 0 }
                }
            }
    }

    /// The height of the tear line on the screen.
    func tearY(_ layout: TableLayout) -> CGFloat {
        layout.packCenter.y - layout.packH / 2 + layout.packH * PackView.tearLine
    }

    func addFlecks(_ layout: TableLayout, count: Int, across: Bool = false) {
        let left = layout.packCenter.x - layout.packW / 2
        let x = across ? layout.packCenter.x
            : left + layout.packW * (tearFromLeft ? tearProgress : 1 - tearProgress)
        let colors = godLight
            ? [.pink, .yellow, .green, .cyan, .purple, .white]
            : PackArt.colors(model.cardSet.slug) + [.white, Color(white: 0.85)]
        let now = Date()
        flecks.removeAll { now.timeIntervalSince($0.start) > TearFlecks.life }
        flecks.append(FleckBurst(point: CGPoint(x: x, y: tearY(layout)), count: count, colors: colors,
                                 drift: across ? 0 : (tearFromLeft ? 1 : -1)))
    }

    func tear() {
        guard model.phase == .sealed else { return }
        if model.willCombine {
            tearAll()
            return
        }
        Haptics.tap(.medium)
        model.startOpening()
        // The tear runs to the far edge, then the strip flies off and light comes out of the pack.
        withAnimation(.easeOut(duration: 0.12)) { tearProgress = 1 }
        Task {
            try? await Task.sleep(for: .milliseconds(110))
            Haptics.tap(.heavy)
            if let layout = lastLayout { addFlecks(layout, count: 26, across: true) }
            withAnimation(.easeOut(duration: 0.45)) { torn = true }
            withAnimation(.easeOut(duration: 0.12)) { openFlash = 1 }
            withAnimation(.easeIn(duration: 0.6).delay(0.15)) { openFlash = 0.001 }
            try? await Task.sleep(for: .milliseconds(300))
            withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) { cardsRise = true }
            try? await Task.sleep(for: .milliseconds(500))
            withAnimation(.easeIn(duration: 0.45)) { packGone = true }
            withAnimation(.spring(response: 0.55, dampingFraction: 0.8)) {
                cardsRise = false
                cardsOut = true
            }
            try? await Task.sleep(for: .milliseconds(450))
            model.finishOpening()
            if skipAfterOpen {
                skipAfterOpen = false
                skipPack()
            }
        }
    }

    /// Hits only: one swipe tears every pack in a row, then all the hit slots come out as one stack.
    func tearAll() {
        Haptics.tap(.medium)
        tearingIndex = 0
        model.startOpening()
        let total = model.combinedSlugs?.count ?? 1
        // A long queue plays at most 12 tears, and each tear opens a share of the packs. The counter still
        // counts every pack, so three booster boxes do not take a minute.
        let tears = min(total, 12)
        let step = max(0.25, min(0.5, 3.0 / Double(tears)))
        Task {
            for k in 0..<tears {
                let first = k * total / tears, i = (k + 1) * total / tears - 1
                if k == 0 { tearingIndex = i }
                if k > 0 {
                    var still = Transaction()
                    still.disablesAnimations = true
                    withTransaction(still) {
                        torn = false
                        tearProgress = 0
                        packGone = false
                    }
                    withAnimation(.spring(response: 0.25, dampingFraction: 0.85)) { tearingIndex = i }
                    try? await Task.sleep(for: .seconds(step * 0.3))
                }
                withAnimation(.easeOut(duration: step * 0.25)) { tearProgress = 1 }
                try? await Task.sleep(for: .seconds(step * 0.25))
                Haptics.tap(k == tears - 1 ? .heavy : .medium)
                if let layout = lastLayout { addFlecks(layout, count: k == tears - 1 ? 26 : 10, across: true) }
                withAnimation(.easeOut(duration: step * 0.6)) { torn = true }
                withAnimation(.easeOut(duration: 0.1)) { openFlash = 1 }
                withAnimation(.easeIn(duration: step).delay(0.1)) { openFlash = 0.001 }
                try? await Task.sleep(for: .seconds(step * 0.45))
                if k < tears - 1 {
                    withAnimation(.easeIn(duration: step * 0.4)) { packGone = true }
                    try? await Task.sleep(for: .seconds(step * 0.3))
                }
                if let god = model.godIndex, (first...i).contains(god) { await playGodPack() }
            }
            withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) { cardsRise = true }
            try? await Task.sleep(for: .milliseconds(500))
            withAnimation(.easeIn(duration: 0.45)) { packGone = true }
            withAnimation(.spring(response: 0.55, dampingFraction: 0.8)) {
                cardsRise = false
                cardsOut = true
            }
            try? await Task.sleep(for: .milliseconds(450))
            tearingIndex = nil
            model.finishOpening()
            if skipAfterOpen {
                skipAfterOpen = false
                skipPack()
            }
        }
    }
}
