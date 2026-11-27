// Progression fills: every few rounds, the last chord or two are swapped for a passage that
// leads back into the first chord, as a drum machine's fill leads back to the 1.
//
//  - Tonnetz (neo-Riemannian): a short walk of P, L and R moves (each changes one note of a
//    triad by a step and keeps the other two), ending one move from the first chord, so
//    each change is smooth however far it goes. P: C ↔ Cm; R: C ↔ Am; L: C ↔ Em. Two
//    moves together (PL, PR, LR…) reach the hexatonic and octatonic neighbours (C → A♭, E♭).
//  - Turnaround: the functional ways into a chord: ii–V, the tritone-sub ii–V, the backdoor
//    iv–♭VII7, V/V–V, ♭III–♭II; or one chord: V7, ♭II7, ♭VII7, vii°7, iv.
// Pure (seeded by an rng), unit-tested.

import { CHORDS } from './core.js?v=271';

export const PROG_FILL_STYLES = { off: 'Off', tonnetz: 'Tonnetz', turnaround: 'Turnaround', negative: 'Negative harmony', mix: 'Mix' };
export const PROG_FILL_EVERY = [1, 2, 4, 8];
export const PROG_FILL_LENGTHS = [1, 2];

const pc = (n) => ((n % 12) + 12) % 12;
const FLAT_NAMES = new Set([1, 3, 8, 10]);
const key = (t) => `${t.root}${t.minor ? 'm' : ''}`;

/**
 * A chord's place on the Tonnetz: the major or minor triad at its core, or null for a rest.
 * Seventh chords are their triad (G7 → G, Am7 → Am); a half-diminished chord is the minor
 * triad a minor third up (Bø: Dm), a diminished one the dominant it stands for (B°: G).
 */
export function triadOf(chord) {
  if (!chord || chord.type === 'rest') return null;
  const iv = CHORDS[chord.type]?.intervals || [0, 4, 7];
  const has = (n) => iv.includes(n);
  if (chord.type === 'hdim7') return { root: pc(chord.root + 3), minor: true };
  if (has(3) && has(6) && !has(7)) return { root: pc(chord.root + 8), minor: false }; // dim, dim7
  return { root: pc(chord.root), minor: has(3) && !has(4) };
}

/** The three moves. Each flips the triad between major and minor. */
export const PLR = {
  P: (t) => ({ root: t.root, minor: !t.minor }),
  R: (t) => (t.minor ? { root: pc(t.root + 3), minor: false } : { root: pc(t.root + 9), minor: true }),
  L: (t) => (t.minor ? { root: pc(t.root + 8), minor: false } : { root: pc(t.root + 4), minor: true }),
};

/** The triads one move away ({t, moves: 'P'}), and two (moves: 'PL'…), each once, nearest first. */
export function neighbours(t) {
  const seen = new Map([[key(t), null]]);
  const out = [];
  for (const [a, fa] of Object.entries(PLR)) {
    const n = fa(t);
    if (!seen.has(key(n))) { seen.set(key(n), a); out.push({ t: n, moves: a }); }
  }
  for (const [a, fa] of Object.entries(PLR)) {
    for (const [b, fb] of Object.entries(PLR)) {
      if (a === b) continue;
      const n = fb(fa(t));
      if (!seen.has(key(n))) { seen.set(key(n), a + b); out.push({ t: n, moves: a + b }); }
    }
  }
  return out;
}

/** Moves from triad a to b: 1 or 2, or 0 when b isn't within two. */
export function distance(a, b) {
  const hit = neighbours(a).find((n) => key(n.t) === key(b));
  return hit ? hit.moves.length : 0;
}

/**
 * The chord type for a new triad, in the flavour of the chord it replaces: a seventh stays a
 * seventh (a dominant 7 becomes min7 when the triad goes minor), a sixth a sixth, a ninth a ninth.
 */
export function flavour(type, minor) {
  const families = [
    [['dom7', 'dom7sus4', 'dom7b5', 'dom7s11', 'aug7'], 'dom7', 'min7'],
    [['dom9', 'dom13', 'dom7s9', 'dom7b9', 'alt'], 'dom9', 'min9'],
    [['maj7', 'maj7s11', 'maj7s5', 'min7', 'hdim7', 'dim7', 'minmaj7'], 'maj7', 'min7'],
    [['maj6', 'six9', 'min6'], 'maj6', 'min6'],
    [['maj9', 'min9', 'min11', 'add9'], 'maj9', 'min9'],
  ];
  for (const [types, maj, min] of families) if (types.includes(type)) return minor ? min : maj;
  return minor ? 'min' : 'maj';
}

