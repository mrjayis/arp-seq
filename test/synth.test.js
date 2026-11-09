import test from 'node:test';
import assert from 'node:assert/strict';
import { fold, foldCurve, foldDrive, MAX_FOLD, gateOpening, comboLevel } from '../src/synth.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('wavefolder is clean inside ±1 and reflects beyond it', () => {
  for (const u of [-1, -0.5, 0, 0.3, 1]) assert.ok(near(fold(u), u), `fold(${u})`);
  assert.ok(near(fold(1.5), 0.5));
  assert.ok(near(fold(2), 0));
  assert.ok(near(fold(3), -1));
  assert.ok(near(fold(-1.5), -0.5));
  for (let u = -8; u <= 8; u += 0.37) assert.ok(Math.abs(fold(u)) <= 1 + 1e-9);
});

test('Timbre 0 leaves a sine untouched; more Timbre folds it into more harmonics', () => {
  const curve = foldCurve(8193);
  const shape = (x) => curve[Math.round(((x + 1) / 2) * (curve.length - 1))];
  const crossings = (timbre) => {
    let n = 0, prev = 0;
    for (let i = 0; i < 2000; i++) {
      const y = shape(Math.sin((2 * Math.PI * i) / 2000) * foldDrive(timbre));
      if (i && Math.sign(y) !== Math.sign(prev) && y !== 0) n++;
      prev = y;
    }
    return n;
  };
  for (let i = 0; i < 100; i++) {
    const x = Math.sin((2 * Math.PI * i) / 100);
    assert.ok(Math.abs(shape(x * foldDrive(0)) - x) < 0.01);
  }
  assert.ok(near(foldDrive(1), 1));
  assert.ok(near(foldDrive(0), 1 / MAX_FOLD));
  assert.ok(crossings(0) < crossings(0.5) && crossings(0.5) < crossings(1),
    `${crossings(0)} ${crossings(0.5)} ${crossings(1)}`);
});

test('Combo: the cutoff opening also sets loudness, never fully silent', () => {
  assert.ok(near(gateOpening(60), 0));
  assert.ok(near(gateOpening(12000), 1));
  assert.ok(near(gateOpening(5), 0));
  assert.ok(comboLevel(0) > 0 && comboLevel(0) < 0.1);
  assert.ok(near(comboLevel(1), 1));
  const levels = [100, 400, 1600, 6400].map((f) => comboLevel(gateOpening(f)));
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] > levels[i - 1]);
});

import { strikeDecay, STRIKE_MIN, STRIKE_MAX } from '../src/synth.js';

test('Combo: opening the gate further makes the strike ring longer', () => {
  assert.ok(near(strikeDecay(0), STRIKE_MIN));
  assert.ok(near(strikeDecay(1), STRIKE_MAX));
  assert.ok(near(strikeDecay(-1), STRIKE_MIN));
  const rings = [100, 400, 1600, 6400].map((f) => strikeDecay(gateOpening(f)));
  for (let i = 1; i < rings.length; i++) assert.ok(rings[i] > rings[i - 1]);
  // Default cutoff (2.4 kHz) rings for roughly two thirds of a second.
  const d = strikeDecay(gateOpening(2400));
  assert.ok(d > 0.5 && d < 0.9, `${d}`);
});

import { fmDeviation, amGains, MAX_FM_INDEX } from '../src/synth.js';

test('FM deviation scales with depth and modulator pitch; AM swings within 0..1', () => {
  assert.equal(fmDeviation(0, 220), 0);
  assert.equal(fmDeviation(1, 220), MAX_FM_INDEX * 220);
  assert.equal(fmDeviation(0.5, 440), fmDeviation(1, 220) * 1);
  assert.equal(fmDeviation(2, 100), MAX_FM_INDEX * 100);
  for (const d of [0, 0.3, 1]) {
    const { base, swing } = amGains(d);
    assert.ok(near(base - swing, 1 - d)); // trough
    assert.ok(near(base + swing, 1)); // peak never above unity
  }
  assert.deepEqual(amGains(0), { base: 1, swing: 0 });
});
