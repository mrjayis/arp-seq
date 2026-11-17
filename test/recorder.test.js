import test from 'node:test';
import assert from 'node:assert/strict';
import { framesBetween, soundSpan, encodeWav, peakOf } from '../src/recorder.js';

const block = (frame, n, f) => ({ frame, ch: [Float32Array.from({ length: n }, (_, i) => f(frame + i)), Float32Array.from({ length: n }, (_, i) => -f(frame + i))] });

test('framesBetween cuts an exact span out of recorded blocks', () => {
  const blocks = [block(1000, 4096, (i) => i / 1e5), block(5096, 4096, (i) => i / 1e5)];
  const [l, r] = framesBetween(blocks, 4000, 6000);
  assert.equal(l.length, 2000);
  assert.ok(Math.abs(l[0] - 4000 / 1e5) < 1e-6 && Math.abs(l[1999] - 5999 / 1e5) < 1e-6);
  assert.ok(Math.abs(r[1500] + 5500 / 1e5) < 1e-6);
  // before the first block: silence
  assert.equal(framesBetween(blocks, 0, 10)[0][5], 0);
});

test('soundSpan takes the quiet off both ends, keeping the attack', () => {
  const sr = 48000;
  const x = new Float32Array(sr);
  for (let i = 10000; i < 20000; i++) x[i] = Math.sin(i / 5) * 0.5;
  const [s, e] = soundSpan([x], sr, { padMs: 5 });
  assert.ok(s <= 10000 && s >= 10000 - 240, `start ${s}`);
  assert.ok(e >= 20000 - 2 && e <= 20000 + 960 + 2, `end ${e}`);
  assert.deepEqual(soundSpan([new Float32Array(100)], sr), [0, 0]);
});

test('encodeWav writes a 16-bit PCM WAV', () => {
  const buf = encodeWav([Float32Array.from([0, 0.5, -1, 1]), Float32Array.from([0, -0.5, 1, -1])], 44100);
  const v = new DataView(buf);
  assert.equal(String.fromCharCode(...new Uint8Array(buf, 0, 4)), 'RIFF');
  assert.equal(v.getUint16(22, true), 2); // channels
  assert.equal(v.getUint32(24, true), 44100);
  assert.equal(v.getUint32(40, true), 16); // 4 frames × 2 channels × 2 bytes
  assert.equal(v.getInt16(44 + 4, true), 16383); // the second frame's left: 0.5 (interleaved L R)
  assert.equal(v.getInt16(44 + 8, true), -32768);
  assert.ok(Math.abs(peakOf([Float32Array.from([0.2, -0.7])]) - 0.7) < 1e-6);
});
