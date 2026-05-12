import { TONALITIES } from "../data/tonalities.js";
import { effectiveFeelings } from "../data/feelings.js";
import { kvGet } from "../core/store.js";
import { ensureCtx, unlock, playChord, playSequence, stopAll } from "../core/audio.js";
import { el, card, btn, chip } from "./components.js";

export async function renderTonalities({ container }) {
  const feelings = effectiveFeelings(await kvGet("feelings_overrides"));

  container.appendChild(el("h1", { text: "Тональности" }));
  container.appendChild(el("p", { text: "Карточки ступеней, аккордов и чувств. Жми ▶, чтобы услышать." }));

  for (const tid of Object.keys(TONALITIES)) {
    const t = TONALITIES[tid];
    const body = el("div", { class: "col" });
    body.appendChild(el("div", { class: "row between" },
      el("div", null,
        el("h2", { text: t.russian }),
        el("div", { class: "meta", text: `${t.mode === "major" ? "Натуральный мажор" : "Натуральный минор"} · тоника ${t.tonic}` })
      ),
      el("button", { class: "play small", text: "▶", onClick: async () => {
        await unlock();
        await playSequence(t.chordsByTonality[tid], { stepSec: 0.9, durationSec: 0.8 });
      }})
    ));
    const rows = el("div", { class: "col", style: { marginTop: "10px" } });
    t.steps.forEach((s, i) => {
      const chord = t.chordsByTonality[tid][i];
      rows.appendChild(el("div", { class: "step-row" },
        el("div", { class: "deg", text: s.roman }),
        el("div", null,
          el("div", { class: "chord", text: `${chord}  ·  ${s.name}` }),
          el("div", { class: "meta", text: s.meaning }),
          el("div", { class: "meta", style: { color: "var(--accent)" }, text: `«${feelings[tid]?.[chord] ?? ""}»` })
        ),
        el("button", { class: "play small", text: "▶", onClick: async () => { await unlock(); playChord(chord, { duration: 1.5 }); } })
      ));
    });
    body.appendChild(rows);
    container.appendChild(card(body));
  }
  return () => stopAll();
}
