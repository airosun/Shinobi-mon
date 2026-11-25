"""Builds shared/fighters.json (the hero data the engine and site read) from the design sheet export
in tools/source/ (heroes.json, abilities.json, movepools.json).
Run: python3 tools/build_heroes.py   (validates every move against shared/moves.js)

Every hero also gets Protect (VGC staple) unless its pool already has it.
Battle-only forms (Bruce Banner) live in shared/megas.js FORMS, not in this list.
"""
import json, os, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'source')
heroes = json.load(open(os.path.join(SRC, 'heroes.json')))
abil = {a['name']: a for a in json.load(open(os.path.join(SRC, 'abilities.json')))}
pools = json.load(open(os.path.join(SRC, 'movepools.json')))
UNIVERSAL = ['Protect']

out = []
for h in heroes:
    if h.get('battleOnly'):
        continue
    mine = [p for p in pools if p['hero'] == h['name']]
    learn = [p['move'] for p in mine]
    for u in UNIVERSAL:
        if u not in learn:
            learn.append(u)
    sig = [{'move': p['move'], 'smash': p['basedOn']} for p in mine if p['basedOn']][:6]
    a0, ah = abil[h['abilities']['0']], abil[h['abilities']['H']]
    out.append({
        'num': h['num'], 'id': h['id'], 'name': h['name'], 'series': h['role'], 'role': h['role'],
        'types': h['types'], 'stats': h['baseStats'], 'inGameHP': h['inGameHP'],
        'abilities': [{'name': a0['name'], 'desc': a0['desc']}],
        'hidden': {'name': ah['name'], 'desc': ah['desc']},
        'signature': sig, 'learnset': learn, 'notes': '',
        # official art: public/images/<id>.webp (or .png/.jpg) (until it exists the site shows a type-colored badge)
        'image': next((f"{h['id']}.{ext}" for ext in ('webp', 'png', 'jpg') if os.path.exists(os.path.join(ROOT, 'public', 'images', f"{h['id']}.{ext}"))), None),
    })

js = "const M=require('./shared/moves.js');const L=" + json.dumps(sorted({m for f in out for m in f['learnset']})) + ";console.log(JSON.stringify(L.filter(n=>!M[n])))"
missing = json.loads(subprocess.check_output(['node', '-e', js], cwd=ROOT))
if missing:
    print('Moves missing from shared/moves.js:', ', '.join(missing)); sys.exit(1)
json.dump(out, open(os.path.join(ROOT, 'shared', 'fighters.json'), 'w'), indent=1, ensure_ascii=False)
print(f'wrote {len(out)} heroes')
