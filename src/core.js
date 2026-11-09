// Pure arpeggiator + step-sequencer engine. No browser APIs — clock-agnostic
// and unit-testable. Every call to next() produces one arpeggiated note, with
// the current sequencer step's pitch offset and volume applied to it.

export const MODES = ['up', 'down', 'updown', 'downup', 'random', 'order'];

export const MODE_LABELS = {
  up: 'Up',
  down: 'Down',
  updown: 'Up/Down',
  downup: 'Down/Up',
  random: 'Random',
  order: 'As Played',
};

// Clock pulses (24 PPQN, the MIDI clock standard) per arpeggiator step.
export const PPQN = 24;
export const RATES = {
  '1/4': 24,
  '1/8D': 18, // dotted 8th
  '1/8': 12,
  '1/8T': 8,
  '1/16': 6,
  '1/16T': 4,
  '1/32': 3,
};

export const MIN_SEQ_LENGTH = 2;
export const MAX_SEQ_LENGTH = 6;
export const PITCH_RANGE = 24; // ± semitones per sequencer step
export const MAX_OCTAVES = 4;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Build the arp pattern from the active notes.
 * @param {Array<{note:number, vel:number, order:number}>} notes
 * @param {string} mode one of MODES
 * @param {number} octaves 1..MAX_OCTAVES
 * @returns {Array<{note:number, vel:number}>}
 */
export function buildPattern(notes, mode, octaves = 1) {
  if (!notes.length) return [];
  const base = [...notes].sort(
    mode === 'order' ? (a, b) => a.order - b.order : (a, b) => a.note - b.note,
  );
  const octs = clamp(Math.round(octaves), 1, MAX_OCTAVES);
  const up = [];
  for (let o = 0; o < octs; o++) {
    for (const n of base) {
      const note = n.note + 12 * o;
      if (note <= 127) up.push({ note, vel: n.vel });
    }
  }
  switch (mode) {
    case 'down':
      return up.reverse();
    case 'updown':
      // a b c b | a b c b ... — the end points are not repeated.
      return up.concat(up.slice(1, -1).reverse());
    case 'downup': {
      const down = up.reverse();
      return down.concat(down.slice(1, -1).reverse());
    }
    default: // up, order, random (random picks from this pool)
      return up;
  }
}

export function defaultSteps() {
  return [
    { offset: 0, volume: 100, on: true },
    { offset: 12, volume: 70, on: true },
    { offset: 0, volume: 85, on: true },
    { offset: 7, volume: 60, on: true },
    { offset: -12, volume: 100, on: true },
    { offset: 5, volume: 75, on: true },
  ];
}

export class ArpSeqEngine {
  constructor({ rng = Math.random } = {}) {
    this.rng = rng;
    this.mode = 'up';
    this.octaves = 1;
    this.latch = false;
    this.steps = defaultSteps(); // always MAX_SEQ_LENGTH entries
    this.length = 4;
    this.physical = new Map(); // keys currently held down
    this.active = new Map(); // notes the arp plays (held or latched)
    this.orderCounter = 0;
    this.progression = []; // notes supplied by the chord-progression sequencer
    this.reset();
  }

  reset() {
    this.arpPos = 0;
    this.seqPos = 0;
    this.lastIndex = -1;
    this.lastStepIndex = null;
  }

  noteOn(note, vel = 100) {
    if (this.physical.size === 0 && this.latch) {
      // Fresh chord while latched: replace the latched notes.
      this.active.clear();
    }
    if (this.notes.length === 0) this.reset();
    const entry = { note, vel: clamp(vel, 1, 127), order: this.orderCounter++ };
    this.physical.set(note, entry);
    this.active.set(note, entry);
  }

  noteOff(note) {
    this.physical.delete(note);
    if (!this.latch) this.active.delete(note);
  }

  setLatch(on) {
    this.latch = !!on;
    if (!this.latch) {
      for (const note of [...this.active.keys()]) {
        if (!this.physical.has(note)) this.active.delete(note);
      }
    }
  }

  clearNotes() {
    this.physical.clear();
    this.active.clear();
    this.reset();
  }

  setMode(mode) {
    if (MODES.includes(mode)) this.mode = mode;
  }

  setOctaves(n) {
    this.octaves = clamp(Math.round(n), 1, MAX_OCTAVES);
  }

  setLength(n) {
    this.length = clamp(Math.round(n), MIN_SEQ_LENGTH, MAX_SEQ_LENGTH);
    this.seqPos %= this.length;
  }

