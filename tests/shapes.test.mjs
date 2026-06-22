/* Tests for js/data/shapes.js — chord shape diagrams. */
import assert from "node:assert/strict";
import { SHAPE_FAMILIES, findFamily, filterShapes } from "../js/data/shapes.js";

let failed = 0;
function t(name, fn) {
  try { fn(); console.log("✓", name); }
  catch (e) { failed++; console.error("✗", name, "\n   ", e.message); }
}

t("SHAPE_FAMILIES contains the six base families", () => {
  const ids = SHAPE_FAMILIES.map((f) => f.id);
  for (const expect of ["C","Am","Dm","G","F","Em"]) assert(ids.includes(expect));
});

t("findFamily returns the matching family", () => {
  const f = findFamily("Am");
  assert(f);
  assert.equal(f.id, "Am");
});

t("findFamily returns null for unknown id", () => {
  assert.equal(findFamily("Zz"), null);
});

t("every shape has 6 fret values", () => {
  for (const fam of SHAPE_FAMILIES) {
    for (const s of fam.shapes) {
      assert.equal(s.frets.length, 6, `${s.id} has ${s.frets.length} frets`);
      assert.equal(s.fingers.length, 6, `${s.id} has ${s.fingers.length} fingers`);
    }
  }
});

t("filterShapes drops m7 shapes when m7 extension is disabled", () => {
  const am = findFamily("Am");
  const filtered = filterShapes(am, ["sus2","sus4","add9"]);
  // Am7 is excluded; Am-open remains.
  assert(filtered.some((s) => s.id === "Am-open"));
  assert(!filtered.some((s) => s.id === "Am7"));
});

t("filterShapes returns empty list for unknown family", () => {
  assert.deepEqual(filterShapes(null, ["m7"]), []);
});

t("filterShapes preserves open shapes when extensions are empty", () => {
  const c = findFamily("C");
  const f = filterShapes(c, []);
  assert(f.some((s) => s.id === "C-open"));
});

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
else console.log("\nAll shapes tests passed");
