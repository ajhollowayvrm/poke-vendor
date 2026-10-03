#!/usr/bin/env python3
"""Fill an estimated graded price for every card and every grade, and an estimated raw price where none exists.

Run it after tools/export/rip_set.py and tools/export/catalog.py. It reads and writes the set files in
app/PokeVendor/Resources/Sets and the file app/PokeVendor/Resources/catalog.json. Run it once after each export.
It stops when a file already has estimates, because the files no longer hold the sale counts.

    fill_graded.py --gap      count the missing values (run it before a fill)
    fill_graded.py            fit the ratios and write the filled files
    fill_graded.py --check    verify the files (no null, no missing raw price, estimates rise and fit the real prices)
    fill_graded.py --report   print the fitted ratios as Markdown tables (writes nothing)

How it works (docs/10-grading.md, Estimated prices):
- The graded keys that the app can ask for are PSA 1 to 10, and CGC and BGS 1 to 10 in steps of 0.5. That is 48
  keys. A print has a raw price and a real price for each key with eBay sales (tools/export/rip_set.py), with the
  sale count of each key in `gradedSales`. The script removes `gradedSales` when it writes the files.
- A real price always wins. The file keeps every real price as its sold value, and the math fills only the other
  keys. A real price from 1 sale is noisy, so the fit of the ratios uses only real prices with MIN_SALES sales or
  more. A real price with fewer sales still anchors its own print, with a smaller weight.
- Each print is in a group: set, era (vintage, classic, current), rarity bucket, and raw price tier. The narrowest
  group is the set, rarity bucket, and tier. It needs MIN_N_SET prints. The wider groups need MIN_N prints.
- From the raw price, the script fits a line in log space for each key and group: log(price) = a + b * log(raw).
  A slab has a floor price, so a graded price does not grow as fast as the raw price: the fitted slope b is near
  0.5. A small group pulls b toward LINE_SLOPE.
- For each pair of graded keys, the script fits the median of log(price of one key / price of the other key) over
  the real prints of the group. A group with fewer than MIN_N prints uses a wider group.
- A missing key gets one estimate from each real key of the same print. The estimate is the real price times the
  fitted ratio. The script averages the estimates in log space. The weight of an estimate is 1 / its variance, and
  the variance includes SALE_NOISE / the sale count of the real price.
- A print with no real graded price (a cold print) has only the raw price as an anchor. Cards with sales are the cards
  that people want, so the line is too high for a cold print. It gets the lower quartile of the residuals instead.
  The same lower quartile line gives its CGC and BGS keys.
- A key with too few real prints for a fit gets its price from its ladder. A PSA grade is the next PSA grade up
  times a fitted step. A CGC or BGS grade follows the PSA ladder, times the company / PSA ratio of the print at the
  nearest grade that has both prices.
- A missing raw price comes from the real graded prices of the print, or else from the median raw price of the
  same rarity bucket in the same set.
- At the end, the estimates of each company ladder rise with the grade (an isotonic fit in log space). Then each
  estimate is clamped: at least the slab floor of its company (SLAB_FLOOR) and each real price below it, at most each
  real price above it. When these disagree, the real price above wins, so an estimate can be below the floor.
- Two real prices can fall (a real PSA 9 above a real PSA 10). The file keeps both, and the estimates between them
  take the lower one.
- CGC and BGS grades use the raw price and the real prices of the print as anchors. An estimated PSA price comes from
  the same raw price, so it is not a second anchor.

The files get two optional fields: `gradedReal` (the keys that hold a real price, as a list) and `marketEstimated`.
A file with no `gradedReal` is an old file, and the app treats every price in it as real.
"""
import argparse
import collections
import glob
import json
import math
import os
import re
import statistics

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RES = os.path.join(ROOT, "app", "PokeVendor", "Resources")
SETS = os.path.join(RES, "Sets")
CATALOG = os.path.join(RES, "catalog.json")
INVENTORY = os.path.join(ROOT, "app", "PokeVendor", "Model", "Inventory.swift")

MIN_N = 30
MIN_N_SET = 10
MIN_SALES = 2
SALE_NOISE = 0.15
RAW_SALES = 20
VARIANCE_FLOOR = 0.01
LINE_SLOPE = 0.5
# The lowest price of a slab: the 1st percentile of the real prices with 2 or more sales. Estimates only.
SLAB_FLOOR = {"psa": 6.2, "bgs": 6.6, "cgc": 3.25}
LINE_PRIOR = 30
LINE_RANGE = (0.2, 1.0)
STEP_RANGE = (0.6, 0.95)


