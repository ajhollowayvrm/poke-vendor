// Economy slice — the money/time/survival core.
//
// createEconomySlice(set, get) returns the actions for: notoriety & upgrades, the low-level
// cash primitives (spend/earn/log/recordSetSpend), weekly goals, the survival layer (jobs,
// rent/burn readouts, brick-&-mortar employees), the day-advance entry points (nextDay,
// attendShowDays), the live-price refresh hook, and reset(). The heavy day simulation itself
// lives in daytick.js — this slice just drives it and flushes the income window afterward.

import { round2, setMarketMults } from '../engine'
import {
  UPGRADES, RENT_PER_DAY, STORE_LEASE_PER_DAY, employeeById, jobById,
  absoluteDay, GOAL_PERIOD_DAYS, makeWeeklyGoals, INCOME_WINDOW_DAYS,
} from './constants'
import { bumpSet, realizableAssets } from './helpers'
import { advanceDaysWith, mergeSummaries } from './daytick'
import { initialState } from './initialState'

export function createEconomySlice(set, get) {
  return {
    setSetting(key, value) { set(s => ({ settings: { ...s.settings, [key]: value } })) },

    // --- notoriety / upgrades ---
    // `generous` = this gain came from a kind/generous act (giving a card, a fair
    // deal). The Charity Banner only boosts THOSE, matching its copy — not every
    // notoriety tick from ordinary sales.
    addNotoriety(n, generous = false) {
      if (!n) return
      let amt = n
      if (n > 0 && generous && get().upgrades.banner) amt = Math.round(n * 1.5)
      set(s => ({ notoriety: Math.max(0, round2(s.notoriety + amt)) }))
    },
    buyUpgrade(key) {
      const u = UPGRADES[key]
      if (!u || get().upgrades[key]) return false
      if (u.needs && !get().upgrades[u.needs]) return false // prerequisite not met
      if (!get().spend(u.cost)) return false
      set(s => ({ upgrades: { ...s.upgrades, [key]: true } }))
      get().log('upgrade', `Bought ${u.name}`, -u.cost)
      return true
    },
    trafficMult() {
      const s = get()
      let m = 1 + s.notoriety / 100
      if (s.upgrades.signage) m *= 1.15
      return m
    },

    log(type, detail, amount = 0) {
      set(s => ({ history: [{ t: Date.now(), type, detail, amount }, ...s.history].slice(0, 200) }))
    },

    spend(amount) {
      if (get().cash < amount) return false
      set(s => ({ cash: round2(s.cash - amount), stats: { ...s.stats, spent: round2(s.stats.spent + amount) } }))
      return true
    },
    // earn money. By default it counts as CARD income (sales, payouts, wants) for the
    // full-time sustainability readout; pass {wage:true} for paycheck income so it's excluded.
    earn(amount, opts) {
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
        const startsOnDay = get().currentDay + job.start
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
    // Total daily burn you must cover: rent + (store lease + payroll, if you have a store).
    dailyBurn() {
      const s = get()
      let burn = RENT_PER_DAY
      if (s.upgrades.storefront) {
        burn += STORE_LEASE_PER_DAY
        burn += (s.employees || []).map(employeeById).filter(Boolean).reduce((a, e) => a + e.wage, 0)
      }
      return round2(burn)
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
