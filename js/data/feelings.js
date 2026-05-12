/* Default emotional associations per chord, per tonality.
 *
 * Feelings are *per tonality* because the same chord (e.g. C) plays a very
 * different role in C major (tonic — home) vs A minor (relative major — light
 * inside the minor).
 *
 * Users can override these in Settings; overrides live in IndexedDB and are
 * merged on top of these defaults at runtime.
 */

export const DEFAULT_FEELINGS = {
  // A minor — the user-supplied baseline.
  Am: {
    Am:   "Тревога, вьюга",
    Bdim: "Грусть, тоска",
    C:    "Радость, надежда",
    Dm:   "Сожаление, кульминация",
    Em:   "Ступор, обрыв",
    F:    "Улыбка, надежда",
    G:    "Спокойствие, дыхание"
  },
  // C major — reasonable defaults, fully overridable.
  C: {
    C:    "Опора, ясный свет",
    Dm:   "Сомнение, шаг вперёд",
    Em:   "Задумчивость, лёгкая тень",
    F:    "Воздух, открытие",
    G:    "Натяжение, ожидание",
    Am:   "Тёплая печаль",
    Bdim: "Острое ожидание"
  }
};

/** Build an override-aware feelings map merging defaults + user overrides. */
export function effectiveFeelings(overrides) {
  const merged = { Am: { ...DEFAULT_FEELINGS.Am }, C: { ...DEFAULT_FEELINGS.C } };
  if (overrides && typeof overrides === "object") {
    for (const tid of Object.keys(merged)) {
      const o = overrides[tid];
      if (o && typeof o === "object") {
        Object.assign(merged[tid], o);
      }
    }
  }
  return merged;
}

/** Unique set of feeling strings across both tonalities (for option pools). */
export function allFeelings(feelingsMap) {
  const seen = new Set();
  for (const tid of Object.keys(feelingsMap)) {
    for (const f of Object.values(feelingsMap[tid])) {
      if (f && !seen.has(f)) seen.add(f);
    }
  }
  return Array.from(seen);
}
