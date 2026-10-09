/** Comparison key for search boxes. Accents match the plain letter: jamón and jamon. */
export function foldSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function tokenizeSearchText(value: string) {
  return foldSearchText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

/** Bounded Levenshtein — early-exits when distance would exceed `maxDist`. */
export function levenshteinWithin(a: string, b: string, maxDist: number) {
  if (a === b) return 0;
  const aLen = a.length;
  const bLen = b.length;
  if (Math.abs(aLen - bLen) > maxDist) return maxDist + 1;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  let prev = new Array<number>(bLen + 1);
  let curr = new Array<number>(bLen + 1);
  for (let j = 0; j <= bLen; j += 1) prev[j] = j;

  for (let i = 1; i <= aLen; i += 1) {
    curr[0] = i;
    let rowMin = curr[0];
    const aChar = a.charCodeAt(i - 1);
    for (let j = 1; j <= bLen; j += 1) {
      const cost = aChar === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j]! < rowMin) rowMin = curr[j]!;
    }
    if (rowMin > maxDist) return maxDist + 1;
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[bLen]!;
}

function maxTypoDistance(tokenLength: number) {
  if (tokenLength >= 8) return 2;
  if (tokenLength >= 4) return 1;
  return 0;
}

/**
 * True when `needle` appears in `haystack`, or approximately matches a word
 * (typos / missing letter) for needles long enough to be meaningful.
 */
export function fuzzyIncludes(haystack: string, needle: string) {
  if (!needle) return true;
  if (!haystack) return false;
  if (haystack.includes(needle)) return true;

  const maxDist = maxTypoDistance(needle.length);
  if (maxDist <= 0) return false;

  const words = tokenizeSearchText(haystack);
  for (const word of words) {
    if (Math.abs(word.length - needle.length) > maxDist) {
      // Prefix typos: "hamburgesa" vs "hamburguesa clasica" token hamburguesa
      if (word.length > needle.length) {
        const head = word.slice(0, needle.length);
        if (levenshteinWithin(head, needle, maxDist) <= maxDist) return true;
      }
      continue;
    }
    if (levenshteinWithin(word, needle, maxDist) <= maxDist) return true;
  }
  return false;
}

/** Score how well a folded needle matches a folded haystack (0 = no match). */
export function scoreFoldedMatch(haystack: string, needle: string) {
  if (!needle || !haystack) return 0;
  if (haystack === needle) return 100;
  if (haystack.startsWith(needle)) return 86;
  if (haystack.includes(needle)) return 72;

  const tokens = tokenizeSearchText(needle);
  if (tokens.length === 0) return 0;

  let exactTokens = 0;
  let fuzzyTokens = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) {
      exactTokens += 1;
      continue;
    }
    if (fuzzyIncludes(haystack, token)) {
      fuzzyTokens += 1;
    }
  }

  if (exactTokens === tokens.length) return tokens.length > 1 ? 64 : 54;
  if (exactTokens + fuzzyTokens === tokens.length && tokens.length > 0) {
    return exactTokens > 0 ? 48 : 40;
  }
  if (exactTokens > 0 || fuzzyTokens > 0) {
    const covered = exactTokens + fuzzyTokens * 0.75;
    return Math.round(28 + (covered / tokens.length) * 18);
  }

  // Whole-query fuzzy against full haystack words (single-token typos).
  if (tokens.length === 1 && fuzzyIncludes(haystack, tokens[0]!)) return 38;
  return 0;
}
