/* Recovery Mode — detects missed days and offers a soft come-back path (§8).
 *
 * Trigger: 2+ consecutive days without any module activity.
 * Recovery session is a tiny 5-minute light template that always succeeds.
 * Tone: never blame, never count missed days as failure — frame as a
 * "welcome back" moment.
 */

import { HABIT_MODULES, dayActive } from "./habits.js";

const DAY = 86400000;

/** Returns the number of consecutive days BEFORE today that had no activity.
 *  0 means no gap (user practised yesterday).
 *  Counts only days before today — today itself is excluded so the UI doesn't
 *  congratulate someone in the morning before they've started. */
export function missedDayCount(logs, now = Date.now()) {
  const todayStart = (() => { const d = new Date(now); d.setHours(0,0,0,0); return d.getTime(); })();
  let cursor = todayStart - DAY;
  let missed = 0;
  // Cap at 90 days to keep things bounded.
  for (let i = 0; i < 90; i++) {
    const log = logs[cursor];
    if (dayActive(log)) break;
    missed += 1;
    cursor -= DAY;
  }
  return missed;
}

export function recoveryTriggered(logs, now = Date.now()) {
  return missedDayCount(logs, now) >= 2;
}

export const RECOVERY_TEMPLATE = Object.freeze({
  id: "recovery",
  name: "Возвращение",
  durationMin: 5,
  modules: ["theory", "improv"],
  mandatoryMinutesByModule: { theory: 2, improv: 1 },
  description: "Просто прикоснуться. Без подвига.",
});

const TONES = {
  short: "Никакой стыд. Просто 5 минут.",
  medium: "Несколько дней без сессии — пора вернуться. 5 минут — норм.",
  long: "Долго не было. Сделай маленький круг — он не должен болеть.",
};

export function recoveryTone(missed) {
  if (missed >= 7) return TONES.long;
  if (missed >= 4) return TONES.medium;
  return TONES.short;
}
