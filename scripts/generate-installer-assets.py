#!/usr/bin/env python3
"""Generate branded DMG / NSIS installer graphics for Spire."""

from __future__ import annotations

import os
import struct
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
RESOURCES = ROOT / 'resources'
ICON_PATH = RESOURCES / 'icon.png'

# Slate moss — matches the default Spire theme
BG = (18, 22, 28)
BG_DEEP = (10, 13, 18)
BG_RAISED = (28, 34, 42)
INK = (242, 244, 246)
INK_SOFT = (200, 208, 216)
MUTED = (139, 150, 163)
ACCENT = (95, 173, 127)
ACCENT_SOFT = (54, 92, 78)
ACCENT_GLOW = (95, 173, 127)
WARM = (212, 168, 75)
WARM_GLOW = (255, 180, 72)


def load_font(size: int, *, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
  windir = os.environ.get('WINDIR', r'C:\Windows')
  candidates: list[str] = []
  if bold:
    candidates.extend([
      str(Path(windir) / 'Fonts' / 'segoeuib.ttf'),
      str(Path(windir) / 'Fonts' / 'seguisb.ttf'),
      str(Path(windir) / 'Fonts' / 'bahnschrift.ttf'),
      str(Path(windir) / 'Fonts' / 'calibrib.ttf'),
      '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
      '/Library/Fonts/Arial Bold.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
      '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
    ])
  else:
    candidates.extend([
      str(Path(windir) / 'Fonts' / 'segoeui.ttf'),
      str(Path(windir) / 'Fonts' / 'segoeuisl.ttf'),
      str(Path(windir) / 'Fonts' / 'calibri.ttf'),
      '/System/Library/Fonts/Supplemental/Arial.ttf',
      '/Library/Fonts/Arial.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
      '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
    ])
  for path in candidates:
    if Path(path).exists():
      return ImageFont.truetype(path, size)
  return ImageFont.load_default()


def load_icon(size: int) -> Image.Image:
  icon = Image.open(ICON_PATH).convert('RGBA')
  # Trim near-black padding so the tower fills the slot
  alpha = icon.split()[-1]
  bbox = alpha.getbbox()
  if bbox is not None:
    icon = icon.crop(bbox)
  icon.thumbnail((size, size), Image.Resampling.LANCZOS)
  return icon


def lerp(a: float, b: float, t: float) -> float:
  return a + (b - a) * t


def lerp_rgb(
  a: tuple[int, int, int],
  b: tuple[int, int, int],
  t: float,
) -> tuple[int, int, int]:
  return (
    int(lerp(a[0], b[0], t)),
    int(lerp(a[1], b[1], t)),
    int(lerp(a[2], b[2], t)),
  )


def paint_vertical_gradient(
  img: Image.Image,
  top: tuple[int, int, int],
  mid: tuple[int, int, int],
  bottom: tuple[int, int, int],
  mid_at: float = 0.42,
) -> None:
  w, h = img.size
  px = img.load()
  assert px is not None
  for y in range(h):
    t = y / max(h - 1, 1)
    if t < mid_at:
      color = lerp_rgb(top, mid, t / mid_at)
    else:
      color = lerp_rgb(mid, bottom, (t - mid_at) / (1 - mid_at))
    for x in range(w):
      px[x, y] = (*color, 255)


def soft_ellipse(
  size: tuple[int, int],
  box: tuple[int, int, int, int],
  color: tuple[int, int, int, int],
  blur: int,
) -> Image.Image:
  layer = Image.new('RGBA', size, (0, 0, 0, 0))
  ImageDraw.Draw(layer).ellipse(box, fill=color)
  return layer.filter(ImageFilter.GaussianBlur(blur))


def paint_atmosphere(img: Image.Image, *, warm_y: float = 0.22) -> None:
  """Moss wash, warm tower-window glow, and deep vignette."""
  w, h = img.size

  moss = soft_ellipse(
    (w, h),
    (-int(w * 0.35), -int(h * 0.2), int(w * 0.95), int(h * 0.55)),
    (*ACCENT_GLOW, 48),
    max(18, w // 6),
  )
  img.alpha_composite(moss)

  warm = soft_ellipse(
    (w, h),
    (int(w * 0.18), int(h * warm_y) - 40, int(w * 0.82), int(h * warm_y) + 90),
    (*WARM_GLOW, 55),
    max(16, w // 7),
  )
  img.alpha_composite(warm)

  # Secondary cooler wash lower-left
  cool = soft_ellipse(
    (w, h),
    (-40, int(h * 0.45), int(w * 0.7), int(h * 1.15)),
    (40, 70, 90, 42),
    max(20, w // 5),
  )
  img.alpha_composite(cool)

  # Edge vignette
  vig = Image.new('RGBA', (w, h), (0, 0, 0, 0))
  vdraw = ImageDraw.Draw(vig)
  vdraw.rectangle([0, 0, w, h], outline=(0, 0, 0, 90), width=max(8, w // 10))
  img.alpha_composite(vig.filter(ImageFilter.GaussianBlur(14)))


def paint_ground_mist(img: Image.Image) -> None:
  """Fog bank + soft ground plane at the bottom of a tall panel."""
  w, h = img.size
  mist = Image.new('RGBA', (w, h), (0, 0, 0, 0))
  draw = ImageDraw.Draw(mist)

  draw.ellipse((-30, int(h * 0.72), w + 30, h + 40), fill=(8, 12, 16, 210))
  draw.ellipse((-50, int(h * 0.68), w + 50, int(h * 0.92)), fill=(70, 90, 100, 55))
  draw.ellipse((int(w * 0.05), int(h * 0.62), int(w * 0.95), int(h * 0.82)), fill=(120, 150, 140, 28))

  # Faint stone ledge silhouette
  ledge_y = int(h * 0.86)
  draw.polygon(
    [
      (0, h),
      (0, ledge_y + 8),
      (int(w * 0.18), ledge_y),
      (int(w * 0.42), ledge_y + 10),
      (int(w * 0.7), ledge_y + 2),
      (w, ledge_y + 12),
      (w, h),
    ],
    fill=(14, 18, 24, 230),
  )

  img.alpha_composite(mist.filter(ImageFilter.GaussianBlur(3)))


def paint_noise(img: Image.Image, amount: int = 6) -> None:
  """Sparse single-pixel grain — avoids hatch/grid patterns."""
  w, h = img.size
  noise = Image.new('RGBA', (w, h), (0, 0, 0, 0))
  px = noise.load()
  assert px is not None
  for y in range(h):
    for x in range(w):
      n = (x * 374761393 + y * 668265263 + x * y * 127) & 1023
      if n > 1008:
        px[x, y] = (255, 255, 255, amount)
      elif n < 6:
        px[x, y] = (0, 0, 0, amount)
  img.alpha_composite(noise)


def paint_accent_edge(img: Image.Image, *, right: bool = True) -> None:
  w, h = img.size
  edge = Image.new('RGBA', (w, h), (0, 0, 0, 0))
  draw = ImageDraw.Draw(edge)
  x0 = w - 3 if right else 0
  x1 = w - 1 if right else 2
  draw.rectangle([x0, 0, x1, h], fill=(*ACCENT, 160))
  # Soft bloom beside the edge
  bloom_x = w - 18 if right else 0
  draw.rectangle(
    [bloom_x, 0, bloom_x + 18, h] if right else [0, 0, 18, h],
    fill=(*ACCENT, 18),
  )
  img.alpha_composite(edge.filter(ImageFilter.GaussianBlur(1)))


def draw_centered_text(
  draw: ImageDraw.ImageDraw,
  text: str,
  xy: tuple[int, int],
  font: ImageFont.ImageFont,
  fill: tuple[int, int, int] | tuple[int, int, int, int],
) -> None:
  bbox = draw.textbbox((0, 0), text, font=font)
  tw = bbox[2] - bbox[0]
  th = bbox[3] - bbox[1]
  draw.text((xy[0] - tw // 2, xy[1] - th // 2), text, font=font, fill=fill)


def tracked_text_width(
  draw: ImageDraw.ImageDraw,
  text: str,
  font: ImageFont.ImageFont,
  tracking: float = 1.35,
) -> int:
  widths: list[int] = []
  for ch in text:
    bbox = draw.textbbox((0, 0), ch, font=font)
    widths.append(bbox[2] - bbox[0])
  gaps = len(text) - 1
  avg = sum(widths) / max(len(text), 1)
  return sum(widths) + int(avg * (tracking - 1) * gaps)


def draw_tracked_text(
  draw: ImageDraw.ImageDraw,
  text: str,
  center: tuple[int, int],
  font: ImageFont.ImageFont,
  fill: tuple[int, int, int],
  tracking: float = 1.35,
) -> tuple[int, int]:
  """Draw title with slight letter-spacing. Returns (ink width, ink height).

  Vertical metrics use the full-string textbbox — per-glyph heights and top
  bearings are unreliable and were placing the accent rule through the glyphs.
  """
  widths: list[int] = []
  for ch in text:
    bbox = draw.textbbox((0, 0), ch, font=font)
    widths.append(bbox[2] - bbox[0])
  total = tracked_text_width(draw, text, font, tracking)
  ref = draw.textbbox((0, 0), text, font=font)
  th = ref[3] - ref[1]
  top_bearing = ref[1]
  x = center[0] - total // 2
  # Center the ink box on `center`; compensate for non-zero top bearing
  y = center[1] - th // 2 - top_bearing
  avg = sum(widths) / max(len(text), 1)
  for ch, cw in zip(text, widths):
    draw.text((x, y), ch, font=font, fill=fill)
    x += cw + int(avg * (tracking - 1))
  return total, th


def draw_accent_rule(
  draw: ImageDraw.ImageDraw,
  center_x: int,
  top_y: int,
  width: int,
  fill: tuple[int, int, int, int] | tuple[int, int, int] = (*ACCENT, 235),
) -> None:
  """Thin accent bar below a title — never through the glyphs."""
  line_w = max(48, width - 8)
  draw.rounded_rectangle(
    [center_x - line_w // 2, top_y, center_x + line_w // 2, top_y + 3],
    radius=2,
    fill=fill,
  )


def composite_icon_with_glow(
  img: Image.Image,
  icon: Image.Image,
  xy: tuple[int, int],
) -> None:
  ix, iy = xy
  # Warm halo behind the lit window (upper third of the tower)
  glow = soft_ellipse(
    img.size,
    (ix + icon.width // 2 - 36, iy + 8, ix + icon.width // 2 + 36, iy + 70),
    (*WARM_GLOW, 70),
    18,
  )
  img.alpha_composite(glow)
  # Soft drop shadow
  shadow = Image.new('RGBA', img.size, (0, 0, 0, 0))
  shadow.paste((0, 0, 0, 90), (ix + 2, iy + 6, ix + 2 + icon.width, iy + 6 + icon.height), icon)
  img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(6)))
  img.alpha_composite(icon, (ix, iy))


def make_dmg_background(path: Path, scale: int = 1) -> None:
  w, h = 660 * scale, 400 * scale
  img = Image.new('RGBA', (w, h), (*BG, 255))
  paint_vertical_gradient(
    img,
    (22, 30, 36),
    BG,
    BG_DEEP,
    mid_at=0.5,
  )
  paint_atmosphere(img, warm_y=0.18)
  paint_noise(img, amount=8)
  draw = ImageDraw.Draw(img)

  margin = 28 * scale
  draw.rounded_rectangle(
    [margin, int(h * 0.42), w - margin, h - margin],
    radius=18 * scale,
    fill=(*BG_RAISED, 150),
    outline=(*ACCENT_SOFT, 100),
    width=max(1, scale),
  )

  title_font = load_font(30 * scale, bold=True)
  sub_font = load_font(14 * scale, bold=False)
  draw_tracked_text(draw, 'Spire', (w // 2, int(50 * scale)), title_font, INK, tracking=1.2)
  draw_centered_text(
    draw,
    'Drag Spire into Applications to install',
    (w // 2, int(88 * scale)),
    sub_font,
    MUTED,
  )

  line_w = 64 * scale
  cy = int(66 * scale)
  draw.rounded_rectangle(
    [w // 2 - line_w // 2, cy, w // 2 + line_w // 2, cy + 3 * scale],
    radius=2 * scale,
    fill=(*ACCENT, 230),
  )

  y = 200 * scale
  x0, x1 = 230 * scale, 430 * scale
  draw.line([(x0, y), (x1, y)], fill=(*MUTED, 120), width=max(2, 2 * scale))
  tip = 10 * scale
  draw.polygon(
    [(x1, y), (x1 - tip, y - tip // 2), (x1 - tip, y + tip // 2)],
    fill=(*MUTED, 140),
  )

  mark = load_icon(80 * scale)
  composite_icon_with_glow(img, mark, (w - mark.width - 32 * scale, 18 * scale))

  out = img.convert('RGB')
  out.save(path, 'PNG')
  print(f'wrote {path} ({out.size[0]}x{out.size[1]})')


def make_nsis_sidebar(path: Path) -> None:
  # Classic MUI welcome/finish bitmap size
  w, h = 164, 314
  img = Image.new('RGBA', (w, h), (*BG, 255))
  paint_vertical_gradient(
    img,
    (26, 36, 42),
    (16, 22, 28),
    (8, 10, 14),
    mid_at=0.38,
  )
  paint_atmosphere(img, warm_y=0.2)
  paint_ground_mist(img)
  paint_noise(img, amount=12)
  paint_accent_edge(img, right=True)

  # Soft spotlight behind the tower so it reads as the hero
  spotlight = soft_ellipse(
    (w, h),
    (12, 8, w - 12, 150),
    (255, 255, 255, 22),
    22,
  )
  img.alpha_composite(spotlight)

  icon = load_icon(118)
  ix = (w - icon.width) // 2
  iy = 28
  composite_icon_with_glow(img, icon, (ix, iy))

  draw = ImageDraw.Draw(img)
  title_font = load_font(24, bold=True)
  sub_font = load_font(11, bold=False)

  # Wordmark sits in the clear band between tower and mist
  title_y = 172
  tracking = 1.22
  title_w, title_h = draw_tracked_text(
    draw, 'Spire', (w // 2, title_y), title_font, INK, tracking=tracking,
  )
  rule_y = title_y + title_h // 2 + 12
  draw_accent_rule(draw, w // 2, rule_y, title_w)
  draw_centered_text(draw, 'Hytale launcher', (w // 2, rule_y + 20), sub_font, MUTED)

  # Tiny warm ember near the mist — echoes the tower window
  ember = soft_ellipse((w, h), (w // 2 - 24, 252, w // 2 + 24, 286), (*WARM, 40), 12)
  img.alpha_composite(ember)

  save_nsis_bmp(img, path)


def make_nsis_header(path: Path) -> None:
  # MUI header image (right side of interior pages)
  w, h = 150, 57
  img = Image.new('RGBA', (w, h), (*BG, 255))
  paint_vertical_gradient(img, (24, 32, 38), BG, BG_DEEP, mid_at=0.55)
  paint_atmosphere(img, warm_y=0.35)
  paint_noise(img, amount=8)

  # Left accent rail
  rail = Image.new('RGBA', (w, h), (0, 0, 0, 0))
  ImageDraw.Draw(rail).rectangle([0, 0, 2, h], fill=(*ACCENT, 200))
  img.alpha_composite(rail)

  icon = load_icon(34)
  iy = (h - icon.height) // 2
  composite_icon_with_glow(img, icon, (10, iy))

  draw = ImageDraw.Draw(img)
  title_font = load_font(15, bold=True)
  sub_font = load_font(9, bold=False)
  draw.text((52, 12), 'Spire', font=title_font, fill=INK)
  draw.text((52, 32), 'Setup', font=sub_font, fill=MUTED)
  # Accent tick under the wordmark
  draw.rounded_rectangle([52, 28, 78, 30], radius=1, fill=(*ACCENT, 220))

  save_nsis_bmp(img, path)


def make_nsis_page_base(w: int = 499, h: int = 314) -> Image.Image:
  """Full-bleed canvas for MUI dialog 1044 (welcome/finish surface)."""
  img = Image.new('RGBA', (w, h), (*BG, 255))
  paint_vertical_gradient(
    img,
    (26, 36, 42),
    (16, 22, 28),
    (8, 10, 14),
    mid_at=0.4,
  )
  paint_atmosphere(img, warm_y=0.18)
  paint_ground_mist(img)
  paint_noise(img, amount=10)
  paint_accent_edge(img, right=True)
  return img


def make_nsis_welcome_page(path: Path) -> None:
  w, h = 499, 314
  img = make_nsis_page_base(w, h)

  spotlight = soft_ellipse(
    (w, h),
    (w // 2 - 100, 12, w // 2 + 100, 170),
    (255, 255, 255, 20),
    30,
  )
  img.alpha_composite(spotlight)

  icon = load_icon(110)
  ix = (w - icon.width) // 2
  iy = 28
  composite_icon_with_glow(img, icon, (ix, iy))

  draw = ImageDraw.Draw(img)
  title_font = load_font(40, bold=True)
  body_font = load_font(14, bold=False)
  hint_font = load_font(12, bold=False)

  title_y = 158
  title_w, title_h = draw_tracked_text(
    draw, 'Spire', (w // 2, title_y), title_font, INK, tracking=1.18,
  )
  rule_y = title_y + title_h // 2 + 12
  draw_accent_rule(draw, w // 2, rule_y, title_w)
  draw_centered_text(
    draw,
    'Hytale instance launcher',
    (w // 2, rule_y + 26),
    body_font,
    INK_SOFT,
  )
  draw_centered_text(
    draw,
    'Manage profiles and content — without redistributing the game.',
    (w // 2, rule_y + 50),
    hint_font,
    MUTED,
  )
  draw_centered_text(
    draw,
    'Click Next to continue',
    (w // 2, h - 32),
    hint_font,
    MUTED,
  )

  save_nsis_bmp(img, path)


def make_nsis_options_page(path: Path) -> None:
  w, h = 499, 314
  img = make_nsis_page_base(w, h)

  icon = load_icon(64)
  composite_icon_with_glow(img, icon, (36, 28))

  draw = ImageDraw.Draw(img)
  title_font = load_font(26, bold=True)
  body_font = load_font(13, bold=False)
  hint_font = load_font(12, bold=False)

  title = 'Installation options'
  draw.text((118, 36), title, font=title_font, fill=INK)
  tb = draw.textbbox((118, 36), title, font=title_font)
  draw_accent_rule(draw, 118 + (tb[2] - tb[0]) // 2, tb[3] + 8, min(96, tb[2] - tb[0]))
  draw.text(
    (118, tb[3] + 24),
    'Choose desktop shortcut and startup options below.',
    font=body_font,
    fill=INK_SOFT,
  )
  draw.text(
    (118, tb[3] + 48),
    'A Start Menu shortcut is still created for easy access.',
    font=hint_font,
    fill=MUTED,
  )

  # Leave the lower third clear for native NSIS checkboxes
  save_nsis_bmp(img, path)


def make_nsis_finish_page(path: Path) -> None:
  w, h = 499, 314
  img = make_nsis_page_base(w, h)

  warm = soft_ellipse(
    (w, h),
    (w // 2 - 80, 24, w // 2 + 80, 150),
    (*WARM_GLOW, 48),
    26,
  )
  img.alpha_composite(warm)

  icon = load_icon(100)
  ix = (w - icon.width) // 2
  composite_icon_with_glow(img, icon, (ix, 22))

  draw = ImageDraw.Draw(img)
  title_font = load_font(32, bold=True)
  body_font = load_font(14, bold=False)
  hint_font = load_font(12, bold=False)

  title_y = 142
  title_w, title_h = draw_tracked_text(
    draw, 'You\'re ready', (w // 2, title_y), title_font, INK, tracking=1.08,
  )
  rule_y = title_y + title_h // 2 + 12
  draw_accent_rule(draw, w // 2, rule_y, title_w)
  draw_centered_text(
    draw,
    'Spire is installed. Launch when you\'re ready to play.',
    (w // 2, rule_y + 28),
    body_font,
    INK_SOFT,
  )
  draw_centered_text(
    draw,
    'Optional: open Spire when setup finishes.',
    (w // 2, h - 48),
    hint_font,
    MUTED,
  )

  save_nsis_bmp(img, path)


def make_nsis_unwelcome_page(path: Path) -> None:
  w, h = 499, 314
  img = make_nsis_page_base(w, h)

  icon = load_icon(96)
  ix = (w - icon.width) // 2
  composite_icon_with_glow(img, icon, (ix, 28))

  draw = ImageDraw.Draw(img)
  title_font = load_font(30, bold=True)
  body_font = load_font(14, bold=False)
  hint_font = load_font(12, bold=False)

  title_y = 148
  title_w, title_h = draw_tracked_text(
    draw, 'Uninstall Spire', (w // 2, title_y), title_font, INK, tracking=1.06,
  )
  rule_y = title_y + title_h // 2 + 12
  draw_accent_rule(draw, w // 2, rule_y, title_w)
  draw_centered_text(
    draw,
    'This removes Spire from your computer.',
    (w // 2, rule_y + 28),
    body_font,
    INK_SOFT,
  )
  draw_centered_text(
    draw,
    'Your Hytale game install and instance data are left alone.',
    (w // 2, rule_y + 52),
    hint_font,
    MUTED,
  )
  draw_centered_text(
    draw,
    'Click Next to continue',
    (w // 2, h - 32),
    hint_font,
    MUTED,
  )

  save_nsis_bmp(img, path)


def save_nsis_bmp(img: Image.Image, path: Path) -> None:
  """Write 24-bit Windows BMP (no alpha) for NSIS MUI."""
  out = img.convert('RGB')
  # Ensure classic BI_RGB BMP via Pillow
  out.save(path, 'BMP')
  # Some NSIS builds are picky about headers — rewrite as uncompressed 24-bit
  rewrite_bmp24(path, out)
  print(f'wrote {path} ({out.size[0]}x{out.size[1]})')


def rewrite_bmp24(path: Path, img: Image.Image) -> None:
  """Force a plain 24-bit bottom-up BMP without color table."""
  w, h = img.size
  row_stride = (w * 3 + 3) & ~3
  pixel_bytes = bytearray()
  pixels = img.load()
  assert pixels is not None
  for y in range(h - 1, -1, -1):
    row = bytearray()
    for x in range(w):
      r, g, b = pixels[x, y]
      row.extend((b, g, r))
    row.extend(b'\x00' * (row_stride - w * 3))
    pixel_bytes.extend(row)

  file_size = 54 + len(pixel_bytes)
  header = struct.pack(
    '<2sIHHIIiiHHIIiiII',
    b'BM',
    file_size,
    0,
    0,
    54,
    40,
    w,
    h,
    1,
    24,
    0,
    len(pixel_bytes),
    2835,
    2835,
    0,
    0,
  )
  path.write_bytes(header + pixel_bytes)


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
  make_nsis_welcome_page(RESOURCES / 'installerWelcome.bmp')
  make_nsis_options_page(RESOURCES / 'installerOptions.bmp')
  make_nsis_finish_page(RESOURCES / 'installerFinish.bmp')
  make_nsis_unwelcome_page(RESOURCES / 'installerUnwelcome.bmp')
  make_ico(RESOURCES / 'icon.ico')


if __name__ == '__main__':
  main()
