/* Minimal hash router. Each route is a function (params, container) => void.
 * The hash format is `#/segment/segment?k=v&k=v` (no real URL params, just hash).
 */

const routes = new Map();
let mountedCleanup = null;

export function route(pattern, handler) {
  routes.set(pattern, handler);
}

export function go(hash) {
  if (location.hash === hash) {
    render();
  } else {
    location.hash = hash;
  }
}

export function currentRoute() {
  const raw = location.hash.replace(/^#/, "") || "/dashboard";
  return parseHash(raw);
}

function parseHash(raw) {
  const [path, qs] = raw.split("?");
  const params = {};
  if (qs) {
    for (const kv of qs.split("&")) {
      const [k, v] = kv.split("=");
      params[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
    }
  }
  return { path, params };
}

export async function render() {
  const view = document.getElementById("view");
  if (!view) return;
  if (typeof mountedCleanup === "function") {
    try { mountedCleanup(); } catch {}
    mountedCleanup = null;
  }
  const { path, params } = currentRoute();
  // Find route by exact match or by prefix-with-segment match.
  let handler = routes.get(path);
  if (!handler) {
    for (const [p, h] of routes) {
      if (path.startsWith(p + "/")) { handler = h; break; }
    }
  }
  if (!handler) handler = routes.get("/dashboard");
  view.innerHTML = "";
  view.scrollTo?.({ top: 0 });
  updateTabBar(path);
  try {
    mountedCleanup = await handler({ path, params, container: view });
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="card"><h2>Что-то пошло не так</h2><p>${escapeHtml(err.message || String(err))}</p></div>`;
  }
}

function updateTabBar(path) {
  const root = path.split("/").filter(Boolean)[0] || "dashboard";
  document.querySelectorAll(".tab").forEach((el) => {
    const target = el.getAttribute("data-route") || "";
    const tabRoot = target.replace(/^#\//, "").split("/")[0];
    el.classList.toggle("active", tabRoot === root);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

export function start() {
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-route]");
    if (!t) return;
    e.preventDefault();
    const r = t.getAttribute("data-route");
    if (r) go(r);
  });
  window.addEventListener("hashchange", () => render());
  if (!location.hash) location.hash = "#/dashboard";
  else render();
}
