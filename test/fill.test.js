import test from 'node:test';
import assert from 'node:assert/strict';
import { triadOf, PLR, neighbours, distance, flavour, tonnetzFill, turnaroundFill, fillRound } from '../src/fill.js';

const seeded = (seed = 7) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const C = { root: 0, minor: false };
const name = (t) => `${'C C# D Eb E F F# G Ab A Bb B'.split(' ')[t.root]}${t.minor ? 'm' : ''}`;

test('P, L and R: one note moves by a step, two stay', () => {
  assert.equal(name(PLR.P(C)), 'Cm');
  assert.equal(name(PLR.R(C)), 'Am');
  assert.equal(name(PLR.L(C)), 'Em');
  assert.equal(name(PLR.R({ root: 9, minor: true })), 'C');
  assert.equal(name(PLR.L({ root: 4, minor: true })), 'C');
  // each is its own inverse
  for (const f of Object.values(PLR)) for (const t of [C, { root: 5, minor: true }]) assert.deepEqual(f(f(t)), t);
});

test('the neighbourhood: three one move away, and the two-move ones (hexatonic, octatonic…)', () => {
  const n = neighbours(C);
  assert.deepEqual(n.filter((x) => x.moves.length === 1).map((x) => name(x.t)).sort(), ['Am', 'Cm', 'Em']);
  const two = n.filter((x) => x.moves.length === 2).map((x) => name(x.t));
  assert.ok(two.includes('Ab')); // PL
  assert.ok(two.includes('Eb')); // PR
  assert.ok(two.includes('G') && two.includes('F')); // LR, RL: the fifths
  assert.equal(distance(C, { root: 9, minor: true }), 1);
  assert.equal(distance(C, { root: 8, minor: false }), 2);
  assert.equal(distance(C, { root: 6, minor: false }), 0); // F# is far
});

test('chords on the Tonnetz, and their flavour kept', () => {
  assert.deepEqual(triadOf({ root: 7, type: 'dom7' }), { root: 7, minor: false });
  assert.deepEqual(triadOf({ root: 2, type: 'min7' }), { root: 2, minor: true });
  assert.deepEqual(triadOf({ root: 11, type: 'hdim7' }), { root: 2, minor: true }); // Bø ~ Dm
  assert.deepEqual(triadOf({ root: 11, type: 'dim7' }), { root: 7, minor: false }); // B°7 ~ G
  assert.equal(triadOf({ root: 0, type: 'rest' }), null);
  assert.equal(flavour('dom7', true), 'min7');
  assert.equal(flavour('maj7', false), 'maj7');
  assert.equal(flavour('min', false), 'maj');
});

test('a Tonnetz fill moves smoothly and lands a move or two from the first chord', () => {
  const rng = seeded(3);
  const to = { root: 0, type: 'maj' };
  for (let i = 0; i < 200; i++) {
    const from = { root: 5, type: 'maj' }; // F, before the fill
    const replaced = [{ root: 7, type: 'dom7' }, { root: 7, type: 'dom7' }];
    const fill = tonnetzFill(from, to, 2, replaced, rng);
    assert.equal(fill.length, 2);
    const [a, b] = fill.map(triadOf);
    assert.ok(distance(triadOf(from), a) >= 1);
    assert.ok(distance(a, b) >= 1, 'each step a move or two');
    assert.ok(distance(b, triadOf(to)) >= 1, 'lands next to the first chord');
    assert.ok(fill.every((c) => c.type === 'dom7' || c.type === 'min7'), 'sevenths stay sevenths');
  }
  const one = tonnetzFill({ root: 9, type: 'min' }, to, 1, [{ root: 7, type: 'maj' }], seeded(1));
  assert.equal(one.length, 1);
  assert.ok(distance(triadOf(one[0]), triadOf(to)) >= 1);
});

