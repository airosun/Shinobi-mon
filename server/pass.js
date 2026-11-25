// Battle Pass: 3 rolls per day (US Eastern day). Each roll shows 20 random heroes; the player keeps up to 5.
// Rolls are tracked per player: signed-in players by account ("u:<id>"), guests by browser id ("g:<id>").
// State lives in the store (Postgres when DATABASE_URL is set), so restarts don't reset the day's rolls.
const { rollPool, sign } = require('./engine/roster.js');

const ROLLS_PER_DAY = 3;
const KEEP_PER_ROLL = 5;
let store = null;
function useStore(s) { store = s; }

function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()); }
// one operation at a time per player, so a double-click can't roll twice
const locks = new Map();
function locked(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  const tail = next.catch(() => {});
  locks.set(key, tail);
  tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
  return next;
}
async function entry(key) {
  const d = today();
  let e = await store.getPass(key);
  if (!e || e.day !== d) e = { day: d, used: 0, pending: e && e.pending ? e.pending : null };
  return e;
}
const view = e => ({ rollsLeft: ROLLS_PER_DAY - e.used, perDay: ROLLS_PER_DAY, keep: KEEP_PER_ROLL, pending: e.pending ? e.pending.fighters : null });

const status = key => locked(key, async () => view(await entry(key)));
const roll = key => locked(key, async () => {
  const e = await entry(key);
  if (e.pending) return { pending: e.pending.fighters, rollsLeft: ROLLS_PER_DAY - e.used };
  if (e.used >= ROLLS_PER_DAY) return { error: 'No Battle Pass rolls left today. Come back tomorrow!' };
  e.used++;
  e.pending = { fighters: rollPool(20) };
  await store.setPass(key, e);
  return { pending: e.pending.fighters, rollsLeft: ROLLS_PER_DAY - e.used };
});
const claim = (key, uids) => locked(key, async () => {
  const e = await entry(key);
  if (!e.pending) return { error: 'There is no Battle Pass roll to claim.' };
  uids = [...new Set(uids || [])];
  if (uids.length > KEEP_PER_ROLL) return { error: `You can keep up to ${KEEP_PER_ROLL} heroes.` };
  const chosen = e.pending.fighters.filter(f => uids.includes(f.uid));
  if (chosen.length !== uids.length) return { error: 'Those heroes were not in your roll.' };
  e.pending = null; await store.setPass(key, e);
  return { fighters: chosen.map(sign), rollsLeft: ROLLS_PER_DAY - e.used };
});
// Signing in on a browser that already rolled today: the account counts those rolls too (no extra rolls
// from switching), and an unclaimed guest roll moves to the account if the account has none.
const absorb = (guestKey, accountKey) => locked(accountKey, () => locked(guestKey, async () => {
  const g = await entry(guestKey); const a = await entry(accountKey);
  a.used = Math.max(a.used, g.used);
  if (!a.pending && g.pending) a.pending = g.pending;
  await store.setPass(accountKey, a);
  await store.setPass(guestKey, { day: g.day, used: g.used, pending: null });
  return view(a);
}));

module.exports = { useStore, status, roll, claim, absorb, ROLLS_PER_DAY, KEEP_PER_ROLL };
