import {
  ArpSeqEngine, MODES, MODE_LABELS, RATES, PITCH_RANGE,
  MIN_SEQ_LENGTH, MAX_SEQ_LENGTH, noteName, defaultSteps, CHORDS, chordNotes,
  OSC2_MODES, osc2Note,
} from './core.js';
import { InternalClock, ExternalClock, pulseToStep } from './clock.js';
import { Synth } from './synth.js';
import { Midi } from './midi.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'arp-seq-settings-v1';

// ---------------------------------------------------------------- state
const engine = new ArpSeqEngine();
const settings = {
  bpm: 120,
  sync: 'internal',
  clockOut: false,
  mode: 'up',
  rate: '1/16',
  octaves: 1,
  gate: 50,
  swing: 0,
  latch: false,
  length: 4,
  steps: defaultSteps(),
  synthOn: true,
  wave: 'sawtooth',
  cutoff: 2400,
  volume: 50,
  midiIn: '',
  midiInCh: -1,
  midiOut: '',
  midiOutCh: 0,
  baseOctave: 3,
  chordRoot: 0,
  osc2On: true,
  osc2Mode: 'invert',
  osc2Wave: 'square',
  osc2Transpose: 0,
  osc2Detune: 0,
  osc2Level: 70,
  osc2MidiCh: -1,
};

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (saved && typeof saved === 'object') Object.assign(settings, saved);
} catch { /* storage unavailable */ }

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  }, 200);
}

function applyEngineSettings() {
  engine.setMode(settings.mode);
  engine.setOctaves(settings.octaves);
  engine.setLatch(settings.latch);
  engine.setLength(settings.length);
  settings.steps.forEach((s, i) => engine.setStep(i, s));
  settings.steps = engine.steps.map((s) => ({ ...s }));
}
applyEngineSettings();

// ---------------------------------------------------------------- audio + clocks
let ctx = null;
let synth = null;
let playing = false;
const uiEvents = []; // {time, ...} drained by the animation loop

function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    synth = new Synth(ctx);
    synth.wave = settings.wave;
    synth.cutoff = settings.cutoff;
    synth.setVolume(settings.volume / 100);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const audioTime = () => (ctx ? ctx.currentTime : performance.now() / 1000);
// Map AudioContext time to performance.now() ms for timestamped MIDI output.
const toPerfMs = (t) => performance.now() + (t - audioTime()) * 1000;

function onPulse(time, pulse, pulseDuration) {
  if (settings.clockOut && settings.sync === 'internal') midi.clock(toPerfMs(time));
  const step = pulseToStep(pulse, time, pulseDuration, RATES[settings.rate], settings.swing / 100);
  if (!step) return;

  const ev = engine.next();
  if (!ev) return;

  // Off-beat steps that are swung late have less room before the next step.
  const room = step.stepNumber % 2 === 1 ? step.duration - step.delay : step.duration;
  const gateLen = room * Math.min(settings.gate / 100, 0.98);

  const note2 = settings.osc2On ? osc2Note(ev, settings.osc2Mode, settings.osc2Transpose) : null;
  if (ev.velocity > 0) {
    const on = toPerfMs(step.time);
    const off = toPerfMs(step.time + gateLen);
    if (settings.synthOn && synth) synth.play(ev.note, ev.velocity, step.time, gateLen);
    midi.noteOn(ev.note, ev.velocity, on);
    midi.noteOff(ev.note, off);
    if (note2 !== null) {
      if (settings.synthOn && synth && settings.osc2Level > 0) {
        synth.play(note2, ev.velocity, step.time, gateLen, {
          wave: settings.osc2Wave,
          detune: settings.osc2Detune,
          level: settings.osc2Level / 100,
        });
      }
      if (settings.osc2MidiCh >= 0) {
        midi.noteOn(note2, ev.velocity, on, settings.osc2MidiCh);
        midi.noteOff(note2, off, settings.osc2MidiCh);
      }
    }
  }
  uiEvents.push({ time: step.time, off: step.time + gateLen, note2, ...ev });
}

const internalClock = new InternalClock({ getTime: audioTime, onPulse, bpm: settings.bpm });
const externalClock = new ExternalClock({
  getTime: audioTime,
  onPulse,
  onStart: () => { engine.reset(); setPlaying(true, { fromClock: true }); },
  onStop: () => setPlaying(false, { fromClock: true }),
});

