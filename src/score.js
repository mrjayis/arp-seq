// Score player: Standard MIDI Files read into parts of notes, played through the synths
// in time with the clock. Pure helpers (unit-tested); the playing is in app.js.

/**
 * Read a Standard MIDI File (format 0 or 1). Returns
 * {ppq, tempo (µs per quarter, the first one), parts: [{name, notes: [{t, d, n, v}]}]}
 * with times in ticks. Each track is a part; a format-0 file (one track) is split by
 * MIDI channel. Drum-channel (10) notes are left out: they aren't pitches.
 */
export function parseMidi(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  let p = 0;
  const str = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(b[p + i]); p += n; return s; };
  const u32 = () => { const v = (b[p] << 24 >>> 0) + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3]; p += 4; return v; };
  const u16 = () => { const v = (b[p] << 8) + b[p + 1]; p += 2; return v; };
  const vlq = () => { let v = 0; for (let i = 0; i < 4; i++) { const c = b[p++]; v = (v << 7) | (c & 0x7f); if (!(c & 0x80)) break; } return v; };
  if (str(4) !== 'MThd') throw new Error('Not a MIDI file');
  const hdrLen = u32();
  const format = u16();
  const ntrks = u16();
  const division = u16();
  p = 8 + hdrLen;
  if (division & 0x8000) throw new Error('SMPTE-timed MIDI files are not supported');
  const ppq = division || 480;
  let tempo = null;
  const parts = [];
  for (let k = 0; k < ntrks && p < b.length; k++) {
    const id = str(4);
    const len = u32();
    const end = p + len;
    if (id !== 'MTrk') { p = end; continue; }
    let t = 0;
    let status = 0;
    let name = '';
    const open = new Map(); // `${ch}:${note}` -> [{t, v}]
    const byChannel = new Map(); // ch -> notes
    const add = (ch, note) => { if (!byChannel.has(ch)) byChannel.set(ch, []); byChannel.get(ch).push(note); };
    const close = (ch, n, at) => {
      const stack = open.get(`${ch}:${n}`);
      const on = stack?.shift();
      if (on) add(ch, { t: on.t, d: Math.max(1, at - on.t), n, v: on.v });
    };
    while (p < end) {
      t += vlq();
      let s = b[p];
      if (s & 0x80) p++; else s = status; // running status
      if (s === 0xff) {
        const type = b[p++];
        const l = vlq();
        if (type === 0x51 && l === 3 && tempo === null) tempo = (b[p] << 16) + (b[p + 1] << 8) + b[p + 2];
        if ((type === 0x03 || type === 0x04) && !name) name = new TextDecoder().decode(b.subarray(p, p + l)).trim();
        p += l;
        continue;
      }
      if (s === 0xf0 || s === 0xf7) { p += vlq(); continue; }
      status = s;
      const kind = s & 0xf0;
      const ch = s & 0x0f;
      if (kind === 0x90 || kind === 0x80) {
        const n = b[p++];
        const v = b[p++];
        if (kind === 0x90 && v > 0) {
          const key = `${ch}:${n}`;
          if (!open.has(key)) open.set(key, []);
          open.get(key).push({ t, v });
        } else close(ch, n, t);
      } else if (kind === 0xc0 || kind === 0xd0) p += 1;
      else p += 2; // 0xa0, 0xb0, 0xe0
    }
    for (const key of open.keys()) { const [ch, n] = key.split(':').map(Number); while (open.get(key)?.length) close(ch, n, t); }
    p = end;
    const channels = [...byChannel.entries()].filter(([ch]) => ch !== 9);
    if (format === 0 || channels.length > 1) {
      for (const [ch, notes] of channels) parts.push({ name: name ? `${name} (ch ${ch + 1})` : `Channel ${ch + 1}`, notes });
    } else if (channels.length === 1) {
      parts.push({ name: name || `Part ${parts.length + 1}`, notes: channels[0][1] });
    }
  }
  for (const part of parts) part.notes.sort((a, b2) => a.t - b2.t || a.n - b2.n);
  return { ppq, tempo: tempo ?? 500000, parts: parts.filter((x) => x.notes.length) };
}

/** Length of a score in ticks, rounded up to whole 4/4 bars (for looping). */
export function scoreLength(score) {
  let last = 0;
  for (const part of score.parts) for (const n of part.notes) last = Math.max(last, n.t + n.d);
  const bar = score.ppq * 4;
  return Math.max(bar, Math.ceil(last / bar) * bar);
}

/**
 * For playing a part on a monophonic voice: each note's length cut so it ends just
 * before the next note starts (chords keep their lowest note... as written, the top
 * note wins: the next onset is what matters). Returns new note objects.
 */
export function monoLengths(notes, gapTicks = 1) {
  return notes.map((n, i) => {
    let next = null;
    for (let k = i + 1; k < notes.length; k++) if (notes[k].t > n.t) { next = notes[k].t; break; }
    return next === null ? { ...n } : { ...n, d: Math.max(1, Math.min(n.d, next - n.t - gapTicks)) };
  });
}

/** Index of the first note starting at or after tick `t` (notes sorted by start). */
export function firstAtOrAfter(notes, t) {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].t < t) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** Quarter-note BPM from a MIDI tempo (µs per quarter). */
export const tempoBpm = (us) => Math.round((60000000 / us) * 10) / 10;
