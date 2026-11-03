"""Find PriceCharting prices for sealed products that have no TCGplayer price.

Usage: python3 tools/ppt/pricecharting_sealed.py

Many old sealed products (vintage boxes, old blisters and tins) do not sell on TCGplayer, so PPT and TCGCSV give
no price. Then tools/export/catalog.py leaves them out. This tool gives them a real price from PriceCharting.

- Reads tools/ppt/cache/sealed_contents.json and finds each product with packs but no PPT or TCGCSV price.
- For each set of those products, fetches the PriceCharting set page once (sorted by highest price) with curl.
  WebFetch gets a 403 there. Saves the page to tools/ppt/cache/pricecharting/<console slug>.html. A saved page is
  not fetched again.
- Matches each product to a sealed row of its set page by name, and takes the "Ungraded" price (the sealed price).
- Writes tools/ppt/sealed_pricecharting.json: {product ID: {name, pcName, market, url}}. catalog.py reads it.
  A product with no match stays out and the tool prints it.
"""
import glob, html, json, os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, os.path.join(ROOT, "tools", "export"))
import catalog as C  # noqa: E402

PAGES = os.path.join(HERE, "cache", "pricecharting")
OUT = os.path.join(HERE, "sealed_pricecharting.json")
SET_INDEX = os.path.join(ROOT, "app", "PokeVendor", "Resources", "set-index.json")
AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
SEALED_WORDS = ("box", "pack", "blister", "tin", "bundle", "collection", "case")
# PriceCharting names a few sets in its own way.
CONSOLE_NAMES = {
    "base-set": "pokemon-base-set",
    "team-magma-vs-team-aqua": "pokemon-team-magma-&-team-aqua",
    "dragon": "pokemon-dragon",
    "expedition-base-set": "pokemon-expedition",
    "black-white": "pokemon-black-&-white",
    "heartgold-soulsilver": "pokemon-heartgold-&-soulsilver",
}


def console_slug(slug, name):
    if slug in CONSOLE_NAMES:
        return CONSOLE_NAMES[slug]
    name = re.sub(r"^ex ", "", name.lower().replace("pokémon", "pokemon"))
    return "pokemon-" + re.sub(r"[^a-z0-9&]+", "-", name).strip("-")


def fetch(console):
    path = os.path.join(PAGES, f"{console}.html")
    if os.path.exists(path):
        return open(path).read()
    url = f"https://www.pricecharting.com/console/{console}?sort=highest-price"
    r = subprocess.run(["curl", "-sL", "-m", "60", "-A", AGENT, "-w", "\n%{http_code}", url], capture_output=True, text=True)
    body, _, code = r.stdout.rpartition("\n")
    time.sleep(1.5)
    if code != "200" or "product-" not in body:
        return None
    os.makedirs(PAGES, exist_ok=True)
    open(path, "w").write(body)
    return body


def rows(page):
    """The sealed rows of a set page: [(name, price, url)]."""
    out = []
    for m in re.finditer(r'<tr id="product-\d+"([\s\S]*?)</tr>', page):
        body = m.group(1)
        title = re.search(r'<td class="title"[^>]*>\s*<a href="([^"]+)">([^<]+)</a>', body)
        price = re.search(r'class="price numeric used_price">\s*<span class="js-price">([^<]*)', body)
        if not title or not price:
            continue
        name = html.unescape(title.group(2)).strip()
        value = price.group(1).replace("$", "").replace(",", "").strip()
        if not value or not any(w in name.lower() for w in SEALED_WORDS):
            continue
        out.append((name, float(value), "https://www.pricecharting.com" + html.unescape(title.group(1))))
    return out


# Words that name the kind of product, not the Pokemon on it.
GENERIC = {"booster", "box", "pack", "blister", "tin", "bundle", "collection", "sleeved", "art", "set", "sealed", "premium",
           "checklane", "elite", "trainer", "collector", "collectors", "pin", "half", "fun", "edition", "international",
           "version", "special", "figure", "1", "2", "3", "4", "5", "and"}


