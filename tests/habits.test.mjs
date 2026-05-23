/* Tests for js/core/habits.js — daily logs, streaks, heatmap, module health. */
import assert from "node:assert/strict";
import {
  emptyDailyLog, recordSession, dayActive, overallStreak, moduleStreak,
  moduleHealth, heatmap, todaySnapshot, dayStart, HABIT_MODULES,
} from "../js/core/habits.js";

let failed = 0;
function t(name, fn) {
  try { fn(); console.log("✓", name); }
  catch (e) { failed++; console.error("✗", name, "\n   ", e.message); }
}

const T0 = new Date("2026-05-12T10:00:00").getTime();
const DAY = 86400000;

t("emptyDailyLog has all modules zeroed", () => {
  const d = emptyDailyLog(T0);
  for (const m of HABIT_MODULES) {
    assert.equal(d.modules[m].done, false);
    assert.equal(d.modules[m].sessions, 0);
    assert.equal(d.modules[m].totalDurationSec, 0);
  }
  assert.equal(d.totalDurationSec, 0);
});

t("recordSession increments counts and marks day active", () => {
  const logs = {};
  recordSession(logs, { module: "theory", durationSec: 300, ts: T0 });
  const day = dayStart(T0);
  assert.ok(logs[day]);
  assert.equal(logs[day].modules.theory.sessions, 1);
  assert.equal(logs[day].modules.theory.totalDurationSec, 300);
  assert.equal(logs[day].modules.theory.done, true);
  assert.equal(logs[day].totalDurationSec, 300);
  assert.ok(dayActive(logs[day]));
});

t("recordSession ignores unknown module", () => {
  const logs = {};
  recordSession(logs, { module: "bogus", durationSec: 60, ts: T0 });
  assert.deepEqual(logs, {});
});

t("recordSession aggregates multiple sessions same day", () => {
  const logs = {};
  recordSession(logs, { module: "theory", durationSec: 60, ts: T0 });
  recordSession(logs, { module: "theory", durationSec: 90, ts: T0 + 1000 });
  recordSession(logs, { module: "improv", durationSec: 120, ts: T0 + 2000 });
  const day = dayStart(T0);
  assert.equal(logs[day].modules.theory.sessions, 2);
  assert.equal(logs[day].modules.theory.totalDurationSec, 150);
  assert.equal(logs[day].modules.improv.sessions, 1);
  assert.equal(logs[day].totalDurationSec, 270);
});

t("overallStreak counts consecutive active days back from today", () => {
  const logs = {};
  recordSession(logs, { module: "theory", ts: T0 });
  recordSession(logs, { module: "theory", ts: T0 - DAY });
  recordSession(logs, { module: "improv", ts: T0 - 2 * DAY });
  // skip day -3
  recordSession(logs, { module: "theory", ts: T0 - 4 * DAY });
  assert.equal(overallStreak(logs, T0), 3);
});

t("moduleStreak counts per-module consecutive activity", () => {
  const logs = {};
  recordSession(logs, { module: "improv", ts: T0 });
  recordSession(logs, { module: "improv", ts: T0 - DAY });
  recordSession(logs, { module: "theory", ts: T0 - 2 * DAY }); // gap for improv
  recordSession(logs, { module: "improv", ts: T0 - 3 * DAY });
  assert.equal(moduleStreak(logs, "improv", T0), 2);
  assert.equal(moduleStreak(logs, "theory", T0), 0);
});

t("moduleHealth: daysSinceLast and sessionsLast7", () => {
  const logs = {};
  recordSession(logs, { module: "cover", ts: T0 - 3 * DAY });
  recordSession(logs, { module: "improv", ts: T0 - 9 * DAY });
  const h = moduleHealth(logs, T0);
  assert.equal(h.cover.daysSinceLast, 3);
  assert.ok(h.improv.daysSinceLast >= 9);
  assert.equal(h.theory.daysSinceLast, 999, "never-touched module should be 999");
});

t("heatmap returns 7 rows × N weeks", () => {
  const logs = {};
  for (let i = 0; i < 5; i++) recordSession(logs, { module: "theory", ts: T0 - i * DAY });
  const hm = heatmap(logs, 4, T0);
  assert.equal(hm.length, 7);
  assert.equal(hm[0].length, 4);
});

t("todaySnapshot reflects today's modules + streak", () => {
  const logs = {};
  recordSession(logs, { module: "theory", durationSec: 300, ts: T0 });
  recordSession(logs, { module: "cover",  durationSec: 180, ts: T0 + 1000 });
  const snap = todaySnapshot(logs, T0 + 2000);
  assert.equal(snap.moduleStatus.theory.done, true);
  assert.equal(snap.moduleStatus.cover.done,  true);
  assert.equal(snap.moduleStatus.improv.done, false);
  assert.equal(snap.totalDurationSec, 480);
  assert.equal(snap.streak, 1);
});

if (failed > 0) { console.error(`\n${failed} failed`); process.exit(1); }
else console.log("\nall habits tests passed");
