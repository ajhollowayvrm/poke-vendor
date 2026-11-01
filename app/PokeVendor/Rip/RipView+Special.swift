import SwiftUI

extension RipView {
    /// The rainbow light of a god pack. In the Hits only row of tears, only the god pack's own tear has it.
    var godLight: Bool {
        if let i = tearingIndex, model.combinedSlugs != nil { return i == model.godIndex }
        return model.special?.isGod == true
    }

    /// Hits only: a god pack plays its own moment before the stack, and waits for it to end.
    func playGodPack() async {
        guard let special = model.special, special.isGod else { return }
        try? await Task.sleep(for: .milliseconds(250))
        withAnimation(.easeIn(duration: 0.25)) { celebration = special }
        while celebration != nil { try? await Task.sleep(for: .milliseconds(150)) }
        try? await Task.sleep(for: .milliseconds(250))
    }
}
