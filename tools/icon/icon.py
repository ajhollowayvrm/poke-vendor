"""Draw the PokeVendor app icon: a torn foil booster pack, a card that rises out of it, and a price tag.

Usage: python3 tools/icon/icon.py

Writes the three iOS icon appearances to app/PokeVendor/Assets.xcassets/AppIcon.appiconset/: AppIcon.png (default,
opaque), AppIcon-Dark.png (transparent background, iOS draws the dark backdrop), and AppIcon-Tinted.png (grayscale on
transparent, iOS applies the tint). It draws at 4096 px and scales down to 1024 px. The icon uses no Pokémon logo and
no Poké Ball.
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageFont
import math, sys
S = 4096  # draw at 4x, scale to 1024

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))

def gradient(size, stops, angle_deg):
    w, h = size
    g = Image.new('RGBA', size)
    px = g.load()
    a = math.radians(angle_deg); dx, dy = math.cos(a), math.sin(a)
    proj = [x*dx + y*dy for x, y in ((0,0),(w,0),(0,h),(w,h))]
    lo, hi = min(proj), max(proj)
    # draw row by row with a small lookup for speed
    lut = []
    for i in range(1025):
        t = i / 1024
        for j in range(len(stops) - 1):
            if stops[j][0] <= t <= stops[j+1][0]:
                u = (t - stops[j][0]) / (stops[j+1][0] - stops[j][0] or 1)
                lut.append(lerp(stops[j][1], stops[j+1][1], u)); break
        else: lut.append(stops[-1][1])
    for y in range(h):
        for x in range(w):
            t = ((x*dx + y*dy) - lo) / (hi - lo)
            px[x, y] = lut[int(t * 1024)]
    return g

def background():
    bg = Image.new('RGBA', (S, S), (8, 12, 17, 255))
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    d.ellipse((S*0.12, S*0.08, S*0.88, S*0.84), fill=(34, 211, 238, 95))
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.12))
    return Image.alpha_composite(bg, glow)

def pack_layer():
    """The pack, upright, on a transparent layer the size of the canvas."""
    W, H = int(S * 0.46), int(S * 0.70)
    small = gradient((W // 8, H // 8), [(0, (40, 20, 110, 255)), (0.35, (170, 50, 170, 255)),
                                        (0.6, (245, 140, 190, 255)), (0.8, (40, 170, 210, 255)),
                                        (1, (25, 35, 110, 255))], 58)
    body = small.resize((W, H), Image.BICUBIC)
    # a soft diagonal shine band
    shine = Image.new('L', (W, H), 0)
    sd = ImageDraw.Draw(shine)
    sd.polygon([(W*0.15, H), (W*0.55, H), (W*1.05, 0), (W*0.65, 0)], fill=110)
    shine = shine.filter(ImageFilter.GaussianBlur(W * 0.08))
    body = Image.composite(Image.new('RGBA', (W, H), (255, 255, 255, 255)), body, shine)
    # facets
    over = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    fd = ImageDraw.Draw(over)
    for pts, a in [([(0, H*0.45), (W*0.5, H*0.2), (W*0.2, H*0.75)], 40),
                   ([(W, H*0.3), (W*0.55, H*0.62), (W, H*0.85)], 34),
                   ([(W*0.1, H), (W*0.5, H*0.7), (W*0.85, H)], 30)]:
        fd.polygon(pts, fill=(255, 255, 255, a))
    body = Image.alpha_composite(body, over)
    # a big star emblem
    cx, cy, r = W * 0.5, H * 0.56, W * 0.26
    star = [(cx + (r if i % 2 == 0 else r * 0.42) * math.cos(math.radians(-90 + i * 36)),
             cy + (r if i % 2 == 0 else r * 0.42) * math.sin(math.radians(-90 + i * 36))) for i in range(10)]
    glow = Image.new('L', (W, H), 0); ImageDraw.Draw(glow).polygon(star, fill=255)
    glow = glow.filter(ImageFilter.GaussianBlur(W * 0.05))
    body = Image.composite(Image.new('RGBA', (W, H), (255, 240, 170, 255)), body, glow.point(lambda v: int(v * 0.6)))
    ImageDraw.Draw(body).polygon(star, fill=(255, 214, 64, 255))
    inner = [(cx + (p[0] - cx) * 0.55, cy + (p[1] - cy) * 0.55 - r * 0.04) for p in star]
    ImageDraw.Draw(body).polygon(inner, fill=(255, 245, 200, 255))
    # crimps: bands of ridges at top and bottom
    over = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    cd = ImageDraw.Draw(over)
    crimp = int(H * 0.07)
    for band_y in (0, H - crimp):
        cd.rectangle((0, band_y, W, band_y + crimp), fill=(20, 16, 50, 70))
        for x in range(0, W, int(W * 0.03)):
            cd.rectangle((x, band_y, x + int(W * 0.013), band_y + crimp), fill=(255, 255, 255, 60))
    body = Image.alpha_composite(body, over)
    # outline mask with teeth at the bottom and a torn edge at the top
    mask = Image.new('L', (W, H), 0)
    md = ImageDraw.Draw(mask)
    tooth = W / 22
    tear_y = H * 0.12
    top = [(0, tear_y)]
    x, k = 0, 0
    while x < W:
        x = min(W, x + tooth / 2); k += 1
        top.append((x, tear_y + (-H * 0.012 if k % 2 else H * 0.012)))
    bottom = []
    x, k = W, 0
    while x > 0:
        x = max(0, x - tooth / 2); k += 1
        bottom.append((x, H - (H * 0.018 if k % 2 else 0)))
    md.polygon(top + [(W, H * 0.5)] + bottom, fill=255)
    pack = Image.new('RGBA', (W, H), (0, 0, 0, 0)); pack.paste(body, (0, 0), mask)
    # white torn foil edge
    ed = ImageDraw.Draw(pack)
    ed.line(top, fill=(255, 255, 255, 235), width=int(W * 0.018), joint='curve')
    # side shading
    shade = gradient((W // 8, 1), [(0, (0, 0, 0, 110)), (0.2, (0, 0, 0, 0)), (0.8, (0, 0, 0, 0)), (1, (0, 0, 0, 110))], 0).resize((W, H))
    pack = Image.alpha_composite(pack, Image.composite(shade, Image.new('RGBA', (W, H), (0, 0, 0, 0)), mask))
    return pack, tear_y

def card_layer(w, h):
    """A card back: blue with a white ring and a sparkle."""
    card = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(card)
    r = int(w * 0.07)
    d.rounded_rectangle((0, 0, w, h), r, fill=(255, 205, 60, 255))
    inset = int(w * 0.055)
    inner = gradient((w // 8, h // 8), [(0, (70, 150, 245, 255)), (1, (18, 40, 120, 255))], 70).resize((w - 2*inset, h - 2*inset))
    m = Image.new('L', inner.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, *inner.size), int(r * 0.6), fill=255)
    card.paste(inner, (inset, inset), m)
    cx, cy = w / 2, h * 0.42
    rr = w * 0.2
    d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=(255, 255, 255, 255), width=int(w * 0.05))
    s = w * 0.1
    d.polygon([(cx, cy - s), (cx + s * 0.28, cy - s * 0.28), (cx + s, cy), (cx + s * 0.28, cy + s * 0.28),
               (cx, cy + s), (cx - s * 0.28, cy + s * 0.28), (cx - s, cy), (cx - s * 0.28, cy - s * 0.28)], fill=(255, 255, 255, 255))
    return card

def tag_layer():
    """A green price tag with a dollar sign."""
    w, h = int(S * 0.27), int(S * 0.17)
    tag = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(tag)
    notch = h * 0.5
    d.polygon([(0, h / 2), (notch * 0.8, 0), (w, 0), (w, h), (notch * 0.8, h)], fill=(52, 212, 153, 255))
    d.ellipse((notch * 0.45 - h * 0.09, h / 2 - h * 0.09, notch * 0.45 + h * 0.09, h / 2 + h * 0.09), fill=(8, 12, 17, 255))
    try:
        font = ImageFont.truetype('/System/Library/Fonts/SFNSRounded.ttf', int(h * 0.78))
    except Exception:
        font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', int(h * 0.78))
    try: font.set_variation_by_name('Heavy')
    except Exception: pass
    d.text((w * 0.64, h * 0.5), '$', font=font, fill=(8, 12, 17, 255), anchor='mm')
    return tag

def shadow(layer, blur, alpha, offset):
    a = layer.split()[3].point(lambda v: int(v * alpha))
    sh = Image.new('RGBA', layer.size, (0, 0, 0, 0)); sh.putalpha(a)
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    out = Image.new('RGBA', layer.size, (0, 0, 0, 0)); out.paste(sh, offset, sh)
    return out

def foreground():
    fg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    pack, tear_y = pack_layer()
    pw, ph = pack.size
    # the card rises out of the torn top, behind the front of the pack
    cw, chh = int(pw * 0.8), int(pw * 0.8 * 1.396)
    card = card_layer(cw, chh)
    group = Image.new('RGBA', (pw, ph + int(ph * 0.35)), (0, 0, 0, 0))
    oy = int(ph * 0.35)
    group.alpha_composite(card, ((pw - cw) // 2, int(oy - ph * 0.26)))
    group.alpha_composite(pack, (0, oy))
    group = group.rotate(-9, resample=Image.BICUBIC, expand=True)
    k = 0.80
    group = group.resize((int(group.width * k), int(group.height * k)), Image.LANCZOS)
    gx, gy = int(S * 0.46 - group.width / 2), int(S * 0.5 - group.height / 2)
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0)); layer.alpha_composite(group, (gx, gy))
    fg = Image.alpha_composite(fg, shadow(layer, S * 0.02, 0.6, (int(S * 0.01), int(S * 0.025))))
    fg = Image.alpha_composite(fg, layer)
    tag = tag_layer().rotate(14, resample=Image.BICUBIC, expand=True)
    tl = Image.new('RGBA', (S, S), (0, 0, 0, 0)); tl.alpha_composite(tag, (int(S * 0.55), int(S * 0.60)))
    fg = Image.alpha_composite(fg, shadow(tl, S * 0.012, 0.7, (int(S * 0.006), int(S * 0.014))))
    fg = Image.alpha_composite(fg, tl)
    return fg

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'app', 'PokeVendor', 'Assets.xcassets',
                   'AppIcon.appiconset')
fg = foreground()
light = Image.alpha_composite(background(), fg).convert('RGB').resize((1024, 1024), Image.LANCZOS)
light.save(os.path.join(OUT, 'AppIcon.png'))
# dark: the foreground on a transparent background (iOS draws its own dark backdrop)
dark_bg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
dark = Image.alpha_composite(dark_bg, fg).resize((1024, 1024), Image.LANCZOS)
dark.save(os.path.join(OUT, 'AppIcon-Dark.png'))
# tinted: grayscale luminance on transparent; iOS applies the tint color
g = fg.convert('LA').convert('RGBA')
g.putalpha(fg.split()[3])
g.resize((1024, 1024), Image.LANCZOS).save(os.path.join(OUT, 'AppIcon-Tinted.png'))
