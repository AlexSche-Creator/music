/* Full roster of 24 tonalities (12 major + 12 minor).
 *
 * Used by:
 *  - the upcoming "New Tonalities" module (Phase 3)
 *  - the Settings screen to let the user mark each tonality as
 *    active / favourite / hidden
 *  - Practice Score and habit tracking to know which keys are in rotation
 *
 * The existing app only audibly trains C major and A minor (those live in
 * `tonalities.js` with their full step lists). The others here are metadata
 * only — degrees/chords for them will be generated programmatically from
 * intervals in Phase 3 when the New Tonalities module ships. For now we just
 * carry name + relative + sharps/flats info so the Settings UI has something
 * to render.
 */

export const KEY_ROSTER = [
  // Major keys (clockwise around the circle of fifths)
  { id: "C",   name: "C major",   russian: "До мажор",         mode: "major", sharps: 0,  flats: 0,  relative: "Am",  status: "starter" },
  { id: "G",   name: "G major",   russian: "Соль мажор",       mode: "major", sharps: 1,  flats: 0,  relative: "Em",  status: "new" },
  { id: "D",   name: "D major",   russian: "Ре мажор",         mode: "major", sharps: 2,  flats: 0,  relative: "Bm",  status: "new" },
  { id: "A",   name: "A major",   russian: "Ля мажор",         mode: "major", sharps: 3,  flats: 0,  relative: "F#m", status: "new" },
  { id: "E",   name: "E major",   russian: "Ми мажор",         mode: "major", sharps: 4,  flats: 0,  relative: "C#m", status: "new" },
  { id: "B",   name: "B major",   russian: "Си мажор",         mode: "major", sharps: 5,  flats: 0,  relative: "G#m", status: "new" },
  { id: "F#",  name: "F♯ major",  russian: "Фа-диез мажор",    mode: "major", sharps: 6,  flats: 0,  relative: "D#m", status: "new" },
  { id: "Db",  name: "D♭ major",  russian: "Ре-бемоль мажор",  mode: "major", sharps: 0,  flats: 5,  relative: "Bbm", status: "new" },
  { id: "Ab",  name: "A♭ major",  russian: "Ля-бемоль мажор",  mode: "major", sharps: 0,  flats: 4,  relative: "Fm",  status: "new" },
  { id: "Eb",  name: "E♭ major",  russian: "Ми-бемоль мажор",  mode: "major", sharps: 0,  flats: 3,  relative: "Cm",  status: "new" },
  { id: "Bb",  name: "B♭ major",  russian: "Си-бемоль мажор",  mode: "major", sharps: 0,  flats: 2,  relative: "Gm",  status: "new" },
  { id: "F",   name: "F major",   russian: "Фа мажор",         mode: "major", sharps: 0,  flats: 1,  relative: "Dm",  status: "new" },

  // Minor keys (sorted to mirror majors)
  { id: "Am",  name: "A minor",   russian: "Ля минор",         mode: "minor", sharps: 0,  flats: 0,  relative: "C",   status: "starter" },
  { id: "Em",  name: "E minor",   russian: "Ми минор",         mode: "minor", sharps: 1,  flats: 0,  relative: "G",   status: "new" },
  { id: "Bm",  name: "B minor",   russian: "Си минор",         mode: "minor", sharps: 2,  flats: 0,  relative: "D",   status: "new" },
  { id: "F#m", name: "F♯ minor",  russian: "Фа-диез минор",    mode: "minor", sharps: 3,  flats: 0,  relative: "A",   status: "new" },
  { id: "C#m", name: "C♯ minor",  russian: "До-диез минор",    mode: "minor", sharps: 4,  flats: 0,  relative: "E",   status: "new" },
  { id: "G#m", name: "G♯ minor",  russian: "Соль-диез минор",  mode: "minor", sharps: 5,  flats: 0,  relative: "B",   status: "new" },
  { id: "D#m", name: "D♯ minor",  russian: "Ре-диез минор",    mode: "minor", sharps: 6,  flats: 0,  relative: "F#",  status: "new" },
  { id: "Bbm", name: "B♭ minor",  russian: "Си-бемоль минор",  mode: "minor", sharps: 0,  flats: 5,  relative: "Db",  status: "new" },
  { id: "Fm",  name: "F minor",   russian: "Фа минор",         mode: "minor", sharps: 0,  flats: 4,  relative: "Ab",  status: "new" },
  { id: "Cm",  name: "C minor",   russian: "До минор",         mode: "minor", sharps: 0,  flats: 3,  relative: "Eb",  status: "new" },
  { id: "Gm",  name: "G minor",   russian: "Соль минор",       mode: "minor", sharps: 0,  flats: 2,  relative: "Bb",  status: "new" },
  { id: "Dm",  name: "D minor",   russian: "Ре минор",         mode: "minor", sharps: 0,  flats: 1,  relative: "F",   status: "new" },
];

export const STARTER_KEY_IDS = ["C", "Am"];

/** Default per-user roster prefs. status: active|favourite|hidden|inProgress|repeated|strong */
export function defaultKeyPrefs() {
  const out = {};
  for (const k of KEY_ROSTER) {
    out[k.id] = { active: k.status === "starter", favourite: false, hidden: false };
  }
  return out;
}

/** Resolved view: roster items merged with user prefs. */
export function resolveKeyRoster(prefs) {
  const p = prefs || {};
  return KEY_ROSTER.map((k) => ({
    ...k,
    active: p[k.id] ? !!p[k.id].active : k.status === "starter",
    favourite: p[k.id] ? !!p[k.id].favourite : false,
    hidden: p[k.id] ? !!p[k.id].hidden : false,
  }));
}

export function findKey(keyId) {
  return KEY_ROSTER.find((k) => k.id === keyId) || null;
}

export function activeKeys(prefs) {
  return resolveKeyRoster(prefs).filter((k) => k.active && !k.hidden);
}
