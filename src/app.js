import {
  ArpSeqEngine, MODES, MODE_LABELS, RATES, PITCH_RANGE,
  MIN_SEQ_LENGTH, MAX_SEQ_LENGTH, noteName, defaultSteps, CHORDS, chordNotes,
  OSC2_MODES, osc2Note, euclid, MAX_EUCLID_STEPS, chordVoicing, patternAt,
  PAD_CHORDS, MAX_PROGRESSION, PROGRESSION_BEATS, PROGRESSION_PRESETS, progressionAt, slotNotes,
  defaultProgression, sliderToFreq, freqToSlider, formatHz,
} from './core.js?v=13';
import { InternalClock, ExternalClock, pulseToStep } from './clock.js?v=13';
import { Synth, Chorus, LPG_MODES } from './synth.js?v=13';
import { Midi } from './midi.js?v=13';
import { DrumSynth, DRUM_PRESETS, DRUM_STEPS, VOICES, parsePattern, hitsAt } from './percussion.js?v=13';

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
  theme: 'auto', // 'light' | 'dark' | 'auto' (follow the system)
  synthOn: true,
  wave: 'sawtooth',
  cutoff: 2400,
  arpShape: 35,
  arpTimbre: 25,
  lpgMode: 'combo',
  arpResonance: 1.5,
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
  osc2Shape: 50,
  osc2Timbre: 40,
  osc2Lpg: 'combo',
  osc2Cutoff: 2400,
  osc2SyncCutoff: true,
  osc2Resonance: 1.5,
  chordOn: true,
  chordRate: '1/8',
  chordSteps: 8,
  chordHits: 3,
  chordRotate: 0,
  chordWave: 'triangle',
  chordOctave: 0,
  chordGate: 80,
  chordLevel: 45,
  chordCutoff: 1800,
  chordResonance: 2,
  chordChorusMix: 50,
  chordChorusRate: 0.6,
  chordChorusDepth: 50,
  chordFollowSeq: false,
  chordGateArp: false,
  progOn: false,
  progLength: 4,
  progOctave: 3,
  progression: defaultProgression(),
  drumOn: false,
  drumPreset: 'Bossa Nova',
  drumRows: null, // the pattern being played (a preset, possibly edited)
  drumLevel: 70,
  drumMuted: {},
  drumMidiCh: -1,
  chordMidiCh: -1,
};

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (saved && typeof saved === 'object') Object.assign(settings, saved);
} catch { /* storage unavailable */ }

let saveTimer;
/** Save settings, debounced for slider drags; `now` writes immediately. */
function save(now = false) {
  clearTimeout(saveTimer);
  const write = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  };
  if (now) write();
  else saveTimer = setTimeout(write, 200);
}
// Don't lose a change made in the last moments before leaving or reloading.
window.addEventListener('pagehide', () => save(true));

function applyEngineSettings() {
  engine.setMode(settings.mode);
  engine.setOctaves(settings.octaves);
  engine.setLatch(settings.latch);
  engine.setLength(settings.length);
  settings.steps.forEach((s, i) => engine.setStep(i, s));
  settings.steps = engine.steps.map((s) => ({ ...s }));
}
applyEngineSettings();

// Repair a stored progression (older saves have none, or a different shape).
{
  const fallback = defaultProgression();
  const saved = Array.isArray(settings.progression) ? settings.progression : [];
  settings.progression = fallback.map((def, i) => {
    const s = saved[i] || {};
    return {
      root: Number.isInteger(s.root) && s.root >= 0 && s.root < 12 ? s.root : def.root,
      type: s.type === 'rest' || CHORDS[s.type] ? s.type : def.type,
      beats: PROGRESSION_BEATS.includes(s.beats) ? s.beats : def.beats,
    };
  });
}

// ---------------------------------------------------------------- audio + clocks
let ctx = null;
let synth = null;
let drums = null;
let chorus = null; // chord layer effect
let playing = false;
const uiEvents = []; // {time, ...} drained by the animation loop

function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    synth = new Synth(ctx);
    synth.wave = settings.wave;
    synth.cutoff = settings.cutoff;
    synth.setVolume(settings.volume / 100);
    drums = new DrumSynth(ctx, synth.out);
    chorus = new Chorus(ctx, synth.master);
    chorus.setMix(settings.chordChorusMix / 100);
    chorus.setRate(settings.chordChorusRate);
    chorus.setDepth(settings.chordChorusDepth / 100);
    drums.setLevel(settings.drumLevel / 100);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const audioTime = () => (ctx ? ctx.currentTime : performance.now() / 1000);