def key_of(company, grade):
    """The key of the app: SlabGrade.priceKey."""
    number = str(int(grade)) if grade == int(grade) else str(grade).replace(".", "_")
    return company + number


def ladder(company):
    step = 1.0 if company == "psa" else 0.5
    count = 10 if company == "psa" else 19
    return [1.0 + step * i for i in range(count)]


LADDERS = {c: [(g, key_of(c, g)) for g in ladder(c)] for c in ("psa", "cgc", "bgs")}
ALL_KEYS = [k for c in ("psa", "cgc", "bgs") for _, k in LADDERS[c]]
# Every key can hold real sales data (tools/export/rip_set.py, GRADES).
REAL_KEYS = ALL_KEYS

VINTAGE = {"wizards-of-the-coast", "e-card"}
CLASSIC = {"ex", "diamond-pearl-platinum", "heartgold-soulsilver", "black-white", "xy"}


def era_group(slug_era):
    if slug_era in VINTAGE:
        return "vintage"
    if slug_era in CLASSIC:
        return "classic"
    return "current"


def rarity_bucket(rarity):
    r = (rarity or "").lower()
    if r in ("common", "uncommon", "none", ""):
        return "bulk"
    if r in ("rare",):
        return "rare"
    if any(w in r for w in ("secret", "hyper", "illustration", "black white")):
        return "chase"
    if any(w in r for w in ("ultra", "double", "holo rare v", "ace spec", "radiant", "amazing", "shiny", "full art")):
        return "ultra"
    if "holo" in r or any(w in r for w in ("lv.x", "prime", "classic", "legend")):
        return "holo"
    return "rare"


TIER_EDGES = (1, 5, 25, 100)


def tier_of(raw):
    return sum(raw >= e for e in TIER_EDGES)


TIER_NAMES = ["under $1", "$1 to $5", "$5 to $25", "$25 to $100", "$100 and up"]


# ---------------------------------------------------------------- loading and saving

class Item:
    """One print: a dict with `market`, `graded`, and `rarity`."""

    def __init__(self, print_, era, set_id):
        self.p = print_
        self.era = era
        self.set_id = set_id
        self.rb = rarity_bucket(print_.get("rarity"))
        self.sales = print_.get("gradedSales")

    def count(self, key):
        """The eBay sale count of a real price. A file from an older export has no counts: count MIN_SALES."""
        if key == "raw":
            return RAW_SALES
        if self.sales is None:
            return MIN_SALES
        return self.sales.get(key) or 1


def load():
    """Return ({path: data}, [Item])."""
    files, items = {}, []
    for path in sorted(glob.glob(os.path.join(SETS, "*.json"))):
        data = json.load(open(path))
        files[path] = data
        era = era_group(data.get("era"))
        for p in data["prints"]:
            items.append(Item(p, era, data["slug"]))
    catalog = json.load(open(CATALOG))
    files[CATALOG] = catalog
    for product in catalog:
        for p in product.get("promos", []):
            items.append(Item(p, "current", "promos"))
    return files, items


def compact(text):
    """Put the `graded` map and the `gradedReal` list on one line each. Without it the files grow by a factor of four."""
    def one(m):
        return m.group(1) + json.dumps(json.loads(m.group(2)), separators=(",", ":"))
    return re.sub(r'("graded(?:Real)?": )(\{[^{}]*\}|\[[^\[\]]*\])', one, text, flags=re.S)


def save(files):
    for path, data in files.items():
        for p in data["prints"] if isinstance(data, dict) else [q for product in data for q in product.get("promos", [])]:
            p.pop("gradedSales", None)
        text = compact(json.dumps(data, ensure_ascii=False, indent=1))
        with open(path, "w") as f:
            f.write(text)


# ---------------------------------------------------------------- the gap

def real_values(p):
    """The real graded prices of a print, as {key: price}."""
    graded = p.get("graded") or {}
    real = p.get("gradedReal")
    return {k: v for k, v in graded.items() if v and (real is None or k in real)}


