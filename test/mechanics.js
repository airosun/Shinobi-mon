// Targeted checks of Shinobi-mon rules. Usage: node test/mechanics.js
const assert = require('assert');
const { Battle } = require('../server/engine/battle.js');
const { sign, verify, genFighter, rollPool } = require('../server/engine/roster.js');
const { validateStandardBuild } = require('../server/engine/validate.js');
const DEX = require('../shared/dex.js');
const MOVES = require('../shared/moves.js');
const FIGHTERS = require('../shared/fighters.json');
const { FINAL_SMASHES } = require('../shared/megas.js');
const ABILITIES = require('../server/engine/abilities.js');

const ivs31 = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const BY = Object.fromEntries(FIGHTERS.map(f => [f.id, f]));
const mk = (species, moves, extra = {}) => Object.assign({ species, ability: BY[species].abilities[0].name, moves, nature: 'Hardy', ivs: ivs31 }, extra);
function seeded(s) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
const battle = (t1, t2, format = 'singles') => new Battle({ format, players: [{ name: 'A', team: t1 }, { name: 'B', team: t2 }], rng: seeded(7) });
const mv = (index, extra = {}) => ({ actions: [Object.assign({ pos: 0, type: 'move', index }, extra)] });
let passed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('ok  ', name); } catch (e) { console.log('FAIL', name, '\n', e.stack); process.exitCode = 1; } }

