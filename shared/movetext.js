// Plain-English description of what a move does, built from its data. Used for battle tooltips.
(function () {
  const STATUS = { brn: 'burn', par: 'paralyze', psn: 'poison', tox: 'badly poison', slp: 'put to sleep', frz: 'freeze', tri: 'burn, paralyze or freeze' };
  const STAT = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed', accuracy: 'accuracy', evasion: 'evasion' };
  const TARGET = { allFoes: 'Hits both opposing shinobi (75% damage each in doubles).', all: 'Hits everyone else on the field — including your partner (75% damage each in doubles).', randomFoe: 'Hits a random opposing shinobi.' };
  const SPECIAL = {
    fakeout: 'Only works on the first turn after the user comes in. Makes the target flinch.',
    rapidspin: "Removes hazards, Leech Seed and trapping from the user's side and raises its Speed.",
    rollout: 'Doubles in power each turn it is used in a row (up to 5 times).',
    facade: 'Power doubles if the user is burned, poisoned or paralyzed (and burn does not halve it).',
    explosion: 'The user faints after using it.',
    fling: "Throws the user's held item (fails without one).",
    thief: "Steals the target's item if the user has none.",
    bellydrum: 'The user loses half its HP to maximize its Attack.',
    wish: 'At the end of next turn, the shinobi in this slot recovers half of the user\'s max HP.',
    protect: 'Blocks almost every move this turn. Likely to fail if used repeatedly.',
    substitute: 'Uses 1/4 of max HP to make a decoy that takes hits and blocks status moves.',
    encore: 'Forces the target to repeat its last move for 3 turns.',
    disable: "Disables the target's last move for 4 turns.",
    metronome: 'Uses a completely random move.',
    copycat: 'Copies the last move used in the battle.',
    painsplit: 'The user and target share their combined HP evenly.',
    focusenergy: 'Greatly raises the critical-hit ratio.',
    rest: 'Fully heals the user and cures status, then it sleeps for 2 turns.',
    healbell: "Cures the status conditions of the user's whole team.",
    forceswitch: 'Forces the target out and drags in a random shinobi from its team.',
    focuspunch: 'Moves last, and fails if the user is hit before it attacks.',
    crash: 'If it misses, the user loses half its max HP.',
    triplekick: 'Hits 3 times, getting stronger each hit (20, 40, 60).',
    brickbreak: "Shatters the target side's Reflect and Light Screen.",
    revenge: 'Moves last; power doubles if the user was hit by the target this turn.',
    dragout: 'Moves last and forces the target out for a random replacement.',
    bodypress: "Uses the user's Defense instead of Attack.",
    counter: 'Moves last; hits back the last shinobi that used a physical move on the user for double the damage.',
    mirrorcoat: 'Moves last; hits back the last shinobi that used a special move on the user for double the damage.',
    thousandarrows: 'Hits Flying types and shinobi that are floating.',
    pivot: 'The user switches out after using it.',
    futuresight: 'Two turns later, the target slot is hit by a psychic attack.',
    trick: 'Swaps held items with the target.',
    magiccoat: 'Bounces status moves aimed at the user back at their user this turn.',
    hex: 'Power doubles if the target has a status condition.',
    level: "Deals damage equal to the user's level (50).",
    trap: 'The target can\'t switch out while the user is in battle.',
    poltergeist: 'Fails if the target has no held item.',
    outrage: 'The user rampages for 2–3 turns, then becomes confused.',
    knockoff: 'Knocks off the target\'s item; 1.5× power if it has one.',
    sucker: 'Goes first, but fails unless the target is about to use an attacking move.',
    acrobatics: 'Power doubles if the user has no held item.',
    gyroball: 'Stronger the slower the user is compared to the target (up to 150).',
    gigaton: 'A massive hammer blow.',
    steelbeam: 'The user loses half its max HP.',
    freezedry: 'Super effective against Water types.',
    leechseed: 'Each turn, drains 1/8 of the target\'s HP to the user\'s slot. Grass types are immune.',
    ingrain: 'Restores 1/16 HP each turn, but the user can\'t switch out.',
    taunt: 'The target can only use attacking moves for 3 turns.',
    defog: 'Clears hazards on both sides and the target side\'s screens; lowers the target\'s evasion.',
    partingshot: "Lowers the target's Attack and Sp. Atk, then the user switches out.",
    // MARVEL-mon additions
    lifedew: 'Restores 1/4 of max HP to the user and its ally.',
    revival: 'Revives the most recently fainted shinobi on your team with half its HP.',
    healpulse: 'Heals the target (your ally in doubles) by half its max HP. In singles it heals the user.',
    purify: "Cures the target's status (your ally's in doubles, the user's in singles); the user heals half its HP if it cured an ally.",
    wideguard: 'Protects your side from moves that hit more than one shinobi this turn.',
    allyboost: "Raises your ally's Attack and Defense by 1. Fails without an ally.",
    teamboost: 'Raises the stats of the user and its ally.',
    allyswitch: 'The user and its ally swap places. Fails without an ally (Cloak & Dagger tag partners instead).',
    meanlook: "The target can't switch out while the user is in battle.",
    endure: 'The user survives any hit this turn with at least 1 HP. Likely to fail if used repeatedly.',
    lunardance: 'The user faints. The shinobi that replaces it is fully healed (HP, status and PP).',
    curse: 'Ghost types: lose half max HP to curse the target (it loses 1/4 HP every turn). Others: +1 Attack and Defense, −1 Speed.',
    lockon: "The user's next move against the target can't miss.",
    laserfocus: "The user's next attack is a guaranteed critical hit.",
    destinybond: "If the user is knocked out before it moves again, the shinobi that knocked it out faints too.",
    magnetrise: 'The user floats for 5 turns: immune to Ground moves.',
    charge: "Raises Sp. Def by 1, and the user's next Electric move deals double damage.",
    aquaring: 'The user restores 1/16 of its max HP every turn.',
    transform: "The user becomes a copy of the target (types, stats, ability, boosts and moves with 5 PP each) until it switches out.",
    helpinghand: "Goes first and powers up your ally's move by 1.5× this turn. Fails without an ally.",
    imprison: "Opposing shinobi can't use any move the user also knows.",
    tidyup: 'Clears all hazards and substitutes, then raises Attack and Speed by 1.',
    teeterdance: 'Confuses every other shinobi on the field.',
    followme: 'Draws single-target attacks from the other side to the user this turn (doubles only).',
    mimic: 'Replaces this move with the last move the target used (5 PP).',
    splash: 'Does nothing at all. Deadpool thinks it is hilarious.',
    spite: "Removes 4 PP from the target's last move.",
    attract: 'Infatuates a target of the opposite gender (50% chance it can\'t move).',
    captivate: 'Sharply lowers the Sp. Atk of foes of the opposite gender.',
    foresight: "Removes the target's evasion boosts, and Normal and Fighting moves can hit it even if it is a Ghost.",
    confuse: 'Confuses the target.',
    recharge: 'The user must spend the next turn recharging.',
    bind: 'Traps the target for 4–5 turns and deals 1/8 of its max HP each turn.',
    jawlock: 'Neither the user nor the target can switch out.',
    endeavor: "Cuts the target's HP down to the user's HP.",
    reversal: 'The lower the user\'s HP, the stronger it hits (up to 200).',
    superfang: "Halves the target's current HP.",
    lastresort: 'Only works after the user has used each of its other moves.',
    rage: "While the user keeps using Rage, its Attack rises each time it's hit.",
    retaliate: 'Power doubles if an ally fainted last turn.',
    payback: 'Power doubles if the user moves after the target.',
    assurance: 'Power doubles if the target was already hurt this turn.',
    lashout: "Power doubles if the user's stats were lowered this turn.",
    boltbeak: 'Power doubles if the user moves before the target.',
    electroball: 'The faster the user is than the target, the stronger it hits (up to 150).',
    ragefist: 'Gets 50 power stronger each time the user has been hit this battle (up to 350).',
    lastrespects: 'Gets 50 power stronger for each fainted shinobi on your team.',
    firstimpression: 'Only works on the first turn after the user comes in.',
    pollenpuff: 'Damages a foe, or heals an ally by half its max HP.',
    eruption: "The more HP the user has, the stronger it hits (up to 150).",
    eeriespell: "Removes 3 PP from the target's last move.",
    clearsmog: "Removes all of the target's stat changes.",
    venoshock: 'Power doubles if the target is poisoned.',
    alluring: 'Confuses the target if its stats rose this turn.',
    mindblown: 'The user loses half its max HP.',
    burnup: 'The user loses its Fire type afterwards.',
    spectralthief: "Steals the target's stat boosts before attacking.",
    flyingpress: 'Fighting- and Flying-type at once.',
    expandingforce: 'Stronger (1.5×) when the user is on Psychic Terrain.',
    risingvoltage: 'Power doubles if the target is on Electric Terrain.',
    weatherball: 'Changes type and doubles in power in rain, sun or snow.',
    foulplay: "Uses the target's Attack stat instead of the user's.",
    psyblade: 'Stronger (1.5×) on Electric Terrain.',
    futuresight: 'Hits the target 2 turns later.',
  };
  const TERRAIN = { electric: 'Sets a Lightning Field for 5 turns: grounded shinobi deal 1.3× with Lightning moves and can\'t fall asleep.', psychic: 'Sets a Genjutsu Field for 5 turns: grounded shinobi deal 1.3× with Yin moves and are protected from priority moves.', misty: "Sets Misty Terrain for 5 turns: grounded shinobi can't get status conditions and take half damage from Dragon moves." };
  const HAZ = { spikes: 'Sets Spikes on the opposing side: grounded shinobi switching in take damage (stacks 3 times).', toxicspikes: 'Sets Toxic Spikes: grounded shinobi switching in are poisoned (2 layers = badly poisoned).', stealthrock: 'Sets Stealth Rock: shinobi switching in take Rock-type damage.', stickyweb: 'Sets Sticky Web: grounded shinobi switching in lose Speed.' };
  const SIDE = { auroraveil: 'Only works in snow: reduces physical and special damage to your side for 5 turns.', luckychant: 'Your side can\'t be hit by critical hits for 5 turns.', reflect: 'Halves physical damage to your side for 5 turns (2/3 in doubles).', lightscreen: 'Halves special damage to your side for 5 turns (2/3 in doubles).', tailwind: "Doubles your side's Speed for 4 turns." };
  const WEATHER = { sun: 'Sets harsh sunlight for 5 turns: Fire moves 1.5×, Water moves 0.5×.', rain: 'Sets rain for 5 turns: Water moves 1.5×, Fire moves 0.5×.', snow: 'Sets snow for 5 turns: Ice types get 1.5× Defense.' };
  const boostText = (b, who, bare) => {
    const list = Object.entries(b).filter(([k]) => k !== 'target');
    const same = list.every(([, v]) => v === list[0][1]);
    const verb = v => (v > 0 ? (bare ? 'raise' : 'Raises') : (bare ? 'lower' : 'Lowers'));
    if (same) return `${verb(list[0][1])} ${who} ${list.map(([k]) => STAT[k]).join(' and ')} by ${Math.abs(list[0][1])}`;
    return list.map(([k, v], i) => `${i ? verb(v).toLowerCase() : verb(v)} ${who} ${STAT[k]} by ${Math.abs(v)}`).join(', ');
  };

  function describe(m) {
    if (!m) return '';
    const parts = [];
    if (m.requiresForm) parts.push('Only usable after the user transforms.');
    if (m.cat === 'Status') {
      if (m.status) parts.push(`${STATUS[m.status][0].toUpperCase() + STATUS[m.status].slice(1)}s the target.`);
      if (m.boosts) parts.push(boostText(m.boosts, m.boosts.target === 'self' ? "the user's" : "the target's") + '.');
      if (m.heal) parts.push(`Restores ${Math.round(m.heal * 100)}% of max HP${m.sunHeal ? ' (more in sun, less in rain/snow)' : ''}.`);
      if (m.hazard) parts.push(HAZ[m.hazard]);
      if (m.side) parts.push(SIDE[m.side]);
      if (m.weather) parts.push(WEATHER[m.weather]);
      if (m.field === 'trickroom') parts.push('For 5 turns, slower shinobi move first.');
      if (m.field === 'gravity') parts.push('For 5 turns, everyone is grounded and moves are more accurate.');
      if (m.field === 'magicroom') parts.push('For 5 turns, held items have no effect.');
      if (m.terrain) parts.push(TERRAIN[m.terrain]);
    } else {
      if (m.multihit) parts.push(Array.isArray(m.multihit) ? `Hits ${m.multihit[0]}–${m.multihit[1]} times.` : `Hits ${m.multihit} times${m.multiacc ? ' (each hit checks accuracy)' : ''}.`);
      if (m.crit) parts.push('High critical-hit ratio.');
      if (m.recoil) parts.push(`The user takes ${Math.round(m.recoil * 100)}% of the damage dealt as recoil.`);
      if (m.drain) parts.push(`The user recovers ${Math.round(m.drain * 100)}% of the damage dealt.`);
      if (m.charge) parts.push(m.semi ? `Turn 1: the user ${{ fly: 'flies up', dig: 'digs underground', dive: 'dives underwater', phantom: 'vanishes' }[m.semi]} and avoids most attacks. Turn 2: it attacks.` : `Charges on turn 1, attacks on turn 2${m.sunSkip ? ' (no charge in sun)' : ''}.`);
      if (m.chargeBoost) parts.push(boostText(m.chargeBoost, "the user's") + ' while charging.');
      for (const e of m.sec || []) {
        const c = e.chance >= 100 ? '' : `${e.chance}% chance to `;
        if (e.status) parts.push(`${c ? c : 'Always '}${STATUS[e.status]}${c ? '' : 's'} the target.`);
        if (e.volatile === 'flinch') parts.push(`${c || ''}${c ? 'make' : 'Makes'} the target flinch.`);
        if (e.volatile === 'confusion') parts.push(`${c || ''}${c ? 'confuse' : 'Confuses'} the target.`);
        if (e.boosts) parts.push(`${c ? c + boostText(e.boosts, "the target's", true) : boostText(e.boosts, "the target's")}.`);
        if (e.self) parts.push(`${c ? c + boostText(e.self, "the user's", true) : boostText(e.self, "the user's")}.`);
      }
      if (m.selfBoost) parts.push(boostText(m.selfBoost, "the user's") + '.');
      if (m.ignoreDefBoosts) parts.push("Ignores the target's stat changes.");
      if (m.useDef) parts.push("Damage is calculated against the target's Defense.");
      if (m.breaksProtect) parts.push('Breaks through Protect.');
      if (m.hitsSemi) parts.push(`Can hit shinobi that are ${m.hitsSemi.map(x => ({ fly: 'in the air', dig: 'underground', dive: 'underwater' }[x])).join(' or ')}.`);
    }
    if (m.special && SPECIAL[m.special]) parts.push(SPECIAL[m.special]);
    if (TARGET[m.target]) parts.push(TARGET[m.target]);
    if (m.prio > 0) parts.push(`Priority +${m.prio}: usually moves first.`);
    if (m.prio < 0 && !['focuspunch', 'revenge', 'dragout', 'counter', 'mirrorcoat'].includes(m.special)) parts.push(`Priority ${m.prio}: moves after most others.`);
    const flags = [];
    if (m.contact) flags.push('contact');
    for (const f of ['punch', 'bite', 'sound', 'pulse', 'bullet', 'slicing', 'kick', 'wind', 'beam', 'dance']) if (m[f]) flags.push({ bullet: 'ball/bomb' }[f] || f);
    if (!parts.length) parts.push(m.cat === 'Status' ? 'A status move.' : 'A plain attack with no extra effect.');
    return { text: parts.join(' ').replace(/\s+/g, ' ').trim(), flags };
  }
  const api = { describe };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.MOVETEXT = api;
})();
