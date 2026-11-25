#!/usr/bin/env python3
"""Build Shinobi-mon data from the Shinobi Showdown roster and the type sheet.

Inputs (tools/source/):
  showdown_shinobi.json  roster exported from Shinobi Showdown (stats, traits, transformations)
  showdown_jutsu.json    jutsu exported from Shinobi Showdown
  typechart.json         the 19-type chart (2x / 0.5x)
  shinobi_types.json     Type 1/2 for every shinobi and its transformation
  jutsu_types.json       types for jutsu that have no chakra nature
Outputs:
  shared/fighters.json, shared/moves.js, shared/megas.js, shared/genders.js,
  shared/typechart.json, server/engine/abilities.js
Run: python3 tools/build_shinobi.py
"""
import json, os, re, math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'source')
load = lambda n: json.load(open(os.path.join(SRC, n)))
SH = load('showdown_shinobi.json')
JU = load('showdown_jutsu.json')
TC = load('typechart.json')
ST = load('shinobi_types.json')
JT = load('jutsu_types.json')
ART = load('art.json')   # battle art per Shinobi Showdown id (copied into public/images)
TYPES = TC['types']

slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower().replace('ō', 'o').replace('ū', 'u')).strip('-')
fid = lambda sid: sid.replace('_', '-')

# ---------------------------------------------------------------- stats
def convert_stats(s):
    st = s['stats']
    spd = round(0.45 * st['def'] + 0.3 * st['nin'] + 0.12 * st['chk'])
    return {'hp': st['hp'], 'atk': st['tai'], 'def': st['def'], 'spa': st['nin'], 'spd': spd, 'spe': st['spd']}

def mega_stats(base, tf):
    """Transformed form: HP unchanged, +100 BST spread by the transformation's stat mods."""
    mods = (tf or {}).get('mods') or {}
    w = {'atk': 0, 'def': 0, 'spa': 0, 'spd': 0, 'spe': 0}
    for k, v in mods.items():
        d = max(0, v - 1)
        if k == 'tai': w['atk'] += d
        elif k == 'nin': w['spa'] += d
        elif k == 'spd': w['spe'] += d
        elif k == 'def': w['def'] += d / 2; w['spd'] += d / 2
    if sum(w.values()) == 0:
        if base['atk'] >= base['spa']: w['atk'] = 0.6
        else: w['spa'] = 0.6
        w['spe'] = 0.2; w['def'] = 0.1; w['spd'] = 0.1
    tot = sum(w.values())
    add = {k: int(100 * v / tot) for k, v in w.items()}
    rem = 100 - sum(add.values())
    for k in sorted(w, key=lambda k: -w[k])[:rem]: add[k] += 1
    out = dict(base)
    for k, v in add.items(): out[k] = min(255, out[k] + v)
    return out

