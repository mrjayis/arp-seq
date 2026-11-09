import {
  ArpSeqEngine, MODES, MODE_LABELS, RATES, PITCH_RANGE,
  MIN_SEQ_LENGTH, MAX_SEQ_LENGTH, noteName, defaultSteps, CHORDS, chordNotes,
  OSC2_MODES, osc2Note, euclid, MAX_EUCLID_STEPS, chordVoicing, patternAt,
  PAD_CHORDS, MAX_PROGRESSION, PROGRESSION_BEATS, PROGRESSION_PRESETS, progressionAt, slotNotes,
  defaultProgression, sliderToFreq, freqToSlider, formatHz,
} from './core.js?v=38';
import { InternalClock, ExternalClock, pulseToStep } from './clock.js?v=38';
import { Synth, Chorus, LPG_MODES, MOD_TYPES, MAX_FM_INDEX, blendGains, pulseOffsets } from './synth.js?v=38';
import { Midi } from './midi.js?v=38';
import { Delay, Reverb, delaySeconds, DELAY_TIMES } from './fx.js?v=38';
import { DrumSynth, DRUM_STEPS, KITS, KIT_ORDER, parsePattern, hitsAt, assignSamples } from './percussion.js?v=38';
import { saveSample, deleteSample, clearSamples, loadSamples, saveBreak, loadBreak } from './samples.js?v=38';
import {
  BreakPlayer, SLICE_COUNTS, BREAK_STEPS, BREAK_BARS, BREAK_FX, ROLL_TYPES, MAX_ROLL, fitRate, rowTriggers,
  inOrder, chop, randomize, resizePattern, peaks, equalPoints, sliceOffset, sliceAt, detectTransients,
} from './breaks.js?v=38';

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
  theme: 'mac', // 'mac' (System 7) | 'light' | 'dark' | 'auto' (faceplate, following the system)
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
  osc2Mod: 'off', // oscillator 2 → oscillator 1: 'off' | 'am' | 'fm'
  osc2ModDepth: 30,
  chordOn: true,
  chordRate: '1/8',
  chordSteps: 8,
  chordHits: 3,
  chordRotate: 0,
  chordWave: 'sawtooth',
  chordWave2: 'square',
  chordBlend: 50, // 0 = Wave 1 only, 100 = Wave 2 only
  chordDetune2: 7, // cents
  chordSub: 'off', // 'off' | 'square' | 'sine': one octave below the lowest chord note
  chordSubLevel: 60,
  chordPulseWidth: 50, // % — applies to whichever chord wave is Square
  chordPwmDepth: 40,
  chordPwmRate: 0.8, // Hz
  delayTime: '1/8D',
  delayFeedback: 35,
  delayTone: 4500,
  delayPingPong: true,
  delaySendArp: 30,
  delaySendChords: 0,
  delaySendDrums: 0,
  reverbSize: 2200, // ms of tail
  reverbPre: 20, // ms
  reverbTone: 7000,
  reverbSendArp: 25,
  reverbSendChords: 35,
  reverbSendDrums: 15,
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
  drumKit: 'latin', // 'latin' | '808' | 'linn' | 'user'
  drumPreset: 'Bossa Nova',
  drumRows: null, // the pattern being played (a preset, possibly edited)
  drumLevel: 70,
  drumMuted: {},
  drumMidiCh: -1,
  breakOn: false,
  breakSlices: 16,
  breakSteps: 32,
  breakBars: 2, // how long the loaded break is
  breakFit: true, // stretch the break to the tempo
  breakPitch: 0,
  breakLevel: 80,
  breakPattern: null, // tracker rows: {slice, vol, pitch, chance, roll, rollType, fx}
  breakSliceMode: 'equal', // 'equal' | 'transient' (slices start on detected hits)
  breakSensitivity: 50,
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
// Each source plays into its own bus; the buses feed the mix and the effect sends.
const buses = {};
const sends = { delay: {}, reverb: {} };
let delayFx = null;
let reverbFx = null;
let playing = false;
const uiEvents = []; // {time, ...} drained by the animation loop

function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    synth = new Synth(ctx);
    synth.wave = settings.wave;
    synth.cutoff = settings.cutoff;
    synth.setVolume(settings.volume / 100);
    buses.arp = ctx.createGain();
    buses.chords = ctx.createGain();
    buses.drums = ctx.createGain();
    buses.arp.connect(synth.master);
    buses.chords.connect(synth.master);
    buses.drums.connect(synth.out);
    delayFx = new Delay(ctx, synth.master);
    reverbFx = new Reverb(ctx, synth.master);
    for (const [fx, node] of [['delay', delayFx], ['reverb', reverbFx]]) {
      for (const src of ['arp', 'chords', 'drums']) {
        sends[fx][src] = ctx.createGain();
        buses[src].connect(sends[fx][src]).connect(node.input);
      }
    }
    applyFx();
    drums = new DrumSynth(ctx, buses.drums);
    breakPlayer = new BreakPlayer(ctx, buses.drums);
    breakPlayer.setLevel(settings.breakLevel / 100);
    if (breakBuffer) breakPlayer.setBuffer(breakBuffer);
    decodeAllSamples();
    chorus = new Chorus(ctx, buses.chords);
    chorus.setMix(settings.chordChorusMix / 100);
    chorus.setRate(settings.chordChorusRate);
    chorus.setDepth(settings.chordChorusDepth / 100);
    synth.setPwmRate(settings.chordPwmRate);
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

/** Oscillator 2 modulating oscillator 1 at `modNote` (oscillator 2's pitch), or null. */
function modSpec(modNote) {
  if (settings.osc2Mod === 'off' || settings.osc2ModDepth <= 0) return null;
  return {
    type: settings.osc2Mod,
    depth: settings.osc2ModDepth / 100,
    note: modNote,
    detune: settings.osc2Detune,
    wave: settings.osc2Wave,
  };
}

