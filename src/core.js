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
  '1/4D': 36, // dotted quarter
  '1/4': 24,
  '1/8D': 18, // dotted 8th
  '1/8': 12,
  '1/8T': 8,
  '1/16D': 9, // dotted 16th
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
    this.heldShift = 0; // semitones added to held/latched notes (the progression's modulation)
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
    return this.notesWith(this.progression);
  }

  /** Held notes plus a progression chord (as made by progressionChord), held keys winning. */
  notesWith(progression) {
    const held = this.heldShift
      ? [...this.active.values()].map((n) => ({ ...n, note: n.note + this.heldShift })).filter((n) => n.note >= 0 && n.note <= 127)
      : [...this.active.values()];
    if (!progression.length) return held;
    const taken = new Set(held.map((n) => n.note));
    return [...held, ...progression.filter((n) => !taken.has(n.note))];
  }

  /** Set the progression chord (MIDI note numbers); [] for none. */
  setProgressionNotes(notes) {
    if (notes.length && this.notes.length === 0) this.reset();
    this.progression = progressionChord(notes);
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

/** A progression chord as note objects. Negative order: in As Played mode it comes first, root up. */
export function progressionChord(notes) {
  return notes.map((note, i) => ({ note, vel: 100, order: i - notes.length }));
}

/**
 * Syncopation: a chord hit at `pulse` in the last 8th note before the progression
 * moves on (the hit, or any part of the final 8th, is on or after it) anticipates
 * the next chord. Returns that next slot's index, or -1 when the hit is not in the
 * last 8th or the chord doesn't change.
 */
export function anticipatedSlot(pulse, slots, eighth = PPQN / 2) {
  const now = progressionAt(pulse, slots);
  if (now < 0) return -1;
  const next = progressionAt(pulse + eighth, slots);
  return next !== now ? next : -1;
}

/**
 * Tie-over for syncopated chords, for chord-rhythm step `n` (steps of `pps` pulses;
 * `isHit(step)` says whether the rhythm hits there):
 *  - 'start': the first pushed hit before a change whose downbeat (first step at or
 *    after the change) is also a hit. It holds through to that downbeat; `until` is it.
 *  - 'held': a later pushed hit, or that downbeat: it isn't struck again.
 *  - 'none': play as usual (no push, or no downbeat hit to tie into).
 */
export function chordTie(n, pps, slots, isHit) {
  const slotAt = (s) => progressionAt(s * pps, slots);
  const pushed = (s) => s >= 0 && anticipatedSlot(s * pps, slots) >= 0;
  /** An earlier pushed hit in the same run up to the change? */
  const hitBefore = (from, slot) => {
    for (let k = from; pushed(k) && slotAt(k) === slot; k--) if (isHit(k)) return true;
    return false;
  };
  if (pushed(n)) {
    let d = n + 1;
    while (slotAt(d) === slotAt(n) && d < n + 64) d++;
    if (!isHit(d)) return { role: 'none' };
    return hitBefore(n - 1, slotAt(n)) ? { role: 'held' } : { role: 'start', until: d };
  }
  // The downbeat just after a run of pushed steps.
  const prev = n - 1;
  if (pushed(prev) && slotAt(prev) !== slotAt(n) && isHit(n) && hitBefore(prev, slotAt(prev))) return { role: 'held' };
  return { role: 'none' };
}
export const PROG_VOICINGS = { set: 'As set', smooth: 'Smooth (inversions)', nearest: 'Nearest tones' };
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

// ---- modulation: the progression changes key every N times round.
export const MOD_EVERY = [0, 1, 2, 3, 4, 6, 8]; // 0 = off
export const MOD_INTERVALS = {
  1: '+1 (half step)', 2: '+2 (whole step)', 3: '+3 (minor 3rd)', 4: '+4 (major 3rd)', 5: '+5 (4th)', 7: '+7 (5th)',
  [-1]: '−1 (half step)', [-2]: '−2 (whole step)', [-3]: '−3 (minor 3rd)', [-5]: '−5 (4th down)',
};

/** Which time round the progression is on at clock `pulse` (0 = the first pass). */
export function progressionRound(pulse, slots) {
  const total = slots.reduce((sum, s) => sum + s.beats, 0) * PPQN;
  return total ? Math.floor(pulse / total) : 0;
}

/**
 * Semitones the progression is transposed by on `round`: `interval` more every `every`
 * rounds, folded into −5..+6 so it keeps changing key without drifting out of range.
 */
export function modulationShift(round, every, interval) {
  if (!every || !interval) return 0;
  const raw = Math.floor(round / every) * interval;
  const pc = ((raw % 12) + 12) % 12;
  return pc > 6 ? pc - 12 : pc;
}

/** Inversion names; a chord can't be inverted further than it has notes. */
export const INVERSIONS = ['Root', '1st', '2nd', '3rd'];

/** Raise the lowest `k` notes of a chord an octave: 1 = first inversion, and so on. */
export function invertChord(notes, k) {
  const sorted = [...notes].sort((a, b) => a - b);
  const n = clamp(Math.round(k) || 0, 0, Math.max(0, sorted.length - 1));
  return sorted.map((note, i) => (i < n ? note + 12 : note)).sort((a, b) => a - b).filter((x) => x <= 127);
}

/**
 * Notes for a progression slot {root (0-11), type, beats, inv} in the given octave,
 * in its inversion; [] for a rest.
 */
export function slotNotes(slot, octave) {
  if (!slot || slot.type === 'rest') return [];
  return invertChord(chordNotes(slotBase(slot, octave), slot.type), slot.inv || 0);
}

/** Register shift per slot, in octaves. */
export const SLOT_OCTAVES = [-2, -1, 0, 1, 2];

/** The slot's root note: the progression octave plus the slot's own register shift. */
export function slotBase(slot, octave) {
  return (octave + 1 + clamp(Math.round(slot.oct) || 0, -2, 2)) * 12 + slot.root;
}

/** How far a hand moves between two voicings: each note to the nearest note of the other. */
export function voiceDistance(a, b) {
  const near = (x, set) => Math.min(...set.map((y) => Math.abs(x - y)));
  return a.reduce((s, x) => s + near(x, b), 0) + b.reduce((s, y) => s + near(y, a), 0);
}

/** Total movement when voices `a` move to `b`: matched in pitch order if the counts agree. */
function moveCost(a, b) {
  if (a.length !== b.length) return voiceDistance(a, b);
  return a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0);
}

