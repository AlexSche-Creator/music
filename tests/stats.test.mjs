/* Tests for js/core/stats.js */
import assert from "node:assert/strict";
import {
  summarize, perDay, currentStreak, heatmap,
  hardestByField, strongestByField, accuracyByMode, dayStart
} from "../js/core/stats.js";

const DAY = 86400000;
let failed = 0;
function t(name, fn) {
  try { fn(); console.log("✓", name); }
  catch (e) { failed++; console.error("✗", name, "\n   ", e.message); }
}

const NOW = new Date("2026-05-12T10:00:00").getTime();
function ans(daysAgo, isCorrect, extra = {}) {
  return { ts: NOW - daysAgo * DAY, isCorrect, reactionMs: 800, ...extra };
}

t("summarize counts accuracy", () => {
  const a = [ans(0, true), ans(0, false), ans(0, true)];
  const s = summarize(a);
  assert.equal(s.total, 3);
  assert.equal(s.correct, 2);
  assert.equal(s.wrong, 1);
  assert.ok(Math.abs(s.accuracy - 2 / 3) < 1e-9);
});

t("perDay buckets the last N days", () => {
  const a = [
    ans(0, true), ans(0, true),
    ans(1, false),
    ans(3, true)
  ];
  const buckets = perDay(a, 7, NOW);
  assert.equal(buckets.length, 7);
  // Today (last bucket) has 2 answers
  assert.equal(buckets[buckets.length - 1].total, 2);
  // Yesterday (one before last)
  assert.equal(buckets[buckets.length - 2].total, 1);
  // 3 days ago
  assert.equal(buckets[buckets.length - 4].total, 1);
});

t("currentStreak counts consecutive days back from today", () => {
  const a = [ans(0, true), ans(1, true), ans(2, true), ans(4, true)];
  assert.equal(currentStreak(a, NOW), 3);
});

t("hardestByField surfaces wrong-rate items", () => {
  const a = [
    ans(0, false, { itemKey: "x" }), ans(0, false, { itemKey: "x" }),
    ans(0, true,  { itemKey: "x" }), ans(0, true,  { itemKey: "y" }),
    ans(0, true,  { itemKey: "y" }), ans(0, true,  { itemKey: "y" })
  ];
  const h = hardestByField(a, "itemKey", 2);
  assert.equal(h[0].key, "x");
  assert.ok(h[0].errorRate > 0.5);
});

t("strongestByField surfaces high-correct items", () => {
  const a = [
    ans(0, true,  { itemKey: "y" }), ans(0, true,  { itemKey: "y" }),
    ans(0, true,  { itemKey: "y" }), ans(0, false, { itemKey: "x" }),
    ans(0, false, { itemKey: "x" }), ans(0, false, { itemKey: "x" })
  ];
  const s = strongestByField(a, "itemKey", 2);
  assert.equal(s[0].key, "y");
});

t("accuracyByMode buckets per mode", () => {
  const a = [
    { ts: NOW, mode: "a", isCorrect: true },
    { ts: NOW, mode: "a", isCorrect: false },
    { ts: NOW, mode: "b", isCorrect: true }
  ];
  const r = accuracyByMode(a);
  const ma = r.find((x) => x.mode === "a");
  const mb = r.find((x) => x.mode === "b");
  assert.equal(ma.accuracy, 0.5);
  assert.equal(mb.accuracy, 1);
});

t("heatmap returns 7 rows", () => {
  const a = [ans(0, true), ans(1, true), ans(2, true)];
  const h = heatmap(a, 4, NOW);
  assert.equal(h.length, 7);
  assert.equal(h[0].length, 4);
});

t("dayStart zeros the time", () => {
  const d = dayStart(NOW);
  const dd = new Date(d);
  assert.equal(dd.getHours(), 0);
  assert.equal(dd.getMinutes(), 0);
});

if (failed > 0) { console.error(`\n${failed} failed`); process.exit(1); }
else console.log("\nall stats tests passed");
