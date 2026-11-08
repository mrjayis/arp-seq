import test from 'node:test';
import assert from 'node:assert/strict';
import { DRUM_PRESETS, DRUM_STEPS, VOICES, parsePattern, hitsAt } from '../src/percussion.js';

test('every preset parses to 16 steps for every voice with only known voices', () => {
  const ids = new Set(VOICES.map((v) => v.id));
  for (const [name, preset] of Object.entries(DRUM_PRESETS)) {
    for (const [id, row] of Object.entries(preset)) {
      assert.ok(ids.has(id), `${name}: unknown voice ${id}`);
      assert.equal(row.length, DRUM_STEPS, `${name}.${id} is ${row.length} steps`);
      assert.match(row, /^[Xx.]+$/, `${name}.${id}`);
    }
    const rows = parsePattern(preset);
    for (const { id } of VOICES) assert.equal(rows[id].length, DRUM_STEPS);
  }
});

test('hitsAt returns accented and normal hits, skipping muted voices', () => {
  const rows = parsePattern({ kick: 'X...x...........', claves: 'x...............' });
  assert.deepEqual(hitsAt(rows, 0), [{ id: 'kick', gain: 1 }, { id: 'claves', gain: 0.65 }]);
  assert.deepEqual(hitsAt(rows, 4), [{ id: 'kick', gain: 0.65 }]);
  assert.deepEqual(hitsAt(rows, 1), []);
  assert.deepEqual(hitsAt(rows, 16), hitsAt(rows, 0)); // wraps
  assert.deepEqual(hitsAt(rows, 0, { kick: true }), [{ id: 'claves', gain: 0.65 }]);
});

test('Bossa Nova uses the bossa clave and the dotted bass figure', () => {
  const rows = parsePattern(DRUM_PRESETS['Bossa Nova']);
  const on = (id) => rows[id].map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(on('claves'), [0, 3, 6, 10, 13]);
  assert.deepEqual(on('kick'), [0, 3, 4, 7, 8, 11, 12, 15]);
});
