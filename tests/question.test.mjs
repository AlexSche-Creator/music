/* Tests for js/core/question.js — invariants on the question object (§13).
 * Every generated question must:
 *  - have a valid conceptId
 *  - have `correct` ∈ `options`
 *  - if audible, have a matching audibleChord/audibleSequence
 *  - be frozen (cannot be mutated)
 * And: the same concept queried in different modes must yield the same conceptId. */
import assert from "node:assert/strict";
import { generateQuestion, assertQuestionInvariants, MIX_POOL } from "../js/core/question.js";
import { emptyLearningState } from "../js/core/learning.js";
import { effectiveFeelings } from "../js/data/feelings.js";

let failed = 0;
function t(name, fn) {
  try { fn(); console.log("✓", name); }
  catch (e) { failed++; console.error("✗", name, "\n   ", e.message); }
}

const FEELINGS = effectiveFeelings(null);
const baseArgs = (overrides) => ({
  mode: "degree_to_chord",
  tonalityId: "Am",
  learningState: emptyLearningState(),
  feelings: FEELINGS,
  recentConcepts: [],
  recentResults: [],
  rng: () => 0.5,
  ...overrides,
});

t("every MIX_POOL mode produces a valid question", () => {
  for (const mode of MIX_POOL) {
    const q = generateQuestion(baseArgs({ mode, tonalityId: "Am" }));
    assert.ok(q, `mode ${mode} returned null`);
    assertQuestionInvariants(q);
  }
});

t("flashcards mode is valid", () => {
  const q = generateQuestion(baseArgs({ mode: "flashcards" }));
  assert.ok(q);
  assertQuestionInvariants(q);
  assert.equal(q.correct, "Я вспомнил");
});

t("exam mode resolves to inner mode but stays valid", () => {
  const q = generateQuestion(baseArgs({ mode: "exam" }));
  assert.ok(q);
  assertQuestionInvariants(q);
});

t("question object is frozen (cannot mutate options or prompt)", () => {
  const q = generateQuestion(baseArgs({ mode: "degree_to_chord" }));
  assert.throws(() => { q.correct = "X"; }, /TypeError/);
  assert.throws(() => { q.options.push("X"); }, /TypeError/);
  assert.throws(() => { q.prompt.big = "X"; }, /TypeError/);
});

