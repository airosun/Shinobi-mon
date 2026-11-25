// Move animations for the battle screen. Each move maps to a recipe built from a few effects
// (projectiles, beams, waves, lightning, quakes, storms, auras, ...). Moves without their own recipe
// fall back to one chosen by type and category. Everything is drawn with absolutely positioned
// elements inside the arena and the Web Animations API, and cleans itself up.
// MOVEFX.play(ctx) returns how long the move takes (ms, before the speed setting is applied).
(function () {
  'use strict';
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  // Shinobi-mon types (generic fallback look for jutsu without their own animation)
  const TYPE = {
    Normal: { c: '#e8e4d8', c2: '#ffffff', p: 'star' },
    Taijutsu: { c: '#e0452b', c2: '#ffb37a', p: 'star' },
    Fire: { c: '#ff7a1a', c2: '#ffd34d', p: 'flame' },
    Wind: { c: '#8fe0a8', c2: '#ffffff', p: 'feather' },
    Lightning: { c: '#ffd60a', c2: '#fff7b0', p: 'spark' },
    Earth: { c: '#c9a04a', c2: '#ecd49b', p: 'rock' },
    Water: { c: '#3d8bff', c2: '#bfe3ff', p: 'drop' },
    Yin: { c: '#7a5cc9', c2: '#c9b3ff', p: 'wisp' },
    Yang: { c: '#f2d98a', c2: '#fffbe6', p: 'sparkle' },
    Wood: { c: '#4f9a3a', c2: '#b8f5a0', p: 'leaf' },
    Ice: { c: '#8fe3ff', c2: '#ffffff', p: 'crystal' },
    Lava: { c: '#e0502a', c2: '#ffb347', p: 'flame' },
    Storm: { c: '#5b8dff', c2: '#e0f0ff', p: 'spark' },
    Magnet: { c: '#c8b48a', c2: '#f0e2c0', p: 'dust' },
    Boil: { c: '#e8a0c0', c2: '#fff0f6', p: 'bubble' },
    Explosion: { c: '#ffb347', c2: '#fff2b3', p: 'star' },
    Dust: { c: '#e6eef2', c2: '#ffffff', p: 'ring' },
    Weapon: { c: '#b8c4d6', c2: '#ffffff', p: 'shard' },
    Beast: { c: '#c07a3c', c2: '#ffd9a8', p: 'star' },
    Sage: { c: '#ff9a3c', c2: '#ffe2b8', p: 'sparkle' },
  };
  const T = t => TYPE[t] || TYPE.Normal;

  function make(ctx) {
    const { arena } = ctx;
    const sp = ctx.sp || 1;
    const D = ms => Math.max(1, ms * sp);
    const W = arena.clientWidth, H = arena.clientHeight;
    const mv = (x, y, extra = '') => `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) ${extra}`;

    function el(cls, at, style) {
      const d = document.createElement('div');
      d.className = 'fa ' + cls;
      d.style.left = at.x + 'px'; d.style.top = at.y + 'px';
      if (style) Object.assign(d.style, style);
      arena.appendChild(d);
      return d;
    }
    function run(node, frames, ms, opts = {}) {
      const a = node.animate(frames, { duration: D(ms), easing: opts.easing || 'ease-out', fill: 'forwards', delay: D(opts.delay || 0) });
      if (opts.keep !== true) a.onfinish = () => node.remove();
      return a;
    }
    const later = (ms, fn) => setTimeout(fn, D(ms));

    // ---- shapes ----
    function shape(kind, at, color, size = 14) {
      const d = el('shape ' + kind, at);
      d.style.setProperty('--c', color);
      d.style.width = d.style.height = size + 'px';
      if (kind === 'note') d.textContent = pick(['♪', '♫']);
      if (kind === 'heart') d.textContent = '♥';
      if (kind === 'zzz') d.textContent = 'z';
      return d;
    }
    // a burst of particles flying outward from a point
    function particles(at, { kind = 'p', color = '#fff', n = 10, spread = 60, ms = 600, size = 10, rise = 0, delay = 0, gravity = 0 } = {}) {
      for (let i = 0; i < n; i++) {
        const s = shape(kind, at, color, size * rnd(.7, 1.3));
        const ang = rnd(0, Math.PI * 2), r = rnd(spread * .4, spread);
        const x = Math.cos(ang) * r, y = Math.sin(ang) * r - rise + gravity;
        run(s, [{ transform: mv(0, 0, 'scale(.3) rotate(0deg)'), opacity: 1 }, { transform: mv(x * .6, y * .6 - gravity * .5, `scale(1) rotate(${rnd(-120, 120)}deg)`), opacity: 1, offset: .5 }, { transform: mv(x, y, `scale(.6) rotate(${rnd(-200, 200)}deg)`), opacity: 0 }], ms * rnd(.8, 1.15), { delay: delay + rnd(0, 120) });
      }
    }
    // particles drifting from one point to another (drain, charge-up)
    function stream(from, to, { kind = 'p', color = '#fff', n = 10, ms = 520, size = 10, wobble = 18, stagger = 40, delay = 0 } = {}) {
      for (let i = 0; i < n; i++) {
        const s = shape(kind, from, color, size * rnd(.7, 1.2));
        const dx = to.x - from.x, dy = to.y - from.y;
        run(s, [{ transform: mv(0, 0, 'scale(.5)'), opacity: 0 }, { transform: mv(dx * .5 + rnd(-wobble, wobble), dy * .5 + rnd(-wobble, wobble), `scale(1.1) rotate(${rnd(-90, 90)}deg)`), opacity: 1, offset: .5 }, { transform: mv(dx, dy, `scale(.7) rotate(${rnd(-180, 180)}deg)`), opacity: .2 }], ms, { delay: delay + i * stagger, easing: 'ease-in-out' });
      }
      return delay + n * stagger + ms;
    }
    function flash(color = '#fff', ms = 380, peak = .75, delay = 0) {
      const d = el('screen', { x: 0, y: 0 }); d.style.background = color;
      run(d, [{ opacity: 0 }, { opacity: peak, offset: .25 }, { opacity: 0 }], ms, { delay });
    }
    function shake(target = arena, px = 7, ms = 520, delay = 0) {
      const f = []; for (let i = 0; i <= 8; i++) { const k = i === 8 ? 0 : px * (1 - i / 9); f.push({ transform: `translate(${rnd(-k, k)}px, ${rnd(-k * .6, k * .6)}px)` }); }
      later(delay, () => target.animate(f, { duration: D(ms) }));
    }
    function glow(sprite, color, ms = 600, delay = 0) {
      if (!sprite) return;
      later(delay, () => sprite.animate([{ filter: 'none' }, { filter: `drop-shadow(0 0 16px ${color}) brightness(1.5)`, offset: .4 }, { filter: 'none' }], { duration: D(ms) }));
    }
    function ring(at, color, size = 80, ms = 520, delay = 0, width = 4) {
      const d = el('ringx', at, { width: size + 'px', height: size + 'px', borderColor: color, borderWidth: width + 'px' });
      run(d, [{ transform: mv(0, 0, 'scale(.2)'), opacity: 1 }, { transform: mv(0, 0, 'scale(1.5)'), opacity: 0 }], ms, { delay });
    }
    function burst(at, color, size = 90, ms = 420, delay = 0) {
      const d = el('glowball', at, { width: size + 'px', height: size + 'px', background: `radial-gradient(circle, #fff 0%, ${color} 45%, transparent 70%)` });
      run(d, [{ transform: mv(0, 0, 'scale(.2)'), opacity: 1 }, { transform: mv(0, 0, 'scale(1.3)'), opacity: 0 }], ms, { delay });
    }

    // ---- building blocks ----
    // a projectile from user to target, with a trail
    function projectile(from, to, { color, color2, size = 26, ms = 420, delay = 0, kind = 'orb', trail = true, arc = 0, spin = false } = {}) {
      const d = el('proj ' + kind, from, { width: size + 'px', height: size + 'px' });
      d.style.setProperty('--c', color); d.style.setProperty('--c2', color2 || '#fff');
      const dx = to.x - from.x, dy = to.y - from.y;
      const frames = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10; frames.push({ transform: mv(dx * t, dy * t - Math.sin(t * Math.PI) * arc, `scale(${.6 + t * .6}) rotate(${spin ? t * 720 : 0}deg)`) }); }
      run(d, frames, ms, { delay, easing: 'linear' });
      if (trail) for (let i = 1; i <= 5; i++) later(delay + (ms / 6) * i, () => { const p = el('trail', { x: from.x + dx * i / 6, y: from.y + dy * i / 6 - Math.sin(i / 6 * Math.PI) * arc }, { background: color, width: size * .7 + 'px', height: size * .7 + 'px' }); run(p, [{ transform: mv(0, 0, 'scale(1)'), opacity: .7 }, { transform: mv(0, 0, 'scale(.2)'), opacity: 0 }], 300); });
      return delay + ms;
    }
    function beam(from, to, { color, core = '#fff', width = 16, ms = 650, delay = 0, wavy = false, sparkle = null } = {}) {
      const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) * 180 / Math.PI;
      const b = el('beam' + (wavy ? ' wavy' : ''), from, { width: len + 'px', height: width + 'px', background: `linear-gradient(180deg, transparent, ${color} 25%, ${core} 50%, ${color} 75%, transparent)`, boxShadow: `0 0 18px 4px ${color}` });
      b.style.transformOrigin = '0 50%';
      const base = `translate(0, -50%) rotate(${ang}deg)`;
      run(b, [{ transform: `${base} scaleX(0) scaleY(.6)`, opacity: 1 }, { transform: `${base} scaleX(1) scaleY(1)`, opacity: 1, offset: .3 }, { transform: `${base} scaleX(1) scaleY(1.25)`, opacity: 1, offset: .75 }, { transform: `${base} scaleX(1) scaleY(0)`, opacity: 0 }], ms, { delay, easing: 'ease-out' });
      if (sparkle) for (let i = 0; i < 8; i++) later(delay + rnd(80, ms * .7), () => { const t = rnd(.2, 1); particles({ x: from.x + dx * t, y: from.y + dy * t }, { kind: sparkle, color, n: 1, spread: 22, size: 9, ms: 420 }); });
      later(delay + ms * .3, () => burst(to, color, 80, 380));
      return delay + ms;
    }
    // jagged lightning bolt between two points
    function bolt(from, to, { color = '#ffe14d', ms = 420, delay = 0, width = 4, forks = 2 } = {}) {
      later(delay, () => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'fa bolt'); svg.setAttribute('width', W); svg.setAttribute('height', H);
        const seg = (a, b, n, j) => { const pts = [a]; for (let i = 1; i < n; i++) { const t = i / n; pts.push({ x: a.x + (b.x - a.x) * t + rnd(-j, j), y: a.y + (b.y - a.y) * t + rnd(-j, j) }); } pts.push(b); return pts; };
        const line = (pts, w) => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'polyline'); p.setAttribute('points', pts.map(q => `${q.x},${q.y}`).join(' ')); p.setAttribute('stroke', color); p.setAttribute('stroke-width', w); p.setAttribute('fill', 'none'); p.setAttribute('stroke-linejoin', 'bevel'); svg.appendChild(p); return pts; };
        const main = line(seg(from, to, 9, 16), width);
        for (let k = 0; k < forks; k++) { const s = main[2 + Math.floor(rnd(0, main.length - 4))]; line(seg(s, { x: s.x + rnd(-60, 60), y: s.y + rnd(10, 60) }, 4, 10), width * .5); }
        svg.style.filter = `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 2px #fff)`;
        arena.appendChild(svg);
        run(svg, [{ opacity: 0 }, { opacity: 1, offset: .1 }, { opacity: .3, offset: .3 }, { opacity: 1, offset: .45 }, { opacity: .6, offset: .7 }, { opacity: 0 }], ms, { easing: 'linear' });
      });
      return delay + ms;
    }
    // a big wave that starts on the user's side and crashes across the field
    function wave(fromLeft, { color = '#2f7cff', color2 = '#bfe3ff', ms = 1300, targets = [] } = {}) {
      const w = Math.max(W * .55, 260), h = H * 1.05;
      const d = el('wave', { x: 0, y: 0 }, { width: w + 'px', height: h + 'px', top: (H - h) + 'px', left: '0px', background: `linear-gradient(${fromLeft ? '100deg' : '260deg'}, transparent 0%, ${color}cc 30%, ${color} 55%, ${color2} 80%, #ffffff 92%, transparent 100%)` });
      d.classList.add(fromLeft ? 'ltr' : 'rtl');
      const x0 = fromLeft ? -w : W, x1 = fromLeft ? W + w * .2 : -w * 1.2;
      run(d, [{ transform: `translate(${x0}px, 40%) skewX(${fromLeft ? -8 : 8}deg)`, opacity: .2 }, { transform: `translate(${x0 + (x1 - x0) * .35}px, 4%) skewX(${fromLeft ? -14 : 14}deg)`, opacity: .95, offset: .35 }, { transform: `translate(${x0 + (x1 - x0) * .7}px, 0%) skewX(${fromLeft ? -20 : 20}deg)`, opacity: .9, offset: .7 }, { transform: `translate(${x1}px, 20%) skewX(${fromLeft ? -26 : 26}deg)`, opacity: 0 }], ms, { easing: 'cubic-bezier(.35,.1,.55,1)' });
      // foam along the crest
      for (let i = 0; i < 14; i++) later(rnd(100, ms * .8), () => { const t = rnd(.15, .85); particles({ x: fromLeft ? W * t : W * (1 - t), y: rnd(H * .2, H * .8) }, { kind: 'drop', color: color2, n: 2, spread: 30, size: 9, ms: 500, rise: 18 }); });
      for (const t of targets) later(ms * .45, () => { particles(t, { kind: 'drop', color: color2, n: 12, spread: 70, size: 11, ms: 650, rise: 30 }); shake(t.el, 8, 450); });
      return ms;
    }
    function quake({ color = '#c9a04a', targets = [], ms = 900, strength = 9 } = {}) {
      shake(arena, strength, ms);
      for (const t of targets) {
        const base = { x: t.x, y: t.y + 38 };
        const cr = el('crack', base); cr.style.setProperty('--c', '#2a1d10');
        run(cr, [{ transform: mv(0, 0, 'scaleX(.1)'), opacity: 0 }, { transform: mv(0, 0, 'scaleX(1)'), opacity: 1, offset: .25 }, { transform: mv(0, 0, 'scaleX(1)'), opacity: 0 }], ms);
        particles(base, { kind: 'dust', color, n: 12, spread: 60, size: 16, ms: 800, rise: 25 });
        later(120, () => shake(t.el, 10, 500));
      }
      return ms;
    }
    // things falling from above onto each target (rocks, icicles, meteors)
    function rain(targets, { kind = 'rock', color = '#b8a25a', n = 5, size = 26, ms = 520, stagger = 90, fromSide = 0 } = {}) {
      let end = 0;
      for (const t of targets) for (let i = 0; i < n; i++) {
        const x = t.x + rnd(-36, 36), delay = i * stagger + rnd(0, 60);
        const s = shape(kind, { x: x - fromSide, y: -30 }, color, size * rnd(.8, 1.25));
        run(s, [{ transform: mv(0, 0, `rotate(${rnd(0, 90)}deg)`), opacity: 1 }, { transform: mv(fromSide, t.y + rnd(-20, 20) + 30, `rotate(${rnd(90, 300)}deg)`), opacity: 1 }], ms, { delay, easing: 'ease-in' });
        later(delay + ms, () => particles({ x, y: t.y + 10 }, { kind: kind === 'meteor' ? 'flame' : 'dust', color, n: 4, spread: 30, size: 9, ms: 380 }));
        end = Math.max(end, delay + ms + 300);
      }
      targets.forEach(t => shake(t.el, 7, 400, n * stagger * .6));
      return end;
    }
    // spikes / pillars rising from the ground under each target (Stone Edge, Thousand Arrows)
    function rise(targets, { kind = 'spike', color = '#b8a25a', n = 4, ms = 520 } = {}) {
      for (const t of targets) for (let i = 0; i < n; i++) {
        const s = el('pillar ' + kind, { x: t.x + (i - (n - 1) / 2) * 22, y: t.y + 40 }); s.style.setProperty('--c', color);
        run(s, [{ transform: mv(0, 0, 'scaleY(0)'), opacity: 1 }, { transform: mv(0, -30, 'scaleY(1.1)'), opacity: 1, offset: .4 }, { transform: mv(0, -24, 'scaleY(1)'), opacity: 1, offset: .75 }, { transform: mv(0, 0, 'scaleY(0)'), opacity: 0 }], ms + 250, { delay: i * 60 });
        shake(t.el, 8, 420, 200);
      }
      return ms + 250 + n * 60;
    }
    // particles sweeping across the whole field (Blizzard, Hurricane, Petal Blizzard)
    function storm({ kind = 'crystal', color = '#cfefff', n = 46, ms = 1000, fromLeft = true, swirl = false, targets = [] } = {}) {
      for (let i = 0; i < n; i++) {
        const y = rnd(-20, H), x0 = fromLeft ? rnd(-80, -10) : W + rnd(10, 80), dx = (fromLeft ? 1 : -1) * (W + 140);
        const s = shape(kind, { x: x0, y }, color, rnd(8, 16));
        const frames = swirl
          ? [{ transform: mv(0, 0, 'rotate(0deg)'), opacity: 0 }, { transform: mv(dx * .5, rnd(-80, 80), 'rotate(360deg)'), opacity: 1, offset: .5 }, { transform: mv(dx, rnd(-40, 40), 'rotate(720deg)'), opacity: 0 }]
          : [{ transform: mv(0, 0, 'rotate(0deg)'), opacity: 0 }, { transform: mv(dx * .5, rnd(10, 60), 'rotate(160deg)'), opacity: 1, offset: .4 }, { transform: mv(dx, rnd(40, 120), 'rotate(320deg)'), opacity: 0 }];
        run(s, frames, ms * rnd(.7, 1.1), { delay: rnd(0, ms * .5), easing: 'linear' });
      }
      targets.forEach(t => shake(t.el, 6, 600, ms * .4));
      return ms * 1.25;
    }
    // things orbiting around a point (Swords Dance, Will-O-Wisp)
    function orbit(at, { kind = 'sword', color = '#e8ecf3', n = 3, r = 52, ms = 900, size = 30, spins = 1.2 } = {}) {
      const hub = el('hub', at);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const s = document.createElement('div'); s.className = 'fa shape ' + kind; s.style.setProperty('--c', color);
        s.style.width = s.style.height = size + 'px'; s.style.left = Math.cos(a) * r + 'px'; s.style.top = Math.sin(a) * r + 'px';
        s.style.transform = `translate(-50%, -50%) rotate(${a * 180 / Math.PI + 90}deg)`;
        hub.appendChild(s);
      }
      run(hub, [{ transform: 'rotate(0deg) scale(.4)', opacity: 0 }, { transform: `rotate(${spins * 180}deg) scale(1)`, opacity: 1, offset: .3 }, { transform: `rotate(${spins * 360}deg) scale(.9)`, opacity: 1, offset: .8 }, { transform: `rotate(${spins * 400}deg) scale(.2)`, opacity: 0 }], ms, { easing: 'linear' });
      return ms;
    }
    // particles rising around the user (stat boosts, Dragon Dance)
    function aura(at, sprite, { kind = 'p', color = '#fff', n = 14, ms = 750 } = {}) {
      for (let i = 0; i < n; i++) {
        const s = shape(kind, { x: at.x + rnd(-40, 40), y: at.y + rnd(10, 45) }, color, rnd(8, 14));
        run(s, [{ transform: mv(0, 0, 'scale(.4)'), opacity: 0 }, { transform: mv(rnd(-8, 8), -45, 'scale(1)'), opacity: 1, offset: .4 }, { transform: mv(rnd(-12, 12), -95, 'scale(.5)'), opacity: 0 }], ms * rnd(.7, 1), { delay: rnd(0, ms * .4) });
      }
      glow(sprite, color, ms);
      return ms;
    }
    // the user rushes the target and back
    function lunge(user, from, to, { ms = 520, style = 'normal', color = '#fff' } = {}) {
      if (!user || !to) return 0;
      const dx = (to.x - from.x) * .62, dy = (to.y - from.y) * .62;
      let frames;
      if (style === 'dash') {
        frames = [{ transform: 'translate(0,0)' }, { transform: `translate(${dx * 1.05}px,${dy * 1.05}px) scale(1.05)`, offset: .25 }, { transform: `translate(${dx}px,${dy}px)`, offset: .55 }, { transform: 'translate(0,0)' }];
        for (let i = 1; i <= 3; i++) later(i * 25, () => { const g = el('after', { x: from.x + dx * i / 4, y: from.y + dy * i / 4 }, { width: '70px', height: '70px', background: color }); run(g, [{ opacity: .45, transform: mv(0, 0) }, { opacity: 0, transform: mv(0, 0, 'scale(.6)') }], 260); });
      } else if (style === 'jump') {
        frames = [{ transform: 'translate(0,0)' }, { transform: `translate(${dx * .5}px,${dy * .5 - 120}px) scale(1.1)`, offset: .4 }, { transform: `translate(${dx}px,${dy}px) scale(1.05)`, offset: .62 }, { transform: 'translate(0,0)' }];
      } else if (style === 'spin') {
        frames = [{ transform: 'translate(0,0) rotate(0deg)' }, { transform: `translate(${dx}px,${dy}px) rotate(540deg)`, offset: .5 }, { transform: 'translate(0,0) rotate(720deg)' }];
      } else if (style === 'charge') {
        frames = [{ transform: 'translate(0,0)', filter: 'none' }, { transform: `translate(${-dx * .12}px,${-dy * .12}px) scale(.95)`, filter: `drop-shadow(0 0 14px ${color}) brightness(1.6)`, offset: .3 }, { transform: `translate(${dx * 1.05}px,${dy * 1.05}px) scale(1.12)`, filter: `drop-shadow(0 0 20px ${color}) brightness(1.8)`, offset: .55 }, { transform: 'translate(0,0)', filter: 'none' }];
      } else {
        frames = [{ transform: 'translate(0,0)' }, { transform: `translate(${dx}px,${dy}px) scale(1.08)`, offset: .45 }, { transform: 'translate(0,0)' }];
      }
      user.animate(frames, { duration: D(ms), easing: 'cubic-bezier(.3,.7,.4,1)' });
      return style === 'jump' ? ms * .62 : style === 'charge' ? ms * .55 : style === 'spin' ? ms * .5 : style === 'dash' ? ms * .25 : ms * .45;
    }
    // what a hit looks like on the target
    function impact(at, kind, color, color2, delay = 0) {
      later(delay, () => {
        if (kind === 'punch') { const s = el('impactstar', at); s.style.setProperty('--c', color); run(s, [{ transform: mv(0, 0, 'scale(.2) rotate(0deg)'), opacity: 1 }, { transform: mv(0, 0, 'scale(1.2) rotate(20deg)'), opacity: 1, offset: .4 }, { transform: mv(0, 0, 'scale(1.5) rotate(30deg)'), opacity: 0 }], 420); }
        else if (kind === 'kick') { const s = el('impactstar kick', at); s.style.setProperty('--c', color); run(s, [{ transform: mv(-10, 10, 'scale(.2) rotate(-20deg)'), opacity: 1 }, { transform: mv(0, 0, 'scale(1.3) rotate(10deg)'), opacity: 0 }], 420); }
        else if (kind === 'claw' || kind === 'slash') {
          const n = kind === 'claw' ? 3 : 1;
          for (let i = 0; i < n; i++) { const s = el('slashx', { x: at.x + (i - (n - 1) / 2) * 16, y: at.y }, { background: `linear-gradient(90deg, transparent, ${color2}, #fff, ${color2}, transparent)`, boxShadow: `0 0 12px ${color}`, width: (kind === 'slash' ? 150 : 110) + 'px' }); run(s, [{ transform: mv(0, 0, 'rotate(-50deg) scaleX(0)'), opacity: 1 }, { transform: mv(0, 0, 'rotate(-50deg) scaleX(1)'), opacity: 1, offset: .45 }, { transform: mv(0, 0, 'rotate(-50deg) scaleX(1.1)'), opacity: 0 }], 360, { delay: i * 60 }); }
        } else if (kind === 'bite') {
          for (const [dir, y] of [[1, -1], [-1, 1]]) { const s = el('jaw', { x: at.x, y: at.y + y * 40 }); s.style.setProperty('--c', color2); s.style.transform = mv(0, 0, dir < 0 ? 'scaleY(-1)' : ''); run(s, [{ transform: mv(0, 0, dir < 0 ? 'scaleY(-1)' : ''), opacity: 0 }, { transform: mv(0, 0, dir < 0 ? 'scaleY(-1)' : ''), opacity: 1, offset: .15 }, { transform: mv(0, -y * 30, dir < 0 ? 'scaleY(-1)' : ''), opacity: 1, offset: .55 }, { transform: mv(0, -y * 26, dir < 0 ? 'scaleY(-1)' : ''), opacity: 0 }], 500, { easing: 'ease-in' }); }
        } else { burst(at, color, 90, 400); }
        particles(at, { kind: T(ctx.type).p, color: kind === 'plain' ? color2 : color, n: 7, spread: 50, size: 10, ms: 480 });
      });
    }
    function screen(sideIsLeft, color) {
      const d = el('panel', { x: sideIsLeft ? W * .3 : W * .7, y: sideIsLeft ? H * .62 : H * .3 }, { borderColor: color, background: `linear-gradient(135deg, ${color}33, ${color}11 50%, ${color}44)` });
      run(d, [{ transform: mv(0, 0, 'scale(.2) perspective(300px) rotateY(60deg)'), opacity: 0 }, { transform: mv(0, 0, 'scale(1) perspective(300px) rotateY(0deg)'), opacity: .9, offset: .4 }, { transform: mv(0, 0, 'scale(1)'), opacity: 0 }], 800);
      return 800;
    }
    function weather(kind) {
      const n = 40;
      for (let i = 0; i < n; i++) {
        const x = rnd(0, W), d = rnd(0, 700);
        if (kind === 'rain') { const s = el('rainline', { x, y: -20 }); run(s, [{ transform: mv(0, 0, 'rotate(12deg)'), opacity: .8 }, { transform: mv(-40, H + 40, 'rotate(12deg)'), opacity: .5 }], 520, { delay: d, easing: 'linear' }); }
        else if (kind === 'snow') { const s = shape('crystal', { x, y: -10 }, '#ffffff', rnd(5, 10)); run(s, [{ transform: mv(0, 0), opacity: 1 }, { transform: mv(rnd(-40, 40), H + 20, 'rotate(200deg)'), opacity: .4 }], 1100, { delay: d, easing: 'linear' }); }
      }
      if (kind === 'sun') { const s = el('sunglare', { x: W * .82, y: H * .12 }); run(s, [{ transform: mv(0, 0, 'scale(.3)'), opacity: 0 }, { transform: mv(0, 0, 'scale(1.1)'), opacity: 1, offset: .4 }, { transform: mv(0, 0, 'scale(1.3)'), opacity: 0 }], 1200); flash('#ffcc4d', 900, .35); }
      if (kind === 'rain') flash('#1a3a6a', 900, .35);
      if (kind === 'snow') flash('#cfefff', 900, .25);
      return 1200;
    }

    return { el, run, later, shape, particles, stream, flash, shake, glow, ring, burst, projectile, beam, bolt, wave, quake, rain, rise, storm, orbit, aura, lunge, impact, screen, weather, W, H, D, mv };
  }

  // ---------- recipes ----------
  // contact style per move: dash / jump / spin / charge (default: normal lunge), and the hit look
  const DASH = new Set(['Quick Attack', 'Extreme Speed', 'Aqua Jet', 'Bullet Punch', 'Mach Punch', 'Sucker Punch', 'Shadow Sneak', 'Ice Shard', 'Fake Out', 'Accelerock', 'Aerial Ace', 'Night Slash', 'Psycho Cut', 'Sacred Sword', 'Smart Strike', 'Leaf Blade', 'U-turn', 'Acrobatics', 'Dual Wingbeat', 'Zing Zap', 'Throat Chop']);
  const JUMP = new Set(['Bounce', 'Fly', 'High Jump Kick', 'Heavy Slam', 'Body Slam', 'Dragon Hammer', 'Ice Hammer', 'Hammer Arm', 'Wood Hammer', 'Gigaton Hammer', 'Body Press', 'Darkest Lariat', 'Dive', 'Dig', 'Phantom Force', 'Stomping Tantrum', 'Triple Kick', 'Blaze Kick', 'Crabhammer']);
  const SPIN = new Set(['Rapid Spin', 'Gyro Ball', 'Ice Spinner', 'Rollout', 'Steel Roller', 'Brutal Swing', 'Circle Throw', 'Dragon Tail', 'Aqua Tail', 'Iron Tail', 'Poison Tail']);
  const CHARGE = new Set(['Flare Blitz', 'Volt Tackle', 'Wild Charge', 'Brave Bird', 'Double-Edge', 'Head Smash', 'Dragon Rush', 'Skull Bash', 'Headlong Rush', 'Zen Headbutt', 'Iron Head', 'Headbutt', 'Flame Charge', 'Outrage', 'Close Combat', 'Waterfall', 'Liquidation', 'Spirit Break', 'Play Rough', 'Facade', 'Revenge']);
  const HIT = {
    claw: ['Dragon Claw', 'Shadow Claw', 'Night Slash', 'X-Scissor', 'Crush Claw', 'Hyper Fang'],
    slash: ['Leaf Blade', 'Sacred Sword', 'Psycho Cut', 'Smart Strike', 'Aerial Ace', 'Air Slash', 'Cross Chop', 'Brick Break', 'Throat Chop', 'Razor Shell'],
    bite: ['Bite', 'Crunch', 'Fire Fang', 'Ice Fang', 'Thunder Fang', 'Poison Fang', 'Psychic Fangs', 'Hyper Fang'],
    kick: ['High Jump Kick', 'Triple Kick', 'Blaze Kick', 'Force Palm'],
  };
  const HIT_OF = {}; for (const [k, list] of Object.entries(HIT)) for (const n of list) HIT_OF[n] = k;

  // moves with a recipe of their own
  const R = {
    // ----- Water -----
    'Surf': (f, c) => f.wave(c.userLeft, { color: '#2f7cff', color2: '#cfeaff', targets: c.targets, ms: 1400 }),
    'Sludge Wave': (f, c) => f.wave(c.userLeft, { color: '#7b2fa8', color2: '#e2a6ff', targets: c.targets, ms: 1400 }),
    'Hydro Pump': (f, c) => { let e = 0; for (const t of c.targets) e = Math.max(e, f.beam(c.from, t, { color: '#2f7cff', core: '#e6f5ff', width: 30, ms: 800 })); c.targets.forEach(t => f.particles(t, { kind: 'drop', color: '#bfe3ff', n: 14, spread: 70, ms: 600, delay: 300, rise: 20 })); return e; },
    'Water Gun': (f, c) => { for (let i = 0; i < 6; i++) c.targets.forEach(t => f.projectile(c.from, t, { color: '#3d8bff', size: 14, ms: 380, delay: i * 50, kind: 'drop', trail: false })); return 700; },
    'Scald': (f, c) => { for (let i = 0; i < 7; i++) c.targets.forEach(t => f.projectile(c.from, t, { color: '#ff8a5c', color2: '#bfe3ff', size: 15, ms: 400, delay: i * 45, kind: 'drop', trail: false })); c.targets.forEach(t => f.particles(t, { kind: 'p', color: '#ffffff', n: 10, spread: 50, ms: 800, delay: 380, rise: 50 })); return 900; },
    'Water Pulse': (f, c) => { c.targets.forEach(t => { f.projectile(c.from, t, { color: '#3d8bff', size: 24, ms: 420 }); for (let i = 0; i < 3; i++) f.ring(t, '#7fc0ff', 90, 520, 380 + i * 110); }); return 900; },
    'Water Shuriken': (f, c) => { for (let i = 0; i < 3; i++) c.targets.forEach(t => f.projectile(c.from, t, { color: '#3d8bff', color2: '#bfe3ff', size: 22, ms: 360, delay: i * 120, kind: 'shuriken', spin: true, trail: false })); return 760; },
    'Octazooka': (f, c) => { c.targets.forEach(t => { f.projectile(c.from, t, { color: '#2a2440', size: 26, ms: 420 }); f.particles(t, { kind: 'p', color: '#1b1626', n: 14, spread: 55, delay: 420, size: 12 }); }); return 900; },
    'Waterfall': (f, c) => { const d = f.lunge(c.user, c.from, c.t0, { style: 'charge', color: '#3d8bff', ms: 620 }); c.targets.forEach(t => { const col = f.el('column', { x: t.x, y: t.y - 30 }); col.style.setProperty('--c', '#3d8bff'); f.run(col, [{ transform: f.mv(0, -120, 'scaleY(.2)'), opacity: 0 }, { transform: f.mv(0, 0, 'scaleY(1)'), opacity: .9, offset: .4 }, { transform: f.mv(0, 10, 'scaleY(1)'), opacity: 0 }], 600, { delay: d }); f.particles(t, { kind: 'drop', color: '#bfe3ff', n: 12, spread: 60, delay: d + 200, rise: 20 }); }); return d + 700; },
    'Rain Dance': (f) => f.weather('rain'),
    // ----- Fire -----
    'Flamethrower': (f, c) => { for (const t of c.targets) for (let i = 0; i < 16; i++) f.projectile(c.from, { x: t.x + (Math.random() - .5) * 30, y: t.y + (Math.random() - .5) * 30 }, { color: i % 3 ? '#ff7a1a' : '#ffd34d', size: 18 + i % 3 * 6, ms: 360, delay: i * 30, kind: 'flame', trail: false }); c.targets.forEach(t => f.particles(t, { kind: 'flame', color: '#ff9a3c', n: 10, spread: 50, delay: 450, rise: 30 })); return 950; },
    'Fire Blast': (f, c) => { c.targets.forEach(t => { f.projectile(c.from, t, { color: '#ff5a1a', color2: '#ffd34d', size: 34, ms: 460, kind: 'flame' }); f.later(460, () => { for (let a = 0; a < 5; a++) { const ang = -Math.PI / 2 + a * (Math.PI * 2 / 5); for (let i = 1; i <= 4; i++) { const s = f.shape('flame', { x: t.x + Math.cos(ang) * i * 16, y: t.y + Math.sin(ang) * i * 16 }, i % 2 ? '#ff7a1a' : '#ffd34d', 22); f.run(s, [{ transform: f.mv(0, 0, 'scale(.2)'), opacity: 0 }, { transform: f.mv(0, 0, 'scale(1.2)'), opacity: 1, offset: .3 }, { transform: f.mv(0, -10, 'scale(.8)'), opacity: 0 }], 650, { delay: i * 40 }); } } f.burst(t, '#ff7a1a', 120, 500); }); }); return 1200; },
    'Overheat': (f, c) => { f.aura(c.from, c.user, { kind: 'flame', color: '#ff7a1a', n: 16, ms: 500 }); c.targets.forEach(t => { f.beam(c.from, t, { color: '#ff5a1a', core: '#fff3b0', width: 34, ms: 700, delay: 350 }); f.particles(t, { kind: 'flame', color: '#ffb020', n: 18, spread: 80, delay: 600, rise: 30, size: 14 }); }); f.flash('#ff7a1a', 500, .4, 450); return 1150; },
    'Heat Wave': (f, c) => f.storm({ kind: 'flame', color: '#ff8a3c', n: 40, ms: 900, fromLeft: c.userLeft, targets: c.targets }),
    'Mystical Fire': (f, c) => { c.targets.forEach(t => { f.projectile(c.from, t, { color: '#ff5ab8', color2: '#ffd34d', size: 26, ms: 420, kind: 'flame' }); f.orbit(t, { kind: 'flame', color: '#ff7ad8', n: 5, r: 40, ms: 700, size: 18 }); }); return 1000; },
    'Sacred Fire': (f, c) => { const d = f.lunge(c.user, c.from, c.t0, { style: 'charge', color: '#ff7a1a', ms: 600 }); c.targets.forEach(t => { const col = f.el('column', { x: t.x, y: t.y - 20 }); col.style.setProperty('--c', '#ff7a1a'); f.run(col, [{ transform: f.mv(0, 40, 'scaleY(0)'), opacity: 0 }, { transform: f.mv(0, 0, 'scaleY(1.1)'), opacity: 1, offset: .35 }, { transform: f.mv(0, -20, 'scaleY(1)'), opacity: 0 }], 700, { delay: d }); f.particles(t, { kind: 'flame', color: '#ffd34d', n: 14, spread: 50, delay: d + 100, rise: 60 }); }); return d + 800; },
    'Will-O-Wisp': (f, c) => { c.targets.forEach(t => { f.stream(c.from, t, { kind: 'wisp', color: '#5cc8ff', n: 3, ms: 600, size: 22, stagger: 120, wobble: 40 }); f.later(900, () => f.orbit(t, { kind: 'wisp', color: '#5cc8ff', n: 3, r: 38, ms: 600, size: 18 })); }); return 1450; },
    'Sunny Day': (f) => f.weather('sun'),
    // ----- Electric -----
    'Thunderbolt': (f, c) => { let e = 0; c.targets.forEach(t => { e = f.bolt(c.from, t, { ms: 500, width: 5 }); f.later(80, () => f.bolt(c.from, t, { ms: 380, width: 3, forks: 1 })); f.particles(t, { kind: 'spark', color: '#ffe14d', n: 12, spread: 55, delay: 200 }); }); f.flash('#fff7b0', 300, .35, 50); return e + 250; },
    'Thunder': (f, c) => { c.targets.forEach(t => { f.bolt({ x: t.x + (Math.random() - .5) * 40, y: -10 }, t, { ms: 600, width: 8, forks: 4 }); f.later(120, () => f.bolt({ x: t.x + (Math.random() - .5) * 60, y: -10 }, t, { ms: 420, width: 4, forks: 2 })); f.burst(t, '#ffe14d', 130, 500, 120); f.shake(t.el, 8, 400, 120); }); f.flash('#ffffff', 420, .8, 60); return 900; },
    'Thunder Wave': (f, c) => { c.targets.forEach(t => { f.bolt(c.from, t, { ms: 380, width: 2, forks: 0 }); for (let i = 0; i < 4; i++) f.later(300 + i * 90, () => f.bolt({ x: t.x - 35, y: t.y + (i - 1.5) * 18 }, { x: t.x + 35, y: t.y + (i - 1.5) * 18 + 6 }, { ms: 260, width: 2, forks: 0 })); }); return 800; },
    'Volt Switch': (f, c) => { c.targets.forEach(t => { f.projectile(c.from, t, { color: '#ffd60a', size: 28, ms: 380 }); f.later(380, () => f.bolt({ x: t.x - 40, y: t.y - 30 }, { x: t.x + 40, y: t.y + 30 }, { ms: 300, width: 4 })); }); return 800; },
    'Charge Beam': (f, c) => { let e = 0; c.targets.forEach(t => { e = f.beam(c.from, t, { color: '#ffd60a', width: 16, ms: 600, sparkle: 'spark' }); }); return e; },
    'Zap Cannon': (f, c) => { c.targets.forEach(t => { f.projectile(c.from, t, { color: '#ffd60a', color2: '#ffffff', size: 46, ms: 650 }); f.later(650, () => { for (let i = 0; i < 3; i++) f.bolt({ x: t.x + (Math.random() - .5) * 90, y: t.y - 50 }, { x: t.x + (Math.random() - .5) * 90, y: t.y + 50 }, { ms: 300, width: 3, forks: 1 }); }); }); f.flash('#fff7b0', 300, .4, 650); return 1100; },
    'Nuzzle': (f, c) => { const d = f.lunge(c.user, c.from, c.t0, { ms: 520 }); c.targets.forEach(t => { f.particles(t, { kind: 'heart', color: '#ff8ad8', n: 3, spread: 30, delay: d, rise: 30, size: 16 }); f.particles(t, { kind: 'spark', color: '#ffe14d', n: 10, spread: 45, delay: d }); }); return d + 500; },
    // ----- Grass -----
    'Giga Drain': (f, c) => { c.targets.forEach(t => { f.particles(t, { kind: 'p', color: '#7aff7a', n: 10, spread: 40, ms: 400 }); f.stream(t, c.from, { kind: 'p', color: '#8dff8d', n: 12, ms: 600, size: 11, stagger: 45, delay: 250 }); }); f.later(900, () => f.ring(c.from, '#3ddc84', 90, 450)); return 1350; },
    'Solar Beam': (f, c) => { let e = 0; c.targets.forEach(t => { e = f.beam(c.from, t, { color: '#c8ff5a', core: '#ffffff', width: 40, ms: 800 }); }); f.flash('#fff7b0', 500, .35); return e + 100; },
    'Energy Ball': (f, c) => { c.targets.forEach(t => { f.projectile(c.from, t, { color: '#4cc94c', color2: '#e3ffd0', size: 36, ms: 480 }); f.later(480, () => f.burst(t, '#7aff7a', 110, 450)); }); return 950; },
    'Leaf Storm': (f, c) => f.storm({ kind: 'leaf', color: '#4cc94c', n: 60, ms: 1000, fromLeft: c.userLeft, swirl: true, targets: c.targets }),
    'Petal Blizzard': (f, c) => f.storm({ kind: 'petal', color: '#ff9ad5', n: 54, ms: 1000, fromLeft: c.userLeft, swirl: true, targets: c.targets }),
    'Razor Leaf': (f, c) => { for (let i = 0; i < 6; i++) c.targets.forEach(t => f.projectile(c.from, { x: t.x + (Math.random() - .5) * 40, y: t.y + (Math.random() - .5) * 40 }, { color: '#4cc94c', size: 20, ms: 380, delay: i * 60, kind: 'leaf', spin: true, trail: false })); return 820; },
    'Bullet Seed': (f, c) => { for (let i = 0; i < 8; i++) c.targets.forEach(t => f.projectile(c.from, { x: t.x + (Math.random() - .5) * 30, y: t.y + (Math.random() - .5) * 30 }, { color: '#9cc51b', size: 11, ms: 300, delay: i * 55, trail: false })); return 780; },
    'Seed Bomb': (f, c) => { c.targets.forEach(t => { f.projectile(c.from, t, { color: '#7a5a2a', size: 22, ms: 480, arc: 70, trail: false }); f.later(480, () => { f.burst(t, '#9cc51b', 100, 420); f.particles(t, { kind: 'leaf', color: '#4cc94c', n: 8, spread: 50 }); }); }); return 950; },
    'Vine Whip': (f, c) => { c.targets.forEach(t => { for (let i = 0; i < 2; i++) f.later(i * 160, () => { const dx = t.x - c.from.x, dy = t.y - c.from.y; const v = f.el('vine', c.from, { width: Math.hypot(dx, dy) + 'px' }); v.style.transformOrigin = '0 50%'; const a = Math.atan2(dy, dx) * 180 / Math.PI + (i ? 8 : -8); f.run(v, [{ transform: `translate(0,-50%) rotate(${a}deg) scaleX(0)` }, { transform: `translate(0,-50%) rotate(${a}deg) scaleX(1)`, offset: .5 }, { transform: `translate(0,-50%) rotate(${a}deg) scaleX(0)` }], 420); }); }); c.targets.forEach(t => f.impact(t, 'slash', '#4cc94c', '#b8f5a0', 220)); return 800; },
    'Power Whip': (f, c) => R['Vine Whip'](f, c) + 100,
    'Leech Seed': (f, c) => { c.targets.forEach(t => { f.projectile(c.from, t, { color: '#7a5a2a', size: 12, ms: 420, arc: 60, trail: false }); f.later(450, () => f.orbit(t, { kind: 'leaf', color: '#4cc94c', n: 4, r: 34, ms: 700, size: 16 })); }); return 1150; },
    'Sleep Powder': (f, c) => { c.targets.forEach(t => { for (let i = 0; i < 18; i++) { const s = f.shape('p', { x: t.x + (Math.random() - .5) * 90, y: t.y - 90 }, '#c9ff8a', 7); f.run(s, [{ transform: f.mv(0, 0), opacity: 0 }, { transform: f.mv((Math.random() - .5) * 20, 60), opacity: 1, offset: .5 }, { transform: f.mv((Math.random() - .5) * 30, 110), opacity: 0 }], 900, { delay: Math.random() * 300, easing: 'linear' }); } }); return 1150; },
    'Synthesis': (f, c) => { for (let i = 0; i < 12; i++) f.stream({ x: c.from.x + (Math.random() - .5) * 160, y: -10 }, c.from, { kind: 'sparkle', color: '#fff3a0', n: 1, ms: 600, delay: i * 40 }); f.later(700, () => f.ring(c.from, '#3ddc84', 100, 500)); return 1250; },
    'Ingrain': (f, c) => { f.rise([{ x: c.from.x, y: c.from.y + 10, el: c.user }], { kind: 'root', color: '#7a5a2a', n: 3 }); return 900; },
    'Aromatherapy': (f, c) => { f.aura(c.from, c.user, { kind: 'petal', color: '#ff9ad5', n: 16 }); return 800; },
    // ----- Ice -----
    'Ice Beam': (f, c) => { let e = 0; c.targets.forEach(t => { e = f.beam(c.from, t, { color: '#8fe3ff', core: '#ffffff', width: 18, ms: 700, sparkle: 'crystal' }); f.later(500, () => { const ice = f.el('iceblock', t); f.run(ice, [{ opacity: 0, transform: f.mv(0, 0, 'scale(.6)') }, { opacity: .8, transform: f.mv(0, 0, 'scale(1)'), offset: .4 }, { opacity: 0, transform: f.mv(0, 0, 'scale(1.05)') }], 600); }); }); return e + 400; },
    'Blizzard': (f, c) => f.storm({ kind: 'crystal', color: '#e6f8ff', n: 70, ms: 1100, fromLeft: c.userLeft, targets: c.targets }),
    'Icy Wind': (f, c) => f.storm({ kind: 'crystal', color: '#bfefff', n: 34, ms: 850, fromLeft: c.userLeft, targets: c.targets }),
    'Freeze-Dry': (f, c) => { c.targets.forEach(t => { f.projectile(c.from, t, { color: '#8fe3ff', size: 20, ms: 380, kind: 'crystal' }); f.later(380, () => { for (let i = 0; i < 6; i++) { const ang = i * Math.PI / 3; const s = f.shape('crystal', t, '#e6f8ff', 22); f.run(s, [{ transform: f.mv(0, 0, 'scale(.2)'), opacity: 1 }, { transform: f.mv(Math.cos(ang) * 45, Math.sin(ang) * 45, `rotate(${ang * 57}deg) scale(1.3)`), opacity: 0 }], 550); } }); }); return 950; },
    'Icicle Crash': (f, c) => f.rain(c.targets, { kind: 'icicle', color: '#bfefff', n: 5, size: 30 }),
    'Ice Shard': (f, c) => { const d = f.lunge(c.user, c.from, c.t0, { style: 'dash', color: '#8fe3ff', ms: 380 }); c.targets.forEach(t => { for (let i = 0; i < 3; i++) f.projectile(c.from, t, { color: '#bfefff', size: 16, ms: 220, delay: i * 50, kind: 'crystal', trail: false }); f.impact(t, 'plain', '#8fe3ff', '#ffffff', d + 120); }); return d + 500; },
    'Snowscape': (f) => f.weather('snow'),
    // ----- Ground / Rock -----
    'Earthquake': (f, c) => f.quake({ targets: c.targets, ms: 1000, strength: 11 }),
    'Bulldoze': (f, c) => f.quake({ targets: c.targets, ms: 750, strength: 7 }),
    'Stomping Tantrum': (f, c) => { const d = f.lunge(c.user, c.from, c.t0, { style: 'jump', ms: 620 }); f.later(d, () => f.quake({ targets: c.targets, ms: 600, strength: 8 })); return d + 650; },
    'High Horsepower': (f, c) => { const d = f.lunge(c.user, c.from, c.t0, { style: 'charge', color: '#c9a04a', ms: 560 }); f.later(d, () => f.quake({ targets: c.targets, ms: 500, strength: 6 })); return d + 550; },
    'Thousand Arrows': (f, c) => { f.quake({ targets: [], ms: 600, strength: 5 }); return f.rise(c.targets, { kind: 'spike', color: '#c9a04a', n: 5, ms: 520 }); },
    'Drill Run': (f, c) => { const d = f.lunge(c.user, c.from, c.t0, { style: 'spin', ms: 620 }); c.targets.forEach(t => f.particles(t, { kind: 'dust', color: '#c9a04a', n: 12, spread: 50, delay: d, size: 14 })); return d + 500; },
    'Spikes': (f, c) => { c.foeSideCenters.forEach(p => { for (let i = 0; i < 3; i++) f.projectile(c.from, { x: p.x + (i - 1) * 40, y: p.y + 50 }, { color: '#8a8f9a', size: 14, ms: 500, delay: i * 90, arc: 70, kind: 'spike', trail: false }); }); return 850; },
    'Toxic Spikes': (f, c) => { c.foeSideCenters.forEach(p => { for (let i = 0; i < 3; i++) f.projectile(c.from, { x: p.x + (i - 1) * 40, y: p.y + 50 }, { color: '#a347c9', size: 14, ms: 500, delay: i * 90, arc: 70, kind: 'spike', trail: false }); }); return 850; },
    'Stealth Rock': (f, c) => { c.foeSideCenters.forEach(p => { for (let i = 0; i < 4; i++) { const s = f.shape('rock', c.from, '#b8a25a', 18); const tx = p.x + (i - 1.5) * 34 - c.from.x, ty = p.y - 10 + (i % 2) * 20 - c.from.y; f.run(s, [{ transform: f.mv(0, 0, 'scale(.4)'), opacity: 0 }, { transform: f.mv(tx * .5, ty * .5 - 60, 'scale(1) rotate(120deg)'), opacity: 1, offset: .5 }, { transform: f.mv(tx, ty, 'scale(1) rotate(200deg)'), opacity: 1, offset: .8 }, { transform: f.mv(tx, ty, 'scale(1) rotate(220deg)'), opacity: 0 }], 900, { delay: i * 70 }); } }); return 1150; },
    'Sticky Web': (f, c) => { c.foeSideCenters.forEach(p => { f.projectile(c.from, { x: p.x, y: p.y + 30 }, { color: '#f0f0f0', size: 14, ms: 420, arc: 60, trail: false }); f.later(420, () => { const w = f.el('web', { x: p.x, y: p.y + 40 }); f.run(w, [{ transform: f.mv(0, 0, 'scale(.2)'), opacity: 0 }, { transform: f.mv(0, 0, 'scale(1)'), opacity: .9, offset: .4 }, { transform: f.mv(0, 0, 'scale(1)'), opacity: 0 }], 800); }); }); return 1250; },
    'Rock Slide': (f, c) => f.rain(c.targets, { kind: 'rock', color: '#b8a25a', n: 6, size: 30 }),
    'Stone Edge': (f, c) => f.rise(c.targets, { kind: 'spike', color: '#c9b47a', n: 4, ms: 560 }),
    'Rock Tomb': (f, c) => f.rain(c.targets, { kind: 'rock', color: '#a08c5a', n: 4, size: 38, stagger: 120 }),
    'Rock Blast': (f, c) => { for (let i = 0; i < 4; i++) c.targets.forEach(t => f.projectile(c.from, t, { color: '#b8a25a', size: 22, ms: 330, delay: i * 120, kind: 'rock', spin: true, trail: false })); c.targets.forEach(t => f.shake(t.el, 6, 500, 330)); return 900; },
    'Power Gem': (f, c) => { let e = 0; c.targets.forEach(t => { e = f.beam(c.from, t, { color: '#ff4dbf', core: '#fff3fb', width: 14, ms: 600, sparkle: 'sparkle' }); }); return e; },
    'Meteor Beam': (f, c) => { let e = 0; c.targets.forEach(t => { e = f.beam(c.from, t, { color: '#b38cff', core: '#ffffff', width: 38, ms: 850, sparkle: 'sparkle' }); }); f.flash('#d6c8ff', 500, .35, 200); return e; },
    'Rock Polish': (f, c) => { f.aura(c.from, c.user, { kind: 'sparkle', color: '#fff3c9', n: 12 }); return f.lunge(c.user, c.from, { x: c.from.x + 1, y: c.from.y }, { style: 'dash', ms: 400 }) + 500; },
    'Head Smash': (f, c) => { const d = f.lunge(c.user, c.from, c.t0, { style: 'charge', color: '#c9b47a', ms: 640 }); c.targets.forEach(t => { f.impact(t, 'punch', '#c9b47a', '#fff', d); f.particles(t, { kind: 'rock', color: '#b8a25a', n: 8, spread: 60, delay: d, size: 14 }); f.shake(t.el, 10, 450, d); }); return d + 520; },
    // ----- Steel -----
    'Flash Cannon': (f, c) => { let e = 0; c.targets.forEach(t => { e = f.beam(c.from, t, { color: '#c9d3e6', core: '#ffffff', width: 26, ms: 650 }); }); f.flash('#ffffff', 300, .45, 150); return e; },
    'Steel Beam': (f, c) => { let e = 0; c.targets.forEach(t => { e = f.beam(c.from, t, { color: '#9fb0c8', core: '#ffffff', width: 42, ms: 850 }); }); f.flash('#ffffff', 450, .55, 200); f.shake(undefined, 6, 500, 250); return e; },
    'Magnet Bomb': (f, c) => { c.targets.forEach(t => { f.projectile(c.from, t, { color: '#9fb0c8', size: 24, ms: 520, arc: 50, spin: true }); f.later(520, () => f.burst(t, '#c9d3e6', 100, 420)); }); return 950; },
    'Meteor Mash': (f, c) => { const d = f.lunge(c.user, c.from, c.t0, { style: 'charge', color: '#ffe14d', ms: 600 }); c.targets.forEach(t => { f.rain([t], { kind: 'meteor', color: '#ffd34d', n: 1, size: 34, ms: Math.max(1, d) }); f.impact(t, 'punch', '#c9d3e6', '#fff', d); }); return d + 500; },
    'Gigaton Hammer': (f, c) => { c.targets.forEach(t => { const h = f.el('hammer', { x: t.x, y: t.y - 80 }); f.run(h, [{ transform: f.mv(0, -40, 'rotate(-80deg)'), opacity: 0 }, { transform: f.mv(0, -40, 'rotate(-80deg)'), opacity: 1, offset: .3 }, { transform: f.mv(0, 30, 'rotate(15deg)'), opacity: 1, offset: .55 }, { transform: f.mv(0, 30, 'rotate(10deg)'), opacity: 0 }], 900, { easing: 'ease-in' }); }); f.later(500, () => f.quake({ targets: c.targets, ms: 500, strength: 10 })); return 1050; },
    'Anchor Shot': (f, c) => { c.targets.forEach(t => { f.projectile(c.from, t, { color: '#9fb0c8', size: 30, ms: 450, kind: 'anchor', trail: true }); f.later(450, () => f.orbit(t, { kind: 'chain', color: '#9fb0c8', n: 6, r: 38, ms: 600, size: 12 })); }); return 1050; },
    'Iron Defense': (f, c) => { f.glow(c.user, '#c9d3e6', 800); f.later(150, () => f.ring(c.from, '#ffffff', 110, 500, 0, 6)); return 800; },
    'Shift Gear': (f, c) => { f.orbit(c.from, { kind: 'gear', color: '#c9d3e6', n: 2, r: 30, ms: 900, size: 34, spins: 2 }); return 900; },
    "King's Shield": (f, c) => { const s = f.el('kshield', c.from); f.run(s, [{ transform: f.mv(0, 0, 'scale(.3)'), opacity: 0 }, { transform: f.mv(0, 0, 'scale(1)'), opacity: 1, offset: .4 }, { transform: f.mv(0, 0, 'scale(1.05)'), opacity: 0 }], 700); return 700; },
    // ----- Fighting -----
    'Aura Sphere': (f, c) => { c.targets.forEach(t => { f.projectile(c.from, t, { color: '#3d8bff', color2: '#e6f5ff', size: 38, ms: 480 }); f.later(480, () => { f.burst(t, '#5ca8ff', 120, 450); f.ring(t, '#bfe3ff', 110, 500); }); }); f.glow(c.user, '#5ca8ff', 500); return 1000; },
    'Focus Blast': (f, c) => { c.targets.forEach(t => { f.projectile(c.from, t, { color: '#ff9a3c', color2: '#fff3b0', size: 46, ms: 560 }); f.later(560, () => { f.burst(t, '#ffb020', 140, 500); f.shake(t.el, 9, 450); }); }); return 1100; },
    'Vacuum Wave': (f, c) => { c.targets.forEach(t => { for (let i = 0; i < 3; i++) f.projectile(c.from, t, { color: '#ffffff', size: 30 - i * 6, ms: 320, delay: i * 40, kind: 'ringproj', trail: false }); }); return 650; },
    'Close Combat': (f, c) => { const d = f.lunge(c.user, c.from, c.t0, { style: 'charge', color: '#e0452b', ms: 700 }); c.targets.forEach(t => { for (let i = 0; i < 5; i++) f.impact({ x: t.x + (Math.random() - .5) * 50, y: t.y + (Math.random() - .5) * 50 }, i % 2 ? 'kick' : 'punch', '#e0452b', '#ffb37a', d - 120 + i * 70); f.shake(t.el, 9, 500, d); }); return d + 520; },
    'Focus Punch': (f, c) => { f.glow(c.user, '#ffb020', 400); const d = f.lunge(c.user, c.from, c.t0, { style: 'charge', color: '#ffb020', ms: 600 }); c.targets.forEach(t => { f.impact(t, 'punch', '#ffb020', '#fff', d); f.ring(t, '#ffd34d', 120, 450, d); f.shake(t.el, 12, 500, d); }); f.flash('#fff3b0', 250, .35, d); return d + 550; },
    'Dynamic Punch': (f, c) => { const d = f.lunge(c.user, c.from, c.t0, { style: 'charge', color: '#ff7a1a', ms: 600 }); c.targets.forEach(t => { f.impact(t, 'punch', '#ff7a1a', '#ffd34d', d); f.burst(t, '#ff7a1a', 140, 500, d); }); return d + 600; },
    'Sky Uppercut': (f, c) => { const d = f.lunge(c.user, c.from, c.t0, { style: 'dash', color: '#e0452b', ms: 520 }); c.targets.forEach(t => { f.impact(t, 'punch', '#e0452b', '#fff', d); t.el && t.el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-40px)', offset: .4 }, { transform: 'translateY(0)' }], { duration: f.D(500), delay: f.D(d) }); }); return d + 550; },
    'Counter': (f, c) => { f.glow(c.user, '#e0452b', 300); const d = f.lunge(c.user, c.from, c.t0, { style: 'dash', color: '#e0452b', ms: 420 }); c.targets.forEach(t => f.impact(t, 'punch', '#e0452b', '#fff', d)); return d + 450; },
    'Bulk Up': (f, c) => { c.user && c.user.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)', offset: .3 }, { transform: 'scale(1)', offset: .5 }, { transform: 'scale(1.12)', offset: .75 }, { transform: 'scale(1)' }], { duration: f.D(800) }); f.aura(c.from, null, { kind: 'p', color: '#ff7a5c', n: 10, ms: 700 }); return 850; },
    'Detect': (f, c) => { f.flash('#ffffff', 200, .35); const s = f.el('eyeflash', c.from); f.run(s, [{ opacity: 0, transform: f.mv(0, -10, 'scale(.4)') }, { opacity: 1, transform: f.mv(0, -10, 'scale(1)'), offset: .3 }, { opacity: 0, transform: f.mv(0, -10, 'scale(1.2)') }], 550); return 600; },
    // ----- Psychic -----
    'Psychic': (f, c) => { c.targets.forEach(t => { for (let i = 0; i < 4; i++) f.ring(t, '#ff5c9d', 70 + i * 18, 600, i * 90, 3); t.el && t.el.animate([{ transform: 'translateY(0) rotate(0deg)', filter: 'none' }, { transform: 'translateY(-26px) rotate(-6deg)', filter: 'drop-shadow(0 0 12px #ff5c9d) hue-rotate(40deg)', offset: .45 }, { transform: 'translateY(-22px) rotate(6deg)', filter: 'drop-shadow(0 0 12px #ff5c9d)', offset: .7 }, { transform: 'translateY(0) rotate(0deg)', filter: 'none' }], { duration: f.D(900) }); }); f.glow(c.user, '#ff5c9d', 700); return 1000; },
    'Psyshock': (f, c) => { c.targets.forEach(t => { for (let i = 0; i < 5; i++) f.projectile({ x: t.x + (Math.random() - .5) * 140, y: t.y - 90 }, { x: t.x + (Math.random() - .5) * 20, y: t.y }, { color: '#ff5c9d', size: 18, ms: 360, delay: i * 70, kind: 'crystal', trail: false }); }); return 800; },
    'Psystrike': (f, c) => { c.targets.forEach(t => { for (let i = 0; i < 8; i++) f.projectile({ x: t.x + Math.cos(i * .785) * 110, y: t.y + Math.sin(i * .785) * 90 }, t, { color: '#ff5c9d', size: 18, ms: 380, delay: i * 45, kind: 'crystal', trail: false }); f.burst(t, '#ff5c9d', 140, 500, 700); }); f.flash('#ff5c9d', 400, .3, 650); return 1150; },
    'Psybeam': (f, c) => { let e = 0; c.targets.forEach(t => { e = f.beam(c.from, t, { color: '#ff5cd0', core: '#c2f0ff', width: 18, ms: 650, wavy: true }); for (let i = 0; i < 3; i++) f.ring(t, ['#ff5c9d', '#5cc8ff', '#ffe14d'][i], 80, 450, 300 + i * 80, 3); }); return e + 100; },
    'Extrasensory': (f, c) => { c.targets.forEach(t => { const s = f.el('eyeflash', t); f.run(s, [{ opacity: 0, transform: f.mv(0, 0, 'scale(.4)') }, { opacity: 1, transform: f.mv(0, 0, 'scale(1.2)'), offset: .3 }, { opacity: 0, transform: f.mv(0, 0, 'scale(1.6)') }], 600); f.shake(t.el, 7, 400, 200); }); f.flash('#ff5c9d', 300, .3); return 700; },
    'Future Sight': (f, c) => { if (c.user && !c.targets.length) { const s = f.shape('p', c.from, '#ff5c9d', 30); f.run(s, [{ transform: f.mv(0, 0, 'scale(.3)'), opacity: 0 }, { transform: f.mv(0, -60, 'scale(1)'), opacity: 1, offset: .4 }, { transform: f.mv(0, -200, 'scale(.4)'), opacity: 0 }], 800); return 800; } c.targets.forEach(t => { f.projectile({ x: t.x, y: -20 }, t, { color: '#ff5c9d', size: 40, ms: 500 }); f.later(500, () => { f.burst(t, '#ff5c9d', 130, 500); f.ring(t, '#ffc2dc', 120, 500); }); }); return 1000; },
    'Zen Headbutt': (f, c) => { f.glow(c.user, '#ff5c9d', 400); const d = f.lunge(c.user, c.from, c.t0, { style: 'charge', color: '#ff5c9d', ms: 600 }); c.targets.forEach(t => { f.impact(t, 'plain', '#ff5c9d', '#ffc2dc', d); f.ring(t, '#ff5c9d', 100, 450, d); }); return d + 500; },
    'Hypnosis': (f, c) => { c.targets.forEach(t => { for (let i = 0; i < 5; i++) f.projectile(c.from, t, { color: 'transparent', size: 30 + i * 4, ms: 500, delay: i * 90, kind: 'ringproj pink', trail: false }); }); return 1000; },
    'Calm Mind': (f, c) => { for (let i = 0; i < 3; i++) f.ring(c.from, '#ff9ad5', 120 - i * 25, 700, i * 120, 3); f.glow(c.user, '#ff5c9d', 800); return 900; },
    'Agility': (f, c) => { for (let i = 0; i < 3; i++) f.later(i * 120, () => f.lunge(c.user, c.from, { x: c.from.x + (i % 2 ? 40 : -40), y: c.from.y }, { style: 'dash', ms: 260, color: '#ff9ad5' })); return 700; },
    'Reflect': (f, c) => f.screen(c.userLeft, '#ffb020'),
    'Light Screen': (f, c) => f.screen(c.userLeft, '#ffe14d'),
    'Trick Room': (f) => { const b = f.el('trickroom', { x: f.W / 2, y: f.H / 2 }); f.run(b, [{ transform: f.mv(0, 0, 'scale(.2) rotate(45deg)'), opacity: 0 }, { transform: f.mv(0, 0, 'scale(1) rotate(0deg)'), opacity: 1, offset: .45 }, { transform: f.mv(0, 0, 'scale(1.05)'), opacity: 0 }], 1200); return 1200; },
    'Gravity': (f) => { for (let i = 0; i < 26; i++) { const s = f.el('rainline grav', { x: Math.random() * f.W, y: -20 }); f.run(s, [{ transform: f.mv(0, 0), opacity: .8 }, { transform: f.mv(0, f.H + 40), opacity: 0 }], 600, { delay: Math.random() * 500, easing: 'ease-in' }); } f.shake(undefined, 5, 600, 300); return 1100; },
    'Magic Coat': (f, c) => { f.ring(c.from, '#c9b3ff', 110, 600, 0, 5); f.glow(c.user, '#c9b3ff', 600); return 650; },
    'Rest': (f, c) => { for (let i = 0; i < 3; i++) { const s = f.shape('zzz', { x: c.from.x + 20 + i * 12, y: c.from.y - 20 }, '#ffffff', 18 + i * 4); f.run(s, [{ transform: f.mv(0, 0), opacity: 0 }, { transform: f.mv(10, -30), opacity: 1, offset: .4 }, { transform: f.mv(20, -60), opacity: 0 }], 800, { delay: i * 180 }); } f.later(400, () => f.ring(c.from, '#3ddc84', 100, 500)); return 1200; },
    'Teleport': (f, c) => { c.user && c.user.animate([{ opacity: 1, filter: 'none' }, { opacity: 0, filter: 'brightness(3)' }], { duration: f.D(400), fill: 'forwards' }); f.particles(c.from, { kind: 'sparkle', color: '#ff9ad5', n: 12, spread: 50 }); return 500; },
    'Trick': (f, c) => { c.targets.forEach(t => { f.projectile(c.from, t, { color: '#ffd34d', size: 16, ms: 450, arc: 50, trail: false }); f.projectile(t, c.from, { color: '#8fe3ff', size: 16, ms: 450, arc: -50, trail: false }); }); return 650; },
    // ----- Ghost / Dark -----
    'Shadow Ball': (f, c) => { c.targets.forEach(t => { f.projectile(c.from, t, { color: '#3a2266', color2: '#a78bff', size: 40, ms: 500, kind: 'shadow' }); f.later(500, () => { f.burst(t, '#7a5cc9', 120, 450); f.particles(t, { kind: 'wisp', color: '#7a5cc9', n: 8, spread: 50 }); }); }); return 1000; },
    'Hex': (f, c) => { c.targets.forEach(t => { f.orbit(t, { kind: 'wisp', color: '#a78bff', n: 5, r: 44, ms: 750, size: 20 }); f.later(500, () => f.burst(t, '#7a5cc9', 110, 400)); }); return 950; },
    'Night Shade': (f, c) => { let e = 0; c.targets.forEach(t => { e = f.beam(c.from, t, { color: '#2a1840', core: '#b05cff', width: 22, ms: 650 }); }); f.flash('#1a0f2a', 500, .5); return e; },
    'Poltergeist': (f, c) => { c.targets.forEach(t => { for (let i = 0; i < 4; i++) f.projectile({ x: t.x + Math.cos(i * 1.57) * 90, y: t.y + Math.sin(i * 1.57) * 70 }, t, { color: '#a78bff', size: 20, ms: 420, delay: 150 + i * 80, kind: 'rock', spin: true, trail: false }); f.orbit(t, { kind: 'wisp', color: '#7a5cc9', n: 4, r: 70, ms: 500, size: 16 }); }); return 1000; },
    'Shadow Sneak': (f, c) => { c.targets.forEach(t => { const s = f.el('shadowline', c.from); const dx = t.x - c.from.x, dy = t.y - c.from.y; f.run(s, [{ transform: f.mv(0, 40, 'scaleX(.4)'), opacity: .9 }, { transform: f.mv(dx, dy + 40, 'scaleX(1)'), opacity: .9, offset: .7 }, { transform: f.mv(dx, dy + 40), opacity: 0 }], 450, { easing: 'ease-in' }); f.impact(t, 'plain', '#7a5cc9', '#c9b3ff', 350); }); return 750; },
    'Phantom Force': (f, c) => { if (c.charge) { c.user && c.user.animate([{ opacity: 1 }, { opacity: 0 }], { duration: f.D(400), fill: 'forwards' }); return 450; } c.targets.forEach(t => { f.flash('#1a0f2a', 400, .5); f.impact(t, 'claw', '#7a5cc9', '#c9b3ff', 200); }); return 700; },
    'Spirit Shackle': (f, c) => { c.targets.forEach(t => { f.projectile(c.from, t, { color: '#7a5cc9', size: 22, ms: 380, kind: 'arrow' }); f.later(380, () => f.orbit(t, { kind: 'chain', color: '#a78bff', n: 6, r: 38, ms: 600, size: 12 })); }); return 1000; },
    'Dark Pulse': (f, c) => { c.targets.forEach(t => { for (let i = 0; i < 4; i++) f.projectile(c.from, t, { color: 'transparent', size: 40, ms: 460, delay: i * 90, kind: 'ringproj dark', trail: false }); f.burst(t, '#4a2a5a', 110, 400, 500); }); return 950; },
    'Night Daze': (f, c) => { f.flash('#2a0f2a', 600, .6); c.targets.forEach(t => { f.ring(t, '#ff3b5c', 130, 600, 200, 5); f.shake(t.el, 8, 450, 250); }); return 900; },
    'Knock Off': (f, c) => { const d = f.lunge(c.user, c.from, c.t0, { ms: 520 }); c.targets.forEach(t => { f.impact(t, 'slash', '#4a3a33', '#d6c3b8', d); const it = f.shape('p', t, '#ffd34d', 14); f.run(it, [{ transform: f.mv(0, 0), opacity: 1 }, { transform: f.mv(60, -60, 'rotate(300deg)'), opacity: 1, offset: .6 }, { transform: f.mv(100, 10, 'rotate(500deg)'), opacity: 0 }], 600, { delay: d + 60 }); }); return d + 650; },
    'Sucker Punch': (f, c) => { const d = f.lunge(c.user, c.from, c.t0, { style: 'dash', color: '#4a3a33', ms: 380 }); c.targets.forEach(t => f.impact(t, 'punch', '#4a3a33', '#d6c3b8', d)); return d + 420; },
    'Nasty Plot': (f, c) => { f.glow(c.user, '#3a1a40', 800); for (let i = 0; i < 3; i++) { const s = f.shape('p', { x: c.from.x + (i - 1) * 26, y: c.from.y - 50 }, '#b05cff', 10); f.run(s, [{ transform: f.mv(0, 0, 'scale(.3)'), opacity: 0 }, { transform: f.mv(0, -10, 'scale(1)'), opacity: 1, offset: .4 }, { transform: f.mv(0, -20, 'scale(.3)'), opacity: 0 }], 700, { delay: i * 100 }); } return 850; },
    'Taunt': (f, c) => { c.targets.forEach(t => { const s = f.el('symbol', { x: t.x, y: t.y - 55 }); s.textContent = '💢'; f.run(s, [{ transform: f.mv(0, 0, 'scale(.3)'), opacity: 0 }, { transform: f.mv(0, -10, 'scale(1.2)'), opacity: 1, offset: .3 }, { transform: f.mv(0, -18, 'scale(1)'), opacity: 0 }], 800); }); return 850; },
    'Parting Shot': (f, c) => { c.targets.forEach(t => { const s = f.el('symbol', { x: t.x, y: t.y - 55 }); s.textContent = '💢'; f.run(s, [{ transform: f.mv(0, 0, 'scale(.3)'), opacity: 0 }, { transform: f.mv(0, -10, 'scale(1.2)'), opacity: 1, offset: .3 }, { transform: f.mv(0, -18, 'scale(1)'), opacity: 0 }], 700); }); c.user && c.user.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${c.userLeft ? -60 : 60}px)`, opacity: 0 }], { duration: f.D(500), delay: f.D(400), fill: 'forwards' }); return 950; },
    // ----- Dragon -----
    'Draco Meteor': (f, c) => { f.projectile(c.from, { x: c.from.x, y: -40 }, { color: '#ff7a1a', color2: '#ffd34d', size: 30, ms: 400, kind: 'flame' }); f.flash('#2a1a50', 700, .35, 300); return 300 + f.rain(c.targets, { kind: 'meteor', color: '#ff8a3c', n: 4, size: 34, ms: 520, stagger: 110, fromSide: 80 }); },
    'Dragon Pulse': (f, c) => { let e = 0; c.targets.forEach(t => { e = f.beam(c.from, t, { color: '#6a4cff', core: '#7fffe0', width: 24, ms: 700, wavy: true }); }); return e; },
    'Dragon Dance': (f, c) => { f.aura(c.from, c.user, { kind: 'flame', color: '#7a5cff', n: 16, ms: 800 }); f.later(200, () => f.aura(c.from, null, { kind: 'flame', color: '#ff5a5a', n: 10, ms: 700 })); return 950; },
    'Outrage': (f, c) => { for (let i = 0; i < 2; i++) f.later(i * 300, () => f.lunge(c.user, c.from, c.t0, { style: 'charge', color: '#ff3b3b', ms: 380 })); c.targets.forEach(t => { f.impact(t, 'claw', '#ff3b3b', '#ffb3b3', 200); f.impact(t, 'claw', '#6a4cff', '#b9a8ff', 500); }); return 950; },
    // ----- Poison -----
    'Sludge Bomb': (f, c) => { c.targets.forEach(t => { f.projectile(c.from, t, { color: '#8a2fb8', color2: '#e2a6ff', size: 32, ms: 480, arc: 60, kind: 'blob' }); f.later(480, () => f.particles(t, { kind: 'bubble', color: '#b05cff', n: 14, spread: 60, rise: 10, size: 14 })); }); return 950; },
    'Toxic': (f, c) => { c.targets.forEach(t => { f.projectile(c.from, t, { color: '#8a2fb8', size: 18, ms: 380, arc: 40 }); f.later(380, () => f.aura(t, null, { kind: 'bubble', color: '#b05cff', n: 14, ms: 700 })); }); return 1050; },
    'Gunk Shot': (f, c) => { c.targets.forEach(t => { f.projectile(c.from, t, { color: '#5a3a1a', color2: '#b05cff', size: 40, ms: 500, arc: 80, kind: 'blob', spin: true }); f.later(500, () => { f.particles(t, { kind: 'bubble', color: '#8a2fb8', n: 18, spread: 80, size: 16 }); f.shake(t.el, 8, 400); }); }); return 1000; },
    // ----- Flying / Normal / Fairy / Bug -----
    'Hurricane': (f, c) => { c.targets.forEach(t => { const tw = f.el('tornado', { x: t.x, y: t.y - 10 }); f.run(tw, [{ transform: f.mv(0, 30, 'scale(.3)'), opacity: 0 }, { transform: f.mv(0, 0, 'scale(1)'), opacity: .9, offset: .3 }, { transform: f.mv(0, -10, 'scale(1.05)'), opacity: .9, offset: .8 }, { transform: f.mv(0, -30, 'scale(1.1)'), opacity: 0 }], 1100); t.el && t.el.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-10deg) translateY(-14px)', offset: .3 }, { transform: 'rotate(10deg) translateY(-10px)', offset: .6 }, { transform: 'rotate(0)' }], { duration: f.D(1000) }); }); f.storm({ kind: 'windline', color: '#ffffff', n: 16, ms: 800, fromLeft: c.userLeft }); return 1150; },
    'Air Slash': (f, c) => { for (let i = 0; i < 3; i++) c.targets.forEach(t => f.projectile(c.from, t, { color: '#e6f0ff', size: 34, ms: 360, delay: i * 100, kind: 'crescent', trail: false })); c.targets.forEach(t => f.impact(t, 'slash', '#a8b8ff', '#ffffff', 380)); return 850; },
    'Tailwind': (f, c) => f.storm({ kind: 'windline', color: '#ffffff', n: 34, ms: 900, fromLeft: c.userLeft }),
    'Defog': (f, c) => f.storm({ kind: 'windline', color: '#e6f0ff', n: 30, ms: 900, fromLeft: c.userLeft, swirl: true }),
    'Roost': (f, c) => { for (let i = 0; i < 8; i++) { const s = f.shape('feather', { x: c.from.x + (Math.random() - .5) * 80, y: c.from.y - 70 }, '#ffffff', 16); f.run(s, [{ transform: f.mv(0, 0, 'rotate(0)'), opacity: 0 }, { transform: f.mv(Math.random() * 20 - 10, 40, 'rotate(60deg)'), opacity: 1, offset: .5 }, { transform: f.mv(Math.random() * 30 - 15, 80, 'rotate(-30deg)'), opacity: 0 }], 900, { delay: Math.random() * 300 }); } f.later(500, () => f.ring(c.from, '#3ddc84', 100, 450)); return 1050; },
    'Fly': (f, c) => { if (c.charge) { c.user && c.user.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-260px)', opacity: 0 }], { duration: f.D(500), easing: 'ease-in', fill: 'forwards' }); return 550; } c.targets.forEach(t => { f.rain([t], { kind: 'p', color: '#ffffff', n: 1, size: 40, ms: 380 }); f.impact(t, 'plain', '#a8b8ff', '#ffffff', 380); f.shake(t.el, 8, 400, 380); }); return 800; },
    'Bounce': (f, c) => { if (c.charge) { c.user && c.user.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-260px)', opacity: 0 }], { duration: f.D(500), easing: 'cubic-bezier(.2,1.4,.4,1)', fill: 'forwards' }); return 550; } return R['Fly'](f, c); },
    'Dig': (f, c) => { if (c.charge) { c.user && c.user.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(40px) scaleY(.2)', opacity: 0 }], { duration: f.D(450), fill: 'forwards' }); f.particles(c.from, { kind: 'dust', color: '#c9a04a', n: 12, spread: 50, size: 14 }); return 500; } c.targets.forEach(t => { f.rise([t], { kind: 'spike', color: '#c9a04a', n: 1 }); f.particles(t, { kind: 'dust', color: '#c9a04a', n: 14, spread: 60, size: 14, rise: 20 }); }); return 750; },
    'Dive': (f, c) => { if (c.charge) { f.particles(c.from, { kind: 'drop', color: '#7fc0ff', n: 14, spread: 50, rise: 30 }); c.user && c.user.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(40px)', opacity: 0 }], { duration: f.D(450), fill: 'forwards' }); return 500; } c.targets.forEach(t => { const col = f.el('column', { x: t.x, y: t.y }); col.style.setProperty('--c', '#3d8bff'); f.run(col, [{ transform: f.mv(0, 60, 'scaleY(0)'), opacity: 0 }, { transform: f.mv(0, 0, 'scaleY(1)'), opacity: .9, offset: .4 }, { transform: f.mv(0, -30, 'scaleY(.8)'), opacity: 0 }], 650); f.particles(t, { kind: 'drop', color: '#bfe3ff', n: 14, spread: 60, rise: 40 }); }); return 750; },
    'Brave Bird': (f, c) => { const d = f.lunge(c.user, c.from, c.t0, { style: 'charge', color: '#ff9a3c', ms: 620 }); c.targets.forEach(t => { f.impact(t, 'plain', '#ff9a3c', '#ffd34d', d); f.particles(t, { kind: 'feather', color: '#ffffff', n: 8, spread: 60, delay: d }); }); return d + 520; },
    'Boomburst': (f, c) => { for (let i = 0; i < 6; i++) f.ring(c.from, '#ffffff', 120 + i * 50, 700, i * 70, 6); f.shake(undefined, 8, 700, 150); c.targets.forEach(t => f.shake(t.el, 10, 500, 250)); return 1000; },
    'Hyper Voice': (f, c) => { for (let i = 0; i < 4; i++) f.ring(c.from, '#ffe9b0', 110 + i * 40, 650, i * 90, 5); c.targets.forEach(t => f.shake(t.el, 7, 450, 300)); return 900; },
    'Disarming Voice': (f, c) => { for (let i = 0; i < 4; i++) f.ring(c.from, '#ff8ad8', 100 + i * 40, 600, i * 90, 4); c.targets.forEach(t => f.particles(t, { kind: 'heart', color: '#ff8ad8', n: 5, spread: 40, delay: 300, rise: 30, size: 16 })); return 850; },
    'Swift': (f, c) => { for (let i = 0; i < 5; i++) c.targets.forEach(t => f.projectile(c.from, t, { color: '#ffe14d', size: 22, ms: 420, delay: i * 70, kind: 'starproj', spin: true, arc: (i - 2) * 25, trail: false })); return 850; },
    'Tri Attack': (f, c) => { const cols = ['#ff7a1a', '#8fe3ff', '#ffd60a']; c.targets.forEach(t => { cols.forEach((col, i) => { const a = i * 2.09; f.projectile({ x: c.from.x + Math.cos(a) * 30, y: c.from.y + Math.sin(a) * 30 }, t, { color: col, size: 22, ms: 460, delay: i * 40 }); }); f.later(500, () => f.burst(t, '#ffffff', 110, 400)); }); return 950; },
    'Explosion': (f, c) => { f.glow(c.user, '#ffffff', 300); f.later(250, () => { f.burst(c.from, '#ff7a1a', 360, 700); f.burst(c.from, '#ffd34d', 220, 550, 80); f.particles(c.from, { kind: 'flame', color: '#ff9a3c', n: 30, spread: 170, size: 18, ms: 800 }); }); f.flash('#ffffff', 600, .95, 230); f.shake(undefined, 14, 800, 250); c.targets.forEach(t => f.shake(t.el, 10, 500, 400)); return 1150; },
    'Extreme Speed': (f, c) => { const d = f.lunge(c.user, c.from, c.t0, { style: 'dash', color: '#ffffff', ms: 360 }); f.storm({ kind: 'windline', color: '#ffffff', n: 10, ms: 380, fromLeft: c.userLeft }); c.targets.forEach(t => f.impact(t, 'plain', '#ffffff', '#ffe9b0', d)); return d + 420; },
    'Swords Dance': (f, c) => { f.orbit(c.from, { kind: 'sword', color: '#e8ecf3', n: 4, r: 54, ms: 1000, size: 34, spins: 1.5 }); f.glow(c.user, '#ffffff', 1000); return 1050; },
    'Belly Drum': (f, c) => { for (let i = 0; i < 4; i++) { f.ring(c.from, '#ff7a5c', 90, 300, i * 180, 5); f.later(i * 180, () => c.user && c.user.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.1,.92)' }, { transform: 'scale(1)' }], { duration: f.D(160) })); } return 850; },
    'Shell Smash': (f, c) => { f.particles(c.from, { kind: 'rock', color: '#e6dcc0', n: 14, spread: 70, size: 14 }); f.glow(c.user, '#ffb020', 700); f.shake(c.user, 8, 300); return 800; },
    'Protect': (f, c) => { const s = f.el('pbubble', c.from); f.run(s, [{ transform: f.mv(0, 0, 'scale(.3)'), opacity: 0 }, { transform: f.mv(0, 0, 'scale(1)'), opacity: 1, offset: .4 }, { transform: f.mv(0, 0, 'scale(1.03)'), opacity: 0 }], 650); return 650; },
    'Substitute': (f, c) => { f.particles(c.from, { kind: 'p', color: '#ffffff', n: 12, spread: 50 }); return 550; },
    'Recover': (f, c) => { for (let i = 0; i < 12; i++) f.stream({ x: c.from.x + Math.cos(i) * 80, y: c.from.y + Math.sin(i) * 70 }, c.from, { kind: 'sparkle', color: '#8dffc0', n: 1, ms: 500, delay: i * 35 }); f.later(550, () => f.ring(c.from, '#3ddc84', 110, 450)); return 1050; },
    'Wish': (f, c) => { f.projectile(c.from, { x: c.from.x, y: -30 }, { color: '#ffe14d', size: 24, ms: 600, kind: 'starproj', spin: true }); return 700; },
    'Sing': (f, c) => { c.targets.forEach(t => f.stream(c.from, t, { kind: 'note', color: '#ff8ad8', n: 6, ms: 700, size: 18, stagger: 90, wobble: 30 })); return 1250; },
    'Charm': (f, c) => { c.targets.forEach(t => f.stream(c.from, t, { kind: 'heart', color: '#ff8ad8', n: 5, ms: 650, size: 18, stagger: 90, wobble: 25 })); return 1100; },
    'Roar': (f, c) => { for (let i = 0; i < 4; i++) f.ring(c.from, '#ffffff', 110 + i * 40, 600, i * 80, 5); c.targets.forEach(t => f.shake(t.el, 9, 500, 250)); return 850; },
    'Encore': (f, c) => { c.targets.forEach(t => { for (let i = 0; i < 2; i++) { const s = f.el('symbol', { x: t.x + (i ? 30 : -30), y: t.y - 50 }); s.textContent = '👏'; f.run(s, [{ transform: f.mv(0, 0, 'scale(.4)'), opacity: 0 }, { transform: f.mv(0, -10, 'scale(1)'), opacity: 1, offset: .3 }, { transform: f.mv(0, -16, 'scale(1)'), opacity: 0 }], 700, { delay: i * 120 }); } }); return 850; },
    'Disable': (f, c) => { c.targets.forEach(t => { const s = f.el('symbol', { x: t.x, y: t.y - 55 }); s.textContent = '🚫'; f.run(s, [{ transform: f.mv(0, 0, 'scale(.4)'), opacity: 0 }, { transform: f.mv(0, -6, 'scale(1)'), opacity: 1, offset: .3 }, { transform: f.mv(0, -10, 'scale(1)'), opacity: 0 }], 750); }); return 800; },
    'Pain Split': (f, c) => { c.targets.forEach(t => { f.stream(c.from, t, { kind: 'p', color: '#ff7a7a', n: 6, ms: 500 }); f.stream(t, c.from, { kind: 'p', color: '#7aff9a', n: 6, ms: 500 }); }); return 900; },
    'Moonblast': (f, c) => { c.targets.forEach(t => { const m = f.el('moon', { x: c.from.x, y: c.from.y - 70 }); f.run(m, [{ transform: f.mv(0, 0, 'scale(.3)'), opacity: 0 }, { transform: f.mv(0, 0, 'scale(1)'), opacity: 1, offset: .4 }, { transform: f.mv(0, 0, 'scale(1)'), opacity: 0 }], 600); f.projectile({ x: c.from.x, y: c.from.y - 70 }, t, { color: '#ff8ad8', color2: '#fff0fa', size: 36, ms: 450, delay: 450 }); f.later(900, () => f.burst(t, '#ffb3e6', 130, 450)); }); return 1350; },
    'Dazzling Gleam': (f, c) => { f.flash('#ffe0f5', 500, .85, 100); c.targets.forEach(t => f.particles(t, { kind: 'sparkle', color: '#ffffff', n: 14, spread: 70, delay: 200 })); f.glow(c.user, '#ff8ad8', 500); return 750; },
    'Draining Kiss': (f, c) => { c.targets.forEach(t => { f.stream(c.from, t, { kind: 'heart', color: '#ff8ad8', n: 3, ms: 450, size: 18 }); f.stream(t, c.from, { kind: 'p', color: '#ffc2e8', n: 8, ms: 550, delay: 600 }); }); return 1300; },
    'Moonlight': (f, c) => { const m = f.el('moon', { x: c.from.x, y: c.from.y - 90 }); f.run(m, [{ opacity: 0 }, { opacity: 1, offset: .4 }, { opacity: 0 }], 900); f.later(400, () => f.ring(c.from, '#3ddc84', 100, 450)); return 1000; },
    'Play Rough': (f, c) => { const d = f.lunge(c.user, c.from, c.t0, { style: 'charge', color: '#ff8ad8', ms: 600 }); c.targets.forEach(t => { const cl = f.el('dustcloud', t); f.run(cl, [{ transform: f.mv(0, 0, 'scale(.3)'), opacity: 0 }, { transform: f.mv(0, 0, 'scale(1)'), opacity: .95, offset: .3 }, { transform: f.mv(0, 0, 'scale(1.1)'), opacity: 0 }], 700, { delay: d - 100 }); f.particles(t, { kind: 'star', color: '#ffe14d', n: 6, spread: 55, delay: d }); f.particles(t, { kind: 'heart', color: '#ff8ad8', n: 4, spread: 55, delay: d + 100 }); }); return d + 650; },
    'Leech Life': (f, c) => { const d = f.lunge(c.user, c.from, c.t0, { ms: 480 }); c.targets.forEach(t => { f.impact(t, 'bite', '#9cc51b', '#e3f59b', d); f.stream(t, c.from, { kind: 'p', color: '#ff7a7a', n: 6, ms: 450, delay: d + 200 }); }); return d + 800; },
    'Pin Missile': (f, c) => { for (let i = 0; i < 5; i++) c.targets.forEach(t => f.projectile(c.from, t, { color: '#e3f59b', size: 16, ms: 300, delay: i * 70, kind: 'spike', trail: false })); return 700; },
    'U-turn': (f, c) => { const d = f.lunge(c.user, c.from, c.t0, { style: 'dash', color: '#9cc51b', ms: 480 }); c.targets.forEach(t => f.impact(t, 'plain', '#9cc51b', '#e3f59b', d)); return d + 450; },
    'Metronome': (f, c) => { c.user && c.user.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-8deg)' }, { transform: 'rotate(8deg)' }, { transform: 'rotate(-8deg)' }, { transform: 'rotate(0)' }], { duration: f.D(700) }); f.particles(c.from, { kind: 'sparkle', color: '#ffe14d', n: 10, spread: 50 }); return 750; },
    'Copycat': (f, c) => R['Metronome'](f, c),
    'Fake Out': (f, c) => { const d = f.lunge(c.user, c.from, c.t0, { style: 'dash', ms: 360 }); c.targets.forEach(t => { const s = f.el('clap', t); f.run(s, [{ transform: f.mv(0, 0, 'scale(1.6)'), opacity: 0 }, { transform: f.mv(0, 0, 'scale(1)'), opacity: 1, offset: .4 }, { transform: f.mv(0, 0, 'scale(1.3)'), opacity: 0 }], 400, { delay: d }); f.shake(t.el, 7, 350, d); }); return d + 420; },
  };
  // a few aliases that share a recipe
  Object.assign(R, { 'Muddy Water': R['Surf'], 'Withdraw': R['Iron Defense'], 'Slack Off': R['Recover'], 'Soft-Boiled': R['Recover'], 'Mirror Coat': R['Magic Coat'] });

  // ---------- fallbacks by type and category ----------
  function fallback(f, c) {
    const t = T(c.type);
    if (c.charge) { f.stream({ x: c.from.x + 70, y: c.from.y - 60 }, c.from, { kind: t.p === 'ring' ? 'p' : t.p, color: t.c, n: 8, ms: 450 }); f.glow(c.user, t.c, 600); return 650; }
    if (c.cat === 'Status') {
      if (c.targets.length && !c.targets.every(x => x.el === c.user)) { c.targets.forEach(x => { f.stream(c.from, x, { kind: t.p === 'ring' ? 'p' : t.p, color: t.c, n: 6, ms: 500 }); f.later(500, () => f.ring(x, t.c, 80, 400)); }); return 950; }
      return f.aura(c.from, c.user, { kind: t.p === 'ring' ? 'p' : t.p, color: t.c, n: 14, ms: 750 });
    }
    if (c.cat === 'Physical' && c.user && c.targets.length && c.contact !== false) {
      const style = DASH.has(c.name) ? 'dash' : JUMP.has(c.name) ? 'jump' : SPIN.has(c.name) ? 'spin' : CHARGE.has(c.name) ? 'charge' : 'normal';
      const hit = HIT_OF[c.name] || (c.flags.punch ? 'punch' : c.flags.bite ? 'bite' : c.flags.slicing ? 'slash' : 'plain');
      const ms = style === 'jump' ? 720 : style === 'charge' ? 640 : style === 'dash' ? 400 : 540;
      if (style === 'charge' && c.type !== 'Normal') f.glow(c.user, t.c, ms);
      const d = f.lunge(c.user, c.from, c.t0, { ms, style, color: t.c });
      c.targets.forEach(x => { f.impact(x, hit, t.c, t.c2, d); if (style === 'jump' && ['Heavy Slam', 'Body Press', 'Gigaton Hammer', 'Dragon Hammer', 'Ice Hammer', 'Wood Hammer', 'Hammer Arm'].includes(c.name)) f.shake(undefined, 7, 400, d); });
      return d + 480;
    }
    // special attack or a physical one with no contact (thrown, shot)
    const from = c.user ? c.from : null;
    c.targets.forEach(x => {
      if (from) f.projectile(from, x, { color: t.c, color2: t.c2, size: 28, ms: 420, kind: { Fire: 'flame', Water: 'drop', Grass: 'leaf', Ice: 'crystal', Rock: 'rock', Ghost: 'shadow', Poison: 'blob', Electric: 'orb', Fairy: 'orb' }[c.type] || 'orb', spin: c.type === 'Grass' || c.type === 'Rock' });
      f.later(from ? 420 : 0, () => { f.burst(x, t.c, 100, 420); f.particles(x, { kind: t.p === 'ring' ? 'sparkle' : t.p, color: t.c, n: 8, spread: 55 }); });
    });
    if (c.user) f.glow(c.user, t.c, 560);
    return 900;
  }

  function play(ctx) {
    const f = make(ctx);
    const c = Object.assign({ flags: {} }, ctx);
    c.t0 = c.targets[0] || null;
    // a semi-invulnerable move's second turn: bring the user back if its charge turn hid it
    if (!c.charge && c.user) c.user.getAnimations().forEach(x => x.cancel());
    const recipe = R[c.name];
    try { return Math.round(recipe ? recipe(f, c) : fallback(f, c)); }
    catch (e) { console.warn('move animation failed for', c.name, e); return 500; }
  }
  // flinch: the shinobi recoils, with a jolt mark and spinning stars
  function flinch(ctx) {
    const f = make(ctx); const at = ctx.at; const s = ctx.sprite;
    if (s) s.animate([{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${ctx.left ? -14 : 14}px, 4px) rotate(${ctx.left ? -8 : 8}deg)`, offset: .2 }, { transform: 'translate(6px,0) rotate(4deg)', offset: .45 }, { transform: 'translate(-4px,0) rotate(-3deg)', offset: .7 }, { transform: 'translate(0,0) rotate(0)' }], { duration: f.D(650) });
    const j = f.el('jolt', { x: at.x + 34, y: at.y - 46 }); f.run(j, [{ transform: f.mv(0, 0, 'scale(.2) rotate(-20deg)'), opacity: 0 }, { transform: f.mv(0, 0, 'scale(1.15) rotate(0deg)'), opacity: 1, offset: .25 }, { transform: f.mv(0, -4, 'scale(1)'), opacity: 1, offset: .75 }, { transform: f.mv(0, -8, 'scale(.9)'), opacity: 0 }], 900);
    f.orbit({ x: at.x, y: at.y - 52 }, { kind: 'star', color: '#ffe14d', n: 3, r: 26, ms: 900, size: 14, spins: 1.5 });
    return 950;
  }

  window.MOVEFX = { play, flinch, recipes: R };
})();
