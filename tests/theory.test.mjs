/* Tests for js/core/theory.js — pure ESM, run with `node`. */
import assert from "node:assert/strict";
import {
  pc, parseChord, triadIntervals, chordMidiNotes, midiToFreq,
  stepForChordIn, chordAtDegree, romanFor, buildOptions, suggestNextChord
} from "../js/core/theory.js";
import { PROGRESSIONS } from "../js/data/progressions.js";

let failed = 0;
function t(name, fn) {
  try { fn(); console.log("✓", name); }
  catch (e) { failed++; console.error("✗", name, "\n   ", e.message); }
}

t("pc maps note names", () => {
  assert.equal(pc("C"), 0);
  assert.equal(pc("A"), 9);
  assert.equal(pc("B"), 11);
  assert.equal(pc("F#"), 6);
  assert.equal(pc("Bb"), 10);
});

t("triadIntervals quality", () => {
  assert.deepEqual(triadIntervals("maj"), [0, 4, 7]);
  assert.deepEqual(triadIntervals("min"), [0, 3, 7]);
  assert.deepEqual(triadIntervals("dim"), [0, 3, 6]);
});

t("parseChord", () => {
  assert.deepEqual(parseChord("C"),    { root: "C",  quality: "maj" });
  assert.deepEqual(parseChord("Am"),   { root: "A",  quality: "min" });
  assert.deepEqual(parseChord("Bdim"), { root: "B",  quality: "dim" });
  assert.deepEqual(parseChord("F#m"),  { root: "F#", quality: "min" });
});

t("chordMidiNotes builds correct triad", () => {
  // Am at octave 4 — root MIDI of A4 = 69. Triad = 69, 72, 76.
  assert.deepEqual(chordMidiNotes("Am", 4), [69, 72, 76]);
  // C4 = 60. C major = 60, 64, 67.
  assert.deepEqual(chordMidiNotes("C", 4), [60, 64, 67]);
});

t("midiToFreq A4=440", () => {
  assert.equal(Math.round(midiToFreq(69)), 440);
  assert.equal(Math.round(midiToFreq(60)), 262); // C4 ~ 261.6
});

t("chordAtDegree and stepForChordIn invert each other", () => {
  for (const tid of ["C", "Am"]) {
    for (let d = 1; d <= 7; d++) {
      const c = chordAtDegree(tid, d);
      const s = stepForChordIn(tid, c);
      assert.equal(s.degree, d, `${tid} degree ${d} -> ${c} -> ${s.degree}`);
    }
  }
});

t("romanFor reflects quality casing", () => {
  assert.equal(romanFor(1, "maj"), "I");
  assert.equal(romanFor(2, "min"), "ii");
  assert.equal(romanFor(7, "dim"), "vii°");
  assert.equal(romanFor(5, "aug"), "V+");
});

t("buildOptions always contains correct answer and right size", () => {
  const pool = ["A", "B", "C", "D", "E"];
  const seq = (() => { let i = 1; return () => { i = (i * 1103515245 + 12345) % 2147483648; return i / 2147483648; }; })();
  const r = buildOptions(pool, "C", 4, seq);
  assert.equal(r.length, 4);
  assert.ok(r.includes("C"));
});

t("suggestNextChord matches known progressions", () => {
  // [C, G] only matches I-V-vi-IV → vi = Am in C.
  assert.equal(suggestNextChord(PROGRESSIONS, "C", ["C", "G"]), "Am");
  // [Am, F] is a prefix of both I-vi-IV-V (→ Dm) and i-VI-III-VII (→ C).
  // The function returns the first match — either is musically valid.
  const cand = suggestNextChord(PROGRESSIONS, "Am", ["Am", "F"]);
  assert.ok(["Dm", "C"].includes(cand), `unexpected continuation ${cand}`);
  // No prefix match → fallback to the dominant.
  assert.equal(suggestNextChord(PROGRESSIONS, "C", ["F", "Bdim"]), "G");
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
} else {
  console.log("\nall theory tests passed");
}
