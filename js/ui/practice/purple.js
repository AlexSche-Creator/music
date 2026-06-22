/* Purple Mode — 4-stage pipeline question generator.
 *
 * One question = one chord drawn from a tonality. The user answers a *chain*
 * of facts about it:
 *    1. Интервал между тоникой и корнем аккорда (полутонов)
 *    2. Ступень (1..7, римская)
 *    3. Конкретный аккорд (символ)
 *    4. Тип аккорда (maj / min / dim)
 *
 * If `adaptiveStepDown` is on we drop the hardest stage after 3 wrong answers.
 * The whole pipeline is configured in Settings → Purple Mode.
 */

import { kvGet, kvSet } from "../../core/store.js";
import { mergeSettings } from "../../core/settings-schema.js";
import { unlock, playChord } from "../../core/audio.js";
import { recordSession } from "../../core/habits.js";
import { TONALITIES, chordForStep } from "../../data/tonalities.js";
import { romanFor, buildOptions } from "../../core/theory.js";
import { el, card, btn, chip, toast, progressBar } from "../components.js";

const ALL_STAGES = ["interval", "degree", "chord", "chordType"];
const STAGE_LABELS = {
  interval: "Интервал (полутонов)",
  degree:   "Ступень",
  chord:    "Аккорд",
  chordType:"Тип аккорда",
};
const TYPE_LABELS = { maj: "major", min: "minor", dim: "dim", aug: "aug" };

