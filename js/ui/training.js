/* Training screen — drives every mode through one state machine.
 *
 * A `question` has the shape:
 *   { mode, tonalityId, prompt:{...}, options:[...], correct, itemKey, autoplay }
 *
 * The screen renders a prompt, options, optional replay button. After an
 * answer it shows feedback and (briefly) explains the musical "why".
 */

import { TONALITIES, ALL_CHORDS } from "../data/tonalities.js";
import { PROGRESSIONS } from "../data/progressions.js";
import { effectiveFeelings, allFeelings } from "../data/feelings.js";
import { buildOptions, chordAtDegree, stepForChordIn, romanFor, parseChord, suggestNextChord } from "../core/theory.js";
import { ensureCtx, unlock, playChord, playArpeggio, playSequence, setTimbre, stopAll } from "../core/audio.js";
import { kvGet, kvSet, logAnswer, startSession, finishSession } from "../core/store.js";
import { recordOutcome, pickNext, emptyWeights } from "../core/scheduler.js";
import { el, btn, card, chip, progressBar, fmtPct, toast } from "./components.js";

const REAL_MODES = new Set([
  "degree_to_chord", "chord_to_degree",
  "feel_to_chord",   "chord_to_feel",
  "ear_to_step",     "ear_to_feel",
  "next_chord",      "flashcards",
  "exam", "ladder", "compare"
]);

const MIX_POOL = ["degree_to_chord", "chord_to_degree", "feel_to_chord",
                  "chord_to_feel", "ear_to_step", "ear_to_feel", "next_chord"];

