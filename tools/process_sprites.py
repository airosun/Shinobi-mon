#!/usr/bin/env python3
"""Turn hand-drawn fighter sprites into game-ready battle sprites.

Uploads can either already be transparent (used exactly as drawn) or sit on a plain white
background (the white is removed as described below). Either way the sprite is cropped, scaled
and placed on the shared ground line.

  python3 tools/process_sprites.py              # process everything in public/sprites-raw/
  python3 tools/process_sprites.py thor storm   # only files whose name starts with these IDs

Input:  public/sprites-raw/<id>_front.png and <id>_back.png
        alternate genders: <id>_female_front.png / <id>_male_back.png
        battle forms use the form ID: bruce-banner_front.png
Output: public/sprites/<same name>.png, a 640x480 (4:3) transparent PNG with the fighter centered and its
        feet on a shared ground line, so every fighter stands on its platform the same way.
        Size is kept relative to the drawing's canvas: draw every fighter on the same canvas size
        (for example 512x512), filling it for the biggest fighters, and their sizes stay in proportion.

How the white is removed (white-background uploads only):
  1. Only white connected to the edge of the picture is removed (a flood fill from the border), so
     white inside the fighter (eyes, teeth, a white body) stays, as long as the outline closes it in.
  2. The soft light-gray halo where the drawing meets the background is turned into partial
     transparency ("color to alpha" against white), so edges stay smooth with no white fringe.
  3. Tiny leftover specks are dropped, the sprite is cropped, scaled to fit and placed on the ground line.
"""
import json, os, re, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'public', 'sprites-raw')
OUT = os.path.join(ROOT, 'public', 'sprites')
CANVAS_W, CANVAS_H = 640, 480   # output size (4:3, so wide fighters aren't shrunk to fit); sharp on phones
MAX_W, MAX_H = 600, 450
HOVER_CENTER = 468 - 450 // 2   # flyers float with their middle where a full-height fighter's middle is
OVERRIDES = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sprite_overrides.json')
GROUND = 468          # y of the feet line
WHITE = 228           # a pixel counts as background white when all channels are at least this...
GRAY_SPREAD = 28      # ...and it is nearly gray (max - min channel)
FRINGE = 2            # px of edge softening next to removed background

def valid_ids():
    fighters = json.load(open(os.path.join(ROOT, 'shared', 'fighters.json')))
    ids = {f['id'] for f in fighters}
    megas = open(os.path.join(ROOT, 'shared', 'megas.js')).read()
    ids |= set(re.findall(r"id: '([a-z0-9-]+)'", megas))
    # looks that only change the sprite in battle, not the hero (The Hood's Half-Demon State)
    ids |= {'the-hood-half-demon-form'}
    return ids

NAME = re.compile(r'^([a-z0-9-]+?)(?:_(female|male))?_(front|back)\.png$')

def already_transparent(im):
    """True when the upload already has a transparent background (a real alpha channel that clears
    a good share of the picture). Those are used as drawn: no white removal at all."""
    if im.mode not in ('RGBA', 'LA', 'P', 'PA') and 'transparency' not in im.info: return False
    a = np.asarray(im.convert('RGBA').getchannel('A'))
    return (a == 0).mean() >= 0.05

def overrides():
    try: return {k: v for k, v in json.load(open(OVERRIDES)).items() if not k.startswith('_')}
    except FileNotFoundError: return {}

def process(path, opts=None):
    opts = opts or {}
    im = Image.open(path)
    if opts.get('crop'):   # keep only part of the original (e.g. drop a long smoke trail)
        l, t, r, b = opts['crop']; W, H = im.size
        im = im.crop((round(l * W), round(t * H), round(r * W), round(b * H)))
    if already_transparent(im):
        rgba = np.asarray(im.convert('RGBA')).astype(np.float32)
        out, alpha = rgba[..., :3], rgba[..., 3] / 255.0
        bg = alpha == 0
    else:
        out, alpha, bg = remove_white(im)
    # drop specks: keep only reasonably large opaque blobs
    solid = alpha > 0.1
    lab, n = ndimage.label(solid)
    if n > 1:
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= max(30, sizes.max() * 0.002)])
        # faint glow (alpha <= 0.1) right next to a kept blob stays; isolated specks go
        near_keep = ndimage.binary_dilation(keep, iterations=6)
        alpha = np.where(keep | ((alpha <= 0.1) & near_keep), alpha, 0)
    return place(out, alpha, opts.get('hover')), bg.mean()

