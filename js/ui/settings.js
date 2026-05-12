import { TONALITIES } from "../data/tonalities.js";
import { DEFAULT_FEELINGS, effectiveFeelings } from "../data/feelings.js";
import { kvGet, kvSet, exportAll, importAll, clearAll } from "../core/store.js";
import { reportCapabilities, requestPermission, scheduleLocalReminders, downloadIcs } from "../core/reminders.js";
import { setTimbre, unlock, playChord } from "../core/audio.js";
import { el, card, btn, chip, toast } from "./components.js";

const ALL_MODES = [
  { id: "degree_to_chord", label: "Ступень → аккорд" },
  { id: "chord_to_degree", label: "Аккорд → ступень" },
  { id: "feel_to_chord",   label: "Чувство → аккорд" },
  { id: "chord_to_feel",   label: "Аккорд → чувство" },
  { id: "ear_to_step",     label: "Слух → ступень" },
  { id: "ear_to_feel",     label: "Слух → чувство" },
  { id: "next_chord",      label: "Угадай следующий" },
  { id: "flashcards",      label: "Карточки" },
  { id: "exam",            label: "Экзамен" }
];

const DEFAULTS = {
  dailyTarget: 15,
  sessionDurationSec: 300,
  timbre: "piano",
  enabledModes: ALL_MODES.map((m) => m.id),
  reminders: [{ hour: 9, minute: 30, daysMask: 0b1111111, label: "Утренняя сессия" }]
};

export async function renderSettings({ container }) {
  const settings = { ...DEFAULTS, ...((await kvGet("settings")) || {}) };
  const overrides = (await kvGet("feelings_overrides")) || {};
  const caps = reportCapabilities();

  container.appendChild(el("h1", { text: "Настройки" }));

  /* ------- Цели / длительность ------- */
  container.appendChild(card(el("div", { class: "col" },
    el("h2", { text: "Ежедневная цель и сессия" }),
    fieldNumber("Цель на день (вопросов)", settings.dailyTarget, (v) => { settings.dailyTarget = clamp(v, 5, 200); save(); }),
    fieldSelect("Длительность сессии", [
      { v: 180, label: "3 минуты" },
      { v: 300, label: "5 минут" },
      { v: 600, label: "10 минут" },
      { v: 900, label: "15 минут" }
    ], settings.sessionDurationSec, (v) => { settings.sessionDurationSec = +v; save(); })
  )));

  /* ------- Тембр ------- */
  container.appendChild(card(el("div", { class: "col" },
    el("h2", { text: "Звук" }),
    fieldSelect("Тембр", [
      { v: "piano", label: "Piano-like (мягкий)" },
      { v: "guitar", label: "Plucked / гитарный" }
    ], settings.timbre, async (v) => {
      settings.timbre = v;
      setTimbre(v);
      save();
      await unlock();
      playChord("Am", { duration: 1.4 });
    }),
    el("p", { text: "Это синтез на WebAudio — без сэмплов, чтобы быстро грузиться офлайн." })
  )));

  /* ------- Активные режимы ------- */
  const modesCard = el("div", { class: "col" }, el("h2", { text: "Режимы тренировок" }));
  const enabledSet = new Set(settings.enabledModes);
  for (const m of ALL_MODES) {
    const sw = el("div", { class: "switch" },
      el("div", null,
        el("div", { class: "title", text: m.label }),
        el("div", { class: "desc", text: enabledSet.has(m.id) ? "Включён" : "Отключён" })
      ),
      el("button", { class: `toggle${enabledSet.has(m.id) ? " on" : ""}`, "aria-pressed": enabledSet.has(m.id) ? "true" : "false", onClick: (ev) => {
        if (enabledSet.has(m.id)) enabledSet.delete(m.id);
        else enabledSet.add(m.id);
        settings.enabledModes = [...enabledSet];
        ev.currentTarget.classList.toggle("on");
        save();
      }})
    );
    modesCard.appendChild(sw);
  }
  container.appendChild(card(modesCard));

  /* ------- Напоминания ------- */
  const remCard = el("div", { class: "col" }, el("h2", { text: "Напоминания" }));
  remCard.appendChild(el("p", { text: capabilitiesNote(caps) }));
  const remList = el("div", { class: "col", style: { marginTop: "8px" } });
  function repaintReminders() {
    remList.innerHTML = "";
    (settings.reminders || []).forEach((r, i) => {
      const time = pad2(r.hour) + ":" + pad2(r.minute);
      remList.appendChild(el("div", { class: "step-row" },
        el("div", { class: "deg", text: "⏰" }),
        el("div", null,
          el("input", { type: "time", value: time, onChange: (e) => {
            const [h, m] = e.target.value.split(":").map(Number);
            r.hour = h; r.minute = m; save(); scheduleIfAllowed();
          }}),
          el("div", { class: "meta", text: r.label || "Сессия" })
        ),
        btn("Удалить", () => {
          settings.reminders.splice(i, 1);
          save(); scheduleIfAllowed(); repaintReminders();
        }, { small: true, ghost: true })
      ));
    });
  }
  repaintReminders();
  remCard.appendChild(remList);
  remCard.appendChild(el("div", { class: "btn-row" },
    btn("Добавить напоминание", () => {
      settings.reminders = settings.reminders || [];
      settings.reminders.push({ hour: 19, minute: 0, daysMask: 0b1111111, label: "Вечерняя сессия" });
      save(); scheduleIfAllowed(); repaintReminders();
    }),
    btn(caps.permission === "granted" ? "Разрешение есть" : "Запросить уведомления", async () => {
      const p = await requestPermission();
      toast(p === "granted" ? "Разрешено" : (p === "denied" ? "Запрещено" : "Не сейчас"));
      scheduleIfAllowed();
    }, { primary: caps.permission !== "granted", attrs: { disabled: caps.permission === "granted" ? "disabled" : null } }),
    btn("Скачать .ics для Календаря", () => downloadIcs(settings.reminders || []), { ghost: true }),
    btn("Открыть Shortcuts", () => {
      // Generic deep-link example. The user can craft their own Shortcut from this.
      const url = "https://www.icloud.com/shortcuts/";
      window.open(url, "_blank");
    }, { ghost: true })
  ));
  container.appendChild(card(remCard));

  /* ------- Чувства ------- */
  const feelCard = el("div", { class: "col" },
    el("h2", { text: "Мои чувства" }),
    el("p", { text: "Каждый аккорд можно подписать своей эмоцией. Это твоя личная карта." })
  );
  const merged = effectiveFeelings(overrides);
  for (const tid of Object.keys(TONALITIES)) {
    feelCard.appendChild(el("h3", { text: TONALITIES[tid].russian }));
    for (const chord of TONALITIES[tid].chordsByTonality[tid]) {
      const val = merged[tid]?.[chord] ?? "";
      const def = DEFAULT_FEELINGS[tid]?.[chord] ?? "";
      const row = el("div", { class: "field" },
        el("label", { text: `${chord} (${stepName(tid, chord)})` }),
        el("input", { type: "text", value: val, onChange: async (e) => {
          overrides[tid] = overrides[tid] || {};
          if (!e.target.value || e.target.value === def) delete overrides[tid][chord];
          else overrides[tid][chord] = e.target.value;
          await kvSet("feelings_overrides", overrides);
          toast("Сохранено");
        }, placeholder: def })
      );
      feelCard.appendChild(row);
    }
  }
  feelCard.appendChild(btn("Сбросить чувства к умолчаниям", async () => {
    await kvSet("feelings_overrides", {});
    toast("Готово");
    container.innerHTML = "";
    renderSettings({ container });
  }, { ghost: true }));
  container.appendChild(card(feelCard));

  /* ------- Данные ------- */
  container.appendChild(card(el("div", { class: "col" },
    el("h2", { text: "Данные" }),
    el("div", { class: "btn-row" },
      btn("Экспорт JSON", async () => {
        const data = await exportAll();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "music-trainer.json";
        document.body.appendChild(a); a.click(); a.remove();
      }),
      btn("Импорт JSON", () => {
        const input = document.createElement("input");
        input.type = "file"; input.accept = "application/json";
        input.onchange = async () => {
          const f = input.files?.[0];
          if (!f) return;
          try {
            const txt = await f.text();
            await importAll(JSON.parse(txt));
            toast("Импортировано");
          } catch (e) { toast("Не удалось: " + e.message); }
        };
        input.click();
      }, { ghost: true }),
      btn("Сбросить всё", async () => {
        if (!confirm("Удалить всю историю и настройки?")) return;
        await clearAll();
        toast("Удалено");
        location.hash = "#/dashboard";
      }, { ghost: true })
    ),
    el("p", { text: "Прогресс хранится только в браузере. iOS может очистить хранилище, если приложением не пользоваться неделями." })
  )));

  function scheduleIfAllowed() {
    if (reportCapabilities().permission === "granted") {
      scheduleLocalReminders(settings.reminders || []);
    }
  }

  function save() {
    kvSet("settings", settings);
  }

  return null;
}

