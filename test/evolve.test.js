import test from 'node:test';
import assert from 'node:assert/strict';
import { prng, barRng, evolveDrums, evolveBreakRow } from '../src/evolve.js';

test('per-bar randomness is repeatable for a bar and differs between bars', () => {
  const a = barRng(42, 3); const b = barRng(42, 3); const c = barRng(42, 4);
  const seq = (r) => Array.from({ length: 5 }, r);
  assert.deepEqual(seq(a), seq(b));
  assert.notDeepEqual(seq(barRng(42, 3)), seq(c));
  const r = prng(1);
  for (let i = 0; i < 1000; i++) { const v = r(); assert.ok(v >= 0 && v < 1); }
});

test('evolveDrums keeps accents, never edits the input, and varies more with more amount', () => {
  const rows = {
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    hat: [0.65, 0, 0.65, 0, 0.65, 0, 0.65, 0, 0.65, 0, 0.65, 0, 0.65, 0, 0.65, 0],
  };
  const frozen = JSON.stringify(rows);
  assert.equal(evolveDrums(rows, 0, Math.random), rows);
  const diff = (amount) => {
    let changed = 0;
    for (let bar = 0; bar < 50; bar++) {
      const e = evolveDrums(rows, amount, barRng(9, bar));
      assert.deepEqual(e.kick, rows.kick, 'accents must stay');
      changed += e.hat.filter((v, i) => v !== rows.hat[i]).length;
    }
    return changed;
  };
  const low = diff(0.2);
  const high = diff(1);
  assert.equal(JSON.stringify(rows), frozen);
  assert.ok(low > 0 && high > low * 2, `low ${low}, high ${high}`);
});

test('evolveBreakRow varies filled rows, rarely fills empty ones, and respects Cut', () => {
  const row = { slice: 3, vol: 100, pitch: 0, chance: 100, roll: 0, rollType: 'R', fx: '' };
  let changed = 0;
  for (let i = 0; i < 400; i++) if (JSON.stringify(evolveBreakRow(row, 1, barRng(5, i), 16)) !== JSON.stringify(row)) changed++;
  assert.ok(changed > 100 && changed < 250, `${changed}`);
  assert.equal(evolveBreakRow(row, 0, Math.random, 16), row);
  const cut = { ...row, slice: null, fx: 'cut' };
  for (let i = 0; i < 100; i++) assert.equal(evolveBreakRow(cut, 1, barRng(1, i), 16).slice, null);
  for (let i = 0; i < 200; i++) {
    const e = evolveBreakRow({ ...row, slice: null }, 1, barRng(2, i), 16);
    assert.ok(e.slice === null || (e.slice >= 0 && e.slice < 16));
  }
});
