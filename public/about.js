/* "What is Shinobi-mon?" tab: a guide to the site and how battles work.
   Counts (shinobi, jutsu, items, transformations) and the type chart come from the live game data. */
(() => {
  const U = window.SSBU;
  const { $, $$, esc, S, sprite, typeChip } = U;

  const goto = (tab, text) => `<a href="#" class="goto" data-goto-tab="${tab}">${text} →</a>`;
  const SECTIONS = [
    ['overview', 'What is Shinobi-mon?'],
    ['modes', 'How a match works'],
    ['types', 'The type chart'],
    ['jutsu', 'Jutsu (moves)'],
    ['transform', 'Transformations'],
    ['shinobi', 'Shinobi: stats, abilities, natures, IVs'],
    ['rooms', 'Playing friends'],
    ['tips', 'Tips'],
  ];

  function chartTable(d) {
    const T = d.types;
    const cell = (a, t) => { const v = (d.chart[a] || {})[t]; return v === undefined ? '<td></td>' : `<td class="tc-${v > 1 ? 'se' : 'nve'}">${v}×</td>`; };
    return `<div style="overflow-x:auto"><table class="type-table"><thead><tr><th class="small muted">ATK ↓ DEF →</th>${T.map(t => `<th><span class="type vert" style="background:var(--t-${t})">${t}</span></th>`).join('')}</tr></thead>
      <tbody>${T.map(a => `<tr><th>${typeChip(a)}</th>${T.map(t => cell(a, t)).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function render() {
    const d = S.dex;
    const nShinobi = d.fighters.length;
    const nMoves = new Set(d.fighters.flatMap(f => f.learnset)).size;
    const fs = Object.values(d.finalSmashes || {});
    const nItems = Object.keys(d.items).filter(i => !(d.finalSmashes || {})[i]).length;
    const showcase = ['naruto-p1', 'sasuke-p1', 'sakura-p1', 'kakashi-p1', 'gaara-p1', 'itachi', 'jiraiya', 'minato'].filter(id => S.byId[id]);

    $('#view').innerHTML = `<div class="about">
      <nav class="about-nav card"><div class="muted small" style="text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">On this page</div>${SECTIONS.map(([id, t]) => `<a href="#" data-jump="${id}">${esc(t)}</a>`).join('')}</nav>
      <div class="about-body">

      <section class="card about-shinobi" id="ab-overview">
        <div class="about-sprites">${showcase.map(id => sprite(S.byId[id], 'sm')).join('')}</div>
        <h2>What is Shinobi-mon?</h2>
        <p>A Pokémon-style battle site where every shinobi from Shinobi Showdown is a "mon". There are <b>${nShinobi} shinobi</b> (each era and form is its own entry), <b>${nMoves} jutsu</b>, <b>${nItems} items</b> and <b>${fs.length} transformations</b>.</p>
        <p>Types come from chakra natures: the five basic natures, Yin and Yang, the kekkei genkai (Wood, Ice, Lava, Storm, Magnet, Boil, Explosion, Dust), and four types for shinobi who fight without a nature: <b>Taijutsu</b>, <b>Weapon</b>, <b>Beast</b> and <b>Sage</b>.</p>
        <div class="row">${goto('home', 'Start a battle')} ${goto('dex', 'Browse the Shinobidex')}</div>
      </section>

      <section class="card" id="ab-modes"><h2>How a match works</h2>
        <ul class="about-list">
          <li><b>Formats (level 50):</b> <b>Singles</b> (bring 6, pick 3) and <b>Doubles</b> (bring 6, pick 4). In Doubles, jutsu that hit every foe deal 75% damage to each.</li>
          <li><b>Quick Match:</b> you get 20 random shinobi with random natures, IVs and either their ability or hidden ability. Pick 6, give each up to 4 jutsu and an item, see both teams, pick your lineup in secret, then battle.</li>
          <li><b>Competitive:</b> order a bowl at ${goto('pass', 'Ichiraku Ramen')} each day (3 bowls, 20 random shinobi per bowl, keep up to 5) to collect a roster, build a ${goto('elite', 'Strike Squad')} of 6 with jutsu, items and genders set, then take it into battle.</li>
          <li><b>One version of each shinobi per team.</b> Naruto (Part I) and Naruto (Sage Mode) can't be on the same team. One of each item per team too.</li>
          <li>Play the <b>CPU</b> any time, or <b>Find opponent</b> to play another person. Player battles are timed (45 seconds a turn, a 7-minute time bank, a 20-minute game clock). CPU battles aren't.</li>
          <li>Every battle gets a <b>replay link</b>, and the ${goto('stats', 'Stats')} tab tracks usage.</li>
        </ul>
      </section>

      <section class="card" id="ab-types"><h2>The type chart</h2>
        <p class="small">Super effective is <b>2×</b>, resisted is <b>0.5×</b>, and there are no immunities. Dual types multiply, so a hit can be anywhere from <b>4×</b> to <b>0.25×</b>. Kekkei genkai are types in their own right; their parent natures don't change damage. Using a jutsu of one of your own types gives the usual <b>1.5×</b> same-type bonus.</p>
        ${chartTable(d)}
        <p class="muted small">Status effects: Fire types can't be burned, Lightning types can't be paralyzed, Weapon types can't be poisoned, and Ice types can't be frozen.</p>
      </section>

      <section class="card" id="ab-jutsu"><h2>Jutsu (moves)</h2>
        <ul class="about-list">
          <li>Every jutsu from Shinobi Showdown is a move, and <b>every jutsu has a type</b>, support jutsu included. A jutsu with a chakra nature uses that nature as its type.</li>
          <li><b>Taijutsu</b> is physical (uses Attack); ninjutsu and genjutsu are special (use Sp. Atk); support jutsu are status moves.</li>
          <li>Genjutsu usually confuses (strong genjutsu can put the target to sleep), binding jutsu paralyze, and clone jutsu make a Substitute.</li>
          <li>Every shinobi can also learn <b>Kunai &amp; Shuriken</b> (Weapon, +1 priority), <b>Substitution Jutsu</b> (protects for a turn) and <b>Body Flicker</b> (hits, then switches out).</li>
          <li>Some big jutsu (like Night Guy or Tailed Beast Bomb) can only be used <b>after the shinobi transforms</b>.</li>
        </ul>
      </section>

      <section class="card" id="ab-transform"><h2>Transformations</h2>
        <p class="small">A shinobi holding its transformation scroll can transform <b>once per battle</b>, before it moves. Only <b>one shinobi per team</b> can transform each battle. HP stays the same; its stats (+100 total), types and ability change for the rest of the battle.</p>
        <table class="about-table"><thead><tr><th>Transformation</th><th>Shinobi</th><th>Types</th><th>Ability</th></tr></thead><tbody>
          ${fs.map(x => `<tr><td><b>${esc(x.name)}</b><div class="muted small">Scroll: ${esc(x.stone)}</div></td><td>${x.bases.map(b => esc((S.byId[b] || {}).name || b)).join(', ')}</td><td>${x.types.map(typeChip).join(' ')}</td><td><b>${esc(x.ability.name)}</b>: ${esc(x.ability.desc)}</td></tr>`).join('')}
        </tbody></table>
      </section>

      <section class="card" id="ab-shinobi"><h2>Shinobi: stats, abilities, natures, IVs</h2>
        <ul class="about-list">
          <li><b>Base stats</b> are converted from Shinobi Showdown: HP stays HP, TAI becomes Attack, NIN becomes Sp. Atk, DEF becomes Defense, SPD becomes Speed, and Sp. Def is built from DEF, NIN and Chakra.</li>
          <li><b>Abilities:</b> every shinobi has an ability and a <b>hidden ability</b> based on its lore (Kurenai traps a foe in genjutsu on arrival, Shino's insects drain foes each turn, Hidan makes attackers share his pain). No two abilities have the same effect, and every transformation has its own ability too.</li>
          <li><b>Natures and IVs</b> work as in Pokémon: a nature raises one stat by 10% and lowers another, and IVs (0–31) add a little to each stat. EVs are 0 for now.</li>
        </ul>
      </section>

      <section class="card" id="ab-rooms"><h2>Playing friends</h2>
        <ul class="about-list">
          <li><b>Create a room</b> on Home to get a room code and invite link. Everyone in line takes turns battling while the rest watch, with room chat and a running record.</li>
          <li>You can also challenge anyone in the Online list on Home.</li>
        </ul>
      </section>

      <section class="card" id="ab-tips"><h2>Tips</h2>
        <ul class="about-list">
          <li>Check a foe's types in team preview with the <b>Types</b> button at the top.</li>
          <li>Transforming changes your types, so a matchup can flip mid-battle.</li>
          <li>Run matchups through the ${goto('calc', 'Calc')} before a big battle.</li>
        </ul>
        <div class="row" style="margin-top:10px"><button class="primary" data-goto-tab="home">Start battling</button></div>
      </section>
      </div></div>`;

    $$('[data-goto-tab]').forEach(a => a.onclick = e => { e.preventDefault(); S.tab = a.dataset.gotoTab; U.render(); window.scrollTo(0, 0); });
    $$('[data-jump]').forEach(a => a.onclick = e => { e.preventDefault(); const el = document.getElementById('ab-' + a.dataset.jump); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }
  U.renderAbout = render;
})();
