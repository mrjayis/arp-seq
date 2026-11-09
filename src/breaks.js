// Breakbeat slicer: a drum break cut into equal slices, re-sequenced tracker
// style. Pure pattern/timing helpers (unit-tested) plus a small player.

export const SLICE_COUNTS = [8, 16, 32];
export const BREAK_STEPS = [16, 32];
export const BREAK_BARS = [1, 2, 4];
export const BREAK_FX = { '': '—', rev: 'Reverse', r2: 'Ratchet ×2', r3: 'Ratchet ×3', r4: 'Ratchet ×4', cut: 'Cut' };

export const emptyRow = () => ({ slice: null, vol: 100, pitch: 0, fx: '' });

/** Playback rate that stretches a `bars`-long break to the tempo, times a pitch offset. */
export function fitRate(bufferSeconds, bars, bpm, pitch = 0, fit = true) {
  const tune = Math.pow(2, Math.min(24, Math.max(-24, pitch)) / 12);
  if (!fit) return tune;
  const target = bars * 4 * (60 / Math.max(1, bpm));
  return (bufferSeconds / target) * tune;
}

/** Start time (s, in the buffer) of a slice, forwards or in the reversed buffer. */
export function sliceStart(slice, slices, duration, reverse = false) {
  const len = duration / slices;
  return reverse ? duration - (slice + 1) * len : slice * len;
}

/**
 * The triggers a tracker row produces within one step of `stepDur` seconds:
 * [{at (s after the step), slice, reverse, pitch, gain}] — several for a ratchet,
 * [{cut: true}] for Cut, [] for an empty row (the previous slice keeps playing).
 */
export function rowTriggers(row, stepDur) {
  if (!row) return [];
  if (row.fx === 'cut') return [{ at: 0, cut: true }];
  if (row.slice === null || row.slice === undefined) return [];
  const n = { r2: 2, r3: 3, r4: 4 }[row.fx] || 1;
  const gain = Math.max(0, Math.min(100, row.vol ?? 100)) / 100;
  return Array.from({ length: n }, (_, i) => ({
    at: (i * stepDur) / n,
    slice: row.slice,
    reverse: row.fx === 'rev',
    pitch: row.pitch || 0,
    gain,
  }));
}

/** Slices in order, spread evenly over the pattern (the break as recorded). */
export function inOrder(steps, slices) {
  const every = steps / Math.min(steps, slices);
  return Array.from({ length: steps }, (_, i) => ({
    ...emptyRow(),
    slice: i % every === 0 ? Math.floor(i / every) % slices : null,
  }));
}

/**
 * A jungle-style rearrangement: the first half of the break, then repeats,
 * a stutter, a reversed hit and a snare-roll ratchet at the end.
 */
export function chop(steps, slices) {
  const rows = inOrder(steps, slices);
  const every = steps / Math.min(steps, slices);
  const at = (i, patch) => { if (i < steps) rows[i] = { ...rows[i], ...patch }; };
  const s = (k) => Math.min(slices - 1, Math.round((k / 16) * slices));
  const half = Math.floor(steps / 2);
  // Second half: replay the first quarter, then a rearranged run.
  for (let i = half; i < steps; i += every) at(i, { slice: rows[i - half].slice });
  at(half + every * 2, { slice: s(4) }); // snare early
  at(half + every * 3, { slice: s(4), fx: 'r2' });
  at(steps - every * 3, { slice: s(6), fx: 'rev' });
  at(steps - every * 2, { slice: s(12), fx: 'r3', vol: 85 });
  at(steps - every, { slice: s(12), fx: 'r4', vol: 75 });
  return rows;
}

/** Random slices on the beat grid (with a seedable rng), occasional ratchets and reverses. */
export function randomize(steps, slices, rng = Math.random) {
  const every = Math.max(1, steps / Math.min(steps, slices));
  return Array.from({ length: steps }, (_, i) => {
    if (i % every !== 0 && rng() > 0.2) return emptyRow();
    const r = rng();
    return {
      ...emptyRow(),
      slice: i === 0 ? 0 : Math.floor(rng() * slices),
      fx: r < 0.08 ? 'rev' : r < 0.16 ? 'r2' : r < 0.2 ? 'r3' : '',
    };
  });
}

/** Resize a pattern to `steps` rows (truncate or pad with empty rows). */
export function resizePattern(rows, steps) {
  const out = (Array.isArray(rows) ? rows : []).slice(0, steps).map((r) => ({ ...emptyRow(), ...r }));
  while (out.length < steps) out.push(emptyRow());
  return out;
}

/** Downsample a buffer channel to min/max pairs for drawing a waveform. */
export function peaks(data, columns) {
  const out = [];
  const per = Math.max(1, Math.floor(data.length / columns));
  for (let c = 0; c < columns; c++) {
    let lo = 0, hi = 0;
    for (let i = c * per; i < Math.min(data.length, (c + 1) * per); i++) {
      if (data[i] < lo) lo = data[i];
      if (data[i] > hi) hi = data[i];
    }
    out.push([lo, hi]);
  }
  return out;
}

/** Plays slices of one break, one at a time (each trigger cuts the last, like a tracker channel). */
export class BreakPlayer {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.connect(destination);
    this.buffer = null;
    this.reversed = null;
    this.voice = null;
  }

  setLevel(v) {
    this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setBuffer(buffer) {
    this.buffer = buffer;
    if (!buffer) { this.reversed = null; return; }
    const rev = this.ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const src = buffer.getChannelData(c);
      const dst = rev.getChannelData(c);
      for (let i = 0, n = src.length; i < n; i++) dst[i] = src[n - 1 - i];
    }
    this.reversed = rev;
  }

  /** Fade out whatever is playing, at `time`. */
  stop(time) {
    const v = this.voice;
    if (!v) return;
    const t = Math.max(time, v.start + 0.001);
    v.gain.gain.setValueAtTime(v.level, t);
    v.gain.gain.linearRampToValueAtTime(0, t + 0.004);
    try { v.src.stop(t + 0.01); } catch { /* already stopped */ }
    this.voice = null;
  }

  trigger(time, { slice, slices, reverse = false, rate = 1, gain = 1 }) {
    if (!this.buffer) return;
    const t = Math.max(time, this.ctx.currentTime);
    this.stop(t);
    const buf = reverse ? this.reversed : this.buffer;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    // A 2 ms fade-in so slices that start mid-waveform don't click.
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.002);
    src.connect(g).connect(this.out);
    src.start(t, sliceStart(slice, slices, buf.duration, reverse));
    this.voice = { src, gain: g, level: gain, start: t };
  }
}
