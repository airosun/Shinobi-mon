// Fuzz test: random teams (any 4 moves from each hero's pool, any ability, any item) making random
// legal choices, in singles and doubles. Every move, ability and item gets used a lot, so this catches
// engine crashes and stuck battles that the CPU-vs-CPU simulation (which plays "sensibly") would miss.
// Usage: node test/fuzz.js [battles per format]
const { Battle, FIGHTERS, MOVES } = require('../server/engine/battle.js');
const { ITEMS, NATURES, canHold } = require('../shared/dex.js');

const N = +process.argv[2] || 300;
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1]);
const used = { moves: new Set(), abilities: new Set(), items: new Set() };

function randomTeam(n) {
  const items = shuffle(Object.keys(ITEMS));
  return shuffle(FIGHTERS).slice(0, n).map((f, i) => {
    const moves = shuffle(f.learnset).slice(0, 4);
    const ability = Math.random() < 0.5 ? f.abilities[0].name : f.hidden.name;
    const item = Math.random() < 0.9 ? (items.find(x => canHold(x, f.id) && !items.taken?.has(x)) || '') : '';
    items.taken = items.taken || new Set(); items.taken.add(item);
    moves.forEach(m => used.moves.add(m)); used.abilities.add(ability); if (item) used.items.add(item);
    const ivs = Object.fromEntries(['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map(s => [s, Math.floor(Math.random() * 32)]));
    return { uid: 'u' + i, species: f.id, nature: pick(Object.keys(NATURES)), ivs, ability, item, moves };
  });
}

function randomChoice(b, n) {
  const req = b.getRequest(n);
  const side = b.sides[n];
  if (req.kind === 'switch') {
    const bench = shuffle(b.bench(side));
    return { switches: req.slots.map((pos, k) => ({ pos, index: bench[k].teamIndex })) };
  }
  const actions = []; const switching = new Set();
  for (const a of req.actives) {
    if (!a) continue;
    if (a.locked || a.struggle) { actions.push({ pos: a.pos, type: 'move', index: 0 }); continue; }
    if (a.canSwitch && Math.random() < 0.1) {
      const opt = b.bench(side).find(m => !switching.has(m.teamIndex));
      if (opt) { switching.add(opt.teamIndex); actions.push({ pos: a.pos, type: 'switch', index: opt.teamIndex }); continue; }
    }
    const mv = pick(a.moves.filter(x => !x.disabled));
    const targets = b.allActive().filter(m => m !== side.active[a.pos]);
    const t = targets.length ? pick(targets) : null;
    actions.push({ pos: a.pos, type: 'move', index: mv.index, target: t ? { side: t.side.n, pos: t.pos } : undefined });
  }
  return { actions };
}

for (const format of ['singles', 'doubles']) {
  const bring = format === 'doubles' ? 4 : 3;
  let turns = 0;
  for (let i = 0; i < N; i++) {
    const b = new Battle({ format, players: [{ name: 'P1', team: randomTeam(bring) }, { name: 'P2', team: randomTeam(bring) }] });
    let steps = 0;
    try {
      while (!b.ended) {
        if (++steps > 5000) throw new Error('stuck');
        if (b.turn > 200) { b.endByTimer(); break; }
        let acted = false;
        for (const s of [0, 1]) {
          const req = b.getRequest(s);
          if (req.kind !== 'move' && req.kind !== 'switch') continue;
          const c = randomChoice(b, s);
          const err = b.choose(s, c);
          if (err) throw new Error(`choice rejected (${req.kind}): ${err} ${JSON.stringify(c)}`);
          acted = true; break;
        }
        if (!acted && !b.ended) throw new Error('deadlock in phase ' + b.phase);
      }
      // the log must never carry NaN HP
      if (b.log.some(e => e.a && e.a.k === 'hp' && !Number.isFinite(e.a.hp))) throw new Error('NaN HP in log');
    } catch (e) {
      console.error(`${format} battle ${i} failed at turn ${b.turn}:`, e.stack);
      console.error(b.log.slice(-25).map(e => e.text).join('\n'));
      process.exit(1);
    }
    turns += b.turn;
  }
  console.log(`${format}: ${N} random battles OK · avg ${(turns / N).toFixed(1)} turns`);
}
const allMoves = new Set(FIGHTERS.flatMap(f => f.learnset));
console.log(`moves used ${[...allMoves].filter(m => used.moves.has(m)).length}/${allMoves.size}, abilities ${used.abilities.size}, items ${used.items.size}/${Object.keys(ITEMS).length}`);
