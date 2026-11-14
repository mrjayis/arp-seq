// An H949-style Harmonizer: a delay-line pitch shifter with feedback, as an AudioWorklet.
// Two read taps sweep through a short window and crossfade (sin² / cos²), the way the
// original's splicing did; Feedback sends the shifted output back in, so each repeat is
// shifted again (the classic spiral). Left and right are pitched apart by Spread (cents)
// for the "micro-pitch" widening. Mono in, stereo out.

const MAX_SECONDS = 2;

class Harmonizer extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'pitch', defaultValue: 0, minValue: -24, maxValue: 24, automationRate: 'k-rate' }, // semitones
      { name: 'spread', defaultValue: 0, minValue: 0, maxValue: 100, automationRate: 'k-rate' }, // cents between L and R
      { name: 'delay', defaultValue: 0.03, minValue: 0, maxValue: 1, automationRate: 'k-rate' }, // seconds
      { name: 'feedback', defaultValue: 0, minValue: 0, maxValue: 0.95, automationRate: 'k-rate' },
      { name: 'grain', defaultValue: 0.06, minValue: 0.01, maxValue: 0.2, automationRate: 'k-rate' }, // splice window, s
    ];
  }

  constructor() {
    super();
    this.size = Math.ceil(MAX_SECONDS * sampleRate);
    this.buf = new Float32Array(this.size);
    this.w = 0;
    this.phase = [0, 0]; // L, R
    this.fb = 0; // last output sample, fed back
    this.damp = 0; // one-pole low-pass state in the feedback path
  }

  read(d) {
    // Linear interpolation `d` samples behind the write head.
    let pos = this.w - d;
    while (pos < 0) pos += this.size;
    const i = Math.floor(pos);
    const f = pos - i;
    const a = this.buf[i % this.size];
    const b = this.buf[(i + 1) % this.size];
    return a + (b - a) * f;
  }

  process(inputs, outputs, params) {
    const input = inputs[0];
    const out = outputs[0];
    const n = out[0].length;
    const semis = params.pitch[0];
    const spread = params.spread[0] / 100; // cents → semitones
    const pre = Math.max(0, params.delay[0]) * sampleRate;
    const fbAmt = params.feedback[0];
    const win = Math.max(0.01, params.grain[0]) * sampleRate;
    const ratios = [Math.pow(2, (semis + spread / 2) / 12), Math.pow(2, (semis - spread / 2) / 12)];
    for (let k = 0; k < n; k++) {
      let x = 0;
      for (const ch of input) x += ch[k];
      if (input.length > 1) x /= input.length;
      // Feedback: darkened a little and gently limited, so long spirals stay musical.
      this.damp += 0.35 * (this.fb - this.damp);
      const back = Math.tanh(this.damp * fbAmt);
      this.buf[this.w] = x + back;
      let sum = 0;
      for (let c = 0; c < 2; c++) {
        // The read taps move through the window at a speed set by the pitch ratio.
        let ph = this.phase[c] + (1 - ratios[c]) / win;
        ph -= Math.floor(ph);
        this.phase[c] = ph;
        const ph2 = (ph + 0.5) % 1;
        const g1 = Math.sin(Math.PI * ph) ** 2;
        const g2 = 1 - g1;
        const y = this.read(pre + 1 + ph * win) * g1 + this.read(pre + 1 + ph2 * win) * g2;
        if (out[c]) out[c][k] = y;
        sum += y;
      }
      this.fb = sum / 2;
      this.w = (this.w + 1) % this.size;
    }
    return true;
  }
}

registerProcessor('harmonizer', Harmonizer);
