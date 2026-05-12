/* Tiny UI helpers. We deliberately avoid a framework. */

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(e.dataset, v);
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

export function toast(msg, ms = 1800) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

export function card(content, opts = {}) {
  return el("div", { class: `card${opts.elev ? " elev2" : ""}${opts.accent ? " accent" : ""}${opts.tap ? " tap" : ""}`, ...opts.attrs }, content);
}

export function progressBar(pct) {
  return el("div", { class: "progress" }, el("div", { class: "bar", style: { width: `${Math.round(pct * 100)}%` } }));
}

export function chip(text, accent = false) {
  return el("span", { class: `chip${accent ? " accent" : ""}` }, text);
}

export function btn(label, onClick, opts = {}) {
  return el("button", {
    class: `btn${opts.primary ? " primary" : ""}${opts.ghost ? " ghost" : ""}${opts.full ? " full" : ""}${opts.small ? " small" : ""}`,
    onClick,
    type: "button",
    ...(opts.attrs || {})
  }, label);
}

export function fmtPct(v) { return `${Math.round((v ?? 0) * 100)}%`; }
export function fmtMs(v) { return v == null ? "—" : (v < 1000 ? `${v} мс` : `${(v / 1000).toFixed(1)} с`); }

/** Greet by time of day. */
export function greet(now = new Date()) {
  const h = now.getHours();
  if (h < 6) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

export function dayLabel(ts, now = Date.now()) {
  const days = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
  const d = new Date(ts);
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, new Date(now))) return "Сегодня";
  return days[d.getDay()];
}

/* Make a horizontal stacked bar of correct/total per day (mini week chart). */
export function weekBars(perDayData) {
  const max = Math.max(1, ...perDayData.map((d) => d.total));
  const bars = perDayData.map((d) => {
    const h = Math.round((d.total / max) * 100);
    return el("div", { class: "col" },
      el("div", { class: "b", dataset: { h: d.total ? "1" : "0" }, style: { height: `${Math.max(d.total ? 6 : 2, h)}%` } }),
      el("div", { class: "lbl", text: dayLabel(d.dayTs).slice(0, 2) })
    );
  });
  return el("div", { class: "weekbars" }, bars);
}