// A worker-driven timer keeps the look-ahead scheduler running in background tabs.
const timerWorker = new Worker(URL.createObjectURL(new Blob(
  ['let id; onmessage = (e) => { clearInterval(id); if (e.data) id = setInterval(() => postMessage(0), e.data); };'],
  { type: 'text/javascript' },
)));
timerWorker.onmessage = () => internalClock.pump();

function setPlaying(on, { fromClock = false } = {}) {
  if (on === playing) return;
  playing = on;
  if (settings.sync === 'internal') {
    if (on) {
      ensureAudio();
      engine.reset();
      if (settings.clockOut) midi.send([0xfa]);
      internalClock.start();
      timerWorker.postMessage(25);
    } else {
      internalClock.stop();
      timerWorker.postMessage(0);
      if (settings.clockOut) midi.send([0xfc]);
    }
  } else if (!fromClock) {
    // Manual transport while following external clock (for sources that never send Start).
    if (on) { ensureAudio(); externalClock.continue(); } else externalClock.running = false;
  }
  if (!on) {
    synth?.panic();
    midi.allNotesOff();
    uiEvents.length = 0;
    clearCurrentStep();
  }
  $('play').setAttribute('aria-pressed', String(on));
  $('play').textContent = on ? '■ Stop' : '▶ Play';
}

// ---------------------------------------------------------------- note input
// Several sources (keys, chord pads, MIDI) can hold the same note at once, so
// the engine only sees a note-off once the last source lets go of it.
const holdCount = new Map();

function noteOn(note, vel = 100) {
  ensureAudio();
  const count = holdCount.get(note) || 0;
  holdCount.set(note, count + 1);
  if (count === 0) engine.noteOn(note, vel);
  // Internal clock auto-starts on the first key so the arp responds immediately.
  if (!playing && settings.sync === 'internal') setPlaying(true);
  renderKeyState();
}

function noteOff(note) {
  const count = holdCount.get(note) || 0;
  if (count === 0) return;
  if (count > 1) { holdCount.set(note, count - 1); return; }
  holdCount.delete(note);
  engine.noteOff(note);
  renderKeyState();
}

// ---------------------------------------------------------------- MIDI
const midi = new Midi({
  onMessage: (data, stamp) => {
    const [status, d1, d2] = data;
    if (status >= 0xf8) {
      if (settings.sync === 'external') {
        // Event timestamps share performance.now()'s clock; convert to audio time.
        const t = audioTime() + (stamp - performance.now()) / 1000;
        externalClock.handle(status, t);
      }
      return;
    }
    const type = status & 0xf0;
    const ch = status & 0x0f;
    if (settings.midiInCh >= 0 && ch !== settings.midiInCh) return;
    if (type === 0x90 && d2 > 0) noteOn(d1, d2);
    else if (type === 0x80 || (type === 0x90 && d2 === 0)) noteOff(d1);
    else if (type === 0xb0 && d1 === 64) { // sustain pedal toggles latch
      setLatch(d2 >= 64);
    }
  },
  onDevicesChanged: () => fillMidiSelects(),
});

function fillMidiSelects() {
  const fill = (sel, ports, current) => {
    sel.replaceChildren(new Option('None', ''));
    for (const p of ports) sel.add(new Option(p.name, p.id));
    sel.value = ports.some((p) => p.id === current) ? current : '';
  };
  fill($('midi-in'), midi.inputs, settings.midiIn);
  fill($('midi-out'), midi.outputs, settings.midiOut);
  if (midi.input?.id !== $('midi-in').value) midi.selectInput($('midi-in').value);
  if (midi.output?.id !== $('midi-out').value) midi.selectOutput($('midi-out').value);
}

// ---------------------------------------------------------------- UI: controls
function bindSelect(id, key, options, onChange) {
  const el = $(id);
  if (options) for (const [value, label] of options) el.add(new Option(label, value));
  el.value = String(settings[key]);
  el.addEventListener('change', () => {
    const v = el.value;
    settings[key] = typeof settings[key] === 'number' ? Number(v) : v;
    onChange?.(settings[key]);
    save();
  });
}

function bindRange(id, key, format, onChange) {
  const el = $(id);
  const out = $(`${id}-val`);
  el.value = settings[key];
  const show = () => { if (out) out.textContent = format(Number(el.value)); };
  show();
  el.addEventListener('input', () => {
    settings[key] = Number(el.value);
    show();
    onChange?.(settings[key]);
    save();
  });
}

function setLatch(on) {
  settings.latch = on;
  engine.setLatch(on);
  $('latch').setAttribute('aria-pressed', String(on));
  renderKeyState();
  save();
}