(async () => {
  await test('type chart: 19 types, 2x / 0.5x, dual types multiply, no immunities', () => {
    assert.equal(DEX.TYPES.length, 19);
    for (const a of DEX.TYPES) for (const d of DEX.TYPES) assert([0.5, 1, 2].includes(DEX.effectiveness(a, [d])), `${a} vs ${d}`);
    assert.equal(DEX.effectiveness('Water', ['Fire']), 2);
    assert.equal(DEX.effectiveness('Fire', ['Water']), 0.5);
    assert.equal(DEX.effectiveness('Fire', ['Wind', 'Wood']), 4);
    assert.equal(DEX.effectiveness('Earth', ['Lightning', 'Wood']), 0.25);
  });

  await test('every shinobi, move and ability is wired up', () => {
    assert.equal(FIGHTERS.length, 109);
    for (const f of FIGHTERS) {
      for (const t of f.types) assert(DEX.TYPES.includes(t), f.id + ' type ' + t);
      for (const n of f.learnset) assert(MOVES[n], f.id + ' move ' + n);
      for (const a of [...f.abilities, f.hidden]) assert(ABILITIES[a.name], f.id + ' ability ' + a.name);
    }
    for (const m of Object.values(MOVES)) assert(DEX.TYPES.includes(m.type), m.name + ' has a type');
    for (const fs of Object.values(FINAL_SMASHES)) assert(ABILITIES[fs.ability.name], fs.id + ' ability');
  });

  await test('transformations: +100 BST, HP unchanged, types change, once per team', () => {
    for (const fs of Object.values(FINAL_SMASHES)) {
      const base = BY[fs.base]; const sum = s => Object.values(s).reduce((a, b) => a + b, 0);
      assert.equal(fs.stats.hp, base.stats.hp, fs.id + ' hp');
      assert.equal(sum(fs.stats) - sum(base.stats), 100, fs.id + ' bst');
    }
    const stone = Object.keys(FINAL_SMASHES).find(k => FINAL_SMASHES[k].base === 'naruto-p1');
    const b = battle([mk('naruto-p1', ['Rasengan'], { item: stone })], [mk('sasuke-p1', ['Substitution Jutsu'])]);
    b.choose(0, mv(0, { mega: true })); b.choose(1, mv(0));
    const me = b.sides[0].team[0];
    assert(me.mega && b.sides[0].megaUsed);
    assert.deepEqual(me.types, FINAL_SMASHES[stone].types);
  });

  await test('transform-only jutsu are disabled until the shinobi transforms', () => {
    const night = 'Night Guy'; assert(MOVES[night].requiresForm);
    const stone = Object.keys(FINAL_SMASHES).find(k => FINAL_SMASHES[k].base === 'guy');
    const b = battle([mk('guy', [night, 'Dynamic Entry'], { item: stone })], [mk('kisame', ['Substitution Jutsu'])]);
    const req = b.getRequest(0);
    assert(req.actives[0].moves[0].disabled, 'disabled before transforming');
    b.choose(0, mv(1, { mega: true })); b.choose(1, mv(0));
    assert(!b.getRequest(0).actives[0].moves[0].disabled, 'usable after transforming');
  });

  await test('status immunities follow the new types', () => {
    const b = battle([mk('sasuke-p1', ['Substitution Jutsu'])], [mk('tenten-p1', ['Substitution Jutsu'])]);
    assert(!b.canStatus(b.sides[1].team[0], 'psn'), 'Weapon types are not poisoned');
    assert(!b.canStatus(b.sides[0].team[0], 'brn'), 'Fire types are not burned');
  });

  await test('one version of each shinobi per team; draft pools never repeat one', () => {
    const picks = ['naruto-p1', 'naruto-sage', 'sasuke-p1', 'sakura-p1', 'kakashi-p1', 'gaara-p1'].map(id => sign(genFighter(id)));
    const builds = picks.map(p => ({ moves: [BY[p.species].learnset[0]], item: '' }));
    const r = validateStandardBuild(picks, builds);
    assert(!r.ok && r.errors.some(e => /Only one version of Naruto/.test(e)));
    for (let i = 0; i < 30; i++) {
      const pool = rollPool(20, seeded(i + 1)); const bases = pool.map(p => BY[p.species].baseId);
      assert.equal(new Set(bases).size, bases.length);
    }
  });

  await test('turn order is by Speed: only a few quick jutsu have priority', () => {
    const quick = Object.values(MOVES).filter(m => m.prio > 0 && m.prio < 4 && !['followme'].includes(m.special)).map(m => m.name).sort();
    assert.deepEqual(quick, ['Dynamic Entry', 'Explosive Tag Kunai', 'Flying Thunder God Strike', 'Hair Needle Senbon', 'Hidden Needle Shot', 'Kunai & Shuriken', 'Senbon Volley', 'Shuriken Volley', 'Thousand Years of Death']);
    // the only negative priority: counter jutsu that move last, like Counter / Mirror Coat
    assert.deepEqual(Object.values(MOVES).filter(m => m.prio < 0).map(m => m.name).sort(), ['Sharingan: Copy', 'Uchiha Return']);
    const b = battle([mk('naruto-p1', ['Rasengan'])], [mk('minato', ['Rasengan'])]);   // Minato is faster
    b.choose(0, mv(0)); b.choose(1, mv(0));
    const used = b.log.filter(l => / used Rasengan!/.test(l.text)).map(l => l.text);
    assert(/Minato/.test(used[0]), 'faster shinobi moves first');
  });

  await test('every ability has its own effect; new lore effects work', () => {
    const seen = new Map();
    const canon = v => v && typeof v === 'object' && !Array.isArray(v) ? '{' + Object.keys(v).sort().map(k => k + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v);
    for (const [n, sp] of Object.entries(ABILITIES)) { const k = canon(sp); assert(!seen.has(k), `${n} duplicates ${seen.get(k)}`); seen.set(k, n); }
    // Kurenai's genjutsu on entry
    let b = battle([mk('kurenai', ['Substitution Jutsu'])], [mk('naruto-p1', ['Rasengan'])]);
    assert(b.sides[1].team[0].v.confusion, 'Genjutsu Mistress confuses on entry');
    // Shino's insects drain every turn
    b = battle([mk('shino-p1', ['Substitution Jutsu'])], [mk('naruto-p1', ['Substitution Jutsu'])]);
    b.choose(0, mv(0)); b.choose(1, mv(0));
    assert(b.sides[1].team[0].hp < b.sides[1].team[0].maxhp, 'Kikaichu Host drains');
    // Hidan shares the pain
    b = battle([mk('hidan', ['Kunai & Shuriken'], { ability: 'Blood Price' })], [mk('raikage-a', ['Kunai & Shuriken'])]);
    b.choose(0, mv(0)); b.choose(1, mv(0));
    assert(b.sides[1].team[0].hp < b.sides[1].team[0].maxhp, 'Blood Price reflects damage');
  });

  await test('roster signatures detect tampering', () => {
    const f = sign(genFighter('itachi'));
    assert(verify(f));
    assert(!verify(Object.assign({}, f, { nature: f.nature === 'Modest' ? 'Timid' : 'Modest' })));
  });

  console.log(`${passed} passed`);
})();
