/* Shinobi-mon battle screen: animated playback, click-to-target, move info, type chart.
   Loaded after app.js; app.js exposes helpers on window.SSBU. */
(() => {
  const U = window.SSBU;
  const { $, $$, esc, S, F, typeChip, badge, sprite, gsym, act, socket, label, toast, modal, closeModal } = U;
  const BOOSTL = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', accuracy: 'Acc', evasion: 'Eva' };
  const STATUSL = { brn: 'BRN', par: 'PAR', psn: 'PSN', tox: 'TOX', slp: 'SLP', frz: 'FRZ' };
  const STATUS_COLOR = { brn: '#e4572e', par: '#e0c020', psn: '#a33ea1', tox: '#a33ea1', slp: '#8b96aa', frz: '#78cfcf' };
  const VOL = { substitute: 'Substitute', confusion: 'Confused', leechSeed: 'Seeded', taunt: 'Taunted', encore: 'Encore', trapped: 'Trapped', ingrain: 'Ingrained', charging: 'Charging', attract: 'Infatuated', bound: 'Bound', curse: 'Cursed', aquaRing: 'Aqua Ring', magnetRise: 'Magnet Rise', demon: 'Half-Demon', diamond: 'Diamond Form', recharge: 'Recharging', flashFire: 'Flame On' };
  const hpColor = p => p > 50 ? 'var(--good)' : p > 20 ? 'var(--warn)' : 'var(--bad)';
  const clone = o => JSON.parse(JSON.stringify(o));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const SPEEDS = { normal: 1, fast: 0.45, off: 0 };
  S.animSpeed = U.load('ssbu-anim', 'normal');
  const typeColor = t => getComputedStyle(document.documentElement).getPropertyValue('--t-' + t).trim() || '#999';

  // a look that only changes the battle sprite: The Hood in his Half-Demon State (Demonic Energy)
  const LOOKS = [{ id: 'the-hood', vol: 'demon', look: 'the-hood-half-demon-form' }];
  function battleLook(a) {
    const f = F(a.id) || a;
    const L = LOOKS.find(x => x.id === a.id && (a.volatiles || []).includes(x.vol) && (S.drawn || new Set()).has(x.look + '_front'));
    return L ? Object.assign({}, f, { id: L.look }) : f;
  }

  // ---------- after the battle: both full teams ----------
  const STATS6 = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const SL6 = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
  const abName = n => (S.dex.renamed || {})[n] || n;
  function setText(x) {
    const f = F(x.species); const g = x.gender;
    const ivs = STATS6.filter(st => x.ivs && x.ivs[st] !== 31).map(st => `${x.ivs[st]} ${SL6[st]}`);
    return [`${f.name}${window.GENDER && GENDER.info(f.id).type === 'X' && (g === 'M' || g === 'F') ? ` (${g})` : ''}${x.item ? ' @ ' + x.item : ''}`, `Ability: ${abName(x.ability)}`, 'Level: 50', `${x.nature} Nature`,
      ...(ivs.length ? ['IVs: ' + ivs.join(' / ')] : []), ...x.moves.map(mv => '- ' + mv)].join('\n');
  }
  function teamHtml(t, ti) {
    if (!t) return '<div class="muted">No team (the match ended before teams were set).</div>';
    const brought = t.lineup ? new Set(t.lineup) : null;
    return `<div class="row" style="align-items:center;margin:4px 0 8px"><h3 style="margin:0" class="grow">${esc(t.name)}'s team</h3><button class="small" data-copyteam="${ti}">Copy as text</button></div>
      <div class="ft-grid">${t.sets.map((x, i) => {
        const f = F(x.species); const nat = (window.DEX.NATURES || {})[x.nature] || {};
        const st = Object.fromEntries(STATS6.map(k => [k, window.DEX.calcStat(k, f.stats[k], x.ivs ? x.ivs[k] : 31, 0, 50, x.nature)]));
        return `<div class="ft-card ${brought && !brought.has(i) ? 'benched' : ''}">
          <div class="row" style="gap:8px">${sprite(f, 'lg', false, x.gender)}<div class="grow"><b>${esc(f.name)}</b> ${gsym(x.gender)}${brought ? (brought.has(i) ? ' <span class="chip">Brought</span>' : ' <span class="chip muted">Benched</span>') : ''}<div>${f.types.map(typeChip).join(' ')}</div>
            <div class="small"><b>${esc(abName(x.ability))}</b>${x.item ? ` · @ ${esc(x.item)}` : ''}</div><div class="small muted">${esc(x.nature)} nature</div></div></div>
          <ul class="ft-moves">${x.moves.map(mv => `<li>${S.dex.moves[mv] ? typeChip(S.dex.moves[mv].type) : ''} ${esc(mv)}</li>`).join('')}</ul>
          <div class="ft-stats">${STATS6.map(k => `<span class="${nat.plus === k ? 'up' : nat.minus === k ? 'down' : ''}" title="IV ${x.ivs ? x.ivs[k] : 31}">${SL6[k]} <b>${st[k]}</b></span>`).join('')}</div></div>`;
      }).join('')}</div>`;
  }
  function showTeams(m) {
    const you = m.you;
    const order = you === null || you === undefined ? [0, 1] : [1 - you, you];
    modal(`<div class="row" style="align-items:center"><h2 class="grow" style="margin:0">Teams</h2><button id="ftClose">Close</button></div>
      <p class="muted small">Full sets at level 50. Stats include nature and IVs (hover a stat for its IV).</p>
      ${order.map(i => `<section style="margin-top:10px">${teamHtml(m.teams[i], i)}</section>`).join('')}`);
    $('#ftClose').onclick = closeModal;
    $$('[data-copyteam]').forEach(b => b.onclick = () => {
      const text = m.teams[+b.dataset.copyteam].sets.map(setText).join('\n\n');
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('Team copied.'), () => toast(text));
    });
  }

  // ---------- tooltip ----------
  const tip = document.createElement('div'); tip.className = 'tip hidden'; document.body.appendChild(tip);
  function moveInfoHtml(name) {
    const m = S.dex.moves[name]; if (!m) return '';
    const d = window.MOVETEXT.describe(m);
    return `<div class="tip-h">${esc(name)} ${typeChip(m.type)} <span class="cat">${m.cat}</span></div>
      <div class="tip-s">${m.cat === 'Status' ? '' : `Power ${m.power || '—'} · `}Accuracy ${m.acc === true ? '—' : m.acc + '%'}${m.prio ? ` · Priority ${m.prio > 0 ? '+' : ''}${m.prio}` : ''}</div>
      <div>${esc(d.text)}</div>${d.flags.length ? `<div class="tip-f">${d.flags.map(f => `<span class="chip">${f}</span>`).join(' ')}</div>` : ''}`;
  }
  const TIP_SEL = '[data-tipmove], [data-tiphtml], [data-tipmon], [data-tipdex], [data-tipfoe]';
  function tipContent(el) {
    if (el.dataset.tipmove) return moveInfoHtml(el.dataset.tipmove);
    if (el.dataset.tiphtml) return el.dataset.tiphtml;
    if (el.dataset.tipmon) return monTipHtml(S.tab, el.dataset.tipmon);
    if (el.dataset.tipdex) return U.dexTipHtml(el.dataset.tipdex);
    if (el.dataset.tipfoe) return foeTipHtml(S.tab, el.dataset.tipfoe);
    return '';
  }
  function showTip(el) {
    const html = tipContent(el);
    if (!html) { tip.classList.add('hidden'); return; }
    tip.innerHTML = html; tip.classList.remove('hidden');
    const r = el.getBoundingClientRect();
    const menu = el.closest('.mvp-menu');
    if (menu) { // beside the open move list, so it never covers the options
      const mr = menu.getBoundingClientRect();
      const right = mr.right + 10 + tip.offsetWidth < window.innerWidth;
      tip.style.left = (right ? mr.right + 10 : Math.max(8, mr.left - tip.offsetWidth - 10)) + 'px';
      tip.style.top = Math.max(8, Math.min(window.innerHeight - tip.offsetHeight - 8, r.top - 10)) + window.scrollY + 'px';
      return;
    }
    const top = r.top - tip.offsetHeight - 8;
    tip.style.top = (top > 8 ? top : r.bottom + 8) + window.scrollY + 'px';
    tip.style.left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, r.left)) + 'px';
  }
  let tipHold = 0;
  document.addEventListener('mouseover', e => {
    if (Date.now() < tipHold) return;
    const el = e.target.closest(TIP_SEL);
    if (el) showTip(el); else tip.classList.add('hidden');
  });
  // touch screens: tap a condition tag or your own shinobi to see the same info
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-tiphtml], [data-tipmon], [data-tipdex], [data-tipfoe], .pool [data-tipmove]');
    if (!el || e.target.closest('[data-pick]')) { if (!e.target.closest('.tip')) tip.classList.add('hidden'); return; }
    showTip(el); tipHold = Date.now() + 600;
  });

  const STATN = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
  const boostMult = s => s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
  // what you know about an opposing fighter: its dex info plus what it has shown this battle
  function foeTipHtml(matchId, key) {
    const m = S.matches[matchId]; if (!m || !m.battle) return '';
    const [n, idx] = key.split(':').map(Number);
    const vs = view(matchId); const t = (vs.sides[n].team || []).find(x => x.index === idx) || (vs.sides[n].active || []).find(x => x && x.index === idx);
    if (!t) return '';
    const seen = t.seen || { moves: [] };
    return U.dexTipHtml(t.id, { seen, name: t.name, hpPct: t.hpPct, status: t.status, gender: t.gender });
  }
  function monTipHtml(matchId, monId) {
    const m = S.matches[matchId]; if (!m || !m.battle || m.you === null) return '';
    const st = m.battle.state; const side = st.sides[m.you];
    const t = side.team.find(x => x.id === monId); if (!t) return '';
    const act = side.active.find(a => a && a.id === monId);
    const boosts = (act && act.boosts) || {};
    const f = F(monId); const abName = (S.dex.renamed || {})[t.ability] || t.ability; const ab = [...f.abilities, f.hidden].find(a => a.name === abName) || { name: abName, desc: '' };
    const rows = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map(k => {
      if (k === 'hp') return `<span>HP</span><b>${t.hp}/${t.maxhp}</b><i></i>`;
      const b = boosts[k] || 0; const eff = Math.floor(t.stats[k] * boostMult(b));
      return `<span>${STATN[k]}</span><b>${t.stats[k]}</b><i class="${b > 0 ? 'up' : b < 0 ? 'down' : ''}">${b ? `→ ${eff} (${b > 0 ? '+' : ''}${b})` : ''}</i>`;
    }).join('');
    const extra = ['accuracy', 'evasion'].filter(k => boosts[k]).map(k => `${k === 'accuracy' ? 'Accuracy' : 'Evasion'} ${boosts[k] > 0 ? '+' : ''}${boosts[k]}`).join(' · ');
    return `<div class="tip-h">${sprite(f, 'sm', false, t.gender)} ${esc(t.name)} ${gsym(t.gender)} ${t.status ? `<span class="st st-${t.status}">${STATUSL[t.status]}</span>` : ''}</div>
      <div class="tipstats">${rows}</div>${extra ? `<div class="tip-s">${extra}</div>` : ''}
      <div><b>${esc(ab.name)}</b> <span class="muted">— ${esc(ab.desc)}</span></div>
      <div style="margin-top:3px"><b>Item:</b> ${t.item ? `${esc(t.item)} <span class="muted">— ${esc(S.dex.items[t.item] || '')}</span>` : '<span class="muted">none</span>'}</div>
      <div class="tip-f">${(t.moves || []).map(x => `<span class="chip">${esc(x.name)} ${x.pp}/${x.maxpp}</span>`).join('')}</div>
      <div class="muted small" style="margin-top:4px">Level 50 stats${Object.keys(boosts).length ? ', with stat changes applied' : ''}.</div>`;
  }

  // ---------- type chart ----------
  // Opens from the header on any screen, or from the battle's Type chart button.
  // highlight = defending types to highlight (the opponents' active shinobi in a battle).
  function showTypeChart(highlight, preset) {
    const T = S.dex.types; const C = S.dex.chart; const hl = highlight || []; const pre = preset || [];
    const mult = (a, defs) => defs.reduce((m, d) => m * (C[a][d] ?? 1), 1);
    const sym = v => v === 0 ? '0' : v === 0.25 ? '¼' : v === 0.5 ? '½' : v === 4 ? '4' : v === 2 ? '2' : '';
    const cls = v => v === 0 ? 'tc-0' : v > 1 ? 'tc-2' : v < 1 ? 'tc-h' : '';
    const badge = t => `<span class="type" style="background:var(--t-${t})">${t}</span>`;
    const opts = (sel, none) => (none ? `<option value="">${none}</option>` : '') + T.map(t => `<option ${t === sel ? 'selected' : ''}>${t}</option>`).join('');
    modal(`<div class="row" style="margin-bottom:8px"><h2 class="grow" style="margin:0">Type chart</h2><button id="tcX">Close</button></div>
      <p class="muted small" style="margin-top:0">Rows = attacking move type · columns = defending type. ${hl.length ? 'Highlighted columns: the opposing shinobi\' types.' : ''}</p>
      <div class="tchart"><table><tr><th class="corner">ATK ↓ / DEF →</th>${T.map(d => `<th class="${hl.includes(d) ? 'hl' : ''}" title="${d}"><span class="type" style="background:var(--t-${d})">${d.slice(0, 3)}</span></th>`).join('')}</tr>
      ${T.map(a => `<tr><th>${badge(a)}</th>${T.map(d => { const v = mult(a, [d]); return `<td class="${cls(v)}" data-hl="${hl.includes(d) ? 1 : 0}">${sym(v)}</td>`; }).join('')}</tr>`).join('')}</table></div>
      <div class="row small" style="margin-top:8px"><span class="tc-2 legend">2</span> super effective <span class="tc-h legend">½</span> not very effective <span class="tc-0 legend">0</span> no effect</div>
      <div class="tc-combo">
        <h3>Check a type combo</h3>
        <div class="row wrap"><label>Defending <select id="tcA">${opts(pre[0] || 'Normal')}</select></label><label>and <select id="tcB">${opts(pre[1] || '', '— none —')}</select></label></div>
        <div id="tcOut"></div>
      </div>`);
    const out = () => {
      const defs = [$('#tcA').value, $('#tcB').value].filter((t, i, a) => t && a.indexOf(t) === i);
      const groups = [[4, '4× weak'], [2, '2× weak'], [0.5, '½× resists'], [0.25, '¼× resists'], [0, 'Immune']];
      $('#tcOut').innerHTML = `<div class="muted small">Damage taken by a ${defs.join(' / ')} fighter:</div>` + groups.map(([v, n]) => {
        const ts = T.filter(a => mult(a, defs) === v);
        return ts.length ? `<div class="tc-grp"><span class="${cls(v)} legend">${n}</span>${ts.map(badge).join(' ')}</div>` : '';
      }).join('');
    };
    $('#tcA').onchange = out; $('#tcB').onchange = out; out();
    $('#tcX').onclick = closeModal;
  }
  // opposing active shinobi' types in the battle open on screen (none if not in a battle)
  function foesOnScreen() {
    const m = S.matches && S.matches[S.tab];
    if (!m || !m.battle) return [];
    const you = m.you === null || m.you === undefined ? 0 : m.you;
    return m.battle.state.sides[1 - you].active.filter(a => a && !a.fainted);
  }
  // highlight every opposing type; the combo checker starts on the first opponent's own types
  U.showTypeChart = () => { const foes = foesOnScreen(); showTypeChart([...new Set(foes.flatMap(a => a.types))], foes[0] && foes[0].types); };

  // ---------- playback state ----------
  function rec(id) { return S.bat[id]; }
  S.bat = S.bat || {};
  // called by app.js whenever a match payload with a battle arrives
  U.onBattlePayload = (m, prev) => {
    const b = m.battle;
    let r = rec(m.id);
    if (!r) {
      const fresh = !prev || !prev.battle;
      r = S.bat[m.id] = { shown: 0, queued: 0, queue: [], playing: false };
      if (fresh && b.state.turn <= 1 && !b.state.ended) {
        // brand-new battle: start from an empty field and play the send-outs
        r.vm = clone(b.state); for (const s of r.vm.sides) s.active = s.active.map(() => null);
      } else { r.vm = clone(b.state); r.shown = r.queued = b.log.length; }
    }
    if (b.log.length < r.queued) { r.queued = r.shown = b.log.length; r.vm = clone(b.state); }
    r.queue.push(...b.log.slice(r.queued).map((e, i) => ({ e, idx: r.queued + i })));
    r.queued = b.log.length;
    if (!r.playing) play(m.id);
  };

  async function play(id) {
    const r = rec(id); r.playing = true;
    if (S.tab === id) renderBattle(id);
    while (r.queue.length) {
      const m = S.matches[id]; if (!m) return;
      const { e } = r.queue.shift();
      const visible = S.tab === id && document.getElementById('arena-' + id);
      const speed = r.skip ? 0 : SPEEDS[S.animSpeed] ?? 1;
      const ms = applyEvent(id, e, visible && speed > 0);
      r.shown++;
      if (visible) appendLog(e);
      // a jutsu animation returns a promise that resolves when its hit lands; everything else returns a time in ms
      if (visible && speed > 0 && ms) await (typeof ms === 'object' && ms.then ? ms : sleep(ms * speed));
    }
    r.playing = false; r.skip = false;
    const m = S.matches[id];
    if (m && m.battle) r.vm = clone(m.battle.state);
    if (S.tab === id) renderBattle(id);
  }
  U.isPlaying = id => !!(rec(id) && rec(id).playing);

  function slotEl(side, pos) { return document.getElementById(`slot-${side}-${pos}`); }
  function sprEl(side, pos) { const s = document.getElementById(`mon-${side}-${pos}`); return s && s.querySelector('.spr'); }
  function bagEl(side, pos) { const s = document.getElementById(`mon-${side}-${pos}`); return s && s.querySelector('.subbag'); }
  function centerOf(el, arena) {
    const a = arena.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height / 2 };
  }
  function fx(arena, cls, at, html) {
    const d = document.createElement('div'); d.className = 'fx ' + cls; d.innerHTML = html || '';
    d.style.left = at.x + 'px'; d.style.top = at.y + 'px'; arena.appendChild(d); return d;
  }

  // apply one log event to the view model (and animate when visible). Returns how long to wait.
  // sound effect for each animated event
  const SFX_FOR = a => {
    switch (a.k) {
      case 'in': return 'switch';
      case 'move': return a.cat === 'Status' || a.charge ? null : 'attack';
      case 'hp': return a.hit ? 'hit' : a.heal ? 'heal' : null;
      case 'faint': return 'faint';
      case 'status': return 'status';
      case 'boost': return a.up ? 'up' : 'down';
      case 'mega': return 'finalsmash';
      case 'flinch': return 'flinch';
      case 'protect': return 'protect';
      case 'pop': return { se: 'super', crit: 'crit', miss: 'miss', nve: 'weak' }[a.tone] || null;
    }
    return null;
  };
  function applyEvent(id, e, animate) {
    const m = S.matches[id]; const r = rec(id); const a = e.a;
    if (animate && a && window.AUDIO) { const n = SFX_FOR(a); if (n) AUDIO.sfx(n); }
    const arena = document.getElementById('arena-' + id);
    if (!a) {
      // a new turn header = the previous turn just ended: replay the weather / field animation
      if (e.cls === 'turn') return 350 + (animate ? burstWx(id) : 0);
      return e.text ? 160 : 0;
    }
    const vm = r.vm;
    const mon = a.m ? (vm.sides[a.m[0]].active[a.m[1]]) : null;
    switch (a.k) {
      case 'in': {
        const prevTeam = vm.sides[a.m[0]].team;
        vm.sides[a.m[0]].active[a.m[1]] = { id: a.id, name: a.name, gender: a.gender, types: a.types, hpPct: a.hp, status: a.status, fainted: false, boosts: {}, volatiles: [], pos: a.m[1] };
        if (!prevTeam.some(t => t.id === a.id)) prevTeam.push({ id: a.id, name: a.name, gender: a.gender, fainted: false, status: a.status });
        if (!animate) return 0;
        redrawField(id);
        const s = sprEl(...a.m); if (s) s.animate([{ transform: 'scale(.2)', opacity: 0, filter: 'brightness(3)' }, { transform: 'scale(1.08)', opacity: 1, offset: .7 }, { transform: 'scale(1)', opacity: 1, filter: 'none' }], { duration: 450, easing: 'ease-out' });
        return 480;
      }
      case 'out': {
        if (animate) { const s = sprEl(...a.m); if (s) s.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.2)', filter: 'brightness(3)' }], { duration: 300, fill: 'forwards' }); }
        vm.sides[a.m[0]].active[a.m[1]] = null;
        if (animate) setTimeout(() => redrawField(id), 300);
        return animate ? 340 : 0;
      }
      case 'move': {
        if (!animate) return 0;
        return animateMove(id, arena, a);
      }
      case 'hp': {
        if (!mon) return 0;
        mon.hpPct = a.hp; if (a.hp <= 0) mon.hpPct = 0;
        const t = vm.sides[a.m[0]].team.find(x => x.id === mon.id); if (t) t.hpPct = mon.hpPct;
        if (!animate) return 0;
        const slot = slotEl(...a.m); if (!slot) return 0;
        const bar = slot.querySelector('.hpbar > i'); if (bar) { bar.style.width = mon.hpPct + '%'; bar.style.background = hpColor(mon.hpPct); }
        const txt = slot.querySelector('.hptext'); if (txt) txt.textContent = mon.hpPct + '%';
        const s = sprEl(...a.m);
        if (a.hit && s) { s.animate([{ transform: 'translateX(0)', filter: 'brightness(1)' }, { transform: 'translateX(-9px)', filter: 'brightness(2.6)' }, { transform: 'translateX(8px)', filter: 'brightness(1)' }, { transform: 'translateX(-5px)', filter: 'brightness(2)' }, { transform: 'translateX(0)', filter: 'brightness(1)' }], { duration: 380 }); return 520; }
        if (a.heal && s) { fx(arena, 'ring heal', centerOf(s, arena)); return 450; }
        if (a.dmg && s) { s.animate([{ opacity: 1 }, { opacity: .4 }, { opacity: 1 }], { duration: 300 }); return 380; }
        return 300;
      }
      case 'sub': {   // the substitute took the hit: the sand bag shakes and flashes
        if (!animate) return 0;
        const bag = bagEl(...a.m);
        if (bag) bag.animate([{ rotate: '0deg', filter: 'brightness(1)' }, { rotate: '-9deg', filter: 'brightness(1.8)' }, { rotate: '7deg', filter: 'brightness(1)' }, { rotate: '-4deg', filter: 'brightness(1.4)' }, { rotate: '0deg', filter: 'brightness(1)' }], { duration: 420 });
        return 480;
      }
      case 'subon': {   // the shinobi steps back and dims; the sand bag drops into its spot
        if (mon && !mon.volatiles.includes('substitute')) mon.volatiles.push('substitute');
        if (!animate) return 0;
        redrawField(id);
        const el = document.getElementById(`mon-${a.m[0]}-${a.m[1]}`); if (el) el.classList.add('sub-enter');
        return 1150;
      }
      case 'suboff': {   // the sand bag bursts and the shinobi steps back into place
        const done = () => { if (mon) mon.volatiles = mon.volatiles.filter(v => v !== 'substitute'); };
        if (!animate) { done(); return 0; }
        const el = document.getElementById(`mon-${a.m[0]}-${a.m[1]}`), bag = bagEl(...a.m);
        if (!el || !bag) { done(); redrawField(id); return 0; }
        const at = centerOf(bag, arena);
        el.classList.add('sub-break'); fx(arena, 'burst subpoof', at);
        done(); setTimeout(() => { if (el.isConnected) redrawField(id); }, 700);
        return 750;
      }
      case 'faint': {
        if (mon) { mon.fainted = true; mon.hpPct = 0; const t = vm.sides[a.m[0]].team.find(x => x.id === mon.id); if (t) t.fainted = true; }
        if (!animate) return 0;
        const s = sprEl(...a.m);
        if (s) s.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(40px)', opacity: 0 }], { duration: 650, easing: 'ease-in', fill: 'forwards' });
        return 700;
      }
      case 'status': {
        if (mon) mon.status = a.status;
        if (!animate) return 0;
        redrawField(id);
        const s = sprEl(...a.m); if (s) { const ring = fx(arena, 'ring', centerOf(s, arena)); ring.style.borderColor = STATUS_COLOR[a.status] || '#fff'; }
        return 450;
      }
      case 'boost': {
        if (mon) { mon.boosts[a.stat] = Math.max(-6, Math.min(6, (mon.boosts[a.stat] || 0) + a.n)); if (!mon.boosts[a.stat]) delete mon.boosts[a.stat]; }
        if (!animate) return 0;
        redrawField(id);
        const s = sprEl(...a.m); if (s) fx(arena, 'pop ' + (a.up ? 'up' : 'down'), centerOf(s, arena), `${a.up ? '▲' : '▼'} ${BOOSTL[a.stat] || a.stat}`);
        return 380;
      }
      case 'mega': {
        const sp = SPEEDS[S.animSpeed] ?? 1;
        if (mon) { mon.id = a.id; mon.name = a.name; mon.types = a.types; }
        if (!animate) return 0;
        const s = sprEl(...a.m); if (!s) { redrawField(id); return 0; }
        const at = centerOf(s, arena);
        fx(arena, 'fs-banner', { x: arena.clientWidth / 2, y: arena.clientHeight / 2 }, `<span>${esc(a.banner || 'ULTIMATE!')}</span>`);
        fx(arena, 'fs-aura', at); fx(arena, 'fs-aura two', at);
        s.animate([{ filter: 'brightness(1)', transform: 'scale(1)' }, { filter: 'brightness(4) saturate(0)', transform: 'scale(1.15) rotate(-6deg)', offset: .6 }, { filter: 'brightness(8) saturate(0)', transform: 'scale(.9)' }], { duration: 900 * sp, fill: 'forwards' });
        setTimeout(() => {
          redrawField(id);
          const n = sprEl(...a.m); if (!n) return;
          fx(arena, 'burst fs-burst', centerOf(n, arena));
          n.animate([{ filter: 'brightness(8) saturate(0)', transform: 'scale(.6)' }, { filter: 'brightness(2)', transform: 'scale(1.25)', offset: .5 }, { filter: 'brightness(1)', transform: 'scale(1)' }], { duration: 700 * sp, easing: 'ease-out' });
        }, 900 * sp);
        return 1900;
      }
      case 'field': {
        Object.assign(vm.field, a.f);
        if (!animate) return 0;
        syncWx(id, true); return 650;
      }
      case 'types': { if (mon) mon.types = a.types; if (animate) redrawField(id); return animate ? 250 : 0; }
      case 'flinch': {
        if (!animate) return 0;
        const s = sprEl(...a.m); if (!s) return 0;
        const at = centerOf(s, arena);
        fx(arena, 'pop big flinch', { x: at.x, y: at.y - 10 }, 'Flinched!');
        return window.MOVEFX.flinch({ arena, sp: SPEEDS[S.animSpeed] ?? 1, sprite: s, at, left: at.x < arena.clientWidth / 2 });
      }
      case 'pop': {
        if (!animate) return 0;
        const s = sprEl(...a.m); if (s) fx(arena, 'pop big ' + a.tone, centerOf(s, arena), esc(a.text));
        return a.tone === 'crit' || a.tone === 'miss' ? 650 : 450;
      }
      case 'protect': {
        if (!animate) return 0;
        const s = sprEl(...a.m); if (!s) return 0;
        fx(arena, 'shield', centerOf(s, arena));
        if (a.blocked) fx(arena, 'pop big block', centerOf(s, arena), 'Blocked!');
        return a.blocked ? 700 : 450;
      }
    }
    return 120;
  }

  function animateMove(id, arena, a) {
    const user = a.u ? sprEl(...a.u) : null;
    if (user) { user.parentElement.classList.add('acting'); setTimeout(() => user.parentElement.classList.remove('acting'), 700); }
    const md = (S.dex.moves && S.dex.moves[a.name]) || {};
    const W = arena.clientWidth, H = arena.clientHeight;
    const from = user ? centerOf(user, arena) : { x: W / 2, y: H / 2 };
    // a shinobi behind a substitute: the attack lands on the sand bag
    const targets = (a.t || []).map(t => { const el = bagEl(...t) || sprEl(...t); if (!el) return null; const p = centerOf(el, arena); return { x: p.x, y: p.y, el }; }).filter(Boolean);
    const foeSide = a.u ? 1 - a.u[0] : 1;
    const foeSideCenters = [0, 1].map(pos => sprEl(foeSide, pos)).filter(Boolean).map(el => centerOf(el, arena));
    if (!foeSideCenters.length) foeSideCenters.push({ x: W - from.x, y: H - from.y });
    // the jutsu's own animation (ported from Shinobi Showdown, editable in the Animation Studio) when it has one
    const JA = window.JUTSU_ANIM;
    if (JA && user && targets.length && !a.charge && JA.animFor(a.name, md)) {
      const sp = SPEEDS[S.animSpeed] ?? 1;
      const sideEls = [0, 1].map(pos => sprEl(foeSide, pos)).filter(Boolean);
      const isFoe = !!user.closest('.mon') && user.closest('.mon').classList.contains('foe');
      const fallback = () => window.MOVEFX.play({ arena, sp, user, from, targets, foeSideCenters, name: a.name, type: a.type, cat: a.cat, charge: false, flags: md, contact: !!md.contact, userLeft: from.x < W / 2 });
      return JA.play(arena, a.name, md, user, targets.map(t => t.el), { sp, sideEls, isFoe })
        .then(ok => ok ? 0 : sleep(fallback() * sp))
        .catch(err => { console.error('jutsu animation', a.name, err); return sleep(fallback() * sp); });
    }
    return window.MOVEFX.play({ arena, sp: SPEEDS[S.animSpeed] ?? 1, user, from, targets, foeSideCenters, name: a.name, type: a.type, cat: a.cat, charge: !!a.charge, flags: md, contact: !!md.contact, userLeft: from.x < W / 2 });
  }
  function orb(arena, from, to, color, size) {
    const o = fx(arena, 'orb ' + (size || ''), from); o.style.background = color; o.style.boxShadow = `0 0 18px 6px ${color}`;
    o.animate([{ transform: 'translate(-50%,-50%) scale(.6)' }, { transform: `translate(calc(-50% + ${to.x - from.x}px), calc(-50% + ${to.y - from.y}px)) scale(1.2)` }], { duration: 420, easing: 'ease-in', fill: 'forwards' });
    setTimeout(() => { o.remove(); const b = fx(arena, 'burst', to); b.style.background = color; }, 420);
  }
  function appendLog(e) {
    const lg = $('#blog'); if (!lg || (!e.text && e.cls !== 'turn')) return;
    const d = document.createElement('div'); d.className = e.cls === 'chat' ? 'chatline' : e.cls; d.textContent = e.text;
    const atBottom = lg.scrollHeight - lg.scrollTop - lg.clientHeight < 80;
    lg.appendChild(d); if (atBottom) lg.scrollTop = lg.scrollHeight;
  }

  // ---------- rendering ----------
  function view(id) {
    const m = S.matches[id]; const r = rec(id);
    return r && (r.playing || r.queue.length) ? r.vm : m.battle.state;
  }
  // Pokémon-style field: the opponent's shinobi (front view) stand on a platform in the top right,
  // yours (back view) on a platform in the bottom left; HP cards sit in the opposite corners.
  // Each shinobi is two elements: its sprite (#mon-side-pos) and its HP card (#slot-side-pos).
  function sideParts(m, vs, n, isFoe, sel) {
    const side = vs.sides[n]; const cls = isFoe ? 'foe' : 'you';
    const pips = [...Array(side.brought)].map((_, i) => { const t = side.team[i]; return `<span class="pip ${t ? (t.fainted ? 'fainted' : t.status ? 'status' : '') : 'unknown'}" title="${t ? esc(t.name) : 'Not revealed'}"></span>`; }).join('');
    let mons = '', cards = '';
    side.active.forEach((a, pos) => {
      const key = `${n}:${pos}`;
      const flash = sel && sel.flash.includes(key); const pickable = sel && sel.pick.includes(key);
      if (!a) { cards += `<div class="hpcard empty" id="slot-${n}-${pos}"></div>`; return; }
      const flags = `${flash ? 'flashing' : ''} ${pickable ? 'pickable' : ''} ${a.fainted ? 'down' : ''}`;
      const tip = !pickable ? (isFoe ? `data-tipfoe="${n}:${a.index}"` : `data-tipmon="${a.id}"`) : '';
      const pick = pickable ? `data-pick="${key}"` : '';
      const boosts = Object.entries(a.boosts || {}).map(([k, v]) => `<span class="chip ${v > 0 ? 'up' : 'down'}">${v > 0 ? '+' : ''}${v} ${BOOSTL[k]}</span>`).join('');
      const vols = (a.volatiles || []).map(v => `<span class="chip">${VOL[v] || v}</span>`).join('');
      // with a substitute up the shinobi stands back, dimmed, and a sand bag takes its spot
      const subbed = (a.volatiles || []).includes('substitute') && !a.fainted;
      mons += `<div class="mon ${cls} p${pos} ${flags} ${subbed ? 'subbed' : ''}" id="mon-${n}-${pos}" ${pick}><div class="sprwrap" ${tip}><div class="spr">${sprite(battleLook(a), 'battle', !isFoe, a.gender)}</div>${subbed ? '<img class="subbag" src="/images/substitute-log.svg" alt="Substitute">' : ''}${pickable ? '<span class="pick-hint">Tap to target</span>' : ''}</div></div>`;
      cards += `<div class="hpcard ${flags}" id="slot-${n}-${pos}" ${pick} ${tip}><div class="nm">${esc(a.name)} ${gsym(a.gender)} ${a.status ? `<span class="st st-${a.status}">${STATUSL[a.status]}</span>` : ''}<span class="grow"></span><span class="chips types">${(a.types || []).map(typeChip).join('')}</span></div>
          <div class="hpbar"><i style="width:${a.hpPct}%;background:${hpColor(a.hpPct)}"></i></div>
          <div class="hprow"><span class="hptext">${a.fainted || a.hpPct <= 0 ? 'Fainted' : a.hp !== undefined && !(rec(m.id) || {}).playing ? `${a.hp}/${a.maxhp} HP · ${a.hpPct}%` : a.hpPct + '%'}</span><span class="chips">${boosts}${vols}</span></div></div>`;
    });
    const left = side.brought - side.team.filter(t => t.fainted).length;
    return { mons, hud: `<div class="hud ${cls}"><div class="sidelabel">${esc(side.name)} <span class="pips">${pips}</span><span class="left">${left} left</span></div>${cards}</div>` };
  }
  const turnsLeft = n => n ? `<b>${n} turn${n === 1 ? '' : 's'} left</b> (including this one)` : '';
  const STAYS = '<b>Stays until removed</b> by Rapid Spin or Defog.';
  function fieldChips(st) {
    const c = []; // [label, tooltip html]
    const f = st.field;
    if (f.weather) c.push([{ rain: '🌧 Rain', sun: '☀ Harsh sun', snow: '❄ Snow' }[f.weather] + (f.weatherTurns ? ` · ${f.weatherTurns}` : ''),
      `${{ rain: 'Rain', sun: 'Harsh sunlight', snow: 'Snow' }[f.weather]}: ${turnsLeft(f.weatherTurns)}<br>${{ rain: 'Water moves 1.5×, Fire moves 0.5×. Thunder and Hurricane never miss.', sun: 'Fire moves 1.5×, Water moves 0.5×. Solar Beam needs no charge; no one can be frozen.', snow: 'Ice types get 1.5× Defense. Blizzard never misses.' }[f.weather]}`]);
    if (f.trickroom) c.push([`Trick Room · ${f.trickroom}`, `Trick Room: ${turnsLeft(f.trickroom)}<br>Slower shinobi move first (priority still applies).`]);
    if (f.gravity) c.push([`Gravity · ${f.gravity}`, `Gravity: ${turnsLeft(f.gravity)}<br>Everyone is grounded, moves are more accurate, and flying moves can't be used.`]);
    if (f.terrain) c.push([`${{ electric: '⚡ Lightning Field', psychic: '🌀 Genjutsu Field', misty: '🌫 Hidden Mist' }[f.terrain]} · ${f.terrainTurns}`,
      `${{ electric: 'Lightning Field', psychic: 'Genjutsu Field', misty: 'Hidden Mist' }[f.terrain]}: ${turnsLeft(f.terrainTurns)}<br>${{ electric: 'Grounded shinobi: Lightning moves 1.3×, and they can\'t fall asleep.', psychic: 'Grounded shinobi: Yin moves 1.3×, and they can\'t be hit by priority moves.', misty: 'Grounded shinobi can\'t get status conditions or confusion.' }[f.terrain]}`]);
    if (f.magicroom) c.push([`Magic Room · ${f.magicroom}`, `Magic Room: ${turnsLeft(f.magicroom)}<br>Held items have no effect.`]);
    for (const s of st.sides) {
      const k = s.conditions || {}; const n = esc(s.name);
      if (k.reflect) c.push([`${n}: Reflect · ${k.reflect}`, `${n}'s Reflect: ${turnsLeft(k.reflect)}<br>Physical damage to this side is reduced.`]);
      if (k.lightscreen) c.push([`${n}: Light Screen · ${k.lightscreen}`, `${n}'s Light Screen: ${turnsLeft(k.lightscreen)}<br>Special damage to this side is reduced.`]);
      if (k.auroraveil) c.push([`${n}: Aurora Veil · ${k.auroraveil}`, `${n}'s Aurora Veil: ${turnsLeft(k.auroraveil)}<br>Physical and special damage to this side is reduced.`]);
      if (k.luckychant) c.push([`${n}: Lucky Chant · ${k.luckychant}`, `${n}'s Lucky Chant: ${turnsLeft(k.luckychant)}<br>This side can't be hit by critical hits.`]);
      if (k.tailwind) c.push([`${n}: Tailwind · ${k.tailwind}`, `${n}'s Tailwind: ${turnsLeft(k.tailwind)}<br>This side's Speed is doubled.`]);
      if (k.stealthrock) c.push([`${n}: Stealth Rock`, `Stealth Rock on ${n}'s side: shinobi switching in take Rock-type damage.<br>${STAYS}`]);
      if (k.spikes) c.push([`${n}: Spikes ×${k.spikes}`, `Spikes (${k.spikes} layer${k.spikes > 1 ? 's' : ''}) on ${n}'s side: grounded shinobi switching in lose ${['', '1/8', '1/6', '1/4'][k.spikes]} of their HP.<br>${STAYS}`]);
      if (k.toxicspikes) c.push([`${n}: Toxic Spikes ×${k.toxicspikes}`, `Toxic Spikes (${k.toxicspikes} layer${k.toxicspikes > 1 ? 's' : ''}) on ${n}'s side: grounded shinobi switching in are ${k.toxicspikes > 1 ? 'badly poisoned' : 'poisoned'}. A grounded Poison type absorbs them.<br>${STAYS}`]);
      if (k.stickyweb) c.push([`${n}: Sticky Web`, `Sticky Web on ${n}'s side: grounded shinobi switching in lose 1 Speed stage.<br>${STAYS}`]);
    }
    return c.map(([l, t]) => `<span class="chip cond" data-tiphtml="${esc(t)}">${l}</span>`).join('');
  }
  function fieldHtml(id) {
    const m = S.matches[id]; const vs = view(id); const you = m.you === null ? 0 : m.you;
    const sel = selection(m);
    const foe = sideParts(m, vs, 1 - you, true, sel), me = sideParts(m, vs, you, false, sel);
    // field effects (weather, Trick Room, screens…) stack above your HP cards so they never cover a shinobi
    return `<div class="plat foe"></div><div class="plat you"></div>${foe.mons}${me.mons}${foe.hud}${me.hud.replace('<div class="hud you">', `<div class="hud you"><div class="fieldinfo">${fieldChips(vs)}</div>`)}`;
  }
  // redraw shinobi and HP cards; the weather layers (.wx) stay put so their animations don't restart
  function redrawField(id) {
    const ar = document.getElementById('arena-' + id); if (!ar) return;
    [...ar.children].forEach(c => { if (!c.classList.contains('wx')) c.remove(); });
    ar.insertAdjacentHTML('beforeend', fieldHtml(id)); wirePicks(id);
  }

  // ---------- field effects: weather, Trick Room, Gravity ----------
  // Each effect is a back layer (behind the platforms) and a front layer (over the shinobi, under the HP cards).
  const WX = {
    rain: { back: '<i class="cloud c1"></i><i class="cloud c2"></i><i class="cloud c3"></i>', front: '<i class="drops d1"></i><i class="drops d2"></i><i class="splash"></i>' },
    sun: { back: '<i class="sundisk"></i><i class="rays"></i>', front: '<i class="glare"></i><i class="shafts"></i>' },
    snow: { back: '<i class="haze"></i>', front: '<i class="flakes f1"></i><i class="flakes f2"></i><i class="flakes f3"></i>' },
    trickroom: { back: '<i class="grid"></i>', front: '<i class="warp"></i>' },
    gravity: { back: '', front: '<i class="press"></i><i class="streaks"></i>' },
    'terrain-electric': { back: '<i class="tfloor"></i>', front: '' },
    'terrain-psychic': { back: '<i class="tfloor"></i>', front: '' },
    'terrain-misty': { back: '<i class="tfloor"></i>', front: '' },
  };
  // burst = play the short animation on effects that start now (an effect starting, not a page redraw)
  function syncWx(id, burst) {
    const ar = document.getElementById('arena-' + id); if (!ar) return;
    const f = view(id).field || {};
    ar.classList.remove('weather-rain', 'weather-sun', 'weather-snow');
    if (f.weather) ar.classList.add('weather-' + f.weather);
    const want = [f.weather, f.trickroom ? 'trickroom' : '', f.gravity ? 'gravity' : '', f.terrain ? 'terrain-' + f.terrain : ''].filter(Boolean);
    ar.querySelectorAll(':scope > .wx').forEach(el => {
      if (!want.includes(el.dataset.wx) && !el.classList.contains('leaving')) { el.classList.add('leaving'); setTimeout(() => el.remove(), 900); }
    });
    for (const k of want) {
      if (ar.querySelector(`:scope > .wx[data-wx="${k}"]:not(.leaving)`)) continue;
      for (const part of ['back', 'front']) {
        if (!WX[k][part]) continue;
        const d = document.createElement('div');
        d.className = `wx wx-${part} wx-${k}`; d.dataset.wx = k;
        d.innerHTML = WX[k][part];
        ar.insertBefore(d, ar.firstChild);
        // a brand-new effect bursts; a layer rebuilt by a redraw picks up a burst that's still playing
        const since = performance.now() - (wxBurstAt[id] || -1e9);
        if (burst) { wxBurstAt[id] = performance.now(); burstEl(d, 0); } else if (since < BURST_MS) burstEl(d, since);
      }
    }
  }
  // the effects stay still during a turn; this plays their short animation (start of effect / end of turn)
  const BURST_MS = 2200; const wxBurstAt = {};
  function burstEl(el, elapsed) {
    clearTimeout(el._bt); el.classList.remove('burst'); void el.offsetWidth;
    el.style.setProperty('--bd', `-${Math.round(elapsed || 0)}ms`); el.classList.add('burst');
    el._bt = setTimeout(() => el.classList.remove('burst'), BURST_MS - (elapsed || 0));
  }
  function burstWx(id) {
    const ar = document.getElementById('arena-' + id); if (!ar) return 0;
    const els = [...ar.querySelectorAll(':scope > .wx:not(.leaving)')];
    // skip if an effect just started (its own burst is still playing)
    if (!els.length || els.some(el => el.classList.contains('burst'))) return 0;
    wxBurstAt[id] = performance.now(); els.forEach(el => burstEl(el, 0)); return 900;
  }

  // which slots flash / are pickable for the move currently being chosen
  function selection(m) {
    const T = S.turn[m.id]; const r = rec(m.id);
    if (!T || !T.pending || (r && r.playing)) return null;
    return { flash: T.pending.flash || [], pick: T.pending.pick || [] };
  }
  function targetsFor(m, cur, mv) {
    const st = m.battle.state; const you = m.you;
    const alive = (n) => st.sides[n].active.map((a, p) => a && !a.fainted ? `${n}:${p}` : null).filter(Boolean);
    const foes = alive(1 - you); const allies = alive(you).filter(k => k !== `${you}:${cur.pos}`);
    const self = `${you}:${cur.pos}`;
    switch (mv.target) {
      case 'allFoes': return { flash: foes, note: 'Hits both opposing shinobi' };
      case 'all': return { flash: [...foes, ...allies], note: allies.length ? 'Hits everyone else — including your partner!' : 'Hits all opposing shinobi' };
      case 'randomFoe': return { flash: foes, note: 'Hits a random opposing shinobi' };
      case 'self': return { flash: [self], note: mv.cat === 'Status' && S.dex.moves[mv.name].side ? 'Affects your whole side' : 'Affects the user' };
      case 'foeSide': return { flash: foes, note: "Affects the opposing side of the field" };
      case 'scripted': return { flash: foes, note: 'Hits back whoever last attacked it' };
      default: {
        const cands = m.format === 'doubles' ? [...foes, ...allies] : foes;
        if (cands.length > 1) return { pick: cands, note: 'Choose a target' };
        return { flash: cands, note: cands.length ? '' : 'No target' };
      }
    }
  }
  const nameAt = (m, key) => { const [n, p] = key.split(':').map(Number); const a = m.battle.state.sides[n].active[p]; return a ? `${n === m.you ? 'your' : 'foe'} ${a.name}` : '?'; };

  function controlsHtml(m) {
    const b = m.battle; const r = b.request; const st = b.state; const you = m.you;
    const pr = rec(m.id);
    if (pr && pr.playing) return `<div class="row"><span class="muted grow">▶ Playing turn…</span><button class="small" id="bSkip">Skip</button></div>`;
    if (st.ended) {
      const won = st.winner === you;
      const rm = m.rematch || [false, false];
      const rematch = m.replay ? `<button id="rpAgain">Watch again</button>` : m.road && you !== null ? `<button class="primary" id="mRoad">${st.winner === you ? 'Continue the Road' : 'Back to Road to 50'}</button>` : m.room ? `<button class="primary" id="mRoom">Back to room</button><span class="muted small">The next battle starts automatically.</span>` : you === null ? '' : rm[you] ? '<span class="muted small">Waiting for your opponent to accept the rematch…</span>' : `<button class="primary" id="mRematch">${rm[1 - you] ? 'Accept rematch' : 'Rematch'}</button>`;
      const note = !m.replay && you !== null && rm[1 - you] && !rm[you] ? `<div class="small" style="margin-top:6px">${esc(st.sides[1 - you].name)} wants a rematch!</div>` : '';
      return `<div class="banner ${you !== null && !won ? 'lose' : ''}"><span>${st.winner === null ? 'Tie game!' : esc(st.sides[st.winner].name) + ' won!'}</span><div class="row" style="justify-content:center;gap:8px;margin-top:8px">${rematch}${m.teams && m.teams.some(Boolean) ? `<button id="mTeams">${you !== null ? "View opponent's team" : 'View teams'}</button>` : ''}<button id="mReplay">${m.replay ? 'Copy replay link' : 'Replay link'}</button><button id="mBack">${m.replay ? 'Close' : 'Back to lobby'}</button></div>${note}</div>`;
    }
    if (m.replay) return '<div class="muted">Replay</div>';
    if (you === null) return '<div class="muted">You are spectating.</div>';
    if (r.kind === 'wait') return `<div class="row"><span class="muted grow">Waiting for ${esc(st.sides[1 - you].name)}…</span>${r.canUndo ? '<button class="small" id="bUndo">Undo</button>' : ''}</div>`;
    const T = S.turn[m.id] = S.turn[m.id] || { step: 0, actions: [], switches: [], pending: null };
    if (r.kind === 'switch') {
      const taken = new Set(T.switches.map(s => s.index));
      return `<h2>${r.reason === 'faint' ? 'Send in a shinobi' : 'Choose a shinobi to switch in'}${r.slots.length > 1 ? ` (${T.switches.length + 1} of ${r.slots.length})` : ''}</h2>
        <div class="switches">${switchBtns(r.team, mm => mm.fainted || mm.pos >= 0 || taken.has(mm.index))}</div>
        ${T.switches.length ? '<button class="small" id="tBack" style="margin-top:8px">Back</button>' : ''}`;
    }
    const slots = r.actives.filter(Boolean); const cur = slots[T.step];
    if (T.pending) {
      const p = T.pending; const mv = cur.moves[p.index] || { name: cur.locked || 'Struggle' };
      const info = S.dex.moves[mv.name];
      const tgtText = p.pick ? 'Tap a glowing shinobi (or a button below) to choose who to hit.' : (p.flash.length ? `${p.note ? p.note + ': ' : 'Target: '}${p.flash.map(k => esc(nameAt(m, k))).join(', ')}` : esc(p.note || ''));
      return `<div class="confirm"><div class="row"><h2 class="grow" style="margin:0">${esc(cur.name)} → ${esc(mv.name)}</h2>${slots.length > 1 ? `<span class="pill">${T.step + 1}/${slots.length}</span>` : ''}</div>
        ${info ? `<div class="move-info">${moveInfoHtml(mv.name)}</div>` : ''}
        ${T.megaPos === cur.pos && cur.finalSmash ? `<div class="fs-note">★ ${esc(cur.name)} will transform into ${esc(cur.finalSmash.name)} first.</div>` : ''}
        <div class="tgt-note">${tgtText}</div>
        ${p.pick ? `<div class="targets">${p.pick.map(k => `<button data-pickbtn="${k}" class="${k.startsWith((1 - m.you) + ':') ? 'primary' : ''}">${esc(nameAt(m, k))}</button>`).join('')}</div>` : ''}
        <div class="row" style="margin-top:10px">${p.pick ? '' : '<button class="primary" id="tConfirm">Confirm</button>'}<button id="tCancel">Back</button></div></div>`;
    }
    const taken = new Set(T.actions.filter(a => a.type === 'switch').map(a => a.index));
    const moveBtns = cur.locked ? `<button class="move-btn" data-move="-1" style="grid-column:span 2" data-tipmove="${esc(cur.locked)}"><span class="mn">Continue: ${esc(cur.locked)}</span></button>`
      : cur.struggle ? `<button class="move-btn" data-move="-2" style="grid-column:span 2"><span class="mn">Struggle</span></button>`
        : cur.moves.map(mv => moveBtnHtml(m, cur, mv)).join('');
    const fsTaken = T.actions.some(x => x.mega);
    const fsBtn = cur.finalSmash && !fsTaken ? `<button class="fs-btn ${T.megaPos === cur.pos ? 'on' : ''}" id="tFS">${sprite(F(cur.finalSmash.id), 'sm', false, ((view(m.id).sides[m.you].active[cur.pos]) || {}).gender)}<span><b>${T.megaPos === cur.pos ? '✓ Transformation ready' : 'Transformation'}</b><br><span class="small">${esc(cur.name)} becomes ${esc(cur.finalSmash.name)} before moving${T.megaPos === cur.pos ? ' — now pick a move' : ''}</span></span></button>` : '';
    return `<h2>What will ${esc(cur.name)} do?${slots.length > 1 ? ` <span class="pill">${T.step + 1}/${slots.length}</span>` : ''}</h2>
      ${fsBtn}
      <div class="moves">${moveBtns}</div>
      <h2 style="margin-top:12px">Switch ${cur.canSwitch ? '' : '<span class="pill">can\'t switch</span>'}</h2>
      <div class="switches">${switchBtns(r.team, mm => !cur.canSwitch || mm.fainted || mm.pos >= 0 || taken.has(mm.index))}</div>
      ${T.step > 0 ? '<button class="small" id="tBack" style="margin-top:8px">Back</button>' : ''}`;
  }
  // ---- move buttons: everything needed to pick a move at a glance ----
  const CAT_ICON = { Physical: '⚔ Physical', Special: '✦ Special', Status: '◎ Status' };
  function effMult(type, defTypes) {
    let m = 1; const ch = (S.dex.chart || {})[type] || {};
    for (const t of defTypes || []) m *= ch[t] ?? 1;
    return m;
  }
  const effLabel = x => x >= 4 ? 'Super effective ×4' : x >= 2 ? 'Super effective ×2' : x <= 0.25 ? 'Barely effective ×¼' : x < 1 ? 'Not very effective ×½' : 'Neutral ×1';
  const effCls = x => x >= 4 ? 'e4' : x >= 2 ? 'e2' : x < 1 ? 'eh' : 'e1';
  function moveBtnHtml(m, cur, mv) {
    const vs = view(m.id); const me = vs.sides[m.you].active[cur.pos] || {};
    const foes = vs.sides[1 - m.you].active.filter(f => f && !f.fainted);
    let eff = '';
    if (mv.cat !== 'Status' && foes.length) {
      eff = foes.map(f => { const x = effMult(mv.type, f.types); return `<span class="meff ${effCls(x)}" title="Against ${esc(f.name)}">${foes.length > 1 ? esc(f.name.split(' ')[0]) + ': ' : ''}${effLabel(x)}</span>`; }).join('');
    }
    const stab = mv.cat !== 'Status' && (me.types || []).includes(mv.type) ? '<span class="mstab" title="Same type as the user: 1.5× damage">STAB</span>' : '';
    const why = mv.disabled ? (mv.needsForm ? 'Transform first' : mv.pp <= 0 ? 'No PP left' : "Can't use right now") : '';
    const tgt = mv.target === 'allFoes' ? '<span class="mtag">Hits both foes</span>' : mv.target === 'all' ? '<span class="mtag">Hits everyone</span>' : '';
    return `<button class="move-btn" data-move="${mv.index}" data-tipmove="${esc(mv.name)}" style="--tc:var(--t-${mv.type})" ${mv.disabled ? 'disabled' : ''}>
      <span class="mtop"><span class="mn">${esc(mv.name)}</span><span class="mpp ${mv.pp <= Math.ceil(mv.maxpp / 4) ? 'low' : ''}">PP ${mv.pp}/${mv.maxpp}</span></span>
      <span class="mrow">${typeChip(mv.type)}<span class="mcat">${CAT_ICON[mv.cat] || mv.cat}</span>${mv.cat !== 'Status' ? `<span class="mpow">Power <b>${mv.power || '—'}</b></span>` : ''}<span class="macc">Acc <b>${mv.acc === true ? '—' : mv.acc}</b></span>${stab}</span>
      ${why ? `<span class="mwhy">${why}</span>` : eff || tgt ? `<span class="meffs">${eff}${tgt}</span>` : ''}
    </button>`;
  }
  function switchBtns(team, disabled) {
    return team.map(mm => `<span class="sw-wrap" data-tipmon="${mm.id}"><button class="sw-btn" data-sw="${mm.index}" ${disabled(mm) ? 'disabled' : ''}>${sprite(F(mm.id), 'sm' + (mm.fainted ? ' fainted' : ''), true, mm.gender)}<span class="grow">${esc(mm.name)} ${gsym(mm.gender)}${mm.pos >= 0 && !mm.fainted ? ' <span class="pill">in battle</span>' : ''}${mm.status ? ` <span class="st st-${mm.status}">${STATUSL[mm.status]}</span>` : ''}<span class="sw-types">${(mm.types || []).map(typeChip).join('')}<span class="sw-hp">${mm.fainted ? 'Fainted' : mm.hp !== undefined ? `${mm.hp}/${mm.maxhp}` : mm.hpPct + '%'}</span></span><div class="mini-hp"><i style="width:${mm.hpPct}%;background:${hpColor(mm.hpPct)}"></i></div></span></button></span>`).join('');
  }

  const QUICK = ['Good luck!', 'GG', 'Well played!', 'Nice!', 'Oops'];
  // Champions-style clocks: your time bank, this turn's limit, and the game clock (PvP only)
  const mmss = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  function clocksHtml(m) {
    const c = m.clock; if (!c || m.battle.state.ended || m.replay) return '';
    const now = Date.now();
    const chip = (label, ms, running, title) => `<span class="pill clock ${running ? 'run' : ''}" ${running ? `data-clock-end="${now + ms}"` : ''} title="${title}">${label} <b>${mmss(ms)}</b></span>`;
    const you = m.you; const parts = [];
    if (you !== null) {
      const me = c.players[you];
      parts.push(chip('Your time', me.bank, me.waiting, 'Your total time for the battle. If it runs out, you lose.'));
      if (me.waiting) parts.push(chip('This turn', Math.min(me.turn, me.bank), true, 'Time to choose this turn. If it runs out, a move is chosen for you.'));
    }
    const foe = c.players[you === null ? 1 : 1 - you];
    parts.push(chip(you === null ? `${esc(m.players[1].name)}` : 'Opponent', foe.bank, foe.waiting, "Opponent's total time for the battle."));
    parts.push(chip('Game', c.game, true, 'When the game clock runs out, the player with more shinobi left wins (then more HP left).'));
    return `<div class="clocks">${parts.join('')}</div>`;
  }
  function renderBattle(id) {
    const m = S.matches[id]; const b = m.battle; const st = b.state;
    const r = rec(id) || { shown: b.log.length };
    if (window.AUDIO) {
      AUDIO.setBattle(!st.ended || !!r.playing);
      // win/lose jingle once the last turn has finished playing
      if (st.ended && !r.playing && rec(id) && !rec(id).jingled) { rec(id).jingled = true; AUDIO.jingle(m.you === null || st.winner === m.you ? 'win' : 'lose'); }
    }
    const logEl = $('#blog'); const atBottom = !logEl || logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 80;
    const vs = view(id);
    $('#view').innerHTML = `<div class="battle">
      <section>
        <div class="row" style="margin-bottom:8px"><b class="grow">${esc(st.sides[0].name)} vs ${esc(st.sides[1].name)}</b><span class="pill">${m.road ? `Road to 50 · Floor ${m.road.floor}` : esc(label(m.mode, m.format))}</span><span class="pill">Turn ${st.turn}</span>
          <button class="small" id="bTypes">Type chart</button>
          <select id="bSpeed" class="small" title="Animation speed"><option value="normal">Anim: normal</option><option value="fast">Anim: fast</option><option value="off">Anim: off</option></select>
          ${!st.ended && m.you !== null && !m.replay ? '<button class="small" id="mForfeit">Forfeit</button>' : ''}</div>
        ${clocksHtml(m)}
        <div class="arena ${vs.field.weather ? 'weather-' + vs.field.weather : ''} ${m.format}" id="arena-${id}">${fieldHtml(id)}</div>
        <div class="controls card">${controlsHtml(m)}</div>
      </section>
      <section>
        <div class="log" id="blog">${b.log.slice(0, r.shown).filter(l => l.text || l.cls === 'turn').map(l => `<div class="${l.cls === 'chat' ? 'chatline' : l.cls}">${esc(l.text)}</div>`).join('')}</div>
        ${m.replay ? `<div class="muted small" style="margin-top:8px">Replay of ${esc(label(m.mode, m.format))} · ${new Date(m.created).toLocaleString()}</div>` : `<div class="quickchat">${QUICK.map(q => `<button class="small" data-quick="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        <div class="row" style="margin-top:6px"><input id="bChat" class="grow" maxlength="300" placeholder="Chat…"><button id="bSend">Send</button></div>`}
      </section></div>`;
    const lg = $('#blog'); if (atBottom) lg.scrollTop = lg.scrollHeight;
    wire(m);
    syncWx(id);
  }
  U.renderBattle = renderBattle;
  // count every visible clock down between server updates
  setInterval(() => {
    const now = Date.now();
    for (const el of document.querySelectorAll('[data-clock-end]')) {
      const left = +el.dataset.clockEnd - now; const b = el.querySelector('b'); if (b) b.textContent = mmss(left);
      el.classList.toggle('low', left < 10000);
    }
  }, 250);

  function wirePicks(id) {
    const m = S.matches[id]; const T = S.turn[id];
    const choose = key => {
      const [side, pos] = key.split(':').map(Number);
      T.pending = { index: T.pending.index, flash: [key], note: 'Target', target: { side, pos } };
      renderBattle(id);
    };
    $$('[data-pick]').forEach(el => el.onclick = () => choose(el.dataset.pick));
    $$('[data-pickbtn]').forEach(el => el.onclick = () => choose(el.dataset.pickbtn));
  }

  function wire(m) {
    const id = m.id; const b = m.battle; const r = b.request; const st = b.state;
    const fo = $('#mForfeit'); if (fo) fo.onclick = () => { if (confirm('Forfeit this match?')) act(id, { type: 'forfeit' }); };
    const bb = $('#mBack'); if (bb) bb.onclick = () => { if (m.replay) { S.open = S.open.filter(x => x !== id); delete S.matches[id]; delete S.bat[id]; history.replaceState(null, '', '/'); } S.tab = 'home'; U.render(); };
    const br = $('#mRoom'); if (br) br.onclick = () => { S.tab = 'room'; U.render(); };
    const bro = $('#mRoad'); if (bro) bro.onclick = () => { S.open = S.open.filter(x => x !== id); delete S.matches[id]; S.tab = 'road'; U.render(); };
    const rm = $('#mRematch'); if (rm) rm.onclick = () => socket.emit('rematch', { id }, r => { if (r && r.error) toast(r.error); else if (r && r.waiting) toast('Rematch requested. Waiting for your opponent…'); });
    const vt = $('#mTeams'); if (vt) vt.onclick = () => showTeams(m);
    const rl = $('#mReplay'); if (rl) rl.onclick = () => { const url = location.origin + '/replay/' + (m.replay ? m.replayId : id); (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Replay link copied: ' + url, 4000), () => prompt('Replay link:', url)); };
    const ra = $('#rpAgain'); if (ra) ra.onclick = () => U.openReplay(m.replayId, true);
    $$('[data-quick]').forEach(q => q.onclick = () => socket.emit('chat', { room: id, text: q.dataset.quick }));
    const sk = $('#bSkip'); if (sk) sk.onclick = () => { rec(id).skip = true; };
    const sp = $('#bSpeed'); sp.value = S.animSpeed; sp.onchange = () => { S.animSpeed = sp.value; U.store('ssbu-anim', sp.value); };
    $('#bTypes').onclick = () => U.showTypeChart();
    const send = () => { const v = $('#bChat').value.trim(); if (v) { socket.emit('chat', { room: id, text: v }); $('#bChat').value = ''; } };
    if ($('#bSend')) { $('#bSend').onclick = send; $('#bChat').onkeydown = e => { if (e.key === 'Enter') send(); }; }
    const u = $('#bUndo'); if (u) u.onclick = () => { delete S.turn[id]; act(id, { type: 'undo' }); };
    if (!r || m.you === null || (rec(id) && rec(id).playing)) return;
    const T = S.turn[id]; if (!T) return;
    const rerender = () => renderBattle(id);
    const back = $('#tBack');
    if (r.kind === 'switch') {
      if (back) back.onclick = () => { T.switches.pop(); rerender(); };
      $$('[data-sw]').forEach(el => el.onclick = () => {
        T.switches.push({ pos: r.slots[T.switches.length], index: +el.dataset.sw });
        if (T.switches.length === r.slots.length) { const sw = T.switches; delete S.turn[id]; act(id, { type: 'choose', choice: { switches: sw } }); }
        else rerender();
      });
      return;
    }
    if (r.kind !== 'move') return;
    const slots = r.actives.filter(Boolean); const cur = slots[T.step];
    const finish = action => {
      T.actions.push(action); T.pending = null;
      if (T.step + 1 < slots.length) { T.step++; rerender(); return; }
      const actions = T.actions; delete S.turn[id];
      act(id, { type: 'choose', choice: { actions } });
    };
    if (back) back.onclick = () => { T.step--; const p = T.actions.pop(); if (p && p.mega) T.megaPos = null; T.pending = null; rerender(); };
    const fsb = $('#tFS'); if (fsb) fsb.onclick = () => { T.megaPos = T.megaPos === cur.pos ? null : cur.pos; rerender(); };
    wirePicks(id);
    const c = $('#tConfirm'); if (c) c.onclick = () => {
      const p = T.pending;
      const foeKey = p.flash.find(k => k.startsWith((1 - m.you) + ':'));
      let target = p.target;
      if (!target && foeKey) { const [side, pos] = foeKey.split(':').map(Number); target = { side, pos }; }
      finish({ pos: cur.pos, type: 'move', index: Math.max(0, p.index), target, mega: T.megaPos === cur.pos && !!cur.finalSmash });
    };
    const x = $('#tCancel'); if (x) x.onclick = () => { T.pending = null; rerender(); };
    $$('[data-move]').forEach(el => el.onclick = () => {
      const i = +el.dataset.move;
      const mv = i >= 0 ? cur.moves[i] : { name: cur.locked || 'Struggle', target: 'randomFoe', cat: 'Physical' };
      const t = i >= 0 ? targetsFor(m, cur, mv) : targetsFor(m, cur, Object.assign({}, S.dex.moves[mv.name] || mv, { name: mv.name }));
      T.pending = Object.assign({ index: i, flash: [], pick: null }, t);
      rerender();
    });
    $$('[data-sw]').forEach(el => el.onclick = () => { if (T.megaPos === cur.pos) T.megaPos = null; finish({ pos: cur.pos, type: 'switch', index: +el.dataset.sw }); });
  }
})();
