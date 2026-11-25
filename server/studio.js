// Animation Studio storage and API (/studio).
// The studio saves three kinds of edits, used live by every battle:
//   tweaks  - per jutsu: animation speed and per-piece size / position / rotation / colour / hide
//   sprites - redrawn pieces (the PNG and its layers, stored as blobs)
//   assign  - per move: which jutsu's animation it plays ("generic" = the generic animation for its type)
// Reading is public (battles need it). Saving needs the studio key (STUDIO_KEY env var) in the x-studio-key header.
// With DATABASE_URL set everything lives in Postgres; otherwise in memory (local dev / tests).
const crypto = require('crypto');
const express = require('express');

const COLLS = new Set(['tweaks', 'sprites', 'assign']);
const MAX_BLOB = 8 * 1024 * 1024;

function createStudioStore(url) {
  if (!url) {
    const docs = { tweaks: new Map(), sprites: new Map(), assign: new Map() };
    const blobs = new Map();
    return {
      kind: 'memory',
      async init() {},
      async list(coll) { return [...docs[coll]].map(([id, data]) => ({ id, data })); },
      async set(coll, id, data) { docs[coll].set(id, data); },
      async del(coll, id) { docs[coll].delete(id); },
      async putBlob(id, mime, buf) { blobs.set(id, { mime, buf }); },
      async getBlob(id) { return blobs.get(id) || null; },
    };
  }
  const { Pool } = require('pg');
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: true }, max: 3 });
  const q = (t, p) => pool.query(t, p);
  return {
    kind: 'postgres',
    async init() {
      await q(`CREATE TABLE IF NOT EXISTS studio_docs (coll TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (coll, id));
               CREATE TABLE IF NOT EXISTS studio_blobs (id TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());`);
    },
    async list(coll) { return (await q('SELECT id, data FROM studio_docs WHERE coll = $1', [coll])).rows; },
    async set(coll, id, data) { await q('INSERT INTO studio_docs (coll, id, data) VALUES ($1, $2, $3) ON CONFLICT (coll, id) DO UPDATE SET data = $3, updated_at = now()', [coll, id, data]); },
    async del(coll, id) { await q('DELETE FROM studio_docs WHERE coll = $1 AND id = $2', [coll, id]); },
    async putBlob(id, mime, buf) { await q('INSERT INTO studio_blobs (id, mime, bytes) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING', [id, mime, buf]); },
    async getBlob(id) { const r = (await q('SELECT mime, bytes FROM studio_blobs WHERE id = $1', [id])).rows[0]; return r ? { mime: r.mime, buf: r.bytes } : null; },
  };
}

function mountStudio(app, { databaseUrl = process.env.DATABASE_URL, key = process.env.STUDIO_KEY } = {}) {
  const store = createStudioStore(databaseUrl);
  const ready = store.init().catch(e => console.error('studio store', e.message));
  let cache = null; // the public state, rebuilt after every save
  async function state() {
    if (cache) return cache;
    await ready;
    const out = {};
    for (const c of COLLS) { out[c] = {}; for (const r of await store.list(c)) out[c][r.id] = r.data; }
    return (cache = out);
  }
  const keyOk = req => !!key && typeof req.get('x-studio-key') === 'string' && req.get('x-studio-key').length === key.length &&
    crypto.timingSafeEqual(Buffer.from(req.get('x-studio-key')), Buffer.from(key));
  const guard = (req, res, next) => {
    if (!key) return res.status(503).json({ error: 'Saving is turned off: set STUDIO_KEY on the server.' });
    if (!keyOk(req)) return res.status(401).json({ error: 'Wrong studio key.' });
    next();
  };
  const safeId = s => typeof s === 'string' && /^[\w .,:'"!?&()\-ōūāēī’]{1,120}$/u.test(s);

  app.get('/api/studio/state', async (req, res) => {
    try { res.set('Cache-Control', 'no-cache'); res.json(await state()); } catch (e) { res.status(500).json({ error: 'Could not load studio edits.' }); }
  });
  app.get('/api/studio/check', guard, (req, res) => res.json({ ok: true, store: store.kind }));
  app.put('/api/studio/doc/:coll/:id', guard, express.json({ limit: '2mb' }), async (req, res) => {
    const { coll, id } = req.params;
    if (!COLLS.has(coll) || !safeId(id)) return res.status(400).json({ error: 'Bad document.' });
    try { await ready; await store.set(coll, id, req.body); cache = null; res.json({ ok: true }); } catch (e) { console.error('studio save', e.message); res.status(500).json({ error: 'Could not save.' }); }
  });
  app.delete('/api/studio/doc/:coll/:id', guard, async (req, res) => {
    const { coll, id } = req.params;
    if (!COLLS.has(coll) || !safeId(id)) return res.status(400).json({ error: 'Bad document.' });
    try { await ready; await store.del(coll, id); cache = null; res.json({ ok: true }); } catch (e) { res.status(500).json({ error: 'Could not delete.' }); }
  });
  app.post('/api/studio/blob', guard, express.raw({ type: ['image/png', 'image/webp', 'image/jpeg', 'image/gif', 'image/svg+xml'], limit: MAX_BLOB }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'No image.' });
    const id = crypto.createHash('sha256').update(req.body).digest('hex').slice(0, 32);
    try { await ready; await store.putBlob(id, req.get('content-type'), req.body); res.json({ id }); } catch (e) { console.error('studio blob', e.message); res.status(500).json({ error: 'Could not store the image.' }); }
  });
  app.get('/api/studio/blob/:id', async (req, res) => {
    if (!/^[a-f0-9]{32}$/.test(req.params.id)) return res.status(404).end();
    try {
      await ready; const b = await store.getBlob(req.params.id);
      if (!b) return res.status(404).end();
      res.set('Cache-Control', 'public, max-age=31536000, immutable').type(b.mime).send(b.buf);
    } catch (e) { res.status(500).end(); }
  });
  return { store, ready };
}

module.exports = { mountStudio, createStudioStore };
