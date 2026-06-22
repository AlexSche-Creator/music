/* Training screen — UI shell around the pure question factory.
 *
 * Per-session state lives in this closure:
 *   - learningState  (concept-level adaptive engine, persisted in kv)
 *   - weights        (legacy item-key scheduler, kept so the Dashboard's
 *                     "За неделю стало лучше" keeps working until Phase 1
 *                     migrates it)
 *   - recentConcepts (cooldown buffer for session-planner)
 *   - recentResults  (fatigue buffer for session-planner)
 *
 * Question objects come back frozen from question.js; this file never mutates
 * them. Audio replay is gated by `q !== currentQ` so a stale setTimeout can
 * never play the previous chord (§13).
 */

import { TONALITIES } from "../data/tonalities.js";
import { effectiveFeelings } from "../data/feelings.js";
import { unlock, playChord, playArpeggio, playSequence, setTimbre, stopAll } from "../core/audio.js";
import { kvGet, kvSet, logAnswer, startSession, finishSession } from "../core/store.js";
import { recordOutcome, emptyWeights } from "../core/scheduler.js";
import { recordAnswer, emptyLearningState } from "../core/learning.js";
import { generateQuestion, modeLabel, explain, motivation, MIX_POOL } from "../core/question.js";
import { el, btn, card, chip, progressBar, fmtPct } from "./components.js";

const RECENT_CONCEPTS_CAP = 6;
const RECENT_RESULTS_CAP  = 8;

