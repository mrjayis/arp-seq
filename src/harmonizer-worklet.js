// An H949-style Harmonizer as an AudioWorklet: mono in, stereo out. It follows the
// H949's front panel: a Function button choosing a Pitch Change group or a Delay group,
// four modes in each, an Algorithm switch (two splicing methods), Repeat, Feedback, and
// separate Main (processed) and Delay (plain delayed) outputs.
//
// `mode`:  Pitch Change group   0 NORM     shift by splicing ~25 ms segments
//                               1 EXTEND   the same, with the segment length set by `grain`
//                               2 μPC      micro pitch change (fine ratios, for doubling)
//                               3 REVERSE  reversed segments (length = `delay`), pitch-shifted
//          Delay group          4 DELAY    plain delay
//                               5 RANDOM   delay varying randomly over 0–25 ms (`grain` = rate)
//                               6 FLANGE   delay swept around a fixed 12.5 ms (`grain` = rate)
//                               7 REVERSE  reversed segments (length = `delay`), no pitch change
// `algorithm` 1: plain crossfaded splices. 2: smoother (equal-power, longer overlap).
// `repeat` 1: loop the last `delay` of sound (at the pitch ratio; backwards in the REVERSE modes).
// `spread`: left and right pulled apart, in cents (pitch modes) or ms × 0.1 (delay modes).

const MAX_SECONDS = 2;

