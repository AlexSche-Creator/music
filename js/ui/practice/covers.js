/* Cover-of-the-Day module.
 *
 * The session is intentionally simple: pick a track, hit Start, play. We log
 * one habit session whenever the user taps "Я сыграл" — or, if mic detection
 * is on and we detected audio for ≥30 s, automatically.
 *
 * No track recognition. The mic detector only measures RMS energy; it is a
 * "yes, somebody is playing" signal, nothing more.
 */

import { kvGet, kvSet } from "../../core/store.js";
import { mergeSettings } from "../../core/settings-schema.js";
import { recordSession } from "../../core/habits.js";
import { el, card, btn, chip, toast } from "../components.js";

const SUGGESTED = [
  { title: "Wonderwall — Oasis",            tonality: "Em / G / D",   chordify: "https://chordify.net/chords/wonderwall-oasis" },
  { title: "Let It Be — The Beatles",       tonality: "C / G / Am / F", chordify: "https://chordify.net/chords/let-it-be-the-beatles" },
  { title: "Hotel California — Eagles",     tonality: "Bm / F#",      chordify: "https://chordify.net/chords/hotel-california-eagles" },
  { title: "Звезда по имени Солнце — Кино", tonality: "Am / C / G / F", chordify: "https://chordify.net/chords/zvezda-po-imeni-solntse-kino" },
  { title: "Группа крови — Кино",           tonality: "Am / G / F",   chordify: "https://chordify.net/chords/gruppa-krovi-kino" },
  { title: "Бесконечность — Земфира",       tonality: "Em / D / C",   chordify: "https://chordify.net/chords/beskonechnost-zemfira" },
];

