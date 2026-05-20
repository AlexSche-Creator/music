/* Adaptive learning engine — concept-level state, mastery state machine,
 * SM-2-lite spaced repetition. Pure functions: no DOM, no storage.
 *
 * Storage shape (lives in kv["learning_state"]):
 *   { version: 1, concepts: { [conceptId]: ConceptState } }
 *
 * ConceptState
 *   seen, correct, wrong              — lifetime counters
 *   streakCorrect, streakWrong        — current streaks
 *   lastSeenAt / lastCorrectAt / lastWrongAt
 *   ema        ∈ [0,1]  — exponential moving "wrongness", higher = harder right now
 *   confidence ∈ [0,1]  — short-term confidence (fast decay)
 *   mastery    ∈ [0,1]  — long-term mastery (slow accumulation)
 *   ease       ∈ [1.3,4.0] — SM-2-style ease factor
 *   intervalDays — current spaced-repetition interval
 *   nextDueAt    — absolute ms timestamp when this concept is due for review
 *   state      ∈ {new, learning, unstable, stable, mastered, at-risk}
 *
 * Design notes (referencing §18 of the spec):
 *  - §18.3: wrong answers boost short-term review priority (intervalDays→0,
 *    nextDueAt → "soon") but cooldown lives in the session planner, not here.
 *  - §18.5: state transitions are derived from mastery + recency, never bound
 *    to a single answer outcome — this prevents flipping back and forth.
 *  - §18.6: interval ladder [0, 1, 3, 7, 14, 30] days with ease-driven extension.
 *  - §18.7: confidence (fast) and mastery (slow) intentionally diverge — the
 *    UI can use confidence for "today you feel sharp on V" hints while the
 *    scheduler relies on mastery.
 */

export const LEARNING_VERSION = 1;

export const PARAMS = Object.freeze({
  EMA_ALPHA: 0.35,
  EASE_BASE: 2.5,
  EASE_MAX: 4.0,
  EASE_MIN: 1.3,
  EASE_GAIN_FAST: 0.08,
  EASE_GAIN_NORMAL: 0.04,
  EASE_GAIN_SLOW: 0.0,
  EASE_LOSS_WRONG: 0.2,
  CONFIDENCE_UP: 0.18,
  CONFIDENCE_DOWN: 0.30,
  MASTERY_UP_BASE: 0.06,
  MASTERY_DOWN: 0.04,
  INTERVAL_LADDER: [0, 1, 3, 7, 14, 30],
  WRONG_RECALL_DELAY_SEC: 60,
  AT_RISK_DAYS: 14,
  STATE_BANDS: { learning: 0.3, unstable: 0.55, stable: 0.8 },
  REACTION_FAST_MS: 1500,
  REACTION_SLOW_MS: 5000,
});

export function emptyLearningState() {
  return { version: LEARNING_VERSION, concepts: {} };
}

function newConcept(conceptId) {
  return {
    conceptId,
    seen: 0, correct: 0, wrong: 0,
    streakCorrect: 0, streakWrong: 0,
    lastSeenAt: 0, lastCorrectAt: 0, lastWrongAt: 0,
    ema: 0.5,
    confidence: 0,
    mastery: 0,
    ease: PARAMS.EASE_BASE,
    intervalDays: 0,
    nextDueAt: 0,
    state: "new",
  };
}

/** Get concept state, creating an empty one if missing. Pure: does NOT mutate. */
export function getConceptState(state, conceptId) {
  return (state && state.concepts && state.concepts[conceptId]) || newConcept(conceptId);
}

/** Record an answer and return the (mutated) state. The state object itself
 *  is reused so it can be persisted as-is via kvSet. */
