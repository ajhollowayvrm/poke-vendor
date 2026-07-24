// Economy slice — the money/time/survival core.
//
// createEconomySlice(set, get) returns the actions for: notoriety & upgrades, the low-level
// cash primitives (spend/earn/log/recordSetSpend), weekly goals, the survival layer (jobs,
// rent/burn readouts, brick-&-mortar employees), the day-advance entry points (nextDay,
// attendShowDays), the live-price refresh hook, and reset(). The heavy day simulation itself
// lives in daytick.js — this slice just drives it and flushes the income window afterward.

import { round2, setMarketMults } from '../engine'
import {
  UPGRADES, rentPerDay, STORE_LEASE_PER_DAY, employeeById, jobById,
  absoluteDay, GOAL_PERIOD_DAYS, makeWeeklyGoals, INCOME_WINDOW_DAYS,
  storageFee, heldUnits, storageFreeUnits,
} from './constants'
import { bumpSet, realizableAssets, creditLimit as creditLimitOf, creditAvailable as creditAvailableOf, creditMinimum as creditMinimumOf } from './helpers'
import { advanceDaysWith, mergeSummaries } from './daytick'
import { initialState } from './initialState'
import { newlyUnlocked } from '../milestones'

export function createEconomySlice(set, get) {
  return {
    setSetting(key, value) { set(s => ({ settings: { ...s.settings, [key]: value } })) },

    // --- notoriety / upgrades ---
    // `generous` = this gain came from a kind/generous act (giving a card, a fair
    // deal). The Charity Banner only boosts THOSE, matching its copy — not every
    // notoriety tick from ordinary sales.
    // Notoriety is the master stat (orders, walk-ins, show gates, buyer tolerance, wants,
    // credit caps), so a monotone ratchet lets any small rep faucet snowball into end-game
    // demand. GAINS saturate above a soft cap: past NOTO_SOFT_CAP each point of rep is
    // worth progressively less, so climbing from 200→300 takes far more than 0→100. Rep is
    // never LOST to this (losses — dings, flops — always apply in full); it just gets
    // harder to farm the top end. Keeps late-game demand tied to sustained real activity.
    addNotoriety(n, generous = false) {
      if (!n) return
      let amt = n
      if (n > 0 && generous && get().upgrades.banner) amt = Math.round(n * 1.5)
      set(s => {
        let next
        if (amt <= 0) next = s.notoriety + amt // dings always land in full
        else {
          const cur = s.notoriety
          const SOFT = 150 // below here, 1 rep = 1 point; above, gains taper by 1/(1+excess/150)
          if (cur < SOFT) next = cur + amt
          else {
            const damp = 1 / (1 + (cur - SOFT) / 150)
            next = cur + amt * damp
          }
        }
        return { notoriety: Math.max(0, round2(next)) }
      })
    },
    buyUpgrade(key) {
      const u = UPGRADES[key]
      if (!u || get().upgrades[key]) return false
      if (u.needs && !get().upgrades[u.needs]) return false // prerequisite not met
      if (!get().spend(u.cost)) return false
      set(s => ({ upgrades: { ...s.upgrades, [key]: true } }))
      get().log('upgrade', `Bought ${u.name}`, -u.cost)
      if (key === 'storefront') {
        // Opening day: fill the sales floor from your existing stock (best pieces first) so the
        // shop trades from hour one. The rest waits in the Storeroom — restock the floor from
        // the 🏬 Store tab as it sells. Keep 🔒 anything personal; ⭐ feature your best draws.
        const put = get().restockFloor()
        get().log('shop', `🏬 Doors open — stocked ${put} item${put === 1 ? '' : 's'} onto the sales floor. The rest is in your Storeroom; restock the floor as stock sells. 🔒 Keep personal pieces, ⭐ feature your best to draw whales.`, 0)
      }
      return true
    },
    log(type, detail, amount = 0) {
      set(s => ({ history: [{ t: Date.now(), type, detail, amount }, ...s.history].slice(0, 200) }))
    },

    spend(amount) {
      // Invariant guard: `cash < NaN` is false, so without this check a single malformed
      // price (undefined/NaN upstream) would write NaN into cash and PERSIST it — bricking
      // the save. A negative amount would silently ADD money. Refuse both.
      if (!Number.isFinite(amount) || amount < 0) return false
      if (get().cash < amount) return false
      set(s => ({ cash: round2(s.cash - amount), stats: { ...s.stats, spent: round2(s.stats.spent + amount) } }))
      return true
    },
    // earn money. By default it counts as CARD income (sales, payouts, wants) for the
    // full-time sustainability readout; pass {wage:true} for paycheck income so it's excluded.
    earn(amount, opts) {
      if (!Number.isFinite(amount) || amount < 0) return // same NaN-poisoning guard as spend()
      set(s => ({
        cash: round2(s.cash + amount),
        stats: { ...s.stats, earned: round2(s.stats.earned + amount) },
        _cardAccrual: round2((s._cardAccrual || 0) + (opts?.wage ? 0 : amount)),
      }))
    },
    // Attribute a sealed-product purchase to its set for the per-set ledger.
    recordSetSpend(setId, amount) {
      if (!setId || !amount) return
      set(s => ({ bySet: bumpSet(s.bySet, setId, { spent: amount }) }))
    },

    // --- Milestones ---
    // Unlock any achievement whose lifetime threshold is now met. Cheap and idempotent — a
    // no-op (no set, no re-render) when nothing new crossed, so it's safe to call from many
    // action sites (rips, day-tick, encounters, streams, wants). Rewards notoriety once and
    // queues each unlock for App to announce as a toast. Returns the freshly-unlocked defs.
    // (No recursion: the notoriety reward goes through addNotoriety, which does NOT call back
    // here. A reward that crosses a reputation-tier goal is picked up on the next call.)
    checkMilestones() {
      const s = get()
      const fresh = newlyUnlocked(s, s.milestones)
      if (!fresh.length) return []
      set(st => ({
        milestones: [...(st.milestones || []), ...fresh.map(x => x.id)],
        pendingMilestones: [...(st.pendingMilestones || []), ...fresh.map(x => x.id)],
      }))
      for (const x of fresh) {
        if (x.noto) get().addNotoriety(x.noto)
        if (x.cash) get().earn(x.cash) // late milestones pay real money, not just notoriety
        const cashNote = x.cash ? ` (+$${x.cash.toLocaleString()})` : ''
        get().log('milestone', `🏅 Milestone: ${x.name} — ${x.desc}${x.noto ? ` (+${x.noto}★)` : ''}${cashNote}`, x.cash || 0)
      }
      return fresh
    },
    // App drains the announce-queue after showing the toasts.
    clearPendingMilestones() { if ((get().pendingMilestones || []).length) set({ pendingMilestones: [] }) },

    // A live price refresh is a fresh market snapshot — the new truth. The engine already
    // zeroed its module-level multipliers; clear the persisted drift + history so it doesn't
    // get re-pushed on the next load. Drift resumes from 1.0 on the next day-advance.
    onPricesRefreshed() {
      setMarketMults({})
      set({ marketMults: {}, marketHistory: {} })
    },

    // --- Weekly goals ---
    // Ensure a set of weekly goals exists (called on mount). Seeds a fresh set only if
    // there are none yet or the 7-day window since they were generated has elapsed — an
    // in-progress week carries over untouched. goalsDay holds the absolute (month-safe) day.
    ensureDailyGoals() {
      const s = get()
      const today = absoluteDay(s.currentDay, s.monthsElapsed)
      if (!s.dailyGoals.length || today - (s.goalsDay || 0) >= GOAL_PERIOD_DAYS) {
        set({ dailyGoals: makeWeeklyGoals(s.notoriety), goalsDay: today })
      }
    },
    // Days until the current weekly goal set refreshes (0 = refreshes on the next day-tick).
    goalsResetInDays() {
      const s = get()
      if (!s.dailyGoals.length) return 0
      const today = absoluteDay(s.currentDay, s.monthsElapsed)
      return Math.max(0, GOAL_PERIOD_DAYS - (today - (s.goalsDay || today)))
    },
    // Advance any weekly goal matching `key` by `amount`; auto-complete + pay.
    bumpGoal(key, amount = 1) {
      const goals = get().dailyGoals
      if (!goals.length) return
      let paidCash = 0, paidNoto = 0, completed = null
      const next = goals.map(g => {
        if (g.key !== key || g.done) return g
        const progress = g.progress + amount
        if (progress >= g.target) {
          paidCash += g.cash; paidNoto += g.noto; completed = g
          return { ...g, progress: g.target, done: true }
        }
        return { ...g, progress }
      })
      set({ dailyGoals: next })
      if (completed) {
        if (paidCash) get().earn(paidCash)
        if (paidNoto) get().addNotoriety(paidNoto)
        set(s => ({ stats: { ...s.stats, goalsCompleted: (s.stats.goalsCompleted || 0) + 1 } }))
        get().log('goal', `Daily goal complete: ${completed.label}${paidCash?` (+$${paidCash})`:''}${paidNoto?` (+${paidNoto}★)`:''}`, paidCash || 0)
      }
    },

    // --- Distributor credit line ---
    // Selectors (thin wrappers over the pure helpers) so the UI reads one source of truth.
    creditLimit() { return creditLimitOf(get()) },
    creditAvailable() { return creditAvailableOf(get()) },
    creditMinimum() { return creditMinimumOf(get()) },
    // Put `amount` on the credit line — a buy charged to credit instead of cash. Refuses if
    // the line is frozen or the amount is over what's available. Returns true on success.
    chargeCredit(amount) {
      const amt = round2(amount)
      if (!(amt > 0)) return false
      if (creditAvailableOf(get()) + 1e-9 < amt) return false // frozen, or over the limit
      set(s => ({ credit: { ...s.credit, balance: round2((s.credit?.balance || 0) + amt) } }))
      return true
    },
    // Pay `amount` down from cash toward the balance (clamped to the balance and your cash).
    // A payment that covers the current monthly minimum — or clears the balance — thaws a
    // frozen line. Returns the amount actually paid.
    payCredit(amount) {
      const bal = get().credit?.balance || 0
      if (bal <= 0) return 0
      const minDue = creditMinimumOf(get())
      const pay = round2(Math.min(amount, bal, get().cash))
      if (!(pay > 0)) return 0
      get().spend(pay)
      const newBal = Math.max(0, round2(bal - pay))
      const cured = newBal <= 0 || pay + 1e-9 >= minDue
      set(s => ({ credit: { balance: newBal, frozen: cured ? false : !!(s.credit?.frozen) } }))
      get().log('credit', `Paid down distributor credit (−$${pay.toFixed(2)}) · balance $${newBal.toFixed(2)}`, -pay)
      return pay
    },

    // Pay `amount` by CASH FIRST, then put the remainder on the credit line — the "combine
    // cash and credit" checkout, for when a buy costs more than the cash in your pocket but
    // cash + open credit covers it. Pre-checks the credit leg (frozen / over-limit) so it
    // NEVER half-charges: returns { cashPart, creditPart } on success, false without mutating
    // if the shortfall can't ride the line. A buy fully covered by cash just spends cash
    // (creditPart 0), so callers can use this as a safe superset of spend().
    paySplit(amount) {
      const total = round2(amount)
      if (!(total > 0)) return false
      const cashPart = round2(Math.min(get().cash, total))
      const creditPart = round2(total - cashPart)
      if (creditPart > 1e-9) {
        if (get().credit?.frozen) return false
        if (creditAvailableOf(get()) + 1e-9 < creditPart) return false
      }
      // Both legs are pre-checked above (cashPart ≤ cash, creditPart ≤ available), so neither
      // can fail now — no rollback path to get wrong.
      if (cashPart > 0) get().spend(cashPart)
      if (creditPart > 1e-9) get().chargeCredit(creditPart)
      return { cashPart, creditPart }
    },

    // --- Jobs (the survival layer) ---
    // Net worth = cash + collection liquidation value (for job gating + UI runway).
    netWorth() { return realizableAssets(get()) },
    // Take a job (by id). Gated by notoriety. Quitting first is implicit (replaces current).
    // A newly-taken job starts after `start` days (re-apply friction); start:0 is instant.
    takeJob(id) {
      const job = jobById(id)
      if (!job || job.id === 'none') return false
      if (get().notoriety + 1e-9 < job.minNoto) return false
      if (job.start <= 0) {
        set({ job, pendingJob: null })
        get().log('job', `Started a job: ${job.title} ($${job.wage}/day)`, 0)
      } else {
        // ABSOLUTE day (month-safe), matching the day-tick comparison. Was in-month
        // currentDay + start, which on day 30 produced startsOnDay=32 — unreachable once
        // the day wraps to 1, so the job never started (same bug class as the v28 grade fix).
        const startsOnDay = absoluteDay(get().currentDay, get().monthsElapsed) + job.start
        set({ pendingJob: { job, startsOnDay } })
        get().log('job', `Hired as ${job.title} — starts in ${job.start} day${job.start>1?'s':''} ($${job.wage}/day)`, 0)
      }
      return true
    },
    // Quit instantly — go full-time vendor (no wage, rent still bites).
    quitJob() {
      if (!get().job) return
      const had = get().job
      set({ job: null, pendingJob: null })
      get().log('job', `Quit ${had.title} — going full-time as a vendor. No more paycheck.`, 0)
    },

    // --- Full-time sustainability readout (Phase 3) ---
    // Average CARD income per game-day over the recent window (sales/payouts, not wages).
    // Drives the "can I survive unemployed?" guidance. 0 until enough days have elapsed.
    cardIncomePerDay() {
      const log = get().cardIncomeLog || []
      if (!log.length) return 0
      return round2(log.reduce((a, v) => a + v, 0) / log.length)
    },
    // Total daily burn you must cover: rent + inventory storage + (store lease + payroll,
    // if you have a store). Storage is 0 until you're carrying more than the free allowance.
    dailyBurn() {
      const s = get()
      let burn = rentPerDay(s.monthsElapsed) + storageFee(s)
      if (s.upgrades.storefront) {
        burn += STORE_LEASE_PER_DAY
        burn += (s.employees || []).map(employeeById).filter(Boolean).reduce((a, e) => a + e.wage, 0)
      }
      return round2(burn)
    },
    // Inventory storage readout for the finance panel: current daily fee + how loaded you are.
    storageStatus() {
      const s = get()
      return { fee: storageFee(s), units: heldUnits(s), free: storageFreeUnits(s) }
    },

    // --- Brick & mortar employees (Phase 4) ---
    hireEmployee(id) {
      const e = employeeById(id)
      if (!e || !get().upgrades.storefront) return false
      set(st => ({ employees: [...st.employees, id] }))
      get().log('hire', `Hired a ${e.title} ($${e.wage}/day payroll)`, 0)
      return true
    },
    fireEmployee(id) {
      const e = employeeById(id)
      set(st => {
        const i = st.employees.indexOf(id)
        if (i === -1) return {}
        const next = st.employees.slice(); next.splice(i, 1)
        return { employees: next }
      })
      if (e) get().log('fire', `Let go of a ${e.title}.`, 0)
    },

    // 🏬 Store branding: update any of { name, tagline, icon, accent }. Name/tagline are
    // trimmed and length-capped so a stray paste can't break layouts; a patch only touches
    // the keys it carries. Cosmetic only — never gates anything.
    setStoreIdentity(patch) {
      if (!patch || typeof patch !== 'object') return
      const clean = {}
      if ('name' in patch) clean.name = String(patch.name).slice(0, 40)
      if ('tagline' in patch) clean.tagline = String(patch.tagline).slice(0, 60)
      if ('icon' in patch) clean.icon = String(patch.icon).slice(0, 8)
      if ('accent' in patch) clean.accent = String(patch.accent).slice(0, 24)
      set(st => ({ store: { ...(st.store || {}), ...clean } }))
    },

    // --- Advancing time ---
    // Pass a single day at home — generate that day's home orders into the inbox.
    // Flushes accumulated card income into the rolling window for the full-time readout.
    nextDay() {
      if (get().gameOver) return null
      // advanceDaysWith now carries days + cashDelta in its summary; we just tack on the
      // per-day card-income flush that the full-time runway readout depends on.
      const result = advanceDaysWith(set, get, 1, false) || {}
      const cardIncome = round2(get()._cardAccrual || 0)
      const ring = [...(get().cardIncomeLog || []), cardIncome]
      set(() => ({ cardIncomeLog: ring.slice(-INCOME_WINDOW_DAYS), _cardAccrual: 0 }))
      return { ...result, cardIncome }
    },
    // Attend a show: the show's days pass while you're AWAY. Home orders during
    // those days only land if you have the Smartphone (online) / Staff (walk-in)
    // upgrades; otherwise they're missed. Any other shows in the window are skipped.
    // Returns ONE merged summary of the whole trip (any home "wait" days + the away show
    // days) so the caller can recap the trip on leaving the floor.
    attendShowDays(showDay, days) {
      set(s => ({ showsAttended: s.showsAttended + 1 }))
      get().bumpGoal('attend', 1) // credit today's "attend a show" goal before the day rolls
      // 📣 Sponsorship: your banner hangs over every hall you work.
      if (get().upgrades.sponsorship) { get().addNotoriety(2); get().log('show', '📣 Your sponsor banner hung over the hall (+2 notoriety)', 0) }
      // days waiting until the show opens (home, not away) + the show's run (away)
      const wait = Math.max(0, showDay - get().currentDay)
      const waitRes = wait > 0 ? advanceDaysWith(set, get, wait, false) : null
      const showRes = advanceDaysWith(set, get, days, true)
      return mergeSummaries(waitRes, showRes)
    },

    // Wipe back to a fresh game. Uses the shared initialState() factory so the field list
    // lives in one place; the few rate props (quickSellRate/buylistRate/SHOWCASE_MAX) live
    // in their slices and intentionally survive a reset. Also clears the engine's live drift.
    reset() {
      set(initialState())
      setMarketMults({}) // clear the engine's live market drift too
    },
  }
}
