/* Statistics — module-switchable across all practice modules.
 *
 * Two independent selectors:
 *   1. Module: Все / Теория и слух / Импровизация / Каверы / Аппликатуры /
 *              Новые тональности / Привычки
 *   2. Range:  День / Неделя / Месяц / Год
 *
 * For question-based modules (theory) we read from kv answers + scheduler.
 * For habit-based modules (improv, cover, shapes, newKeys) we read from
 * kv habit_logs. The "Привычки" view is a meta-tab that shows Practice
 * Score trend + heatmap across all modules.
 *
 * Modules not yet shipped render a friendly empty-state. As Phase 2+ lands,
 * they automatically start populating from habit_logs.
 */

import { listAnswers, listSessions, kvGet } from "../core/store.js";
import {
  summarize, perDay, heatmap as answersHeatmap, hardestByField, strongestByField,
  accuracyByMode, currentStreak, avgSessionDurationSec,
} from "../core/stats.js";
import { heatmap as habitHeatmap, moduleStreak, moduleHealth, MODULE_LABELS_RU } from "../core/habits.js";
import { dailyScore, averageScore } from "../core/score.js";
import { effectiveFeelings } from "../data/feelings.js";
import { el, card, chip, fmtPct, fmtMs, weekBars } from "./components.js";

const RANGES = [
  { id: "day",   label: "День",   days: 1 },
  { id: "week",  label: "Неделя", days: 7 },
  { id: "month", label: "Месяц",  days: 30 },
  { id: "year",  label: "Год",    days: 365 },
];

const MODULE_TABS = [
  { id: "all",      label: "Все" },
  { id: "theory",   label: "Теория и слух" },
  { id: "improv",   label: "Импровизация" },
  { id: "cover",    label: "Каверы" },
  { id: "shapes",   label: "Аппликатуры" },
  { id: "newKeys",  label: "Новые тональности" },
  { id: "habits",   label: "Привычки" },
];

let uiState = { rangeId: "week", moduleId: "all" };

export async function renderStats({ container }) {
  const feelings = effectiveFeelings(await kvGet("feelings_overrides"));
  const habitLogs = (await kvGet("habit_logs")) || {};

  container.appendChild(el("h1", { text: "Статистика" }));

  // Module chip strip (horizontally scrollable on narrow phones).
  const modRow = el("div", { class: "row", style: { gap: "8px", overflowX: "auto", paddingBottom: "4px" } });
  for (const m of MODULE_TABS) {
    const c = chip(m.label, uiState.moduleId === m.id);
    c.style.cursor = "pointer";
    c.style.flexShrink = "0";
    c.addEventListener("click", () => { uiState.moduleId = m.id; rerender(container); });
    modRow.appendChild(c);
  }
  container.appendChild(modRow);

  // Range tabs.
  const rangeRow = el("div", { class: "btn-row" });
  for (const r of RANGES) {
    rangeRow.appendChild(el("button", {
      class: `btn small${uiState.rangeId === r.id ? " primary" : " ghost"}`,
      text: r.label,
      onClick: () => { uiState.rangeId = r.id; rerender(container); },
    }));
  }
  container.appendChild(rangeRow);

  const range = RANGES.find((r) => r.id === uiState.rangeId);
  const sinceTs = Date.now() - range.days * 86400000;

  if (uiState.moduleId === "all" || uiState.moduleId === "theory") {
    await renderTheoryView(container, { sinceTs, range, feelings });
  } else if (uiState.moduleId === "habits") {
    await renderHabitsView(container, { sinceTs, range, habitLogs });
  } else {
    renderModuleHabitView(container, { sinceTs, range, habitLogs, moduleId: uiState.moduleId });
  }

  return null;
}

function rerender(container) {
  container.innerHTML = "";
  renderStats({ container });
}

