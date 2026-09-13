"""Compute the final odds of every slot map, with the era fallback for missing odds.

Usage:
  python3 tools/slotmap/odds.py <set>     print the final odds of one set
  python3 tools/slotmap/odds.py           check every set and print a summary
  python3 tools/slotmap/odds.py --write   also write the '## Fallback odds' table in each era file

The rule (see docs/18-ripping.md#missing-odds):
1. Keep every odds value that the set gives. The remainder is 100% minus those values.
2. The outcomes with no set value (the '—' rows and the 'Rest' row) share the remainder.
3. If each of them has an era median, they share it in proportion to the medians.
   Otherwise they share it in proportion to their matching card counts.
An era median uses every other set of the era: its set odds, and its Rest rows where
every other outcome of that slot has a set value (Rest = 100% minus the others).
"""
import collections, glob, os, re, statistics, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import validate as V  # noqa: E402

ROOT = os.path.join(HERE, "..", "..")
DOCS = os.path.join(ROOT, "docs", "sets")


def era_map():
    idx = open(os.path.join(ROOT, "docs", "13-sets.md")).read()
    out = {}
    for m in re.finditer(r"^- \*\*(.+?)\*\* —\s*\n?\s*\[eras/([^\]]+)\.md\].*?(?=^- \*\*|\Z)", idx, re.S | re.M):
        for slug in re.findall(r"\(sets/([a-z0-9-]+)\.md\)", m.group(0)):
            out.setdefault(slug, m.group(2))
    return out


def load():
    sets = {}
    for f in sorted(glob.glob(os.path.join(DOCS, "*.md"))):
        t = open(f).read()
        sm = V.section(t, "Slot map")
        if sm is None:
            continue
        slug = os.path.basename(f)[:-3]
        by_slot = collections.OrderedDict()
        for r in V.rows(sm, 8):
            by_slot.setdefault(r[0], []).append(r)
        runs_par = re.search(r"^\*\*Print runs:\*\*(.*?)(?:\n\s*\n|\Z)", sm, re.S | re.M)
        runs = [q.strip() for q in re.findall(r"\(([^()]*)\)", re.sub(r"\s+", " ", runs_par.group(1)))] if runs_par else [""]
        sets[slug] = {"slots": by_slot, "cards": V.parse_cards_list(t), "runs": runs}
    return sets


def set_value(r):
    return None if r[7] in ("Rest", "—") else V.pct(r[7])


def era_pool(sets, eras):
    pool = collections.defaultdict(lambda: collections.defaultdict(list))
    for slug, s in sets.items():
        era = eras.get(slug, "?")
        for slot, rows in s["slots"].items():
            cardrows = [r for r in rows if r[4] != "—"]
            known = [set_value(r) for r in cardrows if set_value(r) is not None]
            for r in cardrows:
                v = set_value(r)
                if v is not None and v < 100:
                    pool[era][r[3]].append((v, slug))
            rest = [r for r in cardrows if r[7] == "Rest"]
            if len(rest) == 1 and not any(r[7] == "—" for r in cardrows) and known:
                d = 100 - sum(known)
                if 0 < d < 100:
                    pool[era][rest[0][3]].append((d, slug))
    return pool


def card_count(s, r):
    names = [x.strip() for x in r[4].split(",")]
    options = [o.strip() for o in r[5].split(" or ")]
    missing = r[5].endswith("[missing]")
    n = 0
    for c in s["cards"]:
        if c["rarity"] not in names or not V.in_filter(c, r[6]):
            continue
        if missing or any(V.variant_matches(v, o, s["runs"]) for o in options for v in c["variants"]):
            n += 1
    return n


