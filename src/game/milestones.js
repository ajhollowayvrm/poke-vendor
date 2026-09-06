// Milestones — permanent achievement badges earned by hitting lifetime thresholds.
//
// Pure definitions + evaluators (no store access). Each milestone reads a single number
// out of game state via its `value(s)` accessor and unlocks the moment that number reaches
// `goal`. Unlocks are permanent (recorded by id in state.milestones), pay a one-time
// notoriety reward, and pop a toast. The store calls the evaluators; the Career panel renders
// the shelf; App shows the toasts. To add a milestone, drop an entry in MILESTONES — nothing
// else needs to change.

import { cardValue } from './engine'

// --- value accessors: each pulls ONE lifetime number out of state --------------
const packsOpened   = s => s.stats?.packsOpened || 0
const hitsPulled    = s => s.stats?.hits || 0
const godPacks      = s => s.stats?.godPacks || 0
const gradesSubmitted = s => s.gradesSubmitted || 0
const showsAttended = s => s.showsAttended || 0
const generousActs  = s => s.generousActs || 0
const notoriety     = s => s.notoriety || 0
const setsCompleted = s => (s.completedSets || []).length
const streams       = s => s.streamStats?.streams || 0
const peakViewers   = s => s.streamStats?.peakViewers || 0
const wantsFilled   = s => s.stats?.wantsFilled || 0
// Net worth (cash + raw/graded collection) and best single pull by market value.
const netWorth      = s => (s.cash || 0) + (s.collection || []).reduce((a, c) => a + cardValue(c), 0) + (s.binder || []).reduce((a, c) => a + cardValue(c), 0)
const bestPullValue = s => (s.stats?.bestPull ? cardValue(s.stats.bestPull) : 0)

// Terse builder: id, group, icon, name, desc, goal, noto reward, value accessor, cash reward.
// `cash` (optional) is a one-time payout — the harder/late milestones pay real money so an
// achievement still lands when the economy has grown past a few notoriety points.
const m = (id, group, icon, name, desc, goal, noto, value, cash = 0) => ({ id, group, icon, name, desc, goal, noto, value, cash })

