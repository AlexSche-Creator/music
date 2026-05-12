/* Music theory primitives.
 *
 * Two design rules:
 *  1. All transformations are pure — no DOM, no audio context, no storage.
 *  2. Chord symbols and step lookups go through this module so the rest of
 *     the app never hard-codes degree→chord arithmetic.
 */

import { TONALITIES, ALL_CHORDS } from "../data/tonalities.js";

const NOTE_PC = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4,
                  F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9,
                  "A#": 10, Bb: 10, B: 11 };
const PC_NOTE_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Pitch-class of a note name. */
export function pc(noteName) {
  return NOTE_PC[noteName] ?? null;
}

/** Build the triad pitches (semitones from tonic) for a chord quality. */
export function triadIntervals(quality) {
  switch (quality) {
    case "maj": return [0, 4, 7];
    case "min": return [0, 3, 7];
    case "dim": return [0, 3, 6];
    case "aug": return [0, 4, 8];
    default:    return [0, 4, 7];
  }
}

/** Parse a chord symbol (e.g. "Am", "Bdim", "F#m", "C") into {root, quality}. */
export function parseChord(symbol) {
  const m = symbol.match(/^([A-G][b#]?)(.*)$/);
  if (!m) return null;
  const root = m[1];
  const tail = m[2];
  let quality = "maj";
  if (tail === "m") quality = "min";
  else if (tail === "dim" || tail === "°") quality = "dim";
  else if (tail === "aug" || tail === "+") quality = "aug";
  else if (tail === "") quality = "maj";
  else {
    // Unsupported extensions — fall back to triad guess.
    if (tail.startsWith("m")) quality = "min";
  }
  return { root, quality };
}

/** Triad MIDI notes around a given octave. baseOctave defines root octave. */
export function chordMidiNotes(symbol, baseOctave = 4) {
  const p = parseChord(symbol);
  if (!p) return [];
  const rootPc = pc(p.root);
  if (rootPc == null) return [];
  const rootMidi = 12 * (baseOctave + 1) + rootPc; // MIDI: C-1 = 0
  return triadIntervals(p.quality).map((iv) => rootMidi + iv);
}

/** MIDI number → frequency in Hz (A4 = 440Hz = MIDI 69). */
export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Find the step object for a given chord symbol within a tonality.
 *  Returns null if the chord is not diatonic in that tonality.
 */
export function stepForChordIn(tonalityId, chordSymbol) {
  const t = TONALITIES[tonalityId];
  if (!t) return null;
  const list = t.chordsByTonality[tonalityId];
  const idx = list.indexOf(chordSymbol);
  if (idx === -1) return null;
  return t.steps[idx];
}

/** Chord symbol at a given degree (1..7) in a tonality. */
export function chordAtDegree(tonalityId, degree) {
  const t = TONALITIES[tonalityId];
  if (!t) return null;
  return t.chordsByTonality[tonalityId][degree - 1] || null;
}

/** Roman numeral display for a degree+quality (case reflects quality). */
export function romanFor(degree, quality) {
  const base = ["I", "II", "III", "IV", "V", "VI", "VII"][degree - 1];
  if (!base) return "?";
  if (quality === "min") return base.toLowerCase();
  if (quality === "dim") return base.toLowerCase() + "°";
  if (quality === "aug") return base + "+";
  return base;
}

/** Build a deterministic list of distractors for multiple-choice options.
 *  - pool: array of strings (chord symbols, degree labels, feelings…)
 *  - correct: the right answer
 *  - n: total option count (including the correct one)
 *  - rng: optional PRNG returning [0,1)
 */
export function buildOptions(pool, correct, n = 4, rng = Math.random) {
  const others = pool.filter((x) => x !== correct);
  // Fisher-Yates shuffle.
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const picks = others.slice(0, Math.max(0, n - 1));
  const all = [...picks, correct];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

/** Logical "next chord" guesses for a partial progression — used by the
 *  "guess the next chord" mini-mode. Returns the canonical continuation if the
 *  partial matches a known progression prefix, else falls back to V or i/I.
 */
export function suggestNextChord(progressions, tonalityId, played) {
  for (const p of progressions) {
    const seq = p.chordsByTonality[tonalityId];
    if (!seq) continue;
    if (played.length < seq.length) {
      let match = true;
      for (let i = 0; i < played.length; i++) {
        if (seq[i] !== played[i]) { match = false; break; }
      }
      if (match) return seq[played.length];
    }
  }
  // Fallback: dominant of current tonality.
  return chordAtDegree(tonalityId, 5);
}

/** Sanity helper: every chord referenced should appear in ALL_CHORDS. */
export function chordIsKnown(symbol) {
  return ALL_CHORDS.includes(symbol);
}