# ---------------------------------------------------------------- abilities
# Each lore ability maps to engine effect keys (see server/engine/battle.js). Description is written from the spec.
T16 = 1 / 16
TRAIT = {
 'uzumakiVitality': {'residualHeal': T16},
 'kuramaLink': {'residualHeal': T16, 'noConfusion': True, 'statusImmune': ['slp']},
 'sharingan': {'infiltrator': True, 'mindsEye': True},
 'mangekyo': {'infiltrator': True, 'typeBoost': {'Fire': 1.2, 'Yin': 1.2}},
 'ems': {'infiltrator': True, 'noConfusion': True, 'statusImmune': ['slp'], 'typeBoost': {'Fire': 1.2}},
 'genjutsuTalent': {'typeBoost': {'Yin': 1.2}, 'noConfusion': True},
 'chakraControl': {'flagBoost': {'flag': 'punch', 'mult': 1.2}, 'healBoost': 1.5},
 'copyNinja': {'trace': True},
 'obitoGift': {'trace': True, 'noConfusion': True},
 'rootAgent': {'infiltrator': True},
 'suppression': {'vsType': {'Beast': 1.5, 'Sage': 1.5}},
 'byakugan': {'mindsEye': True, 'critBonus': 1},
 'noNinjutsu': {'flagBoost': {'flag': 'contact', 'mult': 1.3}},
 'weaponMistress': {'typeBoost': {'Weapon': 1.2}, 'skillLink': True},
 'akamaru': {'parentalBond': True},
 'kikaichu': {'drainAll': 0.125},
 'strategist': {'analytic': True},
 'akimichi': {'ripen': True},
 'yamanaka': {'typeBoost': {'Yin': 1.3}},
 'genjutsuMistress': {'sereneGrace': True},
 'chakraBlades': {'flagBoost': {'flag': 'slicing', 'mult': 1.3}},
 'sandShield': {'fullHpTaken': 0.5},
 'galeMastery': {'typeBoost': {'Wind': 1.2}},
 'puppetMaster': {'contactStatus': {'status': 'psn', 'chance': 30}},
 'bodyShedding': {'surviveOnce': True},
 'medicalSpy': {'residualHeal': T16, 'healBoost': 1.5},
 'whiteSnakeSage': {'residualHeal': T16, 'mindsEye': True},
 'chakraEater': {'contactDrain': 0.25},
 'sixArms': {'skillLink': True},
 'twinDemons': {'parentalBond': True},
 'demonFlute': {'attackStatus': {'type': 'Yin', 'status': 'par', 'chance': 30}},
 'deadBone': {'catTaken': {'Physical': 0.8}, 'roughSkin': 0.125},
 'silentKilling': {'critBonus': 1},
 'iceMirrors': {'disguise': True, 'disguiseText': 'was only a reflection in the ice mirrors, and the attack missed!'},
 'snakeMistress': {'attackStatus': {'status': 'psn', 'chance': 20}},
 'izanagi': {'phoenix': {'heal': 0.25}},
 'kamuiPhase': {'disguise': True, 'disguiseText': 'phased through the attack with Kamui!'},
 'sporeSpy': {'freeSubOnce': True},
 'groundMerge': {'disguise': True, 'disguiseText': 'sank into the ground and the attack missed!'},
 'samehada': {'contactDrain': 0.25},
 'itachiGenius': {'infiltrator': True, 'typeBoost': {'Yin': 1.2}},
 'artExplosion': {'typeBoost': {'Explosion': 1.2}, 'catTaken': {'Physical': 0.8}},
 'jashin': {'magicGuard': True, 'surviveOnce': True},
 'fiveHearts': {'onKOHeal': 0.25},
 'humanPuppet': {'statusImmune': ['psn', 'tox', 'slp'], 'noConfusion': True, 'contactStatus': {'status': 'psn', 'chance': 30}},
 'paperBody': {'disguise': True, 'disguiseText': 'scattered into paper and the attack missed!'},
 'rinnegan': {'catTaken': {'Special': 0.75}, 'mindsEye': True},
 'reanimated': {'residualHeal': T16, 'statusImmune': ['psn', 'tox']},
 'hydrification': {'catTaken': {'Physical': 0.75}},
 'kaguraSensing': {'mindsEye': True, 'healer': 30},
 'berserker': {'thresholdEntry': {'below': 0.5, 'boosts': {'atk': 1}}},
 'hashiramaCells': {'residualHeal': T16},
 'sensoryGenius': {'anticipationBoost': {'spe': 1}},
 'professor': {'protean': True},
 'ftg': {'firstMovePrio': True},
 'legendaryMedic': {'healBoost': 1.5, 'healer': 30},
 'pervertSpy': {'frisk': True},
 'lightningArmor': {'allTaken': 0.9, 'flagBoost': {'flag': 'contact', 'mult': 1.2}},
 'perfectJinchuriki': {'residualHeal': T16, 'noConfusion': True, 'statusImmune': ['slp']},
 'blackLightning': {'attackStatus': {'type': 'Lightning', 'status': 'par', 'chance': 20}},
 'twoKekkei': {'typeBoost': {'Lava': 1.2, 'Boil': 1.2}},
 'twinBlades': {'flagBoost': {'flag': 'slicing', 'mult': 1.3}},
 'coralShell': {'filter': 0.75},
 'levitation': {'catTaken': {'Physical': 0.8}},
 'quicklime': {'bindingBand': {'mult': 2, 'turns': 7}},
 'rockSolid': {'allTaken': 0.85},
 'invisibility': {'disguise': True, 'disguiseText': 'was invisible, and the attack missed!'},
 'endlessChakra': {'residualHeal': T16, 'statusImmune': ['psn', 'tox'], 'pressure': True},
 'rinneMadara': {'mindsEye': True, 'noConfusion': True, 'statusImmune': ['slp'], 'parentalBond': True},
 'progenitor': {'drainAll': 0.125, 'noConfusion': True},
 'luckySeven': {'sereneGrace': True},
 'corrosiveBubbles': {'attackFoeBoost': {'chance': 30, 'boosts': {'def': -1}}},
 'steamArmor': {'contactStatus': {'status': 'brn', 'chance': 30}},
 'volcanicBody': {'statusImmune': ['brn'], 'attackStatus': {'type': 'Lava', 'status': 'brn', 'chance': 20}},
 'catReflexes': {'startBoostOnce': {'spe': 1}},
 'poisonSac': {'statusImmune': ['psn', 'tox'], 'attackStatus': {'status': 'psn', 'chance': 20}},
 'protectiveInstinct': {'forceField': {'ally': 0.75, 'self': 0.9}},
 'willOfFire': {'allyFaintBoost': {'atk': 1, 'spa': 1}},
 'iaiMaster': {'flagCrit': 'slicing', 'sniper': True},
 'goldDust': {'attackFoeBoost': {'chance': 30, 'boosts': {'spe': -1}}},
 'bodyFlicker': {'firstMovePrio': True, 'infiltrator': True},
}