// The ladder. Grouped by theme; tiers within a group escalate goal + reward.
export const MILESTONES = [
  // Ripping
  m('packs-10',   'Ripping', '📦', 'First Rips',    'Open 10 packs',            10,   2, packsOpened),
  m('packs-100',  'Ripping', '📦', 'Ripper',        'Open 100 packs',           100,  5, packsOpened),
  m('packs-500',  'Ripping', '📦', 'Case Cracker',  'Open 500 packs',           500, 12, packsOpened, 300),
  m('packs-2000', 'Ripping', '📦', 'Pack Demon',    'Open 2,000 packs',        2000, 30, packsOpened, 1500),
  // Hits
  m('hits-10',   'Hits', '🌟', 'First Hits',   'Pull 10 hits',    10,  3, hitsPulled),
  m('hits-100',  'Hits', '🌟', 'Hit Hunter',   'Pull 100 hits',  100,  8, hitsPulled, 250),
  m('hits-500',  'Hits', '🌟', 'Hit Machine',  'Pull 500 hits',  500, 20, hitsPulled, 1500),
  // Chase — god packs + best single pull
  m('god-1',       'Chase', '🎉', 'Blessed',           'Hit a god pack',                 1, 15, godPacks, 500),
  m('god-5',       'Chase', '🎉', 'God Among Rippers', 'Hit 5 god packs',                5, 40, godPacks, 4000),
  m('grail-500',   'Chase', '💎', 'Big Hit',           'Pull a card worth $500+',      500,  5, bestPullValue),
  m('grail-5000',  'Chase', '💎', 'Grail Chaser',      'Pull a card worth $5,000+',   5000, 20, bestPullValue, 2000),
  m('grail-50000', 'Chase', '💎', 'Museum Piece',      'Pull a card worth $50,000+', 50000, 60, bestPullValue, 15000),
  // Wealth
  m('worth-10k',  'Wealth', '💰', 'Getting Somewhere', 'Reach $10k net worth',     10000,  5, netWorth),
  m('worth-50k',  'Wealth', '💰', 'Comfortable',       'Reach $50k net worth',     50000, 12, netWorth, 1000),
  m('worth-250k', 'Wealth', '💰', 'Big Time',          'Reach $250k net worth',   250000, 30, netWorth, 5000),
  m('worth-1m',   'Wealth', '💰', 'Millionaire',       'Reach $1M net worth',    1000000, 75, netWorth, 30000),
  // Grading
  m('graded-5',   'Grading', '🔟', 'Slabbed',           'Grade 5 cards',    5,  3, gradesSubmitted),
  m('graded-25',  'Grading', '🔟', 'Regular Submitter', 'Grade 25 cards',  25,  8, gradesSubmitted, 300),
  m('graded-100', 'Grading', '🔟', 'Grading Loyalty',   'Grade 100 cards', 100, 20, gradesSubmitted, 1500),
  // Circuit
  m('shows-1',  'Circuit', '🎪', 'On the Circuit',   'Attend your first show', 1,  3, showsAttended),
  m('shows-10', 'Circuit', '🎪', 'Show Regular',     'Attend 10 shows',       10, 10, showsAttended, 500),
  m('shows-30', 'Circuit', '🎪', 'Circuit Veteran',  'Attend 30 shows',       30, 25, showsAttended, 2500),
  // Generosity
  m('generous-1',  'Generosity', '🎗️', 'Made Their Day', 'Give a card away free',       1,  5, generousActs),
  m('generous-10', 'Generosity', '🎗️', 'Good Samaritan', 'Make 10 peoples’ day',        10, 15, generousActs, 500),
  m('generous-25', 'Generosity', '🎗️', 'Local Legend',   'Make 25 peoples’ day',        25, 35, generousActs, 2500),
  // Reputation
  m('noto-25',  'Reputation', '⭐', 'Known Name',    'Reach 25 notoriety',   25,  3, notoriety),
  m('noto-100', 'Reputation', '⭐', 'Big Reputation', 'Reach 100 notoriety', 100,  6, notoriety, 750),
  m('noto-250', 'Reputation', '⭐', 'Household Name', 'Reach 250 notoriety',  250, 12, notoriety, 3000),
  // Collector
  m('sets-1',  'Collector', '🃏', 'Completionist',   'Complete a full set',  1,  8, setsCompleted, 500),
  m('sets-5',  'Collector', '🃏', 'Set Collector',   'Complete 5 sets',      5, 20, setsCompleted, 3000),
  m('sets-15', 'Collector', '🃏', 'Master Collector', 'Complete 15 sets',   15, 50, setsCompleted, 15000),
  // Streaming
  m('stream-1',      'Streaming', '🔴', 'Live!',            'Run your first stream',        1,  4, streams),
  m('stream-10',     'Streaming', '🔴', 'Content Creator',  'Run 10 streams',              10, 15, streams, 600),
  m('viewers-100',   'Streaming', '📺', 'Drawing a Crowd',  'Hit 100 peak viewers',       100,  8, peakViewers),
  m('viewers-1000',  'Streaming', '📺', 'Internet Famous',  'Hit 1,000 peak viewers',    1000, 30, peakViewers, 2500),
  // Wants
  m('wants-1',  'Wants', '📋', 'Matchmaker',   'Fill a collector want', 1,  4, wantsFilled),
  m('wants-10', 'Wants', '📋', 'Go-To Dealer', 'Fill 10 wants',        10, 12, wantsFilled, 400),
  m('wants-50', 'Wants', '📋', 'Wish Granter', 'Fill 50 wants',        50, 30, wantsFilled, 2500),
]

export function milestoneById(id) { return MILESTONES.find(x => x.id === id) }

// Milestones whose threshold is now met but that aren't in `unlocked` yet.
export function newlyUnlocked(state, unlocked) {
  const have = new Set(unlocked || [])
  return MILESTONES.filter(x => !have.has(x.id) && x.value(state) >= x.goal)
}

// 0..1 progress toward a milestone's goal (for the locked-badge progress bar).
export function milestoneProgress(state, mst) {
  if (!mst?.goal) return 0
  return Math.max(0, Math.min(1, (mst.value(state) || 0) / mst.goal))
}

// Distinct group names in ladder order (for the milestone shelf headings).
export const MILESTONE_GROUPS = MILESTONES.reduce((acc, x) => acc.includes(x.group) ? acc : [...acc, x.group], [])
