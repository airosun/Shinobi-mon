// Road to 50 Wins: a gauntlet of 50 fixed boss fights (Singles, bring 6 pick 3) against the CPU.
// One run per player (account "u:<id>" or guest browser "g:<id>"), saved in the store after every change,
// so a run can be paused and picked up later on the same account/browser.
//
// Start with a Strike Squad, 6 heroes from your roster, or 6 random heroes. Win a floor and you may
// recruit one hero from the boss's team (for this run only) to replace one of yours. Between floors
// you can change moves and items. Your team is fully healed for every fight. A loss ends the run.
const BOSSES = require('./data/road_bosses.json');
const FIGHTERS = require('../shared/fighters.json');
const MOVES = require('../shared/moves.js');
const { ITEMS } = require('../shared/dex.js');
const { FINAL_SMASH_BY_BASE } = require('../shared/megas.js');
const { buildSet, checkClauses, validateEliteTeam } = require('./engine/validate.js');
const { genFighter, verify } = require('./engine/roster.js');
const AI = require('./engine/ai.js');
const BY_ID = Object.fromEntries(FIGHTERS.map(f => [f.id, f]));

const FLOORS = BOSSES.length;
let store = null;
function useStore(s) { store = s; }

// one operation at a time per player
const locks = new Map();
function locked(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  const tail = next.catch(() => {});
  locks.set(key, tail);
  tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
  return next;
}
const blank = () => ({ run: null, best: 0, clears: 0, runs: 0, lastRun: null });
async function load(key) { return Object.assign(blank(), await store.getRoad(key) || {}); }
const save = (key, d) => store.setRoad(key, d);

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const bossInfo = b => b && { floor: b.floor, name: b.name, milestone: b.milestone, ace: b.ace, bst: b.bst, team: b.team.map(s => ({ species: s.species, gender: s.gender })) };

function view(d) {
  const r = d.run;
  return {
    best: d.best, clears: d.clears, runs: d.runs, lastRun: d.lastRun, floors: FLOORS,
    run: r && {
      id: r.id, source: r.source, started: r.started, floor: r.floor, status: r.status, team: r.team,
      matchId: r.matchId || null, history: r.history.slice(-50),
      boss: r.status === 'active' ? bossInfo(BOSSES[r.floor - 1]) : null,
      // after a win: the beaten boss's heroes, ready to recruit
      recruit: r.recruitFloor ? BOSSES[r.recruitFloor - 1].team.map(s => Object.assign({}, s)) : null,
      recruitFloor: r.recruitFloor || null,
    },
  };
}

// a full, legal set for a run hero (keeps the run's own uid)
function setFor(base, build, errors) {
  const s = buildSet(base, build, errors);
  if (s) s.uid = base.uid;
  return s;
}
// starting moves for a hero without a build: the random option gets truly random moves (2+ attacks)
function randomMoves(species, rng = Math.random) {
  const f = BY_ID[species];
  const attacks = f.learnset.filter(n => MOVES[n].cat !== 'Status');
  const out = new Set();
  while (out.size < Math.min(2, attacks.length)) out.add(attacks[Math.floor(rng() * attacks.length)]);
  while (out.size < Math.min(4, f.learnset.length)) out.add(f.learnset[Math.floor(rng() * f.learnset.length)]);
  return [...out];
}

async function get(key) { return locked(key, async () => view(await load(key))); }

// source: 'elite' (team = 6 signed Elite sets), 'roster' (fighters = 6 signed roster heroes), 'random'
function start(key, { source, team, fighters } = {}) {
  return locked(key, async () => {
    const d = await load(key);
    if (d.run && d.run.status === 'active') return { error: 'You already have a run going. Continue it, or abandon it to start a new one.' };
    let sets;
    if (source === 'elite') {
      const v = validateEliteTeam(team, verify); if (!v.ok) return { error: v.errors.join('\n') };
      sets = v.team;
    } else if (source === 'roster') {
      if (!Array.isArray(fighters) || fighters.length !== 6) return { error: 'Pick 6 heroes from your roster.' };
      const errors = [];
      if (fighters.some(f => !verify(f))) return { error: "Those shinobi aren't all from your Ichiraku Ramen roster." };
      sets = fighters.map(f => setFor(f, { moves: AI.chooseMoves(f, false), item: '' }, errors));
      checkClauses(sets, errors); if (errors.length) return { error: errors.join('\n') };
    } else if (source === 'random') {
      const pool = FIGHTERS.slice(); const picks = [];
      while (picks.length < 6) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      const errors = [];
      sets = picks.map(f => { const b = genFighter(f.id); return setFor(b, { moves: randomMoves(f.id), item: '' }, errors); });
      if (errors.length) return { error: errors.join('\n') };
    } else return { error: 'Choose how to start: a Strike Squad, heroes you own, or a random team.' };
    sets.forEach(s => { s.uid = uid(); delete s.sig; });
    d.run = { id: uid(), source, started: Date.now(), floor: 1, status: 'active', team: sets, history: [], matchId: null, recruitFloor: null };
    d.runs++;
    await save(key, d);
    return view(d);
  });
}