# Hidden abilities come from each shinobi's Shinobi Showdown support passive (name kept, mechanic made personal).
def aura_spec(sh):
    e = sh['supportAura']['effects'][0]['type']
    t1 = ST[sh['id']]['types'][0]
    return {
     'resolve': {'sturdy': True}, 'decoyChance': {'freeSubOnce': True}, 'chakra': {'regenerator': True},
     'heal': {'residualHeal': T16}, 'stat': {'intimidate': True}, 'crit': {'critBonus': 1}, 'execute': {'executioner': 1.3},
     'genjutsuResist': {'noConfusion': True, 'statusImmune': ['slp']}, 'dr': {'filter': 0.75}, 'subDiscount': {'regenerator': True},
     'enemyIntel': {'frisk': True}, 'aoeDR': {'forceField': {'ally': 0.75, 'self': 0.9}}, 'dodge': {'disguise': True},
     'pierce': {'infiltrator': True}, 'lowHpDR': {'sturdy': True}, 'kunai': {'skillLink': True},
     'taiDamage': {'flagBoost': {'flag': 'contact', 'mult': 1.2}}, 'focus': {'critBonus': 1}, 'enemyDrain': {'drainAll': 0.125},
     'controlChance': {'sereneGrace': True}, 'protectWeakest': {'forceField': {'ally': 0.75, 'self': 0.9}}, 'intel': {'frisk': True},
     'natureBoost': {'typeBoost': {t1: 1.2}}, 'aoeBoost': {'typeBoost': {t1: 1.2}}, 'poisonChance': {'attackStatus': {'status': 'psn', 'chance': 20}},
     'cleanseChance': {'naturalCure': True}, 'resolveDiscount': {'regenerator': True}, 'koIntel': {'onKOHeal': 0.25},
     'poisonPower': {'attackStatus': {'status': 'psn', 'chance': 30}}, 'gatherBonus': {'frisk': True},
    }[e]
AURA_OVERRIDE = {
 'lee_p1': {'speedBoost': True}, 'hidan': {'onKO': {'atk': 1}}, 'gaara_p1': {'fullHpTaken': 0.5},
 'sasuke_war': {'onKO': {'atk': 1, 'spa': 1}}, 'kakashi_dms': {'allyCrit': 1, 'switchGift': {'spe': 1}},
 'nagato_pain': {'intimidate': True, 'catTaken': {'Physical': 0.9}},
}

# Transformation abilities, picked by the transformation's name.
def tf_ability(name, ftypes):
    n = name.lower()
    if "susano" in n: return {'allTaken': 0.8, 'typeBoost': {'Weapon': 1.2}}
    if 'curse mark' in n: return {'statMult': {'atk': 1.2, 'spa': 1.2}, 'attackRecoil': 0.1}
    if 'gate of death' in n: return {'speedBoost': True, 'flagBoost': {'flag': 'contact', 'mult': 1.3}, 'attackRecoil': 0.1}
    if 'gate' in n: return {'speedBoost': True, 'flagBoost': {'flag': 'contact', 'mult': 1.2}}
    if 'hundred' in n: return {'residualHeal': 1 / 8, 'flagBoost': {'flag': 'punch', 'mult': 1.3}}
    if 'mangek' in n or 'rinne' in n: return {'infiltrator': True, 'typeBoost': {'Yin': 1.3}}
    if 'sage' in n or 'six paths' in n: return {'typeBoost': {'Sage': 1.3}, 'mindsEye': True}
    if 'butterfly' in n: return {'adaptability': True}
    if 'pill' in n: return {'statMult': {'atk': 1.3}}
    if 'twin lion' in n: return {'flagBoost': {'flag': 'punch', 'mult': 1.3}}
    if 'wolf' in n: return {'parentalBond': True}
    if 'puppet' in n: return {'statusImmune': ['psn', 'tox', 'slp', 'brn'], 'contactStatus': {'status': 'psn', 'chance': 30}}
    if 'paper angel' in n: return {'typeBoost': {'Explosion': 1.3, 'Wind': 1.2}}
    if 'fusion' in n: return {'contactDrain': 0.25, 'typeBoost': {'Water': 1.2}}
    if 'death possession' in n: return {'contactDrain': 0.25, 'magicGuard': True}
    if 'masks' in n: return {'onKOHeal': 0.25, 'typeBoost': {'Earth': 1.2}}
    if 'branches' in n: return {'regenerator': True, 'typeBoost': {'Beast': 1.2}}
    if 'Beast' in ftypes: return {'typeBoost': {'Beast': 1.3}, 'residualHeal': T16}
    return {'typeBoost': {ftypes[0]: 1.3}}

