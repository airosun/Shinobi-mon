/* Shinobi-mon private rooms: create/join from Home, the Room tab (line, host controls, results, chat).
   Loaded after app.js. The battles themselves open in normal match tabs. */
(() => {
  const U = window.SSBU;
  const { $, $$, esc, S, toast, socket, label } = U;
  const roomAct = (type, data = {}, done) => socket.emit('room:act', { type, data }, r => { if (r && r.error) toast(r.error, 4500); else if (done) done(r); });
  const ROT = { winner: 'Winner stays on', rotate: 'Everyone rotates' };
  const ROT_HELP = { winner: 'The winner keeps battling; the loser goes to the back of the line.', rotate: 'Both players go to the back of the line after each battle.' };
  const STATUS = { battling: 'Battling', 'up next': 'Up next', 'in line': 'In line', 'sitting out': 'Sitting out', spectating: 'Watching', offline: 'Offline', 'needs a team': 'Needs a team', busy: 'In another battle' };

  // ---------- Home card ----------
  U.homeRoomHtml = () => {
    if (S.room) return `<section class="card room-home"><h2>Private room</h2><p class="muted small" style="margin-top:0">You're in room <b>${esc(S.room.code)}</b> (${S.room.members.length} ${S.room.members.length === 1 ? 'person' : 'people'}).</p><button class="primary" id="rhOpen">Open room</button></section>`;
    return `<section class="card room-home">
      <h2>Private room</h2>
      <p class="muted small" style="margin-top:0">Play with friends: take turns battling while everyone else watches. Uses the mode and format selected above.</p>
      <div class="row"><button class="primary" id="rhCreate">Create a room</button></div>
      <div class="row" style="margin-top:8px"><input id="rhCode" placeholder="Room code" maxlength="5" autocapitalize="characters" autocomplete="off" style="width:120px;text-transform:uppercase"><button id="rhJoin">Join</button></div>
    </section>`;
  };
  U.wireHomeRoom = () => {
    const o = $('#rhOpen'); if (o) o.onclick = () => { S.tab = 'room'; U.render(); };
    const c = $('#rhCreate'); if (c) c.onclick = () => socket.emit('room:create', { mode: S.mode, format: S.format, rotation: 'winner' }, r => { if (r.error) toast(r.error, 4500); else { S.tab = 'room'; } });
    const j = $('#rhJoin'), inp = $('#rhCode');
    if (j) {
      const go = () => { const code = inp.value.trim().toUpperCase(); if (!code) return toast('Type the room code your friend shared.'); socket.emit('room:join', { code }, r => { if (r.error) toast(r.error, 4500); else S.tab = 'room'; }); };
      j.onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
    }
  };

  // ---------- Room tab ----------
  function inviteLink(code) { return `${location.origin}/?room=${code}`; }
  function memberRow(m, r) {
    const host = r.isHost && m.id !== r.you.id;
    const st = STATUS[m.status] || m.status;
    return `<div class="list-item room-member ${m.id === r.you.id ? 'me' : ''}">
      <span class="rm-pos">${m.queue ? m.queue : '–'}</span>
      ${m.avatar ? U.avatarSprite(m.avatar, 'xs') : ''}
      <span class="grow">${m.account ? `<a href="#" data-profile="${esc(m.name)}">${esc(m.name)}</a>` : esc(m.name)}${m.host ? ' <span title="Host">👑</span>' : ''}${m.id === r.you.id ? ' <span class="muted small">(you)</span>' : ''}
        <div class="muted small">${m.wins}W–${m.losses}L${m.teamName ? ' · ' + esc(m.teamName) : ''}</div></span>
      <span class="pill st-${m.status.replace(/\s+/g, '-')}">${esc(st)}</span>
      ${r.isHost && m.queue ? `<button class="small icon" data-rmove="${esc(m.id)}" data-dir="-1" title="Move up">↑</button><button class="small icon" data-rmove="${esc(m.id)}" data-dir="1" title="Move down">↓</button>` : ''}
      ${host ? `<button class="small" data-rmenu="${esc(m.id)}" title="Host options">⋯</button>` : ''}
    </div>`;
  }
  function chatHtml(r) {
    return r.chat.map(c => c.sys ? `<div class="rc-sys">${esc(c.text)}</div>` : `<div class="rc-msg"><b>${esc(c.name)}:</b> ${esc(c.text)}</div>`).join('') || '<div class="muted small">No messages yet.</div>';
  }
  U.renderRoom = () => {
    const r = S.room; if (!r) { S.tab = 'home'; return U.render(); }
    U.renderTabs();
    const cur = r.current;
    const idle = !cur;
    const eliteTeams = r.mode === 'elite';
    const watchBtn = cur ? (S.matches[cur.id] ? `<button class="primary" data-rwatch="${cur.id}">${S.matches[cur.id].you !== null && S.matches[cur.id].you !== undefined ? 'Go to your battle' : 'Watch'}</button>` : `<button class="primary" data-rwatch="${cur.id}">Watch</button>`) : '';
    const hostCtl = r.isHost ? (r.running ? `<button id="rmPause">${idle ? 'Pause battles' : 'Pause after this battle'}</button>` : `<button class="primary" id="rmStart">${r.history.length ? 'Resume battles' : 'Start battling'}</button>`) : '';
    const settings = r.isHost ? `
        <div class="row wrap room-settings">
          <select id="rmMode" ${idle ? '' : 'disabled'}><option value="standard" ${r.mode === 'standard' ? 'selected' : ''}>Quick Match</option><option value="elite" ${r.mode === 'elite' ? 'selected' : ''}>Competitive</option></select>
          <select id="rmFormat" ${idle ? '' : 'disabled'}><option value="singles" ${r.format === 'singles' ? 'selected' : ''}>Singles</option><option value="doubles" ${r.format === 'doubles' ? 'selected' : ''}>Doubles</option></select>
          <select id="rmRot" ${idle ? '' : 'disabled'}>${Object.entries(ROT).map(([k, v]) => `<option value="${k}" ${r.rotation === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          ${idle ? '' : '<span class="muted small">Settings can be changed between battles.</span>'}
        </div>` : `<div class="row wrap"><span class="pill">${esc(label(r.mode, r.format))}</span><span class="pill">${ROT[r.rotation]}</span></div>`;
    const teamBox = eliteTeams ? `<div class="room-team">
        <label class="small muted">Your Strike Squad for this room</label>
        <div class="row wrap">${U.eliteSelect('rmTeam')}<button id="rmUseTeam">${r.you.hasTeam ? 'Switch team' : 'Use this team'}</button></div>
        <div class="small ${r.you.hasTeam ? '' : 'warn-text'}">${r.you.hasTeam ? `Using <b>${esc(r.you.teamName)}</b>.` : 'Pick a team to get in line.'}</div>
      </div>` : '';
    $('#view').innerHTML = `
    <div class="room-grid">
      <section class="card room-head span2">
        <div class="row wrap">
          <div class="grow"><div class="muted small">Private room</div><div class="room-code" title="Room code">${esc(r.code)}</div></div>
          <button id="rmCopy">Copy invite link</button><button id="rmLeave">Leave room</button>
        </div>
        ${settings}
        <p class="muted small" style="margin:6px 0 0">${ROT_HELP[r.rotation]} Everyone not battling watches live.</p>
      </section>
      <section class="card room-now">
        <h2>Now battling</h2>
        ${cur ? `<div class="room-vs"><b>${esc(cur.players[0])}</b><span class="vs">vs</span><b>${esc(cur.players[1])}</b></div><div class="muted small" style="text-align:center">${cur.phase === 'battle' ? 'Turn ' + cur.turn : 'Choosing teams…'}</div><div class="row" style="justify-content:center;margin-top:10px">${watchBtn}</div>`
          : `<div class="muted">${r.nextAt ? `Next battle starts in <b id="rmNext">…</b>` : r.running ? 'Waiting for at least 2 people in line…' : r.isHost ? 'Press <b>Start battling</b> when everyone is here.' : 'Waiting for the host to start.'}</div>`}
        <div class="row wrap" style="margin-top:12px">${hostCtl}${r.isHost && idle && r.nextAt ? '<button id="rmNow">Start now</button>' : ''}</div>
      </section>
      <section class="card room-you">
        <h2>You</h2>
        <div class="row wrap"><span class="grow">${r.you.inQueue ? 'You are <b>in line</b> to battle.' : 'You are <b>sitting out</b> (watching only).'}</span>
          <button id="rmQueue">${r.you.inQueue ? 'Sit out' : 'Get in line'}</button></div>
        ${teamBox}
      </section>
      <section class="card room-line">
        <h2>Line (${r.members.length})</h2>
        <div class="list">${r.members.map(m => memberRow(m, r)).join('')}</div>
        <p class="muted small">The first two people in line who are ready battle next.${r.isHost ? ' As host, use ↑ ↓ to change the order.' : ''}</p>
      </section>
      <section class="card room-chat">
        <h2>Room chat</h2>
        <div class="rc-log" id="rcLog">${chatHtml(r)}</div>
        <div class="row" style="margin-top:8px"><input id="rcIn" class="grow" maxlength="200" placeholder="Say something…" autocomplete="off"><button id="rcSend">Send</button></div>
      </section>
      <section class="card room-hist span2">
        <h2>Results</h2>
        ${r.history.length ? `<div class="list">${r.history.map(h => `<div class="list-item"><span class="grow">${h.winner === h.p1 ? '<b>' + esc(h.p1) + '</b>' : esc(h.p1)} vs ${h.winner === h.p2 ? '<b>' + esc(h.p2) + '</b>' : esc(h.p2)}</span><span class="pill">${h.winner ? esc(h.winner) + ' won' : 'Tie'}</span></div>`).join('')}</div>` : '<div class="muted small">No battles yet.</div>'}
      </section>
    </div>`;
    wire(r);
  };

  function wire(r) {
    const lg = $('#rcLog'); if (lg) lg.scrollTop = lg.scrollHeight;
    $('#rmCopy').onclick = () => { const link = inviteLink(r.code); (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => toast('Invite link copied: ' + link, 3500), () => prompt('Copy this invite link:', link)); };
    $('#rmLeave').onclick = () => { if (confirm('Leave this room?')) socket.emit('room:leave', {}, () => { S.room = null; S.tab = 'home'; U.render(); }); };
    const set = () => roomAct('settings', { mode: $('#rmMode').value, format: $('#rmFormat').value, rotation: $('#rmRot').value });
    ['#rmMode', '#rmFormat', '#rmRot'].forEach(s => { const el = $(s); if (el) el.onchange = set; });
    const st = $('#rmStart'); if (st) st.onclick = () => roomAct('start');
    const pa = $('#rmPause'); if (pa) pa.onclick = () => roomAct('pause');
    const now = $('#rmNow'); if (now) now.onclick = () => roomAct('start');
    $('#rmQueue').onclick = () => roomAct('queue', { in: !r.you.inQueue });
    const ut = $('#rmUseTeam'); if (ut) ut.onclick = () => {
      const sel = $('#rmTeam'); if (!sel || sel.disabled) return toast('Build a complete Strike Squad in the Strike Squads tab first.', 4500);
      const team = U.eliteTeamSets(+sel.value); if (!team) return;
      roomAct('team', { team, name: S.elite[+sel.value].name }, () => toast('Team set for this room.'));
    };
    $$('[data-rwatch]').forEach(b => b.onclick = () => {
      const id = b.dataset.rwatch;
      if (S.matches[id]) { S.tab = id; U.render(); }
      else socket.emit('spectate', { id }, x => { if (x.error) toast(x.error); else S.tab = id; });
    });
    $$('[data-rmove]').forEach(b => b.onclick = () => roomAct('move', { id: b.dataset.rmove, dir: +b.dataset.dir }));
    $$('[data-rmenu]').forEach(b => b.onclick = () => {
      const m = r.members.find(x => x.id === b.dataset.rmenu); if (!m) return;
      U.modal(`<h2>${esc(m.name)}</h2><div class="row wrap" style="margin-top:10px"><button id="rmHost">Make host</button><button class="danger" id="rmKick">Remove from room</button><button id="rmX">Cancel</button></div>`);
      $('#rmX').onclick = U.closeModal;
      $('#rmHost').onclick = () => { U.closeModal(); roomAct('host', { id: m.id }); };
      $('#rmKick').onclick = () => { U.closeModal(); roomAct('kick', { id: m.id }); };
    });
    const send = () => { const t = $('#rcIn').value.trim(); if (!t) return; roomAct('chat', { text: t }, () => { const i = $('#rcIn'); if (i) i.value = ''; }); };
    $('#rcSend').onclick = send; $('#rcIn').onkeydown = e => { if (e.key === 'Enter') send(); };
  }

  // keep the chat draft when the room re-renders (other people's updates arrive often)
  const _render = U.renderRoom;
  U.renderRoom = () => {
    const i = $('#rcIn'); const draft = i ? i.value : ''; const focused = i && document.activeElement === i;
    _render();
    const n = $('#rcIn'); if (n && draft) { n.value = draft; } if (n && focused) n.focus();
  };

  // countdown to the next battle
  setInterval(() => {
    const el = $('#rmNext'); if (!el || !S.room || !S.room.nextAt) return;
    el.textContent = Math.max(0, Math.ceil((S.room.nextAt - Date.now()) / 1000)) + 's';
  }, 250);
})();
