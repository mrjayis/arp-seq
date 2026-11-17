import {
  PPQN,
  ArpSeqEngine, MODES, MODE_LABELS, RATES, PITCH_RANGE,
  MIN_SEQ_LENGTH, MAX_SEQ_LENGTH, noteName, defaultSteps, CHORDS, chordNotes,
  OSC2_MODES, osc2Note, euclid, MAX_EUCLID_STEPS, chordVoicing, patternAt,
  PAD_CHORDS, MAX_PROGRESSION, MAX_SLOT_BEATS, DIM_TYPES, PROGRESSION_BEATS, PROGRESSION_PRESETS, progressionAt, slotNotes,
  progressionChord, anticipatedSlot, chordTie, SLOT_OCTAVES, humanizeOffset, humanizeLevel,
  MOD_EVERY, MOD_INTERVALS, progressionRound, modulationShift, TUNINGS, justCents, chordRootPc, isDimChord, sweeten, autoTonic, arrangeMutes,
  INVERSIONS, PROG_VOICINGS, progressionVoicings,
  defaultProgression, sliderToFreq, freqToSlider, formatHz,
} from './core.js?v=247';
import { InternalClock, ExternalClock, pulseToStep } from './clock.js?v=247';
import { Synth, Chorus, LPG_MODES, MOD_TYPES, MAX_FM_INDEX, blendGains, pulseOffsets } from './synth.js?v=247';
import { Midi } from './midi.js?v=247';
import { Delay, Reverb, delaySeconds, DELAY_TIMES } from './fx.js?v=247';
import {
  DrumSynth, DRUM_STEPS, KITS, KIT_ORDER, parsePattern, presetConds, presetLens, TRIPLET_FEEL, assignSamples, CONDITIONS, FILL_EVERY, isFillBar, drumHits, addFill,
} from './percussion.js?v=247';
import { parseMidi, scoreLength, monoLengths, firstAtOrAfter, tempoBpm } from './score.js?v=247';
import { RECORDER_WORKLET, framesBetween, soundSpan, encodeWav, peakOf } from './recorder.js?v=247';
import { Invention, parseSubject } from './invention.js?v=247';
import { ColtraneSolo } from './coltrane.js?v=247';
import { BASS_STYLES, BASS_RATES, styleForSong, bassLine } from './bass.js?v=247';
import { readSongs, songSlots, EXAMPLE_SONGS } from './ireal.js?v=247';
import { saveTrackSample, deleteTrackSample, loadTrackSamples, saveSample, deleteSample, clearSamples, loadSamples, saveBreak, loadBreak, saveScore, deleteScore, loadScores, clearScores } from './samples.js?v=247';
import {
  BreakPlayer, SLICE_COUNTS, BREAK_STEPS, BREAK_BARS, BREAK_FX, ROLL_TYPES, MAX_ROLL, fitRate, rowTriggers, rowThisTime,
  inOrder, chop, randomize, resizePattern, peaks, equalPoints, sliceOffset, sliceAt, detectTransients,
  trimSamples, fadeEdges, TRACK_SAMPLES, EXTRA_TRACKS, emptyCell, trackColumn, keepTracks, reverseBuffer, isFilled, rollSpan, usableSlices, nearestStep, mpcOrder,
} from './breaks.js?v=247';
import { barRng, evolveDrums, evolveBreakRow, drumOverlay, breakRowChange } from './evolve.js?v=247';
import {
  MonoSynth, stepAction, writeStep, backStep, stepLabel, noteStep, restStep, holdStep, MAX_MONO_STEPS, SUB_MODES, PORTA_MODES,
} from './mono.js?v=247';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'arp-seq-settings-v1';

