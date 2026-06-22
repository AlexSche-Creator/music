/* Practice Score — daily 0..100 number summarising how much was done.
 *
 * Friendly, not punishing (§17). Score grows with module variety + total time.
 * It is NOT a punishment for missing a module — even a 5-minute single-module
 * session gives a meaningful score. The ceiling 100 is for a balanced day.
 *
 * Default weights and credit caps (§7 Day Templates govern the targets):
 *   theory   — up to 30 pts (15 min == full credit)
 *   shapes   — up to 15 pts (5 min)
 *   improv   — up to 20 pts (5 min)
 *   cover    — up to 20 pts (1 session)
 *   newKeys  — up to 10 pts (1 session)
 *   variety  — up to 5 pts bonus if ≥ 3 distinct modules touched
 */

import { HABIT_MODULES } from "./habits.js";

export const DEFAULT_SCORE_WEIGHTS = Object.freeze({
  theory:  { ptsForFull: 30, fullSec: 900, scale: "time"    }, // 15 min
  shapes:  { ptsForFull: 15, fullSec: 300, scale: "time"    }, // 5 min
  improv:  { ptsForFull: 20, fullSec: 300, scale: "time"    }, // 5 min
  cover:   { ptsForFull: 20, fullSec: 0,   scale: "session" }, // 1 session
  newKeys: { ptsForFull: 10, fullSec: 0,   scale: "session" },
  // 'reading' is excluded by default (browsing tonalities isn't really practice)
});

const VARIETY_BONUS_MIN_MODULES = 3;
const VARIETY_BONUS_PTS = 5;

/** Compute today's Practice Score from a DailyLog.
 *  Optionally pass user weights to override defaults. */
export function dailyScore(log, weights = DEFAULT_SCORE_WEIGHTS) {
  if (!log || !log.modules) return 0;
  let score = 0;
  let touched = 0;
  for (const [moduleId, w] of Object.entries(weights)) {
    const m = log.modules[moduleId];
    if (!m || !m.done) continue;
    touched += 1;
    if (w.scale === "session") {
      score += w.ptsForFull;
    } else {
      const r = Math.min(1, m.totalDurationSec / Math.max(1, w.fullSec));
      score += Math.round(w.ptsForFull * r);
    }
  }
  if (touched >= VARIETY_BONUS_MIN_MODULES) score += VARIETY_BONUS_PTS;
  return Math.max(0, Math.min(100, score));
}

/** Average over last N days (skipping null/empty days). */
export function averageScore(logs, days, now = Date.now(), weights = DEFAULT_SCORE_WEIGHTS) {
  const DAY = 86400000;
  const todayStart = (() => { const d = new Date(now); d.setHours(0,0,0,0); return d.getTime(); })();
  let total = 0, n = 0;
  for (let i = 0; i < days; i++) {
    const ts = todayStart - i * DAY;
    const log = logs[ts];
    if (!log) continue;
    total += dailyScore(log, weights);
    n += 1;
  }
  return n ? Math.round(total / n) : 0;
}

/** Per-module breakdown of today's score (useful for the Practice ring UI). */
export function scoreBreakdown(log, weights = DEFAULT_SCORE_WEIGHTS) {
  const rows = [];
  if (!log || !log.modules) return rows;
  for (const [moduleId, w] of Object.entries(weights)) {
    const m = log.modules[moduleId] || { done: false, sessions: 0, totalDurationSec: 0 };
    let pts = 0;
    if (m.done) {
      if (w.scale === "session") pts = w.ptsForFull;
      else pts = Math.round(w.ptsForFull * Math.min(1, m.totalDurationSec / Math.max(1, w.fullSec)));
    }
    rows.push({ moduleId, pts, max: w.ptsForFull, done: m.done });
  }
  return rows;
}

/** Convenience for habit UI: how close are we to a "full" day score? */
export function progressFraction(log, weights = DEFAULT_SCORE_WEIGHTS) {
  return dailyScore(log, weights) / 100;
}

/** Soft "what to do next" hint based on per-module remaining headroom.
 *  Returns at most `n` moduleIds where adding a session would gain points. */
export function suggestNextModules(log, n = 2, weights = DEFAULT_SCORE_WEIGHTS) {
  const breakdown = scoreBreakdown(log, weights);
  return breakdown
    .filter((b) => b.pts < b.max)
    .sort((a, b) => (b.max - b.pts) - (a.max - a.pts))
    .slice(0, n)
    .map((b) => b.moduleId);
}

/** All known module ids for which Practice Score allocates points. */
export function scoredModules(weights = DEFAULT_SCORE_WEIGHTS) {
  return Object.keys(weights);
}
