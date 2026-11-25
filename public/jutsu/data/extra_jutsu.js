// Shinobi-mon's own jutsu: moves added in Shinobi-mon that aren't in Shinobi Showdown. Importing this adds them to the
// JUTSU table so battles and the Animation Studio treat them like any other jutsu with its own animation.
import { JUTSU } from './jutsu.js';

const J = (id, name, category, desc, users) => ({ id, name, category, nature: null, power: 0, cost: 0, priority: 0, target: 'enemy', desc, effects: [], smUsers: users });
export const EXTRA_JUTSU = {
  animal_path_summoning: J('animal_path_summoning', 'Animal Path: Summoning', 'ninjutsu', 'Summons a giant rhino that charges the target.', ['nagato_pain', 'nagato_reanimated']),
  summoning_garuda: J('summoning_garuda', 'Summoning: Garuda', 'ninjutsu', 'Summons Garuda, a giant hawk, to strike the target.', ['sasuke_ship', 'sasuke_ms', 'sasuke_war']),
  puppet_flamethrower: J('puppet_flamethrower', 'Puppet Flamethrower', 'ninjutsu', 'A puppet breathes fire at the target.', ['sasori']),
  earth_dragon_bullet: J('earth_dragon_bullet', 'Earth Release: Earth Dragon Bullet', 'ninjutsu', 'An earth dragon spits mud bullets.', ['onoki', 'kurotsuchi']),
  substitution_jutsu: J('substitution_jutsu', 'Substitution Jutsu', 'support', 'Swap places with a log.', ['naruto_ship', 'sasuke_ship', 'kakashi_ship']),
  king_of_hell: J('king_of_hell', 'Naraka Path: King of Hell', 'support', 'The King of Hell restores the user.', ['nagato_pain', 'nagato_reanimated']),
  clay_clone: J('clay_clone', 'Clay Clone', 'support', 'A clay copy of the user takes hits.', ['deidara']),
  thousand_years_of_death: J('thousand_years_of_death', 'Thousand Years of Death', 'taijutsu', 'A sneaky jab from behind.', ['kakashi_p1', 'kakashi_ship', 'kakashi_dms']),
  bone_armor: J('bone_armor', 'Bone Armor', 'support', 'Bones burst out as armour.', ['kimimaro']),
  manipulated_mace: J('manipulated_mace', 'Manipulated Tools: Mace', 'taijutsu', 'Hurls a giant spiked mace.', ['tenten_p1', 'tenten_ship']),
  susanoo_ribcage: J('susanoo_ribcage', "Susano'o Ribcage", 'support', 'A Susano’o ribcage guards the user.', ['sasuke_ms', 'sasuke_war']),
  recharge: J('recharge', 'Recharge', 'support', 'The user catches their breath.', ['naruto_ship']),
};
for (const [id, j] of Object.entries(EXTRA_JUTSU)) if (!JUTSU[id]) JUTSU[id] = j;