// Map AudioContext time to performance.now() ms for timestamped MIDI output.
const toPerfMs = (t) => performance.now() + (t - audioTime()) * 1000;

/** Voice settings for arp oscillator 1 or 2 (each a monophonic west-coast voice). */
function westVoice(n) {
  if (n === 2) {
    return {
      mono: 'osc2',
      wave: settings.osc2Wave,
      cutoff: settings.osc2SyncCutoff ? settings.cutoff : settings.osc2Cutoff,
      shape: settings.osc2Shape / 100,
      timbre: settings.osc2Timbre / 100,
      lpg: settings.osc2Lpg,
      resonance: settings.osc2Resonance,
      detune: settings.osc2Detune,
      level: settings.osc2Level / 100,
    };
  }
  return {
    mono: 'osc1',
    wave: settings.wave,
    cutoff: settings.cutoff,
    shape: settings.arpShape / 100,
    timbre: settings.arpTimbre / 100,
    lpg: settings.lpgMode,
    resonance: settings.arpResonance,
  };
}

function playVoice(note, note2, velocity, time, gateLen) {
  const on = toPerfMs(time);
  const off = toPerfMs(time + gateLen);
  if (settings.synthOn && synth) synth.playWest(note, velocity, time, gateLen, westVoice(1));
  midi.noteOn(note, velocity, on);
  midi.noteOff(note, off);
  if (note2 === null) return;
  if (settings.synthOn && synth && settings.osc2Level > 0) {
    synth.playWest(note2, velocity, time, gateLen, westVoice(2));
  }
  if (settings.osc2MidiCh >= 0) {
    midi.noteOn(note2, velocity, on, settings.osc2MidiCh);
    midi.noteOff(note2, off, settings.osc2MidiCh);
  }
}

// Off-beat steps that are swung late have less room before the next step.
function gateLength(step, gatePct) {
  const room = step.stepNumber % 2 === 1 ? step.duration - step.delay : step.duration;
  return room * Math.min(gatePct / 100, 0.98);
}

function playArp(step) {
  const ev = engine.next();
  if (!ev) return;
  const gateLen = gateLength(step, settings.gate);
  const note2 = settings.osc2On ? osc2Note(ev, settings.osc2Mode, settings.osc2Transpose) : null;
  if (ev.velocity > 0) playVoice(ev.note, note2, ev.velocity, step.time, gateLen);
  uiEvents.push({ kind: 'arp', time: step.time, off: step.time + gateLen, note2, ...ev });
}

// Chord layer: repeats the held chord on the hits of its own Euclidean rhythm,
// alongside the arpeggiator. It only follows the sequencer if asked to.
function playChord(step) {
  if (!engine.notes.length) return;
  const rhythmPos = step.stepNumber % settings.chordSteps;
  const hit = euclid(settings.chordHits, settings.chordSteps, settings.chordRotate)[rhythmPos];
  const gateLen = gateLength(step, settings.chordGate);
  const notes = hit
    ? chordVoicing(engine.notes, {
      octave: settings.chordOctave,
      step: settings.chordFollowSeq ? engine.currentStep : null,
    })
    : [];
  const on = toPerfMs(step.time);
  const off = toPerfMs(step.time + gateLen);
  for (const { note, velocity } of notes) {
    if (settings.synthOn && synth && settings.chordLevel > 0) {
      synth.play(note, velocity, step.time, gateLen, {
        wave: settings.chordWave,
        level: settings.chordLevel / 100,
        cutoff: settings.chordCutoff,
        resonance: settings.chordResonance,
        out: chorus.input,
      });
    }
    if (settings.chordMidiCh >= 0) {
      midi.noteOn(note, velocity, on, settings.chordMidiCh);
      midi.noteOff(note, off, settings.chordMidiCh);
    }
  }
  uiEvents.push({ kind: 'chord', time: step.time, off: step.time + gateLen, rhythmPos, notes });
}

// ---- chord progression: swaps the chord the arp and chord layer play, on the clock.
let progIndex = -1;

