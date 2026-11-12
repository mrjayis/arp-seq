import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fitRate, equalPoints, sliceOffset, sliceAt, detectTransients, rowTriggers, migrateRow,
  inOrder, chop, randomize, resizePattern, peaks, emptyRow,
} from '../src/breaks.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const seeded = (seed = 3) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('fitRate stretches the break to the tempo and adds pitch', () => {
  // A 2-bar break recorded at 120 BPM is 4 s long; at 160 BPM two bars take 3 s.
  assert.ok(near(fitRate(4, 2, 120), 1));
  assert.ok(near(fitRate(4, 2, 160), 4 / 3));
  assert.ok(near(fitRate(4, 2, 120, 12), 2));
  assert.ok(near(fitRate(4, 2, 160, 0, false), 1)); // not fitted: original speed
});

test('slice offsets, forwards and reversed, for equal or uneven slices', () => {
  const eq = equalPoints(16, 4);
  assert.ok(near(sliceOffset(4, eq, 4), 1));
  assert.ok(near(sliceOffset(0, eq, 4, true), 3.75)); // slice 0 is the last bit of the reversed buffer
  assert.ok(near(sliceOffset(15, eq, 4, true), 0));
  const hits = [0, 0.3, 0.45, 1.2];
  assert.ok(near(sliceOffset(1, hits, 2), 0.3));
  assert.ok(near(sliceOffset(1, hits, 2, true), 2 - 0.45));
  assert.ok(near(sliceOffset(3, hits, 2, true), 0));
  assert.equal(sliceAt(0.5, hits), 2);
  assert.equal(sliceAt(1.9, hits), 3);
});

test('transient detection finds hits at their attacks', () => {
  const rate = 22050;
  const hitTimes = [0.05, 0.31, 0.47, 0.8, 1.13, 1.45];
  const data = new Float32Array(Math.round(rate * 1.8));
  const rng = seeded(11);
  hitTimes.forEach((t, k) => {
    const loud = k % 2 ? 0.5 : 1; // alternate strong and softer hits
    for (let i = 0; i < rate * 0.2; i++) {
      const j = Math.round(t * rate) + i;
      if (j < data.length) data[j] += loud * (rng() * 2 - 1) * Math.exp(-i / (rate * 0.03));
    }
  });
  const found = detectTransients(data, rate, { sensitivity: 0.5 });
  assert.equal(found[0], 0);
  for (const t of hitTimes) {
    const d = Math.min(...found.map((f) => Math.abs(f - t)));
    assert.ok(d < 0.012, `hit at ${t} missed (nearest ${d.toFixed(3)} s)`);
    // Never after the attack: the slice must not clip it.
    const f = found.find((x) => Math.abs(x - t) < 0.012);
    assert.ok(f <= t + 0.001, `slice at ${f} starts after the hit at ${t}`);
  }
  assert.ok(found.length <= hitTimes.length + 1, `too many slices: ${found.length}`);
  // Low sensitivity keeps only the strong hits; it never finds more than high sensitivity.
  const low = detectTransients(data, rate, { sensitivity: 0 });
  const high = detectTransients(data, rate, { sensitivity: 1 });
  assert.ok(low.length <= found.length && found.length <= high.length);
  assert.ok(detectTransients(data, rate, { sensitivity: 1, max: 4 }).length <= 4);
});

test('Chance skips rows; a skipped row lets the previous slice play on', () => {
  const row = { ...emptyRow(), slice: 2, chance: 50 };
  let plays = 0;
  const rng = seeded(5);
  for (let i = 0; i < 400; i++) if (rowTriggers(row, 0.1, rng).length) plays++;
  assert.ok(plays > 150 && plays < 250, `played ${plays}/400`);
  assert.deepEqual(rowTriggers({ ...row, chance: 0 }, 0.1), []);
  assert.equal(rowTriggers({ ...row, chance: 100 }, 0.1).length, 1);
});

