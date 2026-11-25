/* Shinobi-mon client */
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const SL = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
  const BOOSTL = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', accuracy: 'Acc', evasion: 'Eva' };
  const STATUSL = { brn: 'BRN', par: 'PAR', psn: 'PSN', tox: 'TOX', slp: 'SLP', frz: 'FRZ' };
  const LEVEL = 50;

  // ---------- browser storage ----------
  function load(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  let clientId = load('ssbu-client', null);
  if (!clientId) { clientId = Math.random().toString(36).slice(2) + Date.now().toString(36); store('ssbu-client', clientId); }

  const S = {
    dex: null, byId: {}, me: { id: null, name: '' }, lobby: { users: [], matches: [] }, lobbyChat: [],
    tab: location.pathname.startsWith('/animations') ? 'anims' : 'home', matches: {}, open: [], unread: {}, searching: null, outgoing: null,
    mode: 'standard',   // Competitive (Battle Pass rosters) comes later
    format: load('ssbu-format', 'singles'),
    roster: load('ssbu-roster', []), elite: load('ssbu-elite', []), selElite: load('ssbu-sel-elite', 0),
    pass: null, passSel: new Set(), editElite: null, eliteSlot: 0, dexFilter: '',
    draft: {}, builds: {}, lineups: {}, turn: {}, room: null,
    account: null, dataVersion: 0, accountReady: false,
  };
  // Signed in: roster and Strike Squads are saved to the account (any device). Guest: saved in this browser.
  let saveTimer = null;
  const accountData = () => ({ roster: S.roster, elite: S.elite, selElite: S.selElite });
  function adoptAccountData(r) { S.roster = r.data.roster; S.elite = r.data.elite; S.selElite = r.data.selElite; S.dataVersion = r.version; }
  function pushAccountData() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => socket.emit('data:save', { data: accountData(), version: S.dataVersion }, res => {
      if (!res || res.error) return toast((res && res.error) || 'Could not save to your account.');
      if (res.conflict) { adoptAccountData(res); toast('Your teams changed on another device, so this page was updated to match.', 4000); render(); return; }
      S.dataVersion = res.version;
    }), 400);
  }
  const saveRoster = () => {
    if (S.account) return pushAccountData();
    store('ssbu-roster', S.roster); store('ssbu-elite', S.elite); store('ssbu-sel-elite', S.selElite);
  };

  // ---------- helpers ----------
  const typeChip = t => `<span class="type" style="background:var(--t-${t})">${t}</span>`;
  // Which picture to show for a shinobi. Hand-drawn sprites (public/sprites/, see tools/process_sprites.py)
  // are only used for shinobi standing on the battlefield (sprite class "battle"); everywhere else
  // (Shinobidex, Shinobi Cards, menus, team builder) keeps the official art in public/images/.
  //   back = true: the player's own shinobi in battle (back view; the original image is mirrored)
  //   gender: picks the alternate-gender art when that gender has its own
  const USE_DRAWN_BACKS = true;
  function spriteSrc(full, back, gender) {
    const drawn = S.drawn || new Set(); const id = full.id;
    const sex = gender === 'F' ? 'female' : gender === 'M' ? 'male' : null;
    const nonDefault = sex && window.GENDER && GENDER.image(id, gender, null);   // this gender has its own original art
    const pick = view => (sex && drawn.has(`${id}_${sex}_${view}`) && `${id}_${sex}_${view}`) || (!nonDefault && drawn.has(`${id}_${view}`) && `${id}_${view}`) || null;
    // For now back views always use the front drawing mirrored; flip to true to use *_back drawings again.
    if (back && USE_DRAWN_BACKS) { const b = pick('back'); if (b) return { url: `/sprites/${b}.png`, flip: false, drawn: true }; }
    const fr = pick('front');
    if (fr) return { url: `/sprites/${fr}.png`, flip: back, drawn: true, h: (S.drawnH || {})[fr] || 0.9, hover: ((S.drawnH || {})._hover || []).includes(fr) };
    const img = gender && window.GENDER ? GENDER.image(id, gender, full.image) : full.image;
    return { url: `/images/${encodeURIComponent(img)}`, flip: back, drawn: false };
  }
  function hasDrawn(f) { const d = S.drawn || new Set(); return d.has(`${f.id}_front`); }
  function officialSrc(full, flip, gender) {
    const img = gender && window.GENDER ? GENDER.image(full.id, gender, full.image) : full.image;
    return { url: `/images/${encodeURIComponent(img)}`, flip, drawn: false };
  }
  function sprite(f, cls = '', flip = false, gender = null) {
    const full = f && (f.image !== undefined ? f : (S.byId[f.id] || f));
    const drawnOnly = full && !full.image && hasDrawn(full);   // a form with no official art shows its battle sprite
    if (!full || (!full.image && !drawnOnly)) return badge(full || f, cls.replace('battle', 'lg'));
    const src = cls.split(' ').includes('battle') || drawnOnly ? spriteSrc(full, flip, gender) : officialSrc(full, flip, gender);
    // back view of a drawn sprite: --h (how tall the shinobi stands in its sprite) lets the CSS crop the same share of everyone
    const hv = src.drawn && src.flip && src.h ? ` style="--h:${src.h}"` : '';
    return `<div class="sprite ${cls}${src.drawn ? ' drawn' : ''}${src.hover ? ' hover' : ''}"${hv} title="${esc(full.name)}"><img src="${src.url}" alt="${esc(full.name)}" draggable="false"${src.flip ? ' class="flip"' : ''}></div>`;
  }
  const gsym = g => g === 'M' || g === 'F' ? `<span class="gsym g${g}" title="${g === 'M' ? 'Male' : 'Female'}">${GENDER.SYMBOL[g]}</span>` : '';
  function badge(f, cls = '', gender = null) {
    if (!f) return `<div class="badge ${cls}">?</div>`;
    if ((f.image || hasDrawn(f)) && !cls.includes('nobadge')) return sprite(f, cls, false, gender);
    const t = f.types || ['Normal'];
    const sub = f.name.match(/\((.*?)\)/);
    const words = f.name.replace(/\(.*?\)/g, '').replace(/[^A-Za-z0-9 &.]/g, '').split(/[\s&.]+/).filter(Boolean);
    const ini = sub ? words[0][0] + sub[1][0] : words.map(w => w[0]).join('').slice(0, 2);
    return `<div class="badge ${cls}" style="--c1:var(--t-${t[0]});--c2:var(--t-${t[1] || t[0]})" title="${esc(f.name)}">${esc(ini.toUpperCase())}</div>`;
  }
  const hpColor = p => p > 50 ? 'var(--good)' : p > 20 ? 'var(--warn)' : 'var(--bad)';
  function toast(msg, ms = 2800) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add('hidden'), ms); }
  function modal(html) { $('#modalCard').innerHTML = html; $('#modal').classList.remove('hidden'); }
  function closeModal() { $('#modal').classList.add('hidden'); $('#modalCard').innerHTML = ''; }
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  const F = id => S.byId[id];
  const label = (mode, format) => `${mode === 'elite' ? 'Competitive' : 'Quick Match'} ${format === 'doubles' ? 'Doubles' : 'Singles'}`;
  function statsOf(b) { const f = F(b.species); const o = {}; for (const s of STATS) o[s] = DEX.calcStat(s, f.stats[s], b.ivs[s], 0, LEVEL, b.nature); return o; }
  function natureTag(n) { const x = S.dex.natures[n] || {}; return x.plus ? `${n} <span class="muted">(+${SL[x.plus]} −${SL[x.minus]})</span>` : `${n} <span class="muted">(neutral)</span>`; }
  function abilityInfo(f, name) { name = (S.dex.renamed || {})[name] || name; const a = [...f.abilities, f.hidden].find(x => x.name === name) || { name, desc: '' }; return { ...a, hidden: f.hidden.name === name }; }
  function ivTotal(b) { return STATS.reduce((a, s) => a + b.ivs[s], 0); }
  function ivGrade(b) { const t = ivTotal(b); return t >= 160 ? 'S' : t >= 130 ? 'A' : t >= 100 ? 'B' : t >= 70 ? 'C' : 'D'; }

  function finalSmashChip(f) {
    const list = Object.values(S.dex.finalSmashes || {}).filter(x => x.bases.includes(f.id));
    return list.length ? `<div class="fs-chip" title="Hold ${list.map(x => x.stone).join(' or ')} to use it">★ Transformation: ${list.map(x => esc(x.name)).join(' / ')}</div>` : '';
  }
  // A compact card for a randomized shinobi (draft pool, pass roll, roster)
  function fighterCard(b, opts = {}) {
    const f = F(b.species); const st = statsOf(b); const ab = abilityInfo(f, b.ability); const nat = S.dex.natures[b.nature] || {};
    const g = opts.gender || b.gender || GENDER.defaultGender(f.id);
    return `<div class="fcard ${opts.sel ? 'sel' : ''} ${opts.dim ? 'dim' : ''}" ${opts.attr || ''}>
      ${opts.order ? `<span class="order">${opts.order}</span>` : ''}
      <div class="row">${badge(f, '', g)}<div class="grow"><div class="nm">${esc(f.name)} ${gsym(g)}</div><div>${f.types.map(typeChip).join(' ')}</div></div><span class="grade g-${ivGrade(b)}" title="IV total ${ivTotal(b)}/186">${ivGrade(b)}</span></div>
      <div class="fmeta"><b>${esc(ab.name)}</b>${ab.hidden ? ' <span class="pill">Hidden</span>' : ''}<div class="muted small">${esc(ab.desc)}</div></div>
      <div class="fmeta small">${natureTag(b.nature)}</div>
      ${finalSmashChip(f)}
      <div class="ivgrid">${STATS.map(s => `<span class="${nat.plus === s ? 'plus' : nat.minus === s ? 'minus' : ''}">${SL[s]}</span><b>${st[s]}</b><i title="IV">${b.ivs[s]}</i>`).join('')}</div>
      ${opts.extra || ''}</div>`;
  }

  // ---------- sockets ----------
  const socket = io();
  socket.on('connect', () => socket.emit('hello', { clientId, name: load('ssbu-name', '') }));
  socket.on('welcome', d => {
    S.me = { id: d.id, name: d.name }; if (!d.account) store('ssbu-name', d.name);
    if (d.chat) S.lobbyChat = d.chat; if (d.pass) S.pass = d.pass;
    if ('account' in d) onAccount(d.account || null);
    // invite link: /?room=CODE joins that room (once per page load)
    const inv = new URLSearchParams(location.search).get('room');
    if (inv && !S.room && !S.triedInvite) { S.triedInvite = true; socket.emit('room:join', { code: inv }, r => { if (r && r.error) { toast(r.error, 5000); history.replaceState(null, '', '/'); } }); }
    $('#nameBtn').textContent = (S.account ? '● ' : '') + d.name; $('#nameBtn').title = S.account ? 'Your account' : 'Change your name or sign in'; $('#signInBtn').classList.toggle('hidden', !!S.account);
    render();
  });
  socket.on('data:changed', () => { if (S.account) socket.emit('data:load', {}, r => { if (r && !r.error) { adoptAccountData(r); render(); } }); });
  function onAccount(acct) {
    const was = S.account && S.account.id;
    S.account = acct;
    if (!acct) { if (was) { S.roster = load('ssbu-roster', []); S.elite = load('ssbu-elite', []); S.selElite = load('ssbu-sel-elite', 0); } S.accountReady = true; return; }
    if (was === acct.id && S.accountReady) return;
    S.accountReady = false;
    // first time this browser signs in: bring its guest roster, teams and today's Battle Pass rolls along
    const guest = { roster: load('ssbu-roster', []), elite: load('ssbu-elite', []), selElite: load('ssbu-sel-elite', 0) };
    socket.emit('data:import', { data: guest, guestId: clientId }, r => {
      if (!r || r.error) { toast((r && r.error) || 'Could not load your account.'); return; }
      adoptAccountData(r); if (r.pass && !r.pass.error) S.pass = r.pass;
      const moved = guest.roster.length + guest.elite.length;
      store('ssbu-roster', []); store('ssbu-elite', []); store('ssbu-sel-elite', 0);
      S.accountReady = true;
      if (moved) toast(`Moved this browser's roster and teams into your account.`, 3500);
      render();
    });
  }
  socket.on('lobby', d => { S.lobby = d; if (S.tab === 'home') renderHome(); });
  socket.on('chat', ({ room, msg }) => { if (room === 'lobby') S.lobbyChat.push(msg); });
  // private rooms (screen in rooms.js)
  socket.on('room', r => {
    if (r) r.nextAt = r.nextIn !== null ? Date.now() + r.nextIn : null;   // countdown in this browser's clock
    const had = S.room; S.room = r;
    if (!r && S.tab === 'room') S.tab = 'home';
    if (r && !had && !S.matches[S.tab]) S.tab = 'room';
    if (r) history.replaceState(null, '', '/?room=' + r.code); else if (/[?&]room=/.test(location.search)) history.replaceState(null, '', '/');
    if (S.tab === 'room') SSBU.renderRoom(); else renderTabs();
  });
  socket.on('roomKicked', () => toast('The host removed you from the room.', 4000));
  socket.on('match', m => {
    const isNew = !S.matches[m.id];
    // a new battle in your room: close the room's finished battles you only watched or already played
    if (isNew && m.room) for (const id of [...S.open]) { const o = S.matches[id]; if (o && o.room === m.room && o.phase === 'ended') { S.open = S.open.filter(x => x !== id); delete S.matches[id]; if (S.tab === id) S.tab = 'room'; } }
    const prev = S.matches[m.id];
    S.matches[m.id] = m;
    if (!S.open.includes(m.id)) S.open.push(m.id);
    if (prev && prev.phase !== m.phase) { delete S.turn[m.id]; }
    if (prev && prev.battle && m.battle && prev.battle.state.turn !== m.battle.state.turn) delete S.turn[m.id];
    if (m.battle) SSBU.onBattlePayload(m, prev);
    // room spectators only jump to the battle if they're looking at the room (not mid-way through something else)
    const jump = !(m.room && m.you === null) || S.tab === 'room' || S.matches[S.tab];
    if (isNew && m.phase !== 'ended' && jump) { S.tab = m.id; S.searching = null; if (m.you !== null) closeModal(); render(); return; }
    if (isNew) { S.unread[m.id] = true; renderTabs(); return; }
    if (S.tab === m.id) { if (!(m.battle && SSBU.isPlaying(m.id))) renderMatch(m.id); }
    else { S.unread[m.id] = true; renderTabs(); }
  });
  socket.on('searchStatus', d => { S.searching = d.searching; if (S.tab === 'home') renderHome(); });
  socket.on('challenged', ({ from, name, mode, format, label: lbl }) => {
    modal(`<h2>Challenge!</h2><p><b>${esc(name)}</b> wants a <b>${esc(lbl)}</b> battle.</p>
      ${mode === 'elite' ? `<div class="field"><label>Your Strike Squad</label>${eliteSelect('chTeam')}</div>` : '<p class="muted">Quick Match: you will draft from 20 random shinobi.</p>'}
      <div class="row" style="margin-top:14px"><button class="primary" id="chAccept">Accept</button><button id="chDecline">Decline</button></div>`);
    $('#chAccept').onclick = () => {
      let team = null;
      if (mode === 'elite') { team = eliteTeamSets(+$('#chTeam').value); if (!team) return; }
      socket.emit('respond', { from, accept: true, team }, r => { if (r.error) toast(r.error, 5000); else closeModal(); });
    };
    $('#chDecline').onclick = () => { socket.emit('respond', { from, accept: false }); closeModal(); };
  });
  socket.on('challengeDeclined', ({ by }) => { S.outgoing = null; toast(`${by} declined your challenge.`); if (S.tab === 'home') renderHome(); });
  socket.on('challengeAccepted', () => { S.outgoing = null; });
  socket.on('challengeCancelled', () => { closeModal(); toast('The challenge was cancelled.'); });

  // ---------- account ----------
  const busyInBattle = () => Object.values(S.matches).some(m => m && m.phase !== 'ended' && m.you !== null && m.you !== undefined);
  async function accountPost(path, body) {
    const r = await fetch('/api/account/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), credentials: 'same-origin' });
    let j = {}; try { j = await r.json(); } catch {}
    if (!r.ok && !j.error) j.error = 'Something went wrong. Try again.';
    return j;
  }
  function reconnect() { socket.disconnect(); socket.connect(); }
  function accountModal(tab = 'in') {
    if (S.account) {
      modal(`<div id="acCard"><div class="muted">Loading your Shinobi Card…</div></div>
        <div class="row" style="margin-top:8px"><button class="small" id="acEditCard" disabled>Edit Shinobi Card</button><span class="grow"></span></div>
        <p class="muted small">Your roster, Strike Squads and Battle Pass rolls are saved to this account, so they follow you to any device.</p>
        <details class="pw"><summary>Change password</summary>
          <div class="field"><label>Current password</label><input id="pwCur" type="password" autocomplete="current-password"></div>
          <div class="field"><label>New password</label><input id="pwNew" type="password" autocomplete="new-password" placeholder="At least 8 characters"></div>
          <button id="pwOk">Change password</button> <span class="muted small">Signs out your other devices.</span></details>
        <div class="row" style="margin-top:14px"><button id="acOut">Sign out</button><span class="grow"></span><button class="primary" id="acClose">Done</button></div>`);
      $('#acClose').onclick = closeModal;
      SSBU.loadMyCard().then(card => {
        const box = $('#acCard'); if (!box) return;
        box.innerHTML = SSBU.cardHtml(card);
        const ed = $('#acEditCard'); ed.disabled = false;
        ed.onclick = () => SSBU.editCard(card, { after: () => accountModal() });
      }).catch(e => { const box = $('#acCard'); if (box) box.innerHTML = `<div class="err small">${esc(e.message)}</div>`; });
      $('#acOut').onclick = async () => {
        if (busyInBattle() && !confirm('You have a battle in progress. Signing out leaves it, and you will forfeit if you don\'t come back. Sign out anyway?')) return;
        await accountPost('logout'); onAccount(null); closeModal(); reconnect(); toast('Signed out.');
      };
      $('#pwOk').onclick = async () => {
        const r = await accountPost('password', { current: $('#pwCur').value, password: $('#pwNew').value });
        if (r.error) return toast(r.error);
        closeModal(); toast('Password changed.');
      };
      return;
    }
    const isNew = tab === 'new';
    modal(`<div class="seg acct-tabs"><button data-actab="in" class="${isNew ? '' : 'on'}">Sign in</button><button data-actab="new" class="${isNew ? 'on' : ''}">Create account</button></div>
      <p class="muted small">${isNew ? 'An account saves your roster, Strike Squads and daily Battle Pass rolls so you can play from any device.' : 'Sign in to load your roster, Strike Squads and Battle Pass rolls.'}
      ${S.roster.length || S.elite.length ? ' The roster and teams saved in this browser will be moved into your account.' : ''}</p>
      <form id="acForm" autocomplete="on">
        <div class="field"><label>Username</label><input id="acUser" maxlength="20" autocomplete="username" autocapitalize="off" spellcheck="false" ${isNew ? 'placeholder="3–20 letters, numbers, _ or -"' : ''}></div>
        <div class="field"><label>Password</label><input id="acPass" type="password" autocomplete="${isNew ? 'new-password' : 'current-password'}" ${isNew ? 'placeholder="At least 8 characters"' : ''}></div>
        ${isNew ? '<div class="field"><label>Confirm password</label><input id="acPass2" type="password" autocomplete="new-password"></div><p class="muted small">There is no email on accounts, so keep your password somewhere safe.</p>' : ''}
        <div id="acErr" class="err small"></div>
        <div class="row"><span class="grow"></span><button type="button" id="acCancel">Cancel</button><button class="primary" id="acGo" type="submit">${isNew ? 'Create account' : 'Sign in'}</button></div>
      </form>
      <hr><div class="field"><label>Guest name (when not signed in)</label><div class="row"><input id="nmIn" maxlength="24" value="${esc(S.me.name)}" class="grow"><button id="nmOk">Save</button></div></div>`);
    $$('[data-actab]').forEach(b => b.onclick = () => accountModal(b.dataset.actab));
    $('#acCancel').onclick = closeModal;
    $('#nmOk').onclick = () => { socket.emit('rename', $('#nmIn').value); closeModal(); };
    $('#acUser').focus();
    $('#acForm').onsubmit = async e => {
      e.preventDefault();
      const err = m => { $('#acErr').textContent = m; };
      if (isNew && $('#acPass').value !== $('#acPass2').value) return err('The passwords don\'t match.');
      if (busyInBattle() && !confirm('You have a battle in progress. Signing in leaves it, and you will forfeit if you don\'t come back. Continue?')) return;
      $('#acGo').disabled = true;
      const r = await accountPost(isNew ? 'register' : 'login', { username: $('#acUser').value, password: $('#acPass').value });
      $('#acGo').disabled = false;
      if (r.error) return err(r.error);
      closeModal(); toast(isNew ? `Welcome, ${r.user.username}! Your account is ready.` : `Signed in as ${r.user.username}.`);
      reconnect();   // the socket picks up the new session; 'welcome' then loads the account
    };
  }
  $('#nameBtn').onclick = () => accountModal();
  $('#audioBtn').onclick = () => AUDIO.settings();
  $('#typesBtn').onclick = () => SSBU.showTypeChart();
  $('#signInBtn').onclick = () => accountModal('in');
  document.addEventListener('click', e => { const a = e.target.closest('[data-signin]'); if (a) { e.preventDefault(); accountModal(a.dataset.signin === 'new' ? 'new' : 'in'); } });

  // ---------- tabs ----------
  function renderTabs() {
    const tabs = [['home', 'Home'], ['dex', 'Shinobidex'], ['calc', 'Calc'], ['stats', 'Stats'], ['about', 'What is Shinobi-mon?']];
    let h = tabs.map(([k, n]) => `<button class="tab ${S.tab === k ? 'active' : ''}" data-tab="${k}">${n}</button>`).join('');
    if (S.tab === 'anims') h += `<button class="tab active" data-tab="anims">🎬 Animations</button>`;
    if (S.room) h += `<button class="tab room-tab ${S.tab === 'room' ? 'active' : ''}" data-tab="room">🚪 Room ${esc(S.room.code)}</button>`;
    for (const id of S.open) {
      const m = S.matches[id]; if (!m) continue;
      h += `<button class="tab ${S.tab === id ? 'active' : ''}" data-tab="${id}">${S.unread[id] ? '<span class="dot"></span>' : ''}${m.replay ? '▶ ' : ''}${esc(m.players[0].name)} vs ${esc(m.players[1].name)}<span class="x" data-close="${id}">✕</span></button>`;
    }
    $('#tabs').innerHTML = h;
    // on narrow screens the tab bar scrolls sideways: keep the selected tab in view
    const act = $('#tabs .tab.active'); if (act && act.offsetLeft + act.offsetWidth > $('#tabs').clientWidth + $('#tabs').scrollLeft || (act && act.offsetLeft < $('#tabs').scrollLeft)) act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  $('#tabs').addEventListener('click', e => {
    const c = e.target.closest('[data-close]');
    if (c) {
      e.stopPropagation();
      const id = c.dataset.close; const m = S.matches[id];
      const live = m && !m.replay && m.phase !== 'ended' && m.you !== null;
      if (live && !confirm('Leave this match? You will forfeit.')) return;
      if (live) act(id, { type: 'forfeit' });
      if (!m || !m.replay) socket.emit('leave', { id });
      S.open = S.open.filter(x => x !== id); delete S.matches[id];
      if (m && m.replay) { history.replaceState(null, '', '/'); delete S.bat[id]; }
      if (S.tab === id) S.tab = 'home';
      render(); return;
    }
    const t = e.target.closest('[data-tab]'); if (t) { S.tab = t.dataset.tab; delete S.unread[S.tab]; render(); }
  });
  function render() {
    renderTabs();
    const cur = S.matches[S.tab]; if (window.AUDIO) AUDIO.setBattle(!!(cur && cur.battle && !(cur.battle.state && cur.battle.state.ended)));
    if (!S.dex) { $('#view').innerHTML = '<div class="card">Loading…</div>'; return; }
    if (S.tab === 'home') renderHome();
    else if (S.tab === 'pass') renderPass();
    else if (S.tab === 'elite') renderElite();
    else if (S.tab === 'dex') renderDex();
    else if (S.tab === 'calc') SSBU.renderCalc();
    else if (S.tab === 'stats') SSBU.renderStats();
    else if (S.tab === 'about') SSBU.renderAbout();
    else if (S.tab === 'room' && S.room) SSBU.renderRoom();
    else if (S.tab === 'road') SSBU.renderRoad();
    else if (S.tab === 'anims') SSBU.renderAnims();
    else if (S.matches[S.tab]) renderMatch(S.tab);
    else { S.tab = 'home'; renderHome(); }
  }
  const act = (id, action) => socket.emit('act', { id, action }, r => { if (r && r.error) toast(r.error, 4500); });

  // ---------- home ----------
  function eliteSelect(id) {
    const ok = S.elite.map((t, i) => ({ t, i })).filter(x => eliteReady(x.t));
    if (!ok.length) return `<select id="${id}" disabled><option>No complete Strike Squad yet</option></select>`;
    return `<select id="${id}">${ok.map(({ t, i }) => `<option value="${i}" ${i === S.selElite ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>`;
  }
  const rosterById = uid => S.roster.find(r => r.uid === uid);
  function eliteReady(t) { return t.mons.length === 6 && t.mons.every(m => rosterById(m.uid) && m.moves.filter(Boolean).length); }
  function eliteTeamSets(i) {
    const t = S.elite[i];
    if (!t || !eliteReady(t)) { toast('Build a complete Strike Squad (6 shinobi with moves) in the Strike Squads tab first.', 4500); return null; }
    return t.mons.map(m => { const r = rosterById(m.uid); return Object.assign({}, r, { moves: m.moves.filter(Boolean), item: m.item || '', gender: m.gender || r.gender || GENDER.defaultGender(r.species) }); });
  }
  function teamForMode() {
    if (S.mode !== 'elite') return { team: null };
    const sel = $('#homeElite');
    const team = eliteTeamSets(sel && !sel.disabled ? +sel.value : -1);
    return team ? { team } : null;
  }
  function renderHome() {
    const others = S.lobby.users.filter(u => u.id !== S.me.id);
    const key = `${S.mode}:${S.format}`;
    $('#view').innerHTML = `
    <div class="grid-home">
      <section class="card shinobi span2">
        <h1>Pokémon-style battles with shinobi</h1><p class="muted small" style="margin:-6px 0 10px">New here? <a href="#" data-goto-about>Read <b>What is Shinobi-mon?</b></a> for how everything works.</p>
        <div class="seg" id="segMode">
          <button data-mode="standard" class="${S.mode === 'standard' ? 'on' : ''}"><b>Quick Match</b><span>Draft 6 of 20 random shinobi, then set moves and items</span></button>
        </div>
        <div class="seg small" id="segFormat">
          <button data-format="singles" class="${S.format === 'singles' ? 'on' : ''}"><b>Singles</b><span>Bring 6, pick 3</span></button>
          <button data-format="doubles" class="${S.format === 'doubles' ? 'on' : ''}"><b>Doubles</b><span>Bring 6, pick 4</span></button>
        </div>
        <div class="row" style="margin-top:12px">
          ${S.mode === 'elite' ? eliteSelect('homeElite') : ''}
          <button class="primary" id="btnSearch">${S.searching === key ? 'Cancel search' : 'Find opponent'}</button>
          <button id="btnCpu">Battle the CPU</button>
          ${S.searching ? `<span class="pill">Searching ${esc(label(...S.searching.split(':')))}…</span>` : ''}
        </div>
        ${S.mode === 'elite' && !S.elite.some(eliteReady) ? `<p class="muted small" style="margin:10px 0 0">You need a 6-shinobi Strike Squad. Roll the <a href="#" data-goto="pass">Battle Pass</a> to build your roster, then build a team in <a href="#" data-goto="elite">Strike Squads</a>.</p>` : ''}
      </section>
      ${SSBU.homeRoomHtml()}
      <section class="card">
        <h2>Online (${S.lobby.users.length})</h2>
        <div class="list">${others.length ? others.map(u => `<div class="list-item">${u.avatar ? SSBU.avatarSprite(u.avatar, 'xs') : ''}<span class="grow">${u.account ? `<a href="#" data-profile="${esc(u.name)}">${esc(u.name)}</a>` : esc(u.name)}</span>${u.searching ? `<span class="pill">${esc(label(...u.searching.split(':')))}</span>` : ''}<button class="small" data-challenge="${esc(u.id)}">Challenge</button></div>`).join('') : '<div class="muted">Nobody else is online. Share the link with a friend, or battle the CPU.</div>'}</div>
        <p class="muted small">Challenges use the mode and format selected above.</p>
        ${S.outgoing ? `<div class="row"><span class="pill">Waiting for ${esc(S.outgoing.name)}…</span><button class="small" id="btnCancelCh">Cancel</button></div>` : ''}
      </section>
      <section class="card">
        <h2>Live matches</h2>
        <div class="list">${S.lobby.matches.length ? S.lobby.matches.map(b => `<div class="list-item"><span class="grow">${esc(b.p1)} vs ${esc(b.p2)}<div class="muted small">${esc(label(b.mode, b.format))} · ${b.phase === 'battle' ? 'Turn ' + b.turn : esc(b.phase)}</div></span><button class="small" data-watch="${b.id}">Watch</button></div>`).join('') : '<div class="muted">No matches right now.</div>'}</div>
      </section>
      <section class="card span2" id="homeUsage">${SSBU.homeUsageHtml()}</section>
    </div>`;
    SSBU.loadHomeUsage(); SSBU.wireHomeRoom();
    const ab = $('[data-goto-about]'); if (ab) ab.onclick = e => { e.preventDefault(); S.tab = 'about'; render(); window.scrollTo(0, 0); };
    $$('[data-goto]').forEach(a => a.onclick = e => { e.preventDefault(); S.tab = a.dataset.goto; render(); });
    $$('[data-mode]').forEach(b => b.onclick = () => { S.mode = b.dataset.mode; store('ssbu-mode', S.mode); renderHome(); });
    $$('[data-format]').forEach(b => b.onclick = () => { S.format = b.dataset.format; store('ssbu-format', S.format); renderHome(); });
    const he = $('#homeElite'); if (he && !he.disabled) he.onchange = () => { S.selElite = +he.value; saveRoster(); };
    $('#btnSearch').onclick = () => {
      if (S.searching === key) { socket.emit('cancelSearch'); S.searching = null; renderHome(); return; }
      const t = teamForMode(); if (!t) return;
      socket.emit('search', { mode: S.mode, format: S.format, team: t.team }, r => { if (r.error) toast(r.error, 5000); else if (r.searching) { S.searching = r.searching; renderHome(); } });
    };
    $('#btnCpu').onclick = () => { const t = teamForMode(); if (!t) return; socket.emit('cpu', { mode: S.mode, format: S.format, team: t.team }, r => { if (r.error) toast(r.error, 5000); }); };
    $$('[data-challenge]').forEach(b => b.onclick = () => {
      const t = teamForMode(); if (!t) return;
      const u = S.lobby.users.find(x => x.id === b.dataset.challenge);
      socket.emit('challenge', { to: u.id, mode: S.mode, format: S.format, team: t.team }, r => { if (r.error) toast(r.error, 5000); else { S.outgoing = { id: u.id, name: u.name }; renderHome(); } });
    });
    const cc = $('#btnCancelCh'); if (cc) cc.onclick = () => { socket.emit('cancelChallenge', { to: S.outgoing.id }); S.outgoing = null; renderHome(); };
    $$('[data-watch]').forEach(b => b.onclick = () => socket.emit('spectate', { id: b.dataset.watch }, r => { if (r.error) toast(r.error); else S.tab = b.dataset.watch; }));
  }

  // ---------- Battle Pass ----------
  function renderPass() {
    const p = S.pass || { rollsLeft: 0, perDay: 3, keep: 5 };
    const pending = p.pending;
    const rosterSorted = S.roster.slice().sort((a, b) => F(a.species).num - F(b.species).num);
    $('#view').innerHTML = `
      <section class="card shinobi">
        <div class="row"><div class="grow"><h1 style="margin:0">Battle Pass</h1><p style="margin:4px 0 0">Each roll shows 20 random shinobi with random natures, IVs and abilities. Keep up to ${p.keep} of them for your Elite roster.</p></div>
          <div class="rolls">${[...Array(p.perDay)].map((_, i) => `<span class="roll-pip ${i < p.rollsLeft ? 'on' : ''}"></span>`).join('')}<div class="muted small">${p.rollsLeft} of ${p.perDay} rolls left today</div></div></div>
        ${pending ? '' : `<button class="primary" id="btnRoll" ${p.rollsLeft ? '' : 'disabled'} style="margin-top:12px">${p.rollsLeft ? 'Roll the Battle Pass' : 'Out of rolls — come back tomorrow'}</button>`}
      </section>
      ${pending ? `<section class="card" style="margin-top:14px">
        <div class="row" style="margin-bottom:10px"><h2 class="grow" style="margin:0">Pick up to ${p.keep} to keep (${S.passSel.size}/${p.keep})</h2><button class="primary" id="btnClaim">Add ${S.passSel.size} to roster</button></div>
        <p class="muted small" style="margin-top:0">Shinobi you don't keep are gone once you claim. Grade = total IVs (S is best).</p>
        <div class="fgrid">${pending.map(b => fighterCard(b, { sel: S.passSel.has(b.uid), attr: `data-pass="${b.uid}"`, extra: rosterHas(b.species) ? '<div class="muted small">You already own one</div>' : '' })).join('')}</div></section>` : ''}
      <section class="card" style="margin-top:14px">
        <h2>Your roster (${S.roster.length})</h2>
        <p class="muted small" style="margin-top:-6px">${S.account ? 'Saved to your account.' : 'Saved in this browser. <a href="#" data-signin>Sign in</a> to keep them on any device.'} Use these shinobi to build Strike Squads.</p>
        ${S.roster.length ? `<div class="fgrid">${rosterSorted.map(b => fighterCard(b, { extra: `<button class="small ghost" data-release="${b.uid}">Release</button>` })).join('')}</div>` : '<div class="muted">No shinobi yet — roll the Battle Pass!</div>'}
      </section>`;
    const r = $('#btnRoll'); if (r) r.onclick = () => socket.emit('pass:roll', {}, res => {
      if (res.error) return toast(res.error);
      S.pass = Object.assign({}, S.pass, { pending: res.pending, rollsLeft: res.rollsLeft }); S.passSel = new Set(); renderPass();
    });
    $$('[data-pass]').forEach(el => el.onclick = () => {
      const u = el.dataset.pass;
      if (S.passSel.has(u)) S.passSel.delete(u); else if (S.passSel.size < p.keep) S.passSel.add(u); else return toast(`You can keep up to ${p.keep}.`);
      renderPass();
    });
    const c = $('#btnClaim'); if (c) c.onclick = () => {
      if (!S.passSel.size && !confirm('Keep none of these shinobi?')) return;
      socket.emit('pass:claim', { uids: [...S.passSel] }, res => {
        if (res.error) return toast(res.error);
        if (S.account) socket.emit('data:load', {}, r => { if (r && !r.error) { adoptAccountData(r); renderPass(); } });
        else { S.roster.push(...res.fighters); saveRoster(); }
        S.pass = Object.assign({}, S.pass, { pending: null, rollsLeft: res.rollsLeft }); S.passSel = new Set();
        toast(`Added ${res.fighters.length} shinobi${res.fighters.length === 1 ? '' : 's'} to your roster.`); renderPass();
      });
    };
    $$('[data-release]').forEach(b => b.onclick = e => {
      e.stopPropagation();
      const u = b.dataset.release; const f = F(rosterById(u).species);
      if (!confirm(`Release ${f.name}? This can't be undone.`)) return;
      S.roster = S.roster.filter(x => x.uid !== u);
      for (const t of S.elite) t.mons = t.mons.filter(m => m.uid !== u);
      saveRoster(); renderPass();
    });
  }
  const rosterHas = species => S.roster.some(r => r.species === species);
  socket.on('connect', () => socket.emit('pass:status', {}, st => { S.pass = st; if (S.tab === 'pass') renderPass(); }));

  // ---------- moves / item editor (shared by Standard build and Strike Squads) ----------
  const MV_MENUS = {}; let MV_SEQ = 0; let MV_OPEN = null; const POOL_OPEN = new Set(); // {set, i, scroll}: keeps an open move list open across redraws
  function setEditor(b, build, idPrefix, usedItems) {
    const f = F(b.species);
    const sig = Object.fromEntries(f.signature.map(s => [s.move, s.smash]));
    const learn = f.learnset.slice().sort((x, y) => ((y in sig) - (x in sig)) || S.dex.moves[x].type.localeCompare(S.dex.moves[y].type) || x.localeCompare(y));
    const stones = Object.values(S.dex.finalSmashes || {});
    const items = Object.keys(S.dex.items).filter(i => !S.dex.finalSmashes[i]).concat(stones.filter(x => x.bases.includes(f.id)).map(x => x.stone));
    const mvLabel = n => { const m = S.dex.moves[n]; return `<span class="mvp-n">${esc(n)}${n in sig ? ' <span class="sig">★</span>' : ''}</span><span class="mvp-i">${typeChip(m.type)} ${m.cat === 'Status' ? 'Status' : (m.power || '—') + ' BP'}</span>`; };
    const picker = i => { const cur = build.moves[i]; return `<div class="mvp" data-mvp="${i}"><button type="button" class="mvp-btn" data-mvbtn="${i}" ${cur ? `data-tipmove="${esc(cur)}"` : ''}>${cur ? mvLabel(cur) : '<span class="muted">— choose a move —</span>'}<span class="mvp-caret">▾</span></button></div>`; };
    const menu = i => `<div class="mvp-menu"><button type="button" class="mvp-opt" data-mvopt=""><span class="muted">— none —</span></button>${learn.map(n => `<button type="button" class="mvp-opt ${n === build.moves[i] ? 'on' : ''} ${build.moves.includes(n) && n !== build.moves[i] ? 'taken' : ''}" data-mvopt="${esc(n)}" data-tipmove="${esc(n)}">${mvLabel(n)}</button>`).join('')}</div>`;
    const mkey = 'm' + (++MV_SEQ); MV_MENUS[mkey] = menu;
    return `<div class="set-ed" data-set="${idPrefix}" data-mvkey="${mkey}">
      <div class="field"><label>Moves <span class="muted small">· hover a move to see what it does</span></label>${[0, 1, 2, 3].map(picker).join('')}</div>
      <div class="field"><label>Item ${usedItems && build.item && usedItems.get(build.item) > 1 ? '<b style="color:var(--bad)">· duplicate (item clause)</b>' : ''}</label><select data-item><option value="">(none)</option>${items.map(i => `<option ${i === build.item ? 'selected' : ''}>${esc(i)}</option>`).join('')}</select>
        <div class="desc">${esc(S.dex.items[build.item] || '')}</div></div>
      <details class="pool" ${POOL_OPEN.has(idPrefix) ? 'open' : ''}><summary>Move pool (${f.learnset.length})</summary><div class="move-table"><table>${learn.map(n => { const m = S.dex.moves[n]; return `<tr data-tipmove="${esc(n)}"><td>${esc(n)}${n in sig ? ` <span class="sig">★ ${esc(sig[n])}</span>` : ''}</td><td>${typeChip(m.type)}</td><td><span class="cat">${m.cat}</span></td><td>${m.power || '—'}</td><td>${m.acc === true ? '—' : m.acc}</td><td class="muted small">${m.target === 'allFoes' ? 'Both foes' : m.target === 'all' ? 'All others' : ''}</td></tr>`; }).join('')}</table></div></details>
    </div>`;
  }
  function wireSetEditor(root, build, onChange) {
    const closeMenus = () => { MV_OPEN = null; document.querySelectorAll('.mvp-menu').forEach(m => m.remove()); };
    const openMenu = (btn, scroll) => {
      const wrap = btn.parentElement; const ed = btn.closest('.set-ed'); const i = +btn.dataset.mvbtn;
      wrap.insertAdjacentHTML('beforeend', MV_MENUS[ed.dataset.mvkey](i));
      const m = wrap.querySelector('.mvp-menu'); const on = m.querySelector('.on');
      m.scrollTop = scroll != null ? scroll : on ? on.offsetTop - 60 : 0;
      MV_OPEN = { set: ed.dataset.set, i, scroll: m.scrollTop };
      m.onscroll = () => { if (MV_OPEN) MV_OPEN.scroll = m.scrollTop; };
      m.onclick = ev => {
        const o = ev.target.closest('[data-mvopt]'); if (!o) return; ev.stopPropagation();
        const v = o.dataset.mvopt;
        if (v && build.moves.includes(v) && build.moves[i] !== v) { toast('Already has that move.'); return; }
        closeMenus(); document.querySelector('.tip')?.classList.add('hidden');
        build.moves[i] = v; onChange();
      };
    };
    root.querySelectorAll('[data-mvbtn]').forEach(btn => btn.onclick = e => {
      e.stopPropagation();
      const wasOpen = btn.parentElement.querySelector('.mvp-menu');
      closeMenus(); if (!wasOpen) openMenu(btn);
    });
    const pool = root.querySelector('.pool'); const setId = (root.querySelector('.set-ed') || root.closest('.set-ed'))?.dataset.set;
    if (pool) pool.ontoggle = () => { if (pool.open) POOL_OPEN.add(setId); else POOL_OPEN.delete(setId); };
    if (MV_OPEN) { // a redraw happened while a list was open: reopen it where it was
      const ed = root.querySelector('.set-ed') || root.closest('.set-ed');
      if (ed && ed.dataset.set === MV_OPEN.set) { const btn = ed.querySelector(`[data-mvbtn="${MV_OPEN.i}"]`); if (btn) openMenu(btn, MV_OPEN.scroll); }
    }
    if (!wireSetEditor._bound) { wireSetEditor._bound = true;
      document.addEventListener('click', e => { if (!e.target.closest('.mvp-menu')) closeMenus(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); }); }
    root.querySelector('[data-item]').onchange = e => { build.item = e.target.value; onChange(); };
  }
  function itemCounts(builds) { const m = new Map(); for (const b of builds) if (b.item) m.set(b.item, (m.get(b.item) || 0) + 1); return m; }

  // ---------- Strike Squads ----------
  function renderElite() {
    if (S.editElite !== null && !S.elite[S.editElite]) S.editElite = null;
    $('#view').innerHTML = `<div class="tb">
      <section class="card">
        <h2>Strike Squads</h2>
        <button class="primary" id="eNew" ${S.roster.length ? '' : 'disabled'}>New team</button> <button id="eImport" ${S.roster.length ? '' : 'disabled'}>Import</button>
        ${S.roster.length ? '' : '<p class="muted small">Roll the Battle Pass first — teams are built from your roster.</p>'}
        <div class="list" style="max-height:none;margin-top:10px">${S.elite.map((t, i) => `<div class="team-row ${i === S.editElite ? 'sel' : ''}" data-et="${i}"><div class="row"><b class="grow">${esc(t.name)}</b><span class="pill">${eliteReady(t) ? 'Ready' : t.mons.length + '/6'}</span></div><div class="mini">${t.mons.map(m => { const r = rosterById(m.uid); return r ? badge(F(r.species), 'sm', m.gender || r.gender) : ''; }).join('')}</div></div>`).join('') || '<div class="muted">No teams yet.</div>'}</div>
      </section>
      <section class="card" id="eEditor">${S.editElite === null ? '<div class="muted">Pick a team or make a new one. Each team has 6 shinobi from your roster; you choose their moves and items.</div>' : ''}</section></div>`;
    $('#eImport').onclick = () => SSBU.importTeam();
    $('#eNew').onclick = () => { S.elite.push({ name: 'Strike Squad ' + (S.elite.length + 1), mons: [] }); S.editElite = S.elite.length - 1; S.eliteSlot = 0; saveRoster(); renderElite(); };
    $$('[data-et]').forEach(el => el.onclick = () => { S.editElite = +el.dataset.et; S.eliteSlot = 0; renderElite(); });
    if (S.editElite !== null) renderEliteEditor();
  }
  // Elite: shinobi that can be either gender let you choose
  function genderPicker(m) {
    const r = rosterById(m.uid); const id = r.species; const gi = GENDER.info(id);
    const cur = m.gender || r.gender || GENDER.defaultGender(id);
    if (gi.type !== 'X') return `<div class="gender-pick muted small">Gender: ${gi.type === 'B' ? 'Both (one of each) — counts as genderless' : gi.type === 'N' ? 'Genderless' : gi.type === 'M' ? '♂ Male' : '♀ Female'}</div>`;
    return `<div class="gender-pick"><span class="small muted">Gender</span><button class="small ${cur === 'M' ? 'on' : ''}" data-gender="M">♂ Male</button><button class="small ${cur === 'F' ? 'on' : ''}" data-gender="F">♀ Female</button></div>`;
  }
  function renderEliteEditor() {
    const t = S.elite[S.editElite];
    t.mons = t.mons.filter(m => rosterById(m.uid));
    if (S.eliteSlot > t.mons.length) S.eliteSlot = t.mons.length;
    const counts = itemCounts(t.mons);
    const slots = [0, 1, 2, 3, 4, 5].map(i => {
      const m = t.mons[i];
      if (!m) return i === t.mons.length ? `<div class="slot" data-eslot="add">＋<span class="muted">Add shinobi</span></div>` : `<div class="slot" style="opacity:.3"></div>`;
      const r = rosterById(m.uid); const f = F(r.species); const g = m.gender || r.gender;
      return `<div class="slot filled ${i === S.eliteSlot ? 'sel' : ''}" data-eslot="${i}">${badge(f, '', g)}<span>${esc(f.name)} ${gsym(g)}</span></div>`;
    }).join('');
    const m = t.mons[S.eliteSlot];
    $('#eEditor').innerHTML = `
      <div class="row"><input id="eName" class="grow" value="${esc(t.name)}" maxlength="40"><button class="small" id="eExport">Export</button><button class="small" id="eDup">Duplicate</button><button class="small" id="eDel">Delete</button></div>
      <div class="slots">${slots}</div>
      ${[...counts.values()].some(c => c > 1) ? '<p class="small" style="color:var(--bad)">Item clause: each item can only be used once per team.</p>' : ''}
      ${m ? `<div class="editor"><div>${fighterCard(rosterById(m.uid), { gender: m.gender })}${genderPicker(m)}<div class="row" style="margin-top:8px"><button class="small" id="eSwap">Swap shinobi</button><button class="small" id="eRemove">Remove</button></div></div><div id="eSet">${setEditor(rosterById(m.uid), m, 'elite', counts)}</div></div>` : ''}`;
    $('#eName').oninput = e => { t.name = e.target.value; saveRoster(); };
    $('#eExport').onclick = () => SSBU.exportTeam(t);
    $('#eDup').onclick = () => { S.elite.push(JSON.parse(JSON.stringify(Object.assign({}, t, { name: t.name + ' (copy)' })))); S.editElite = S.elite.length - 1; saveRoster(); renderElite(); };
    $('#eDel').onclick = () => { if (!confirm(`Delete "${t.name}"?`)) return; S.elite.splice(S.editElite, 1); S.editElite = null; S.selElite = 0; saveRoster(); renderElite(); };
    $$('[data-eslot]').forEach(el => el.onclick = () => { if (el.dataset.eslot === 'add') { S.eliteSlot = t.mons.length; pickFromRoster(t, null); } else { S.eliteSlot = +el.dataset.eslot; renderEliteEditor(); } });
    if (m) {
      wireSetEditor($('#eSet'), m, () => { saveRoster(); renderEliteEditor(); });
      $('#eSwap').onclick = () => pickFromRoster(t, S.eliteSlot);
      $$('[data-gender]').forEach(b => b.onclick = () => { m.gender = b.dataset.gender; saveRoster(); renderEliteEditor(); });
      $('#eRemove').onclick = () => { t.mons.splice(S.eliteSlot, 1); S.eliteSlot = Math.max(0, S.eliteSlot - 1); saveRoster(); renderElite(); };
    }
  }
  function pickFromRoster(t, slot) {
    const takenSpecies = new Set(t.mons.filter((_, i) => i !== slot).map(m => rosterById(m.uid).species));
    const avail = S.roster.filter(r => !takenSpecies.has(r.species));
    if (!avail.length) return toast('No more roster shinobi available (one of each shinobi per team).');
    modal(`<div class="row" style="margin-bottom:10px"><h2 class="grow" style="margin:0">Choose from your roster</h2><button id="rpX">Close</button></div>
      <div class="fgrid">${avail.map(b => fighterCard(b, { attr: `data-rp="${b.uid}"` })).join('')}</div>`);
    $('#rpX').onclick = closeModal;
    $$('[data-rp]').forEach(el => el.onclick = () => {
      const b = rosterById(el.dataset.rp); const f = F(b.species);
      const entry = { uid: b.uid, moves: f.signature.slice(0, 4).map(s => s.move), item: '', gender: b.gender || GENDER.defaultGender(f.id) };
      if (slot === null) t.mons.push(entry); else t.mons[slot] = entry;
      saveRoster(); closeModal(); renderElite();
    });
  }

  // ---------- Shinobidex ----------
  // Shinobidex: search, type / type-combination filter (transformations included), and sorting
  const TYPE_ORDER = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];
  const DEX_SORTS = [['num', 'Shinobidex #'], ['bst', 'BST'], ['hp', 'HP'], ['atk', 'Attack'], ['def', 'Defense'], ['spa', 'Sp. Atk'], ['spd', 'Sp. Def'], ['spe', 'Speed'], ['name', 'Name']];
  S.dexOpt = S.dexOpt || { t1: '', t2: '', fs: true, sort: 'num', dir: 'asc' };
  const FORM_OF = {};
  function dexEntries() {
    const out = S.dex.fighters.map(f => ({ f, num: f.num, sub: 0 }));
    for (const fm of Object.values(S.dex.forms || {})) {   // battle forms (Cloak, Bruce Banner) always listed beside their shinobi
      const base = S.byId[fm.base]; if (base && S.byId[fm.id]) out.push({ f: S.byId[fm.id], form: fm, base, num: base.num, sub: 0.5 });
    }
    if (S.dexOpt.fs) for (const fs of Object.values(S.dex.finalSmashes || {})) {
      const bases = fs.bases.map(b => S.byId[b]).filter(Boolean); if (!bases.length) continue;
      const first = bases.reduce((a, b) => (b.num < a.num ? b : a));
      out.push({ f: S.byId[fs.id], fs, bases, num: first.num, sub: 1 + Object.values(S.dex.finalSmashes).filter(x => x.bases[0] === fs.bases[0]).indexOf(fs) });
    }
    return out;
  }
  function renderDex() {
    const o = S.dexOpt;
    const q = S.dexFilter.toLowerCase().trim();
    const bst = f => STATS.reduce((a, k) => a + f.stats[k], 0);
    const matchType = types => {
      if (o.t1 && !types.includes(o.t1)) return false;
      if (o.t2 === 'none') return types.length === 1;
      if (o.t2 && !types.includes(o.t2)) return false;
      return true;
    };
    const matchText = e => {
      if (!q) return true;
      const base = e.bases ? e.bases[0] : e.f;
      return e.f.name.toLowerCase().includes(q) || (e.bases || []).some(b => b.name.toLowerCase().includes(q)) || (base.series || '').toLowerCase().includes(q)
        || e.f.types.some(x => x.toLowerCase() === q) || base.learnset.some(x => x.toLowerCase() === q) || (e.fs && e.fs.stone.toLowerCase().includes(q));
    };
    const key = e => o.sort === 'num' ? e.num * 10 + e.sub : o.sort === 'bst' ? bst(e.f) : o.sort === 'name' ? e.f.name.toLowerCase() : e.f.stats[o.sort];
    const list = dexEntries().filter(e => matchType(e.f.types) && matchText(e)).sort((a, b) => {
      const ka = key(a), kb = key(b);
      const c = typeof ka === 'string' ? ka.localeCompare(kb) : ka - kb;
      return (o.dir === 'desc' ? -c : c) || (a.num * 10 + a.sub) - (b.num * 10 + b.sub);
    });
    const nForms = list.filter(e => e.fs).length, nBattle = list.filter(e => e.form).length;
    const typeOpts = sel => TYPE_ORDER.map(t => `<option value="${t}" ${sel === t ? 'selected' : ''}>${t}</option>`).join('');
    const filtered = o.t1 || o.t2 || q || !o.fs || o.sort !== 'num' || o.dir !== 'asc';
    const highlight = k => (o.sort === k ? ' hl' : '');
    $('#view').innerHTML = `<section class="card"><div class="row" style="margin-bottom:10px"><h2 class="grow" style="margin:0">Shinobidex · ${list.length - nForms - nBattle}${nBattle ? ` <span class="muted small">+ ${nBattle} battle form${nBattle === 1 ? '' : 's'}</span>` : ''}${nForms ? ` <span class="muted small">+ ${nForms} Transformation form${nForms === 1 ? '' : 's'}</span>` : ''}</h2><input id="dexQ" placeholder="Search name, series, type or move" value="${esc(S.dexFilter)}"></div>
      <div class="dex-tools">
        <label>Type <select id="dexT1"><option value="">Any</option>${typeOpts(o.t1)}</select></label>
        <label>${o.t1 ? 'and' : 'Second type'} <select id="dexT2"><option value="">Any</option><option value="none" ${o.t2 === 'none' ? 'selected' : ''}>None (single type)</option>${typeOpts(o.t2)}</select></label>
        <label class="check"><input type="checkbox" id="dexFS" ${o.fs ? 'checked' : ''}> Include transformations</label>
        <span class="grow"></span>
        <label>Sort by <select id="dexSort">${DEX_SORTS.map(([k, n]) => `<option value="${k}" ${o.sort === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <button class="small" id="dexDir" title="${o.dir === 'asc' ? 'Ascending' : 'Descending'}">${o.dir === 'asc' ? '↑ Low to high' : '↓ High to low'}</button>
        ${filtered ? '<button class="small ghost" id="dexReset">Reset</button>' : ''}
      </div>
      ${list.length ? '' : '<p class="muted">No shinobi match. Try another type combination or turn on transformations.</p>'}
      <div class="dex-grid">${list.map(e => { const f = e.f; return `<div class="dex-card ${e.fs ? 'fs-entry' : ''}${e.form ? ' form-entry' : ''}" data-dex="${e.fs ? e.bases[0].id : e.form ? e.base.id : f.id}" style="flex-direction:column"><div class="row">${badge(f)}<div class="grow"><div class="nm">#${e.num}${e.form ? 'b' : ''}${e.fs ? '<span class="fs-star">★</span>' : ''} ${esc(f.name)}</div>${e.fs ? `<div class="small muted">Transformation of ${esc(e.bases.map(b => b.name).join(' / '))} · ${esc(e.fs.stone)}</div>` : ''}${e.form ? `<div class="small muted">Battle form of ${esc(e.base.name)}</div>` : FORM_OF[f.id] ? `<div class="small muted">${esc(FORM_OF[f.id])}</div>` : ''}<div>${f.types.map(typeChip).join(' ')}</div></div><span class="pill${highlight('bst')}">BST ${bst(f)}</span></div>
        <div class="statbars">${STATS.map(s => `<span class="muted${highlight(s)}">${SL[s]}</span><span style="font-family:var(--mono)" class="${highlight(s).trim()}">${f.stats[s]}</span><div class="statbar"><i style="width:${Math.min(100, f.stats[s] / 1.6)}%;background:${f.stats[s] >= 110 ? 'var(--good)' : f.stats[s] >= 80 ? 'var(--warn)' : 'var(--bad)'}"></i></div>`).join('')}</div></div>`; }).join('')}</div></section>`;
    const inp = $('#dexQ'); inp.oninput = e => { S.dexFilter = e.target.value; const pos = inp.selectionStart; renderDex(); const n = $('#dexQ'); n.focus(); n.setSelectionRange(pos, pos); };
    $('#dexT1').onchange = e => { o.t1 = e.target.value; if (o.t2 && o.t2 === o.t1) o.t2 = ''; renderDex(); };
    $('#dexT2').onchange = e => { o.t2 = e.target.value; renderDex(); };
    $('#dexFS').onchange = e => { o.fs = e.target.checked; renderDex(); };
    $('#dexSort').onchange = e => { o.sort = e.target.value; o.dir = ['num', 'name'].includes(o.sort) ? 'asc' : 'desc'; renderDex(); };
    $('#dexDir').onclick = () => { o.dir = o.dir === 'asc' ? 'desc' : 'asc'; renderDex(); };
    const rs = $('#dexReset'); if (rs) rs.onclick = () => { Object.assign(o, { t1: '', t2: '', fs: true, sort: 'num', dir: 'asc' }); S.dexFilter = ''; renderDex(); };
    $$('[data-dex]').forEach(el => el.onclick = () => showFighter(F(el.dataset.dex)));
  }
  // Shinobidex: every front battle sprite this shinobi has (each gender, plus its transformations)
  function battleSpritesHtml(f) {
    const genders = GENDER.choices(f.id).filter(g => g === 'M' || g === 'F');
    const gs = genders.length ? genders : [null];
    const forms = [f, ...Object.values(S.dex.forms || {}).filter(x => x.base === f.id).map(x => S.byId[x.id]).filter(Boolean),
      ...Object.values(S.dex.finalSmashes || {}).filter(x => x.bases.includes(f.id)).map(x => S.byId[x.id]).filter(Boolean),
      ...(f.id === 'the-hood' && (S.drawn || new Set()).has('the-hood-half-demon-form_front') ? [Object.assign({}, f, { id: 'the-hood-half-demon-form', name: 'Half-Demon State', image: null })] : [])];
    const byUrl = new Map(), missing = [];   // one tile per distinct sprite; note which genders use it
    for (const form of forms) for (const g of gs) {
      const src = spriteSrc(form, false, g);
      if (!src.drawn) { missing.push(esc(form.name) + (g && genders.length > 1 ? ' ' + gsym(g) : '')); continue; }
      const t = byUrl.get(src.url) || { form, url: src.url, back: spriteSrc(form, true, g), gs: [] }; t.gs.push(g); byUrl.set(src.url, t);
    }
    const tiles = [...byUrl.values()].map(t => {
      const alt = t.gs.length === 1 && (GENDER.info(t.form.id).names || {})[t.gs[0]];   // e.g. Lady Loki
      const split = !alt && !GENDER.info(t.form.id).names && genders.length > 1 && t.gs.length < genders.length;
      const nm = alt || (t.form === f && f.id === 'cloak-and-dagger' ? 'Dagger' : t.form.name);
      const cap = esc(nm) + (split ? ' ' + t.gs.map(gsym).join('') : '');
      const plainCap = nm + (split ? ' ' + t.gs.map(g => GENDER.SYMBOL[g] || '').join('') : '');
      return `<figure class="bs-tile${t.form === f ? '' : ' fs'}" data-zoom="${esc(t.url)}" data-zoom-back="${esc(t.back.url)}" data-zoom-flip="${t.back.flip ? 1 : 0}" data-zoom-cap="${esc(plainCap)}" title="Click to view larger"><div class="bs-stage"><i></i><img src="${t.url}" alt="${esc(t.form.name)}" loading="lazy"></div><figcaption>${cap}${t.form === f ? '' : ' <span class="fs-star">★</span>'}</figcaption></figure>`;
    });
    if (!tiles.length) return `<h2 style="margin-top:14px">Battle sprites</h2><div class="muted small">No battle sprites yet; battles use the official art.</div>`;
    return `<h2 style="margin-top:14px">Battle sprites</h2><div class="bs-grid">${tiles.join('')}</div>${missing.length ? `<div class="muted small" style="margin-top:4px">Official art in battle for: ${missing.join(', ')}</div>` : ''}`;
  }
  function showFighter(f) {
    const sig = Object.fromEntries(f.signature.map(s => [s.move, s.smash]));
    const arts = officialArts(f);
    modal(`<div class="row" style="margin-bottom:10px">${arts.length ? `<span class="art-zoom" data-art="0" title="Click to view the art larger">${badge(f, 'lg')}</span>` : badge(f, 'lg')}<div class="grow"><div style="font-size:22px;font-weight:800">${esc(f.name)}</div><div>${f.types.map(typeChip).join(' ')} <span class="muted">· ${esc(f.series)}</span></div></div><button id="fx">Close</button></div>
      <div class="small" style="margin:-4px 0 8px"><b>Gender:</b> ${esc(GENDER.label(f.id))}${(GENDER.info(f.id).images) ? ` · alternate art: ${Object.entries(GENDER.info(f.id).images).map(([g], i) => `<span class="art-zoom" data-art="${i + 1}" title="${esc((GENDER.info(f.id).names || {})[g] || 'Alternate art')}: click to view larger">${sprite(f, 'sm', false, g)}</span>`).join('')}` : ''}</div>
      <h2>Abilities</h2>${f.abilities.map(a => `<div><b>${esc(a.name)}</b> — <span class="muted">${esc(a.desc)}</span></div>`).join('')}
      <div><b>${esc(f.hidden.name)}</b> <span class="pill">Hidden</span> — <span class="muted">${esc(f.hidden.desc)}</span></div>
      ${Object.values(S.dex.finalSmashes || {}).filter(x => x.bases.includes(f.id)).map(x => `<div class="fs-box"><div class="row">${sprite(S.byId[x.id], 'lg')}<div class="grow"><div style="font-weight:800;font-size:17px">Transformation: ${esc(x.name)}</div><div>${x.types.map(typeChip).join(' ')} <span class="muted">· hold <b>${esc(x.stone)}</b> · BST ${Object.values(x.stats).reduce((a, c) => a + c, 0)}</span></div><div class="small"><b>${esc(x.ability.name)}</b> — <span class="muted">${esc(x.ability.desc)}</span></div></div></div>
        <div class="statbars" style="max-width:460px;grid-template-columns:34px 86px 1fr">${STATS.map(s => `<span class="muted">${SL[s]}</span><span style="font-family:var(--mono)">${x.stats[s]}${x.stats[s] !== f.stats[s] ? ` <span style="color:${x.stats[s] > f.stats[s] ? 'var(--good)' : 'var(--bad)'}">(${x.stats[s] > f.stats[s] ? '+' : ''}${x.stats[s] - f.stats[s]})</span>` : ''}</span><div class="statbar"><i style="width:${Math.min(100, x.stats[s] / 2)}%;background:var(--accent2)"></i></div>`).join('')}</div></div>`).join('')}
      ${Object.values(S.dex.forms || {}).filter(x => x.base === f.id).map(x => { const xf = S.byId[x.id]; return `<div class="fs-box"><div class="row">${badge(xf, 'lg')}<div class="grow"><div style="font-weight:800;font-size:17px">Battle form: ${esc(x.name)}</div><div>${x.types.map(typeChip).join(' ')} <span class="muted">· BST ${Object.values(x.stats).reduce((a, c) => a + c, 0)}${FORM_OF[f.id] ? ' · ' + esc(FORM_OF[f.id]) : ''}</span></div><div class="small"><b>${esc(x.ability.name)}</b> — <span class="muted">${esc(x.ability.desc)}</span></div></div></div>
        <div class="statbars" style="max-width:460px;grid-template-columns:34px 86px 1fr">${STATS.map(s => `<span class="muted">${SL[s]}</span><span style="font-family:var(--mono)">${x.stats[s]}${x.stats[s] !== f.stats[s] ? ` <span style="color:${x.stats[s] > f.stats[s] ? 'var(--good)' : 'var(--bad)'}">(${x.stats[s] > f.stats[s] ? '+' : ''}${x.stats[s] - f.stats[s]})</span>` : ''}</span><div class="statbar"><i style="width:${Math.min(100, x.stats[s] / 2)}%;background:var(--accent2)"></i></div>`).join('')}</div></div>`; }).join('')}
      ${battleSpritesHtml(f)}
      <h2 style="margin-top:14px">Move pool</h2>
      <div class="move-table"><table><tr><th>Move</th><th>Type</th><th>Cat</th><th>Pow</th><th>Acc</th></tr>${f.learnset.map(n => { const mv = S.dex.moves[n]; return `<tr><td>${esc(n)}${n in sig ? ` <span class="sig">★ ${esc(sig[n])}</span>` : ''}</td><td>${typeChip(mv.type)}</td><td><span class="cat">${mv.cat}</span></td><td>${mv.power || '—'}</td><td>${mv.acc === true ? '—' : mv.acc}</td></tr>`; }).join('')}</table></div>`);
    $('#fx').onclick = closeModal;
    $$('[data-zoom]').forEach(el => el.onclick = () => zoomSprite(el.dataset));
    $$('[data-art]').forEach(el => el.onclick = () => zoomArt(arts, +el.dataset.art));
  }
  // Shinobidex: a battle sprite shown large (front and back) over the page; click or Esc closes it
  // official art of a shinobi: the default plus any alternate-gender art (Lady Loki)
  function officialArts(f) {
    if (!f.image) return [];
    const g = GENDER.info(f.id);
    return [{ url: '/images/' + f.image, cap: f.name }, ...Object.entries(g.images || {}).map(([sex, img]) => ({ url: '/images/' + img, cap: (g.names || {})[sex] || `${f.name} ${GENDER.SYMBOL[sex] || ''}` }))];
  }
  function zoomArt(arts, first) {
    const order = [arts[first], ...arts.filter((_, i) => i !== first)].filter(Boolean);
    openZoom(order[0].cap + (order.length > 1 ? ' · ' + order.slice(1).map(a => a.cap).join(' · ') : ''),
      order.map(a => `<figure><div class="sz-art"><img src="${esc(a.url)}" alt="${esc(a.cap)}"></div>${order.length > 1 ? `<figcaption>${esc(a.cap)}</figcaption>` : ''}</figure>`).join(''));
  }
  function openZoom(title, body) {
    const box = document.createElement('div'); box.className = 'sprite-zoom';
    box.innerHTML = `<div class="sz-inner"><div class="sz-title">${esc(title)}</div><div class="sz-row">${body}</div><div class="muted small">Click anywhere to close</div></div>`;
    const close = () => { box.remove(); document.removeEventListener('keydown', esc_, true); };
    const esc_ = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    box.onclick = close; document.addEventListener('keydown', esc_, true);
    document.body.appendChild(box);
  }
  function zoomSprite(d) {
    const box = document.createElement('div'); box.className = 'sprite-zoom';
    box.innerHTML = `<div class="sz-inner"><div class="sz-title">${esc(d.zoomCap)}</div><div class="sz-row">
      <figure><div class="sz-stage"><img src="${d.zoom}" alt=""></div><figcaption>Front</figcaption></figure>
      <figure><div class="sz-stage"><img src="${d.zoomBack}" alt=""${d.zoomFlip === '1' ? ' style="transform:scaleX(-1)"' : ''}></div><figcaption>Back</figcaption></figure>
      </div><div class="muted small">Click anywhere to close</div></div>`;
    const close = () => { box.remove(); document.removeEventListener('keydown', esc_, true); };
    const esc_ = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    box.onclick = close; document.addEventListener('keydown', esc_, true);
    document.body.appendChild(box);
  }

  // ---------- match screens ----------
  function matchHeader(m) {
    const clock = m.clock && m.phase !== 'ended' && m.you !== null && !m.players[m.you].ready ? `<span class="pill clock" data-clock-end="${Date.now() + m.clock.phase}" title="Time left for this step. When it runs out, your choices are made automatically.">⏱ <b>--:--</b></span>` : '';
    return `<div class="row" style="margin-bottom:10px"><b class="grow">${esc(m.players[0].name)} vs ${esc(m.players[1].name)}</b>${clock}<span class="pill">${m.road ? `Road to 50 · Floor ${m.road.floor}` : esc(label(m.mode, m.format))}</span>${m.phase !== 'ended' && m.you !== null ? `<button class="small" id="mForfeit">${m.road ? 'Give up' : 'Forfeit'}</button>` : ''}</div>`;
  }
  function steps(m) {
    const list = m.mode === 'standard' ? [['draft', 'Draft 6'], ['build', 'Moves & items'], ['preview', `Pick ${m.bring}`], ['battle', 'Battle']] : [['preview', `Pick ${m.bring}`], ['battle', 'Battle']];
    const idx = list.findIndex(x => x[0] === m.phase);
    return `<div class="steps">${list.map(([k, n], i) => `<span class="${i < idx || m.phase === 'ended' ? 'done' : i === idx ? 'cur' : ''}">${i + 1}. ${n}</span>`).join('')}</div>`;
  }
  function waitingNote(m) {
    const foe = m.players[1 - m.you];
    return `<div class="row"><span class="muted grow">Waiting for ${esc(foe.name)}…</span></div>`;
  }
  function renderMatch(id) {
    const m = S.matches[id]; if (!m) return;
    delete S.unread[id];
    if (m.battle) return SSBU.renderBattle(id);
    let body = '';
    const me = m.you !== null ? m.players[m.you] : null;
    if (m.phase === 'ended') body = `<div class="banner ${m.result === m.you ? '' : 'lose'}"><span>${m.result === null ? 'Match ended.' : esc(m.players[m.result].name) + ' won!'}</span><button id="mBack">Back to lobby</button></div><div class="log" style="height:auto;margin-top:10px">${(m.log || []).map(l => `<div class="${l.cls}">${esc(l.text)}</div>`).join('')}</div>`;
    else if (m.you === null) body = `<div class="muted">The players are preparing their teams…</div>`;
    else if (me.ready) body = waitingNote(m);
    else if (m.phase === 'draft') body = draftView(m);
    else if (m.phase === 'build') body = buildView(m);
    else if (m.phase === 'preview') body = previewView(m);
    $('#view').innerHTML = `<section class="card">${matchHeader(m)}${steps(m)}${body}</section>`;
    wireMatch(m);
  }
  function wireMatch(m) {
    const id = m.id;
    const fo = $('#mForfeit'); if (fo) fo.onclick = () => { if (confirm('Forfeit this match?')) act(id, { type: 'forfeit' }); };
    const bb = $('#mBack'); if (bb) bb.onclick = () => { S.tab = 'home'; render(); };
    if (m.phase === 'draft' && m.pool) {
      const sel = S.draft[id] = S.draft[id] || [];
      $$('[data-draft]').forEach(el => el.onclick = () => {
        const i = +el.dataset.draft; const k = sel.indexOf(i);
        if (k >= 0) sel.splice(k, 1); else if (sel.length < 6) sel.push(i); else return toast('You already picked 6.');
        renderMatch(id);
      });
      const c = $('#draftOk'); if (c) c.onclick = () => act(id, { type: 'draft', picks: sel });
    }
    if (m.phase === 'build' && m.picks) {
      const builds = S.builds[id];
      $$('[data-buildslot]').forEach(root => { const i = +root.dataset.buildslot; wireSetEditor(root, builds[i], () => renderMatch(id)); });
      const c = $('#buildOk'); if (c) c.onclick = () => act(id, { type: 'build', builds: builds.map(b => ({ moves: b.moves.filter(Boolean), item: b.item })) });
    }
    if (m.phase === 'preview' && m.myTeam) {
      const order = S.lineups[id] = S.lineups[id] || [];
      $$('[data-line]').forEach(el => el.onclick = () => {
        const i = +el.dataset.line; const k = order.indexOf(i);
        if (k >= 0) order.splice(k, 1); else if (order.length < m.bring) order.push(i); else return toast(`You can only bring ${m.bring}.`);
        renderMatch(id);
      });
      const c = $('#lineOk'); if (c) c.onclick = () => act(id, { type: 'lineup', order });
    }
  }
  function draftView(m) {
    const sel = S.draft[m.id] = S.draft[m.id] || [];
    return `<div class="row" style="margin-bottom:8px"><h2 class="grow" style="margin:0">Choose 6 of these 20 (${sel.length}/6)</h2><button class="primary" id="draftOk" ${sel.length === 6 ? '' : 'disabled'}>Lock in team</button></div>
      <p class="muted small" style="margin-top:0">Natures, IVs and abilities are random. Stats shown are at level 50. Your opponent drafts from their own 20.</p>
      <div class="fgrid">${m.pool.map((b, i) => fighterCard(b, { sel: sel.includes(i), order: sel.includes(i) ? sel.indexOf(i) + 1 : null, attr: `data-draft="${i}"` })).join('')}</div>`;
  }
  function buildView(m) {
    if (!S.builds[m.id]) S.builds[m.id] = m.picks.map(b => ({ moves: F(b.species).signature.slice(0, 4).map(s => s.move), item: '' }));
    const builds = S.builds[m.id]; const counts = itemCounts(builds);
    const bad = [...counts.values()].some(c => c > 1) || builds.some(b => !b.moves.filter(Boolean).length);
    return `<div class="row" style="margin-bottom:8px"><h2 class="grow" style="margin:0">Set moves and items</h2><button class="primary" id="buildOk" ${bad ? 'disabled' : ''}>Lock in sets</button></div>
      <p class="muted small" style="margin-top:0">Moves marked ★ are the shinobi's signature jutsu. One of each item per team.</p>
      <div class="build-grid">${m.picks.map((b, i) => `<div class="build-card" data-buildslot="${i}">${fighterCard(b)}${setEditor(b, builds[i], 'b' + i, counts)}</div>`).join('')}</div>`;
  }
  function previewView(m) {
    const order = S.lineups[m.id] = S.lineups[m.id] || [];
    const lead = m.format === 'doubles' ? 2 : 1;
    return `<div class="row" style="margin-bottom:8px"><h2 class="grow" style="margin:0">Teams revealed — pick ${m.bring} in order (${order.length}/${m.bring})</h2><button class="primary" id="lineOk" ${order.length === m.bring ? '' : 'disabled'}>Lock in lineup</button></div>
      <p class="muted small" style="margin-top:0">Your first ${lead === 2 ? 'two lead' : 'pick leads'}; the rest wait in the back. Your opponent can't see your choice.</p>
      <div class="preview"><div><h2>Your team</h2><div class="fgrid one">${m.myTeam.map((s, i) => {
        const k = order.indexOf(i);
        return fighterCard(s, { sel: k >= 0, order: k >= 0 ? (k < lead ? 'Lead ' + (k + 1) : k + 1) : null, attr: `data-line="${i}"`, extra: `<div class="small">${s.moves.map(x => `<span class="chip">${esc(x)}</span>`).join(' ')}${s.item ? ` <span class="chip up">${esc(s.item)}</span>` : ''}</div>` });
      }).join('')}</div></div>
      <div><h2>${esc(m.players[1 - m.you].name)}'s team</h2><p class="muted small" style="margin-top:-6px">Hover (or tap) a shinobi for its stats, possible abilities and Transformation.</p>${m.foeTeam.map(s => `<div class="list-item" style="margin-bottom:6px" data-tipdex="${esc(s.species)}">${badge(F(s.species), 'sm', s.gender)}<span class="grow">${esc(s.name)} ${gsym(s.gender)}</span>${s.types.map(typeChip).join(' ')}</div>`).join('')}</div></div>`;
  }

  // ---------- shared with battle.js ----------
  window.SSBU = { $, $$, esc, S, F, setEditor: (...a) => setEditor(...a), wireSetEditor: (...a) => wireSetEditor(...a), itemCounts: b => itemCounts(b), eliteSelect: id => eliteSelect(id), eliteTeamSets: i => eliteTeamSets(i), eliteReady: t => eliteReady(t), typeChip, badge, sprite, gsym, act, socket, label, toast, modal, closeModal, load, store, render: () => render(), renderTabs: () => renderTabs(), fighterCard, statsOf, rosterById: u => rosterById(u), saveRoster: () => saveRoster(), renderElite: () => renderElite(), abilityInfo };

  // ---------- boot ----------
  fetch('/api/dex').then(r => r.json()).then(d => {
    S.dex = d; S.byId = Object.fromEntries(d.fighters.map(f => [f.id, f])); S.drawn = new Set(d.drawn || []); S.drawnH = d.drawnH || {};
    for (const [stone, fs] of Object.entries(d.finalSmashes || {})) {
      const ab = { name: fs.ability.name, desc: fs.ability.desc };
      S.byId[fs.id] = { id: fs.id, name: fs.name, types: fs.types, stats: fs.stats, image: fs.image, abilities: [ab], hidden: ab, learnset: S.byId[fs.base].learnset, signature: S.byId[fs.base].signature, form: true };
      d.items[stone] = `Lets ${fs.bases.map(b => S.byId[b].name).join(' or ')} transform into its Transformation, ${fs.name} (once per battle; only one shinobi per team can transform).`;
    }
    // battle-only forms (Hulk's Bruce Banner, Cloak & Dagger's Cloak) so the battlefield and Shinobidex can show them
    for (const fm of Object.values(d.forms || {})) {
      const ab = { name: fm.ability.name, desc: fm.ability.desc };
      S.byId[fm.id] = { id: fm.id, name: fm.name, types: fm.types, stats: fm.stats, image: fm.image, abilities: [ab], hidden: ab, learnset: fm.learnset || (S.byId[fm.base] || {}).learnset || [], signature: [], form: true };
    }
    S.roster = S.roster.filter(r => S.byId[r.species]);
    render();
    const rp = location.pathname.match(/^\/replay\/([a-z0-9]+)/i); if (rp) SSBU.openReplay(rp[1]);
  });
})();
