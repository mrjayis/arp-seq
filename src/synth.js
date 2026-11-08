// Small polyphonic Web Audio synth used as the built-in sound source.

const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Synth {
  constructor(ctx) {
    this.ctx = ctx;
    this.wave = 'sawtooth';
    this.cutoff = 2400;
    this.resonance = 4;
    this.release = 0.12;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    this.master.connect(comp).connect(ctx.destination);
    this.out = comp; // shared bus for other sound sources (percussion)
    this.voices = new Set();
  }

  setVolume(v) {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  /**
   * Play a note starting at `time` (ctx seconds) lasting `duration` seconds.
   * opts override the synth defaults per voice: {wave, detune (cents), level (0..1),
   * cutoff (Hz), resonance (Q), out (AudioNode to play into, e.g. an effect)}.
   */
  play(note, velocity, time, duration, {
    wave = this.wave, detune = 0, level = 1,
    cutoff = this.cutoff, resonance = this.resonance, out = this.master,
  } = {}) {
    const ctx = this.ctx;
    const t0 = Math.max(time, ctx.currentTime);
    const tOff = t0 + Math.max(0.01, duration);
    const peak = Math.pow(velocity / 127, 1.5) * 0.35 * level;

    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.detune.setValueAtTime(detune, t0);
    osc.frequency.setValueAtTime(mtof(note), t0);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = resonance;
    // Brighter attack, decaying toward the cutoff; velocity opens the filter.
    const bright = cutoff * (1 + velocity / 127);
    filter.frequency.setValueAtTime(Math.min(18000, bright * 2), t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, cutoff), t0 + 0.15);

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(peak, t0 + 0.004);
    amp.gain.setTargetAtTime(peak * 0.7, t0 + 0.004, 0.08);
    amp.gain.setValueAtTime(peak * 0.7, tOff);
    amp.gain.setTargetAtTime(0, tOff, this.release / 4);

    osc.connect(filter).connect(amp).connect(out);
    osc.start(t0);
    const end = tOff + this.release * 1.5;
    osc.stop(end);
    const voice = { osc, amp };
    this.voices.add(voice);
    osc.onended = () => {
      amp.disconnect();
      this.voices.delete(voice);
    };
  }

  /** Quickly fade and kill every sounding or scheduled voice. */
  panic() {
    const now = this.ctx.currentTime;
    for (const { osc, amp } of this.voices) {
      amp.gain.cancelScheduledValues(now);
      amp.gain.setTargetAtTime(0, now, 0.01);
      try {
        osc.stop(now + 0.05);
      } catch {
        /* already stopped */
      }
    }
  }
}

/**
 * Classic two-voice stereo chorus: the signal is mixed with two copies whose
 * short delays (~12/18 ms) are swept by slow LFOs, panned left and right.
 */
export class Chorus {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.input.connect(this.dry).connect(destination);
    this.wet.connect(destination);
    this.lfos = [];
    this.depths = [];
    [[0.012, -0.85, 1], [0.018, 0.85, 0.87]].forEach(([base, pan, rateMul]) => {
      const delay = ctx.createDelay(0.05);
      delay.delayTime.value = base;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      const depth = ctx.createGain();
      lfo.connect(depth).connect(delay.delayTime);
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      this.input.connect(delay).connect(panner).connect(this.wet);
      lfo.start();
      this.lfos.push({ lfo, rateMul });
      this.depths.push(depth);
    });
    this.setMix(0.5);
    this.setRate(0.6);
    this.setDepth(0.5);
  }

  /** 0 = dry only, 1 = full chorus; overall loudness stays roughly even. */
  setMix(m) {
    const now = this.ctx.currentTime;
    this.dry.gain.setTargetAtTime(1 - 0.5 * m, now, 0.02);
    this.wet.gain.setTargetAtTime(0.75 * m, now, 0.02);
  }

  /** LFO speed in Hz (the two voices run at slightly different speeds). */
  setRate(hz) {
    for (const { lfo, rateMul } of this.lfos) lfo.frequency.setTargetAtTime(hz * rateMul, this.ctx.currentTime, 0.05);
  }

  /** 0..1 → up to ±5 ms of delay sweep. */
  setDepth(d) {
    for (const g of this.depths) g.gain.setTargetAtTime(d * 0.005, this.ctx.currentTime, 0.05);
  }
}
