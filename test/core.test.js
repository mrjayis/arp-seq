import test from 'node:test';
import assert from 'node:assert/strict';
import { ArpSeqEngine, buildPattern } from '../src/core.js';

const notes = (...ns) => ns.map((note, order) => ({ note, vel: 100, order }));
const pitches = (p) => p.map((x) => x.note);

test('buildPattern up/down/updown/downup', () => {
  const n = notes(64, 60, 67);
  assert.deepEqual(pitches(buildPattern(n, 'up')), [60, 64, 67]);
  assert.deepEqual(pitches(buildPattern(n, 'down')), [67, 64, 60]);
  assert.deepEqual(pitches(buildPattern(n, 'updown')), [60, 64, 67, 64]);
  assert.deepEqual(pitches(buildPattern(n, 'downup')), [67, 64, 60, 64]);
  assert.deepEqual(pitches(buildPattern(n, 'order')), [64, 60, 67]);
});

test('buildPattern spans octaves and drops notes above 127', () => {
  assert.deepEqual(pitches(buildPattern(notes(60, 64), 'up', 2)), [60, 64, 72, 76]);
  assert.deepEqual(pitches(buildPattern(notes(120), 'up', 3)), [120]);
  assert.deepEqual(pitches(buildPattern(notes(60), 'updown', 1)), [60]);
});

function engineWith(steps, length) {
  const e = new ArpSeqEngine();
  steps.forEach((s, i) => e.setStep(i, s));
  e.setLength(length);
  return e;
}

test('sequencer shifts pitch note by note and wraps at its length', () => {
  const e = engineWith([{ offset: 0 }, { offset: 12 }, { offset: -5 }], 3);
  e.noteOn(60); e.noteOn(64);
  const out = Array.from({ length: 6 }, () => e.next());
  assert.deepEqual(out.map((o) => o.sourceNote), [60, 64, 60, 64, 60, 64]);
  assert.deepEqual(out.map((o) => o.note), [60, 76, 55, 64, 72, 59]);
  assert.deepEqual(out.map((o) => o.stepIndex), [0, 1, 2, 0, 1, 2]);
});

test('per-step volume scales velocity; 0 mutes', () => {
  const e = engineWith([{ volume: 100 }, { volume: 50 }, { volume: 0 }], 3);
  e.noteOn(60, 120);
  assert.deepEqual([e.next(), e.next(), e.next()].map((o) => o.velocity), [120, 60, 0]);
});

test('sequencer length is clamped to 2-5', () => {
  const e = new ArpSeqEngine();
  e.setLength(1); assert.equal(e.length, 2);
  e.setLength(9); assert.equal(e.length, 5);
});

test('pitch offsets are clamped to ±24 and output to MIDI range', () => {
  const e = engineWith([{ offset: 40 }, { offset: -40 }], 2);
  assert.equal(e.steps[0].offset, 24);
  e.noteOn(120);
  assert.equal(e.next().note, 127);
  assert.equal(e.next().note, 96);
});

test('returns null and does not advance the sequencer without notes', () => {
  const e = new ArpSeqEngine();
  assert.equal(e.next(), null);
  assert.equal(e.seqPos, 0);
});

test('a fresh chord restarts arp and sequencer', () => {
  const e = new ArpSeqEngine();
  e.noteOn(60); e.next(); e.next(); e.next();
  e.noteOff(60);
  e.noteOn(62);
  assert.equal(e.next().stepIndex, 0);
});

test('latch holds notes and a new chord replaces them', () => {
  const e = new ArpSeqEngine();
  e.setLatch(true);
  e.noteOn(60); e.noteOn(64); e.noteOff(60); e.noteOff(64);
  assert.deepEqual([...e.active.keys()], [60, 64]);
  e.noteOn(67); // all keys were released → new chord
  assert.deepEqual([...e.active.keys()], [67]);
  e.noteOn(71); // added while 67 is held
  assert.deepEqual([...e.active.keys()], [67, 71]);
  e.noteOff(67); e.noteOff(71);
  e.setLatch(false);
  assert.equal(e.active.size, 0);
});

test('random mode stays in the pool and avoids immediate repeats', () => {
  let seed = 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const e = new ArpSeqEngine({ rng });
  e.setMode('random');
  e.setStep(0, { offset: 0 }); e.setStep(1, { offset: 0 });
  e.setLength(2);
  [60, 64, 67].forEach((n) => e.noteOn(n));
  let prev = null;
  for (let i = 0; i < 200; i++) {
    const { sourceNote } = e.next();
    assert.ok([60, 64, 67].includes(sourceNote));
    assert.notEqual(sourceNote, prev);
    prev = sourceNote;
  }
});

import { chordNotes } from '../src/core.js';

test('chordNotes builds Maj, min, min7 and maj7 from a root', () => {
  assert.deepEqual(chordNotes(60, 'maj'), [60, 64, 67]);
  assert.deepEqual(chordNotes(57, 'min'), [57, 60, 64]);
  assert.deepEqual(chordNotes(62, 'min7'), [62, 65, 69, 72]);
  assert.deepEqual(chordNotes(65, 'maj7'), [65, 69, 72, 76]);
  assert.deepEqual(chordNotes(125, 'maj'), [125]);
});

test('a chord played into the arp is arpeggiated through the sequencer', () => {
  const e = new ArpSeqEngine();
  for (let i = 0; i < 5; i++) e.setStep(i, { offset: 0, volume: 100 });
  chordNotes(60, 'maj7').forEach((n) => e.noteOn(n));
  assert.deepEqual(Array.from({ length: 5 }, () => e.next().note), [60, 64, 67, 71, 60]);
});

