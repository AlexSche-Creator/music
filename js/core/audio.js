/* Audio engine — pure WebAudio.
 *
 * Two timbres:
 *  - "piano": simple additive (sine + soft saw harmonics) with ADSR.
 *  - "guitar": Karplus-Strong style pluck via a feedback delay + low-pass.
 *
 * Both timbres expose the same interface: `playChord`, `playArpeggio`,
 * `playSequence`. The AudioContext is lazily created on the first user gesture
 * (browsers — iOS Safari especially — require this).
 */

import { chordMidiNotes, midiToFreq } from "./theory.js";

let ctx = null;
let masterGain = null;
let currentTimbre = "piano";
let activeStops = []; // functions that stop currently-playing voices
let silentEl = null;   // HTMLAudioElement looping silence; defeats iOS silent switch
let silentPlaying = false;

/* 0.1 s of 8 kHz / 8-bit / mono silence (845 bytes uncompressed -> ~1.1 KB base64).
 * iOS Safari silences Web Audio output whenever the physical mute / ring switch
 * is engaged — even if the system volume is up. The documented workaround is
 * to play an HTMLAudioElement on the page: this flips the WebKit audio session
 * from "ambient" to "media playback", after which Web Audio respects the
 * volume slider regardless of the switch. We attach a hidden <audio> tag with
 * a tiny silent WAV looping forever and call play() from inside a real user
 * gesture. The element stays alive for the lifetime of the page. */
const SILENT_WAV = "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";

function ensureSilentEl() {
  if (silentEl) return silentEl;
  if (typeof document === "undefined") return null;
  const el = document.createElement("audio");
  el.setAttribute("playsinline", "");
  el.setAttribute("webkit-playsinline", "");
  el.setAttribute("aria-hidden", "true");
  el.preload = "auto";
  el.loop = true;
  el.src = SILENT_WAV;
  el.style.cssText = "position:absolute;width:0;height:0;left:-9999px;top:0;opacity:0;pointer-events:none;";
  if (document.body) document.body.appendChild(el);
  else document.addEventListener("DOMContentLoaded", () => document.body.appendChild(el), { once: true });
  silentEl = el;
  return el;
}

async function defeatIOSSilentSwitch() {
  if (silentPlaying) return;
  const el = ensureSilentEl();
  if (!el) return;
  try {
    el.currentTime = 0;
    const p = el.play();
    if (p && typeof p.then === "function") await p;
    silentPlaying = true;
  } catch {
    /* play() promise rejects until the next gesture — that's fine, we retry. */
  }
}

/** Lazily create the AudioContext on first user gesture. Safe to call any time. */
export function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  masterGain = ctx.createGain();
  masterGain.gain.value = 0.6;
  masterGain.connect(ctx.destination);
  return ctx;
}

/** Resume the context if suspended AND defeat iOS silent switch.
 *  Call from a user-gesture handler for it to actually take effect. */
export async function unlock() {
  const c = ensureCtx();
  if (c && c.state === "suspended") {
    try { await c.resume(); } catch {}
  }
  await defeatIOSSilentSwitch();
  return c;
}

export function setTimbre(name) {
  currentTimbre = name === "guitar" ? "guitar" : "piano";
}
export function getTimbre() { return currentTimbre; }

export function setMasterVolume(v) {
  ensureCtx();
  if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, v));
}

/** Stop everything currently playing (useful when navigating). */
export function stopAll() {
  for (const stop of activeStops.splice(0)) {
    try { stop(); } catch {}
  }
}

