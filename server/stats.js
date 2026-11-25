// Turns stored battle sides into a player's record, their most-used heroes, and site-wide usage.
const FIGHTERS = require('../shared/fighters.json');
const NAME = Object.fromEntries(FIGHTERS.map(f => [f.id, f.name]));

function record(sides) {
  const groups = {};
  for (const s of sides) {
    const k = `${s.mode}:${s.format}:${s.vsCpu ? 'cpu' : 'pvp'}`;
    const g = groups[k] = groups[k] || { mode: s.mode, format: s.format, vsCpu: s.vsCpu, wins: 0, losses: 0, ties: 0 };
    if (s.result === 'W') g.wins++; else if (s.result === 'L') g.losses++; else g.ties++;
  }
  const all = sides.reduce((a, s) => { a[s.result]++; return a; }, { W: 0, L: 0, T: 0 });
  const pvp = sides.filter(s => !s.vsCpu).reduce((a, s) => { a[s.result]++; return a; }, { W: 0, L: 0, T: 0 });
  return { total: { wins: all.W, losses: all.L, ties: all.T }, pvp: { wins: pvp.W, losses: pvp.L, ties: pvp.T }, groups: Object.values(groups) };
}

function fighterTable(sides, { won = s => s.result === 'W' } = {}) {
  const t = {};
  for (const s of sides) for (const sp of s.team || []) {
    const r = t[sp] = t[sp] || { species: sp, name: NAME[sp] || sp, games: 0, wins: 0 };
    r.games++; if (won(s)) r.wins++;
  }
  return Object.values(t).sort((a, b) => b.games - a.games || b.wins - a.wins);
}

function usage(sides) {
  const rows = fighterTable(sides, { won: s => s.won });
  const teams = sides.length;
  return { teams, rows: rows.map(r => ({ ...r, usage: teams ? r.games / teams : 0, winRate: r.games ? r.wins / r.games : 0 })) };
}

module.exports = { record, fighterTable, usage };
