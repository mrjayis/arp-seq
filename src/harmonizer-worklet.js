// An H949-style Harmonizer as an AudioWorklet: mono in, stereo out.
// Modes (the `mode` parameter):
//   0 Pitch      two read taps sweep a short window and crossfade (sin² / cos²), the way the
//                original spliced; Feedback sends the shifted sound round again (spirals).
//   1 Deglitch   the same with a longer, equal-power splice: smoother, less warble.
//   2 Reverse    each grain is read backwards at the new pitch.
//   3 Random     each splice lands at a random point in the window: scattered, glassy.
//   4 Delay      a plain delay with feedback; Spread offsets left and right in time.
//   5 Flange     a short delay swept by a slow triangle: Delay = depth, Grain = sweep time.
//   6 Repeat     loops the last `delay` of sound forever (input muted while held);
//                Pitch changes the loop's speed.
// Spread pulls left and right apart in pitch (cents) — "micro-pitch" — in the pitch modes.

const MAX_SECONDS = 2;

class Harmonizer extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'mode', defaultValue: 0, minValue: 0, maxValue: 6, automationRate: 'k-rate' },
      { name: 'pitch', defaultValue: 0, minValue: -24, maxValue: 24, automationRate: 'k-rate' }, // semitones
      { name: 'spread', defaultValue: 0, minValue: 0, maxValue: 100, automationRate: 'k-rate' }, // cents (or ms ×0.1)
      { name: 'delay', defaultValue: 0.03, minValue: 0, maxValue: 1, automationRate: 'k-rate' }, // seconds
      { name: 'feedback', defaultValue: 0, minValue: 0, maxValue: 0.95, automationRate: 'k-rate' },
      { name: 'grain', defaultValue: 0.06, minValue: 0.01, maxValue: 0.2, automationRate: 'k-rate' }, // seconds
    ];
  }

  constructor() {
    super();
    this.size = Math.ceil(MAX_SECONDS * sampleRate);
    this.buf = new Float32Array(this.size);
    this.w = 0;
    this.phase = [0, 0];
    this.jitter = [[0, 0], [0, 0]]; // Random mode: extra delay per channel per tap
    this.fb = 0;
    this.damp = 0;
    this.lfo = 0;
    this.mode = -1;
    this.loop = null; // Repeat: {start, len, pos}
  }

  read(d) {
    let pos = this.w - d;
    pos -= Math.floor(pos / this.size) * this.size;
    const i = Math.floor(pos);
    const f = pos - i;
    const a = this.buf[i % this.size];
    const b = this.buf[(i + 1) % this.size];
    return a + (b - a) * f;
  }

  at(pos) {
    pos -= Math.floor(pos / this.size) * this.size;
    const i = Math.floor(pos);
    const f = pos - i;
    return this.buf[i % this.size] + (this.buf[(i + 1) % this.size] - this.buf[i % this.size]) * f;
  }

  process(inputs, outputs, params) {
    const input = inputs[0];
    const out = outputs[0];
    const n = out[0].length;
    const mode = Math.round(params.mode[0]);
    const semis = params.pitch[0];
    const spread = params.spread[0];
    const pre = Math.max(0, params.delay[0]) * sampleRate;
    const fbAmt = params.feedback[0];
    const grain = Math.max(0.01, params.grain[0]);
    let win = grain * sampleRate;
    if (mode === 1) win *= 2; // deglitched: a longer splice
    const ratios = [Math.pow(2, (semis + spread / 200) / 12), Math.pow(2, (semis - spread / 200) / 12)];
    if (mode !== this.mode) {
      // Entering Repeat captures the last `delay` (at least 20 ms) as the loop.
      if (mode === 6) {
        const len = Math.max(0.02 * sampleRate, pre || 0.25 * sampleRate);
        this.loop = { start: this.w - len, len, pos: 0 };
      } else this.loop = null;
      this.mode = mode;
    }
    for (let k = 0; k < n; k++) {
      let x = 0;
      for (const ch of input) x += ch[k];
      if (input.length > 1) x /= input.length;
      this.damp += 0.35 * (this.fb - this.damp);
      const back = Math.tanh(this.damp * fbAmt);
      let yl = 0;
      let yr = 0;
      if (mode === 6 && this.loop) {
        // Repeat: the captured loop, at the Pitch speed, crossfaded over 5 ms at the seam.
        const L = this.loop;
        const xf = Math.min(L.len / 4, 0.005 * sampleRate);
        const p = L.pos;
        let y = this.at(L.start + p);
        if (p > L.len - xf) {
          const g = (p - (L.len - xf)) / xf;
          y = y * (1 - g) + this.at(L.start + p - L.len) * g;
        }
        L.pos += ratios[0];
        if (L.pos >= L.len) L.pos -= L.len;
        if (L.pos < 0) L.pos += L.len;
        yl = y;
        yr = y;
        // Hold the buffer: don't overwrite the loop while repeating.
        if (out[0]) out[0][k] = yl;
        if (out[1]) out[1][k] = yr;
        this.fb = 0;
        continue;
      }
      this.buf[this.w] = x + back;
      if (mode === 4) {
        // Plain delay; Spread offsets the right side by up to 10 ms.
        yl = this.read(pre + 1);
        yr = this.read(pre + 1 + spread * 0.0001 * sampleRate);
      } else if (mode === 5) {
        // Flange: a triangle sweep (period = Grain × 20) of up to `delay` (max 15 ms).
        this.lfo += 1 / (grain * 20 * sampleRate);
        this.lfo -= Math.floor(this.lfo);
        const tri = 1 - Math.abs(2 * this.lfo - 1);
        const depth = Math.min(pre, 0.015 * sampleRate);
        const base = 0.0005 * sampleRate;
        yl = this.read(base + depth * tri);
        const tri2 = 1 - Math.abs(2 * ((this.lfo + spread / 200) % 1) - 1); // Spread offsets R's sweep
        yr = this.read(base + depth * tri2);
      } else {
        for (let c = 0; c < 2; c++) {
          const reverse = mode === 2;
          // Forward: the taps drift by (1 − ratio); reverse: by (1 + ratio), reading backwards.
          let ph = this.phase[c] + (reverse ? 1 + ratios[c] : 1 - ratios[c]) / win;
          const wrapped = Math.floor(ph);
          ph -= wrapped;
          const ph2 = (ph + 0.5) % 1;
          if (mode === 3) {
            // Random: a fresh splice point for each tap as it fades out.
            if ((this.phase[c] < 0.5) !== (ph < 0.5) || wrapped) {
              const tap = ph < 0.5 ? 1 : 0;
              this.jitter[c][tap] = Math.random() * win * 0.75;
            }
          }
          this.phase[c] = ph;
          let g1 = Math.sin(Math.PI * ph) ** 2;
          let g2 = 1 - g1;
          if (mode === 1) { g1 = Math.sqrt(g1); g2 = Math.sqrt(g2); } // equal power: smoother
          const j = mode === 3 ? this.jitter[c] : [0, 0];
          let y = this.read(pre + 1 + ph * win + j[0]) * g1 + this.read(pre + 1 + ph2 * win + j[1]) * g2;
          if (mode === 1) y *= 0.77; // equal-power splices run a little hot on steady tones: level-match
          if (c === 0) yl = y; else yr = y;
        }
      }
      if (out[0]) out[0][k] = yl;
      if (out[1]) out[1][k] = yr;
      this.fb = (yl + yr) / 2;
      this.w = (this.w + 1) % this.size;
    }
    return true;
  }
}

registerProcessor('harmonizer', Harmonizer);
