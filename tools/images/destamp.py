"""Remove the 1st Edition stamp from the card images of the Unlimited prints.

TCGplayer, pokemontcg.io, TCGdex, and pkmncards all show the 1st Edition scan for the WOTC sets that have both print
runs (Jungle to Neo Destiny). The app rips Unlimited prints from Unlimited packs, so those images were wrong.

Usage: python3 tools/images/destamp.py [<set> ...]   (default: every set in SETS)
       python3 tools/images/destamp.py --review <set>  (also writes a before and after sheet to tools/images/review/)

For each print in app/PokeVendor/Resources/Sets/<set>.json, the tool downloads the TCGplayer image into
tools/images/cache/, finds the stamp by template matching, and inpaints it. It keeps only a small patch of each image:
app/PokeVendor/Resources/destamp.json maps a TCGplayer product ID to the patch rectangle in the image, the image size, and
the patch as a JPEG in base64. The app lays the patch over the image when the image URL ends in "#destamp"
(Support/Support.swift, ImageStore). tools/export/rip_set.py adds that fragment to the Unlimited prints that have a patch.
"""
import base64, json, os, re, subprocess, sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
SETS_DIR = os.path.join(ROOT, "app", "PokeVendor", "Resources", "Sets")
OUT = os.path.join(ROOT, "app", "PokeVendor", "Resources", "destamp.json")
CACHE = os.path.join(HERE, "cache")
REVIEW = os.path.join(HERE, "review")

# The sets with a 1st Edition run and an Unlimited run, whose images show the 1st Edition scan.
SETS = ["jungle", "fossil", "team-rocket", "gym-heroes", "gym-challenge", "neo-genesis", "neo-discovery",
        "neo-revelation", "neo-destiny"]
# The template: the stamp on Jungle Scyther (TCGplayer product 45121), in the 584 x 800 scan.
REF_ID, REF_BOX = "45121", (426, 457, 27, 71)
# A match under this score is not a stamp.
MIN_SCORE = 0.7
# A pixel this much darker than the card around it, in the stamp box, is part of the stamp.
DARK = 45
# The mask looks this far past the stamp box, in pixels.
GROW = 6
# The patch is the stamp box and this margin, in pixels. It covers the mask and the inpaint around it.
MARGIN = GROW + 5


def product_id(url):
    m = re.search(r"/product/(\d+)_", url or "")
    return m.group(1) if m else None


def image(pid):
    path = os.path.join(CACHE, f"{pid}.jpg")
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        # curl, because the python.org Python on this Mac has no SSL certificates.
        subprocess.run(["curl", "-s", "-f", "-A", "Mozilla/5.0", "-o", path,
                        f"https://tcgplayer-cdn.tcgplayer.com/product/{pid}_in_800x800.jpg"], check=False)
    return cv2.imread(path) if os.path.exists(path) else None