class Harmonizer extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const k = 'k-rate';
    return [
      { name: 'mode', defaultValue: 0, minValue: 0, maxValue: 7, automationRate: k },
      { name: 'algorithm', defaultValue: 1, minValue: 1, maxValue: 2, automationRate: k },
      { name: 'repeat', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: k },
      { name: 'pitch', defaultValue: 0, minValue: -24, maxValue: 24, automationRate: k }, // semitones
      { name: 'spread', defaultValue: 0, minValue: 0, maxValue: 100, automationRate: k },
      { name: 'delay', defaultValue: 0.03, minValue: 0, maxValue: 1, automationRate: k }, // seconds
      { name: 'feedback', defaultValue: 0, minValue: 0, maxValue: 0.95, automationRate: k },
      { name: 'grain', defaultValue: 0.025, minValue: 0.005, maxValue: 0.2, automationRate: k }, // seconds
      { name: 'main', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: k }, // Main output level
      { name: 'delayOut', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: k }, // Delay output level
    ];
  }

  constructor() {
    super();
    this.size = Math.ceil(MAX_SECONDS * sampleRate);
    this.buf = new Float32Array(this.size);
    this.w = 0;
    this.phase = [0, 0];
    this.fb = 0;
    this.damp = 0;
    this.lfo = 0;
    this.rand = { from: 0, to: 0, t: 1 }; // RANDOM: smoothly moving between random delays
    this.loop = null; // Repeat
  }

  at(pos) {
    pos -= Math.floor(pos / this.size) * this.size;
    const i = Math.floor(pos);
    const a = this.buf[i % this.size];
    return a + (this.buf[(i + 1) % this.size] - a) * (pos - i);
  }

  read(d) {
    return this.at(this.w - d);
  }

  /** Two read taps sweeping a window and crossfading: pitch change by splicing. */
  splice(c, ratio, win, pre, reverse, smooth) {
    let ph = this.phase[c] + (reverse ? 1 + ratio : 1 - ratio) / win;
    ph -= Math.floor(ph);
    this.phase[c] = ph;
    const ph2 = (ph + 0.5) % 1;
    let g1 = Math.sin(Math.PI * ph) ** 2;
    let g2 = 1 - g1;
    if (smooth) { g1 = Math.sqrt(g1) * 0.77; g2 = Math.sqrt(g2) * 0.77; } // equal power, level-matched
    return this.read(pre + 1 + ph * win) * g1 + this.read(pre + 1 + ph2 * win) * g2;
  }

  process(inputs, outputs, params) {
    const input = inputs[0];
    const out = outputs[0];
    const n = out[0].length;
    const mode = Math.round(params.mode[0]);
    const smooth = Math.round(params.algorithm[0]) === 2;
    const repeat = params.repeat[0] >= 0.5;
    const semis = params.pitch[0];
    const spread = params.spread[0];
    const pre = Math.max(0, params.delay[0]) * sampleRate;
    const fbAmt = params.feedback[0];
    const grain = Math.max(0.005, params.grain[0]);
    const mainLvl = params.main[0];
    const delayLvl = params.delayOut[0];
    const pitchMode = mode <= 3;
    const reverse = mode === 3 || mode === 7;
    const r = pitchMode && mode !== 7 ? semis : 0;
    const ratios = [Math.pow(2, (r + (pitchMode ? spread / 200 : 0)) / 12), Math.pow(2, (r - (pitchMode ? spread / 200 : 0)) / 12)];
    // The splice window: ~25 ms normally (longer with Algorithm 2), Grain in EXTEND,
    // the Delay setting in the REVERSE modes (the segment length).
    let win = 0.025 * sampleRate * (smooth ? 1.6 : 1);
    if (mode === 1) win = grain * sampleRate;
    if (reverse) win = Math.max(0.02 * sampleRate, pre);
    const readPre = reverse ? 0 : pre;

    if (repeat && !this.loop) {
      const len = Math.max(0.02 * sampleRate, pre || 0.25 * sampleRate);
      this.loop = { start: this.w - len, len, pos: reverse ? len - 1 : 0 };
    } else if (!repeat) this.loop = null;

    for (let k = 0; k < n; k++) {
      let x = 0;
      for (const ch of input) x += ch[k];
      if (input.length > 1) x /= input.length;
      let yl = 0;
      let yr = 0;
      if (this.loop) {
        // Repeat: the captured audio loops (at the pitch ratio; backwards in Reverse),
        // with a 5 ms crossfade over the seam. The buffer is held while it repeats.
        const L = this.loop;
        const xf = Math.min(L.len / 4, 0.005 * sampleRate);
        let y = this.at(L.start + L.pos);
        if (L.pos > L.len - xf) {
          const g = (L.pos - (L.len - xf)) / xf;
          y = y * (1 - g) + this.at(L.start + L.pos - L.len) * g;
        }
        L.pos += (reverse ? -1 : 1) * (pitchMode ? ratios[0] : 1);
        if (L.pos >= L.len) L.pos -= L.len;
        if (L.pos < 0) L.pos += L.len;
        yl = y * mainLvl;
        yr = y * mainLvl;
      } else {
        this.damp += 0.35 * (this.fb - this.damp);
        this.buf[this.w] = x + Math.tanh(this.damp * fbAmt);
        if (pitchMode || mode === 7) {
          yl = this.splice(0, ratios[0], win, readPre, reverse, smooth);
          yr = this.splice(1, ratios[1], win, readPre, reverse, smooth);
        } else if (mode === 4) {
          yl = this.read(pre + 1);
          yr = this.read(pre + 1 + spread * 0.0001 * sampleRate);
        } else if (mode === 5) {
          // RANDOM: a new random delay (0–25 ms) every Grain × 10, glided to (cosine).
          const R = this.rand;
          R.t += 1 / (grain * 10 * sampleRate);
          if (R.t >= 1) { R.from = R.to; R.to = Math.random() * 0.025 * sampleRate; R.t = 0; }
          const d = R.from + (R.to - R.from) * (0.5 - 0.5 * Math.cos(Math.PI * R.t));
          yl = this.read(pre + 1 + d);
          yr = this.read(pre + 1 + d * (1 - spread / 100) + (spread / 100) * 0.0125 * sampleRate);
        } else if (mode === 6) {
          // FLANGE: a sweep around 12.5 ms against a fixed 12.5 ms copy (the classic H949 flange).
          this.lfo += 1 / (grain * 40 * sampleRate);
          this.lfo -= Math.floor(this.lfo);
          const fixed = this.read(0.0125 * sampleRate);
          const swing = (lfo) => 0.0125 * sampleRate * (1 - Math.abs(2 * lfo - 1)) * 0.98;
          yl = 0.5 * (fixed + this.read(swing(this.lfo) + 1));
          yr = 0.5 * (fixed + this.read(swing((this.lfo + spread / 200) % 1) + 1));
        }
        this.fb = (yl + yr) / 2;
        const dry = this.read(pre + 1) * delayLvl; // the Delay output: plain delayed signal
        yl = yl * mainLvl + dry;
        yr = yr * mainLvl + dry;
        this.w = (this.w + 1) % this.size;
      }
      if (out[0]) out[0][k] = yl;
      if (out[1]) out[1][k] = yr;
    }
    return true;
  }
}

registerProcessor('harmonizer', Harmonizer);
