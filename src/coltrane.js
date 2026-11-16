// A solo line in John Coltrane's pentatonic manner, for the arpeggiator.
//
// Two ideas from his playing (the "Giant Steps" era and after, as later laid out by
// teachers such as Jerry Bergonzi):
//  - Four-note cells: 1-2-3-5 of a major pentatonic, played up, down or turned around
//    (5-3-2-1, 3-2-1-5, 1-5-3-2), one cell per chord when the changes come fast.
//  - Pentatonic substitution: over each chord, a major pentatonic built on another degree
//    that colours it: on the 2nd of a major 7th (Lydian), the ♭3, 4 or ♭7 of a minor 7th,
//    the ♭5 of an altered dominant, the ♭6 of a half-diminished chord, and so on.
// Each cell starts close to the last note and carries the line's direction, turning at
// the edges of the range, so it reads as one long line ("sheets of sound" at fast rates).

const PENT = [0, 2, 4, 7, 9]; // major pentatonic: 1 2 3 5 6

// Per chord type, where to build the pentatonic (semitones above the chord's root) and
// how often, plus the chord's own 1-2-3-5 "digital pattern" where it has one.
const MAJ = { pent: [[0, 3], [7, 2], [2, 2]], cell: [0, 2, 4, 7] };
const MIN = { pent: [[3, 3], [5, 2], [10, 2]], cell: [0, 2, 3, 7] };
const DOM = { pent: [[0, 3], [5, 1], [10, 1]], cell: [0, 2, 4, 7] };
const ALT = { pent: [[6, 3]], cell: [1, 3, 4, 8] }; // ♭5 pentatonic: ♭5 ♯5 ♭7 ♭9 ♯9
export const SOLO_SOURCES = {
  maj: MAJ, maj7: MAJ, maj6: MAJ, six9: MAJ, maj9: MAJ, add9: MAJ, sus2: MAJ,
  maj7s11: { pent: [[2, 3], [7, 1], [0, 1]], cell: [0, 2, 4, 6] },
  maj7s5: { pent: [[2, 1]], cell: [0, 4, 8, 11] },
  min: MIN, min7: MIN, min9: MIN, min11: MIN, min6: { pent: [[3, 2], [5, 2]], cell: [0, 2, 3, 7] },
  minmaj7: { pent: [[5, 1]], cell: [0, 2, 3, 7] },
  dom7: DOM, dom9: DOM, dom13: DOM, dom7s11: { pent: [[0, 2]], cell: [0, 2, 4, 6] },
  dom7sus4: { pent: [[10, 2], [5, 2], [0, 1]], cell: [0, 2, 5, 7] }, sus4: { pent: [[10, 2], [5, 2]], cell: [0, 2, 5, 7] },
  dom7b9: { pent: [[6, 2], [0, 1]], cell: [0, 1, 4, 7] }, dom7s9: ALT, alt: ALT,
  dom7b5: { pent: [[6, 1]], cell: [0, 2, 4, 6] }, aug7: { pent: [[6, 1]], cell: [0, 2, 4, 8] }, aug: { pent: [], cell: [0, 2, 4, 8] },
  hdim7: { pent: [[8, 2], [1, 1]], cell: [0, 3, 6, 10] },
  dim: { pent: [], cell: [0, 3, 6, 9] }, dim7: { pent: [], cell: [0, 3, 6, 9] },
};

// The orders a cell is played in, as indices into its four notes (low to high).
const UP = [[0, 1, 2, 3], [0, 1, 3, 2]]; // 1-2-3-5, 1-2-5-3
const DOWN = [[3, 2, 1, 0], [2, 1, 0, 3], [3, 0, 1, 2]]; // 5-3-2-1, 3-2-1-5, 5-1-2-3
const TURN = [[0, 3, 2, 1]]; // 1-5-3-2

const pc12 = (n) => ((n % 12) + 12) % 12;

function weighted(items, rng) {
  let r = rng() * items.reduce((s, [, w]) => s + w, 0);
  for (const it of items) { r -= it[1]; if (r <= 0) return it; }
  return items[items.length - 1];
}

/**
 * Four notes (pitch classes as semitones, low to high within an octave span) for a
 * chord: a window of a substitute pentatonic, or the chord's own 1-2-3-5 cell.
 * Returns {pcs, source} where source names it for display ("D pentatonic").
 */
