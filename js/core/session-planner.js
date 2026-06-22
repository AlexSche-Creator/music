/* Session planner — decides which concept to ask next given:
 *  - the full learning state,
 *  - the candidate concept pool for the current mode,
 *  - what the user has answered (and how) within this session.
 *
 * It blends three signals (§18.2, §18.3, §18.8 of the spec):
 *   1. Quota mix    — 55/30/10/5 across known / weak / new / challenge buckets.
 *   2. Anti-fatigue — if recent answers were mostly wrong, force an easy win.
 *   3. Cooldown     — concepts in the last N picks get steeply down-weighted
 *                     so the same prompt doesn't appear twice in a row.
 *
 * Inside each bucket the picker uses learning.priorityWeight, so weak items
 * still surface their hardest representatives first.
 */

import { getConceptState, priorityWeight, computeState } from "./learning.js";

export const DEFAULT_QUOTA = Object.freeze({ known: 0.55, weak: 0.30, fresh: 0.10, challenge: 0.05 });
export const COOLDOWN = 4;          // how many recent picks must pass before a repeat
export const FATIGUE_WINDOW = 4;    // count wrongs in the last N answers
export const FATIGUE_THRESHOLD = 3; // ≥ this many wrongs → force easy-win

function bucketise(state, pool, now) {
  const buckets = { known: [], weak: [], fresh: [], challenge: [] };
  for (const id of pool) {
    const c = state && state.concepts && state.concepts[id];
    const s = c ? computeState(c, now) : "new";
    if (s === "new") buckets.fresh.push(id);
    else if (s === "learning" || s === "unstable" || s === "at-risk") buckets.weak.push(id);
    else if (s === "mastered") buckets.challenge.push(id);
    else buckets.known.push(id);
  }
  return buckets;
}

function fatigueDetected(recentResults, threshold = FATIGUE_THRESHOLD, window = FATIGUE_WINDOW) {
  if (!Array.isArray(recentResults) || recentResults.length === 0) return false;
  const last = recentResults.slice(-window);
  const wrongs = last.filter((r) => r && r.isCorrect === false).length;
  return wrongs >= threshold;
}

/** Pick one concept id, weighted within a bucket and respecting cooldown.
 *  Public to make testing & reasoning explicit. */
export function pickWeightedFromBucket(state, bucket, recentConcepts, rng = Math.random, now = Date.now()) {
  if (!bucket || bucket.length === 0) return null;
  const recent = recentConcepts.slice(-COOLDOWN);
  const fresh = bucket.filter((id) => !recent.includes(id));
  const usable = fresh.length ? fresh : bucket;
  const enriched = usable.map((id) => {
    const c = getConceptState(state, id);
    return { id, w: priorityWeight(c, { now, recentConcepts }) };
  });
  const total = enriched.reduce((s, x) => s + x.w, 0);
  if (total <= 0) return usable[Math.floor(rng() * usable.length)];
  let r = rng() * total;
  for (const e of enriched) {
    r -= e.w;
    if (r <= 0) return e.id;
  }
  return enriched[enriched.length - 1].id;
}

/** Main entry. Returns a concept id from the pool or null if pool is empty. */
export function pickNextConcept(state, pool, ctx = {}) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  const now = ctx.now || Date.now();
  const rng = ctx.rng || Math.random;
  const recentConcepts = ctx.recentConcepts || [];
  const recentResults = ctx.recentResults || [];
  const quota = { ...DEFAULT_QUOTA, ...(ctx.quota || {}) };

  const buckets = bucketise(state, pool, now);
  const forceEasy = fatigueDetected(recentResults);

  if (forceEasy) {
    // Prefer known → mastered → fresh → weak (anything to give a win).
    const order = ["known", "challenge", "fresh", "weak"];
    for (const k of order) {
      if (buckets[k].length) return pickWeightedFromBucket(state, buckets[k], recentConcepts, rng, now);
    }
  }

  // Weighted bucket choice. Roulette across buckets that actually have items.
  const live = Object.entries(quota).filter(([k]) => buckets[k].length > 0);
  if (live.length === 0) return pickWeightedFromBucket(state, pool, recentConcepts, rng, now);
  const total = live.reduce((s, [, q]) => s + q, 0);
  let r = rng() * total;
  for (const [k, q] of live) {
    r -= q;
    if (r <= 0) return pickWeightedFromBucket(state, buckets[k], recentConcepts, rng, now);
  }
  return pickWeightedFromBucket(state, buckets[live[live.length - 1][0]], recentConcepts, rng, now);
}

/** Diagnostic: explain why a pick happened. Used by tests + dev tooling. */
export function diagnose(state, pool, ctx = {}) {
  const now = ctx.now || Date.now();
  const buckets = bucketise(state, pool, now);
  return {
    buckets,
    fatigueDetected: fatigueDetected(ctx.recentResults || []),
    quota: { ...DEFAULT_QUOTA, ...(ctx.quota || {}) },
  };
}