ST_NAME = {'brn': 'burn', 'par': 'paralysis', 'psn': 'poison', 'tox': 'bad poison', 'slp': 'sleep', 'frz': 'freeze'}
STAT_LABEL = {'atk': 'Attack', 'def': 'Defense', 'spa': 'Sp. Atk', 'spd': 'Sp. Def', 'spe': 'Speed', 'accuracy': 'accuracy'}
def frac(x):
    for d in (2, 3, 4, 6, 8, 16):
        if abs(x - 1 / d) < 1e-6: return f'1/{d}'
    return f'{round(x * 100)}%'
def describe(s):
    out = []
    for k, v in s.items():
        if k == 'residualHeal': out.append(f'Restores {frac(v)} of its max HP at the end of every turn.')
        elif k == 'noConfusion': out.append("Can't be confused (genjutsu doesn't take hold).")
        elif k == 'statusImmune': out.append(f"Can't be {', '.join({'brn':'burned','par':'paralyzed','psn':'poisoned','tox':'badly poisoned','slp':'put to sleep','frz':'frozen'}[x] for x in v if x != 'tox' or 'psn' not in v)}.")
        elif k == 'infiltrator': out.append("Its moves go through Substitutes and screens.")
        elif k == 'mindsEye': out.append("Ignores the target's evasion boosts and its own accuracy drops.")
        elif k == 'typeBoost': out.append(' and '.join(f'{t}' for t in v) + f' moves deal {list(v.values())[0]}x damage.')
        elif k == 'flagBoost': out.append({'punch': 'Punching moves', 'contact': 'Contact moves', 'slicing': 'Slicing moves'}[v['flag']] + f" deal {v['mult']}x damage.")
        elif k == 'healBoost': out.append('Its healing moves restore 50% more HP.')
        elif k == 'trace': out.append("Copies the opposing shinobi's ability when it enters battle.")
        elif k == 'vsType': out.append('Deals ' + f"{list(v.values())[0]}x damage to " + ' and '.join(v) + '-type shinobi.')
        elif k == 'critBonus': out.append('Its moves are more likely to land critical hits.')
        elif k == 'skillLink': out.append('Multi-hit moves always hit the maximum number of times.')
        elif k == 'parentalBond': out.append('Its attacks hit a second time for 25% damage.')
        elif k == 'drainAll': out.append(f'Heals {frac(v)} of the damage its attacks deal.')
        elif k == 'contactDrain': out.append(f'Contact moves heal {frac(v)} of the damage dealt.')
        elif k == 'analytic': out.append('Deals 1.3x damage when it moves last.')
        elif k == 'ripen': out.append('Berries have double the effect.')
        elif k == 'sereneGrace': out.append("Its moves' added effects are twice as likely.")
        elif k == 'fullHpTaken': out.append('Takes half damage while at full HP.')
        elif k == 'contactStatus': out.append(f"Contact with it may cause {ST_NAME[v['status']]} ({v['chance']}%).")
        elif k == 'surviveOnce': out.append('Once per battle, survives a hit that would knock it out with 1 HP.')
        elif k == 'attackStatus': out.append((f"Its {v['type']} moves" if v.get('type') else 'Its attacks') + f" may cause {ST_NAME[v['status']]} ({v['chance']}%).")
        elif k == 'catTaken': out.append(' '.join(f'Takes {round((1 - m) * 100)}% less damage from {c.lower()} moves.' for c, m in v.items()))
        elif k == 'roughSkin': out.append(f'Attackers that make contact lose {frac(v)} of their max HP.')
        elif k == 'disguise': out.append('The first hit it takes in battle misses completely.')
        elif k == 'disguiseText': pass
        elif k == 'phoenix': out.append(f"Once per battle, when knocked out it gets back up with {round(v['heal'] * 100)}% HP.")
        elif k == 'freeSubOnce': out.append('The first time it enters battle, it sets up a Substitute (a clone) for free.')
        elif k == 'magicGuard': out.append('Only takes damage from attacks (no poison, burn, recoil or hazard damage).')
        elif k == 'onKOHeal': out.append(f'Restores {frac(v)} of its max HP whenever it knocks out a foe.')
        elif k == 'thresholdEntry': out.append('When its HP drops below half, its Attack rises by 1 stage.')
        elif k == 'anticipationBoost': out.append('On entry, raises its Speed if a foe has a super-effective move.')
        elif k == 'protean': out.append("Changes its type to the type of the move it's about to use.")
        elif k == 'firstMovePrio': out.append('Its first move after entering battle gets +1 priority.')
        elif k == 'healer': out.append('At the end of each turn, may cure an ally of a status condition (30%).')
        elif k == 'frisk': out.append("Reveals the foes' held items when it enters battle.")
        elif k == 'allTaken': out.append(f'Takes {round((1 - v) * 100)}% less damage from all attacks.')
        elif k == 'filter': out.append('Takes 25% less damage from super-effective attacks.')
        elif k == 'bindingBand': out.append('Its binding moves last longer and deal double damage.')
        elif k == 'pressure': out.append('Foes use 2 PP per move against it.')
        elif k == 'attackFoeBoost': out.append(f"Its attacks may lower the target's {STAT_LABEL[list(v['boosts'])[0]]} by 1 stage ({v['chance']}%).")
        elif k == 'startBoostOnce': out.append('Its Speed rises by 1 stage the first time it enters battle.')
        elif k == 'forceField': out.append('Allies take 25% less damage, and it takes 10% less.')
        elif k == 'allyFaintBoost': out.append('When an ally is knocked out, its Attack and Sp. Atk rise by 1 stage.')
        elif k == 'flagCrit': out.append('Slicing moves are more likely to land critical hits.')
        elif k == 'sniper': out.append('Critical hits deal 2.25x damage instead of 1.5x.')
        elif k == 'sturdy': out.append('At full HP, survives any single hit with 1 HP.')
        elif k == 'regenerator': out.append('Restores 1/3 of its max HP when it switches out.')
        elif k == 'intimidate': out.append("Lowers the foes' Attack by 1 stage when it enters battle.")
        elif k == 'executioner': out.append('Deals 1.3x damage to targets at half HP or less.')
        elif k == 'naturalCure': out.append('Its status condition is cured when it switches out.')
        elif k == 'speedBoost': out.append('Its Speed rises by 1 stage at the end of every turn.')
        elif k == 'onKO': out.append('Each knockout raises its ' + ' and '.join(STAT_LABEL[x] for x in v) + ' by 1 stage.')
        elif k == 'allyCrit': out.append("Raises allies' critical-hit chance.")
        elif k == 'switchGift': out.append('When it switches out, the incoming ally gets +1 Speed.')
        elif k == 'statMult': out.append(' and '.join(STAT_LABEL[x] for x in v) + f' are {list(v.values())[0]}x.')
        elif k == 'attackRecoil': out.append(f'Loses {frac(v)} of its max HP after each attack.')
        elif k == 'adaptability': out.append('Same-type attack bonus is 2x instead of 1.5x.')
        else: raise KeyError(k)
    return ' '.join(out)

