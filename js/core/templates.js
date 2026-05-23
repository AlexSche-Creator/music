/* Day Templates — Light / Standard / Full presets the user can pick when
 * starting a session, plus assignment per weekday so the recommended template
 * is always one tap away.
 *
 * Each template defines:
 *   - durationMin: target session length
 *   - modules: which modules participate (mapped to HABIT_MODULES ids)
 *   - mandatoryMinutesByModule (optional): minimum minutes per module to
 *     count the template as "complete" for the day
 */

import { HABIT_MODULES } from "./habits.js";

export const TEMPLATES = Object.freeze({
  light: Object.freeze({
    id: "light",
    name: "Лёгкий день",
    durationMin: 10,
    modules: ["theory", "improv"],
    mandatoryMinutesByModule: { theory: 5, improv: 3 },
    description: "Короткий ритм-чек. Лучше, чем ничего.",
  }),
  standard: Object.freeze({
    id: "standard",
    name: "Стандартный день",
    durationMin: 20,
    modules: ["theory", "improv", "cover"],
    mandatoryMinutesByModule: { theory: 10, improv: 5 },
    description: "Сбалансированная сессия с кавером.",
  }),
  full: Object.freeze({
    id: "full",
    name: "Полный день",
    durationMin: 40,
    modules: ["theory", "shapes", "improv", "cover", "newKeys"],
    mandatoryMinutesByModule: { theory: 15, improv: 10 },
    description: "Глубокая практика по всем фронтам.",
  }),
});

export const TEMPLATE_IDS = ["light", "standard", "full"];

/** Default weekday → template assignment.
 *  weekdays: 0=Sun, 1=Mon, ... 6=Sat to mirror JS Date.getDay(). */
export function defaultWeeklyPlan() {
  return {
    0: "standard",
    1: "standard",
    2: "standard",
    3: "standard",
    4: "standard",
    5: "light",
    6: "full",
  };
}

export function getTemplate(templateId) {
  return TEMPLATES[templateId] || null;
}

/** Get the template recommended for a given date based on a weekly plan. */
export function templateForDate(weeklyPlan, date = new Date()) {
  const dow = date.getDay();
  const id = (weeklyPlan && weeklyPlan[dow]) || defaultWeeklyPlan()[dow];
  return getTemplate(id);
}

/** Did the user fulfil the template requirements today?
 *  Returns { complete: bool, missingModules: string[], coveredMinutes: number }. */
export function evaluateCompletion(template, todayLog) {
  if (!template || !todayLog) {
    return { complete: false, missingModules: [], coveredMinutes: 0 };
  }
  const missing = [];
  let coveredSec = 0;
  for (const m of template.modules) {
    const mod = todayLog.modules[m];
    const minSec = (template.mandatoryMinutesByModule && template.mandatoryMinutesByModule[m] * 60) || 0;
    if (!mod || !mod.done || mod.totalDurationSec < minSec) missing.push(m);
    if (mod) coveredSec += mod.totalDurationSec;
  }
  return {
    complete: missing.length === 0,
    missingModules: missing,
    coveredMinutes: Math.round(coveredSec / 60),
  };
}

/** Suggest a template now — falls back to "light" if the planned one would
 *  be too much given today's remaining wall-clock budget. */
export function suggestTemplateNow({ weeklyPlan, minutesAvailable = 30, now = new Date() }) {
  const planned = templateForDate(weeklyPlan, now);
  if (!planned) return TEMPLATES.light;
  if (minutesAvailable >= planned.durationMin) return planned;
  if (minutesAvailable >= TEMPLATES.standard.durationMin) return TEMPLATES.standard;
  return TEMPLATES.light;
}

export { HABIT_MODULES };
