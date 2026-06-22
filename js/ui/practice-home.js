/* Главная — practice home / aggregator for all modules.
 *
 * Layout:
 *   1. Today card     — Practice Score ring + streak + total time today
 *   2. Recovery hint  — appears only if recovery is triggered (§8)
 *   3. Recommendations — daily recs from learning state (§18.10)
 *   4. Quick start    — instant 5-min mix
 *   5. Module grid    — card per module with done/sessions/next CTA
 *
 * Visual: existing screens use Tiffany accent (var(--accent)); the new module
 * grid uses a parallel "practice" purple token so the two systems coexist.
 */

import { kvGet, listAnswers } from "../core/store.js";
import { effectiveFeelings } from "../data/feelings.js";
import { mergeSettings } from "../core/settings-schema.js";
import { todaySnapshot, moduleHealth, MODULE_LABELS_RU } from "../core/habits.js";
import { dailyScore, scoreBreakdown, suggestNextModules } from "../core/score.js";
import { templateForDate } from "../core/templates.js";
import { recoveryTriggered, missedDayCount, recoveryTone } from "../core/recovery.js";
import { dailyRecommendations, habitRecommendations } from "../core/recommend.js";
import { conceptToHumanLabel } from "../core/concept.js";
import { el, card, btn, chip, greet, fmtPct } from "./components.js";

/* Module catalog: order, names, icons (text), target route, "ready" flag.
 * "ready: true" cards render as "Скоро" — Phase 2-5 will flip these. */
const MODULE_CARDS = [
  {
    id: "theory", icon: "♬", title: "Теория и слух",
    desc: "Тренажёр ступеней, аккордов, чувств. Тональности и прогрессии.",
    route: "#/train", ready: true,
  },
  {
    id: "improv", icon: "🎼", title: "Импровизация",
    desc: "Пентатоника. 3/5/10 минут с аккомпанементом.",
    route: "#/practice/improv", ready: true,
  },
  {
    id: "cover", icon: "🎤", title: "Кавер дня",
    desc: "Один трек. Chordify, таймер, опц. микрофон.",
    route: "#/practice/covers", ready: true,
  },
  {
    id: "shapes", icon: "✋", title: "Аппликатуры",
    desc: "Альтернативные позиции аккордов, расширения (maj7, m7, sus…).",
    route: "#/practice/shapes", ready: true,
  },
  {
    id: "newKeys", icon: "🌍", title: "Новые тональности",
    desc: "Выход из A minor / C major. Ротация и любимые тональности.",
    route: "#/practice/keys", ready: true,
  },
  {
    id: "schedule", icon: "📅", title: "Расписание",
    desc: "Когда заниматься, .ics для Календаря.",
    route: "#/practice/schedule", ready: true,
  },
  {
    id: "habits", icon: "📈", title: "Привычки",
    desc: "Streaks, heatmap, Practice Score за период.",
    route: "#/practice/habits", ready: true,
  },
  {
    id: "purpleMode", icon: "🟣", title: "Purple Mode",
    desc: "Deep mode: интервал → ступень → аккорд → тип.",
    route: "#/practice/purple", ready: true,
  },
];

export async function renderPracticeHome({ container }) {
  const settings = mergeSettings(await kvGet("settings"));
  const habitLogs = (await kvGet("habit_logs")) || {};
  const learningState = (await kvGet("learning_state")) || { concepts: {} };
  const feelings = effectiveFeelings(await kvGet("feelings_overrides"));
  const now = Date.now();

  const snap = todaySnapshot(habitLogs, now);
  const todayLog = habitLogs[snap.dayTs];
  const score = todayLog ? dailyScore(todayLog) : 0;
  const breakdown = scoreBreakdown(todayLog);
  const suggestNext = suggestNextModules(todayLog, 2);
  const planned = templateForDate(settings.schedule && settings.schedule.weeklyPlan);
  const health = moduleHealth(habitLogs, now);

  // Streak chip in the header.
  updateStreakPill(snap.streak);

  /* 1. Greeting + Today Practice Score card */
  container.appendChild(card(el("div", { class: "col", style: { gap: "12px" } },
    el("div", { class: "row between" },
      el("div", null,
        el("h3", { text: greet() + "." }),
        el("h1", { text: planned ? `Сегодня: ${planned.name}` : "Музыкальная сессия" }),
        el("p", { text: planned ? planned.description : "Любой быстрый круг лучше нуля." }),
      ),
      practiceRing(score),
    ),
    suggestNext.length ? el("p", { class: "muted", text: `Сейчас выгодно: ${suggestNext.map((m) => MODULE_LABELS_RU[m] || m).join(", ")}` }) : null,
  ), { practiceAccent: true }));

  /* 2. Recovery hint (only if triggered) */
  if (recoveryTriggered(habitLogs, now) && settings.habits && settings.habits.recoveryEnabled !== false) {
    const missed = missedDayCount(habitLogs, now);
    container.appendChild(card(el("div", { class: "col" },
      el("h3", { text: "Возвращение", style: { color: "var(--accent-practice)" } }),
      el("p", { text: recoveryTone(missed) }),
      btn("Лёгкая сессия 5 мин", () => location.hash = "#/train/run?mode=mix&tonality=Am&dur=300",
          { primary: true, practiceAccent: true }),
    ), { practiceAccent: true }));
  }

  /* 3. Recommendations from learning state */
  const recs = dailyRecommendations(learningState, { now, limit: 3 });
  const habitRecs = habitRecommendations(health, { limit: 2 });
  const allRecs = [...recs, ...habitRecs];
  if (allRecs.length) {
    container.appendChild(card(el("div", { class: "col" },
      el("h2", { text: "Сегодня стоит обратить внимание" }),
      ...allRecs.map((r) => el("div", { class: "row between" },
        el("div", { text: r.message }),
        chip(badgeFor(r.kind), false),
      )),
    )));
  }

  /* 4. Quick start */
  container.appendChild(card(el("div", { class: "col", style: { gap: "10px" } },
    el("div", { class: "row between" }, el("h2", { text: "Быстрый старт" })),
    el("div", { class: "btn-row" },
      btn("Микс 5 мин", () => location.hash = "#/train/run?mode=mix&tonality=Am&dur=300", { primary: true }),
      btn("Только ступени", () => location.hash = "#/train/run?mode=degree_to_chord&tonality=Am&dur=180"),
      btn("Только слух", () => location.hash = "#/train/run?mode=ear_to_step&tonality=Am&dur=180"),
    ),
  )));

  /* 5. Module grid */
  container.appendChild(el("h2", { text: "Модули практики" }));
  const grid = el("div", { class: "grid-2", style: { gap: "12px" } });
  for (const m of MODULE_CARDS) {
    grid.appendChild(moduleCard(m, snap, breakdown, health));
  }
  container.appendChild(grid);

  /* 6. Quick links to the bottom-of-page detail screens that no longer have
   *    their own tabs (Tonalities, Progressions). */
  container.appendChild(el("div", { class: "btn-row", style: { marginTop: "12px", justifyContent: "center" } },
    btn("Тональности →", () => location.hash = "#/tonalities", { ghost: true, small: true }),
    btn("Прогрессии →", () => location.hash = "#/progressions", { ghost: true, small: true }),
  ));

  return null;
}

