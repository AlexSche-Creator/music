/* Reminders module.
 *
 * iOS Safari ограничения:
 *   - Web Push требует установленной PWA (iOS 16.4+).
 *   - В фоне через `setTimeout` уведомлений не будет — вкладка должна жить.
 *   - Periodic Background Sync на iOS отсутствует.
 *
 * Стратегия:
 *   1. Если уведомления разрешены и страница открыта — мы планируем
 *      внутренние таймеры; они шлют postMessage в service worker, который
 *      показывает реальное уведомление.
 *   2. Если страница закрыта — fallback на .ics (Apple Calendar шлёт нативные
 *      напоминания) и/или deep-link Shortcuts.
 *   3. При запуске приложения мы всегда показываем мягкую плашку «время
 *      потренироваться», если по расписанию пора и сегодня ещё ничего не
 *      делали — это работает в любом случае.
 */

let timers = [];

export function notificationsSupported() {
  return typeof Notification !== "undefined";
}

export function permission() {
  return notificationsSupported() ? Notification.permission : "denied";
}

export async function requestPermission() {
  if (!notificationsSupported()) return "denied";
  try {
    const p = await Notification.requestPermission();
    return p;
  } catch {
    return "denied";
  }
}

/** Detect whether the page is running as an installed PWA. */
export function isStandalone() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
  if (navigator.standalone === true) return true; // iOS Safari "Add to Home Screen"
  return false;
}

/** Honest capability report for the Settings screen. */
export function reportCapabilities() {
  return {
    notifications: notificationsSupported(),
    permission: permission(),
    standalone: isStandalone(),
    serviceWorker: "serviceWorker" in navigator,
    periodicSync: "PeriodicSyncManager" in window,
    push: "PushManager" in window
  };
}

/** Schedule day-of-week reminders for HH:MM in local time.
 *  reminders: array of { hour, minute, daysMask } where daysMask is 7 bits, Sun=bit 0.
 *  This relies on the tab being alive — that is documented to the user.
 */
export function scheduleLocalReminders(reminders) {
  cancelLocalReminders();
  if (!Array.isArray(reminders) || !reminders.length) return;
  if (permission() !== "granted") return;

  for (const r of reminders) {
    const fire = nextOccurrence(r);
    if (!fire) continue;
    const ms = Math.max(0, fire - Date.now());
    const id = setTimeout(() => {
      sendReminderToSW(r.label || "Время потренироваться");
      // Re-arm for next day.
      scheduleLocalReminders(reminders);
    }, ms);
    timers.push(id);
  }
}

export function cancelLocalReminders() {
  for (const id of timers.splice(0)) clearTimeout(id);
}

function nextOccurrence(reminder, now = new Date()) {
  const mask = reminder.daysMask ?? 0b1111111;
  for (let i = 0; i < 8; i++) {
    const cand = new Date(now);
    cand.setDate(now.getDate() + i);
    cand.setHours(reminder.hour ?? 9, reminder.minute ?? 0, 0, 0);
    if (cand <= now) continue;
    const dow = cand.getDay(); // 0=Sun
    if (mask & (1 << dow)) return cand.getTime();
  }
  return null;
}

function sendReminderToSW(body) {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready.then((reg) => {
    if (reg.active) reg.active.postMessage({ type: "reminder", body });
    else if (notificationsSupported() && permission() === "granted") {
      new Notification("Время потренироваться", { body });
    }
  }).catch(() => {});
}

/* ---------- ICS export ---------- */
const ICS_DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function pad2(n) { return n < 10 ? "0" + n : String(n); }
function fmtLocal(dt) {
  return `${dt.getFullYear()}${pad2(dt.getMonth() + 1)}${pad2(dt.getDate())}T${pad2(dt.getHours())}${pad2(dt.getMinutes())}00`;
}

/** Build an .ics calendar with recurring events for the given reminders.
 *  Apple Calendar fires native local notifications for them on iPhone.
 */
export function buildIcs(reminders, summary = "Музыкальная тренировка") {
  const now = new Date();
  const uid0 = Math.random().toString(36).slice(2);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//music-trainer//RU",
    "CALSCALE:GREGORIAN"
  ];
  for (let i = 0; i < reminders.length; i++) {
    const r = reminders[i];
    const start = new Date(now);
    start.setHours(r.hour ?? 9, r.minute ?? 0, 0, 0);
    if (start <= now) start.setDate(start.getDate() + 1);
    const end = new Date(start.getTime() + 10 * 60 * 1000); // 10-минутная сессия
    const days = [];
    const mask = r.daysMask ?? 0b1111111;
    for (let d = 0; d < 7; d++) if (mask & (1 << d)) days.push(ICS_DAY_CODES[d]);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid0}-${i}@music-trainer`,
      `DTSTAMP:${fmtLocal(now)}`,
      `DTSTART:${fmtLocal(start)}`,
      `DTEND:${fmtLocal(end)}`,
      `SUMMARY:${summary}`,
      "DESCRIPTION:Короткая ежедневная сессия в музыкальном тренажёре.",
      `RRULE:FREQ=WEEKLY;BYDAY=${days.join(",")}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Время потренироваться",
      "TRIGGER:-PT0M",
      "END:VALARM",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/** Trigger a synthetic download for an .ics file (iOS surfaces the share sheet). */
export function downloadIcs(reminders) {
  const ics = buildIcs(reminders);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "music-trainer.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