test('turnarounds lead into the target', () => {
  const to = { root: 0, type: 'maj7' };
  const seen = new Set();
  const rng = seeded(5);
  for (let i = 0; i < 100; i++) seen.add(turnaroundFill(to, 2, rng).map((c) => `${c.root}${c.type}`).join(' '));
  assert.ok(seen.has('2min7 7dom7')); // Dm7 G7
  assert.ok(seen.has('8min7 1dom7')); // Abm7 Db7
  assert.ok(seen.has('5min7 10dom7')); // Fm7 Bb7
  const minor = turnaroundFill({ root: 9, type: 'min' }, 1, () => 0);
  assert.deepEqual(minor, [{ root: 4, type: 'dom7b9' }]); // E7b9 into Am
});

test('fill rounds: the last of every N, the last chords swapped, the rest left alone', () => {
  const slots = [[0, 'maj7'], [9, 'min7'], [2, 'min7'], [7, 'dom7']].map(([root, type]) => ({ root, type, beats: 4, inv: 1 }));
  const opts = { style: 'tonnetz', every: 4, length: 2, chance: 100 };
  const rngFor = (r) => seeded(r + 11);
  for (const r of [0, 1, 2, 4, 5]) assert.equal(fillRound(slots, r, opts, rngFor).filled.size, 0);
  const f = fillRound(slots, 3, opts, rngFor);
  assert.deepEqual([...f.filled], [2, 3]);
  assert.deepEqual(f.slots.slice(0, 2), slots.slice(0, 2));
  assert.ok(f.slots.slice(2).every((s) => s.beats === 4));
  assert.notDeepEqual(f.slots.slice(2).map((s) => [s.root, s.type]), [[2, 'min7'], [7, 'dom7']]);
  // the same round always fills the same way (seeded)
  assert.deepEqual(fillRound(slots, 3, opts, rngFor).slots, f.slots);
  assert.equal(fillRound(slots, 3, { ...opts, chance: 0 }, rngFor).filled.size, 0);
  assert.equal(fillRound(slots, 3, { ...opts, style: 'off' }, rngFor).filled.size, 0);
  assert.equal(fillRound(slots.slice(0, 1), 3, opts, rngFor).filled.size, 0); // one chord: nothing to fill
  assert.deepEqual([...fillRound(slots, 1, { ...opts, every: 2, length: 1, style: 'turnaround' }, rngFor).filled], [3]);
});

import { tonnetzProgression } from '../src/fill.js';
const tri = (c) => triadOf(c);

test('Tonnetz progressions: a move a chord, and round to the start', () => {
  const rng = seeded(9);
  for (let i = 0; i < 100; i++) {
    const p = tonnetzProgression({ start: { root: 0, minor: false }, length: 8, walk: 'smooth', rng });
    assert.equal(p.length, 8);
    assert.deepEqual(p[0], { root: 0, type: 'maj' });
    for (let k = 1; k < 8; k++) assert.equal(distance(tri(p[k - 1]), tri(p[k])), 1, 'one move each');
    assert.equal(distance(tri(p[7]), tri(p[0])), 1, 'the loop closes smoothly');
  }
  const wide = tonnetzProgression({ length: 6, walk: 'wide', sevenths: true, rng });
  assert.ok(wide.every((c) => c.type === 'maj7' || c.type === 'min7'));
  for (let k = 1; k < 6; k++) assert.ok(distance(tri(wide[k - 1]), tri(wide[k])) >= 1);
});

test('Tonnetz cycles', () => {
  const names = (p) => p.map((c) => `${c.root}${c.type === 'min' ? 'm' : ''}`).join(' ');
  const first = () => 0; // starts with the first of the pair
  assert.equal(names(tonnetzProgression({ length: 6, walk: 'hexatonic', rng: first })), '0 0m 8 8m 4 4m'); // C Cm Ab Abm E Em
  assert.equal(names(tonnetzProgression({ length: 8, walk: 'octatonic', rng: first })), '0 0m 3 3m 6 6m 9 9m'); // C Cm Eb Ebm F# F#m A Am
  assert.equal(names(tonnetzProgression({ length: 5, walk: 'fifths', rng: first })), '0 4m 7 11m 2'); // C Em G Bm D
  assert.equal(tonnetzProgression({ length: 1 }).length, 1);
});

