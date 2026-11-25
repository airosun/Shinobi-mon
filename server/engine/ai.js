// CPU player: drafts, builds sets, chooses a lineup and battles (singles and doubles).
const MOVES = require('../../shared/moves.js');
const FIGHTERS = require('../../shared/fighters.json');
const { effectiveness, calcStat, canHold, ITEMS } = require('../../shared/dex.js');
const BY_ID = Object.fromEntries(FIGHTERS.map(f => [f.id, f]));
const { FINAL_SMASH_BY_BASE } = require('../../shared/megas.js');

const ITEM_PREFS = ['Sitrus Berry', 'Life Orb', 'Leftovers', 'Focus Sash', 'Choice Scarf', 'Lum Berry', 'Assault Vest', 'Expert Belt', 'Choice Band', 'Choice Specs', 'Rocky Helmet', 'Heavy-Duty Boots', 'Weakness Policy', 'Covert Cloak', 'Super-Soldier Serum', 'Vibranium Shield', 'Muscle Band', 'Wise Glasses', 'Shell Bell', 'Clear Amulet'].filter(i => ITEMS[i]);
// signature items the CPU always gives their hero
const SIGNATURE = {};
// status moves the CPU never picks for its sets (too situational to play well)
const AI_SKIP = new Set(['Splash', 'Lunar Dance', 'Destiny Bond', 'Mimic', 'Transform', 'Spite', 'Revival Blessing', 'Imprison', 'Magic Room', 'Lucky Chant', 'Foresight', 'Lock-On', 'Laser Focus', 'Teeter Dance', 'Curse']);
const DOUBLES_ONLY = new Set(['Follow Me', 'Helping Hand', 'Ally Switch', 'Coaching', 'Wide Guard']);

function power(base, lvl = 50) {
  const f = BY_ID[base.species];
  const st = s => calcStat(s, f.stats[s], base.ivs[s], 0, lvl, base.nature);
  return st('hp') + st('atk') + st('def') + st('spa') + st('spd') + st('spe') + Math.max(st('atk'), st('spa')) * 0.5;
}

// Choose 6 from a pool, favouring strong heroes with varied types
function draftSix(pool, rng = Math.random) {
  const scored = pool.map((b, i) => ({ i, s: power(b) * (0.9 + rng() * 0.2), types: BY_ID[b.species].types }));
  scored.sort((a, b) => b.s - a.s);
  const out = []; const seen = new Map();
  for (const c of scored) {
    if (out.length >= 6) break;
    if (c.types.some(t => (seen.get(t) || 0) >= 2)) continue;
    out.push(c.i); c.types.forEach(t => seen.set(t, (seen.get(t) || 0) + 1));
  }
  for (const c of scored) { if (out.length >= 6) break; if (!out.includes(c.i)) out.push(c.i); }
  return out;
}

function chooseMoves(base, doubles, rng = Math.random, allowForm = false) {
  const f = BY_ID[base.species];
  const physical = calcStat('atk', f.stats.atk, base.ivs.atk, 0, 50, base.nature) >= calcStat('spa', f.stats.spa, base.ivs.spa, 0, 50, base.nature);
  const score = n => {
    const m = MOVES[n]; let s = m.power || 60;
    if (f.types.includes(m.type)) s *= 1.5;
    s *= (m.cat === 'Physical') === physical ? 1.3 : 0.6;
    if (m.acc !== true && m.acc < 85) s *= 0.8;
    if (doubles && m.target === 'allFoes') s *= 1.2;
    if (m.target === 'all' && doubles) s *= 0.8;
    if (m.recoil) s *= 0.9;
    if (m.charge && !m.sunSkip) s *= 0.5;
    return s + rng() * 25;
  };
  const attacks = f.learnset.filter(n => (allowForm || !MOVES[n].requiresForm) && MOVES[n].cat !== 'Status' && !['counter', 'mirrorcoat', 'futuresight', 'explosion', 'lastresort', 'firstimpression', 'mindblown'].includes(MOVES[n].special)).sort((a, b) => score(b) - score(a));
  const picks = []; const types = new Set();
  for (const n of attacks) { if (picks.length >= 3) break; if (types.has(MOVES[n].type)) continue; picks.push(n); types.add(MOVES[n].type); }
  const status = f.learnset.filter(n => (allowForm || !MOVES[n].requiresForm) && MOVES[n].cat === 'Status' && !AI_SKIP.has(n) && (doubles || !DOUBLES_ONLY.has(n)));
  const pref = doubles ? ['Protect', 'Detect', 'Tailwind', 'Follow Me', 'Fake Out', 'Life Dew'] : ['Swords Dance', 'Nasty Plot', 'Calm Mind', 'Dragon Dance', 'Quiver Dance', 'Protect'];
  const st = pref.find(n => f.learnset.includes(n)) || (status.length ? status[Math.floor(rng() * status.length)] : null);
  if (st && !picks.includes(st)) picks.push(st);
  for (const n of attacks) { if (picks.length >= 4) break; if (!picks.includes(n)) picks.push(n); }
  return picks.slice(0, 4);
}

