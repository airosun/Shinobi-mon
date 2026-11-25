// Generates the base data (type, power, accuracy, PP, flags, secondary effects) for moves that the hero
// move pools use but shared/moves.js doesn't have yet, from Gen 9 data. Dev-only: run `npm i --no-save @pkmn/dex`
// first, then `node tools/gen_moves.js > /tmp/new_moves.js` and paste the lines into shared/moves.js.
// X below holds the engine-specific keys (special effects) that get merged over the generated base.
const {Dex}=require('@pkmn/dex');
const MOVES=require('../shared/moves.js');
const pools=require('./source/movepools.json');
const need=[...new Set(pools.map(p=>p.move))].filter(n=>!MOVES[n]).sort();
// engine-specific extras per move (merged over the generated base)
const X={
 'Life Dew':{special:'lifedew'}, 'Revival Blessing':{special:'revival'},
 'Heal Pulse':{special:'healpulse',heal:0.5}, 'Floral Healing':{special:'healpulse',heal:0.5,floral:true},
 'Wide Guard':{special:'wideguard'}, 'Coaching':{special:'allyboost',allyBoosts:{atk:1,def:1}},
 'Magnetic Flux':{special:'teamboost',allyBoosts:{def:1,spd:1}}, 'Gear Up':{special:'teamboost',allyBoosts:{atk:1,spa:1}},
 'Ally Switch':{special:'allyswitch'}, 'Mean Look':{special:'meanlook'}, 'Block':{special:'meanlook'},
 'Obstruct':{special:'protect',protectKind:'obstruct'}, 'Spiky Shield':{special:'protect',protectKind:'spiky'}, 'Silk Trap':{special:'protect',protectKind:'silk'},
 'Endure':{special:'endure'}, 'Lunar Dance':{special:'lunardance'}, 'Purify':{special:'purify'},
 'Misty Terrain':{terrain:'misty'}, 'Electric Terrain':{terrain:'electric'}, 'Psychic Terrain':{terrain:'psychic'},
 'Curse':{special:'curse'}, 'Lock-On':{special:'lockon'}, 'Laser Focus':{special:'laserfocus'}, 'Destiny Bond':{special:'destinybond'},
 'Magnet Rise':{special:'magnetrise'}, 'Charge':{special:'charge'}, 'Aqua Ring':{special:'aquaring'},
 'Transform':{special:'transform'}, 'Aurora Veil':{side:'auroraveil'}, 'Lucky Chant':{side:'luckychant'},
 'Helping Hand':{special:'helpinghand'}, 'Imprison':{special:'imprison'}, 'Magic Room':{field:'magicroom'},
 'Tidy Up':{special:'tidyup'}, 'Teeter Dance':{special:'teeterdance'}, 'Follow Me':{special:'followme'},
 'Mimic':{special:'mimic'}, 'Splash':{special:'splash'}, 'Spite':{special:'spite'}, 'Attract':{special:'attract'},
 'Captivate':{special:'captivate'}, 'Foresight':{special:'foresight'}, 'Sweet Kiss':{special:'confuse'},
 'Doom Desire':{special:'futuresight'}, 'Hyper Beam':{special:'recharge'},
 'Bind':{special:'bind'}, 'Wrap':{special:'bind'}, 'Whirlpool':{special:'bind'}, 'Fire Spin':{special:'bind'}, 'Snap Trap':{special:'bind'},
 'Jaw Lock':{special:'jawlock'}, 'Endeavor':{special:'endeavor'}, 'Reversal':{special:'reversal'}, 'Super Fang':{special:'superfang'},
 'Last Resort':{special:'lastresort'}, 'Rage':{special:'rage'}, 'Retaliate':{special:'retaliate'}, 'Payback':{special:'payback'},
 'Assurance':{special:'assurance'}, 'Lash Out':{special:'lashout'}, 'Fishious Rend':{special:'boltbeak'}, 'Bolt Strike':{},
 'Electro Ball':{special:'electroball'}, 'Rage Fist':{special:'ragefist'}, 'Last Respects':{special:'lastrespects'},
 'First Impression':{special:'firstimpression'}, 'Pollen Puff':{special:'pollenpuff'}, 'Water Spout':{special:'eruption'},
 'Eerie Spell':{special:'eeriespell'}, 'Clear Smog':{special:'clearsmog'}, 'Venoshock':{special:'venoshock'},
 'Alluring Voice':{special:'alluring'}, 'Mind Blown':{special:'mindblown'}, 'Burn Up':{special:'burnup'},
 'Spectral Thief':{special:'spectralthief'}, 'Flying Press':{special:'flyingpress'}, 'Expanding Force':{special:'expandingforce'},
 'Rising Voltage':{special:'risingvoltage'}, 'Weather Ball':{special:'weatherball'}, 'Electro Shot':{charge:true,rainSkip:true,chargeBoost:{spa:1}},
 'Supercell Slam':{special:'crash'}, 'Thunderclap':{special:'sucker'}, 'Covet':{special:'thief'}, 'Foul Play':{special:'foulplay'},
 'Infernal Parade':{special:'hex'}, 'Low Kick':{power:60}, 'Psyblade':{special:'psyblade'}, 'Feint':{breaksProtect:true},
 'Sky Attack':{charge:true}, 'Population Bomb':{multiacc:true}, 'Thrash':{special:'outrage'},
 'Fiery Wrath':{}, 'Flash':{}, 'Smokescreen':{}, 'Hone Claws':{}, 'Cosmic Power':{},
};
const FLAGS=['contact','punch','bite','sound','pulse','bullet','slicing','wind','powder','dance'];
const BEAM=['Hyper Beam','Tri Attack','Swift','Focus Blast','Charge Beam','Zap Cannon','Psybeam','Steel Beam','Ice Beam','Signal Beam','Aurora Beam','Solar Beam','Flash Cannon','Electro Shot','Meteor Beam','Dazzling Gleam','Bubble Beam','Mirror Shot','Power Gem'];
const vol=v=>v==='flinch'?'flinch':v==='confusion'?'confusion':null;
function secOf(s){ const e={chance:s.chance||100}; if(s.status)e.status=s.status; if(vol(s.volatileStatus))e.volatile=vol(s.volatileStatus); if(s.boosts)e.boosts=s.boosts; if(s.self&&s.self.boosts)e.self=s.self.boosts; return (e.status||e.volatile||e.boosts||e.self)?e:null; }
const lines=[], spreadFoes=[], spreadAll=[], selfT=[], allyT=[];
for(const n of need){
  const d=Dex.moves.get(n); if(!d.exists){console.error('NOT FOUND',n);continue;}
  const o={};
  for(const f of FLAGS) if(d.flags[f]) o[f]=true;
  if(d.priority) o.prio=d.priority;
  if(d.critRatio>1) o.crit=d.critRatio-1;
  const secs=(d.secondaries||[]).map(secOf).filter(Boolean); if(secs.length) o.sec=secs;
  if(d.self&&d.self.boosts&&d.category!=='Status') o.selfBoost=d.self.boosts;
  if(d.recoil) o.recoil=d.recoil[0]/d.recoil[1];
  if(d.drain) o.drain=d.drain[0]/d.drain[1];
  if(d.multihit) o.multihit=d.multihit;
  if(d.category==='Status'){
    if(d.status) o.status=d.status;
    if(d.boosts) o.boosts=Object.assign({target:(d.target==='self'||d.target==='adjacentAllyOrSelf'||d.target==='allies'||d.target==='allySide')?'self':'foe'},d.boosts);
    if(d.heal&&!X[n]?.special) o.heal=d.heal[0]/d.heal[1];
    if(d.volatileStatus==='confusion') o.special='confuse';
  }
  if(d.flags.charge) o.charge=true;
  if(d.selfdestruct) o.special='explosion';
  if(BEAM.includes(n)) o.beam=true;
  Object.assign(o,X[n]||{});
  let power=o.power!==undefined?o.power:d.basePower; delete o.power;
  const acc=d.accuracy===true?true:d.accuracy;
  if(['allAdjacentFoes'].includes(d.target)) spreadFoes.push(n);
  if(['allAdjacent'].includes(d.target)) spreadAll.push(n);
  if(['self','allySide','allies','adjacentAllyOrSelf','all','foeSide'].includes(d.target)&&d.category==='Status'&&!o.status) selfT.push(n);
  if(d.target==='adjacentAlly') allyT.push(n);
  lines.push(`m(${JSON.stringify(n)}, '${d.type}', '${d.category}', ${power}, ${acc}, ${d.pp}, ${JSON.stringify(o).replace(/"([a-zA-Z]+)":/g,'$1: ')});`);
}
console.log('// ---------- MARVEL-mon additions (generated from Gen 9 data by tools/gen_moves.js, then hand-tuned) ----------');
console.log(lines.join('\n'));
console.log(`const EXTRA_SPREAD_FOES = ${JSON.stringify(spreadFoes)};`);
console.log(`const EXTRA_SPREAD_ALL = ${JSON.stringify(spreadAll)};`);
console.log(`const EXTRA_SELF = ${JSON.stringify(selfT)};`);
console.log(`const ALLY_TARGET = ${JSON.stringify(allyT)};`);
// beam flag for existing moves
console.log(`for (const n of ${JSON.stringify(BEAM)}) if (MOVES[n]) MOVES[n].beam = true;`);
console.log(`for (const n of ['Swords Dance','Dragon Dance','Quiver Dance','Teeter Dance','Fiery Dance','Lunar Dance','Feather Dance','Petal Dance']) if (MOVES[n]) MOVES[n].dance = true;`);
