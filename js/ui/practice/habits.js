/* Habits (Привычки) — heatmap, per-module streaks, Practice Score trends.
 *
 * Reads kv["habit_logs"] and renders three blocks:
 *   1. Today Practice Score breakdown (same ring as practice-home, large).
 *   2. 12-week activity heatmap (any module counts).
 *   3. Per-module rows: streak, days-since-last, 7-day sessions.
 */

import { kvGet } from "../../core/store.js";
import { mergeSettings } from "../../core/settings-schema.js";
import {
  heatmap, todaySnapshot, moduleStreak, moduleHealth, HABIT_MODULES, MODULE_LABELS_RU,
} from "../../core/habits.js";
import { dailyScore, averageScore, scoreBreakdown } from "../../core/score.js";
import { el, card, btn, chip } from "../components.js";

export async function renderHabits({ container }) {
  const settings = mergeSettings(await kvGet("settings"));
  const logs = (await kvGet("habit_logs")) || {};
  const now = Date.now();
  const snap = todaySnapshot(logs, now);
  const todayLog = logs[snap.dayTs];
  const score = todayLog ? dailyScore(todayLog) : 0;
  const breakdown = scoreBreakdown(todayLog);
  const avg7  = averageScore(logs, 7, now);
  const avg30 = averageScore(logs, 30, now);
  const health = moduleHealth(logs, now);

  container.appendChild(el("h1", { text: "📈 Привычки" }));
  container.appendChild(el("p", { text: "Streaks, тепловая карта, динамика Practice Score." }));

  /* Today */
  container.appendChild(card(el("div", { class: "col", style: { gap: "10px" } },
    el("div", { class: "row between" },
      el("div", null,
        el("h3", { text: "Practice Score сегодня" }),
        el("h1", { text: String(score) }),
        el("p", { text: `Общий streak: ${snap.streak} дн.` }),
      ),
      bigRing(score),
    ),
    el("div", { class: "row", style: { gap: "8px" } },
      chip(`Ср. за 7 дн.: ${avg7}`, true),
      chip(`Ср. за 30 дн.: ${avg30}`, false),
    ),
    breakdownBars(breakdown),
  ), { practiceAccent: true }));

  /* Heatmap */
  container.appendChild(card(el("div", { class: "col" },
    el("h2", { text: "Активность (12 недель)" }),
    el("p", { class: "muted", text: "Каждая клетка — день. Цвет = количество сессий." }),
    heatmapSvg(heatmap(logs, 12, now)),
  )));

  /* Per-module rows */
  container.appendChild(card(el("div", { class: "col" },
    el("h2", { text: "По модулям" }),
    ...HABIT_MODULES.map((m) => moduleRow(m, snap, health, logs, now)),
  )));

  return null;
}

function moduleRow(moduleId, snap, health, logs, now) {
  const status = snap.moduleStatus[moduleId];
  const h = health[moduleId] || {};
  const streak = moduleStreak(logs, moduleId, now);
  return el("div", { class: "row between step-row" },
    el("div", null,
      el("div", { class: "chord", text: MODULE_LABELS_RU[moduleId] || moduleId }),
      el("div", { class: "meta", text: status.done
        ? `Сегодня • ${status.sessions} сессий`
        : (h.daysSinceLast >= 1 ? `Последний раз: ${h.daysSinceLast} дн. назад` : "Ещё не было"),
      }),
    ),
    el("div", { class: "right" },
      streak > 0 ? chip(`🔥 ${streak} дн.`, true) : chip("—", false),
      el("div", { style: { fontSize: "11px", color: "var(--fg-faint)", marginTop: "4px" }, text: `7 дн.: ${h.sessionsLast7 || 0}` }),
    ),
  );
}

function breakdownBars(rows) {
  if (!rows || !rows.length) return el("p", { text: "Сегодня ещё нет записей." });
  const list = el("div", { class: "col", style: { gap: "6px" } });
  for (const r of rows) {
    const pct = Math.max(0, Math.min(1, r.pts / r.max));
    list.appendChild(el("div", { class: "col", style: { gap: "4px" } },
      el("div", { class: "row between" },
        el("div", { style: { fontSize: "13px", color: "var(--fg-dim)" }, text: MODULE_LABELS_RU[r.moduleId] || r.moduleId }),
        el("div", { style: { fontSize: "13px", color: r.done ? "var(--accent-practice)" : "var(--fg-faint)" }, text: `${r.pts}/${r.max}` }),
      ),
      el("div", { class: "progress" }, el("div", { class: "bar", style: { width: `${pct * 100}%`, background: "var(--accent-practice)" } })),
    ));
  }
  return list;
}

function bigRing(score) {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const size = 110, stroke = 12, radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const off = circ * (1 - Math.min(1, Math.max(0, score / 100)));
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(size)); svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  const bg = document.createElementNS(SVG_NS, "circle");
  bg.setAttribute("cx", String(size / 2)); bg.setAttribute("cy", String(size / 2));
  bg.setAttribute("r", String(radius)); bg.setAttribute("fill", "none");
  bg.setAttribute("stroke", "var(--line)"); bg.setAttribute("stroke-width", String(stroke));
  const fg = document.createElementNS(SVG_NS, "circle");
  fg.setAttribute("cx", String(size / 2)); fg.setAttribute("cy", String(size / 2));
  fg.setAttribute("r", String(radius)); fg.setAttribute("fill", "none");
  fg.setAttribute("stroke", "var(--accent-practice)"); fg.setAttribute("stroke-width", String(stroke));
  fg.setAttribute("stroke-linecap", "round");
  fg.setAttribute("stroke-dasharray", String(circ));
  fg.setAttribute("stroke-dashoffset", String(off));
  fg.setAttribute("transform", `rotate(-90 ${size / 2} ${size / 2})`);
  svg.appendChild(bg); svg.appendChild(fg);
  const wrap = el("div", { style: { position: "relative", width: `${size}px`, height: `${size}px` } });
  wrap.appendChild(svg);
  wrap.appendChild(el("div", {
    style: { position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "800", fontSize: "30px", color: "var(--fg)" },
    text: String(score),
  }));
  return wrap;
}

function heatmapSvg(cells) {
  const cols = cells[0]?.length || 12;
  const wrap = el("div", { style: { display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "3px" } });
  // cells is rows[7][cols] but we want a square-ish grid of cols x 7
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < cols; col++) {
      const c = cells[row][col];
      const lvl = c.level;
      const bg = lvl === 0 ? "var(--bg-elev-2)"
        : lvl === 1 ? "rgba(124,92,255,0.22)"
        : lvl === 2 ? "rgba(124,92,255,0.42)"
        : lvl === 3 ? "rgba(124,92,255,0.65)"
        :              "rgba(124,92,255,0.92)";
      wrap.appendChild(el("div", { style: { aspectRatio: "1", borderRadius: "3px", background: bg, border: "1px solid var(--line)", gridColumn: String(col + 1), gridRow: String(row + 1) }, title: `${c.cnt} сессий` }));
    }
  }
  wrap.style.gridTemplateRows = "repeat(7, 1fr)";
  return wrap;
}
