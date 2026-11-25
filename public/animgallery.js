/* Shinobi-mon: Move Animation Gallery (/animations).
   Plays any move's battle animation on a real battlefield so animations can be reviewed.
   Moves can be flagged with a note (saved in this browser) and the notes copied as a change request. */
(() => {
  const U = window.SSBU;
  const { $, $$, esc, S, F, sprite, typeChip, toast } = U;
  const NOTES_KEY = 'ssbu-anim-notes';
  const loadNotes = () => { try { return JSON.parse(localStorage.getItem(NOTES_KEY)) || {}; } catch { return {}; } };
  const saveNotes = n => { try { localStorage.setItem(NOTES_KEY, JSON.stringify(n)); } catch {} };
  const G = {
    q: '', type: '', cat: '', kind: '', flaggedOnly: false,
    format: 'singles', dir: 'you', attacker: 'mario', defender: 'bowser',
    speed: 1, cur: null, auto: false, autoTimer: null, notes: loadNotes(),
  };
  const isCustom = n => !!(window.MOVEFX && window.MOVEFX.recipes[n]);
  const TARGETS = { normal: 'One foe', randomFoe: 'Random foe', allFoes: 'Both foes', all: 'Everyone else', self: 'Self', foeSide: "Foe's side", scripted: 'Varies' };

  function moves() {
    const all = Object.values(S.dex.moves).sort((a, b) => a.name.localeCompare(b.name));
    const q = G.q.trim().toLowerCase();
    return all.filter(m => (!q || m.name.toLowerCase().includes(q))
      && (!G.type || m.type === G.type) && (!G.cat || m.cat === G.cat)
      && (!G.kind || (G.kind === 'custom') === isCustom(m.name))
      && (!G.flaggedOnly || G.notes[m.name] !== undefined));
  }
  const learners = n => S.dex.fighters.filter(f => f.learnset.includes(n));

  // ---------- page ----------
  U.renderAnims = () => {
    const ms = moves();
    const all = Object.keys(S.dex.moves).length, custom = Object.keys(S.dex.moves).filter(isCustom).length;
    const flagged = Object.keys(G.notes).length;
    const fopts = sel => S.dex.fighters.slice().sort((a, b) => a.name.localeCompare(b.name)).map(f => `<option value="${f.id}" ${f.id === sel ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
    $('#view').innerHTML = `
    <div class="ag">
      <section class="card ag-head">
        <div class="row wrap"><div class="grow"><h1 style="margin:0">Move Animation Gallery</h1>
          <div class="muted small">${all} moves · ${custom} with their own animation · ${all - custom} use their type's default animation</div></div>
          <button id="agCopy" ${flagged ? '' : 'disabled'}>Copy change requests (${flagged})</button></div>
        <p class="muted small" style="margin:6px 0 0">Tap a move to play it. Flag any that need work and write what you'd like changed; your notes save in this browser. Then press <b>Copy change requests</b> and paste the list to me.</p>
      </section>
      <div class="ag-main">
        <section class="card ag-stage-card">
          <div class="ag-now"><span id="agNow">${G.cur ? nowHtml(G.cur) : '<span class="muted">Pick a move</span>'}</span></div>
          <div class="arena ${G.format}" id="arena-gallery">${stageHtml()}</div>
          <div class="ag-ctl row wrap">
            <button id="agReplay" ${G.cur ? '' : 'disabled'}>↻ Replay</button>
            <button id="agPrev">‹ Prev</button><button id="agNext">Next ›</button>
            <button id="agAuto" class="${G.auto ? 'primary' : ''}">${G.auto ? '⏸ Stop' : '▶ Play all'}</button>
            ${G.cur && S.dex.moves[G.cur].charge ? '<button id="agCharge">Play charge turn</button>' : ''}
          </div>
          <div class="ag-opts">
            <label>Attacker <select id="agAtk">${fopts(G.attacker)}</select></label>
            <label>Target <select id="agDef">${fopts(G.defender)}</select></label>
            <label>Side <select id="agDir"><option value="you" ${G.dir === 'you' ? 'selected' : ''}>Your side attacks</option><option value="foe" ${G.dir === 'foe' ? 'selected' : ''}>Foe attacks</option></select></label>
            <label>Format <select id="agFmt"><option value="singles" ${G.format === 'singles' ? 'selected' : ''}>Singles</option><option value="doubles" ${G.format === 'doubles' ? 'selected' : ''}>Doubles</option></select></label>
            <label>Speed <select id="agSpd">${[[1, 'Normal'], [0.45, 'Fast'], [2, 'Slow-mo']].map(([v, n]) => `<option value="${v}" ${G.speed === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          </div>
          ${G.cur ? noteHtml(G.cur) : ''}
        </section>
        <section class="card ag-list-card">
          <div class="ag-filters">
            <input id="agQ" placeholder="Search moves" value="${esc(G.q)}" autocomplete="off">
            <select id="agType"><option value="">All types</option>${S.dex.types.map(t => `<option ${G.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
            <select id="agCat"><option value="">All categories</option>${['Physical', 'Special', 'Status'].map(c => `<option ${G.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
            <select id="agKind"><option value="">All animations</option><option value="custom" ${G.kind === 'custom' ? 'selected' : ''}>Own animation</option><option value="default" ${G.kind === 'default' ? 'selected' : ''}>Type default</option></select>
            <label class="ag-chk"><input type="checkbox" id="agFlag" ${G.flaggedOnly ? 'checked' : ''}> Flagged only</label>
          </div>
          <div class="muted small" style="margin:6px 0">${ms.length} move${ms.length === 1 ? '' : 's'}</div>
          <div class="ag-list" id="agList">${ms.map(m => `<button class="ag-mv ${m.name === G.cur ? 'cur' : ''} ${G.notes[m.name] !== undefined ? 'flag' : ''}" data-agmv="${esc(m.name)}" data-tipmove="${esc(m.name)}">
              <span class="ag-n">${G.notes[m.name] !== undefined ? '🚩 ' : ''}${esc(m.name)}</span>
              <span class="ag-i">${typeChip(m.type)}<span class="cat">${m.cat}</span>${isCustom(m.name) ? '' : '<span class="ag-def">default</span>'}</span></button>`).join('') || '<div class="muted">No moves match.</div>'}</div>
        </section>
      </div>
    </div>`;
    wire();
  };
  function nowHtml(n) {
    const m = S.dex.moves[n];
    return `<b>${esc(n)}</b> ${typeChip(m.type)} <span class="cat">${m.cat}</span> <span class="muted small">${m.power ? m.power + ' BP · ' : ''}${TARGETS[m.target] || ''} · ${isCustom(n) ? 'own animation' : 'type default animation'}${m.contact ? ' · contact' : ''}</span>`;
  }
  function noteHtml(n) {
    const has = G.notes[n] !== undefined; const L = learners(n);
    return `<div class="ag-note">
      <div class="row wrap"><label class="ag-chk grow"><input type="checkbox" id="agFlagMv" ${has ? 'checked' : ''}> 🚩 Flag <b>${esc(n)}</b> for changes</label>
        <span class="muted small">Learned by ${L.length}: ${L.slice(0, 6).map(f => esc(f.name)).join(', ')}${L.length > 6 ? '…' : ''}</span></div>
      ${has ? `<textarea id="agNote" rows="2" placeholder="What should change? e.g. make the wave bigger, use blue instead of white…">${esc(G.notes[n])}</textarea>` : ''}
    </div>`;
  }
  // a battlefield with the attacker and target(s); in doubles each side has two shinobi
  function stageHtml() {
    const two = G.format === 'doubles';
    const you = G.dir === 'you' ? G.attacker : G.defender, foe = G.dir === 'you' ? G.defender : G.attacker;
    const ally = two ? (G.dir === 'you' ? 'kirby' : 'pikachu') : null, foe2 = two ? (G.dir === 'you' ? 'pikachu' : 'kirby') : null;
    const mon = (id, side, pos) => { const f = F(id); return `<div class="mon ${side === 0 ? 'you' : 'foe'} p${pos}" id="ga-${side}-${pos}"><div class="sprwrap"><div class="spr">${sprite(f, 'battle', side === 0)}</div></div></div>`; };
    let h = '<div class="plat foe"></div><div class="plat you"></div>';
    h += mon(foe, 1, 0) + (two ? mon(foe2, 1, 1) : '') + mon(you, 0, 0) + (two ? mon(ally, 0, 1) : '');
    return h;
  }
  // Substitute in battle: the shinobi steps back and a sand bag takes its place, takes a hit, then bursts
  function subDemo(arena, side, after) {
    const mon = document.getElementById(`ga-${side}-0`); const t = G.speed;
    const at = ms => new Promise(r => setTimeout(r, ms * t));
    (async () => {
      await new Promise(r => setTimeout(r, after));
      if (!mon.isConnected) return;
      mon.querySelector('.sprwrap').insertAdjacentHTML('beforeend', '<img class="subbag" src="/sprites/sand_bag.png" alt="Substitute">');
      mon.classList.add('subbed', 'sub-enter');
      await at(1900); if (!mon.isConnected) return;
      const bag = mon.querySelector('.subbag');
      bag.animate([{ rotate: '0deg', filter: 'brightness(1)' }, { rotate: '-9deg', filter: 'brightness(1.8)' }, { rotate: '7deg', filter: 'brightness(1)' }, { rotate: '-4deg', filter: 'brightness(1.4)' }, { rotate: '0deg', filter: 'brightness(1)' }], { duration: 420 * t });
      await at(1100); if (!mon.isConnected) return;
      mon.classList.add('sub-break');
      await at(750); if (!mon.isConnected) return;
      bag.remove(); mon.classList.remove('subbed', 'sub-enter', 'sub-break');
    })();
    return after + 4800 * t;
  }
  const sprAt = (side, pos) => { const s = document.getElementById(`ga-${side}-${pos}`); return s && s.querySelector('.spr'); };
  function centerOf(el, arena) { const a = arena.getBoundingClientRect(), r = el.getBoundingClientRect(); return { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height / 2 }; }

  // play a move the way the battle screen does
  function play(n, charge = false) {
    const arena = $('#arena-gallery'); if (!arena) return 0;
    // reset the stage so a previous animation (e.g. a shinobi that flew off) never lingers
    arena.innerHTML = stageHtml();
    const m = S.dex.moves[n];
    const atkSide = G.dir === 'you' ? 0 : 1, defSide = 1 - atkSide, two = G.format === 'doubles';
    const user = sprAt(atkSide, 0);
    const pt = el => { const p = centerOf(el, arena); return { x: p.x, y: p.y, el }; };
    let tg = [];
    if (m.target === 'self') tg = [];
    else if (m.target === 'allFoes' || m.target === 'foeSide') tg = [0, 1].map(p => sprAt(defSide, p)).filter(Boolean).map(pt);
    else if (m.target === 'all') tg = [sprAt(defSide, 0), sprAt(defSide, 1), sprAt(atkSide, 1)].filter(Boolean).map(pt);
    else tg = [pt(sprAt(defSide, 0))];
    const W = arena.clientWidth;
    const from = centerOf(user, arena);
    const foeSideCenters = [0, 1].map(p => sprAt(defSide, p)).filter(Boolean).map(el => centerOf(el, arena));
    user.parentElement.classList.add('acting'); setTimeout(() => user.parentElement.classList.remove('acting'), 700);
    const ms = window.MOVEFX.play({ arena, sp: G.speed, user, from, targets: tg, foeSideCenters, name: n, type: m.type, cat: m.cat, charge, flags: m, contact: !!m.contact, userLeft: from.x < W / 2 });
    if (n === 'Substitute') return subDemo(arena, atkSide, (ms || 550) * G.speed);
    return (ms || 600) * G.speed;
  }

  function select(n, autoplay = true) {
    G.cur = n;
    const now = $('#agNow'); if (now) now.innerHTML = nowHtml(n);
    $$('.ag-mv').forEach(b => b.classList.toggle('cur', b.dataset.agmv === n));
    // refresh the controls under the stage (charge button, note box)
    const cardNote = $('.ag-note'); const html = noteHtml(n);
    if (cardNote) cardNote.outerHTML = html; else $('.ag-opts').insertAdjacentHTML('afterend', html);
    const cb = $('#agCharge'); if (cb) cb.remove();
    if (S.dex.moves[n].charge) $('#agAuto').insertAdjacentHTML('afterend', '<button id="agCharge">Play charge turn</button>');
    $('#agReplay').disabled = false;
    wireNote(); wireCharge();
    // keep the chosen move visible inside the list without scrolling the page away from the battlefield
    const b = $(`.ag-mv[data-agmv="${CSS.escape(n)}"]`), list = $('#agList');
    if (b && list) { const top = b.offsetTop - list.offsetTop; if (top < list.scrollTop || top + b.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top - list.clientHeight / 2 + b.offsetHeight / 2; }
    if (autoplay) return play(n);
    return 0;
  }
  function step(d) {
    const list = moves().map(m => m.name); if (!list.length) return;
    const i = list.indexOf(G.cur);
    const next = list[(i + d + list.length) % list.length];
    return select(next);
  }
  function stopAuto() { G.auto = false; clearTimeout(G.autoTimer); const b = $('#agAuto'); if (b) { b.textContent = '▶ Play all'; b.classList.remove('primary'); } }
  function runAuto() {
    if (!G.auto || S.tab !== 'anims') return stopAuto();
    const list = moves().map(m => m.name);
    if (G.cur === list[list.length - 1]) return stopAuto();
    const ms = step(1) || 800;
    G.autoTimer = setTimeout(runAuto, ms + 700);
  }

  function wireNote() {
    const fl = $('#agFlagMv'); if (!fl) return;
    fl.onchange = () => {
      if (fl.checked) G.notes[G.cur] = G.notes[G.cur] || ''; else delete G.notes[G.cur];
      saveNotes(G.notes); refreshFlags(); select(G.cur, false);
      const t = $('#agNote'); if (t) t.focus();
    };
    const t = $('#agNote'); if (t) t.oninput = () => { G.notes[G.cur] = t.value; saveNotes(G.notes); };
  }
  function wireCharge() { const c = $('#agCharge'); if (c) c.onclick = () => play(G.cur, true); }
  function refreshFlags() {
    $$('.ag-mv').forEach(b => { const on = G.notes[b.dataset.agmv] !== undefined; b.classList.toggle('flag', on); b.querySelector('.ag-n').textContent = (on ? '🚩 ' : '') + b.dataset.agmv; });
    const n = Object.keys(G.notes).length; const c = $('#agCopy'); c.textContent = `Copy change requests (${n})`; c.disabled = !n;
  }

  function wire() {
    $$('[data-agmv]').forEach(b => b.onclick = () => {
      stopAuto();
      // phones: the battlefield is above the list, so bring it into view (then Prev / Next work from there)
      const ar = $('#arena-gallery'); const r = ar.getBoundingClientRect();
      if (r.top < 50 || r.bottom > innerHeight) ar.scrollIntoView({ behavior: 'smooth', block: 'start' });
      select(b.dataset.agmv);
    });
    $('#agReplay').onclick = () => G.cur && play(G.cur);
    $('#agPrev').onclick = () => { stopAuto(); step(-1); };
    $('#agNext').onclick = () => { stopAuto(); step(1); };
    $('#agAuto').onclick = () => {
      if (G.auto) return stopAuto();
      G.auto = true; const b = $('#agAuto'); b.textContent = '⏸ Stop'; b.classList.add('primary');
      const list = moves().map(m => m.name); if (!list.length) return stopAuto();
      const start = list.includes(G.cur) && G.cur !== list[list.length - 1] ? G.cur : null;
      const ms = start ? play(start) : select(list[0]);
      G.autoTimer = setTimeout(runAuto, (ms || 800) + 700);
    };
    wireNote(); wireCharge();
    const rer = () => { stopAuto(); U.renderAnims(); };
    $('#agAtk').onchange = e => { G.attacker = e.target.value; rer(); };
    $('#agDef').onchange = e => { G.defender = e.target.value; rer(); };
    $('#agDir').onchange = e => { G.dir = e.target.value; rer(); };
    $('#agFmt').onchange = e => { G.format = e.target.value; rer(); };
    $('#agSpd').onchange = e => { G.speed = +e.target.value; };
    $('#agType').onchange = e => { G.type = e.target.value; rer(); };
    $('#agCat').onchange = e => { G.cat = e.target.value; rer(); };
    $('#agKind').onchange = e => { G.kind = e.target.value; rer(); };
    $('#agFlag').onchange = e => { G.flaggedOnly = e.target.checked; rer(); };
    const q = $('#agQ');
    q.oninput = () => { G.q = q.value; const pos = q.selectionStart; U.renderAnims(); const n = $('#agQ'); n.focus(); n.setSelectionRange(pos, pos); };
    $('#agCopy').onclick = () => {
      const lines = Object.entries(G.notes).sort(([a], [b]) => a.localeCompare(b)).map(([n, t]) => `- ${n}: ${t.trim() || '(needs changes)'}`);
      const text = `Move animation change requests:\n${lines.join('\n')}`;
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast(`Copied ${lines.length} request${lines.length === 1 ? '' : 's'}. Paste them to Claude.`, 3500), () => prompt('Copy this list:', text));
    };
  }
})();