function stepProgression(time, pulse) {
  if (!settings.progOn) return;
  const slots = settings.progression.slice(0, settings.progLength);
  const i = progressionAt(pulse, slots);
  if (i === progIndex) return;
  progIndex = i;
  engine.setProgressionNotes(slotNotes(slots[i], settings.progOctave));
  uiEvents.push({ kind: 'prog', time, index: i });
}

/** Stop the progression feeding notes; it restarts from the current clock position. */
function resetProgression() {
  progIndex = -1;
  engine.setProgressionNotes([]);
}

function onPulse(time, pulse, pulseDuration) {
  if (settings.clockOut && settings.sync === 'internal') midi.clock(toPerfMs(time));
  stepProgression(time, pulse);
  const swing = settings.swing / 100;
  // Arp first, so a chord that follows the sequencer uses the same step as the
  // arp note sounding with it.
  const step = pulseToStep(pulse, time, pulseDuration, RATES[settings.rate], swing);
  // Gate arp: arp steps only play while the chord rhythm is on a hit. Rests don't
  // advance the arp or the sequencer.
  const gated = settings.chordGateArp
    && !patternAt(pulse, RATES[settings.chordRate], settings.chordHits, settings.chordSteps, settings.chordRotate).hit;
  if (step && !gated) playArp(step);
  const cstep = pulseToStep(pulse, time, pulseDuration, RATES[settings.chordRate], swing);
  if (cstep) {
    if (settings.chordOn) playChord(cstep);
    else if (settings.chordGateArp && engine.notes.length) {
      // Keep the pattern display moving when only the gate is in use.
      uiEvents.push({ kind: 'chord', time: cstep.time, rhythmPos: cstep.stepNumber % settings.chordSteps, notes: [] });
    }
  }
  if (settings.drumOn) {
    const dstep = pulseToStep(pulse, time, pulseDuration, RATES['1/16'], swing);
    if (dstep) playDrums(dstep);
  }
}

// Percussion: one-bar 16th-note pattern, locked to the clock and swing.
function playDrums(step) {
  const hits = hitsAt(settings.drumRows, step.stepNumber, settings.drumMuted);
  for (const { id, gain } of hits) {
    if (drums && settings.drumLevel > 0) drums.play(id, step.time, gain);
    if (settings.drumMidiCh >= 0) {
      const { gm } = VOICES.find((v) => v.id === id);
      midi.noteOn(gm, Math.round(gain * 127), toPerfMs(step.time), settings.drumMidiCh);
      midi.noteOff(gm, toPerfMs(step.time + 0.05), settings.drumMidiCh);
    }
  }
  uiEvents.push({ kind: 'drum', time: step.time, step: step.stepNumber % DRUM_STEPS, hits: hits.map((h) => h.id) });
}

