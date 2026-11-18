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
//
// Around those, the bebop language he came out of, and how he built a solo:
//  - Enclosures: the last notes before a chord change surround a tone of the new chord
//    (a scale step above, a half step below) so it lands right on the change.
//  - Bebop-scale runs (the scale plus one chromatic passing note, so chord tones fall on
//    the beats) and chromatic runs into a chord tone.
//  - Motifs: a phrase's opening figure comes back, moved to fit later chords (sequenced),
//    sometimes turned upside down.
//  - Intensity: over a chorus or more the solo builds, from sparse, lower and inside to
//    dense, higher and more chromatic, with brief side-slips a half step "outside" that
//    resolve straight back in.

import { chordScale } from './bass.js?v=253';
import { CHORDS } from './core.js?v=253';

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

// Bebop scales: the chord's scale plus one chromatic passing note (major 7th on a
// dominant, ♯5 on a major chord, major 3rd on a minor), so the chord tones fall on beats.
function bebopScale(type) {
  const { scale } = chordScale(type);
  const extra = ['dom7', 'dom9', 'dom13', 'dom7sus4'].includes(type) ? 11
    : CHORDS[type]?.minor && !['hdim7', 'dim', 'dim7'].includes(type) ? 4
      : ['maj', 'maj7', 'maj6', 'six9', 'maj9', 'add9'].includes(type) ? 8 : null;
  return extra === null ? scale : [...new Set([...scale, extra])].sort((a, b) => a - b);
}

/** The scale a solo line uses over a chord: Lydian over major chords (no 4th to avoid). */
function soloScale(type) {
  const { scale } = chordScale(type);
  return scale === chordScale('maj7').scale && type !== 'dom7sus4' && type !== 'sus4' ? scale.map((i) => (i === 5 ? 6 : i)) : scale;
}

/** The chord's tones (pitch classes), with the 3rd and 7th (guide tones) weighted up. */
function targetTones(chord) {
  const { tones } = chordScale(chord.type);
  return tones.map((i, k) => [pc12(chord.root + i), k === 1 || k === 3 ? 2 : 1]);
}

export const FIGURES = ['pent', 'motif', 'bebop', 'chrom', 'outside', 'enclosure', 'end'];

/**
 * The solo: call next() once per arp step with the chord sounding; it returns a MIDI
 * note, or null on a breath between phrases.
 */
export class ColtraneSolo {
  constructor({ rng = Math.random, lo = 55, hi = 81 } = {}) {
    this.rng = rng;
    this.baseLo = lo;
    this.baseHi = hi;
    this.lo = lo;
    this.hi = hi;
    this.reset();
  }

  reset() {
    this.last = null;
    this.dir = 1;
    this.queue = []; // the rest of the figure being played
    this.chordKey = null;
    this.phraseLeft = 0; // figures left in this phrase
    this.inPhrase = false;
    this.restLeft = 0; // steps of breath left
    this.motif = null; // intervals of a phrase's opening figure, to develop later
    this.motifUses = 0;
    this.wentOutside = false; // the last figure side-slipped: the next resolves
    this.landing = null; // the note an enclosure is leading to, on the next chord
    this.leadIn = false;
    this.kind = null; // the figure being played (for display and tests)
  }

  /** How many steps the breath after a phrase lasts (less as the solo builds). */
  breathSteps({ space, intensity, stepsPerBeat }) {
    const breath = space * (1.25 - intensity);
    const beats = 0.5 + this.rng() * (0.5 + breath * 4);
    return Math.max(1, Math.round(beats * stepsPerBeat));
  }

  /** The phrase's last note, played now; the breath follows it. */
  endPhrase(note, opts) {
    this.inPhrase = false;
    this.queue = [];
    this.restLeft = this.breathSteps(opts);
    this.last = note;
    this.kind = 'end';
    this.ended = true;
    return note;
  }

  /** Move a figure by octaves to fit the range, if it can. */
  fit(notes) {
    let out = notes;
    for (let k = 0; k < 3 && Math.max(...out) > this.hi; k++) out = out.map((n) => n - 12);
    for (let k = 0; k < 3 && Math.min(...out) < this.lo; k++) out = out.map((n) => n + 12);
    if (!out.every((n) => n >= this.lo && n <= this.hi)) return null;
    // Moved an octave away from the line: not this figure.
    if (this.last !== null && Math.abs(out[0] - this.last) > 9) return null;
    return out;
  }