export async function renderTraining({ container, params }) {
  const settings = (await kvGet("settings")) || {};
  setTimbre(settings.timbre || "piano");

  const requestedMode = params.mode || "mix";
  const tonalityParam = params.tonality || "Am";
  const durSec = parseInt(params.dur || "0", 10) || 0;
  const examMode = requestedMode === "exam";
  const ladder = requestedMode === "ladder";
  const compare = requestedMode === "compare";

  // Ladder / compare are presentation-only screens that don't need scoring.
  if (ladder) return renderLadder(container, tonalityParam);
  if (compare) return renderCompare(container);

  const enabled = (settings.enabledModes && settings.enabledModes.length)
    ? settings.enabledModes
    : MIX_POOL.slice();
  const modeQueue = requestedMode === "mix"
    ? interleave(enabled.filter((m) => MIX_POOL.includes(m)))
    : null;

  const weights = (await kvGet("weights")) || emptyWeights();
  const feelings = effectiveFeelings(await kvGet("feelings_overrides"));

  let qIndex = 0;
  let correctCount = 0;
  let questionsLog = [];
  const startedAt = Date.now();
  const endAt = durSec ? startedAt + durSec * 1000 : null;
  const targetCount = examMode ? 20 : (durSec ? null : 10);
  const sessionId = await startSession({
    mode: requestedMode, tonalityId: tonalityParam, durationSec: durSec
  });
  const recentKeys = [];

  const root = el("div", { class: "col" });
  container.appendChild(root);
  const headerEl = el("div", { class: "row between" });
  const promptEl = el("div", { class: "prompt" });
  const playEl = el("div", { class: "row", style: { justifyContent: "center", marginTop: "4px" } });
  const optsEl = el("div", { class: "options" });
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
    if (requestedMode === "mix") {
      mode = modeQueue[qIndex % modeQueue.length];
    }
    const tid = tonalityParam === "both"
      ? (qIndex % 2 === 0 ? "C" : "Am")
      : tonalityParam;
    return generateQuestion(mode, tid, weights, recentKeys, feelings);
  }

  function showFeedback(isCorrect, q) {
    const f = el("div", { class: `feedback ${isCorrect ? "ok" : "bad"}` },
      el("div", { class: "title", text: isCorrect ? "Верно" : "Не точно" }),
      el("div", { class: "desc", text: explain(q, feelings) })
    );
    feedbackEl.innerHTML = "";
    feedbackEl.appendChild(f);
    feedbackEl.appendChild(el("div", { class: "row", style: { justifyContent: "center", marginTop: "10px" } },
      btn("Дальше", advance, { primary: true })
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
    await kvSet("last_session_ts", Date.now());
    await finishSession(sessionId, {
      totalCorrect, totalWrong, accuracy: acc, questionCount: questionsLog.length
    });

    container.innerHTML = "";
    container.appendChild(card(el("div", { class: "col", style: { textAlign: "center" } },
      el("h1", { text: questionsLog.length ? "Сессия завершена" : "Ничего страшного" }),
      el("div", { class: "stat", style: { marginTop: "8px" } },
        el("div", { class: "v", text: fmtPct(acc) }),
        el("div", { class: "k", text: "точность" })
      ),
      el("p", { text: questionsLog.length ? motivation(questionsLog) : "Можно попробовать ещё раз — за пару минут хорошо запоминается." }),
      el("div", { class: "btn-row", style: { justifyContent: "center" } },
        btn("Ещё одна", () => location.hash = "#/train", { primary: true }),
        btn("На главную", () => location.hash = "#/dashboard")
      )
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
    recentKeys.push(q.itemKey);
    if (recentKeys.length > 5) recentKeys.shift();
    questionStart = Date.now();
    renderQuestion(q);
    if (q.autoplay) {
      // small delay so audio context can fully unlock
      setTimeout(() => playPromptAudio(q).catch(() => {}), 80);
    }
  }

  function renderQuestion(q) {
    // Header: counter + tonality
    headerEl.innerHTML = "";
    headerEl.appendChild(chip(`#${qIndex + 1}${targetCount ? "/" + targetCount : ""}`));
    headerEl.appendChild(chip((TONALITIES[q.tonalityId]?.russian) || q.tonalityId, true));
    headerEl.appendChild(chip(modeLabel(q.mode)));

    // Prompt
    promptEl.innerHTML = "";
    promptEl.appendChild(el("div", { class: "label", text: q.prompt.label }));
    if (q.prompt.big) promptEl.appendChild(el("div", { class: `big${q.prompt.bigAccent ? " accent" : ""}`, text: q.prompt.big }));
    if (q.prompt.sub) promptEl.appendChild(el("div", { class: "sub", text: q.prompt.sub }));

    // Play / replay
    if (q.audible) {
      playEl.appendChild(el("button", {
        class: "play", "aria-label": "Слушать",
        onClick: async () => { usedReplay = true; await playPromptAudio(q); }
      }, "▶"));
    }

    // Options
    optsEl.className = "options" + (q.options.length === 3 ? " col-3" : q.options.length === 1 ? " col-1" : "");
    q.options.forEach((opt) => {
      const o = el("button", { class: "opt", text: opt, onClick: () => answer(opt, q, o) });
      optsEl.appendChild(o);
    });

    // Progress
    progressEl.innerHTML = "";
    const pct = targetCount ? Math.min(1, qIndex / targetCount) : (endAt ? Math.min(1, (Date.now() - startedAt) / (endAt - startedAt)) : 0);
    progressEl.appendChild(progressBar(pct));
    progressEl.appendChild(el("div", { class: "row between", style: { fontSize: "12px", color: "var(--fg-faint)" } },
      el("span", { text: targetCount ? `Вопрос ${qIndex + 1} из ${targetCount}` : "Сессия идёт" }),
      el("span", { text: `Правильных: ${correctCount}` })
    ));
  }

  function answer(choice, q, optBtn) {
    if (currentQ !== q || optBtn.classList.contains("correct") || optBtn.classList.contains("wrong")) return;
    const reactionMs = Date.now() - questionStart;
    const isCorrect = choice === q.correct;
    if (isCorrect) correctCount += 1;
    // mark buttons
    [...optsEl.children].forEach((b) => {
      if (b.textContent === q.correct) b.classList.add("correct");
      else if (b === optBtn) b.classList.add("wrong");
      else b.classList.add("dim");
    });
    // log
    recordOutcome(weights, { mode: q.mode, tonalityId: q.tonalityId, itemKey: q.itemKey, isCorrect });
    logAnswer({
      sessionId,
      mode: q.mode,
      tonalityId: q.tonalityId,
      itemKey: q.itemKey,
      prompt: q.prompt.big || q.prompt.sub || "",
      correctAnswer: q.correct,
      userAnswer: choice,
      isCorrect,
      reactionMs,
      usedReplay,
      usedHint: false
    });
    questionsLog.push({ isCorrect, q });
    showFeedback(isCorrect, q);
  }

  async function playPromptAudio(q) {
    await unlock();
    if (q.audible === "chord")   return playChord(q.audibleChord, { duration: 1.6 });
    if (q.audible === "arpeggio") return playArpeggio(q.audibleChord, { duration: 1.6 });
    if (q.audible === "sequence") return playSequence(q.audibleSequence, { stepSec: 0.8, durationSec: 0.75 });
  }

  // tick for time-based progress
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

  // Pause audio on cleanup
  const cleanup = () => { if (tickId) clearInterval(tickId); stopAll(); };

  nextQuestion();
  return cleanup;
}

/* ---------- Question generators ---------- */

function generateQuestion(mode, tonalityId, weights, recentKeys, feelings) {
  const ton = TONALITIES[tonalityId];
  if (!ton) return null;

  if (mode === "degree_to_chord") {
    const candidates = ton.steps.map((s) => `step:${tonalityId}:${s.degree}`);
    const itemKey = pickNext(weights, candidates, recentKeys, mode, tonalityId);
    const degree = parseInt(itemKey.split(":")[2], 10);
    const step = ton.steps[degree - 1];
    const correct = chordAtDegree(tonalityId, degree);
    const options = buildOptions(ALL_CHORDS, correct, 4);
    return {
      mode, tonalityId, itemKey, options, correct,
      prompt: {
        label: "Ступень",
        big: step.roman,
        bigAccent: true,
        sub: `${step.name} · ${step.meaning}`
      },
      audible: false
    };
  }

  if (mode === "chord_to_degree") {
    const candidates = ton.chordsByTonality[tonalityId].map((c) => `chord:${tonalityId}:${c}`);
    const itemKey = pickNext(weights, candidates, recentKeys, mode, tonalityId);
    const chord = itemKey.split(":")[2];
    const step = stepForChordIn(tonalityId, chord);
    const correct = step.roman;
    const pool = ton.steps.map((s) => s.roman);
    const options = buildOptions(pool, correct, 4);
    return {
      mode, tonalityId, itemKey, options, correct,
      prompt: { label: "Аккорд", big: chord, sub: "В какой это ступени?" },
      audible: false
    };
  }

  if (mode === "feel_to_chord") {
    const candidates = ton.chordsByTonality[tonalityId].map((c) => `feel:${tonalityId}:${c}`);
    const itemKey = pickNext(weights, candidates, recentKeys, mode, tonalityId);
    const chord = itemKey.split(":")[2];
    const feel = feelings[tonalityId][chord] || chord;
    const options = buildOptions(ton.chordsByTonality[tonalityId], chord, 4);
    return {
      mode, tonalityId, itemKey, options, correct: chord,
      prompt: { label: "Чувство", big: `«${feel}»`, sub: "Какой это аккорд?" },
      audible: false
    };
  }

  if (mode === "chord_to_feel") {
    const candidates = ton.chordsByTonality[tonalityId].map((c) => `feel:${tonalityId}:${c}`);
    const itemKey = pickNext(weights, candidates, recentKeys, mode, tonalityId);
    const chord = itemKey.split(":")[2];
    const correctFeel = feelings[tonalityId][chord];
    const feelPool = allFeelings(feelings);
    const options = buildOptions(feelPool, correctFeel, 4);
    return {
      mode, tonalityId, itemKey, options, correct: correctFeel,
      prompt: { label: "Аккорд", big: chord, sub: "Какое чувство?" },
      audible: false
    };
  }

  if (mode === "ear_to_step") {
    const candidates = ton.steps.map((s) => `step:${tonalityId}:${s.degree}`);
    const itemKey = pickNext(weights, candidates, recentKeys, mode, tonalityId);
    const degree = parseInt(itemKey.split(":")[2], 10);
    const chord = chordAtDegree(tonalityId, degree);
    const step = ton.steps[degree - 1];
    const pool = ton.steps.map((s) => s.roman);
    const options = buildOptions(pool, step.roman, 4);
    return {
      mode, tonalityId, itemKey, options, correct: step.roman,
      prompt: { label: "Слушай и угадай ступень", big: TONALITIES[tonalityId].russian, sub: "Жми ▶ ещё раз, если нужно." },
      audible: "chord", audibleChord: chord, autoplay: true
    };
  }

  if (mode === "ear_to_feel") {
    const candidates = ton.chordsByTonality[tonalityId].map((c) => `feel:${tonalityId}:${c}`);
    const itemKey = pickNext(weights, candidates, recentKeys, mode, tonalityId);
    const chord = itemKey.split(":")[2];
    const correct = feelings[tonalityId][chord];
    const options = buildOptions(allFeelings(feelings), correct, 4);
    return {
      mode, tonalityId, itemKey, options, correct,
      prompt: { label: "Слушай и выбери чувство", big: TONALITIES[tonalityId].russian },
      audible: "arpeggio", audibleChord: chord, autoplay: true
    };
  }

  if (mode === "next_chord") {
    // Random progression in this tonality, cut at length-1.
    const inMode = PROGRESSIONS.filter((p) => p.chordsByTonality[tonalityId]);
    const prog = inMode[Math.floor(Math.random() * inMode.length)];
    const seq = prog.chordsByTonality[tonalityId];
    const cut = Math.max(1, seq.length - 1);
    const played = seq.slice(0, cut);
    const correct = seq[cut];
    const options = buildOptions(ALL_CHORDS, correct, 4);
    const itemKey = `seq:${prog.id}`;
    return {
      mode, tonalityId, itemKey, options, correct,
      prompt: { label: "Угадай следующий", big: played.join(" – ") + " – ?" },
      audible: "sequence", audibleSequence: played, autoplay: true
    };
  }

  if (mode === "flashcards") {
    // Reuse degree_to_chord mechanic but with a free-form "show answer" option.
    const candidates = ton.steps.map((s) => `step:${tonalityId}:${s.degree}`);
    const itemKey = pickNext(weights, candidates, recentKeys, mode, tonalityId);
    const degree = parseInt(itemKey.split(":")[2], 10);
    const step = ton.steps[degree - 1];
    const correct = chordAtDegree(tonalityId, degree);
    return {
      mode, tonalityId, itemKey,
      options: ["Я вспомнил", "Не вспомнил"],
      correct: "Я вспомнил",
      prompt: { label: "Карточка", big: step.roman, bigAccent: true, sub: `Аккорд → ${correct}` },
      audible: "chord", audibleChord: correct
    };
  }

  if (mode === "exam") {
    // Reuse a random "real" mode each round; no replay credit, no hints.
    const pick = MIX_POOL[Math.floor(Math.random() * MIX_POOL.length)];
    return generateQuestion(pick, tonalityId, weights, recentKeys, feelings);
  }

  return null;
}

function interleave(modes) {
  // Deduplicate + simple rotation. If empty, fall back to all.
  if (!modes.length) return MIX_POOL.slice();
  return modes;
}

function modeLabel(m) {
  return {
    degree_to_chord: "Ступень → аккорд",
    chord_to_degree: "Аккорд → ступень",
    feel_to_chord:   "Чувство → аккорд",
    chord_to_feel:   "Аккорд → чувство",
    ear_to_step:     "Слух → ступень",
    ear_to_feel:     "Слух → чувство",
    next_chord:      "Угадай следующий",
    flashcards:      "Карточка",
    exam:            "Экзамен"
  }[m] || m;
}

function explain(q, feelings) {
  const t = TONALITIES[q.tonalityId];
  if (!t) return "";
  // chord-based explanation
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
    const ch = q.correct?.startsWith?.("«") ? null : q.correct;
    const chord = ch || q.audibleChord || null;
    const feel = chord ? feelings[q.tonalityId]?.[chord] : null;
    if (chord && feel) {
      const step = stepForChordIn(q.tonalityId, chord);
      return `${chord} (${step?.roman ?? "?"}, ${step?.name ?? ""}) — «${feel}». ${step?.meaning ?? ""}`;
    }
  }
  if (q.mode === "next_chord") {
    return `Эта прогрессия чаще всего ведёт к ${q.correct}. Логика — по ступеням и тяготениям.`;
  }
  return "Запомни: чем чаще ошибаешься на одном — тем чаще оно будет возвращаться.";
}

function motivation(questionsLog) {
  const total = questionsLog.length;
  const correct = questionsLog.filter((q) => q.isCorrect).length;
  const acc = correct / total;
  if (acc >= 0.9) return "Сильно! Завтра можно поднять сложность.";
  if (acc >= 0.7) return "Хороший прогресс. Слабые места тренажёр уже отметил.";
  if (acc >= 0.5) return "Сегодня шероховато — но именно так формируется память.";
  return "Не страшно. Завтра те же вопросы вернутся — и поймаются.";
}

/* ---------- Ladder ("все ступени подряд") ---------- */
async function renderLadder(container, tonalityParam) {
  const id = tonalityParam === "C" ? "C" : "Am";
  const t = TONALITIES[id];
  const root = el("div", { class: "col" },
    el("h1", { text: `Все ступени · ${t.russian}` }),
    el("p", { text: "Прогон по всем ступеням сверху вниз. Можно слушать каждую." })
  );
  const list = el("div", { class: "col" });
  t.steps.forEach((s, i) => {
    const chord = t.chordsByTonality[id][i];
    list.appendChild(el("div", { class: "step-row" },
      el("div", { class: "deg", text: s.roman }),
      el("div", null,
        el("div", { class: "chord", text: chord }),
        el("div", { class: "meta", text: s.name + " · " + s.meaning })
      ),
      el("button", { class: "play small", text: "▶", onClick: async () => { await unlock(); playChord(chord, { duration: 1.4 }); } })
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
    }, { ghost: true })
  ));
  container.appendChild(root);
  return () => stopAll();
}

/* ---------- Compare tonalities ---------- */
async function renderCompare(container) {
  const c = TONALITIES.C, a = TONALITIES.Am;
  const root = el("div", { class: "col" },
    el("h1", { text: "C major ↔ A minor" }),
    el("p", { text: "Те же 7 нот, два центра тяжести, два настроения." })
  );
  const table = el("div", { class: "col" });
  for (let i = 0; i < 7; i++) {
    const cs = c.steps[i], as = a.steps[i];
    const cc = c.chordsByTonality.C[i], ac = a.chordsByTonality.Am[i];
    table.appendChild(el("div", { class: "step-row", style: { gridTemplateColumns: "1fr 1fr" } },
      el("div", null,
        el("div", { class: "chord", text: `${cs.roman} · ${cc}` }),
        el("div", { class: "meta", text: cs.meaning })
      ),
      el("div", null,
        el("div", { class: "chord", text: `${as.roman} · ${ac}` }),
        el("div", { class: "meta", text: as.meaning })
      )
    ));
  }
  root.appendChild(table);
  root.appendChild(el("p", { class: "muted", style: { marginTop: "8px" },
    text: "Одни и те же ноты звучат по-разному — потому что слух «выбирает» опорную точку." }));
  container.appendChild(root);
  return null;
}