// ---------------------------------------------------------------- state
const engine = new ArpSeqEngine();
const settings = {
  bpm: 120,
  sync: 'internal',
  clockOut: false,
  mode: 'up', // an arp mode, or 'coltrane': a solo line over the chords (coltrane.js)
  soloSpace: 20, // %: Coltrane solo, breath between phrases
  bachSubject: '', // your own subject for the Bach invention, as note names ('' = a new one each Play)
  soloBebop: 50, // %: bebop language (enclosures, runs) against pure pentatonics
  soloBuild: '2', // choruses the solo builds over ('0' = steady)
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
  arpAttack: 4, // ms, arp oscillator 1
  arpRelease: 15, // ms of extra tail, arp oscillator 1
  osc2Attack: undefined, // ms, oscillator 2 (from oscillator 1's when unset: older saves shared one pair)
  osc2Release: undefined, // ms
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
  osc2BassStyle: 'auto', // with the Bass line sequence: a BASS_STYLES key
  osc2BassRate: 'auto', // the bass line's note value (BASS_RATES): 'auto' = the style's own
  chordSyncopate: false, // a chord hit in the last 8th before the progression moves on plays the next chord
  chordTie: false, // a syncopated chord holds over the bar line instead of being struck again on the downbeat
  tuningKey: 'auto', // the key's tonic for Just tuning: 'auto' (the progression's first chord) or 0–11
  tuningPure: true, // with Just tuning: no deliberate detuning, vibrato or chorus wobble
  tuning: 'equal', // 'equal' | 'just' | 'just7': adaptive just intonation to the chord now playing
  humanize: 0, // 0–100: random timing and level variation for every section
  delayMuted: false, // an effect's output muted (its sends keep feeding it)
  delayReturn: 100, // %: the mixer's Delay and Reverb return faders
  reverbReturn: 100,
  mixMute: {}, // the mixer's mutes for the sections: {arp: true, …}
  reverbMuted: false,
  harmMuted: false,
  arrBars: 4, // Arr: how often the arrangement changes
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
  stableMode: false, // steadier playback (screen recording, slow devices): bigger buffer, earlier scheduling, lighter display
  audioOut: '', // the audio output device id ('' = the system default); this device only
  outputMode: 'mix', // 'mix': one stereo pair; 'split': each module on its own pair of a multichannel output
  breakStepsOpen: true, // the Breakbeat tracker's steps shown (a view choice, not part of scenes)
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
  // Each send: before the section's fader (pre) or after it — e.g. delayPreDrums.
  // The breakbeat's sends (and Pre switches) start from the old shared Drums ones when unset.
  delaySendBreak: undefined, reverbSendBreak: undefined, harmSendBreak: undefined,
  delayPreBreak: undefined, reverbPreBreak: undefined, harmPreBreak: undefined,
  delayPreArp: false, delayPreChords: false, delayPreDrums: false, delayPreBass: false,
  reverbPreArp: false, reverbPreChords: false, reverbPreDrums: false, reverbPreBass: false,
  harmPreArp: false, harmPreChords: false, harmPreDrums: false, harmPreBass: false,
  // Harmonizer (H949-style pitch shifter with feedback), a send effect like the delay and reverb.
  harmFunc: 'pitch', // the Function button: 'pitch' (Pitch Change group) or 'delay' (Delay group)
  harmPitchMode: 0, // 0 Norm, 1 Extend, 2 μPC, 3 Reverse
  harmDelayMode: 4, // 4 Delay, 5 Random, 6 Flange, 7 Reverse
  harmAlgorithm: 1, // splicing: 1 or 2 (smoother)
  harmRepeat: false,
  harmMicro: 8, // μPC: pitch ratio in 0.1% steps (8 = +0.8%)
  harmDelayLevel: 0, // %: the Delay output (plain delayed signal)
  harmPitch: 7, // semitones
  harmSpread: 0, // cents between left and right
  harmDelay: 80, // ms
  harmFeedback: 45, // %
  harmGrain: 60, // ms: Extend's segment length, or Random/Flange rate
  harmLevel: 80, // %: the Main output (processed)
  harmSendArp: 0,
  harmSendChords: 0,
  harmSendDrums: 25,
  harmSendBass: 0,
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
  progSong: '', // the tune the progression came from (an iReal Pro chart), shown by the slots
  progStyle: '', // that tune's style ("Up Tempo Swing"), for the bass line's Auto style
  progOctave: 3,
  progModEvery: 0, // modulate every N rounds of the progression (0 = off)
  progModBy: 2, // semitones per modulation
  progModAll: true, // the mono synth and held keys change key with the progression too
  progVoicing: 'set', // 'set': each chord's own inversion; 'smooth': nearest inversion to the last chord
  progression: defaultProgression(),
  drumOn: false,
  drumKit: 'latin', // 'latin' | '808' | 'linn' | 'jazz' | 'user'
  drumFeel: undefined, // 'straight' | 'triplet' (jazz swing); set from the kit or preset when unset
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
  songChain: ['A', 'A', 'B', 'A'], // one section (A–D) per bar; runs of the same make the song's blocks
  songAll: true, // the song moves every module through the sections (off: only drums and break)
  breakEvolve: 0, // 0–100: per-bar variation of the break pattern
  trackLevels: {}, // the breakbeat sample track's levels, % per slot (1–8)
  breakSlotEvolve: {}, // the other break slots' Evolve settings: {A: {evolve, rolls, reverse}, …}
  breakCustom: null, // slice points moved by hand: {key (what they were made for), points (fractions)}
  breakEvolveRolls: 'fast', // Evolve's rolls: 'fast' (32nds in the step), 'sixteenths' or 'eighths' (a stutter in 16ths or 8ths)
  breakEvolveReverse: true, // Evolve may reverse a step
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
// Tables filled in as the windows are built: empty to begin with.
Object.assign(DEFAULTS, { drumKitStore: {}, sampleLevels: {}, sampleTunes: {}, drumMix: {}, mixMute: {} });
// Settings that belong to this device or this moment, not to a scene.
const DEVICE_KEYS = [
  'theme', 'themeV2', 'collapsed', 'showHelp', 'midiIn', 'midiInCh', 'midiOut', 'midiOutCh', 'volume', 'synthOn',
  'midiInChord', 'midiInMono', 'midiInDrums', 'midiInBreak', 'aftertouch', 'aftertouchDepth', 'midiMap',
  'sync', 'baseOctave', 'chordRoot', 'monoKbOctave', 'breakStepsOpen', 'audioOut', 'outputMode', 'stableMode',
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
// Oscillator 2's attack and release used to be oscillator 1's: start from those, so a saved
// sound (or scene) keeps sounding the same.
const osc2EnvFromOsc1 = () => {
  if (!Number.isFinite(settings.osc2Attack)) settings.osc2Attack = settings.arpAttack;
  if (!Number.isFinite(settings.osc2Release)) settings.osc2Release = settings.arpRelease;
};
osc2EnvFromOsc1();
onRecall(osc2EnvFromOsc1);
// The percussion and the breakbeat used to share their effect sends ("Drums"): the
// breakbeat's own start from those, so older saves and scenes sound the same.
const breakSendsFromDrums = () => {
  for (const fx of ['delay', 'reverb', 'harm']) {
    if (!Number.isFinite(settings[`${fx}SendBreak`])) settings[`${fx}SendBreak`] = settings[`${fx}SendDrums`] ?? 0;
    if (typeof settings[`${fx}PreBreak`] !== 'boolean') settings[`${fx}PreBreak`] = !!settings[`${fx}PreDrums`];
  }
};
breakSendsFromDrums();
onRecall(breakSendsFromDrums);

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
  engine.setMode(MODES.includes(settings.mode) ? settings.mode : 'up'); // a solo mode still steps the engine
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
      beats: Number.isInteger(s.beats) && s.beats >= 1 && s.beats <= MAX_SLOT_BEATS ? s.beats : def.beats,
      inv: Number.isInteger(s.inv) && s.inv >= 0 && s.inv < INVERSIONS.length ? s.inv : 0,
      oct: SLOT_OCTAVES.includes(s.oct) ? s.oct : 0,
      ...(s.flat === true ? { flat: true } : {}), // spelled with a flat (from a chart)
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
const sends = { delay: {}, reverb: {}, harm: {} }; // each send: {pre, post} gains (one is used)
const faders = {}; // each section's Level, after its solo gate
let harmIn = null; // sends mix here, into the Harmonizer worklet once it has loaded
const throwIn = {}; // the tracker's FX throws, per effect: gated with the breakbeat (mute, solo, Arr)
const trackPlayers = []; // Tracks 2–4 of the breakbeat tracker: one channel each
let harmOut = null;
let harmNode = null;
let delayFx = null;
let ctxStable = false; // whether the audio was started with the bigger (steadier) buffer
let outRouter = null; // separate outputs: {merger, gains: Map key -> gain} while split (see applyOutputRouting)
let reverbFx = null;
let playing = false;
const uiEvents = []; // {time, ...} drained by the animation loop

function ensureAudio() {
  if (!ctx) {
    // Steadier playback: a bigger buffer, so a busy device (screen recording) doesn't crackle.
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: settings.stableMode ? 'playback' : 'interactive' });
    ctxStable = !!settings.stableMode;
    synth = new Synth(ctx);
    synth.wave = settings.wave;
    synth.cutoff = settings.cutoff;
    synth.setVolume(settings.volume / 100);
    // Each section: its solo gate (buses[x]) → its fader (the section's Level) → the mix.
    // Effect sends tap either after the fader (post) or, with Pre-fader on, before it
    // (after the solo gate, so soloing still works).
    for (const k of ['arp', 'chords', 'bass', 'perc', 'break']) {
      buses[k] = ctx.createGain();
      faders[k] = ctx.createGain();
    }
    buses.drums = ctx.createGain(); // percussion + break after their faders, to the mix
    buses.arp.connect(faders.arp).connect(synth.master);
    buses.chords.connect(faders.chords).connect(synth.master);
    buses.bass.connect(faders.bass).connect(synth.master);
    buses.perc.connect(faders.perc).connect(buses.drums);
    buses.break.connect(faders.break).connect(buses.drums);
    buses.drums.connect(synth.out);
    const taps = {
      // ("drums" is the percussion; the breakbeat has sends of its own)
      post: { arp: faders.arp, chords: faders.chords, bass: faders.bass, drums: faders.perc, break: faders.break },
      pre: { arp: buses.arp, chords: buses.chords, bass: buses.bass, drums: buses.perc, break: buses.break },
    };
    applyFaders();
    delayFx = new Delay(ctx, synth.master);
    reverbFx = new Reverb(ctx, synth.master);
    // Harmonizer: the sends are wired now; the worklet joins when its module has loaded.
    harmIn = ctx.createGain();
    harmOut = ctx.createGain();
    harmOut.connect(synth.master);
    for (const [fx, input] of [['delay', delayFx.input], ['reverb', reverbFx.input], ['harm', harmIn]]) {
      for (const src of ['arp', 'chords', 'drums', 'break', 'bass']) {
        const pre = ctx.createGain();
        const post = ctx.createGain();
        pre.gain.value = 0;
        post.gain.value = 0;
        taps.pre[src].connect(pre).connect(input);
        taps.post[src].connect(post).connect(input);
        sends[fx][src] = { pre, post };
      }
      throwIn[fx] = ctx.createGain();
      throwIn[fx].connect(input);
    }
    ctx.audioWorklet?.addModule(new URL('./harmonizer-worklet.js?v=247', import.meta.url)).then(() => {
      harmNode = new AudioWorkletNode(ctx, 'harmonizer', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
      harmIn.connect(harmNode).connect(harmOut);
      applyHarm();
    }).catch(() => { /* no AudioWorklet: the harmonizer stays silent */ });
    applyFx();
    applySolo(true);
    drums = new DrumSynth(ctx, buses.perc);
    monoSynth = new MonoSynth(ctx, buses.bass);
    applyMono();
    breakPlayer = new BreakPlayer(ctx, buses.break);
    breakPlayer.setLevel(1); // its Level is the break fader
    for (let k = 0; k < EXTRA_TRACKS; k++) trackPlayers[k] = new BreakPlayer(ctx, buses.break);
    if (breakBuffer) breakPlayer.setBuffer(breakBuffer);
    decodeAllSamples();
    chorus = new Chorus(ctx, buses.chords);
    applyChorusMix();
    chorus.setRate(settings.chordChorusRate);
    chorus.setDepth(settings.chordChorusDepth / 100);
    synth.setPwmRate(settings.chordPwmRate);
    drums.setLevel(1); // its Level is the percussion fader
  }
  applyAudioOut();
  if (settings.outputMode === 'split' && !outRouter) applyOutputRouting();
  // Safari's state after a phone lock or a call is "interrupted", not "suspended".
  if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
  return ctx;
}

// ---- waking the sound after the phone sleeps
// iOS stops the audio when the screen turns off (or a call comes in) and only lets it
// resume from a touch. So: try when the page comes back, and again on the first touch.
/** Safari's audio session: 'playback' normally; 'play-and-record' while the microphone records
 * (a playback session isn't allowed to record, so iOS would refuse the microphone). */
function setAudioSession(type) {
  try { if (navigator.audioSession) navigator.audioSession.type = type; } catch { /* older Safari */ }
}
setAudioSession('playback');
function wakeAudio() {
  if (!ctx) return;
  if (ctx.state === 'closed') { // the page was frozen and the browser shut the audio down: start afresh
    save(true);
    location.reload();
    return;
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  if (playing && settings.sync === 'internal') timerWorker.postMessage(25); // restart its timer too
}
for (const type of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(type, wakeAudio, true);
document.addEventListener('visibilitychange', () => { if (!document.hidden) wakeAudio(); });
window.addEventListener('pageshow', wakeAudio);
window.addEventListener('focus', wakeAudio);

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
      level: settings.osc2Level / 100, // (the Arpeggiator Level is the arp fader)
      attack: settings.osc2Attack / 1000,
      release: settings.osc2Release / 1000,
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
    level: settings.osc1Level / 100, // (the Arpeggiator Level is the arp fader)
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
      return tuningId(root, notes, DIM_TYPES.includes(slot.type));
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
        level: settings.osc2Level / 100, out: buses.arp, mono: 'osc2',
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

// ---- Coltrane solo: the arp plays a pentatonic line over the chords instead of the
// held notes (coltrane.js); the arp's rate, gate, swing, steps and oscillator 2 still apply.
const solo = new ColtraneSolo();

/** The chord sounding now as {root, type}: the progression's, else worked out from held keys. */
function currentChord() {
  if (settings.progOn && progIndex >= 0) {
    const slot = settings.progression[progIndex];
    if (!slot || slot.type === 'rest') return null;
    return { root: (((slot.root + progShift) % 12) + 12) % 12, type: slot.type };
  }
  return heldChord(engine.notes.map((n) => n.note));
}

/** A chord type for some held notes, from the intervals above their root. */
function heldChord(notes) {
  if (!notes.length) return null;
  const root = chordRootPc(notes);
  const pcs = new Set(notes.map((n) => (((n - root) % 12) + 12) % 12));
  const type = pcs.has(3)
    ? (pcs.has(6) && !pcs.has(7) ? (pcs.has(9) ? 'dim7' : pcs.has(10) ? 'hdim7' : 'dim') : pcs.has(10) ? 'min7' : 'min')
    : pcs.has(10) ? 'dom7' : pcs.has(11) ? 'maj7' : 'maj';
  return { root, type };
}

/**
 * What the solo needs to know at clock `pulse`: the next chord and how many steps are
 * left before it (for enclosures), and where it is in its build (intensity).
 */
function soloContext(pulse, rateKey = settings.rate) {
  const rate = RATES[rateKey] || RATES['1/16'];
  const ctx = {
    space: settings.soloSpace / 100, bebop: settings.soloBebop / 100, stepsPerBeat: PPQN / rate,
    next: null, stepsLeft: Infinity, intensity: 0.5,
  };
  const build = Number(settings.soloBuild) || 0; // choruses to build over (0: steady)
  const at = progSlotAt(pulse);
  ctx.downbeat = pulse % (PPQN * 2) === 0; // beats 1 and 3
  if (at) {
    ctx.next = at.next;
    ctx.stepsLeft = Math.max(1, Math.ceil((at.end - pulse) / rate));
  }
  if (build) {
    // A chorus is once through the progression (8 bars without one); the build starts
    // again after its peak, like the next soloist.
    const choruses = at ? at.progress : pulse / (PPQN * 4 * 8);
    ctx.intensity = 0.1 + 0.9 * ((choruses % build) / build);
  }
  soloIntensity = ctx.intensity;
  return ctx;
}
let soloIntensity = 0.5;

function playArp(step, pulse = 0) {
  if (settings.mode === 'bach') return; // the invention plays the arp voice itself (inventionPulse)
  let ev = engine.next();
  if (!ev) return;
  if (settings.mode === 'coltrane') {
    const note = ev.rest ? null : solo.next(currentChord(), soloContext(pulse));
    if (note === null) {
      // A breath (or a step switched off): nothing struck.
      uiEvents.push({ kind: 'arp', time: step.time, off: step.time, ...ev, velocity: 0, note2: null });
      return;
    }
    // The line's note stands in for the arp's; oscillator 2 follows it (offset 0). It
    // plays harder as the solo builds.
    const velocity = Math.max(1, Math.min(127, Math.round(ev.velocity * (0.8 + 0.4 * soloIntensity))));
    ev = { ...ev, note, sourceNote: note, offset: 0, velocity, phraseEnd: solo.ended };
  }
  if (!settings.arpOn) {
    // Silent: still step, so the sequencer display and following chords keep moving.
    uiEvents.push({ kind: 'arp', time: step.time, off: step.time, ...ev, note2: null, silent: true });
    return;
  }
  let gateLen = gateLength(step, settings.gate);
  // A solo phrase's last note is held on (about a beat) into the breath after it.
  if (ev.phraseEnd) gateLen = Math.max(gateLen, step.duration * (PPQN / RATES[settings.rate]) * 0.9);
  if (ev.rest) {
    // Step switched off: strike nothing, but slide whatever tail is still ringing
    // to the note this step would have played (each oscillator its own way).
    const modNote = osc2Note(ev, settings.osc2Mode, settings.osc2Transpose);
    const note2 = settings.osc2On && settings.osc2Mode !== 'line' ? modNote : null;
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
  const note2 = settings.osc2On && settings.osc2Mode !== 'line' ? modNote : null; // a bass line plays on its own
  if (ev.velocity > 0) {
    // Aftertouch: pressing harder on a held key makes its arp notes louder and brighter.
    const press = arpPressureFor(ev.sourceNote);
    const velocity = Math.min(127, Math.round(humanLevel(ev.velocity) * (1 + 0.5 * press)));
    playVoice(ev.note, note2, velocity, step.time, gateLen, modNote, press);
    arpTail = { note: ev.note, note2, modNote, root: chordRoot() };
  }
  uiEvents.push({ kind: 'arp', time: step.time, off: step.time + gateLen, note2, ...ev });
}

// ---- Bass line: oscillator 2 as the band's bassist. Each chord's line is planned as the
// chord starts (knowing the next chord) and played on the 8th-note grid.
let bassPlan = null; // {start, end, key, events: [{pulse, note, len (pulses)}]}
let bassLast = null; // the last bass note (written register), so each line carries on from it

/** The style in use: Auto follows the loaded song's style. */
const bassStyle = () => (settings.osc2BassStyle === 'auto' ? styleForSong(settings.progSong ? settings.progStyle : '') : settings.osc2BassStyle);

/**
 * Where the progression is at clock `pulse`: the slot (i), its start and end pulses,
 * its chord and the next one (modulation applied), and how far through the whole
 * progression the clock is (round + fraction). null with the progression off or empty.
 */
function progSlotAt(pulse) {
  if (!settings.progOn) return null;
  const slots = settings.progression.slice(0, settings.progLength);
  const total = slots.reduce((n, s) => n + s.beats, 0) * PPQN;
  if (!total) return null;
  const t = pulse % total;
  let at = 0;
  let i = 0;
  while (i < slots.length - 1 && at + slots[i].beats * PPQN <= t) { at += slots[i].beats * PPQN; i++; }
  const start = pulse - (t - at);
  const end = start + slots[i].beats * PPQN;
  const nextSlot = slots[(i + 1) % slots.length];
  return {
    i, start, end,
    chord: { root: (slots[i].root + progShiftAt(start) + 120) % 12, type: slots[i].type },
    next: { root: (nextSlot.root + progShiftAt(end) + 120) % 12, type: nextSlot.type },
    progress: pulse / total, // rounds played, with the fraction through this one
  };
}

/** Plan the bass from `pulse` to the end of the chord (or bar) it's in. null: nothing to play. */
function planBass(pulse) {
  const barBeats = 4;
  if (settings.progOn) {
    const at = progSlotAt(pulse);
    if (!at) return null;
    const { start, end, chord, next, i } = at;
    return makePlan(start, end, chord, next, `p${i}|${start}`, barBeats);
  }
  // No progression: follow the keys held, a bar at a time (a new chord starts a new line).
  const held = heldChord(engine.notes.map((n) => n.note));
  if (!held) return null;
  const { root, type } = held;
  const bar = PPQN * barBeats;
  const end = (Math.floor(pulse / bar) + 1) * bar;
  return makePlan(pulse, end, { root, type }, { root, type }, `h${root}${type}`, barBeats);
}

function makePlan(start, end, chord, next, key, barBeats) {
  const beats = (end - start) / PPQN;
  const line = bassLine({ chord, next, beats, prev: bassLast, style: bassStyle(), barBeats, unit: BASS_RATES[settings.osc2BassRate] ?? null });
  return { start, end, key, events: line.map((e) => ({ pulse: start + Math.round(e.beat * PPQN), note: e.note, len: e.len * PPQN })) };
}

function bassPulse(time, pulse, pulseDuration) {
  if (settings.osc2Mode !== 'line' || !settings.osc2On) { bassPlan = null; return; }
  const heldKey = () => { const n = engine.notes.map((x) => x.note); return n.length ? `h${chordRootPc(n)}` : ''; };
  // Re-plan at the end of a chord, or when the held chord changes under it.
  if (!bassPlan || pulse >= bassPlan.end || pulse < bassPlan.start
    || (!settings.progOn && !bassPlan.key.startsWith(heldKey() || '?'))) bassPlan = planBass(pulse);
  if (!bassPlan) return;
  for (const ev of bassPlan.events) {
    if (ev.pulse !== pulse) continue;
    bassLast = ev.note;
    const velocity = humanLevel(ev.pulse === bassPlan.start ? 104 : 92);
    // Swing, as the arp's: off-beat 8ths (or 16ths) played late.
    const unit = BASS_RATES[settings.osc2BassRate];
    let late = 0;
    if (unit === 0.5 && pulse % PPQN === PPQN / 2) late = (settings.swing / 100) * 0.5 * (PPQN / 2) * pulseDuration;
    if (unit === 0.25 && pulse % (PPQN / 2) === PPQN / 4) late = (settings.swing / 100) * 0.5 * (PPQN / 4) * pulseDuration;
    playBassNote(ev.note + settings.osc2Transpose, velocity, human({ time: time + late, duration: (PPQN / 2) * pulseDuration }).time, ev.len * pulseDuration * 0.95 - late);
  }
}

function playBassNote(note, velocity, time, len) {
  if (note < 0 || note > 127) return;
  if (settings.synthOn && synth && settings.osc2Level > 0) {
    if (settings.osc2Sound === 'bass') {
      synth.playBass(tuned(note), velocity, time, Math.max(len, 0.05), {
        level: settings.osc2Level / 100, out: buses.arp, mono: 'osc2',
        tone: settings.bassTone / 100, decay: settings.bassDecay / 1000,
      });
    } else synth.playWest(tuned(note), velocity, time, len, { ...westVoice(2), out: buses.arp });
  }
  if (settings.osc2MidiCh >= 0) {
    midi.noteOn(note, velocity, toPerfMs(time), settings.osc2MidiCh);
    midi.noteOff(note, toPerfMs(time + len), settings.osc2MidiCh);
  }
  uiEvents.push({ kind: 'bass', time, note });
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
    level: 1, // (the chord Level is the chord fader)
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
  if (!synth || !settings.synthOn || !settings.chordOn || settings.chordMode !== 'pad' || !audible('chords')) {
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
        level: (settings.chordSubLevel / 100) * 1.4,
      })
      : settings.chordSound !== 'analog'
        ? synth.fmVoice(n.note, n.velocity, time, {
          ...fmOptions(), attack: common.attack, release: common.release, out: chorus.input,
        })
        : synth.padVoice(n.note, n.velocity, time, {
          ...common, layers: chordLayers(), level: 1, out: chorus.input,
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
  const sound = settings.synthOn && synth && audible('chords');
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
        layers, level: 1, out: chorus.input,
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
        level: (settings.chordSubLevel / 100) * 1.4,
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
  if (pendingSections.size && pulse % (PPQN * 4) === 0) applyPendingSections();
  if (settings.songOn && settings.songAll && pulse % (PPQN * 4) === 0) songSections(pulse);
  arrPulse(pulse, time);
  if (settings.clockOut && settings.sync === 'internal') midi.clock(toPerfMs(time));
  stepProgression(time, pulse);
  bassPulse(time, pulse, pulseDuration);
  inventionPulse(time, pulse, pulseDuration);
  recPulse(time, pulse, pulseDuration);
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
    playArp(hstep, pulse);
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
    if (mstep) playMonoStep(human(mstep), pulse);
  }
  if (settings.songOn && pulse % (RATES['1/16'] * DRUM_STEPS) === 0) {
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
function evolvedDrumRows(stepNumber, rows, conds, evolve = settings.drumEvolve) {
  const amount = evolve / 100;
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
  const variation = drumSlotVariation(songSlot(step.stepNumber) || settings.drumSlot);
  const played = evolvedDrumRows(step.stepNumber, data.rows, data.conds, variation.evolve);
  // Once a bar (and on the first step): tell the grid how this bar differs from what's on screen.
  if (step.stepNumber % DRUM_STEPS === 0 || !drumOverlayShown) {
    drumOverlayShown = true;
    uiEvents.push({ kind: 'drum-overlay', time: step.time, overlay: drumOverlay(settings.drumRows, played) });
  }
  const hits = drumHits(played, step.stepNumber, {
    conds: data.conds, lens: data.lens, muted: settings.drumMuted, voices,
    fill: isFillBar(step.stepNumber, variation.fill),
  });
  // The triplet feel (jazz) places each beat's four cells on the triplet: the
  // beat, the triplet's middle, the swung "and" at two-thirds, the last sixth. (The
  // Swing slider doesn't apply: the feel already is the swing.)
  const k = step.stepNumber % 4;
  const at = settings.drumFeel === 'triplet' ? step.time - step.delay + (TRIPLET_FEEL[k] * 4 - k) * step.duration : step.time;
  for (const { id, gain } of hits) {
    // Each row has its own level and tuning (the sample mixer, or the kit's mixer).
    const { level, tune: rowTune } = rowMix(id);
    const rowLevel = level / 100;
    // Humanize: each hit its own small push or drag and level.
    const t = settings.humanize > 0 ? human({ ...step, time: at }).time : at;
    if (drums && audible('drums') && rowLevel > 0) drums.play(id, t, humanLevel(gain, 1.5) * rowLevel, rowTune);
    if (settings.drumMidiCh >= 0) {
      const { gm } = voices.find((v) => v.id === id);
      midi.noteOn(gm, Math.min(127, Math.round(gain * 127)), toPerfMs(t), settings.drumMidiCh);
      midi.noteOff(gm, toPerfMs(t + 0.05), settings.drumMidiCh);
    }
  }
  uiEvents.push({ kind: 'drum', time: step.time, step: step.stepNumber, hits: hits.map((h) => h.id) });
}

const internalClock = new InternalClock({ getTime: audioTime, onPulse, bpm: settings.bpm });
// Steadier playback schedules further ahead, so a stall on the page doesn't make notes late.
const applyLookahead = () => { internalClock.lookahead = settings.stableMode ? 0.35 : 0.12; };
applyLookahead();
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
      solo.reset();
      monoSolo.reset();
      invention.reset();
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
    breakStutter = null;
    breakStepTimes.length = 0;
    padSkip.clear();
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
  // Recording a Bach subject: the key is typed into it.
  if (bachRecording) { recordSubjectNote(note); return; }
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
          level: 1, out: chorus.input, attack: 0.008, release: 0.35,
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
    on(note, vel) { padHit(note - 36, vel); }, // records too, when the pads' Rec is on
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

bindSelect('mode', 'mode', [...MODES.map((m) => [m, MODE_LABELS[m]]), ['coltrane', 'Coltrane solo'], ['bach', 'Bach invention']], (m) => {
  engine.setMode(MODES.includes(m) ? m : 'up');
  solo.reset();
  invention.reset();
  renderSoloRow();
});
/** The Solo settings (Space, Bebop, Build) show while the arp or the Mono Synth is soloing. */
function renderSoloRow() {
  $('solo-row').hidden = settings.mode !== 'coltrane' && settings.monoSource !== 'solo';
  $('mono-solo-hint').hidden = settings.monoSource !== 'solo';
  const arpBach = settings.mode === 'bach';
  const monoBach = settings.monoSource === 'bach';
  $('bach-row').hidden = !arpBach && !monoBach; // (its Subject box serves either)
  $('bach-hint').textContent = monoBach
    ? 'The upper voice; the Mono Synth plays the lower voice against it.'
    : 'A single line. Set the Mono Synth\'s Play to Bach invention too for the lower voice in imitation.';
  $('mono-bach-hint').hidden = !monoBach;
  $('mono-bach-hint').textContent = arpBach
    ? 'The lower voice, against the arp\'s upper voice.'
    : 'A single line. Set the Arpeggiator\'s Mode to Bach invention too: it takes the upper voice and this one the lower.';
}
onRecall(() => renderSoloRow());
bindRange('solo-space', 'soloSpace', (v) => (v ? `${v}%` : 'none'));
bindRange('solo-bebop', 'soloBebop', (v) => (v ? `${v}%` : 'pure pentatonic'));
bindSelect('solo-build', 'soloBuild', [['0', 'Steady'], ['1', 'Over 1 chorus'], ['2', 'Over 2 choruses'], ['4', 'Over 4 choruses']]);
bindSelect('rate', 'rate', Object.keys(RATES).map((r) => [r, r]));
bindSelect('octaves', 'octaves', null, (n) => engine.setOctaves(n));
bindRange('gate', 'gate', (v) => `${v}%`);
bindRange('swing', 'swing', (v) => `${v}%`);

$('latch').setAttribute('aria-pressed', String(settings.latch));
$('latch').addEventListener('click', () => setLatch(!settings.latch));

// ---- Audio out: the device this app's sound goes to (Chrome and Edge can choose).
const canPickOutput = typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;
let audioOutBusy = false;
async function applyAudioOut() {
  if (!ctx || !canPickOutput || audioOutBusy) return;
  const want = settings.audioOut || '';
  if ((ctx.sinkId || '') === want) return;
  audioOutBusy = true;
  try {
    await ctx.setSinkId(want);
    applyOutputRouting(); // a new device may have more (or fewer) channels
    $('audio-out-status').textContent = want ? `Playing to ${$('audio-out').selectedOptions[0]?.textContent || 'the chosen output'}.` : '';
  } catch (e) {
    // Gone (unplugged) or not allowed: back to the default, and say so.
    $('audio-out-status').textContent = `Couldn't use that output (${e.name || 'error'}): playing to the system default.`;
    try { await ctx.setSinkId(''); } catch { /* the default is always there */ }
  } finally {
    audioOutBusy = false;
  }
}
// ---- Separate outputs: each module and effect on its own stereo pair of a multichannel
// output (a DAW then records each on its own track). One page plays to one device, so
// this is the way to split it: channels 1–2 Arp, 3–4 Chords, 5–6 Mono, 7–8 Percussion,
// 9–10 Break, 11–12 Delay, 13–14 Reverb, 15–16 Harmonizer. With fewer channels the last
// pair takes all the rest. The Volume sets every pair; the master compressor is skipped.
const OUT_PAIRS = [
  ['arp', 'Arp'], ['chords', 'Chords'], ['bass', 'Mono'], ['perc', 'Percussion'], ['break', 'Break'],
  ['delay', 'Delay'], ['reverb', 'Reverb'], ['harm', 'Harmonizer'],
];
const outSource = (key) => ({
  arp: faders.arp, chords: faders.chords, bass: faders.bass, perc: faders.perc, break: faders.break,
  delay: delayFx?.out, reverb: reverbFx?.out, harm: harmOut,
}[key]);
const mixTarget = (key) => (key === 'perc' || key === 'break' ? buses.drums : synth.master);

function applyOutputRouting() {
  const map = $('audio-split-map');
  if (!ctx || !faders.arp || !delayFx) { map.hidden = settings.outputMode !== 'split'; map.textContent = settings.outputMode === 'split' ? 'Separate outputs start with the sound.' : ''; return; }
  const dest = ctx.destination;
  // Undo a split first (back to the mix).
  if (outRouter) {
    for (const [key, g] of outRouter.gains) {
      const src = outSource(key);
      try { src.disconnect(g); } catch { /* not connected */ }
      src.connect(mixTarget(key));
      g.disconnect();
    }
    outRouter.merger.disconnect();
    outRouter = null;
    dest.channelCount = 2;
    dest.channelInterpretation = 'speakers';
  }
  map.hidden = settings.outputMode !== 'split';
  if (settings.outputMode !== 'split') return;
  const max = dest.maxChannelCount || 2;
  if (max < 4) {
    map.textContent = `This output has ${max} channel${max === 1 ? '' : 's'}, so everything stays on one pair. Choose a multichannel one in Audio out (e.g. BlackHole 16ch, or an audio interface with several outputs).`;
    return;
  }
  const n = Math.min(16, max - (max % 2));
  dest.channelCount = n;
  dest.channelCountMode = 'explicit';
  dest.channelInterpretation = 'discrete';
  const merger = ctx.createChannelMerger(n);
  merger.connect(dest);
  const pairs = n / 2;
  const gains = new Map();
  const used = new Map();
  OUT_PAIRS.forEach(([key, name], i) => {
    const src = outSource(key);
    if (!src) return;
    const pair = Math.min(i, pairs - 1);
    // Upmix to stereo (a mono source to both sides), then into its two channels.
    const g = ctx.createGain();
    g.channelCount = 2;
    g.channelCountMode = 'explicit';
    g.channelInterpretation = 'speakers';
    g.gain.value = settings.volume / 100;
    const split = ctx.createChannelSplitter(2);
    try { src.disconnect(mixTarget(key)); } catch { /* not connected */ }
    src.connect(g).connect(split);
    split.connect(merger, 0, 2 * pair);
    split.connect(merger, 1, 2 * pair + 1);
    gains.set(key, g);
    used.set(pair, [...(used.get(pair) || []), name]);
  });
  outRouter = { merger, gains };
  map.textContent = 'Channels: ' + [...used].map(([p, names]) => `${2 * p + 1}–${2 * p + 2} ${names.join(' + ')}`).join(' · ')
    + (n < 16 ? ` (this output has ${max} channels: the last pair takes the rest).` : '.');
}
/** The Volume, on every pair while split. */
function outVolume(v) {
  if (!outRouter || !ctx) return;
  for (const g of outRouter.gains.values()) g.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
}
$('audio-split').value = settings.outputMode === 'split' ? 'split' : 'mix';
$('audio-split').addEventListener('change', () => {
  settings.outputMode = $('audio-split').value;
  save();
  applyOutputRouting();
});

async function listAudioOutputs() {
  const sel = $('audio-out');
  if (!canPickOutput || !navigator.mediaDevices?.enumerateDevices) {
    sel.disabled = true;
    $('audio-out-list').hidden = true;
    $('audio-out-status').textContent = 'Choosing an output needs Chrome or Edge; this browser plays to the system default.';
    return;
  }
  let outs = [];
  try { outs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput'); } catch { /* none */ }
  // Without permission the browser hides devices (no ids or names).
  const hidden = !outs.some((d) => d.deviceId && d.label);
  sel.replaceChildren(new Option('System default', ''));
  outs.filter((d) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
    .forEach((d, i) => sel.add(new Option(d.label || `Output ${i + 1}`, d.deviceId)));
  if (settings.audioOut && ![...sel.options].some((o) => o.value === settings.audioOut)) {
    sel.add(new Option(hidden ? 'Your chosen output' : 'Your chosen output (not connected)', settings.audioOut));
  }
  sel.value = settings.audioOut || '';
  $('audio-out-list').hidden = !hidden;
  if (hidden && !settings.audioOut) $('audio-out-status').textContent = 'Press List outputs to see your devices.';
}
$('audio-out').addEventListener('change', () => {
  settings.audioOut = $('audio-out').value;
  save();
  if (ctx) applyAudioOut();
  else $('audio-out-status').textContent = settings.audioOut ? 'It will play there once the sound starts.' : '';
});
$('audio-out-list').addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop()); // only for the device names: nothing is recorded
    $('audio-out-status').textContent = '';
  } catch {
    $('audio-out-status').textContent = 'Without microphone permission the browser won\'t show its outputs.';
  }
  listAudioOutputs();
});
navigator.mediaDevices?.addEventListener?.('devicechange', () => { listAudioOutputs().then(() => applyAudioOut()); });
listAudioOutputs();

// ---- Steadier playback (for screen recording or a slow device).
function renderStable() {
  $('stable-mode').checked = !!settings.stableMode;
  // The buffer size is set when the sound starts: a reload applies a change made since.
  const needsReload = !!ctx && ctxStable !== !!settings.stableMode;
  $('stable-reload').hidden = !needsReload;
  $('stable-status').textContent = needsReload ? 'Reload to change the audio buffer too (the rest applies now).' : '';
}
$('stable-mode').addEventListener('change', () => {
  settings.stableMode = $('stable-mode').checked;
  applyLookahead();
  save(true);
  renderStable();
});
$('stable-reload').addEventListener('click', () => { save(true); location.reload(); });
renderStable();

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
bindLog('osc2-attack', 'osc2Attack', 2, 2000, arMs);
bindLog('osc2-release', 'osc2Release', 10, 4000, arMs);
bindRange('volume', 'volume', (v) => `${v}%`, (v) => { synth?.setVolume(v / 100); outVolume(v / 100); });

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
bindRange('arp-level', 'arpLevel', (v) => `${v}%`, applyFaders);
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
bindRange('chord-level', 'chordLevel', (v) => `${v}%`, applyFaders);
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
onRecall(renderChordRhythm)(); // (also for scenes and sections: steps, hits and rotate)

// ---------------------------------------------------------------- UI: progression
const NOTE_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_CLASSES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
/** A slot's root as written: with a flat when it came from a chart that way. */
const rootName = (pc, flat) => (flat ? FLAT_CLASSES : NOTE_CLASSES)[((pc % 12) + 12) % 12];
const CHORD_SUFFIX = Object.fromEntries(Object.entries(CHORDS).map(([t, c]) => [t, c.suffix]));
const slotEls = [];

function slotName(slot) {
  return slot.type === 'rest' ? '—' : rootName(slot.root, slot.flat) + CHORD_SUFFIX[slot.type];
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

/** Slot elements are made as the progression needs them (a tune's chart can use 100+). */
function ensureSlots(n) {
  const wrap = $('prog-slots');
  for (let i = slotEls.length; i < Math.min(n, MAX_PROGRESSION); i++) {
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
}

/** Slots shown: at least the first 8 (past the length, dimmed), else as many as play. */
const slotsShown = () => Math.max(8, settings.progLength);

function buildProgression() {
  ensureSlots(8);
  const len = $('prog-length');
  for (let n = 1; n <= 8; n++) {
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
  // Any length, up to a whole tune.
  const count = $('prog-len-n');
  count.max = String(MAX_PROGRESSION);
  count.addEventListener('change', () => {
    const n = Math.max(1, Math.min(MAX_PROGRESSION, Math.round(Number(count.value)) || 1));
    settings.progLength = n;
    renderProgression();
    progEdited();
  });

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
    settings.progSong = '';
    settings.progStyle = '';
    renderProgression();
    progEdited();
  });

  confirmClick($('prog-clear'), () => {
    settings.progression = settings.progression.map(() => ({ root: 0, type: 'rest', beats: 4, inv: 0, oct: 0 }));
    settings.progLength = 4;
    settings.progSong = '';
    settings.progStyle = '';
    settings.progModEvery = 0;
    $('prog-mod-every').value = '0';
    renderModBy();
    progIndex = -1;
    resetProgression();
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
  const beatsSel = el.querySelector('.beats');
  if (![...beatsSel.options].some((o) => Number(o.value) === slot.beats)) {
    beatsSel.add(new Option(`${slot.beats} beats`, String(slot.beats))); // a held chord from a chart
  }
  beatsSel.value = String(slot.beats);
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
  nameEl.classList.toggle('long', nameEl.textContent.length > 4); // Bbmaj7, C#m7♭5: smaller, so it fits
  // The root menu spelled the same way as the name (Bb, not A#).
  const rootSel = el.querySelector('.root');
  if (rootSel.dataset.flat !== String(!!slot.flat)) {
    rootSel.dataset.flat = String(!!slot.flat);
    [...rootSel.options].forEach((o, pc) => { o.textContent = rootName(pc, slot.flat); });
  }
  if (!rest && bass !== undefined && bass % 12 !== slot.root) {
    const over = document.createElement('small');
    over.className = 'bass';
    over.textContent = `/${rootName(bass, slot.flat)}`; // slash chord: the inversion's bass note
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
  $('prog-len-n').value = String(settings.progLength);
  $('prog-song').textContent = settings.progSong || '';
  const shown = slotsShown();
  ensureSlots(shown);
  const voicings = progVoicings();
  slotEls.forEach((el, i) => {
    el.hidden = i >= shown;
    if (el.hidden) return;
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

// ---- iReal Pro: open an exported playlist (.html) or paste an irealb:// link, then pick a
// song: its changes, once through the form, become the progression.
const IREAL_KEY = 'arp-seq-ireal'; // the last imported list, kept on this device
let irealSongs = [];
function setIrealSongs(songs, from) {
  irealSongs = songs;
  renderIrealList();
  $('ireal-status').textContent = songs.length
    ? `${songs.length} song${songs.length === 1 ? '' : 's'}${from ? ` from ${from}` : ''}. Pick one to load its changes.`
    : 'No iReal Pro songs found there. Use an exported playlist (.html) or an irealb:// link.';
}
function importIreal(text, from) {
  const songs = readSongs(text);
  if (songs.length) {
    try { localStorage.setItem(IREAL_KEY, JSON.stringify({ text: String(text).match(/irealb(?:ook)?:\/\/[^"'<>\s]+/g).join('\n'), from })); } catch { /* too big for storage: kept for this visit */ }
  }
  setIrealSongs(songs, from);
}
function renderIrealList() {
  const list = $('ireal-list');
  list.replaceChildren();
  const q = $('ireal-search').value.trim().toLowerCase();
  const all = [...irealSongs.map((s) => ({ s, example: false })), ...EXAMPLE_SONGS.map((s) => ({ s, example: true }))];
  const hits = all.filter(({ s }) => !q || `${s.title} ${s.composer}`.toLowerCase().includes(q));
  for (const { s, example } of hits.slice(0, 300)) {
    const b = document.createElement('button');
    b.className = 'ireal-song';
    b.innerHTML = '<b></b><small></small>';
    b.querySelector('b').textContent = s.title;
    b.querySelector('small').textContent = [s.composer, s.style, s.key && `in ${s.key.replace('-', 'm')}`, example && 'example'].filter(Boolean).join(' · ');
    b.addEventListener('click', () => loadIrealSong(s));
    list.append(b);
  }
  if (hits.length > 300) list.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: `…and ${hits.length - 300} more: search to narrow it down.` }));
}
function loadIrealSong(song) {
  const { slots } = songSlots(song);
  if (!slots.length) { $('ireal-status').textContent = `Couldn't read any chords in ${song.title}.`; return; }
  const used = slots.slice(0, MAX_PROGRESSION);
  used.forEach((s, i) => {
    // A slash chord whose bass is a chord tone: the inversion that puts it lowest.
    let inv = 0;
    if (s.bass !== null && s.type !== 'rest') {
      const k = CHORDS[s.type].intervals.findIndex((iv) => (s.root + iv) % 12 === s.bass);
      if (k > 0 && k < INVERSIONS.length) inv = k;
    }
    settings.progression[i] = { root: s.root, type: s.type, beats: Math.min(MAX_SLOT_BEATS, s.beats), inv, oct: 0, ...(s.flat ? { flat: true } : {}) };
  });
  settings.progLength = used.length;
  settings.progSong = `${song.title}${song.composer ? ` (${song.composer})` : ''}`;
  settings.progStyle = song.style || '';
  renderBassRate(); // Auto style may now be bossa
  if (song.bpm > 0 && settings.sync === 'internal') setBpm(song.bpm);
  if (!settings.progOn) { settings.progOn = true; progIndex = -1; }
  renderProgression();
  progEdited();
  $('ireal-status').textContent = `Loaded ${song.title}: ${used.length} chord${used.length === 1 ? '' : 's'}`
    + (slots.length > used.length ? ` (the first ${MAX_PROGRESSION} of ${slots.length})` : '')
    + (song.bpm > 0 ? `, at its ${song.bpm} BPM.` : '. Press Play.');
}
function showIrealBox(open) {
  const box = $('ireal-box');
  box.hidden = !open;
  $('ireal-btn').setAttribute('aria-pressed', String(open));
  // While it's open the window is drawn normally: Safari can miss a window growing while
  // it skips off-screen windows (content-visibility).
  $('prog-panel').style.contentVisibility = open ? 'visible' : '';
  if (!open) return;
  renderIrealList();
  // It opens under the button, which may be at the bottom of the screen: bring it into view.
  requestAnimationFrame(() => box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
}
$('ireal-btn').addEventListener('click', () => showIrealBox($('ireal-box').hidden));
$('ireal-open').addEventListener('click', () => $('ireal-file').click());
$('ireal-file').addEventListener('change', async () => {
  const file = $('ireal-file').files[0];
  $('ireal-file').value = '';
  if (file) importIreal(await file.text(), file.name);
});
$('ireal-text').addEventListener('input', () => {
  const text = $('ireal-text').value;
  if (/irealb(ook)?:\/\//.test(text)) { importIreal(text, 'the pasted link'); $('ireal-text').value = ''; }
});
$('ireal-search').addEventListener('input', renderIrealList);
$('ireal-clear').addEventListener('click', () => {
  try { localStorage.removeItem(IREAL_KEY); } catch { /* ignore */ }
  irealSongs = [];
  renderIrealList();
  $('ireal-status').textContent = 'List cleared.';
});
// Drop an exported playlist on the Progression window.
$('prog-panel').addEventListener('dragover', (e) => e.preventDefault());
$('prog-panel').addEventListener('drop', async (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  e.preventDefault();
  showIrealBox(true);
  importIreal(await file.text(), file.name);
});
try {
  const saved = JSON.parse(localStorage.getItem(IREAL_KEY) || 'null');
  if (saved?.text) { irealSongs = readSongs(saved.text); $('ireal-status').textContent = irealSongs.length ? `${irealSongs.length} songs from ${saved.from || 'your last import'}.` : ''; }
} catch { /* storage unavailable */ }
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
  const saved = normalizeRows(state.rows, voices);
  const rows = saved || parsePattern(presets[preset] || {}, voices);
  // A pattern fresh from a preset brings its own conditions and lengths (jazz comping, 3/4).
  const conds = saved ? (state.conds && typeof state.conds === 'object' ? state.conds : {}) : presetConds(presets[preset]);
  const lens = saved ? (state.lens && typeof state.lens === 'object' ? state.lens : {}) : presetLens(presets[preset], voices);
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
  // (with its variation: Evolve and Fill every belong to the slot too)
  return {
    preset: settings.drumPreset, rows: settings.drumRows, conds: settings.drumConds, lens: settings.drumLens,
    evolve: settings.drumEvolve, fill: settings.drumFillEvery,
  };
}

/** A slot's Evolve and Fill every (the edited slot's are live; older slots use those). */
function drumSlotVariation(slot) {
  const s = slot && slot !== settings.drumSlot ? settings.drumSlots[slot] : null;
  return { evolve: s?.evolve ?? settings.drumEvolve, fill: s?.fill ?? settings.drumFillEvery };
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
  if (Number.isFinite(next.evolve)) settings.drumEvolve = next.evolve;
  if (Number.isFinite(next.fill)) settings.drumFillEvery = next.fill;
  $('drum-evolve').value = String(settings.drumEvolve);
  $('drum-evolve-val').textContent = settings.drumEvolve ? `${settings.drumEvolve}%` : 'off';
  $('drum-fill-every').value = String(settings.drumFillEvery);
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
  // The feel goes with the pattern the kit opens on (an edited one keeps the feel in use).
  const opened = kit().presets[settings.drumPreset];
  if (opened) settings.drumFeel = opened.feel || 'straight';
  $('drum-feel').value = settings.drumFeel;
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
  // Feel: straight 16ths (the Swing slider shuffles them), or the jazz triplet swing.
  const feelOk = () => {
    if (!['straight', 'triplet'].includes(settings.drumFeel)) settings.drumFeel = kit().presets[settings.drumPreset]?.feel || kit().feel || 'straight';
  };
  feelOk();
  bindSelect('drum-feel', 'drumFeel', [['straight', 'Straight'], ['triplet', 'Jazz swing']]);
  onRecall(() => { feelOk(); $('drum-feel').value = settings.drumFeel; });
  $('drum-preset').addEventListener('change', () => {
    const preset = $('drum-preset');
    if (preset.value === 'custom') return;
    settings.drumPreset = preset.value;
    settings.drumRows = parsePattern(kit().presets[preset.value], kitVoices());
    // The preset's own chance conditions (jazz comping) and row lengths (a 3/4 waltz), else none.
    settings.drumConds = presetConds(kit().presets[preset.value]);
    settings.drumLens = presetLens(kit().presets[preset.value], kitVoices());
    settings.drumFeel = kit().presets[preset.value].feel || 'straight'; // jazz patterns swing
    $('drum-feel').value = settings.drumFeel;
    loadKitState();
    buildDrumGrid(); // the row-length menus too (a 3/4 preset loops every 12)
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
  bindRange('drum-level', 'drumLevel', (v) => `${v}%`, applyFaders);
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
let trackView = 1; // the tracker track on show: 1 (the break's slices) or 2–4 (samples)

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
  // Points moved by hand, if they were made for this break, trim and slicing.
  const custom = settings.breakCustom;
  if (custom && custom.key === slicingKey() && Array.isArray(custom.points) && custom.points.length === breakPoints.length) {
    breakPoints = custom.points.map((f) => f * breakBuffer.duration);
  } else if (custom && breakBuffer) settings.breakCustom = null; // made for something else: dropped
  $('break-points-reset').hidden = !settings.breakCustom;
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

/** What the slice points depend on: moved points only apply while it's unchanged. */
function slicingKey() {
  const t = settings.breakTrim || { start: 0, end: 1 };
  const how = settings.breakSliceMode === 'transient' ? `t${settings.breakSensitivity}` : `e${settings.breakSlices}`;
  return `${breakName}|${t.start.toFixed(5)}|${t.end.toFixed(5)}|${how}`;
}

function orderedPattern() {
  return keepTracks(inOrder(settings.breakSteps, breakPoints, breakBuffer ? breakBuffer.duration : 1, settings.breakBars * 16), settings.breakPattern);
}

let breakRoll = null; // a roll carrying on through empty rows: {row, span, part}
let breakStutter = null; // Evolve's 8th- or 16th-note roll: {row, every (steps), left (hits still to come), k (steps since it began)}

function playBreakStep(step) {
  const idx = step.stepNumber % settings.breakSteps;
  // For the pads: when each step plays (live hits are written to the nearest one).
  breakStepTimes.push({ time: step.time, idx, dur: step.duration });
  if (breakStepTimes.length > 12) breakStepTimes.shift();
  // Pads: Erase held wipes each row as the playhead reaches it.
  if (padErasing && !songSlot(step.stepNumber)) eraseRow(idx);
  const pattern = breakPatternFor(songSlot(step.stepNumber) || settings.breakSlot);
  const off = settings.breakOff || [];
  const variation = breakSlotVariation(songSlot(step.stepNumber) || settings.breakSlot);
  const evolved = evolveBreakRow(pattern[idx], variation.evolve / 100,
    barRng(runSeed, Math.floor(step.stepNumber / settings.breakSteps), idx + 101),
    off.length ? usableSlices(sliceCount(), off) : sliceCount(),
    { rolls: variation.rolls, reverse: variation.reverse });
  // A row on a switched-off slice counts as empty: whatever was playing carries on.
  const offed = evolved && off.includes(evolved.slice) && evolved.fx !== 'cut' ? { ...evolved, slice: null } : evolved;
  // Its roll and effect, each with its own chance this time round.
  const row = rowThisTime(offed);
  let triggers;
  let rolling = false;
  if (padSkip.has(idx)) {
    // Just recorded from a pad that already sounded: don't play it twice.
    padSkip.delete(idx);
    breakRoll = null;
    breakStutter = null;
    triggers = [];
  } else if (breakStutter) {
    // An 8th- or 16th-note roll from Evolve: the slice again every other step (or every
    // step), ringing on in between; the pattern waits until it's done.
    breakStutter.k += 1;
    if (breakStutter.k % breakStutter.every === 0) {
      triggers = rowTriggers(breakStutter.row, step.duration, Math.random);
      rolling = true;
      breakStutter.left -= 1;
      if (breakStutter.left <= 0) breakStutter = null;
    } else triggers = [];
  } else if (isFilled(row) && (row.eighths > 1 || row.sixteenths > 1) && row.fx !== 'cut') {
    const hits = row.eighths > 1 ? row.eighths : row.sixteenths;
    const plain = { ...row, eighths: 0, sixteenths: 0, roll: 0, chance: 100 };
    triggers = rowTriggers(row.chance < 100 ? { ...plain, chance: row.chance } : plain, step.duration, Math.random);
    breakRoll = null;
    breakStutter = triggers.length ? { row: plain, every: row.eighths > 1 ? 2 : 1, left: hits - 1, k: 0 } : null;
  } else if (isFilled(row)) {
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
  playExtraTracks(pattern, idx, step);
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
        send: tr.send ? throwIn[tr.send] : null,
      });
    }
  }
  uiEvents.push({ kind: 'break', time: step.time, step: idx, slice: shown, change: rolling ? 'roll…' : breakRowChange(pattern[idx], row) });
}

// Tracks 2–4: samples (S1–S8) on a step, each track one channel (a new hit cuts its last),
// with the same chance, rolls (held until the next filled row with Roll until next), and FX.
const trackRolls = []; // per track: a roll carrying on, as breakRoll
function playExtraTracks(pattern, idx, step) {
  for (let k = 0; k < EXTRA_TRACKS; k++) {
    const column = trackColumn(pattern, k + 2);
    const row = rowThisTime(column[idx]);
    let triggers;
    if (isFilled(row)) {
      const span = settings.breakRollHold && row.roll > 0 && row.fx !== 'cut' ? rollSpan(column, idx) : 1;
      triggers = rowTriggers(row, step.duration, Math.random, { span, part: 0 });
      trackRolls[k] = span > 1 && triggers.length ? { row, span, part: 0 } : null;
    } else if (trackRolls[k] && trackRolls[k].part + 1 < trackRolls[k].span) {
      const r = trackRolls[k];
      r.part += 1;
      triggers = rowTriggers(r.row, step.duration, Math.random, { span: r.span, part: r.part });
    } else {
      trackRolls[k] = null;
      triggers = [];
    }
    const player = trackPlayers[k];
    if (!player) continue;
    for (const tr of triggers) {
      if (tr.cut) { player.stop(step.time); continue; }
      const s = trackSamples[tr.slice + 1];
      if (!s?.buffer) continue;
      player.trigger(step.time + tr.at, {
        buffer: s.buffer,
        reversed: s.reversed,
        reverse: tr.reverse,
        rate: Math.pow(2, tr.pitch / 12),
        gain: tr.gain * (trackLevel(tr.slice + 1) / 100),
        send: tr.send ? throwIn[tr.send] : null,
      });
    }
  }
}

// ---- MPC-style pads: play slices live, and record them into the tracker.
const breakStepTimes = []; // recent and upcoming steps: {time, idx, dur}
const padSkip = new Set(); // rows just recorded from a pad (it already sounded): skip once
let padRec = false;
let padErasing = false;
let padBank = 0; // 0: slices 1–16, 1: 17–32
const padUndo = []; // [{idx, row}] to put back
const padEls = [];

/** Play a slice now (a pad, or a note on the Breakbeat's MIDI channel); with Rec on, record it. */
function padHit(slice, vel = 100) {
  if (!breakBuffer || slice < 0 || slice >= breakPoints.length) return;
  ensureAudio();
  const t = ctx.currentTime + 0.003;
  if (breakPlayer && settings.synthOn) {
    breakPlayer.trigger(t, {
      offset: breakPoints[slice],
      duration: (slice + 1 < breakPoints.length ? breakPoints[slice + 1] : breakBuffer.duration) - breakPoints[slice],
      rate: fitRate(breakBuffer.duration, settings.breakBars, currentBpm(), settings.breakPitch, settings.breakFit),
      gain: vel / 127,
    });
  }
  flashPad(slice);
  if (padRec && playing && settings.breakOn) recordPadHit(slice, vel, t);
}

function recordPadHit(slice, vel, t) {
  const dur = breakStepTimes[breakStepTimes.length - 1]?.dur || 60 / currentBpm() / 4;
  const at = nearestStep(t, breakStepTimes, dur);
  // Between known steps (just started): the next step to come.
  const idx = at ? at.idx : null;
  if (idx === null) return;
  padUndo.push({ idx, row: { ...settings.breakPattern[idx] } });
  if (padUndo.length > 128) padUndo.shift();
  writeBreakRow(idx, { slice, vol: Math.round((vel / 127) * 100), roll: 0, fx: '', chance: 100 });
  // If that step hasn't played yet, the pad already did: skip it this time round.
  if (at.time > ctx.currentTime) padSkip.add(idx);
  renderPadButtons();
}

function eraseRow(idx) {
  const r = settings.breakPattern[idx];
  if (!r || (!isFilled(r) && !(r.roll > 0))) return;
  padUndo.push({ idx, row: { ...r } });
  if (padUndo.length > 128) padUndo.shift();
  writeBreakRow(idx, { slice: null, roll: 0, fx: '', chance: 100, vol: 100, pitch: 0 });
  renderPadButtons();
}

/** Change a tracker row and show it (the pads write here). */
function writeBreakRow(idx, patch) {
  editBreakRow(idx, patch);
  const el = trackView === 1 ? breakRowEls[idx] : null; // another track on show: just the data
  if (el) {
    const r = settings.breakPattern[idx];
    const sel = el.querySelector('select');
    if (sel) sel.value = r.slice === null ? '' : String(r.slice);
    const nums = el.querySelectorAll('input[type="number"]');
    if (nums[0]) nums[0].value = r.vol;
    if (nums[3]) nums[3].value = r.roll || 0;
    el.classList.add('just-written');
    setTimeout(() => el.classList.remove('just-written'), 300);
  }
}

function flashPad(slice) {
  const el = padEls[slice - padBank * 16];
  if (!el) return;
  el.classList.remove('hit');
  void el.offsetWidth; // restart the flash
  el.classList.add('hit');
  clearTimeout(el.hitTimer);
  el.hitTimer = setTimeout(() => el.classList.remove('hit'), 160);
}

function buildPads() {
  const grid = $('pad-grid');
  grid.replaceChildren();
  padEls.length = 0;
  const count = breakPoints.length;
  $('pad-bank').hidden = count <= 16;
  $('pad-bank').textContent = padBank ? 'Bank B (17–32)' : 'Bank A (1–16)';
  const order = mpcOrder();
  const els = [];
  for (let n = 0; n < 16; n++) {
    const slice = padBank * 16 + n;
    const b = document.createElement('button');
    b.className = 'mpc-pad'; // (not 'pad': Chord Rhythm's window uses that class in Pad mode)
    b.disabled = slice >= count;
    b.dataset.slice = slice;
    b.innerHTML = `<span class="pad-n">${slice + 1}</span><span class="pad-key">${'1234QWERASDFZXCV'[order.indexOf(n)]}</span>`;
    b.setAttribute('aria-label', `Pad ${n + 1}: slice ${slice + 1}`);
    b.classList.toggle('off', (settings.breakOff || []).includes(slice));
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); padHit(slice, 110); });
    els[n] = b;
    padEls[n] = b;
  }
  for (const n of order) grid.append(els[n]); // pad 1 bottom-left, 16 top-right
  renderPadButtons();
}

function renderPadButtons() {
  $('pad-rec').setAttribute('aria-pressed', String(padRec));
  $('pad-undo').disabled = !padUndo.length;
  $('pad-undo').textContent = padUndo.length ? `Undo (${padUndo.length})` : 'Undo';
  $('pads').classList.toggle('recording', padRec);
}

function openPads(open) {
  $('pads').hidden = !open;
  if (open) buildPads();
  else { padRec = false; padErasing = false; $('pad-erase').classList.remove('held'); }
  renderPadButtons();
}

$('break-pads').addEventListener('click', () => openPads(true));
$('pad-close').addEventListener('click', () => openPads(false));
$('pads').addEventListener('pointerdown', (e) => { if (e.target === $('pads')) openPads(false); }); // tap outside
$('pad-rec').addEventListener('click', () => {
  padRec = !padRec;
  if (padRec) {
    // Recording needs the break running: start it (and the transport) if needed.
    ensureAudio();
    if (!settings.breakOn) { settings.breakOn = true; renderBreakPanel(); save(); }
    if (!playing && settings.sync === 'internal') setPlaying(true);
  }
  renderPadButtons();
});
// Erase: held (pointer, or the Delete/Backspace key) wipes rows as the playhead passes.
const eraseOn = (e) => { e?.preventDefault?.(); padErasing = true; $('pad-erase').classList.add('held'); };
const eraseOff = () => { padErasing = false; $('pad-erase').classList.remove('held'); renderPadButtons(); };
$('pad-erase').addEventListener('pointerdown', eraseOn);
for (const type of ['pointerup', 'pointerleave', 'pointercancel']) $('pad-erase').addEventListener(type, eraseOff);
$('pad-undo').addEventListener('click', () => {
  const last = padUndo.pop();
  if (last) writeBreakRow(last.idx, last.row);
  renderPadButtons();
});
$('pad-bank').addEventListener('click', () => { padBank = padBank ? 0 : 1; buildPads(); });
// Keys while the pads are open: MPC layout (1234 / QWER / ASDF / ZXCV), Delete held = Erase.
window.addEventListener('keydown', (e) => {
  if ($('pads').hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape') { openPads(false); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { if (!e.repeat) eraseOn(e); e.stopImmediatePropagation(); return; }
  const k = '1234qwerasdfzxcv'.indexOf(e.key.toLowerCase());
  if (k < 0) return;
  e.preventDefault();
  e.stopImmediatePropagation(); // not the main keyboard's notes
  if (!e.repeat) padHit(padBank * 16 + mpcOrder()[k], 110);
}, true);
window.addEventListener('keyup', (e) => { if (!$('pads').hidden && (e.key === 'Delete' || e.key === 'Backspace')) eraseOff(); }, true);
// The pattern playing a slice lights its pad too.
function showPadPlaying(slice) { if (!$('pads').hidden && slice !== null && slice !== undefined) flashPad(slice); }

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

// ---- trim controls: Start/End sliders over an overview of the whole file, and a
// close-up around one edge for fine work.
let trimTimer = null;
let trimEdge = 'start'; // the edge the zoom shows (and the nudge buttons move)
const TRIM_ZOOM = 0.2; // seconds either side of the edge in the close-up
/** Slider steps: one per millisecond of the file. */
const trimSteps = () => Math.max(1000, Math.round((breakSource?.duration || 1) * 1000));
function renderTrim() {
  const t = settings.breakTrim || { start: 0, end: 1 };
  const steps = trimSteps();
  for (const id of ['break-trim-start', 'break-trim-end']) $(id).max = String(steps);
  $('break-trim-start').value = String(Math.round(t.start * steps));
  $('break-trim-end').value = String(Math.round(t.end * steps));
  const dur = breakSource ? breakSource.duration : 0;
  $('break-trim-start-val').textContent = `${(t.start * dur).toFixed(3)} s`;
  $('break-trim-end-val').textContent = `${(t.end * dur).toFixed(3)} s`;
  $('break-trim-reset').disabled = t.start <= 0 && t.end >= 1;
  $('trim-zoom-edge').querySelectorAll('button').forEach((b) => {
    const on = b.dataset.edge === trimEdge;
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-checked', String(on));
  });
  $('trim-zoom-at').textContent = breakSource ? `${trimEdge === 'start' ? 'Start' : 'End'} at ${(t[trimEdge] * dur).toFixed(3)} s` : '';
  drawTrimOverview();
  drawTrimZoom();
}

/** The close-up: ±0.2 s of the file around the chosen edge, at full detail. */
function drawTrimZoom() {
  const canvas = $('break-trim-zoom');
  if (!canvas.clientWidth) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.min(canvas.parentElement.clientWidth || 0, canvas.clientWidth || Infinity);
  const h = canvas.clientHeight || 52;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(canvas);
  const ink = css.getPropertyValue('--ink').trim() || '#000';
  const mod = css.getPropertyValue('--mod').trim() || ink;
  g.fillStyle = css.getPropertyValue('--field').trim() || '#fff';
  g.fillRect(0, 0, w, h);
  if (!breakSource) return;
  const t = settings.breakTrim || { start: 0, end: 1 };
  const data = breakSource.getChannelData(0);
  const rate = breakSource.sampleRate;
  const centre = t[trimEdge] * data.length;
  const half = TRIM_ZOOM * rate;
  const from = centre - half;
  const per = (2 * half) / w; // samples per pixel
  const mid = h / 2;
  const max = trimPeaks.max || 1;
  const keepFrom = t.start * data.length;
  const keepTo = t.end * data.length;
  for (let x = 0; x < w; x++) {
    const a = Math.floor(from + x * per);
    const b = Math.floor(from + (x + 1) * per);
    if (b <= 0 || a >= data.length) continue;
    let lo = 0;
    let hi = 0;
    for (let i = Math.max(0, a); i < Math.min(data.length, Math.max(b, a + 1)); i++) { const v = data[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    g.globalAlpha = a >= keepFrom && a <= keepTo ? 1 : 0.25; // the cut-off part faint
    g.fillStyle = ink;
    g.fillRect(x, mid - (hi / max) * (mid - 3), 1, Math.max(1, ((hi - lo) / max) * (mid - 3)));
  }
  g.globalAlpha = 1;
  g.fillStyle = mod;
  g.fillRect(Math.round(w / 2) - 1, 0, 2, h); // the edge
  // Ticks every 50 ms.
  g.globalAlpha = 0.5;
  g.fillStyle = ink;
  for (let ms = -200; ms <= 200; ms += 50) {
    if (!ms) continue;
    const x = Math.round(w / 2 + (ms / 1000) * rate / per);
    g.fillRect(x, h - 5, 1, 5);
  }
  g.globalAlpha = 1;
}

let trimPeaks = { buffer: null, cols: 0, pk: null, max: 1 };
function drawTrimOverview() {
  const canvas = $('break-trim-view');
  if (!canvas.clientWidth) return;
  const dpr = window.devicePixelRatio || 1;
  // Size from the space around the canvas, never from the canvas itself (which could feed back).
  const w = Math.min(canvas.parentElement.clientWidth || 0, canvas.clientWidth || Infinity);
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
  trimEdge = 'start';
  setTrim(Number($('break-trim-start').value) / trimSteps(), settings.breakTrim.end);
});
$('break-trim-end').addEventListener('input', () => {
  trimEdge = 'end';
  setTrim(settings.breakTrim.start, Number($('break-trim-end').value) / trimSteps());
});

/** Move one edge to `pos` (a fraction of the file). */
const moveEdge = (edge, pos) => setTrim(edge === 'start' ? pos : settings.breakTrim.start, edge === 'end' ? pos : settings.breakTrim.end);

/**
 * Scrubbing: the edge follows the finger's movement, not its position, and the further the
 * finger slides up or down away from the strip, the slower (like scrubbing on an iPhone):
 * full speed on it, half at ~50 px away, a quarter at ~100, an eighth from ~150. Shift
 * gives a tenth on a computer.
 */
function scrubber(view, { span, pickEdge }) {
  let drag = null;
  view.addEventListener('pointerdown', (e) => {
    if (!breakSource) return;
    const r = view.getBoundingClientRect();
    const edge = pickEdge((e.clientX - r.left) / r.width);
    trimEdge = edge;
    drag = { edge, x: e.clientX, pos: settings.breakTrim[edge] };
    view.setPointerCapture(e.pointerId);
    renderTrim();
  });
  view.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = view.getBoundingClientRect();
    const away = Math.max(0, e.clientY < r.top ? r.top - e.clientY : e.clientY - r.bottom);
    const fine = (e.shiftKey ? 0.1 : 1) / Math.pow(2, Math.min(3, Math.floor(away / 50)));
    // Each pixel of movement: the strip's span over its width, slowed by `fine`.
    const pos = drag.pos + ((e.clientX - drag.x) / r.width) * span() * fine;
    // Re-anchor so a change of speed doesn't jump.
    drag.x = e.clientX;
    drag.pos = Math.min(1, Math.max(0, pos));
    moveEdge(drag.edge, drag.pos);
  });
  const up = () => { drag = null; };
  view.addEventListener('pointerup', up);
  view.addEventListener('pointercancel', up);
}
// The overview: the whole file; drags the nearer edge.
scrubber($('break-trim-view'), {
  span: () => 1,
  pickEdge: (x) => (Math.abs(x - settings.breakTrim.start) <= Math.abs(x - settings.breakTrim.end) ? 'start' : 'end'),
});
// The close-up: ±0.2 s across its width, so the same drag is far finer.
scrubber($('break-trim-zoom'), {
  span: () => (breakSource ? (2 * TRIM_ZOOM) / breakSource.duration : 0),
  pickEdge: () => trimEdge,
});
$('trim-zoom-edge').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { trimEdge = b.dataset.edge; renderTrim(); }));
// Nudge: 1 ms a tap; held, it keeps going (faster after a moment).
for (const [id, dir] of [['trim-nudge-back', -1], ['trim-nudge-fwd', 1]]) {
  const btn = $(id);
  let timer = null;
  let count = 0;
  const nudge = () => {
    if (!breakSource) return;
    const ms = count++ > 15 ? 5 : 1;
    moveEdge(trimEdge, Math.min(1, Math.max(0, settings.breakTrim[trimEdge] + (dir * ms) / 1000 / breakSource.duration)));
  };
  const stop = () => { clearInterval(timer); timer = null; };
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); count = 0; nudge(); stop(); timer = setInterval(nudge, 70); });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(type, stop);
  btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); count = 0; nudge(); } });
}
$('break-trim-reset').addEventListener('click', () => setTrim(0, 1));

// The tracker's steps fold away (the pattern plays on; the waveform still shows the slice).
function renderBreakStepsFold() {
  const open = settings.breakStepsOpen !== false;
  $('break-rows').hidden = !open;
  const btn = $('break-steps-toggle');
  btn.setAttribute('aria-expanded', String(open));
  btn.textContent = `Steps (${settings.breakSteps})${open ? '' : ': hidden'}`;
}
$('break-steps-toggle').addEventListener('click', () => {
  settings.breakStepsOpen = settings.breakStepsOpen === false;
  renderBreakStepsFold();
  save();
});
renderBreakStepsFold();

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

// ---------------------------------------------------------------- Recorder
// Takes from this app's output, a microphone/input, or another tab/the system. The audio
// thread hands over raw blocks with their start frame (recorder.js); the take is cut to
// exact times: free (from the press to Stop) or bar-synced (from a bar line, N bars long).
let recWorkletReady = null;
let rec = null; // the recording in progress
let take = null; // {chans, sampleRate, name, bars} — the last finished take
const REC_MAX_SECONDS = 120;

function recStatus(text, error = false) {
  $('rec-status').textContent = text;
  $('rec-status').classList.toggle('error', error);
}

/** The microphone (or chosen input), as cleanly as the browser allows. */
async function openMic(clean) {
  if (!navigator.mediaDevices?.getUserMedia) {
    const e = new Error('This browser can\'t record from a microphone on this page.');
    e.name = 'Unsupported';
    throw e;
  }
  setAudioSession('play-and-record');
  const id = $('rec-device').value;
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: id ? { ...clean, deviceId: { exact: id } } : clean });
  } catch (e) {
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw e;
    // Some browsers balk at the details (an exact input, stereo, processing off): the plainest request.
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }
}

