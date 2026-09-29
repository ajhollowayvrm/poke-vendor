import SwiftUI

/// A card that flips between its face and its back.
struct CardView: View {
    let card: RipCard
    var faceUp: Bool

    var body: some View {
        FlipCard(angle: faceUp ? 0 : 180, front: CardFace(card: card), back: CardBack())
    }
}

struct FlipCard<Front: View, Back: View>: View, Animatable {
    var angle: Double
    let front: Front
    let back: Back

    var animatableData: Double {
        get { angle }
        set { angle = newValue }
    }

    var body: some View {
        ZStack {
            front.opacity(angle < 90 ? 1 : 0)
            back
                .rotation3DEffect(.degrees(180), axis: (x: 0, y: 1, z: 0))
                .opacity(angle < 90 ? 0 : 1)
        }
        .rotation3DEffect(.degrees(angle), axis: (x: 0, y: 1, z: 0), perspective: 0.45)
    }
}

struct CardFace: View {
    let card: RipCard

    var body: some View {
        GeometryReader { geo in
            ZStack {
                if let energy = card.energy {
                    EnergyFace(type: energy)
                } else {
                    RemoteCardImage(url: card.imageURL, name: card.name)
                }
                if card.foil != .none {
                    FoilSheen(foil: card.foil)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .clipShape(RoundedRectangle(cornerRadius: geo.size.width * 0.05))
        }
    }
}

struct RemoteCardImage: View {
    let url: URL?
    let name: String
    /// True for a card: a sideways scan (a BREAK card) turns to portrait. False for a product image.
    let upright: Bool
    @State private var image: UIImage?

    init(url: URL?, name: String, upright: Bool = true) {
        self.url = url
        self.name = name
        self.upright = upright
        _image = State(initialValue: url.flatMap { ImageStore.shared.cached($0) })
    }

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                Color(white: 0.2)
                VStack(spacing: 8) {
                    ProgressView()
                    Text(name).font(.caption).foregroundStyle(.white.opacity(0.8))
                }
            }
        }
        .task(id: url) {
            guard image == nil, let url else { return }
            image = await ImageStore.shared.load(url, upright: upright)
        }
    }
}

/// A moving rainbow shine for holo, reverse holo, and pattern cards.
struct FoilSheen: View {
    let foil: Foil

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            let shift = sin(t * 0.9) * 0.35 + Motion.shared.roll * 0.8
            LinearGradient(colors: foil.colors,
                           startPoint: UnitPoint(x: -0.3 + shift, y: -0.2),
                           endPoint: UnitPoint(x: 0.7 + shift, y: 1.2))
                .blendMode(.overlay)
                .opacity(foil.strength)
        }
        .allowsHitTesting(false)
    }
}

struct CardBack: View {
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            ZStack {
                RoundedRectangle(cornerRadius: w * 0.05)
                    .fill(Color(red: 0.16, green: 0.33, blue: 0.66))
                RoundedRectangle(cornerRadius: w * 0.035)
                    .fill(RadialGradient(colors: [Color(red: 0.36, green: 0.62, blue: 0.95),
                                                  Color(red: 0.05, green: 0.16, blue: 0.40)],
                                         center: .center, startRadius: 0, endRadius: w * 0.8))
                    .padding(w * 0.055)
                PokeBall()
                    .frame(width: w * 0.36, height: w * 0.36)
            }
        }
    }
}

struct PokeBall: View {
    var body: some View {
        GeometryReader { geo in
            let d = geo.size.width
            ZStack {
                Circle().fill(.white)
                Rectangle()
                    .fill(Color(red: 0.86, green: 0.15, blue: 0.15))
                    .frame(height: d / 2)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .clipShape(Circle())
                Rectangle().fill(.black).frame(height: d * 0.08)
                Circle().fill(.white).frame(width: d * 0.32)
                Circle().stroke(.black, lineWidth: d * 0.06).frame(width: d * 0.32)
                Circle().stroke(.black, lineWidth: d * 0.05)
            }
        }
    }
}

struct EnergyFace: View {
    let type: EnergyType

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            ZStack {
                LinearGradient(colors: [Color(white: 0.97), Color(white: 0.80)], startPoint: .top, endPoint: .bottom)
                RoundedRectangle(cornerRadius: w * 0.04)
                    .strokeBorder(Color(red: 0.95, green: 0.78, blue: 0.2), lineWidth: w * 0.045)
                VStack(spacing: w * 0.07) {
                    Text("Basic \(type.rawValue) Energy")
                        .font(.system(size: w * 0.075, weight: .bold))
                        .foregroundStyle(.black)
                    ZStack {
                        Circle().fill(type.color)
                        Image(systemName: type.symbol)
                            .font(.system(size: w * 0.22, weight: .bold))
                            .foregroundStyle(.white)
                    }
                    .frame(width: w * 0.5, height: w * 0.5)
                    .shadow(radius: 3)
                    Text("ENERGY")
                        .font(.system(size: w * 0.06, weight: .heavy))
                        .kerning(2)
                        .foregroundStyle(.black.opacity(0.6))
                }
            }
        }
    }
}
