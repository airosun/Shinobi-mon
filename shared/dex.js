// Type chart, natures and items shared by server and client.
// Shinobi-mon type chart (tools/source/typechart.json): 19 chakra-nature types, 2x super effective / 0.5x resisted.
const _TC = (typeof window !== 'undefined' && window.TYPECHART) || require('./typechart.js');
const TYPES = _TC.types;
// CHART[attacking][defending] = multiplier (omitted = 1)
const CHART = _TC.chart;
function effectiveness(atk, defTypes) {
  let m = 1;
  for (const t of defTypes) { const v = (CHART[atk] || {})[t]; if (v !== undefined) m *= v; }
  return m;
}

const NATURES = {
  Hardy: {}, Docile: {}, Serious: {}, Bashful: {}, Quirky: {},
  Lonely: { plus: 'atk', minus: 'def' }, Brave: { plus: 'atk', minus: 'spe' }, Adamant: { plus: 'atk', minus: 'spa' }, Naughty: { plus: 'atk', minus: 'spd' },
  Bold: { plus: 'def', minus: 'atk' }, Relaxed: { plus: 'def', minus: 'spe' }, Impish: { plus: 'def', minus: 'spa' }, Lax: { plus: 'def', minus: 'spd' },
  Timid: { plus: 'spe', minus: 'atk' }, Hasty: { plus: 'spe', minus: 'def' }, Jolly: { plus: 'spe', minus: 'spa' }, Naive: { plus: 'spe', minus: 'spd' },
  Modest: { plus: 'spa', minus: 'atk' }, Mild: { plus: 'spa', minus: 'def' }, Quiet: { plus: 'spa', minus: 'spe' }, Rash: { plus: 'spa', minus: 'spd' },
  Calm: { plus: 'spd', minus: 'atk' }, Gentle: { plus: 'spd', minus: 'def' }, Sassy: { plus: 'spd', minus: 'spe' }, Careful: { plus: 'spd', minus: 'spa' },
};

