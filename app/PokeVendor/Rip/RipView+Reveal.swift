import SwiftUI

extension RipView {
    /// The cards the table draws: the top of the pile and the front of the stack, plus the back card for the
    /// pack trick. The other cards sit under them and do not show (a Hits only stack can hold hundreds).
    var visibleCards: [RipCard] {
        let n = RipModel.window
        guard model.allCards.count > n * 2 else { return model.allCards }
        var cards = Array(model.pile.suffix(n)) + Array(model.stack.prefix(n))
        if let last = model.stack.last, model.stack.count > n { cards.append(last) }
        return cards
    }

    /// About half of a card's flip. A face shows only after it turns past edge-on.
    static let revealDelay = 260

    /// Changes whenever a card might turn face up.
    var revealKey: String {
        "\(model.focusCard?.id.uuidString ?? "")|\(model.pile.last?.id.uuidString ?? "")|\(model.stack.first?.id.uuidString ?? "")|\(model.faceUp)|\(model.showcaseID?.uuidString ?? "")"
    }

    func settleReveal() {
        // No card shows before the pack is open, also when the Hits only tear builds the stack early.
        let open = model.phase == .open || model.phase == .done
        infoCard = open ? model.focusCard : nil
        pileTop = model.pile.last
        settledTopID = open ? model.stack.first.flatMap { model.isShownFaceUp($0) ? $0.id : nil } : nil
    }

    func inStack(_ card: RipCard) -> Bool {
        model.stack.contains { $0.id == card.id }
    }

    /// The top card, when it shows face up and is a medium or big hit.
    var glowCard: RipCard? {
        guard model.phase == .open || model.phase == .done, model.tuckingID == nil, !flipping,
              let front = model.stack.first, front.id == settledTopID, model.isShownFaceUp(front),
              front.hitTier >= .medium else { return nil }
        return front
    }

    func placement(for card: RipCard, layout: TableLayout) -> Placement {
        if let j = model.pile.firstIndex(where: { $0.id == card.id }) {
            return Placement(point: layout.pileCenter, scale: layout.pileScale, rotation: card.tilt,
                             z: 100 + Double(j), faceUp: true)
        }
        let i = model.stack.firstIndex(where: { $0.id == card.id }) ?? 0
        let center = layout.stackCenter
        if model.phase == .opening && !cardsOut {
            let y = cardsRise ? center.y - layout.packH * 0.42 : center.y + 20
            return Placement(point: CGPoint(x: layout.packCenter.x, y: y), scale: 1, rotation: 0,
                             z: 50 - Double(i), faceUp: model.faceUp)
        }
        if card.id == model.tuckingID {
            // From the back, the card slides out behind the stack. From the top, it slides out over it.
            return Placement(point: CGPoint(x: center.x - layout.cardW * 0.8, y: center.y + 16), scale: 0.96,
                             rotation: -9, z: model.tuckFromBack ? -10 : 200, faceUp: model.faceUp)
        }
        let depth = CGFloat(min(i, 10))
        return Placement(point: CGPoint(x: center.x + depth * 0.5, y: center.y - depth * 1.3),
                         scale: card.id == popID ? 1.08 : 1,
                         rotation: 0, z: 50 - Double(i), faceUp: model.isShownFaceUp(card))
    }

    /// A tap sends the front card to the pile. A hold shows the peek until the finger lifts.
    var stackGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                if !pressing {
                    pressing = true
                    peekTask = Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(350))
                        guard !Task.isCancelled else { return }
                        Haptics.tap(.medium)
                        withAnimation(.easeOut(duration: 0.2)) { peeking = true }
                    }
                }
                if !peeking && hypot(value.translation.width, value.translation.height) > 14 {
                    peekTask?.cancel()
                }
            }
            .onEnded { value in
                peekTask?.cancel()
                pressing = false
                let distance = hypot(value.translation.width, value.translation.height)
                if peeking {
                    withAnimation(.easeIn(duration: 0.18)) { peeking = false }
                } else if model.mode != .normal, !model.paused {
                    // A tap pauses Fast and Sift (docs/18, Picking the mode).
                    autoTask?.cancel()
                    model.paused = true
                    Haptics.tap()
                } else if distance < 14 || value.translation.height < -50 {
                    sendFront()
                }
            }
    }

    func sendFront() {
        guard model.phase == .open, model.tuckingID == nil, let card = model.stack.first else { return }
        // A face-down medium or big hit flips in place first, so the player sees it at full size.
        if !model.faceUp, card.hitTier >= .medium, model.showcaseID != card.id {
            withAnimation(.spring(response: 0.55, dampingFraction: 0.7)) { model.showcaseFront() }
            return
        }
        Haptics.tap()
        withAnimation(.spring(response: 0.45, dampingFraction: 0.84)) { model.sendFrontToPile() }
    }

    func celebrate(_ card: RipCard) {
        let next = HitBurst(card: card)
        burst = next
        Haptics.celebrate(card.hitTier)
        if card.hitTier >= .medium, model.stack.first?.id == card.id {
            withAnimation(.spring(response: 0.25, dampingFraction: 0.5)) { popID = card.id }
            Task {
                try? await Task.sleep(for: .milliseconds(260))
                withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) { popID = nil }
            }
        }
        Task {
            try? await Task.sleep(for: .seconds(card.hitTier == .big ? 3.0 : 2.2))
            if burst?.id == next.id {
                withAnimation(.easeOut(duration: 0.4)) { burst = nil }
            }
        }
    }

    /// The set's pack trick: it moves its number of cards one by one, then the stack turns face up.
    func moveToBack() {
        let moves = model.trickCount
        guard model.beginTrick() else { return }
        Task {
            for _ in 0..<moves {
                Haptics.tap()
                withAnimation(.easeOut(duration: 0.14)) { model.startTuck() }
                try? await Task.sleep(for: .milliseconds(150))
                withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { model.finishTuck() }
                try? await Task.sleep(for: .milliseconds(260))
            }
            if !model.faceUp {
                try? await Task.sleep(for: .milliseconds(380))
                flipStack(force: true)
            }
        }
    }

    /// Turns the whole stack over. The order reverses while the stack is edge-on, so no card jumps.
    /// After the pack trick, the stack stays face up for the rest of the pack.
    func flipStack(force: Bool = false) {
        guard !flipping, model.tuckingID == nil, force || !model.trickDone else { return }
        guard model.phase == .open || model.phase == .done else {
            model.setFaceUp(!model.faceUp)
            return
        }
        flipping = true
        Haptics.tap()
        withAnimation(.easeIn(duration: 0.16)) { stackTurn = 90 }
        Task {
            try? await Task.sleep(for: .milliseconds(160))
            var still = Transaction()
            still.disablesAnimations = true
            withTransaction(still) { model.setFaceUp(!model.faceUp) }
            withAnimation(.easeOut(duration: 0.2)) { stackTurn = 0 }
            try? await Task.sleep(for: .milliseconds(200))
            flipping = false
        }
    }
}
