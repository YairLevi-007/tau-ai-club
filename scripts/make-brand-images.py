"""Generate the static share image and app icons from public/brand/logo-mark.png.

    python scripts/make-brand-images.py

Outputs (commit them):
  public/og/og-default.png   1200x630  Open Graph / Twitter card (no text, works in both languages)
  src/app/icon.png           512x512   app icon (Next metadata file convention)
  src/app/apple-icon.png     180x180   Apple touch icon
  src/app/favicon.ico        16/32/48  favicon

Colors come from brand tokens v1.0 (src/app/tokens.css): --bg, --logo-indigo, --logo-grid, --brand-purple.
The logo is scaled with NEAREST so the pixel art stays crisp.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
LOGO = Image.open(ROOT / "public/brand/logo-mark.png").convert("RGBA")

BG = (0x0B, 0x0A, 0x1F)
INDIGO = (0x24, 0x11, 0x63)
GRID = (0x29, 0x16, 0x66)
PURPLE = (0x8A, 0x2B, 0xFF)


def scaled_logo(width: int) -> Image.Image:
    h = round(LOGO.height * width / LOGO.width)
    return LOGO.resize((width, h), Image.NEAREST)


def og_image() -> Image.Image:
    w, h = 1200, 630
    img = Image.new("RGB", (w, h), BG)

    # Faint grid, faded toward the edges.
    grid = Image.new("L", (w, h), 0)
    gd = ImageDraw.Draw(grid)
    for x in range(0, w, 60):
        gd.line([(x, 0), (x, h)], fill=255)
    for y in range(0, h, 60):
        gd.line([(0, y), (w, y)], fill=255)
    fade = Image.new("L", (w, h), 0)
    ImageDraw.Draw(fade).ellipse([-200, -260, w + 200, h + 260], fill=255)
    fade = fade.filter(ImageFilter.GaussianBlur(180))
    grid_mask = Image.composite(grid, Image.new("L", (w, h), 0), fade)
    img.paste(Image.new("RGB", (w, h), GRID), (0, 0), grid_mask)

    # One soft purple glow behind the logo.
    glow = Image.new("L", (w, h), 0)
    ImageDraw.Draw(glow).ellipse([w // 2 - 380, h // 2 - 230, w // 2 + 380, h // 2 + 230], fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    img.paste(Image.new("RGB", (w, h), PURPLE), (0, 0), glow)

    logo = scaled_logo(560)
    img.paste(logo, ((w - logo.width) // 2, (h - logo.height) // 2), logo)

    # Corner brackets, as on the club's PDF covers.
    d = ImageDraw.Draw(img)
    m, L, t = 48, 44, 4
    for cx, cy, sx, sy in [(m, m, 1, 1), (w - m, m, -1, 1), (m, h - m, 1, -1), (w - m, h - m, -1, -1)]:
        d.rectangle([min(cx, cx + sx * L), min(cy, cy + sy * t), max(cx, cx + sx * L), max(cy, cy + sy * t)], fill=PURPLE)
        d.rectangle([min(cx, cx + sx * t), min(cy, cy + sy * L), max(cx, cx + sx * t), max(cy, cy + sy * L)], fill=PURPLE)
    return img


def icon(size: int, pad_ratio: float = 0.12) -> Image.Image:
    img = Image.new("RGB", (size, size), INDIGO)
    logo = scaled_logo(round(size * (1 - 2 * pad_ratio)))
    img.paste(logo, ((size - logo.width) // 2, (size - logo.height) // 2), logo)
    return img


def main() -> None:
    (ROOT / "public/og").mkdir(parents=True, exist_ok=True)
    og_image().save(ROOT / "public/og/og-default.png", optimize=True)
    icon(512).save(ROOT / "src/app/icon.png", optimize=True)
    icon(180).save(ROOT / "src/app/apple-icon.png", optimize=True)
    # Tiny sizes: drop the padding so the mark stays legible.
    icon(48, 0.04).convert("RGBA").save(ROOT / "src/app/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("wrote og-default.png, icon.png, apple-icon.png, favicon.ico")


if __name__ == "__main__":
    main()
