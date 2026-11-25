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
# Abilities are hand-designed per shinobi in tools/ability_design.py (ability, hidden ability, transformation ability).
import sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ability_design import A as DESIGN
T16 = 1 / 16

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
        elif k == 'flagBoost': out.append({'punch': 'Punching moves', 'contact': 'Contact moves', 'slicing': 'Slicing moves', 'kick': 'Kicking moves', 'bite': 'Biting moves'}[v['flag']] + f" deal {v['mult']}x damage.")
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
        elif k == 'healer': out.append(f'At the end of each turn, may cure itself or an ally of a status condition ({v}%).')
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
        elif k == 'lastOneBoost': out.append(f"Its moves deal {v}x damage when it's the last shinobi standing on its team.")
        elif k == 'cheapSub': out.append('Making a Substitute only costs 1/8 of its max HP.')
        elif k == 'natRegen': out.append('Restores 1/16 of its max HP at the end of each turn while above half HP.')
        elif k == 'longReach': out.append("Its attacks never make contact, so contact abilities and Rocky Helmet don't hurt it.")
        elif k == 'cursedBody': out.append(f"When hit by a move, may disable that move for the attacker ({v}%).")
        elif k == 'onStatDrop': out.append('When a foe lowers its stats, its ' + ' and '.join(STAT_LABEL[x] for x in v) + f" rise{'s' if len(v) == 1 else ''} by {list(v.values())[0]} stages.")
        elif k == 'lowHpPower': out.append(f'Its moves deal {v}x damage while it is at 1/3 HP or less.')
        elif k == 'moldBreaker': out.append("Its moves ignore the target's ability.")
        elif k == 'angerPoint': out.append('Taking a critical hit maxes out its Attack.')
        elif k == 'hitByType': out.append(f"When hit by a {v['type']} move, raises its " + ' and '.join(STAT_LABEL[x] for x in v['boosts']) + ' by 1 stage.')
        elif k == 'statusMoveHeal': out.append(f'Restores {frac(v)} of its max HP each time it uses a status move.')
        elif k == 'switchOutWish': out.append(f'When it switches out, the ally that comes in restores {frac(v)} of its max HP.')
        elif k == 'colorChange': out.append("Changes its type to the type of the move that just hit it.")
        elif k == 'unaware': out.append("Ignores its opponents' stat changes when attacking and being attacked.")
        elif k == 'noIntimidate': out.append("Can't be intimidated.")
        elif k == 'clearBody': out.append("Foes can't lower its stats.")
        elif k == 'startSide': out.append({'reflect': 'On entry, sets up Reflect (halves physical damage) for its side for 5 turns.', 'lightscreen': 'On entry, sets up Light Screen (halves special damage) for its side for 5 turns.', 'tailwind': "On entry, whips up a tailwind that doubles its side's Speed for 4 turns.", 'auroraveil': 'On entry, raises a barrier that cuts all damage to its side for 5 turns.'}[v['cond']])
        elif k == 'clearFoeBoosts': out.append("On entry, erases all of the foes' stat changes.")
        elif k == 'protectSelfBoost': out.append('When it blocks an attack with a protecting move, its ' + ' and '.join(STAT_LABEL[x] for x in v) + ' rise by 1 stage.')
        elif k == 'afterFirstMoveBoost': out.append('After its first move of the battle, its ' + ' and '.join(STAT_LABEL[x] for x in v) + f' rise by {list(v.values())[0]} stages (once per battle).')
        elif k == 'guts': out.append('Its Attack is 1.5x while it has a status condition, and burns don\'t weaken it.')
        elif k == 'godButcher': out.append(f'Deals {v}x damage to shinobi with higher base stats than its own.')
        elif k == 'pickup': out.append('If it has no item, may pick up a used item at the end of the turn.')
        elif k == 'pickpocket': out.append("Steals the item of a foe that makes contact with it.")
        elif k == 'magician': out.append("Steals the target's item when it hits with an attack.")
        elif k == 'anticipation': out.append('Warns its team on entry if a foe has a super-effective move.')
        elif k == 'leechFoes': out.append(f'At the end of each turn, drains {frac(v)} of each foe\'s max HP and heals by that much.')
        elif k == 'download': out.append("On entry, raises Attack or Sp. Atk depending on which of the foe's defenses is weaker.")
        elif k == 'harvest': out.append('May regrow a Berry it has eaten at the end of each turn (50%).')
        elif k == 'gutCheck': out.append('Takes half damage from the first contact move after each time it enters battle.')
        elif k == 'mummy': out.append("A foe that makes contact with it has its ability replaced by this one (its mind is taken over).")
        elif k == 'entryConfuse': out.append('On entry, casts a genjutsu that confuses a random foe.')
        elif k == 'startTerrain': out.append({'psychic': 'On entry, sets a Genjutsu Field for 5 turns (Yin moves 1.3x, no priority attacks on grounded shinobi).', 'misty': 'On entry, spreads the Hidden Mist for 5 turns (grounded shinobi can\'t get status conditions or confusion).', 'electric': 'On entry, sets a Lightning Field for 5 turns.'}[v])
        elif k == 'immuneFlag': out.append({'wind': 'Immune to wind moves.', 'kick': 'Immune to kicking moves (it floats out of reach).'}[v])
        elif k == 'weatherSpeed': out.append({'sun': 'Speed doubles in harsh sunlight.', 'rain': 'Speed doubles in rain.'}[v])
        elif k == 'vsStatus': out.append(f'Deals {v}x damage to targets with a status condition.')
        elif k == 'magnetPull': out.append("Weapon-type foes can't switch out while it's in battle.")
        elif k == 'cocoon': out.append('Once per battle, when knocked out, its body reforms and it returns to battle 2 turns later' + (' at full HP.' if v['heal'] >= 1 else f" with {round(v['heal'] * 100)}% HP."))
        elif k == 'illusion': out.append('Enters battle disguised as the last shinobi in its team until it takes damage.')
        elif k == 'emergencyExit': out.append('Switches out when its HP drops below half.')
        elif k == 'poisonHeal': out.append('Poison heals it by 1/8 of its max HP each turn instead of hurting it.')
        elif k == 'magicBounce': out.append('Reflects status moves back at the user.')
        elif k == 'contactFoeBoost': out.append('A foe that makes contact with it has its ' + ' and '.join(STAT_LABEL[x] for x in v) + ' lowered by 1 stage.')
        elif k == 'typeTaken': out.append(' '.join(f'Takes {round(m * 100)}% damage from {t} moves.' for t, m in v.items()))
        elif k == 'noMiss': out.append('Its moves never miss.')
        elif k == 'battleArmor': out.append("Can't be hit by critical hits.")
        elif k == 'unnerve': out.append("Foes are too nervous to eat Berries while it's in battle.")
        elif k == 'entryFoeBoost': out.append("On entry, lowers the foes' " + ' and '.join(STAT_LABEL[x] for x in v) + ' by 1 stage.')
        elif k == 'badLuck': out.append("Foes can't land critical hits on its side.")
        elif k == 'absorb': out.append(f"{v['type']} moves heal it by {frac(v['heal'])} of its max HP instead of hurting it.")
        elif k == 'rainDish': out.append('Restores 1/16 of its max HP each turn in rain.')
        elif k == 'startWeather': out.append({'rain': 'On entry, makes it rain for 5 turns (Water moves 1.5x, Fire moves 0.5x).', 'sun': 'On entry, turns the sunlight harsh for 5 turns (Fire moves 1.5x, Water moves 0.5x).'}[v])
        elif k == 'contactAttract': out.append(f'A foe of the opposite gender that makes contact with it may fall in love ({v}%).')
        elif k == 'soulHeart': out.append('Its Sp. Atk rises by 1 stage whenever any shinobi faints.')
        elif k == 'aftermath': out.append(f'When knocked out by a contact move, the attacker loses {frac(v)} of its max HP.')
        elif k == 'reflectDamage': out.append(f'Whenever a foe damages it, the attacker takes {round(v * 100)}% of that damage too.')
        elif k == 'startField': out.append({'trickroom': 'On entry, twists the dimensions for 5 turns: slower shinobi move first.', 'gravity': 'On entry, intensifies gravity for 5 turns: moves are more accurate and nothing can float.', 'magicroom': 'On entry, warps the area for 5 turns: held items have no effect.'}[v['cond']])
        elif k == 'sheerForce': out.append('Moves with added effects deal 1.3x damage, but the added effects are lost.')
        elif k == 'moody': out.append('At the end of each turn, one stat rises by 2 stages and another drops by 1 (freestyle).')
        elif k == 'hitBoost': out.append('Each time it is hit, its ' + ' and '.join(STAT_LABEL[x] for x in v) + ' rise by 1 stage.')
        elif k == 'steadfast': out.append('Its Speed rises by 1 stage when it flinches.')
        elif k == 'rockHead': out.append('Takes no recoil damage.')
        elif k == 'foeMissBoost': out.append("When a foe's attack misses it, its Speed rises by 1 stage.")
        elif k == 'shedSkin': out.append('At the end of each turn, may shed its skin and cure its status condition (30%).')
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
# bigger move pools (tools/movepools.py): new jutsu from the anime and Storm games, staples per chakra nature
from movepools import NEW as NEW_MOVES, ADD as ADD_MOVES, STAPLES, UNIVERSAL as UNIVERSAL_LIST, ANIM_LIKE
for nm, mv in NEW_MOVES.items():
    if nm in MOVES: raise SystemExit('new move already exists: ' + nm)
    MOVES[nm] = mv
