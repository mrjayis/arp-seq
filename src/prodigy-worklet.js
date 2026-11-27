// Two oscillators the way a Moog Prodigy has them, as an AudioWorklet: Osc 1 and Osc 2 each
// triangle, saw or square, Osc 2 at `ratio` times Osc 1's frequency (its interval and fine
// tune), mixed by `mix`, and with `sync` on, Osc 2 hard-synced to Osc 1: its cycle starts again
// every time Osc 1's does, so it's heard at Osc 1's pitch with Osc 2's frequency as a bright,
// tearing harmonic colour (swept, the classic sync sound). Run 4× oversampled (averaged down),
// which keeps the jumps a sync reset makes from aliasing much. Mono out.
//
// a-rate `freq` (Hz) and `ratio`, so glides and sync sweeps are smooth; k-rate `wave1`,
// `wave2` (0 triangle, 1 saw, 2 square), `mix` (0: all Osc 1 … 1: all Osc 2) and `sync` (0/1).

const OVERSAMPLE = 4;

/** One oscillator's value at phase p (0..1). */
function wave(kind, p) {
  if (kind === 1) return 2 * p - 1; // saw
  if (kind === 2) return p < 0.5 ? 1 : -1; // square
  return 1 - 4 * Math.abs(p - 0.5); // triangle
}

class ProdigyOscillators extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'freq', defaultValue: 110, minValue: 1, maxValue: 20000, automationRate: 'a-rate' },
      { name: 'ratio', defaultValue: 1, minValue: 0.0625, maxValue: 64, automationRate: 'a-rate' },
      { name: 'mix', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'wave1', defaultValue: 1, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
      { name: 'wave2', defaultValue: 1, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
      { name: 'sync', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.p1 = 0;
    this.p2 = 0;
  }

  process(inputs, outputs, params) {
    const out = outputs[0][0];
    if (!out) return true;
    const sr = sampleRate * OVERSAMPLE;
    const f = params.freq;
    const r = params.ratio;
    const mix = params.mix[0];
    const w1 = Math.round(params.wave1[0]);
    const w2 = Math.round(params.wave2[0]);
    const sync = params.sync[0] >= 0.5;
    const g1 = 1 - mix;
    const g2 = mix;
    let { p1, p2 } = this;
    for (let i = 0; i < out.length; i++) {
      const fi = f.length > 1 ? f[i] : f[0];
      const ri = r.length > 1 ? r[i] : r[0];
      const d1 = fi / sr;
      const d2 = (fi * ri) / sr;
      let acc = 0;
      for (let k = 0; k < OVERSAMPLE; k++) {
        p1 += d1;
        p2 += d2;
        if (p1 >= 1) {
          p1 -= Math.floor(p1);
          // Hard sync: Osc 2 starts its cycle again with Osc 1's, as far into it as Osc 1 is.
          if (sync) p2 = d1 > 0 ? (p1 / d1) * d2 : 0;
        }
        if (p2 >= 1) p2 -= Math.floor(p2);
        acc += g1 * wave(w1, p1) + g2 * wave(w2, p2);
      }
      out[i] = (acc / OVERSAMPLE) * 0.6;
    }
    this.p1 = p1;
    this.p2 = p2;
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}

registerProcessor('prodigy-oscillators', ProdigyOscillators);
