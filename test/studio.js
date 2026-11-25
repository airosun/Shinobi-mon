// Animation Studio API: public reads, key-protected saves. Usage: node test/studio.js
const assert = require('assert');
const express = require('express');
const { mountStudio } = require('../server/studio.js');

(async () => {
  const app = express(); mountStudio(app, { databaseUrl: '', key: 'k3y' });
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  const j = (p, o) => fetch(base + p, o).then(async r => ({ status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.arrayBuffer() }));
  let passed = 0; const ok = (n) => { passed++; console.log('ok  ', n); };
  try {
    assert.deepEqual((await j('/api/studio/state')).body, { tweaks: {}, sprites: {}, assign: {} }); ok('empty state is public');
    assert.equal((await j('/api/studio/doc/tweaks/rasengan', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"speed":2}' })).status, 401); ok('saving without the key is refused');
    const H = { 'x-studio-key': 'k3y' };
    assert.equal((await j('/api/studio/doc/tweaks/rasengan', { method: 'PUT', headers: { ...H, 'content-type': 'application/json' }, body: '{"speed":2}' })).status, 200);
    assert.equal((await j('/api/studio/doc/assign/Chidori Katana', { method: 'PUT', headers: { ...H, 'content-type': 'application/json' }, body: '{"anim":"chidori"}' })).status, 200);
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    const up = await j('/api/studio/blob', { method: 'POST', headers: { ...H, 'content-type': 'image/png' }, body: png });
    assert.match(up.body.id, /^[a-f0-9]{32}$/);
    assert.deepEqual(Buffer.from((await j('/api/studio/blob/' + up.body.id)).body), png);
    const st = (await j('/api/studio/state')).body;
    assert.equal(st.tweaks.rasengan.speed, 2); assert.equal(st.assign['Chidori Katana'].anim, 'chidori'); ok('tweaks, move animations and images save and read back');
    assert.equal((await j('/api/studio/doc/tweaks/rasengan', { method: 'DELETE', headers: H })).status, 200);
    assert.equal((await j('/api/studio/state')).body.tweaks.rasengan, undefined); ok('deleting an edit works');
    assert.equal((await j('/api/studio/doc/other/x', { method: 'PUT', headers: { ...H, 'content-type': 'application/json' }, body: '{}' })).status, 400); ok('unknown collections are rejected');
  } catch (e) { console.log('FAIL', e.stack); process.exitCode = 1; }
  srv.close(); console.log(`${passed} passed`);
})();
