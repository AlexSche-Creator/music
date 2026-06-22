/* Tests for js/core/ics.js — calendar export builder. */
import assert from "node:assert/strict";
import { weeklyPlanToIcs } from "../js/core/ics.js";
import { defaultWeeklyPlan } from "../js/core/templates.js";

let failed = 0;
function t(name, fn) {
  try { fn(); console.log("✓", name); }
  catch (e) { failed++; console.error("✗", name, "\n   ", e.message); }
}

t("weeklyPlanToIcs returns a valid VCALENDAR wrapper", () => {
  const ics = weeklyPlanToIcs({ weeks: 1, startDate: new Date("2026-05-12T00:00:00") });
  assert(ics.startsWith("BEGIN:VCALENDAR"));
  assert(ics.endsWith("END:VCALENDAR"));
});

t("weeklyPlanToIcs emits 7 events per week", () => {
  const ics = weeklyPlanToIcs({
    weeklyPlan: defaultWeeklyPlan(),
    weeks: 1,
    startDate: new Date("2026-05-12T00:00:00"),
  });
  const events = ics.match(/BEGIN:VEVENT/g) || [];
  // 7 weekdays × 1 week
  assert.equal(events.length, 7);
});

t("weeklyPlanToIcs uses provided hour/minute", () => {
  const ics = weeklyPlanToIcs({
    weeks: 1, hour: 18, minute: 45,
    startDate: new Date("2026-05-12T00:00:00"),
  });
  // DTSTART includes hour 18 and minute 45.
  assert(ics.includes("T184500"));
});

t("weeklyPlanToIcs skips days with no template", () => {
  const ics = weeklyPlanToIcs({
    weeklyPlan: { 1: "light" },
    weeks: 1,
    startDate: new Date("2026-05-12T00:00:00"),
  });
  const events = ics.match(/BEGIN:VEVENT/g) || [];
  assert.equal(events.length, 1);
});

t("weeklyPlanToIcs encodes summary with russian template name", () => {
  const ics = weeklyPlanToIcs({
    weeklyPlan: { 1: "light" },
    weeks: 1,
    startDate: new Date("2026-05-12T00:00:00"),
  });
  assert(ics.includes("SUMMARY") && (ics.includes("Лёгкий") || ics.includes("light")));
});

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
else console.log("\nAll ics tests passed");
