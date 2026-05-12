/* Service worker for the Music Trainer PWA.
 * Strategy: cache-first for app shell, network-first for everything else.
 * Bump CACHE_VERSION whenever the shell changes.
 */
const CACHE_VERSION = "music-trainer-v4";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./js/main.js",
  "./js/router.js",
  "./js/data/tonalities.js",
  "./js/data/progressions.js",
  "./js/data/feelings.js",
  "./js/core/theory.js",
  "./js/core/audio.js",
  "./js/core/store.js",
  "./js/core/scheduler.js",
  "./js/core/stats.js",
  "./js/core/reminders.js",
  "./js/ui/components.js",
  "./js/ui/dashboard.js",
  "./js/ui/train-hub.js",
  "./js/ui/training.js",
  "./js/ui/tonalities.js",
  "./js/ui/progressions.js",
  "./js/ui/stats.js",
  "./js/ui/settings.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Only handle same-origin requests; let everything else fall through.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) {
        // Refresh in background.
        fetch(req).then((res) => {
          if (res.ok) caches.open(CACHE_VERSION).then((c) => c.put(req, res.clone()));
        }).catch(() => {});
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      } catch (e) {
        // Last-resort fallback to the shell for navigation requests.
        if (req.mode === "navigate") {
          const shell = await caches.match("./index.html");
          if (shell) return shell;
        }
        throw e;
      }
    })()
  );
});

/* Notification clicks: focus or open the app. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const url = new URL("./", self.location.href).href;
    for (const c of all) {
      if (c.url.startsWith(url)) { c.focus(); return; }
    }
    await self.clients.openWindow(url);
  })());
});

/* Triggered by the page (postMessage) or by Periodic Sync where supported.
 * Shows a "time to practice" notification.
 */
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "reminder") {
    self.registration.showNotification("Время потренироваться", {
      body: data.body || "Короткая сессия — лучше, чем никакая.",
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      tag: "music-reminder",
      renotify: false
    });
  }
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "daily-reminder") {
    event.waitUntil(self.registration.showNotification("Время потренироваться", {
      body: "Сегодняшняя сессия ждёт. 5 минут — достаточно.",
      icon: "./icons/icon-192.png",
      tag: "music-reminder"
    }));
  }
});