test('Roll divides the step, shaped by its type', () => {
  const base = { ...emptyRow(), slice: 3, vol: 80, pitch: 2, roll: 4 };
  const at = (r) => r.map((t) => +t.at.toFixed(3));
  const R = rowTriggers({ ...base, rollType: 'R' }, 0.2);
  assert.deepEqual(at(R), [0, 0.05, 0.1, 0.15]);
  assert.ok(R.every((t) => near(t.gain, 0.8) && t.pitch === 2 && t.slice === 3));
  assert.deepEqual(rowTriggers({ ...base, rollType: 'Rv' }, 0.2).map((t) => +t.gain.toFixed(2)), [0.8, 0.6, 0.4, 0.2]);
  assert.deepEqual(rowTriggers({ ...base, rollType: 'RV' }, 0.2).map((t) => +t.gain.toFixed(2)), [0.2, 0.4, 0.6, 0.8]);
  assert.deepEqual(rowTriggers({ ...base, rollType: 'Rn' }, 0.2).map((t) => t.pitch), [2, 1, 0, -1]);
  assert.deepEqual(rowTriggers({ ...base, rollType: 'RN' }, 0.2).map((t) => t.pitch), [2, 3, 4, 5]);
  const RR = rowTriggers({ ...base, rollType: 'RR' }, 0.2, seeded(9)).map((t) => t.pitch);
  assert.equal(RR[0], 2);
  assert.ok(RR.every((p) => p >= -10 && p <= 14) && new Set(RR).size > 1);
  assert.equal(rowTriggers({ ...base, roll: 16 }, 0.2).length, 16);
  assert.equal(rowTriggers({ ...base, roll: 0 }, 0.2).length, 1);
  assert.deepEqual(rowTriggers({ ...emptyRow(), fx: 'cut' }, 0.1), [{ at: 0, cut: true }]);
  assert.deepEqual(rowTriggers(emptyRow(), 0.1), []);
  assert.equal(rowTriggers({ ...base, fx: 'rev' }, 0.2)[0].reverse, true);
});

test('old ratchet effects become R rolls', () => {
  assert.deepEqual(
    (({ roll, rollType, fx, chance }) => ({ roll, rollType, fx, chance }))(migrateRow({ slice: 1, vol: 90, pitch: 0, fx: 'r3' })),
    { roll: 3, rollType: 'R', fx: '', chance: 100 },
  );
  assert.equal(migrateRow({ slice: 1, fx: 'rev' }).fx, 'rev');
});

test('In order puts each slice where it falls in the break', () => {
  // 16 equal slices of a 2-bar (32-step) break over 32 steps: one every 2 steps.
  const eq = inOrder(32, equalPoints(16, 4), 4, 32);
  assert.deepEqual(eq.map((r) => r.slice).slice(0, 6), [0, null, 1, null, 2, null]);
  // Uneven hits land on their nearest step.
  const hits = inOrder(16, [0, 0.74, 1.5, 3.1], 4, 16); // 1-bar break of 4 s → 0.25 s per step
  assert.deepEqual(hits.map((r, i) => [i, r.slice]).filter(([, s]) => s !== null), [[0, 0], [3, 1], [6, 2], [12, 3]]);
  // A 1-bar break repeats to fill a 2-bar pattern.
  const twice = inOrder(32, equalPoints(4, 4), 4, 16);
  assert.deepEqual(twice.map((r, i) => [i, r.slice]).filter(([, s]) => s !== null).map(([i]) => i), [0, 4, 8, 12, 16, 20, 24, 28]);
});

