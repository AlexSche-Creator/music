/* Concept layer — a single canonical identifier for the same musical entity
 * regardless of which question type asked about it.
 *
 *   concept:C:5    == "the V degree in C major"
 *   concept:Am:1   == "the i degree in A minor"
 *   concept:seq:I-V-vi-IV  == "the I–V–vi–IV progression"
 *
 * The legacy itemKey forms (step / chord / feel / seq) all collapse to these
 * IDs so that learning state is tracked once per concept, not once per
 * representation. This is what §18.4 / §18.13 of the spec asks for: the
 * engine has to know that "V in C major asked as a chord-to-degree question"
 * and "V in C major asked by ear" refer to the same memory.
 */

import { TONALITIES } from "../data/tonalities.js";

/** Inverse lookup: chord symbol in a tonality → degree (1..7) or null. */
export function chordToDegree(tonalityId, chord) {
  const t = TONALITIES[tonalityId];
  if (!t) return null;
  const list = t.chordsByTonality[tonalityId];
  if (!list) return null;
  const idx = list.indexOf(chord);
  return idx === -1 ? null : idx + 1;
}

export function conceptForDegree(tonalityId, degree) {
  if (!TONALITIES[tonalityId]) return null;
  if (typeof degree !== "number" || degree < 1 || degree > 7) return null;
  return `concept:${tonalityId}:${degree}`;
}

export function conceptForChord(tonalityId, chord) {
  const d = chordToDegree(tonalityId, chord);
  return d ? conceptForDegree(tonalityId, d) : null;
}

export function conceptForSequence(progId) {
  return progId ? `concept:seq:${progId}` : null;
}

/** Translate any legacy itemKey to a concept id. Returns null if unparseable. */
export function itemKeyToConcept(itemKey) {
  if (typeof itemKey !== "string") return null;
  const [kind, a, b] = itemKey.split(":");
  if (kind === "step")  return conceptForDegree(a, parseInt(b, 10));
  if (kind === "chord") return conceptForChord(a, b);
  if (kind === "feel")  return conceptForChord(a, b);
  if (kind === "seq")   return conceptForSequence(a);
  return null;
}

/** All seven concepts for a tonality, in degree order. */
export function tonalityConcepts(tonalityId) {
  if (!TONALITIES[tonalityId]) return [];
  return [1, 2, 3, 4, 5, 6, 7].map((d) => conceptForDegree(tonalityId, d));
}

/** Decode a concept id into its parts. Returns null if unparseable. */
export function parseConcept(conceptId) {
  if (typeof conceptId !== "string") return null;
  const [_, a, b] = conceptId.split(":");
  if (a === "seq") return { kind: "sequence", progId: b };
  const tonalityId = a;
  const degree = parseInt(b, 10);
  if (!TONALITIES[tonalityId] || Number.isNaN(degree)) return null;
  const step = TONALITIES[tonalityId].steps[degree - 1];
  const chord = TONALITIES[tonalityId].chordsByTonality[tonalityId][degree - 1];
  return { kind: "degree", tonalityId, degree, step, chord };
}

/** Human-readable label for use in stats, recommendations, reflection text. */
export function conceptToHumanLabel(conceptId) {
  const p = parseConcept(conceptId);
  if (!p) return conceptId;
  if (p.kind === "sequence") return `Прогрессия ${p.progId}`;
  return `${p.step.roman} (${p.chord}) в ${TONALITIES[p.tonalityId].russian}`;
}