def words(text, set_name):
    """The words of a product name without the set name, as a set. Plurals become singular."""
    def clean(t):
        t = html.unescape(t).lower().replace("&", " and ").replace("pokémon", "pokemon").replace("-", " ").replace(":", " ")
        return " ".join(re.findall(r"[a-z0-9'.]+", t))
    low = " " + clean(text) + " "
    for name in (set_name, re.sub(r"^ex ", "", set_name.lower())):
        low = low.replace(" " + clean(name) + " ", " ")
    low = re.sub(r"\b(pokemon|unlimited|the|of|ex|xy|'s)\b", " ", low)
    low = low.replace("three", "3").replace("two", "2").replace("single", "1")
    out = set()
    for w in re.findall(r"[a-z0-9]+", low):
        out.add(w[:-1] if len(w) > 4 and w.endswith("s") and not w.endswith("ss") else w)
    return out


def variant(product, set_name):
    """The Pokemon words of a product's variant, from [brackets] or (parentheses)."""
    names = re.findall(r"[\[(]([^\])]+)[\])]", product)
    return set().union(*(words(n, set_name) for n in names)) - GENERIC if names else set()


def best(product, set_name, candidates):
    """The PriceCharting row for a product, or None. The kind words and numbers must be the same. Every Pokemon word in
    the row must be in the product name. A product with a variant needs a row that names that variant, or a row with
    no Pokemon word at all (one price for every variant)."""
    want = words(product, set_name)
    kind = {w for w in want if w in GENERIC and w not in ("and", "international", "version", "edition")}
    var = variant(product, set_name)
    scored = []
    for name, price, url in candidates:
        have = words(name, set_name)
        have_kind = {w for w in have if w in GENERIC and w not in ("and", "international", "version", "edition", "sealed")}
        if have_kind != kind - {"art"} and have_kind != kind:
            continue
        pokemon = have - GENERIC
        if not pokemon <= want:
            continue
        if var and pokemon and not var <= pokemon:
            continue
        if ("1st" in have) != ("1st" in want):
            continue
        scored.append((len(want & have) / len(want | have), name, price, url))
    scored.sort(reverse=True)
    return scored[0] if scored else None


def main():
    prices = C.sealed_prices()
    contents = json.load(open(C.CONTENTS))
    sets = {s["slug"]: s for s in json.load(open(SET_INDEX))}
    unpriced = [it for it in contents if it.get("packs") and it.get("slug") in sets
                and not ((prices.get(str(it["id"])) or {}).get("unopenedPrice") or C.tcgcsv_price(it["group"], it["id"]))]
    out, missed = {}, []
    by_set = {}
    for it in unpriced:
        by_set.setdefault(it["slug"], []).append(it)
    for slug, items in sorted(by_set.items()):
        name = sets[slug]["name"]
        console = console_slug(slug, name)
        page = fetch(console)
        if page is None:
            missed += [f"{it['name']} (no page: {console})" for it in items]
            continue
        candidates = rows(page)
        for it in items:
            hit = best(it["name"], name, candidates)
            if not hit:
                missed.append(f"{it['name']} ({console})")
                continue
            _, pc_name, price, url = hit
            # An Unlimited product is never worth more than its 1st Edition. A higher price is bad data on the page.
            first = next((p for n, p, _ in candidates if n == pc_name + " [1st Edition]"), None)
            if "1st" not in pc_name and first is not None and price > first:
                missed.append(f"{it['name']} (SUSPECT: ${price} is over the 1st Edition ${first})")
                continue
            out[str(it["id"])] = {"name": it["name"], "pcName": pc_name, "market": price, "url": url}
    json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1, sort_keys=True)
    print(f"{len(out)} of {len(unpriced)} unpriced products got a PriceCharting price -> {os.path.relpath(OUT, ROOT)}")
    for k, v in sorted(out.items(), key=lambda kv: kv[1]["name"]):
        print(f"  {v['name']}  =  {v['pcName']}  ${v['market']}")
    for m in missed:
        print("  NO MATCH:", m)


if __name__ == "__main__":
    main()
