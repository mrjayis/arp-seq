import test from 'node:test';
import assert from 'node:assert/strict';
import { Invention, makeSubject, makeCounter, scaleStep, VOICE_RANGES } from '../src/invention.js';

const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pc = (n) => ((n % 12) + 12) % 12;
const TONES = { maj7: [0, 4, 7, 11], dom7: [0, 4, 7, 10], min7: [0, 3, 7, 10] };

test('the subject: a turn of eight 16ths, then four 8ths, filling the bar', () => {
  for (let s = 1; s < 50; s++) {
    const subj = makeSubject(seeded(s));
    assert.deepEqual(subj.map((e) => e.len), [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2]);
    assert.equal(subj.at(-1).at + subj.at(-1).len, 16);
    assert.ok(subj.slice(1, 7).every((e) => Math.abs(e.move) <= 2), 'the 16ths move by step');
    const counter = makeCounter(subj, seeded(s));
    assert.equal(counter.length, 8);
  }
  assert.equal(scaleStep(60, 2, { root: 0, type: 'maj7' }), 64); // C, two scale steps up: E
  assert.equal(scaleStep(60, -1, { root: 0, type: 'maj7' }), 59);
});

// ii–V–I–vi in C, a bar each, eight bars a round
const ROUND = [[2, 'min7'], [7, 'dom7'], [0, 'maj7'], [9, 'min7'], [2, 'min7'], [7, 'dom7'], [0, 'maj7'], [0, 'maj7']];
function perform(seed, rounds = 3, voices = ['upper', 'lower']) {
  const inv = new Invention({ rng: seeded(seed) });
  const out = [];
  for (let s = 0; s < rounds * 8 * 16; s++) {
    const barInRound = Math.floor(s / 16) % 8;
    const [root, type] = ROUND[barInRound];
    const info = { cadence: barInRound === 7, afterCadence: barInRound === 0 && s >= 128 };
    for (const v of voices) {
      const ev = inv.step(v, s, { root, type }, { ...info, other: inv.last.upper });
      if (ev) out.push({ v, s, ...ev, root, type, upper: inv.last.upper });
    }
  }
  return out;
}

test('exposition: the upper voice alone, then the lower voice answers with the subject', () => {
  const out = perform(4, 1);
  assert.ok(out.filter((e) => e.s < 16).every((e) => e.v === 'upper' && e.kind === 'subject'));
  const lower1 = out.filter((e) => e.v === 'lower' && e.s >= 16 && e.s < 32);
  assert.equal(lower1[0].kind, 'subject');
  // the same rhythm as the upper voice's statement
  assert.deepEqual(lower1.map((e) => e.s - 16), out.filter((e) => e.s < 16).map((e) => e.s));
  assert.ok(out.filter((e) => e.v === 'upper' && e.s >= 16 && e.s < 32).every((e) => e.kind === 'counter'));
});

test('counterpoint: chord tones on beats 1 and 3, voices in range, the lower under the upper', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const out = perform(seed, 3);
    for (const e of out) {
      const [lo, hi] = VOICE_RANGES[e.v];
      assert.ok(e.note >= lo - 5 && e.note <= hi, `${e.v} ${e.note}`);
      if (e.s % 8 === 0) assert.ok(TONES[e.type].includes(pc(e.note - e.root)) || e.kind === 'cadence' || e.kind === 'final', `${e.kind} ${pc(e.note - e.root)} on ${e.type}`);
      if (e.v === 'lower' && e.upper !== null) assert.ok(e.note < e.upper, `lower ${e.note} above upper ${e.upper}`);
    }
  }
});

test('form: a cadence ends each round, long notes after it, then the subject alone again', () => {
  const out = perform(9, 3);
  const kinds = (bar, v) => [...new Set(out.filter((e) => e.v === v && Math.floor(e.s / 16) === bar).map((e) => e.kind))];
  assert.deepEqual(kinds(7, 'upper'), ['cadence']);
  assert.deepEqual(kinds(8, 'upper'), ['final']);
  assert.deepEqual(kinds(8, 'lower'), ['final']);
  assert.equal(out.find((e) => e.v === 'upper' && Math.floor(e.s / 16) === 8).len, 8);
  assert.deepEqual(kinds(9, 'upper'), ['subject']);
  assert.deepEqual(kinds(9, 'lower'), []);
  // in the development, more than the subject
  const dev = new Set(out.filter((e) => e.s >= 32 && e.s < 112).map((e) => e.kind));
  assert.ok(dev.size >= 3, [...dev].join());
});

test('episodes fall: each repeat of the head a step lower; the walking bass steps down', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const inv = new Invention({ rng: seeded(seed) });
    inv.bar = 5; // mid-piece
    inv.barCount = 3;
    inv.plan = null;
    // force an episode bar over a held C major chord
    inv.planBar = function () { this.plan = { upper: this.constructor.prototype.planBar ? episodeOf(this) : [], lower: [] }; this.kinds = { upper: 'episode', lower: 'bass' }; };
    function episodeOf(self) { const head = self.subject.slice(0, 4); const out = []; for (let r = 0; r < 4; r++) head.forEach((e, k) => out.push({ at: r * 4 + k, len: 1, dir: -1, move: k === 0 ? (r === 0 ? null : -1 - head.slice(1).reduce((s, x) => s + x.move, 0)) : e.move })); return out; }
    inv.last.upper = 72;
    const starts = [];
    for (let s = 96; s < 112; s++) {
      const ev = inv.step('upper', s, { root: 0, type: 'maj' });
      if (ev && (s - 96) % 4 === 0) starts.push(ev.note);
    }
    assert.ok(starts[3] < starts[0], `episode starts ${starts}`);
  }
});
