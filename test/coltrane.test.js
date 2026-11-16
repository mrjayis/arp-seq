import test from 'node:test';
import assert from 'node:assert/strict';
import { pickCell, ColtraneSolo } from '../src/coltrane.js';

const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pc = (n) => ((n % 12) + 12) % 12;
// The scale each chord's cells must stay inside (pitch classes above the root).
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MIXO = [0, 2, 4, 5, 7, 9, 10];
const ALTERED = [0, 1, 3, 4, 6, 8, 10];
const LOCRIAN = [0, 1, 3, 5, 6, 8, 10];

test('cells stay inside the chord\'s scale: substitute pentatonics and 1-2-3-5', () => {
  const rng = seeded(11);
  for (const [type, scale] of [['maj7', LYDIAN], ['min7', DORIAN], ['dom7', MIXO], ['alt', ALTERED], ['hdim7', LOCRIAN]]) {
    for (let root = 0; root < 12; root++) {
      for (let k = 0; k < 60; k++) {
        const { pcs } = pickCell({ root, type }, rng);
        assert.equal(pcs.length, 4);
        for (const n of pcs) assert.ok(scale.includes(pc(n - root)), `${type} on ${root}: ${pc(n - root)} not in its scale`);
      }
    }
  }
});

test('the major 7th uses its own pentatonic, the 5th\'s and the 2nd\'s (Lydian); 1-2-3-5 is common', () => {
  const rng = seeded(5);
  const sources = new Set();
  let digital = 0;
  for (let k = 0; k < 400; k++) {
    const c = pickCell({ root: 0, type: 'maj7' }, rng);
    sources.add(c.source);
    if (c.pcs.map((n) => n - c.pcs[0]).join() === '0,2,4,7') digital++;
  }
  assert.deepEqual([...sources].sort(), ['cell', 0, 2, 7].sort());
  assert.ok(digital > 100, `1-2-3-5 shapes: ${digital}`);
});

test('the line: a new cell on each chord, flowing in small steps, in range', () => {
  const solo = new ColtraneSolo({ rng: seeded(3) });
  const changes = [[11, 'maj7'], [2, 'dom7'], [7, 'maj7'], [10, 'dom7'], [3, 'maj7'], [3, 'maj7'], [9, 'min7'], [2, 'dom7']];
  const notes = [];
  for (let round = 0; round < 8; round++) {
    for (const [root, type] of changes) {
      // two beats of 8ths per chord: four steps
      for (let s = 0; s < 4; s++) notes.push({ n: solo.next({ root, type }, { space: 0, stepsPerBeat: 2 }), root, type, s });
    }
  }
  assert.ok(notes.every((x) => x.n !== null), 'no breaths with Space at 0');
  assert.ok(notes.every((x) => x.n >= 55 && x.n <= 81));
  // On each chord change the first note belongs to that chord's material.
  const fits = { maj7: LYDIAN, dom7: MIXO, min7: DORIAN };
  for (const x of notes) assert.ok(fits[x.type].includes(pc(x.n - x.root)), `${x.n} over ${x.root}${x.type}`);
  const leaps = notes.slice(1).map((x, i) => Math.abs(x.n - notes[i].n));
  assert.ok(Math.max(...leaps) <= 12, `largest leap ${Math.max(...leaps)}`);
  assert.ok(leaps.reduce((a, b) => a + b, 0) / leaps.length < 5, 'mostly small steps');
});

test('Space gives the line breaths between phrases', () => {
  const solo = new ColtraneSolo({ rng: seeded(9) });
  const out = [];
  for (let k = 0; k < 400; k++) out.push(solo.next({ root: 0, type: 'min7' }, { space: 0.6, stepsPerBeat: 2 }));
  const rests = out.filter((n) => n === null).length;
  assert.ok(rests > 20 && rests < 250, `rests ${rests}`);
  // and a phrase is several notes long, not single notes
  const runs = out.join(',').split(/,?null,?/).filter(Boolean).map((r) => r.split(',').length);
  assert.ok(runs.reduce((a, b) => a + b, 0) / runs.length >= 6, `average phrase ${runs}`);
  // no chord: nothing
  assert.equal(solo.next(null), null);
});

test('a chord held for a while does not repeat the same cell back to back', () => {
  const solo = new ColtraneSolo({ rng: seeded(21) });
  const cells = [];
  for (let k = 0; k < 400; k++) {
    const n = solo.next({ root: 3, type: 'maj7' }, { space: 0 });
    if (k % 4 === 0) cells.push([]);
    cells.at(-1).push(n);
  }
  const same = cells.slice(1).filter((c, i) => c.join() === cells[i].join()).length;
  assert.ok(same <= 2, `${same} repeated cells`);
});