/**
 * Voice leading by nearest chord tones: every tone of the next chord is placed in
 * whichever octave keeps the total movement from `prev` smallest, so voices can open
 * out beyond close position (C E G → B D G for G major). Notes stay between `low`
 * and `high`, never double up, and ties go to the narrower spread.
 */
export function nearestVoicing(prev, pitchClasses, low, high) {
  const options = pitchClasses.map((pc) => {
    const out = [];
    for (let n = pc; n <= high; n += 12) if (n >= low) out.push(n);
    return out;
  });
  let best = null;
  const pick = (i, chosen) => {
    if (i === options.length) {
      const notes = [...chosen].sort((a, b) => a - b);
      if (new Set(notes).size !== notes.length) return;
      const cost = moveCost(prev, notes);
      const span = notes[notes.length - 1] - notes[0];
      if (!best || cost < best.cost || (cost === best.cost && span < best.span)) best = { cost, span, notes };
      return;
    }
    for (const n of options[i]) pick(i + 1, [...chosen, n]);
  };
  pick(0, []);
  return best ? best.notes : null;
}

/**
 * The notes every slot plays, plus the inversion used. 'set': each slot's own inversion.
 * 'smooth': the first chord keeps its inversion; each later one takes whichever inversion
 * (in its own octave, or the one below) moves least from the chord before it, so the
 * voices lead smoothly and the progression loops the same way every time.
 * 'nearest': like smooth, but each voice moves to the nearest tone of the next chord in
 * any octave (open voicings allowed), kept within an octave and a half of the first chord.
 * `inv` is then which chord tone is in the bass.
 * @returns {{notes: number[], inv: number}[]}
 */