def gap(items):
    per_set = collections.OrderedDict()
    for it in items:
        s = per_set.setdefault(it.set_id, [0, 0, 0, 0, 0])
        s[0] += 1
        have = real_values(it.p)
        s[1] += len(ALL_KEYS) - len(have)
        s[2] += len(have)
        s[3] += not have
        s[4] += not it.p.get("market") or bool(it.p.get("marketEstimated"))
    total = [sum(v[i] for v in per_set.values()) for i in range(5)]
    print("| Set | Prints | Missing of 48 keys | Real prices | Prints with no graded price | No raw price |")
    print("| --- | ---: | ---: | ---: | ---: | ---: |")
    for slug, v in per_set.items():
        print(f"| {slug} | {v[0]} | {v[1]} | {v[2]} | {v[3]} | {v[4]} |")
    print(f"| TOTAL | {total[0]} | {total[1]} | {total[2]} | {total[3]} | {total[4]} |")


# ---------------------------------------------------------------- fitting

def raw_levels(it):
    """The groups for the line from the raw price, from the narrowest to the widest. The line holds the raw price,
    so the groups do not use the price tier."""
    return [("s", it.set_id, it.rb), ("e", it.era, it.rb), ("r", it.rb), ("g",)]


def level_keys(it, tier):
    """The groups of a print, from the narrowest to the widest. `tier` is None to leave the raw price tier out."""
    if tier is None:
        return [("e", it.era, it.rb), ("r", it.rb), ("g",)]
    return [("s", it.set_id, it.rb, tier), ("e", it.era, it.rb, tier), ("r", it.rb, tier), ("t", tier), ("g",)]


class Fit:
    def __init__(self, items):
        self.logs = collections.defaultdict(list)
        self.cache = {}
        self.raws = collections.defaultdict(list)
        self.lines = collections.defaultdict(list)
        self.line_cache = {}
        for it in items:
            real = real_values(it.p)
            raw = it.p.get("market")
            if it.p.get("marketEstimated"):
                raw = None
            if raw:
                self.raws[(it.set_id, it.rb)].append(raw)
                self.raws[(it.era, it.rb)].append(raw)
            if not raw:
                continue
            vals = {"raw": raw, **{k: v for k, v in real.items() if k in REAL_KEYS and it.count(k) >= MIN_SALES}}
            tier = tier_of(raw)
            for k, vk in vals.items():
                if k != "raw":
                    for lv in raw_levels(it):
                        self.lines[(lv, k)].append((math.log(raw), math.log(vk)))
            for a, va in vals.items():
                for k, vk in vals.items():
                    if a == k:
                        continue
                    ratio = math.log(vk / va)
                    for lv in level_keys(it, tier) + level_keys(it, None):
                        self.logs[(lv, a, k)].append(ratio)

    def stat(self, levels, a, k):
        """The median log ratio and its variance, from the narrowest group with enough prints."""
        for lv in levels:
            ck = (lv, a, k)
            if ck in self.cache:
                return self.cache[ck]
            xs = self.logs.get(ck, [])
            if len(xs) >= (MIN_N_SET if lv[0] == "s" else MIN_N):
                med = statistics.median(xs)
                mad = statistics.median(abs(x - med) for x in xs) * 1.4826
                self.cache[ck] = (med, mad * mad, len(xs), lv, statistics.quantiles(xs, n=4)[0])
                return self.cache[ck]
        return None

    def line(self, it, k):
        """The fit of log(price of key k) = a + b * log(raw price), from the narrowest group with enough prints.
        Returns (a, b, residual variance, lower quartile of the residuals), or None."""
        for lv in raw_levels(it):
            ck = (lv, k)
            if ck in self.line_cache:
                return self.line_cache[ck]
            pts = self.lines.get(ck, [])
            if len(pts) >= (MIN_N_SET if lv[0] == "s" else MIN_N):
                xs, ys = [x for x, _ in pts], [y for _, y in pts]
                mx, my = statistics.fmean(xs), statistics.fmean(ys)
                sxx = sum((x - mx) ** 2 for x in xs)
                b = sum((x - mx) * (y - my) for x, y in pts) / sxx if sxx > 1e-9 else LINE_SLOPE
                # A small group gives a noisy slope. Pull it toward LINE_SLOPE, and keep it in LINE_RANGE.
                n = len(pts)
                b = (b * n + LINE_SLOPE * LINE_PRIOR) / (n + LINE_PRIOR)
                b = min(max(b, LINE_RANGE[0]), LINE_RANGE[1])
                a = my - b * mx
                res = [y - (a + b * x) for x, y in pts]
                med = statistics.median(res)
                mad = statistics.median(abs(r - med) for r in res) * 1.4826
                self.line_cache[ck] = (a + med, b, mad * mad, statistics.quantiles(res, n=4)[0] - med)
                return self.line_cache[ck]
        return None

    def predict(self, it, vals, k, tier, cold=False, counts=None):
        """The log of the estimated price of key k, from the known prices `vals`. None when there is no anchor.

        A cold print has no real graded price. Cards with sales are the cards that people want, so the median ratio
        of the real prints is too high for a cold print. It gets the lower quartile ratio instead."""
        levels = level_keys(it, tier)
        num = den = 0.0
        for a, va in vals.items():
            if a == k:
                continue
            if a == "raw" and k != "raw":
                line = self.line(it, k)
                if line:
                    w = 1.0 / (line[2] + VARIANCE_FLOOR)
                    num += w * (line[0] + line[1] * math.log(va) + (line[3] if cold else 0.0))
                    den += w
                    continue
            s = self.stat(levels, a, k)
            if not s:
                continue
            noise = 0.0 if a == "raw" else SALE_NOISE / max((counts or {}).get(a, 1), 1)
            w = 1.0 / (s[1] + VARIANCE_FLOOR + noise)
            num += w * (math.log(va) + (s[4] if cold else s[0]))
            den += w
        return num / den if den else None

    def raw_guess(self, it):
        by_set = self.raws.get((it.set_id, it.rb), [])
        if len(by_set) >= 3:
            return statistics.median(by_set)
        return statistics.median(self.raws.get((it.era, it.rb)) or sum(self.raws.values(), []))


