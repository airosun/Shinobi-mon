// Private rooms: joining, the battle line, rotation, spectating, host controls. Usage: node test/rooms.js
const assert = require('assert');
const { createRooms } = require('../server/rooms.js');
const { Match } = require('../server/match.js');
const { genFighter, sign, verify } = require('../server/engine/roster.js');
const { validateEliteTeam } = require('../server/engine/validate.js');
const AI = require('../server/engine/ai.js');

let passed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('ok  ', name); } catch (e) { console.log('FAIL', name, '\n', e.stack); process.exitCode = 1; } }

const eliteTeam = ids => { const pool = ids.map(id => sign(genFighter(id))); const b = AI.buildTeam(pool, false); return pool.map((p, i) => Object.assign({}, p, b[i])); };

function world() {
  const users = new Map(), matches = new Map(), sent = [], watching = [];
  let clock = 1e6, pending = null, n = 0;
  const timers = { setTimeout: (fn, ms) => (pending = { fn, at: clock + ms }), clearTimeout: t => { if (pending === t) pending = null; } };
  const add = (id, name) => users.set(id, { id, name, sockets: new Set(['s-' + id]), matches: new Set(), lastSeen: clock });
  function startMatch(mode, format, players, room) {
    const id = 'm' + ++n;
    const e = { players: players.map(p => p.clientId), spectators: new Set(), room };
    e.match = new Match({ id, mode, format, room, timed: false, players: players.map(p => ({ id: p.clientId, name: p.name, team: p.team })) });
    matches.set(id, e);
    for (const p of players) users.get(p.clientId).matches.add(id);
    return id;
  }
  const R = createRooms({
    users, matches, startMatch, timers, now: () => clock,
    emitTo: (id, ev, data) => sent.push({ id, ev, data }),
    spectate: (mid, id) => watching.push([mid, id]),
    checkMode: (m, f) => ['standard', 'elite'].includes(m) && ['singles', 'doubles'].includes(f),
    prepTeam: (mode, team) => mode === 'elite' ? validateEliteTeam(team, verify) : { ok: true, team: null },
  });
  const last = id => [...sent].reverse().find(x => x.id === id && x.ev === 'room').data;
  const finish = (mid, winner) => { const e = matches.get(mid); e.match.forfeit(1 - winner); R.matchEnded(e.room, mid, winner); };
  const runTimer = () => { const p = pending; pending = null; clock = p.at; p.fn(); };
  return { users, matches, sent, watching, R, add, last, finish, runTimer, get pending() { return pending; }, tick: ms => { clock += ms; } };
}

