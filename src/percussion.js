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

// ---- more kits. Ids are unique across kits (each maps to a DrumSynth method).

const VOICES_808 = [
  { id: 'bd808', label: 'Kick', gm: 36 },
  { id: 'sd808', label: 'Snare', gm: 38 },
  { id: 'cp808', label: 'Clap', gm: 39 },
  { id: 'rs808', label: 'Rim', gm: 37 },
  { id: 'lt808', label: 'Low Tom', gm: 45 },
  { id: 'ht808', label: 'Hi Tom', gm: 50 },
  { id: 'cb808', label: 'Cowbell', gm: 56 },
  { id: 'ch808', label: 'Closed HH', gm: 42 },
  { id: 'oh808', label: 'Open HH', gm: 46 },
];

const PRESETS_808 = {
  Electro: {
    bd808: 'X.....X...X.....',
    cp808: '....X.......X...',
    ch808: 'x.x.x.x.x.x.x.x.',
    cb808: '......x.......x.',
    ht808: '.............x..',
  },
  'Boom Bap': {
    bd808: 'X......X..X.....',
    sd808: '....X.......X...',
    ch808: 'x.x.x.x.x.x.x.xx',
    oh808: '..............x.',
    rs808: '..x.......x.....',
  },
  House: {
    bd808: 'X...X...X...X...',
    cp808: '....X.......X...',
    oh808: '..X...X...X...X.',
    ch808: 'x...x...x...x...',
  },
  'Half-time': {
    bd808: 'X......X..X..x..',
    sd808: '........X.......',
    ch808: 'xxxxxxxxxXxXxxxx',
    oh808: '...........x....',
    lt808: '..............X.',
  },
};

const VOICES_LINN = [
  { id: 'bdLinn', label: 'Kick', gm: 36 },
  { id: 'sdLinn', label: 'Snare', gm: 38 },
  { id: 'cpLinn', label: 'Clap', gm: 39 },
  { id: 'chLinn', label: 'Hi-hat', gm: 42 },
  { id: 'ohLinn', label: 'Open HH', gm: 46 },
  { id: 'tamb', label: 'Tamb', gm: 54 },
  { id: 'cabasa', label: 'Cabasa', gm: 69 },
  { id: 'tomLinn', label: 'Tom', gm: 47 },
  { id: 'cbLinn', label: 'Cowbell', gm: 56 },
];

const PRESETS_LINN = {
  'Synth Pop': {
    bdLinn: 'X...X...X...X...',
    sdLinn: '....X.......X...',
    chLinn: 'x.x.x.x.x.x.x.x.',
    tamb: '....x.......x...',
  },
  Funk: {
    bdLinn: 'X..X..X...X..X..',
    sdLinn: '....X..x.x..X...',
    chLinn: 'XxxxXxxxXxxxXxxx',
    cabasa: 'x.x.x.x.x.x.x.x.',
    ohLinn: '..............x.',
  },
  Ballad: {
    bdLinn: 'X.......X.x.....',
    sdLinn: '........X.......',
    chLinn: 'x.x.x.x.x.x.x.x.',
    tamb: '........x.......',
    tomLinn: '.............XxX',
  },
  'New Wave': {
    bdLinn: 'X.x.X.x.X.x.X.x.',
    sdLinn: '....X.......X...',
    cpLinn: '....X.......X...',
    chLinn: 'xxxxxxxxxxxxxxxx',
    cbLinn: 'x.....x.....x...',
  },
};

/** Menu order (a numeric key like '808' would otherwise sort first). */
export const KIT_ORDER = ['latin', '808', 'linn'];

export const KITS = {
  latin: { label: 'Latin', voices: VOICES, presets: DRUM_PRESETS },
  808: { label: '808-style', voices: VOICES_808, presets: PRESETS_808 },
  linn: { label: 'Linn-style', voices: VOICES_LINN, presets: PRESETS_LINN },
};

/** Parse a preset into {voiceId: Array<0 | 0.65 | 1>} with every voice of the kit present. */
export function parsePattern(preset = {}, voices = VOICES) {
  const rows = {};
  for (const { id } of voices) {
    const str = (preset[id] || '').padEnd(DRUM_STEPS, '.').slice(0, DRUM_STEPS);
    rows[id] = [...str].map((c) => (c === 'X' ? 1 : c === 'x' ? 0.65 : 0));
  }
  return rows;
}

