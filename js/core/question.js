/* Question factory — pure, no DOM, no audio side effects.
 *
 * One source of truth per question: every field (prompt, options, correct
 * answer, audible payload, conceptId) is derived from the same picked concept
 * inside this function. The returned object is frozen so any later code that
 * tries to mutate it will throw (§13).
 *
 * generateQuestion returns the shape:
 *   { mode, tonalityId, conceptId, itemKey,
 *     prompt: { label, big, bigAccent?, sub? },
 *     options: string[], correct: string,
 *     audible?: "chord" | "arpeggio" | "sequence",
 *     audibleChord?, audibleSequence?,
 *     autoplay?: boolean }
 */

import { TONALITIES, ALL_CHORDS } from "../data/tonalities.js";
import { PROGRESSIONS } from "../data/progressions.js";
import { allFeelings } from "../data/feelings.js";
import { buildOptions, chordAtDegree, stepForChordIn } from "./theory.js";
import { conceptForDegree, conceptForSequence, parseConcept, tonalityConcepts } from "./concept.js";
import { pickNextConcept } from "./session-planner.js";

export const MIX_POOL = Object.freeze([
  "degree_to_chord", "chord_to_degree", "feel_to_chord",
  "chord_to_feel", "ear_to_step", "ear_to_feel", "next_chord",
]);

export const REAL_MODES = new Set([
  ...MIX_POOL,
  "flashcards", "exam", "ladder", "compare",
]);

/* ---------- helpers ---------- */

function pickSequenceConcept(state, tonalityId, ctx) {
  const pool = PROGRESSIONS
    .filter((p) => p.chordsByTonality && p.chordsByTonality[tonalityId])
    .map((p) => conceptForSequence(p.id))
    .filter(Boolean);
  return pickNextConcept(state, pool, ctx);
}

function progById(progId) {
  return PROGRESSIONS.find((p) => p.id === progId) || null;
}

function freezeQuestion(q) {
  assertQuestionInvariants(q);
  // Freeze prompt subobject too so nothing can swap it after build.
  if (q.prompt) Object.freeze(q.prompt);
  if (q.options) Object.freeze(q.options);
  if (q.audibleSequence) Object.freeze(q.audibleSequence);
  return Object.freeze(q);
}

/** Throws if any invariant is violated. Called for every question. */
export function assertQuestionInvariants(q) {
  if (!q || typeof q !== "object") throw new Error("Q invariant: not an object");
  if (!q.mode) throw new Error("Q invariant: mode missing");
  if (!q.tonalityId && q.mode !== "exam") throw new Error("Q invariant: tonalityId missing");
  if (!q.conceptId) throw new Error("Q invariant: conceptId missing");
  if (!q.prompt || typeof q.prompt !== "object") throw new Error("Q invariant: prompt missing");
  if (!Array.isArray(q.options)) throw new Error("Q invariant: options not array");
  if (q.options.length === 0) throw new Error("Q invariant: options empty");
  if (q.correct == null) throw new Error("Q invariant: correct missing");
  if (!q.options.includes(q.correct)) {
    throw new Error(`Q invariant: correct '${q.correct}' not in options ${JSON.stringify(q.options)}`);
  }
  if (q.audible === "chord" || q.audible === "arpeggio") {
    if (!q.audibleChord || typeof q.audibleChord !== "string") {
      throw new Error(`Q invariant: audible=${q.audible} requires audibleChord`);
    }
  }
  if (q.audible === "sequence") {
    if (!Array.isArray(q.audibleSequence) || q.audibleSequence.length === 0) {
      throw new Error("Q invariant: audible=sequence requires non-empty audibleSequence");
    }
  }
}

/* ---------- main entry ---------- */

/**
 * @param {object} args
 * @param {string} args.mode
 * @param {string} args.tonalityId
 * @param {object} args.learningState
 * @param {object} args.feelings              effective feelings map
 * @param {string[]} args.recentConcepts      session buffer
 * @param {object[]} args.recentResults       session answers, for fatigue
 * @param {function} [args.rng]               PRNG, defaults to Math.random
 */
