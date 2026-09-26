import SwiftUI

enum EnergyType: String, CaseIterable {
    case grass = "Grass", fire = "Fire", water = "Water", lightning = "Lightning"
    case psychic = "Psychic", fighting = "Fighting", darkness = "Darkness", metal = "Metal"

    var color: Color {
        switch self {
        case .grass: Color(red: 0.30, green: 0.66, blue: 0.29)
        case .fire: Color(red: 0.89, green: 0.30, blue: 0.18)
        case .water: Color(red: 0.20, green: 0.52, blue: 0.87)
        case .lightning: Color(red: 0.96, green: 0.76, blue: 0.10)
        case .psychic: Color(red: 0.62, green: 0.33, blue: 0.72)
        case .fighting: Color(red: 0.74, green: 0.42, blue: 0.20)
        case .darkness: Color(red: 0.18, green: 0.24, blue: 0.30)
        case .metal: Color(red: 0.55, green: 0.60, blue: 0.64)
        }
    }

    var symbol: String {
        switch self {
        case .grass: "leaf.fill"
        case .fire: "flame.fill"
        case .water: "drop.fill"
        case .lightning: "bolt.fill"
        case .psychic: "eye.fill"
        case .fighting: "hand.raised.fill"
        case .darkness: "moon.fill"
        case .metal: "shield.fill"
        }
    }
}

enum Foil {
    case none, reverse, pokeBall, masterBall, holo, gold

    init(variant: String) {
        if variant.contains("Poké Ball") { self = .pokeBall }
        else if variant.contains("Master Ball") { self = .masterBall }
        else if variant.hasPrefix("Reverse holo") { self = .reverse }
        else if variant.contains("Gold") { self = .gold }
        else if variant.hasPrefix("Holo") { self = .holo }
        else { self = .none }
    }

    var colors: [Color] {
        switch self {
        case .none: [.clear]
        case .gold: [.clear, .yellow, .white, .orange, .clear]
        case .pokeBall: [.clear, .red, .white, .red, .clear]
        case .masterBall: [.clear, .purple, .pink, .white, .purple, .clear]
        case .reverse, .holo: [.clear, .red, .yellow, .green, .cyan, .blue, .purple, .clear]
        }
    }

    var strength: Double {
        switch self {
        case .none: 0
        case .reverse: 0.28
        case .pokeBall, .masterBall: 0.38
        case .holo, .gold: 0.45
        }
    }
}

/// One physical card in the pack.
struct RipCard: Identifiable, Hashable {
    let id = UUID()
    /// The small random turn of the card on the pile.
    let tilt = Double.random(in: -5...5)
    let print: CardPrint?
    let energy: EnergyType?

    var name: String { print?.name ?? "Basic \(energy?.rawValue ?? "") Energy" }
    var market: Double { print?.market ?? 0 }
    var imageURL: URL? { print?.image.flatMap(URL.init(string:)) }
    var foil: Foil { print.map { Foil(variant: $0.variant) } ?? .none }

    var subtitle: String {
        guard let print else { return "Basic Energy" }
        return "\(print.rarity) · \(print.variant) · \(print.num)"
    }

    /// A hit is rare or higher, or worth $1 or more (docs/18-ripping.md, What counts as a hit).
    var isHit: Bool {
        guard let print else { return false }
        return !["Common", "Uncommon"].contains(print.rarity) || market >= 1
    }
}
