"""Validate the '## Slot map' section of set files against their card list and rarity list.

Usage: python3 tools/slotmap/validate.py [slug ...]   (no slugs: every set file with a slot map)
Exit code 1 if any set has an error.
A Variant cell can list options, "A or B": each card uses the first option that it has.
"""
import glob, os, re, sys, collections

DOCS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs", "sets")
SPLIT_VARIANTS = re.compile(r",\s*(?![^()]*\))")


def section(t, name):
    m = re.search(rf"^## {re.escape(name)}\n(.*?)(?=^## |\Z)", t, re.S | re.M)
    return m.group(1) if m else None


def rows(text, ncols):
    out = []
    for line in text.splitlines():
        if not line.startswith("|"):
            continue
        c = [x.strip().replace("\\|", "|") for x in re.split(r"(?<!\\)\|", line.strip())[1:-1]]
        if len(c) == ncols and not set(c[0]) <= set("-") and c[0] not in ("No.", "Slot", "#"):
            out.append(c)
    return out


def num_key(s):
    m = re.match(r"^([A-Za-z]*)(\d+)", s.split(" ")[-1].split("/")[0])
    return (m.group(1).upper(), int(m.group(2))) if m else (s, -1)


def parse_cards_list(t):
    cl = section(t, "Card list") or ""
    part, cards = "main", []
    for line in cl.splitlines():
        if line.startswith("### "):
            part = line[4:].strip()
        for c in rows(line, 5):
            num, name, cat, rar, var = c
            cards.append({"num": num, "key": num_key(num), "name": name, "cat": cat, "rarity": rar, "part": part,
                          "variants": [v.strip() for v in SPLIT_VARIANTS.split(var) if v.strip() and v.strip() != "—"]})
    return cards


def in_filter(card, filt):
    if filt in ("All", ""):
        return True
    ok = True
    for clause in [x.strip() for x in filt.split(";") if x.strip()]:
        if clause.startswith("Part: "):
            ok &= card["part"] == clause[6:].strip()
            continue
        neg = clause.startswith("Not nos. ")
        body = clause[9:] if neg else clause[5:] if clause.startswith("Nos. ") else None
        if body is None:
            if clause.startswith("Category: "):
                ok &= card["cat"].startswith(clause[10:].strip())
                continue
            raise ValueError(f"bad Cards filter clause: {clause!r}")
        hit = False
        for rng in [r.strip() for r in body.split(",")]:
            a, _, b = rng.partition("–")
            ka, kb = num_key(a), num_key(b or a)
            if ka[0] == card["key"][0] and ka[1] <= card["key"][1] <= kb[1]:
                hit = True
        ok &= (not hit) if neg else hit
    return ok


def variant_matches(card_variant, wanted, runs):
    if card_variant == wanted:
        return True
    for q in runs:
        m = re.match(r"^(.*?) \((.*)\)$", wanted)
        base, inner = (m.group(1), m.group(2)) if m else (wanted, "")
        combined = f"{base} ({', '.join(x for x in [q, inner] if x)})" if (q or inner) else base
        alt = f"{base} ({', '.join(x for x in [inner, q] if x)})" if (q or inner) else base
        if card_variant in (combined, alt):
            return True
    return False


def pct(s):
    m = re.match(r"^~?([\d.]+)%", s)
    if m:
        return float(m.group(1))
    m = re.match(r"^1 in ([\d.]+)", s)
    return 100.0 / float(m.group(1)) if m else None


