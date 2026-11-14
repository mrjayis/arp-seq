import {
  PPQN,
  ArpSeqEngine, MODES, MODE_LABELS, RATES, PITCH_RANGE,
  MIN_SEQ_LENGTH, MAX_SEQ_LENGTH, noteName, defaultSteps, CHORDS, chordNotes,
  OSC2_MODES, osc2Note, euclid, MAX_EUCLID_STEPS, chordVoicing, patternAt,
  PAD_CHORDS, MAX_PROGRESSION, PROGRESSION_BEATS, PROGRESSION_PRESETS, progressionAt, slotNotes,
  progressionChord, anticipatedSlot, chordTie, SLOT_OCTAVES, humanizeOffset, humanizeLevel,
  MOD_EVERY, MOD_INTERVALS, progressionRound, modulationShift, TUNINGS, justCents, chordRootPc, isDimChord, sweeten, autoTonic,
  INVERSIONS, PROG_VOICINGS, progressionVoicings,
  defaultProgression, sliderToFreq, freqToSlider, formatHz,
} from './core.js?v=123';
import { InternalClock, ExternalClock, pulseToStep } from './clock.js?v=123';
import { Synth, Chorus, LPG_MODES, MOD_TYPES, MAX_FM_INDEX, blendGains, pulseOffsets } from './synth.js?v=123';
import { Midi } from './midi.js?v=123';
import { Delay, Reverb, delaySeconds, DELAY_TIMES } from './fx.js?v=123';
import {
  DrumSynth, DRUM_STEPS, KITS, KIT_ORDER, parsePattern, assignSamples, CONDITIONS, FILL_EVERY, isFillBar, drumHits, addFill,
} from './percussion.js?v=123';
import { parseMidi, scoreLength, monoLengths, firstAtOrAfter, tempoBpm } from './score.js?v=123';
import { saveSample, deleteSample, clearSamples, loadSamples, saveBreak, loadBreak, saveScore, deleteScore, loadScores, clearScores } from './samples.js?v=123';
import {
  BreakPlayer, SLICE_COUNTS, BREAK_STEPS, BREAK_BARS, BREAK_FX, ROLL_TYPES, MAX_ROLL, fitRate, rowTriggers,
  inOrder, chop, randomize, resizePattern, peaks, equalPoints, sliceOffset, sliceAt, detectTransients,
  trimSamples, fadeEdges, isFilled, rollSpan, usableSlices,
} from './breaks.js?v=123';
import { barRng, evolveDrums, evolveBreakRow, drumOverlay, breakRowChange } from './evolve.js?v=123';
import {
  MonoSynth, stepAction, writeStep, backStep, stepLabel, noteStep, restStep, holdStep, MAX_MONO_STEPS, SUB_MODES, PORTA_MODES,
} from './mono.js?v=123';

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
  arpAttack: 4, // ms, both arp oscillators
  arpRelease: 15, // ms of extra tail, both arp oscillators
  volume: 50,
  midiIn: '',
  midiInCh: -1,
  // MIDI In channel per module (-1 = off): a claimed channel plays only that module.
  midiInChord: -1,
  midiInMono: -1,
  midiInDrums: -1,
  midiInBreak: -1,
  midiMap: {}, // MIDI Learn: {'ch:cc': control key ('#id' or '@aria-label')}
  aftertouch: true, // polyphonic aftertouch / channel pressure shapes the synths
  aftertouchDepth: 70, // %
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
  chordSyncopate: false, // a chord hit in the last 8th before the progression moves on plays the next chord
  chordTie: false, // a syncopated chord holds over the bar line instead of being struck again on the downbeat
  tuningKey: 'auto', // the key's tonic for Just tuning: 'auto' (the progression's first chord) or 0–11
  tuningPure: true, // with Just tuning: no deliberate detuning, vibrato or chorus wobble
  tuning: 'equal', // 'equal' | 'just' | 'just7': adaptive just intonation to the chord now playing
  humanize: 0, // 0–100: random timing and level variation for every section
  scoreOn: false,
  scoreId: '', // the piece chosen in the Score player
  scoreVoices: {}, // {pieceId: ['arp' | 'chord' | 'mono' | 'off', …]} one per part
  scoreTranspose: 0,
  scoreSpeed: 1,
  scoreLoop: true, // (older saves) — now scoreMode
  scoreMode: null, // 'once' | 'loop' | 'list' (every piece in order) | 'shuffle'
  monoKbOctave: 2, // the mono panel's little keyboard starts at C of this octave
  breakOff: [], // slices switched off (shift-click): not played, not picked by Evolve/Randomize
  breakRollHold: true, // a roll keeps going until the next filled row (Polyend style); off = one step
  breakTrim: { start: 0, end: 1 }, // the part of the loaded break that's used (fractions of the file)
  arpLevel: 100, // %: overall level of the arp (both voices)
  osc2Sound: 'west', // 'west' (the west-coast voice) | 'bass' (upright bass)
  bassTone: 45, // %
  bassDecay: 2200, // ms: how long a low E rings
  osc1Level: 100, // %: oscillator 1's own level (oscillator 2 has osc2Level)
  arpOn: true, // off: the arp and sequencer keep stepping (chords can follow) but play nothing
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
  chordMode: 'rhythm', // 'rhythm' (Euclidean hits) | 'pad' (held, always on)
  padAttack: 600, // ms
  padRelease: 1500, // ms
  padGlide: 40, // ms: how a following pad slides between sequencer steps
  chordSound: 'analog', // 'analog' | 'ep' (DX7-style FM electric piano) | 'fmpad' (DX7-style FM pad)
  fmBright: 50, // %: FM modulation index
  fmBell: 50, // %: EP tine operator
  fmDecay: 2500, // ms: EP ring at middle C
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
  delaySendBass: 20,
  reverbSendBass: 5,
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
  progModEvery: 0, // modulate every N rounds of the progression (0 = off)
  progModBy: 2, // semitones per modulation
  progModAll: true, // the mono synth and held keys change key with the progression too
  progVoicing: 'set', // 'set': each chord's own inversion; 'smooth': nearest inversion to the last chord
  progression: defaultProgression(),
  drumOn: false,
  drumKit: 'latin', // 'latin' | '808' | 'linn' | 'user'
  drumPreset: 'Bossa Nova',
  drumRows: null, // the pattern being played (a preset, possibly edited)
  drumLevel: 70,
  drumMuted: {},
  drumMidiCh: -1,
  drumConds: {}, // per row: a trig condition per step ('' = always)
  drumLens: {}, // per row: its own loop length (polymeter)
  drumFillEvery: 0, // a fill bar every N bars (0 = off)
  drumTapMode: 'hits', // what tapping a cell does: 'hits' | 'cond'
  drumCondPick: '1:2',
  drumEvolve: 0, // 0–100: per-bar variation of the drums
  drumSlot: 'A', // pattern slot being edited (A–D)
  drumSlots: {}, // the other slots of the current kit: {B: {preset, rows, conds, lens}, …}
  breakSlot: 'A',
  breakSlots: {},
  songOn: false,
  songChain: ['A', 'A', 'B', 'A'], // one slot per bar
  breakEvolve: 0, // 0–100: per-bar variation of the break pattern
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

// What every setting starts as, for scenes saved before a setting existed.
const DEFAULTS = structuredClone(settings);
// Settings that belong to this device or this moment, not to a scene.
const DEVICE_KEYS = [
  'theme', 'themeV2', 'collapsed', 'showHelp', 'midiIn', 'midiInCh', 'midiOut', 'midiOutCh', 'volume', 'synthOn',
  'midiInChord', 'midiInMono', 'midiInDrums', 'midiInBreak', 'aftertouch', 'aftertouchDepth', 'midiMap',
  'sync', 'baseOctave', 'chordRoot', 'monoKbOctave',
];
// Live scene recall: each part of the page registers how to re-read its settings,
// in page order (repairs first, then controls, then drawing). See recallLive().
const recallHooks = [];
const onRecall = (fn) => { recallHooks.push(fn); return fn; };
let pendingScene = null; // a recalled scene waiting for the next bar: {data, currentId, name}

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
onRecall(applyEngineSettings);

