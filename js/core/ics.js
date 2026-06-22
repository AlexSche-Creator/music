/* Build an .ics (RFC 5545 minimal) calendar export from a weekly plan.
 *
 * One VEVENT per active weekday for the next `weeks` weeks. Times default to
 * the user's first reminder slot (or 09:30) and last `durationMin` minutes.
 */

import { TEMPLATES, defaultWeeklyPlan } from "./templates.js";

function pad(n) { return String(n).padStart(2, "0"); }

function fmtLocal(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

function fold(line) {
  if (line.length <= 75) return line;
  const chunks = [];
  for (let i = 0; i < line.length; i += 73) chunks.push((i === 0 ? "" : " ") + line.slice(i, i + 73));
  return chunks.join("\r\n");
}

function escapeText(s) {
  return String(s).replace(/[\\,;]/g, "\\$&").replace(/\n/g, "\\n");
}

export function weeklyPlanToIcs({
  weeklyPlan = defaultWeeklyPlan(),
  hour = 9,
  minute = 30,
  weeks = 8,
  startDate = new Date(),
  uidNs = "music-trainer",
} = {}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Music Trainer//RU",
    "CALSCALE:GREGORIAN",
  ];
  const today = new Date(startDate);
  today.setHours(0, 0, 0, 0);
  for (let w = 0; w < weeks; w++) {
    for (let dow = 0; dow < 7; dow++) {
      const id = weeklyPlan[dow];
      const tpl = TEMPLATES[id];
      if (!tpl) continue;
      const d = new Date(today);
      d.setDate(today.getDate() + w * 7 + ((dow - today.getDay() + 7) % 7));
      d.setHours(hour, minute, 0, 0);
      const end = new Date(d.getTime() + tpl.durationMin * 60000);
      const uid = `${uidNs}-${d.getTime()}@local`;
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${uid}`);
      lines.push(`DTSTAMP:${fmtLocal(new Date())}`);
      lines.push(`DTSTART:${fmtLocal(d)}`);
      lines.push(`DTEND:${fmtLocal(end)}`);
      lines.push(fold(`SUMMARY:${escapeText("🎸 " + tpl.name)}`));
      lines.push(fold(`DESCRIPTION:${escapeText(tpl.description)}`));
      lines.push("END:VEVENT");
    }
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/** Trigger a browser download for an .ics blob. */
export function downloadIcs(filename, icsText) {
  const blob = new Blob([icsText], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 300);
}
