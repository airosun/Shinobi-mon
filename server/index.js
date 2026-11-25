const fs = require('fs');
// Shinobi-mon server: lobby, challenges, matchmaking queues, CPU matches, spectating, chat.
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { Match } = require('./match.js');
const { createRooms } = require('./rooms.js');
const Road = require('./road.js');
const { validateEliteTeam } = require('./engine/validate.js');
const { verify, genFighter } = require('./engine/roster.js');
const AI = require('./engine/ai.js');
const Pass = require('./pass.js');
const { createStore } = require('./db.js');
const { setupAuth, userFromCookie } = require('./auth.js');
const UserData = require('./userdata.js');
const Stats = require('./stats.js');
const { calc } = require('./calc.js');
const { sanitizeProfile, cleanForDisplay } = require('./profile.js');
const MOVES = require('../shared/moves.js');
const FIGHTERS = require('../shared/fighters.json');
const DEX = require('../shared/dex.js');
const MEGAS = require('../shared/megas.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const store = createStore();
Pass.useStore(store); Road.useStore(store);
app.set('trust proxy', 1);
setupAuth(app, store, { secure: process.env.NODE_ENV === 'production' });

// jutsu animation pieces (public/jutsu/img): the animations look up which drawn pieces have an image file
app.get('/jutsu/img/index.json', (req, res) => {
  try { res.json(fs.readdirSync(path.join(__dirname, '..', 'public', 'jutsu', 'img')).filter(f => f !== 'index.json')); } catch { res.json([]); }
});
// Animation Studio: /studio (page) and /api/studio/* (saved edits). Saving needs STUDIO_KEY.
require('./studio').mountStudio(app);
app.get('/studio', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'studio', 'index.html')));
app.use(express.static(path.join(__dirname, '..', 'public')));
for (const f of ['typechart.js', 'dex.js', 'movetext.js', 'megas.js', 'genders.js', 'cardcolors.js']) app.get('/shared/' + f, (req, res) => res.sendFile(path.join(__dirname, '..', 'shared', f)));
const dexPayload = JSON.stringify({ fighters: FIGHTERS, moves: MOVES, items: DEX.ITEMS, natures: DEX.NATURES, types: DEX.TYPES, chart: DEX.CHART, eviolite: DEX.EVIOLITE_USERS, renamed: DEX.RENAMED_ABILITIES, finalSmashes: MEGAS.FINAL_SMASHES, forms: MEGAS.FORMS, pass: { perDay: Pass.ROLLS_PER_DAY, keep: Pass.KEEP_PER_ROLL } });
// hand-drawn sprites made by tools/process_sprites.py (public/sprites/<id>[_female|_male]_<front|back>.png)
function drawnSprites() {
  try { return require('fs').readdirSync(path.join(__dirname, '..', 'public', 'sprites')).filter(f => /\.png$/i.test(f)).map(f => f.replace(/\.png$/i, '')); } catch { return []; }
}
const drawnList = drawnSprites();
// how tall each drawn hero stands in its sprite (written by the sprite script); used to crop back views evenly
let drawnH = {};
try { drawnH = JSON.parse(require('fs').readFileSync(path.join(__dirname, '..', 'public', 'sprites', 'manifest.json'), 'utf8')); } catch {}
app.get('/api/dex', (req, res) => res.type('json').send(dexPayload.slice(0, -1) + ',"drawn":' + JSON.stringify(drawnList) + ',"drawnH":' + JSON.stringify(drawnH) + '}'));
app.get('/healthz', (req, res) => res.send('ok'));

