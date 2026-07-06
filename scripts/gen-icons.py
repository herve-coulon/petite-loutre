#!/usr/bin/env python3
"""Génère les icônes PWA depuis le sprite bébé loutre (pixel art).
Usage : python3 scripts/gen-icons.py  (depuis la racine du projet)
"""
import os
from PIL import Image, ImageDraw

PAL = {
    'D': (59, 36, 22), 'B': (138, 90, 52), 'C': (236, 215, 174), 'K': (32, 22, 15),
    'W': (255, 255, 255), 'P': (240, 161, 161)
}
# Tête du bébé loutre (14 lignes utiles du sprite)
BABY = [
    "....DD....DD....",
    "...DBBD..DBBD...",
    "..DBBBBDDBBBBD..",
    ".DBBBBBBBBBBBBD.",
    ".DBBBBBBBBBBBBD.",
    "DBBWKBBBBBBWKBBD",
    "DBBBBBCCCCBBBBBD",
    "DBBBBCCKKCCBBBBD",
    ".DBBBCCCCCCBBBD.",
    ".DBBBBCCCCBBBBD.",
    "..DBBCCCCCCBBD..",
    "..DBBCCCCCCBBD..",
    "...DBBBBBBBBD...",
    "....DDDDDDDD....",
]
BG = (46, 51, 70)        # --shell2
BG_LIGHT = (59, 66, 87)  # --shell

def draw_otter(img, scale, ox, oy):
    d = ImageDraw.Draw(img)
    for j, row in enumerate(BABY):
        for i, ch in enumerate(row):
            c = PAL.get(ch)
            if not c:
                continue
            x0, y0 = ox + i * scale, oy + j * scale
            d.rectangle([x0, y0, x0 + scale - 1, y0 + scale - 1], fill=c)

def rounded_bg(size, radius_ratio=0.22):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * radius_ratio)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=BG)
    # léger dégradé haut, masqué par la forme arrondie
    top = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(top).rectangle([0, 0, size, size // 3], fill=BG_LIGHT + (90,))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    img.paste(Image.alpha_composite(img, top), (0, 0), mask)
    return img

def make_icon(size, sprite_ratio, rounded=True, out="icon.png"):
    img = rounded_bg(size) if rounded else Image.new("RGBA", (size, size), BG)
    target = int(size * sprite_ratio)
    scale = max(1, target // 16)
    w = 16 * scale
    h = len(BABY) * scale
    draw_otter(img, scale, (size - w) // 2, (size - h) // 2)
    img.save(out)
    print("écrit", out, f"({size}x{size}, sprite x{scale})")

def main():
    os.makedirs("icons", exist_ok=True)
    make_icon(192, 0.82, True,  "icons/icon-192.png")
    make_icon(512, 0.82, True,  "icons/icon-512.png")
    make_icon(512, 0.62, False, "icons/icon-maskable-512.png")  # zone sûre maskable
    make_icon(180, 0.82, False, "icons/apple-touch-icon.png")   # iOS arrondit lui-même
    make_icon(64,  0.95, True,  "icons/favicon.png")

if __name__ == "__main__":
    main()
