// Breakbeat slicer: a drum break cut into slices (equal, or on detected hits)
// and re-sequenced tracker style. Pure pattern/timing helpers (unit-tested)
// plus a small player.

export const SLICE_COUNTS = [8, 16, 32];
export const BREAK_STEPS = [16, 32, 48, 64, 96, 128]; // 16ths: up to 8 bars of pattern
export const BREAK_BARS = Array.from({ length: 16 }, (_, i) => i + 1); // how long the loaded break is
export const BREAK_FX = { '': '—', rev: 'Reverse', cut: 'Cut' };
export const ROLL_TYPES = {
  R: 'R · regular',
  Rv: 'Rv · volume down',
  RV: 'RV · volume up',
  Rn: 'Rn · note down',
  RN: 'RN · note up',
  RR: 'RR · random note',
};
export const MAX_ROLL = 16;
export const MAX_TRANSIENT_SLICES = 32;

export const emptyRow = () => ({ slice: null, vol: 100, pitch: 0, chance: 100, roll: 0, rollType: 'R', fx: '' });

/** A stored row made current: old Ratchet ×2/×3/×4 effects become R rolls. */
export function migrateRow(row) {
  const out = { ...emptyRow(), ...row };
  const ratchet = { r2: 2, r3: 3, r4: 4 }[out.fx];
  if (ratchet) { out.roll = ratchet; out.rollType = 'R'; out.fx = ''; }
  if (!BREAK_FX[out.fx]) out.fx = '';
  if (!ROLL_TYPES[out.rollType]) out.rollType = 'R';
  out.chance = Math.max(0, Math.min(100, Number(out.chance ?? 100)));
  out.roll = Math.max(0, Math.min(MAX_ROLL, Math.round(Number(out.roll) || 0)));
  return out;
}

/** Playback rate that stretches a `bars`-long break to the tempo, times a pitch offset. */
export function fitRate(bufferSeconds, bars, bpm, pitch = 0, fit = true) {
  const tune = Math.pow(2, Math.min(24, Math.max(-24, pitch)) / 12);
  if (!fit) return tune;
  const target = bars * 4 * (60 / Math.max(1, bpm));
  return (bufferSeconds / target) * tune;
}

/** Slice start times for `slices` equal slices of a `duration`-second break. */
export function equalPoints(slices, duration) {
  return Array.from({ length: slices }, (_, i) => (i * duration) / slices);
}

/** Where slice `k` starts (s), forwards or in the reversed buffer. */
export function sliceOffset(k, points, duration, reverse = false) {
  const i = Math.max(0, Math.min(points.length - 1, k));
  if (!reverse) return points[i];
  const end = i + 1 < points.length ? points[i + 1] : duration;
  return Math.max(0, duration - end);
}

/** Which slice a time (s) in the break falls in. */
export function sliceAt(time, points) {
  let k = 0;
  while (k + 1 < points.length && points[k + 1] <= time) k++;
  return k;
}

/**
 * Find the hits in a break: frames of 5 ms, pre-emphasised so attacks count most,
 * an onset curve of how sharply the level jumps (in log energy over 10 ms), and
 * peaks above a local threshold that Sensitivity (0–1) lowers. Each onset is moved
 * back to the quiet point just before its rise so slices never clip an attack.
 * Returns slice start times in seconds, always starting with 0.
 */
