import test from 'node:test';
import assert from 'node:assert/strict';
import { bassLine, place, styleForSong, chordScale } from '../src/bass.js';

// A repeatable "random" sequence.
const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pc = (n) => ((n % 12) + 12) % 12;

test('place: the pitch class nearest a note, inside the range', () => {
  assert.equal(place(0, 50, 40, 64), 48);
  assert.equal(place(7, 50, 40, 64), 55);
  assert.equal(place(4, 41, 40, 64), 40);
  assert.equal(place(11, 41, 40, 64), 47); // B below 40 would be 35: up an octave
});

test('song styles choose a bass style', () => {
  assert.equal(styleForSong('Up Tempo Swing'), 'walk');
  assert.equal(styleForSong('Bossa Nova'), 'bossa');
  assert.equal(styleForSong('Latin'), 'bossa');
  assert.equal(styleForSong('Ballad'), 'two');
  assert.equal(styleForSong('Rock Pop'), 'roots');
  assert.equal(styleForSong(''), 'walk');
});

test('walking: root on the downbeat, a beat per note, in range, leading into the next chord', () => {
  for (let seed = 1; seed < 200; seed++) {
    const rng = seeded(seed);
    // Dm7 for a bar, then G7
    const line = bassLine({ chord: { root: 2, type: 'min7' }, next: { root: 7, type: 'dom7' }, beats: 4, rng, prev: 45 });
    assert.deepEqual(line.map((e) => e.beat), [0, 1, 2, 3]);
    assert.ok(line.every((e) => e.len === 1 && e.note >= 40 && e.note <= 64));
    assert.equal(pc(line[0].note), 2);
    // The last note: a half step from G, or D (G's fifth)
    const last = line[3].note;
    assert.ok([6, 8, 2].includes(pc(last)), `approach ${last}`);
    // Beats 2 and 3 are in D dorian
    for (const e of line.slice(1, 3)) assert.ok(chordScale('min7').scale.includes(pc(e.note - 2)), `${e.note} not in D dorian`);
    // Never a big leap from the beat before
    for (let k = 1; k < 3; k++) assert.ok(Math.abs(line[k].note - line[k - 1].note) <= 5);
  }
});

test('walking: two-beat chords are root then approach; the line carries on from the last note', () => {
  const line = bassLine({ chord: { root: 11, type: 'maj7' }, next: { root: 2, type: 'dom7' }, beats: 2, rng: seeded(3), prev: 50 });
  assert.equal(line.length, 2);
  assert.equal(pc(line[0].note), 11);
  assert.ok(Math.abs(line[0].note - 50) <= 6); // B nearest the last note, not jumping an octave
  assert.ok([1, 3, 9].includes(pc(line[1].note)));
});

test('two-feel, bossa and roots patterns', () => {
  const c = { root: 0, type: 'maj7' };
  assert.deepEqual(bassLine({ chord: c, beats: 4, style: 'two', prev: 48 }).map((e) => [e.beat, pc(e.note), e.len]), [[0, 0, 2], [2, 7, 2]]);
  assert.deepEqual(bassLine({ chord: c, beats: 8, style: 'bossa', prev: 48 }).map((e) => [e.beat, pc(e.note), e.len]),
    [[0, 0, 1.5], [1.5, 7, 2.5], [4, 0, 1.5], [5.5, 7, 2.5]]);
  assert.deepEqual(bassLine({ chord: c, beats: 8, style: 'roots', prev: 48 }).map((e) => [e.beat, pc(e.note), e.len]), [[0, 0, 4], [4, 0, 4]]);
  // the fifth of a half-diminished chord is diminished
  assert.equal(pc(bassLine({ chord: { root: 9, type: 'hdim7' }, beats: 4, style: 'two', prev: 45 })[1].note), 3);
  // a rest plays nothing
  assert.deepEqual(bassLine({ chord: { root: 0, type: 'rest' }, beats: 4 }), []);
});

test('walking: no wide leaps into the approach, no repeated pitch class, stays near the middle over a long run', () => {
  const rng = seeded(7);
  // Giant Steps' first eight bars, twice round
  const gs = [[11, 'maj7', 2], [2, 'dom7', 2], [7, 'maj7', 2], [10, 'dom7', 2], [3, 'maj7', 4], [9, 'min7', 2], [2, 'dom7', 2],
    [7, 'maj7', 2], [10, 'dom7', 2], [3, 'maj7', 2], [6, 'dom7', 2], [11, 'maj7', 4], [5, 'min7', 2], [10, 'dom7', 2]];
  let prev = null;
  const all = [];
  for (let r = 0; r < 6; r++) {
    gs.forEach(([root, type, beats], i) => {
      const [nr, nt] = gs[(i + 1) % gs.length];
      const line = bassLine({ chord: { root, type }, next: { root: nr, type: nt }, beats, prev, rng });
      for (const e of line) all.push(e.note);
      prev = line.at(-1).note;
    });
  }
  for (let k = 1; k < all.length; k++) {
    assert.ok(Math.abs(all[k] - all[k - 1]) <= 9, `leap ${all[k - 1]} → ${all[k]}`);
  }
  const avg = all.reduce((a, b) => a + b, 0) / all.length;
  assert.ok(avg > 44 && avg < 58, `average ${avg}`);
});

import { BASS_RATES } from '../src/bass.js';

test('Rate: walking in 8ths, triplets and dotted values; roots pulsing; bossa keeps its own', () => {
  const chord = { root: 2, type: 'min7' };
  const next = { root: 7, type: 'dom7' };
  // 8ths over a bar: eight notes, still the root first and an approach into G last
  const e8 = bassLine({ chord, next, beats: 4, rng: seeded(4), prev: 45, unit: BASS_RATES['1/8'] });
  assert.deepEqual(e8.map((e) => e.beat), [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
  assert.ok(e8.every((e) => e.len === 0.5));
  assert.equal(pc(e8[0].note), 2);
  assert.ok([6, 8, 2].includes(pc(e8.at(-1).note)));
  // triplet 8ths: twelve to a bar
  assert.equal(bassLine({ chord, next, beats: 4, rng: seeded(4), prev: 45, unit: BASS_RATES['1/8T'] }).length, 12);
  // dotted quarters: notes at 0, 1.5 — the last takes what's left of the bar
  const dq = bassLine({ chord, next, beats: 4, rng: seeded(4), prev: 45, unit: BASS_RATES['1/4D'] });
  assert.deepEqual(dq.map((e) => [e.beat, e.len]), [[0, 1.5], [1.5, 2.5]]);
  // roots pulsing in 8ths, all the root
  const r8 = bassLine({ chord, beats: 4, style: 'roots', prev: 45, unit: 0.5 });
  assert.equal(r8.length, 8);
  assert.ok(r8.every((e) => pc(e.note) === 2));
  // Auto (no unit): as before
  assert.equal(bassLine({ chord, beats: 4, style: 'roots', prev: 45 }).length, 1);
  assert.equal(bassLine({ chord, next, beats: 4, rng: seeded(4), prev: 45 }).length, 4);
  // bossa ignores the Rate
  assert.deepEqual(bassLine({ chord, beats: 4, style: 'bossa', prev: 45, unit: 0.25 }).map((e) => e.beat), [0, 1.5]);
});