// ---------- replays, stats, damage calc ----------
const api = fn => (req, res) => Promise.resolve(fn(req, res)).catch(e => { console.error(req.path, e.message); res.status(500).json({ error: 'Something went wrong.' }); });
app.get('/replay/:id', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.get('/animations', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));   // move animation gallery
app.get('/api/replay/:id', api(async (req, res) => {
  const b = await store.getBattle(String(req.params.id).slice(0, 20));
  if (!b) return res.status(404).json({ error: 'That replay does not exist.' });
  if (!b.replay) return res.status(410).json({ error: 'That replay has expired. Only the most recent battles keep their replays.' });
  res.json(b);
}));
app.get('/api/replays/recent', api(async (req, res) => res.json({ battles: await store.recentBattles({ limit: 25 }) })));
app.get('/api/stats/me', api(async (req, res) => {
  const user = await userFromCookie(store, req.headers.cookie);
  if (!user) return res.status(401).json({ error: 'Sign in to see your record.' });
  const sides = await store.userSides(user.id);
  res.json({ username: user.username, record: Stats.record(sides), fighters: Stats.fighterTable(sides).slice(0, 15), recent: await store.recentBattles({ userId: user.id, limit: 20 }) });
}));
// start of today in US Eastern time (the same day the Battle Pass uses)
function startOfTodayET() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date()).map(p => [p.type, p.value]));
  const secs = (+parts.hour % 24) * 3600 + (+parts.minute) * 60 + (+parts.second);
  return new Date(Date.now() - secs * 1000);
}
const usageCache = new Map();   // short cache so the home page doesn't query on every visit
app.get('/api/stats/usage', api(async (req, res) => {
  const format = ['singles', 'doubles'].includes(req.query.format) ? req.query.format : null;
  const period = ['today', 'all', '7', '30', '90'].includes(String(req.query.period || req.query.days)) ? String(req.query.period || req.query.days) : '30';
  const key = period + ':' + format; const hit = usageCache.get(key);
  if (hit && Date.now() - hit.t < 30000) return res.json(hit.v);
  const since = period === 'today' ? startOfTodayET() : period === 'all' ? null : new Date(Date.now() - (+period) * 864e5);
  const v = Object.assign({ period, days: /^\d+$/.test(period) ? +period : null, format }, Stats.usage(await store.usageSides({ since, format })));
  usageCache.set(key, { t: Date.now(), v });
  res.json(v);
}));
// ---------- Battler Cards ----------
async function publicProfile(user) {
  const [prof, sides, road] = await Promise.all([store.getProfile(user.id), store.userSides(user.id), Road.bestOf('u:' + user.id)]);
  const p = cleanForDisplay(prof) || {};
  const rec = Stats.record(sides);
  return { username: user.username, joined: user.created_at || null, color: p.color || 'classic', avatar: p.avatar || null, title: p.title || '', bio: p.bio || '', favoriteTeam: p.favoriteTeam || null,
    record: { total: rec.total, pvp: rec.pvp }, battles: sides.length, top: Stats.fighterTable(sides).slice(0, 3), road };
}
app.get('/api/profile/:username', api(async (req, res) => {
  const u = await store.getUserByName(String(req.params.username).slice(0, 20));
  if (!u) return res.status(404).json({ error: 'No player with that name.' });
  res.json(await publicProfile(await store.getUserById(u.id)));
}));
app.post('/api/account/profile', api(async (req, res) => {
  const me = await userFromCookie(store, req.headers.cookie);
  if (!me) return res.status(401).json({ error: 'Sign in first.' });
  const data = (await store.getData(me.id)).data;
  const prof = sanitizeProfile(req.body, UserData.sanitize(data || {}));
  if (prof.error) return res.status(400).json({ error: prof.error });
  await store.setProfile(me.id, prof);
  const u = users.get('u:' + me.id); if (u) { u.avatar = prof.avatar; broadcastLobby(); }
  res.json(await publicProfile(await store.getUserById(me.id)));
}));
app.post('/api/calc', express.json({ limit: '10kb' }), (req, res) => { try { res.json(calc(req.body)); } catch (e) { console.error('calc', e.message); res.status(400).json({ error: 'Could not calculate that.' }); } });

// ---------------- state ----------------
const users = new Map();     // clientId -> { id, name, sockets:Set, matches:Set, searching:null|{key, team}, lastSeen }
const matches = new Map();   // id -> { match, players:[clientId|'cpu'], spectators:Set(socketId), endedAt }
const challenges = new Map(); // `${from}->${to}` -> { from, to, mode, format, team }
const queues = new Map();    // `${mode}:${format}` -> [clientId]
const lobbyChat = [];

