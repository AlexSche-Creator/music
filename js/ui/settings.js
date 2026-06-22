/* Settings — schema-driven, one section per module.
 *
 * Reads the declarative SETTINGS_SECTIONS from core/settings-schema.js and
 * renders each section as a card with the right inputs. Saving any field
 * persists the whole merged settings object via kvSet("settings", ...).
 *
 * Special hand-written sections that don't fit the generic schema:
 *   - Reminders (existing complex reminder list + .ics export)
 *   - Feelings per chord per tonality (existing free-text editor)
 *   - New Tonalities key roster (type: "keyRoster")
 *   - Weekly plan (type: "weeklyPlan")
 *   - Data (export/import/reset)
 */

import { TONALITIES } from "../data/tonalities.js";
import { DEFAULT_FEELINGS, effectiveFeelings } from "../data/feelings.js";
import { kvGet, kvSet, exportAll, importAll, clearAll } from "../core/store.js";
import { reportCapabilities, requestPermission, scheduleLocalReminders, downloadIcs } from "../core/reminders.js";
import { setTimbre, unlock, playChord } from "../core/audio.js";
import { SETTINGS_SECTIONS, mergeSettings } from "../core/settings-schema.js";
import { KEY_ROSTER, defaultKeyPrefs } from "../data/keys-roster.js";
import { TEMPLATE_IDS, getTemplate } from "../core/templates.js";
import { el, card, btn, chip, toast } from "./components.js";

const WEEKDAY_LABELS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

export async function renderSettings({ container }) {
  const stored = await kvGet("settings");
  const settings = mergeSettings(stored);
  const overrides = (await kvGet("feelings_overrides")) || {};
  const caps = reportCapabilities();

  container.appendChild(el("h1", { text: "Настройки" }));

  const save = async () => { await kvSet("settings", settings); };

  // ---- Render each schema-driven section. ----
  for (const section of SETTINGS_SECTIONS) {
    container.appendChild(renderSection(section, settings, save));
    // Sub-sections that piggyback on the parent module visually.
    if (section.id === "theory") container.appendChild(renderFeelingsEditor(overrides));
    if (section.id === "general") container.appendChild(renderReminders(settings, caps, save));
  }

  // ---- Data section (export/import/reset). ----
  container.appendChild(card(el("div", { class: "col" },
    el("h2", { text: "Данные" }),
    el("div", { class: "btn-row" },
      btn("Экспорт JSON", async () => {
        const data = await exportAll();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "music-trainer.json";
        document.body.appendChild(a); a.click(); a.remove();
      }),
      btn("Импорт JSON", () => {
        const input = document.createElement("input");
        input.type = "file"; input.accept = "application/json";
        input.onchange = async () => {
          const f = input.files && input.files[0];
          if (!f) return;
          try {
            const txt = await f.text();
            await importAll(JSON.parse(txt));
            toast("Импортировано");
          } catch (e) { toast("Не удалось: " + e.message); }
        };
        input.click();
      }, { ghost: true }),
      btn("Сбросить всё", async () => {
        if (!confirm("Удалить всю историю и настройки?")) return;
        await clearAll();
        toast("Удалено");
        location.hash = "#/dashboard";
      }, { ghost: true }),
    ),
    el("p", { text: "Прогресс хранится только в браузере. iOS может очистить хранилище, если приложением не пользоваться неделями." }),
  )));

  return null;
}

/* ---------- Schema-driven section renderer ---------- */
function renderSection(section, settings, save) {
  const bucket = settings[section.id] = settings[section.id] || {};
  const body = el("div", { class: "col" }, el("h2", { text: section.title }));

  for (const f of section.fields) {
    body.appendChild(renderField(f, bucket, save, section));
  }
  return card(body);
}

function renderField(f, bucket, save, section) {
  switch (f.type) {
    case "number":      return fieldNumber(f, bucket, save);
    case "select":      return fieldSelect(f, bucket, save, section);
    case "multiselect": return fieldMultiselect(f, bucket, save);
    case "bool":        return fieldBool(f, bucket, save);
    case "note":        return fieldNote(f);
    case "keyRoster":   return fieldKeyRoster(f, bucket, save);
    case "weeklyPlan":  return fieldWeeklyPlan(f, bucket, save);
    default:            return el("div", { text: `Неизвестный тип поля: ${f.type}` });
  }
}

function fieldNumber(f, bucket, save) {
  const val = bucket[f.id] != null ? bucket[f.id] : f.default;
  return el("div", { class: "field" },
    el("label", { text: f.label }),
    el("input", {
      type: "text", inputmode: "numeric", value: String(val),
      onChange: (e) => {
        const v = parseInt(e.target.value, 10);
        if (Number.isNaN(v)) return;
        bucket[f.id] = clamp(v, f.min || 0, f.max || 999999);
        save();
      },
    }),
  );
}

