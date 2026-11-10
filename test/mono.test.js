import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stepAction, writeStep, backStep, stepLabel, pulseSeries, noteStep, restStep, holdStep, MAX_MONO_STEPS,
} from '../src/mono.js';

const C3 = 48;

test('steps: notes retrigger, legato slides, ties hold, rests stop', () => {
  const seq = [noteStep(C3), holdStep(), noteStep(C3 + 3, true), noteStep(C3 + 7), restStep()];
  const a = (i) => stepAction(seq, i);
  assert.deepEqual(a(0), { type: 'note', note: C3, release: false }); // next step holds it
  assert.deepEqual(a(1), { type: 'hold', release: false }); // next is a legato note
  assert.deepEqual(a(2), { type: 'legato', note: C3 + 3, release: true });
  assert.deepEqual(a(3), { type: 'note', note: C3 + 7, release: true });
  assert.deepEqual(a(4), { type: 'rest', release: false });
  // A tie or legato after a rest has nothing to continue: hold is a rest, legato a fresh note.
  const after = [restStep(), holdStep(), noteStep(C3, true)];
  assert.equal(stepAction(after, 1).type, 'rest');
  assert.equal(stepAction(after, 2).type, 'note');
  // Wraps around: the last step sees the first as next.
  assert.equal(stepAction([noteStep(C3), noteStep(C3 + 2)], 1).release, true);
  assert.equal(stepAction([], 0).type, 'rest');
});

test('writing, overwriting and deleting steps', () => {
  let { seq, cursor } = writeStep([], 0, noteStep(C3));
  ({ seq, cursor } = writeStep(seq, cursor, restStep()));
  ({ seq, cursor } = writeStep(seq, cursor, noteStep(C3 + 5)));
  assert.equal(seq.length, 3);
  assert.equal(cursor, 3);
  ({ seq, cursor } = writeStep(seq, 1, noteStep(C3 + 12))); // overwrite step 2
  assert.deepEqual(seq.map((s) => s.n), [C3, C3 + 12, C3 + 5]);
  assert.equal(cursor, 2);
  ({ seq, cursor } = backStep(seq, 3));
  assert.deepEqual(seq.map((s) => s.n), [C3, C3 + 12]);
  assert.equal(cursor, 2);
  assert.deepEqual(backStep(seq, 0), { seq, cursor: 0 });
  let full = Array.from({ length: MAX_MONO_STEPS }, () => noteStep(C3));
  const r = writeStep(full, MAX_MONO_STEPS, noteStep(C3 + 1));
  assert.equal(r.seq.length, MAX_MONO_STEPS); // can't grow past the limit
});

test('step labels and the sub pulse wave', () => {
  const name = (n) => `N${n}`;
  assert.equal(stepLabel(noteStep(50), name), 'N50');
  assert.equal(stepLabel(restStep(), name), 'rest');
  assert.equal(stepLabel(holdStep(), name), 'tie');
  const { real, imag } = pulseSeries(0.25, 8);
  assert.equal(real.length, 9);
  assert.equal(real[0], 0);
  assert.ok(Math.abs(imag[2] - (1 - Math.cos(Math.PI)) / (2 * Math.PI)) < 1e-6);
});
