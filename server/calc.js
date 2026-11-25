// Damage calculator: runs the real battle engine on a 1-vs-1 setup with the damage roll pinned to its
// lowest and highest values, so the numbers match what happens in battle.
const { Battle } = require('./engine/battle.js');
const MOVES = require('../shared/moves.js');
const FIGHTERS = require('../shared/fighters.json');
const { NATURES, ITEMS } = require('../shared/dex.js');
const { FINAL_SMASHES } = require('../shared/megas.js');
const BY_ID = Object.fromEntries(FIGHTERS.map(f => [f.id, f]));
const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const BOOSTS = ['atk', 'def', 'spa', 'spd', 'spe'];

function cleanSide(x, needMove) {
  x = x || {};
  const f = BY_ID[x.species]; if (!f) return { error: 'Pick a hero.' };
  const abilities = [...f.abilities, f.hidden].map(a => a.name);
  const ivs = {}; for (const s of STATS) ivs[s] = Math.max(0, Math.min(31, Math.floor(x.ivs && x.ivs[s] != null ? +x.ivs[s] : 31)));
  const boosts = {}; for (const s of BOOSTS) boosts[s] = Math.max(-6, Math.min(6, Math.floor(+((x.boosts || {})[s]) || 0)));
  const item = ITEMS[x.item] || FINAL_SMASHES[x.item] ? x.item : '';
  const move = needMove ? x.move : null;
  if (needMove && !(move && MOVES[move])) return { error: 'Pick a move.' };
  return {
    species: f.id, ability: abilities.includes(x.ability) ? x.ability : abilities[0], nature: NATURES[x.nature] ? x.nature : 'Hardy', ivs, boosts, item,
    status: ['brn', 'par', 'psn', 'tox', 'slp', 'frz'].includes(x.status) ? x.status : '',
    hpPct: Math.max(1, Math.min(100, Math.floor(+x.hpPct || 100))),
    finalSmash: !!x.finalSmash && !!FINAL_SMASHES[item] && FINAL_SMASHES[item].bases.includes(f.id),
    move,
  };
}

function calc(input) {
  input = input || {};
  const A = cleanSide(input.attacker, true); if (A.error) return A;
  const D = cleanSide(input.defender, false); if (D.error) return D;
  const field = input.field || {};
  const doubles = !!field.spread;
  const team = (x, moves) => [{ species: x.species, ability: x.ability, nature: x.nature, ivs: x.ivs, item: x.item, moves }];
  const b = new Battle({ format: 'singles', rng: () => 0.999, players: [{ name: 'A', team: team(A, [A.move]) }, { name: 'B', team: team(D, ['Protect']) }] });
  const a = b.sides[0].active[0] || b.sides[0].team[0], d = b.sides[1].active[0] || b.sides[1].team[0];
  if (A.finalSmash) b.finalSmash(a);
  if (D.finalSmash) b.finalSmash(d);
  // the calculator decides boosts, weather and screens, not switch-in abilities
  for (const [m, x] of [[a, A], [d, D]]) { m.boosts = Object.assign({ accuracy: 0, evasion: 0 }, x.boosts); m.status = x.status; m.hp = Math.max(1, Math.round(m.maxhp * x.hpPct / 100)); }
  b.field.weather = ['sun', 'rain', 'snow'].includes(field.weather) ? field.weather : '';
  b.sides[1].conditions = {}; if (field.reflect) b.sides[1].conditions.reflect = 5; if (field.lightscreen) b.sides[1].conditions.lightscreen = 5;
  if (doubles) b.activeCount = 2;   // spread-move damage and doubles screen strength

  const md = MOVES[A.move];
  const out = { attacker: a.species.name, defender: d.species.name, move: A.move, type: md.type, cat: md.cat, defHp: d.hp, defMaxHp: d.maxhp, stats: { attacker: a.stats, defender: d.stats } };
  if (md.cat === 'Status') return Object.assign(out, { min: 0, max: 0, note: 'Status moves deal no direct damage.' });
  const eff = b.typeEff(a, d, md);
  const immune = note => Object.assign(out, { min: 0, max: 0, eff: 0, note });
  if (!eff) return immune(`${d.species.name} is immune to ${md.type}-type moves.`);
  if (md.type === 'Ground' && md.special !== 'thousandarrows' && !b.isGrounded(d, a)) return immune(`${d.species.name} isn't on the ground.`);
  const ts = d.spec;
  if ((ts.absorb && ts.absorb.type === md.type) || (ts.immuneFlag && md[ts.immuneFlag])) return immune(`${d.species.name}'s ability ${d.ability} blocks this move.`);
  if (['counter', 'mirrorcoat'].includes(md.special)) return immune('This move\'s damage depends on the damage taken this turn.');
  let power = md.power;
  if (md.special === 'gyroball') power = Math.min(150, Math.floor(25 * b.getSpeed(d) / Math.max(1, b.getSpeed(a))) + 1);
  if (md.special === 'level') return Object.assign(out, { min: 50, max: 50, eff, note: 'Deals damage equal to the user\'s level (50).' });

  const roll = (k, crit) => {
    const save = JSON.stringify([d.switchFlags, d.once, a.v, d.v]);
    b.random = () => k; b.rng = () => (crit ? 0 : 0.999);
    const r = b.calcDamage(a, d, md, power || 1, eff, false, doubles && (md.target === 'allFoes' || md.target === 'all'));
    [d.switchFlags, d.once, a.v, d.v] = JSON.parse(save);
    return r.dmg;
  };
  const crit = !!field.crit;
  let min = roll(0, crit), max = roll(15, crit);
  let hits = 1, hitsNote = '';
  if (md.multihit) {
    if (Array.isArray(md.multihit)) { hitsNote = ` (per hit; hits ${md.multihit[0]}–${md.multihit[1]} times)`; }
    else { hits = md.multihit; min *= hits; max *= hits; hitsNote = ` (${hits} hits)`; }
  }
  const hp = d.hp;
  const pct = x => Math.round(x / d.maxhp * 1000) / 10;
  const best = Math.ceil(hp / Math.max(1, max)), worst = Math.ceil(hp / Math.max(1, min));
  let ko;
  if (max <= 0) ko = 'No damage.';
  else if (best === worst) ko = best === 1 ? 'Guaranteed OHKO' : `Guaranteed ${best}HKO`;
  else ko = best === 1 ? `Possible OHKO (${worst}HKO at worst)` : `${best}HKO to ${worst}HKO`;
  if (md.charge) hitsNote += ' — takes a charge turn';
  return Object.assign(out, { min, max, minPct: pct(min), maxPct: pct(max), eff, crit, ko, note: hitsNote.trim() || null });
}

module.exports = { calc };
