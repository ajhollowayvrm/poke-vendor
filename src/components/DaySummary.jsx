import { useGame, repSourceLabel } from '../game/store'
import { weekdayOf, absoluteDay, monthName } from '../game/store/constants'
import { fmtMoney, round2 } from '../game/engine'
import { Modal } from '../ui/Modal'
import { Collapse } from '../ui/Collapse'
import { daysLeftInQuarter } from '../game/tax'
import { loanProgress } from '../game/loans'

// The nightly recap, laid out the way a vendor closes a register:
//   1. the register — net cash and net worth, biggest figures first
//   2. money in — what sold, and through which channel
//   3. money out — the overhead that came due
//   4. needs attention — misses, offers waiting, slabs back, and every clock that is
//      running against you (tax bill, quarter close, loan note)
//   5. the detail, collapsed — market movers, reputation, life events
// It reads the summary object from advanceDaysWith as-is and pulls the countdown state
// (books, loan) straight off the store — read-only, nothing here touches engine math.
export default function DaySummary({ summary, onClose }) {
  const { cashDelta, added, listingsSold, listingOffers, premiumOffers, wages, rent, lease, payroll, storage,
    resolvedGrades, binderFiled, binderReserved, wantsBrokered, brokerProceeds, offersAccepted, keeperStocked, keeperBroke, saleProceeds, notoDelta,
    missedOnline, missedWalkin, days, showName,
    soldNames, bigSale, newWants, regularCalls, regularsWon, marketMovers, netWorth, lifeEvents, counterIncome, suppliesIncome, suppliesSold, machineIncome, machineSold, binIncome, binSold, binTurnedAway, wholesaleIncome, floor, hype, hypeDelta, notoBySrc } = summary
  const currentDay = useGame(s => s.currentDay)
  const monthsElapsed = useGame(s => s.monthsElapsed)
  // Countdown state, read straight off the store (not part of the summary payload).
  const books = useGame(s => s.books)
  const loan = useGame(s => s.loan)
  const missed = (missedOnline || 0) + (missedWalkin || 0)
  const movers = marketMovers || []
  const sold = soldNames || []
  const events = lifeEvents || []
  // !! matters: this is an || chain over NUMBERS, so a floor where you bought and sold nothing
  // evaluates to the last operand — the number 0, not false — and `{floorActive && …}` below
  // rendered a bare "0" into the recap.
  const floorActive = !!(floor && (floor.spent || floor.earned || floor.notoGained || floor.acquired || floor.rapport))
  const hasActivity = added || listingsSold || listingOffers || resolvedGrades || binderFiled || binderReserved || wantsBrokered
    || offersAccepted || keeperStocked || wages || rent || lease
    || payroll || storage || saleProceeds || notoDelta || missed || binTurnedAway || movers.length || newWants || regularCalls || regularsWon || events.length || floorActive
  // A show trip recaps the whole time away ("Back from … · N days"); a single Next Day is
  // just the day you entered.
  const multiDay = days > 1

  // Money-in lines, one shape: [label, amount, detail]. The store channels group under a
  // single roll-up so five small lines don't outrank the day's real sales.
  const channelIncome = round2((counterIncome || 0) + (suppliesIncome || 0) + (machineIncome || 0) + (binIncome || 0))
  const soldRest = sold.filter(s => !bigSale || s.name !== bigSale.name || s.net !== bigSale.net).slice(0, 3)

  // The clocks. Only the ones actually running show up.
  const absNow = absoluteDay(currentDay, monthsElapsed)
  const taxOwed = round2(books?.owed || 0)
  const qDaysLeft = books ? daysLeftInQuarter(books, absNow) : null
  const loanProg = loan ? loanProgress(loan) : null

  const attention = []
  if (missed > 0) attention.push({ tone: 'neg', line: `⚠️ Missed ${missed} order${missed === 1 ? '' : 's'} while away`, note: `${missedOnline ? `${missedOnline} online` : ''}${missedOnline && missedWalkin ? ', ' : ''}${missedWalkin ? `${missedWalkin} walk-in` : ''}` })
  if (binTurnedAway > 0) attention.push({ tone: 'neg', line: `🗑️ ${binTurnedAway} kid${binTurnedAway === 1 ? '' : 's'} found the quarter box empty`, note: 'stock the bulk bin' })
  if (taxOwed > 0) attention.push({ tone: 'neg', line: `🧾 Tax bill unpaid — ${fmtMoney(taxOwed)}${(books?.arrears || 0) > 0 ? ` · ${books.arrears}d overdue` : ''}`, note: 'Stats → 🧾 Books' })
  else if (qDaysLeft != null && qDaysLeft <= 5 && (books?.revenue || 0) > 0) attention.push({ tone: 'warn', line: `🧾 Tax quarter closes in ${qDaysLeft} day${qDaysLeft === 1 ? '' : 's'}`, note: 'Stats → 🧾 Books' })
  if (loan && (loan.missed || 0) > 0) attention.push({ tone: 'neg', line: `🏦 Loan payment missed ${loan.missed} day${loan.missed === 1 ? '' : 's'} running`, note: `${fmtMoney(loan.daily)}/day` })
  else if (loanProg && loanProg.left > 0) attention.push({ tone: 'warn', line: `🏦 Loan note — ${fmtMoney(loan.daily)}/day, ${loanProg.left}d left`, note: `${fmtMoney(loan.balance)} to go` })
  if (listingOffers > 0) attention.push({ tone: 'warn', line: `📨 ${listingOffers} offer${listingOffers === 1 ? '' : 's'} waiting on your listings`, note: 'Sell → Orders' })
  if (premiumOffers > 0) attention.push({ tone: 'pos', line: `📈 ${premiumOffers} over-market offer${premiumOffers === 1 ? '' : 's'} (hot set)` })
  if (resolvedGrades > 0) attention.push({ tone: 'warn', line: `🔬 ${resolvedGrades} slab${resolvedGrades === 1 ? '' : 's'} back from grading — price them`, note: '👤 You → 🔬 Grading' })
  if (regularCalls > 0) attention.push({ tone: 'warn', line: `📞 ${regularCalls} regular${regularCalls === 1 ? '' : 's'} asked you to stock their lane`, note: '🤝 Regulars' })
  if (newWants > 0) attention.push({ tone: 'warn', line: `🐋 ${newWants} collector want${newWants === 1 ? '' : 's'} found you`, note: 'pays over market' })
  if (added > 0) attention.push({ tone: 'warn', line: `📨 ${added} new order${added === 1 ? '' : 's'} in your inbox`, note: 'Sell → Orders' })

  // The quieter "what else happened" lines, collapsed behind one badge.
  const newsCount = (regularsWon || 0) + (binderFiled ? 1 : 0) + (keeperStocked ? 1 : 0) + (binderReserved ? 1 : 0) + (notoDelta > 0 ? 1 : 0) + (hype >= 10 ? 1 : 0)

  return (
    <Modal onClose={onClose} className="recap" maxWidth={430} sheet label="Day summary">
      <>
        <h2 style={{ marginBottom: 2, textAlign: 'center' }}>{showName ? `🎪 Back from ${showName}` : `📅 ${weekdayOf(absNow)} · Day ${currentDay} · ${monthName(monthsElapsed)}`}</h2>
        {multiDay && <div className="cap t-sm" style={{ marginBottom: 6, textAlign: 'center' }}>{days} days passed</div>}

        {/* 1 · The register — net cash for the day + where the whole business stands. */}
        {cashDelta != null && (
          <div className="recap-headline">
            <div>
              <div className="recap-h-label">Net cash</div>
              <div className="recap-h-val" style={{ color: cashDelta >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {cashDelta >= 0 ? '+' : ''}{fmtMoney(cashDelta)}
              </div>
            </div>
            {netWorth != null && (
              <div style={{ textAlign: 'right' }}>
                <div className="recap-h-label">Net worth</div>
                <div className="recap-h-val">{fmtMoney(netWorth)}</div>
              </div>
            )}
          </div>
        )}

        {!hasActivity ? (
          <p className="muted" style={{ marginTop: 4, textAlign: 'center' }}>{multiDay ? 'Nothing stirred while you were away.' : 'A quiet day. Nothing moved.'}</p>
        ) : (
          <div className="recap-body">
            {/* On the floor — what the show itself did (buying, selling, rep), distinct
                from the days-away home activity below. */}
            {floorActive && (
              <div className="recap-sec">
                <div className="recap-sec-h">🎪 On the floor</div>
                {floor.acquired > 0 && <div className="recap-line"><span className="muted">Items picked up</span><b>{floor.acquired}</b></div>}
                {floor.spent > 0 && <div className="recap-line"><span className="muted">Spent buying</span><span className="neg">−{fmtMoney(floor.spent)}</span></div>}
                {floor.earned > 0 && <div className="recap-line"><span className="muted">Earned selling</span><b className="pos">+{fmtMoney(floor.earned)}</b></div>}
                {(floor.earned > 0 || floor.spent > 0) && (
                  <div className="recap-line"><span>Floor net</span>
                    <b style={{ color: floor.earned - floor.spent >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {floor.earned - floor.spent >= 0 ? '+' : ''}{fmtMoney(round2(floor.earned - floor.spent))}</b></div>
                )}
                {floor.notoGained > 0 && <div className="recap-line"><span className="muted">Notoriety gained</span><b className="warn">+{floor.notoGained}★</b></div>}
                {floor.rapport > 0 && <div className="recap-line"><span className="muted">🤝 Dealt with vendors</span><span className="muted">{fmtMoney(floor.rapport)}</span></div>}
              </div>
            )}

            {/* 2 · Money in — what sold, and through which channel. */}
            {(saleProceeds > 0 || sold.length > 0 || wantsBrokered > 0 || offersAccepted > 0 || channelIncome > 0 || wholesaleIncome > 0 || wages > 0) && (
              <div className="recap-sec">
                <div className="recap-sec-h">💰 Money in</div>
                {bigSale && <div className="recap-line"><span>Biggest: <b>{bigSale.name}</b></span><b className="pos">+{fmtMoney(bigSale.net)}</b></div>}
                {soldRest.map((s, i) => (
                  <div className="recap-line" key={i}><span className="muted">{s.name}</span><span className="muted">+{fmtMoney(s.net)}</span></div>
                ))}
                {wantsBrokered > 0 && <div className="recap-line"><span className="muted">💼 Broker filled {wantsBrokered} want{wantsBrokered === 1 ? '' : 's'}</span><b className="pos">+{fmtMoney(brokerProceeds)}</b></div>}
                {offersAccepted > 0 && <div className="recap-line"><span className="muted">📨 Offer desk closed {offersAccepted} deal{offersAccepted === 1 ? '' : 's'}</span></div>}
                {channelIncome > 0 && (
                  <div className="recap-line">
                    <span className="muted">🏬 Store channels{(() => {
                      const bits = []
                      if (counterIncome > 0) bits.push('counter')
                      if (suppliesIncome > 0) bits.push(`supplies ×${suppliesSold}`)
                      if (machineIncome > 0) bits.push(`machine ×${machineSold}`)
                      if (binIncome > 0) bits.push(`bin ×${binSold}`)
                      return bits.length ? ` (${bits.join(' · ')})` : ''
                    })()}</span>
                    <b className="pos">+{fmtMoney(channelIncome)}</b>
                  </div>
                )}
                {wholesaleIncome > 0 && <div className="recap-line"><span className="muted">📦 Wholesale margin</span><b className="pos">+{fmtMoney(wholesaleIncome)}</b></div>}
                {wages > 0 && <div className="recap-line"><span className="muted">💼 Day-job wages</span><b className="pos">+{fmtMoney(wages)}</b></div>}
                {saleProceeds > 0 && <div className="recap-line"><span>Total sales income</span><b className="pos">+{fmtMoney(saleProceeds)}</b></div>}
              </div>
            )}

            {/* 3 · Money out — the overhead that came due. */}
            {(rent > 0 || storage > 0 || lease > 0 || payroll > 0) && (
              <div className="recap-sec">
                <div className="recap-sec-h">💸 Money out</div>
                {rent > 0 && <div className="recap-line"><span className="muted">Rent</span><span>-{fmtMoney(rent)}</span></div>}
                {lease > 0 && <div className="recap-line"><span className="muted">Store lease</span><span>-{fmtMoney(lease)}</span></div>}
                {payroll > 0 && <div className="recap-line"><span className="muted">Staff payroll</span><span>-{fmtMoney(payroll)}</span></div>}
                {storage > 0 && <div className="recap-line"><span className="muted">Inventory storage</span><span>-{fmtMoney(storage)}</span></div>}
              </div>
            )}

            {/* 4 · Needs attention — misses, waiting decisions, and the running clocks. */}
            {attention.length > 0 && (
              <div className="recap-sec">
                <div className="recap-sec-h">⚠️ Needs attention</div>
                {attention.map((a, i) => (
                  <div className="recap-line" key={i} style={a.tone === 'neg' ? { color: 'var(--red)' } : undefined}>
                    <span className={a.tone === 'pos' ? 'pos' : undefined}>{a.line}</span>
                    {a.note && <span className="muted">{a.note}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* 5 · The detail, collapsed — read it when you want it, skip it when you don't. */}
            {movers.length > 0 && (
              <Collapse id="recap-movers" head="📊 Market movers" badge={movers.length} className="recap-fold" headClass="recap-fold-head">
                {movers.slice(0, 4).map((m, i) => (
                  <div className="recap-line" key={i}>
                    <span>{m.kind === 'hype' ? '📈' : '📉'} <b>{m.setName}</b></span>
                    <b style={{ color: m.kind === 'hype' ? 'var(--green)' : 'var(--red)' }}>{m.pct > 0 ? '+' : ''}{m.pct}%</b>
                  </div>
                ))}
              </Collapse>
            )}
            {newsCount > 0 && (
              <Collapse id="recap-news" head="📬 Shop news" badge={newsCount} className="recap-fold" headClass="recap-fold-head">
                {regularsWon > 0 && <div className="recap-line"><span className="pos">🤝 You came through for {regularsWon} regular{regularsWon === 1 ? '' : 's'}</span></div>}
                {binderFiled > 0 && <div className="recap-line"><span className="muted">📒 Curator filed {binderFiled} card{binderFiled === 1 ? '' : 's'} into your binder</span></div>}
                {keeperStocked > 0 && <div className="recap-line"><span className="muted">🪓 Bin Keeper stocked {keeperStocked} pack{keeperStocked === 1 ? '' : 's'}{keeperBroke > 0 ? ` (broke ${keeperBroke} product${keeperBroke === 1 ? '' : 's'} down)` : ' from backstock'}</span></div>}
                {/* Say WHY a slot stayed empty — otherwise the reserve reads as the Curator
                    quietly not doing its job. */}
                {binderReserved > 0 && <div className="recap-line"><span className="muted">🎚️ {binderReserved} slot{binderReserved === 1 ? '' : 's'} left open — only copy reserved to grade & sell</span></div>}
                {notoDelta > 0 && (
                  <div className="recap-line">
                    <span className="muted">⭐ Reputation{(notoBySrc || []).length > 0 && (
                      <span className="cap"> ({notoBySrc.map(([tag, d]) => `${repSourceLabel(tag).split(' ')[0]} ${d > 0 ? '+' : ''}${d}`).join(' · ')})</span>
                    )}</span>
                    <b className="warn">+{Math.round(notoDelta * 10) / 10}★</b>
                  </div>
                )}
                {hype >= 10 && <div className="recap-line"><span className="muted">🔥 Shop heat</span><b style={{ color: 'var(--orange, #ff9f43)' }}>{Math.round(hype)}{hypeDelta > 0 ? ` (+${Math.round(hypeDelta)})` : ' (fading)'}</b></div>}
              </Collapse>
            )}
            {events.length > 0 && (
              <Collapse id="recap-events" head="📆 While time passed" badge={events.length} className="recap-fold" headClass="recap-fold-head">
                {events.map((e, i) => (
                  <div className="recap-line recap-event" key={i}>
                    <span style={{ color: e.cashDelta > 0 ? 'var(--green)' : 'var(--txt)' }}>{e.line}</span>
                    {e.cashDelta ? <b style={{ color: e.cashDelta > 0 ? 'var(--green)' : 'var(--red)' }}>{e.cashDelta > 0 ? '+' : ''}{fmtMoney(e.cashDelta)}</b> : null}
                  </div>
                ))}
              </Collapse>
            )}
          </div>
        )}
        <button className="btn gold" style={{ maxWidth: 160, marginTop: 12, marginLeft: 'auto', marginRight: 'auto', display: 'block' }} onClick={onClose}>Continue</button>
      </>
    </Modal>
  )
}
