// Generates the 50 fixed Road to 50 Wins boss teams: node tools/gen_bosses.js
// Writes server/data/road_bosses.json. The file is committed, so every player (and every deploy) faces
// exactly the same bosses; re-run this only to deliberately redesign the gauntlet.
//
// Difficulty comes from team BST and composition:
//  - fighters are ranked by BST; floor f draws mostly from fighters around the matching BST percentile
//    (milestone floors 10/20/30/40/50 reach higher)
//  - every fighter is guaranteed a spot: the BST-sorted list is dealt out 2 per floor
//  - later floors: better natures, higher IVs, stronger move sets, competitive items, more type variety
//  - Final Smash stones from floor 15 on (one per team); the boss CPU also plays smarter as floors rise
const fs = require('fs');
const path = require('path');
const FIGHTERS = require('../shared/fighters.json');
const MOVES = require('../shared/moves.js');
const { NATURES, ITEMS } = require('../shared/dex.js');
const { FINAL_SMASH_BY_BASE } = require('../shared/megas.js');
const GENDER = require('../shared/genders.js');
const AI = require('../server/engine/ai.js');

const HAS_FS = Object.keys(FINAL_SMASH_BY_BASE).length > 0;
const FLOORS = 50, FS_FROM = 15, MILESTONES = [10, 20, 30, 40, 50], MAX_USES = 5;
// with only a few Ultimate heroes, each may appear more often so every boss from FS_FROM on can have one
const FS_MAX_USES = HAS_FS ? Math.max(MAX_USES, Math.ceil((FLOORS - Math.floor((FS_FROM - 1) / 10) * 10) / Object.keys(FINAL_SMASH_BY_BASE).length) + 2) : MAX_USES;
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = mulberry32(50);
const pick = arr => arr[Math.floor(rng() * arr.length)];
const bst = f => Object.values(f.stats).reduce((a, b) => a + b, 0);

const sorted = FIGHTERS.slice().sort((a, b) => bst(a) - bst(b) || a.num - b.num);
const N = sorted.length;
const pct = new Map(sorted.map((f, i) => [f.id, i / (N - 1)]));
const used = new Map(FIGHTERS.map(f => [f.id, 0]));

// guaranteed fighters per floor: deal the BST-sorted list out in order (2 per floor for 100 fighters)
const guaranteed = Array.from({ length: FLOORS }, () => []);
sorted.forEach((f, i) => guaranteed[Math.min(FLOORS - 1, Math.floor(i * FLOORS / N))].push(f));

const SQUAD = ['Squad', 'Crew', 'Gang', 'Posse', 'Troupe', 'Team', 'Unit', 'Brigade', 'Strike Force', 'Alliance', 'Legion', 'Syndicate'];
const TITLE = { 10: 'Gatekeeper', 20: 'Defender', 30: 'Warlord', 40: 'Overlord', 50: 'Champion' };

function natureFor(f, floor) {
  if (floor < 12) return pick(Object.keys(NATURES));
  const physical = f.stats.atk >= f.stats.spa;
  const fast = f.stats.spe >= 90 && floor >= 25;
  return physical ? (fast ? 'Jolly' : 'Adamant') : (fast ? 'Timid' : 'Modest');
}
function ivsFor(floor) {
  const lo = floor >= 40 ? 31 : Math.round((floor - 1) / 39 * 31);
  const ivs = {};
  for (const s of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) ivs[s] = lo + Math.floor(rng() * (32 - lo));
  return ivs;
}
function weakMoves(f) {   // early floors: a random set with at least 2 attacks
  const attacks = f.learnset.filter(n => MOVES[n].cat !== 'Status'), others = f.learnset.filter(n => MOVES[n].cat === 'Status');
  const out = new Set();
  while (out.size < Math.min(2, attacks.length)) out.add(pick(attacks));
  const rest = f.learnset.filter(n => !out.has(n));
  while (out.size < Math.min(4, f.learnset.length)) out.add(pick(rest.length ? rest : others));
  return [...out];
}