/* ---------- Tiny helpers ---------- */

function updateStreakPill(streak) {
  const pill = document.getElementById("streakPill");
  if (!pill) return;
  pill.hidden = streak === 0;
  const v = document.getElementById("streakValue");
  if (v) v.textContent = `${streak} дн.`;
}

function badgeFor(kind) {
  return {
    "at-risk":   "Забывается",
    "weak":      "Слабое",
    "improving": "Растёт",
    "habit":     "Привычка",
  }[kind] || "—";
}

function moduleCard(meta, snap, breakdown, health) {
  const status = snap.moduleStatus[meta.id];
  const score  = (breakdown.find((b) => b.moduleId === meta.id) || {});
  const h      = health[meta.id] || {};

  let footer;
  if (status && status.done) {
    footer = chip(`✓ Сегодня · +${score.pts || 0}`, true);
  } else if (meta.ready) {
    const days = h.daysSinceLast;
    if (days == null || days >= 90) footer = chip("Открыть", false);
    else if (days <= 0) footer = chip("Готов сегодня", false);
    else footer = chip(`${days} дн. назад`, false);
  } else {
    footer = chip("Скоро", false);
  }

  const inner = el("div", { class: "col", style: { gap: "6px" } },
    el("div", { class: "row between" },
      el("h3", { text: `${meta.icon}  ${meta.title}` }),
      footer,
    ),
    el("p", { text: meta.desc }),
  );

  const onClick = meta.ready
    ? () => location.hash = meta.route
    : () => {}; // ignored; cursor stays default

  return card(inner, {
    tap: meta.ready,
    practiceAccent: true,
    attrs: meta.ready
      ? { onClick: onClick, role: "button", tabindex: "0", style: "cursor:pointer;" }
      : { "aria-disabled": "true", style: "opacity:0.55;cursor:default;" },
  });
}

/** Small SVG ring showing Practice Score 0..100. */
function practiceRing(score) {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const size = 72, stroke = 8, radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - Math.min(1, Math.max(0, score / 100)));
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  const bg = document.createElementNS(SVG_NS, "circle");
  bg.setAttribute("cx", String(size / 2));
  bg.setAttribute("cy", String(size / 2));
  bg.setAttribute("r", String(radius));
  bg.setAttribute("fill", "none");
  bg.setAttribute("stroke", "var(--line)");
  bg.setAttribute("stroke-width", String(stroke));
  const fg = document.createElementNS(SVG_NS, "circle");
  fg.setAttribute("cx", String(size / 2));
  fg.setAttribute("cy", String(size / 2));
  fg.setAttribute("r", String(radius));
  fg.setAttribute("fill", "none");
  fg.setAttribute("stroke", "var(--accent-practice)");
  fg.setAttribute("stroke-width", String(stroke));
  fg.setAttribute("stroke-linecap", "round");
  fg.setAttribute("stroke-dasharray", String(circ));
  fg.setAttribute("stroke-dashoffset", String(offset));
  fg.setAttribute("transform", `rotate(-90 ${size / 2} ${size / 2})`);
  svg.appendChild(bg); svg.appendChild(fg);
  const wrap = el("div", { style: { position: "relative", width: `${size}px`, height: `${size}px` } });
  wrap.appendChild(svg);
  wrap.appendChild(el("div", {
    style: { position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center",
             fontWeight: "800", fontSize: "20px", color: "var(--fg)" },
    text: String(score),
  }));
  return wrap;
}
