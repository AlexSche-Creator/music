/* Habit tracking — daily logs across all practice modules.
 *
 * Each calendar day produces one DailyLog. Modules tracked:
 *   theory   — старый тренажёр (ступени/аккорды/чувства/слух) + flashcards
 *   shapes   — аппликатуры аккордов (Phase 3)
 *   improv   — пентатоническая импровизация (Phase 2)
 *   cover    — кавер дня (Phase 2)
 *   newKeys  — новые тональности (Phase 3)
 *   reading  — справочные экраны (тональности/прогрессии)
 *
 * Storage:
 *   kv["habit_logs"] = { [dayTs: number]: DailyLog }
 * where dayTs is the local-midnight timestamp (same convention as stats.js).
 */

export const HABIT_MODULES = Object.freeze([
  "theory", "shapes", "improv", "cover", "newKeys", "reading",
]);

export const MODULE_LABELS_RU = Object.freeze({
  theory:  "Теория и слух",
  shapes:  "Аппликатуры",
  improv:  "Импровизация",
  cover:   "Каверы",
  newKeys: "Новые тональности",
  reading: "Справочник",
});

const DAY = 86400000;

export function dayStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function emptyModule() {
  return { done: false, sessions: 0, totalDurationSec: 0, lastTs: 0 };
}

export function emptyDailyLog(dayTs) {
  const modules = {};
  for (const m of HABIT_MODULES) modules[m] = emptyModule();
  return { dayTs, modules, totalDurationSec: 0 };
}

export function getOrCreateDay(logs, dayTs) {
  if (!logs[dayTs]) logs[dayTs] = emptyDailyLog(dayTs);
  return logs[dayTs];
}

/** Append a session for a module. Mutates logs in place; safe to persist after. */
export function recordSession(logs, { module: m, durationSec = 0, ts = Date.now() }) {
  if (!HABIT_MODULES.includes(m)) return logs;
  const day = dayStart(ts);
  const d = getOrCreateDay(logs, day);
  const mod = d.modules[m];
  mod.sessions += 1;
  mod.totalDurationSec += Math.max(0, durationSec);
  mod.lastTs = ts;
  mod.done = mod.sessions > 0;
  d.totalDurationSec += Math.max(0, durationSec);
  return logs;
}

/** True if the user did anything in any module on this day. */
export function dayActive(log) {
  if (!log) return false;
  return HABIT_MODULES.some((m) => log.modules[m].done);
}

/** Overall streak (any module counts) — days back from `now` with activity. */
export function overallStreak(logs, now = Date.now()) {
  let s = 0;
  let cursor = dayStart(now);
  while (dayActive(logs[cursor])) { s += 1; cursor -= DAY; }
  return s;
}

/** Streak for a specific module. */
export function moduleStreak(logs, moduleId, now = Date.now()) {
  if (!HABIT_MODULES.includes(moduleId)) return 0;
  let s = 0;
  let cursor = dayStart(now);
  while (logs[cursor] && logs[cursor].modules[moduleId].done) { s += 1; cursor -= DAY; }
  return s;
}

/** For each module: days since last activity, sessions in last 7d.
 *  Used by recommend.js to nudge skipped modules. */
export function moduleHealth(logs, now = Date.now()) {
  const out = {};
  const today = dayStart(now);
  for (const m of HABIT_MODULES) {
    let lastTs = 0;
    let sessionsLast7 = 0;
    for (const [dayTs, log] of Object.entries(logs)) {
      const mod = log && log.modules && log.modules[m];
      if (!mod || !mod.done) continue;
      const t = Number(dayTs);
      if (t > lastTs) lastTs = t;
      if (today - t < 7 * DAY) sessionsLast7 += mod.sessions;
    }
    const daysSinceLast = lastTs ? Math.floor((today - lastTs) / DAY) : 999;
    out[m] = { daysSinceLast, sessionsLast7, lastTs };
  }
  return out;
}

/** Heatmap rows = 7 weekdays, cols = past N weeks. Total session count per day. */
export function heatmap(logs, weeks = 12, now = Date.now()) {
  const today = dayStart(now);
  const todayDow = (new Date(today).getDay() + 6) % 7; // 0=Mon
  const start = today - todayDow * DAY - (weeks - 1) * 7 * DAY;
  const cells = [];
  for (let row = 0; row < 7; row++) {
    const r = [];
    for (let col = 0; col < weeks; col++) {
      const ts = start + (col * 7 + row) * DAY;
      const log = logs[ts];
      let cnt = 0;
      if (log) for (const m of HABIT_MODULES) cnt += log.modules[m].sessions;
      let level = 0;
      if (cnt > 0) level = 1;
      if (cnt >= 2) level = 2;
      if (cnt >= 4) level = 3;
      if (cnt >= 6) level = 4;
      r.push({ ts, cnt, level });
    }
    cells.push(r);
  }
  return cells;
}

/** Today's snapshot for Dashboard rendering. */
export function todaySnapshot(logs, now = Date.now()) {
  const today = dayStart(now);
  const log = logs[today] || emptyDailyLog(today);
  const moduleStatus = {};
  for (const m of HABIT_MODULES) {
    moduleStatus[m] = {
      done: log.modules[m].done,
      sessions: log.modules[m].sessions,
      durationSec: log.modules[m].totalDurationSec,
    };
  }
  return {
    dayTs: today,
    totalDurationSec: log.totalDurationSec,
    moduleStatus,
    streak: overallStreak(logs, now),
  };
}