# ---------------------------------------------------------------- jutsu -> moves
NAT = lambda n: n.capitalize() if n else None
def jutsu_type(j):
    if j.get('nature'): return NAT(j['nature'])
    if j['id'] in JT: return JT[j['id']]
    return 'Taijutsu' if j['category'] == 'taijutsu' else 'Yin'

NONCONTACT = re.compile(r'shuriken|kunai|senbon|needle|arrow|bow|bullet|missile|tag|bomb|throw|thread|chain|volley|puppet|crow|hound|summon|insect|smoke|flash|dragons|puppets|mother|iron maiden|machine|web|shot|dust|cannon', re.I)
PUNCH = re.compile(r'fist|punch|palm|lotus|combo|knuckle|shannaro|impact|boulder|arhat|flurry|habanero', re.I)
KICK = re.compile(r'kick|foot|whirlwind|hurricane|dynamic entry|rising wind|night guy', re.I)
SLICE = re.compile(r'sword|blade|slash|kusanagi|scythe|iai|cleaver|kenjutsu|beheading|tant|dance of|axe|kusarigama|samehada|swords', re.I)
BITE = re.compile(r'fang|bite|jaw|shark', re.I)
STAT = {'tai': 'atk', 'nin': 'spa', 'def': 'def', 'spd': 'spe'}

# Quick-Attack / Aqua Jet style +1 (weak, fast strikes) and one Extreme Speed style +2.
# Protect-style moves get +4 and bodyguard moves +2 where they're converted below.
PRIORITY = {'shuriken_volley': 1, 'senbon_volley': 1, 'poison_needles': 1, 'explosive_tag_kunai': 1,
            'hair_needles': 1, 'dynamic_entry': 1, 'ftg_strike': 2}
OVERRIDE = {'ftg_strike': {'power': 80, 'pp': 5}}   # Extreme Speed numbers