export function recordAnswer(state, { conceptId, isCorrect, reactionMs = null, ts = Date.now() }) {
  if (!conceptId) return state;
  if (!state.concepts) state.concepts = {};
  const c = state.concepts[conceptId] || newConcept(conceptId);
  c.seen += 1;
  c.lastSeenAt = ts;
  if (isCorrect) {
    c.correct += 1;
    c.streakCorrect += 1;
    c.streakWrong = 0;
    c.lastCorrectAt = ts;
    c.ema = c.ema + PARAMS.EMA_ALPHA * (0 - c.ema);
    const easeGain = pickEaseGain(reactionMs);
    c.ease = Math.min(PARAMS.EASE_MAX, c.ease + easeGain);
    c.confidence = Math.min(1, c.confidence + PARAMS.CONFIDENCE_UP);
    c.mastery = Math.min(1, c.mastery + PARAMS.MASTERY_UP_BASE * (c.ease / PARAMS.EASE_BASE));
    c.intervalDays = nextInterval(c.intervalDays, c.ease);
    c.nextDueAt = ts + c.intervalDays * 86400000;
  } else {
    c.wrong += 1;
    c.streakWrong += 1;
    c.streakCorrect = 0;
    c.lastWrongAt = ts;
    c.ema = c.ema + PARAMS.EMA_ALPHA * (1 - c.ema);
    c.ease = Math.max(PARAMS.EASE_MIN, c.ease - PARAMS.EASE_LOSS_WRONG);
    c.confidence = Math.max(0, c.confidence - PARAMS.CONFIDENCE_DOWN);
    c.mastery = Math.max(0, c.mastery - PARAMS.MASTERY_DOWN);
    c.intervalDays = 0;
    c.nextDueAt = ts + PARAMS.WRONG_RECALL_DELAY_SEC * 1000;
  }
  c.state = computeState(c, ts);
  state.concepts[conceptId] = c;
  return state;
}

function pickEaseGain(reactionMs) {
  if (reactionMs == null) return PARAMS.EASE_GAIN_NORMAL;
  if (reactionMs < PARAMS.REACTION_FAST_MS) return PARAMS.EASE_GAIN_FAST;
  if (reactionMs > PARAMS.REACTION_SLOW_MS) return PARAMS.EASE_GAIN_SLOW;
  return PARAMS.EASE_GAIN_NORMAL;
}

function nextInterval(curDays, ease) {
  const ladder = PARAMS.INTERVAL_LADDER;
  const idx = ladder.indexOf(curDays);
  if (idx >= 0 && idx + 1 < ladder.length) return ladder[idx + 1];
  // Past the ladder — extend by ease factor, capped at a year.
  return Math.min(365, Math.max(1, Math.round((curDays || 1) * ease)));
}

/** Derive the conceptual state from mastery + recency. */
export function computeState(c, now = Date.now()) {
  if (!c || c.seen === 0) return "new";
  const ageDays = c.lastSeenAt ? (now - c.lastSeenAt) / 86400000 : 0;
  const m = c.mastery;
  // At-risk: previously stable+ but not seen for a while.
  if (m >= PARAMS.STATE_BANDS.unstable && ageDays > PARAMS.AT_RISK_DAYS) return "at-risk";
  if (m < PARAMS.STATE_BANDS.learning) return "learning";
  if (m < PARAMS.STATE_BANDS.unstable) return "unstable";
  if (m < PARAMS.STATE_BANDS.stable) return "stable";
  return "mastered";
}

/* ---------- Priority for picking ---------- */

/** Weight for one concept; higher = more likely to be picked next.
 *  Used by session-planner; exported so tests can verify monotonicity. */
export function priorityWeight(c, { now = Date.now(), recentConcepts = [] } = {}) {
  if (!c) return 1 + 1.5; // never seen
  if (recentConcepts.includes(c.conceptId)) return 0.1; // cooldown
  let w = 1;
  // Spaced repetition: overdue items boost; not-yet-due items dampen.
  if (c.nextDueAt && c.nextDueAt <= now) {
    const overdueDays = (now - c.nextDueAt) / 86400000;
    w += Math.min(3, 0.5 + overdueDays * 0.3);
  } else if (c.nextDueAt > now) {
    const aheadDays = (c.nextDueAt - now) / 86400000;
    w *= Math.max(0.2, 1 - aheadDays / 14);
  }
  // Difficulty (recent wrongness).
  w += 2 * Math.max(0, Math.min(1, c.ema));
  // Novelty.
  if (c.seen === 0) w += 1.5;
  // At-risk boost.
  if (c.state === "at-risk") w += 1.0;
  return Math.max(0.01, w);
}

/* ---------- Summaries used by recommendations + reflection ---------- */

export function listConcepts(state, predicate) {
  const out = [];
  if (!state || !state.concepts) return out;
  for (const c of Object.values(state.concepts)) {
    if (!predicate || predicate(c)) out.push(c);
  }
  return out;
}

export function refreshAllStates(state, now = Date.now()) {
  if (!state || !state.concepts) return state;
  for (const c of Object.values(state.concepts)) {
    c.state = computeState(c, now);
  }
  return state;
}
