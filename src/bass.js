// Bass lines over the chord progression, the way a play-along app's bassist plays them:
// a walking line in quarter notes, a two-feel, a bossa pattern, or just roots. Each
// chord's line is planned when it starts, knowing the chord that comes next.

import { CHORDS } from './core.js?v=253';

export const BASS_STYLES = {
  auto: 'Auto (from the song)', walk: 'Walking', two: 'Two-feel', bossa: 'Bossa', roots: 'Roots',
};

/** The style for an iReal Pro song style ("Up Tempo Swing", "Bossa Nova", "Rock Pop"…). */
export function styleForSong(style = '') {
  const s = style.toLowerCase();
  if (/bossa|samba|latin|cha|mambo|salsa|son\b|afro|bolero|rumba/.test(s)) return 'bossa';
  if (/ballad|two|2-feel/.test(s)) return 'two';
  if (/rock|pop|funk|even|soul|r&b|reggae|disco|march|country|gospel|shuffle|blues rock/.test(s)) return 'roots';
  return 'walk'; // swing, bebop, up tempo, medium, waltz…
}

// The scale a bassist walks through over each chord type (semitones above the root).
const IONIAN = [0, 2, 4, 5, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MIXO = [0, 2, 4, 5, 7, 9, 10];
const SCALES = {
  maj: IONIAN, maj7: IONIAN, maj6: IONIAN, six9: IONIAN, maj9: IONIAN, add9: IONIAN, sus2: IONIAN,
  maj7s11: [0, 2, 4, 6, 7, 9, 11], maj7s5: [0, 2, 4, 6, 8, 9, 11],
  min: DORIAN, min7: DORIAN, min9: DORIAN, min11: DORIAN, min6: DORIAN, minmaj7: [0, 2, 3, 5, 7, 9, 11],
  dom7: MIXO, dom9: MIXO, dom13: MIXO, dom7sus4: MIXO, sus4: MIXO, dom7s11: [0, 2, 4, 6, 7, 9, 10],
  dom7b9: [0, 1, 4, 5, 7, 8, 10], dom7s9: [0, 1, 3, 4, 6, 8, 10], alt: [0, 1, 3, 4, 6, 8, 10],
  dom7b5: [0, 2, 4, 6, 8, 10], aug7: [0, 2, 4, 6, 8, 10], aug: [0, 2, 4, 6, 8, 10],
  hdim7: [0, 1, 3, 5, 6, 8, 10], dim: [0, 2, 3, 5, 6, 8, 9, 11], dim7: [0, 2, 3, 5, 6, 8, 9, 11],
};

/** A chord's tones (triad and seventh) and its scale, as pitch classes above its root. */
export function chordScale(type) {
  const tones = (CHORDS[type]?.intervals || [0, 4, 7]).slice(0, 4).map((i) => i % 12);
  return { tones, scale: SCALES[type] || IONIAN };
}

/** The note with pitch class `pc` nearest `near`, kept within lo..hi. */
export function place(pc, near, lo, hi) {
  let n = near + ((((pc - near) % 12) + 18) % 12) - 6; // nearest, either way
  while (n < lo) n += 12;
  while (n > hi) n -= 12;
  return n;
}

/** The fifth of a chord type (a diminished fifth for diminished chords, augmented for augmented). */
const fifthOf = (type) => {
  const iv = CHORDS[type]?.intervals || [];
  return iv.includes(7) ? 7 : iv.includes(6) ? 6 : iv.includes(8) ? 8 : 7;
};

const pc12 = (n) => ((n % 12) + 12) % 12;
const pick = (items, rng) => items[Math.min(items.length - 1, Math.floor(rng() * items.length))];

/**
 * One chord's bass line: [{beat, note, len}] (beats from the chord's start; MIDI notes
 * in lo..hi, written register). `chord` and `next` are {root (pitch class), type};
 * `prev` is the last note played (or null), so the line carries on from it.
 */
/** Note values for the bass line's Rate (in beats); 'auto' leaves each style its own. */
export const BASS_RATES = {
  auto: null, '1/1': 4, '1/2': 2, '1/4D': 1.5, '1/4': 1, '1/8D': 0.75, '1/8': 0.5, '1/8T': 1 / 3, '1/16': 0.25,
};

export function bassLine({ chord, next = null, beats, prev = null, style = 'walk', rng = Math.random, lo = 40, hi = 64, barBeats = 4, unit = null }) {
  if (!chord || chord.type === 'rest' || beats <= 0) return [];
  // The root nearest the last note (a walking line has just led into it). The other
  // styles jump back towards the middle of the range when they've drifted, so a run of
  // chords moving one way doesn't climb (or sink) out of the bass's sweet spot.
  const mid = lo + 10;
  let root = place(chord.root, prev ?? mid, lo, hi);
  if (style !== 'walk') {
    if (root > mid + 7 && root - 12 >= lo) root -= 12;
    if (root < mid - 7 && root + 12 <= hi) root += 12;
  }
  const fifth = place((chord.root + fifthOf(chord.type)) % 12, root, lo, hi);
  const out = [];
  const EPS = 1e-6;
  if (style === 'roots') {
    // The root once a bar, or repeated at the Rate (a pulsing bass).
    const step = unit || barBeats;
    for (let b = 0; b < beats - EPS; b += step) out.push({ beat: b, note: root, len: Math.min(step, beats - b) });
    return out;
  }
  if (style === 'two') {
    // Half notes (or the Rate): the root, then the fifth, and so on.
    const step = unit || 2;
    for (let b = 0, k = 0; b < beats - EPS; b += step, k++) {
      out.push({ beat: b, note: k % 2 === 0 ? root : fifth, len: Math.min(step, beats - b) });
    }
    return out;
  }
  if (style === 'bossa') {
    // Root on 1, the fifth on the "and" of 2 held over: per bar (or what's left of the chord).
    for (let b = 0; b < beats; b += barBeats) {
      const span = Math.min(barBeats, beats - b);
      if (span < 2) { out.push({ beat: b, note: root, len: span }); continue; }
      out.push({ beat: b, note: root, len: 1.5 });
      out.push({ beat: b + 1.5, note: fifth, len: span - 1.5 });
    }
    return out;
  }
  // Walking: a quarter note a beat. The root first; the last beat leads into the next
  // chord's root by a half step (from below or above) or from its fifth; the beats
  // between move by scale step or chord tone towards it.
  const { tones, scale } = chordScale(chord.type);
  const inScale = (n) => scale.includes((((n - chord.root) % 12) + 12) % 12);
  const isTone = (n) => tones.includes((((n - chord.root) % 12) + 12) % 12);
  const target = next && next.type !== 'rest' ? next : chord;
  const lineFrom = [root];
  // Where the next chord's root will be: near where this line will end up.
  // Where the line heads: the next root, near here but leaning back towards the middle.
  const goal = place(target.root, Math.round((root * 2 + mid) / 3 + (rng() - 0.5) * 6), lo, hi);
  const approachFrom = (p) => {
    // A half step below or above the next root, or its fifth: within a fifth of the note
    // before, and not that note's pitch class again.
    const fifth = place((target.root + 7) % 12, p, lo, hi);
    const all = [goal - 1, goal + 1, fifth, fifth - 12, fifth + 12].filter((n) => n >= lo && n <= hi && pc12(n) !== pc12(p));
    const near = all.filter((n) => Math.abs(n - p) <= 7 && Math.abs(n - goal) <= 7);
    return near.length ? near : all.sort((a, b) => Math.abs(a - p) - Math.abs(b - p)).slice(0, 1);
  };
  // A note per beat (or per the Rate): `count` notes, the last taking what's left.
  const step = unit || 1;
  const count = Math.max(1, Math.floor(beats / step + EPS));
  for (let b = 1; b < count; b++) {
    const at = b * step; // where this note falls, in beats from the chord
    const p = lineFrom[b - 1];
    if (b === count - 1) {
      const choices = approachFrom(p);
      if (choices.length) { lineFrom.push(pick(choices, rng)); continue; }
    }
    // A new bar over the same chord: back to a chord tone.
    const strong = Math.abs(at % barBeats) < EPS;
    const onBeat = Math.abs(at - Math.round(at)) < EPS;
    const left = count - 1 - b; // notes still to fill before the approach
    const dir = Math.sign(goal - p) || (rng() < 0.5 ? 1 : -1);
    const cands = [];
    for (let d = -5; d <= 5; d++) {
      const n = p + d;
      if (!d || n < lo || n > hi || !inScale(n) || pc12(n) === pc12(p)) continue;
      if (strong && !isTone(n)) continue;
      let w = 1;
      if (Math.sign(d) === dir) w += 2; // towards where the line is going
      if (Math.abs(d) <= 2) w += 3; // stepwise
      else if (Math.abs(d) >= 5) w *= 0.5; // leaps now and then
      if (isTone(n)) w += onBeat && Math.round(at) % 2 === 0 ? 2 : onBeat ? 1 : 0.5; // chord tones on the stronger beats
      if (Math.abs(goal - n) > (left + 1) * 4) w *= 0.2; // don't wander too far to get back
      cands.push({ n, w });
    }
    if (!cands.length) { lineFrom.push(b % 2 ? fifth : root); continue; }
    let r = rng() * cands.reduce((s, c) => s + c.w, 0);
    let chosen = cands[cands.length - 1].n;
    for (const c of cands) { r -= c.w; if (r <= 0) { chosen = c.n; break; } }
    lineFrom.push(chosen);
  }
  return lineFrom.map((note, k) => ({ beat: k * step, note, len: k === count - 1 ? beats - k * step : step }));
}
