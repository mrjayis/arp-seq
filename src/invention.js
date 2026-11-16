// A two-part invention in J. S. Bach's manner, over the chord progression.
//
// One subject per performance: a bar of a turn in 16ths and a few leaping 8ths (the
// shape of the C major Invention's opening), with a countersubject in 8ths against it.
// The form, a bar at a time:
//  - Exposition: the subject alone in the upper voice, then imitated an octave lower
//    while the upper voice plays the countersubject.
//  - Development: the subject (or its inversion) in either voice against the
//    countersubject, and episodes in which the subject's head is sequenced down by step
//    over a walking bass.
//  - A cadence at the end of each pass through the progression, long notes on the
//    downbeat after it, then the subject again.
// The material is kept as moves along the scale, so it fits whatever chord it meets:
// each note is a step (or leap) along the chord's scale from the one before, and notes on
// the beat are chord tones. The lower voice keeps below the upper.

import { chordScale } from './bass.js?v=199';

const pc12 = (n) => ((n % 12) + 12) % 12;

/** A note `moves` scale steps from `from`, along the chord's scale (Lydian-free: plain modes). */
export function scaleStep(from, moves, chord) {
  const { scale } = chordScale(chord.type);
  const inScale = (n) => scale.includes(pc12(n - chord.root));
  let n = from;
  // Start from a scale note (the line may arrive from another chord).
  if (!inScale(n)) { let up = n; let dn = n; while (!inScale(up)) up++; while (!inScale(dn)) dn--; n = moves >= 0 ? dn : up; }
  const dir = Math.sign(moves);
  for (let k = 0; k < Math.abs(moves); k++) {
    do n += dir; while (!inScale(n));
  }
  return n;
}

/** The chord tone nearest `n`; with a direction, the nearest that way (within a 4th) first. */
export function nearestTone(n, chord, dir = 0) {
  const { tones } = chordScale(chord.type);
  const isTone = (m) => tones.includes(pc12(m - chord.root));
  if (dir) for (let d = 0; d <= 5; d++) if (isTone(n + dir * d)) return n + dir * d;
  for (let d = 0; d <= 6; d++) {
    for (const s of [d, -d]) if (isTone(n + s)) return n + s;
  }
  return n;
}

const pick = (items, rng) => items[Math.min(items.length - 1, Math.floor(rng() * items.length))];

/**
 * A subject: [{at, len, move}] over 16 sixteenths. The first note's move is null (it's
 * placed on a chord tone); the others move along the scale from the note before.
 */
export function makeSubject(rng = Math.random) {
  // A turn in 16ths: mostly steps, one turn back, then a leap into the 8ths.
  const moves = [null];
  let dir = 1;
  for (let k = 1; k < 7; k++) {
    if (k === 3 || (k > 3 && rng() < 0.3)) dir = -dir; // the turn
    moves.push(dir * (rng() < 0.75 ? 1 : 2));
  }
  moves.push((rng() < 0.5 ? 1 : -1) * (3 + Math.floor(rng() * 2))); // a 4th or 5th up or down
  const out = moves.map((move, k) => ({ at: k, len: 1, move }));
  // Then four 8ths, leaping: thirds, fourths, sixths, turning each time.
  let d = -Math.sign(moves[7]);
  for (let k = 0; k < 4; k++) {
    out.push({ at: 8 + 2 * k, len: 2, move: d * pick([2, 2, 3, 3, 1, 5], rng) });
    d = -d;
  }
  return out;
}

/** A countersubject: eight 8ths, by step, against the subject's direction. */
export function makeCounter(subject, rng = Math.random) {
  const out = [{ at: 0, len: 2, move: null }];
  for (let k = 1; k < 8; k++) {
    // Where the subject goes in this half-beat, go the other way (contrary motion).
    const s = subject.find((e) => e.at === 2 * k || e.at === 2 * k - 1)?.move || 0;
    const dir = -Math.sign(s) || (rng() < 0.5 ? 1 : -1);
    out.push({ at: 2 * k, len: 2, move: dir * (rng() < 0.8 ? 1 : 2) });
  }
  return out;
}

const invert = (seg) => seg.map((e) => ({ ...e, move: e.move === null ? null : -e.move }));

/** An episode: the subject's first four notes, four times, each a step lower. */
function episode(subject) {
  const head = subject.slice(0, 4);
  const out = [];
  for (let r = 0; r < 4; r++) {
    head.forEach((e, k) => out.push({
      at: r * 4 + k, len: 1, dir: -1, // a falling sequence
      move: k === 0 ? (r === 0 ? null : -1 - (head.slice(1).reduce((s, x) => s + x.move, 0))) : e.move,
    }));
  }
  return out;
}

/** A walking bass under an episode: quarter notes stepping down. */
const walkDown = () => [0, 4, 8, 12].map((at, k) => ({ at, len: 4, move: k ? -1 : null, dir: -1 }));