export function progressionVoicings(slots, octave, mode = 'set') {
  // Voice leading runs in the progression's own register; each slot's register
  // shift (`oct`) is applied afterwards, so the chord moves by exactly that much.
  const lift = (notes, slot) => {
    const by = 12 * clamp(Math.round(slot.oct) || 0, -2, 2);
    return notes.map((n) => n + by).filter((n) => n >= 0 && n <= 127);
  };
  let prev = null;
  return slots.map((slot, i) => {
    const flat = { ...slot, oct: 0 };
    const notes = slotNotes(flat, octave);
    if (!notes.length || mode === 'set' || prev === null || i === 0) {
      if (notes.length) prev = notes;
      return { notes: lift(notes, slot), inv: notes.length ? clamp(slot.inv || 0, 0, notes.length - 1) : 0 };
    }
    const root = chordNotes(slotBase(flat, octave), slot.type);
    if (mode === 'nearest') {
      const base = (octave + 1) * 12;
      const low = Math.max(0, base - 7);
      const high = Math.min(127, base + 26);
      const voiced = nearestVoicing(prev, root.map((n) => n % 12), low, high) || notes;
      prev = voiced;
      const bassPc = voiced[0] % 12;
      return { notes: lift(voiced, slot), inv: Math.max(0, root.findIndex((n) => n % 12 === bassPc)) };
    }
    let best = null;
    for (let k = 0; k < root.length; k++) {
      for (const shift of [0, -12]) {
        const cand = invertChord(root, k).map((x) => x + shift);
        if (cand[0] < 0) continue;
        const d = voiceDistance(cand, prev);
        // Ties go to the higher, less inverted voicing so the register doesn't sink.
        if (!best || d < best.d) best = { d, notes: cand, inv: k };
      }
    }
    prev = best.notes;
    return { notes: lift(best.notes, slot), inv: best.inv };
  });
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

// ---- humanize: small random timing and level variation on top of the clock grid.

/** Centred triangular random in −1..1 (most values near 0, like a player's spread). */
const tri = (rng) => rng() + rng() - 1;

/**
 * Seconds to move a note off the grid, for humanize `amount` 0..1. At 100% notes land
 * within ±20 ms, but never more than a fifth of the step, so fast notes keep their order.
 */
export function humanizeOffset(amount, stepDuration, rng = Math.random) {
  const a = clamp(amount, 0, 1);
  if (!a) return 0;
  return tri(rng) * a * Math.min(0.02, stepDuration * 0.2);
}

/** A level (MIDI velocity, or a 0..1 gain with max 1.5) varied by up to ±25 % at 100 %. */
export function humanizeLevel(value, amount, rng = Math.random, max = 127) {
  const a = clamp(amount, 0, 1);
  if (!a || value <= 0) return value;
  const v = value * (1 + tri(rng) * 0.25 * a);
  return max === 127 ? clamp(Math.round(v), 1, 127) : clamp(v, 0.01, max);
}

// ---- just intonation: tune every note to a pure ratio above the chord's root.
export const TUNINGS = { equal: 'Equal', just: 'Just (5-limit)', just7: 'Just (7-limit)' };
// Ratios for each semitone above the root. 5-limit: thirds 5/4 and 6/5, fifths 3/2,
// minor 7th 9/5. 7-limit swaps in the "harmonic" 7th (7/4) and tritone (7/5).
const RATIOS_5 = [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8];
const RATIOS_7 = [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 7 / 5, 3 / 2, 8 / 5, 5 / 3, 7 / 4, 15 / 8];

/**
 * Cents to add to an equal-tempered `note` so it sits at the just ratio above the
 * chord root (pitch class `rootPc`, which stays where it is). 0 for Equal or no root.
 */
export function justCents(note, rootPc, tuning, { dim = false } = {}) {
  if (tuning !== 'just' && tuning !== 'just7') return 0;
  if (rootPc === null || rootPc === undefined) return 0;
  const i = (((Math.round(note) - rootPc) % 12) + 12) % 12;
  let ratio = (tuning === 'just7' ? RATIOS_7 : RATIOS_5)[i];
  // A diminished chord is stacked pure minor thirds: its tritone is 6/5 × 6/5 = 36/25
  // (7-limit: 7/5, the 5:6:7 chord), so both thirds in it are pure.
  if (dim && i === 6) ratio = tuning === 'just7' ? 7 / 5 : 36 / 25;
  return 1200 * Math.log2(ratio) - 100 * i;
}

/**
 * Cents for `note` in a chord, tuned in the key: the chord's root sits at a pure
 * 5-limit ratio above the key's tonic (so neighbouring chords share their common
 * notes), and the note at a pure ratio above that root. ctx = {root, tonic, dim};
 * a null tonic leaves the root equal-tempered.
 */
export function chordCents(note, { root, tonic = null, dim = false }, tuning) {
  if (root === null || root === undefined) return 0;
  const rootShift = tonic === null || tonic === undefined ? 0 : justCents(root, tonic, tuning === 'equal' ? 'equal' : 'just');
  return rootShift + justCents(note, root, tuning, { dim });
}

/** Does a set of pitch classes form a diminished triad on `root` (minor 3rd + tritone, no 5th)? */
export function isDimChord(pcs, root) {
  const has = (i) => pcs.has((root + i) % 12);
  return has(3) && has(6) && !has(7);
}

/**
 * The root (pitch class) of a set of MIDI notes, however they're voiced: the note
 * with a fifth and a third above it wins (then a fifth, then a third), else the bass.
 * null for no notes.
 */
export function chordRootPc(notes) {
  if (!notes.length) return null;
  const sorted = [...notes].sort((a, b) => a - b);
  const pcs = new Set(sorted.map((n) => ((n % 12) + 12) % 12));
  const bass = ((sorted[0] % 12) + 12) % 12;
  let best = bass;
  let bestScore = -1;
  for (const pc of pcs) {
    const has = (i) => pcs.has((pc + i) % 12);
    let score = 0;
    if (has(7)) score += 2; // perfect fifth
    if (has(4) || has(3)) score += 1.5; // a third
    if (has(10) || has(11)) score += 0.25; // a seventh
    if (has(6) && has(3) && !has(7)) score += 2; // diminished: root of the stacked minor thirds
    if (pc === bass) score += 0.1; // ties go to the bass
    if (score > bestScore) { bestScore = score; best = pc; }
  }
  return best;
}

// ---- sweetening: choose each note's just ratio for the fewest beats against everything else.

// Pure-ratio choices for each semitone above the root (kept within ~35 cents of equal
// temperament). 7-limit adds the septimal intervals.
const CHOICES_5 = [[1], [16 / 15], [9 / 8, 10 / 9], [6 / 5], [5 / 4], [4 / 3], [45 / 32, 64 / 45, 36 / 25], [3 / 2], [8 / 5], [5 / 3], [9 / 5, 16 / 9], [15 / 8]];
const CHOICES_7_EXTRA = { 3: [7 / 6], 6: [7 / 5, 10 / 7], 9: [12 / 7], 10: [7 / 4] };
// Intervals that ring without beating, weighted by how audible a mistuning is
// (simpler ratios beat more obviously when they're off).
const PURE_5 = [[1, 1], [16, 15], [10, 9], [9, 8], [6, 5], [5, 4], [4, 3], [45, 32], [64, 45], [3, 2], [8, 5], [5, 3], [16, 9], [9, 5], [15, 8], [2, 1]];
const PURE_7 = [[8, 7], [7, 6], [7, 5], [10, 7], [12, 7], [7, 4]];
const targetsFor = (tuning) => (tuning === 'just7' ? [...PURE_5, ...PURE_7] : PURE_5)
  .map(([n, d]) => ({ cents: 1200 * Math.log2(n / d), weight: 1 / Math.sqrt(n * d) }));

/** How much two notes `d` cents apart beat: the weighted distance to the nearest pure interval. */
export function beatCost(d, targets) {
  const x = ((d % 1200) + 1200) % 1200;
  let best = Infinity;
  for (const t of targets) best = Math.min(best, t.weight * Math.abs(x - t.cents));
  return best;
}

/** Each pitch class's tuning choices above `rootPc`, in cents away from equal temperament. */
export function tuningChoices(pc, rootPc, tuning) {
  const i = (((pc - rootPc) % 12) + 12) % 12;
  const ratios = [...CHOICES_5[i], ...(tuning === 'just7' ? CHOICES_7_EXTRA[i] || [] : [])];
  return ratios.map((r) => 1200 * Math.log2(r) - 100 * i);
}

/**
 * Sweeten a chord: give every pitch class in `pcs` the just tuning (cents from equal
 * temperament, relative to the root, which stays at 0) that makes the whole set beat
 * least. `fixed` (pc → cents) are notes already sounding, which are kept as they are.
 * Returns a Map pc → cents.
 */
export function sweeten(pcs, rootPc, tuning, fixed = new Map()) {
  const targets = targetsFor(tuning);
  const out = new Map(fixed);
  out.set(rootPc, out.get(rootPc) ?? 0);
  const free = [...new Set(pcs)].filter((pc) => !out.has(pc));
  const choices = free.map((pc) => tuningChoices(pc, rootPc, tuning));
  const pitch = (pc, cents) => pc * 100 + cents;
  const settled = [...out.entries()];
  // Cost of one complete assignment: every pair, settled notes included.
  const cost = (picked) => {
    const all = [...settled.map(([pc, c]) => pitch(pc, c)), ...free.map((pc, k) => pitch(pc, picked[k]))];
    let sum = 0;
    for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) sum += beatCost(all[b] - all[a], targets);
    return sum;
  };
  const combos = choices.reduce((n, c) => n * c.length, 1);
  if (combos <= 4096) {
    let best = null;
    const picked = [];
    const walk = (k) => {
      if (k === free.length) {
        const c = cost(picked);
        if (!best || c < best.c - 1e-9) best = { c, picked: picked.slice() };
        return;
      }
      for (const v of choices[k]) { picked[k] = v; walk(k + 1); }
    };
    walk(0);
    free.forEach((pc, k) => out.set(pc, best.picked[k]));
  } else {
    // Very large sets: one note at a time against what's settled.
    for (const [k, pc] of free.entries()) {
      let bestV = choices[k][0];
      let bestC = Infinity;
      for (const v of choices[k]) {
        let c = 0;
        for (const [p2, c2] of out) c += beatCost(pitch(pc, v) - pitch(p2, c2), targets);
        if (c < bestC) { bestC = c; bestV = v; }
      }
      out.set(pc, bestV);
    }
  }
  return out;
}

