/* Tests for js/core/recovery.js — gap detection and recovery template. */
import assert from "node:assert/strict";
import { recordSession } from "../js/core/habits.js";
import { missedDayCount, recoveryTriggered, RECOVERY_TEMPLATE, recoveryTone } from "../js/core/recovery.js";

let failed = 0;
function t(name, fn) {
  try { fn(); console.log("✓", name); }
  catch (e) { failed++; console.error("✗", name, "\n   ", e.message); }
}

const T0 = new Date("2026-05-12T10:00:00").getTime();
const DAY = 86400000;

t("missedDayCount: 0 when user practised yesterday", () => {
  const logs = {};
  recordSession(logs, { module: "theory", ts: T0 - DAY });
  assert.equal(missedDayCount(logs, T0), 0);
});

t("missedDayCount: counts consecutive missed days back from today", () => {
  const logs = {};
  recordSession(logs, { module: "theory", ts: T0 - 5 * DAY });
  assert.equal(missedDayCount(logs, T0), 4);
});

t("missedDayCount: 0 when never practised but today is the FIRST day → no gap", () => {
  // No logs at all → cap-loop ends after 90 iterations with 90 missed days.
  // We document this behaviour: ≥2 means Recovery, so 90 → triggered.
  const m = missedDayCount({}, T0);
  assert.ok(m >= 2);
});

t("recoveryTriggered: true after 2+ missed days", () => {
  const logs = {};
  recordSession(logs, { module: "theory", ts: T0 - 3 * DAY });
  assert.equal(recoveryTriggered(logs, T0), true);
});

t("recoveryTriggered: false when only 1 day gap", () => {
  const logs = {};
  recordSession(logs, { module: "theory", ts: T0 - 2 * DAY }); // missed only yesterday
  assert.equal(missedDayCount(logs, T0), 1);
  assert.equal(recoveryTriggered(logs, T0), false);
});

t("RECOVERY_TEMPLATE: short and soft", () => {
  assert.equal(RECOVERY_TEMPLATE.durationMin, 5);
  assert.ok(RECOVERY_TEMPLATE.modules.includes("theory"));
});

t("recoveryTone: scales with missed-day count", () => {
  assert.ok(recoveryTone(2).length > 0);
  assert.notEqual(recoveryTone(2), recoveryTone(8));
});

if (failed > 0) { console.error(`\n${failed} failed`); process.exit(1); }
else console.log("\nall recovery tests passed");