/** What went wrong opening the microphone, and what to do about it. */
function micProblem(e) {
  switch (e?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'The microphone isn\'t allowed for this page. On an iPhone: tap aA in the address bar, then Website Settings, '
        + 'Microphone, Allow (or Settings, Apps, Safari, Microphone). On a computer: the camera/microphone icon in the address bar. Then try again.';
    case 'NotFoundError': return 'No microphone was found.';
    case 'NotReadableError':
    case 'AbortError': return 'The microphone is busy: another app (or a call) may be using it. Close that and try again.';
    case 'OverconstrainedError': return 'That input isn\'t available: choose Default in Input.';
    case 'Unsupported': return e.message;
    default: return `Couldn't open the microphone (${e?.name || 'error'}${e?.message ? `: ${e.message}` : ''}).`;
  }
}

async function recSourceNode(kind) {
  if (kind === 'app') {
    // Everything the app plays: the mix (after its compressor), or every separate pair.
    const tap = ctx.createGain();
    synth.out.connect(tap);
    if (outRouter) for (const g of outRouter.gains.values()) g.connect(tap);
    return { node: tap, stop: () => { try { synth.out.disconnect(tap); } catch { /* gone */ } if (outRouter) for (const g of outRouter.gains.values()) { try { g.disconnect(tap); } catch { /* gone */ } } } };
  }
  const clean = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 };
  let stream;
  if (kind === 'mic') {
    stream = await openMic(clean);
    listRecInputs(); // names show once allowed
  } else {
    // Screen sharing is the only way a page can hear another tab or the system; the video is dropped.
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: clean, systemAudio: 'include' });
    stream.getVideoTracks().forEach((t) => t.stop());
    if (!stream.getAudioTracks().length) throw new Error('noaudio');
  }
  const src = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
  return { node: src, stream, stop: () => stream.getTracks().forEach((t) => t.stop()) };
}

