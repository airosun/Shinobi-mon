/* Shinobi-mon: Road to 50 Wins. A gauntlet of 50 fixed boss fights (Singles, bring 6 pick 3).
   Start screen, the floor map, the team editor between floors, recruiting, and run results.
   The server holds the run (saved after every change), so it can be paused and continued later. */
(() => {
  const U = window.SSBU;
  const { $, $$, esc, S, F, sprite, typeChip, toast, socket, modal, closeModal, gsym } = U;
  let editSlot = 0;
  let busy = false;
  const FS_FROM = 15;
  const hasUlt = () => Object.keys(S.dex.finalSmashes || {}).length > 0;

  const call = (ev, data, done) => {
    if (busy) return; busy = true;
    socket.emit(ev, data || {}, r => { busy = false; if (r && r.error) { toast(r.error, 5000); return; } if (r && 'run' in r) S.road = r; if (done) done(r); if (S.tab === 'road') render(); });
  };
  const load = () => socket.emit('road:get', {}, r => { if (r && !r.error) { S.road = r; if (S.tab === 'road') render(); } });
  socket.on('road', r => { S.road = r; if (S.tab === 'road') render(); });
  socket.on('connect', () => { if (S.tab === 'road') load(); });

  U.renderRoad = () => { if (!S.road) { $('#view').innerHTML = '<section class="card"><div class="muted">Loading…</div></section>'; return load(); } render(); };

  function render() {
    const d = S.road; const r = d.run;
    if (!r) return renderStart(d);
    if (r.status !== 'active') return renderOver(d);
    if (r.recruitFloor) return renderRecruit(d);
    renderRun(d);
  }

  // ---------- records ----------
  const recordsHtml = d => `<div class="road-records">
    <div><span>Best</span><b>${d.best ? (d.clears ? 'All 50 floors' : `Floor ${d.best}`) : '—'}</b></div>
    <div><span>Full clears</span><b>${d.clears}</b></div>
    <div><span>Runs</span><b>${d.runs}</b></div>
  </div>`;
  const lastRunHtml = d => d.lastRun ? `<p class="muted small" style="margin:8px 0 0">Last run: ${d.lastRun.status === 'cleared' ? '<b>cleared all 50 floors!</b>' : `cleared <b>${d.lastRun.cleared}</b> floor${d.lastRun.cleared === 1 ? '' : 's'}${d.lastRun.lostTo ? ` · lost to ${esc(d.lastRun.lostTo)}` : d.lastRun.status === 'abandoned' ? ' · abandoned' : ''}`} ${(d.lastRun.team || []).map(id => S.byId[id] ? sprite(S.byId[id], 'xs') : '').join('')}</p>` : '';

  // ---------- start ----------
  function renderStart(d) {
    const hasElite = S.elite.some(U.eliteReady);
    $('#view').innerHTML = `
    <div class="road-grid">
      <section class="card road-shinobi span2">
        <h1>Road to 50 Wins</h1>
        <p>Battle through <b>50 boss fights</b> that get harder as you climb. Every boss brings a full team of 6 and picks 3, just like you (Singles). Your team is <b>healed after every floor</b>, and after each win you can <b>recruit one of the boss's shinobi</b> for the rest of the run. Change moves and items between floors. <b>One loss ends the run.</b></p>
        <p class="muted small">The bosses are the same for everyone, every run.${hasUlt() ? ` Transformation items work for you from floor 1; bosses start using them on floor ${FS_FROM}.` : ''} Your run saves after every floor, so you can stop and come back any time${S.account ? '' : ' (on this browser; sign in to keep it on your account)'}.</p>
        ${recordsHtml(d)}${lastRunHtml(d)}
      </section>
      <section class="card road-opt">
        <h2>Use a Strike Squad</h2>
        <p class="muted small">Bring one of your Strike Squads, moves and items included.</p>
        ${hasElite ? `<div class="row wrap">${U.eliteSelect('roadElite')}<button class="primary" id="roadStartElite">Start run</button></div>` : `<p class="small">You don't have a complete Strike Squad yet. Build one in <a href="#" data-goto="elite">Strike Squads</a>.</p>`}
      </section>
      <section class="card road-opt">
        <h2>Pick 6 shinobi you own</h2>
        <p class="muted small">Choose 6 from your Battle Pass roster. They start with suggested moves and no items, and you can change both before floor 1.</p>
        ${S.roster.length >= 6 ? `<button class="primary" id="roadStartRoster">Choose shinobi</button>` : `<p class="small">You need at least 6 shinobi in your roster (you have ${S.roster.length}). Roll the <a href="#" data-goto="pass">Battle Pass</a>.</p>`}
      </section>
      <section class="card road-opt">
        <h2>Random team</h2>
        <p class="muted small">6 random shinobi with random natures, IVs, abilities and moves. No items to start. Pure luck of the draw!</p>
        <button class="primary" id="roadStartRandom">Start with a random team</button>
      </section>
      <section class="card road-opt">
        <h2>The climb</h2>
        <ul class="about-list small">
          <li>Early bosses don't battle very smart; later ones play to win.</li>
          ${hasUlt() ? `<li>Floors ${FS_FROM}+: every boss has an Transformation.</li>` : ''}
          <li>Floors 10, 20, 30, 40 and 50 are the toughest boss of their ten.</li>
          <li>Every shinobi in the Shinobidex shows up on at least one boss team.</li>
        </ul>
      </section>
    </div>`;
    $$('[data-goto]').forEach(a => a.onclick = e => { e.preventDefault(); S.tab = a.dataset.goto; U.render(); });
    const se = $('#roadStartElite'); if (se) se.onclick = () => {
      const sel = $('#roadElite'); const i = +sel.value; const team = U.eliteTeamSets(i); if (!team) return;
      if (!confirm(`Start a Road to 50 run with "${S.elite[i].name}"?`)) return;
      call('road:start', { source: 'elite', team }, () => { editSlot = 0; });
    };
    const sr = $('#roadStartRoster'); if (sr) sr.onclick = pickRoster;
    $('#roadStartRandom').onclick = () => { if (confirm('Start a run with 6 random shinobi?')) call('road:start', { source: 'random' }, () => { editSlot = 0; }); };
  }

  function pickRoster() {
    const chosen = [];
    const draw = () => {
      const species = new Set(chosen.map(u => U.rosterById(u).species));
      modal(`<div class="row" style="margin-bottom:8px"><h2 class="grow" style="margin:0">Choose 6 shinobi (${chosen.length}/6)</h2><button id="rpX">Cancel</button><button class="primary" id="rpGo" ${chosen.length === 6 ? '' : 'disabled'}>Start run</button></div>
        <p class="muted small" style="margin-top:0">One of each shinobi. Tap again to remove.</p>
        <div class="fgrid">${S.roster.map(b => { const on = chosen.includes(b.uid); const blocked = !on && (chosen.length >= 6 || species.has(b.species)); return U.fighterCard(b, { attr: `data-rsel="${b.uid}"`, sel: on, dim: blocked }); }).join('')}</div>`);
      $('#rpX').onclick = closeModal;
      $('#rpGo').onclick = () => { const fighters = chosen.map(u => U.rosterById(u)); closeModal(); call('road:start', { source: 'roster', shinobi }, () => { editSlot = 0; }); };
      $$('[data-rsel]').forEach(el => el.onclick = () => {
        const u = el.dataset.rsel; const i = chosen.indexOf(u);
        if (i >= 0) chosen.splice(i, 1);
        else if (chosen.length < 6 && !species.has(U.rosterById(u).species)) chosen.push(u);
        else return toast(chosen.length >= 6 ? 'You already picked 6.' : 'Only one of each shinobi.');
        draw();
      });
    };
    draw();
  }

  // ---------- floor map ----------
  function mapHtml(r) {
    let h = '';
    for (let f = 1; f <= 50; f++) {
      const cls = f < r.floor ? 'done' : f === r.floor ? 'cur' : '';
      h += `<span class="rf ${cls} ${f % 10 === 0 ? 'ms' : ''}" title="Floor ${f}${f % 10 === 0 ? ' (milestone)' : ''}">${f % 10 === 0 || f === r.floor ? f : ''}</span>`;
    }
    return `<div class="road-map">${h}</div>`;
  }
  function bossTeamHtml(b) {
    return `<div class="road-boss-team">${b.team.map(m => { const f = S.byId[m.species]; return `<div class="rbt" data-tipdex="${m.species}">${sprite(f, 'md', false, m.gender)}<div class="small">${esc(f.name)}</div><div>${f.types.map(typeChip).join('')}</div></div>`; }).join('')}</div>`;
  }

  // ---------- active run ----------
  function renderRun(d) {
    const r = d.run; const b = r.boss;
    if (editSlot > 5) editSlot = 0;
    const m = r.team[editSlot];
    const counts = U.itemCounts(r.team);
    const fighting = !!r.matchId;
    $('#view').innerHTML = `
    <div class="road-grid">
      <section class="card span2 road-floor ${b.milestone ? 'milestone' : ''}">
        <div class="row wrap"><div class="grow"><div class="muted small">Road to 50 Wins · Floor</div><div class="road-floorno">${r.floor}<span>/50</span></div></div>
          <div class="road-actions">${fighting ? '<button class="primary big" id="roadFight">Resume fight</button>' : '<button class="primary big" id="roadFight">Fight!</button>'}<button class="small" id="roadQuit">Abandon run</button></div></div>
        ${mapHtml(r)}
        <div class="road-boss"><div class="muted small">${b.milestone ? '⭐ Milestone boss' : 'Boss'} · team BST ${b.bst}${hasUlt() && r.floor >= FS_FROM ? ' · has an Transformation' : ''}</div><h2 style="margin:2px 0 8px">${esc(b.name)}</h2>${bossTeamHtml(b)}</div>
        <p class="muted small" style="margin:8px 0 0">Your team is fully healed for every floor. ${fighting ? 'Your fight is waiting for you.' : 'You can stop here and come back later; your run is saved.'}</p>
      </section>
      <section class="card span2">
        <div class="row"><h2 class="grow" style="margin:0">Your team</h2><span class="muted small">${fighting ? 'Finish the fight to change moves and items.' : 'Change moves and items between floors. Changes save automatically.'}</span></div>
        <div class="slots" style="margin-top:10px">${r.team.map((s, i) => `<div class="slot filled ${i === editSlot ? 'sel' : ''}" data-rslot="${i}">${U.badge(F(s.species), '', s.gender)}<span>${esc(F(s.species).name)} ${gsym(s.gender)}</span>${s.item ? `<span class="muted small">${esc(s.item)}</span>` : ''}</div>`).join('')}</div>
        ${[...counts.values()].some(c => c > 1) ? '<p class="small" style="color:var(--bad)">Item clause: each item can only be used once per team.</p>' : ''}
        <div class="editor"><div>${U.fighterCard(m, { gender: m.gender })}</div><div id="roadSet" class="${fighting ? 'locked' : ''}">${U.setEditor(m, draft(m), 'road' + editSlot, counts)}</div></div>
      </section>
      <section class="card span2"><h2>Progress</h2>${recordsHtml(d)}${historyHtml(r)}</section>
    </div>`;
    $('#roadFight').onclick = () => call('road:fight', {}, x => { if (x && x.id) { if (S.matches[x.id]) { S.tab = x.id; U.render(); } } });
    $('#roadQuit').onclick = () => { if (confirm(`Abandon this run? You've cleared ${r.floor - 1} floor${r.floor === 2 ? '' : 's'}. This can't be undone.`)) call('road:abandon'); };
    $$('[data-rslot]').forEach(el => el.onclick = () => { editSlot = +el.dataset.rslot; render(); });
    if (!fighting) U.wireSetEditor($('#roadSet'), drafts[m.uid], () => saveEdits(r));
  }
  // local copy of each shinobi's moves/item while editing
  const drafts = {};
  function draft(m) { if (!drafts[m.uid] || drafts[m.uid].src !== JSON.stringify([m.moves, m.item])) drafts[m.uid] = { moves: [...m.moves, '', '', '', ''].slice(0, 4), item: m.item, src: JSON.stringify([m.moves, m.item]) }; return drafts[m.uid]; }
  let saveTimer = null;
  function saveEdits(r) {
    render();   // show the change right away
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const builds = r.team.map(s => { const x = drafts[s.uid] || s; return { moves: x.moves.filter(Boolean), item: x.item || '' }; });
      if (builds.some(b => !b.moves.length)) return toast('Each shinobi needs at least one move.');
      socket.emit('road:edit', { builds }, res => {
        if (res && res.error) { toast(res.error, 5000); return; }
        S.road = res; if (S.tab === 'road') render();
      });
    }, 500);
  }
  function historyHtml(r) {
    const h = r.history.slice().reverse();
    if (!h.length) return '<p class="muted small">No floors cleared yet this run.</p>';
    return `<div class="list road-hist">${h.slice(0, 12).map(x => `<div class="list-item"><span class="pill ${x.won ? 'win' : 'loss'}">${x.won ? 'Won' : 'Lost'}</span><span class="grow">Floor ${x.floor} · ${esc(x.boss)}${x.recruited ? ` <span class="muted small">· recruited ${esc(F(x.recruited.species).name)} for ${esc(F(x.recruited.replaced).name)}</span>` : ''}</span>${x.lineup ? x.lineup.map(id => S.byId[id] ? sprite(S.byId[id], 'xs') : '').join('') : ''}</div>`).join('')}</div>`;
  }

  // ---------- recruiting ----------
  let recruitPick = null, recruitReplace = null;
  function renderRecruit(d) {
    const r = d.run; const boss = r.recruit; const floor = r.recruitFloor;
    const mine = new Set(r.team.map(s => s.species));
    $('#view').innerHTML = `
    <section class="card road-recruit">
      <div class="road-win">🏆 Floor ${floor} cleared!</div>
      <h2 style="margin-top:4px">Recruit a shinobi?</h2>
      <p class="muted small" style="margin-top:0">Take one shinobi from the boss's team for the rest of this run, exactly as the boss built it (nature, IVs, ability, moves and item). It replaces one of yours. Or skip and keep your team.</p>
      <h3>1. Pick a shinobi from the boss</h3>
      <div class="fgrid">${boss.map((s, i) => { const dup = mine.has(s.species) && !(recruitReplace !== null && r.team[recruitReplace].species === s.species); return U.fighterCard(s, { gender: s.gender, attr: `data-rpick="${i}"`, sel: recruitPick === i, dim: dup, extra: `<div class="rc-set small">${s.item ? `<div><b>${esc(s.item)}</b></div>` : ''}<div>${s.moves.map(esc).join(' · ')}</div>${dup ? '<div class="muted">Already on your team</div>' : ''}</div>` }); }).join('')}</div>
      <h3>2. Choose who it replaces</h3>
      <div class="slots">${r.team.map((s, i) => `<div class="slot filled ${recruitReplace === i ? 'sel' : ''}" data-rrep="${i}">${U.badge(F(s.species), '', s.gender)}<span>${esc(F(s.species).name)}</span></div>`).join('')}</div>
      <div class="row wrap" style="margin-top:14px"><button class="primary" id="rcGo" ${recruitPick !== null && recruitReplace !== null ? '' : 'disabled'}>${recruitPick !== null && recruitReplace !== null ? `Recruit ${esc(F(boss[recruitPick].species).name)} for ${esc(F(r.team[recruitReplace].species).name)}` : 'Recruit'}</button><button id="rcSkip">Skip, keep my team</button></div>
    </section>`;
    $$('[data-rpick]').forEach(el => el.onclick = () => { recruitPick = +el.dataset.rpick; render(); });
    $$('[data-rrep]').forEach(el => el.onclick = () => { recruitReplace = +el.dataset.rrep; render(); });
    $('#rcGo').onclick = () => call('road:recruit', { pick: recruitPick, replace: recruitReplace }, () => { editSlot = recruitReplace; recruitPick = recruitReplace = null; toast('Recruited!'); });
    $('#rcSkip').onclick = () => call('road:recruit', { pick: null }, () => { recruitPick = recruitReplace = null; });
  }

  // ---------- run over ----------
  function renderOver(d) {
    const r = d.run; const won = r.status === 'cleared';
    const last = r.history[r.history.length - 1];
    $('#view').innerHTML = `
    <section class="card road-over ${won ? 'won' : ''}">
      <div class="road-win">${won ? '👑 You cleared all 50 floors!' : `Run over on floor ${r.floor}`}</div>
      <p>${won ? 'Incredible. You beat every boss on the Road to 50 Wins.' : `You were beaten by <b>${esc(last ? last.boss : 'the boss')}</b> after clearing <b>${r.floor - 1}</b> floor${r.floor === 2 ? '' : 's'}.`}</p>
      ${recordsHtml(d)}
      <h3>Final team</h3><div class="road-boss-team">${r.team.map(s => `<div class="rbt">${sprite(F(s.species), 'md', false, s.gender)}<div class="small">${esc(F(s.species).name)}</div></div>`).join('')}</div>
      ${historyHtml(r)}
      <div class="row" style="margin-top:12px"><button class="primary" id="roadAgain">Start a new run</button></div>
    </section>`;
    $('#roadAgain').onclick = () => call('road:dismiss');
  }
})();
