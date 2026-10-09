'use strict';

/**
 * Spelling-insensitive comparison of Arabic names — for duplicate detection
 * only, never for anything stored. Shared by the towns table (no town added
 * twice under two spellings) and the possible-duplicate guard on events (no
 * wedding published twice under two spellings of the groom's name).
 */

/**
 * A spelling-insensitive key: drops tashkeel and tatweel (the diacritic code
 * points only — never a range wide enough to reach a consonant), and folds
 * the variants people type interchangeably — أ/إ/آ/ٱ→ا, ة→ه, ى→ي — so
 * «عرعره» and «عرعرة» are one key.
 */
function nameKey(name) {
  return String(name)
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Words that describe a person rather than name them («العريس محمد»,
 * «المرحوم سالم») — dropped before comparing. Listed in their nameKey form,
 * without «ال». Deliberately short: folding a word that is also a real name
 * would make two different people match.
 */
const FILLER_TOKENS = new Set(['عريس', 'شاب', 'مرحوم', 'مرحومه', 'حاج', 'حاجه', 'بن', 'ابن', 'بنت']);

/** Prefixes written either joined or apart («أبو صهيبان» / «أبوصهيبان», «عبد الله» / «عبدالله»). */
const JOINING_PREFIXES = new Set(['ابو', 'عبد']);

/** Drops a leading «ال» when something meaningful is left — «الهواشلة» and «هواشلة» are one family. */
function stripArticle(token) {
  return token.startsWith('ال') && token.length > 3 ? token.slice(2) : token;
}

/**
 * A name as an ordered list of comparable tokens: normalised, punctuation
 * dropped, joining prefixes glued to the word after them, descriptive words
 * removed, and the article stripped.
 */
function nameTokens(name) {
  const raw = nameKey(name).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
  const joined = [];
  for (let i = 0; i < raw.length; i += 1) {
    if (JOINING_PREFIXES.has(raw[i]) && i + 1 < raw.length) {
      joined.push(raw[i] + raw[i + 1]);
      i += 1;
    } else {
      joined.push(raw[i]);
    }
  }
  return joined
    .filter(token => !FILLER_TOKENS.has(stripArticle(token)))
    .map(stripArticle);
}

/** Classic edit distance (insert / delete / substitute), on two short strings. */
function levenshtein(a, b) {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Two tokens are the same word when equal, or within a typo of each other —
 * none allowed on a word of three letters or fewer (too many real names sit
 * one letter apart there), one on four to seven, two on eight or more.
 */
function tokensMatch(a, b) {
  if (a === b) return true;
  const shorter = Math.min(a.length, b.length);
  const allowed = shorter <= 3 ? 0 : shorter <= 7 ? 1 : 2;
  if (allowed === 0 || Math.abs(a.length - b.length) > allowed) return false;
  return levenshtein(a, b) <= allowed;
}

/**
 * Whether two written names plausibly belong to one person. Arabic names are
 * order-sensitive and commonly drop middle names, so the shorter name must
 * appear inside the longer one in order, anchored on the same first and the
 * same last word: «محمد الهواشلة» ⊂ «محمد سالم الهواشلة» matches, while
 * «محمد سالم الهواشلة» vs «محمد علي الهواشلة» — a different father, so most
 * likely a cousin — does not.
 *
 * Returns `null` when not, or `{ exact, singleToken }`: `exact` when the
 * names are identical once normalised; `singleToken` when either is one word
 * long, which only ever matches exactly and is too weak to stand on its own.
 */
function comparePersonNames(nameA, nameB) {
  const a = nameTokens(nameA);
  const b = nameTokens(nameB);
  if (!a.length || !b.length) return null;

  const singleToken = a.length === 1 || b.length === 1;
  if (a.join(' ') === b.join(' ')) return { exact: true, singleToken };
  if (singleToken) return null;

  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (!tokensMatch(shorter[0], longer[0])) return null;
  if (!tokensMatch(shorter[shorter.length - 1], longer[longer.length - 1])) return null;

  // In-order subsequence for the middle words, between the two anchors.
  let cursor = 1;
  for (let i = 1; i < shorter.length - 1; i += 1) {
    while (cursor < longer.length - 1 && !tokensMatch(shorter[i], longer[cursor])) cursor += 1;
    if (cursor >= longer.length - 1) return null;
    cursor += 1;
  }
  return { exact: false, singleToken: false };
}

module.exports = { nameKey, nameTokens, tokensMatch, comparePersonNames };
