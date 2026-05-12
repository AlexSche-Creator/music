import { el, card, btn, chip } from "./components.js";
import { kvGet } from "../core/store.js";

const MODES = [
  { id: "degree_to_chord", name: "Ступень → аккорд",  hint: "Видишь ступень — выбираешь аккорд." },
  { id: "chord_to_degree", name: "Аккорд → ступень",  hint: "Видишь аккорд — выбираешь ступень." },
  { id: "feel_to_chord",   name: "Чувство → аккорд",  hint: "Эмоция-ассоциация → аккорд." },
  { id: "chord_to_feel",   name: "Аккорд → чувство",  hint: "Аккорд → собственная эмоция." },
  { id: "ear_to_step",     name: "Слух → ступень",    hint: "Слушаешь аккорд → угадываешь ступень." },
  { id: "ear_to_feel",     name: "Слух → чувство",    hint: "Слушаешь аккорд → угадываешь чувство." },
  { id: "next_chord",      name: "Угадай следующий",  hint: "По началу прогрессии угадываешь следующий аккорд." },
  { id: "flashcards",      name: "Карточки",          hint: "Переворачиваешь карточку — проверяешь себя." },
  { id: "exam",            name: "Экзамен",           hint: "20 вопросов без подсказок." }
];

const DURATIONS = [
  { sec: 180, label: "3 мин" },
  { sec: 300, label: "5 мин" },
  { sec: 600, label: "10 мин" },
  { sec: 900, label: "15 мин" }
];

const TONALITIES = [
  { id: "C", label: "C major" },
  { id: "Am", label: "A minor" },
  { id: "both", label: "Обе" }
];

let chosen = { dur: 300, tonality: "Am" };

export async function renderTrainHub({ container }) {
  const settings = (await kvGet("settings")) || {};
  const enabled = new Set(settings.enabledModes ?? MODES.map((m) => m.id));
  chosen.dur = settings.sessionDurationSec ?? 300;
  chosen.tonality = settings.tonalityOfTheDay ?? "Am";

  container.appendChild(card(el("div", { class: "col" },
    el("h1", { text: "Тренировка" }),
    el("p", { text: "Выбери длительность, тональность и режим. Можно начать с микса." })
  )));

  container.appendChild(card(el("div", { class: "col" },
    el("h3", { text: "Длительность" }),
    el("div", { class: "btn-row" }, ...DURATIONS.map((d) =>
      btn(d.label, () => { chosen.dur = d.sec; refreshChips(); }, { ghost: true, small: true, attrs: { "data-dur": d.sec } })
    )),
    el("h3", { text: "Тональность", style: { marginTop: "8px" } }),
    el("div", { class: "btn-row" }, ...TONALITIES.map((t) =>
      btn(t.label, () => { chosen.tonality = t.id; refreshChips(); }, { ghost: true, small: true, attrs: { "data-ton": t.id } })
    )),
    el("div", { class: "row", id: "trainChips", style: { marginTop: "10px" } })
  )));

  container.appendChild(card(el("div", { class: "col" },
    el("h2", { text: "Микс" }),
    el("p", { text: "Авто-чередование режимов с упором на слабые места." }),
    btn("Запустить смешанную сессию", () =>
      location.hash = `#/train/run?mode=mix&tonality=${chosen.tonality}&dur=${chosen.dur}`,
      { primary: true, full: true })
  )));

  container.appendChild(card(el("div", { class: "col" },
    el("h2", { text: "Режимы" }),
    el("div", { class: "col" }, ...MODES.map((m) =>
      el("div", { class: `step-row${enabled.has(m.id) ? "" : " pulse"}` },
        el("div", { class: "deg", text: enabled.has(m.id) ? "●" : "○" }),
        el("div", null,
          el("div", { class: "chord", text: m.name }),
          el("div", { class: "meta", text: m.hint })
        ),
        btn("Старт", () => location.hash = `#/train/run?mode=${m.id}&tonality=${chosen.tonality}&dur=${chosen.dur}`, { small: true })
      )
    ))
  )));

  container.appendChild(card(el("div", { class: "col" },
    el("h2", { text: "Дополнительно" }),
    el("div", { class: "btn-row" },
      btn("Все ступени подряд", () => location.hash = `#/train/run?mode=ladder&tonality=${chosen.tonality}&dur=0`, { ghost: true }),
      btn("Сравнить тональности", () => location.hash = `#/train/run?mode=compare&tonality=both&dur=0`, { ghost: true })
    )
  )));

  refreshChips();
  return null;
}

function refreshChips() {
  const root = document.getElementById("trainChips");
  if (!root) return;
  root.innerHTML = "";
  root.appendChild(chip(`${Math.round(chosen.dur / 60)} мин`, true));
  root.appendChild(chip(chosen.tonality === "both" ? "Обе тональности" : chosen.tonality, true));
}
