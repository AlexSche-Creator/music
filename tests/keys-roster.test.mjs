/* Tests for js/data/keys-roster.js — 24 tonalities roster + prefs. */
import assert from "node:assert/strict";
import { KEY_ROSTER, defaultKeyPrefs, resolveKeyRoster, findKey, activeKeys, STARTER_KEY_IDS } from "../js/data/keys-roster.js";

let failed = 0;
function t(name, fn) {
  try { fn(); console.log("✓", name); }
  catch (e) { failed++; console.error("✗", name, "\n   ", e.message); }
}

t("KEY_ROSTER has exactly 24 tonalities", () => {
  assert.equal(KEY_ROSTER.length, 24);
});

t("12 majors and 12 minors", () => {
  const majors = KEY_ROSTER.filter((k) => k.mode === "major").length;
  const minors = KEY_ROSTER.filter((k) => k.mode === "minor").length;
  assert.equal(majors, 12);
  assert.equal(minors, 12);
});

t("starters are C and Am", () => {
  assert.deepEqual(STARTER_KEY_IDS, ["C", "Am"]);
  const starters = KEY_ROSTER.filter((k) => k.status === "starter").map((k) => k.id);
  assert.deepEqual(starters.sort(), ["Am", "C"]);
});

t("defaultKeyPrefs: only starters active, none favourite/hidden", () => {
  const p = defaultKeyPrefs();
  assert.equal(p.C.active, true);
  assert.equal(p.Am.active, true);
  assert.equal(p.G.active, false);
  for (const k of KEY_ROSTER) {
    assert.equal(p[k.id].favourite, false);
    assert.equal(p[k.id].hidden, false);
  }
});

t("resolveKeyRoster merges prefs", () => {
  const prefs = defaultKeyPrefs();
  prefs.G.active = true;
  prefs.G.favourite = true;
  prefs.Bbm.hidden = true;
  const merged = resolveKeyRoster(prefs);
  const g = merged.find((k) => k.id === "G");
  assert.ok(g.active);
  assert.ok(g.favourite);
  const bbm = merged.find((k) => k.id === "Bbm");
  assert.ok(bbm.hidden);
});

t("findKey lookups", () => {
  assert.equal(findKey("G").russian, "Соль мажор");
  assert.equal(findKey("nope"), null);
});

t("activeKeys filters by active+!hidden", () => {
  const prefs = defaultKeyPrefs();
  prefs.G.active = true;
  prefs.G.hidden = true; // hidden overrides active
  prefs.D.active = true;
  const list = activeKeys(prefs).map((k) => k.id);
  assert.ok(list.includes("C"));
  assert.ok(list.includes("Am"));
  assert.ok(list.includes("D"));
  assert.ok(!list.includes("G"));
});

t("each key has unique id", () => {
  const ids = new Set(KEY_ROSTER.map((k) => k.id));
  assert.equal(ids.size, KEY_ROSTER.length);
});

t("major keys reference minor relatives and vice versa", () => {
  for (const k of KEY_ROSTER) {
    const rel = findKey(k.relative);
    assert.ok(rel, `relative ${k.relative} of ${k.id} not in roster`);
    assert.notEqual(rel.mode, k.mode, `relative ${k.relative} should be opposite mode of ${k.id}`);
  }
});

if (failed > 0) { console.error(`\n${failed} failed`); process.exit(1); }
else console.log("\nall keys-roster tests passed");