  setStep(i, { offset, volume, on } = {}) {
    const step = this.steps[i];
    if (!step) return;
    if (on !== undefined) step.on = !!on;
    if (offset !== undefined) step.offset = clamp(Math.round(offset), -PITCH_RANGE, PITCH_RANGE);
    if (volume !== undefined) step.volume = clamp(Math.round(volume), 0, 100);
  }

  /** Advance the sequencer one step and return it, with its index. */
  takeStep() {
    const stepIndex = this.seqPos;
    this.seqPos = (this.seqPos + 1) % this.length;
    return { stepIndex, ...this.steps[stepIndex] };
  }

  /** The sequencer step the arp played most recently (what a following chord layer uses). */
  get currentStep() {
    return this.steps[this.lastStepIndex ?? 0];
  }

  /** Notes the arp plays: held/latched notes plus the current progression chord. */
  get notes() {
    if (!this.progression.length) return [...this.active.values()];
    return [...this.active.values(), ...this.progression.filter((n) => !this.active.has(n.note))];
  }

  /** Set the progression chord (MIDI note numbers); [] for none. */
  setProgressionNotes(notes) {
    if (notes.length && this.notes.length === 0) this.reset();
    // Negative order: in As Played mode the progression chord comes first, root up.
    this.progression = notes.map((note, i) => ({ note, vel: 100, order: i - notes.length }));
  }

  get pattern() {
    return buildPattern(this.notes, this.mode, this.octaves);
  }

  /**
   * Advance the arp and the sequencer by one step.
   * @returns {null | {note, velocity, sourceNote, stepIndex, offset, volume, rest}}
   *   null when no notes are active. velocity is 0 when the step's volume is 0.
   *   For a step switched off (`rest: true`) nothing is struck: the arp and sequencer
   *   still advance, and `note` is where a still-ringing tail should slide to — the
   *   arp note this step would have played plus its interval.
   */
  next() {
    const pattern = this.pattern;
    if (!pattern.length) return null;

    let idx;
    if (this.mode === 'random') {
      idx = Math.floor(this.rng() * pattern.length);
      if (pattern.length > 1 && idx === this.lastIndex) {
        idx = (idx + 1 + Math.floor(this.rng() * (pattern.length - 1))) % pattern.length;
      }
    } else {
      idx = this.arpPos % pattern.length;
      this.arpPos = idx + 1;
    }
    this.lastIndex = idx;

    const step = this.takeStep();
    const { stepIndex } = step;
    this.lastStepIndex = stepIndex;

    const src = pattern[idx];
    if (step.on === false) {
      return {
        rest: true,
        note: clamp(src.note + step.offset, 0, 127),
        velocity: 0,
        sourceNote: src.note,
        stepIndex,
        offset: step.offset,
        volume: step.volume,
      };
    }
    const velocity = step.volume === 0 ? 0 : clamp(Math.round((src.vel * step.volume) / 100), 1, 127);
    return {
      rest: false,
      note: clamp(src.note + step.offset, 0, 127),
      velocity,
      sourceNote: src.note,
      stepIndex,
      offset: step.offset,
      volume: step.volume,
    };
  }
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function noteName(n) {
  return NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1);
}

// Chord types: intervals in semitones above the root. The pads use the first four;
// the progression sequencer can use them all.
export const CHORDS = {
  maj: { label: 'Maj', intervals: [0, 4, 7] },
  min: { label: 'min', intervals: [0, 3, 7] },
  min7: { label: 'min7', intervals: [0, 3, 7, 10] },
  maj7: { label: 'maj7', intervals: [0, 4, 7, 11] },
  dom7: { label: '7', intervals: [0, 4, 7, 10] },
  dim: { label: 'dim', intervals: [0, 3, 6] },
  sus4: { label: 'sus4', intervals: [0, 5, 7] },
};
export const PAD_CHORDS = ['maj', 'min', 'min7', 'maj7'];

export function chordNotes(root, type) {
  const chord = CHORDS[type];
  if (!chord) return [];
  return chord.intervals.map((i) => root + i).filter((n) => n >= 0 && n <= 127);
}

// Oscillator 2 follows the same sequencer step as oscillator 1, using either the
// step's offset ('same') or its mirror image ('invert': +7 → −7), plus a fixed transpose.
export const OSC2_MODES = { same: 'Same', invert: 'Inverted' };

export function osc2Note(ev, mode, transpose = 0) {
  const offset = mode === 'invert' ? -ev.offset : ev.offset;
  return clamp(ev.sourceNote + offset + transpose, 0, 127);
}

