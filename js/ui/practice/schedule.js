/* Schedule (Расписание) module.
 *
 * Visualises the weekly plan and provides one-tap actions:
 *   - "Сегодняшний шаблон" → starts training for the planned template
 *   - "Скачать .ics" → exports the next 8 weeks for the user's Calendar app
 */

import { kvGet, kvSet } from "../../core/store.js";
import { mergeSettings } from "../../core/settings-schema.js";
import { TEMPLATES, templateForDate, defaultWeeklyPlan } from "../../core/templates.js";
import { recordSession } from "../../core/habits.js";
import { weeklyPlanToIcs, downloadIcs } from "../../core/ics.js";
import { el, card, btn, chip, toast } from "../components.js";

const DAY_LABELS = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];

export async function renderSchedule({ container }) {
  const settings = mergeSettings(await kvGet("settings"));
  const weeklyPlan = (settings.schedule && settings.schedule.weeklyPlan) || defaultWeeklyPlan();
  const today = new Date();
  const todayTpl = templateForDate(weeklyPlan, today);

  container.appendChild(el("h1", { text: "📅 Расписание" }));
  container.appendChild(el("p", { text: "Какой шаблон в какой день. Без насилия — расписание подсказывает, а не наказывает." }));

  /* Today */
  container.appendChild(card(el("div", { class: "col", style: { gap: "10px" } },
    el("h3", { text: "Сегодня" }),
    el("h1", { text: todayTpl ? todayTpl.name : "Свободный день" }),
    todayTpl ? el("p", { text: `${todayTpl.durationMin} мин · ${todayTpl.description}` }) : null,
    todayTpl ? el("div", { class: "row", style: { gap: "6px", flexWrap: "wrap" } },
      ...todayTpl.modules.map((m) => chip(moduleLabel(m), false)),
    ) : null,
    el("div", { class: "btn-row" },
      btn("Начать тренировку", () => location.hash = `#/train/run?mode=mix&tonality=Am&dur=${(todayTpl?.durationMin || 5) * 60}`,
        { primary: true, practiceAccent: true }),
      btn("Только Импровизация", () => location.hash = "#/practice/improv", { practiceAccent: true }),
    ),
  ), { practiceAccent: true }));

  /* Weekly plan grid */
  const days = el("div", { class: "col", style: { gap: "8px" } });
  for (let dow = 0; dow < 7; dow++) {
    const id = weeklyPlan[dow];
    const tpl = TEMPLATES[id];
    const isToday = today.getDay() === dow;
    days.appendChild(card(el("div", { class: "row between" },
      el("div", null,
        el("h3", { text: `${DAY_LABELS[dow]}${isToday ? " · сегодня" : ""}` }),
        el("p", { text: tpl ? `${tpl.name} · ${tpl.durationMin} мин` : "—" }),
      ),
      chip(tpl ? tpl.id : "—", isToday),
    ), { practiceAccent: isToday }));
  }
  container.appendChild(card(el("div", { class: "col" },
    el("h2", { text: "Неделя" }), days,
    el("p", { class: "muted", text: "Изменить — в Настройках → «Расписание»." }),
  )));

  /* ICS export */
  container.appendChild(card(el("div", { class: "col" },
    el("h2", { text: "В календарь" }),
    el("p", { text: "Сгенерировать .ics на ближайшие 8 недель — откроется в Apple Calendar / Google Calendar." }),
    el("div", { class: "btn-row" },
      btn("Скачать .ics", () => {
        const txt = weeklyPlanToIcs({ weeklyPlan, weeks: 8 });
        downloadIcs("music-trainer-plan.ics", txt);
        toast("Файл создан");
      }, { primary: true, practiceAccent: true }),
      btn("Записать сегодняшний шаблон в привычки", async () => {
        const tpl = templateForDate(weeklyPlan);
        if (!tpl) { toast("На сегодня нет шаблона"); return; }
        const logs = (await kvGet("habit_logs")) || {};
        const each = Math.max(60, Math.floor((tpl.durationMin * 60) / Math.max(1, tpl.modules.length)));
        for (const m of tpl.modules) recordSession(logs, { module: m, durationSec: each });
        await kvSet("habit_logs", logs);
        toast("Сегодняшний шаблон записан");
      }, { ghost: true }),
    ),
  )));

  return null;
}

function moduleLabel(id) {
  return ({
    theory: "Теория", shapes: "Аппликатуры", improv: "Импров",
    cover: "Кавер", newKeys: "Новые ключи", reading: "Чтение",
  })[id] || id;
}
