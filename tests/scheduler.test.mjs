/* Tests for js/core/scheduler.js */
import assert from "node:assert/strict";
import { emptyWeights, recordOutcome, pickNext, hardestItems, improvedItems } from "../js/core/scheduler.js";

let failed = 0;
function t(name, fn) {
  try { fn(); console.log("✓", name); }
  catch (e) { failed++; console.error("✗", name, "\n   ", e.message); }
}

t("recordOutcome moves EMA toward 1 on wrong answers", () => {
  const w = emptyWeights();
  for (let i = 0; i < 10; i++) recordOutcome(w, { mode: "m", tonalityId: "Am", itemKey: "x", isCorrect: false });
  const k = "m|Am|x";
  assert.ok(w[k].ema > 0.9);
});

t("recordOutcome moves EMA toward 0 on right answers", () => {
  const w = emptyWeights();
  for (let i = 0; i < 10; i++) recordOutcome(w, { mode: "m", tonalityId: "Am", itemKey: "x", isCorrect: true });
  const k = "m|Am|x";
  assert.ok(w[k].ema < 0.1);
});

t("pickNext biases toward higher-EMA items", () => {
  const w = emptyWeights();
  for (let i = 0; i < 20; i++) recordOutcome(w, { mode: "m", tonalityId: "Am", itemKey: "hard", isCorrect: false });
  for (let i = 0; i < 20; i++) recordOutcome(w, { mode: "m", tonalityId: "Am", itemKey: "easy", isCorrect: true });
  const seed = (() => { let s = 42; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
  let hardN = 0;
  for (let i = 0; i < 500; i++) {
    const c = pickNext(w, ["hard", "easy"], [], "m", "Am", seed);
    if (c === "hard") hardN++;
  }
  assert.ok(hardN > 350, `hard picked ${hardN}/500`);
});

t("pickNext deprioritises very recent items", () => {
  const w = emptyWeights();
  // Equal weights for two items.
  let chosen = { x: 0, y: 0 };
  const seed = (() => { let s = 7; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
  for (let i = 0; i < 500; i++) {
    const c = pickNext(w, ["x", "y"], ["x"], "m", "Am", seed);
    chosen[c]++;
  }
  assert.ok(chosen.y > chosen.x * 3, `y=${chosen.y} x=${chosen.x}`);
});

t("hardestItems returns the worst EMA items", () => {
  const w = emptyWeights();
  for (let i = 0; i < 5; i++) recordOutcome(w, { mode: "m", tonalityId: "Am", itemKey: "a", isCorrect: false });
  for (let i = 0; i < 5; i++) recordOutcome(w, { mode: "m", tonalityId: "Am", itemKey: "b", isCorrect: true });
  for (let i = 0; i < 5; i++) recordOutcome(w, { mode: "m", tonalityId: "Am", itemKey: "c", isCorrect: false });
  const top = hardestItems(w, "m", "Am", 2);
  assert.deepEqual(top.map((x) => x.itemKey).sort(), ["a", "c"]);
});

t("improvedItems detects recent improvement", () => {
  // a was historically wrong but is now mostly right.
  const w = emptyWeights();
  for (let i = 0; i < 8; i++) recordOutcome(w, { mode: "m", tonalityId: "Am", itemKey: "a", isCorrect: false });
  // recent answers all correct.
  const recent = [];
  for (let i = 0; i < 4; i++) recent.push({ mode: "m", tonalityId: "Am", itemKey: "a", isCorrect: true });
  // and an item that did not improve.
  for (let i = 0; i < 4; i++) recent.push({ mode: "m", tonalityId: "Am", itemKey: "b", isCorrect: false });
  for (let i = 0; i < 8; i++) recordOutcome(w, { mode: "m", tonalityId: "Am", itemKey: "b", isCorrect: false });
  const r = improvedItems(w, recent, 3);
  assert.equal(r[0].itemKey, "a");
  assert.ok(r[0].improvement > 0);
});

if (failed > 0) { console.error(`\n${failed} failed`); process.exit(1); }
else console.log("\nall scheduler tests passed");
