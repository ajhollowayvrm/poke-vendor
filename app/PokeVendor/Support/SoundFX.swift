import AVFoundation

/// Short sounds that the app makes in code, so it ships no audio files. The sounds follow the mute switch.
@MainActor
final class SoundFX {
    enum Sound: CaseIterable {
        case hitSmall, hitBig, sale, loss, slab, endDay, goal

        /// Frequency in hertz and length in seconds of each note.
        var notes: [(Double, Double)] {
            switch self {
            case .hitSmall: [(880, 0.07), (1175, 0.1)]
            case .hitBig: [(659, 0.08), (880, 0.08), (1175, 0.08), (1568, 0.22)]
            case .sale: [(1319, 0.05), (1760, 0.11)]
            case .loss: [(392, 0.09), (311, 0.16)]
            case .slab: [(523, 0.07), (784, 0.07), (1047, 0.16)]
            case .endDay: [(494, 0.08), (370, 0.13)]
            case .goal: [(523, 0.1), (659, 0.1), (784, 0.1), (1047, 0.1), (1319, 0.34)]
            }
        }
    }

    static let shared = SoundFX()
    static let settingKey = "sound.on"

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)
    private var buffers: [Sound: AVAudioPCMBuffer] = [:]
    private var ready = false

    static var isOn: Bool { UserDefaults.standard.object(forKey: settingKey) as? Bool ?? true }

    func play(_ sound: Sound) {
        guard Self.isOn else { return }
        #if DEBUG
        // A soak run plays no sound.
        guard !ProcessInfo.processInfo.arguments.contains("-soak") else { return }
        #endif
        start()
        guard ready, let buffer = buffer(for: sound) else { return }
        player.scheduleBuffer(buffer, at: nil, options: .interrupts)
        player.play()
    }

    private func start() {
        guard !ready, let format else { return }
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: .mixWithOthers)
        try? AVAudioSession.sharedInstance().setActive(true)
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
        ready = (try? engine.start()) != nil
    }

    private func buffer(for sound: Sound) -> AVAudioPCMBuffer? {
        if let made = buffers[sound] { return made }
        guard let format else { return nil }
        let rate = format.sampleRate
        let frames = sound.notes.reduce(0) { $0 + Int($1.1 * rate) }
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)),
              let out = buffer.floatChannelData?[0] else { return nil }
        var i = 0
        for (hertz, seconds) in sound.notes {
            let count = Int(seconds * rate)
            for n in 0..<count {
                let t = Double(n) / rate
                // A fast attack and a soft fade, so a note has no click.
                let envelope = min(1, t / 0.005) * pow(1 - Double(n) / Double(count), 1.5)
                let wave = sin(2 * .pi * hertz * t) + 0.25 * sin(4 * .pi * hertz * t)
                out[i] = Float(0.22 * envelope * wave)
                i += 1
            }
        }
        buffer.frameLength = AVAudioFrameCount(frames)
        buffers[sound] = buffer
        return buffer
    }
}