const ITEMS = {
  "Leftovers": "At the end of every turn, holder restores 1/16 of its max HP.",
  "Life Orb": "Holder's attacks do 1.3x damage, and it loses 1/10 its max HP after the attack.",
  "Choice Band": "Holder's Attack is 1.5x, but it can only select the first move it executes.",
  "Choice Specs": "Holder's Sp. Atk is 1.5x, but it can only select the first move it executes.",
  "Choice Scarf": "Holder's Speed is 1.5x, but it can only select the first move it executes.",
  "Focus Sash": "If holder's HP is full, will survive an attack that would KO it with 1 HP. Single use.",
  "Assault Vest": "Holder's Sp. Def is 1.5x, but it can only select damaging moves.",
  "Rocky Helmet": "If holder is hit by a contact move, the attacker loses 1/6 of its max HP.",
  "Sitrus Berry": "Restores 1/4 max HP when at 1/2 max HP or less. Single use.",
  "Lum Berry": "Holder cures itself if it has a non-volatile status or is confused. Single use.",
  "Expert Belt": "Holder's attacks that are super effective against the target do 1.2x damage.",
  "Weakness Policy": "If holder is hit super effectively, raises Attack, Sp. Atk by 2 stages. Single use.",
  "White Herb": "Restores all lowered stat stages to 0 when one is less than 0. Single use.",
  "Mental Herb": "Cures holder of Attract, Disable, Encore, Heal Block, Taunt, Torment. Single use.",
  "Flame Orb": "At the end of every turn, this item attempts to burn the holder.",
  "Toxic Orb": "At the end of every turn, this item attempts to badly poison the holder.",
  "Shell Bell": "After an attack, holder gains 1/8 of the damage in HP dealt to other hero.",
  "Scope Lens": "Holder's critical hit ratio is raised by 1 stage.",
  "Quick Claw": "Each turn, holder has a 20% chance to move first in its priority bracket.",
  "King's Rock": "Holder's attacks without a chance to flinch gain a 10% chance to flinch.",
  "Big Root": "Holder gains 1.3x HP from draining/Aqua Ring/Ingrain/Leech Seed/Strength Sap.",
  "Covert Cloak": "Holder is not affected by the secondary effect of another hero's attack.",
  "Clear Amulet": "Prevents other hero from lowering the holder's stat stages.",
  "Mirror Herb": "When an opposing hero raises a stat stage, the holder copies it. Single use.",
  "Loaded Dice": "Holder's moves that hit 2-5 times hit 4-5 times; Population Bomb hits 4-10 times.",
  "Throat Spray": "Raises holder's Special Attack by 1 stage after it uses a sound move. Single use.",
  "Eject Button": "If holder survives a hit, it immediately switches out to a chosen ally. Single use.",
  "Eject Pack": "If the holder's stat stages are lowered, it switches to a chosen ally. Single use.",
  "Red Card": "If holder survives a hit, attacker is forced to switch to a random ally. Single use.",
  "Safety Goggles": "Holder is immune to powder moves and damage from Sandstorm or Hail.",
  "Wide Lens": "The accuracy of attacks by the holder is 1.1x.",
  "Zoom Lens": "The accuracy of attacks by the holder is 1.2x if it moves after its target.",
  "Muscle Band": "Holder's physical attacks have 1.1x power.",
  "Wise Glasses": "Holder's special attacks have 1.1x power.",
  "Room Service": "If Trick Room is active, the holder's Speed is lowered by 1 stage. Single use.",
  "Blunder Policy": "If the holder misses due to accuracy, its Speed is raised by 2 stages. Single use.",
  "Ability Shield": "Holder's Ability cannot be changed, suppressed, or ignored by any effect.",
  "Punching Glove": "Holder's punch-based attacks have 1.1x power and do not make contact.",
  "Focus Band": "Holder has a 10% chance to survive an attack that would KO it with 1 HP.",
  "Protective Pads": "Holder's moves are protected from adverse contact effects, except Pickpocket.",
  "Utility Umbrella": "The holder ignores rain- and sun-based effects.",
  "Electric Seed": "If the terrain is Electric Terrain, raises holder's Defense by 1 stage. Single use.",
  "Psychic Seed": "If the terrain is Psychic Terrain, raises holder's Sp. Def by 1 stage. Single use.",
  "Grassy Seed": "If the terrain is Grassy Terrain, raises holder's Defense by 1 stage. Single use.",
  "Misty Seed": "If the terrain is Misty Terrain, raises holder's Sp. Def by 1 stage. Single use.",
  "Salac Berry": "Raises holder's Speed by 1 stage when at 1/4 max HP or less. Single use.",
  "Liechi Berry": "Raises holder's Attack by 1 stage when at 1/4 max HP or less. Single use.",
  "Petaya Berry": "Raises holder's Sp. Atk by 1 stage when at 1/4 max HP or less. Single use.",
  "Custap Berry": "Holder moves first in its priority bracket when at 1/4 max HP or less. Single use.",
  "Aguav Berry": "Restores 1/3 max HP at 1/4 max HP or less; confuses if -SpD Nature. Single use.",
  "Figy Berry": "Restores 1/3 max HP at 1/4 max HP or less; confuses if -Atk Nature. Single use.",
};
// signature items: only these heroes can hold them
const ITEM_ONLY = {};
const canHold = (item, id) => !ITEM_ONLY[item] || ITEM_ONLY[item].includes(id);
// kept for older code paths; no hero uses Eviolite
const EVIOLITE_USERS = [];

const STAT_NAMES = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };

function calcStat(stat, base, iv, ev, level, nature) {
  if (stat === 'hp') return Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + level + 10;
  let v = Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + 5;
  const n = NATURES[nature] || {};
  if (n.plus === stat) v = Math.floor(v * 1.1);
  if (n.minus === stat) v = Math.floor(v * 0.9);
  return v;
}

// Abilities renamed after release (old name -> new name). None yet.
const RENAMED_ABILITIES = {};

const exported = { RENAMED_ABILITIES, TYPES, CHART, effectiveness, NATURES, ITEMS, ITEM_ONLY, canHold, EVIOLITE_USERS, STAT_NAMES, calcStat };
if (typeof module !== 'undefined') module.exports = exported;
if (typeof window !== 'undefined') window.DEX = exported;