// Repair a stored progression (older saves have none, or a different shape).
onRecall(repairProgression)();
function repairProgression() {
  const fallback = defaultProgression();
  const saved = Array.isArray(settings.progression) ? settings.progression : [];
  settings.progression = fallback.map((def, i) => {
    const s = saved[i] || {};
    return {
      root: Number.isInteger(s.root) && s.root >= 0 && s.root < 12 ? s.root : def.root,
      type: s.type === 'rest' || CHORDS[s.type] ? s.type : def.type,
      beats: PROGRESSION_BEATS.includes(s.beats) ? s.beats : def.beats,
      inv: Number.isInteger(s.inv) && s.inv >= 0 && s.inv < INVERSIONS.length ? s.inv : 0,
      oct: SLOT_OCTAVES.includes(s.oct) ? s.oct : 0,
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
    buses.bass = ctx.createGain();
    buses.bass.connect(synth.master);
    delayFx = new Delay(ctx, synth.master);
    reverbFx = new Reverb(ctx, synth.master);
    for (const [fx, node] of [['delay', delayFx], ['reverb', reverbFx]]) {
      for (const src of ['arp', 'chords', 'drums', 'bass']) {
        sends[fx][src] = ctx.createGain();
        buses[src].connect(sends[fx][src]).connect(node.input);
      }
    }
    applyFx();
    // The percussion and the break share the drum bus, so each gets its own solo gate into it.
    buses.perc = ctx.createGain();
    buses.break = ctx.createGain();
    buses.perc.connect(buses.drums);
    buses.break.connect(buses.drums);
    applySolo(true);
    drums = new DrumSynth(ctx, buses.perc);
    monoSynth = new MonoSynth(ctx, buses.bass);
    applyMono();
    breakPlayer = new BreakPlayer(ctx, buses.break);
    breakPlayer.setLevel(settings.breakLevel / 100);
    if (breakBuffer) breakPlayer.setBuffer(breakBuffer);
    decodeAllSamples();
    chorus = new Chorus(ctx, buses.chords);
    applyChorusMix();
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
      detune: pure() ? 0 : settings.osc2Detune,
      level: (settings.osc2Level / 100) * (settings.arpLevel / 100),
      attack: settings.arpAttack / 1000,
      release: settings.arpRelease / 1000,
    };
  }
  return {
    attack: settings.arpAttack / 1000,
    release: settings.arpRelease / 1000,
    mono: 'osc1',
    wave: settings.wave,
    cutoff: settings.cutoff,
    shape: settings.arpShape / 100,
    timbre: settings.arpTimbre / 100,
    lpg: settings.lpgMode,
    resonance: settings.arpResonance,
    level: (settings.osc1Level / 100) * (settings.arpLevel / 100),
  };
}

/** Oscillator 2 modulating oscillator 1 at `modNote` (oscillator 2's pitch), or null. */
function modSpec(modNote) {
  if (settings.osc2Mod === 'off' || settings.osc2ModDepth <= 0) return null;
  return {
    type: settings.osc2Mod,
    depth: settings.osc2ModDepth / 100,
    note: tuned(modNote), // in tune with the carrier, so AM/FM ratios stay pure
    detune: pure() ? 0 : settings.osc2Detune,
    wave: settings.osc2Wave,
  };
}

// ---- adaptive just intonation: every pitched voice is tuned to pure ratios above the
// root of the chord playing now, and that root to a pure ratio above the key's tonic
// (the progression's first chord), so neighbouring chords keep their shared notes.
// The tonic stays on its equal-tempered pitch, so nothing drifts.

/**
 * The key's tonic for tuning: the Key setting (moved along by any modulation), or on
 * Auto the key the progression is in (autoTonic). null = no key (each root stays equal-tempered).
 */
function tonicPc() {
  if (settings.tuningKey !== 'auto' && Number.isInteger(Number(settings.tuningKey))) {
    return (((Number(settings.tuningKey) + (settings.progOn ? progShift : 0)) % 12) + 12) % 12;
  }
  if (!settings.progOn) return null;
  const tonic = autoTonic(settings.progression.slice(0, settings.progLength));
  return tonic === null ? null : (((tonic + progShift) % 12) + 12) % 12;
}

/**
 * The chord the tuning follows now, as an id "tonic|root|dim|pitch classes" (comparable
 * with ===): the progression's chord plus held keys, else the held keys; null for none.
 */
function chordRoot() {
  let notes = engine.notes.map((n) => n.note);
  if (!notes.length && liveChord.size) notes = [...liveChord.keys()]; // chords played on the chord synth's channel
  if (!notes.length && scoreSounding.length) notes = scoreSounding.map((s) => s.n); // the score's own harmony
  if (settings.progOn && progIndex >= 0) {
    const slot = settings.progression[progIndex];
    if (slot && slot.type !== 'rest') {
      const root = (((slot.root + progShift) % 12) + 12) % 12;
      return tuningId(root, notes, slot.type === 'dim');
    }
  }
  return tuningKeyFor(notes);
}

/** A tuning id for a chord given as MIDI notes (held keys, or an early syncopated chord). */
function tuningKeyFor(notes) {
  const root = chordRootPc(notes);
  if (root === null) return null;
  const pcs = new Set(notes.map((n) => ((n % 12) + 12) % 12));
  return tuningId(root, notes, isDimChord(pcs, root));
}

function tuningId(root, notes, dim) {
  const pcs = [...new Set(notes.map((n) => ((n % 12) + 12) % 12))].sort((a, b) => a - b);
  if (!pcs.includes(root)) pcs.push(root);
  return `${tonicPc()}|${root}|${dim ? 1 : 0}|${pcs.join('.')}`;
}

// Sweetened tunings, one per chord id: pitch class → cents from equal temperament
// (relative to the chord's root), chosen together for the fewest beats.
const sweetCache = new Map();
function clearSweet() { sweetCache.clear(); }

/** Pitch classes sounding now outside the chord (the mono note, a ringing arp note), to sweeten with it. */
function soundingPcs() {
  const out = [];
  if (monoGateOpen && monoMidiNote !== null) out.push(monoMidiNote % 12);
  if (arpTail) {
    out.push(arpTail.note % 12);
    if (arpTail.note2 !== null) out.push(arpTail.note2 % 12);
  }
  return out;
}

function sweetFor(id) {
  let ctxT = sweetCache.get(id);
  if (!ctxT) {
    const [t, r, , sig] = id.split('|');
    const root = Number(r);
    const pcs = [...sig.split('.').map(Number), ...soundingPcs()];
    ctxT = {
      root,
      rootShift: t === 'null' ? 0 : justCents(root, Number(t), 'just'), // the root in tune with the key
      map: sweeten(pcs, root, settings.tuning),
    };
    sweetCache.set(id, ctxT);
    if (sweetCache.size > 16) sweetCache.delete(sweetCache.keys().next().value);
  }
  return ctxT;
}

/** Cents to nudge `note` by, in the chord with tuning id `id`. */
function tuningCents(note, id = chordRoot()) {
  if (!id || settings.tuning === 'equal') return 0;
  const ctxT = sweetFor(id);
  const pc = ((Math.round(note) % 12) + 12) % 12;
  if (!ctxT.map.has(pc)) {
    // A note outside the chord (arp, mono, a passing key): the tuning that beats least
    // against everything already settled for this chord.
    ctxT.map = sweeten([pc], ctxT.root, settings.tuning, ctxT.map);
  }
  return ctxT.rootShift + ctxT.map.get(pc);
}

/** A note as the synths should play it: a fractional MIDI note, nudged to just intonation. */
function tuned(note, key = chordRoot()) {
  return note + tuningCents(note, key) / 100;
}

/** Pure: Just tuning with the deliberate detuning, vibrato and chorus wobble taken out. */
const pure = () => settings.tuning !== 'equal' && settings.tuningPure;

/** Apply Pure to what's set up once rather than per note (the chorus and the mono vibrato). */
function applyPure() {
  renderPure();
  applyChorusMix();
  applyMono();
}
function renderPure() {
  $('tuning-pure').checked = settings.tuningPure;
  $('tuning-pure').disabled = settings.tuning === 'equal';
  $('tuning-key').disabled = settings.tuning === 'equal';
}

function playVoice(note, note2, velocity, time, gateLen, modNote, press = 0) {
  const on = toPerfMs(time);
  const off = toPerfMs(time + gateLen);
  // Aftertouch on the key this note comes from: brighter (the low-pass gate opens further).
  const bright = (v) => ({ ...v, cutoff: Math.min(16000, v.cutoff * Math.pow(2, 2 * press)) });
  if (settings.synthOn && synth) {
    synth.playWest(tuned(note), velocity, time, gateLen, { ...bright(westVoice(1)), mod: modSpec(modNote), out: buses.arp });
  }
  midi.noteOn(note, velocity, on);
  midi.noteOff(note, off);
  if (note2 === null) return;
  if (settings.synthOn && synth && settings.osc2Level > 0) {
    if (settings.osc2Sound === 'bass') {
      // Upright bass: each note rings on until the next one (a bassist's legato), gate or not.
      synth.playBass(tuned(note2), velocity, time, Math.max(gateLen, settings.bassDecay / 1000), {
        level: (settings.osc2Level / 100) * (settings.arpLevel / 100), out: buses.arp, mono: 'osc2',
        tone: Math.min(1, settings.bassTone / 100 + press * 0.5), decay: settings.bassDecay / 1000,
      });
    } else synth.playWest(tuned(note2), velocity, time, gateLen, { ...bright(westVoice(2)), out: buses.arp });
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
  if (!settings.arpOn) {
    // Silent: still step, so the sequencer display and following chords keep moving.
    uiEvents.push({ kind: 'arp', time: step.time, off: step.time, ...ev, note2: null, silent: true });
    return;
  }
  const gateLen = gateLength(step, settings.gate);
  if (ev.rest) {
    // Step switched off: strike nothing, but slide whatever tail is still ringing
    // to the note this step would have played (each oscillator its own way).
    const modNote = osc2Note(ev, settings.osc2Mode, settings.osc2Transpose);
    const note2 = settings.osc2On ? modNote : null;
    if (settings.synthOn && synth) {
      synth.retune('osc1', tuned(ev.note), step.time, tuned(modNote));
      if (note2 !== null) synth.retune('osc2', tuned(note2), step.time);
      arpTail = { note: ev.note, note2, modNote, root: chordRoot() };
    }
    uiEvents.push({ kind: 'arp', time: step.time, off: step.time, ...ev, note2 });
    return;
  }
  // Oscillator 2's pitch for this step: heard if it's on, and used to modulate
  // oscillator 1 even when it's off (a pure modulator).
  const modNote = osc2Note(ev, settings.osc2Mode, settings.osc2Transpose);
  const note2 = settings.osc2On ? modNote : null;
  if (ev.velocity > 0) {
    // Aftertouch: pressing harder on a held key makes its arp notes louder and brighter.
    const press = arpPressureFor(ev.sourceNote);
    const velocity = Math.min(127, Math.round(humanLevel(ev.velocity) * (1 + 0.5 * press)));
    playVoice(ev.note, note2, velocity, step.time, gateLen, modNote, press);
    arpTail = { note: ev.note, note2, modNote, root: chordRoot() };
  }
  uiEvents.push({ kind: 'arp', time: step.time, off: step.time + gateLen, note2, ...ev });
}

let arpTail = null; // the arp note still ringing: {note, note2, modNote, root it was tuned to}

/**
 * Just intonation: when the chord changes under a ringing arp note (or a tail sliding
 * on a muted step), glide it to its tuning in the new chord. Synth.retune ignores a
 * line that has already finished.
 */
function retuneArp(time) {
  if (!arpTail || !synth || !settings.synthOn) return;
  const root = chordRoot();
  if (root === arpTail.root) return;
  arpTail.root = root;
  const { note, note2, modNote } = arpTail;
  const ringing = synth.retune('osc1', tuned(note, root), time, tuned(modNote, root));
  const ringing2 = note2 !== null && synth.retune('osc2', tuned(note2, root), time);
  if (!ringing && !ringing2) arpTail = null; // both finished: nothing left to retune
}

// Chord layer: repeats the held chord on the hits of its own Euclidean rhythm,
// alongside the arpeggiator. It only follows the sequencer if asked to.
// ---- Pad mode: the chord layer holds the current chord, always on. Each 16th it
// compares what should sound with what does: new notes swell in, old ones fade.
const padVoices = new Map(); // key ('n:60', 'sub:36') -> voice handle

function chordLayers() {
  const [g1, g2] = blendGains(settings.chordBlend / 100);
  const pulse = pulseOffsets(settings.chordPulseWidth, settings.chordPwmDepth);
  return [
    { wave: settings.chordWave, gain: g1, detune: 0, pulse },
    { wave: settings.chordWave2, gain: g2, detune: pure() ? 0 : settings.chordDetune2, pulse },
  ];
}

/** The FM chord sound's options (E.Piano or Pad), from the FM row. */
function fmOptions() {
  return {
    kind: settings.chordSound === 'ep' ? 'ep' : 'pad',
    level: settings.chordLevel / 100,
    bright: settings.fmBright / 100,
    bell: settings.fmBell / 100,
    decay: settings.fmDecay / 1000,
    spread: pure() ? 0 : 1,
  };
}

function releasePads(time) {
  for (const v of padVoices.values()) v.release(time);
  padVoices.clear();
}

function updatePad(time) {
  if (!synth || !settings.synthOn || !settings.chordOn || settings.chordMode !== 'pad' || settings.chordLevel <= 0) {
    if (padVoices.size) releasePads(time);
    return;
  }
  // Notes are keyed by the chord as held; following the sequencer slides them (padFollow).
  const notes = chordVoicing(engine.notes, { octave: settings.chordOctave });
  const want = new Map(notes.map((n) => [`n:${settings.chordSound}:${n.note}`, n]));
  if (settings.chordSub !== 'off' && notes.length && notes[0].note >= 12) {
    want.set(`sub:${notes[0].note - 12}`, { note: notes[0].note - 12, velocity: notes[0].velocity, sub: true });
  }
  for (const [key, v] of padVoices) {
    if (!want.has(key)) { v.release(time); padVoices.delete(key); }
  }
  const common = {
    cutoff: settings.chordCutoff, resonance: settings.chordResonance,
    attack: settings.padAttack / 1000, release: settings.padRelease / 1000,
  };
  const root = chordRoot();
  if (root !== padRoot && padVoices.size) { padRoot = root; padFollow(time, 0.04); } // the harmony moved: retune what's held
  padRoot = root;
  for (const [key, n] of want) {
    if (padVoices.has(key)) continue;
    const voice = n.sub
      ? synth.padVoice(n.note, n.velocity, time, {
        ...common, wave: settings.chordSub, out: buses.chords,
        level: (settings.chordLevel / 100) * (settings.chordSubLevel / 100) * 1.4,
      })
      : settings.chordSound !== 'analog'
        ? synth.fmVoice(n.note, n.velocity, time, {
          ...fmOptions(), attack: common.attack, release: common.release, out: chorus.input,
        })
        : synth.padVoice(n.note, n.velocity, time, {
          ...common, layers: chordLayers(), level: settings.chordLevel / 100, out: chorus.input,
        });
    // A note joining mid-sequence starts where the others are (and in tune with the chord).
    voice.note = n.note;
    voice.sub = !!n.sub;
    voice.cents = 0; // built at equal temperament; padFollow adds the just-intonation offset
    padVoices.set(key, voice);
    padTune(voice, time, 0);
    if (!n.sub) voice.pressure?.(chordPressure(n.note), time); // a key already pressed in
  }
}

/** The sequencer's pitch offset and level for a following pad ([0, 1] when not following). */
function padStepState() {
  if (!settings.chordFollowSeq || engine.lastStepIndex == null) return [0, 1];
  const { offset, volume } = engine.currentStep;
  return [offset, volume / 100];
}

/** Pad following the sequencer: on each arp step, slide every held pad note to the step. */
function padFollow(time, glide = settings.padGlide / 1000) {
  for (const v of padVoices.values()) padTune(v, time, glide);
}

let padRoot = null; // the chord root the held pad is tuned to

/** Slide one pad voice to the sequencer step's offset and level, in just intonation to the chord. */
function padTune(v, time, glide) {
  const [semis, scale] = padStepState();
  const cents = v.note === undefined ? 0 : tuningCents(v.note);
  v.follow(semis + cents / 100, scale, time, glide);
}

/**
 * The notes a chord hit plays. With Syncopate on, a hit in the last 8th note before
 * the progression moves on plays the next chord early (anticipation), held keys included.
 */
let chordPushed = false; // the last chordSource() was an early (syncopated) next chord

function chordSource(step) {
  chordPushed = false;
  if (!settings.chordSyncopate || !settings.progOn) return engine.notes;
  const pulse = step.stepNumber * RATES[settings.chordRate];
  const slots = settings.progression.slice(0, settings.progLength);
  const next = anticipatedSlot(pulse, slots);
  if (next < 0) return engine.notes;
  // The pushed chord is in the key of the round it belongs to (it may be the next one).
  const shift = progShiftAt(pulse + PPQN / 2);
  chordPushed = true;
  return engine.notesWith(progressionChord(shifted(progVoicings()[next]?.notes || [], shift)));
}

function playChord(step) {
  const source = chordSource(step);
  if (!source.length) return;
  const rhythmPos = step.stepNumber % settings.chordSteps;
  const pattern = euclid(settings.chordHits, settings.chordSteps, settings.chordRotate);
  const hit = pattern[rhythmPos];
  let gateLen = gateLength(step, settings.chordGate);
  if (hit && settings.chordSyncopate && settings.chordTie && settings.progOn) {
    const pps = RATES[settings.chordRate];
    const tie = chordTie(step.stepNumber, pps, settings.progression.slice(0, settings.progLength),
      (s) => !!pattern[((s % pattern.length) + pattern.length) % pattern.length]);
    if (tie.role === 'held') {
      // Already sounding from the pushed chord: just move the pattern display on.
      uiEvents.push({ kind: 'chord', time: step.time, off: step.time, rhythmPos, notes: [] });
      return;
    }
    if (tie.role === 'start') {
      // Hold until the end of the downbeat hit's gate, as if it were one long note.
      const d = tie.until;
      const delay = d % 2 === 1 ? (settings.swing / 100) * 0.5 * step.duration : 0;
      const downbeat = step.time - step.delay + (d - step.stepNumber) * step.duration + delay;
      gateLen = downbeat + gateLength({ stepNumber: d, duration: step.duration, delay }, settings.chordGate) - step.time;
    }
  }
  const notes = hit
    ? chordVoicing(source, {
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
    { wave: settings.chordWave2, gain: g2, detune: pure() ? 0 : settings.chordDetune2, pulse },
  ];
  const filterOpts = { cutoff: settings.chordCutoff, resonance: settings.chordResonance };
  const sound = settings.synthOn && synth && settings.chordLevel > 0;
  const sendMidi = (note, velocity) => {
    if (settings.chordMidiCh < 0) return;
    midi.noteOn(note, velocity, on, settings.chordMidiCh);
    midi.noteOff(note, off, settings.chordMidiCh);
  };
  // Just intonation: tuned to this chord's own root (an early, syncopated chord has its own).
  const root = chordPushed ? tuningKeyFor(source.map((n) => n.note)) : chordRoot();
  for (const { note: n0, velocity: v0 } of notes) {
    const velocity = humanLevel(v0); // each chord note a little different, like fingers
    const note = tuned(n0, root);
    const midiNote = n0;
    // Poly aftertouch on the key this chord note comes from: brighter and a little louder.
    const press = chordPressure(n0);
    const hitVel = press ? Math.min(127, Math.round(velocity * (1 + 0.35 * press))) : velocity;
    if (sound && settings.chordSound !== 'analog') {
      // FM: struck at the hit, damped at the end of the gate (the pad swells in faster here).
      const fm = fmOptions();
      const v = synth.fmVoice(note, hitVel, step.time, {
        ...fm, out: chorus.input, ...(fm.kind === 'pad' ? { attack: Math.min(0.15, gateLen / 2), release: 0.5 } : {}),
      });
      if (press) v.pressure(press, step.time);
      v.release(step.time + gateLen);
    } else if (sound) {
      trackHit(synth.play(note, hitVel, step.time, gateLen, {
        ...filterOpts, cutoff: Math.min(16000, filterOpts.cutoff * Math.pow(2, 2 * press)),
        layers, level: settings.chordLevel / 100, out: chorus.input,
      }), press);
    }
    sendMidi(midiNote, velocity);
  }
  // Sub: one octave under the lowest chord note, kept out of the chorus so the bass stays tight.
  const sub = settings.chordSub !== 'off' && notes.length && notes[0].note >= 12 ? notes[0] : null;
  if (sub) {
    if (sound && settings.chordSubLevel > 0) {
      synth.play(tuned(sub.note - 12, root), sub.velocity, step.time, gateLen, {
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

let progShift = 0; // semitones the progression is modulated by right now

/** Semitones of modulation at clock `pulse`. */
function progShiftAt(pulse) {
  const slots = settings.progression.slice(0, settings.progLength);
  return modulationShift(progressionRound(pulse, slots), settings.progModEvery, settings.progModBy);
}

/** A slot's notes, modulated by `shift` semitones (kept within MIDI range). */
const shifted = (notes, shift) => notes.map((n) => n + shift).filter((n) => n >= 0 && n <= 127);

function stepProgression(time, pulse) {
  if (!settings.progOn) return;
  const slots = settings.progression.slice(0, settings.progLength);
  const i = progressionAt(pulse, slots);
  const shift = progShiftAt(pulse);
  if (i === progIndex && shift === progShift) return;
  progIndex = i;
  progShift = shift;
  engine.heldShift = settings.progModAll ? shift : 0;
  engine.setProgressionNotes(shifted(progVoicings()[i]?.notes || [], shift));
  uiEvents.push({ kind: 'prog', time, index: i, shift });
}

/** Stop the progression feeding notes; it restarts from the current clock position. */
function resetProgression() {
  progIndex = -1;
  progShift = 0;
  engine.heldShift = 0;
  engine.setProgressionNotes([]);
}

/**
 * Humanize: a copy of a step moved slightly off the grid (each section gets its own
 * offset, so they don't all drift together). Never earlier than the audio clock allows.
 */
function human(step) {
  const off = humanizeOffset(settings.humanize / 100, step.duration);
  if (!off) return step;
  return { ...step, time: Math.max(ctx.currentTime + 0.002, step.time + off) };
}
const humanLevel = (v, max) => humanizeLevel(v, settings.humanize / 100, Math.random, max);

function onPulse(time, pulse, pulseDuration) {
  // A recalled scene takes over on a bar's downbeat, before anything on it is scheduled.
  if (pendingScene && pulse % (PPQN * 4) === 0) applyPendingScene();
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
  if (step && !gated) {
    const hstep = human(step);
    playArp(hstep);
    if (settings.chordMode === 'pad') padFollow(hstep.time);
  }
  const cstep = pulseToStep(pulse, time, pulseDuration, RATES[settings.chordRate], swing);
  if (cstep) {
    if (settings.chordOn && settings.chordMode !== 'pad') playChord(human(cstep));
    else if (settings.chordGateArp && engine.notes.length) {
      // Keep the pattern display moving when only the gate is in use.
      uiEvents.push({ kind: 'chord', time: cstep.time, rhythmPos: cstep.stepNumber % settings.chordSteps, notes: [] });
    }
  }
  if (settings.scoreOn) playScorePulse(time, pulse, pulseDuration);
  if (settings.monoOn) {
    const mstep = pulseToStep(pulse, time, pulseDuration, RATES[settings.monoRate] || RATES['1/16'], swing);
    if (mstep) playMonoStep(human(mstep));
  }
  if (settings.songOn && !settings.drumOn && settings.breakOn && pulse % (RATES['1/16'] * DRUM_STEPS) === 0) {
    uiEvents.push({ kind: 'song', time, bar: Math.floor(pulse / (RATES['1/16'] * DRUM_STEPS)) });
  }
  // Pad: keep the held chord in step with the notes, every 16th (and a held mono note in tune).
  if (pulse % RATES['1/16'] === 0) {
    updatePad(time);
    retuneMono(time);
    retuneArp(time);
  }
  if (settings.drumOn || settings.breakOn) {
    const dstep = pulseToStep(pulse, time, pulseDuration, RATES['1/16'], swing);
    if (dstep && settings.drumOn) playDrums(dstep);
    if (dstep && settings.breakOn) playBreakStep(human(dstep));
  }
}

// Percussion: one-bar 16th-note pattern, locked to the clock and swing.
// Evolve: a new seed each time Play starts; each bar's variation is derived from it.
let runSeed = (Math.random() * 2 ** 32) >>> 0;
let evolveCache = { bar: -1, rows: null, src: null, amount: -1 };
function evolvedDrumRows(stepNumber, rows, conds) {
  const amount = settings.drumEvolve / 100;
  if (amount <= 0) return rows;
  const bar = Math.floor(stepNumber / DRUM_STEPS);
  const c = evolveCache;
  if (c.bar !== bar || c.src !== rows || c.amount !== amount) {
    evolveCache = { bar, src: rows, amount, rows: evolveDrums(rows, amount, barRng(runSeed, bar), conds) };
  }
  return evolveCache.rows;
}

/** Song mode: the slot for the bar containing `stepNumber`, or null when Song is off. */
function songSlot(stepNumber) {
  if (!settings.songOn || !settings.songChain.length) return null;
  return settings.songChain[Math.floor(stepNumber / DRUM_STEPS) % settings.songChain.length];
}

function playDrums(step) {
  if (step.stepNumber % DRUM_STEPS === 0 && settings.songOn) {
    uiEvents.push({ kind: 'song', time: step.time, bar: Math.floor(step.stepNumber / DRUM_STEPS) });
  }
  const voices = kitVoices();
  const data = drumSlotData(songSlot(step.stepNumber) || settings.drumSlot);
  const played = evolvedDrumRows(step.stepNumber, data.rows, data.conds);
  // Once a bar (and on the first step): tell the grid how this bar differs from what's on screen.
  if (step.stepNumber % DRUM_STEPS === 0 || !drumOverlayShown) {
    drumOverlayShown = true;
    uiEvents.push({ kind: 'drum-overlay', time: step.time, overlay: drumOverlay(settings.drumRows, played) });
  }
  const hits = drumHits(played, step.stepNumber, {
    conds: data.conds, lens: data.lens, muted: settings.drumMuted, voices,
    fill: isFillBar(step.stepNumber, settings.drumFillEvery),
  });
  for (const { id, gain } of hits) {
    // Each row has its own level and tuning (the sample mixer, or the kit's mixer).
    const { level, tune: rowTune } = rowMix(id);
    const rowLevel = level / 100;
    // Humanize: each hit its own small push or drag and level.
    const t = settings.humanize > 0 ? human(step).time : step.time;
    if (drums && settings.drumLevel > 0 && rowLevel > 0) drums.play(id, t, humanLevel(gain, 1.5) * rowLevel, rowTune);
    if (settings.drumMidiCh >= 0) {
      const { gm } = voices.find((v) => v.id === id);
      midi.noteOn(gm, Math.min(127, Math.round(gain * 127)), toPerfMs(t), settings.drumMidiCh);
      midi.noteOff(gm, toPerfMs(t + 0.05), settings.drumMidiCh);
    }
  }
  uiEvents.push({ kind: 'drum', time: step.time, step: step.stepNumber, hits: hits.map((h) => h.id) });
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
      runSeed = (Math.random() * 2 ** 32) >>> 0; // each run evolves differently
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
    if (pendingScene) queueMicrotask(applyPendingScene); // stopped before the bar came: switch now
    scoreStart = null;
    scoreSounding.length = 0;
    synth?.panic();
    padVoices.clear(); // panic already silenced them
    breakPlayer?.stop(ctx ? ctx.currentTime : 0);
    monoSynth?.panic();
    monoGateOpen = false;
    monoMidiNote = null; // allNotesOff below releases it
    showMonoStep(-1);
    midi.allNotesOff();
    uiEvents.length = 0;
    breakRoll = null;
    // Back to showing the patterns as written.
    drumOverlayShown = false;
    showDrumOverlay(null);
    for (const el of breakRowEls) { el.classList.remove('evolved'); delete el.dataset.ev; }
    clearCurrentStep();
    showRhythmPos(-1);
    resetProgression();
    showProgSlot(-1);
    showDrumStep(-1, []);
    showSongBar(-1);
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
  // Mono synth Write armed: the key goes into its sequence instead of the arp.
  if (settings.monoArmed) { monoWrite(note); return; }
  if (settings.monoKeys) monoKeyTranspose = note - 48; // keys transpose the mono sequence (C3 = none)
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
// ---- MIDI In per module: each synth can be played live from its own channel.
const liveChord = new Map(); // note -> voice (chord synth, held until note off)
const liveMono = []; // notes held on the mono synth's channel, last one sounding

const liveNow = () => { ensureAudio(); return ctx.currentTime + 0.005; };

/** Aftertouch value 0..127 as an amount 0..1, scaled by the depth (0 when switched off). */
const pressureAmount = (v) => (settings.aftertouch ? (v / 127) * (settings.aftertouchDepth / 100) : 0);
const arpPressure = new Map(); // held key -> aftertouch amount (Arp channel)
let arpChannelPressure = 0;
/** Aftertouch for an arp note: its own key's pressure (any octave of it), else channel pressure. */
// ---- chord synth filter turned while notes are held
const chordHits = []; // analog rhythm hits still sounding: {voice, press}
function trackHit(voice, press = 0) {
  if (!voice) return;
  const now = ctx.currentTime;
  while (chordHits.length && chordHits[0].voice.end <= now) chordHits.shift();
  chordHits.push({ voice, press });
}

/** Cutoff, Resonance or Brightness moved: everything the chord synth is holding follows. */
function applyChordFilter() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const q = settings.chordResonance;
  const bright = settings.fmBright / 100;
  const each = (v, press = 0) => {
    v?.setFilter?.(Math.min(16000, settings.chordCutoff * Math.pow(2, 2 * press)), q, t);
    v?.setBright?.(bright, t);
  };
  for (const v of padVoices.values()) each(v); // pad (aftertouch stays on top, through the filter's detune)
  for (const v of liveChord.values()) each(v); // chords played on the chord synth's channel
  while (chordHits.length && chordHits[0].voice.end <= t) chordHits.shift();
  for (const h of chordHits) each(h.voice, h.press); // rhythm hits still ringing
}

/** Aftertouch for a chord-layer note: the pressure on the key it comes from (the chord's Octave undone). */
const chordPressure = (chordNote) => arpPressureFor(chordNote - 12 * settings.chordOctave);

/** Poly aftertouch on the keys: each held pad note follows its own key's pressure. */
function padPressure() {
  if (!ctx || !padVoices.size) return;
  const t = ctx.currentTime;
  for (const v of padVoices.values()) if (!v.sub && v.note !== undefined) v.pressure?.(chordPressure(v.note), t);
}

function arpPressureFor(sourceNote) {
  if (arpPressure.has(sourceNote)) return arpPressure.get(sourceNote);
  for (const [n, p] of arpPressure) if ((n - sourceNote) % 12 === 0) return p;
  return arpChannelPressure;
}

const MIDI_IN_MODULES = [
  ['midiInChord', {
    on(note, vel) {
      const t = liveNow();
      if (!synth || !settings.synthOn) return;
      liveChord.get(note)?.release(t);
      liveChord.set(note, null); // in the chord before it's tuned, so it tunes with the rest
      const voice = settings.chordSound !== 'analog'
        ? synth.fmVoice(tuned(note), vel, t, { ...fmOptions(), out: chorus.input })
        : synth.padVoice(tuned(note), vel, t, {
          layers: chordLayers(), cutoff: settings.chordCutoff, resonance: settings.chordResonance,
          level: settings.chordLevel / 100, out: chorus.input, attack: 0.008, release: 0.35,
        });
      liveChord.set(note, voice);
    },
    off(note) {
      liveChord.get(note)?.release(liveNow());
      liveChord.delete(note);
    },
    pressure(note, p) { liveChord.get(note)?.pressure?.(p, liveNow()); },
    channel(p) { const t = liveNow(); for (const v of liveChord.values()) v?.pressure?.(p, t); },
    all() { const t = liveNow(); for (const v of liveChord.values()) v?.release(t); liveChord.clear(); },
  }],
  ['midiInMono', {
    // Last-note priority, like a mono synth: overlapping notes slide (legato) without retriggering.
    on(note, vel) {
      const t = liveNow();
      const legato = liveMono.length > 0;
      const i = liveMono.indexOf(note);
      if (i >= 0) liveMono.splice(i, 1);
      liveMono.push(note);
      if (monoSynth && settings.synthOn) {
        if (!legato) monoSynth.pressure(0, t); // a fresh note starts without pressure
        monoSynth.noteOn(tuned(note), t, { legato, velocity: vel / 127 });
      }
    },
    // Only the note that's sounding responds (it's a mono synth).
    pressure(note, p) { if (monoSynth && liveMono[liveMono.length - 1] === note) monoSynth.pressure(p, liveNow()); },
    channel(p) { if (monoSynth) monoSynth.pressure(p, liveNow()); },
    off(note) {
      const i = liveMono.indexOf(note);
      if (i < 0) return;
      const wasTop = i === liveMono.length - 1;
      liveMono.splice(i, 1);
      if (!monoSynth || !settings.synthOn) return;
      const t = liveNow();
      if (!liveMono.length) monoSynth.noteOff(t);
      else if (wasTop) monoSynth.noteOn(tuned(liveMono[liveMono.length - 1]), t, { legato: true }); // back to the held note
    },
    all() { liveMono.length = 0; if (monoSynth) monoSynth.noteOff(liveNow()); },
  }],
  ['midiInDrums', {
    // General MIDI drum notes play the kit's matching sounds (as set in its mixer).
    on(note, vel) {
      const voice = kitVoices().find((v) => v.gm === note);
      if (!voice || !drums) { ensureAudio(); if (!voice) return; }
      const { level, tune } = rowMix(voice.id);
      if (drums && level > 0) drums.play(voice.id, liveNow(), (vel / 127) * 1.2 * (level / 100), tune);
    },
    off() {},
  }],
  ['midiInBreak', {
    // C1 (36) plays slice 1, C♯1 slice 2, and so on: finger-drum the break.
    on(note, vel) {
      const slice = note - 36;
      const t = liveNow();
      if (!breakPlayer || !breakBuffer || slice < 0 || slice >= breakPoints.length) return;
      breakPlayer.trigger(t, {
        offset: breakPoints[slice],
        duration: (slice + 1 < breakPoints.length ? breakPoints[slice + 1] : breakBuffer.duration) - breakPoints[slice],
        rate: fitRate(breakBuffer.duration, settings.breakBars, currentBpm(), settings.breakPitch, settings.breakFit),
        gain: vel / 127,
      });
    },
    off() {},
  }],
];

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
    // MIDI Learn: a CC that's being learned, or one that's mapped to a control.
    if (type === 0xb0 && handleCc(ch, d1, d2)) return;
    // A channel claimed by a module goes only to that module.
    const isOn = type === 0x90 && d2 > 0;
    const isOff = type === 0x80 || (type === 0x90 && d2 === 0);
    for (const [key, play] of MIDI_IN_MODULES) {
      if (settings[key] !== ch) continue;
      if (isOn) play.on(d1, d2);
      else if (isOff) play.off(d1);
      else if (type === 0xb0 && (d1 === 123 || d1 === 120)) play.all?.(); // all notes / sound off
      else if (type === 0xa0) play.pressure?.(d1, pressureAmount(d2)); // polyphonic aftertouch
      else if (type === 0xd0) play.channel?.(pressureAmount(d1)); // channel pressure: every held note
      return;
    }
    if (settings.midiInCh === -2 || (settings.midiInCh >= 0 && ch !== settings.midiInCh)) return; // -2: arp off
    if (type === 0x90 && d2 > 0) noteOn(d1, d2);
    else if (type === 0x80 || (type === 0x90 && d2 === 0)) { noteOff(d1); arpPressure.delete(d1); }
    else if (type === 0xa0) {
      if (d2 > 0) arpPressure.set(d1, pressureAmount(d2)); else arpPressure.delete(d1);
      padPressure();
    } else if (type === 0xd0) { arpChannelPressure = pressureAmount(d1); padPressure(); }
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
  if (!DEVICE_KEYS.includes(key)) {
    onRecall(() => { el.value = String(settings[key]); onChange?.(settings[key]); });
  }
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
  if (!DEVICE_KEYS.includes(key)) {
    onRecall(() => { el.value = settings[key]; show(); onChange?.(settings[key]); });
  }
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
  onRecall(() => { el.value = freqToSlider(settings[key], min, max); show(); onChange?.(settings[key]); });
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
onRecall(() => { if (settings.sync === 'internal') setBpm(settings.bpm); });

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
onRecall(() => { $('clock-out').checked = settings.clockOut; });
onRecall(() => setLatch(!!settings.latch));
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
const arMs = (v) => (v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(2)} s`);
bindLog('arp-attack', 'arpAttack', 2, 2000, arMs);
bindLog('arp-release', 'arpRelease', 10, 4000, arMs);
bindRange('volume', 'volume', (v) => `${v}%`, (v) => synth?.setVolume(v / 100));

for (let c = 1; c <= 16; c++) {
  $('midi-in-ch').add(new Option(String(c), String(c - 1)));
  $('midi-out-ch').add(new Option(String(c), String(c - 1)));
}
bindSelect('midi-in-ch', 'midiInCh');
for (const [id, key] of [['midi-in-chord', 'midiInChord'], ['midi-in-mono', 'midiInMono'], ['midi-in-drums', 'midiInDrums'], ['midi-in-break', 'midiInBreak']]) {
  for (let c = 1; c <= 16; c++) $(id).add(new Option(String(c), String(c - 1)));
  bindSelect(id, key, null, () => {
    // Letting go of a channel: silence anything it was holding.
    for (const [k, play] of MIDI_IN_MODULES) if (k === key) play.all?.();
    renderMidiInClash();
  });
}
/** Warn when the arp's In Ch is Omni or the same as a module's: those notes go to the module, not the arp. */
function renderMidiInClash() {
  const taken = MIDI_IN_MODULES.map(([k]) => settings[k]).filter((c) => c >= 0);
  const dup = taken.length !== new Set(taken).size;
  $('midi-in-note').textContent = dup ? 'Two modules share a channel: the first one listed gets it.'
    : taken.includes(settings.midiInCh) ? 'The arp shares a channel with a module: the module gets those notes.' : '';
}
renderMidiInClash();
$('aftertouch').checked = settings.aftertouch;
$('aftertouch').addEventListener('change', () => { settings.aftertouch = $('aftertouch').checked; save(); });
bindRange('aftertouch-depth', 'aftertouchDepth', (v) => `${v}%`);
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
  for (const id of ['midi-in', 'midi-out', 'midi-in-ch', 'midi-out-ch', 'osc2-midi-ch', 'chord-midi-ch', 'drum-midi-ch', 'clock-out',
    'midi-in-chord', 'midi-in-mono', 'midi-in-drums', 'midi-in-break']) $(id).disabled = !ok;
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

function renderArpOn() {
  $('arp-on').setAttribute('aria-pressed', String(settings.arpOn));
  $('arp-on').textContent = settings.arpOn ? 'On' : 'Off';
  $('arp-on').closest('.panel').classList.toggle('off', !settings.arpOn);
}
$('arp-on').addEventListener('click', () => {
  settings.arpOn = !settings.arpOn;
  renderArpOn();
  save();
});
onRecall(renderArpOn)();

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
bindRange('arp-level', 'arpLevel', (v) => `${v}%`);
bindRange('osc1-level', 'osc1Level', (v) => `${v}%`);
bindSelect('osc2-sound', 'osc2Sound', [['west', 'West-coast'], ['bass', 'Upright bass']], renderOsc2Sound);
bindRange('bass-tone', 'bassTone', (v) => `${v}%`);
bindLog('bass-decay', 'bassDecay', 300, 6000, (v) => (v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(1)} s`));
/** The upright bass has its own Tone and Decay; the west-coast controls don't apply to it. */
function renderOsc2Sound() {
  const bass = settings.osc2Sound === 'bass';
  $('osc2-panel').classList.toggle('bass', bass);
  $('bass-row').hidden = !bass;
}
onRecall(renderOsc2Sound)();
// Choosing the bass by hand: put it in a bass register if it's still up with the arp.
$('osc2-sound').addEventListener('change', () => {
  if (settings.osc2Sound === 'bass' && settings.osc2Transpose > -12) {
    settings.osc2Transpose = -12;
    $('osc2-transpose').value = '-12';
    save();
  }
});
bindSelect('tuning', 'tuning', Object.entries(TUNINGS), () => {
  clearSweet();
  applyPure();
  if (ctx) padFollow(ctx.currentTime, 0.05);
  monoRoot = undefined; // retune a held mono note on the next 16th
  if (arpTail) arpTail.root = undefined; // and a ringing arp note
});
$('tuning-pure').addEventListener('change', () => {
  settings.tuningPure = $('tuning-pure').checked;
  applyPure();
  save();
});
bindSelect('tuning-key', 'tuningKey',
  [['auto', 'Auto'], ...['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'].map((n, i) => [String(i), n])],
  () => { clearSweet(); renderPure(); if (ctx) padFollow(ctx.currentTime, 0.05); monoRoot = undefined; if (arpTail) arpTail.root = undefined; });
renderPure(); // the audio side is applied when audio starts (ensureAudio)
onRecall(applyPure);
bindRange('humanize', 'humanize', (v) => (v ? `${v}%` : 'off'));
bindSelect('chord-sound', 'chordSound', [['analog', 'Analog'], ['ep', 'FM E.Piano'], ['fmpad', 'FM Pad']], () => {
  renderChordSound();
  if (ctx && padVoices.size) updatePad(ctx.currentTime); // swap a held pad over to the new sound
});
bindRange('fm-bright', 'fmBright', (v) => `${v}%`, applyChordFilter);
bindRange('fm-bell', 'fmBell', (v) => `${v}%`);
bindLog('fm-decay', 'fmDecay', 200, 10000, (v) => (v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(2)} s`));
/** FM sounds show their own row and grey out the analog voice, PWM and filter. */
function renderChordSound() {
  const fm = settings.chordSound !== 'analog';
  $('chord-panel').classList.toggle('fm', fm);
  $('chord-panel').classList.toggle('fm-pad', settings.chordSound === 'fmpad');
  $('fm-row').hidden = !fm;
  const pad = settings.chordMode === 'pad';
  $('fm-note').textContent = settings.chordSound === 'ep'
    ? (pad ? 'Each new chord note is struck and rings out; Release sets the damping.' : 'Tip: a Gate near 100% lets the piano ring.')
    : fm ? (pad ? 'The swell follows Attack and Release.' : 'Pad mode suits it best: the swell then follows Attack and Release.') : '';
}
onRecall(renderChordSound)();
$('chord-wave').addEventListener('change', showPwm);
$('chord-wave2').addEventListener('change', showPwm);
onRecall(showPwm)();
onRecall(() => { $('chord-sub-level').disabled = settings.chordSub === 'off'; })();
for (let o = -2; o <= 2; o++) $('chord-octave').add(new Option(o > 0 ? `+${o}` : String(o), String(o)));
bindSelect('chord-octave', 'chordOctave');
bindRange('chord-gate', 'chordGate', (v) => `${v}%`);
bindRange('chord-level', 'chordLevel', (v) => `${v}%`);
bindSelect('chord-mode', 'chordMode', [['rhythm', 'Rhythm'], ['pad', 'Pad (always on)']], () => {
  renderChordMode();
  if (ctx && (playing || padVoices.size)) updatePad(ctx.currentTime); // start only while playing; always allow release
});
bindLog('pad-attack', 'padAttack', 5, 5000, (v) => (v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(2)} s`));
bindLog('pad-release', 'padRelease', 20, 8000, (v) => (v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(2)} s`));
bindLog('pad-glide', 'padGlide', 1, 2000, (v) => (v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(2)} s`));
/** Pad mode greys out the Euclidean controls and shows Attack/Release. */
function renderChordMode() {
  const pad = settings.chordMode === 'pad';
  $('chord-panel').classList.toggle('pad', pad);
  for (const id of ['chord-rate', 'chord-steps', 'chord-hits', 'chord-rotate', 'chord-gate', 'chord-syncopate', 'chord-tie']) {
    $(id).closest('label').classList.toggle('rhythm-only', true);
  }
  $('chord-pattern').closest('.field').classList.add('rhythm-only');
  $('pad-row').hidden = !pad;
  if (typeof renderChordSound === 'function' && $('fm-note')) renderChordSound();
  $('pad-glide').closest('label').classList.toggle('dim', !settings.chordFollowSeq);
}
onRecall(renderChordMode)();
bindCutoff('chord-cutoff', 'chordCutoff', applyChordFilter);
bindRange('chord-res', 'chordResonance', (v) => v.toFixed(1), applyChordFilter);
bindRange('chorus-mix', 'chordChorusMix', (v) => `${v}%`, applyChorusMix);
/** The chorus's pitch wobble beats against pure intervals, so Pure tuning takes it out. */
function applyChorusMix() { chorus?.setMix(pure() ? 0 : settings.chordChorusMix / 100); }
bindRange('chorus-rate', 'chordChorusRate', (v) => `${v.toFixed(2)} Hz`, (v) => chorus?.setRate(v));
bindRange('chorus-depth', 'chordChorusDepth', (v) => `${v}%`, (v) => chorus?.setDepth(v / 100));
$('chord-syncopate').checked = settings.chordSyncopate;
$('chord-syncopate').addEventListener('change', () => {
  settings.chordSyncopate = $('chord-syncopate').checked;
  $('chord-tie').disabled = !settings.chordSyncopate;
  save();
});
$('chord-tie').checked = settings.chordTie;
$('chord-tie').disabled = !settings.chordSyncopate;
$('chord-tie').addEventListener('change', () => { settings.chordTie = $('chord-tie').checked; save(); });
onRecall(() => {
  for (const [id, key] of [['chord-syncopate', 'chordSyncopate'], ['chord-tie', 'chordTie'], ['chord-gate-arp', 'chordGateArp'], ['chord-follow', 'chordFollowSeq']]) {
    $(id).checked = !!settings[key];
  }
  $('chord-tie').disabled = !settings.chordSyncopate;
});
$('chord-gate-arp').checked = settings.chordGateArp;
$('chord-gate-arp').addEventListener('change', () => { settings.chordGateArp = $('chord-gate-arp').checked; save(); });
$('chord-follow').checked = settings.chordFollowSeq;
$('chord-follow').addEventListener('change', () => {
  settings.chordFollowSeq = $('chord-follow').checked;
  renderChordMode();
  if (ctx) padFollow(ctx.currentTime); // a pad snaps back to the chord (or onto the step) at once
  save();
});
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

/** What each slot plays, after inversions and voice leading. */
function progVoicings() {
  return progressionVoicings(settings.progression.slice(0, settings.progLength), settings.progOctave, settings.progVoicing);
}

function progEdited() {
  progIndex = -1; // pick up the change on the next clock pulse
  renderProgression(); // smooth voicing can change the other slots' inversions
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
      <select class="inv" aria-label="Slot ${i + 1} inversion"></select>
      <select class="oct" aria-label="Slot ${i + 1} register" title="Register: move this chord up or down an octave or two"></select>
      <select class="beats" aria-label="Slot ${i + 1} length"></select>`;
    const root = el.querySelector('.root');
    const type = el.querySelector('.type');
    const beats = el.querySelector('.beats');
    const inv = el.querySelector('.inv');
    INVERSIONS.forEach((label, v) => inv.add(new Option(label, String(v))));
    const oct = el.querySelector('.oct');
    for (const o of SLOT_OCTAVES) oct.add(new Option(o === 0 ? 'Oct 0' : `Oct ${o > 0 ? '+' : '−'}${Math.abs(o)}`, String(o)));
    NOTE_CLASSES.forEach((n, v) => root.add(new Option(n, String(v))));
    for (const [t, { label }] of Object.entries(CHORDS)) type.add(new Option(label, t));
    type.add(new Option('Rest', 'rest'));
    for (const b of PROGRESSION_BEATS) beats.add(new Option(`${b} beat${b > 1 ? 's' : ''}`, String(b)));
    const update = () => {
      settings.progression[i] = {
        root: Number(root.value), type: type.value, beats: Number(beats.value), inv: Number(inv.value),
        oct: Number(oct.value),
      };
      progEdited();
    };
    [root, type, inv, oct, beats].forEach((s) => s.addEventListener('change', update));
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
  bindSelect('prog-voicing', 'progVoicing', Object.entries(PROG_VOICINGS), () => progEdited());
  bindSelect('prog-mod-every', 'progModEvery',
    MOD_EVERY.map((n) => [String(n), n === 0 ? 'Off' : `every ${n === 1 ? 'round' : `${n} rounds`}`]), () => { renderModBy(); progEdited(); });
  bindSelect('prog-mod-by', 'progModBy',
    Object.entries(MOD_INTERVALS).sort((a, b) => (Number(a[0]) < 0) - (Number(b[0]) < 0) || Math.abs(a[0]) - Math.abs(b[0])),
    () => progEdited());
  renderModBy();

  const preset = $('prog-preset');
  for (const name of Object.keys(PROGRESSION_PRESETS)) preset.add(new Option(name, name));
  preset.addEventListener('change', () => {
    const chords = PROGRESSION_PRESETS[preset.value];
    preset.value = '';
    if (!chords) return;
    chords.forEach(([root, type], i) => { settings.progression[i] = { root, type, beats: 4, inv: 0, oct: 0 }; });
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

function renderSlot(i, voicing) {
  const el = slotEls[i];
  const slot = settings.progression[i];
  const off = i >= settings.progLength;
  const rest = slot.type === 'rest';
  el.querySelector('.root').value = String(slot.root);
  el.querySelector('.type').value = slot.type;
  el.querySelector('.beats').value = String(slot.beats);
  el.querySelector('.oct').value = String(slot.oct || 0);
  el.querySelector('.oct').disabled = rest || off;
  el.querySelector('.root').disabled = rest || off;
  // Smooth voicing picks every inversion after the first chord's.
  const auto = settings.progVoicing !== 'set' && i > 0;
  const inv = el.querySelector('.inv');
  const size = rest ? 1 : CHORDS[slot.type].intervals.length;
  [...inv.options].forEach((o, k) => { o.hidden = k >= size; });
  inv.value = String(auto && voicing ? voicing.inv : Math.min(slot.inv || 0, size - 1));
  inv.disabled = rest || off || auto;
  inv.title = auto ? 'Chosen by the voicing: which chord tone ended up in the bass' : 'Inversion: which chord note is lowest';
  const bass = voicing?.notes?.[0];
  const nameEl = el.querySelector('.name');
  nameEl.textContent = slotName(slot);
  if (!rest && bass !== undefined && bass % 12 !== slot.root) {
    const over = document.createElement('small');
    over.className = 'bass';
    over.textContent = `/${NOTE_CLASSES[bass % 12]}`; // slash chord: the inversion's bass note
    nameEl.append(over);
  }
}

function renderProgression() {
  $('prog-on').setAttribute('aria-pressed', String(settings.progOn));
  $('prog-on').textContent = settings.progOn ? 'On' : 'Off';
  $('prog-panel').classList.toggle('off', !settings.progOn);
  showProgKey(progShift);
  $('prog-length').querySelectorAll('button').forEach((b) => {
    b.setAttribute('aria-pressed', String(Number(b.dataset.n) === settings.progLength));
  });
  const voicings = progVoicings();
  slotEls.forEach((el, i) => {
    const off = i >= settings.progLength;
    el.classList.toggle('disabled', off);
    el.querySelectorAll('select').forEach((s) => { s.disabled = off; });
    // Slots past the length still show their own inversion as a slash chord.
    renderSlot(i, voicings[i] || { notes: slotNotes(settings.progression[i], settings.progOctave), inv: settings.progression[i].inv || 0 });
  });
}

/** The modulation interval only matters when modulation is on. */
function renderModBy() {
  $('prog-mod-by').disabled = !settings.progModEvery;
  $('prog-mod-all').disabled = !settings.progModEvery;
  $('prog-mod-all').checked = settings.progModAll;
}
$('prog-mod-all').addEventListener('change', () => {
  settings.progModAll = $('prog-mod-all').checked;
  engine.heldShift = settings.progModAll ? progShift : 0;
  save();
});
onRecall(renderModBy);

/** Show which key the progression is in now (relative to how it's written). */
function showProgKey(shift = 0) {
  const el = $('prog-key');
  if (!settings.progModEvery || !settings.progOn) { el.textContent = ''; return; }
  const first = settings.progression[0];
  const key = first && first.type !== 'rest' ? ` (${NOTE_CLASSES[(first.root + shift + 12) % 12]})` : '';
  el.textContent = `Key ${shift > 0 ? '+' : shift < 0 ? '−' : '±'}${Math.abs(shift)}${key}`;
}

let lastSlotEl = null;
function showProgSlot(i) {
  lastSlotEl?.classList.remove('current');
  lastSlotEl = slotEls[i] || null;
  lastSlotEl?.classList.add('current');
}

buildProgression();
onRecall(() => { progIndex = -1; renderProgression(); })();

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
/** A drum pattern ({preset, rows, conds, lens}) made valid for the current kit. */
function normalizeDrumState(state = {}) {
  const { presets, voices } = kit();
  const preset = presets[state.preset] || state.preset === 'custom' ? state.preset : Object.keys(presets)[0];
  const rows = normalizeRows(state.rows, voices) || parsePattern(presets[preset] || {}, voices);
  const conds = state.conds && typeof state.conds === 'object' ? state.conds : {};
  const lens = state.lens && typeof state.lens === 'object' ? state.lens : {};
  const out = { preset, rows, conds: {}, lens: {} };
  for (const { id } of voices) {
    const c = Array.isArray(conds[id]) ? conds[id] : [];
    out.conds[id] = Array.from({ length: DRUM_STEPS }, (_, i) => (CONDITIONS[c[i]] !== undefined ? c[i] : ''));
    const n = Number(lens[id]);
    out.lens[id] = n >= 1 && n <= DRUM_STEPS ? n : DRUM_STEPS;
  }
  return out;
}

function loadKitState() {
  if (!KITS[settings.drumKit]) settings.drumKit = 'latin';
  const s = normalizeDrumState({
    preset: settings.drumPreset, rows: settings.drumRows, conds: settings.drumConds, lens: settings.drumLens,
  });
  settings.drumPreset = s.preset;
  settings.drumRows = s.rows;
  settings.drumConds = s.conds;
  settings.drumLens = s.lens;
  if (!settings.drumMuted || typeof settings.drumMuted !== 'object') settings.drumMuted = {};
  if (!SLOTS.includes(settings.drumSlot)) settings.drumSlot = 'A';
  if (!settings.drumSlots || typeof settings.drumSlots !== 'object') settings.drumSlots = {};
}

// ---- Pattern slots A–D: the slot being edited lives in drumRows/drumConds/drumLens/
// drumPreset; the others wait in drumSlots (per kit, via the kit store).
const SLOTS = ['A', 'B', 'C', 'D'];
const drumSlotCache = {};

function currentDrumState() {
  return { preset: settings.drumPreset, rows: settings.drumRows, conds: settings.drumConds, lens: settings.drumLens };
}

/** Pattern data for a slot (the edited one is live; empty slots fall back to it). */
function drumSlotData(slot) {
  if (!slot || slot === settings.drumSlot || !settings.drumSlots[slot]) return currentDrumState();
  const stored = settings.drumSlots[slot];
  const cached = drumSlotCache[slot];
  if (cached && cached.src === stored && cached.kit === settings.drumKit) return cached.data;
  const data = normalizeDrumState(stored);
  drumSlotCache[slot] = { src: stored, kit: settings.drumKit, data };
  return data;
}

function selectDrumSlot(slot) {
  if (slot === settings.drumSlot) return;
  settings.drumSlots[settings.drumSlot] = structuredClone(currentDrumState());
  // A new slot starts as a copy of the one you were on, ready to vary.
  const next = settings.drumSlots[slot] ? structuredClone(settings.drumSlots[slot]) : structuredClone(currentDrumState());
  delete settings.drumSlots[slot];
  settings.drumSlot = slot;
  Object.assign(settings, { drumPreset: next.preset, drumRows: next.rows, drumConds: next.conds, drumLens: next.lens });
  loadKitState();
  buildDrumGrid();
  fillDrumPresets();
  renderDrumGrid();
  renderSlotButtons();
  save();
}
if (!settings.drumKitStore || typeof settings.drumKitStore !== 'object') settings.drumKitStore = {};
loadKitState();

function switchKit(next) {
  if (next === settings.drumKit || !KITS[next]) return;
  settings.drumKitStore[settings.drumKit] = {
    preset: settings.drumPreset, rows: settings.drumRows, muted: settings.drumMuted,
    conds: settings.drumConds, lens: settings.drumLens, slot: settings.drumSlot, slots: settings.drumSlots,
  };
  const stored = settings.drumKitStore[next] || {};
  settings.drumKit = next;
  settings.drumPreset = stored.preset;
  settings.drumRows = stored.rows;
  settings.drumMuted = stored.muted || {};
  settings.drumConds = stored.conds || {};
  settings.drumLens = stored.lens || {};
  settings.drumSlot = stored.slot || 'A';
  settings.drumSlots = stored.slots || {};
  loadKitState();
  renderSlotButtons();
  showDrumStep(-1, []);
  $('sample-tools').hidden = settings.drumKit !== 'user';
  if (settings.drumKit === 'user') updateSampleStatus();
  renderDrumMix();
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
        if (settings.drumTapMode === 'cond') {
          // Condition mode: give this step the chosen condition (tap again to clear it).
          const conds = settings.drumConds[id];
          if (settings.drumRows[id][s] === 0) settings.drumRows[id][s] = 0.65;
          conds[s] = conds[s] === settings.drumCondPick ? '' : settings.drumCondPick;
        } else {
          // Cycle: off → hit → accent → off.
          const v = settings.drumRows[id][s];
          settings.drumRows[id][s] = v === 0 ? 0.65 : v < 1 ? 1 : 0;
          if (settings.drumRows[id][s] === 0) settings.drumConds[id][s] = '';
        }
        settings.drumPreset = 'custom';
        $('drum-preset').value = 'custom';
        renderDrumGrid();
        save();
      });
      grid.append(c);
      drumCells[id].push(c);
    }
    // This row's length: fewer steps than 16 and it loops early, drifting against the others.
    const len = document.createElement('select');
    len.className = 'drum-len';
    len.setAttribute('aria-label', `${label} length`);
    len.title = 'Row length: shorter rows loop sooner and drift against the others';
    for (let n = DRUM_STEPS; n >= 1; n--) len.add(new Option(String(n), String(n)));
    len.value = String(settings.drumLens[id]);
    len.addEventListener('change', () => {
      settings.drumLens[id] = Number(len.value);
      renderDrumGrid();
      save();
    });
    grid.append(len);
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
    settings.drumConds = {};
    loadKitState(); // fresh, empty conditions for the new preset
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
    const len = settings.drumLens[id];
    drumCells[id].forEach((c, s) => {
      const v = settings.drumRows[id][s];
      const cond = v > 0 ? settings.drumConds[id][s] : '';
      c.classList.toggle('on', v > 0);
      c.classList.toggle('acc', v >= 1);
      c.classList.toggle('past', s >= len);
      c.classList.toggle('cond', !!cond);
      c.dataset.cond = cond ? CONDITIONS[cond].replace('Not fill', '!F').replace('Not first', '!1st').replace('First', '1st').replace('Fill', 'F') : '';
      c.title = cond ? `Plays: ${CONDITIONS[cond]}` : '';
    });
  }
}

/** Playhead: each row shows its own position (rows of different lengths drift apart). */
let drumNowCells = [];
let drumOverlayShown = false; // has this run told the grid about the bar yet?

/** Mark cells that Evolve (or a Song slot) changed this bar: added, dropped or re-levelled hits. */
function showDrumOverlay(overlay) {
  for (const { id } of kitVoices()) {
    (drumCells[id] || []).forEach((c, s) => {
      const d = overlay?.[id]?.[s] || '';
      c.classList.toggle('ev-add', d === 'add');
      c.classList.toggle('ev-drop', d === 'drop');
      c.classList.toggle('ev-change', d === 'change');
    });
  }
}

function showDrumStep(step, hits) {
  if (step < 0) { drumOverlayShown = false; showDrumOverlay(null); }
  for (const c of drumNowCells) c.classList.remove('now');
  drumNowCells = [];
  drumCol = step;
  const ids = kitVoices().map((v) => v.id).filter((id) => drumCells[id]);
  if (step >= 0) {
    for (const id of ids) {
      const cell = drumCells[id][step % (settings.drumLens[id] || DRUM_STEPS)];
      cell.classList.add('now');
      drumNowCells.push(cell);
    }
  }
  for (const id of ids) drumLabels[id].classList.toggle('hit', hits.includes(id));
  $('drum-fill-led')?.classList.toggle('lit', step >= 0 && isFillBar(step, settings.drumFillEvery));
}

// Variation controls: fill bars, what a tap does, and Add fill.
for (const n of FILL_EVERY) $('drum-fill-every').add(new Option(n ? `every ${n} bars` : 'Off', String(n)));
bindSelect('drum-fill-every', 'drumFillEvery');
bindSelect('drum-tap', 'drumTapMode', [['hits', 'Hits'], ['cond', 'Conditions']], () => {
  $('drum-cond').disabled = settings.drumTapMode !== 'cond';
});
bindSelect('drum-cond', 'drumCondPick', Object.entries(CONDITIONS).filter(([k]) => k));
$('drum-cond').disabled = settings.drumTapMode !== 'cond';
bindRange('drum-evolve', 'drumEvolve', (v) => (v ? `${v}%` : 'off'));
$('drum-add-fill').addEventListener('click', () => {
  const n = addFill(settings.drumRows, settings.drumConds, kitVoices());
  if (!settings.drumFillEvery) { settings.drumFillEvery = 4; $('drum-fill-every').value = '4'; }
  settings.drumPreset = 'custom';
  $('drum-preset').value = 'custom';
  renderDrumGrid();
  save();
  $('drum-add-fill').textContent = n ? `Fill added (${n} hits)` : 'No room for a fill';
  setTimeout(() => { $('drum-add-fill').textContent = 'Add fill'; }, 1800);
});
$('drum-clear-conds').addEventListener('click', () => {
  for (const id of Object.keys(settings.drumConds)) settings.drumConds[id].fill('');
  for (const id of Object.keys(settings.drumLens)) settings.drumLens[id] = DRUM_STEPS;
  buildDrumGrid();
  renderDrumGrid();
  save();
});

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
    const cell = document.createElement('div');
    cell.className = 'map-row';
    cell.append(field, ...mixSliders(id, label));
    wrap.append(cell);
  }
}
if (!settings.sampleLevels || typeof settings.sampleLevels !== 'object') settings.sampleLevels = {};
if (!settings.drumMix || typeof settings.drumMix !== 'object') settings.drumMix = {};

/** Level (0–150 %) and tune (±12 st) for a drum row in the current kit. */
function rowMix(id) {
  if (settings.drumKit === 'user') {
    return { level: settings.sampleLevels?.[id] ?? 100, tune: settings.sampleTunes?.[id] ?? 0 };
  }
  const m = settings.drumMix[settings.drumKit]?.[id];
  return { level: m?.level ?? 100, tune: m?.tune ?? 0 };
}

function setRowMix(id, key, value) {
  if (settings.drumKit === 'user') {
    (key === 'level' ? settings.sampleLevels : settings.sampleTunes)[id] = value;
    return;
  }
  const kitMix = (settings.drumMix[settings.drumKit] ||= {});
  const m = (kitMix[id] ||= {});
  m[key] = value;
  if ((m.level ?? 100) === 100 && (m.tune ?? 0) === 0) delete kitMix[id];
}

/** Level and Tune sliders for one drum row (double-click resets). */
function mixSliders(id, label) {
  const make = (key, text, min, max, step, rest, fmt) => {
    const field = document.createElement('label');
    field.className = 'field slider';
    const out = document.createElement('output');
    const range = document.createElement('input');
    range.type = 'range';
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);
    range.value = String(rowMix(id)[key]);
    range.setAttribute('aria-label', `${label} ${key}`);
    const show = () => { out.textContent = fmt(Number(range.value)); };
    show();
    range.addEventListener('input', () => { setRowMix(id, key, Number(range.value)); show(); save(); });
    range.addEventListener('dblclick', () => { range.value = String(rest); range.dispatchEvent(new Event('input')); });
    field.append(`${text} `, out, range);
    return field;
  };
  return [
    // Level 0–150 %, so a quiet sound can be lifted a little.
    make('level', 'Level', 0, 150, 1, 100, (v) => `${v}%`),
    // Tune ±12 semitones in 0.1 steps: samples change speed; synthesized voices scale every frequency.
    make('tune', 'Tune', -12, 12, 0.1, 0, (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} st`),
  ];
}

/** The built-in kits' mixer: a level and a tuning for each sound. */
function renderDrumMix() {
  const user = settings.drumKit === 'user';
  $('drum-mix-tools').hidden = user;
  if (user) return;
  const wrap = $('drum-mix');
  wrap.replaceChildren();
  for (const { id, label } of kitVoices()) {
    const name = document.createElement('span');
    name.className = 'map-name';
    name.textContent = label;
    const cell = document.createElement('div');
    cell.className = 'map-row';
    cell.append(name, ...mixSliders(id, label));
    wrap.append(cell);
  }
}
$('drum-mix-reset').addEventListener('click', () => {
  delete settings.drumMix[settings.drumKit];
  renderDrumMix();
  save();
});
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
/**
 * A button that asks before it acts, without a browser dialog: the first click turns
 * it into "Sure? …" for a few seconds, a second click does it. (confirm()/prompt()
 * freeze the page, which stops the clock and the music.) `needed()` false = act at once.
 */
function confirmClick(button, action, { ask = `Sure? ${button.textContent}`, needed = () => true } = {}) {
  let timer = null;
  const label = button.textContent;
  const disarm = () => {
    clearTimeout(timer);
    timer = null;
    button.textContent = label;
    button.classList.remove('armed');
  };
  button.addEventListener('click', () => {
    if (timer || !needed()) {
      disarm();
      action();
      return;
    }
    button.textContent = ask;
    button.classList.add('armed');
    timer = setTimeout(disarm, 3000);
  });
  button.addEventListener('blur', () => { if (timer) disarm(); });
}

confirmClick($('sample-clear'), async () => {
  if (!Object.keys(sampleStore).length) return;
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
renderDrumMix();
renderDrumGrid();
onRecall(() => {
  loadKitState();
  if (!settings.drumKitStore || typeof settings.drumKitStore !== 'object') settings.drumKitStore = {};
  for (const k of ['drumMix', 'sampleLevels', 'sampleTunes']) {
    if (!settings[k] || typeof settings[k] !== 'object') settings[k] = {};
  }
  for (const k of Object.keys(drumSlotCache)) delete drumSlotCache[k];
  evolveCache = { bar: -1, rows: null, src: null, amount: -1 };
  $('drum-kit').value = settings.drumKit;
  $('sample-tools').hidden = settings.drumKit !== 'user';
  $('drum-cond').disabled = settings.drumTapMode !== 'cond';
  buildDrumGrid();
  fillDrumPresets();
  renderDrumMix();
  renderDrumGrid();
});
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

onRecall(repairBreak)();
function repairBreak() {
  if (!SLICE_COUNTS.includes(settings.breakSlices)) settings.breakSlices = 16;
  if (!BREAK_STEPS.includes(settings.breakSteps)) settings.breakSteps = 32;
  if (!BREAK_BARS.includes(settings.breakBars)) settings.breakBars = 2;
  if (!['equal', 'transient'].includes(settings.breakSliceMode)) settings.breakSliceMode = 'equal';
  if (typeof settings.breakPatternAuto !== 'boolean') settings.breakPatternAuto = !Array.isArray(settings.breakPattern);
  settings.breakPattern = Array.isArray(settings.breakPattern) && settings.breakPattern.length
    ? resizePattern(settings.breakPattern, settings.breakSteps)
    : inOrder(settings.breakSteps, equalPoints(settings.breakSlices, 1), 1, settings.breakBars * 16);
}

const sliceCount = () => breakPoints.length;

/** Recompute slice starts for the current break and slicing mode; refresh the pattern if it's auto. */
function computeBreakPoints() {
  if (!breakBuffer) return;
  const before = breakPoints.length;
  breakPoints = settings.breakSliceMode === 'transient'
    ? detectTransients(breakBuffer.getChannelData(0), breakBuffer.sampleRate, { sensitivity: settings.breakSensitivity / 100 })
    : equalPoints(settings.breakSlices, breakBuffer.duration);
  // Switched-off slices are numbers: if the slicing changes how many there are, they no longer mean the same.
  if (!Array.isArray(settings.breakOff)) settings.breakOff = [];
  if (before && before !== breakPoints.length) settings.breakOff = [];
  settings.breakOff = settings.breakOff.filter((k) => Number.isInteger(k) && k < breakPoints.length);
  if (settings.breakPatternAuto) settings.breakPattern = orderedPattern();
  $('break-slices').disabled = settings.breakSliceMode === 'transient';
  $('break-sensitivity').disabled = settings.breakSliceMode !== 'transient';
  buildBreakRows();
  updateBreakStatus();
}

function orderedPattern() {
  return inOrder(settings.breakSteps, breakPoints, breakBuffer ? breakBuffer.duration : 1, settings.breakBars * 16);
}

let breakRoll = null; // a roll carrying on through empty rows: {row, span, part}

function playBreakStep(step) {
  const idx = step.stepNumber % settings.breakSteps;
  const pattern = breakPatternFor(songSlot(step.stepNumber) || settings.breakSlot);
  const off = settings.breakOff || [];
  const evolved = evolveBreakRow(pattern[idx], settings.breakEvolve / 100,
    barRng(runSeed, Math.floor(step.stepNumber / settings.breakSteps), idx + 101),
    off.length ? usableSlices(sliceCount(), off) : sliceCount());
  // A row on a switched-off slice counts as empty: whatever was playing carries on.
  const row = evolved && off.includes(evolved.slice) && evolved.fx !== 'cut' ? { ...evolved, slice: null } : evolved;
  let triggers;
  let rolling = false;
  if (isFilled(row)) {
    // A new row stops any roll; a roll here holds until the next filled row (Roll hold).
    const span = settings.breakRollHold && row.roll > 0 && row.fx !== 'cut' ? rollSpan(pattern, idx) : 1;
    triggers = rowTriggers(row, step.duration, Math.random, { span, part: 0 });
    breakRoll = span > 1 && triggers.length ? { row, span, part: 0 } : null;
  } else if (breakRoll && breakRoll.part + 1 < breakRoll.span) {
    breakRoll.part += 1;
    triggers = rowTriggers(breakRoll.row, step.duration, Math.random, { span: breakRoll.span, part: breakRoll.part });
    rolling = true;
  } else {
    breakRoll = null;
    triggers = [];
  }
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
  uiEvents.push({ kind: 'break', time: step.time, step: idx, slice: shown, change: rolling ? 'roll…' : breakRowChange(pattern[idx], row) });
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

let breakSource = null; // the whole loaded file; breakBuffer is the trimmed part of it

/** Use a newly loaded break. `keepTrim`: a stored break restored with its saved trim. */
function setBreak(buffer, name, { keepTrim = false } = {}) {
  breakSource = buffer;
  breakName = name;
  if (!keepTrim) settings.breakTrim = { start: 0, end: 1 };
  applyBreakTrim();
}

/** Cut the trimmed part out of the loaded file (with tiny fades) and slice that. */
function applyBreakTrim() {
  if (!breakSource) return;
  const trim = settings.breakTrim || { start: 0, end: 1 };
  if (trim.start <= 0 && trim.end >= 1) {
    breakBuffer = breakSource;
  } else {
    const [from, to] = trimSamples(breakSource.length, breakSource.sampleRate, trim.start, trim.end);
    const out = new AudioBuffer({ length: to - from, numberOfChannels: breakSource.numberOfChannels, sampleRate: breakSource.sampleRate });
    for (let c = 0; c < breakSource.numberOfChannels; c++) {
      const data = breakSource.getChannelData(c).slice(from, to);
      fadeEdges(data, Math.round(breakSource.sampleRate * 0.003));
      out.copyToChannel(data, c);
    }
    breakBuffer = out;
  }
  breakPlayer?.setBuffer(breakBuffer);
  computeBreakPoints();
  renderTrim();
}

// ---- trim controls: Start/End sliders over an overview of the whole file.
const TRIM_STEPS = 1000;
let trimTimer = null;
function renderTrim() {
  const t = settings.breakTrim || { start: 0, end: 1 };
  $('break-trim-start').value = String(Math.round(t.start * TRIM_STEPS));
  $('break-trim-end').value = String(Math.round(t.end * TRIM_STEPS));
  const dur = breakSource ? breakSource.duration : 0;
  $('break-trim-start-val').textContent = `${(t.start * dur).toFixed(3)} s`;
  $('break-trim-end-val').textContent = `${(t.end * dur).toFixed(3)} s`;
  $('break-trim-reset').disabled = t.start <= 0 && t.end >= 1;
  drawTrimOverview();
}

let trimPeaks = { buffer: null, cols: 0, pk: null, max: 1 };
function drawTrimOverview() {
  const canvas = $('break-trim-view');
  if (!canvas.clientWidth) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight || 28;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(canvas);
  const ink = css.getPropertyValue('--ink').trim() || '#000';
  const mod = css.getPropertyValue('--mod').trim() || ink;
  g.fillStyle = css.getPropertyValue('--field').trim() || '#fff';
  g.fillRect(0, 0, w, h);
  if (!breakSource) return;
  const cols = Math.floor(w);
  if (trimPeaks.buffer !== breakSource || trimPeaks.cols !== cols) {
    const pk = peaks(breakSource.getChannelData(0), cols);
    let m = 0.001;
    for (const [lo, hi] of pk) m = Math.max(m, -lo, hi);
    trimPeaks = { buffer: breakSource, cols, pk, max: m };
  }
  const t = settings.breakTrim || { start: 0, end: 1 };
  const x0 = t.start * w;
  const x1 = t.end * w;
  const mid = h / 2;
  for (let x = 0; x < cols; x++) {
    const [lo, hi] = trimPeaks.pk[x];
    g.globalAlpha = x >= x0 && x <= x1 ? 1 : 0.25; // the cut-off parts are faint
    g.fillStyle = ink;
    g.fillRect(x, mid - (hi / trimPeaks.max) * (mid - 2), 1, Math.max(1, ((hi - lo) / trimPeaks.max) * (mid - 2)));
  }
  g.globalAlpha = 1;
  g.fillStyle = mod;
  g.fillRect(Math.round(x0), 0, 2, h);
  g.fillRect(Math.round(x1) - 2, 0, 2, h);
}

/** Set the trim from the controls; the cut itself is debounced while dragging. */
function setTrim(start, end) {
  const s = Math.min(Math.max(0, start), 1);
  const e = Math.min(Math.max(0, end), 1);
  settings.breakTrim = s <= e ? { start: s, end: e } : { start: e, end: s };
  if (settings.breakTrim.end - settings.breakTrim.start < 0.002) settings.breakTrim.end = Math.min(1, settings.breakTrim.start + 0.002);
  renderTrim();
  clearTimeout(trimTimer);
  trimTimer = setTimeout(() => { applyBreakTrim(); save(); }, 120);
}
$('break-trim-start').addEventListener('input', () => {
  setTrim(Number($('break-trim-start').value) / TRIM_STEPS, settings.breakTrim.end);
});
$('break-trim-end').addEventListener('input', () => {
  setTrim(settings.breakTrim.start, Number($('break-trim-end').value) / TRIM_STEPS);
});
// Drag on the overview: moves whichever edge is nearer.
{
  const view = $('break-trim-view');
  let edge = null;
  const at = (e) => {
    const r = view.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };
  view.addEventListener('pointerdown', (e) => {
    if (!breakSource) return;
    const x = at(e);
    const t = settings.breakTrim;
    edge = Math.abs(x - t.start) <= Math.abs(x - t.end) ? 'start' : 'end';
    view.setPointerCapture(e.pointerId);
    setTrim(edge === 'start' ? x : t.start, edge === 'end' ? x : t.end);
  });
  view.addEventListener('pointermove', (e) => {
    if (!edge) return;
    const x = at(e);
    setTrim(edge === 'start' ? x : settings.breakTrim.start, edge === 'end' ? x : settings.breakTrim.end);
  });
  const up = () => { edge = null; };
  view.addEventListener('pointerup', up);
  view.addEventListener('pointercancel', up);
}
$('break-trim-reset').addEventListener('click', () => setTrim(0, 1));

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

let breakPeaks = { buffer: null, cols: 0, pk: null, max: 1 };
function drawBreak() {
  const canvas = $('break-wave');
  if (!canvas.clientWidth) return; // folded or hidden: nothing to draw (redrawn when reopened)
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(200, canvas.clientWidth);
  const h = canvas.clientHeight || 96;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
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
  // Switched-off slices: hatched.
  for (const k of settings.breakOff || []) {
    if (k >= breakPoints.length) continue;
    const [x0, x1] = span(k);
    g.save();
    g.beginPath();
    g.rect(x0, 0, x1 - x0, h);
    g.clip();
    g.strokeStyle = ink;
    g.globalAlpha = 0.35;
    g.lineWidth = 1;
    for (let x = x0 - h; x < x1; x += 6) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + h, 0); g.stroke(); }
    g.restore();
  }
  g.fillStyle = ink;
  const cols = Math.floor(w);
  // Scanning the whole break is the slow part: do it once per break and width.
  if (breakPeaks.buffer !== breakBuffer || breakPeaks.cols !== cols) {
    const scanned = peaks(breakBuffer.getChannelData(0), cols);
    let m = 0.001;
    for (const [lo, hi] of scanned) m = Math.max(m, -lo, hi);
    breakPeaks = { buffer: breakBuffer, cols, pk: scanned, max: m };
  }
  const { pk, max } = breakPeaks;
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
  // Long patterns are shown in two columns, each half the steps under its own header.
  const half = Math.ceil(settings.breakSteps / 2);
  wrap.classList.toggle('two-col', settings.breakSteps > 16);
  wrap.style.setProperty('--trows', String(half + 1));
  const head = document.createElement('div');
  head.className = 'trow thead';
  head.innerHTML = '<span>Step</span><span>Slice</span><span>Vol</span><span>Pitch</span>'
    + '<span title="Chance: 0–100% that the step plays">C %</span>'
    + '<span title="Roll: retriggers per 16th step. 1 = 16ths, 2 = 32nds, 4 = 64ths (0 = off). With Roll until next it carries on through the empty rows.">R</span><span>Roll type</span><span>FX</span>';
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
    if (settings.breakSteps > 16 && i === half) wrap.append(head.cloneNode(true)); // the second column's header
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
  markOffRows();
}

/** Dim tracker rows whose slice is switched off. */
function markOffRows() {
  const off = settings.breakOff || [];
  breakRowEls.forEach((el, i) => {
    const s = settings.breakPattern[i]?.slice;
    el.classList.toggle('slice-off', s !== null && s !== undefined && off.includes(s));
  });
}

function editBreakRow(i, patch) {
  settings.breakPattern[i] = { ...settings.breakPattern[i], ...patch };
  settings.breakPatternAuto = false; // your edits stay put when the slicing changes
  const r = settings.breakPattern[i];
  const el = breakRowEls[i];
  el.classList.toggle('filled', r.slice !== null || r.fx === 'cut');
  el.classList.toggle('slice-off', r.slice !== null && (settings.breakOff || []).includes(r.slice));
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

function showBreakStep(step, slice, change = '') {
  if (step < 0) {
    for (const el of breakRowEls) { el.classList.remove('evolved'); delete el.dataset.ev; }
  } else if (breakRowEls[step]) {
    // Evolve's change to this row on this pass (it stays shown until the row comes round again).
    const el = breakRowEls[step];
    el.classList.toggle('evolved', !!change);
    if (change) el.dataset.ev = change;
    else delete el.dataset.ev;
  }
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
/** The slice under a pointer on the waveform. */
function sliceAtPointer(e) {
  const rect = $('break-wave').getBoundingClientRect();
  return sliceAt(((e.clientX - rect.left) / rect.width) * breakBuffer.duration, breakPoints);
}

/** Switch a slice off (or back on). Off slices don't play and Evolve/Randomize skip them. */
function toggleSliceOff(slice) {
  const off = new Set(settings.breakOff || []);
  if (off.has(slice)) off.delete(slice); else off.add(slice);
  settings.breakOff = [...off].sort((a, b) => a - b);
  markOffRows();
  drawBreak();
  save();
}

// Long press (for touch screens, where there's no Shift): the same as Shift-click.
let breakPress = null; // {timer, x, y, done}
$('break-wave').addEventListener('pointerdown', (e) => {
  if (!breakBuffer || e.button > 0) return;
  const slice = sliceAtPointer(e);
  breakPress = { x: e.clientX, y: e.clientY, done: false };
  breakPress.timer = setTimeout(() => {
    breakPress.done = true; // the click that follows mustn't also write the slice
    toggleSliceOff(slice);
    navigator.vibrate?.(15);
  }, 500);
});
$('break-wave').addEventListener('pointermove', (e) => {
  if (breakPress && !breakPress.done && Math.hypot(e.clientX - breakPress.x, e.clientY - breakPress.y) > 10) {
    clearTimeout(breakPress.timer); // moving (e.g. scrolling): not a press
    breakPress = null;
  }
});
for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
  $('break-wave').addEventListener(type, () => { if (breakPress && !breakPress.done) { clearTimeout(breakPress.timer); breakPress = null; } });
}
$('break-wave').addEventListener('contextmenu', (e) => e.preventDefault());

$('break-wave').addEventListener('click', (e) => {
  if (!breakBuffer) return;
  if (breakPress?.done) { breakPress = null; return; } // that was a long press
  breakPress = null;
  const slice = sliceAtPointer(e);
  if (e.shiftKey) {
    toggleSliceOff(slice);
    return;
  }
  ensureAudio();
  breakPlayer?.trigger(ctx.currentTime + 0.01, {
    offset: breakPoints[slice],
    duration: (slice + 1 < breakPoints.length ? breakPoints[slice + 1] : breakBuffer.duration) - breakPoints[slice],
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
  // An in-order pattern needs room for the whole break: lengthen it (never shorten) if needed.
  const want = settings.breakBars * 16;
  if (settings.breakPatternAuto && settings.breakSteps < want) {
    settings.breakSteps = BREAK_STEPS.find((n) => n >= want) || BREAK_STEPS[BREAK_STEPS.length - 1];
    $('break-steps').value = String(settings.breakSteps);
  }
  if (settings.breakPatternAuto) { settings.breakPattern = orderedPattern(); buildBreakRows(); }
  updateBreakStatus();
});
$('break-fit').checked = settings.breakFit;
$('break-fit').addEventListener('change', () => { settings.breakFit = $('break-fit').checked; save(); });
$('break-roll-hold').checked = settings.breakRollHold;
$('break-roll-hold').addEventListener('change', () => { settings.breakRollHold = $('break-roll-hold').checked; save(); });
onRecall(() => { $('break-roll-hold').checked = settings.breakRollHold; });
bindRange('break-pitch', 'breakPitch', (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} st`);
bindRange('break-level', 'breakLevel', (v) => `${v}%`, (v) => breakPlayer?.setLevel(v / 100));
bindRange('break-evolve', 'breakEvolve', (v) => (v ? `${v}%` : 'off'));
document.querySelectorAll('[data-gen]').forEach((b) => b.addEventListener('click', () => {
  const steps = settings.breakSteps;
  settings.breakPattern = {
    order: () => orderedPattern(),
    chop: () => chop(orderedPattern()),
    random: () => randomize(steps, (settings.breakOff || []).length ? usableSlices(sliceCount(), settings.breakOff) : sliceCount()),
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
window.addEventListener('resize', () => { drawBreak(); drawTrimOverview(); });

$('break-sensitivity').disabled = settings.breakSliceMode !== 'transient';
$('break-slices').disabled = settings.breakSliceMode === 'transient';
buildBreakRows();
renderBreakPanel();
onRecall(() => {
  $('break-fit').checked = settings.breakFit;
  $('break-sensitivity').disabled = settings.breakSliceMode !== 'transient';
  $('break-slices').disabled = settings.breakSliceMode === 'transient';
  if (breakSource) applyBreakTrim();
  else buildBreakRows();
  renderBreakPanel();
});
// Your saved break, decoded without needing an audio context yet; else the demo.
loadBreak().then(async (stored) => {
  if (stored?.data) {
    try {
      const buffer = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(stored.data.slice(0));
      setBreak(buffer, stored.name, { keepTrim: true });
      return;
    } catch { /* fall back to the demo */ }
  }
  setBreak(await renderDemoBreak(), 'Demo break (synthesized)');
});

// ---------------------------------------------------------------- UI: song mode & slots
// Break slots: the edited slot is settings.breakPattern; the others wait in breakSlots.
const breakSlotCache = {};
function breakPatternFor(slot) {
  if (!slot || slot === settings.breakSlot || !settings.breakSlots[slot]) return settings.breakPattern;
  const stored = settings.breakSlots[slot];
  const c = breakSlotCache[slot];
  if (c && c.src === stored && c.steps === settings.breakSteps) return c.rows;
  const rows = resizePattern(stored, settings.breakSteps);
  breakSlotCache[slot] = { src: stored, steps: settings.breakSteps, rows };
  return rows;
}

function selectBreakSlot(slot) {
  if (slot === settings.breakSlot) return;
  settings.breakSlots[settings.breakSlot] = structuredClone(settings.breakPattern);
  const next = settings.breakSlots[slot] ? structuredClone(settings.breakSlots[slot]) : structuredClone(settings.breakPattern);
  delete settings.breakSlots[slot];
  settings.breakSlot = slot;
  settings.breakPattern = resizePattern(next, settings.breakSteps);
  settings.breakPatternAuto = false;
  buildBreakRows();
  renderSlotButtons();
  save();
}

function copySlot(kind, to) {
  if (!to) return;
  if (kind === 'drum') {
    if (to === settings.drumSlot) return;
    settings.drumSlots[to] = structuredClone(currentDrumState());
  } else {
    if (to === settings.breakSlot) return;
    settings.breakSlots[to] = structuredClone(settings.breakPattern);
  }
  renderSlotButtons();
  save();
}

let songNowBar = -1;
function renderSlotButtons() {
  const playingSlot = settings.songOn && songNowBar >= 0 ? settings.songChain[songNowBar % settings.songChain.length] : null;
  for (const [kind, current, stored] of [['drum', settings.drumSlot, settings.drumSlots], ['break', settings.breakSlot, settings.breakSlots]]) {
    $(`${kind}-slots`).querySelectorAll('button').forEach((b) => {
      const s = b.dataset.slot;
      b.setAttribute('aria-pressed', String(s === current));
      b.classList.toggle('used', s === current || !!stored[s]);
      b.classList.toggle('playing', s === playingSlot);
    });
  }
}

function renderSong() {
  $('song-on').setAttribute('aria-pressed', String(settings.songOn));
  $('song-on').textContent = settings.songOn ? 'On' : 'Off';
  $('song-panel').classList.toggle('off', !settings.songOn);
  const wrap = $('song-chain');
  wrap.replaceChildren();
  settings.songChain.forEach((slot, i) => {
    const chip = document.createElement('span');
    chip.className = 'song-bar';
    const b = document.createElement('button');
    b.textContent = slot;
    b.title = `Bar ${i + 1}: click to change the slot`;
    b.addEventListener('click', () => {
      settings.songChain[i] = SLOTS[(SLOTS.indexOf(slot) + 1) % SLOTS.length];
      renderSong();
      save();
    });
    const x = document.createElement('button');
    x.className = 'song-x';
    x.textContent = '×';
    x.title = `Remove bar ${i + 1}`;
    x.addEventListener('click', () => {
      settings.songChain.splice(i, 1);
      renderSong();
      save();
    });
    const n = document.createElement('small');
    n.textContent = String(i + 1);
    chip.append(n, b, x);
    wrap.append(chip);
  });
  if (!settings.songChain.length) wrap.textContent = 'Empty: add bars below.';
  showSongBar(songNowBar);
}

function showSongBar(bar) {
  songNowBar = bar;
  const len = settings.songChain.length;
  $('song-chain').querySelectorAll('.song-bar').forEach((el, i) => {
    el.classList.toggle('now', bar >= 0 && len > 0 && i === bar % len);
  });
  $('song-pos').textContent = bar >= 0 && len ? `bar ${(bar % len) + 1} of ${len}` : '';
  renderSlotButtons();
}

onRecall(repairSong)();
function repairSong() {
  if (!SLOTS.includes(settings.breakSlot)) settings.breakSlot = 'A';
  if (!settings.breakSlots || typeof settings.breakSlots !== 'object') settings.breakSlots = {};
  for (const k of Object.keys(breakSlotCache)) delete breakSlotCache[k];
  if (!Array.isArray(settings.songChain)) settings.songChain = ['A', 'A', 'B', 'A'];
  settings.songChain = settings.songChain.filter((s) => SLOTS.includes(s));
}

for (const kind of ['drum', 'break']) {
  for (const s of SLOTS) {
    const b = document.createElement('button');
    b.textContent = s;
    b.dataset.slot = s;
    b.title = `Edit pattern ${s} (a new slot starts as a copy of the current one)`;
    b.addEventListener('click', () => (kind === 'drum' ? selectDrumSlot(s) : selectBreakSlot(s)));
    $(`${kind}-slots`).append(b);
  }
  const copy = $(`${kind}-copy`);
  for (const s of SLOTS) copy.add(new Option(`Copy to ${s}`, s));
  copy.addEventListener('change', () => { copySlot(kind, copy.value); copy.value = ''; });
}
$('song-on').addEventListener('click', () => {
  settings.songOn = !settings.songOn;
  if (settings.songOn && !playing && settings.sync === 'internal' && (settings.drumOn || settings.breakOn)) setPlaying(true);
  renderSong();
  save();
});
document.querySelectorAll('[data-add-bar]').forEach((b) => b.addEventListener('click', () => {
  settings.songChain.push(b.dataset.addBar);
  renderSong();
  save();
}));
$('song-clear').addEventListener('click', () => { settings.songChain = []; renderSong(); save(); });
onRecall(() => { renderSong(); renderSlotButtons(); })();

// ---------------------------------------------------------------- UI: mono synth (101-style)
let monoSynth = null;
let monoCursor = 0; // where the next written step goes
let monoKeyTranspose = 0; // live transpose from held keys (Keys transpose)
let monoMidiNote = null; // the note last sent to MIDI out
let monoGateOpen = false; // is a mono note sounding (so legato has something to slide from)?
let monoNowStep = -1;
const monoStepEls = [];

// Settings key → MonoSynth parameter (and how to convert the stored value).
const MONO_PARAMS = [
  ['monoSaw', 'saw', (v) => v / 100], ['monoPulse', 'pulse', (v) => v / 100], ['monoSub', 'sub', (v) => v / 100],
  ['monoNoise', 'noise', (v) => v / 100], ['monoSubMode', 'subMode'], ['monoWidth', 'width'], ['monoPwm', 'pwm'],
  ['monoCutoff', 'cutoff'], ['monoRes', 'resonance'], ['monoEnv', 'envAmount', (v) => v / 100],
  ['monoKeyFollow', 'keyFollow', (v) => v / 100], ['monoAttack', 'attack', (v) => v / 1000],
  ['monoDecay', 'decay', (v) => v / 1000], ['monoSustain', 'sustain', (v) => v / 100],
  ['monoRelease', 'release', (v) => v / 1000], ['monoVca', 'vcaGate', (v) => v === 'gate'],
  ['monoLfoRate', 'lfoRate'], ['monoVibrato', 'vibrato', (v) => v / 100], ['monoLfoFilter', 'lfoFilter', (v) => v / 100],
  ['monoPorta', 'porta'], ['monoGlide', 'glide', (v) => v / 1000], ['monoLevel', 'level', (v) => v / 100],
];
const MONO_DEFAULTS = {
  monoSaw: 70, monoPulse: 0, monoSub: 60, monoNoise: 0, monoSubMode: 'sq1', monoWidth: 50, monoPwm: 0,
  monoCutoff: 600, monoRes: 8, monoEnv: 55, monoKeyFollow: 50, monoAttack: 3, monoDecay: 250, monoSustain: 20,
  monoRelease: 80, monoVca: 'env', monoLfoRate: 5, monoVibrato: 0, monoLfoFilter: 0, monoPorta: 'auto',
  monoGlide: 70, monoLevel: 55,
};
for (const [k, v] of Object.entries(MONO_DEFAULTS)) if (settings[k] === undefined) settings[k] = v;

function monoParams() {
  const p = Object.fromEntries(MONO_PARAMS.map(([key, name, conv]) => [name, conv ? conv(settings[key]) : settings[key]]));
  if (pure()) p.vibrato = 0; // Pure tuning: a steady pitch
  return p;
}
function applyMono() { monoSynth?.set(monoParams()); }

// A starting line in C minor: legato slides, a tie and rests.
const DEMO_MONO = [
  noteStep(36), noteStep(48, true), noteStep(36), restStep(), noteStep(39), holdStep(), noteStep(41, true), noteStep(43),
  noteStep(36), noteStep(48), restStep(), noteStep(46, true), noteStep(43), holdStep(), noteStep(39), noteStep(41),
];
onRecall(repairMono)();
function repairMono() {
  if (!Array.isArray(settings.monoSeq)) settings.monoSeq = DEMO_MONO.map((s) => ({ ...s }));
  settings.monoSeq = settings.monoSeq
    .filter((s) => s && (s.n === null || (Number.isInteger(s.n) && s.n >= 0 && s.n < 128)))
    .slice(0, MAX_MONO_STEPS)
    .map((s) => ({ n: s.n, t: !!s.t }));
  monoCursor = settings.monoSeq.length;
}

/** Close the mono voice's gate now (sequence cleared, Mono switched off): no drone, no stuck MIDI note. */
function monoAllOff() {
  if (ctx) monoSynth?.noteOff(ctx.currentTime);
  if (monoMidiNote !== null && settings.monoMidiCh >= 0) midi.noteOff(monoMidiNote, undefined, settings.monoMidiCh);
  monoMidiNote = null;
  monoGateOpen = false;
}

function playMonoStep(step) {
  const seq = settings.monoSeq;
  if (!seq.length) return;
  const idx = step.stepNumber % seq.length;
  const act = stepAction(seq, idx);
  // The progression's modulation carries the mono line into the new key too (Modulate all).
  const shift = settings.monoTranspose + monoKeyTranspose + (settings.progModAll ? progShift : 0);
  const t = step.time;
  const off = t + step.duration * Math.min(settings.monoGate / 100, 0.98);
  const midiOn = (n) => {
    if (settings.monoMidiCh < 0) return;
    midi.noteOn(n, 100, toPerfMs(t), settings.monoMidiCh);
  };
  const midiOff = (n, at) => {
    if (settings.monoMidiCh < 0 || n === null) return;
    midi.noteOff(n, toPerfMs(at), settings.monoMidiCh);
  };
  if (act.type === 'rest') {
    if (monoSynth && settings.synthOn) monoSynth.noteOff(t);
    midiOff(monoMidiNote, t);
    monoMidiNote = null;
    monoGateOpen = false;
  } else if (act.type === 'note' || act.type === 'legato') {
    const n = Math.max(0, Math.min(127, act.note + shift));
    // A legato step with nothing sounding (first pass after Play, or Mono just
    // switched on) has no note to slide from: strike it as a new note.
    const legato = act.type === 'legato' && monoGateOpen;
    if (monoSynth && settings.synthOn) monoSynth.noteOn(tuned(n), t, { legato });
    monoRoot = chordRoot(); // what the note was tuned to (see retuneMono)
    // MIDI: legato overlaps the old note so a mono synth slides; a new note releases first.
    if (!legato) midiOff(monoMidiNote, t);
    midiOn(n);
    if (legato) midiOff(monoMidiNote, t + 0.002);
    monoMidiNote = n;
    monoGateOpen = true;
  }
  if (act.release && monoGateOpen) {
    if (monoSynth && settings.synthOn) monoSynth.noteOff(off);
    midiOff(monoMidiNote, off);
    monoMidiNote = null;
    monoGateOpen = false;
  }
  uiEvents.push({ kind: 'mono', time: t, step: idx });
}

let monoRoot = null; // the chord root the sounding mono note is tuned to

/** Just intonation: a mono note held across a chord change glides to its tuning in the new chord. */
function retuneMono(time) {
  if (!monoGateOpen || monoMidiNote === null || !monoSynth || !settings.synthOn) return;
  const root = chordRoot();
  if (root === monoRoot) return;
  monoRoot = root;
  monoSynth.retune(tuned(monoMidiNote, root), time, 0.03);
}

/** A key while Write is armed: write it into the sequence (and hear it). */
function monoWrite(note) {
  const r = writeStep(settings.monoSeq, monoCursor, noteStep(note, settings.monoLegato));
  settings.monoSeq = r.seq;
  monoCursor = r.cursor;
  if (monoSynth && !playing) {
    monoSynth.noteOn(note, ctx.currentTime + 0.005);
    monoSynth.noteOff(ctx.currentTime + 0.25);
  }
  renderMonoSteps();
  save();
}

function monoEdit(step) {
  const r = writeStep(settings.monoSeq, monoCursor, step);
  settings.monoSeq = r.seq;
  monoCursor = r.cursor;
  renderMonoSteps();
  save();
}

function renderMonoSteps() {
  const wrap = $('mono-steps');
  wrap.replaceChildren();
  monoStepEls.length = 0;
  settings.monoSeq.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = `mono-step${s.n === null ? (s.t ? ' hold' : ' rest') : ''}${s.n !== null && s.t ? ' legato' : ''}`;
    b.textContent = stepLabel(s, noteName);
    b.title = `Step ${i + 1}${s.n !== null && s.t ? ' (legato)' : ''}: click to write from here`;
    b.addEventListener('click', () => { monoCursor = i; renderMonoSteps(); });
    if (i === monoCursor) b.classList.add('cursor');
    wrap.append(b);
    monoStepEls.push(b);
  });
  const end = document.createElement('span');
  end.className = `mono-end${monoCursor >= settings.monoSeq.length ? ' cursor' : ''}`;
  end.textContent = settings.monoSeq.length < MAX_MONO_STEPS ? '+' : 'full';
  end.title = 'Writing here adds a step';
  end.addEventListener('click', () => { monoCursor = settings.monoSeq.length; renderMonoSteps(); });
  wrap.append(end);
  $('mono-status').textContent = `${settings.monoSeq.length} step${settings.monoSeq.length === 1 ? '' : 's'} · writing at step ${Math.min(monoCursor, MAX_MONO_STEPS - 1) + 1}`;
  showMonoStep(monoNowStep);
}

function showMonoStep(i) {
  monoStepEls.forEach((el) => el.classList.remove('now'));
  monoNowStep = i;
  if (i >= 0) monoStepEls[i]?.classList.add('now');
  // Light the little keyboard's key for the note now sounding (ties keep the last one).
  if (i < 0) { monoKbShow(null); return; }
  const step = settings.monoSeq[i];
  if (step && step.n !== null && !step.hold) monoKbShow(step.n);
  else if (step && step.n === null && !step.t) monoKbShow(null);
}

// ---- the little keyboard: two octaves for writing the mono sequence directly.
const monoKbKeys = new Map();
let monoKbLit = null;

function buildMonoKb() {
  const kb = $('mono-kb');
  kb.replaceChildren();
  monoKbKeys.clear();
  const base = (settings.monoKbOctave + 1) * 12;
  const span = 25; // C to C, two octaves
  const isBlack = (n) => [1, 3, 6, 8, 10].includes(n % 12);
  const whites = [];
  for (let n = base; n < base + span; n++) if (!isBlack(n)) whites.push(n);
  const whiteW = 100 / whites.length;
  for (let n = base; n < base + span; n++) {
    const k = document.createElement('div');
    k.className = `key${isBlack(n) ? ' black' : ''}`;
    k.dataset.note = n;
    k.title = noteName(n);
    if (isBlack(n)) {
      const leftWhites = whites.filter((w) => w < n).length;
      k.style.left = `calc(${leftWhites * whiteW}% - ${whiteW * 0.3}%)`;
      k.style.width = `${whiteW * 0.6}%`;
    } else if (n % 12 === 0) {
      k.dataset.label = noteName(n); // C labels to find your place
    }
    kb.append(k);
    monoKbKeys.set(n, k);
  }
  $('mono-kb-oct').textContent = `${noteName(base)}–${noteName(base + span - 1)}`;
  monoKbLit = null;
}

function monoKbShow(note) {
  if (monoKbLit === note) return;
  if (monoKbLit !== null) monoKbKeys.get(monoKbLit)?.classList.remove('sounding');
  monoKbLit = note;
  if (note !== null) monoKbKeys.get(note)?.classList.add('sounding');
}

$('mono-kb').addEventListener('pointerdown', (e) => {
  const key = e.target.closest('.key');
  if (!key) return;
  e.preventDefault();
  ensureAudio();
  monoWrite(Number(key.dataset.note));
  key.classList.add('held');
  setTimeout(() => key.classList.remove('held'), 150);
});
$('mono-kb').addEventListener('contextmenu', (e) => e.preventDefault());
for (const [id, d] of [['mono-kb-down', -1], ['mono-kb-up', 1]]) {
  $(id).addEventListener('click', () => {
    settings.monoKbOctave = Math.min(6, Math.max(0, settings.monoKbOctave + d));
    buildMonoKb();
    save();
  });
}
buildMonoKb();

function renderMonoPanel() {
  for (const [id, on] of [['mono-on', settings.monoOn], ['mono-write', settings.monoArmed], ['mono-legato', settings.monoLegato]]) {
    $(id).setAttribute('aria-pressed', String(on));
  }
  $('mono-on').textContent = settings.monoOn ? 'On' : 'Off';
  $('mono-panel').classList.toggle('off', !settings.monoOn);
  $('mono-panel').classList.toggle('armed', settings.monoArmed);
}

for (const [k, v] of Object.entries({ monoOn: false, monoArmed: false, monoLegato: false, monoRate: '1/16', monoGate: 70, monoTranspose: 0, monoKeys: false, monoMidiCh: -1 })) {
  if (settings[k] === undefined) settings[k] = v;
}
settings.monoArmed = false; // never start armed: keys would go to the sequence unexpectedly

$('mono-on').addEventListener('click', () => {
  settings.monoOn = !settings.monoOn;
  if (settings.monoOn) {
    ensureAudio();
    if (!playing && settings.sync === 'internal') setPlaying(true);
  } else {
    monoAllOff();
    showMonoStep(-1);
  }
  renderMonoPanel();
  save();
});
$('mono-write').addEventListener('click', () => {
  settings.monoArmed = !settings.monoArmed;
  if (settings.monoArmed) ensureAudio();
  renderMonoPanel();
});
$('mono-legato').addEventListener('click', () => { settings.monoLegato = !settings.monoLegato; renderMonoPanel(); save(); });
$('mono-rest').addEventListener('click', () => monoEdit(restStep()));
$('mono-tie').addEventListener('click', () => monoEdit(holdStep()));
$('mono-back').addEventListener('click', () => {
  const r = backStep(settings.monoSeq, monoCursor);
  settings.monoSeq = r.seq;
  monoCursor = r.cursor;
  renderMonoSteps();
  save();
});
confirmClick($('mono-clear'), () => {
  settings.monoSeq = [];
  monoAllOff();
  monoCursor = 0;
  renderMonoSteps();
  save();
}, { ask: 'Sure? Clear', needed: () => settings.monoSeq.length > 0 });
$('mono-demo').addEventListener('click', () => {
  settings.monoSeq = DEMO_MONO.map((s) => ({ ...s }));
  monoCursor = settings.monoSeq.length;
  renderMonoSteps();
  save();
});

bindSelect('mono-rate', 'monoRate', Object.keys(RATES).map((r) => [r, r]));
bindRange('mono-gate', 'monoGate', (v) => `${v}%`);
for (let t = -24; t <= 24; t++) $('mono-transpose').add(new Option(`${t > 0 ? '+' : ''}${t}`, String(t)));
bindSelect('mono-transpose', 'monoTranspose');
$('mono-keys').checked = settings.monoKeys;
$('mono-keys').addEventListener('change', () => {
  settings.monoKeys = $('mono-keys').checked;
  if (!settings.monoKeys) monoKeyTranspose = 0;
  save();
});
for (let c = 1; c <= 16; c++) $('mono-midi-ch').add(new Option(String(c), String(c - 1)));
bindSelect('mono-midi-ch', 'monoMidiCh', null, () => midi.allNotesOff());

const pct = (v) => `${v}%`;
const ms = (v) => (v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(2)} s`);
bindRange('mono-saw', 'monoSaw', pct, applyMono);
bindRange('mono-pulse', 'monoPulse', pct, applyMono);
bindRange('mono-sub', 'monoSub', pct, applyMono);
bindSelect('mono-sub-mode', 'monoSubMode', Object.entries(SUB_MODES), applyMono);
bindRange('mono-noise', 'monoNoise', pct, applyMono);
bindRange('mono-width', 'monoWidth', pct, applyMono);
bindRange('mono-pwm', 'monoPwm', pct, applyMono);
bindCutoff('mono-cutoff', 'monoCutoff', applyMono);
bindRange('mono-res', 'monoRes', (v) => v.toFixed(1), applyMono);
bindRange('mono-env', 'monoEnv', pct, applyMono);
bindRange('mono-keyfollow', 'monoKeyFollow', pct, applyMono);
bindLog('mono-attack', 'monoAttack', 1, 2000, ms, applyMono);
bindLog('mono-decay', 'monoDecay', 10, 3000, ms, applyMono);
bindRange('mono-sustain', 'monoSustain', pct, applyMono);
bindLog('mono-release', 'monoRelease', 5, 3000, ms, applyMono);
bindSelect('mono-vca', 'monoVca', [['env', 'Env'], ['gate', 'Gate']], applyMono);
bindRange('mono-lfo-rate', 'monoLfoRate', (v) => `${v.toFixed(1)} Hz`, applyMono);
bindRange('mono-vibrato', 'monoVibrato', pct, applyMono);
bindRange('mono-lfo-filter', 'monoLfoFilter', pct, applyMono);
bindSelect('mono-porta', 'monoPorta', Object.entries(PORTA_MODES), applyMono);
bindLog('mono-glide', 'monoGlide', 10, 1000, ms, applyMono);
bindRange('mono-level', 'monoLevel', pct, applyMono);

renderMonoPanel();
renderMonoSteps();
onRecall(() => {
  $('mono-keys').checked = settings.monoKeys;
  if (!settings.monoKeys) monoKeyTranspose = 0;
  if (!settings.monoOn) monoAllOff();
  applyMono();
  renderMonoPanel();
  renderMonoSteps();
});

// ---------------------------------------------------------------- MIDI Learn
// Click MIDI Learn, click a control, move a knob or fader: that CC now drives it.
// Controls are found by id, or by their aria-label (sliders built in code).
let learning = false;
let learnArmed = null; // the control waiting for a CC
if (!settings.midiMap || typeof settings.midiMap !== 'object') settings.midiMap = {};

const LEARNABLE = 'main input[type="range"], main input[type="checkbox"], main select, main button[aria-pressed], .dock input, .dock button';
function controlKey(el) {
  if (el.id) return `#${el.id}`;
  const label = el.getAttribute('aria-label');
  return label ? `@${label}` : null;
}
function controlFor(key) {
  if (key.startsWith('#')) return document.getElementById(key.slice(1));
  return document.querySelector(`[aria-label="${CSS.escape(key.slice(1))}"]`);
}
/** A control's name for people: its aria-label, its label's own words, its panel's title for On/Off. */
function controlName(el) {
  const own = el.getAttribute('aria-label');
  if (own) return own;
  const label = el.closest('label');
  const words = label ? [...label.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim() : '';
  if (words) return words;
  const panel = el.closest('.panel')?.querySelector('h2')?.textContent;
  return panel ? `${panel} ${el.textContent.trim()}` : el.id;
}

/** The mapping (ch:cc) for a control, if any. */
const mappingOf = (key) => Object.keys(settings.midiMap).find((k) => settings.midiMap[k] === key) || null;

function renderLearn() {
  document.body.classList.toggle('midi-learn', learning);
  $('midi-learn').setAttribute('aria-pressed', String(learning));
  $('learn-bar').hidden = !learning;
  document.querySelectorAll('.cc-mapped, .cc-armed').forEach((el) => {
    el.classList.remove('cc-mapped', 'cc-armed');
    delete el.dataset.cc;
  });
  for (const [cc, key] of Object.entries(settings.midiMap)) {
    const el = controlFor(key);
    if (!el) continue;
    el.classList.add('cc-mapped');
    const [ch, n] = cc.split(':');
    el.dataset.cc = `CC ${n} · ch ${Number(ch) + 1}`;
    if (!el.title.includes('MIDI: ')) el.title = `${el.title ? `${el.title} · ` : ''}MIDI: ${el.dataset.cc}`;
  }
  learnArmed?.classList.add('cc-armed');
  const n = Object.keys(settings.midiMap).length;
  $('learn-msg').textContent = learnArmed
    ? `Now move a knob, fader or button on your controller for "${controlName(learnArmed)}". Click it again to clear its mapping.`
    : `Click a control, then move a knob, fader or button. ${n} mapped.`;
}

function setLearning(on) {
  learning = on;
  learnArmed = null;
  renderLearn();
}

// While learning, clicking a control arms it instead of using it.
for (const type of ['pointerdown', 'click', 'mousedown']) {
  document.addEventListener(type, (e) => {
    if (!learning) return;
    const el = e.target.closest(LEARNABLE);
    if (!el || el.id === 'midi-learn' || el.closest('#learn-bar')) return;
    e.preventDefault();
    e.stopPropagation();
    if (type !== 'click') return;
    const key = controlKey(el);
    if (!key) return;
    if (learnArmed === el) {
      // Second click: forget this control's mapping.
      const cc = mappingOf(key);
      if (cc) delete settings.midiMap[cc];
      learnArmed = null;
      save();
    } else learnArmed = el;
    renderLearn();
  }, true);
}
document.addEventListener('keydown', (e) => { if (learning && e.key === 'Escape') setLearning(false); }, true);
$('midi-learn').addEventListener('click', () => setLearning(!learning));
$('learn-done').addEventListener('click', () => setLearning(false));
confirmClick($('learn-clear'), () => {
  settings.midiMap = {};
  learnArmed = null;
  save();
  renderLearn();
}, { ask: 'Sure? Clear all', needed: () => Object.keys(settings.midiMap).length > 0 });

const ccLast = new Map(); // for buttons: only the press (crossing 64) counts

/** A control change: learn it, or move whatever it's mapped to. True if it was used. */
function handleCc(ch, cc, value) {
  const id = `${ch}:${cc}`;
  if (learning && learnArmed) {
    const key = controlKey(learnArmed);
    for (const k of Object.keys(settings.midiMap)) if (settings.midiMap[k] === key) delete settings.midiMap[k]; // one CC per control
    settings.midiMap[id] = key;
    learnArmed = null;
    save();
    renderLearn();
    return true;
  }
  const key = settings.midiMap[id];
  if (!key) return false;
  const el = controlFor(key);
  if (!el || el.disabled) return true;
  const was = ccLast.get(id) ?? 0;
  ccLast.set(id, value);
  const x = value / 127;
  if (el.type === 'range') {
    const min = Number(el.min || 0);
    const max = Number(el.max || 100);
    const step = Number(el.step) || 1;
    const v = Math.round((min + x * (max - min)) / step) * step;
    if (Number(el.value) === v) return true;
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el.tagName === 'SELECT') {
    const options = [...el.options].filter((o) => !o.disabled && !o.hidden);
    const pick = options[Math.min(options.length - 1, Math.round(x * (options.length - 1)))];
    if (!pick || pick.value === el.value) return true;
    el.value = pick.value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el.type === 'checkbox') {
    if (el.checked === value >= 64) return true;
    el.checked = value >= 64;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el.hasAttribute('aria-pressed') && el.closest('.seg, .len') === null && /^(On|Off)$/.test(el.textContent.trim())) {
    // On/Off switches follow the CC: on at 64 and up.
    if ((el.getAttribute('aria-pressed') === 'true') !== value >= 64) el.click();
  } else if (value >= 64 && was < 64) {
    el.click(); // any other button: a press
  }
  return true;
}
renderLearn();

// ---------------------------------------------------------------- score player
// MIDI files you load, kept in this browser; the chosen one plays part by part through
// the synths, locked to the clock (24 pulses per quarter, mapped from the file's ticks).
const scoreFiles = {}; // id -> {name, data}
let score = null; // the parsed chosen piece: {ppq, tempo, parts, length, id}
let scoreStart = null; // clock pulse the piece started on
const scoreSounding = []; // {n, end}: score notes sounding now (for just intonation)
const SCORE_VOICES = [['arp', 'Arp voice'], ['chord', 'Chord synth'], ['mono', 'Mono synth'], ['off', 'Off']];

function scoreVoices() {
  if (!score) return [];
  const saved = settings.scoreVoices[score.id] || [];
  // First part on the arp voice, second on the mono synth, any more on the chord synth.
  return score.parts.map((_, i) => saved[i] || (i === 0 ? 'arp' : i === 1 ? 'mono' : 'chord'));
}

function chooseScore(id) {
  settings.scoreId = id;
  score = null;
  const file = scoreFiles[id];
  if (file) {
    try {
      const parsed = parseMidi(file.data);
      score = { ...parsed, id, length: scoreLength(parsed) };
      // Monophonic voices play each note until the next starts (no overlaps cutting it off).
      score.monoParts = score.parts.map((p) => monoLengths(p.notes));
    } catch (err) {
      $('score-status').textContent = `Couldn't read ${file.name}: ${err.message}`;
    }
  }
  scoreStart = null;
  renderScore();
  save();
}

function renderScore() {
  $('score-on').setAttribute('aria-pressed', String(settings.scoreOn));
  $('score-on').textContent = settings.scoreOn ? 'On' : 'Off';
  $('score-panel').classList.toggle('off', !settings.scoreOn);
  const pick = $('score-pick');
  pick.replaceChildren();
  const ids = Object.keys(scoreFiles).sort((a, b) => scoreFiles[a].name.localeCompare(scoreFiles[b].name));
  if (!ids.length) pick.add(new Option('— load a MIDI file —', ''));
  for (const id of ids) pick.add(new Option(scoreFiles[id].name.replace(/\.midi?$/i, ''), id));
  pick.value = score ? score.id : '';
  $('score-remove').disabled = !score;
  $('score-clear').disabled = !ids.length;
  $('score-tempo').disabled = !score;
  const wrap = $('score-parts');
  wrap.replaceChildren();
  if (!score) {
    $('score-status').textContent = ids.length ? '' : 'No pieces yet.';
    return;
  }
  const voices = scoreVoices();
  score.parts.forEach((part, i) => {
    const row = document.createElement('label');
    row.className = 'score-part';
    const name = document.createElement('span');
    name.className = 'part-name';
    name.textContent = part.name;
    const lo = Math.min(...part.notes.map((n) => n.n));
    const hi = Math.max(...part.notes.map((n) => n.n));
    const info = document.createElement('span');
    info.className = 'part-info';
    info.textContent = `${part.notes.length} notes · ${noteName(lo)}–${noteName(hi)}`;
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', `Synth for ${part.name}`);
    for (const [v, l] of SCORE_VOICES) sel.add(new Option(l, v));
    sel.value = voices[i];
    sel.addEventListener('change', () => {
      settings.scoreVoices[score.id] = scoreVoices().map((v, k) => (k === i ? sel.value : v));
      save();
    });
    row.append(name, sel, info);
    wrap.append(row);
  });
  const bars = score.length / (score.ppq * 4);
  const order = pieceIds();
  const where = order.length > 1 ? `${order.indexOf(score.id) + 1} of ${order.length} · ` : '';
  $('score-status').textContent = `${where}${score.parts.length} part${score.parts.length === 1 ? '' : 's'} · ${bars} bar${bars === 1 ? '' : 's'} · written at ${tempoBpm(score.tempo)} BPM`;
}

/** Schedule the score's notes that start within this clock pulse. */
function playScorePulse(time, pulse, pulseDuration) {
  if (!score) return;
  // A piece starts on the next bar line (or straight away at the very start).
  if (scoreStart === null) scoreStart = pulse === 0 ? 0 : Math.ceil(pulse / (PPQN * 4)) * PPQN * 4;
  const p = pulse - scoreStart;
  if (p < 0) return;
  const speed = settings.scoreSpeed || 1;
  const tpp = (score.ppq / PPQN) * speed; // file ticks per clock pulse
  let from = p * tpp;
  if (from >= score.length) {
    const mode = scoreMode();
    if (mode === 'loop') from %= score.length;
    else if (mode === 'list' || mode === 'shuffle') {
      // Playlist: on to the next piece, from the next bar line (pieces end on one).
      const next = nextPieceId(mode === 'shuffle');
      if (!next) return;
      chooseScore(next);
      return playScorePulse(time, pulse, pulseDuration);
    } else return;
  }
  const to = from + tpp;
  const secPerTick = pulseDuration / tpp;
  while (scoreSounding.length && scoreSounding[0].end <= time) scoreSounding.shift();
  const voices = scoreVoices();
  const starting = [];
  score.parts.forEach((part, i) => {
    const voice = voices[i];
    if (voice === 'off') return;
    const notes = voice === 'chord' ? part.notes : score.monoParts[i];
    for (let k = firstAtOrAfter(notes, from); k < notes.length && notes[k].t < to; k++) {
      const n = notes[k];
      const note = Math.max(0, Math.min(127, n.n + settings.scoreTranspose));
      starting.push({ voice, part: i, note, at: time + (n.t - from) * secPerTick, dur: n.d * secPerTick, vel: n.v });
    }
  });
  if (!starting.length) return;
  // Everything sounding together tunes together (both hands of an invention).
  for (const s of starting) scoreSounding.push({ n: s.note, end: s.at + s.dur });
  scoreSounding.sort((a, b) => a.end - b.end);
  if (!settings.synthOn || !synth) return;
  for (const s of starting) playScoreNote(s);
}

function playScoreNote({ voice, part, note, at, dur, vel }) {
  const velocity = humanLevel(vel);
  const t = settings.humanize > 0 ? at + humanizeOffset(settings.humanize / 100, dur) : at;
  if (voice === 'arp') {
    synth.playWest(tuned(note), velocity, t, dur, { ...westVoice(1), mono: `score${part}`, out: buses.arp });
  } else if (voice === 'mono') {
    if (!monoSynth) return;
    monoSynth.noteOn(tuned(note), t, { velocity: velocity / 127 });
    monoSynth.noteOff(t + Math.max(0.02, dur));
  } else if (settings.chordSound !== 'analog') {
    synth.fmVoice(tuned(note), velocity, t, { ...fmOptions(), out: chorus.input }).release(t + dur);
  } else {
    synth.play(tuned(note), velocity, t, dur, {
      cutoff: settings.chordCutoff, resonance: settings.chordResonance,
      layers: chordLayers(), level: settings.chordLevel / 100, out: chorus.input,
    });
  }
}

async function addScoreFiles(files) {
  let added = 0;
  let last = null;
  for (const file of files) {
    const data = await file.arrayBuffer();
    try { parseMidi(data); } catch (err) { $('score-status').textContent = `${file.name}: ${err.message}`; continue; }
    const id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    scoreFiles[id] = { name: file.name, data };
    try { await saveScore(id, scoreFiles[id]); } catch { /* storage unavailable: kept for this visit */ }
    added++;
    last = id;
  }
  if (last) chooseScore(last);
  if (added) $('score-status').textContent = `Added ${added} piece${added === 1 ? '' : 's'}. ` + $('score-status').textContent;
}

$('score-on').addEventListener('click', () => {
  settings.scoreOn = !settings.scoreOn;
  scoreStart = null;
  if (settings.scoreOn) {
    ensureAudio();
    if (!playing && settings.sync === 'internal') setPlaying(true);
  }
  renderScore();
  save();
});
$('score-pick').addEventListener('change', () => chooseScore($('score-pick').value));
$('score-load').addEventListener('click', () => $('score-file').click());
$('score-file').addEventListener('change', async () => {
  await addScoreFiles([...$('score-file').files]);
  $('score-file').value = '';
});
confirmClick($('score-remove'), async () => {
  if (!score) return;
  const id = score.id;
  delete scoreFiles[id];
  delete settings.scoreVoices[id];
  try { await deleteScore(id); } catch { /* ignore */ }
  chooseScore(Object.keys(scoreFiles)[0] || '');
}, { ask: 'Sure? Remove' });
confirmClick($('score-clear'), async () => {
  for (const id of Object.keys(scoreFiles)) delete scoreFiles[id];
  settings.scoreVoices = {};
  scoreSounding.length = 0;
  try { await clearScores(); } catch { /* nothing stored */ }
  chooseScore('');
  $('score-status').textContent = 'All MIDI files cleared.';
}, { ask: 'Sure? Clear all', needed: () => Object.keys(scoreFiles).length > 0 });
$('score-tempo').addEventListener('click', () => { if (score) setBpm(tempoBpm(score.tempo)); });
for (let t = -24; t <= 24; t++) $('score-transpose').add(new Option(`${t > 0 ? '+' : ''}${t}`, String(t)));
bindSelect('score-transpose', 'scoreTranspose');
bindSelect('score-speed', 'scoreSpeed', [['0.5', '½×'], ['0.75', '¾×'], ['1', '1×'], ['1.5', '1½×'], ['2', '2×']]);
/** What happens at the end of a piece (older saves only had Loop on/off). */
function scoreMode() {
  return ['once', 'loop', 'list', 'shuffle'].includes(settings.scoreMode) ? settings.scoreMode : settings.scoreLoop ? 'loop' : 'once';
}
/** The pieces in menu order. */
const pieceIds = () => Object.keys(scoreFiles).sort((a, b) => scoreFiles[a].name.localeCompare(scoreFiles[b].name));
/** The playlist's next piece: the one after this in the menu (round again at the end), or a random other one. */
function nextPieceId(shuffle) {
  const ids = pieceIds();
  if (!ids.length) return null;
  const i = ids.indexOf(score?.id);
  if (shuffle && ids.length > 1) {
    const others = ids.filter((id) => id !== score?.id);
    return others[Math.floor(Math.random() * others.length)];
  }
  return ids[(i + 1) % ids.length];
}
settings.scoreMode = scoreMode();
bindSelect('score-mode', 'scoreMode', [['once', 'This piece once'], ['loop', 'Loop this piece'], ['list', 'Playlist: all in order'], ['shuffle', 'Playlist: shuffled']]);
onRecall(() => { settings.scoreMode = scoreMode(); $('score-mode').value = settings.scoreMode; scoreStart = null; chooseScore(settings.scoreId); });
// Drop MIDI files onto the window.
$('score-panel').addEventListener('dragover', (e) => { e.preventDefault(); $('score-panel').classList.add('dragover'); });
$('score-panel').addEventListener('dragleave', () => $('score-panel').classList.remove('dragover'));
$('score-panel').addEventListener('drop', (e) => {
  e.preventDefault();
  $('score-panel').classList.remove('dragover');
  addScoreFiles([...e.dataTransfer.files].filter((f) => /\.midi?$/i.test(f.name) || /midi/.test(f.type)));
});
renderScore();
loadScores().then((stored) => {
  Object.assign(scoreFiles, stored);
  chooseScore(scoreFiles[settings.scoreId] ? settings.scoreId : Object.keys(scoreFiles)[0] || '');
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
    for (const src of ['arp', 'chords', 'drums', 'bass']) {
      const key = `${fx}Send${src[0].toUpperCase()}${src.slice(1)}`;
      sends[fx][src].gain.setTargetAtTime(settings[key] / 100, now, 0.02);
    }
  }
}
bindSelect('delay-time', 'delayTime', DELAY_TIMES.map((d) => [d, d]), applyFx);
bindRange('delay-feedback', 'delayFeedback', (v) => `${v}%`, applyFx);
bindLog('delay-tone', 'delayTone', 300, 12000, formatHz, applyFx);
$('delay-pingpong').checked = settings.delayPingPong;
onRecall(() => { $('delay-pingpong').checked = settings.delayPingPong; applyFx(); updateDelayTime(); });
$('delay-pingpong').addEventListener('change', () => { settings.delayPingPong = $('delay-pingpong').checked; applyFx(); save(); });
bindLog('reverb-size', 'reverbSize', 300, 8000, (ms) => `${(ms / 1000).toFixed(1)} s`, applyFx);
bindRange('reverb-pre', 'reverbPre', (v) => `${v} ms`, applyFx);
bindLog('reverb-tone', 'reverbTone', 300, 12000, formatHz, applyFx);
for (const fx of ['delay', 'reverb']) {
  for (const src of ['Arp', 'Chords', 'Drums', 'Bass']) {
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
onRecall(() => { $('osc2-sync').checked = settings.osc2SyncCutoff; showModDepth(); showOsc2Cutoff(); });
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

// Touch: a long press or a slide across the keys mustn't select text or open the
// callout / context menu (on phones that steals the gesture from the keys).
{
  const keysPanel = $('keyboard').closest('.panel');
  for (const type of ['selectstart', 'contextmenu']) {
    keysPanel.addEventListener(type, (e) => {
      if (!e.target.closest('select, input')) e.preventDefault();
    });
  }
  $('keyboard').addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
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
  padVoices.clear(); // silenced by panic; the next step restarts whatever should still sound
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
// Readout: the tuning, the key it's anchored to, and the chord it's following now
// (with how far that chord's root is tuned from equal temperament).
const TUNING_SHORT = { equal: 'Equal', just: 'Just 5-limit', just7: 'Just 7-limit' };
let tuneReadout = '';
let tuneReadoutAt = 0;
function showTuning(nowMs) {
  if (nowMs - tuneReadoutAt < 120) return; // a few times a second is plenty
  tuneReadoutAt = nowMs;
  const tonic = tonicPc();
  const keyText = tonic === null ? '—' : `${NOTE_CLASSES[tonic]}${settings.tuningKey === 'auto' ? ' (auto)' : ''}`;
  const key = chordRoot();
  let chordText = '—';
  if (key) {
    const [, r, d] = key.split('|');
    const root = Number(r);
    const slot = settings.progOn && progIndex >= 0 ? settings.progression[progIndex] : null;
    const name = slot && slot.type !== 'rest'
      ? NOTE_CLASSES[root] + CHORD_SUFFIX[slot.type]
      : NOTE_CLASSES[root] + (d === '1' ? '°' : '');
    const cents = settings.tuning === 'equal' ? 0 : tuningCents(60 + root, key);
    chordText = Math.abs(cents) >= 0.05 ? `${name} ${cents > 0 ? '+' : '−'}${Math.abs(cents).toFixed(1)}¢` : name;
  }
  const text = `${TUNING_SHORT[settings.tuning]}|${keyText}|${chordText}`;
  if (text === tuneReadout) return;
  tuneReadout = text;
  $('out-tuning').textContent = TUNING_SHORT[settings.tuning];
  $('out-key').textContent = keyText;
  $('out-chord').textContent = chordText;
}

function frame() {
  const now = audioTime();
  showTuning(performance.now());
  while (uiEvents.length && uiEvents[0].time <= now) {
    const ev = uiEvents.shift();
    if (ev.kind === 'mono') {
      showMonoStep(ev.step);
      continue;
    }
    if (ev.kind === 'song') {
      showSongBar(ev.bar);
      continue;
    }
    if (ev.kind === 'drum-overlay') {
      showDrumOverlay(ev.overlay);
      continue;
    }
    if (ev.kind === 'break') {
      showBreakStep(ev.step, ev.slice, ev.change);
      continue;
    }
    if (ev.kind === 'drum') {
      showDrumStep(ev.step, ev.hits);
      continue;
    }
    if (ev.kind === 'prog') {
      showProgSlot(ev.index);
      showProgKey(ev.shift);
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
    $('out-note').textContent = ev.silent ? '(arp off)' : ev.rest
      ? `tail → ${noteName(ev.note)}`
      : ev.velocity ? noteName(ev.note) : '(muted)';
    $('out-vel').textContent = ev.velocity && !ev.silent ? `vel ${ev.velocity}` : '';
    $('out-osc2-wrap').hidden = ev.note2 === null;
    if (ev.note2 !== null) $('out-osc2').textContent = ev.velocity ? noteName(ev.note2) : '(muted)';
    if (ev.velocity && !ev.silent) {
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

// ---------------------------------------------------------------- UI: scenes
// A scene is a named snapshot of the settings: every sound, sequence, pattern, slot,
// progression, song and effect. Things that belong to this device or this moment stay
// put (DEVICE_KEYS: theme, folded windows, MIDI, volume, clock source, keyboard octave).
// Recall is live: while playing, the scene takes over on the next bar's downbeat and
// every window re-reads its settings (recallHooks); stopped, it applies at once.
// The state before the recall is kept so it can be undone.
const SCENES_KEY = 'arp-seq-scenes-v1';
const UNDO_KEY = 'arp-seq-scene-undo-v1';
const CURRENT_SCENE_KEY = 'arp-seq-scene-current-v1';

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
};
let scenes = readJson(SCENES_KEY, []);
if (!Array.isArray(scenes)) scenes = [];
const sceneId = () => Math.random().toString(36).slice(2, 10);

function sceneSnapshot() {
  const copy = JSON.parse(JSON.stringify(settings));
  for (const k of DEVICE_KEYS) delete copy[k];
  return copy;
}

function storeScenes() {
  try {
    localStorage.setItem(SCENES_KEY, JSON.stringify(scenes));
    return true;
  } catch {
    sceneStatus('Couldn\'t save: this browser\'s storage is full or blocked.');
    return false;
  }
}

let statusTimer;
function sceneStatus(text) {
  $('scene-status').textContent = text;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { $('scene-status').textContent = ''; }, 4000);
}

/** Recall a snapshot: on the next bar while playing, otherwise straight away. */
function applyScene(data, currentId = null, name = '') {
  pendingScene = { data, currentId, name };
  if (playing) {
    sceneStatus(name ? `"${name}" comes in on the next bar…` : 'Going back on the next bar…');
    renderScenes();
  } else applyPendingScene();
}

/** Swap the settings for the pending scene and have every window re-read them. */
function applyPendingScene() {
  if (!pendingScene) return;
  const { data, currentId, name } = pendingScene;
  pendingScene = null;
  const undo = sceneSnapshot();
  const keep = {};
  for (const k of DEVICE_KEYS) if (k in settings) keep[k] = settings[k];
  for (const k of Object.keys(settings)) delete settings[k];
  Object.assign(settings, structuredClone(DEFAULTS), structuredClone(data), keep);
  uiEvents.length = 0; // queued display updates refer to the old patterns
  for (const fn of recallHooks) {
    try { fn(); } catch (err) { console.error('scene recall:', err); }
  }
  try {
    localStorage.setItem(UNDO_KEY, JSON.stringify(undo));
    if (currentId) localStorage.setItem(CURRENT_SCENE_KEY, currentId);
    else localStorage.removeItem(CURRENT_SCENE_KEY);
  } catch { /* storage blocked: the recall still works */ }
  save(true);
  $('scene-undo').hidden = false;
  renderScenes();
  sceneStatus(name ? `Recalled "${name}".` : 'Back to how it was before the recall.');
}

const formatWhen = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

function renderScenes() {
  const list = $('scene-list');
  list.replaceChildren();
  const current = localStorage.getItem(CURRENT_SCENE_KEY);
  scenes.forEach((scene, i) => {
    const li = document.createElement('li');
    li.classList.toggle('current', scene.id === current);
    li.classList.toggle('pending', pendingScene?.currentId === scene.id);
    const title = document.createElement('span');
    title.className = 'scene-title';
    title.textContent = scene.name;
    title.title = scene.name;
    const when = document.createElement('span');
    when.className = 'scene-when';
    when.textContent = formatWhen(scene.saved);
    const btn = (text, tip, fn, ask = null) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.title = tip;
      if (ask) confirmClick(b, fn, { ask });
      else b.addEventListener('click', fn);
      return b;
    };
    li.append(
      title, when,
      btn('Recall', 'Switch to this scene: on the next bar while playing, at once when stopped', () => applyScene(scene.settings, scene.id, scene.name)),
      btn('Update', 'Replace this scene with everything as it is now (click twice)', () => {
        scenes[i] = { ...scene, saved: new Date().toISOString(), settings: sceneSnapshot() };
        if (storeScenes()) {
          try { localStorage.setItem(CURRENT_SCENE_KEY, scene.id); } catch { /* ignore */ }
          renderScenes();
          sceneStatus(`Updated "${scene.name}".`);
        }
      }, 'Sure? Update'),
      btn('Rename', 'Give this scene a new name', () => {
        // Edit the name in place (Enter saves, Esc cancels): no dialog, so the music keeps going.
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 40;
        input.value = scene.name;
        input.className = 'scene-title';
        input.setAttribute('aria-label', 'Scene name');
        let done = false;
        const finish = (keep) => {
          if (done) return;
          done = true;
          const name = input.value.trim();
          if (keep && name && name !== scene.name) {
            scenes[i] = { ...scene, name: name.slice(0, 40) };
            storeScenes();
          }
          renderScenes();
        };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') finish(true);
          if (e.key === 'Escape') finish(false);
          e.stopPropagation(); // typing a name mustn't play notes or toggle Play
        });
        input.addEventListener('blur', () => finish(true));
        title.replaceWith(input);
        input.focus();
        input.select();
      }),
      btn('Delete', 'Delete this scene (click twice)', () => {
        scenes.splice(i, 1);
        if (storeScenes()) renderScenes();
      }, 'Sure? Delete'),
    );
    list.append(li);
  });
}

$('scene-save').addEventListener('click', () => {
  const name = ($('scene-name').value.trim() || `Scene ${scenes.length + 1}`).slice(0, 40);
  const scene = { id: sceneId(), name, saved: new Date().toISOString(), settings: sceneSnapshot() };
  scenes.push(scene);
  if (!storeScenes()) { scenes.pop(); return; }
  try { localStorage.setItem(CURRENT_SCENE_KEY, scene.id); } catch { /* ignore */ }
  $('scene-name').value = '';
  renderScenes();
  sceneStatus(`Saved "${name}".`);
});
$('scene-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('scene-save').click(); });

$('scene-undo').hidden = !localStorage.getItem(UNDO_KEY);
$('scene-undo').addEventListener('click', () => {
  const before = readJson(UNDO_KEY, null);
  if (before) applyScene(before);
});

$('scene-export').addEventListener('click', () => {
  if (!scenes.length) { sceneStatus('No scenes to export yet.'); return; }
  const blob = new Blob([JSON.stringify({ app: 'arp-seq', version: 1, scenes }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `arp-seq-scenes-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('scene-import').addEventListener('click', () => $('scene-file').click());
$('scene-file').addEventListener('change', async () => {
  const file = $('scene-file').files[0];
  $('scene-file').value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = (Array.isArray(data) ? data : data?.scenes || []).filter(
      (s) => s && typeof s.name === 'string' && s.settings && typeof s.settings === 'object',
    );
    if (!incoming.length) throw new Error('none');
    const ids = new Set(scenes.map((s) => s.id));
    for (const s of incoming) {
      scenes.push({
        id: ids.has(s.id) || !s.id ? sceneId() : String(s.id),
        name: s.name.slice(0, 40), saved: s.saved || new Date().toISOString(), settings: s.settings,
      });
    }
    if (storeScenes()) {
      renderScenes();
      sceneStatus(`Imported ${incoming.length} scene${incoming.length > 1 ? 's' : ''}.`);
    }
  } catch {
    sceneStatus('That file has no arp·seq scenes in it.');
  }
});
renderScenes();

// ---------------------------------------------------------------- UI: collapsible windows
// Each panel folds down to its header (the title, plus its header row of controls
// where it has one). The title, a toggle button, or in System 7 the close box,
// fold it; the state is remembered per panel.
if (!settings.collapsed || typeof settings.collapsed !== 'object') settings.collapsed = {};

function setCollapsed(panel, collapsed) {
  const key = panel.getAttribute('aria-label');
  panel.classList.toggle('collapsed', collapsed);
  panel.querySelector('.collapse-btn')?.setAttribute('aria-expanded', String(!collapsed));
  if (collapsed) settings.collapsed[key] = true;
  else delete settings.collapsed[key];
  if (!collapsed && panel.id === 'break-panel') requestAnimationFrame(() => { drawBreak(); drawTrimOverview(); }); // canvases need their width again
}

document.querySelectorAll('main > .panel').forEach((panel) => {
  const h2 = panel.querySelector('h2');
  if (!h2) return;
  const btn = document.createElement('button');
  btn.className = 'collapse-btn';
  btn.setAttribute('aria-label', `Collapse or expand ${panel.getAttribute('aria-label')}`);
  btn.title = 'Collapse / expand';
  const toggle = () => { setCollapsed(panel, !panel.classList.contains('collapsed')); save(); };
  btn.addEventListener('click', toggle);
  h2.before(btn);
  h2.classList.add('collapsible');
  h2.addEventListener('click', toggle);
  setCollapsed(panel, !!settings.collapsed[panel.getAttribute('aria-label')]);
});
// Solo: each sound-making window has an S button. Soloing one or more silences the
// rest (their effects sends too, but tails already in the delay/reverb ring out).
// Not saved: a fresh load always starts with everything audible.
const SOLO_PANELS = {
  Arpeggiator: 'arp', 'Chord rhythm': 'chords', 'Mono synth': 'bass', Percussion: 'perc', 'Breakbeat slicer': 'break',
};
const soloed = new Set();
const soloButtons = {};
function applySolo(instant = false) {
  if (!ctx) return;
  for (const key of Object.values(SOLO_PANELS)) {
    const bus = buses[key];
    if (!bus) continue;
    const v = soloed.size === 0 || soloed.has(key) ? 1 : 0;
    if (instant) bus.gain.value = v;
    else bus.gain.setTargetAtTime(v, ctx.currentTime, 0.008);
  }
}
function renderSolo() {
  for (const [key, btn] of Object.entries(soloButtons)) {
    const on = soloed.has(key);
    btn.setAttribute('aria-pressed', String(on));
    btn.closest('.panel').classList.toggle('silenced', soloed.size > 0 && !on);
  }
}
document.querySelectorAll('main > .panel').forEach((panel) => {
  const key = SOLO_PANELS[panel.getAttribute('aria-label')];
  if (!key) return;
  const btn = document.createElement('button');
  btn.className = 'solo-btn';
  btn.textContent = 'S';
  btn.setAttribute('aria-pressed', 'false');
  btn.setAttribute('aria-label', `Solo ${panel.querySelector('h2').textContent}`);
  btn.title = 'Solo: hear only this (and any other soloed sections). Alt-click to solo this alone.';
  btn.addEventListener('click', (e) => {
    if (e.altKey) {
      const only = soloed.size === 1 && soloed.has(key);
      soloed.clear();
      if (!only) soloed.add(key);
    } else if (soloed.has(key)) soloed.delete(key);
    else soloed.add(key);
    applySolo();
    renderSolo();
  });
  soloButtons[key] = btn;
  panel.querySelector('h2').after(btn);
});
// Jump bar: one chip per window, in page order, grouped by what they do. A dot
// shows which modules are switched on; clicking opens the window and scrolls to it.
const DOCK_NAMES = {
  Transport: 'Clock', Scenes: 'Scenes', Keyboard: 'Keys', Arpeggiator: 'Arp', Sequencer: 'Seq', 'Arp voice, oscillator 1': 'Osc 1',
  'Oscillator 2': 'Osc 2', 'Chord progression': 'Prog', 'Chord rhythm': 'Chords', 'Mono synth': 'Mono', 'Score player': 'Score',
  Percussion: 'Drums', 'Breakbeat slicer': 'Break', Song: 'Song', Effects: 'FX', 'Sound and MIDI': 'MIDI',
};
const DOCK_GROUP_STARTS = new Set(['Arpeggiator', 'Chord progression', 'Mono synth', 'Percussion', 'Effects']);
document.querySelectorAll('main > .panel').forEach((panel) => {
  const label = panel.getAttribute('aria-label');
  const chip = document.createElement('button');
  chip.textContent = DOCK_NAMES[label] || label;
  chip.title = `Go to ${panel.querySelector('h2')?.textContent || label}`;
  if (DOCK_GROUP_STARTS.has(label)) chip.classList.add('group-start');
  chip.addEventListener('click', () => {
    if (panel.classList.contains('collapsed')) { setCollapsed(panel, false); save(); }
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  const onBtn = panel.querySelector('button[id$="-on"]');
  if (onBtn) {
    const sync = () => chip.classList.toggle('on', onBtn.getAttribute('aria-pressed') === 'true');
    new MutationObserver(sync).observe(onBtn, { attributes: true, attributeFilter: ['aria-pressed'] });
    sync();
  }
  $('dock-nav').append(chip);
});
// Windows scroll to just below the sticky bar.
const setDockHeight = () => document.documentElement.style.setProperty('--dock-h', `${document.querySelector('.dock').offsetHeight + 8}px`);
setDockHeight();
window.addEventListener('resize', setDockHeight);

// Help: every window's explanatory text is hidden until asked for (hover titles still work).
function renderHelp() {
  document.documentElement.classList.toggle('show-help', !!settings.showHelp);
  $('help-toggle').setAttribute('aria-pressed', String(!!settings.showHelp));
  $('help-toggle').textContent = settings.showHelp ? 'Hide help' : 'Help';
}
$('help-toggle').addEventListener('click', () => {
  settings.showHelp = !settings.showHelp;
  renderHelp();
  save();
});
renderHelp();

for (const [id, collapse] of [['collapse-all', true], ['expand-all', false]]) {
  $(id).addEventListener('click', () => {
    document.querySelectorAll('main > .panel').forEach((p) => setCollapsed(p, collapse));
    save();
  });
}

// ---------------------------------------------------------------- boot
buildSteps();
renderLengthButtons();
renderOsc2(); // also renders the steps
onRecall(() => {
  renderLengthButtons();
  renderOsc2();
  if (synth) { synth.wave = settings.wave; synth.cutoff = settings.cutoff; }
  drums?.setLevel(settings.drumLevel / 100);
  breakPlayer?.setLevel(settings.breakLevel / 100);
  renderKeyState();
});
buildChordPads();
buildKeyboard();
renderLearn(); // mark mapped controls built during boot (the sequencer steps)
requestAnimationFrame(frame);