function setBpm(bpm) {
  if (!Number.isFinite(bpm)) return;
  internalClock.setBpm(bpm);
  settings.bpm = internalClock.bpm;
  $('bpm').value = Math.round(settings.bpm * 10) / 10;
  save();
}

$('play').addEventListener('click', () => setPlaying(!playing));
$('bpm').value = settings.bpm;
$('bpm').addEventListener('change', () => setBpm(Number($('bpm').value)));

let taps = [];
$('tap').addEventListener('click', () => {
  const now = performance.now();
  taps = taps.filter((t) => now - t < 2000);
  taps.push(now);
  if (taps.length >= 2) {
    const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
    setBpm(60000 / avg);
  }
});

bindSelect('sync', 'sync', null, (mode) => {
  setPlaying(false);
  $('bpm').disabled = mode === 'external';
  $('tap').disabled = mode === 'external';
});
$('bpm').disabled = $('tap').disabled = settings.sync === 'external';

$('clock-out').checked = settings.clockOut;
$('clock-out').addEventListener('change', () => { settings.clockOut = $('clock-out').checked; save(); });

bindSelect('mode', 'mode', MODES.map((m) => [m, MODE_LABELS[m]]), (m) => engine.setMode(m));
bindSelect('rate', 'rate', Object.keys(RATES).map((r) => [r, r]));
bindSelect('octaves', 'octaves', null, (n) => engine.setOctaves(n));
bindRange('gate', 'gate', (v) => `${v}%`);
bindRange('swing', 'swing', (v) => `${v}%`);

$('latch').setAttribute('aria-pressed', String(settings.latch));
$('latch').addEventListener('click', () => setLatch(!settings.latch));

$('synth-on').checked = settings.synthOn;
$('synth-on').addEventListener('change', () => {
  settings.synthOn = $('synth-on').checked;
  if (!settings.synthOn) synth?.panic();
  save();
});
bindSelect('wave', 'wave', null, (w) => { if (synth) synth.wave = w; });
bindRange('cutoff', 'cutoff', (v) => `${v} Hz`, (v) => { if (synth) synth.cutoff = v; });
bindRange('volume', 'volume', (v) => `${v}%`, (v) => synth?.setVolume(v / 100));

for (let c = 1; c <= 16; c++) {
  $('midi-in-ch').add(new Option(String(c), String(c - 1)));
  $('midi-out-ch').add(new Option(String(c), String(c - 1)));
}
bindSelect('midi-in-ch', 'midiInCh');
midi.outChannel = settings.midiOutCh;
bindSelect('midi-out-ch', 'midiOutCh', null, (ch) => { midi.allNotesOff(); midi.outChannel = ch; });
$('midi-in').addEventListener('change', () => {
  settings.midiIn = $('midi-in').value; midi.selectInput(settings.midiIn); save();
});
$('midi-out').addEventListener('change', () => {
  settings.midiOut = $('midi-out').value; midi.selectOutput(settings.midiOut); save();
});

midi.init().then((ok) => {
  $('midi-status').textContent = ok ? '' : 'Web MIDI unavailable — use Chrome/Edge/Firefox over http(s).';
  for (const id of ['midi-in', 'midi-out', 'midi-in-ch', 'midi-out-ch', 'osc2-midi-ch', 'clock-out']) $(id).disabled = !ok;
  if (!ok) $('sync').querySelector('[value="external"]').disabled = true;
});

// ---------------------------------------------------------------- UI: oscillator 2
function renderOsc2() {
  $('osc2-on').setAttribute('aria-pressed', String(settings.osc2On));
  $('osc2-on').textContent = settings.osc2On ? 'On' : 'Off';
  $('osc2-panel').classList.toggle('off', !settings.osc2On);
  $('osc2-mode').querySelectorAll('button').forEach((b) => {
    const sel = b.dataset.mode === settings.osc2Mode;
    b.setAttribute('aria-pressed', String(sel));
    b.setAttribute('aria-checked', String(sel));
  });
  renderSteps();
}

