// A 101-style mono synth: one oscillator (saw + variable pulse + sub + noise)
// into a 24 dB resonant low-pass, with ADSR, LFO and portamento, played by its
// own step sequencer. Sequencer logic is pure and unit-tested.

import { pulseCurve, SAW_RAMP } from './synth.js?v=75';

export const MAX_MONO_STEPS = 64;
export const SUB_MODES = { sq1: '−1 oct square', sq2: '−2 oct square', pl2: '−2 oct pulse' };
export const PORTA_MODES = { off: 'Off', on: 'On', auto: 'Auto' };

// ------------------------------------------------------------------ sequence
// A step is {n: MIDI note | null, t: tied}. n + t: slide into n without
// retriggering (legato). null + t: hold the previous note. null alone: rest.

export const restStep = () => ({ n: null, t: false });
export const holdStep = () => ({ n: null, t: true });
export const noteStep = (n, legato = false) => ({ n, t: !!legato });

/**
 * What to do at step `i`: {type: 'note' | 'legato' | 'hold' | 'rest', note,
 * release}, where `release` says whether the gate closes before the next step
 * (it stays open into a tied next step).
 */
export function stepAction(seq, i) {
  const len = seq.length;
  if (!len) return { type: 'rest', release: false };
  const at = (k) => seq[((k % len) + len) % len];
  const e = at(i);
  const next = at(i + 1);
  // Is a note sounding at step k? A hold continues whatever came before it.
  const soundingAt = (k) => {
    for (let back = 0; back < len; back++) {
      const s = at(k - back);
      if (s.n !== null) return true;
      if (!s.t) return false;
    }
    return false;
  };
  const release = !next.t || len === 1; // the gate stays open into a tied next step
  if (e.n === null && !e.t) return { type: 'rest', release: false };
  if (e.n === null) return { type: soundingAt(i - 1) ? 'hold' : 'rest', release: soundingAt(i - 1) && release };
  if (e.t && soundingAt(i - 1)) return { type: 'legato', note: e.n, release };
  return { type: 'note', note: e.n, release };
}

/** Write `step` at `cursor` (overwrite, or append at the end). Returns {seq, cursor}. */
export function writeStep(seq, cursor, step) {
  const out = seq.slice();
  const at = Math.max(0, Math.min(cursor, out.length));
  if (at >= MAX_MONO_STEPS) return { seq: out, cursor: at };
  out[at] = step;
  return { seq: out, cursor: Math.min(at + 1, MAX_MONO_STEPS) };
}

/** Delete the step before `cursor` (Back). Returns {seq, cursor}. */
export function backStep(seq, cursor) {
  if (cursor <= 0) return { seq, cursor: 0 };
  const out = seq.slice();
  out.splice(cursor - 1, 1);
  return { seq: out, cursor: cursor - 1 };
}

/** Text for a step chip. */
export function stepLabel(step, noteName) {
  if (step.n === null) return step.t ? 'tie' : 'rest';
  return noteName(step.n);
}

/** Fourier series for a narrow pulse (duty d), for the −2 oct pulse sub. */
export function pulseSeries(duty = 0.25, harmonics = 48) {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) {
    real[n] = Math.sin(2 * Math.PI * n * duty) / (n * Math.PI);
    imag[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / (n * Math.PI);
  }
  return { real, imag };
}

// ------------------------------------------------------------------ envelopes
// Each envelope remembers what it scheduled, so the level at any moment can be
// worked out exactly. New notes and releases start from that level: relying on
// cancelAndHoldAtTime to find it made Chrome snap a release tail to 0 (a click).

/**
 * Level of an envelope segment at time t. `seg` is {t0, v0, attack, peak,
 * sustain, decayTau} for a note, plus `off: {t, v, tau}` once released.
 */
export function envLevel(seg, t) {
  if (!seg) return 0;
  if (seg.off && t >= seg.off.t) return seg.off.v * Math.exp(-(t - seg.off.t) / seg.off.tau);
  if (t <= seg.t0) return seg.v0;
  const peakAt = seg.t0 + seg.attack;
  if (t < peakAt) return seg.v0 + (seg.peak - seg.v0) * ((t - seg.t0) / seg.attack);
  return seg.sustain + (seg.peak - seg.sustain) * Math.exp(-(t - peakAt) / seg.decayTau);
}

class EnvTrack {
  constructor(param) {
    this.param = param;
    this.seg = null;
  }

