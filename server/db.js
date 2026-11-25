// Storage for accounts, sessions, saved rosters/teams and Battle Pass rolls.
// With DATABASE_URL set (e.g. a free Neon Postgres) everything is stored in Postgres and survives
// restarts. Without it (local dev, tests) it falls back to memory plus a best-effort data/db.json file,
// which a Render free instance loses on every restart.
const fs = require('fs');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  username_lc TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS user_data (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pass_state (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS road_state (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS battles (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  mode TEXT NOT NULL, format TEXT NOT NULL,
  p1_name TEXT NOT NULL, p2_name TEXT NOT NULL,
  p1_user INTEGER, p2_user INTEGER,
  p1_cpu BOOLEAN NOT NULL DEFAULT false, p2_cpu BOOLEAN NOT NULL DEFAULT false,
  winner SMALLINT, turns INTEGER NOT NULL DEFAULT 0,
  p1_team TEXT[] NOT NULL, p2_team TEXT[] NOT NULL,
  replay JSONB
);
CREATE INDEX IF NOT EXISTS battles_created ON battles(created_at DESC);
CREATE INDEX IF NOT EXISTS battles_p1 ON battles(p1_user);
CREATE INDEX IF NOT EXISTS battles_p2 ON battles(p2_user);
CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data JSONB NOT NULL
);`;
const KEEP_REPLAYS = 5000;   // older battles keep their result but drop the replay data
const summary = r => ({ id: r.id, created: r.created_at, mode: r.mode, format: r.format, players: [r.p1_name, r.p2_name], cpu: [r.p1_cpu, r.p2_cpu], users: [r.p1_user, r.p2_user], winner: r.winner, turns: r.turns, teams: [r.p1_team, r.p2_team], hasReplay: r.has_replay !== undefined ? r.has_replay : !!r.replay });

function postgresStore(url) {
  const { Pool } = require('pg');
  const local = /localhost|127\.0\.0\.1|\/var\/run|host=\//.test(url);
  const pool = new Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: true }, max: 5 });
  const q = (text, params) => pool.query(text, params);
  const one = async (text, params) => (await q(text, params)).rows[0] || null;
  return {
    kind: 'postgres',
    async init() { await q(SCHEMA); await q('DELETE FROM sessions WHERE expires_at < now()'); },
    async createUser(username, passHash) {
      try { return await one('INSERT INTO users (username, username_lc, pass_hash) VALUES ($1, $2, $3) RETURNING id, username', [username, username.toLowerCase(), passHash]); }
      catch (e) { if (e.code === '23505') return null; throw e; }
    },
    getUserByName: name => one('SELECT id, username, pass_hash FROM users WHERE username_lc = $1', [name.toLowerCase()]),
    async createSession(tokenHash, userId, expires) { await q('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [tokenHash, userId, expires]); },
    getSession: tokenHash => one('SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()', [tokenHash]),
    async deleteSession(tokenHash) { await q('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]); },
    async setPassword(userId, passHash) { await q('UPDATE users SET pass_hash = $2 WHERE id = $1', [userId, passHash]); await q('DELETE FROM sessions WHERE user_id = $1', [userId]); },
    async getData(userId) { const r = await one('SELECT data, version FROM user_data WHERE user_id = $1', [userId]); return r ? { data: r.data, version: r.version } : { data: null, version: 0 }; },
    // optimistic concurrency: only writes when the caller saw the latest version; returns the new version or null
    async setData(userId, data, version) {
      if (version === 0) {
        const r = await one('INSERT INTO user_data (user_id, data, version) VALUES ($1, $2, 1) ON CONFLICT (user_id) DO NOTHING RETURNING version', [userId, data]);
        return r ? r.version : null;
      }
      const r = await one('UPDATE user_data SET data = $2, version = version + 1, updated_at = now() WHERE user_id = $1 AND version = $3 RETURNING version', [userId, data, version]);
      return r ? r.version : null;
    },
    async getPass(key) { const r = await one('SELECT data FROM pass_state WHERE key = $1', [key]); return r ? r.data : null; },
    async setPass(key, data) { await q('INSERT INTO pass_state (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data', [key, data]); },
    async getRoad(key) { const r = await one('SELECT data FROM road_state WHERE key = $1', [key]); return r ? r.data : null; },
    async setRoad(key, data) { await q('INSERT INTO road_state (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data', [key, data]); },
    async saveBattle(b) {
      await q(`INSERT INTO battles (id, mode, format, p1_name, p2_name, p1_user, p2_user, p1_cpu, p2_cpu, winner, turns, p1_team, p2_team, replay)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING`,
        [b.id, b.mode, b.format, b.players[0], b.players[1], b.users[0], b.users[1], b.cpu[0], b.cpu[1], b.winner, b.turns, b.teams[0], b.teams[1], b.replay]);
      if (Math.random() < 0.02) await q(`UPDATE battles SET replay = NULL WHERE replay IS NOT NULL AND id NOT IN (SELECT id FROM battles WHERE replay IS NOT NULL ORDER BY created_at DESC LIMIT ${KEEP_REPLAYS})`);
    },
    async getBattle(id) { const r = await one('SELECT * FROM battles WHERE id = $1', [id]); return r && Object.assign(summary(r), { replay: r.replay }); },
    async recentBattles({ userId = null, limit = 20 } = {}) {
      const where = userId == null ? 'WHERE NOT (p1_cpu OR p2_cpu)' : 'WHERE p1_user = $2 OR p2_user = $2';
      const rows = (await q(`SELECT id, created_at, mode, format, p1_name, p2_name, p1_user, p2_user, p1_cpu, p2_cpu, winner, turns, p1_team, p2_team, (replay IS NOT NULL) AS has_replay FROM battles ${where} ORDER BY created_at DESC LIMIT $1`, userId == null ? [limit] : [limit, userId])).rows;
      return rows.map(summary);
    },
    async userSides(userId) {
      const rows = (await q(`SELECT mode, format, p2_cpu AS vs_cpu, winner, 0 AS me, p1_team AS team FROM battles WHERE p1_user = $1
        UNION ALL SELECT mode, format, p1_cpu, winner, 1, p2_team FROM battles WHERE p2_user = $1`, [userId])).rows;
      return rows.map(r => ({ mode: r.mode, format: r.format, vsCpu: r.vs_cpu, result: r.winner === null ? 'T' : r.winner === r.me ? 'W' : 'L', team: r.team }));
    },
    // since: a Date, or null for all time
    async usageSides({ since = null, days = null, format = null } = {}) {
      if (days) since = new Date(Date.now() - days * 864e5);
      const rows = (await q(`SELECT p1_team AS team, winner = 0 AS won FROM battles WHERE NOT p1_cpu AND ($1::timestamptz IS NULL OR created_at > $1) AND ($2::text IS NULL OR format = $2)
        UNION ALL SELECT p2_team, winner = 1 FROM battles WHERE NOT p2_cpu AND ($1::timestamptz IS NULL OR created_at > $1) AND ($2::text IS NULL OR format = $2)`, [since, format])).rows;
      return rows.map(r => ({ team: r.team, won: !!r.won }));
    },
    async getUserById(id) { return one('SELECT id, username, created_at FROM users WHERE id = $1', [id]); },
    async getProfile(userId) { const r = await one('SELECT data FROM profiles WHERE user_id = $1', [userId]); return r ? r.data : null; },
    async setProfile(userId, data) { await q('INSERT INTO profiles (user_id, data) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data', [userId, data]); },
    async close() { await pool.end(); },
  };
}

function memoryStore(file) {
  let s = { users: [], sessions: {}, data: {}, pass: {}, road: {}, battles: [], profiles: {}, nextId: 1 };
  if (file) { try { s = Object.assign(s, JSON.parse(fs.readFileSync(file, 'utf8'))); } catch {} }
  let timer = null;
  const save = () => {
    if (!file) return;
    clearTimeout(timer);
    timer = setTimeout(() => { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(s)); } catch {} }, 300);
  };
  const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
  return {
    kind: 'memory',
    async init() {},
    async createUser(username, passHash) {
      if (s.users.some(u => u.username_lc === username.toLowerCase())) return null;
      const u = { id: s.nextId++, username, username_lc: username.toLowerCase(), pass_hash: passHash, created_at: new Date().toISOString() };
      s.users.push(u); save(); return { id: u.id, username };
    },
    async getUserByName(name) { const u = s.users.find(x => x.username_lc === name.toLowerCase()); return u ? { id: u.id, username: u.username, pass_hash: u.pass_hash } : null; },
    async createSession(tokenHash, userId, expires) { s.sessions[tokenHash] = { userId, expires: +expires }; save(); },
    async getSession(tokenHash) {
      const x = s.sessions[tokenHash]; if (!x || x.expires < Date.now()) return null;
      const u = s.users.find(y => y.id === x.userId); return u ? { id: u.id, username: u.username } : null;
    },
    async deleteSession(tokenHash) { delete s.sessions[tokenHash]; save(); },
    async setPassword(userId, passHash) {
      const u = s.users.find(y => y.id === userId); if (u) u.pass_hash = passHash;
      for (const [k, v] of Object.entries(s.sessions)) if (v.userId === userId) delete s.sessions[k];
      save();
    },
    async getData(userId) { const r = s.data[userId]; return r ? { data: clone(r.data), version: r.version } : { data: null, version: 0 }; },
    async setData(userId, data, version) {
      const r = s.data[userId];
      if ((r ? r.version : 0) !== version) return null;
      s.data[userId] = { data: clone(data), version: version + 1 }; save(); return version + 1;
    },
    async getPass(key) { return clone(s.pass[key] || null); },
    async setPass(key, data) { s.pass[key] = clone(data); save(); },
    async getRoad(key) { return clone((s.road || {})[key] || null); },
    async setRoad(key, data) { (s.road = s.road || {})[key] = clone(data); save(); },
    async saveBattle(b) {
      if (s.battles.some(x => x.id === b.id)) return;
      s.battles.push(Object.assign(clone(b), { created: new Date().toISOString() }));
      const withReplay = s.battles.filter(x => x.replay);
      if (withReplay.length > KEEP_REPLAYS) withReplay.slice(0, withReplay.length - KEEP_REPLAYS).forEach(x => { x.replay = null; });
      if (s.battles.length > 20000) s.battles.splice(0, s.battles.length - 20000);
      save();
    },
    async getBattle(id) { const b = s.battles.find(x => x.id === id); return b ? Object.assign(clone(b), { hasReplay: !!b.replay }) : null; },
    async recentBattles({ userId = null, limit = 20 } = {}) {
      const list = s.battles.filter(b => userId == null ? !b.cpu[0] && !b.cpu[1] : b.users[0] === userId || b.users[1] === userId);
      return list.slice(-limit).reverse().map(b => { const { replay, ...rest } = b; return Object.assign(clone(rest), { hasReplay: !!replay }); });
    },
    async userSides(userId) {
      const out = [];
      for (const b of s.battles) for (const me of [0, 1]) if (b.users[me] === userId) out.push({ mode: b.mode, format: b.format, vsCpu: b.cpu[1 - me], result: b.winner === null ? 'T' : b.winner === me ? 'W' : 'L', team: b.teams[me] });
      return out;
    },
    async usageSides({ since = null, days = null, format = null } = {}) {
      const from = days ? Date.now() - days * 864e5 : since ? +since : 0; const out = [];
      for (const b of s.battles) if (Date.parse(b.created) > from && (!format || b.format === format)) for (const n of [0, 1]) if (!b.cpu[n]) out.push({ team: b.teams[n], won: b.winner === n });
      return out;
    },
    async getUserById(id) { const u = s.users.find(x => x.id === id); return u ? { id: u.id, username: u.username, created_at: u.created_at || null } : null; },
    async getProfile(userId) { return clone(s.profiles[userId] || null); },
    async setProfile(userId, data) { s.profiles[userId] = clone(data); save(); },
    async close() {},
  };
}

function createStore(opts = {}) {
  const url = opts.url !== undefined ? opts.url : process.env.DATABASE_URL;
  if (url) return postgresStore(url);
  return memoryStore(opts.file !== undefined ? opts.file : path.join(__dirname, '..', 'data', 'db.json'));
}

module.exports = { createStore };