$('osc2-on').addEventListener('click', () => {
  settings.osc2On = !settings.osc2On;
  renderOsc2();
  save();
});
for (const [mode, label] of Object.entries(OSC2_MODES)) {
  const b = document.createElement('button');
  b.textContent = label;
  b.dataset.mode = mode;
  b.setAttribute('role', 'radio');
  b.addEventListener('click', () => {
    settings.osc2Mode = mode;
    renderOsc2();
    save();
  });
  $('osc2-mode').append(b);
}
for (let t = -24; t <= 24; t++) {
  const oct = t % 12 === 0 && t !== 0 ? ` (${t > 0 ? '+' : ''}${t / 12} oct)` : '';
  $('osc2-transpose').add(new Option(`${t > 0 ? '+' : ''}${t}${oct}`, String(t)));
}
bindSelect('osc2-wave', 'osc2Wave');
bindSelect('osc2-transpose', 'osc2Transpose');
bindRange('osc2-detune', 'osc2Detune', (v) => `${v > 0 ? '+' : ''}${v} ct`);
bindRange('osc2-level', 'osc2Level', (v) => `${v}%`);
for (let c = 1; c <= 16; c++) $('osc2-midi-ch').add(new Option(String(c), String(c - 1)));
bindSelect('osc2-midi-ch', 'osc2MidiCh', null, () => midi.allNotesOff());

// ---------------------------------------------------------------- UI: sequencer
const stepEls = [];

function renderLengthButtons() {
  const wrap = $('length');
  wrap.replaceChildren();
  for (let n = MIN_SEQ_LENGTH; n <= MAX_SEQ_LENGTH; n++) {
    const b = document.createElement('button');
    b.textContent = n;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(n === settings.length));
    b.setAttribute('aria-pressed', String(n === settings.length));
    b.title = `${n} steps`;
    b.addEventListener('click', () => {
      settings.length = n;
      engine.setLength(n);
      renderLengthButtons();
      renderSteps();
      save();
    });
    wrap.append(b);
  }
}

function formatOffset(v) {
  return v > 0 ? `+${v}` : String(v);
}

function buildSteps() {
  const wrap = $('steps');
  for (let i = 0; i < MAX_SEQ_LENGTH; i++) {
    const el = document.createElement('div');
    el.className = 'step';
    el.innerHTML = `
      <div class="led"></div>
      <div class="num">STEP ${i + 1}</div>
      <span class="osc2-val" title="Oscillator 2 offset for this step"></span>
      <div class="controls">
        <div class="col">
          <span class="cap">Pitch</span>
          <span class="value pitch-val"></span>
          <input class="vslider pitch" type="range" min="${-PITCH_RANGE}" max="${PITCH_RANGE}" step="1"
            aria-label="Step ${i + 1} pitch (semitones)" title="Double-click to reset" />
          <div class="nudge">
            <button data-d="-12" title="Down an octave">−12</button>
            <button data-d="12" title="Up an octave">+12</button>
          </div>
          <div class="nudge">
            <button data-d="-1" title="Down a semitone">−</button>
            <button data-d="1" title="Up a semitone">+</button>
          </div>
        </div>
        <div class="col">
          <span class="cap">Vol</span>
          <span class="value vol-val"></span>
          <input class="vslider vol" type="range" min="0" max="100" step="1"
            aria-label="Step ${i + 1} volume" title="Double-click for 100%" />
        </div>
      </div>`;
    const pitch = el.querySelector('.pitch');
    const vol = el.querySelector('.vol');
    const update = (patch) => {
      engine.setStep(i, patch);
      settings.steps[i] = { ...engine.steps[i] };
      renderStep(i);
      save();
    };
    pitch.addEventListener('input', () => update({ offset: Number(pitch.value) }));
    pitch.addEventListener('dblclick', () => update({ offset: 0 }));
    vol.addEventListener('input', () => update({ volume: Number(vol.value) }));
    vol.addEventListener('dblclick', () => update({ volume: 100 }));
    el.querySelectorAll('.nudge button').forEach((b) => {
      b.addEventListener('click', () => update({ offset: engine.steps[i].offset + Number(b.dataset.d) }));
    });
    wrap.append(el);
    stepEls.push(el);
  }
}

function renderStep(i) {
  const el = stepEls[i];
  const { offset, volume } = engine.steps[i];
  el.querySelector('.pitch').value = offset;
  el.querySelector('.vol').value = volume;
  const pv = el.querySelector('.pitch-val');
  pv.textContent = formatOffset(offset);
  pv.className = `value pitch-val${offset > 0 ? ' up' : offset < 0 ? ' down' : ''}`;
  el.querySelector('.vol-val').textContent = volume === 0 ? 'mute' : `${volume}%`;
  const o2 = settings.osc2Mode === 'invert' ? -offset : offset;
  el.querySelector('.osc2-val').textContent = settings.osc2On ? `osc 2: ${formatOffset(o2)}` : '';
}

