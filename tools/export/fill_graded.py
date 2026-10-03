#!/usr/bin/env python3
"""Fill an estimated graded price for every card and every grade, and an estimated raw price where none exists.

Run it after tools/export/rip_set.py and tools/export/catalog.py. It reads and writes the set files in
app/PokeVendor/Resources/Sets and the file app/PokeVendor/Resources/catalog.json. Run it once after each export.
It stops when a file already has estimates, because the rising rule changes some real prices for good.

    fill_graded.py --gap      count the missing values (run it before a fill)
    fill_graded.py            fit the ratios and write the filled files
    fill_graded.py --check    verify the files (no null, no missing raw price, every ladder rises)
    fill_graded.py --report   print the fitted ratios as Markdown tables (writes nothing)

How it works (docs/10-grading.md, Estimated prices):
- A print has a raw price and up to 15 real graded prices. The graded keys that the app can ask for are
  PSA 1 to 10, and CGC and BGS 1 to 10 in steps of 0.5. That is 48 keys.
- Each print is in a group: era (vintage, classic, current), rarity bucket, and raw price tier.
- For each pair of keys, the script fits the median of log(price of one key / price of the other key) over the real
  prints of the group. The raw price counts as a key. A group with fewer than MIN_N prints uses a wider group.
- A missing key gets one estimate from each real key of the same print. The estimate is the real price times the
  fitted ratio. The script averages the estimates in log space. The weight of an estimate is 1 / its variance.
- A print with no real graded price (a cold print) has only the raw price as an anchor. Cards with sales are the cards
  that people want, so the median ratio is too high for a cold print. It gets the lower quartile ratio instead.
  This holds for its PSA keys only. Its CGC and BGS keys come from its PSA keys, with the median ratio.
- A key below the lowest real key of a company has no real data. The PSA ladder falls by a fitted step for each
  grade below PSA 6. CGC and BGS follow the PSA ladder, times the CGC 8 / PSA 8 or BGS 8 / PSA 8 ratio of the print.
- A missing raw price comes from the real graded prices of the print, or else from the median raw price of the
  same rarity bucket in the same set.
- At the end, every company ladder rises with the grade. The script makes it so with a weighted isotonic fit in log
  space. A real price that the fit moves by more than 0.5 percent is no longer real.

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

MIN_N = 30
MOVED = 0.005
REAL_WEIGHT = 20.0
VARIANCE_FLOOR = 0.01
STEP_RANGE = (0.6, 0.9)

# The 15 keys with real sales data (tools/export/rip_set.py, GRADES).
REAL_KEYS = ["psa6", "psa7", "psa8", "psa9", "psa10",
             "cgc8", "cgc8_5", "cgc9", "cgc9_5", "cgc10",
             "bgs8", "bgs8_5", "bgs9", "bgs9_5", "bgs10"]


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
        s[2] += len(REAL_KEYS) - sum(k in have for k in REAL_KEYS)
        s[3] += not have
        s[4] += not it.p.get("market") or bool(it.p.get("marketEstimated"))
    total = [sum(v[i] for v in per_set.values()) for i in range(5)]
    print("| Set | Prints | Missing of 48 keys | Missing of 15 data keys | Prints with no graded price | No raw price |")
    print("| --- | ---: | ---: | ---: | ---: | ---: |")
    for slug, v in per_set.items():
        print(f"| {slug} | {v[0]} | {v[1]} | {v[2]} | {v[3]} | {v[4]} |")
    print(f"| TOTAL | {total[0]} | {total[1]} | {total[2]} | {total[3]} | {total[4]} |")


# ---------------------------------------------------------------- fitting

def level_keys(it, tier):
    """The groups of a print, from the narrowest to the widest. `tier` is None to leave the raw price tier out."""
    if tier is None:
        return [("e", it.era, it.rb), ("r", it.rb), ("g",)]
    return [("e", it.era, it.rb, tier), ("r", it.rb, tier), ("t", tier), ("g",)]


class Fit:
    def __init__(self, items):
        self.logs = collections.defaultdict(list)
        self.cache = {}
        self.raws = collections.defaultdict(list)
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
            vals = {"raw": raw, **{k: v for k, v in real.items() if k in REAL_KEYS}}
            tier = tier_of(raw)
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
            if len(xs) >= MIN_N:
                med = statistics.median(xs)
                mad = statistics.median(abs(x - med) for x in xs) * 1.4826
                self.cache[ck] = (med, mad * mad, len(xs), lv, statistics.quantiles(xs, n=4)[0])
                return self.cache[ck]
        return None

    def predict(self, it, vals, k, tier, cold=False):
        """The log of the estimated price of key k, from the known prices `vals`. None when there is no anchor.

        A cold print has no real graded price. Cards with sales are the cards that people want, so the median ratio
        of the real prints is too high for a cold print. It gets the lower quartile ratio instead."""
        levels = level_keys(it, tier)
        num = den = 0.0
        for a, va in vals.items():
            if a == k:
                continue
            s = self.stat(levels, a, k)
            if not s:
                continue
            w = 1.0 / (s[1] + VARIANCE_FLOOR)
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
        p["graded"] = {k: real.get(k) for k in REAL_KEYS}
        p.pop("gradedReal", None)
        if p.get("marketEstimated"):
            p["market"] = None
        p.pop("marketEstimated", None)


def fill(items, fit):
    stats = collections.Counter()
    for it in items:
        p = it.p
        real = {k: v for k, v in p["graded"].items() if v}
        if not p.get("market"):
            guess = None
            if real:
                guess = fit.predict(it, dict(real), "raw", None)
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
        anchors = {"raw": raw, **real}
        price = {k: float(v) for k, v in real.items()}
        for k in REAL_KEYS:
            if k not in price and (real or k.startswith("psa")):
                price[k] = math.exp(fit.predict(it, anchors, k, tier, cold=not real))
        for k in REAL_KEYS:
            if k not in price:
                price[k] = math.exp(fit.predict(it, {a: v for a, v in price.items() if a.startswith("psa")}, k, tier))
        # Below the lowest real key: no data, so the step of the PSA ladder and the ratio of the print.
        step = fit.stat(level_keys(it, tier), "psa7", "psa6")
        s = min(max(math.exp(step[0]), STEP_RANGE[0]), STEP_RANGE[1]) if step else 0.8
        psa = {g: price[key_of("psa", g)] for g in (6, 7, 8, 9, 10)}
        for g in (5, 4, 3, 2, 1):
            psa[g] = psa[g + 1] * s
        for g, k in LADDERS["psa"]:
            price.setdefault(k, psa[int(g)])
        for company in ("cgc", "bgs"):
            factor = price[key_of(company, 8)] / psa[8]
            for g, k in LADDERS[company]:
                if k not in price:
                    low, high = psa[int(math.floor(g))], psa[int(math.ceil(g))]
                    price[k] = math.sqrt(low * high) * factor
        # Every ladder rises. A real price that moves is no longer real.
        moved = set()
        for company in ("psa", "cgc", "bgs"):
            keys = [k for _, k in LADDERS[company]]
            logs = [math.log(price[k]) for k in keys]
            weights = [REAL_WEIGHT if k in real else 1.0 for k in keys]
            fitted = isotonic(logs, weights)
            for k, v in zip(keys, fitted):
                if k in real and abs(math.exp(v) / real[k] - 1) > MOVED:
                    moved.add(k)
                price[k] = max(round(math.exp(v), 2), 0.01)
        # Rounding can lift two keys to a tie, never reverse them. A tie is fine.
        p["graded"] = {k: price[k] for k in ALL_KEYS}
        p["gradedReal"] = [k for k in REAL_KEYS if k in real and k not in moved]
        stats["real prices moved by the rising rule"] += len(moved)
        stats["real prices kept"] += len(p["gradedReal"])
        stats["estimated prices"] += len(ALL_KEYS) - len(p["gradedReal"])
    return stats


# ---------------------------------------------------------------- check and report

def check(items):
    bad = collections.Counter()
    for it in items:
        p = it.p
        if not p.get("market"):
            bad["print with no raw price"] += 1
        graded = p.get("graded") or {}
        for k in ALL_KEYS:
            if not graded.get(k):
                bad["null graded price"] += 1
        for company in ("psa", "cgc", "bgs"):
            vals = [graded.get(k) or 0 for _, k in LADDERS[company]]
            if any(a > b for a, b in zip(vals, vals[1:])):
                bad["ladder that does not rise"] += 1
        real = p.get("gradedReal")
        if real is None:
            bad["print with no gradedReal"] += 1
        elif any(k not in graded for k in real):
            bad["gradedReal key with no price"] += 1
    print(f"{len(items)} prints checked")
    if bad:
        for k, v in bad.items():
            print(f"FAIL {k}: {v}")
        return 1
    print("OK: no null graded price, no missing raw price, every ladder rises")
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