def isotonic(values, weights):
    """The weighted least squares fit of a rising sequence (pool adjacent violators)."""
    blocks = []
    for v, w in zip(values, weights):
        blocks.append([v * w, w, 1])
        while len(blocks) > 1 and blocks[-2][0] / blocks[-2][1] > blocks[-1][0] / blocks[-1][1]:
            top = blocks.pop()
            blocks[-1][0] += top[0]
            blocks[-1][1] += top[1]
            blocks[-1][2] += top[2]
    out = []
    for s, w, n in blocks:
        out += [s / w] * n
    return out


def reset(items):
    """Remove the estimates of an earlier run."""
    for it in items:
        p = it.p
        real = real_values(p)
        p["graded"] = {k: v for k, v in real.items() if k in REAL_KEYS}
        p.pop("gradedReal", None)
        if p.get("marketEstimated"):
            p["market"] = None
        p.pop("marketEstimated", None)


def bounds(keys, i, real, company):
    """The lowest and highest estimate for keys[i] of a company ladder: at least the slab floor and each real price
    below it, at most each real price above it. When the two disagree, the real price above wins."""
    below = [real[k] for k in keys[:i] if k in real]
    above = [real[k] for k in keys[i + 1:] if k in real]
    hi = min(above, default=math.inf)
    return min(max([SLAB_FLOOR[company]] + below), hi), hi


