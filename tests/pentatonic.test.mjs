/* Tests for js/data/pentatonic.js — scale construction + chord anchors. */
import assert from "node:assert/strict";
import {
  buildPentatonic, pentatonicForTonality, backingLoopFor, anchorPcsForChord,
  MINOR_PENTATONIC_INTERVALS, MAJOR_PENTATONIC_INTERVALS,
} from "../js/data/pentatonic.js";

let failed = 0;
function t(name, fn) {
  try { fn(); console.log("✓", name); }
  catch (e) { failed++; console.error("✗", name, "\n   ", e.message); }
}

t("A minor pentatonic is A C D E G", () => {
  const s = buildPentatonic("A", "minor_pentatonic");
  assert.deepEqual(s.notes, ["A","C","D","E","G"]);
});

t("C major pentatonic is C D E G A", () => {
  const s = buildPentatonic("C", "major_pentatonic");
  assert.deepEqual(s.notes, ["C","D","E","G","A"]);
});

t("buildPentatonic returns null for invalid root", () => {
  assert.equal(buildPentatonic("H", "minor_pentatonic"), null);
});

t("pentatonicForTonality uses minor for minor tonalities", () => {
  const s = pentatonicForTonality("Am");
  assert.equal(s.root, "A");
  assert.deepEqual(s.notes, ["A","C","D","E","G"]);
});

t("pentatonicForTonality uses major for major tonalities", () => {
  const s = pentatonicForTonality("C");
  assert.equal(s.root, "C");
  assert.deepEqual(s.notes, ["C","D","E","G","A"]);
});

t("backingLoopFor Am gives Am + Dm", () => {
  const loop = backingLoopFor("Am");
  assert.deepEqual(loop, ["Am", "Dm"]);
});

t("backingLoopFor C gives C + F", () => {
  const loop = backingLoopFor("C");
  assert.deepEqual(loop, ["C", "F"]);
});

t("anchorPcsForChord finds chord tones in pentatonic", () => {
  const scale = buildPentatonic("A", "minor_pentatonic"); // [A,C,D,E,G] = [9,0,2,4,7]
  // Am chord is A C E — should be [9, 0, 4]
  const anchors = anchorPcsForChord(scale.pcs, "Am");
  assert.equal(anchors.length, 3);
  assert(anchors.includes(9));
  assert(anchors.includes(0));
  assert(anchors.includes(4));
});

t("MINOR/MAJOR interval constants are 5 notes each", () => {
  assert.equal(MINOR_PENTATONIC_INTERVALS.length, 5);
  assert.equal(MAJOR_PENTATONIC_INTERVALS.length, 5);
});

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
else console.log("\nAll pentatonic tests passed");
