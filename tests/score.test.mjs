/* Tests for js/core/score.js — Practice Score formula. */
import assert from "node:assert/strict";
import { recordSession } from "../js/core/habits.js";
import {
  dailyScore, averageScore, scoreBreakdown, suggestNextModules,
  DEFAULT_SCORE_WEIGHTS,
} from "../js/core/score.js";

let failed = 0;
function t(name, fn) {
  try { fn(); console.log("✓", name); }
  catch (e) { failed++; console.error("✗", name, "\n   ", e.message); }
}

const T0 = new Date("2026-05-12T10:00:00").getTime();
const DAY = 86400000;

function logsWith(...sessions) {
  const logs = {};
  for (const s of sessions) recordSession(logs, s);
  return logs;
}

t("dailyScore: empty log = 0", () => {
  assert.equal(dailyScore({}), 0);
  assert.equal(dailyScore(null), 0);
});

t("dailyScore: single theory full credit = 30", () => {
  const logs = logsWith({ module: "theory", durationSec: 900, ts: T0 }); // 15 min
  const day = Object.keys(logs)[0];
  assert.equal(dailyScore(logs[day]), 30);
});

t("dailyScore: partial theory credit", () => {
  const logs = logsWith({ module: "theory", durationSec: 450, ts: T0 }); // 7.5 min = 50%
  const day = Object.keys(logs)[0];
  // 30 * 0.5 = 15
  assert.equal(dailyScore(logs[day]), 15);
});

t("dailyScore: session-scaled cover gives full credit on first session", () => {
  const logs = logsWith({ module: "cover", durationSec: 60, ts: T0 });
  const day = Object.keys(logs)[0];
  assert.equal(dailyScore(logs[day]), 20);
});

t("dailyScore: variety bonus kicks in at 3 modules", () => {
  const logs = logsWith(
    { module: "theory", durationSec: 900, ts: T0 },
    { module: "improv", durationSec: 300, ts: T0 },
    { module: "cover",  durationSec: 60,  ts: T0 },
  );
  const day = Object.keys(logs)[0];
  // 30 + 20 + 20 + 5 variety = 75
  assert.equal(dailyScore(logs[day]), 75);
});

t("dailyScore: caps at 100 even with extreme inputs", () => {
  const logs = logsWith(
    { module: "theory",  durationSec: 9000, ts: T0 },
    { module: "shapes",  durationSec: 3000, ts: T0 },
    { module: "improv",  durationSec: 3000, ts: T0 },
    { module: "cover",   durationSec: 999,  ts: T0 },
    { module: "newKeys", durationSec: 999,  ts: T0 },
  );
  const day = Object.keys(logs)[0];
  assert.equal(dailyScore(logs[day]), 100);
});

t("averageScore: takes mean over only days with logs", () => {
  const logs = logsWith(
    { module: "theory", durationSec: 900, ts: T0 },                  // today = 30
    { module: "theory", durationSec: 450, ts: T0 - DAY },             // = 15
    { module: "cover",  durationSec: 60,  ts: T0 - 2 * DAY },         // = 20
  );
  const avg = averageScore(logs, 7, T0);
  // (30 + 15 + 20) / 3 = 21.67 → 22
  assert.equal(avg, 22);
});

t("averageScore returns 0 if no logs", () => {
  assert.equal(averageScore({}, 7, T0), 0);
});

t("scoreBreakdown enumerates per-module pts/max/done", () => {
  const logs = logsWith({ module: "theory", durationSec: 900, ts: T0 });
  const day = Object.keys(logs)[0];
  const b = scoreBreakdown(logs[day]);
  const theory = b.find((x) => x.moduleId === "theory");
  assert.equal(theory.pts, 30);
  assert.equal(theory.max, 30);
  assert.equal(theory.done, true);
  const cover = b.find((x) => x.moduleId === "cover");
  assert.equal(cover.done, false);
  assert.equal(cover.pts, 0);
});

t("suggestNextModules returns biggest unrealised potential first", () => {
  const logs = logsWith({ module: "theory", durationSec: 900, ts: T0 });
  const day = Object.keys(logs)[0];
  const sugg = suggestNextModules(logs[day], 2);
  // theory fully covered; biggest remaining max is cover (20) or improv (20).
  assert.ok(sugg.includes("cover") || sugg.includes("improv"));
  assert.ok(!sugg.includes("theory"));
});

if (failed > 0) { console.error(`\n${failed} failed`); process.exit(1); }
else console.log("\nall score tests passed");
