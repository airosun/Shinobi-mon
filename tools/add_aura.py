#!/usr/bin/env python3
"""Make a transformation sprite from a base sprite by adding a glowing aura behind it.
Usage: python3 tools/add_aura.py <base.webp> <out.webp> <hex color> [dark]
'dark' gives a darker, smokier aura and dims the sprite slightly."""
import sys
from PIL import Image, ImageFilter, ImageChops, ImageEnhance

src, out, color = sys.argv[1], sys.argv[2], sys.argv[3]
dark = len(sys.argv) > 4 and sys.argv[4] == 'dark'
rgb = tuple(int(color.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4))
im = Image.open(src).convert('RGBA')
pad = 28
W, H = im.width + 2 * pad, im.height + 2 * pad
base = Image.new('RGBA', (W, H)); base.paste(im, (pad, pad), im)
alpha = base.split()[3]

def glow(radius, grow, strength):
    a = alpha.filter(ImageFilter.MaxFilter(grow)).filter(ImageFilter.GaussianBlur(radius))
    a = a.point(lambda v: min(255, int(v * strength)))
    layer = Image.new('RGBA', (W, H), rgb + (0,)); layer.putalpha(a)
    return layer

aura = Image.new('RGBA', (W, H))
aura = Image.alpha_composite(aura, glow(18, 15, 0.9 if dark else 0.8))   # wide soft haze
aura = Image.alpha_composite(aura, glow(6, 7, 1.6 if dark else 1.4))     # bright edge close to the body
sprite = base
if dark:   # a slight shadow over the body for the cursed look
    rgbpart = ImageEnhance.Brightness(base.convert('RGB')).enhance(0.85)   # dim colors only, keep transparency
    sprite = rgbpart.convert('RGBA'); sprite.putalpha(alpha)
    tint = Image.new('RGBA', (W, H), rgb + (0,)); tint.putalpha(alpha.point(lambda v: int(v * 0.18)))
    sprite = Image.alpha_composite(sprite, tint)
else:      # a faint warm rim of sage chakra
    tint = Image.new('RGBA', (W, H), rgb + (0,)); tint.putalpha(alpha.point(lambda v: int(v * 0.08)))
    sprite = Image.alpha_composite(sprite, tint)
res = Image.alpha_composite(aura, sprite)
res.save(out, 'WEBP', quality=92, method=6)
print('saved', out, res.size)