function playVoice(note, note2, velocity, time, gateLen, modNote) {
  const on = toPerfMs(time);
  const off = toPerfMs(time + gateLen);
  if (settings.synthOn && synth) {
    synth.playWest(note, velocity, time, gateLen, { ...westVoice(1), mod: modSpec(modNote), out: buses.arp });
  }
  midi.noteOn(note, velocity, on);
  midi.noteOff(note, off);
  if (note2 === null) return;
  if (settings.synthOn && synth && settings.osc2Level > 0) {
    synth.playWest(note2, velocity, time, gateLen, { ...westVoice(2), out: buses.arp });
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
  if (ev.rest) {
    // Step switched off: strike nothing, but slide whatever tail is still ringing
    // to the note this step would have played (each oscillator its own way).
    const modNote = osc2Note(ev, settings.osc2Mode, settings.osc2Transpose);
    const note2 = settings.osc2On ? modNote : null;
    if (settings.synthOn && synth) {
      synth.retune('osc1', ev.note, step.time, modNote);
      if (note2 !== null) synth.retune('osc2', note2, step.time);
    }
    uiEvents.push({ kind: 'arp', time: step.time, off: step.time, ...ev, note2 });
    return;
  }
  // Oscillator 2's pitch for this step: heard if it's on, and used to modulate
  // oscillator 1 even when it's off (a pure modulator).
  const modNote = osc2Note(ev, settings.osc2Mode, settings.osc2Transpose);
  const note2 = settings.osc2On ? modNote : null;
  if (ev.velocity > 0) playVoice(ev.note, note2, ev.velocity, step.time, gateLen, modNote);
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
  const [g1, g2] = blendGains(settings.chordBlend / 100);
  const pulse = pulseOffsets(settings.chordPulseWidth, settings.chordPwmDepth);
  const layers = [
    { wave: settings.chordWave, gain: g1, detune: 0, pulse },
    { wave: settings.chordWave2, gain: g2, detune: settings.chordDetune2, pulse },
  ];
  const filterOpts = { cutoff: settings.chordCutoff, resonance: settings.chordResonance };
  const sound = settings.synthOn && synth && settings.chordLevel > 0;
  const sendMidi = (note, velocity) => {
    if (settings.chordMidiCh < 0) return;
    midi.noteOn(note, velocity, on, settings.chordMidiCh);
    midi.noteOff(note, off, settings.chordMidiCh);
  };
  for (const { note, velocity } of notes) {
    if (sound) {
      synth.play(note, velocity, step.time, gateLen, {
        ...filterOpts, layers, level: settings.chordLevel / 100, out: chorus.input,
      });
    }
    sendMidi(note, velocity);
  }
  // Sub: one octave under the lowest chord note, kept out of the chorus so the bass stays tight.
  const sub = settings.chordSub !== 'off' && notes.length && notes[0].note >= 12 ? notes[0] : null;
  if (sub) {
    if (sound && settings.chordSubLevel > 0) {
      synth.play(sub.note - 12, sub.velocity, step.time, gateLen, {
        ...filterOpts,
        wave: settings.chordSub,
        out: buses.chords,
        level: (settings.chordLevel / 100) * (settings.chordSubLevel / 100) * 1.4,
      });
    }
    sendMidi(sub.note - 12, sub.velocity);
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
  if (settings.drumOn || settings.breakOn) {
    const dstep = pulseToStep(pulse, time, pulseDuration, RATES['1/16'], swing);
    if (dstep && settings.drumOn) playDrums(dstep);
    if (dstep && settings.breakOn) playBreakStep(dstep);
  }
}

// Percussion: one-bar 16th-note pattern, locked to the clock and swing.
function playDrums(step) {
  const voices = kitVoices();
  const hits = hitsAt(settings.drumRows, step.stepNumber, settings.drumMuted, voices);
  for (const { id, gain } of hits) {
    // Your samples: each row has its own level (the sample mixer).
    const user = settings.drumKit === 'user';
    const rowLevel = user ? (settings.sampleLevels?.[id] ?? 100) / 100 : 1;
    const rowTune = user ? settings.sampleTunes?.[id] ?? 0 : 0;
    if (drums && settings.drumLevel > 0 && rowLevel > 0) drums.play(id, step.time, gain * rowLevel, rowTune);
    if (settings.drumMidiCh >= 0) {
      const { gm } = voices.find((v) => v.id === id);
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
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', { dark: '#0d0c0b', mac: '#ffffff' }[t] || '#cfc7b8');
  $('theme-switch').querySelectorAll('button').forEach((b) => {
    const sel = b.dataset.theme === settings.theme;
    b.setAttribute('aria-pressed', String(sel));
    b.setAttribute('aria-checked', String(sel));
  });
}
for (const [value, label] of [['mac', 'System 7'], ['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']]) {
  const b = document.createElement('button');
  b.textContent = label;
  b.dataset.theme = value;
  b.setAttribute('role', 'radio');
  b.title = { auto: 'Faceplate, following the system light/dark setting', mac: 'Black-and-white classic Mac look' }[value] || `${label} faceplate`;
  b.addEventListener('click', () => { settings.theme = value; applyTheme(); save(true); });
  $('theme-switch').append(b);
}
darkQuery.addEventListener('change', () => { if (settings.theme === 'auto') applyTheme(); });
// One-time switch to the System 7 look for saves made before it existed.
if (!settings.themeV2) { settings.theme = 'mac'; settings.themeV2 = true; save(); }
if (!['mac', 'light', 'dark', 'auto'].includes(settings.theme)) settings.theme = 'mac';
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
  updateDelayTime();
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
bindSelect('chord-wave2', 'chordWave2');
bindRange('chord-blend', 'chordBlend', (v) => (v === 0 ? 'Wave 1' : v === 100 ? 'Wave 2' : `${100 - v} / ${v}`));
bindRange('chord-detune2', 'chordDetune2', (v) => `${v > 0 ? '+' : ''}${v} ct`);
bindSelect('chord-sub', 'chordSub', null, () => { $('chord-sub-level').disabled = settings.chordSub === 'off'; });
bindRange('chord-sub-level', 'chordSubLevel', (v) => `${v}%`);
bindRange('chord-width', 'chordPulseWidth', (v) => `${v}%`);
bindRange('chord-pwm-depth', 'chordPwmDepth', (v) => `${v}%`);
bindRange('chord-pwm-rate', 'chordPwmRate', (v) => `${v.toFixed(2)} Hz`, (v) => synth?.setPwmRate(v));
/** PWM only shapes Square waves: grey the row out when neither chord wave is Square. */
function showPwm() {
  const off = settings.chordWave !== 'square' && settings.chordWave2 !== 'square';
  ['chord-width', 'chord-pwm-depth', 'chord-pwm-rate'].forEach((id) => { $(id).disabled = off; });
  $('pwm-note').textContent = off ? 'Set Wave 1 or Wave 2 to Square to use PWM.' : '';
}
$('chord-wave').addEventListener('change', showPwm);
$('chord-wave2').addEventListener('change', showPwm);
showPwm();
$('chord-sub-level').disabled = settings.chordSub === 'off';
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
// The current kit's pattern, preset and mutes live in settings.drumRows / drumPreset /
// drumMuted; the other kits' are parked in settings.drumKitStore until switched back.
const drumCells = {}; // voice id -> [cell elements]
const drumLabels = {};
let drumCol = -1;

const kit = () => KITS[settings.drumKit] || KITS.latin;
const kitVoices = () => kit().voices;

/**
 * A stored pattern made valid for the kit: rows the kit has gained since it was
 * saved are added empty, so earlier edits survive. Null if nothing usable.
 */
function normalizeRows(rows, voices) {
  if (!rows || typeof rows !== 'object') return null;
  const ok = (r) => Array.isArray(r) && r.length === DRUM_STEPS;
  if (!voices.some(({ id }) => ok(rows[id]))) return null;
  const out = {};
  for (const { id } of voices) out[id] = ok(rows[id]) ? rows[id] : new Array(DRUM_STEPS).fill(0);
  return out;
}

/** Make the current kit's state valid (also used after loading an older save). */
function loadKitState() {
  if (!KITS[settings.drumKit]) settings.drumKit = 'latin';
  const { presets, voices } = kit();
  if (!presets[settings.drumPreset] && settings.drumPreset !== 'custom') settings.drumPreset = Object.keys(presets)[0];
  settings.drumRows = normalizeRows(settings.drumRows, voices)
    || parsePattern(presets[settings.drumPreset] || {}, voices);
  if (!settings.drumMuted || typeof settings.drumMuted !== 'object') settings.drumMuted = {};
}
if (!settings.drumKitStore || typeof settings.drumKitStore !== 'object') settings.drumKitStore = {};
loadKitState();

function switchKit(next) {
  if (next === settings.drumKit || !KITS[next]) return;
  settings.drumKitStore[settings.drumKit] = {
    preset: settings.drumPreset, rows: settings.drumRows, muted: settings.drumMuted,
  };
  const stored = settings.drumKitStore[next] || {};
  settings.drumKit = next;
  settings.drumPreset = stored.preset;
  settings.drumRows = stored.rows;
  settings.drumMuted = stored.muted || {};
  loadKitState();
  showDrumStep(-1, []);
  $('sample-tools').hidden = settings.drumKit !== 'user';
  if (settings.drumKit === 'user') updateSampleStatus();
  buildDrumGrid();
  fillDrumPresets();
  renderDrumGrid();
  save();
}

function fillDrumPresets() {
  const preset = $('drum-preset');
  preset.replaceChildren();
  for (const name of Object.keys(kit().presets)) preset.add(new Option(name, name));
  preset.add(new Option('Custom (edited)', 'custom'));
  preset.value = settings.drumPreset;
}

function buildDrumGrid() {
  const grid = $('drum-grid');
  grid.replaceChildren();
  for (const key of Object.keys(drumCells)) delete drumCells[key];
  for (const key of Object.keys(drumLabels)) delete drumLabels[key];
  drumCol = -1;
  for (const { id, label } of kitVoices()) {
    const name = document.createElement('button');
    name.className = 'drum-name';
    name.textContent = label;
    name.title = `Mute / unmute ${label}`;
    name.addEventListener('click', () => {
      settings.drumMuted[id] = !settings.drumMuted[id];
      renderDrumGrid();
      save();
    });
    if (settings.drumKit === 'user') {
      // Drop an audio file onto a row to load it there.
      name.addEventListener('dragover', (e) => { e.preventDefault(); name.classList.add('drop'); });
      name.addEventListener('dragleave', () => name.classList.remove('drop'));
      name.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        name.classList.remove('drop');
        addSampleFiles(e.dataTransfer.files, id);
      });
    }
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
}

function buildDrums() {
  for (const key of KIT_ORDER) $('drum-kit').add(new Option(KITS[key].label, key));
  $('drum-kit').value = settings.drumKit;
  $('drum-kit').addEventListener('change', () => switchKit($('drum-kit').value));
  fillDrumPresets();
  $('drum-preset').addEventListener('change', () => {
    const preset = $('drum-preset');
    if (preset.value === 'custom') return;
    settings.drumPreset = preset.value;
    settings.drumRows = parsePattern(kit().presets[preset.value], kitVoices());
    renderDrumGrid();
    save();
  });
  buildDrumGrid();

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
  const user = settings.drumKit === 'user';
  if (user) renderSampleMap();
  for (const { id, label } of kitVoices()) {
    if (user) {
      const sample = sampleStore[id];
      drumLabels[id].classList.toggle('empty', !sample);
      drumLabels[id].title = sample
        ? `${label}: ${sample.name} · click to mute · drop a file to replace`
        : `${label}: empty · drop an audio file here`;
    }
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
  const ids = kitVoices().map((v) => v.id).filter((id) => drumCells[id]);
  if (drumCol >= 0) for (const id of ids) drumCells[id][drumCol]?.classList.remove('now');
  drumCol = step;
  if (step >= 0) for (const id of ids) drumCells[id][step].classList.add('now');
  for (const id of ids) drumLabels[id].classList.toggle('hit', hits.includes(id));
}

// ---- "Your samples": recordings the user loads, kept in this browser only.
const sampleStore = {}; // slot -> {name, data: ArrayBuffer}

async function decodeInto(slot, data) {
  const buffer = await ctx.decodeAudioData(data.slice(0)); // decoding detaches its input
  drums.setSample(slot, buffer);
}

function decodeAllSamples() {
  for (const [slot, { data }] of Object.entries(sampleStore)) decodeInto(slot, data).catch(() => {});
}

function updateSampleStatus(message = '') {
  const n = Object.keys(sampleStore).length;
  $('sample-status').textContent = message || `${n} of ${kitVoices().length} rows loaded. Samples stay in this browser only.`;
}

async function addSampleFiles(fileList, targetSlot = null) {
  ensureAudio();
  const files = [...fileList].filter((f) => f.type.startsWith('audio') || /\.(wav|aiff?|mp3|ogg|flac|m4a)$/i.test(f.name));
  if (!files.length) { updateSampleStatus('No audio files found in that drop.'); return; }
  const plan = targetSlot
    ? { assigned: [[targetSlot, files[0]]], leftover: files.slice(1) }
    : assignSamples(files, new Set(Object.keys(sampleStore)));
  const failed = [];
  for (const [slot, file] of plan.assigned) {
    const data = await file.arrayBuffer();
    try {
      await decodeInto(slot, data);
    } catch {
      failed.push(file.name);
      continue;
    }
    sampleStore[slot] = { name: file.name, data };
    try { await saveSample(slot, { name: file.name, data }); } catch { /* storage unavailable: kept for this visit */ }
  }
  renderDrumGrid();
  const done = plan.assigned.length - failed.length;
  const notes = [`Loaded ${done} sample${done === 1 ? '' : 's'}.`];
  if (failed.length) notes.push(`Couldn't read ${failed.join(', ')} (try WAV).`);
  if (plan.leftover.length) notes.push(`No free row for ${plan.leftover.map((f) => f.name).join(', ')}.`);
  updateSampleStatus(notes.join(' '));
}

/**
 * Sample map: which file is on each row, with a menu to put any loaded file on
 * any row (swapping with whatever was there) or empty it.
 */
function renderSampleMap() {
  const wrap = $('sample-map');
  wrap.replaceChildren();
  const loaded = Object.entries(sampleStore).sort((a, b) => a[1].name.localeCompare(b[1].name));
  for (const { id, label } of kitVoices()) {
    const field = document.createElement('label');
    field.className = 'field';
    field.textContent = label;
    const select = document.createElement('select');
    select.add(new Option('— empty —', ''));
    for (const [slot, { name }] of loaded) select.add(new Option(name, slot));
    select.value = sampleStore[id] ? id : '';
    select.addEventListener('change', () => moveSample(select.value, id));
    field.append(select);
    // Level for this row: 0–150%, so a quiet recording can be lifted a little.
    const level = document.createElement('label');
    level.className = 'field slider';
    const out = document.createElement('output');
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '150';
    range.value = String(settings.sampleLevels[id] ?? 100);
    range.setAttribute('aria-label', `${label} level`);
    const show = () => { out.textContent = `${range.value}%`; };
    show();
    range.addEventListener('input', () => {
      settings.sampleLevels[id] = Number(range.value);
      show();
      save();
    });
    range.addEventListener('dblclick', () => { range.value = '100'; range.dispatchEvent(new Event('input')); });
    level.append('Level ', out, range);
    // Tune for this row: ±12 semitones in 0.1 steps (changes speed, like the hardware).
    const tune = document.createElement('label');
    tune.className = 'field slider';
    const tuneOut = document.createElement('output');
    const tuneRange = document.createElement('input');
    tuneRange.type = 'range';
    tuneRange.min = '-12';
    tuneRange.max = '12';
    tuneRange.step = '0.1';
    tuneRange.value = String(settings.sampleTunes[id] ?? 0);
    tuneRange.setAttribute('aria-label', `${label} tune`);
    const showTune = () => {
      const v = Number(tuneRange.value);
      tuneOut.textContent = `${v > 0 ? '+' : ''}${v.toFixed(1)} st`;
    };
    showTune();
    tuneRange.addEventListener('input', () => {
      settings.sampleTunes[id] = Number(tuneRange.value);
      showTune();
      save();
    });
    tuneRange.addEventListener('dblclick', () => { tuneRange.value = '0'; tuneRange.dispatchEvent(new Event('input')); });
    tune.append('Tune ', tuneOut, tuneRange);
    const cell = document.createElement('div');
    cell.className = 'map-row';
    cell.append(field, level, tune);
    wrap.append(cell);
  }
}
if (!settings.sampleLevels || typeof settings.sampleLevels !== 'object') settings.sampleLevels = {};
if (!settings.sampleTunes || typeof settings.sampleTunes !== 'object') settings.sampleTunes = {};

/** Put the sample now on row `from` onto row `to` (swapping), or empty `to` if `from` is ''. */
async function moveSample(from, to) {
  if (from === to) return;
  const a = from ? sampleStore[from] : null;
  const b = sampleStore[to] || null;
  const bufA = from ? drums?.samples?.[from] : null;
  const bufB = drums?.samples?.[to];
  if (a) sampleStore[to] = a; else delete sampleStore[to];
  drums?.setSample(to, bufA || null);
  if (from) {
    if (b) sampleStore[from] = b; else delete sampleStore[from];
    drums?.setSample(from, bufB || null);
  }
  // A buffer that wasn't decoded yet (audio not started) is decoded on demand.
  if (drums && a && !bufA) decodeInto(to, a.data).catch(() => {});
  try {
    if (a) await saveSample(to, a); else await deleteSample(to);
    if (from) { if (b) await saveSample(from, b); else await deleteSample(from); }
  } catch { /* storage unavailable: kept for this visit */ }
  renderDrumGrid();
  updateSampleStatus(a ? `${a.name} → ${kitVoices().find((v) => v.id === to).label}` : '');
}

$('sample-load').addEventListener('click', () => $('sample-file').click());
$('sample-file').addEventListener('change', () => {
  addSampleFiles($('sample-file').files);
  $('sample-file').value = '';
});
$('drum-grid').addEventListener('dragover', (e) => { if (settings.drumKit === 'user') e.preventDefault(); });
$('drum-grid').addEventListener('drop', (e) => {
  if (settings.drumKit !== 'user') return;
  e.preventDefault();
  addSampleFiles(e.dataTransfer.files);
});
$('sample-clear').addEventListener('click', async () => {
  if (!Object.keys(sampleStore).length) return;
  if (!window.confirm('Remove all your samples from this browser?')) return;
  for (const slot of Object.keys(sampleStore)) {
    delete sampleStore[slot];
    drums?.setSample(slot, null);
  }
  try { await clearSamples(); } catch { /* nothing stored */ }
  renderDrumGrid();
  updateSampleStatus();
});

buildDrums();
$('sample-tools').hidden = settings.drumKit !== 'user';
renderDrumGrid();
loadSamples().then(async (stored) => {
  // Once: re-sort samples loaded under the old keyword matching with the
  // first-three-letters rule (it could put e.g. a clap on the hi-hat row).
  let note = '';
  if (!settings.samplesV3 && Object.keys(stored).length) {
    const entries = Object.entries(stored).map(([slot, entry]) => ({ name: entry.name, slot, entry }));
    const { assigned } = assignSamples(entries);
    const remapped = Object.fromEntries(assigned.map(([slot, f]) => [slot, f.entry]));
    const moved = assigned.filter(([slot, f]) => slot !== f.slot).length;
    if (moved) {
      try {
        await clearSamples();
        for (const [slot, entry] of Object.entries(remapped)) await saveSample(slot, entry);
      } catch { /* storage unavailable: use the new layout for this visit */ }
      stored = remapped;
      note = `Re-sorted your samples by the first three letters of their names (${moved} moved).`;
    }
  }
  settings.samplesV3 = true;
  save();
  Object.assign(sampleStore, stored);
  if (drums) decodeAllSamples();
  renderDrumGrid();
  updateSampleStatus(note);
});

// ---------------------------------------------------------------- UI: breakbeat slicer
let breakPlayer = null;
let breakBuffer = null; // AudioBuffer of the break (yours, or the synthesized demo)
let breakName = '';
let breakPoints = [0]; // slice start times (s): equal slices, or detected hits
let breakSelected = 0; // tracker row that a click on the waveform writes into
let breakNowStep = -1;
let breakNowSlice = null;
const breakRowEls = [];

if (!SLICE_COUNTS.includes(settings.breakSlices)) settings.breakSlices = 16;
if (!BREAK_STEPS.includes(settings.breakSteps)) settings.breakSteps = 32;
if (!BREAK_BARS.includes(settings.breakBars)) settings.breakBars = 2;
if (!['equal', 'transient'].includes(settings.breakSliceMode)) settings.breakSliceMode = 'equal';
if (typeof settings.breakPatternAuto !== 'boolean') settings.breakPatternAuto = !Array.isArray(settings.breakPattern);
settings.breakPattern = Array.isArray(settings.breakPattern) && settings.breakPattern.length
  ? resizePattern(settings.breakPattern, settings.breakSteps)
  : inOrder(settings.breakSteps, equalPoints(settings.breakSlices, 1), 1, settings.breakBars * 16);

const sliceCount = () => breakPoints.length;

/** Recompute slice starts for the current break and slicing mode; refresh the pattern if it's auto. */
function computeBreakPoints() {
  if (!breakBuffer) return;
  breakPoints = settings.breakSliceMode === 'transient'
    ? detectTransients(breakBuffer.getChannelData(0), breakBuffer.sampleRate, { sensitivity: settings.breakSensitivity / 100 })
    : equalPoints(settings.breakSlices, breakBuffer.duration);
  if (settings.breakPatternAuto) settings.breakPattern = orderedPattern();
  $('break-slices').disabled = settings.breakSliceMode === 'transient';
  $('break-sensitivity').disabled = settings.breakSliceMode !== 'transient';
  buildBreakRows();
  updateBreakStatus();
}

function orderedPattern() {
  return inOrder(settings.breakSteps, breakPoints, breakBuffer ? breakBuffer.duration : 1, settings.breakBars * 16);
}

function playBreakStep(step) {
  const idx = step.stepNumber % settings.breakSteps;
  const row = settings.breakPattern[idx];
  const triggers = rowTriggers(row, step.duration);
  let shown = null;
  if (breakPlayer && breakBuffer) {
    const rate = fitRate(breakBuffer.duration, settings.breakBars, currentBpm(), settings.breakPitch, settings.breakFit);
    for (const tr of triggers) {
      if (tr.cut) { breakPlayer.stop(step.time); continue; }
      const slice = Math.min(tr.slice, sliceCount() - 1);
      shown = slice;
      breakPlayer.trigger(step.time + tr.at, {
        offset: sliceOffset(slice, breakPoints, breakBuffer.duration, tr.reverse),
        reverse: tr.reverse,
        rate: rate * Math.pow(2, tr.pitch / 12),
        gain: tr.gain,
      });
    }
  }
  uiEvents.push({ kind: 'break', time: step.time, step: idx, slice: shown });
}

/**
 * A synthesized demo break so the slicer works before you load your own:
 * two bars of a funky kick/snare/hat groove with ghost notes, at 165 BPM.
 */
async function renderDemoBreak() {
  const bpm = 165;
  const step = 60 / bpm / 4;
  const ctxOff = new OfflineAudioContext(1, Math.ceil(44100 * step * 32) + 2205, 44100);
  const kit = new DrumSynth(ctxOff, ctxOff.destination);
  const parts = {
    bdLinn: 'X.....x..X......X.x.......X.....',
    sdLinn: '....X..x.x..X..x....X..x.x.xX...',
    chLinn: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.x...',
    ohLinn: '..............x...............x.',
  };
  for (const [id, row] of Object.entries(parts)) {
    [...row].forEach((c, i) => {
      if (c !== '.') kit.play(id, i * step + 0.002, c === 'X' ? 1 : id === 'sdLinn' ? 0.35 : 0.6);
    });
  }
  const rendered = await ctxOff.startRendering();
  const n = Math.round(44100 * step * 32); // exactly two bars
  const out = new AudioBuffer({ length: n, numberOfChannels: 1, sampleRate: 44100 });
  out.copyToChannel(rendered.getChannelData(0).subarray(0, n), 0);
  return out;
}

function setBreak(buffer, name) {
  breakBuffer = buffer;
  breakName = name;
  breakPlayer?.setBuffer(buffer);
  computeBreakPoints();
}

function updateBreakStatus(message = '') {
  if (message) { $('break-status').textContent = message; return; }
  if (!breakBuffer) { $('break-status').textContent = 'Loading…'; return; }
  const orig = Math.round((settings.breakBars * 4 * 60) / breakBuffer.duration);
  const hits = settings.breakSliceMode === 'transient' ? ` · ${sliceCount()} hits found` : '';
  $('break-status').textContent = `${breakName} · ${breakBuffer.duration.toFixed(2)} s · ${settings.breakBars} bar${settings.breakBars > 1 ? 's' : ''} ≈ ${orig} BPM as recorded${hits}`;
}

async function loadBreakFile(file) {
  if (!file) return;
  ensureAudio();
  const data = await file.arrayBuffer();
  let buffer;
  try {
    buffer = await ctx.decodeAudioData(data.slice(0));
  } catch {
    updateBreakStatus(`Couldn't read ${file.name} (try WAV).`);
    return;
  }
  settings.breakPatternAuto = true; // a new break starts in order
  setBreak(buffer, file.name);
  save();
  try { await saveBreak({ name: file.name, data }); } catch { /* storage unavailable: kept for this visit */ }
}

function drawBreak() {
  const canvas = $('break-wave');
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(200, canvas.clientWidth);
  const h = canvas.clientHeight || 96;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(canvas);
  const ink = css.getPropertyValue('--ink').trim() || '#000';
  const mod = css.getPropertyValue('--mod').trim() || ink;
  const field = css.getPropertyValue('--field').trim() || '#fff';
  g.fillStyle = field;
  g.fillRect(0, 0, w, h);
  if (!breakBuffer) return;
  const dur = breakBuffer.duration;
  const xOf = (t) => (t / dur) * w;
  const span = (k) => [xOf(breakPoints[k]), xOf(k + 1 < breakPoints.length ? breakPoints[k + 1] : dur)];
  // Highlight the slice on the selected row and the slice playing now.
  const sel = settings.breakPattern[breakSelected]?.slice;
  for (const [slice, alpha] of [[sel, 0.12], [breakNowSlice, 0.28]]) {
    if (slice === null || slice === undefined || slice >= breakPoints.length) continue;
    const [x0, x1] = span(slice);
    g.globalAlpha = alpha;
    g.fillStyle = mod;
    g.fillRect(x0, 0, x1 - x0, h);
    g.globalAlpha = 1;
  }
  g.fillStyle = ink;
  const cols = Math.floor(w);
  const pk = peaks(breakBuffer.getChannelData(0), cols);
  let max = 0.001;
  for (const [lo, hi] of pk) max = Math.max(max, -lo, hi);
  const mid = h / 2;
  for (let x = 0; x < cols; x++) {
    const [lo, hi] = pk[x];
    g.fillRect(x, mid - (hi / max) * (mid - 4), 1, Math.max(1, ((hi - lo) / max) * (mid - 4)));
  }
  g.strokeStyle = mod;
  g.lineWidth = 1;
  g.font = '10px sans-serif';
  breakPoints.forEach((t, k) => {
    const x = Math.round(xOf(t)) + 0.5;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();
    const [x0, x1] = span(k);
    if (x1 - x0 > 12) { g.fillStyle = mod; g.fillText(String(k + 1), x + 3, 11); }
  });
}

function buildBreakRows() {
  const wrap = $('break-rows');
  wrap.replaceChildren();
  breakRowEls.length = 0;
  wrap.classList.toggle('two-col', settings.breakSteps > 16);
  const head = document.createElement('div');
  head.className = 'trow thead';
  head.innerHTML = '<span>Step</span><span>Slice</span><span>Vol</span><span>Pitch</span>'
    + '<span title="Chance: 0–100% that the step plays">C %</span>'
    + '<span title="Roll: divide the step into 0–16 retriggers">R</span><span>Roll type</span><span>FX</span>';
  wrap.append(head);
  const count = sliceCount();
  const number = (value, min, max, step, label, onChange) => {
    const el = document.createElement('input');
    el.type = 'number'; el.min = String(min); el.max = String(max); el.step = String(step);
    el.value = String(value);
    el.setAttribute('aria-label', label);
    el.addEventListener('change', () => onChange(Math.max(min, Math.min(max, Number(el.value) || 0))));
    return el;
  };
  settings.breakPattern.forEach((row, i) => {
    if (i === 16) wrap.append(head.cloneNode(true)); // the second column's header
    const el = document.createElement('div');
    el.className = `trow${i % 4 === 0 ? ' beat' : ''}`;
    const num = document.createElement('button');
    num.className = 'tstep';
    num.textContent = String(i + 1).padStart(2, '0');
    num.title = 'Select this row: then click a slice in the waveform to put it here';
    num.addEventListener('click', () => selectBreakRow(i));
    const slice = document.createElement('select');
    slice.setAttribute('aria-label', `Step ${i + 1} slice`);
    slice.add(new Option('—', ''));
    for (let s = 0; s < count; s++) slice.add(new Option(String(s + 1), String(s)));
    slice.value = row.slice === null ? '' : String(Math.min(row.slice, count - 1));
    slice.addEventListener('change', () => editBreakRow(i, { slice: slice.value === '' ? null : Number(slice.value) }));
    const vol = number(row.vol, 0, 100, 5, `Step ${i + 1} volume`, (v) => editBreakRow(i, { vol: v }));
    const pitch = number(row.pitch, -12, 12, 1, `Step ${i + 1} pitch`, (v) => editBreakRow(i, { pitch: v }));
    const chance = number(row.chance, 0, 100, 5, `Step ${i + 1} chance`, (v) => editBreakRow(i, { chance: v }));
    const roll = number(row.roll, 0, MAX_ROLL, 1, `Step ${i + 1} roll`, (v) => editBreakRow(i, { roll: v }));
    const rollType = document.createElement('select');
    rollType.setAttribute('aria-label', `Step ${i + 1} roll type`);
    for (const [k, label] of Object.entries(ROLL_TYPES)) {
      const o = new Option(k, k);
      o.title = label;
      rollType.add(o);
    }
    rollType.value = row.rollType;
    rollType.addEventListener('change', () => editBreakRow(i, { rollType: rollType.value }));
    const fx = document.createElement('select');
    fx.setAttribute('aria-label', `Step ${i + 1} effect`);
    for (const [k, label] of Object.entries(BREAK_FX)) fx.add(new Option(label, k));
    fx.value = row.fx;
    fx.addEventListener('change', () => editBreakRow(i, { fx: fx.value }));
    for (const c of [slice, vol, pitch, chance, roll, rollType, fx]) c.addEventListener('focus', () => selectBreakRow(i));
    el.append(num, slice, vol, pitch, chance, roll, rollType, fx);
    wrap.append(el);
    breakRowEls.push(el);
  });
  selectBreakRow(Math.min(breakSelected, settings.breakSteps - 1));
}

function editBreakRow(i, patch) {
  settings.breakPattern[i] = { ...settings.breakPattern[i], ...patch };
  settings.breakPatternAuto = false; // your edits stay put when the slicing changes
  const r = settings.breakPattern[i];
  const el = breakRowEls[i];
  el.classList.toggle('filled', r.slice !== null || r.fx === 'cut');
  el.classList.toggle('maybe', r.chance < 100);
  el.classList.toggle('rolled', r.roll > 1);
  drawBreak();
  save();
}

function selectBreakRow(i) {
  breakRowEls[breakSelected]?.classList.remove('selected');
  breakSelected = i;
  breakRowEls[i]?.classList.add('selected');
  breakRowEls.forEach((el, k) => {
    const r = settings.breakPattern[k];
    el.classList.toggle('filled', r.slice !== null || r.fx === 'cut');
    el.classList.toggle('maybe', r.chance < 100);
    el.classList.toggle('rolled', r.roll > 1);
  });
  drawBreak();
}

function showBreakStep(step, slice) {
  if (breakNowStep >= 0) breakRowEls[breakNowStep]?.classList.remove('now');
  breakNowStep = step;
  if (step >= 0) breakRowEls[step]?.classList.add('now');
  if (slice !== null && slice !== undefined) breakNowSlice = slice;
  if (step < 0) breakNowSlice = null;
  drawBreak();
}

function renderBreakPanel() {
  $('break-on').setAttribute('aria-pressed', String(settings.breakOn));
  $('break-on').textContent = settings.breakOn ? 'On' : 'Off';
  $('break-panel').classList.toggle('off', !settings.breakOn);
}

// Clicking the waveform: put that slice on the selected row and move to the next
// row (tracker step-entry); it also plays the slice so you hear what you picked.
$('break-wave').addEventListener('click', (e) => {
  if (!breakBuffer) return;
  const rect = $('break-wave').getBoundingClientRect();
  const slice = sliceAt(((e.clientX - rect.left) / rect.width) * breakBuffer.duration, breakPoints);
  ensureAudio();
  breakPlayer?.trigger(ctx.currentTime + 0.01, {
    offset: breakPoints[slice],
    rate: fitRate(breakBuffer.duration, settings.breakBars, currentBpm(), settings.breakPitch, settings.breakFit),
  });
  const row = breakSelected;
  editBreakRow(row, { slice });
  breakRowEls[row].querySelector('select').value = String(slice);
  selectBreakRow((row + 1) % settings.breakSteps);
});

$('break-on').addEventListener('click', () => {
  settings.breakOn = !settings.breakOn;
  if (settings.breakOn) {
    ensureAudio();
    if (!playing && settings.sync === 'internal') setPlaying(true);
  } else {
    breakPlayer?.stop(ctx ? ctx.currentTime : 0);
    showBreakStep(-1, null);
  }
  renderBreakPanel();
  save();
});
for (const n of SLICE_COUNTS) $('break-slices').add(new Option(String(n), String(n)));
for (const n of BREAK_STEPS) $('break-steps').add(new Option(`${n} (${n / 16} bar${n > 16 ? 's' : ''})`, String(n)));
for (const n of BREAK_BARS) $('break-bars').add(new Option(`${n} bar${n > 1 ? 's' : ''}`, String(n)));
bindSelect('break-mode', 'breakSliceMode', [['equal', 'Equal'], ['transient', 'On the hits']], () => computeBreakPoints());
bindSelect('break-slices', 'breakSlices', null, () => computeBreakPoints());
let sensitivityTimer;
bindRange('break-sensitivity', 'breakSensitivity', (v) => `${v}%`, () => {
  clearTimeout(sensitivityTimer);
  sensitivityTimer = setTimeout(computeBreakPoints, 120); // re-detect once the slider settles
});
bindSelect('break-steps', 'breakSteps', null, () => {
  settings.breakPattern = settings.breakPatternAuto ? orderedPattern() : resizePattern(settings.breakPattern, settings.breakSteps);
  buildBreakRows();
});
bindSelect('break-bars', 'breakBars', null, () => {
  if (settings.breakPatternAuto) { settings.breakPattern = orderedPattern(); buildBreakRows(); }
  updateBreakStatus();
});
$('break-fit').checked = settings.breakFit;
$('break-fit').addEventListener('change', () => { settings.breakFit = $('break-fit').checked; save(); });
bindRange('break-pitch', 'breakPitch', (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} st`);
bindRange('break-level', 'breakLevel', (v) => `${v}%`, (v) => breakPlayer?.setLevel(v / 100));
document.querySelectorAll('[data-gen]').forEach((b) => b.addEventListener('click', () => {
  const steps = settings.breakSteps;
  settings.breakPattern = {
    order: () => orderedPattern(),
    chop: () => chop(orderedPattern()),
    random: () => randomize(steps, sliceCount()),
    clear: () => resizePattern([], steps),
  }[b.dataset.gen]();
  settings.breakPatternAuto = b.dataset.gen === 'order';
  buildBreakRows();
  save();
}));
$('break-load').addEventListener('click', () => $('break-file').click());
$('break-file').addEventListener('change', () => {
  loadBreakFile($('break-file').files[0]);
  $('break-file').value = '';
});
$('break-wave').addEventListener('dragover', (e) => e.preventDefault());
$('break-wave').addEventListener('drop', (e) => { e.preventDefault(); loadBreakFile(e.dataTransfer.files[0]); });
$('break-demo').addEventListener('click', async () => {
  settings.breakBars = 2;
  $('break-bars').value = '2';
  settings.breakPatternAuto = true;
  setBreak(await renderDemoBreak(), 'Demo break (synthesized)');
  save();
  try { await saveBreak({ name: 'demo', data: null }); } catch { /* ignore */ }
});
window.addEventListener('resize', () => drawBreak());

$('break-sensitivity').disabled = settings.breakSliceMode !== 'transient';
$('break-slices').disabled = settings.breakSliceMode === 'transient';
buildBreakRows();
renderBreakPanel();
// Your saved break, decoded without needing an audio context yet; else the demo.
loadBreak().then(async (stored) => {
  if (stored?.data) {
    try {
      const buffer = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(stored.data.slice(0));
      setBreak(buffer, stored.name);
      return;
    } catch { /* fall back to the demo */ }
  }
  setBreak(await renderDemoBreak(), 'Demo break (synthesized)');
});

// ---------------------------------------------------------------- UI: effects
let lastDelayBpm = 0;
function currentBpm() {
  return settings.sync === 'external' && externalClock.intervals.length ? externalClock.bpm : internalClock.bpm;
}
function updateDelayTime() {
  lastDelayBpm = currentBpm();
  delayFx?.setTime(delaySeconds(settings.delayTime, lastDelayBpm));
}
let reverbTimer;
function applyFx() {
  if (!delayFx) return;
  updateDelayTime();
  delayFx.setFeedback(settings.delayFeedback / 100);
  delayFx.setTone(settings.delayTone);
  delayFx.setPingPong(settings.delayPingPong);
  reverbFx.setPreDelay(settings.reverbPre / 1000);
  reverbFx.setTone(settings.reverbTone);
  // Rebuilding the impulse is heavy, so wait for the slider to settle.
  clearTimeout(reverbTimer);
  reverbTimer = setTimeout(() => reverbFx.setSize(settings.reverbSize / 1000), 120);
  const now = ctx.currentTime;
  for (const fx of ['delay', 'reverb']) {
    for (const src of ['arp', 'chords', 'drums']) {
      const key = `${fx}Send${src[0].toUpperCase()}${src.slice(1)}`;
      sends[fx][src].gain.setTargetAtTime(settings[key] / 100, now, 0.02);
    }
  }
}
bindSelect('delay-time', 'delayTime', DELAY_TIMES.map((d) => [d, d]), applyFx);
bindRange('delay-feedback', 'delayFeedback', (v) => `${v}%`, applyFx);
bindLog('delay-tone', 'delayTone', 300, 12000, formatHz, applyFx);
$('delay-pingpong').checked = settings.delayPingPong;
$('delay-pingpong').addEventListener('change', () => { settings.delayPingPong = $('delay-pingpong').checked; applyFx(); save(); });
bindLog('reverb-size', 'reverbSize', 300, 8000, (ms) => `${(ms / 1000).toFixed(1)} s`, applyFx);
bindRange('reverb-pre', 'reverbPre', (v) => `${v} ms`, applyFx);
bindLog('reverb-tone', 'reverbTone', 300, 12000, formatHz, applyFx);
for (const fx of ['delay', 'reverb']) {
  for (const src of ['Arp', 'Chords', 'Drums']) {
    bindRange(`${fx}-send-${src.toLowerCase()}`, `${fx}Send${src}`, (v) => `${v}%`, applyFx);
  }
}

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
bindSelect('osc2-mod', 'osc2Mod', Object.entries(MOD_TYPES), showModDepth);
bindRange('osc2-mod-depth', 'osc2ModDepth', () => modDepthLabel());
function modDepthLabel() {
  const d = settings.osc2ModDepth;
  return settings.osc2Mod === 'fm' ? `index ${((d / 100) * MAX_FM_INDEX).toFixed(1)}` : `${d}%`;
}
function showModDepth() {
  $('osc2-mod-depth').disabled = settings.osc2Mod === 'off';
  $('osc2-mod-depth-val').textContent = modDepthLabel();
}
showModDepth();
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
      <button class="step-on" aria-pressed="true"
        title="Off: no new note; a still-ringing tail slides to the next arp note plus this step's interval">On</button>
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
    el.querySelector('.step-on').addEventListener('click', () => update({ on: engine.steps[i].on === false }));
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
  const { offset, volume, on } = engine.steps[i];
  const toggle = el.querySelector('.step-on');
  toggle.setAttribute('aria-pressed', String(on !== false));
  toggle.textContent = on === false ? 'Off' : 'On';
  el.classList.toggle('rest', on === false);
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
  for (let i = 0; i < MAX_SEQ_LENGTH; i++) engine.setStep(i, { offset: 0, volume: 100, on: true });
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
    if (ev.kind === 'break') {
      showBreakStep(ev.step, ev.slice);
      continue;
    }
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
    $('out-note').textContent = ev.rest
      ? `tail → ${noteName(ev.note)}`
      : ev.velocity ? noteName(ev.note) : '(muted)';
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
    // Keep the delay locked to the incoming clock's tempo.
    if (Math.abs(externalClock.bpm - lastDelayBpm) > 0.5) updateDelayTime();
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
