/* New Tonalities module — rotation of the day/week.
 *
 * Shows the currently-selected tonality, what's coming next, and a button to
 * jump straight into the training flow for that tonality. The roster itself
 * lives in Settings → "Новые тональности".
 */

import { kvGet, kvSet } from "../../core/store.js";
import { mergeSettings } from "../../core/settings-schema.js";
import { recordSession } from "../../core/habits.js";
import { currentTonality, nextTonalities } from "../../core/rotation.js";
import { resolveKeyRoster, activeKeys } from "../../data/keys-roster.js";
import { el, card, btn, chip, toast } from "../components.js";

export async function renderKeys({ container }) {
  const settings = mergeSettings(await kvGet("settings"));
  const cfg = settings.newKeys || {};
  const period = cfg.rotationPeriod || "week";
  const prefs = cfg.keyPrefs || {};
  const todayTon = currentTonality(prefs, period);
  const upcoming = nextTonalities(prefs, period, 5);
  const activeList = activeKeys(prefs);

  container.appendChild(el("h1", { text: "🌍 Новые тональности" }));
  container.appendChild(el("p", { text: "Выход за пределы C major / A minor. Ротация задаётся в настройках." }));

  /* Tonality of the period */
  container.appendChild(card(el("div", { class: "col", style: { gap: "10px" } },
    el("div", { class: "row between" },
      el("div", null,
        el("h3", { text: period === "day" ? "Тональность дня" : "Тональность недели" }),
        el("h1", { text: todayTon.russian || todayTon.id }),
        el("p", { text: `${todayTon.id} • ${todayTon.mode === "major" ? "мажор" : "минор"}${todayTon.relative ? ` • параллельная: ${todayTon.relative}` : ""}` }),
      ),
      chip(todayTon.favourite ? "★ Любимая" : "В ротации", true),
    ),
    el("div", { class: "btn-row" },
      btn("Открыть тренажёр", () => location.hash = `#/train/run?mode=mix&tonality=${todayTon.id === "C" || todayTon.id === "Am" ? todayTon.id : "Am"}&dur=300`,
        { primary: true, practiceAccent: true }),
      btn("Открыть карточку", () => location.hash = "#/tonalities"),
      btn("Записать как практику", async () => {
        const logs = (await kvGet("habit_logs")) || {};
        recordSession(logs, { module: "newKeys", durationSec: 300 });
        await kvSet("habit_logs", logs);
        toast("+1 сессия в Новые тональности");
      }, { practiceAccent: true }),
    ),
    (todayTon.id !== "C" && todayTon.id !== "Am") ? el("p", { class: "muted", text: "Полный тренажёр для этой тональности появится во второй итерации — пока тренируйся в Am, формулы те же." }) : null,
  ), { practiceAccent: true }));

  /* Upcoming */
  container.appendChild(card(el("div", { class: "col" },
    el("h2", { text: period === "day" ? "Дальше по дням" : "Дальше по неделям" }),
    el("div", { class: "col", style: { gap: "8px" } },
      ...upcoming.map((t, i) => el("div", { class: "row between step-row" },
        el("div", null,
          el("div", { class: "chord", text: t.id }),
          el("div", { class: "meta", text: `${t.russian || ""}` }),
        ),
        chip(period === "day" ? `+${i + 1} дн.` : `+${i + 1} нед.`),
      )),
    ),
  )));

  /* Full active roster */
  container.appendChild(card(el("div", { class: "col" },
    el("h2", { text: "В активной ротации" }),
    el("p", { text: `${activeList.length} тональностей включено` }),
    el("div", { class: "row", style: { flexWrap: "wrap", gap: "6px" } },
      ...activeList.map((k) => chip(`${k.id}${k.favourite ? " ★" : ""}`, k.favourite)),
    ),
    el("div", { class: "btn-row", style: { marginTop: "10px" } },
      btn("Управлять списком в Настройках", () => location.hash = "#/settings", { ghost: true }),
    ),
  )));

  return null;
}