# animation: a jutsu from Shinobi Showdown plays its own animation (anim = its id); new ones borrow a similar one
for nm, (t, cat, pw, acc, pp, o) in MOVES.items():
    if o.get('jutsu'): o['anim'] = o['jutsu']
for nm, like in ANIM_LIKE.items():
    if nm not in MOVES or like not in MOVES or not MOVES[like][5].get('jutsu'): raise SystemExit(f'ANIM_LIKE: {nm} -> {like}')
    MOVES[nm][5]['anim'] = MOVES[like][5]['jutsu']

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
    (ab_name, spec), (hid_name, hspec), tfab = DESIGN[s['id']]
    for n, sp in ((ab_name, spec), (hid_name, hspec)):
        if n in abil_specs and abil_specs[n] != sp: raise SystemExit('ability clash ' + n)
        abil_specs[n] = sp
    learn = [JID2NAME[j] for j in s['catalogue']]
    for nat in [s['natures'].get('primary'), s['natures'].get('secondary')]:
        learn += STAPLES.get(nat, [])
    learn += ADD_MOVES.get(s['id'], []) + UNIVERSAL_LIST
    for n in learn:
        if n not in MOVES: raise SystemExit(f"{s['id']}: unknown move {n}")
    learn = list(dict.fromkeys(learn))
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
        aname, aspec = tfab
        if aname in abil_specs and abil_specs[aname] != aspec: raise SystemExit('ability clash ' + aname)
        abil_specs[aname] = aspec
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

seen = {}
for n, sp in abil_specs.items():
    k = json.dumps(sp, sort_keys=True)
    if k in seen: raise SystemExit(f'same effect: {seen[k]} / {n}')
    seen[k] = n
json.dump(ART, open(os.path.join(ROOT, 'public', 'studio', 'art.json'), 'w'))   # the Animation Studio's preview sprites
bst = sorted((sum(f['stats'].values()), f['name']) for f in fighters)
print(f'{len(fighters)} shinobi, {len(megas)} transformations, {len(MOVES)} moves, {len(abil_specs)} abilities')
print('BST low', bst[:3], 'high', bst[-3:])
