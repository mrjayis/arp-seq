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

import { KITS, KIT_ORDER, DrumSynth } from '../src/percussion.js';

test('every kit has unique voices with sounds and valid 16-step presets', () => {
  assert.deepEqual([...KIT_ORDER].sort(), Object.keys(KITS).sort());
  const seen = new Set();
  for (const key of KIT_ORDER) {
    const { voices, presets } = KITS[key];
    const ids = new Set(voices.map((v) => v.id));
    for (const { id, gm } of voices) {
      assert.ok(!seen.has(id), `${id} used by two kits`);
      seen.add(id);
      // "Your samples" rows play loaded recordings; every other row needs a synth voice.
      if (key === 'user') assert.equal(typeof DrumSynth.prototype.playSample, 'function');
      else assert.equal(typeof DrumSynth.prototype[id], 'function', `${key}: no sound for ${id}`);
      assert.ok(gm >= 35 && gm <= 81, `${id} GM note ${gm}`);
    }
    assert.ok(Object.keys(presets).length >= 3, `${key} presets`);
    for (const [name, preset] of Object.entries(presets)) {
      for (const [id, row] of Object.entries(preset)) {
        assert.ok(ids.has(id), `${key}/${name}: ${id} is not in this kit`);
        assert.equal(row.length, DRUM_STEPS, `${key}/${name}.${id}`);
        assert.match(row, /^[Xx.]+$/);
      }
      const rows = parsePattern(preset, voices);
      assert.deepEqual(Object.keys(rows).sort(), [...ids].sort());
    }
  }
});

test('hitsAt reads the given kit', () => {
  const { voices, presets } = KITS[808];
  const rows = parsePattern(presets.House, voices);
  assert.deepEqual(hitsAt(rows, 0, {}, voices).map((h) => h.id), ['bd808', 'ch808']);
  assert.deepEqual(hitsAt(rows, 2, {}, voices).map((h) => h.id), ['oh808']);
  assert.deepEqual(hitsAt(rows, 4, { cp808: true }, voices).map((h) => h.id), ['bd808', 'ch808']);
});

import { matchSlot, assignSamples, VOICES_USER } from '../src/percussion.js';

test('sample files are matched to rows by name', () => {
  const cases = {
    'LinnDrum Kick.wav': 'u_kick', 'BD.WAV': 'u_kick', 'linn_bass_drum.aif': 'u_kick',
    'LD_Snare_1.wav': 'u_snare', 'SD2.wav': 'u_snare',
    'Linn Sidestick.wav': 'u_rim', 'RIMSHOT.WAV': 'u_rim',
    'Clap.wav': 'u_clap',
    'HHCLOSED.WAV': 'u_chh', 'Hi-Hat closed.wav': 'u_chh', 'chh.wav': 'u_chh', 'hihat.wav': 'u_chh',
    'HHOPEN.WAV': 'u_ohh', 'Open Hat.wav': 'u_ohh', 'ohh.wav': 'u_ohh',
    'Tom Hi.wav': 'u_tomhi', 'TOM1.WAV': 'u_tomhi', 'High Tom.wav': 'u_tomhi',
    'Tom Lo.wav': 'u_tomlo', 'tom3.wav': 'u_tomlo', 'Floor Tom.wav': 'u_tomlo',
    'Tambourine.wav': 'u_tamb', 'CABASA.WAV': 'u_cabasa', 'Cowbell.wav': 'u_cowbell',
    'Crash.wav': 'u_cymbal', 'Ride.wav': 'u_cymbal',
    'Conga Hi.wav': null, 'tom2.wav': null,
    // First three letters decide: a clap is never a hi-hat, whatever follows.
    'CLAP.WAV': 'u_clap', 'Clap ch1.wav': 'u_clap', 'CLAP HH.wav': 'u_clap', 'Claps hat.wav': 'u_clap',
    'CHH.WAV': 'u_chh', 'CH1.wav': 'u_chh', 'HHC.wav': 'u_chh', 'Closed.wav': 'u_chh',
    'OHH.WAV': 'u_ohh', 'HHO.wav': 'u_ohh', 'Open.wav': 'u_ohh',
    '01 Kick.wav': 'u_kick', 'LM1 SNARE.WAV': 'u_snare', 'SSTICK.WAV': 'u_rim',
    'TOMH.WAV': 'u_tomhi', 'TOML.WAV': 'u_tomlo', 'TOMM.WAV': null,
    'Chimes.wav': null, 'CONGAL.WAV': null,
    // Open/closed written after the word.
    'Hat Open.wav': 'u_ohh', 'HiHat Open.wav': 'u_ohh', 'HH Open.wav': 'u_ohh', 'Hihat O.wav': 'u_ohh',
    'Hat Closed.wav': 'u_chh', 'HH Closed.wav': 'u_chh', 'HiHat.wav': 'u_chh', 'HHOP.WAV': 'u_ohh', 'HHCL.WAV': 'u_chh',
  };
  for (const [file, slot] of Object.entries(cases)) assert.equal(matchSlot(file), slot, file);
});

