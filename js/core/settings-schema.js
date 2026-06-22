/* Declarative settings schema, grouped by module section.
 *
 * Each section is a list of fields with type, default, label, and (optional)
 * validator/options. The Settings UI walks the schema and renders the
 * appropriate input, so adding a new field needs no UI code — only a new
 * entry here plus default value handling.
 *
 * Storage key: kv["settings"] continues to work; this module merely defines
 * the shape and provides default scaffolding for future modules.
 */

import { TEMPLATE_IDS, defaultWeeklyPlan } from "./templates.js";
import { defaultKeyPrefs } from "../data/keys-roster.js";

const ALL_TRAINING_MODES = [
  "degree_to_chord", "chord_to_degree", "feel_to_chord", "chord_to_feel",
  "ear_to_step", "ear_to_feel", "next_chord", "flashcards", "exam",
];

const TRAINING_MODE_LABELS = {
  degree_to_chord: "Ступень → аккорд",
  chord_to_degree: "Аккорд → ступень",
  feel_to_chord:   "Чувство → аккорд",
  chord_to_feel:   "Аккорд → чувство",
  ear_to_step:     "Слух → ступень",
  ear_to_feel:     "Слух → чувство",
  next_chord:      "Угадай следующий",
  flashcards:      "Карточки",
  exam:            "Экзамен",
};

export const SETTINGS_SECTIONS = Object.freeze([
  {
    id: "general",
    title: "Общие",
    fields: [
      { id: "dailyTarget",        type: "number",  label: "Цель на день (вопросов)", default: 15,  min: 5,   max: 200 },
      { id: "sessionDurationSec", type: "select",  label: "Длительность сессии по умолчанию",
        default: 300, options: [{ v: 180, label: "3 мин" }, { v: 300, label: "5 мин" }, { v: 600, label: "10 мин" }, { v: 900, label: "15 мин" }] },
      { id: "timbre",             type: "select",  label: "Тембр аудио",
        default: "piano", options: [{ v: "piano", label: "Piano-like (мягкий)" }, { v: "guitar", label: "Plucked / гитарный" }] },
    ],
  },
  {
    id: "theory",
    title: "Теория и слух",
    fields: [
      { id: "enabledModes", type: "multiselect", label: "Активные режимы тренажёра",
        default: ALL_TRAINING_MODES, options: ALL_TRAINING_MODES.map((id) => ({ v: id, label: TRAINING_MODE_LABELS[id] })) },
      { id: "feelingsOverridesEditable", type: "note", label: "Чувства аккордов редактируются ниже отдельным списком." },
    ],
  },
  {
    id: "improvisation",
    title: "Импровизация",
    fields: [
      { id: "defaultDurationSec", type: "select", label: "Длительность сессии",
        default: 300, options: [{ v: 180, label: "3 мин" }, { v: 300, label: "5 мин" }, { v: 600, label: "10 мин" }] },
      { id: "scaleType",          type: "select", label: "Тип шкалы",
        default: "minor_pentatonic",
        options: [{ v: "minor_pentatonic", label: "Минорная пентатоника" }, { v: "major_pentatonic", label: "Мажорная пентатоника" }] },
      { id: "backingLoop",        type: "bool",   label: "Аккомпанемент в цикле", default: true },
      { id: "showAnchors",        type: "bool",   label: "Подсвечивать опорные ноты аккорда", default: true },
    ],
  },
  {
    id: "covers",
    title: "Каверы",
    fields: [
      { id: "defaultDurationSec", type: "select", label: "Длительность кавер-сессии по умолчанию",
        default: 180, options: [{ v: 180, label: "3 мин" }, { v: 300, label: "5 мин" }, { v: 600, label: "10 мин" }, { v: 1200, label: "20 мин" }] },
      { id: "micDetectorEnabled", type: "bool", label: "Слушать микрофон во время сессии (детектор активности)", default: false },
      { id: "chordifyShortcut",   type: "bool", label: "Показывать кнопку Open in Chordify", default: true },
      { id: "alwaysAllowManual",  type: "note", label: "Кнопка «Я сыграл» доступна всегда, даже с включённым микрофоном." },
    ],
  },
  {
    id: "shapes",
    title: "Аппликатуры аккордов",
    fields: [
      { id: "enabledFamilies",   type: "multiselect", label: "Какие семейства аккордов учим",
        default: ["C", "Am", "Dm", "G", "F", "Em"],
        options: [
          { v: "C", label: "C / Cmaj7 / Cadd9" },
          { v: "Am", label: "Am / Am7 / Am(add9)" },
          { v: "Dm", label: "Dm / Dm7 / Dsus2" },
          { v: "G", label: "G / G7 / Gsus4" },
          { v: "F", label: "F / Fmaj7" },
          { v: "Em", label: "Em / Em7" },
        ] },
      { id: "enabledExtensions", type: "multiselect", label: "Какие расширения включить",
        default: ["maj7", "m7", "sus2", "sus4", "add9", "7"],
        options: [
          { v: "maj7", label: "maj7" }, { v: "m7", label: "m7" },
          { v: "sus2", label: "sus2" }, { v: "sus4", label: "sus4" },
          { v: "add9", label: "add9" }, { v: "7", label: "7" },
        ] },
    ],
  },
  {
    id: "newKeys",
    title: "Новые тональности",
    fields: [
      { id: "keyPrefs", type: "keyRoster", label: "Включи тональности для ротации, отметь любимые, спрячь ненужные",
        default: defaultKeyPrefs() },
      { id: "rotationPeriod", type: "select", label: "Период смены тональности",
        default: "week", options: [{ v: "day", label: "Каждый день" }, { v: "week", label: "Каждую неделю" }] },
    ],
  },
  {
    id: "schedule",
    title: "Расписание",
    fields: [
      { id: "weeklyPlan", type: "weeklyPlan", label: "Какой шаблон на какой день",
        default: defaultWeeklyPlan() },
      { id: "remindersHint", type: "note", label: "Реальные напоминания и .ics-экспорт настраиваются в разделе «Напоминания»." },
    ],
  },
  {
    id: "habits",
    title: "Привычки и Practice Score",
    fields: [
      { id: "scoredModules", type: "multiselect", label: "Какие модули учитываются в Practice Score",
        default: ["theory", "shapes", "improv", "cover", "newKeys"],
        options: [
          { v: "theory", label: "Теория и слух" }, { v: "shapes", label: "Аппликатуры" },
          { v: "improv", label: "Импровизация" }, { v: "cover", label: "Каверы" },
          { v: "newKeys", label: "Новые тональности" },
        ] },
      { id: "recoveryEnabled", type: "bool", label: "Включить Recovery Mode после 2+ дней пропуска", default: true },
    ],
  },
  {
    id: "purpleMode",
    title: "Purple Mode",
    fields: [
      { id: "pipeline", type: "multiselect", label: "Этапы pipeline",
        default: ["interval", "degree", "chord", "chordType"],
        options: [
          { v: "interval",  label: "Интервал" },  { v: "degree",    label: "Ступень" },
          { v: "chord",     label: "Аккорд" },    { v: "chordType", label: "Тип аккорда" },
        ] },
      { id: "adaptiveStepDown", type: "bool", label: "Автоматически упрощать pipeline при ошибках", default: true },
    ],
  },
]);

