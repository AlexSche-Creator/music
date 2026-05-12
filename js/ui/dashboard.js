import { TONALITIES } from "../data/tonalities.js";
import { kvGet, listAnswers } from "../core/store.js";
import { perDay, summarize, currentStreak, accuracyByMode, hardestByField, strongestByField } from "../core/stats.js";
import { effectiveFeelings } from "../data/feelings.js";
import { el, card, btn, greet, fmtPct, weekBars, chip } from "./components.js";

function pickTonalityOfTheDay() {
  const day = Math.floor(Date.now() / 86400000);
  return day % 2 === 0 ? "C" : "Am";
}

export async function renderDashboard({ container }) {
  const settings = (await kvGet("settings")) || {};
  const lastSession = await kvGet("last_session_ts");
  const todayStart = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
  const last7 = await listAnswers({ sinceTs: Date.now() - 7 * 86400000 });
  const todayAnswers = last7.filter((a) => a.ts >= todayStart);
  const todaySum = summarize(todayAnswers);
  const streak = currentStreak(last7);
  const weekData = perDay(last7, 7);
  const modeAcc = accuracyByMode(last7);
  const tonalityToday = settings.tonalityOfTheDay || pickTonalityOfTheDay();
  const target = settings.dailyTarget ?? 15;

  // Strongest / weakest from a bigger window for stability.
  const last30 = await listAnswers({ sinceTs: Date.now() - 30 * 86400000 });
  const strongest = strongestByField(last30, "itemKey", 1)[0];
  const hardest = hardestByField(last30, "itemKey", 1)[0];

  const feelings = effectiveFeelings(await kvGet("feelings_overrides"));

  // Streak pill
  const streakPill = document.getElementById("streakPill");
  if (streakPill) {
    streakPill.hidden = streak === 0;
    const val = document.getElementById("streakValue");
    if (val) val.textContent = `${streak} дн.`;
  }

  // Greeting card
  container.appendChild(card(el("div", { class: "col" },
    el("h3", { text: greet() + "." }),
    el("h1", { text: "Сегодня тренируем " + (TONALITIES[tonalityToday]?.russian ?? tonalityToday) }),
    el("p", { text: `Цель — ${target} вопросов или короткая сессия.` })
  )));

  // Quick start
  const quick = card(el("div", { class: "col", style: { gap: "12px" } },
    el("div", { class: "row between" },
      el("h2", { text: "Быстрый старт" }),
      chip(`${todaySum.total}/${target} сегодня`, todaySum.total >= target)
    ),
    el("div", { class: "btn-row" },
      btn("Смешанная сессия 5 мин", () => location.hash = `#/train/run?mode=mix&tonality=${tonalityToday}&dur=300`, { primary: true }),
      btn("Только ступени", () => location.hash = `#/train/run?mode=degree_to_chord&tonality=${tonalityToday}&dur=180`),
      btn("Только слух", () => location.hash = `#/train/run?mode=ear_to_step&tonality=${tonalityToday}&dur=180`)
    )
  ));
  container.appendChild(quick);

  // Stats tiles
  container.appendChild(el("div", { class: "grid-3" },
    statTile("Точность", fmtPct(todaySum.accuracy), "сегодня"),
    statTile("Серия", `${streak} дн.`, "подряд"),
    statTile("Ответов", String(todaySum.total), "за день")
  ));

  // Week chart
  container.appendChild(card(el("div", { class: "col" },
    el("div", { class: "row between" }, el("h2", { text: "Неделя" }), chip(`${last7.length} ответов`)),
    weekBars(weekData)
  )));

  // My musical profile
  const profile = el("div", { class: "col" },
    el("h2", { text: "Мой музыкальный профиль" }),
    profileLine(strongest, "лучше всего узнаёшь", feelings, "ok"),
    profileLine(hardest,  "сложнее всего даётся", feelings, "bad"),
    el("p", { class: "muted",
      text: "Тренажёр учится с тобой: чаще покажет то, что путаешь, и мягко поднимет на ноги слабые места." })
  );
  container.appendChild(card(profile));

  // Quick links to other screens
  container.appendChild(el("div", { class: "grid-2" },
    cardLink("Тональности", "карточки ступеней и аккордов", "#/tonalities"),
    cardLink("Прогрессии", "I–V–vi–IV, ii–V–I и др.", "#/progressions"),
    cardLink("Статистика", "тренды, heatmap, слабые места", "#/stats"),
    cardLink("Настройки", "напоминания, тембр, чувства", "#/settings")
  ));

  if (lastSession) {
    container.appendChild(el("p", { class: "muted", style: { textAlign: "center", marginTop: "8px" },
      text: `Последняя сессия — ${new Date(lastSession).toLocaleString("ru-RU")}` }));
  }
  return null;
}

function statTile(k, v, sub) {
  return el("div", { class: "stat" },
    el("div", { class: "v", text: v }),
    el("div", { class: "k", text: k }),
    sub ? el("div", { class: "k", style: { marginTop: "4px" }, text: sub }) : null
  );
}

function profileLine(row, label, feelings, kind) {
  if (!row) return el("p", { text: `Пока мало данных — нужно ${kind === "ok" ? "ещё несколько правильных ответов" : "ещё немного ошибок"}.` });
  const key = row.key;
  const human = humanizeItemKey(key, feelings);
  return el("div", { class: "row between" },
    el("div", null, el("strong", { text: human }), el("div", { class: "k", text: label, style: { marginTop: "2px" } })),
    chip(kind === "ok" ? fmtPct(row.correctRate ?? 0) : fmtPct(row.errorRate ?? 0), kind === "ok")
  );
}

function humanizeItemKey(key, feelings) {
  // itemKey forms (we use simple stable strings throughout the app):
  //   chord:Am | step:C:5 | feel:Am:Am | seq:I-V-vi-IV
  const [k, ...rest] = key.split(":");
  if (k === "chord") return rest[0];
  if (k === "step") return `${rest[0]} · ступень ${rest[1]}`;
  if (k === "feel") {
    const t = rest[0], c = rest[1];
    return `«${feelings[t]?.[c] ?? c}»`;
  }
  if (k === "seq") return rest[0];
  return key;
}

function cardLink(title, sub, href) {
  return card(el("div", { class: "col" },
    el("h3", { text: title }),
    el("p", { text: sub })
  ), { tap: true, attrs: { "data-route": href } });
}
