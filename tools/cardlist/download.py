import json, os, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
BASE = "https://api.tcgdex.net/v2/en"
KEEP = ("id","localId","name","category","types","stage","suffix","trainerType","energyType","rarity","variants","variants_detailed")
def get(url, tries=4):
    import subprocess
    for i in range(tries):
        r = subprocess.run(["curl", "-sL", "-m", "60", "-A", "PokeVendor-research/1.0", "-w", "\n%{http_code}", url], capture_output=True, text=True)
        body, _, code = r.stdout.rpartition("\n")
        if r.returncode == 0 and code == "200":
            return json.loads(body)
        if i == tries - 1:
            raise RuntimeError(f"{url}: curl exit {r.returncode}, HTTP {code}")
        time.sleep(2 * (i + 1))

def card(cid):
    path = os.path.join(CACHE, "tcgdex", "cards", f"{cid}.json")
    if os.path.exists(path): return "cached"
    c = get(f"{BASE}/cards/{urllib.parse.quote(cid)}")
    slim = {k: c.get(k) for k in KEEP}
    slim["variants_detailed"] = [{k: v for k, v in d.items() if k not in ("pricing", "thirdParty", "variantId")} for d in (c.get("variants_detailed") or [])]
    json.dump(slim, open(path, "w"))
    time.sleep(0.1)
    return "ok"
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
for sub in ("tcgdex/sets", "tcgdex/cards", "tcgcsv"):
    os.makedirs(os.path.join(CACHE, sub), exist_ok=True)
m = json.load(open(os.path.join(HERE, "tcgdex-map.json")))
ids = [s for v in m.values() for s in v]
total, failed = 0, []
for sid in ids:
    spath = os.path.join(CACHE, "tcgdex", "sets", f"{sid}.json")
    if not os.path.exists(spath):
        json.dump(get(f"{BASE}/sets/{urllib.parse.quote(sid)}"), open(spath, "w"))
    cards = json.load(open(spath))["cards"]
    with ThreadPoolExecutor(max_workers=4) as ex:
        for cid, res in zip([c["id"] for c in cards], ex.map(card, [c["id"] for c in cards])):
            pass
    missing = [c["id"] for c in cards if not os.path.exists(os.path.join(CACHE, "tcgdex", "cards", f"{c['id']}.json"))]
    failed += missing
    total += len(cards)
    print(f"{sid}: {len(cards)} cards, missing {len(missing)}", flush=True)
print("DONE total", total, "failed", len(failed), failed[:20], flush=True)

# TCGCSV (TCGplayer catalog): products and prices for each group in tcgcsv-map.json.
tm = json.load(open(os.path.join(HERE, "tcgcsv-map.json")))
for gid in sorted({g for v in tm.values() for g in v}):
    for kind in ("products", "prices"):
        path = os.path.join(CACHE, "tcgcsv", f"{gid}-{kind}.json")
        if os.path.exists(path) and os.path.getsize(path) > 50:
            continue
        json.dump(get(f"https://tcgcsv.com/tcgplayer/3/{gid}/{kind}"), open(path, "w"))
        time.sleep(0.5)
print("TCGCSV DONE", flush=True)