/** Walk the schema and produce a fully defaulted settings object. */
export function defaultSettings() {
  const out = {};
  for (const section of SETTINGS_SECTIONS) {
    out[section.id] = {};
    for (const f of section.fields) {
      if (f.default !== undefined) out[section.id][f.id] = f.default;
    }
  }
  // Reminders live outside the schema (existing complex shape).
  out.reminders = [{ hour: 9, minute: 30, daysMask: 0b1111111, label: "Утренняя сессия" }];
  return out;
}

/** Merge user-stored settings on top of defaults so new modules added later
 *  don't break for existing users. */
export function mergeSettings(stored) {
  const defaults = defaultSettings();
  if (!stored || typeof stored !== "object") return defaults;
  const out = JSON.parse(JSON.stringify(defaults));

  // ---- Backward compat: flat fields from the old settings shape. ----
  // The pre-Phase-1 settings file lived as a flat object with `dailyTarget`,
  // `sessionDurationSec`, `timbre`, `enabledModes`, `reminders` at the root.
  // Migrate any of those into the new nested sections.
  if (stored.dailyTarget        != null) out.general.dailyTarget        = stored.dailyTarget;
  if (stored.sessionDurationSec != null) out.general.sessionDurationSec = stored.sessionDurationSec;
  if (stored.timbre             != null) out.general.timbre             = stored.timbre;
  if (Array.isArray(stored.enabledModes))   out.theory.enabledModes     = stored.enabledModes;
  if (Array.isArray(stored.reminders))      out.reminders               = stored.reminders;

  // Modern nested form: shallow-merge each section.
  for (const section of SETTINGS_SECTIONS) {
    const s = stored[section.id];
    if (s && typeof s === "object") Object.assign(out[section.id], s);
  }
  if (Array.isArray(stored.reminders)) out.reminders = stored.reminders;
  return out;
}

export { ALL_TRAINING_MODES, TRAINING_MODE_LABELS };