function chooseTeam(floor) {
  const p = (floor - 1) / (FLOORS - 1);
  const center = MILESTONES.includes(floor) ? Math.min(1, p + 0.12) : p;
  const width = 0.16 + 0.06 * (1 - p);
  const team = [...guaranteed[floor - 1]];
  const maxShare = floor >= 25 ? 1 : 2;   // later teams avoid doubling up on a type
  const typeCount = t => team.reduce((n, f) => n + f.types.filter(x => x === t).length, 0);
  const fits = f => !team.includes(f) && f.types.every(t => typeCount(t) < maxShare);
  while (team.length < 6) {
    // widen the BST window before using anyone more than MAX_USES times
    let w = width, cands = [];
    while (w < 1.2 && !cands.some(f => used.get(f.id) < MAX_USES)) { cands = sorted.filter(f => Math.abs(pct.get(f.id) - center) <= w && fits(f)); w += 0.04; }
    if (!cands.length) cands = sorted.filter(f => !team.includes(f) && Math.abs(pct.get(f.id) - center) <= width + 0.15);
    if (!cands.length) cands = sorted.filter(f => !team.includes(f));
    // prefer fighters seen less often so everyone shows up a fair amount (and nobody more than MAX_USES times)
    if (cands.some(f => used.get(f.id) < MAX_USES)) cands = cands.filter(f => used.get(f.id) < MAX_USES);
    const minUse = Math.min(...cands.map(f => used.get(f.id)));
    const pool = cands.filter(f => used.get(f.id) <= minUse + 1);
    team.push(pick(pool));
  }
  team.forEach(f => used.set(f.id, used.get(f.id) + 1));
  return team;
}

function itemsFor(team, sets, floor) {
  const fsHolder = HAS_FS && floor >= FS_FROM ? team.findIndex(f => FINAL_SMASH_BY_BASE[f.id]) : -1;
  if (floor < 6) return sets.map((s, i) => '');
  const casual = ['Sitrus Berry', 'Leftovers', 'Lum Berry'];
  if (floor < FS_FROM) return sets.map((s, i) => i < Math.min(3, Math.floor(floor / 4)) ? casual[i] : '');
  // competitive items (the CPU's own picks), exactly one Final Smash stone
  const built = AI.buildTeam(sets, false, rng).map(b => b.item);
  const stone = fsHolder >= 0 ? FINAL_SMASH_BY_BASE[team[fsHolder].id][0].stone : '';
  const spare = ['Sitrus Berry', 'Leftovers', 'Life Orb', 'Focus Sash', 'Lum Berry', 'Expert Belt', 'Rocky Helmet', 'Assault Vest'];
  const out = built.map((it, i) => i === fsHolder ? stone : (it && !ITEMS[it] ? '' : it));
  out.forEach((it, i) => { if (!it && i !== fsHolder) out[i] = spare.find(x => !out.includes(x)) || ''; });
  return out;
}

