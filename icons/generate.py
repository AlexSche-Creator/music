#!/usr/bin/env python3
"""Generates PNG icons for the PWA manifest from the same design as icon.svg.

Run once: python3 music/icons/generate.py
Produces icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
"""
from PIL import Image, ImageDraw
import os

BG = (10, 10, 10, 255)
ACCENT = (10, 186, 181, 255)

def draw_icon(size: int, maskable: bool = False) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Rounded square background; for maskable, fill full square (safe zone 80%).
    if maskable:
        d.rectangle((0, 0, size, size), fill=BG)
    else:
        r = int(size * 112 / 512)
        d.rounded_rectangle((0, 0, size - 1, size - 1), radius=r, fill=BG)

    # Concentric rings scaled to 512 reference.
    cx = cy = size / 2
    s = size / 512.0
    def circle(radius, width, alpha=255):
        x0, y0 = cx - radius, cy - radius
        x1, y1 = cx + radius, cy + radius
        color = (ACCENT[0], ACCENT[1], ACCENT[2], alpha)
        d.ellipse((x0, y0, x1, y1), outline=color, width=max(1, int(width)))

    circle(168 * s, 14 * s, 255)
    circle(112 * s, 10 * s, 140)
    circle(60  * s, 8  * s, 80)

    # Center dot.
    r = 22 * s
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=ACCENT)

    # Tick marks at N/S/E/W.
    def tick(x, y, w, h):
        d.rounded_rectangle((x, y, x + w, y + h), radius=int(6 * s), fill=ACCENT)
    tick(cx - 8 * s, 74 * s,  16 * s, 40 * s)
    tick(cx - 8 * s, 398 * s, 16 * s, 40 * s)
    tick(74 * s,  cy - 8 * s, 40 * s, 16 * s)
    tick(398 * s, cy - 8 * s, 40 * s, 16 * s)
    return img

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    targets = [
        (192, "icon-192.png", False),
        (512, "icon-512.png", False),
        (512, "icon-maskable-512.png", True),
        (180, "apple-touch-icon.png", False),
    ]
    for size, name, maskable in targets:
        img = draw_icon(size, maskable=maskable)
        path = os.path.join(here, name)
        img.save(path, "PNG", optimize=True)
        print(f"wrote {path}")

if __name__ == "__main__":
    main()
