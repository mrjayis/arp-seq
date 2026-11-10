// Shared send effects: a tempo-synced (optionally ping-pong) delay and a
// convolution reverb with a generated stereo impulse response.

import { PPQN, RATES } from './core.js?v=59';

export const DELAY_TIMES = ['1/16', '1/8T', '1/8', '1/8D', '1/4T', '1/4', '1/4D', '1/2'];
const EXTRA_PULSES = { '1/4T': 16, '1/4D': 36, '1/2': 48 };
const MAX_DELAY = 4; // seconds

/** Seconds for a note-value delay at a tempo. */
export function delaySeconds(division, bpm) {
  const pulses = RATES[division] ?? EXTRA_PULSES[division] ?? RATES['1/8'];
  return Math.min(MAX_DELAY, (pulses / PPQN) * (60 / Math.max(1, bpm)));
}

/**
 * Fill stereo impulse-response channels: decorrelated noise under an exponential
 * decay reaching −60 dB at `seconds`, with the high end dying faster ("damping")
 * by blending toward a running average as time goes on.
 */
export function fillImpulse(channels, sampleRate, seconds, damping = 0.5, rng = Math.random) {
  const n = channels[0].length;
  const k = Math.log(1000) / Math.max(0.05, seconds); // amplitude e^(−k t): −60 dB at `seconds`
  for (const data of channels) {
    let smooth = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const white = rng() * 2 - 1;
      // More smoothing later in the tail = darker as it decays.
      const a = Math.min(0.97, damping * (t / Math.max(0.05, seconds)) * 1.6);
      smooth = a * smooth + (1 - a) * white;
      data[i] = smooth * Math.exp(-k * t);
    }
  }
  return channels;
}

/**
 * Two delay lines of equal time. Ping-pong: input → L, L → R, R → back into L, so
 * echoes alternate L, R, L… Normal: input → both, so every echo is centred.
 * The feedback path runs through a low-pass "tone" filter, like tape/analog repeats.
 */
export class Delay {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.left = ctx.createDelay(MAX_DELAY);
    this.right = ctx.createDelay(MAX_DELAY);
    this.toRight = ctx.createGain(); // normal mode: feed R directly
    this.cross = ctx.createGain(); // ping-pong: L feeds R
    this.feedback = ctx.createGain();
    const merger = ctx.createChannelMerger(2);
    this.out = ctx.createGain();

    this.input.connect(this.tone);
    this.tone.connect(this.left);
    this.tone.connect(this.toRight).connect(this.right);
    this.left.connect(this.cross).connect(this.right);
    this.right.connect(this.feedback).connect(this.tone);
    this.left.connect(merger, 0, 0);
    this.right.connect(merger, 0, 1);
    merger.connect(this.out).connect(destination);

    this.setTone(4500);
    this.setFeedback(0.35);
    this.setPingPong(true);
  }

  setTime(seconds) {
    const now = this.ctx.currentTime;
    this.left.delayTime.setTargetAtTime(seconds, now, 0.03);
    this.right.delayTime.setTargetAtTime(seconds, now, 0.03);
  }

  /** Each echo is `f` times the one before, in either mode. */
  setFeedback(f) {
    this.fb = Math.min(0.92, Math.max(0, f));
    this.feedback.gain.setTargetAtTime(this.fb, this.ctx.currentTime, 0.03);
    // In ping-pong the L → R hop is itself an echo, so it gets the feedback too.
    if (this.pingPongOn) this.cross.gain.setTargetAtTime(this.fb, this.ctx.currentTime, 0.03);
  }

  setTone(hz) {
    this.tone.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.03);
  }

  setPingPong(on) {
    const now = this.ctx.currentTime;
    this.pingPongOn = !!on;
    this.cross.gain.setTargetAtTime(on ? this.fb ?? 0.35 : 0, now, 0.02);
    this.toRight.gain.setTargetAtTime(on ? 0 : 1, now, 0.02);
  }
}

export class Reverb {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.pre = ctx.createDelay(0.25);
    this.convolver = ctx.createConvolver();
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.out = ctx.createGain();
    this.input.connect(this.pre).connect(this.convolver).connect(this.tone).connect(this.out).connect(destination);
    this.size = 0;
    this.damping = 0;
    this.setTone(7000);
    this.setPreDelay(0.02);
  }

  /** Rebuild the impulse response (seconds of tail, damping 0..1). */
  setSize(seconds, damping = this.damping || 0.5) {
    if (Math.abs(seconds - this.size) < 0.01 && Math.abs(damping - this.damping) < 0.01) return;
    this.size = seconds;
    this.damping = damping;
    const rate = this.ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * Math.min(10, seconds * 1.1)));
    const ir = this.ctx.createBuffer(2, length, rate);
    fillImpulse([ir.getChannelData(0), ir.getChannelData(1)], rate, seconds, damping);
    this.convolver.buffer = ir;
  }

  setPreDelay(seconds) {
    this.pre.delayTime.setTargetAtTime(seconds, this.ctx.currentTime, 0.02);
  }

  setTone(hz) {
    this.tone.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.03);
  }
}