def r5(x): return int(5 * round(x / 5))
def convert_move(j, used_names):
    name = j['name']
    if name in used_names: name = f"{name} ({j['id']})"
    used_names.add(name)
    t = jutsu_type(j)
    eff = j.get('effects') or []
    power = j.get('power') or 0
    cat = 'Status' if power == 0 else ('Physical' if j['category'] == 'taijutsu' else 'Special')
    o = {}
    # Turn order works like Pokémon: Speed decides, and only a few very quick jutsu get priority (see PRIORITY).
    o['prio'] = PRIORITY.get(j['id'], 0)
    if cat != 'Status':
        cap = 160 if j.get('charged') else 150
        power = max(20, min(cap, r5(power * 0.85)))
    acc = 100
    if cat != 'Status' and power >= 150 and not j.get('charged'): acc = 85
    elif cat != 'Status' and power >= 120 and not j.get('charged'): acc = 90
    pp = 5 if power >= 120 else 10 if power >= 90 else 15 if power >= 60 else 20
    if cat == 'Status': pp = 10
    tgt = {'enemy': None, 'allEnemies': 'allFoes', 'self': 'self', 'ally': 'self', 'allAllies': 'self'}[j['target']]
    sec = []
    if cat == 'Physical':
        if not NONCONTACT.search(name): o['contact'] = True
        if PUNCH.search(name): o['punch'] = True
        if KICK.search(name): o['kick'] = True
        if BITE.search(name): o['bite'] = True
    if SLICE.search(name) and cat == 'Physical': o['slicing'] = True
    if t == 'Wind' and cat == 'Special': o['wind'] = True
    if j.get('charged'): o['charge'] = True
    status_set = None
    boosts = None
    for e in eff:
        ty = e['type']; ch = round(e.get('chance', 1) * 100)
        st = {'burn': 'brn', 'poison': 'psn', 'paralyze': 'par', 'bind': 'par'}.get(ty)
        if st:
            if cat == 'Status': status_set = 'tox' if ty == 'poison' and ch >= 80 else st; acc = min(acc, 90 if st != 'brn' else 85)
            else: sec.append({'chance': max(10, min(100, ch)), 'status': st})
        elif ty == 'flinch':
            if cat == 'Status': o['special'] = 'attract' if j['id'] == 'sexy_jutsu' else 'confuse'
            else: sec.append({'chance': max(10, min(100, ch)), 'volatile': 'flinch'})
        elif ty == 'genjutsu':
            if cat == 'Status':
                if e.get('turns', 2) >= 3: status_set = 'slp'; acc = 75
                else: o['special'] = 'confuse'; acc = 90
            else: sec.append({'chance': 50 if e.get('turns', 2) >= 3 else 30, 'volatile': 'confusion'})
        elif ty in ('buff', 'debuff'):
            st2 = STAT.get(e['stat'], 'atk'); m = e.get('mult', 1)
            n = 2 if (m >= 1.45 or m <= 0.6) else 1
            if ty == 'buff':
                b = {st2: n}
                if st2 == 'def': b['spd'] = n
                if cat == 'Status': boosts = dict(boosts or {}, target='self', **b)
                else: o['selfBoost'] = dict(o.get('selfBoost', {}), **b)
            else:
                b = {st2: -n}
                if cat == 'Status':
                    boosts = dict(boosts or {}, target='foe', **b)
                else: sec.append({'chance': 100, 'boosts': b})
        elif ty == 'decoy': o['special'] = 'substitute'; tgt = 'self'
        elif ty == 'heal':
            if cat == 'Status':
                if j['target'] in ('ally', 'allAllies'): o['special'] = 'lifedew'
                else: o['heal'] = 0.5 if e['value'] >= 0.3 else 0.25
                tgt = 'self'
            else: o['drain'] = 0.5 if e['value'] >= 0.3 else 0.25
        elif ty == 'cleanse': o['special'] = 'healbell'; tgt = 'self'
        elif ty == 'drainChakra':
            if cat == 'Status': boosts = dict(boosts or {}, target='foe', spa=-1)
            else: sec.append({'chance': 100 if e['value'] >= 0.15 else 50, 'boosts': {'spa': -1}})
        elif ty in ('intel', 'revealLoadout'):
            if cat == 'Status' and 'special' not in o and not boosts and not status_set: o['special'] = 'laserfocus'; tgt = 'self'
        elif ty == 'pierce': o['crit'] = 1
        elif ty == 'recoil': o['recoil'] = 0.25 if e['value'] < 0.1 else 1 / 3
        elif ty == 'restoreChakra': o['heal'] = 0.25; tgt = 'self'
        elif ty == 'revive': o['special'] = 'revival'; tgt = 'self'; pp = 1
        elif ty == 'rotation': o['special'] = 'protect'; o['prio'] = 4; tgt = 'self'
        elif ty == 'bodyguard': o['special'] = 'followme'; o['prio'] = 2; tgt = 'self'
        elif ty == 'selfKO': o['special'] = 'explosion'; power = 200 if power < 200 else power
        elif ty == 'curseLink': o['special'] = 'destinybond'; tgt = 'self'
        elif ty == 'selfStab': o['special'] = 'painsplit'
        elif ty == 'bonusVsBound': o['special'] = 'hex'
        elif ty == 'selfVulnerable': o['selfBoost'] = dict(o.get('selfBoost', {}), **{'def': -1, 'spd': -1})
    ov = OVERRIDE.get(j['id'], {})
    power = ov.get('power', power); pp = ov.get('pp', pp)
    if sec: o['sec'] = sec
    if status_set: o['status'] = status_set
    if boosts:
        if boosts.get('target') == 'self': tgt = 'self'
        o['boosts'] = boosts
    if cat == 'Status' and not any(k in o for k in ('special', 'status', 'boosts', 'heal')):
        o['special'] = 'laserfocus'; tgt = 'self'
    if j.get('requiresTransform'): o['requiresForm'] = True
    if tgt: o['target'] = tgt
    o['jutsu'] = j['id']
    return name, (t, cat, power, acc, pp, o)

