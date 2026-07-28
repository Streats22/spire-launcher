#!/usr/bin/env python3
"""Generate branded DMG / NSIS installer graphics for Spire."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
RESOURCES = ROOT / 'resources'
ICON_PATH = RESOURCES / 'icon.png'

# Slate moss — matches the default Spire theme
BG = (18, 22, 28)
BG_RAISED = (28, 34, 42)
INK = (242, 244, 246)
MUTED = (139, 150, 163)
ACCENT = (95, 173, 127)
ACCENT_SOFT = (54, 92, 78)
WARM = (212, 168, 75)


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
  candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
  ]
  for path in candidates:
    if Path(path).exists():
      return ImageFont.truetype(path, size)
  return ImageFont.load_default()


def load_icon(size: int) -> Image.Image:
  icon = Image.open(ICON_PATH).convert('RGBA')
  icon.thumbnail((size, size), Image.Resampling.LANCZOS)
  return icon


def paint_atmosphere(img: Image.Image) -> None:
  """Subtle vignette + soft accent glow — not flat black."""
  w, h = img.size
  overlay = Image.new('RGBA', (w, h), (0, 0, 0, 0))
  draw = ImageDraw.Draw(overlay)

  # Soft radial washes (single ellipses, then blur — avoids degenerate loops)
  draw.ellipse((-80, -100, 360, 280), fill=(*ACCENT_SOFT, 55))
  draw.ellipse((int(w * 0.45), int(h * 0.05), int(w * 1.05), int(h * 0.55)), fill=(*WARM, 40))
  draw.ellipse((-40, int(h * 0.55), int(w * 0.55), int(h * 1.2)), fill=(0, 0, 0, 70))

  blurred = overlay.filter(ImageFilter.GaussianBlur(28))
  img.alpha_composite(blurred)


def draw_centered_text(
  draw: ImageDraw.ImageDraw,
  text: str,
  xy: tuple[int, int],
  font: ImageFont.ImageFont,
  fill: tuple[int, int, int],
) -> None:
  bbox = draw.textbbox((0, 0), text, font=font)
  tw = bbox[2] - bbox[0]
  th = bbox[3] - bbox[1]
  draw.text((xy[0] - tw // 2, xy[1] - th // 2), text, font=font, fill=fill)


def make_dmg_background(path: Path, scale: int = 1) -> None:
  # Classic Finder DMG canvas; icons sit on the lower half.
  w, h = 660 * scale, 400 * scale
  img = Image.new('RGBA', (w, h), (*BG, 255))
  paint_atmosphere(img)
  draw = ImageDraw.Draw(img)

  # Soft panel behind drop targets
  margin = 28 * scale
  draw.rounded_rectangle(
    [margin, int(h * 0.42), w - margin, h - margin],
    radius=18 * scale,
    fill=(*BG_RAISED, 160),
    outline=(*ACCENT_SOFT, 90),
    width=max(1, scale),
  )

  title_font = load_font(28 * scale)
  sub_font = load_font(14 * scale)
  draw_centered_text(draw, 'Spire', (w // 2, int(52 * scale)), title_font, INK)
  draw_centered_text(
    draw,
    'Drag Spire into Applications to install',
    (w // 2, int(88 * scale)),
    sub_font,
    MUTED,
  )

  # Accent underline under brand
  line_w = 56 * scale
  cy = int(68 * scale)
  draw.rounded_rectangle(
    [w // 2 - line_w // 2, cy, w // 2 + line_w // 2, cy + 3 * scale],
    radius=2 * scale,
    fill=(*ACCENT, 220),
  )

  # Faint arrow between icon slots (x≈180 → x≈480 at y≈220 in 1x)
  y = 200 * scale
  x0, x1 = 230 * scale, 430 * scale
  draw.line([(x0, y), (x1, y)], fill=(*MUTED, 120), width=max(2, 2 * scale))
  tip = 10 * scale
  draw.polygon(
    [(x1, y), (x1 - tip, y - tip // 2), (x1 - tip, y + tip // 2)],
    fill=(*MUTED, 140),
  )

  # Small tower watermark top-right
  mark = load_icon(72 * scale)
  img.alpha_composite(mark, (w - mark.width - 36 * scale, 24 * scale))

  out = img.convert('RGB')
  out.save(path, 'PNG')
  print(f'wrote {path} ({out.size[0]}x{out.size[1]})')


def make_nsis_sidebar(path: Path) -> None:
  w, h = 164, 314
  img = Image.new('RGBA', (w, h), (*BG, 255))
  paint_atmosphere(img)
  draw = ImageDraw.Draw(img)

  icon = load_icon(96)
  ix = (w - icon.width) // 2
  iy = 48
  img.alpha_composite(icon, (ix, iy))

  title_font = load_font(22)
  sub_font = load_font(11)
  draw_centered_text(draw, 'Spire', (w // 2, 170), title_font, INK)
  draw_centered_text(draw, 'Hytale launcher', (w // 2, 196), sub_font, MUTED)

  # Soft accent bar near bottom
  draw.rounded_rectangle([28, 250, w - 28, 254], radius=2, fill=(*ACCENT, 200))
  draw_centered_text(draw, 'Install', (w // 2, 278), sub_font, MUTED)

  # NSIS requires 24-bit BMP (no alpha)
  out = img.convert('RGB')
  out.save(path, 'BMP')
  print(f'wrote {path} ({out.size[0]}x{out.size[1]})')


def make_nsis_header(path: Path) -> None:
  w, h = 150, 57
  img = Image.new('RGBA', (w, h), (*BG, 255))
  paint_atmosphere(img)
  draw = ImageDraw.Draw(img)

  icon = load_icon(36)
  img.alpha_composite(icon, (10, (h - icon.height) // 2))

  title_font = load_font(16)
  draw.text((52, 12), 'Spire', font=title_font, fill=INK)
  sub_font = load_font(10)
  draw.text((52, 32), 'Setup', font=sub_font, fill=MUTED)

  out = img.convert('RGB')
  out.save(path, 'BMP')
  print(f'wrote {path} ({out.size[0]}x{out.size[1]})')


def make_ico(path: Path) -> None:
  src = Image.open(ICON_PATH).convert('RGBA')
  sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
  src.save(path, format='ICO', sizes=sizes)
  print(f'wrote {path}')


def main() -> None:
  RESOURCES.mkdir(parents=True, exist_ok=True)
  make_dmg_background(RESOURCES / 'dmg-background.png', scale=1)
  make_dmg_background(RESOURCES / 'dmg-background@2x.png', scale=2)
  make_nsis_sidebar(RESOURCES / 'installerSidebar.bmp')
  make_nsis_header(RESOURCES / 'installerHeader.bmp')
  make_ico(RESOURCES / 'icon.ico')


if __name__ == '__main__':
  main()
