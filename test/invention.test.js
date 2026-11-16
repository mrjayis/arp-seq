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

import { lineScale } from '../src/invention.js';

test('in a key the lines keep to it: C major over F and G; harmonic minor over E7 in A minor', () => {
  const C = { tonic: 0, minor: false };
  assert.deepEqual(lineScale({ root: 5, type: 'maj' }, C).sort((a, b) => a - b), [0, 2, 4, 5, 7, 9, 11]); // B, not B-flat
  assert.deepEqual(lineScale({ root: 7, type: 'maj' }, C).sort((a, b) => a - b), [0, 2, 4, 5, 7, 9, 11]); // F, not F-sharp
  const Am = { tonic: 9, minor: true };
  assert.deepEqual(lineScale({ root: 4, type: 'dom7' }, Am).sort((a, b) => a - b), [0, 2, 4, 5, 8, 9, 11]); // G-sharp
  // without a key, the chord's own scale
  assert.ok(lineScale({ root: 5, type: 'maj' }).includes(10));
});

test('the subject\'s 8ths never just bounce between two notes', () => {
  for (let s = 1; s < 200; s++) {
    const e8 = makeSubject(seeded(s)).slice(8).map((e) => Math.abs(e.move));
    for (let k = 1; k < 4; k++) assert.notEqual(e8[k], e8[k - 1]);
  }
});

test('the cadence runs down within the upper voice, no octave jump at the end', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const out = perform(seed, 2).filter((e) => e.v === 'upper' && e.kind === 'cadence');
    for (let k = 1; k < out.length; k++) {
      if (Math.floor(out[k].s / 16) !== Math.floor(out[k - 1].s / 16)) continue;
      assert.ok(Math.abs(out[k].note - out[k - 1].note) <= 7, `cadence leap ${out[k - 1].note} → ${out[k].note}`);
    }
  }
});

import { counterpointCost } from '../src/invention.js';

test('counterpoint rules: what each one catches', () => {
  const base = { prev2: null, otherMoved: true, beat: true, parallels: 0, edge: false, mine: true };
  const f = (n, ctx) => counterpointCost(n, { ...base, ...ctx }).faults;
  // C/E → D/G... parallel 5ths: lower C3→D3, upper G3→A3
  assert.ok(f(57, { voice: 'upper', other: 50, prev: 55, pair: { upper: 55, lower: 48 }, strong: true }).includes('parallel 5ths'));
  // octaves by contrary motion
  assert.ok(f(79, { voice: 'upper', other: 55, prev: 72, pair: { upper: 72, lower: 60 }, strong: true }).some((x) => /octaves by contrary/.test(x)));
  // a 4th on the strong beat is a dissonance in two voices
  assert.ok(f(65, { voice: 'upper', other: 60, prev: 64, pair: { upper: 64, lower: 60 }, strong: true }).includes('dissonance on a strong beat'));
  // a passing note by step on a weak 16th is fine; by leap it isn't
  assert.deepEqual(f(62, { voice: 'upper', other: 60, prev: 64, pair: { upper: 64, lower: 60 }, strong: false }), []);
  assert.ok(f(62, { voice: 'upper', other: 60, prev: 67, pair: { upper: 67, lower: 60 }, strong: false }).includes('dissonance not approached by step'));
  // hidden octave: similar motion into an octave with the upper voice leaping
  assert.ok(f(72, { voice: 'upper', other: 60, prev: 67, pair: { upper: 67, lower: 59 }, strong: true }).includes('hidden octave'));
  // a leap of a 5th not followed by a step back
  assert.ok(f(74, { voice: 'upper', other: null, prev: 72, prev2: 65 }).includes('leap not recovered by step'));
  assert.deepEqual(f(70, { voice: 'upper', other: null, prev: 72, prev2: 65 }), []);
  assert.ok(f(78, { voice: 'upper', other: null, prev: 72 }).includes('tritone leap'));
});