function buildTeam(bases, doubles, rng = Math.random) {
  const used = new Set();
  // only one shinobi per team can transform, so the CPU gives one transformation scroll at most
  const withStone = bases.map((b, i) => (FINAL_SMASH_BY_BASE[b.species] || []).length ? i : -1).filter(i => i >= 0);
  const stoneAt = withStone.length && rng() < 0.85 ? withStone[Math.floor(rng() * withStone.length)] : -1;
  return bases.map((b, bi) => {
    const moves = chooseMoves(b, doubles, rng, bi === stoneAt);
    const hasStatus = moves.some(n => MOVES[n].cat === 'Status');
    const f = BY_ID[b.species];
    const physical = f.stats.atk >= f.stats.spa;
    let options = ITEM_PREFS.filter(i => !used.has(i) && canHold(i, f.id));
    if (hasStatus) options = options.filter(i => !i.startsWith('Choice') && i !== 'Assault Vest');
    options = options.filter(i => !(i === 'Choice Band' && !physical) && !(i === 'Choice Specs' && physical));
    const stones = (FINAL_SMASH_BY_BASE[f.id] || []).map(x => x.stone).filter(s => !used.has(s));
    let item = bi === stoneAt && stones.length ? stones[Math.floor(rng() * stones.length)]
      : SIGNATURE[f.id] && !used.has(SIGNATURE[f.id]) && rng() < 0.7 ? SIGNATURE[f.id] : (options[Math.floor(rng() * Math.min(4, options.length))] || '');
    used.add(item);
    return { moves, item };
  });
}

function matchup(attacker, defender) {
  let best = 0;
  for (const t of BY_ID[attacker.species].types) best = Math.max(best, effectiveness(t, BY_ID[defender.species].types));
  return best;
}
// pick n of 6 for the lineup, best matchups first
function chooseLineup(mine, foes, n) {
  const scored = mine.map((m, i) => {
    let s = power(m) / 100;
    for (const f of foes) s += matchup(m, f) - matchup(f, m) * 0.7;
    return { i, s };
  }).sort((a, b) => b.s - a.s);
  return scored.slice(0, n).map(x => x.i);
}

// ---------------- in battle ----------------
function monScore(b, mon, foes) {
  let best = 0, threat = 0;
  for (const foe of foes) {
    for (const mv of mon.moves) best = Math.max(best, b.estimate(mon, foe, mv.name) / foe.maxhp);
    for (const t of foe.types) threat = Math.max(threat, effectiveness(t, mon.types));
  }
  return best - threat * 0.25 + mon.hp / mon.maxhp * 0.3;
}