  /**
   * Cut the schedule at t and pin the level there. Inside an unfinished attack ramp,
   * cancelling also erases the part already under way, so the ramp is re-drawn up to t.
   */
  cut(t, v) {
    const p = this.param;
    const inAttack = this.seg && !this.seg.off && t > this.seg.t0 && t < this.seg.t0 + this.seg.attack;
    p.cancelScheduledValues(t);
    if (inAttack) p.linearRampToValueAtTime(v, t);
    else p.setValueAtTime(v, t);
  }

  /** Attack from the current level to `peak`, then decay toward `sustain`. */
  on(t, { attack, peak, sustain, decayTau }) {
    const v0 = envLevel(this.seg, t);
    const a = Math.max(0.001, attack);
    this.cut(t, v0);
    this.seg = { t0: t, v0, attack: a, peak, sustain, decayTau, off: null };
    const p = this.param;
    p.linearRampToValueAtTime(peak, t + a);
    if (sustain !== peak) p.setTargetAtTime(sustain, t + a, decayTau);
  }

  /** Fall from the current level to 0 with time constant `tau`. */
  off(t, tau) {
    if (!this.seg) return;
    const v = envLevel(this.seg, t);
    this.cut(t, v);
    this.seg = { ...this.seg, off: { t, v, tau } };
    this.param.setTargetAtTime(0, t, tau);
  }
}

// ------------------------------------------------------------------ voice