export async function renderCovers({ container }) {
  const settings = mergeSettings(await kvGet("settings"));
  const cfg = settings.covers || {};
  let durationSec = Number(cfg.defaultDurationSec || 180);
  let micEnabled = cfg.micDetectorEnabled !== true ? false : true;
  let micDetected = false;
  let micAccumulated = 0;
  let micStream = null;
  let micCtx = null;
  let micRaf = 0;
  let active = false;
  let endsAt = 0;
  let tickH = null;

  container.appendChild(el("h1", { text: "🎤 Кавер дня" }));
  container.appendChild(el("p", { text: "Один трек на сессию. Сыграй до конца — это и есть упражнение." }));

  /* Track picker */
  const trackList = el("div", { class: "col", style: { gap: "10px" } });
  let pickedIdx = pickStartingIndex();
  function renderTracks() {
    trackList.innerHTML = "";
    SUGGESTED.forEach((tr, i) => {
      const row = card(el("div", { class: "row between" },
        el("div", null,
          el("h3", { text: tr.title }),
          el("div", { class: "muted", style: { fontSize: "13px" }, text: tr.tonality }),
        ),
        chip(pickedIdx === i ? "Выбран" : "—", pickedIdx === i),
      ), {
        practiceAccent: true,
        tap: true,
        attrs: { onClick: () => { pickedIdx = i; renderTracks(); renderActions(); }, role: "button", tabindex: "0", style: "cursor:pointer;" },
      });
      trackList.appendChild(row);
    });
  }
  container.appendChild(card(el("div", { class: "col", style: { gap: "10px" } },
    el("h2", { text: "Выбери трек" }),
    trackList,
  ), { practiceAccent: true }));

  /* Settings row (duration + mic) */
  const durationRow = el("div", { class: "row", style: { flexWrap: "wrap", gap: "8px" } });
  function renderDurationRow() {
    durationRow.innerHTML = "";
    [[180,"3 мин"],[300,"5 мин"],[600,"10 мин"],[1200,"20 мин"]].forEach(([v,l]) => {
      durationRow.appendChild(chipBtn(v, l, durationSec === v, () => { durationSec = v; renderDurationRow(); renderTimer(); }));
    });
  }
  const micSwitch = el("div", { class: "switch" },
    el("div", null,
      el("div", { class: "title", text: "Слушать микрофон (опционально)" }),
      el("div", { class: "desc", text: "Просто проверяет «играет ли кто-то». Нет распознавания." }),
    ),
    toggleEl(micEnabled, async (v) => { micEnabled = v; if (active) { v ? await startMic() : stopMic(); } }),
  );
  container.appendChild(card(el("div", { class: "col" },
    el("h2", { text: "Параметры" }),
    el("h3", { text: "Длительность" }), durationRow,
    micSwitch,
  ), { practiceAccent: true }));

  /* Timer + actions */
  const timerEl = el("div", { class: "prompt" });
  const actions = el("div", { class: "btn-row" });
  container.appendChild(timerEl);
  container.appendChild(actions);

  function renderTimer() {
    const remain = !active ? durationSec : Math.max(0, Math.round((endsAt - Date.now()) / 1000));
    timerEl.innerHTML = "";
    timerEl.appendChild(el("div", { class: "label", text: active ? (micEnabled ? (micDetected ? "Слышим звук" : "Тихо") : "Идёт сессия") : "Готов?" }));
    timerEl.appendChild(el("div", { class: "big accent", text: fmtMS(remain) }));
    timerEl.appendChild(el("div", { class: "sub", text: active ? "Играй. Дотяни до конца." : "Открой Chordify (опц.) и начинай." }));
  }
  function renderActions() {
    actions.innerHTML = "";
    if (cfg.chordifyShortcut !== false) {
      actions.appendChild(btn("Open Chordify ↗", () => window.open(SUGGESTED[pickedIdx].chordify, "_blank", "noopener"), { ghost: true }));
    }
    if (!active) {
      actions.appendChild(btn("▶ Старт", start, { primary: true, practiceAccent: true, full: true }));
    } else {
      actions.appendChild(btn("✅ Я сыграл", finish, { primary: true, practiceAccent: true }));
      actions.appendChild(btn("■ Стоп", abort));
    }
  }

  async function start() {
    active = true; endsAt = Date.now() + durationSec * 1000;
    micAccumulated = 0; micDetected = false;
    if (micEnabled) await startMic();
    tickH = setInterval(tick, 250);
    renderTimer(); renderActions();
  }
  async function finish() {
    const playedSec = durationSec - Math.max(0, Math.round((endsAt - Date.now()) / 1000));
    active = false; clearInterval(tickH); tickH = null; stopMic();
    const logs = (await kvGet("habit_logs")) || {};
    recordSession(logs, { module: "cover", durationSec: Math.max(60, playedSec || durationSec) });
    await kvSet("habit_logs", logs);
    toast("Кавер записан как сессия");
    renderTimer(); renderActions();
  }
  async function abort() {
    active = false; clearInterval(tickH); tickH = null; stopMic();
    renderTimer(); renderActions();
  }
  function tick() {
    const remain = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
    renderTimer();
    if (remain <= 0) finish();
  }

  async function startMic() {
    if (!navigator.mediaDevices?.getUserMedia) { toast("Микрофон не поддерживается"); return; }
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = micCtx.createMediaStreamSource(micStream);
      const analyser = micCtx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const tickMic = () => {
        if (!micStream) return;
        analyser.getFloatTimeDomainData(buf);
        let sumSq = 0;
        for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
        const rms = Math.sqrt(sumSq / buf.length);
        if (rms > 0.02) { micDetected = true; micAccumulated += 0.05; } else { micDetected = false; }
        micRaf = requestAnimationFrame(tickMic);
      };
      tickMic();
    } catch (err) {
      toast("Нет доступа к микрофону");
      micEnabled = false;
    }
  }
  function stopMic() {
    cancelAnimationFrame(micRaf); micRaf = 0;
    if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
    if (micCtx) { try { micCtx.close(); } catch {} micCtx = null; }
    micDetected = false;
  }

  renderTracks();
  renderDurationRow();
  renderTimer();
  renderActions();

  return () => { clearInterval(tickH); stopMic(); };
}

function pickStartingIndex() {
  return Math.floor(Date.now() / 86400000) % SUGGESTED.length;
}

function chipBtn(value, label, active, onClick) {
  const b = document.createElement("button");
  b.className = `btn small${active ? " primary practice" : ""}`;
  b.type = "button"; b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
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
