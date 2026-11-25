/* Shinobi-mon extras: opponent info tooltips, replays, records/usage stats, damage calculator,
   and Showdown-style team import/export. Loaded after app.js and battle.js. */
(() => {
  const U = window.SSBU;
  const { $, $$, esc, S, F, typeChip, sprite, gsym, toast, modal, closeModal, label } = U;
  const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const SL = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
  const LEVEL = 50;
  const clone = o => JSON.parse(JSON.stringify(o));
  const pct = x => (Math.round(x * 1000) / 10).toFixed(1) + '%';
  const fsOf = id => Object.values(S.dex.finalSmashes || {}).filter(x => x.bases.includes(id));
  const renamed = n => (S.dex.renamed || {})[n] || n;

  // ---------- shinobi info tooltip (team preview + opposing shinobi in battle) ----------
  // Lv. 50 Speed range: 0 IVs with a hindering nature up to 31 IVs with a boosting nature
  function speedRange(base) {
    const calc = (iv, mult) => Math.floor(Math.floor((2 * base + iv) * LEVEL / 100 + 5) * mult);
    return [calc(0, 0.9), calc(31, 1.1)];
  }
  U.dexTipHtml = (id, opts = {}) => {
    const f = S.byId[id]; if (!f) return '';
    const base = f.form ? S.byId[(Object.values(S.dex.finalSmashes).find(x => x.id === id) || {}).base] : f;
    const seen = opts.seen;
    const abilities = [...f.abilities, f.hidden].filter((a, i, arr) => arr.findIndex(x => x.name === a.name) === i);
    const knownAb = seen && seen.ability ? renamed(seen.ability) : null;
    const abHtml = knownAb
      ? `<div><b>Ability:</b> ${esc(knownAb)}</div>`
      : `<div><b>${seen ? 'Possible abilities' : 'Abilities'}:</b> ${abilities.map(a => `${esc(a.name)}${a === f.hidden && !f.form ? ' <i class="muted">(hidden)</i>' : ''}`).join(' / ')}</div>`;
    const [lo, hi] = speedRange(f.stats.spe);
    const fs = !f.form && base ? fsOf(base.id) : [];
    const lines = [
      `<div class="tip-h">${sprite(f, 'sm', false, opts.gender)} ${esc(opts.name || f.name)} ${gsym(opts.gender)} ${f.types.map(typeChip).join(' ')}${opts.hpPct !== undefined ? ` <span class="muted">${opts.hpPct}%</span>` : ''}</div>`,
      `<div class="tip-s">${STATS.map(s => `${SL[s]} ${f.stats[s]}`).join(' · ')} · BST ${STATS.reduce((a, s) => a + f.stats[s], 0)}</div>`,
      `<div class="small muted">Lv. 50 Speed: ${lo}–${hi}${base && !opts.gender ? ` · ${esc(GENDER.label(base.id))}` : ''}</div>`,
      abHtml,
    ];
    if (seen) {
      if (seen.item) lines.push(`<div><b>Item:</b> ${esc(seen.item)}${seen.itemNow === false ? ' <i class="muted">(no longer held)</i>' : ''}</div>`);
      lines.push(`<div><b>Moves seen:</b> ${seen.moves.length ? seen.moves.map(n => `<span class="chip">${esc(n)}</span>`).join(' ') : '<span class="muted">none yet</span>'}</div>`);
    }
    if (fs.length && !(seen && seen.mega)) lines.push(`<div class="small" style="margin-top:4px">★ <b>Transformation:</b> ${fs.map(x => `${esc(x.name)} <span class="muted">(${esc(x.stone)})</span>`).join(', ')}</div>`);
    return lines.join('');
  };

  // ---------- replays ----------
  U.openReplay = async (rid, restart) => {
    let data;
    try { const r = await fetch('/api/replay/' + encodeURIComponent(rid)); data = await r.json(); if (!r.ok) throw new Error(data.error); }
    catch (e) { toast(e.message || 'Could not load that replay.', 4500); if (location.pathname.startsWith('/replay/')) history.replaceState(null, '', '/'); return; }
    const mid = 'r-' + rid;
    const m = { id: mid, replay: true, replayId: rid, mode: data.mode, format: data.format, phase: 'ended', you: null, created: data.created,
      players: data.players.map(name => ({ name })), result: data.winner, battle: { state: data.replay.final, log: data.replay.log, request: null } };
    S.matches[mid] = m; delete S.bat[mid];
    if (!S.open.includes(mid)) S.open.push(mid);
    const vm = clone(data.replay.start); for (const s of vm.sides) s.active = s.active.map(() => null);
    S.bat[mid] = { shown: 0, queued: 0, queue: [], playing: false, vm };
    S.tab = mid;
    if (location.pathname !== '/replay/' + rid) history.pushState(null, '', '/replay/' + rid);
    U.render();
    U.onBattlePayload(m, m);
  };
  const replayRow = (b, meName) => {
    const me = meName ? b.players.findIndex(p => p === meName) : -1;
    const res = me < 0 ? '' : b.winner === null ? '<span class="pill">Tie</span>' : b.winner === me ? '<span class="pill win">Win</span>' : '<span class="pill loss">Loss</span>';
    const teams = b.teams.map(t => `<span class="mini-team">${t.map(sp => sprite(F(sp) || { id: sp, name: sp }, 'xs')).join('')}</span>`);
    return `<div class="list-item replay-row">${res}<div class="grow"><b>${esc(b.players[0])}</b> vs <b>${esc(b.players[1])}</b> <span class="muted small">· ${esc(label(b.mode, b.format))} · ${b.turns} turns · ${new Date(b.created).toLocaleDateString()}</span><div>${teams[0]} <span class="muted small">vs</span> ${teams[1]}</div></div>${b.hasReplay ? `<button class="small" data-replay="${esc(b.id)}">▶ Watch</button>` : '<span class="muted small">no replay</span>'}</div>`;
  };


  // ---------- home page: most used shinobi today and all time ----------
  S.homeUsage = S.homeUsage || { t: 0, today: null, all: null, loading: false };
  const usageList = (d, empty) => !d ? '<div class="muted small">Loading…</div>' : !d.teams ? `<div class="muted small">${empty}</div>`
    : `<div class="usage-list">${d.rows.slice(0, 10).map((x, i) => `<div class="usage-item"><span class="rank">${i + 1}</span>${sprite(F(x.species), 'sm')}<span class="grow"><b>${esc(x.name)}</b><span class="usage-bar"><i style="width:${Math.min(100, x.usage * 100)}%"></i></span></span><span class="nums"><b>${pct(x.usage)}</b><span class="muted small">${pct(x.winRate)} wins</span></span></div>`).join('')}</div><div class="muted small" style="margin-top:6px">${d.teams} team${d.teams === 1 ? '' : 's'} brought to battle</div>`;
  U.homeUsageHtml = () => {
    const H = S.homeUsage;
    return `<div class="row"><h2 class="grow" style="margin:0">Most used shinobi</h2><a href="#" data-goto-stats class="small">Full usage stats →</a></div>
      <p class="muted small" style="margin-top:4px">Shinobi players bring into battle (CPU teams don't count). Usage is the share of teams that brought them.</p>
      <div class="usage-cols"><div><h3>Today</h3>${usageList(H.today, 'No player battles yet today. Be the first!')}</div><div><h3>All time</h3>${usageList(H.all, 'No player battles yet.')}</div></div>`;
  };
  U.loadHomeUsage = () => {
    const H = S.homeUsage;
    const link = $('[data-goto-stats]'); if (link) link.onclick = e => { e.preventDefault(); S.tab = 'stats'; U.render(); };
    if (H.loading || Date.now() - H.t < 30000) return;
    H.loading = true;
    Promise.all(['today', 'all'].map(p => fetch('/api/stats/usage?period=' + p).then(r => r.json()))).then(([today, all]) => {
      Object.assign(H, { today, all, t: Date.now(), loading: false });
      const el = $('#homeUsage'); if (el && S.tab === 'home') { el.innerHTML = U.homeUsageHtml(); U.loadHomeUsage(); }
    }).catch(() => { H.loading = false; });
  };

  // ---------- Shinobi Cards ----------
  const recordLine = r => { const w = r.wins, l = r.losses; return `${w}–${l}${r.ties ? '–' + r.ties : ''}${w + l ? ` <span class="muted">(${pct(w / (w + l))})</span>` : ''}`; };
  const RANK = Object.fromEntries((CARDCOLORS.CARD_RANKS || []).map(r => [r[0], r]));
  const rankChip = k => { const r = RANK[k]; return r ? `<div class="tc-rank" style="--rk:${r[2]}">${esc(r[1])}</div>` : ''; };
  U.cardHtml = (p, opts = {}) => {
    const avHtml = U.avatarSprite(p.avatar, 'lg');
    const team = p.favoriteTeam;
    const c = CARDCOLORS.CARD_COLORS[p.color] || CARDCOLORS.CARD_COLORS.classic;
    return `<div class="trainer-card" style="background:linear-gradient(135deg, ${c[1]}, ${c[2]} 55%, ${c[3]});border-color:${c[4]}66;--tc-accent:${c[4]}">
      <div class="tc-top"><div class="tc-avatar">${avHtml || `<div class="tc-blank">${esc(p.username[0].toUpperCase())}</div>`}</div>
        <div class="grow"><div class="tc-name">${esc(p.username)}</div>${rankChip(p.rank)}${p.title ? `<div class="tc-title">${esc(p.title)}</div>` : ''}
          <div class="muted small">${p.joined ? 'Joined ' + new Date(p.joined).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) + ' · ' : ''}${p.battles} battle${p.battles === 1 ? '' : 's'}</div></div>
        ${opts.edit ? '<button class="small" id="tcEdit">Edit card</button>' : ''}</div>
      ${p.bio ? `<div class="tc-bio">${esc(p.bio)}</div>` : ''}
      <div class="tc-stats"><div><span>vs players</span><b>${recordLine(p.record.pvp)}</b></div><div><span>All battles</span><b>${recordLine(p.record.total)}</b></div>
        <div><span>Road to 50</span><b>${p.road && p.road.best ? (p.road.clears ? `Cleared ×${p.road.clears}` : `Floor ${p.road.best}`) : '<span class="muted small">not yet</span>'}</b></div>
        <div><span>Favorite shinobi</span><b class="tc-top3">${p.top.length ? p.top.map(x => sprite(F(x.species), 'sm')).join('') : '<span class="muted small">none yet</span>'}</b></div></div>
      ${team ? `<div class="tc-team"><div class="muted small">Showcase team · <b>${esc(team.name)}</b></div><div class="tc-mons">${team.mons.map(m => `<div class="tc-mon" data-tiphtml="${esc(`<div class='tip-h'>${esc(F(m.species).name)}${m.item ? ' @ ' + esc(m.item) : ''}</div><div class='small'>${esc(renamed(m.ability))} · ${esc(m.nature)}</div><div>${m.moves.map(x => `<span class='chip'>${esc(x)}</span>`).join(' ')}</div>`)}">${sprite(F(m.species), 'sm', false, m.gender)}${m.item ? `<span class="tc-item">${esc(m.item)}</span>` : ''}</div>`).join('')}</div></div>` : ''}
    </div>`;
  };
  U.editCard = editCard;
  // avatar values: "pichu", or "pichu~F" for an alternate-gender sprite
  U.avatarSprite = (avatar, cls) => { if (!avatar) return ''; const [id, g] = String(avatar).split('~'); return S.byId[id] ? sprite(S.byId[id], cls, false, g || null) : ''; };
  U.loadMyCard = async () => { const r = await fetch('/api/profile/' + encodeURIComponent(S.account.username), { credentials: 'same-origin' }); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Could not load your Shinobi Card.'); return j; };
  U.showProfile = async name => {
    modal('<div class="muted">Loading…</div>');
    try { const r = await fetch('/api/profile/' + encodeURIComponent(name)); const p = await r.json(); if (!r.ok) throw new Error(p.error);
      modal(`${U.cardHtml(p)}<div class="row" style="margin-top:10px"><span class="grow"></span><button id="pfClose">Close</button></div>`); $('#pfClose').onclick = closeModal;
    } catch (e) { modal(`<p>${esc(e.message || 'Could not load that card.')}</p><button id="pfClose">Close</button>`); $('#pfClose').onclick = closeModal; }
  };
  document.addEventListener('click', e => { const a = e.target.closest('[data-profile]'); if (a) { e.preventDefault(); U.showProfile(a.dataset.profile); } });
  function editCard(p, opts = {}) {
    // every shinobi and Transformation form, with alternate-gender sprites right after the default one
    const alts = id => { const g = GENDER.info(id); return [...Object.keys(g.images || {}), ...Object.keys((GENDER.FORM_IMAGES || {})[id] || {})].map(sex => `${id}~${sex}`); };
    const allIds = [...S.dex.fighters.map(f => f.id), ...Object.values(S.dex.finalSmashes).map(x => x.id)].flatMap(id => [id, ...alts(id)]);
    const avName = a => { const [id, g] = a.split('~'); return S.byId[id].name + (g ? (g === 'F' ? ' (female)' : ' (male)') : ''); };
    let avatar = p.avatar; let color = p.color || 'classic';
    modal(`<h2>Edit your Shinobi Card</h2>
      <div class="field"><label>Rank</label><select id="tcR"><option value="">(no rank)</option>${(CARDCOLORS.CARD_RANKS || []).map(r => `<option value="${r[0]}" ${p.rank === r[0] ? 'selected' : ''}>${esc(r[1])}</option>`).join('')}</select></div>
      <div class="field"><label>Title</label><select id="tcT"><option value="">(no title)</option>${p.title && !(window.CARDTITLES?.CARD_TITLES || []).includes(p.title) ? `<option value="${esc(p.title)}" selected>${esc(p.title)} (current)</option>` : ''}${(window.CARDTITLES?.CARD_TITLE_GROUPS || []).map(([g, ts]) => `<optgroup label="${esc(g)}">${ts.map(t => `<option value="${esc(t)}" ${p.title === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</optgroup>`).join('')}</select></div>
      <div class="field"><label>About you</label><textarea id="tcB" maxlength="160" rows="2" class="paste" style="font-family:inherit">${esc(p.bio)}</textarea></div>
      <div class="field"><label>Showcase team</label><select id="tcF"><option value="">(none)</option>${S.elite.map((t, i) => `<option value="${i}" ${p.favoriteTeam && p.favoriteTeam.name === t.name ? 'selected' : ''}>${esc(t.name)} (${t.mons.length})</option>`).join('')}</select></div>
      <div class="field"><label>Card color</label><div class="color-swatches" id="tcColors"></div></div>
      <div class="field"><label>Avatar</label><input id="tcQ" placeholder="Search shinobi…"><div class="avatar-grid" id="tcGrid"></div></div>
      <div id="tcErr" class="err small"></div>
      <div class="row"><span class="grow"></span><button id="tcCancel">Cancel</button><button class="primary" id="tcSave">Save</button></div>`);
    const grid = () => { const q = $('#tcQ').value.toLowerCase(); $('#tcGrid').innerHTML = allIds.filter(a => !q || avName(a).toLowerCase().includes(q)).map(a => `<button class="av ${a === avatar ? 'on' : ''} ${a.includes('~') ? 'alt' : ''}" data-av="${a}" title="${esc(avName(a))}">${U.avatarSprite(a, 'sm')}${a.includes('~') ? `<span class="av-g g${a.split('~')[1]}">${GENDER.SYMBOL[a.split('~')[1]]}</span>` : ''}</button>`).join(''); $$('[data-av]').forEach(b => b.onclick = () => { avatar = b.dataset.av; grid(); }); };
    grid(); $('#tcQ').oninput = grid;
    const swatches = () => { $('#tcColors').innerHTML = Object.entries(CARDCOLORS.CARD_COLORS).map(([k, c]) => `<button class="swatch ${k === color ? 'on' : ''}" data-color="${k}" title="${esc(c[0])}" style="background:linear-gradient(135deg, ${c[1]}, ${c[3]});border-color:${c[4]}"><span style="background:${c[4]}"></span><em>${esc(c[0])}</em></button>`).join(''); $$('[data-color]').forEach(b => b.onclick = () => { color = b.dataset.color; swatches(); }); };
    swatches();
    $('#tcCancel').onclick = () => { closeModal(); if (opts.after) opts.after(); };
    $('#tcSave').onclick = async () => {
      const fav = $('#tcF').value;
      const r = await fetch('/api/account/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ color, avatar, rank: $('#tcR').value || null, title: $('#tcT').value, bio: $('#tcB').value, favoriteTeam: fav === '' ? null : +fav }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { $('#tcErr').textContent = j.error || 'Could not save your card.'; return; }
      closeModal(); toast('Shinobi Card saved.'); if (S.tab === 'stats') U.renderStats(); if (opts.after) opts.after();
    };
  }

  // ---------- stats tab: your record, usage, recent replays ----------
  S.statsView = S.statsView || { format: '', days: 30 };
  U.renderStats = async () => {
    const v = S.statsView;
    $('#view').innerHTML = `<div class="stats-page">${S.account ? '<section class="card" id="stCard"><div class="muted">Loading your Shinobi Card…</div></section>' : ''}<section class="card" id="stMe"><h2>Your record</h2><div class="muted">Loading…</div></section>
      <section class="card"><div class="row"><h2 class="grow" style="margin:0">Shinobi usage</h2>
        <select id="stFmt"><option value="">All formats</option><option value="singles">Singles</option><option value="doubles">Doubles</option></select>
        <select id="stDays"><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option></select></div>
        <p class="muted small">How often each shinobi is brought into battle by players (not the CPU), and how often those teams win.</p><div id="stUsage" class="muted">Loading…</div></section>
      <section class="card"><h2>Recent player battles</h2><div id="stRecent" class="muted">Loading…</div></section></div>`;
    $('#stFmt').value = v.format; $('#stDays').value = String(v.days);
    $('#stFmt').onchange = e => { v.format = e.target.value; U.renderStats(); };
    $('#stDays').onchange = e => { v.days = e.target.value; U.renderStats(); };
    const get = u => fetch(u, { credentials: 'same-origin' }).then(async r => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }));
    const [me, usage, recent] = await Promise.all([get('/api/stats/me'), get(`/api/stats/usage?period=${v.days}${v.format ? '&format=' + v.format : ''}`), get('/api/replays/recent')]);
    if (S.tab !== 'stats') return;
    if (S.account && $('#stCard')) {
      const c = await get('/api/profile/' + encodeURIComponent(S.account.username));
      if (S.tab !== 'stats') return;
      $('#stCard').innerHTML = c.ok ? `<h2>Your Shinobi Card</h2>${U.cardHtml(c.data, { edit: true })}<p class="muted small">Other players see this when they tap your name in the Online list.</p>` : '<div class="muted">Could not load your card.</div>';
      const ed = $('#tcEdit'); if (ed) ed.onclick = () => editCard(c.data);
    }
    const meEl = $('#stMe');
    if (!me.ok) meEl.innerHTML = `<h2>Your record</h2><p class="muted">${me.status === 401 ? 'Sign in to keep a record of your battles, your most-used shinobi and your replays.' : esc(me.data.error || 'Could not load your record.')}</p>${me.status === 401 ? '<button class="primary" data-signin>Sign in</button>' : ''}`;
    else {
      const r = me.data.record; const games = r.total.wins + r.total.losses + r.total.ties;
      const rate = (w, l) => w + l ? pct(w / (w + l)) : '—';
      meEl.innerHTML = `<h2>${esc(me.data.username)}'s record</h2>
        <div class="record-big"><div><b>${r.total.wins}</b><span>Wins</span></div><div><b>${r.total.losses}</b><span>Losses</span></div><div><b>${r.total.ties}</b><span>Ties</span></div><div><b>${rate(r.total.wins, r.total.losses)}</b><span>Win rate</span></div><div><b>${rate(r.pvp.wins, r.pvp.losses)}</b><span>vs players</span></div></div>
        ${games ? `<table class="tbl"><tr><th>Mode</th><th>Opponent</th><th>W</th><th>L</th><th>T</th><th>Win rate</th></tr>${r.groups.sort((a, b) => (a.mode + a.format + a.vsCpu).localeCompare(b.mode + b.format + b.vsCpu)).map(g => `<tr><td>${esc(label(g.mode, g.format))}</td><td>${g.vsCpu ? 'CPU' : 'Players'}</td><td>${g.wins}</td><td>${g.losses}</td><td>${g.ties}</td><td>${rate(g.wins, g.losses)}</td></tr>`).join('')}</table>
        <h3>Your most-used shinobi</h3><div class="fighter-usage">${me.data.fighters.map(x => `<div class="list-item">${sprite(F(x.species), 'sm')}<span class="grow">${esc(x.name)}</span><span class="muted small">${x.games} battle${x.games === 1 ? '' : 's'} · ${pct(x.wins / x.games)} wins</span></div>`).join('')}</div>
        <h3>Your recent battles</h3>${me.data.recent.map(b => replayRow(b, me.data.username)).join('')}` : '<p class="muted">No finished battles yet. Your wins and losses show up here once you play.</p>'}`;
    }
    const uEl = $('#stUsage');
    if (!usage.ok) uEl.textContent = 'Could not load usage stats.';
    else if (!usage.data.teams) uEl.innerHTML = '<p class="muted">No player battles in this period yet.</p>';
    else uEl.innerHTML = `<p class="small muted">${usage.data.teams} team${usage.data.teams === 1 ? '' : 's'} brought to battle.</p><table class="tbl usage"><tr><th>#</th><th>Shinobi</th><th>Usage</th><th>Win rate</th><th>Battles</th></tr>${usage.data.rows.map((x, i) => `<tr><td>${i + 1}</td><td><span class="row" style="gap:6px">${sprite(F(x.species), 'xs')}${esc(x.name)}</span></td><td><div class="bar"><i style="width:${Math.min(100, x.usage * 100)}%"></i><span>${pct(x.usage)}</span></div></td><td>${pct(x.winRate)}</td><td>${x.games}</td></tr>`).join('')}</table>`;
    const rEl = $('#stRecent');
    rEl.innerHTML = recent.ok && recent.data.battles.length ? recent.data.battles.map(b => replayRow(b)).join('') : '<p class="muted">No player-vs-player battles yet.</p>';
    $$('[data-replay]').forEach(b => b.onclick = () => U.openReplay(b.dataset.replay));
  };

  // ---------- damage calculator ----------
  const NATURE_LIST = () => Object.keys(S.dex.natures).sort();
  const baseFighters = () => S.dex.fighters.slice().sort((a, b) => a.name.localeCompare(b.name));
  function freshSide(species, move) {
    const f = S.byId[species];
    return { species, ability: f.abilities[0].name, nature: 'Hardy', item: '', ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, status: '', hpPct: 100, finalSmash: false, move: move || f.signature[0].move };
  }
  S.calc = S.calc || { a: null, d: null, field: { weather: '', reflect: false, lightscreen: false, crit: false, spread: false } };
  function sideForm(key, x, isAtk) {
    const f = S.byId[x.species];
    const abilities = [...f.abilities, f.hidden].map(a => a.name).filter((n, i, a) => a.indexOf(n) === i);
    const stones = fsOf(f.id).map(s => s.stone);
    const items = Object.keys(S.dex.items).filter(i => !(S.dex.finalSmashes || {})[i]).concat(stones);
    const opt = (list, sel, labelOf = v => v) => list.map(v => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(labelOf(v))}</option>`).join('');
    const nat = S.dex.natures;
    const fsForm = x.finalSmash && (S.dex.finalSmashes || {})[x.item];
    const shown = fsForm ? S.byId[fsForm.id] : f;
    const moves = f.learnset.slice().sort();
    return `<div class="calc-side" data-side="${key}">
      <div class="row">${sprite(shown, 'sm')}<h2 class="grow" style="margin:0">${isAtk ? 'Attacker' : 'Defender'}</h2>${S.roster.length ? `<select data-k="roster"><option value="">Load from roster…</option>${S.roster.map(r => `<option value="${r.uid}">${esc(F(r.species).name)} · ${esc(r.nature)}</option>`).join('')}</select>` : ''}</div>
      <div class="calc-grid">
        <label>Shinobi<select data-k="species">${opt(baseFighters().map(b => b.id), x.species, id => S.byId[id].name)}</select></label>
        ${isAtk ? `<label>Move<select data-k="move">${opt(moves, x.move, n => { const m = S.dex.moves[n]; return `${n} · ${m.type} ${m.cat === 'Status' ? 'Status' : (m.power || '—')}`; })}</select></label>` : `<label>HP %<input type="number" min="1" max="100" data-k="hpPct" value="${x.hpPct}"></label>`}
        <label>Ability<select data-k="ability">${opt(abilities, x.ability)}</select></label>
        <label>Nature<select data-k="nature">${opt(NATURE_LIST(), x.nature, n => nat[n].plus ? `${n} (+${SL[nat[n].plus]} −${SL[nat[n].minus]})` : n)}</select></label>
        <label>Item<select data-k="item"><option value="">(none)</option>${opt(items, x.item)}</select></label>
        <label>Status<select data-k="status">${opt(['', 'brn', 'par', 'psn', 'tox', 'slp', 'frz'], x.status, s => ({ '': 'Healthy', brn: 'Burned', par: 'Paralyzed', psn: 'Poisoned', tox: 'Badly poisoned', slp: 'Asleep', frz: 'Frozen' })[s])}</select></label>
      </div>
      ${stones.includes(x.item) ? `<label class="check"><input type="checkbox" data-k="finalSmash" ${x.finalSmash ? 'checked' : ''}> Transform into Transformation (${esc(fsForm ? fsForm.name : (S.dex.finalSmashes[x.item] || {}).name || '')})</label>` : ''}
      <div class="calc-ivs"><span class="muted small">IVs</span>${STATS.map(s => `<label>${SL[s]}<input type="number" min="0" max="31" data-iv="${s}" value="${x.ivs[s]}"></label>`).join('')}</div>
      <div class="calc-ivs"><span class="muted small">Boosts</span>${['atk', 'def', 'spa', 'spd', 'spe'].map(s => `<label>${SL[s]}<select data-boost="${s}">${[6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6].map(n => `<option value="${n}" ${x.boosts[s] === n ? 'selected' : ''}>${n > 0 ? '+' + n : n}</option>`).join('')}</select></label>`).join('')}</div>
    </div>`;
  }
  let calcSeq = 0;
  U.renderCalc = () => {
    const C = S.calc;
    if (!C.a) C.a = freshSide('naruto-p1'); if (!C.d) C.d = freshSide('sasuke-p1');
    const fl = C.field;
    $('#view').innerHTML = `<section class="card calc"><div class="row"><h2 class="grow" style="margin:0">Damage calculator</h2><button class="small" id="cSwap">⇄ Swap sides</button></div>
      <p class="muted small">Level 50, using the same damage formula as battles. Damage varies between the lowest and highest roll.</p>
      <div id="cResult" class="calc-result muted">Calculating…</div>
      <div class="calc-sides">${sideForm('a', C.a, true)}${sideForm('d', C.d, false)}</div>
      <div class="row calc-field"><b>Field</b>
        <label>Weather <select id="cW"><option value="">None</option><option value="sun">Sun</option><option value="rain">Rain</option><option value="snow">Snow</option></select></label>
        <label class="check"><input type="checkbox" id="cRef" ${fl.reflect ? 'checked' : ''}> Reflect</label>
        <label class="check"><input type="checkbox" id="cLS" ${fl.lightscreen ? 'checked' : ''}> Light Screen</label>
        <label class="check"><input type="checkbox" id="cCrit" ${fl.crit ? 'checked' : ''}> Critical hit</label>
        <label class="check"><input type="checkbox" id="cSpread" ${fl.spread ? 'checked' : ''}> Doubles (spread moves 0.75×)</label></div></section>`;
    $('#cW').value = fl.weather;
    const rerun = () => runCalc();
    $('#cW').onchange = e => { fl.weather = e.target.value; rerun(); };
    for (const [id, k] of [['cRef', 'reflect'], ['cLS', 'lightscreen'], ['cCrit', 'crit'], ['cSpread', 'spread']]) $('#' + id).onchange = e => { fl[k] = e.target.checked; rerun(); };
    $('#cSwap').onclick = () => { const a = C.a, d = C.d; C.a = Object.assign(freshSide(d.species), d, { move: S.byId[d.species].signature[0].move }); C.d = Object.assign({}, a, { hpPct: 100 }); delete C.d.move; U.renderCalc(); };
    for (const key of ['a', 'd']) {
      const box = $(`[data-side="${key}"]`); const x = C[key];
      box.querySelectorAll('[data-k]').forEach(el => el.onchange = () => {
        const k = el.dataset.k;
        if (k === 'species') { C[key] = Object.assign(freshSide(el.value), key === 'd' ? { hpPct: x.hpPct } : {}); return U.renderCalc(); }
        if (k === 'roster') { const r = U.rosterById(el.value); if (!r) return; C[key] = Object.assign(freshSide(r.species), { nature: r.nature, ability: renamed(r.ability), ivs: Object.assign({}, r.ivs) }); return U.renderCalc(); }
        if (k === 'finalSmash') x.finalSmash = el.checked;
        else if (k === 'hpPct') x.hpPct = Math.max(1, Math.min(100, +el.value || 100));
        else x[k] = el.value;
        if (k === 'item' && !(S.dex.finalSmashes || {})[x.item]) x.finalSmash = false;
        if (['item', 'finalSmash'].includes(k)) return U.renderCalc();
        rerun();
      });
      box.querySelectorAll('[data-iv]').forEach(el => el.onchange = () => { x.ivs[el.dataset.iv] = Math.max(0, Math.min(31, +el.value || 0)); rerun(); });
      box.querySelectorAll('[data-boost]').forEach(el => el.onchange = () => { x.boosts[el.dataset.boost] = +el.value; rerun(); });
    }
    rerun();
  };
  async function runCalc() {
    const C = S.calc; const seq = ++calcSeq;
    let r;
    try { const res = await fetch('/api/calc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attacker: C.a, defender: C.d, field: C.field }) }); r = await res.json(); }
    catch { r = { error: 'Could not reach the server.' }; }
    if (seq !== calcSeq || S.tab !== 'calc') return;
    const el = $('#cResult'); if (!el) return;
    if (r.error) { el.innerHTML = `<span class="err">${esc(r.error)}</span>`; return; }
    const effTxt = r.eff === undefined ? '' : r.eff === 0 ? 'No effect' : r.eff > 1 ? `Super effective (${r.eff}×)` : r.eff < 1 ? `Not very effective (${r.eff}×)` : '';
    const barMax = Math.min(100, r.maxPct || 0), barMin = Math.min(100, r.minPct || 0);
    el.classList.remove('muted');
    el.innerHTML = `<div class="calc-line"><b>${esc(r.attacker)}</b> ${esc(r.move)} vs <b>${esc(r.defender)}</b>${r.crit ? ' (critical hit)' : ''}</div>
      ${r.max ? `<div class="calc-big">${r.minPct}% – ${r.maxPct}% <span class="muted small">(${r.min}–${r.max} of ${r.defMaxHp} HP)</span></div>
      <div class="calc-bar"><i class="max" style="width:${barMax}%"></i><i class="min" style="width:${barMin}%"></i></div>
      <div><b>${esc(r.ko)}</b>${effTxt ? ` · <span class="muted">${esc(effTxt)}</span>` : ''}</div>` : `<div class="calc-big">0%</div>`}
      ${r.note ? `<div class="muted small">${esc(r.note)}</div>` : ''}
      <div class="muted small" style="margin-top:4px">Stats: ${esc(r.attacker)} ${STATS.map(s => `${SL[s]} ${r.stats.attacker[s]}`).join(' / ')} · ${esc(r.defender)} ${STATS.map(s => `${SL[s]} ${r.stats.defender[s]}`).join(' / ')}</div>`;
  }

  // ---------- Showdown-style team import / export ----------
  function exportText(t) {
    return t.mons.map(m => {
      const b = U.rosterById(m.uid); if (!b) return '';
      const f = F(b.species);
      const g = m.gender || b.gender;
      const lines = [`${f.name}${GENDER.info(f.id).type === 'X' && (g === 'M' || g === 'F') ? ` (${g})` : ''}${m.item ? ' @ ' + m.item : ''}`, `Ability: ${renamed(b.ability)}`, 'Level: 50', `${b.nature} Nature`];
      const ivs = STATS.filter(s => b.ivs[s] !== 31).map(s => `${b.ivs[s]} ${SL[s]}`);
      if (ivs.length) lines.push('IVs: ' + ivs.join(' / '));
      for (const mv of m.moves.filter(Boolean)) lines.push('- ' + mv);
      return lines.join('\n');
    }).filter(Boolean).join('\n\n');
  }
  U.exportTeam = t => {
    const text = exportText(t);
    modal(`<h2>Export "${esc(t.name)}"</h2><p class="muted small">Showdown-style text. Share it, or import it into another account that has these shinobi.</p>
      <textarea id="exTxt" class="paste" rows="16" readonly>${esc(text)}</textarea>
      <div class="row" style="margin-top:8px"><span class="grow"></span><button id="exCopy" class="primary">Copy</button><button id="exClose">Close</button></div>`);
    $('#exClose').onclick = closeModal;
    $('#exCopy').onclick = () => { $('#exTxt').select(); (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('Team copied.'), () => { document.execCommand('copy'); toast('Team copied.'); }); };
  };
  function parseTeam(text) {
    const blocks = String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    const byName = {}; for (const f of S.dex.fighters) { byName[f.name.toLowerCase()] = f; byName[f.id] = f; }
    return blocks.map(block => {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
      let [head, item] = lines[0].split(' @ ').map(x => x && x.trim());
      const gm = head.match(/\s*\((M|F)\)\s*$/); const gender = gm ? gm[1] : null;
      head = head.replace(/\s*\((M|F)\)\s*$/, '');
      const nick = head.match(/^(.*)\(([^()]+)\)\s*$/);
      const f = byName[head.toLowerCase()] || (nick && (byName[nick[2].trim().toLowerCase()] || byName[nick[1].trim().toLowerCase()]));
      const out = { raw: lines[0], fighter: f, item: item || '', ability: null, nature: null, ivs: null, moves: [], gender };
      for (const l of lines.slice(1)) {
        let mm;
        if ((mm = l.match(/^Gender:\s*([MF])/i))) out.gender = mm[1].toUpperCase();
        else if ((mm = l.match(/^Ability:\s*(.+)$/i))) out.ability = mm[1].trim();
        else if ((mm = l.match(/^(\w+)\s+Nature$/i))) out.nature = mm[1][0].toUpperCase() + mm[1].slice(1).toLowerCase();
        else if ((mm = l.match(/^IVs:\s*(.+)$/i))) { out.ivs = {}; for (const part of mm[1].split('/')) { const p = part.trim().match(/^(\d+)\s+(\w+)$/); if (p) { const k = Object.keys(SL).find(s => SL[s].toLowerCase() === p[2].toLowerCase()); if (k) out.ivs[k] = +p[1]; } } }
        else if ((mm = l.match(/^[-~]\s*(.+)$/))) out.moves.push(mm[1].replace(/\s*\[.*\]$/, '').trim());
      }
      return out;
    });
  }
  U.importTeam = () => {
    modal(`<h2>Import a team</h2><p class="muted small">Paste a team in Showdown format. Each shinobi is matched to one in your roster (the closest nature, ability and IVs), so you need those shinobi from the Battle Pass.</p>
      <textarea id="imTxt" class="paste" rows="16" placeholder="Kazuya @ Devil Gene&#10;Ability: King of Iron Fist&#10;Adamant Nature&#10;- Close Combat&#10;- Thunder Punch&#10;..."></textarea>
      <div id="imMsg" class="small"></div>
      <div class="row" style="margin-top:8px"><input id="imName" class="grow" maxlength="40" placeholder="Team name" value="Imported team"><button id="imGo" class="primary">Import</button><button id="imClose">Cancel</button></div>`);
    $('#imClose').onclick = closeModal;
    $('#imGo').onclick = () => {
      const sets = parseTeam($('#imTxt').value);
      if (!sets.length) { $('#imMsg').innerHTML = '<span class="err">Paste a team first.</span>'; return; }
      const used = new Set(); const mons = []; const notes = [];
      for (const s of sets.slice(0, 6)) {
        if (!s.fighter) { notes.push(`Skipped "${esc(s.raw)}": no shinobi by that name.`); continue; }
        const f = s.fighter;
        const options = S.roster.filter(r => r.species === f.id && !used.has(r.uid));
        if (!options.length) { notes.push(`Skipped ${esc(f.name)}: ${S.roster.some(r => r.species === f.id) ? 'already used in this team' : 'not in your roster'}.`); continue; }
        const score = r => (s.ability && renamed(r.ability).toLowerCase() === renamed(s.ability).toLowerCase() ? 2 : 0) + (s.nature && r.nature === s.nature ? 2 : 0) + (s.ivs ? STATS.filter(k => (s.ivs[k] ?? 31) === r.ivs[k]).length / 2 : 0) + STATS.reduce((a, k) => a + r.ivs[k], 0) / 1000;
        const pickR = options.sort((a, b) => score(b) - score(a))[0];
        used.add(pickR.uid);
        const moves = []; for (const mv of s.moves) { const real = f.learnset.find(n => n.toLowerCase() === mv.toLowerCase()); if (real && !moves.includes(real)) moves.push(real); else notes.push(`${esc(f.name)} can't learn ${esc(mv)}, so it was left out.`); }
        let item = s.item;
        if (item) { const known = Object.keys(S.dex.items).find(i => i.toLowerCase() === item.toLowerCase()); const fsItem = known && (S.dex.finalSmashes || {})[known]; if (!known || (fsItem && !fsItem.bases.includes(f.id))) { notes.push(`${esc(item)} isn't an item ${esc(f.name)} can hold here, so it was left off.`); item = ''; } else item = known; }
        if (s.nature && pickR.nature !== s.nature) notes.push(`${esc(f.name)}: using your ${esc(pickR.nature)} one (no ${esc(s.nature)} ${esc(f.name)} in your roster).`);
        if (s.gender && GENDER.info(f.id).type !== 'X' && s.gender !== GENDER.defaultGender(f.id)) notes.push(`${esc(f.name)} is always ${GENDER.label(f.id).toLowerCase()}, so the gender was ignored.`);
        mons.push({ uid: pickR.uid, moves: moves.length ? moves.slice(0, 4) : f.signature.slice(0, 4).map(x => x.move), item, gender: GENDER.normalize(f.id, s.gender || pickR.gender) });
      }
      const items = mons.map(m => m.item).filter(Boolean); const dup = items.find((x, i) => items.indexOf(x) !== i);
      if (dup) notes.push(`${esc(dup)} is on more than one shinobi. Item clause allows one of each, so change one before battling.`);
      if (!mons.length) { $('#imMsg').innerHTML = `<span class="err">Nothing could be imported.</span><br>${notes.join('<br>')}`; return; }
      S.elite.push({ name: ($('#imName').value || 'Imported team').slice(0, 40), mons });
      S.editElite = S.elite.length - 1; S.eliteSlot = 0; U.saveRoster();
      closeModal(); U.renderElite();
      if (notes.length) modal(`<h2>Imported ${mons.length} of ${sets.length} shinobi</h2><p class="small">${notes.join('<br>')}</p><div class="row"><span class="grow"></span><button class="primary" id="imOk">OK</button></div>`), $('#imOk').onclick = closeModal;
      else toast(`Imported ${mons.length} shinobi.`);
    };
  };
  window.addEventListener('popstate', () => { const rp = location.pathname.match(/^\/replay\/([a-z0-9]+)/i); if (rp) U.openReplay(rp[1]); else if (S.matches[S.tab] && S.matches[S.tab].replay) { S.tab = 'home'; U.render(); } });
})();
