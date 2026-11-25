// A match runs every phase of a game between two players (or a player and the CPU):
//   Standard:  draft (pick 6 of 20) -> build (moves + items) -> preview (both 6 revealed, pick lineup) -> battle
//   Elite:     preview (pre-built teams revealed, pick lineup) -> battle
// Singles bring 3 of 6, doubles bring 4 of 6.
const { Battle } = require('./engine/battle.js');
const { rollPool } = require('./engine/roster.js');
const { validateStandardBuild } = require('./engine/validate.js');
const AI = require('./engine/ai.js');
const FIGHTERS = require('../shared/fighters.json');
const BY_ID = Object.fromEntries(FIGHTERS.map(f => [f.id, f]));

const BRING = { singles: 3, doubles: 4 };
// Champions-style clocks for player-vs-player matches (seconds)
const CLOCK = { turn: 45, bank: 7 * 60, game: 20 * 60, draft: 90, build: 240, preview: 90 };

class Match {
  constructor({ id, mode, format, players, onUpdate, timed, room, road }) {
    this.id = id; this.mode = mode === 'elite' ? 'elite' : 'standard';
    this.format = format === 'doubles' ? 'doubles' : 'singles';
    this.bring = BRING[this.format];
    this.onUpdate = onUpdate || (() => {});
    this.players = players.map(p => ({ id: p.id, name: p.name, cpu: !!p.cpu, skill: p.skill ?? 1, team: p.team || null, pool: null, picks: null, lineup: null, ready: false }));
    this.battle = null; this.result = null; this.created = Date.now(); this.log = [];
    this.timed = !!timed; this.room = room || null; this.road = road || null;   // road = Road to 50 floor info   // private room code, if this battle is part of one
    if (this.timed) { this.clock = { game: CLOCK.game * 1000, phase: 0, players: this.players.map(() => ({ bank: CLOCK.bank * 1000, turn: CLOCK.turn * 1000, waiting: false })) }; this.lastTick = Date.now(); }
    if (this.mode === 'standard') {
      this.phase = 'draft';
      for (const p of this.players) p.pool = rollPool(20);
    } else this.phase = 'preview';
    this.resetPhaseClock();
    this.cpuAct();
  }

  get ended() { return this.phase === 'ended'; }

  act(n, a) {
    const p = this.players[n];
    if (!p) return 'Not a player.';
    if (a.type === 'forfeit') return this.forfeit(n);
    if (this.phase === 'battle') {
      if (a.type === 'undo') { this.battle.undo(n); return null; }
      if (a.type !== 'choose') return 'Unknown action.';
      return this.battle.choose(n, a.choice);
    }
    if (p.ready) return 'Waiting for your opponent.';
    if (this.phase === 'draft' && a.type === 'draft') {
      const picks = [...new Set((a.picks || []).map(Number))].filter(i => p.pool[i]);
      if (picks.length !== 6) return 'Pick exactly 6 heroes.';
      p.picks = picks; p.ready = true;
    } else if (this.phase === 'build' && a.type === 'build') {
      const bases = p.picks.map(i => p.pool[i]);
      const v = validateStandardBuild(bases, a.builds);
      if (!v.ok) return v.errors.join('\n');
      p.team = v.team; p.ready = true;
    } else if (this.phase === 'preview' && a.type === 'lineup') {
      const order = (a.order || []).map(Number);
      if (order.length !== this.bring || new Set(order).size !== order.length || order.some(i => !p.team[i])) return `Choose ${this.bring} heroes in order.`;
      p.lineup = order; p.ready = true;
    } else return 'That action is not available right now.';
    this.advance();
    return null;
  }

  advance() {
    if (!this.players.every(p => p.ready)) { this.emit(); return; }
    for (const p of this.players) p.ready = false;
    if (this.phase === 'draft') this.phase = 'build';
    else if (this.phase === 'build') this.phase = 'preview';
    else if (this.phase === 'preview') { this.startBattle(); return; }
    this.resetPhaseClock();
    this.cpuAct();
    this.emit();
  }

  resetPhaseClock() { if (this.timed && CLOCK[this.phase]) this.clock.phase = CLOCK[this.phase] * 1000; }

  // Called about once a second for timed matches. Before the battle each phase has a limit (an unready
  // player gets automatic picks). In battle each decision has a turn limit (an automatic move is chosen)
  // drawn from a per-player bank (running out loses), and the whole battle has a game clock.
  tick(now = Date.now()) {
    if (!this.timed || this.ended) return;
    const dt = now - this.lastTick; this.lastTick = now;
    const c = this.clock;
    if (this.phase !== 'battle') {
      c.phase -= dt;
      if (c.phase > 0) return;
      this.players.forEach((p, n) => {
        if (p.ready || this.ended) return;
        this.log.push({ cls: 'info', text: `${p.name} ran out of time, so their choices were made automatically.` });
        if (this.phase === 'draft') this.act(n, { type: 'draft', picks: AI.draftSix(p.pool) });
        else if (this.phase === 'build') this.act(n, { type: 'build', builds: AI.buildTeam(p.picks.map(i => p.pool[i]), this.format === 'doubles') });
        else if (this.phase === 'preview') this.act(n, { type: 'lineup', order: AI.chooseLineup(p.team, this.players[1 - n].team, this.bring) });
      });
      return;
    }
    if (!this.battle || this.battle.ended) return;
    c.game -= dt;
    if (c.game <= 0) { c.game = 0; this.battle.endByTimer(); return; }
    let changed = false;
    this.players.forEach((p, n) => {
      const pc = c.players[n];
      const kind = this.battle.getRequest(n).kind;
      const waiting = kind === 'move' || kind === 'switch';
      const key = waiting ? `${this.battle.turn}:${kind}` : '';
      if (waiting !== pc.waiting || key !== pc.key) { pc.waiting = waiting; pc.key = key; pc.turn = CLOCK.turn * 1000; changed = true; }
      if (!waiting) return;
      pc.bank -= dt; pc.turn -= dt;
      if (pc.bank <= 0) { pc.bank = 0; this.battle.timeoutLoss(n); return; }
      if (pc.turn <= 0) {
        pc.turn = CLOCK.turn * 1000;
        const choice = AI.chooseAction(this.battle, n);
        this.battle.add('info', `${p.name} ran out of turn time, so a move was chosen for them.`);
        if (choice) this.battle.choose(n, choice);
        changed = true;
      }
    });
    if (changed) this.emit();
  }

