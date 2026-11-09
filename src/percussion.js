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
  { id: 'cl808', label: 'Claves', gm: 75 },
  { id: 'ma808', label: 'Maracas', gm: 70 },
  { id: 'lt808', label: 'Low Tom', gm: 45 },
  { id: 'ht808', label: 'Hi Tom', gm: 50 },
  { id: 'lc808', label: 'Low Conga', gm: 64 },
  { id: 'mc808', label: 'Mid Conga', gm: 63 },
  { id: 'hc808', label: 'Hi Conga', gm: 62 },
  { id: 'cb808', label: 'Cowbell', gm: 56 },
  { id: 'ch808', label: 'Closed HH', gm: 42 },
  { id: 'oh808', label: 'Open HH', gm: 46 },
  { id: 'cy808', label: 'Cymbal', gm: 49 },
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

// ---- "Your samples": a kit the user fills with their own recordings (kept in
// their browser). Rows cover a LinnDrum-style set of sounds.

export const VOICES_USER = [
  { id: 'u_kick', label: 'Kick', gm: 36 },
  { id: 'u_snare', label: 'Snare', gm: 38 },
  { id: 'u_rim', label: 'Rimshot', gm: 37 },
  { id: 'u_clap', label: 'Clap', gm: 39 },
  { id: 'u_chh', label: 'Closed HH', gm: 42 },
  { id: 'u_ohh', label: 'Open HH', gm: 46 },
  { id: 'u_tomhi', label: 'Tom Hi', gm: 50 },
  { id: 'u_tomlo', label: 'Tom Lo', gm: 45 },
  { id: 'u_tamb', label: 'Tamb', gm: 54 },
  { id: 'u_cabasa', label: 'Cabasa', gm: 69 },
  { id: 'u_cowbell', label: 'Cowbell', gm: 56 },
  { id: 'u_cymbal', label: 'Cymbal', gm: 49 },
];

// The Linn-style patterns, moved onto the sample rows.
const LINN_TO_USER = {
  bdLinn: 'u_kick', sdLinn: 'u_snare', cpLinn: 'u_clap', chLinn: 'u_chh', ohLinn: 'u_ohh',
  tamb: 'u_tamb', cabasa: 'u_cabasa', tomLinn: 'u_tomlo', cbLinn: 'u_cowbell',
};
const PRESETS_USER = Object.fromEntries(Object.entries(PRESETS_LINN).map(([name, rows]) => [
  name, Object.fromEntries(Object.entries(rows).map(([id, row]) => [LINN_TO_USER[id], row])),
]));

// Filename → row, by the first three letters of the name (after any brand
// prefix and track number), so e.g. CLAP can never land on the hi-hat row.
const BY_PREFIX = {
  kic: 'u_kick', kik: 'u_kick', bas: 'u_kick', bdr: 'u_kick',
  sna: 'u_snare', snr: 'u_snare',
  rim: 'u_rim', sid: 'u_rim', sst: 'u_rim', sti: 'u_rim',
  cla: 'u_clap', han: 'u_clap',
  chh: 'u_chh', clo: 'u_chh', hhc: 'u_chh', hih: 'u_chh', hat: 'u_chh',
  ohh: 'u_ohh', ope: 'u_ohh', hho: 'u_ohh',
  tam: 'u_tamb',
  cab: 'u_cabasa', sha: 'u_cabasa',
  cow: 'u_cowbell',
  cra: 'u_cymbal', rid: 'u_cymbal', cym: 'u_cymbal',
};
// Two-letter codes, used only when followed by a number or nothing (BD, SD2, CH1…).
const BY_CODE = {
  bd: 'u_kick', sd: 'u_snare', rs: 'u_rim', cp: 'u_clap', ch: 'u_chh', hh: 'u_chh',
  oh: 'u_ohh', cb: 'u_cowbell', cy: 'u_cymbal',
};
const BRAND_WORDS = new Set(['linn', 'linndrum', 'ld', 'lm', 'lm1', 'lm2', 'drum', 'drums']);