export async function renderTraining({ container, params }) {
  const settings = (await kvGet("settings")) || {};
  setTimbre(settings.timbre || "piano");

  const requestedMode = params.mode || "mix";
  const tonalityParam = params.tonality || "Am";
  const durSec = parseInt(params.dur || "0", 10) || 0;
  const examMode = requestedMode === "exam";
  const ladder = requestedMode === "ladder";
  const compare = requestedMode === "compare";

  if (ladder) return renderLadder(container, tonalityParam);
  if (compare) return renderCompare(container);

  const enabled = (settings.enabledModes && settings.enabledModes.length)
    ? settings.enabledModes
    : MIX_POOL.slice();
  const modeQueue = requestedMode === "mix"
    ? interleave(enabled.filter((m) => MIX_POOL.includes(m)))
    : null;

  const weights = (await kvGet("weights")) || emptyWeights();
  const learningState = (await kvGet("learning_state")) || emptyLearningState();
  const feelings = effectiveFeelings(await kvGet("feelings_overrides"));
  const recentConcepts = [];
  const recentResults  = [];

  let qIndex = 0;
  let correctCount = 0;
  const questionsLog = [];
  const startedAt = Date.now();
  const endAt = durSec ? startedAt + durSec * 1000 : null;
  const targetCount = examMode ? 20 : (durSec ? null : 10);
  const sessionId = await startSession({
    mode: requestedMode, tonalityId: tonalityParam, durationSec: durSec,
  });

  const root = el("div", { class: "col" });
  container.appendChild(root);
  const headerEl   = el("div", { class: "row between" });
  const promptEl   = el("div", { class: "prompt" });
  const playEl     = el("div", { class: "row", style: { justifyContent: "center", marginTop: "4px" } });
  const optsEl     = el("div", { class: "options" });
  const feedbackEl = el("div", null);
  const progressEl = el("div", { class: "col", style: { gap: "6px" } });

  root.appendChild(headerEl);
  root.appendChild(promptEl);
  root.appendChild(playEl);
  root.appendChild(optsEl);
  root.appendChild(feedbackEl);
  root.appendChild(progressEl);

  let questionStart = 0;
  let usedReplay = false;
  let currentQ = null;

  function buildNextQuestion() {
    let mode = requestedMode;
    if (requestedMode === "mix") mode = modeQueue[qIndex % modeQueue.length];
    const tid = tonalityParam === "both"
      ? (qIndex % 2 === 0 ? "C" : "Am")
      : tonalityParam;
    return generateQuestion({
      mode, tonalityId: tid, learningState, feelings,
      recentConcepts, recentResults,
    });
  }

  function showFeedback(isCorrect, q) {
    const f = el("div", { class: `feedback ${isCorrect ? "ok" : "bad"}` },
      el("div", { class: "title", text: isCorrect ? "Верно" : "Не точно" }),
      el("div", { class: "desc", text: explain(q, feelings) }),
    );
    feedbackEl.innerHTML = "";
    feedbackEl.appendChild(f);
    feedbackEl.appendChild(el("div", { class: "row", style: { justifyContent: "center", marginTop: "10px" } },
      btn("Дальше", advance, { primary: true }),
    ));
  }

  function advance() {
    feedbackEl.innerHTML = "";
    qIndex += 1;
    if (shouldEnd()) return endSession();
    nextQuestion();
  }

  function shouldEnd() {
    if (endAt && Date.now() >= endAt) return true;
    if (targetCount && qIndex >= targetCount) return true;
    return false;
  }

  async function endSession() {
    stopAll();
    const totalCorrect = questionsLog.filter((q) => q.isCorrect).length;
    const totalWrong  = questionsLog.length - totalCorrect;
    const acc = questionsLog.length ? totalCorrect / questionsLog.length : 0;
    await kvSet("weights", weights);
    await kvSet("learning_state", learningState);
    await kvSet("last_session_ts", Date.now());
    await finishSession(sessionId, {
      totalCorrect, totalWrong, accuracy: acc, questionCount: questionsLog.length,
    });

    container.innerHTML = "";
    container.appendChild(card(el("div", { class: "col", style: { textAlign: "center" } },
      el("h1", { text: questionsLog.length ? "Сессия завершена" : "Ничего страшного" }),
      el("div", { class: "stat", style: { marginTop: "8px" } },
        el("div", { class: "v", text: fmtPct(acc) }),
        el("div", { class: "k", text: "точность" }),
      ),
      el("p", { text: questionsLog.length
        ? motivation(questionsLog)
        : "Можно попробовать ещё раз — за пару минут хорошо запоминается." }),
      el("div", { class: "btn-row", style: { justifyContent: "center" } },
        btn("Ещё одна", () => location.hash = "#/train", { primary: true }),
        btn("На главную", () => location.hash = "#/dashboard"),
      ),
    )));
  }

  function nextQuestion() {
    optsEl.innerHTML = "";
    playEl.innerHTML = "";
    feedbackEl.innerHTML = "";
    usedReplay = false;
    const q = buildNextQuestion();
    if (!q) { endSession(); return; }
    currentQ = q;
    recentConcepts.push(q.conceptId);
    if (recentConcepts.length > RECENT_CONCEPTS_CAP) recentConcepts.shift();
    questionStart = Date.now();
    renderQuestion(q);
    if (q.autoplay) {
      // small delay so the audio context settles after navigation
      setTimeout(() => { if (q === currentQ) playPromptAudio(q).catch(() => {}); }, 80);
    }
  }

  function renderQuestion(q) {
    headerEl.innerHTML = "";
    headerEl.appendChild(chip(`#${qIndex + 1}${targetCount ? "/" + targetCount : ""}`));
    headerEl.appendChild(chip((TONALITIES[q.tonalityId] && TONALITIES[q.tonalityId].russian) || q.tonalityId, true));
    headerEl.appendChild(chip(modeLabel(q.mode)));

    promptEl.innerHTML = "";
    promptEl.appendChild(el("div", { class: "label", text: q.prompt.label }));
    if (q.prompt.big) promptEl.appendChild(el("div", { class: `big${q.prompt.bigAccent ? " accent" : ""}`, text: q.prompt.big }));
    if (q.prompt.sub) promptEl.appendChild(el("div", { class: "sub", text: q.prompt.sub }));

    if (q.audible) {
      playEl.appendChild(el("button", {
        class: "play", "aria-label": "Слушать",
        onClick: async () => { usedReplay = true; await playPromptAudio(q); },
      }, "▶"));
    }

    optsEl.className = "options" + (q.options.length === 3 ? " col-3" : q.options.length === 1 ? " col-1" : "");
    q.options.forEach((opt) => {
      const o = el("button", { class: "opt", text: opt, onClick: () => answer(opt, q, o) });
      optsEl.appendChild(o);
    });

    progressEl.innerHTML = "";
    const pct = targetCount
      ? Math.min(1, qIndex / targetCount)
      : (endAt ? Math.min(1, (Date.now() - startedAt) / (endAt - startedAt)) : 0);
    progressEl.appendChild(progressBar(pct));
    progressEl.appendChild(el("div", { class: "row between", style: { fontSize: "12px", color: "var(--fg-faint)" } },
      el("span", { text: targetCount ? `Вопрос ${qIndex + 1} из ${targetCount}` : "Сессия идёт" }),
      el("span", { text: `Правильных: ${correctCount}` }),
    ));
  }

  function answer(choice, q, optBtn) {
    if (currentQ !== q || optBtn.classList.contains("correct") || optBtn.classList.contains("wrong")) return;
    const reactionMs = Date.now() - questionStart;
    const isCorrect = choice === q.correct;
    if (isCorrect) correctCount += 1;
    [...optsEl.children].forEach((b) => {
      if (b.textContent === q.correct) b.classList.add("correct");
      else if (b === optBtn) b.classList.add("wrong");
      else b.classList.add("dim");
    });
    // Adaptive engine (concept-level).
    recordAnswer(learningState, { conceptId: q.conceptId, isCorrect, reactionMs });
    // Legacy weights so existing dashboard cards keep working until Phase 1 migrates them.
    recordOutcome(weights, { mode: q.mode, tonalityId: q.tonalityId, itemKey: q.itemKey, isCorrect });
    recentResults.push({ isCorrect, conceptId: q.conceptId });
    if (recentResults.length > RECENT_RESULTS_CAP) recentResults.shift();
    logAnswer({
      sessionId,
      mode: q.mode,
      tonalityId: q.tonalityId,
      conceptId: q.conceptId,
      itemKey: q.itemKey,
      prompt: q.prompt.big || q.prompt.sub || "",
      correctAnswer: q.correct,
      userAnswer: choice,
      isCorrect,
      reactionMs,
      usedReplay,
      usedHint: false,
    });
    questionsLog.push({ isCorrect, q });
    showFeedback(isCorrect, q);
  }

  async function playPromptAudio(q) {
    if (q !== currentQ) return;            // anti-race before unlock
    await unlock();
    if (q !== currentQ) return;            // anti-race after async hop
    if (q.audible === "chord")    return playChord(q.audibleChord, { duration: 1.6 });
    if (q.audible === "arpeggio") return playArpeggio(q.audibleChord, { duration: 1.6 });
    if (q.audible === "sequence") return playSequence(q.audibleSequence, { stepSec: 0.8, durationSec: 0.75 });
  }

  let tickId = null;
  if (endAt) {
    tickId = setInterval(() => {
      if (shouldEnd()) { clearInterval(tickId); endSession(); return; }
      const bar = progressEl.querySelector(".bar");
      if (bar) {
        const pct = Math.min(1, (Date.now() - startedAt) / (endAt - startedAt));
        bar.style.width = `${Math.round(pct * 100)}%`;
      }
    }, 1000);
  }

  const cleanup = () => { if (tickId) clearInterval(tickId); stopAll(); };

  nextQuestion();
  return cleanup;
}

