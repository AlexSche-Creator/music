/* Entry point. Wires the router, registers the service worker and arms the
 * in-page reminder scheduler.
 */

import { route, start, render } from "./router.js";
import { renderDashboard } from "./ui/dashboard.js";
import { renderTrainHub } from "./ui/train-hub.js";
import { renderTraining } from "./ui/training.js";
import { renderTonalities } from "./ui/tonalities.js";
import { renderProgressions } from "./ui/progressions.js";
import { renderStats } from "./ui/stats.js";
import { renderSettings } from "./ui/settings.js";
import { kvGet } from "./core/store.js";
import { scheduleLocalReminders, permission } from "./core/reminders.js";
import { setTimbre, ensureCtx } from "./core/audio.js";

route("/dashboard",    renderDashboard);
route("/train",        renderTrainHub);
route("/train/run",    renderTraining);
route("/tonalities",   renderTonalities);
route("/progressions", renderProgressions);
route("/stats",        renderStats);
route("/settings",     renderSettings);

start();

/* iOS Safari only creates a running AudioContext when `new AudioContext()` is
 * called inside a user gesture. Autoplay later (via setTimeout in training)
 * happens outside the gesture, so the AC would otherwise start suspended and
 * stay silent. Create the AC on the very first user click — any click counts. */
document.addEventListener("click", () => { try { ensureCtx(); } catch {} }, { once: true });

/* Service worker registration. Failures are non-fatal — the app stays usable. */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js", { scope: "./" })
      .catch((err) => console.warn("SW registration failed", err));
  });
}

/* Apply persisted timbre and arm reminders on boot. */
(async () => {
  const settings = (await kvGet("settings")) || {};
  if (settings.timbre) setTimbre(settings.timbre);
  if (permission() === "granted" && Array.isArray(settings.reminders) && settings.reminders.length) {
    scheduleLocalReminders(settings.reminders);
  }
})();