function weighted(cands, rng) {
  const total = cands.reduce((s, c) => s + c.w, 0);
  if (!total) return null;
  let r = rng() * total;
  for (const c of cands) { r -= c.w; if (r <= 0) return c; }
  return cands[cands.length - 1];
}

/**
 * A Tonnetz fill of `k` chords (1 or 2) from `from` (the chord before it) into `to` (the first
 * chord of the next round), each a move or two from the last, the final one a move or two from
 * `to`. `replaced`: the chords it stands in for (their flavours are kept, and a fill that would
 * just play them again isn't chosen). Returns [{root, type}] or null if there's no way.
 */
export function tonnetzFill(from, to, k, replaced, rng = Math.random) {
  const A = triadOf(from) || triadOf(to);
  const T = triadOf(to);
  if (!A || !T) return null;
  const same = replaced.map((c) => triadOf(c));
  const avoid = new Set([key(T)]);
  const cands = [];
  const ending = (f) => { const d = distance(f, T); return d === 1 ? 3 : d === 2 ? 1 : 0; };
  for (const n1 of neighbours(A)) {
    if (avoid.has(key(n1.t))) continue;
    const near1 = n1.moves.length === 1 ? 2 : 1;
    if (k === 1) {
      const w = ending(n1.t) * near1;
      if (w && !(same[0] && key(same[0]) === key(n1.t))) cands.push({ path: [n1.t], w });
      continue;
    }
    for (const n2 of neighbours(n1.t)) {
      if (avoid.has(key(n2.t)) || key(n2.t) === key(A)) continue;
      const near2 = n2.moves.length === 1 ? 2 : 1;
      const w = ending(n2.t) * near1 * near2;
      const unchanged = same[0] && same[1] && key(same[0]) === key(n1.t) && key(same[1]) === key(n2.t);
      if (w && !unchanged) cands.push({ path: [n1.t, n2.t], w });
    }
  }
  const pick = weighted(cands, rng);
  if (!pick) return null;
  return pick.path.map((t, i) => ({ root: t.root, type: flavour(replaced[i]?.type || 'maj', t.minor) }));
}

/** A turnaround of `k` chords (1 or 2) into `to`, chosen at random among the usual ones. */
export function turnaroundFill(to, k, rng = Math.random) {
  if (!to || to.type === 'rest') return null;
  const t = to.root;
  const minor = !!CHORDS[to.type]?.minor;
  const V = minor ? 'dom7b9' : 'dom7';
  const two = minor ? 'hdim7' : 'min7';
  const options = k === 1
    ? [[[7, V]], [[1, 'dom7']], [[10, 'dom7']], [[11, 'dim7']], [[5, minor ? 'min7' : 'min6']]]
    : [
      [[2, two], [7, V]], // ii–V
      [[8, 'min7'], [1, 'dom7']], // the tritone sub's ii–V
      [[5, 'min7'], [10, 'dom7']], // backdoor: iv–♭VII7
      [[2, 'dom7'], [7, V]], // V/V–V
      [[3, 'maj7'], [1, 'maj7']], // ♭III–♭II, sliding in
    ];
  const pick = options[Math.min(options.length - 1, Math.floor(rng() * options.length))];
  return pick.map(([iv, type]) => ({ root: pc(t + iv), type }));
}

/**
 * The progression as it plays on round `round`: `slots` ({root, type, beats…}) with the last
 * `length` chords replaced by a fill when this is a fill round (the last of every `every`, if
 * the `chance` 0–100 comes up). `rngFor(round)` gives that round's seeded rng. Returns
 * {slots, filled: Set of indexes} (the slots unchanged, filled empty, on other rounds).
 */
