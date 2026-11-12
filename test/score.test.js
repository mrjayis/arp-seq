import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMidi, scoreLength, monoLengths, firstAtOrAfter, tempoBpm } from '../src/score.js';

// Build a little MIDI file by hand.
const vlq = (v) => { const out = [v & 0x7f]; while ((v >>= 7)) out.unshift((v & 0x7f) | 0x80); return out; };
const chunk = (id, bytes) => [...id].map((c) => c.charCodeAt(0)).concat([bytes.length >>> 24, (bytes.length >> 16) & 255, (bytes.length >> 8) & 255, bytes.length & 255], bytes);
const track = (events) => chunk('MTrk', events.flat(2).concat([0, 0xff, 0x2f, 0]));
const name = (s) => [0, 0xff, 0x03, s.length, ...[...s].map((c) => c.charCodeAt(0))];
function midi(format, ppq, tracks) {
  return new Uint8Array([...chunk('MThd', [0, format, 0, tracks.length, ppq >> 8, ppq & 255]), ...tracks.flat()]);
}

test('parseMidi reads tracks as parts, with running status, note-off by velocity 0 and tempo', () => {
  const right = track([name('Right'), [0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20], // 120 BPM
    [0, 0x90, 60, 90], [vlq(240), 64, 80], // running status: second note-on
    [vlq(240), 0x80, 60, 0], [0, 0x90, 64, 0], // note-off, and note-on velocity 0 = off
    [0, 0x90, 67, 100], [vlq(960), 0x80, 67, 0]]);
  const left = track([name('Left'), [0, 0x91, 48, 70], [vlq(1920), 0x81, 48, 0]]);
  const s = parseMidi(midi(1, 480, [right, left]));
  assert.equal(s.ppq, 480);
  assert.equal(tempoBpm(s.tempo), 120);
  assert.deepEqual(s.parts.map((x) => x.name), ['Right', 'Left']);
  assert.deepEqual(s.parts[0].notes, [
    { t: 0, d: 480, n: 60, v: 90 }, { t: 240, d: 240, n: 64, v: 80 }, { t: 480, d: 960, n: 67, v: 100 },
  ]);
  assert.deepEqual(s.parts[1].notes, [{ t: 0, d: 1920, n: 48, v: 70 }]);
  assert.equal(scoreLength(s), 1920);
});

test('format 0 is split by channel; drums are left out', () => {
  const one = track([[0, 0x90, 72, 90], [0, 0x91, 40, 90], [0, 0x99, 36, 90], [vlq(480), 0x80, 72, 0], [0, 0x81, 40, 0], [0, 0x89, 36, 0]]);
  const s = parseMidi(midi(0, 96, [one]));
  assert.deepEqual(s.parts.map((x) => x.notes[0].n), [72, 40]);
  assert.throws(() => parseMidi(new Uint8Array([1, 2, 3, 4])), /Not a MIDI file/);
});

test('monoLengths trims overlaps for a one-note-at-a-time voice; firstAtOrAfter finds a start', () => {
  const notes = [{ t: 0, d: 600, n: 60, v: 90 }, { t: 480, d: 200, n: 62, v: 90 }, { t: 960, d: 100, n: 64, v: 90 }];
  assert.deepEqual(monoLengths(notes).map((n) => n.d), [479, 200, 100]);
  assert.equal(firstAtOrAfter(notes, 0), 0);
  assert.equal(firstAtOrAfter(notes, 1), 1);
  assert.equal(firstAtOrAfter(notes, 2000), 3);
});
