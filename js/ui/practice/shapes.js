/* Chord Shapes (Аппликатуры).
 *
 * Each family lists multiple voicings; tapping a shape renders a 6-string
 * fretboard SVG diagram and plays the chord audio. Pressing "Я выучил эту
 * форму" logs one shapes habit session.
 */

import { kvGet, kvSet } from "../../core/store.js";
import { mergeSettings } from "../../core/settings-schema.js";
import { unlock, playArpeggio } from "../../core/audio.js";
import { recordSession } from "../../core/habits.js";
import { SHAPE_FAMILIES, filterShapes, findFamily } from "../../data/shapes.js";
import { el, card, btn, chip, toast } from "../components.js";

export async function renderShapes({ container }) {
  const settings = mergeSettings(await kvGet("settings"));
  const cfg = settings.shapes || {};
  const enabledFamilies = Array.isArray(cfg.enabledFamilies) && cfg.enabledFamilies.length
    ? cfg.enabledFamilies : SHAPE_FAMILIES.map((f) => f.id);
  const enabledExt = Array.isArray(cfg.enabledExtensions) ? cfg.enabledExtensions : ["maj7","m7","sus2","sus4","add9","7"];
  const families = SHAPE_FAMILIES.filter((f) => enabledFamilies.includes(f.id));

  let familyId = families[0]?.id || "C";
  let shapeId  = null;
  let sessionStart = Date.now();

  container.appendChild(el("h1", { text: "✋ Аппликатуры" }));
  container.appendChild(el("p", { text: "Альтернативные позиции аккордов и расширения. Поднажми, чтобы услышать." }));

  const tabs    = el("div", { class: "row", style: { flexWrap: "wrap", gap: "8px" } });
  const shapes  = el("div", { class: "col" });
  const diagram = el("div", { class: "col", style: { alignItems: "center", gap: "10px" } });
  const actions = el("div", { class: "btn-row" });

  container.appendChild(card(el("div", { class: "col" }, el("h2", { text: "Семейство аккорда" }), tabs), { practiceAccent: true }));
  container.appendChild(card(shapes,   { practiceAccent: true }));
  container.appendChild(card(diagram,  { practiceAccent: true }));
  container.appendChild(actions);

  function renderTabs() {
    tabs.innerHTML = "";
    for (const f of families) {
      const active = familyId === f.id;
      const b = document.createElement("button");
      b.className = `btn small${active ? " primary practice" : ""}`;
      b.type = "button"; b.textContent = f.label;
      b.addEventListener("click", () => { familyId = f.id; shapeId = null; renderTabs(); renderShapesList(); renderDiagram(); });
      tabs.appendChild(b);
    }
  }
  function renderShapesList() {
    shapes.innerHTML = "";
    const fam = findFamily(familyId);
    if (!fam) return;
    const list = filterShapes(fam, enabledExt);
    shapes.appendChild(el("h2", { text: fam.label }));
    if (!list.length) {
      shapes.appendChild(el("p", { text: "Включи расширения в настройках чтобы видеть больше форм." }));
      return;
    }
    const grid = el("div", { class: "grid-2", style: { gap: "10px" } });
    for (const s of list) {
      const active = shapeId === s.id;
      const row = card(el("div", { class: "col", style: { gap: "4px" } },
        el("h3", { text: s.label, style: active ? { color: "var(--accent-practice)" } : null }),
        el("div", { class: "muted", style: { fontSize: "12px" }, text: humanFrets(s.frets) }),
      ), {
        practiceAccent: true,
        tap: true,
        attrs: { onClick: () => { shapeId = s.id; renderShapesList(); renderDiagram(); }, role: "button", tabindex: "0", style: "cursor:pointer;" },
      });
      grid.appendChild(row);
    }
    shapes.appendChild(grid);
  }
  function renderDiagram() {
    diagram.innerHTML = "";
    const fam = findFamily(familyId);
    const s = shapeId ? fam?.shapes.find((x) => x.id === shapeId) : (fam ? filterShapes(fam, enabledExt)[0] : null);
    if (!s) { diagram.appendChild(el("p", { text: "Выбери форму выше." })); return; }
    diagram.appendChild(el("h3", { text: s.label }));
    diagram.appendChild(fretboardSvg(s));
    diagram.appendChild(el("div", { class: "btn-row" },
      btn("▶ Прослушать", async () => {
        await unlock();
        const symbol = chordSymbolFromShape(s, fam);
        playArpeggio(symbol, { duration: 1.6, octave: 4, spread: 0.07 }).catch(() => {});
      }, { practiceAccent: true }),
    ));
  }
  function renderActions() {
    actions.innerHTML = "";
    actions.appendChild(btn("Записать сессию", async () => {
      const dur = Math.max(60, Math.round((Date.now() - sessionStart) / 1000));
      const logs = (await kvGet("habit_logs")) || {};
      recordSession(logs, { module: "shapes", durationSec: dur });
      await kvSet("habit_logs", logs);
      toast("Аппликатуры записаны в привычки");
      sessionStart = Date.now();
    }, { primary: true, practiceAccent: true, full: true }));
  }

  renderTabs();
  renderShapesList();
  renderDiagram();
  renderActions();

  return null;
}