(async () => {
  await test('create and join by code; everyone gets the room', () => {
    const w = world(); ['a', 'b', 'c'].forEach(x => w.add(x, x.toUpperCase()));
    const { code } = w.R.create('a', { mode: 'standard', format: 'singles' });
    assert.match(code, /^[A-Z2-9]{5}$/);
    assert.equal(w.R.join('b', code.toLowerCase()).code, code, 'codes are case-insensitive');
    w.R.join('c', code);
    const v = w.last('c');
    assert.equal(v.members.length, 3); assert.equal(v.host, 'a'); assert.equal(v.isHost, false); assert(w.last('a').isHost);
    assert.equal(w.R.join('b', 'ZZZZZ').error.includes('No room'), true);
  });

  await test('host starts: first two in line battle, the rest spectate; then winner stays on', () => {
    const w = world(); ['a', 'b', 'c', 'd'].forEach(x => w.add(x, x.toUpperCase()));
    const { code } = w.R.create('a', { mode: 'standard', format: 'singles', rotation: 'winner' });
    ['b', 'c', 'd'].forEach(x => w.R.join(x, code));
    assert(w.R.act('b', 'start').error, 'only the host can start');
    assert(w.R.act('a', 'start').ok);
    const v = w.last('c');
    assert.deepEqual(v.current.players, ['A', 'B']);
    assert.deepEqual(w.watching.filter(([m]) => m === v.current.id).map(x => x[1]).sort(), ['c', 'd'], 'C and D watch automatically');
    assert.equal(v.members.find(m => m.id === 'c').status, 'up next');
    w.finish(v.current.id, 0);   // A beats B
    let after = w.last('a');
    assert.deepEqual(after.history[0], { p1: 'A', p2: 'B', winner: 'A', at: after.history[0].at });
    assert.deepEqual(after.members.filter(m => m.queue).map(m => m.id), ['a', 'c', 'd', 'b'], 'loser goes to the back');
    assert(after.nextIn > 0, 'next battle is scheduled');
    w.runTimer();
    after = w.last('a');
    assert.deepEqual(after.current.players, ['A', 'C'], 'winner stays on against the next in line');
    assert(w.watching.some(([m, id]) => m === after.current.id && id === 'b'), 'B spectates now');
    assert.equal(after.members.find(m => m.id === 'a').wins, 1);
  });

  await test('rotate: both players go to the back', () => {
    const w = world(); ['a', 'b', 'c', 'd'].forEach(x => w.add(x, x));
    const { code } = w.R.create('a', { mode: 'standard', format: 'doubles', rotation: 'rotate' });
    ['b', 'c', 'd'].forEach(x => w.R.join(x, code));
    w.R.act('a', 'start');
    w.finish(w.last('a').current.id, 1);
    w.runTimer();
    const v = w.last('a');
    assert.deepEqual(v.current.players, ['c', 'd']);
    assert.deepEqual(v.members.filter(m => m.queue).map(m => m.id), ['c', 'd', 'a', 'b']);
  });

  await test('sitting out, offline members and busy players are skipped', () => {
    const w = world(); ['a', 'b', 'c', 'd'].forEach(x => w.add(x, x));
    const { code } = w.R.create('a', { mode: 'standard', format: 'singles' });
    ['b', 'c', 'd'].forEach(x => w.R.join(x, code));
    w.R.act('b', 'queue', { in: false });
    w.users.get('c').sockets.clear();
    w.R.act('a', 'start');
    assert.deepEqual(w.last('a').current.players, ['a', 'd']);
    assert.equal(w.last('a').members.find(m => m.id === 'b').status, 'sitting out');
    assert.equal(w.last('a').members.find(m => m.id === 'c').status, 'offline');
  });

  await test('Elite rooms: you need a valid team to be matched', () => {
    const w = world(); ['a', 'b', 'c'].forEach(x => w.add(x, x));
    const { code } = w.R.create('a', { mode: 'elite', format: 'singles' });
    ['b', 'c'].forEach(x => w.R.join(x, code));
    assert.equal(w.last('a').members.find(m => m.id === 'b').status, 'needs a team');
    assert(w.R.act('a', 'start').error, 'nobody has a team yet');
    assert(w.R.act('a', 'team', { team: [{ species: 'captain-america' }], name: 'bad' }).error, 'invalid teams are refused');
    assert(w.R.act('a', 'team', { team: eliteTeam(['naruto-p1', 'sasuke-p1', 'sakura-p1', 'kakashi-p1', 'gaara-p1', 'itachi']), name: 'Leaf' }).ok);
    assert(w.R.act('c', 'team', { team: eliteTeam(['jiraiya', 'tsunade', 'orochimaru-p1', 'minato', 'kisame', 'deidara']), name: 'Rogues' }).ok);
    assert(w.R.act('a', 'start').ok);
    const v = w.last('b');
    assert.deepEqual(v.current.players, ['a', 'c'], 'B (no team) is skipped');
    assert.equal(w.matches.get(v.current.id).match.view(0).myTeam.length, 6);
    assert.equal(v.members.find(m => m.id === 'a').teamName, 'Leaf');
  });

  await test('host controls: settings between battles, reorder, kick, hand over, pause', () => {
    const w = world(); ['a', 'b', 'c'].forEach(x => w.add(x, x));
    const { code } = w.R.create('a', { mode: 'standard', format: 'singles' });
    ['b', 'c'].forEach(x => w.R.join(x, code));
    assert(w.R.act('b', 'settings', { format: 'doubles' }).error);
    assert(w.R.act('a', 'settings', { format: 'doubles', rotation: 'rotate' }).ok);
    assert.equal(w.last('b').format, 'doubles'); assert.equal(w.last('b').rotation, 'rotate');
    w.R.act('a', 'move', { id: 'c', dir: -1 });
    assert.deepEqual(w.last('a').members.filter(m => m.queue).map(m => m.id), ['a', 'c', 'b']);
    w.R.act('a', 'start');
    assert(w.R.act('a', 'settings', { format: 'singles' }).error, 'not during a battle');
    w.R.act('a', 'pause');
    w.finish(w.last('a').current.id, 0);
    assert.equal(w.pending, null, 'paused: nothing scheduled');
    assert(w.R.act('a', 'kick', { id: 'b' }).ok);
    assert.equal(w.last('a').members.length, 2);
    assert(w.sent.some(x => x.id === 'b' && x.ev === 'roomKicked'));
    w.R.act('a', 'host', { id: 'c' });
    assert.equal(w.last('c').isHost, true);
  });

  await test('host leaving hands the room over; last one out closes it', () => {
    const w = world(); ['a', 'b'].forEach(x => w.add(x, x));
    const { code } = w.R.create('a', { mode: 'standard', format: 'singles' });
    w.R.join('b', code);
    w.R.leave('a');
    assert.equal(w.last('b').host, 'b');
    w.R.leave('b');
    assert.equal(w.R.rooms.size, 0);
    assert(w.R.join('a', code).error);
  });

  await test('chat is filtered; offline members are removed after a while', () => {
    const w = world(); ['a', 'b'].forEach(x => w.add(x, x));
    const { code } = w.R.create('a', { mode: 'standard', format: 'singles' });
    w.R.join('b', code);
    assert(w.R.act('a', 'chat', { text: 'gl hf' }).ok);
    assert.equal(w.last('b').chat.filter(c => !c.sys).pop().text, 'gl hf');
    assert(w.R.act('a', 'chat', { text: 'you are a fucking idiot' }).error);
    w.users.get('b').sockets.clear(); w.tick(4 * 60000);
    w.R.sweep();
    assert.equal(w.last('a').members.length, 1);
  });

  console.log(`${passed} passed`);
})();
