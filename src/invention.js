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

import { chordScale } from './bass.js?v=245';

const pc12 = (n) => ((n % 12) + 12) % 12;

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

/**
 * The scale the lines move along over a chord, as pitch classes. In a key (as Bach
 * writes): the key's scale, with the chord's own tones put in place of the scale notes a
 * half step from them (so V in a minor key brings its leading note: harmonic minor).
 * Without a key, the chord's own scale.
 */
export function lineScale(chord, key = null) {
  if (!key) return chordScale(chord.type).scale.map((i) => pc12(chord.root + i));
  const set = new Set((key.minor ? MINOR : MAJOR).map((i) => pc12(key.tonic + i)));
  // A chord tone outside the key replaces the one scale note it alters: in minor most
  // often a raised note (G becomes G-sharp), in major a lowered one (B becomes B-flat);
  // never the key's tonic or fifth.
  const fixed = new Set([pc12(key.tonic), pc12(key.tonic + 7)]);
  const tones = chordScale(chord.type).tones.map((i) => pc12(chord.root + i));
  for (const t of tones) {
    if (set.has(t)) continue;
    const order = key.minor ? [t - 1, t + 1] : [t + 1, t - 1];
    const out = order.map(pc12).find((n) => set.has(n) && !fixed.has(n) && !tones.includes(n));
    if (out !== undefined) set.delete(out);
    set.add(t);
  }
  return [...set];
}

/** A note `moves` scale steps from `from`, along the line's scale (see lineScale). */
export function scaleStep(from, moves, chord, key = null) {
  const scale = lineScale(chord, key);
  const inScale = (n) => scale.includes(pc12(n));
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
  // (each a different size from the one before, so the line doesn't just bounce)
  let d = -Math.sign(moves[7]);
  let size = 0;
  // A leap of a 4th or more is answered by a step back the other way (G–c–B–c in the C
  // major Invention), as counterpoint asks.
  const prevLeap = Math.abs(moves[7]);
  for (let k = 0; k < 4; k++) {
    let next;
    if ((k === 0 ? prevLeap : size) >= 3) {
      next = 1;
      d = k === 0 ? -Math.sign(moves[7]) : -d;
    } else {
      do next = pick([1, 2, 2, 3, 3, 4, 5], rng); while (next === size);
      if (k > 0 && rng() < 0.7) d = -d; // mostly turning; sometimes carrying on the same way
    }
    size = next;
    out.push({ at: 8 + 2 * k, len: 2, move: d * size });
  }
  return out;
}

// ---- Your own subject, typed as note names: "C5 D E F D E C G- C6- B5- C6-".
// Each note is a 16th; each "-" after it holds it a 16th longer (G- is an 8th, G--- a
// quarter); "r" is a 16th's rest (r- an 8th's...). An octave number is optional: without
// one, a note goes to the octave nearest the note before (the first to octave 5). Sharps
// and flats are read but the line follows the scale of each chord it meets: the subject
// is kept as its steps along the scale (the letter names), so it fits every chord.

const LETTER_PC = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B

/**
 * Read a typed subject. Returns {events, notes, length} (events as the generator keeps
 * subjects: {at, len, move}, with the first note's pitch as a hint for its register) or
 * {error}. A subject of half a bar or less is answered a 5th higher to fill the bar (as in
 * the C major Invention); a longer one is filled out by holding its last note; past a bar
 * it's cut at the bar line.
 */