test('Chop and Randomize stay within the slices', () => {
  const base = inOrder(32, equalPoints(16, 4), 4, 32);
  const c = chop(base);
  assert.equal(c.length, 32);
  assert.ok(c.some((r) => r.fx === 'rev') && c.some((r) => r.roll > 1));
  assert.ok(c.every((r) => r.slice === null || (r.slice >= 0 && r.slice < 16)));
  const r = randomize(32, 10, seeded(4));
  assert.equal(r.length, 32);
  assert.equal(r[0].slice, 0);
  assert.ok(r.every((x) => x.slice === null || (x.slice >= 0 && x.slice < 10)));
  assert.equal(resizePattern(base, 16).length, 16);
  assert.equal(resizePattern(base.slice(0, 4), 16)[10].slice, null);
});

test('waveform peaks', () => {
  const data = Float32Array.from({ length: 100 }, (_, i) => (i % 2 ? 0.5 : -0.25));
  const p = peaks(data, 10);
  assert.equal(p.length, 10);
  assert.deepEqual(p[0], [-0.25, 0.5]);
});

import { trimSamples, fadeEdges } from '../src/breaks.js';

test('trimSamples keeps the chosen part, at least 50 ms, inside the file', () => {
  assert.deepEqual(trimSamples(44100, 44100, 0, 1), [0, 44100]);
  assert.deepEqual(trimSamples(44100, 44100, 0.25, 0.75), [11025, 33075]);
  assert.deepEqual(trimSamples(44100, 44100, 0.75, 0.25), [11025, 33075]); // swapped
  const [a, b] = trimSamples(44100, 44100, 0.999, 1);
  assert.equal(b - a, 2205); // 50 ms minimum
  assert.equal(b, 44100);
  assert.deepEqual(trimSamples(44100, 44100, -1, 2), [0, 44100]);
});

test('fadeEdges ramps both ends to silence', () => {
  const d = fadeEdges(new Float32Array(10).fill(1), 4);
  assert.equal(d[0], 0);
  assert.equal(d[9], 0);
  assert.ok(d[2] > 0 && d[2] < 1);
  assert.equal(d[5], 1);
});

import { rollSpan, isFilled } from '../src/breaks.js';

test('rolls hold until the next filled row and ramp over the whole run', () => {
  const e = { slice: null, vol: 100, pitch: 0, chance: 100, roll: 0, rollType: 'R', fx: '' };
  const pat = [{ ...e, slice: 0, roll: 2, rollType: 'Rv' }, e, e, { ...e, slice: 3 }, e, { ...e, fx: 'cut' }];
  assert.equal(rollSpan(pat, 0), 3);
  assert.equal(rollSpan(pat, 3), 2);
  assert.equal(rollSpan(pat, 5), 1); // wraps to row 0, which is filled
  assert.equal(rollSpan([pat[0], e, e], 0), 3); // nothing else filled: the whole pattern
  assert.ok(isFilled(pat[5]) && !isFilled(e));
  const row = pat[0];
  // 3 steps × 2 = 6 retriggers, volume falling across all of them.
  const gains = [0, 1, 2].flatMap((part) => rowTriggers(row, 0.1, Math.random, { span: 3, part }).map((t) => +t.gain.toFixed(2)));
  assert.deepEqual(gains, [1, 0.83, 0.67, 0.5, 0.33, 0.17]);
  const at = rowTriggers(row, 0.1, Math.random, { span: 3, part: 2 }).map((t) => +t.at.toFixed(3));
  assert.deepEqual(at, [0, 0.05]); // times are within this step
  // Rn keeps stepping down across the run, held within ±24.
  const rn = [0, 1].flatMap((part) => rowTriggers({ ...row, rollType: 'Rn' }, 0.1, Math.random, { span: 2, part }).map((t) => t.pitch));
  assert.deepEqual(rn, [0, -1, -2, -3]);
  // Chance is only decided on the row itself.
  assert.equal(rowTriggers({ ...row, chance: 0 }, 0.1, () => 0.99, { span: 3, part: 1 }).length, 2);
  // A plain hit (no roll) doesn't carry on.
  assert.deepEqual(rowTriggers({ ...row, roll: 0 }, 0.1, Math.random, { span: 3, part: 1 }), []);
});