test('short or odd Tonnetz walks still come round, with a double move or two on the way (loops are even, the smallest 6)', () => {
  const rng = seeded(4);
  for (const n of [3, 4, 5, 7]) {
    for (let r = 0; r < 30; r++) {
      const p = tonnetzProgression({ length: n, walk: 'smooth', rng });
      assert.equal(p.length, n);
      assert.equal(distance(tri(p[n - 1]), tri(p[0])), 1, `${n} chords come round`);
      const steps = p.slice(1).map((c, k) => distance(tri(p[k]), tri(c)));
      assert.ok(steps.every((d) => d >= 1) && steps.filter((d) => d === 2).length <= (n === 4 ? 2 : 1), 'single moves, and the doubles it needs');
    }
  }
});

import { negativePc, negativeChord, nameChord, negativeFill } from '../src/fill.js';
import { CHORDS } from '../src/core.js';

test('negative harmony: notes mirrored across the tonic–fifth axis', () => {
  // In C: C↔G, D↔F, E↔E♭, A↔B♭, B↔A♭, F♯↔C♯
  assert.deepEqual([0, 2, 4, 9, 11, 6].map((n) => negativePc(n, 0)), [7, 5, 3, 10, 8, 1]);
  assert.equal(negativePc(9, 9), 4); // in A: A ↔ E
  const neg = (root, type) => { const c = negativeChord({ root, type }, 0); return `${c.root}${c.type}`; };
  assert.equal(neg(0, 'maj'), '0min'); // C → Cm
  assert.equal(neg(7, 'maj'), '5min'); // G → Fm
  assert.equal(neg(7, 'dom7'), '5min6'); // G7 → Fm6
  assert.equal(neg(5, 'maj'), '7min'); // F → Gm
  assert.equal(neg(9, 'min'), '3maj'); // Am → E♭
  assert.equal(neg(0, 'maj7'), '8maj7'); // Cmaj7 → A♭maj7
  assert.equal(neg(2, 'dom7'), '10min6'); // D7 → B♭m6
  assert.equal(neg(0, 'sus4'), '0sus2');
  // twice round: the same notes again (sometimes under another name: Bø comes back as Dm6)
  const notes = (c) => CHORDS[c.type].intervals.map((i) => (c.root + i) % 12).sort((a, b) => a - b).join(',');
  for (const [root, type] of [[0, 'maj'], [7, 'dom7'], [2, 'min7'], [11, 'hdim7'], [5, 'maj7'], [9, 'min9'], [4, 'min'], [0, 'sus4']]) {
    assert.equal(notes(negativeChord(negativeChord({ root, type }, 0), 0)), notes({ root, type }), `${root}${type}`);
  }
  assert.deepEqual(nameChord(new Set([2, 5, 9, 0])), { root: 2, type: 'min7' });
  assert.deepEqual(negativeChord({ root: 0, type: 'rest' }, 0), { root: 0, type: 'rest' });
});

test('the negative fill: the last chords mirrored (V7 → iv6: the minor plagal way home)', () => {
  const slots = [[0, 'maj7'], [9, 'min7'], [2, 'min7'], [7, 'dom7']].map(([root, type]) => ({ root, type, beats: 4 }));
  const f = fillRound(slots, 3, { style: 'negative', every: 4, length: 1, chance: 100, tonic: 0 }, (r) => seeded(r + 1));
  assert.deepEqual([...f.filled], [3]);
  assert.equal(f.slots[3].root, 5);
  assert.equal(f.slots[3].type, 'min6');
  assert.equal(negativeFill([{ root: 0, type: 'rest' }], 0), null);
  // Mix can choose it, given a key; without one, only the other two
  const kinds = new Set();
  for (let r = 0; r < 60; r++) {
    const m = fillRound(slots, r * 4 + 3, { style: 'mix', every: 4, length: 1, tonic: 0 }, (x) => seeded(x + 5));
    kinds.add(`${m.slots[3].root}${m.slots[3].type}`);
  }
  assert.ok(kinds.has('5min6'));
});