function stepName(tid, chord) {
  const ton = TONALITIES[tid];
  const idx = ton.chordsByTonality[tid].indexOf(chord);
  return ton.steps[idx]?.roman || "";
}

function pad2(n) { return n < 10 ? "0" + n : String(n); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, +v || 0)); }

function fieldNumber(label, value, onSave) {
  return el("div", { class: "field" },
    el("label", { text: label }),
    el("input", { type: "text", inputmode: "numeric", value: String(value), onChange: (e) => onSave(parseInt(e.target.value, 10)) })
  );
}
function fieldSelect(label, options, value, onSave) {
  const sel = el("select", { onChange: (e) => onSave(e.target.value) },
    ...options.map((o) => el("option", { value: String(o.v), selected: String(o.v) === String(value) ? "selected" : null }, o.label))
  );
  return el("div", { class: "field" },
    el("label", { text: label }),
    sel
  );
}

function capabilitiesNote(caps) {
  const out = [];
  if (!caps.notifications) out.push("Этот браузер не поддерживает уведомления.");
  if (!caps.standalone) out.push("Чтобы push-уведомления заработали на iPhone, добавь приложение на главный экран (Поделиться → На экран «Домой»).");
  if (caps.notifications && caps.permission !== "granted") out.push("Уведомления выключены — можно разрешить ниже.");
  if (caps.notifications && caps.permission === "granted" && caps.standalone) out.push("Уведомления работают, пока вкладка активна. В фоне iOS их не доставит.");
  out.push("Для надёжных напоминаний используй .ics — Календарь iOS пошлёт нативное уведомление.");
  return out.join(" ");
}
