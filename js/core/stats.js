/* Statistics aggregation. All functions are pure over the answer log array. */

const DAY = 86400000;

/** Return the local-midnight timestamp for a date. */
export function dayStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Filter answers by a [sinceTs, untilTs) window. */
export function inWindow(answers, sinceTs, untilTs = Date.now() + 1) {
  return answers.filter((a) => a.ts >= sinceTs && a.ts < untilTs);
}

/** Basic accuracy summary. */
export function summarize(answers) {
  const total = answers.length;
  let correct = 0, reactionSum = 0, reactionN = 0, replays = 0;
  for (const a of answers) {
    if (a.isCorrect) correct += 1;
    if (typeof a.reactionMs === "number") { reactionSum += a.reactionMs; reactionN += 1; }
    if (a.usedReplay) replays += 1;
  }
  return {
    total,
    correct,
    wrong: total - correct,
    accuracy: total ? correct / total : 0,
    avgReactionMs: reactionN ? Math.round(reactionSum / reactionN) : null,
    replayRate: total ? replays / total : 0
  };
}

/** Group answers per local day, return [{ dayTs, total, correct, accuracy }]. */
export function perDay(answers, days = 7, now = Date.now()) {
  const todayStart = dayStart(now);
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    buckets.push({ dayTs: todayStart - i * DAY, total: 0, correct: 0 });
  }
  const index = new Map(buckets.map((b, i) => [b.dayTs, i]));
  for (const a of answers) {
    const ds = dayStart(a.ts);
    const i = index.get(ds);
    if (i == null) continue;
    buckets[i].total += 1;
    if (a.isCorrect) buckets[i].correct += 1;
  }
  return buckets.map((b) => ({ ...b, accuracy: b.total ? b.correct / b.total : 0 }));
}

/** Current streak in days (counted backwards from today, inclusive). */
export function currentStreak(answers, now = Date.now()) {
  const days = new Set();
  for (const a of answers) days.add(dayStart(a.ts));
  let s = 0;
  let cursor = dayStart(now);
  while (days.has(cursor)) { s += 1; cursor -= DAY; }
  return s;
}

/** Heatmap: rows = days of week (Mon=0), cols = past N weeks. */
export function heatmap(answers, weeks = 12, now = Date.now()) {
  const cells = [];
  const today = dayStart(now);
  // We render Mon..Sun rows; in JS getDay() Sun=0, Mon=1…
  const todayDow = (new Date(today).getDay() + 6) % 7; // 0=Mon
  const start = today - todayDow * DAY - (weeks - 1) * 7 * DAY;
  const totals = new Map();
  for (const a of answers) {
    const ds = dayStart(a.ts);
    if (ds < start) continue;
    totals.set(ds, (totals.get(ds) || 0) + 1);
  }
  for (let row = 0; row < 7; row++) {
    const r = [];
    for (let col = 0; col < weeks; col++) {
      const ts = start + (col * 7 + row) * DAY;
      const cnt = totals.get(ts) || 0;
      let level = 0;
      if (cnt > 0) level = 1;
      if (cnt >= 5) level = 2;
      if (cnt >= 15) level = 3;
      if (cnt >= 30) level = 4;
      r.push({ ts, cnt, level });
    }
    cells.push(r);
  }
  return cells;
}

/** Hardest items, derived from raw answers (no scheduler weights required). */
export function hardestByField(answers, field, n = 3) {
  const m = new Map();
  for (const a of answers) {
    const k = a[field];
    if (!k) continue;
    const r = m.get(k) || { key: k, total: 0, wrong: 0 };
    r.total += 1;
    if (!a.isCorrect) r.wrong += 1;
    m.set(k, r);
  }
  const rows = [...m.values()].filter((r) => r.total >= 3)
    .map((r) => ({ ...r, errorRate: r.wrong / r.total }))
    .sort((a, b) => b.errorRate - a.errorRate);
  return rows.slice(0, n);
}

/** Best (strongest) categories — inverse of hardest. */
export function strongestByField(answers, field, n = 3) {
  const m = new Map();
  for (const a of answers) {
    const k = a[field];
    if (!k) continue;
    const r = m.get(k) || { key: k, total: 0, correct: 0 };
    r.total += 1;
    if (a.isCorrect) r.correct += 1;
    m.set(k, r);
  }
  const rows = [...m.values()].filter((r) => r.total >= 3)
    .map((r) => ({ ...r, correctRate: r.correct / r.total }))
    .sort((a, b) => b.correctRate - a.correctRate);
  return rows.slice(0, n);
}

/** Accuracy by mode, useful for "memory retention by mode". */
export function accuracyByMode(answers) {
  const m = new Map();
  for (const a of answers) {
    const r = m.get(a.mode) || { mode: a.mode, total: 0, correct: 0 };
    r.total += 1;
    if (a.isCorrect) r.correct += 1;
    m.set(a.mode, r);
  }
  return [...m.values()].map((r) => ({ ...r, accuracy: r.total ? r.correct / r.total : 0 }));
}