import { tonnetzSteps, tonnetzDistance as moves } from '../src/fill.js';

test('a Tonnetz path step by step: each chord as far as asked', () => {
  const rng = seeded(21);
  const C = { root: 0, minor: false };
  for (let r = 0; r < 50; r++) {
    const { chords, moves: m } = tonnetzSteps({ start: C, steps: ['jump', 'close', 'back', 'near', 'far', 'home', 'R', 'same'], rng });
    assert.equal(chords.length, 9);
    const tri = chords.map((c) => triadOf(c));
    assert.equal(m[0], 3, 'jump: 3 moves');
    assert.equal(m[1], 1, 'close: 1');
    assert.deepEqual(tri[3], tri[0], 'back: to where the jump left from');
    assert.equal(m[3], 2, 'near: 2');
    assert.ok(m[4] >= 4, 'far: 4 or 5');
    assert.deepEqual(tri[6], C, 'home');
    assert.deepEqual(tri[7], { root: 9, minor: true }, 'R from C: Am');
    assert.deepEqual(tri[8], tri[7], 'same');
  }
  // the grid: every triad within 5 moves; C's farthest is B♭m
  assert.equal(moves(C, { root: 10, minor: true }), 5);
  assert.equal(moves(C, { root: 8, minor: true }), 3); // A♭m, the hexatonic pole
  const seventh = tonnetzSteps({ start: C, steps: ['close'], sevenths: true, rng });
  assert.ok(seventh.chords.every((c) => c.type === 'maj7' || c.type === 'min7'));
});

import { colourType, TONNETZ_COLOURS } from '../src/fill.js';

test('richer chords: 11ths and stacked 4ths and 5ths keep their major or minor quality', () => {
  // read as pitch classes: their lowest note needn't be the root
  assert.deepEqual(triadOf({ root: 0, type: 'q4maj' }), { root: 0, minor: false }); // E A D G over C
  assert.deepEqual(triadOf({ root: 2, type: 'q4min' }), { root: 2, minor: true }); // D G C F A
  assert.deepEqual(triadOf({ root: 0, type: 'q5min' }), { root: 0, minor: true }); // Eb Bb F C G over C
  assert.deepEqual(triadOf({ root: 0, type: 'q5maj' }), { root: 0, minor: false });
  assert.deepEqual(triadOf({ root: 0, type: 'maj9s11' }), { root: 0, minor: false });
  assert.equal(colourType(false, 'fourths'), 'q4maj');
  assert.equal(colourType(true, 'elevenths'), 'min11');
  assert.equal(colourType(true, 'fifths'), 'q5min');
  const rng = seeded(2);
  const kinds = new Set(Array.from({ length: 60 }, () => colourType(false, 'mixed', rng)));
  assert.ok(kinds.size >= 4 && ![...kinds].includes('maj'), 'mixed: the richer ones');
  // a walk in 4ths moves the same way as in triads
  const steps = tonnetzSteps({ start: { root: 0, minor: false }, steps: ['L', 'R', 'P'], colour: 'fourths', rng: () => 0 });
  assert.deepEqual(steps.chords.map((c) => `${c.root}${c.type}`), ['0q4maj', '4q4min', '7q4maj', '7q4min']);
  assert.ok(Object.keys(TONNETZ_COLOURS).includes('fifths'));
  // a fill keeps the flavour
  assert.equal(flavour('q4min', false), 'q4maj');
  assert.equal(flavour('dom11', true), 'min11');
});