export function pickCell(chord, rng = Math.random) {
  const src = SOLO_SOURCES[chord.type] || MAJ;
  const options = [...src.pent.map(([on, w]) => ['pent', w, on]), ['cell', src.pent.length ? 1.5 : 1]];
  const [kind, , on] = weighted(options, rng);
  if (kind === 'cell') return { pcs: src.cell.map((i) => chord.root + i), source: 'cell' };
  // A window of four consecutive pentatonic notes; the 1-2-3-5 window most often.
  const start = weighted([[0, 4], [1, 1], [2, 1.5], [3, 1], [4, 1]], rng)[0];
  const base = chord.root + on;
  const pcs = [0, 1, 2, 3].map((k) => base + PENT[(start + k) % 5] + 12 * Math.floor((start + k) / 5));
  return { pcs, source: pc12(base) };
}

/**
 * The solo: call next() once per arp step with the chord sounding; it returns a MIDI
 * note, or null on a breath between phrases.
 */
export class ColtraneSolo {
  constructor({ rng = Math.random, lo = 55, hi = 81 } = {}) {
    this.rng = rng;
    this.lo = lo;
    this.hi = hi;
    this.reset();
  }

  reset() {
    this.last = null;
    this.dir = 1;
    this.queue = []; // the rest of the cell being played
    this.chordKey = null;
    this.phraseLeft = 0; // cells left in this phrase
    this.inPhrase = false;
    this.restLeft = 0; // steps of breath left
  }

  /** Lay out a cell from near the last note, in the line's direction, inside the range. */
  placeCell(pcs) {
    const rng = this.rng;
    const from = this.last ?? Math.round((this.lo + this.hi) / 2);
    // Turn round near the edges (and now and then anyway).
    if (from > this.hi - 7) this.dir = -1;
    else if (from < this.lo + 7) this.dir = 1;
    else if (rng() < 0.18) this.dir = -this.dir;
    const orders = this.dir > 0 ? (rng() < 0.15 ? TURN : UP) : DOWN;
    const order = orders[Math.floor(rng() * orders.length)];
    const shape = order.map((i) => pcs[i]);
    // The octave that puts the first note a small step on from the last one.
    let best = null;
    for (let oct = -1; oct <= 9; oct++) {
      const notes = shape.map((p) => p + 12 * oct);
      if (Math.min(...notes) < this.lo || Math.max(...notes) > this.hi) continue;
      const step = (notes[0] - from) * this.dir; // positive: onwards
      const cost = this.last === null ? Math.abs(notes[0] - from) : (step >= 1 && step <= 4 ? step : 6 + Math.abs(step));
      if (!best || cost < best.cost) best = { notes, cost };
    }
    return best ? best.notes : shape.map((p) => p + 12 * Math.floor(from / 12));
  }

  /**
   * @param chord {root (pitch class), type} or null (nothing to play over)
   * @param space 0..1: how much breath between phrases (0 = one continuous line)
   * @param stepsPerBeat arp steps per beat (breaths are counted in beats)
   */
  next(chord, { space = 0.2, stepsPerBeat = 2 } = {}) {
    if (!chord || chord.type === 'rest') { this.queue = []; this.chordKey = null; return null; }
    const key = `${chord.root}|${chord.type}`;
    const changed = key !== this.chordKey;
    this.chordKey = key;
    if (this.restLeft > 0) { this.restLeft--; return null; } // still breathing
    if (changed || !this.queue.length) {
      // A cell has finished (or the chord moved under it). End of the phrase? Breathe.
      if (this.phraseLeft <= 0) {
        if (this.inPhrase && space > 0) {
          this.inPhrase = false;
          this.queue = [];
          const beats = 0.5 + this.rng() * (0.5 + space * 4);
          this.restLeft = Math.max(1, Math.round(beats * stepsPerBeat)) - 1;
          return null;
        }
        // A new phrase: shorter with more space.
        this.inPhrase = true;
        this.phraseLeft = 2 + Math.floor(this.rng() * (2 + (1 - space) * 10));
      }
      this.phraseLeft--;
      // Each new chord gets a new cell straight away (that's the sound of it); not the
      // same four notes as the cell just played.
      for (let tries = 0; tries < 4; tries++) {
        this.queue = this.placeCell(pickCell(chord, this.rng).pcs);
        if (this.queue.join() !== this.lastCell) break;
      }
      this.lastCell = this.queue.join();
    }
    this.last = this.queue.shift();
    return this.last;
  }
}
