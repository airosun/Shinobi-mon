// Shinobi Card titles: the base-game and reward (honorary) titles from Naruto to Boruto: Shinobi Striker, grouped for the picker.
(function () {
  const CARD_TITLE_GROUPS = [
    ["Villages & groups", ["Leaf Ninja", "Sand Ninja", "Mist Ninja", "Stone Ninja", "Cloud Ninja", "Rain Ninja", "Sound Ninja", "Waterfall Ninja", "Steam Ninja", "Grass Ninja", "Anbu Ninja", "Foundation", "Akatsuki", "Hebi", "Taka", "Allied Shinobi Forces"]],
    ["Rogue ninja", ["Rogue Leaf Ninja", "Rogue Sand Ninja", "Rogue Mist Ninja", "Rogue Stone Ninja", "Rogue Cloud Ninja", "Rogue Rain Ninja", "Rogue Sound Ninja", "Rogue Waterfall Ninja", "Rogue Steam Ninja", "Rogue Grass Ninja"]],
    ["Fun", ["Ichiraku Lover", "Tales of a Gutsy Ninja", "Fashion Master", "Superstar"]],
    ["Legendary", ["Awakened", "Spirit World Wanderer", "Enlightened Ninja", "Infinite Ninja", "Ninshu", "Third Eye", "Divine Tree", "Forbidden Ninja", "Rabbit Goddess", "Sealed Ninja", "Pure Ninja", "Herculean Ninja", "Multi-Talented"]],
    ["Battle style", ["Battle-Hardened", "Conqueror", "Well-Honed", "Fighter", "Warrior", "Steelfist", "Chakra Blaster", "Weapon Master", "Unrivaled Sniper Ninja", "Protector", "Guardian", "Deva", "Healer", "100 Healings Master", "Skilled Fighter"]],
    ["Story & missions", ["Young Leaf", "Once-in-a-lifetime", "Old Soldier", "Walking Dictionary", "Current Student", "Seeker", "Springtime of Youth Seeker", "Chivalrous Toad", "Gatekeeper", "3-Man Cell", "Artist", "Good Correspondent", "Endurer", "Fisher", "Bodyguard", "Rhymeslinger", "Witness of Legend", "Hokage's Training Assistant", "Graduate", "Risk-runner", "Portrait of Youth", "Toad Star", "Inescapable Danger", "New Head of the Big Three", "Ninjutsu Artist", "Calligraphy Master", "Pain-numbed", "Fishing Master", "Ninja Cupid", "Singing Biologist", "Legendary Raconteur", "Tailed Beast Tamer"]],
    ["Rank up", ["Chick", "Fawn", "Golden Tigercarp", "Rising Dragon", "Full Mastery"]],
    ["Chakra natures", ["Hellfire", "Heat Haze", "Balefire", "Evening Calm", "Whirlwind", "Dust", "Rockslide", "Dangerous Peak", "Spring Tide", "Spring Haze", "Frosty Dew", "Thunderclap", "Lightning", "Sparkler", "Lightning Speed"]],
    ["Master training", ["Shadow Executor", "Boundless Ninja", "Lifedrawer", "Copy Ninja", "Young Springtime Lotus", "Sage", "Big Eater", "Byakugan", "Sand Master", "Bomb Demon", "Enchanted Sword Master", "Six Paths", "Sharingan", "Snake Master", "Seal Master", "Mischief Maker", "Monster Strength", "Strong Child"]],
    ["Clans & bonds", ["Uzumaki Clan", "Uchiha Clan", "Hokage's Disciple", "Wood Style Master", "Loving Friend", "Genius Ninja", "Might Guy's Disciple", "Nara Clan", "Akimichi Clan", "Hyuga Clan", "Friend-Devoted", "Creative Thinker", "Ally Killer", "Chain Breaker", "Loving Brother", "Self-Seeker", "Lone Flower", "The Second Great", "Next Generation Ninja", "Spawn"]],
    ["Experts & masters", ["Fist Expert", "Weapon Expert", "Obstruction Expert", "Spirit Expert", "Ninjutsu Expert", "Hidden Jutsu Master", "Code Master", "Curse Seal Master", "Drunken Fist Master", "Sage Jutsu Master", "Medical Ninjutsu Master", "Eye Jutsu Master", "Genjutsu Master", "Gedo Art Master", "Time-Space Master"]],
    ["Masks & armor", ["Noh Mask", "Long-Eyed", "Small Pupils", "White Mask", "Demon Mask", "Buddha Mask", "Faceless", "Fox-Eyed", "Cat-Eyed", "Crimson Face", "Red-Armored", "Black-Armored", "Blue-Armored", "White-Armored", "Green-Armored"]],
    ["Summons & specialties", ["Toad Master", "Ninja Hound Master", "Insect Master", "Monkey Master", "Slug Master", "Sprinter", "Silent Ninja", "Upside-Down Hanger", "Ripper", "Surefire", "Legendary Ninja", "Gourd Possessor", "Doctor", "Talisman Jutsu Master", "Fan Master", "Puppet Master", "Comeback", "Indomitable Ninja", "Collector", "Paradise Seeker", "Well-Prepared", "Priceless"]],
    ["Reward titles", ["Challenger", "Ninja World Pro", "Ninja World Powerhouse", "Ninja World Champion", "Hero", "Money Maker", "Demon Fox"]],
  ];
  const CARD_TITLES = CARD_TITLE_GROUPS.flatMap(g => g[1]);
  const api = { CARD_TITLE_GROUPS, CARD_TITLES };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.CARDTITLES = api;
})();
