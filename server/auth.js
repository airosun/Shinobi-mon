// Accounts: username + password sign-in with server-side sessions in an httpOnly cookie.
const crypto = require('crypto');

const COOKIE = 'shinobimon_session';
const SESSION_DAYS = 60;
const USERNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;
const MIN_PASSWORD = 8;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function checkPassword(pw, stored) {
  const [kind, salt, hash] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const got = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), want.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(want, got);
}
// Only a hash of each session token is stored, so a leaked database can't be used to sign in.
const tokenHash = t => crypto.createHash('sha256').update(String(t)).digest('hex');

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch {}
  }
  return out;
}

function validateCredentials(username, password) {
  username = String(username || '').trim(); password = String(password || '');
  if (!USERNAME_RE.test(username)) return { error: 'Usernames are 3–20 letters, numbers, _ or -.' };
  if (password.length < MIN_PASSWORD) return { error: `Passwords need at least ${MIN_PASSWORD} characters.` };
  if (password.length > 200) return { error: 'That password is too long.' };
  return { username, password };
}

// Very small in-memory throttle for failed sign-ins: 10 failures per IP per 15 minutes.
const failures = new Map();
function throttled(ip) {
  const now = Date.now(); const f = failures.get(ip);
  if (!f || now - f.start > 15 * 60 * 1000) return false;
  return f.count >= 10;
}
function noteFailure(ip) {
  const now = Date.now(); const f = failures.get(ip);
  if (!f || now - f.start > 15 * 60 * 1000) failures.set(ip, { start: now, count: 1 }); else f.count++;
}

function setupAuth(app, store, { secure }) {
  const express = require('express');
  app.use('/api/account', express.json({ limit: '20kb' }));

  const cookieOpts = maxAgeSec => `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
  async function startSession(res, user) {
    const token = crypto.randomBytes(32).toString('base64url');
    await store.createSession(tokenHash(token), user.id, new Date(Date.now() + SESSION_DAYS * 864e5));
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; ${cookieOpts(SESSION_DAYS * 86400)}`);
  }
  const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error('account error:', e.message); res.status(500).json({ error: 'Something went wrong. Try again.' }); });

  app.get('/api/account', wrap(async (req, res) => {
    const user = await userFromCookie(store, req.headers.cookie);
    res.json({ user: user && { id: user.id, username: user.username }, storage: store.kind });
  }));
  app.post('/api/account/register', wrap(async (req, res) => {
    const v = validateCredentials(req.body && req.body.username, req.body && req.body.password);
    if (v.error) return res.status(400).json({ error: v.error });
    const user = await store.createUser(v.username, hashPassword(v.password));
    if (!user) return res.status(409).json({ error: 'That username is taken.' });
    await startSession(res, user);
    res.json({ user: { id: user.id, username: user.username } });
  }));
  app.post('/api/account/login', wrap(async (req, res) => {
    const ip = req.ip || 'x';
    if (throttled(ip)) return res.status(429).json({ error: 'Too many failed sign-ins. Wait a few minutes and try again.' });
    const username = String((req.body && req.body.username) || '').trim(); const password = String((req.body && req.body.password) || '');
    const user = username && await store.getUserByName(username);
    if (!user || !checkPassword(password, user.pass_hash)) { noteFailure(ip); return res.status(401).json({ error: 'Wrong username or password.' }); }
    await startSession(res, user);
    res.json({ user: { id: user.id, username: user.username } });
  }));
  app.post('/api/account/logout', wrap(async (req, res) => {
    const t = parseCookies(req.headers.cookie)[COOKIE];
    if (t) await store.deleteSession(tokenHash(t));
    res.setHeader('Set-Cookie', `${COOKIE}=; ${cookieOpts(0)}`);
    res.json({ ok: true });
  }));
  app.post('/api/account/password', wrap(async (req, res) => {
    const me = await userFromCookie(store, req.headers.cookie);
    if (!me) return res.status(401).json({ error: 'Sign in first.' });
    const full = await store.getUserByName(me.username);
    if (!checkPassword(String((req.body && req.body.current) || ''), full.pass_hash)) return res.status(401).json({ error: 'Your current password is wrong.' });
    const v = validateCredentials(me.username, req.body && req.body.password);
    if (v.error) return res.status(400).json({ error: v.error });
    await store.setPassword(me.id, hashPassword(v.password));   // signs out every other device
    await startSession(res, me);
    res.json({ ok: true });
  }));
}

async function userFromCookie(store, cookieHeader) {
  const t = parseCookies(cookieHeader)[COOKIE];
  if (!t) return null;
  return store.getSession(tokenHash(t));
}

module.exports = { setupAuth, userFromCookie, hashPassword, checkPassword, validateCredentials };
