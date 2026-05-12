/* Tonality data: C major and A minor.
 *
 * For each step we record:
 *  - degree (1..7), arabic
 *  - roman   ("I", "ii", "iii"…)  — case reflects chord quality
 *  - name    Russian display name
 *  - intervalSemitones from tonic
 *  - chordType  "maj" | "min" | "dim" | "aug"
 *  - functionKey  one of: tonic | supertonic | mediant | subdominant | dominant | submediant | leading | subtonic
 *  - chordsByTonality.{C, Am}  — actual chord symbols in each key
 *  - meaning  — short musical role description (Russian)
 *  - feelingDefault — user's emotional association (overridable)
 *
 * Two tonalities share the same notes; we list them separately so the UI can
 * treat each independently and so different "feelings" can live per-mode.
 */

export const TONALITIES = {
  C: {
    id: "C",
    name: "C major",
    russian: "До мажор",
    mode: "major",
    tonic: "C",
    tonicMidi: 60, // C4
    scaleNotes: ["C", "D", "E", "F", "G", "A", "B"],
    steps: [
      {
        degree: 1, arabic: "1", roman: "I",
        name: "Тоника",
        intervalSemitones: 0,
        chordType: "maj",
        functionKey: "tonic",
        meaning: "Дом. Точка покоя и устойчивости.",
        feelingDefault: "Опора, ясность"
      },
      {
        degree: 2, arabic: "2", roman: "ii",
        name: "Надтоническая",
        intervalSemitones: 2,
        chordType: "min",
        functionKey: "supertonic",
        meaning: "Предъдоминанта. Готовит V.",
        feelingDefault: "Сомнение, движение"
      },
      {
        degree: 3, arabic: "3", roman: "iii",
        name: "Медианта",
        intervalSemitones: 4,
        chordType: "min",
        functionKey: "mediant",
        meaning: "Цветок тоники. Мягкое продолжение.",
        feelingDefault: "Задумчивость"
      },
      {
        degree: 4, arabic: "4", roman: "IV",
        name: "Субдоминанта",
        intervalSemitones: 5,
        chordType: "maj",
        functionKey: "subdominant",
        meaning: "Простор. Уходит от тоники, ведёт к V.",
        feelingDefault: "Воздух, открытие"
      },
      {
        degree: 5, arabic: "5", roman: "V",
        name: "Доминанта",
        intervalSemitones: 7,
        chordType: "maj",
        functionKey: "dominant",
        meaning: "Напряжение. Тянет домой к I.",
        feelingDefault: "Натяжение, ожидание"
      },
      {
        degree: 6, arabic: "6", roman: "vi",
        name: "Субмедианта",
        intervalSemitones: 9,
        chordType: "min",
        functionKey: "submediant",
        meaning: "Параллель мажора. Тёплая грусть.",
        feelingDefault: "Тёплая печаль"
      },
      {
        degree: 7, arabic: "7", roman: "vii°",
        name: "Вводный",
        intervalSemitones: 11,
        chordType: "dim",
        functionKey: "leading",
        meaning: "Острое тяготение к тонике.",
        feelingDefault: "Острое ожидание"
      }
    ],
    chordsByTonality: {
      C:  ["C",  "Dm", "Em", "F",  "G",  "Am", "Bdim"],
      Am: ["Am", "Bdim","C",  "Dm", "Em", "F",  "G"]
    }
  },

  Am: {
    id: "Am",
    name: "A minor",
    russian: "Ля минор (натуральный)",
    mode: "minor",
    tonic: "A",
    tonicMidi: 57, // A3
    scaleNotes: ["A", "B", "C", "D", "E", "F", "G"],
    steps: [
      {
        degree: 1, arabic: "1", roman: "i",
        name: "Тоника",
        intervalSemitones: 0,
        chordType: "min",
        functionKey: "tonic",
        meaning: "Дом минора. Покой с оттенком тени.",
        feelingDefault: "Тревога, вьюга"
      },
      {
        degree: 2, arabic: "2", roman: "ii°",
        name: "Надтоническая",
        intervalSemitones: 2,
        chordType: "dim",
        functionKey: "supertonic",
        meaning: "Резкая, неустойчивая. Тянет к v или V.",
        feelingDefault: "Грусть, тоска"
      },
      {
        degree: 3, arabic: "3", roman: "III",
        name: "Медианта",
        intervalSemitones: 3,
        chordType: "maj",
        functionKey: "mediant",
        meaning: "Параллельный мажор. Свет внутри минора.",
        feelingDefault: "Радость, надежда"
      },
      {
        degree: 4, arabic: "4", roman: "iv",
        name: "Субдоминанта",
        intervalSemitones: 5,
        chordType: "min",
        functionKey: "subdominant",
        meaning: "Тяжёлая, печальная предъдоминанта.",
        feelingDefault: "Сожаление, кульминация"
      },
      {
        degree: 5, arabic: "5", roman: "v",
        name: "Доминанта",
        intervalSemitones: 7,
        chordType: "min",
        functionKey: "dominant",
        meaning: "Минорная доминанта — мягкое тяготение.",
        feelingDefault: "Ступор, обрыв"
      },
      {
        degree: 6, arabic: "6", roman: "VI",
        name: "Субмедианта",
        intervalSemitones: 8,
        chordType: "maj",
        functionKey: "submediant",
        meaning: "Тёплый мажор внутри минора.",
        feelingDefault: "Улыбка, надежда"
      },
      {
        degree: 7, arabic: "7", roman: "VII",
        name: "Субтоника",
        intervalSemitones: 10,
        chordType: "maj",
        functionKey: "subtonic",
        meaning: "Не острая, не вводная. Дыхание перед тоникой.",
        feelingDefault: "Спокойствие, дыхание"
      }
    ],
    chordsByTonality: {
      C:  ["C",  "Dm", "Em", "F",  "G",  "Am", "Bdim"],
      Am: ["Am", "Bdim","C",  "Dm", "Em", "F",  "G"]
    }
  }
};

export const TONALITY_IDS = ["C", "Am"];

/** All chord symbols used across both tonalities (deduped, stable order). */
export const ALL_CHORDS = ["C", "Dm", "Em", "F", "G", "Am", "Bdim"];

/** Resolve a step's chord symbol in its own tonality. */
export function chordForStep(tonalityId, degree) {
  const t = TONALITIES[tonalityId];
  if (!t) return null;
  return t.chordsByTonality[tonalityId][degree - 1] || null;
}