export function detectTransients(data, rate, { sensitivity = 0.5, minGap = 0.06, max = MAX_TRANSIENT_SLICES } = {}) {
  const hop = Math.max(1, Math.round(rate * 0.005));
  const frames = Math.floor(data.length / hop);
  if (frames < 4) return [0];
  const env = new Float64Array(frames);
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) {
      const d = data[i] - 0.95 * prev;
      prev = data[i];
      e += d * d;
    }
    env[f] = Math.log10(e / hop + 1e-10);
  }
  const top = Math.max(...env);
  const floor = top - 5; // ignore anything 50 dB below the loudest moment
  const nov = new Float64Array(frames);
  for (let f = 2; f < frames; f++) {
    if (env[f] < floor) continue;
    nov[f] = Math.max(0, env[f] - Math.max(env[f - 1], env[f - 2]));
  }
  const delta = 0.15 + (1 - Math.max(0, Math.min(1, sensitivity))) * 1.1; // 1.5–12.5 dB rise
  const W = 25;
  const peaksFound = [];
  for (let f = 2; f < frames - 1; f++) {
    if (nov[f] <= 0) continue;
    let sum = 0, n = 0, isMax = true;
    for (let g = Math.max(0, f - W); g < Math.min(frames, f + W); g++) {
      sum += nov[g]; n++;
      if (Math.abs(g - f) <= 2 && nov[g] > nov[f]) isMax = false;
    }
    if (isMax && nov[f] > sum / n + delta) peaksFound.push({ f, strength: nov[f] });
  }
  // Enforce the minimum gap, keeping the stronger of two close hits.
  const gapFrames = Math.round(minGap / (hop / rate));
  const kept = [];
  for (const p of peaksFound) {
    const last = kept[kept.length - 1];
    if (last && p.f - last.f < gapFrames) {
      if (p.strength > last.strength) kept[kept.length - 1] = p;
    } else kept.push(p);
  }
  // Too many: keep the strongest.
  let chosen = kept;
  if (chosen.length > max) chosen = [...kept].sort((a, b) => b.strength - a.strength).slice(0, max).sort((a, b) => a.f - b.f);
  // Back each onset up to the quietest frame just before its rise.
  const times = chosen.map(({ f }) => {
    let g = f;
    if (f > 0 && env[f - 1] < env[f]) g = f - 1; // one 5 ms frame of lead-in protects the attack
    return (g * hop) / rate;
  });
  // Slice 1 always starts at 0; a first hit right at the start becomes that slice.
  if (!times.length || times[0] > 0.01) times.unshift(0);
  else times[0] = 0;
  return times.slice(0, max);
}

/**
 * The triggers a tracker row produces within one step of `stepDur` seconds:
 * [{at (s after the step), slice, reverse, pitch, gain}]. A roll of n splits the
 * step into n triggers, shaped by its type; Chance may skip the row (then the
 * previous slice keeps playing). [{cut: true}] for Cut; [] for an empty row.
 */
export function rowTriggers(row, stepDur, rng = Math.random, { span = 1, part = 0 } = {}) {
  if (!row) return [];
  const r = migrateRow(row);
  // Chance is decided once, where the row is; a roll carrying on doesn't roll the dice again.
  if (part === 0 && r.chance < 100 && rng() * 100 >= r.chance) return [];
  if (r.fx === 'cut') return part === 0 ? [{ at: 0, cut: true }] : [];
  if (r.slice === null || r.slice === undefined) return [];
  // Roll R = retriggers per 16th step: 1 = 16ths, 2 = 32nds, 4 = 64ths. 0 = no roll.
  const n = r.roll > 0 ? r.roll : 1;
  if (!(r.roll > 0) && part > 0) return []; // no roll: nothing to carry on
  const gain = Math.max(0, Math.min(100, r.vol)) / 100;
  // A roll held over `span` steps ramps across all of them: this is step `part` of it.
  const total = n * Math.max(1, span);
  return Array.from({ length: n }, (_, j) => {
    const i = part * n + j;
    let g = gain;
    let pitch = r.pitch;
    if (total > 1) {
      if (r.rollType === 'Rv') g = gain * ((total - i) / total);
      if (r.rollType === 'RV') g = gain * ((i + 1) / total);
      if (r.rollType === 'Rn') pitch -= i;
      if (r.rollType === 'RN') pitch += i;
      if (r.rollType === 'RR' && i > 0) pitch += Math.round(rng() * 24) - 12;
    }
    pitch = Math.max(-24, Math.min(24, pitch));
    return { at: (j * stepDur) / n, slice: r.slice, reverse: r.fx === 'rev', pitch, gain: g };
  });
}

/** A row with something on it: a slice, or a Cut. */
export const isFilled = (row) => !!row && ((row.slice !== null && row.slice !== undefined) || row.fx === 'cut');

/**
 * How many steps a roll at `idx` lasts when it holds until the next filled row
 * (wrapping round the pattern): 1 if the next row is filled, up to the pattern length.
 */
export function rollSpan(pattern, idx) {
  const n = pattern.length;
  for (let k = 1; k < n; k++) if (isFilled(pattern[(idx + k) % n])) return k;
  return n;
}

/**
 * The break as recorded: each slice on the 16th step nearest where it starts in
 * the break (`breakSteps` = the break's length in 16ths), repeating to fill.
 */
