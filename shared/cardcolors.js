// Battler Card color themes: [label, gradient start, middle, end, border/accent]
(function () {
  const CARD_COLORS = {
    classic: ['Classic', '#2a1c24', '#1a2232', '#1f2a1f', '#ffb020'],
    smash: ['Marvel Red', '#4a1418', '#2a1016', '#1a0c10', '#ec1d24'],
    rivals: ['Rivals Yellow', '#3a3210', '#22200e', '#121008', '#ffd21f'],
    ocean: ['Ocean', '#0f2a4a', '#123552', '#0b1e33', '#4dc3ff'],
    forest: ['Forest', '#123a22', '#1a2e1c', '#0e1f12', '#5ddc84'],
    sunset: ['Sunset', '#4a2410', '#3a1830', '#1e1230', '#ff9a3c'],
    royal: ['Royal', '#2a1a4a', '#1e1438', '#120c24', '#b38cff'],
    gold: ['Gold', '#4a3a10', '#3a2c0c', '#1e1806', '#ffd34d'],
    sakura: ['Sakura', '#4a1a38', '#3a1430', '#24101e', '#ff8ad8'],
    ice: ['Ice', '#1e3a4a', '#24404c', '#16262e', '#bfefff'],
    shadow: ['Shadow', '#1a1a22', '#101016', '#08080c', '#8a8fa8'],
    volt: ['Volt', '#3a3a0c', '#2a2a10', '#16160a', '#fff04d'],
    lava: ['Lava', '#3a0c0c', '#2a1408', '#140804', '#ff6a1a'],
  };
  const api = { CARD_COLORS };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.CARDCOLORS = api;
})();
