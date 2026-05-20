/* Daily recommendation engine (§18.10, §18.12, §18.14).
 *
 * Reads learning state + (optionally) habit log and returns short, ranked,
 * human-presentable suggestions. The UI is free to render one or many.
 */

import { listConcepts, refreshAllStates } from "./learning.js";
import { conceptToHumanLabel } from "./concept.js";

const KIND_LABEL = {
  "at-risk":      "Начинает забываться",
  "weak":         "Нестабильно",
  "improving":    "Укрепляется",
  "fresh":        "Можно попробовать",
  "habit":        "Привычка",
};

function clamp(arr, n) { return arr.slice(0, n); }

/** Returns up to `limit` ranked recommendations.
 *  Each rec is { kind, conceptId?, message, score } where higher score = more urgent. */
export function dailyRecommendations(state, opts = {}) {
  const now = opts.now || Date.now();
  const limit = opts.limit || 5;
  refreshAllStates(state, now);
  const recs = [];

  const atRisk = listConcepts(state, (c) => c.state === "at-risk")
    .sort((a, b) => (now - b.lastSeenAt) - (now - a.lastSeenAt));
  for (const c of clamp(atRisk, 2)) {
    const ageDays = Math.round((now - c.lastSeenAt) / 86400000);
    recs.push({
      kind: "at-risk",
      conceptId: c.conceptId,
      message: `${conceptToHumanLabel(c.conceptId)} — давно не повторял (${ageDays} дн.)`,
      score: 100 + ageDays,
    });
  }

  const weak = listConcepts(state, (c) =>
    c.state === "learning" || c.state === "unstable"
  ).sort((a, b) => b.ema - a.ema);
  for (const c of clamp(weak, 2)) {
    recs.push({
      kind: "weak",
      conceptId: c.conceptId,
      message: `Слабое место: ${conceptToHumanLabel(c.conceptId)}`,
      score: 80 + Math.round(c.ema * 20),
    });
  }

  const improving = listConcepts(state, (c) => c.state === "stable" && c.streakCorrect >= 3)
    .sort((a, b) => b.streakCorrect - a.streakCorrect);
  for (const c of clamp(improving, 1)) {
    recs.push({
      kind: "improving",
      conceptId: c.conceptId,
      message: `Укрепляется: ${conceptToHumanLabel(c.conceptId)} (${c.streakCorrect} подряд)`,
      score: 40 + c.streakCorrect,
    });
  }

  recs.sort((a, b) => b.score - a.score);
  return clamp(recs, limit);
}

/** Habit-side recommendations (§18.12): which modules are being skipped.
 *  habitLog shape: { ear, chords, improv, cover, newKeys, shapes }, each
 *  carrying `daysSinceLast` and `sessionsLast7`. The UI can mix these with
 *  concept recs.
 */
export function habitRecommendations(habitLog, opts = {}) {
  const limit = opts.limit || 3;
  if (!habitLog) return [];
  const labels = {
    ear: "слух",
    chords: "аккорды",
    improv: "импровизация",
    cover: "кавер",
    newKeys: "новые тональности",
    shapes: "новые аппликатуры",
  };
  const out = [];
  for (const [k, v] of Object.entries(habitLog)) {
    if (!v) continue;
    const d = v.daysSinceLast ?? 999;
    if (d >= 5) {
      out.push({
        kind: "habit",
        module: k,
        message: `${d} дн. без модуля «${labels[k] || k}» — попробуй 3-минутный возврат`,
        score: 50 + d,
      });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return clamp(out, limit);
}

export { KIND_LABEL };