/* ---------- Helpers ---------- */

function interleave(modes) {
  if (!modes.length) return MIX_POOL.slice();
  return modes;
}

/* ---------- Ladder ("все ступени подряд") ---------- */
async function renderLadder(container, tonalityParam) {
  const id = tonalityParam === "C" ? "C" : "Am";
  const t = TONALITIES[id];
  const root = el("div", { class: "col" },
    el("h1", { text: `Все ступени · ${t.russian}` }),
    el("p", { text: "Прогон по всем ступеням сверху вниз. Можно слушать каждую." }),
  );
  const list = el("div", { class: "col" });
  t.steps.forEach((s, i) => {
    const chord = t.chordsByTonality[id][i];
    list.appendChild(el("div", { class: "step-row" },
      el("div", { class: "deg", text: s.roman }),
      el("div", null,
        el("div", { class: "chord", text: chord }),
        el("div", { class: "meta", text: s.name + " · " + s.meaning }),
      ),
      el("button", { class: "play small", text: "▶", onClick: async () => { await unlock(); playChord(chord, { duration: 1.4 }); } }),
    ));
  });
  root.appendChild(list);
  root.appendChild(el("div", { class: "btn-row" },
    btn("Прослушать все по очереди", async () => {
      await unlock();
      const seq = t.chordsByTonality[id];
      await playSequence(seq, { stepSec: 0.95, durationSec: 0.85 });
    }, { primary: true }),
    btn("Арпеджио", async () => {
      await unlock();
      const seq = t.chordsByTonality[id];
      for (const c of seq) await playArpeggio(c, { duration: 1.2 });
    }, { ghost: true }),
  ));
  container.appendChild(root);
  return () => stopAll();
}

/* ---------- Compare tonalities ---------- */
async function renderCompare(container) {
  const c = TONALITIES.C, a = TONALITIES.Am;
  const root = el("div", { class: "col" },
    el("h1", { text: "C major ↔ A minor" }),
    el("p", { text: "Те же 7 нот, два центра тяжести, два настроения." }),
  );
  const table = el("div", { class: "col" });
  for (let i = 0; i < 7; i++) {
    const cs = c.steps[i], as = a.steps[i];
    const cc = c.chordsByTonality.C[i], ac = a.chordsByTonality.Am[i];
    table.appendChild(el("div", { class: "step-row", style: { gridTemplateColumns: "1fr 1fr" } },
      el("div", null,
        el("div", { class: "chord", text: `${cs.roman} · ${cc}` }),
        el("div", { class: "meta", text: cs.meaning }),
      ),
      el("div", null,
        el("div", { class: "chord", text: `${as.roman} · ${ac}` }),
        el("div", { class: "meta", text: as.meaning }),
      ),
    ));
  }
  root.appendChild(table);
  root.appendChild(el("p", { class: "muted", style: { marginTop: "8px" },
    text: "Одни и те же ноты звучат по-разному — потому что слух «выбирает» опорную точку." }));
  container.appendChild(root);
  return null;
}