def fill(items, fit):
    stats = collections.Counter()
    for it in items:
        p = it.p
        real = {k: float(v) for k, v in (p.get("graded") or {}).items() if v and k in REAL_KEYS}
        counts = {"raw": RAW_SALES, **{k: it.count(k) for k in real}}
        if not p.get("market"):
            guess = None
            if real:
                guess = fit.predict(it, dict(real), "raw", None, counts=counts)
            if guess is not None:
                p["market"] = round(math.exp(guess), 2)
                stats["raw from graded"] += 1
            else:
                p["market"] = round(fit.raw_guess(it), 2)
                stats["raw from rarity bucket"] += 1
            p["market"] = max(p["market"], 0.01)
            p["marketEstimated"] = True
        raw = p["market"]
        tier = tier_of(raw)
        cold = not real
        anchors = {"raw": raw, **real}
        levels = level_keys(it, tier)
        price = dict(real)
        # PSA first, from the raw price and the real prices of the print.
        for _, k in LADDERS["psa"]:
            if k not in price:
                v = fit.predict(it, anchors, k, tier, cold=cold, counts=counts)
                if v is not None:
                    price[k] = math.exp(v)
                    stats["fitted from anchors"] += 1
        # PSA grades with too little data for a fit: the next grade up times the fitted step.
        for g in range(9, 0, -1):
            k = key_of("psa", g)
            if k not in price and key_of("psa", g + 1) in price:
                step = fit.stat(levels, key_of("psa", g + 1), k) or fit.stat(levels, "psa7", "psa6")
                f = min(max(math.exp(step[0]), STEP_RANGE[0]), STEP_RANGE[1]) if step else 0.8
                price[k] = price[key_of("psa", g + 1)] * f
                stats["from the PSA ladder"] += 1
        # A top gap (no PSA 10 or PSA 9): the next grade down divided by the fitted step.
        for g in range(2, 11):
            k = key_of("psa", g)
            if k not in price and key_of("psa", g - 1) in price:
                step = fit.stat(levels, k, key_of("psa", g - 1)) or fit.stat(levels, "psa10", "psa9")
                f = min(max(math.exp(step[0]), STEP_RANGE[0]), STEP_RANGE[1]) if step else 0.8
                price[k] = price[key_of("psa", g - 1)] / f
                stats["from the PSA ladder"] += 1
        # No PSA price at all: use the raw price.
        for g in range(1, 11):
            if key_of("psa", g) not in price:
                price[key_of("psa", g)] = raw
                stats["from the PSA ladder"] += 1
        psa = {g: price[key_of("psa", g)] for g in range(1, 11)}
        # CGC and BGS, from the raw price and the real prices. An estimated PSA price is no extra anchor: it comes
        # from the same raw price.
        for company in ("cgc", "bgs"):
            for _, k in LADDERS[company]:
                if k not in price:
                    v = fit.predict(it, anchors, k, tier, cold=cold, counts=counts)
                    if v is not None:
                        price[k] = math.exp(v)
                        stats["fitted from anchors"] += 1
            # Grades with too little data: the PSA ladder times the company / PSA ratio at the nearest grade.
            for g, k in LADDERS[company]:
                if k in price:
                    continue
                near = [(abs(g2 - g), price[k2] / math.sqrt(psa[int(math.floor(g2))] * psa[int(math.ceil(g2))]))
                        for g2, k2 in LADDERS[company] if k2 in price]
                factor = min(near)[1] if near else 1.0
                price[k] = math.sqrt(psa[int(math.floor(g))] * psa[int(math.ceil(g))]) * factor
                stats["from the PSA ladder"] += 1
        # Real prices win. The file keeps every real price as its sold value, and the math fills only the other keys.
        # An estimate rises with the grade and is at least the slab floor. It is at least each real price below it and
        # at most each real price above it. A real price above it holds over the floor. Two real prices that fall stay.
        for company in ("psa", "cgc", "bgs"):
            keys = [k for _, k in LADDERS[company]]
            est = [k for k in keys if k not in real]
            fitted = dict(zip(est, isotonic([math.log(price[k]) for k in est], [1.0] * len(est))))
            for i, k in enumerate(keys):
                if k in real:
                    price[k] = round(real[k], 2)
                    continue
                lo, hi = bounds(keys, i, real, company)
                price[k] = round(min(max(math.exp(fitted[k]), lo), hi), 2)
            values = [real[k] for k in keys if k in real]
            stats["real prices that fall below a lower grade"] += sum(a > b for a, b in zip(values, values[1:]))
        p["graded"] = {k: price[k] for k in ALL_KEYS}
        p["gradedReal"] = [k for k in ALL_KEYS if k in real]
        p.pop("gradedSales", None)
        stats["real prices in the data"] += len(real)
        stats["real prices kept"] += len(p["gradedReal"])
        stats["estimated prices"] += len(ALL_KEYS) - len(p["gradedReal"])
    return stats


# ---------------------------------------------------------------- check and report

def swift_floors():
    """The slab floors in the Swift copy (Inventory.swift), as {company: floor}, or None."""
    text = open(INVENTORY).read()
    m = re.search(r"slabFloors:\s*\[GradingCompany:\s*Double\]\s*=\s*\[([^\]]*)\]", text)
    if not m:
        return None
    return {c: float(v) for c, v in re.findall(r"\.(\w+):\s*([0-9.]+)", m.group(1))}


def check(items):
    bad = collections.Counter()
    if swift_floors() != SLAB_FLOOR:
        bad["Swift slabFloors that differs from SLAB_FLOOR"] += 1
    for it in items:
        p = it.p
        if not p.get("market"):
            bad["print with no raw price"] += 1
        graded = p.get("graded") or {}
        for k in ALL_KEYS:
            if not graded.get(k):
                bad["null graded price"] += 1
        real = p.get("gradedReal")
        if real is not None:
            real_prices = {k: graded[k] for k in real if graded.get(k)}
            for company in ("psa", "cgc", "bgs"):
                keys = [k for _, k in LADDERS[company]]
                est = [graded.get(k) or 0 for k in keys if k not in real]
                if any(a > b for a, b in zip(est, est[1:])):
                    bad["estimates that do not rise"] += 1
                for i, k in enumerate(keys):
                    if k in real or not graded.get(k):
                        continue
                    lo, hi = bounds(keys, i, real_prices, company)
                    if graded[k] < round(lo, 2) - 0.005 or graded[k] > round(hi, 2) + 0.005:
                        bad["estimate outside the floor and its real prices"] += 1
        if real is None:
            bad["print with no gradedReal"] += 1
        elif any(k not in graded for k in real):
            bad["gradedReal key with no price"] += 1
    print(f"{len(items)} prints checked")
    if bad:
        for k, v in bad.items():
            print(f"FAIL {k}: {v}")
        return 1
    print("OK: no null graded price, no missing raw price, every estimate rises, at the floor or above, and between its real prices")
    return 0