// Euclidean rhythms: `hits` onsets spread as evenly as possible over `steps`,
// rotated right by `rotate` (e.g. 3 in 8 → x..x..x.).
export const MAX_EUCLID_STEPS = 16;

export function euclid(hits, steps, rotate = 0) {
  const n = clamp(Math.round(steps), 1, MAX_EUCLID_STEPS);
  const k = clamp(Math.round(hits), 0, n);
  const r = ((Math.round(rotate) % n) + n) % n;
  const base = Array.from({ length: n }, (_, i) => (i * k) % n < k);
  return base.map((_, i) => base[(i - r + n) % n]);
}

/**
 * The chord-rhythm layer's notes for one hit: every held note (lowest first),
 * moved by `octave` and, only if a sequencer `step` is given, shifted by its
 * offset and scaled by its volume.
 * @returns {Array<{note:number, velocity:number}>}
 */
export function chordVoicing(held, { octave = 0, step = null } = {}) {
  const offset = 12 * octave + (step ? step.offset : 0);
  const volume = step ? step.volume : 100;
  if (volume === 0) return [];
  const seen = new Set();
  return [...held]
    .sort((a, b) => a.note - b.note)
    .map((n) => ({
      note: n.note + offset,
      velocity: clamp(Math.round((n.vel * volume) / 100), 1, 127),
    }))
    .filter((n) => n.note >= 0 && n.note <= 127 && !seen.has(n.note) && seen.add(n.note));
}

/**
 * Where a Euclidean pattern running at `pulsesPerStep` is at clock `pulse`, and
 * whether that position is a hit. Used to gate the arp with the chord rhythm.
 */
export function patternAt(pulse, pulsesPerStep, hits, steps, rotate = 0) {
  const pattern = euclid(hits, steps, rotate);
  const pos = Math.floor(pulse / pulsesPerStep) % pattern.length;
  return { pos, hit: pattern[pos] };
}

// ---- chord progression sequencer
export const MAX_PROGRESSION = 8;
export const PROGRESSION_BEATS = [1, 2, 3, 4, 6, 8];

/** Which slot is playing at clock `pulse`, for slots of {beats}. Loops forever. */
export function progressionAt(pulse, slots) {
  const total = slots.reduce((sum, s) => sum + s.beats, 0) * PPQN;
  if (!total) return -1;
  let t = pulse % total;
  for (let i = 0; i < slots.length; i++) {
    t -= slots[i].beats * PPQN;
    if (t < 0) return i;
  }
  return slots.length - 1;
}

/** Notes for a progression slot {root (0-11), type, beats} in the given octave; [] for a rest. */
export function slotNotes(slot, octave) {
  if (!slot || slot.type === 'rest') return [];
  return chordNotes((octave + 1) * 12 + slot.root, slot.type);
}

export const PROGRESSION_PRESETS = {
  'I–V–vi–IV (C)': [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']],
  'ii–V–I (C)': [[2, 'min7'], [7, 'dom7'], [0, 'maj7'], [0, 'maj7']],
  'I–vi–ii–V (C)': [[0, 'maj7'], [9, 'min7'], [2, 'min7'], [7, 'dom7']],
  'i–VI–III–VII (Am)': [[9, 'min'], [5, 'maj'], [0, 'maj'], [7, 'maj']],
  'i–iv–v–i (Am)': [[9, 'min7'], [2, 'min7'], [4, 'min7'], [9, 'min7']],
};

export function defaultProgression() {
  return Array.from({ length: MAX_PROGRESSION }, (_, i) => {
    const [root, type] = PROGRESSION_PRESETS['I–V–vi–IV (C)'][i % 4];
    return { root, type, beats: 4 };
  });
}

// Filter cutoff sliders are logarithmic: equal slider travel = equal musical
// interval, so the low end gets as much room as the top. Positions run 0..1000.
export const CUTOFF_MIN = 60;
export const CUTOFF_MAX = 12000;
export const SLIDER_STEPS = 1000;

export function sliderToFreq(pos, min = CUTOFF_MIN, max = CUTOFF_MAX) {
  const x = clamp(pos, 0, SLIDER_STEPS) / SLIDER_STEPS;
  return Math.round(min * Math.pow(max / min, x));
}

export function freqToSlider(freq, min = CUTOFF_MIN, max = CUTOFF_MAX) {
  const f = clamp(freq, min, max);
  return Math.round((Math.log(f / min) / Math.log(max / min)) * SLIDER_STEPS);
}

export function formatHz(f) {
  return f < 1000 ? `${Math.round(f)} Hz` : `${(f / 1000).toFixed(f < 10000 ? 2 : 1)} kHz`;
}
