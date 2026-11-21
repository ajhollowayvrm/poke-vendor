#!/usr/bin/env python3
"""Monte Carlo test of the sealed product code proposal (docs/proposals/sealed-product).

The script models the formulas of Part A (stores, limits, flippers, heat), Part B (distributor, plug, Rip & Ship),
and Part C (hidden acts, callouts, replies). Where 00-integration.md sets a value, the script uses it
(for example fillBase = 0.05). It reads catalog.json and the set files read-only. It writes nothing in the repo.

Run (from any folder):
    python3 -I sim_sealed.py --runs 2000 --json base.json                 # the proposal as written
    python3 -I sim_sealed.py --runs 2000 --config tuned --json tuned.json  # with the recommended values
    python3 -I sim_sealed.py --runs 500 --config elite --only shop,cheater  # player reputation 700 (Elite)
Options:
    --days N          days per run (default 365)
    --only a,b        strategies: honest, honest_camp, flipper, shop, shop_rs70, cheater, farmer
    --set name=JSON   change one value after --config, for example --set storeBanDays=14
    --repo PATH       the PokeVendor repo (default /Users/ajholloway/personal/PokeVendor)
The output is one JSON object: means with 10th and 90th percentiles. See sim_report.md for the meaning.
"""
import json
import math
import os
import random
import sys
from multiprocessing import Pool

# ----------------------------------------------------------------------------------------------------------------
# Constants. BASE is the proposal as written (integration values win). TUNED holds the recommended changes.
# ----------------------------------------------------------------------------------------------------------------

BASE = dict(
    # Part A, 1.1 vendor days and drain
    vendorWeekdays=(1, 4), vendorHours=[8.0, 9.0, 10.0, 11.0], storeOpen=8.0, storeClose=22.0,
    batchSize={'walmart': 30, 'target': 24, 'bestbuy': 12, 'gamestop': 10, 'barnes': 6, 'club': 12},
    batchProducts={'walmart': (4, 6), 'target': (3, 5), 'bestbuy': (2, 4), 'gamestop': (2, 4), 'barnes': (1, 3),
                   'club': (2, 4)},
    batchMinUnits=2, hotDrainBase=0.5, hotDrainPressure=1.5, coldDrainRate=0.05,
    batchExcludeStoreExclusive=False,   # as written, Market.batch filters only club exclusives
    # 1.2 limits: (kind, normal, hot)
    baseLimit={'walmart': ('visit', 5, 5), 'target': ('sku', 2, 1), 'gamestop': ('sku', 2, 1),
               'bestbuy': ('sku', 2, 1), 'barnes': ('visit', 2, 1), 'club': ('sku', 2, 1)},
    buyoutActNeedsMany=False,           # as written: every hot buy that uses up the limit records shelfBuyout
    # 1.3 strictness
    incidentChance=0.02, strictnessDecayDays=45, closureDays=21,
    # 1.4, 1.5 online
    drawingWinChance=0.08, dropCancelChance=0.05, dropCancelBotChance=0.35,
    gameStopHotMarkup=(1.35, 1.6), clubFee=65.0, clubPricePerPack=3.75, alertFeeAll=25.0,
    # 2.1 pressure
    pressureStart=0.5, pressureMin=0.1, pressureMax=0.9, pressureHypeNews=0.15, pressureBoomDaily=0.002,
    pressureHoliday=0.10, pressureReprint=-0.25, pressureCorrectionDaily=-0.003, pressurePostHoliday=-0.10,
    pressurePull=0.01, campPressureBase=1.2, campPressureSlope=0.6, flipperSaleCut=0.20,
    # 2.2 dump
    dumpPressure=0.6, dumpDrop=(0.10, 0.20), dumpFallDays=(14, 28), dumpRecoveryDays=120, flipperDumpCap=0.45,
    # 2.3 rivals
    rivalBaseHostility=(0.15, 0.35), rivalHostilityPull=0.02, rivalTookShelfHostility=0.08,
    rivalBeatInLineHostility=0.05, rivalCreatorTierRise=0.10, rivalCampChance=0.5, rivalReceiptLineChance=0.30,
    # 2.4 heat
    heatLimitBuy=1.0, heatRepeatVisit=2.0, heatBotUse=3.0, heatKeep=0.95, storeBanHeat=10.0, storeBanDays=7,
    heatAfterBan=0.5, heatStoreBanWeight=5.0, heatBotCancelWeight=4.0,
    # 2.6 bot and Target.com, existing Pokemon Center
    pcDropChance=0.15, pcSuccess=0.30, pcBotSuccess=0.60,
    targetDropFri=0.5, targetDropOther=0.08, targetDropSuccess=0.20,
    # 3.4 MSRP step, 3.5 winter
    msrpStep=0.125, msrpStepChance=1 / 300, msrpStepEarliestDay=90, msrpStepNotice=28, msrpMarketShare=0.6,
    msrpRampDays=30.0, winterSellOffPressure=0.6, winterSellOffScale=1.5,
    # existing camp values
    campSuccess=0.6, campQuantity=(2, 6), campProducts=(2, 4), restockBotBonus=0.25, hotProductRatio=1.2,
    # existing market values
    marketEventChance=0.06, marketEventsMax=3, printChangeChance=1 / 25, printPendingMax=2,
    reprintShare=0.4, printReprintJump=(-0.35, -0.15), printReprintRampDays=21.0, printRecoveryDays=(60, 180),
    printFullSetShare=0.3, printWaveDays=(60, 180), printProductWaveDays=(7, 120),
    sealedBoomReach=0.6, sealedCorrectionReach=0.2,
    # fees
    ebayFeeRate=0.1325, ebayFeeFlat=0.40, tcgFeeRate=0.1075,
    # Part B distributor (integration D2: fillBase 0.05)
    fillBase=0.05, fillPressureWeight=0.35, fillRepWeight=0.20, fillMax=0.90, pushFillBonus=0.25, pushCost=5,
    pushCooldownDays=28, repStartPoints=20, repSpendStep=1000.0, repPointsPerWeek=3, repEventPoints=1,
    backDoorWindowDays=21, backDoorShelfShare=0.40, backDoorNoticeChance=0.15, backDoorMinUnits=10,
    backDoorRepCost=15, backDoorWarningWindowDays=84, hotFreezeDays=28, accountCloseDays=84,
    storeWholesaleDiscount=0.58, storeWholesaleMarketFloor=0.5, wholesaleDiscount=0.72, wholesaleMarketFloor=0.62,
    allocationBase=1, allocationStep=6000.0, allocationMax=5, wholesaleShortChance=0.12,
    wholesaleShortShare=(0.6, 0.9), wholesaleMissingChance=0.01, wholesaleDeliveryDays=5, distributorReviewDays=14,
    caseSizes={'Booster box': 6, 'Elite Trainer Box': 10, 'Booster bundle': 25, 'Booster pack': 144},
    # Part B plug
    plugUnlockChance=0.10, plugMinDay=14, plugReturnDays=28, plugMsrpShare=0.85, plugMarketFloor=0.65,
    plugOffersPerWeek=3, plugMaxOrder=20000.0, plugDeliveryDays=(5, 10), plugVanishBase=0.06, plugVanishStep=0.01,
    plugVanishFree=2000.0, plugVanishMax=0.16, plugVanishFloor=0.03, plugTrustStep=0.01, plugShortChance=0.10,
    plugShortShare=(0.6, 0.9), fakeRatePlug=0.08, fakeRateSealedFactor=0.5, fakeHypeFactor=1.5,
    plugSeizeChance=0.02, plugSeizeDays=(3, 14), plugRepLearnChance=0.10, plugRepLearnCost=20,
    plugRepLearnWindowDays=28,
    # Part B Rip & Ship
    ripShipCommission=0.08, ripShipProcessingRate=0.029, ripShipProcessingFlat=0.30, ripShipSupplies=0.50,
    ripShipHotBand=(0.95, 1.20), ripShipBand=(0.90, 1.05), ripShipBuyRate=0.0024, ripShipBigTicket=500.0,
    ripShipRivalStep=0.05, ripShipRivalFloor=0.80, ripShipClipFollowerShare=0.03, buyNowMinutes=15,
    ripMinutesPerPack=3.0, streamMinutes=180, palmFoundChance=0.5, palmFoundReputation=40, palmBanDays=56,
    palmCalloutHeat=90.0,
    # Part C
    calloutHeat={'kids': 70, 'productIntegrity': 60, 'fairness': 60, 'greed': 40, 'forbidden': 50, 'smear': 40},
    calloutDecay=0.15, calloutReplyHeat=20, calloutEndHeat=5, calloutMaxDays=45, calloutMaxOpen=3,
    calloutDenyTrueFactor=1.5, calloutDenyFindOutReceipts=0.5, calloutDenyFindOutPlain=0.2, calloutDenyCaughtRep=8,
    calloutDenyFalseRep=3, calloutDenyFalseDays=2, calloutMakeRightDays=1, calloutGoodwillPerHeat=2.0,
    calloutGoodwillMin=25.0, calloutGoodwillMax=250.0, calloutCounterHeat=30, calloutCounterFollowerShare=0.02,
    calloutCounterAuthenticity=0.05, calloutCounterCredTrue=0.1, calloutCounterCredFalse=0.3,
    calloutViralPeak=70, calloutBadPeak=30, calloutViralAuthenticity=0.1, storyBadViralRep=12, storyBadRep=4,
    storyBadViralFollowerShare=0.01, calloutContactCost=15, calloutRecordPeak=50, calloutRecordDays=90,
    calloutBanPeak=80, calloutBanDays=(28, 56), calloutReceiptsDaily=0.15, calloutReceiptsMinHeat=30,
    calloutReceiptsHeat=10, calloutNoAccountHeat=0.5, hiddenActNotorietyStep=0.1, hiddenActDailyCap=0.5,
    hiddenActMinWeight=0.05, hiddenActMaxDays=90, hiddenActKeepDays=120, witnessCap=3.0, rivalBreaksStory=0.33,
    rivalCalloutBase=0.02, rivalCalloutHostility=0.06, rivalCalloutTruth=0.4, rivalCalloutGap=14,
    rivalCalloutGapFactor=0.25, rivalCredFloor=0.25, rivalCredWeekly=0.05, rivalCredDenied=0.25,
    rivalReceiptDays=60, shopRivalHostilityBase=0.2, shopRivalHostilityRange=0.5, playerCalloutRep=3,
    playerCalloutFollowerShare=0.01, playerCalloutFollowerMin=50, playerCalloutCred=0.3, playerCalloutHostility=0.2,
    playerCalloutCooldown=14, kidGiftStory=0.25, storyViral=0.2, storyGoodRep=3, storyGoodViralRep=10,
    storyGoodFollowers=20, storyViralFollowerShare=0.02, storyViralFollowerMin=100, goodStoryHeatCut=10,
    viralGoodStoryHeatCut=25, storyRandomWeekly=0.03, gougeRatio=1.5,
    # Part C per-kind values: (callout type, discovery, decay, receipts). Integration 1.1 adds storeBan, botOrderCancelled.
    acts={
        'shelfBuyout': ('greed', 0.020, 0.08, 0.6), 'limitEvasion': ('greed', 0.015, 0.06, 0.4),
        'botCheckout': ('greed', 0.010, 0.05, 0.2), 'priceGouge': ('greed', 0.020, 0.07, 0.5),
        'backDoorAllocation': ('greed', 0.010, 0.03, 0.5), 'plugPurchase': ('forbidden', 0.006, 0.04, 0.3),
        'plugSeized': ('forbidden', 0.050, 0.03, 0.9), 'sellResealed': ('productIntegrity', 0.030, 0.05, 0.7),
        'palmedHit': ('fairness', 0.040, 0.04, 0.8), 'unshippedOrder': ('fairness', 0.200, 0.0, 0.9),
        'lowballKid': ('kids', 0.030, 0.06, 0.5), 'counterfeitSold': ('productIntegrity', 0.020, 0.04, 0.7),
        'storeBan': ('greed', 0.040, 0.04, 0.6), 'botOrderCancelled': ('greed', 0.015, 0.05, 0.3),
    },
    # Sim assumptions (not in the proposal)
    startRep=200, startFollowers=5000, viewers=50, bigHitPerPack=1 / 20, storeOpenDay=60,
    showDaysPerWeek=1, kidPerShowDay=0.7, kidGiftCost=2.0,
    # Rule flags. False/True here is the proposal as written. TUNED flips them.
    rsCountsRetail=False,          # Part B 3.6: a Rip & Ship sale counts as "elsewhere" in the back-door check
    hotAllocationGrows=True,       # wholesaleCap: hot product grows to allocationMax cases like other product
    palmRefundIncludesCard=False,  # Part B 5.6: "make it right" on a palm pays the order price only
)

