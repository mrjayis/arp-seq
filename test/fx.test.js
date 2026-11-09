import test from 'node:test';
import assert from 'node:assert/strict';
import { delaySeconds, fillImpulse, DELAY_TIMES } from '../src/fx.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('delay times follow the tempo', () => {
  assert.ok(near(delaySeconds('1/4', 120), 0.5));
  assert.ok(near(delaySeconds('1/8', 120), 0.25));
  assert.ok(near(delaySeconds('1/8D', 120), 0.375));
  assert.ok(near(delaySeconds('1/8T', 120), 1 / 6));
  assert.ok(near(delaySeconds('1/4D', 100), 0.9));
  assert.ok(near(delaySeconds('1/2', 60), 2));
  assert.ok(delaySeconds('1/2', 20) <= 4); // capped at the delay line's length
  for (const d of DELAY_TIMES) assert.ok(delaySeconds(d, 120) > 0, d);
});

test('reverb impulse decays to about −60 dB at its size and gets darker', () => {
  const rate = 8000;
  const seconds = 1.5;
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const L = new Float32Array(Math.floor(rate * 2));
  const R = new Float32Array(L.length);
  fillImpulse([L, R], rate, seconds, 0.6, rng);
  const rms = (x, a, b) => Math.sqrt(x.subarray(a * rate, b * rate).reduce((s, v) => s + v * v, 0) / ((b - a) * rate));
  const early = rms(L, 0, 0.1);
  const late = rms(L, 1.4, 1.5);
  const db = 20 * Math.log10(late / early);
  assert.ok(db < -45 && db > -75, `${db.toFixed(1)} dB`);
  // Left and right are different (decorrelated) for width.
  assert.ok(L.slice(0, 100).some((v, i) => Math.abs(v - R[i]) > 1e-3));
  // Brightness (sample-to-sample change relative to level) drops along the tail.
  const bright = (a, b) => {
    const seg = L.subarray(a * rate, b * rate);
    let d = 0, e = 0;
    for (let i = 1; i < seg.length; i++) { d += (seg[i] - seg[i - 1]) ** 2; e += seg[i] ** 2; }
    return d / e;
  };
  assert.ok(bright(1.0, 1.4) < bright(0, 0.3));
});
