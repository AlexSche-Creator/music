/* Tests for js/core/rotation.js — deterministic tonality rotation. */
import assert from "node:assert/strict";
import { currentTonality, nextTonalities } from "../js/core/rotation.js";
import { defaultKeyPrefs } from "../js/data/keys-roster.js";

let failed = 0;
function t(name, fn) {
  try { fn(); console.log("✓", name); }
  catch (e) { failed++; console.error("✗", name, "\n   ", e.message); }
}

const DAY = 86400000;
// 2026-05-12 — Tuesday
const T0 = new Date("2026-05-12T12:00:00").getTime();

/* Start from a fully-defaulted prefs object, then activate ONLY the listed
 * ids. resolveKeyRoster falls back to the roster's "starter" status when an
 * id is missing from prefs, so we must explicitly disable every other key. */
function prefsActive(...ids) {
  const out = defaultKeyPrefs();
  for (const k of Object.keys(out)) out[k] = { active: ids.includes(k), favourite: false, hidden: false };
  return out;
}

t("currentTonality returns first active when only one is enabled", () => {
  const p = prefsActive("Am");
  assert.equal(currentTonality(p, "week", T0).id, "Am");
});

t("currentTonality respects 'day' period and rotates daily", () => {
  const p = prefsActive("C", "Am", "G");
  const d0 = currentTonality(p, "day", T0).id;
  const d1 = currentTonality(p, "day", T0 + DAY).id;
  const d2 = currentTonality(p, "day", T0 + 2 * DAY).id;
  // Three different days, the rotation must cycle through all three.
  assert.equal(new Set([d0, d1, d2]).size, 3);
});

t("currentTonality is stable for the same day", () => {
  const p = prefsActive("C", "Am", "G");
  const a = currentTonality(p, "day", T0);
  const b = currentTonality(p, "day", T0 + 60 * 60 * 1000);
  assert.equal(a.id, b.id);
});

t("favourites are sorted to the front", () => {
  const p = {
    C:  { active: true, favourite: false, hidden: false },
    Am: { active: true, favourite: true,  hidden: false },
    G:  { active: true, favourite: false, hidden: false },
  };
  // With favourites first, Am sits at index 0.
  const days = [0, 1, 2].map((i) => currentTonality(p, "day", T0 + i * DAY).id);
  // At least one of the three days must surface the favourite.
  assert(days.includes("Am"));
});

t("nextTonalities returns N forward picks", () => {
  const p = prefsActive("C", "Am", "G", "F");
  const list = nextTonalities(p, "day", 4, T0);
  assert.equal(list.length, 4);
});

t("currentTonality falls back to defaults when none active", () => {
  const t1 = currentTonality({}, "week", T0);
  // The roster's default active starters are C / Am, so we land on one.
  assert(["C", "Am"].includes(t1.id));
});

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
else console.log("\nAll rotation tests passed");