async function startRecording() {
  ensureAudio();
  if (!ctx.audioWorklet) { recStatus('Recording needs a browser with AudioWorklet (Chrome, Edge, Safari, Firefox).', true); return; }
  recWorkletReady ??= ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([RECORDER_WORKLET], { type: 'text/javascript' })));
  const kind = $('rec-source').value;
  const bars = Number($('rec-length').value) || 0;
  let source;
  try {
    // The microphone (or sharing) first, straight from the tap: browsers are stricter when it's asked later.
    source = await recSourceNode(kind);
    await recWorkletReady;
  } catch (e) {
    source?.stop();
    if (kind === 'mic') setAudioSession('playback');
    recStatus(e.message === 'noaudio'
      ? 'Nothing to record: tick "Share audio" (or "Share system audio") in the browser\'s sharing window.'
      : kind === 'mic' ? micProblem(e) : `Sharing was cancelled (or this browser can't share audio)${e?.name && e.name !== 'NotAllowedError' ? ` (${e.name})` : ''}.`, true);
    return;
  }
  const node = new AudioWorkletNode(ctx, 'take-recorder', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
  const mute = ctx.createGain();
  mute.gain.value = 0; // (connected so the audio thread keeps pulling it; heard nowhere)
  source.node.connect(node).connect(mute).connect(ctx.destination);
  // An input arrives late by its latency: a bar-synced take from one is shifted to match.
  const track = source.stream?.getAudioTracks()[0];
  const late = kind === 'app' ? 0 : (track?.getSettings?.().latency || 0) + (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
  rec = { kind, bars, source, node, mute, blocks: [], late, peak: 0, began: ctx.currentTime, start: null, end: null };
  node.port.onmessage = (e) => {
    if (!rec) return;
    rec.blocks.push(e.data);
    rec.peak = Math.max(rec.peak * 0.85, peakOf(e.data.ch));
    // Keep memory in check: blocks from before a bar-synced start aren't needed.
    if (rec.start === null && rec.bars && rec.blocks.length > 64) rec.blocks.shift();
  };
  $('rec-go').setAttribute('aria-pressed', 'true');
  $('rec-go').textContent = '■ Stop';
  if (bars) {
    rec.armed = true;
    if (!playing && settings.sync === 'internal') setPlaying(true);
    recStatus(`Recording ${bars} bar${bars > 1 ? 's' : ''} from the next bar line…`);
  } else {
    rec.start = ctx.currentTime;
    recStatus('Recording… press Stop when done.');
  }
  requestAnimationFrame(recTick);
}

/** The clock: a bar-synced take starts on a bar line and ends exactly `bars` later. */
function recPulse(time, pulse, pulseDuration) {
  if (!rec?.armed || pulse % (PPQN * 4)) return;
  rec.armed = false;
  rec.start = time + rec.late;
  rec.end = rec.start + rec.bars * PPQN * 4 * pulseDuration;
}

function recTick() {
  if (!rec) return;
  const fill = Math.min(1, Math.max(0, (20 * Math.log10(Math.max(rec.peak, 1e-5)) + 60) / 60));
  $('rec-meter-fill').style.width = `${fill * 100}%`;
  const now = ctx.currentTime;
  if (rec.start !== null && now >= rec.start) {
    const secs = now - rec.start;
    recStatus(rec.end ? `Recording… bar ${Math.min(rec.bars, Math.floor(secs / ((rec.end - rec.start) / rec.bars)) + 1)} of ${rec.bars}` : `Recording… ${secs.toFixed(1)} s`);
  }
  // Done: a bar-synced take once its end (and a little after, for the last block) has passed.
  if ((rec.end && now > rec.end + 0.15) || now - rec.began > REC_MAX_SECONDS) { finishRecording(); return; }
  requestAnimationFrame(recTick);
}

function finishRecording(cancel = false) {
  if (!rec) return;
  const r = rec;
  rec = null;
  try { r.node.port.onmessage = null; r.node.disconnect(); r.mute.disconnect(); } catch { /* gone */ }
  r.source.stop();
  if (r.kind === 'mic') setAudioSession('playback'); // back to a playback session (survives the screen locking)
  $('rec-go').setAttribute('aria-pressed', 'false');
  $('rec-go').textContent = '● Record';
  $('rec-meter-fill').style.width = '0';
  if (cancel || r.start === null) { recStatus(r.start === null ? 'Stopped before it started.' : ''); return; }
  const sr = ctx.sampleRate;
  const endTime = r.end ?? ctx.currentTime;
  let chans = framesBetween(r.blocks, Math.round(r.start * sr), Math.round(endTime * sr));
  if (!r.end && $('rec-trim').checked) {
    const [a, z] = soundSpan(chans, sr);
    if (z > a) chans = chans.map((c) => c.slice(a, z));
  }
  if (!chans[0].length || peakOf(chans) < 1e-4) { recStatus('That take was silent.', true); return; }
  const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
  take = { chans, sampleRate: sr, trim: { start: 0, end: 1 }, bars: r.end ? r.bars : 0, name: `Recording ${stamp}${r.end ? ` (${r.bars} bar${r.bars > 1 ? 's' : ''})` : ''}.wav` };
  $('rec-take').hidden = false;
  drawTake();
  recStatus(`${take.name}: ${(chans[0].length / sr).toFixed(2)} s.`);
  renderTakeTrim();
}

function drawTake() {
  const canvas = $('rec-wave');
  if (!take || !canvas.clientWidth) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.min(canvas.parentElement.clientWidth || 0, canvas.clientWidth);
  const h = canvas.clientHeight || 56;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(canvas);
  g.fillStyle = css.getPropertyValue('--field').trim() || '#fff';
  g.fillRect(0, 0, w, h);
  const ink = css.getPropertyValue('--ink').trim() || '#000';
  const mod = css.getPropertyValue('--mod').trim() || ink;
  const pk = peaks(take.chans[0], Math.floor(w));
  const max = Math.max(1e-3, ...pk.map(([lo, hi]) => Math.max(-lo, hi)));
  const x0 = take.trim.start * w;
  const x1 = take.trim.end * w;
  g.fillStyle = ink;
  pk.forEach(([lo, hi], x) => {
    g.globalAlpha = x >= x0 && x <= x1 ? 1 : 0.25; // the cut-off parts faint
    g.fillRect(x, h / 2 - (hi / max) * (h / 2 - 2), 1, Math.max(1, ((hi - lo) / max) * (h / 2 - 2)));
  });
  g.globalAlpha = 1;
  g.fillStyle = mod;
  g.fillRect(Math.round(x0), 0, 2, h);
  g.fillRect(Math.round(x1) - 2, 0, 2, h);
}

/** The take as trimmed (with tiny fades at the cuts, so they don't click). */
function trimmedTake() {
  const len = take.chans[0].length;
  const a = Math.floor(take.trim.start * len);
  const z = Math.max(a + 1, Math.ceil(take.trim.end * len));
  const whole = a === 0 && z >= len;
  return take.chans.map((c) => {
    const out = c.slice(a, z);
    if (!whole) fadeEdges(out, Math.round(take.sampleRate * 0.003));
    return out;
  });
}
function renderTakeTrim() {
  if (!take) return;
  const dur = take.chans[0].length / take.sampleRate;
  const { start, end } = take.trim;
  $('rec-trim-at').textContent = `${(start * dur).toFixed(3)} s to ${(end * dur).toFixed(3)} s (${((end - start) * dur).toFixed(3)} s)`;
  $('rec-trim-reset').disabled = start <= 0 && end >= 1;
  drawTake();
}
// Drag near either edge of the take's waveform to trim it.
{
  const view = $('rec-wave');
  let edge = null;
  const at = (e) => { const r = view.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
  view.addEventListener('pointerdown', (e) => {
    if (!take) return;
    const x = at(e);
    edge = Math.abs(x - take.trim.start) <= Math.abs(x - take.trim.end) ? 'start' : 'end';
    view.setPointerCapture(e.pointerId);
  });
  view.addEventListener('pointermove', (e) => {
    if (!edge || !take) return;
    const x = at(e);
    const min = 0.005 / (take.chans[0].length / take.sampleRate); // at least 5 ms
    if (edge === 'start') take.trim.start = Math.min(x, take.trim.end - min);
    else take.trim.end = Math.max(x, take.trim.start + min);
    renderTakeTrim();
  });
  const up = () => { edge = null; };
  view.addEventListener('pointerup', up);
  view.addEventListener('pointercancel', up);
}
$('rec-trim-sound').addEventListener('click', () => {
  if (!take) return;
  const len = take.chans[0].length;
  const [a, z] = soundSpan(take.chans, take.sampleRate);
  if (z > a) take.trim = { start: a / len, end: z / len };
  else recStatus('No sound loud enough to trim to (it\'s all below -50 dB).', true);
  renderTakeTrim();
});
$('rec-trim-reset').addEventListener('click', () => { if (take) { take.trim = { start: 0, end: 1 }; renderTakeTrim(); } });

const takeTrimmed = () => take && (take.trim.start > 0 || take.trim.end < 1);
const takeFile = () => new File([encodeWav(trimmedTake(), take.sampleRate)], take.name, { type: 'audio/wav' });

$('rec-go').addEventListener('click', () => { if (rec) finishRecording(); else startRecording(); });
$('rec-source').addEventListener('change', () => { $('rec-device-field').hidden = $('rec-source').value !== 'mic'; if ($('rec-source').value === 'mic') listRecInputs(); });
async function listRecInputs() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const sel = $('rec-device');
  const keep = sel.value;
  const ins = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default');
  sel.replaceChildren(new Option('Default', ''));
  ins.forEach((d, i) => sel.add(new Option(d.label || `Input ${i + 1}`, d.deviceId)));
  sel.value = [...sel.options].some((o) => o.value === keep) ? keep : '';
}
$('rec-play').addEventListener('click', () => {
  if (!take) return;
  ensureAudio();
  const chans = trimmedTake();
  const buf = new AudioBuffer({ length: chans[0].length, numberOfChannels: chans.length, sampleRate: take.sampleRate });
  chans.forEach((c, i) => buf.copyToChannel(c, i));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(synth.master);
  src.start();
});
$('rec-to-break').addEventListener('click', async () => {
  if (!take) return;
  // A bar-synced take is exactly its bars long, unless it's been trimmed since.
  if (take.bars && !takeTrimmed()) { settings.breakBars = take.bars; $('break-bars').value = String(take.bars); }
  await loadBreakFile(takeFile());
  recStatus(`${take.name} is now the Breakbeat's break.`);
});
for (const v of KITS.user.voices) $('rec-row').add(new Option(v.label, v.id));
$('rec-to-row').addEventListener('click', async () => {
  if (!take) return;
  if (settings.drumKit !== 'user') { switchKit('user'); $('drum-kit').value = 'user'; }
  await addSampleFiles([takeFile()], $('rec-row').value);
  recStatus(`${take.name} is on the ${$('rec-row').selectedOptions[0].textContent} row of Your samples.`);
});
$('rec-download').addEventListener('click', () => {
  if (!take) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(takeFile());
  a.download = take.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});
// ---- The Breakbeat's sample track: one-shots S1–S8 the tracker's Smp column fires on a step.
const trackSamples = {}; // slot (1–8) -> {name, data, buffer}
const trackVoices = {}; // slot -> the source playing, so a new hit cuts it off (a choke, as on a drum machine)
if (!settings.trackLevels || typeof settings.trackLevels !== 'object') settings.trackLevels = {};
const trackLevel = (n) => settings.trackLevels[n] ?? 100;

/** Decode without needing the sound started (so the names and lengths are there at once). */
async function decodeTrackSample(data) {
  const off = new OfflineAudioContext(1, 1, 44100);
  return off.decodeAudioData(data.slice(0));
}
async function setTrackSample(n, name, data) {
  let buffer;
  try { buffer = await decodeTrackSample(data); } catch { return false; }
  trackSamples[n] = { name, data, buffer, reversed: reverseBuffer(buffer) };
  try { await saveTrackSample(String(n), { name, data }); } catch { /* storage unavailable: kept for this visit */ }
  renderTrackSamples();
  buildBreakRows(); // the Smp menus show the names
  return true;
}
function playTrackSample(n, time, gain = 1) {
  const s = trackSamples[n];
  if (!s?.buffer || !ctx || !buses.break) return;
  trackVoices[n]?.stop(time);
  const src = ctx.createBufferSource();
  src.buffer = s.buffer;
  const g = ctx.createGain();
  g.gain.value = (trackLevel(n) / 100) * gain;
  src.connect(g).connect(buses.break);
  src.start(Math.max(time, ctx.currentTime));
  trackVoices[n] = src;
}
function renderTrackSamples() {
  const sel = $('track-slot');
  const keep = sel.value || '1';
  sel.replaceChildren();
  for (let n = 1; n <= TRACK_SAMPLES; n++) sel.add(new Option(`S${n}: ${trackSamples[n]?.name.replace(/\.[a-z0-9]+$/i, '') || 'empty'}`, String(n)));
  sel.value = keep;
  const n = Number(sel.value);
  $('track-level').value = String(trackLevel(n));
  $('track-level-val').textContent = `${trackLevel(n)}%`;
  $('track-play').disabled = !trackSamples[n];
  $('track-clear').disabled = !trackSamples[n];
  const rt = $('rec-track');
  const keepRt = rt.value || '1';
  rt.replaceChildren();
  for (let k = 1; k <= TRACK_SAMPLES; k++) rt.add(new Option(`S${k}${trackSamples[k] ? ` (${trackSamples[k].name.replace(/\.[a-z0-9]+$/i, '').slice(0, 14)})` : ''}`, String(k)));
  rt.value = keepRt;
}
$('track-slot').addEventListener('change', renderTrackSamples);
$('track-level').addEventListener('input', () => {
  settings.trackLevels[Number($('track-slot').value)] = Number($('track-level').value);
  $('track-level-val').textContent = `${$('track-level').value}%`;
  save();
});
$('track-play').addEventListener('click', () => { ensureAudio(); playTrackSample(Number($('track-slot').value), ctx.currentTime + 0.01); });
$('track-load').addEventListener('click', () => $('track-file').click());
$('track-file').addEventListener('change', async () => {
  const f = $('track-file').files[0];
  $('track-file').value = '';
  if (!f) return;
  const ok = await setTrackSample(Number($('track-slot').value), f.name, await f.arrayBuffer());
  updateBreakStatus(ok ? '' : `Couldn't read ${f.name} (try WAV).`);
});
$('track-clear').addEventListener('click', async () => {
  const n = Number($('track-slot').value);
  delete trackSamples[n];
  try { await deleteTrackSample(String(n)); } catch { /* nothing stored */ }
  renderTrackSamples();
  buildBreakRows();
});
$('rec-to-track').addEventListener('click', async () => {
  if (!take) return;
  const n = Number($('rec-track').value);
  const ok = await setTrackSample(n, take.name, await takeFile().arrayBuffer());
  $('track-slot').value = String(n);
  renderTrackSamples();
  recStatus(ok ? `${take.name} is sample S${n} in the Breakbeat: pick it on Tracks 2–4 of the tracker.` : 'Couldn\'t use that take.', !ok);
});
renderTrackSamples();
loadTrackSamples().then(async (stored) => {
  for (const [k, entry] of Object.entries(stored)) {
    try {
      const buffer = await decodeTrackSample(entry.data);
      trackSamples[Number(k)] = { ...entry, buffer, reversed: reverseBuffer(buffer) };
    } catch { /* unreadable: skipped */ }
  }
  renderTrackSamples();
  buildBreakRows();
});

$('rec-discard').addEventListener('click', () => { take = null; $('rec-take').hidden = true; recStatus(''); });

let breakPeaks = { buffer: null, cols: 0, pk: null, max: 1 };
function drawBreak() {
  const canvas = $('break-wave');
  if (!canvas.clientWidth) return; // folded or hidden: nothing to draw (redrawn when reopened)
  const dpr = window.devicePixelRatio || 1;
  // Size from the space around the canvas, never from the canvas itself (which could feed back).
  const w = Math.max(200, Math.min(canvas.parentElement.clientWidth || 0, canvas.clientWidth || Infinity));
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
  if (!breakBuffer) { showBreakNow(); return; }
  const dur = breakBuffer.duration;
  const xOf = (t) => (t / dur) * w;
  const span = (k) => [xOf(breakPoints[k]), xOf(k + 1 < breakPoints.length ? breakPoints[k + 1] : dur)];
  // Highlight the slice on the selected row and the slice playing now.
  const sel = settings.breakPattern[breakSelected]?.slice;
  for (const [slice, alpha] of [[sel, 0.12]]) {
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
    if (k > 0) {
      // A handle at the foot of each line you can drag.
      g.fillStyle = mod;
      g.beginPath();
      g.moveTo(x - 4, h);
      g.lineTo(x + 4, h);
      g.lineTo(x, h - 6);
      g.fill();
    }
    const [x0, x1] = span(k);
    if (x1 - x0 > 12) { g.fillStyle = mod; g.fillText(String(k + 1), x + 3, 11); }
  });  breakNowShown = ''; // the slices may have moved
  showBreakNow();
}