/* ---------- Piano-like voice (additive) ---------- */
function playPianoVoice(freq, when, dur, gain = 1.0) {
  if (!ctx) return () => {};
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, when);
  out.gain.exponentialRampToValueAtTime(0.9 * gain, when + 0.01);
  out.gain.exponentialRampToValueAtTime(0.4 * gain, when + 0.12);
  out.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  out.connect(masterGain);

  const oscs = [];
  // Fundamental + a few harmonics with decreasing amplitude.
  const harms = [
    { mult: 1, amp: 1.0,  type: "sine" },
    { mult: 2, amp: 0.35, type: "sine" },
    { mult: 3, amp: 0.18, type: "triangle" },
    { mult: 4, amp: 0.08, type: "sine" }
  ];
  for (const h of harms) {
    const o = ctx.createOscillator();
    o.type = h.type;
    o.frequency.value = freq * h.mult;
    const g = ctx.createGain();
    g.gain.value = h.amp * 0.4;
    o.connect(g).connect(out);
    o.start(when);
    o.stop(when + dur + 0.05);
    oscs.push(o);
  }
  const stop = () => {
    try {
      out.gain.cancelScheduledValues(ctx.currentTime);
      out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03);
    } catch {}
    setTimeout(() => {
      for (const o of oscs) { try { o.stop(); } catch {} }
      try { out.disconnect(); } catch {}
    }, 120);
  };
  return stop;
}

/* ---------- Guitar-like (Karplus-Strong via short delay + LP feedback) ----- */
function playPluckVoice(freq, when, dur, gain = 1.0) {
  if (!ctx) return () => {};
  // Approximated with a short noise burst + biquad band-pass + decay envelope.
  // Real KS via ScriptProcessor is heavy and not necessary for our needs.
  const burstDur = 0.02;
  const sr = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.floor(sr * burstDur), sr);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.9;

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const filt = ctx.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.value = freq;
  filt.Q.value = 8;

  const delay = ctx.createDelay(0.05);
  const period = 1 / freq;
  delay.delayTime.value = period;
  const fb = ctx.createGain();
  fb.gain.value = 0.985; // decay control

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = Math.min(4000, freq * 8);

  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, when);
  out.gain.exponentialRampToValueAtTime(0.9 * gain, when + 0.005);
  out.gain.exponentialRampToValueAtTime(0.0001, when + dur);

  src.connect(filt).connect(delay).connect(lp).connect(fb).connect(delay);
  delay.connect(out);
  out.connect(masterGain);

  src.start(when);
  src.stop(when + burstDur);

  const stop = () => {
    try {
      out.gain.cancelScheduledValues(ctx.currentTime);
      out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03);
    } catch {}
    setTimeout(() => {
      try { src.stop(); } catch {}
      try { out.disconnect(); } catch {}
    }, 120);
  };
  return stop;
}

function playVoice(freq, when, dur, gain) {
  return currentTimbre === "guitar"
    ? playPluckVoice(freq, when, dur, gain)
    : playPianoVoice(freq, when, dur, gain);
}

/** Play a chord as a block. */
export async function playChord(symbol, { duration = 1.6, octave = 4, when = 0 } = {}) {
  await unlock();
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const notes = chordMidiNotes(symbol, octave);
  const stops = notes.map((m) => playVoice(midiToFreq(m), t0, duration, 1.0 / Math.max(2, notes.length / 2)));
  const stop = () => stops.forEach((s) => s());
  activeStops.push(stop);
  return new Promise((res) => setTimeout(() => { stop(); res(); }, duration * 1000));
}

/** Play a chord as a strum / arpeggio. */
export async function playArpeggio(symbol, { spread = 0.06, duration = 1.4, octave = 4 } = {}) {
  await unlock();
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.01;
  const notes = chordMidiNotes(symbol, octave);
  const stops = notes.map((m, i) =>
    playVoice(midiToFreq(m), t0 + i * spread, duration, 1.0 / Math.max(2, notes.length / 2))
  );
  const stop = () => stops.forEach((s) => s());
  activeStops.push(stop);
  return new Promise((res) => setTimeout(() => { stop(); res(); }, (duration + 0.2) * 1000));
}

/** Play a sequence of chords with a fixed step in seconds. */
export async function playSequence(symbols, { stepSec = 0.9, durationSec = 0.85, arpeggio = false, octave = 4 } = {}) {
  await unlock();
  if (!ctx) return;
  for (let i = 0; i < symbols.length; i++) {
    if (arpeggio) await playArpeggio(symbols[i], { duration: durationSec, octave });
    else await playChord(symbols[i], { duration: durationSec, octave });
    if (i < symbols.length - 1) {
      await new Promise((r) => setTimeout(r, Math.max(0, (stepSec - durationSec) * 1000)));
    }
  }
}
