/* Pentatonic scale data used by the Improvisation module.
 *
 * Each scale lists 5 pitch-classes from the root (root included). We pre-bake
 * the two flavours the app uses today (minor and major pentatonic) for the 12
 * chromatic roots so the UI can render position dots and the audio engine can
 * sequence notes without re-computing intervals on every render.
 */

export const MINOR_PENTATONIC_INTERVALS = [0, 3, 5, 7, 10];
export const MAJOR_PENTATONIC_INTERVALS = [0, 2, 4, 7, 9];

const NOTE_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function shift(intervals, rootPc) {
  return intervals.map((iv) => (rootPc + iv) % 12);
}

/** Build a scale {root, type, pcs, notes} from a root note name. */
export function buildPentatonic(root, type) {
  const rootPc = NOTE_NAMES_SHARP.indexOf(root);
  if (rootPc === -1) return null;
  const intervals = type === "major_pentatonic" ? MAJOR_PENTATONIC_INTERVALS : MINOR_PENTATONIC_INTERVALS;
  const pcs = shift(intervals, rootPc);
  return {
    root,
    type,
    pcs,
    notes: pcs.map((pc) => NOTE_NAMES_SHARP[pc]),
  };
}

/** Get the scale that matches a tonality id (C, Am, …). Minor tonalities use
 *  the minor pentatonic on their root; major ones use the major pentatonic. */
export function pentatonicForTonality(tonalityId, override = null) {
  if (override) return buildPentatonic(rootOfTonality(tonalityId), override);
  const isMinor = tonalityId.endsWith("m");
  const root = rootOfTonality(tonalityId);
  return buildPentatonic(root, isMinor ? "minor_pentatonic" : "major_pentatonic");
}

export function rootOfTonality(tonalityId) {
  return tonalityId.replace(/m$/, "");
}

/** Backing-track chord loop suggestions per tonality. Two-chord vamps that
 *  always sound musical with their pentatonic. */
export function backingLoopFor(tonalityId) {
  const minor = tonalityId.endsWith("m");
  const root = rootOfTonality(tonalityId);
  if (minor) {
    return [`${root}m`, `${perfectFourthMinor(root)}m`];
  }
  return [root, perfectFourthMajor(root)];
}

function perfectFourthMajor(root) {
  const i = NOTE_NAMES_SHARP.indexOf(root);
  return NOTE_NAMES_SHARP[(i + 5) % 12];
}

function perfectFourthMinor(root) {
  const i = NOTE_NAMES_SHARP.indexOf(root);
  return NOTE_NAMES_SHARP[(i + 5) % 12];
}

/** Suggested pentatonic notes at a chord — used by the UI to highlight
 *  "anchor" pitches that always sound consonant against the current chord. */
export function anchorPcsForChord(scalePcs, chordSymbol) {
  const root = chordSymbol.match(/^[A-G][b#]?/)?.[0];
  if (!root) return [];
  const rootPc = NOTE_NAMES_SHARP.indexOf(root);
  if (rootPc === -1) return [];
  const triad = [rootPc, (rootPc + 4) % 12, (rootPc + 7) % 12];
  if (/m($|[^a])/.test(chordSymbol)) triad[1] = (rootPc + 3) % 12;
  return triad.filter((pc) => scalePcs.includes(pc));
}
