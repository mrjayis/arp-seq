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

test('sequencer length is clamped to 2-6, with a step for each', () => {
  const e = new ArpSeqEngine();
  e.setLength(1); assert.equal(e.length, 2);
  e.setLength(9); assert.equal(e.length, 6);
  assert.equal(e.steps.length, 6);
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

import { progressionAt, slotNotes, invertChord, progressionVoicings, nearestVoicing, anticipatedSlot, chordTie, PPQN } from '../src/core.js';

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

import { sliderToFreq, freqToSlider, formatHz, CUTOFF_MIN, CUTOFF_MAX } from '../src/core.js';

test('cutoff sliders are logarithmic, giving the low end more travel', () => {
  assert.equal(sliderToFreq(0), CUTOFF_MIN);
  assert.equal(sliderToFreq(1000), CUTOFF_MAX);
  // Halfway is the geometric mean (~849 Hz), not the arithmetic one (~6 kHz).
  assert.equal(sliderToFreq(500), Math.round(Math.sqrt(CUTOFF_MIN * CUTOFF_MAX)));
  // Each octave gets the same slider travel.
  const octave = freqToSlider(400) - freqToSlider(200);
  assert.ok(Math.abs(freqToSlider(4000) - freqToSlider(2000) - octave) <= 1);
  // Below 1 kHz now covers over half the slider (it was ~10% of the old linear one).
  assert.ok(freqToSlider(1000) > 500);
  for (const f of [60, 250, 2400, 9000]) assert.ok(Math.abs(sliderToFreq(freqToSlider(f)) - f) / f < 0.01);
  assert.equal(freqToSlider(10), 0);
  assert.equal(formatHz(450), '450 Hz');
  assert.equal(formatHz(2400), '2.40 kHz');
});

test('a step switched off strikes nothing; the tail slides to the next arp note plus its interval', () => {
  const e = engineWith([
    { offset: 12, on: true },
    { offset: 7, on: false },
    { offset: 0, on: true },
    { offset: -5, on: false },
  ], 4);
  for (let i = 0; i < 4; i++) e.setStep(i, { volume: 100 });
  e.noteOn(60); e.noteOn(64); e.noteOn(67);
  const evs = Array.from({ length: 5 }, () => e.next());
  // Step 1 strikes C +12.
  assert.deepEqual([evs[0].rest, evs[0].note], [false, 72]);
  // Step 2 is off: no strike; the tail slides to the next arp note (E) +7 = B.
  assert.deepEqual([evs[1].rest, evs[1].velocity, evs[1].sourceNote, evs[1].note], [true, 0, 64, 71]);
  // Step 3 strikes the arp note after that (G).
  assert.deepEqual([evs[2].rest, evs[2].note, evs[2].sourceNote], [false, 67, 67]);
  // Step 4 is off: the tail slides to the next arp note (C, wrapping) −5 = G below.
  assert.deepEqual([evs[3].sourceNote, evs[3].note], [60, 55]);
  // Sequencer wraps to step 1 again.
  assert.equal(evs[4].stepIndex, 0);
});

test('step on/off is stored per step', () => {
  const e = engineWith([{ offset: 3, on: false }, { offset: 0, on: true }], 2);
  e.noteOn(60);
  assert.equal(e.next().rest, true);
  e.setStep(0, { on: true });
  assert.equal(e.steps[0].on, true);
  assert.equal(e.next().rest, false);
});

test('invertChord raises the lowest notes an octave, never past the chord size', () => {
  assert.deepEqual(invertChord([60, 64, 67], 0), [60, 64, 67]);
  assert.deepEqual(invertChord([60, 64, 67], 1), [64, 67, 72]);
  assert.deepEqual(invertChord([60, 64, 67], 2), [67, 72, 76]);
  assert.deepEqual(invertChord([60, 64, 67], 3), [67, 72, 76]);
  assert.deepEqual(slotNotes({ root: 0, type: 'maj7', inv: 3 }, 3), [59, 60, 64, 67]);
});

test('progressionVoicings: smooth voice leading picks the nearest inversion and loops the same', () => {
  // C – F – G – C in octave 3: F and G move to inversions near C.
  const slots = [[0, 'maj'], [5, 'maj'], [7, 'maj'], [0, 'maj']].map(([root, type]) => ({ root, type, beats: 4 }));
  const set = progressionVoicings(slots, 3, 'set');
  assert.deepEqual(set.map((v) => v.notes), [[48, 52, 55], [53, 57, 60], [55, 59, 62], [48, 52, 55]]);
  const smooth = progressionVoicings(slots, 3, 'smooth');
  assert.deepEqual(smooth[0].notes, [48, 52, 55]);
  assert.deepEqual(smooth[1].notes, [48, 53, 57]); // F/C: second inversion
  assert.deepEqual(smooth[2].notes, [47, 50, 55]); // G/B: first inversion, an octave down
  assert.deepEqual(smooth[3].notes, [48, 52, 55]);
  assert.deepEqual(progressionVoicings(slots, 3, 'smooth'), smooth);
  // Rests stay silent and don't break the chain.
  const withRest = progressionVoicings([slots[0], { root: 0, type: 'rest', beats: 4 }, slots[1]], 3, 'smooth');
  assert.deepEqual(withRest[1].notes, []);
  assert.deepEqual(withRest[2].notes, [48, 53, 57]);
});

test('nearest-tone voice leading moves each voice the least, open voicings allowed', () => {
  // C E G → G major: E→D, G stays, C→B.
  assert.deepEqual(nearestVoicing([48, 52, 55], [7, 11, 2], 41, 74), [47, 50, 55]);
  // Triad → 7th chord adds a voice; nothing doubles.
  const v = nearestVoicing([48, 52, 55], [2, 5, 9, 0], 41, 74);
  assert.equal(new Set(v).size, 4);
  assert.deepEqual(v.map((n) => n % 12).sort((a, b) => a - b), [0, 2, 5, 9]);
  const slots = [[0, 'maj'], [5, 'maj'], [7, 'dom7'], [0, 'maj']].map(([root, type]) => ({ root, type, beats: 4 }));
  const near = progressionVoicings(slots, 3, 'nearest');
  assert.deepEqual(near[0].notes, [48, 52, 55]);
  assert.deepEqual(near[1].notes, [48, 53, 57]); // F/C
  for (const { notes } of near) assert.ok(notes.every((n) => n >= 41 && n <= 74));
  assert.deepEqual(progressionVoicings(slots, 3, 'nearest'), near);
});

test('anticipatedSlot: hits in the last 8th before a chord change push the next chord', () => {
  const slots = [{ beats: 4 }, { beats: 2 }, { beats: 4 }];
  const at = (beat) => anticipatedSlot(Math.round(beat * PPQN), slots);
  assert.equal(at(0), -1);
  assert.equal(at(3), -1); // beat 4: a quarter before the change
  assert.equal(at(3.25), -1); // just before the last 8th
  assert.equal(at(3.5), 1); // the "and" of 4: the last 8th
  assert.equal(at(3.75), 1); // after it
  assert.equal(at(4), -1); // the new chord is already playing
  assert.equal(at(5.5), 2);
  assert.equal(at(9.5), 0); // the loop wraps back to the first chord
  assert.equal(anticipatedSlot(3.5 * PPQN, [{ beats: 4 }]), -1); // one chord: nothing changes
  assert.equal(anticipatedSlot(0, []), -1);
});

test('chordTie: the first pushed hit holds through the downbeat; later hits are tied, not struck', () => {
  const slots = [{ beats: 4 }, { beats: 4 }];
  const pps = PPQN / 4; // 16ths: 16 per bar, change at step 16, last 8th = steps 14 and 15
  const hits = (list) => (s) => list.includes(((s % 32) + 32) % 32);
  // Hits on 14 (the "and" of 4), 15 and the downbeat 16.
  let isHit = hits([0, 14, 15, 16]);
  assert.deepEqual(chordTie(14, pps, slots, isHit), { role: 'start', until: 16 });
  assert.equal(chordTie(15, pps, slots, isHit).role, 'held');
  assert.equal(chordTie(16, pps, slots, isHit).role, 'held');
  assert.equal(chordTie(0, pps, slots, isHit).role, 'none');
  // Pushed on 15 only: it starts the tie.
  isHit = hits([15, 16]);
  assert.deepEqual(chordTie(15, pps, slots, isHit), { role: 'start', until: 16 });
  // No downbeat hit: nothing to tie into, play as usual.
  isHit = hits([14, 18]);
  assert.equal(chordTie(14, pps, slots, isHit).role, 'none');
  assert.equal(chordTie(18, pps, slots, isHit).role, 'none');
  // A downbeat with no push before it is struck as usual.
  isHit = hits([12, 16]);
  assert.equal(chordTie(16, pps, slots, isHit).role, 'none');
  // The loop wraps: a push at the end of the last chord ties into step 32 (bar 1 again).
  isHit = hits([30, 0]);
  assert.deepEqual(chordTie(30, pps, slots, isHit), { role: 'start', until: 32 });
  assert.equal(chordTie(32, pps, slots, isHit).role, 'held');
});

test('each progression slot can be shifted up or down two octaves', () => {
  assert.deepEqual(slotNotes({ root: 0, type: 'maj', oct: 1 }, 3), [60, 64, 67]);
  assert.deepEqual(slotNotes({ root: 0, type: 'maj', oct: -2 }, 3), [24, 28, 31]);
  assert.deepEqual(slotNotes({ root: 0, type: 'maj', oct: 9 }, 3), [72, 76, 79]); // clamped to +2
  const slots = [{ root: 0, type: 'maj', beats: 4 }, { root: 5, type: 'maj', beats: 4, oct: 1 }];
  assert.deepEqual(progressionVoicings(slots, 3, 'set')[1].notes, [65, 69, 72]);
  // With voice leading, the slot is voiced as usual and then moved by its shift.
  for (const mode of ['smooth', 'nearest']) {
    const plain = progressionVoicings(slots.map((sl) => ({ ...sl, oct: 0 })), 3, mode)[1].notes;
    assert.deepEqual(progressionVoicings(slots, 3, mode)[1].notes, plain.map((n) => n + 12), mode);
  }
});

import { humanizeOffset, humanizeLevel } from '../src/core.js';

test('humanize: offsets stay within ±20 ms and a fifth of the step; off means exact', () => {
  assert.equal(humanizeOffset(0, 0.125), 0);
  let max = 0;
  for (let i = 0; i < 2000; i++) {
    const o = humanizeOffset(1, 0.125);
    max = Math.max(max, Math.abs(o));
  }
  assert.ok(max <= 0.02 && max > 0.01, `max ${max}`);
  for (let i = 0; i < 500; i++) assert.ok(Math.abs(humanizeOffset(1, 0.05)) <= 0.01); // short steps: a fifth
  assert.equal(humanizeOffset(1, 0.125, () => 0.5), 0); // centred
  assert.equal(humanizeLevel(100, 0), 100);
  for (let i = 0; i < 500; i++) {
    const v = humanizeLevel(100, 1);
    assert.ok(v >= 75 && v <= 125 && Number.isInteger(v));
    const g = humanizeLevel(1.4, 1, Math.random, 1.5);
    assert.ok(g > 0 && g <= 1.5);
  }
  assert.equal(humanizeLevel(0, 1), 0); // a muted step stays muted
});

import { modulationShift, progressionRound } from '../src/core.js';

test('modulation: the key moves every N rounds and folds back within a tritone', () => {
  const slots = [{ beats: 4 }, { beats: 4 }];
  assert.equal(progressionRound(0, slots), 0);
  assert.equal(progressionRound(8 * PPQN - 1, slots), 0);
  assert.equal(progressionRound(8 * PPQN, slots), 1);
  assert.equal(modulationShift(5, 0, 2), 0); // off
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((r) => modulationShift(r, 2, 2)), [0, 0, 2, 2, 4, 4]);
  // Up a 4th each round: 0, 5, 10 → −2, 15 → 3, …
  assert.deepEqual([0, 1, 2, 3, 4].map((r) => modulationShift(r, 1, 5)), [0, 5, -2, 3, -4]);
  assert.deepEqual([0, 1, 2].map((r) => modulationShift(r, 1, -1)), [0, -1, -2]);
  for (let r = 0; r < 50; r++) {
    const s = modulationShift(r, 1, 7);
    assert.ok(s >= -5 && s <= 6);
  }
});

test('held notes follow the progression modulation (heldShift); progression notes stay as given', () => {
  const e = new ArpSeqEngine();
  e.noteOn(60, 100);
  e.setProgressionNotes([62, 65]);
  e.heldShift = 2;
  assert.deepEqual(e.notes.map((n) => n.note).sort((a, b) => a - b), [62, 65]); // held 60 → 62, shared with the chord
  e.heldShift = 0;
  assert.deepEqual(e.notes.map((n) => n.note).sort((a, b) => a - b), [60, 62, 65]);
});
