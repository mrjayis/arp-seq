// A Moog Prodigy-style mono bass voice for oscillator 2: two oscillators (prodigy-worklet.js,
// with hard sync), a 24 dB low-pass (two resonant stages, Emphasis on the second) with its
// own contour, a loudness contour, and glide. One voice that every note plays through, so a
// note that overlaps the last one with Glide on slides to it without starting the contours again.

export const PRODIGY_WAVES = [['0', 'Triangle'], ['1', 'Saw'], ['2', 'Square']];

/** The Prodigy's settings as the voice wants them, from the app's (ms, %, Hz). */
export const prodigyDefaults = {
  prodWave1: 1, prodWave2: 1, prodInterval: 7, prodFine: 6, prodMix: 45, prodSync: false, prodSweep: 45,
  prodCutoff: 420, prodEmphasis: 35, prodContour: 60, prodAttack: 2, prodFDecay: 260, prodFSustain: 15,
  prodDecay: 500, prodSustain: 75, prodRelease: 60, prodGlide: 0,
};

const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);
const clampHz = (f) => Math.min(18000, Math.max(20, f));

/**
 * The filter's cutoff at the top of the contour and where it settles, for a note of `freq` Hz:
 * the Cutoff, tracking the keyboard by half (an octave up, half an octave brighter), opened by
 * up to 7 octaves by the Contour amount (and its Sustain).
 */
export function prodigyCutoffs(freq, { cutoff, contour, fsustain }) {
  const base = clampHz(cutoff * Math.pow(freq / 130.81, 0.5));
  const span = (contour / 100) * 7;
  return { base, peak: clampHz(base * Math.pow(2, span)), sustain: clampHz(base * Math.pow(2, span * (fsustain / 100))) };
}

/** Osc 2's frequency ratio to Osc 1: its interval (semitones) and fine tune (cents). */
export const prodigyRatio = (interval, fine) => Math.pow(2, (interval + fine / 100) / 12);

export class ProdigyVoice {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.osc = new AudioWorkletNode(ctx, 'prodigy-oscillators', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
    this.f1 = ctx.createBiquadFilter();
    this.f2 = ctx.createBiquadFilter();
    for (const f of [this.f1, this.f2]) { f.type = 'lowpass'; f.frequency.value = 400; }
    this.f1.Q.value = 0;
    this.amp = ctx.createGain();
    this.amp.gain.value = 0;
    this.level = ctx.createGain();
    this.osc.connect(this.f1).connect(this.f2).connect(this.amp).connect(this.level).connect(out);
    this.heldUntil = 0; // when the last note lets go (a note before then is legato)
    this.p = (name) => this.osc.parameters.get(name);
  }

  /** Play `note` (MIDI, may be fractional) at `time` for `gate` seconds. `s`: the prod* settings. */
  play(note, velocity, time, gate, s, level = 1) {
    const ctx = this.ctx;
    const t = Math.max(time, ctx.currentTime);
    const freq = mtof(note);
    const vel = velocity / 127;
    const legato = t < this.heldUntil && s.prodGlide > 0;
    const off = t + Math.max(0.02, gate);
    this.heldUntil = off;
    const ms = (v) => Math.max(0.001, v / 1000);
    // The oscillators.
    this.p('wave1').setValueAtTime(s.prodWave1, t);
    this.p('wave2').setValueAtTime(s.prodWave2, t);
    this.p('mix').setValueAtTime(s.prodMix / 100, t);
    this.p('sync').setValueAtTime(s.prodSync ? 1 : 0, t);
    const fp = this.p('freq');
    fp.cancelScheduledValues(t);
    if (legato) fp.setTargetAtTime(freq, t, ms(s.prodGlide) / 3); // glide to it
    else fp.setValueAtTime(freq, t);
    // Osc 2: its interval, swept up by the filter contour when synced (the sync sweep).
    const r0 = prodigyRatio(s.prodInterval, s.prodFine);
    const rp = this.p('ratio');
    rp.cancelScheduledValues(t);
    const sweep = s.prodSync ? (s.prodSweep / 100) * 36 : 0; // up to 3 octaves
    if (legato) rp.setTargetAtTime(r0 * Math.pow(2, (sweep * (s.prodFSustain / 100)) / 12), t, ms(s.prodGlide) / 3);
    else {
      rp.setValueAtTime(r0, t);
      if (sweep) {
        rp.setTargetAtTime(r0 * Math.pow(2, sweep / 12), t, ms(s.prodAttack) / 3);
        rp.setTargetAtTime(r0 * Math.pow(2, (sweep * (s.prodFSustain / 100)) / 12), t + ms(s.prodAttack), ms(s.prodFDecay) / 3);
      }
      rp.setTargetAtTime(r0, off, ms(s.prodRelease) / 3);
    }
    // The filter: Emphasis on the second stage (up to 24 dB of resonance).
    this.f2.Q.setValueAtTime((s.prodEmphasis / 100) * 24, t);
    const c = prodigyCutoffs(freq, { cutoff: s.prodCutoff, contour: s.prodContour * (0.6 + 0.4 * vel), fsustain: s.prodFSustain });
    for (const f of [this.f1, this.f2]) {
      const fq = f.frequency;
      fq.cancelScheduledValues(t);
      if (!legato) {
        fq.setValueAtTime(c.base, t);
        fq.setTargetAtTime(c.peak, t, ms(s.prodAttack) / 3);
        fq.setTargetAtTime(c.sustain, t + ms(s.prodAttack), ms(s.prodFDecay) / 3);
      } else fq.setTargetAtTime(c.sustain, t, ms(s.prodGlide) / 3);
      fq.setTargetAtTime(c.base, off, ms(s.prodRelease) / 3);
    }
    // Loudness.
    const peak = (0.45 + 0.55 * vel) * 0.9;
    const g = this.amp.gain;
    g.cancelScheduledValues(t);
    if (!legato) {
      g.setTargetAtTime(peak, t, ms(s.prodAttack) / 3);
      g.setTargetAtTime(peak * (s.prodSustain / 100), t + ms(s.prodAttack), ms(s.prodDecay) / 3);
    } else g.setTargetAtTime(peak * (s.prodSustain / 100), t, 0.02);
    g.setTargetAtTime(0, off, ms(s.prodRelease) / 3);
    this.level.gain.setTargetAtTime(level, t, 0.01);
  }

  /** Stop at once (Stop, or the sound changed). */
  silence(time = this.ctx.currentTime) {
    this.amp.gain.cancelScheduledValues(time);
    this.amp.gain.setTargetAtTime(0, time, 0.01);
    this.heldUntil = 0;
  }
}
