// Clock sources. Both emit 24-PPQN pulses via onPulse(time, pulseIndex, pulseDuration),
// where `time` is in the same domain as getTime() (AudioContext seconds in the app).

import { PPQN } from './core.js?v=67';

/** Look-ahead scheduler driven by an internal tempo. */
export class InternalClock {
  constructor({ getTime, onPulse, bpm = 120, lookahead = 0.12, startDelay = 0.05 }) {
    this.getTime = getTime;
    this.onPulse = onPulse;
    this.bpm = bpm;
    this.lookahead = lookahead;
    this.startDelay = startDelay;
    this.running = false;
  }

  get pulseDuration() {
    return 60 / (this.bpm * PPQN);
  }

  setBpm(bpm) {
    this.bpm = Math.min(300, Math.max(20, bpm));
  }

  start() {
    this.running = true;
    this.pulse = 0;
    this.nextTime = this.getTime() + this.startDelay;
    this.pump();
  }

  stop() {
    this.running = false;
  }

  /** Schedule every pulse that falls inside the look-ahead window. Call often. */
  pump() {
    if (!this.running) return;
    const horizon = this.getTime() + this.lookahead;
    while (this.nextTime < horizon) {
      this.onPulse(this.nextTime, this.pulse, this.pulseDuration);
      this.pulse++;
      this.nextTime += this.pulseDuration;
    }
  }
}

/** Follows incoming MIDI clock (0xF8) with Start/Continue/Stop transport. */
export class ExternalClock {
  constructor({ getTime, onPulse, onStart, onStop, latency = 0.01 }) {
    this.getTime = getTime;
    this.onPulse = onPulse;
    this.onStart = onStart;
    this.onStop = onStop;
    this.latency = latency;
    this.running = false;
    this.pulse = 0;
    this.intervals = [];
    this.lastTickTime = null;
  }

  /** Estimated pulse duration (s) from a moving average of recent ticks. */
  get pulseDuration() {
    if (!this.intervals.length) return 60 / (120 * PPQN);
    return this.intervals.reduce((a, b) => a + b, 0) / this.intervals.length;
  }

  get bpm() {
    return 60 / (this.pulseDuration * PPQN);
  }

  start() {
    this.running = true;
    this.pulse = 0;
    this.onStart?.();
  }

  continue() {
    this.running = true;
  }

  stop() {
    this.running = false;
    this.onStop?.();
  }

  /** Feed a raw MIDI message. `stamp` is the arrival time in seconds (getTime domain). */
  handle(status, stamp = this.getTime()) {
    switch (status) {
      case 0xf8: {
        if (this.lastTickTime !== null) {
          const dt = stamp - this.lastTickTime;
          // Ignore gaps (e.g. a paused source) when estimating tempo.
          if (dt > 0 && dt < 0.25) {
            this.intervals.push(dt);
            if (this.intervals.length > 24) this.intervals.shift();
          }
        }
        this.lastTickTime = stamp;
        if (this.running) {
          this.onPulse(Math.max(stamp, this.getTime()) + this.latency, this.pulse, this.pulseDuration);
          this.pulse++;
        }
        break;
      }
      case 0xfa:
        this.start();
        break;
      case 0xfb:
        this.continue();
        break;
      case 0xfc:
        this.stop();
        break;
      default:
        break;
    }
  }
}

/**
 * Converts pulses into arp steps. Steps land on the global pulse grid, so
 * changing the rate mid-play stays in sync with the clock.
 * Returns null if the pulse is not a step, else {time, duration, stepNumber}.
 */
export function pulseToStep(pulse, time, pulseDuration, pulsesPerStep, swing = 0) {
  if (pulse % pulsesPerStep !== 0) return null;
  const stepNumber = pulse / pulsesPerStep;
  const duration = pulsesPerStep * pulseDuration;
  // Swing delays every off-beat step by up to half a step (swing 0..1 → 0..50%).
  const delay = stepNumber % 2 === 1 ? swing * 0.5 * duration : 0;
  return { time: time + delay, duration, stepNumber, delay };
}