function humanFrets(frets) {
  return frets.map((v) => v === "x" ? "x" : (v === 0 ? "0" : String(v))).join("-");
}

function chordSymbolFromShape(s, family) {
  if (!family) return "C";
  if (s.id.includes("maj7")) return family.id + "maj7";
  if (s.id.endsWith("7"))    return family.id + "7";
  if (s.id.endsWith("m7"))   return family.id.replace(/m$/, "") + "m7";
  if (s.id.includes("sus2")) return family.id + "sus2";
  if (s.id.includes("sus4")) return family.id + "sus4";
  if (s.id.includes("add9")) return family.id + "add9";
  return family.id;
}

function fretboardSvg(shape) {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const W = 220, H = 240;
  const cols = 6, rows = 5; // 6 strings, 5 frets shown
  const padX = 20, padTop = 36, padBottom = 18;
  const stringSpacing = (W - padX * 2) / (cols - 1);
  const fretSpacing   = (H - padTop - padBottom) / rows;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(W)); svg.setAttribute("height", String(H));
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.style.background = "var(--bg-elev-2)"; svg.style.borderRadius = "12px";

  // Base-fret label
  if (shape.baseFret > 0) {
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", String(padX - 8)); t.setAttribute("y", String(padTop + 14));
    t.setAttribute("fill", "var(--fg-dim)"); t.setAttribute("font-size", "12");
    t.setAttribute("text-anchor", "end");
    t.textContent = `${shape.baseFret} →`;
    svg.appendChild(t);
  }

  // Strings
  for (let i = 0; i < cols; i++) {
    const x = padX + i * stringSpacing;
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(x)); line.setAttribute("y1", String(padTop));
    line.setAttribute("x2", String(x)); line.setAttribute("y2", String(H - padBottom));
    line.setAttribute("stroke", "var(--fg-dim)"); line.setAttribute("stroke-width", "1.5");
    svg.appendChild(line);
  }
  // Frets
  for (let j = 0; j <= rows; j++) {
    const y = padTop + j * fretSpacing;
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(padX)); line.setAttribute("y1", String(y));
    line.setAttribute("x2", String(W - padX)); line.setAttribute("y2", String(y));
    line.setAttribute("stroke", "var(--fg)"); line.setAttribute("stroke-width", j === 0 && shape.baseFret === 0 ? "4" : "1");
    svg.appendChild(line);
  }
  // Dots / markers
  for (let i = 0; i < 6; i++) {
    const x = padX + i * stringSpacing;
    const v = shape.frets[i];
    if (v === "x") {
      const t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("x", String(x)); t.setAttribute("y", String(padTop - 12));
      t.setAttribute("fill", "var(--bad)"); t.setAttribute("font-size", "14");
      t.setAttribute("text-anchor", "middle"); t.textContent = "x";
      svg.appendChild(t);
    } else if (v === 0) {
      const t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("x", String(x)); t.setAttribute("y", String(padTop - 12));
      t.setAttribute("fill", "var(--fg-dim)"); t.setAttribute("font-size", "14");
      t.setAttribute("text-anchor", "middle"); t.textContent = "○";
      svg.appendChild(t);
    } else {
      const fretIdx = v - (shape.baseFret || 0);
      const y = padTop + (fretIdx - 0.5) * fretSpacing;
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", String(x)); c.setAttribute("cy", String(y));
      c.setAttribute("r", "11"); c.setAttribute("fill", "var(--accent-practice)");
      svg.appendChild(c);
      if (shape.fingers && shape.fingers[i]) {
        const t = document.createElementNS(SVG_NS, "text");
        t.setAttribute("x", String(x)); t.setAttribute("y", String(y + 4));
        t.setAttribute("fill", "#1a0033"); t.setAttribute("font-size", "12");
        t.setAttribute("text-anchor", "middle"); t.setAttribute("font-weight", "700");
        t.textContent = String(shape.fingers[i]);
        svg.appendChild(t);
      }
    }
  }
  return svg;
}
