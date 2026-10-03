#!/usr/bin/env python3
"""Store screenshots: raw captures (store/raw/<device>/*.png, from capture.mjs)
framed on the game's sky, under a caption set in the game's own display type.

    python3 store/tools/compose.py

Writes store/ios-6.9/, store/ipad-13/ and store/android-phone/ at the exact
sizes the stores ask for.
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(ROOT, "store", "raw")
FONT = os.path.join(ROOT, "node_modules/@expo-google-fonts/fredoka/700Bold/Fredoka_700Bold.ttf")

INK = (46, 42, 69)
SKY_TOP, SKY_LOW = (110, 195, 245), (205, 238, 255)
HILLS = [(166, 218, 126), (134, 201, 90), (108, 184, 70)]
GOLD, ORANGE, WHITE = (255, 200, 61), (255, 138, 61), (255, 255, 255)

# (raw capture, caption line 1, caption line 2) — the order they appear in the store.
SHOTS = [
    ("1-home", "A cosy road-building", "logic puzzle"),
    ("2-deduce", "Count the clues.", "Find every road square."),
    ("3-drive", "Finish the road —", "watch the town grow"),
    ("4-hint", "Stuck? A hint shows", "the next step, and why"),
    ("5-map", "600 levels on one", "long road trip"),
    ("6-lantern", "Fog, rocks & night-time", "worlds to master"),
]

# out dir, canvas, raw device folder, caption size, frame width, frame top, bezel, radius
DEVICES = [
    ("ios-6.9", (1320, 2868), "phone", 104, 1060, 520, 22, 112),
    ("android-phone", (1080, 1920), "phone", 66, 738, 262, 15, 76),
    ("ipad-13", (2064, 2752), "ipad", 116, 1700, 470, 26, 70),
]


def background(w, h):
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = min(1, y / (h * 0.75))
        d.line([(0, y), (w, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(SKY_TOP, SKY_LOW)))
    # three rolling hills along the bottom, far to near, like `Scenery`
    for i, col in enumerate(HILLS):
        top = h * (0.70 + i * 0.07)
        r = min(w, h * 0.6) * (0.9 - i * 0.12)
        for cx in ([w * 0.15, w * 0.95] if i != 1 else [w * 0.55]):
            d.ellipse([cx - r, top, cx + r, top + r * 1.4], fill=col)
        d.rectangle([0, min(h, top + r * 0.35), w, h], fill=col)
    # a few soft clouds
    # (at the sides, peeking out from behind the frame: never under the caption)
    for cx, cy, s in [(0.04, 0.24, 1.0), (0.97, 0.36, 0.85), (0.02, 0.55, 0.7)]:
        cx, cy, s = cx * w, cy * h, s * w * 0.09
        for dx, dy, rr in [(-1.1, 0.25, 0.75), (0, 0, 1), (1.1, 0.25, 0.75), (0, 0.45, 0.9)]:
            d.ellipse([cx + dx * s - rr * s, cy + dy * s - rr * s, cx + dx * s + rr * s, cy + dy * s + rr * s], fill=(255, 255, 255))
    return img


def caption(img, lines, size, top):
    """`Display`'s look: white letters, an ink outline, the outline again lower as a shadow."""
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT, size)
    k = max(2, int(size * 0.075))
    drop = int(size * 0.09)
    y = top
    for i, line in enumerate(lines):
        fill = WHITE if i == 0 else GOLD
        w = d.textlength(line, font=font)
        x = (img.width - w) / 2
        d.text((x, y + drop), line, font=font, fill=INK, stroke_width=k, stroke_fill=INK)
        d.text((x, y), line, font=font, fill=fill, stroke_width=k, stroke_fill=INK)
        y += int(size * 1.18)


def framed(shot, width, bezel, radius):
    """The capture in a toy-ink bezel with rounded corners, and the shadow it casts."""
    h = round(shot.height * width / shot.width)
    screen = shot.convert("RGB").resize((width, h), Image.LANCZOS)
    W, H = width + bezel * 2, h + bezel * 2
    frame = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, W - 1, H - 1], radius=radius + bezel, fill=255)
    frame.paste(Image.new("RGBA", (W, H), INK + (255,)), (0, 0), m)
    sm = Image.new("L", (width, h), 0)
    ImageDraw.Draw(sm).rounded_rectangle([0, 0, width - 1, h - 1], radius=radius, fill=255)
    frame.paste(screen, (bezel, bezel), sm)
    shadow = Image.new("RGBA", (W + 160, H + 160), (0, 0, 0, 0))
    shadow.paste(Image.new("RGBA", (W, H), INK + (110,)), (80, 110), m)
    return frame, shadow.filter(ImageFilter.GaussianBlur(36))


def main():
    for out, (cw, ch), raw, csize, fw, ftop, bezel, radius in DEVICES:
        os.makedirs(os.path.join(ROOT, "store", out), exist_ok=True)
        for n, (name, l1, l2) in enumerate(SHOTS, 1):
            src = os.path.join(RAW, raw, name + ".png")
            if not os.path.exists(src):
                print("  missing", src)
                continue
            img = background(cw, ch).convert("RGBA")
            caption(img, [l1, l2], csize, int(ftop * 0.2))
            frame, shadow = framed(Image.open(src), fw, bezel, radius)
            x = (cw - frame.width) // 2
            img.alpha_composite(shadow, (x - 80, ftop - 80))
            img.alpha_composite(frame, (x, ftop))
            dest = os.path.join(ROOT, "store", out, f"{n}-{name.split('-', 1)[1]}.png")
            img.convert("RGB").save(dest, optimize=True)
            print("  ", os.path.relpath(dest, ROOT), img.size)


if __name__ == "__main__":
    main()