const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class MonoSynth {
  constructor(ctx, destination) {
    this.ctx = ctx;
    const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    const osc = (type) => { const o = ctx.createOscillator(); o.type = type; o.start(); return o; };

    // Oscillators: saw, pulse (saw through a moving comparator threshold), sub, noise.
    this.saw = osc('sawtooth');
    this.pulseSaw = osc('sawtooth');
    this.threshold = ctx.createConstantSource();
    this.threshold.start();
    const sum = g();
    const comparator = ctx.createWaveShaper();
    comparator.curve = pulseCurve();
    comparator.oversample = '4x';
    const dcBlock = g(-1 / SAW_RAMP);
    this.pulseSaw.connect(sum);
    this.threshold.connect(sum);
    this.pulseOut = g();
    sum.connect(comparator).connect(this.pulseOut);
    this.threshold.connect(dcBlock).connect(this.pulseOut);
    this.sub = osc('square');
    this.subWaves = { pl2: ctx.createPeriodicWave(pulseSeries(0.25).real, pulseSeries(0.25).imag) };
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = ctx.createBufferSource();
    this.noise.buffer = noiseBuf;
    this.noise.loop = true;
    this.noise.start();

    // Mixer → 24 dB low-pass (two 12 dB stages) → VCA → out.
    this.mix = { saw: g(0.8), pulse: g(0), sub: g(0.5), noise: g(0) };
    this.saw.connect(this.mix.saw);
    this.pulseOut.connect(this.mix.pulse);
    this.sub.connect(this.mix.sub);
    this.noise.connect(this.mix.noise);
    this.f1 = ctx.createBiquadFilter();
    this.f2 = ctx.createBiquadFilter();
    for (const f of [this.f1, this.f2]) { f.type = 'lowpass'; f.frequency.value = 800; }
    this.f1.Q.value = 0.5;
    for (const m of Object.values(this.mix)) m.connect(this.f1);
    this.vca = g(0);
    this.out = g(0.5);
    this.f1.connect(this.f2).connect(this.vca).connect(this.out).connect(destination);

    // Envelope (0..1) drives the filter by `envAmount`; the VCA follows it or the gate.
    this.env = ctx.createConstantSource();
    this.env.offset.value = 0;
    this.env.start();
    this.envToFilter = g(0);
    this.env.connect(this.envToFilter);
    this.envToFilter.connect(this.f1.frequency);
    this.envToFilter.connect(this.f2.frequency);

    // LFO → pitch (cents), filter (Hz), pulse width.
    this.lfo = osc('triangle');
    this.lfo.frequency.value = 5;
    this.lfoPitch = g(0);
    this.lfoFilter = g(0);
    this.lfoPwm = g(0);
    this.lfo.connect(this.lfoPitch);
    this.lfo.connect(this.lfoFilter);
    this.lfo.connect(this.lfoPwm);
    for (const o of [this.saw, this.pulseSaw, this.sub]) this.lfoPitch.connect(o.detune);
    this.lfoFilter.connect(this.f1.frequency);
    this.lfoFilter.connect(this.f2.frequency);
    this.lfoPwm.connect(this.threshold.offset);

    this.p = {
      saw: 0.8, pulse: 0, sub: 0.5, noise: 0, subMode: 'sq1', width: 50, pwm: 0,
      cutoff: 800, resonance: 6, envAmount: 0.5, keyFollow: 0.5,
      attack: 0.003, decay: 0.25, sustain: 0.3, release: 0.08, vcaGate: false,
      lfoRate: 5, vibrato: 0, lfoFilter: 0, porta: 'off', glide: 0.08, level: 0.5,
    };
    this.note = null;
    this.envTrack = new EnvTrack(this.env.offset);
    this.vcaTrack = new EnvTrack(this.vca.gain);
    this.set({});
  }

  /** Update any parameters (see this.p for names and units). */
  set(params) {
    Object.assign(this.p, params);
    const p = this.p;
    const now = this.ctx.currentTime;
    const to = (param, v) => param.setTargetAtTime(v, now, 0.01);
    to(this.mix.saw.gain, p.saw);
    to(this.mix.pulse.gain, p.pulse);
    to(this.mix.sub.gain, p.sub);
    to(this.mix.noise.gain, p.noise * 0.6);
    // Pulse width: threshold centre (scaled for the band-limited saw), PWM depth from the LFO.
    const w = Math.min(95, Math.max(5, p.width)) / 100;
    to(this.threshold.offset, (2 * w - 1) * SAW_RAMP);
    to(this.lfoPwm.gain, (p.pwm / 100) * Math.min(w - 0.05, 0.95 - w) * 2 * SAW_RAMP);
    if (p.subMode === 'pl2') this.sub.setPeriodicWave(this.subWaves.pl2);
    else this.sub.type = 'square';
    this.f2.Q.setTargetAtTime(p.resonance, now, 0.01);
    to(this.envToFilter.gain, p.envAmount * 9000);
    to(this.lfo.frequency, p.lfoRate);
    to(this.lfoPitch.gain, p.vibrato * 60); // up to ±60 cents
    to(this.lfoFilter.gain, p.lfoFilter * 2500);
    to(this.out.gain, p.level);
    if (this.note !== null) this.setCutoff(this.note, now);
  }

  setCutoff(note, t) {
    const p = this.p;
    const f = Math.min(16000, p.cutoff * Math.pow(2, ((note - 48) / 12) * p.keyFollow));
    for (const flt of [this.f1, this.f2]) flt.frequency.setTargetAtTime(f, t, 0.004);
  }

  setPitch(note, t, glide) {
    const f = mtof(note);
    const subDiv = this.p.subMode === 'sq1' ? 2 : 4;
    for (const [o, freq] of [[this.saw, f], [this.pulseSaw, f], [this.sub, f / subDiv]]) {
      o.frequency.cancelScheduledValues(t);
      if (glide) o.frequency.setTargetAtTime(freq, t, Math.max(0.005, this.p.glide / 3));
      else o.frequency.setValueAtTime(freq, t);
    }
  }

  /** Start a note at time t; `legato` changes pitch without retriggering the envelope. */
  noteOn(note, t, { legato = false, velocity = 1 } = {}) {
    const p = this.p;
    const glide = p.porta === 'on' || (p.porta === 'auto' && legato);
    this.setPitch(note, t, glide && this.note !== null);
    this.setCutoff(note, t);
    this.note = note;
    if (legato) return;
    // Retrigger from wherever the envelope is now (as analog envelopes do).
    const decayTau = Math.max(0.005, p.decay / 3);
    this.envTrack.on(t, { attack: p.attack, peak: 1, sustain: p.sustain, decayTau });
    if (p.vcaGate) this.vcaTrack.on(t, { attack: 0.003, peak: velocity, sustain: velocity, decayTau });
    else this.vcaTrack.on(t, { attack: p.attack, peak: velocity, sustain: velocity * p.sustain, decayTau });
  }

  noteOff(t) {
    const r = Math.max(0.005, this.p.release / 3);
    this.envTrack.off(t, r);
    this.vcaTrack.off(t, this.p.vcaGate ? 0.004 : r);
  }

  /** Silence now (Stop). */
  panic() {
    const now = this.ctx.currentTime;
    this.envTrack.off(now, 0.01);
    this.vcaTrack.off(now, 0.01);
    this.note = null;
  }
}