test('with the rules on, parallels and dissonances all but vanish', () => {
  const count = (rules) => {
    const t = { par: 0, dis: 0 };
    for (let seed = 1; seed <= 30; seed++) {
      const inv = new Invention({ rng: seeded(seed) });
      inv.rules = rules;
      for (let s = 0; s < 2 * 8 * 16; s++) {
        const bar = Math.floor(s / 16) % 8;
        const [root, type] = ROUND[bar];
        for (const v of ['upper', 'lower']) {
          const ev = inv.step(v, s, { root, type }, { cadence: bar === 7, afterCadence: bar === 0 && s >= 128, key: { tonic: 0, minor: false } });
          if (!ev) continue;
          for (const x of ev.faults) {
            if (/parallel (5ths|octaves)|by contrary motion/.test(x)) t.par++;
            if (/dissonance/.test(x)) t.dis++;
          }
        }
      }
    }
    return t;
  };
  const off = count(false);
  const on = count(true);
  assert.ok(off.par > 20 && on.par <= off.par / 20, `parallels ${off.par} → ${on.par}`);
  assert.ok(off.dis > 100 && on.dis <= off.dis / 15, `dissonances ${off.dis} → ${on.dis}`);
});

test('the checker does not turn a moving line into repeated notes', () => {
  let repeats = 0;
  let moves = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const inv = new Invention({ rng: seeded(seed) });
    const last = {};
    for (let s = 0; s < 2 * 8 * 16; s++) {
      const bar = Math.floor(s / 16) % 8;
      const [root, type] = ROUND[bar];
      for (const v of ['upper', 'lower']) {
        const ev = inv.step(v, s, { root, type }, { cadence: bar === 7, afterCadence: bar === 0 && s >= 128, key: { tonic: 0, minor: false } });
        if (!ev) continue;
        if (ev.kind !== 'final' && last[v] !== undefined) { moves++; if (ev.note === last[v]) repeats++; }
        last[v] = ev.note;
      }
    }
  }
  assert.ok(repeats / moves < 0.03, `${repeats} repeated of ${moves}`);
});

import { parseSubject } from '../src/invention.js';

test('a typed subject: the C major Invention opening, answered a 5th up to fill the bar', () => {
  const r = parseSubject('C5 D E F D E C G5-');
  assert.equal(r.error, undefined);
  assert.deepEqual(r.notes, [72, 74, 76, 77, 74, 76, 72, 79]);
  assert.equal(r.length, 9);
  // nine 16ths: more than half a bar, so the last note holds to the bar line
  assert.deepEqual(r.events.map((e) => [e.at, e.len, e.move]),
    [[0, 1, null], [1, 1, 1], [2, 1, 1], [3, 1, 1], [4, 1, -2], [5, 1, 1], [6, 1, -2], [7, 9, 4]]);
  // without an octave number a note goes to the nearest octave: G after C is the 4th below
  assert.equal(parseSubject('C5 D E F D E C G').notes[7], 67);
  // exactly half a bar: stated, then again a 5th (four scale steps) higher
  const half = parseSubject('C5 D E F D E C G5');
  assert.equal(half.events.length, 16);
  assert.deepEqual(half.events.slice(9).map((e) => e.move), half.events.slice(1, 8).map((e) => e.move));
  assert.equal(half.events[8].at, 8);
  assert.equal(half.events[8].move, 0); // from G5 to G5: the answer starts a 5th above the C
});

test('a typed subject: holds, rests, octaves, accidentals, errors', () => {
  const r = parseSubject('G4- r C5-- Bb4 F#4 c');
  assert.deepEqual(r.notes, [67, 72, 70, 66, 60]);
  assert.deepEqual(r.events.map((e) => [e.at, e.len]), [[0, 2], [3, 3], [6, 1], [7, 1], [8, 8]]);
  assert.deepEqual(r.events.map((e) => e.move), [null, 3, -1, -3, -3]);
  assert.deepEqual(parseSubject('C5 B').notes, [72, 71]);
  assert.ok(parseSubject('C5 H').error);
  assert.ok(parseSubject('').error);
  // past a bar: cut at the bar line
  assert.equal(parseSubject('C5--- D--- E--- F--- G--- A---').events.length, 4);
});

test('the invention plays your subject', () => {
  const inv = new Invention({ rng: seeded(3) });
  const { events } = parseSubject('C5 D E F D E C G5- C6- B5- C6-');
  inv.setSubject(events);
  const got = [];
  for (let s = 0; s < 16; s++) {
    const ev = inv.step('upper', s, { root: 0, type: 'maj' }, { key: { tonic: 0, minor: false } });
    if (ev) got.push(ev.note);
  }
  // over a C major chord in C, Bach's subject comes out as written
  assert.deepEqual(got, [72, 74, 76, 77, 74, 76, 72, 79, 84, 83, 84]);
  inv.reset(); // pressing Play again keeps it
  assert.deepEqual(inv.subject.map((e) => e.move), events.map((e) => e.move));
});
