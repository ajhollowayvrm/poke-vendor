"""Export the sealed product catalog for the iOS app.

Usage: python3 tools/export/catalog.py

Run tools/export/rip_set.py for each set first, and tools/ppt/sealed_contents.py --json.

Writes app/PokeVendor/Resources/catalog.json: every sealed product that the game sells, with
- the pack mix by set (only sets that the app has, see SETS);
- the promo cards, with the market price, the graded prices, and the image. An SVP promo gets its price from
  TCGCSV group 22872 (tools/cardlist/cache/tcgcsv/). A set card gets the price of its print in that set. A
  Surprise Box promo has a Prismatic Evolutions stamp, so it gets the stamped print from TCGCSV group 2374
  (Miscellaneous Cards & Products), with its own price and image, and no graded prices;
- the market price (tools/ppt/cache/sealed/), an estimated MSRP, and the image.

A product is in the catalog when its pack mix is exact, every pack comes from a set the app has, and it has a
price. "inPrint" is true when every pack is from a Scarlet & Violet set. Only in-print product sells at retail.
"""
import glob, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
APP_SETS = os.path.join(ROOT, "app", "PokeVendor", "Resources", "Sets")
OUT = os.path.join(ROOT, "app", "PokeVendor", "Resources", "catalog.json")
CONTENTS = os.path.join(ROOT, "tools", "ppt", "cache", "sealed_contents.json")
SEALED = os.path.join(ROOT, "tools", "ppt", "cache", "sealed")
TCGCSV = os.path.join(ROOT, "tools", "cardlist", "cache", "tcgcsv")
SVP_GROUP = "22872"
MISC_GROUP = "2374"
STAMP = "Prismatic Evolutions Stamp"
HOME = "prismatic-evolutions"

# Estimated MSRP. The first name match wins, so the longer names come first. Starting values for balancing.
MSRP_BY_NAME = [("Super-Premium Collection", 119.99), ("Premium Figure Collection", 59.99), ("Premium Collection", 39.99),
                ("Binder Collection", 29.99), ("[Set of 3]", 44.97), ("[Set of 4]", 17.96), ("Surprise Box", 24.99)]
MSRP_BY_KIND = {"Booster pack": 4.49, "Blister": 9.99, "Tin": 9.99, "Booster bundle": 26.94, "Elite Trainer Box": 54.99,
                "Collection": 24.99, "Booster box": 161.64}


def load_sets():
    sets = {}
    for f in glob.glob(os.path.join(APP_SETS, "*.json")):
        d = json.load(open(f))
        sets[d["slug"]] = d
    return sets


def sealed_prices():
    out = {}
    for f in glob.glob(os.path.join(SEALED, "*.json")):
        data = json.load(open(f))
        for p in (data.get("data", []) if isinstance(data, dict) else data):
            out[str(p.get("tcgPlayerId") or p.get("id"))] = p
    return out


def svp_promos():
    products = json.load(open(os.path.join(TCGCSV, f"{SVP_GROUP}-products.json")))
    prices = json.load(open(os.path.join(TCGCSV, f"{SVP_GROUP}-prices.json")))
    products = products.get("results", products) if isinstance(products, dict) else products
    prices = prices.get("results", prices) if isinstance(prices, dict) else prices
    price = {p["productId"]: p.get("marketPrice") for p in prices}
    out = {}
    for p in products:
        num = next((e["value"] for e in p.get("extendedData", []) if e.get("name") == "Number"), None)
        if not num:
            continue
        # The plain print wins over a stamped or exclusive print with the same number.
        plain = "(" not in p["name"]
        key = int(re.sub(r"\D", "", num) or 0)
        if key in out and not plain:
            continue
        out[key] = {"name": p["name"].split(" - ")[0], "market": price.get(p["productId"]),
                    "image": f"https://tcgplayer-cdn.tcgplayer.com/product/{p['productId']}_in_800x800.jpg"}
    return out


def stamped_promos():
    """The prints with a Prismatic Evolutions stamp, by name and number, for example ("Umbreon ex", 60)."""
    products = json.load(open(os.path.join(TCGCSV, f"{MISC_GROUP}-products.json")))
    prices = json.load(open(os.path.join(TCGCSV, f"{MISC_GROUP}-prices.json")))
    products = products.get("results", products) if isinstance(products, dict) else products
    prices = prices.get("results", prices) if isinstance(prices, dict) else prices
    price = {p["productId"]: p.get("marketPrice") for p in prices}
    out = {}
    for p in products:
        m = re.match(r"^(.*) - (\d+)/\d+ \(" + STAMP + r"\)$", p["name"])
        if m:
            out[(m.group(1), int(m.group(2)))] = {
                "market": price.get(p["productId"]),
                "image": f"https://tcgplayer-cdn.tcgplayer.com/product/{p['productId']}_in_800x800.jpg"}
    return out


