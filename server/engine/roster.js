// Random hero generation (Standard draft pools and the Battle Pass) and roster signing.
// Heroes a player owns live in their browser; the server signs each one so its
// nature, IVs and ability can't be edited before it is used in an Elite battle.
const crypto = require('crypto');
const FIGHTERS = require('../../shared/fighters.json');
const { NATURES } = require('../../shared/dex.js');

const NATURE_NAMES = Object.keys(NATURES);
const SECRET = process.env.SHINOBI_SECRET || 'dev-only-secret-change-me';
if (!process.env.SHINOBI_SECRET && process.env.NODE_ENV === 'production') console.warn('SHINOBI_SECRET is not set: roster signatures use the development secret.');

const uid = () => crypto.randomBytes(8).toString('hex');
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

const GENDER = require('../../shared/genders.js');
function genFighter(species, rng = Math.random) {
  const f = typeof species === 'string' ? FIGHTERS.find(x => x.id === species) : species;
  const ivs = {};
  for (const s of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) ivs[s] = Math.floor(rng() * 32);
  return {
    uid: uid(), species: f.id, nature: pick(NATURE_NAMES, rng), ivs,
    ability: rng() < 0.5 ? f.abilities[0].name : f.hidden.name,
    gender: GENDER.roll(f.id, rng),   // not signed: Elite lets you pick it anyway
  };
}

// n random heroes, no repeated species within the pool
function rollPool(n = 20, rng = Math.random) {
  const pool = FIGHTERS.slice();
  const out = [];
  const bases = new Set();   // one version of each shinobi per pool (Part I, Shippuden, Sage Mode…)
  while (out.length < n && pool.length) {
    const f = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    if (bases.has(f.baseId || f.id)) continue;
    bases.add(f.baseId || f.id); out.push(genFighter(f, rng));
  }
  return out;
}

const payload = f => [f.uid, f.species, f.nature, f.ability, ...['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map(s => f.ivs && f.ivs[s])].join('|');
function sign(f) { return Object.assign({}, f, { sig: crypto.createHmac('sha256', SECRET).update(payload(f)).digest('hex') }); }
function verify(f) {
  if (!f || typeof f.sig !== 'string') return false;
  const expect = crypto.createHmac('sha256', SECRET).update(payload(f)).digest('hex');
  return f.sig.length === expect.length && crypto.timingSafeEqual(Buffer.from(f.sig), Buffer.from(expect));
}

module.exports = { genFighter, rollPool, sign, verify };
