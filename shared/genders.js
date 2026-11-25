// Gender for each hero. type: M (male), F (female), N (genderless), B (both), X (either: rolled in
// Quick Match using the male percentage, chosen in Competitive).
(function () {
  const GENDERS = {
   "naruto-p1": {
    "type": "M"
   },
   "naruto-p1-nine-tails-cloak-one-tail": {
    "type": "M"
   },
   "naruto-ship": {
    "type": "M"
   },
   "naruto-ship-nine-tails-cloak-four-tails": {
    "type": "M"
   },
   "naruto-sage": {
    "type": "M"
   },
   "naruto-sage-sage-mode": {
    "type": "M"
   },
   "naruto-war": {
    "type": "M"
   },
   "naruto-war-sage-of-six-paths-mode": {
    "type": "M"
   },
   "sasuke-p1": {
    "type": "M"
   },
   "sasuke-p1-curse-mark-level-1": {
    "type": "M"
   },
   "sasuke-ship": {
    "type": "M"
   },
   "sasuke-ship-curse-mark-level-2": {
    "type": "M"
   },
   "sasuke-ms": {
    "type": "M"
   },
   "sasuke-ms-susano-o": {
    "type": "M"
   },
   "sasuke-war": {
    "type": "M"
   },
   "sasuke-war-rinne-sharingan": {
    "type": "M"
   },
   "sakura-p1": {
    "type": "F"
   },
   "sakura-shippuden": {
    "type": "F"
   },
   "sakura-war": {
    "type": "F"
   },
   "sakura-war-strength-of-a-hundred-seal": {
    "type": "F"
   },
   "kakashi-p1": {
    "type": "M"
   },
   "kakashi-ship": {
    "type": "M"
   },
   "kakashi-ship-mangekyo-sharingan": {
    "type": "M"
   },
   "kakashi-dms": {
    "type": "M"
   },
   "kakashi-dms-perfect-susano-o": {
    "type": "M"
   },
   "sai": {
    "type": "M"
   },
   "yamato": {
    "type": "M"
   },
   "hinata-p1": {
    "type": "F"
   },
   "hinata-ship": {
    "type": "F"
   },
   "hinata-ship-twin-lion-fists": {
    "type": "F"
   },
   "neji-p1": {
    "type": "M"
   },
   "neji-ship": {
    "type": "M"
   },
   "lee-p1": {
    "type": "M"
   },
   "lee-p1-eight-inner-gates-fifth-gate": {
    "type": "M"
   },
   "lee-ship": {
    "type": "M"
   },
   "lee-ship-eight-inner-gates-sixth-gate": {
    "type": "M"
   },
   "tenten-p1": {
    "type": "F"
   },
   "tenten-ship": {
    "type": "F"
   },
   "guy": {
    "type": "M"
   },
   "guy-eight-gates-gate-of-death": {
    "type": "M"
   },
   "kiba-p1": {
    "type": "M"
   },
   "kiba-ship": {
    "type": "M"
   },
   "kiba-ship-man-beast-clone-two-headed-wolf": {
    "type": "M"
   },
   "shino-p1": {
    "type": "M"
   },
   "shino-ship": {
    "type": "M"
   },
   "shikamaru-p1": {
    "type": "M"
   },
   "shikamaru-ship": {
    "type": "M"
   },
   "choji-p1": {
    "type": "M"
   },
   "choji-p1-three-colored-pills-curry-pill": {
    "type": "M"
   },
   "choji-ship": {
    "type": "M"
   },
   "choji-ship-butterfly-mode": {
    "type": "M"
   },
   "ino-p1": {
    "type": "F"
   },
   "ino-ship": {
    "type": "F"
   },
   "kurenai": {
    "type": "F"
   },
   "asuma": {
    "type": "M"
   },
   "gaara-p1": {
    "type": "M"
   },
   "gaara-p1-partial-shukaku": {
    "type": "M"
   },
   "gaara-ship": {
    "type": "M"
   },
   "temari-p1": {
    "type": "F"
   },
   "temari-ship": {
    "type": "F"
   },
   "kankuro-p1": {
    "type": "M"
   },
   "kankuro-ship": {
    "type": "M"
   },
   "chiyo": {
    "type": "F"
   },
   "orochimaru-p1": {
    "type": "M"
   },
   "orochimaru-p1-eight-branches-technique": {
    "type": "M"
   },
   "orochimaru-ship": {
    "type": "M"
   },
   "orochimaru-ship-eight-branches-technique": {
    "type": "M"
   },
   "kabuto-p1": {
    "type": "M"
   },
   "kabuto-sage": {
    "type": "M"
   },
   "kabuto-sage-dragon-sage-mode": {
    "type": "M"
   },
   "jirobo": {
    "type": "M"
   },
   "jirobo-curse-mark-level-2": {
    "type": "M"
   },
   "kidomaru": {
    "type": "M"
   },
   "kidomaru-curse-mark-level-2": {
    "type": "M"
   },
   "sakon-ukon": {
    "type": "M"
   },
   "sakon-ukon-curse-mark-level-2": {
    "type": "M"
   },
   "tayuya": {
    "type": "F"
   },
   "tayuya-curse-mark-level-2": {
    "type": "F"
   },
   "kimimaro": {
    "type": "M"
   },
   "kimimaro-curse-mark-level-2": {
    "type": "M"
   },
   "zabuza": {
    "type": "M"
   },
   "haku": {
    "type": "M"
   },
   "anko": {
    "type": "F"
   },
   "anko-curse-mark-of-heaven": {
    "type": "F"
   },
   "danzo": {
    "type": "M"
   },
   "obito-tobi": {
    "type": "M"
   },
   "obito-masked": {
    "type": "M"
   },
   "zetsu-white": {
    "type": "M"
   },
   "zetsu-black": {
    "type": "M"
   },
   "kisame": {
    "type": "M"
   },
   "kisame-samehada-fusion": {
    "type": "M"
   },
   "itachi": {
    "type": "M"
   },
   "itachi-susano-o": {
    "type": "M"
   },
   "deidara": {
    "type": "M"
   },
   "hidan": {
    "type": "M"
   },
   "hidan-death-possession-blood": {
    "type": "M"
   },
   "kakuzu": {
    "type": "M"
   },
   "kakuzu-earth-grudge-fear-masks": {
    "type": "M"
   },
   "sasori": {
    "type": "M"
   },
   "sasori-human-puppet-body": {
    "type": "M"
   },
   "konan": {
    "type": "F"
   },
   "konan-paper-angel": {
    "type": "F"
   },
   "nagato-pain": {
    "type": "M"
   },
   "nagato-reanimated": {
    "type": "M"
   },
   "suigetsu": {
    "type": "M"
   },
   "karin": {
    "type": "F"
   },
   "jugo": {
    "type": "M"
   },
   "jugo-sage-transformation": {
    "type": "M"
   },
   "hashirama": {
    "type": "M"
   },
   "hashirama-sage-mode": {
    "type": "M"
   },
   "tobirama": {
    "type": "M"
   },
   "hiruzen": {
    "type": "M"
   },
   "minato": {
    "type": "M"
   },
   "minato-nine-tails-chakra-mode": {
    "type": "M"
   },
   "tsunade": {
    "type": "F"
   },
   "tsunade-strength-of-a-hundred-seal": {
    "type": "F"
   },
   "jiraiya": {
    "type": "M"
   },
   "jiraiya-sage-mode": {
    "type": "M"
   },
   "raikage-a": {
    "type": "M"
   },
   "killer-bee": {
    "type": "M"
   },
   "killer-bee-eight-tails-full-form": {
    "type": "M"
   },
   "darui": {
    "type": "M"
   },
   "karui": {
    "type": "F"
   },
   "mei": {
    "type": "F"
   },
   "chojuro": {
    "type": "M"
   },
   "ao": {
    "type": "M"
   },
   "gengetsu": {
    "type": "M"
   },
   "yagura": {
    "type": "M"
   },
   "yagura-three-tails-isobu": {
    "type": "M"
   },
   "onoki": {
    "type": "M"
   },
   "kurotsuchi": {
    "type": "F"
   },
   "akatsuchi": {
    "type": "M"
   },
   "mu": {
    "type": "M"
   },
   "obito-war": {
    "type": "M"
   },
   "obito-war-ten-tails-jinchuriki": {
    "type": "M"
   },
   "madara-reanimated": {
    "type": "M"
   },
   "madara-reanimated-perfect-susano-o": {
    "type": "M"
   },
   "madara-six-paths": {
    "type": "M"
   },
   "kaguya": {
    "type": "F"
   },
   "fu": {
    "type": "F"
   },
   "fu-seven-tails-chomei": {
    "type": "F"
   },
   "utakata": {
    "type": "M"
   },
   "utakata-six-tails-saiken": {
    "type": "M"
   },
   "han": {
    "type": "M"
   },
   "han-five-tails-kokuo": {
    "type": "M"
   },
   "roshi": {
    "type": "M"
   },
   "roshi-four-tails-son-goku": {
    "type": "M"
   },
   "yugito": {
    "type": "F"
   },
   "yugito-two-tails-matatabi": {
    "type": "F"
   },
   "hanzo": {
    "type": "M"
   },
   "iruka": {
    "type": "M"
   },
   "konohamaru": {
    "type": "M"
   },
   "kushina": {
    "type": "F"
   },
   "mifune": {
    "type": "M"
   },
   "rasa": {
    "type": "M"
   },
   "shisui": {
    "type": "M"
   },
   "shisui-perfect-susano-o": {
    "type": "M"
   },
   "shizune": {
    "type": "F"
   }
  };
  const FORM_IMAGES = {};
  const SYMBOL = { M: '♂', F: '♀' };
  function info(id) { return GENDERS[id] || { type: 'N' }; }
  // the gender a fighter has when nothing is chosen (old saved fighters, fixed genders)
  function defaultGender(id) { const g = info(id); return g.type === 'X' ? g.default : g.type; }
  function choices(id) { return info(id).type === 'X' ? ['M', 'F'] : [defaultGender(id)]; }
  function roll(id, rng = Math.random) { const g = info(id); return g.type === 'X' ? (rng() * 100 < g.male ? 'M' : 'F') : g.type; }
  function normalize(id, gender) { return choices(id).includes(gender) ? gender : defaultGender(id); }
  // M and F can be infatuated by the opposite gender; genderless and "both" never are
  function opposite(a, b) { return (a === 'M' && b === 'F') || (a === 'F' && b === 'M'); }
  function image(id, gender, fallback) { const g = GENDERS[id]; const alt = (g && g.images && g.images[gender]) || (FORM_IMAGES[id] && FORM_IMAGES[id][gender]); return alt || fallback; }
  function label(id) { const g = info(id); return g.type === 'X' ? g.male + '% male / ' + (100 - g.male) + '% female' : { M: 'Male', F: 'Female', N: 'Genderless', B: 'Both (one of each)' }[g.type]; }
  const api = { GENDERS, FORM_IMAGES, SYMBOL, info, defaultGender, choices, roll, normalize, opposite, image, label };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.GENDER = api;
})();
