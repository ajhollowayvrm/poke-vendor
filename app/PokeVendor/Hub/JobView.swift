import SwiftUI

/// The day job: the current job, time off, the job board, and skips (docs/16-time-and-day.md).
struct JobView: View {
    @Environment(GameStore.self) private var store
    @State private var message: String?
    @State private var confirmQuit = false

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                if let message { Banner(text: message, color: Theme.cyan, icon: "info.circle.fill") }
                current
                timeOff
                board
                skips
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Job")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Quit your job?", isPresented: $confirmQuit, titleVisibility: .visible) {
            Button("Quit", role: .destructive) { store.quitJob() }
        } message: {
            Text("No more paychecks. The sick days and the time off are lost. Rent is still due every 4 weeks.")
        }
    }

    private var current: some View {
        DetailBox(title: "Your job") {
            if let job = store.job {
                HStack(spacing: 0) {
                    StatCell(label: "Title", value: job.title)
                    StatCell(label: "Weekly pay", value: money(job.weeklyPay), color: Theme.green)
                    StatCell(label: "Sick days", value: "\(store.data.sickDaysLeft)")
                }
                Text("Monday to Friday, 9 AM – 5 PM. Payday is Friday. \(money(job.hourly, decimals: 0)) an hour.")
                    .font(.caption).foregroundStyle(Theme.muted)
                Text("Days worked here: \(store.data.jobState.daysWorked[store.data.jobIndex ?? -1] ?? 0).")
                    .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                Button("Quit", role: .destructive) { confirmQuit = true }
                    .buttonStyle(.bordered)
                    .tint(Theme.orange)
            } else {
                Text("No job. Apply on the board below. Rent is still due every 4 weeks.").font(.subheadline).foregroundStyle(Theme.orange)
            }
        }
    }

    private var timeOff: some View {
        DetailBox(title: "Time off · \(store.timeOffDays) day\(store.timeOffDays == 1 ? "" : "s") in the bank") {
            if let job = store.job {
                Text("You earn 1 day every \(job.timeOffWeeks) weeks. Book it in advance for a work day. A sick day is for the same morning.")
                    .font(.caption).foregroundStyle(Theme.muted)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(1...14, id: \.self) { offset in
                            let d = store.day + offset
                            let booked = store.data.jobState.timeOffBooked.contains(d)
                            let weekend = d % 7 >= 5
                            Button {
                                if booked { store.cancelTimeOff(d) } else { store.bookTimeOff(d) }
                            } label: {
                                VStack(spacing: 2) {
                                    Text(String(GameStore.weekdays[d % 7].prefix(3))).font(.caption.weight(.semibold))
                                    Text("D\(d + 1)").font(.caption2.monospaced())
                                    Text(weekend ? "off" : booked ? "booked" : "work").font(.caption2)
                                        .foregroundStyle(booked ? Theme.green : weekend ? Theme.muted : Theme.orange)
                                }
                                .frame(width: 60, height: 56)
                                .background(booked ? Theme.green.opacity(0.15) : Theme.background)
                                .overlay(Rectangle().stroke(booked ? Theme.green : Theme.line))
                            }
                            .buttonStyle(.plain)
                            .disabled(weekend || (!booked && !store.canBookTimeOff(d)))
                        }
                    }
                }
                if !store.data.jobState.timeOffBooked.isEmpty {
                    Text("Booked: \(store.data.jobState.timeOffBooked.sorted().map { "day \($0 + 1)" }.joined(separator: ", ")). Tap a booked day to cancel it.")
                        .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                }
            } else {
                Text("Time off comes with a job.").font(.caption).foregroundStyle(Theme.muted)
            }
        }
    }

    private var board: some View {
        DetailBox(title: "Job board") {
            Text("Applying is free, once a day for each job. Hiring is a dice roll. The next job opens after \(Balance.jobOpensAfterDays / 7) weeks at the job below it or higher.")
                .font(.caption).foregroundStyle(Theme.muted)
            ForEach(Array(Job.ladder.enumerated()), id: \.offset) { i, job in
                let open = store.jobOpen(i)
                let mine = store.data.jobIndex == i
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(job.title).font(.subheadline.weight(.semibold)).foregroundStyle(open ? Theme.text : Theme.muted)
                        Text("\(money(job.weeklyPay)) a week · \(job.sickDays) sick days · \(Int(job.hireChance * 100))% hire chance")
                            .font(.caption.monospaced()).foregroundStyle(Theme.muted)
                        if !open {
                            Text("Opens after \(Balance.jobOpensAfterDays) days at \(Job.ladder[i - 1].title) or higher · \(store.daysToward(i)) so far")
                                .font(.caption2).foregroundStyle(Theme.orange)
                        }
                    }
                    Spacer()
                    if mine {
                        Tag(text: "YOURS", color: Theme.green)
                    } else {
                        Button(store.data.jobState.appliedDay[i] == store.day ? "Applied" : "Apply") {
                            let hired = store.apply(i)
                            message = hired ? "You got the job: \(job.title)." : "\(job.title): they went with someone else. Try again tomorrow."
                        }
                        .buttonStyle(.borderedProminent)
                        .foregroundStyle(.black)
                        .controlSize(.small)
                        .disabled(!store.canApply(i))
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }

    private var skips: some View {
        DetailBox(title: "Unexcused skips") {
            let count = store.data.jobState.unexcused.count
            Text(count == 0 ? "None in the last 4 weeks." : "\(count) in the last 4 weeks. The next one is \(Int(Balance.firedChances[min(count, Balance.firedChances.count - 1)] * 100))% to get you fired.")
                .font(.subheadline)
            Text("A skip is an unpaid day: \(store.job.map { money($0.weeklyPay / 5) } ?? "$0") off the paycheck. Fired 25%, 50%, then 100%. The count resets after 4 clean weeks.")
                .font(.caption).foregroundStyle(Theme.muted)
        }
    }
}

func money(_ value: Double, decimals: Int) -> String {
    decimals == 0 ? "$\(Int(value.rounded()))" : money(value)
}
