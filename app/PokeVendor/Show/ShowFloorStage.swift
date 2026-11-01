import SwiftUI

struct FloorStage: View {
    let session: ShowSession

    @Environment(GameStore.self) private var store

    var body: some View {
        ZStack {
            if let vendor = session.openVendor {
                VendorStage(session: session, vendor: vendor)
                    .transition(.move(edge: .trailing))
            } else {
                FloorList(session: session)
                    .transition(.move(edge: .leading))
            }
            // Someone stops the player on the way to a table.
            if let approach = session.approach {
                Color.black.opacity(0.6).ignoresSafeArea()
                VStack(spacing: 0) {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Someone stops you").font(.headline).padding(.top, 8)
                            VisitorCard(visitor: approach, asking: nil, tool: store.data.centeringTool)
                        }
                        .padding(16)
                    }
                    DealButtons(session: session, visitor: approach)
                }
                .background(Theme.background)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: session.approach?.id)
    }
}

private struct FloorList: View {
    @Environment(GameStore.self) private var store
    let session: ShowSession
    @State private var booth = false

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    if session.hasGradingBooth {
                        // On-site grading at a regional show (docs/20-card-shows.md).
                        Button { booth = true } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "seal").frame(width: 36, height: 36)
                                    .background(Theme.green.opacity(0.15), in: RoundedRectangle(cornerRadius: 8)).foregroundStyle(Theme.green)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("PSA grading booth").font(.subheadline.weight(.semibold))
                                    Text("\(money(Balance.onSiteGradingFee)) a card · the slab in hand the same day · about 20 minutes").font(.caption).foregroundStyle(Theme.muted)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.muted)
                            }
                            .padding(12)
                            .background(Theme.surface)
                            .overlay(Rectangle().stroke(Theme.green.opacity(0.5)))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .sheet(isPresented: $booth) { GradingBoothSheet(session: session) }
                    }
                    Text(session.venue.isShow ? "The floor · \(session.vendors.count) tables" : session.venue.name).font(.title3.bold())
                    Text(session.venue.isShow
                         ? "Each table is a dealer, a shop, or a person. Looking over a table takes about \(Int(Balance.vendorVisitMinutes)) minutes\(session.hasTable ? ", and buyers who come to your table meanwhile leave" : "")."
                         : "Look over what is out. A look takes about \(Int(Balance.vendorVisitMinutes)) minutes. The seller may come up to you.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                    ForEach(session.vendors) { vendor in
                        Button { withAnimation(.easeInOut(duration: 0.25)) { session.visit(vendor) } } label: {
                            HStack(spacing: 12) {
                                Image(systemName: vendor.kind.icon)
                                    .frame(width: 36, height: 36)
                                    .background((vendor.kind == .vintageDealer ? Color(red: 1, green: 0.8, blue: 0.3) : Theme.cyan).opacity(0.15),
                                                in: RoundedRectangle(cornerRadius: 8))
                                    .foregroundStyle(vendor.kind == .vintageDealer ? Color(red: 1, green: 0.8, blue: 0.3) : Theme.cyan)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(vendor.name).font(.subheadline.weight(.semibold))
                                    Text(vendor.kind.label).font(.caption).foregroundStyle(Theme.muted)
                                    Text(vendor.tags).font(.caption2.monospaced()).foregroundStyle(Theme.muted).lineLimit(1)
                                }
                                Spacer()
                                if let id = vendor.contactID {
                                    LevelBadge(level: store.level(id))
                                }
                                if vendor.visited {
                                    Text("SEEN").font(.system(size: 9, weight: .bold, design: .monospaced)).foregroundStyle(Theme.muted)
                                }
                                Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.muted)
                            }
                            .padding(12)
                            .background(Theme.surface)
                            .framed()
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(16)
            }
            HStack(spacing: 10) {
                if session.hasTable {
                    Button { withAnimation { session.backToTable() } } label: {
                        Text(session.opened ? "Back to my table" : "Set up the table").frame(maxWidth: .infinity)
                    }
                    .primaryButton()
                    .tint(Theme.cyan)
                } else {
                    Button { withAnimation { session.packUp() } } label: {
                        Text(session.venue.isShow ? "Leave the show" : "Leave").frame(maxWidth: .infinity)
                    }
                        .primaryButton()
                        .tint(Theme.cyan)
                }
            }
            .controlSize(.large)
            .padding(16)
        }
    }
}
