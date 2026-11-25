// Battler Cards: a signed-in player's avatar, title, short bio and a showcased Strike Squad.
const FIGHTERS = require('../shared/fighters.json');
const { FINAL_SMASHES, FORMS } = require('../shared/megas.js');
const GENDER = require('../shared/genders.js');
const { isClean, mask } = require('./moderation.js');
const { CARD_COLORS } = require('../shared/cardcolors.js');
// avatars: any hero, Ultimate form or battle form (Bruce Banner), plus "id~F" / "id~M" for the alternate-gender sprites
const AVATARS = new Set([...FIGHTERS.map(f => f.id), ...Object.values(FINAL_SMASHES).map(x => x.id), ...Object.keys(FORMS)]);
for (const [id, g] of Object.entries(GENDER.GENDERS)) for (const sex of Object.keys(g.images || {})) AVATARS.add(`${id}~${sex}`);
for (const [id, imgs] of Object.entries(GENDER.FORM_IMAGES)) for (const sex of Object.keys(imgs)) AVATARS.add(`${id}~${sex}`);
const text = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

// userData: the player's saved roster/teams (already signature-checked)
function sanitizeProfile(input, userData) {
  input = input || {};
  const out = { color: CARD_COLORS[input.color] ? input.color : 'classic', avatar: AVATARS.has(input.avatar) ? input.avatar : null, title: text(input.title, 32), bio: text(input.bio, 160), favoriteTeam: null };
  const i = input.favoriteTeam;
  const teams = (userData && userData.elite) || [];
  if (Number.isInteger(i) && teams[i]) {
    const byUid = Object.fromEntries(((userData && userData.roster) || []).map(f => [f.uid, f]));
    const mons = teams[i].mons.map(m => byUid[m.uid] && { species: byUid[m.uid].species, gender: m.gender || byUid[m.uid].gender || null, nature: byUid[m.uid].nature, ability: byUid[m.uid].ability, item: m.item, moves: m.moves.filter(Boolean) }).filter(Boolean);
    if (mons.length) out.favoriteTeam = { name: text(teams[i].name, 40), mons };
  }
  if (!isClean(out.title)) return { error: "Your title has language that isn't allowed. Please change it." };
  if (!isClean(out.bio)) return { error: "Your About you has language that isn't allowed. Please change it." };
  if (out.favoriteTeam && !isClean(out.favoriteTeam.name)) return { error: "Your showcase team's name has language that isn't allowed. Rename the team first." };
  return out;
}
// what other players see (also hides anything saved before a word was added to the filter)
function cleanForDisplay(p) {
  if (!p) return p;
  return Object.assign({}, p, { title: mask(p.title), bio: mask(p.bio), favoriteTeam: p.favoriteTeam ? Object.assign({}, p.favoriteTeam, { name: mask(p.favoriteTeam.name) }) : null });
}

module.exports = { sanitizeProfile, cleanForDisplay, AVATARS };