/* ---------- Theory / "Все" view (current behaviour, kept intact) ---------- */
async function renderTheoryView(container, { sinceTs, range, feelings }) {
  const answers = await listAnswers({ sinceTs });
  const allSessions = await listSessions();
  const sessions = allSessions.filter((s) => (s.startedAt ?? 0) >= sinceTs);
  const sum = summarize(answers);
  const week = perDay(answers, Math.min(30, range.days));
  const streak = currentStreak(answers);
  const byMode = accuracyByMode(answers);
  const hardestStep = hardestByField(answers, "itemKey", 3);
  const strongStep = strongestByField(answers, "itemKey", 3);
  const avgSec = avgSessionDurationSec(sessions);

  container.appendChild(el("div", { class: "grid-3" },
    statTile(fmtPct(sum.accuracy), "Точность"),
    statTile(String(sum.total), "Ответов"),
    statTile(fmtMs(sum.avgReactionMs), "Реакция"),
  ));
  container.appendChild(el("div", { class: "grid-3" },
    statTile(String(sum.correct), "Правильно"),
    statTile(String(sum.wrong), "Ошибок"),
    statTile(String(streak), "Серия (дни)"),
  ));
  container.appendChild(el("div", { class: "grid-3" },
    statTile(fmtDurSec(avgSec), "Длительность сессии"),
    statTile(String(sessions.length), "Сессий"),
    statTile(fmtPct(sum.replayRate), "Использовал ▶"),
  ));

  if (week.length) {
    container.appendChild(card(el("div", { class: "col" },
      el("h2", { text: "Активность" }),
      weekBars(week.slice(-7)),
    )));
  }

  container.appendChild(card(el("div", { class: "col" },
    el("h2", { text: "По режимам" }),
    el("div", { class: "col" },
      ...byMode.map((m) => el("div", { class: "row between" },
        el("div", { text: trainingModeLabel(m.mode) }),
        chip(fmtPct(m.accuracy), m.accuracy >= 0.7),
      )),
    ),
  )));

  if (hardestStep.length) {
    container.appendChild(card(el("div", { class: "col" },
      el("h2", { text: "Сложнее всего" }),
      ...hardestStep.map((r) => el("div", { class: "row between" },
        el("div", { text: humanise(r.key, feelings) }),
        chip(`${Math.round(r.errorRate * 100)}% ошибок`, false),
      )),
    )));
  }
  if (strongStep.length) {
    container.appendChild(card(el("div", { class: "col" },
      el("h2", { text: "Лучше всего" }),
      ...strongStep.map((r) => el("div", { class: "row between" },
        el("div", { text: humanise(r.key, feelings) }),
        chip(fmtPct(r.correctRate), true),
      )),
    )));
  }

  const hm = answersHeatmap(answers, 12);
  container.appendChild(card(el("div", { class: "col" },
    el("h2", { text: "Heatmap (12 недель)" }),
    el("div", { class: "heatmap" },
      ...hm.flatMap((row) => row.map((c) => el("div", {
        class: "heat-cell", dataset: { level: String(c.level) },
        title: `${new Date(c.ts).toLocaleDateString("ru-RU")} — ${c.cnt}`,
      }))),
    ),
  )));
}

/* ---------- Habit-based per-module view ---------- */
function renderModuleHabitView(container, { sinceTs, range, habitLogs, moduleId }) {
  let totalSessions = 0;
  let totalDurationSec = 0;
  let lastTs = 0;
  for (const [day, log] of Object.entries(habitLogs)) {
    if (Number(day) < sinceTs) continue;
    const mod = log.modules && log.modules[moduleId];
    if (!mod) continue;
    totalSessions += mod.sessions;
    totalDurationSec += mod.totalDurationSec;
    if (mod.lastTs > lastTs) lastTs = mod.lastTs;
  }
  const streak = moduleStreak(habitLogs, moduleId);
  const lastDays = lastTs ? Math.floor((Date.now() - lastTs) / 86400000) : null;

  container.appendChild(el("div", { class: "grid-3" },
    statTile(String(totalSessions), "Сессий"),
    statTile(fmtDurSec(totalDurationSec || null), "Время"),
    statTile(String(streak), "Серия (дни)"),
  ));

  if (totalSessions === 0) {
    container.appendChild(card(el("div", { class: "col" },
      el("h2", { text: MODULE_LABELS_RU[moduleId] || moduleId }),
      el("p", { text: emptyStateText(moduleId) }),
    )));
    return;
  }

  container.appendChild(card(el("div", { class: "col" },
    el("h2", { text: MODULE_LABELS_RU[moduleId] || moduleId }),
    el("div", { class: "row between" },
      el("div", { text: "Последняя сессия" }),
      chip(lastDays === 0 ? "Сегодня" : lastDays === 1 ? "Вчера" : `${lastDays} дн. назад`, lastDays <= 1),
    ),
    el("p", { class: "muted", text: "Расширенная статистика появится по мере накопления данных." }),
  )));
}

