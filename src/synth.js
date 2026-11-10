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

/**
 * How long a struck gate rings (seconds) for an opening 0..1: like a vactrol,
 * the further it is opened the longer it takes to close (~40 ms → 2.5 s).
 */
export const STRIKE_MIN = 0.04;
export const STRIKE_MAX = 2.5;
export function strikeDecay(opening) {
  const o = Math.min(1, Math.max(0, opening));
  return STRIKE_MIN * Math.pow(STRIKE_MAX / STRIKE_MIN, o);
}

/** Equal-power crossfade: blend 0 = all of the first, 1 = all of the second. */
export function blendGains(blend) {
  const x = Math.min(1, Math.max(0, blend));
  return [Math.cos((x * Math.PI) / 2), Math.sin((x * Math.PI) / 2)];
}

/**
 * Pulse width as a comparator threshold on a saw (−1..1): a pulse is high while
 * saw + center > 0, so width w ↔ center = 2w − 1. `swing` is how far the PWM LFO
 * moves the threshold, limited so the width stays within 5–95%.
 */
export function pulseOffsets(widthPct, depthPct = 0) {
  const w = Math.min(95, Math.max(5, widthPct)) / 100;
  const room = Math.min(w - 0.05, 0.95 - w) * 2;
  return { center: 2 * w - 1, swing: (Math.min(100, Math.max(0, depthPct)) / 100) * room };
}

/**
 * Web Audio's band-limited sawtooth is normalised so its Gibbs overshoot (≈9% of
 * the jump each side) peaks at ±1, leaving the straight ramp at about ±0.848.
 * Thresholds are scaled by this so a 25% width really is 25%.
 */
export const SAW_RAMP = 1 / (1 + 2 * 0.0895);

/** Comparator curve: a steep tanh step, oversampled to keep aliasing down. */
export function pulseCurve(size = 2048, steepness = 60) {
  const c = new Float32Array(size);
  for (let i = 0; i < size; i++) c[i] = Math.tanh(((i / (size - 1)) * 2 - 1) * steepness);
  return c;
}

export const LPG_MODES = { combo: 'Combo', lp: 'LP', vca: 'VCA' };

// ---- Oscillator 2 → oscillator 1 modulation
export const MOD_TYPES = { off: 'Off', am: 'AM', fm: 'FM' };
export const MAX_FM_INDEX = 8;

/** FM: peak frequency deviation (Hz) for a depth 0..1 and modulator frequency. */
export function fmDeviation(depth, modFreq) {
  return Math.min(1, Math.max(0, depth)) * MAX_FM_INDEX * modFreq;
}

