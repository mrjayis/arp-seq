// iReal Pro charts: reading irealb:// (and the older irealbook://) links, as found in
// iReal Pro's exported .html files or copied links, into a chord progression.
//
// A link holds one song or a whole playlist, percent-encoded: songs are separated by
// "===", fields by "=". The chord chart of an irealb song is lightly scrambled (after
// the marker "1r34LbKcu7"), in 50-character blocks; see unscramble(). The format was
// worked out by Stephen Irons' Accompaniser and the ireal-reader / ireal-musicxml
// projects; the timing rules below follow ireal-musicxml's reading of iReal's forum notes.

const MUSIC_PREFIX = '1r34LbKcu7';

/** Every irealb:// or irealbook:// link in some text (an exported .html file, a pasted link). */
export function findLinks(text) {
  const out = [];
  const re = /(irealb(?:ook)?):\/\/([^"'<>\s]+)/g;
  let m;
  while ((m = re.exec(String(text)))) out.push({ old: m[1] === 'irealbook', body: m[2] });
  return out;
}

/** "Gentle Rain, The" → "The Gentle Rain". */
const fixTitle = (t) => t.trim().replace(/^(.*), (A|The)$/, '$2 $1');
/** iReal stores two-word composers last name first: "Coltrane John" → "John Coltrane". */
const fixComposer = (c) => {
  const parts = c.trim().split(/\s+/);
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : c.trim();
};

/**
 * Songs in some text: [{title, composer, style, key, bpm, chart}], `chart` being the
 * plain (unscrambled) chord chart. Songs that can't be read are left out.
 */
export function readSongs(text) {
  const songs = [];
  for (const { old, body } of findLinks(text)) {
    let decoded;
    try { decoded = decodeURIComponent(body); } catch { continue; }
    const parts = decoded.split('===');
    if (parts.length > 1) parts.pop(); // the playlist's name
    for (const part of parts) {
      const f = part.split('=');
      try {
        if (old) {
          if (f.length < 6) continue;
          songs.push({ title: fixTitle(f[0]), composer: fixComposer(f[1]), style: f[2].trim(), key: f[3], bpm: 0, chart: f[5] });
        } else {
          const music = f[6]?.split(MUSIC_PREFIX)[1];
          if (music === undefined) continue;
          songs.push({
            title: fixTitle(f[0]), composer: fixComposer(f[1]), style: (f[3] || '').trim(), key: f[4] || '',
            bpm: Number(f[8]) || 0, chart: unscramble(music),
          });
        }
      } catch { /* a malformed song: skip it */ }
    }
  }
  return songs;
}

/** Swap the first 5 characters with the last 5, and 10–23 with 26–39 (its own inverse). */
function obfusc50(s) {
  const c = s.split('');
  for (let i = 0; i < 5; i++) { c[49 - i] = s[i]; c[i] = s[49 - i]; }
  for (let i = 10; i < 24; i++) { c[49 - i] = s[i]; c[i] = s[49 - i]; }
  return c.join('');
}

/** Undo the scrambling: whole 50-character blocks are shuffled (a final 50 or 51 isn't). */
export function unscramble(s) {
  let r = '';
  while (s.length > 51) {
    r += obfusc50(s.slice(0, 50));
    s = s.slice(50);
  }
  r += s;
  return r.replace(/Kcl/g, '| x').replace(/LZ/g, ' |').replace(/XyQ/g, '   ');
}
/** The same shuffle, the other way (for tests and the built-in example). */
export const scramble = (plain) => {
  let s = plain;
  let r = '';
  while (s.length > 51) { r += obfusc50(s.slice(0, 50)); s = s.slice(50); }
  return r + s;
};

// ---- the chart: tokens, then measures

const CHORD_RE = /^([A-G][b#]?)((?:sus|alt|add|[+\-^\dhob#])*)(\*.+?\*)*(\/[A-G][#b]?)?(\(.*?\))?/;
const TOKENS = [
  [/^\*[a-zA-Z]/, 'section'],
  [/^T\d\d/, 'time'],
  [/^N\d/, 'ending'],
  [/^<.*?>/, 'comment'],
  [CHORD_RE, 'chord'],
  [/^W(\/[A-G][#b]?)?(\(.*?\))?/, 'same'], // an invisible root: the chord goes on (over a new bass)
  [/^ (\(.*?\))?/, 'space'],
];

function tokenize(chart) {
  const out = [];
  let s = chart;
  while (s.length) {
    let hit = null;
    for (const [re, kind] of TOKENS) {
      const m = re.exec(s);
      if (m && m[0].length) { hit = { kind, text: m[0], m }; break; }
    }
    if (!hit) hit = { kind: 'char', text: s[0] };
    out.push(hit);
    s = s.slice(hit.text.length);
  }
  return out;
}

/** Beats in a bar for iReal's time signatures (T44 = 4/4 … T12 = 12/8). */
function barBeats(t) {
  const code = t.slice(1);
  if (code === '12') return 12;
  const n = Number(code[0]);
  return n > 0 ? n : 4;
}

/**
 * The chart as written: bars of {chords: [{sym, beats}], beats, and form marks}.
 * Each chord lasts a beat plus the empty cells after it; then the bar is trimmed (from
 * the last chord back) or filled (from the first chord on) to its time signature.
 */
export function readBars(chart) {
  const bars = [];
  let beats = 4;
  let last = null; // the chord sounding, for slashes, W and empty bars
  const fresh = () => ({ cells: [], repeat: 0, marks: {}, comments: [] });
  let cur = fresh();

  const close = () => {
    const hasChord = cur.cells.some((c) => c.kind !== 'space');
    if (!hasChord && !cur.repeat) {
      // No chords: spacing, not a bar. Its marks belong to the next bar, except a
      // D.C./D.S./Fine written after the last bar line, which belongs to the bar before.
      const carry = fresh();
      for (const [k, v] of Object.entries(cur.marks)) {
        if ((k === 'jump' || k === 'fine' || k === 'endRepeat' || k === 'final' || k === 'times') && bars.length) bars[bars.length - 1][k] = v;
        else carry.marks[k] = v;
      }
      cur = carry;
      return;
    }
    let chords;
    if (cur.repeat) {
      const back = bars.slice(-cur.repeat);
      if (!back.length) { cur = fresh(); return; }
      if (cur.repeat === 2 && back.length === 2) {
        bars.push({ ...back[0], ...marksOnly(cur.marks, true), chords: back[0].chords });
        bars.push({ ...back[1], ...marksOnly(cur.marks, false), chords: back[1].chords });
        cur = fresh();
        return;
      }
      chords = back[back.length - 1].chords.map((c) => ({ ...c }));
    } else {
      chords = [];
      for (const c of cur.cells) {
        if (c.kind === 'space') { if (chords.length) chords[chords.length - 1].spaces++; continue; }
        const sym = c.kind === 'chord' ? c.sym : c.kind === 'nc' ? 'NC' : (chords[chords.length - 1]?.sym ?? last ?? 'NC');
        chords.push({ sym, spaces: 0 });
      }
      // Fit to the bar.
      if (chords.length > beats) chords.length = beats;
      let total = chords.reduce((n, c) => n + 1 + c.spaces, 0);
      // Too long: shorten from the last chord back (a waltz bar of two chords is 2 + 1).
      for (let k = chords.length - 1; total > beats; k = (k - 1 + chords.length) % chords.length) {
        if (chords[k].spaces > 0) { chords[k].spaces--; total--; }
      }
      for (let k = 0; total < beats; k = (k + 1) % chords.length) { chords[k].spaces++; total++; }
      chords = chords.map((c) => ({ sym: c.sym, beats: 1 + c.spaces }));
    }
    if (chords.length) last = chords[chords.length - 1].sym;
    bars.push({ chords, beats, ...cur.marks });
    cur = fresh();
  };
  const marksOnly = (marks, first) => (first
    ? Object.fromEntries(Object.entries(marks).filter(([k]) => k !== 'endRepeat' && k !== 'jump' && k !== 'fine'))
    : Object.fromEntries(Object.entries(marks).filter(([k]) => k !== 'startRepeat' && k !== 'section' && k !== 'ending')));

  for (const t of tokenize(chart)) {
    switch (t.kind) {
      case 'section': cur.marks.section = t.text[1]; break;
      case 'time': beats = barBeats(t.text); break;
      case 'ending': cur.marks.ending = Number(t.text[1]) || 0; break;
      case 'comment': {
        const text = t.text.slice(1, -1).trim();
        if (/D\.?\s*C\./i.test(text)) cur.marks.jump = 'dc';
        else if (/D\.?\s*S\./i.test(text)) cur.marks.jump = 'ds';
        else if (/^fine$/i.test(text)) cur.marks.fine = true;
        const times = /(\d+)\s*x\b/i.exec(text);
        if (times) cur.marks.times = Number(times[1]);
        break;
      }
      case 'chord': cur.cells.push({ kind: 'chord', sym: t.m[1] + (t.m[2] || '') + (t.m[4] || '') }); break;
      case 'same': cur.cells.push({ kind: 'same' }); break;
      case 'space': cur.cells.push({ kind: 'space' }); break;
      default: {
        const ch = t.text;
        if (ch === '|' || ch === '[' || ch === ']') close();
        else if (ch === '{') { close(); cur.marks.startRepeat = true; }
        else if (ch === '}') { cur.marks.endRepeat = true; close(); }
        else if (ch === 'Z') { cur.marks.final = true; close(); }
        else if (ch === 'p') cur.cells.push({ kind: 'same' });
        else if (ch === 'n') cur.cells.push({ kind: 'nc' });
        else if (ch === 'x') cur.repeat = 1;
        else if (ch === 'r') cur.repeat = 2;
        else if (ch === 'S') cur.marks.segno = true;
        else if (ch === 'Q') cur.marks.coda = true;
        else if (ch === 'U') cur.marks.end = true;
        // f (fermata), s/l (small/large chords), Y (spacing), commas: nothing to play
      }
    }
  }
  close();
  return bars;
}

/**
 * The bars in the order they're played, once through the form: repeats (with 1st/2nd/3rd
 * endings and "3x"), then a D.C. or D.S. back to the top or the segno, taking the last
 * ending, on to the coda or stopping at Fine.
 */
export function playOrder(bars) {
  const out = [];
  const segno = bars.findIndex((b) => b.segno);
  const codas = bars.flatMap((b, k) => (b.coda ? [k] : []));
  const toCoda = codas.length > 1 ? codas[0] : -1;
  const codaStart = codas.length > 1 ? codas[codas.length - 1] : -1;
  const jumpAt = bars.findIndex((b) => b.jump);
  // The highest ending in the repeat that starts at `start`.
  const endingsFrom = (start) => {
    let max = 0;
    for (let k = start; k < bars.length; k++) {
      if (k > start && bars[k].startRepeat) break;
      if (bars[k].ending) max = Math.max(max, bars[k].ending);
      if (bars[k].final || bars[k].jump) break;
    }
    return max;
  };
  let repeatStart = 0;
  let pass = 1;
  let jumped = false;
  let i = 0;
  for (let guard = 0; i < bars.length && guard < 5000; guard++) {
    const b = bars[i];
    if (b.startRepeat && i !== repeatStart) { repeatStart = i; pass = 1; }
    if (b.ending) {
      const want = jumped ? endingsFrom(repeatStart) : pass;
      if (b.ending !== want) {
        // Skip this ending: on to the next ending, or past the end of the repeat.
        let j = i + 1;
        while (j < bars.length && !bars[j].ending && !bars[j - 1].endRepeat) j++;
        i = j;
        continue;
      }
    }
    // A coda isn't played on the way through when the D.C./D.S. that leads to it is still to come.
    if (!jumped && jumpAt >= 0 && i === codaStart && codaStart > jumpAt) break;
    out.push(b);
    if (jumped && i === toCoda && codaStart > i) { i = codaStart; continue; }
    if (jumped && b.fine) break;
    if (b.endRepeat && !jumped) {
      const total = b.times || Math.max(2, endingsFrom(repeatStart));
      if (pass < total) { pass++; i = repeatStart; continue; }
    }
    if (b.jump && !jumped) {
      jumped = true;
      i = b.jump === 'ds' && segno >= 0 ? segno : 0;
      repeatStart = i;
      pass = 1;
      continue;
    }
    if (b.end && (jumped || jumpAt < 0)) break;
    i++;
  }
  return out;
}

// ---- chord symbols

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pcOf = (name) => (PC[name[0]] + (name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0) + 12) % 12;

// iReal's chord qualities, as this app's chord types.
const QUALITIES = {
  '': 'maj', 5: 'maj', 2: 'sus2', add9: 'add9', '+': 'aug', o: 'dim', h: 'hdim7', sus: 'sus4', '^': 'maj7',
  '-': 'min', '^7': 'maj7', '-7': 'min7', 7: 'dom7', '7sus': 'dom7sus4', h7: 'hdim7', o7: 'dim7', '^9': 'maj9',
  '^13': 'maj9', 6: 'maj6', 69: 'six9', '^7#11': 'maj7s11', '^9#11': 'maj7s11', '^7#5': 'maj7s5', '-6': 'min6',
  '-69': 'min6', '-^7': 'minmaj7', '-^9': 'minmaj7', '-9': 'min9', '-11': 'min11', '-7b5': 'hdim7', h9: 'hdim7',
  '-b6': 'min', '-#5': 'min', 9: 'dom9', '7b9': 'dom7b9', '7#9': 'dom7s9', '7#11': 'dom7s11', '7b5': 'dom7b5',
  '7#5': 'aug7', '9#11': 'dom7s11', '9b5': 'dom7b5', '9#5': 'aug7', '7b13': 'dom7b9', '7#9#5': 'alt', '7#9b5': 'alt',
  '7#9#11': 'dom7s9', '7b9#11': 'dom7b9', '7b9b5': 'alt', '7b9#5': 'alt', '7b9#9': 'alt', '7b9b13': 'alt',
  '7alt': 'alt', 13: 'dom13', '13#11': 'dom13', '13b9': 'dom7b9', '13#9': 'dom7s9', '7b9sus': 'dom7sus4',
  '7susadd3': 'dom7sus4', '9sus': 'dom7sus4', '13sus': 'dom7sus4', '7b13sus': 'dom7sus4', 11: 'dom7sus4',
};

/** A quality iReal didn't list exactly: the nearest of this app's types. */
function nearestQuality(q) {
  if (q.startsWith('-')) {
    if (q.includes('^')) return 'minmaj7';
    if (q.includes('b5')) return 'hdim7';
    if (q.includes('9') || q.includes('11')) return 'min9';
    if (q.includes('7')) return 'min7';
    if (q.includes('6')) return 'min6';
    return 'min';
  }
  if (q.startsWith('h')) return 'hdim7';
  if (q.startsWith('o')) return q.includes('7') ? 'dim7' : 'dim';
  if (q.startsWith('^')) return q.includes('#11') ? 'maj7s11' : q.includes('9') || q.includes('13') ? 'maj9' : 'maj7';
  if (q.includes('alt')) return 'alt';
  if (q.includes('sus')) return /\d/.test(q) ? 'dom7sus4' : 'sus4';
  if (/^(7|9|11|13)/.test(q)) {
    if (q.includes('b9')) return 'dom7b9';
    if (q.includes('#9')) return 'dom7s9';
    if (q.startsWith('13')) return 'dom13';
    if (q.startsWith('9')) return 'dom9';
    return 'dom7';
  }
  if (q.startsWith('6')) return 'maj6';
  if (q.startsWith('+')) return q.includes('7') ? 'aug7' : 'aug';
  return 'maj';
}

/** "Bb7b9/D" → {root: 10, type: 'dom7b9', bass: 2, flat: true}; "NC" → null. */
export function readChord(sym) {
  const m = CHORD_RE.exec(sym);
  if (!m) return null;
  const q = (m[2] || '').replace(/\*.*?\*/g, '');
  return {
    root: pcOf(m[1]),
    type: QUALITIES[q] ?? nearestQuality(q),
    bass: m[4] ? pcOf(m[4].slice(1)) : null,
    flat: m[1][1] === 'b', // spelled with a flat, so it can be shown that way (Bb, not A#)
  };
}

/**
 * A song as progression slots: [{root, type, beats, bass, flat}] in play order, a chord held
 * across bars as one slot. Also the bar count and the beats in the first bar.
 */
export function songSlots(song) {
  const bars = playOrder(readBars(song.chart));
  const slots = [];
  for (const bar of bars) {
    for (const { sym, beats } of bar.chords) {
      const chord = sym === 'NC' ? null : readChord(sym);
      const slot = chord
        ? { root: chord.root, type: chord.type, beats, bass: chord.bass, flat: chord.flat }
        : { root: 0, type: 'rest', beats, bass: null, flat: false };
      const prev = slots[slots.length - 1];
      if (prev && prev.root === slot.root && prev.type === slot.type && prev.bass === slot.bass) prev.beats += beats;
      else slots.push(slot);
    }
  }
  return { slots, bars: bars.length, barBeats: bars[0]?.beats || 4 };
}

/** A small built-in chart to try (the changes, in iReal's notation). */
export const EXAMPLE_SONGS = [
  {
    title: 'Giant Steps', composer: 'John Coltrane', style: 'Up Tempo Swing', key: 'B', bpm: 0,
    chart: '[T44B^7 D7 |G^7 Bb7 |Eb^7   |A-7 D7 |G^7 Bb7 |Eb^7 F#7 |B^7   |F-7 Bb7 |'
      + 'Eb^7   |A-7 D7 |G^7   |C#-7 F#7 |B^7   |F-7 Bb7 |Eb^7   |C#-7 F#7 Z',
  },
];
