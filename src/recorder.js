// Recording samples: from this app's own output (resampling), a microphone or line
// input, or another tab / the system (screen-share audio). The audio thread hands over
// blocks of raw samples with the frame each starts at, so a take can be cut to exact
// times (a bar-synced loop is exactly its bars long). Pure helpers here are unit-tested.

/** Source code of the audio-thread recorder: posts blocks of ~4096 frames with their start frame. */
export const RECORDER_WORKLET = `
class TakeRecorder extends AudioWorkletProcessor {
  constructor() { super(); this.buf = null; this.n = 0; this.start = 0; }
  process(inputs) {
    const input = inputs[0];
    if (input && input.length) {
      const len = input[0].length;
      if (!this.buf) { this.buf = [new Float32Array(4096), new Float32Array(4096)]; this.n = 0; this.start = currentFrame; }
      const l = input[0];
      const r = input[1] || input[0];
      this.buf[0].set(l, this.n);
      this.buf[1].set(r, this.n);
      this.n += len;
      if (this.n + len > 4096) {
        this.port.postMessage({ frame: this.start, ch: [this.buf[0].slice(0, this.n), this.buf[1].slice(0, this.n)] });
        this.buf = null;
      }
    }
    return true;
  }
}
registerProcessor('take-recorder', TakeRecorder);
`;

/** The span [from, to) of frames out of recorded blocks ({frame, ch: [Float32Array…]}), as channels. */
export function framesBetween(blocks, from, to) {
  const len = Math.max(0, Math.round(to - from));
  const chans = blocks[0]?.ch.length || 2;
  const out = Array.from({ length: chans }, () => new Float32Array(len));
  for (const b of blocks) {
    const n = b.ch[0].length;
    const a = Math.max(from, b.frame);
    const z = Math.min(to, b.frame + n);
    if (z <= a) continue;
    for (let c = 0; c < chans; c++) out[c].set(b.ch[c].subarray(a - b.frame, z - b.frame), a - from);
  }
  return out;
}

/**
 * Where the sound is: [start, end) frames with the quiet before and after taken off (below
 * `thresholdDb`), keeping `padMs` before the first sound so its attack stays whole.
 */
export function soundSpan(chans, sampleRate, { thresholdDb = -50, padMs = 5 } = {}) {
  const thr = 10 ** (thresholdDb / 20);
  const len = chans[0].length;
  const loud = (i) => chans.some((c) => Math.abs(c[i]) > thr);
  let s = 0;
  while (s < len && !loud(s)) s++;
  if (s >= len) return [0, 0];
  let e = len;
  while (e > s && !loud(e - 1)) e--;
  const pad = Math.round((padMs / 1000) * sampleRate);
  return [Math.max(0, s - pad), Math.min(len, e + pad * 4)];
}

/** A WAV file (16-bit PCM) of some channels. */
export function encodeWav(chans, sampleRate) {
  const n = chans[0].length;
  const ch = chans.length;
  const buf = new ArrayBuffer(44 + n * ch * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const x = Math.max(-1, Math.min(1, chans[c][i]));
      v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true);
      o += 2;
    }
  }
  return buf;
}

/** The loudest sample of some channels (0–1). */
export function peakOf(chans) {
  let m = 0;
  for (const c of chans) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > m) m = a; }
  return m;
}
