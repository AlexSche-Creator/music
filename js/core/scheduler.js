/* Weighted-repetition scheduler.
 *
 * For each (mode, tonality, itemKey) tuple we keep:
 *  - seen, correct, wrong  — lifetime counts
 *  - ema                   — exponential moving "wrongness" in [0..1], higher = harder
 *  - lastTs                — last time we asked it
 *
 * Picking a question:
 *  - Build pool of candidate items for the given mode/tonality.
 *  - Weight each candidate by:
 *      base 1
 *    + 3 * ema                 (penalize what user struggles with)
 *    + 1.5 if never seen       (mix in novelty)
 *    + recency boost           (if it's been a while since we asked)
 *    - large penalty if asked in the last few questions (anti-repeat)
 *  - Pick proportionally; break ties with rng.
 *
 * The scheduler is pure-functional given the weights and a recent-question
 * buffer; the caller is responsible for persisting weights between sessions.
 */

const EMA_ALPHA = 0.35;

export function emptyWeights() { return {}; }

function key(mode, tonalityId, itemKey) {
  return `${mode}|${tonalityId}|${itemKey}`;
}

/** Update weights after observing a single answer. */
export function recordOutcome(weights, { mode, tonalityId, itemKey, isCorrect, ts = Date.now() }) {
  const k = key(mode, tonalityId, itemKey);
  const w = weights[k] || { seen: 0, correct: 0, wrong: 0, ema: 0.5, lastTs: 0 };
  w.seen += 1;
  if (isCorrect) { w.correct += 1; w.ema = w.ema + EMA_ALPHA * (0 - w.ema); }
  else           { w.wrong += 1;   w.ema = w.ema + EMA_ALPHA * (1 - w.ema); }
  w.lastTs = ts;
  weights[k] = w;
  return weights;
}

function weightFor(state, recentSet, now) {
  if (!state) return 1 + 1.5; // never seen
  let w = 1 + 3 * Math.max(0, Math.min(1, state.ema));
  if (state.seen === 0) w += 1.5;
  const sinceMin = (now - (state.lastTs || 0)) / 60000;
  if (sinceMin > 10) w += 0.5;
  if (sinceMin > 60 * 24) w += 0.5; // not seen for a day
  return w;
}

/** Pick the next item from a candidate list using weighted choice + anti-repeat. */
export function pickNext(weights, candidates, recentItemKeys = [], mode, tonalityId, rng = Math.random) {
  if (!candidates.length) return null;
  const now = Date.now();
  const recentSet = new Set(recentItemKeys);
  const enriched = candidates.map((c) => {
    const k = key(mode, tonalityId, c);
    let w = weightFor(weights[k], recentSet, now);
    if (recentSet.has(c)) w *= 0.15; // strong penalty for very recent items
    return { c, w };
  });
  const total = enriched.reduce((s, x) => s + x.w, 0);
  if (total <= 0) return candidates[Math.floor(rng() * candidates.length)];
  let r = rng() * total;
  for (const e of enriched) {
    r -= e.w;
    if (r <= 0) return e.c;
  }
  return enriched[enriched.length - 1].c;
}

/** Hardest items overall for a given mode+tonality, sorted by EMA descending. */
export function hardestItems(weights, mode, tonalityId, n = 3) {
  const prefix = `${mode}|${tonalityId}|`;
  return Object.entries(weights)
    .filter(([k, v]) => k.startsWith(prefix) && v.seen >= 3)
    .map(([k, v]) => ({ itemKey: k.slice(prefix.length), ...v }))
    .sort((a, b) => b.ema - a.ema)
    .slice(0, n);
}

/** Items where the user *improved* the most over the last `windowMs` window
 *  compared to their lifetime ema. Useful for the weekly "you got better at" UI.
 */
export function improvedItems(weights, recentAnswers, n = 3) {
  // For each itemKey we look at recent correctness rate vs lifetime ema.
  const byItem = new Map();
  for (const a of recentAnswers) {
    if (!a || !a.itemKey) continue;
    const k = `${a.mode}|${a.tonalityId}|${a.itemKey}`;
    const e = byItem.get(k) || { correct: 0, total: 0, mode: a.mode, tonalityId: a.tonalityId, itemKey: a.itemKey };
    e.total += 1;
    if (a.isCorrect) e.correct += 1;
    byItem.set(k, e);
  }
  const rows = [];
  for (const [k, v] of byItem) {
    if (v.total < 3) continue;
    const recentRate = v.correct / v.total;
    const lifetimeEma = (weights[k]?.ema ?? 0.5);
    // Improvement = how much better the recent rate is than the lifetime "wrongness".
    const improvement = recentRate - (1 - lifetimeEma);
    rows.push({ ...v, recentRate, lifetimeEma, improvement });
  }
  rows.sort((a, b) => b.improvement - a.improvement);
  return rows.slice(0, n);
}