/** The slice playing now: a box over the waveform, so the waveform needn't be redrawn every step. */
let breakNowShown = '';
function showBreakNow() {
  const box = $('break-now');
  const k = breakNowSlice;
  const ok = breakBuffer && k !== null && k !== undefined && k < breakPoints.length;
  const dur = ok ? breakBuffer.duration : 1;
  const t0 = ok ? breakPoints[k] / dur : 0;
  const t1 = ok ? (k + 1 < breakPoints.length ? breakPoints[k + 1] : breakBuffer.duration) / dur : 0;
  const key = ok ? `${t0}|${t1}` : '';
  if (key === breakNowShown) return;
  breakNowShown = key;
  box.hidden = !ok;
  if (!ok) return;
  // Inside the canvas's 1.5px border.
  box.style.left = `calc(1.5px + (100% - 3px) * ${t0})`;
  box.style.width = `calc((100% - 3px) * ${t1 - t0})`;
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
  const sampleTrack = trackView > 1;
  const rows = trackColumn(settings.breakPattern, trackView);
  wrap.classList.toggle('sample-track', sampleTrack);
  head.innerHTML = `<span>Step</span><span${sampleTrack ? ' title="The sample (S1–S8, loaded in Samples above or from the Recorder)"' : ''}>${sampleTrack ? 'Sample' : 'Slice'}</span><span>Vol</span><span>Pitch</span>`
    + '<span title="Chance: 0–100% that the step plays">C %</span>'
    + '<span title="Roll: retriggers per 16th step. 1 = 16ths, 2 = 32nds, 4 = 64ths (0 = off). With Roll until next it carries on through the empty rows.">R</span>'
    + '<span title="Roll chance: 0–100% that the roll happens (otherwise a single hit)">R %</span><span>Roll type</span>'
    + '<span title="FX: Dly / Rvb / Hrm throw the step into the Delay, Reverb or Harmonizer (at full send, on top of the section\'s own send); Rev plays it backwards; Cut stops the sound">FX</span>'
    + '<span title="FX chance: 0–100% that the effect happens (otherwise the step plays as normal)">FX %</span>';
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
  // Edits go to the track on show.
  const edit = (i, patch) => (sampleTrack ? editTrackCell(i, trackView, patch) : editBreakRow(i, patch));
  rows.forEach((row, i) => {
    if (settings.breakSteps > 16 && i === half) wrap.append(head.cloneNode(true)); // the second column's header
    const el = document.createElement('div');
    el.className = `trow${i % 4 === 0 ? ' beat' : ''}`;
    const num = document.createElement('button');
    num.className = 'tstep';
    num.textContent = String(i + 1).padStart(2, '0');
    num.title = sampleTrack ? 'Select this row' : 'Select this row: then click a slice in the waveform to put it here';
    num.addEventListener('click', () => selectBreakRow(i));
    const slice = document.createElement('select');
    slice.setAttribute('aria-label', `Step ${i + 1} ${sampleTrack ? 'sample' : 'slice'}`);
    slice.add(new Option('—', ''));
    if (sampleTrack) {
      for (let s = 0; s < TRACK_SAMPLES; s++) {
        const o = new Option(`S${s + 1}`, String(s));
        o.title = trackSamples[s + 1]?.name || 'empty';
        slice.add(o);
      }
      slice.value = row.slice === null ? '' : String(row.slice);
    } else {
      for (let s = 0; s < count; s++) slice.add(new Option(String(s + 1), String(s)));
      slice.value = row.slice === null ? '' : String(Math.min(row.slice, count - 1));
    }
    slice.addEventListener('change', () => edit(i, { slice: slice.value === '' ? null : Number(slice.value) }));
    const vol = number(row.vol, 0, 100, 5, `Step ${i + 1} volume`, (v) => edit(i, { vol: v }));
    const pitch = number(row.pitch, -12, 12, 1, `Step ${i + 1} pitch`, (v) => edit(i, { pitch: v }));
    const chance = number(row.chance, 0, 100, 5, `Step ${i + 1} chance`, (v) => edit(i, { chance: v }));
    const roll = number(row.roll, 0, MAX_ROLL, 1, `Step ${i + 1} roll`, (v) => edit(i, { roll: v }));
    const rollChance = number(row.rollChance ?? 100, 0, 100, 5, `Step ${i + 1} roll chance`, (v) => edit(i, { rollChance: v }));
    const fxChance = number(row.fxChance ?? 100, 0, 100, 5, `Step ${i + 1} effect chance`, (v) => edit(i, { fxChance: v }));
    const rollType = document.createElement('select');
    rollType.setAttribute('aria-label', `Step ${i + 1} roll type`);
    for (const [k, label] of Object.entries(ROLL_TYPES)) {
      const o = new Option(k, k);
      o.title = label;
      rollType.add(o);
    }
    rollType.value = row.rollType;
    rollType.addEventListener('change', () => edit(i, { rollType: rollType.value }));
    const fx = document.createElement('select');
    fx.setAttribute('aria-label', `Step ${i + 1} effect`);
    for (const [k, label] of Object.entries(BREAK_FX)) {
      const o = new Option({ dly: 'Dly', rvb: 'Rvb', hrm: 'Hrm', rev: 'Rev', cut: 'Cut' }[k] || label, k); // short, to fit the column
      o.title = label;
      fx.add(o);
    }
    fx.value = row.fx;
    fx.addEventListener('change', () => edit(i, { fx: fx.value }));
    for (const c of [slice, vol, pitch, chance, roll, rollChance, rollType, fx, fxChance]) c.addEventListener('focus', () => selectBreakRow(i));
    el.append(num, slice, vol, pitch, chance, roll, rollChance, rollType, fx, fxChance);
    wrap.append(el);
    breakRowEls.push(el);
  });
  selectBreakRow(Math.min(breakSelected, settings.breakSteps - 1));
  markOffRows();
  renderTrackTabs();
}

// ---- which tracker track is on show: 1 (the break's slices) or 2–4 (samples)
function renderTrackTabs() {
  document.querySelectorAll('#break-track-tabs [data-track]').forEach((b) => {
    const k = Number(b.dataset.track);
    b.setAttribute('aria-pressed', String(k === trackView));
    // A dot on tracks with something on them.
    const used = k === 1 ? settings.breakPattern.some(isFilled) : trackColumn(settings.breakPattern, k).some(isFilled);
    b.classList.toggle('used', used);
  });
}
document.querySelectorAll('#break-track-tabs [data-track]').forEach((b) => b.addEventListener('click', () => {
  trackView = Number(b.dataset.track);
  buildBreakRows();
}));
/** The cell on show at step k (Track 1's row, or a Tracks 2–4 cell). */
const viewRow = (k) => (trackView === 1 ? settings.breakPattern[k] : settings.breakPattern[k]?.tracks?.[trackView - 2]);

/** Change a Tracks 2–4 cell. */
function editTrackCell(i, track, patch) {
  const row = settings.breakPattern[i];
  row.tracks = row.tracks.map((c, k) => (k === track - 2 ? { ...c, ...patch } : c));
  markRow(i);
  renderTrackTabs();
  save();
}
/** A tracker row's look: filled, maybe, rolled (for the track on show). */
function markRow(k) {
  const r = viewRow(k);
  const el = breakRowEls[k];
  if (!r || !el) return;
  el.classList.toggle('filled', isFilled(r));
  el.classList.toggle('maybe', r.chance < 100);
  el.classList.toggle('rolled', r.roll > 1);
}

/** Dim tracker rows whose slice is switched off. */
function markOffRows() {
  const off = trackView === 1 ? settings.breakOff || [] : [];
  breakRowEls.forEach((el, i) => {
    const s = settings.breakPattern[i]?.slice;
    el.classList.toggle('slice-off', s !== null && s !== undefined && off.includes(s));
  });
}

function editBreakRow(i, patch) {
  settings.breakPattern[i] = { ...settings.breakPattern[i], ...patch };
  settings.breakPatternAuto = false; // your edits stay put when the slicing changes
  const r = settings.breakPattern[i];
  if (trackView === 1) {
    markRow(i);
    breakRowEls[i]?.classList.toggle('slice-off', r.slice !== null && (settings.breakOff || []).includes(r.slice));
  }
  renderTrackTabs();
  drawBreak();
  save();
}