# Recommended values (report section "Recommended value changes").
TUNED_OVERRIDES = dict(
    vendorHours=[8.0, 10.0, 13.0, 16.0],
    vendorWeekdays=(1, 5),
    hotDrainBase=0.2, hotDrainPressure=0.6,
    batchExcludeStoreExclusive=True,
    buyoutActNeedsMany=True,
    storeBanDays=21,
    incidentChance=0.05, strictnessDecayDays=90,
    rivalCalloutBase=0.008,
    calloutDenyFalseRep=1,
    rivalReceiptLineChance=0.05,
    playerCalloutFollowerShare=0.005, playerCalloutFollowerMin=10, playerCalloutCooldown=28, playerCalloutRep=1,
    calloutCounterFollowerShare=0.005,
    rsCountsRetail=True,
    hotAllocationGrows=False,
    palmRefundIncludesCard=True,
    fakeRatePlug=0.055,
)

CHAINS = ['target', 'walmart', 'bestbuy', 'gamestop', 'barnes', 'club']
BIG = ['target', 'walmart', 'bestbuy', 'gamestop', 'barnes']
BIG_KINDS = {'Booster pack', 'Blister', 'Tin', 'Booster bundle', 'Elite Trainer Box', 'Collection'}
CAMP_KINDS = {'Elite Trainer Box', 'Booster bundle', 'Collection', 'Tin', 'Booster box', 'Blister'}
PC_KINDS = {'Booster bundle', 'Elite Trainer Box', 'Collection', 'Tin'}
TARGET_KINDS = {'Elite Trainer Box', 'Booster bundle', 'Collection', 'Tin', 'Blister'}
WHOLESALE_KINDS = {'Booster box', 'Elite Trainer Box', 'Booster bundle', 'Booster pack'}

# ----------------------------------------------------------------------------------------------------------------
# Data
# ----------------------------------------------------------------------------------------------------------------

PRODUCTS = []          # tuples (name, kind, packs, msrp, market, slug, pcExcl, clubExcl)
POOLS = {}
HIT_VALUES = []


def load_data(repo):
    global PRODUCTS, POOLS, HIT_VALUES
    res = os.path.join(repo, 'app', 'PokeVendor', 'Resources')
    cat = json.load(open(os.path.join(res, 'catalog.json')))
    prods = []
    for p in cat:
        if not p.get('inPrint') or not p.get('msrp'):
            continue
        name = p['name']
        club = 'Costco' in name or "Sam's Club" in name
        pc = 'Pokemon Center' in name or 'Pokémon Center' in name
        prods.append((name, p['kind'], p.get('packs', 1), float(p['msrp']), float(p['market']),
                      p['mix'][0]['slug'] if p.get('mix') else '', pc, club))
    PRODUCTS = prods
    idx = range(len(prods))
    POOLS = {
        'batch_all': [i for i in idx if prods[i][1] in BIG_KINDS and prods[i][2] <= 11 and not prods[i][7]],
        'batch_noexcl': [i for i in idx if prods[i][1] in BIG_KINDS and prods[i][2] <= 11 and not prods[i][7]
                         and not prods[i][6]],
        'club': [i for i in idx if prods[i][7]],
        'camp': [i for i in idx if prods[i][1] in CAMP_KINDS and not (prods[i][6] or prods[i][7])],
        'pc': [i for i in idx if prods[i][1] in PC_KINDS and not prods[i][7]],
        'target': [i for i in idx if prods[i][1] in TARGET_KINDS and not (prods[i][6] or prods[i][7])],
        'walmartDraw': [i for i in idx if prods[i][1] in BIG_KINDS and not (prods[i][6] or prods[i][7])],
        'wholesale': [i for i in idx if prods[i][1] in WHOLESALE_KINDS and not (prods[i][6] or prods[i][7])],
    }
    slugs = set(p[5] for p in prods)
    vals = []
    for s in slugs:
        f = os.path.join(res, 'Sets', s + '.json')
        if not os.path.exists(f):
            continue
        d = json.load(open(f))
        prints = d['prints'] if isinstance(d, dict) and 'prints' in d else d
        for pr in prints:
            m = pr.get('market') or pr.get('baseMarket') or 0
            r = pr.get('rarity', '')
            if r in ('Special illustration rare', 'Hyper rare') or (m >= 25 and r not in ('Common', 'Uncommon')):
                vals.append(float(m))
    HIT_VALUES = sorted(vals) or [30.0]


# ----------------------------------------------------------------------------------------------------------------
# Calendar and seasons (M/Seasons.swift). Day 0 is January 1, 2029. 2029 and 2030 have 365 days.
# ----------------------------------------------------------------------------------------------------------------

def week_of_year(d):
    return (d % 365) / 365 * 52


def bump(center, half, size, w):
    dist = abs(w - center) % 52
    dist = min(dist, 52 - dist)
    if dist >= half:
        return 0.0
    return size * (1 + math.cos(math.pi * dist / half)) / 2


def season_name(d):
    w = week_of_year(d)
    if bump(47.5, 5.5, 0.15, w) != 0:
        return 'holiday'
    if bump(5, 6, -0.10, w) != 0:
        return 'after'
    if bump(30, 6, -0.05, w) != 0:
        return 'summer'
    return None


def season_demand_sealed(d):
    w = week_of_year(d)
    return 1 + bump(47.5, 5.5, 0.15, w) + bump(30, 6, -0.05, w)


# ----------------------------------------------------------------------------------------------------------------
# Market pass: regimes, news, print changes, pressure, dumps, strictness, MSRP step. Independent of the player.
# ----------------------------------------------------------------------------------------------------------------

def make_regimes(rng):
    out, kind, day = [], 'flat', 0
    while day < 800:
        if kind == 'flat':
            days = int(rng.uniform(120, 360)); move = rng.uniform(-0.03, 0.03) * days / 364
        elif kind == 'boom':
            days = int(rng.uniform(120, 300)); move = math.log(1 + rng.uniform(0.30, 0.80))
        else:
            days = int(rng.uniform(180, 360)); move = math.log(1 - rng.uniform(0.15, 0.35))
        out.append((kind, day, days, move))
        day += days
        r = rng.random()
        if kind == 'flat':
            kind = 'boom' if r < 0.5 else ('correction' if r < 0.8 else 'flat')
        elif kind == 'boom':
            kind = 'correction' if r < 0.6 else 'flat'
        else:
            kind = 'flat' if r < 0.7 else 'boom'
    return out


def regime_at(regimes, d):
    cur = regimes[0]
    for r in regimes:
        if r[1] <= d:
            cur = r
    return cur


def sealed_regime_factor(regimes, d, cfg):
    log = 0.0
    for kind, start, days, move in regimes:
        if start >= d:
            break
        t = min(1.0, (d - start) / days)
        reach = cfg['sealedBoomReach'] if move > 0 else cfg['sealedCorrectionReach']
        log += move * t * t * (3 - 2 * t) * reach
    return math.exp(log)