export function fillRound(slots, round, { style = 'off', every = 4, length = 2, chance = 100, tonic = null } = {}, rngFor) {
  const none = { slots, filled: new Set() };
  if (style === 'off' || !slots.length || (round + 1) % Math.max(1, every) !== 0) return none;
  const rng = rngFor(round);
  if (rng() * 100 >= chance) return none;
  const k = Math.min(length, slots.length - 1);
  if (k < 1) return none;
  const at = slots.length - k;
  const to = slots.find((s) => s.type !== 'rest'); // the next round starts here
  let from = null;
  for (let i = at - 1; i >= 0 && !from; i--) if (slots[i].type !== 'rest') from = slots[i];
  const replaced = slots.slice(at);
  const kinds = tonic === null ? ['tonnetz', 'turnaround'] : ['tonnetz', 'turnaround', 'negative'];
  const kind = style === 'mix' ? kinds[Math.min(kinds.length - 1, Math.floor(rng() * kinds.length))] : style;
  const chords = (kind === 'tonnetz' ? tonnetzFill(from, to, k, replaced, rng) : null)
    || (kind === 'negative' && tonic !== null ? negativeFill(replaced, tonic) : null)
    || turnaroundFill(to, k, rng);
  if (!chords) return none;
  const out = slots.map((s) => s);
  const filled = new Set();
  chords.forEach((c, j) => {
    const i = at + j;
    out[i] = { ...slots[i], root: c.root, type: c.type, inv: 0, flat: FLAT_NAMES.has(c.root) }; // D♭ E♭ A♭ B♭, but F♯
    filled.add(i);
  });
  return { slots: out, filled };
}

// ---- A whole progression from a walk on the Tonnetz.

export const TONNETZ_WALKS = {
  smooth: 'Smooth: one move a chord',
  wide: 'Wide: one or two moves',
  hexatonic: 'Hexatonic: P and L in turn',
  octatonic: 'Octatonic: P and R in turn',
  fifths: 'Fifths: L and R in turn',
};

/**
 * `length` chords walking the Tonnetz from `start` ({root, minor}). Smooth and Wide pick
 * moves at random (never straight back where they came from, and not to a chord just
 * played); with `close`, the last chord is a move from the start, so the loop comes round
 * smoothly (a Smooth walk too short or odd to get there one move at a time takes a double
 * move or two on the way). The cycles alternate two moves (hexatonic: C Cm A♭ A♭m E Em…;
 * octatonic: C Cm E♭ E♭m F♯ F♯m…; fifths: C Em G Bm D…), starting with either.
 * `sevenths`: maj7 / min7 instead of triads. Returns [{root, type}].
 */
export function tonnetzProgression({ start = { root: 0, minor: false }, length = 4, walk = 'smooth', close = true, sevenths = false, rng = Math.random } = {}) {
  const n = Math.max(1, Math.round(length));
  const out = (path) => path.map((t) => ({ root: t.root, type: sevenths ? (t.minor ? 'min7' : 'maj7') : (t.minor ? 'min' : 'maj') }));
  const cycles = { hexatonic: ['P', 'L'], octatonic: ['P', 'R'], fifths: ['L', 'R'] };
  if (cycles[walk]) {
    const pair = rng() < 0.5 ? cycles[walk] : [...cycles[walk]].reverse();
    const path = [start];
    for (let i = 1; i < n; i++) path.push(PLR[pair[(i - 1) % 2]](path[i - 1]));
    return out(path);
  }
  const reach = (t) => (walk === 'wide' ? neighbours(t) : Object.entries(PLR).map(([m, f]) => ({ t: f(t), moves: m })));
  // Single moves form a honeycomb: every loop is an even number of moves, the smallest 6. So a
  // Smooth walk that can't come round one move at a time takes a double move or two on the
  // way: one for an odd number of chords, two for 4 (2+2+1+1: round a hexagon).
  const doubles = walk === 'wide' || !close || n <= 2 ? 0 : n % 2 === 1 ? 1 : n < 6 ? 6 - n : 0;
  let best = null;
  for (let tries = 0; tries < 400; tries++) {
    const path = [start];
    let last = '';
    // Where the double moves go (never the last step, which comes back next to the start).
    const spots = Array.from({ length: n - 2 }, (_, k) => k + 1);
    const doubleAt = new Set();
    while (doubleAt.size < Math.min(doubles, spots.length)) doubleAt.add(spots[Math.floor(rng() * spots.length)]);
    for (let i = 1; i < n; i++) {
      const recent = new Set(path.slice(-3).map(key));
      const from = path[i - 1];
      let pool;
      if (doubleAt.has(i)) pool = neighbours(from).filter((x) => x.moves.length === 2 && !recent.has(key(x.t)));
      else {
        pool = reach(from).filter((x) => x.moves !== last && !recent.has(key(x.t)));
        // The last chord, looping back: one move from the start, if it can be.
        if (close && i === n - 1) {
          const ends = pool.filter((x) => distance(x.t, start) === 1);
          if (ends.length) pool = ends;
        }
      }
      if (!pool.length) pool = reach(from);
      const pick = pool[Math.floor(rng() * pool.length)];
      path.push(pick.t);
      last = pick.moves.length === 1 ? pick.moves : [...pick.moves].reverse().join(''); // undoing it is the reverse
    }
    // How it comes round: a move from the start is best (two will do, if that's all there is).
    const back = n > 1 ? distance(path[n - 1], start) : 1;
    const distinct = new Set(path.map(key)).size;
    const score = (close ? (back === 1 ? 20 : back === 2 ? 10 : 0) : 20) + distinct;
    if (score >= 20 + n) return out(path);
    if (!best || score > best.score) best = { path, score };
  }
  return out(best.path);
}


