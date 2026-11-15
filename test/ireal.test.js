import test from 'node:test';
import assert from 'node:assert/strict';
import { readSongs, unscramble, scramble, readBars, playOrder, readChord, songSlots, EXAMPLE_SONGS } from '../src/ireal.js';

// A chart in iReal's stored form: its shorthands, then scrambled, inside an irealb:// link.
const GIANT = EXAMPLE_SONGS[0].chart;
const stored = (chart) => scramble(chart.replace(/ \|/g, 'LZ').replace(/ {3}/g, 'XyQ'));
const link = (songs, name) => `irealb://${encodeURIComponent(songs.map((s) => `${s.title}=${s.composer}==${s.style}=${s.key}==1r34LbKcu7${stored(s.chart)}=Medium Swing=${s.bpm}=3`).join('===') + (name ? `===${name}` : ''))}`;
const names = (bars) => bars.map((b) => b.chords.map((c) => `${c.sym}:${c.beats}`).join(' '));

test('scrambling is undone exactly, shorthands included', () => {
  const s = stored(GIANT);
  assert.notEqual(s.slice(0, 50), GIANT.slice(0, 50)); // it really is shuffled
  assert.equal(unscramble(s).replace(/ {3}/g, '   '), GIANT.replace(/ \|/g, ' |'));
  assert.deepEqual(names(readBars(unscramble(s))), names(readBars(GIANT)));
});

test('songs are found in an exported page, playlist name dropped, titles tidied', () => {
  const page = `<html><body><a href="${link([
    { ...EXAMPLE_SONGS[0], composer: 'Coltrane John', bpm: 286 },
    { title: 'Gentle Rain, The', composer: 'Bonfa Luiz', style: 'Bossa Nova', key: 'A-', bpm: 0, chart: '[T44A-^7   |A-7   Z' },
  ], 'My list')}">My list</a></body></html>`;
  const songs = readSongs(page);
  assert.deepEqual(songs.map((s) => [s.title, s.composer, s.bpm]), [['Giant Steps', 'John Coltrane', 286], ['The Gentle Rain', 'Luiz Bonfa', 0]]);
});

test('Giant Steps: 26 changes over 16 bars, two beats or four each', () => {
  const [song] = readSongs(link([EXAMPLE_SONGS[0]]));
  const { slots, bars } = songSlots(song);
  assert.equal(bars, 16);
  assert.equal(slots.length, 26);
  assert.equal(slots.reduce((n, s) => n + s.beats, 0), 64);
  assert.deepEqual(slots.slice(0, 5).map((s) => [s.root, s.type, s.beats]),
    [[11, 'maj7', 2], [2, 'dom7', 2], [7, 'maj7', 2], [10, 'dom7', 2], [3, 'maj7', 4]]);
  assert.deepEqual(slots.at(-2).root, 1); // C#m7
  assert.equal(slots.at(-2).type, 'min7');
});

test('chords: one beat each plus the empty cells after; filled out to the bar', () => {
  assert.deepEqual(names(readBars('[T44C^7 D-7 |E-7,A7,D-7,G7|C^7 |F7   Z')),
    ['C^7:2 D-7:2', 'E-7:1 A7:1 D-7:1 G7:1', 'C^7:4', 'F7:4']);
  // 3/4 time
  assert.deepEqual(names(readBars('[T34C^7   |D-7 G7 Z')), ['C^7:3', 'D-7:2 G7:1']);
  // a slash repeats the chord; W keeps it going over a new bass
  assert.deepEqual(names(readBars('[T44C^7 p |W/E   Z')), ['C^7:2 C^7:2', 'C^7:4']);
});

test('bar repeat signs: x repeats one bar, r two', () => {
  const plain = unscramble('[T44C^7XyQKclLZD-7 G7LZr|XyQ|E-7XyQZ');
  assert.deepEqual(names(readBars(plain)), ['C^7:4', 'C^7:4', 'D-7:2 G7:2', 'C^7:4', 'D-7:2 G7:2', 'E-7:4']);
});

test('repeats with first and second endings', () => {
  const order = playOrder(readBars('{T44C^7   |D-7   |N1G7   |C^7   }|N2G7   |F^7   Z'));
  assert.deepEqual(order.map((b) => b.chords[0].sym), ['C^7', 'D-7', 'G7', 'C^7', 'C^7', 'D-7', 'G7', 'F^7']);
  // "3x" plays the repeat three times
  const thrice = playOrder(readBars('{T44C^7   |G7  <3x>}|F^7   Z'));
  assert.deepEqual(thrice.map((b) => b.chords[0].sym), ['C^7', 'G7', 'C^7', 'G7', 'C^7', 'G7', 'F^7']);
});

test('D.C. al Coda: back to the top, then from the coda sign to the coda', () => {
  const order = playOrder(readBars('[T44C^7   |D-7   Q|G7   |C^7  <D.C. al Coda>Z Y[QF^7   |C^7   Z'));
  assert.deepEqual(order.map((b) => b.chords[0].sym), ['C^7', 'D-7', 'G7', 'C^7', 'C^7', 'D-7', 'F^7', 'C^7']);
  // D.S. al Fine: from the segno, stopping at Fine
  const fine = playOrder(readBars('[T44C^7   |SD-7   |G7  <Fine>|A-7   |D7  <D.S. al Fine>Z'));
  assert.deepEqual(fine.map((b) => b.chords[0].sym), ['C^7', 'D-7', 'G7', 'A-7', 'D7', 'D-7', 'G7']);
});

test('chord symbols become the nearest chord type', () => {
  const t = (s) => { const c = readChord(s); return [c.root, c.type, c.bass]; };
  assert.deepEqual(t('Bb7b9/D'), [10, 'dom7b9', 2]);
  assert.deepEqual(t('F#h7'), [6, 'hdim7', null]);
  assert.deepEqual(t('C-7b5'), [0, 'hdim7', null]);
  assert.deepEqual(t('Ebo7'), [3, 'dim7', null]);
  assert.deepEqual(t('G7alt'), [7, 'alt', null]);
  assert.deepEqual(t('A-^7'), [9, 'minmaj7', null]);
  assert.deepEqual(t('D7#9#5'), [2, 'alt', null]);
  assert.deepEqual(t('C69'), [0, 'six9', null]);
  assert.deepEqual(t('E7sus'), [4, 'dom7sus4', null]);
  assert.deepEqual(t('Ab'), [8, 'maj', null]);
  assert.deepEqual(t('Cb^7'), [11, 'maj7', null]);
  assert.deepEqual(t('D-11'), [2, 'min11', null]);
  assert.deepEqual(t('G13b9#11'), [7, 'dom7b9', null]); // not listed: nearest
});

test('a held chord across bars is one slot; N.C. is a rest', () => {
  const { slots } = songSlots({ chart: '[T44C^7   | x  |n   |D-7 G7 Z' });
  assert.deepEqual(slots.map((s) => [s.type, s.beats]), [['maj7', 8], ['rest', 4], ['min7', 2], ['dom7', 2]]);
});

test('the older irealbook:// links are read too', () => {
  const songs = readSongs(`irealbook://${encodeURIComponent('Blues=Somebody=Medium Swing=F=n=[T44F7   |Bb7   |F7   |C7   Z')}`);
  assert.equal(songs.length, 1);
  assert.equal(songSlots(songs[0]).slots.length, 4);
});