/** AM: carrier gain swings around `base` by ±`swing`; depth 1 = full 0..1 modulation. */
export function amGains(depth) {
  const d = Math.min(1, Math.max(0, depth));
  return { base: 1 - d / 2, swing: d / 2 };
}

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
    this.monoLines = new Map(); // mono line name -> its most recent voice
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
    layers = null, // [{wave, gain, detune, pulse?}]: several oscillators through one filter and envelope
  } = {}) {
    const ctx = this.ctx;
    const t0 = Math.max(time, ctx.currentTime);
    const tOff = t0 + Math.max(0.01, duration);
    const peak = Math.pow(velocity / 127, 1.5) * 0.35 * level;

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

    filter.connect(amp).connect(out);
    const end = tOff + this.release * 1.5;
    const sources = this._stack(note, t0, layers || [{ wave, gain: 1, detune }], filter, amp);
    for (const src of sources) src.stop(end);
  }

  /**
   * Start the oscillator stack for one note into `filter` at t0 (not stopped):
   * each layer is a wave (or a variable-width pulse) at its gain and detune.
   * Returns every started source, so the caller decides when they stop.
   */
  _stack(note, t0, layers, filter, amp) {
    const ctx = this.ctx;
    const sources = [];
    layers.filter((l) => l.gain > 0).forEach((layer, i) => {
      const osc = ctx.createOscillator();
      osc.detune.setValueAtTime(layer.detune || 0, t0);
      osc.frequency.setValueAtTime(mtof(note), t0);
      const g = ctx.createGain();
      g.gain.value = layer.gain;
      g.connect(filter);
      const p = layer.pulse;
      if (layer.wave === 'square' && p && (p.center !== 0 || p.swing > 0)) {
        // Variable-width pulse: saw + threshold → comparator, with the threshold's
        // own DC subtracted afterwards so off-centre widths don't thump.
        osc.type = 'sawtooth';
        const threshold = ctx.createConstantSource();
        threshold.offset.value = p.center * SAW_RAMP;
        if (p.swing > 0) {
          const depth = ctx.createGain();
          depth.gain.value = p.swing * SAW_RAMP;
          this.pwmLfo.connect(depth).connect(threshold.offset);
        }
        const sum = ctx.createGain();
        const comparator = ctx.createWaveShaper();
        comparator.curve = this.pulseShape;
        comparator.oversample = '4x';
        const dcBlock = ctx.createGain();
        dcBlock.gain.value = -1 / SAW_RAMP; // the pulse's mean is the unscaled centre
        osc.connect(sum);
        threshold.connect(sum);
        sum.connect(comparator).connect(g);
        threshold.connect(dcBlock).connect(g);
        threshold.start(t0);
        sources.push(threshold);
        this.voices.add({ osc: threshold, amp });
      } else {
        osc.type = layer.wave;
        osc.connect(g);
      }
      osc.start(t0);
      sources.push(osc);
      const voice = { osc, amp };
      this.voices.add(voice);
      osc.onended = () => {
        if (i === 0) amp.disconnect();
        this.voices.delete(voice);
      };
    });
    return sources;
  }

  /**
   * A held pad note: swells in over `attack`, sustains until released, then fades
   * over `release` (seconds). The filter is steady (no pluck). Returns {release(t)}.
   */
  padVoice(note, velocity, time, {
    wave = this.wave, detune = 0, level = 1, cutoff = this.cutoff, resonance = this.resonance,
    out = this.master, layers = null, attack = 0.6, release = 1.5,
  } = {}) {
    const ctx = this.ctx;
    const t0 = Math.max(time, ctx.currentTime);
    const peak = Math.pow(velocity / 127, 1.5) * 0.35 * level * 0.7;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = resonance;
    filter.frequency.value = Math.max(30, cutoff);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(peak, t0 + Math.max(0.005, attack));
    filter.connect(amp).connect(out);
    const sources = this._stack(note, t0, layers || [{ wave, gain: 1, detune }], filter, amp);
    let released = false;
    return {
      release: (t) => {
        if (released) return;
        released = true;
        const at = Math.max(t, ctx.currentTime);
        if (amp.gain.cancelAndHoldAtTime) amp.gain.cancelAndHoldAtTime(at);
        else { amp.gain.cancelScheduledValues(at); amp.gain.setValueAtTime(peak, at); }
        amp.gain.setTargetAtTime(0, at, Math.max(0.01, release / 4));
        for (const src of sources) { try { src.stop(at + Math.max(0.05, release) * 1.6); } catch { /* stopped */ } }
      },
    };
  }

  /** One free-running LFO shared by every pulse-width-modulated note. */
  get pwmLfo() {
    if (!this._pwmLfo) {
      this._pwmLfo = this.ctx.createOscillator();
      this._pwmLfo.type = 'triangle';
      this._pwmLfo.frequency.value = 0.8;
      this._pwmLfo.start();
    }
    return this._pwmLfo;
  }

  setPwmRate(hz) {
    this.pwmLfo.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.05);
  }

  get pulseShape() {
    if (!this._pulseShape) this._pulseShape = pulseCurve();
    return this._pulseShape;
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
   *        resonance, out, mono, mod}
   * `mod` = {type 'am'|'fm', depth 0..1, note, detune, wave}: a modulator at oscillator
   * 2's pitch that amplitude- or frequency-modulates this voice.
   * Combo / VCA: the note is a strike that decays at once; the cutoff sets how far the
   * gate opens and therefore how loud, bright (Combo) and long it is. Gate time is ignored.
   * LP: the note holds for the gate time (`duration`), then stops.
   * `mono` names a monophonic line: a new note on it cuts off that line's previous
   * note (including its decay tail) with a short fade.
   */
  playWest(note, velocity, time, duration, {
    wave = this.wave, detune = 0, level = 1, cutoff = this.cutoff,
    shape = 0.5, timbre = 0, lpg = 'combo', resonance = 1, out = this.master, mono = null, mod = null,
  } = {}) {
    const ctx = this.ctx;
    const t0 = Math.max(time, ctx.currentTime);
    const tOff = t0 + Math.max(0.01, duration);
    const freq = mtof(note);
    const vel = velocity / 127;
    const opening = gateOpening(cutoff);
    const struck = lpg !== 'lp';
    const ring = strikeDecay(opening);
    const tau = ring / 5; // exponential fall, ~-43 dB after `ring` seconds

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
    const attack = t0 + 0.004;
    const end = struck ? attack + ring * 1.3 : tOff + 0.1;

    if (struck) {
      // Strike: open fast, then filter (Combo) and loudness fall together at once.
      if (lpg === 'vca') filter.frequency.setValueAtTime(open, t0);
      else {
        filter.frequency.setValueAtTime(floor, t0);
        filter.frequency.linearRampToValueAtTime(open, attack);
        filter.frequency.setTargetAtTime(floor, attack, tau);
      }
      amp.gain.setValueAtTime(0, t0);
      amp.gain.linearRampToValueAtTime(peak, attack);
      amp.gain.setTargetAtTime(0, attack, tau);
    } else {
      // LP: hold for exactly the gate time, then close quickly.
      filter.frequency.setValueAtTime(floor, t0);
      filter.frequency.linearRampToValueAtTime(open, attack);
      filter.frequency.setTargetAtTime(floor + (open - floor) * 0.8, attack, 0.12);
      filter.frequency.setValueAtTime(floor + (open - floor) * 0.8, tOff);
      filter.frequency.setTargetAtTime(floor, tOff, 0.015);
      amp.gain.setValueAtTime(0, t0);
      amp.gain.linearRampToValueAtTime(peak, attack);
      amp.gain.setValueAtTime(peak, tOff);
      amp.gain.setTargetAtTime(0, tOff, 0.012);
    }

    // AM stage between the oscillator mix and the gate (unity gain when unused).
    const amNode = ctx.createGain();
    sine.connect(drive).connect(folder).connect(sineGain).connect(amNode);
    other.connect(otherGain).connect(amNode);
    amNode.connect(filter);

    // Modulator (oscillator 2's pitch and wave) → FM on both oscillators, or AM.
    let modOsc = null;
    let modGain = null;
    let modFreq = 0;
    const modType = mod && mod.depth > 0 && (mod.type === 'am' || mod.type === 'fm') ? mod.type : null;
    if (modType) {
      modFreq = mtof(mod.note);
      modOsc = ctx.createOscillator();
      if (mod.wave === 'spike') modOsc.setPeriodicWave(this.spikeWave);
      else modOsc.type = mod.wave || 'sine';
      modOsc.frequency.setValueAtTime(modFreq, t0);
      modOsc.detune.setValueAtTime(mod.detune || 0, t0);
      modGain = ctx.createGain();
      modOsc.connect(modGain);
      if (modType === 'fm') {
        modGain.gain.setValueAtTime(fmDeviation(mod.depth, modFreq), t0);
        modGain.connect(sine.frequency);
        modGain.connect(other.frequency);
      } else {
        const { base, swing } = amGains(mod.depth);
        amNode.gain.value = base;
        modGain.gain.value = swing;
        modGain.connect(amNode.gain);
      }
    }
    const allOscs = modOsc ? [sine, other, modOsc] : [sine, other];
    // The choke sits after the gate so a later note on the same mono line can cut
    // this one off without touching its own envelope automation.
    const choke = ctx.createGain();
    filter.connect(amp).connect(choke).connect(out);
    if (mono) {
      this.monoLines.get(mono)?.cut(t0);
      this.monoLines.set(mono, {
        start: t0,
        end,
        freq,
        oscs: [sine, other],
        modOsc,
        modGain,
        modType,
        modFreq,
        modDepth: modType ? mod.depth : 0,
        cut: (at) => {
          const fade = 0.003;
          const from = Math.max(t0, at - fade);
          choke.gain.setValueAtTime(1, from);
          choke.gain.linearRampToValueAtTime(0, Math.max(from + 0.001, at));
          for (const osc of allOscs) {
            try { osc.stop(at + 0.01); } catch { /* already stopped */ }
          }
        },
      });
    }
    for (const osc of allOscs) {
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

  /**
   * Move whatever is still ringing on a mono line to `note` at time `at`, without
   * re-striking it (a fast 6 ms glide, so there is no click). Returns false when
   * the line's last note has already finished.
   */
  retune(mono, note, at, modNote = null) {
    const line = this.monoLines.get(mono);
    if (!line || at <= line.start || at >= line.end) return false;
    const glide = (param, from, to) => {
      param.setValueAtTime(from, at);
      param.exponentialRampToValueAtTime(to, at + 0.006);
    };
    const f = mtof(note);
    for (const osc of line.oscs) glide(osc.frequency, line.freq, f);
    line.freq = f;
    // The modulator follows oscillator 2's new pitch; FM depth scales with it.
    if (line.modOsc && modNote !== null) {
      const mf = mtof(modNote);
      glide(line.modOsc.frequency, line.modFreq, mf);
      if (line.modType === 'fm') {
        glide(line.modGain.gain, fmDeviation(line.modDepth, line.modFreq), fmDeviation(line.modDepth, mf));
      }
      line.modFreq = mf;
    }
    return true;
  }

  /** Quickly fade and kill every sounding or scheduled voice. */
  panic() {
    const now = this.ctx.currentTime;
    this.monoLines.clear();
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
