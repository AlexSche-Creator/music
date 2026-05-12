import { listAnswers, kvGet } from "../core/store.js";
import { summarize, perDay, heatmap, hardestByField, strongestByField, accuracyByMode, currentStreak } from "../core/stats.js";
import { effectiveFeelings } from "../data/feelings.js";
import { el, card, chip, fmtPct, fmtMs, weekBars } from "./components.js";

const RANGES = [
  { label: "День",   days: 1 },
  { label: "Неделя", days: 7 },
  { label: "Месяц",  days: 30 },
  { label: "Год",    days: 365 }
];

let current = 7;

export async function renderStats({ container }) {
  const feelings = effectiveFeelings(await kvGet("feelings_overrides"));
  container.appendChild(el("h1", { text: "Статистика" }));

  const tabs = el("div", { class: "btn-row" });
  RANGES.forEach((r) => {
    const b = el("button", {
      class: `btn small${current === r.days ? " primary" : " ghost"}`,
      text: r.label,
      onClick: async () => {
        current = r.days;
        container.innerHTML = "";
        await renderStats({ container });
      }
    });
    tabs.appendChild(b);
  });
  container.appendChild(tabs);

  const since = Date.now() - current * 86400000;
  const answers = await listAnswers({ sinceTs: since });
  const sum = summarize(answers);
  const week = perDay(answers, Math.min(30, current));
  const streak = currentStreak(answers);
  const byMode = accuracyByMode(answers);
  const hardestStep = hardestByField(answers, "itemKey", 3);
  const strongStep = strongestByField(answers, "itemKey", 3);

  container.appendChild(el("div", { class: "grid-3" },
    statTile(fmtPct(sum.accuracy), "Точность"),
    statTile(String(sum.total), "Ответов"),
    statTile(fmtMs(sum.avgReactionMs), "Реакция")
  ));
  container.appendChild(el("div", { class: "grid-3" },
    statTile(String(sum.correct), "Правильно"),
    statTile(String(sum.wrong), "Ошибок"),
    statTile(String(streak), "Серия (дни)")
  ));

  if (week.length) {
    container.appendChild(card(el("div", { class: "col" },
      el("h2", { text: "Активность" }),
      weekBars(week.slice(-7))
    )));
  }

  container.appendChild(card(el("div", { class: "col" },
    el("h2", { text: "По режимам" }),
    el("div", { class: "col" },
      ...byMode.map((m) => el("div", { class: "row between" },
        el("div", { text: modeLabel(m.mode) }),
        chip(fmtPct(m.accuracy), m.accuracy >= 0.7)
      ))
    )
  )));

  if (hardestStep.length) {
    container.appendChild(card(el("div", { class: "col" },
      el("h2", { text: "Сложнее всего" }),
      ...hardestStep.map((r) => el("div", { class: "row between" },
        el("div", { text: humanize(r.key, feelings) }),
        chip(`${Math.round(r.errorRate * 100)}% ошибок`, false)
      ))
    )));
  }
  if (strongStep.length) {
    container.appendChild(card(el("div", { class: "col" },
      el("h2", { text: "Лучше всего" }),
      ...strongStep.map((r) => el("div", { class: "row between" },
        el("div", { text: humanize(r.key, feelings) }),
        chip(fmtPct(r.correctRate), true)
      ))
    )));
  }

  // Heatmap (last 12 weeks).
  const hm = heatmap(answers, 12);
  container.appendChild(card(el("div", { class: "col" },
    el("h2", { text: "Heatmap (12 недель)" }),
    el("div", { class: "heatmap" },
      ...hm.flatMap((row) => row.map((c) => el("div", { class: "heat-cell", dataset: { level: String(c.level) }, title: `${new Date(c.ts).toLocaleDateString("ru-RU")} — ${c.cnt}` })))
    )
  )));

  return null;
}

function statTile(v, k) {
  return el("div", { class: "stat" },
    el("div", { class: "v", text: v }),
    el("div", { class: "k", text: k })
  );
}

function modeLabel(m) {
  return {
    degree_to_chord: "Ступень → аккорд",
    chord_to_degree: "Аккорд → ступень",
    feel_to_chord: "Чувство → аккорд",
    chord_to_feel: "Аккорд → чувство",
    ear_to_step: "Слух → ступень",
    ear_to_feel: "Слух → чувство",
    next_chord: "Угадай следующий",
    flashcards: "Карточки",
    exam: "Экзамен",
    mix: "Микс"
  }[m] || m;
}

function humanize(key, feelings) {
  const [k, ...rest] = key.split(":");
  if (k === "chord") return rest[1] + " в " + rest[0];
  if (k === "step")  return `${rest[0]} · ступень ${rest[1]}`;
  if (k === "feel")  return `«${feelings[rest[0]]?.[rest[1]] ?? rest[1]}» (${rest[1]})`;
  if (k === "seq")   return rest[0];
  return key;
}
