import { TONALITIES } from "../data/tonalities.js";
import { effectiveFeelings } from "../data/feelings.js";
import { kvGet } from "../core/store.js";
import { ensureCtx, unlock, playChord, playSequence, stopAll } from "../core/audio.js";
import { el, card, btn, chip } from "./components.js";

const CHORD_TYPE_RU = { maj: "мажор", min: "минор", dim: "уменьш.", aug: "увелич." };
const FUNCTION_RU = {
  tonic: "тоника", supertonic: "надтоническая", mediant: "медианта",
  subdominant: "субдоминанта", dominant: "доминанта", submediant: "субмедианта",
  leading: "вводный", subtonic: "субтоника"
};
const INTERVAL_RU = {
  0: "0 (т.)", 2: "+2 (б2)", 3: "+3 (м3)", 4: "+4 (б3)", 5: "+5 (ч4)",
  7: "+7 (ч5)", 8: "+8 (м6)", 9: "+9 (б6)", 10: "+10 (м7)", 11: "+11 (б7)"
};
function chordTypeLabel(t) { return CHORD_TYPE_RU[t] ?? t; }
function functionLabel(k) { return FUNCTION_RU[k] ?? k; }
function intervalLabel(n) { return INTERVAL_RU[n] ?? `+${n}`; }

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
          el("div", { class: "meta", text: `${chordTypeLabel(s.chordType)} · ${functionLabel(s.functionKey)} · ${intervalLabel(s.intervalSemitones)}` }),
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