function renderSteps() {
  stepEls.forEach((el, i) => {
    const off = i >= engine.length;
    el.classList.toggle('disabled', off);
    el.querySelectorAll('input, button').forEach((c) => { c.disabled = off; });
    renderStep(i);
  });
}

$('seq-reset').addEventListener('click', () => {
  for (let i = 0; i < MAX_SEQ_LENGTH; i++) engine.setStep(i, { offset: 0, volume: 100 });
  settings.steps = engine.steps.map((s) => ({ ...s }));
  renderSteps();
  save();
});

function clearCurrentStep() {
  stepEls.forEach((el) => el.classList.remove('current'));
  document.querySelectorAll('.key.sounding').forEach((k) => k.classList.remove('sounding'));
}

// ---------------------------------------------------------------- UI: keyboard
const KEY_MAP = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11,
  k: 12, o: 13, l: 14, p: 15, ';': 16,
};
const keyEls = new Map();
const pointerNotes = new Map();

function buildKeyboard() {
  const kb = $('keyboard');
  kb.replaceChildren();
  keyEls.clear();
  const base = (settings.baseOctave + 1) * 12;
  const whites = [];
  for (let n = base; n < base + 25; n++) {
    if (![1, 3, 6, 8, 10].includes(n % 12)) whites.push(n);
  }
  const whiteW = 100 / whites.length;
  for (let n = base; n < base + 25; n++) {
    const black = [1, 3, 6, 8, 10].includes(n % 12);
    const k = document.createElement('div');
    k.className = `key${black ? ' black' : ''}`;
    k.dataset.note = n;
    k.title = noteName(n);
    if (black) {
      const leftWhites = whites.filter((w) => w < n).length;
      k.style.left = `calc(${leftWhites * whiteW}% - ${whiteW * 0.3}%)`;
      k.style.width = `${whiteW * 0.6}%`;
    }
    kb.append(k);
    keyEls.set(n, k);
  }
  $('oct-label').textContent = noteName(base);
  renderKeyState();
}

$('keyboard').addEventListener('pointerdown', (e) => {
  const key = e.target.closest('.key');
  if (!key) return;
  e.preventDefault();
  const n = Number(key.dataset.note);
  pointerNotes.set(e.pointerId, n);
  key.releasePointerCapture?.(e.pointerId);
  noteOn(n, 100);
});
const pointerUp = (e) => {
  const n = pointerNotes.get(e.pointerId);
  if (n === undefined) return;
  pointerNotes.delete(e.pointerId);
  noteOff(n);
};
window.addEventListener('pointerup', pointerUp);
window.addEventListener('pointercancel', pointerUp);
$('keyboard').addEventListener('pointerover', (e) => {
  // Glide across keys while the pointer is down.
  if (!pointerNotes.has(e.pointerId)) return;
  const key = e.target.closest('.key');
  if (!key) return;
  const n = Number(key.dataset.note);
  const prev = pointerNotes.get(e.pointerId);
  if (n === prev) return;
  pointerNotes.set(e.pointerId, n);
  noteOff(prev);
  noteOn(n, 100);
});

function renderKeyState() {
  for (const [n, k] of keyEls) {
    k.classList.toggle('held', engine.physical.has(n));
    k.classList.toggle('latched', engine.active.has(n));
  }
}

function shiftOctave(d) {
  settings.baseOctave = Math.min(7, Math.max(0, settings.baseOctave + d));
  buildKeyboard();
  save();
}
$('oct-down').addEventListener('click', () => shiftOctave(-1));
$('oct-up').addEventListener('click', () => shiftOctave(1));
$('panic').addEventListener('click', () => {
  engine.clearNotes();
  holdCount.clear();
  pointerNotes.clear();
  heldKeys.clear();
  heldChords.clear();
  renderChordPads();
  synth?.panic();
  midi.allNotesOff();
  renderKeyState();
});

// ---------------------------------------------------------------- UI: chord pads
const CHORD_KEYS = { 1: 'maj', 2: 'min', 3: 'min7', 4: 'maj7' };
const heldChords = new Map(); // source id -> {type, notes}

function chordRootNote() {
  return (settings.baseOctave + 1) * 12 + settings.chordRoot;
}

function pressChord(id, type) {
  if (heldChords.has(id)) return;
  const notes = chordNotes(chordRootNote(), type);
  heldChords.set(id, { type, notes });
  notes.forEach((n) => noteOn(n, 100));
  renderChordPads();
}

function releaseChord(id) {
  const held = heldChords.get(id);
  if (!held) return;
  heldChords.delete(id);
  held.notes.forEach((n) => noteOff(n));
  renderChordPads();
}

