// Private rooms: a host opens a room, friends join with a code or link, and members take turns battling.
// Everyone in the room who isn't battling spectates the current battle.
//
// Queue: members who want to battle, in order. The first two battle. When a battle ends:
//   'winner' rotation (winner stays on): the loser goes to the back, the winner keeps their spot at the front.
//   'rotate' rotation: both players go to the back.
// Members can sit out (stay in the room, only spectate). In Elite rooms each member picks a team first.
// After the host starts the room, the next battle begins automatically a few seconds after each one ends.
const { isClean } = require('./moderation.js');

const MAX_MEMBERS = 16;
const NEXT_DELAY = 10000;          // pause between battles (ms)
const OFFLINE_GRACE = 3 * 60000;   // offline members are removed after this
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function createRooms({ users, matches, startMatch, emitTo, spectate, checkMode, prepTeam, now = () => Date.now(), timers = { setTimeout, clearTimeout } }) {
  const rooms = new Map();   // code -> room

  const online = id => { const u = users.get(id); return !!(u && u.sockets.size); };
  const nameOf = id => (users.get(id) || {}).name || 'Player';
  const busyElsewhere = (id, room) => {
    const u = users.get(id); if (!u) return false;
    for (const mid of u.matches) { const e = matches.get(mid); if (e && !e.match.ended && e.room !== room.code) return true; }
    return false;
  };
  function newCode() {
    for (;;) { let c = ''; for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; if (!rooms.has(c)) return c; }
  }
  const roomOf = id => { const u = users.get(id); return u && u.room ? rooms.get(u.room) : null; };

  // can this member battle right now?
  function eligible(room, id) {
    const m = room.members.get(id);
    if (!m || !online(id) || busyElsewhere(id, room)) return false;
    return room.mode !== 'elite' || !!m.team;
  }

  function view(room, forId) {
    const cur = room.current && matches.get(room.current);
    const playing = cur && !cur.match.ended ? cur.players : [];
    const order = room.queue.filter(id => room.members.has(id));
    const upNext = order.filter(id => !playing.includes(id) && eligible(room, id)).slice(0, playing.length ? 1 : 2);
    const me = room.members.get(forId);
    return {
      code: room.code, host: room.host, isHost: room.host === forId, mode: room.mode, format: room.format, rotation: room.rotation,
      running: room.running, nextIn: room.nextAt ? Math.max(0, room.nextAt - now()) : null,   // ms until the next battle starts
      current: cur && !cur.match.ended ? { id: room.current, players: cur.players.map(nameOf), phase: cur.match.phase, turn: cur.match.battle ? cur.match.battle.turn : 0 } : null,
      members: [...room.members.values()].map(m => {
        const u = users.get(m.id) || {};
        const qi = order.indexOf(m.id);
        let status = 'spectating';
        if (playing.includes(m.id)) status = 'battling';
        else if (!online(m.id)) status = 'offline';
        else if (qi < 0) status = 'sitting out';
        else if (room.mode === 'elite' && !m.team) status = 'needs a team';
        else if (busyElsewhere(m.id, room)) status = 'busy';
        else if (upNext.includes(m.id)) status = 'up next';
        else status = 'in line';
        return { id: m.id, name: u.name || m.name, avatar: u.avatar || null, account: !!u.account, host: m.id === room.host, queue: qi >= 0 ? qi + 1 : null, status, teamName: room.mode === 'elite' ? m.teamName || null : null, wins: m.wins, losses: m.losses };
      }).sort((a, b) => (a.queue ?? 99) - (b.queue ?? 99)),
      history: room.history.slice(-12).reverse(),
      chat: room.chat.slice(-60),
      you: me ? { id: forId, inQueue: room.queue.includes(forId), teamName: me.teamName || null, hasTeam: !!me.team } : null,
    };
  }
  function broadcast(room) { for (const id of room.members.keys()) emitTo(id, 'room', view(room, id)); }
  function sys(room, text) { room.chat.push({ sys: true, text, t: now() }); if (room.chat.length > 200) room.chat.shift(); }

  function create(userId, { mode, format, rotation } = {}) {
    if (!checkMode(mode, format)) return { error: 'Unknown mode.' };
    leave(userId);
    const code = newCode();
    const room = { code, host: userId, mode, format, rotation: rotation === 'rotate' ? 'rotate' : 'winner', members: new Map(), queue: [], current: null, running: false, nextAt: 0, timer: null, history: [], chat: [], created: now() };
    rooms.set(code, room);
    addMember(room, userId);
    sys(room, `${nameOf(userId)} opened the room.`);
    broadcast(room);
    return { code };
  }

  function addMember(room, id) {
    const u = users.get(id);
    room.members.set(id, { id, name: nameOf(id), team: null, teamName: null, joined: now(), wins: 0, losses: 0 });
    room.queue.push(id);
    if (u) u.room = room.code;
  }

  function join(userId, code) {
    const room = rooms.get(String(code || '').trim().toUpperCase());
    if (!room) return { error: 'No room with that code. Check the code, or the room may have closed.' };
    if (room.members.has(userId)) { broadcast(room); watchCurrent(room, userId); return { code: room.code }; }
    if (room.members.size >= MAX_MEMBERS) return { error: `That room is full (${MAX_MEMBERS} people).` };
    leave(userId);
    addMember(room, userId);
    sys(room, `${nameOf(userId)} joined.`);
    watchCurrent(room, userId);
    broadcast(room);
    maybeSchedule(room);
    return { code: room.code };
  }

  function leave(userId) {
    const room = roomOf(userId); if (!room) return;
    const u = users.get(userId); if (u) u.room = null;
    room.members.delete(userId);
    room.queue = room.queue.filter(x => x !== userId);
    emitTo(userId, 'room', null);
    if (!room.members.size) { close(room); return; }
    sys(room, `${nameOf(userId)} left.`);
    if (room.host === userId) {
      room.host = [...room.members.values()].sort((a, b) => online(b.id) - online(a.id) || a.joined - b.joined)[0].id;
      sys(room, `${nameOf(room.host)} is now the host.`);
    }
    broadcast(room);
  }
  function close(room) { timers.clearTimeout(room.timer); rooms.delete(room.code); }

  // everyone in the room who isn't battling watches the current battle
  function watchCurrent(room, id) {
    const e = room.current && matches.get(room.current);
    if (!e || e.match.ended || e.players.includes(id)) return;
    spectate(room.current, id);
  }

  function startNext(room) {
    timers.clearTimeout(room.timer); room.timer = null; room.nextAt = 0;
    const cur = room.current && matches.get(room.current);
    if (cur && !cur.match.ended) return { error: 'A battle is already going.' };
    room.queue = room.queue.filter(id => room.members.has(id));
    const ready = room.queue.filter(id => eligible(room, id));
    if (ready.length < 2) { room.running = false; sys(room, room.mode === 'elite' ? 'Waiting for 2 people in line with a Strike Squad.' : 'Waiting for 2 people in line.'); broadcast(room); return { error: 'Not enough people in line to battle.' }; }
    const pair = ready.slice(0, 2);
    // the pair moves to the front (anyone skipped keeps their place behind them)
    room.queue = [...pair, ...room.queue.filter(id => !pair.includes(id))];
    const id = startMatch(room.mode, room.format, pair.map(cid => ({ clientId: cid, name: nameOf(cid), team: room.mode === 'elite' ? room.members.get(cid).team : null })), room.code);
    room.current = id; room.running = true;
    sys(room, `Battle: ${nameOf(pair[0])} vs ${nameOf(pair[1])}`);
    for (const mid of room.members.keys()) if (!pair.includes(mid)) spectate(id, mid);
    broadcast(room);
    return { id };
  }

  function maybeSchedule(room, delay = NEXT_DELAY) {
    if (!room.running || room.timer) return;
    const cur = room.current && matches.get(room.current);
    if (cur && !cur.match.ended) return;
    if (room.queue.filter(id => eligible(room, id)).length < 2) return;
    room.nextAt = now() + delay;
    room.timer = timers.setTimeout(() => { room.timer = null; if (rooms.has(room.code)) startNext(room); }, delay);
  }

  // called when a room battle finishes
  function matchEnded(code, matchId, result) {
    const room = rooms.get(code); if (!room || room.current !== matchId) return;
    const e = matches.get(matchId); const [a, b] = e.players;
    const winner = result === 0 ? a : result === 1 ? b : null, loser = winner === a ? b : winner === b ? a : null;
    room.history.push({ p1: nameOf(a), p2: nameOf(b), winner: winner ? nameOf(winner) : null, at: now() });
    if (winner && room.members.has(winner)) room.members.get(winner).wins++;
    if (loser && room.members.has(loser)) room.members.get(loser).losses++;
    sys(room, winner ? `${nameOf(winner)} beat ${nameOf(loser)}!` : `${nameOf(a)} and ${nameOf(b)} tied.`);
    const back = room.rotation === 'winner' && winner ? [loser] : [a, b];
    room.queue = [...room.queue.filter(id => !back.includes(id)), ...back.filter(id => room.queue.includes(id))];
    maybeSchedule(room);
    broadcast(room);
  }

  // ----- member actions -----
  function act(userId, type, data = {}) {
    const room = roomOf(userId); if (!room) return { error: 'You are not in a room.' };
    const host = room.host === userId;
    const idle = !(room.current && matches.get(room.current) && !matches.get(room.current).match.ended);
    switch (type) {
      case 'queue': {
        const inQ = room.queue.includes(userId);
        if (data.in && !inQ) { room.queue.push(userId); sys(room, `${nameOf(userId)} got in line.`); maybeSchedule(room); }
        if (!data.in && inQ) { room.queue = room.queue.filter(x => x !== userId); sys(room, `${nameOf(userId)} is sitting out.`); }
        break;
      }
      case 'team': {
        if (room.mode !== 'elite') return { error: 'Teams are only used in Competitive rooms.' };
        const v = prepTeam('elite', data.team); if (!v.ok) return { error: v.errors.join('\n') };
        const m = room.members.get(userId); m.team = v.team; m.teamName = String(data.name || 'Strike Squad').replace(/[<>]/g, '').slice(0, 30);
        maybeSchedule(room);
        break;
      }
      case 'settings': {
        if (!host) return { error: 'Only the host can change the room settings.' };
        if (!idle) return { error: 'Change settings between battles.' };
        if (data.mode !== undefined || data.format !== undefined) {
          const mode = data.mode ?? room.mode, format = data.format ?? room.format;
          if (!checkMode(mode, format)) return { error: 'Unknown mode.' };
          room.mode = mode; room.format = format;
        }
        if (data.rotation) room.rotation = data.rotation === 'rotate' ? 'rotate' : 'winner';
        sys(room, `Settings: ${room.mode === 'elite' ? 'Competitive' : 'Quick Match'} ${room.format}, ${room.rotation === 'winner' ? 'winner stays on' : 'everyone rotates'}.`);
        break;
      }
      case 'start': {
        if (!host) return { error: 'Only the host can start battles.' };
        room.running = true;
        const r = startNext(room);
        return r.error ? r : { ok: true };
      }
      case 'pause': {
        if (!host) return { error: 'Only the host can pause.' };
        room.running = false; timers.clearTimeout(room.timer); room.timer = null; room.nextAt = 0;
        sys(room, idle ? 'Battles paused.' : 'Battles will pause after this one.');
        break;
      }
      case 'kick': {
        if (!host) return { error: 'Only the host can remove people.' };
        if (data.id === userId || !room.members.has(data.id)) return { error: 'You can’t remove that person.' };
        const name = nameOf(data.id); leave(data.id); emitTo(data.id, 'roomKicked', {}); sys(room, `${name} was removed by the host.`);
        break;
      }
      case 'host': {
        if (!host) return { error: 'Only the host can do that.' };
        if (!room.members.has(data.id)) return { error: 'They are not in the room.' };
        room.host = data.id; sys(room, `${nameOf(data.id)} is now the host.`);
        break;
      }
      case 'move': {   // host reorders the line: dir -1 = earlier
        if (!host) return { error: 'Only the host can reorder the line.' };
        const i = room.queue.indexOf(data.id), j = i + (data.dir < 0 ? -1 : 1);
        if (i < 0 || j < 0 || j >= room.queue.length) break;
        [room.queue[i], room.queue[j]] = [room.queue[j], room.queue[i]];
        break;
      }
      case 'chat': {
        const text = String(data.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
        if (!text) return { error: 'Type a message.' };
        if (!isClean(text)) return { error: 'Keep it friendly: that message has language that isn’t allowed.' };
        room.chat.push({ name: nameOf(userId), text, t: now() }); if (room.chat.length > 200) room.chat.shift();
        break;
      }
      default: return { error: 'Unknown room action.' };
    }
    broadcast(room);
    return { ok: true };
  }

  // a member's browser (re)connected: send the room and resume spectating
  function reconnect(userId) {
    const room = roomOf(userId); if (!room) return;
    emitTo(userId, 'room', view(room, userId));
    watchCurrent(room, userId);
    maybeSchedule(room);
  }
  function presenceChanged(userId) { const room = roomOf(userId); if (room) broadcast(room); }

  // tidy up: drop members who have been offline a while, close empty rooms
  function sweep() {
    for (const room of rooms.values()) {
      for (const id of [...room.members.keys()]) {
        const u = users.get(id);
        if (!u || (!u.sockets.size && now() - (u.lastSeen || 0) > OFFLINE_GRACE)) leave(id);
      }
    }
  }

  return { create, join, leave, act, matchEnded, reconnect, presenceChanged, sweep, view, rooms, startNext, NEXT_DELAY };
}

module.exports = { createRooms, MAX_MEMBERS };
