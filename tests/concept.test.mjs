/* Tests for js/core/concept.js — concept layer that unifies representations. */
import assert from "node:assert/strict";
import {
  chordToDegree, conceptForDegree, conceptForChord, conceptForSequence,
  itemKeyToConcept, tonalityConcepts, parseConcept, conceptToHumanLabel,
} from "../js/core/concept.js";

let failed = 0;
function t(name, fn) {
  try { fn(); console.log("✓", name); }
  catch (e) { failed++; console.error("✗", name, "\n   ", e.message); }
}

t("chordToDegree handles all 7 chords in both tonalities", () => {
  assert.equal(chordToDegree("C", "C"), 1);
  assert.equal(chordToDegree("C", "G"), 5);
  assert.equal(chordToDegree("C", "Bdim"), 7);
  assert.equal(chordToDegree("Am", "Am"), 1);
  assert.equal(chordToDegree("Am", "F"), 6);
  assert.equal(chordToDegree("Am", "G"), 7);
});

t("chordToDegree returns null for unknown chord", () => {
  assert.equal(chordToDegree("C", "Esus2"), null);
  assert.equal(chordToDegree("X", "C"), null);
});

t("conceptForDegree builds canonical id", () => {
  assert.equal(conceptForDegree("C", 5), "concept:C:5");
  assert.equal(conceptForDegree("Am", 1), "concept:Am:1");
});

t("conceptForDegree rejects bad input", () => {
  assert.equal(conceptForDegree("X", 1), null);
  assert.equal(conceptForDegree("C", 0), null);
  assert.equal(conceptForDegree("C", 8), null);
});

t("conceptForChord roundtrips through degree", () => {
  assert.equal(conceptForChord("C", "G"), "concept:C:5");
  assert.equal(conceptForChord("Am", "F"), "concept:Am:6");
});

t("itemKeyToConcept unifies step/chord/feel keys to same concept", () => {
  // V in C major can come from any of these representations:
  const a = itemKeyToConcept("step:C:5");     // degree_to_chord, ear_to_step, flashcards
  const b = itemKeyToConcept("chord:C:G");    // chord_to_degree
  const c = itemKeyToConcept("feel:C:G");     // feel_to_chord, chord_to_feel, ear_to_feel
  assert.equal(a, "concept:C:5");
  assert.equal(b, "concept:C:5");
  assert.equal(c, "concept:C:5");
  assert.equal(a, b);
  assert.equal(b, c);
});

t("itemKeyToConcept handles sequence keys", () => {
  assert.equal(itemKeyToConcept("seq:I-V-vi-IV"), "concept:seq:I-V-vi-IV");
});

t("itemKeyToConcept returns null on garbage", () => {
  assert.equal(itemKeyToConcept(null), null);
  assert.equal(itemKeyToConcept(""), null);
  assert.equal(itemKeyToConcept("nope"), null);
});

t("tonalityConcepts returns 7 ids in degree order", () => {
  const concepts = tonalityConcepts("C");
  assert.equal(concepts.length, 7);
  assert.equal(concepts[0], "concept:C:1");
  assert.equal(concepts[4], "concept:C:5");
  assert.equal(concepts[6], "concept:C:7");
});

t("parseConcept decodes degree into step+chord", () => {
  const p = parseConcept("concept:C:5");
  assert.equal(p.kind, "degree");
  assert.equal(p.tonalityId, "C");
  assert.equal(p.degree, 5);
  assert.equal(p.step.roman, "V");
  assert.equal(p.chord, "G");
});

t("parseConcept decodes sequence", () => {
  const p = parseConcept("concept:seq:ii-V-I");
  assert.equal(p.kind, "sequence");
  assert.equal(p.progId, "ii-V-I");
});

t("conceptToHumanLabel renders Russian text", () => {
  const label = conceptToHumanLabel("concept:Am:1");
  assert.ok(label.includes("i"), `got: ${label}`);
  assert.ok(label.includes("Am"), `got: ${label}`);
});

if (failed > 0) { console.error(`\n${failed} failed`); process.exit(1); }
else console.log("\nall concept tests passed");
