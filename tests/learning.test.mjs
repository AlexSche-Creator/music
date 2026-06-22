/* Tests for js/core/learning.js — adaptive engine: state, mastery, intervals. */
import assert from "node:assert/strict";
import {
  emptyLearningState, getConceptState, recordAnswer, computeState,
  priorityWeight, listConcepts, refreshAllStates, PARAMS,
} from "../js/core/learning.js";

let failed = 0;
function t(name, fn) {
  try { fn(); console.log("✓", name); }
  catch (e) { failed++; console.error("✗", name, "\n   ", e.message); }
}

const T0 = new Date("2026-05-01T10:00:00").getTime();
const DAY = 86400000;

t("emptyLearningState has version + empty concepts", () => {
  const s = emptyLearningState();
  assert.equal(s.version, 1);
  assert.deepEqual(s.concepts, {});
});

t("getConceptState returns blank concept for unknown id", () => {
  const s = emptyLearningState();
  const c = getConceptState(s, "concept:C:1");
  assert.equal(c.seen, 0);
  assert.equal(c.mastery, 0);
  assert.equal(c.state, "new");
});

t("recordAnswer correct: increments mastery, confidence, ease; resets streakWrong", () => {
  const s = emptyLearningState();
  recordAnswer(s, { conceptId: "concept:C:5", isCorrect: true, reactionMs: 800, ts: T0 });
  const c = s.concepts["concept:C:5"];
  assert.equal(c.seen, 1);
  assert.equal(c.correct, 1);
  assert.ok(c.mastery > 0);
  assert.ok(c.confidence > 0);
  assert.ok(c.ease > PARAMS.EASE_BASE);
  assert.equal(c.streakCorrect, 1);
  assert.equal(c.streakWrong, 0);
});

t("recordAnswer wrong: pushes ema up, resets interval, drops mastery", () => {
  const s = emptyLearningState();
  // Get to some baseline first.
  for (let i = 0; i < 3; i++) recordAnswer(s, { conceptId: "concept:C:5", isCorrect: true, reactionMs: 1000, ts: T0 + i * 1000 });
  const before = s.concepts["concept:C:5"].mastery;
  recordAnswer(s, { conceptId: "concept:C:5", isCorrect: false, reactionMs: 4000, ts: T0 + 5000 });
  const c = s.concepts["concept:C:5"];
  assert.ok(c.mastery < before, `mastery should drop: ${c.mastery} vs ${before}`);
  assert.ok(c.ema > 0.3);
  assert.equal(c.intervalDays, 0);
  assert.equal(c.streakWrong, 1);
  assert.equal(c.streakCorrect, 0);
});

t("recordAnswer interval ladder: 0 → 1 → 3 → 7 → 14 → 30", () => {
  const s = emptyLearningState();
  const ts = T0;
  // 5 consecutive correct answers walk the ladder from index 0 to index 5.
  for (let i = 0; i < 5; i++) recordAnswer(s, { conceptId: "concept:C:1", isCorrect: true, reactionMs: 500, ts: ts + i * 1000 });
  const c = s.concepts["concept:C:1"];
  // ladder is [0, 1, 3, 7, 14, 30]; 5 steps after starting at index 0 = 30.
  assert.equal(c.intervalDays, 30);
});

t("computeState transitions: new → learning → unstable → stable → mastered", () => {
  const s = emptyLearningState();
  // Many corrects to climb mastery.
  for (let i = 0; i < 30; i++) {
    recordAnswer(s, { conceptId: "concept:C:1", isCorrect: true, reactionMs: 600, ts: T0 + i * 1000 });
  }
  const c = s.concepts["concept:C:1"];
  assert.ok(c.mastery >= 0.8, `mastery should be high: ${c.mastery}`);
  assert.equal(c.state, "mastered");
});

t("computeState marks at-risk after long absence", () => {
  const s = emptyLearningState();
  // Build mastery first.
  for (let i = 0; i < 10; i++) recordAnswer(s, { conceptId: "concept:C:5", isCorrect: true, reactionMs: 700, ts: T0 + i * 1000 });
  const c = s.concepts["concept:C:5"];
  // Fast-forward 20 days.
  const later = T0 + 20 * DAY;
  c.state = computeState(c, later);
  assert.equal(c.state, "at-risk");
});

t("priorityWeight: recent concept gets cooldown penalty", () => {
  const s = emptyLearningState();
  recordAnswer(s, { conceptId: "concept:C:5", isCorrect: true, reactionMs: 800, ts: T0 });
  const c = s.concepts["concept:C:5"];
  const wWithoutCooldown = priorityWeight(c, { now: T0 + 1000, recentConcepts: [] });
  const wWithCooldown    = priorityWeight(c, { now: T0 + 1000, recentConcepts: ["concept:C:5"] });
  assert.ok(wWithCooldown < wWithoutCooldown / 2, `cooldown should heavily penalise: ${wWithCooldown} vs ${wWithoutCooldown}`);
});

t("priorityWeight: high-ema (struggle) concept ranks above low-ema", () => {
  const s = emptyLearningState();
  // Make A weak by repeated wrongs.
  for (let i = 0; i < 5; i++) recordAnswer(s, { conceptId: "concept:C:1", isCorrect: false, reactionMs: 3000, ts: T0 + i * 1000 });
  // Make B strong.
  for (let i = 0; i < 5; i++) recordAnswer(s, { conceptId: "concept:C:2", isCorrect: true, reactionMs: 500, ts: T0 + 100000 + i * 1000 });
  const a = s.concepts["concept:C:1"];
  const b = s.concepts["concept:C:2"];
  const now = T0 + 200000;
  assert.ok(priorityWeight(a, { now }) > priorityWeight(b, { now }),
    `weak should rank higher: ${priorityWeight(a, { now })} vs ${priorityWeight(b, { now })}`);
});

t("priorityWeight: at-risk gets explicit boost", () => {
  const s = emptyLearningState();
  // Build a strong concept.
  for (let i = 0; i < 10; i++) recordAnswer(s, { conceptId: "concept:C:3", isCorrect: true, reactionMs: 600, ts: T0 + i * 1000 });
  const fresh = priorityWeight(s.concepts["concept:C:3"], { now: T0 + 100000 });
  // Age it 20 days into at-risk.
  s.concepts["concept:C:3"].state = computeState(s.concepts["concept:C:3"], T0 + 20 * DAY);
  const risk = priorityWeight(s.concepts["concept:C:3"], { now: T0 + 20 * DAY });
  assert.ok(risk > fresh, `at-risk should boost: risk=${risk} fresh=${fresh}`);
});

t("listConcepts + refreshAllStates work over the whole state", () => {
  const s = emptyLearningState();
  recordAnswer(s, { conceptId: "concept:C:1", isCorrect: true,  ts: T0 });
  recordAnswer(s, { conceptId: "concept:C:2", isCorrect: false, ts: T0 });
  refreshAllStates(s, T0 + 1000);
  const all = listConcepts(s);
  assert.equal(all.length, 2);
  const weak = listConcepts(s, (c) => c.state === "learning");
  assert.ok(weak.length >= 1);
});

if (failed > 0) { console.error(`\n${failed} failed`); process.exit(1); }
else console.log("\nall learning tests passed");
