// Accounts, saved data and Fighter Pass storage. Runs against the in-memory store, and also against
// Postgres when TEST_DATABASE_URL is set. Usage: node test/accounts.js
const assert = require('assert');
const { createStore } = require('../server/db.js');
const { hashPassword, checkPassword, validateCredentials } = require('../server/auth.js');
const UserData = require('../server/userdata.js');
const Pass = require('../server/pass.js');
const { sign, genFighter } = require('../server/engine/roster.js');

let passed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('ok  ', name); } catch (e) { console.log('FAIL', name, '\n', e.stack); process.exitCode = 1; } }

async function suite(label, store) {
  await store.init();
  const tag = Date.now().toString(36);
  await test(`${label}: create user, unique usernames (any case), sessions`, async () => {
    const u = await store.createUser('Ash_' + tag, hashPassword('pikachu123'));
    assert(u && u.id);
    assert.equal(await store.createUser('ASH_' + tag, hashPassword('x'.repeat(8))), null);
    const found = await store.getUserByName('ash_' + tag);
    assert(checkPassword('pikachu123', found.pass_hash)); assert(!checkPassword('wrong', found.pass_hash));
    await store.createSession('h1' + tag, u.id, new Date(Date.now() + 60000));
    await store.createSession('h2' + tag, u.id, new Date(Date.now() - 1000));
    assert.equal((await store.getSession('h1' + tag)).username, 'Ash_' + tag);
    assert.equal(await store.getSession('h2' + tag), null, 'expired session');
    await store.setPassword(u.id, hashPassword('newpassword'));
    assert.equal(await store.getSession('h1' + tag), null, 'password change signs out');
  });
  await test(`${label}: saved data uses versions so a stale tab can't overwrite`, async () => {
    const u = await store.createUser('Misty_' + tag, hashPassword('togepi123'));
    assert.deepEqual(await store.getData(u.id), { data: null, version: 0 });
    assert.equal(await store.setData(u.id, { roster: [], elite: [], selElite: 0 }, 0), 1);
    assert.equal(await store.setData(u.id, { roster: [1] }, 0), null, 'stale insert');
    assert.equal(await store.setData(u.id, { roster: [2] }, 1), 2);
    assert.equal(await store.setData(u.id, { roster: [3] }, 1), null, 'stale update');
    assert.deepEqual((await store.getData(u.id)).data, { roster: [2] });
  });
  await test(`${label}: Fighter Pass is per player, survives a new store, and absorbs guest rolls`, async () => {
    Pass.useStore(store);
    const g = 'g:guest' + tag, a = 'u:acct' + tag;
    assert.equal((await Pass.status(g)).rollsLeft, 3);
    const rolls = await Promise.all([Pass.roll(g), Pass.roll(g)]);   // double click: one roll
    assert.equal(rolls[0].rollsLeft, 2); assert.equal(rolls[1].rollsLeft, 2);
    const keep = rolls[0].pending.slice(0, 2).map(f => f.uid);
    await Pass.claim(g, keep); await Pass.roll(g);                    // 2 used, one pending
    const v = await Pass.absorb(g, a);
    assert.equal(v.rollsLeft, 1); assert.equal(v.pending.length, 20);
    assert.equal((await Pass.status(g)).pending, null);
    assert.equal((await Pass.status(g)).rollsLeft, 1, 'guest keeps its count');
    const claimed = await Pass.claim(a, [v.pending[0].uid]);
    assert.equal(claimed.fighters.length, 1); assert(claimed.fighters[0].sig);
  });
}

(async () => {
  await test('credentials rules', () => {
    assert(validateCredentials('ab', 'password1').error);
    assert(validateCredentials('good_name', 'short').error);
    assert(validateCredentials('bad name', 'password1').error);
    assert.equal(validateCredentials(' Red-1 ', 'password1').username, 'Red-1');
  });
  await test('saved data keeps only signed fighters and caps teams', () => {
    const a = sign(genFighter('itachi')), b = sign(genFighter('naruto-p1'));
    const forged = Object.assign({}, b, { uid: 'zz', ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } });
    const d = UserData.sanitize({ roster: [a, b, b, forged, { junk: true }], elite: [{ name: 'x'.repeat(99), mons: [{ uid: a.uid, moves: ['A', 'B', 'C', 'D', 'E'], item: 'Leftovers' }, { uid: 'zz' }] }], selElite: 7 });
    assert.equal(d.roster.length, 2); assert.equal(d.elite[0].name.length, 40);
    assert.equal(d.elite[0].mons.length, 1); assert.equal(d.elite[0].mons[0].moves.length, 4); assert.equal(d.selElite, 0);
  });
  await test('guest data merges into an account without duplicates', () => {
    const a = sign(genFighter('itachi')), b = sign(genFighter('naruto-p1')), c = sign(genFighter('gaara-p1'));
    const team = { name: 'T', mons: [{ uid: a.uid, moves: ['Fire Punch'], item: '' }] };
    const m = UserData.merge({ roster: [a, b], elite: [team] }, { roster: [b, c], elite: [team, { name: 'U', mons: [] }] });
    assert.deepEqual(m.roster.map(f => f.uid), [a.uid, b.uid, c.uid]);
    assert.deepEqual(m.elite.map(t => t.name), ['T', 'U']);
  });
  await suite('memory', createStore({ url: '', file: '' }));
  if (process.env.TEST_DATABASE_URL) { const pg = createStore({ url: process.env.TEST_DATABASE_URL }); await suite('postgres', pg); await pg.close(); }
  console.log(`${passed} passed`);
})();
