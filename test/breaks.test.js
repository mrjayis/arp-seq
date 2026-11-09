import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fitRate, sliceStart, rowTriggers, inOrder, chop, randomize, resizePattern, peaks, emptyRow,
} from '../src/breaks.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('fitRate stretches the break to the tempo and adds pitch', () => {
  // A 2-bar break recorded at 120 BPM is 4 s long; at 160 BPM two bars take 3 s.
  assert.ok(near(fitRate(4, 2, 120), 1));
  assert.ok(near(fitRate(4, 2, 160), 4 / 3));
  assert.ok(near(fitRate(4, 2, 120, 12), 2));
  assert.ok(near(fitRate(4, 2, 160, 0, false), 1)); // not fitted: original speed
});

test('slice starts, forwards and reversed', () => {
  assert.ok(near(sliceStart(0, 16, 4), 0));
  assert.ok(near(sliceStart(4, 16, 4), 1));
  assert.ok(near(sliceStart(0, 16, 4, true), 3.75)); // slice 0 is the last bit of the reversed buffer
  assert.ok(near(sliceStart(15, 16, 4, true), 0));
});

test('tracker rows: empty continues, ratchets repeat, cut stops', () => {
  assert.deepEqual(rowTriggers(emptyRow(), 0.1), []);
  assert.deepEqual(rowTriggers({ ...emptyRow(), fx: 'cut' }, 0.1), [{ at: 0, cut: true }]);
  const one = rowTriggers({ slice: 3, vol: 50, pitch: -2, fx: 'rev' }, 0.1);
  assert.deepEqual(one, [{ at: 0, slice: 3, reverse: true, pitch: -2, gain: 0.5 }]);
  const r3 = rowTriggers({ ...emptyRow(), slice: 5, fx: 'r3' }, 0.12);
  assert.deepEqual(r3.map((t) => +t.at.toFixed(3)), [0, 0.04, 0.08]);
  assert.ok(r3.every((t) => t.slice === 5 && !t.reverse));
});

test('pattern generators', () => {
  const ordered = inOrder(32, 16);
  assert.equal(ordered.length, 32);
  assert.deepEqual(ordered.map((r) => r.slice).slice(0, 6), [0, null, 1, null, 2, null]);
  assert.deepEqual(inOrder(16, 32).map((r) => r.slice).slice(0, 4), [0, 1, 2, 3]);
  const c = chop(32, 16);
  assert.equal(c.length, 32);
  assert.ok(c.some((r) => r.fx === 'rev') && c.some((r) => r.fx.startsWith('r')));
  assert.ok(c.every((r) => r.slice === null || (r.slice >= 0 && r.slice < 16)));
  let seed = 3;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const r = randomize(32, 16, rng);
  assert.equal(r.length, 32);
  assert.equal(r[0].slice, 0);
  assert.ok(r.every((x) => x.slice === null || (x.slice >= 0 && x.slice < 16)));
  assert.equal(resizePattern(ordered, 16).length, 16);
  assert.equal(resizePattern(ordered.slice(0, 4), 16)[10].slice, null);
});

test('waveform peaks', () => {
  const data = Float32Array.from({ length: 100 }, (_, i) => (i % 2 ? 0.5 : -0.25));
  const p = peaks(data, 10);
  assert.equal(p.length, 10);
  assert.deepEqual(p[0], [-0.25, 0.5]);
});
