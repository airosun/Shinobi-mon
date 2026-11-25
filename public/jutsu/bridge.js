// Plays Shinobi Showdown's jutsu animations on Shinobi-mon's battle screen.
// Every Shinobi Showdown jutsu has its own animation (anim.js); a move's `anim` (from tools/build_shinobi.py) says which
// one it plays, and the Animation Studio (/studio) can point any move at a different one or back to the generic look.
import { playJutsu, ANIMS } from './anim.js';
import { JUTSU } from './data/jutsu.js';
import * as FX from './fx.js';

const KUNAI = { id: 'kunai', name: 'Kunai & Shuriken', category: 'taijutsu', nature: null, target: 'enemy', effects: [] };

/** Which animation a move plays: a jutsu id with its own animation, or null for the generic one. */
export function animFor(moveName, md) {
  const a = FX.STUDIO.assign[moveName];
  if (a === 'generic') return null;
  if (a && ANIMS[a]) return a;
  const id = md && md.anim;
  return id && ANIMS[id] ? id : null;
}
export function jutsuFor(id) { return id === 'kunai' ? KUNAI : JUTSU[id]; }

window.JUTSU_ANIM = {
  ready: FX.STUDIO.ready,
  animFor,
  /** Play a move's jutsu animation. Resolves when the hit lands. */
  async play(arena, moveName, md, userEl, targetEls, opts) {
    const id = animFor(moveName, md);
    const j = jutsuFor(id);
    if (!j) return false;
    return playJutsu(arena, j, userEl, targetEls, opts);
  },
};