def final_odds(slug, s, pool, eras):
    """Return {slot: [(row, percent, source)]}."""
    era = eras.get(slug, "?")
    out = collections.OrderedDict()
    for slot, rows in s["slots"].items():
        cardrows = [r for r in rows if r[4] != "—"]
        if not any(r[7] == "—" for r in cardrows):
            known = sum(set_value(r) or 0 for r in cardrows)
            out[slot] = [(r, set_value(r) if set_value(r) is not None else (100 - known if r[7] == "Rest" else 100.0), "set") for r in rows]
            continue
        known = sum(set_value(r) for r in cardrows if set_value(r) is not None)
        remainder = max(0.0, 100 - known)
        shared = [r for r in cardrows if set_value(r) is None]
        medians = {}
        for r in shared:
            others = [(v, sl) for v, sl in pool[era].get(r[3], []) if sl != slug]
            medians[r[3]] = (statistics.median([v for v, _ in others]), len({sl for _, sl in others})) if others else None
        if all(medians[r[3]] for r in shared):
            weights = {id(r): medians[r[3]][0] for r in shared}
            source = "era ratio"
        else:
            weights = {id(r): card_count(s, r) for r in shared}
            source = "card share"
        total = sum(weights.values()) or 1
        res = []
        for r in rows:
            if r[4] == "—":
                res.append((r, 100.0, "set"))
            elif set_value(r) is not None:
                res.append((r, set_value(r), "set"))
            else:
                res.append((r, remainder * weights[id(r)] / total, source))
        out[slot] = res
    return out


def fallback_table(era, pool):
    lines = ["## Fallback odds", "",
             "Generated by `python3 tools/slotmap/odds.py --write`. Do not edit by hand.",
             "When a set in this era has no odds for an outcome, the game uses these",
             "era medians as weights (see [../../18-ripping.md](../../18-ripping.md#missing-odds)).",
             "Each value is the median odds in the slot, from the sets of this era that give it.", "",
             "| Rarity list entry | Median odds in slot | Sets |", "|---|---|---|"]
    for entry, vals in sorted(pool[era].items(), key=lambda kv: (-len({s for _, s in kv[1]}), kv[0])):
        lines.append(f"| {entry} | {statistics.median([v for v, _ in vals]):.2f}% | {len({s for _, s in vals})} |")
    return "\n".join(lines) + "\n"


def write_era_file(era, table):
    path = os.path.join(DOCS, "eras", f"{era}.md")
    t = open(path).read()
    m = re.search(r"^## Fallback odds\n.*?(?=^## |\Z)", t, re.S | re.M)
    if m:
        t = t[:m.start()] + table + "\n" + t[m.end():]
    else:
        anchor = re.search(r"^## Sources\n", t, re.M)
        i = anchor.start() if anchor else len(t)
        t = t[:i] + table + "\n" + t[i:]
    open(path, "w").write(t)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--write"]
    sets, eras = load(), era_map()
    pool = era_pool(sets, eras)
    if args:
        for slug in args:
            print(f"== {slug} (era: {eras.get(slug)})")
            for slot, res in final_odds(slug, sets[slug], pool, eras).items():
                total = sum(p for r, p, _ in res if r[4] != "—")
                print(f"  [{slot}] total {total:.2f}%")
                for r, p, src in res:
                    print(f"    {r[2]}: {p:.2f}% ({src}{'' if src == 'set' else ', set gives ' + r[7]})")
        sys.exit(0)
    bad, used = 0, collections.Counter()
    for slug, s in sets.items():
        for slot, res in final_odds(slug, s, pool, eras).items():
            cardres = [(r, p, src) for r, p, src in res if r[4] != "—"]
            if not cardres:
                continue
            total = sum(p for _, p, _ in cardres)
            if abs(total - 100) > 0.5 or any(p < 0 for _, p, _ in cardres):
                bad += 1
                print(f"CHECK {slug} [{slot}]: total {total:.2f}%")
            for r, p, src in cardres:
                if r[7] == "—":
                    used[src] += 1
    print(f"{len(sets)} sets; outcomes with no set odds filled by: {dict(used)}; slots not at 100%: {bad}")
    if "--write" in sys.argv:
        for era in sorted(set(eras.values())):
            write_era_file(era, fallback_table(era, pool))
        print("wrote Fallback odds tables to", len(set(eras.values())), "era files")
    sys.exit(1 if bad else 0)
