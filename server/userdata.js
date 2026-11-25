// Saved roster + Strike Squads for signed-in players. Only heroes with a valid server signature are kept,
// and everything is size-capped, so a player can't store junk or edit a hero's nature/IVs/ability.
const { verify } = require('./engine/roster.js');
const GENDER = require('../shared/genders.js');

const MAX_ROSTER = 600, MAX_TEAMS = 60;
const str = (v, n) => String(v == null ? '' : v).slice(0, n);

function sanitize(d, verifyFn = verify) {
  d = d && typeof d === 'object' ? d : {};
  const seen = new Set(); const roster = [];
  for (const f of Array.isArray(d.roster) ? d.roster : []) {
    if (roster.length >= MAX_ROSTER) break;
    if (!f || typeof f !== 'object' || seen.has(f.uid) || !verifyFn(f)) continue;
    seen.add(f.uid);
    roster.push({ uid: f.uid, species: f.species, nature: f.nature, ability: f.ability, ivs: f.ivs, sig: f.sig, gender: GENDER.normalize(f.species, f.gender) });
  }
  const speciesOf = Object.fromEntries(roster.map(f => [f.uid, f.species]));
  const elite = (Array.isArray(d.elite) ? d.elite : []).slice(0, MAX_TEAMS).map((t, i) => ({
    name: str(t && t.name, 40) || `Strike Squad ${i + 1}`,
    mons: (Array.isArray(t && t.mons) ? t.mons : []).slice(0, 6).filter(m => m && seen.has(m.uid))
      .map(m => ({ uid: m.uid, moves: (Array.isArray(m.moves) ? m.moves : []).slice(0, 4).map(x => str(x, 40)), item: str(m.item, 40), gender: GENDER.normalize(speciesOf[m.uid], m.gender) })),
  }));
  const selElite = Math.max(0, Math.min(elite.length - 1, Math.floor(+d.selElite || 0)));
  return { roster, elite, selElite };
}

// A guest's browser data joins the account: new roster heroes are added, and guest teams are added
// unless the account already has an identical one.
function merge(account, guest) {
  const a = sanitize(account);
  const g = guest && typeof guest === 'object' ? guest : {};
  const have = new Set(a.roster.map(f => f.uid));
  const roster = a.roster.concat(sanitize({ roster: g.roster }).roster.filter(f => !have.has(f.uid)));
  // guest teams are checked against the combined roster, then added unless the account has the same team
  const gTeams = sanitize({ roster, elite: g.elite }).elite;
  const sameTeam = (x, y) => JSON.stringify(x.mons) === JSON.stringify(y.mons);
  const elite = a.elite.concat(gTeams.filter(t => !a.elite.some(x => sameTeam(x, t))));
  return sanitize({ roster, elite, selElite: a.elite.length ? a.selElite : g.selElite });
}

module.exports = { sanitize, merge, MAX_ROSTER, MAX_TEAMS };
