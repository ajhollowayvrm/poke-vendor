"""Print a set file for slot map work: every section except the long card list, plus a card list summary.

Usage: python3 tools/slotmap/show.py <slug>
The summary gives, for each card list table: the cards per TCGdex rarity with their number range,
and the number of cards for each exact rarity + variant pair.
"""
import collections, os, re, sys

DOCS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs", "sets")
SPLIT_VARIANTS = re.compile(r",\s*(?![^()]*\))")


def summary(card_list):
    part, parts = "main", collections.OrderedDict()
    for line in card_list.splitlines():
        if line.startswith("### "):
            part = line[4:].strip()
        if not line.startswith("|"):
            continue
        c = [x.strip() for x in re.split(r"(?<!\\)\|", line.strip())[1:-1]]
        if len(c) != 5 or c[0] in ("No.",) or set(c[0]) <= set("-"):
            continue
        num, name, cat, rar, var = c
        p = parts.setdefault(part, {"n": 0, "combo": collections.Counter(), "nums": collections.defaultdict(list), "cats": collections.Counter()})
        p["n"] += 1
        p["cats"][(rar, cat.split(" (")[0])] += 1
        p["nums"][rar].append(num.split(" ")[-1].split("/")[0])
        for v in [x.strip() for x in SPLIT_VARIANTS.split(var) if x.strip()]:
            p["combo"][(rar, v)] += 1
    out = ["## Card list summary (generated)"]
    for part, p in parts.items():
        out.append(f"### Table: {part} ({p['n']} cards)")
        for rar, nums in p["nums"].items():
            cats = ", ".join(f"{cat} {n}" for (r, cat), n in p["cats"].items() if r == rar)
            out.append(f"- rarity {rar!r}: {len(nums)} cards, numbers {nums[0]} … {nums[-1]} ({cats})")
        for (rar, v), n in sorted(p["combo"].items(), key=lambda x: (x[0][0], -x[1])):
            out.append(f"    {rar!r} + {v!r}: {n}")
    return "\n".join(out)


if __name__ == "__main__":
    slug = sys.argv[1]
    t = open(os.path.join(DOCS, f"{slug}.md")).read()
    m = re.search(r"^## Card list\n(.*?)(?=^## |\Z)", t, re.S | re.M)
    if not m:
        print(t)
        sys.exit(0)
    intro = m.group(1).split("\n| No. |")[0].strip()
    print(t[:m.start()] + "## Card list\n\n(Table left out. See the summary at the end.)\n\n" + intro.split("\n### ")[0] + "\n\n" + t[m.end():])
    print(summary(m.group(1)))