function selectBreakRow(i) {
  breakRowEls[breakSelected]?.classList.remove('selected');
  breakSelected = i;
  breakRowEls[i]?.classList.add('selected');
  breakRowEls.forEach((el, k) => markRow(k));
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
  showBreakNow();
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

// Slice lines: within this many pixels of one, a press drags it.
const LINE_GRAB = 9;
/** The slice line (index into breakPoints, never the first) near the pointer, or -1. */
function lineNear(e) {
  const rect = $('break-wave').getBoundingClientRect();
  const x = e.clientX - rect.left;
  let best = -1;
  let bestD = LINE_GRAB + 1;
  for (let k = 1; k < breakPoints.length; k++) {
    const d = Math.abs((breakPoints[k] / breakBuffer.duration) * rect.width - x);
    if (d < bestD) { best = k; bestD = d; }
  }
  return best;
}
let lineDrag = null; // {k, moved}
$('break-wave').addEventListener('pointerdown', (e) => {
  if (!breakBuffer || e.button > 0 || e.shiftKey) return;
  const k = lineNear(e);
  if (k < 0) return;
  lineDrag = { k, x: e.clientX, moved: false };
  $('break-wave').setPointerCapture(e.pointerId);
});
$('break-wave').addEventListener('pointermove', (e) => {
  if (!breakBuffer) return;
  if (!lineDrag) {
    $('break-wave').style.cursor = !e.buttons && lineNear(e) > 0 ? 'ew-resize' : ''; // a line under the mouse
    return;
  }
  if (!lineDrag.moved && Math.abs(e.clientX - lineDrag.x) < 3) return;
  lineDrag.moved = true;
  if (breakPress) { clearTimeout(breakPress.timer); breakPress = null; }
  const rect = $('break-wave').getBoundingClientRect();
  const t = ((e.clientX - rect.left) / rect.width) * breakBuffer.duration;
  const { k } = lineDrag;
  const gap = 0.01; // a slice stays at least 10 ms long
  const lo = breakPoints[k - 1] + gap;
  const hi = (k + 1 < breakPoints.length ? breakPoints[k + 1] : breakBuffer.duration) - gap;
  breakPoints[k] = Math.min(hi, Math.max(lo, t));
  drawBreak();
});
const endLineDrag = () => {
  if (!lineDrag) return false;
  const was = lineDrag;
  lineDrag = null;
  if (!was.moved) return false; // a tap on a line: plays, as anywhere else
  // Keep them, for this break, trim and slicing.
  settings.breakCustom = { key: slicingKey(), points: breakPoints.map((p) => p / breakBuffer.duration) };
  $('break-points-reset').hidden = false;
  if (settings.breakPatternAuto) { settings.breakPattern = orderedPattern(); buildBreakRows(); }
  save();
  return true;
};
$('break-wave').addEventListener('pointerup', () => { if (endLineDrag()) lineDragJustEnded = true; });
$('break-wave').addEventListener('pointercancel', () => { endLineDrag(); });
let lineDragJustEnded = false; // the click after a drag isn't a tap
$('break-points-reset').addEventListener('click', () => {
  settings.breakCustom = null;
  computeBreakPoints();
  drawBreak();
  save();
});

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
  if (lineDragJustEnded) { lineDragJustEnded = false; return; } // that was a line being moved
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
  // Just heard: the tracker is left as it is (rows choose their slices in their own menus).
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
  renderBreakStepsFold(); // its label counts them
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
bindRange('break-level', 'breakLevel', (v) => `${v}%`, applyFaders);
bindRange('break-evolve', 'breakEvolve', (v) => (v ? `${v}%` : 'off'));
bindSelect('break-evolve-rolls', 'breakEvolveRolls', [['fast', '32nds'], ['sixteenths', '16ths'], ['eighths', '8ths']], () => { breakStutter = null; });
$('break-evolve-reverse').checked = settings.breakEvolveReverse !== false;
$('break-evolve-reverse').addEventListener('change', () => { settings.breakEvolveReverse = $('break-evolve-reverse').checked; save(); });
onRecall(() => { $('break-evolve-reverse').checked = settings.breakEvolveReverse !== false; });
document.querySelectorAll('[data-gen]').forEach((b) => b.addEventListener('click', () => {
  const steps = settings.breakSteps;
  settings.breakPattern = {
    order: () => orderedPattern(),
    chop: () => chop(orderedPattern()),
    random: () => keepTracks(randomize(steps, (settings.breakOff || []).length ? usableSlices(sliceCount(), settings.breakOff) : sliceCount()), settings.breakPattern),
    // Clear empties the track on show (Track 1: the slices; the others: their samples).
    clear: () => (trackView === 1
      ? keepTracks(resizePattern([], steps), settings.breakPattern)
      : settings.breakPattern.map((r) => ({ ...r, tracks: r.tracks.map((c, k) => (k === trackView - 2 ? emptyCell() : c)) }))),
  }[b.dataset.gen]();
  if (b.dataset.gen !== 'clear' || trackView === 1) settings.breakPatternAuto = b.dataset.gen === 'order';
  if (b.dataset.gen !== 'clear') trackView = 1; // they make Track 1: show it
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

// A break slot's Evolve settings (the edited slot's are the live ones).
const breakVariationNow = () => ({ evolve: settings.breakEvolve, rolls: settings.breakEvolveRolls, reverse: settings.breakEvolveReverse });
function breakSlotVariation(slot) {
  return (slot && slot !== settings.breakSlot && settings.breakSlotEvolve?.[slot]) || breakVariationNow();
}
function renderBreakEvolve() {
  $('break-evolve').value = String(settings.breakEvolve);
  $('break-evolve-val').textContent = settings.breakEvolve ? `${settings.breakEvolve}%` : 'off';
  $('break-evolve-rolls').value = settings.breakEvolveRolls;
  $('break-evolve-reverse').checked = settings.breakEvolveReverse !== false;
}

function selectBreakSlot(slot) {
  if (slot === settings.breakSlot) return;
  if (!settings.breakSlotEvolve || typeof settings.breakSlotEvolve !== 'object') settings.breakSlotEvolve = {};
  settings.breakSlotEvolve[settings.breakSlot] = breakVariationNow();
  const v = settings.breakSlotEvolve[slot]; // (a new slot keeps the current ones: a copy)
  delete settings.breakSlotEvolve[slot];
  if (v) Object.assign(settings, { breakEvolve: v.evolve, breakEvolveRolls: v.rolls, breakEvolveReverse: v.reverse });
  renderBreakEvolve();
  breakStutter = null;
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
    if (!settings.breakSlotEvolve || typeof settings.breakSlotEvolve !== 'object') settings.breakSlotEvolve = {};
    settings.breakSlotEvolve[to] = breakVariationNow();
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

/** The song as blocks: runs of bars on the same section, [{slot, start, bars}]. */
function songBlocks() {
  const out = [];
  settings.songChain.forEach((s, i) => {
    const last = out[out.length - 1];
    if (last && last.slot === s) last.bars++;
    else out.push({ slot: s, start: i, bars: 1 });
  });
  return out;
}

function renderSong() {
  $('song-on').setAttribute('aria-pressed', String(settings.songOn));
  $('song-on').textContent = settings.songOn ? 'On' : 'Off';
  $('song-panel').classList.toggle('off', !settings.songOn);
  $('song-all').checked = settings.songAll !== false;
  const wrap = $('song-chain');
  wrap.replaceChildren();
  const chain = settings.songChain;
  const edit = (fn) => { fn(); renderSong(); save(); };
  songBlocks().forEach((blk, k) => {
    const chip = document.createElement('span');
    chip.className = 'song-bar song-block';
    chip.dataset.start = String(blk.start);
    chip.dataset.bars = String(blk.bars);
    const n = document.createElement('small');
    n.textContent = String(k + 1);
    const letter = document.createElement('button');
    letter.className = 'song-letter';
    letter.textContent = blk.slot;
    letter.title = `Block ${k + 1}: section ${blk.slot} (tap to change)`;
    letter.addEventListener('click', () => edit(() => {
      const next = SLOTS[(SLOTS.indexOf(blk.slot) + 1) % SLOTS.length];
      for (let i = blk.start; i < blk.start + blk.bars; i++) chain[i] = next;
    }));
    const less = document.createElement('button');
    less.textContent = '−';
    less.title = 'One bar shorter';
    less.addEventListener('click', () => edit(() => chain.splice(blk.start + blk.bars - 1, 1)));
    const len = document.createElement('span');
    len.className = 'song-len';
    len.textContent = `${blk.bars} bar${blk.bars === 1 ? '' : 's'}`;
    const more = document.createElement('button');
    more.textContent = '+';
    more.title = 'One bar longer';
    more.addEventListener('click', () => edit(() => chain.splice(blk.start + blk.bars, 0, blk.slot)));
    const x = document.createElement('button');
    x.className = 'song-x';
    x.textContent = '×';
    x.title = `Remove block ${k + 1}`;
    x.addEventListener('click', () => edit(() => chain.splice(blk.start, blk.bars)));
    chip.append(n, letter, less, len, more, x);
    wrap.append(chip);
  });
  if (!chain.length) wrap.textContent = 'Empty: add a block below.';
  showSongBar(songNowBar);
}

function showSongBar(bar) {
  songNowBar = bar;
  const len = settings.songChain.length;
  const at = bar >= 0 && len ? bar % len : -1;
  $('song-chain').querySelectorAll('.song-block').forEach((el) => {
    const s = Number(el.dataset.start);
    el.classList.toggle('now', at >= s && at < s + Number(el.dataset.bars));
  });
  $('song-pos').textContent = at >= 0 ? `bar ${at + 1} of ${len}` : '';
  renderSlotButtons();
}

onRecall(repairSong)();
function repairSong() {
  if (!SLOTS.includes(settings.breakSlot)) settings.breakSlot = 'A';
  if (!settings.breakSlots || typeof settings.breakSlots !== 'object') settings.breakSlots = {};
  if (!settings.breakSlotEvolve || typeof settings.breakSlotEvolve !== 'object') settings.breakSlotEvolve = {};
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
  if (settings.songOn && !playing && settings.sync === 'internal') setPlaying(true);
  renderSong();
  save();
});
$('song-all').addEventListener('change', () => { settings.songAll = $('song-all').checked; save(); });
document.querySelectorAll('[data-add-bar]').forEach((b) => b.addEventListener('click', () => {
  const n = Number($('song-add-bars').value) || 4;
  for (let i = 0; i < n; i++) settings.songChain.push(b.dataset.addBar);
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
for (const [k, v] of Object.entries(MONO_DEFAULTS)) {
  DEFAULTS[k] ??= v; // (so Clear all and older scenes get them too)
  if (settings[k] === undefined) settings[k] = v;
}

function monoParams() {
  const p = Object.fromEntries(MONO_PARAMS.map(([key, name, conv]) => [name, conv ? conv(settings[key]) : settings[key]]));
  p.level = 1; // its Level is the bass fader
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

// ---- Bach invention: two voices in imitation over the chords (invention.js). The arp
// (Mode: Bach invention) plays the upper voice, the Mono Synth (Play: Bach invention) the
// lower; either alone plays a single line. In 16ths, straight, whatever the Rate.
const invention = new Invention();

/** The form marks for the bar at `pulse`: the last bar of a pass through the progression
 * (or of 8 bars without one) is a cadence; the bar after it, long notes. */
function inventionInfo(pulse) {
  const bar = PPQN * 4;
  const slots = settings.progOn ? settings.progression.slice(0, settings.progLength) : [];
  const total = slots.reduce((n, s) => n + s.beats, 0) * PPQN;
  // A section is at least 8 bars: as many passes through a short progression as that takes.
  const round = total >= bar ? Math.floor(total / bar) : 0;
  const bars = round ? round * Math.ceil(8 / round) : 8;
  const span = bars * bar;
  const inRound = Math.floor((pulse % span) / bar);
  return { cadence: inRound === bars - 1, afterCadence: inRound === 0 && pulse >= span, key: inventionKey() };
}

/** The key the invention keeps to: the tuning Key (or the progression's, found on Auto), minor
 * when the progression's chord on that tonic is minor. null without one. */
function inventionKey() {
  const tonic = tonicPc();
  if (tonic === null) return null;
  const home = settings.progOn ? settings.progression.slice(0, settings.progLength).find((s) => (((s.root + progShift) % 12) + 12) % 12 === tonic && s.type !== 'rest') : null;
  return { tonic, minor: !!(home && CHORDS[home.type]?.minor) };
}

// ---- Your subject: typed (or recorded from the keyboard) as note names.
let bachRecording = false;
function applySubject() {
  const text = $('bach-subject').value.trim();
  settings.bachSubject = text;
  const status = $('bach-subject-status');
  status.classList.remove('error');
  if (!text) {
    invention.setSubject(null);
    status.textContent = 'A new subject each time you press Play.';
    return;
  }
  const r = parseSubject(text);
  if (r.error) {
    status.textContent = r.error;
    status.classList.add('error');
    return; // the last good subject stays in use
  }
  invention.setSubject(r.events); // the piece starts again from its exposition, next bar
  status.textContent = `${r.notes.length} note${r.notes.length === 1 ? '' : 's'}, ${r.length} sixteenths`
    + (r.length <= 8 ? ': answered a 5th higher to fill the bar.' : r.length < 16 ? ': the last note held to the bar line.' : '.');
}
$('bach-subject').value = settings.bachSubject || '';
$('bach-subject').addEventListener('change', () => { applySubject(); save(); });
$('bach-subject').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('bach-subject').blur(); });
$('bach-random').addEventListener('click', () => { $('bach-subject').value = ''; applySubject(); save(); });
$('bach-record').addEventListener('click', () => {
  bachRecording = !bachRecording;
  $('bach-record').setAttribute('aria-pressed', String(bachRecording));
  $('bach-record').textContent = bachRecording ? 'Recording… (tap to stop)' : 'Record';
  if (bachRecording) {
    $('bach-subject').value = '';
    $('bach-subject-status').textContent = 'Play the subject on the keyboard.';
  } else applySubject();
  save();
});
/** A key while recording the subject: typed into the box (with its octave), and heard. */
function recordSubjectNote(note) {
  const box = $('bach-subject');
  box.value = `${box.value.trim()} ${noteName(note)}`.trim();
  applySubject();
  if (settings.synthOn && synth) playVoice(note, null, 96, ctx.currentTime + 0.01, 0.25, note);
}
onRecall(() => { $('bach-subject').value = settings.bachSubject || ''; applySubject(); });
applySubject();

// One tap to hear it: a Baroque progression, both voices, a Bach tempo, from the top.
$('bach-try').addEventListener('click', () => {
  const preset = $('prog-preset');
  preset.value = 'Bach: circle of fifths (C)';
  preset.dispatchEvent(new Event('change'));
  if (!settings.progOn) { settings.progOn = true; progIndex = -1; renderProgression(); }
  settings.monoSource = 'bach';
  $('mono-source').value = 'bach';
  // Switched on directly (their buttons would start the transport before we're ready).
  settings.monoOn = true;
  renderMonoPanel();
  settings.arpOn = true;
  renderArpOn();
  renderSoloRow();
  if (settings.sync === 'internal') {
    setBpm(84);
    if (playing) setPlaying(false);
    ensureAudio();
    invention.reset();
    setPlaying(true);
  }
  save();
});

function inventionPulse(time, pulse, pulseDuration) {
  const arpBach = settings.mode === 'bach' && settings.arpOn;
  const monoBach = settings.monoSource === 'bach' && settings.monoOn;
  if (!arpBach && !monoBach) return;
  const sixteenth = RATES['1/16'];
  if (pulse % sixteenth) return;
  const s = pulse / sixteenth;
  const chord = currentChord();
  const info = inventionInfo(pulse);
  const len16 = sixteenth * pulseDuration;
  // Who plays what: both on, the arp has the upper voice; alone, either plays it.
  const parts = arpBach && monoBach ? [['upper', 'arp'], ['lower', 'mono']] : [['upper', arpBach ? 'arp' : 'mono']];
  for (const [voice, inst] of parts) {
    const ev = invention.step(voice, s, chord, { ...info, other: invention.last.upper });
    if (!ev) continue;
    const t = human({ time, duration: len16 }).time;
    // Detached a little, as on a harpsichord; long notes held.
    const len = ev.len * len16 * (ev.len >= 4 ? 0.95 : 0.8);
    const velocity = humanLevel(ev.kind === 'subject' || ev.kind === 'inversion' ? 100 : 86);
    if (inst === 'arp') {
      const note2 = settings.osc2On && settings.osc2Mode !== 'line' ? Math.max(0, Math.min(127, ev.note + settings.osc2Transpose)) : null;
      playVoice(ev.note, note2, velocity, t, len, ev.note);
      arpTail = { note: ev.note, note2, modNote: ev.note, root: chordRoot() };
    } else {
      const n = Math.max(0, Math.min(127, ev.note + settings.monoTranspose));
      if (monoSynth && settings.synthOn) { monoSynth.noteOn(tuned(n), t, { legato: false }); monoSynth.noteOff(t + len); }
      monoRoot = chordRoot();
      if (settings.monoMidiCh >= 0) {
        midi.noteOn(n, velocity, toPerfMs(t), settings.monoMidiCh);
        midi.noteOff(n, toPerfMs(t + len), settings.monoMidiCh);
      }
    }
  }
}

// The Mono Synth's own soloist (Play: Coltrane solo): a second line, independent of the arp's.
const monoSolo = new ColtraneSolo();

/** Mono Synth, Play = Coltrane solo: the next note of its line, at the Mono's Rate and sound. */
function playMonoSolo(step, pulse) {
  const t = step.time;
  const note = monoSolo.next(currentChord(), soloContext(pulse, settings.monoRate));
  const release = (at) => {
    if (!monoGateOpen) return;
    if (monoSynth && settings.synthOn) monoSynth.noteOff(at);
    if (settings.monoMidiCh >= 0 && monoMidiNote !== null) midi.noteOff(monoMidiNote, toPerfMs(at), settings.monoMidiCh);
    monoMidiNote = null;
    monoGateOpen = false;
  };
  if (note === null) { release(t); return; } // a breath
  const n = Math.max(0, Math.min(127, note + settings.monoTranspose));
  // With Legato on, the line slides from note to note (the 101's glide); otherwise each is struck.
  const legato = settings.monoLegato && monoGateOpen;
  if (!legato && monoGateOpen) release(t);
  if (monoSynth && settings.synthOn) monoSynth.noteOn(tuned(n), t, { legato });
  monoRoot = chordRoot();
  if (settings.monoMidiCh >= 0) {
    midi.noteOn(n, 100, toPerfMs(t), settings.monoMidiCh);
    if (legato && monoMidiNote !== null) midi.noteOff(monoMidiNote, toPerfMs(t + 0.002), settings.monoMidiCh);
  }
  monoMidiNote = n;
  monoGateOpen = true;
  // The gate; a phrase's last note is held on for about a beat. With Legato the note
  // stays open until the next one slides in (or the breath).
  const beat = step.duration * (PPQN / (RATES[settings.monoRate] || RATES['1/16']));
  const hold = monoSolo.ended ? Math.max(beat * 0.9, step.duration) : step.duration * Math.min(settings.monoGate / 100, 0.98);
  if (!settings.monoLegato || monoSolo.ended) release(t + hold);
}

function playMonoStep(step, pulse = 0) {
  if (settings.monoSource === 'solo') { playMonoSolo(step, pulse); return; }
  if (settings.monoSource === 'bach') return; // played by the invention (inventionPulse)
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
  if (monoNowStep !== i) monoStepEls[monoNowStep]?.classList.remove('now');
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

for (const [k, v] of Object.entries({ monoOn: false, monoArmed: false, monoLegato: false, monoSource: 'seq', monoRate: '1/16', monoGate: 70, monoTranspose: 0, monoKeys: false, monoMidiCh: -1 })) {
  DEFAULTS[k] ??= v;
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
bindSelect('mono-source', 'monoSource', [['seq', 'Sequence'], ['solo', 'Coltrane solo'], ['bach', 'Bach invention']], () => {
  monoSolo.reset();
  invention.reset();
  renderSoloRow();
  if (settings.monoSource !== 'seq') showMonoStep(-1);
});
renderSoloRow();
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
bindRange('mono-level', 'monoLevel', pct, applyFaders);

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
      layers: chordLayers(), level: 1, out: chorus.input,
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
// ---- section faders and pre/post-fader sends
const SEND_SOURCES = { arp: 'Arp', chords: 'Chords', drums: 'Drums', break: 'Break', bass: 'Bass' }; // Drums: the percussion
const FADER_LEVELS = { arp: 'arpLevel', chords: 'chordLevel', bass: 'monoLevel', perc: 'drumLevel', break: 'breakLevel' };
/** Each section's Level is its fader. */
function applyFaders() {
  if (!ctx || !faders.arp) return;
  for (const [k, key] of Object.entries(FADER_LEVELS)) faders[k].gain.setTargetAtTime(settings[key] / 100, ctx.currentTime, 0.015);
}
/** One send's level, from before or after the fader as its effect is set (Pre-fader). */
function setSend(fx, src) {
  const s = sends[fx]?.[src];
  if (!s) return;
  const amount = settings[`${fx}Send${SEND_SOURCES[src]}`] / 100;
  const pre = !!settings[`${fx}Pre${SEND_SOURCES[src]}`];
  const now = ctx.currentTime;
  s.pre.gain.setTargetAtTime(pre ? amount : 0, now, 0.02);
  s.post.gain.setTargetAtTime(pre ? 0 : amount, now, 0.02);
}
/** Should a section play at all? Yes if you can hear it, or a pre-fader send is taking it. */
function audible(section) {
  const level = section === 'drums' ? settings.drumLevel : settings[FADER_LEVELS[section]];
  if (level > 0) return true;
  return ['delay', 'reverb', 'harm'].some((fx) => settings[`${fx}Pre${SEND_SOURCES[section]}`] && settings[`${fx}Send${SEND_SOURCES[section]}`] > 0);
}

/** Each effect's Mute: its output off, its input still fed (so tails come back on unmute). */
function applyFxMutes() {
  for (const fx of ['delay', 'reverb', 'harm']) {
    const b = $(`${fx}-mute`);
    const on = !!settings[`${fx}Muted`];
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? 'Muted' : 'Mute';
    b.closest('.row').classList.toggle('fx-muted', on);
  }
  if (!ctx || !delayFx) return;
  const now = ctx.currentTime;
  delayFx.out.gain.setTargetAtTime(settings.delayMuted ? 0 : settings.delayReturn / 100, now, 0.01);
  reverbFx.out.gain.setTargetAtTime(settings.reverbMuted ? 0 : settings.reverbReturn / 100, now, 0.01);
  applyHarm();
}
onRecall(applyFxMutes)();
for (const fx of ['delay', 'reverb', 'harm']) {
  $(`${fx}-mute`).addEventListener('click', () => {
    settings[`${fx}Muted`] = !settings[`${fx}Muted`];
    applyFxMutes();
    save();
  });
}

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
  delayFx.out.gain.setTargetAtTime(settings.delayMuted ? 0 : settings.delayReturn / 100, ctx.currentTime, 0.01);
  reverbFx.out.gain.setTargetAtTime(settings.reverbMuted ? 0 : settings.reverbReturn / 100, ctx.currentTime, 0.01);
  for (const fx of ['delay', 'reverb']) {
    for (const src of ['arp', 'chords', 'drums', 'break', 'bass']) setSend(fx, src);
  }
}
bindSelect('delay-time', 'delayTime', DELAY_TIMES.map((d) => [d, d]), applyFx);
bindRange('delay-feedback', 'delayFeedback', (v) => `${v}%`, applyFx);
// A "Pre" switch on every send: taken before the section's Level (pre-fader) or after it.
for (const fx of ['delay', 'reverb', 'harm']) {
  // Older saves had one switch per effect: it now applies to each of that effect's sends.
  if (settings[`${fx}SendsPre`] !== undefined) {
    for (const src of Object.values(SEND_SOURCES)) settings[`${fx}Pre${src}`] = !!settings[`${fx}SendsPre`];
    delete settings[`${fx}SendsPre`];
  }
  for (const src of Object.values(SEND_SOURCES)) {
    const key = `${fx}Pre${src}`;
    const slider = $(`${fx}-send-${src.toLowerCase()}`);
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = `${fx}-pre-${src.toLowerCase()}`;
    box.checked = !!settings[key];
    const label = document.createElement('label');
    label.className = 'check pre-send';
    label.title = `Pre-fader: take this send before the ${src === 'Drums' ? 'percussion' : src === 'Break' ? 'breakbeat' : src.toLowerCase()} Level, so turning that down (even to 0) doesn't change what goes to the effect. Off: after it (post-fader).`;
    label.append(box, ' Pre');
    // Keep the send and its Pre switch together, so they wrap as one on narrow screens.
    const field = slider.closest('label');
    const pair = document.createElement('div');
    pair.className = 'send-pair';
    field.before(pair);
    pair.append(field, label);
    box.addEventListener('change', () => {
      settings[key] = box.checked;
      if (fx === 'harm') applyHarm(); else applyFx();
      save();
    });
    onRecall(() => { box.checked = !!settings[key]; });
  }
}
bindLog('delay-tone', 'delayTone', 300, 12000, formatHz, applyFx);
$('delay-pingpong').checked = settings.delayPingPong;
onRecall(() => { $('delay-pingpong').checked = settings.delayPingPong; applyFx(); updateDelayTime(); });
$('delay-pingpong').addEventListener('change', () => { settings.delayPingPong = $('delay-pingpong').checked; applyFx(); save(); });
bindLog('reverb-size', 'reverbSize', 300, 8000, (ms) => `${(ms / 1000).toFixed(1)} s`, applyFx);
bindRange('reverb-pre', 'reverbPre', (v) => `${v} ms`, applyFx);
bindLog('reverb-tone', 'reverbTone', 300, 12000, formatHz, applyFx);

// ---- Harmonizer (H949-style), laid out like the H949's front panel: the Function button
// picks the Pitch Change group or the Delay group, each with four modes; Algorithm 1/2;
// Repeat; Feedback; and separate Main (processed) and Delay (plain delayed) output levels.
const HARM_GROUPS = {
  pitch: [[0, 'Norm'], [1, 'Extend'], [2, 'μPC'], [3, 'Reverse']],
  delay: [[4, 'Delay'], [5, 'Random'], [6, 'Flange'], [7, 'Reverse']],
};
/** The worklet mode for the Function and mode switches. */
const harmWorkletMode = () => (settings.harmFunc === 'delay' ? settings.harmDelayMode : settings.harmPitchMode);
/** μPC: 0.1% steps of pitch ratio, as semitones. */
const microSemis = () => 12 * Math.log2(1 + settings.harmMicro / 1000);

function applyHarm() {
  if (!ctx || !harmOut) return;
  const now = ctx.currentTime;
  if (harmNode) {
    const p = (name) => harmNode.parameters.get(name);
    const set = (name, v) => p(name).setTargetAtTime(v, now, 0.02);
    // Switches change at once (a glide would pass through the modes in between).
    p('mode').setValueAtTime(harmWorkletMode(), now);
    p('algorithm').setValueAtTime(settings.harmAlgorithm, now);
    p('repeat').setValueAtTime(settings.harmRepeat ? 1 : 0, now);
    set('pitch', settings.harmPitchMode === 2 && settings.harmFunc === 'pitch' ? microSemis() : settings.harmPitch);
    set('spread', settings.harmSpread);
    set('delay', settings.harmDelay / 1000);
    set('feedback', settings.harmFeedback / 100);
    set('grain', settings.harmGrain / 1000);
    set('main', 1);
    set('delayOut', settings.harmDelayLevel / 100);
  }
  harmOut.gain.setTargetAtTime(settings.harmMuted ? 0 : settings.harmLevel / 100, now, 0.02);
  for (const src of ['arp', 'chords', 'drums', 'break', 'bass']) setSend('harm', src);
}

// Older saves had one Mode menu (0 Pitch … 6 Repeat): carry it over once.
if (settings.harmMode !== undefined) {
  const old = Number(settings.harmMode) || 0;
  delete settings.harmMode;
  settings.harmFunc = [4, 5].includes(old) ? 'delay' : 'pitch';
  settings.harmPitchMode = old === 2 ? 3 : 0;
  settings.harmDelayMode = old === 5 ? 6 : old === 3 ? 5 : 4;
  settings.harmAlgorithm = old === 1 ? 2 : 1;
  settings.harmRepeat = old === 6;
}
if (!['pitch', 'delay'].includes(settings.harmFunc)) settings.harmFunc = 'pitch';
for (const [k, v] of Object.entries({ harmPitchMode: 0, harmDelayMode: 4, harmAlgorithm: 1, harmRepeat: false, harmMicro: 8, harmDelayLevel: 0 })) {
  DEFAULTS[k] ??= v;
  if (settings[k] === undefined) settings[k] = v;
}

const HARM_PRESETS = {
  'Micro-pitch double': { harmFunc: 'pitch', harmPitchMode: 2, harmMicro: 8, harmSpread: 12, harmDelay: 15, harmFeedback: 0, harmDelayLevel: 0 },
  'Fifth up spiral': { harmFunc: 'pitch', harmPitchMode: 0, harmPitch: 7, harmSpread: 0, harmDelay: 80, harmFeedback: 45 },
  'Octave up shimmer': { harmFunc: 'pitch', harmPitchMode: 1, harmPitch: 12, harmSpread: 6, harmDelay: 140, harmFeedback: 40, harmGrain: 80, harmAlgorithm: 2 },
  'Octave down thunder': { harmFunc: 'pitch', harmPitchMode: 1, harmPitch: -12, harmDelay: 60, harmFeedback: 30, harmGrain: 90, harmAlgorithm: 2 },
  'Rising staircase': { harmFunc: 'pitch', harmPitchMode: 0, harmPitch: 1, harmDelay: 110, harmFeedback: 75 },
  'Falling staircase': { harmFunc: 'pitch', harmPitchMode: 0, harmPitch: -1, harmDelay: 110, harmFeedback: 75 },
  'Glitch': { harmFunc: 'pitch', harmPitchMode: 1, harmPitch: 3, harmSpread: 10, harmDelay: 35, harmFeedback: 60, harmGrain: 8, harmAlgorithm: 1 },
  'Reverse shimmer': { harmFunc: 'pitch', harmPitchMode: 3, harmPitch: 12, harmSpread: 8, harmDelay: 250, harmFeedback: 35 },
  'Backwards': { harmFunc: 'delay', harmDelayMode: 7, harmDelay: 300, harmFeedback: 20 },
  'Double-track': { harmFunc: 'delay', harmDelayMode: 5, harmDelay: 20, harmGrain: 40, harmFeedback: 0, harmSpread: 50, harmDelayLevel: 0 },
  'Slapback': { harmFunc: 'delay', harmDelayMode: 4, harmDelay: 95, harmFeedback: 10, harmSpread: 30 },
  'Jet flange': { harmFunc: 'delay', harmDelayMode: 6, harmFeedback: 70, harmGrain: 100, harmSpread: 25 },
  'Harmony + slap': { harmFunc: 'pitch', harmPitchMode: 0, harmPitch: 7, harmDelay: 90, harmFeedback: 0, harmDelayLevel: 60 },
};

// What each knob does in each mode (null = not used: dimmed).
function harmLabels() {
  const m = harmWorkletMode();
  const reverse = m === 3 || m === 7;
  return {
    pitch: m === 2 ? null : m >= 4 ? null : 'Pitch',
    micro: m === 2 ? 'μPC' : null,
    spread: m >= 4 ? (m === 4 ? 'L/R offset' : m === 5 ? 'L/R spread' : m === 6 ? 'L/R phase' : null) : 'Spread',
    delay: reverse ? 'Segment' : 'Delay',
    grain: m === 1 ? 'Segment' : m === 5 || m === 6 ? 'Rate' : null,
  };
}
const hm = () => harmWorkletMode();
const fmtSpread = (v) => (hm() === 4 ? `${(v * 0.1).toFixed(1)} ms` : hm() >= 5 ? `${Math.round(v)}%` : `${v} ¢`);
const fmtGrain = (v) => (hm() === 5 ? `${(1000 / (v * 10)).toFixed(1)}/s` : hm() === 6 ? `${((v * 40) / 1000).toFixed(1)} s` : `${v} ms`);
// Pitch shown as the H949 shows it: a ratio (×0.500 an octave down … ×2.000 an octave up).
const fmtRatio = (st) => `×${Math.pow(2, st / 12).toFixed(3)}`;
const fmtMicro = (v) => `×${(1 + v / 1000).toFixed(3)}`;
const harmControls = [];
for (const [id, key, fmt] of [
  ['harm-pitch', 'harmPitch', fmtRatio], ['harm-micro', 'harmMicro', fmtMicro], ['harm-spread', 'harmSpread', fmtSpread],
  ['harm-delay', 'harmDelay', (v) => `${v} ms`], ['harm-feedback', 'harmFeedback', (v) => `${v}%`],
  ['harm-grain', 'harmGrain', fmtGrain], ['harm-level', 'harmLevel', (v) => `${v}%`],
  ['harm-delay-level', 'harmDelayLevel', (v) => `${v}%`],
]) {
  bindRange(id, key, fmt, applyHarm);
  harmControls.push([id, key, fmt]);
}
for (const src of ['Arp', 'Chords', 'Drums', 'Break', 'Bass']) {
  bindRange(`harm-send-${src.toLowerCase()}`, `harmSend${src}`, (v) => `${v}%`, applyHarm);
}

/** Draw the switches, relabel and dim the knobs for the current mode, refresh the readouts. */
function renderHarm() {
  for (const b of $('harm-func').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.func === settings.harmFunc));
  const modes = $('harm-modes');
  modes.replaceChildren();
  const current = harmWorkletMode();
  for (const [m, label] of HARM_GROUPS[settings.harmFunc]) {
    const b = document.createElement('button');
    b.textContent = label;
    b.setAttribute('aria-pressed', String(m === current));
    b.setAttribute('aria-label', `Harmonizer ${settings.harmFunc} mode ${label}`);
    b.addEventListener('click', () => {
      if (settings.harmFunc === 'delay') settings.harmDelayMode = m; else settings.harmPitchMode = m;
      renderHarm();
      applyHarm();
      save();
    });
    modes.append(b);
  }
  for (const b of $('harm-alg').querySelectorAll('button')) b.setAttribute('aria-pressed', String(Number(b.dataset.alg) === settings.harmAlgorithm));
  $('harm-repeat').setAttribute('aria-pressed', String(!!settings.harmRepeat));
  const labels = harmLabels();
  for (const [name, text] of Object.entries(labels)) {
    const field = $(`harm-${name}`).closest('label');
    if (!field.dataset.base) field.dataset.base = field.firstChild.textContent.trim();
    field.firstChild.textContent = `${text || field.dataset.base} `;
    field.classList.toggle('dim', !text);
  }
  // μPC replaces the Pitch knob; the other modes hide the μPC one.
  $('harm-micro').closest('label').hidden = harmWorkletMode() !== 2;
  $('harm-pitch').closest('label').hidden = harmWorkletMode() === 2;
  for (const [id, key, fmt] of harmControls) $(`${id}-val`).textContent = fmt(settings[key]);
}
for (const b of $('harm-func').querySelectorAll('button')) {
  b.addEventListener('click', () => { settings.harmFunc = b.dataset.func; renderHarm(); applyHarm(); save(); });
}
for (const b of $('harm-alg').querySelectorAll('button')) {
  b.addEventListener('click', () => { settings.harmAlgorithm = Number(b.dataset.alg); renderHarm(); applyHarm(); save(); });
}
$('harm-repeat').addEventListener('click', () => { settings.harmRepeat = !settings.harmRepeat; renderHarm(); applyHarm(); save(); });
onRecall(renderHarm)();

const harmPreset = $('harm-preset');
for (const name of Object.keys(HARM_PRESETS)) harmPreset.add(new Option(name, name));
harmPreset.addEventListener('change', () => {
  const p = HARM_PRESETS[harmPreset.value];
  harmPreset.value = '';
  if (!p) return;
  Object.assign(settings, { harmRepeat: false, harmAlgorithm: 1, harmDelayLevel: 0 }, p);
  for (const [id, key] of harmControls) $(id).value = settings[key];
  renderHarm();
  applyHarm();
  save();
});
for (const fx of ['delay', 'reverb']) {
  for (const src of ['Arp', 'Chords', 'Drums', 'Break', 'Bass']) {
    bindRange(`${fx}-send-${src.toLowerCase()}`, `${fx}Send${src}`, (v) => `${v}%`, applyFx);
  }
}

// Each section's own sends, in its window: the same sends as in the Effects window (moving
// either moves both).
{
  const SEND_PANELS = { arp: '.panel.arp', chords: '#chord-panel', bass: '#mono-panel', drums: '#drum-panel', break: '#break-panel' };
  const FX_LABELS = { delay: 'Delay', reverb: 'Reverb', harm: 'Harmonizer' };
  for (const [src, selector] of Object.entries(SEND_PANELS)) {
    const panel = document.querySelector(selector);
    if (!panel) continue;
    const row = document.createElement('div');
    row.className = 'row sends-row';
    const head = document.createElement('span');
    head.className = 'row-label';
    head.textContent = 'Sends';
    head.title = 'This section\'s sends into the Effects: the same sends as in the Effects window';
    row.append(head);
    for (const [fx, name] of Object.entries(FX_LABELS)) {
      const twin = $(`${fx}-send-${src}`);
      const key = `${fx}Send${SEND_SOURCES[src]}`;
      const label = document.createElement('label');
      label.className = 'field slider';
      const out = document.createElement('output');
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.id = `${src}-${fx}-send`;
      label.append(`${name} `, out, input);
      const show = () => { input.value = String(settings[key] ?? 0); out.textContent = `${settings[key] ?? 0}%`; };
      input.addEventListener('input', () => {
        twin.value = input.value;
        twin.dispatchEvent(new Event('input')); // the Effects window's slider does the rest
        show();
      });
      twin.addEventListener('input', show);
      onRecall(show);
      show();
      row.append(label);
    }
    const before = src === 'break' ? panel.querySelector('.track-samples') : null;
    if (before) before.before(row); else panel.append(row);
  }
}

// ---------------------------------------------------------------- UI: oscillator 2
function renderOsc2() {
  $('osc2-on').setAttribute('aria-pressed', String(settings.osc2On));
  $('osc2-on').textContent = settings.osc2On ? 'On' : 'Off';
  $('osc2-panel').classList.toggle('off', !settings.osc2On);
  $('bassline-row').hidden = settings.osc2Mode !== 'line';
  bassPlan = null; // start the line afresh on the next beat
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
bindSelect('osc2-bass-style', 'osc2BassStyle', Object.entries(BASS_STYLES), () => { bassPlan = null; renderBassRate(); });
bindSelect('osc2-bass-rate', 'osc2BassRate', Object.keys(BASS_RATES).map((r) => [r, r === 'auto' ? 'Auto (the style\'s)' : r]), () => { bassPlan = null; });
/** Bossa has its own rhythm: the Rate doesn't apply to it. */
function renderBassRate() { $('osc2-bass-rate').disabled = bassStyle() === 'bossa'; }
renderBassRate();
onRecall(renderBassRate);
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
      ? rootName(root, slot.flat) + CHORD_SUFFIX[slot.type]
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

let lastFrameAt = 0;
function frame() {
  // A second driver for the clock, in case the timer worker was stopped while the phone slept.
  if (playing && settings.sync === 'internal') internalClock.pump();
  // Steadier playback: the display updates about 15 times a second, leaving the rest for sound.
  const nowMs = performance.now();
  if (settings.stableMode && nowMs - lastFrameAt < 66) { requestAnimationFrame(frame); return; }
  lastFrameAt = nowMs;
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
    if (ev.kind === 'bass') {
      $('out-osc2-wrap').hidden = false;
      $('out-osc2').textContent = noteName(ev.note);
      continue;
    }
    if (ev.kind === 'arr') {
      renderArr();
      continue;
    }
    if (ev.kind === 'drum-overlay') {
      showDrumOverlay(ev.overlay);
      continue;
    }
    if (ev.kind === 'break') {
      showBreakStep(ev.step, ev.slice, ev.change);
      showPadPlaying(ev.slice);
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
    if (settings.osc2Mode !== 'line') $('out-osc2-wrap').hidden = ev.note2 === null; // a bass line shows its own notes
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

// ---------------------------------------------------------------- sections A–D
// Every module with a pattern has four of them, A–D: the Sequencer, Progression, Chord
// rhythm and Mono here (what each keeps is in SECTION_KEYS), Percussion and Breakbeat with
// their own pattern slots. The one in use lives in the settings as usual; the others wait
// in settings.sectionStore. A new section starts as a copy of the one you were on. While
// playing, a switch comes in on the next bar line. Section (top bar) switches them all.
const SECTION_KEYS = {
  seq: ['steps', 'length'],
  prog: ['progression', 'progLength', 'progSong', 'progStyle'],
  chords: ['chordRate', 'chordSteps', 'chordHits', 'chordRotate', 'chordMode', 'chordSyncopate', 'chordTie'],
  mono: ['monoSeq'],
  // The Arpeggiator: on/off, mode (a solo or invention too), rate, octaves, gate, swing, and the
  // solo's and invention's settings.
  arp: ['arpOn', 'mode', 'rate', 'octaves', 'gate', 'swing', 'soloSpace', 'soloBebop', 'soloBuild', 'bachSubject'],
  // The arp's two voices: their sounds (and oscillator 2's sequence mode and bass line).
  osc1: ['wave', 'cutoff', 'arpShape', 'arpTimbre', 'lpgMode', 'arpResonance', 'arpAttack', 'arpRelease', 'osc1Level'],
  osc2: [
    'osc2On', 'osc2Mode', 'osc2Sound', 'osc2Wave', 'osc2Transpose', 'osc2Detune', 'osc2Level', 'osc2Shape', 'osc2Timbre',
    'osc2Lpg', 'osc2Cutoff', 'osc2SyncCutoff', 'osc2Resonance', 'osc2Mod', 'osc2ModDepth', 'osc2Attack', 'osc2Release',
    'bassTone', 'bassDecay', 'osc2BassStyle', 'osc2BassRate',
  ],
};
const SECTION_HOME = { arp: 'arp-on', seq: 'length', prog: 'prog-length', chords: 'chord-on', mono: 'mono-on', osc1: 'wave', osc2: 'osc2-on' }; // where the buttons go
const SECTION_NAMES = { arp: 'arpeggiator', seq: 'sequencer', prog: 'progression', chords: 'chord rhythm', mono: 'mono sequence', osc1: 'arp voice (oscillator 1)', osc2: 'oscillator 2', drum: 'percussion', break: 'breakbeat' };
const pendingSections = new Map(); // module -> section, waiting for the bar line
const SECTION_ALL = ['arp', 'seq', 'osc1', 'osc2', 'prog', 'chords', 'mono', 'drum', 'break']; // what Section (top bar) switches

function sectionsOk() {
  if (!settings.sectionSlot || typeof settings.sectionSlot !== 'object') settings.sectionSlot = {};
  if (!settings.sectionStore || typeof settings.sectionStore !== 'object') settings.sectionStore = {};
  for (const m of Object.keys(SECTION_KEYS)) {
    if (!SLOTS.includes(settings.sectionSlot[m])) settings.sectionSlot[m] = 'A';
    if (!settings.sectionStore[m] || typeof settings.sectionStore[m] !== 'object') settings.sectionStore[m] = {};
  }
}
sectionsOk();
Object.assign(DEFAULTS, {
  sectionSlot: Object.fromEntries(Object.keys(SECTION_KEYS).map((m) => [m, 'A'])),
  sectionStore: Object.fromEntries(Object.keys(SECTION_KEYS).map((m) => [m, {}])),
});

/** The section a module is on (drums and break keep their own slot settings). */
const sectionOf = (m) => (m === 'drum' ? settings.drumSlot : m === 'break' ? settings.breakSlot : settings.sectionSlot[m]);

/** Switch one module now (to `slot`). */
function switchSection(m, slot) {
  if (m === 'drum') { selectDrumSlot(slot); return; }
  if (m === 'break') { selectBreakSlot(slot); return; }
  const cur = settings.sectionSlot[m];
  if (slot === cur) return;
  const keys = SECTION_KEYS[m];
  const store = settings.sectionStore[m];
  store[cur] = structuredClone(Object.fromEntries(keys.map((k) => [k, settings[k]])));
  const next = store[slot] ? store[slot] : structuredClone(store[cur]);
  delete store[slot];
  for (const k of keys) if (k in next) settings[k] = next[k];
  settings.sectionSlot[m] = slot;
}

/** Ask for a section: now when stopped, on the next bar line while playing. */
function requestSections(mods, slot) {
  if (!playing) {
    for (const m of mods) switchSection(m, slot);
    afterSections();
    return;
  }
  for (const m of mods) {
    if (sectionOf(m) === slot) pendingSections.delete(m);
    else pendingSections.set(m, slot);
  }
  renderSections();
}

/** Song (Whole sections): on each bar line, every module to the section of the song's bar. */
function songSections(pulse) {
  const chain = settings.songChain;
  if (!chain.length) return;
  const want = chain[Math.floor(pulse / (PPQN * 4)) % chain.length];
  const move = SECTION_ALL.filter((m) => sectionOf(m) !== want);
  if (!move.length) return;
  for (const m of move) switchSection(m, want);
  pendingSections.clear();
  uiEvents.length = 0;
  afterSections();
}

function applyPendingSections() {
  for (const [m, slot] of pendingSections) switchSection(m, slot);
  pendingSections.clear();
  uiEvents.length = 0; // queued display updates refer to the old patterns
  afterSections();
}

/** Every window re-reads its settings (as for a scene), then the buttons. */
function afterSections() {
  for (const fn of recallHooks) {
    try { fn(); } catch (err) { console.error('section:', err); }
  }
  renderSections();
  save();
}

function renderSections() {
  for (const m of Object.keys(SECTION_KEYS)) {
    const box = $(`section-${m}`);
    if (!box) continue;
    box.querySelectorAll('button').forEach((b) => {
      const s = b.dataset.slot;
      b.setAttribute('aria-pressed', String(s === settings.sectionSlot[m]));
      b.classList.toggle('used', s === settings.sectionSlot[m] || !!settings.sectionStore[m][s]);
      b.classList.toggle('pending', pendingSections.get(m) === s);
    });
  }
  // Section (all): lit when every module is on the same one.
  const all = SECTION_ALL;
  const same = all.every((m) => sectionOf(m) === sectionOf('seq')) ? sectionOf('seq') : null;
  const want = new Set(all.map((m) => pendingSections.get(m)).filter(Boolean));
  $('section-all').querySelectorAll('button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.slot === same));
    b.classList.toggle('pending', want.size === 1 && want.has(b.dataset.slot));
  });
  renderSlotButtons();
}

function sectionButtons(box, label, onPick) {
  for (const s of SLOTS) {
    const b = document.createElement('button');
    b.textContent = s;
    b.dataset.slot = s;
    b.title = `${label} ${s}`;
    b.addEventListener('click', () => onPick(s));
    box.append(b);
  }
}
for (const m of Object.keys(SECTION_KEYS)) {
  const wrap = document.createElement('div');
  wrap.className = 'field inline section-field';
  wrap.title = `Sections A–D of the ${SECTION_NAMES[m]}: a new one starts as a copy of the one you're on. While playing, a switch comes in on the next bar line.`;
  wrap.append('Section ');
  const box = document.createElement('div');
  box.className = 'seg slots';
  box.id = `section-${m}`;
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', `${SECTION_NAMES[m]} section`);
  sectionButtons(box, `${SECTION_NAMES[m][0].toUpperCase()}${SECTION_NAMES[m].slice(1)} section`, (s) => requestSections([m], s));
  wrap.append(box);
  const home = $(SECTION_HOME[m]);
  (home.closest('label') || home).after(wrap);
}
sectionButtons($('section-all'), 'Every module: section', (s) => requestSections(SECTION_ALL, s));
onRecall(() => { sectionsOk(); pendingSections.clear(); });
onRecall(renderSections);
renderSections();

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
function applyScene(data, currentId = null, name = '', messages = {}) {
  pendingScene = { data, currentId, name, done: messages.done };
  if (playing) {
    sceneStatus(messages.later || (name ? `"${name}" comes in on the next bar…` : 'Going back on the next bar…'));
    renderScenes();
  } else applyPendingScene();
}

/** Swap the settings for the pending scene and have every window re-read them. */
function applyPendingScene() {
  if (!pendingScene) return;
  const { data, currentId, name, done } = pendingScene;
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
  sceneStatus(done || (name ? `Recalled "${name}".` : 'Back to how it was before the recall.'));
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
// Clear all: back to how the app starts, as a recall of the defaults (so it comes in on
// the next bar while playing, and Undo recall brings everything back).
confirmClick($('clear-all'), () => {
  applyScene({}, null, '', {
    later: 'Clearing everything on the next bar…',
    done: 'Cleared everything back to the defaults. Undo recall brings it back.',
  });
}, { ask: 'Sure? Clear all' });

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
  if (!collapsed && panel.id === 'break-panel') requestAnimationFrame(() => { drawBreak(); drawTrimOverview(); drawTrimZoom(); }); // canvases need their width again
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
function applySolo(instant = false, at = null) {
  if (!ctx) return;
  const t = at ?? ctx.currentTime;
  for (const key of Object.values(SOLO_PANELS)) {
    const bus = buses[key];
    if (!bus) continue;
    // A section sounds when it's soloed (or nothing is) and Arr hasn't muted it.
    const v = (soloed.size === 0 || soloed.has(key)) && !arrMuted.has(key) && !settings.mixMute?.[key] ? 1 : 0;
    if (instant) bus.gain.value = v;
    else bus.gain.setTargetAtTime(v, t, 0.008);
    // The tracker's effect throws go with the breakbeat.
    if (key === 'break') {
      for (const g of Object.values(throwIn)) {
        if (instant) g.gain.value = v;
        else g.gain.setTargetAtTime(v, t, 0.008);
      }
    }
  }
}

// ---- Arr: an automatic arranger. Every few bars, on the bar line, it mutes a random
// selection of the sections that are on (at least two keep playing). Cancel brings
// everything back.
const arrMuted = new Set();
let arrOn = false;
let arrReroll = false; // pressed Arr while running: change on the very next bar
const ARR_SECTIONS = { arp: 'arpOn', chords: 'chordOn', bass: 'monoOn', perc: 'drumOn', break: 'breakOn' };

/** On a bar line: maybe change the arrangement (called from the clock). */
function arrPulse(pulse, time) {
  if (!arrOn || pulse % (PPQN * 4) !== 0) return;
  const bar = pulse / (PPQN * 4);
  if (!arrReroll && bar % settings.arrBars !== 0) return;
  arrReroll = false;
  const active = Object.keys(ARR_SECTIONS).filter((k) => settings[ARR_SECTIONS[k]]);
  const next = arrangeMutes(active, arrMuted);
  arrMuted.clear();
  for (const k of next) arrMuted.add(k);
  applySolo(false, time); // lands exactly on the bar line
  uiEvents.push({ kind: 'arr', time });
}

function renderArr() {
  renderMixer();
  $('arr').setAttribute('aria-pressed', String(arrOn));
  $('arr').textContent = arrOn ? `Arr ${arrMuted.size ? `−${arrMuted.size}` : '●'}` : 'Arr';
  $('arr-cancel').disabled = !arrOn && !arrMuted.size;
  for (const [label, key] of Object.entries(SOLO_PANELS)) {
    const panel = document.querySelector(`main > .panel[aria-label="${label}"]`);
    panel?.classList.toggle('arr-muted', arrMuted.has(key));
    dockChips.get(label)?.classList.toggle('arr-muted', arrMuted.has(key));
  }
}

$('arr').addEventListener('click', () => {
  if (arrOn) arrReroll = true; // already arranging: a new arrangement on the next bar
  else {
    arrOn = true;
    arrReroll = true; // the first change on the next bar
    ensureAudio();
    if (!playing && settings.sync === 'internal') setPlaying(true);
  }
  renderArr();
});
$('arr-cancel').addEventListener('click', () => {
  arrOn = false;
  arrReroll = false;
  arrMuted.clear();
  applySolo(); // everything back, now
  renderArr();
});
bindSelect('arr-bars', 'arrBars', [['1', '1 bar'], ['2', '2 bars'], ['4', '4 bars'], ['8', '8 bars']]);
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
  Percussion: 'Drums', 'Breakbeat slicer': 'Break', Recorder: 'Rec', Song: 'Song', Effects: 'FX', 'Sound and MIDI': 'MIDI',
};
const DOCK_GROUP_STARTS = new Set(['Arpeggiator', 'Chord progression', 'Mono synth', 'Percussion', 'Effects']);
const dockChips = new Map(); // panel label -> its jump-bar chip
document.querySelectorAll('main > .panel').forEach((panel) => {
  const label = panel.getAttribute('aria-label');
  const chip = document.createElement('button');
  dockChips.set(label, chip);
  chip.textContent = DOCK_NAMES[label] || label;
  chip.title = `Go to ${panel.querySelector('h2')?.textContent || label}`;
  if (DOCK_GROUP_STARTS.has(label)) chip.classList.add('group-start');
  chip.addEventListener('click', () => {
    if (panel.classList.contains('collapsed')) { setCollapsed(panel, false); save(); }
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Windows not yet seen are laid out with an estimated height until they come into view,
    // so a long jump can stop short: once the scroll settles, finish it in one step.
    let done = false;
    const settle = () => {
      if (done) return;
      done = true;
      window.removeEventListener('scrollend', settle);
      const dock = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock-h')) || 0;
      const off = () => Math.abs(panel.getBoundingClientRect().top - dock) > 2;
      // Twice: the windows passed over can still change height as they render.
      if (off()) panel.scrollIntoView({ block: 'start' });
      requestAnimationFrame(() => requestAnimationFrame(() => { if (off()) panel.scrollIntoView({ block: 'start' }); }));
    };
    window.addEventListener('scrollend', settle);
    setTimeout(settle, 1200);
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

// ---------------------------------------------------------------- mixer
// A console over the page: one channel strip per section and effect return, plus the
// master, each with a fader, a live meter, Mute and (sections) Solo. A fader moves the
// same setting as the window's own Level slider, so the two always agree.
if (!settings.mixMute || typeof settings.mixMute !== 'object') settings.mixMute = {};
const MIX_STRIPS = [
  { key: 'arp', name: 'Arp', input: 'arp-level', on: 'arp-on', node: () => faders.arp, solo: 'arp' },
  { key: 'chords', name: 'Chords', input: 'chord-level', on: 'chord-on', node: () => faders.chords, solo: 'chords' },
  { key: 'bass', name: 'Mono', input: 'mono-level', on: 'mono-on', node: () => faders.bass, solo: 'bass' },
  { key: 'perc', name: 'Drums', input: 'drum-level', on: 'drum-on', node: () => faders.perc, solo: 'perc' },
  { key: 'break', name: 'Break', input: 'break-level', on: 'break-on', node: () => faders.break, solo: 'break' },
  { key: 'delay', name: 'Delay', setting: 'delayReturn', fx: 'delay', node: () => delayFx?.out, sep: true },
  { key: 'reverb', name: 'Reverb', setting: 'reverbReturn', fx: 'reverb', node: () => reverbFx?.out },
  { key: 'harm', name: 'Harm', input: 'harm-level', fx: 'harm', node: () => harmOut },
  { key: 'master', name: 'Master', input: 'volume', node: () => synth?.master, sep: true, master: true },
];
const mixMeters = new Map(); // strip key -> {an, data, el, peak, hold}
let mixRaf = 0;

const levelDb = (pct) => (pct <= 0 ? '−∞' : `${(20 * Math.log10(pct / 100)).toFixed(1)}`);

/** The strip's current value (0–100), from the window control it shares or its own setting. */
function stripValue(s) {
  if (s.input) return Number($(s.input).value);
  return settings[s.setting];
}

function setStripValue(s, v) {
  if (s.input) {
    // Move the window's own slider: its handler sets the level and saves.
    const el = $(s.input);
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    settings[s.setting] = v;
    applyFxMutes();
    save();
  }
}

function stripMuted(s) {
  if (s.fx) return !!settings[`${s.fx}Muted`];
  if (s.master) return !settings.synthOn;
  return !!settings.mixMute[s.key];
}

function toggleStripMute(s) {
  if (s.fx) { $(`${s.fx}-mute`).click(); return; }
  if (s.master) { $('synth-on').click(); return; }
  settings.mixMute[s.key] = !settings.mixMute[s.key];
  applySolo();
  save();
  renderMixer();
}

function buildMixer() {
  const wrap = $('mixer-strips');
  wrap.replaceChildren();
  for (const s of MIX_STRIPS) {
    const strip = document.createElement('div');
    strip.className = `strip${s.sep ? ' sep' : ''}${s.master ? ' master' : ''}${s.fx ? ' fx' : ''}`;
    strip.dataset.key = s.key;
    strip.innerHTML = `
      <div class="strip-name">${s.name}</div>
      <div class="strip-db"></div>
      <div class="strip-body">
        <div class="meter"><div class="meter-fill"><div class="meter-grad"></div></div><div class="meter-peak"></div></div>
        <input class="fader" type="range" min="0" max="100" step="1" aria-label="${s.name} fader" />
      </div>
      ${s.on ? `<button class="strip-on" aria-pressed="false" aria-label="Turn ${s.name} on or off">Off</button>` : ''}
      <div class="strip-btns">
        <button class="mute" aria-pressed="false" aria-label="Mute ${s.name}">M</button>
        ${s.solo ? `<button class="solo" aria-pressed="false" aria-label="Solo ${s.name}">S</button>` : ''}
      </div>`;
    const fader = strip.querySelector('.fader');
    fader.value = String(stripValue(s));
    fader.addEventListener('input', () => { setStripValue(s, Number(fader.value)); renderStripValue(s, strip); });
    fader.addEventListener('dblclick', () => { fader.value = s.master ? '50' : s.key === 'delay' || s.key === 'reverb' ? '100' : '80'; fader.dispatchEvent(new Event('input')); });
    strip.querySelector('.strip-on')?.addEventListener('click', () => { $(s.on).click(); renderMixer(); });
    strip.querySelector('.mute').addEventListener('click', () => { toggleStripMute(s); renderMixer(); });
    strip.querySelector('.solo')?.addEventListener('click', (e) => {
      soloButtons[s.solo]?.dispatchEvent(new MouseEvent('click', { altKey: e.altKey }));
      renderMixer();
    });
    wrap.append(strip);
  }
  renderMixer();
}

function renderStripValue(s, strip) {
  const v = stripValue(s);
  strip.querySelector('.strip-db').textContent = `${v}% · ${levelDb(v)} dB`;
}

function renderMixer() {
  if ($('mixer').hidden) return;
  for (const s of MIX_STRIPS) {
    const strip = $('mixer-strips').querySelector(`.strip[data-key="${s.key}"]`);
    if (!strip) continue;
    const fader = strip.querySelector('.fader');
    if (document.activeElement !== fader) fader.value = String(stripValue(s));
    renderStripValue(s, strip);
    const muted = stripMuted(s);
    strip.querySelector('.mute').setAttribute('aria-pressed', String(muted));
    strip.classList.toggle('muted', muted);
    const onBtn = strip.querySelector('.strip-on');
    if (onBtn) {
      const on = $(s.on).getAttribute('aria-pressed') === 'true';
      onBtn.setAttribute('aria-pressed', String(on));
      onBtn.textContent = on ? 'On' : 'Off';
      strip.classList.toggle('off', !on);
    }
    const solo = strip.querySelector('.solo');
    if (solo) solo.setAttribute('aria-pressed', String(soloed.has(s.solo)));
    strip.classList.toggle('silenced', !!s.solo && ((soloed.size > 0 && !soloed.has(s.solo)) || arrMuted.has(s.solo)));
  }
}

/** A strip's meter parts, looked up once per build of the console. */
let meterCache = new Map();
function meterEls(key) {
  let ui = meterCache.get(key);
  if (ui && ui.meter.isConnected) return ui;
  const strip = $('mixer-strips').querySelector(`.strip[data-key="${key}"]`);
  if (!strip) return null;
  const meter = strip.querySelector('.meter');
  ui = { meter, fill: meter.querySelector('.meter-fill'), grad: meter.querySelector('.meter-grad'), peak: meter.querySelector('.meter-peak'), fillAt: -1, holdAt: -1, hot: false };
  meterCache.set(key, ui);
  return ui;
}

/** Meters: a peak level per strip, read from an analyser on its output. */
let meterAt = 0;
function meterLoop() {
  if ($('mixer').hidden) { mixRaf = 0; return; }
  // Steadier playback: meters at about 15 frames a second.
  if (settings.stableMode && performance.now() - meterAt < 66) { mixRaf = requestAnimationFrame(meterLoop); return; }
  meterAt = performance.now();
  for (const s of MIX_STRIPS) {
    let m = mixMeters.get(s.key);
    const node = ctx ? s.node() : null;
    if (!m && node) {
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      node.connect(an);
      m = { an, data: new Float32Array(1024), peak: 0, hold: 0, holdT: 0 };
      mixMeters.set(s.key, m);
    }
    const ui = meterEls(s.key);
    if (!ui) continue;
    let level = 0;
    if (m) {
      m.an.getFloatTimeDomainData(m.data);
      for (const x of m.data) level = Math.max(level, Math.abs(x));
    }
    // Fast attack, slow fall; a peak marker that holds for a moment.
    m && (m.peak = Math.max(level, m.peak * 0.9));
    const peak = m ? m.peak : 0;
    if (m && level >= m.hold) { m.hold = level; m.holdT = performance.now(); } else if (m && performance.now() - m.holdT > 1200) m.hold *= 0.95;
    const toPos = (x) => Math.max(0, Math.min(1, (20 * Math.log10(Math.max(x, 1e-6)) + 60) / 60)); // −60…0 dB
    // Transforms only, and only when the drawn position moves (in steps of 0.2%).
    const fill = Math.round(toPos(peak) * 500) / 5;
    const hold = Math.round(toPos(m ? m.hold : 0) * 500) / 5;
    if (fill !== ui.fillAt) {
      ui.fillAt = fill;
      ui.fill.style.transform = `translateY(${100 - fill}%)`;
      ui.grad.style.transform = `translateY(${fill - 100}%)`;
    }
    if (hold !== ui.holdAt) {
      ui.holdAt = hold;
      ui.peak.style.transform = `translateY(calc(${-hold}% + ${hold * 0.02}px))`;
    }
    const hot = peak > 0.89;
    if (hot !== ui.hot) { ui.hot = hot; ui.meter.classList.toggle('hot', hot); }
  }
  mixRaf = requestAnimationFrame(meterLoop);
}

function openMixer(open) {
  $('mixer').hidden = !open;
  $('mixer-btn').setAttribute('aria-pressed', String(open));
  if (open) {
    buildMixer();
    if (!mixRaf) mixRaf = requestAnimationFrame(meterLoop);
  }
}
$('mixer-btn').addEventListener('click', () => openMixer($('mixer').hidden));
$('mixer-close').addEventListener('click', () => openMixer(false));
$('mixer').addEventListener('pointerdown', (e) => { if (e.target === $('mixer')) openMixer(false); });
window.addEventListener('keydown', (e) => { if (!$('mixer').hidden && e.key === 'Escape') openMixer(false); });
// Keep the console in step with changes made elsewhere (the windows, MIDI, scenes, Arr).
document.addEventListener('input', (e) => { if (!$('mixer').hidden && !e.target.closest?.('#mixer')) renderMixer(); }, true);
document.addEventListener('click', (e) => { if (!$('mixer').hidden && !e.target.closest?.('#mixer')) requestAnimationFrame(renderMixer); }, true);
onRecall(() => { if (!settings.mixMute || typeof settings.mixMute !== 'object') settings.mixMute = {}; applySolo(); renderMixer(); });

// ---------------------------------------------------------------- boot
buildSteps();
renderLengthButtons();
renderOsc2(); // also renders the steps
onRecall(() => {
  renderLengthButtons();
  renderOsc2();
  if (synth) { synth.wave = settings.wave; synth.cutoff = settings.cutoff; }
  applyFaders();
  renderKeyState();
});
buildChordPads();
buildKeyboard();
renderLearn(); // mark mapped controls built during boot (the sequencer steps)
requestAnimationFrame(frame);