export function inOrder(steps, points, duration, breakSteps) {
  const rows = Array.from({ length: steps }, emptyRow);
  for (let rep = 0; rep * breakSteps < steps; rep++) {
    points.forEach((t, k) => {
      const i = rep * breakSteps + Math.round((t / duration) * breakSteps);
      if (i < steps && i < (rep + 1) * breakSteps && rows[i].slice === null) rows[i] = { ...rows[i], slice: k };
    });
  }
  return rows;
}

/**
 * A jungle-style rearrangement of an in-order pattern: the second half replays
 * the first, with an early snare, a roll, a reversed hit and rising rolls to finish.
 */
export function chop(base) {
  const rows = base.map((r) => ({ ...r }));
  const steps = rows.length;
  const half = Math.floor(steps / 2);
  const firstHits = rows.slice(0, half).map((r, i) => [i, r.slice]).filter(([, s]) => s !== null);
  if (!firstHits.length) return rows;
  const pick = (frac) => firstHits[Math.min(firstHits.length - 1, Math.floor(frac * firstHits.length))][1];
  for (let i = half; i < steps; i++) rows[i] = { ...rows[i], slice: rows[i - half].slice };
  const at = (i, patch) => { if (i >= 0 && i < steps) rows[i] = { ...rows[i], ...patch }; };
  const q = Math.max(1, Math.round(steps / 16));
  at(half + 4 * q, { slice: pick(0.25) });
  at(half + 6 * q, { slice: pick(0.25), roll: 2 });
  at(steps - 6 * q, { slice: pick(0.4), fx: 'rev' });
  at(steps - 2 * q, { slice: pick(0.75), roll: 3, rollType: 'RV', vol: 85 });
  at(steps - q, { slice: pick(0.75), roll: 6, rollType: 'RN', vol: 80 });
  return rows;
}

/** Random slices on the beat grid (with a seedable rng), with occasional rolls and reverses. */
export function randomize(steps, slices, rng = Math.random) {
  return Array.from({ length: steps }, (_, i) => {
    if (i % 2 !== 0 && rng() > 0.2) return emptyRow();
    const r = rng();
    return {
      ...emptyRow(),
      slice: i === 0 ? 0 : Math.floor(rng() * slices),
      fx: r < 0.08 ? 'rev' : '',
      roll: r > 0.08 && r < 0.18 ? 2 + Math.floor(rng() * 3) : 0,
      rollType: ['R', 'Rv', 'RV', 'Rn', 'RN', 'RR'][Math.floor(rng() * 6)],
      chance: rng() < 0.15 ? 50 : 100,
    };
  });
}

/** Resize a pattern to `steps` rows (truncate or pad with empty rows). */
export function resizePattern(rows, steps) {
  const out = (Array.isArray(rows) ? rows : []).slice(0, steps).map(migrateRow);
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

  /** Start the break at `offset` seconds into it (into the reversed copy if `reverse`). */
  trigger(time, { offset = 0, reverse = false, rate = 1, gain = 1, duration = null }) {
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
    src.start(t, Math.max(0, Math.min(buf.duration - 0.001, offset)));
    this.voice = { src, gain: g, level: gain, start: t };
    if (duration !== null) {
      // Play just this much of the break (in break seconds), then fade out.
      const end = t + Math.max(0.02, duration / rate);
      g.gain.setValueAtTime(gain, end - 0.004);
      g.gain.linearRampToValueAtTime(0, end);
      src.stop(end + 0.01);
    }
  }
}

// ---- trimming the loaded file

export const MIN_TRIM_SECONDS = 0.05;

/**
 * Sample range [from, to) kept by a trim of `start`..`end` (fractions 0..1 of the file),
 * at least MIN_TRIM_SECONDS long and inside the file.
 */
export function trimSamples(length, sampleRate, start = 0, end = 1) {
  const minLen = Math.min(length, Math.max(1, Math.round(MIN_TRIM_SECONDS * sampleRate)));
  let from = Math.round(Math.min(1, Math.max(0, start)) * length);
  let to = Math.round(Math.min(1, Math.max(0, end)) * length);
  if (to < from) [from, to] = [to, from];
  if (to - from < minLen) {
    to = Math.min(length, from + minLen);
    from = Math.max(0, to - minLen);
  }
  return [from, to];
}

/** Short linear fades at both ends of a trimmed channel, so the cuts don't click. */
export function fadeEdges(data, samples) {
  const n = Math.min(samples, Math.floor(data.length / 2));
  for (let i = 0; i < n; i++) {
    const g = i / n;
    data[i] *= g;
    data[data.length - 1 - i] *= g;
  }
  return data;
}
