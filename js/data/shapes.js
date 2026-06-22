/* Chord shape diagrams for the "Аппликатуры" module.
 *
 * Each shape is a 6-string voicing for guitar (6 = low E, 1 = high E in the
 * standard "guitar dictionary" convention). We use 1..6 from low to high to
 * mirror how the UI draws the diagram top-down.
 *
 * `frets`: array of 6 numbers OR "x" for muted string. The leftmost element
 *   is the low E string.
 * `fingers`: array of 6 numbers 0..4 (0 = open / no finger).
 * `baseFret`: if > 0, the diagram is rendered starting at that fret.
 *
 * This is reference data; the app does not enforce any of it musically.
 */

export const SHAPE_FAMILIES = [
  {
    id: "C",
    label: "C — мажор",
    shapes: [
      { id: "C-open",    label: "C open",       frets: ["x", 3, 2, 0, 1, 0], fingers: [0,3,2,0,1,0], baseFret: 0 },
      { id: "Cmaj7",     label: "Cmaj7",        frets: ["x", 3, 2, 0, 0, 0], fingers: [0,3,2,0,0,0], baseFret: 0 },
      { id: "Cadd9",     label: "Cadd9",        frets: ["x", 3, 2, 0, 3, 0], fingers: [0,2,1,0,3,0], baseFret: 0 },
      { id: "C-barre-3", label: "C (бар 3 лад)",frets: [ 3,  3, 5, 5, 5, 3], fingers: [1,1,2,3,4,1], baseFret: 3 },
    ],
  },
  {
    id: "Am",
    label: "Am — минор",
    shapes: [
      { id: "Am-open", label: "Am open",  frets: ["x", 0, 2, 2, 1, 0], fingers: [0,0,2,3,1,0], baseFret: 0 },
      { id: "Am7",     label: "Am7",      frets: ["x", 0, 2, 0, 1, 0], fingers: [0,0,2,0,1,0], baseFret: 0 },
      { id: "Amadd9",  label: "Am(add9)", frets: ["x", 0, 2, 2, 1, 3], fingers: [0,0,2,3,1,4], baseFret: 0 },
      { id: "Am-barre-5", label: "Am (бар 5 лад)", frets: [ 5, 7, 7, 5, 5, 5], fingers: [1,3,4,1,1,1], baseFret: 5 },
    ],
  },
  {
    id: "Dm",
    label: "Dm — минор",
    shapes: [
      { id: "Dm-open", label: "Dm open",  frets: ["x", "x", 0, 2, 3, 1], fingers: [0,0,0,2,3,1], baseFret: 0 },
      { id: "Dm7",     label: "Dm7",      frets: ["x", "x", 0, 2, 1, 1], fingers: [0,0,0,2,1,1], baseFret: 0 },
      { id: "Dsus2",   label: "Dsus2",    frets: ["x", "x", 0, 2, 3, 0], fingers: [0,0,0,1,2,0], baseFret: 0 },
    ],
  },
  {
    id: "G",
    label: "G — мажор",
    shapes: [
      { id: "G-open",  label: "G open",   frets: [3, 2, 0, 0, 0, 3], fingers: [2,1,0,0,0,3], baseFret: 0 },
      { id: "G7",      label: "G7",       frets: [3, 2, 0, 0, 0, 1], fingers: [3,2,0,0,0,1], baseFret: 0 },
      { id: "Gsus4",   label: "Gsus4",    frets: [3, "x", 0, 0, 1, 3], fingers: [2,0,0,0,1,4], baseFret: 0 },
    ],
  },
  {
    id: "F",
    label: "F — мажор (бар)",
    shapes: [
      { id: "F-barre", label: "F (бар)",  frets: [1, 3, 3, 2, 1, 1], fingers: [1,3,4,2,1,1], baseFret: 1 },
      { id: "Fmaj7",   label: "Fmaj7",    frets: ["x", 3, 3, 2, 1, 0], fingers: [0,3,4,2,1,0], baseFret: 0 },
    ],
  },
  {
    id: "Em",
    label: "Em — минор",
    shapes: [
      { id: "Em-open", label: "Em open",  frets: [0, 2, 2, 0, 0, 0], fingers: [0,2,3,0,0,0], baseFret: 0 },
      { id: "Em7",     label: "Em7",      frets: [0, 2, 0, 0, 0, 0], fingers: [0,2,0,0,0,0], baseFret: 0 },
    ],
  },
];

export const EXTENSION_LABELS = {
  maj7: "maj7", m7: "m7", sus2: "sus2", sus4: "sus4", add9: "add9", "7": "dominant 7",
};

export function findFamily(id) {
  return SHAPE_FAMILIES.find((f) => f.id === id) || null;
}

/** Filter a family's shapes to those that match the enabled extensions. */
export function filterShapes(family, enabledExtensions) {
  if (!family) return [];
  const ext = enabledExtensions || [];
  return family.shapes.filter((s) => {
    if (s.id.includes("maj7") && !ext.includes("maj7")) return false;
    if (/m7$/.test(s.id) && !ext.includes("m7")) return false;
    if (s.id.includes("sus2") && !ext.includes("sus2")) return false;
    if (s.id.includes("sus4") && !ext.includes("sus4")) return false;
    if (s.id.includes("add9") && !ext.includes("add9")) return false;
    if (/^[A-G]7/.test(s.id) && !ext.includes("7")) return false;
    return true;
  });
}