/**
 * The key a progression is in (tonic pitch class), for Key: Auto. Every major and
 * minor key is scored by how many of the progression's chord tones fit its scale; ties
 * go to a key whose home chord (I major, or i minor) is in the progression, the first
 * such chord winning. `slots` = progression slots {root, type}. null for none.
 */
export function autoTonic(slots) {
  const chords = slots.filter((s) => s && s.type !== 'rest' && CHORDS[s.type]);
  if (!chords.length) return null;
  const tones = chords.flatMap((s) => CHORDS[s.type].intervals.map((i) => (s.root + i) % 12));
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  const MINOR = [0, 2, 3, 5, 7, 8, 10];
  const isMinor = (t) => ['min', 'min7', 'dim'].includes(t);
  let best = null;
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const [scale, minor] of [[MAJOR, false], [MINOR, true]]) {
      const fit = tones.filter((pc) => scale.includes((pc - tonic + 12) % 12)).length;
      const home = chords.findIndex((s) => s.root === tonic && isMinor(s.type) === minor);
      // Fit first; then having the home chord (earlier is better); then the first chord's root.
      const score = fit * 100 + (home >= 0 ? 50 - home : 0) + (chords[0].root === tonic ? 1 : 0);
      if (!best || score > best.score) best = { score, tonic };
    }
  }
  return best.tonic;
}