  startBattle() {
    this.phase = 'battle';
    this.battle = new Battle({
      id: this.id, format: this.format,
      players: this.players.map(p => ({ name: p.name, team: p.lineup.map(i => p.team[i]) })),
      onUpdate: () => { if (this.battle && this.battle.ended && this.phase !== 'ended') { this.phase = 'ended'; this.result = this.battle.winner; } this.cpuAct(); this.emit(); },
    });
    this.startState = JSON.parse(JSON.stringify(this.battle.publicState(0)));   // for replays
    this.cpuAct();
    this.emit();
  }

  // what gets saved when a battle finishes (results, stats, replay)
  record(users) {
    if (!this.battle || !this.battle.ended) return null;
    const final = this.battle.publicState(0);
    return {
      id: this.id, mode: this.mode, format: this.format,
      players: this.players.map(p => p.name), cpu: this.players.map(p => p.cpu), users,
      winner: this.battle.winner === undefined ? null : this.battle.winner, turns: this.battle.turn,
      teams: this.players.map(p => (p.lineup || []).map(i => p.team[i].species)),
      replay: { start: this.startState, log: this.battle.log, final },
    };
  }

  forfeit(n) {
    if (this.ended) return null;
    if (this.battle) this.battle.forfeit(n);
    else { this.phase = 'ended'; this.result = 1 - n; this.log.push({ cls: 'info', text: `${this.players[n].name} forfeited.` }); this.emit(); }
    return null;
  }

  // CPU decisions (delayed slightly so the human sees things happen)
  cpuAct() {
    this.players.forEach((p, n) => {
      if (!p.cpu || this.ended || p.pending) return;
      const doubles = this.format === 'doubles';
      let fn = null;
      if (this.phase === 'draft' && !p.ready) fn = () => this.act(n, { type: 'draft', picks: AI.draftSix(p.pool) });
      else if (this.phase === 'build' && !p.ready) fn = () => this.act(n, { type: 'build', builds: AI.buildTeam(p.picks.map(i => p.pool[i]), doubles) });
      else if (this.phase === 'preview' && !p.ready) fn = () => this.act(n, { type: 'lineup', order: AI.chooseLineup(p.team, this.players[1 - n].team, this.bring) });
      else if (this.phase === 'battle' && this.battle && !this.battle.ended) {
        const req = this.battle.getRequest(n);
        if (req.kind === 'move' || req.kind === 'switch') fn = () => { const c = AI.chooseAction(this.battle, n, Math.random, p.skill); if (c) this.battle.choose(n, c); };
      }
      if (!fn) return;
      p.pending = true;
      setTimeout(() => { p.pending = false; if (!this.ended) fn(); }, this.cpuDelay ?? 400);
    });
  }

  emit() { this.onUpdate(this); }

  // what player n (or a spectator, n = null) gets to see
  view(n) {
    const me = n === null ? null : this.players[n];
    const foe = n === null ? null : this.players[1 - n];
    const out = {
      id: this.id, mode: this.mode, format: this.format, bring: this.bring, phase: this.phase, you: n,
      players: this.players.map(p => ({ name: p.name, cpu: p.cpu, ready: p.ready })), result: this.result,
      rematch: this.rematch || null, room: this.room, road: this.road,
    };
    if (this.timed) out.clock = { game: Math.max(0, Math.round(this.clock.game)), phase: Math.max(0, Math.round(this.clock.phase)), players: this.clock.players.map(x => ({ bank: Math.max(0, Math.round(x.bank)), turn: Math.max(0, Math.round(x.turn)), waiting: x.waiting })) };
    if (me) {
      if (this.phase === 'draft') out.pool = me.pool;
      if (this.phase === 'build') out.picks = me.picks.map(i => me.pool[i]);
      if (this.phase === 'preview' || this.phase === 'battle' || this.phase === 'ended') {
        if (me.team) out.myTeam = me.team;
        if (foe.team) out.foeTeam = foe.team.map(s => ({ species: s.species, gender: s.gender, name: BY_ID[s.species].name, types: BY_ID[s.species].types }));
        out.lineup = me.lineup;
      }
    }
    // once the match is over, everyone (players and spectators, CPU matches too) can see both full teams
    if (this.ended) out.teams = this.players.map(p => p.team ? {
      name: p.name, lineup: p.lineup || null,
      sets: p.team.map(s => ({ species: s.species, gender: s.gender || null, nature: s.nature, ivs: s.ivs, ability: s.ability, item: s.item || null, moves: (s.moves || []).filter(Boolean) })),
    } : null);
    if (this.battle) {
      const persp = n === null ? 0 : n;
      out.battle = { state: this.battle.publicState(persp), log: this.battle.log, request: n === null ? null : this.battle.getRequest(n) };
    } else out.log = this.log;
    return out;
  }
}

module.exports = { Match, BRING, CLOCK };