const MODES = ['standard', 'elite'], FORMATS = ['singles', 'doubles'];
const LABEL = { standard: 'Quick Match', elite: 'Competitive', singles: 'Singles', doubles: 'Doubles' };
const clean = s => String(s || '').replace(/[<>]/g, '').trim().slice(0, 24);
const userList = () => [...users.values()].filter(u => u.sockets.size).map(u => ({ id: u.id, name: u.name, account: !!u.account, avatar: u.avatar || null, searching: u.searching ? u.searching.key : null }));
// live matches for the lobby (private-room battles aren't listed)
const matchList = () => [...matches.entries()].filter(([, e]) => !e.match.ended && !e.room).map(([id, e]) => ({ id, p1: e.match.players[0].name, p2: e.match.players[1].name, mode: e.match.mode, format: e.match.format, phase: e.match.phase, turn: e.match.battle ? e.match.battle.turn : 0 }));
function broadcastLobby() { io.to('lobby').emit('lobby', { users: userList(), matches: matchList() }); }
function emitTo(clientId, ev, data) { const u = users.get(clientId); if (u) for (const sid of u.sockets) io.to(sid).emit(ev, data); }

function checkMode(mode, format) { return MODES.includes(mode) && FORMATS.includes(format); }
function prepTeam(mode, team) {
  if (mode !== 'elite') return { ok: true, team: null };
  return validateEliteTeam(team, verify);
}

// ---------------- matches ----------------
function startMatch(mode, format, players, room = null, road = null) {
  const timed = players.every(p => p.clientId !== 'cpu');
  const id = Math.random().toString(36).slice(2, 10);
  const entry = { players: players.map(p => p.clientId), spectators: new Set(), endedAt: null, room, road: road && road.key };
  matches.set(id, entry);
  for (const p of players) if (p.clientId !== 'cpu') { const u = users.get(p.clientId); if (u) { u.matches.add(id); u.searching = null; } }
  entry.match = new Match({
    id, mode, format,
    players: players.map(p => ({ id: p.clientId, name: p.name, cpu: p.clientId === 'cpu', team: p.team, skill: p.skill })),
    onUpdate: () => onMatchUpdate(id), timed, room, road: road && road.info,
  });
  onMatchUpdate(id);
  broadcastLobby();
  return id;
}
function onMatchUpdate(id) {
  const e = matches.get(id); if (!e || !e.match) return;
  e.players.forEach((cid, i) => { if (cid !== 'cpu') emitTo(cid, 'match', e.match.view(i)); });
  for (const sid of e.spectators) io.to(sid).emit('match', e.match.view(null));
  if (e.match.ended && !e.endedAt) {
    e.endedAt = Date.now(); broadcastLobby();
    const userIds = e.players.map(cid => /^u:\d+$/.test(cid) ? +cid.slice(2) : null);
    const rec = e.match.record(userIds);
    if (rec) store.saveBattle(rec).catch(err => console.error('could not save battle', err.message));
    if (e.room) rooms.matchEnded(e.room, id, e.match.result ?? null);
    if (e.road) {
      const lineup = e.match.players[0].lineup ? e.match.players[0].lineup.map(i => e.match.players[0].team[i].species) : null;
      Road.finished(e.road, id, e.match.result ?? null, { lineup }).then(v => { if (v) emitTo(e.road, 'road', v); }).catch(err => console.error('road result', err.message));
    }
  }
}
// Road to 50 Wins: the floor's boss fight (always Singles, bring 6 pick 3)
function startRoadMatch(clientId, name, team, boss) {
  return startMatch('elite', 'singles', [
    { clientId, name, team },
    { clientId: 'cpu', name: boss.name, team: boss.team.map(s => Object.assign({}, s)), skill: boss.skill },
  ], null, { key: clientId, info: { floor: boss.floor, boss: boss.name, milestone: boss.milestone } });
}
// a user (all their open tabs) starts watching a match
function spectateUser(matchId, clientId) {
  const e = matches.get(matchId), u = users.get(clientId); if (!e || !u) return;
  for (const sid of u.sockets) { e.spectators.add(sid); io.to(sid).emit('match', e.match.view(null)); }
}
const rooms = createRooms({ users, matches, startMatch, emitTo, spectate: spectateUser, checkMode, prepTeam });
function cpuEliteTeam(format) {
  const pool = FIGHTERS.slice().sort(() => Math.random() - 0.5).slice(0, 6).map(f => genFighter(f));
  const builds = AI.buildTeam(pool, format === 'doubles');
  return pool.map((b, i) => Object.assign({}, b, builds[i]));
}