def template():
    y0, y1, x0, x1 = REF_BOX
    return cv2.cvtColor(image(REF_ID)[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY)


def find_stamp(img, tpl):
    """Return (score, x, y, w, h) of the best stamp match. A Pokemon card has its stamp at the left, under the art. A
    Trainer has it at the bottom left. An Energy card has a smaller stamp at the top right, in the header."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    th, tw = tpl.shape
    best = (-1.0, 0, 0, tw, th)
    regions = [(1.0, int(h * 0.3), int(h * 0.97), 0, int(w * 0.5))]
    regions += [(sc, 0, int(h * 0.18), int(w * 0.6), w) for sc in (0.7, 0.75, 0.8, 0.85, 0.9, 0.95)]
    for scale, y0, y1, x0, x1 in regions:
        t = tpl if scale == 1.0 else cv2.resize(tpl, (round(tw * scale), round(th * scale)), interpolation=cv2.INTER_AREA)
        res = cv2.matchTemplate(gray[y0:y1, x0:x1], t, cv2.TM_CCOEFF_NORMED)
        _, score, _, (x, y) = cv2.minMaxLoc(res)
        if score > best[0]:
            best = (score, x + x0, y + y0, t.shape[1], t.shape[0])
    return best


def clean(img, x, y, tw, th):
    """Inpaint the stamp: the pixels clearly darker than the card around it, closed so the white 1 inside the circle
    goes too, and widened to take the soft edge."""
    # The template box cuts the tops of the letters, so the mask looks a little past it.
    ih, iw = img.shape[:2]
    x0, y0, x1, y1 = max(0, x - GROW), max(0, y - GROW), min(iw, x + tw + GROW), min(ih, y + th + GROW)
    win = img[y0:y1, x0:x1]
    gray = cv2.cvtColor(win, cv2.COLOR_BGR2GRAY).astype(np.int16)
    dark = (gray < np.percentile(gray, 85) - DARK).astype(np.uint8) * 255
    dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    dark = cv2.dilate(dark, np.ones((3, 3), np.uint8), iterations=3)
    mask = np.zeros(img.shape[:2], np.uint8)
    mask[y0:y1, x0:x1] = dark
    return cv2.inpaint(img, mask, 4, cv2.INPAINT_TELEA)


def run(slugs, review):
    tpl = template()
    patches = json.load(open(OUT)) if os.path.exists(OUT) else {}
    sheet = []
    for slug in slugs:
        data = json.load(open(os.path.join(SETS_DIR, f"{slug}.json")))
        pids = sorted({product_id(p.get("image")) for p in data["prints"]} - {None})
        found, missed = 0, []
        for pid in pids:
            img = image(pid)
            # The scans are 584 or 582 pixels wide. The template works at that scale.
            if img is None or not (790 <= img.shape[0] <= 810 and 570 <= img.shape[1] <= 600):
                missed.append(f"{pid} (size {None if img is None else img.shape[:2]})")
                continue
            score, x, y, tw, th = find_stamp(img, tpl)
            if score < MIN_SCORE:
                missed.append(f"{pid} ({score:.2f})")
                continue
            out = clean(img, x, y, tw, th)
            x0, y0 = max(0, x - MARGIN), max(0, y - MARGIN)
            ih, iw = img.shape[:2]
            x1, y1 = min(iw, x + tw + MARGIN), min(ih, y + th + MARGIN)
            ok, jpg = cv2.imencode(".jpg", out[y0:y1, x0:x1], [cv2.IMWRITE_JPEG_QUALITY, 92])
            patches[pid] = {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0, "iw": iw, "ih": ih,
                            "jpg": base64.b64encode(jpg.tobytes()).decode()}
            found += 1
            if review and len(sheet) < 24 and found % 4 == 1:
                before = img[y0 - 20:y1 + 20, x0:x1 + 60]
                after = out[y0 - 20:y1 + 20, x0:x1 + 60]
                sheet.append(np.hstack([before, np.full((before.shape[0], 4, 3), 255, np.uint8), after]))
        print(f"{slug}: {found} of {len(pids)} images cleaned" + (f"; no stamp found: {', '.join(missed)}" if missed else ""))
    json.dump(patches, open(OUT, "w"), separators=(",", ":"), sort_keys=True)
    print(f"{len(patches)} patches, {os.path.getsize(OUT) / 1e6:.1f} MB -> {os.path.relpath(OUT, ROOT)}")
    if sheet:
        os.makedirs(REVIEW, exist_ok=True)
        width = max(s.shape[1] for s in sheet)
        rows = [cv2.copyMakeBorder(s, 2, 2, 0, width - s.shape[1], cv2.BORDER_CONSTANT, value=(40, 40, 40)) for s in sheet]
        path = os.path.join(REVIEW, "sheet.png")
        cv2.imwrite(path, cv2.resize(np.vstack(rows), None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST))
        print(f"review sheet -> {os.path.relpath(path, ROOT)}")


if __name__ == "__main__":
    args = sys.argv[1:]
    review = "--review" in args
    args = [a for a in args if a != "--review"]
    run(args or SETS, review)