/* ---------- Habits meta-view: heatmap of all modules + score trend ---------- */
async function renderHabitsView(container, { sinceTs, range, habitLogs }) {
  const score7 = averageScore(habitLogs, 7);
  const score30 = averageScore(habitLogs, 30);
  const todayScore = dailyScore(habitLogs[(() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })()] || {});
  const health = moduleHealth(habitLogs);

  container.appendChild(el("div", { class: "grid-3" },
    statTile(String(todayScore), "Сегодня"),
    statTile(String(score7), "Среднее 7д"),
    statTile(String(score30), "Среднее 30д"),
  ));

  container.appendChild(card(el("div", { class: "col" },
    el("h2", { text: "Что давно не трогалось" }),
    ...Object.entries(health).map(([m, h]) => el("div", { class: "row between" },
      el("div", { text: MODULE_LABELS_RU[m] || m }),
      chip(
        h.daysSinceLast >= 999 ? "Ни разу" :
        h.daysSinceLast === 0 ? "Сегодня" :
        `${h.daysSinceLast} дн. назад`,
        h.daysSinceLast <= 2,
      ),
    )),
  )));

  // Combined heatmap of habit activity.
  const hm = habitHeatmap(habitLogs, 12);
  container.appendChild(card(el("div", { class: "col" },
    el("h2", { text: "Активность по дням (12 недель)" }),
    el("div", { class: "heatmap" },
      ...hm.flatMap((row) => row.map((c) => el("div", {
        class: "heat-cell", dataset: { level: String(c.level) },
        title: `${new Date(c.ts).toLocaleDateString("ru-RU")} — ${c.cnt} сессий`,
      }))),
    ),
  )));
}

/* ---------- Helpers ---------- */

function statTile(v, k) {
  return el("div", { class: "stat" },
    el("div", { class: "v", text: v }),
    el("div", { class: "k", text: k }),
  );
}

function fmtDurSec(sec) {
  if (sec == null) return "—";
  if (sec < 60) return `${sec} с`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}:${String(s).padStart(2, "0")}` : `${m} мин`;
}

function trainingModeLabel(m) {
  return {
    degree_to_chord: "Ступень → аккорд",
    chord_to_degree: "Аккорд → ступень",
    feel_to_chord:   "Чувство → аккорд",
    chord_to_feel:   "Аккорд → чувство",
    ear_to_step:     "Слух → ступень",
    ear_to_feel:     "Слух → чувство",
    next_chord:      "Угадай следующий",
    flashcards:      "Карточки",
    exam:            "Экзамен",
    mix:             "Микс",
  }[m] || m;
}

function humanise(key, feelings) {
  const [k, ...rest] = key.split(":");
  if (k === "chord") return rest[1] + " в " + rest[0];
  if (k === "step")  return `${rest[0]} · ступень ${rest[1]}`;
  if (k === "feel")  return `«${feelings[rest[0]] && feelings[rest[0]][rest[1]] || rest[1]}» (${rest[1]})`;
  if (k === "seq")   return rest[0];
  return key;
}

function emptyStateText(moduleId) {
  const m = {
    improv:  "Импровизационные сессии появятся, когда модуль будет доступен (Phase 2).",
    cover:   "Кавер-сессии появятся, когда модуль будет доступен (Phase 2).",
    shapes:  "Аппликатуры аккордов появятся, когда модуль будет доступен (Phase 3).",
    newKeys: "Новые тональности появятся, когда модуль будет доступен (Phase 3).",
  };
  return m[moduleId] || "Пока нет данных.";
}