export function parseSubject(text) {
  const tokens = String(text).trim().split(/[\s,|]+/).filter(Boolean);
  const events = [];
  const notes = [];
  let at = 0;
  let prevDia = null;
  for (const tok of tokens) {
    const rest = /^[rR](-*)$/.exec(tok);
    if (rest) { at += 1 + rest[1].length; continue; }
    const m = /^([A-Ga-g])([#♯]|[b♭])?(\d)?(-*)$/.exec(tok);
    if (!m) return { error: `Can't read "${tok}": use note names like C5, Eb, F#4, with - to hold and r to rest` };
    const letter = 'CDEFGAB'.indexOf(m[1].toUpperCase());
    const acc = !m[2] ? 0 : /[#♯]/.test(m[2]) ? 1 : -1;
    let oct;
    if (m[3] !== undefined) oct = Number(m[3]);
    else if (prevDia === null) oct = 5;
    else {
      // the octave that puts it nearest the note before
      oct = Math.round((prevDia - letter) / 7);
    }
    const dia = letter + 7 * oct;
    const len = 1 + m[4].length;
    if (at >= 16) break; // past the bar: cut
    events.push({ at, len: Math.min(len, 16 - at), move: prevDia === null ? null : dia - prevDia });
    notes.push(12 * (oct + 1) + LETTER_PC[letter] + acc);
    prevDia = dia;
    at += len;
  }
  if (!events.length) return { error: 'No notes yet' };
  const length = Math.min(at, 16);
  if (at <= 8) {
    // Half a bar: stated, then again a 5th higher (four steps up the scale) in the same voice.
    const firstDia = prevDia - events.slice(1).reduce((sum, e) => sum + e.move, 0);
    const again = events.map((e, k) => ({ ...e, at: e.at + 8, move: k === 0 ? firstDia + 4 - prevDia : e.move }));
    events.push(...again);
  } else if (at < 16) {
    events[events.length - 1].len += 16 - at; // hold the last note to the bar line
  }
  events[0].pitch = notes[0];
  return { events, notes, length };
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
    // Each repeat starts a step below the last one's start; if the head itself ends a
    // step down, that would repeat its last note, so then a third below instead.
    const back = -1 - head.slice(1).reduce((sum, x) => sum + x.move, 0);
    head.forEach((e, k) => out.push({
      at: r * 4 + k, len: 1, dir: -1, // a falling sequence
      move: k === 0 ? (r === 0 ? null : back || -1) : e.move,
    }));
  }
  return out;
}

/** A walking bass under an episode: quarter notes stepping down. */
const walkDown = () => [0, 4, 8, 12].map((at, k) => ({ at, len: 4, move: k ? -1 : null, dir: -1 }));

/** The cadence: the upper voice runs down to the tonic's chord; the bass goes 5 → 1. */
const cadenceUpper = () => [
  { at: 0, len: 2, move: null, high: true }, { at: 2, len: 2, move: -1 }, { at: 4, len: 2, move: -1 }, { at: 6, len: 2, move: 1 },
  { at: 8, len: 1, move: -1 }, { at: 9, len: 1, move: -1 }, { at: 10, len: 1, move: 1 }, { at: 11, len: 1, move: -1 },
  { at: 12, len: 4, move: -1 },
];
const cadenceLower = () => [{ at: 0, len: 8, move: null, tone: 'root' }, { at: 8, len: 8, move: null, tone: 'fifth' }];
const finalNote = () => [{ at: 0, len: 8, move: null, tone: 'root' }]; // both voices: the octave

export const VOICE_RANGES = { upper: [60, 84], lower: [43, 67] };

// ---- Counterpoint: the rules of two-voice writing, as taught from species counterpoint
// (Fux) onwards and as Bach keeps them in the Inventions. Each candidate note is scored
// against them; the planned note is kept unless something nearby breaks fewer rules.
const PERFECT = [0, 7]; // unison/octave, fifth (as intervals mod 12)
const CONSONANT = [0, 3, 4, 7, 8, 9]; // the 4th (5) is a dissonance between two voices

/** The interval class between two notes (lower to upper), 0–11. */
const ic = (lower, upper) => pc12(upper - lower);

/**
 * What a note would break, as {cost, faults}. `ctx`:
 *  voice; other — the other voice's note sounding now (null: none);
 *  prev, prev2 — this voice's last two notes; pair — {upper, lower} at the last moment both
 *  sounded; otherMoved — whether the other voice struck a new note now (else it holds);
 *  strong — beat 1 or 3; beat — on a beat; parallels — how many parallel 3rds/6ths in a
 *  row so far; edge — the first or last note of a section (unisons allowed).
 */
export function counterpointCost(n, ctx) {
  const faults = [];
  const add = (w, why) => { faults.push(why); return w; };
  let cost = 0;
  const { prev, prev2, other, pair, voice } = ctx;
  // Each line on its own.
  if (prev !== null && prev !== undefined) {
    const leap = n - prev;
    const size = Math.abs(leap);
    if (size === 6) cost += add(40, 'tritone leap');
    if (size === 10 || size === 11) cost += add(40, 'leap of a 7th');
    if (size > 12) cost += add(80, 'leap over an octave');
    if (size === 0 && ctx.moving) cost += add(25, 'repeated note'); // the line was meant to move
    // A leap of a 4th or more is recovered by step the other way.
    if (prev2 !== null && prev2 !== undefined && Math.abs(prev - prev2) >= 5) {
      const back = Math.sign(prev - prev2) !== Math.sign(leap) && size <= 2;
      if (!back) cost += add(25, 'leap not recovered by step');
    }
  }
  if (other === null || other === undefined) return { cost, faults };
  const upper = voice === 'upper' ? n : other;
  const lower = voice === 'upper' ? other : n;
  if (lower >= upper) cost += add(300, 'voices cross');
  if (upper - lower > 24) cost += add(30, 'more than two octaves apart');
  if (upper === lower && !ctx.edge) cost += add(50, 'unison');
  const i = ic(lower, upper);
  // Consonance: always on the strong beats; elsewhere a dissonance must come by step
  // (a passing or neighbour note).
  if (!CONSONANT.includes(i)) {
    if (ctx.strong) cost += add(100, 'dissonance on a strong beat');
    else if (prev === null || prev === undefined || Math.abs(n - prev) > 2 || !ctx.mine) cost += add(35, 'dissonance not approached by step');
  }
  // Motion from the last moment both sounded.
  if (pair && pair.upper !== undefined && pair.lower !== undefined && pair.upper !== null && pair.lower !== null) {
    const du = upper - pair.upper;
    const dl = lower - pair.lower;
    const pi = ic(pair.lower, pair.upper);
    if (du !== 0 || dl !== 0) {
      if (PERFECT.includes(i) && i === pi && (du !== 0 && dl !== 0)) {
        cost += Math.sign(du) === Math.sign(dl) ? add(200, `parallel ${i ? '5ths' : 'octaves'}`) : add(150, `${i ? '5ths' : 'octaves'} by contrary motion`);
      } else if (PERFECT.includes(i) && !(PERFECT.includes(pi) && i === pi) && Math.sign(du) === Math.sign(dl) && du !== 0 && Math.abs(du) > 2) {
        cost += add(60, `hidden ${i ? '5th' : 'octave'}`); // similar motion into a perfect interval, the upper voice leaping
      }
      if ([3, 4, 8, 9].includes(i) && [3, 4, 8, 9].includes(pi) && Math.sign(du) === Math.sign(dl) && du !== 0 && (ctx.parallels || 0) >= 3) {
        cost += add(20, 'more than three parallel 3rds/6ths');
      }
    }
  }
  return { cost, faults };
}

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

  /** Use your own subject (events from parseSubject), or null for a new one each time. */
  setSubject(events) {
    this.userSubject = events ? events.map((e) => ({ ...e })) : null;
    this.reset();
  }

  reset() {
    // Your subject if you've given one (a copy: the plan is reused), else a new one.
    this.subject = this.userSubject ? this.userSubject.map((e) => ({ ...e })) : makeSubject(this.rng);
    this.counter = makeCounter(this.subject, this.rng);
    this.bar = -1;
    this.barCount = 0; // bars since the piece (or the section) started
    this.plan = { upper: [], lower: [] };
    this.last = { upper: null, lower: null };
    this.prevPair = null;
    this.kinds = { upper: 'rest', lower: 'rest' };
    this.sound = { upper: null, lower: null }; // {note, until (16th)} sounding in each voice
    this.prev2 = { upper: null, lower: null };
    this.pair = null; // both voices' notes the last time both sounded
    this.parallels = 0;
    this.rules = true; // the counterpoint check (off: notes as planned, for comparison)
    this.faults = []; // what the chosen notes still broke (for tests and display)
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
   * @param info {cadence, afterCadence, other, key} — form marks for this bar (read on its
   *   first 16th), for the lower voice the upper voice's last note, and the key
   *   ({tonic, minor}) the lines keep to (null: each chord's own scale)
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
      } else if (ev.pitch !== undefined && this.kinds[voice] === 'subject') {
        // Your subject's first note: its own pitch class, in this voice's register (an octave
        // down in the lower voice), moved to the nearest chord tone if it isn't one.
        let p = ev.pitch - (voice === 'lower' ? 12 : 0);
        while (p > hi) p -= 12;
        while (p < lo) p += 12;
        note = nearestTone(p, chord);
      } else if (ev.high) {
        // (the cadence starts high, so its run down stays in the voice's range)
        note = nearestTone(hi - 6, chord, -1);
      } else note = nearestTone(Math.round((near + mid) / 2), chord);
    } else {
      note = scaleStep(prev, ev.move, chord, info.key || null);
      // On the strong beats (1 and 3) a chord tone, reached the way the line is going (so
      // sequences keep falling); on 2 and 4 a passing note is fine.
      if (at % 8 === 0) note = nearestTone(note, chord, Math.sign(ev.move) || ev.dir || 0);
    }
    // Keep to the voice's range.
    while (note > hi) note -= 12;
    while (note < lo) note += 12;
    // The other voice, if it's sounding now.
    const otherVoice = voice === 'upper' ? 'lower' : 'upper';
    const os = this.sound[otherVoice];
    const other = os && os.until > sixteenth ? os.note : null;
    const otherMoved = !!(os && os.from === sixteenth);
    const strong = at % 8 === 0;
    const ctx = {
      voice, other, prev, prev2: this.prev2[voice], pair: this.pair, otherMoved, strong, beat: at % 4 === 0,
      parallels: this.parallels, edge: ev.tone === 'root' && this.kinds[voice] === 'final', mine: true,
      moving: ev.move !== 0 && this.kinds[voice] !== 'final', // (a new statement shouldn't start on the note just played either)
    };
    if (this.rules) {
      // The planned note, or a near alternative that keeps the rules better: a scale step
      // either side, the octave, a chord tone close by. Moving off the plan costs a little
      // (more the further), so the line keeps its shape where it can.
      const key = info.key || null;
      const scale = lineScale(chord, key);
      const cands = new Map();
      const consider = (m, away) => {
        if (m < lo - (voice === 'lower' ? 5 : 0) || m > hi) return;
        if (!scale.includes(pc12(m))) return;
        if (strong && !chordScale(chord.type).tones.includes(pc12(m - chord.root))) return; // chord tones on 1 and 3
        // Further from the plan costs more, so a run keeps its shape.
        if (!cands.has(m)) cands.set(m, away + 3 * Math.abs(m - note));
      };
      consider(note, 0);
      for (const d of [1, -1, 2, -2]) consider(scaleStep(note, d, chord, key), 6 * Math.abs(d));
      // (an octave only where a statement starts, and only if the rest of the figure then
      // stays in range: mid-run it would break the line)
      const fits = (start) => {
        let n = start;
        for (const e of this.plan[voice].filter((x) => x.at > at)) {
          if (e.move === null) break;
          n = scaleStep(n, e.move, chord, key);
          if (n < lo - 2 || n > hi + 2) return false;
        }
        return true;
      };
      if (ev.move === null) for (const d of [12, -12]) if (fits(note + d)) consider(note + d, 12);
      for (let d = -4; d <= 4; d++) {
        const t = nearestTone(note + d, chord);
        if (d && Math.abs(t - note) <= 4) consider(t, 8);
      }
      if (!cands.size) cands.set(note, 0);
      let best = null;
      const choose = () => {
        for (const [m, away] of cands) {
          const { cost, faults } = counterpointCost(m, ctx);
          const total = cost + away;
          if (!best || total < best.total) best = { m, total, faults };
        }
      };
      choose();
      // Never cross, nor drift more than two octaves apart: if everything near does, an
      // octave away it is.
      if (best.faults.includes('voices cross') || best.faults.includes('more than two octaves apart')) {
        for (const d of [12, -12, 24, -24]) {
          const m = note + d;
          if (!cands.has(m) && m >= lo - (voice === 'lower' ? 5 : 0) && m <= hi) cands.set(m, 12);
        }
        best = null;
        choose();
      }
      note = best.m;
      this.faults = best.faults;
    } else {
      // (unchecked: only keep the lower voice under the upper)
      if (voice === 'lower' && other !== null) while (note > other - 3 && note - 12 >= lo - 5) note -= 12;
      this.faults = counterpointCost(note, ctx).faults;
    }
    // Remember what's sounding, for the other voice and the next note.
    this.prev2[voice] = prev;
    this.last[voice] = note;
    this.sound[voice] = { note, from: sixteenth, until: sixteenth + ev.len };
    if (other !== null) {
      const now = voice === 'upper' ? { upper: note, lower: other } : { upper: other, lower: note };
      const i = ic(now.lower, now.upper);
      const pi = this.pair ? ic(this.pair.lower, this.pair.upper) : -1;
      const imperfect = [3, 4, 8, 9];
      const parallel = this.pair && imperfect.includes(i) && imperfect.includes(pi)
        && Math.sign(now.upper - this.pair.upper) === Math.sign(now.lower - this.pair.lower) && now.upper !== this.pair.upper;
      this.parallels = parallel ? this.parallels + 1 : 0;
      this.pair = now;
    }
    return { note, len: ev.len, kind: this.kinds[voice], faults: this.faults };
  }
}