def report(items, fit):
    def med(xs):
        return statistics.median(xs) if xs else None

    print("Median price / raw price, by raw price tier (real prints only)\n")
    print("| Key | " + " | ".join(TIER_NAMES) + " |")
    print("| --- |" + " ---: |" * 5)
    for k in REAL_KEYS:
        cells = []
        for t in range(5):
            xs = fit.logs.get((("t", t), "raw", k), [])
            cells.append(f"{math.exp(med(xs)):.2f} (n={len(xs)})" if len(xs) >= 10 else "-")
        if any(c != "-" for c in cells):
            print(f"| {k} | " + " | ".join(cells) + " |")
    print("\nMedian price / PSA price of the same card and grade, by era\n")
    print("| Pair | all | vintage | classic | current |")
    print("| --- | ---: | ---: | ---: | ---: |")
    for k, a in (("cgc10", "psa10"), ("cgc9", "psa9"), ("cgc8", "psa8"), ("bgs10", "psa10"), ("bgs9", "psa9"), ("bgs8", "psa8"),
                 ("psa10", "psa9"), ("psa9", "psa8"), ("psa8", "psa7"), ("psa7", "psa6"), ("bgs10", "bgs9_5"), ("bgs9_5", "bgs9"),
                 ("cgc10", "cgc9_5"), ("cgc9_5", "cgc9")):
        cells = []
        xs = fit.logs.get((("g",), a, k), [])
        cells.append(f"{math.exp(med(xs)):.2f} (n={len(xs)})" if xs else "-")
        for e in ("vintage", "classic", "current"):
            # The era level of the fit holds the tier. Pool the pairs of the era from the items instead.
            pool = []
            for it in items:
                if it.era != e:
                    continue
                real = real_values(it.p)
                if a in real and k in real and not it.p.get("marketEstimated"):
                    pool.append(math.log(real[k] / real[a]))
            cells.append(f"{math.exp(med(pool)):.2f} (n={len(pool)})" if len(pool) >= 10 else "-")
        print(f"| {k} / {a} | " + " | ".join(cells) + " |")
    print("\nMedian PSA 10 / raw, by era and rarity bucket (real prints only)\n")
    print("| Era | bulk | rare | holo | ultra | chase |")
    print("| --- | ---: | ---: | ---: | ---: | ---: |")
    for e in ("vintage", "classic", "current"):
        cells = []
        for rb in ("bulk", "rare", "holo", "ultra", "chase"):
            xs = []
            for it in items:
                real = real_values(it.p)
                if it.era == e and it.rb == rb and "psa10" in real and it.p.get("market") and not it.p.get("marketEstimated"):
                    xs.append(it.p["market"] and real["psa10"] / it.p["market"])
            cells.append(f"{med(xs):.1f} (n={len(xs)})" if len(xs) >= 10 else "-")
        print(f"| {e} | " + " | ".join(cells) + " |")
    print("\nThe PSA step below PSA 6 (PSA 6 / PSA 7, clamped to %s), by tier:" % (STEP_RANGE,))
    for t in range(5):
        s = fit.stat([("t", t), ("g",)], "psa7", "psa6")
        print(f"  {TIER_NAMES[t]}: {math.exp(s[0]):.2f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gap", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()
    files, items = load()
    if args.gap:
        gap(items)
        return 0
    if args.check:
        return check(items)
    if any("gradedReal" in it.p for it in items):
        print("The files already hold estimates. Run tools/export/rip_set.py and tools/export/catalog.py first.")
        return 1
    reset(items)
    fit = Fit(items)
    if args.report:
        report(items, fit)
        return 0
    stats = fill(items, fit)
    save(files)
    for k, v in stats.items():
        print(f"{k}: {v}")
    return check(items)


if __name__ == "__main__":
    raise SystemExit(main())
