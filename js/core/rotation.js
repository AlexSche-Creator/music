/* Tonality-of-the-day / tonality-of-the-week rotation.
 *
 * Deterministic — given the same active set + same date + same period, every
 * device picks the same tonality. We rotate by indexing into the sorted list
 * of active keys with floor(daysSinceEpoch / periodDays) % N. Favourites are
 * sorted to the front so they appear more often.
 */

import { activeKeys, STARTER_KEY_IDS } from "../data/keys-roster.js";

const DAY = 86400000;

function daysSinceEpoch(now = Date.now()) {
  return Math.floor(now / DAY);
}

/** Pick the current tonality from the active set. `period` is "day" or "week". */
export function currentTonality(keyPrefs, period = "week", now = Date.now()) {
  let list = activeKeys(keyPrefs);
  if (!list.length) list = activeKeys({});
  if (!list.length) {
    return { id: STARTER_KEY_IDS[0], russian: "До мажор", mode: "major" };
  }
  // Favourites first (still stable sort within each group via index).
  const sorted = list.slice().sort((a, b) => {
    if (a.favourite === b.favourite) return 0;
    return a.favourite ? -1 : 1;
  });
  const days = daysSinceEpoch(now);
  const idx = (period === "day" ? days : Math.floor(days / 7)) % sorted.length;
  return sorted[((idx % sorted.length) + sorted.length) % sorted.length];
}

/** Preview the next N tonalities in the rotation. */
export function nextTonalities(keyPrefs, period = "week", n = 5, now = Date.now()) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const future = now + (period === "day" ? i * DAY : i * 7 * DAY);
    out.push(currentTonality(keyPrefs, period, future));
  }
  return out;
}