/** Lower-case words of a filename, without extension, track number or brand words. */
export function sampleWords(filename, sharedPrefix = '') {
  let name = filename.toLowerCase().replace(/\.[a-z0-9]+$/, '');
  if (sharedPrefix && name.startsWith(sharedPrefix)) name = name.slice(sharedPrefix.length);
  const words = name.replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  while (words.length > 1 && (/^\d+$/.test(words[0]) || BRAND_WORDS.has(words[0]))) words.shift();
  return words;
}

/** Which row a sample file belongs to, from the first three letters of its name, or null. */
export function matchSlot(filename, sharedPrefix = '') {
  const words = sampleWords(filename, sharedPrefix);
  const compact = words.join('');
  const p3 = compact.slice(0, 3);
  if (p3 === 'tom') {
    const rest = compact.slice(3);
    if (/^(hi|high|h|1)/.test(rest)) return 'u_tomhi';
    if (/^(lo|low|l|3|floor|f)/.test(rest)) return 'u_tomlo';
    return null; // a mid tom has no row of its own
  }
  const code = compact.slice(0, 2);
  const slot = BY_PREFIX[p3] || (BY_CODE[code] && (compact.length === 2 || /\d/.test(compact[2])) ? BY_CODE[code] : null);
  // Hi-hats often say open/closed after the word ("Hat Open", "HH Closed"): the
  // qualifier decides, unless the name already starts with CHH or OHH.
  if ((slot === 'u_chh' || slot === 'u_ohh') && p3 !== 'chh' && p3 !== 'ohh') {
    const rest = words.join(' ').replace(/^(hi ?hat|hihat|hat|hh|ch|oh)\s*/, '');
    if (/\b(open|opn|op|o)\b|^o\d*$|open/.test(rest) || /hhop|hho/.test(compact)) return 'u_ohh';
    if (/\b(closed|clsd|cl|c)\b|^c\d*$|closed/.test(rest)) return 'u_chh';
  }
  if (slot) return slot;
  // "High Tom" / "Floor Tom" style names.
  const joined = words.join(' ');
  if (/\b(hi|high) tom/.test(joined)) return 'u_tomhi';
  if (/\b(lo|low|floor) tom/.test(joined)) return 'u_tomlo';
  return null;
}

/** Text all the names start with, cut back to the last separator ("LinnDrum ", "LD_"). */
export function sharedPrefix(names) {
  if (names.length < 2) return '';
  const lower = names.map((n) => n.toLowerCase());
  let prefix = lower[0];
  for (const n of lower) while (!n.startsWith(prefix)) prefix = prefix.slice(0, -1);
  const cut = Math.max(prefix.lastIndexOf(' '), prefix.lastIndexOf('_'), prefix.lastIndexOf('-'));
  return cut >= 0 ? prefix.slice(0, cut + 1) : '';
}

/**
 * Assign files to rows: by name first, then any unrecognised files fill empty
 * rows in order. Returns {assigned: [[slot, file]], leftover: [file]}.
 */
export function assignSamples(files, filled = new Set(), voices = VOICES_USER) {
  const taken = new Set();
  const assigned = [];
  const unmatched = [];
  const prefix = sharedPrefix(files.map((f) => f.name));
  for (const file of files) {
    const slot = matchSlot(file.name, prefix);
    if (slot && !taken.has(slot)) { taken.add(slot); assigned.push([slot, file]); } else unmatched.push(file);
  }
  const leftover = [];
  for (const file of unmatched) {
    const free = voices.find(({ id }) => !taken.has(id) && !filled.has(id));
    if (free) { taken.add(free.id); assigned.push([free.id, file]); } else leftover.push(file);
  }
  return { assigned, leftover };
}