// ---- Negative harmony: every note mirrored across the axis between the key's tonic and its
// fifth (in C: C ↔ G, D ↔ F, E ↔ E♭, A ↔ B♭, B ↔ A♭, F♯ ↔ C♯). Major turns minor and back,
// V7 becomes a minor iv6 (G7 → Fm6), and doing it twice gives back what you started with.

/** A pitch class's mirror image, in the key of `tonic`. */
export const negativePc = (n, tonic) => pc(2 * tonic + 7 - n);

// Which chord to call a set of notes, most usual first.
const NAME_ORDER = ['maj', 'min', 'dom7', 'min7', 'maj7', 'min6', 'maj6', 'hdim7', 'dim', 'dim7', 'aug', 'sus2', 'sus4',
  'minmaj7', 'add9', 'dom9', 'min9', 'maj9', 'six9', 'dom7sus4', 'min11', 'dom13', 'dom7b9', 'dom7s9', 'dom7s11', 'dom7b5', 'aug7', 'maj7s11', 'maj7s5', 'alt'];
const pcsOf = (root, type) => new Set((CHORDS[type]?.intervals || [0, 4, 7]).map((i) => pc(root + i)));
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

/**
 * The chord for a set of pitch classes: preferring `rootHint` as its root, the usual chord
 * names first; if no chord has exactly those notes, the closest.
 */
export function nameChord(set, rootHint = null) {
  const roots = [...set];
  if (rootHint !== null && set.has(rootHint)) roots.unshift(rootHint);
  for (const root of roots) for (const type of NAME_ORDER) if (CHORDS[type] && sameSet(pcsOf(root, type), set)) return { root, type };
  let best = null;
  for (const root of roots) {
    for (const [i, type] of NAME_ORDER.entries()) {
      if (!CHORDS[type]) continue;
      const c = pcsOf(root, type);
      const shared = [...c].filter((x) => set.has(x)).length;
      const score = shared * 2 - (c.size - shared) - (set.size - shared) - i * 0.01;
      if (!best || score > best.score) best = { root, type, score };
    }
  }
  return { root: best.root, type: best.type };
}

/**
 * A chord's negative-harmony counterpart in the key of `tonic`. Its root is the mirror of
 * the original's fifth (C → Cm, G → Fm, G7 → Fm6, F → Gm), as the theory usually names them;
 * when no chord has its root there, the plainest name for the notes (Cmaj7 → A♭maj7).
 */
export function negativeChord(chord, tonic) {
  if (!chord || chord.type === 'rest' || !CHORDS[chord.type]) return chord;
  const iv = CHORDS[chord.type].intervals;
  const set = new Set(iv.map((i) => negativePc(chord.root + i, tonic)));
  const fifth = iv.find((i) => i === 7) ?? iv.find((i) => i === 6 || i === 8);
  const hint = fifth === undefined ? null : negativePc(chord.root + fifth, tonic);
  // The usual name at that root, else (an unusual one there) the plainest name anywhere.
  const named = nameChord(set, hint);
  const plain = hint !== null && named.root !== hint ? named : nameChord(set);
  const out = hint !== null && named.root !== hint ? named : NAME_ORDER.indexOf(named.type) <= NAME_ORDER.indexOf(plain.type) + 2 ? named : plain;
  // A major 6th is written as its relative minor 7th (E♭6 = Cm7), the more usual name.
  return out.type === 'maj6' ? { root: pc(out.root + 9), type: 'min7' } : out;
}

/** The negative-harmony fill: the chords it replaces, mirrored. */
export function negativeFill(replaced, tonic) {
  if (replaced.every((c) => !c || c.type === 'rest')) return null;
  return replaced.map((c) => (c && c.type !== 'rest' ? negativeChord(c, tonic) : { root: 0, type: 'rest' }));
}
