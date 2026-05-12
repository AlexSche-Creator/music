import { PROGRESSIONS } from "../data/progressions.js";
import { ensureCtx, unlock, playSequence, stopAll } from "../core/audio.js";
import { el, card, btn, chip } from "./components.js";

export async function renderProgressions({ container }) {
  container.appendChild(el("h1", { text: "Прогрессии" }));
  container.appendChild(el("p", { text: "Типовые цепочки аккордов. Прослушай и тренируй «угадай следующий»." }));

  for (const p of PROGRESSIONS) {
    const body = el("div", { class: "col" },
      el("div", { class: "row between" },
        el("div", null,
          el("h2", { text: p.name }),
          el("div", { class: "meta", text: p.flavor })
        ),
        chip(p.mode === "minor" ? "минор" : "мажор", true)
      ),
      el("div", { class: "grid-2", style: { marginTop: "6px" } },
        progBlock("C major", p.chordsByTonality.C),
        progBlock("A minor", p.chordsByTonality.Am)
      ),
      el("div", { class: "btn-row" },
        btn("Слушать в C", async () => { await unlock(); await playSequence(p.chordsByTonality.C, { stepSec: 0.9, durationSec: 0.8 }); }, { primary: true }),
        btn("Слушать в Am", async () => { await unlock(); await playSequence(p.chordsByTonality.Am, { stepSec: 0.9, durationSec: 0.8 }); }, { ghost: true }),
        btn("Угадай следующий", () => location.hash = `#/train/run?mode=next_chord&tonality=Am&dur=180`)
      )
    );
    container.appendChild(card(body));
  }
  return () => stopAll();
}

function progBlock(label, chords) {
  return el("div", { class: "step-row", style: { gridTemplateColumns: "1fr" } },
    el("div", null,
      el("div", { class: "meta", text: label }),
      el("div", { class: "chord", text: chords.join(" – ") })
    )
  );
}
