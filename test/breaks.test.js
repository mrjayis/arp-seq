import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fitRate, equalPoints, sliceOffset, sliceAt, detectTransients, rowTriggers, migrateRow,
  inOrder, chop, randomize, resizePattern, peaks, emptyRow,
  keepTracks, trackColumn, EXTRA_TRACKS, TRACK_SAMPLES,
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
  const base = { ...emptyRow(), slice: 3, vol: 80, pitch: 2, roll: 8 }; // 64ths: 4 a step
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
  assert.equal(rowTriggers({ ...base, roll: 16 }, 0.2).length, 8);
  assert.equal(rowTriggers({ ...base, roll: 0 }, 0.2).length, 1);
  assert.deepEqual(rowTriggers({ ...emptyRow(), fx: 'cut' }, 0.1), [{ at: 0, cut: true }]);
  assert.deepEqual(rowTriggers(emptyRow(), 0.1), []);
  assert.equal(rowTriggers({ ...base, fx: 'rev' }, 0.2)[0].reverse, true);
});

test('old ratchet effects become R rolls', () => {
  assert.deepEqual(
    (({ roll, rollType, fx, chance }) => ({ roll, rollType, fx, chance }))(migrateRow({ slice: 1, vol: 90, pitch: 0, fx: 'r3' })),
    { roll: 6, rollType: 'R', fx: '', chance: 100 }, // ×3 a 16th = R6 in 8ths
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

test('an older R1 (16th notes, saved before R counted 8ths): one hit a step, carried through the empty rows', () => {
  const row = { slice: 2, vol: 100, pitch: 0, chance: 100, roll: 1, rollType: 'Rv', fx: '' };
  const parts = [0, 1, 2, 3].map((part) => rowTriggers(row, 0.125, Math.random, { span: 4, part }));
  assert.ok(parts.every((tr) => tr.length === 1 && tr[0].at === 0 && tr[0].slice === 2));
  assert.deepEqual(parts.map((tr) => tr[0].gain), [1, 0.75, 0.5, 0.25]);
});

import { pickSlice, usableSlices } from '../src/breaks.js';
import { evolveBreakRow } from '../src/evolve.js';

test('switched-off slices are never picked by Randomize or Evolve', () => {
  assert.deepEqual(usableSlices(5, [1, 3]), [0, 2, 4]);
  assert.equal(pickSlice([], Math.random), null);
  for (let i = 0; i < 300; i++) assert.ok([0, 2, 4].includes(pickSlice([0, 2, 4])));
  const pat = randomize(64, [2, 5]);
  assert.ok(pat.every((r) => r.slice === null || r.slice === 2 || r.slice === 5));
  assert.equal(pat[0].slice, 2);
  const row = { slice: 2, vol: 100, pitch: 0, chance: 100, roll: 0, rollType: 'R', fx: '' };
  for (let i = 0; i < 300; i++) {
    const r = evolveBreakRow(row, 1, Math.random, [2, 5]);
    assert.ok([2, 5].includes(r.slice));
  }
});

import { nearestStep, mpcOrder } from '../src/breaks.js';

test('a live pad hit goes to the nearest step, early or late', () => {
  const steps = [{ time: 1.0, idx: 4 }, { time: 1.125, idx: 5 }, { time: 1.25, idx: 6 }];
  assert.deepEqual(nearestStep(1.01, steps, 0.125), { idx: 4, time: 1.0 }); // a little late
  assert.deepEqual(nearestStep(1.11, steps, 0.125), { idx: 5, time: 1.125 }); // a little early: the next step
  assert.equal(nearestStep(2, steps, 0.125), null); // nowhere near
  assert.deepEqual(mpcOrder().slice(0, 4), [12, 13, 14, 15]); // the top row on screen is pads 13–16
  assert.deepEqual(mpcOrder().slice(12), [0, 1, 2, 3]); // the bottom row is pads 1–4
});

import { rowThisTime } from '../src/breaks.js';

test('rolls and effects have their own chance', () => {
  const row = { slice: 2, vol: 100, pitch: 0, chance: 100, roll: 3, rollType: 'R', fx: 'rev', rollChance: 25, fxChance: 60 };
  let rolled = 0;
  let reversed = 0;
  let seed = 1;
  const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  for (let k = 0; k < 4000; k++) {
    const r = rowThisTime(row, rng);
    assert.equal(r.slice, 2); // the hit itself always plays (that's the row's own Chance)
    if (r.roll > 0) rolled++;
    if (r.fx === 'rev') reversed++;
  }
  assert.ok(Math.abs(rolled / 4000 - 0.25) < 0.03, `rolled ${rolled}`);
  assert.ok(Math.abs(reversed / 4000 - 0.6) < 0.03, `reversed ${reversed}`);
  // at 100% (and on older rows without them) nothing changes
  const plain = { slice: 1, vol: 100, pitch: 0, chance: 100, roll: 2, rollType: 'R', fx: 'rev' };
  assert.equal(rowThisTime(plain, () => 0.99), plain);
  // a Cut that doesn't happen leaves the row as if empty
  const cut = { slice: null, fx: 'cut', fxChance: 0 };
  assert.equal(rowThisTime(cut, Math.random).fx, '');
});

test('rows carry Tracks 2–4 cells; the old Smp column moves to Track 2', () => {
  const r = migrateRow({ slice: 3, vol: 80, smp: 2 });
  assert.equal(r.tracks.length, EXTRA_TRACKS);
  assert.equal(r.tracks[0].slice, 1); // S2
  assert.equal(r.tracks[0].vol, 80);
  assert.equal(r.smp, undefined);
  assert.equal(r.tracks[1].slice, null);
  assert.equal(r.tracks[0].tracks, undefined);
  // a sample number out of range is held to S1–S8
  assert.equal(migrateRow({ tracks: [{ slice: 40 }] }).tracks[0].slice, TRACK_SAMPLES - 1);
});

test('the FX column throws into an effect, with its chance', () => {
  const [hit] = rowTriggers({ slice: 0, fx: 'dly' }, 0.1);
  assert.equal(hit.send, 'delay');
  assert.equal(hit.reverse, false);
  assert.equal(rowTriggers({ slice: 0, fx: 'rev' }, 0.1)[0].send, null);
  assert.equal(rowTriggers({ slice: 0, fx: 'hrm', roll: 3 }, 0.3).every((t) => t.send === 'harm'), true);
  assert.equal(rowThisTime({ slice: 0, fx: 'rvb', fxChance: 0 }).fx, '');
  assert.equal(migrateRow({ fx: 'rvb' }).fx, 'rvb');
});

test('generators keep the other tracks; a track column reads them', () => {
  const old = resizePattern([{ slice: 1, tracks: [{ slice: 4 }] }], 4);
  const fresh = keepTracks(resizePattern([], 4), old);
  assert.equal(fresh[0].slice, null);
  assert.equal(trackColumn(fresh, 2)[0].slice, 4);
  assert.equal(trackColumn(fresh, 1), fresh);
  assert.equal(rollSpan(trackColumn(fresh, 2), 0), 4);
});

test('R is hits per 8th note: R1 8ths, R2 16ths, R4 32nds; older rows are converted', () => {
  const row = { ...emptyRow(), slice: 0, roll: 1 };
  const hits = (r, span) => Array.from({ length: span }, (_, part) => rowTriggers(r, 0.1, Math.random, { span, part }).map((t) => +(part * 0.1 + t.at).toFixed(3))).flat();
  assert.deepEqual(hits(row, 4), [0, 0.2]); // 8ths: every other step
  assert.deepEqual(hits({ ...row, roll: 2 }, 4), [0, 0.1, 0.2, 0.3]); // 16ths
  assert.deepEqual(hits({ ...row, roll: 4 }, 2), [0, 0.05, 0.1, 0.15]); // 32nds
  assert.deepEqual(hits({ ...row, roll: 3 }, 2), [0, 0.067, 0.133]); // 16th triplets
  assert.equal(rowTriggers(row, 0.1).length, 1); // an 8th roll held for one step: just the hit
  // Ramps run over the whole run's hits.
  assert.deepEqual(Array.from({ length: 4 }, (_, part) => rowTriggers({ ...row, rollType: 'Rv' }, 0.1, Math.random, { span: 4, part }).map((t) => t.gain)).flat(), [1, 0.5]);
  // A row saved when R counted per 16th step: doubled, so it sounds the same.
  assert.equal(migrateRow({ slice: 0, roll: 2 }).roll, 4);
  assert.equal(migrateRow(migrateRow({ slice: 0, roll: 2 })).roll, 4); // once only
  assert.equal(migrateRow({ slice: 0, roll: 12 }).roll, 16); // held to the maximum
});