used = set()
MOVES = {}
JID2NAME = {}
for jid, j in JU.items():
    nm, mv = convert_move(j, used)
    MOVES[nm] = mv; JID2NAME[jid] = nm
UNIVERSAL = {
 'Kunai & Shuriken': ('Weapon', 'Physical', 40, 100, 30, {'prio': 1}),
 'Substitution Jutsu': ('Yin', 'Status', 0, True, 10, {'prio': 4, 'special': 'protect', 'target': 'self'}),
 'Body Flicker': ('Taijutsu', 'Physical', 70, 100, 20, {'contact': True, 'special': 'pivot'}),
}
MOVES.update(UNIVERSAL)

# ---------------------------------------------------------------- fighters, forms, genders
FEMALE = {'sakura', 'hinata', 'tenten', 'ino', 'kurenai', 'temari', 'chiyo', 'tayuya', 'anko', 'konan', 'karin', 'tsunade', 'karui',
          'mei', 'kurotsuchi', 'kaguya', 'fu', 'yugito', 'kushina', 'shizune'}
fighters, megas, genders = [], {}, {}
abil_specs = {}
item_names = {}
tf_names = {}
for s in SH:
    if s.get('transformation'): tf_names.setdefault(s['transformation']['name'], []).append(s['id'])
for i, s in enumerate(SH, 1):
    st = ST[s['id']]
    stats = convert_stats(s)
    ab_name = s['trait']['name']
    spec = TRAIT[s['trait']['id']]
    if ab_name in abil_specs and abil_specs[ab_name] != spec: ab_name = f"{ab_name} ({s['name'].split(' (')[0].split(' ')[0]})"
    abil_specs.setdefault(ab_name, spec)
    if abil_specs[ab_name] != spec: raise SystemExit('ability clash ' + ab_name)
    hid_name = s['supportAura']['name']
    hspec = AURA_OVERRIDE.get(s['id']) or aura_spec(s)
    if hid_name == ab_name or hid_name in abil_specs and abil_specs[hid_name] != hspec:
        hid_name = hid_name + ' (Spirit)'
    abil_specs.setdefault(hid_name, hspec)
    learn = [JID2NAME[j] for j in s['catalogue']] + list(UNIVERSAL)
    sp = (s.get('_sprite') or {})
    f = {
        'num': i, 'id': fid(s['id']), 'baseId': s['baseId'], 'name': s['name'], 'series': s['era'], 'role': ' / '.join(s['roles']),
        'types': st['types'], 'stats': stats,
        'abilities': [{'name': ab_name, 'desc': describe(spec)}],
        'hidden': {'name': hid_name, 'desc': describe(hspec)},
        'signature': [{'move': JID2NAME[j], 'smash': JU[j]['name']} for j in s['catalogue']],
        'learnset': learn, 'chakraNatures': [n for n in [s['natures'].get('primary'), s['natures'].get('secondary')] if n],
        'notes': st['why'], 'image': ART.get(s['id'], {}).get('front'),
    }
    fighters.append(f)
    base_name = s['baseId']
    genders[f['id']] = {'type': 'F' if base_name in FEMALE else 'M'}
    tf = s.get('transformation')
    if tf:
        ft = st['formTypes']
        item = tf['name'] if len(tf_names[tf['name']]) == 1 else f"{tf['name']} ({s['name'].split(' (')[0].split(' ')[0]})"
        if item in item_names: item = f"{tf['name']} ({s['name'].split(' (')[0].split(' ')[0]}, {s['era']})"
        if item in item_names: raise SystemExit('dup item ' + item)
        item_names[item] = 1
        aspec = tf_ability(tf['name'], ft)
        aname = tf['name']
        if aname in abil_specs and abil_specs[aname] != aspec: aname = item
        abil_specs.setdefault(aname, aspec)
        megas[item] = {'base': f['id'], 'id': f['id'] + '-' + slug(tf['name']), 'name': f"{s['name'].split(' (')[0]} ({tf['name']})",
                       'types': ft, 'stats': mega_stats(stats, tf), 'image': ART.get(s['id'], {}).get('transform'), 'ability': {'name': aname, 'desc': describe(aspec)}}
        genders[megas[item]['id']] = dict(genders[f['id']])