def resolve_promo(text, sets, svp, stamped=None):
    m = re.match(r"^(.*) \((.+) (\d+)\)$", text)
    if not m:
        return None
    name, source, num = m.group(1), m.group(2), int(m.group(3))
    if source == "SVP Promo":
        p = svp.get(num)
        if not p or p["market"] is None:
            return None
        return {"name": name, "num": f"SVP {num:03d}", "setName": "SVP Black Star Promos", "rarity": "Promo",
                "variant": "Holo", "market": p["market"], "graded": {}, "image": p["image"]}
    for s in sets.values():
        if s["name"] != source:
            continue
        prints = [p for p in s["prints"] if int(p["num"].split("/")[0]) == num]
        prints.sort(key=lambda p: (p["variant"] not in ("Holo", "Normal"), p["variant"]))
        if prints:
            p = prints[0]
            if stamped is not None:
                s = stamped.get((name, num))
                if not s or s["market"] is None:
                    return None
                return {"name": name, "num": p["num"], "setName": source, "rarity": p["rarity"],
                        "variant": f"{p['variant']} · {STAMP}", "market": s["market"], "graded": {}, "image": s["image"]}
            return {"name": name, "num": p["num"], "setName": source, "rarity": p["rarity"], "variant": p["variant"],
                    "market": p["market"], "graded": p["graded"], "image": p["image"]}
    return None


def main():
    sets = load_sets()
    prices = sealed_prices()
    svp = svp_promos()
    stamped = stamped_promos()
    out, skipped = [], []
    for it in json.load(open(CONTENTS)):
        mix = it.get("mix") or {}
        packs = it.get("packs")
        if it.get("confidence") not in ("Exact", "Product set") or not packs or it.get("kind") == "Case or display":
            continue
        if not mix or sum(mix.values()) != packs or any(slug not in sets for slug in mix):
            continue
        # Every product of the app's sets is in the catalog.
        p = prices.get(str(it["id"]))
        if not p or not p.get("unopenedPrice") or "Dollar General" in it["name"]:
            continue
        # The set files rip Unlimited prints only, so 1st Edition and Shadowless product stays out.
        if re.search(r"1st Edition|Shadowless", it["name"]):
            continue
        raw_promos = it.get("promos", [])
        # A single variant, for example "[Glaceon]", holds only the promo that matches its name. The source often
        # lists every promo of the product wave.
        bracket = re.search(r"\[([^\]]+)\]", it["name"])
        if bracket:
            named = [t for t in raw_promos if t.split(" (")[0] == bracket.group(1)]
            raw_promos = named or raw_promos
        # A Surprise Box promo has a Prismatic Evolutions stamp.
        stamp = stamped if "Surprise Box" in it["name"] else None
        promos = [resolve_promo(t, sets, svp, stamp) for t in raw_promos]
        if any(x is None for x in promos):
            skipped.append(f"{it['name']}: promo not found in {raw_promos}")
            promos = [x for x in promos if x]
        name = re.sub(r"\s+", " ", it["name"])
        msrp = next((v for k, v in MSRP_BY_NAME if k in name), MSRP_BY_KIND.get(it["kind"]))
        # The mix lists the home set first, then the rest by count.
        order = sorted(mix.items(), key=lambda kv: (kv[0] != HOME, -kv[1], kv[0]))
        # Only Scarlet & Violet product is still in print, so only it sells at retail.
        in_print = all(sets[s].get("era") == "scarlet-violet" for s in mix)
        out.append({"id": str(it["id"]), "name": name, "kind": it["kind"], "packs": packs, "inPrint": in_print,
                    "mix": [{"slug": s, "packs": n} for s, n in order],
                    "promos": promos, "pickOnePromo": "Surprise Box" in name,
                    "market": p["unopenedPrice"], "msrp": msrp,
                    "image": p.get("imageCdnUrl800") or p.get("imageUrl")})
    out.sort(key=lambda x: (x["mix"][0]["slug"] != HOME, x["kind"], x["name"]))
    json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"{len(out)} products -> {os.path.relpath(OUT, ROOT)}")
    for x in out:
        mix = ", ".join(f"{m['packs']} {m['slug']}" for m in x["mix"])
        promos = "; ".join(f"{p['name']} {p['num']} ${p['market']}" for p in x["promos"])
        print(f"  {x['id']} {x['name']} | {mix} | ${x['market']} | {promos}")
    for s in skipped:
        print("  SKIPPED PROMO:", s)


if __name__ == "__main__":
    main()
