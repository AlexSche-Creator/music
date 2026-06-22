/* Tests for js/core/recommend.js — daily recommendation engine. */
import assert from "node:assert/strict";
import { recordAnswer, emptyLearningState, computeState } from "../js/core/learning.js";
import { dailyRecommendations, habitRecommendations } from "../js/core/recommend.js";

let failed = 0;
function t(name, fn) {
  try { fn(); console.log("✓", name); }
  catch (e) { failed++; console.error("✗", name, "\n   ", e.message); }
}

const T0 = new Date("2026-05-01T10:00:00").getTime();
const DAY = 86400000;

t("dailyRecommendations: empty state returns empty list", () => {
  const recs = dailyRecommendations(emptyLearningState(), { now: T0 });
  assert.deepEqual(recs, []);
});

t("dailyRecommendations: surfaces at-risk concepts with age info", () => {
  const s = emptyLearningState();
  // Build a strong concept.
  for (let i = 0; i < 10; i++) recordAnswer(s, { conceptId: "concept:C:5", isCorrect: true, reactionMs: 600, ts: T0 + i * 1000 });
  // Force-state to at-risk by aging.
  s.concepts["concept:C:5"].state = computeState(s.concepts["concept:C:5"], T0 + 20 * DAY);
  const recs = dailyRecommendations(s, { now: T0 + 20 * DAY });
  const atRisk = recs.find((r) => r.kind === "at-risk");
  assert.ok(atRisk, "should have at-risk recommendation");
  assert.equal(atRisk.conceptId, "concept:C:5");
  assert.ok(atRisk.message.length > 0);
});

t("dailyRecommendations: surfaces weak (learning/unstable) concepts", () => {
  const s = emptyLearningState();
  recordAnswer(s, { conceptId: "concept:C:7", isCorrect: false, ts: T0 });
  const recs = dailyRecommendations(s, { now: T0 + 1000 });
  const weak = recs.find((r) => r.kind === "weak");
  assert.ok(weak, "should have weak recommendation");
});

t("dailyRecommendations: surfaces improving concepts (stable + streak)", () => {
  const s = emptyLearningState();
  // 15 corrects → mastery in stable range, with streak.
  for (let i = 0; i < 15; i++) recordAnswer(s, { conceptId: "concept:Am:1", isCorrect: true, reactionMs: 1500, ts: T0 + i * 1000 });
  const c = s.concepts["concept:Am:1"];
  // Manually drop mastery into 'stable' band so the test deterministically
  // exercises the improving branch (otherwise this concept becomes mastered
  // after 15 perfect answers).
  c.mastery = 0.65;
  c.state = computeState(c, T0 + 16000);
  assert.equal(c.state, "stable", `expected stable, got ${c.state}`);
  const recs = dailyRecommendations(s, { now: T0 + 16000 });
  const improving = recs.find((r) => r.kind === "improving");
  assert.ok(improving, "should have improving recommendation");
});

t("dailyRecommendations: respects limit", () => {
  const s = emptyLearningState();
  for (let d = 1; d <= 7; d++) {
    recordAnswer(s, { conceptId: `concept:C:${d}`, isCorrect: false, ts: T0 + d * 1000 });
  }
  const recs = dailyRecommendations(s, { now: T0 + 100000, limit: 3 });
  assert.ok(recs.length <= 3);
});

t("habitRecommendations: surfaces skipped modules ≥5 days", () => {
  const log = {
    ear:    { daysSinceLast: 0,  sessionsLast7: 5 },
    cover:  { daysSinceLast: 7,  sessionsLast7: 0 },
    improv: { daysSinceLast: 10, sessionsLast7: 0 },
    chords: { daysSinceLast: 2,  sessionsLast7: 3 },
  };
  const recs = habitRecommendations(log, { limit: 5 });
  const modules = recs.map((r) => r.module);
  assert.ok(modules.includes("cover"));
  assert.ok(modules.includes("improv"));
  assert.ok(!modules.includes("ear"));
  assert.ok(!modules.includes("chords"));
});

t("habitRecommendations: empty log returns []", () => {
  assert.deepEqual(habitRecommendations(null), []);
  assert.deepEqual(habitRecommendations({}), []);
});

if (failed > 0) { console.error(`\n${failed} failed`); process.exit(1); }
else console.log("\nall recommend tests passed");