const internalClock = new InternalClock({ getTime: audioTime, onPulse, bpm: settings.bpm });
const externalClock = new ExternalClock({
  getTime: audioTime,
  onPulse,
  onStart: () => { engine.reset(); resetProgression(); setPlaying(true, { fromClock: true }); },
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
      resetProgression();
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
    showRhythmPos(-1);
    resetProgression();
    showProgSlot(-1);
    showDrumStep(-1, []);
    renderKeyState();
  }
  $('play').setAttribute('aria-pressed', String(on));
  // Drawn icons, not ▶/■ characters: some systems swap those for grey emoji tiles.
  $('play').innerHTML = on
    ? '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="1"/></svg><span>Stop</span>'
    : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1.5v13l11-6.5z"/></svg><span>Play</span>';
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
  // Deferred a microtask so every note of a chord press is in before the first step.
  if (!playing && settings.sync === 'internal') queueMicrotask(() => { if (!playing && engine.notes.length) setPlaying(true); });
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

// ---------------------------------------------------------------- UI: theme
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = settings.theme === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : settings.theme;
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0d0c0b' : '#cfc7b8');
  $('theme-switch').querySelectorAll('button').forEach((b) => {
    const sel = b.dataset.theme === settings.theme;
    b.setAttribute('aria-pressed', String(sel));
    b.setAttribute('aria-checked', String(sel));
  });
}
for (const [value, label] of [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']]) {
  const b = document.createElement('button');
  b.textContent = label;
  b.dataset.theme = value;
  b.setAttribute('role', 'radio');
  b.title = value === 'auto' ? 'Follow the system setting' : `${label} theme`;
  b.addEventListener('click', () => { settings.theme = value; applyTheme(); save(true); });
  $('theme-switch').append(b);
}
darkQuery.addEventListener('change', () => { if (settings.theme === 'auto') applyTheme(); });
if (!['light', 'dark', 'auto'].includes(settings.theme)) settings.theme = 'auto';
applyTheme();

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

/** A cutoff slider: logarithmic position (0..1000) ↔ frequency in Hz stored in settings. */
function bindCutoff(id, key, onChange) {
  bindLog(id, key, undefined, undefined, formatHz, onChange);
}

/** A logarithmic slider (positions 0..1000) between min and max, storing the value. */
function bindLog(id, key, min, max, format, onChange) {
  const el = $(id);
  const out = $(`${id}-val`);
  el.value = freqToSlider(settings[key], min, max);
  const show = () => { out.textContent = format(settings[key]); };
  show();
  el.addEventListener('input', () => {
    settings[key] = sliderToFreq(Number(el.value), min, max);
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
bindCutoff('cutoff', 'cutoff', (v) => {
  if (synth) synth.cutoff = v;
  if (settings.osc2SyncCutoff) showOsc2Cutoff();
});
bindRange('arp-shape', 'arpShape', (v) => (v === 0 ? 'sine' : v === 100 ? 'wave' : `${v}%`));
bindRange('arp-timbre', 'arpTimbre', (v) => `${v}%`);
bindSelect('lpg-mode', 'lpgMode', Object.entries(LPG_MODES));
bindRange('arp-res', 'arpResonance', (v) => v.toFixed(1));
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
  for (const id of ['midi-in', 'midi-out', 'midi-in-ch', 'midi-out-ch', 'osc2-midi-ch', 'chord-midi-ch', 'drum-midi-ch', 'clock-out']) $(id).disabled = !ok;
  if (!ok) $('sync').querySelector('[value="external"]').disabled = true;
});

// ---------------------------------------------------------------- UI: chord rhythm
function fillNumberSelect(id, from, to) {
  const el = $(id);
  el.replaceChildren();
  for (let v = from; v <= to; v++) el.add(new Option(String(v), String(v)));
}

let rhythmDots = [];
function renderChordRhythm() {
  const n = settings.chordSteps;
  settings.chordHits = Math.min(settings.chordHits, n);
  settings.chordRotate = Math.min(settings.chordRotate, n - 1);
  fillNumberSelect('chord-hits', 0, n);
  fillNumberSelect('chord-rotate', 0, n - 1);
  $('chord-steps').value = String(n);
  $('chord-hits').value = String(settings.chordHits);
  $('chord-rotate').value = String(settings.chordRotate);
  $('chord-on').setAttribute('aria-pressed', String(settings.chordOn));
  $('chord-on').textContent = settings.chordOn ? 'On' : 'Off';
  $('chord-panel').classList.toggle('off', !settings.chordOn);

  const pattern = euclid(settings.chordHits, n, settings.chordRotate);
  const wrap = $('chord-pattern');
  wrap.replaceChildren();
  rhythmDots = pattern.map((hit, i) => {
    const d = document.createElement('span');
    d.className = `dot${hit ? ' hit' : ''}`;
    d.title = `Step ${i + 1}: ${hit ? 'hit' : 'rest'}`;
    wrap.append(d);
    return d;
  });
  wrap.setAttribute('aria-label', `Pattern ${pattern.map((h) => (h ? 'x' : '.')).join('')}`);
}

let lastRhythmDot = null;
function showRhythmPos(pos) {
  lastRhythmDot?.classList.remove('now');
  lastRhythmDot = rhythmDots[pos] || null;
  lastRhythmDot?.classList.add('now');
}

$('chord-on').addEventListener('click', () => {
  settings.chordOn = !settings.chordOn;
  if (!settings.chordOn) showRhythmPos(-1);
  renderChordRhythm();
  save();
});
fillNumberSelect('chord-steps', 2, MAX_EUCLID_STEPS);
for (const [id, key] of [['chord-steps', 'chordSteps'], ['chord-hits', 'chordHits'], ['chord-rotate', 'chordRotate']]) {
  $(id).addEventListener('change', () => {
    settings[key] = Number($(id).value);
    renderChordRhythm();
    save();
  });
}
bindSelect('chord-rate', 'chordRate', Object.keys(RATES).map((r) => [r, r]));
bindSelect('chord-wave', 'chordWave');
for (let o = -2; o <= 2; o++) $('chord-octave').add(new Option(o > 0 ? `+${o}` : String(o), String(o)));
bindSelect('chord-octave', 'chordOctave');
bindRange('chord-gate', 'chordGate', (v) => `${v}%`);
bindRange('chord-level', 'chordLevel', (v) => `${v}%`);
bindCutoff('chord-cutoff', 'chordCutoff');
bindRange('chord-res', 'chordResonance', (v) => v.toFixed(1));
bindRange('chorus-mix', 'chordChorusMix', (v) => `${v}%`, (v) => chorus?.setMix(v / 100));
bindRange('chorus-rate', 'chordChorusRate', (v) => `${v.toFixed(2)} Hz`, (v) => chorus?.setRate(v));
bindRange('chorus-depth', 'chordChorusDepth', (v) => `${v}%`, (v) => chorus?.setDepth(v / 100));
$('chord-gate-arp').checked = settings.chordGateArp;
$('chord-gate-arp').addEventListener('change', () => { settings.chordGateArp = $('chord-gate-arp').checked; save(); });
$('chord-follow').checked = settings.chordFollowSeq;
$('chord-follow').addEventListener('change', () => { settings.chordFollowSeq = $('chord-follow').checked; save(); });
for (let c = 1; c <= 16; c++) $('chord-midi-ch').add(new Option(String(c), String(c - 1)));
bindSelect('chord-midi-ch', 'chordMidiCh', null, () => midi.allNotesOff());
renderChordRhythm();

// ---------------------------------------------------------------- UI: progression
const NOTE_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHORD_SUFFIX = { maj: '', min: 'm', min7: 'm7', maj7: 'maj7', dom7: '7', dim: 'dim', sus4: 'sus4' };
const slotEls = [];

function slotName(slot) {
  return slot.type === 'rest' ? '—' : NOTE_CLASSES[slot.root] + CHORD_SUFFIX[slot.type];
}

function progEdited() {
  progIndex = -1; // pick up the change on the next clock pulse
  save();
}

function buildProgression() {
  const wrap = $('prog-slots');
  for (let i = 0; i < MAX_PROGRESSION; i++) {
    const el = document.createElement('div');
    el.className = 'slot';
    el.innerHTML = `
      <div class="num">${i + 1}</div>
      <div class="name"></div>
      <select class="root" aria-label="Slot ${i + 1} root"></select>
      <select class="type" aria-label="Slot ${i + 1} chord"></select>
      <select class="beats" aria-label="Slot ${i + 1} length"></select>`;
    const root = el.querySelector('.root');
    const type = el.querySelector('.type');
    const beats = el.querySelector('.beats');
    NOTE_CLASSES.forEach((n, v) => root.add(new Option(n, String(v))));
    for (const [t, { label }] of Object.entries(CHORDS)) type.add(new Option(label, t));
    type.add(new Option('Rest', 'rest'));
    for (const b of PROGRESSION_BEATS) beats.add(new Option(`${b} beat${b > 1 ? 's' : ''}`, String(b)));
    const update = () => {
      settings.progression[i] = { root: Number(root.value), type: type.value, beats: Number(beats.value) };
      renderSlot(i);
      progEdited();
    };
    [root, type, beats].forEach((s) => s.addEventListener('change', update));
    wrap.append(el);
    slotEls.push(el);
  }

  const len = $('prog-length');
  for (let n = 1; n <= MAX_PROGRESSION; n++) {
    const b = document.createElement('button');
    b.textContent = n;
    b.dataset.n = n;
    b.title = `${n} chord${n > 1 ? 's' : ''}`;
    b.addEventListener('click', () => {
      settings.progLength = n;
      renderProgression();
      progEdited();
    });
    len.append(b);
  }

  for (let o = 1; o <= 6; o++) $('prog-octave').add(new Option(`C${o}`, String(o)));
  bindSelect('prog-octave', 'progOctave', null, () => progEdited());

  const preset = $('prog-preset');
  for (const name of Object.keys(PROGRESSION_PRESETS)) preset.add(new Option(name, name));
  preset.addEventListener('change', () => {
    const chords = PROGRESSION_PRESETS[preset.value];
    preset.value = '';
    if (!chords) return;
    chords.forEach(([root, type], i) => { settings.progression[i] = { root, type, beats: 4 }; });
    settings.progLength = chords.length;
    renderProgression();
    progEdited();
  });

  $('prog-on').addEventListener('click', () => {
    settings.progOn = !settings.progOn;
    if (settings.progOn) {
      progIndex = -1;
      ensureAudio();
      // Start the transport so the progression plays without holding any keys.
      if (!playing && settings.sync === 'internal') setPlaying(true);
    } else {
      resetProgression();
      showProgSlot(-1);
      renderKeyState();
    }
    renderProgression();
    save();
  });
}

function renderSlot(i) {
  const el = slotEls[i];
  const slot = settings.progression[i];
  el.querySelector('.root').value = String(slot.root);
  el.querySelector('.type').value = slot.type;
  el.querySelector('.beats').value = String(slot.beats);
  el.querySelector('.root').disabled = slot.type === 'rest' || i >= settings.progLength;
  el.querySelector('.name').textContent = slotName(slot);
}

function renderProgression() {
  $('prog-on').setAttribute('aria-pressed', String(settings.progOn));
  $('prog-on').textContent = settings.progOn ? 'On' : 'Off';
  $('prog-panel').classList.toggle('off', !settings.progOn);
  $('prog-length').querySelectorAll('button').forEach((b) => {
    b.setAttribute('aria-pressed', String(Number(b.dataset.n) === settings.progLength));
  });
  slotEls.forEach((el, i) => {
    const off = i >= settings.progLength;
    el.classList.toggle('disabled', off);
    el.querySelectorAll('select').forEach((s) => { s.disabled = off; });
    renderSlot(i);
  });
}

let lastSlotEl = null;
function showProgSlot(i) {
  lastSlotEl?.classList.remove('current');
  lastSlotEl = slotEls[i] || null;
  lastSlotEl?.classList.add('current');
}

buildProgression();
renderProgression();

// ---------------------------------------------------------------- UI: percussion
const drumCells = {}; // voice id -> [cell elements]
const drumLabels = {};
let drumCol = -1;

function validDrumRows(rows) {
  return rows && VOICES.every(({ id }) => Array.isArray(rows[id]) && rows[id].length === DRUM_STEPS);
}
if (!DRUM_PRESETS[settings.drumPreset] && settings.drumPreset !== 'custom') settings.drumPreset = 'Bossa Nova';
if (!validDrumRows(settings.drumRows)) settings.drumRows = parsePattern(DRUM_PRESETS[settings.drumPreset] || {});
if (!settings.drumMuted || typeof settings.drumMuted !== 'object') settings.drumMuted = {};

function buildDrums() {
  const preset = $('drum-preset');
  for (const name of Object.keys(DRUM_PRESETS)) preset.add(new Option(name, name));
  preset.add(new Option('Custom (edited)', 'custom'));
  preset.value = settings.drumPreset;
  preset.addEventListener('change', () => {
    if (preset.value === 'custom') return;
    settings.drumPreset = preset.value;
    settings.drumRows = parsePattern(DRUM_PRESETS[preset.value]);
    renderDrumGrid();
    save();
  });

  const grid = $('drum-grid');
  for (const { id, label } of VOICES) {
    const name = document.createElement('button');
    name.className = 'drum-name';
    name.textContent = label;
    name.title = `Mute / unmute ${label}`;
    name.addEventListener('click', () => {
      settings.drumMuted[id] = !settings.drumMuted[id];
      renderDrumGrid();
      save();
    });
    grid.append(name);
    drumLabels[id] = name;
    drumCells[id] = [];
    for (let s = 0; s < DRUM_STEPS; s++) {
      const c = document.createElement('button');
      c.className = `cell${s % 4 === 0 ? ' beat' : ''}`;
      c.setAttribute('aria-label', `${label} step ${s + 1}`);
      c.addEventListener('click', () => {
        // Cycle: off → hit → accent → off.
        const v = settings.drumRows[id][s];
        settings.drumRows[id][s] = v === 0 ? 0.65 : v < 1 ? 1 : 0;
        settings.drumPreset = 'custom';
        $('drum-preset').value = 'custom';
        renderDrumGrid();
        save();
      });
      grid.append(c);
      drumCells[id].push(c);
    }
  }

  $('drum-on').addEventListener('click', () => {
    settings.drumOn = !settings.drumOn;
    if (settings.drumOn) {
      ensureAudio();
      // Start the transport so the percussion plays without holding any keys.
      if (!playing && settings.sync === 'internal') setPlaying(true);
    } else showDrumStep(-1, []);
    renderDrumGrid();
    save();
  });
  bindRange('drum-level', 'drumLevel', (v) => `${v}%`, (v) => drums?.setLevel(v / 100));
  for (let c = 1; c <= 16; c++) $('drum-midi-ch').add(new Option(String(c), String(c - 1)));
  bindSelect('drum-midi-ch', 'drumMidiCh', null, () => midi.allNotesOff());
}

function renderDrumGrid() {
  $('drum-on').setAttribute('aria-pressed', String(settings.drumOn));
  $('drum-on').textContent = settings.drumOn ? 'On' : 'Off';
  $('drum-panel').classList.toggle('off', !settings.drumOn);
  for (const { id } of VOICES) {
    drumLabels[id].classList.toggle('muted', !!settings.drumMuted[id]);
    drumLabels[id].setAttribute('aria-pressed', String(!settings.drumMuted[id]));
    drumCells[id].forEach((c, s) => {
      const v = settings.drumRows[id][s];
      c.classList.toggle('on', v > 0);
      c.classList.toggle('acc', v >= 1);
    });
  }
}

function showDrumStep(step, hits) {
  if (drumCol >= 0) for (const { id } of VOICES) drumCells[id][drumCol].classList.remove('now');
  drumCol = step;
  if (step >= 0) for (const { id } of VOICES) drumCells[id][step].classList.add('now');
  for (const { id } of VOICES) drumLabels[id].classList.toggle('hit', hits.includes(id));
}

buildDrums();
renderDrumGrid();

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
bindRange('osc2-shape', 'osc2Shape', (v) => (v === 0 ? 'sine' : v === 100 ? 'wave' : `${v}%`));
bindRange('osc2-timbre', 'osc2Timbre', (v) => `${v}%`);
bindSelect('osc2-lpg', 'osc2Lpg', Object.entries(LPG_MODES));
bindCutoff('osc2-cutoff', 'osc2Cutoff');
bindRange('osc2-res', 'osc2Resonance', (v) => v.toFixed(1));
$('osc2-sync').checked = settings.osc2SyncCutoff;
$('osc2-sync').addEventListener('change', () => {
  settings.osc2SyncCutoff = $('osc2-sync').checked;
  showOsc2Cutoff();
  save();
});
/** While synced, Osc 2's cutoff slider follows Osc 1's and is locked. */
function showOsc2Cutoff() {
  const el = $('osc2-cutoff');
  el.disabled = settings.osc2SyncCutoff;
  const f = settings.osc2SyncCutoff ? settings.cutoff : settings.osc2Cutoff;
  el.value = freqToSlider(f);
  $('osc2-cutoff-val').textContent = settings.osc2SyncCutoff ? `${formatHz(f)} (sync)` : formatHz(f);
}
showOsc2Cutoff();

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
      <div class="num" aria-label="Step ${i + 1}">${i + 1}</div>
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
    k.classList.toggle('latched', engine.notes.some((x) => x.note === n));
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
  PAD_CHORDS.map((type) => [type, CHORDS[type]]).forEach(([type, { label }], i) => {
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
    if (ev.kind === 'drum') {
      showDrumStep(ev.step, ev.hits);
      continue;
    }
    if (ev.kind === 'prog') {
      showProgSlot(ev.index);
      renderKeyState();
      continue;
    }
    if (ev.kind === 'chord') {
      showRhythmPos(ev.rhythmPos);
      for (const { note } of ev.notes) {
        const key = keyEls.get(note);
        if (!key) continue;
        key.classList.add('sounding');
        soundingTimers.push({ key, off: ev.off });
      }
      continue;
    }
    lastStepEl?.classList.remove('current');
    lastStepEl = stepEls[ev.stepIndex];
    lastStepEl.classList.add('current');
    $('out-src').textContent = noteName(ev.sourceNote);
    $('out-note').textContent = ev.velocity ? noteName(ev.note) : '(muted)';
    $('out-vel').textContent = ev.velocity ? `vel ${ev.velocity}` : '';
    $('out-osc2-wrap').hidden = ev.note2 === null;
    if (ev.note2 !== null) $('out-osc2').textContent = ev.velocity ? noteName(ev.note2) : '(muted)';
    if (ev.velocity) {
      for (const n of [ev.note, ev.note2]) {
        const key = keyEls.get(n);
        if (!key) continue;
        key.classList.add('sounding');
        soundingTimers.push({ key, off: ev.off });
      }
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