function fieldSelect(f, bucket, save, section) {
  const val = bucket[f.id] != null ? bucket[f.id] : f.default;
  const sel = el("select", {
    onChange: async (e) => {
      const raw = e.target.value;
      const coerced = f.options.some((o) => typeof o.v === "number") ? Number(raw) : raw;
      bucket[f.id] = coerced;
      save();
      // Live preview for timbre.
      if (section && section.id === "general" && f.id === "timbre") {
        setTimbre(coerced);
        try { await unlock(); playChord("Am", { duration: 1.2 }); } catch {}
      }
    },
  },
    ...f.options.map((o) => el("option", { value: String(o.v), selected: String(o.v) === String(val) ? "selected" : null }, o.label)),
  );
  return el("div", { class: "field" }, el("label", { text: f.label }), sel);
}

function fieldMultiselect(f, bucket, save) {
  const set = new Set(Array.isArray(bucket[f.id]) ? bucket[f.id] : f.default);
  const wrap = el("div", { class: "col", style: { gap: "6px" } },
    el("label", { text: f.label, style: { fontSize: "13px", color: "var(--fg-dim)", fontWeight: "600" } }),
  );
  for (const o of f.options) {
    const sw = el("div", { class: "switch", style: { paddingTop: "8px", paddingBottom: "8px" } },
      el("div", null,
        el("div", { class: "title", text: o.label }),
      ),
      el("button", {
        class: `toggle${set.has(o.v) ? " on" : ""}`,
        "aria-pressed": set.has(o.v) ? "true" : "false",
        onClick: (ev) => {
          if (set.has(o.v)) set.delete(o.v); else set.add(o.v);
          bucket[f.id] = [...set];
          ev.currentTarget.classList.toggle("on");
          save();
        },
      }),
    );
    wrap.appendChild(sw);
  }
  return wrap;
}

function fieldBool(f, bucket, save) {
  const on = bucket[f.id] != null ? !!bucket[f.id] : !!f.default;
  return el("div", { class: "switch" },
    el("div", null, el("div", { class: "title", text: f.label })),
    el("button", {
      class: `toggle${on ? " on" : ""}`,
      "aria-pressed": on ? "true" : "false",
      onClick: (ev) => {
        bucket[f.id] = !bucket[f.id];
        ev.currentTarget.classList.toggle("on");
        save();
      },
    }),
  );
}

function fieldNote(f) {
  return el("p", { class: "muted", text: f.label, style: { fontSize: "13px", color: "var(--fg-dim)" } });
}

function fieldKeyRoster(f, bucket, save) {
  const prefs = bucket[f.id] = { ...defaultKeyPrefs(), ...(bucket[f.id] || {}) };
  const wrap = el("div", { class: "col", style: { gap: "6px" } },
    el("label", { text: f.label, style: { fontSize: "13px", color: "var(--fg-dim)", fontWeight: "600" } }),
  );
  const grid = el("div", { class: "col", style: { gap: "4px", marginTop: "6px" } });
  for (const k of KEY_ROSTER) {
    const p = prefs[k.id] = prefs[k.id] || { active: false, favourite: false, hidden: false };
    const row = el("div", { class: "step-row", style: { gridTemplateColumns: "auto 1fr auto auto auto" } },
      el("div", { class: "deg", text: k.mode === "major" ? "♭" : "♯", style: { fontSize: "14px", width: "24px" } }),
      el("div", null,
        el("div", { class: "chord", text: k.russian, style: { fontSize: "15px" } }),
        el("div", { class: "meta", text: `${k.name} · родственная ${k.relative}` }),
      ),
      tinyToggle(p.active,    "Учу",     (on) => { p.active = on;    save(); }),
      tinyToggle(p.favourite, "★",       (on) => { p.favourite = on; save(); }),
      tinyToggle(p.hidden,    "Скрыть",  (on) => { p.hidden = on;    save(); }),
    );
    grid.appendChild(row);
  }
  wrap.appendChild(grid);
  return wrap;
}

function tinyToggle(initial, label, onChange) {
  return el("button", {
    class: `btn small${initial ? " primary" : " ghost"}`,
    text: label,
    onClick: (ev) => {
      const now = !ev.currentTarget.classList.contains("primary");
      ev.currentTarget.classList.toggle("primary", now);
      ev.currentTarget.classList.toggle("ghost", !now);
      onChange(now);
    },
  });
}

function fieldWeeklyPlan(f, bucket, save) {
  const plan = bucket[f.id] = { ...(bucket[f.id] || {}) };
  const wrap = el("div", { class: "col", style: { gap: "6px" } },
    el("label", { text: f.label, style: { fontSize: "13px", color: "var(--fg-dim)", fontWeight: "600" } }),
  );
  for (let d = 0; d < 7; d++) {
    const currentId = plan[d] || "standard";
    const row = el("div", { class: "step-row", style: { gridTemplateColumns: "60px 1fr auto" } },
      el("div", { class: "deg", text: WEEKDAY_LABELS[d], style: { fontSize: "16px", width: "60px", color: "var(--fg)" } }),
      el("div", null,
        el("div", { class: "chord", text: getTemplate(currentId) ? getTemplate(currentId).name : currentId }),
        el("div", { class: "meta", text: getTemplate(currentId) ? `${getTemplate(currentId).durationMin} мин · ${getTemplate(currentId).modules.join(", ")}` : "" }),
      ),
      el("select", {
        onChange: (e) => { plan[d] = e.target.value; save(); },
      }, ...TEMPLATE_IDS.map((id) => el("option", {
        value: id, selected: id === currentId ? "selected" : null,
      }, getTemplate(id) ? getTemplate(id).name : id))),
    );
    wrap.appendChild(row);
  }
  return wrap;
}