export async function renderPurple({ container }) {
  const settings = mergeSettings(await kvGet("settings"));
  const cfg = settings.purpleMode || {};
  let pipeline = Array.isArray(cfg.pipeline) && cfg.pipeline.length
    ? cfg.pipeline.filter((s) => ALL_STAGES.includes(s))
    : ALL_STAGES.slice();
  const adaptive = cfg.adaptiveStepDown !== false;

  let tonalityId = "Am";
  let stageIdx = 0;
  let answered = []; // {stage, correct} for the current chord
  let correctCount = 0;
  let totalCount = 0;
  let recentWrong = 0;
  let currentQ = null;
  let sessionStart = Date.now();

  container.appendChild(el("h1", { text: "🟣 Purple Mode" }));
  container.appendChild(el("p", { text: "Глубокий разбор каждого аккорда: интервал → ступень → аккорд → тип." }));

  const tonalityRow = el("div", { class: "row", style: { flexWrap: "wrap", gap: "8px" } });
  const pipelineRow = el("div", { class: "row", style: { flexWrap: "wrap", gap: "6px" } });
  const prompt   = el("div", { class: "prompt" });
  const optionsEl = el("div", { class: "options" });
  const feedback = el("div", null);
  const stats    = el("div", { class: "row between", style: { fontSize: "13px" } });

  container.appendChild(card(el("div", { class: "col" },
    el("h3", { text: "Тональность" }), tonalityRow,
    el("h3", { text: "Pipeline" }), pipelineRow,
  ), { practiceAccent: true }));
  container.appendChild(prompt);
  container.appendChild(optionsEl);
  container.appendChild(feedback);
  container.appendChild(stats);
  container.appendChild(el("div", { class: "btn-row" },
    btn("Записать сессию", saveSession, { practiceAccent: true }),
  ));

  function renderTonalityRow() {
    tonalityRow.innerHTML = "";
    for (const id of ["C", "Am"]) {
      const b = document.createElement("button");
      b.className = `btn small${tonalityId === id ? " primary practice" : ""}`;
      b.type = "button"; b.textContent = TONALITIES[id].russian;
      b.addEventListener("click", () => { tonalityId = id; renderTonalityRow(); nextQuestion(); });
      tonalityRow.appendChild(b);
    }
  }
  function renderPipelineRow() {
    pipelineRow.innerHTML = "";
    for (const s of ALL_STAGES) {
      const active = pipeline.includes(s);
      const b = document.createElement("button");
      b.className = `chip${active ? " accent" : ""}`;
      b.style.cursor = "pointer";
      if (active) { b.style.color = "var(--accent-practice)"; b.style.borderColor = "var(--accent-practice)"; b.style.background = "var(--accent-practice-soft)"; }
      b.textContent = STAGE_LABELS[s];
      b.addEventListener("click", () => {
        const i = pipeline.indexOf(s);
        if (i >= 0) { if (pipeline.length > 1) pipeline.splice(i, 1); }
        else pipeline.push(s);
        pipeline = ALL_STAGES.filter((x) => pipeline.includes(x));
        renderPipelineRow(); nextQuestion();
      });
      pipelineRow.appendChild(b);
    }
  }

  function nextQuestion() {
    answered = [];
    stageIdx = 0;
    const ton = TONALITIES[tonalityId];
    const degree = 1 + Math.floor(Math.random() * 7);
    const step = ton.steps[degree - 1];
    const chord = chordForStep(tonalityId, degree);
    currentQ = { tonalityId, degree, step, chord };
    renderStage();
  }

  function renderStage() {
    if (!currentQ) return;
    if (stageIdx >= pipeline.length) {
      // chain complete
      correctCount += answered.filter((a) => a.correct).length === answered.length ? 1 : 0;
      totalCount += 1;
      renderComplete();
      return;
    }
    const stage = pipeline[stageIdx];
    feedback.innerHTML = "";
    prompt.innerHTML = "";
    prompt.appendChild(el("div", { class: "label", text: `${stageIdx + 1}/${pipeline.length} · ${STAGE_LABELS[stage]}` }));
    if (stage === "interval") {
      prompt.appendChild(el("div", { class: "big accent", text: currentQ.chord }));
      prompt.appendChild(el("div", { class: "sub", text: `Тональность ${TONALITIES[tonalityId].russian}. Сколько полутонов от тоники до корня?` }));
    } else if (stage === "degree") {
      prompt.appendChild(el("div", { class: "big accent", text: currentQ.chord }));
      prompt.appendChild(el("div", { class: "sub", text: "Какая это ступень?" }));
    } else if (stage === "chord") {
      prompt.appendChild(el("div", { class: "big accent", text: romanFor(currentQ.degree, currentQ.step.chordType) }));
      prompt.appendChild(el("div", { class: "sub", text: "Какой аккорд?" }));
    } else if (stage === "chordType") {
      prompt.appendChild(el("div", { class: "big accent", text: currentQ.chord }));
      prompt.appendChild(el("div", { class: "sub", text: "Какого типа этот аккорд?" }));
    }
    renderOptions(stage);
    renderStats();
  }
  function renderOptions(stage) {
    optionsEl.innerHTML = "";
    let correct, pool;
    if (stage === "interval") {
      correct = String(currentQ.step.intervalSemitones);
      pool = ["0","2","3","4","5","6","7","8","9","10","11"];
    } else if (stage === "degree") {
      correct = romanFor(currentQ.degree, currentQ.step.chordType);
      pool = TONALITIES[tonalityId].steps.map((s) => romanFor(s.degree, s.chordType));
    } else if (stage === "chord") {
      correct = currentQ.chord;
      pool = TONALITIES[tonalityId].chordsByTonality[tonalityId];
    } else {
      correct = TYPE_LABELS[currentQ.step.chordType] || currentQ.step.chordType;
      pool = ["major", "minor", "dim"];
    }
    const opts = buildOptions(pool, correct, Math.min(4, pool.length));
    for (const opt of opts) {
      const b = el("button", { class: "opt", type: "button" }, opt);
      b.addEventListener("click", () => handleAnswer(stage, opt, correct, b));
      optionsEl.appendChild(b);
    }
  }
  async function handleAnswer(stage, given, correct, btnEl) {
    const ok = String(given) === String(correct);
    btnEl.classList.add(ok ? "correct" : "wrong");
    answered.push({ stage, correct: ok });
    if (!ok) {
      recentWrong += 1;
      for (const b of optionsEl.querySelectorAll(".opt")) if (b.textContent === String(correct)) b.classList.add("correct");
      if (adaptive && recentWrong >= 3 && pipeline.length > 1) {
        const dropped = pipeline.pop();
        toast(`Pipeline упрощён: убран этап «${STAGE_LABELS[dropped]}»`);
        recentWrong = 0;
      }
    } else if (recentWrong > 0) {
      recentWrong = Math.max(0, recentWrong - 1);
    }
    if (stage === "chord") {
      await unlock();
      playChord(currentQ.chord, { duration: 1.2, octave: 4 }).catch(() => {});
    }
    setTimeout(() => { stageIdx += 1; renderStage(); }, ok ? 500 : 1100);
  }

  function renderComplete() {
    const allOk = answered.every((a) => a.correct);
    feedback.innerHTML = "";
    feedback.appendChild(el("div", { class: `feedback ${allOk ? "ok" : "bad"}` },
      el("div", { class: "title", text: allOk ? "Цепочка пройдена" : "Не до конца" }),
      el("div", { class: "desc", text: `Правильных: ${answered.filter((a) => a.correct).length}/${answered.length}` }),
    ));
    prompt.innerHTML = "";
    optionsEl.innerHTML = "";
    optionsEl.appendChild(btn("Следующий аккорд", nextQuestion, { primary: true, practiceAccent: true, full: true }));
    renderStats();
  }
  function renderStats() {
    stats.innerHTML = "";
    stats.appendChild(el("div", null, `Полные цепочки: ${correctCount}/${totalCount}`));
    stats.appendChild(el("div", null, `Pipeline: ${pipeline.length} этапов`));
  }
  async function saveSession() {
    const dur = Math.max(60, Math.round((Date.now() - sessionStart) / 1000));
    const logs = (await kvGet("habit_logs")) || {};
    // Purple Mode is essentially deep theory practice — log under theory + a
    // special note via duration accumulation. We map it to "theory" so it
    // contributes to Practice Score and the existing streak.
    recordSession(logs, { module: "theory", durationSec: dur });
    await kvSet("habit_logs", logs);
    toast("Purple-сессия записана как Теория");
    sessionStart = Date.now();
  }

  renderTonalityRow();
  renderPipelineRow();
  nextQuestion();

  return null;
}
