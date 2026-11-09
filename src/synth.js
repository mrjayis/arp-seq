// Small polyphonic Web Audio synth used as the built-in sound source.

const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);

// ---- West-coast voice helpers (pure, unit-tested)

/** Triangle wavefolder: identity for |u| <= 1, reflects back beyond ±1 (so ±3 → ∓1, ±2 → 0). */
export function fold(u) {
  let v = (u + 1) / 4;
  v -= Math.floor(v);
  return 1 - 4 * Math.abs(v - 0.5);
}

/** Maximum fold drive at Timbre 100%: the sine is pushed to ±MAX_FOLD before folding. */
export const MAX_FOLD = 6;

/**
 * WaveShaper curve for the folder. The shaper's input range [-1, 1] stands for a
 * signal of ±MAX_FOLD, so a drive gain of 1/MAX_FOLD leaves a sine untouched.
 */
export function foldCurve(size = 4096) {
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) curve[i] = fold(((i / (size - 1)) * 2 - 1) * MAX_FOLD);
  return curve;
}

/** Timbre 0..1 → gain in front of the folder (0 = clean sine, 1 = folded ±MAX_FOLD). */
export function foldDrive(timbre) {
  return (1 + Math.min(1, Math.max(0, timbre)) * (MAX_FOLD - 1)) / MAX_FOLD;
}

/**
 * How far the low-pass gate opens for a cutoff, as 0..1 on the same log scale as
 * the cutoff slider (60 Hz → 0, 12 kHz → 1). In Combo mode this also sets loudness.
 */
export function gateOpening(cutoff, min = 60, max = 12000) {
  const f = Math.min(max, Math.max(min, cutoff));
  return Math.log(f / min) / Math.log(max / min);
}

/** Loudness of a Combo/VCA strike for a gate opening (closed gate still lets a whisper through). */
export function comboLevel(opening) {
  return 0.04 + 0.96 * Math.pow(Math.min(1, Math.max(0, opening)), 0.8);
}

export const LPG_MODES = { combo: 'Combo', lp: 'LP', vca: 'VCA' };

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

  /** Lazily-built shared resources for the west-coast voice. */
  get foldShape() {
    if (!this._foldShape) this._foldShape = foldCurve();
    return this._foldShape;
  }

  get spikeWave() {
    if (!this._spike) {
      // Equal-amplitude cosine harmonics → a narrow pulse ("spike").
      const n = 40;
      const real = new Float32Array(n).fill(1);
      real[0] = 0;
      this._spike = this.ctx.createPeriodicWave(real, new Float32Array(n));
    }
    return this._spike;
  }

  /**
   * West-coast style voice: a sine core through a wavefolder (Timbre), crossfaded
   * (Shape) with a second waveform, into a low-pass gate whose filter and VCA can
   * share one vactrol-like control (Combo).
   * opts: {wave, detune, level, cutoff, shape 0..1, timbre 0..1, lpg 'combo'|'lp'|'vca',
   *        decay (s), resonance, out}
   */
  playWest(note, velocity, time, duration, {
    wave = this.wave, detune = 0, level = 1, cutoff = this.cutoff,
    shape = 0.5, timbre = 0, lpg = 'combo', decay = 0.25, resonance = 1, out = this.master,
  } = {}) {
    const ctx = this.ctx;
    const t0 = Math.max(time, ctx.currentTime);
    const tOff = t0 + Math.max(0.01, duration);
    const freq = mtof(note);
    const vel = velocity / 127;
    const opening = gateOpening(cutoff);
    const tau = Math.max(0.005, decay) / 4; // vactrol-like exponential release

    // Sine core → wavefolder.
    const sine = ctx.createOscillator();
    sine.frequency.setValueAtTime(freq, t0);
    sine.detune.setValueAtTime(detune, t0);
    const drive = ctx.createGain();
    drive.gain.value = foldDrive(timbre);
    const folder = ctx.createWaveShaper();
    folder.curve = this.foldShape;
    folder.oversample = '4x';

    // Second waveform.
    const other = ctx.createOscillator();
    if (wave === 'spike') other.setPeriodicWave(this.spikeWave);
    else other.type = wave;
    other.frequency.setValueAtTime(freq, t0);
    other.detune.setValueAtTime(detune, t0);

    // Equal-power crossfade: Shape 0 = folded sine only, 1 = the other wave only.
    const x = Math.min(1, Math.max(0, shape));
    const sineGain = ctx.createGain();
    sineGain.gain.value = Math.cos((x * Math.PI) / 2);
    const otherGain = ctx.createGain();
    otherGain.gain.value = Math.sin((x * Math.PI) / 2) * (wave === 'spike' ? 2.4 : 1); // a spike carries little energy

    // Low-pass gate.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = resonance;
    const amp = ctx.createGain();

    const floor = 40; // fully closed filter
    const open = lpg === 'vca' ? 18000 : floor * Math.pow(cutoff / floor, 0.55 + 0.45 * vel);
    const peak = Math.pow(vel, 1.5) * 0.35 * level * (lpg === 'lp' ? 1 : comboLevel(opening));
    const end = tOff + Math.max(0.03, decay) * 1.6;

    // Strike: both halves of the gate open fast, hold through the gate time…
    if (lpg === 'vca') filter.frequency.setValueAtTime(open, t0);
    else {
      filter.frequency.setValueAtTime(floor, t0);
      filter.frequency.linearRampToValueAtTime(open, t0 + 0.004);
      filter.frequency.setTargetAtTime(floor + (open - floor) * 0.8, t0 + 0.004, 0.12);
      filter.frequency.setValueAtTime(floor + (open - floor) * 0.8, tOff);
      // …then close together on the vactrol curve.
      filter.frequency.setTargetAtTime(floor, tOff, tau);
    }
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(peak, t0 + 0.004);
    amp.gain.setTargetAtTime(peak * 0.8, t0 + 0.004, 0.12);
    amp.gain.setValueAtTime(peak * 0.8, tOff);
    // In LP mode the VCA just gates quickly; otherwise it shares the vactrol release.
    amp.gain.setTargetAtTime(0, tOff, lpg === 'lp' ? 0.015 : tau);

    sine.connect(drive).connect(folder).connect(sineGain).connect(filter);
    other.connect(otherGain).connect(filter);
    filter.connect(amp).connect(out);
    for (const osc of [sine, other]) {
      osc.start(t0);
      osc.stop(end);
      const voice = { osc, amp };
      this.voices.add(voice);
      osc.onended = () => {
        this.voices.delete(voice);
        if (osc === sine) amp.disconnect();
      };
    }
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
