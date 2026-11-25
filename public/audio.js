/* Shinobi-mon sound: synthesized battle sound effects (no audio files) and the sound settings window
   (volume and mute, saved in this browser). Background music is not included yet. */
(() => {
  const KEY = 'ssbu-audio';
  const DEFAULTS = { muted: false, sfx: 0.6 };
  let cfg;
  try { cfg = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { cfg = Object.assign({}, DEFAULTS); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {} };

  let ctx = null, sfxGain = null, unlocked = false;
  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      ctx = new C();
      sfxGain = ctx.createGain(); sfxGain.connect(ctx.destination);
      applyVolume();
    }
    return ctx;
  }
  function applyVolume() {
    const s = cfg.muted ? 0 : cfg.sfx;
    if (sfxGain) sfxGain.gain.setTargetAtTime(s, ctx.currentTime, 0.02);
  }

  // ---------- notes ----------
  const SEMI = { C: -9, 'C#': -8, Db: -8, D: -7, 'D#': -6, Eb: -6, E: -5, F: -4, 'F#': -3, Gb: -3, G: -2, 'G#': -1, Ab: -1, A: 0, 'A#': 1, Bb: 1, B: 2 };
  const freq = n => { const m = /^([A-G][#b]?)(\d)$/.exec(n); return m ? 440 * Math.pow(2, (SEMI[m[1]] + (m[2] - 4) * 12) / 12) : 0; };
  // "E5 1 G5 .5 - 1" -> [[freq, beats], ...] ('-' is a rest)
  const parse = str => { const t = str.trim().split(/\s+/); const out = []; for (let i = 0; i < t.length; i += 2) out.push([t[i] === '-' ? 0 : freq(t[i]), +t[i + 1]]); return out; };
  function tone(dest, f, t, dur, { wave = 'square', gain = 0.1, attack = 0.005, release = 0.06, slide = 0 } = {}) {
    if (!f) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = wave; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.setValueAtTime(gain, Math.max(t + attack, t + dur - release)); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }
  let noiseBuf = null;
  function noise(dest, t, dur, { gain = 0.2, hp = 800, lp = 9000, sweep = 0 } = {}) {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp;
    const l = ctx.createBiquadFilter(); l.type = 'lowpass'; l.frequency.setValueAtTime(lp, t); if (sweep) l.frequency.exponentialRampToValueAtTime(Math.max(100, lp * sweep), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(h); h.connect(l); l.connect(g); g.connect(dest); s.start(t); s.stop(t + dur + 0.02);
  }

  // browsers only allow sound after the player interacts with the page
  const unlock = () => { if (unlocked) return; unlocked = true; const c = ac(); if (c && c.state === 'suspended') c.resume(); };
  ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, unlock, { passive: true }));

  // ---------- sound effects ----------
  const SFX = {
    hit: (d, t) => { noise(d, t, 0.14, { gain: 0.35, hp: 200, lp: 4000, sweep: 0.3 }); tone(d, 160, t, 0.12, { wave: 'sine', gain: 0.3, slide: 0.4 }); },
    super: (d, t) => { noise(d, t, 0.2, { gain: 0.4, hp: 300, lp: 8000, sweep: 0.3 }); tone(d, 520, t, 0.08, { gain: 0.1 }); tone(d, 780, t + 0.07, 0.12, { gain: 0.1 }); },
    weak: (d, t) => { noise(d, t, 0.1, { gain: 0.18, hp: 100, lp: 1200 }); tone(d, 110, t, 0.1, { wave: 'sine', gain: 0.18 }); },
    crit: (d, t) => { noise(d, t, 0.06, { gain: 0.45, hp: 2500, lp: 12000 }); tone(d, 1200, t, 0.1, { wave: 'triangle', gain: 0.12, slide: 1.5 }); },
    miss: (d, t) => noise(d, t, 0.3, { gain: 0.15, hp: 400, lp: 6000, sweep: 0.2 }),
    attack: (d, t) => noise(d, t, 0.16, { gain: 0.08, hp: 1500, lp: 9000, sweep: 0.4 }),
    status: (d, t) => { for (let i = 0; i < 4; i++) tone(d, i % 2 ? 330 : 392, t + i * 0.06, 0.06, { wave: 'triangle', gain: 0.08 }); },
    up: (d, t) => ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => tone(d, freq(n), t + i * 0.05, 0.08, { wave: 'triangle', gain: 0.09 })),
    down: (d, t) => ['C6', 'G5', 'E5', 'C5'].forEach((n, i) => tone(d, freq(n), t + i * 0.05, 0.08, { wave: 'triangle', gain: 0.08 })),
    heal: (d, t) => ['E5', 'G#5', 'B5'].forEach((n, i) => tone(d, freq(n), t + i * 0.07, 0.25, { wave: 'sine', gain: 0.08 })),
    switch: (d, t) => tone(d, 300, t, 0.18, { wave: 'square', gain: 0.06, slide: 3 }),
    faint: (d, t) => tone(d, 600, t, 0.6, { wave: 'square', gain: 0.07, slide: 0.15, release: 0.2 }),
    flinch: (d, t) => { tone(d, 180, t, 0.08, { wave: 'sawtooth', gain: 0.08 }); tone(d, 150, t + 0.09, 0.1, { wave: 'sawtooth', gain: 0.08 }); },
    protect: (d, t) => ['A5', 'E6', 'A6'].forEach((n, i) => tone(d, freq(n), t + i * 0.03, 0.3, { wave: 'sine', gain: 0.05 })),
    finalsmash: (d, t) => { noise(d, t, 1.2, { gain: 0.12, hp: 300, lp: 600, sweep: 12 }); ['C4', 'E4', 'G4', 'C5', 'E5', 'G5', 'C6'].forEach((n, i) => tone(d, freq(n), t + 0.3 + i * 0.07, 0.6, { wave: 'square', gain: 0.05 })); },
  };
  function sfx(name) {
    if (!unlocked || cfg.muted || cfg.sfx <= 0 || !SFX[name] || !ac()) return;
    SFX[name](sfxGain, ctx.currentTime + 0.01);
  }
  // short end-of-battle cue: rising for a win, falling for a loss
  function jingle(kind) {
    if (!unlocked || cfg.muted || cfg.sfx <= 0 || !ac()) return;
    const t = ctx.currentTime + 0.02;
    const notes = kind === 'win' ? [['C5', 0], ['E5', .12], ['G5', .24], ['C6', .36]] : [['E5', 0], ['D5', .16], ['C5', .32], ['A4', .48]];
    for (const [n, d] of notes) tone(sfxGain, freq(n), t + d, kind === 'win' && n === 'C6' ? 0.5 : 0.18, { wave: 'square', gain: 0.07 });
  }

  // ---------- settings window ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function updateButton() { const b = document.getElementById('audioBtn'); if (b) { b.textContent = cfg.muted || cfg.sfx <= 0 ? '🔇' : '🔊'; } }
  function renderSettings() {
    const U = window.SSBU;
    U.modal(`<div id="auRoot"><div class="row"><h2 class="grow" style="margin:0">Sound</h2><label class="check" style="margin:0"><input type="checkbox" id="auMute" ${cfg.muted ? 'checked' : ''}> Mute</label></div>
      <div class="au-sliders">
        <label>Sound effects <input type="range" min="0" max="100" id="auSfx" value="${Math.round(cfg.sfx * 100)}"><span id="auSfxV">${Math.round(cfg.sfx * 100)}%</span></label>
      </div>
      <p class="muted small">Battle sounds: hits, super effective and critical hits, misses, switching, stat changes, fainting, Transformations and win/lose cues. Saved in this browser.</p>
      <div class="row"><button class="small" id="auTest">▶ Test sound</button><span class="grow"></span><button class="primary" id="auDone">Done</button></div></div>`);
    const $ = id => document.getElementById(id);
    $('auMute').onchange = e => { cfg.muted = e.target.checked; save(); applyVolume(); updateButton(); };
    $('auSfx').oninput = e => { cfg.sfx = e.target.value / 100; $('auSfxV').textContent = e.target.value + '%'; save(); applyVolume(); updateButton(); };
    $('auSfx').onchange = () => sfx('super');
    $('auTest').onclick = () => { unlock(); sfx('hit'); setTimeout(() => sfx('up'), 250); };
    $('auDone').onclick = () => U.closeModal();
  }

  window.AUDIO = {
    sfx, jingle, settings: () => { unlock(); renderSettings(); },
    setBattle() {},   // kept for when background music is added
    get config() { return cfg; },
  };
  document.addEventListener('DOMContentLoaded', updateButton); updateButton();
})();
