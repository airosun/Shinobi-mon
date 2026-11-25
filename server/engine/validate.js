// Team legality. Heroes come with a fixed nature, IVs and ability (from a draft pool or the
// Battle Pass); the player chooses only moves and items. VGC clauses: one of each hero,
// one of each item.
const MOVES = require('../../shared/moves.js');
const FIGHTERS = require('../../shared/fighters.json');
const { NATURES, ITEMS, RENAMED_ABILITIES, canHold } = require('../../shared/dex.js');
const { FINAL_SMASHES } = require('../../shared/megas.js');
const GENDER = require('../../shared/genders.js');
const BY_ID = Object.fromEntries(FIGHTERS.map(f => [f.id, f]));
const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

// base: { uid, species, nature, ivs, ability }   build: { moves, item }
function buildSet(base, build, errors) {
  const f = BY_ID[base.species];
  if (!f) { errors.push('Unknown hero.'); return null; }
  const moves = [...new Set((build.moves || []).filter(Boolean))];
  if (moves.length < 1 || moves.length > 4) errors.push(`${f.name}: choose 1 to 4 moves.`);
  for (const mv of moves) if (!MOVES[mv] || !f.learnset.includes(mv)) errors.push(`${f.name} can't learn ${mv}.`);
  const item = build.item || '';
  const fs = FINAL_SMASHES[item];
  if (item && !ITEMS[item] && !fs) errors.push(`${f.name}: unknown item ${item}.`);
  if (fs && !fs.bases.includes(f.id)) errors.push(`${item} only works for ${fs.bases.map(b => BY_ID[b].name).join(' or ')}.`);
  if (item && ITEMS[item] && !canHold(item, f.id)) errors.push(`${f.name} can't hold ${item}.`);
  const ability = RENAMED_ABILITIES[base.ability] || base.ability; // saved before a rename: use the new name
  if (![...f.abilities.map(a => a.name), f.hidden.name].includes(ability)) errors.push(`${f.name}: invalid ability.`);
  if (!NATURES[base.nature]) errors.push(`${f.name}: invalid nature.`);
  const ivs = {};
  for (const s of STATS) { const v = base.ivs ? base.ivs[s] : 31; if (!Number.isInteger(v) || v < 0 || v > 31) errors.push(`${f.name}: invalid IVs.`); ivs[s] = v; }
  return { uid: base.uid, species: f.id, nature: base.nature, ivs, ability, item, moves, gender: GENDER.normalize(f.id, base.gender) };
}

function checkClauses(sets, errors) {
  const species = new Set(), items = new Set();
  for (const s of sets) {
    if (!s) continue;
    const name = BY_ID[s.species].name;
    const base = BY_ID[s.species].baseId || s.species;   // one version of each shinobi (Part I, Shippuden, Sage Mode…)
    if (species.has(base)) errors.push(`Only one version of ${name.split(' (')[0]} allowed per team.`);
    species.add(base);
    if (s.item) { if (items.has(s.item)) errors.push(`Item clause: only one ${s.item} per team.`); items.add(s.item); }
  }
}

// Standard: picks are 6 entries from the server-held pool; builds are [{moves, item}]
function validateStandardBuild(poolPicks, builds) {
  const errors = [];
  if (!Array.isArray(builds) || builds.length !== poolPicks.length) return { ok: false, errors: ['Build all 6 heroes.'] };
  const sets = poolPicks.map((base, i) => buildSet(base, builds[i] || {}, errors));
  checkClauses(sets, errors);
  return { ok: !errors.length, errors, team: sets };
}

// Elite: full sets from the player's roster, each carrying the server's signature
function validateEliteTeam(team, verify) {
  const errors = [];
  if (!Array.isArray(team) || team.length !== 6) return { ok: false, errors: ['A Strike Squad needs exactly 6 heroes.'] };
  const sets = team.map(t => {
    if (!t || !verify(t)) { errors.push(`${(BY_ID[t && t.species] || { name: 'A hero' }).name} isn't a verified roster hero.`); return null; }
    return buildSet(t, t, errors);
  });
  checkClauses(sets, errors);
  return { ok: !errors.length, errors, team: sets };
}

module.exports = { validateStandardBuild, validateEliteTeam, buildSet, checkClauses };
