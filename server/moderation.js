// Blocks curse words and slurs in player-written text (Battler Cards). Uses the "obscenity" library's
// English word list, which also catches disguised spellings (leetspeak, repeated or swapped letters).
const { RegExpMatcher, TextCensor, DataSet, pattern, englishDataset, englishRecommendedTransformers } = require('obscenity');

// slurs the library's list doesn't include (checked with their own matcher so the library's
// whitelist can't cancel them out)
const EXTRA = [pattern`|spic|`, pattern`|spics|`, pattern`|spick|`, pattern`wetback`, pattern`dykie`, pattern`|nigg`];
const extraSet = new DataSet(); for (const p of EXTRA) extraSet.addPhrase(ph => ph.addPattern(p));
const matchers = [
  new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers }),
  new RegExpMatcher({ ...extraSet.build(), ...englishRecommendedTransformers }),
];
const matcher = { hasMatch: t => matchers.some(m => m.hasMatch(t)), getAllMatches: t => matchers[0].getAllMatches(t, true) };
// harmless words the list would otherwise flag
const SAFE = /\b(shiitake|dick grayson)\b/gi;
const censor = new TextCensor();

// "f u c k" / "s.h.i.t": join runs of single letters split by spaces or punctuation
const spacedOut = text => String(text).replace(/(?:\b[a-z0-9@$!*][\s._\-*~]+){2,}[a-z0-9@$!*]\b/gi, m => m.replace(/[\s._\-*~]+/g, ''));

function isClean(text) {
  if (!text) return true;
  const t = String(text).replace(SAFE, ' ');
  return !matcher.hasMatch(t) && !matcher.hasMatch(spacedOut(t));
}
// for showing text that was saved before a word was added to the list
function mask(text) {
  if (!text) return text;
  let t = String(text);
  t = censor.applyTo(t, matcher.getAllMatches(t));
  return isClean(t) ? t : '*'.repeat(Math.min(t.length, 12));
}

module.exports = { isClean, mask };