def market_year(seed, cfg, days):
    rng = random.Random(seed * 7 + 1)
    regimes = make_regimes(rng)
    P = [cfg['pressureStart']] * (days + 2)
    events = []            # [kind, start, length]
    seen = set()
    changes = []           # dict(day, reprint, endsWave, announced, jump, end, ramp)
    reprints = []          # for the price path analysis
    dumps = []             # dict(start, fall, peak, reason, reprint index or None)
    msrp_step_day = None
    winter_scale = {}
    strict = {c: dict(level=0, last=0, until=None) for c in CHAINS}
    levels = {c: [0] * (days + 2) for c in CHAINS}
    # vendor slots: weekday and hour per chain (PriceCycle.unit, fixed per run)
    wd0, wd1 = cfg['vendorWeekdays']
    slots = {c: (rng.randint(wd0, wd1), rng.choice(cfg['vendorHours'])) for c in CHAINS}
    restock = {}       # day -> chains with a posted camp restock that day (Camping.swift: one per 14 days each)
    for c in BIG:
        for cyc in range(days // 14 + 2):
            restock.setdefault(cyc * 14 + rng.randint(0, 1) * 7 + rng.randint(0, 4), []).append(c)
    n_hype = n_reprint = n_dump = 0
    n_events = 0
    for t in range(1, days + 1):          # End Day that starts day t
        ended = t - 1
        before = P[ended]
        # printEndDay: announce
        pending = sum(1 for c in changes if c['day'] > t and not c['endsWave'])
        if pending < cfg['printPendingMax'] and rng.random() < cfg['printChangeChance']:
            if rng.random() < cfg['reprintShare']:
                start = t + rng.randint(7, 21)
                full = rng.random() < cfg['printFullSetShare']
                end = start + (rng.randint(*cfg['printWaveDays']) if full else rng.randint(*cfg['printProductWaveDays']))
                ch = dict(day=start, reprint=True, endsWave=False, announced=t,
                          jump=rng.uniform(*cfg['printReprintJump']), end=end,
                          ramp=rng.uniform(*cfg['printRecoveryDays']))
                changes.append(ch)
                changes.append(dict(day=end, reprint=True, endsWave=True))
            else:
                changes.append(dict(day=t + rng.randint(14, 28), reprint=False, endsWave=False))
        # marketEndDay: expire, roll news
        events = [e for e in events if t - e[1] < e[2]]
        if sum(1 for e in events if e[0] != 'dump') < cfg['marketEventsMax'] and rng.random() < cfg['marketEventChance']:
            k = rng.choice(['hype', 'hype', 'sealedHype', 'characterProduct', 'characterSellOut'])
            length = {'hype': (14, 35), 'sealedHype': (21, 45), 'characterProduct': (21, 42),
                      'characterSellOut': (28, 56)}[k]
            n_events += 1
            events.append([k, t, rng.randint(*length), n_events])
        # flippersEndDay 1: winter lock
        w, wprev = week_of_year(t), week_of_year(t - 1)
        if bump(5, 6, -0.1, w) != 0 and bump(5, 6, -0.1, wprev) == 0:
            key = (t // 365) + (1 if w > 26 else 0)
            if key not in winter_scale:
                winter_scale[key] = cfg['winterSellOffScale'] if before >= cfg['winterSellOffPressure'] else 1.0
        # 2: dumps
        today_reprints = [c for c in changes if c['reprint'] and not c['endsWave'] and c['day'] == t]
        reg = regime_at(regimes, t)
        correction_starts = reg[0] == 'correction' and reg[1] == t and t > 0
        if before >= cfg['dumpPressure']:
            for c in today_reprints:
                fall = rng.randint(*cfg['dumpFallDays'])
                dumps.append(dict(start=t, fall=fall, days=fall + cfg['dumpRecoveryDays'],
                                  peak=-rng.uniform(*cfg['dumpDrop']), reprint=id(c)))
                events.append(['dump', t, fall + cfg['dumpRecoveryDays'], -1])
                n_dump += 1
            if correction_starts:
                fall = rng.randint(*cfg['dumpFallDays'])
                dumps.append(dict(start=t, fall=fall, days=fall + cfg['dumpRecoveryDays'],
                                  peak=-rng.uniform(*cfg['dumpDrop']), reprint=None))
                events.append(['dump', t, fall + cfg['dumpRecoveryDays'], -1])
                n_dump += 1
        for c in today_reprints:
            reprints.append(dict(c, pressure_before=before, dumped=before >= cfg['dumpPressure'], cid=id(c)))
        # 3: pressure inputs
        p = before
        for e in events:
            if e[0] in ('sealedHype', 'characterSellOut') and e[3] not in seen:
                p += cfg['pressureHypeNews']
                seen.add(e[3])
                n_hype += 1
        if reg[0] == 'boom':
            p += cfg['pressureBoomDaily']
        elif reg[0] == 'correction':
            p += cfg['pressureCorrectionDaily']
        sn, sb = season_name(t), season_name(ended)
        if sn != sb:
            if sn == 'holiday':
                p += cfg['pressureHoliday']
            if sn == 'after':
                p += cfg['pressurePostHoliday']
        p += cfg['pressureReprint'] * len(today_reprints)
        n_reprint += len(today_reprints)
        p += (cfg['pressureStart'] - p) * cfg['pressurePull']
        p = min(cfg['pressureMax'], max(cfg['pressureMin'], p))
        P[t] = p
        # 4: strictness incidents on yesterday's vendor visits
        for c in CHAINS:
            s = strict[c]
            if s['level'] == 4 and s['until'] is not None and t > s['until']:
                s['level'] = 3; s['last'] = t; s['until'] = None
            elif 0 < s['level'] < 4 and t - s['last'] >= cfg['strictnessDecayDays']:
                s['level'] -= 1; s['last'] = t
            if ended % 7 == slots[c][0] and s['level'] < 4 and rng.random() < cfg['incidentChance'] * p:
                s['level'] += 1; s['last'] = t
                if s['level'] == 4:
                    s['until'] = t + cfg['closureDays']
            levels[c][t] = s['level']
        # 6: MSRP step
        if msrp_step_day is None and t >= cfg['msrpStepEarliestDay'] and rng.random() < cfg['msrpStepChance']:
            msrp_step_day = t + cfg['msrpStepNotice']
    # derived daily arrays
    F, STEP = [1.0] * (days + 2), [1.0] * (days + 2)
    for d in range(days + 2):
        w = week_of_year(d)
        winter = bump(5, 6, -0.10, w) * winter_scale.get((d // 365) + (1 if w > 26 else 0), 1.0)
        season = 1 + winter + bump(48, 5, 0.05, w)
        lift = 1.0
        if msrp_step_day is not None and d >= msrp_step_day:
            STEP[d] = 1 + cfg['msrpStep']
            lift = 1 + cfg['msrpStep'] * cfg['msrpMarketShare'] * min(1.0, (d - msrp_step_day) / cfg['msrpRampDays'])
        F[d] = sealed_regime_factor(regimes, d, cfg) * season * lift
    regime_kind = [regime_at(regimes, d)[0] for d in range(days + 2)]
    return dict(P=P, F=F, STEP=STEP, levels=levels, slots=slots, restock=restock, reprints=reprints, dumps=dumps,
                n_hype=n_hype, n_reprint=n_reprint, n_dump=n_dump, msrp_step_day=msrp_step_day,
                regime=regime_kind, winter_scale=winter_scale)


def is_hot(pi, d, mkt, cfg):
    _, _, _, msrp, market, _, _, _ = PRODUCTS[pi]
    return market * mkt['F'][d] >= cfg['hotProductRatio'] * msrp * mkt['STEP'][d]


def market_price(pi, d, mkt):
    return PRODUCTS[pi][4] * mkt['F'][d]


def ebay_net(price):
    ship = 1.50 if price < 20 else 6.50
    return price * (1 - BASE['ebayFeeRate']) - BASE['ebayFeeFlat'] - ship


# ----------------------------------------------------------------------------------------------------------------
# Reprint price path with the dump and the 45% cap (Part A 2.2 and PriceCycle.printJumps)
# ----------------------------------------------------------------------------------------------------------------

def reprint_path(rep, dumps, cfg, offsets):
    a, s, e, j, ramp = rep['announced'], rep['day'], rep['end'], rep['jump'], rep['ramp']
    my = [x for x in dumps if x['reprint'] == rep['cid']]
    out, raw = [], []
    for off in offsets:
        d = a + off
        jumps = 1.0
        if d >= a:
            jumps *= 1 + j * min(1.0, 0.5 + 0.5 * (d - a) / cfg['printReprintRampDays'])
        if d >= e:
            back = 1 / (1 + j) - 1
            jumps *= 1 + back * min(1.0, (d - e) / ramp)
        dump = 1.0
        for x in my:
            t = d - x['start']
            if 0 <= t < x['days']:
                if t < x['fall']:
                    dump *= 1 + x['peak'] * t / max(x['fall'], 1)
                else:
                    dump *= 1 + x['peak'] * (1 - (t - x['fall']) / max(x['days'] - x['fall'], 1))
        raw.append(jumps * dump)
        out.append(max(1 - cfg['flipperDumpCap'], jumps * dump) if dump < 1 else jumps)
    return out, raw


# ----------------------------------------------------------------------------------------------------------------
# Player state, hidden acts, and callouts (Part C)
# ----------------------------------------------------------------------------------------------------------------

def rep_tier(r):
    return sum(1 for x in (50, 150, 350, 700) if r >= x)


def follower_tier(f):
    return sum(1 for x in (1000, 10000, 100000, 1000000) if f >= x)


class Player:
    def __init__(self, seed, strat, mkt, cfg, days):
        self.rng = random.Random(seed * 101 + strat['id'])
        self.cfg, self.mkt, self.strat, self.days = cfg, mkt, strat, days
        self.rep = cfg['startRep']; self.followers = cfg['startFollowers']; self.auth = 1.0
        self.account = True
        self.cash_spent = 0.0
        self.m = dict(units=0, units_shelf=0, units_camp=0, units_draw=0, units_pc=0, units_target=0, units_club=0,
                      units_cancelled=0, profit=0.0, fixed_costs=0.0, bans=0, first_ban=None, heat_sum=0.0,
                      heat_max=0.0, callouts_true=0, callouts_false=0, callouts_cheap=0, rep_lost=0, rep_gained=0,
                      fol_lost=0, fol_gained=0, make_right_cash=0.0, records=0, whatnot_ban_days=0,
                      player_callouts=0, receipts=0, kid_gifts=0, kid_rep=0, kid_fol=0, counters=0, open_days=0,
                      sponsor_block_days=0, acts={}, sale_factor_sum=0.0, sale_factor_n=0, max_open=0)
        # retail state
        self.store_heat = {c: 0.0 for c in CHAINS}
        self.banned_until = {c: -1 for c in CHAINS}
        self.heat = 0.0
        self.batch_bought = {}
        self.batch_cache = {}
        self.daily = None
        self.club_member = False
        self.drop_orders = []      # (rollDay, chance, bot, cost)
        # rivals: 3 flippers with 2 home chains, 2 creators (Part A 2.3)
        r = random.Random(seed * 13 + 5)
        self.rivals = []
        for k in range(3):
            base = r.uniform(*cfg['rivalBaseHostility'])
            homes = r.sample(BIG, 2)
            self.rivals.append(dict(kind='flipper', base=base, h=base, cred=1.0, homes=homes))
        for k in range(2):
            base = r.uniform(*cfg['rivalBaseHostility'])
            self.rivals.append(dict(kind='creator', base=base, h=base, cred=1.0, homes=[]))
        self.rival_at = {}
        for c in BIG:
            here = [i for i, x in enumerate(self.rivals) if c in x['homes']]
            self.rival_at[c] = here[r.randrange(len(here))] if here else None
        self.shops = {'castle': dict(h=cfg['shopRivalHostilityBase'] + cfg['shopRivalHostilityRange'] * 0.5, cred=1.0),
                      'topdeck': dict(h=cfg['shopRivalHostilityBase'] + cfg['shopRivalHostilityRange'] * 0.5, cred=1.0)}
        self.has_store = False
        # Part C state
        self.acts = []
        self.open = []
        self.receipts = []        # (rival index, day)
        self.player_callout_day = {}
        self.last_rival_callout = -999
        self.stories = []         # (day, viral)
        self.records = []
        self.follower_mark = follower_tier(self.followers)
        self.whatnot_banned_until = -1

    # --- reputation helpers
    def add_rep(self, n):
        if n < 0:
            self.m['rep_lost'] += -n
        else:
            self.m['rep_gained'] += n
        self.rep = max(0, self.rep + n)

    def add_fol(self, n):
        if n < 0:
            self.m['fol_lost'] += -n
        else:
            self.m['fol_gained'] += n
        self.followers = max(0, self.followers + n)

    def notoriety(self):
        return rep_tier(self.rep) + (follower_tier(self.followers) if self.account else 0)

    # --- hidden acts
    def record_act(self, kind, weight, day, witnesses=0, refund=0.0, reveal=None):
        t, disc, decay, rec = self.cfg['acts'][kind]
        a = dict(kind=kind, day=day, weight=max(0.1, min(3.0, weight)), decay=decay, witnesses=witnesses,
                 refund=refund, reveal=reveal, exposed=False)
        self.acts.append(a)
        self.m['acts'][kind] = self.m['acts'].get(kind, 0) + 1
        return a

    def goodwill(self, heat):
        c = self.cfg
        return round(min(c['calloutGoodwillMax'], max(c['calloutGoodwillMin'], heat * c['calloutGoodwillPerHeat'])))

    def open_player(self):
        return [c for c in self.open if c['target'] == 'player']

    def start_callout(self, ctype, truth, receipts, heat, accuser, t, refund=0.0, act=None):
        if len(self.open_player()) >= self.cfg['calloutMaxOpen']:
            return None
        start = min(100.0, heat)
        c = dict(type=ctype, truth=truth, receipts=receipts, heat=start, peak=start, start=t, accuser=accuser,
                 reply=None, replyDay=None, fallFrom=None, fallEnd=None, madeRight=False, caught=False,
                 refund=refund if refund > 0 else self.goodwill(start), target='player', act=act)
        self.open.append(c)
        if truth:
            self.m['callouts_true'] += 1
        else:
            self.m['callouts_false'] += 1
        self.m['max_open'] = max(self.m['max_open'], len(self.open_player()))
        return c

    def accuser_name_hostility(self, acc):
        if acc[0] == 'rival':
            return self.rivals[acc[1]]['h']
        if acc[0] == 'shop':
            return self.shops[acc[1]]['h']
        return 0.5

    def expose_step(self, t):
        cfg = self.cfg
        notor = self.notoriety()
        pressure, heat = self.mkt['P'][t], self.heat
        due = []
        for a in self.acts:
            if a['exposed']:
                continue
            ctype, disc, decay, rec = cfg['acts'][a['kind']]
            if a['reveal'] is not None:
                d = a['reveal'] <= t
            elif a['day'] == t:
                d = False
            else:
                wit = min(cfg['witnessCap'], 1 + math.log10(1 + a['witnesses']) / 2)
                p = disc * a['weight'] * wit * (1 + cfg['hiddenActNotorietyStep'] * notor)
                if ctype == 'greed':
                    p *= (0.5 + pressure) * (1 + min(1.0, heat / 10))
                d = self.rng.random() < min(cfg['hiddenActDailyCap'], p)
            if d:
                due.append(a)
            elif a['reveal'] is None:
                a['weight'] *= 1 - a['decay']
        for a in due:
            ctype, disc, decay, rec = cfg['acts'][a['kind']]
            if self.rng.random() < cfg['rivalBreaksStory']:
                acc = ('rival', self.rng.randrange(len(self.rivals)))
            else:
                acc = ('person',)
            heat0 = cfg['calloutHeat'][ctype] * min(1.5, max(0.75, a['weight']))
            if self.start_callout(ctype, True, self.rng.random() < rec, heat0, acc, t, a['refund'], a) is not None:
                a['exposed'] = True
        keep, maxd, minw = cfg['hiddenActKeepDays'], cfg['hiddenActMaxDays'], cfg['hiddenActMinWeight']
        self.acts = [a for a in self.acts if not (
            (t - a['day'] > keep) if a['exposed'] else
            (a['reveal'] is None and a['decay'] > 0 and (a['weight'] < minw or t - a['day'] > maxd)))]

    def rival_pool(self):
        out = [(('rival', i), r['h'], r['cred'], r['kind'] == 'creator') for i, r in enumerate(self.rivals)]
        if self.has_store:
            for s, v in self.shops.items():
                out.append((('shop', s), v['h'], v['cred'], False))
        return out

    def rival_callout(self, entry, t):
        cfg = self.cfg
        acc, h, cred, creator = entry
        fits = {'fairness', 'productIntegrity', 'kids', 'greed'} if creator else {'greed', 'forbidden', 'productIntegrity'}
        acts = [a for a in self.acts if not a['exposed'] and cfg['acts'][a['kind']][0] in fits]
        if acts and self.rng.random() < cfg['rivalCalloutTruth']:
            a = self.rng.choice(acts)
            ctype, disc, decay, rec = cfg['acts'][a['kind']]
            c = self.start_callout(ctype, True, self.rng.random() < rec * 0.5, cfg['calloutHeat'][ctype] * cred, acc, t,
                                   a['refund'], a)
            if c is not None:
                a['exposed'] = True
        else:
            if acc[0] == 'shop':
                ctype = 'greed' if self.rng.random() < 0.5 else 'productIntegrity'
            elif creator:
                x = self.rng.random()
                ctype = 'fairness' if x < 0.5 else ('greed' if x < 0.85 else 'kids')
            else:
                ctype = 'greed' if self.rng.random() < 0.7 else 'productIntegrity'
            scale = cred * (1 if self.account else cfg['calloutNoAccountHeat'])
            c = self.start_callout(ctype, False, False, cfg['calloutHeat'][ctype] * scale, acc, t)
        if c is not None:
            self.last_rival_callout = t
        return c

    def rival_weekly(self, t):
        cfg = self.cfg
        if t % 7 != 0:
            return
        self.receipts = [x for x in self.receipts if t - x[1] <= cfg['rivalReceiptDays']]
        if not (rep_tier(self.rep) >= 1 or (self.account and follower_tier(self.followers) >= 1)):
            return
        for entry in self.rival_pool():
            op = self.open_player()
            if len(op) >= cfg['calloutMaxOpen'] or any(c['accuser'] == entry[0] for c in op):
                continue
            p = (cfg['rivalCalloutBase'] + cfg['rivalCalloutHostility'] * entry[1]) * entry[2]
            if t - self.last_rival_callout < cfg['rivalCalloutGap']:
                p *= cfg['rivalCalloutGapFactor']
            if self.rng.random() < p:
                self.rival_callout(entry, t)
        # the bad branch of the weekly random story (Haggling.swift, extended by Part C 4.3)
        if self.rng.random() < cfg['storyRandomWeekly'] and rep_tier(self.rep) >= 2 and self.rng.random() < 0.5:
            self.rival_callout(self.rng.choice(self.rival_pool()), t)

    def lose_cred(self, acc, amount):
        floor = self.cfg['rivalCredFloor']
        if acc[0] == 'rival':
            r = self.rivals[acc[1]]
            r['cred'] = max(floor, r['cred'] - amount)
        elif acc[0] == 'shop':
            s = self.shops[acc[1]]
            s['cred'] = max(floor, s['cred'] - amount)

    def advance_callouts(self, t):
        cfg = self.cfg
        ended = []
        for c in self.open:
            if c['start'] == t:
                continue
            if c['fallFrom'] is not None:
                c['heat'] = 0.0 if t >= c['fallEnd'] else c['fallFrom'] * (c['fallEnd'] - t) / max(1, c['fallEnd'] - c['replyDay'])
            else:
                c['heat'] *= 1 - cfg['calloutDecay']
            if c['reply'] in ('deny', 'counter') and c['replyDay'] == t - 1 and c['fallFrom'] is None \
                    and c['accuser'][0] == 'rival' and self.rng.random() < self.rivals[c['accuser'][1]]['h']:
                c['heat'] = min(100.0, c['heat'] + cfg['calloutReplyHeat'])
            if c['truth'] and not c['receipts'] and c['heat'] >= cfg['calloutReceiptsMinHeat'] \
                    and self.rng.random() < cfg['calloutReceiptsDaily']:
                c['receipts'] = True
                c['heat'] = min(100.0, c['heat'] + cfg['calloutReceiptsHeat'])
            c['peak'] = max(c['peak'], c['heat'])
            if c['heat'] < cfg['calloutEndHeat'] or t - c['start'] > cfg['calloutMaxDays']:
                ended.append(c)
        for c in ended:
            self.open.remove(c)
            self.settle(c, t)

    def settle(self, c, t):
        cfg = self.cfg
        if c['target'] != 'player':
            return
        free = (not c['truth']) and (c['madeRight'] or c['reply'] == 'deny')
        rep = 0
        if not free:
            if c['peak'] >= cfg['calloutViralPeak']:
                rep = cfg['storyBadViralRep']
                if self.account and not c['madeRight']:
                    self.add_fol(-int(self.followers * cfg['storyBadViralFollowerShare']))
                    self.auth = max(0, self.auth - cfg['calloutViralAuthenticity'])
            elif c['peak'] >= cfg['calloutBadPeak']:
                rep = cfg['storyBadRep']
            if c['madeRight']:
                rep = (rep + 1) // 2
        if rep > 0:
            self.add_rep(-rep)
        if c['truth']:
            if c['peak'] >= cfg['calloutRecordPeak'] and not c['madeRight']:
                self.records.append(t + cfg['calloutRecordDays'])
                self.m['records'] += 1
            if c['type'] == 'productIntegrity' and c['peak'] >= cfg['calloutBanPeak']:
                self.whatnot_ban(t, self.rng.randint(*cfg['calloutBanDays']))

    def whatnot_ban(self, t, days):
        end = t + days
        if end > self.whatnot_banned_until:
            self.m['whatnot_ban_days'] += end - max(t, self.whatnot_banned_until)
            self.whatnot_banned_until = end

    def reply_step(self, d):
        """The player answers callouts that opened in the morning report of day d."""
        cfg, pol = self.cfg, self.strat['reply']
        for c in list(self.open):
            if c['target'] != 'player' or c['start'] != d or c['reply'] is not None:
                continue
            if c['truth']:
                choice = pol['true']
            else:
                choice = pol['false']
            cheap = (not c['truth'] and self.account) or (c['truth'] and c['refund'] <= 100)
            if cheap:
                self.m['callouts_cheap'] += 1
            if choice == 'makeRight' or (choice == 'makeRightIfCheap' and c['refund'] <= 100):
                self.m['make_right_cash'] += c['refund']
                c['madeRight'] = True; c['fallFrom'] = c['heat']; c['fallEnd'] = d + cfg['calloutMakeRightDays']
                c['reply'] = 'makeRight'; c['replyDay'] = d
                continue
            if choice in ('counterDeny', 'counter'):
                if c['accuser'][0] in ('rival', 'shop'):
                    c['heat'] = min(100.0, c['heat'] + cfg['calloutCounterHeat'])
                    self.add_fol(int(self.followers * cfg['calloutCounterFollowerShare']))
                    self.auth = max(0, self.auth - cfg['calloutCounterAuthenticity'])
                    self.lose_cred(c['accuser'], cfg['calloutCounterCredTrue'] if c['truth'] else cfg['calloutCounterCredFalse'])
                    if c['accuser'][0] == 'rival':
                        r = self.rivals[c['accuser'][1]]
                        r['h'] = min(1.0, r['h'] + cfg['playerCalloutHostility'])
                    c['reply'] = 'counter'; c['replyDay'] = d
                    c['peak'] = max(c['peak'], c['heat'])
                    self.m['counters'] += 1
                if choice == 'counter':
                    continue
                choice = 'deny'
            if choice == 'deny':
                if c['truth']:
                    c['heat'] = min(100.0, c['heat'] * cfg['calloutDenyTrueFactor'])
                    fo = cfg['calloutDenyFindOutReceipts'] if c['receipts'] else cfg['calloutDenyFindOutPlain']
                    if self.rng.random() < fo:
                        c['caught'] = True; c['receipts'] = True
                        self.add_rep(-cfg['calloutDenyCaughtRep'])
                else:
                    c['fallFrom'] = c['heat']; c['fallEnd'] = d + cfg['calloutDenyFalseDays']
                    self.add_rep(cfg['calloutDenyFalseRep'])
                    self.lose_cred(c['accuser'], cfg['rivalCredDenied'])
                    if c['accuser'][0] == 'rival':
                        self.receipts.append((c['accuser'][1], d))
                        self.m['receipts'] += 1
                c['reply'] = 'deny'; c['replyDay'] = d
                c['peak'] = max(c['peak'], c['heat'])
            # 'silent': nothing

    def player_callouts(self, d):
        cfg = self.cfg
        if not self.strat.get('farm'):
            return
        for i, r in enumerate(self.rivals):
            last = self.player_callout_day.get(i, -999)
            if d - last < cfg['playerCalloutCooldown']:
                continue
            rec = [x for x in self.receipts if x[0] == i]
            if not rec:
                continue
            self.receipts.remove(rec[0])
            self.player_callout_day[i] = d
            self.add_rep(cfg['playerCalloutRep'])
            self.add_fol(max(cfg['playerCalloutFollowerMin'], int(self.followers * cfg['playerCalloutFollowerShare'])))
            r['cred'] = max(cfg['rivalCredFloor'], r['cred'] - cfg['playerCalloutCred'])
            r['h'] = min(1.0, r['h'] + cfg['playerCalloutHostility'])
            self.m['player_callouts'] += 1

    def kid_gift(self, d):
        cfg = self.cfg
        if not self.strat.get('kidGift'):
            return
        if d % 7 != 5 or self.rng.random() >= cfg['kidPerShowDay']:
            return
        self.m['kid_gifts'] += 1
        self.cash_spent += cfg['kidGiftCost']
        if self.rng.random() < cfg['kidGiftStory']:
            self.stories.append((d + self.rng.randint(1, 10), self.rng.random() < cfg['storyViral']))

    def stories_step(self, t):
        cfg = self.cfg
        cool = 0
        due = [s for s in self.stories if s[0] <= t]
        self.stories = [s for s in self.stories if s[0] > t]
        for day, viral in due:
            if viral:
                g = max(cfg['storyViralFollowerMin'], int(self.followers * cfg['storyViralFollowerShare']))
                self.add_rep(cfg['storyGoodViralRep']); self.add_fol(g)
                self.m['kid_rep'] += cfg['storyGoodViralRep']; self.m['kid_fol'] += g
                cool += cfg['viralGoodStoryHeatCut']
            else:
                self.add_rep(cfg['storyGoodRep']); self.add_fol(cfg['storyGoodFollowers'])
                self.m['kid_rep'] += cfg['storyGoodRep']; self.m['kid_fol'] += cfg['storyGoodFollowers']
                cool += cfg['goodStoryHeatCut']
        if cool:
            for c in self.open:
                if c['target'] == 'player' and c['fallFrom'] is None:
                    c['heat'] = max(0.0, c['heat'] - cool)

    def rivals_end_day(self, t):
        cfg = self.cfg
        tier = follower_tier(self.followers)
        rose = tier > self.follower_mark
        for r in self.rivals:
            r['h'] += (r['base'] - r['h']) * cfg['rivalHostilityPull']
            if rose and r['kind'] == 'creator':
                r['h'] = min(1.0, r['h'] + cfg['rivalCreatorTierRise'])
            if t % 7 == 0:
                r['cred'] = min(1.0, r['cred'] + cfg['rivalCredWeekly'])
        if t % 7 == 0:
            for s in self.shops.values():
                s['cred'] = min(1.0, s['cred'] + cfg['rivalCredWeekly'])
        if rose:
            self.follower_mark = tier

    # --- retail (Part A)
    def add_heat(self, amount, chain, kind, d, record=True):
        cfg = self.cfg
        self.heat += amount
        if record:
            self.record_act(kind, amount, d)
        if chain is None:
            return
        h = self.store_heat[chain] + amount
        if h < cfg['storeBanHeat']:
            self.store_heat[chain] = h
            return
        self.store_heat[chain] = h * cfg['heatAfterBan']
        self.banned_until[chain] = d + cfg['storeBanDays']
        self.m['bans'] += 1
        if self.m['first_ban'] is None:
            self.m['first_ban'] = d
        self.record_act('storeBan', cfg['heatStoreBanWeight'], d)

    def heat_end_day(self, t):
        k = self.cfg['heatKeep']
        self.heat *= k
        for c in CHAINS:
            self.store_heat[c] *= k

    def new_daily(self, d):
        self.daily = dict(day=d, visits={c: 0 for c in CHAINS}, vb={c: 0 for c in CHAINS},
                          vh={c: 0 for c in CHAINS}, checkout={}, sku={}, club_hot=False)

    def batch_day(self, chain, d, hour):
        wd, h = self.mkt['slots'][chain]
        vd = d - ((d % 7) - wd + 7) % 7
        if vd == d and hour < h:
            vd -= 7
        return vd

    def batch(self, chain, vd, seed):
        key = (chain, vd)
        if key in self.batch_cache:
            return self.batch_cache[key]
        cfg, mkt = self.cfg, self.mkt
        if vd < 0:
            self.batch_cache[key] = []
            return []
        r = random.Random(seed * 1_000_003 + CHAINS.index(chain) * 7919 + vd * 31)
        if chain == 'club':
            options = POOLS['club']
        else:
            options = POOLS['batch_noexcl'] if cfg['batchExcludeStoreExclusive'] else POOLS['batch_all']
        picks = []
        for _ in range(r.randint(*cfg['batchProducts'][chain])):
            p = r.choice(options)
            if p not in picks:
                picks.append(p)
        size = cfg['batchSize'][chain]
        base = cfg['batchMinUnits'] * len(picks)
        weights = [r.uniform(0.5, 1.5) for _ in picks]
        tot = sum(weights)
        spare = max(0, size - base)
        items = []
        for i, p in enumerate(picks):
            q = cfg['batchMinUnits'] + int(round(spare * weights[i] / tot))
            hot = is_hot(p, vd, mkt, cfg)
            msrp = PRODUCTS[p][3] * mkt['STEP'][vd]
            if chain == 'club':
                price = max(msrp, PRODUCTS[p][2] * cfg['clubPricePerPack'])
            elif chain == 'gamestop' and hot:
                price = msrp * r.uniform(*cfg['gameStopHotMarkup'])
            else:
                price = msrp
            items.append(dict(id=(chain, vd, i), p=p, price=price, q0=q, hot=hot))
        self.batch_cache[key] = items
        return items

    def drain(self, hot, vd, from_h, d, to_h):
        cfg, P = self.cfg, self.mkt['P']
        total = 0.0
        for x in range(vd, d + 1):
            o = max(cfg['storeOpen'], from_h if x == vd else cfg['storeOpen'])
            c = min(cfg['storeClose'], to_h if x == d else cfg['storeClose'])
            if c <= o:
                continue
            rate = cfg['hotDrainBase'] + cfg['hotDrainPressure'] * P[max(0, x)] if hot else cfg['coldDrainRate']
            total += rate * (c - o)
        return math.exp(-total)

    def limit_left(self, chain, p, hot, d, visit):
        cfg = self.cfg
        level = self.mkt['levels'][chain][d]
        if level >= 4 or self.banned_until[chain] >= d:
            return 0
        if level >= 3 and hot:
            return 0
        if chain == 'club' and not self.club_member:
            return 0
        kind, normal, hcap = cfg['baseLimit'][chain]
        left = 10 ** 6
        per_sku = normal if kind == 'sku' else None
        if level >= 1:
            per_sku = 1
        dl = self.daily
        if per_sku is not None:
            cap = min(per_sku, hcap) if hot else per_sku
            left = min(left, cap - dl['sku'].get((chain, p), 0))
        if kind == 'visit':
            left = min(left, normal - dl['vb'][chain])
            if hot:
                left = min(left, hcap - dl['vh'][chain])
        if hot and chain == 'club' and dl['club_hot']:
            left = 0
        if level >= 2 and chain in dl['checkout'] and dl['checkout'][chain] != visit:
            left = 0
        return max(0, left)

    def begin_visit(self, chain):
        dl = self.daily
        dl['visits'][chain] += 1
        dl['vb'][chain] = 0
        dl['vh'][chain] = 0
        return dl['visits'][chain]

    def note_purchase(self, chain, p, hot, d, visit, batch_item=None):
        cfg, dl = self.cfg, self.daily
        if batch_item is not None:
            self.batch_bought[batch_item['id']] = self.batch_bought.get(batch_item['id'], 0) + 1
        dl['vb'][chain] += 1
        if hot:
            dl['vh'][chain] += 1
        dl['checkout'].setdefault(chain, visit)
        if chain == 'club' and hot:
            dl['club_hot'] = True
        first = dl['vb'][chain] == 1
        dl['sku'][(chain, p)] = dl['sku'].get((chain, p), 0) + 1
        if visit > 1 and first:
            self.add_heat(cfg['heatRepeatVisit'], chain, 'limitEvasion', d)
        if hot and self.limit_left(chain, p, hot, d, visit) == 0:
            kind, normal, hcap = cfg['baseLimit'][chain]
            took_many = dl['sku'].get((chain, p), 0) >= 2 or (kind == 'visit' and hcap >= 2 and dl['vh'][chain] >= hcap)
            # The +1 heat always applies. Tuned: the hidden act needs a limit of 2 or more units.
            self.add_heat(cfg['heatLimitBuy'], chain, 'shelfBuyout', d,
                          record=(not cfg['buyoutActNeedsMany']) or took_many)

    def take_unit(self, p, price, d, source):
        m = self.m
        m['units'] += 1
        m['units_' + source] += 1
        self.cash_spent += price
        self.held.append((p, price, d))

    def store_visit(self, chain, d, hour, seed, max_per_product):
        cfg = self.cfg
        level = self.mkt['levels'][chain][d]
        visit = self.begin_visit(chain)
        if level >= 4:
            return 0
        vd = self.batch_day(chain, d, hour)
        items = self.batch(chain, vd, seed)
        slot_h = self.mkt['slots'][chain][1]
        got = 0
        items_sorted = sorted(items, key=lambda it: -(market_price(it['p'], d, self.mkt) - it['price']))
        for it in items_sorted:
            if level >= 3 and it['hot']:
                continue
            share = self.drain(it['hot'], vd, slot_h, d, hour)
            qty = int(round(it['q0'] * share))
            left = qty - self.batch_bought.get(it['id'], 0)
            if left <= 0:
                ri = self.rival_at.get(chain)
                if it['hot'] and ri is not None and self.rng.random() < cfg['rivalReceiptLineChance']:
                    self.receipts.append((ri, d))
                    self.m['receipts'] += 1
                continue
            if not it['hot']:
                continue         # every strategy here buys hot product only
            bought_here = 0
            while left > 0 and bought_here < max_per_product and self.limit_left(chain, it['p'], True, d, visit) > 0:
                self.note_purchase(chain, it['p'], True, d, visit, it)
                self.take_unit(it['p'], it['price'], d, 'club' if chain == 'club' else 'shelf')
                left -= 1; bought_here += 1; got += 1
            if left == 0 and vd == d:
                ri = self.rival_at.get(chain)
                if ri is not None:
                    r = self.rivals[ri]
                    r['h'] = min(1.0, r['h'] + cfg['rivalTookShelfHostility'])
        return got

    def camp(self, chain, d, max_per_product):
        cfg, mkt = self.cfg, self.mkt
        if self.banned_until[chain] >= d or mkt['levels'][chain][d] >= 4:
            return 0
        visit = self.begin_visit(chain)
        bot = cfg['restockBotBonus'] if self.strat.get('restockBot') else 0.0
        chance = (cfg['campSuccess'] + bot) * (cfg['campPressureBase'] - cfg['campPressureSlope'] * mkt['P'][d])
        ri = self.rival_at.get(chain)
        rival_line = ri is not None and self.rng.random() < cfg['rivalCampChance']
        if self.rng.random() >= chance:
            if rival_line and self.rng.random() < cfg['rivalReceiptLineChance']:
                self.receipts.append((ri, d)); self.m['receipts'] += 1
            return 0
        if rival_line:
            r = self.rivals[ri]
            r['h'] = min(1.0, r['h'] + cfg['rivalBeatInLineHostility'])
        level = mkt['levels'][chain][d]
        kind, normal, hcap = cfg['baseLimit'][chain]
        got = 0
        picks = []
        for _ in range(self.rng.randint(*cfg['campProducts'])):
            p = self.rng.choice(POOLS['camp'])
            if p not in picks:
                picks.append(p)
        for p in picks:
            hot = is_hot(p, d, mkt, cfg)
            if level >= 3 and hot:
                continue
            if not hot:
                continue
            cap = 10 ** 6
            per_sku = (1 if level >= 1 else normal) if kind == 'sku' else (1 if level >= 1 else None)
            if per_sku is not None:
                cap = min(cap, min(per_sku, hcap))
            if kind == 'visit':
                cap = min(cap, normal, hcap)
            qty = min(self.rng.randint(*cfg['campQuantity']), max(1, cap))
            n = 0
            while n < qty and n < max_per_product and self.limit_left(chain, p, True, d, visit) > 0:
                self.note_purchase(chain, p, True, d, visit)
                self.take_unit(p, PRODUCTS[p][3] * mkt['STEP'][d], d, 'camp')
                n += 1; got += 1
        return got

    def pc_drop(self, d, bot):
        cfg, mkt = self.cfg, self.mkt
        if self.rng.random() >= cfg['pcDropChance']:
            return
        p = self.rng.choice(POOLS['pc'])
        if bot:
            self.add_heat(cfg['heatBotUse'], None, 'botCheckout', d)
        if self.rng.random() < (cfg['pcBotSuccess'] if bot else cfg['pcSuccess']):
            price = PRODUCTS[p][3] * mkt['STEP'][d]
            self.take_unit(p, price, d, 'pc')
            self.drop_orders.append((d + self.rng.randint(1, 3), cfg['dropCancelBotChance'] if bot else cfg['dropCancelChance'], bot, len(self.held) - 1))

    def target_drop(self, d, bot):
        cfg, mkt = self.cfg, self.mkt
        chance = cfg['targetDropFri'] if d % 7 == 4 else cfg['targetDropOther']
        if self.rng.random() >= chance:
            return
        pool = [p for p in POOLS['target'] if is_hot(p, d, mkt, cfg)]
        if not pool:
            return
        p = self.rng.choice(pool)
        attempts = 2 if bot else 1
        for _ in range(attempts):
            if bot:
                self.add_heat(cfg['heatBotUse'], None, 'botCheckout', d)
            if self.rng.random() < cfg['targetDropSuccess']:
                self.take_unit(p, PRODUCTS[p][3] * mkt['STEP'][d], d, 'target')
                self.drop_orders.append((d + self.rng.randint(1, 3), cfg['dropCancelBotChance'] if bot else cfg['dropCancelChance'], bot, len(self.held) - 1))
                return

    def drop_cancels(self, t):
        keep = []
        for o in self.drop_orders:
            if o[0] <= t:
                if self.rng.random() < o[1]:
                    p, price, dd = self.held[o[3]]
                    self.held[o[3]] = (p, 0.0, -1)    # cancelled: refund, no unit
                    self.cash_spent -= price
                    self.m['units'] -= 1
                    self.m['units_cancelled'] += 1
                    if o[2]:
                        self.record_act('botOrderCancelled', self.cfg['heatBotCancelWeight'], t)
            else:
                keep.append(o)
        self.drop_orders = keep

    def walmart_drawing(self, d):
        """Enter each week on Monday. The draw is Wednesday night. A win buys at MSRP."""
        cfg, mkt = self.cfg, self.mkt
        if d % 7 != 2:
            return
        pool = [p for p in POOLS['walmartDraw'] if is_hot(p, d, mkt, cfg)]
        if pool and self.rng.random() < cfg['drawingWinChance']:
            p = self.rng.choice(pool)
            self.take_unit(p, PRODUCTS[p][3] * mkt['STEP'][d], d, 'draw')

    def chain_drawings(self, d, seed):
        """Level 3 chains: one drawing per vendor day. The player enters every one."""
        cfg, mkt = self.cfg, self.mkt
        for c in CHAINS:
            if c == 'club' and not self.club_member:
                continue
            if mkt['levels'][c][d] == 3 and d % 7 == mkt['slots'][c][0]:
                items = [it for it in self.batch(c, d, seed) if it['hot']]
                if items and self.rng.random() < cfg['drawingWinChance']:
                    self.take_unit(items[0]['p'], items[0]['price'], d, 'draw')


# ----------------------------------------------------------------------------------------------------------------
# Distributor, plug, Rip & Ship (Part B)
# ----------------------------------------------------------------------------------------------------------------

def rs_fees(price, packs, cfg):
    ship = 4.47 if packs <= 3 else (9.85 if packs <= 36 else 15.50)
    commission = round(price * cfg['ripShipCommission'], 2)
    processing = round((price + ship) * cfg['ripShipProcessingRate'], 2)
    return commission + processing + cfg['ripShipProcessingFlat'] + cfg['ripShipSupplies'], ship, commission, processing


class Shop:
    """The own store, the hobby account, Rip & Ship, and (for the cheater) the plug."""

    def __init__(self, pl, cfg, mkt, seed, policy):
        self.pl, self.cfg, self.mkt, self.seed, self.pol = pl, cfg, mkt, seed, policy
        self.rng = random.Random(seed * 977 + 3)
        self.open_day = cfg['storeOpenDay']
        self.applied = None; self.approved = None
        self.rep = 0; self.spent = 0.0; self.carry = 0.0; self.rep_week = -1; self.rep_this_week = 0
        self.last_push = -1000
        self.hot_records = []        # [units, deliveredDay, outcome]
        self.warnings = []; self.frozen_until = -1; self.closed_until = -1
        self.rs_inventory = []       # units waiting for a stream: (p, cost, hot)
        self.m = dict(hot_requested=0, hot_filled=0, fill_new=[], fill_tenured=[], hot_cases_week=[],
                      bd_acts=0, bd_warnings=0, bd_first_warning=None, bd_closed=0, bd_first_close=None,
                      bd_freezes=0, rs_sales=0, rs_net=0.0, rs_cost=0.0, rs_ebay_alt=0.0, rs_shelf_alt=0.0,
                      rs_packs=0, streams=0, palms=0, palm_value=0.0, palm_caught=0, palm_refunds=0.0,
                      plug_orders=0, plug_spent=0.0, plug_return=0.0, plug_vanish=0, plug_seized=0,
                      plug_fake_cases=0, plug_rep_hits=0, wholesale_spent=0.0, wholesale_units=0, elite_cases=0,
                      hot_units_week=[], gouges=0, fake_found=0, hot_value=0.0)
        self.week_hot_cases = 0
        self.week_hot_units = 0
        # plug
        self.plug_open = False; self.plug_gone = None; self.plug_clean = 0; self.plug_orders = []
        self.last_plug_order = -999

    def hobby(self, d):
        return self.approved is not None and d >= self.approved and d >= self.closed_until

    def fill_rate(self, p, d):
        cfg = self.cfg
        rep = self.rep / 100 if self.hobby(d) else 0
        f = cfg['fillBase'] + cfg['fillPressureWeight'] * (1 - self.mkt['P'][d]) + cfg['fillRepWeight'] * rep
        return min(cfg['fillMax'], max(0.0, f)), rep

    def add_rep_points(self, n):
        self.rep = max(0, min(100, self.rep + n))

    def credit_spend(self, amount, d):
        cfg = self.cfg
        week = d // 7
        if self.rep_week != week:
            self.rep_week = week; self.rep_this_week = 0
        self.carry += amount
        steps = int(self.carry / cfg['repSpendStep'])
        self.carry -= steps * cfg['repSpendStep']
        earned = max(0, min(steps, cfg['repPointsPerWeek'] - self.rep_this_week))
        self.rep_this_week += earned
        self.add_rep_points(earned)

    def day(self, d):
        """Player actions in the day."""
        cfg, mkt, pl = self.cfg, self.mkt, self.pl
        if d < self.open_day:
            return
        pl.has_store = True
        if self.applied is None:
            self.applied = d
        if d % 7 == 0:
            self.weekly_orders(d)
        if self.pol.get('plug') and self.plug_open and d - self.last_plug_order >= 14:
            self.order_plug(d)
        if d % 7 in (1, 4) and d >= pl.whatnot_banned_until:
            self.stream(d)
        if self.pol.get('gouge') and d % 7 in (0, 1, 2, 3, 4) and self.pol.get('gouge_today', True):
            if pl.daily.get('gouged') != d:
                pl.daily['gouged'] = d
                pl.record_act('priceGouge', min(2.0, 1.6 - 1), d, witnesses=3)
                self.m['gouges'] += 1

    def weekly_orders(self, d):
        cfg, mkt = self.cfg, self.mkt
        hobby = self.hobby(d)
        secondary = not hobby and d >= self.open_day      # the store waits for its review, or is closed
        r = random.Random(self.seed * 57559 + (d // 7) * 909)
        offers = []
        for _ in range(8):
            p = r.choice(POOLS['wholesale'])
            if p not in offers:
                offers.append(p)
        self.m['hot_cases_week'].append(self.week_hot_cases)
        self.m['hot_units_week'].append(self.week_hot_units)
        self.week_hot_cases = 0; self.week_hot_units = 0
        elite_open = rep_tier(self.pl.rep) >= 4
        cases_this_week = 0
        for p in offers:
            if not is_hot(p, d, mkt, cfg):
                continue
            if hobby and d < self.frozen_until:
                continue
            size = cfg['caseSizes'][PRODUCTS[p][1]]
            M = market_price(p, d, mkt)
            msrp = PRODUCTS[p][3] * mkt['STEP'][d]
            if hobby:
                unit = max(msrp * cfg['storeWholesaleDiscount'], M * cfg['storeWholesaleMarketFloor'])
                cap = min(cfg['allocationMax'], cfg['allocationBase'] + int(self.spent / cfg['allocationStep']))
                if not cfg['hotAllocationGrows']:
                    cap = cfg['allocationBase']
                cap += 1 if elite_open else 0
            else:
                unit = max(msrp * cfg['wholesaleDiscount'], M * cfg['wholesaleMarketFloor'])
                cap = 1 + (1 if elite_open else 0)
                if cases_this_week >= 2 + (1 if elite_open else 0):
                    continue
                if unit * size < 250:
                    continue
            # push for allocation on the first hot offer when the cooldown allows (hobby only)
            push = 0.0
            if hobby and d - self.last_push >= cfg['pushCooldownDays'] and self.rep >= cfg['pushCost']:
                self.last_push = d; self.add_rep_points(-cfg['pushCost']); push = cfg['pushFillBonus']
            fill, rep = self.fill_rate(p, d)
            fill = min(cfg['fillMax'], fill + push)
            filled = 0; rolls = cap
            if elite_open:
                filled = 1; rolls -= 1; elite_open = False; self.m['elite_cases'] += 1
            for _ in range(rolls):
                self.m['hot_requested'] += 1
                (self.m['fill_new'] if self.rep < 50 else self.m['fill_tenured']).append(fill)
                if self.rng.random() < fill:
                    filled += 1
            self.m['hot_filled'] += filled
            cases_this_week += cap
            if filled == 0:
                continue
            total = unit * size * filled
            self.m['wholesale_spent'] += total
            self.spent += total
            if hobby:
                self.credit_spend(total, d)
            if self.rng.random() < cfg['wholesaleMissingChance']:
                continue          # refunded later; no items
            units = filled * size
            if self.rng.random() < cfg['wholesaleShortChance']:
                units = max(1, int(units * self.rng.uniform(*cfg['wholesaleShortShare'])))
                self.m['wholesale_spent'] -= unit * (filled * size - units)
            self.week_hot_cases += filled
            self.week_hot_units += units
            self.m['wholesale_units'] += units
            delivered = d + cfg['wholesaleDeliveryDays']
            # where the units go: shelf (retail) share, Rip & Ship share, eBay (back door) share
            shelf = self.pol['shelf']; rs = self.pol['rs']
            n_shelf = int(round(units * shelf)); n_rs = int(round(units * rs)); n_other = units - n_shelf - n_rs
            if hobby:
                n_ret = n_shelf + (n_rs if cfg['rsCountsRetail'] else 0)
                if n_ret:
                    self.hot_records.append([n_ret, delivered, 'retail'])
                if units - n_ret > 0:
                    self.hot_records.append([units - n_ret, delivered, 'other'])
            self.m['hot_value'] += units * ebay_net(M)
            # Rip & Ship stock: only products a viewer would buy whole (one product, not a 144-pack case of loose packs)
            for _ in range(min(n_rs, 40)):
                self.rs_inventory.append((p, unit, True, delivered))
        # weekly event credit
        if hobby:
            self.add_rep_points(cfg['repEventPoints'])

    def end_day(self, t):
        cfg = self.cfg
        if self.applied is not None and self.approved is None and t >= self.applied + cfg['distributorReviewDays']:
            self.approved = t
            self.rep = cfg['repStartPoints']
        if t % 7 == 0 and self.hobby(t):
            self.back_door_check(t)
            if self.pol.get('plug') and any(o['day'] >= t - cfg['plugRepLearnWindowDays'] for o in self.plug_orders):
                if self.rng.random() < cfg['plugRepLearnChance']:
                    self.add_rep_points(-cfg['plugRepLearnCost']); self.m['plug_rep_hits'] += 1
        if self.pol.get('plug'):
            self.plug_end_day(t)

    def back_door_check(self, t):
        cfg, pl = self.cfg, self.pl
        due = [r for r in self.hot_records if r[1] + cfg['backDoorWindowDays'] <= t]
        if not due:
            return
        self.hot_records = [r for r in self.hot_records if r[1] + cfg['backDoorWindowDays'] > t]
        retail = sum(r[0] for r in due if r[2] == 'retail')
        other = sum(r[0] for r in due if r[2] == 'other')
        total = retail + other
        if total < cfg['backDoorMinUnits']:
            return
        share = retail / total
        if share >= cfg['backDoorShelfShare']:
            return
        pl.record_act('backDoorAllocation', max(0.6, min(1.5, 1.5 * (1 - share))), t)
        self.m['bd_acts'] += 1
        if self.rng.random() >= cfg['backDoorNoticeChance']:
            return
        self.warnings = [w for w in self.warnings if w >= t - cfg['backDoorWarningWindowDays']] + [t]
        self.m['bd_warnings'] += 1
        if self.m['bd_first_warning'] is None:
            self.m['bd_first_warning'] = t
        if len(self.warnings) >= 3:
            self.closed_until = t + cfg['accountCloseDays']; self.warnings = []; self.frozen_until = -1
            self.m['bd_closed'] += 1
            if self.m['bd_first_close'] is None:
                self.m['bd_first_close'] = t
        elif len(self.warnings) == 2:
            self.frozen_until = t + cfg['hotFreezeDays']; self.m['bd_freezes'] += 1
        self.add_rep_points(-cfg['backDoorRepCost'])

    # --- Rip & Ship
    def stream(self, d):
        cfg, mkt, pl = self.cfg, self.mkt, self.pl
        inv = [u for u in self.rs_inventory if u[3] <= d]
        if not inv:
            return
        self.m['streams'] += 1
        rival_factor = max(cfg['ripShipRivalFloor'], 1 - cfg['ripShipRivalStep'] * 2)
        season = season_demand_sealed(d)
        viewers = cfg['viewers']
        minute = 0
        share = self.pol.get('rs_share', 1.0)
        tries = 0
        while inv and minute < cfg['streamMinutes']:
            p, cost, hot, dlv = inv[0]
            packs = PRODUCTS[p][2]
            if minute + packs * cfg['ripMinutesPerPack'] > cfg['streamMinutes']:
                break
            M = market_price(p, d, mkt)
            band = cfg['ripShipHotBand'] if hot else cfg['ripShipBand']
            ceiling = self.rng.uniform(*band)
            price = share * M
            crowd = min(1.0, viewers / 100) if price > cfg['ripShipBigTicket'] else 1.0
            chance = 0.0 if share > ceiling else viewers * cfg['ripShipBuyRate'] * rival_factor * crowd * season
            sold = False
            for _ in range(cfg['buyNowMinutes']):
                minute += 1
                if self.rng.random() < chance:
                    sold = True
                    break
            if not sold:
                tries += 1
                if tries >= 3:
                    inv.append(inv.pop(0)); tries = 0
                continue
            tries = 0
            inv.pop(0)
            self.rs_inventory.remove((p, cost, hot, dlv))
            fees, ship, _c, _p = rs_fees(price, packs, cfg)
            net = price - fees
            self.m['rs_sales'] += 1; self.m['rs_net'] += net; self.m['rs_cost'] += cost
            self.m['rs_ebay_alt'] += ebay_net(M); self.m['rs_shelf_alt'] += M
            self.m['rs_packs'] += packs
            minute += packs * cfg['ripMinutesPerPack']
            for _ in range(packs):
                if self.rng.random() < cfg['bigHitPerPack']:
                    v = self.rng.choice(HIT_VALUES)
                    pl.add_fol(int(round(viewers * cfg['ripShipClipFollowerShare'])))
                    if self.pol.get('palm'):
                        self.m['palms'] += 1; self.m['palm_value'] += v
                        if self.rng.random() < cfg['palmFoundChance']:
                            self.m['palm_caught'] += 1
                            pl.add_rep(-cfg['palmFoundReputation'])
                            pl.whatnot_ban(d, cfg['palmBanDays'])
                            refund = price + (v if cfg['palmRefundIncludesCard'] else 0)
                            pl.start_callout('fairness', True, True, cfg['palmCalloutHeat'], ('person',), d + 1, refund)
                            return    # banned: the stream ends for the sim
                        else:
                            pl.record_act('palmedHit', 1.5, d, witnesses=viewers,
                                          refund=price + (v if cfg['palmRefundIncludesCard'] else 0))

    # --- plug
    def plug_end_day(self, t):
        cfg, pl, mkt = self.cfg, self.pl, self.mkt
        eligible = follower_tier(pl.followers) >= 1 or rep_tier(pl.rep) >= 1
        if eligible and t >= cfg['plugMinDay'] and (not self.plug_open) and \
                (self.plug_gone is None or t >= self.plug_gone + cfg['plugReturnDays']):
            if self.rng.random() < cfg['plugUnlockChance']:
                self.plug_open = True; self.plug_clean = 0
        vanished = False
        for o in self.plug_orders:
            if o['state'] != 'waiting' or o['arrives'] > t:
                continue
            if vanished or self.rng.random() < o['vanish']:
                vanished = True
                for x in self.plug_orders:
                    if x['state'] == 'waiting':
                        x['state'] = 'vanished'; self.m['plug_vanish'] += 1
                break
            ordered = o['cases'] * o['size']
            shipped = ordered
            if self.rng.random() < cfg['plugShortChance']:
                shipped = max(1, int(ordered * self.rng.uniform(*cfg['plugShortShare'])))
                self.m['plug_return'] += o['unit'] * (ordered - shipped)       # refund
            o['state'] = 'delivered'
            self.plug_clean += 1
            M = market_price(o['p'], t, mkt)
            ratio = PRODUCTS[o['p']][4] / PRODUCTS[o['p']][3]
            fake_rate = cfg['fakeRatePlug'] * cfg['fakeRateSealedFactor'] * (cfg['fakeHypeFactor'] if ratio > 2 else 1)
            n_cases = shipped // o['size']; loose = shipped % o['size']
            good_units = 0
            for _ in range(n_cases):
                if self.rng.random() < fake_rate:
                    self.m['plug_fake_cases'] += 1
                    self.fake_sale(o, M * o['size'], t)
                else:
                    good_units += o['size']
            for _ in range(loose):
                if self.rng.random() < fake_rate:
                    self.fake_sale(o, M, t)
                else:
                    good_units += 1
            seized_frac = 0.0
            if self.rng.random() < cfg['plugSeizeChance']:
                delay = self.rng.randint(*cfg['plugSeizeDays'])
                seized_frac = max(0.0, 1 - delay / 14)          # sells evenly over 14 days
                self.m['plug_seized'] += 1
                if o['act'] is not None:
                    o['act']['reveal'] = t + delay + 2
                pl.record_act('plugSeized', 1.0, t)
            self.m['plug_return'] += good_units * (1 - seized_frac) * ebay_net(M)
        if vanished:
            self.plug_open = False; self.plug_gone = t

    def fake_sale(self, o, value, t):
        """A fake case sold on eBay without knowing. The buyer finds out at the tier rate."""
        cfg, pl = self.cfg, self.pl
        tier = self.rng.random()
        find = 0.90 if tier < 0.5 else (0.60 if tier < 0.85 else 0.25)
        net = ebay_net(value)
        if self.rng.random() < find:
            self.m['fake_found'] += 1
            pl.add_rep(-40)
            if self.rng.random() < 0.3 + 0.1 * pl.notoriety():
                pl.start_callout('productIntegrity', True, True, 60, ('person',), t, 0.0)
            # refunded: no money from the sale
        else:
            self.m['plug_return'] += net

    def order_plug(self, d):
        cfg, mkt, pl = self.cfg, self.mkt, self.pl
        r = random.Random(self.seed * 92821 + (d // 7) * 4441)
        pool = [p for p in POOLS['wholesale'] if is_hot(p, d, mkt, cfg)]
        if not pool:
            return
        n = 1 if mkt['P'][d] < 0.3 else cfg['plugOffersPerWeek']
        offers = list({r.choice(pool) for _ in range(n)})
        best = max(offers, key=lambda p: market_price(p, d, mkt) / max(0.01, PRODUCTS[p][3]))
        size = cfg['caseSizes'][PRODUCTS[best][1]]
        M = market_price(best, d, mkt)
        msrp = PRODUCTS[best][3] * mkt['STEP'][d]
        unit = max(msrp * cfg['plugMsrpShare'], M * cfg['plugMarketFloor'])
        case = unit * size
        cases = max(1, int(self.pol.get('plug_budget', 2500) // case))
        total = case * cases
        if total > cfg['plugMaxOrder']:
            return
        vs = cfg['plugVanishStep'] * max(0.0, (total - cfg['plugVanishFree']) / 1000)
        vanish = max(cfg['plugVanishFloor'], min(cfg['plugVanishMax'], cfg['plugVanishBase'] + vs) - cfg['plugTrustStep'] * self.plug_clean)
        act = pl.record_act('plugPurchase', max(0.3, min(2.0, total / 2000)), d)
        self.plug_orders.append(dict(p=best, cases=cases, size=size, unit=unit, total=total, day=d,
                                     arrives=d + self.rng.randint(*cfg['plugDeliveryDays']), vanish=vanish,
                                     state='waiting', act=act))
        self.m['plug_orders'] += 1; self.m['plug_spent'] += total
        self.last_plug_order = d


# ----------------------------------------------------------------------------------------------------------------
# Strategies
# ----------------------------------------------------------------------------------------------------------------

STRATS = [
    dict(id=1, key='honest', name='Honest collector', reply=dict(true='makeRight', false='deny')),
    dict(id=2, key='honest_camp', name='Honest collector + 1 camp a month', reply=dict(true='makeRight', false='deny')),
    dict(id=3, key='flipper', name='Aggressive flipper', reply=dict(true='silent', false='deny'), restockBot=True),
    dict(id=4, key='shop', name='Shop owner', reply=dict(true='makeRight', false='deny'),
         shop=dict(shelf=0.5, rs=0.5)),
    dict(id=5, key='shop_rs70', name='Shop owner, 70% of hot stock to Rip & Ship',
         reply=dict(true='makeRight', false='deny'), shop=dict(shelf=0.3, rs=0.7)),
    dict(id=6, key='cheater', name='Cheater', reply=dict(true='silent', false='deny'),
         shop=dict(shelf=0.0, rs=0.3, plug=True, palm=True, gouge=True, plug_budget=2500)),
    dict(id=7, key='farmer', name='Honest farmer (counter + deny, player callouts, kid gifts)',
         reply=dict(true='makeRight', false='counterDeny'), farm=True, kidGift=True),
]


def run_one(args):
    seed, cfg, days, keys = args
    mkt = market_year(seed, cfg, days)
    out = dict(market=dict(P=mkt['P'][:days + 1], n_hype=mkt['n_hype'], n_reprint=mkt['n_reprint'],
                           n_dump=mkt['n_dump'], msrp_step=mkt['msrp_step_day'],
                           strict=[sum(1 for d in range(days) if mkt['levels'][c][d] >= 1) for c in CHAINS],
                           strict3=[sum(1 for d in range(days) if mkt['levels'][c][d] >= 3) for c in CHAINS]))
    offs = list(range(-7, 241))
    paths = []
    for rp in mkt['reprints']:
        capped, raw = reprint_path(rp, mkt['dumps'], cfg, offs)
        paths.append(dict(dumped=rp['dumped'], capped=capped[::7], raw_min=min(raw), cap_bound=min(raw) < 1 - cfg['flipperDumpCap']))
    out['paths'] = paths
    # share of the big-store pool that is hot on each day (sample every 7 days)
    pool = POOLS['batch_all']
    out['hot_share'] = sum(sum(1 for p in pool if is_hot(p, d, mkt, cfg)) / len(pool) for d in range(0, days, 30)) / len(range(0, days, 30))
    for strat in STRATS:
        if strat['key'] not in keys:
            continue
        pl = Player(seed, strat, mkt, cfg, days)
        pl.held = []
        shop = Shop(pl, cfg, mkt, seed, strat['shop']) if 'shop' in strat else None
        flipper = strat['key'] == 'flipper'
        if flipper:
            pl.club_member = True
            pl.m['fixed_costs'] += 400 + 150 + cfg['clubFee'] + cfg['alertFeeAll'] * 12
        camp_due = -1
        for d in range(days):
            pl.new_daily(d)
            pl.reply_step(d)
            pl.player_callouts(d)
            pl.kid_gift(d)
            # online: everyone enters the free drawing; drops
            pl.walmart_drawing(d)
            pl.chain_drawings(d, seed)
            if strat['key'] in ('honest', 'honest_camp', 'farmer'):
                pl.pc_drop(d, bot=False)
                pl.target_drop(d, bot=False)
                if d % 7 == 5:
                    hour = pl.rng.uniform(10, 18)
                    for k, c in enumerate(pl.rng.sample(BIG, 3)):
                        pl.store_visit(c, d, hour + k * 0.667, seed, 1)
                if strat['key'] == 'honest_camp' and d >= camp_due and d in mkt['restock']:
                    pl.camp(mkt['restock'][d][0], d, 1)
                    camp_due = d + 28
            elif flipper:
                pl.pc_drop(d, bot=True)
                pl.target_drop(d, bot=True)
                stops = sorted([c for c in CHAINS if mkt['slots'][c][0] == d % 7], key=lambda c: mkt['slots'][c][1])
                camp_today = mkt['restock'].get(d, [])
                if camp_today and len(stops) <= 1:
                    pl.camp(camp_today[0], d, 99)
                else:
                    arr = -1.0
                    for c in stops:
                        arr = max(mkt['slots'][c][1], arr + 0.667)
                        pl.store_visit(c, d, arr, seed, 99)
                    for c in stops:
                        if c in ('walmart', 'barnes'):
                            arr += 1.0
                            pl.store_visit(c, d, arr, seed, 99)
            if shop is not None:
                shop.day(d)
            # ---------- End Day into t ----------
            t = d + 1
            pl.heat_end_day(t)
            pl.drop_cancels(t)
            pl.stories_step(t)
            if shop is not None:
                shop.end_day(t)
            pl.expose_step(t)
            pl.rival_weekly(t)
            pl.advance_callouts(t)
            pl.rivals_end_day(t)
            pl.m['heat_sum'] += pl.heat
            pl.m['heat_max'] = max(pl.m['heat_max'], max(pl.store_heat.values()))
            op = pl.open_player()
            if op:
                pl.m['open_days'] += 1
                if max(c['heat'] for c in op) >= 60:
                    pl.m['sponsor_block_days'] += 1
        # money of the flipper: sell every unit on eBay near the buy day
        for p, price, dd in pl.held:
            if dd < 0:
                continue
            sd = min(days, dd + 7)
            M = market_price(p, sd, mkt)
            pl.m['profit'] += ebay_net(M) - price
            # flipper sale factor on hot in-print sealed (Part A 2.1, effect 3)
            pmin, pmax = cfg['pressureMin'], cfg['pressureMax']
            f = 1 - cfg['flipperSaleCut'] * max(0, mkt['P'][sd] - pmin) / (pmax - pmin)
            pl.m['sale_factor_sum'] += f; pl.m['sale_factor_n'] += 1
        res = dict(pl.m)
        res['end_rep'] = pl.rep; res['end_followers'] = pl.followers
        if shop is not None:
            res['shop'] = shop.m
        out[strat['key']] = res
    return out


# ----------------------------------------------------------------------------------------------------------------
# Stand-alone checks: Rip & Ship fees, palm EV, plug EV per $1,000
# ----------------------------------------------------------------------------------------------------------------

def fee_table(cfg):
    rows = []
    for price, packs, what in ((5, 1, '1 pack'), (50, 9, 'ETB, 9 packs'), (200, 36, 'booster box, 36 packs'),
                               (100, 36, 'Part B example: $100 box')):
        fees, ship, com, proc = rs_fees(price, packs, cfg)
        e_fee = price * cfg['ebayFeeRate'] + cfg['ebayFeeFlat']
        e_ship = 1.50 if price < 20 else 6.50
        rows.append(dict(price=price, what=what, ship=ship, commission=com, processing=proc,
                         flat=cfg['ripShipProcessingFlat'], supplies=cfg['ripShipSupplies'], fees=round(fees, 2),
                         net=round(price - fees, 2), pct=round(fees / price * 100, 1),
                         ebay_net=round(price - e_fee - e_ship, 2), tcg_net=round(price * (1 - cfg['tcgFeeRate']) - 0.30 - e_ship, 2)))
    return rows


def rs_share_ev(cfg):
    """Expected price share of market for one Buy Now offer, by the share the player asks (hot band)."""
    lo, hi = cfg['ripShipHotBand']
    out = []
    for s in (0.90, 0.95, 1.00, 1.05, 1.10, 1.15, 1.20):
        accept = 1.0 if s <= lo else max(0.0, (hi - s) / (hi - lo))
        out.append((s, round(accept, 2), round(s * accept, 3)))
    return out


def palm_ev(cfg, n=200000, seed=7):
    """Money EV of one palm, with the order price of the product the hit came from."""
    rng = random.Random(seed)
    res = {}
    for label, price in (('pack $5', 5.0), ('ETB $60', 60.0), ('box $200', 200.0)):
        gain = 0.0; refund = 0.0; caught = 0; public = 0
        for _ in range(n):
            v = rng.choice(HIT_VALUES)
            gain += v
            if rng.random() < cfg['palmFoundChance']:
                caught += 1
                refund += price + (v if cfg['palmRefundIncludesCard'] else 0)
                public += 1
            else:
                # palmedHit act: weight 1.5, witnesses 50, notoriety 3, decay 0.04
                w = 1.5; out = False
                for day in range(90):
                    wit = min(3.0, 1 + math.log10(1 + cfg['viewers']) / 2)
                    p = min(0.5, 0.040 * w * wit * 1.3)
                    if rng.random() < p:
                        out = True
                        break
                    w *= 0.96
                    if w < 0.05:
                        break
                if out:
                    public += 1
                    refund += price + (v if cfg['palmRefundIncludesCard'] else 0)
        res[label] = dict(gain=round(gain / n, 2), refund_if_made_right=round(refund / n, 2),
                          caught=round(caught / n, 3), public=round(public / n, 3),
                          net_money=round((gain - refund) / n, 2))
    return res


def plug_ev(cfg, n=200000, seed=11):
    """EV per $1,000 of plug order value for sample hot products, against the legit routes.

    Order: the cases fit in $2,500 (about 2 to 3 ETB cases). Sale: eBay at market. Fake case: worth 0 when the buyer
    finds out (refund); the buyer finds out at 0.90/0.60/0.25 by tier (tier mix 50/35/15 assumed).
    Seizure: the units still in hand when the police come (sold evenly over 14 days).
    """
    rng = random.Random(seed)
    rows = []
    for label, msrp, M, size in (('ETB, market 3.1x MSRP', 54.99, 172.0, 10), ('Booster box, 1.5x', 161.64, 242.0, 6),
                                 ('Bundle, 2.6x', 26.94, 70.0, 25)):
        unit = max(msrp * cfg['plugMsrpShare'], M * cfg['plugMarketFloor'])
        case = unit * size
        cases = max(1, int(2500 // case))
        total = case * cases
        ratio = M / msrp
        fake = cfg['fakeRatePlug'] * cfg['fakeRateSealedFactor'] * (cfg['fakeHypeFactor'] if ratio > 2 else 1)
        for clean in (0, 3):
            vs = cfg['plugVanishStep'] * max(0.0, (total - cfg['plugVanishFree']) / 1000)
            vanish = max(cfg['plugVanishFloor'], min(cfg['plugVanishMax'], cfg['plugVanishBase'] + vs) - cfg['plugTrustStep'] * clean)
            ret = 0.0
            for _ in range(n):
                if rng.random() < vanish:
                    continue
                units = cases * size
                shipped = units
                if rng.random() < cfg['plugShortChance']:
                    shipped = max(1, int(units * rng.uniform(*cfg['plugShortShare'])))
                    ret += unit * (units - shipped)
                good = 0
                for _c in range(shipped // size):
                    if rng.random() < fake:
                        tier = rng.random()
                        find = 0.90 if tier < 0.5 else (0.60 if tier < 0.85 else 0.25)
                        if rng.random() >= find:
                            ret += ebay_net(M * size)
                    else:
                        good += size
                good += shipped % size
                held = 1.0
                if rng.random() < cfg['plugSeizeChance']:
                    held = 1 - max(0.0, 1 - rng.randint(*cfg['plugSeizeDays']) / 14)
                ret += good * held * ebay_net(M)
            ev = ret / n - total
            hobby = max(msrp * cfg['storeWholesaleDiscount'], M * cfg['storeWholesaleMarketFloor'])
            secondary = max(msrp * cfg['wholesaleDiscount'], M * cfg['wholesaleMarketFloor'])
            rows.append(dict(product=label, clean=clean, unit=round(unit, 2), order=round(total, 2), vanish=round(vanish, 3),
                             fake_per_case=round(fake, 3), ev_per_1000=round(ev / total * 1000, 1),
                             no_risk_per_1000=round((ebay_net(M) / unit - 1) * 1000, 1),
                             hobby_per_1000=round((ebay_net(M) / hobby - 1) * 1000, 1),
                             secondary_per_1000=round((ebay_net(M) / secondary - 1) * 1000, 1),
                             msrp_per_1000=round((ebay_net(M) / msrp - 1) * 1000, 1)))
    return rows


# ----------------------------------------------------------------------------------------------------------------
# Aggregation
# ----------------------------------------------------------------------------------------------------------------

def pct(xs, q):
    if not xs:
        return float('nan')
    s = sorted(xs)
    i = q * (len(s) - 1)
    lo = int(math.floor(i)); hi = min(len(s) - 1, lo + 1)
    return s[lo] + (s[hi] - s[lo]) * (i - lo)


def summ(xs):
    xs = [x for x in xs if x is not None and not (isinstance(x, float) and math.isnan(x))]
    if not xs:
        return dict(mean=float('nan'), p10=float('nan'), p90=float('nan'), n=0)
    return dict(mean=sum(xs) / len(xs), p10=pct(xs, 0.1), p90=pct(xs, 0.9), n=len(xs))


def aggregate(results, cfg, days):
    A = {}
    # pressure
    bands = dict(few=[], busy=[], swarm=[], at_max=[], at_min=[], mean=[])
    for r in results:
        P = r['market']['P'][1:]
        n = len(P)
        bands['few'].append(sum(1 for p in P if p < 0.35) / n)
        bands['busy'].append(sum(1 for p in P if 0.35 <= p <= 0.65) / n)
        bands['swarm'].append(sum(1 for p in P if p > 0.65) / n)
        bands['at_max'].append(sum(1 for p in P if p >= cfg['pressureMax'] - 1e-9) / n)
        bands['at_min'].append(sum(1 for p in P if p <= cfg['pressureMin'] + 1e-9) / n)
        bands['mean'].append(sum(P) / n)
    A['pressure'] = {k: summ(v) for k, v in bands.items()}
    fn, ft = [], []
    for r in results:
        for p in r['market']['P'][1::3]:
            base = cfg['fillBase'] + cfg['fillPressureWeight'] * (1 - p)
            fn.append(min(cfg['fillMax'], base + cfg['fillRepWeight'] * cfg['repStartPoints'] / 100))
            ft.append(min(cfg['fillMax'], base + cfg['fillRepWeight'] * 1.0))
    A['fill_formula_new'] = summ(fn)
    A['fill_formula_tenured'] = summ(ft)
    A['market_counts'] = {k: summ([r['market'][k] for r in results]) for k in ('n_hype', 'n_reprint', 'n_dump')}
    A['msrp_step_share'] = sum(1 for r in results if r['market']['msrp_step'] is not None and r['market']['msrp_step'] <= days) / len(results)
    A['strict_days'] = {c: summ([r['market']['strict'][i] for r in results]) for i, c in enumerate(CHAINS)}
    A['strict3_days'] = {c: summ([r['market']['strict3'][i] for r in results]) for i, c in enumerate(CHAINS)}
    A['hot_share'] = summ([r['hot_share'] for r in results])
    # reprint paths
    dumped = [p for r in results for p in r['paths'] if p['dumped']]
    plain = [p for r in results for p in r['paths'] if not p['dumped']]
    A['paths'] = dict(n_dumped=len(dumped), n_plain=len(plain),
                      cap_bound=sum(1 for p in dumped if p['cap_bound']) / max(1, len(dumped)),
                      raw_min_dumped=summ([p['raw_min'] for p in dumped]),
                      raw_min_plain=summ([p['raw_min'] for p in plain]))
    offs = list(range(-7, 241))[::7]
    A['path_offsets'] = offs
    A['path_dumped'] = [summ([p['capped'][i] for p in dumped]) for i in range(len(offs))]
    A['path_plain'] = [summ([p['capped'][i] for p in plain]) for i in range(len(offs))]
    weeks = days / 7
    for s in STRATS:
        k = s['key']
        rs = [r[k] for r in results if k in r]
        if not rs:
            continue
        S = {}
        for f in ('units', 'units_shelf', 'units_camp', 'units_draw', 'units_pc', 'units_target', 'units_club',
                  'units_cancelled'):
            S[f + '_wk'] = summ([x[f] / weeks for x in rs])
        S['profit'] = summ([x['profit'] - x['fixed_costs'] for x in rs])
        S['heat_mean'] = summ([x['heat_sum'] / days for x in rs])
        S['heat_max_chain'] = summ([x['heat_max'] for x in rs])
        S['bans'] = summ([x['bans'] for x in rs])
        S['ban_any'] = sum(1 for x in rs if x['bans'] > 0) / len(rs)
        S['first_ban'] = summ([x['first_ban'] for x in rs if x['first_ban'] is not None])
        S['callouts_true'] = summ([x['callouts_true'] for x in rs])
        S['callouts_false'] = summ([x['callouts_false'] for x in rs])
        tot = [x['callouts_true'] + x['callouts_false'] for x in rs]
        S['callouts_total'] = summ(tot)
        S['cheap_share'] = summ([x['callouts_cheap'] / t for x, t in zip(rs, tot) if t > 0])
        S['rep_lost'] = summ([x['rep_lost'] for x in rs])
        S['rep_lost_p99'] = pct([x['rep_lost'] for x in rs], 0.99)
        S['rep_net'] = summ([x['rep_gained'] - x['rep_lost'] for x in rs])
        S['fol_lost'] = summ([x['fol_lost'] for x in rs])
        S['fol_lost_p99'] = pct([x['fol_lost'] for x in rs], 0.99)
        S['fol_net'] = summ([x['fol_gained'] - x['fol_lost'] for x in rs])
        S['make_right_cash'] = summ([x['make_right_cash'] for x in rs])
        S['records'] = summ([x['records'] for x in rs])
        S['whatnot_ban_days'] = summ([x['whatnot_ban_days'] for x in rs])
        S['player_callouts'] = summ([x['player_callouts'] for x in rs])
        S['receipts'] = summ([x['receipts'] for x in rs])
        S['counters'] = summ([x['counters'] for x in rs])
        S['kid_gifts'] = summ([x['kid_gifts'] for x in rs])
        S['kid_rep'] = summ([x['kid_rep'] for x in rs])
        S['kid_fol'] = summ([x['kid_fol'] for x in rs])
        S['open_days'] = summ([x['open_days'] for x in rs])
        S['sponsor_block_days'] = summ([x['sponsor_block_days'] for x in rs])
        S['max_open_3'] = sum(1 for x in rs if x['max_open'] >= 3) / len(rs)
        S['sale_factor'] = summ([x['sale_factor_sum'] / x['sale_factor_n'] for x in rs if x['sale_factor_n']])
        acts = {}
        for x in rs:
            for a, n in x['acts'].items():
                acts.setdefault(a, []).append(n)
        S['acts'] = {a: sum(v) / len(rs) for a, v in acts.items()}
        if 'shop' in rs[0]:
            sh = [x['shop'] for x in rs]
            S['fill_new'] = summ([f for x in sh for f in x['fill_new']])
            S['fill_tenured'] = summ([f for x in sh for f in x['fill_tenured']])
            S['fill_realized'] = summ([x['hot_filled'] / x['hot_requested'] for x in sh if x['hot_requested']])
            S['hot_cases_week'] = summ([sum(x['hot_cases_week']) / max(1, len(x['hot_cases_week'])) for x in sh])
            S['hot_units_week'] = summ([sum(x['hot_units_week']) / max(1, len(x['hot_units_week'])) for x in sh])
            S['bd_acts'] = summ([x['bd_acts'] for x in sh])
            S['bd_warnings'] = summ([x['bd_warnings'] for x in sh])
            S['bd_first_warning'] = summ([x['bd_first_warning'] for x in sh if x['bd_first_warning'] is not None])
            S['bd_warn_share'] = sum(1 for x in sh if x['bd_warnings'] > 0) / len(sh)
            S['bd_close_share'] = sum(1 for x in sh if x['bd_closed'] > 0) / len(sh)
            S['bd_first_close'] = summ([x['bd_first_close'] for x in sh if x['bd_first_close'] is not None])
            S['bd_freeze_share'] = sum(1 for x in sh if x['bd_freezes'] > 0) / len(sh)
            S['rs_sales'] = summ([x['rs_sales'] for x in sh])
            S['rs_streams'] = summ([x['streams'] for x in sh])
            S['rs_margin_per_sale'] = summ([(x['rs_net'] - x['rs_cost']) / x['rs_sales'] for x in sh if x['rs_sales']])
            S['rs_vs_ebay_per_sale'] = summ([(x['rs_net'] - x['rs_ebay_alt']) / x['rs_sales'] for x in sh if x['rs_sales']])
            S['rs_vs_shelf_per_sale'] = summ([(x['rs_net'] - x['rs_shelf_alt']) / x['rs_sales'] for x in sh if x['rs_sales']])
            S['rs_margin_per_pack'] = summ([(x['rs_net'] - x['rs_cost']) / x['rs_packs'] for x in sh if x['rs_packs']])
            S['rs_vs_ebay_per_pack'] = summ([(x['rs_net'] - x['rs_ebay_alt']) / x['rs_packs'] for x in sh if x['rs_packs']])
            S['rs_net_per_stream'] = summ([(x['rs_net'] - x['rs_cost']) / x['streams'] for x in sh if x['streams']])
            S['palms'] = summ([x['palms'] for x in sh])
            S['palm_value'] = summ([x['palm_value'] for x in sh])
            S['palm_caught'] = summ([x['palm_caught'] for x in sh])
            S['plug_orders'] = summ([x['plug_orders'] for x in sh])
            S['plug_spent'] = summ([x['plug_spent'] for x in sh])
            S['plug_profit'] = summ([x['plug_return'] - x['plug_spent'] for x in sh])
            S['plug_roi'] = summ([(x['plug_return'] - x['plug_spent']) / x['plug_spent'] for x in sh if x['plug_spent']])
            S['plug_vanish'] = summ([x['plug_vanish'] for x in sh])
            S['plug_seized'] = summ([x['plug_seized'] for x in sh])
            S['plug_fake_cases'] = summ([x['plug_fake_cases'] for x in sh])
            S['fake_found'] = summ([x['fake_found'] for x in sh])
            S['plug_rep_hits'] = summ([x['plug_rep_hits'] for x in sh])
            S['gouges'] = summ([x['gouges'] for x in sh])
            S['elite_cases'] = summ([x['elite_cases'] for x in sh])
            S['wholesale_spent'] = summ([x['wholesale_spent'] for x in sh])
            S['hot_value'] = summ([x['hot_value'] for x in sh])
            S['wholesale_margin'] = summ([x['hot_value'] - x['wholesale_spent'] for x in sh])
        A[k] = S
    return A


def main():
    args = sys.argv[1:]
    runs, days, config, repo, out = 2000, 365, 'base', '/Users/ajholloway/personal/PokeVendor', None
    keys = [s['key'] for s in STRATS]
    sets = {}
    i = 0
    while i < len(args):
        a = args[i]
        if a == '--runs':
            runs = int(args[i + 1]); i += 1
        elif a == '--days':
            days = int(args[i + 1]); i += 1
        elif a == '--config':
            config = args[i + 1]; i += 1
        elif a == '--repo':
            repo = args[i + 1]; i += 1
        elif a == '--json':
            out = args[i + 1]; i += 1
        elif a == '--only':
            keys = args[i + 1].split(','); i += 1
        elif a == '--set':                       # --set name=value (JSON value); applies after --config
            k, v = args[i + 1].split('=', 1); sets[k] = json.loads(v); i += 1
        i += 1
    cfg = dict(BASE)
    if config == 'tuned':
        cfg.update(TUNED_OVERRIDES)
    elif config == 'elite':
        cfg['startRep'] = 700
    cfg.update(sets)
    load_data(repo)
    with Pool(min(12, os.cpu_count() or 4), initializer=load_data, initargs=(repo,)) as pool:
        results = pool.map(run_one, [(s, cfg, days, keys) for s in range(1, runs + 1)], chunksize=8)
    A = aggregate(results, cfg, days)
    A['fees'] = fee_table(cfg)
    A['rs_share'] = rs_share_ev(cfg)
    A['palm'] = palm_ev(cfg)
    A['plug_ev'] = plug_ev(cfg)
    A['hit_values'] = dict(n=len(HIT_VALUES), p10=pct(HIT_VALUES, .1), p50=pct(HIT_VALUES, .5), p90=pct(HIT_VALUES, .9),
                           mean=sum(HIT_VALUES) / len(HIT_VALUES))
    A['pools'] = {k: len(v) for k, v in POOLS.items()}
    A['config'] = config; A['runs'] = runs; A['days'] = days
    txt = json.dumps(A, indent=1, default=lambda o: round(o, 4) if isinstance(o, float) else str(o))
    if out:
        open(out, 'w').write(txt)
    print(txt)


if __name__ == '__main__':
    main()
