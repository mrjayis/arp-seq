import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWav, parseAiff, parseCaf, looksLikeAudio } from '../src/audiofile.js';

// Each fixture is the same 50 ms, 441 Hz sine (ffmpeg's, at 1/8 of full scale), 22.05 kHz,
// written in a different format.
const load = (name) => { const b = readFileSync(new URL(`./fixtures-audio/${name}`, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const reference = parseWav(load('s24.wav'));

function close(parsed, tolerance, label) {
  assert.ok(parsed, `${label}: read`);
  assert.equal(parsed.sampleRate, 22050, `${label}: rate`);
  const a = parsed.channels[0];
  const b = reference.channels[0];
  assert.ok(Math.abs(a.length - b.length) <= 1, `${label}: length ${a.length} vs ${b.length}`);
  let worst = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  assert.ok(worst <= tolerance, `${label}: off by ${worst}`);
}

test('the reference is a quiet sine', () => {
  const peak = Math.max(...reference.channels[0].map(Math.abs));
  assert.ok(peak > 0.08 && peak < 0.1, `peak ${peak}`); // 1/8, −3 dB for stereo
  assert.equal(reference.channels.length, 2);
});

test('WAV: 8-bit, 24-bit, float, RF64, µ-law, A-law, extensible', () => {
  close(parseWav(load('u8.wav')), 0.01, 'u8');
  close(parseWav(load('f32.wav')), 1e-6, 'f32');
  close(parseWav(load('rf64.wav')), 1e-6, 'rf64');
  close(parseWav(load('mulaw.wav')), 0.01, 'mulaw');
  close(parseWav(load('alaw.wav')), 0.01, 'alaw');
  close(parseWav(load('ext.wav')), 1e-4, 'bext');
  const six = parseWav(load('ext6.wav'));
  assert.equal(six.channels.length, 6);
  // (mono upmixed to 5.1: the sine is in the centre channel, at full 1/8)
  const centre = six.channels[2];
  assert.ok(Math.abs(Math.max(...centre.map(Math.abs)) - 0.125) < 0.001);
  assert.ok(centre.every((x, i) => Math.abs(x / Math.SQRT2 - reference.channels[0][i]) < 1e-3));
});

test('AIFF and AIFF-C: 16- and 24-bit big-endian, little-endian sowt, float', () => {
  close(parseAiff(load('s16.aiff')), 1e-4, 's16');
  close(parseAiff(load('s24.aiff')), 1e-6, 's24');
  close(parseAiff(load('sowt.aifc')), 1e-4, 'sowt');
  close(parseAiff(load('fl32.aifc')), 1e-6, 'fl32');
});

test('CAF: 16-bit little-endian, 24-bit big-endian, float', () => {
  close(parseCaf(load('s16le.caf')), 1e-4, 'caf s16le');
  close(parseCaf(load('s24be.caf')), 1e-6, 'caf s24be');
  close(parseCaf(load('f32.caf')), 1e-6, 'caf f32');
});

test('anything else is left to the browser', () => {
  assert.equal(parseWav(load('s16.aiff')), null);
  assert.equal(parseAiff(load('u8.wav')), null);
  assert.equal(parseCaf(load('s16.aiff')), null);
  assert.equal(parseWav(new ArrayBuffer(4)), null);
});

test('which files count as sound', () => {
  assert.ok(looksLikeAudio({ type: '', name: 'Loop.AIF' }));
  assert.ok(looksLikeAudio({ type: 'video/quicktime', name: 'clip.mov' }));
  assert.ok(looksLikeAudio({ type: 'audio/x-caf', name: 'x' }));
  assert.ok(!looksLikeAudio({ type: 'application/pdf', name: 'a.pdf' }));
});
