// Fuzz test: full Standard matches (draft -> build -> lineup -> battle) between two CPU players,
// in singles and doubles. Catches engine crashes, rejected choices and stuck battles.
// Usage: node test/simulate.js [matches per format]
const { Battle } = require('../server/engine/battle.js');
const { rollPool } = require('../server/engine/roster.js');
const { validateStandardBuild } = require('../server/engine/validate.js');
const AI = require('../server/engine/ai.js');

const N = +process.argv[2] || 200;
function runOne(format) {
  const bring = format === 'doubles' ? 4 : 3;
  const teams = [0, 1].map(() => {
    const pool = rollPool(20);
    const bases = AI.draftSix(pool).map(i => pool[i]);
    const v = validateStandardBuild(bases, AI.buildTeam(bases, format === 'doubles'));
    if (!v.ok) throw new Error('CPU build rejected: ' + v.errors.join('; '));
    return v.team;
  });
  const lineups = [0, 1].map(n => AI.chooseLineup(teams[n], teams[1 - n], bring).map(i => teams[n][i]));
  const b = new Battle({ format, players: [{ name: 'P1', team: lineups[0] }, { name: 'P2', team: lineups[1] }] });
  let steps = 0;
  while (!b.ended) {
    if (++steps > 4000) throw new Error('stuck');
    if (b.turn > 300) { b.forfeit(0); break; }
    let acted = false;
    for (const s of [0, 1]) {
      const req = b.getRequest(s);
      if (req.kind === 'move' || req.kind === 'switch') {
        const c = AI.chooseAction(b, s);
        const err = b.choose(s, c);
        if (err) throw new Error(`choice rejected (${req.kind}): ${err} ${JSON.stringify(c)}`);
        acted = true; break;
      }
    }
    if (!acted && !b.ended) throw new Error('deadlock in phase ' + b.phase);
  }
  return b;
}
for (const format of ['singles', 'doubles']) {
  let turns = 0, max = 0;
  for (let i = 0; i < N; i++) {
    let b;
    try { b = runOne(format); } catch (e) { console.error(`${format} match ${i} failed:`, e.stack); process.exit(1); }
    turns += b.turn; max = Math.max(max, b.turn);
  }
  console.log(`${format}: ${N} matches OK · avg ${(turns / N).toFixed(1)} turns · max ${max}`);
}