  /** A chord tone `min`..`max` semitones from the last note (in `dir`, or either way when 0). */
  toneNear(chord, dir, min = 1, max = 5) {
    const from = this.last ?? Math.round((this.lo + this.hi) / 2);
    const tones = targetTones(chord);
    const cands = [];
    for (let d = -max; d <= max; d++) {
      if (Math.abs(d) < min || (dir && Math.sign(d) !== dir)) continue;
      const n = from + d;
      const hit = tones.find(([pc]) => pc === pc12(n));
      if (hit && n >= this.lo && n <= this.hi) cands.push([n, hit[1] + (Math.abs(d) <= 3 ? 1 : 0)]);
    }
    if (cands.length) return weighted(cands, this.rng)[0];
    return dir ? this.toneNear(chord, 0, 1, 7) : from;
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
      // Onwards by a small step is best, back a little next, then the same note again; a leap last.
      const cost = this.last === null ? Math.abs(notes[0] - from)
        : step >= 1 && step <= 4 ? step : step === 0 ? 14 : step < 0 && step >= -4 ? 8 - step : 10 + Math.abs(step);
      if (!best || cost < best.cost) best = { notes, cost };
    }
    return best ? best.notes : shape.map((p) => p + 12 * Math.floor(from / 12));
  }

  /** A run down (or up) the bebop scale from a chord tone just past the last note. */
  bebopRun(chord, len) {
    if (this.last !== null && this.last < this.lo + 10) this.dir = 1;
    else if (this.last === null || this.last > this.hi - 10 || this.rng() < 0.65) this.dir = -1; // bebop lines mostly fall
    const scale = bebopScale(chord.type);
    let n = this.toneNear(chord, this.dir, 1, 4);
    const notes = [n];
    while (notes.length < len) {
      do n += this.dir; while (!scale.includes(pc12(n - chord.root)));
      notes.push(n);
    }
    return this.fit(notes);
  }

  /** Half steps from the last note into a chord tone 3 to 5 away. */
  chromRun(chord) {
    if (this.last === null) return null;
    if (this.last > this.hi - 8) this.dir = -1;
    else if (this.last < this.lo + 8) this.dir = 1;
    const t = this.toneNear(chord, this.dir, 3, 5);
    const d = Math.sign(t - this.last);
    if (!d) return null;
    const notes = [];
    for (let n = this.last + d; n !== t + d; n += d) notes.push(n);
    return notes.length <= 6 ? notes : null;
  }

  /** The motif again, from a chord tone near here, each note fitted to this chord's scale. */
  developMotif(chord) {
    if (!this.motif) return null;
    const flip = this.rng() < 0.25; // now and then upside down
    const ivs = this.motif.map((d) => (flip ? -d : d));
    const scale = soloScale(chord.type);
    const start = this.toneNear(chord, 0, 1, 5);
    const notes = [start];
    for (const d of ivs) {
      const prev = notes[notes.length - 1];
      const way = d >= 0 ? 1 : -1;
      let n = prev + (d || way);
      // Snap to the scale, keeping the motif's direction, never repeating the note before.
      for (let k = 0; k < 3 && (!scale.includes(pc12(n - chord.root)) || n === prev); k++) n += way;
      notes.push(n);
    }
    this.motifUses++;
    return this.fit(notes);
  }

  /** The next figure over this chord, by weights that move with intensity and Bebop. */
  figure(chord, { intensity, bebop, stepsLeft, changed }) {
    const rng = this.rng;
    const runLen = Number.isFinite(stepsLeft) ? Math.max(3, Math.min(8, stepsLeft)) : 4 + Math.floor(rng() * 3);
    // After a side-slip, resolve: back inside with a plain cell.
    const resolving = this.wentOutside;
    this.wentOutside = false;
    const options = resolving ? [['pent', 1]] : [
      ['pent', 3 * (1 - bebop * 0.5)],
      ['motif', this.motif && this.motifUses < 4 ? 1.2 + intensity : 0],
      ['bebop', 2.2 * bebop * (0.6 + intensity * 0.6)],
      // (never from a chord change: a chromatic note on the downbeat isn't the language)
      ['chrom', this.last !== null && !changed ? 1.4 * bebop * (0.3 + intensity) : 0],
      ['outside', intensity > 0.6 ? (intensity - 0.6) * 4 : 0],
    ].filter(([, w]) => w > 0);
    for (let tries = 0; tries < 4; tries++) {
      const [kind] = weighted(options, rng);
      let notes = null;
      if (kind === 'pent') notes = this.placeCell(pickCell(chord, rng).pcs);
      else if (kind === 'motif') notes = this.developMotif(chord);
      else if (kind === 'bebop') notes = this.bebopRun(chord, runLen);
      else if (kind === 'chrom') notes = this.chromRun(chord);
      else if (kind === 'outside') {
        // The same kind of cell a half step up or down, then straight back in.
        const shift = rng() < 0.5 ? 1 : -1;
        notes = this.placeCell(pickCell(chord, rng).pcs.map((p) => p + shift));
        this.wentOutside = true;
      }
      if (notes && notes.length) {
        // Not the same notes as the figure just played.
        if (notes.join() === this.lastFigure && tries < 3) continue;
        this.kind = kind;
        return notes;
      }
      this.wentOutside = false;
    }
    this.kind = 'pent';
    return this.placeCell(pickCell(chord, rng).pcs);
  }

  /**
   * @param chord {root (pitch class), type} or null (nothing to play over)
   * @param opts.space 0..1: breath between phrases (0 = one continuous line)
   * @param opts.stepsPerBeat arp steps per beat (breaths are counted in beats)
   * @param opts.next the chord coming next (for enclosures), or null
   * @param opts.stepsLeft steps left on this chord, this one included (Infinity: unknown)
   * @param opts.intensity 0..1: where the solo is in its build
   * @param opts.bebop 0..1: how much bebop language (enclosures, runs) against pure pentatonics
   * @param opts.downbeat this step is on a strong beat (1 or 3) — a phrase can end on it
   * After each call, `ended` says whether that note was a phrase's last (to hold it on).
   */
  next(chord, { space = 0.2, stepsPerBeat = 2, next = null, stepsLeft = Infinity, intensity = 0.5, bebop = 0.5, downbeat = false } = {}) {
    this.ended = false;
    if (!chord || chord.type === 'rest') { this.queue = []; this.chordKey = null; return null; }
    const rng = this.rng;
    // The range climbs as the solo builds.
    const lift = Math.round((intensity - 0.5) * 8);
    this.lo = this.baseLo + lift;
    this.hi = this.baseHi + lift;
    const key = `${chord.root}|${chord.type}`;
    const changed = key !== this.chordKey;
    this.chordKey = key;
    if (changed) this.leadIn = false;
    if (this.restLeft > 0) { this.restLeft--; this.landing = null; return null; } // still breathing
    // An enclosure into the next chord: its last steps surround a tone of the new chord.
    const nextKey = next && next.type !== 'rest' ? `${next.root}|${next.type}` : null;
    if (!changed && nextKey && nextKey !== key && !this.leadIn && this.inPhrase && this.last !== null
      && stepsLeft >= 1 && stepsLeft <= 2 && rng() < bebop * 0.45) {
      this.leadIn = true;
      const target = this.toneNear(next, 0, 1, 4);
      const { scale } = chordScale(next.type);
      let above = target + 1;
      while (!scale.includes(pc12(above - next.root)) && above < target + 3) above++;
      const below = target - 1;
      let pair = rng() < 0.7 ? [above, below] : [below, above];
      if (pair[stepsLeft === 2 ? 0 : 1] === this.last) pair = [pair[1], pair[0]]; // don't restrike the note just played
      this.queue = stepsLeft === 2 ? pair : [pair[1]];
      this.landing = target;
      this.kind = 'enclosure';
    }
    if (changed || !this.queue.length) {
      if (changed && this.landing !== null) {
        // Land the enclosure on the change, then carry on from it (or, at the end of a
        // phrase, stop on it).
        const target = this.landing;
        this.landing = null;
        if (this.phraseLeft <= 0 && space * (1.25 - intensity) > 0) return this.endPhrase(target, { space, intensity, stepsPerBeat });
        this.last = target;
        const more = this.placeCell(pickCell(chord, rng).pcs).filter((n, k) => !(k === 0 && n === target)).slice(0, 3);
        this.queue = [target, ...more];
        this.kind = 'enclosure';
      } else {
        this.landing = null;
        // A figure has finished (or the chord moved under it). End of the phrase? Breathe.
        if (this.phraseLeft <= 0) {
          const breath = space * (1.25 - intensity); // less breath as it builds
          if (this.inPhrase && breath > 0) {
            // On a chord change or a strong beat the line usually comes down on it: one
            // last note, a chord tone close by, and the breath after that.
            if ((changed || downbeat) && this.last !== null && rng() < 0.8) {
              return this.endPhrase(this.toneNear(chord, 0, 1, 4), { space, intensity, stepsPerBeat });
            }
            this.inPhrase = false;
            this.queue = [];
            this.restLeft = this.breathSteps({ space, intensity, stepsPerBeat }) - 1;
            return null;
          }
          // A new phrase: longer as it builds. Sometimes it opens with the motif again.
          this.inPhrase = true;
          this.phraseLeft = 2 + Math.floor(rng() * (2 + (1 - space) * 8 + intensity * 6));
          if (this.motif && rng() < 0.35) {
            const again = this.developMotif(chord);
            if (again) {
              this.phraseLeft--;
              this.queue = again;
              this.kind = 'motif';
              this.lastFigure = again.join();
              this.last = this.queue.shift();
              return this.last;
            }
          }
          this.openingPhrase = true;
        }
        this.phraseLeft--;
        this.queue = this.figure(chord, { intensity, bebop, stepsLeft, changed });
        if (this.openingPhrase) {
          // A phrase's first figure is its motif, to come back to.
          this.openingPhrase = false;
          if (this.kind === 'pent' || this.kind === 'bebop') {
            this.motif = this.queue.slice(1).map((n, k) => n - this.queue[k]);
            this.motifUses = 0;
          }
        }
        this.lastFigure = this.queue.join();
      }
    }
    // Keep the line's direction for the next figure.
    if (this.queue.length >= 2) this.dir = Math.sign(this.queue[this.queue.length - 1] - this.queue[0]) || this.dir;
    this.last = this.queue.shift();
    return this.last;
  }
}