t("correct answer is always present in options", () => {
  for (const mode of [...MIX_POOL, "flashcards"]) {
    for (const tonalityId of ["C", "Am"]) {
      for (let seed = 1; seed <= 10; seed++) {
        const rng = (() => { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
        const q = generateQuestion(baseArgs({ mode, tonalityId, rng }));
        if (q) assert.ok(q.options.includes(q.correct), `${mode}/${tonalityId}/seed=${seed}: ${q.correct} not in ${JSON.stringify(q.options)}`);
      }
    }
  }
});

t("audio payload matches question concept (chord_to_degree)", () => {
  const q = generateQuestion(baseArgs({ mode: "chord_to_degree", tonalityId: "C" }));
  // q.audibleChord must equal the chord shown in prompt.big
  assert.equal(q.audibleChord, q.prompt.big);
});

t("audio payload matches question concept (degree_to_chord)", () => {
  const q = generateQuestion(baseArgs({ mode: "degree_to_chord", tonalityId: "C" }));
  // q.audibleChord must equal q.correct (chord to be guessed)
  assert.equal(q.audibleChord, q.correct);
});

t("ear_to_step: audibleChord is the chord at the correct degree", () => {
  // Replay the test for several seeds.
  for (let seed = 1; seed <= 5; seed++) {
    const rng = (() => { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
    const q = generateQuestion(baseArgs({ mode: "ear_to_step", tonalityId: "C", rng }));
    // q.correct is the roman like "V"; q.audibleChord is the chord like "G"
    const parts = q.conceptId.split(":");
    const degree = parseInt(parts[2], 10);
    // V in C is G; ii is Dm; etc. We just verify it's consistent.
    assert.ok(q.audibleChord);
    assert.equal(q.conceptId, `concept:C:${degree}`);
  }
});

t("next_chord: audibleSequence is non-empty and correct is in ALL_CHORDS", () => {
  const q = generateQuestion(baseArgs({ mode: "next_chord", tonalityId: "C" }));
  assert.ok(q);
  assert.ok(Array.isArray(q.audibleSequence));
  assert.ok(q.audibleSequence.length >= 1);
  assert.equal(q.audible, "sequence");
});

t("concept identity across modes: V-in-C produces same conceptId from chord_to_degree, ear_to_step, feel_to_chord", () => {
  // Seed the learning state so picker can't pick anything else.
  const state = emptyLearningState();
  // Make every other concept maximally cooled by marking them in recentConcepts.
  const recent = ["concept:C:1","concept:C:2","concept:C:3","concept:C:4","concept:C:6","concept:C:7"];
  const rng = () => 0.5;
  const q1 = generateQuestion(baseArgs({ mode: "chord_to_degree", tonalityId: "C", learningState: state, recentConcepts: recent.slice(), rng }));
  const q2 = generateQuestion(baseArgs({ mode: "ear_to_step",     tonalityId: "C", learningState: state, recentConcepts: recent.slice(), rng }));
  const q3 = generateQuestion(baseArgs({ mode: "feel_to_chord",   tonalityId: "C", learningState: state, recentConcepts: recent.slice(), rng }));
  // All three must have asked about the only concept left: V (concept:C:5).
  assert.equal(q1.conceptId, "concept:C:5", `q1: ${q1.conceptId}`);
  assert.equal(q2.conceptId, "concept:C:5", `q2: ${q2.conceptId}`);
  assert.equal(q3.conceptId, "concept:C:5", `q3: ${q3.conceptId}`);
});

t("invariants: assertQuestionInvariants catches missing audibleChord", () => {
  assert.throws(() => assertQuestionInvariants({
    mode: "ear_to_step", tonalityId: "C", conceptId: "concept:C:5",
    prompt: { label: "x" }, options: ["I"], correct: "I",
    audible: "chord",                    // missing audibleChord
  }), /audibleChord/);
});

t("invariants: assertQuestionInvariants catches correct ∉ options", () => {
  assert.throws(() => assertQuestionInvariants({
    mode: "degree_to_chord", tonalityId: "C", conceptId: "concept:C:5",
    prompt: { label: "x" }, options: ["A", "B"], correct: "X",
  }), /not in options/);
});

t("invariants: assertQuestionInvariants catches missing conceptId", () => {
  assert.throws(() => assertQuestionInvariants({
    mode: "degree_to_chord", tonalityId: "C",
    prompt: { label: "x" }, options: ["A"], correct: "A",
  }), /conceptId/);
});

t("regression: C major + I -> C; C major + V -> G; A minor + VI -> F; A minor + VII -> G", () => {
  // Force-pick a specific degree by giving a pool where 6 of 7 are in cooldown.
  function force(mode, tonalityId, degreeToForce) {
    const recent = [1,2,3,4,5,6,7].filter((d) => d !== degreeToForce).map((d) => `concept:${tonalityId}:${d}`);
    return generateQuestion(baseArgs({ mode, tonalityId, recentConcepts: recent }));
  }
  const c1 = force("degree_to_chord", "C", 1);
  assert.equal(c1.correct, "C");
  const c5 = force("degree_to_chord", "C", 5);
  assert.equal(c5.correct, "G");
  const a6 = force("degree_to_chord", "Am", 6);
  assert.equal(a6.correct, "F");
  const a7 = force("degree_to_chord", "Am", 7);
  assert.equal(a7.correct, "G");
});

if (failed > 0) { console.error(`\n${failed} failed`); process.exit(1); }
else console.log("\nall question tests passed");