import { osc2Note } from '../src/core.js';

test('osc 2 follows the same sequence or its inversion', () => {
  const e = engineWith([{ offset: 0 }, { offset: 12 }, { offset: 7 }, { offset: -5 }], 4);
  e.noteOn(60);
  const evs = Array.from({ length: 4 }, () => e.next());
  assert.deepEqual(evs.map((ev) => ev.note), [60, 72, 67, 55]);
  assert.deepEqual(evs.map((ev) => osc2Note(ev, 'same')), [60, 72, 67, 55]);
  assert.deepEqual(evs.map((ev) => osc2Note(ev, 'invert')), [60, 48, 53, 65]);
  assert.deepEqual(evs.map((ev) => osc2Note(ev, 'invert', 12)), [72, 60, 65, 77]);
  assert.equal(osc2Note({ sourceNote: 5, offset: 12 }, 'invert', -12), 0);
});

import { euclid } from '../src/core.js';

const show = (p) => p.map((h) => (h ? 'x' : '.')).join('');

test('euclid spreads hits evenly and rotates', () => {
  assert.equal(show(euclid(3, 8)), 'x..x..x.');
  assert.equal(show(euclid(4, 16)), 'x...x...x...x...');
  assert.equal(show(euclid(5, 8)).split('x').length - 1, 5);
  assert.equal(show(euclid(3, 8, 1)), '.x..x..x');
  assert.equal(show(euclid(3, 8, -1)), '..x..x.x');
  assert.equal(show(euclid(0, 4)), '....');
  assert.equal(show(euclid(9, 4)), 'xxxx');
});

import { chordVoicing } from '../src/core.js';

test('chord layer repeats the held chord untouched unless it follows the sequencer', () => {
  const held = [{ note: 67, vel: 90 }, { note: 60, vel: 100 }, { note: 64, vel: 100 }];
  assert.deepEqual(chordVoicing(held), [
    { note: 60, velocity: 100 }, { note: 64, velocity: 100 }, { note: 67, velocity: 90 },
  ]);
  assert.deepEqual(chordVoicing(held, { octave: -1 }).map((n) => n.note), [48, 52, 55]);
  const step = { offset: 7, volume: 50 };
  assert.deepEqual(chordVoicing(held, { step }), [
    { note: 67, velocity: 50 }, { note: 71, velocity: 50 }, { note: 74, velocity: 45 },
  ]);
  assert.deepEqual(chordVoicing(held, { step: { offset: 0, volume: 0 } }), []);
  assert.deepEqual(chordVoicing([{ note: 120, vel: 100 }], { octave: 1 }), []);
});

test('currentStep is the step the arp last played and is not advanced by reading it', () => {
  const e = engineWith([{ offset: 0 }, { offset: 12 }, { offset: 7 }], 3);
  e.noteOn(60);
  assert.equal(e.currentStep.offset, 0); // nothing played yet → step 1
  e.next(); e.next();
  assert.equal(e.currentStep.offset, 12);
  assert.equal(e.currentStep.offset, 12);
  assert.equal(e.next().stepIndex, 2);
});

import { patternAt } from '../src/core.js';

test('patternAt follows a pattern running at its own rate', () => {
  // 3 in 8 at 1/8 notes (12 pulses per step): x..x..x.
  const hitsAt16ths = Array.from({ length: 16 }, (_, i) => patternAt(i * 6, 12, 3, 8).hit);
  // Each 1/8 hit lets two 1/16 steps through.
  assert.equal(show(hitsAt16ths), 'xx....xx....xx..');
  assert.deepEqual(patternAt(12 * 9, 12, 3, 8), { pos: 1, hit: false });
});

import { progressionAt, slotNotes, PPQN } from '../src/core.js';

test('progressionAt walks the slots by their beat lengths and loops', () => {
  const slots = [{ beats: 4 }, { beats: 2 }, { beats: 2 }];
  const at = (beat) => progressionAt(beat * PPQN, slots);
  assert.deepEqual([0, 3.9, 4, 5.99, 6, 7.9, 8, 12].map(at), [0, 0, 1, 1, 2, 2, 0, 1]);
  assert.equal(progressionAt(0, []), -1);
});

test('slotNotes builds the slot chord in an octave, rests are silent', () => {
  assert.deepEqual(slotNotes({ root: 7, type: 'dom7' }, 3), [55, 59, 62, 65]);
  assert.deepEqual(slotNotes({ root: 2, type: 'min7' }, 3), [50, 53, 57, 60]);
  assert.deepEqual(slotNotes({ root: 0, type: 'rest' }, 3), []);
});

test('the arp plays the progression chord merged with held notes', () => {
  const e = new ArpSeqEngine();
  for (let i = 0; i < 5; i++) e.setStep(i, { offset: 0, volume: 100 });
  e.setProgressionNotes([48, 52, 55]);
  assert.deepEqual([1, 2, 3].map(() => e.next().note), [48, 52, 55]);
  e.noteOn(72); // a held key adds to the chord
  assert.deepEqual(e.pattern.map((n) => n.note), [48, 52, 55, 72]);
  e.setProgressionNotes([53, 57, 60]); // chord change keeps the held key
  assert.deepEqual(e.pattern.map((n) => n.note), [53, 57, 60, 72]);
  e.noteOff(72);
  e.setProgressionNotes([]);
  assert.equal(e.next(), null);
});
