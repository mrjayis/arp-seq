import test from 'node:test';
import assert from 'node:assert/strict';
import { InternalClock, ExternalClock, pulseToStep } from '../src/clock.js';
import { RATES } from '../src/core.js';

test('internal clock schedules 24 PPQN pulses inside the look-ahead window', () => {
  let now = 0;
  const pulses = [];
  const c = new InternalClock({ getTime: () => now, onPulse: (t, p) => pulses.push([t, p]), bpm: 120, lookahead: 0.1, startDelay: 0 });
  c.start();
  for (; now < 1; now += 0.025) c.pump();
  // 120 BPM = 48 pulses/s; scheduled up to now + lookahead.
  assert.ok(pulses.length >= 48 && pulses.length <= 54, `got ${pulses.length}`);
  assert.equal(pulses[24][0].toFixed(6), (0.5).toFixed(6)); // pulse 24 = beat 2 at 0.5s
  pulses.forEach(([, p], i) => assert.equal(p, i));
});

test('pulseToStep fires on rate boundaries with swing on off-beats', () => {
  const pd = 60 / (120 * 24);
  const steps = [];
  for (let p = 0; p < 24; p++) {
    const s = pulseToStep(p, p * pd, pd, RATES['1/16'], 0.5);
    if (s) steps.push(s);
  }
  assert.equal(steps.length, 4);
  assert.equal(steps[0].delay, 0);
  assert.ok(Math.abs(steps[1].delay - 0.125 * 0.25) < 1e-9); // 25% of a 1/16 at 120 BPM
  assert.ok(Math.abs(steps[0].duration - 0.125) < 1e-9);
});

test('external clock follows Start/Clock/Stop and estimates tempo', () => {
  const pulses = [];
  let started = 0, stopped = 0;
  const c = new ExternalClock({
    getTime: () => 0, latency: 0,
    onPulse: (t, p) => pulses.push(p),
    onStart: () => started++, onStop: () => stopped++,
  });
  const pd = 60 / (100 * 24);
  c.handle(0xf8, 0); // tick before Start is ignored for playback
  c.handle(0xfa);
  for (let i = 1; i <= 48; i++) c.handle(0xf8, i * pd);
  c.handle(0xfc);
  c.handle(0xf8, 49 * pd);
  assert.equal(started, 1);
  assert.equal(stopped, 1);
  assert.equal(pulses.length, 48);
  assert.ok(Math.abs(c.bpm - 100) < 0.01);
});

test('dotted 8th steps are 3/4 of a beat and repeat the bar every 3 beats', () => {
  const pd = 60 / (120 * 24);
  const steps = [];
  for (let p = 0; p < 96 * 3; p++) {
    const s = pulseToStep(p, p * pd, pd, RATES['1/8D'], 0);
    if (s) steps.push(s);
  }
  assert.ok(Math.abs(steps[0].duration - 0.375) < 1e-9); // 3/4 of a 0.5 s beat
  assert.deepEqual(steps.slice(0, 6).map((s) => Math.round(s.time / pd)), [0, 18, 36, 54, 72, 90]);
  assert.equal(steps.length, 16); // 16 dotted 8ths = 3 bars of 4/4
});

test('dotted quarter and dotted 16th rates land on the pulse grid', () => {
  assert.equal(RATES['1/4D'], 36);
  assert.equal(RATES['1/16D'], 9);
  const pd = 60 / (120 * 24);
  const steps = [];
  for (let p = 0; p < 96; p++) {
    const s = pulseToStep(p, p * pd, pd, RATES['1/16D'], 0);
    if (s) steps.push(s.stepNumber);
  }
  assert.deepEqual(steps, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); // 96 / 9 → 11 steps in a bar
  assert.ok(Math.abs(pulseToStep(36, 36 * pd, pd, RATES['1/4D'], 0).duration - 0.75) < 1e-9); // 1.5 beats at 120 BPM
});