setInterval(() => { const now = Date.now(); for (const e of matches.values()) if (e.match && e.match.timed && !e.match.ended) e.match.tick(now); }, 1000);

setInterval(() => {
  const now = Date.now();
  for (const [id, e] of matches) {
    if (e.endedAt && now - e.endedAt > 15 * 60 * 1000) { matches.delete(id); continue; }
    if (!e.match.ended) e.players.forEach((cid, i) => {
      if (cid === 'cpu') return;
      const u = users.get(cid);
      // Road to 50 fights wait for the player (pausing is allowed); after 12 hours away the fight is dropped
      // and simply starts over from the beginning of that floor next time
      if (e.road) { if ((!u || !u.sockets.size) && now - ((u && u.lastSeen) || 0) > 12 * 3600000) { matches.delete(id); Road.fightGone(e.road, id).catch(() => {}); } return; }
      if (u && !u.sockets.size && now - u.lastSeen > 180000) e.match.forfeit(i);
    });
  }
  rooms.sweep();
}, 15000);

// ---------------- sockets ----------------
io.on('connection', socket => {
  let me = null;
  // signed-in players are identified by their account; guests by their browser id
  const account = userFromCookie(store, socket.handshake.headers.cookie).catch(() => null);
  let helloDone; const ready = new Promise(r => { helloDone = r; });
  socket.on('hello', async ({ clientId, name }) => {
    const acct = await account;
    const id = acct ? 'u:' + acct.id : 'g:' + (String(clientId || '').slice(0, 40) || socket.id);
    me = users.get(id);
    if (!me) { me = { id, account: acct, name: acct ? acct.username : clean(name) || 'Guest' + Math.floor(Math.random() * 9000 + 1000), sockets: new Set(), matches: new Set(), searching: null }; users.set(id, me); }
    else if (!acct && clean(name)) me.name = clean(name);
    me.sockets.add(socket.id); me.lastSeen = Date.now();
    if (acct && me.avatar === undefined) { me.avatar = null; store.getProfile(acct.id).then(p => { me.avatar = (p && p.avatar) || null; broadcastLobby(); }).catch(() => {}); }
    socket.join('lobby');
    socket.emit('welcome', { id: me.id, name: me.name, account: acct && { id: acct.id, username: acct.username }, chat: lobbyChat.slice(-50), pass: await Pass.status(me.id).catch(() => null) });
    for (const mid of me.matches) { const e = matches.get(mid); if (e) socket.emit('match', e.match.view(e.players.indexOf(me.id))); }
    rooms.reconnect(me.id); rooms.presenceChanged(me.id);
    broadcastLobby();
    helloDone();
  });
  const need = fn => async (...args) => { await ready; if (me) fn(...args); };
  const reply = (ack, data) => typeof ack === 'function' && ack(data);

  socket.on('rename', need(name => { const n = clean(name); if (n && !me.account) { me.name = n; socket.emit('welcome', { id: me.id, name: me.name }); broadcastLobby(); } }));
  socket.on('chat', need(({ room, text }) => {
    text = String(text || '').slice(0, 300).trim(); if (!text) return;
    if (room === 'lobby') {
      const msg = { name: me.name, text, t: Date.now() };
      lobbyChat.push(msg); if (lobbyChat.length > 200) lobbyChat.shift();
      io.to('lobby').emit('chat', { room, msg });
    } else if (matches.has(room)) {
      const m = matches.get(room).match;
      (m.battle ? m.battle.log : m.log).push({ cls: 'chat', text: `${me.name}: ${text}` });
      onMatchUpdate(room);
    }
  }));

  // ----- Battle Pass -----
  const safe = p => p.catch(e => { console.error(e.message); return { error: 'Something went wrong. Try again.' }; });
  socket.on('pass:status', need(async (_, ack) => reply(ack, await safe(Pass.status(me.id)))));
  socket.on('pass:roll', need(async (_, ack) => reply(ack, await safe(Pass.roll(me.id)))));
  socket.on('pass:claim', need(async ({ uids } = {}, ack) => {
    const res = await safe(Pass.claim(me.id, uids));
    // signed in: kept heroes go straight into the saved roster, so they can't be lost
    if (me.account && res.fighters) await safe(saveWith(me.account.id, d => ({ ...d, roster: (d.roster || []).concat(res.fighters) })));
    reply(ack, res);
  }));

  // ----- saved roster and Strike Squads (signed-in players) -----
  async function saveWith(userId, change) {
    for (let tries = 0; tries < 5; tries++) {
      const cur = await store.getData(userId);
      const data = UserData.sanitize(change(cur.data || {}));
      const version = await store.setData(userId, data, cur.version);
      if (version) return { data, version };
    }
    throw new Error('could not save user data');
  }
  socket.on('data:load', need(async (_, ack) => {
    if (!me.account) return reply(ack, { error: 'Not signed in.' });
    const r = await safe(store.getData(me.account.id));
    reply(ack, r.error ? r : { data: UserData.sanitize(r.data || {}), version: r.version });
  }));
  socket.on('data:save', need(async ({ data, version } = {}, ack) => {
    if (!me.account) return reply(ack, { error: 'Not signed in.' });
    if (JSON.stringify(data || {}).length > 1e6) return reply(ack, { error: 'That is too much to save.' });
    const tidy = UserData.sanitize(data);
    const v = await safe(store.setData(me.account.id, tidy, +version || 0));
    if (v && v.error) return reply(ack, v);
    if (v) { reply(ack, { version: v }); for (const sid of me.sockets) if (sid !== socket.id) io.to(sid).emit('data:changed'); return; }
    const cur = await safe(store.getData(me.account.id));   // changed elsewhere (another tab or device)
    reply(ack, { conflict: true, data: UserData.sanitize(cur.data || {}), version: cur.version });
  }));
  socket.on('data:import', need(async ({ data, guestId } = {}, ack) => {
    if (!me.account) return reply(ack, { error: 'Not signed in.' });
    if (JSON.stringify(data || {}).length > 1e6) return reply(ack, { error: 'That is too much to import.' });
    const r = await safe(saveWith(me.account.id, cur => UserData.merge(cur, data)));
    if (r.error) return reply(ack, r);
    const pass = guestId ? await safe(Pass.absorb('g:' + String(guestId).slice(0, 40), me.id)) : await safe(Pass.status(me.id));
    if (guestId) await safe(Road.absorb('g:' + String(guestId).slice(0, 40), me.id));   // a guest's Road to 50 run moves to the account
    reply(ack, { ...r, pass });
  }));

  // ----- starting matches -----
  socket.on('cpu', need(({ mode, format, team }, ack) => {
    if (!checkMode(mode, format)) return reply(ack, { error: 'Unknown mode.' });
    const v = prepTeam(mode, team); if (!v.ok) return reply(ack, { error: v.errors.join('\n') });
    const id = startMatch(mode, format, [{ clientId: me.id, name: me.name, team: v.team }, { clientId: 'cpu', name: 'CPU', team: mode === 'elite' ? cpuEliteTeam(format) : null }]);
    reply(ack, { id });
  }));
  socket.on('search', need(({ mode, format, team }, ack) => {
    if (!checkMode(mode, format)) return reply(ack, { error: 'Unknown mode.' });
    const v = prepTeam(mode, team); if (!v.ok) return reply(ack, { error: v.errors.join('\n') });
    const key = `${mode}:${format}`;
    for (const q of queues.values()) { const i = q.indexOf(me.id); if (i >= 0) q.splice(i, 1); }
    const q = (queues.get(key) || []).filter(id => { const u = users.get(id); return id !== me.id && u && u.sockets.size && u.searching && u.searching.key === key; });
    queues.set(key, q);
    if (q.length) {
      const opp = users.get(q.shift());
      const oppTeam = opp.searching.team; opp.searching = null;
      emitTo(opp.id, 'searchStatus', { searching: null });
      const id = startMatch(mode, format, [{ clientId: opp.id, name: opp.name, team: oppTeam }, { clientId: me.id, name: me.name, team: v.team }]);
      reply(ack, { id });
    } else { me.searching = { key, team: v.team }; q.push(me.id); reply(ack, { searching: key }); }
    broadcastLobby();
  }));
  socket.on('cancelSearch', need(() => {
    for (const q of queues.values()) { const i = q.indexOf(me.id); if (i >= 0) q.splice(i, 1); }
    me.searching = null; socket.emit('searchStatus', { searching: null }); broadcastLobby();
  }));
  socket.on('challenge', need(({ to, mode, format, team }, ack) => {
    const target = users.get(to);
    if (!target || to === me.id || !target.sockets.size) return reply(ack, { error: 'That player is not online.' });
    if (!checkMode(mode, format)) return reply(ack, { error: 'Unknown mode.' });
    const v = prepTeam(mode, team); if (!v.ok) return reply(ack, { error: v.errors.join('\n') });
    challenges.set(`${me.id}->${to}`, { from: me.id, to, mode, format, team: v.team });
    emitTo(to, 'challenged', { from: me.id, name: me.name, mode, format, label: `${LABEL[mode]} ${LABEL[format]}` });
    reply(ack, { ok: true });
  }));
  socket.on('cancelChallenge', need(({ to }) => { challenges.delete(`${me.id}->${to}`); emitTo(to, 'challengeCancelled', { from: me.id }); }));
  socket.on('respond', need(({ from, accept, team }, ack) => {
    const key = `${from}->${me.id}`; const ch = challenges.get(key);
    if (!ch) return reply(ack, { error: 'That challenge is no longer available.' });
    if (!accept) { challenges.delete(key); emitTo(from, 'challengeDeclined', { by: me.name }); return reply(ack, { ok: true }); }
    const v = prepTeam(ch.mode, team); if (!v.ok) return reply(ack, { error: v.errors.join('\n') });
    challenges.delete(key);
    const opp = users.get(from);
    const id = startMatch(ch.mode, ch.format, [{ clientId: from, name: opp ? opp.name : 'Player', team: ch.team }, { clientId: me.id, name: me.name, team: v.team }]);
    emitTo(from, 'challengeAccepted', {});
    reply(ack, { id });
  }));

  // ----- Road to 50 Wins -----
  const roadView = async () => {
    let v = await Road.get(me.id);
    if (v.run && v.run.matchId && !matches.has(v.run.matchId)) v = await Road.fightGone(me.id, v.run.matchId);   // server restarted mid-fight
    return v;
  };
  socket.on('road:get', need(async (_, ack) => reply(ack, await safe(roadView()))));
  socket.on('road:start', need(async (opts, ack) => reply(ack, await safe(Road.start(me.id, opts || {})))));
  socket.on('road:edit', need(async ({ builds } = {}, ack) => reply(ack, await safe(Road.edit(me.id, builds)))));
  socket.on('road:fight', need(async (_, ack) => {
    await safe(roadView());
    reply(ack, await safe(Road.fight(me.id, (team, boss) => startRoadMatch(me.id, me.name, team, boss))));
  }));
  socket.on('road:recruit', need(async ({ pick, replace } = {}, ack) => reply(ack, await safe(Road.recruit(me.id, pick ?? null, replace)))));
  socket.on('road:abandon', need(async (_, ack) => {
    const cur = await safe(Road.get(me.id));
    if (cur && cur.run && cur.run.matchId) { const e = matches.get(cur.run.matchId); if (e) { e.road = null; if (!e.match.ended) e.match.forfeit(0); } }
    reply(ack, await safe(Road.abandon(me.id)));
  }));
  socket.on('road:dismiss', need(async (_, ack) => reply(ack, await safe(Road.dismiss(me.id)))));

  // ----- private rooms -----
  socket.on('room:create', need((opts, ack) => reply(ack, rooms.create(me.id, opts || {}))));
  socket.on('room:join', need(({ code } = {}, ack) => reply(ack, rooms.join(me.id, code))));
  socket.on('room:leave', need((_, ack) => { rooms.leave(me.id); reply(ack, { ok: true }); }));
  socket.on('room:act', need(({ type, data } = {}, ack) => reply(ack, rooms.act(me.id, type, data || {}))));

  // ----- in a match -----
  socket.on('act', need(({ id, action }, ack) => {
    const e = matches.get(id); if (!e) return reply(ack, { error: 'Match not found.' });
    const n = e.players.indexOf(me.id); if (n < 0) return reply(ack, { error: 'You are not in this match.' });
    const err = e.match.act(n, action || {});
    reply(ack, err ? { error: err } : { ok: true });
  }));
  socket.on('spectate', need(({ id }, ack) => {
    const e = matches.get(id); if (!e) return reply(ack, { error: 'Match not found.' });
    const n = e.players.indexOf(me.id);
    if (n >= 0) socket.emit('match', e.match.view(n));
    else { e.spectators.add(socket.id); socket.emit('match', e.match.view(null)); }
    reply(ack, { ok: true });
  }));
  // rematch: vs CPU starts right away; vs a player both have to ask. Same mode, format and Strike Squads.
  socket.on('rematch', need(({ id } = {}, ack) => {
    const e = matches.get(id); if (!e || !e.match.ended) return reply(ack, { error: 'That match is not over.' });
    const n = e.players.indexOf(me.id); if (n < 0) return reply(ack, { error: 'You were not in that match.' });
    if (e.room) return reply(ack, { error: 'In a room, the next battle starts automatically.' });
    if (e.match.road) return reply(ack, { error: 'Road to 50 fights can’t be rematched.' });
    if (e.rematchId) return reply(ack, { id: e.rematchId });
    const m = e.match;
    const seat = i => ({ clientId: e.players[i], name: m.players[i].name, team: m.mode === 'elite' ? (e.players[i] === 'cpu' ? cpuEliteTeam(m.format) : m.players[i].team) : null });
    const begin = () => { e.rematchId = startMatch(m.mode, m.format, [seat(0), seat(1)]); m.rematch = null; for (const cid of e.players) if (cid !== 'cpu') emitTo(cid, 'rematchStart', { from: id, id: e.rematchId }); return e.rematchId; };
    if (e.players.includes('cpu')) return reply(ack, { id: begin() });
    const other = e.players[1 - n]; const ou = users.get(other);
    if (!ou || !ou.sockets.size) return reply(ack, { error: 'Your opponent has left.' });
    m.rematch = m.rematch || [false, false]; m.rematch[n] = true;
    if (m.rematch[0] && m.rematch[1]) return reply(ack, { id: begin() });
    onMatchUpdate(id);
    reply(ack, { waiting: true });
  }));

  socket.on('leave', need(({ id }) => {
    const e = matches.get(id); if (!e) return;
    e.spectators.delete(socket.id);
    if (e.match.ended) me.matches.delete(id);
  }));

  socket.on('disconnect', () => {
    if (!me) return;
    me.sockets.delete(socket.id); me.lastSeen = Date.now();
    for (const e of matches.values()) e.spectators.delete(socket.id);
    if (!me.sockets.size) { me.searching = null; for (const q of queues.values()) { const i = q.indexOf(me.id); if (i >= 0) q.splice(i, 1); } }
    rooms.presenceChanged(me.id);
    broadcastLobby();
  });
});

store.init().then(() => {
  if (store.kind === 'memory' && process.env.NODE_ENV === 'production') console.warn('DATABASE_URL is not set: accounts and Battle Pass rolls are kept in memory and will be lost on restart.');
  server.listen(PORT, () => console.log(`Shinobi-mon running on http://localhost:${PORT} (storage: ${store.kind})`));
}).catch(e => { console.error('Could not connect to the database:', e.message); process.exit(1); });