export function generateQuestion(args) {
  const { mode, tonalityId, learningState, feelings,
          recentConcepts = [], recentResults = [], rng = Math.random } = args;
  const ton = TONALITIES[tonalityId];
  if (!ton) return null;
  const ctx = { recentConcepts, recentResults, rng };

  if (mode === "degree_to_chord") {
    const conceptId = pickNextConcept(learningState, tonalityConcepts(tonalityId), ctx);
    const { degree, step, chord } = parseConcept(conceptId);
    return freezeQuestion({
      mode, tonalityId, conceptId,
      itemKey: `step:${tonalityId}:${degree}`,
      options: buildOptions(ALL_CHORDS, chord, 4, rng),
      correct: chord,
      prompt: {
        label: "Ступень",
        big: step.roman, bigAccent: true,
        sub: `${step.name} · ${step.meaning}`,
      },
      audible: "chord", audibleChord: chord, autoplay: true,
    });
  }

  if (mode === "chord_to_degree") {
    const conceptId = pickNextConcept(learningState, tonalityConcepts(tonalityId), ctx);
    const { degree, step, chord } = parseConcept(conceptId);
    const pool = ton.steps.map((s) => s.roman);
    return freezeQuestion({
      mode, tonalityId, conceptId,
      itemKey: `chord:${tonalityId}:${chord}`,
      options: buildOptions(pool, step.roman, 4, rng),
      correct: step.roman,
      prompt: { label: "Аккорд", big: chord, sub: "В какой это ступени?" },
      audible: "chord", audibleChord: chord, autoplay: true,
    });
  }

  if (mode === "feel_to_chord") {
    const conceptId = pickNextConcept(learningState, tonalityConcepts(tonalityId), ctx);
    const { chord } = parseConcept(conceptId);
    const feel = (feelings[tonalityId] && feelings[tonalityId][chord]) || chord;
    return freezeQuestion({
      mode, tonalityId, conceptId,
      itemKey: `feel:${tonalityId}:${chord}`,
      options: buildOptions(ton.chordsByTonality[tonalityId], chord, 4, rng),
      correct: chord,
      prompt: { label: "Чувство", big: `«${feel}»`, sub: "Какой это аккорд?" },
      audible: "chord", audibleChord: chord, autoplay: true,
    });
  }

  if (mode === "chord_to_feel") {
    const conceptId = pickNextConcept(learningState, tonalityConcepts(tonalityId), ctx);
    const { chord } = parseConcept(conceptId);
    const correctFeel = feelings[tonalityId] && feelings[tonalityId][chord];
    const feelPool = allFeelings(feelings);
    return freezeQuestion({
      mode, tonalityId, conceptId,
      itemKey: `feel:${tonalityId}:${chord}`,
      options: buildOptions(feelPool, correctFeel, 4, rng),
      correct: correctFeel,
      prompt: { label: "Аккорд", big: chord, sub: "Какое чувство?" },
      audible: "chord", audibleChord: chord, autoplay: true,
    });
  }

  if (mode === "ear_to_step") {
    const conceptId = pickNextConcept(learningState, tonalityConcepts(tonalityId), ctx);
    const { degree, step, chord } = parseConcept(conceptId);
    const pool = ton.steps.map((s) => s.roman);
    return freezeQuestion({
      mode, tonalityId, conceptId,
      itemKey: `step:${tonalityId}:${degree}`,
      options: buildOptions(pool, step.roman, 4, rng),
      correct: step.roman,
      prompt: { label: "Слушай и угадай ступень", big: ton.russian, sub: "Жми ▶ ещё раз, если нужно." },
      audible: "chord", audibleChord: chord, autoplay: true,
    });
  }

  if (mode === "ear_to_feel") {
    const conceptId = pickNextConcept(learningState, tonalityConcepts(tonalityId), ctx);
    const { chord } = parseConcept(conceptId);
    const correct = feelings[tonalityId] && feelings[tonalityId][chord];
    return freezeQuestion({
      mode, tonalityId, conceptId,
      itemKey: `feel:${tonalityId}:${chord}`,
      options: buildOptions(allFeelings(feelings), correct, 4, rng),
      correct,
      prompt: { label: "Слушай и выбери чувство", big: ton.russian },
      audible: "arpeggio", audibleChord: chord, autoplay: true,
    });
  }

  if (mode === "next_chord") {
    const conceptId = pickSequenceConcept(learningState, tonalityId, ctx);
    if (!conceptId) return null;
    const p = parseConcept(conceptId);
    const prog = progById(p.progId);
    if (!prog) return null;
    const seq = prog.chordsByTonality[tonalityId];
    const cut = Math.max(1, seq.length - 1);
    const played = seq.slice(0, cut);
    const correct = seq[cut];
    return freezeQuestion({
      mode, tonalityId, conceptId,
      itemKey: `seq:${prog.id}`,
      options: buildOptions(ALL_CHORDS, correct, 4, rng),
      correct,
      prompt: { label: "Угадай следующий", big: played.join(" – ") + " – ?" },
      audible: "sequence", audibleSequence: played, autoplay: true,
    });
  }

  if (mode === "flashcards") {
    const conceptId = pickNextConcept(learningState, tonalityConcepts(tonalityId), ctx);
    const { degree, step, chord } = parseConcept(conceptId);
    return freezeQuestion({
      mode, tonalityId, conceptId,
      itemKey: `step:${tonalityId}:${degree}`,
      options: ["Я вспомнил", "Не вспомнил"],
      correct: "Я вспомнил",
      prompt: { label: "Карточка", big: step.roman, bigAccent: true, sub: `Аккорд → ${chord}` },
      audible: "chord", audibleChord: chord, autoplay: true,
    });
  }

  if (mode === "exam") {
    const inner = MIX_POOL[Math.floor(rng() * MIX_POOL.length)];
    return generateQuestion({ ...args, mode: inner });
  }

  return null;
}