# ---------------------------------------------------------------- write
def js(v): return json.dumps(v, ensure_ascii=False)
out = os.path.join(ROOT, 'shared')
json.dump(fighters, open(os.path.join(out, 'fighters.json'), 'w'), indent=1, ensure_ascii=False)
open(os.path.join(out, 'typechart.js'), 'w').write('// GENERATED by tools/build_shinobi.py from tools/source/typechart.json\n(function () {\n  const TC = ' + json.dumps(TC) + ';\n  if (typeof module !== "undefined") module.exports = TC;\n  if (typeof window !== "undefined") window.TYPECHART = TC;\n})();\n')

lines = ['// Shinobi-mon move database: every Shinobi Showdown jutsu as a Pokémon-style move. GENERATED by tools/build_shinobi.py.',
         '// m(name, type, category, power, accuracy (true = never misses), pp, options). Option keys are the ones the engine reads',
         '// (prio, contact, punch, kick, slicing, bite, wind, sec, selfBoost, recoil, drain, charge, status, boosts, heal, special, target).',
         '// requiresForm: only usable after the shinobi transforms. jutsu: its Shinobi Showdown id. Tooltips are written from the data by shared/movetext.js.',
         'const MOVES = {};',
         'function m(name, type, cat, power, acc, pp, o = {}) { MOVES[name] = Object.assign({ name, type, cat, power, acc, pp, prio: 0 }, o); }']
for nm, (t, cat, pw, acc, pp, o) in sorted(MOVES.items(), key=lambda kv: (TYPES.index(kv[1][0]), kv[0])):
    lines.append(f"m({js(nm)}, {js(t)}, {js(cat)}, {pw}, {'true' if acc is True else acc}, {pp}, {js(o)});")
lines += ["m('Recharge', 'Taijutsu', 'Status', 0, true, 1, { special: 'rechargeturn', target: 'self' });",
          "for (const mv of Object.values(MOVES)) {",
          "  if (mv.target) continue;",
          "  if (mv.cat === 'Status') mv.target = (mv.boosts && mv.boosts.target === 'self') || mv.heal ? 'self' : (mv.boosts && mv.boosts.target === 'foe') || mv.status || mv.special === 'confuse' || mv.special === 'attract' ? 'normal' : 'self';",
          "  else mv.target = 'normal';",
          "}",
          "if (typeof module !== 'undefined') module.exports = MOVES;",
          "if (typeof window !== 'undefined') window.MOVES_DB = MOVES;"]
open(os.path.join(out, 'moves.js'), 'w').write('\n'.join(lines) + '\n')

mg = ['// Transformations (Mega-style). GENERATED by tools/build_shinobi.py.',
      '// A shinobi holding its transformation scroll can transform once per battle (one per team), before it moves.',
      '// HP stays the same; stats (+100 BST), types and ability change for the rest of the battle.',
      '(function () {',
      '  const FINAL_SMASHES = ' + json.dumps(megas, indent=1, ensure_ascii=False).replace('\n', '\n  ') + ';',
      '  const FORMS = {};',
      '  for (const [stone, f] of Object.entries(FINAL_SMASHES)) { f.stone = stone; f.image = f.image || null; f.bases = [].concat(f.base); f.base = f.bases[0]; }',
      '  const byBase = {};',
      '  for (const f of Object.values(FINAL_SMASHES)) for (const b of f.bases) (byBase[b] = byBase[b] || []).push(f);',
      '  const api = { FINAL_SMASHES, FINAL_SMASH_BY_BASE: byBase, FORMS, isStone: item => !!FINAL_SMASHES[item], worksFor: (fs, id) => !!fs && fs.bases.includes(id) };',
      "  if (typeof module !== 'undefined') module.exports = api;",
      "  if (typeof window !== 'undefined') window.MEGAS = api;",
      '})();']
open(os.path.join(out, 'megas.js'), 'w').write('\n'.join(mg) + '\n')

g = open(os.path.join(out, 'genders.js')).read()
g = re.sub(r'const GENDERS = \{.*?\n  \};', 'const GENDERS = ' + json.dumps(genders, indent=1).replace('\n', '\n  ') + ';', g, count=1, flags=re.S)
open(os.path.join(out, 'genders.js'), 'w').write(g)

ab = ['// Ability specs. GENERATED by tools/build_shinobi.py. Each ability name maps to effect keys the battle engine reads.',
      '// Descriptions players see are in shared/fighters.json and shared/megas.js.',
      'const A = {};']
for n, sp in sorted(abil_specs.items()):
    ab.append(f'A[{js(n)}] = {js(sp)};')
ab.append('module.exports = A;')
open(os.path.join(ROOT, 'server', 'engine', 'abilities.js'), 'w').write('\n'.join(ab) + '\n')

bst = sorted((sum(f['stats'].values()), f['name']) for f in fighters)
print(f'{len(fighters)} shinobi, {len(megas)} transformations, {len(MOVES)} moves, {len(abil_specs)} abilities')
print('BST low', bst[:3], 'high', bst[-3:])
