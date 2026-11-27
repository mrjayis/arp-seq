import test from 'node:test';
import assert from 'node:assert/strict';

// The worklet, run outside an AudioWorklet: its processor class caught as it registers.
let Proc = null;
globalThis.AudioWorkletProcessor = class {};
globalThis.sampleRate = 48000;
globalThis.registerProcessor = (name, cls) => { if (name === 'prodigy-oscillators') Proc = cls; };
await import('../src/prodigy-worklet.js');
const { prodigyCutoffs, prodigyRatio } = await import('../src/prodigy.js');

/** `n` samples of the oscillators with these settings. */
function render(n, { freq = 480, ratio = 1, mix = 0.5, wave1 = 1, wave2 = 1, sync = 0 } = {}) {
  const p = new Proc();
  const out = new Float32Array(n);
  const block = 128;
  const params = { freq: [freq], ratio: [ratio], mix: [mix], wave1: [wave1], wave2: [wave2], sync: [sync] };
  for (let i = 0; i < n; i += block) {
    const chunk = new Float32Array(Math.min(block, n - i));
    p.process([], [[chunk]], params);
    out.set(chunk, i);
  }
  return out;
}
const diff = (a, from, period, count) => {
  let worst = 0;
  for (let i = from; i < from + count; i++) worst = Math.max(worst, Math.abs(a[i] - a[i + period]));
  return worst;
};

test('hard sync: Osc 2 restarts with Osc 1, so the sound repeats at Osc 1\'s period whatever its interval', () => {
  // 480 Hz at 48 kHz: exactly 100 samples a cycle.
  const synced = render(2000, { ratio: 2.37, mix: 1, sync: 1 }); // Osc 2 alone, synced
  assert.ok(diff(synced, 500, 100, 800) < 1e-3, 'synced: periodic at 100 samples');
  const free = render(2000, { ratio: 2.37, mix: 1, sync: 0 });
  assert.ok(diff(free, 500, 100, 800) > 0.1, 'free-running: not');
  // and the sync tone isn't simply Osc 1: a different shape over the cycle
  const plain = render(2000, { ratio: 1, mix: 1, sync: 1 });
  const apart = Math.max(...synced.slice(500, 600).map((x, i) => Math.abs(x - plain[500 + i])));
  assert.ok(apart > 0.2, `the sync tone differs from plain Osc 1 (${apart})`);
});

test('the waves and the mix', () => {
  const peak = (a) => Math.max(...a.slice(200).map(Math.abs));
  for (const wave1 of [0, 1, 2]) {
    const a = render(1200, { wave1, mix: 0, freq: 100 });
    assert.ok(peak(a) > 0.5 && peak(a) <= 0.61, `wave ${wave1}: ${peak(a)}`);
  }
  // square: mostly at ±0.6
  const sq = render(2400, { wave1: 2, mix: 0, freq: 100 }).slice(200);
  assert.ok(sq.filter((x) => Math.abs(Math.abs(x) - 0.6) < 0.01).length > sq.length * 0.95);
  // a unison mix of two identical saws is the saw
  const one = render(1000, { mix: 0, freq: 100 });
  const both = render(1000, { mix: 0.5, ratio: 1, freq: 100 });
  assert.ok(Math.max(...one.map((x, i) => Math.abs(x - both[i]))) < 1e-4);
});

test('the filter contour and the interval', () => {
  const c = prodigyCutoffs(130.81, { cutoff: 400, contour: 100, fsustain: 50 });
  assert.ok(Math.abs(c.base - 400) < 1e-6);
  assert.ok(Math.abs(c.peak - Math.min(18000, 400 * 2 ** 7)) < 1e-6);
  assert.ok(Math.abs(c.sustain - 400 * 2 ** 3.5) < 1e-6);
  assert.ok(prodigyCutoffs(261.63, { cutoff: 400, contour: 0, fsustain: 0 }).base > 560); // tracks the keyboard by half
  assert.ok(Math.abs(prodigyRatio(12, 0) - 2) < 1e-9);
  assert.ok(Math.abs(prodigyRatio(7, 0) - 1.4983) < 1e-3);
});