test('assignSamples fills named rows, then empty rows, and reports what did not fit', () => {
  const f = (name) => ({ name });
  const { assigned, leftover } = assignSamples(
    [f('Kick.wav'), f('Conga Hi.wav'), f('Snare.wav'), f('Kick 2.wav')],
    new Set(['u_rim']),
  );
  const map = Object.fromEntries(assigned.map(([slot, file]) => [slot, file.name]));
  assert.equal(map.u_kick, 'Kick.wav');
  assert.equal(map.u_snare, 'Snare.wav');
  // Unrecognised files go to the first empty rows (Rimshot is already filled).
  assert.equal(map.u_clap, 'Conga Hi.wav');
  assert.equal(map.u_chh, 'Kick 2.wav');
  assert.equal(leftover.length, 0);
  // A prefix shared by the whole batch is skipped before the first three letters.
  const linn = assignSamples([f('LD_CLAP.wav'), f('LD_HHCL.wav'), f('LD_KICK.wav')]);
  assert.deepEqual(Object.fromEntries(linn.assigned.map(([s, x]) => [x.name, s])),
    { 'LD_CLAP.wav': 'u_clap', 'LD_HHCL.wav': 'u_chh', 'LD_KICK.wav': 'u_kick' });
  const many = assignSamples(Array.from({ length: 14 }, (_, i) => f(`x${i}.wav`)));
  assert.equal(many.assigned.length, VOICES_USER.length);
  assert.equal(many.leftover.length, 2);
});

import { mapPreset } from '../src/percussion.js';

test('the Latin rhythms play on the 808 with its congas, claves and maracas', () => {
  const k808 = KITS[808];
  for (const name of Object.keys(DRUM_PRESETS)) assert.ok(k808.presets[name], `808 has ${name}`);
  const latin = DRUM_PRESETS['Bossa Nova'];
  const on808 = k808.presets['Bossa Nova'];
  assert.equal(on808.cl808, latin.claves);
  assert.equal(on808.bd808, latin.kick);
  assert.equal(on808.lc808, latin.congaLo);
  // Mambo's bongo and conga parts share the mid conga: merged, stronger hit wins.
  const mambo = k808.presets.Mambo;
  assert.equal(mambo.mc808.length, DRUM_STEPS);
  const rows = parsePattern(mambo, k808.voices);
  const hits = (id) => rows[id].map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(hits('cb808'), [0, 2, 4, 6, 8, 10, 12, 14]);
  assert.deepEqual(mapPreset({ a: 'x.X.', b: 'X.x.' }, { a: 't', b: 't' }), { t: 'X.X.' });
  assert.deepEqual(mapPreset({ a: 'x...', z: 'X...' }, { a: 't' }), { t: 'x...' });
});