/* ---------- Hand-written sections (kept for backward compat & richness) ---------- */

function renderFeelingsEditor(overrides) {
  const merged = effectiveFeelings(overrides);
  const body = el("div", { class: "col" }, el("h2", { text: "Мои чувства" }),
    el("p", { text: "Каждый аккорд можно подписать своей эмоцией. Это твоя личная карта." }),
  );
  for (const tid of Object.keys(TONALITIES)) {
    body.appendChild(el("h3", { text: TONALITIES[tid].russian }));
    for (const chord of TONALITIES[tid].chordsByTonality[tid]) {
      const val = (merged[tid] && merged[tid][chord]) || "";
      const def = DEFAULT_FEELINGS[tid] && DEFAULT_FEELINGS[tid][chord] || "";
      const row = el("div", { class: "field" },
        el("label", { text: `${chord} (${stepName(tid, chord)})` }),
        el("input", {
          type: "text", value: val, placeholder: def,
          onChange: async (e) => {
            overrides[tid] = overrides[tid] || {};
            if (!e.target.value || e.target.value === def) delete overrides[tid][chord];
            else overrides[tid][chord] = e.target.value;
            await kvSet("feelings_overrides", overrides);
            toast("Сохранено");
          },
        }),
      );
      body.appendChild(row);
    }
  }
  body.appendChild(btn("Сбросить чувства к умолчаниям", async () => {
    await kvSet("feelings_overrides", {});
    toast("Готово");
    location.hash = "#/settings";
    setTimeout(() => location.reload(), 300);
  }, { ghost: true }));
  return card(body);
}

function renderReminders(settings, caps, save) {
  const body = el("div", { class: "col" }, el("h2", { text: "Напоминания" }));
  body.appendChild(el("p", { text: capabilitiesNote(caps) }));
  const list = el("div", { class: "col", style: { marginTop: "8px" } });
  function repaint() {
    list.innerHTML = "";
    settings.reminders = settings.reminders || [];
    settings.reminders.forEach((r, i) => {
      const time = pad2(r.hour) + ":" + pad2(r.minute);
      list.appendChild(el("div", { class: "step-row" },
        el("div", { class: "deg", text: "⏰" }),
        el("div", null,
          el("input", { type: "time", value: time, onChange: (e) => {
            const [h, m] = e.target.value.split(":").map(Number);
            r.hour = h; r.minute = m; save(); scheduleIfAllowed();
          }}),
          el("div", { class: "meta", text: r.label || "Сессия" }),
        ),
        btn("Удалить", () => {
          settings.reminders.splice(i, 1); save(); scheduleIfAllowed(); repaint();
        }, { small: true, ghost: true }),
      ));
    });
  }
  repaint();
  body.appendChild(list);
  body.appendChild(el("div", { class: "btn-row" },
    btn("Добавить", () => {
      settings.reminders.push({ hour: 19, minute: 0, daysMask: 0b1111111, label: "Вечерняя сессия" });
      save(); scheduleIfAllowed(); repaint();
    }),
    btn(caps.permission === "granted" ? "Разрешение есть" : "Запросить уведомления", async () => {
      const p = await requestPermission();
      toast(p === "granted" ? "Разрешено" : (p === "denied" ? "Запрещено" : "Не сейчас"));
      scheduleIfAllowed();
    }, { primary: caps.permission !== "granted", attrs: caps.permission === "granted" ? { disabled: "disabled" } : {} }),
    btn("Скачать .ics", () => downloadIcs(settings.reminders || []), { ghost: true }),
  ));

  function scheduleIfAllowed() {
    if (reportCapabilities().permission === "granted") {
      scheduleLocalReminders(settings.reminders || []);
    }
  }
  return card(body);
}

function stepName(tid, chord) {
  const ton = TONALITIES[tid];
  const idx = ton.chordsByTonality[tid].indexOf(chord);
  return ton.steps[idx] && ton.steps[idx].roman || "";
}
function pad2(n) { return n < 10 ? "0" + n : String(n); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, +v || 0)); }
function capabilitiesNote(caps) {
  const out = [];
  if (!caps.notifications) out.push("Этот браузер не поддерживает уведомления.");
  if (!caps.standalone) out.push("Чтобы push работал на iPhone, добавь приложение на главный экран.");
  if (caps.notifications && caps.permission !== "granted") out.push("Уведомления выключены — можно разрешить ниже.");
  if (caps.notifications && caps.permission === "granted" && caps.standalone) out.push("Работают, пока вкладка активна. В фоне iOS их не доставит.");
  out.push("Для надёжных напоминаний используй .ics — Календарь iOS пошлёт нативное.");
  return out.join(" ");
}
