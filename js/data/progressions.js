/* Canonical progressions, expressed both in Roman numerals (mode-agnostic
 * lower/upper case will be derived from the tonality) and as concrete chords
 * in each of the two starter tonalities.
 */

export const PROGRESSIONS = [
  {
    id: "I-V-vi-IV",
    name: "I–V–vi–IV",
    flavor: "Поп-оборот. Самый узнаваемый «гимн-прогрессия».",
    mode: "major",
    degrees: [1, 5, 6, 4],
    qualities: ["maj", "maj", "min", "maj"],
    chordsByTonality: { C: ["C", "G", "Am", "F"], Am: ["Am", "Em", "F", "Dm"] }
  },
  {
    id: "I-vi-IV-V",
    name: "I–vi–IV–V",
    flavor: "Классика 50-х. Тёплая ностальгия.",
    mode: "major",
    degrees: [1, 6, 4, 5],
    qualities: ["maj", "min", "maj", "maj"],
    chordsByTonality: { C: ["C", "Am", "F", "G"], Am: ["Am", "F", "Dm", "Em"] }
  },
  {
    id: "ii-V-I",
    name: "ii–V–I",
    flavor: "Главный каденс. Сердцевина джазовой гармонии.",
    mode: "major",
    degrees: [2, 5, 1],
    qualities: ["min", "maj", "maj"],
    chordsByTonality: { C: ["Dm", "G", "C"], Am: ["Bdim", "Em", "Am"] }
  },
  {
    id: "i-VI-III-VII",
    name: "i–VI–III–VII",
    flavor: "Эпик-минор. Кинематографичный и драматичный.",
    mode: "minor",
    degrees: [1, 6, 3, 7],
    qualities: ["min", "maj", "maj", "maj"],
    chordsByTonality: { Am: ["Am", "F", "C", "G"], C: ["Am", "F", "C", "G"] }
  },
  {
    id: "i-iv-v",
    name: "i–iv–v",
    flavor: "Натуральный минор. Древний, ладовый звук.",
    mode: "minor",
    degrees: [1, 4, 5],
    qualities: ["min", "min", "min"],
    chordsByTonality: { Am: ["Am", "Dm", "Em"], C: ["Am", "Dm", "Em"] }
  },
  {
    id: "i-VII-VI-VII",
    name: "i–VII–VI–VII",
    flavor: "Лестница вниз и обратно. Меланхоличный пульс.",
    mode: "minor",
    degrees: [1, 7, 6, 7],
    qualities: ["min", "maj", "maj", "maj"],
    chordsByTonality: { Am: ["Am", "G", "F", "G"], C: ["Am", "G", "F", "G"] }
  }
];

/** Find a progression by id. */
export function progressionById(id) {
  return PROGRESSIONS.find((p) => p.id === id) || null;
}
