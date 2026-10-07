/*
 * Fractional positions: strings over an ordered alphabet, compared as plain
 * strings. Between any two there is always another, so an item can be
 * placed between its neighbours without renumbering them. Keys never end in
 * the smallest digit, which keeps room below every key.
 */

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** A position after `before` and before `after`; null means unbounded on that side. */
export function positionBetween(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) throw new Error(`no position between ${before} and ${after}`);
  if (before !== null && after === null) return stepAfter(before);
  return midpoint(before ?? "", after);
}

/** Appending is the common case, so it takes the smallest step instead of halving the gap. */
function stepAfter(key: string): string {
  const last = DIGITS.indexOf(key.at(-1)!);
  if (last < DIGITS.length - 1) return key.slice(0, -1) + DIGITS[last + 1];
  return key + DIGITS[DIGITS.length / 2];
}

function midpoint(low: string, high: string | null): string {
  if (high !== null) {
    let common = 0;
    while ((low[common] ?? DIGITS[0]) === high[common]) common += 1;
    if (common > 0) return high.slice(0, common) + midpoint(low.slice(common), high.slice(common));
  }
  const lowDigit = low ? DIGITS.indexOf(low[0]) : 0;
  const highDigit = high !== null ? DIGITS.indexOf(high[0]) : DIGITS.length;
  if (highDigit - lowDigit > 1) return DIGITS[Math.round((lowDigit + highDigit) / 2)];
  if (high !== null && high.length > 1) return high.slice(0, 1);
  return DIGITS[lowDigit] + midpoint(low.slice(1), null);
}
