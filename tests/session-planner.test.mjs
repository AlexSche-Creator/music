/* Tests for js/core/session-planner.js — quota mixing, fatigue protection,
 * cooldown between identical prompts. */
import assert from "node:assert/strict";
import { recordAnswer, emptyLearningState } from "../js/core/learning.js";
import {
  pickNextConcept, pickWeightedFromBucket, diagnose,
  COOLDOWN, FATIGUE_THRESHOLD,
} from "../js/core/session-planner.js";

let failed = 0;
function t(name, fn) {
  try { fn(); console.log("✓", name); }
  catch (e) { failed++; console.error("✗", name, "\n   ", e.message); }
}

const T0 = new Date("2026-05-01T10:00:00").getTime();
function seededRng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

t("pickNextConcept returns null on empty pool", () => {
  const s = emptyLearningState();
  assert.equal(pickNextConcept(s, []), null);
});

t("pickNextConcept never picks a concept in the cooldown buffer if alternatives exist", () => {
  const s = emptyLearningState();
  const pool = ["a", "b", "c", "d", "e", "f", "g"];
  const recent = ["a", "b", "c", "d"]; // cooldown size = COOLDOWN(4)
  const rng = seededRng(42);
  const picks = new Set();
  for (let i = 0; i < 200; i++) picks.add(pickNextConcept(s, pool, { recentConcepts: recent, rng, now: T0 }));
  for (const r of recent) {
    assert.ok(!picks.has(r), `cooldown leaked: ${r}`);
  }
});

t("pickNextConcept biases toward weak items (high ema)", () => {
  const s = emptyLearningState();
  // Make "hard" weak, "easy" strong — both in pool.
  for (let i = 0; i < 10; i++) recordAnswer(s, { conceptId: "hard", isCorrect: false, ts: T0 + i * 1000 });
  for (let i = 0; i < 10; i++) recordAnswer(s, { conceptId: "easy", isCorrect: true,  ts: T0 + i * 1000 });
  const rng = seededRng(7);
  let hardN = 0;
  for (let i = 0; i < 1000; i++) {
    const p = pickNextConcept(s, ["hard", "easy"], { rng, now: T0 + 100000 });
    if (p === "hard") hardN++;
  }
  // weak goes into "weak" bucket (30%), easy goes into "known" bucket (55%).
  // But priorityWeight inside weak bucket of one element is still strong, and
  // when only one bucket has items, all picks come from it. With both buckets
  // non-empty, ratio depends on quota. We require hard ≥ 30% AT LEAST.
  assert.ok(hardN >= 250, `hard picked ${hardN}/1000`);
});

t("fatigue protection: 3 wrongs in last 4 forces easy-win pick", () => {
  const s = emptyLearningState();
  // Build pool: "weak" (high ema) + "easy" (mastered).
  for (let i = 0; i < 8; i++) recordAnswer(s, { conceptId: "weak",   isCorrect: false, ts: T0 + i * 1000 });
  for (let i = 0; i < 20; i++) recordAnswer(s, { conceptId: "easy",  isCorrect: true,  reactionMs: 400, ts: T0 + 100000 + i * 1000 });
  const recentResults = [
    { isCorrect: false }, { isCorrect: false }, { isCorrect: true }, { isCorrect: false },
  ];
  const rng = seededRng(99);
  let weakN = 0;
  for (let i = 0; i < 500; i++) {
    const p = pickNextConcept(s, ["weak", "easy"], { recentResults, rng, now: T0 + 200000 });
    if (p === "weak") weakN++;
  }
  // Under fatigue we should rarely pick the weak one — easier wins dominate.
  assert.ok(weakN < 100, `weak picked too often under fatigue: ${weakN}/500`);
});

t("diagnose returns bucket breakdown", () => {
  const s = emptyLearningState();
  for (let i = 0; i < 20; i++) recordAnswer(s, { conceptId: "mast", isCorrect: true, reactionMs: 400, ts: T0 + i * 1000 });
  recordAnswer(s, { conceptId: "learn", isCorrect: false, ts: T0 + 100000 });
  const d = diagnose(s, ["mast", "learn", "fresh"], { now: T0 + 200000 });
  assert.ok(d.buckets.fresh.includes("fresh"));
  assert.ok(d.buckets.weak.includes("learn"));
  assert.equal(d.fatigueDetected, false);
});

t("pickWeightedFromBucket respects cooldown within bucket", () => {
  const s = emptyLearningState();
  const rng = seededRng(11);
  const bucket = ["a", "b", "c"];
  const picks = new Set();
  for (let i = 0; i < 100; i++) picks.add(pickWeightedFromBucket(s, bucket, ["a"], rng, T0));
  assert.ok(!picks.has("a"), "cooldown leaked inside bucket");
});

t("constants are sensible", () => {
  assert.ok(COOLDOWN >= 3);
  assert.ok(FATIGUE_THRESHOLD >= 2);
});

if (failed > 0) { console.error(`\n${failed} failed`); process.exit(1); }
else console.log("\nall session-planner tests passed");