const teamBst = t => t.reduce((n, f) => n + bst(f), 0);
let teams = Array.from({ length: FLOORS }, (_, i) => chooseTeam(i + 1)).sort((a, b) => teamBst(a) - teamBst(b));
teams.forEach((team, i) => {
  const floor = i + 1;
  if (!HAS_FS || floor <= Math.floor((FS_FROM - 1) / 10) * 10 ||   // whole blocks of ten, so reordering below keeps it
     team.some(f => FINAL_SMASH_BY_BASE[f.id])) return;
  // swap the fighter closest in BST to a Final Smash fighter that's used least
  const opts = sorted.filter(f => FINAL_SMASH_BY_BASE[f.id] && !team.includes(f));
  let best = null;
  for (let k = 0; k < 6; k++) for (const f of opts) {
    if (used.get(team[k].id) <= 1) continue;   // keep each fighter's only appearance
    if (used.get(f.id) >= FS_MAX_USES) continue;
    const cost = Math.abs(bst(f) - bst(team[k])) + used.get(f.id) * 60;
    if (!best || cost < best.cost) best = { k, f, cost };
  }
  if (!best) throw new Error(`floor ${floor}: no hero with an Ultimate Form can be swapped in`);
  used.set(team[best.k].id, used.get(team[best.k].id) - 1); used.set(best.f.id, used.get(best.f.id) + 1);
  team[best.k] = best.f;
});
for (let d = 0; d < FLOORS / 10; d++) {
  const block = teams.slice(d * 10, d * 10 + 10);
  const top = block.reduce((bi, t, i) => teamBst(t) > teamBst(block[bi]) ? i : bi, 0);
  block.push(block.splice(top, 1)[0]);
  teams.splice(d * 10, 10, ...block);
}
const aces = new Set(); const names = new Set();
const bosses = [];
for (let floor = 1; floor <= FLOORS; floor++) {
  const team = teams[floor - 1];
  const sets = team.map((f, i) => ({
    uid: `boss${floor}-${i}`, species: f.id, nature: natureFor(f, floor), ivs: ivsFor(floor),
    ability: floor >= 20 ? f.hidden.name : (rng() < 0.5 ? f.abilities[0].name : f.hidden.name),
    gender: GENDER.roll(f.id, rng),
  }));
  sets.forEach(s => { const f = FIGHTERS.find(x => x.id === s.species); s.moves = floor < 8 ? weakMoves(f) : AI.chooseMoves(s, false, floor < 25 ? () => rng() * 3 : rng); });
  const items = itemsFor(team, sets, floor);
  // item clause
  const seen = new Set();
  sets.forEach((s, i) => { let it = items[i]; if (it && seen.has(it)) it = ''; if (it) seen.add(it); s.item = it; });
  // the boss is named after its strongest fighter that hasn't led a boss yet
  const byBst = team.slice().sort((a, b) => bst(b) - bst(a));
  const ace = floor === FLOORS ? byBst[0] : (byBst.find(f => !aces.has(f.id)) || byBst[0]); aces.add(ace.id);
  let name = TITLE[floor] ? `${TITLE[floor]} ${ace.name}` : `${ace.name}'s ${SQUAD[floor % SQUAD.length]}`;
  // fewer heroes than floors: keep every boss name unique
  for (let k = 1; names.has(name) && !TITLE[floor] && k < SQUAD.length; k++) name = `${ace.name}'s ${SQUAD[(floor + k) % SQUAD.length]}`;
  if (names.has(name)) name += ' II';
  names.add(name);
  bosses.push({
    floor, name, milestone: MILESTONES.includes(floor), ace: ace.id,
    skill: Math.round((0.15 + 0.85 * Math.pow((floor - 1) / (FLOORS - 1), 0.8)) * 100) / 100,
    bst: team.reduce((n, f) => n + bst(f), 0), team: sets,
  });
}

// sanity checks
const seenAll = new Set(bosses.flatMap(b => b.team.map(s => s.species)));
const missing = FIGHTERS.filter(f => !seenAll.has(f.id)).map(f => f.id);
if (missing.length) throw new Error('fighters never used: ' + missing.join(', '));
for (const b of bosses) {
  if (new Set(b.team.map(s => s.species)).size !== 6) throw new Error('duplicate species on floor ' + b.floor);
  const stones = b.team.filter(s => s.item && !require('../shared/dex.js').ITEMS[s.item]).length;
  if (b.floor < FS_FROM && stones) throw new Error('stone too early on floor ' + b.floor);
  if (HAS_FS && b.floor >= FS_FROM && stones !== 1) throw new Error('floor ' + b.floor + ' has ' + stones + ' stones');
}
const out = path.join(__dirname, '..', 'server', 'data', 'road_bosses.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(bosses, null, 1));
console.log(`wrote ${bosses.length} bosses to ${path.relative(process.cwd(), out)}`);
console.log(bosses.map(b => `${String(b.floor).padStart(2)} ${b.name.padEnd(28)} BST ${b.bst}  skill ${b.skill}  ${b.team.map(s => s.species).join(', ')}`).join('\n'));
const counts = [...used.values()]; console.log('appearances per fighter: min', Math.min(...counts), 'max', Math.max(...counts));