/** The cadence: the upper voice runs down to the tonic's chord; the bass goes 5 → 1. */
const cadenceUpper = () => [
  { at: 0, len: 2, move: null }, { at: 2, len: 2, move: -1 }, { at: 4, len: 2, move: -1 }, { at: 6, len: 2, move: 1 },
  { at: 8, len: 1, move: -1 }, { at: 9, len: 1, move: -1 }, { at: 10, len: 1, move: 1 }, { at: 11, len: 1, move: -1 },
  { at: 12, len: 4, move: -1 },
];
const cadenceLower = () => [{ at: 0, len: 8, move: null, tone: 'root' }, { at: 8, len: 8, move: null, tone: 'fifth' }];
const finalNote = () => [{ at: 0, len: 8, move: null, tone: 'root' }];

export const VOICE_RANGES = { upper: [60, 84], lower: [43, 67] };

/**
 * The invention. Call step(voice, sixteenth, chord, info) on every 16th for each voice
 * playing ('upper', and 'lower' when there are two); it returns {note, len (16ths)} when
 * a note starts, else null.
 */
export class Invention {
  constructor({ rng = Math.random } = {}) {
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.subject = makeSubject(this.rng);
    this.counter = makeCounter(this.subject, this.rng);
    this.bar = -1;
    this.barCount = 0; // bars since the piece (or the section) started
    this.plan = { upper: [], lower: [] };
    this.last = { upper: null, lower: null };
    this.prevPair = null;
    this.kinds = { upper: 'rest', lower: 'rest' };
  }

  /** What each voice plays in a bar. `info`: {cadence, afterCadence} from the form. */
  planBar({ cadence, afterCadence }) {
    const s = this.subject;
    const c = this.counter;
    let pair;
    if (afterCadence) {
      pair = [['final', finalNote()], ['final', finalNote()]];
      this.barCount = -1; // the next bar opens a new section
    } else if (cadence) pair = [['cadence', cadenceUpper()], ['cadence', cadenceLower()]];
    else if (this.barCount === 0) pair = [['subject', s], ['rest', []]];
    else if (this.barCount === 1) pair = [['counter', c], ['subject', s]];
    else {
      const options = [
        [['subject', s], ['counter', c]],
        [['counter', c], ['subject', s]],
        [['inversion', invert(s)], ['counter', invert(c)]],
        [['counter', c], ['inversion', invert(s)]],
        [['episode', episode(s)], ['bass', walkDown()]],
        [['episode', episode(invert(s))], ['bass', walkDown()]],
      ];
      do pair = pick(options, this.rng); while (pair[0][0] + pair[1][0] === this.prevPair && this.rng() < 0.8);
    }
    this.prevPair = pair[0][0] + pair[1][0];
    this.barCount++;
    this.plan = { upper: pair[0][1], lower: pair[1][1] };
    this.kinds = { upper: pair[0][0], lower: pair[1][0] };
  }

  /**
   * @param voice 'upper' | 'lower'
   * @param sixteenth 16ths since Play
   * @param chord {root, type} sounding now (null: nothing to play over)
   * @param info {cadence, afterCadence, other} — form marks for this bar (read on its
   *   first 16th) and, for the lower voice, the upper voice's last note
   */
  step(voice, sixteenth, chord, info = {}) {
    const bar = Math.floor(sixteenth / 16);
    if (bar !== this.bar) { this.bar = bar; this.planBar(info); }
    if (!chord || chord.type === 'rest') return null;
    const at = sixteenth % 16;
    const ev = this.plan[voice]?.find((e) => e.at === at);
    if (!ev) return null;
    const [lo, hi] = VOICE_RANGES[voice];
    const mid = Math.round((lo + hi) / 2);
    const prev = this.last[voice];
    let note;
    if (ev.move === null || prev === null) {
      // A new statement: on a chord tone (the root or fifth for the bass's long notes),
      // near where this voice was, or the middle of its range.
      const near = prev ?? mid;
      if (ev.tone === 'root' || ev.tone === 'fifth') {
        const pc = pc12(chord.root + (ev.tone === 'fifth' ? 7 : 0));
        note = near + ((((pc - near) % 12) + 18) % 12) - 6;
      } else note = nearestTone(Math.round((near + mid) / 2), chord);
    } else {
      note = scaleStep(prev, ev.move, chord);
      // On the strong beats (1 and 3) a chord tone, reached the way the line is going (so
      // sequences keep falling); on 2 and 4 a passing note is fine.
      if (at % 8 === 0) note = nearestTone(note, chord, Math.sign(ev.move) || ev.dir || 0);
    }
    // Keep to the voice's range, and the lower voice under the upper.
    while (note > hi) note -= 12;
    while (note < lo) note += 12;
    if (voice === 'lower' && info.other !== undefined && info.other !== null) {
      while (note > info.other - 3 && note - 12 >= lo - 5) note -= 12;
    }
    this.last[voice] = note;
    return { note, len: ev.len, kind: this.kinds[voice] };
  }
}