/**
 * Move a preset onto another kit's rows. Several source rows may land on one
 * target row; they are merged step by step, keeping the stronger hit.
 */
export function mapPreset(preset, idMap) {
  const out = {};
  const rank = { '.': 0, x: 1, X: 2 };
  for (const [id, row] of Object.entries(preset)) {
    const to = idMap[id];
    if (!to) continue;
    const prev = out[to] || '.'.repeat(row.length);
    out[to] = [...row].map((c, i) => (rank[c] >= rank[prev[i]] ? c : prev[i])).join('');
  }
  return out;
}

// The Latin rhythms on the 808, the way the original did Latin: its own congas,
// claves and maracas. Bongos go to the higher congas; the guiro to the maracas.
const LATIN_TO_808 = {
  kick: 'bd808', congaLo: 'lc808', congaHi: 'mc808', bongoLo: 'mc808', bongoHi: 'hc808',
  claves: 'cl808', cowbell: 'cb808', maracas: 'ma808', guiro: 'ma808',
};
const LATIN_ON_808 = Object.fromEntries(
  Object.entries(DRUM_PRESETS).map(([name, preset]) => [name, mapPreset(preset, LATIN_TO_808)]),
);

/** Menu order (a numeric key like '808' would otherwise sort first). */
export const KIT_ORDER = ['latin', '808', 'linn', 'user'];