def validate(slug):
    t = open(os.path.join(DOCS, f"{slug}.md")).read()
    sm = section(t, "Slot map")
    if sm is None:
        return None, ["no Slot map section"], []
    errors, notes = [], []
    cards = parse_cards_list(t)
    rarities = {c["rarity"] for c in cards}
    rl = section(t, "Rarity list") or ""
    entries = {r[1] for r in rows(rl, 5)}
    runs_par = re.search(r"^\*\*Print runs:\*\*(.*?)(?:\n\s*\n|\Z)", sm, re.S | re.M)
    runs = [""]
    if runs_par:
        text = re.sub(r"\s+", " ", runs_par.group(1))
        runs = [q.strip().strip("\"“”") for q in re.findall(r"\(([^()]*)\)", text)]
    smrows = rows(sm, 8)
    if not smrows:
        errors.append("slot map table has no rows")
    used = set()
    slots = collections.OrderedDict()
    per_slot = collections.defaultdict(dict)
    for slot, count, outcome, entry, trar, variant, filt, odds in smrows:
        slots.setdefault(slot, []).append(odds)
        if trar == "—":
            continue
        if entry != "—" and entry not in entries:
            errors.append(f"{slot} / {outcome}: rarity list entry {entry!r} not in the rarity list")
        names = [x.strip() for x in trar.split(",")]
        for n in names:
            if n not in rarities:
                errors.append(f"{slot} / {outcome}: TCGdex rarity {n!r} not in the card list")
        missing = variant.endswith("[missing]")
        if missing:
            notes.append(f"{slot} / {outcome}: variant {variant!r} is not in the card list; rows match by rarity and Cards only")
        try:
            if missing:
                matched = [(c, "[missing]") for c in cards if c["rarity"] in names and in_filter(c, filt)]
            else:
                options = [o.strip() for o in variant.split(" or ")]
                matched = []
                for c in cards:
                    if c["rarity"] not in names or not in_filter(c, filt):
                        continue
                    for option in options:
                        hits = [v for v in c["variants"] if variant_matches(v, option, runs)]
                        if hits:
                            matched += [(c, v) for v in hits]
                            break
        except ValueError as e:
            errors.append(f"{slot} / {outcome}: {e}")
            continue
        if not matched:
            errors.append(f"{slot} / {outcome}: no card matches {names} + {variant!r} + {filt!r}")
        for c, v in matched:
            used.add((c["num"], c["part"], v))
        keys = {(c["num"], c["part"], v) for c, v in matched}
        for other, okeys in per_slot[slot].items():
            both = keys & okeys
            if both:
                sample = ", ".join(f"{n} {v}" for n, _, v in sorted(both)[:3])
                errors.append(f"slot {slot!r}: outcomes {other!r} and {outcome!r} match the same {len(both)} card(s), e.g. {sample}")
        per_slot[slot][outcome] = keys
    for slot, odds_list in slots.items():
        vals = [pct(o) for o in odds_list if o not in ("Rest", "—")]
        rest = odds_list.count("Rest")
        unknown = odds_list.count("—")
        bad = [o for o in odds_list if o not in ("Rest", "—") and pct(o) is None]
        if bad:
            errors.append(f"slot {slot!r}: odds not readable: {bad}")
        total = sum(v for v in vals if v is not None)
        if rest > 1:
            errors.append(f"slot {slot!r}: more than one Rest row")
        if total > 100.5:
            errors.append(f"slot {slot!r}: odds add up to {total:.2f}%")
        if rest == 0 and unknown == 0 and abs(total - 100) > 0.5:
            errors.append(f"slot {slot!r}: odds add up to {total:.2f}%, with no Rest row")
        if unknown:
            notes.append(f"slot {slot!r}: {unknown} outcome(s) with no odds")
    unused = collections.Counter()
    unused_rarity = collections.Counter()
    for c in cards:
        for v in c["variants"]:
            if (c["num"], c["part"], v) not in used:
                unused[v] += 1
        if not any((c["num"], c["part"], v) in used for v in c["variants"] + ["[missing]"]):
            unused_rarity[c["rarity"]] += 1
    return {"cards": len(cards), "unused_variants": unused, "cards_in_no_slot": unused_rarity}, errors, notes


if __name__ == "__main__":
    slugs = sys.argv[1:] or sorted(os.path.basename(f)[:-3] for f in glob.glob(f"{DOCS}/*.md") if "\n## Slot map\n" in open(f).read())
    failed = 0
    for slug in slugs:
        info, errors, notes = validate(slug)
        status = "ERROR" if errors else "ok"
        failed += bool(errors)
        print(f"== {slug}: {status}")
        for e in errors:
            print(f"   ERROR {e}")
        for n in notes:
            print(f"   note  {n}")
        if info:
            if info["cards_in_no_slot"]:
                print(f"   cards in no slot, by rarity: {dict(info['cards_in_no_slot'])}")
            top = info["unused_variants"].most_common(6)
            print(f"   variants in no slot (top): {top}")
    print(f"{len(slugs)} checked, {failed} with errors")
    sys.exit(1 if failed else 0)
