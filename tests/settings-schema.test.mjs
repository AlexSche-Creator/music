/* Tests for js/core/settings-schema.js — schema defaults and migration. */
import assert from "node:assert/strict";
import { SETTINGS_SECTIONS, defaultSettings, mergeSettings } from "../js/core/settings-schema.js";

let failed = 0;
function t(name, fn) {
  try { fn(); console.log("✓", name); }
  catch (e) { failed++; console.error("✗", name, "\n   ", e.message); }
}

t("SETTINGS_SECTIONS has expected sections", () => {
  const ids = SETTINGS_SECTIONS.map((s) => s.id);
  assert.ok(ids.includes("general"));
  assert.ok(ids.includes("theory"));
  assert.ok(ids.includes("improvisation"));
  assert.ok(ids.includes("covers"));
  assert.ok(ids.includes("shapes"));
  assert.ok(ids.includes("newKeys"));
  assert.ok(ids.includes("schedule"));
  assert.ok(ids.includes("habits"));
  assert.ok(ids.includes("purpleMode"));
});

t("defaultSettings produces a nested object per section", () => {
  const s = defaultSettings();
  assert.equal(s.general.dailyTarget, 15);
  assert.equal(s.general.timbre, "piano");
  assert.equal(s.covers.micDetectorEnabled, false);
  assert.ok(Array.isArray(s.reminders));
});

t("mergeSettings: empty input falls back to defaults", () => {
  const s = mergeSettings(null);
  assert.equal(s.general.dailyTarget, 15);
});

t("mergeSettings: migrates the old flat shape from Phase 0 users", () => {
  const old = {
    dailyTarget: 25,
    sessionDurationSec: 600,
    timbre: "guitar",
    enabledModes: ["degree_to_chord", "ear_to_step"],
    reminders: [{ hour: 8, minute: 0, daysMask: 0b1111111, label: "Утро" }],
  };
  const s = mergeSettings(old);
  assert.equal(s.general.dailyTarget, 25);
  assert.equal(s.general.sessionDurationSec, 600);
  assert.equal(s.general.timbre, "guitar");
  assert.deepEqual(s.theory.enabledModes, ["degree_to_chord", "ear_to_step"]);
  assert.equal(s.reminders[0].label, "Утро");
});

t("mergeSettings: preserves modern nested values and fills in missing sections", () => {
  const stored = {
    general: { dailyTarget: 7 },
    covers:  { micDetectorEnabled: true },
  };
  const s = mergeSettings(stored);
  assert.equal(s.general.dailyTarget, 7);
  assert.equal(s.general.timbre, "piano");        // default kept
  assert.equal(s.covers.micDetectorEnabled, true);
  assert.equal(s.covers.defaultDurationSec, 180); // default kept
  assert.ok(s.newKeys);                            // newly added section present
});

t("each section field has an id and label", () => {
  for (const section of SETTINGS_SECTIONS) {
    for (const f of section.fields) {
      assert.ok(f.id, `section ${section.id} field missing id`);
      assert.ok(f.label, `section ${section.id} field ${f.id} missing label`);
    }
  }
});

if (failed > 0) { console.error(`\n${failed} failed`); process.exit(1); }
else console.log("\nall settings-schema tests passed");
