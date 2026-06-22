/* Entry point. Wires the router, registers the service worker and arms the
 * in-page reminder scheduler.
 */

import { route, start, render } from "./router.js";
import { renderPracticeHome } from "./ui/practice-home.js";
import { renderTrainHub } from "./ui/train-hub.js";
import { renderTraining } from "./ui/training.js";
import { renderTonalities } from "./ui/tonalities.js";
import { renderProgressions } from "./ui/progressions.js";
import { renderStats } from "./ui/stats.js";
import { renderSettings } from "./ui/settings.js";
import { renderImprov } from "./ui/practice/improv.js";
import { renderCovers } from "./ui/practice/covers.js";
import { renderShapes } from "./ui/practice/shapes.js";
import { renderKeys } from "./ui/practice/keys.js";
import { renderSchedule } from "./ui/practice/schedule.js";
import { renderHabits } from "./ui/practice/habits.js";
import { renderPurple } from "./ui/practice/purple.js";
import { kvGet } from "./core/store.js";
import { scheduleLocalReminders, permission } from "./core/reminders.js";
import { setTimbre, unlock } from "./core/audio.js";
import { mergeSettings } from "./core/settings-schema.js";

// Phase 1: the bottom nav has 3 tabs (Главная / Статистика / Настройки).
// Old #/dashboard route now resolves to the new practice-home aggregator.
// Old #/train, #/tonalities, #/progressions are still reachable from cards
// on the new Главная, just no longer pinned to the bottom bar.
route("/dashboard",        renderPracticeHome);
route("/train",            renderTrainHub);
route("/train/run",        renderTraining);
route("/tonalities",       renderTonalities);
route("/progressions",     renderProgressions);
route("/stats",            renderStats);
route("/settings",         renderSettings);
route("/practice/improv",   renderImprov);
route("/practice/covers",   renderCovers);
route("/practice/shapes",   renderShapes);
route("/practice/keys",     renderKeys);
route("/practice/schedule", renderSchedule);
route("/practice/habits",   renderHabits);
route("/practice/purple",   renderPurple);

start();

/* Browsers (iOS Safari, Chrome desktop & Android) create AudioContext in the
 * "suspended" state until a user gesture triggers `resume()`. Our autoplay in
 * training is launched from setTimeout — outside the gesture — so without an
 * up-front resume, playback stays silent. Hook the FIRST user click on the
 * document and explicitly `unlock()` (= ensureCtx + resume). Idempotent and
 * cheap: it runs once, subsequent clicks no-op via `{ once: true }`. */
document.addEventListener("click", () => { unlock().catch(() => {}); }, { once: true });

/* Service worker registration. Failures are non-fatal — the app stays usable. */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js", { scope: "./" })
      .catch((err) => console.warn("SW registration failed", err));
  });
}

/* Apply persisted timbre and arm reminders on boot.
 * Use the schema merger so old flat-shape settings are migrated transparently. */
(async () => {
  const settings = mergeSettings(await kvGet("settings"));
  if (settings.general && settings.general.timbre) setTimbre(settings.general.timbre);
  if (permission() === "granted" && Array.isArray(settings.reminders) && settings.reminders.length) {
    scheduleLocalReminders(settings.reminders);
  }
})();