def remove_white(im):
    if im.mode in ('RGBA', 'LA', 'P'):   # flatten any partial transparency onto white first
        im = im.convert('RGBA'); bg = Image.new('RGBA', im.size, (255, 255, 255, 255)); bg.alpha_composite(im); im = bg
    rgb = np.asarray(im.convert('RGB')).astype(np.float32)
    lo, hi = rgb.min(axis=2), rgb.max(axis=2)
    whiteish = (lo >= WHITE) & (hi - lo <= GRAY_SPREAD)
    # background = white regions that touch the border
    labels, _ = ndimage.label(whiteish)
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    bg = np.isin(labels, edge[edge > 0])
    alpha = np.where(bg, 0.0, 1.0)
    # soften the edge: near the background, light pixels become partly transparent (color to alpha)
    near = ndimage.binary_dilation(bg, iterations=FRINGE) & ~bg
    a = np.clip((255.0 - lo) / 255.0, 0, 1)            # how far from white the darkest channel is
    a = np.clip(a / 0.35, 0, 1)                         # anything clearly colored stays fully opaque
    alpha = np.where(near, np.minimum(alpha, a), alpha)
    out = rgb.copy()
    safe = np.maximum(alpha, 1e-3)[..., None]
    unmixed = 255.0 - (255.0 - rgb) / safe              # remove the white that was mixed into fringe pixels
    out = np.where(near[..., None], np.clip(unmixed, 0, 255), out)
    return out, alpha, bg

def place(out, alpha, hover=False):
    rgba = np.dstack([out, alpha * 255]).astype(np.uint8)
    sprite = Image.fromarray(rgba, 'RGBA')
    box = sprite.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    if not box: raise ValueError('nothing left after removing the background (is the background really white or transparent?)')
    # standardized size: every fighter is cropped to its outline and scaled to fill the same box,
    # whatever size the uploaded image is
    sprite = sprite.crop(box)
    scale = min(MAX_W / sprite.width, MAX_H / sprite.height)
    sprite = sprite.resize((max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    top = HOVER_CENTER - sprite.height // 2 if hover else GROUND - sprite.height
    canvas.alpha_composite(sprite, ((CANVAS_W - sprite.width) // 2, top))
    return canvas

def write_manifest():
    """public/sprites/manifest.json: how tall each fighter stands in its sprite (fraction of the canvas).
    The game uses it to crop the same share off the bottom of every back view."""
    out = {}
    for name in sorted(os.listdir(OUT)):
        if not name.endswith('.png'): continue
        box = Image.open(os.path.join(OUT, name)).getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
        if box: out[name[:-4]] = round((GROUND - box[1]) / CANVAS_H, 3)
    out['_hover'] = sorted(k for k, v in overrides().items() if v.get('hover'))   # flyers: the back view floats instead of being cut
    with open(os.path.join(OUT, 'manifest.json'), 'w') as fh: json.dump(out, fh, separators=(',', ':'))

def main(only):
    os.makedirs(OUT, exist_ok=True)
    if not os.path.isdir(RAW): print('No public/sprites-raw folder yet.'); return 0
    ids = valid_ids(); done = 0; problems = []; ov = overrides()
    for name in sorted(os.listdir(RAW)):
        if name.startswith('.') or name.lower() == 'readme.md' or os.path.isdir(os.path.join(RAW, name)): continue
        m = NAME.match(name.lower().replace(' ', '-'))
        if not m: problems.append(f'{name}: name should look like thor_front.png, thor_back.png or loki_female_front.png'); continue
        if m.group(1) not in ids: print(f'wait {name}  ("{m.group(1)}" is not a hero or form yet; kept for later, e.g. an Ultimate)'); continue
        if only and not any(m.group(1).startswith(o) for o in only): continue
        try:
            img, bgshare = process(os.path.join(RAW, name), ov.get(name.lower()[:-4]))
            img.save(os.path.join(OUT, name.lower().replace(' ', '-')), optimize=True)
            done += 1
            kind = 'transparent' if already_transparent(Image.open(os.path.join(RAW, name))) else 'white bg removed'
            note = '  (little background found: check the background is white and touches the edges)' if bgshare < 0.15 else ''
            print(f'ok   {name}  [{kind}]{note}')
        except Exception as e:
            problems.append(f'{name}: {e}')
    for p in problems: print('skip', p)
    write_manifest()
    print(f'{done} sprite(s) written to public/sprites/')
    return 1 if problems else 0

if __name__ == '__main__':
    sys.exit(main([a.lower() for a in sys.argv[1:]]))