// change moves and items between floors (nature, IVs, ability and gender stay)
function edit(key, builds) {
  return locked(key, async () => {
    const d = await load(key); const r = d.run;
    if (!r || r.status !== 'active') return { error: 'No run in progress.' };
    if (r.matchId) return { error: 'Finish the current fight first.' };
    if (!Array.isArray(builds) || builds.length !== 6) return { error: 'Send a build for all 6 heroes.' };
    const errors = [];
    const sets = r.team.map((base, i) => setFor(base, { moves: (builds[i] || {}).moves, item: (builds[i] || {}).item || '' }, errors));
    checkClauses(sets, errors); if (errors.length) return { error: errors.join('\n') };
    r.team = sets; await save(key, d);
    return view(d);
  });
}

// the floor's fight: returns the player's team and the boss for the server to start a CPU match
function fight(key, startMatch) {
  return locked(key, async () => {
    const d = await load(key); const r = d.run;
    if (!r || r.status !== 'active') return { error: 'No run in progress.' };
    if (r.recruitFloor) return { error: 'Choose whether to recruit a hero first.' };
    if (r.matchId) return { id: r.matchId, resumed: true };
    const boss = BOSSES[r.floor - 1];
    r.matchId = startMatch(r.team.map(s => Object.assign({}, s)), boss);
    await save(key, d);
    return { id: r.matchId };
  });
}

// the server lost track of the fight (restart, or the match was cleaned up): let the player fight again
function fightGone(key, matchId) {
  return locked(key, async () => {
    const d = await load(key);
    if (d.run && d.run.matchId === matchId && d.run.status === 'active') { d.run.matchId = null; await save(key, d); }
    return view(d);
  });
}

// result: 0 = player won, 1 = boss won, null = tie (counts as a loss)
function finished(key, matchId, result, info = {}) {
  return locked(key, async () => {
    const d = await load(key); const r = d.run;
    if (!r || r.matchId !== matchId || r.status !== 'active') return null;
    r.matchId = null;
    const boss = BOSSES[r.floor - 1];
    const won = result === 0;
    r.history.push({ floor: r.floor, boss: boss.name, won, at: Date.now(), lineup: info.lineup || null, replay: matchId });
    if (won) {
      d.best = Math.max(d.best, r.floor);
      if (r.floor >= FLOORS) { r.status = 'cleared'; d.clears++; r.recruitFloor = null; }
      else { r.recruitFloor = r.floor; r.floor++; }
    } else {
      r.status = 'lost';
    }
    // cleared = floors won in that run
    if (r.status !== 'active') d.lastRun = { cleared: won ? FLOORS : r.floor - 1, status: r.status, at: Date.now(), team: r.team.map(s => s.species), lostTo: won ? null : boss.name };
    await save(key, d);
    return view(d);
  });
}

// after a win: take one of the boss's heroes (replacing slot `replace`), or skip (pick = null)
function recruit(key, pick, replace) {
  return locked(key, async () => {
    const d = await load(key); const r = d.run;
    if (!r || !r.recruitFloor) return { error: 'There is no hero to recruit right now.' };
    if (pick !== null && pick !== undefined) {
      const boss = BOSSES[r.recruitFloor - 1];
      const s = boss.team[pick]; if (!s) return { error: 'Pick one of the boss’s heroes.' };
      if (!Number.isInteger(replace) || replace < 0 || replace > 5) return { error: 'Choose which of your heroes to replace.' };
      if (r.team.some((t, i) => i !== replace && t.species === s.species)) return { error: `You already have ${BY_ID[s.species].name} on your team.` };
      const newcomer = Object.assign({}, s, { uid: uid() });
      // item clause: if a teammate already holds that item, the recruit arrives without it
      if (newcomer.item && r.team.some((t, i) => i !== replace && t.item === newcomer.item)) newcomer.item = '';
      r.history[r.history.length - 1].recruited = { species: s.species, replaced: r.team[replace].species };
      r.team[replace] = newcomer;
    }
    r.recruitFloor = null;
    await save(key, d);
    return view(d);
  });
}

function abandon(key) {
  return locked(key, async () => {
    const d = await load(key);
    if (d.run && d.run.status === 'active') d.lastRun = { cleared: d.run.floor - 1, status: 'abandoned', at: Date.now(), team: d.run.team.map(s => s.species) };
    d.run = null; await save(key, d);
    return view(d);
  });
}
// clear a finished run so a new one can start
function dismiss(key) {
  return locked(key, async () => { const d = await load(key); if (d.run && d.run.status !== 'active') d.run = null; await save(key, d); return view(d); });
}

// signing in: a guest's run moves to the account if the account has none going; records combine
function absorb(guestKey, accountKey) {
  return locked(accountKey, () => locked(guestKey, async () => {
    const g = await load(guestKey), a = await load(accountKey);
    if (g.run && g.run.status === 'active' && !(a.run && a.run.status === 'active')) { a.run = g.run; g.run = null; }
    a.best = Math.max(a.best, g.best); a.clears += g.clears; a.runs += g.runs; g.clears = 0; g.runs = 0;
    await save(accountKey, a); await save(guestKey, g);
    return view(a);
  }));
}

const bestOf = async key => { const d = await load(key); return { best: d.best, clears: d.clears, runs: d.runs }; };

module.exports = { useStore, get, start, edit, fight, fightGone, finished, recruit, abandon, dismiss, absorb, bestOf, BOSSES, FLOORS, randomMoves };
