/* Improvisation module — pentatonic practice with timer and optional backing.
 *
 * Flow:
 *   1. Pick scale type (minor / major pentatonic) and tonality.
 *   2. Hit Start. A 3/5/10 min countdown begins, backing loop plays (2-chord
 *      vamp) and the user is shown scale notes + anchor pitches per chord.
 *   3. Anytime: Stop / Pause / Done. On Done we record a habit session.
 *
 * No mic, no pitch detection — this is a practice space, not an exam.
 */

import { kvGet, kvSet } from "../../core/store.js";
import { mergeSettings } from "../../core/settings-schema.js";
import { unlock, playSequence, stopAll } from "../../core/audio.js";
import { recordSession } from "../../core/habits.js";
import { pentatonicForTonality, backingLoopFor, anchorPcsForChord } from "../../data/pentatonic.js";
import { activeKeys } from "../../data/keys-roster.js";
import { el, card, btn, chip, toast } from "../components.js";

const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

export async function renderImprov({ container }) {
  const settings = mergeSettings(await kvGet("settings"));
  const cfg = settings.improvisation || {};

  let tonalityId = pickStartingTonality(settings.newKeys && settings.newKeys.keyPrefs);
  let scaleType = cfg.scaleType || "minor_pentatonic";
  let durationSec = Number(cfg.defaultDurationSec || 300);
  let showAnchors = cfg.showAnchors !== false;
  let backingOn = cfg.backingLoop !== false;

  let running = false;
  let pausedRemaining = null;
  let endsAt = 0;
  let tickHandle = null;
  let loopHandle = null;

  container.appendChild(el("h1", { text: "🎼 Импровизация" }));
  container.appendChild(el("p", { text: "Соло над двух-аккордным аккомпанементом. Не надо угадывать — играй на слух." }));

  const tonalityRow = el("div", { class: "row", style: { flexWrap: "wrap", gap: "8px" } });
  const scaleRow    = el("div", { class: "row", style: { flexWrap: "wrap", gap: "8px" } });
  const durationRow = el("div", { class: "row", style: { flexWrap: "wrap", gap: "8px" } });
  const scaleCard   = el("div", { class: "col" });
  const controls    = el("div", { class: "btn-row" });
  const timerEl     = el("div", { class: "prompt" });
  const tipsCard    = el("div", { class: "col" });

  container.appendChild(card(el("div", { class: "col", style: { gap: "12px" } },
    el("h2", { text: "Параметры сессии" }),
    el("h3", { text: "Тональность" }), tonalityRow,
    el("h3", { text: "Шкала" }), scaleRow,
    el("h3", { text: "Длительность" }), durationRow,
    el("div", { class: "switch" },
      el("div", null, el("div", { class: "title", text: "Аккомпанемент" }), el("div", { class: "desc", text: "Двух-аккордная петля. Можно выключить, если играешь со своей фонограммой." })),
      toggleEl(backingOn, (v) => { backingOn = v; }),
    ),
    el("div", { class: "switch" },
      el("div", null, el("div", { class: "title", text: "Подсвечивать опорные ноты" }), el("div", { class: "desc", text: "Ноты аккорда внутри пентатоники." })),
      toggleEl(showAnchors, (v) => { showAnchors = v; renderScale(); }),
    ),
  ), { practiceAccent: true }));

  container.appendChild(card(scaleCard, { practiceAccent: true }));
  container.appendChild(timerEl);
  container.appendChild(card(tipsCard));
  container.appendChild(controls);

  /* --- Build choice rows --- */
  function renderTonalityRow() {
    tonalityRow.innerHTML = "";
    const keys = activeKeys(settings.newKeys && settings.newKeys.keyPrefs);
    const list = keys.length ? keys : [{ id: "Am", russian: "Ля минор" }, { id: "C", russian: "До мажор" }];
    for (const k of list) tonalityRow.appendChild(chipBtn(k.id, k.russian || k.id, tonalityId === k.id, () => { tonalityId = k.id; renderTonalityRow(); renderScale(); }));
  }
  function renderScaleRow() {
    scaleRow.innerHTML = "";
    [["minor_pentatonic","Минорная пентатоника"],["major_pentatonic","Мажорная пентатоника"]].forEach(([v,l]) => {
      scaleRow.appendChild(chipBtn(v, l, scaleType === v, () => { scaleType = v; renderScaleRow(); renderScale(); }));
    });
  }
  function renderDurationRow() {
    durationRow.innerHTML = "";
    [[180,"3 мин"],[300,"5 мин"],[600,"10 мин"]].forEach(([v,l]) => {
      durationRow.appendChild(chipBtn(String(v), l, durationSec === v, () => { durationSec = v; renderDurationRow(); renderTimer(); }));
    });
  }

  function renderScale() {
    const scale = pentatonicForTonality(tonalityId, scaleType) || pentatonicForTonality("Am");
    const loop = backingLoopFor(tonalityId);
    scaleCard.innerHTML = "";
    scaleCard.appendChild(el("h2", { text: `${scale.root} ${scaleType === "major_pentatonic" ? "major" : "minor"} pentatonic` }));
    scaleCard.appendChild(el("p", { text: `Аккорды петли: ${loop.join(" • ")}` }));
    const grid = el("div", { class: "row", style: { flexWrap: "wrap", gap: "8px", marginTop: "6px" } });
    const anchorSet = new Set();
    if (showAnchors) for (const c of loop) for (const pc of anchorPcsForChord(scale.pcs, c)) anchorSet.add(pc);
    for (const pc of scale.pcs) {
      const accent = anchorSet.has(pc);
      grid.appendChild(el("span", {
        class: `chip${accent ? " accent" : ""}`,
        style: accent ? { color: "var(--accent-practice)", borderColor: "var(--accent-practice)", background: "var(--accent-practice-soft)" } : null,
        text: NOTE_NAMES[pc],
      }));
    }
    scaleCard.appendChild(grid);
  }

  function renderTimer() {
    const remaining = !running && pausedRemaining == null ? durationSec : pausedRemaining ?? Math.max(0, Math.round((endsAt - Date.now()) / 1000));
    timerEl.innerHTML = "";
    timerEl.appendChild(el("div", { class: "label", text: running ? "Идёт сессия" : pausedRemaining != null ? "Пауза" : "Готов?" }));
    timerEl.appendChild(el("div", { class: "big accent", text: fmtMS(remaining) }));
    timerEl.appendChild(el("div", { class: "sub", text: running ? "Играй. Любая нота из шкалы — твоя." : "Нажми «Старт» и играй на инструменте." }));
  }

  function renderTips() {
    tipsCard.innerHTML = "";
    tipsCard.appendChild(el("h3", { text: "Подсказки" }));
    tipsCard.appendChild(el("p", { text: "1. Начинай и заканчивай фразы на опорной ноте." }));
    tipsCard.appendChild(el("p", { text: "2. Используй паузы между нотами — соло не должно быть «лесенкой»." }));
    tipsCard.appendChild(el("p", { text: "3. Не бойся повторов. Повтор — это музыка." }));
  }

  function renderControls() {
    controls.innerHTML = "";
    if (!running && pausedRemaining == null) {
      controls.appendChild(btn("▶ Старт", start, { primary: true, practiceAccent: true, full: true }));
    } else if (running) {
      controls.appendChild(btn("⏸ Пауза", pause, { practiceAccent: true }));
      controls.appendChild(btn("■ Стоп", stop));
    } else {
      controls.appendChild(btn("▶ Продолжить", resume, { primary: true, practiceAccent: true }));
      controls.appendChild(btn("■ Завершить", stop));
    }
  }

  async function start() {
    await unlock();
    running = true; pausedRemaining = null;
    endsAt = Date.now() + durationSec * 1000;
    if (backingOn) playLoop();
    tickHandle = setInterval(tick, 250);
    renderTimer(); renderControls();
  }
  function pause() {
    if (!running) return;
    running = false;
    pausedRemaining = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
    clearInterval(tickHandle); tickHandle = null;
    stopAll(); clearTimeout(loopHandle);
    renderTimer(); renderControls();
  }
  async function resume() {
    await unlock();
    running = true;
    endsAt = Date.now() + (pausedRemaining || 0) * 1000;
    pausedRemaining = null;
    if (backingOn) playLoop();
    tickHandle = setInterval(tick, 250);
    renderTimer(); renderControls();
  }
  async function stop() {
    const playedSec = durationSec - Math.max(0, Math.round((endsAt - Date.now()) / 1000));
    running = false; pausedRemaining = null;
    clearInterval(tickHandle); tickHandle = null;
    stopAll(); clearTimeout(loopHandle);
    const logs = (await kvGet("habit_logs")) || {};
    recordSession(logs, { module: "improv", durationSec: Math.max(60, playedSec || durationSec) });
    await kvSet("habit_logs", logs);
    toast("Сессия записана");
    renderTimer(); renderControls();
  }

  function tick() {
    const remain = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
    renderTimer();
    if (remain <= 0) stop();
  }

  function playLoop() {
    if (!running || !backingOn) return;
    const loop = backingLoopFor(tonalityId);
    playSequence(loop, { stepSec: 1.6, durationSec: 1.5, arpeggio: false, octave: 4 })
      .then(() => { if (running && backingOn) loopHandle = setTimeout(playLoop, 80); })
      .catch(() => {});
  }

  renderTonalityRow();
  renderScaleRow();
  renderDurationRow();
  renderScale();
  renderTimer();
  renderTips();
  renderControls();

  return () => {
    clearInterval(tickHandle); clearTimeout(loopHandle); stopAll();
  };
}

function pickStartingTonality(prefs) {
  const list = activeKeys(prefs);
  if (list.length) return (list.find((k) => k.favourite) || list[0]).id;
  return "Am";
}

function chipBtn(value, label, active, onClick) {
  const el2 = document.createElement("button");
  el2.className = `btn small${active ? " primary practice" : ""}`;
  el2.type = "button";
  el2.textContent = label;
  el2.addEventListener("click", onClick);
  el2.dataset.value = value;
  return el2;
}

function toggleEl(initial, onChange) {
  const wrap = document.createElement("div");
  wrap.className = `toggle${initial ? " on" : ""}`;
  wrap.addEventListener("click", () => {
    wrap.classList.toggle("on");
    onChange(wrap.classList.contains("on"));
  });
  return wrap;
}

function fmtMS(sec) {
  const m = Math.floor(sec / 60); const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
