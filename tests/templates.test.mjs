/* Tests for js/core/templates.js — day templates and completion. */
import assert from "node:assert/strict";
import { recordSession, emptyDailyLog, dayStart } from "../js/core/habits.js";
import {
  TEMPLATES, getTemplate, templateForDate, defaultWeeklyPlan,
  evaluateCompletion, suggestTemplateNow,
} from "../js/core/templates.js";

let failed = 0;
function t(name, fn) {
  try { fn(); console.log("✓", name); }
  catch (e) { failed++; console.error("✗", name, "\n   ", e.message); }
}

const T_MON = new Date("2026-05-11T10:00:00").getTime(); // Monday
const T_SAT = new Date("2026-05-16T10:00:00").getTime(); // Saturday

t("TEMPLATES has light/standard/full", () => {
  assert.ok(TEMPLATES.light);
  assert.ok(TEMPLATES.standard);
  assert.ok(TEMPLATES.full);
});

t("getTemplate by id", () => {
  assert.equal(getTemplate("standard").durationMin, 20);
  assert.equal(getTemplate("bogus"), null);
});

t("defaultWeeklyPlan: Sat is 'full' and Fri is 'light'", () => {
  const plan = defaultWeeklyPlan();
  assert.equal(plan[6], "full");   // Sat
  assert.equal(plan[5], "light");  // Fri
});

t("templateForDate resolves weekday → template", () => {
  const plan = defaultWeeklyPlan();
  assert.equal(templateForDate(plan, new Date(T_MON)).id, "standard");
  assert.equal(templateForDate(plan, new Date(T_SAT)).id, "full");
});

t("templateForDate falls back to defaults when plan is empty", () => {
  assert.equal(templateForDate({}, new Date(T_MON)).id, "standard");
});

t("evaluateCompletion: incomplete when modules missing", () => {
  const tpl = TEMPLATES.standard;
  const log = emptyDailyLog(dayStart(T_MON));
  recordSession({ [log.dayTs]: log }, { module: "theory", durationSec: 600, ts: T_MON });
  // Update reference because logs structure
  // Just rebuild via recordSession:
  const logs = {};
  recordSession(logs, { module: "theory", durationSec: 600, ts: T_MON });
  const today = logs[dayStart(T_MON)];
  const ev = evaluateCompletion(tpl, today);
  assert.equal(ev.complete, false);
  assert.ok(ev.missingModules.includes("improv"));
});

t("evaluateCompletion: complete when all required modules met", () => {
  const tpl = TEMPLATES.standard;
  const logs = {};
  recordSession(logs, { module: "theory", durationSec: 600, ts: T_MON });
  recordSession(logs, { module: "improv", durationSec: 300, ts: T_MON });
  recordSession(logs, { module: "cover",  durationSec: 60,  ts: T_MON });
  const ev = evaluateCompletion(tpl, logs[dayStart(T_MON)]);
  assert.equal(ev.complete, true);
});

t("suggestTemplateNow: respects minutesAvailable budget", () => {
  const plan = defaultWeeklyPlan();
  // Saturday = full (40 min). With 10 min budget → fall back to light.
  const sug = suggestTemplateNow({ weeklyPlan: plan, minutesAvailable: 10, now: new Date(T_SAT) });
  assert.equal(sug.id, "light");
});

t("suggestTemplateNow: returns planned template when enough budget", () => {
  const plan = defaultWeeklyPlan();
  const sug = suggestTemplateNow({ weeklyPlan: plan, minutesAvailable: 60, now: new Date(T_SAT) });
  assert.equal(sug.id, "full");
});

if (failed > 0) { console.error(`\n${failed} failed`); process.exit(1); }
else console.log("\nall templates tests passed");