/* ---------- presentation helpers (no logic state) ---------- */

export function modeLabel(m) {
  return {
    degree_to_chord: "Ступень → аккорд",
    chord_to_degree: "Аккорд → ступень",
    feel_to_chord:   "Чувство → аккорд",
    chord_to_feel:   "Аккорд → чувство",
    ear_to_step:     "Слух → ступень",
    ear_to_feel:     "Слух → чувство",
    next_chord:      "Угадай следующий",
    flashcards:      "Карточка",
    exam:            "Экзамен",
  }[m] || m;
}

export function explain(q, feelings) {
  const t = TONALITIES[q.tonalityId];
  if (!t) return "";
  if (q.mode === "chord_to_degree" || q.mode === "ear_to_step") {
    const chord = q.audibleChord || (q.prompt.big || "").trim();
    const step = stepForChordIn(q.tonalityId, chord);
    if (step) return `${chord} — ${step.roman} (${step.name}). ${step.meaning}`;
  }
  if (q.mode === "degree_to_chord" || q.mode === "flashcards") {
    const roman = q.prompt.big;
    const idx = t.steps.findIndex((s) => s.roman === roman);
    if (idx >= 0) {
      const step = t.steps[idx];
      return `${step.roman} в ${t.russian} — это ${q.correct}. ${step.meaning}`;
    }
  }
  if (q.mode === "feel_to_chord" || q.mode === "chord_to_feel" || q.mode === "ear_to_feel") {
    const ch = q.correct && q.correct.startsWith && q.correct.startsWith("«") ? null : q.correct;
    const chord = ch || q.audibleChord || null;
    const feel = chord && feelings[q.tonalityId] ? feelings[q.tonalityId][chord] : null;
    if (chord && feel) {
      const step = stepForChordIn(q.tonalityId, chord);
      return `${chord} (${step ? step.roman : "?"}, ${step ? step.name : ""}) — «${feel}». ${step ? step.meaning : ""}`;
    }
  }
  if (q.mode === "next_chord") {
    return `Эта прогрессия чаще всего ведёт к ${q.correct}. Логика — по ступеням и тяготениям.`;
  }
  return "Запомни: чем чаще ошибаешься на одном — тем чаще оно будет возвращаться.";
}

export function motivation(questionsLog) {
  const total = questionsLog.length;
  if (!total) return "";
  const correct = questionsLog.filter((q) => q.isCorrect).length;
  const acc = correct / total;
  if (acc >= 0.9) return "Сильно! Завтра можно поднять сложность.";
  if (acc >= 0.7) return "Хороший прогресс. Слабые места тренажёр уже отметил.";
  if (acc >= 0.5) return "Сегодня шероховато — но именно так формируется память.";
  return "Не страшно. Завтра те же вопросы вернутся — и поймаются.";
}