function renderChordPads() {
  const active = new Set([...heldChords.values()].map((c) => c.type));
  document.querySelectorAll('.chord-pad').forEach((b) => {
    b.setAttribute('aria-pressed', String(active.has(b.dataset.chord)));
  });
}

function buildChordPads() {
  const root = $('chord-root');
  ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    .forEach((name, i) => root.add(new Option(name, String(i))));
  root.value = String(settings.chordRoot);
  root.addEventListener('change', () => { settings.chordRoot = Number(root.value); save(); });

  const wrap = $('chord-pads');
  Object.entries(CHORDS).forEach(([type, { label }], i) => {
    const b = document.createElement('button');
    b.className = 'chord-pad';
    b.dataset.chord = type;
    b.setAttribute('aria-pressed', 'false');
    b.title = `Hold to play ${label} (key ${i + 1})`;
    b.innerHTML = `${label}<small>${i + 1}</small>`;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pressChord(`pointer:${e.pointerId}`, type);
    });
    // Keyboard activation (Enter/Space on a focused pad) taps the chord.
    b.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        pressChord(`focus:${type}`, type);
      }
    });
    b.addEventListener('keyup', (e) => {
      if (e.key === 'Enter' || e.key === ' ') releaseChord(`focus:${type}`);
    });
    wrap.append(b);
  });
  const up = (e) => releaseChord(`pointer:${e.pointerId}`);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

const heldKeys = new Map();
const typing = (el) => el instanceof HTMLInputElement && (el.type === 'number' || el.type === 'text');
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space') {
    if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLSelectElement) return;
    e.preventDefault();
    if (!e.repeat) setPlaying(!playing);
    return;
  }
  if (e.repeat) { if (k in KEY_MAP) e.preventDefault(); return; }
  if (k in CHORD_KEYS) return pressChord(`key:${k}`, CHORD_KEYS[k]);
  if (k === 'z') return shiftOctave(-1);
  if (k === 'x') return shiftOctave(1);
  if (k in KEY_MAP && !heldKeys.has(k)) {
    const n = (settings.baseOctave + 1) * 12 + KEY_MAP[k];
    if (n > 127) return;
    heldKeys.set(k, n);
    noteOn(n, 100);
  }
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k in CHORD_KEYS) releaseChord(`key:${k}`);
  if (heldKeys.has(k)) {
    noteOff(heldKeys.get(k));
    heldKeys.delete(k);
  }
});
window.addEventListener('blur', () => {
  for (const n of heldKeys.values()) noteOff(n);
  heldKeys.clear();
  for (const id of [...heldChords.keys()]) releaseChord(id);
});

// ---------------------------------------------------------------- UI: animation loop
let lastStepEl = null;
const soundingTimers = [];
function frame() {
  const now = audioTime();
  while (uiEvents.length && uiEvents[0].time <= now) {
    const ev = uiEvents.shift();
    lastStepEl?.classList.remove('current');
    lastStepEl = stepEls[ev.stepIndex];
    lastStepEl.classList.add('current');
    $('out-src').textContent = noteName(ev.sourceNote);
    $('out-note').textContent = ev.velocity ? noteName(ev.note) : '(muted)';
    $('out-vel').textContent = ev.velocity ? `vel ${ev.velocity}` : '';
    $('out-osc2-wrap').hidden = ev.note2 === null;
    if (ev.note2 !== null) $('out-osc2').textContent = ev.velocity ? noteName(ev.note2) : '(muted)';
    const key2 = keyEls.get(ev.note2);
    if (key2 && ev.velocity) {
      key2.classList.add('sounding');
      soundingTimers.push({ key: key2, off: ev.off });
    }
    const key = keyEls.get(ev.note);
    if (key && ev.velocity) {
      key.classList.add('sounding');
      soundingTimers.push({ key, off: ev.off });
    }
  }
  for (let i = soundingTimers.length - 1; i >= 0; i--) {
    if (soundingTimers[i].off <= now) {
      soundingTimers[i].key.classList.remove('sounding');
      soundingTimers.splice(i, 1);
    }
  }
  if (settings.sync === 'external' && externalClock.intervals.length && document.activeElement !== $('bpm')) {
    $('bpm').value = externalClock.bpm.toFixed(1);
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- boot
buildSteps();
renderLengthButtons();
renderOsc2(); // also renders the steps
buildChordPads();
buildKeyboard();
requestAnimationFrame(frame);