export const KITS = {
  latin: { label: 'Latin', voices: VOICES, presets: DRUM_PRESETS },
  808: { label: '808-style', voices: VOICES_808, presets: { ...PRESETS_808, ...LATIN_ON_808 } },
  linn: { label: 'Linn-style', voices: VOICES_LINN, presets: PRESETS_LINN },
  user: { label: 'Your samples', voices: VOICES_USER, presets: PRESETS_USER },
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

/** Playback-rate multiplier for a tuning in semitones (clamped to ±24). */
export function tuneRate(semitones) {
  return Math.pow(2, Math.min(24, Math.max(-24, semitones || 0)) / 12);
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

  play(id, time, gain = 1, tune = 0) {
    const t = Math.max(time, this.ctx.currentTime);
    if (id.startsWith('u_')) return this.playSample(id, t, gain, tune);
    const fn = this[id];
    if (typeof fn === 'function') fn.call(this, t, gain);
  }

  /** Load (or clear, with null) the AudioBuffer for a "Your samples" row. */
  setSample(id, buffer) {
    this.samples ??= {};
    if (buffer) this.samples[id] = buffer;
    else delete this.samples[id];
  }

  /** `tune` in semitones: like the hardware's tuning knobs it changes playback
   *  speed, so tuning down also lengthens and darkens the sound. */
  playSample(id, t, gain, tune = 0) {
    const buffer = this.samples?.[id];
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = tuneRate(tune);
    const g = this.ctx.createGain();
    g.gain.value = gain; // accents 1, normal hits 0.65
    // Hats share a choke group, as on the hardware: a closed hat cuts an open one.
    const hat = id === 'u_chh' || id === 'u_ohh';
    src.connect(g).connect(hat ? this.hatBus(t, 'user', id === 'u_ohh') : this.out);
    src.start(t);
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
  cl808(t, g) { this.tone(t, g * 0.45, 2500, 0.03, 1, 'sine'); }
  ma808(t, g) { this.noiseHit(t, g * 0.35, 0.035, 'highpass', 7500); }
  // 808 congas: tuned sines with a slight drop, shorter than the toms.
  lc808(t, g) { this.tone(t, g * 0.55, 165, 0.2, 1.15, 'sine', 0.03); }
  mc808(t, g) { this.tone(t, g * 0.5, 250, 0.17, 1.15, 'sine', 0.03); }
  hc808(t, g) { this.tone(t, g * 0.45, 370, 0.14, 1.15, 'sine', 0.03); }
  lt808(t, g) { this.tone(t, g * 0.7, 82, 0.38, 1.25, 'sine', 0.08); }
  ht808(t, g) { this.tone(t, g * 0.6, 140, 0.28, 1.25, 'sine', 0.07); }
  cb808(t, g) { this.cowbell(t, g); }
  // Closed hat: the same source and filters as the open hat, just short.
  ch808(t, g) {
    this.metalSource(t, t + 0.08)
      .connect(this.filter('bandpass', 9000, 0.8))
      .connect(this.filter('highpass', 5600))
      .connect(this.filter('highpass', 5600))
      .connect(this.env(t, g * 1.2, 0.06, this.hatBus(t, '808', false)));
  }
  /** The 808's metal source: six square oscillators at its original frequencies. */
  metalSource(t, stop) {
    const sum = this.ctx.createGain();
    sum.gain.value = 1 / 3;
    for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(sum);
      o.start(t);
      o.stop(stop);
    }
    return sum;
  }

  filter(type, freq, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  // Open hat, matched to a reference 808 recording: energy centred ~7–9 kHz with
  // little below 5 kHz; the level falls roughly linearly and is gone by ~0.7 s.
  oh808(t, g) {
    const len = 0.7;
    const src = this.metalSource(t, t + len + 0.05);
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    // Level curve traced from the reference (dB below the hit: −4 at 0.1 s,
    // −6 at 0.2, −10 at 0.4, −18 at 0.6, then closing by 0.7 s).
    for (const [dt, a] of [[0.002, 1], [0.1, 0.63], [0.2, 0.5], [0.4, 0.32], [0.6, 0.126], [0.66, 0.06], [len, 0]]) {
      amp.gain.linearRampToValueAtTime(g * 0.8 * a, t + dt);
    }
    src
      .connect(this.filter('bandpass', 9000, 0.8))
      .connect(this.filter('highpass', 5600))
      .connect(this.filter('highpass', 5600)) // two stages: almost nothing below 5 kHz
      .connect(amp);
    amp.connect(this.hatBus(t, '808', true));
  }

  // Cymbal, matched to a reference 808 recording: a bright 8–20 kHz splash that
  // drops ~15 dB in 0.1 s, over a darker 2–5 kHz ring ~22 dB down that fades only
  // ~10 dB per second, so the tail gets darker as it goes (−60 dB at ~3.2 s).
  cy808(t, g) {
    const len = 3.6;
    const src = this.metalSource(t, t + len);
    const decay = (peak, tau) => {
      const a = this.ctx.createGain();
      a.gain.setValueAtTime(0, t);
      a.gain.linearRampToValueAtTime(peak, t + 0.002);
      a.gain.setTargetAtTime(0, t + 0.002, tau);
      a.connect(this.out);
      return a;
    };
    // Splash: the first ~30 ms are brightest around 11–15 kHz.
    src.connect(this.filter('bandpass', 12000, 0.7)).connect(this.filter('highpass', 8000)).connect(decay(g * 1.1, 0.035));
    // Body: 5–12 kHz shimmer that carries the first second.
    const body = src
      .connect(this.filter('bandpass', 7800, 0.8))
      .connect(this.filter('highpass', 5000))
      .connect(this.filter('highpass', 5000));
    body.connect(decay(g * 0.2, 0.06));
    body.connect(decay(g * 0.11, 0.46));
    // Sizzle: a quiet 12 kHz+ layer that lasts, keeping the tail bright on top.
    src.connect(this.filter('highpass', 11000)).connect(this.filter('highpass', 11000)).connect(decay(g * 0.12, 0.45));
    // Dark ring: 2–5 kHz, ~10 dB per second, so the tail darkens as it fades.
    src
      .connect(this.filter('bandpass', 3800, 1.2))
      .connect(this.filter('highpass', 2200))
      .connect(this.filter('highpass', 2200)) // keep the oscillators' low notes out of the ring
      .connect(decay(g * 0.027, 0.85));
  }

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

// ------------------------------------------------------------------ variation
// Trig conditions (per step), per-row lengths (polymeter) and fills.

export const CONDITIONS = {
  '': 'Always',
  '1:2': '1:2', '2:2': '2:2',
  '1:3': '1:3', '2:3': '2:3', '3:3': '3:3',
  '1:4': '1:4', '2:4': '2:4', '3:4': '3:4', '4:4': '4:4',
  '1:8': '1:8', '8:8': '8:8',
  fill: 'Fill', '!fill': 'Not fill',
  first: 'First', '!first': 'Not first',
  '25%': '25%', '50%': '50%', '75%': '75%',
};
export const FILL_EVERY = [0, 2, 4, 8];

/**
 * Whether a conditioned hit plays. `cycle` is how many times this row has looped
 * (0 on the first pass since Play), so "A:B" plays on the A-th of every B loops.
 */
export function condPasses(cond, { cycle = 0, fill = false, rng = Math.random } = {}) {
  if (!cond) return true;
  if (cond === 'fill') return fill;
  if (cond === '!fill') return !fill;
  if (cond === 'first') return cycle === 0;
  if (cond === '!first') return cycle > 0;
  const pct = /^(\d+)%$/.exec(cond);
  if (pct) return rng() * 100 < Number(pct[1]);
  const ab = /^(\d+):(\d+)$/.exec(cond);
  if (ab) return cycle % Number(ab[2]) === Number(ab[1]) - 1;
  return true;
}

/** Is the bar containing `step` (16ths since Play) a fill bar, for fills every `every` bars? */
export function isFillBar(step, every) {
  return every > 0 && Math.floor(step / DRUM_STEPS) % every === every - 1;
}

/**
 * Hits for global step `step`: each row loops over its own length (polymeter) and
 * each hit checks its condition. Returns [{id, gain}].
 */
export function drumHits(rows, step, { conds = {}, lens = {}, muted = {}, voices = VOICES, fill = false, rng = Math.random } = {}) {
  const out = [];
  for (const { id } of voices) {
    if (muted[id] || !rows[id]) continue;
    const len = Math.max(1, Math.min(DRUM_STEPS, lens[id] || DRUM_STEPS));
    const pos = step % len;
    const v = rows[id][pos];
    if (v > 0 && condPasses(conds[id]?.[pos] || '', { cycle: Math.floor(step / len), fill, rng })) out.push({ id, gain: v });
  }
  return out;
}

/** Which row ids make a good fill for a kit: snares, toms, congas/bongos. */
function fillLanes(voices) {
  const ids = voices.map((v) => v.id);
  const pick = (...res) => ids.filter((id) => res.some((re) => re.test(id)));
  return {
    snare: pick(/^sd/, /^u_snare$/, /^cp/)[0] || pick(/conga ?hi|congaHi|bongoHi|hc808/i)[0],
    low: pick(/^lt808$/, /^tomLinn$/, /^u_tomlo$/, /^congaLo$/, /^lc808$/)[0],
    high: pick(/^ht808$/, /^u_tomhi$/, /^bongoHi$/, /^mc808$/, /^congaHi$/)[0],
  };
}

/**
 * Add a fill on the last four 16ths, played only on fill bars: a snare build
 * with toms. Only empty cells are used, so the pattern itself is untouched.
 */
export function addFill(rows, conds, voices) {
  const { snare, low, high } = fillLanes(voices);
  const plan = [[snare, 12, 0.65], [high, 13, 0.65], [snare, 14, 0.65], [low, 14, 1], [snare, 15, 1], [low, 15, 0.65]];
  let added = 0;
  for (const [id, step, v] of plan) {
    if (!id || !rows[id] || rows[id][step] > 0) continue;
    rows[id][step] = v;
    conds[id] ??= new Array(DRUM_STEPS).fill('');
    conds[id][step] = 'fill';
    added++;
  }
  return added;
}
