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
