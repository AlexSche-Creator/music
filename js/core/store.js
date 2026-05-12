/* IndexedDB wrapper for persistence.
 *
 * Stores:
 *  - answers:  per-question log entries (auto-key)
 *  - sessions: training sessions (auto-key)
 *  - kv:       singletons (settings, weights, feeling-overrides, streak meta)
 *
 * Falls back to localStorage if IndexedDB is unavailable (rare, but Safari
 * sometimes blocks IDB in Private mode).
 */

const DB_NAME = "music-trainer";
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) { reject(new Error("no-idb")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("answers")) {
        const s = db.createObjectStore("answers", { keyPath: "id", autoIncrement: true });
        s.createIndex("ts", "ts");
        s.createIndex("mode", "mode");
      }
      if (!db.objectStoreNames.contains("sessions")) {
        const s = db.createObjectStore("sessions", { keyPath: "id", autoIncrement: true });
        s.createIndex("startedAt", "startedAt");
      }
      if (!db.objectStoreNames.contains("kv")) {
        db.createObjectStore("kv");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(storeName, mode = "readonly") {
  const db = await openDb();
  return db.transaction(storeName, mode).objectStore(storeName);
}

/* ---------- key-value singletons ---------- */
export async function kvGet(key, fallback = null) {
  try {
    const s = await tx("kv");
    return await new Promise((res, rej) => {
      const r = s.get(key);
      r.onsuccess = () => res(r.result === undefined ? fallback : r.result);
      r.onerror = () => rej(r.error);
    });
  } catch {
    // localStorage fallback
    try {
      const raw = localStorage.getItem("mt:" + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  }
}

export async function kvSet(key, value) {
  try {
    const s = await tx("kv", "readwrite");
    return await new Promise((res, rej) => {
      const r = s.put(value, key);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  } catch {
    try { localStorage.setItem("mt:" + key, JSON.stringify(value)); } catch {}
  }
}

/* ---------- answers ---------- */
export async function logAnswer(entry) {
  const e = { ts: Date.now(), ...entry };
  try {
    const s = await tx("answers", "readwrite");
    return await new Promise((res, rej) => {
      const r = s.add(e);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  } catch {
    const arr = JSON.parse(localStorage.getItem("mt:answers") || "[]");
    arr.push(e);
    if (arr.length > 5000) arr.splice(0, arr.length - 5000);
    localStorage.setItem("mt:answers", JSON.stringify(arr));
    return arr.length;
  }
}

export async function listAnswers({ sinceTs = 0, untilTs = Infinity, mode = null } = {}) {
  try {
    const s = await tx("answers");
    return await new Promise((res, rej) => {
      const out = [];
      const idx = s.index("ts");
      const range = IDBKeyRange.bound(sinceTs, isFinite(untilTs) ? untilTs : Date.now() + 1);
      const r = idx.openCursor(range);
      r.onsuccess = () => {
        const c = r.result;
        if (!c) { res(out); return; }
        if (!mode || c.value.mode === mode) out.push(c.value);
        c.continue();
      };
      r.onerror = () => rej(r.error);
    });
  } catch {
    const arr = JSON.parse(localStorage.getItem("mt:answers") || "[]");
    return arr.filter((a) => a.ts >= sinceTs && a.ts <= untilTs && (!mode || a.mode === mode));
  }
}

export async function clearAnswers() {
  try {
    const s = await tx("answers", "readwrite");
    return await new Promise((res, rej) => {
      const r = s.clear();
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  } catch { localStorage.removeItem("mt:answers"); }
}

/* ---------- sessions ---------- */
export async function startSession(meta) {
  const entry = { startedAt: Date.now(), ...meta };
  try {
    const s = await tx("sessions", "readwrite");
    return await new Promise((res, rej) => {
      const r = s.add(entry);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  } catch {
    const arr = JSON.parse(localStorage.getItem("mt:sessions") || "[]");
    entry.id = arr.length + 1;
    arr.push(entry);
    localStorage.setItem("mt:sessions", JSON.stringify(arr));
    return entry.id;
  }
}

export async function finishSession(id, patch) {
  try {
    const s = await tx("sessions", "readwrite");
    return await new Promise((res, rej) => {
      const r = s.get(id);
      r.onsuccess = () => {
        const cur = r.result || { id };
        const updated = { ...cur, ...patch, finishedAt: Date.now() };
        const w = s.put(updated);
        w.onsuccess = () => res();
        w.onerror = () => rej(w.error);
      };
      r.onerror = () => rej(r.error);
    });
  } catch {
    const arr = JSON.parse(localStorage.getItem("mt:sessions") || "[]");
    const i = arr.findIndex((s) => s.id === id);
    if (i >= 0) arr[i] = { ...arr[i], ...patch, finishedAt: Date.now() };
    localStorage.setItem("mt:sessions", JSON.stringify(arr));
  }
}

export async function listSessions() {
  try {
    const s = await tx("sessions");
    return await new Promise((res, rej) => {
      const out = [];
      const r = s.openCursor();
      r.onsuccess = () => {
        const c = r.result;
        if (!c) { res(out); return; }
        out.push(c.value);
        c.continue();
      };
      r.onerror = () => rej(r.error);
    });
  } catch {
    return JSON.parse(localStorage.getItem("mt:sessions") || "[]");
  }
}

/* ---------- export / import ---------- */
export async function exportAll() {
  const [answers, sessions, settings, weights, feelings] = await Promise.all([
    listAnswers({}), listSessions(),
    kvGet("settings"), kvGet("weights"), kvGet("feelings_overrides")
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    answers, sessions, settings, weights, feelings
  };
}

export async function importAll(payload) {
  if (!payload || payload.version !== 1) throw new Error("Несовместимый файл");
  if (Array.isArray(payload.answers)) {
    await clearAnswers();
    for (const a of payload.answers) {
      const { id, ...rest } = a;
      await logAnswer(rest);
    }
  }
  if (payload.settings) await kvSet("settings", payload.settings);
  if (payload.weights) await kvSet("weights", payload.weights);
  if (payload.feelings) await kvSet("feelings_overrides", payload.feelings);
}

export async function clearAll() {
  await clearAnswers();
  try {
    const s = await tx("sessions", "readwrite");
    await new Promise((res, rej) => { const r = s.clear(); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
  } catch { localStorage.removeItem("mt:sessions"); }
  try {
    const s = await tx("kv", "readwrite");
    await new Promise((res, rej) => { const r = s.clear(); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
  } catch {
    Object.keys(localStorage).filter((k) => k.startsWith("mt:")).forEach((k) => localStorage.removeItem(k));
  }
}