// skill 0..1 (default 1 = full strength). Lower skill: picks a random move more often and rarely switches.
function chooseAction(b, sideN, rng = Math.random, skill = 1) {
  const req = b.getRequest(sideN);
  const side = b.sides[sideN];
  const foes = b.actives(b.sides[1 - sideN]);
  if (req.kind === 'switch') {
    const options = b.bench(side).sort((x, y) => monScore(b, y, foes) - monScore(b, x, foes));
    return { switches: req.slots.map((pos, k) => ({ pos, index: options[k].teamIndex })) };
  }
  if (req.kind !== 'move') return null;
  const actions = []; const switching = new Set(); let megaUsed = false;
  for (const a of req.actives) {
    if (!a) continue;
    const mon = side.active[a.pos];
    if (a.locked || a.struggle) { actions.push({ pos: a.pos, type: 'move', index: 0 }); continue; }
    let best = null, bestScore = -1;
    for (const m of a.moves.filter(x => !x.disabled)) {
      const md = MOVES[m.name];
      if (md.cat === 'Status') {
        let s = foes.length ? foes[0].maxhp * 0.1 : 0;
        if (md.boosts && md.boosts.target === 'self' && mon.hp / mon.maxhp > 0.6 && Object.values(md.boosts).some(v => typeof v === 'number' && v > 0) && !(mon.boosts.atk >= 2 || mon.boosts.spa >= 2)) s = mon.maxhp * 0.3;
        if (md.heal) s = mon.hp / mon.maxhp < 0.5 ? mon.maxhp * 0.5 : 0;
        if (md.special === 'protect') s = mon.protectCount ? 0 : mon.maxhp * (b.activeCount > 1 ? 0.15 : 0.05);
        if (md.side === 'tailwind' && side.conditions.tailwind) s = 0;
        if (md.side === 'tailwind' && !side.conditions.tailwind && b.activeCount > 1) s = mon.maxhp * 0.35;
        if (md.status && foes.every(f => f.status)) s = 0;
        if (md.hazard && b.sides[1 - sideN].conditions[md.hazard]) s = 0;
        if (md.special === 'healpulse' || md.special === 'lifedew') { const ally = b.allyOf(mon); const low = [mon, ally].filter(Boolean).some(x => x.hp / x.maxhp < 0.5); s = low ? mon.maxhp * 0.45 : 0; }
        if (md.terrain && b.field.terrain === md.terrain) s = 0;
        if (md.weather && b.field.weather === md.weather) s = 0;
        if (AI_SKIP.has(m.name) || (b.activeCount === 1 && DOUBLES_ONLY.has(m.name))) s = 0;
        const tgt = foes[0];
        const c = { score: s, index: m.index, target: tgt ? { side: 1 - sideN, pos: tgt.pos } : undefined };
        if (c.score * (0.85 + rng() * 0.3) > bestScore) { bestScore = c.score; best = c; }
        continue;
      }
      if (md.target === 'allFoes' || md.target === 'all') {
        let s = foes.reduce((acc, f) => acc + Math.min(f.hp, b.estimate(mon, f, m.name)), 0);
        if (md.target === 'all') { const ally = b.allyOf(mon); if (ally) s -= Math.min(ally.hp, b.estimate(mon, ally, m.name)) * 1.5; }
        s *= 0.85 + rng() * 0.3;
        if (s > bestScore) { bestScore = s; best = { index: m.index }; }
      } else for (const f of foes) {
        let s = Math.min(f.hp * 1.2, b.estimate(mon, f, m.name));
        if (s >= f.hp && md.prio > 0) s *= 1.5;
        s *= 0.85 + rng() * 0.3;
        if (s > bestScore) { bestScore = s; best = { index: m.index, target: { side: 1 - sideN, pos: f.pos } }; }
      }
    }
    // weaker CPUs sometimes just pick any move
    if (skill < 1 && rng() < (1 - skill) * 0.6) {
      const usable = a.moves.filter(x => !x.disabled); const mv = usable[Math.floor(rng() * usable.length)];
      const f = foes[Math.floor(rng() * foes.length)];
      actions.push({ pos: a.pos, type: 'move', index: mv.index, target: f ? { side: 1 - sideN, pos: f.pos } : undefined, mega: !!(a.finalSmash && !megaUsed && skill >= 0.3 && (megaUsed = true)) });
      continue;
    }
    // switch out of a bad matchup now and then
    if (a.canSwitch && foes.length && rng() < 0.25 * skill) {
      const cur = monScore(b, mon, foes);
      const alt = b.bench(side).filter(m => !switching.has(m.teamIndex)).map(m => ({ m, s: monScore(b, m, foes) })).sort((x, y) => y.s - x.s)[0];
      if (alt && alt.s > cur + 0.5) { switching.add(alt.m.teamIndex); actions.push({ pos: a.pos, type: 'switch', index: alt.m.teamIndex }); continue; }
    }
    const act = Object.assign({ pos: a.pos, type: 'move' }, best || { index: a.moves.find(x => !x.disabled).index });
    if (a.finalSmash && !megaUsed) { act.mega = true; megaUsed = true; }
    actions.push(act);
  }
  return { actions };
}

module.exports = { draftSix, buildTeam, chooseLineup, chooseAction, chooseMoves };
