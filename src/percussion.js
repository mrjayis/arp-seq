// Vintage preset-box style Latin percussion: analog-modelled voices and one-bar
// 16th-note patterns. 'X' = accented hit, 'x' = normal hit, '.' = rest.

export const DRUM_STEPS = 16;

export const VOICES = [
  { id: 'kick', label: 'Bass', gm: 36 },
  { id: 'congaLo', label: 'Conga L', gm: 64 },
  { id: 'congaHi', label: 'Conga H', gm: 63 },
  { id: 'bongoLo', label: 'Bongo L', gm: 61 },
  { id: 'bongoHi', label: 'Bongo H', gm: 60 },
  { id: 'claves', label: 'Claves', gm: 75 },
  { id: 'cowbell', label: 'Cowbell', gm: 56 },
  { id: 'maracas', label: 'Maracas', gm: 70 },
  { id: 'guiro', label: 'Guiro', gm: 73 },
];

// Patterns written from the standard grooves of each style (son/rumba clave,
// tumbao, bossa bass, etc.). Missing voices are silent.
export const DRUM_PRESETS = {
  'Bossa Nova': {
    kick: 'X..xX..xX..xX..x',
    claves: 'x..x..x...x..x..',
    maracas: 'XxxxXxxxXxxxXxxx',
    congaLo: '......x.......x.',
  },
  Samba: {
    kick: 'x..Xx..Xx..Xx..X',
    congaLo: '....X.......X...',
    bongoHi: 'x.xx.x.xx.xx.x.x',
    cowbell: 'X.x..x.x..X.x.x.',
    maracas: 'XxxxXxxxXxxxXxxx',
  },
  'Cha-Cha': {
    kick: 'X.......X.....x.',
    cowbell: 'X...x...X...x...',
    guiro: 'X...x.x.X...x.x.',
    congaHi: '....X.......X...',
    congaLo: '..............XX',
    claves: 'x..x..x...x.x...',
  },
  Mambo: {
    kick: 'X.....x.X.....x.',
    cowbell: 'X.x.X.x.X.x.X.x.',
    congaHi: '....X.......X...',
    congaLo: '......XX......XX',
    claves: '..x.x...x..x..x.',
    bongoHi: 'x.xxx.xxx.xxx.xx',
  },
  Rhumba: {
    kick: 'X.......X.......',
    claves: 'x..x...x..x.x...',
    congaHi: '...x..X....x..X.',
    congaLo: 'X.......X.....x.',
    maracas: 'X.x.X.x.X.x.X.x.',
  },
  Beguine: {
    kick: 'X.....x.X.......',
    bongoLo: '....x.......x...',
    bongoHi: '..x.X.x...x.X.x.',
    claves: 'x.....x...x.....',
    maracas: 'X.x.X.x.X.x.X.x.',
  },
  Tango: {
    kick: 'X..x..x.X.......',
    claves: 'X..x..x.X.......',
    guiro: '........X...X...',
    cowbell: '............x...',
  },
};

/** Parse a preset into {voiceId: Array<0 | 0.65 | 1>} with every voice present. */
export function parsePattern(preset = {}) {
  const rows = {};
  for (const { id } of VOICES) {
    const str = (preset[id] || '').padEnd(DRUM_STEPS, '.').slice(0, DRUM_STEPS);
    rows[id] = [...str].map((c) => (c === 'X' ? 1 : c === 'x' ? 0.65 : 0));
  }
  return rows;
}

/** Voices that hit on `step`, as [{id, gain}]. */
export function hitsAt(rows, step, muted = {}) {
  const s = ((step % DRUM_STEPS) + DRUM_STEPS) % DRUM_STEPS;
  return VOICES.filter(({ id }) => !muted[id] && rows[id]?.[s] > 0).map(({ id }) => ({ id, gain: rows[id][s] }));
}

// ------------------------------------------------------------------ sound

export class DrumSynth {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.7;
    this.out.connect(destination);
    // One second of white noise, shared by the noise-based voices.
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  setLevel(v) {
    this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  play(id, time, gain = 1) {
    const t = Math.max(time, this.ctx.currentTime);
    const fn = this[id];
    if (typeof fn === 'function') fn.call(this, t, gain);
  }

  // Envelope helper: instant attack, exponential decay to silence.
  env(t, peak, decay) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    g.connect(this.out);
    return g;
  }

  // Pitched membrane: a sine that drops quickly from `f0 * bend` to `f0`.
  tone(t, gain, f0, decay, bend = 1.6, type = 'sine') {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0 * bend, t);
    osc.frequency.exponentialRampToValueAtTime(f0, t + 0.03);
    osc.connect(this.env(t, gain, decay));
    osc.start(t);
    osc.stop(t + decay + 0.02);
  }

  noiseHit(t, gain, decay, type, freq, q = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.env(t, gain, decay);
    src.connect(f).connect(g);
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.02);
    return g;
  }

  kick(t, g) { this.tone(t, g * 0.9, 55, 0.32, 2.4); }
  congaLo(t, g) { this.tone(t, g * 0.55, 190, 0.22, 1.25); }
  congaHi(t, g) { this.tone(t, g * 0.5, 285, 0.17, 1.25); }
  bongoLo(t, g) { this.tone(t, g * 0.45, 400, 0.12, 1.15); }
  bongoHi(t, g) { this.tone(t, g * 0.42, 560, 0.09, 1.15); }
  claves(t, g) { this.tone(t, g * 0.4, 2500, 0.045, 1); }

  cowbell(t, g) {
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 800;
    bp.Q.value = 2.5;
    bp.connect(this.env(t, g * 0.35, 0.28));
    for (const f of [540, 800]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      osc.connect(bp);
      osc.start(t);
      osc.stop(t + 0.3);
    }
  }

  maracas(t, g) { this.noiseHit(t, g * 0.22, 0.05, 'highpass', 6000); }

  guiro(t, g) {
    // A scrape: band-passed noise chopped by a fast square-wave tremolo.
    const out = this.noiseHit(t, g * 1.1, 0.16, 'bandpass', 3200, 1.5);
    const chop = this.ctx.createGain();
    chop.gain.value = 0.5;
    const lfo = this.ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 45;
    const depth = this.ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(chop.gain);
    out.disconnect();
    out.connect(chop).connect(this.out);
    lfo.start(t);
    lfo.stop(t + 0.2);
  }
}
