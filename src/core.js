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
  '1/8': 12,
  '1/8T': 8,
  '1/16': 6,
  '1/16T': 4,
  '1/32': 3,
};

export const MIN_SEQ_LENGTH = 2;
export const MAX_SEQ_LENGTH = 5;
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
    { offset: 0, volume: 100 },
    { offset: 12, volume: 70 },
    { offset: 0, volume: 85 },
    { offset: 7, volume: 60 },
    { offset: -12, volume: 100 },
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
    this.reset();
  }

  reset() {
    this.arpPos = 0;
    this.seqPos = 0;
    this.lastIndex = -1;
  }

  noteOn(note, vel = 100) {
    if (this.physical.size === 0 && this.latch) {
      // Fresh chord while latched: replace the latched notes.
      this.active.clear();
    }
    if (this.active.size === 0) this.reset();
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

  setStep(i, { offset, volume } = {}) {
    const step = this.steps[i];
    if (!step) return;
    if (offset !== undefined) step.offset = clamp(Math.round(offset), -PITCH_RANGE, PITCH_RANGE);
    if (volume !== undefined) step.volume = clamp(Math.round(volume), 0, 100);
  }

  get pattern() {
    return buildPattern([...this.active.values()], this.mode, this.octaves);
  }

  /**
   * Advance the arp and the sequencer by one step.
   * @returns {null | {note:number, velocity:number, sourceNote:number, stepIndex:number, offset:number, volume:number}}
   *   null when no notes are active. velocity is 0 when the step is muted.
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

    const stepIndex = this.seqPos;
    const step = this.steps[stepIndex];
    this.seqPos = (this.seqPos + 1) % this.length;

    const src = pattern[idx];
    const velocity = step.volume === 0 ? 0 : clamp(Math.round((src.vel * step.volume) / 100), 1, 127);
    return {
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

// Chord pads: intervals in semitones above the root.
export const CHORDS = {
  maj: { label: 'Maj', intervals: [0, 4, 7] },
  min: { label: 'min', intervals: [0, 3, 7] },
  min7: { label: 'min7', intervals: [0, 3, 7, 10] },
  maj7: { label: 'maj7', intervals: [0, 4, 7, 11] },
};

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
