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

test('pure pentatonic (Bebop 0): a new cell on each chord, flowing in small steps, in range', () => {
  const solo = new ColtraneSolo({ rng: seeded(3) });
  const changes = [[11, 'maj7'], [2, 'dom7'], [7, 'maj7'], [10, 'dom7'], [3, 'maj7'], [3, 'maj7'], [9, 'min7'], [2, 'dom7']];
  const notes = [];
  for (let round = 0; round < 8; round++) {
    for (const [root, type] of changes) {
      // two beats of 8ths per chord: four steps
      for (let s = 0; s < 4; s++) notes.push({ n: solo.next({ root, type }, { space: 0, stepsPerBeat: 2, bebop: 0, intensity: 0.3 }), root, type, s });
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

// Giant Steps' first eight bars, as the app passes them: chord, the next chord, steps left.
const GS = [[11, 'maj7', 4], [2, 'dom7', 4], [7, 'maj7', 4], [10, 'dom7', 4], [3, 'maj7', 8], [9, 'min7', 4], [2, 'dom7', 4],
  [7, 'maj7', 4], [10, 'dom7', 4], [3, 'maj7', 4], [6, 'dom7', 4], [11, 'maj7', 8], [5, 'min7', 4], [10, 'dom7', 4]];
function play(solo, rounds, opts) {
  const out = [];
  for (let r = 0; r < rounds; r++) {
    GS.forEach(([root, type, steps], i) => {
      const [nr, nt] = GS[(i + 1) % GS.length];
      for (let s = 0; s < steps; s++) {
        const n = solo.next({ root, type }, { space: 0.1, stepsPerBeat: 2, next: { root: nr, type: nt }, stepsLeft: steps - s, ...opts });
        out.push({ n, root, type, first: s === 0, kind: solo.kind });
      }
    });
  }
  return out;
}
const SCALES = { maj7: [0, 2, 4, 6, 7, 9, 11], dom7: [0, 2, 4, 5, 7, 9, 10, 11], min7: [0, 2, 3, 4, 5, 7, 9, 10] };
const TONES = { maj7: [0, 4, 7, 11], dom7: [0, 4, 7, 10], min7: [0, 3, 7, 10] };

test('enclosures: a step above and a half step below, landing on a chord tone right on the change', () => {
  const out = play(new ColtraneSolo({ rng: seeded(31) }), 12, { bebop: 1, intensity: 0.5 });
  let landed = 0;
  for (let k = 2; k < out.length; k++) {
    const x = out[k];
    if (!x.first || x.kind !== 'enclosure' || x.n === null) continue;
    const [a, b] = [out[k - 2].n, out[k - 1].n];
    assert.ok(TONES[x.type].includes(pc(x.n - x.root)), `landed on ${pc(x.n - x.root)} over ${x.type}`);
    // the two notes before surround it: one above (1-2 semitones), one a half step below
    const around = [a - x.n, b - x.n].sort((p, q) => p - q);
    if (around[0] === -1 && around[1] >= 1 && around[1] <= 2) landed++;
  }
  assert.ok(landed >= 10, `enclosures landed: ${landed}`);
});

test('on every chord change the line is inside the new chord (below the outside intensity)', () => {
  const out = play(new ColtraneSolo({ rng: seeded(4) }), 10, { bebop: 0.8, intensity: 0.5 });
  const firsts = out.filter((x) => x.first && x.n !== null);
  const inside = firsts.filter((x) => SCALES[x.type].includes(pc(x.n - x.root)));
  assert.equal(inside.length, firsts.length, firsts.filter((x) => !inside.includes(x)).map((x) => `${x.kind} ${pc(x.n - x.root)} ${x.type}`).join(', '));
});

test('bebop language appears with Bebop up: scale runs, chromatic runs, motifs', () => {
  const out = play(new ColtraneSolo({ rng: seeded(8) }), 16, { bebop: 1, intensity: 0.7 });
  const kinds = new Set(out.map((x) => x.kind));
  for (const k of ['pent', 'bebop', 'chrom', 'motif', 'enclosure']) assert.ok(kinds.has(k), `no ${k} figure`);
  // three half steps in a row somewhere
  let chromatic = 0;
  for (let k = 3; k < out.length; k++) {
    const d = [1, 2, 3].map((j) => (out[k - j + 1].n ?? 0) - (out[k - j].n ?? 0));
    if (d.every((x) => Math.abs(x) === 1 && x === d[0])) chromatic++;
  }
  assert.ok(chromatic > 3, `chromatic runs: ${chromatic}`);
  // and with Bebop at 0, none of it
  const pure = play(new ColtraneSolo({ rng: seeded(8) }), 8, { bebop: 0, intensity: 0.5 });
  assert.ok(pure.every((x) => ['pent', 'motif'].includes(x.kind) || x.n === null));
});

test('the build: higher, busier and with side-slips outside only as intensity rises', () => {
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const low = play(new ColtraneSolo({ rng: seeded(2) }), 10, { bebop: 0.5, intensity: 0, space: 0.5 });
  const high = play(new ColtraneSolo({ rng: seeded(2) }), 10, { bebop: 0.5, intensity: 1, space: 0.5 });
  const notes = (o) => o.filter((x) => x.n !== null).map((x) => x.n);
  assert.ok(avg(notes(high)) - avg(notes(low)) > 3, `register ${avg(notes(low))} → ${avg(notes(high))}`);
  assert.ok(notes(high).length > notes(low).length, 'fewer breaths when built up');
  assert.ok(!low.some((x) => x.kind === 'outside'));
  assert.ok(high.some((x) => x.kind === 'outside'));
  // a side-slip is followed straight away by a figure back inside
  for (let k = 1; k < high.length; k++) {
    if (high[k - 1].kind === 'outside' && high[k].kind !== 'outside' && high[k].n !== null && high[k].kind === 'pent') {
      assert.ok(SCALES[high[k].type].includes(pc(high[k].n - high[k].root)));
    }
  }
});

test('restated motifs never stammer on one note', () => {
  const solo = new ColtraneSolo({ rng: seeded(17) });
  const out = play(solo, 30, { bebop: 0.6, intensity: 0.6 });
  for (let k = 1; k < out.length; k++) {
    if (out[k].kind === 'motif' && out[k - 1].kind === 'motif' && out[k].n !== null) assert.notEqual(out[k].n, out[k - 1].n);
  }
});