/** Voices that hit on `step`, as [{id, gain}]. */
export function hitsAt(rows, step, muted = {}, voices = VOICES) {
  const s = ((step % DRUM_STEPS) + DRUM_STEPS) % DRUM_STEPS;
  return voices.filter(({ id }) => !muted[id] && rows[id]?.[s] > 0).map(({ id }) => ({ id, gain: rows[id][s] }));
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
  env(t, peak, decay, dest = null) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    g.connect(dest || this.out);
    return g;
  }

  // Pitched membrane: a sine that drops from `f0 * bend` to `f0` over `sweep` seconds.
  tone(t, gain, f0, decay, bend = 1.6, type = 'sine', sweep = 0.03, dest = null) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0 * bend, t);
    osc.frequency.exponentialRampToValueAtTime(f0, t + sweep);
    osc.connect(this.env(t, gain, decay, dest));
    osc.start(t);
    osc.stop(t + decay + 0.02);
  }

  noiseHit(t, gain, decay, type, freq, q = 1, dest = null) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.env(t, gain, decay, dest);
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

  // ---------------------------------------------------------------- 808-style

  /** Open hats ring until the next closed hat of the same kit chokes them. */
  hatBus(t, kit, open) {
    const bus = this.ctx.createGain();
    bus.connect(this.out);
    this.chokes ??= {};
    const prev = this.chokes[kit];
    if (prev && !open) {
      prev.gain.setValueAtTime(1, t);
      prev.gain.linearRampToValueAtTime(0, t + 0.006);
    }
    if (open) this.chokes[kit] = bus;
    return bus;
  }

  /** Six detuned square waves through band- and high-pass: the metallic 808 hat source. */
  metal(t, gain, decay, dest) {
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 10000;
    bp.Q.value = 0.8;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    bp.connect(hp).connect(this.env(t, gain, decay, dest));
    for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f * 1.5;
      o.connect(bp);
      o.start(t);
      o.stop(t + decay + 0.02);
    }
  }

  /** Hand clap: three quick noise bursts, then a short tail. */
  clap(t, g, freq, tail) {
    for (const [dt, a] of [[0, 1], [0.011, 0.85], [0.022, 0.75]]) this.noiseHit(t + dt, g * a, 0.012, 'bandpass', freq, 1.2);
    this.noiseHit(t + 0.03, g * 0.7, tail, 'bandpass', freq, 1.1);
  }

  bd808(t, g) {
    this.tone(t, g * 1.1, 48, 1.3, 2.6, 'sine', 0.06); // the long 808 boom
    this.noiseHit(t, g * 0.08, 0.008, 'lowpass', 2500);
  }
  sd808(t, g) {
    this.tone(t, g * 0.35, 180, 0.12, 1.1, 'triangle');
    this.tone(t, g * 0.25, 330, 0.09, 1.05, 'triangle');
    this.noiseHit(t, g * 0.4, 0.2, 'highpass', 1800);
  }
  cp808(t, g) { this.clap(t, g * 2.6, 1150, 0.22); }
  rs808(t, g) {
    this.tone(t, g * 0.35, 1720, 0.025, 1, 'triangle');
    this.tone(t, g * 0.3, 475, 0.03, 1, 'sine');
  }
  lt808(t, g) { this.tone(t, g * 0.7, 82, 0.38, 1.25, 'sine', 0.08); }
  ht808(t, g) { this.tone(t, g * 0.6, 140, 0.28, 1.25, 'sine', 0.07); }
  cb808(t, g) { this.cowbell(t, g); }
  ch808(t, g) { this.metal(t, g * 0.5, 0.05, this.hatBus(t, '808', false)); }
  oh808(t, g) { this.metal(t, g * 0.45, 0.42, this.hatBus(t, '808', true)); }

  // ---------------------------------------------------------------- Linn-style
  // Tighter and punchier: short sweeps, a click on the kick, brighter noise.

  bdLinn(t, g) {
    this.tone(t, g * 1.0, 56, 0.3, 2.5, 'sine', 0.025);
    this.noiseHit(t, g * 0.25, 0.006, 'lowpass', 4000);
  }
  sdLinn(t, g) {
    this.tone(t, g * 0.35, 205, 0.1, 1.3, 'triangle', 0.015);
    this.noiseHit(t, g * 0.55, 0.24, 'bandpass', 3800, 0.7);
    this.noiseHit(t, g * 0.2, 0.08, 'highpass', 6000);
  }
  cpLinn(t, g) { this.clap(t, g * 1.9, 1600, 0.16); }
  chLinn(t, g) { this.noiseHit(t, g * 0.35, 0.045, 'highpass', 8500, 0.9, this.hatBus(t, 'linn', false)); }
  ohLinn(t, g) { this.noiseHit(t, g * 0.3, 0.32, 'highpass', 8000, 0.9, this.hatBus(t, 'linn', true)); }
  tamb(t, g) {
    for (const [dt, a] of [[0, 1], [0.018, 0.6], [0.034, 0.45]]) this.noiseHit(t + dt, g * 1.1 * a, 0.12, 'bandpass', 7200, 3);
  }
  cabasa(t, g) { this.noiseHit(t, g * 0.25, 0.06, 'highpass', 9500); }
  tomLinn(t, g) {
    this.tone(t, g * 0.65, 120, 0.32, 1.5, 'sine', 0.05);
    this.noiseHit(t, g * 0.08, 0.04, 'bandpass', 1200);
  }
  cbLinn(t, g) {
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 3;
    bp.connect(this.env(t, g * 0.45, 0.2));
    for (const f of [587, 845]) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.connect(bp);
      o.start(t);
      o.stop(t + 0.22);
    }
  }
}
